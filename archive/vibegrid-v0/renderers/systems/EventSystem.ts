// ====================================
// EVENT DELEGATION SYSTEM
// ====================================

import { ViewportInfo } from '../../types';

// ====================================
// TYPES
// ====================================

export interface EventCallbacks {
  onCellClick?: (rowId: string, columnId: string, event: MouseEvent) => void;
  onCellDoubleClick?: (rowId: string, columnId: string, event: MouseEvent) => void;
  onHeaderClick?: (columnId: string, event: MouseEvent) => void;
  onColumnResizeStart?: (columnId: string, x: number, width: number) => void;
  onColumnResizeMove?: (x: number) => void;
  onColumnResizeEnd?: () => void;
  onColumnDragStart?: (columnId: string, x: number, y: number) => void;
  onColumnDragMove?: (x: number, y: number) => void;
  onColumnDragEnd?: (clientX: number) => void;
  onScroll?: (viewport: ViewportInfo) => void;
}

export interface EventSystemConfig {
  domManager: any; // DOMSystem
  virtualGrid: any; // VirtualScrollManager
  callbacks: EventCallbacks;
}

// ====================================
// CSS CLASSES
// ====================================

const CSS_CLASSES = {
  CELL: 'vibegridx-cell',
  ROW: 'vibegridx-row',
  HEADER_CELL: 'vibegridx-header-cell',
  SORT_ICON: 'vibegridx-sort-icon',
  RESIZE_HANDLE: 'vibegridx-resize-handle',
  DROP_INDICATOR: 'vibegridx-column-drop-indicator'
} as const;

// ====================================
// EVENT DELEGATION SYSTEM
// ====================================

export class EventSystem {
  private config: EventSystemConfig;
  private isScrolling = false;
  private isResizing = false;
  
  // Drag state
  private dragState = {
    isDragging: false,
    draggedColumnId: null as string | null,
    startX: 0,
    startY: 0,
    offsetX: 0,
    offsetY: 0,
    dragPreview: null as HTMLElement | null,
    dropIndicator: null as HTMLElement | null
  };

  // Bound handlers for cleanup
  private boundHandleResizeMove: (event: MouseEvent) => void;
  private boundHandleResizeEnd: (event: MouseEvent) => void;
  private boundHandleDragMove: (event: MouseEvent) => void;
  private boundHandleDragEnd: (event: MouseEvent) => void;

  constructor(config: EventSystemConfig) {
    this.config = config;
    
    // Bind handlers for cleanup
    this.boundHandleResizeMove = this.handleResizeMove.bind(this);
    this.boundHandleResizeEnd = this.handleResizeEnd.bind(this);
    this.boundHandleDragMove = this.handleDragMove.bind(this);
    this.boundHandleDragEnd = this.handleDragEnd.bind(this);
  }

  // ====================================
  // SETUP AND CLEANUP
  // ====================================

  setupEventListeners(): void {
    const { domManager } = this.config;
    const header = domManager.getElement('header');
    const body = domManager.getElement('body');
    const viewport = domManager.getElement('viewport');

    // Scroll handling
    viewport.addEventListener('scroll', () => {
      const viewportInfo = this.config.virtualGrid.calculateViewportFromScroll(
        viewport.scrollTop,
        viewport.clientHeight,
        viewport.clientWidth,
        viewport.scrollLeft
      );
      
      // Sync header horizontal scroll position
      if (header) {
        header.style.transform = `translateX(-${viewport.scrollLeft}px)`;
      }
      
      this.config.callbacks.onScroll?.(viewportInfo);
    });

    // Cell interaction handlers
    body.addEventListener('click', this.handleCellClick.bind(this));
    body.addEventListener('dblclick', this.handleCellDoubleClick.bind(this));

    // Header interaction handlers - DISABLED: EventDelegationManager handles all events
    // header.addEventListener('click', this.handleHeaderClick.bind(this));
    // header.addEventListener('mousedown', this.handleHeaderMouseDown.bind(this));

    // Focus is now managed by EventDelegationManager on the container
    // viewport.setAttribute('tabindex', '0');
  }

