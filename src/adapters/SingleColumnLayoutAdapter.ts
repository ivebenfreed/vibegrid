/**
 * SingleColumnLayoutAdapter - Stacked Vertical Form Layout
 *
 * Implements single-column form layout for VibeGrid:
 * - Fields arranged vertically (one per row)
 * - Label above value
 * - Up/Down navigation moves between fields
 * - Tab order is top-to-bottom
 *
 * Layout Pattern:
 * ┌─────────────────────────┐
 * │ Label A                 │
 * │ [    Value A          ] │
 * ├─────────────────────────┤
 * │ Label B                 │
 * │ [    Value B          ] │
 * ├─────────────────────────┤
 * │ Label C                 │
 * │ [    Value C          ] │
 * └─────────────────────────┘
 */

import type {
	CellLayoutAdapter,
	CellPosition,
	FieldNeighbors,
} from '../types/layout-types'
import type { Column } from '../types'
import type { CSSProperties } from 'react'

export interface SingleColumnLayoutAdapterOptions {
	/** Array of visible columns (field definitions) */
	columns: Column[]
	/** Gap between fields (CSS value) */
	fieldGap?: string
	/** Gap between label and value (CSS value) */
	labelGap?: string
}

export class SingleColumnLayoutAdapter implements CellLayoutAdapter {
	private columns: Column[]
	private fieldGap: string
	private labelGap: string
	private fieldIdToIndex: Map<string, number>

	constructor(options: SingleColumnLayoutAdapterOptions) {
		this.columns = options.columns
		this.fieldGap = options.fieldGap ?? '1.5rem'
		this.labelGap = options.labelGap ?? '0.5rem'

		// Build field ID to index mapping for O(1) lookups
		this.fieldIdToIndex = new Map()
		for (let i = 0; i < this.columns.length; i++) {
			this.fieldIdToIndex.set(this.columns[i].id, i)
		}
	}

	// ==================== Navigation ====================

	/**
	 * Get neighboring fields for keyboard navigation
	 * In single-column: only up/down neighbors (vertical layout)
	 */
	getFieldNeighbors(fieldId: string): FieldNeighbors {
		const index = this.fieldIdToIndex.get(fieldId)
		if (index === undefined) {
			return {}
		}

		const neighbors: FieldNeighbors = {}

		// Up: Previous field in list
		if (index > 0) {
			neighbors.up = this.columns[index - 1].id
		}

		// Down: Next field in list
		if (index < this.columns.length - 1) {
			neighbors.down = this.columns[index + 1].id
		}

		// Left/Right: Not applicable in single-column layout

		return neighbors
	}

	/**
	 * Get field's position in layout grid
	 * In single-column: row = field index, col = 0 (always first column)
	 */
	getCellPosition(fieldId: string): CellPosition {
		const index = this.fieldIdToIndex.get(fieldId)
		if (index === undefined) {
			throw new Error(`Field not found: ${fieldId}`)
		}

		return {
			row: index,
			col: 0, // Always column 0 (single-column layout)
		}
	}

	/**
	 * Get field ID at specific position
	 * In single-column: only col=0 is valid, row=field index
	 */
	getFieldAtPosition(row: number, col: number): string | null {
		// Only column 0 exists in single-column layout
		if (col !== 0) {
			return null
		}

		// Check row bounds
		if (row < 0 || row >= this.columns.length) {
			return null
		}

		return this.columns[row].id
	}

	/**
	 * Get tab order for sequential navigation
	 * In single-column: top-to-bottom order
	 */
	getTabOrder(): string[] {
		return this.columns.map((col) => col.id)
	}

	// ==================== Rendering ====================

	/**
	 * Get CSS grid template for single-column layout
	 * Uses CSS grid with a single column (1fr) for full width
	 */
	getGridTemplate(): string {
		return '1fr'
	}

	/**
	 * Get container styles for the layout
	 */
	getContainerStyle(): CSSProperties {
		return {
			display: 'flex',
			flexDirection: 'column',
			gap: this.fieldGap,
		}
	}

	/**
	 * Get field-specific CSS styles
	 * In single-column: all fields use same vertical stacking
	 */
	getFieldStyle(_fieldId: string): CSSProperties {
		return {
			display: 'flex',
			flexDirection: 'column',
			gap: this.labelGap,
		}
	}

	/**
	 * Get label style for this layout
	 */
	getLabelStyle(): CSSProperties {
		return {
			fontWeight: 500,
			fontSize: '0.875rem',
			color: 'var(--color-text-secondary, #6b7280)',
		}
	}

	/**
	 * Get value container style for this layout
	 */
	getValueStyle(): CSSProperties {
		return {
			width: '100%',
		}
	}

	// ==================== Update Methods ====================

	/**
	 * Update columns (when column visibility or order changes)
	 */
	updateColumns(columns: Column[]): void {
		this.columns = columns

		// Rebuild field ID mapping
		this.fieldIdToIndex.clear()
		for (let i = 0; i < this.columns.length; i++) {
			this.fieldIdToIndex.set(this.columns[i].id, i)
		}
	}
}
