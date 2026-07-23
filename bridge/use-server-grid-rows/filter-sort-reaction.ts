/**
 * GH#3119 P1.4 — VibeGrid sort/filter/search → handle.patch reaction.
 *
 * Houses the `visualStateStore.{sortBy, filters, filterGroup,
 * globalSearchText}` MobX reaction that translates VibeGrid filter
 * shape into the unified `WherePredicate` AST and pushes the result
 * through `handle.patch({ sort, filter, cursor })`.
 *
 * Preserved behaviors:
 *   - Clobber-then-shimmer on sort/filter change (skipped while editing)
 *   - GH#3016 cursor anchor-at-origin to defeat the stale-snapshot guard
 *   - GH#3079 §C `filterGroup` precedence over the legacy `filters` array
 *
 * Behavior is identical to the pre-split (and later renamed) grid-rows hook;
 * this file is a mechanical extraction.
 *
 * Spec reference: 3119-substrate-sqlite-system-simplification-s.md
 * §B12 (god-file-modularization-gate).
 */

import type { MutableRefObject } from 'react'
import { reaction } from 'mobx'
import type { ViewportStore } from '@/systems/vibegrid/stores/ViewportStore'
import type { TableCoreStore } from '@/systems/vibegrid/stores/TableCoreStore'
import type { VisualStateStore } from '@/systems/vibegrid/stores/VisualStateStore'
import type { EditingStore } from '@/systems/vibegrid/stores/EditingStore'
import type { Logger } from '@/shared/lib/logging'
import {
  convertVibeGridFilterToFilterExpression,
  convertGlobalSearchToFilterExpression,
  composeFiltersAnd,
  convertVibeGridSortToQueryShape,
} from '../vibegrid-sort-filter-bridge'
import { isSearchableType } from '@/systems/vibegrid/constants/field-type-categories'
import type { SubscriptionHandle } from '../unified/query'
import type { SortClause, WherePredicate } from '@baseplane/shared-types'
import { CURSOR_OVERSCAN } from './viewport-cursor'

// Type guard for the WherePredicate shape — the bridge converter returns the
// substrate's FilterExpression op-vocabulary, but the unified QueryRequest
// uses the canonical WherePredicate AST. They are isomorphic for the v1
// operator subset (the local-adapter translates back on the way in). We
// forward the bridge's output as WherePredicate without re-validation; the
// adapters handle op-name normalization.
type BridgeFilter = ReturnType<typeof convertVibeGridFilterToFilterExpression>

export function asWherePredicate(
  filter: BridgeFilter | undefined,
): WherePredicate | undefined {
  // The bridge already produces a WherePredicate-compatible shape (the
  // converters were updated for the unified layer). Cast through unknown so
  // the variance isn't surfaced at every callsite.
  return filter as unknown as WherePredicate | undefined
}

/**
 * Collect field names from a grid's columns that should participate in the
 * global text search SQL pushdown.
 *
 * Mirrors the dense-mode JS path's `applyTextSearch` semantics
 * (`filter-utils.ts:290-323`): a column is searchable iff its `cellType` is
 * one of `isSearchableType`'s set (text/number/select variants).
 * Relationship columns are emitted with `cellType: 'badge-list'` which is
 * NOT in that set — so they are implicitly excluded.
 */
export function collectSearchableFields(
  columns: ReadonlyArray<{ id: string; field?: string; cellType?: string }> | null | undefined,
  columnVisibility?: Record<string, boolean> | null,
): string[] {
  if (!columns || columns.length === 0) return []
  const out: string[] = []
  for (const col of columns) {
    // Visible columns only. A search match must land in a cell the user can
    // actually see (and that the cell highlighter can mark) — matching on a
    // hidden text column produces rows with no visible reason for the match
    // ("not sure what's matching"). `columnVisibility[id] === false` is the
    // hidden signal (undefined → visible), matching VisualStateStore.
    if (columnVisibility && columnVisibility[col.id] === false) continue
    const cellType = col.cellType ?? ''
    if (!isSearchableType(cellType)) continue
    const fieldName = (col.field || col.id) as string | undefined
    if (!fieldName) continue
    out.push(fieldName)
  }
  return out
}

// ---------------------------------------------------------------------------
// Local helper — bridge VibeGrid SortConfig[] to unified SortClause[]
// ---------------------------------------------------------------------------
// The substrate's QueryShape.sort and the unified QueryRequest.sort have
// structurally identical entries (`{field, direction}`). The existing
// `convertVibeGridSortToQueryShape` already produces this shape, so we
// just retype it as SortClause[] for the unified API.
export function convertVibeGridSortToQuerySort(
  sortBy: VisualStateStore['sortBy'],
): SortClause[] | undefined {
  const result = convertVibeGridSortToQueryShape(sortBy)
  if (!result || result.length === 0) return undefined
  return result as SortClause[]
}

