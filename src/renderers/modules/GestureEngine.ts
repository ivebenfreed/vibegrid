/**
 * GestureEngine - tldraw-inspired state machine for pointer gesture disambiguation
 *
 * Replaces boolean flag tracking in MouseController with proper state transitions.
 * Handles: Idle -> Pointing -> (DragSelecting | FillDragging | ColumnResizing | ColumnDragging | RowDragging | Scrolling)
 *
 * GH#2219 Phase 2
 */

import { getLogger } from '@/shared/lib/logging'

const fileLog = getLogger(['custom', 'vibegrid', 'renderers', 'modules', 'GestureEngine.ts'])

// ============================================================
// Types
// ============================================================

export type GestureStateName =
  | 'idle'
  | 'pointing'
  | 'drag_selecting'
  | 'fill_dragging'
  | 'column_resizing'
  | 'column_dragging'
  | 'row_dragging'
  | 'scrolling'

export interface PointingOrigin {
  x: number
  y: number
  pointerId: number
  pointerType: string
  target: HTMLElement
  /** Pre-resolved target info from pointerdown */
  targetInfo: TargetInfo
  modifiers: {
    ctrl: boolean
    shift: boolean
    alt: boolean
    meta: boolean
  }
  /** Original pointer event (for passing to InteractionCoordinator) */
  nativeEvent: PointerEvent
}

export interface TargetInfo {
  isFillHandle: boolean
  isResizeHandle: boolean
  isColumnDragHandle: boolean // column header (not a cell row)
  isRowDragHandle: boolean // __drag_handle column
  isExpandButton: boolean
  isEditableElement: boolean
  cellElement: Element | null
  rowId: string | null
  columnId: string | null
  resizeColumnId: string | null // column ID from resize handle's parent header
  headerElement: Element | null // column header element for column drag
}

export interface GestureCallbacks {
  // Pointing -> tap (pointerup within threshold)
  onTap: (origin: PointingOrigin) => void

  // Pointing -> DragSelecting
  onDragSelectStart: () => void
  onDragSelectMove: (target: HTMLElement) => void
  onDragSelectEnd: () => void

  // Pointing -> FillDragging
  onFillStart: () => void
  onFillThresholdExceeded: () => void
  onFillMove: (target: HTMLElement) => void
  onFillComplete: (target: HTMLElement) => void

  // Pointing -> ColumnResizing
  onColumnResizeStart: (columnId: string, clientX: number) => void
  onColumnResizeMove: (e: PointerEvent) => void
  onColumnResizeEnd: (e: PointerEvent) => void

  // Pointing -> ColumnDragging
  onColumnDragStart: (columnId: string) => void
  onColumnDragMove: (e: PointerEvent) => void
  onColumnDragEnd: (e: PointerEvent) => void

  // Pointing -> RowDragging
  onRowDragStart: (rowId: string, groupId: string | null) => void
  onRowDragMove: (e: PointerEvent) => void
  onRowDragEnd: (e: PointerEvent) => void

  // Pointing -> Scrolling (stub for Phase 3)
  onScrollStart: () => void
  onScrollMove: (e: PointerEvent) => void
  onScrollEnd: (e: PointerEvent) => void

  // Expand button (immediate action, no state transition)
  onExpandToggle: (rowId: string) => void

  // Pointer down on cell (immediate feedback -- selection highlight)
  onCellPointerDown: (origin: PointingOrigin) => void

  // Hover (mouse only)
  onHoverUpdate: (clientX: number, clientY: number) => void

  // Cleanup on cancel
  onCancel: () => void
}

// ============================================================
// Target resolution
// ============================================================

export function resolveTargetInfo(target: HTMLElement): TargetInfo {
  const isFillHandle = !!target.closest('.vibegridx-fill-handle')
  const resizeHandle = target.closest('.vibegridx-resize-handle')
  const isResizeHandle = !!resizeHandle
  const expandButton = target.closest('[data-action="expand-row"]') as HTMLElement | null
  const isExpandButton = !!expandButton

  // Column header: has data-column-id but NOT data-row-id
  const headerElement = target.closest('[data-column-id]:not([data-row-id])')
  const isColumnDragHandle = !!headerElement && !isResizeHandle

  // Cell element with both row and column
  const cellElement = target.closest('[data-row-id][data-column-id]')
  const rowId = cellElement?.getAttribute('data-row-id') ?? null
  const columnId = cellElement?.getAttribute('data-column-id') ?? null

  // Row drag: cell in __drag_handle column
  const isRowDragHandle = columnId === '__drag_handle'

  // Resize: get column ID from the header parent of the resize handle
  let resizeColumnId: string | null = null
  if (isResizeHandle && resizeHandle) {
    const resizeHeader = resizeHandle.closest('[data-column-id]')
    resizeColumnId = resizeHeader?.getAttribute('data-column-id') ?? null
  }

  const isEditableElement = target.matches('input, textarea, select') || target.contentEditable === 'true'

  return {
    isFillHandle,
    isResizeHandle,
    isColumnDragHandle,
    isRowDragHandle,
    isExpandButton,
    isEditableElement,
    cellElement,
    rowId,
    columnId,
    resizeColumnId,
    headerElement,
  }
}

