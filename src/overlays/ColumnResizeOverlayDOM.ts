import type { ColumnResizeState } from '../types';
import type { CoordinateMapping } from '../machines/table-machine/slices/dimensions-slice';
import { log } from '@/logger';
const fileLog = log('components/custom/vibegrid/overlays/ColumnResizeOverlayDOM.ts');

// ====================================
// COLUMN RESIZE OVERLAY - DOM Implementation
// ====================================

export interface ColumnResizeOverlayConfig {
  resizeIndicatorColor?: string;
  resizeIndicatorWidth?: number;
  headerHeight: number;
  totalHeight: number;
}

export class ColumnResizeOverlayDOM {
  private container: HTMLElement;
  private config: ColumnResizeOverlayConfig;
  private coordinateMapping: CoordinateMapping | null = null;
  
  // DOM elements
  private overlayContainer: HTMLDivElement | null = null;
  private resizeIndicator: HTMLDivElement | null = null;
  
  constructor(
    container: HTMLElement,
    config: ColumnResizeOverlayConfig
  ) {
    this.container = container;
    this.config = {
      resizeIndicatorColor: '#3b82f6',
      resizeIndicatorWidth: 2,
      ...config
    };
    
    this.initContainer();
  }
  
  /**
   * Initialize DOM container
   */
  private initContainer(): void {
    this.overlayContainer = document.createElement('div');
    this.overlayContainer.className = 'vibegridx-column-resize-container';
    Object.assign(this.overlayContainer.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      right: '0',
      bottom: '0',
      pointerEvents: 'none',
      zIndex: '25'
    });
    
    this.container.appendChild(this.overlayContainer);
  }
  
  /**
   * Update coordinate mapping
   */
  updateCoordinateMapping(coordinateMapping: CoordinateMapping): void {
    this.coordinateMapping = coordinateMapping;
  }
  
  /**
   * Update the resize indicator based on current resize state
   */
  updateResizePreview(resizeState: ColumnResizeState | null): void {
    if (!resizeState?.isResizing || !resizeState.columnId) {
      this.clear();
      return;
    }
    
    if (!this.coordinateMapping) {
      fileLog.warn('ColumnResizeOverlayDOM: No coordinate mapping available');
      return;
    }
    
    // Get column info from coordinate mapping
    const column = this.coordinateMapping.columns.find(col => col.columnId === resizeState.columnId);
    if (!column) {
      fileLog.warn('ColumnResizeOverlayDOM: Column not found:', resizeState.columnId);
      return;
    }
    
    // Calculate new position based on resize (right edge of the column)
    const newX = column.offset + (resizeState.newWidth || column.width);
    
    // Account for horizontal scroll position - get from header viewport which handles horizontal scrolling
    const headerViewport = this.container.querySelector('.vibegridx-header-viewport') as HTMLElement;
    const bodyViewport = this.container.querySelector('.vibegridx-viewport') as HTMLElement;
    const scrollLeft = headerViewport ? headerViewport.scrollLeft : (bodyViewport ? bodyViewport.scrollLeft : 0);
    
    fileLog.debug('ColumnResizeOverlayDOM: Scroll debugging', {
      headerViewportFound: !!headerViewport,
      bodyViewportFound: !!bodyViewport,
      headerScrollLeft: headerViewport?.scrollLeft,
      bodyScrollLeft: bodyViewport?.scrollLeft,
      finalScrollLeft: scrollLeft
    });
    
    // Create or update resize indicator
    if (!this.resizeIndicator) {
      this.resizeIndicator = document.createElement('div');
      this.resizeIndicator.className = 'vibegridx-resize-indicator';
      this.overlayContainer?.appendChild(this.resizeIndicator);
    }
    
    // Position indicator (adjust for scroll position so it stays aligned with the column)
    const adjustedX = newX - scrollLeft;
    
    // Since overlay is inside viewport container, start from top of viewport
    // The viewport container itself is positioned below the header
    Object.assign(this.resizeIndicator.style, {
      position: 'absolute',
      left: `${adjustedX - this.config.resizeIndicatorWidth! / 2}px`,
      top: '0', // Start from top of viewport container
      width: `${this.config.resizeIndicatorWidth}px`,
      height: '100%', // Use full height of container
      backgroundColor: this.config.resizeIndicatorColor,
      boxShadow: '0 0 4px rgba(59, 130, 246, 0.5)',
      pointerEvents: 'none',
      opacity: '1',
      transition: 'none'
    });
    
    fileLog.info('ColumnResizeOverlayDOM: Indicator updated', {
      columnId: resizeState.columnId,
      newWidth: resizeState.newWidth,
      indicatorX: newX,
      scrollLeft: scrollLeft,
      adjustedX: adjustedX
    });
  }
  
  /**
   * Clear the resize indicator
   */
  clear(): void {
    if (this.resizeIndicator) {
      this.resizeIndicator.remove();
      this.resizeIndicator = null;
    }
  }
  
  /**
   * Destroy the overlay
   */
  destroy(): void {
    this.clear();
    
    if (this.overlayContainer) {
      this.overlayContainer.remove();
      this.overlayContainer = null;
    }
  }
}