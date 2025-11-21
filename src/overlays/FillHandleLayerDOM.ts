import type { ViewportInfo } from '../types';
import type { CoordinateMapping } from '../coordinates/VibeGridXCoordinateManager';
import type { VisualCellPosition } from './OverlayTypes';

// ====================================
// FILL HANDLE LAYER - DOM Implementation
// ====================================

export interface FillHandleConfig {
  cellHeight: number;
  selectionBorderColor: string;
}

export interface FillHandleCallbacks {
  onFillStart: (direction: 'vertical' | 'horizontal') => void;
  onFillPreview: (previewCells: Set<string>) => void;
  onFillComplete: (fillCells: Set<string>) => void;
  onFillCancel: () => void;
  getSelectedCells: () => Set<string>;
}

export class FillHandleLayerDOM {
  private container: HTMLElement;
  private config: FillHandleConfig;
  private callbacks: FillHandleCallbacks;
  private coordinateMapping: CoordinateMapping | null = null;
  private currentViewport: ViewportInfo | null = null;
  
  // DOM elements
  private fillHandleContainer: HTMLDivElement | null = null;
  private fillHandle: HTMLDivElement | null = null;
  private previewContainer: HTMLDivElement | null = null;
  private previewElements = new Map<string, HTMLDivElement>();
  
  // Drag state
  private isDragging = false;
  private dragStartPos: { x: number; y: number } | null = null;
  private dragDirection: 'vertical' | 'horizontal' | null = null;
  
  // Semantic throttling - only process when meaningful changes occur
  private lastRowsToFill: number = 0;
  private lastFillDirection: boolean | null = null;
  private cachedBounds: any = null;
  
  // Visual settings
  private handleSize = 10;
  
  constructor(
    container: HTMLElement,
    config: FillHandleConfig,
    callbacks: FillHandleCallbacks
  ) {
    this.container = container;
    this.config = config;
    this.callbacks = callbacks;
    
    this.initContainers();
  }
  
  /**
   * Initialize DOM containers
   */
  private initContainers(): void {
    // Create fill handle container
    this.fillHandleContainer = document.createElement('div');
    this.fillHandleContainer.className = 'vibegridx-fill-handle-container';
    Object.assign(this.fillHandleContainer.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      right: '0',
      bottom: '0',
      pointerEvents: 'none',
      zIndex: '20'
    });
    
