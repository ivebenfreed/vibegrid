/**
 * Layout Configuration Types for VibeGrid
 *
 * These types enable VibeGrid to render in different layouts beyond the traditional grid:
 * - property-sheet: Vertical form layout (label left, value right)
 * - single-column: Stacked fields (label above, value below)
 * - two-column: Two fields per row
 * - inline-row: Horizontal inline layout
 * - grouped: Collapsible sections with named field groups
 * - grid: Traditional spreadsheet grid (default)
 */

import type { CSSProperties } from 'react'

import type { Column } from '../types'

/**
 * Layout type determines how fields are arranged
 */
export type LayoutType =
  | 'property-sheet'
  | 'single-column'
  | 'two-column'
  | 'inline-row'
  | 'grouped'
  | 'grid'

/**
 * Field placement configuration for custom layouts
 */
export interface FieldPlacement {
  /** Field ID from VibeGrid column definition */
  fieldId: string
  /** Row position (0-based index) */
  row?: number
  /** Column position (0-based index) */
  col?: number
  /** Column span (for multi-column layouts) */
  span?: number
}

/**
 * Responsive layout configuration
 */
export interface ResponsiveConfig {
  /** Layout to use on mobile devices */
  mobile: 'single-column' | 'property-sheet'
  /** Pixel threshold for mobile breakpoint */
  threshold: number
}

/**
 * Layout configuration for VibeGrid
 */
export interface LayoutConfig {
  /** Layout type */
  type: LayoutType
  /** Custom field placements (optional, for advanced layouts) */
  fields?: FieldPlacement[]
  /** Responsive configuration */
  responsive?: ResponsiveConfig
  /** Whether to show field labels */
  showLabels?: boolean
  /** Label position relative to value */
  labelPosition?: 'left' | 'above'
}

/**
 * Navigation neighbor result
 */
export interface FieldNeighbors {
  /** Field ID above current field (if any) */
  up?: string
  /** Field ID below current field (if any) */
  down?: string
  /** Field ID left of current field (if any) */
  left?: string
  /** Field ID right of current field (if any) */
  right?: string
}

/**
 * Cell position in layout
 */
export interface CellPosition {
  /** Row index (0-based) */
  row: number
  /** Column index (0-based) */
  col: number
}

/**
 * Props passed to the renderField slot function by layout components.
 * VibeForm constructs renderField to return VibeFormField (editable).
 * When renderField is not provided, layouts fall back to FormFieldValue.
 */
export interface FieldSlotProps {
  fieldId: string
  column: Column
  value: any
  rowData: any
  rowIndex: number
  /** Present when layout is wired to VibeForm's handleFieldChange */
  onChange?: (fieldId: string, value: any) => void
}

/**
 * Cell Layout Adapter Interface
 *
 * Adapters implement navigation and rendering logic for different layouts.
 * This allows VibeGrid's keyboard navigation, selection, and Y.js sync to work
 * consistently across grid, form, and custom layouts.
 */
export interface CellLayoutAdapter {
  // ==================== Navigation ====================

  /**
   * Get neighboring fields for keyboard navigation
   * @param fieldId - Current field ID
   * @returns Neighbor field IDs (up, down, left, right)
   */
  getFieldNeighbors(fieldId: string): FieldNeighbors

  /**
   * Get field's position in layout grid
   * @param fieldId - Field ID to locate
   * @returns Row and column indices
   */
  getCellPosition(fieldId: string): CellPosition

  /**
   * Get field ID at specific position
   * @param row - Row index
   * @param col - Column index
   * @returns Field ID at position, or null if empty
   */
  getFieldAtPosition(row: number, col: number): string | null

  /**
   * Get tab order for sequential navigation
   * @returns Ordered array of field IDs
   */
  getTabOrder(): string[]

  // ==================== Rendering ====================

  /**
   * Get CSS grid template string for layout
   * @returns CSS grid-template-areas or grid-template-columns/rows
   */
  getGridTemplate(): string

  /**
   * Get field-specific CSS styles for positioning
   * @param fieldId - Field ID to style
   * @returns CSS properties for field container
   */
  getFieldStyle(fieldId: string): CSSProperties

  // ==================== Y.js Integration (Future) ====================

  /**
   * Hook called when field receives focus (for Y.js awareness)
   * @param fieldId - Field that gained focus
   */
  onFieldFocus?(fieldId: string): void

  /**
   * Hook called when field loses focus (for Y.js awareness)
   * @param fieldId - Field that lost focus
   */
  onFieldBlur?(fieldId: string): void

  /**
   * Hook called when field value changes (for Y.js sync)
   * @param fieldId - Field that changed
   * @param value - New value
   */
  onValueChange?(fieldId: string, value: any): void
}
