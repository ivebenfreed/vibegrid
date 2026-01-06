/**
 * GroupedForm - Grouped/Sectioned Form Layout
 *
 * Renders entity fields in collapsible groups:
 * - Named section headers
 * - Collapsible sections
 * - Keyboard navigation within and between groups
 * - Uses existing VibeGrid field type renderers
 *
 * Layout:
 * ┌─────────────────────────────────────┐
 * │ ▼ Basic Info                        │
 * │ ┌─────────────┬─────────────┐      │
 * │ │ Name        │ Status      │      │
 * │ └─────────────┴─────────────┘      │
 * ├─────────────────────────────────────┤
 * │ ▼ Details                           │
 * │ ┌─────────────────────────────┐    │
 * │ │ Description                  │    │
 * │ └─────────────────────────────┘    │
 * └─────────────────────────────────────┘
 */

import { observer } from 'mobx-react-lite'
import { useEffect, useRef, useState, useCallback } from 'react'
import type { Column } from '../types'
import { GroupedFormLayoutAdapter, type FieldGroup } from '../adapters/GroupedFormLayoutAdapter'
import { modularCellBridge } from '../field-types/ModularCellBridge'
import type { InteractionStore } from '../stores/InteractionStore'
import { ChevronDown, ChevronRight } from 'lucide-react'
import './GroupedForm.css'
import { getLogger } from '@/shared/lib/logging'

const logger = getLogger(['vibegrid', 'GroupedForm'])

export interface GroupedFormProps {
	/** Entity data to display */
	data: any
	/** Field definitions (columns) */
	columns: Column[]
	/** Group definitions */
	groups: FieldGroup[]
	/** Interaction store for selection/focus state */
	interactionStore: InteractionStore | null
	/** Gap between groups (CSS value) */
	groupGap?: string
	/** Gap between fields (CSS value) */
	fieldGap?: string
	/** Field change callback (for VibeForm integration) */
	onFieldChange?: (fieldId: string, value: any) => void
	/** Group collapse callback */
	onGroupToggle?: (groupId: string, collapsed: boolean) => void
}

