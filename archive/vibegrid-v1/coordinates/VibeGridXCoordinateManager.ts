// ====================================
// VIBEGRIDX COORDINATE MANAGER
// ====================================
//
// Central source of truth for all table element positioning.
// Handles both absolute positions (in full scrollable content) and
// viewport-relative positions for virtualized rendering.
//
// IMPORTANT: Row order must be updated by the renderer after sorting
// to ensure canvas overlays match the visual DOM. The renderer calls
// updateRows() with the sorted row order during initialize() and render().
//
// Flow:
// 1. Table machine initializes with columns
// 2. Entity data loaded (unsorted)
// 3. Renderer receives sorted data and updates coordinate manager
// 4. Canvas overlays use coordinate manager for positioning
//
// ====================================

import { log } from '@/logger'
import type { CellRef, Column, TableRow, ViewportInfo } from '../types'

const fileLog = log('components/custom/vibegrid/coordinates/VibeGridXCoordinateManager.ts')

export interface CoordinatePosition {
  rowIndex: number
  columnIndex: number
}

export interface ViewportAwarePosition {
  absolute: { x: number; y: number } // Position in full content
  viewport: { x: number; y: number } | null // Position in viewport (null if not visible)
  isVisible: boolean
}

export interface RowMapping {
  rowId: string
  originalIndex: number
  sortedIndex: number
}

export interface ColumnMapping {
  columnId: string
  index: number
  offset: number
  width: number
}

export interface CoordinateChangeEvent {
  type: 'sort-changed' | 'data-changed' | 'columns-changed'
  oldMapping: CoordinateMapping
  newMapping: CoordinateMapping
  timestamp: number
}

export interface CoordinateMapping {
  rows: RowMapping[]
  columns: ColumnMapping[]
  version: number
  sortBy: Array<{ field: string; direction: 'asc' | 'desc' }>
}

type CoordinateChangeListener = (event: CoordinateChangeEvent) => void

/**
 * Centralized coordinate management system for VibeGridX.
 * Maintains reliable mappings between:
 * - Logical positions (rowIndex, columnIndex)
 * - Physical identities (rowId, columnId)
 * - Sorted positions after data transformations
 *
 * Ensures DOM renderer, canvas overlay, and selection state all use
 * the same coordinate system regardless of sort/filter operations.
 */
export class VibeGridXCoordinateManager {
  private mapping: CoordinateMapping
  private listeners = new Set<CoordinateChangeListener>()
  private version = 0

  constructor() {
    this.mapping = {
      rows: [],
      columns: [],
      version: 0,
      sortBy: [],
    }
  }

  // ====================================
  // DATA UPDATES
  // ====================================

  /**
   * Update row mappings from sorted data
   */
  updateRows(
    sortedRows: TableRow[],
    sortBy: Array<{ field: string; direction: 'asc' | 'desc' }> = [],
  ): void {
    const oldMapping = { ...this.mapping }

    // Create new row mappings
    const newRows: RowMapping[] = sortedRows.map((row, sortedIndex) => ({
      rowId: row.id,
      originalIndex: -1, // We don't track original index for now
      sortedIndex,
    }))

    this.mapping = {
      ...this.mapping,
      rows: newRows,
      sortBy: [...sortBy],
      version: ++this.version,
    }

    // Notify listeners if the sort configuration changed
    const sortChanged = JSON.stringify(oldMapping.sortBy) !== JSON.stringify(sortBy)
    if (sortChanged || oldMapping.rows.length !== newRows.length) {
      this.notifyListeners({
        type: sortChanged ? 'sort-changed' : 'data-changed',
        oldMapping,
        newMapping: { ...this.mapping },
        timestamp: Date.now(),
      })
    }
  }

  /**
   * Update column mappings
   */
  updateColumns(columns: Column[]): void {
    const oldMapping = { ...this.mapping }

    let currentOffset = 0
    const newColumns: ColumnMapping[] = columns.map((column, index) => {
      const width = column.width || 120
      const mapping: ColumnMapping = {
        columnId: column.id,
        index,
        offset: currentOffset,
        width,
      }
      currentOffset += width
      return mapping
    })

    fileLog.info('VibeGridXCoordinateManager.updateColumns:', {
      columnCount: columns.length,
      columnIds: columns.map((c) => c.id),
      columnMappings: newColumns.map((c) => ({ id: c.columnId, index: c.index, offset: c.offset })),
    })

    this.mapping = {
      ...this.mapping,
      columns: newColumns,
      version: ++this.version,
    }

    // Notify if columns changed
    if (oldMapping.columns.length !== newColumns.length) {
      this.notifyListeners({
        type: 'columns-changed',
        oldMapping,
        newMapping: { ...this.mapping },
        timestamp: Date.now(),
      })
    }
  }

