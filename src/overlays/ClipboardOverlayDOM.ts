import type { ViewportInfo } from '../types';
import type { CoordinateMapping } from '../coordinates/VibeGridXCoordinateManager';
import type { VisualCellPosition } from './OverlayTypes';
import { GRID_DIMENSIONS } from '../constants/grid-dimensions';
import { createLogger } from '@/lib/logging';
const fileLog = createLogger('components/custom/vibegrid/overlays/ClipboardOverlayDOM.ts');

// ====================================
// CLIPBOARD OVERLAY - DOM Implementation
// ====================================

export interface ClipboardOverlayConfig {
  cellHeight: number;
  copyColor?: string;
  cutColor?: string;
}

export class ClipboardOverlayDOM {
  private container: HTMLElement;
  private coordinateMapping: CoordinateMapping | null = null;
  private config: ClipboardOverlayConfig;
  
  // DOM elements
  private overlayContainer: HTMLDivElement | null = null;
  private indicator: HTMLDivElement | null = null;
  private animationInterval: number | null = null;
  
  constructor(
    container: HTMLElement,
    config: ClipboardOverlayConfig
  ) {
    this.container = container;
    this.config = {
      copyColor: '#10b981',
      cutColor: '#ef4444',
      ...config
    };
    
    this.initContainer();
  }
  
  /**
   * Initialize DOM container
   */
  private initContainer(): void {
    this.overlayContainer = document.createElement('div');
    this.overlayContainer.className = 'vibegridx-clipboard-container';
    Object.assign(this.overlayContainer.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      right: '0',
      bottom: '0',
      pointerEvents: 'none',
      zIndex: `${GRID_DIMENSIONS.Z_INDEX.CLIPBOARD}` // Below selection overlay
    });
    