export const GroupedForm = observer(function GroupedForm({
	data,
	columns,
	groups,
	interactionStore,
	groupGap = '1.5rem',
	fieldGap = '1rem',
	onFieldChange,
	onGroupToggle,
}: GroupedFormProps) {
	const containerRef = useRef<HTMLDivElement>(null)
	const adapterRef = useRef<GroupedFormLayoutAdapter | null>(null)
	const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => {
		const collapsed = new Set<string>()
		for (const group of groups) {
			if (group.defaultCollapsed) {
				collapsed.add(group.id)
			}
		}
		return collapsed
	})

	// Build column lookup map
	const columnMap = useRef<Map<string, Column>>(new Map())
	useEffect(() => {
		columnMap.current.clear()
		for (const column of columns) {
			columnMap.current.set(column.id, column)
		}
	}, [columns])

	// Initialize adapter
	useEffect(() => {
		adapterRef.current = new GroupedFormLayoutAdapter({
			columns,
			groups,
			groupGap,
			fieldGap,
		})

		logger.debug('GroupedForm adapter initialized', {
			columnCount: columns.length,
			groupCount: groups.length,
		})
	}, [columns, groups, groupGap, fieldGap])

	// Handle group toggle
	const handleGroupToggle = useCallback((groupId: string) => {
		setCollapsedGroups(prev => {
			const next = new Set(prev)
			const isNowCollapsed = !next.has(groupId)
			if (isNowCollapsed) {
				next.add(groupId)
			} else {
				next.delete(groupId)
			}

			// Sync with adapter
			if (adapterRef.current) {
				adapterRef.current.toggleGroup(groupId)
			}

			// Notify parent
			if (onGroupToggle) {
				onGroupToggle(groupId, isNowCollapsed)
			}

			logger.debug('Group toggled', { groupId, collapsed: isNowCollapsed })
			return next
		})
	}, [onGroupToggle])

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
						// Tab order follows visible fields
						const tabOrder = adapter.getTabOrder()
						const currentIndex = tabOrder.indexOf(focusedFieldId)
						if (currentIndex >= 0 && currentIndex < tabOrder.length - 1) {
							nextFieldId = tabOrder[currentIndex + 1]
						}
					} else {
						const tabOrder = adapter.getTabOrder()
						const currentIndex = tabOrder.indexOf(focusedFieldId)
						if (currentIndex > 0) {
							nextFieldId = tabOrder[currentIndex - 1]
						}
					}
					break
			}

			if (nextFieldId) {
				event.preventDefault()
				interactionStore.focusField(nextFieldId)

				const nextElement = container.querySelector(
					`[data-testid="grouped-form-field-${nextFieldId}"]`,
				) as HTMLElement
				if (nextElement?.scrollIntoView) {
					nextElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
				}

				logger.debug('GroupedForm keyboard navigation', {
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
	const handleFieldClick = useCallback((fieldId: string) => {
		if (interactionStore) {
			interactionStore.focusField(fieldId)
			logger.debug('GroupedForm field clicked', { fieldId })
		}
	}, [interactionStore])

	return (
		<div
			ref={containerRef}
			className="grouped-form"
			data-testid="grouped-form"
			style={{ gap: groupGap }}
			tabIndex={0}
		>
			{groups.map((group) => {
				const isCollapsed = collapsedGroups.has(group.id)
				const numColumns = group.columns ?? 1

				return (
					<div
						key={group.id}
						className="grouped-form-section"
						data-testid={`grouped-form-section-${group.id}`}
					>
						{/* Group Header */}
						<button
							type="button"
							className="grouped-form-section-header"
							onClick={() => handleGroupToggle(group.id)}
							aria-expanded={!isCollapsed}
							aria-controls={`group-content-${group.id}`}
						>
							<span className="grouped-form-section-header-icon">
								{isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
							</span>
							<span className="grouped-form-section-header-label">{group.label}</span>
							<span className="grouped-form-section-header-count">
								{group.fieldIds.length} field{group.fieldIds.length !== 1 ? 's' : ''}
							</span>
						</button>

						{/* Group Content */}
						{!isCollapsed && (
							<div
								id={`group-content-${group.id}`}
								className={`grouped-form-section-content grouped-form-section-content--${numColumns}-col`}
								style={{ gap: fieldGap }}
							>
								{group.fieldIds.map((fieldId, fieldIndex) => {
									const column = columnMap.current.get(fieldId)
									if (!column) return null

									const value = data[column.field || column.id]
									const isFocused = interactionStore?.focusedFieldId === fieldId

									// Check if last field should span both columns
									const isLastField = fieldIndex === group.fieldIds.length - 1
									const isOddCount = group.fieldIds.length % 2 === 1
									const spanBoth = numColumns === 2 && isLastField && isOddCount

									return (
										<div
											key={fieldId}
											className={`grouped-form-field ${isFocused ? 'grouped-form-field--focused' : ''} ${spanBoth ? 'grouped-form-field--span' : ''}`}
											data-testid={`grouped-form-field-${fieldId}`}
											onClick={() => handleFieldClick(fieldId)}
											onKeyDown={(e) => {
												if (e.key === 'Enter' || e.key === ' ') {
													e.preventDefault()
													handleFieldClick(fieldId)
												}
											}}
											tabIndex={-1}
										>
											<div className="grouped-form-field__label">
												<label htmlFor={`field-${fieldId}`}>{column.label || column.id}</label>
												{column.required && <span className="grouped-form-field__required">*</span>}
											</div>
											<div className="grouped-form-field__value">
												<GroupedFormFieldValue
													fieldId={fieldId}
													value={value}
													column={column}
													rowData={data}
													rowIndex={fieldIndex}
												/>
											</div>
										</div>
									)
								})}
							</div>
						)}
					</div>
				)
			})}
		</div>
	)
})

/**
 * GroupedFormFieldValue - Renders field value using existing VibeGrid cell renderers
 */
const GroupedFormFieldValue = observer(function GroupedFormFieldValue({
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
			cellElement.classList.add('grouped-form-cell')

			container.appendChild(cellElement)
		} catch (error) {
			logger.error('Error rendering grouped form field value', {
				fieldId,
				error,
			})
			container.textContent = String(value || '')
		}
	}, [value, column, rowData, rowIndex, fieldId])

	return <div ref={containerRef} id={`field-${fieldId}`} className="grouped-form-field-value" />
})

// Re-export FieldGroup type for convenience
export type { FieldGroup }
