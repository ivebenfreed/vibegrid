/**
 * GH#2812 sparse-rows hole-handling guards.
 *
 * After GH#2812, TableCoreStore.setSparseRows leaves indices outside the
 * loaded window as genuine array HOLES (undefined when read), not pre-
 * populated placeholder objects. Per ECMA-262:
 *
 *   - map / filter / forEach / reduce  → SKIP holes (§22.1.3)
 *   - find / findIndex                 → visit holes as undefined (§22.1.3.9 / §22.1.3.10)
 *   - for-of (Array iterator)          → yield undefined for holes (§22.1.5)
 *
 * This test file exercises every consumer that was updated to add hole-safe
 * guards (find/findIndex with `r &&`, for-of with `if (!row) continue`).
 *
 * Each test verifies:
 *   1. The consumer does NOT throw a TypeError when given a sparse-with-holes
 *      processedRows array.
 *   2. The consumer produces the correct result (skips holes, treats them
 *      as unloaded — same as a SparsePlaceholder).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  isSparsePlaceholder,
  SPARSE_PLACEHOLDER_ID,
  TableCoreStore,
} from '../TableCoreStore'
import { InteractionStore } from '../InteractionStore'
import { SelectionController } from '../../renderers/modules/SelectionController'
import {
  findNextLoadedIndex,
  findPreviousLoadedIndex,
} from '../../renderers/modules/KeyboardNavigationController'
import type { Column } from '../../types'

// Mock toast since SelectionController calls it on sparse boundaries.
vi.mock('sonner', () => ({
  toast: { message: vi.fn(), warning: vi.fn(), error: vi.fn() },
}))

/**
 * Build a sparse-with-holes array shaped like processedRows in bounded mode.
 * Mirrors what TableCoreStore.processedRows produces post-GH#2812: an array
 * of length=totalCount where only `[start, start+rows.length)` are set,
 * everything else is a hole (undefined when read). Loaded slots are wrapped
 * as VirtualRows.
 */
function makeSparseProcessedRows(
  start: number,
  loadedCount: number,
  totalCount: number,
): any[] {
  const arr: any[] = new Array(totalCount)
  for (let i = 0; i < loadedCount; i++) {
    const idx = start + i
    arr[idx] = {
      type: 'data' as const,
      id: `row-${idx}`,
      index: idx,
      dataIndex: idx,
      height: 40,
      data: { id: `row-${idx}`, ord: idx },
    }
  }
  return arr
}

const COLUMNS = [
  { id: 'name', label: 'Name', cellType: 'text' },
  { id: 'ord', label: 'Order', cellType: 'number' },
]

