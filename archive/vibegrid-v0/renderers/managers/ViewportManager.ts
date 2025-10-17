/**
 * ViewportManager - Specialized manager for VibeGrid viewport and scroll handling
 * 
 * Handles viewport dimensions, virtual scrolling coordination, header sync, 
 * and scroll event management. Extracted from SimplePassiveRenderer for better modularity.
 */

import { log } from '@/logger';
import type { 
  TableCore$, 
  TableInteraction$, 
  TableViewport$ 
} from '../../stores/pure-observables';
import type { ScrollController } from '../modules/ScrollController';
import type { KeyboardNavigationController } from '../modules/KeyboardNavigationController';
import type { SelectionController } from '../modules/SelectionController';

const fileLog = log('components/custom/vibegrid/renderers/managers/ViewportManager.ts');

const ROW_HEIGHT = 40;

export interface ViewportManagerOptions {
  tableCore$: TableCore$;
  tableInteraction$: TableInteraction$;
  tableViewport$: TableViewport$;
  scrollController?: ScrollController;
  keyboardNavController?: KeyboardNavigationController;
  selectionController?: SelectionController;
  container: HTMLElement;
  viewport: HTMLElement;
  headerViewport: HTMLElement;
  bodyContainer: HTMLElement;
  
  // Callback functions for renderer coordination
  onViewportChange: () => void;
  
  // DOM utility functions
  createElement: (tag: string, className?: string) => HTMLElement;
}

export class ViewportManager {
  private tableCore$: TableCore$;
  private tableInteraction$: TableInteraction$;
  private tableViewport$: TableViewport$;
  private scrollController?: ScrollController;
  private keyboardNavController?: KeyboardNavigationController;
  private selectionController?: SelectionController;
  private container: HTMLElement;
  private onViewportChange: () => void;
  private createElement: (tag: string, className?: string) => HTMLElement;
  
  // Viewport elements
  private viewport: HTMLElement | null = null;
  private headerViewport: HTMLElement | null = null;
  private bodyContainer: HTMLElement | null = null;
  
  // Scroll state
  private _scrollRAF: number | null = null;

  constructor(options: ViewportManagerOptions) {
    this.tableCore$ = options.tableCore$;
    this.tableInteraction$ = options.tableInteraction$;
    this.tableViewport$ = options.tableViewport$;
    this.scrollController = options.scrollController;
    this.keyboardNavController = options.keyboardNavController;
    this.selectionController = options.selectionController;
    this.container = options.container;
    this.viewport = options.viewport;
    this.headerViewport = options.headerViewport;
    this.bodyContainer = options.bodyContainer;
    this.onViewportChange = options.onViewportChange;
    this.createElement = options.createElement;
  }

  /**
   * Create viewport structure with proper scrolling setup
   */
  createViewportStructure(): {
    headerViewport: HTMLElement;
    viewport: HTMLElement;
    bodyContainer: HTMLElement;
  } {
    // Header viewport wrapper (for proper horizontal scrolling sync)
    this.headerViewport = this.createElement('div', 'vibegridx-header-viewport');
    this.headerViewport.style.cssText = `
      overflow-x: auto;
      overflow-y: hidden;
      position: relative;
      border-bottom: 1px solid #e9ecef;
      flex-shrink: 0;
      scrollbar-width: none; /* Firefox */
      -ms-overflow-style: none; /* IE and Edge */
    `;
    
    // Hide webkit scrollbars for header viewport
    this.headerViewport.style.setProperty('-webkit-overflow-scrolling', 'touch');
    
    // Viewport (scrollable area)
    this.viewport = this.createElement('div', 'vibegridx-viewport');
    this.viewport.style.cssText = `
      flex: 1;
      overflow: auto;
      position: relative;
      background: white;
    `;
    
    // Body container (inside viewport)
    this.bodyContainer = this.createElement('div', 'vibegridx-body');
    this.bodyContainer.style.cssText = `
      position: relative;
      overflow: hidden;
    `;
    
    this.viewport.appendChild(this.bodyContainer);
    
    return {
      headerViewport: this.headerViewport,
      viewport: this.viewport,
      bodyContainer: this.bodyContainer
    };
  }

  /**
   * Initialize viewport dimensions
   */
  initializeViewportDimensions(): void {
    if (this.viewport) {
      const rect = this.viewport.getBoundingClientRect();
      this.tableViewport$.updateViewport(rect.width, rect.height);
      
      fileLog.info('📐 Viewport dimensions initialized', {
        width: rect.width,
        height: rect.height
      });
    }
  }

