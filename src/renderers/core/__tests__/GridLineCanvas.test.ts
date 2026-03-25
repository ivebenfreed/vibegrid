/**
 * GridLineCanvas Tests
 *
 * Tests for the canvas-based grid line renderer that draws
 * vertical and horizontal grid lines on a canvas element.
 * GH#1442
 *
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ColumnLayout, VisualStateStore } from '../../../stores/VisualStateStore'
import type { ViewportStore } from '../../../stores/ViewportStore'
import { GridLineCanvas } from '../GridLineCanvas'
import { GRID_DIMENSIONS } from '../../../constants/grid-dimensions'

const RH = GRID_DIMENSIONS.ROW_HEIGHT

// --- Mock Canvas Context ---

function createMockContext2D(): CanvasRenderingContext2D {
  return {
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    scale: vi.fn(),
    setTransform: vi.fn(),
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 1,
  } as unknown as CanvasRenderingContext2D
}

// --- Mock Stores ---

function createMockVisualStateStore(
  overrides: Partial<{
    visibleColumns: ColumnLayout[]
    visibleColumnRange: { start: number; end: number }
    scrollLeft: number
    scrollTop: number
  }> = {},
): VisualStateStore {
  const columns: ColumnLayout[] = overrides.visibleColumns ?? [
    { id: 'col1', width: 150, xOffset: 70, visible: true, order: 0 },
    { id: 'col2', width: 200, xOffset: 220, visible: true, order: 1 },
    { id: 'col3', width: 150, xOffset: 420, visible: true, order: 2 },
  ]

  return {
    visibleColumns: columns,
    visibleColumnRange: overrides.visibleColumnRange ?? { start: 0, end: columns.length },
  } as unknown as VisualStateStore
}

function createMockViewportStore(
  overrides: Partial<{
    viewportWidth: number
    viewportHeight: number
    visibleRowRange: { start: number; end: number }
    rowOffsets: number[] | null
    totalRows: number
    scrollLeft: number
    scrollTop: number
  }> = {},
): ViewportStore {
  const visibleRowRange = overrides.visibleRowRange ?? { start: 0, end: 15 }
  return {
    viewportWidth: overrides.viewportWidth ?? 800,
    viewportHeight: overrides.viewportHeight ?? 600,
    visibleRowRange,
    rowOffsets: overrides.rowOffsets ?? null,
    totalRows: overrides.totalRows ?? visibleRowRange.end,
    scrollLeft: overrides.scrollLeft ?? 0,
    scrollTop: overrides.scrollTop ?? 0,
  } as unknown as ViewportStore
}

// ====================================
// TESTS
// ====================================

describe('GridLineCanvas', () => {
  let mockCtx: CanvasRenderingContext2D
  let originalCreateElement: typeof document.createElement
  let originalDevicePixelRatio: number

  beforeEach(() => {
    vi.clearAllMocks()
    mockCtx = createMockContext2D()
    originalCreateElement = document.createElement.bind(document)
    originalDevicePixelRatio = window.devicePixelRatio

    // Mock canvas element creation
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName === 'canvas') {
        const canvas = originalCreateElement('canvas')
        vi.spyOn(canvas, 'getContext').mockReturnValue(mockCtx as any)
        return canvas
      }
      return originalCreateElement(tagName)
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    Object.defineProperty(window, 'devicePixelRatio', {
      value: originalDevicePixelRatio,
      writable: true,
    })
  })

  // --- Initialization ---

  describe('initialization', () => {
    it('creates a canvas element', () => {
      const visualStore = createMockVisualStateStore()
      const viewportStore = createMockViewportStore()
      const gridLines = new GridLineCanvas(visualStore, viewportStore)

      expect(gridLines.canvas).toBeInstanceOf(HTMLCanvasElement)
    })

    it('initializes with default border color', () => {
      const visualStore = createMockVisualStateStore()
      const viewportStore = createMockViewportStore()
      const gridLines = new GridLineCanvas(visualStore, viewportStore)

      expect(gridLines.borderColor).toBe('#e5e7eb')
    })

    it('stores device pixel ratio', () => {
      Object.defineProperty(window, 'devicePixelRatio', { value: 2, writable: true })

      const visualStore = createMockVisualStateStore()
      const viewportStore = createMockViewportStore()
      const gridLines = new GridLineCanvas(visualStore, viewportStore)

      expect(gridLines.dpr).toBe(2)
    })

    it('defaults dpr to 1 when devicePixelRatio is undefined', () => {
      Object.defineProperty(window, 'devicePixelRatio', { value: undefined, writable: true })

      const visualStore = createMockVisualStateStore()
      const viewportStore = createMockViewportStore()
      const gridLines = new GridLineCanvas(visualStore, viewportStore)

      expect(gridLines.dpr).toBe(1)
    })
  })

  // --- Mount ---

  describe('mount', () => {
    it('adds sticky wrapper as first child and mounts canvas inside it', () => {
      const visualStore = createMockVisualStateStore()
      const viewportStore = createMockViewportStore()
      const gridLines = new GridLineCanvas(visualStore, viewportStore)

      const container = originalCreateElement('div')
      const existingChild = originalCreateElement('div')
      existingChild.className = 'vibegridx-body'
      container.appendChild(existingChild)

      gridLines.mount(container)

      const firstChild = container.firstChild as HTMLElement
      expect(firstChild).toBeTruthy()
      expect(firstChild.className).toBe('vibegridx-grid-lines-wrapper')
      expect(firstChild.firstChild).toBe(gridLines.canvas)
      expect(container.children.length).toBe(2)
    })

    it('sets correct CSS class on canvas', () => {
      const visualStore = createMockVisualStateStore()
      const viewportStore = createMockViewportStore()
      const gridLines = new GridLineCanvas(visualStore, viewportStore)

      const container = originalCreateElement('div')
      gridLines.mount(container)

      expect(gridLines.canvas.className).toBe('vibegridx-grid-lines')
    })

    it('sets correct inline styles for positioning', () => {
      const visualStore = createMockVisualStateStore()
      const viewportStore = createMockViewportStore()
      const gridLines = new GridLineCanvas(visualStore, viewportStore)

      const container = originalCreateElement('div')
      gridLines.mount(container)

      const wrapper = container.firstChild as HTMLElement
      expect(wrapper.style.position).toBe('sticky')
      expect(wrapper.style.top).toBe('0px')
      expect(wrapper.style.left).toBe('0px')
      expect(wrapper.style.width).toBe('0px')
      expect(wrapper.style.height).toBe('0px')
      expect(wrapper.style.overflow).toBe('visible')
      expect(wrapper.style.pointerEvents).toBe('none')

      expect(gridLines.canvas.style.position).toBe('absolute')
      // jsdom normalizes '0' to '0px' for length properties
      expect(gridLines.canvas.style.top).toBe('0px')
      expect(gridLines.canvas.style.left).toBe('0px')
      expect(gridLines.canvas.style.pointerEvents).toBe('none')
    })
  })

  // --- Canvas Size ---

  describe('updateCanvasSize', () => {
    it('sets canvas internal resolution accounting for DPR', () => {
      Object.defineProperty(window, 'devicePixelRatio', { value: 2, writable: true })

      const viewportStore = createMockViewportStore({
        viewportWidth: 800,
        viewportHeight: 600,
        totalRows: 100, // Enough rows so content exceeds viewport
      })
      const visualStore = createMockVisualStateStore()
      const gridLines = new GridLineCanvas(visualStore, viewportStore)

      gridLines.updateCanvasSize()

      expect(gridLines.canvas.width).toBe(1600) // 800 * 2
      expect(gridLines.canvas.height).toBe(1200) // 600 * 2
    })

    it('sets canvas CSS display size to viewport dimensions', () => {
      const viewportStore = createMockViewportStore({
        viewportWidth: 800,
        viewportHeight: 600,
        totalRows: 100, // Enough rows so content exceeds viewport
      })
      const visualStore = createMockVisualStateStore()
      const gridLines = new GridLineCanvas(visualStore, viewportStore)

      gridLines.updateCanvasSize()

      expect(gridLines.canvas.style.width).toBe('800px')
      expect(gridLines.canvas.style.height).toBe('600px')
    })

    it('clamps canvas height to content height when rows are fewer than viewport', () => {
      const contentH = 3 * RH
      const viewportStore = createMockViewportStore({
        viewportWidth: 800,
        viewportHeight: 600,
        totalRows: 3,
        visibleRowRange: { start: 0, end: 3 },
      })
      const visualStore = createMockVisualStateStore()
      const gridLines = new GridLineCanvas(visualStore, viewportStore)

      gridLines.updateCanvasSize()

      expect(gridLines.canvas.style.height).toBe(`${contentH}px`)
      expect(gridLines.canvas.height).toBe(contentH) // DPR = 1
    })

    it('applies DPR scale to context', () => {
      Object.defineProperty(window, 'devicePixelRatio', { value: 2, writable: true })

      const viewportStore = createMockViewportStore()
      const visualStore = createMockVisualStateStore()
      const gridLines = new GridLineCanvas(visualStore, viewportStore)

      gridLines.updateCanvasSize()

      expect(mockCtx.scale).toHaveBeenCalledWith(2, 2)
    })
  })

  // --- Border Color ---

  describe('updateBorderColor', () => {
    it('reads oklch border color directly from CSS variable', () => {
      const mockGetComputedStyle = vi.fn().mockReturnValue({
        getPropertyValue: vi.fn().mockReturnValue('oklch(0.929 0.013 255.508)'),
      })
      vi.stubGlobal('getComputedStyle', mockGetComputedStyle)

      const visualStore = createMockVisualStateStore()
      const viewportStore = createMockViewportStore()
      const gridLines = new GridLineCanvas(visualStore, viewportStore)

      gridLines.updateBorderColor()

      expect(gridLines.borderColor).toBe('oklch(0.929 0.013 255.508)')
    })

    it('wraps bare HSL components in hsl()', () => {
      const mockGetComputedStyle = vi.fn().mockReturnValue({
        getPropertyValue: vi.fn().mockReturnValue('220 13% 91%'),
      })
      vi.stubGlobal('getComputedStyle', mockGetComputedStyle)

      const visualStore = createMockVisualStateStore()
      const viewportStore = createMockViewportStore()
      const gridLines = new GridLineCanvas(visualStore, viewportStore)

      gridLines.updateBorderColor()

      expect(gridLines.borderColor).toBe('hsl(220 13% 91%)')
    })

    it('uses fallback color if CSS variable not found', () => {
      const mockGetComputedStyle = vi.fn().mockReturnValue({
        getPropertyValue: vi.fn().mockReturnValue(''),
      })
      vi.stubGlobal('getComputedStyle', mockGetComputedStyle)

      const visualStore = createMockVisualStateStore()
      const viewportStore = createMockViewportStore()
      const gridLines = new GridLineCanvas(visualStore, viewportStore)

      gridLines.updateBorderColor()

      expect(gridLines.borderColor).toBe('#e5e7eb')
    })

    it('uses fallback when CSS variable is whitespace only', () => {
      const mockGetComputedStyle = vi.fn().mockReturnValue({
        getPropertyValue: vi.fn().mockReturnValue('   '),
      })
      vi.stubGlobal('getComputedStyle', mockGetComputedStyle)

      const visualStore = createMockVisualStateStore()
      const viewportStore = createMockViewportStore()
      const gridLines = new GridLineCanvas(visualStore, viewportStore)

      gridLines.updateBorderColor()

      expect(gridLines.borderColor).toBe('#e5e7eb')
    })
  })

  // --- Draw: Vertical Lines ---

  describe('draw vertical lines', () => {
    it('draws vertical lines for visible columns', () => {
      const columns: ColumnLayout[] = [
        { id: 'col1', width: 150, xOffset: 70, visible: true, order: 0 },
        { id: 'col2', width: 200, xOffset: 220, visible: true, order: 1 },
      ]
      const visualStore = createMockVisualStateStore({
        visibleColumns: columns,
        visibleColumnRange: { start: 0, end: 2 },
      })
      const viewportStore = createMockViewportStore({
        viewportWidth: 800,
        viewportHeight: 600,
        visibleRowRange: { start: 0, end: 5 },
        scrollLeft: 0,
        scrollTop: 0,
      })
      const gridLines = new GridLineCanvas(visualStore, viewportStore)

      gridLines.draw()

      // Should call moveTo/lineTo for each column border
      // col1 right edge: 70 + 150 - 0 = 220 -> 220.5
      // col2 right edge: 220 + 200 - 0 = 420 -> 420.5
      // Vertical lines clamped to content height: 5 rows * RH
      const contentH = 5 * RH
      expect(mockCtx.beginPath).toHaveBeenCalled()
      expect(mockCtx.moveTo).toHaveBeenCalledWith(220.5, 0)
      expect(mockCtx.lineTo).toHaveBeenCalledWith(220.5, contentH)
      expect(mockCtx.moveTo).toHaveBeenCalledWith(420.5, 0)
      expect(mockCtx.lineTo).toHaveBeenCalledWith(420.5, contentH)
      expect(mockCtx.stroke).toHaveBeenCalled()
    })

    it('adjusts vertical line positions for scrollLeft', () => {
      const columns: ColumnLayout[] = [
        { id: 'col1', width: 150, xOffset: 70, visible: true, order: 0 },
      ]
      const visualStore = createMockVisualStateStore({
        visibleColumns: columns,
        visibleColumnRange: { start: 0, end: 1 },
      })
      const viewportStore = createMockViewportStore({
        viewportWidth: 800,
        viewportHeight: 600,
        visibleRowRange: { start: 0, end: 5 },
        scrollLeft: 50,
        scrollTop: 0,
      })
      const gridLines = new GridLineCanvas(visualStore, viewportStore)

      gridLines.draw()

      // col1 right edge: 70 + 150 - 50 = 170 -> 170.5
      // Vertical lines clamped to content height: 5 rows * RH
      expect(mockCtx.moveTo).toHaveBeenCalledWith(170.5, 0)
      expect(mockCtx.lineTo).toHaveBeenCalledWith(170.5, 5 * RH)
    })

    it('clamps vertical lines to content height when rows do not fill viewport', () => {
      const columns: ColumnLayout[] = [
        { id: 'col1', width: 150, xOffset: 70, visible: true, order: 0 },
      ]
      const visualStore = createMockVisualStateStore({
        visibleColumns: columns,
        visibleColumnRange: { start: 0, end: 1 },
      })
      const viewportStore = createMockViewportStore({
        viewportWidth: 800,
        viewportHeight: 600,
        visibleRowRange: { start: 0, end: 3 },
        totalRows: 3,
        scrollLeft: 0,
        scrollTop: 0,
      })
      const gridLines = new GridLineCanvas(visualStore, viewportStore)

      gridLines.draw()

      // Vertical lines should stop at 3 * RH, NOT extend to 600px
      // col1 right edge: 70 + 150 = 220 -> 220.5
      expect(mockCtx.lineTo).toHaveBeenCalledWith(220.5, 3 * RH)
      // Verify it was NOT called with the full viewport height
      expect(mockCtx.lineTo).not.toHaveBeenCalledWith(220.5, 600)
    })

    it('extends vertical lines to viewport height when rows fill viewport', () => {
      const columns: ColumnLayout[] = [
        { id: 'col1', width: 150, xOffset: 70, visible: true, order: 0 },
      ]
      const visualStore = createMockVisualStateStore({
        visibleColumns: columns,
        visibleColumnRange: { start: 0, end: 1 },
      })
      // 20 rows at RH px each, content exceeds viewport
      const viewportStore = createMockViewportStore({
        viewportWidth: 800,
        viewportHeight: 600,
        visibleRowRange: { start: 0, end: 20 },
        totalRows: 20,
        scrollLeft: 0,
        scrollTop: 0,
      })
      const gridLines = new GridLineCanvas(visualStore, viewportStore)

      gridLines.draw()

      // Vertical lines should extend to full viewport height (600px) since content exceeds it
      expect(mockCtx.lineTo).toHaveBeenCalledWith(220.5, 600)
    })

    it('does not draw when no visible columns', () => {
      const visualStore = createMockVisualStateStore({
        visibleColumns: [],
        visibleColumnRange: { start: 0, end: 0 },
      })
      const viewportStore = createMockViewportStore({
        viewportWidth: 800,
        viewportHeight: 600,
        visibleRowRange: { start: 0, end: 0 },
        scrollLeft: 0,
        scrollTop: 0,
      })
      const gridLines = new GridLineCanvas(visualStore, viewportStore)

      gridLines.draw()

      // beginPath is called for horizontal lines even with 0 rows,
      // but moveTo should not be called for vertical lines if no columns
      // Check that stroke is called but moveTo not called for column positions
      const moveToArgs = (mockCtx.moveTo as ReturnType<typeof vi.fn>).mock.calls
      // No vertical line moveTo calls expected (columns empty)
      // Horizontal might still add calls, but with 0 rows there should be none
      expect(moveToArgs.length).toBe(0)
    })
  })

  // --- Draw: Horizontal Lines ---

  describe('draw horizontal lines', () => {
    it('draws horizontal lines for fixed-height rows', () => {
      const visualStore = createMockVisualStateStore({
        visibleColumns: [],
        visibleColumnRange: { start: 0, end: 0 },
      })
      const viewportStore = createMockViewportStore({
        viewportWidth: 800,
        viewportHeight: 600,
        visibleRowRange: { start: 0, end: 3 },
        rowOffsets: null,
        scrollLeft: 0,
        scrollTop: 0,
      })
      const gridLines = new GridLineCanvas(visualStore, viewportStore)

      gridLines.draw()

      // Row 0 bottom: (0+1)*RH - 0 → RH + 0.5
      // Row 1 bottom: (1+1)*RH - 0 → 2*RH + 0.5
      // Row 2 bottom: (2+1)*RH - 0 → 3*RH + 0.5
      expect(mockCtx.moveTo).toHaveBeenCalledWith(0, 1 * RH + 0.5)
      expect(mockCtx.lineTo).toHaveBeenCalledWith(800, 1 * RH + 0.5)
      expect(mockCtx.moveTo).toHaveBeenCalledWith(0, 2 * RH + 0.5)
      expect(mockCtx.lineTo).toHaveBeenCalledWith(800, 2 * RH + 0.5)
      expect(mockCtx.moveTo).toHaveBeenCalledWith(0, 3 * RH + 0.5)
      expect(mockCtx.lineTo).toHaveBeenCalledWith(800, 3 * RH + 0.5)
    })

    it('adjusts horizontal line positions for scrollTop', () => {
      const visualStore = createMockVisualStateStore({
        visibleColumns: [],
        visibleColumnRange: { start: 0, end: 0 },
      })
      const viewportStore = createMockViewportStore({
        viewportWidth: 800,
        viewportHeight: 600,
        visibleRowRange: { start: 0, end: 2 },
        rowOffsets: null,
        scrollLeft: 0,
        scrollTop: 20,
      })
      const gridLines = new GridLineCanvas(visualStore, viewportStore)

      gridLines.draw()

      // Row 0 bottom: (0+1)*RH - 20 → RH - 20 + 0.5
      // Row 1 bottom: (1+1)*RH - 20 → 2*RH - 20 + 0.5
      expect(mockCtx.moveTo).toHaveBeenCalledWith(0, 1 * RH - 20 + 0.5)
      expect(mockCtx.lineTo).toHaveBeenCalledWith(800, 1 * RH - 20 + 0.5)
      expect(mockCtx.moveTo).toHaveBeenCalledWith(0, 2 * RH - 20 + 0.5)
      expect(mockCtx.lineTo).toHaveBeenCalledWith(800, 2 * RH - 20 + 0.5)
    })

    it('draws horizontal lines for variable-height rows using rowOffsets', () => {
      const visualStore = createMockVisualStateStore({
        visibleColumns: [],
        visibleColumnRange: { start: 0, end: 0 },
      })
      const viewportStore = createMockViewportStore({
        viewportWidth: 800,
        viewportHeight: 600,
        visibleRowRange: { start: 0, end: 2 },
        rowOffsets: [0, 50, 120], // Variable heights
        scrollLeft: 0,
        scrollTop: 0,
      })
      const gridLines = new GridLineCanvas(visualStore, viewportStore)

      gridLines.draw()

      // Variable-height: bottom edge = start of next row
      // Row 0: rowOffsets[1] - 0 = 50 -> 50.5
      // Row 1: rowOffsets[2] - 0 = 120 -> 120.5
      expect(mockCtx.moveTo).toHaveBeenCalledWith(0, 50.5)
      expect(mockCtx.lineTo).toHaveBeenCalledWith(800, 50.5)
      expect(mockCtx.moveTo).toHaveBeenCalledWith(0, 120.5)
      expect(mockCtx.lineTo).toHaveBeenCalledWith(800, 120.5)
    })

    it('falls back gracefully when rowOffsets are sparse', () => {
      const visualStore = createMockVisualStateStore({
        visibleColumns: [],
        visibleColumnRange: { start: 0, end: 0 },
      })
      const viewportStore = createMockViewportStore({
        viewportWidth: 800,
        viewportHeight: 200,
        visibleRowRange: { start: 0, end: 4 },
        rowOffsets: [0, 60], // Partial offsets can appear during synchronization
        totalRows: 4,
        scrollLeft: 0,
        scrollTop: 0,
      })
      const gridLines = new GridLineCanvas(visualStore, viewportStore)

      gridLines.draw()

      // Should still produce finite draw coordinates and include fallback rows
      const moveToCalls = (mockCtx.moveTo as ReturnType<typeof vi.fn>).mock.calls
      expect(
        moveToCalls.every(
          (args) => Number.isFinite(args[0] as number) && Number.isFinite(args[1] as number),
        ),
      ).toBe(true)
      // Sparse fallback: row 2 bottom at offset 60 + RH
      expect(mockCtx.moveTo).toHaveBeenCalledWith(0, 60 + RH + 0.5)

      const fillRectCalls = (mockCtx.fillRect as ReturnType<typeof vi.fn>).mock.calls
      expect(
        fillRectCalls.every(
          (args) =>
            Number.isFinite(args[0] as number) &&
            Number.isFinite(args[1] as number) &&
            Number.isFinite(args[2] as number) &&
            Number.isFinite(args[3] as number),
        ),
      ).toBe(true)
    })
  })

  // --- Draw: Native Scroll Path ---

  describe('drawFromScroll', () => {
    it('uses provided native scroll values when store scroll state is stale', () => {
      const visualStore = createMockVisualStateStore({
        visibleColumns: [{ id: 'col1', width: 150, xOffset: 70, visible: true, order: 0 }],
        visibleColumnRange: { start: 0, end: 1 },
      })
      // Need enough rows so content at scrollTop=200 still exceeds 600px viewport
      // (totalRows * RH - scrollTop) > viewportHeight → totalRows > (600 + 200) / RH
      const totalRows = Math.ceil(900 / RH)
      const viewportStore = createMockViewportStore({
        viewportWidth: 800,
        viewportHeight: 600,
        visibleRowRange: { start: 0, end: totalRows },
        totalRows,
        scrollLeft: 0,
        scrollTop: 0,
      })
      const gridLines = new GridLineCanvas(visualStore, viewportStore)

      // Native scroll listener reports latest values before MobX catches up.
      gridLines.drawFromScroll(100, 200)

      // Vertical line: (70 + 150 - 100) = 120 -> 120.5, extends to viewport height
      expect(mockCtx.moveTo).toHaveBeenCalledWith(120.5, 0)
      expect(mockCtx.lineTo).toHaveBeenCalledWith(120.5, 600)
      // First visible horizontal line at scrollTop=200: first row bottom past scroll
      const firstRowBottom = Math.ceil(200 / RH) * RH - 200
      expect(mockCtx.moveTo).toHaveBeenCalledWith(0, firstRowBottom + 0.5)
      expect(mockCtx.lineTo).toHaveBeenCalledWith(800, firstRowBottom + 0.5)
    })
  })

  // --- Draw: Canvas Transform ---

  describe('draw canvas positioning', () => {
    it('does not set canvas transform; sticky wrapper keeps alignment', () => {
      const visualStore = createMockVisualStateStore({
        visibleColumns: [],
        visibleColumnRange: { start: 0, end: 0 },
      })
      const viewportStore = createMockViewportStore({
        viewportWidth: 800,
        viewportHeight: 600,
        visibleRowRange: { start: 5, end: 10 },
        scrollLeft: 100,
        scrollTop: 200,
      })
      const gridLines = new GridLineCanvas(visualStore, viewportStore)

      gridLines.draw()

      expect(gridLines.canvas.style.transform).toBe('')
    })

    it('clears canvas before drawing', () => {
      const visualStore = createMockVisualStateStore()
      const viewportStore = createMockViewportStore()
      const gridLines = new GridLineCanvas(visualStore, viewportStore)

      gridLines.draw()

      expect(mockCtx.clearRect).toHaveBeenCalled()
    })

    it('resets and re-applies DPR scale on each draw', () => {
      Object.defineProperty(window, 'devicePixelRatio', { value: 2, writable: true })

      const visualStore = createMockVisualStateStore()
      const viewportStore = createMockViewportStore()
      const gridLines = new GridLineCanvas(visualStore, viewportStore)

      gridLines.draw()

      // setTransform resets to identity, then scale re-applies DPR
      expect(mockCtx.setTransform).toHaveBeenCalledWith(1, 0, 0, 1, 0, 0)
      expect(mockCtx.scale).toHaveBeenCalledWith(2, 2)
    })
  })

  // --- Dispose ---

  describe('dispose', () => {
    it('removes canvas from DOM', () => {
      const visualStore = createMockVisualStateStore()
      const viewportStore = createMockViewportStore()
      const gridLines = new GridLineCanvas(visualStore, viewportStore)

      const container = originalCreateElement('div')
      gridLines.mount(container)

      expect(container.children.length).toBe(1)

      gridLines.dispose()

      expect(container.children.length).toBe(0)
    })

    it('can be called safely when canvas is not mounted', () => {
      const visualStore = createMockVisualStateStore()
      const viewportStore = createMockViewportStore()
      const gridLines = new GridLineCanvas(visualStore, viewportStore)

      // Should not throw
      expect(() => gridLines.dispose()).not.toThrow()
    })
  })
})