describe('GH#2812 — TableCoreStore sparse representation invariants', () => {
  let store: TableCoreStore

  beforeEach(() => {
    store = new TableCoreStore('rfi')
    const columns: Column[] = [
      { id: 'id', label: 'ID', type: 'text', fieldType: { type: 'text' } } as any,
      { id: 'ord', label: 'Order', type: 'number', fieldType: { type: 'number' } } as any,
    ]
    ;(store as any).columns = columns
  })

  it('rawRows.map skips holes (ECMA-262 §22.1.3.21)', () => {
    // Verifies the central perf invariant: with holes, downstream pipelines
    // (processedRows.map -> VirtualRow wrapping) iterate O(window) not O(N).
    store.setSparseRows(50_000, [
      { id: 'a', data: { ord: 0 } },
      { id: 'b', data: { ord: 1 } },
      { id: 'c', data: { ord: 2 } },
    ] as any, 100_000)

    const raw = (store as any).rawRows as any[]
    expect(raw.length).toBe(100_000)

    let visited = 0
    raw.map((r) => {
      void r
      visited++
      return r
    })
    // map invokes callback ONLY for set indices (the loaded window).
    expect(visited).toBe(3)
  })

  it('rawRows.forEach skips holes (ECMA-262 §22.1.3.13)', () => {
    store.setSparseRows(0, [{ id: 'a' } as any], 100_000)
    const raw = (store as any).rawRows as any[]

    let visited = 0
    raw.forEach(() => {
      visited++
    })
    expect(visited).toBe(1)
  })

  it('rawRows.filter skips holes (ECMA-262 §22.1.3.7)', () => {
    store.setSparseRows(99_990, [{ id: 'a' } as any, { id: 'b' } as any], 100_000)
    const raw = (store as any).rawRows as any[]

    const truthy = raw.filter(Boolean)
    expect(truthy.length).toBe(2)
  })

  it('rawRows.reduce skips holes (ECMA-262 §22.1.3.22)', () => {
    store.setSparseRows(0, [
      { id: 'a' } as any,
      { id: 'b' } as any,
      { id: 'c' } as any,
    ], 1_000_000)
    const raw = (store as any).rawRows as any[]

    const count = raw.reduce((acc) => acc + 1, 0)
    // reduce with initial accumulator skips holes — the count equals the
    // loaded window size, NOT the totalCount.
    expect(count).toBe(3)
  })

  it('rawRows.findIndex VISITS holes as undefined (ECMA-262 §22.1.3.10)', () => {
    // This is why production code must guard with `r &&` before `.id` access.
    store.setSparseRows(50_000, [{ id: 'real' } as any], 100_000)
    const raw = (store as any).rawRows as any[]

    let undefinedSeen = false
    raw.findIndex((r: any) => {
      if (r === undefined) undefinedSeen = true
      return false
    })
    expect(undefinedSeen).toBe(true)

    // Without the guard, this would throw on the FIRST hole at index 0.
    expect(() => raw.findIndex((r: any) => r.id === 'real')).toThrow(TypeError)
    // With the guard (the production pattern), no throw.
    expect(() => raw.findIndex((r: any) => r && r.id === 'real')).not.toThrow()
  })

  it('rawRows.find VISITS holes as undefined (ECMA-262 §22.1.3.9)', () => {
    store.setSparseRows(0, [{ id: 'real' } as any], 100)
    const raw = (store as any).rawRows as any[]

    expect(() => raw.find((r: any) => r.id === 'real')).not.toThrow() // hits real first
    // But the moment a hole is encountered before the match, find DOES NPE.
    store.setSparseRows(50, [{ id: 'real' } as any], 100)
    const raw2 = (store as any).rawRows as any[]
    expect(() => raw2.find((r: any) => r.id === 'real')).toThrow(TypeError)
    expect(() => raw2.find((r: any) => r && r.id === 'real')).not.toThrow()
  })

  it('for-of YIELDS undefined for holes (ECMA-262 §22.1.5)', () => {
    store.setSparseRows(50, [{ id: 'a' } as any], 100)
    const raw = (store as any).rawRows as any[]

    let undefinedSeen = false
    let realSeen = 0
    for (const r of raw) {
      if (r === undefined) undefinedSeen = true
      else realSeen++
    }
    expect(undefinedSeen).toBe(true)
    expect(realSeen).toBe(1)
  })

  it('rawRows is sparse: Object.keys returns ONLY set indices', () => {
    // Verifies the holes representation is genuine, not pre-populated.
    // Pre-fix: Object.keys would return all 100_000 indices.
    store.setSparseRows(99_995, [
      { id: 'a' } as any,
      { id: 'b' } as any,
      { id: 'c' } as any,
      { id: 'd' } as any,
      { id: 'e' } as any,
    ], 100_000)
    const raw = (store as any).rawRows as any[]
    expect(raw.length).toBe(100_000)
    expect(Object.keys(raw).length).toBe(5)
  })
})

