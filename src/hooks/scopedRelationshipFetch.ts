/**
 * Scoped relationship target fetch
 *
 * Batch-fetches relationship target entities by ID and writes the results
 * directly into the target entity's TanStack DB collection so the
 * `badge-list` static renderer (`slots/renderers/badge-list.ts`) can resolve
 * IDs to display names via `getExistingEntityCollection().get(id)`.
 *
 * GH#2786 follow-up: replaces the prior "subscribe-all" bridge that triggered
 * full collection bootstraps via `useLiveQuery`. On cross-entity grids
 * (e.g. `/entities/RFI` referencing Project @ 3k + Drawings @ 41k), the
 * subscribe-all path tripped the 50k bootstrap cap on every cross-reference
 * and OOM'd the tab. This util fetches *only* the IDs that actually appear
 * in the visible cells.
 *
 * Public API:
 *   - `collectTargetIds(rows, columns)` — pure: walk current rows + relationship
 *     columns, return a Map<targetEntityType, Set<id>>.
 *   - `fetchAndCacheTargets({ targets, orgId, knownIds })` — batched data.query
 *     calls (≤500 IDs per request) that upsert into the target collection's
 *     `utils.writeBatch / writeUpsert`. Returns the count of newly-cached
 *     records per target type.
 */

import type { Collection } from '@tanstack/db'
import { orpcClient } from '@/shared/data/orpc/client'
import { getExistingEntityCollection } from '@/shared/data/db/collections/registry'
import { getLogger } from '@/shared/lib/logging'
import type { Column } from '../types'

const logger = getLogger(['vibegrid', 'hooks', 'scopedRelationshipFetch'])

/**
 * System entities that have separate factory paths and are intentionally
 * excluded from the by-ID batch fetcher. The Member collection (org members,
 * naturally bounded) is handled via a dedicated subscription in the bridge.
 */
export const SYSTEM_ENTITY_EXCLUSIONS = new Set(['Member', 'PlatformUser', 'PlatformOrganization'])

/** Maximum number of IDs to send in a single `data.query` request. */
export const MAX_IDS_PER_BATCH = 500

interface RowLike {
  type?: string
  data?: Record<string, unknown>
}

interface RelationshipColumn extends Column {
  relationshipTargetEntity?: string | null
}

/**
 * Walk the supplied rows + columns and bucket every relationship-target ID
 * encountered into a `Map<targetEntityType, Set<id>>`. System entity types
 * (see `SYSTEM_ENTITY_EXCLUSIONS`) are skipped.
 */
export function collectTargetIds(rows: RowLike[], columns: Column[]): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>()

  const relationshipCols: Array<{ field: string; target: string }> = []
  for (const col of columns) {
    const target = (col as RelationshipColumn).relationshipTargetEntity
    if (typeof target !== 'string' || target.length === 0) continue
    if (SYSTEM_ENTITY_EXCLUSIONS.has(target)) continue
    if (typeof col.field !== 'string' || col.field.length === 0) continue
    relationshipCols.push({ field: col.field, target })
  }

  if (relationshipCols.length === 0) return out

  for (const row of rows) {
    if (row.type !== 'data') continue
    const record = row.data
    if (!record || typeof record !== 'object') continue

    for (const { field, target } of relationshipCols) {
      const value = (record as Record<string, unknown>)[field]
      if (!Array.isArray(value)) continue
      let bucket = out.get(target)
      if (!bucket) {
        bucket = new Set<string>()
        out.set(target, bucket)
      }
      for (const v of value) {
        if (typeof v === 'string' && v.length > 0) {
          bucket.add(v)
        } else if (v && typeof v === 'object') {
          // Tolerate object-shaped values like { id }
          const id = (v as { id?: unknown }).id
          if (typeof id === 'string' && id.length > 0) bucket.add(id)
        }
      }
    }
  }

  return out
}

