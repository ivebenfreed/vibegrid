import type { ColumnDragState } from '../types';
import type { CoordinateMapping } from '../coordinates/VibeGridXCoordinateManager';
import { createLogger } from '@/lib/logging';
const fileLog = createLogger('components/custom/vibegrid/overlays/ColumnDragOverlayDOM.ts');

// ====================================
// COLUMN DRAG OVERLAY - DOM Implementation
// ====================================

export interface ColumnDragOverlayConfig {
  cellHeight: number;
  headerHeight: number;
  dragOpacity?: number;
  dropIndicatorColor?: string;
  dropIndicatorWidth?: number;
  previewColor?: string;
  previewBorderColor?: string;
}

export class ColumnDragOverlayDOM {
  private container: HTMLElement;
  private config: ColumnDragOverlayConfig;
  private coordinateMapping: CoordinateMapping | null = null;
  
  // DOM elements
  private overlayContainer: HTMLDivElement | null = null;
  private columnPreview: HTMLDivElement | null = null;
  private dropIndicator: HTMLDivElement | null = null;
  
  // Current state
  private dragState: ColumnDragState | null = null;
  private dropIndex: number = -1;
  
  constructor(
    container: HTMLElement,
    config: ColumnDragOverlayConfig
  ) {
    this.container = container;
    this.config = {
      dragOpacity: 0.8,
      dropIndicatorColor: '#3b82f6',
      dropIndicatorWidth: 4,
      previewColor: 'rgba(255, 255, 255, 0.95)',
      previewBorderColor: 'rgba(59, 130, 246, 0.5)',
      ...config
    };
    
    this.initContainer();
  }
  
  /**
   * Initialize DOM container
   */
  private initContainer(): void {
    this.overlayContainer = document.createElement('div');
    this.overlayContainer.className = 'vibegridx-column-drag-container';
    Object.assign(this.overlayContainer.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      right: '0',
      bottom: '0',
      pointerEvents: 'none',
      zIndex: '30'
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
   * Update the drag preview based on current drag state
   */
  updateDragPreview(dragState: ColumnDragState, mouseX: number, mouseY: number): void {
    if (!dragState.isDragging || !dragState.draggedColumnId) {
      this.clear();
      return;
    }
    
    this.dragState = dragState;
    
    if (!this.coordinateMapping) {
      fileLog.warn('ColumnDragOverlayDOM: No coordinate mapping available');
      return;
    }
    
    // Get column info from coordinate mapping
    const column = this.coordinateMapping.columns.find((col: any) => col.columnId === dragState.draggedColumnId);
    if (!column) {
      fileLog.warn('ColumnDragOverlayDOM: Column not found:', dragState.draggedColumnId);
      return;
    }
    
    const columnWidth = column.width;
    
    // Create or update column preview
    if (!this.columnPreview) {
      this.columnPreview = document.createElement('div');
      this.columnPreview.className = 'vibegridx-column-preview';
      this.overlayContainer?.appendChild(this.columnPreview);
    }
    
    // Position preview at mouse position
    Object.assign(this.columnPreview.style, {
      position: 'absolute',
      left: `${mouseX - columnWidth / 2}px`,
      top: `${mouseY - 20}px`,
      width: `${columnWidth}px`,
      height: `${this.config.headerHeight}px`,
      backgroundColor: this.config.previewColor,
      border: `2px solid ${this.config.previewBorderColor}`,
      borderRadius: '4px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      opacity: String(this.config.dragOpacity),
      pointerEvents: 'none',
      transition: 'none',
      zIndex: '31'
    });
    
    // Update drop indicator
    this.updateDropIndicator(mouseX);
  }
  
  /**
   * Update drop indicator position
   */
  private updateDropIndicator(mouseX: number): void {
    if (!this.coordinateMapping) return;
    
    // Find drop position
    let dropIndex = 0;
    for (let i = 0; i < this.coordinateMapping.columns.length; i++) {
      const col = this.coordinateMapping.columns[i];
      if (mouseX > col.offset + col.width / 2) {
        dropIndex = i + 1;
      }
    }
    
    this.dropIndex = dropIndex;
    
    // Create or update drop indicator
    if (!this.dropIndicator) {
      this.dropIndicator = document.createElement('div');
      this.dropIndicator.className = 'vibegridx-drop-indicator';
      this.overlayContainer?.appendChild(this.dropIndicator);
    }
    
    // Calculate position
    let indicatorX = 0;
    if (dropIndex === 0) {
      indicatorX = 0;
    } else if (dropIndex >= this.coordinateMapping.columns.length) {
      const lastCol = this.coordinateMapping.columns[this.coordinateMapping.columns.length - 1];
      indicatorX = lastCol.offset + lastCol.width;
    } else {
      indicatorX = this.coordinateMapping.columns[dropIndex].offset;
    }
    
    // Position indicator
    Object.assign(this.dropIndicator.style, {
      position: 'absolute',
      left: `${indicatorX - this.config.dropIndicatorWidth! / 2}px`,
      top: '0',
      width: `${this.config.dropIndicatorWidth}px`,
      height: `${this.config.headerHeight}px`,
      backgroundColor: this.config.dropIndicatorColor,
      borderRadius: '2px',
      boxShadow: '0 0 8px rgba(59, 130, 246, 0.5)',
      pointerEvents: 'none',
      zIndex: '30'
    });
  }
  
  /**
   * Get the current drop index
   */
  getDropIndex(): number {
    return this.dropIndex;
  }
  
  /**
   * Clear the drag preview
   */
  clear(): void {
    if (this.columnPreview) {
      this.columnPreview.remove();
      this.columnPreview = null;
    }
    
    if (this.dropIndicator) {
      this.dropIndicator.remove();
      this.dropIndicator = null;
    }
    
    this.dragState = null;
    this.dropIndex = -1;
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