    // Create preview container
    this.previewContainer = document.createElement('div');
    this.previewContainer.className = 'vibegridx-fill-preview-container';
    Object.assign(this.previewContainer.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      right: '0',
      bottom: '0',
      pointerEvents: 'none',
      zIndex: '15'
    });
    
    this.container.appendChild(this.previewContainer);
    this.container.appendChild(this.fillHandleContainer);
  }
  
  // ====================================
  // PUBLIC API
  // ====================================
  
  /**
   * Update coordinate mapping when it changes
   */
  updateCoordinateMapping(mapping: CoordinateMapping): void {
    this.coordinateMapping = mapping;
  }
  
  /**
   * Update viewport and coordinate mapping directly (simplified approach like selections)
   */
  updateViewportAndMapping(viewport: ViewportInfo | null, mapping: CoordinateMapping | null): void {
    this.currentViewport = viewport;
    if (mapping) {
      this.coordinateMapping = mapping;
    }
  }
  
  /**
   * Render fill handle using pre-calculated visual positions
   */
  renderFillHandleWithVisualPositions(visualCells: VisualCellPosition[], selectedRows?: Set<string>): void {
    // Invalidate cached bounds when selection changes
    this.cachedBounds = null;
    if (visualCells.length === 0) {
      this.hideFillHandle();
      return;
    }
    
    // Calculate bounds from visual positions
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    for (const cell of visualCells) {
      const cellRight = cell.x + cell.width;
      const cellBottom = cell.y + cell.height;
      
      minX = Math.min(minX, cell.x);
      minY = Math.min(minY, cell.y);
      maxX = Math.max(maxX, cellRight);
      maxY = Math.max(maxY, cellBottom);
    }
    
    if (minX === Infinity) {
      this.hideFillHandle();
      return;
    }
    
    // Check if this is a complete row selection
    const isCompleteRowSelection = this.isCompleteRowSelection(visualCells, selectedRows);
    
    let handleX: number;
    let handleY: number;
    
    if (isCompleteRowSelection) {
      // Position fill handle in checkbox column for row selections
      const CHECKBOX_COLUMN_WIDTH = 48;
      handleX = CHECKBOX_COLUMN_WIDTH - this.handleSize / 2;
      handleY = maxY - this.handleSize / 2;
      
    } else {
      // Position at bottom-right of cell selection
      handleX = maxX - this.handleSize / 2;
      handleY = maxY - this.handleSize / 2;
    }
    
    // Create or update fill handle
    this.showFillHandle(handleX, handleY);
  }
  
  /**
   * Show fill handle at specified position
   */
  private showFillHandle(x: number, y: number): void {
    if (!this.fillHandle) {
      // Create fill handle element
      this.fillHandle = document.createElement('div');
      this.fillHandle.className = 'vibegridx-fill-handle';
      Object.assign(this.fillHandle.style, {
        position: 'absolute',
        width: `${this.handleSize}px`,
        height: `${this.handleSize}px`,
        backgroundColor: this.config.selectionBorderColor,
        border: '2px solid white',
        borderRadius: '2px',
        cursor: 'crosshair',
        pointerEvents: 'auto',
        zIndex: '25',
        boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
        transition: 'transform 150ms ease-out'
      });
      
      // Event handlers are managed by EventDelegationManager through vibegridx-fill-handle class
      
      if (this.fillHandleContainer) {
        this.fillHandleContainer.appendChild(this.fillHandle);
      }
    }
    
    // Update position
    Object.assign(this.fillHandle.style, {
      left: `${x}px`,
      top: `${y}px`,
      display: 'block',
      transform: 'scale(1)'
    });
    
    // Add hover effect
    this.fillHandle.addEventListener('mouseenter', () => {
      if (this.fillHandle && !this.isDragging) {
        this.fillHandle.style.transform = 'scale(1.2)';
      }
    });
    
    this.fillHandle.addEventListener('mouseleave', () => {
      if (this.fillHandle && !this.isDragging) {
        this.fillHandle.style.transform = 'scale(1)';
      }
    });
  }
  
  /**
   * Hide fill handle
   */
  hideFillHandle(): void {
    if (this.fillHandle) {
      this.fillHandle.style.display = 'none';
    }
    this.clearFillPreview();
  }
  
  /**
   * Render fill preview
   */
  renderFillPreview(previewCells: Set<string>, viewport: ViewportInfo): void {
    this.clearFillPreview();
    
    if (!this.coordinateMapping || previewCells.size === 0) return;
    
    for (const cellKey of previewCells) {
      const [rowId, columnId] = cellKey.split(':');
      
      // Find coordinates
      const rowCoord = this.coordinateMapping.rows.find((r: any) => r.rowId === rowId);
      const colCoord = this.coordinateMapping.columns.find((c: any) => c.columnId === columnId);
      
      if (!rowCoord || !colCoord) continue;
      
      const rowIndex = this.coordinateMapping.rows.indexOf(rowCoord);
      
      // Check if in viewport
      if (rowIndex < viewport.start || rowIndex > viewport.end) continue;
      
      // Calculate position
      const viewportOffset = viewport.start * this.config.cellHeight;
      const x = colCoord.x ?? 0;
      const y = (rowCoord.y ?? 0) - viewportOffset;

      // Create preview element
      const preview = document.createElement('div');
      preview.className = 'vibegridx-fill-preview';
      preview.dataset.cellKey = cellKey;
      Object.assign(preview.style, {
        position: 'absolute',
        left: `${x}px`,
        top: `${y}px`,
        width: `${colCoord.width}px`,
        height: `${rowCoord.height ?? this.config.cellHeight}px`,
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        border: '2px dashed rgba(59, 130, 246, 0.5)',
        boxSizing: 'border-box',
        pointerEvents: 'none',
        opacity: '0',
        transition: 'opacity 150ms ease-out'
      });
      
      if (this.previewContainer) {
        this.previewContainer.appendChild(preview);
        this.previewElements.set(cellKey, preview);
        
        // Animate in
        requestAnimationFrame(() => {
          preview.style.opacity = '1';
        });
      }
    }
  }
  
  /**
   * Render fill preview with visual positions directly (same path as selections)
   */
  renderFillPreviewWithVisualPositions(visualCells: VisualCellPosition[]): void {
    // Build set of new cell keys for comparison (same pattern as selections)
    const newCellKeys = new Set(visualCells.map(cell => cell.cellKey));
    const currentCellKeys = new Set(this.previewElements.keys());
    
    // Remove elements that are no longer in preview (smooth removal like selections)
    for (const cellKey of currentCellKeys) {
      if (!newCellKeys.has(cellKey)) {
        this.removeFillPreviewElement(cellKey);
      }
    }
    
    // Add or update elements for new/existing preview cells (same pattern as selections)
    for (const cell of visualCells) {
      const cellKey = cell.cellKey;
      
      this.addOrUpdateFillPreviewElement(cellKey, {
        x: cell.x,
        y: cell.y,
        width: cell.width,
        height: cell.height
      });
    }
  }
  
  /**
   * Add or update a fill preview element (same pattern as selections)
   */
  private addOrUpdateFillPreviewElement(
    cellKey: string,
    position: { x: number; y: number; width: number; height: number }
  ): void {
    let element = this.previewElements.get(cellKey);
    
    if (!element) {
      // Create new preview element (same pattern as selections)
      element = document.createElement('div');
      element.className = 'vibegridx-fill-preview';
      element.dataset.cellKey = cellKey;
      
      // Apply styles (same pattern as selections but with dashed border for preview)
      Object.assign(element.style, {
        position: 'absolute',
        pointerEvents: 'none',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        border: '2px dashed rgba(59, 130, 246, 0.5)',
        boxSizing: 'border-box',
        zIndex: '15',
        opacity: '0', // Start invisible for animation
        transition: 'opacity 150ms ease-out, left 150ms ease-out, top 150ms ease-out'
      });
      
      if (this.previewContainer) {
        this.previewContainer.appendChild(element);
        this.previewElements.set(cellKey, element);
        
        // Animate in (same as selections)
        requestAnimationFrame(() => {
          if (element) {
            element.style.opacity = '1';
          }
        });
      }
    }
    
    // Update position and size (smooth transitions like selections)
    Object.assign(element.style, {
      left: `${position.x}px`,
      top: `${position.y}px`,
      width: `${position.width}px`,
      height: `${position.height}px`
    });
  }
  
  /**
   * Remove a fill preview element with animation (same pattern as selections)
   */
  private removeFillPreviewElement(cellKey: string): void {
    const element = this.previewElements.get(cellKey);
    if (!element) return;
    
    // Animate out (same as selections)
    element.style.transition = 'opacity 150ms ease-in';
    element.style.opacity = '0';
    
    // Remove after animation
    setTimeout(() => {
      element.remove();
      this.previewElements.delete(cellKey);
    }, 150);
  }

  /**
   * Clear fill preview
   */
  clearFillPreview(): void {
    for (const element of this.previewElements.values()) {
      element.remove();
    }
    this.previewElements.clear();
  }
  
  /**
   * Calculate fill preview cells based on drag position
   */
  calculateFillPreviewCells(
    dragPos: { x: number; y: number },
    selectedCells: Set<string>,
    viewport: ViewportInfo
  ): Set<string> {
    if (!this.coordinateMapping || selectedCells.size === 0) {
      return new Set();
    }

    // Get bounds of selected cells
    const bounds = this.getSelectionBounds(selectedCells);
    if (!bounds) {
      return new Set();
    }

    // Find which row the mouse is currently over (same approach as selection)
    let targetRowIndex = -1;
    for (let i = 0; i < this.coordinateMapping.rows.length; i++) {
      const row = this.coordinateMapping.rows[i];
      const rowY = row.y ?? (i * this.config.cellHeight);
      const rowHeight = row.height ?? this.config.cellHeight;

      if (dragPos.y >= rowY && dragPos.y < rowY + rowHeight) {
        targetRowIndex = i;
        break;
      }
    }

    // If no row found, return empty
    if (targetRowIndex === -1) {
      return new Set();
    }

    // Determine fill direction and range
    const fillDown = targetRowIndex > bounds.maxRowIndex;
    const fillUp = targetRowIndex < bounds.minRowIndex;

    if (!fillDown && !fillUp) {
      // Mouse is still within selection - no fill
      return new Set();
    }
    
    const previewCells = new Set<string>();

    // Fill from selection boundary to target row (inclusive)
    const startRow = fillDown ? bounds.maxRowIndex + 1 : targetRowIndex;
    const endRow = fillDown ? targetRowIndex : bounds.minRowIndex - 1;

    for (let rowIdx = startRow; rowIdx <= endRow; rowIdx++) {
      if (rowIdx >= 0 && rowIdx < this.coordinateMapping.rows.length) {
        const row = this.coordinateMapping.rows[rowIdx];

        // Add cells for each column in selection (vertical fill, locked columns)
        for (let c = bounds.minColIndex; c <= bounds.maxColIndex; c++) {
          const col = this.coordinateMapping.columns[c];
          if (col) {
            const cellKey = `${row.rowId}:${col.columnId}`;
            previewCells.add(cellKey);
          }
        }
      }
    }
    
    return previewCells;
  }
  
  // ====================================
  // PRIVATE HELPERS
  // ====================================
  
  /**
   * Check if selection represents complete rows
   */
  private isCompleteRowSelection(visualCells: VisualCellPosition[], selectedRows?: Set<string>): boolean {
    if (!selectedRows || selectedRows.size === 0) return false;
    
    // Check if we have cells for all columns in the selected rows
    const rowIds = new Set(visualCells.map(c => c.cellKey.split(':')[0]));
    return rowIds.size === selectedRows.size;
  }
  
  /**
   * Get selection bounds
   */
  private getSelectionBounds(selectedCells: Set<string>) {
    if (!this.coordinateMapping) {
      return null;
    }
    
    let minRowIndex = Infinity, maxRowIndex = -Infinity;
    let minColIndex = Infinity, maxColIndex = -Infinity;
    
    for (const cellKey of selectedCells) {
      const [rowId, columnId] = cellKey.split(':');
      
      const rowIndex = this.coordinateMapping.rows.findIndex((r: any) => r.rowId === rowId);
      const colIndex = this.coordinateMapping.columns.findIndex((c: any) => c.columnId === columnId);
      
      if (rowIndex !== -1 && colIndex !== -1) {
        minRowIndex = Math.min(minRowIndex, rowIndex);
        maxRowIndex = Math.max(maxRowIndex, rowIndex);
        minColIndex = Math.min(minColIndex, colIndex);
        maxColIndex = Math.max(maxColIndex, colIndex);
      }
    }
    
    if (minRowIndex === Infinity) {
      return null;
    }
    
    const minRow = this.coordinateMapping.rows[minRowIndex];
    const maxRow = this.coordinateMapping.rows[maxRowIndex];
    const minCol = this.coordinateMapping.columns[minColIndex];
    const maxCol = this.coordinateMapping.columns[maxColIndex];

    const centerX = (minCol.offset + maxCol.offset + maxCol.width) / 2;

    // Use actual visual Y from coordinate mapping (same as selection system)
    const maxRowY = maxRow.y ?? (maxRowIndex * this.config.cellHeight);
    const maxRowHeight = maxRow.height ?? this.config.cellHeight;

    // Fill handle at bottom of selection - use maxRow bottom as reference
    const centerY = maxRowY + maxRowHeight / 2;
    
    const bounds = {
      minRowIndex,
      maxRowIndex,
      minColIndex,
      maxColIndex,
      centerX: centerX,
      centerY: centerY
    };
    
    return bounds;
  }
  
  // ====================================
  // PUBLIC METHODS FOR UNIFIED EVENT SYSTEM
  // ====================================
  
  /**
   * Handle fill move from EventDelegationManager with semantic throttling
   */
  handleFillMove(dragPos: { x: number; y: number }): void {
    const selectedCells = this.callbacks.getSelectedCells();
    const viewport = this.currentViewport;

    if (!viewport || !this.coordinateMapping || selectedCells.size === 0) {
      return;
    }

    // Use cached bounds if available (expensive operation)
    if (!this.cachedBounds) {
      this.cachedBounds = this.getSelectionBounds(selectedCells);
      if (!this.cachedBounds) return;
    }

    const dragDeltaY = Math.abs(dragPos.y - this.cachedBounds.centerY);
    const rowsToFill = Math.floor(dragDeltaY / this.config.cellHeight);
    const fillDown = dragPos.y > this.cachedBounds.centerY;

    console.log('📋 Fill drag move', {
      dragPos,
      boundsCenter: this.cachedBounds.centerY,
      dragDeltaY,
      rowsToFill,
      fillDown,
      cellHeight: this.config.cellHeight
    });

    // SEMANTIC THROTTLING: Only process if meaningful change occurred
    if (rowsToFill === this.lastRowsToFill && fillDown === this.lastFillDirection) {
      // Same result as last calculation - skip expensive operations
      return;
    }

    // Store semantic values for next comparison
    this.lastRowsToFill = rowsToFill;
    this.lastFillDirection = fillDown;

    // Now do the expensive calculation only when needed
    const previewCells = this.calculateFillPreviewCells(dragPos, selectedCells, viewport);
    this.callbacks.onFillPreview(previewCells);
  }
  
  /**
   * Handle fill start from EventDelegationManager
   */
  handleFillStart(): void {
    // Reset semantic throttling state for new drag operation
    this.lastRowsToFill = 0;
    this.lastFillDirection = null;
    this.cachedBounds = null;
    
    this.callbacks.onFillStart('vertical'); // Always vertical as requested
  }
  
  /**
   * Handle fill complete from EventDelegationManager
   */
  handleFillComplete(dragPos: { x: number; y: number }): void {
    const selectedCells = this.callbacks.getSelectedCells();
    const viewport = this.currentViewport;
    
    if (viewport && this.coordinateMapping) {
      const fillCells = this.calculateFillPreviewCells(dragPos, selectedCells, viewport);
      
      if (fillCells.size > 0) {
        this.callbacks.onFillComplete(fillCells);
      } else {
        this.callbacks.onFillCancel();
      }
    }
    
    // Clear preview after completion
    this.clearFillPreview();
  }
  
  /**
   * Destroy the layer and clean up
   */
  destroy(): void {
    this.hideFillHandle();
    
    if (this.fillHandle) {
      this.fillHandle.remove();
      this.fillHandle = null;
    }
    
    if (this.fillHandleContainer) {
      this.fillHandleContainer.remove();
      this.fillHandleContainer = null;
    }
    
    if (this.previewContainer) {
      this.previewContainer.remove();
      this.previewContainer = null;
    }
  }
}