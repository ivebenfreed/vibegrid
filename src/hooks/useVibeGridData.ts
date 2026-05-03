/**
 * useVibeGridData - TanStack DB Integration Hook
 *
 * This hook bridges MobX stores (TableCoreStore, VisualStateStore) to TanStack DB,
 * providing reactive data queries with filters/sorting and CRUD mutations.
 *
 * Architecture:
 * - MobX stores manage UI state (filters, sorting, grouping config)
 * - This hook converts that state into TanStack DB queries
 * - Pushes data DIRECTLY to TableCoreStore.setRows() - no React effect bridge needed
 * - Optimistic updates handled automatically by TanStack DB
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

import { eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { useEffect, useMemo, useRef } from 'react'
import { useEntityCollection } from '@/shared/data/db/hooks/useEntityCollection'
import { getLogger } from '@/shared/lib/logging'
import type { TableCoreStore } from '../stores/TableCoreStore'
import type { InitStore } from '../stores/InitStore'
import type { VisualStateStore } from '../stores/VisualStateStore'
import type { FilterConfig, SortConfig } from '../types'
import { useMobxSnapshot } from './useMobxSnapshot'
// GH#2804 — when ?ff=substrate is on for a substrate-owned entity, VibeGrid
// sources rows from the substrate Query directly. Production
// useEntityCollection/useLiveQuery path is short-circuited so the data
// layer is genuinely swapped (not run alongside).
import {
  isSubstrateEnabled,
  isSubstrateOwnedEntity,
} from '@/shared/data/query/feature-flag'
// GH#2812 A1: in substrate mode the TanStack DB collection is empty, so
// collection.insert/update/delete throws or no-ops. Route mutations through
// oRPC and let queryDelta + setSparseRows reconcile.
import {
  shouldUseSubstrateWrite,
  substrateCreate,
  substrateDelete,
  substrateUpdate,
} from '@/shared/data/query/substrate-mutations'
import { useSubstrateGridRows } from '@/shared/data/query/use-substrate-grid-rows'
import { useOrganization } from '@/app/stores'
import { useVibeGridStores } from '../stores/context'

const logger = getLogger(['vibegrid', 'hooks', 'useVibeGridData'])

// ====================================
// TYPES
// ====================================

export interface VibeGridDataResult {
  /** Loading state */
  isLoading: boolean
  /** TanStack DB collection instance */
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
  /** Collection override for mock testing (bypasses useEntityCollection) */
  collectionOverride?: any
  /**
   * System-level row predicate applied before user-visible filters.
   * Rows returning false are hidden from the grid (not shown in filter bar).
   * Use for structural exclusions like upload-pending entities.
   */
  systemPredicate?: (row: any) => boolean
}

// ====================================
// FILTER APPLICATION
// ====================================

/**
 * Apply a single filter to a TanStack DB query
 */
