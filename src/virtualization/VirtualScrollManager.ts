/**
 * Virtual Scroll Manager - Minimal coordinate calculations for virtualization only
 *
 * This manager ONLY handles:
 * 1. Calculating which rows/columns need to be rendered
 * 2. Virtual positions for non-DOM cells
 * 3. Scroll boundaries and content dimensions
 *
 * It does NOT handle overlay positioning - that's done via DOM positions.
 */

// TODO: Remove Legend State - migrating to MobX
// import { observable, computed } from '@legendapp/state';
import { GRID_DIMENSIONS, GridCalculations } from '../constants/grid-dimensions';
import type {
  VirtualBounds,
  VirtualViewport,
  VirtualRange,
  CellCoordinates,
  ColumnLayout,
  RowLayout
} from '../types/coordinate-types';
import { CoordinateUtils } from '../types/coordinate-types';
import { createLogger } from '@/lib/logging';

const fileLog = createLogger('components/custom/vibegrid/virtualization/VirtualScrollManager.ts');

// ====================================
// VIRTUAL STATE OBSERVABLES
// ====================================

// Virtual bounds - what data we have
export const virtualBounds$ = observable<VirtualBounds>({
  rowHeight: GRID_DIMENSIONS.ROW_HEIGHT,
  columnWidths: [],
  totalRows: 0,
  totalColumns: 0
});

// Virtual viewport - where the user is looking
export const virtualViewport$ = observable<VirtualViewport>({
  scrollTop: 0,
  scrollLeft: 0,
  viewportWidth: 0,
  viewportHeight: 0
});

// Virtual column layouts - mirrors visual-state but simplified
export const virtualColumnLayouts$ = observable<ColumnLayout[]>([]);

// Virtual row layouts - for grouping support
export const virtualRowLayouts$ = observable<RowLayout[]>([]);

// ====================================
// COMPUTED VIRTUAL RANGES
// ====================================

/**
 * Calculate which rows need to be rendered in the viewport
 */
export const virtualizedRowRange$ = computed(() => {
  const bounds = virtualBounds$.get();
  const viewport = virtualViewport$.get();

  return GridCalculations.getVisibleRowRange(
    viewport.scrollTop,
    viewport.viewportHeight,
    bounds.totalRows
  );
});

/**
 * Calculate which columns need to be rendered in the viewport
 */
export const virtualizedColumnRange$ = computed(() => {
  const bounds = virtualBounds$.get();
  const viewport = virtualViewport$.get();

  return GridCalculations.getVisibleColumnRange(
    viewport.scrollLeft,
    viewport.viewportWidth,
    bounds.columnWidths
  );
});

/**
 * Complete virtualized range with dimensions
 */
export const virtualizedRange$ = computed(() => {
  const bounds = virtualBounds$.get();
  const rowRange = virtualizedRowRange$.get();
  const columnRange = virtualizedColumnRange$.get();

  const totalHeight = GridCalculations.getTotalContentHeight(bounds.totalRows);
  const totalWidth = GridCalculations.getTotalContentWidth(bounds.columnWidths);

  const range: VirtualRange = {
    rows: rowRange,
    columns: columnRange,
    totalHeight,
    totalWidth
  };

  fileLog.debug('📊 Virtual range calculated', {
    rowRange,
    columnRange,
    totalHeight,
    totalWidth,
    viewportHeight: virtualViewport$.viewportHeight.get(),
    scrollTop: virtualViewport$.scrollTop.get()
  });

  return range;
});

// ====================================
// VIRTUAL POSITION CALCULATOR
// ====================================

/**
 * Calculate position for virtual (non-DOM) cells
 */
