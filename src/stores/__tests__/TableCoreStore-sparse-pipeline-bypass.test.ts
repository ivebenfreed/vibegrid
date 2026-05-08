/**
 * GH#2848 D8: when rawRows is sparse (substrate mode), the JS pipeline
 * (search / filter / sort) MUST be bypassed. Otherwise:
 *   - `[...rows].sort(...)` densifies holes to undefined
 *   - sort compareFn throws on `undefined.data` access
 *   - or sort allocates ~211k explicit-undefined entries
 *
 * Either branch matches the user's reported 5GB / 100% CPU / 2.5MB/s
 * sort-toggle storm on a fully-loaded grid. Substrate already pushes
 * sort/filter to SQL and re-emits queryDelta; the JS layer is redundant
 * in this mode.
 *
 * This suite verifies the bypass takes effect when sparse.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import type { Column } from '../../types'
import { TableCoreStore } from '../TableCoreStore'

function makeRows(start: number, n: number): Array<{ id: string; data: { title: string } }> {
  return Array.from({ length: n }, (_, i) => ({
    id: `row-${start + i}`,
    data: { title: `Title ${start + i}` },
  }))
}

interface VisualStateLike {
  sortBy: Array<{ field: string; direction: 'asc' | 'desc' }>
  filters: Array<{ field: string; op: string; value: unknown }>
  globalSearchText: string
  filterGroup: null
}

function makeStore(): { store: TableCoreStore; visual: VisualStateLike } {
  const store = new TableCoreStore('RFI')
  const columns: Column[] = [
    { id: 'id', label: 'ID', type: 'text', fieldType: { type: 'text' } } as any,
    { id: 'title', label: 'Title', type: 'text', fieldType: { type: 'text' } } as any,
  ]
  ;(store as any).columns = columns
  ;(store as any).isSchemaLoaded = true
  const visual: VisualStateLike = { sortBy: [], filters: [], globalSearchText: '', filterGroup: null }
  ;(store as any).visualStateStore = visual
  return { store, visual }
}

describe('TableCoreStore — JS pipeline bypass under sparse mode (GH#2848 D8)', () => {
  let store: TableCoreStore
  let visual: VisualStateLike

  beforeEach(() => {
    const made = makeStore()
    store = made.store
    visual = made.visual
  })

  it('sortedRows does NOT materialize a dense 200k-length array on sort toggle', () => {
    // Simulate the user's scenario: 200,000 total, 100 visible window
    const TOTAL = 200_000
    const WINDOW = 100
    store.setSparseRows(0, makeRows(0, WINDOW), TOTAL)

    visual.sortBy = [{ field: 'title', direction: 'desc' }]

    const t0 = process.hrtime.bigint()
    const result = store.sortedRows
    const elapsedMs = Number(process.hrtime.bigint() - t0) / 1e6

    // Bypass: filteredRows returned unchanged; substrate already sorted server-side.
    expect(result.length).toBe(TOTAL)
    // O(window) not O(TOTAL) — should be < 50ms on any reasonable machine.
    // Without the bypass this allocates 200k entries via [...rows] and runs
    // the sort comparator over them; observed ~hundreds of ms or crash.
    expect(elapsedMs).toBeLessThan(50)
  })

  it('searchFilteredRows bypasses applyTextSearch in sparse mode', () => {
    store.setSparseRows(0, makeRows(0, 50), 50_000)
    visual.globalSearchText = 'Title 5'

    const result = store.searchFilteredRows
    // Bypass: returns full sparse array unchanged. Without bypass would
    // attempt text search over the 50k sparse array and crash on .data.
    expect(result.length).toBe(50_000)
  })

  it('filteredRows bypasses applyFilters in sparse mode', () => {
    store.setSparseRows(0, makeRows(0, 50), 50_000)
    visual.filters = [{ field: 'title', op: 'contains', value: 'Title 5' }]

    const result = store.filteredRows
    expect(result.length).toBe(50_000)
  })

  it('JS pipeline still runs in dense (non-sparse) mode', () => {
    // setRows (legacy / dense path) — loaded window covers the whole array
    const dense = makeRows(0, 5)
    ;(store as any).rawRows = dense
    ;(store as any).hasLoadedRows = true
    ;(store as any).loadedWindowStart = 0
    ;(store as any).loadedWindowEnd = dense.length
    ;(store as any).rawRowsIndexCacheRef = null
    ;(store as any).schemaLoadedAt = Date.now()

    visual.sortBy = [{ field: 'title', direction: 'desc' }]

    const result = store.sortedRows
    // Dense mode: real JS sort runs. Title 4 should be first.
    expect(result.length).toBe(5)
    expect(result[0].data.title).toBe('Title 4')
    expect(result[4].data.title).toBe('Title 0')
  })

  it('isSparseMode flips false when window equals length', () => {
    // After setSparseRows fully populates [0, total), sparse should report false.
    // Edge case: nothing prevents a future "load all" path from making the
    // grid fully dense. The bypass should turn off so JS pipeline can run.
    store.setSparseRows(0, makeRows(0, 100), 100)
    expect((store as any).isSparseMode).toBe(false)
  })
})
