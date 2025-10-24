import type { 
  ViewportInfo, 
  SelectionContext,
  ColumnDragState,
  ColumnResizeState
} from '../types';
import type { CoordinateMapping } from '../machines/table-machine/slices/dimensions-slice';
import type { OverlayConfig, VisualCellPosition } from './OverlayTypes';

import { SelectionOverlayDOM } from './SelectionOverlayDOM';
import { FillHandleLayerDOM } from './FillHandleLayerDOM';
import { ClipboardOverlayDOM } from './ClipboardOverlayDOM';
import { DragPreviewOverlayDOM } from './DragPreviewOverlayDOM';
import { ColumnDragOverlayDOM } from './ColumnDragOverlayDOM';
import { ColumnResizeOverlayDOM } from './ColumnResizeOverlayDOM';
import { createLogger } from '@/lib/logging';
const fileLog = createLogger('components/custom/vibegrid/overlays/CanvasOverlayDOM.ts');
// EditingOverlay is already DOM-based (React portal) - handled separately
// SelectionColumnOverlay not needed - checkboxes are DOM elements

// ====================================
// DOM CANVAS OVERLAY MANAGER
// ====================================

// Event callback type for communicating with canvas actor
export type CanvasEventCallback = (event: {
  type: 'FILL_START' | 'FILL_PREVIEW' | 'FILL_COMPLETE' | 'FILL_CANCEL';
  direction?: 'vertical' | 'horizontal';
  previewCells?: Set<string>;
  fillCells?: Set<string>;
}) => void;

export class CanvasOverlayDOM {
  private container: HTMLElement | null = null;
  private overlayContainer: HTMLDivElement | null = null;
  private config: OverlayConfig;
  private eventCallback: CanvasEventCallback | null = null;
  
  // DOM Overlay instances (lazily created)
  private selectionOverlay: SelectionOverlayDOM | null = null;
  private fillHandleLayer: FillHandleLayerDOM | null = null;
  private clipboardOverlay: ClipboardOverlayDOM | null = null;
  private dragPreviewOverlay: DragPreviewOverlayDOM | null = null;
  private columnDragOverlay: ColumnDragOverlayDOM | null = null;
  private columnResizeOverlay: ColumnResizeOverlayDOM | null = null;
  // EditingOverlay handled separately as React portal
  // SelectionColumn handled by DOM checkboxes in renderer
  
  // State tracking
  private currentViewport: ViewportInfo | null = null;
  private coordinateMapping: CoordinateMapping | null = null;
  private currentSelectedCells: Set<string> = new Set();
  private isDestroyed = false;
  
  constructor(config: OverlayConfig, eventCallback?: CanvasEventCallback) {
    this.config = config;
    this.eventCallback = eventCallback || null;
    fileLog.debug('CanvasOverlayDOM: Created with config', config);
  }
  
  /**
   * Check if overlay has been initialized
   */
  get isInitialized(): boolean {
    return this.overlayContainer !== null;
  }
  
  /**
   * Initialize the overlay container
   */
  init(container: HTMLElement): void {
    if (this.isDestroyed) {
      fileLog.warn('CanvasOverlayDOM: Cannot init destroyed overlay');
      return;
    }
    
    fileLog.debug('CanvasOverlayDOM: Initializing in container', {
      className: container.className,
      tagName: container.tagName,
      scrollWidth: container.scrollWidth,
      offsetWidth: container.offsetWidth
    });
    this.container = container;
    
    // Create overlay container
    this.overlayContainer = document.createElement('div');
    this.overlayContainer.className = 'vibegridx-overlay-container';

    Object.assign(this.overlayContainer.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      right: '0',
      bottom: '0',
      pointerEvents: 'none',
      zIndex: '1000',
      overflow: 'visible'
    });
    
    // Add to container
    this.container.appendChild(this.overlayContainer);
    
    fileLog.debug('CanvasOverlayDOM: Overlay container created');

