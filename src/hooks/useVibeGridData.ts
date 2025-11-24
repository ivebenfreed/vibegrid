/**
 * useVibeGridData - TanStack DB Integration Hook
 *
 * This hook bridges MobX stores (TableCoreStore, VisualStateStore) to TanStack DB,
 * providing reactive data queries with filters/sorting and CRUD mutations.
 *
 * Architecture:
 * - MobX stores manage UI state (filters, sorting, grouping config)
 * - This hook converts that state into TanStack DB queries
 * - Returns rows data and mutation functions
 * - Optimistic updates handled automatically by TanStack DB
 *
 * Usage:
 * ```typescript
 * const { rows, isLoading, createEntity, updateEntity, deleteEntity } =
 *   useVibeGridData(entityType, tableCoreStore, visualStateStore)
 * ```
 */

import { eq } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { useMemo } from 'react'
import { useEntityCollection } from '@/shared/data/db/hooks/useEntityCollection'
import { createLogger } from '@/shared/lib/logging'
import type { VisualStateStore } from '../stores/VisualStateStore'
import type { FilterConfig, SortConfig } from '../types'
import { useMobxSnapshot } from './useMobxSnapshot'

const log = createLogger('components/vibegrid/hooks/useVibeGridData')

// ====================================
// TYPES
// ====================================

export interface VibeGridDataResult {
  /** Filtered and sorted row data */
  rows: any[]
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
      log.warn('Unknown filter operator', { operator })
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
 * @param entityType - Entity type name (e.g., 'WorkTask')
 * @param visualStateStore - Store containing filters, sorting, grouping config
 * @returns Reactive data and CRUD mutations
 */
export function useVibeGridData(
  entityType: string,
  visualStateStore: VisualStateStore,
): VibeGridDataResult {
  // Get TanStack DB collection (shared singleton)
  const collection = useEntityCollection(entityType)

  // Get stable snapshots of MobX state for dependency tracking
  const filterSnapshot = useMobxSnapshot(() => visualStateStore.filters)
  const sortSnapshot = useMobxSnapshot(() => visualStateStore.sortBy)

  // Reactive query with filters applied
  const { data: rawRows } = useLiveQuery(
    (q: any) => {
      if (!collection) return undefined

      log.debug('Running live query', {
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
    [collection, filterSnapshot, sortSnapshot],
  )

  // Apply client-side sorting to results
  const sortedRows = useMemo(() => {
    if (!rawRows) return []
    return applySortingToRows(rawRows, sortSnapshot)
  }, [rawRows, sortSnapshot])

  // ====================================
  // CRUD MUTATIONS
  // ====================================

  const createEntity = useMemo(() => {
    return (data: Record<string, any>) => {
      if (!collection) {
        log.error('Cannot create: collection not loaded', { entityType })
        return
      }

      const tempId = `temp-${Date.now()}`
      const tx = collection.insert({
        id: tempId,
        ...data,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })

      log.info('Entity create initiated', { entityType, tempId })

      tx.isPersisted.promise
        .then(() => {
          log.info('Entity create persisted', { entityType, tempId })
        })
        .catch((error: any) => {
          log.error('Entity create failed', { entityType, tempId, error: error.message })
        })
    }
  }, [collection, entityType])

  const updateEntity = useMemo(() => {
    return (id: string, updates: Record<string, any>) => {
      if (!collection) {
        log.error('Cannot update: collection not loaded', { entityType })
        return
      }

      const tx = collection.update(String(id), (draft: any) => {
        Object.assign(draft, updates)
        draft.updatedAt = new Date().toISOString()
      })

      log.info('Entity update initiated', { entityType, id })

      tx.isPersisted.promise
        .then(() => {
          log.info('Entity update persisted', { entityType, id })
        })
        .catch((error: any) => {
          log.error('Entity update failed', { entityType, id, error: error.message })
        })
    }
  }, [collection, entityType])

  const deleteEntity = useMemo(() => {
    return (id: string) => {
      if (!collection) {
        log.error('Cannot delete: collection not loaded', { entityType })
        return
      }

      const tx = collection.delete(String(id))

      log.info('Entity delete initiated', { entityType, id })

      tx.isPersisted.promise
        .then(() => {
          log.info('Entity delete persisted', { entityType, id })
        })
        .catch((error: any) => {
          log.error('Entity delete failed', { entityType, id, error: error.message })
        })
    }
  }, [collection, entityType])

  // ====================================
  // RETURN RESULT
  // ====================================

  return {
    rows: sortedRows,
    isLoading: !collection || rawRows === undefined,
    collection,
    createEntity,
    updateEntity,
    deleteEntity,
  }
}
