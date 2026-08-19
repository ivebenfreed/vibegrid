/**
 * Server-only grid bridge (GH#3019 B8 migration; trimmed to server-only in
 * GH#3283 P1).
 *
 * VibeGrid sources rows through the unified query layer's `subscribe()`
 * orchestrator (`apps/web/src/shared/data/query/unified/query.ts`), which as
 * of GH#3283 P1 dispatches unconditionally to the server adapter (oRPC
 * `/dataforge/data/query`) — the local adapter (substrate
 * `client.maintainQuery`), its 3s leader-fallback race, and the per-query
 * delta channel have all been deleted.
 *
 * Previously this file contained two paths that both wrote rows into
 * `tableCoreStore.setSparseRows`: an inline cold-start "bypass writer" effect
 * (the `cold_start_bypass.*` sentinel chain) and a substrate-autorun effect
 * that constructed `new Query(...)` directly. Both were deleted in GH#3019
 * B8 — the unified layer subsumes both code paths. The cold-start sentinels
 * now live only as `SubscriptionEvent` lifecycle events emitted by
 * `query.subscribe`.
 *
 * The hook still owns the UX bits that the dispatcher does NOT know about:
 *   - server-authoritative `serverTotalRows` prefetch (so the body container
 *     is full-height from t=0 instead of growing as the first page loads)
 *   - `hasActiveFilter` tracking (so filtered-to-zero doesn't shimmer
 *     forever against the unfiltered floor)
 *   - mid-edit guard / clobber-then-shimmer on sort/filter changes
 *   - editing-store conflict dedup via `applyQueryDeltaDedup`
 *   - debounced viewport→cursor reaction with containment dedup
 *
 * Realtime (GH#3283 P1 B2): with the substrate delta channel gone, this
 * hook's `handle.patch({})` refetch is now triggered by the event bus rather
 * than a per-query delta subscription — see the `table_change` wiring in
 * `snapshot-wiring.ts`.
 *
 * Spec reference:
 *   - 3019-substrate-unified-query-layer.md §B8 (bypass-removal)
 *   - 2804-smart-100k-row-system.md §B9 (viewport→cursor patch wire)
 *   - 3119-substrate-sqlite-system-simplification-s.md §B12
 *     (god-file-modularization-gate; PR 4/4 mechanical split)
 *   - 3283-remove-local-first-substrate.md P1 (server-only trim + rename)
 */

import { useEffect, useRef, useState } from 'react'
import { orpcClient } from '@/shared/data/orpc/client'
import type { ViewportStore } from '@/systems/vibegrid/stores/ViewportStore'
import type { TableCoreStore } from '@/systems/vibegrid/stores/TableCoreStore'
import type { VisualStateStore } from '@/systems/vibegrid/stores/VisualStateStore'
import type { EditingStore } from '@/systems/vibegrid/stores/EditingStore'
import { getLogger } from '@/shared/lib/logging'
import {
  convertVibeGridFilterToFilterExpression,
  convertGlobalSearchToFilterExpression,
  composeFiltersAnd,
  collectRelationshipFields,
} from '../vibegrid-sort-filter-bridge'
import type { SubscriptionHandle } from '../unified/query'
import { setupViewportCursor } from './viewport-cursor'
import {
  collectSearchableFields,
  setupFilterSortReaction,
} from './filter-sort-reaction'
import {
  setupSnapshotWiring,
  type ServerGridRowsResult,
} from './snapshot-wiring'

// Substrate chain logger. Browser console:
//   __BASEPLANE_LOGGER__.setLevel('debug', ['substrate'])
const logger = getLogger(['substrate', 'grid-bridge'])

/**
 * Subscribe to the unified query layer for the given entity, returning rows
 * in VibeGrid's expected shape via `tableCoreStore.setSparseRows()` and the
 * React `{rows, count, isReady, bounded, isComplete, source}` state.
 */
