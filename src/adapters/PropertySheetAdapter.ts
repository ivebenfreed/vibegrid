/**
 * PropertySheetAdapter - Vertical Property Sheet Layout
 *
 * Implements property sheet layout for VibeGrid:
 * - Fields arranged vertically (one per row)
 * - Label on left, value on right
 * - Up/Down navigation moves between fields
 * - Tab order is top-to-bottom
 *
 * Layout Pattern:
 * ┌────────────────────────────────┐
 * │ Label 1        │ [Value 1    ] │
 * ├────────────────────────────────┤
 * │ Label 2        │ [Value 2    ] │
 * ├────────────────────────────────┤
 * │ Label 3        │ [Value 3    ] │
 * └────────────────────────────────┘
 */

import type { CellLayoutAdapter, CellPosition, FieldNeighbors } from '../types/layout-types'
import type { Column } from '../types'
import type { CSSProperties } from 'react'

export interface PropertySheetAdapterOptions {
  /** Array of visible columns (field definitions) */
  columns: Column[]
  /** Label column width (CSS value, e.g., '200px', '30%') */
  labelWidth?: string
  /** Gap between label and value (CSS value) */
  gap?: string
}

export class PropertySheetAdapter implements CellLayoutAdapter {
  private columns: Column[]
  private labelWidth: string
  private gap: string
  private fieldIdToIndex: Map<string, number>

  constructor(options: PropertySheetAdapterOptions) {
    this.columns = options.columns
    this.labelWidth = options.labelWidth ?? '200px'
    this.gap = options.gap ?? '1rem'

    // Build field ID to index mapping for O(1) lookups
    this.fieldIdToIndex = new Map()
    for (let i = 0; i < this.columns.length; i++) {
      this.fieldIdToIndex.set(this.columns[i].id, i)
    }
  }

  // ==================== Navigation ====================

  /**
   * Get neighboring fields for keyboard navigation
   * In property sheet: only up/down neighbors (vertical layout)
   */
  getFieldNeighbors(fieldId: string): FieldNeighbors {
    const index = this.fieldIdToIndex.get(fieldId)
    if (index === undefined) {
      return {}
    }

    const neighbors: FieldNeighbors = {}

    // Up: Previous field in list
    if (index > 0) {
      neighbors.up = this.columns[index - 1].id
    }

    // Down: Next field in list
    if (index < this.columns.length - 1) {
      neighbors.down = this.columns[index + 1].id
    }

    // Left/Right: Not applicable in vertical layout
    // (could be used for label <-> value navigation in future)

    return neighbors
  }

  /**
   * Get field's position in layout grid
   * In property sheet: row = field index, col = 0 (always first column)
   */
  getCellPosition(fieldId: string): CellPosition {
    const index = this.fieldIdToIndex.get(fieldId)
    if (index === undefined) {
      throw new Error(`Field not found: ${fieldId}`)
    }

    return {
      row: index,
      col: 0, // Always column 0 (vertical layout)
    }
  }

  /**
   * Get field ID at specific position
   * In property sheet: only col=0 is valid, row=field index
   */
  getFieldAtPosition(row: number, col: number): string | null {
    // Only column 0 exists in vertical layout
    if (col !== 0) {
      return null
    }

    // Check row bounds
    if (row < 0 || row >= this.columns.length) {
      return null
    }

    return this.columns[row].id
  }

  /**
   * Get tab order for sequential navigation
   * In property sheet: top-to-bottom order
   */
  getTabOrder(): string[] {
    return this.columns.map((col) => col.id)
  }

  // ==================== Rendering ====================

  /**
   * Get CSS grid template for property sheet layout
   * Uses CSS grid with fixed label width and flexible value width
   */
  getGridTemplate(): string {
    // CSS grid template: label column (fixed width) + value column (1fr)
    return `${this.labelWidth} 1fr`
  }

  /**
   * Get field-specific CSS styles
   * In property sheet: all fields use same grid positioning
   */
  getFieldStyle(fieldId: string): CSSProperties {
    const position = this.getCellPosition(fieldId)

    return {
      gridRow: position.row + 1, // CSS grid is 1-indexed
      gridColumn: '1 / -1', // Span both label and value columns
      display: 'grid',
      gridTemplateColumns: this.getGridTemplate(),
      gap: this.gap,
      alignItems: 'center',
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
