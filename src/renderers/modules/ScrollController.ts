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

    // Keyboard handling now managed by KeyboardController - removed from here

    fileLog.info('✅ Comprehensive scroll coordination setup complete');
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

      // Sync header scroll immediately (lightweight operation)
      this.syncHeaderScroll(scrollLeft);

      // Cancel any pending scroll update to debounce rapid scroll events
      if (this.scrollRAF) {
        cancelAnimationFrame(this.scrollRAF);
      }

      // ✅ PERFORMANCE: Throttle the expensive scroll handler to prevent excessive re-renders
      this.scrollRAF = requestAnimationFrame(() => {
        // Call external scroll handler (triggers viewport observer)
        if (this.onScroll) {
          this.onScroll(scrollLeft, scrollTop);
        }

        // ✅ PERFORMANCE: Reduced logging verbosity during scroll
        fileLog.debug('Viewport scrolled', {
          scrollLeft,
          scrollTop,
          viewportWidth: this.viewport.clientWidth,
          viewportHeight: this.viewport.clientHeight
        });

        this.scrollRAF = null;
      });
    }
  }

  /**
   * Sync header horizontal scroll with body
   * Uses unified visual state for scroll synchronization
   */
  private syncHeaderScroll(scrollLeft: number): void {
    if (this.headerViewport) {
      // ✅ PERFORMANCE: Direct synchronous transform - no RAF needed for simple CSS transform
      const transform = `translateX(-${scrollLeft}px)`;
      this.headerViewport.style.transform = transform;

      // ✅ PERFORMANCE: Only log sync issues, not every successful sync
      fileLog.debug('🔄 Header scroll synced', { scrollLeft });
    } else {
      // Log missing header viewport as it's an actual issue
      fileLog.warn('⚠️ Header viewport not found for scroll sync', {
        scrollLeft,
        headerViewport: this.headerViewport
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
    
    // Sync header position if scrolling horizontally
    if (options.left !== undefined && this.headerViewport) {
      this.headerViewport.style.transform = `translateX(-${options.left}px)`;
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
   * Handle outside click events delegated from MouseController
   * Clears selection when clicking on empty space outside cells
   */
  handleOutsideClick(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    const cellElement = target.closest('[data-row-id][data-column-id]');
    const headerElement = target.closest('.vibegridx-header-cell');
    const viewportElement = target.closest('.vibegridx-viewport');

    // Only clear selection if the click is DIRECTLY on the viewport element (empty space)
    // Not if it bubbled up from a cell or other element
    const isDirectViewportClick = target === viewportElement ||
                                 target.classList.contains('vibegridx-viewport') ||
                                 target.classList.contains('vibegridx-body');

    // Two scenarios to clear selection:
    // 1. Click within viewport but outside cells (empty space)
    // 2. Click completely outside the VibeGrid container
    const shouldClearSelection =
      // Scenario 1: Click within viewport on empty space
      (viewportElement && !cellElement && !headerElement && isDirectViewportClick) ||
      // Scenario 2: Click outside the entire VibeGrid container
      (!viewportElement && !cellElement && !headerElement);

    if (shouldClearSelection) {
      const clickType = viewportElement ? 'empty space within viewport' : 'outside VibeGrid container';
      fileLog.info(`🖱️ Click on ${clickType} - delegating to handler`);

      // Just delegate the event, don't manage state
      if (this.onClickOutside) {
        this.onClickOutside();
      } else {
        fileLog.warn('⚠️ No outside click handler provided');
      }
    } else {
      fileLog.debug('🖱️ Outside click ignored - within interactive elements', {
        hasViewport: !!viewportElement,
        hasCell: !!cellElement,
        hasHeader: !!headerElement,
        isDirectViewport: isDirectViewportClick
      });
    }
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