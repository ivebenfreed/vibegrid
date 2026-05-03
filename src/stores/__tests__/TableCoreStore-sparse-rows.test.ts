/**
 * GH#2804 B6 + B7: TableCoreStore sparse-row support tests.
 *
 * Covers:
 * - setSparseRows allocation, window tracking, splice behavior
 * - getRowAt: real-row vs placeholder vs out-of-bounds
 * - isSparsePlaceholder type guard
 * - Structural-change detection via id-keyed map (no positional false positives)
 * - findNextLoadedIndex / findPreviousLoadedIndex helpers
 * - nextLoadedRowIndex / previousLoadedRowIndex pure helpers
 */

import { beforeEach, describe, expect, it } from 'vitest'
import {
  findNextLoadedIndex,
  findPreviousLoadedIndex,
} from '../../renderers/modules/KeyboardNavigationController'
import type { Column } from '../../types'
import {
  isSparsePlaceholder,
  nextLoadedRowIndex,
  previousLoadedRowIndex,
  SPARSE_PLACEHOLDER_ID,
  TableCoreStore,
} from '../TableCoreStore'

function makeRows(start: number, n: number): Array<{ id: string; data: { ord: number } }> {
  return Array.from({ length: n }, (_, i) => ({
    id: `row-${start + i}`,
    data: { ord: start + i },
  }))
}

