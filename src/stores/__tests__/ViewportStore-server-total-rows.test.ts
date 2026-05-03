/**
 * GH#2804 B5 — ViewportStore.serverTotalRows decouple
 *
 * Verifies that the substrate cursor-bounded path can show
 * "X of 100,000" while only loading a windowed subset of rows.
 *
 * Spec: docs/planning/specs/2804-smart-100k-row-system.md
 *   §B5: ViewportStore.serverTotalRows decouples total from rawRows.length
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { configure, reaction, runInAction } from 'mobx'

// Mock DisposerManager — match ViewportStore.test.ts pattern
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

configure({ enforceActions: 'always' })

describe('ViewportStore.serverTotalRows (GH#2804 B5)', () => {
  let store: ViewportStore

  beforeEach(() => {
    vi.clearAllMocks()
    store = new ViewportStore()
  })

  describe('initial state', () => {
    it('should default serverTotalRows to null', () => {
      expect(store.serverTotalRows).toBeNull()
    })

    it('should compute totalRows from fallback derivation when serverTotalRows is null', () => {
      // Fallback path: rowOffsets-based derivation.
      runInAction(() => {
        store.setRowOffsets([0, 40, 80, 120, 160])
      })
      expect(store.serverTotalRows).toBeNull()
      expect(store.totalRows).toBe(4) // rowOffsets.length - 1
    })
  })

  describe('substrate path: serverTotalRows takes precedence', () => {
    it('returns serverTotalRows when set, regardless of rowOffsets', () => {
      // Simulate substrate cursor-bounded mode: 200 rows loaded into a
      // 100k-row dataset. rowOffsets reflects the windowed loaded rows;
      // serverTotalRows is the full dataset size.
      runInAction(() => {
        store.setRowOffsets(Array.from({ length: 201 }, (_, i) => i * ROW_HEIGHT))
        store.setServerTotalRows(100_000)
      })
      expect(store.totalRows).toBe(100_000)
    })

    it('returns serverTotalRows when set, regardless of totalContentHeight', () => {
      // No rowOffsets — fallback would use totalContentHeight / ROW_HEIGHT.
      runInAction(() => {
        store.updateContentSize(1000, 200 * ROW_HEIGHT) // would derive 200
        store.setServerTotalRows(100_000)
      })
      expect(store.totalRows).toBe(100_000)
    })

    it('returns serverTotalRows even when no fallback data exists', () => {
      runInAction(() => {
        store.setServerTotalRows(50_000)
      })
      expect(store.totalRows).toBe(50_000)
    })
  })

  describe('TanStack DB path: serverTotalRows null falls back to derivation', () => {
    it('returns rowOffsets-derived totalRows when serverTotalRows null', () => {
      runInAction(() => {
        store.setRowOffsets([0, 40, 80, 120, 160, 200, 240])
      })
      expect(store.serverTotalRows).toBeNull()
      expect(store.totalRows).toBe(6) // length - 1
    })

    it('returns content-height-derived totalRows when no rowOffsets', () => {
      const contentHeight = ROW_HEIGHT * 73
      runInAction(() => {
        store.updateContentSize(1000, contentHeight)
      })
      expect(store.serverTotalRows).toBeNull()
      expect(store.totalRows).toBe(73)
    })

    it('returns 0 when no fallback data exists', () => {
      expect(store.serverTotalRows).toBeNull()
      expect(store.totalRows).toBe(0)
    })
  })

  describe('toggling serverTotalRows', () => {
    it('toggling back to null restores fallback derivation', () => {
      runInAction(() => {
        store.setRowOffsets([0, 40, 80, 120, 160])
        store.setServerTotalRows(100_000)
      })
      expect(store.totalRows).toBe(100_000)

      runInAction(() => {
        store.setServerTotalRows(null)
      })
      expect(store.serverTotalRows).toBeNull()
      expect(store.totalRows).toBe(4) // back to rowOffsets-derived
    })

    it('handles serverTotalRows = 0 distinctly from null', () => {
      // 0 is a valid server count ("no rows match this filter");
      // null means "no server count — fall back to derivation".
      runInAction(() => {
        // Set a fallback that would derive a non-zero value.
        store.updateContentSize(1000, 50 * ROW_HEIGHT)
        store.setServerTotalRows(0)
      })
      expect(store.serverTotalRows).toBe(0)
      expect(store.totalRows).toBe(0) // server says zero, NOT 50
    })

    it('latest value wins on repeated set', () => {
      runInAction(() => {
        store.setServerTotalRows(50_000)
      })
      expect(store.totalRows).toBe(50_000)

      runInAction(() => {
        store.setServerTotalRows(75_000)
      })
      expect(store.totalRows).toBe(75_000)

      runInAction(() => {
        store.setServerTotalRows(123)
      })
      expect(store.totalRows).toBe(123)
    })
  })

  describe('MobX reactivity', () => {
    it('totalRows triggers reaction when serverTotalRows changes', () => {
      const observed: number[] = []
      const dispose = reaction(
        () => store.totalRows,
        (val) => observed.push(val),
      )

      runInAction(() => store.setServerTotalRows(100))
      runInAction(() => store.setServerTotalRows(200))
      runInAction(() => store.setServerTotalRows(null))

      expect(observed).toEqual([100, 200, 0])
      dispose()
    })

    it('serverTotalRows survives reset() being called (resets to null)', () => {
      runInAction(() => {
        store.setServerTotalRows(100_000)
      })
      expect(store.serverTotalRows).toBe(100_000)

      runInAction(() => {
        store.reset()
      })
      expect(store.serverTotalRows).toBeNull()
    })
  })

  describe('downstream consumer behavior (visibleRowRange clamp)', () => {
    it('visibleRowRange clamp uses serverTotalRows-driven totalRows', () => {
      // Simulate a substrate path with 100k server rows but no offsets/content height.
      // visibleRowRange's `Math.min(this.totalRows, ...)` clamp must respect 100k.
      runInAction(() => {
        store.updateViewportSize(1000, 400)
        store.setServerTotalRows(100_000)
        store.updateScroll(50_000 * ROW_HEIGHT, 0)
      })

      const range = store.visibleRowRange
      // start derived from scroll position; end clamp shouldn't be < scroll-derived end.
      expect(range.end).toBeGreaterThan(range.start)
      // The clamp ceiling is serverTotalRows — should never exceed.
      expect(range.end).toBeLessThanOrEqual(100_000)
    })
  })

  describe('GH#2808 S1: visibleRowRange ignores windowed offsets in bounded mode', () => {
    // Repro for the bug reported in #2808 S1:
    //   scrollTop = 500 * ROW_HEIGHT (= 17000 for ROW_HEIGHT=34)
    //   serverTotalRows = 100,000
    //   loaded window = 60..180 (so rowOffsets only span 0..120 * ROW_HEIGHT)
    //
    // Before the fix, ViewportStore.visibleRowRange called
    // tableCoreStore.findRowAtScrollPosition which saturated at the
    // windowed last index, returning ~120 instead of ~500.

    const buffer = GRID_DIMENSIONS.BUFFER_ROWS

    // Mock tableCoreStore that mimics the windowed-offsets behavior
    // (binary search over a 121-entry offsets array — saturates at 120).
    function makeWindowedTableCoreStore(loadedWindowSize: number) {
      const offsets = Array.from({ length: loadedWindowSize + 1 }, (_, i) => i * ROW_HEIGHT)
      return {
        findRowAtScrollPosition: vi.fn((scrollTop: number) => {
          // Binary search mirroring TableCoreStore.findRowAtScrollPosition
          let left = 0
          let right = offsets.length - 1
          while (left < right) {
            const mid = Math.floor((left + right) / 2)
            if (offsets[mid] < scrollTop) left = mid + 1
            else right = mid
          }
          return Math.max(0, left - 1)
        }),
      }
    }

    it('returns logical row index when serverTotalRows is set, ignoring windowed tableCoreStore', () => {
      const targetRow = 500
      const tableCoreStore = makeWindowedTableCoreStore(120)

      runInAction(() => {
        store.setTableCoreStore(tableCoreStore as never)
        store.updateViewportSize(1000, 400) // ~12 rows visible
        store.setServerTotalRows(100_000)
        store.updateScroll(targetRow * ROW_HEIGHT, 0)
      })

      const range = store.visibleRowRange

      // start should reflect logical row 500 (minus buffer), NOT the
      // windowed saturation index (~120).
      expect(range.start).toBe(Math.max(0, targetRow - buffer))
      expect(range.start).toBeGreaterThanOrEqual(targetRow - buffer)
      expect(range.start).toBeLessThan(targetRow + 5)

      // end should also reflect the logical viewport end.
      expect(range.end).toBeGreaterThan(targetRow)
      expect(range.end).toBeLessThanOrEqual(100_000)

      // The windowed tableCoreStore must not have been consulted in bounded mode.
      expect(tableCoreStore.findRowAtScrollPosition).not.toHaveBeenCalled()
    })

    it('uses tableCoreStore branch when serverTotalRows is null (non-bounded path)', () => {
      const tableCoreStore = makeWindowedTableCoreStore(120)

      runInAction(() => {
        store.setTableCoreStore(tableCoreStore as never)
        store.updateViewportSize(1000, 400)
        // serverTotalRows stays null
        store.updateScroll(500 * ROW_HEIGHT, 0)
      })

      // Touch the computed so it executes.
      void store.visibleRowRange
      // tableCoreStore.findRowAtScrollPosition IS consulted in non-bounded mode.
      expect(tableCoreStore.findRowAtScrollPosition).toHaveBeenCalled()
    })

    it('end clamp respects serverTotalRows even at the bottom of the dataset', () => {
      runInAction(() => {
        store.updateViewportSize(1000, 400)
        store.setServerTotalRows(100_000)
        // Scroll to the very bottom: 99,990 logical row.
        store.updateScroll(99_990 * ROW_HEIGHT, 0)
      })

      const range = store.visibleRowRange
      expect(range.end).toBeLessThanOrEqual(100_000)
      // start should still reflect logical position near bottom.
      expect(range.start).toBeGreaterThan(99_980 - buffer - 1)
    })
  })
})
