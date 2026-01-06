/**
 * TwoColumnForm - Two-Column Form Layout
 *
 * Renders entity fields in a two-column grid:
 * - Fields arranged in two columns
 * - Label above value (within each cell)
 * - Full keyboard navigation
 * - Uses existing VibeGrid field type renderers
 *
 * Layout:
 * ┌─────────────┬─────────────┐
 * │ Label A     │ Label B     │
 * │ [ Value A ] │ [ Value B ] │
 * ├─────────────┼─────────────┤
 * │ Label C     │ Label D     │
 * │ [ Value C ] │ [ Value D ] │
 * └─────────────┴─────────────┘
 */

import { observer } from 'mobx-react-lite'
import { useEffect, useRef } from 'react'
import type { Column } from '../types'
import { TwoColumnLayoutAdapter } from '../adapters/TwoColumnLayoutAdapter'
import { modularCellBridge } from '../field-types/ModularCellBridge'
import type { InteractionStore } from '../stores/InteractionStore'
import './TwoColumnForm.css'
import { getLogger } from '@/shared/lib/logging'

const logger = getLogger(['vibegrid', 'TwoColumnForm'])

export interface TwoColumnFormProps {
	/** Entity data to display */
	data: any
	/** Field definitions (columns) */
	columns: Column[]
	/** Interaction store for selection/focus state */
	interactionStore: InteractionStore | null
	/** Gap between fields (CSS value) */
	fieldGap?: string
	/** Gap between columns (CSS value) */
	columnGap?: string
	/** Field change callback (for VibeForm integration) */
	onFieldChange?: (fieldId: string, value: any) => void
}

export const TwoColumnForm = observer(function TwoColumnForm({
	data,
	columns,
	interactionStore,
	fieldGap = '1rem',
	columnGap = '1.5rem',
	onFieldChange,
}: TwoColumnFormProps) {
	const containerRef = useRef<HTMLDivElement>(null)
	const adapterRef = useRef<TwoColumnLayoutAdapter | null>(null)

	// Initialize adapter
	useEffect(() => {
		adapterRef.current = new TwoColumnLayoutAdapter({
			columns,
			fieldGap,
			columnGap,
		})

		logger.debug('TwoColumnForm adapter initialized', {
			columnCount: columns.length,
			fieldGap,
			columnGap,
		})
	}, [columns, fieldGap, columnGap])

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
					nextFieldId = neighbors.down || null
					break
				case 'ArrowLeft':
					nextFieldId = neighbors.left || null
					break
				case 'ArrowRight':
					nextFieldId = neighbors.right || null
					break
				case 'Tab':
					if (!event.shiftKey) {
						// Tab order: left-to-right, top-to-bottom
						nextFieldId = neighbors.right || neighbors.down || null
					} else {
						nextFieldId = neighbors.left || neighbors.up || null
					}
					break
			}

			if (nextFieldId) {
				event.preventDefault()
				interactionStore.focusField(nextFieldId)

				const nextElement = container.querySelector(
					`[data-testid="two-column-field-${nextFieldId}"]`,
				) as HTMLElement
				if (nextElement?.scrollIntoView) {
					nextElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
				}

				logger.debug('TwoColumnForm keyboard navigation', {
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
			logger.debug('TwoColumnForm field clicked', { fieldId })
		}
	}

	return (
		<div
			ref={containerRef}
			className="two-column-form"
			data-testid="two-column-form"
		>
			{columns.map((column, index) => {
				const fieldId = column.id
				const value = data[column.field || column.id]
				const isFocused = interactionStore?.focusedFieldId === fieldId
				const isLastField = index === columns.length - 1
				const isOddCount = columns.length % 2 === 1

				// Last field spans both columns if odd count
				const spanBoth = isLastField && isOddCount

				return (
					<div
						key={fieldId}
						className={`two-column-form-field ${isFocused ? 'two-column-form-field--focused' : ''} ${spanBoth ? 'two-column-form-field--span' : ''}`}
						data-testid={`two-column-field-${fieldId}`}
						onClick={() => handleFieldClick(fieldId)}
						onKeyDown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault()
								handleFieldClick(fieldId)
							}
						}}
						tabIndex={-1}
					>
						<div className="two-column-form-field__label">
							<label htmlFor={`field-${fieldId}`}>{column.label || column.id}</label>
							{column.required && <span className="two-column-form-field__required">*</span>}
						</div>
						<div className="two-column-form-field__value">
							<TwoColumnFieldValue
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
 * TwoColumnFieldValue - Renders field value using existing VibeGrid cell renderers
 */
const TwoColumnFieldValue = observer(function TwoColumnFieldValue({
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

		container.innerHTML = ''

		try {
			const cellElement = modularCellBridge.createCell(value, column, rowData, {
				rowIndex,
				columnIndex: 0,
			})

			cellElement.style.position = 'static'
			cellElement.style.left = 'auto'
			cellElement.style.width = '100%'
			cellElement.classList.add('two-column-form-cell')

			container.appendChild(cellElement)
		} catch (error) {
			logger.error('Error rendering two column form field value', {
				fieldId,
				error,
			})
			container.textContent = String(value || '')
		}
	}, [value, column, rowData, rowIndex, fieldId])

	return <div ref={containerRef} id={`field-${fieldId}`} className="two-column-form-field-value" />
})
