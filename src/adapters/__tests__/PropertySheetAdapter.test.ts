/**
 * PropertySheetAdapter Tests
 *
 * Tests for vertical property sheet layout adapter
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { PropertySheetAdapter } from '../PropertySheetAdapter'
import type { Column } from '../../types'

describe('PropertySheetAdapter', () => {
	let adapter: PropertySheetAdapter
	let columns: Column[]

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
			{ id: 'phone', field: 'phone', name: 'Phone', cellType: 'text', width: 150, editable: true },
			{
				id: 'status',
				field: 'status',
				name: 'Status',
				cellType: 'select',
				width: 120,
				editable: true,
			},
		]

		adapter = new PropertySheetAdapter({ columns })
	})

	describe('getFieldNeighbors', () => {
		it('returns down neighbor for first field', () => {
			const neighbors = adapter.getFieldNeighbors('name')
			expect(neighbors).toEqual({
				down: 'email',
			})
		})

		it('returns up and down neighbors for middle field', () => {
			const neighbors = adapter.getFieldNeighbors('email')
			expect(neighbors).toEqual({
				up: 'name',
				down: 'phone',
			})
		})

		it('returns up neighbor for last field', () => {
			const neighbors = adapter.getFieldNeighbors('status')
			expect(neighbors).toEqual({
				up: 'phone',
			})
		})

		it('returns empty object for unknown field', () => {
			const neighbors = adapter.getFieldNeighbors('unknown')
			expect(neighbors).toEqual({})
		})

		it('does not return left/right neighbors (vertical layout)', () => {
			const neighbors = adapter.getFieldNeighbors('email')
			expect(neighbors.left).toBeUndefined()
			expect(neighbors.right).toBeUndefined()
		})
	})

	describe('getCellPosition', () => {
		it('returns correct row index and column 0 for first field', () => {
			const position = adapter.getCellPosition('name')
			expect(position).toEqual({ row: 0, col: 0 })
		})

		it('returns correct row index and column 0 for middle field', () => {
			const position = adapter.getCellPosition('email')
			expect(position).toEqual({ row: 1, col: 0 })
		})

		it('returns correct row index and column 0 for last field', () => {
			const position = adapter.getCellPosition('status')
			expect(position).toEqual({ row: 3, col: 0 })
		})

		it('throws error for unknown field', () => {
			expect(() => adapter.getCellPosition('unknown')).toThrow('Field not found: unknown')
		})
	})

	describe('getFieldAtPosition', () => {
		it('returns field ID for valid position (row 0, col 0)', () => {
			const fieldId = adapter.getFieldAtPosition(0, 0)
			expect(fieldId).toBe('name')
		})

		it('returns field ID for valid position (row 2, col 0)', () => {
			const fieldId = adapter.getFieldAtPosition(2, 0)
			expect(fieldId).toBe('phone')
		})

		it('returns null for invalid column (col > 0)', () => {
			const fieldId = adapter.getFieldAtPosition(0, 1)
			expect(fieldId).toBeNull()
		})

		it('returns null for row out of bounds (negative)', () => {
			const fieldId = adapter.getFieldAtPosition(-1, 0)
			expect(fieldId).toBeNull()
		})

		it('returns null for row out of bounds (too large)', () => {
			const fieldId = adapter.getFieldAtPosition(10, 0)
			expect(fieldId).toBeNull()
		})
	})

	describe('getTabOrder', () => {
		it('returns fields in top-to-bottom order', () => {
			const tabOrder = adapter.getTabOrder()
			expect(tabOrder).toEqual(['name', 'email', 'phone', 'status'])
		})

		it('returns empty array for no columns', () => {
			const emptyAdapter = new PropertySheetAdapter({ columns: [] })
			const tabOrder = emptyAdapter.getTabOrder()
			expect(tabOrder).toEqual([])
		})
	})

	describe('getGridTemplate', () => {
		it('returns CSS grid template with default label width', () => {
			const template = adapter.getGridTemplate()
			expect(template).toBe('200px 1fr')
		})

		it('returns CSS grid template with custom label width', () => {
			const customAdapter = new PropertySheetAdapter({
				columns,
				labelWidth: '300px',
			})
			const template = customAdapter.getGridTemplate()
			expect(template).toBe('300px 1fr')
		})

		it('supports percentage label width', () => {
			const customAdapter = new PropertySheetAdapter({
				columns,
				labelWidth: '30%',
			})
			const template = customAdapter.getGridTemplate()
			expect(template).toBe('30% 1fr')
		})
	})

	describe('getFieldStyle', () => {
		it('returns correct grid positioning for first field', () => {
			const style = adapter.getFieldStyle('name')
			expect(style).toMatchObject({
				gridRow: 1, // CSS grid is 1-indexed
				gridColumn: '1 / -1', // Span both columns
				display: 'grid',
			})
		})

		it('returns correct grid positioning for middle field', () => {
			const style = adapter.getFieldStyle('email')
			expect(style).toMatchObject({
				gridRow: 2,
				gridColumn: '1 / -1',
			})
		})

		it('includes grid template columns in field style', () => {
			const style = adapter.getFieldStyle('name')
			expect(style.gridTemplateColumns).toBe('200px 1fr')
		})

		it('includes gap in field style', () => {
			const style = adapter.getFieldStyle('name')
			expect(style.gap).toBe('1rem') // Default gap
		})

		it('uses custom gap when provided', () => {
			const customAdapter = new PropertySheetAdapter({
				columns,
				gap: '2rem',
			})
			const style = customAdapter.getFieldStyle('name')
			expect(style.gap).toBe('2rem')
		})
	})

	describe('updateColumns', () => {
		it('updates columns and rebuilds field mapping', () => {
			const newColumns: Column[] = [
				{ id: 'first', field: 'first', name: 'First', cellType: 'text', width: 100, editable: true },
				{
					id: 'second',
					field: 'second',
					name: 'Second',
					cellType: 'text',
					width: 100,
					editable: true,
				},
			]

			adapter.updateColumns(newColumns)

			const tabOrder = adapter.getTabOrder()
			expect(tabOrder).toEqual(['first', 'second'])
		})

		it('handles empty columns update', () => {
			adapter.updateColumns([])
			const tabOrder = adapter.getTabOrder()
			expect(tabOrder).toEqual([])
		})

		it('updates field neighbors after column update', () => {
			const newColumns: Column[] = [
				{ id: 'a', field: 'a', name: 'A', cellType: 'text', width: 100, editable: true },
				{ id: 'b', field: 'b', name: 'B', cellType: 'text', width: 100, editable: true },
			]

			adapter.updateColumns(newColumns)

			const neighbors = adapter.getFieldNeighbors('a')
			expect(neighbors).toEqual({ down: 'b' })
		})
	})
})
