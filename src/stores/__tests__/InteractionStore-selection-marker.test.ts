/**
 * GH#2804 B10: InteractionStore selection-marker model tests.
 *
 * Verifies the discriminated `selection` state, mode-aware actions, and
 * backward-compat behavior of the legacy `selectedCells` / `selectedRows`
 * Sets in both modes.
 *
 * Spec: docs/planning/specs/2804-smart-100k-row-system.md (B10)
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { InteractionStore } from '../InteractionStore'

describe('InteractionStore — selection marker model (GH#2804 B10)', () => {
  let store: InteractionStore

  beforeEach(() => {
    store = new InteractionStore()
  })

  describe('default state', () => {
    it("starts in 'explicit' mode with empty Sets", () => {
      expect(store.selectionMarkerMode).toBe('explicit')
      expect(store.selection.mode).toBe('explicit')
      if (store.selection.mode !== 'explicit') throw new Error('unreachable')
      expect(store.selection.cells.size).toBe(0)
      expect(store.selection.rows.size).toBe(0)
      expect(store.selectionExclusions.size).toBe(0)
      expect(store.selectionExplicitCells.size).toBe(0)
    })
  })

  describe('explicit mode', () => {
    it('toggleRowSelection adds row id to selectedRows', () => {
      store.toggleRowSelection('row-1')
      expect(store.selectedRows.has('row-1')).toBe(true)
      expect(store.selection.mode).toBe('explicit')
      if (store.selection.mode !== 'explicit') throw new Error('unreachable')
      expect(store.selection.rows.has('row-1')).toBe(true)
    })

    it('toggleRowSelection on already-selected row removes it', () => {
      store.toggleRowSelection('row-1')
      store.toggleRowSelection('row-1')
      expect(store.selectedRows.has('row-1')).toBe(false)
    })

    it('toggleCellSelection2 adds cell id to selectedCells', () => {
      store.toggleCellSelection2('row-1:col-name')
      expect(store.selectedCells.has('row-1:col-name')).toBe(true)
    })

    it('toggleCellSelection2 on already-selected cell removes it', () => {
      store.toggleCellSelection2('row-1:col-name')
      store.toggleCellSelection2('row-1:col-name')
      expect(store.selectedCells.has('row-1:col-name')).toBe(false)
    })
  })

  describe('marker mode (all-with-exclusions)', () => {
    it("setSelectionMode('all-with-exclusions') resets to empty marker", () => {
      // Pre-populate explicit selection to verify it's cleared on mode switch.
      store.toggleRowSelection('row-pre')
      store.toggleCellSelection2('row-pre:col')

      store.setSelectionMode('all-with-exclusions')

      expect(store.selectionMarkerMode).toBe('all-with-exclusions')
      expect(store.selection.mode).toBe('all-with-exclusions')
      if (store.selection.mode !== 'all-with-exclusions') throw new Error('unreachable')
      expect(store.selection.exclusions.size).toBe(0)
      expect(store.selection.explicitCells.size).toBe(0)
      // Legacy Sets cleared on mode switch.
      expect(store.selectedRows.size).toBe(0)
      expect(store.selectedCells.size).toBe(0)
    })

    it('toggleRowSelection in marker mode adds id to exclusions, not selectedRows', () => {
      store.setSelectionMode('all-with-exclusions')
      store.toggleRowSelection('row-50')

      expect(store.selectionExclusions.has('row-50')).toBe(true)
      expect(store.selectedRows.has('row-50')).toBe(false)
      // Mode stays in marker after a toggle (spec verify case:
      // "row 50 added to exclusions, allSelected stays true").
      expect(store.selectionMarkerMode).toBe('all-with-exclusions')

      if (store.selection.mode !== 'all-with-exclusions') throw new Error('unreachable')
      expect(store.selection.exclusions.has('row-50')).toBe(true)
    })

    it('toggleRowSelection twice in marker mode removes from exclusions (re-includes the row)', () => {
      store.setSelectionMode('all-with-exclusions')
      store.toggleRowSelection('row-50')
      store.toggleRowSelection('row-50')

      expect(store.selectionExclusions.has('row-50')).toBe(false)
      expect(store.selectionExclusions.size).toBe(0)
    })

    it('toggleCellSelection2 in marker mode adds id to explicitCells, not selectedCells', () => {
      store.setSelectionMode('all-with-exclusions')
      store.toggleCellSelection2('row-1:col-name')

      expect(store.selectionExplicitCells.has('row-1:col-name')).toBe(true)
      expect(store.selectedCells.has('row-1:col-name')).toBe(false)
    })

    it('clearSelection from marker mode resets to explicit / empty', () => {
      store.setSelectionMode('all-with-exclusions')
      store.toggleRowSelection('row-1')
      store.toggleRowSelection('row-2')
      store.toggleRowSelection('row-3')
      store.toggleRowSelection('row-4')
      store.toggleRowSelection('row-5')

      expect(store.selectionExclusions.size).toBe(5)

      store.clearSelection()

      expect(store.selectionMarkerMode).toBe('explicit')
      expect(store.selection.mode).toBe('explicit')
      expect(store.selectionExclusions.size).toBe(0)
      expect(store.selectionExplicitCells.size).toBe(0)
      expect(store.selectedRows.size).toBe(0)
      expect(store.selectedCells.size).toBe(0)
    })
  })

  describe('selection version tracking', () => {
    it('bumps selectionVersion on setSelectionMode', () => {
      const before = store.selectionVersion
      store.setSelectionMode('all-with-exclusions')
      expect(store.selectionVersion).toBeGreaterThan(before)
    })

    it('bumps selectionVersion on toggleRowSelection (both modes)', () => {
      const v0 = store.selectionVersion
      store.toggleRowSelection('r1')
      expect(store.selectionVersion).toBeGreaterThan(v0)

      store.setSelectionMode('all-with-exclusions')
      const v1 = store.selectionVersion
      store.toggleRowSelection('r2')
      expect(store.selectionVersion).toBeGreaterThan(v1)
    })
  })

  describe('backward-compat: legacy Sets remain readable', () => {
    it('selectedCells / selectedRows accessors return live Set in explicit mode', () => {
      // Verify the Spec's "Backward-compat strategy: explicit-mode behavior is
      // byte-identical to today" — direct legacy mutation still works.
      store.selectedCells = new Set(['row1:colA', 'row1:colB'])
      store.selectedRows = new Set(['row1'])

      expect(store.selectedCells.size).toBe(2)
      expect(store.selectedRows.size).toBe(1)
      // selection getter mirrors the legacy state.
      if (store.selection.mode !== 'explicit') throw new Error('unreachable')
      expect(store.selection.cells.size).toBe(2)
      expect(store.selection.rows.size).toBe(1)
    })

    it('legacy selectedCells stays empty in marker mode (no 100k Set materialized)', () => {
      store.setSelectionMode('all-with-exclusions')
      // Even after toggling many "exclusions", the legacy selectedCells/Rows
      // never grow — that's the whole point of the marker model.
      for (let i = 0; i < 50; i++) {
        store.toggleRowSelection(`row-${i}`)
      }
      expect(store.selectedCells.size).toBe(0)
      expect(store.selectedRows.size).toBe(0)
      expect(store.selectionExclusions.size).toBe(50)
    })
  })

  describe('reset()', () => {
    it('reset() clears marker-mode state', () => {
      store.setSelectionMode('all-with-exclusions')
      store.toggleRowSelection('r1')

      store.reset()

      expect(store.selectionMarkerMode).toBe('explicit')
      expect(store.selectionExclusions.size).toBe(0)
      expect(store.selectionExplicitCells.size).toBe(0)
    })
  })
})