export const virtualCellPosition$ = computed(() => {
  const bounds = virtualBounds$.get();
  const columnLayouts = virtualColumnLayouts$.get();

  return {
    /**
     * Get position for a cell that may not be in the DOM
     */
    getCellPosition(rowIndex: number, columnIndex: number): CellCoordinates {
      // Calculate Y position (simple - uniform row height)
      const y = GridCalculations.getRowOffset(rowIndex);

      // Calculate X position using column layouts if available
      let x: number;
      let width: number;

      if (columnLayouts.length > 0 && columnLayouts[columnIndex]) {
        x = columnLayouts[columnIndex].offset;
        width = columnLayouts[columnIndex].width;
      } else {
        // Fallback to simple calculation
        x = GridCalculations.getColumnOffset(columnIndex, bounds.columnWidths);
        width = bounds.columnWidths[columnIndex] || GRID_DIMENSIONS.DEFAULT_COLUMN_WIDTH;
      }

      return {
        x,
        y,
        width,
        height: bounds.rowHeight,
        source: 'virtual',
        isVisible: false, // Virtual cells are not visible by definition
        timestamp: Date.now()
      };
    },

    /**
     * Get position for a cell by IDs
     */
    getCellPositionByIds(rowId: string, columnId: string): CellCoordinates | null {
      // Convert IDs to indices (assumes numeric IDs or mapping available)
      const rowIndex = this.getRowIndex(rowId);
      const columnIndex = this.getColumnIndex(columnId);

      if (rowIndex === -1 || columnIndex === -1) {
        return null;
      }

      return this.getCellPosition(rowIndex, columnIndex);
    },

    /**
     * Get row index from ID
     */
    getRowIndex(rowId: string): number {
      const rowLayouts = virtualRowLayouts$.get();
      const index = rowLayouts.findIndex(row => row.id === rowId);
      return index !== -1 ? index : parseInt(rowId, 10) || -1;
    },

    /**
     * Get column index from ID
     */
    getColumnIndex(columnId: string): number {
      const columnLayouts = virtualColumnLayouts$.get();
      const index = columnLayouts.findIndex(col => col.id === columnId);
      return index !== -1 ? index : parseInt(columnId, 10) || -1;
    },

    /**
     * Check if cell is in visible range
     */
    isCellInVisibleRange(rowIndex: number, columnIndex: number): boolean {
      const range = virtualizedRange$.get();
      return (
        rowIndex >= range.rows.start &&
        rowIndex < range.rows.end &&
        columnIndex >= range.columns.start &&
        columnIndex < range.columns.end
      );
    }
  };
});

// ====================================
// SCROLL MANAGEMENT
// ====================================

/**
 * Scroll to a specific row
 */
export function scrollToRow(rowIndex: number): void {
  const bounds = virtualBounds$.get();
  const viewport = virtualViewport$.get();

  if (rowIndex < 0 || rowIndex >= bounds.totalRows) {
    return;
  }

  const targetY = GridCalculations.getRowOffset(rowIndex);
  const currentScrollTop = viewport.scrollTop;
  const viewportHeight = viewport.viewportHeight;

  // Check if already visible
  if (
    targetY >= currentScrollTop &&
    targetY + bounds.rowHeight <= currentScrollTop + viewportHeight
  ) {
    return; // Already visible
  }

  // Scroll to make row visible
  let newScrollTop: number;
  if (targetY < currentScrollTop) {
    // Row is above viewport - scroll up
    newScrollTop = targetY;
  } else {
    // Row is below viewport - scroll down
    newScrollTop = targetY + bounds.rowHeight - viewportHeight;
  }

  virtualViewport$.scrollTop.set(Math.max(0, newScrollTop));

  fileLog.info('📜 Scrolled to row', {
    rowIndex,
    targetY,
    newScrollTop,
    wasVisible: false
  });
}

/**
 * Scroll to a specific column
 */
export function scrollToColumn(columnIndex: number): void {
  const bounds = virtualBounds$.get();
  const viewport = virtualViewport$.get();

  if (columnIndex < 0 || columnIndex >= bounds.columnWidths.length) {
    return;
  }

  const targetX = GridCalculations.getColumnOffset(columnIndex, bounds.columnWidths);
  const columnWidth = bounds.columnWidths[columnIndex] || GRID_DIMENSIONS.DEFAULT_COLUMN_WIDTH;
  const currentScrollLeft = viewport.scrollLeft;
  const viewportWidth = viewport.viewportWidth;

  // Check if already visible
  if (
    targetX >= currentScrollLeft &&
    targetX + columnWidth <= currentScrollLeft + viewportWidth
  ) {
    return; // Already visible
  }

  // Scroll to make column visible
  let newScrollLeft: number;
  if (targetX < currentScrollLeft) {
    // Column is left of viewport - scroll left
    newScrollLeft = targetX;
  } else {
    // Column is right of viewport - scroll right
    newScrollLeft = targetX + columnWidth - viewportWidth;
  }

  virtualViewport$.scrollLeft.set(Math.max(0, newScrollLeft));

  fileLog.info('📜 Scrolled to column', {
    columnIndex,
    targetX,
    newScrollLeft,
    wasVisible: false
  });
}

// ====================================
// UPDATE OPERATIONS
// ====================================

/**
 * Update virtual bounds when data changes
 */