  // ====================================
  // COORDINATE CONVERSIONS
  // ====================================

  /**
   * Convert cell reference to logical position
   */
  cellRefToPosition(cellRef: CellRef): CoordinatePosition | null {
    const rowMapping = this.mapping.rows.find((r) => r.rowId === cellRef.rowId)
    const columnMapping = this.mapping.columns.find((c) => c.columnId === cellRef.columnId)

    if (!rowMapping || !columnMapping) {
      fileLog.warn('VibeGridXCoordinateManager: Could not find mapping for cell', cellRef)
      return null
    }

    return {
      rowIndex: rowMapping.sortedIndex,
      columnIndex: columnMapping.index,
    }
  }

  /**
   * Get column by ID
   */
  getColumn(columnId: string): { id: string; width: number } | null {
    const columnMapping = this.mapping.columns.find((c) => c.columnId === columnId)
    if (!columnMapping) {
      return null
    }

    return {
      id: columnMapping.columnId,
      width: columnMapping.width,
    }
  }

  /**
   * Get cell position with x,y coordinates (absolute positioning)
   */
  getCellPosition(
    rowId: string,
    columnId: string,
  ): { x: number; y: number; row: number; column: number } | null {
    const cellRef = { rowId, columnId }
    const position = this.cellRefToPosition(cellRef)

    if (!position) {
      return null
    }

    // Get column offset
    const columnMapping = this.mapping.columns[position.columnIndex]
    if (!columnMapping) {
      return null
    }

    // Calculate y position (assuming fixed row height of 40px)
    const rowHeight = 40
    const y = position.rowIndex * rowHeight

    fileLog.info('getCellPosition: Row mapping check', {
      rowId,
      sortedIndex: position.rowIndex,
      calculatedY: y,
      totalRows: this.mapping.rows.length,
      firstFewRows: this.mapping.rows
        .slice(0, 5)
        .map((r) => ({ id: r.rowId, index: r.sortedIndex })),
    })

    return {
      x: columnMapping.offset,
      y: y,
      row: position.rowIndex,
      column: position.columnIndex,
    }
  }

  /**
   * Get viewport-aware cell position
   * Returns both absolute and viewport-relative positions
   */
  getCellPositionWithViewport(
    rowId: string,
    columnId: string,
    viewport: ViewportInfo,
  ): ViewportAwarePosition | null {
    const absolutePos = this.getCellPosition(rowId, columnId)
    if (!absolutePos) {
      return null
    }

    const rowHeight = 40 // TODO: Get from config
    const absoluteRowIndex = absolutePos.row

    // Check if row is in visible range (with buffer)
    const bufferRows = 5
    const visibleStart = Math.max(0, viewport.start - bufferRows)
    const visibleEnd = viewport.end + bufferRows

    const isVisible = absoluteRowIndex >= visibleStart && absoluteRowIndex <= visibleEnd

    if (!isVisible) {
      return {
        absolute: { x: absolutePos.x, y: absolutePos.y },
        viewport: null,
        isVisible: false,
      }
    }

    // Return absolute position (no scroll compensation)
    // Canvas container handles scroll positioning via CSS transforms
    // Overlays must use absolute coordinates to align properly with DOM cells
    const viewportY = absolutePos.y
    const viewportX = absolutePos.x

    fileLog.info('getCellPositionWithViewport: Using absolute coordinates', {
      rowId,
      absoluteRowIndex,
      absoluteY: absolutePos.y,
      absoluteX: absolutePos.x,
      viewportStart: viewport.start,
      viewportEnd: viewport.end,
      scrollTop: viewport.scrollTop,
      note: 'Absolute positioning - canvas transform handles scroll',
    })

    return {
      absolute: { x: absolutePos.x, y: absolutePos.y },
      viewport: { x: viewportX, y: viewportY },
      isVisible: true,
    }
  }

