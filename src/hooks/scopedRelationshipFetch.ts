/**
 * Scoped relationship target fetch
 *
 * Batch-fetches relationship target entities by ID and writes the resolved
 * (id → display name) pairs into the scoped `relationshipNameCache` so the
 * `badge-list` static renderer (`slots/renderers/badge-list.ts`) can resolve
 * IDs to display names without subscribing the full target collection.
 *
 * GH#2786 follow-up: replaces the prior "subscribe-all" bridge that triggered
 * full collection bootstraps via `useLiveQuery`. On cross-entity grids
 * (e.g. `/entities/RFI` referencing Project @ 3k + Drawings @ 41k + User @ N),
 * the subscribe-all path tripped the 50k bootstrap cap on every cross-reference
 * and OOM'd the tab. This util fetches *only* the IDs that actually appear
 * in the visible cells and stores names in a tiny per-(org, type) Map —
 * never touches the entity collection factory, never warms SQLite.
 *
 * Public API:
 *   - `collectTargetIds(rows, columns)` — pure: walk current rows + relationship
 *     columns, return a `Map<targetEntityType, Set<id>>`.
 *   - `fetchAndCacheTargets({ targets, orgId })` — batched `data.query`
 *     calls (≤500 IDs per request) that store names via `setCachedNames`.
 *     Returns the count of newly-cached records per target type.
 */

import { orpcClient } from '@/shared/data/orpc/client'
import { getLogger } from '@/shared/lib/logging'
import type { Column } from '../types'
import { getCachedName, setCachedNames } from '../utils/relationshipNameCache'

const logger = getLogger(['vibegrid', 'hooks', 'scopedRelationshipFetch'])

/**
 * System entities that have separate factory paths and are intentionally
 * excluded from the by-ID batch fetcher. The Member collection (org members,
 * naturally bounded) is handled via existing factory paths and looked up
 * directly through the collection.
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
  /** Active organization ID — required to scope the name cache. */
  orgId: string
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
 * `data.query` with `whereAst.in`. Successful pages are stored in the
 * scoped name cache via `setCachedNames`.
 *
 * Network failures per target are logged and isolated — one failure does
 * not abort other targets. Empty server responses (rare-or-deleted records)
 * are tolerated: `setCachedNames([])` returns 0.
 */
export async function fetchAndCacheTargets(args: FetchAndCacheArgs): Promise<FetchAndCacheResult> {
  const { targets, orgId } = args
  const perTarget: FetchAndCacheResult['perTarget'] = []
  let totalUpserted = 0

  for (const [entityType, idSet] of targets.entries()) {
    if (idSet.size === 0) continue

    const missingIds: string[] = []
    for (const id of idSet) {
      if (getCachedName(orgId, entityType, id)) continue
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
          // Server returns full records; we extract only display name fields.
          limit: batch.length,
        })

        if (!response.success) {
          logger.warn('Scoped relationship fetch failed (success=false)', {
            entityType,
            batchSize: batch.length,
          })
          continue
        }

        const records = (response.data ?? []) as Array<
          Record<string, unknown> & { id?: string }
        >
        const valid: Array<{
          id: string
          name?: string | null
          title?: string | null
          display_name?: string | null
        }> = []
        for (const rec of records) {
          if (rec && typeof rec === 'object' && typeof rec.id === 'string') {
            valid.push(rec as { id: string; name?: string; title?: string; display_name?: string })
          }
        }
        upsertedForTarget += setCachedNames(orgId, entityType, valid)
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
