import type { ViewportInfo } from '../types';
import type { CoordinateMapping } from '../machines/table-machine/slices/dimensions-slice';
import { log } from '@/logger';
const fileLog = log('components/custom/vibegrid/overlays/DragPreviewOverlayDOM.ts');

// ====================================
// DRAG PREVIEW OVERLAY - DOM Implementation
// ====================================

export interface DragPreviewOverlayConfig {
  selectionColor: string;
  selectionBorderColor: string;
  cellWidth: number;
  cellHeight: number;
  opacity?: number;
}

export interface DragState {
  isDragging: boolean;
  startCell: { row: number; column: number } | null;
  currentCell: { row: number; column: number } | null;
}

export class DragPreviewOverlayDOM {
  private container: HTMLElement;
  private config: DragPreviewOverlayConfig;
  private coordinateMapping: CoordinateMapping | null = null;
  
  // DOM elements
  private overlayContainer: HTMLDivElement | null = null;
  private preview: HTMLDivElement | null = null;
  
  constructor(
    container: HTMLElement,
    config: DragPreviewOverlayConfig
  ) {
    this.container = container;
    this.config = {
      opacity: 0.3,
      ...config
    };
    
    this.initContainer();
  }
  
  /**
   * Initialize DOM container
   */
  private initContainer(): void {
    this.overlayContainer = document.createElement('div');
    this.overlayContainer.className = 'vibegridx-drag-preview-container';
    Object.assign(this.overlayContainer.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      right: '0',
      bottom: '0',
      pointerEvents: 'none',
      zIndex: '8'
    });
    
    this.container.appendChild(this.overlayContainer);
  }
  
  /**
   * Update coordinate mapping
   */
  updateCoordinateMapping(mapping: CoordinateMapping): void {
    this.coordinateMapping = mapping;
  }
  
  /**
   * Update drag preview
   */
  updatePreview(dragState: DragState | null, viewport: ViewportInfo | null): void {
    if (!dragState?.isDragging || !dragState.startCell || !dragState.currentCell || !viewport) {
      this.clear();
      return;
    }
    
    // Calculate bounds
    const bounds = this.calculateDragBounds(dragState, viewport);
    
    // Show preview
    this.showPreview(bounds.x, bounds.y, bounds.width, bounds.height);
  }
  
  /**
   * Show drag preview
   */
  private showPreview(x: number, y: number, width: number, height: number): void {
    if (!this.overlayContainer) return;
    
    // Create or update preview element
    if (!this.preview) {
      this.preview = document.createElement('div');
      this.preview.className = 'vibegridx-drag-preview';
      this.overlayContainer.appendChild(this.preview);
    }
    
    // Apply styles
    Object.assign(this.preview.style, {
      position: 'absolute',
      left: `${x}px`,
      top: `${y}px`,
      width: `${width}px`,
      height: `${height}px`,
      backgroundColor: this.config.selectionColor,
      border: `2px solid ${this.config.selectionBorderColor}`,
      borderRadius: '2px',
      boxSizing: 'border-box',
      opacity: String(this.config.opacity),
      pointerEvents: 'none',
      transition: 'all 100ms ease-out'
    });
    
    fileLog.info('DragPreviewOverlayDOM: Preview shown', { x, y, width, height });
  }
  
  /**
   * Calculate drag bounds
   */
  private calculateDragBounds(dragState: DragState, viewport: ViewportInfo): { x: number; y: number; width: number; height: number } {
    const minRow = Math.min(dragState.startCell!.row, dragState.currentCell!.row);
    const maxRow = Math.max(dragState.startCell!.row, dragState.currentCell!.row);
    const minCol = Math.min(dragState.startCell!.column, dragState.currentCell!.column);
    const maxCol = Math.max(dragState.startCell!.column, dragState.currentCell!.column);
    
    // Adjust for viewport offset
    const viewportOffset = viewport.start * this.config.cellHeight;
    
    return {
      x: minCol * this.config.cellWidth,
      y: minRow * this.config.cellHeight - viewportOffset,
      width: (maxCol - minCol + 1) * this.config.cellWidth,
      height: (maxRow - minRow + 1) * this.config.cellHeight
    };
  }
  
  /**
   * Clear preview
   */
  clear(): void {
    if (this.preview) {
      this.preview.style.opacity = '0';
      setTimeout(() => {
        if (this.preview) {
          this.preview.remove();
          this.preview = null;
        }
      }, 100);
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