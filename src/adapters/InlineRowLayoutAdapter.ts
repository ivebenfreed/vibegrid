/**
 * InlineRowLayoutAdapter - Horizontal Inline Layout
 *
 * Implements inline horizontal layout for VibeGrid:
 * - Fields arranged horizontally in a single row
 * - Compact labels (optional, can be hidden)
 * - Left/Right navigation (no up/down)
 * - Tab order is left-to-right
 *
 * Layout Pattern:
 * ┌─────────────────────────────────────────────┐
 * │ [Status] [Priority] [Assignee] [Due Date]   │
 * └─────────────────────────────────────────────┘
 *
 * Use cases:
 * - Entity detail header metadata row
 * - Inline property editors
 * - Compact filter bars
 */

import type {
	CellLayoutAdapter,
	CellPosition,
	FieldNeighbors,
} from '../types/layout-types'
import type { Column } from '../types'
import type { CSSProperties } from 'react'

export interface InlineRowLayoutAdapterOptions {
	/** Array of visible columns (field definitions) */
	columns: Column[]
	/** Gap between fields (CSS value) */
	fieldGap?: string
	/** Whether to show labels (default: false for compact mode) */
	showLabels?: boolean
	/** Field width behavior */
	fieldWidth?: 'auto' | 'equal' | 'content'
}

export class InlineRowLayoutAdapter implements CellLayoutAdapter {
	private columns: Column[]
	private fieldGap: string
	private showLabels: boolean
	private fieldWidth: 'auto' | 'equal' | 'content'
	private fieldIdToIndex: Map<string, number>

	constructor(options: InlineRowLayoutAdapterOptions) {
		this.columns = options.columns
		this.fieldGap = options.fieldGap ?? '0.75rem'
		this.showLabels = options.showLabels ?? false
		this.fieldWidth = options.fieldWidth ?? 'auto'

		// Build field ID to index mapping for O(1) lookups
		this.fieldIdToIndex = new Map()
		for (let i = 0; i < this.columns.length; i++) {
			this.fieldIdToIndex.set(this.columns[i].id, i)
		}
	}

	// ==================== Navigation ====================

	/**
	 * Get neighboring fields for keyboard navigation
	 * In inline-row: only left/right neighbors (horizontal layout)
	 */
	getFieldNeighbors(fieldId: string): FieldNeighbors {
		const index = this.fieldIdToIndex.get(fieldId)
		if (index === undefined) {
			return {}
		}

		const neighbors: FieldNeighbors = {}

		// Left: Previous field
		if (index > 0) {
			neighbors.left = this.columns[index - 1].id
		}

		// Right: Next field
		if (index < this.columns.length - 1) {
			neighbors.right = this.columns[index + 1].id
		}

		// Up/Down: Not applicable in horizontal layout

		return neighbors
	}

	/**
	 * Get field's position in layout grid
	 * In inline-row: row = 0 (always first row), col = field index
	 */
	getCellPosition(fieldId: string): CellPosition {
		const index = this.fieldIdToIndex.get(fieldId)
		if (index === undefined) {
			throw new Error(`Field not found: ${fieldId}`)
		}

		return {
			row: 0, // Always row 0 (horizontal layout)
			col: index,
		}
	}

	/**
	 * Get field ID at specific position
	 * In inline-row: only row=0 is valid, col=field index
	 */
	getFieldAtPosition(row: number, col: number): string | null {
		// Only row 0 exists in horizontal layout
		if (row !== 0) {
			return null
		}

		// Check column bounds
		if (col < 0 || col >= this.columns.length) {
			return null
		}

		return this.columns[col].id
	}

	/**
	 * Get tab order for sequential navigation
	 * In inline-row: left-to-right order
	 */
	getTabOrder(): string[] {
		return this.columns.map((col) => col.id)
	}

	// ==================== Rendering ====================

	/**
	 * Get CSS grid template for inline-row layout
	 */
	getGridTemplate(): string {
		switch (this.fieldWidth) {
			case 'equal':
				// All fields equal width
				return `repeat(${this.columns.length}, 1fr)`
			case 'content':
				// Fields sized by content
				return `repeat(${this.columns.length}, auto)`
			case 'auto':
			default:
				// Mix of auto and min-content based on field type
				return this.columns
					.map((col) => {
						// Give more space to text-heavy fields
						if (col.type === 'text' || col.type === 'markdown') {
							return '1fr'
						}
						return 'auto'
					})
					.join(' ')
		}
	}

	/**
	 * Get container styles for the layout
	 */
	getContainerStyle(): CSSProperties {
		return {
			display: 'flex',
			flexDirection: 'row',
			alignItems: 'center',
			gap: this.fieldGap,
			flexWrap: 'wrap', // Allow wrapping on small screens
		}
	}

	/**
	 * Get field-specific CSS styles
	 */
	getFieldStyle(fieldId: string): CSSProperties {
		const column = this.columns.find((c) => c.id === fieldId)

		const baseStyle: CSSProperties = {
			display: 'flex',
			flexDirection: this.showLabels ? 'column' : 'row',
			alignItems: this.showLabels ? 'flex-start' : 'center',
			gap: this.showLabels ? '0.25rem' : '0',
		}

		// Apply width based on field type
		switch (this.fieldWidth) {
			case 'equal':
				baseStyle.flex = '1 1 0'
				baseStyle.minWidth = '100px'
				break
			case 'content':
				baseStyle.flex = '0 0 auto'
				break
			case 'auto':
			default:
				// Use column width hint or auto
				if (column?.width) {
					baseStyle.width = `${column.width}px`
					baseStyle.flex = '0 0 auto'
				} else {
					baseStyle.flex = '0 1 auto'
					baseStyle.minWidth = '80px'
				}
		}

		return baseStyle
	}

	/**
	 * Get label style for this layout
	 * In inline mode, labels are typically hidden or very compact
	 */
	getLabelStyle(): CSSProperties {
		if (!this.showLabels) {
			return {
				display: 'none',
			}
		}

		return {
			fontWeight: 500,
			fontSize: '0.75rem',
			color: 'var(--color-text-tertiary, #9ca3af)',
			textTransform: 'uppercase',
			letterSpacing: '0.05em',
		}
	}

	/**
	 * Get value container style for this layout
	 */
	getValueStyle(): CSSProperties {
		return {
			display: 'flex',
			alignItems: 'center',
		}
	}

	/**
	 * Whether labels should be shown
	 */
	shouldShowLabels(): boolean {
		return this.showLabels
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
