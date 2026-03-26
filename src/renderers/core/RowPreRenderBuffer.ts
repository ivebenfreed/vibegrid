/**
 * RowPreRenderBuffer - Pre-renders full row DOM elements during idle time
 *
 * Replaces CellUpgradeScheduler. Instead of shell→rich cell upgrades,
 * this builds complete row elements during rIC callbacks so that
 * at scroll time we just appendChild + update transform.
 *
 * On buffer miss: falls back to full row creation (same as before).
 *
 * Target: 0.01ms/row at scroll time (vs 0.5ms for creating from scratch)
 *
 * GH#1437 - Row Pre-Render Buffer
 */

import { getLogger } from '@/shared/lib/logging'

const log = getLogger(['custom', 'vibegrid', 'renderers', 'core', 'RowPreRenderBuffer.ts'])

// rIC fallback for browsers without support (same pattern as CellUpgradeScheduler used)
const scheduleIdle: typeof requestIdleCallback =
  typeof requestIdleCallback !== 'undefined'
    ? requestIdleCallback
    : (((cb: IdleRequestCallback) =>
        setTimeout(
          () => cb({ timeRemaining: () => 8, didTimeout: false } as IdleDeadline),
          1,
        )) as unknown as typeof requestIdleCallback)

const cancelIdle: typeof cancelIdleCallback =
  typeof cancelIdleCallback !== 'undefined'
    ? cancelIdleCallback
    : (clearTimeout as unknown as typeof cancelIdleCallback)

export interface RowBuildContext {
  /** Build a complete row element for the given row index. Returns null if index is invalid. */
  buildRow: (rowIndex: number) => HTMLElement | null
  /** Total number of rows in current dataset */
  totalRows: () => number
}

export class RowPreRenderBuffer {
  private buffer: Map<number, HTMLElement> = new Map() // rowIndex → pre-rendered row
  private queue: number[] = [] // indices to pre-render next
  private ricId: number | null = null // requestIdleCallback handle
  private kickstartId: ReturnType<typeof setTimeout> | null = null // eager timeout handle
  private disposed = false
  private ctx: RowBuildContext | null = null

  // Configuration — tuned for desktop grids with 30-60 visible rows
  private readonly LOOKAHEAD = 40 // How many rows in primary scroll direction
  private readonly LOOKAHEAD_SECONDARY = 20 // How many rows in opposite direction
  private readonly BUDGET_MS = 8 // Time budget per idle callback
  private readonly MAX_BUFFER_SIZE = 200 // Max rows to keep buffered

  /**
   * Set the build context. Must be called before queueAhead().
   */
  setContext(ctx: RowBuildContext): void {
    this.ctx = ctx
    log.info('📋 RowPreRenderBuffer context set')
  }

  /**
   * Called by SimplePassiveRenderer after each scroll update.
   * Queues rows in BOTH directions around the viewport, prioritizing the scroll direction.
   *
   * @param currentRange The currently rendered row range { start, end }
   * @param scrollDirection 'down' | 'up'
   * @param totalRows Total rows in dataset
   */
  queueAhead(currentRange: { start: number; end: number }, scrollDirection: 'down' | 'up', totalRows: number): void {
    if (this.disposed || !this.ctx) return

    const newQueue: number[] = []

    // Primary direction gets full LOOKAHEAD, secondary gets LOOKAHEAD_SECONDARY
    const primaryCount = this.LOOKAHEAD
    const secondaryCount = this.LOOKAHEAD_SECONDARY

    if (scrollDirection === 'down') {
      // Primary: rows AFTER the current range
      for (let i = currentRange.end; i < Math.min(currentRange.end + primaryCount, totalRows); i++) {
        if (!this.buffer.has(i)) {
          newQueue.push(i)
        }
      }
      // Secondary: rows BEFORE the current range
      for (let i = currentRange.start - 1; i >= Math.max(currentRange.start - secondaryCount, 0); i--) {
        if (!this.buffer.has(i)) {
          newQueue.push(i)
        }
      }
    } else {
      // Primary: rows BEFORE the current range
      for (let i = currentRange.start - 1; i >= Math.max(currentRange.start - primaryCount, 0); i--) {
        if (!this.buffer.has(i)) {
          newQueue.push(i)
        }
      }
      // Secondary: rows AFTER the current range
      for (let i = currentRange.end; i < Math.min(currentRange.end + secondaryCount, totalRows); i++) {
        if (!this.buffer.has(i)) {
          newQueue.push(i)
        }
      }
    }

    // Evict buffer entries far from the current range
    this.evictDistant(currentRange, totalRows)

    if (newQueue.length > 0) {
      // Merge with existing queue: new items take priority (prepend), deduplicate
      const existing = new Set(newQueue)
      for (const idx of this.queue) {
        if (!existing.has(idx)) {
          newQueue.push(idx)
          existing.add(idx)
        }
      }
      this.queue = newQueue
      this.ensureProcessing()
    }
  }

