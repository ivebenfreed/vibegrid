/**
 * GridLineCanvas - Canvas-based grid line renderer
 *
 * Draws grid lines and alternating row backgrounds on a canvas that sits
 * behind DOM rows. When cells are present, their opaque backgrounds and
 * CSS borders handle rendering. When cells are absent during fast scroll,
 * the canvas provides visual structure (row backgrounds + grid lines).
 *
 * Uses two draw paths:
 *
 * 1. drawFromScroll(scrollLeft, scrollTop) - Called from native scroll
 *    listener with actual DOM scroll values. Calculates visible line
 *    range from geometry, independent of MobX virtual scroll state.
 *    This ensures grid lines stay visible during fast scrolling even
 *    when the DOM virtualizer hasn't caught up.
 *
 * 2. draw() - Called from MobX reactions for non-scroll changes
 *    (column resize, theme change, row expansion, viewport resize).
 *
 * Positioning & layering:
 * - Canvas lives inside a `position: sticky` wrapper within `.vibegridx-viewport`
 * - The browser compositor keeps the wrapper pinned at the viewport origin
 * - No JS transform needed — eliminates compositor-driven scroll lag
 * - Wrapper has no z-index (DOM order: first child → behind rows)
 * - DOM rows paint on top with opaque backgrounds + CSS borders
 * - Canvas only visible where DOM rows are absent (fast scroll gaps)
 *
 * @see planning/specs/1442-canvas-grid-lines-scroll-feedback.md Phase P1
 */

import { GRID_DIMENSIONS } from '../../constants/grid-dimensions'
import type { ColumnLayout, VisualStateStore } from '../../stores/VisualStateStore'
import type { ViewportStore } from '../../stores/ViewportStore'

const DEFAULT_BORDER_COLOR = '#e5e7eb'
const DEFAULT_ALT_ROW_COLOR = '#f4f4f5' // fallback for --muted

/**
 * GridLineCanvas - Draws grid lines and alternating row backgrounds on a canvas
 *
 * Depends on:
 * - VisualStateStore: column layouts, visible column range, scroll position
 * - ViewportStore: visible row range, row offsets, viewport dimensions
 */
export class GridLineCanvas {
  readonly canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private wrapper: HTMLElement | null = null
  borderColor: string = DEFAULT_BORDER_COLOR
  altRowColor: string = DEFAULT_ALT_ROW_COLOR
  dpr: number = 1

  constructor(
    private visualStateStore: VisualStateStore,
    private viewportStore: ViewportStore,
  ) {
    this.canvas = document.createElement('canvas')
    const ctx = this.canvas.getContext('2d')
    if (!ctx) {
      throw new Error('GridLineCanvas: failed to get 2d rendering context')
    }
    this.ctx = ctx
    this.dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
  }

  /**
   * Insert canvas into a sticky wrapper as first child of container.
   *
   * Uses position: sticky on a zero-size wrapper so the browser's compositor
   * keeps the canvas pinned to the viewport origin during scroll - no JS
   * transform needed. This eliminates the 1-frame lag from compositor-driven
   * scrolling that caused grid lines to disappear during fast scroll.
   */
  mount(container: HTMLElement): void {
    // Sticky wrapper: stays pinned at viewport origin, takes no layout space
    this.wrapper = document.createElement('div')
    this.wrapper.className = 'vibegridx-grid-lines-wrapper'
    this.wrapper.style.position = 'sticky'
    this.wrapper.style.top = '0'
    this.wrapper.style.left = '0'
    this.wrapper.style.width = '0'
    this.wrapper.style.height = '0'
    // No z-index needed — wrapper is first child in DOM order, so rows
    // paint on top with their opaque backgrounds + CSS borders. Canvas
    // only shows through where DOM rows are absent (fast scroll).
    this.wrapper.style.overflow = 'visible'
    this.wrapper.style.pointerEvents = 'none'

    // Canvas inside wrapper: positioned absolutely relative to the sticky wrapper
    this.canvas.className = 'vibegridx-grid-lines'
    this.canvas.style.position = 'absolute'
    this.canvas.style.top = '0'
    this.canvas.style.left = '0'
    this.canvas.style.pointerEvents = 'none'

    this.wrapper.appendChild(this.canvas)
    container.insertBefore(this.wrapper, container.firstChild)
  }

  /**
   * Set canvas size to match viewport dimensions.
   * Handles DPR scaling for Retina displays.
   */
  updateCanvasSize(): void {
    const { viewportWidth, viewportHeight } = this.viewportStore

    // Internal resolution (accounts for DPR)
    this.canvas.width = viewportWidth * this.dpr
    this.canvas.height = viewportHeight * this.dpr

    // CSS display size
    this.canvas.style.width = `${viewportWidth}px`
    this.canvas.style.height = `${viewportHeight}px`

    // Scale context for DPR
    this.ctx.scale(this.dpr, this.dpr)
  }

