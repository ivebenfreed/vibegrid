import type { ColumnResizeState } from '../types';
import type { CoordinateMapping } from '../machines/table-machine/slices/dimensions-slice';
import { createLogger } from '@/lib/logging';
const fileLog = createLogger('components/custom/vibegrid/overlays/ColumnResizeOverlayDOM.ts');

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
    fileLog.info('[RESIZE-PREVIEW] 🎯 ColumnResizeOverlay.updateResizePreview called', {
      hasResizeState: !!resizeState,
      isResizing: resizeState?.isResizing,
      columnId: resizeState?.columnId,
      newWidth: resizeState?.newWidth
    });

    if (!resizeState?.isResizing || !resizeState.columnId) {
      fileLog.info('[RESIZE-PREVIEW] 🧹 Clearing resize preview (no active resize)');
      this.clear();
      return;
    }
    
    // SIMPLER APPROACH: Get position directly from the column header element in the DOM
    const headerCell = this.container.querySelector(`[data-column-id="${resizeState.columnId}"]`) as HTMLElement;
    if (!headerCell) {
      fileLog.warn('[RESIZE-PREVIEW] ⚠️ Column header element not found:', resizeState.columnId);
      return;
    }

    const headerRect = headerCell.getBoundingClientRect();
    const containerRect = this.container.getBoundingClientRect();

    // Calculate position: left edge of column + new width
    const columnLeft = headerRect.left - containerRect.left;
    const newX = columnLeft + (resizeState.newWidth || 150);

    fileLog.info('[RESIZE-PREVIEW] 📏 Column position from DOM', {
      columnId: resizeState.columnId,
      headerLeft: headerRect.left,
      containerLeft: containerRect.left,
      columnLeftRelative: columnLeft,
      newWidth: resizeState.newWidth,
      calculatedX: newX
    });

    // Create or update resize indicator
    if (!this.resizeIndicator) {
      fileLog.info('[RESIZE-PREVIEW] 🎨 Creating NEW resize indicator element');
      this.resizeIndicator = document.createElement('div');
      this.resizeIndicator.className = 'vibegridx-resize-indicator';
      this.overlayContainer?.appendChild(this.resizeIndicator);
      fileLog.info('[RESIZE-PREVIEW] ✅ Resize indicator appended to overlay container');
    } else {
      fileLog.info('[RESIZE-PREVIEW] ♻️ Reusing existing resize indicator');
    }

    // Position indicator using absolute positioning within overlay container
    Object.assign(this.resizeIndicator.style, {
      position: 'absolute',
      left: `${newX - this.config.resizeIndicatorWidth! / 2}px`,
      top: '0',
      width: `${this.config.resizeIndicatorWidth}px`,
      height: '100%',
      backgroundColor: this.config.resizeIndicatorColor,
      boxShadow: '0 0 4px rgba(59, 130, 246, 0.5)',
      pointerEvents: 'none',
      opacity: '1',
      transition: 'none',
      zIndex: '1000'
    });
    
    fileLog.info('[RESIZE-PREVIEW] 🎨 Resize indicator positioned', {
      columnId: resizeState.columnId,
      newWidth: resizeState.newWidth,
      indicatorX: newX,
      scrollLeft: scrollLeft,
      adjustedX: adjustedX,
      left: `${adjustedX - this.config.resizeIndicatorWidth! / 2}px`,
      width: `${this.config.resizeIndicatorWidth}px`,
      color: this.config.resizeIndicatorColor,
      zIndex: this.resizeIndicator.style.zIndex,
      display: this.resizeIndicator.style.display,
      visibility: this.resizeIndicator.style.visibility
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