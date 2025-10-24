/**
 * MouseController - Global mouse event coordinator for VibeGrid
 *
 * Single source of truth for all mouse interactions to prevent event conflicts.
 * Manages drag state and delegates click events to appropriate handlers.
 */

import { createLogger } from '@/lib/logging';
import { runInAction } from 'mobx';
import type { VisualStateStore } from '../../stores/VisualStateStore';

const fileLog = createLogger('components/custom/vibegrid/renderers/modules/MouseController.ts');

export interface MouseControllerOptions {
  container: HTMLElement;
  bodyRenderer?: any; // Will delegate cell clicks here
  scrollController?: any; // Will delegate outside clicks here
  selectionController?: any; // For row/column selection operations
  interactionStore: any; // For reactive state updates
  visualStateStore: VisualStateStore;
  tableCoreStore?: any; // For accessing processed rows and columns
  keyboardController?: any; // For ensuring focus after interactions
}

export class MouseController {
  private container: HTMLElement;
  private bodyRenderer?: any;
  private scrollController?: any;
  private selectionController?: any;
  private interactionStore: any;
  private visualStateStore: VisualStateStore;
  private tableCoreStore?: any;
  private keyboardController?: any;

  // Mouse state tracking
  private isDragging = false;
  private isTracking = false; // Flag to track if we're monitoring for drag
  private dragThreshold = 8; // pixels (increased to be less sensitive)
  private startPosition: { x: number; y: number } = { x: 0, y: 0 };
  private justEndedDrag = false; // Flag to prevent click events immediately after drag

  // Column drag state
  private isColumnDrag = false;
  private dragColumnId: string | null = null;
  private dragPreviewElement: HTMLElement | null = null;
  private dropLineElement: HTMLElement | null = null;

  // Row drag state
  private isRowDrag = false;
  private dragRowId: string | null = null;
  private dragRowGroupId: string | null = null;

  // Column resize state
  private isColumnResize = false;

  // Throttling for resize updates
  private resizeThrottleTimeout: number | null = null;
  private lastResizeUpdate: number = 0;
  private readonly RESIZE_THROTTLE_MS = 16; // ~60fps

  // Event listeners for cleanup
  private eventListeners: Array<{
    element: EventTarget;
    event: string;
    handler: EventListener;
  }> = [];

  constructor(options: MouseControllerOptions) {
    this.container = options.container;
    this.bodyRenderer = options.bodyRenderer;
    this.scrollController = options.scrollController;
    this.selectionController = options.selectionController;
    this.interactionStore = options.interactionStore;
    this.visualStateStore = options.visualStateStore;
    this.tableCoreStore = options.tableCoreStore;
    this.keyboardController = options.keyboardController;

    // Prevent text selection during drag operations
    this.container.style.userSelect = 'none';
    this.container.style.webkitUserSelect = 'none';

    this.setupGlobalMouseHandling();
    fileLog.info('🖱️ MouseController initialized with global event handling');
  }

  /**
   * Setup global mouse event listeners - ONLY these listeners should exist for mouse events
   */
  private setupGlobalMouseHandling(): void {
    fileLog.info('🖱️ Setting up global mouse event coordination');

    // Global mouse event handlers
    const mouseDownHandler = this.onMouseDown.bind(this);
    const mouseMoveHandler = this.onMouseMove.bind(this);
    const mouseUpHandler = this.onMouseUp.bind(this);
    const clickHandler = this.onClick.bind(this);

    // Add global listeners to document to catch all mouse events
    this.addEventListenerTracked(document, 'mousedown', mouseDownHandler);
    this.addEventListenerTracked(document, 'mousemove', mouseMoveHandler);
    this.addEventListenerTracked(document, 'mouseup', mouseUpHandler);
    this.addEventListenerTracked(document, 'click', clickHandler);

    // NOTE: No HTML5 drag events needed - we use pure mouse events for column drag

    fileLog.info('✅ Global mouse event coordination setup complete');
  }