// ============================================================
// GestureEngine
// ============================================================

export class GestureEngine {
  private state: GestureStateName = 'idle'
  private origin: PointingOrigin | null = null
  private callbacks: GestureCallbacks

  // Thresholds
  private readonly MOUSE_THRESHOLD = 4
  private readonly TOUCH_THRESHOLD = 8

  constructor(callbacks: GestureCallbacks) {
    this.callbacks = callbacks
    fileLog.debug('GestureEngine initialized')
  }

  // ---- Public API ----

  get currentState(): GestureStateName {
    return this.state
  }

  get currentOrigin(): PointingOrigin | null {
    return this.origin
  }

  handlePointerDown(e: PointerEvent, container: HTMLElement): void {
    // Only process if pointer is inside container
    if (!container.contains(e.target as Node)) return

    // Only track the first pointer — ignore subsequent pointers during active gestures
    if (this.state !== 'idle') return

    const target = e.target as HTMLElement
    const targetInfo = resolveTargetInfo(target)

    fileLog.debug('GestureEngine.handlePointerDown', {
      state: this.state,
      pointerType: e.pointerType,
      targetInfo: {
        isFillHandle: targetInfo.isFillHandle,
        isResizeHandle: targetInfo.isResizeHandle,
        isColumnDragHandle: targetInfo.isColumnDragHandle,
        isRowDragHandle: targetInfo.isRowDragHandle,
        isExpandButton: targetInfo.isExpandButton,
      },
    })

    // Expand button is an immediate action, not a gesture
    if (targetInfo.isExpandButton) {
      const expandEl = target.closest('[data-action="expand-row"]') as HTMLElement | null
      const rowId = expandEl?.getAttribute('data-row-id')
      if (rowId) {
        this.callbacks.onExpandToggle(rowId)
        e.preventDefault()
        e.stopPropagation()
      }
      return
    }

    this.origin = {
      x: e.clientX,
      y: e.clientY,
      pointerId: e.pointerId,
      pointerType: e.pointerType,
      target,
      targetInfo,
      nativeEvent: e,
      modifiers: {
        ctrl: e.ctrlKey,
        shift: e.shiftKey,
        alt: e.altKey,
        meta: e.metaKey,
      },
    }

    this.transition('pointing')

    // Fill handle: start immediately (no threshold needed for the start notification)
    if (targetInfo.isFillHandle) {
      this.callbacks.onFillStart()
      e.preventDefault()
      e.stopPropagation()
      return
    }

    // Resize handle: column resize starts at 0px for mouse (no threshold)
    if (targetInfo.isResizeHandle && targetInfo.resizeColumnId) {
      if (e.pointerType === 'mouse') {
        // Mouse: transition immediately to column_resizing (no threshold)
        this.transition('column_resizing')
        this.callbacks.onColumnResizeStart(targetInfo.resizeColumnId, e.clientX)
        e.preventDefault()
        return
      }
      // Touch: stays in pointing, will transition after threshold
    }

    // Cell pointer down: immediate visual feedback
    if (targetInfo.cellElement && !targetInfo.isRowDragHandle) {
      this.callbacks.onCellPointerDown(this.origin)

      if (targetInfo.isEditableElement) {
        // Don't track editable elements -- let native behavior work
        this.transition('idle')
        return
      }
      e.preventDefault()
    }
  }