  /**
   * Get all visible cells from a set of selected cells
   */
  getVisibleCells(
    selectedCells: Set<string>,
    viewport: ViewportInfo,
  ): Map<string, ViewportAwarePosition> {
    const visibleCells = new Map<string, ViewportAwarePosition>()

    for (const cellKey of selectedCells) {
      const [rowId, columnId] = cellKey.split(':')
      const position = this.getCellPositionWithViewport(rowId, columnId, viewport)

      if (position && position.isVisible && position.viewport) {
        visibleCells.set(cellKey, position)
      }
    }

    return visibleCells
  }

  /**
   * Check if a row is visible in the viewport
   */
  isRowVisible(rowId: string, viewport: ViewportInfo): boolean {
    const rowMapping = this.mapping.rows.find((r) => r.rowId === rowId)
    if (!rowMapping) {
      return false
    }

    const bufferRows = 5
    const visibleStart = Math.max(0, viewport.start - bufferRows)
    const visibleEnd = viewport.end + bufferRows

    return rowMapping.sortedIndex >= visibleStart && rowMapping.sortedIndex <= visibleEnd
  }

  /**
   * Convert logical position to cell reference
   */
  positionToCellRef(position: CoordinatePosition): CellRef | null {
    const rowMapping = this.mapping.rows[position.rowIndex]
    const columnMapping = this.mapping.columns[position.columnIndex]

    if (!rowMapping || !columnMapping) {
      fileLog.warn('VibeGridXCoordinateManager: Invalid position', position)
      return null
    }

    return {
      rowId: rowMapping.rowId,
      columnId: columnMapping.columnId,
    }
  }

  /**
   * Convert set of cell keys to logical positions
   */
  cellKeysToPositions(cellKeys: Set<string>): Set<string> {
    const positions = new Set<string>()

    for (const cellKey of cellKeys) {
      const [rowId, columnId] = cellKey.split(':')
      const position = this.cellRefToPosition({ rowId, columnId })

      if (position) {
        positions.add(`${position.rowIndex}:${position.columnIndex}`)
      }
    }

    return positions
  }

  /**
   * Convert set of position keys to cell keys
   */
  positionsToCellKeys(positionKeys: Set<string>): Set<string> {
    const cellKeys = new Set<string>()

    for (const positionKey of positionKeys) {
      const [rowIndexStr, columnIndexStr] = positionKey.split(':')
      const rowIndex = parseInt(rowIndexStr, 10)
      const columnIndex = parseInt(columnIndexStr, 10)

      const cellRef = this.positionToCellRef({ rowIndex, columnIndex })
      if (cellRef) {
        cellKeys.add(`${cellRef.rowId}:${cellRef.columnId}`)
      }
    }

    return cellKeys
  }

  // ====================================
  // RANGE OPERATIONS
  // ====================================