export function updateVirtualBounds(options: {
  totalRows?: number;
  columnWidths?: number[];
  rowHeight?: number;
}): void {
  const current = virtualBounds$.get();

  virtualBounds$.set({
    ...current,
    ...options
  });

  fileLog.info('📊 Virtual bounds updated', {
    totalRows: options.totalRows ?? current.totalRows,
    columnCount: options.columnWidths?.length ?? current.columnWidths.length,
    rowHeight: options.rowHeight ?? current.rowHeight
  });
}

/**
 * Update viewport dimensions and scroll position
 */
export function updateVirtualViewport(options: {
  scrollTop?: number;
  scrollLeft?: number;
  viewportWidth?: number;
  viewportHeight?: number;
}): void {
  const current = virtualViewport$.get();

  virtualViewport$.set({
    ...current,
    ...options
  });

  // Don't log every scroll update to avoid spam
  if (options.viewportWidth !== undefined || options.viewportHeight !== undefined) {
    fileLog.debug('📐 Virtual viewport updated', {
      viewportWidth: options.viewportWidth ?? current.viewportWidth,
      viewportHeight: options.viewportHeight ?? current.viewportHeight,
      scrollTop: options.scrollTop ?? current.scrollTop,
      scrollLeft: options.scrollLeft ?? current.scrollLeft
    });
  }
}

/**
 * Update column layouts for accurate positioning
 */
export function updateVirtualColumns(columns: ColumnLayout[]): void {
  virtualColumnLayouts$.set(columns);

  // Update column widths in bounds
  const columnWidths = columns.map(col => col.width);
  updateVirtualBounds({ columnWidths });

  fileLog.info('📊 Virtual columns updated', {
    columnCount: columns.length,
    totalWidth: columnWidths.reduce((sum, w) => sum + w, 0)
  });
}

/**
 * Update row layouts for grouping support
 */
export function updateVirtualRows(rows: RowLayout[]): void {
  virtualRowLayouts$.set(rows);

  // Update total rows in bounds
  updateVirtualBounds({ totalRows: rows.length });

  fileLog.info('📊 Virtual rows updated', {
    rowCount: rows.length,
    groupRows: rows.filter(r => r.type === 'group').length
  });
}

// ====================================
// UTILITY FUNCTIONS
// ====================================

/**
 * Get scroll boundaries to prevent over-scrolling
 */
export function getScrollBoundaries(): {
  maxScrollTop: number;
  maxScrollLeft: number;
} {
  const bounds = virtualBounds$.get();
  const viewport = virtualViewport$.get();

  const totalHeight = GridCalculations.getTotalContentHeight(bounds.totalRows);
  const totalWidth = GridCalculations.getTotalContentWidth(bounds.columnWidths);

  return {
    maxScrollTop: Math.max(0, totalHeight - viewport.viewportHeight),
    maxScrollLeft: Math.max(0, totalWidth - viewport.viewportWidth)
  };
}

/**
 * Get virtual position for a cell key
 */
export function getVirtualCellPosition(cellKey: string): CellCoordinates | null {
  const cellRef = CoordinateUtils.parseCellKey(cellKey);
  if (!cellRef) return null;

  return virtualCellPosition$.get().getCellPositionByIds(cellRef.rowId, cellRef.columnId);
}

/**
 * Check if virtual scrolling is needed
 */
export function needsVirtualization(): { rows: boolean; columns: boolean } {
  const bounds = virtualBounds$.get();
  const viewport = virtualViewport$.get();

  // Threshold for enabling virtualization - very aggressive for performance
  const ROW_THRESHOLD = 20; // Enable for >20 rows (was 100)
  const COLUMN_THRESHOLD = 15; // Enable for >15 columns (was 20)

  return {
    rows: bounds.totalRows > ROW_THRESHOLD,
    columns: bounds.columnWidths.length > COLUMN_THRESHOLD
  };
}

/**
 * Get performance stats
 */
export function getVirtualizationStats(): {
  totalCells: number;
  renderedCells: number;
  virtualizationRatio: number;
  scrollPosition: { top: number; left: number };
} {
  const bounds = virtualBounds$.get();
  const range = virtualizedRange$.get();
  const viewport = virtualViewport$.get();

  const totalCells = bounds.totalRows * bounds.totalColumns;
  const renderedRows = range.rows.end - range.rows.start;
  const renderedColumns = range.columns.end - range.columns.start;
  const renderedCells = renderedRows * renderedColumns;

  return {
    totalCells,
    renderedCells,
    virtualizationRatio: totalCells > 0 ? renderedCells / totalCells : 0,
    scrollPosition: {
      top: viewport.scrollTop,
      left: viewport.scrollLeft
    }
  };
}