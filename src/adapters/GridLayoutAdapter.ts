/**
 * GridLayoutAdapter - Configurable Grid Form Layout
 *
 * A generalized grid layout adapter that supports:
 * - Configurable number of columns (default 2)
 * - Explicit field placements (row, col, span)
 * - Automatic placement for fields without explicit positions
 * - Full keyboard navigation (Up/Down/Left/Right/Tab)
 *
 * Layout Pattern (3-column example):
 * +-------------+-------------+-------------+
 * | Label A     | Label B     | Label C     |
 * | [ Value A ] | [ Value B ] | [ Value C ] |
 * +-------------+-------------+-------------+
 * | Label D (span 2)          | Label E     |
 * | [ Value D                ]| [ Value E ] |
 * +-------------+-------------+-------------+
 */

import type {
  CellLayoutAdapter,
  CellPosition,
  FieldNeighbors,
  FieldPlacement,
} from '../types/layout-types'
import type { Column } from '../types'
import type { CSSProperties } from 'react'

export interface GridLayoutAdapterOptions {
  /** Array of visible columns (field definitions) */
  columns: Column[]
  /** Number of grid columns (default 2) */
  gridColumns?: number
  /** Explicit field placements (optional) */
  fieldPlacements?: FieldPlacement[]
  /** Gap between fields (CSS value) */
  fieldGap?: string
  /** Gap between label and value (CSS value) */
  labelGap?: string
}

/**
 * Internal representation of a placed field in the grid
 */
interface PlacedField {
  fieldId: string
  row: number
  col: number
  span: number
}

export class GridLayoutAdapter implements CellLayoutAdapter {
  private columns: Column[]
  private gridColumns: number
  private fieldPlacements: FieldPlacement[]
  private fieldGap: string
  private labelGap: string

  /** Computed placed fields (sorted by row, then col) */
  private placedFields: PlacedField[] = []
  /** Lookup from fieldId to placed field */
  private fieldIdToPlaced: Map<string, PlacedField> = new Map()
  /** Grid occupation map: `${row}:${col}` -> fieldId */
  private gridMap: Map<string, string> = new Map()
  /** Total number of rows in the grid */
  private totalRows = 0

  constructor(options: GridLayoutAdapterOptions) {
    this.columns = options.columns
    this.gridColumns = options.gridColumns ?? 2
    this.fieldPlacements = options.fieldPlacements ?? []
    this.fieldGap = options.fieldGap ?? '1rem'
    this.labelGap = options.labelGap ?? '0.5rem'

    this.computePlacements()
  }

  // ==================== Placement Computation ====================

  /**
   * Compute the final grid placements for all fields.
   * Fields with explicit placements are placed first,
   * then remaining fields fill in auto-placed positions.
   */
  private computePlacements(): void {
    this.placedFields = []
    this.fieldIdToPlaced = new Map()
    this.gridMap = new Map()

    // Build a set of column IDs for validation
    const columnIds = new Set(this.columns.map((c) => c.id))

    // Step 1: Place explicitly positioned fields
    const explicitlyPlaced = new Set<string>()
    for (const placement of this.fieldPlacements) {
      if (!columnIds.has(placement.fieldId)) continue

      if (placement.row != null && placement.col != null) {
        const placed: PlacedField = {
          fieldId: placement.fieldId,
          row: placement.row,
          col: placement.col,
          span: Math.min(placement.span ?? 1, this.gridColumns - placement.col),
        }
        this.addPlacedField(placed)
        explicitlyPlaced.add(placement.fieldId)
      }
    }

    // Step 2: Build a map of placement hints (span only) for auto-placed fields
    const spanHints = new Map<string, number>()
    for (const placement of this.fieldPlacements) {
      if (!explicitlyPlaced.has(placement.fieldId) && placement.span != null) {
        spanHints.set(placement.fieldId, placement.span)
      }
    }

    // Step 3: Auto-place remaining fields in order
    let autoRow = 0
    let autoCol = 0

    for (const column of this.columns) {
      if (explicitlyPlaced.has(column.id)) continue

      const span = Math.min(spanHints.get(column.id) ?? 1, this.gridColumns)

      // Find next available position that fits this span
      while (true) {
        // Check if span fits at current position
        if (autoCol + span > this.gridColumns) {
          autoRow++
          autoCol = 0
          continue
        }

        // Check if all cells in span are free
        let allFree = true
        for (let c = autoCol; c < autoCol + span; c++) {
          if (this.gridMap.has(`${autoRow}:${c}`)) {
            allFree = false
            break
          }
        }

        if (allFree) break

        // Move to next column
        autoCol++
        if (autoCol >= this.gridColumns) {
          autoRow++
          autoCol = 0
        }
      }

      const placed: PlacedField = {
        fieldId: column.id,
        row: autoRow,
        col: autoCol,
        span,
      }
      this.addPlacedField(placed)

      // Advance position past the placed field
      autoCol += span
      if (autoCol >= this.gridColumns) {
        autoRow++
        autoCol = 0
      }
    }

    // Sort placed fields by row, then col
    this.placedFields.sort((a, b) => (a.row !== b.row ? a.row - b.row : a.col - b.col))

    // Compute total rows
    this.totalRows =
      this.placedFields.length > 0 ? Math.max(...this.placedFields.map((f) => f.row)) + 1 : 0
  }

