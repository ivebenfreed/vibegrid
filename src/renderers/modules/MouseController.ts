/**
 * MouseController - Global mouse event coordinator for VibeGrid
 *
 * Single source of truth for all mouse interactions to prevent event conflicts.
 * Routes events to focused sub-controllers:
 * - ClickRouter: click interpretation and dispatch
 * - DragSelectionController: drag-to-select rectangle
 * - FillDragController: fill handle drag
 * - HoverTracker: mouse position and hover state
 *
 * Retains column drag, column resize, and row drag (tightly coupled to header).
 */

import { runInAction } from 'mobx'
import { getLogger } from '@/shared/lib/logging'
import type { InteractionCoordinator } from '../../coordination/InteractionCoordinator'
import type { VisualStateStore } from '../../stores/VisualStateStore'
import { ClickRouter } from './ClickRouter'
import { DragSelectionController } from './DragSelectionController'
import { FillDragController } from './FillDragController'
import { HoverTracker } from './HoverTracker'

const fileLog = getLogger(['custom', 'vibegrid', 'renderers', 'modules', 'MouseController.ts'])

export interface MouseControllerOptions {
  container: HTMLElement
  bodyRenderer?: any // Will delegate cell clicks here
  scrollController?: any // Will delegate outside clicks here
  selectionController?: any // For row/column selection operations
  interactionStore: any // For reactive state updates
  visualStateStore: VisualStateStore
  tableCoreStore?: any // For accessing processed rows and columns
  keyboardController?: any // For ensuring focus after interactions
  coordinator?: InteractionCoordinator // InteractionCoordinator for clean event delegation
  enableSelectionColumn?: boolean // Control whether row header clicks select rows
}

export class MouseController {
  private container: HTMLElement
  private bodyRenderer?: any
  private selectionController?: any
  private interactionStore: any
  private visualStateStore: VisualStateStore
  private visualState?: any // Legacy visual state reference
  private tableCoreStore?: any
  private keyboardController?: any
  private coordinator?: InteractionCoordinator
  private enableSelectionColumn: boolean

  // Sub-controllers
  private clickRouter: ClickRouter
  private dragSelectionController: DragSelectionController
  private fillDragController: FillDragController
  private hoverTracker: HoverTracker

  // Mouse state tracking (shared coordinator state)
  private isDragging = false
  private isTracking = false
  private dragThreshold = 8 // pixels (increased to be less sensitive)
  private startPosition: { x: number; y: number } = { x: 0, y: 0 }
  private justEndedDrag = false

  // Column drag state (retained - tightly coupled to header)
  private isColumnDrag = false
  private dragColumnId: string | null = null
  private dragPreviewElement: HTMLElement | null = null
  private dropLineElement: HTMLElement | null = null

  // Row drag state (retained - tightly coupled to header)
  private isRowDrag = false
  private dragRowId: string | null = null
  private dragRowGroupId: string | null = null

  // Column resize state (retained - tightly coupled to header)
  private isColumnResize = false

  // Fill handle drag state
  private isFillDrag = false

  // Throttling for resize updates
  private resizeThrottleTimeout: number | null = null
  private lastResizeUpdate: number = 0
  private readonly RESIZE_THROTTLE_MS = 16 // ~60fps

  // Event listeners for cleanup
  private eventListeners: Array<{
    element: EventTarget
    event: string
    handler: EventListener
  }> = []

  constructor(options: MouseControllerOptions) {
    this.container = options.container
    this.bodyRenderer = options.bodyRenderer
    this.selectionController = options.selectionController
    this.interactionStore = options.interactionStore
    this.visualStateStore = options.visualStateStore
    this.tableCoreStore = options.tableCoreStore
    this.keyboardController = options.keyboardController
    this.coordinator = options.coordinator
    this.enableSelectionColumn = options.enableSelectionColumn ?? true

    // Initialize sub-controllers
    this.clickRouter = new ClickRouter({
      container: this.container,
      selectionController: this.selectionController,
      interactionStore: this.interactionStore,
      visualStateStore: this.visualStateStore,
      tableCoreStore: this.tableCoreStore,
      scrollController: options.scrollController,
      coordinator: this.coordinator,
      enableSelectionColumn: this.enableSelectionColumn,
    })

    this.dragSelectionController = new DragSelectionController({
      interactionStore: this.interactionStore,
      tableCoreStore: this.tableCoreStore,
      visualStateStore: this.visualStateStore,
    })

    this.fillDragController = new FillDragController({
      coordinator: this.coordinator,
    })

    this.hoverTracker = new HoverTracker({
      interactionStore: this.interactionStore,
    })

    // Prevent text selection during drag operations
    this.container.style.userSelect = 'none'
    this.container.style.webkitUserSelect = 'none'

    this.setupGlobalMouseHandling()
    fileLog.debug('MouseController initialized with global event handling')
  }