  /**
   * Called by updateVirtualRows to get a pre-built row (or null on miss).
   * On hit, the row is REMOVED from the buffer (consumed).
   */
  getRow(rowIndex: number): HTMLElement | null {
    const row = this.buffer.get(rowIndex)
    if (row) {
      this.buffer.delete(rowIndex)
      log.debug('✅ Buffer HIT', { rowIndex, remaining: this.buffer.size })
      return row
    }
    return null
  }

  /**
   * Called on data/column changes to clear stale pre-rendered rows.
   */
  invalidate(): void {
    log.info('🧹 Buffer invalidated', { cleared: this.buffer.size })
    this.buffer.clear()
    this.queue = []
    this.cancelScheduled()
  }

  /**
   * Dispose the buffer. No further pre-rendering will happen.
   */
  dispose(): void {
    this.invalidate()
    this.disposed = true
    this.ctx = null
  }

  // --- Private ---

  private cancelScheduled(): void {
    if (this.ricId !== null) {
      cancelIdle(this.ricId)
      this.ricId = null
    }
    if (this.kickstartId !== null) {
      clearTimeout(this.kickstartId)
      this.kickstartId = null
    }
  }

  private ensureProcessing(): void {
    if (this.disposed) return

    // Schedule rIC for main processing (runs during idle time)
    if (this.ricId === null) {
      this.ricId = scheduleIdle(
        (deadline) => {
          this.ricId = null
          this.processQueue(deadline)
        },
        { timeout: 100 },
      )
    }

    // Also schedule an eager kickstart via setTimeout(0) for faster first batch.
    // This fires sooner than rIC (next microtask vs next idle period), ensuring
    // the buffer starts filling immediately after scroll settles.
    if (this.kickstartId === null) {
      this.kickstartId = setTimeout(() => {
        this.kickstartId = null
        if (this.disposed || this.queue.length === 0) return
        // Build a small batch eagerly (4ms budget — half a frame)
        this.processQueue({ timeRemaining: () => 4, didTimeout: false } as IdleDeadline)
      }, 0)
    }
  }

  private processQueue(deadline: IdleDeadline): void {
    if (this.disposed || !this.ctx || this.queue.length === 0) return

    const budget = Math.min(deadline.timeRemaining(), this.BUDGET_MS)
    const start = performance.now()
    let processed = 0

    while (this.queue.length > 0 && performance.now() - start < budget) {
      const rowIndex = this.queue.shift()!

      // Skip if already buffered or if totalRows changed
      if (this.buffer.has(rowIndex) || rowIndex >= this.ctx.totalRows()) {
        continue
      }

      const rowElement = this.ctx.buildRow(rowIndex)
      if (rowElement) {
        this.buffer.set(rowIndex, rowElement)
        processed++
      }
    }

    if (processed > 0) {
      log.debug(`rIC: pre-rendered ${processed} rows, buffer=${this.buffer.size}, queue=${this.queue.length}`)
    }

    // Continue if more remain — schedule another rIC (not kickstart, to avoid hogging main thread)
    if (this.queue.length > 0 && this.ricId === null) {
      this.ricId = scheduleIdle(
        (deadline) => {
          this.ricId = null
          this.processQueue(deadline)
        },
        { timeout: 100 },
      )
    }
  }

  /**
   * Evict buffer entries that are far from the current render range.
   */
  private evictDistant(currentRange: { start: number; end: number }, _totalRows: number): void {
    if (this.buffer.size <= this.MAX_BUFFER_SIZE) return

    const margin = this.LOOKAHEAD * 2
    const low = currentRange.start - margin
    const high = currentRange.end + margin

    for (const idx of this.buffer.keys()) {
      if (idx < low || idx > high) {
        this.buffer.delete(idx)
      }
    }
  }

  // --- Diagnostics ---

  get stats(): {
    bufferSize: number
    queueSize: number
    disposed: boolean
  } {
    return {
      bufferSize: this.buffer.size,
      queueSize: this.queue.length,
      disposed: this.disposed,
    }
  }
}
