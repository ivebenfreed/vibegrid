/**
 * VibeGrid Dimensions - Single Source of Truth
 *
 * All grid dimensions, offsets, and layout calculations centralized here.
 * This eliminates the 4+ hardcoded constants scattered across the codebase.
 */

export const GRID_DIMENSIONS = {
  // Core row dimensions
  ROW_HEIGHT: 40,
  HEADER_HEIGHT: 48,

  // Column dimensions
  DEFAULT_COLUMN_WIDTH: 150,
  MIN_COLUMN_WIDTH: 50,
  MAX_COLUMN_WIDTH: 500,

  // Layout component widths
  DRAG_COLUMN_WIDTH: 30,
  ROW_HEADER_WIDTH: 40,
  SELECTION_COLUMN_WIDTH: 50,

  // Derived calculations (getters for consistency)
  get CONTENT_OFFSET_X() {
    return this.DRAG_COLUMN_WIDTH + this.ROW_HEADER_WIDTH // 70px total
  },

  get TOTAL_HEADER_HEIGHT() {
    return this.HEADER_HEIGHT
  },

  // Virtualization settings
  // Buffer rows above/below viewport to prevent blank areas during fast scroll
  // PERF: Reduced from 15 to 10 - at ~0.8ms/row, 20 rows = 16ms frame budget
  // 10 rows × 36px = 360px buffer on each side
  BUFFER_ROWS: 10,
  BUFFER_COLUMNS: 4,

  // Performance thresholds
  RAF_THROTTLE_MS: 16, // 60fps
  POSITION_UPDATE_THROTTLE_MS: 16,

  // Visual feedback
  SELECTION_BORDER_WIDTH: 2,
  RESIZE_HANDLE_WIDTH: 4,

  // Z-index layers
  Z_INDEX: {
    TABLE_CONTENT: 1,
    OVERLAYS: 100, // Base overlay layer
    CLIPBOARD: 100, // Clipboard indicators (same as base, integer value)
    SELECTION: 101, // Selection highlighting
    FILL_PREVIEW: 102, // Fill drag preview (above selection)
    FILL_HANDLE: 103, // Fill handle knob (above preview)
    EDITING: 104, // Active cell editor (above fill layers)
    DRAG_PREVIEW: 105, // Row/column drag preview
    CONTEXT_MENU: 106, // Context menus
    MODAL_BACKDROP: 9990,
    MODAL_CONTENT: 9999,
  },
} as const

// Type for dimensions (useful for props/interfaces)
export type GridDimensions = typeof GRID_DIMENSIONS

// Helper functions for common calculations
export const GridCalculations = {
  /**
   * Calculate total content width including fixed columns
   */
  getTotalContentWidth(visibleColumnWidths: number[]): number {
    const columnsWidth = visibleColumnWidths.reduce((sum, width) => sum + width, 0)
    return GRID_DIMENSIONS.CONTENT_OFFSET_X + columnsWidth
  },

  /**
   * Calculate total content height for virtualization
   */
  getTotalContentHeight(rowCount: number): number {
    return GRID_DIMENSIONS.HEADER_HEIGHT + rowCount * GRID_DIMENSIONS.ROW_HEIGHT
  },

  /**
   * Get row position from index
   */
  getRowOffset(rowIndex: number): number {
    return GRID_DIMENSIONS.HEADER_HEIGHT + rowIndex * GRID_DIMENSIONS.ROW_HEIGHT
  },

  /**
   * Get column position from cumulative widths
   */
  getColumnOffset(columnIndex: number, columnWidths: number[]): number {
    let offset = GRID_DIMENSIONS.CONTENT_OFFSET_X
    for (let i = 0; i < columnIndex && i < columnWidths.length; i++) {
      offset += columnWidths[i]
    }
    return offset
  },

  /**
   * Calculate visible row range for virtualization
   */
  getVisibleRowRange(
    scrollTop: number,
    viewportHeight: number,
    totalRows: number,
  ): { start: number; end: number } {
    const buffer = GRID_DIMENSIONS.BUFFER_ROWS
    const rowHeight = GRID_DIMENSIONS.ROW_HEIGHT

    const start = Math.max(0, Math.floor(scrollTop / rowHeight) - buffer)
    const end = Math.min(totalRows, Math.ceil((scrollTop + viewportHeight) / rowHeight) + buffer)

    return { start, end }
  },

  /**
   * Calculate visible column range for virtualization
   */
  getVisibleColumnRange(
    scrollLeft: number,
    viewportWidth: number,
    columnWidths: number[],
  ): { start: number; end: number } {
    const buffer = GRID_DIMENSIONS.BUFFER_COLUMNS
    let currentX = GRID_DIMENSIONS.CONTENT_OFFSET_X
    let start = 0
    let end = columnWidths.length

    for (let i = 0; i < columnWidths.length; i++) {
      const colWidth = columnWidths[i]

      // Find start column
      if (currentX + colWidth > scrollLeft && start === 0) {
        start = Math.max(0, i - buffer)
      }

      // Find end column
      if (currentX > scrollLeft + viewportWidth && end === columnWidths.length) {
        end = Math.min(columnWidths.length, i + buffer)
        break
      }

      currentX += colWidth
    }

    return { start, end }
  },
}

// Export individual constants for convenience
export const {
  ROW_HEIGHT,
  HEADER_HEIGHT,
  DEFAULT_COLUMN_WIDTH,
  CONTENT_OFFSET_X,
  BUFFER_ROWS,
  BUFFER_COLUMNS,
} = GRID_DIMENSIONS