  /**
   * Setup global mouse event listeners - ONLY these listeners should exist for mouse events
   */
  private setupGlobalMouseHandling(): void {
    fileLog.debug('Setting up global mouse event coordination')

    const mouseDownHandler = this.onMouseDown.bind(this)
    const mouseMoveHandler = this.onMouseMove.bind(this)
    const mouseUpHandler = this.onMouseUp.bind(this)
    const clickHandler = this.onClick.bind(this)

    this.addEventListenerTracked(document, 'mousedown', mouseDownHandler as EventListener)
    this.addEventListenerTracked(document, 'mousemove', mouseMoveHandler as EventListener)
    this.addEventListenerTracked(document, 'mouseup', mouseUpHandler as EventListener)
    this.addEventListenerTracked(document, 'click', clickHandler as EventListener)

    fileLog.debug('Global mouse event coordination setup complete')
  }

  /**
   * Handle mouse down - start tracking potential drag and provide immediate feedback
   */
  private onMouseDown(e: MouseEvent): void {
    if (!this.container.contains(e.target as Node)) {
      return
    }

    this.startPosition = { x: e.clientX, y: e.clientY }
    this.isDragging = false
    this.isTracking = true
    this.isColumnDrag = false
    this.dragColumnId = null
    this.isRowDrag = false
    this.dragRowId = null
    this.dragRowGroupId = null
    this.isColumnResize = false
    this.isFillDrag = false

    const target = e.target as HTMLElement

    fileLog.debug('Mouse down on element', {
      tagName: target.tagName,
      className: target.className,
      id: target.id,
      hasDataColumnId: target.hasAttribute('data-column-id'),
      hasDataRowId: target.hasAttribute('data-row-id'),
      parentTagName: target.parentElement?.tagName,
      parentClassName: target.parentElement?.className,
      hasResizeHandle: target.classList.contains('vibegridx-resize-handle'),
      closestResizeHandle: !!target.closest('.vibegridx-resize-handle'),
      hasFillHandle: target.classList.contains('vibegridx-fill-handle'),
      closestFillHandle: !!target.closest('.vibegridx-fill-handle'),
    })

    // Check for fill handle first (highest priority - should not trigger selection)
    if (this.fillDragController.isFillHandleTarget(target)) {
      this.isFillDrag = true
      this.fillDragController.handleFillStart()
      this.container.setPointerCapture(e.pointerId)
      e.preventDefault()
      e.stopPropagation()
      return
    }

    // Check for column resize handle second (high priority)
    const resizeHandle = target.closest('.vibegridx-resize-handle')
    if (resizeHandle) {
      const headerElement = resizeHandle.closest('[data-column-id]')
      const columnId = headerElement?.getAttribute('data-column-id')
      if (columnId) {
        this.isColumnResize = true
        const columnWidths = this.visualStateStore.columnWidths
        const initialWidth = columnWidths[columnId] || 150

        this.interactionStore.startColumnResize(columnId, e.clientX, initialWidth)
        this.container.setPointerCapture(e.pointerId)

        fileLog.debug('[RESIZE] Column resize handle mouse down', {
          columnId,
          initialWidth,
          element: resizeHandle.tagName,
          mouseX: e.clientX,
        })

        e.preventDefault()
        return
      }
    }

    // GH#1240: Check for expand-row button clicks BEFORE selection
    const expandButton = target.closest('[data-action="expand-row"]') as HTMLElement | null
    if (expandButton) {
      const rowId = expandButton.getAttribute('data-row-id')
      fileLog.info('[mousedown] Expand button detected', {
        rowId,
        rowExpansionEnabled: this.interactionStore.rowExpansionEnabled,
        expandedRowIds: Array.from(this.interactionStore.expandedRowIds || []),
      })
      if (rowId && this.interactionStore.rowExpansionEnabled) {
        fileLog.info('[mousedown] Calling toggleRowExpansion', { rowId })
        this.interactionStore.toggleRowExpansion(rowId)
        this.isTracking = false
        e.preventDefault()
        e.stopPropagation()
        return
      }
    }

    // Check for column header drag
    const headerElement = target.closest('[data-column-id]:not([data-row-id])')
    if (headerElement) {
      const columnId = headerElement.getAttribute('data-column-id')
      fileLog.debug('Header element detected', {
        element: headerElement.tagName,
        columnId,
        hasColumnId: !!columnId,
        attributes: Array.from(headerElement.attributes)
          .map((a) => `${a.name}="${a.value}"`)
          .join(' '),
      })
      if (columnId) {
        this.isColumnDrag = true
        this.dragColumnId = columnId
        fileLog.debug('Column header mouse down - preparing for drag', { columnId })
        return
      } else {
        fileLog.warn('Header element found but no column ID', {
          element: headerElement.tagName,
          attributes: Array.from(headerElement.attributes)
            .map((a) => `${a.name}="${a.value}"`)
            .join(' '),
        })
      }
    }

    const cellElement = target.closest('[data-row-id][data-column-id]')

    if (cellElement) {
      const rowId = cellElement.getAttribute('data-row-id')
      const columnId = cellElement.getAttribute('data-column-id')
      const cellId = `${rowId}:${columnId}`

      // Check if this is a drag handle cell - if so, prepare for row drag
      if (columnId === '__drag_handle') {
        const rowElement = cellElement.closest('[data-row-id]')
        const groupElement = rowElement?.closest('[data-group-id]')
        const groupId = groupElement?.getAttribute('data-group-id')

        this.isRowDrag = true
        this.dragRowId = rowId
        this.dragRowGroupId = groupId || null

        fileLog.debug('Row drag handle mouse down - preparing for row drag', {
          cellId,
          rowId,
          groupId,
          targetElement: target.tagName,
        })
        return
      }

      const isEditableElement = target.matches('input, textarea, select') || target.contentEditable === 'true'

      fileLog.debug('Cell mouse down - pure event coordination', {
        cellId,
        tagName: target.tagName,
        className: target.className,
        isEditableElement,
        hasCoordinator: !!this.coordinator,
      })

      if (!this.coordinator) {
        fileLog.error('CRITICAL: Coordinator not initialized - this should never happen')
        return
      }

      fileLog.debug('Delegating pointer down to InteractionCoordinator')

      this.coordinator.handlePointerDown({
        cellId,
        rowId: rowId!,
        columnId: columnId!,
        x: e.clientX,
        y: e.clientY,
        target: e.target as Element,
        modifiers: {
          ctrl: e.ctrlKey,
          shift: e.shiftKey,
          alt: e.altKey,
          meta: e.metaKey,
        },
        nativeEvent: e as PointerEvent,
      })

      if (this.keyboardController && !isEditableElement) {
        this.keyboardController.ensureContainerFocus()
      }

      if (target.matches('input, textarea, select') || target.contentEditable === 'true') {
        this.isDragging = false
        this.isTracking = false
        this.startPosition = { x: 0, y: 0 }
        return
      } else {
        e.preventDefault()
      }
    }

    fileLog.debug('Mouse down tracked', {
      position: this.startPosition,
      target: target.tagName,
    })
  }

