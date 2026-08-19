/**
 * GH#3119 P1.4 — unified-layer snapshot subscription.
 * GH#3283 P1 — trimmed to server-only dispatch; realtime now rides the
 * event bus instead of the deleted per-query delta channel.
 *
 * Houses:
 *   - `subscribe(...)` call that registers the unified query subscription
 *   - The `onSnapshot` handler with stale-snapshot guard
 *   - `applySnapshot` — serverTotalRows publication, editing-store dedup,
 *     setSparseRows write, React state update
 *   - `buildRequest` — synthesize a `QueryRequest` from the current sort/
 *     filter/search state
 *   - `setupEventBusRefetch` — GH#3283 P1 B2: subscribes to the event bus
 *     for `table_change` events matching `(entityType, orgId)` and
 *     debounced-refetches the current window via `handle.patch({})`. This
 *     replaces the deleted per-query delta channel as the grid's sole
 *     realtime surface.
 *   - `wrapSubstrateRow` — legacy wrapper helper (exported for callers
 *     outside the unified path)
 *   - `buildRelColDescriptors` — `RelColumnDescriptor[]` projection
 *
 * Spec reference: 3119-substrate-sqlite-system-simplification-s.md
 * §B12 (god-file-modularization-gate); 3283-remove-local-first-substrate.md
 * P1 (server-only trim + event-bus realtime).
 */

import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type { RawRow } from '../types'
import type { ViewportStore } from '@/systems/vibegrid/stores/ViewportStore'
import type { TableCoreStore } from '@/systems/vibegrid/stores/TableCoreStore'
import type { VisualStateStore } from '@/systems/vibegrid/stores/VisualStateStore'
import type { EditingStore } from '@/systems/vibegrid/stores/EditingStore'
import type { Logger } from '@/shared/lib/logging'
import { getUserActorStore, type EventNotification } from '@/app/stores/domain/UserActorStore'
import { applyQueryDeltaDedup, type InFlightMap, type RawRowShape } from '../query-delta-dedup'
import { subscribe, type SubscriptionHandle } from '../unified/query'
import type { RelColumnDescriptor } from '../unified/project-row'
import type { QueryRequest, QueryResponse, WrappedRow } from '@baseplane/shared-types'
import {
  asWherePredicate,
  collectSearchableFields,
  convertVibeGridSortToQuerySort,
} from './filter-sort-reaction'
import { CURSOR_OVERSCAN, CURSOR_PATCH_DEBOUNCE_MS } from './viewport-cursor'
import {
  convertVibeGridFilterToFilterExpression,
  convertGlobalSearchToFilterExpression,
  composeFiltersAnd,
  collectRelationshipFields,
} from '../vibegrid-sort-filter-bridge'

/**
 * GH#2806 ISSUE-1: re-shape substrate rows to the canonical wrapped contract.
 *
 * Both adapters in the unified query layer (B4 + B5) already emit
 * `WrappedRow` (`{id, data}`). This helper is retained for legacy callers
 * outside the unified path — `TableCoreStore`, `useEntityOptions`, the
 * query-delta-dedup tests, and the project-row unit tests all reference it.
 * It is idempotent: a row that is already wrapped passes through unchanged.
 */
export function wrapSubstrateRow(row: RawRow): RawRow {
  if (
    row &&
    typeof row === 'object' &&
    'data' in row &&
    row.data &&
    typeof row.data === 'object' &&
    !Array.isArray(row.data)
  ) {
    return row
  }
  const { id, ...rest } = row as { id: string; [k: string]: unknown }
  return { id, data: rest as Record<string, unknown> } as unknown as RawRow
}

/**
 * Build the unified-layer `RelColumnDescriptor` list from a TableCoreStore's
 * columns. Mirrors the equivalent logic in the now-deleted cold-start bypass
 * writer (pre-B8) — the server adapter needs this to project `colId__rel`
 * lookups.
 */
export function buildRelColDescriptors(
  tableCoreStore: TableCoreStore | null | undefined,
): RelColumnDescriptor[] {
  if (!tableCoreStore) return []
  const columns = tableCoreStore.columns as
    | Array<{
        id: string
        relationshipTargetEntity?: string | null
        relationshipDisplayField?: string | null
      }>
    | undefined
  if (!columns || columns.length === 0) return []
  const out: RelColumnDescriptor[] = []
  for (const col of columns) {
    if (!col.relationshipTargetEntity) continue
    out.push({
      id: col.id,
      relationshipTargetEntity: col.relationshipTargetEntity,
      relationshipDisplayField: col.relationshipDisplayField ?? 'name',
    })
  }
  return out
}

