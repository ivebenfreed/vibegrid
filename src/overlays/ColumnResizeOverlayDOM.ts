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
    fileLog.debug('[RESIZE-PREVIEW] 🎯 ColumnResizeOverlay.updateResizePreview called', {
      hasResizeState: !!resizeState,
      isResizing: resizeState?.isResizing,
      columnId: resizeState?.columnId,
      newWidth: resizeState?.newWidth
    });

    if (!resizeState?.isResizing || !resizeState.columnId) {
      fileLog.debug('[RESIZE-PREVIEW] 🧹 Clearing resize preview (no active resize)');
      this.clear();
      return;
    }

    let indicatorX: number;
    let overlayX: number;
    let scrollLeft: number;

    if (this.coordinateMapping && this.coordinateMapping.columns) {
      const columnMapping = this.coordinateMapping.columns.find(
        (col) => col.columnId === resizeState.columnId
      );

      if (!columnMapping) {
        fileLog.warn('[RESIZE-PREVIEW] ⚠️ Column not found in coordinate mapping', {
          columnId: resizeState.columnId,
          availableColumns: this.coordinateMapping.columns.map(col => col.columnId)
        });
        const fallback = this.calculateFallbackPosition(resizeState);
        if (!fallback) {
          return;
        }
        ({ indicatorX, overlayX, scrollLeft } = fallback);
      } else {
        const baseWidth = resizeState.newWidth ?? columnMapping.width ?? 150;
        indicatorX = columnMapping.offset + baseWidth;

        const viewportElement =
          this.container.parentElement?.closest('.vibegridx-viewport') as HTMLElement ??
          this.container.parentElement as HTMLElement ?? null;
        scrollLeft = viewportElement?.scrollLeft ?? 0;
        overlayX = indicatorX - scrollLeft;
      }
    } else {
      fileLog.warn('[RESIZE-PREVIEW] ⚠️ No coordinate mapping available for resize preview');
      const fallback = this.calculateFallbackPosition(resizeState);
      if (!fallback) {
        return;
      }
      ({ indicatorX, overlayX, scrollLeft } = fallback);
    }

    fileLog.debug('[RESIZE-PREVIEW] 📏 Column position from DOM', {
      columnId: resizeState.columnId,
      resizeWidth: resizeState.newWidth,
      calculatedX: indicatorX,
      scrollLeft,
      adjustedX: overlayX
    });

    // Create or update resize indicator
    if (!this.resizeIndicator) {
      fileLog.debug('[RESIZE-PREVIEW] 🎨 Creating NEW resize indicator element');
      this.resizeIndicator = document.createElement('div');
      this.resizeIndicator.className = 'vibegridx-resize-indicator';
      this.overlayContainer?.appendChild(this.resizeIndicator);
      fileLog.debug('[RESIZE-PREVIEW] ✅ Resize indicator appended to overlay container');
    } else {
      fileLog.debug('[RESIZE-PREVIEW] ♻️ Reusing existing resize indicator');
    }

    // Position indicator using absolute positioning within overlay container
    Object.assign(this.resizeIndicator.style, {
      position: 'absolute',
      left: `${overlayX - this.config.resizeIndicatorWidth! / 2}px`,
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

    fileLog.debug('[RESIZE-PREVIEW] 🎨 Resize indicator positioned', {
      columnId: resizeState.columnId,
      newWidth: resizeState.newWidth,
      indicatorX,
      scrollLeft,
      adjustedX: overlayX
    });
  }

  /**
   * Fallback position calculation using live DOM when coordinate mapping is unavailable
   */
  private calculateFallbackPosition(resizeState: ColumnResizeState): { indicatorX: number; overlayX: number; scrollLeft: number } | null {
    const headerCell = document.querySelector(
      `.vibegridx-header-cell[data-column-id="${resizeState.columnId}"]`
    ) as HTMLElement | null;

    if (!headerCell) {
      fileLog.warn('[RESIZE-PREVIEW] ⚠️ Fallback: header cell not found for column', {
        columnId: resizeState.columnId
      });
      return null;
    }

    const overlayRect = this.overlayContainer?.getBoundingClientRect();
    const headerRect = headerCell.getBoundingClientRect();

    if (!overlayRect) {
      fileLog.warn('[RESIZE-PREVIEW] ⚠️ Fallback: overlay container rect unavailable');
      return null;
    }

    const viewportElement =
      this.container.parentElement?.closest('.vibegridx-viewport') as HTMLElement ??
      this.container.parentElement as HTMLElement ?? null;
    const scrollLeft = viewportElement?.scrollLeft ?? 0;

    const newWidth = resizeState.newWidth ?? headerRect.width;
    const columnLeft = headerRect.left - overlayRect.left;
    const overlayX = columnLeft + newWidth;
    const indicatorX = overlayX + scrollLeft;

    fileLog.debug('[RESIZE-PREVIEW] 📏 Fallback position calculated', {
      columnId: resizeState.columnId,
      columnLeft,
      overlayX,
      indicatorX,
      scrollLeft
    });

    return { indicatorX, overlayX, scrollLeft };
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