describe('TableCoreStore — sparse rows (GH#2804 B6)', () => {
  let store: TableCoreStore

  beforeEach(() => {
    store = new TableCoreStore('rfi')
    const columns: Column[] = [
      { id: 'id', label: 'ID', type: 'text', fieldType: { type: 'text' } } as any,
      { id: 'ord', label: 'Order', type: 'number', fieldType: { type: 'number' } } as any,
    ]
    ;(store as any).columns = columns
  })

  it('isSparsePlaceholder identifies placeholder shape', () => {
    expect(isSparsePlaceholder({ __sparse: true, id: SPARSE_PLACEHOLDER_ID })).toBe(true)
    expect(isSparsePlaceholder({ id: 'real', data: {} })).toBe(false)
    expect(isSparsePlaceholder(null)).toBe(false)
    expect(isSparsePlaceholder(undefined)).toBe(false)
    expect(isSparsePlaceholder('string')).toBe(false)
  })

  it('setSparseRows allocates length=totalCount with holes outside the loaded window', () => {
    // GH#2812 perf fix: setSparseRows leaves indices outside [start, end) as
    // genuine array holes (undefined when read), not pre-populated placeholder
    // objects. `getRowAt(i)` synthesizes a placeholder for callers that need
    // one. `Array.prototype.map` / `filter` / `forEach` skip holes, so
    // downstream `processedRows.map` is O(window) not O(totalCount).
    const rows = makeRows(50000, 50)
    store.setSparseRows(50000, rows, 100000)

    const raw = (store as any).rawRows as Array<{ id: string; __sparse?: true } | undefined>
    expect(raw.length).toBe(100000)
    // Outside window → hole (undefined when read), getRowAt synthesizes a placeholder.
    expect(raw[0]).toBeUndefined()
    expect(isSparsePlaceholder(store.getRowAt(0))).toBe(true)
    expect((store.getRowAt(0) as { id: string }).id).toBe(SPARSE_PLACEHOLDER_ID)
    expect(raw[49999]).toBeUndefined()
    expect(isSparsePlaceholder(store.getRowAt(49999))).toBe(true)
    // Inside window → real row
    expect(isSparsePlaceholder(raw[50000])).toBe(false)
    expect(raw[50000]!.id).toBe('row-50000')
    expect(isSparsePlaceholder(raw[50049])).toBe(false)
    expect(raw[50049]!.id).toBe('row-50049')
    // After window → hole
    expect(raw[50050]).toBeUndefined()
    expect(isSparsePlaceholder(store.getRowAt(50050))).toBe(true)
    expect(raw[99999]).toBeUndefined()
    expect(isSparsePlaceholder(store.getRowAt(99999))).toBe(true)
    // Window observables
    expect(store.loadedWindowStart).toBe(50000)
    expect(store.loadedWindowEnd).toBe(50050)
  })

  it('setSparseRows produces a sparse array with EXACTLY rows.length set indices (genuine holes)', () => {
    // GH#2812 perf fix: the array must be sparse-with-holes. If we used to
    // populate every slot with a placeholder, Object.keys would return all
    // 100000 indices. With true holes, only the loaded window is enumerable.
    store.setSparseRows(0, makeRows(0, 3), 100000)
    const raw = (store as any).rawRows as Array<unknown>
    expect(raw.length).toBe(100000)
    expect(Object.keys(raw).length).toBe(3)
  })

  it('setSparseRows is fast on large totalCount (no O(totalCount) work)', () => {
    // GH#2812 perf assertion: Allocating a length-N sparse array and writing
    // K << N entries should be O(K) not O(N). We use 1M slots with 50 rows.
    // Pre-fix this would loop 1M times filling placeholder objects (~100ms+).
    // Post-fix: ~1ms. We assert <100ms with generous headroom for CI variance.
    const start = performance.now()
    store.setSparseRows(500_000, makeRows(500_000, 50), 1_000_000)
    const elapsed = performance.now() - start
    expect(elapsed).toBeLessThan(100)
    expect((store as any).rawRows.length).toBe(1_000_000)
    // Loaded window contents intact
    expect((store.getRowAt(500_025) as { id: string }).id).toBe('row-500025')
  })

  it('getRowAt returns real row inside window, placeholder outside, placeholder for OOB', () => {
    store.setSparseRows(50000, makeRows(50000, 50), 100000)

    const real = store.getRowAt(50025)
    expect(isSparsePlaceholder(real)).toBe(false)
    expect((real as { id: string }).id).toBe('row-50025')

    const before = store.getRowAt(0)
    expect(isSparsePlaceholder(before)).toBe(true)

    const after = store.getRowAt(99999)
    expect(isSparsePlaceholder(after)).toBe(true)

    const oobNeg = store.getRowAt(-1)
    expect(isSparsePlaceholder(oobNeg)).toBe(true)

    const oobPast = store.getRowAt(1_000_000)
    expect(isSparsePlaceholder(oobPast)).toBe(true)
  })

  it('shifting the loaded window reverts old window to placeholders', () => {
    store.setSparseRows(50000, makeRows(50000, 50), 100000)
    const firstWindow = store.getRowAt(50025)
    expect((firstWindow as { id: string }).id).toBe('row-50025')

    // Shift the window
    store.setSparseRows(60000, makeRows(60000, 50), 100000)

    expect(isSparsePlaceholder(store.getRowAt(50025))).toBe(true)
    const newWindow = store.getRowAt(60025)
    expect(isSparsePlaceholder(newWindow)).toBe(false)
    expect((newWindow as { id: string }).id).toBe('row-60025')
    expect(store.loadedWindowStart).toBe(60000)
    expect(store.loadedWindowEnd).toBe(60050)
  })

  it('window aligned to start: indices 0..49 are real, 50..99 are holes (placeholders via getRowAt)', () => {
    // GH#2812 perf fix: outside the loaded window, rawRows[i] is now a hole
    // (undefined). Callers that need a placeholder use store.getRowAt(i).
    store.setSparseRows(0, makeRows(0, 50), 100)

    expect(store.loadedWindowStart).toBe(0)
    expect(store.loadedWindowEnd).toBe(50)

    const raw = (store as any).rawRows as Array<{ id: string } | undefined>
    for (let i = 0; i < 50; i++) {
      expect(isSparsePlaceholder(raw[i])).toBe(false)
      expect(raw[i]!.id).toBe(`row-${i}`)
    }
    for (let i = 50; i < 100; i++) {
      // raw[i] is a genuine hole.
      expect(raw[i]).toBeUndefined()
      // getRowAt synthesizes a placeholder for the same index.
      expect(isSparsePlaceholder(store.getRowAt(i))).toBe(true)
    }
  })

  it('clamps start + size that overflow totalCount', () => {
    // start=95, 50 rows but totalCount=100 → only 5 fit
    store.setSparseRows(95, makeRows(95, 50), 100)
    expect(store.loadedWindowStart).toBe(95)
    expect(store.loadedWindowEnd).toBe(100)
    expect((store.getRowAt(99) as { id: string }).id).toBe('row-99')
    // index 100 is OOB → placeholder
    expect(isSparsePlaceholder(store.getRowAt(100))).toBe(true)
  })
})

describe('TableCoreStore — structural-change detection on sparse rows (GH#2804 B6/B7)', () => {
  let store: TableCoreStore

  beforeEach(() => {
    store = new TableCoreStore('task')
    const columns: Column[] = [
      { id: 'id', label: 'ID', type: 'text', fieldType: { type: 'text' } } as any,
      { id: 'name', label: 'Name', type: 'text', fieldType: { type: 'text' } } as any,
    ]
    ;(store as any).columns = columns
  })

  it('same id sequence twice → no structural change (structureVersion stable)', () => {
    const rows = [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
      { id: 'c', name: 'C' },
    ]
    store.setRows(rows)
    const v1 = store.structureVersion
    // Identical sequence — should be no-op (NONE classification) at minimum
    store.setRows(rows.map((r) => ({ ...r })))
    expect(store.structureVersion).toBe(v1)
  })

  it('different id at same index → structural change (structureVersion bumps)', () => {
    store.setRows([
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
    ])
    const v1 = store.structureVersion
    store.setRows([
      { id: 'a', name: 'A' },
      { id: 'z', name: 'Z' }, // swapped
    ])
    expect(store.structureVersion).toBeGreaterThan(v1)
  })

  it('row reorder is detected as structural change via id-keyed map', () => {
    store.setRows([
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
      { id: 'c', name: 'C' },
    ])
    const v1 = store.structureVersion
    // Reorder: same ids, different positions
    store.setRows([
      { id: 'c', name: 'C' },
      { id: 'b', name: 'B' },
      { id: 'a', name: 'A' },
    ])
    expect(store.structureVersion).toBeGreaterThan(v1)
  })
})