export interface ServerGridRowsResult {
  rows: RawRow[]
  count: number
  isReady: boolean
  /**
   * True when this hook is delivering rows through the cursor-bounded
   * unified query path. Always `true` after the first snapshot — the hook
   * writes rows directly to `tableCoreStore.setSparseRows()` and the
   * consumer should NOT call `setRows()` from the returned `rows` (doing so
   * would clobber the sparse window). Stays `false` only before the
   * entity/org are known and the hook short-circuits with empty state.
   */
  bounded: boolean
  /**
   * GH#3019 B10 — propagates the last snapshot's `isComplete` field. When
   * true, the dataset is fully loaded (the server-served response covers the
   * requested window through `total`). `useVibeGridData` reads this to
   * drive `initStore.markEntityDataKnownComplete()`.
   */
  isComplete: boolean
  /**
   * GH#3019 B10 — which adapter served the last snapshot. GH#3283 P1 made
   * dispatch unconditionally server-only, so this is always `'server'` once
   * a snapshot lands (the `'local'` member survives on the shared
   * `QueryResponse['source']` type for now — the unified query layer itself
   * is a temporary bridge, see the P1 spec's Non-Goals); `null` before the
   * first snapshot lands.
   */
  source: 'local' | 'server' | null
}

export interface SnapshotWiringCtx {
  entityType: string
  orgId: string
  viewportStore: ViewportStore | null | undefined
  tableCoreStore: TableCoreStore | null | undefined
  visualStateStore: VisualStateStore | null | undefined
  editingStore: EditingStore | null | undefined
  getCancelled: () => boolean
  getHasActiveFilter: () => boolean
  getServerCountFloor: () => number
  lastRequestedCursorRef: MutableRefObject<{ start: number; size: number } | null>
  lastAppliedRowIdsKeyRef: MutableRefObject<string>
  setState: Dispatch<SetStateAction<ServerGridRowsResult>>
  debug: Record<string, unknown> | undefined
  logger: Logger
}

export interface SnapshotWiringResult {
  handle: SubscriptionHandle
  initialCursor: { start: number; size: number }
  /** Tears down the event-bus `table_change` refetch subscription. */
  disposeEventBusRefetch: () => void
}

/**
 * GH#3283 P1 B2 — subscribe to the event bus for `table_change` events
 * matching `(entityType, orgId)` and debounced-refetch the grid's current
 * window via `handle.patch({})`. This is the sole realtime surface for
 * grids now that the substrate delta channel is gone: a server-side write
 * (this grid's own mutation, another tab's edit, an upload landing, a
 * workflow-driven update) fires `table_change`, and every open grid for
 * that entity + org re-pulls its current viewport.
 *
 * Debounced with `CURSOR_PATCH_DEBOUNCE_MS` (the same window the viewport
 * cursor reaction uses) so a burst of `table_change` events (e.g. a bulk
 * import) collapses into one refetch instead of one per row.
 *
 * Returns a dispose function. No-ops safely if the event bus isn't up yet
 * (e.g. hook mounts before auth/org stabilizes) — the caller can ignore the
 * return value in that case, `dispose` is always a valid no-op function.
 */
function setupEventBusRefetch(ctx: {
  entityType: string
  orgId: string
  getHandle: () => SubscriptionHandle | null
  getCancelled: () => boolean
}): () => void {
  const { entityType, orgId, getHandle, getCancelled } = ctx
  const userActorStore = getUserActorStore()
  if (!userActorStore) return () => {}

  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  const handleEvent = (event: EventNotification): void => {
    if (event.eventType !== 'table_change') return
    if (event.organizationId !== orgId) return
    if (!event.tables?.includes(entityType)) return
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      debounceTimer = null
      if (getCancelled()) return
      const handle = getHandle()
      if (!handle) return
      void handle.patch({})
    }, CURSOR_PATCH_DEBOUNCE_MS)
  }

  const unsubscribe = userActorStore.onEvent(handleEvent)
  return () => {
    if (debounceTimer) clearTimeout(debounceTimer)
    unsubscribe()
  }
}

