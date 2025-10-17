/**
 * ScrollController - Manages scroll synchronization for VibeGrid
 * Handles viewport scrolling and header-body scroll coordination
 */

import { log } from '@/logger';

const fileLog = log('components/custom/vibegrid/renderers/modules/ScrollController.ts');

export interface ScrollControllerOptions {
  viewport: HTMLElement;
  headerViewport?: HTMLElement | null;
  container?: HTMLElement;
  onScroll?: (scrollLeft: number, scrollTop: number) => void;
  onClickOutside?: () => void;
  keyboardNavController?: any;
  selectionController?: any;
  tableInteraction$?: any;
}

export class ScrollController {
  private viewport: HTMLElement;
  private headerViewport: HTMLElement | null;
  private container?: HTMLElement;
  private scrollRAF: number | null = null;
  private onScroll?: (scrollLeft: number, scrollTop: number) => void;
  private onClickOutside?: () => void;
  private keyboardNavController?: any;
  private selectionController?: any;
  private tableInteraction$?: any;
  private lastScrollLeft: number = 0;
  private lastScrollTop: number = 0;

  // Event listeners for cleanup
  private eventListeners: Array<{
    element: EventTarget;
    event: string;
    handler: EventListener;
  }> = [];

  constructor(options: ScrollControllerOptions) {
    this.viewport = options.viewport;
    this.headerViewport = options.headerViewport || null;
    this.container = options.container;
    this.onScroll = options.onScroll;
    this.onClickOutside = options.onClickOutside;
    this.keyboardNavController = options.keyboardNavController;
    this.selectionController = options.selectionController;
    this.tableInteraction$ = options.tableInteraction$;

    this.setupScrollHandling();
  }

  /**
   * Setup comprehensive scroll and interaction event handling
   * Extracted from SimplePassiveRenderer for better modularity
   */
  private setupScrollHandling(): void {
    fileLog.info('📜 Setting up comprehensive scroll coordination');

    // Set up viewport scroll handling
    const scrollHandler = this.handleViewportScroll.bind(this);
    this.addEventListenerTracked(this.viewport, 'scroll', scrollHandler);

    // Add comprehensive interaction handling if container provided
    if (this.container) {
      this.setupInteractionHandling();
    }

    fileLog.info('✅ Comprehensive scroll coordination setup complete');
  }

  /**
   * Setup click and keyboard interaction handling
   */
  private setupInteractionHandling(): void {
    if (!this.container) return;

    // Add click-outside handler to clear selection
    const clickHandler = (e: Event) => {
      const cellElement = (e.target as HTMLElement).closest('[data-row-id][data-column-id]');
      const headerElement = (e.target as HTMLElement).closest('.vibegridx-header-cell');
      const viewportElement = (e.target as HTMLElement).closest('.vibegridx-viewport');

      // Only clear selection if click is in the viewport area but not on a cell or header
      // This prevents clearing when clicking on cells (event bubbling) or outside the table entirely
      if (viewportElement && !cellElement && !headerElement) {
        fileLog.info('🖱️ Click outside cells - clearing selection');
        if (this.onClickOutside) {
          this.onClickOutside();
        } else if (this.tableInteraction$?.clearSelection) {
          this.tableInteraction$.clearSelection();
        }
      }
    };
    this.addEventListenerTracked(this.container, 'click', clickHandler);

    // Add keyboard event handling for advanced selection and navigation
    const keydownHandler = (e: KeyboardEvent) => {
      const isCtrlKey = e.ctrlKey || e.metaKey;
      const isShiftKey = e.shiftKey;

      const focusedCell = this.keyboardNavController?.getFocusedCell();
      fileLog.debug('⌨️ Keyboard event', { key: e.key, shiftKey: isShiftKey, ctrlKey: isCtrlKey, focusedCell });

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
          this.tableInteraction$?.clearSelection();
          this.keyboardNavController?.clear();
          fileLog.info('⌨️ Escape - Clear selection and focus');
          break;
        case 'ArrowUp':
          e.preventDefault();
          this.keyboardNavController?.handleArrowKey('up', isShiftKey);
          break;
        case 'ArrowDown':
          e.preventDefault();
          this.keyboardNavController?.handleArrowKey('down', isShiftKey);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          this.keyboardNavController?.handleArrowKey('left', isShiftKey);
          break;
        case 'ArrowRight':
          e.preventDefault();
          this.keyboardNavController?.handleArrowKey('right', isShiftKey);
          break;
        default:
          // Let other keys pass through
          break;
      }
    };
    this.addEventListenerTracked(this.container, 'keydown', keydownHandler);

