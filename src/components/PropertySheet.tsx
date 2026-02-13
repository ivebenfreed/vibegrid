/**
 * PropertySheet - Vertical Property Sheet Layout for VibeGrid
 *
 * Renders entity fields as vertical label:value rows:
 * - Label on left, value on right
 * - Click field to enter edit mode (uses FieldTypeRegistry editors)
 * - Tab/ArrowUp/Down navigation between fields
 * - Integrates with InteractionStore for selection state
 * - Uses existing VibeGrid field type renderers for display
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
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Column } from '../types'
import { PropertySheetAdapter } from '../adapters/PropertySheetAdapter'
import { fieldTypeRegistry } from '../field-types/FieldTypeRegistry'
import type { InteractionStore } from '../stores/InteractionStore'
import { FormFieldValue } from './FormFieldValue'
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
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null)

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

  // Commit edit: save value and exit edit mode
  const commitEdit = useCallback(
    (fieldId: string, newValue: any) => {
      logger.debug('PropertySheet commit edit', { fieldId, newValue })
      setEditingFieldId(null)

      if (onFieldChange) {
        onFieldChange(fieldId, newValue)
      }
    },
    [onFieldChange],
  )

  // Cancel edit: exit edit mode without saving
  const cancelEdit = useCallback(() => {
    logger.debug('PropertySheet cancel edit', { editingFieldId })
    setEditingFieldId(null)
  }, [editingFieldId])

  // Handle keyboard navigation (only when not editing - editing fields handle their own keys)
  useEffect(() => {
    const container = containerRef.current
    if (!container || !adapterRef.current || !interactionStore) return

    const handleKeyDown = (event: KeyboardEvent) => {
      // Don't intercept keyboard events while editing
      if (editingFieldId) return

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
        case 'Enter':
        case 'F2': {
          // Enter edit mode for focused field
          event.preventDefault()
          const column = columns.find((c) => c.id === focusedFieldId)
          if (column && column.editable !== false) {
            setEditingFieldId(focusedFieldId)
          }
          return
        }
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
  }, [interactionStore, editingFieldId, columns])

  // Handle field click to set focus and enter edit mode
  const handleFieldClick = useCallback(
    (fieldId: string, column: Column) => {
      if (interactionStore) {
        interactionStore.focusField(fieldId)
      }

      // Enter edit mode if field is editable
      if (column.editable !== false) {
        setEditingFieldId(fieldId)
        logger.debug('PropertySheet field clicked → edit mode', { fieldId })
      }
    },
    [interactionStore],
  )

  // Restore focus to container after edit ends
  useEffect(() => {
    if (!editingFieldId && interactionStore?.focusedFieldId) {
      const fieldElement = containerRef.current?.querySelector(
        `[data-testid="property-sheet-field-${interactionStore.focusedFieldId}"]`,
      ) as HTMLElement
      if (fieldElement) {
        fieldElement.focus()
      }
    }
  }, [editingFieldId, interactionStore?.focusedFieldId])

  return (
    // biome-ignore lint/a11y/noNoninteractiveTabindex: Container needs to be focusable for keyboard navigation
    <div ref={containerRef} className="property-sheet" data-testid="property-sheet" tabIndex={0}>
      {columns.map((column, index) => {
        const fieldId = column.id
        const value = data[column.field || column.id]
        const isFocused = interactionStore?.focusedFieldId === fieldId
        const isEditing = editingFieldId === fieldId

        return (
          // biome-ignore lint/a11y/noStaticElementInteractions: Field rows need click+keyboard interaction for edit mode
          <div
            key={fieldId}
            className={`property-sheet-field ${isFocused ? 'property-sheet-field--focused' : ''} ${isEditing ? 'property-sheet-field--editing' : ''}`}
            data-testid={`property-sheet-field-${fieldId}`}
            onClick={() => handleFieldClick(fieldId, column)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                handleFieldClick(fieldId, column)
              }
            }}
            tabIndex={-1}
          >
            <div className="property-sheet-field__label">
              <label htmlFor={`field-${fieldId}`}>{column.label || column.name || column.id}</label>
              {column.required && <span className="property-sheet-field__required">*</span>}
            </div>
            <div className="property-sheet-field__value">
              <PropertySheetFieldValue
                fieldId={fieldId}
                value={value}
                column={column}
                rowData={data}
                rowIndex={index}
                isEditing={isEditing}
                onCommit={(newValue) => commitEdit(fieldId, newValue)}
                onCancel={cancelEdit}
                onNavigateNext={() => {
                  // Commit and move to next field
                  if (adapterRef.current && interactionStore) {
                    const neighbors = adapterRef.current.getFieldNeighbors(fieldId)
                    const nextId = neighbors.down || null
                    if (nextId) {
                      interactionStore.focusField(nextId)
                      const nextColumn = columns.find((c) => c.id === nextId)
                      if (nextColumn && nextColumn.editable !== false) {
                        setEditingFieldId(nextId)
                      } else {
                        setEditingFieldId(null)
                      }
                    } else {
                      setEditingFieldId(null)
                    }
                  } else {
                    setEditingFieldId(null)
                  }
                }}
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
 * Switches between display mode (modularCellBridge) and edit mode (FieldTypeRegistry editor)
 */