export function useServerGridRows(
  entityType: string,
  orgId: string | null,
  // When provided, the hook publishes the snapshot's `total` to
  // `viewportStore.serverTotalRows` so VibeGrid's totalRows-derived UI
  // reflects the full server dataset rather than the windowed row count.
  // Reset to `null` on unmount so subsequent non-substrate grids fall back
  // to the existing rowOffsets/totalContentHeight derivation.
  viewportStore?: ViewportStore | null,
  // The hook writes rows directly via `setSparseRows` instead of returning
  // them through the React state path.
  tableCoreStore?: TableCoreStore | null,
  // When provided, the hook reacts to VibeGrid's sort/filter changes (via
  // `sortBy` / `filters` / `globalSearchText`) and pushes them through
  // `handle.patch` for SharedWorker-side SQL pushdown.
  visualStateStore?: VisualStateStore | null,
  // GH#2806 P5: when supplied, the hook runs the queryDelta dedup module
  // before applying setSparseRows so a server echo of an optimistic write
  // doesn't cause a redundant dataVersion bump.
  editingStore?: EditingStore | null,
): ServerGridRowsResult {
  const [state, setState] = useState<ServerGridRowsResult>({
    rows: [],
    count: 0,
    isReady: false,
    bounded: false,
    isComplete: false,
    source: null,
  })

  // The most-recently-requested cursor must be read by the snapshot handler
  // using the latest committed value, not a closed-over `let`. A `useRef`
  // gives us a stable mutation point whose `.current` reads always reflect
  // the latest write, even when the writer (debounce setTimeout) and reader
  // (snapshot handler triggered by patch) interleave under load.
  const lastRequestedCursorRef = useRef<{ start: number; size: number } | null>(null)

  // GH#3112 — track the comma-joined row IDs delivered by the most recent
  // applied snapshot. The editing-store dedup classifies a delivery as a
  // no-op when every delivered row already matches `rawRowsById`, but that
  // check ignores rows REMOVED from the window between deliveries (delete,
  // optimistic placeholder swap). Comparing IDs catches removals and
  // net-new inserts; we always apply when the id set changed.
  const lastAppliedRowIdsKeyRef = useRef<string>('')

  // Effect deps intentionally narrow: re-subscribe only on entity or org
  // change. The other store refs (viewportStore, tableCoreStore,
  // visualStateStore, editingStore) are stable singletons for the grid's
  // lifetime — listing them would needlessly re-mount the subscription and
  // reset all loaded rows on any store identity change.
  // biome-ignore lint/correctness/useExhaustiveDependencies: stable singletons by design
  useEffect(() => {
    if (!orgId || !entityType) return

    let cancelled = false
    let handle: SubscriptionHandle | null = null
    let disposeCursorReaction: (() => void) | null = null
    let disposeSortFilterReaction: (() => void) | null = null
    let disposeEventBusRefetch: (() => void) | null = null
    let initTimer: ReturnType<typeof setTimeout> | null = null

    // PRESERVED — server-authoritative serverTotalRows prefetch (spec B8
    // preserved-behavior list). The substrate's local SQLite COUNT(*) lags
    // the server while warm seed paginates; without the prefetch the body
    // container would size to the local count × ROW_HEIGHT, producing the
    // "stops at row N" UX where the user hits a hard scroll wall partway
    // through the dataset. Fire-and-forget one-shot count against the
    // server before constructing the subscription; raise the floor on each
    // snapshot via Math.max.
    let serverCountFloor = 0

    // PRESERVED — hasActiveFilter tracking (spec B8 preserved-behavior list).
    // `serverTotalRows` is an only-grow floor (Math.max of unfiltered count
    // prefetch and each delivered total). That's correct for warm-up — local
    // count lags the server while warm seed paginates. It is wrong once a
    // user filter or global search narrows the result set below the floor:
    // setSparseRows is called with the unfiltered total, processedRows is a
    // sparse array of length-of-unfiltered-dataset with every entry
    // undefined, and SimplePassiveRenderer synthesizes a shimmer row for
    // every visible index — no data is ever en route to replace it under
    // the filter, so the skeleton is permanent.
    //
    // When a filter is active AND the snapshot is from the unified layer
    // (which is always filtered-aware), use the snapshot's `total` directly
    // instead of preserving the unfiltered floor. When the filter clears,
    // the next snapshot's Math.max path restores the floor.
    let hasActiveFilter = false
    if (visualStateStore) {
      // Prefer `filterGroup` (FilterBuilder dialog, GH#216 advanced filtering)
      // over the legacy flat `filters` array. The converter handles both
      // shapes; `applyFilterGroup` only writes `filterGroup`, leaving the
      // legacy `filters` array empty — observing only `filters` produced an
      // empty WhereExpr and the filter never reached the substrate.
      const initialUserFilter = convertVibeGridFilterToFilterExpression(
        visualStateStore.filterGroup ?? visualStateStore.filters,
        { relationshipFields: collectRelationshipFields(tableCoreStore?.columns) },
      )
      const initialSearchFilter = convertGlobalSearchToFilterExpression(
        visualStateStore.globalSearchText,
        collectSearchableFields(tableCoreStore?.columns),
      )
      hasActiveFilter =
        composeFiltersAnd(initialUserFilter, initialSearchFilter) !== undefined
    }

    if (viewportStore) {
      orpcClient.dataforge.data
        .count({ entityName: entityType })
        .then((res) => {
          if (cancelled) return
          if (typeof res?.count === 'number' && res.count > 0) {
            serverCountFloor = res.count
            const current = viewportStore.serverTotalRows ?? 0
            if (res.count > current) {
              viewportStore.setServerTotalRows(res.count)
            }
          }
        })
        .catch((err) => {
          logger.warn('serverTotalRows prefetch failed; falling back to local count', {
            entity: entityType,
            error: err instanceof Error ? err.message : String(err),
          })
        })
    }

    // Reset the requested-cursor ref on every effect run so a re-mount
    // (entity/org change) starts with a clean slate.
    lastRequestedCursorRef.current = null
    lastAppliedRowIdsKeyRef.current = ''

    // GH#3283 P1 — dispatch is unconditionally server-only now, so there is
    // no local adapter to wait on. `tryStart` still waits for
    // `tableCoreStore.columns` to hydrate (see below) before subscribing.
    let attempt = 0
    const MAX_ATTEMPTS = 120 // 120 × 500ms retry budget for column hydration

    const tryStart = (): void => {
      if (cancelled) return
      // PRESERVED — wait for `tableCoreStore.columns` to be populated
      // before subscribing. Column generation is async (TableCoreStore.init
      // awaits the schema fetch). If we subscribe before columns hydrate,
      // `include[]` is empty and the response carries no `_included`
      // payload → renderer falls back to raw IDs. Gate only when
      // tableCoreStore is provided (substrate path).
      if (tableCoreStore && tableCoreStore.columns.length === 0) {
        attempt++
        if (attempt >= MAX_ATTEMPTS) return
        initTimer = setTimeout(tryStart, 500)
        return
      }

      const debug = (typeof window !== 'undefined'
        ? (window as unknown as { __vibegrid_debug?: Record<string, unknown> }).__vibegrid_debug
        : undefined)

      // Subscribe + initial cursor wiring lives in `snapshot-wiring.ts`.
      const wiring = setupSnapshotWiring({
        entityType,
        // orgId is non-null here — the effect short-circuits earlier when
        // it's null.
        orgId: orgId as string,
        viewportStore,
        tableCoreStore,
        visualStateStore,
        editingStore,
        getCancelled: () => cancelled,
        getHasActiveFilter: () => hasActiveFilter,
        getServerCountFloor: () => serverCountFloor,
        lastRequestedCursorRef,
        lastAppliedRowIdsKeyRef,
        setState,
        debug,
        logger,
      })
      handle = wiring.handle
      // GH#3283 P1 B2 — event-bus table_change refetch (realtime
      // replacement for the deleted per-query delta channel).
      disposeEventBusRefetch = wiring.disposeEventBusRefetch

      // PRESERVED — VibeGrid sort/filter/search → handle.patch pushdown.
      // Re-fires whenever `visualStateStore.sortBy`, `visualStateStore.filters`,
      // `visualStateStore.globalSearchText`, or the grid's searchable
      // column set changes reference.
      if (visualStateStore) {
        disposeSortFilterReaction = setupFilterSortReaction({
          visualStateStore,
          tableCoreStore,
          editingStore,
          viewportStore,
          getHandle: () => handle,
          getCancelled: () => cancelled,
          getServerCountFloor: () => serverCountFloor,
          setHasActiveFilter: (v) => {
            hasActiveFilter = v
          },
          lastRequestedCursorRef,
          logger,
        })
      }

      // PRESERVED — viewport→cursor reaction with containment dedup.
      if (viewportStore) {
        disposeCursorReaction = setupViewportCursor({
          viewportStore,
          getHandle: () => handle,
          getCancelled: () => cancelled,
          lastRequestedCursorRef,
          debug,
          logger,
        })
      }
    }

    tryStart()

    return () => {
      cancelled = true
      if (initTimer) clearTimeout(initTimer)
      if (disposeCursorReaction) disposeCursorReaction()
      if (disposeSortFilterReaction) disposeSortFilterReaction()
      if (disposeEventBusRefetch) disposeEventBusRefetch()
      if (handle) handle.close()
      // Reset to fallback derivation so subsequent non-substrate grids
      // (TanStack DB / production paginator) don't see stale
      // serverTotalRows from a previous substrate-owned entity.
      if (viewportStore) {
        viewportStore.setServerTotalRows(null)
      }
      // Clear debug surface; the next mount re-stamps it.
      const debug = (typeof window !== 'undefined'
        ? (window as unknown as { __vibegrid_debug?: Record<string, unknown> }).__vibegrid_debug
        : undefined)
      if (debug) {
        debug.lastCursor = null
        debug.lastQuery = null
      }
    }
  }, [entityType, orgId])

  return state
}

// Re-export public surface from helper modules for the entry shell.
export { CURSOR_OVERSCAN } from './viewport-cursor'
export { wrapSubstrateRow } from './snapshot-wiring'
export type { ServerGridRowsResult } from './snapshot-wiring'