  /**
   * Handle mouse move - detect drag threshold and update drag/selection/fill/hover
   */
  private onMouseMove(e: MouseEvent): void {
    if (this.isTracking) {
      const distance = Math.hypot(e.clientX - this.startPosition.x, e.clientY - this.startPosition.y)

      fileLog.debug('Mouse move while tracking', {
        distance,
        threshold: this.dragThreshold,
        startPos: this.startPosition,
        currentPos: { x: e.clientX, y: e.clientY },
        isTracking: this.isTracking,
        isDragging: this.isDragging,
      })
    }

    if (!this.isTracking) {
      return
    }

    // Handle column resize immediately (no threshold needed)
    if (this.isColumnResize) {
      this.handleColumnResize(e)
      return
    }

    // Calculate distance from start position
    const distance = Math.hypot(e.clientX - this.startPosition.x, e.clientY - this.startPosition.y)

    // Update drag state if threshold exceeded
    if (!this.isDragging && distance > this.dragThreshold) {
      this.isDragging = true
      // Capture pointer now that a real drag has started — keeps events flowing
      // even if pointer leaves the container. NOT called on pointerdown because
      // that would fight with touch-action: pan-y and break native scroll.
      if (this.container.hasPointerCapture?.(e.pointerId) === false) {
        this.container.setPointerCapture(e.pointerId)
      }
      fileLog.debug('Drag threshold exceeded - now dragging', {
        distance,
        threshold: this.dragThreshold,
        isColumnDrag: this.isColumnDrag,
        dragColumnId: this.dragColumnId,
        isRowDrag: this.isRowDrag,
        dragRowId: this.dragRowId,
      })

      if (this.isColumnResize) {
        this.handleColumnResize(e)
      } else if (this.isColumnDrag && this.dragColumnId) {
        fileLog.debug('Column drag started', { columnId: this.dragColumnId })
        runInAction(() => {
          this.interactionStore.isDragging = true
        })
        runInAction(() => {
          this.interactionStore.dragSource = this.dragColumnId
        })
        this.createDragPreview(this.dragColumnId)
      } else if (this.isRowDrag && this.dragRowId) {
        fileLog.debug('Row drag started', {
          rowId: this.dragRowId,
          groupId: this.dragRowGroupId,
        })
        runInAction(() => {
          this.interactionStore.isDragging = true
        })
        runInAction(() => {
          this.interactionStore.dragSource = this.dragRowId
        })
        this.createRowDragPreview(this.dragRowId)
      } else if (this.isColumnDrag) {
        fileLog.warn('Column drag detected but dragColumnId is missing')
      } else if (this.isRowDrag) {
        fileLog.warn('Row drag detected but dragRowId is missing')
      } else if (this.isFillDrag) {
        this.fillDragController.handleFillDragThresholdExceeded()
      } else {
        // Cell drag selection
        this.dragSelectionController.startDragSelect()
      }
    }

    // Handle column drag target detection
    if (this.isDragging && this.isColumnDrag && this.dragColumnId) {
      const target = e.target as HTMLElement
      const targetHeaderElement = target.closest('[data-column-id]:not([data-row-id])')
      if (targetHeaderElement) {
        const targetColumnId = targetHeaderElement.getAttribute('data-column-id')
        if (targetColumnId && targetColumnId !== this.dragColumnId) {
          runInAction(() => {
            this.interactionStore.dragTarget = targetColumnId
          })
          this.showDropLine(targetHeaderElement as HTMLElement, e.clientX)
          fileLog.debug('Column drag over target', {
            sourceColumnId: this.dragColumnId,
            targetColumnId,
          })
        }
      } else {
        this.hideDropLine()
      }
    }

    // Handle row drag target detection
    if (this.isDragging && this.isRowDrag && this.dragRowId) {
      const target = e.target as HTMLElement
      const targetRowElement = target.closest('[data-row-id]')
      if (targetRowElement) {
        const targetRowId = targetRowElement.getAttribute('data-row-id')
        const targetCellElement = target.closest('[data-column-id]')
        const _targetColumnId = targetCellElement?.getAttribute('data-column-id')

        if (targetRowId && targetRowId !== this.dragRowId) {
          runInAction(() => {
            this.interactionStore.dragTarget = targetRowId
          })
          this.showRowDropIndicator(targetRowElement as HTMLElement, e.clientY)
          fileLog.debug('Row drag over target', {
            sourceRowId: this.dragRowId,
            targetRowId,
          })
        }
      } else {
        this.hideRowDropIndicator()
      }
    }

    // Handle fill drag updates
    if (this.isDragging && this.isFillDrag) {
      this.fillDragController.handleFillMove(e.target as HTMLElement)
      return // Don't allow fill drag to trigger selection updates
    }

    // Handle cell drag selection updates
    if (this.isDragging && !this.isColumnDrag && !this.isRowDrag && this.interactionStore.isDragSelecting) {
      this.dragSelectionController.updateDragSelect(e.target as HTMLElement)
    }

    // Always update mouse coordinates
    this.hoverTracker.updateMousePosition(e.clientX, e.clientY)

    // Update drag preview position for column drag
    if (this.isDragging && this.isColumnDrag && this.dragPreviewElement) {
      this.updateDragPreviewPosition(e.clientX, e.clientY)
    }

    // Update drag preview position for row drag
    if (this.isDragging && this.isRowDrag && this.dragPreviewElement) {
      this.updateDragPreviewPosition(e.clientX, e.clientY)
    }
  }