const PropertySheetFieldValue = observer(function PropertySheetFieldValue({
  fieldId,
  value,
  column,
  rowData,
  rowIndex,
  isEditing,
  onCommit,
  onCancel,
  onNavigateNext,
}: {
  fieldId: string
  value: any
  column: Column
  rowData: any
  rowIndex: number
  isEditing: boolean
  onCommit: (newValue: any) => void
  onCancel: () => void
  onNavigateNext: () => void
}) {
  if (!isEditing) {
    return (
      <FormFieldValue
        fieldId={fieldId}
        value={value}
        column={column}
        rowData={rowData}
        rowIndex={rowIndex}
        cellClassName="property-sheet-cell"
        containerClassName="property-sheet-field-value"
      />
    )
  }

  return (
    <PropertySheetEditor
      fieldId={fieldId}
      value={value}
      column={column}
      onCommit={onCommit}
      onCancel={onCancel}
      onNavigateNext={onNavigateNext}
    />
  )
})

/**
 * PropertySheetEditor - Edit mode for PropertySheet fields
 * Uses FieldTypeRegistry editors for inline editing.
 */
const PropertySheetEditor = observer(function PropertySheetEditor({
  fieldId,
  value,
  column,
  onCommit,
  onCancel,
  onNavigateNext,
}: {
  fieldId: string
  value: any
  column: Column
  onCommit: (newValue: any) => void
  onCancel: () => void
  onNavigateNext: () => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<{ element: HTMLElement; destroy?: () => void } | null>(null)
  const pendingValueRef = useRef<any>(value)
  const committedRef = useRef(false)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    container.innerHTML = ''

    if (editorRef.current?.destroy) {
      editorRef.current.destroy()
    }
    editorRef.current = null
    committedRef.current = false
    pendingValueRef.current = value

    try {
      const fieldType = fieldTypeRegistry.getFieldType(column as any)

      if (!fieldType?.editor) {
        logger.warn('No editor found for field type, falling back to text input', {
          fieldId,
          columnType: column.cellType,
        })
        const input = document.createElement('input')
        input.type = 'text'
        input.value = value == null ? '' : String(value)
        input.className = 'property-sheet-editor-fallback'
        input.style.cssText =
          'width: 100%; border: 1px solid var(--border); border-radius: 4px; padding: 4px 8px; font: inherit;'

        input.addEventListener('input', () => {
          pendingValueRef.current = input.value
        })
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            onCommit(pendingValueRef.current)
          } else if (e.key === 'Escape') {
            e.preventDefault()
            onCancel()
          } else if (e.key === 'Tab') {
            e.preventDefault()
            onCommit(pendingValueRef.current)
            onNavigateNext()
          }
        })
        input.addEventListener('blur', () => {
          if (!committedRef.current) {
            committedRef.current = true
            onCommit(pendingValueRef.current)
          }
        })

        container.appendChild(input)
        setTimeout(() => input.focus(), 0)
        editorRef.current = { element: input }
        return
      }

      const editorElement = fieldType.editor.create(value, column as any, (newValue: any) => {
        if (!committedRef.current) {
          committedRef.current = true
          onCommit(newValue)
        }
      })

      editorElement.style.width = '100%'
      editorElement.classList.add('property-sheet-editor')

      const inputEl = editorElement.querySelector('input, textarea, select') || editorElement
      if (inputEl instanceof HTMLInputElement || inputEl instanceof HTMLTextAreaElement) {
        inputEl.addEventListener('input', () => {
          pendingValueRef.current = fieldType.editor.getValue(editorElement)
        })
      }

      const handleEditorKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          e.stopPropagation()
          onCancel()
        } else if (e.key === 'Tab') {
          e.preventDefault()
          e.stopPropagation()
          const currentValue = fieldType.editor.getValue(editorElement)
          if (!committedRef.current) {
            committedRef.current = true
            onCommit(currentValue)
          }
          onNavigateNext()
        }
      }
      editorElement.addEventListener('keydown', handleEditorKeyDown)

      container.appendChild(editorElement)
      editorRef.current = {
        element: editorElement,
        destroy: () => {
          editorElement.removeEventListener('keydown', handleEditorKeyDown)
          fieldType.editor.destroy(editorElement)
        },
      }
    } catch (error) {
      logger.error('Error creating editor for property sheet field', {
        fieldId,
        error,
      })
      container.textContent = String(value || '')
    }

    return () => {
      if (editorRef.current?.destroy) {
        editorRef.current.destroy()
        editorRef.current = null
      }
    }
  }, [value, column, fieldId, onCommit, onCancel, onNavigateNext])

  return <div ref={containerRef} id={`field-${fieldId}`} className="property-sheet-field-value" />
})
