/**
 * GH#2994: toggleRowCells multi-row checkbox selection tests.
 *
 * Verifies that:
 *   - Repeated row-checkbox clicks ACCUMULATE selections across rows.
 *   - Toggling a selected row off only removes that row's cells.
 *   - When the existing selection is a partial-column drag (not full rows),
 *     toggleRowCells REPLACES the selection (preserves d705c81b overlay fix).
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { InteractionStore } from '../InteractionStore'

describe('InteractionStore — toggleRowCells multi-row (GH#2994)', () => {
  let store: InteractionStore
  const cols = [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }]

  beforeEach(() => {
    store = new InteractionStore()
  })

  it('accumulates cells across multiple row-checkbox clicks', () => {
    store.toggleRowCells('rowA', cols)
    store.toggleRowCells('rowB', cols)

    expect(store.selectedCells.size).toBe(2 * cols.length)
    for (const col of cols) {
      expect(store.selectedCells.has(`rowA:${col.id}`)).toBe(true)
      expect(store.selectedCells.has(`rowB:${col.id}`)).toBe(true)
    }
  })

  it('toggling off the second row leaves the first row selected', () => {
    store.toggleRowCells('rowA', cols)
    store.toggleRowCells('rowB', cols)
    store.toggleRowCells('rowB', cols)

    expect(store.selectedCells.size).toBe(cols.length)
    for (const col of cols) {
      expect(store.selectedCells.has(`rowA:${col.id}`)).toBe(true)
      expect(store.selectedCells.has(`rowB:${col.id}`)).toBe(false)
    }
  })

  it('replaces a partial-column drag selection rather than mixing it in', () => {
    // Seed a partial-column drag: rowA selected on only c1 (not c2/c3).
    store.selectedCells = new Set<string>([
      'rowA:c1',
      'rowX:c1',
    ])

    store.toggleRowCells('rowB', cols)

    expect(store.selectedCells.size).toBe(cols.length)
    expect(store.selectedCells.has('rowA:c1')).toBe(false)
    expect(store.selectedCells.has('rowX:c1')).toBe(false)
    for (const col of cols) {
      expect(store.selectedCells.has(`rowB:${col.id}`)).toBe(true)
    }
  })
})