  /**
   * Handle mouse down - start tracking potential drag and provide immediate feedback
   */
  private onMouseDown(e: MouseEvent): void {
    // Only handle events within our container
    if (!this.container.contains(e.target as Node)) {
      return;
    }

    this.startPosition = { x: e.clientX, y: e.clientY };
    this.isDragging = false;
    this.isTracking = true;
    this.isColumnDrag = false;
    this.dragColumnId = null;
    this.isRowDrag = false;
    this.dragRowId = null;
    this.dragRowGroupId = null;
    this.isColumnResize = false;

    // Provide immediate visual feedback on mouse down
    const target = e.target as HTMLElement;

    fileLog.info('🖱️ Mouse down on element', {
      tagName: target.tagName,
      className: target.className,
      id: target.id,
      hasDataColumnId: target.hasAttribute('data-column-id'),
      hasDataRowId: target.hasAttribute('data-row-id'),
      parentTagName: target.parentElement?.tagName,
      parentClassName: target.parentElement?.className,
      hasResizeHandle: target.classList.contains('vibegridx-resize-handle'),
      closestResizeHandle: !!target.closest('.vibegridx-resize-handle')
    });

    // Check for column resize handle first (highest priority)
    const resizeHandle = target.closest('.vibegridx-resize-handle');
    if (resizeHandle) {
      const headerElement = resizeHandle.closest('[data-column-id]');
      const columnId = headerElement?.getAttribute('data-column-id');
      if (columnId) {
        this.isColumnResize = true;
        // Get initial column width from the visual state
        const columnWidths = this.visualStateStore.columnWidths;
        const initialWidth = columnWidths[columnId] || 150; // Default width

        // Delegate to interaction state following the proper pattern
        this.interactionStore.startColumnResize(columnId, e.clientX, initialWidth);

        fileLog.info('[RESIZE] 📏 Column resize handle mouse down', {
          columnId,
          initialWidth,
          element: resizeHandle.tagName,
          mouseX: e.clientX
        });

        // Prevent default to avoid text selection during resize
        e.preventDefault();
        return;
      }
    }

    // Check for column header drag second
    const headerElement = target.closest('[data-column-id]:not([data-row-id])');
    if (headerElement) {
      const columnId = headerElement.getAttribute('data-column-id');
      fileLog.debug('🎯 Header element detected', {
        element: headerElement.tagName,
        columnId,
        hasColumnId: !!columnId,
        attributes: Array.from(headerElement.attributes).map(a => `${a.name}="${a.value}"`).join(' ')
      });
      if (columnId) {
        this.isColumnDrag = true;
        this.dragColumnId = columnId;
        fileLog.info('🎯 Column header mouse down - preparing for drag', { columnId });
        return;
      } else {
        fileLog.warn('⚠️ Header element found but no column ID', {
          element: headerElement.tagName,
          attributes: Array.from(headerElement.attributes).map(a => `${a.name}="${a.value}"`).join(' ')
        });
      }
    }

    const cellElement = target.closest('[data-row-id][data-column-id]');

    if (cellElement) {
      // Get cell info
      const rowId = cellElement.getAttribute('data-row-id');
      const columnId = cellElement.getAttribute('data-column-id');
      const cellId = `${rowId}:${columnId}`;

      // Check if this is a drag handle cell - if so, prepare for row drag
      if (columnId === '__drag_handle') {
        // Get row element to extract group information
        const rowElement = cellElement.closest('[data-row-id]');
        const groupElement = rowElement?.closest('[data-group-id]');
        const groupId = groupElement?.getAttribute('data-group-id');

        this.isRowDrag = true;
        this.dragRowId = rowId;
        this.dragRowGroupId = groupId || null;

        fileLog.info('🖱️ Row drag handle mouse down - preparing for row drag', {
          cellId,
          rowId,
          groupId,
          targetElement: target.tagName
        });
        return;
      }

      // Detect if click is on an editable element
      // IMPORTANT: Content elements with -editable classes have their own click handlers
      // that call stopPropagation(). We should NOT pass isEditableElement=true for them
      // because they handle their own editing. Only native input elements should be
      // marked as editable here.
      const isEditableElement = target.matches('input, textarea, select') ||
                                target.contentEditable === 'true';

      fileLog.info('🖱️ Cell mouse down - pure event coordination', {
        cellId,
        tagName: target.tagName,
        className: target.className,
        isEditableElement
      });

      // PURE: Update mouse coordinates
      this.interactionStore.setMousePosition(e.clientX, e.clientY);
      this.interactionStore.setMouseDown(true);

      // PURE: ALWAYS select the cell when clicked - this is the universal interaction pattern
      // Pass isEditableElement=false for content elements since they handle their own editing
      this.interactionStore.handleCellClick(cellId, isEditableElement, e.ctrlKey, e.shiftKey);

      // Ensure container gets focus for keyboard navigation after cell selection
      if (this.keyboardController && !isEditableElement) {
        this.keyboardController.ensureContainerFocus();
      }

      // Only prevent tracking for actual input elements that need native behavior
      if (target.matches('input, textarea, select') || target.contentEditable === 'true') {
        // Don't track mouse for native input elements - allow normal editing behavior
        this.isDragging = false;
        this.isTracking = false;
        this.startPosition = { x: 0, y: 0 };
        return;
      } else {
        // For all other elements (including badges), track for drag selection
        e.preventDefault();
      }
    }

    fileLog.info('🖱️ Mouse down tracked', {
      position: this.startPosition,
      target: target.tagName
    });
  }

