import { log } from '@/logger'
import type { CoordinateMapping } from '../machines/table-machine/slices/dimensions-slice'
import type { Column, ViewportInfo } from '../types'
import type { CellPosition, OverlayConfig } from './OverlayTypes'

const fileLog = log('components/custom/vibegrid/overlays/CoordinateSystem.ts')

// ====================================
// COORDINATE SYSTEM UTILITIES
// ====================================

export class CoordinateSystem {
  private config: OverlayConfig
  rowIndexMap: Map<string, number> = new Map()
  private columnIndexMap: Map<string, number> = new Map()
  private indexToRowId: Map<number, string> = new Map()
  private indexToColumnId: Map<number, string> = new Map()
  private isInsideScrollContainer: boolean = true // Canvas is now inside scrollable body

  // Coordinate mapping reference
  private coordinateMapping: CoordinateMapping | null = null
  public columns: Column[] = []

  // Column caches - these are worth keeping since they avoid iteration
  private columnOffsetCache: Map<string, number> = new Map()
  private columnWidthCache: Map<string, number> = new Map()
  private cellKeyCache: Map<string, { rowId: string; columnId: string }> = new Map()

  // Add method to parse cell key with caching
  parseCellKey(cellKey: string): { rowId: string; columnId: string } | null {
    let parsed = this.cellKeyCache.get(cellKey)
    if (parsed) {
      return parsed
    }

    const parts = cellKey.split(':')
    if (parts.length !== 2) {
      return null
    }

    parsed = { rowId: parts[0], columnId: parts[1] }
    this.cellKeyCache.set(cellKey, parsed)

    // Limit cache size
    if (this.cellKeyCache.size > 500) {
      // Remove oldest entries
      const keysToDelete = Array.from(this.cellKeyCache.keys()).slice(0, 100)
      keysToDelete.forEach((key) => this.cellKeyCache.delete(key))
    }

    return parsed
  }

  constructor(config: OverlayConfig) {
    this.config = config
  }

  // Update coordinate mapping
  updateCoordinateMapping(coordinateMapping: CoordinateMapping): void {
    this.coordinateMapping = coordinateMapping
    this.clearCaches()
  }

  // Update the index mappings when data changes
  updateMappings(rowIds: string[], columnIds: string[]): void {
    fileLog.info('CoordinateSystem.updateMappings: Updating with new data order', {
      rowCount: rowIds.length,
      columnCount: columnIds.length,
      firstFewRows: rowIds.slice(0, 5),
      lastFewRows: rowIds.slice(-5),
      columns: columnIds,
      // Log specific row we're tracking
      trackedRowIndex: rowIds.indexOf('0fd83795-24be-4f8c-8a0f-cb085d23bc9a'),
    })

    this.rowIndexMap.clear()
    this.columnIndexMap.clear()
    this.indexToRowId.clear()
    this.indexToColumnId.clear()

    // Clear all caches when mappings change
    this.clearCaches()

    rowIds.forEach((id, index) => {
      this.rowIndexMap.set(id, index)
      this.indexToRowId.set(index, id)
    })

    columnIds.forEach((id, index) => {
      this.columnIndexMap.set(id, index)
      this.indexToColumnId.set(index, id)
    })
  }

  private clearCaches(): void {
    this.columnOffsetCache.clear()
    this.columnWidthCache.clear()
    this.cellKeyCache.clear()
  }

  // Columns are now managed by dimensionManager passed during initialization

  // Get column width with caching
  private getColumnWidth(columnId: string): number {
    let width = this.columnWidthCache.get(columnId)
    if (width === undefined) {
      if (this.coordinateMapping) {
        const column = this.coordinateMapping.columns.find((col) => col.columnId === columnId)
        width = column ? column.width : this.config.cellWidth
      } else {
        width = this.config.cellWidth
      }
      this.columnWidthCache.set(columnId, width)
    }
    return width
  }