describe('GH#2812 — SelectionController hole-handling', () => {
  let interactionStore: InteractionStore
  let processedRows: any[]
  let controller: SelectionController

  beforeEach(() => {
    vi.clearAllMocks()
    interactionStore = new InteractionStore()
    processedRows = makeSparseProcessedRows(0, 5, 100)
    controller = new SelectionController({
      interactionStore,
      getProcessedRows: () => processedRows,
      getVisibleColumns: () => COLUMNS,
    })
  })

  it('selectAllCells: skips holes, only loaded rows enter the selection', () => {
    expect(() => controller.selectAllCells()).not.toThrow()
    // 5 loaded rows × 2 columns = 10 cells. Holes (95 of them) contribute zero.
    expect(interactionStore.selectedCells.size).toBe(10)
    // No `__sparse__:column` entries — IDs match real loaded rows only.
    for (const cellId of interactionStore.selectedCells) {
      expect(cellId).not.toContain(SPARSE_PLACEHOLDER_ID)
    }
  })

  it('selectAllCells: works correctly when window starts mid-array', () => {
    // Window = indices [50, 53). Indices 0..49 and 53..99 are holes.
    processedRows = makeSparseProcessedRows(50, 3, 100)
    expect(() => controller.selectAllCells()).not.toThrow()
    expect(interactionStore.selectedCells.size).toBe(6) // 3 rows × 2 cols
  })

  it('selectAllCells: empty grid (no rows) does not throw', () => {
    processedRows = []
    expect(() => controller.selectAllCells()).not.toThrow()
    expect(interactionStore.selectedCells.size).toBe(0)
  })

  it('selectAllCells: all-holes grid does not throw and selects nothing', () => {
    // Pathological: 100k slots, all holes (e.g. cursor mid-load).
    processedRows = new Array(100_000)
    expect(() => controller.selectAllCells()).not.toThrow()
    expect(interactionStore.selectedCells.size).toBe(0)
  })

  it('selectRowRange: refuses to select when start/end are holes', () => {
    // Endpoints are unloaded → findIndex returns -1 → toast + no-op.
    processedRows = makeSparseProcessedRows(0, 5, 100)
    expect(() =>
      controller.selectRowRange('row-50', 'row-60'),
    ).not.toThrow()
    // No selection made.
    expect(interactionStore.selectedCells.size).toBe(0)
  })

  it('selectRowRange: holes inside [start, end) are skipped, loaded rows selected', () => {
    // Build a processedRows with two loaded clusters and a gap.
    // Indices [0..2] loaded, [3..5] holes, [6..8] loaded.
    processedRows = new Array(10)
    for (const idx of [0, 1, 2, 6, 7, 8]) {
      processedRows[idx] = {
        type: 'data' as const,
        id: `row-${idx}`,
        index: idx,
        dataIndex: idx,
        height: 40,
        data: { id: `row-${idx}` },
      }
    }
    expect(() =>
      controller.selectRowRange('row-0', 'row-8'),
    ).not.toThrow()
    // 6 loaded rows × 2 cols = 12 cells; 3 holes contribute zero.
    expect(interactionStore.selectedCells.size).toBe(12)
  })
})

describe('GH#2812 — InteractionStore.selectColumnCells hole-handling', () => {
  let store: InteractionStore

  beforeEach(() => {
    store = new InteractionStore()
  })

  it('selectColumnCells: for-of skips holes, no `__sparse__:col` IDs leak', () => {
    const rows = makeSparseProcessedRows(50_000, 50, 100_000)
    expect(() => store.selectColumnCells('name', rows)).not.toThrow()
    expect(store.selectedCells.size).toBe(50)
    for (const cellId of store.selectedCells) {
      expect(cellId).not.toContain(SPARSE_PLACEHOLDER_ID)
    }
  })

  it('selectColumnCells: anchorCell skips holes via find guard', () => {
    // Window starts at index 100. Indices 0..99 are holes.
    const rows = makeSparseProcessedRows(100, 5, 1000)
    expect(() => store.selectColumnCells('name', rows)).not.toThrow()
    // anchorCell should be the first LOADED row's id, not `__sparse__:name`.
    expect(store.anchorCell).toBe('row-100:name')
  })

  it('selectColumnCells: SparsePlaceholder objects are also skipped (legacy)', () => {
    // Mix legacy placeholders and holes — both should be filtered.
    const rows: any[] = new Array(10)
    rows[0] = { type: 'data' as const, id: 'a', data: { id: 'a' } }
    rows[1] = { __sparse: true, id: SPARSE_PLACEHOLDER_ID } // legacy placeholder
    // rows[2..8] = holes
    rows[9] = { type: 'data' as const, id: 'z', data: { id: 'z' } }

    expect(() => store.selectColumnCells('name', rows)).not.toThrow()
    expect(store.selectedCells.size).toBe(2)
    expect(store.selectedCells.has('a:name')).toBe(true)
    expect(store.selectedCells.has('z:name')).toBe(true)
  })
})

describe('GH#2812 — KeyboardNavigationController helpers handle holes', () => {
  it('findNextLoadedIndex skips holes (undefined)', () => {
    // Holes mixed with real rows.
    const rows: any[] = new Array(5)
    rows[2] = { type: 'data' as const, id: 'r2' }
    rows[4] = { type: 'data' as const, id: 'r4' }
    expect(findNextLoadedIndex(rows, 0)).toBe(2)
    expect(findNextLoadedIndex(rows, 3)).toBe(4)
    expect(findNextLoadedIndex(rows, 5)).toBe(-1)
  })

  it('findNextLoadedIndex skips legacy SparsePlaceholders too', () => {
    const placeholder = { __sparse: true as const, id: SPARSE_PLACEHOLDER_ID }
    const rows: any[] = [placeholder, placeholder, { id: 'real' }]
    expect(findNextLoadedIndex(rows, 0)).toBe(2)
  })

  it('findPreviousLoadedIndex skips holes', () => {
    const rows: any[] = new Array(5)
    rows[1] = { type: 'data' as const, id: 'r1' }
    rows[3] = { type: 'data' as const, id: 'r3' }
    expect(findPreviousLoadedIndex(rows, 4)).toBe(3)
    expect(findPreviousLoadedIndex(rows, 2)).toBe(1)
    expect(findPreviousLoadedIndex(rows, 0)).toBe(-1)
  })
})