interface FetchAndCacheArgs {
  /** Per-entity-type set of IDs collected from the current rows. */
  targets: Map<string, Set<string>>
  /** Active organization ID — required to look up the singleton collection. */
  orgId: string
  /**
   * Callback that returns the collection for a given target entity type.
   * Caller controls registration so the collection's hooks remain in React land.
   * If the callback returns `null`, the target is skipped.
   */
  getCollection: (entityType: string) => Collection<any, any, any, any, any> | null
}

interface FetchAndCacheResult {
  /** Total number of new IDs upserted across all targets. */
  upserted: number
  /** Per-target detail (for diagnostics). */
  perTarget: Array<{ entityType: string; requested: number; upserted: number }>
}

/**
 * For each entry in `targets`, drop IDs that are already cached, then page
 * through the remainder in batches of `MAX_IDS_PER_BATCH` calling
 * `data.query` with `whereAst.in`. Successful pages are written into the
 * matching collection via `utils.writeBatch / writeUpsert`.
 *
 * Network failures per target are logged and isolated — one failure does
 * not abort other targets.
 */
export async function fetchAndCacheTargets(args: FetchAndCacheArgs): Promise<FetchAndCacheResult> {
  const { targets, orgId, getCollection } = args
  const perTarget: FetchAndCacheResult['perTarget'] = []
  let totalUpserted = 0

  for (const [entityType, idSet] of targets.entries()) {
    if (idSet.size === 0) continue

    const collection = getCollection(entityType)
    if (!collection) {
      logger.debug('Skipping fetchAndCacheTargets: no collection ref', { entityType })
      continue
    }

    // Resolve the cache view through the registry. This is the same lookup
    // the badge-list renderer performs at render time, so anything already
    // present is a guaranteed hit on next paint.
    const existingColl = getExistingEntityCollection(entityType, orgId) as
      | { get?: (id: string) => unknown }
      | null

    const missingIds: string[] = []
    for (const id of idSet) {
      if (existingColl?.get?.(id)) continue
      missingIds.push(id)
    }

    if (missingIds.length === 0) {
      perTarget.push({ entityType, requested: idSet.size, upserted: 0 })
      continue
    }

    let upsertedForTarget = 0
    for (let i = 0; i < missingIds.length; i += MAX_IDS_PER_BATCH) {
      const batch = missingIds.slice(i, i + MAX_IDS_PER_BATCH)
      try {
        const response = await orpcClient.dataforge.data.query({
          entityName: entityType,
          whereAst: { op: 'in', field: 'id', value: batch },
          // The batch-fetch path requests only by ID, but we can't restrict
          // the column list via this client surface — the worker returns full
          // records. That's fine: writes go straight into the collection,
          // and the badge renderer reads only `name` / `display_name`.
          limit: batch.length,
        })

        if (!response.success) {
          logger.warn('Scoped relationship fetch failed (success=false)', {
            entityType,
            batchSize: batch.length,
          })
          continue
        }

        const records = (response.data ?? []) as Array<Record<string, unknown> & { id?: string }>
        const utils = (collection as { utils?: { writeBatch?: (fn: () => void) => void; writeUpsert?: (rec: any) => void } }).utils
        if (!utils?.writeBatch || !utils.writeUpsert) {
          logger.warn('Collection has no writeBatch/writeUpsert utils', { entityType })
          continue
        }

        utils.writeBatch(() => {
          for (const rec of records) {
            if (rec && typeof rec === 'object' && typeof rec.id === 'string') {
              utils.writeUpsert!(rec)
              upsertedForTarget += 1
            }
          }
        })
      } catch (err) {
        logger.warn('Scoped relationship fetch threw', {
          entityType,
          batchSize: batch.length,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    totalUpserted += upsertedForTarget
    perTarget.push({ entityType, requested: idSet.size, upserted: upsertedForTarget })
  }

  return { upserted: totalUpserted, perTarget }
}