  cleanup(): void {
    const { domManager } = this.config;
    const header = domManager.getElement('header');
    const body = domManager.getElement('body');
    const viewport = domManager.getElement('viewport');

    // Remove scroll listener - DISABLED: Now handled by EventDelegationManager
    // viewport.removeEventListener('scroll', this.boundHandleScroll);

    // Remove cell listeners
    body.removeEventListener('click', this.handleCellClick.bind(this));
    body.removeEventListener('dblclick', this.handleCellDoubleClick.bind(this));

    // Remove header listeners - DISABLED: EventDelegationManager handles all events
    // header.removeEventListener('click', this.handleHeaderClick.bind(this));
    // header.removeEventListener('mousedown', this.handleHeaderMouseDown.bind(this));

    // Remove global listeners if active
    this.removeGlobalDragListeners();
    this.removeGlobalResizeListeners();
  }



  // ====================================
  // CELL EVENT HANDLERS
  // ====================================

  private handleCellClick(event: MouseEvent): void {
    const cellElement = (event.target as Element).closest(`.${CSS_CLASSES.CELL}`) as HTMLElement;
    if (!cellElement) return;

    const rowId = cellElement.dataset.rowId!;
    const columnId = cellElement.dataset.columnId!;

    // Only focus viewport if we're not currently editing
    // This prevents focus bouncing when clicking inside text editors
    const editingPortal = document.querySelector('.vibegridx-editing-portal');
    const isCurrentlyEditing = editingPortal && editingPortal.style.display !== 'none';
    
    if (!isCurrentlyEditing) {
      // Ensure viewport has focus for keyboard events, but prevent scrolling
      this.config.domManager.getElement('viewport').focus({ preventScroll: true });
    }

    this.config.callbacks.onCellClick?.(rowId, columnId, event);
  }

  private handleCellDoubleClick(event: MouseEvent): void {
    const cellElement = (event.target as Element).closest(`.${CSS_CLASSES.CELL}`) as HTMLElement;
    if (!cellElement) return;

    const rowId = cellElement.dataset.rowId!;
    const columnId = cellElement.dataset.columnId!;

    this.config.callbacks.onCellDoubleClick?.(rowId, columnId, event);
  }

  // ====================================
  // HEADER EVENT HANDLERS
  // ====================================

  private handleHeaderClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    const headerCell = target.closest(`.${CSS_CLASSES.HEADER_CELL}`) as HTMLElement;
    const resizeHandle = target.closest(`.${CSS_CLASSES.RESIZE_HANDLE}`);

    // Don't handle click if it's on a resize handle (handled in mousedown)
    if (resizeHandle) return;

