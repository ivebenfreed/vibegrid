import { beforeEach, describe, expect, it, vi } from 'vitest'
import { configure, reaction, runInAction } from 'mobx'

// Mock DisposerManager
vi.mock('@/app/stores/utils/disposer', () => ({
  DisposerManager: class MockDisposerManager {
    private disposers: Array<() => void> = []
    add(disposer: () => void) {
      this.disposers.push(disposer)
    }
    dispose() {
      for (const d of this.disposers) d()
      this.disposers = []
    }
  },
}))

// Mock logger
vi.mock('@/shared/lib/logging', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

import { ViewportStore } from '../ViewportStore'
import { GRID_DIMENSIONS } from '../../constants/grid-dimensions'

const ROW_HEIGHT = GRID_DIMENSIONS.ROW_HEIGHT

// MobX strict mode (matches project config)
configure({ enforceActions: 'always' })

describe('ViewportStore', () => {
  let store: ViewportStore

  beforeEach(() => {
    store = new ViewportStore()
  })

  describe('initial state', () => {
    it('should have zero scroll positions', () => {
      expect(store.scrollTop).toBe(0)
      expect(store.scrollLeft).toBe(0)
    })

    it('should have zero viewport dimensions', () => {
      expect(store.viewportWidth).toBe(0)
      expect(store.viewportHeight).toBe(0)
    })

    it('should have zero content dimensions', () => {
      expect(store.totalContentWidth).toBe(0)
      expect(store.totalContentHeight).toBe(0)
    })

    it('should have null row offsets', () => {
      expect(store.rowOffsets).toBeNull()
    })

    it('should have zero totalRows', () => {
      expect(store.totalRows).toBe(0)
    })
  })

  describe('updateScroll', () => {
    it('should update scroll positions', () => {
      runInAction(() => {
        store.updateScroll(100, 50)
      })
      expect(store.scrollTop).toBe(100)
      expect(store.scrollLeft).toBe(50)
    })

    it('should trigger MobX reactions', () => {
      const scrollValues: Array<{ top: number; left: number }> = []
      const dispose = reaction(
        () => ({ top: store.scrollTop, left: store.scrollLeft }),
        (val) => scrollValues.push(val),
      )

      runInAction(() => store.updateScroll(200, 100))
      expect(scrollValues).toHaveLength(1)
      expect(scrollValues[0]).toEqual({ top: 200, left: 100 })

      dispose()
    })
  })

  describe('updateViewportSize', () => {
    it('should update viewport dimensions', () => {
      runInAction(() => {
        store.updateViewportSize(800, 600)
      })
      expect(store.viewportWidth).toBe(800)
      expect(store.viewportHeight).toBe(600)
    })
  })

  describe('updateContentSize', () => {
    it('should update content dimensions', () => {
      runInAction(() => {
        store.updateContentSize(2000, 5000)
      })
      expect(store.totalContentWidth).toBe(2000)
      expect(store.totalContentHeight).toBe(5000)
    })
  })

  describe('setRowOffsets / clearRowOffsets', () => {
    it('should set row offsets', () => {
      const offsets = [0, 40, 80, 120, 200]
      runInAction(() => {
        store.setRowOffsets(offsets)
      })
      expect(store.rowOffsets).toEqual(offsets)
    })

    it('should clear row offsets', () => {
      runInAction(() => {
        store.setRowOffsets([0, 40, 80])
        store.clearRowOffsets()
      })
      expect(store.rowOffsets).toBeNull()
    })
  })

  describe('totalRows', () => {
    it('should compute totalRows from rowOffsets', () => {
      runInAction(() => {
        store.setRowOffsets([0, 40, 80, 120, 160])
      })
      expect(store.totalRows).toBe(4)
    })

    it('should compute totalRows from content height when no offsets', () => {
      const contentHeight = ROW_HEIGHT * 50
      runInAction(() => {
        store.updateContentSize(800, contentHeight)
      })
      expect(store.totalRows).toBe(50)
    })

    it('should return 0 when no data', () => {
      expect(store.totalRows).toBe(0)
    })
  })

  describe('visibleRowRange', () => {
    it('should calculate visible row range for fixed height rows', () => {
      runInAction(() => {
        // 800px viewport, scrolled to top
        store.updateViewportSize(1000, 800)
        store.updateContentSize(1000, 4000) // 100 rows at 40px
        store.updateScroll(0, 0)
      })

      const range = store.visibleRowRange
      expect(range.start).toBe(0) // start - buffer clamped to 0
      expect(range.end).toBeGreaterThan(0) // some rows visible
    })

    it('should offset visible range when scrolled', () => {
      const scrollTop = ROW_HEIGHT * 15 // Scroll past 15 rows
      runInAction(() => {
        store.updateViewportSize(1000, 400)
        store.updateContentSize(1000, ROW_HEIGHT * 100) // 100 rows
        store.updateScroll(scrollTop, 0)
      })

      const range = store.visibleRowRange
      // At scrollTop = 15*RH, row 15 is at top. With buffer of 10: start = 5
      expect(range.start).toBe(5)
      // visible rows + buffer extends past row 15
      expect(range.end).toBeGreaterThan(15)
    })

    it('should use binary search with rowOffsets', () => {
      const offsets = Array.from({ length: 50 }, (_, i) => i * 40)
      runInAction(() => {
        store.setRowOffsets(offsets)
        store.updateViewportSize(1000, 400)
        store.updateScroll(200, 0) // Row 5 at top
      })

      const range = store.visibleRowRange
      expect(range.start).toBeGreaterThanOrEqual(0)
      expect(range.end).toBeLessThanOrEqual(50)
    })

    it('should use tableCoreStore.findRowAtScrollPosition when available', () => {
      const mockTableCoreStore = {
        findRowAtScrollPosition: vi.fn((scrollTop: number) => Math.floor(scrollTop / 40)),
      }

      store.setTableCoreStore(
        mockTableCoreStore as unknown as import('../TableCoreStore').TableCoreStore,
      )

      runInAction(() => {
        store.updateViewportSize(1000, 400)
        store.updateContentSize(1000, 4000)
        store.updateScroll(200, 0)
      })

      const range = store.visibleRowRange
      expect(mockTableCoreStore.findRowAtScrollPosition).toHaveBeenCalled()
      expect(range.start).toBeGreaterThanOrEqual(0)
    })
  })

  describe('isRowVisible', () => {
    it('should detect visible rows', () => {
      runInAction(() => {
        store.updateViewportSize(1000, 400)
        store.updateContentSize(1000, 4000)
        store.updateScroll(0, 0)
      })

      const range = store.visibleRowRange
      // A row within visible range should be visible
      expect(store.isRowVisible(range.start + 1)).toBe(true)
    })

    it('should detect non-visible rows', () => {
      runInAction(() => {
        store.updateViewportSize(1000, 400)
        store.updateContentSize(1000, 4000)
        store.updateScroll(0, 0)
      })

      // A row far beyond the viewport should not be visible
      expect(store.isRowVisible(999)).toBe(false)
    })
  })

  describe('getCellPosition', () => {
    it('should return null when no coordinate manager is set', () => {
      expect(store.getCellPosition('row1', 'col1')).toBeNull()
    })

    it('should delegate to coordinate manager', () => {
      const mockCoordManager = {
        cellRefToPosition: vi.fn(() => ({ rowIndex: 0, columnIndex: 0 })),
      }

      store.setCoordinateManager(mockCoordManager as any)
      const result = store.getCellPosition('row1', 'col1')

      expect(mockCoordManager.cellRefToPosition).toHaveBeenCalledWith({
        rowId: 'row1',
        columnId: 'col1',
      })
      expect(result).toEqual({ rowIndex: 0, columnIndex: 0 })
    })
  })

  describe('getViewportAwarePosition', () => {
    it('should return null when no coordinate manager is set', () => {
      expect(store.getViewportAwarePosition('row1', 'col1')).toBeNull()
    })

    it('should delegate to coordinate manager with viewport info', () => {
      const mockResult = {
        absolute: { x: 100, y: 200 },
        viewport: { x: 100, y: 200 },
        isVisible: true,
      }
      const mockCoordManager = {
        getCellPositionWithViewport: vi.fn(() => mockResult),
      }

      store.setCoordinateManager(mockCoordManager as any)

      runInAction(() => {
        store.updateViewportSize(800, 600)
        store.updateScroll(50, 25)
      })

      const result = store.getViewportAwarePosition('row1', 'col1')

      expect(result).toEqual(mockResult)
      expect(mockCoordManager.getCellPositionWithViewport).toHaveBeenCalledWith(
        'row1',
        'col1',
        expect.objectContaining({
          viewportWidth: 800,
          viewportHeight: 600,
          scrollTop: 50,
          scrollLeft: 25,
        }),
      )
    })

    it('should reflect visibility based on visible row/column range', () => {
      const mockCoordManager = {
        getCellPositionWithViewport: vi.fn((rowId: string, _colId: string, viewport: any) => {
          // Simulate a cell that's outside the viewport vertically
          const cellY =
            rowId === 'visible-row'
              ? viewport.scrollTop + 10
              : viewport.scrollTop + viewport.viewportHeight + 100
          const isVisible =
            cellY >= viewport.scrollTop && cellY < viewport.scrollTop + viewport.viewportHeight
          return {
            absolute: { x: 50, y: cellY },
            viewport: { x: 50, y: cellY - viewport.scrollTop },
            isVisible,
          }
        }),
      }

      store.setCoordinateManager(mockCoordManager as any)
      runInAction(() => {
        store.updateViewportSize(800, 600)
        store.updateScroll(100, 0)
      })

      const visibleResult = store.getViewportAwarePosition('visible-row', 'col1')
      expect(visibleResult?.isVisible).toBe(true)

      const hiddenResult = store.getViewportAwarePosition('hidden-row', 'col1')
      expect(hiddenResult?.isVisible).toBe(false)
    })
  })

  describe('reset', () => {
    it('should reset all state to defaults', () => {
      runInAction(() => {
        store.updateScroll(100, 50)
        store.updateViewportSize(800, 600)
        store.updateContentSize(2000, 5000)
        store.setRowOffsets([0, 40, 80])
        store.reset()
      })

      expect(store.scrollTop).toBe(0)
      expect(store.scrollLeft).toBe(0)
      expect(store.viewportWidth).toBe(0)
      expect(store.viewportHeight).toBe(0)
      expect(store.totalContentWidth).toBe(0)
      expect(store.totalContentHeight).toBe(0)
      expect(store.rowOffsets).toBeNull()
    })
  })

  describe('IStore lifecycle', () => {
    it('should implement init()', async () => {
      await expect(store.init()).resolves.toBeUndefined()
    })

    it('should implement dispose()', () => {
      expect(() => store.dispose()).not.toThrow()
    })
  })
})
