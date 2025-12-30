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
}

// ====================================
// FILTER APPLICATION
// ====================================

/**
 * Apply a single filter to a TanStack DB query
 */
function applyFilterToQuery(
  query: any,
  filter: FilterConfig,
  collectionAlias: string = 'entity',
): any {
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
        return (
          !fieldValue || !String(fieldValue).toLowerCase().includes(String(value).toLowerCase())
        )
      })

    case 'starts_with':
      return query.where((refs: any) => {
        const fieldValue = refs[collectionAlias][field]
        return (
          fieldValue && String(fieldValue).toLowerCase().startsWith(String(value).toLowerCase())
        )
      })

    case 'ends_with':
      return query.where((refs: any) => {
        const fieldValue = refs[collectionAlias][field]
        return fieldValue && String(fieldValue).toLowerCase().endsWith(String(value).toLowerCase())
      })

    case 'greater_than':
      return query.where((refs: any) => refs[collectionAlias][field] > value)

    case 'less_than':
      return query.where((refs: any) => refs[collectionAlias][field] < value)

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
        return Array.isArray(value) && value.includes(fieldValue)
      })

    case 'not_in':
      return query.where((refs: any) => {
        const fieldValue = refs[collectionAlias][field]
        return !Array.isArray(value) || !value.includes(fieldValue)
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
function applyAllFilters(
  query: any,
  filters: FilterConfig[],
  collectionAlias: string = 'entity',
): any {
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
 * @param options - Optional config (skip: true for mock data mode)
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
  // Get TanStack DB collection (shared singleton)
  const collection = useEntityCollection(entityType)

  // Get stable snapshots of MobX state for dependency tracking
  const filterSnapshot = useMobxSnapshot(() => visualStateStore.filters)
  const sortSnapshot = useMobxSnapshot(() => visualStateStore.sortBy)

  // Track if initial data has been pushed to avoid duplicate markReady calls
  const hasMarkedReadyRef = useRef(false)

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

      // Apply filters
      if (filterSnapshot.length > 0) {
        query = applyAllFilters(query, filterSnapshot, 'entity')
      }

      // CRITICAL FIX: Select with spread to dereference the entity data
      // Without spreading, we get references {path: ..., type: 'ref'} instead of actual data
      return query.select(({ entity }: any) => ({ ...entity }))
    },
    [skip, collection, filterSnapshot, sortSnapshot],
  )

  // Apply client-side sorting to results
  const sortedRows = useMemo(() => {
    if (!rawRows) return []
    return applySortingToRows(rawRows, sortSnapshot)
  }, [rawRows, sortSnapshot])

  // ====================================
  // PUSH DATA DIRECTLY TO MOBX STORE
  // ====================================
  // This replaces the useEffect bridge in VibeGrid.tsx
  // TanStack DB maintains stable references, so this only fires on actual data changes
  const prevRowsRef = useRef<any[]>([])

  useEffect(() => {
    // Skip data push in mock mode (MockDataInjector handles this)
    if (skip) return

    // Don't push data while loading
    if (queryLoading) return

    // OPTIMIZATION: Skip if rows array reference is the same (TanStack stable refs)
    // This prevents duplicate updates when server echo returns same data
    if (sortedRows === prevRowsRef.current) {
      logger.debug('[useVibeGridData] ⏭️ Skipping setRows - same reference')
      return
    }
    prevRowsRef.current = sortedRows

    // Push rows directly to MobX store
    // The store's setRows() has hash-based change detection that will
    // skip redundant updates (e.g., server echo after optimistic update)
    tableCoreStore.setRows(sortedRows)

    // Mark entity data as loaded on first successful push
    if (!hasMarkedReadyRef.current && !initStore.hydrationState.entityDataLoaded) {
      initStore.markReady('entityDataLoaded')
      hasMarkedReadyRef.current = true
      logger.info('[useVibeGridData] 📊 Entity data initially loaded', {
        rowCount: sortedRows.length,
      })
    } else {
      logger.debug('[useVibeGridData] 📊 Entity data updated', {
        rowCount: sortedRows.length,
      })
    }
  }, [skip, sortedRows, queryLoading, tableCoreStore, initStore])

  // ====================================
  // CRUD MUTATIONS
  // ====================================

  const createEntity = useMemo(() => {
    return (data: Record<string, any>) => {
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