  /**
   * Setup scroll event handling and header synchronization
   * Implements the planned scroll coordination from PURE_OBSERVABLE_PROGRESS.md
   */
  setupScrollHandling(): void {
    if (!this.viewport) return;
    
    fileLog.info('📜 Setting up scroll coordination');
    
    // Direct DOM event binding → Observable updates (as planned in docs)
    this.viewport.addEventListener('scroll', (e) => {
      const target = e.target as HTMLElement;
      const scrollTop = target.scrollTop;
      const scrollLeft = target.scrollLeft;
      
      // Update viewport observable (triggers all reactive updates)
      this.tableViewport$.updateScroll(scrollTop, scrollLeft);
      
      // Sync header scroll with requestAnimationFrame optimization
      this.syncHeaderScroll(scrollLeft);
      
      fileLog.debug('📜 Scroll event processed', { scrollTop, scrollLeft });
    });
    
    this.setupViewportClickHandling();
    this.setupKeyboardHandling();
  }

  /**
   * Setup viewport click handling for selection clearing
   */
  private setupViewportClickHandling(): void {
    // Add click-outside handler to clear selection
    this.container.addEventListener('click', (e) => {
      const cellElement = (e.target as HTMLElement).closest('[data-row-id][data-column-id]');
      const headerElement = (e.target as HTMLElement).closest('.vibegridx-header-cell');
      const viewportElement = (e.target as HTMLElement).closest('.vibegridx-viewport');
      
      // Only clear selection if click is in the viewport area but not on a cell or header
      // This prevents clearing when clicking on cells (event bubbling) or outside the table entirely
      if (viewportElement && !cellElement && !headerElement) {
        fileLog.info('🖱️ Click outside cells - clearing selection');
        this.tableInteraction$.clearSelection();
      }
    });
  }

  /**
   * Setup keyboard event handling for advanced selection and navigation
   */
  private setupKeyboardHandling(): void {
    this.container.addEventListener('keydown', (e) => {
      const isCtrlKey = e.ctrlKey || e.metaKey;
      const isShiftKey = e.shiftKey;
      
      const focusedCell = this.keyboardNavController?.getFocusedCell();
      fileLog.debug('⌨️ Keyboard event', { 
        key: e.key, 
        shiftKey: isShiftKey, 
        ctrlKey: isCtrlKey, 
        focusedCell 
      });
      
      switch (e.key) {
        case 'a':
        case 'A':
          if (isCtrlKey) {
            e.preventDefault();
            this.selectionController?.selectAllCells();
            fileLog.info('⌨️ Ctrl+A - Select all cells');
          }
          break;
        case 'Escape':
          e.preventDefault();
          this.tableInteraction$.clearSelection();
          this.keyboardNavController?.clear();
          fileLog.info('⌨️ Escape - Clear selection and focus');
          break;
        case 'ArrowUp':
        case 'ArrowDown':
        case 'ArrowLeft':
        case 'ArrowRight':
          if (focusedCell) {
            e.preventDefault();
            this.handleArrowKeyNavigation(e.key, isShiftKey);
          }
          break;
        case 'Enter':
          if (focusedCell) {
            e.preventDefault();
            this.handleEnterKey();
          }
          break;
      }
    });
  }

  /**
   * Handle arrow key navigation
   */
  private handleArrowKeyNavigation(key: string, isShiftKey: boolean): void {
    if (!this.keyboardNavController) return;
    
    const direction = key.replace('Arrow', '').toLowerCase() as 'up' | 'down' | 'left' | 'right';
    
    if (isShiftKey) {
      // Extend selection
      this.keyboardNavController.extendSelection(direction);
    } else {
      // Move focus
      this.keyboardNavController.moveFocus(direction);
    }
    
    fileLog.debug('⌨️ Arrow key navigation', { direction, isShiftKey });
  }

  /**
   * Handle Enter key press
   */
  private handleEnterKey(): void {
    const focusedCell = this.keyboardNavController?.getFocusedCell();
    if (focusedCell) {
      const value = this.getCellValue(focusedCell);
      this.tableInteraction$.startEdit(focusedCell, value ? String(value) : '');
      fileLog.info('⌨️ Enter - Start editing focused cell', { focusedCell });
    }
  }

  /**
   * Get cell value for editing
   */
  private getCellValue(cellId: string): any {
    const [rowId, columnId] = cellId.split(':');
    const rows = this.tableCore$.processedRows.get();
    const row = rows.find(r => r.id === rowId);
    return row ? row[columnId] : null;
  }

  /**
   * Synchronize header horizontal scroll with viewport
   * Uses native scrolling for the header viewport
   */
  private syncHeaderScroll(scrollLeft: number): void {
    if (!this._scrollRAF && this.headerViewport) {
      this._scrollRAF = requestAnimationFrame(() => {
        if (this.headerViewport) {
          // Use native scrolling for the header viewport
          this.headerViewport.scrollLeft = scrollLeft;
          
          fileLog.debug('📜 Header scroll synced', { 
            scrollLeft, 
            actualScrollLeft: this.headerViewport.scrollLeft
          });
        }
        this._scrollRAF = null;
      });
    }
  }