  /**
   * Handle mouse move - detect drag threshold and update drag selection
   */
  private onMouseMove(e: MouseEvent): void {
    // Debug all mouse moves to see if they're being detected
    if (this.isTracking) {
      const distance = Math.hypot(
        e.clientX - this.startPosition.x,
        e.clientY - this.startPosition.y
      );

      fileLog.info('🖱️ Mouse move while tracking', {
        distance,
        threshold: this.dragThreshold,
        startPos: this.startPosition,
        currentPos: { x: e.clientX, y: e.clientY },
        isTracking: this.isTracking,
        isDragging: this.isDragging
      });
    }

    // Only track if we started within our container
    if (!this.isTracking) {
      return;
    }

    // Handle column resize immediately (no threshold needed)
    if (this.isColumnResize) {
      this.handleColumnResize(e);
      return;
    }

    // Calculate distance from start position
    const distance = Math.hypot(
      e.clientX - this.startPosition.x,
      e.clientY - this.startPosition.y
    );

    // Update drag state if threshold exceeded
    if (!this.isDragging && distance > this.dragThreshold) {
      this.isDragging = true;
      fileLog.info('🖱️ Drag threshold exceeded - now dragging', {
        distance,
        threshold: this.dragThreshold,
        isColumnDrag: this.isColumnDrag,
        dragColumnId: this.dragColumnId,
        isRowDrag: this.isRowDrag,
        dragRowId: this.dragRowId
      });

      if (this.isColumnResize) {
        // Handle column resize (no drag threshold needed - start immediately)
        this.handleColumnResize(e);
      } else if (this.isColumnDrag && this.dragColumnId) {
        // Start column drag
        fileLog.info('🎯 Column drag started', { columnId: this.dragColumnId });
        this.interactionStore.isDragging.set(true);
        this.interactionStore.dragSource.set(this.dragColumnId);
        this.createDragPreview(this.dragColumnId);
      } else if (this.isRowDrag && this.dragRowId) {
        // Start row drag
        fileLog.info('🚀 Row drag started', {
          rowId: this.dragRowId,
          groupId: this.dragRowGroupId
        });
        this.interactionStore.isDragging.set(true);
        this.interactionStore.dragSource.set(this.dragRowId);
        this.createRowDragPreview(this.dragRowId);
      } else if (this.isColumnDrag) {
        // Column drag was attempted but failed - don't fall back to cell selection
        fileLog.warn('⚠️ Column drag detected but dragColumnId is missing');
      } else if (this.isRowDrag) {
        // Row drag was attempted but failed - don't fall back to cell selection
        fileLog.warn('⚠️ Row drag detected but dragRowId is missing');
      } else {
        // PURE: Start drag selection with focused cell as anchor (only for cell drags)
        const startCell = this.interactionStore.focusedCell.get();
        if (startCell) {
          this.interactionStore.startDragSelect(startCell);
          fileLog.info('🖱️ Started drag selection reactively', { startCell });
        } else {
          fileLog.warn('⚠️ No focused cell for drag start');
        }
      }
    }

    // Handle column drag target detection
    if (this.isDragging && this.isColumnDrag && this.dragColumnId) {
      const target = e.target as HTMLElement;
      const targetHeaderElement = target.closest('[data-column-id]:not([data-row-id])');
      if (targetHeaderElement) {
        const targetColumnId = targetHeaderElement.getAttribute('data-column-id');
        if (targetColumnId && targetColumnId !== this.dragColumnId) {
          this.interactionStore.dragTarget.set(targetColumnId);
          this.showDropLine(targetHeaderElement, e.clientX);
          fileLog.info('🎯 Column drag over target', {
            sourceColumnId: this.dragColumnId,
            targetColumnId
          });
        }
      } else {
        // Clear drop line when not over a valid target
        this.hideDropLine();
      }
    }

    // Handle row drag target detection
    if (this.isDragging && this.isRowDrag && this.dragRowId) {
      const target = e.target as HTMLElement;
      const targetRowElement = target.closest('[data-row-id]');
      if (targetRowElement) {
        const targetRowId = targetRowElement.getAttribute('data-row-id');
        // Skip drag handle cells and group headers for drop targets
        const targetCellElement = target.closest('[data-column-id]');
        const targetColumnId = targetCellElement?.getAttribute('data-column-id');

        if (targetRowId && targetRowId !== this.dragRowId) {
          this.interactionStore.dragTarget.set(targetRowId);
          this.showRowDropIndicator(targetRowElement, e.clientY);
          fileLog.info('🎯 Row drag over target', {
            sourceRowId: this.dragRowId,
            targetRowId
          });
        }
      } else {
        // Clear drop indicator when not over a valid target
        this.hideRowDropIndicator();
      }
    }

    // Handle cell drag selection updates
    if (this.isDragging && !this.isColumnDrag && !this.isRowDrag && this.interactionStore.isDragSelecting.get()) {
      const target = e.target as HTMLElement;
      const cellElement = target.closest('[data-row-id][data-column-id]');

      if (cellElement) {
        const rowId = cellElement.getAttribute('data-row-id');
        const columnId = cellElement.getAttribute('data-column-id');
        const currentCellId = `${rowId}:${columnId}`;

        // Update drag selection if we're over a different cell
        const currentDragCell = this.interactionStore.dragSelectCurrent.get();
        if (currentCellId !== currentDragCell) {
          fileLog.info('🖱️ Drag selection updated to new cell', {
            previousCell: currentDragCell,
            currentCell: currentCellId
          });

          // Get data context from visual state for proper range selection
          try {
            // Try different data sources in order of preference
            const rows = this.visualState.virtualizedData ||
                        this.visualState.data ||
                        this.visualState.processedRows$ ||
                        [];
            const columns = this.visualStateStore.columns || [];
            const columnVisibility = this.visualStateStore.columnVisibility || {};

            const dataContext = {
              rows,
              columns,
              columnVisibility
            };

            fileLog.debug('🖱️ Drag selection data context', {
              rowsCount: dataContext.rows.length,
              columnsCount: dataContext.columns.length,
              visibilityKeys: Object.keys(dataContext.columnVisibility).length,
              firstRowId: dataContext.rows[0]?.id,
              firstColumnId: dataContext.columns[0]?.id,
              visibleColumns: dataContext.columns.filter(col => dataContext.columnVisibility[col.id] !== false).map(c => c.id).slice(0, 3)
            });

            // Only use data context if we have valid data
            if (dataContext.rows.length > 0 && dataContext.columns.length > 0) {
              this.interactionStore.updateDragSelection(currentCellId, dataContext);
            } else {
              fileLog.warn('⚠️ Empty data context for drag selection, falling back to simple update', {
                rowsCount: dataContext.rows.length,
                columnsCount: dataContext.columns.length
              });
              this.interactionStore.updateDragSelection(currentCellId);
            }
          } catch (error) {
            fileLog.warn('⚠️ Failed to get data context for drag selection, falling back to simple update', { error });
            this.interactionStore.updateDragSelection(currentCellId);
          }
        }
      }
    }

    // PURE: Always update mouse coordinates (computed observables react to changes)
    this.interactionStore.setMousePosition(e.clientX, e.clientY);

    // Update drag preview position for column drag
    if (this.isDragging && this.isColumnDrag && this.dragPreviewElement) {
      this.updateDragPreviewPosition(e.clientX, e.clientY);
    }

    // Update drag preview position for row drag
    if (this.isDragging && this.isRowDrag && this.dragPreviewElement) {
      this.updateDragPreviewPosition(e.clientX, e.clientY);
    }
  }


