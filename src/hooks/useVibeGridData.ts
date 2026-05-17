/**
 * useVibeGridData - Substrate Integration Hook
 *
 * Bridges MobX stores (TableCoreStore, VisualStateStore) to the substrate
 * (SharedWorker + OPFS sqlite + MobX Query layer). Provides reactive data
 * delivery and CRUD mutations.
 *
 * Architecture (post-GH#2806 P8 cutover):
 * - MobX stores manage UI state (filters, sorting, grouping config)
 * - useSubstrateGridRows pulls rows from the substrate Query and writes them
 *   directly to tableCoreStore via setSparseRows()
 * - Mutations route through substrateCreate / substrateUpdate / substrateDelete
 *   (oRPC). The substrate observes the change via server-emitted DataForge
 *   events and reconciles windowed rows via queryDelta.
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

import { useEffect, useMemo, useRef } from 'react'
import { getLogger } from '@/shared/lib/logging'
import type { TableCoreStore } from '../stores/TableCoreStore'
import type { InitStore } from '../stores/InitStore'
import type { VisualStateStore } from '../stores/VisualStateStore'
// GH#2806 P8: substrate is the unconditional VibeGrid data path. The legacy
// TanStack DB collection branch (useEntityCollection + useLiveQuery + JS
// filter/sort) has been removed; VibeGrid now sources rows exclusively from
// useSubstrateGridRows.
import {
  substrateCreate,
  substrateDelete,
  substrateUpdate,
} from '@/shared/data/query/substrate-mutations'
import { useSubstrateGridRows } from '@/shared/data/query/use-substrate-grid-rows'
import { useOrganization } from '@/app/stores'
import { useVibeGridStores } from '../stores/context'
import { armWedgeWatchdog } from '@/shared/data/db/sqlite/wedge-watchdog'

const logger = getLogger(['vibegrid', 'hooks', 'useVibeGridData'])

// ====================================
// TYPES
// ====================================

export interface VibeGridDataResult {
  /** Loading state */
  isLoading: boolean
  /**
   * GH#2806 P8: substrate is the only VibeGrid data source. The legacy
   * TanStack DB collection field is always `null`; kept on the result
   * shape so existing consumers (VibeGrid.tsx propagation to stores,
   * CommandBus undo/redo paths) compile without a wider refactor.
   * Those consumers all early-return when collection is falsy.
   */
  collection: any
  /** Create new entity */
  createEntity: (data: Record<string, any>) => void
  /** Update existing entity */
  updateEntity: (id: string, updates: Record<string, any>) => void
  /** Delete entity */
  deleteEntity: (id: string) => void
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
// MAIN HOOK
// ====================================

