import type { ViewportInfo } from '../types';
import type { CoordinateMapping } from '../machines/table-machine/slices/dimensions-slice';
import type { VisualCellPosition } from './OverlayTypes';
import { log } from '@/logger';
const myLog = log('components/custom/vibegrid/overlays/SelectionOverlayDOM.ts');

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
  
  // Selection elements
  private selectionElements = new Map<string, HTMLDivElement>();
  
  // Track previous state to avoid unnecessary updates
  private lastSelectedCells = new Set<string>();
  
  // Track elements being animated out for cleanup
  private animatingOut = new Set<string>();
  
  // Track current viewport for scroll adjustment
  private currentViewport: ViewportInfo | null = null;
  
  constructor(
    container: HTMLElement,
    config: SelectionOverlayConfig
  ) {
    this.container = container;
    // Make selection much more visible
    this.config = {
      ...config,
      selectionColor: 'rgba(59, 130, 246, 0.15)', // More opaque background
      selectionBorderColor: 'rgb(59, 130, 246)', // Solid border
      borderWidth: 2
    };
    
    // Ensure container has relative positioning for absolute children
    if (getComputedStyle(this.container).position === 'static') {
      this.container.style.position = 'relative';
    }
    
    myLog.info('SelectionOverlayDOM: Created', {
      container: this.container,
      config: this.config
    });
  }
  
  /**
   * Update the current viewport for scroll adjustment
   */
  updateViewport(viewport: ViewportInfo): void {
    this.currentViewport = viewport;
  }
  
  /**
   * Update selection using coordinate mapping directly (pure XState approach)
   */
  updateSelectionWithMapping(selectedCells: Set<string>, viewport: ViewportInfo | null, coordinateMapping: any): void {
    myLog.info('SelectionOverlayDOM.updateSelectionWithMapping called', {
      selectedCells: selectedCells.size,
      selectedCellKeys: Array.from(selectedCells),
      viewport: viewport,
      hasCoordinateMapping: !!coordinateMapping,
      coordinateVersion: coordinateMapping?.version,
      rowCount: coordinateMapping?.rows?.length,
      colCount: coordinateMapping?.columns?.length
    });

    if (selectedCells.size === 0) {
      this.clearSelection();
      return;
    }

    if (!viewport || !coordinateMapping) {
      myLog.warn('SelectionOverlayDOM: Missing viewport or coordinate mapping for selection render', {
        hasViewport: !!viewport,
        hasCoordinateMapping: !!coordinateMapping
      });
      return;
    }

    // Calculate visible selected cells using coordinate mapping directly
    const visibleCells = new Set<string>();
    const cellPositions = new Map<string, { x: number; y: number; width: number; height: number }>();
    
    // Find the header height to offset the selection properly
    const headerHeight = 48; // HEADER_HEIGHT from SimplePassiveRenderer
    
    for (const cellKey of selectedCells) {
      const [rowId, columnId] = cellKey.split(':');
      
      // Find row and column in coordinate mapping
      const rowCoord = coordinateMapping.rows.find((r: any) => r.rowId === rowId);
      const colCoord = coordinateMapping.columns.find((c: any) => c.columnId === columnId);
      
      if (!rowCoord || !colCoord) continue;
      
      const rowIndex = coordinateMapping.rows.indexOf(rowCoord);
      
      // Always show selected cells, don't filter by viewport for now to debug alignment
      visibleCells.add(cellKey);
      
      // Calculate position based on coordinate mapping
      // Since overlay is inside viewport container, no need to add header offset
      cellPositions.set(cellKey, {
        x: colCoord.x,
        y: rowCoord.y, // Row coordinates are already relative to viewport
        width: colCoord.width,
        height: rowCoord.height
      });
      
      myLog.info('SelectionOverlayDOM: Cell position calculated', {
        cellKey,
        rowCoord: { y: rowCoord.y, height: rowCoord.height },
        colCoord: { x: colCoord.x, width: colCoord.width },
        finalPosition: {
          x: colCoord.x,
          y: rowCoord.y,
          width: colCoord.width,
          height: rowCoord.height
        }
      });
    }

    myLog.info('SelectionOverlayDOM: Visible cells calculated', {
      totalSelected: selectedCells.size,
      visibleCount: visibleCells.size,
      viewport: {
        start: viewport.start,
        end: viewport.end
      }
    });

    // Remove selection elements that are no longer selected
    for (const [cellKey, element] of this.selectionElements) {
      if (!visibleCells.has(cellKey)) {
        this.removeSelectionElement(cellKey);
      }
    }

    // Add or update selection elements for visible cells
    for (const cellKey of visibleCells) {
      const position = cellPositions.get(cellKey);
      if (position) {
        this.addOrUpdateSelectionElement(cellKey, position);
      }
    }

    this.lastSelectedCells = new Set(selectedCells);
  }
  
  /**
   * Update with visual cell positions directly
   */
  updateWithVisualPositions(visualCells: VisualCellPosition[]): void {
    myLog.info('SelectionOverlayDOM.updateWithVisualPositions', {
      cellCount: visualCells.length,
      containerExists: !!this.container,
      containerInDom: this.container ? document.body.contains(this.container) : false,
      containerClass: this.container?.className,
      firstCells: visualCells.slice(0, 2).map(c => ({
        key: c.cellKey,
        pos: { x: c.x, y: c.y, w: c.width, h: c.height }
      }))
    });
    
    // Build set of new cell keys for comparison
    const newCellKeys = new Set(visualCells.map(cell => cell.cellKey));
    const currentCellKeys = new Set(this.selectionElements.keys());
    
    // Remove elements that are no longer selected (smooth fade out)
    for (const cellKey of currentCellKeys) {
      if (!newCellKeys.has(cellKey)) {
        myLog.info(`SelectionOverlayDOM: Removing deselected cell ${cellKey}`);
        this.removeSelectionElement(cellKey);
      }
    }
    
    // Add or update elements for new/existing selections
    for (const cell of visualCells) {
      const cellKey = cell.cellKey;
      const isNewSelection = !currentCellKeys.has(cellKey);
      
      myLog.info(`SelectionOverlayDOM: ${isNewSelection ? 'Adding new' : 'Updating existing'} element for ${cellKey}`, {
        x: cell.x,
        y: cell.y,
        width: cell.width,
        height: cell.height
      });
      
      this.addOrUpdateSelectionElement(cellKey, {
        x: cell.x,
        y: cell.y,
        width: cell.width,
        height: cell.height
      });
    }
    
    myLog.info('SelectionOverlayDOM: After smooth update', {
      elementCount: this.selectionElements.size,
      elementKeys: Array.from(this.selectionElements.keys()),
      previousKeys: Array.from(currentCellKeys),
      newKeys: Array.from(newCellKeys)
    });
  }
  
  /**
   * Add or update a selection element
   */
  private addOrUpdateSelectionElement(
    cellKey: string,
    position: { x: number; y: number; width: number; height: number }
  ): void {
    let element = this.selectionElements.get(cellKey);
    
    if (!element) {
      myLog.info(`SelectionOverlayDOM: Creating new element for ${cellKey}`, {
        container: this.container.className,
        containerInDom: document.body.contains(this.container)
      });
      
      // Create new selection element
      element = document.createElement('div');
      element.className = 'vibegridx-selection-overlay';
      element.dataset.cellKey = cellKey;
      
      // Apply base styles
      Object.assign(element.style, {
        position: 'absolute',
        pointerEvents: 'none',
        backgroundColor: this.config.selectionColor,
        border: `${this.config.borderWidth}px solid ${this.config.selectionBorderColor}`,
        boxSizing: 'border-box',
        zIndex: '50', // Much higher z-index to appear above everything
        opacity: '0', // Start invisible for animation
        transform: 'scale(0.95)',
        transition: 'opacity 200ms ease-out, transform 200ms ease-out',
        // Ensure pixel-perfect alignment
        borderRadius: '2px'
      });
      
      this.container.appendChild(element);
      this.selectionElements.set(cellKey, element);
      
      myLog.info(`SelectionOverlayDOM: Element created and appended for ${cellKey}`, {
        elementInDom: document.body.contains(element),
        parentClass: element.parentElement?.className
      });
      
      // Trigger animation on next frame
      requestAnimationFrame(() => {
        element.style.opacity = '0.3';
        element.style.transform = 'scale(1)';
        myLog.info(`SelectionOverlayDOM: Animation triggered for ${cellKey}`);
      });
    }
    
    // Check if this is a position update for existing element
    const currentLeft = parseInt(element.style.left) || 0;
    const currentTop = parseInt(element.style.top) || 0;
    const isPositionChange = currentLeft !== position.x || currentTop !== position.y;
    
    // If position is changing, add smooth transition
    if (isPositionChange && element.style.opacity !== '0') {
      // Add position transition temporarily
      const originalTransition = element.style.transition;
      element.style.transition = 'left 200ms ease-out, top 200ms ease-out, width 200ms ease-out, height 200ms ease-out, opacity 200ms ease-out, transform 200ms ease-out';
      
      // Reset transition after animation
      setTimeout(() => {
        element.style.transition = originalTransition;
      }, 200);
    }
    
    // Update position and size
    // No need to adjust for scroll since we're inside the scrolling container
    Object.assign(element.style, {
      left: `${position.x}px`,
      top: `${position.y}px`,
      width: `${position.width}px`,
      height: `${position.height}px`
    });
    
    myLog.info(`SelectionOverlayDOM: Element positioned for ${cellKey}`, {
      left: position.x,
      top: position.y,
      width: position.width,
      height: position.height,
      actualLeft: element.style.left,
      actualTop: element.style.top,
      positionChanged: isPositionChange
    });
  }
  
  /**
   * Remove a selection element with animation
   */
  private removeSelectionElement(cellKey: string): void {
    const element = this.selectionElements.get(cellKey);
    if (!element || this.animatingOut.has(cellKey)) return;
    
    this.animatingOut.add(cellKey);
    
    // Animate out
    element.style.transition = 'opacity 150ms ease-in, transform 150ms ease-in';
    element.style.opacity = '0';
    element.style.transform = 'scale(0.95)';
    
    // Remove after animation
    setTimeout(() => {
      element.remove();
      this.selectionElements.delete(cellKey);
      this.animatingOut.delete(cellKey);
    }, 150);
  }
  
  /**
   * Clear all selection elements
   */
  clearSelection(): void {
    myLog.info('SelectionOverlayDOM: Clearing selection', {
      elementCount: this.selectionElements.size
    });
    
    // Animate all elements out simultaneously
    const elements = Array.from(this.selectionElements.entries());
    
    for (const [cellKey, element] of elements) {
      if (!this.animatingOut.has(cellKey)) {
        this.animatingOut.add(cellKey);
        element.style.transition = 'opacity 150ms ease-in, transform 150ms ease-in';
        element.style.opacity = '0';
        element.style.transform = 'scale(0.95)';
      }
    }
    
    // Remove all elements after animation
    setTimeout(() => {
      for (const [cellKey, element] of elements) {
        element.remove();
        this.animatingOut.delete(cellKey);
      }
      this.selectionElements.clear();
    }, 150);
    
    this.lastSelectedCells.clear();
  }
  
  /**
   * Update selection range (for drag selection)
   */
  updateSelectionRange(
    startCell: { rowId: string; columnId: string },
    endCell: { rowId: string; columnId: string },
    coordinateMapping: CoordinateMapping,
    viewport: ViewportInfo
  ): void {
    // Find row and column indices
    const startRowIdx = coordinateMapping.rows.findIndex(r => r.rowId === startCell.rowId);
    const endRowIdx = coordinateMapping.rows.findIndex(r => r.rowId === endCell.rowId);
    const startColIdx = coordinateMapping.columns.findIndex(c => c.columnId === startCell.columnId);
    const endColIdx = coordinateMapping.columns.findIndex(c => c.columnId === endCell.columnId);
    
    // Calculate range bounds
    const minRow = Math.min(startRowIdx, endRowIdx);
    const maxRow = Math.max(startRowIdx, endRowIdx);
    const minCol = Math.min(startColIdx, endColIdx);
    const maxCol = Math.max(startColIdx, endColIdx);
    
    // Build set of cells in range
    const rangeCells = new Set<string>();
    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        if (r < coordinateMapping.rows.length && c < coordinateMapping.columns.length) {
          const rowId = coordinateMapping.rows[r].rowId;
          const columnId = coordinateMapping.columns[c].columnId;
          rangeCells.add(`${rowId}:${columnId}`);
        }
      }
    }
    
    // Update selection with the range
    this.updateSelectionWithMapping(rangeCells, viewport, coordinateMapping);
  }
  
  /**
   * Highlight cells temporarily (e.g., for hover effects)
   */
  highlightCells(cellKeys: Set<string>, coordinateMapping: CoordinateMapping, viewport: ViewportInfo): void {
    // Create temporary highlight elements with different styling
    for (const cellKey of cellKeys) {
      const [rowId, columnId] = cellKey.split(':');
      const rowCoord = coordinateMapping.rows.find(r => r.rowId === rowId);
      const colCoord = coordinateMapping.columns.find(c => c.columnId === columnId);
      
      if (!rowCoord || !colCoord) continue;
      
      const rowIndex = coordinateMapping.rows.indexOf(rowCoord);
      if (rowIndex < viewport.start || rowIndex > viewport.end) continue;
      
      const element = document.createElement('div');
      element.className = 'vibegridx-highlight-overlay';
      
      const viewportOffset = viewport.start * this.config.cellHeight;
      Object.assign(element.style, {
        position: 'absolute',
        left: `${colCoord.x}px`,
        top: `${rowCoord.y - viewportOffset}px`,
        width: `${colCoord.width}px`,
        height: `${rowCoord.height}px`,
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        border: '2px solid rgba(59, 130, 246, 0.5)',
        pointerEvents: 'none',
        zIndex: '11',
        opacity: '0',
        transition: 'opacity 150ms ease-out'
      });
      
      this.container.appendChild(element);
      
      // Animate in
      requestAnimationFrame(() => {
        element.style.opacity = '1';
      });
      
      // Auto-remove after a delay
      setTimeout(() => {
        element.style.opacity = '0';
        setTimeout(() => element.remove(), 150);
      }, 650);
    }
  }
  
  /**
   * Destroy the overlay and clean up
   */
  destroy(): void {
    // Remove all elements immediately
    for (const element of this.selectionElements.values()) {
      element.remove();
    }
    this.selectionElements.clear();
    this.animatingOut.clear();
    this.lastSelectedCells.clear();
  }
}