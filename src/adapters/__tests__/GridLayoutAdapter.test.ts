/**
 * GridLayoutAdapter Tests
 *
 * Tests for configurable grid form layout adapter:
 * - Auto-placement (fields fill grid in order)
 * - Explicit placement (row, col, span)
 * - Keyboard navigation (up, down, left, right)
 * - Tab order (row-major)
 * - CSS grid template generation
 * - Field style computation
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { GridLayoutAdapter } from '../GridLayoutAdapter'
import type { Column } from '../../types'
import type { FieldPlacement } from '../../types/layout-types'

describe('GridLayoutAdapter', () => {
  let columns: Column[]

  beforeEach(() => {
    columns = [
      { id: 'name', field: 'name', name: 'Name', cellType: 'text' },
      { id: 'email', field: 'email', name: 'Email', cellType: 'text' },
      { id: 'status', field: 'status', name: 'Status', cellType: 'text' },
      { id: 'priority', field: 'priority', name: 'Priority', cellType: 'text' },
      { id: 'description', field: 'description', name: 'Description', cellType: 'text' },
    ]
  })

  describe('auto-placement (default 2 columns)', () => {
    it('places fields in row-major order', () => {
      const adapter = new GridLayoutAdapter({ columns })

      // 5 fields in 2 columns:
      // Row 0: name, email
      // Row 1: status, priority
      // Row 2: description
      expect(adapter.getCellPosition('name')).toEqual({ row: 0, col: 0 })
      expect(adapter.getCellPosition('email')).toEqual({ row: 0, col: 1 })
      expect(adapter.getCellPosition('status')).toEqual({ row: 1, col: 0 })
      expect(adapter.getCellPosition('priority')).toEqual({ row: 1, col: 1 })
      expect(adapter.getCellPosition('description')).toEqual({ row: 2, col: 0 })
    })

    it('returns correct total rows', () => {
      const adapter = new GridLayoutAdapter({ columns })
      expect(adapter.getTotalRows()).toBe(3)
    })

    it('handles empty columns', () => {
      const adapter = new GridLayoutAdapter({ columns: [] })
      expect(adapter.getTotalRows()).toBe(0)
      expect(adapter.getTabOrder()).toEqual([])
    })
  })

  describe('auto-placement with 3 columns', () => {
    it('places fields in 3-column grid', () => {
      const adapter = new GridLayoutAdapter({ columns, gridColumns: 3 })

      // 5 fields in 3 columns:
      // Row 0: name, email, status
      // Row 1: priority, description
      expect(adapter.getCellPosition('name')).toEqual({ row: 0, col: 0 })
      expect(adapter.getCellPosition('email')).toEqual({ row: 0, col: 1 })
      expect(adapter.getCellPosition('status')).toEqual({ row: 0, col: 2 })
      expect(adapter.getCellPosition('priority')).toEqual({ row: 1, col: 0 })
      expect(adapter.getCellPosition('description')).toEqual({ row: 1, col: 1 })
    })

    it('returns correct total rows for 3 columns', () => {
      const adapter = new GridLayoutAdapter({ columns, gridColumns: 3 })
      expect(adapter.getTotalRows()).toBe(2)
    })
  })

  describe('explicit field placements', () => {
    it('places fields at explicit positions', () => {
      const placements: FieldPlacement[] = [
        { fieldId: 'description', row: 0, col: 0, span: 2 },
        { fieldId: 'name', row: 1, col: 0 },
        { fieldId: 'email', row: 1, col: 1 },
      ]

      const adapter = new GridLayoutAdapter({
        columns,
        fieldPlacements: placements,
      })

      expect(adapter.getCellPosition('description')).toEqual({ row: 0, col: 0 })
      expect(adapter.getCellPosition('name')).toEqual({ row: 1, col: 0 })
      expect(adapter.getCellPosition('email')).toEqual({ row: 1, col: 1 })
    })

    it('auto-places remaining fields after explicit ones', () => {
      const placements: FieldPlacement[] = [{ fieldId: 'description', row: 0, col: 0, span: 2 }]

      const adapter = new GridLayoutAdapter({
        columns,
        fieldPlacements: placements,
      })

      // description at (0,0) span 2, fills row 0
      expect(adapter.getCellPosition('description')).toEqual({ row: 0, col: 0 })
      // name, email, status, priority auto-placed starting row 1
      expect(adapter.getCellPosition('name')).toEqual({ row: 1, col: 0 })
      expect(adapter.getCellPosition('email')).toEqual({ row: 1, col: 1 })
      expect(adapter.getCellPosition('status')).toEqual({ row: 2, col: 0 })
      expect(adapter.getCellPosition('priority')).toEqual({ row: 2, col: 1 })
    })

    it('respects span hints for auto-placed fields', () => {
      const placements: FieldPlacement[] = [
        { fieldId: 'description', span: 2 }, // span hint only, no position
      ]

      const adapter = new GridLayoutAdapter({
        columns,
        fieldPlacements: placements,
      })

      // name at (0,0), email at (0,1)
      // status at (1,0), priority at (1,1)
      // description auto-placed with span 2 at (2,0)
      expect(adapter.getCellPosition('name')).toEqual({ row: 0, col: 0 })
      expect(adapter.getCellPosition('email')).toEqual({ row: 0, col: 1 })
      expect(adapter.getCellPosition('status')).toEqual({ row: 1, col: 0 })
      expect(adapter.getCellPosition('priority')).toEqual({ row: 1, col: 1 })
      expect(adapter.getCellPosition('description')).toEqual({ row: 2, col: 0 })

      const placed = adapter.getPlacedField('description')
      expect(placed?.span).toBe(2)
    })

    it('ignores placements for unknown field IDs', () => {
      const placements: FieldPlacement[] = [{ fieldId: 'nonexistent', row: 0, col: 0 }]

      const adapter = new GridLayoutAdapter({
        columns,
        fieldPlacements: placements,
      })

      // All fields should be auto-placed normally
      expect(adapter.getCellPosition('name')).toEqual({ row: 0, col: 0 })
    })

    it('clamps span to not exceed grid boundary', () => {
      const placements: FieldPlacement[] = [
        { fieldId: 'name', row: 0, col: 1, span: 5 }, // span 5 from col 1 in 2-col grid
      ]

      const adapter = new GridLayoutAdapter({
        columns,
        fieldPlacements: placements,
      })

      const placed = adapter.getPlacedField('name')
      expect(placed?.span).toBe(1) // clamped to fit: gridColumns(2) - col(1) = 1
    })
  })

  describe('getFieldNeighbors', () => {
    it('returns all four neighbors for center field in 3-column grid', () => {
      const sixColumns: Column[] = [
        { id: 'a', field: 'a', name: 'A', cellType: 'text' },
        { id: 'b', field: 'b', name: 'B', cellType: 'text' },
        { id: 'c', field: 'c', name: 'C', cellType: 'text' },
        { id: 'd', field: 'd', name: 'D', cellType: 'text' },
        { id: 'e', field: 'e', name: 'E', cellType: 'text' },
        { id: 'f', field: 'f', name: 'F', cellType: 'text' },
      ]

      // 3-column grid:
      // Row 0: a, b, c
      // Row 1: d, e, f
      const adapter = new GridLayoutAdapter({ columns: sixColumns, gridColumns: 3 })

      const neighbors = adapter.getFieldNeighbors('e')
      expect(neighbors).toEqual({
        up: 'b',
        down: undefined,
        left: 'd',
        right: 'f',
      })
    })

    it('returns only down and right for top-left field', () => {
      const adapter = new GridLayoutAdapter({ columns })

      const neighbors = adapter.getFieldNeighbors('name')
      expect(neighbors.up).toBeUndefined()
      expect(neighbors.left).toBeUndefined()
      expect(neighbors.down).toBe('status')
      expect(neighbors.right).toBe('email')
    })

    it('returns empty object for unknown field', () => {
      const adapter = new GridLayoutAdapter({ columns })
      expect(adapter.getFieldNeighbors('unknown')).toEqual({})
    })

    it('navigates around spanning fields', () => {
      const threeColumns: Column[] = [
        { id: 'a', field: 'a', name: 'A', cellType: 'text' },
        { id: 'b', field: 'b', name: 'B', cellType: 'text' },
        { id: 'c', field: 'c', name: 'C', cellType: 'text' },
        { id: 'd', field: 'd', name: 'D', cellType: 'text' },
      ]

      const placements: FieldPlacement[] = [
        { fieldId: 'a', row: 0, col: 0, span: 2 }, // spans col 0 and 1
        { fieldId: 'b', row: 0, col: 2 },
        { fieldId: 'c', row: 1, col: 0 },
        { fieldId: 'd', row: 1, col: 1 },
      ]

      const adapter = new GridLayoutAdapter({
        columns: threeColumns,
        gridColumns: 3,
        fieldPlacements: placements,
      })

      // 'a' spans col 0-1, so right neighbor starts at col 2 = 'b'
      const neighborsA = adapter.getFieldNeighbors('a')
      expect(neighborsA.right).toBe('b')
      expect(neighborsA.down).toBe('c')

      // 'c' at (1,0), up should find 'a' at (0,0)
      const neighborsC = adapter.getFieldNeighbors('c')
      expect(neighborsC.up).toBe('a')
    })
  })

  describe('getCellPosition', () => {
    it('returns correct position', () => {
      const adapter = new GridLayoutAdapter({ columns })
      expect(adapter.getCellPosition('email')).toEqual({ row: 0, col: 1 })
    })

    it('throws for unknown field', () => {
      const adapter = new GridLayoutAdapter({ columns })
      expect(() => adapter.getCellPosition('unknown')).toThrow('Field not found: unknown')
    })
  })

  describe('getFieldAtPosition', () => {
    it('returns field ID at valid position', () => {
      const adapter = new GridLayoutAdapter({ columns })
      expect(adapter.getFieldAtPosition(0, 0)).toBe('name')
      expect(adapter.getFieldAtPosition(0, 1)).toBe('email')
      expect(adapter.getFieldAtPosition(1, 0)).toBe('status')
    })

    it('returns null for out-of-bounds position', () => {
      const adapter = new GridLayoutAdapter({ columns })
      expect(adapter.getFieldAtPosition(-1, 0)).toBeNull()
      expect(adapter.getFieldAtPosition(0, -1)).toBeNull()
      expect(adapter.getFieldAtPosition(0, 5)).toBeNull()
      expect(adapter.getFieldAtPosition(10, 0)).toBeNull()
    })

    it('returns field ID for spanned cells', () => {
      const placements: FieldPlacement[] = [{ fieldId: 'description', row: 0, col: 0, span: 2 }]

      const adapter = new GridLayoutAdapter({
        columns,
        fieldPlacements: placements,
      })

      // Both col 0 and col 1 of row 0 should return 'description'
      expect(adapter.getFieldAtPosition(0, 0)).toBe('description')
      expect(adapter.getFieldAtPosition(0, 1)).toBe('description')
    })
  })

  describe('getTabOrder', () => {
    it('returns fields in row-major order', () => {
      const adapter = new GridLayoutAdapter({ columns })
      expect(adapter.getTabOrder()).toEqual(['name', 'email', 'status', 'priority', 'description'])
    })

    it('returns deduplicated tab order for spanning fields', () => {
      const placements: FieldPlacement[] = [{ fieldId: 'description', row: 0, col: 0, span: 2 }]

      const adapter = new GridLayoutAdapter({
        columns,
        fieldPlacements: placements,
      })

      const tabOrder = adapter.getTabOrder()
      // description should appear exactly once even though it spans 2 columns
      const descCount = tabOrder.filter((id) => id === 'description').length
      expect(descCount).toBe(1)
    })

    it('returns empty array for no columns', () => {
      const adapter = new GridLayoutAdapter({ columns: [] })
      expect(adapter.getTabOrder()).toEqual([])
    })
  })

  describe('getGridTemplate', () => {
    it('returns correct template for 2 columns', () => {
      const adapter = new GridLayoutAdapter({ columns, gridColumns: 2 })
      expect(adapter.getGridTemplate()).toBe('1fr 1fr')
    })

    it('returns correct template for 3 columns', () => {
      const adapter = new GridLayoutAdapter({ columns, gridColumns: 3 })
      expect(adapter.getGridTemplate()).toBe('1fr 1fr 1fr')
    })

    it('returns correct template for 4 columns', () => {
      const adapter = new GridLayoutAdapter({ columns, gridColumns: 4 })
      expect(adapter.getGridTemplate()).toBe('1fr 1fr 1fr 1fr')
    })
  })

  describe('getContainerStyle', () => {
    it('returns correct container style', () => {
      const adapter = new GridLayoutAdapter({ columns, gridColumns: 3, fieldGap: '2rem' })
      const style = adapter.getContainerStyle()

      expect(style.display).toBe('grid')
      expect(style.gridTemplateColumns).toBe('1fr 1fr 1fr')
      expect(style.gap).toBe('2rem')
    })
  })

  describe('getFieldStyle', () => {
    it('returns base style for non-spanning field', () => {
      const adapter = new GridLayoutAdapter({ columns })
      const style = adapter.getFieldStyle('name')

      expect(style.display).toBe('flex')
      expect(style.flexDirection).toBe('column')
      expect(style.gridColumn).toBeUndefined()
    })

    it('returns span style for spanning field', () => {
      const placements: FieldPlacement[] = [{ fieldId: 'description', row: 0, col: 0, span: 2 }]

      const adapter = new GridLayoutAdapter({
        columns,
        fieldPlacements: placements,
      })

      const style = adapter.getFieldStyle('description')
      expect(style.gridColumn).toBe('span 2')
    })

    it('returns base style for unknown field', () => {
      const adapter = new GridLayoutAdapter({ columns })
      const style = adapter.getFieldStyle('unknown')

      expect(style.display).toBe('flex')
      expect(style.flexDirection).toBe('column')
    })
  })

  describe('updateColumns', () => {
    it('recomputes placements after column update', () => {
      const adapter = new GridLayoutAdapter({ columns })

      const newColumns: Column[] = [
        { id: 'x', field: 'x', name: 'X', cellType: 'text' },
        { id: 'y', field: 'y', name: 'Y', cellType: 'text' },
      ]

      adapter.updateColumns(newColumns)

      expect(adapter.getTabOrder()).toEqual(['x', 'y'])
      expect(adapter.getCellPosition('x')).toEqual({ row: 0, col: 0 })
      expect(adapter.getCellPosition('y')).toEqual({ row: 0, col: 1 })
    })
  })

  describe('updatePlacements', () => {
    it('recomputes placements after placement update', () => {
      const adapter = new GridLayoutAdapter({ columns })

      // Initially name is at (0,0)
      expect(adapter.getCellPosition('name')).toEqual({ row: 0, col: 0 })

      // Move name to explicit position
      adapter.updatePlacements([{ fieldId: 'name', row: 2, col: 1 }])

      expect(adapter.getCellPosition('name')).toEqual({ row: 2, col: 1 })
    })
  })

  describe('getGridColumnCount', () => {
    it('returns the configured grid column count', () => {
      const adapter = new GridLayoutAdapter({ columns, gridColumns: 4 })
      expect(adapter.getGridColumnCount()).toBe(4)
    })

    it('defaults to 2', () => {
      const adapter = new GridLayoutAdapter({ columns })
      expect(adapter.getGridColumnCount()).toBe(2)
    })
  })
})
