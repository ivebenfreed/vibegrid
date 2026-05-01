/**
 * useRelationshipTargetCollections — Scoped by-ID name fetch for relationship cells
 *
 * The static `badge-list` renderer (`slots/renderers/badge-list.ts`) needs
 * (id → display name) for every relationship target ID it renders. Earlier
 * attempts populated names by subscribing the entire target collection via
 * `useEntityCollection` / `useLiveQuery`, which triggers the generic
 * collection bootstrap (up to 50,000 records — see
 * `entity-collections.ts:ENTITY_COLLECTION_MAX_INITIAL_RECORDS`). On
 * cross-entity grids like `/entities/Project` referencing User AND Company
 * AND others, the bootstrap OOMs the tab.
 *
 * GH#2786 follow-up: this bridge fetches **only the IDs that actually appear
 * in the current rows** via `data.query` with `whereAst.in`, then writes
 * them into a tiny per-(orgId, entityType) name cache
 * (`utils/relationshipNameCache.ts`). The badge-list renderer reads from
 * that cache as a fallback when the entity collection lookup fails. We
 * NEVER call the entity collection factory — no SQLite warmup, no JS-heap
 * blowout.
 *
 * The fetch is debounced so multiple cell render passes coalesce, and is
 * driven by a MobX reaction on `tableCoreStore.processedRows` so it re-runs
 * when filtering/sorting/pagination changes the visible row set.
 *
 * Member / PlatformUser / PlatformOrganization remain on their existing
 * factory paths (those are naturally org-scoped and small).
 */

import { useEffect, useMemo } from 'react'
import { reaction } from 'mobx'
import { useOrganization } from '@/app/stores'
import { getLogger } from '@/shared/lib/logging'
import type { TableCoreStore } from '../stores/TableCoreStore'
import type { Column } from '../types'
import {
  collectTargetIds,
  fetchAndCacheTargets,
  SYSTEM_ENTITY_EXCLUSIONS,
} from './scopedRelationshipFetch'

const logger = getLogger(['vibegrid', 'hooks', 'useRelationshipTargetCollections'])

const FETCH_DEBOUNCE_MS = 100

/**
 * Extract unique `relationshipTargetEntity` names from the current column
 * set. System exclusions are skipped (they have separate factory paths).
 */
function getTargetEntityTypes(columns: Column[]): string[] {
  const targets = new Set<string>()

  for (const col of columns) {
    const target = (col as { relationshipTargetEntity?: string | null }).relationshipTargetEntity
    if (typeof target !== 'string' || target.length === 0) continue
    if (SYSTEM_ENTITY_EXCLUSIONS.has(target)) continue
    targets.add(target)
  }

  return Array.from(targets).sort()
}

/**
 * Hook that drives the scoped by-ID name fetch for every relationship target
 * entity referenced by the supplied tableCoreStore's columns. Returns `null`
 * — there are no JSX bridges to render. Side-effect only.
 *
 * Returning a ReactNode (rather than `void`) preserves the existing call
 * site shape in `VibeGrid.tsx` so the diff stays minimal.
 */
export function useRelationshipTargetCollections(tableCoreStore: TableCoreStore | null): null {
  const orgStore = useOrganization()
  const orgId = orgStore.activeOrganizationId

  const columns = tableCoreStore?.columns ?? []
  const targetEntityTypes = useMemo(() => getTargetEntityTypes(columns), [columns])

  // Drive the by-ID fetch off a MobX reaction on processedRows. We debounce
  // so a flurry of recomputes (sort + filter + scroll) coalesces into one
  // batch fetch.
  useEffect(() => {
    if (!tableCoreStore || !orgId || targetEntityTypes.length === 0) return

    let timer: ReturnType<typeof setTimeout> | null = null

    const runFetch = () => {
      const rows = tableCoreStore.processedRows
      if (!rows || rows.length === 0) return
      const cols = tableCoreStore.columns ?? []
      const targets = collectTargetIds(
        rows as Array<{ type?: string; data?: Record<string, unknown> }>,
        cols,
      )
      if (targets.size === 0) return

      // System exclusions are stripped during column scan, but defense-in-depth
      // here too in case future callers rely on direct collectTargetIds shape.
      const filtered = new Map<string, Set<string>>()
      for (const [entityType, ids] of targets) {
        if (SYSTEM_ENTITY_EXCLUSIONS.has(entityType)) continue
        filtered.set(entityType, ids)
      }
      if (filtered.size === 0) return

      void fetchAndCacheTargets({
        targets: filtered,
        orgId,
      })
        .then((result) => {
          if (result.upserted > 0) {
            logger.debug('Scoped relationship name fetch upserted records', {
              upserted: result.upserted,
              perTarget: result.perTarget,
            })
            tableCoreStore.incrementConfigVersion()
          }
        })
        .catch((err) => {
          logger.warn('Scoped relationship name fetch errored', {
            error: err instanceof Error ? err.message : String(err),
          })
        })
    }

    const schedule = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(runFetch, FETCH_DEBOUNCE_MS)
    }

    // Trigger once on mount (in case rows were already loaded) and on every
    // change to the row set.
    schedule()

    const dispose = reaction(
      () => {
        // Track length only (not row-by-row identity); cheap, captures the
        // most common cause of new IDs entering the visible set: filter,
        // sort, page change, or initial load completion.
        const rows = tableCoreStore.processedRows
        return rows ? rows.length : 0
      },
      () => schedule(),
      { fireImmediately: false },
    )

    return () => {
      if (timer) clearTimeout(timer)
      dispose()
    }
  }, [tableCoreStore, orgId, targetEntityTypes])

  useEffect(() => {
    if (targetEntityTypes.length > 0) {
      logger.info('Relationship target name fetcher active', {
        targetEntityTypes,
        columnCount: columns.length,
      })
    }
  }, [targetEntityTypes, columns.length])

  return null
}
