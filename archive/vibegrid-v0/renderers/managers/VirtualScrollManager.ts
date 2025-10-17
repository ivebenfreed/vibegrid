import type { ViewportInfo } from '../../types';
import { createLogger, type LogLevel } from '@/logger/simple-logger';

// File-level log control
const LOG_LEVEL: LogLevel | undefined = undefined;  // Use global (quiet)
const log = createLogger('VirtualScrollManager', LOG_LEVEL);

// ====================================
// VIRTUAL GRID MANAGER
// ====================================

/**
 * Manages virtual scrolling calculations and viewport state
 * Extracted from TableRenderer for better separation of concerns
 */
export class VirtualScrollManager {
  private viewport: ViewportInfo;
  private totalRows: number;
  private rowHeight: number;
  private visibleRange: { start: number; end: number };
  
  constructor(initialViewport: ViewportInfo) {
    this.viewport = initialViewport;
    this.totalRows = 0;
    this.rowHeight = initialViewport.itemHeight;
    
    // Initialize visible range from initial viewport
    // Don't subtract/add buffer rows here - just use the viewport as-is
    // The buffer will be applied properly in updateViewport when we have totalRows
    this.visibleRange = {
      start: initialViewport.start,
      end: initialViewport.end
    };
  }
  
  updateViewport(viewport: ViewportInfo, totalRows: number): boolean {
    const oldRange = { ...this.visibleRange };
    
    this.viewport = viewport;
    this.totalRows = totalRows;
    this.rowHeight = viewport.itemHeight;
    
    // The viewport already includes buffer from calculateViewportFromScroll
    // So we just use it directly without adding more buffer
    this.visibleRange = {
      start: viewport.start,
      end: Math.min(totalRows, viewport.end)
    };
    
    // Return true if range changed
    return oldRange.start !== this.visibleRange.start || 
           oldRange.end !== this.visibleRange.end;
  }
  
  isRowVisible(index: number): boolean {
    return index >= this.visibleRange.start && index < this.visibleRange.end;
  }
  
  getVisibleRange(): { start: number; end: number } {
    return { ...this.visibleRange };
  }
  
  getRowTop(index: number): number {
    // Since we use box-sizing: border-box, borders are included in row height
    return index * this.rowHeight;
  }
  
  getTotalHeight(): number {
    // Calculate base height for all rows
    const baseHeight = this.totalRows * this.rowHeight;
    
    // Add extra space at the bottom to ensure the last row is never cut off
    // This needs to be at least one row height to guarantee full visibility
    const bottomPadding = this.rowHeight;
    
    return Math.max(0, baseHeight + bottomPadding);
  }
  
  getRowHeight(): number {
    return this.rowHeight;
  }
  
  setRowCount(count: number): void {
    this.totalRows = count;
  }
  
  /**
   * Calculate viewport info from scroll position
   * Used during scroll events
   */
  calculateViewportFromScroll(
    scrollTop: number, 
    viewportHeight: number, 
    viewportWidth: number,
    scrollLeft: number = 0
  ): ViewportInfo {
    // Calculate visible rows based on scroll position
    const calculatedStart = Math.floor(scrollTop / this.rowHeight);
    // Calculate how many rows fit in viewport, ensuring we always show enough
    const visibleRowCount = Math.ceil(viewportHeight / this.rowHeight);
    // Add buffer rows for smooth scrolling
    const bufferRows = 5;
    const calculatedEnd = calculatedStart + visibleRowCount + bufferRows;
    
    // Cap to actual row count
    const cappedEnd = Math.min(calculatedEnd, this.totalRows);
    
    
    return {
      start: calculatedStart,
      end: cappedEnd,
      height: viewportHeight,
      width: viewportWidth,
      scrollTop: scrollTop,
      scrollLeft: scrollLeft,
      itemHeight: this.rowHeight
    };
  }
  
  /**
   * Get performance metrics
   */
  getMetrics() {
    return {
      totalRows: this.totalRows,
      rowHeight: this.rowHeight,
      visibleRange: this.visibleRange,
      viewport: this.viewport,
      totalHeight: this.getTotalHeight()
    };
  }
}