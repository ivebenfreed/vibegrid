/**
 * RowPreRenderBuffer Tests
 *
 * Tests for the row pre-render buffer that builds full row DOM elements
 * during idle time for scroll performance.
 * GH#1437
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RowPreRenderBuffer, type RowBuildContext } from '../RowPreRenderBuffer'

// --- Helpers ---

function createMockRow(index: number): HTMLElement {
  const dataset: Record<string, string> = { rowIndex: String(index) }
  const el = {
    className: 'vibegridx-row',
    dataset,
    style: { transform: `translateY(${index * 40}px)` },
    tagName: 'DIV',
  } as unknown as HTMLElement
  return el
}

function createMockContext(totalRows = 100): RowBuildContext {
  return {
    buildRow: vi.fn((rowIndex: number) => {
      if (rowIndex < 0 || rowIndex >= totalRows) return null
      return createMockRow(rowIndex)
    }),
    totalRows: vi.fn(() => totalRows),
  }
}

// --- Setup ---

beforeEach(() => {
  vi.spyOn(performance, 'now').mockReturnValue(0)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

// ====================================
// TESTS
// ====================================

describe('RowPreRenderBuffer', () => {
  let buffer: RowPreRenderBuffer

  beforeEach(() => {
    buffer = new RowPreRenderBuffer()
  })

  afterEach(() => {
    buffer.dispose()
  })

  // --- Initialization ---

  describe('initialization', () => {
    it('creates with empty buffer', () => {
      expect(buffer.stats.bufferSize).toBe(0)
      expect(buffer.stats.queueSize).toBe(0)
      expect(buffer.stats.disposed).toBe(false)
    })

    it('accepts context via setContext', () => {
      const ctx = createMockContext()
      buffer.setContext(ctx)
      expect(buffer.stats.disposed).toBe(false)
    })
  })

  // --- Buffer hit/miss ---

  describe('getRow', () => {
    it('returns null on buffer miss', () => {
      buffer.setContext(createMockContext())
      expect(buffer.getRow(5)).toBeNull()
    })

    it('returns pre-built element on buffer hit', () => {
      vi.useFakeTimers()
      const freshBuffer = new RowPreRenderBuffer()
      const ctx = createMockContext()
      freshBuffer.setContext(ctx)

      // Queue rows and process them
      freshBuffer.queueAhead({ start: 0, end: 10 }, 'down', 100)

      // Advance timers to trigger rIC fallback
      vi.advanceTimersByTime(10)

      // Should have some rows in the buffer
      const row = freshBuffer.getRow(10)
      expect(row).not.toBeNull()
      expect(row).toHaveProperty('className', 'vibegridx-row')

      freshBuffer.dispose()
    })

    it('consumes row on hit (removes from buffer)', () => {
      vi.useFakeTimers()
      const freshBuffer = new RowPreRenderBuffer()
      const ctx = createMockContext()
      freshBuffer.setContext(ctx)

      freshBuffer.queueAhead({ start: 0, end: 10 }, 'down', 100)
      vi.advanceTimersByTime(10)

      const initialSize = freshBuffer.stats.bufferSize

      // First get should return the row
      const row = freshBuffer.getRow(10)
      expect(row).not.toBeNull()

      // Second get should miss (consumed)
      expect(freshBuffer.getRow(10)).toBeNull()

      // Buffer size should have decreased
      expect(freshBuffer.stats.bufferSize).toBeLessThan(initialSize)

      freshBuffer.dispose()
    })
  })

  // --- Queue ahead ---

  describe('queueAhead', () => {
    it('queues rows ahead when scrolling down', () => {
      const ctx = createMockContext()
      buffer.setContext(ctx)

      buffer.queueAhead({ start: 0, end: 10 }, 'down', 100)

      expect(buffer.stats.queueSize).toBeGreaterThan(0)
    })

    it('queues rows behind when scrolling up', () => {
      const ctx = createMockContext()
      buffer.setContext(ctx)

      buffer.queueAhead({ start: 20, end: 30 }, 'up', 100)

      expect(buffer.stats.queueSize).toBeGreaterThan(0)
    })

    it('does not queue already buffered rows', () => {
      vi.useFakeTimers()
      const freshBuffer = new RowPreRenderBuffer()
      const ctx = createMockContext()
      freshBuffer.setContext(ctx)

      // Queue and fill — from start=0, no secondary rows before 0
      freshBuffer.queueAhead({ start: 0, end: 10 }, 'down', 100)
      vi.advanceTimersByTime(100)

      // Queue same range again — all rows already buffered, no new secondary (start=0)
      freshBuffer.queueAhead({ start: 0, end: 10 }, 'down', 100)

      // Queue size should be 0 since all rows are already buffered
      expect(freshBuffer.stats.queueSize).toBe(0)

      freshBuffer.dispose()
    })

    it('does not queue when disposed', () => {
      const ctx = createMockContext()
      buffer.setContext(ctx)
      buffer.dispose()

      buffer.queueAhead({ start: 0, end: 10 }, 'down', 100)
      expect(buffer.stats.queueSize).toBe(0)
    })

    it('does not queue without context', () => {
      buffer.queueAhead({ start: 0, end: 10 }, 'down', 100)
      expect(buffer.stats.queueSize).toBe(0)
    })

    it('clamps to totalRows when scrolling down', () => {
      const ctx = createMockContext(15)
      buffer.setContext(ctx)

      buffer.queueAhead({ start: 0, end: 10 }, 'down', 15)

      // Primary: 5 rows beyond range (10-14), Secondary: 0 rows before range (start=0)
      expect(buffer.stats.queueSize).toBe(5)
    })

    it('clamps to 0 when scrolling up', () => {
      const ctx = createMockContext()
      buffer.setContext(ctx)

      buffer.queueAhead({ start: 5, end: 15 }, 'up', 100)

      // Primary: 5 rows before range (0-4), Secondary: 20 rows after range (15-34)
      expect(buffer.stats.queueSize).toBe(25)
    })

    it('queues rows in both directions', () => {
      const ctx = createMockContext(200)
      buffer.setContext(ctx)

      buffer.queueAhead({ start: 50, end: 70 }, 'down', 200)

      // Primary: 40 rows after (70-109), Secondary: 20 rows before (30-49) = 60
      expect(buffer.stats.queueSize).toBe(60)
    })
  })

  // --- Invalidation ---

  describe('invalidate', () => {
    it('clears buffer and queue', () => {
      vi.useFakeTimers()
      const freshBuffer = new RowPreRenderBuffer()
      const ctx = createMockContext()
      freshBuffer.setContext(ctx)

      freshBuffer.queueAhead({ start: 0, end: 10 }, 'down', 100)
      vi.advanceTimersByTime(100)

      expect(freshBuffer.stats.bufferSize).toBeGreaterThan(0)

      freshBuffer.invalidate()

      expect(freshBuffer.stats.bufferSize).toBe(0)
      expect(freshBuffer.stats.queueSize).toBe(0)

      freshBuffer.dispose()
    })
  })

  // --- Dispose ---

  describe('dispose', () => {
    it('marks buffer as disposed', () => {
      buffer.dispose()
      expect(buffer.stats.disposed).toBe(true)
    })

    it('clears buffer on dispose', () => {
      vi.useFakeTimers()
      const freshBuffer = new RowPreRenderBuffer()
      freshBuffer.setContext(createMockContext())
      freshBuffer.queueAhead({ start: 0, end: 10 }, 'down', 100)
      vi.advanceTimersByTime(100)

      freshBuffer.dispose()

      expect(freshBuffer.stats.bufferSize).toBe(0)
      expect(freshBuffer.stats.queueSize).toBe(0)
    })
  })

  // --- Idle callback processing ---

  describe('idle callback processing', () => {
    it('builds rows during idle callback', () => {
      vi.useFakeTimers()
      const freshBuffer = new RowPreRenderBuffer()
      const ctx = createMockContext()
      freshBuffer.setContext(ctx)

      freshBuffer.queueAhead({ start: 0, end: 10 }, 'down', 100)

      // Before idle fires
      expect(freshBuffer.stats.bufferSize).toBe(0)

      // Advance timers to trigger rIC fallback
      vi.advanceTimersByTime(10)

      // After idle fires — some rows should be buffered
      expect(freshBuffer.stats.bufferSize).toBeGreaterThan(0)
      expect(ctx.buildRow).toHaveBeenCalled()

      freshBuffer.dispose()
    })

    it('respects budget and re-schedules remaining', () => {
      vi.useFakeTimers()
      const freshBuffer = new RowPreRenderBuffer()
      const ctx = createMockContext()
      freshBuffer.setContext(ctx)

      freshBuffer.queueAhead({ start: 0, end: 10 }, 'down', 100)

      // Simulate time exceeding budget after first row
      let callCount = 0
      vi.spyOn(performance, 'now').mockImplementation(() => {
        callCount++
        // First call: start = 0, second call: budget check passes
        if (callCount <= 2) return 0
        // Third call: exceeds 8ms budget
        return 10
      })

      vi.advanceTimersByTime(10)

      // At least 1 row built, but not all (budget exceeded)
      expect(freshBuffer.stats.bufferSize).toBeGreaterThanOrEqual(1)

      freshBuffer.dispose()
    })

    it('skips rows beyond totalRows', () => {
      vi.useFakeTimers()
      const freshBuffer = new RowPreRenderBuffer()
      const ctx = createMockContext(12)
      freshBuffer.setContext(ctx)

      freshBuffer.queueAhead({ start: 0, end: 10 }, 'down', 12)
      vi.advanceTimersByTime(100)

      // Should only build rows 10 and 11 (not beyond totalRows=12)
      expect(freshBuffer.stats.bufferSize).toBe(2)

      freshBuffer.dispose()
    })
  })

  // --- Stats ---

  describe('stats', () => {
    it('reports buffer and queue sizes accurately', () => {
      const ctx = createMockContext()
      buffer.setContext(ctx)

      buffer.queueAhead({ start: 0, end: 10 }, 'down', 100)

      expect(buffer.stats.queueSize).toBeGreaterThan(0)
      expect(buffer.stats.bufferSize).toBe(0)
      expect(buffer.stats.disposed).toBe(false)
    })

    it('reports disposed state', () => {
      buffer.dispose()
      expect(buffer.stats.disposed).toBe(true)
    })
  })
})