  /**
   * Handle mouse up - reset drag state
   */
  private onMouseUp(e: MouseEvent): void {
    // CRITICAL FIX: Always reset drag state on mouse up, regardless of where the mouse is released
    // The check for container was causing drag state to persist when mouse is released outside container
    fileLog.info('🖱️ Mouse up detected', {
      withinContainer: this.container.contains(e.target as Node),
      wasTracking: this.isTracking,
      wasDragging: this.isDragging,
      wasColumnDrag: this.isColumnDrag,
      wasRowDrag: this.isRowDrag,
      wasColumnResize: this.isColumnResize
    });

    if (this.isDragging || this.isColumnResize) {
      if (this.isColumnResize) {
        // Clear any pending throttled update to ensure final state is applied
        if (this.resizeThrottleTimeout) {
          window.clearTimeout(this.resizeThrottleTimeout);
          this.resizeThrottleTimeout = null;
        }

        // Handle column resize completion
        const resizeResult = this.interactionStore.endColumnResize();

        fileLog.info('[RESIZE] 📏 Column resize ended via MouseController', {
          columnId: resizeResult?.columnId,
          newWidth: resizeResult?.newWidth,
          finalMouseX: e.clientX
        });

        // Apply the final width to visual state
        fileLog.info('[RESIZE] 📏 Attempting to persist column width', {
          hasResizeResult: !!resizeResult,
          columnId: resizeResult?.columnId,
          newWidth: resizeResult?.newWidth,
          hasVisualOperations: !!this.visualState?.visualOperations,
          hasSetColumnWidth: !!this.visualState?.visualOperations?.setColumnWidth
        });

        if (resizeResult?.columnId && resizeResult?.newWidth) {
          fileLog.info('[RESIZE] 📏 Calling setColumnWidth to persist', {
            columnId: resizeResult.columnId,
            newWidth: resizeResult.newWidth
          });
          this.visualState.visualOperations.setColumnWidth(resizeResult.columnId, resizeResult.newWidth);
        } else {
          fileLog.warn('[RESIZE] ⚠️ Cannot persist column width - missing data', {
            resizeResult
          });
        }

        // CRITICAL FIX: Prevent click event after resize operation (same as drag)
        e.preventDefault();
        e.stopPropagation();
        this.justEndedDrag = true; // Reuse the same flag to prevent clicks after resize
      } else if (this.isColumnDrag && this.dragColumnId) {
        // Handle column drag completion
        const targetColumnId = this.interactionStore.dragTarget.get();
        if (targetColumnId && targetColumnId !== this.dragColumnId) {
          // Calculate the same insertBefore logic used for drop line positioning
          const targetHeaderElement = this.container.querySelector(`[data-column-id="${targetColumnId}"]:not([data-row-id])`);
          let insertBefore = true; // default

          if (targetHeaderElement) {
            const rect = targetHeaderElement.getBoundingClientRect();
            const cellCenterX = rect.left + rect.width / 2;
            insertBefore = e.clientX < cellCenterX;
          }

          fileLog.info('🎯 Column dropped for reordering', {
            sourceColumnId: this.dragColumnId,
            targetColumnId,
            insertBefore,
            mouseX: e.clientX
          });
          this.visualState.visualOperations.reorderColumns(this.dragColumnId, targetColumnId, insertBefore);
        }

        // Reset column drag state
        fileLog.info('🎯 Column drag ended', { columnId: this.dragColumnId });
        this.interactionStore.isDragging.set(false);
        this.interactionStore.dragSource.set(null);
        this.interactionStore.dragTarget.set(null);
        this.removeDragPreview();
        this.hideDropLine();
        fileLog.info('🎯 Column drag state reset, continuing to general reset');
      } else if (this.isRowDrag && this.dragRowId) {
        // Handle row drag completion
        const targetRowId = this.interactionStore.dragTarget.get();
        if (targetRowId && targetRowId !== this.dragRowId) {
          this.handleRowDrop(targetRowId, e.clientY);
        }

        // Reset row drag state
        fileLog.info('🏁 Row drag ended', { rowId: this.dragRowId });
        this.interactionStore.isDragging.set(false);
        this.interactionStore.dragSource.set(null);
        this.interactionStore.dragTarget.set(null);
        this.removeRowDragPreview();
        this.hideRowDropIndicator();
        fileLog.info('🎯 Row drag state reset, continuing to general reset');
      } else {
        // PURE: End drag selection reactively
        const dragResult = this.interactionStore.endDragSelect();
        fileLog.info('🖱️ Ended drag selection reactively', dragResult);
      }

      fileLog.info('🖱️ Mouse up after drag - preventing synthetic click');
      fileLog.info('🖱️ About to reset all drag state');
      // Prevent the browser from generating a click event after drag
      e.preventDefault();
      e.stopPropagation();

      // Set flag to prevent click events immediately after drag
      this.justEndedDrag = true;

      // Reset drag state immediately - no delay needed
      this.isDragging = false;
      this.isTracking = false;
      this.isColumnDrag = false;
      this.dragColumnId = null;
      this.isRowDrag = false;
      this.dragRowId = null;
      this.dragRowGroupId = null;
      this.isColumnResize = false;
      this.startPosition = { x: 0, y: 0 };
      fileLog.info('🖱️ Drag state reset immediately', {
        isDragging: this.isDragging,
        isTracking: this.isTracking,
        isColumnDrag: this.isColumnDrag,
        isRowDrag: this.isRowDrag
      });

      // Clear the flag after a brief delay to allow normal clicks again
      setTimeout(() => {
        this.justEndedDrag = false;
        fileLog.debug('🖱️ Post-drag click blocking cleared');
      }, 100);
    } else {
      // No drag was happening, reset immediately
      this.isDragging = false;
      this.isTracking = false;
      this.isColumnDrag = false;
      this.dragColumnId = null;
      this.isRowDrag = false;
      this.dragRowId = null;
      this.dragRowGroupId = null;
      this.isColumnResize = false;
      this.startPosition = { x: 0, y: 0 };
      fileLog.info('🖱️ Non-drag mouse up - state reset', {
        isDragging: this.isDragging,
        isTracking: this.isTracking,
        isColumnDrag: this.isColumnDrag,
        isRowDrag: this.isRowDrag
      });
    }
  }