    // Make container focusable to receive keyboard events
    this.container.tabIndex = 0;
    this.container.style.outline = 'none';
  }

  /**
   * Add event listener with tracking for cleanup
   */
  private addEventListenerTracked(element: EventTarget, event: string, handler: EventListener): void {
    element.addEventListener(event, handler, { passive: event === 'scroll' });
    this.eventListeners.push({ element, event, handler });
  }

  /**
   * Handle viewport scroll event
   */
  private handleViewportScroll(event: Event): void {
    const scrollLeft = this.viewport.scrollLeft;
    const scrollTop = this.viewport.scrollTop;
    
    // Only process if scroll position actually changed
    if (scrollLeft !== this.lastScrollLeft || scrollTop !== this.lastScrollTop) {
      this.lastScrollLeft = scrollLeft;
      this.lastScrollTop = scrollTop;
      
      // Sync header scroll
      this.syncHeaderScroll(scrollLeft);
      
      // Call external scroll handler
      if (this.onScroll) {
        this.onScroll(scrollLeft, scrollTop);
      }
      
      fileLog.info('Viewport scrolled', {
        scrollLeft,
        scrollTop,
        viewportWidth: this.viewport.clientWidth,
        viewportHeight: this.viewport.clientHeight,
        scrollWidth: this.viewport.scrollWidth,
        scrollHeight: this.viewport.scrollHeight
      });
    }
  }

  /**
   * Sync header horizontal scroll with body
   */
  private syncHeaderScroll(scrollLeft: number): void {
    if (!this.scrollRAF && this.headerViewport) {
      this.scrollRAF = requestAnimationFrame(() => {
        if (this.headerViewport) {
          this.headerViewport.scrollLeft = scrollLeft;
        }
        this.scrollRAF = null;
      });
    }
  }

  /**
   * Programmatically scroll to a position
   */
  scrollTo(options: { left?: number; top?: number; behavior?: ScrollBehavior }): void {
    if (options.left !== undefined) {
      this.lastScrollLeft = options.left;
    }
    if (options.top !== undefined) {
      this.lastScrollTop = options.top;
    }
    
    this.viewport.scrollTo({
      left: options.left,
      top: options.top,
      behavior: options.behavior || 'auto'
    });
    
    // Sync header if scrolling horizontally
    if (options.left !== undefined && this.headerViewport) {
      this.headerViewport.scrollLeft = options.left;
    }
  }

  /**
   * Scroll a specific element into view
   */
  scrollElementIntoView(element: HTMLElement, options?: ScrollIntoViewOptions): void {
    element.scrollIntoView(options || {
      behavior: 'smooth',
      block: 'nearest',
      inline: 'nearest'
    });
  }

  /**
   * Get current scroll position
   */
  getScrollPosition(): { left: number; top: number } {
    return {
      left: this.viewport.scrollLeft,
      top: this.viewport.scrollTop
    };
  }

  /**
   * Get viewport dimensions
   */
  getViewportDimensions(): { width: number; height: number } {
    return {
      width: this.viewport.clientWidth,
      height: this.viewport.clientHeight
    };
  }

  /**
   * Get scroll dimensions
   */
  getScrollDimensions(): { width: number; height: number } {
    return {
      width: this.viewport.scrollWidth,
      height: this.viewport.scrollHeight
    };
  }

  /**
   * Check if element is in viewport
   */
  isElementInViewport(element: HTMLElement): boolean {
    const rect = element.getBoundingClientRect();
    const viewportRect = this.viewport.getBoundingClientRect();
    
    return (
      rect.top >= viewportRect.top &&
      rect.left >= viewportRect.left &&
      rect.bottom <= viewportRect.bottom &&
      rect.right <= viewportRect.right
    );
  }

  /**
   * Update header viewport reference
   */
  setHeaderViewport(headerViewport: HTMLElement | null): void {
    this.headerViewport = headerViewport;
  }

  /**
   * Clean up all scroll and interaction handling
   */
  destroy(): void {
    if (this.scrollRAF) {
      cancelAnimationFrame(this.scrollRAF);
      this.scrollRAF = null;
    }

    // Clean up all tracked event listeners
    this.eventListeners.forEach(({ element, event, handler }) => {
      try {
        element.removeEventListener(event, handler);
      } catch (error) {
        fileLog.error('❌ Error removing event listener', { event, error });
      }
    });
    this.eventListeners = [];

    fileLog.info('🧹 ScrollController destroyed');
  }

  /**
   * Reset scroll position
   */
  reset(): void {
    this.scrollTo({ left: 0, top: 0 });
    this.lastScrollLeft = 0;
    this.lastScrollTop = 0;
  }
}