describe('GH#2804 B7 — pure index helpers', () => {
  it('nextLoadedRowIndex returns first loaded index at or after `index`', () => {
    expect(nextLoadedRowIndex(0, 50, 60, 100)).toBe(50)
    expect(nextLoadedRowIndex(55, 50, 60, 100)).toBe(55)
    expect(nextLoadedRowIndex(60, 50, 60, 100)).toBe(-1)
    expect(nextLoadedRowIndex(99, 50, 60, 100)).toBe(-1)
    expect(nextLoadedRowIndex(0, 0, 0, 100)).toBe(-1) // empty window
    expect(nextLoadedRowIndex(101, 50, 60, 100)).toBe(-1) // OOB
  })

  it('previousLoadedRowIndex returns last loaded index at or before `index`', () => {
    expect(previousLoadedRowIndex(99, 50, 60)).toBe(59)
    expect(previousLoadedRowIndex(55, 50, 60)).toBe(55)
    expect(previousLoadedRowIndex(50, 50, 60)).toBe(50)
    expect(previousLoadedRowIndex(49, 50, 60)).toBe(-1)
    expect(previousLoadedRowIndex(0, 0, 0)).toBe(-1)
  })

  it('findNextLoadedIndex skips sparse placeholders in a processedRows array', () => {
    const placeholder = { __sparse: true as const, id: SPARSE_PLACEHOLDER_ID }
    const rows: any[] = [
      placeholder,
      placeholder,
      { id: 'r2', data: {} },
      placeholder,
      { id: 'r4', data: {} },
    ]
    expect(findNextLoadedIndex(rows, 0)).toBe(2)
    expect(findNextLoadedIndex(rows, 2)).toBe(2)
    expect(findNextLoadedIndex(rows, 3)).toBe(4)
    expect(findNextLoadedIndex(rows, 5)).toBe(-1)
    // All-placeholder array
    expect(findNextLoadedIndex([placeholder, placeholder], 0)).toBe(-1)
  })

  it('findPreviousLoadedIndex scans backward past placeholders', () => {
    const placeholder = { __sparse: true as const, id: SPARSE_PLACEHOLDER_ID }
    const rows: any[] = [
      { id: 'r0', data: {} },
      placeholder,
      { id: 'r2', data: {} },
      placeholder,
      placeholder,
    ]
    expect(findPreviousLoadedIndex(rows, 4)).toBe(2)
    expect(findPreviousLoadedIndex(rows, 2)).toBe(2)
    expect(findPreviousLoadedIndex(rows, 1)).toBe(0)
    expect(findPreviousLoadedIndex(rows, 0)).toBe(0)
  })
})

describe('TableCoreStore.initializeBaselineSnapshot — Suggestion 7 round-2 review', () => {
  it('does not crash and excludes sparse placeholders from the baseline snapshot', () => {
    const store = new TableCoreStore('rfi')
    const columns: Column[] = [
      { id: 'id', label: 'ID', type: 'text', fieldType: { type: 'text' } } as any,
      { id: 'ord', label: 'Order', type: 'number', fieldType: { type: 'number' } } as any,
    ]
    ;(store as any).columns = columns

    // Populate a sparse window — most indices are placeholders.
    store.setSparseRows(50_000, makeRows(50_000, 50), 100_000)

    // Baseline initialization must (a) not throw, (b) only snapshot the 50
    // concrete rows — never the 99,950 placeholders. Without the filter, the
    // baseline would contain placeholder hashes and mis-classify real rows
    // as "changed" once they replace the placeholders.
    expect(() => store.initializeBaselineSnapshot()).not.toThrow()

    const snapshot = (store as any).previousRowsSnapshot as Map<string, unknown>
    expect(snapshot.size).toBe(50)
    // Placeholder id must NOT appear in the snapshot.
    expect(snapshot.has(SPARSE_PLACEHOLDER_ID)).toBe(false)
    // A real row id must appear.
    expect(snapshot.has('row-50000')).toBe(true)
    expect(snapshot.has('row-50049')).toBe(true)
  })
})
