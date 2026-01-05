/**
 * GridAdapter Tests
 *
 * Tests for traditional grid layout adapter
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { GridAdapter } from '../GridAdapter'
import type { Column } from '../../types'

describe('GridAdapter', () => {
	let adapter: GridAdapter
	let columns: Column[]
	let rows: any[]

	beforeEach(() => {
		// Mock columns
		columns = [
			{ id: 'name', field: 'name', name: 'Name', cellType: 'text', width: 150, editable: true },
			{
				id: 'email',
				field: 'email',
				name: 'Email',
				cellType: 'text',
				width: 200,
				editable: true,
			},
			{
				id: 'status',
				field: 'status',
				name: 'Status',
				cellType: 'select',
				width: 120,
				editable: true,
			},
		]

		// Mock rows
		rows = [
			{ id: 'row1', data: { name: 'Alice', email: 'alice@example.com', status: 'active' } },
			{ id: 'row2', data: { name: 'Bob', email: 'bob@example.com', status: 'inactive' } },
			{ id: 'row3', data: { name: 'Charlie', email: 'charlie@example.com', status: 'active' } },
		]

		adapter = new GridAdapter({ columns, rows })
	})

	describe('getFieldNeighbors', () => {
		it('returns all four neighbors for middle cell', () => {
			const neighbors = adapter.getFieldNeighbors('row2:email')
			expect(neighbors).toEqual({
				up: 'row1:email',
				down: 'row3:email',
				left: 'row2:name',
				right: 'row2:status',
			})
		})

		it('returns only down and right for top-left cell', () => {
			const neighbors = adapter.getFieldNeighbors('row1:name')
			expect(neighbors).toEqual({
				down: 'row2:name',
				right: 'row1:email',
			})
		})

		it('returns only up and left for bottom-right cell', () => {
			const neighbors = adapter.getFieldNeighbors('row3:status')
			expect(neighbors).toEqual({
				up: 'row2:status',
				left: 'row3:email',
			})
		})

		it('skips selection column when navigating left/right', () => {
			const columnsWithSelection: Column[] = [
				{
					id: 'selection',
					field: 'selection',
					name: '',
					cellType: 'select',
					width: 40,
					editable: false,
				},
				...columns,
			]
			const adapterWithSelection = new GridAdapter({
				columns: columnsWithSelection,
				rows,
			})

			const neighbors = adapterWithSelection.getFieldNeighbors('row1:name')
			// Should skip selection column and go to email
			expect(neighbors.right).toBe('row1:email')
		})

		it('returns empty object for invalid field ID format', () => {
			const neighbors = adapter.getFieldNeighbors('invalid')
			expect(neighbors).toEqual({})
		})

		it('returns empty object for unknown field ID', () => {
			const neighbors = adapter.getFieldNeighbors('unknown:field')
			expect(neighbors).toEqual({})
		})
	})

	describe('getCellPosition', () => {
		it('returns correct position for first cell', () => {
			const position = adapter.getCellPosition('row1:name')
			expect(position).toEqual({ row: 0, col: 0 })
		})

		it('returns correct position for middle cell', () => {
			const position = adapter.getCellPosition('row2:email')
			expect(position).toEqual({ row: 1, col: 1 })
		})

		it('returns correct position for last cell', () => {
			const position = adapter.getCellPosition('row3:status')
			expect(position).toEqual({ row: 2, col: 2 })
		})

		it('throws error for invalid field ID format', () => {
			expect(() => adapter.getCellPosition('invalid')).toThrow('Invalid field ID format')
		})

		it('throws error for unknown field ID', () => {
			expect(() => adapter.getCellPosition('unknown:field')).toThrow('Field not found')
		})
	})

	describe('getFieldAtPosition', () => {
		it('returns field ID for valid position', () => {
			const fieldId = adapter.getFieldAtPosition(0, 0)
			expect(fieldId).toBe('row1:name')
		})

		it('returns field ID for middle position', () => {
			const fieldId = adapter.getFieldAtPosition(1, 1)
			expect(fieldId).toBe('row2:email')
		})

		it('returns null for row out of bounds (negative)', () => {
			const fieldId = adapter.getFieldAtPosition(-1, 0)
			expect(fieldId).toBeNull()
		})

		it('returns null for row out of bounds (too large)', () => {
			const fieldId = adapter.getFieldAtPosition(10, 0)
			expect(fieldId).toBeNull()
		})

		it('returns null for column out of bounds (negative)', () => {
			const fieldId = adapter.getFieldAtPosition(0, -1)
			expect(fieldId).toBeNull()
		})

		it('returns null for column out of bounds (too large)', () => {
			const fieldId = adapter.getFieldAtPosition(0, 10)
			expect(fieldId).toBeNull()
		})
	})

	describe('getTabOrder', () => {
		it('returns cells in left-to-right, top-to-bottom order', () => {
			const tabOrder = adapter.getTabOrder()
			expect(tabOrder).toEqual([
				'row1:name',
				'row1:email',
				'row1:status',
				'row2:name',
				'row2:email',
				'row2:status',
				'row3:name',
				'row3:email',
				'row3:status',
			])
		})

		it('skips selection column in tab order', () => {
			const columnsWithSelection: Column[] = [
				{
					id: 'selection',
					field: 'selection',
					name: '',
					cellType: 'select',
					width: 40,
					editable: false,
				},
				...columns,
			]
			const adapterWithSelection = new GridAdapter({
				columns: columnsWithSelection,
				rows,
			})

			const tabOrder = adapterWithSelection.getTabOrder()
			expect(tabOrder).not.toContain('row1:selection')
			expect(tabOrder[0]).toBe('row1:name')
		})

		it('returns empty array for no rows', () => {
			const emptyAdapter = new GridAdapter({ columns, rows: [] })
			const tabOrder = emptyAdapter.getTabOrder()
			expect(tabOrder).toEqual([])
		})
	})

	describe('getGridTemplate', () => {
		it('returns CSS grid template with column widths', () => {
			const template = adapter.getGridTemplate()
			expect(template).toBe('150px 200px 120px')
		})

		it('uses default width for columns without width', () => {
			const columnsNoWidth: Column[] = [
				{ id: 'a', field: 'a', name: 'A', cellType: 'text', editable: true },
				{ id: 'b', field: 'b', name: 'B', cellType: 'text', editable: true },
			]
			const adapterNoWidth = new GridAdapter({ columns: columnsNoWidth, rows })
			const template = adapterNoWidth.getGridTemplate()
			expect(template).toBe('150px 150px') // Default width is 150px
		})
	})

	describe('getFieldStyle', () => {
		it('returns correct grid positioning for first cell', () => {
			const style = adapter.getFieldStyle('row1:name')
			expect(style).toEqual({
				gridRow: 1, // CSS grid is 1-indexed
				gridColumn: 1,
			})
		})

		it('returns correct grid positioning for middle cell', () => {
			const style = adapter.getFieldStyle('row2:email')
			expect(style).toEqual({
				gridRow: 2,
				gridColumn: 2,
			})
		})

		it('returns correct grid positioning for last cell', () => {
			const style = adapter.getFieldStyle('row3:status')
			expect(style).toEqual({
				gridRow: 3,
				gridColumn: 3,
			})
		})
	})

	describe('updateData', () => {
		it('updates columns and rows', () => {
			const newColumns: Column[] = [
				{ id: 'a', field: 'a', name: 'A', cellType: 'text', width: 100, editable: true },
			]
			const newRows = [{ id: 'r1', data: { a: 'test' } }]

			adapter.updateData(newColumns, newRows)

			const tabOrder = adapter.getTabOrder()
			expect(tabOrder).toEqual(['r1:a'])
		})

		it('handles empty data update', () => {
			adapter.updateData([], [])
			const tabOrder = adapter.getTabOrder()
			expect(tabOrder).toEqual([])
		})

		it('updates field neighbors after data update', () => {
			const newColumns: Column[] = [
				{ id: 'x', field: 'x', name: 'X', cellType: 'text', width: 100, editable: true },
				{ id: 'y', field: 'y', name: 'Y', cellType: 'text', width: 100, editable: true },
			]
			const newRows = [
				{ id: 'r1', data: { x: '1', y: '2' } },
				{ id: 'r2', data: { x: '3', y: '4' } },
			]

			adapter.updateData(newColumns, newRows)

			const neighbors = adapter.getFieldNeighbors('r1:x')
			expect(neighbors).toEqual({
				down: 'r2:x',
				right: 'r1:y',
			})
		})
	})

	describe('dynamic getters', () => {
		it('uses getRows callback when provided', () => {
			let currentRows = rows
			const dynamicAdapter = new GridAdapter({
				columns,
				rows: [],
				getRows: () => currentRows,
			})

			const neighbors1 = dynamicAdapter.getFieldNeighbors('row1:name')
			expect(neighbors1.down).toBe('row2:name')

			// Change rows
			currentRows = [rows[0]] // Only first row
			const neighbors2 = dynamicAdapter.getFieldNeighbors('row1:name')
			expect(neighbors2.down).toBeUndefined() // No more rows below
		})

		it('uses getColumns callback when provided', () => {
			let currentColumns = columns
			const dynamicAdapter = new GridAdapter({
				columns: [],
				rows,
				getColumns: () => currentColumns,
			})

			const neighbors1 = dynamicAdapter.getFieldNeighbors('row1:name')
			expect(neighbors1.right).toBe('row1:email')

			// Change columns
			currentColumns = [columns[0]] // Only first column
			const neighbors2 = dynamicAdapter.getFieldNeighbors('row1:name')
			expect(neighbors2.right).toBeUndefined() // No more columns to the right
		})
	})
})