  /**
   * Handle mouse up - reset drag state
   */
  private onMouseUp(e: MouseEvent): void {
    fileLog.debug('Mouse up detected', {
      withinContainer: this.container.contains(e.target as Node),
      wasTracking: this.isTracking,
      wasDragging: this.isDragging,
      wasColumnDrag: this.isColumnDrag,
      wasRowDrag: this.isRowDrag,
      wasColumnResize: this.isColumnResize,
    })

    if (this.isDragging || this.isColumnResize) {
      if (this.isColumnResize) {
        this.handleColumnResizeEnd(e)
      } else if (this.isColumnDrag && this.dragColumnId) {
        this.handleColumnDragEnd(e)
      } else if (this.isFillDrag) {
        this.fillDragController.handleFillComplete(e.target as HTMLElement)
      } else if (this.isRowDrag && this.dragRowId) {
        this.handleRowDragEnd(e)
      } else {
        // End drag selection
        this.dragSelectionController.endDragSelect()
      }

      fileLog.debug('Mouse up after drag - preventing synthetic click')
      fileLog.debug('About to reset all drag state')
      e.preventDefault()
      e.stopPropagation()

      this.justEndedDrag = true
      this.resetAllDragState()

      // Clear the flag after a brief delay to allow normal clicks again
      setTimeout(() => {
        this.justEndedDrag = false
        fileLog.debug('Post-drag click blocking cleared')
      }, 100)
    } else {
      // No drag was happening, reset immediately
      this.resetAllDragState()
      fileLog.debug('Non-drag mouse up - state reset')
    }
  }

  /**
   * Handle click events - delegate to ClickRouter
   */
  private onClick(e: MouseEvent): void {
    this.clickRouter.routeClick(e, this.isDragging, this.justEndedDrag)
  }

  // ====================================
  // Column resize (retained - tightly coupled to header)
  // ====================================