function applyFilterToQuery(query: any, filter: FilterConfig, collectionAlias: string = 'entity'): any {
  const { field, operator, value } = filter

  switch (operator) {
    case 'equals':
      return query.where((refs: any) => eq(refs[collectionAlias][field], value))

    case 'not_equals':
      return query.where((refs: any) => refs[collectionAlias][field] !== value)

    case 'contains':
      // For TanStack DB, we need to use a custom filter function
      return query.where((refs: any) => {
        const fieldValue = refs[collectionAlias][field]
        return fieldValue && String(fieldValue).toLowerCase().includes(String(value).toLowerCase())
      })

    case 'not_contains':
      return query.where((refs: any) => {
        const fieldValue = refs[collectionAlias][field]
        return !fieldValue || !String(fieldValue).toLowerCase().includes(String(value).toLowerCase())
      })

    case 'starts_with':
      return query.where((refs: any) => {
        const fieldValue = refs[collectionAlias][field]
        return fieldValue && String(fieldValue).toLowerCase().startsWith(String(value).toLowerCase())
      })

    case 'ends_with':
      return query.where((refs: any) => {
        const fieldValue = refs[collectionAlias][field]
        return fieldValue && String(fieldValue).toLowerCase().endsWith(String(value).toLowerCase())
      })

    case 'greater_than':
      return query.where((refs: any) => value != null && refs[collectionAlias][field] > value)

    case 'less_than':
      return query.where((refs: any) => value != null && refs[collectionAlias][field] < value)

    case 'is_empty':
      return query.where((refs: any) => {
        const fieldValue = refs[collectionAlias][field]
        return fieldValue === null || fieldValue === undefined || fieldValue === ''
      })

    case 'is_not_empty':
      return query.where((refs: any) => {
        const fieldValue = refs[collectionAlias][field]
        return fieldValue !== null && fieldValue !== undefined && fieldValue !== ''
      })

    case 'in':
      return query.where((refs: any) => {
        const fieldValue = refs[collectionAlias][field]
        return Array.isArray(value) && (value as unknown[]).includes(fieldValue)
      })

    case 'not_in':
      return query.where((refs: any) => {
        const fieldValue = refs[collectionAlias][field]
        return !Array.isArray(value) || !(value as unknown[]).includes(fieldValue)
      })

    case 'regex':
      return query.where((refs: any) => {
        const fieldValue = refs[collectionAlias][field]
        try {
          const regex = new RegExp(String(value))
          return regex.test(String(fieldValue))
        } catch {
          return false
        }
      })

    default:
      logger.warn('Unknown filter operator', { operator })
      return query
  }
}

/**
 * Apply all filters to a TanStack DB query
 */
function applyAllFilters(query: any, filters: FilterConfig[], collectionAlias: string = 'entity'): any {
  let filteredQuery = query

  filters.forEach((filter) => {
    filteredQuery = applyFilterToQuery(filteredQuery, filter, collectionAlias)
  })

  return filteredQuery
}

// ====================================
// SORTING APPLICATION
// ====================================

/**
 * Apply sorting to a TanStack DB query
 *
 * Note: TanStack DB queries handle sorting through orderBy().
 * For client-side sorting, we'll apply it in post-processing.
 */
function applySortingToRows(rows: any[], sortBy: SortConfig[]): any[] {
  if (!sortBy || sortBy.length === 0) return rows

  return [...rows].sort((a, b) => {
    for (const sort of sortBy) {
      const aVal = a[sort.field]
      const bVal = b[sort.field]

      if (aVal === bVal) continue

      const comparison = aVal < bVal ? -1 : 1
      return sort.direction === 'asc' ? comparison : -comparison
    }
    return 0
  })
}

// ====================================
// MAIN HOOK
// ====================================