export interface FilterSortReactionCtx {
  visualStateStore: VisualStateStore
  tableCoreStore: TableCoreStore | null | undefined
  editingStore: EditingStore | null | undefined
  viewportStore: ViewportStore | null | undefined
  getHandle: () => SubscriptionHandle | null
  getCancelled: () => boolean
  getServerCountFloor: () => number
  setHasActiveFilter: (v: boolean) => void
  lastRequestedCursorRef: MutableRefObject<{ start: number; size: number } | null>
  logger: Logger
}

/**
 * Install the VibeGrid sort/filter/search MobX reaction. Returns a dispose
 * function that tears down the reaction.
 */
export function setupFilterSortReaction(ctx: FilterSortReactionCtx): () => void {
  const {
    visualStateStore,
    tableCoreStore,
    editingStore,
    viewportStore,
    getHandle,
    getCancelled,
    getServerCountFloor,
    setHasActiveFilter,
    lastRequestedCursorRef,
    logger,
  } = ctx

  return reaction(
    () => ({
      sortBy: visualStateStore.sortBy,
      filters: visualStateStore.filters,
      // GH#3079 §C — observe `filterGroup` (FilterBuilder dialog) as
      // well. The converter prefers `filterGroup` when present; the
      // legacy `filters` array is a fallback for code paths that
      // still mutate it (none in the active UI today).
      filterGroup: visualStateStore.filterGroup,
      globalSearchText: visualStateStore.globalSearchText,
      searchableFields: collectSearchableFields(
        tableCoreStore?.columns,
        visualStateStore.columnVisibility,
      ).join('|'),
    }),
    ({ sortBy, filters, filterGroup, globalSearchText, searchableFields }) => {
      const handle = getHandle()
      if (getCancelled() || !handle) return
      const bridgeSort = convertVibeGridSortToQuerySort(sortBy)
      const sortPatch: SortClause[] | undefined =
        bridgeSort && bridgeSort.length > 0 ? bridgeSort : undefined
      const userFilter = convertVibeGridFilterToFilterExpression(
        filterGroup ?? filters,
      )
      const searchFilter = convertGlobalSearchToFilterExpression(
        globalSearchText,
        searchableFields.length > 0 ? searchableFields.split('|') : null,
      )
      const filter = composeFiltersAnd(userFilter, searchFilter)
      setHasActiveFilter(filter !== undefined)

      // PRESERVED — clobber-then-shimmer on sort/filter change.
      // Sort/filter changes invalidate row order at every loaded
      // index. Without proactive invalidation, stale rows stay
      // painted for the full patch round-trip (~150-300ms). Clobber
      // the loaded window before the patch dispatches so the
      // renderer immediately paints sparse-skeleton cells. When the
      // snapshot arrives, `applySnapshot` replaces holes with real
      // rows.
      //
      // Active-edit guard: if the user is mid-edit, skip the clobber
      // — setting the loaded window to holes would replace the row
      // backing the edit overlay with a skeleton, breaking the
      // edit-commit path.
      if (tableCoreStore && !editingStore?.isEditing) {
        const total = Math.max(
          viewportStore?.serverTotalRows ?? 0,
          getServerCountFloor(),
        )
        if (total > 0) {
          tableCoreStore.setSparseRows(0, [], total)
        }
      }
      logger.debug('handle.patch send (sort/filter)', {
        t: performance.now(),
        sort: sortPatch,
        hasFilter: !!filter,
      })
      // GH#3016 — anchor filter/sort patches at origin. Filter changes are
      // semantically "reset to top"; preserving a scrolled cursor causes the
      // cursor reaction (fired by the shimmer-clobber's viewport invalidation)
      // to compute {start:0} which fails containment vs scrolled prev cursor,
      // which fires a second cursor patch that races the filter patch's
      // snapshot — the filter snapshot is then dropped by the stale-snapshot
      // guard at lines ~511-518. Anchoring at start:0 makes the cursor
      // reaction's computed {start:0} satisfy containment so no second patch
      // fires.
      const filterPatchCursor = { start: 0, size: 200 + 2 * CURSOR_OVERSCAN }
      void handle.patch({
        sort: sortPatch,
        filter: asWherePredicate(filter),
        cursor: filterPatchCursor,
      })
      // GH#3016 — lock the requested-cursor ref to the dispatched filter
      // cursor so the cursor reaction triggered intra-tick by the
      // shimmer-clobber's viewport resize cannot overwrite it before the
      // patch's snapshot arrives. Without this lock, the in-flight filter
      // snapshot is silently dropped by the stale-snapshot guard above.
      lastRequestedCursorRef.current = filterPatchCursor
    },
    { fireImmediately: false },
  )
}