  /**
   * Add a placed field to all internal data structures
   */
  private addPlacedField(placed: PlacedField): void {
    this.placedFields.push(placed)
    this.fieldIdToPlaced.set(placed.fieldId, placed)

    // Occupy grid cells
    for (let c = placed.col; c < placed.col + placed.span; c++) {
      this.gridMap.set(`${placed.row}:${c}`, placed.fieldId)
    }
  }

  // ==================== Navigation ====================

  /**
   * Get neighboring fields for keyboard navigation
   */
  getFieldNeighbors(fieldId: string): FieldNeighbors {
    const placed = this.fieldIdToPlaced.get(fieldId)
    if (!placed) return {}

    const neighbors: FieldNeighbors = {}

    // Up: Find field in the same column area, previous rows
    for (let r = placed.row - 1; r >= 0; r--) {
      const upFieldId = this.gridMap.get(`${r}:${placed.col}`)
      if (upFieldId && upFieldId !== fieldId) {
        neighbors.up = upFieldId
        break
      }
    }

    // Down: Find field in the same column area, next rows
    for (let r = placed.row + 1; r < this.totalRows; r++) {
      const downFieldId = this.gridMap.get(`${r}:${placed.col}`)
      if (downFieldId && downFieldId !== fieldId) {
        neighbors.down = downFieldId
        break
      }
    }

    // Left: Find field to the left in the same row
    for (let c = placed.col - 1; c >= 0; c--) {
      const leftFieldId = this.gridMap.get(`${placed.row}:${c}`)
      if (leftFieldId && leftFieldId !== fieldId) {
        neighbors.left = leftFieldId
        break
      }
    }

    // Right: Find field to the right in the same row
    for (let c = placed.col + placed.span; c < this.gridColumns; c++) {
      const rightFieldId = this.gridMap.get(`${placed.row}:${c}`)
      if (rightFieldId && rightFieldId !== fieldId) {
        neighbors.right = rightFieldId
        break
      }
    }

    return neighbors
  }

  /**
   * Get field's position in layout grid
   */
  getCellPosition(fieldId: string): CellPosition {
    const placed = this.fieldIdToPlaced.get(fieldId)
    if (!placed) {
      throw new Error(`Field not found: ${fieldId}`)
    }

    return {
      row: placed.row,
      col: placed.col,
    }
  }

  /**
   * Get field ID at specific position
   */
  getFieldAtPosition(row: number, col: number): string | null {
    if (row < 0 || col < 0 || col >= this.gridColumns || row >= this.totalRows) {
      return null
    }
    return this.gridMap.get(`${row}:${col}`) ?? null
  }

  /**
   * Get tab order for sequential navigation
   * Row-major order: left-to-right, top-to-bottom
   */
  getTabOrder(): string[] {
    // placedFields is already sorted by row, then col
    const seen = new Set<string>()
    const order: string[] = []

    for (const placed of this.placedFields) {
      if (!seen.has(placed.fieldId)) {
        seen.add(placed.fieldId)
        order.push(placed.fieldId)
      }
    }

    return order
  }

  // ==================== Rendering ====================

  /**
   * Get CSS grid template for the layout
   */
  getGridTemplate(): string {
    return Array(this.gridColumns).fill('1fr').join(' ')
  }

  /**
   * Get container styles for the layout
   */
  getContainerStyle(): CSSProperties {
    return {
      display: 'grid',
      gridTemplateColumns: this.getGridTemplate(),
      gap: this.fieldGap,
    }
  }

  /**
   * Get field-specific CSS styles for positioning
   */
  getFieldStyle(fieldId: string): CSSProperties {
    const placed = this.fieldIdToPlaced.get(fieldId)
    if (!placed) {
      return {
        display: 'flex',
        flexDirection: 'column',
        gap: this.labelGap,
      }
    }

    const style: CSSProperties = {
      display: 'flex',
      flexDirection: 'column',
      gap: this.labelGap,
    }

    // Apply grid column span if > 1
    if (placed.span > 1) {
      style.gridColumn = `span ${placed.span}`
    }

    return style
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

  // ==================== Accessors ====================

  /**
   * Get the computed placements for rendering
   */
  getPlacedFields(): ReadonlyArray<PlacedField> {
    return this.placedFields
  }

  /**
   * Get the number of grid columns
   */
  getGridColumnCount(): number {
    return this.gridColumns
  }

  /**
   * Get the total number of rows
   */
  getTotalRows(): number {
    return this.totalRows
  }

  /**
   * Get the placed field info for a field ID
   */
  getPlacedField(fieldId: string): PlacedField | undefined {
    return this.fieldIdToPlaced.get(fieldId)
  }

  // ==================== Update Methods ====================

  /**
   * Update columns and recompute placements
   */
  updateColumns(columns: Column[]): void {
    this.columns = columns
    this.computePlacements()
  }

  /**
   * Update field placements and recompute
   */
  updatePlacements(placements: FieldPlacement[]): void {
    this.fieldPlacements = placements
    this.computePlacements()
  }
}