  /**
   * Calculate range of logical positions between two cell references
   */
  calculateLogicalRange(start: CellRef, end: CellRef): CoordinatePosition[] {
    const startPos = this.cellRefToPosition(start)
    const endPos = this.cellRefToPosition(end)

    if (!startPos || !endPos) {
      return []
    }

    const minRow = Math.min(startPos.rowIndex, endPos.rowIndex)
    const maxRow = Math.max(startPos.rowIndex, endPos.rowIndex)
    const minCol = Math.min(startPos.columnIndex, endPos.columnIndex)
    const maxCol = Math.max(startPos.columnIndex, endPos.columnIndex)

    const positions: CoordinatePosition[] = []

    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        positions.push({ rowIndex: row, columnIndex: col })
      }
    }

    return positions
  }

  /**
   * Calculate range of cell keys between two cell references using logical coordinates
   */
  calculateCellRange(start: CellRef, end: CellRef): Set<string> {
    const positions = this.calculateLogicalRange(start, end)
    const cellKeys = new Set<string>()

    for (const position of positions) {
      const cellRef = this.positionToCellRef(position)
      if (cellRef) {
        cellKeys.add(`${cellRef.rowId}:${cellRef.columnId}`)
      }
    }

    return cellKeys
  }

  // ====================================
  // NAVIGATION
  // ====================================

  /**
   * Move from current cell reference in a direction
   */
  moveCellRef(current: CellRef, direction: 'up' | 'down' | 'left' | 'right'): CellRef | null {
    const currentPos = this.cellRefToPosition(current)
    if (!currentPos) return null

    let newPos: CoordinatePosition

    switch (direction) {
      case 'up':
        newPos = { ...currentPos, rowIndex: Math.max(0, currentPos.rowIndex - 1) }
        break
      case 'down':
        newPos = {
          ...currentPos,
          rowIndex: Math.min(this.mapping.rows.length - 1, currentPos.rowIndex + 1),
        }
        break
      case 'left':
        newPos = { ...currentPos, columnIndex: Math.max(0, currentPos.columnIndex - 1) }
        break
      case 'right':
        newPos = {
          ...currentPos,
          columnIndex: Math.min(this.mapping.columns.length - 1, currentPos.columnIndex + 1),
        }
        break
      default:
        return current
    }

    return this.positionToCellRef(newPos)
  }

  // ====================================
  // GETTERS
  // ====================================

  /**
   * Get current coordinate mapping
   */
  getMapping(): Readonly<CoordinateMapping> {
    return this.mapping
  }

  /**
   * Get current version for change detection
   */
  getVersion(): number {
    return this.version
  }

  /**
   * Get sorted row IDs in current order
   */
  getSortedRowIds(): string[] {
    return this.mapping.rows.map((row) => row.rowId)
  }

  /**
   * Get column IDs in current order
   */
  getColumnIds(): string[] {
    return this.mapping.columns.map((col) => col.columnId)
  }

  /**
   * Get column offset for positioning
   */
  getColumnOffset(columnId: string): number {
    const column = this.mapping.columns.find((c) => c.columnId === columnId)
    return column?.offset || 0
  }

  /**
   * Get column width
   */
  getColumnWidth(columnId: string): number {
    const column = this.mapping.columns.find((c) => c.columnId === columnId)
    return column?.width || 120
  }

  /**
   * Check if a row exists in current mapping
   */
  hasRow(rowId: string): boolean {
    return this.mapping.rows.some((r) => r.rowId === rowId)
  }

  /**
   * Check if a column exists in current mapping
   */
  hasColumn(columnId: string): boolean {
    return this.mapping.columns.some((c) => c.columnId === columnId)
  }

  /**
   * Get row count
   */
  getRowCount(): number {
    return this.mapping.rows.length
  }

  /**
   * Get column count
   */
  getColumnCount(): number {
    return this.mapping.columns.length
  }

  // ====================================
  // EVENT HANDLING
  // ====================================

  /**
   * Subscribe to coordinate changes
   */
  subscribe(listener: CoordinateChangeListener): () => void {
    this.listeners.add(listener)

    return () => {
      this.listeners.delete(listener)
    }
  }

  /**
   * Notify all listeners of coordinate changes
   */
  private notifyListeners(event: CoordinateChangeEvent): void {
    this.listeners.forEach((listener) => {
      try {
        listener(event)
      } catch (error) {
        console.error('VibeGridXCoordinateManager: Error in change listener', error)
      }
    })
  }

  // ====================================
  // UTILITIES
  // ====================================

  /**
   * Clear all mappings
   */
  clear(): void {
    const oldMapping = { ...this.mapping }

    this.mapping = {
      rows: [],
      columns: [],
      version: ++this.version,
      sortBy: [],
    }

    this.notifyListeners({
      type: 'data-changed',
      oldMapping,
      newMapping: { ...this.mapping },
      timestamp: Date.now(),
    })
  }

  /**
   * Debug helper
   */
  debug(): void {
    fileLog.info('VibeGridXCoordinateManager Debug:', {
      version: this.version,
      rowCount: this.mapping.rows.length,
      columnCount: this.mapping.columns.length,
      sortBy: this.mapping.sortBy,
      listenerCount: this.listeners.size,
      sampleRows: this.mapping.rows.slice(0, 3),
      sampleColumns: this.mapping.columns.slice(0, 3),
    })
  }
}

// ====================================
// FACTORY FUNCTION
// ====================================

export function createVibeGridXCoordinateManager(): VibeGridXCoordinateManager {
  return new VibeGridXCoordinateManager()
}