    this.container.appendChild(this.overlayContainer);
  }
  
  /**
   * Update coordinate mapping when it changes
   */
  updateCoordinateMapping(mapping: CoordinateMapping): void {
    this.coordinateMapping = mapping;
  }
  
  /**
   * Update clipboard indicator using visual positions
   */
  updateIndicatorWithVisualPositions(
    visualCells: VisualCellPosition[],
    isCut: boolean
  ): void {
    fileLog.debug('ClipboardOverlayDOM: Updating with visual positions', {
      cellCount: visualCells.length,
      isCut
    });
    
    if (visualCells.length === 0) {
      this.clear();
      return;
    }
    
    // Calculate bounds from visual positions
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    for (const cell of visualCells) {
      minX = Math.min(minX, cell.x);
      minY = Math.min(minY, cell.y);
      maxX = Math.max(maxX, cell.x + cell.width);
      maxY = Math.max(maxY, cell.y + cell.height);
    }
    
    if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
      fileLog.error('ClipboardOverlayDOM: Invalid bounds calculated');
      this.clear();
      return;
    }
    
    const width = maxX - minX;
    const height = maxY - minY;
    
    if (width <= 0 || height <= 0) {
      fileLog.warn('ClipboardOverlayDOM: Invalid dimensions', { width, height });
      this.clear();
      return;
    }
    
    this.showIndicator(minX, minY, width, height, isCut);
  }
  
  /**
   * Update clipboard indicator using coordinate mapping
   */
  updateIndicator(
    clipboardState: { copiedCells: Set<string>; isCut: boolean } | null,
    viewport: ViewportInfo | null
  ): void {
    fileLog.debug('ClipboardOverlayDOM: updateIndicator called', {
      hasClipboardState: !!clipboardState,
      hasViewport: !!viewport,
      cellCount: clipboardState?.copiedCells.size || 0
    });
    
    if (!clipboardState || !viewport || clipboardState.copiedCells.size === 0 || !this.coordinateMapping) {
      fileLog.debug('ClipboardOverlayDOM: Clearing due to missing requirements', {
        hasClipboardState: !!clipboardState,
        hasViewport: !!viewport,
        cellCount: clipboardState?.copiedCells.size || 0,
        hasCoordinateMapping: !!this.coordinateMapping
      });
      this.clear();
      return;
    }
    
    // Calculate bounds of copied cells
    const bounds = this.calculateBounds(clipboardState.copiedCells, viewport);
    if (!bounds) {
      fileLog.warn('ClipboardOverlayDOM: No bounds calculated');
      this.clear();
      return;
    }
    
    this.showIndicator(bounds.minX, bounds.minY, bounds.width, bounds.height, clipboardState.isCut);
  }
  
  /**
   * Show clipboard indicator
   */
  private showIndicator(x: number, y: number, width: number, height: number, isCut: boolean): void {
    if (!this.overlayContainer) return;
    
    // Create or update indicator
    if (!this.indicator) {
      this.indicator = document.createElement('div');
      this.indicator.className = 'vibegridx-clipboard-indicator';
      this.overlayContainer.appendChild(this.indicator);
    }
    
    // Apply styles with enhanced visibility
    const color = isCut ? this.config.cutColor! : this.config.copyColor!;
    Object.assign(this.indicator.style, {
      position: 'absolute',
      left: `${x}px`,
      top: `${y}px`,
      width: `${width}px`,
      height: `${height}px`,
      border: `3px dashed ${color}`, // Thicker border for visibility
      borderRadius: '3px',
      boxSizing: 'border-box',
      pointerEvents: 'none',
      opacity: '1',
      animation: 'clipboard-pulse 2s infinite',
      // Add shadow to make it more visible under selection
      boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.8), 0 0 0 1px ${color}`
    });
    
    // Add pulsing animation
    if (!document.querySelector('#clipboard-pulse-animation')) {
      const style = document.createElement('style');
      style.id = 'clipboard-pulse-animation';
      style.textContent = `
        @keyframes clipboard-pulse {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
      `;
      document.head.appendChild(style);
    }
    
    // Animate the dashed border
    this.startDashAnimation();
    
    fileLog.debug('ClipboardOverlayDOM: Indicator shown', {
      x, y, width, height, isCut, color
    });
  }
  
  /**
   * Start dash animation for marching ants effect
   */
  private startDashAnimation(): void {
    if (this.animationInterval) {
      clearInterval(this.animationInterval);
    }
    
    let dashOffset = 0;
    this.animationInterval = window.setInterval(() => {
      if (this.indicator) {
        dashOffset = (dashOffset + 1) % 10;
        this.indicator.style.borderDashOffset = `${dashOffset}px`;
      }
    }, 50);
  }
  
  /**
   * Stop dash animation
   */
  private stopDashAnimation(): void {
    if (this.animationInterval) {
      clearInterval(this.animationInterval);
      this.animationInterval = null;
    }
  }
  
  /**
   * Calculate bounds from cell keys
   */
  private calculateBounds(
    copiedCells: Set<string>,
    viewport: ViewportInfo
  ): { minX: number; minY: number; width: number; height: number } | null {
    if (!this.coordinateMapping) return null;
    
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let hasVisibleCells = false;
    
    for (const cellKey of copiedCells) {
      const [rowId, columnId] = cellKey.split(':');
      
      const rowCoord = this.coordinateMapping.rows.find((r: any) => r.rowId === rowId);
      const colCoord = this.coordinateMapping.columns.find((c: any) => c.columnId === columnId);
      
      if (!rowCoord || !colCoord) continue;
      
      const rowIndex = this.coordinateMapping.rows.indexOf(rowCoord);
      
      // Check if cell is in viewport
      if (rowIndex >= viewport.start && rowIndex <= viewport.end) {
        hasVisibleCells = true;
        
        // Calculate position adjusted for viewport
        const viewportOffset = viewport.start * this.config.cellHeight;
        const cellY = rowCoord.y - viewportOffset;
        
        minX = Math.min(minX, colCoord.x);
        minY = Math.min(minY, cellY);
        maxX = Math.max(maxX, colCoord.x + colCoord.width);
        maxY = Math.max(maxY, cellY + rowCoord.height);
      }
    }
    
    if (!hasVisibleCells) return null;
    
    return {
      minX,
      minY,
      width: maxX - minX,
      height: maxY - minY
    };
  }
  
  /**
   * Clear clipboard indicator
   */
  clear(): void {
    this.stopDashAnimation();
    
    if (this.indicator) {
      this.indicator.remove();
      this.indicator = null;
    }
    
    fileLog.debug('ClipboardOverlayDOM: Indicator cleared');
  }
  
  /**
   * Destroy the overlay and clean up
   */
  destroy(): void {
    this.clear();
    
    if (this.overlayContainer) {
      this.overlayContainer.remove();
      this.overlayContainer = null;
    }
    
    // Remove animation style if no other clipboard overlays exist
    const animationStyle = document.querySelector('#clipboard-pulse-animation');
    if (animationStyle && !document.querySelector('.vibegridx-clipboard-indicator')) {
      animationStyle.remove();
    }
  }
}