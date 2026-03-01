/**
 * VibeFormField - Single field with click-to-edit, auto-save on commit
 *
 * Behaves like a VibeGrid cell in property-sheet layout:
 * - View mode: renders value via modularCellBridge (same renderers as the grid)
 * - Click: enters edit mode showing the VibeGrid overlay editor
 * - Commit/Cancel: saves via collection.update() and returns to view mode
 */

import { observer } from 'mobx-react-lite'
import { useCallback, useState } from 'react'
import type { Column } from '../types'
import type { CellRef } from '../types/coordinate-types'
import { createEditor } from '../overlays/editors'
import { FormFieldValue } from './FormFieldValue'
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
  /** Full row data (needed by modularCellBridge renderers) */
  rowData?: any
  /** Row index (needed by modularCellBridge renderers) */
  rowIndex?: number
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
  rowData = {},
  rowIndex = 0,
  entityId,
  onChange,
  collection,
}: VibeFormFieldProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ====================================
  // COMMIT (VALIDATE + AUTO-SAVE)
  // ====================================

  const handleCommit = useCallback(
    async (newValue: any) => {
      setIsEditing(false)
      setError(null)

      if (!entityId) {
        logger.debug('Skipping auto-save - no entity ID (create mode)', { fieldId })
        onChange(newValue)
        return
      }

      if (!collection) {
        logger.warn('Skipping auto-save - no collection provided', { fieldId })
        onChange(newValue)
        return
      }

      setIsSaving(true)

      try {
        logger.info('Auto-saving field', { fieldId, entityId, value: newValue })

        collection.update(entityId, (draft: any) => {
          const field = column.field || fieldId
          draft[field] = newValue
          draft.updated_at = new Date().toISOString()
        })

        onChange(newValue)
        logger.info('Auto-save successful', { fieldId })
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err)
        logger.error('Auto-save failed', { fieldId, error: errorMessage })
        setError(`Save failed: ${errorMessage}`)
      } finally {
        setIsSaving(false)
      }
    },
    [fieldId, column, entityId, collection, onChange],
  )

  const handleCancel = useCallback(() => {
    setIsEditing(false)
  }, [])

  const handleActivate = useCallback(() => {
    if (!isEditing) setIsEditing(true)
  }, [isEditing])

  // ====================================
  // RENDER
  // ====================================

  const hasError = error !== null

  const cell: CellRef = {
    rowId: entityId || 'new',
    columnId: fieldId,
  }

  return (
    <div
      className={`vibe-form-field ${hasError ? 'vibe-form-field--error' : ''}`}
      data-testid={`vibe-form-field-${fieldId}`}
      aria-live={hasError ? 'polite' : undefined}
    >
      {/* Cell container — same visual appearance as a VibeGrid cell */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: field cell needs click handler */}
      <div
        className={`vibe-form-field-editor-container ${isEditing ? 'vibe-form-field-editor-container--editing' : ''}`}
        onClick={handleActivate}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !isEditing) {
            e.preventDefault()
            setIsEditing(true)
          }
        }}
        tabIndex={isEditing ? -1 : 0}
        role={isEditing ? undefined : 'button'}
      >
        {isEditing ? (
          // Edit mode: VibeGrid overlay editor (TextEditor, SelectEditor, DateEditor, etc.)
          createEditor({
            cell,
            column,
            initialValue: value,
            onCommit: handleCommit,
            onCancel: handleCancel,
          })
        ) : (
          // View mode: VibeGrid cell renderer via modularCellBridge (same as grid cells)
          <FormFieldValue
            fieldId={fieldId}
            value={value}
            column={column}
            rowData={rowData}
            rowIndex={rowIndex}
            cellClassName="vibe-form-cell"
            containerClassName="vibe-form-field-value-container"
          />
        )}
      </div>

      {/* Save indicator */}
      {isSaving && (
        <div className="vibe-form-field-saving">
          <span className="vibe-form-field-spinner" />
        </div>
      )}

      {/* Error message */}
      {hasError && (
        <div
          className="vibe-form-field-error"
          data-testid={`vibe-form-error-${fieldId}`}
          id={`${fieldId}-error`}
        >
          {error}
        </div>
      )}
    </div>
  )
})