  // Get column offset (x position) with caching
  getColumnOffset(columnId: string): number {
    let offset = this.columnOffsetCache.get(columnId)
    if (offset === undefined) {
      if (this.coordinateMapping) {
        const column = this.coordinateMapping.columns.find((col) => col.columnId === columnId)
        offset = column ? column.offset : 0
      } else {
        offset = 0
      }
      this.columnOffsetCache.set(columnId, offset)
    }
    return offset
  }

  // Get column by x position
  private getColumnByX(x: number): { columnId: string; columnIndex: number } | null {
    if (!this.coordinateMapping) return null

    const column = this.coordinateMapping.columns.find(
      (col) => x >= col.offset && x < col.offset + col.width,
    )

    if (column) {
      const columnIndex = this.columnIndexMap.get(column.columnId)
      if (columnIndex !== undefined) {
        return { columnId: column.columnId, columnIndex }
      }
    }

    return null
  }

  // Convert viewport coordinates to cell indices
  viewportToCell(x: number, y: number, viewport: ViewportInfo): CellPosition | null {
    // Canvas is transformed by scroll, so input coordinates are relative to viewport
    // We need to convert back to absolute positions
    const absoluteY = y + viewport.scrollTop
    const absoluteX = x + (viewport.scrollLeft || 0)

    // Find row index (supports variable heights)
    let row: number
    if (this.coordinateMapping && this.coordinateMapping.rows.some((r) => r.height !== undefined)) {
      // Variable height rows - find by offset ranges
      const foundRow = this.coordinateMapping.rows.find((r, index) => {
        const height = r.height || this.config.cellHeight
        return absoluteY >= r.offset && absoluteY < r.offset + height
      })
      row = foundRow ? this.coordinateMapping.rows.indexOf(foundRow) : -1
    } else {
      // Uniform height rows
      row = Math.floor(absoluteY / this.config.cellHeight)
    }

    // Find column by absolute x position using actual column widths
    const columnInfo = this.getColumnByX(absoluteX)
    if (!columnInfo) {
      return null
    }

    // Validate bounds
    if (row < 0) {
      return null
    }

    return {
      x: x, // Keep x relative to viewport for consistency
      y: y, // Keep y relative to viewport for consistency
      row,
      column: columnInfo.columnIndex,
    }
  }

  // Convert cell indices to absolute coordinates
  cellToViewport(row: number, column: number, viewport: ViewportInfo): CellPosition {
    // Get column ID from index
    const columnId = this.indexToColumnId.get(column)
    if (!columnId) {
      // Fallback to old calculation if column not found
      const x = column * this.config.cellWidth
      const y = row * this.config.cellHeight

      return { x, y, row, column }
    }

    // Get absolute column position (no scroll adjustment)
    const x = this.getColumnOffset(columnId)

    // Calculate row position (supports variable heights)
    let y: number
    if (this.coordinateMapping && this.coordinateMapping.rows[row]) {
      // Use offset from coordinate mapping for variable height support
      y = this.coordinateMapping.rows[row].offset
    } else {
      // Fallback to uniform height calculation
      y = row * this.config.cellHeight
    }

    return { x, y, row, column }
  }

  // Get cell position by IDs - no caching needed for simple arithmetic
  getCellPositionByIds(
    rowId: string,
    columnId: string,
    viewport: ViewportInfo,
  ): CellPosition | null {
    const rowIndex = this.rowIndexMap.get(rowId)
    const columnIndex = this.columnIndexMap.get(columnId)

    if (rowIndex === undefined || columnIndex === undefined) {
      fileLog.info('CoordinateSystem.getCellPositionByIds: Missing mapping', {
        rowId,
        columnId,
        rowIndex,
        columnIndex,
        totalRows: this.rowIndexMap.size,
        totalColumns: this.columnIndexMap.size,
        sampleRowMappings: Array.from(this.rowIndexMap.entries()).slice(0, 3),
        sampleColumnMappings: Array.from(this.columnIndexMap.entries()).slice(0, 3),
      })
      return null
    }

    // Direct calculation - no caching needed
    const position = this.cellToViewport(rowIndex, columnIndex, viewport)
    // Reduced logging - only log errors or important state changes
    return position
  }

