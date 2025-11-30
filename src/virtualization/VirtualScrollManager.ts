/**
 * Virtual Scroll Manager - Legacy global state (DEPRECATED)
 *
 * ⚠️ DEPRECATED IN PHASE 6 ⚠️
 *
 * This file's global state has been replaced by VirtualViewportStore (MobX).
 * Functions are kept for backward compatibility but should not be used in new code.
 *
 * Migration:
 * - Old: updateVirtualViewport({ scrollTop, scrollLeft })
 * - New: virtualViewportStore.updateScroll(scrollTop, scrollLeft)
 *
 * Benefits of VirtualViewportStore:
 * - No global state (supports multiple grids)
 * - MobX reactivity (automatic updates)
 * - Computed visible ranges
 * - Better testing
 *
 * @deprecated Use VirtualViewportStore instead
 * @see src/systems/vibegrid/stores/VirtualViewportStore.ts
 */

import { getLogger } from '@/shared/lib/logging'
import { GRID_DIMENSIONS } from '../constants/grid-dimensions'
import type {
  CellCoordinates,
  ColumnLayout,
  RowLayout,
  VirtualBounds,
  VirtualViewport,
} from '../types/coordinate-types'
import { CoordinateUtils } from '../types/coordinate-types'

const fileLog = getLogger(['custom', 'vibegrid', 'virtualization', 'VirtualScrollManager.ts'])

// ====================================
// DEPRECATED: GLOBAL STATE
// ====================================
// ⚠️ These globals are deprecated - use VirtualViewportStore instead
// Kept for backward compatibility with existing code

let virtualBounds: VirtualBounds = {
  rowHeight: GRID_DIMENSIONS.ROW_HEIGHT,
  columnWidths: [],
  totalRows: 0,
  totalColumns: 0,
}

let virtualViewport: VirtualViewport = {
  scrollTop: 0,
  scrollLeft: 0,
  viewportWidth: 0,
  viewportHeight: 0,
}

let virtualColumnLayouts: ColumnLayout[] = []
let virtualRowLayouts: RowLayout[] = []

// ====================================
// UPDATE OPERATIONS (Working)
// ====================================

/**
 * Update virtual bounds when data changes
 */
export function updateVirtualBounds(options: {
  totalRows?: number
  columnWidths?: number[]
  rowHeight?: number
}): void {
  virtualBounds = {
    ...virtualBounds,
    ...options,
  }

  fileLog.debug('📊 Virtual bounds updated', {
    totalRows: options.totalRows ?? virtualBounds.totalRows,
    columnCount: options.columnWidths?.length ?? virtualBounds.columnWidths.length,
    rowHeight: options.rowHeight ?? virtualBounds.rowHeight,
  })
}

/**
 * Update viewport dimensions and scroll position
 */
export function updateVirtualViewport(options: {
  scrollTop?: number
  scrollLeft?: number
  viewportWidth?: number
  viewportHeight?: number
}): void {
  virtualViewport = {
    ...virtualViewport,
    ...options,
  }

  if (options.viewportWidth !== undefined || options.viewportHeight !== undefined) {
    fileLog.debug('📐 Virtual viewport updated', {
      viewportWidth: options.viewportWidth ?? virtualViewport.viewportWidth,
      viewportHeight: options.viewportHeight ?? virtualViewport.viewportHeight,
      scrollTop: options.scrollTop ?? virtualViewport.scrollTop,
      scrollLeft: options.scrollLeft ?? virtualViewport.scrollLeft,
    })
  }
}

/**
 * Update column layouts for accurate positioning
 */
export function updateVirtualColumns(columns: ColumnLayout[]): void {
  virtualColumnLayouts = columns

  const columnWidths = columns.map((col) => col.width)
  updateVirtualBounds({ columnWidths })

  fileLog.debug('📊 Virtual columns updated', {
    columnCount: columns.length,
    totalWidth: columnWidths.reduce((sum, w) => sum + w, 0),
  })
}

/**
 * Update row layouts for grouping support
 */
export function updateVirtualRows(rows: RowLayout[]): void {
  virtualRowLayouts = rows
  updateVirtualBounds({ totalRows: rows.length })

  fileLog.debug('📊 Virtual rows updated', {
    rowCount: rows.length,
    groupRows: rows.filter((r) => r.type === 'group').length,
  })
}

// ====================================
// DISABLED COMPUTED/OBSERVABLE FEATURES
// ====================================

/**
 * TODO-MOBX: This needs to be migrated to MobX computed
 * Temporarily returns a stub object
 */
export const virtualCellPosition$ = {
  get: () => ({
    getCellPositionByIds: (rowId: string, columnId: string): CellCoordinates | null => {
      // Stub implementation - returns null
      // TODO: Migrate to MobX computed
      return null
    },
  }),
}

// Scroll functions - disabled for now
export function scrollToRow(rowIndex: number): void {
  // TODO: Implement with MobX
  fileLog.warn('scrollToRow not yet migrated to MobX')
}

export function scrollToColumn(columnIndex: number): void {
  // TODO: Implement with MobX
  fileLog.warn('scrollToColumn not yet migrated to MobX')
}

export function getScrollBoundaries(): { maxScrollTop: number; maxScrollLeft: number } {
  // TODO: Implement with MobX
  return { maxScrollTop: 0, maxScrollLeft: 0 }
}

export function getVirtualCellPosition(cellKey: string): CellCoordinates | null {
  // TODO: Implement with MobX
  return null
}

export function needsVirtualization(): { rows: boolean; columns: boolean } {
  const ROW_THRESHOLD = 20
  const COLUMN_THRESHOLD = 15

  return {
    rows: virtualBounds.totalRows > ROW_THRESHOLD,
    columns: virtualBounds.columnWidths.length > COLUMN_THRESHOLD,
  }
}

export function getVirtualizationStats(): {
  totalCells: number
  renderedCells: number
  virtualizationRatio: number
  scrollPosition: { top: number; left: number }
} {
  const totalCells = virtualBounds.totalRows * virtualBounds.totalColumns

  return {
    totalCells,
    renderedCells: 0, // TODO: Calculate from virtualized range
    virtualizationRatio: 0,
    scrollPosition: {
      top: virtualViewport.scrollTop,
      left: virtualViewport.scrollLeft,
    },
  }
}
