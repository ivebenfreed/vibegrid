import type { VisualCellPosition } from './OverlayTypes';
import { GRID_DIMENSIONS } from '../constants/grid-dimensions';
import { createLogger } from '@/shared/lib/logging';
const myLog = createLogger('components/custom/vibegrid/overlays/SelectionOverlayDOM.ts');

// ====================================
// DOM SELECTION OVERLAY
// ====================================

export interface SelectionOverlayConfig {
  selectionColor: string;
  selectionBorderColor: string;
  borderWidth: number;
  cellHeight: number;
}

export class SelectionOverlayDOM {
  private container: HTMLElement;
  private config: SelectionOverlayConfig;

  // Persistent container (appended once in constructor)
  private selectionContainer: HTMLDivElement | null = null;

  // Single merged element (reused for performance)
  private mergedElement: HTMLDivElement | null = null;

  // Track last bounds to avoid unnecessary updates
  private lastBounds: { minX: number; minY: number; maxX: number; maxY: number } | null = null;

  // NOTE: Viewport tracking removed - now handled by DOM positioning system

  constructor(
    container: HTMLElement,
    config: SelectionOverlayConfig
  ) {
    this.container = container;
    // Use nice light blue selection colors
    this.config = {
      ...config
    };

    // Ensure container has relative positioning for absolute children
    if (getComputedStyle(this.container).position === 'static') {
      this.container.style.position = 'relative';
    }

    // Initialize persistent container immediately
    this.initializeContainer();

    myLog.info('SelectionOverlayDOM: Created', {
      container: this.container,
      config: this.config
    });
  }

  /**
   * Create persistent selection container (called once in constructor)
   */
  private initializeContainer(): void {
    this.selectionContainer = document.createElement('div');
    this.selectionContainer.className = 'vibegridx-selection-container';
    Object.assign(this.selectionContainer.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      right: '0',
      bottom: '0',
      pointerEvents: 'none',
      zIndex: `${GRID_DIMENSIONS.Z_INDEX.SELECTION}` // 101
    });

    this.container.appendChild(this.selectionContainer);

    myLog.info('SelectionOverlayDOM: Container initialized', {
      zIndex: GRID_DIMENSIONS.Z_INDEX.SELECTION
    });
  }
  
  // NOTE: updateViewport method removed - viewport handled by DOM positioning system
  
  // NOTE: Old coordinate mapping method removed - now using DOM positioning only
  
  /**
   * Update with visual cell positions directly
   * Uses diffing instead of tear-down for stable DOM order
   */
  updateWithVisualPositions(visualCells: VisualCellPosition[]): void {
    if (!this.selectionContainer) return;

    myLog.info('SelectionOverlayDOM.updateWithVisualPositions', {
      cellCount: visualCells.length,
      containerExists: !!this.selectionContainer,
      firstCells: visualCells.slice(0, 2).map(c => ({
        key: c.cellKey,
        pos: { x: c.x, y: c.y, w: c.width, h: c.height }
      }))
    });

    if (visualCells.length === 0) {
      // Clear selection
      this.hideMergedElement();
      this.lastBounds = null;
      return;
    }

    // Ensure element is visible if it was hidden
    if (this.mergedElement && this.mergedElement.style.display === 'none') {
      this.mergedElement.style.display = 'block';
    }

    // Calculate merged bounding box (performance optimization)
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    for (const cell of visualCells) {
      minX = Math.min(minX, cell.x);
      minY = Math.min(minY, cell.y);
      maxX = Math.max(maxX, cell.x + cell.width);
      maxY = Math.max(maxY, cell.y + cell.height);
    }

    // Diff against previous bounds to avoid unnecessary updates
    const boundsChanged = !this.lastBounds ||
      this.lastBounds.minX !== minX ||
      this.lastBounds.minY !== minY ||
      this.lastBounds.maxX !== maxX ||
      this.lastBounds.maxY !== maxY;

    if (!boundsChanged) {
      myLog.debug('SelectionOverlayDOM: Bounds unchanged, skipping update');
      return;
    }

    this.lastBounds = { minX, minY, maxX, maxY };

    // Reuse existing element or create if needed
    if (!this.mergedElement) {
      // First time: create element
      this.mergedElement = document.createElement('div');
      this.mergedElement.className = 'vibegridx-selection-overlay vibegridx-selection-merged';

      Object.assign(this.mergedElement.style, {
        position: 'absolute',
        pointerEvents: 'none',
        backgroundColor: this.config.selectionColor,
        border: `${this.config.borderWidth}px solid ${this.config.selectionBorderColor}`,
        boxSizing: 'border-box',
        left: `${minX}px`,
        top: `${minY}px`,
        width: `${maxX - minX}px`,
        height: `${maxY - minY}px`,
        borderRadius: '3px'
      });

      this.selectionContainer.appendChild(this.mergedElement);

      myLog.info('SelectionOverlayDOM: Created merged selection', {
        bounds: { minX, minY, maxX, maxY }
      });
    } else {
      // Update existing element (NO remove/re-append)
      Object.assign(this.mergedElement.style, {
        left: `${minX}px`,
        top: `${minY}px`,
        width: `${maxX - minX}px`,
        height: `${maxY - minY}px`
      });

      myLog.debug('SelectionOverlayDOM: Updated merged selection', {
        bounds: { minX, minY, maxX, maxY }
      });
    }
  }

  /**
   * Hide merged element
   */
  private hideMergedElement(): void {
    if (this.mergedElement) {
      this.mergedElement.style.display = 'none';
    }
  }

  /**
   * Hide selection overlay (for suspendSelectionOverlay)
   */
  hide(): void {
    if (this.selectionContainer) {
      this.selectionContainer.style.display = 'none';
    }
    myLog.debug('SelectionOverlayDOM: Hidden');
  }

  /**
   * Show selection overlay (after resume)
   */
  show(): void {
    if (this.selectionContainer) {
      this.selectionContainer.style.display = 'block';
    }
    myLog.debug('SelectionOverlayDOM: Shown');
  }
  
  /**
   * Clear all selection elements
   */
  clearSelection(): void {
    myLog.info('SelectionOverlayDOM: Clearing selection');
    this.hideMergedElement();
    this.lastBounds = null;
  }

  /**
   * Destroy the overlay and clean up
   */
  destroy(): void {
    this.lastBounds = null;

    if (this.mergedElement) {
      this.mergedElement.remove();
      this.mergedElement = null;
    }

    // Remove persistent container
    if (this.selectionContainer) {
      this.selectionContainer.remove();
      this.selectionContainer = null;
    }

    myLog.info('SelectionOverlayDOM: Destroyed');
  }
}