  /**
   * Handle click events - route to appropriate handlers
   * This is the ONLY click handler in the entire VibeGrid system
   */
  private onClick(e: MouseEvent): void {
    // Ignore clicks that resulted from drag or resize operations
    if (this.isDragging || this.justEndedDrag) {
      fileLog.info('🖱️ Click blocked - was result of drag or resize operation', {
        isDragging: this.isDragging,
        justEndedDrag: this.justEndedDrag
      });
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    const target = e.target as HTMLElement;
    const isWithinContainer = this.container.contains(e.target as Node);

    fileLog.info('🔍 onClick entry', {
      targetTag: target.tagName,
      targetClass: target.className,
      targetId: target.id,
      isWithinContainer,
      targetHasDataColumnId: target.hasAttribute('data-column-id'),
      targetHasDataInteractionType: target.hasAttribute('data-interaction-type'),
      targetDataInteractionType: target.getAttribute('data-interaction-type')
    });

    if (isWithinContainer) {
      // Handle clicks within the container
      const cellElement = target.closest('[data-row-id][data-column-id]');
      const rowHeaderElement = target.closest('[data-interaction-type="row-header"]');

      if (cellElement && this.selectionController) {
        // Handle cell clicks
        const rowId = cellElement.getAttribute('data-row-id');
        const columnId = cellElement.getAttribute('data-column-id');
        const cellId = `${rowId}:${columnId}`;

        fileLog.info('🖱️ Cell click detected', {
          cellId,
          rowId,
          columnId,
          isShiftKey: e.shiftKey,
          isCtrlKey: e.ctrlKey || e.metaKey
        });

        // Handle different click types:
        // Regular click -> single cell selection
        // Shift+click -> range selection
        // Ctrl/Cmd+click -> disabled (treated as regular click)
        if (e.shiftKey) {
          // Shift+click: Range selection from last selected cell
          const selectedCells = this.interactionStore.selectedCells.get();
          const lastSelectedCell = selectedCells.size > 0 ? Array.from(selectedCells).pop() : null;

          if (lastSelectedCell) {
            fileLog.info('🖱️ Shift+click range selection', {
              from: lastSelectedCell,
              to: cellId
            });

            // Get data context for range selection
            const rows = this.tableCore$?.processedRows?.get() || [];
            const columns = this.tableCore$?.columns?.get() || [];
            const columnVisibility = this.visualStateStore.columnVisibility;

            this.interactionStore.selectRange(lastSelectedCell, cellId, { rows, columns, columnVisibility });
          } else {
            // No previous selection, just select this cell
            runInAction(() => {
              this.interactionStore.selectedCells = new Set([cellId]);
            });
          }
        } else {
          // Regular click or Ctrl/Cmd+click: Replace selection with this cell
          // (Ctrl/Cmd+click is disabled in this system)
          runInAction(() => {
            this.interactionStore.selectedCells = new Set([cellId]);
          });
        }

        // Prevent event propagation
        e.stopPropagation();

      } else if (rowHeaderElement && this.selectionController) {
        // Handle row header clicks
        const rowId = rowHeaderElement.getAttribute('data-row-id');
        if (rowId) {
          fileLog.info('🖱️ Row header click detected', {
            rowId,
            isShiftKey: e.shiftKey,
            isCtrlKey: e.ctrlKey
          });

          // Handle different click types properly:
          // Regular click -> toggle row selection
          // Shift+click -> range selection
          // Ctrl+click -> disabled (treated as regular click)
          if (e.shiftKey) {
            // Shift+click: Range selection
            const lastRowId = this.selectionController.getLastSelectedRowId();
            if (lastRowId) {
              this.selectionController.selectRowRange(lastRowId, rowId);
            } else {
              this.selectionController.selectRow(rowId);
            }
          } else {
            // Regular click or Ctrl+click: Toggle row selection
            // (Ctrl+click is disabled in this system, treated as regular click)
            this.selectionController.toggleRowSelection(rowId);
          }
        }
      } else {
        // Check for group expansion clicks (triangle-icon)
        const triangleElement = target.closest('.triangle-icon');
        const groupRowElement = triangleElement?.closest('[data-group-id]');

        if (triangleElement && groupRowElement) {
          const groupId = groupRowElement.getAttribute('data-group-id');

          if (groupId) {
            fileLog.info('🎯 Group expansion triangle clicked', {
              groupId,
              targetTag: target.tagName,
              targetClass: target.className
            });

            // Use visual state operations for group expansion (same pattern as sorting)
            if (this.visualState?.visualOperations?.toggleGroupExpansion) {
              this.visualState.visualOperations.toggleGroupExpansion(groupId);
              fileLog.info('🔄 toggleGroupExpansion call completed', { groupId });
            } else {
              fileLog.warn('⚠️ Visual operations not available for group expansion', {
                hasVisualState: !!this.visualState,
                hasVisualOperations: !!this.visualState?.visualOperations,
                hasToggleGroupExpansion: !!this.visualState?.visualOperations?.toggleGroupExpansion
              });
            }
            return; // Important: exit early to prevent further processing
          }
        }

        // Check for column header clicks
        const columnHeaderElement = target.closest('[data-interaction-type="column-header"]');

        fileLog.debug('🔍 Click target analysis', {
          targetTag: target.tagName,
          targetClass: target.className,
          targetId: target.id,
          hasDataInteractionType: target.hasAttribute('data-interaction-type'),
          targetDataInteractionType: target.getAttribute('data-interaction-type'),
          columnHeaderElement: !!columnHeaderElement,
          columnHeaderTag: columnHeaderElement?.tagName,
          columnHeaderClass: columnHeaderElement?.className
        });

        if (columnHeaderElement) {
          // Don't sort if clicking on resize handle
          if ((e.target as HTMLElement).classList.contains('vibegridx-resize-handle')) {
            return;
          }

          const columnId = columnHeaderElement.getAttribute('data-column-id');
          const field = columnHeaderElement.getAttribute('data-field');

          if (columnId && field) {
            const isCtrlKey = e.ctrlKey || e.metaKey;
            const isShiftKey = e.shiftKey;

            fileLog.info('🖱️ Column header click detected', {
              columnId,
              field,
              isShiftKey,
              isCtrlKey
            });

            // Ctrl+click for column selection is disabled in this system
            // Regular click or Shift+click - toggle sort
            // Shift+click enables multi-column sorting
            const isMultiSort = isShiftKey;

            fileLog.info('🔄 Column header clicked for sort', {
              columnId,
              field,
              isMultiSort,
              isShiftKey
            });

              // Use visual state operations for sorting
            fileLog.info('🔄 About to call toggleSort', {
              hasVisualState: !!this.visualState,
              hasVisualOperations: !!this.visualState?.visualOperations,
              hasToggleSort: !!this.visualState?.visualOperations?.toggleSort,
              field,
              isMultiSort
            });
            this.visualState.visualOperations.toggleSort(field, isMultiSort);
            fileLog.info('🔄 toggleSort call completed');
          }
        } else if (!cellElement) {
        // Check if this was actually a column header click that didn't get detected
        const columnHeaderElement = target.closest('[data-interaction-type="column-header"]');

        if (columnHeaderElement) {
          // This is a column header click that was missed in the earlier check
          const columnId = columnHeaderElement.getAttribute('data-column-id');
          const field = columnHeaderElement.getAttribute('data-field');

          fileLog.info('🔍 FOUND MISSED COLUMN HEADER in fallback check', {
            columnId,
            field,
            targetTag: target.tagName,
            targetClass: target.className
          });

          if (columnId && field) {
            const isShiftKey = e.shiftKey;

            // Ctrl+click for column selection is disabled in this system
            // Regular click or Shift+click - toggle sort
            const isMultiSort = isShiftKey;
            fileLog.info('🔄 Column header clicked for sort via fallback', {
              columnId,
              field,
              isMultiSort,
              isShiftKey
            });
            this.visualState.visualOperations.toggleSort(field, isMultiSort);
            return; // Important: exit early to prevent "container click" message
          }
        }

        // Click within container but not on a cell or row header - this should NOT clear selection
        // Only clicks outside the entire container should clear selection
        fileLog.info('🖱️ Container click (non-cell) detected - preserving selection', {
          targetTag: target.tagName,
          targetClass: target.className,
          targetId: target.id,
          targetHasDataColumnId: target.hasAttribute('data-column-id'),
          targetHasDataInteractionType: target.hasAttribute('data-interaction-type'),
          targetDataInteractionType: target.getAttribute('data-interaction-type'),
          closestColumnHeader: !!target.closest('[data-interaction-type="column-header"]'),
          closestWithDataColumnId: !!target.closest('[data-column-id]')
        });
        // Do nothing - preserve current selection
        }
      }
    } else {
      // Click outside the container - this is a true outside click for blur
      fileLog.info('🖱️ Outside container click detected - delegating to ScrollController for blur');

      if (this.scrollController?.handleOutsideClick) {
        this.scrollController.handleOutsideClick(e);
      } else {
        fileLog.warn('⚠️ ScrollController handleOutsideClick method not available');
      }
    }
  }

  /**
   * Robust check for VibeGrid editable elements using pattern matching
   * This approach is more maintainable than hardcoding class names
   */
  private hasEditableClass(element: HTMLElement): boolean {
    // Check if any class name matches the editable pattern
    const classList = Array.from(element.classList);
    return classList.some(className =>
      className.startsWith('vibegridx-cell-') && className.endsWith('-editable')
    );
  }

  /**
   * Get current drag state - for other components to query
   */
  get isCurrentlyDragging(): boolean {
    return this.isDragging;
  }

  /**
   * Force reset drag state - called by external components when drag ends
   */
  resetDragState(): void {
    fileLog.info('🖱️ Force resetting drag state', {
      wasTracking: this.isTracking,
      wasDragging: this.isDragging,
      wasColumnDrag: this.isColumnDrag,
      dragColumnId: this.dragColumnId,
      wasRowDrag: this.isRowDrag,
      dragRowId: this.dragRowId
    });

    this.isDragging = false;
    this.isTracking = false;
    this.isColumnDrag = false;
    this.dragColumnId = null;
    this.isRowDrag = false;
    this.dragRowId = null;
    this.dragRowGroupId = null;
    this.isColumnResize = false;
    this.startPosition = { x: 0, y: 0 };
    this.removeDragPreview();
    this.hideDropLine();
    this.removeRowDragPreview();
    this.hideRowDropIndicator();
  }

  /**
   * Update renderer references (for late initialization)
   */
  setBodyRenderer(bodyRenderer: any): void {
    this.bodyRenderer = bodyRenderer;
    fileLog.info('🖱️ BodyRenderer reference updated');
  }

  setScrollController(scrollController: any): void {
    this.scrollController = scrollController;
    fileLog.info('🖱️ ScrollController reference updated');
  }

  setSelectionController(selectionController: any): void {
    this.selectionController = selectionController;
    fileLog.info('🖱️ SelectionController reference updated');
  }

  setKeyboardController(keyboardController: any): void {
    this.keyboardController = keyboardController;
    fileLog.info('🖱️ KeyboardController reference updated');
  }

  /**
   * Add event listener with tracking for cleanup
   */
  private addEventListenerTracked(element: EventTarget, event: string, handler: EventListener): void {
    element.addEventListener(event, handler);
    this.eventListeners.push({ element, event, handler });
  }

  /**
   * Create floating drag preview for column drag
   */
  private createDragPreview(columnId: string): void {
    // Get column info for preview text
    const headerElement = this.container.querySelector(`[data-column-id="${columnId}"]:not([data-row-id])`);
    const columnText = headerElement?.textContent?.trim() || columnId;

    // Create floating preview element
    this.dragPreviewElement = document.createElement('div');
    this.dragPreviewElement.className = 'vibegridx-column-drag-preview';
    this.dragPreviewElement.textContent = columnText;

    // Style the preview (similar to interaction-handlers.ts drag image)
    Object.assign(this.dragPreviewElement.style, {
      position: 'fixed',
      background: 'hsl(var(--background))',
      color: 'hsl(var(--muted-foreground))',
      padding: '4px 8px',
      borderRadius: '4px',
      fontSize: '12px',
      fontWeight: '600',
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
      border: '1px solid hsl(var(--border))',
      whiteSpace: 'nowrap',
      zIndex: '99999',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      pointerEvents: 'none',
      opacity: '0.9',
      transform: 'translate(-50%, -100%)', // Center horizontally, above cursor
      transition: 'none' // No transitions during drag
    });

    document.body.appendChild(this.dragPreviewElement);
    fileLog.info('🎯 Column drag preview created', { columnId, text: columnText });
  }

  /**
   * Update drag preview position to follow mouse
   */
  private updateDragPreviewPosition(x: number, y: number): void {
    if (!this.dragPreviewElement) return;

    this.dragPreviewElement.style.left = `${x}px`;
    this.dragPreviewElement.style.top = `${y}px`; // Transform handles positioning above cursor
  }

  /**
   * Remove drag preview element
   */
  private removeDragPreview(): void {
    if (this.dragPreviewElement) {
      this.dragPreviewElement.remove();
      this.dragPreviewElement = null;
      fileLog.info('🎯 Column drag preview removed');
    }
  }

  /**
   * Show drop line indicator (blue line between columns)
   */
  private showDropLine(targetHeaderElement: HTMLElement, mouseX: number): void {
    // Calculate if inserting before or after based on mouse position
    const rect = targetHeaderElement.getBoundingClientRect();
    const cellCenterX = rect.left + rect.width / 2;
    const insertBefore = mouseX < cellCenterX;

    // Get the header container
    const headerContainer = targetHeaderElement.parentElement;
    if (!headerContainer) return;

    // Remove existing drop line
    this.hideDropLine();

    // Create new drop line
    this.dropLineElement = document.createElement('div');
    this.dropLineElement.className = 'vibegridx-column-drop-line';

    // Calculate position relative to the header container
    const headerRect = headerContainer.getBoundingClientRect();
    const cellRect = targetHeaderElement.getBoundingClientRect();
    const linePosition = insertBefore ?
      cellRect.left - headerRect.left :
      cellRect.right - headerRect.left;

    // Style the drop line
    Object.assign(this.dropLineElement.style, {
      position: 'absolute',
      top: '0',
      bottom: '0',
      left: `${linePosition - 1.5}px`,
      width: '3px',
      background: '#3b82f6',
      borderRadius: '1px',
      zIndex: '9999',
      boxShadow: '0 0 4px rgba(59, 130, 246, 0.5)',
      pointerEvents: 'none',
      height: `${cellRect.height}px`
    });

    // Ensure header container has relative positioning
    headerContainer.style.position = 'relative';
    headerContainer.appendChild(this.dropLineElement);

    fileLog.debug('🎯 Drop line shown', { insertBefore, linePosition });
  }

  /**
   * Hide drop line indicator
   */
  private hideDropLine(): void {
    if (this.dropLineElement) {
      this.dropLineElement.remove();
      this.dropLineElement = null;
      fileLog.debug('🎯 Drop line hidden');
    }
  }

  /**
   * Create floating drag preview for row drag
   */
  private createRowDragPreview(rowId: string): void {
    // Get row info for preview text
    const rowElement = this.container.querySelector(`[data-row-id="${rowId}"]`);
    const rowText = rowElement?.textContent?.trim().slice(0, 50) + '...' || `Row ${rowId}`;

    // Create floating preview element
    this.dragPreviewElement = document.createElement('div');
    this.dragPreviewElement.className = 'vibegridx-row-drag-preview';
    // Clone visible cells to create cell-styled preview
    const cells = rowElement.querySelectorAll('.vibegridx-cell');
    const visibleCells = Array.from(cells).slice(0, 4); // First 4 cells

    if (visibleCells.length > 0) {
      const cellTexts = visibleCells.map(cell => {
        const text = cell.textContent?.trim() || '';
        return text.length > 15 ? text.substring(0, 15) + '...' : text;
      }).filter(text => text.length > 0);

      this.dragPreviewElement.textContent = cellTexts.join(' • ');
    } else {
      this.dragPreviewElement.textContent = rowText;
    }

    // Style the preview (similar to column drag preview)
    Object.assign(this.dragPreviewElement.style, {
      position: 'fixed',
      background: 'hsl(var(--background))',
      color: 'hsl(var(--muted-foreground))',
      padding: '6px 12px',
      borderRadius: '4px',
      fontSize: '12px',
      fontWeight: '500',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
      border: '2px solid #3b82f6',
      whiteSpace: 'nowrap',
      zIndex: '99999',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      pointerEvents: 'none',
      opacity: '0.9',
      transform: 'translateY(-100%)', // Position above cursor, left-aligned
      transition: 'none' // No transitions during drag
    });

    document.body.appendChild(this.dragPreviewElement);
    fileLog.info('🚀 Row drag preview created', { rowId, text: rowText });
  }

  /**
   * Remove row drag preview element
   */
  private removeRowDragPreview(): void {
    if (this.dragPreviewElement) {
      this.dragPreviewElement.remove();
      this.dragPreviewElement = null;
      fileLog.info('🚀 Row drag preview removed');
    }
  }

  /**
   * Show row drop indicator (blue line above/below row)
   */
  private showRowDropIndicator(targetRowElement: HTMLElement, mouseY: number): void {
    // Calculate if inserting before or after based on mouse position
    const rect = targetRowElement.getBoundingClientRect();
    const rowCenterY = rect.top + rect.height / 2;
    const insertBefore = mouseY < rowCenterY;

    // Get the container
    const container = targetRowElement.closest('.vibegridx-container');
    if (!container) return;

    // Remove existing drop indicator
    this.hideRowDropIndicator();

    // Create new drop indicator
    this.dropLineElement = document.createElement('div');
    this.dropLineElement.className = 'vibegrid-row-drop-indicator';

    // Calculate position relative to the container
    const containerRect = container.getBoundingClientRect();
    const rowRect = targetRowElement.getBoundingClientRect();
    const linePosition = insertBefore ?
      rowRect.top - containerRect.top :
      rowRect.bottom - containerRect.top;

    // Style the drop indicator
    Object.assign(this.dropLineElement.style, {
      position: 'absolute',
      left: '0',
      right: '0',
      top: `${linePosition - 1.5}px`,
      height: '3px',
      background: '#3b82f6',
      borderRadius: '1.5px',
      zIndex: '1000',
      boxShadow: '0 0 6px rgba(59, 130, 246, 0.4)',
      pointerEvents: 'none'
    });

    // Ensure container has relative positioning
    (container as HTMLElement).style.position = 'relative';
    container.appendChild(this.dropLineElement);

    fileLog.debug('🎯 Row drop indicator shown', { insertBefore, linePosition });
  }

  /**
   * Hide row drop indicator
   */
  private hideRowDropIndicator(): void {
    if (this.dropLineElement) {
      this.dropLineElement.remove();
      this.dropLineElement = null;
      fileLog.debug('🎯 Row drop indicator hidden');
    }
  }

  /**
   * Handle row drop completion - call DragDropManager
   */
  private handleRowDrop(targetRowId: string, mouseY: number): void {
    if (!this.dragRowId) return;

    // Calculate drop position
    const targetRowElement = this.container.querySelector(`[data-row-id="${targetRowId}"]`);
    if (!targetRowElement) return;

    const rect = targetRowElement.getBoundingClientRect();
    const insertBefore = mouseY < rect.top + rect.height / 2;

    // Get target group for grouped mode
    const targetGroupElement = targetRowElement.closest('[data-group-id]');
    const targetGroupId = targetGroupElement?.getAttribute('data-group-id') || null;

    // Calculate target index
    const targetIndex = this.calculateRowDropIndex(targetRowElement, targetGroupId, insertBefore);

    fileLog.info('🎯 Row dropped for reordering', {
      sourceRowId: this.dragRowId,
      sourceGroupId: this.dragRowGroupId,
      targetRowId,
      targetGroupId,
      targetIndex,
      insertBefore,
      mouseY
    });

    // Call the appropriate DragDropManager method
    if (this.dragRowGroupId || targetGroupId) {
      // Grouped mode - call onRowMove
      const finalTargetGroupId = targetGroupId || this.dragRowGroupId || '';
      this.callRowMoveHandler(this.dragRowId, finalTargetGroupId, targetIndex);
    } else {
      // Flat mode - call onFlatRowMove
      const sourceIndex = this.calculateRowIndex(this.dragRowId);
      this.callFlatRowMoveHandler(sourceIndex, targetIndex);
    }
  }

  /**
   * Calculate target index for row drop
   */
  private calculateRowDropIndex(targetRowElement: HTMLElement, groupId: string | null, insertBefore: boolean): number {
    if (groupId) {
      // Grouped mode - find position within the specific group
      const groupContainer = targetRowElement.closest(`[data-group-id="${groupId}"]`)?.parentElement;
      if (!groupContainer) return 0;

      // Only get rows that belong to the specific group
      const dataRows = Array.from(groupContainer.querySelectorAll(`.vibegridx-row:not(.vibegridx-group-header)[data-group-id="${groupId}"]`));
      const targetIndex = dataRows.indexOf(targetRowElement);

      if (targetIndex === -1) {
        fileLog.error('❌ Target row not found in group data rows', {
          targetRowId: targetRowElement.dataset.rowId,
          groupId,
          dataRowsCount: dataRows.length,
          insertBefore
        });
        return 0;
      }

      const calculatedIndex = insertBefore ? targetIndex : targetIndex + 1;
      fileLog.debug('🎯 calculateRowDropIndex for grouped mode', {
        targetRowId: targetRowElement.dataset.rowId,
        groupId,
        targetIndex,
        insertBefore,
        calculatedIndex,
        dataRowsInGroup: dataRows.length
      });

      return calculatedIndex;
    } else {
      // Flat mode - find position in all rows
      const container = targetRowElement.closest('.vibegridx-container');
      if (!container) return 0;

      const dataRows = Array.from(container.querySelectorAll('.vibegridx-row:not(.vibegridx-group-header)'));
      const targetIndex = dataRows.indexOf(targetRowElement);
      return insertBefore ? targetIndex : targetIndex + 1;
    }
  }

  /**
   * Calculate current index of a row
   */
  private calculateRowIndex(rowId: string): number {
    const rowElement = this.container.querySelector(`[data-row-id="${rowId}"]`);
    if (!rowElement) return 0;

    const container = rowElement.closest('.vibegridx-container');
    if (!container) return 0;

    const dataRows = Array.from(container.querySelectorAll('.vibegridx-row:not(.vibegridx-group-header)'));
    return dataRows.indexOf(rowElement);
  }

  /**
   * Call DragDropManager onRowMove handler
   */
  private callRowMoveHandler(draggedRowId: string, targetGroupId: string, newIndex: number): void {
    // Access DragDropManager through BodyRenderer
    if (this.bodyRenderer?.dragDropManager?.callbacks?.onRowMove) {
      const success = this.bodyRenderer.dragDropManager.callbacks.onRowMove(draggedRowId, targetGroupId, newIndex);
      fileLog.info(success ? '🎯 Same-group row move' : '❌ Row move failed', {
        draggedRowId,
        targetGroupId,
        newIndex,
        success
      });
    } else {
      fileLog.error('❌ DragDropManager onRowMove not available', {
        hasBodyRenderer: !!this.bodyRenderer,
        hasDragDropManager: !!this.bodyRenderer?.dragDropManager,
        hasCallbacks: !!this.bodyRenderer?.dragDropManager?.callbacks,
        hasOnRowMove: !!this.bodyRenderer?.dragDropManager?.callbacks?.onRowMove
      });
    }
  }

  /**
   * Call DragDropManager onFlatRowMove handler
   */
  private callFlatRowMoveHandler(fromIndex: number, toIndex: number): void {
    // Access DragDropManager through BodyRenderer
    if (this.bodyRenderer?.dragDropManager?.callbacks?.onFlatRowMove) {
      const success = this.bodyRenderer.dragDropManager.callbacks.onFlatRowMove(fromIndex, toIndex);
      fileLog.info(success ? '🎯 Flat row move' : '❌ Flat row move failed', {
        fromIndex,
        toIndex,
        success
      });
    } else {
      fileLog.error('❌ DragDropManager onFlatRowMove not available', {
        hasBodyRenderer: !!this.bodyRenderer,
        hasDragDropManager: !!this.bodyRenderer?.dragDropManager,
        hasCallbacks: !!this.bodyRenderer?.dragDropManager?.callbacks,
        hasOnFlatRowMove: !!this.bodyRenderer?.dragDropManager?.callbacks?.onFlatRowMove
      });
    }
  }

  /**
   * Handle column resize during mouse move - delegates to interaction state
   */
  private handleColumnResize(e: MouseEvent): void {
    // Delegate to interaction state following the proper pattern
    const result = this.interactionStore.updateColumnResize(e.clientX);

    if (result) {
      fileLog.info('[RESIZE] 📏 Column resize move - interaction state updated', {
        columnId: result.columnId,
        newWidth: result.newWidth,
        mouseX: e.clientX,
        deltaFromStart: e.clientX - this.startPosition.x
      });

      // CRITICAL: Update visual state LIVE during resize for immediate header updates
      // This allows the header cells to update their width as the user drags
      // THROTTLED to avoid excessive re-renders (~60fps)
      if (result.columnId && result.newWidth && this.visualState?.visualOperations?.setColumnWidth) {
        const now = Date.now();
        const timeSinceLastUpdate = now - this.lastResizeUpdate;

        // Clear any pending throttled update
        if (this.resizeThrottleTimeout) {
          window.clearTimeout(this.resizeThrottleTimeout);
          this.resizeThrottleTimeout = null;
        }

        if (timeSinceLastUpdate >= this.RESIZE_THROTTLE_MS) {
          // Enough time has passed, update immediately
          fileLog.info('[RESIZE] 🎨 Updating visual state LIVE (immediate)', {
            columnId: result.columnId,
            newWidth: result.newWidth,
            timeSinceLastUpdate
          });
          this.visualState.visualOperations.setColumnWidth(result.columnId, result.newWidth);
          this.lastResizeUpdate = now;
        } else {
          // Too soon, schedule an update
          const delay = this.RESIZE_THROTTLE_MS - timeSinceLastUpdate;
          this.resizeThrottleTimeout = window.setTimeout(() => {
            fileLog.info('[RESIZE] 🎨 Updating visual state LIVE (throttled)', {
              columnId: result.columnId,
              newWidth: result.newWidth,
              delay
            });
            this.visualState.visualOperations.setColumnWidth(result.columnId, result.newWidth);
            this.lastResizeUpdate = Date.now();
            this.resizeThrottleTimeout = null;
          }, delay);
        }
      }
    }

    // Prevent text selection during resize
    e.preventDefault();
  }

  /**
   * Clean up all mouse event handling
   */
  destroy(): void {
    // Clean up all tracked event listeners
    this.eventListeners.forEach(({ element, event, handler }) => {
      try {
        element.removeEventListener(event, handler);
      } catch (error) {
        fileLog.error('❌ Error removing mouse event listener', { event, error });
      }
    });
    this.eventListeners = [];

    // Clean up drag preview and drop line
    this.removeDragPreview();
    this.hideDropLine();

    // Clean up any pending resize throttle timeout
    if (this.resizeThrottleTimeout) {
      window.clearTimeout(this.resizeThrottleTimeout);
      this.resizeThrottleTimeout = null;
    }

    // Restore text selection
    this.container.style.userSelect = '';
    this.container.style.webkitUserSelect = '';

    fileLog.info('🧹 MouseController destroyed');
  }
}