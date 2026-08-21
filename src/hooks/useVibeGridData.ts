/**
 * useVibeGridData - Substrate Integration Hook
 *
 * Bridges MobX stores (TableCoreStore, VisualStateStore) to the substrate
 * read hook `useEntityGrid` (GH#3119 P5 consumer migration). Provides
 * reactive data delivery and CRUD mutations.
 *
 * Architecture (post-GH#3119 P5 cutover):
 * - MobX stores manage UI state (filters, sorting, grouping config)
 * - useEntityGrid is the single-source-of-truth read hook; it returns
 *   `{rows, total, isLoading, isStale, isWarm, error, source}` for a
 *   `(entityName, where, orderBy, viewport)` input.
 * - This hook converts MobX observables → useEntityGrid inputs (via a
 *   `mobx.reaction`) and writes useEntityGrid results → MobX stores
 *   (`tableCoreStore.setSparseRows`, `viewportStore.setServerTotalRows`).
 * - Mutations route through substrateCreate / substrateUpdate / substrateDelete
 *   (oRPC). Mutation-hook migration to `useEntityMutation` is a separate task.
 *
 * IMPORTANT: This hook writes directly to MobX. The parent component should NOT
 * use a useEffect to bridge rows to the store - that creates duplicate updates.
 *
 * Usage:
 * ```typescript
 * const { isLoading, createEntity, updateEntity, deleteEntity } =
 *   useVibeGridData(entityType, tableCoreStore, visualStateStore, initStore)
 * ```
 */

import { reaction } from 'mobx'
import { useEffect, useMemo, useState } from 'react'
import type { SortClause, WherePredicate } from '@baseplane/shared-types'
import { getLogger } from '@/shared/lib/logging'
import type { TableCoreStore } from '../stores/TableCoreStore'
import type { InitStore } from '../stores/InitStore'
import type { VisualStateStore } from '../stores/VisualStateStore'
import { mutationApi } from '@/shared/data/hooks/useEntityMutation'
import { isWarmSyncDisabled } from '@/shared/data/query/feature-flag'
import {
  useEntityGrid,
  type RelationshipSearchClause,
  type ViewportSpec,
} from '@/shared/data/hooks/useEntityGrid'
import { buildRelColDescriptors } from '@/shared/data/query/use-server-grid-rows/snapshot-wiring'
import {
  collectRelationshipFields,
  composeFiltersAnd,
  convertGlobalSearchToFilterExpression,
  convertVibeGridFilterToFilterExpression,
} from '@/shared/data/query/vibegrid-sort-filter-bridge'
import {
  asWherePredicate,
  collectSearchableFields,
  convertVibeGridSortToQuerySort,
} from '@/shared/data/query/use-server-grid-rows/filter-sort-reaction'
import { CURSOR_OVERSCAN } from '@/shared/data/query/use-server-grid-rows/viewport-cursor'
import { wrapSubstrateRow } from '@/shared/data/query/use-server-grid-rows/snapshot-wiring'
import type { RawRow } from '@/shared/data/query/types'
import { useOrganization } from '@/app/stores'
import { useVibeGridStores } from '../stores/context'
import { useGridRelationshipProjection } from './useGridRelationshipProjection'

const logger = getLogger(['vibegrid', 'hooks', 'useVibeGridData'])

// ====================================
// TYPES
// ====================================

export interface VibeGridDataResult {
  /** Loading state */
  isLoading: boolean
  /**
   * GH#2806 P8 / GH#3119 P5: substrate is the only VibeGrid data source.
   * The legacy TanStack DB collection field is always `null`; kept on the
   * result shape so existing consumers (VibeGrid.tsx propagation to stores,
   * CommandBus undo/redo paths) compile without a wider refactor.
   * Those consumers all early-return when collection is falsy.
   */
  collection: any
  /** Create new entity */
  createEntity: (data: Record<string, any>) => void
  /** Update existing entity */
  updateEntity: (id: string, updates: Record<string, any>) => void
  /** Delete entity */
  deleteEntity: (id: string) => Promise<void>
}

