/**
 * useRowExpansion Hook
 *
 * React hook for managing row expansion state and data loading.
 * Integrates with MobX stores and provides lazy loading with caching.
 *
 * GH#1240: VibeGrid Generic Row Expansion
 */

import { useCallback, useEffect } from 'react'
import { reaction } from 'mobx'
import { getLogger } from '@/shared/lib/logging'
import type { InteractionStore } from '../stores/InteractionStore'
import type { RowExpansionActions } from '../types/row-expansion'

const logger = getLogger(['vibegrid', 'hooks', 'useRowExpansion'])

// ====================================
// TYPES
// ====================================

export interface UseRowExpansionOptions {
  /** Whether row expansion is enabled */
  enabled?: boolean

  /** Allow multiple rows to be expanded simultaneously */
  allowMultiple?: boolean

  /** Data loader function for expanded content */
  loadData?: (rowId: string, rowData: unknown) => Promise<unknown[]>

  /** Cache TTL in milliseconds (default: 5 minutes) */
  cacheTTL?: number

  /** Callback when expansion state changes */
  onExpansionChange?: (expandedRowIds: Set<string>) => void

  /** Callback when data is loaded */
  onDataLoaded?: (rowId: string, data: unknown[]) => void

  /** Callback when data loading fails */
  onLoadError?: (rowId: string, error: Error) => void
}

export interface UseRowExpansionResult extends RowExpansionActions {
  /** Set of currently expanded row IDs */
  expandedRowIds: Set<string>

  /** Whether any rows are expanded */
  hasExpandedRows: boolean

  /** Number of expanded rows */
  expandedRowCount: number
}

// ====================================
// DEFAULT CACHE TTL
// ====================================

const DEFAULT_CACHE_TTL = 5 * 60 * 1000 // 5 minutes

// ====================================
// HOOK IMPLEMENTATION
// ====================================

/**
 * Hook for managing row expansion state and data loading.
 *
 * @param interactionStore - MobX InteractionStore instance
 * @param options - Configuration options
 * @returns Row expansion state and actions
 *
 * @example
 * ```tsx
 * const expansion = useRowExpansion(interactionStore, {
 *   enabled: true,
 *   loadData: async (rowId, rowData) => {
 *     return await fetchChildren(rowId)
 *   },
 * })
 *
 * // Toggle expansion
 * expansion.toggleRowExpansion(rowId)
 *
 * // Check if expanded
 * if (expansion.isRowExpanded(rowId)) {
 *   const data = expansion.getExpandedData(rowId)
 * }
 * ```
 */
