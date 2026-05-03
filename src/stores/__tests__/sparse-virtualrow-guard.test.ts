/**
 * GH#2804 review fix: sparse-marker propagation onto VirtualRow.
 *
 * Regression: external review found that grid pipeline guards
 * (BodyRenderer, SelectionController, KeyboardNavigationController, etc.)
 * called `isSparsePlaceholder(row)` against the VirtualRow wrapper but the
 * `__sparse: true` marker lives on the *raw* row buried under
 * `virtualRow.data`. Every guard was dead code.
 *
 * Fix: at the wrapping site (TableCoreStore.processedRows + IncrementalRow-
 * Processor.wrapInVirtualRows), propagate `__sparse: true` onto the wrapper
 * so existing guards work correctly without changing every call site.
 */

import { describe, it, expect } from 'vitest'
import {
  isSparsePlaceholder,
  SPARSE_PLACEHOLDER_ID,
  TableCoreStore,
  type SparsePlaceholder,
} from '../TableCoreStore'
import type { Column } from '../../types'

function makeRow(id: string): { id: string; data: { ord: number } } {
  return { id, data: { ord: Number(id.replace(/\D/g, '')) || 0 } }
}

describe('GH#2804 review fix — sparse marker propagated onto VirtualRow', () => {
  it('isSparsePlaceholder returns true for a raw SparsePlaceholder', () => {
    const placeholder: SparsePlaceholder = { __sparse: true, id: SPARSE_PLACEHOLDER_ID }
    expect(isSparsePlaceholder(placeholder)).toBe(true)
  })

  it('isSparsePlaceholder returns true on the VirtualRow wrapper after propagation', () => {
    // Construct a VirtualRow as it would be produced by TableCoreStore's
    // wrapping site — type, id, index, data, plus the lifted __sparse marker.
    const placeholder: SparsePlaceholder = { __sparse: true, id: SPARSE_PLACEHOLDER_ID }
    const virtualRow = {
      type: 'data' as const,
      id: placeholder.id,
      index: 0,
      dataIndex: 0,
      height: 40,
      data: placeholder,
      __sparse: true as const,
    }

    // The .data slot is sparse:
    expect(isSparsePlaceholder(virtualRow.data)).toBe(true)
    // And so is the wrapper itself — this is what production guards check:
    expect(isSparsePlaceholder(virtualRow)).toBe(true)
  })

  it('VirtualRow wrapping at TableCoreStore.processedRows lifts __sparse from raw rows', () => {
    // Direct test of the wrapping behavior: feed raw rows that include a
    // sparse marker and verify the wrapped VirtualRow surfaces the marker.
    // (TableCoreStore.baseRows currently slices to the loaded window in
    // sparse mode, so we exercise the wrapping site by feeding mixed rows
    // through setRows. The wrapping logic in `processedRows` is the same
    // function that will surface sparse VirtualRows once the substrate hook
    // routes placeholders through the JS pipeline.)
    const store = new TableCoreStore('rfi')
    const columns: Column[] = [
      { id: 'id', label: 'ID', type: 'text', fieldType: { type: 'text' } } as any,
    ]
    ;(store as any).columns = columns
    ;(store as any).isSchemaLoaded = true

    const sparseLike: { id: string; __sparse: true } = { id: SPARSE_PLACEHOLDER_ID, __sparse: true }
    store.setRows([makeRow('a'), sparseLike as any, makeRow('c')])

    const rows = store.processedRows
    expect(rows.length).toBe(3)

    // Real rows: no sparse marker on wrapper.
    expect(isSparsePlaceholder(rows[0])).toBe(false)
    expect(rows[0].id).toBe('a')
    expect(isSparsePlaceholder(rows[2])).toBe(false)
    expect(rows[2].id).toBe('c')

    // Sparse row: __sparse propagated onto VirtualRow wrapper, so production
    // guards calling isSparsePlaceholder(virtualRow) correctly skip it.
    expect(isSparsePlaceholder(rows[1])).toBe(true)
    expect((rows[1] as { __sparse?: true }).__sparse).toBe(true)
    // The raw row also still carries the marker via .data:
    expect(isSparsePlaceholder(rows[1].data)).toBe(true)
  })

  it('non-sparse rows do NOT receive a __sparse marker on the wrapper', () => {
    const store = new TableCoreStore('rfi')
    const columns: Column[] = [
      { id: 'id', label: 'ID', type: 'text', fieldType: { type: 'text' } } as any,
    ]
    ;(store as any).columns = columns
    ;(store as any).isSchemaLoaded = true

    store.setRows([makeRow('a'), makeRow('b'), makeRow('c')])
    const rows = store.processedRows

    expect(rows.length).toBe(3)
    for (const r of rows) {
      expect(isSparsePlaceholder(r)).toBe(false)
      // Explicit absence — TS narrowing on optional field
      expect((r as { __sparse?: true }).__sparse).toBeUndefined()
    }
  })
})
