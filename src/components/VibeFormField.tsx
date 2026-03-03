/**
 * VibeFormField - Single field with click-to-edit, auto-save on commit
 *
 * Behaves like a VibeGrid cell in property-sheet layout:
 * - View mode: renders value via modularCellBridge (same renderers as the grid)
 * - Click: enters edit mode showing the VibeGrid overlay editor
 * - Commit/Cancel: saves via collection.update() and returns to view mode
 *
 * Editing rendering strategy is driven by the field type's affordance group:
 * - editable-badge (select, date, relationship, …) → React portal below the field
 * - editable-content / other → inline inside the container
 *
 * By the time VibeForm renders this component, fieldTypeRegistry is guaranteed
 * initialized (VibeForm calls ensureInitialized() and waits for registryReady).
 */

import { observer } from 'mobx-react-lite'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Column } from '../types'
import type { CellRef } from '../types/coordinate-types'
import { createEditor } from '../overlays/editors'
import { fieldTypeRegistry } from '../field-types/FieldTypeRegistry'
import type { EnhancedColumn } from '../field-types/FieldTypeRegistry'
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
// HELPERS
// ====================================

/**
 * Determine whether the editor for this column should open as a portal
 * (positioned below the field) rather than rendering inline.
 *
 * Reads from fieldTypeRegistry — no hardcoded lists.
 * 'editable-badge' affordance group means dropdown/picker → needs portal.
 */
function useNeedsPortal(column: Column): boolean {
  if (!fieldTypeRegistry.isInitialized) return false
  try {
    const fieldType = fieldTypeRegistry.getFieldType(column as EnhancedColumn)
    return fieldType.affordance?.group === 'editable-badge'
  } catch {
    return false
  }
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
  const [portalStyle, setPortalStyle] = useState<React.CSSProperties>({})

  const containerRef = useRef<HTMLDivElement>(null)
  const portalRef = useRef<HTMLDivElement>(null)

  const isPortalEditor = useNeedsPortal(column)

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
    if (isEditing) return

    if (isPortalEditor && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      const maxHeight = 320
      const spaceBelow = window.innerHeight - rect.bottom - 8

      const top =
        spaceBelow >= Math.min(maxHeight, 180)
          ? rect.bottom + 4
          : Math.max(8, rect.top - maxHeight - 4)

      setPortalStyle({
        position: 'fixed',
        top,
        left: rect.left,
        width: Math.max(rect.width, 280),
        zIndex: 9999,
        maxHeight,
      })
    }

    setIsEditing(true)
  }, [isEditing, isPortalEditor])

  // Click-outside: cancel when clicking outside both field container and portal
  useEffect(() => {
    if (!isEditing || !isPortalEditor) return

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (containerRef.current?.contains(target)) return
      if (portalRef.current?.contains(target)) return
      handleCancel()
    }

    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [isEditing, isPortalEditor, handleCancel])

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
        ref={containerRef}
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
        {isEditing && !isPortalEditor ? (
          // Inline edit mode: text/number/boolean editors that fit inside the container
          createEditor({
            cell,
            column,
            initialValue: value,
            onCommit: handleCommit,
            onCancel: handleCancel,
          })
        ) : (
          // View mode — always shown for portal editors so layout stays stable
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

      {/* Portal-based popup editor for editable-badge field types (select, date, relationship…).
          Renders into document.body so the dropdown never expands the property sheet layout. */}
      {isEditing &&
        isPortalEditor &&
        createPortal(
          // biome-ignore lint/a11y/noStaticElementInteractions: onMouseDown stops propagation to click-outside handler
          <div
            ref={portalRef}
            className="vibe-form-field-popup-portal"
            style={portalStyle}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {createEditor({
              cell,
              column,
              initialValue: value,
              onCommit: handleCommit,
              onCancel: handleCancel,
            })}
          </div>,
          document.body,
        )}

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
