/**
 * VibeFormField - Single field wrapper with auto-save on blur
 *
 * Responsibilities:
 * - Auto-save on blur via TanStack DB mutation
 * - Field-level validation using FieldTypeRegistry.validate()
 * - Error display (red border + inline message)
 * - Loading indicator during save
 *
 * Usage:
 * <VibeFormField
 *   fieldId="name"
 *   column={column}
 *   value={value}
 *   entityId={entityId}
 *   onChange={(value) => console.log('Changed:', value)}
 * />
 */

import { observer } from 'mobx-react-lite'
import { useCallback, useRef, useState } from 'react'
import type { Column } from '../types'
import { fieldTypeRegistry } from '../field-types/FieldTypeRegistry'
import type { ValidationResult } from '../field-types/FieldTypeRegistry'
import { getLogger } from '@/shared/lib/logging'
import './VibeFormField.css'

const logger = getLogger(['vibegrid', 'VibeFormField'])

// ====================================
// TYPES
// ====================================

export interface VibeFormFieldProps {
	/** Field ID */
	fieldId: string
	/** Column metadata */
	column: Column
	/** Current value */
	value: any
	/** Entity ID (for save) */
	entityId?: string | null
	/** Change callback */
	onChange: (value: any) => void
	/** Collection for TanStack DB mutations */
	collection?: any
}

// ====================================
// COMPONENT
// ====================================

export const VibeFormField = observer(function VibeFormField({
	fieldId,
	column,
	value,
	entityId,
	onChange,
	collection,
}: VibeFormFieldProps) {
	// ====================================
	// STATE
	// ====================================

	const [localValue, setLocalValue] = useState(value)
	const [error, setError] = useState<string | null>(null)
	const [isSaving, setIsSaving] = useState(false)
	const inputRef = useRef<HTMLInputElement>(null)

	// ====================================
	// VALIDATION
	// ====================================

	/**
	 * Validate field value using FieldTypeRegistry
	 */
	const validateValue = useCallback(
		(val: any): ValidationResult => {
			try {
				const fieldType = fieldTypeRegistry.getFieldType(column)

				if (!fieldType.validator) {
					// No validator - always valid
					return { valid: true, errors: [] }
				}

				const result = fieldType.validator.validate(val, column)

				logger.debug('Validation result', {
					fieldId,
					value: val,
					valid: result.valid,
					errors: result.errors,
				})

				return result
			} catch (err) {
				const errorMessage = err instanceof Error ? err.message : String(err)
				logger.error('Validation error', { fieldId, error: errorMessage })
				return { valid: false, errors: [errorMessage] }
			}
		},
		[fieldId, column],
	)

	// ====================================
	// AUTO-SAVE LOGIC
	// ====================================

	/**
	 * Auto-save on blur
	 */
	const handleBlur = useCallback(async () => {
		// 1. Validate using FieldTypeRegistry
		const validationResult = validateValue(localValue)

		if (!validationResult.valid) {
			setError(validationResult.errors[0] || 'Invalid value')
			logger.warn('Validation failed - not saving', {
				fieldId,
				errors: validationResult.errors,
			})
			return // Don't save invalid values
		}

		// Clear error if validation passed
		setError(null)

		// 2. Auto-save via TanStack DB collection
		if (!entityId) {
			logger.debug('Skipping auto-save - no entity ID (create mode)', { fieldId })
			// In create mode, just propagate change to parent
			onChange(localValue)
			return
		}

		if (!collection) {
			logger.warn('Skipping auto-save - no collection provided', { fieldId })
			onChange(localValue)
			return
		}

		setIsSaving(true)

		try {
			// Use transformed value if provided by validator
			const valueToSave = validationResult.transformedValue ?? localValue

			logger.info('Auto-saving field', {
				fieldId,
				entityId,
				value: valueToSave,
			})

			// Update collection (triggers optimistic update + server sync)
			collection.update(entityId, (draft: any) => {
				const field = column.field || fieldId
				draft[field] = valueToSave
				draft.updated_at = new Date().toISOString()
			})

			// Notify parent component
			onChange(valueToSave)

			logger.info('Auto-save successful', { fieldId })
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : String(err)
			logger.error('Auto-save failed', { fieldId, error: errorMessage })
			setError(`Save failed: ${errorMessage}`)
		} finally {
			setIsSaving(false)
		}
	}, [localValue, fieldId, column, entityId, collection, onChange, validateValue])

	/**
	 * Handle value change
	 */
	const handleChange = useCallback(
		(newValue: any) => {
			setLocalValue(newValue)
			// Clear error on value change
			if (error) {
				setError(null)
			}
		},
		[error],
	)

	// ====================================
	// RENDER
	// ====================================

	const hasError = error !== null
	const fieldLabel = column.label || column.name || fieldId

	return (
		<div
			className={`vibe-form-field ${hasError ? 'vibe-form-field--error' : ''}`}
			data-testid={`vibe-form-field-${fieldId}`}
		>
			{/* Field input */}
			<input
				ref={inputRef}
				type="text"
				value={localValue ?? ''}
				onChange={(e) => handleChange(e.target.value)}
				onBlur={handleBlur}
				className="vibe-form-field-input"
				placeholder={fieldLabel}
				disabled={isSaving}
			/>

			{/* Save indicator */}
			{isSaving && (
				<div className="vibe-form-field-saving">
					<span className="vibe-form-field-spinner" />
				</div>
			)}

			{/* Error message */}
			{hasError && (
				<div className="vibe-form-field-error" data-testid={`vibe-form-error-${fieldId}`}>
					{error}
				</div>
			)}
		</div>
	)
})
