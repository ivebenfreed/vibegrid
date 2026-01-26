/**
 * Row Expansion Processor
 *
 * Processes rows and inserts virtual expanded content rows
 * after each expanded row.
 *
 * GH#1240: VibeGrid Generic Row Expansion
 */

import { getLogger } from '@/shared/lib/logging'
import type { VirtualRow } from '../types'
import type { ExpandedContentVirtualRow, RowExpansionConfig } from '../types/row-expansion'

/** State stored in InteractionStore (without rowId since it's the map key) */
type ExpandedStateEntry = {
  data: unknown[] | null
  isLoading: boolean
  error: Error | null
  loadedAt: number | null
}

const logger = getLogger(['vibegrid', 'RowExpansionProcessor'])

// ====================================
// CONSTANTS
// ====================================

/** Default height for expanded content rows */
const DEFAULT_EXPANDED_CONTENT_HEIGHT = 200

/** Minimum height for expanded content */
const MIN_EXPANDED_CONTENT_HEIGHT = 100

// ====================================
// ROW EXPANSION PROCESSOR FUNCTIONS
// ====================================

/**
 * Calculate height for expanded content row
 */
export function calculateExpandedHeight(
  rowId: string,
  rowData: unknown,
  config: RowExpansionConfig,
): number {
  const { expandedContentHeight = DEFAULT_EXPANDED_CONTENT_HEIGHT } = config

  if (typeof expandedContentHeight === 'function') {
    const calculatedHeight = expandedContentHeight(rowId, rowData)
    return Math.max(calculatedHeight, MIN_EXPANDED_CONTENT_HEIGHT)
  }

  if (expandedContentHeight === 'auto') {
    // Auto height is handled by the renderer
    // Return a reasonable default for virtualization calculations
    return DEFAULT_EXPANDED_CONTENT_HEIGHT
  }

  return Math.max(expandedContentHeight, MIN_EXPANDED_CONTENT_HEIGHT)
}

/** Height per row in sub-table (header + rows) */
const SUB_TABLE_HEADER_HEIGHT = 40
const SUB_TABLE_ROW_HEIGHT = 32
const SUB_TABLE_PADDING = 24

/**
 * Create an expanded content virtual row
 */
export function createExpandedContentRow(
  parentRow: VirtualRow,
  state: ExpandedStateEntry | null,
  config: RowExpansionConfig,
): ExpandedContentVirtualRow {
  // Calculate height based on expanded data count
  let height: number
  const dataRowCount = state?.data && Array.isArray(state.data) ? state.data.length : 0
  console.log('📐 [RowExpansionProcessor] Height calculation', {
    rowId: parentRow.id,
    hasState: !!state,
    hasData: !!state?.data,
    dataRowCount,
    isLoading: state?.isLoading,
  })
  if (dataRowCount > 0) {
    // Dynamic height: header + rows + padding
    height = SUB_TABLE_HEADER_HEIGHT + dataRowCount * SUB_TABLE_ROW_HEIGHT + SUB_TABLE_PADDING
    // Cap at reasonable max
    height = Math.min(height, 400)
    console.log('📐 [RowExpansionProcessor] Calculated dynamic height', { height, dataRowCount })
  } else {
    // Use config height for loading/empty states
    height = calculateExpandedHeight(parentRow.id, parentRow.data, config)
    console.log('📐 [RowExpansionProcessor] Using default height', { height })
  }

  return {
    id: `${parentRow.id}:expanded`,
    type: 'expanded-content',
    data: null,
    height,
    offset: 0, // Will be recalculated by virtualization
    index: -1, // Will be recalculated
    parentRowId: parentRow.id,
    expandedData: state?.data ?? null,
    isLoading: state?.isLoading ?? true,
    error: state?.error ?? null,
  }
}

/**
 * Process virtual rows and insert expanded content rows
 *
 * @param virtualRows - Array of virtual rows to process
 * @param expandedRowIds - Set of currently expanded row IDs
 * @param expandedRowStates - Map of expanded row states (loading/data/error)
 * @param config - Row expansion configuration
 * @returns Processed virtual rows with expanded content rows inserted
 */
export function processExpandedRows(
  virtualRows: VirtualRow[],
  expandedRowIds: Set<string>,
  expandedRowStates: Map<string, ExpandedStateEntry>,
  config: RowExpansionConfig,
): VirtualRow[] {
  if (!config.enabled || expandedRowIds.size === 0) {
    return virtualRows
  }

  logger.debug('Processing expanded rows', {
    inputRows: virtualRows.length,
    expandedCount: expandedRowIds.size,
  })

  const result: VirtualRow[] = []

  for (const row of virtualRows) {
    // Add the original row
    result.push(row)

    // Check if this row should have expanded content
    if (row.type === 'data' && expandedRowIds.has(row.id)) {
      const expandedState = expandedRowStates.get(row.id)
      const expandedRow = createExpandedContentRow(row, expandedState ?? null, config)
      result.push(expandedRow)
    }
  }

  logger.debug('Processed expanded rows', {
    inputRows: virtualRows.length,
    outputRows: result.length,
    expandedContentRows: result.length - virtualRows.length,
  })

  return result
}

/**
 * Recalculate row offsets after expansion changes
 */
export function recalculateRowOffsets(virtualRows: VirtualRow[]): VirtualRow[] {
  let currentOffset = 0

  return virtualRows.map((row, index) => ({
    ...row,
    index,
    offset: (() => {
      const offset = currentOffset
      currentOffset += row.height
      return offset
    })(),
  }))
}

/**
 * Find parent row ID for an expanded content row
 */
export function getParentRowId(expandedContentRowId: string): string | null {
  if (expandedContentRowId.endsWith(':expanded')) {
    return expandedContentRowId.slice(0, -':expanded'.length)
  }
  return null
}

/**
 * Check if a row ID represents expanded content
 */
export function isExpandedContentRowId(rowId: string): boolean {
  return rowId.endsWith(':expanded')
}

/**
 * Get the total height of all expanded content rows
 */
export function getTotalExpandedHeight(
  expandedRowIds: Set<string>,
  expandedRowStates: Map<string, ExpandedStateEntry>,
  config: RowExpansionConfig,
): number {
  let totalHeight = 0

  for (const rowId of expandedRowIds) {
    const state = expandedRowStates.get(rowId)
    totalHeight += calculateExpandedHeight(rowId, state?.data, config)
  }

  return totalHeight
}

/**
 * Filter expanded rows based on visibility
 * (used when rows are filtered/searched)
 */
export function filterExpandedRows(
  expandedRowIds: Set<string>,
  visibleRowIds: Set<string>,
): Set<string> {
  const filteredExpanded = new Set<string>()

  for (const rowId of expandedRowIds) {
    if (visibleRowIds.has(rowId)) {
      filteredExpanded.add(rowId)
    }
  }

  return filteredExpanded
}

/**
 * Get row indices that include expanded content
 * (for keyboard navigation)
 */
export function getNavigableRowIndices(
  virtualRows: VirtualRow[],
  skipExpandedContent = false,
): number[] {
  return virtualRows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => {
      if (skipExpandedContent && row.type === 'expanded-content') {
        return false
      }
      return row.type === 'data' || row.type === 'expanded-content'
    })
    .map(({ index }) => index)
}