  // Convert cell indices to IDs
  cellIndicesToIds(row: number, column: number): { rowId: string | null; columnId: string | null } {
    return {
      rowId: this.indexToRowId.get(row) || null,
      columnId: this.indexToColumnId.get(column) || null,
    }
  }

  // Check if a cell is visible in the viewport
  isCellVisible(row: number, column: number, viewport: ViewportInfo): boolean {
    const position = this.cellToViewport(row, column, viewport)

    // Position is now absolute, so we need to check against scrolled viewport bounds
    const viewportTop = viewport.scrollTop || 0
    const viewportBottom = viewportTop + viewport.height
    const viewportLeft = viewport.scrollLeft || 0
    const viewportRight = viewportLeft + viewport.width

    const isVisible =
      position.y >= viewportTop - this.config.cellHeight &&
      position.y <= viewportBottom + this.config.cellHeight &&
      position.x >= viewportLeft &&
      position.x <= viewportRight

    fileLog.info('CoordinateSystem.isCellVisible (absolute coordinates):', {
      row,
      column,
      position,
      viewportBounds: {
        top: viewportTop,
        bottom: viewportBottom,
        left: viewportLeft,
        right: viewportRight,
      },
      isVisible,
    })

    return isVisible
  }

  // Get visible cell range for the current viewport
  getVisibleCellRange(viewport: ViewportInfo): {
    startRow: number
    endRow: number
    startColumn: number
    endColumn: number
  } {
    // Since viewport is already expanded with buffer, use it directly
    const startRow = Math.max(0, viewport.start)
    const endRow = Math.min(this.rowIndexMap.size, viewport.end)

    // Calculate visible columns based on actual column widths
    let startColumn = 0
    let endColumn = this.columns.length

    // If we have columns, calculate which are visible
    if (this.columns.length > 0) {
      let currentX = 0
      let foundStart = false

      for (let i = 0; i < this.columns.length; i++) {
        const width = this.getColumnWidth(this.columns[i].id)

        if (!foundStart && currentX + width > 0) {
          startColumn = i
          foundStart = true
        }

        if (currentX > viewport.width) {
          endColumn = i + 1
          break
        }

        currentX += width
      }
    }

    return { startRow, endRow, startColumn, endColumn }
  }

  // Calculate cell range from drag selection
  calculateDragSelection(
    startPos: { x: number; y: number },
    endPos: { x: number; y: number },
    viewport: ViewportInfo,
  ): Set<string> {
    const selection = new Set<string>()

    const startCell = this.viewportToCell(startPos.x, startPos.y, viewport)
    const endCell = this.viewportToCell(endPos.x, endPos.y, viewport)

    if (!startCell || !endCell) {
      return selection
    }

    const minRow = Math.min(startCell.row, endCell.row)
    const maxRow = Math.max(startCell.row, endCell.row)
    const minCol = Math.min(startCell.column, endCell.column)
    const maxCol = Math.max(startCell.column, endCell.column)

    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        const { rowId, columnId } = this.cellIndicesToIds(row, col)
        if (rowId && columnId) {
          selection.add(`${rowId}:${columnId}`)
        }
      }
    }

    return selection
  }

  // Get row and column counts
  getDimensions(): { rowCount: number; columnCount: number } {
    return {
      rowCount: this.rowIndexMap.size,
      columnCount: this.columnIndexMap.size,
    }
  }

  // Debug method to check if mappings exist for specific IDs
  hasMappings(rowId: string, columnId: string): { hasRow: boolean; hasColumn: boolean } {
    return {
      hasRow: this.rowIndexMap.has(rowId),
      hasColumn: this.columnIndexMap.has(columnId),
    }
  }

  // Debug method to get all mapped IDs
  getAllMappedIds(): { rowIds: string[]; columnIds: string[] } {
    return {
      rowIds: Array.from(this.rowIndexMap.keys()),
      columnIds: Array.from(this.columnIndexMap.keys()),
    }
  }
}