describe('GH#2812 — generic hole-safe iteration patterns', () => {
  // Tests that document the patterns adopted across consumer files
  // (BodyRenderer, ClipboardManager, EditingStore, etc.) so future code
  // reviewers can verify their own changes against these behaviors.

  it('find with `r && r.id === target` guard: returns loaded row, not undefined', () => {
    const rows: any[] = new Array(100)
    rows[50] = { id: 'target', data: {} }
    const result = rows.find((r: any) => r && r.id === 'target')
    expect(result).toBeDefined()
    expect(result.id).toBe('target')
  })

  it('find with `r && r.id === target` guard: does NOT throw when target is missing', () => {
    const rows: any[] = new Array(100)
    rows[50] = { id: 'other', data: {} }
    expect(() => rows.find((r: any) => r && r.id === 'target')).not.toThrow()
    const result = rows.find((r: any) => r && r.id === 'target')
    expect(result).toBeUndefined()
  })

  it('findIndex with `r && r.id === target` guard: returns -1 not throw on all-holes', () => {
    const rows: any[] = new Array(1_000_000)
    expect(() => rows.findIndex((r: any) => r && r.id === 'x')).not.toThrow()
    expect(rows.findIndex((r: any) => r && r.id === 'x')).toBe(-1)
  })

  it('for-of with `if (!row) continue` guard: visits only loaded indices', () => {
    const rows: any[] = new Array(100)
    rows[10] = { id: 'a' }
    rows[20] = { id: 'b' }
    rows[30] = { id: 'c' }

    const visited: string[] = []
    for (const row of rows) {
      if (!row) continue
      visited.push(row.id)
    }
    expect(visited).toEqual(['a', 'b', 'c'])
  })

  it('for-of without guard would NPE on first hole', () => {
    const rows: any[] = new Array(100)
    rows[10] = { id: 'a' }

    expect(() => {
      for (const row of rows) {
        // Without `if (!row) continue` this throws on row[0] which is a hole.
        void row.id
      }
    }).toThrow(TypeError)
  })

  it('isSparsePlaceholder is hole-safe (returns false on undefined)', () => {
    // Production guards combine `!row || isSparsePlaceholder(row)` because
    // isSparsePlaceholder alone returns false on undefined (it requires a
    // truthy object). Verify that contract.
    expect(isSparsePlaceholder(undefined)).toBe(false)
    // So consumers MUST add the `!row ||` prefix to handle holes.
    const isHoleOrSparse = (row: unknown): boolean =>
      !row || isSparsePlaceholder(row)
    expect(isHoleOrSparse(undefined)).toBe(true)
    expect(isHoleOrSparse(null)).toBe(true)
    expect(isHoleOrSparse({ __sparse: true, id: SPARSE_PLACEHOLDER_ID })).toBe(true)
    expect(isHoleOrSparse({ id: 'real', data: {} })).toBe(false)
  })
})

describe('GH#2812 — totalHeight calculation with sparse rows', () => {
  // Mirrors SimplePassiveRenderer.renderBody's totalHeight computation:
  // forEach skips holes → loadedHeightSum + holeCount × ROW_HEIGHT.
  const ROW_HEIGHT = 40

  it('forEach over sparse rows: counts only loaded entries', () => {
    const rows: any[] = new Array(1000)
    for (let i = 0; i < 50; i++) {
      rows[100 + i] = { height: 40 }
    }

    let loadedHeightSum = 0
    let loadedCount = 0
    rows.forEach((row: any) => {
      loadedHeightSum += row.height || ROW_HEIGHT
      loadedCount++
    })

    expect(loadedCount).toBe(50)
    expect(loadedHeightSum).toBe(50 * 40)

    // Production formula: loadedHeightSum + holeCount × ROW_HEIGHT.
    const holeCount = rows.length - loadedCount
    const totalHeight = loadedHeightSum + holeCount * ROW_HEIGHT
    expect(totalHeight).toBe(1000 * 40) // 1000 rows × 40px
  })

  it('mixed heights: variable-height loaded rows + ROW_HEIGHT for holes', () => {
    const rows: any[] = new Array(10)
    rows[0] = { height: 60 } // expanded row
    rows[1] = { height: 40 }
    rows[2] = { height: 80 } // expanded row
    // rows[3..9] are holes

    let loadedHeightSum = 0
    let loadedCount = 0
    rows.forEach((row: any) => {
      loadedHeightSum += row.height || ROW_HEIGHT
      loadedCount++
    })

    const holeCount = rows.length - loadedCount
    const totalHeight = loadedHeightSum + holeCount * ROW_HEIGHT
    // 60 + 40 + 80 + (7 × 40) = 180 + 280 = 460
    expect(totalHeight).toBe(460)
  })
})

