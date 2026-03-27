/* @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the logging module before importing GestureEngine
vi.mock('@/shared/lib/logging', () => ({
  getLogger: () => ({
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  }),
}))

import { GestureEngine, resolveTargetInfo, type GestureCallbacks } from '../GestureEngine'

function createMockCallbacks(): GestureCallbacks {
  return {
    onTap: vi.fn(),
    onDragSelectStart: vi.fn(),
    onDragSelectMove: vi.fn(),
    onDragSelectEnd: vi.fn(),
    onFillStart: vi.fn(),
    onFillThresholdExceeded: vi.fn(),
    onFillMove: vi.fn(),
    onFillComplete: vi.fn(),
    onColumnResizeStart: vi.fn(),
    onColumnResizeMove: vi.fn(),
    onColumnResizeEnd: vi.fn(),
    onColumnDragStart: vi.fn(),
    onColumnDragMove: vi.fn(),
    onColumnDragEnd: vi.fn(),
    onRowDragStart: vi.fn(),
    onRowDragMove: vi.fn(),
    onRowDragEnd: vi.fn(),
    onScrollStart: vi.fn(),
    onScrollMove: vi.fn(),
    onScrollEnd: vi.fn(),
    onExpandToggle: vi.fn(),
    onCellPointerDown: vi.fn(),
    onHoverUpdate: vi.fn(),
    onCancel: vi.fn(),
  }
}

function createPointerEvent(
  overrides: Partial<PointerEvent> & {
    clientX?: number
    clientY?: number
    pointerId?: number
    pointerType?: string
    target?: any
  } = {},
): PointerEvent {
  const event = {
    clientX: 100,
    clientY: 100,
    pointerId: 1,
    pointerType: 'mouse',
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    target: document.createElement('div'),
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    ...overrides,
  } as unknown as PointerEvent
  return event
}

function createContainer(): HTMLElement {
  const container = document.createElement('div')
  document.body.appendChild(container)
  return container
}

describe('GestureEngine', () => {
  let engine: GestureEngine
  let callbacks: GestureCallbacks
  let container: HTMLElement

  beforeEach(() => {
    callbacks = createMockCallbacks()
    engine = new GestureEngine(callbacks)
    container = createContainer()
  })

  it('starts in idle state', () => {
    expect(engine.currentState).toBe('idle')
  })

  describe('Idle -> Pointing', () => {
    it('transitions to pointing on pointerdown inside container', () => {
      const target = document.createElement('div')
      const cell = document.createElement('td')
      cell.setAttribute('data-row-id', 'r1')
      cell.setAttribute('data-column-id', 'c1')
      cell.appendChild(target)
      container.appendChild(cell)

      engine.handlePointerDown(createPointerEvent({ target }), container)
      expect(engine.currentState).toBe('pointing')
    })

    it('stays idle on pointerdown outside container', () => {
      const target = document.createElement('div')
      engine.handlePointerDown(createPointerEvent({ target }), container)
      expect(engine.currentState).toBe('idle')
    })
  })

  describe('Pointing -> Idle (tap)', () => {
    it('calls onTap on pointerup within threshold', () => {
      const target = document.createElement('div')
      const cell = document.createElement('td')
      cell.setAttribute('data-row-id', 'r1')
      cell.setAttribute('data-column-id', 'c1')
      cell.appendChild(target)
      container.appendChild(cell)

      engine.handlePointerDown(createPointerEvent({ target, pointerId: 1 }), container)
      engine.handlePointerUp(createPointerEvent({ pointerId: 1 }))

      expect(callbacks.onTap).toHaveBeenCalled()
      expect(engine.currentState).toBe('idle')
    })
  })

  describe('Pointing -> DragSelecting', () => {
    it('transitions to drag_selecting on horizontal mouse movement > 4px', () => {
      const target = document.createElement('div')
      const cell = document.createElement('td')
      cell.setAttribute('data-row-id', 'r1')
      cell.setAttribute('data-column-id', 'c1')
      cell.appendChild(target)
      container.appendChild(cell)

      engine.handlePointerDown(
        createPointerEvent({
          target,
          clientX: 100,
          clientY: 100,
          pointerId: 1,
          pointerType: 'mouse',
        }),
        container,
      )
      engine.handlePointerMove(
        createPointerEvent({
          clientX: 105,
          clientY: 100,
          pointerId: 1,
          pointerType: 'mouse',
        }),
      )

      expect(engine.currentState).toBe('drag_selecting')
      expect(callbacks.onDragSelectStart).toHaveBeenCalled()
    })

    it('transitions to drag_selecting on horizontal touch movement > 8px', () => {
      const target = document.createElement('div')
      const cell = document.createElement('td')
      cell.setAttribute('data-row-id', 'r1')
      cell.setAttribute('data-column-id', 'c1')
      cell.appendChild(target)
      container.appendChild(cell)

      engine.handlePointerDown(
        createPointerEvent({
          target,
          clientX: 100,
          clientY: 100,
          pointerId: 1,
          pointerType: 'touch',
        }),
        container,
      )
      engine.handlePointerMove(
        createPointerEvent({
          clientX: 109,
          clientY: 100,
          pointerId: 1,
          pointerType: 'touch',
        }),
      )

      expect(engine.currentState).toBe('drag_selecting')
    })

    it('does not transition on touch movement < 8px', () => {
      const target = document.createElement('div')
      const cell = document.createElement('td')
      cell.setAttribute('data-row-id', 'r1')
      cell.setAttribute('data-column-id', 'c1')
      cell.appendChild(target)
      container.appendChild(cell)

      engine.handlePointerDown(
        createPointerEvent({
          target,
          clientX: 100,
          clientY: 100,
          pointerId: 1,
          pointerType: 'touch',
        }),
        container,
      )
      engine.handlePointerMove(
        createPointerEvent({
          clientX: 107,
          clientY: 100,
          pointerId: 1,
          pointerType: 'touch',
        }),
      )

      expect(engine.currentState).toBe('pointing')
    })
  })

  describe('Pointing -> Scrolling (touch only)', () => {
    it('transitions to scrolling on vertical touch movement when |dy| > |dx| * 1.5', () => {
      const target = document.createElement('div')
      const cell = document.createElement('td')
      cell.setAttribute('data-row-id', 'r1')
      cell.setAttribute('data-column-id', 'c1')
      cell.appendChild(target)
      container.appendChild(cell)

      engine.handlePointerDown(
        createPointerEvent({
          target,
          clientX: 100,
          clientY: 100,
          pointerId: 1,
          pointerType: 'touch',
        }),
        container,
      )
      // Move 10px down, 2px right -- |10| > |2| * 1.5 -> true
      engine.handlePointerMove(
        createPointerEvent({
          clientX: 102,
          clientY: 110,
          pointerId: 1,
          pointerType: 'touch',
        }),
      )

      expect(engine.currentState).toBe('scrolling')
      expect(callbacks.onScrollStart).toHaveBeenCalled()
    })

    it('mouse vertical drags go to drag_selecting, not scrolling', () => {
      const target = document.createElement('div')
      const cell = document.createElement('td')
      cell.setAttribute('data-row-id', 'r1')
      cell.setAttribute('data-column-id', 'c1')
      cell.appendChild(target)
      container.appendChild(cell)

      engine.handlePointerDown(
        createPointerEvent({
          target,
          clientX: 100,
          clientY: 100,
          pointerId: 1,
          pointerType: 'mouse',
        }),
        container,
      )
      engine.handlePointerMove(
        createPointerEvent({
          clientX: 102,
          clientY: 110,
          pointerId: 1,
          pointerType: 'mouse',
        }),
      )

      expect(engine.currentState).toBe('drag_selecting')
      expect(callbacks.onScrollStart).not.toHaveBeenCalled()
    })
  })

  describe('Pointing -> FillDragging', () => {
    it('transitions to fill_dragging when target is fill handle', () => {
      const fillHandle = document.createElement('div')
      fillHandle.classList.add('vibegridx-fill-handle')
      container.appendChild(fillHandle)

      engine.handlePointerDown(
        createPointerEvent({
          target: fillHandle,
          clientX: 100,
          clientY: 100,
          pointerId: 1,
        }),
        container,
      )
      expect(callbacks.onFillStart).toHaveBeenCalled()

      engine.handlePointerMove(createPointerEvent({ clientX: 105, clientY: 100, pointerId: 1 }))
      expect(engine.currentState).toBe('fill_dragging')
      expect(callbacks.onFillThresholdExceeded).toHaveBeenCalled()
    })
  })

  describe('Pointing -> ColumnResizing', () => {
    it('transitions immediately to column_resizing for mouse on resize handle', () => {
      const resizeHandle = document.createElement('div')
      resizeHandle.classList.add('vibegridx-resize-handle')
      const header = document.createElement('th')
      header.setAttribute('data-column-id', 'col1')
      header.appendChild(resizeHandle)
      container.appendChild(header)

      engine.handlePointerDown(
        createPointerEvent({
          target: resizeHandle,
          pointerId: 1,
          pointerType: 'mouse',
        }),
        container,
      )
      expect(engine.currentState).toBe('column_resizing')
      expect(callbacks.onColumnResizeStart).toHaveBeenCalledWith('col1', 100)
    })
  })

  describe('Pointing -> ColumnDragging', () => {
    it('transitions to column_dragging on header drag past threshold', () => {
      const header = document.createElement('th')
      header.setAttribute('data-column-id', 'col1')
      container.appendChild(header)

      engine.handlePointerDown(
        createPointerEvent({
          target: header,
          clientX: 100,
          clientY: 100,
          pointerId: 1,
          pointerType: 'mouse',
        }),
        container,
      )
      engine.handlePointerMove(
        createPointerEvent({
          clientX: 105,
          clientY: 100,
          pointerId: 1,
          pointerType: 'mouse',
        }),
      )

      expect(engine.currentState).toBe('column_dragging')
      expect(callbacks.onColumnDragStart).toHaveBeenCalledWith('col1')
    })
  })

  describe('Pointing -> RowDragging', () => {
    it('transitions to row_dragging on drag handle cell drag past threshold', () => {
      const cell = document.createElement('td')
      cell.setAttribute('data-row-id', 'row1')
      cell.setAttribute('data-column-id', '__drag_handle')
      container.appendChild(cell)

      engine.handlePointerDown(
        createPointerEvent({
          target: cell,
          clientX: 100,
          clientY: 100,
          pointerId: 1,
          pointerType: 'mouse',
        }),
        container,
      )
      engine.handlePointerMove(
        createPointerEvent({
          clientX: 105,
          clientY: 100,
          pointerId: 1,
          pointerType: 'mouse',
        }),
      )

      expect(engine.currentState).toBe('row_dragging')
      expect(callbacks.onRowDragStart).toHaveBeenCalledWith('row1', null)
    })
  })

  describe('pointercancel', () => {
    it('returns to idle and calls onCancel', () => {
      const target = document.createElement('div')
      const cell = document.createElement('td')
      cell.setAttribute('data-row-id', 'r1')
      cell.setAttribute('data-column-id', 'c1')
      cell.appendChild(target)
      container.appendChild(cell)

      engine.handlePointerDown(createPointerEvent({ target, pointerId: 1 }), container)
      expect(engine.currentState).toBe('pointing')

      engine.handlePointerCancel(createPointerEvent({ pointerId: 1 }))
      expect(engine.currentState).toBe('idle')
      expect(callbacks.onCancel).toHaveBeenCalled()
    })
  })

  describe('Multi-pointer rejection', () => {
    it('ignores pointer events from a different pointerId', () => {
      const target = document.createElement('div')
      const cell = document.createElement('td')
      cell.setAttribute('data-row-id', 'r1')
      cell.setAttribute('data-column-id', 'c1')
      cell.appendChild(target)
      container.appendChild(cell)

      engine.handlePointerDown(
        createPointerEvent({
          target,
          clientX: 100,
          clientY: 100,
          pointerId: 1,
          pointerType: 'mouse',
        }),
        container,
      )

      // Different pointer
      engine.handlePointerMove(
        createPointerEvent({
          clientX: 200,
          clientY: 200,
          pointerId: 2,
          pointerType: 'mouse',
        }),
      )
      expect(engine.currentState).toBe('pointing') // didn't transition

      engine.handlePointerUp(createPointerEvent({ pointerId: 2 }))
      expect(engine.currentState).toBe('pointing') // still pointing, wrong pointer
    })
  })

  describe('resolveTargetInfo', () => {
    it('detects fill handle', () => {
      const el = document.createElement('div')
      el.classList.add('vibegridx-fill-handle')
      const info = resolveTargetInfo(el)
      expect(info.isFillHandle).toBe(true)
    })

    it('detects resize handle with column ID', () => {
      const handle = document.createElement('div')
      handle.classList.add('vibegridx-resize-handle')
      const header = document.createElement('th')
      header.setAttribute('data-column-id', 'c1')
      header.appendChild(handle)
      document.body.appendChild(header)

      const info = resolveTargetInfo(handle)
      expect(info.isResizeHandle).toBe(true)
      expect(info.resizeColumnId).toBe('c1')
      header.remove()
    })

    it('detects column drag handle (header without row)', () => {
      const header = document.createElement('th')
      header.setAttribute('data-column-id', 'c1')
      const info = resolveTargetInfo(header)
      expect(info.isColumnDragHandle).toBe(true)
    })

    it('detects row drag handle', () => {
      const cell = document.createElement('td')
      cell.setAttribute('data-row-id', 'r1')
      cell.setAttribute('data-column-id', '__drag_handle')
      const info = resolveTargetInfo(cell)
      expect(info.isRowDragHandle).toBe(true)
    })
  })
})