  private handleColumnResize(e: MouseEvent): void {
    const result = this.interactionStore.updateColumnResize(e.clientX)

    if (result) {
      fileLog.debug('[RESIZE] Column resize move - interaction state updated', {
        columnId: result.columnId,
        newWidth: result.newWidth,
        mouseX: e.clientX,
        deltaFromStart: e.clientX - this.startPosition.x,
      })

      if (result.columnId && result.newWidth && this.visualState?.visualOperations?.setColumnWidth) {
        const now = Date.now()
        const timeSinceLastUpdate = now - this.lastResizeUpdate

        if (this.resizeThrottleTimeout) {
          window.clearTimeout(this.resizeThrottleTimeout)
          this.resizeThrottleTimeout = null
        }

        if (timeSinceLastUpdate >= this.RESIZE_THROTTLE_MS) {
          fileLog.debug('[RESIZE] Updating visual state LIVE (immediate)', {
            columnId: result.columnId,
            newWidth: result.newWidth,
            timeSinceLastUpdate,
          })
          this.visualStateStore.updateColumnWidth(result.columnId, result.newWidth)
          this.lastResizeUpdate = now
        } else {
          const delay = this.RESIZE_THROTTLE_MS - timeSinceLastUpdate
          this.resizeThrottleTimeout = window.setTimeout(() => {
            fileLog.debug('[RESIZE] Updating visual state LIVE (throttled)', {
              columnId: result.columnId,
              newWidth: result.newWidth,
              delay,
            })
            this.visualStateStore.updateColumnWidth(result.columnId, result.newWidth)
            this.lastResizeUpdate = Date.now()
            this.resizeThrottleTimeout = null
          }, delay)
        }
      }
    }

    e.preventDefault()
  }

  private handleColumnResizeEnd(e: MouseEvent): void {
    if (this.resizeThrottleTimeout) {
      window.clearTimeout(this.resizeThrottleTimeout)
      this.resizeThrottleTimeout = null
    }

    const resizeResult = this.interactionStore.endColumnResize()

    fileLog.debug('[RESIZE] Column resize ended via MouseController', {
      columnId: resizeResult?.columnId,
      newWidth: resizeResult?.newWidth,
      finalMouseX: e.clientX,
    })

    fileLog.debug('[RESIZE] Attempting to persist column width', {
      hasResizeResult: !!resizeResult,
      columnId: resizeResult?.columnId,
      newWidth: resizeResult?.newWidth,
    })

    if (resizeResult?.columnId && resizeResult?.newWidth) {
      fileLog.debug('[RESIZE] Calling updateColumnWidth to persist', {
        columnId: resizeResult.columnId,
        newWidth: resizeResult.newWidth,
      })
      this.visualStateStore.updateColumnWidth(resizeResult.columnId, resizeResult.newWidth)
    } else {
      fileLog.warn('[RESIZE] Cannot persist column width - missing data', {
        resizeResult,
      })
    }

    e.preventDefault()
    e.stopPropagation()
    this.justEndedDrag = true
  }

  // ====================================
  // Column drag (retained - tightly coupled to header)
  // ====================================

  private handleColumnDragEnd(e: MouseEvent): void {
    const targetColumnId = this.interactionStore.dragTarget
    if (targetColumnId && targetColumnId !== this.dragColumnId) {
      const targetHeaderElement = this.container.querySelector(
        `[data-column-id="${targetColumnId}"]:not([data-row-id])`,
      )
      let insertBefore = true

      if (targetHeaderElement) {
        const rect = targetHeaderElement.getBoundingClientRect()
        const cellCenterX = rect.left + rect.width / 2
        insertBefore = e.clientX < cellCenterX
      }

      fileLog.debug('Column dropped for reordering', {
        sourceColumnId: this.dragColumnId,
        targetColumnId,
        insertBefore,
        mouseX: e.clientX,
      })
      this.visualStateStore.reorderColumns(this.dragColumnId!, targetColumnId, insertBefore)
    }

    fileLog.debug('Column drag ended', { columnId: this.dragColumnId })
    runInAction(() => {
      this.interactionStore.isDragging = false
    })
    runInAction(() => {
      this.interactionStore.dragSource = null
    })
    runInAction(() => {
      this.interactionStore.dragTarget = null
    })
    this.removeDragPreview()
    this.hideDropLine()
    fileLog.debug('Column drag state reset, continuing to general reset')
  }

  // ====================================
  // Row drag (retained - tightly coupled to header)
  // ====================================

  private handleRowDragEnd(e: MouseEvent): void {
    const targetRowId = this.interactionStore.dragTarget
    if (targetRowId && targetRowId !== this.dragRowId) {
      this.handleRowDrop(targetRowId, e.clientY)
    }

    fileLog.debug('Row drag ended', { rowId: this.dragRowId })
    runInAction(() => {
      this.interactionStore.isDragging = false
    })
    runInAction(() => {
      this.interactionStore.dragSource = null
    })
    runInAction(() => {
      this.interactionStore.dragTarget = null
    })
    this.removeRowDragPreview()
    this.hideRowDropIndicator()
    fileLog.debug('Row drag state reset, continuing to general reset')
  }

  // ====================================
  // Shared state reset
  // ====================================

