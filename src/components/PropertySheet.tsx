/**
 * PropertySheet - Vertical Property Sheet Layout for VibeGrid
 *
 * Renders entity fields as vertical label:value rows:
 * - Label on left, value on right
 * - Tab/ArrowUp/Down navigation between fields
 * - Integrates with InteractionStore for selection state
 * - Uses existing VibeGrid field type renderers
 *
 * Layout:
 * ┌────────────────────────────────┐
 * │ Label 1        │ [Value 1    ] │
 * ├────────────────────────────────┤
 * │ Label 2        │ [Value 2    ] │
 * ├────────────────────────────────┤
 * │ Label 3        │ [Value 3    ] │
 * └────────────────────────────────┘
 */

import { observer } from 'mobx-react-lite'
import { useEffect, useRef } from 'react'
import type { Column } from '../types'
import { PropertySheetAdapter } from '../adapters/PropertySheetAdapter'
import { modularCellBridge } from '../field-types/ModularCellBridge'
import type { InteractionStore } from '../stores/InteractionStore'
import './PropertySheet.css'
import { getLogger } from '@/shared/lib/logging'

const logger = getLogger(['vibegrid', 'PropertySheet'])

export interface PropertySheetProps {
	/** Entity data to display */
	data: any
	/** Field definitions (columns) */
	columns: Column[]
	/** Interaction store for selection/focus state */
	interactionStore: InteractionStore | null
	/** Label column width (CSS value) */
	labelWidth?: string
	/** Gap between label and value (CSS value) */
	gap?: string
	/** Field change callback (for VibeForm integration) */
	onFieldChange?: (fieldId: string, value: any) => void
}

export const PropertySheet = observer(function PropertySheet({
	data,
	columns,
	interactionStore,
	labelWidth = '200px',
	gap = '1rem',
	onFieldChange,
}: PropertySheetProps) {
	const containerRef = useRef<HTMLDivElement>(null)
	const adapterRef = useRef<PropertySheetAdapter | null>(null)

	// Initialize adapter
	useEffect(() => {
		adapterRef.current = new PropertySheetAdapter({
			columns,
			labelWidth,
			gap,
		})

		logger.debug('PropertySheet adapter initialized', {
			columnCount: columns.length,
			labelWidth,
			gap,
		})
	}, [columns, labelWidth, gap])

	// Handle keyboard navigation
	useEffect(() => {
		const container = containerRef.current
		if (!container || !adapterRef.current || !interactionStore) return

		const handleKeyDown = (event: KeyboardEvent) => {
			const focusedFieldId = interactionStore.focusedFieldId
			if (!focusedFieldId || !adapterRef.current) return

			const adapter = adapterRef.current
			const neighbors = adapter.getFieldNeighbors(focusedFieldId)

			let nextFieldId: string | null = null

			switch (event.key) {
				case 'ArrowUp':
					nextFieldId = neighbors.up || null
					break
				case 'ArrowDown':
				case 'Tab':
					if (!event.shiftKey) {
						nextFieldId = neighbors.down || null
					} else {
						// Shift+Tab goes up
						nextFieldId = neighbors.up || null
					}
					break
			}

			if (nextFieldId) {
				event.preventDefault()
				interactionStore.focusField(nextFieldId)

				// Scroll into view (guard for JSDOM which doesn't implement scrollIntoView)
				const nextElement = container.querySelector(
					`[data-testid="property-sheet-field-${nextFieldId}"]`,
				) as HTMLElement
				if (nextElement?.scrollIntoView) {
					nextElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
				}

				logger.debug('PropertySheet keyboard navigation', {
					from: focusedFieldId,
					to: nextFieldId,
					key: event.key,
				})
			}
		}

		container.addEventListener('keydown', handleKeyDown)
		return () => container.removeEventListener('keydown', handleKeyDown)
	}, [interactionStore])

	// Handle field click to set focus
	const handleFieldClick = (fieldId: string) => {
		if (interactionStore) {
			interactionStore.focusField(fieldId)
			logger.debug('PropertySheet field clicked', { fieldId })
		}
	}

	return (
		// biome-ignore lint/a11y/noNoninteractiveTabindex: Container needs to be focusable for keyboard navigation
		<div ref={containerRef} className="property-sheet" data-testid="property-sheet" tabIndex={0}>
			{columns.map((column, index) => {
				const fieldId = column.id
				const value = data[column.field || column.id]
				const isFocused = interactionStore?.focusedFieldId === fieldId

				return (
					<div
						key={fieldId}
						className={`property-sheet-field ${isFocused ? 'property-sheet-field--focused' : ''}`}
						data-testid={`property-sheet-field-${fieldId}`}
						onClick={() => handleFieldClick(fieldId)}
						onKeyDown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault()
								handleFieldClick(fieldId)
							}
						}}
						tabIndex={-1}
					>
						<div className="property-sheet-field__label">
							<label htmlFor={`field-${fieldId}`}>{column.label || column.id}</label>
							{column.required && <span className="property-sheet-field__required">*</span>}
						</div>
						<div className="property-sheet-field__value">
							<PropertySheetFieldValue
								fieldId={fieldId}
								value={value}
								column={column}
								rowData={data}
								rowIndex={index}
							/>
						</div>
					</div>
				)
			})}
		</div>
	)
})

/**
 * PropertySheetFieldValue - Renders field value using existing VibeGrid cell renderers
 */
const PropertySheetFieldValue = observer(function PropertySheetFieldValue({
	fieldId,
	value,
	column,
	rowData,
	rowIndex,
}: {
	fieldId: string
	value: any
	column: Column
	rowData: any
	rowIndex: number
}) {
	const containerRef = useRef<HTMLDivElement>(null)

	useEffect(() => {
		const container = containerRef.current
		if (!container) return

		// Clear existing content
		container.innerHTML = ''

		try {
			// Use ModularCellBridge to create cell element
			const cellElement = modularCellBridge.createCell(value, column, rowData, {
				rowIndex,
				columnIndex: 0,
			})

			// Remove absolute positioning styles (property sheet uses flexbox)
			cellElement.style.position = 'static'
			cellElement.style.left = 'auto'
			cellElement.style.width = '100%'

			// Add property sheet specific class
			cellElement.classList.add('property-sheet-cell')

			container.appendChild(cellElement)
		} catch (error) {
			logger.error('Error rendering property sheet field value', {
				fieldId,
				error,
			})
			// Fallback to plain text
			container.textContent = String(value || '')
		}
	}, [value, column, rowData, rowIndex, fieldId])

	return <div ref={containerRef} id={`field-${fieldId}`} className="property-sheet-field-value" />
})