  handlePointerMove(e: PointerEvent): void {
    // Hover tracking (mouse only, regardless of state)
    if (e.pointerType === 'mouse') {
      this.callbacks.onHoverUpdate(e.clientX, e.clientY)
    }

    if (this.state === 'idle' || !this.origin) return

    // Ignore events from other pointers
    if (e.pointerId !== this.origin.pointerId) return

    switch (this.state) {
      case 'pointing':
        this.handlePointingMove(e)
        break
      case 'drag_selecting':
        this.callbacks.onDragSelectMove(e.target as HTMLElement)
        break
      case 'fill_dragging':
        this.callbacks.onFillMove(e.target as HTMLElement)
        break
      case 'column_resizing':
        this.callbacks.onColumnResizeMove(e)
        break
      case 'column_dragging':
        this.callbacks.onColumnDragMove(e)
        break
      case 'row_dragging':
        this.callbacks.onRowDragMove(e)
        break
      case 'scrolling':
        this.callbacks.onScrollMove(e)
        break
    }
  }

  handlePointerUp(e: PointerEvent): void {
    if (this.state === 'idle' || !this.origin) return
    if (e.pointerId !== this.origin.pointerId) return

    fileLog.debug('GestureEngine.handlePointerUp', { state: this.state })

    switch (this.state) {
      case 'pointing':
        // Was a tap (didn't exceed threshold)
        this.callbacks.onTap(this.origin)
        break
      case 'drag_selecting':
        this.callbacks.onDragSelectEnd()
        break
      case 'fill_dragging':
        this.callbacks.onFillComplete(e.target as HTMLElement)
        break
      case 'column_resizing':
        this.callbacks.onColumnResizeEnd(e)
        break
      case 'column_dragging':
        this.callbacks.onColumnDragEnd(e)
        break
      case 'row_dragging':
        this.callbacks.onRowDragEnd(e)
        break
      case 'scrolling':
        this.callbacks.onScrollEnd(e)
        break
    }

    this.reset()
  }

  handlePointerCancel(e: PointerEvent): void {
    if (this.state === 'idle' || !this.origin) return
    // Only cancel for the tracked pointer
    if (e.pointerId !== this.origin.pointerId) return

    fileLog.debug('GestureEngine.handlePointerCancel', {
      state: this.state,
      pointerId: e.pointerId,
    })
    this.callbacks.onCancel()
    this.reset()
  }

  /**
   * Force reset to idle (called externally when state needs clearing)
   */
  forceReset(): void {
    this.reset()
  }

  // ---- Private ----

  private handlePointingMove(e: PointerEvent): void {
    if (!this.origin) return

    const dx = e.clientX - this.origin.x
    const dy = e.clientY - this.origin.y
    const distance = Math.hypot(dx, dy)
    const threshold = this.origin.pointerType === 'touch' ? this.TOUCH_THRESHOLD : this.MOUSE_THRESHOLD

    if (distance < threshold) return // Still in dead zone

    const { targetInfo } = this.origin

    // Priority 1: Fill handle -- any direction
    if (targetInfo.isFillHandle) {
      this.transition('fill_dragging')
      this.callbacks.onFillThresholdExceeded()
      return
    }

    // Priority 2: Row drag handle -- any direction
    if (targetInfo.isRowDragHandle && targetInfo.rowId) {
      this.transition('row_dragging')
      const groupElement = this.origin.target.closest('[data-group-id]')
      const groupId = groupElement?.getAttribute('data-group-id') ?? null
      this.callbacks.onRowDragStart(targetInfo.rowId, groupId)
      return
    }

    // Priority 3: Column drag handle -- any direction
    if (targetInfo.isColumnDragHandle && targetInfo.headerElement) {
      const columnId = targetInfo.headerElement.getAttribute('data-column-id')
      if (columnId) {
        this.transition('column_dragging')
        this.callbacks.onColumnDragStart(columnId)
        return
      }
    }

    // Priority 4: Resize handle (touch only -- mouse already transitioned in pointerdown)
    if (targetInfo.isResizeHandle && targetInfo.resizeColumnId) {
      this.transition('column_resizing')
      this.callbacks.onColumnResizeStart(targetInfo.resizeColumnId, e.clientX)
      return
    }

    // Priority 5: Touch vertical scroll -- |dy| > |dx| * 1.5
    if (this.origin.pointerType === 'touch' && Math.abs(dy) > Math.abs(dx) * 1.5) {
      this.transition('scrolling')
      this.callbacks.onScrollStart()
      return
    }

    // Default: drag select (mouse drags are always drag-select, never scroll)
    this.transition('drag_selecting')
    this.callbacks.onDragSelectStart()
  }

  private transition(newState: GestureStateName): void {
    fileLog.debug('GestureEngine transition', { from: this.state, to: newState })
    this.state = newState
  }

  private reset(): void {
    this.state = 'idle'
    this.origin = null
  }
}