  private resetAllDragState(): void {
    this.isDragging = false
    this.isTracking = false
    this.isColumnDrag = false
    this.dragColumnId = null
    this.isRowDrag = false
    this.dragRowId = null
    this.dragRowGroupId = null
    this.isColumnResize = false
    this.isFillDrag = false
    this.startPosition = { x: 0, y: 0 }
    fileLog.debug('Drag state reset', {
      isDragging: this.isDragging,
      isTracking: this.isTracking,
      isColumnDrag: this.isColumnDrag,
      isRowDrag: this.isRowDrag,
    })
  }

  // ====================================
  // Public API (external interface unchanged)
  // ====================================

  /**
   * Get current drag state - for other components to query
   */
  get isCurrentlyDragging(): boolean {
    return this.isDragging
  }

  /**
   * Force reset drag state - called by external components when drag ends
   */
  resetDragState(): void {
    fileLog.debug('Force resetting drag state', {
      wasTracking: this.isTracking,
      wasDragging: this.isDragging,
      wasColumnDrag: this.isColumnDrag,
      dragColumnId: this.dragColumnId,
      wasRowDrag: this.isRowDrag,
      dragRowId: this.dragRowId,
    })

    this.resetAllDragState()
    this.removeDragPreview()
    this.hideDropLine()
    this.removeRowDragPreview()
    this.hideRowDropIndicator()
  }

  /**
   * Update renderer references (for late initialization)
   */
  setBodyRenderer(bodyRenderer: any): void {
    this.bodyRenderer = bodyRenderer
    fileLog.debug('BodyRenderer reference updated')
  }

  setScrollController(scrollController: any): void {
    this.clickRouter.setScrollController(scrollController)
    fileLog.debug('ScrollController reference updated')
  }

  setSelectionController(selectionController: any): void {
    this.selectionController = selectionController
    this.clickRouter.setSelectionController(selectionController)
    fileLog.debug('SelectionController reference updated')
  }

  setKeyboardController(keyboardController: any): void {
    this.keyboardController = keyboardController
    fileLog.debug('KeyboardController reference updated')
  }

  // ====================================
  // Column drag preview (retained - tightly coupled to header DOM)
  // ====================================