/**
 * Integrate MobX stores with TanStack DB
 *
 * This hook writes directly to TableCoreStore.setRows() when TanStack DB data changes.
 * The parent component should NOT use a useEffect to bridge rows - that's handled here.
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
  const systemPredicate = options?.systemPredicate

  // GH#2804 — substrate-owned entity short-circuit. When the flag is on
  // AND the entity is owned by the substrate, source rows from the Query
  // class directly. Skip the entire TanStack DB path. Production grid
  // chrome (sort/filter/group/virtualization) keeps working because it
  // operates on tableCoreStore.setRows() output regardless of source.
  const orgId = useOrganization()?.activeOrganizationId ?? null
  const useSubstrate = isSubstrateEnabled() && isSubstrateOwnedEntity(entityType) && !skip && !collectionOverride
  // GH#2804 B5: thread viewportStore through so the substrate hook can
  // publish `query.count` to `viewportStore.serverTotalRows`. This decouples
  // VibeGrid's totalRows-derived UI (GridLineCanvas, "X of Y" labels) from
  // the windowed `rawRows.length` once cursor-bounded mode lands in p4/p5.
  const { viewportStore } = useVibeGridStores()
  const substrateState = useSubstrateGridRows(
    useSubstrate ? entityType : '',
    useSubstrate ? orgId : null,
    useSubstrate ? viewportStore : null,
    // GH#2804 p4: thread tableCoreStore through so the substrate hook
    // delivers rows via `setSparseRows()`. The hook writes directly; this
    // hook's `setRows` push path is skipped via the `bounded` flag below.
    useSubstrate ? tableCoreStore : null,
    // GH#2804 p5 (B11): thread visualStateStore so the substrate hook can
    // push VibeGrid sort/filter changes through to SQL via query.patch.
    useSubstrate ? visualStateStore : null,
  )

  // Get TanStack DB collection (shared singleton) or use override for mock testing
  const apiCollection = useEntityCollection(entityType)
  const collection = collectionOverride ?? apiCollection

  // Get stable snapshots of MobX state for dependency tracking
  const filterSnapshot = useMobxSnapshot(() => visualStateStore.filters)
  const sortSnapshot = useMobxSnapshot(() => visualStateStore.sortBy)

  // Timer ref for empty collection fallback
  const emptyCollectionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Reactive query with filters applied
  // Use proper isLoading from useLiveQuery instead of computing manually
  // When skip=true, return undefined to bypass data fetching (for mock data mode)
  const {
    data: rawRows,
    isLoading: queryLoading,
    status: queryStatus,
  } = useLiveQuery(
    (q: any) => {
      // Skip data fetching when in mock mode
      if (skip) return undefined
      if (!collection) return undefined

      logger.debug('Running live query', {
        entityType,
        filterCount: filterSnapshot.length,
        sortCount: sortSnapshot.length,
      })

      // Start with base query
      let query = q.from({ entity: collection })

      // Apply filters. GH#2804 p5 (B11): for substrate-owned entities, the
      // filter is pushed to SQL via `query.patch({filter})` (see
      // `useSubstrateGridRows`). The TanStack DB path's filtered result is
      // unused for substrate-owned entities (sourceRows comes from
      // substrateState) — skip to avoid double-processing.
      const skipJsFilter = useSubstrate && isSubstrateOwnedEntity(entityType)
      if (filterSnapshot.length > 0 && !skipJsFilter) {
        query = applyAllFilters(query, filterSnapshot, 'entity')
      }

      // CRITICAL FIX: Select with spread to dereference the entity data
      // Without spreading, we get references {path: ..., type: 'ref'} instead of actual data
      return query.select(({ entity }: any) => ({ ...entity }))
    },
    [skip, collection, filterSnapshot, sortSnapshot],
  )

  // Apply client-side sorting to results.
  // GH#2804 p5 (B11): for substrate-owned entities, sort is pushed to SQL
  // via `query.patch({sort})`. The TanStack DB path is unused (sourceRows
  // comes from substrateState below) but useLiveQuery still runs — skip
  // the JS sort to save work and avoid double-processing semantics drift.
  const sortedRows = useMemo(() => {
    if (!rawRows) return []
    const filtered = systemPredicate ? rawRows.filter(systemPredicate) : rawRows
    if (useSubstrate && isSubstrateOwnedEntity(entityType)) {
      return filtered
    }
    return applySortingToRows(filtered, sortSnapshot)
  }, [rawRows, sortSnapshot, systemPredicate, useSubstrate, entityType])

  // ====================================
  // PUSH DATA DIRECTLY TO MOBX STORE
  // ====================================
  // This replaces the useEffect bridge in VibeGrid.tsx
  // TanStack DB maintains stable references, so this only fires on actual data changes
  const prevRowsRef = useRef<any[]>([])

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

      // Mark entity data as loaded
      if (!initStore.hydrationState.entityDataLoaded) {
        initStore.markReady('entityDataLoaded')
      }
    }
  }, [skip, collectionOverride, tableCoreStore, initStore, entityType])

  useEffect(() => {
    // Skip data push in mock mode when NOT using collectionOverride
    // (collectionOverride is handled by the effect above)
    if (skip) return

    // GH#2804 — substrate path: bypass TanStack DB sortedRows entirely and
    // push the substrate Query's rows. Filter + sort apply to substrate
    // rows the same way (plain objects with the entity's data shape).
    const sourceRows = useSubstrate ? substrateState.rows : sortedRows
    const sourceLoading = useSubstrate ? !substrateState.isReady : queryLoading

    // GH#2804 p4: in cursor-bounded mode the substrate hook writes rows
    // directly via `setSparseRows()` (with placeholders for unloaded
    // indices). Calling `setRows()` here would clobber the sparse window
    // with a dense windowed array. Mark hydrated and bail.
    if (useSubstrate && substrateState.bounded) {
      if (!initStore.hydrationState.entityDataLoaded && substrateState.isReady && substrateState.count > 0) {
        if (emptyCollectionTimerRef.current) {
          clearTimeout(emptyCollectionTimerRef.current)
          emptyCollectionTimerRef.current = null
        }
        initStore.markReady('entityDataLoaded')
      }
      return
    }

    // Don't push data while loading
    if (sourceLoading) return

    // OPTIMIZATION: Skip if rows array reference is the same (stable refs)
    if (sourceRows === prevRowsRef.current) {
      logger.debug('[useVibeGridData] ⏭️ Skipping setRows - same reference')
      return
    }
    prevRowsRef.current = sourceRows

    // Apply systemPredicate and sort for substrate rows (TanStack DB path
    // already did this via sortedRows).
    //
    // GH#2804 p5 (B11): for substrate-owned entities, sort+filter are pushed
    // to SQL via `query.patch({sort, filter})`. JS-side `applySortingToRows`
    // would double-process already-server-sorted rows. Skip it.
    let pushRows = sourceRows
    if (useSubstrate) {
      const filtered = systemPredicate ? sourceRows.filter(systemPredicate) : sourceRows
      pushRows = isSubstrateOwnedEntity(entityType)
        ? filtered
        : applySortingToRows(filtered, sortSnapshot)
    }

    // Push rows directly to MobX store
    // The store's setRows() has hash-based change detection that will
    // skip redundant updates (e.g., server echo after optimistic update)
    tableCoreStore.setRows(pushRows)

    // Mark entity data as loaded on first push with actual data.
    // Don't mark on empty results - TanStack DB's useLiveQuery resolves the local
    // query immediately (returning []) before the server sync delivers real data.
    // Marking entityDataLoaded here would cause isFullyHydrated → true → skeleton
    // disappears while the grid body is still empty. (GH#1413)
    if (!initStore.hydrationState.entityDataLoaded) {
      if (pushRows.length > 0) {
        // Clear the empty-collection fallback timer since we got real data
        if (emptyCollectionTimerRef.current) {
          clearTimeout(emptyCollectionTimerRef.current)
          emptyCollectionTimerRef.current = null
        }
        initStore.markReady('entityDataLoaded')
        logger.info('[useVibeGridData] 📊 Entity data initially loaded', {
          rowCount: sortedRows.length,
        })
      } else {
        logger.debug('[useVibeGridData] ⏳ Empty data push, waiting for server sync', {
          entityType,
        })
      }
    } else {
      logger.debug('[useVibeGridData] 📊 Entity data updated', {
        rowCount: sortedRows.length,
      })
    }
  }, [
    skip,
    sortedRows,
    queryLoading,
    tableCoreStore,
    initStore,
    entityType,
    sortSnapshot,
    systemPredicate,
    // GH#2804 — when substrate is the source, deps must observe its rows +
    // isReady so the push effect fires on each delta replace.
    useSubstrate,
    substrateState.rows,
    substrateState.isReady,
    // GH#2804 p4: bounded-mode delivery happens inside useSubstrateGridRows.
    // Re-evaluate this push effect when bounded state flips (e.g., flag
    // change on URL navigation) so we don't incorrectly call setRows.
    substrateState.bounded,
    substrateState.count,
  ])

  // Fallback: For legitimately empty collections, mark entityDataLoaded after a delay.
  // When the server returns 0 records, sortedRows stays [] and the condition above
  // never fires. This timeout ensures the skeleton eventually disappears.
  useEffect(() => {
    if (skip || initStore.hydrationState.entityDataLoaded) return

    emptyCollectionTimerRef.current = setTimeout(() => {
      if (!initStore.hydrationState.entityDataLoaded) {
        initStore.markReady('entityDataLoaded')
        logger.info('[useVibeGridData] 📊 Entity data marked loaded (empty collection fallback)', {
          entityType,
        })
      }
    }, 5000)

    return () => {
      if (emptyCollectionTimerRef.current) {
        clearTimeout(emptyCollectionTimerRef.current)
        emptyCollectionTimerRef.current = null
      }
    }
  }, [skip, initStore, entityType])

  // ====================================
  // CRUD MUTATIONS
  // ====================================

  const createEntity = useMemo(() => {
    return (data: Record<string, any>) => {
      // GH#2812 A1: substrate-owned entities have an empty TanStack DB
      // collection. Route through oRPC; the substrate reconciles via
      // queryDelta events.
      if (shouldUseSubstrateWrite(entityType)) {
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
        return
      }

      if (!collection) {
        logger.error('Cannot create: collection not loaded', { entityType })
        return
      }

      const tempId = `temp-${Date.now()}`
      const tx = collection.insert({
        id: tempId,
        ...data,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })

      logger.info('Entity create initiated', { entityType, tempId })

      tx.isPersisted.promise
        .then(() => {
          logger.info('Entity create persisted', { entityType, tempId })
        })
        .catch((error: any) => {
          logger.error('Entity create failed', { entityType, tempId, error: error.message })
        })
    }
  }, [collection, entityType])

  const updateEntity = useMemo(() => {
    return (id: string, updates: Record<string, any>) => {
      // GH#2812 A1: substrate-owned entities — go through oRPC, not
      // collection.update (collection is empty in bounded substrate mode).
      if (shouldUseSubstrateWrite(entityType)) {
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
        return
      }

      if (!collection) {
        logger.error('Cannot update: collection not loaded', { entityType })
        return
      }

      const tx = collection.update(String(id), (draft: any) => {
        Object.assign(draft, updates)
        draft.updatedAt = new Date().toISOString()
      })

      logger.info('Entity update initiated', { entityType, id })

      tx.isPersisted.promise
        .then(() => {
          logger.info('Entity update persisted', { entityType, id })
        })
        .catch((error: any) => {
          logger.error('Entity update failed', { entityType, id, error: error.message })
        })
    }
  }, [collection, entityType])

  const deleteEntity = useMemo(() => {
    return (id: string) => {
      // GH#2812 A1: substrate-owned entities — go through oRPC, not
      // collection.delete (collection is empty in bounded substrate mode).
      if (shouldUseSubstrateWrite(entityType)) {
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
        return
      }

      if (!collection) {
        logger.error('Cannot delete: collection not loaded', { entityType })
        return
      }

      const tx = collection.delete(String(id))

      logger.info('Entity delete initiated', { entityType, id })

      tx.isPersisted.promise
        .then(() => {
          logger.info('Entity delete persisted', { entityType, id })
        })
        .catch((error: any) => {
          logger.error('Entity delete failed', { entityType, id, error: error.message })
        })
    }
  }, [collection, entityType])

  // ====================================
  // RETURN RESULT
  // ====================================

  // Log loading state for debugging
  logger.debug('useVibeGridData loading state', {
    entityType,
    hasCollection: !!collection,
    queryLoading,
    queryStatus,
    rowCount: sortedRows.length,
    rawRowsUndefined: rawRows === undefined,
  })

  return {
    // NOTE: rows are NOT returned - they're pushed directly to tableCoreStore.setRows()
    // This avoids the need for a useEffect bridge in the parent component
    isLoading: !collection || queryLoading,
    collection,
    createEntity,
    updateEntity,
    deleteEntity,
  }
}