describe('GH#2812 — SimplePassiveRenderer visible-row loop synthesizes placeholders', () => {
  // The renderer changed from `visibleRows.forEach((row, i) => ...)` to
  // `for (let i = startIndex; i < endIndex; i++) { let row = rows[i]; if
  // (row === undefined) row = synthesize() ... }`. This test verifies the
  // synthesis pattern itself (the renderer's actual DOM mutation requires a
  // full grid harness which other tests cover).
  const ROW_HEIGHT = 40

  function synthesizeSparseVirtualRow(actualRowIndex: number) {
    return {
      type: 'data' as const,
      id: `__sparse_${actualRowIndex}__`,
      index: actualRowIndex,
      dataIndex: actualRowIndex,
      height: ROW_HEIGHT,
      data: { __sparse: true, id: SPARSE_PLACEHOLDER_ID },
      __sparse: true as const,
    }
  }

  it('synthesizes a VirtualRow for hole indices in the visible range', () => {
    const rows: any[] = new Array(1000)
    rows[100] = {
      type: 'data',
      id: 'real-100',
      index: 100,
      dataIndex: 100,
      height: 40,
      data: { id: 'real-100' },
    }

    const startIndex = 95
    const endIndex = 105
    const visited: any[] = []

    for (let actualRowIndex = startIndex; actualRowIndex < endIndex; actualRowIndex++) {
      let row = rows[actualRowIndex]
      if (row === undefined) {
        row = synthesizeSparseVirtualRow(actualRowIndex)
      }
      visited.push({ index: actualRowIndex, id: row.id, isSparse: !!row.__sparse })
    }

    // Visited every visible index (95..104) — 10 entries.
    expect(visited).toHaveLength(10)
    // 9 holes total: [95..99] (5) + [101..104] (4) → all synthesized sparse.
    expect(visited.filter((v) => v.isSparse).length).toBe(9)
    expect(visited.filter((v) => v.isSparse && v.index < 100).length).toBe(5)
    expect(visited.filter((v) => v.isSparse && v.index > 100).length).toBe(4)
    // The real row at 100 came through as-is — NOT a synthesized sparse row.
    expect(visited.find((v) => v.index === 100)?.id).toBe('real-100')
    expect(visited.find((v) => v.index === 100)?.isSparse).toBeFalsy()
  })

  it('synthesized row has unique id per index (no collisions in activeRows Map)', () => {
    // Critical: the renderer tracks DOM elements in `this.activeRows.set(row.id, el)`.
    // If multiple holes synthesized the same id, only the LAST DOM element would
    // survive and the others would leak. Using `__sparse_${index}__` keeps each
    // unique.
    const r1 = synthesizeSparseVirtualRow(50)
    const r2 = synthesizeSparseVirtualRow(51)
    const r3 = synthesizeSparseVirtualRow(50)
    expect(r1.id).not.toBe(r2.id)
    expect(r1.id).toBe(r3.id) // same index → same id (idempotent)

    const map = new Map<string, string>()
    map.set(r1.id, 'el1')
    map.set(r2.id, 'el2')
    expect(map.size).toBe(2)
  })

  it('synthesized row is identifiable via isSparsePlaceholder on wrapper', () => {
    // Production guards check isSparsePlaceholder(virtualRow) (not just .data).
    // The synthesized wrapper carries __sparse: true so guards succeed.
    const synthetic = synthesizeSparseVirtualRow(42)
    expect(isSparsePlaceholder(synthetic)).toBe(true)
    expect(isSparsePlaceholder(synthetic.data)).toBe(true)
  })
})