export function useRowExpansion(
  interactionStore: InteractionStore,
  options: UseRowExpansionOptions = {},
): UseRowExpansionResult {
  const {
    enabled = true,
    allowMultiple = true,
    loadData,
    cacheTTL = DEFAULT_CACHE_TTL,
    onExpansionChange,
    onDataLoaded,
    onLoadError,
  } = options

  // ====================================
  // INITIALIZATION
  // ====================================

  useEffect(() => {
    logger.info('🔄 useRowExpansion effect running', {
      enabled,
      allowMultiple,
      currentRowExpansionEnabled: interactionStore.rowExpansionEnabled,
    })
    if (enabled) {
      interactionStore.enableRowExpansion(allowMultiple)
      logger.info('🔄 useRowExpansion: enabled row expansion', {
        rowExpansionEnabled: interactionStore.rowExpansionEnabled,
      })
    } else {
      interactionStore.disableRowExpansion()
      logger.info('🔄 useRowExpansion: disabled row expansion')
    }

    return () => {
      // Don't disable on unmount - let the store manage its own lifecycle
    }
  }, [enabled, allowMultiple, interactionStore])

  // ====================================
  // EXPANSION STATE CHANGE LISTENER
  // ====================================

  useEffect(() => {
    if (!onExpansionChange) return

    const disposer = reaction(
      () => interactionStore.expansionVersion,
      () => {
        onExpansionChange(interactionStore.expandedRowIds)
      },
    )

    return disposer
  }, [interactionStore, onExpansionChange])

  // ====================================
  // DATA LOADING
  // ====================================

  const loadExpandedData = useCallback(
    async (rowId: string, rowData: unknown) => {
      if (!loadData) {
        logger.debug('No loadData function provided, skipping data load', { rowId })
        return
      }

      // Check cache validity
      const existingState = interactionStore.expandedRowStates.get(rowId)
      if (existingState?.loadedAt) {
        const age = Date.now() - existingState.loadedAt
        if (age < cacheTTL && existingState.data !== null) {
          logger.debug('Using cached expanded data', { rowId, age })
          return
        }
      }

      // Set loading state
      interactionStore.setExpandedDataLoading(rowId)

      try {
        logger.debug('Loading expanded data', { rowId })
        const data = await loadData(rowId, rowData)

        interactionStore.setExpandedData(rowId, data, null)

        if (onDataLoaded) {
          onDataLoaded(rowId, data)
        }

        logger.debug('Expanded data loaded', { rowId, itemCount: data.length })
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error))

        interactionStore.setExpandedData(rowId, null, err)

        if (onLoadError) {
          onLoadError(rowId, err)
        }

        logger.error('Failed to load expanded data', { rowId, error: err.message })
      }
    },
    [loadData, cacheTTL, interactionStore, onDataLoaded, onLoadError],
  )

  // ====================================
  // ACTIONS
  // ====================================

  const expandRow = useCallback(
    (rowId: string, rowData?: unknown) => {
      interactionStore.expandRow(rowId)

      // Load data if we have a loader
      if (loadData && rowData !== undefined) {
        loadExpandedData(rowId, rowData)
      }
    },
    [interactionStore, loadData, loadExpandedData],
  )

  const collapseRow = useCallback(
    (rowId: string) => {
      interactionStore.collapseRow(rowId)
    },
    [interactionStore],
  )

  const toggleRowExpansion = useCallback(
    (rowId: string, rowData?: unknown) => {
      if (interactionStore.isRowExpanded(rowId)) {
        collapseRow(rowId)
      } else {
        expandRow(rowId, rowData)
      }
    },
    [interactionStore, expandRow, collapseRow],
  )

  const expandAll = useCallback(() => {
    // Note: This requires row IDs to be provided externally
    // The caller should use expandAllRows with the row IDs
    logger.warn('expandAll called without row IDs - use expandAllRows instead')
  }, [])

  const collapseAll = useCallback(() => {
    interactionStore.collapseAllRows()
  }, [interactionStore])

  const isRowExpanded = useCallback(
    (rowId: string) => {
      return interactionStore.isRowExpanded(rowId)
    },
    [interactionStore],
  )

  const getExpandedData = useCallback(
    (rowId: string) => {
      return interactionStore.getExpandedData(rowId)
    },
    [interactionStore],
  )

  const isExpandedDataLoading = useCallback(
    (rowId: string) => {
      return interactionStore.isExpandedDataLoading(rowId)
    },
    [interactionStore],
  )

  const refreshExpandedData = useCallback(
    async (rowId: string, rowData?: unknown) => {
      // Clear cache for this row
      interactionStore.clearExpandedDataCache(rowId)

      // Reload if expanded
      if (interactionStore.isRowExpanded(rowId) && loadData && rowData !== undefined) {
        await loadExpandedData(rowId, rowData)
      }
    },
    [interactionStore, loadData, loadExpandedData],
  )

  // ====================================
  // RETURN RESULT
  // ====================================

  return {
    // State
    expandedRowIds: interactionStore.expandedRowIds,
    hasExpandedRows: interactionStore.hasExpandedRows,
    expandedRowCount: interactionStore.expandedRowCount,

    // Actions
    expandRow,
    collapseRow,
    toggleRowExpansion,
    expandAll,
    collapseAll,
    isRowExpanded,
    getExpandedData,
    isExpandedDataLoading,
    refreshExpandedData,
  }
}

export default useRowExpansion
