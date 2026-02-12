/**
 * VibeFormField - Single field wrapper with auto-save on blur
 *
 * Responsibilities:
 * - Renders field-type-specific editors via FieldTypeRegistry
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
import { useCallback, useEffect, useRef, useState } from 'react'
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

  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<{ element: HTMLElement; destroy?: () => void } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  // Use refs for the commit callback so the editor's onSave closure
  // always has access to the latest props without recreating the editor
  const commitRef = useRef<(newValue: any) => void>(() => {})

  // ====================================
  // VALIDATION
  // ====================================

  const validateValue = useCallback(
    (val: any): ValidationResult => {
      try {
        const fieldType = fieldTypeRegistry.getFieldType(column)

        if (!fieldType.validator) {
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
  // COMMIT (VALIDATE + AUTO-SAVE)
  // ====================================

  const handleCommit = useCallback(
    async (newValue: any) => {
      // 1. Validate
      const validationResult = validateValue(newValue)

      if (!validationResult.valid) {
        setError(validationResult.errors[0] || 'Invalid value')
        logger.warn('Validation failed - not saving', {
          fieldId,
          errors: validationResult.errors,
        })
        return
      }

      setError(null)
      const valueToSave = validationResult.transformedValue ?? newValue

      // 2. Auto-save via TanStack DB collection
      if (!entityId) {
        logger.debug('Skipping auto-save - no entity ID (create mode)', { fieldId })
        onChange(valueToSave)
        return
      }

      if (!collection) {
        logger.warn('Skipping auto-save - no collection provided', { fieldId })
        onChange(valueToSave)
        return
      }

      setIsSaving(true)

      try {
        logger.info('Auto-saving field', { fieldId, entityId, value: valueToSave })

        collection.update(entityId, (draft: any) => {
          const field = column.field || fieldId
          draft[field] = valueToSave
          draft.updated_at = new Date().toISOString()
        })

        onChange(valueToSave)
        logger.info('Auto-save successful', { fieldId })
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err)
        logger.error('Auto-save failed', { fieldId, error: errorMessage })
        setError(`Save failed: ${errorMessage}`)
      } finally {
        setIsSaving(false)
      }
    },
    [fieldId, column, entityId, collection, onChange, validateValue],
  )

  // Keep commit ref in sync with latest callback
  commitRef.current = handleCommit

  // ====================================
  // EDITOR LIFECYCLE
  // ====================================

  // biome-ignore lint/correctness/useExhaustiveDependencies: value is intentionally excluded — setValue effect below syncs external changes without recreating the editor
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // Clean up previous editor
    if (editorRef.current?.destroy) {
      editorRef.current.destroy()
    }
    editorRef.current = null
    container.innerHTML = ''

    try {
      const fieldType = fieldTypeRegistry.getFieldType(column)

      if (!fieldType?.editor) {
        logger.warn('No editor found for field type, using fallback', {
          fieldId,
          columnType: column.cellType || column.type,
        })
        mountFallbackInput(container, value, fieldId, column, commitRef)
        return
      }

      // Create editor via FieldTypeRegistry
      const editorElement = fieldType.editor.create(value, column as any, (newValue: any) => {
        commitRef.current(newValue)
      })

      // Style for form context (remove grid-specific styles)
      editorElement.style.width = '100%'
      editorElement.classList.add('vibe-form-field-editor')

      container.appendChild(editorElement)
      editorRef.current = {
        element: editorElement,
        destroy: () => fieldType.editor.destroy(editorElement),
      }

      logger.debug('Editor created via FieldTypeRegistry', {
        fieldId,
        fieldType: fieldType.type,
      })
    } catch (err) {
      logger.error('Error creating editor, using fallback', { fieldId, error: err })
      mountFallbackInput(container, value, fieldId, column, commitRef)
    }

    return () => {
      if (editorRef.current?.destroy) {
        editorRef.current.destroy()
        editorRef.current = null
      }
    }
  }, [fieldId, column])

  // Sync external value changes into the editor without recreating it
  useEffect(() => {
    if (!editorRef.current?.element) return

    try {
      const fieldType = fieldTypeRegistry.getFieldType(column)
      if (fieldType?.editor) {
        fieldType.editor.setValue(editorRef.current.element, value)
      }
    } catch {
      // Fallback input handles its own value via React state
    }
  }, [value, column])

  // ====================================
  // RENDER
  // ====================================

  const hasError = error !== null

  return (
    <div
      className={`vibe-form-field ${hasError ? 'vibe-form-field--error' : ''}`}
      data-testid={`vibe-form-field-${fieldId}`}
    >
      {/* Editor container — FieldTypeRegistry mounts DOM elements here */}
      <div ref={containerRef} className="vibe-form-field-editor-container" />

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

// ====================================
// FALLBACK INPUT
// ====================================

/**
 * Mounts a plain text input when FieldTypeRegistry has no editor for the field type.
 * This ensures the component always renders something usable.
 */
function mountFallbackInput(
  container: HTMLElement,
  value: any,
  fieldId: string,
  column: Column,
  commitRef: React.MutableRefObject<(value: any) => void>,
) {
  const input = document.createElement('input')
  input.type = 'text'
  input.value = value == null ? '' : String(value)
  input.className = 'vibe-form-field-input'
  input.placeholder = column.label || column.name || fieldId
  input.style.cssText =
    'width: 100%; border: 1px solid var(--border); border-radius: 4px; padding: 4px 8px; font: inherit;'

  input.addEventListener('blur', () => {
    commitRef.current(input.value.trim() === '' ? null : input.value)
  })

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      commitRef.current(input.value.trim() === '' ? null : input.value)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      input.blur()
    }
  })

  container.appendChild(input)
}
