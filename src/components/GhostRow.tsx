/**
 * GhostRow - Inline Creation Ghost Row Component
 *
 * GH#1658: Renders a ghost row at the bottom of each expanded group for quick entity creation.
 * States: ghost (placeholder) -> editing (inline fields) -> saving (spinner) -> error (retry)
 */

import { Loader2, Plus } from 'lucide-react'
import { observer } from 'mobx-react-lite'
import { useCallback, useEffect, useRef } from 'react'
import type { Column } from '../types'
import { FormFieldValue } from './FormFieldValue'
import type { GhostRowState } from '../stores/InlineCreationStore'

// ====================================
// TYPES
// ====================================

export interface GhostRowProps {
  groupId: string
  entityDisplayName: string
  status: GhostRowState['status']
  inlineColumns: Column[]
  inheritedFields: Record<string, unknown>
  validationErrors: Record<string, string>
  fieldValues: Record<string, unknown>
  errorMessage?: string
  onFieldChange: (fieldId: string, value: unknown) => void
  onCommit: () => void
  onCancel: () => void
}

// ====================================
// COMPONENT
// ====================================

export const GhostRow = observer(function GhostRow({
  groupId,
  entityDisplayName,
  status,
  inlineColumns,
  inheritedFields,
  validationErrors,
  fieldValues,
  errorMessage,
  onFieldChange: _onFieldChange,
  onCommit,
  onCancel,
}: GhostRowProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const hasErrors = Object.keys(validationErrors).length > 0

  // Focus the first field when entering editing mode
  useEffect(() => {
    if (status === 'editing' && containerRef.current) {
      const firstInput = containerRef.current.querySelector('input, select, textarea')
      if (firstInput instanceof HTMLElement) {
        requestAnimationFrame(() => firstInput.focus())
      }
    }
  }, [status])

  // Keyboard handler for editing state
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (status !== 'editing' && status !== 'error') return

      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onCancel()
        return
      }

      if (e.key === 'Enter') {
        e.preventDefault()
        e.stopPropagation()
        onCommit()
        return
      }

      if (e.key === 'Tab') {
        const container = containerRef.current
        if (!container) return

        const focusableElements = Array.from(
          container.querySelectorAll<HTMLElement>('input, select, textarea, [tabindex]'),
        ).filter((el) => !el.hasAttribute('disabled') && el.tabIndex >= 0)

        const activeEl = document.activeElement
        const currentIndex = focusableElements.indexOf(activeEl as HTMLElement)

        if (e.shiftKey) {
          // Shift+Tab: go to previous
          if (currentIndex > 0) {
            e.preventDefault()
            ;(focusableElements[currentIndex - 1] as HTMLElement).focus()
          }
        } else {
          // Tab: go to next, or commit if on last
          if (currentIndex >= 0 && currentIndex < focusableElements.length - 1) {
            e.preventDefault()
            ;(focusableElements[currentIndex + 1] as HTMLElement).focus()
          } else if (currentIndex === focusableElements.length - 1) {
            e.preventDefault()
            onCommit()
          }
        }
      }
    },
    [status, onCancel, onCommit],
  )

  // Merge fieldValues with inheritedFields for rowData context
  const rowData = { ...inheritedFields, ...fieldValues }

  // ====================================
  // GHOST STATE - placeholder row
  // ====================================
  if (status === 'ghost') {
    return (
      <button
        type="button"
        className="vibegridx-ghost-row opacity-50 cursor-pointer"
        data-ghost-group={groupId}
        onClick={onCommit}
      >
        <Plus className="h-4 w-4 text-muted-foreground mr-2 flex-shrink-0" />
        <span className="text-sm text-muted-foreground">+ New {entityDisplayName}</span>
      </button>
    )
  }

  // ====================================
  // SAVING STATE - locked fields with spinner
  // ====================================
  if (status === 'saving') {
    return (
      <div
        className="vibegridx-ghost-row vibegridx-ghost-row--saving vibegridx-ghost-row--editing"
        data-ghost-group={groupId}
      >
        <Loader2 className="h-4 w-4 text-muted-foreground mr-2 flex-shrink-0 animate-spin" />
        <div className="flex gap-2 flex-1 items-center">
          {inlineColumns.map((col) => {
            const colId = col.id ?? col.field ?? ''
            return (
              <div key={colId} className="vibegridx-ghost-cell">
                <FormFieldValue
                  fieldId={colId}
                  value={fieldValues[colId]}
                  column={col}
                  rowData={rowData}
                  rowIndex={0}
                  cellClassName="vibegridx-ghost-cell"
                />
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ====================================
  // ERROR STATE - re-editable with error message
  // ====================================
  if (status === 'error') {
    return (
      // biome-ignore lint/a11y/noStaticElementInteractions: keyboard handler for Enter/Escape/Tab navigation in inline grid editing row
      <div
        ref={containerRef}
        className="vibegridx-ghost-row vibegridx-ghost-row--error"
        data-ghost-group={groupId}
        onKeyDown={handleKeyDown}
      >
        <div className="flex gap-2 flex-1 items-center">
          {inlineColumns.map((col) => {
            const colId = col.id ?? col.field ?? ''
            const hasFieldError = !!validationErrors[colId]
            return (
              <div
                key={colId}
                className={`vibegridx-ghost-cell ${hasFieldError ? 'border-destructive' : ''}`}
              >
                <FormFieldValue
                  fieldId={colId}
                  value={fieldValues[colId]}
                  column={col}
                  rowData={rowData}
                  rowIndex={0}
                  cellClassName="vibegridx-ghost-cell"
                />
              </div>
            )
          })}
        </div>
        {errorMessage && <div className="text-destructive text-sm mt-1 px-2">{errorMessage}</div>}
      </div>
    )
  }

  // ====================================
  // EDITING STATE - inline form fields
  // ====================================
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: keyboard handler for Enter/Escape/Tab navigation in inline grid editing row
    <div
      ref={containerRef}
      className="vibegridx-ghost-row vibegridx-ghost-row--editing"
      data-ghost-group={groupId}
      onKeyDown={handleKeyDown}
    >
      <div className="flex gap-2 flex-1 items-center">
        {inlineColumns.map((col) => {
          const colId = col.id ?? col.field ?? ''
          const hasFieldError = !!validationErrors[colId]
          return (
            <div
              key={colId}
              className={`vibegridx-ghost-cell ${hasFieldError ? 'border-destructive' : ''}`}
            >
              <FormFieldValue
                fieldId={colId}
                value={fieldValues[colId]}
                column={col}
                rowData={rowData}
                rowIndex={0}
                cellClassName="vibegridx-ghost-cell"
              />
            </div>
          )
        })}
      </div>
      {hasErrors && (
        <div className="text-destructive text-sm mt-1 px-2">Fill required fields to save</div>
      )}
    </div>
  )
})

export default GhostRow