  /**
   * Read border color from CSS custom property `--border`.
   * The variable may be oklch(), hsl(), or bare HSL components - use as-is.
   * Falls back to DEFAULT_BORDER_COLOR if CSS variable not found.
   */
  updateBorderColor(): void {
    const root = document.documentElement
    const computed = getComputedStyle(root)
    const borderVar = computed.getPropertyValue('--border').trim()
    if (borderVar) {
      // Use the value directly if it already contains a color function,
      // hex notation, or CSS var() reference. Only wrap bare HSL components in hsl().
      if (
        /^(oklch|rgb|hsl|hwb|lab|lch)\(/i.test(borderVar) ||
        borderVar.startsWith('#') ||
        borderVar.startsWith('var(')
      ) {
        this.borderColor = borderVar
      } else {
        this.borderColor = `hsl(${borderVar})`
      }
    } else {
      this.borderColor = DEFAULT_BORDER_COLOR
    }

    // Read alternating row background color (--muted)
    const mutedVar = computed.getPropertyValue('--muted').trim()
    if (mutedVar) {
      if (
        /^(oklch|rgb|hsl|hwb|lab|lch)\(/i.test(mutedVar) ||
        mutedVar.startsWith('#') ||
        mutedVar.startsWith('var(')
      ) {
        this.altRowColor = mutedVar
      } else {
        this.altRowColor = `hsl(${mutedVar})`
      }
    } else {
      this.altRowColor = DEFAULT_ALT_ROW_COLOR
    }
  }

  /**
   * Full draw method for non-scroll changes (column resize, theme, viewport resize).
   * Reads scroll from MobX stores and re-reads border color.
   */
  draw(): void {
    this.updateBorderColor()
    const { scrollLeft, scrollTop } = this.visualStateStore
    this.drawInternal(scrollLeft, scrollTop)
  }

  /**
   * Lightweight draw for native scroll events. Uses actual DOM scroll values
   * and calculates visible line range from geometry, independent of MobX
   * virtual scroll state. This ensures grid lines stay visible during fast
   * scrolling even when the DOM virtualizer hasn't caught up.
   */
  drawFromScroll(scrollLeft: number, scrollTop: number): void {
    this.drawInternal(scrollLeft, scrollTop)
  }

  /**
   * Shared draw implementation. Clears canvas, repositions for current scroll,
   * then draws vertical and horizontal grid lines.
   */
  private drawInternal(scrollLeft: number, scrollTop: number): void {
    const { viewportWidth, viewportHeight } = this.viewportStore

    // Reset transform and clear
    this.ctx.setTransform(1, 0, 0, 1, 0, 0)
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)

    // Re-apply DPR scale
    this.ctx.scale(this.dpr, this.dpr)

    // No transform needed - the sticky wrapper keeps the canvas pinned
    // at the viewport origin via the browser's compositor.

    // Paint alternating row backgrounds FIRST (behind everything).
    // During fast scroll, cells are missing but the canvas shows the correct
    // row colors + grid lines, so the transition when cells appear is just
    // text filling in on an already-correct background.
    this.drawRowBackgrounds(viewportWidth, viewportHeight, scrollTop)
    this.drawVerticalLines(viewportWidth, viewportHeight, scrollLeft)
    this.drawHorizontalLines(viewportWidth, viewportHeight, scrollTop)
  }

  /**
   * Paint alternating row backgrounds for odd rows (--muted color).
   * Even rows are left transparent (the canvas clear shows the default background).
   * This provides visual structure during fast scroll when DOM cells are absent.
   */
  private drawRowBackgrounds(canvasWidth: number, _canvasHeight: number, scrollTop: number): void {
    const rowOffsets = this.viewportStore.rowOffsets
    const rowHeight = GRID_DIMENSIONS.ROW_HEIGHT
    const totalRows = this.viewportStore.totalRows
    const viewportHeight = this.viewportStore.viewportHeight

    if (totalRows === 0) return

    let start: number
    let end: number

    if (rowOffsets && rowOffsets.length > 1) {
      start = this.findRowAtOffset(rowOffsets, scrollTop)
      end = this.findRowAtOffset(rowOffsets, scrollTop + viewportHeight) + 2
    } else {
      start = Math.floor(scrollTop / rowHeight)
      end = Math.ceil((scrollTop + viewportHeight) / rowHeight) + 1
    }

    start = Math.max(0, start)
    end = Math.min(totalRows, end)

    this.ctx.fillStyle = this.altRowColor

    for (let i = start; i < end; i++) {
      // Only paint odd rows (alternating pattern)
      if (i % 2 === 0) continue

      let y: number
      let h: number

      if (rowOffsets) {
        y = (rowOffsets[i] ?? i * rowHeight) - scrollTop
        h = i + 1 < rowOffsets.length ? rowOffsets[i + 1] - rowOffsets[i] : rowHeight
      } else {
        y = i * rowHeight - scrollTop
        h = rowHeight
      }

      if (y + h >= 0) {
        this.ctx.fillRect(0, y, canvasWidth, h)
      }
    }
  }

  /**
   * Draw vertical lines at column borders.
   * Uses visibleColumns and visibleColumnRange from VisualStateStore.
   * Column layouts don't change during scroll so MobX values are fine here.
   */
  private drawVerticalLines(canvasWidth: number, canvasHeight: number, scrollLeft: number): void {
    const visibleColumns = this.visualStateStore.visibleColumns
    const { start, end } = this.visualStateStore.visibleColumnRange

    if (visibleColumns.length === 0) return

    this.ctx.beginPath()
    this.ctx.strokeStyle = this.borderColor
    this.ctx.lineWidth = 1

    // Draw left boundary at first visible column's xOffset (CONTENT_OFFSET_X boundary)
    if (start < visibleColumns.length) {
      const leftX = Math.round(visibleColumns[start].xOffset - scrollLeft) + 0.5
      if (leftX >= 0 && leftX <= canvasWidth) {
        this.ctx.moveTo(leftX, 0)
        this.ctx.lineTo(leftX, canvasHeight)
      }
    }

    // Draw right edge of each visible column
    for (let i = start; i < end && i < visibleColumns.length; i++) {
      const col: ColumnLayout = visibleColumns[i]
      const x = Math.round(col.xOffset + col.width - scrollLeft) + 0.5
      if (x >= 0 && x <= canvasWidth) {
        this.ctx.moveTo(x, 0)
        this.ctx.lineTo(x, canvasHeight)
      }
    }

    this.ctx.stroke()
  }

  /**
   * Draw horizontal lines at row borders.
   * Calculates visible range from geometry (scrollTop + viewportHeight + rowHeight)
   * instead of using viewportStore.visibleRowRange, so lines are independent of
   * the MobX virtual scroll lifecycle that controls DOM row creation.
   */
  private drawHorizontalLines(canvasWidth: number, _canvasHeight: number, scrollTop: number): void {
    const rowOffsets = this.viewportStore.rowOffsets
    const rowHeight = GRID_DIMENSIONS.ROW_HEIGHT
    const totalRows = this.viewportStore.totalRows
    const viewportHeight = this.viewportStore.viewportHeight

    if (totalRows === 0) return

    // Calculate visible range from geometry instead of viewportStore.visibleRowRange.
    // This makes grid lines independent of the MobX virtual scroll range that
    // controls which DOM rows exist - so lines stay visible during fast scroll.
    let start: number
    let end: number

    if (rowOffsets && rowOffsets.length > 1) {
      // Variable-height rows: binary search for visible range
      start = this.findRowAtOffset(rowOffsets, scrollTop)
      end = this.findRowAtOffset(rowOffsets, scrollTop + viewportHeight) + 2
    } else {
      // Fixed-height rows: pure arithmetic
      start = Math.floor(scrollTop / rowHeight)
      end = Math.ceil((scrollTop + viewportHeight) / rowHeight) + 1
    }

    start = Math.max(0, start)
    end = Math.min(totalRows, end)

    this.ctx.beginPath()
    this.ctx.strokeStyle = this.borderColor
    this.ctx.lineWidth = 1

    for (let i = start; i < end; i++) {
      let y: number
      if (rowOffsets) {
        if (i + 1 < rowOffsets.length) {
          y = rowOffsets[i + 1] - scrollTop
        } else {
          y = rowOffsets[i] + rowHeight - scrollTop
        }
      } else {
        y = (i + 1) * rowHeight - scrollTop
      }

      y = Math.round(y) + 0.5

      if (y >= 0) {
        this.ctx.moveTo(0, y)
        this.ctx.lineTo(canvasWidth, y)
      }
    }

    this.ctx.stroke()
  }

  /**
   * Binary search to find the row index at a given Y offset.
   * Used for variable-height rows to calculate visible range from geometry.
   */
  private findRowAtOffset(offsets: number[], targetOffset: number): number {
    let left = 0
    let right = offsets.length - 1

    while (left < right) {
      const mid = Math.floor((left + right) / 2)
      if (offsets[mid] < targetOffset) {
        left = mid + 1
      } else {
        right = mid
      }
    }

    return left
  }

  /**
   * Remove canvas and wrapper from DOM and release context.
   */
  dispose(): void {
    if (this.wrapper) {
      this.wrapper.remove()
      this.wrapper = null
    } else {
      this.canvas.remove()
    }
  }
}