    // PRE-INITIALIZE overlays to avoid lazy loading delays during interactions
    this.preInitializeOverlays();
  }
  
  /**
   * Pre-initialize all overlays to avoid lazy loading delays during interactions
   */
  private preInitializeOverlays(): void {
    if (!this.overlayContainer) {
      return;
    }

    fileLog.debug('CanvasOverlayDOM: Pre-initializing all overlays');

    // Pre-create all overlays to avoid delays on first interaction
    try {
      this.getSelectionOverlay();
      this.getFillHandleLayer();
      // Skip other overlays for now as they're less commonly used
      // Can add more if needed: getClipboardOverlay(), getDragPreviewOverlay(), etc.

      fileLog.debug('CanvasOverlayDOM: All critical overlays pre-initialized');
    } catch (error) {
      fileLog.error('CanvasOverlayDOM: Failed to pre-initialize overlays', error);
    }
  }

  /**
   * Get or create the selection overlay
   */
  private getSelectionOverlay(): SelectionOverlayDOM {
    if (!this.selectionOverlay && this.overlayContainer) {
      fileLog.debug('CanvasOverlayDOM: Creating SelectionOverlayDOM');

      // CRITICAL FIX: Use overlayContainer directly like FillHandleLayer does
      // No wrapper needed - positions are already absolute within scrollable content
      this.selectionOverlay = new SelectionOverlayDOM(
        this.overlayContainer,
        {
          selectionColor: this.config.selectionColor || 'rgba(59, 130, 246, 0.15)',
          selectionBorderColor: this.config.selectionBorderColor || 'rgba(59, 130, 246, 0.5)',
          borderWidth: this.config.selectionBorderWidth || 2,
          cellHeight: this.config.cellHeight
        }
      );
    }
    
    if (!this.selectionOverlay) {
      throw new Error('CanvasOverlayDOM: Failed to create selection overlay');
    }
    
    return this.selectionOverlay;
  }
  
  /**
   * Get or create the clipboard overlay
   */
  private getClipboardOverlay(): ClipboardOverlayDOM {
    if (!this.clipboardOverlay && this.overlayContainer) {
      fileLog.info('CanvasOverlayDOM: Lazily creating ClipboardOverlayDOM');
      
      this.clipboardOverlay = new ClipboardOverlayDOM(
        this.overlayContainer,
        {
          cellHeight: this.config.cellHeight,
          copyColor: '#10b981',
          cutColor: '#ef4444'
        }
      );
    }
    
    if (!this.clipboardOverlay) {
      throw new Error('CanvasOverlayDOM: Failed to create clipboard overlay');
    }
    
    return this.clipboardOverlay;
  }
  
  /**
   * Get or create the drag preview overlay
   */
  private getDragPreviewOverlay(): DragPreviewOverlayDOM {
    if (!this.dragPreviewOverlay && this.overlayContainer) {
      fileLog.info('CanvasOverlayDOM: Lazily creating DragPreviewOverlayDOM');
      
      this.dragPreviewOverlay = new DragPreviewOverlayDOM(
        this.overlayContainer,
        {
          selectionColor: this.config.selectionColor || 'rgba(59, 130, 246, 0.15)',
          selectionBorderColor: this.config.selectionBorderColor || 'rgba(59, 130, 246, 0.5)',
          cellWidth: this.config.cellWidth,
          cellHeight: this.config.cellHeight,
          opacity: 0.3
        }
      );
    }
    
    if (!this.dragPreviewOverlay) {
      throw new Error('CanvasOverlayDOM: Failed to create drag preview overlay');
    }
    
    return this.dragPreviewOverlay;
  }
  
  /**
   * Get or create the column drag overlay
   */
  private getColumnDragOverlay(): ColumnDragOverlayDOM {
    if (!this.columnDragOverlay && this.overlayContainer) {
      fileLog.info('CanvasOverlayDOM: Lazily creating ColumnDragOverlayDOM');
      
      this.columnDragOverlay = new ColumnDragOverlayDOM(
        this.overlayContainer,
        {
          cellHeight: this.config.cellHeight,
          headerHeight: 40 // Standard header height
        }
      );
    }
    
    if (!this.columnDragOverlay) {
      throw new Error('CanvasOverlayDOM: Failed to create column drag overlay');
    }
    
    return this.columnDragOverlay;
  }
  
  /**
   * Get or create the column resize overlay
   */
  private getColumnResizeOverlay(): ColumnResizeOverlayDOM {
    if (!this.columnResizeOverlay && this.overlayContainer) {
      fileLog.info('CanvasOverlayDOM: Lazily creating ColumnResizeOverlayDOM');
      
      const containerHeight = this.container?.offsetHeight || 600;
      this.columnResizeOverlay = new ColumnResizeOverlayDOM(
        this.overlayContainer,
        {
          headerHeight: 40,
          totalHeight: containerHeight
        }
      );
    }
    
    if (!this.columnResizeOverlay) {
      throw new Error('CanvasOverlayDOM: Failed to create column resize overlay');
    }
    
    return this.columnResizeOverlay;
  }
  
  /**
   * Get or create the fill handle layer
   */
  private getFillHandleLayer(): FillHandleLayerDOM {
    if (!this.fillHandleLayer && this.overlayContainer) {
      fileLog.info('CanvasOverlayDOM: Lazily creating FillHandleLayerDOM');
      
      this.fillHandleLayer = new FillHandleLayerDOM(
        this.overlayContainer,
        {
          cellHeight: this.config.cellHeight,
          selectionBorderColor: this.config.selectionBorderColor || '#1d4ed8'
        },
        {
          onFillStart: (direction) => {
            fileLog.info('CanvasOverlayDOM: Fill start', direction);
            if (this.eventCallback) {
              this.eventCallback({ type: 'FILL_START', direction });
            }
          },
          onFillPreview: (previewCells) => {
            fileLog.info('CanvasOverlayDOM: Fill preview', previewCells.size);
            if (this.eventCallback) {
              this.eventCallback({ type: 'FILL_PREVIEW', previewCells });
            }
          },
          onFillComplete: (fillCells) => {
            fileLog.info('CanvasOverlayDOM: Fill complete', fillCells.size);
            if (this.eventCallback) {
              this.eventCallback({ type: 'FILL_COMPLETE', fillCells });
            }
          },
          onFillCancel: () => {
            fileLog.info('CanvasOverlayDOM: Fill cancelled');
            if (this.eventCallback) {
              this.eventCallback({ type: 'FILL_CANCEL' });
            }
          },
          getSelectedCells: () => {
            return this.currentSelectedCells;
          }
        }
      );
      
      // If we already have coordinate mapping, apply it to the newly created fill handle layer
      if (this.coordinateMapping) {
        fileLog.info('CanvasOverlayDOM: Applying existing coordinate mapping to newly created fill handle layer');
        this.fillHandleLayer.updateCoordinateMapping(this.coordinateMapping);
      }
      
      // Log viewport status when creating fill handle
      fileLog.info('CanvasOverlayDOM: Fill handle created with viewport status', {
        hasViewport: !!this.currentViewport,
        viewport: this.currentViewport
      });
    }
    
    if (!this.fillHandleLayer) {
      throw new Error('CanvasOverlayDOM: Failed to create fill handle layer');
    }
    
    return this.fillHandleLayer;
  }
  
  /**
   * Update coordinate mapping
   */
  updateCoordinateMapping(mapping: CoordinateMapping): void {
    fileLog.info('[RESIZE-PREVIEW] 📍 CanvasOverlay.updateCoordinateMapping', {
      version: mapping.version,
      rowCount: mapping.rows.length,
      colCount: mapping.columns.length,
      hadMappingBefore: !!this.coordinateMapping
    });

    this.coordinateMapping = mapping;

    fileLog.info('[RESIZE-PREVIEW] ✅ Coordinate mapping stored', {
      nowHasMapping: !!this.coordinateMapping,
      columnCount: this.coordinateMapping?.columns.length
    });
    
    // Update all active overlays with new mapping
    if (this.selectionOverlay) {
      // SelectionOverlay will use the mapping passed in updateSelectionWithMapping
    }
    
    if (this.fillHandleLayer) {
      fileLog.info('CanvasOverlayDOM: Updating fill handle coordinate mapping');
      this.fillHandleLayer.updateCoordinateMapping(mapping);
    }
    
    if (this.clipboardOverlay) {
      this.clipboardOverlay.updateCoordinateMapping(mapping);
    }
    
    if (this.dragPreviewOverlay) {
      this.dragPreviewOverlay.updateCoordinateMapping(mapping);
    }
    
    if (this.columnDragOverlay) {
      this.columnDragOverlay.updateCoordinateMapping(mapping);
    }
    
    if (this.columnResizeOverlay) {
      this.columnResizeOverlay.updateCoordinateMapping(mapping);
    }
  }
  
  /**
   * Update viewport
   */
  updateViewport(viewport: ViewportInfo): void {
    fileLog.info('CanvasOverlayDOM: updateViewport called', {
      oldViewport: this.currentViewport,
      newViewport: viewport,
      isDestroyed: this.isDestroyed,
      timestamp: Date.now()
    });
    
    this.currentViewport = viewport;
    
    fileLog.info('CanvasOverlayDOM: Viewport updated successfully', {
      start: viewport.start,
      end: viewport.end,
      currentViewport: this.currentViewport,
      timestamp: Date.now()
    });
  }
  
  // NOTE: Selection overlay updates are now handled reactively by OverlayManager
  // via the interactions observable - no need for manual updates
  
  /**
   * Update selection with visual positions
   */
  updateSelectionWithVisualPositions(visualCells: VisualCellPosition[]): void {
    fileLog.info('CanvasOverlayDOM.updateSelectionWithVisualPositions called', {
      visualCellsCount: visualCells.length,
      hasContainer: !!this.overlayContainer,
      overlayContainerInDom: this.overlayContainer ? document.body.contains(this.overlayContainer) : false,
      visualCells: visualCells.slice(0, 3) // Log first 3 for debugging
    });
    
    // Extract selected cells from visual positions for fill handle
    this.currentSelectedCells = new Set(visualCells.map(cell => cell.cellKey));
    
    if (!this.overlayContainer) {
      fileLog.debug('CanvasOverlayDOM: Container not initialized yet, skipping selection update');
      return;
    }
    
    const overlay = this.getSelectionOverlay();
    fileLog.info('CanvasOverlayDOM: Got selection overlay, calling updateWithVisualPositions');
    
    // NOTE: Viewport info no longer needed - hybrid DOM positioning handles this automatically
    
    overlay.updateWithVisualPositions(visualCells);
  }
  
  /**
   * Clear selection
   */
  clearSelection(): void {
    if (this.selectionOverlay) {
      this.selectionOverlay.clearSelection();
    }
  }
  
  /**
   * Update drag selection range
   */
  updateDragSelection(
    startCell: { rowId: string; columnId: string },
    endCell: { rowId: string; columnId: string }
  ): void {
    if (!this.overlayContainer || !this.coordinateMapping || !this.currentViewport) {
      return;
    }
    
    const overlay = this.getSelectionOverlay();
    overlay.updateSelectionRange(
      startCell,
      endCell,
      this.coordinateMapping,
      this.currentViewport
    );
  }
  
  /**
   * Highlight cells temporarily
   */
  highlightCells(cellKeys: Set<string>): void {
    if (!this.overlayContainer || !this.coordinateMapping || !this.currentViewport) {
      return;
    }
    
    const overlay = this.getSelectionOverlay();
    overlay.highlightCells(cellKeys, this.coordinateMapping, this.currentViewport);
  }
  
  /**
   * Render fill handle
   */
  renderFillHandle(visualCells: VisualCellPosition[], selectedRows?: Set<string>, viewport?: ViewportInfo): void {
    if (!this.overlayContainer) {
      fileLog.warn('CanvasOverlayDOM: Container not initialized for fill handle');
      return;
    }
    
    const fillLayer = this.getFillHandleLayer();
    
    // Use the viewport passed from table machine if available, otherwise fall back to stored viewport
    const viewportToUse = viewport || this.currentViewport;
    fileLog.info('CanvasOverlayDOM: renderFillHandle - using viewport', {
      passedViewport: !!viewport,
      storedViewport: !!this.currentViewport,
      finalViewport: !!viewportToUse
    });
    
    // Pass viewport and coordinate mapping directly to fill handle, same as selections
    fillLayer.updateViewportAndMapping(viewportToUse, this.coordinateMapping);
    fillLayer.renderFillHandleWithVisualPositions(visualCells, selectedRows);
  }
  
  /**
   * Hide fill handle
   */
  hideFillHandle(): void {
    if (this.fillHandleLayer) {
      this.fillHandleLayer.hideFillHandle();
    }
  }
  
  /**
   * Render fill preview
   */
  renderFillPreview(previewCells: Set<string>): void {
    if (!this.overlayContainer || !this.currentViewport) {
      return;
    }
    
    const fillLayer = this.getFillHandleLayer();
    fillLayer.renderFillPreview(previewCells, this.currentViewport);
  }
  
  /**
   * Render fill preview with visual positions (same path as selections)
   */
  renderFillPreviewWithVisualPositions(visualCells: VisualCellPosition[]): void {
    if (!this.overlayContainer) {
      fileLog.warn('CanvasOverlayDOM: Container not initialized for fill preview');
      return;
    }
    
    const fillLayer = this.getFillHandleLayer();
    fillLayer.renderFillPreviewWithVisualPositions(visualCells);
  }
  
  /**
   * Clear fill preview
   */
  clearFillPreview(): void {
    if (this.fillHandleLayer) {
      this.fillHandleLayer.clearFillPreview();
    }
  }
  
  // NOTE: updateFromContext method removed - overlay updates are now handled reactively
  
  /**
   * Update clipboard indicator
   */
  updateClipboardIndicator(
    clipboardState: { copiedCells: Set<string>; isCut: boolean } | null,
    viewport: ViewportInfo | null
  ): void {
    if (!this.overlayContainer) return;
    
    const clipboard = this.getClipboardOverlay();
    clipboard.updateIndicator(clipboardState, viewport || this.currentViewport);
  }
  
  /**
   * Update clipboard with visual positions
   */
  updateClipboardWithVisualPositions(visualCells: VisualCellPosition[], isCut: boolean): void {
    if (!this.overlayContainer) return;
    
    const clipboard = this.getClipboardOverlay();
    clipboard.updateIndicatorWithVisualPositions(visualCells, isCut);
  }
  
  /**
   * Clear clipboard indicators
   */
  clearClipboardIndicators(): void {
    if (this.clipboardOverlay) {
      this.clipboardOverlay.clear();
    }
  }
  
  /**
   * Update drag preview
   */
  updateDragPreview(dragState: any, viewport: ViewportInfo | null): void {
    if (!this.overlayContainer) return;
    
    const dragPreview = this.getDragPreviewOverlay();
    dragPreview.updatePreview(dragState, viewport || this.currentViewport);
  }
  
  /**
   * Update column drag preview
   */
  updateColumnDragPreview(dragState: ColumnDragState | null, mouseX: number, mouseY: number): void {
    if (!this.overlayContainer || !dragState) return;
    
    const columnDrag = this.getColumnDragOverlay();
    columnDrag.updateDragPreview(dragState, mouseX, mouseY);
  }
  
  /**
   * Update column resize preview
   */
  updateColumnResizePreview(resizeState: ColumnResizeState | null): void {
    fileLog.info('[RESIZE-PREVIEW] 📐 CanvasOverlay.updateColumnResizePreview called', {
      hasOverlayContainer: !!this.overlayContainer,
      resizeState: resizeState,
      hasCoordinateMapping: !!this.coordinateMapping
    });

    if (!this.overlayContainer) {
      fileLog.warn('[RESIZE-PREVIEW] ⚠️ No overlayContainer!');
      return;
    }

    const columnResize = this.getColumnResizeOverlay();

    // CRITICAL: Update coordinate mapping if available (lazy-created overlay needs it)
    if (this.coordinateMapping) {
      fileLog.info('[RESIZE-PREVIEW] 📐 Updating coordinate mapping for lazy-created overlay from CanvasOverlay', {
        hasMapping: !!this.coordinateMapping,
        columnCount: this.coordinateMapping?.columns.length
      });
      columnResize.updateCoordinateMapping(this.coordinateMapping);
    } else {
      fileLog.warn('[RESIZE-PREVIEW] ⚠️ CanvasOverlay has no coordinate mapping to pass!');
    }

    fileLog.info('[RESIZE-PREVIEW] 📐 Got ColumnResizeOverlay, calling updateResizePreview');
    columnResize.updateResizePreview(resizeState);
    fileLog.info('[RESIZE-PREVIEW] ✅ updateResizePreview called');
  }
  
  /**
   * Get drop index for column drag
   */
  getColumnDropIndex(mouseX: number): number {
    if (!this.columnDragOverlay) return -1;
    return this.columnDragOverlay.getDropIndex();
  }
  
  /**
   * Show editing overlay
   */
  showEditingOverlay(position: { x: number; y: number; width: number; height: number }): void {
    // TODO: Implement when EditingCanvasOverlayDOM is created
    fileLog.info('CanvasOverlayDOM: Show editing overlay requested', position);
  }
  
  /**
   * Hide editing overlay
   */
  hideEditingOverlay(): void {
    // TODO: Implement when EditingCanvasOverlayDOM is created
    fileLog.info('CanvasOverlayDOM: Hide editing overlay requested');
  }
  
  /**
   * Resize the overlay container
   */
  resize(width: number, height: number): void {
    if (this.overlayContainer) {
      this.overlayContainer.style.width = `${width}px`;
      this.overlayContainer.style.height = `${height}px`;
    }
  }
  
  /**
   * Destroy the overlay and clean up
   */
  destroy(): void {
    fileLog.info('CanvasOverlayDOM: Destroying overlay', {
      timestamp: Date.now(),
      currentViewport: this.currentViewport,
      isDestroyed: this.isDestroyed
    });
    
    this.isDestroyed = true;
    
    // Destroy all overlay instances
    if (this.selectionOverlay) {
      this.selectionOverlay.destroy();
      this.selectionOverlay = null;
    }
    
    if (this.fillHandleLayer) {
      this.fillHandleLayer.destroy();
      this.fillHandleLayer = null;
    }
    
    if (this.clipboardOverlay) {
      this.clipboardOverlay.destroy();
      this.clipboardOverlay = null;
    }
    
    if (this.dragPreviewOverlay) {
      this.dragPreviewOverlay.destroy();
      this.dragPreviewOverlay = null;
    }
    
    if (this.columnDragOverlay) {
      this.columnDragOverlay.destroy();
      this.columnDragOverlay = null;
    }
    
    if (this.columnResizeOverlay) {
      this.columnResizeOverlay.destroy();
      this.columnResizeOverlay = null;
    }
    
    // Remove container
    if (this.overlayContainer) {
      this.overlayContainer.remove();
      this.overlayContainer = null;
    }
    
    this.container = null;
    this.coordinateMapping = null;
    this.currentViewport = null;
  }
  
  /**
   * Check if overlay is ready
   */
  isReady(): boolean {
    return !this.isDestroyed && this.overlayContainer !== null;
  }
}