/**
 * GridAdapter - Traditional Grid Layout
 *
 * Wraps existing VibeGrid grid navigation logic for consistency with layout adapter system.
 * Maintains current grid behavior:
 * - Rows and columns in 2D grid
 * - Arrow keys navigate in all directions
 * - Uses processedRows and visibleColumns from VibeGrid stores
 *
 * This adapter delegates to existing KeyboardNavigationController patterns.
 */

import type { CellLayoutAdapter, CellPosition, FieldNeighbors } from '../types/layout-types'
import type { Column } from '../types'
import type { CSSProperties } from 'react'

export interface GridAdapterOptions {
  /** Array of visible columns */
  columns: Column[]
  /** Array of processed rows (after grouping, filtering, sorting) */
  rows: any[]
  /** Optional callback to get current rows (for dynamic updates) */
  getRows?: () => any[]
  /** Optional callback to get current columns (for dynamic updates) */
  getColumns?: () => Column[]
}

export class GridAdapter implements CellLayoutAdapter {
  private columns: Column[]
  private rows: any[]
  private getRows?: () => any[]
  private getColumns?: () => Column[]
  private fieldIdToColIndex: Map<string, number>
  private rowIdToRowIndex: Map<string, number>

  constructor(options: GridAdapterOptions) {
    this.columns = options.columns
    this.rows = options.rows
    this.getRows = options.getRows
    this.getColumns = options.getColumns

    // Build lookup maps for O(1) access
    this.fieldIdToColIndex = new Map()
    this.rowIdToRowIndex = new Map()
    this.rebuildMaps()
  }

  // ==================== Navigation ====================

  /**
   * Get neighboring fields for keyboard navigation
   * In grid: all four directions available
   */
  getFieldNeighbors(fieldId: string): FieldNeighbors {
    // Field ID in grid is "rowId:columnId"
    const parts = fieldId.split(':')
    if (parts.length !== 2) {
      return {}
    }

    const [rowId, columnId] = parts
    const columns = this.getCurrentColumns()
    const rows = this.getCurrentRows()

    const rowIndex = this.rowIdToRowIndex.get(rowId)
    const colIndex = this.fieldIdToColIndex.get(columnId)

    if (rowIndex === undefined || colIndex === undefined) {
      return {}
    }

    const neighbors: FieldNeighbors = {}

    // Up: Previous row, same column
    if (rowIndex > 0) {
      const upRowId = rows[rowIndex - 1].id
      neighbors.up = `${upRowId}:${columnId}`
    }

    // Down: Next row, same column
    if (rowIndex < rows.length - 1) {
      const downRowId = rows[rowIndex + 1].id
      neighbors.down = `${downRowId}:${columnId}`
    }

    // Left: Same row, previous column (skip selection column)
    let leftColIndex = colIndex - 1
    while (leftColIndex >= 0) {
      const leftCol = columns[leftColIndex]
      if (leftCol.id !== 'selection') {
        neighbors.left = `${rowId}:${leftCol.id}`
        break
      }
      leftColIndex--
    }

    // Right: Same row, next column (skip selection column)
    let rightColIndex = colIndex + 1
    while (rightColIndex < columns.length) {
      const rightCol = columns[rightColIndex]
      if (rightCol.id !== 'selection') {
        neighbors.right = `${rowId}:${rightCol.id}`
        break
      }
      rightColIndex++
    }

    return neighbors
  }

  /**
   * Get field's position in grid
   * Field ID format: "rowId:columnId"
   */
  getCellPosition(fieldId: string): CellPosition {
    const parts = fieldId.split(':')
    if (parts.length !== 2) {
      throw new Error(`Invalid field ID format: ${fieldId}`)
    }

    const [rowId, columnId] = parts
    const rowIndex = this.rowIdToRowIndex.get(rowId)
    const colIndex = this.fieldIdToColIndex.get(columnId)

    if (rowIndex === undefined || colIndex === undefined) {
      throw new Error(`Field not found: ${fieldId}`)
    }

    return {
      row: rowIndex,
      col: colIndex,
    }
  }

  /**
   * Get field ID at specific position
   * Returns "rowId:columnId" or null if out of bounds
   */
  getFieldAtPosition(row: number, col: number): string | null {
    const columns = this.getCurrentColumns()
    const rows = this.getCurrentRows()

    if (row < 0 || row >= rows.length || col < 0 || col >= columns.length) {
      return null
    }

    const rowId = rows[row].id
    const columnId = columns[col].id

    return `${rowId}:${columnId}`
  }

  /**
   * Get tab order for sequential navigation
   * In grid: left-to-right, top-to-bottom
   */
  getTabOrder(): string[] {
    const columns = this.getCurrentColumns()
    const rows = this.getCurrentRows()
    const tabOrder: string[] = []

    for (const row of rows) {
      for (const col of columns) {
        // Skip selection column
        if (col.id === 'selection') {
          continue
        }
        tabOrder.push(`${row.id}:${col.id}`)
      }
    }

    return tabOrder
  }

  // ==================== Rendering ====================

  /**
   * Get CSS grid template for grid layout
   * Returns column widths as space-separated string
   */
  getGridTemplate(): string {
    const columns = this.getCurrentColumns()
    const widths = columns.map((col) => `${col.width || 150}px`)
    return widths.join(' ')
  }

  /**
   * Get field-specific CSS styles
   * In grid: uses grid-column and grid-row positioning
   */
  getFieldStyle(fieldId: string): CSSProperties {
    const position = this.getCellPosition(fieldId)

    return {
      gridRow: position.row + 1, // CSS grid is 1-indexed
      gridColumn: position.col + 1,
    }
  }

  // ==================== Helper Methods ====================

  /**
   * Get current columns (either from callback or cached)
   */
  private getCurrentColumns(): Column[] {
    return this.getColumns ? this.getColumns() : this.columns
  }

  /**
   * Get current rows (either from callback or cached)
   */
  private getCurrentRows(): any[] {
    return this.getRows ? this.getRows() : this.rows
  }

  /**
   * Rebuild lookup maps when columns or rows change
   */
  private rebuildMaps(): void {
    const columns = this.getCurrentColumns()
    const rows = this.getCurrentRows()

    this.fieldIdToColIndex.clear()
    this.rowIdToRowIndex.clear()

    for (let i = 0; i < columns.length; i++) {
      this.fieldIdToColIndex.set(columns[i].id, i)
    }

    for (let i = 0; i < rows.length; i++) {
      this.rowIdToRowIndex.set(rows[i].id, i)
    }
  }

  /**
   * Update columns and rows (when data changes)
   */
  updateData(columns: Column[], rows: any[]): void {
    this.columns = columns
    this.rows = rows
    this.rebuildMaps()
  }
}
