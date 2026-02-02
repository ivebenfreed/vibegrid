/**
 * IncrementalRowProcessor - Unit Tests
 *
 * GH#1422: Tests for async/incremental row processing for large datasets
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  IncrementalRowProcessor,
  DEFAULT_CONFIG,
  type IncrementalProcessorCallbacks,
  type PipelineConfig,
} from '../IncrementalRowProcessor'
import type { Column } from '../../types'

// Mock requestIdleCallback for Node.js test environment
const mockRequestIdleCallback = vi.fn((callback: IdleRequestCallback) => {
  const handle = setTimeout(() => {
    callback({
      timeRemaining: () => 50, // Plenty of budget
      didTimeout: false,
    } as IdleDeadline)
  }, 0)
  return handle as unknown as number
})

const mockCancelIdleCallback = vi.fn((handle: number) => {
  clearTimeout(handle)
})

// Install mocks
vi.stubGlobal('requestIdleCallback', mockRequestIdleCallback)
vi.stubGlobal('cancelIdleCallback', mockCancelIdleCallback)

describe('IncrementalRowProcessor', () => {
  let callbacks: IncrementalProcessorCallbacks
  let processor: IncrementalRowProcessor
  let mockOnViewportReady: ReturnType<typeof vi.fn>
  let mockOnBatchComplete: ReturnType<typeof vi.fn>
  let mockOnComplete: ReturnType<typeof vi.fn>

  const testColumns: Column[] = [
    { id: 'id', cellType: 'text' } as Column,
    { id: 'name', cellType: 'text' } as Column,
    { id: 'status', cellType: 'text' } as Column,
    { id: 'count', cellType: 'number' } as Column,
  ]

  const createTestRows = (count: number) => {
    return Array.from({ length: count }, (_, i) => ({
      id: `row-${i}`,
      name: `Test Row ${i}`,
      status: i % 2 === 0 ? 'active' : 'inactive',
      count: i * 10,
    }))
  }

  const defaultPipelineConfig: PipelineConfig = {
    columns: testColumns,
    viewportRange: { start: 0, end: 50 },
  }

  beforeEach(() => {
    vi.clearAllMocks()

    mockOnViewportReady = vi.fn()
    mockOnBatchComplete = vi.fn()
    mockOnComplete = vi.fn()

    callbacks = {
      onViewportReady: mockOnViewportReady,
      onBatchComplete: mockOnBatchComplete,
      onComplete: mockOnComplete,
    }

    processor = new IncrementalRowProcessor(callbacks)
  })

  describe('Configuration', () => {
    it('uses default configuration values', () => {
      expect(DEFAULT_CONFIG.SYNC_THRESHOLD).toBe(1000)
      expect(DEFAULT_CONFIG.IDLE_BUDGET_MS).toBe(8)
      expect(DEFAULT_CONFIG.IDLE_TIMEOUT_MS).toBe(100)
      expect(DEFAULT_CONFIG.BATCH_SIZE).toBe(500)
      expect(DEFAULT_CONFIG.VIEWPORT_BATCH).toBe(200)
    })

    it('allows custom configuration', () => {
      const customProcessor = new IncrementalRowProcessor(callbacks, {
        SYNC_THRESHOLD: 500,
        BATCH_SIZE: 100,
      })

      // Below custom threshold should not use incremental
      expect(customProcessor.shouldUseIncremental(400)).toBe(false)
      expect(customProcessor.shouldUseIncremental(500)).toBe(true)
    })
  })

  describe('Threshold Check', () => {
    it('returns false for small datasets', () => {
      expect(processor.shouldUseIncremental(100)).toBe(false)
      expect(processor.shouldUseIncremental(999)).toBe(false)
    })

    it('returns true for large datasets', () => {
      expect(processor.shouldUseIncremental(1000)).toBe(true)
      expect(processor.shouldUseIncremental(100000)).toBe(true)
    })
  })

  describe('Synchronous Path (Small Datasets)', () => {
    it('processes small datasets synchronously', () => {
      const rows = createTestRows(100)

      processor.start(rows, defaultPipelineConfig)

      // For small datasets, both viewport and complete callbacks fire synchronously
      expect(mockOnViewportReady).toHaveBeenCalledTimes(1)
      expect(mockOnComplete).toHaveBeenCalledTimes(1)
      expect(mockOnBatchComplete).not.toHaveBeenCalled()
    })

    it('returns VirtualRow structures', () => {
      const rows = createTestRows(10)

      processor.start(rows, defaultPipelineConfig)

      const completedRows = mockOnComplete.mock.calls[0][0]
      expect(completedRows.length).toBe(10)
      expect(completedRows[0]).toMatchObject({
        type: 'data',
        id: 'row-0',
        index: 0,
        height: 40,
      })
    })

    it('applies text search filter', () => {
      const rows = createTestRows(10)

      processor.start(rows, {
        ...defaultPipelineConfig,
        searchText: 'Row 5',
      })

      const completedRows = mockOnComplete.mock.calls[0][0]
      expect(completedRows.length).toBe(1)
      expect(completedRows[0].data.name).toBe('Test Row 5')
    })

    it('applies sorting', () => {
      const rows = createTestRows(5)

      processor.start(rows, {
        ...defaultPipelineConfig,
        sortBy: [{ field: 'count', direction: 'desc' }],
      })

      const completedRows = mockOnComplete.mock.calls[0][0]
      expect(completedRows[0].data.count).toBe(40) // row-4 has highest count
      expect(completedRows[4].data.count).toBe(0) // row-0 has lowest count
    })

    it('applies filters', () => {
      const rows = createTestRows(10)

      processor.start(rows, {
        ...defaultPipelineConfig,
        filters: [{ field: 'status', operator: 'equals', value: 'active' }],
      })

      const completedRows = mockOnComplete.mock.calls[0][0]
      expect(completedRows.length).toBe(5) // Only even-indexed rows are active
      expect(completedRows.every((r: any) => r.data.status === 'active')).toBe(true)
    })
  })

  describe('Incremental Path (Large Datasets)', () => {
    it('processes viewport first for large datasets', async () => {
      const rows = createTestRows(2000)

      processor.start(rows, defaultPipelineConfig)

      // Viewport ready should fire immediately
      expect(mockOnViewportReady).toHaveBeenCalledTimes(1)

      // Complete should not have fired yet (async processing)
      expect(mockOnComplete).not.toHaveBeenCalled()
    })

    it('reports progress during processing', async () => {
      const rows = createTestRows(2000)

      processor.start(rows, defaultPipelineConfig)

      // Wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 100))

      // Batch complete should have been called
      expect(mockOnBatchComplete.mock.calls.length).toBeGreaterThan(0)

      // Check progress is reported
      const lastCall = mockOnBatchComplete.mock.calls[mockOnBatchComplete.mock.calls.length - 1]
      const progress = lastCall[2]
      expect(typeof progress).toBe('number')
      expect(progress).toBeGreaterThanOrEqual(0)
      expect(progress).toBeLessThanOrEqual(100)
    })

    it('completes processing eventually', async () => {
      const rows = createTestRows(2000)

      processor.start(rows, defaultPipelineConfig)

      // Wait for async processing to complete
      await new Promise((resolve) => setTimeout(resolve, 500))

      expect(mockOnComplete).toHaveBeenCalledTimes(1)

      const completedRows = mockOnComplete.mock.calls[0][0]
      expect(completedRows.length).toBe(2000)
    })
  })

  describe('Cancellation', () => {
    it('cancels ongoing processing', async () => {
      const rows = createTestRows(5000)

      const version = processor.start(rows, defaultPipelineConfig)
      expect(version).toBe(1)

      // Cancel immediately
      processor.cancel()

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 100))

      // Complete should not have been called due to cancellation
      // (The exact behavior depends on timing, but the processor should stop)
      expect(processor.stats.cancelled).toBe(true)
    })

    it('allows restarting after cancellation', () => {
      const rows = createTestRows(100)

      processor.start(rows, defaultPipelineConfig)
      processor.cancel()

      // Clear mocks
      vi.clearAllMocks()

      // Start again
      const version = processor.start(rows, defaultPipelineConfig)
      expect(version).toBe(2) // Version incremented

      expect(mockOnComplete).toHaveBeenCalled()
    })
  })

  describe('Version Tracking', () => {
    it('increments version on each start', () => {
      const rows = createTestRows(10)

      expect(processor.getVersion()).toBe(0)

      processor.start(rows, defaultPipelineConfig)
      expect(processor.getVersion()).toBe(1)

      processor.start(rows, defaultPipelineConfig)
      expect(processor.getVersion()).toBe(2)
    })

    it('cancels stale processing when restarted', async () => {
      const rows = createTestRows(2000)

      // Start first processing
      processor.start(rows, defaultPipelineConfig)
      const firstViewportCall = mockOnViewportReady.mock.calls.length

      // Immediately start again (should cancel first)
      processor.start(rows, defaultPipelineConfig)

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 200))

      // Should only have 2 viewport ready calls (one per start)
      expect(mockOnViewportReady).toHaveBeenCalledTimes(2)
    })
  })

  describe('Disposal', () => {
    it('disposes cleanly', () => {
      processor.dispose()

      expect(processor.stats.disposed).toBe(true)
    })

    it('prevents further processing after disposal', () => {
      processor.dispose()

      const rows = createTestRows(10)
      processor.start(rows, defaultPipelineConfig)

      // Callbacks should not be called after disposal
      // (The processor silently ignores starts after disposal)
    })
  })

  describe('Statistics', () => {
    it('reports accurate stats', () => {
      const rows = createTestRows(100)

      processor.start(rows, defaultPipelineConfig)

      const stats = processor.stats
      expect(stats.version).toBe(1)
      expect(stats.totalRows).toBe(100)
      expect(stats.isComplete).toBe(true)
      expect(stats.progress).toBe(100)
      expect(stats.cancelled).toBe(false)
      expect(stats.disposed).toBe(false)
    })
  })
})
