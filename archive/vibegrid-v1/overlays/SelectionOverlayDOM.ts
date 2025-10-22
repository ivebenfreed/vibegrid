import type { VisualCellPosition } from './OverlayTypes';
import { GRID_DIMENSIONS } from '../constants/grid-dimensions';
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
    
    myLog.info('SelectionOverlayDOM: Created', {
      container: this.container,
      config: this.config
    });
  }
  
  // NOTE: updateViewport method removed - viewport handled by DOM positioning system
  
  // NOTE: Old coordinate mapping method removed - now using DOM positioning only
  
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

    // Clear all existing selection elements
    for (const element of this.selectionElements.values()) {
      element.remove();
    }
    this.selectionElements.clear();

    if (visualCells.length === 0) {
      return;
    }

    // For single cell selection, use individual overlay
    if (visualCells.length === 1) {
      const cell = visualCells[0];
      this.addOrUpdateSelectionElement(cell.cellKey, {
        x: cell.x,
        y: cell.y,
        width: cell.width,
        height: cell.height
      });
    } else {
      // For multi-cell selection, create a single merged rectangle
      // Find the bounding box of all selected cells
      let minX = Infinity, minY = Infinity;
      let maxX = -Infinity, maxY = -Infinity;

      for (const cell of visualCells) {
        minX = Math.min(minX, cell.x);
        minY = Math.min(minY, cell.y);
        maxX = Math.max(maxX, cell.x + cell.width);
        maxY = Math.max(maxY, cell.y + cell.height);
      }

      // Create a single overlay for the entire selection
      const mergedKey = 'merged-selection';
      const element = document.createElement('div');
      element.className = 'vibegridx-selection-overlay vibegridx-selection-merged';
      element.dataset.cellKey = mergedKey;

      // Apply styles for merged selection - only show border, no fill
      Object.assign(element.style, {
        position: 'absolute',
        pointerEvents: 'none',
        backgroundColor: this.config.selectionColor, // Light fill
        border: `${this.config.borderWidth}px solid ${this.config.selectionBorderColor}`,
        boxSizing: 'border-box',
        zIndex: `${GRID_DIMENSIONS.Z_INDEX.SELECTION}`,
        left: `${minX}px`,
        top: `${minY}px`,
        width: `${maxX - minX}px`,
        height: `${maxY - minY}px`,
        opacity: '0', // Start invisible for animation
        transform: 'scale(0.98)',
        transition: 'opacity 200ms ease-out, transform 200ms ease-out',
        borderRadius: '3px'
      });

      this.container.appendChild(element);
      this.selectionElements.set(mergedKey, element);

      // Trigger animation
      requestAnimationFrame(() => {
        element.style.opacity = '1';
        element.style.transform = 'scale(1)';
      });

      myLog.info('SelectionOverlayDOM: Created merged selection', {
        bounds: { minX, minY, maxX, maxY },
        width: maxX - minX,
        height: maxY - minY,
        cellCount: visualCells.length
      });
    }

    myLog.info('SelectionOverlayDOM: After smooth update', {
      elementCount: this.selectionElements.size,
      elementKeys: Array.from(this.selectionElements.keys())
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
        zIndex: `${GRID_DIMENSIONS.Z_INDEX.SELECTION}`, // Use SELECTION z-index from GRID_DIMENSIONS
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
        element.style.opacity = '1'; // Full opacity - the color has transparency
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
    
    // GET COMPREHENSIVE POSITIONING DIAGNOSTIC DATA
    const elementBounds = element.getBoundingClientRect();
    const containerBounds = this.container.getBoundingClientRect();
    const scrollableParent = this.findScrollableParent();
    const scrollParentBounds = scrollableParent ? scrollableParent.getBoundingClientRect() : null;
    const scrollLeft = scrollableParent ? scrollableParent.scrollLeft : 0;

    myLog.info(`🎯 DIAGNOSTIC: SelectionOverlayDOM element positioned`, {
      cellKey,

      // POSITION DATA
      inputPosition: { x: position.x, y: position.y, width: position.width, height: position.height },
      appliedStyles: {
        left: element.style.left,
        top: element.style.top,
        width: element.style.width,
        height: element.style.height,
        position: element.style.position
      },

      // BOUNDING RECTANGLES
      elementBounds: {
        left: elementBounds.left,
        top: elementBounds.top,
        right: elementBounds.right,
        bottom: elementBounds.bottom,
        width: elementBounds.width,
        height: elementBounds.height
      },
      containerBounds: {
        left: containerBounds.left,
        top: containerBounds.top,
        right: containerBounds.right,
        bottom: containerBounds.bottom,
        width: containerBounds.width,
        height: containerBounds.height
      },

      // SCROLL CONTEXT
      scrollContext: {
        scrollableParentClass: scrollableParent?.className,
        scrollLeft,
        scrollTop: scrollableParent?.scrollTop || 0,
        scrollParentBounds: scrollParentBounds ? {
          left: scrollParentBounds.left,
          top: scrollParentBounds.top,
          width: scrollParentBounds.width,
          height: scrollParentBounds.height
        } : null
      },

      // POSITION ANALYSIS
      analysis: {
        elementRelativeToContainer: {
          x: elementBounds.left - containerBounds.left,
          y: elementBounds.top - containerBounds.top
        },
        isElementVisible: elementBounds.right > containerBounds.left &&
                         elementBounds.left < containerBounds.right &&
                         elementBounds.bottom > containerBounds.top &&
                         elementBounds.top < containerBounds.bottom,
        elementOverflowsRight: elementBounds.right > containerBounds.right,
        elementOverflowsLeft: elementBounds.left < containerBounds.left,
        positionChanged: isPositionChange
      }
    });
  }
  
  /**
   * Find the scrollable parent element for diagnostic purposes
   */
  private findScrollableParent(): HTMLElement | null {
    let parent = this.container.parentElement;
    while (parent) {
      const overflow = getComputedStyle(parent).overflow;
      if (overflow === 'auto' || overflow === 'scroll' || overflow === 'hidden') {
        return parent;
      }
      parent = parent.parentElement;
    }
    return null;
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
  
  // NOTE: updateSelectionRange method removed - range selection now handled by hybrid coordinate system
  
  // NOTE: highlightCells method removed - cell highlighting now handled by hybrid coordinate system
  
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