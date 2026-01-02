import { log } from '@/logger'
import type { Column } from '../../types'

const fileLog = log('components/custom/vibegrid/renderers/managers/ColumnManager.ts')

// ====================================
// COLUMN MANAGER - PASSIVE UTILITY
// ====================================

/**
 * PASSIVE utility for accessing column data from the state machine
 * No longer manages its own state - all data comes from the table machine
 */
export class ColumnManager {
  private enableSelectionColumn: boolean

  constructor(
    options: {
      enableSelectionColumn?: boolean
    } = {},
  ) {
    this.enableSelectionColumn = true // Selection column is always enabled
  }

  /**
   * Get all columns from state machine data
   */
  getColumns(columns: Column[]): Column[] {
    return columns
  }

  /**
   * Get column width from state machine data
   */
  getColumnWidth(
    columnId: string,
    columnWidths: Record<string, number>,
    columns: Column[],
    defaultWidth = 120,
  ): number {
    const column = columns.find((c) => c.id === columnId)
    return columnWidths[columnId] || column?.width || defaultWidth
  }

  /**
   * Get visible columns using state machine data
   */
  getVisibleColumns(columns: Column[], columnVisibility: Record<string, boolean>): Column[] {
    return columns.filter((column) => {
      // If no visibility settings, all columns are visible by default
      if (Object.keys(columnVisibility).length === 0) {
        return true
      }
      // Otherwise check visibility setting (default to true if not specified)
      return columnVisibility[column.id] !== false
    })
  }

  /**
   * Get data columns (visible columns excluding selection column)
   */
  getDataColumns(columns: Column[], columnVisibility: Record<string, boolean>): Column[] {
    const visibleColumns = this.getVisibleColumns(columns, columnVisibility)
    // Filter out the selection column when enabled
    // Always filter out selection column since it's always enabled
    return visibleColumns.filter((col) => col.id !== '__selection')
  }

  /**
   * Check if selection column is enabled
   */
  isSelectionColumnEnabled(): boolean {
    return true // Selection column is always enabled
  }

  /**
   * Get total width from state machine data - USE STATE MACHINE VALUES
   */
  getTotalWidth(totalWidth: number): number {
    // State machine is the authoritative source
    return totalWidth
  }

  /**
   * Get column by ID from state machine data
   */
  getColumnById(columnId: string, columns: Column[]): Column | undefined {
    return columns.find((col) => col.id === columnId)
  }

  /**
   * Get visible column order using state machine data
   */
  getVisibleColumnOrder(columns: Column[], columnVisibility: Record<string, boolean>): string[] {
    return this.getVisibleColumns(columns, columnVisibility).map((col) => col.id)
  }

  /**
   * Get column index in visible columns using state machine data
   */
  getVisibleColumnIndex(
    columnId: string,
    columns: Column[],
    columnVisibility: Record<string, boolean>,
  ): number {
    const visibleColumns = this.getVisibleColumns(columns, columnVisibility)
    return visibleColumns.findIndex((col) => col.id === columnId)
  }

  /**
   * Get total width of all visible columns using STATE MACHINE coordinate mapping
   * @param coordinateMapping Authoritative coordinate mapping from state machine
   */
  getTotalColumnsWidth(coordinateMapping: any): number {
    // State machine coordinateMapping is the authoritative source
    const totalWidth = coordinateMapping.columns.reduce(
      (sum: number, col: any) => sum + col.width,
      0,
    )

    fileLog.info('ColumnManager: Using state machine total width:', {
      totalWidth,
      columnCount: coordinateMapping.columns.length,
      version: coordinateMapping.version,
    })

    return totalWidth
  }

  /**
   * Get column offset position using STATE MACHINE coordinate mapping
   * @param columnId The column ID to get offset for
   * @param coordinateMapping Authoritative coordinate mapping from state machine
   */
  getColumnOffset(columnId: string, coordinateMapping: any): number {
    // State machine coordinateMapping is the authoritative source
    const colData = coordinateMapping.columns.find((col: any) => col.columnId === columnId)

    if (!colData) {
      fileLog.warn(`ColumnManager: Column ${columnId} not found in coordinate mapping`)
      return 0
    }

    return colData.offset
  }

  /**
   * Get all column offsets using STATE MACHINE coordinate mapping
   * @param coordinateMapping Authoritative coordinate mapping from state machine
   * @returns Map of column ID to offset position
   */
  getColumnOffsets(coordinateMapping: any): Record<string, number> {
    // State machine coordinateMapping is the authoritative source
    const offsets: Record<string, number> = {}

    coordinateMapping.columns.forEach((col: any) => {
      offsets[col.columnId] = col.offset
    })

    return offsets
  }

  /**
   * Get column width using STATE MACHINE coordinate mapping
   * @param columnId The column ID to get width for
   * @param coordinateMapping Authoritative coordinate mapping from state machine
   */
  getColumnWidthFromMapping(columnId: string, coordinateMapping: any): number {
    // State machine coordinateMapping is the authoritative source
    const colData = coordinateMapping.columns.find((col: any) => col.columnId === columnId)

    if (!colData) {
      fileLog.warn(`ColumnManager: Column ${columnId} not found in coordinate mapping`)
      return 120 // Default width
    }

    return colData.width
  }

  /**
   * Get metrics for debugging using state machine data
   */
  getMetrics(columns: Column[], columnVisibility: Record<string, boolean>, coordinateMapping: any) {
    const visibleColumns = this.getVisibleColumns(columns, columnVisibility)
    return {
      totalColumns: columns.length,
      visibleColumns: visibleColumns.length,
      hiddenColumns: columns.length - visibleColumns.length,
      selectionColumnEnabled: this.enableSelectionColumn,
      totalWidth: this.getTotalColumnsWidth(coordinateMapping),
      coordinateVersion: coordinateMapping.version,
    }
  }
}