/**
 * Install the unified-layer subscription. Returns the live `SubscriptionHandle`
 * + the initial cursor + the event-bus refetch dispose fn. The caller (hook
 * entry) owns `handle.close()` and `disposeEventBusRefetch()`.
 */
export function setupSnapshotWiring(ctx: SnapshotWiringCtx): SnapshotWiringResult {
  const {
    entityType,
    orgId,
    viewportStore,
    tableCoreStore,
    visualStateStore,
    editingStore,
    getCancelled,
    getHasActiveFilter,
    getServerCountFloor,
    lastRequestedCursorRef,
    lastAppliedRowIdsKeyRef,
    setState,
    debug,
    logger,
  } = ctx

  // Local handle reference. Bound after `subscribe(...)` returns, then read
  // by the snapshot callback (invoked after `subscribe` returns) and the
  // event-bus refetch handler below.
  let handle: SubscriptionHandle | null = null

  /**
   * Apply a snapshot to TableCoreStore + React state. Encapsulates the
   * preserved logic: serverTotalRows publication, editing-store dedup,
   * setSparseRows write, React state update. Equivalent to the inner
   * `applyDelivery` of the pre-B8 substrate-autorun useEffect.
   */
  const applySnapshot = (response: QueryResponse): void => {
    if (getCancelled()) return
    const wrappedRows: WrappedRow[] = response.rows
    const deliveredCursor = response.cursor

    // GH#3112 — id-set change detection. The editing-store dedup below
    // skips deliveries where every delivered row matches `rawRowsById`,
    // but that misses rows REMOVED from the window between deliveries
    // (post-delete refetch, optimistic-placeholder swaps). We always
    // apply when the comma-joined id set changed.
    const newRowIdsKey = wrappedRows.map((r) => r.id).join(',')
    const idsChanged = newRowIdsKey !== lastAppliedRowIdsKeyRef.current

    const hasActiveFilter = getHasActiveFilter()
    const serverCountFloor = getServerCountFloor()

    // Compute the floor-aware total. Filtered queries use the snapshot's
    // total directly (it reflects the filter); unfiltered queries take the
    // max of (server prefetch, query-reported total, snapshot total) so an
    // early prefetch racing a slightly-later first snapshot can't shrink
    // the scroll container mid-flight.
    const totalForSparse = hasActiveFilter
      ? response.total
      : Math.max(
          viewportStore?.serverTotalRows ?? 0,
          serverCountFloor,
          response.total,
        )

    if (tableCoreStore) {
      // PRESERVED — editing-store conflict dedup (spec B8 preserved-
      // behavior list). When every delivered row is already locally
      // up-to-date (optimistic write echo) AND no active edit overlay
      // needs to be preserved, skip the setSparseRows call entirely so
      // we don't bump dataVersion for a no-op.
      let shouldApplyDelivery = true
      if (editingStore && tableCoreStore.rawRowsById.size > 0) {
        const rawRowsById = tableCoreStore.rawRowsById as unknown as Map<string, RawRowShape>
        const inFlight = editingStore.getInFlight() as unknown as InFlightMap
        const editingState =
          editingStore.editingCell && editingStore.isEditing
            ? (() => {
                const [rowId, field] = editingStore.editingCell.split(':')
                return rowId && field ? { rowId, field } : null
              })()
            : null
        const dedup = applyQueryDeltaDedup({
          delta: wrappedRows as unknown as RawRowShape[],
          rawRowsById,
          inFlight,
          editingState,
        })
        if (
          dedup.rowsToSkip.length === wrappedRows.length &&
          dedup.rowsWithActiveEditConflict.length === 0 &&
          !idsChanged
        ) {
          shouldApplyDelivery = false
        }
      }
      if (shouldApplyDelivery) {
        logger.debug('setSparseRows', {
          t: performance.now(),
          start: deliveredCursor.start,
          n: wrappedRows.length,
          total: totalForSparse,
          source: response.source,
        })
        tableCoreStore.setSparseRows(
          deliveredCursor.start,
          wrappedRows as unknown as RawRow[],
          totalForSparse,
        )
        // GH#3112 — record the applied id-set so the next delivery can
        // detect row removals/insertions. NOT updated on skipped
        // deliveries: the next echo should still see the previous ids
        // and skip if it again matches.
        lastAppliedRowIdsKeyRef.current = newRowIdsKey
      }
    }

    // Publish total to the viewport store using the floor-aware total.
    if (viewportStore) {
      const current = viewportStore.serverTotalRows ?? 0
      const next = hasActiveFilter
        ? response.total
        : Math.max(current, serverCountFloor, response.total)
      if (next !== current) {
        viewportStore.setServerTotalRows(next)
      }
    }

    // GH#3019 B8/B10 — surface isComplete + source for `useVibeGridData`
    // to drive `initStore.markEntityDataKnownComplete()`. `isReady` is
    // true once we have a snapshot covering ≥1 row OR the response is
    // authoritatively complete (e.g. legitimately empty entity).
    setState({
      rows: wrappedRows as unknown as RawRow[],
      count: response.total,
      isReady: response.isComplete || wrappedRows.length > 0,
      bounded: true,
      isComplete: response.isComplete,
      source: response.source,
    })
  }

  /**
   * Synthesize a `QueryRequest` for the current sort/filter/search state.
   * Re-evaluated on each patch by the sort/filter reaction below.
   *
   * GH#3283 P1 — `prefer` is always `'server'`: the unified dispatcher no
   * longer has a local adapter to route to, so `'auto'` would be a no-op
   * distinction. Setting it explicitly keeps the wire contract legible.
   */
  const buildRequest = (cursor: { start: number; size: number }): QueryRequest => {
    const relCols = buildRelColDescriptors(tableCoreStore)
    const include = relCols.map((c) => c.id)
    const req: QueryRequest = {
      entity: entityType,
      orgId,
      cursor,
      prefer: 'server',
    }
    if (include.length > 0) req.include = include
    if (visualStateStore) {
      // Sort: the bridge's `convertVibeGridSortToQueryShape` returns
      // substrate's QueryShape.sort[]; the unified SortClause shape is
      // structurally identical (`{field, direction}`). Forward as-is.
      const bridgeSort = convertVibeGridSortToQuerySort(visualStateStore.sortBy)
      if (bridgeSort && bridgeSort.length > 0) req.sort = bridgeSort
      const userFilter = convertVibeGridFilterToFilterExpression(
        visualStateStore.filterGroup ?? visualStateStore.filters,
        { relationshipFields: collectRelationshipFields(tableCoreStore?.columns) },
      )
      const searchFilter = convertGlobalSearchToFilterExpression(
        visualStateStore.globalSearchText,
        collectSearchableFields(tableCoreStore?.columns),
      )
      const filter = composeFiltersAnd(userFilter, searchFilter)
      if (filter !== undefined) req.filter = asWherePredicate(filter)
    }
    return req
  }

  // Initial cursor: 200 visible rows + 2*overscan.
  const initialCursor = {
    start: 0,
    size: 200 + 2 * CURSOR_OVERSCAN,
  }
  lastRequestedCursorRef.current = { ...initialCursor }

  const request = buildRequest(initialCursor)
  const relCols = buildRelColDescriptors(tableCoreStore)

  handle = subscribe(
    request,
    {
      onSnapshot: (response) => {
        // PRESERVED — stale-snapshot guard (pre-B8 had stale-delta
        // guard against `query.cursor`). The unified layer always
        // echoes the request cursor back in the response, but a
        // late-arriving snapshot for a cursor that has since been
        // superseded by a more recent patch should still be applied
        // for its own window: each snapshot is authoritative for the
        // window it stamps. Drop only if cursor mismatches the most
        // recent request to keep `setSparseRows(start, …)` aligned.
        const expected = lastRequestedCursorRef.current
        if (
          expected &&
          (response.cursor.start !== expected.start ||
            response.cursor.size !== expected.size)
        ) {
          return
        }
        applySnapshot(response)
      },
    },
    relCols,
  )

  // GH#3283 P1 B2 — event-bus realtime replaces the deleted per-query delta
  // channel. Wired after `handle` is bound so `getHandle` always sees the
  // live subscription.
  const disposeEventBusRefetch = setupEventBusRefetch({
    entityType,
    orgId,
    getHandle: () => handle,
    getCancelled,
  })

  // Expose the active handle on `window.__vibegrid_debug` for
  // verification. The global itself is stamped in VibeGrid.tsx; we
  // just patch the live cursor + handle reference here.
  if (debug) {
    debug.lastCursor = { ...initialCursor }
    debug.lastQuery = handle
  }

  return { handle, initialCursor, disposeEventBusRefetch }
}