    if (headerCell) {
      const columnId = headerCell.dataset.columnId!;
      this.config.callbacks.onHeaderClick?.(columnId, event);
    }
  }

  private handleHeaderMouseDown(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    const headerCell = target.closest(`.${CSS_CLASSES.HEADER_CELL}`) as HTMLElement;
    const sortIcon = target.closest(`.${CSS_CLASSES.SORT_ICON}`);
    const resizeHandle = target.closest(`.${CSS_CLASSES.RESIZE_HANDLE}`);

    // Handle resize
    if (resizeHandle) {
      this.startResize(event, resizeHandle as HTMLElement);
      return;
    }

    // Handle column drag (but not on sort icon)
    if (headerCell && !sortIcon && !resizeHandle) {
      this.startColumnDrag(event, headerCell);
      return;
    }
  }

  // ====================================
  // COLUMN RESIZE HANDLING
  // ====================================

  private startResize(event: MouseEvent, resizeHandle: HTMLElement): void {
    event.preventDefault();
    // Get columnId from the parent header cell
    const headerCell = resizeHandle.closest(`.${CSS_CLASSES.HEADER_CELL}`) as HTMLElement;
    const columnId = headerCell?.dataset.columnId;

    if (columnId) {
      // Just forward the raw event to the state machine 
      // The state machine will get the current width from coordinate mapping
      this.config.callbacks.onColumnResizeStart?.(columnId, event.clientX, 0);

      // Set resizing state
      this.isResizing = true;

      // Add global mouse event listeners
      document.addEventListener('mousemove', this.boundHandleResizeMove);
      document.addEventListener('mouseup', this.boundHandleResizeEnd);
    }
  }

  private handleResizeMove(event: MouseEvent): void {
    if (!this.isResizing) return;
    this.config.callbacks.onColumnResizeMove?.(event.clientX);
  }

  private handleResizeEnd(event: MouseEvent): void {
    if (!this.isResizing) return;

    // Clear resizing state
    this.isResizing = false;

    // Send resize end event
    this.config.callbacks.onColumnResizeEnd?.();

    // Remove global listeners
    this.removeGlobalResizeListeners();
  }

  private removeGlobalResizeListeners(): void {
    document.removeEventListener('mousemove', this.boundHandleResizeMove);
    document.removeEventListener('mouseup', this.boundHandleResizeEnd);
  }

  // ====================================
  // COLUMN DRAG HANDLING
  // ====================================

  private startColumnDrag(event: MouseEvent, headerCell: HTMLElement): void {
    event.preventDefault();
    const columnId = headerCell.dataset.column!;
    
    // Don't allow dragging the selection column
    if (columnId === '__selection') {
      return;
    }

    // Calculate offset from click position to header cell position
    const headerRect = headerCell.getBoundingClientRect();
    const offsetX = event.clientX - headerRect.left;
    const offsetY = event.clientY - headerRect.top;
    
    // Create drag preview
    const columnText = headerCell.querySelector('.vibegridx-header-text')?.textContent || columnId;
    const dragPreview = document.createElement('div');
    dragPreview.className = 'vibegridx-drag-preview';
    dragPreview.textContent = columnText;
    // Position preview so text stays under cursor
    dragPreview.style.left = `${event.clientX - offsetX}px`;
    dragPreview.style.top = `${event.clientY - offsetY}px`;
    document.body.appendChild(dragPreview);
    
    // Create drop indicator
    const dropIndicator = document.createElement('div');
    dropIndicator.className = 'vibegridx-column-drop-indicator';
    // Append to header so it scrolls with columns
    this.config.domManager.getElement('header').appendChild(dropIndicator);

    // Initialize drag state
    this.dragState = {
      isDragging: true,
      draggedColumnId: columnId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: offsetX,
      offsetY: offsetY,
      dragPreview: dragPreview,
      dropIndicator: dropIndicator
    };
    
    // Add dragging class to header cell
    headerCell.classList.add('vibegridx-dragging');

    // Send drag start event
    this.config.callbacks.onColumnDragStart?.(columnId, event.clientX, event.clientY);

    // Add global mouse event listeners
    document.addEventListener('mousemove', this.boundHandleDragMove);
    document.addEventListener('mouseup', this.boundHandleDragEnd);
  }

  private handleDragMove(event: MouseEvent): void {
    // Skip if we're resizing
    if (this.isResizing) return;

    if (!this.dragState.isDragging || !this.dragState.dragPreview) return;
    
    event.preventDefault();
    
    // Update drag preview position maintaining the offset
    this.dragState.dragPreview.style.left = `${event.clientX - this.dragState.offsetX}px`;
    this.dragState.dragPreview.style.top = `${event.clientY - this.dragState.offsetY}px`;
    
    // Just forward the raw event to the state machine
    // The state machine will calculate preview positions and handle all animations
    this.config.callbacks.onColumnDragMove?.(event.clientX, event.clientY);
  }

  private handleDragEnd(event: MouseEvent): void {
    // Skip if we're resizing
    if (this.isResizing) return;

    if (!this.dragState.isDragging) return;
    
    event.preventDefault();
    
    // Remove drag preview
    if (this.dragState.dragPreview) {
      this.dragState.dragPreview.remove();
    }
    
    // Remove drop indicator
    if (this.dragState.dropIndicator) {
      this.dragState.dropIndicator.remove();
    }
    
    // Remove dragging class only - preview animations are handled by state machine
    const draggedCell = this.config.domManager.getElement('header').querySelector('.vibegridx-dragging');
    if (draggedCell) {
      draggedCell.classList.remove('vibegridx-dragging');
    }

    // Just forward the raw event to the state machine with the dragged column
    // The state machine will calculate the target position based on current coordinate mapping
    this.config.callbacks.onColumnDragEnd?.(event.clientX);

    // Reset drag state
    this.dragState = {
      isDragging: false,
      draggedColumnId: null,
      startX: 0,
      startY: 0,
      offsetX: 0,
      offsetY: 0,
      dragPreview: null,
      dropIndicator: null
    };

    // Remove global listeners
    this.removeGlobalDragListeners();
  }

  private removeGlobalDragListeners(): void {
    document.removeEventListener('mousemove', this.boundHandleDragMove);
    document.removeEventListener('mouseup', this.boundHandleDragEnd);
  }


  // ====================================
  // PUBLIC METHODS
  // ====================================

  getDragState() {
    return { ...this.dragState };
  }

  getResizeState() {
    return { isResizing: this.isResizing };
  }
}