export interface VibeGridDataOptions {
  /** Skip data fetching (for mock data mode) */
  skip?: boolean
  /** Collection override for mock testing (push items directly into the store) */
  collectionOverride?: any
  /**
   * System-level row predicate applied before user-visible filters.
   * Rows returning false are hidden from the grid (not shown in filter bar).
   * Use for structural exclusions like upload-pending entities.
   */
  systemPredicate?: (row: any) => boolean
}

// ====================================
// INTERNAL — derived inputs from MobX
// ====================================

interface GridInputs {
  where: WherePredicate | undefined
  orderBy: SortClause[] | undefined
  viewport: ViewportSpec
  /** Chip search (GH#3274) — warm-branch relationship-name search clauses. */
  relationshipSearch?: RelationshipSearchClause[]
}

/** Identifier shape for a JSON field name we interpolate into a json_extract path. */
const SIMPLE_FIELD = /^[a-zA-Z_][a-zA-Z0-9_]*$/
/** Entity-type names allow a leading letter then word chars / hyphen. */
const ENTITY_NAME = /^[A-Za-z][A-Za-z0-9_-]*$/

/**
 * Derive chip-search clauses for the warm branch: one `rel_name_contains` per
 * VISIBLE relationship column (so matches land in an on-screen chip, mirroring
 * the visible-column scoping of scalar search). Returns `undefined` when the
 * term is empty or the grid has no eligible relationship columns. Invalid
 * identifiers are skipped (target type) or coerced to the default `name`
 * (display field) so a malformed schema can never throw inside the SQL builder.
 */
function deriveRelationshipSearch(
  tableCoreStore: TableCoreStore,
  term: string,
  columnVisibility: Record<string, boolean> | undefined,
): RelationshipSearchClause[] | undefined {
  const trimmed = term.trim()
  if (trimmed.length === 0) return undefined
  const clauses: RelationshipSearchClause[] = []
  for (const c of buildRelColDescriptors(tableCoreStore)) {
    if (columnVisibility && columnVisibility[c.id] === false) continue
    const targetEntityType = c.relationshipTargetEntity
    if (!targetEntityType || !ENTITY_NAME.test(targetEntityType)) continue
    if (!SIMPLE_FIELD.test(c.id)) continue
    const displayField = c.relationshipDisplayField
    clauses.push({
      field: c.id,
      targetEntityType,
      targetNameField:
        displayField && SIMPLE_FIELD.test(displayField) ? displayField : undefined,
      term: trimmed,
    })
  }
  return clauses.length > 0 ? clauses : undefined
}

/** Stable empty-rows identity so the override memo doesn't churn. */
const EMPTY_ROWS: Array<Record<string, unknown> | null> = []

const DEFAULT_VIEWPORT_SIZE = 200

const EMPTY_INPUTS: GridInputs = {
  where: undefined,
  orderBy: undefined,
  viewport: {
    start: 0,
    end: DEFAULT_VIEWPORT_SIZE + CURSOR_OVERSCAN,
  },
}

/** Debounce window for MobX-derived input recomputes. Matches the legacy
 * viewport-cursor debounce so scroll bursts collapse to one input update. */
const INPUT_RECOMPUTE_DEBOUNCE_MS = 50

// ====================================
// MAIN HOOK
// ====================================

/**
 * Integrate MobX stores with the substrate read hook `useEntityGrid`.
 *
 * This hook owns:
 *   - input projection: MobX observables → useEntityGrid inputs (via reaction)
 *   - output wiring: useEntityGrid result → tableCoreStore.setSparseRows()
 *     + viewportStore.setServerTotalRows()
 *   - hydration state (initStore.markEntityDataKnownComplete())
 *   - 8s graceful-degradation fallback (initStore.markServerDataRendered)
 *   - wedge watchdog arming
 *   - mock-data passthrough (collectionOverride)
 *   - mutation entry points (createEntity / updateEntity / deleteEntity)
 *
 * @param entityType - Entity type name (e.g., 'WorkTask')
 * @param tableCoreStore - Store to write rows data to
 * @param visualStateStore - Store containing filters, sorting, grouping config
 * @param initStore - Store for tracking hydration state
 * @param options - Optional config (skip: true for mock data mode, collectionOverride: for mock testing)
 * @returns Loading state and CRUD mutations (rows are pushed directly to tableCoreStore)
 */