  /**
   * Handle viewport changes (scroll and dimension updates)
   * Triggers virtual scrolling updates when visible range changes
   */
  handleViewportChange(): void {
    const scrollTop = this.tableViewport$.scrollTop.get();
    const scrollLeft = this.tableViewport$.scrollLeft.get();
    const viewportWidth = this.tableViewport$.viewportWidth.get();
    const viewportHeight = this.tableViewport$.viewportHeight.get();
    const visibleRange = this.tableViewport$.visibleRange.get();
    
    fileLog.debug('📐 Viewport updated', { 
      scrollTop, 
      scrollLeft, 
      viewportWidth, 
      viewportHeight,
      visibleRange: `${visibleRange.start}-${visibleRange.end}`
    });
    
    // Update viewport dimensions if we have a container
    if (this.viewport && viewportWidth === 0) {
      const rect = this.viewport.getBoundingClientRect();
      this.tableViewport$.updateViewport(rect.width, rect.height);
    }
    
    // Trigger callback for renderer coordination
    this.onViewportChange();
  }

  /**
   * Calculate virtual scrolling ranges
   */
  calculateVirtualRanges(): {
    visibleRowRange: { start: number; end: number };
    visibleColumnRange: { start: number; end: number };
  } {
    const scrollTop = this.tableViewport$.scrollTop.get();
    const scrollLeft = this.tableViewport$.scrollLeft.get();
    const viewportHeight = this.tableViewport$.viewportHeight.get();
    const viewportWidth = this.tableViewport$.viewportWidth.get();
    
    const rows = this.tableCore$.processedRows.get();
    const columns = this.tableCore$.columns.get().filter(col => 
      this.tableCore$.columnVisibility.get()[col.id] !== false
    );
    
    // Calculate visible row range
    const startRowIndex = Math.floor(scrollTop / ROW_HEIGHT);
    const endRowIndex = Math.min(
      rows.length,
      Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + 1
    );
    
    // Calculate visible column range
    let startColIndex = 0;
    let endColIndex = columns.length;
    let accumulatedWidth = 40; // Account for row header
    
    // Find start column - first column that is at least partially visible
    for (let i = 0; i < columns.length; i++) {
      if (accumulatedWidth + columns[i].width > scrollLeft) {
        startColIndex = i;
        break;
      }
      accumulatedWidth += columns[i].width;
    }
    
    // Find end column - continue from where we left off
    for (let i = startColIndex; i < columns.length; i++) {
      if (accumulatedWidth > scrollLeft + viewportWidth) {
        endColIndex = i + 1; // Include one more for partial visibility
        break;
      }
      accumulatedWidth += columns[i].width;
    }
    
    return {
      visibleRowRange: { start: startRowIndex, end: endRowIndex },
      visibleColumnRange: { start: startColIndex, end: endColIndex }
    };
  }

  /**
   * Update total content dimensions for virtual scrolling
   */
  updateContentDimensions(): void {
    if (!this.bodyContainer) return;
    
    const rows = this.tableCore$.processedRows.get();
    const columns = this.tableCore$.columns.get().filter(col => 
      this.tableCore$.columnVisibility.get()[col.id] !== false
    );
    
    const totalHeight = rows.length * ROW_HEIGHT;
    const totalWidth = 40 + columns.reduce((sum, col) => sum + col.width, 0);
    
    this.bodyContainer.style.height = `${totalHeight}px`;
    this.bodyContainer.style.width = `${totalWidth}px`;
    this.bodyContainer.style.minWidth = `${totalWidth}px`;
    
    fileLog.debug('📐 Content dimensions updated', { 
      totalHeight, 
      totalWidth,
      rowCount: rows.length,
      columnCount: columns.length
    });
  }

  /**
   * Get viewport element reference
   */
  getViewport(): HTMLElement | null {
    return this.viewport;
  }

  /**
   * Get header viewport element reference
   */
  getHeaderViewport(): HTMLElement | null {
    return this.headerViewport;
  }

  /**
   * Get body container element reference
   */
  getBodyContainer(): HTMLElement | null {
    return this.bodyContainer;
  }

  /**
   * Focus the viewport for keyboard events
   */
  focusViewport(): void {
    if (this.container) {
      this.container.focus();
    }
  }

  /**
   * Clean up viewport manager
   */
  destroy(): void {
    fileLog.info('🧹 Destroying ViewportManager');
    
    // Cancel any pending scroll animations
    if (this._scrollRAF) {
      cancelAnimationFrame(this._scrollRAF);
      this._scrollRAF = null;
    }
    
    // Clear references
    this.viewport = null;
    this.headerViewport = null;
    this.bodyContainer = null;
    
    fileLog.info('✅ ViewportManager destroyed');
  }
}