/**
 * Integrate MobX stores with the substrate.
 *
 * The substrate hook writes rows directly to TableCoreStore via setSparseRows().
 * This hook owns:
 *   - hydration state (initStore.markEntityDataKnownComplete())
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

  // Substrate is the unconditional read path for VibeGrid. The substrate hook
  // delivers rows via setSparseRows() and publishes count/serverTotalRows.
  // VibeGrid grid chrome (sort/filter/group/virtualization) operates on
  // tableCoreStore output regardless of source.
  const orgId = useOrganization()?.activeOrganizationId ?? null
  const useSubstrate = !skip && !collectionOverride
  const { viewportStore } = useVibeGridStores()
  const substrateState = useSubstrateGridRows(
    useSubstrate ? entityType : '',
    useSubstrate ? orgId : null,
    useSubstrate ? viewportStore : null,
    // Thread tableCoreStore through so the substrate hook delivers rows via
    // setSparseRows().
    useSubstrate ? tableCoreStore : null,
    // Thread visualStateStore so the substrate hook can push VibeGrid
    // sort/filter changes through to SQL via query.patch.
    useSubstrate ? visualStateStore : null,
  )

  // ====================================
  // PUSH DATA DIRECTLY TO MOBX STORE
  // ====================================
  // Hydration state for the substrate path (rows are written by
  // useSubstrateGridRows.setSparseRows() — no setRows call here).

  // Handle collectionOverride data push when skip mode is enabled
  // This allows components to provide mock data that still gets rendered
  useEffect(() => {
    if (!skip || !collectionOverride) return

    // If collectionOverride has items array, push them directly to the store
    const items = collectionOverride.items || collectionOverride
    if (Array.isArray(items) && items.length > 0) {
      logger.info('[useVibeGridData] 📊 Pushing collectionOverride items to store', {
        itemCount: items.length,
        entityType,
      })
      tableCoreStore.setRows(items)

      // Mark entity data as known-complete
      if (!initStore.entityDataKnownComplete) {
        initStore.markEntityDataKnownComplete()
      }
    }
  }, [skip, collectionOverride, tableCoreStore, initStore, entityType])

  // GH#3019 B10 — drive `markEntityDataKnownComplete()` from the unified
  // query layer's snapshot signals (`isComplete` + `source`) instead of the
  // pre-B8 ad-hoc `bounded && isReady` heuristic. A snapshot is
  // authoritatively complete when:
  //   - source is non-null (we received at least one snapshot), AND
  //   - response.isComplete === true (the adapter declared the dataset
  //     fully delivered through `cursor.start + records.length >= total`,
  //     or local-substrate equivalent).
  // Empty-but-authoritative entities (server returned `total: 0`) also
  // satisfy `isComplete: true` from the server adapter, so the renderer
  // can flip out of the hydration gate even with zero rows.
  useEffect(() => {
    if (skip || initStore.entityDataKnownComplete) return
    if (substrateState.source !== null && substrateState.isComplete) {
      initStore.markEntityDataKnownComplete()
    }
  }, [
    skip,
    initStore,
    substrateState.source,
    substrateState.isComplete,
  ])

  // ====================================
  // GH#2956 P1 — 8s GRACEFUL-DEGRADATION RENDER FALLBACK
  // ====================================
  // If at 8s post-mount substrate `isComplete` hasn't fired BUT the
  // server-adapter race in unified/query.ts has produced rows, flip
  // initStore.serverDataRendered to dismiss the skeleton overlay. The
  // wedge_watchdog (30s) below stays untouched and continues recovery in
  // the background — we are deliberately NOT calling
  // markEntityDataKnownComplete() here (that flag's contract is "substrate
  // authoritatively complete"; the timeout doesn't satisfy it). Logs a
  // structured warn so Loki can baseline wedge rate in production.
  //
  // Mirror live state into refs so the 8s timer reads CURRENT values at fire
  // time without re-arming on every observable snapshot (matches the
  // isReadyRef pattern below).
  const isCompleteRef = useRef(false)
  useEffect(() => {
    isCompleteRef.current = substrateState.isComplete
  }, [substrateState.isComplete])

  useEffect(() => {
    if (skip || !entityType || !orgId) return
    if (initStore.entityDataKnownComplete) return
    const id = window.setTimeout(() => {
      if (initStore.entityDataKnownComplete) return
      if (isCompleteRef.current) return
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
  // WEDGE WATCHDOG
  // ====================================
  // If the substrate fails to report `isReady` within the watchdog deadline,
  // the SharedWorker leader has wedged (heartbeat lost / WebLock stuck /
  // RPC hung). The watchdog trips a leader-bypass nuclear reset that tears
  // down OPFS + IDB + caches and force-reloads. Loop-guarded so a chronic
  // wedge doesn't put the user in an infinite reload spiral.

  // Mirror substrateState.isReady into a ref so the watchdog timer reads
  // the LIVE value at fire time, not what was snapshotted at arm time.
  const isReadyRef = useRef(false)
  useEffect(() => {
    isReadyRef.current = substrateState.isReady
  }, [substrateState.isReady])

  // Arm only on entity/org changes — re-arming on every isReady flip would
  // reset the deadline forever and the watchdog would never fire.
  useEffect(() => {
    if (skip || !entityType || !orgId) return
    const cancel = armWedgeWatchdog({ entityType, orgId, isReadyRef })
    return cancel
  }, [skip, entityType, orgId])

  // ====================================
  // CRUD MUTATIONS
  // ====================================

  const createEntity = useMemo(() => {
    return (data: Record<string, any>) => {
      // Substrate is unconditional; route through oRPC. The substrate
      // reconciles via queryDelta events.
      substrateCreate(entityType, data)
        .then((result) => {
          if (!result.success) {
            logger.error('Entity create failed (substrate)', { entityType, error: result.error })
            return
          }
          logger.info('Entity create persisted (substrate)', { entityType })
        })
        .catch((err: any) => {
          logger.error('Entity create threw (substrate)', {
            entityType,
            error: err instanceof Error ? err.message : String(err),
          })
        })
    }
  }, [entityType])

  const updateEntity = useMemo(() => {
    return (id: string, updates: Record<string, any>) => {
      substrateUpdate(entityType, String(id), updates)
        .then((result) => {
          if (!result.success) {
            logger.error('Entity update failed (substrate)', { entityType, id, error: result.error })
            return
          }
          logger.info('Entity update persisted (substrate)', { entityType, id })
        })
        .catch((err: any) => {
          logger.error('Entity update threw (substrate)', {
            entityType,
            id,
            error: err instanceof Error ? err.message : String(err),
          })
        })
    }
  }, [entityType])

  const deleteEntity = useMemo(() => {
    return (id: string) => {
      substrateDelete(entityType, String(id))
        .then((result) => {
          if (!result.success) {
            logger.error('Entity delete failed (substrate)', { entityType, id, error: result.error })
            return
          }
          logger.info('Entity delete persisted (substrate)', { entityType, id })
        })
        .catch((err: any) => {
          logger.error('Entity delete threw (substrate)', {
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
    isReady: substrateState.isReady,
    bounded: substrateState.bounded,
    count: substrateState.count,
  })

  return {
    isLoading: !substrateState.isReady,
    collection: null,
    createEntity,
    updateEntity,
    deleteEntity,
  }
}
