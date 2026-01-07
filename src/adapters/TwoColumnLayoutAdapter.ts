/**
 * TwoColumnLayoutAdapter - Two-Column Form Layout
 *
 * Implements two-column form layout for VibeGrid:
 * - Fields arranged in two columns
 * - Label above value (within each cell)
 * - Up/Down/Left/Right navigation
 * - Tab order is row-major (left-to-right, top-to-bottom)
 *
 * Layout Pattern:
 * ┌─────────────┬─────────────┐
 * │ Label A     │ Label B     │
 * │ [ Value A ] │ [ Value B ] │
 * ├─────────────┼─────────────┤
 * │ Label C     │ Label D     │
 * │ [ Value C ] │ [ Value D ] │
 * └─────────────┴─────────────┘
 */

import type { CellLayoutAdapter, CellPosition, FieldNeighbors } from '../types/layout-types'
import type { Column } from '../types'
import type { CSSProperties } from 'react'

export interface TwoColumnLayoutAdapterOptions {
  /** Array of visible columns (field definitions) */
  columns: Column[]
  /** Gap between fields (CSS value) */
  fieldGap?: string
  /** Gap between label and value (CSS value) */
  labelGap?: string
  /** Gap between columns (CSS value) */
  columnGap?: string
}

export class TwoColumnLayoutAdapter implements CellLayoutAdapter {
  private columns: Column[]
  private fieldGap: string
  private labelGap: string
  private columnGap: string
  private fieldIdToIndex: Map<string, number>

  // Number of columns in the layout (always 2 for this adapter)
  private readonly numCols = 2

  constructor(options: TwoColumnLayoutAdapterOptions) {
    this.columns = options.columns
    this.fieldGap = options.fieldGap ?? '1rem'
    this.labelGap = options.labelGap ?? '0.5rem'
    this.columnGap = options.columnGap ?? '1.5rem'

    // Build field ID to index mapping for O(1) lookups
    this.fieldIdToIndex = new Map()
    for (let i = 0; i < this.columns.length; i++) {
      this.fieldIdToIndex.set(this.columns[i].id, i)
    }
  }

  // ==================== Navigation ====================

  /**
   * Get neighboring fields for keyboard navigation
   * In two-column: all 4 directions are supported
   */
  getFieldNeighbors(fieldId: string): FieldNeighbors {
    const index = this.fieldIdToIndex.get(fieldId)
    if (index === undefined) {
      return {}
    }

    const row = Math.floor(index / this.numCols)
    const col = index % this.numCols
    const neighbors: FieldNeighbors = {}

    // Up: Field in the same column, previous row
    const upIndex = (row - 1) * this.numCols + col
    if (row > 0 && upIndex >= 0 && upIndex < this.columns.length) {
      neighbors.up = this.columns[upIndex].id
    }

    // Down: Field in the same column, next row
    const downIndex = (row + 1) * this.numCols + col
    if (downIndex < this.columns.length) {
      neighbors.down = this.columns[downIndex].id
    }

    // Left: Previous field in the row
    if (col > 0) {
      const leftIndex = index - 1
      if (leftIndex >= 0) {
        neighbors.left = this.columns[leftIndex].id
      }
    }

    // Right: Next field in the row
    if (col < this.numCols - 1) {
      const rightIndex = index + 1
      if (rightIndex < this.columns.length) {
        neighbors.right = this.columns[rightIndex].id
      }
    }

    return neighbors
  }

  /**
   * Get field's position in layout grid
   * In two-column: row = floor(index/2), col = index % 2
   */
  getCellPosition(fieldId: string): CellPosition {
    const index = this.fieldIdToIndex.get(fieldId)
    if (index === undefined) {
      throw new Error(`Field not found: ${fieldId}`)
    }

    return {
      row: Math.floor(index / this.numCols),
      col: index % this.numCols,
    }
  }

  /**
   * Get field ID at specific position
   */
  getFieldAtPosition(row: number, col: number): string | null {
    // Check column bounds
    if (col < 0 || col >= this.numCols) {
      return null
    }

    // Calculate index
    const index = row * this.numCols + col

    // Check bounds
    if (index < 0 || index >= this.columns.length) {
      return null
    }

    return this.columns[index].id
  }

  /**
   * Get tab order for sequential navigation
   * In two-column: row-major order (left-to-right, top-to-bottom)
   */
  getTabOrder(): string[] {
    return this.columns.map((col) => col.id)
  }

  // ==================== Rendering ====================

  /**
   * Get CSS grid template for two-column layout
   */
  getGridTemplate(): string {
    return '1fr 1fr'
  }

  /**
   * Get container styles for the layout
   */
  getContainerStyle(): CSSProperties {
    return {
      display: 'grid',
      gridTemplateColumns: this.getGridTemplate(),
      gap: this.fieldGap,
      columnGap: this.columnGap,
    }
  }

  /**
   * Get field-specific CSS styles
   */
  getFieldStyle(fieldId: string): CSSProperties {
    const position = this.getCellPosition(fieldId)
    const index = this.fieldIdToIndex.get(fieldId) ?? 0
    const isLastRow =
      Math.floor(index / this.numCols) === Math.floor((this.columns.length - 1) / this.numCols)
    const isOddFieldCount = this.columns.length % 2 === 1
    const isLastField = index === this.columns.length - 1

    // If last field and odd count, span both columns
    if (isLastField && isOddFieldCount) {
      return {
        display: 'flex',
        flexDirection: 'column',
        gap: this.labelGap,
        gridColumn: '1 / -1', // Span both columns
      }
    }

    return {
      display: 'flex',
      flexDirection: 'column',
      gap: this.labelGap,
    }
  }

  /**
   * Get label style for this layout
   */
  getLabelStyle(): CSSProperties {
    return {
      fontWeight: 500,
      fontSize: '0.875rem',
      color: 'var(--color-text-secondary, #6b7280)',
    }
  }

  /**
   * Get value container style for this layout
   */
  getValueStyle(): CSSProperties {
    return {
      width: '100%',
    }
  }

  // ==================== Update Methods ====================

  /**
   * Update columns (when column visibility or order changes)
   */
  updateColumns(columns: Column[]): void {
    this.columns = columns

    // Rebuild field ID mapping
    this.fieldIdToIndex.clear()
    for (let i = 0; i < this.columns.length; i++) {
      this.fieldIdToIndex.set(this.columns[i].id, i)
    }
  }
}