  private createDragPreview(columnId: string): void {
    const headerElement = this.container.querySelector(`[data-column-id="${columnId}"]:not([data-row-id])`)
    const columnText = headerElement?.textContent?.trim() || columnId

    this.dragPreviewElement = document.createElement('div')
    this.dragPreviewElement.className = 'vibegridx-column-drag-preview'
    this.dragPreviewElement.textContent = columnText

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
      transform: 'translate(-50%, -100%)',
      transition: 'none',
    })

    document.body.appendChild(this.dragPreviewElement)
    fileLog.debug('Column drag preview created', { columnId, text: columnText })
  }

  private updateDragPreviewPosition(x: number, y: number): void {
    if (!this.dragPreviewElement) return

    this.dragPreviewElement.style.left = `${x}px`
    this.dragPreviewElement.style.top = `${y}px`
  }

  private removeDragPreview(): void {
    if (this.dragPreviewElement) {
      this.dragPreviewElement.remove()
      this.dragPreviewElement = null
      fileLog.debug('Column drag preview removed')
    }
  }

  // ====================================
  // Drop line indicators (retained - tightly coupled to header DOM)
  // ====================================

  private showDropLine(targetHeaderElement: HTMLElement, mouseX: number): void {
    const rect = targetHeaderElement.getBoundingClientRect()
    const cellCenterX = rect.left + rect.width / 2
    const insertBefore = mouseX < cellCenterX

    const headerContainer = targetHeaderElement.parentElement
    if (!headerContainer) return

    this.hideDropLine()

    this.dropLineElement = document.createElement('div')
    this.dropLineElement.className = 'vibegridx-column-drop-line'

    const headerRect = headerContainer.getBoundingClientRect()
    const cellRect = targetHeaderElement.getBoundingClientRect()
    const linePosition = insertBefore ? cellRect.left - headerRect.left : cellRect.right - headerRect.left

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
      height: `${cellRect.height}px`,
    })

    headerContainer.style.position = 'relative'
    headerContainer.appendChild(this.dropLineElement)

    fileLog.debug('Drop line shown', { insertBefore, linePosition })
  }

  private hideDropLine(): void {
    if (this.dropLineElement) {
      this.dropLineElement.remove()
      this.dropLineElement = null
      fileLog.debug('Drop line hidden')
    }
  }

  // ====================================
  // Row drag preview (retained - tightly coupled to row DOM)
  // ====================================

  private createRowDragPreview(rowId: string): void {
    const rowElement = this.container.querySelector(`[data-row-id="${rowId}"]`)
    const rowText = `${rowElement?.textContent?.trim().slice(0, 50)}...` || `Row ${rowId}`

    this.dragPreviewElement = document.createElement('div')
    this.dragPreviewElement.className = 'vibegridx-row-drag-preview'
    const cells = rowElement!.querySelectorAll('.vibegridx-cell')
    const visibleCells = Array.from(cells).slice(0, 4)

    if (visibleCells.length > 0) {
      const cellTexts = visibleCells
        .map((cell) => {
          const text = cell.textContent?.trim() || ''
          return text.length > 15 ? `${text.substring(0, 15)}...` : text
        })
        .filter((text) => text.length > 0)

      this.dragPreviewElement.textContent = cellTexts.join(' • ')
    } else {
      this.dragPreviewElement.textContent = rowText
    }

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
      transform: 'translateY(-100%)',
      transition: 'none',
    })

    document.body.appendChild(this.dragPreviewElement)
    fileLog.debug('Row drag preview created', { rowId, text: rowText })
  }

  private removeRowDragPreview(): void {
    if (this.dragPreviewElement) {
      this.dragPreviewElement.remove()
      this.dragPreviewElement = null
      fileLog.debug('Row drag preview removed')
    }
  }

  // ====================================
  // Row drop indicator (retained - tightly coupled to row DOM)
  // ====================================

  private showRowDropIndicator(targetRowElement: HTMLElement, mouseY: number): void {
    const rect = targetRowElement.getBoundingClientRect()
    const rowCenterY = rect.top + rect.height / 2
    const insertBefore = mouseY < rowCenterY

    const container = targetRowElement.closest('.vibegridx-container')
    if (!container) return

    this.hideRowDropIndicator()

    this.dropLineElement = document.createElement('div')
    this.dropLineElement.className = 'vibegrid-row-drop-indicator'

    const containerRect = container.getBoundingClientRect()
    const rowRect = targetRowElement.getBoundingClientRect()
    const linePosition = insertBefore ? rowRect.top - containerRect.top : rowRect.bottom - containerRect.top

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
      pointerEvents: 'none',
    })

    ;(container as HTMLElement).style.position = 'relative'
    container.appendChild(this.dropLineElement)

    fileLog.debug('Row drop indicator shown', { insertBefore, linePosition })
  }

  private hideRowDropIndicator(): void {
    if (this.dropLineElement) {
      this.dropLineElement.remove()
      this.dropLineElement = null
      fileLog.debug('Row drop indicator hidden')
    }
  }

  // ====================================
  // Row drop handling (retained - tightly coupled to body renderer)
  // ====================================

  private handleRowDrop(targetRowId: string, mouseY: number): void {
    if (!this.dragRowId) return

    const targetRowElement = this.container.querySelector(`[data-row-id="${targetRowId}"]`)
    if (!targetRowElement) return

    const rect = targetRowElement.getBoundingClientRect()
    const insertBefore = mouseY < rect.top + rect.height / 2

    const targetGroupElement = targetRowElement.closest('[data-group-id]')
    const targetGroupId = targetGroupElement?.getAttribute('data-group-id') || null

    const targetIndex = this.calculateRowDropIndex(targetRowElement as HTMLElement, targetGroupId, insertBefore)

    fileLog.debug('Row dropped for reordering', {
      sourceRowId: this.dragRowId,
      sourceGroupId: this.dragRowGroupId,
      targetRowId,
      targetGroupId,
      targetIndex,
      insertBefore,
      mouseY,
      isGroupedMode: !!(this.dragRowGroupId || targetGroupId),
      isFlatMode: !(this.dragRowGroupId || targetGroupId),
    })

    if (this.dragRowGroupId || targetGroupId) {
      fileLog.info('Using GROUPED mode row reorder')
      const finalTargetGroupId = targetGroupId || this.dragRowGroupId || ''
      this.callRowMoveHandler(this.dragRowId, finalTargetGroupId, targetIndex)
    } else {
      fileLog.info('Using FLAT mode row reorder')
      const sourceIndex = this.calculateRowIndex(this.dragRowId)
      fileLog.debug('Flat mode indices', { sourceIndex, targetIndex })
      this.callFlatRowMoveHandler(sourceIndex, targetIndex)
    }
  }

  private calculateRowDropIndex(targetRowElement: HTMLElement, groupId: string | null, insertBefore: boolean): number {
    if (groupId) {
      const isGroupHeader = targetRowElement.classList.contains('vibegridx-group-header')

      if (isGroupHeader) {
        const groupContainer = targetRowElement.parentElement
        if (!groupContainer) return 0

        const dataRows = Array.from(
          groupContainer.querySelectorAll(`.vibegridx-row:not(.vibegridx-group-header)[data-group-id="${groupId}"]`),
        )
        const calculatedIndex = insertBefore ? 0 : dataRows.length

        fileLog.debug('calculateRowDropIndex for group header drop', {
          groupId,
          insertBefore,
          calculatedIndex,
          dataRowsInGroup: dataRows.length,
          interpretation: insertBefore ? 'Insert at beginning of group' : 'Insert at end of group',
        })

        return calculatedIndex
      }

      const groupContainer = targetRowElement.closest(`[data-group-id="${groupId}"]`)?.parentElement
      if (!groupContainer) return 0

      const dataRows = Array.from(
        groupContainer.querySelectorAll(`.vibegridx-row:not(.vibegridx-group-header)[data-group-id="${groupId}"]`),
      )
      const targetIndex = dataRows.indexOf(targetRowElement)

      if (targetIndex === -1) {
        fileLog.error('Target row not found in group data rows', {
          targetRowId: targetRowElement.dataset.rowId,
          targetGroupId: targetRowElement.dataset.groupId,
          searchGroupId: groupId,
          dataRowsCount: dataRows.length,
          insertBefore,
          targetClasses: targetRowElement.className,
          groupContainerTag: groupContainer.tagName,
          groupContainerClass: groupContainer.className,
          dataRowIds: dataRows.map((r) => (r as HTMLElement).dataset.rowId),
          targetIsInDOM: document.body.contains(targetRowElement),
          closestResult: targetRowElement.closest(`[data-group-id="${groupId}"]`)?.tagName,
        })
        return 0
      }

      const calculatedIndex = insertBefore ? targetIndex : targetIndex + 1
      fileLog.debug('calculateRowDropIndex for grouped mode', {
        targetRowId: targetRowElement.dataset.rowId,
        groupId,
        targetIndex,
        insertBefore,
        calculatedIndex,
        dataRowsInGroup: dataRows.length,
      })

      return calculatedIndex
    } else {
      const container = targetRowElement.closest('.vibegridx-container')
      if (!container) return 0

      const dataRows = Array.from(container.querySelectorAll('.vibegridx-row:not(.vibegridx-group-header)'))
      const targetIndex = dataRows.indexOf(targetRowElement)
      return insertBefore ? targetIndex : targetIndex + 1
    }
  }

  private calculateRowIndex(rowId: string): number {
    const rowElement = this.container.querySelector(`[data-row-id="${rowId}"]`)
    if (!rowElement) return 0

    const container = rowElement.closest('.vibegridx-container')
    if (!container) return 0

    const dataRows = Array.from(container.querySelectorAll('.vibegridx-row:not(.vibegridx-group-header)'))
    return dataRows.indexOf(rowElement)
  }

  private callRowMoveHandler(draggedRowId: string, targetGroupId: string, newIndex: number): void {
    if (this.bodyRenderer?.dragDropManager?.callbacks?.onRowMove) {
      const success = this.bodyRenderer.dragDropManager.callbacks.onRowMove(draggedRowId, targetGroupId, newIndex)
      fileLog.debug(success ? 'Same-group row move' : 'Row move failed', {
        draggedRowId,
        targetGroupId,
        newIndex,
        success,
      })
    } else {
      fileLog.error('DragDropManager onRowMove not available', {
        hasBodyRenderer: !!this.bodyRenderer,
        hasDragDropManager: !!this.bodyRenderer?.dragDropManager,
        hasCallbacks: !!this.bodyRenderer?.dragDropManager?.callbacks,
        hasOnRowMove: !!this.bodyRenderer?.dragDropManager?.callbacks?.onRowMove,
      })
    }
  }

  private callFlatRowMoveHandler(fromIndex: number, toIndex: number): void {
    if (this.bodyRenderer?.dragDropManager?.callbacks?.onFlatRowMove) {
      const success = this.bodyRenderer.dragDropManager.callbacks.onFlatRowMove(fromIndex, toIndex)
      fileLog.debug(success ? 'Flat row move' : 'Flat row move failed', {
        fromIndex,
        toIndex,
        success,
      })
    } else {
      fileLog.error('DragDropManager onFlatRowMove not available', {
        hasBodyRenderer: !!this.bodyRenderer,
        hasDragDropManager: !!this.bodyRenderer?.dragDropManager,
        hasCallbacks: !!this.bodyRenderer?.dragDropManager?.callbacks,
        hasOnFlatRowMove: !!this.bodyRenderer?.dragDropManager?.callbacks?.onFlatRowMove,
      })
    }
  }

  // ====================================
  // Event listener tracking and cleanup
  // ====================================

  private addEventListenerTracked(element: EventTarget, event: string, handler: EventListener): void {
    element.addEventListener(event, handler)
    this.eventListeners.push({ element, event, handler })
  }

  /**
   * Clean up all mouse event handling
   */
  destroy(): void {
    this.eventListeners.forEach(({ element, event, handler }) => {
      try {
        element.removeEventListener(event, handler)
      } catch (error) {
        fileLog.error('Error removing mouse event listener', { event, error })
      }
    })
    this.eventListeners = []

    this.removeDragPreview()
    this.hideDropLine()

    if (this.resizeThrottleTimeout) {
      window.clearTimeout(this.resizeThrottleTimeout)
      this.resizeThrottleTimeout = null
    }

    this.container.style.userSelect = ''
    this.container.style.webkitUserSelect = ''

    fileLog.debug('MouseController destroyed')
  }
}