export function useVibeGridData(
  entityType: string,
  tableCoreStore: TableCoreStore,
  visualStateStore: VisualStateStore,
  initStore: InitStore,
  options?: VibeGridDataOptions,
): VibeGridDataResult {
  const skip = options?.skip ?? false
  const collectionOverride = options?.collectionOverride

  const orgId = useOrganization()?.activeOrganizationId ?? null
  const useSubstrate = !skip && !collectionOverride
  const { viewportStore } = useVibeGridStores()

  // ====================================
  // INPUT PROJECTION (MobX → useEntityGrid inputs)
  // ====================================
  //
  // We cannot read MobX observables inline (this hook is not wrapped in
  // observer()). Instead, a `reaction` watches the relevant observables and
  // pushes their derived input shape into React state via `setInputs`. The
  // reaction collapses bursts via a small debounce.
  const [inputs, setInputs] = useState<GridInputs>(EMPTY_INPUTS)

  useEffect(() => {
    if (!useSubstrate || !entityType) return
    let debounceTimer: ReturnType<typeof setTimeout> | null = null

    const dispose = reaction(
      () => {
        // Tracked observables. Read all in the tracking fn so MobX subscribes.
        const sortBy = visualStateStore.sortBy
        const filters = visualStateStore.filters
        const filterGroup = visualStateStore.filterGroup
        const globalSearchText = visualStateStore.globalSearchText
        const visibleRowRange = viewportStore?.visibleRowRange ?? null
        // Scope global search to VISIBLE searchable columns so every match
        // lands in an on-screen (highlightable) cell.
        const searchableFields = collectSearchableFields(
          tableCoreStore?.columns,
          visualStateStore.columnVisibility,
        ).join('|')
        return {
          sortBy,
          filters,
          filterGroup,
          globalSearchText,
          visibleRowRange,
          searchableFields,
        }
      },
      ({
        sortBy,
        filters,
        filterGroup,
        globalSearchText,
        visibleRowRange,
        searchableFields,
      }) => {
        if (debounceTimer) clearTimeout(debounceTimer)
        debounceTimer = setTimeout(() => {
          // Build WherePredicate from filterGroup (preferred) ?? filters
          // + global search.
          const userFilter = convertVibeGridFilterToFilterExpression(
            filterGroup ?? filters,
            { relationshipFields: collectRelationshipFields(tableCoreStore?.columns) },
          )
          const searchFilter = convertGlobalSearchToFilterExpression(
            globalSearchText,
            searchableFields.length > 0 ? searchableFields.split('|') : null,
          )
          const combined = composeFiltersAnd(userFilter, searchFilter)
          const where = asWherePredicate(combined)

          // Chip search (GH#3274): also match the text shown in relationship
          // chips. Derived from the same search term + the grid's visible
          // relationship columns; applied on the warm branch via
          // `rel_name_contains` (a cache-local self-join).
          const relationshipSearch = deriveRelationshipSearch(
            tableCoreStore,
            globalSearchText ?? '',
            visualStateStore.columnVisibility,
          )

          const orderBy = convertVibeGridSortToQuerySort(sortBy)

          // Build viewport with CURSOR_OVERSCAN above and below the visible
          // window so micro-scrolls don't round-trip the server.
          let start = 0
          let end = DEFAULT_VIEWPORT_SIZE + CURSOR_OVERSCAN
          if (visibleRowRange) {
            start = Math.max(0, visibleRowRange.start - CURSOR_OVERSCAN)
            end = Math.max(start + 1, visibleRowRange.end + CURSOR_OVERSCAN)
          }

          setInputs({
            where,
            orderBy,
            viewport: { start, end },
            relationshipSearch,
          })
        }, INPUT_RECOMPUTE_DEBOUNCE_MS)
      },
      { fireImmediately: true },
    )

    return () => {
      dispose()
      if (debounceTimer) clearTimeout(debounceTimer)
    }
  }, [useSubstrate, entityType, visualStateStore, tableCoreStore, viewportStore])

  // ====================================
  // READ HOOK
  // ====================================
  // The new single-source-of-truth read hook. Note we call it
  // unconditionally to satisfy hooks rules; when `useSubstrate` is false we
  // pass an empty entityName which short-circuits the hook to the EMPTY
  // result.
  const result = useEntityGrid({
    entityName: useSubstrate ? entityType : '',
    where: inputs.where,
    orderBy: inputs.orderBy,
    viewport: inputs.viewport,
    relationshipSearch: inputs.relationshipSearch,
  })

  // ====================================
  // RELATIONSHIP-NAME PROJECTION
  // ====================================
  // GH#3119 follow-up: the substrate read hook returns raw row content with
  // relationship fields as arrays of ID strings — no server `_included` name
  // projection. Without this step the badge-list renderer has no
  // `colId__rel` to read and chips render `#<idSuffix>` instead of names.
  // `useGridRelationshipProjection` bulk-fetches the referenced targets and
  // returns each row in the wrapped `{id, data:{...fields, colId__rel}}` shape
  // (preserving `null` skeleton positions). When target names land the
  // returned array gets a new identity and the push effect below re-runs.
  const projectedRows = useGridRelationshipProjection(
    useSubstrate ? tableCoreStore : null,
    result.rows,
    orgId,
  )

  // ====================================
  // PUSH RESULTS → MobX STORES
  // ====================================
  useEffect(() => {
    if (!useSubstrate) return
    if (!tableCoreStore) return

    // Filter skeleton placeholders (null entries) — setSparseRows expects
    // real WrappedRow values and will paint skeleton cells for unloaded
    // indices on its own. `projectedRows` is positionally aligned with
    // `result.rows`; rows already carry the wrapped `{id, data}` shape, so
    // `wrapSubstrateRow` is an idempotent no-op kept for type safety.
    const wrappedRows: RawRow[] = []
    for (const row of projectedRows) {
      if (row === null) continue
      wrappedRows.push(wrapSubstrateRow(row as RawRow))
    }

    // Write rows at the offset they were EVALUATED for (`result.viewport`),
    // never the live input viewport. On scroll, `inputs.viewport.start`
    // advances immediately while `result` still holds the previous window's
    // rows until the async evaluate resolves — pairing those would paint
    // old-window rows at the new offset (the "wrong rows flash, then the
    // correct rows replace them" scroll jitter). Writing at the result's
    // own start is always correct: each result is authoritative for the
    // window it was computed for.
    tableCoreStore.setSparseRows(
      result.viewport.start,
      wrappedRows,
      result.total,
    )

    if (viewportStore) {
      if (viewportStore.serverTotalRows !== result.total) {
        viewportStore.setServerTotalRows(result.total)
      }
    }
  }, [
    useSubstrate,
    tableCoreStore,
    viewportStore,
    result.viewport,
    projectedRows,
    result.total,
  ])

  // ====================================
  // COLLECTION OVERRIDE (EMBEDDED / MOCK MODE)
  // ====================================
  // Handle collectionOverride data push when skip mode is enabled. Embedded
  // grids (the PaymentCycle hub's lien tabs, mock harnesses) supply their own
  // already-fetched rows rather than reading the substrate.
  //
  // Relationship names: the override rows are raw records — relationship
  // fields are arrays of target IDs with no `colId__rel` projection. Without
  // the same projection the substrate path gets, the badge-list renderer's
  // Path 1 is empty and Path 2 (`getExistingEntityCollection`) is dead
  // post-GH#3119, so every chip renders `#<idSuffix>` forever. Run
  // `useGridRelationshipProjection` over the override rows too, then flatten
  // back to the flat record shape `setRows` expects (the projection returns
  // the wrapped `{id, data}` contract) so only the `colId__rel` keys are new.
  const overrideRows = useMemo<Array<Record<string, unknown> | null>>(() => {
    if (!skip || !collectionOverride) return EMPTY_ROWS
    const items = collectionOverride.items || collectionOverride
    return Array.isArray(items) ? (items as Array<Record<string, unknown>>) : EMPTY_ROWS
  }, [skip, collectionOverride])

  const projectedOverrideRows = useGridRelationshipProjection(
    skip && collectionOverride ? tableCoreStore : null,
    overrideRows,
    orgId,
  )

  const flatOverrideRows = useMemo(() => {
    const out: Array<Record<string, unknown>> = []
    for (const row of projectedOverrideRows) {
      if (row === null) continue
      const data = (row as { data?: unknown }).data
      out.push(
        data && typeof data === 'object' && !Array.isArray(data)
          ? { ...(data as Record<string, unknown>), id: row.id }
          : (row as unknown as Record<string, unknown>),
      )
    }
    return out
  }, [projectedOverrideRows])

  useEffect(() => {
    if (!skip || !collectionOverride) return
    if (flatOverrideRows.length === 0) return

    logger.info('[useVibeGridData] 📊 Pushing collectionOverride items to store', {
      itemCount: flatOverrideRows.length,
      entityType,
    })
    tableCoreStore.setRows(flatOverrideRows)

    if (!initStore.entityDataKnownComplete) {
      initStore.markEntityDataKnownComplete()
    }
  }, [skip, collectionOverride, flatOverrideRows, tableCoreStore, initStore, entityType])

  // ====================================
  // HYDRATION GATE — markEntityDataKnownComplete
  // ====================================
  //
  // The substrate is authoritatively complete from useEntityGrid's POV when:
  //   - source === 'warm-local' (everything is in wa-sqlite, JS-evaluated)
  //   - source === 'warming-server', total === 0, and isLoading === false
  //     (server returned an empty-but-authoritative dataset)
  //   - GH#3283: warm sync is gated off, source === 'warming-server', and
  //     isLoading === false — see below
  //
  // While `source === 'warming-server' && isLoading` we're still mid-fetch
  // and must NOT mark complete.
  //
  // GH#3283 — the `total === 0` restriction encoded an assumption that is
  // false once warms are gated off. It was written when a NON-zero total in
  // the warming branch meant "the substrate is still filling, wait for
  // warm-local". With no warm loop, `warming-server` is the terminal state,
  // so that condition could never fire for a non-empty entity and this gate
  // never opened. Skeleton dismissal then fell to the 8s
  // `substrate_completion_timeout` fallback — an 8-second overlay on EVERY
  // grid load, which is worse than the warm cost being saved.
  //
  // The flag's contract is "row count is definitively known (zero or
  // non-zero)". In server-first mode `result.total` IS the server's
  // authoritative count, so a settled warming-server response satisfies it
  // exactly. Scoped to `isWarmSyncDisabled()` so the warm path's
  // wait-for-warm-local semantics are untouched for orgs without the gate.
  useEffect(() => {
    if (skip || initStore.entityDataKnownComplete) return
    if (result.source === 'warm-local') {
      initStore.markEntityDataKnownComplete()
      return
    }
    if (result.source === 'warming-server' && !result.isLoading) {
      if (isWarmSyncDisabled() || result.total === 0) {
        initStore.markEntityDataKnownComplete()
      }
    }
  }, [
    skip,
    initStore,
    result.source,
    result.total,
    result.isLoading,
  ])

  // ====================================
  // READ-ERROR SURFACE — resolve overlay instead of skeleton-forever
  // ====================================
  //
  // useEntityGrid sets `result.error` when an evaluation fails (e.g. the
  // warming-branch server query 400s on a malformed filter — GH#3246's
  // double-encoded filter param, GH#3216's scope-middleware AST rejection).
  // Without this effect that error was silently dropped: rows stay empty,
  // the hydration gate above never fires, the 8s graceful-degradation
  // fallback below requires processedRows > 0, and the grid sits in
  // skeleton state forever (GH#3242 / GH#3214 user-visible shape). Record
  // the failure on InitStore (drives the hydration-error UI) and flip
  // serverDataRendered so the skeleton gate opens.
  useEffect(() => {
    if (skip || !useSubstrate || !result.error) return
    logger.warn('substrate read failed; resolving overlay to error state', {
      event: 'substrate_query_error',
      entity_type: entityType,
      organization_id: orgId,
      error: result.error.message,
    })
    initStore.markError('substrate-query', result.error.message)
    initStore.markServerDataRendered()
  }, [skip, useSubstrate, result.error, initStore, entityType, orgId])

  // ====================================
  // GH#2956 P1 — 8s GRACEFUL-DEGRADATION RENDER FALLBACK
  // ====================================
  // If at 8s post-mount substrate completion hasn't fired BUT rows have
  // landed in tableCoreStore.processedRows, flip
  // initStore.serverDataRendered to dismiss the skeleton overlay. The
  // wedge_watchdog (30s) below stays untouched and continues recovery in
  // the background — we are deliberately NOT calling
  // markEntityDataKnownComplete() here (that flag's contract is "substrate
  // authoritatively complete"; the timeout doesn't satisfy it). Logs a
  // structured warn so Loki can baseline wedge rate in production.
  useEffect(() => {
    if (skip || !entityType || !orgId) return
    if (initStore.entityDataKnownComplete) return
    const id = window.setTimeout(() => {
      if (initStore.entityDataKnownComplete) return
      if (tableCoreStore.processedRows.length === 0) return
      logger.warn('substrate completion timeout', {
        event: 'substrate_completion_timeout',
        entity_type: entityType,
        organization_id: orgId,
        elapsed_ms: 8000,
        rows_present: true,
      })
      initStore.markServerDataRendered()
    }, 8000)
    return () => window.clearTimeout(id)
  }, [skip, entityType, orgId, initStore, tableCoreStore])

  // ====================================
  // CRUD MUTATIONS
  // ====================================

  // GH#3119 P5 — mutation entry points route through `mutationApi` (the
  // useEntityMutation singleton), which writes the optimistic overlay to
  // OptimisticMutationStore + issues the scoped oRPC mutation. The legacy
  // `substrateCreate/Update/Delete` path bypassed the overlay store and
  // wrote wa-sqlite directly via the SharedWorker, violating spec B1
  // ("wa-sqlite is k/v only — optimistic mutations never write to it").
  // mutationApi re-throws on error; the existing `.catch` keeps the
  // fire-and-forget semantics this hook exposes to consumers.
  const createEntity = useMemo(() => {
    return (data: Record<string, any>) => {
      mutationApi
        .create({ entityName: entityType, data })
        .then(() => {
          logger.info('Entity create persisted', { entityType })
        })
        .catch((err: any) => {
          logger.error('Entity create failed', {
            entityType,
            error: err instanceof Error ? err.message : String(err),
          })
        })
    }
  }, [entityType])

  const updateEntity = useMemo(() => {
    return (id: string, updates: Record<string, any>) => {
      mutationApi
        .update({ entityName: entityType, recordId: String(id), patch: updates })
        .then(() => {
          logger.info('Entity update persisted', { entityType, id })
        })
        .catch((err: any) => {
          logger.error('Entity update failed', {
            entityType,
            id,
            error: err instanceof Error ? err.message : String(err),
          })
        })
    }
  }, [entityType])

  const deleteEntity = useMemo(() => {
    // Returns the promise so bulk callers can `await` the round-trip.
    // Failures are already surfaced to the user by mutationApi (optimistic
    // patch rolled back + error toast), so they're logged, not re-thrown.
    return (id: string) => {
      return mutationApi
        .delete({ entityName: entityType, recordId: String(id) })
        .then(() => {
          logger.info('Entity delete persisted', { entityType, id })
        })
        .catch((err: any) => {
          logger.error('Entity delete failed', {
            entityType,
            id,
            error: err instanceof Error ? err.message : String(err),
          })
        })
    }
  }, [entityType])

  // ====================================
  // RETURN RESULT
  // ====================================

  logger.debug('useVibeGridData loading state', {
    entityType,
    isLoading: result.isLoading,
    isWarm: result.isWarm,
    source: result.source,
    total: result.total,
  })

  return {
    isLoading: result.isLoading,
    collection: null,
    createEntity,
    updateEntity,
    deleteEntity,
  }
}
