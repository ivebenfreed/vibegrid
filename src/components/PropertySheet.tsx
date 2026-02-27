/**
 * PropertySheet - Vertical Property Sheet Layout for VibeGrid
 *
 * Pure positioning layout that renders entity fields as label:value rows.
 * When renderField is provided (by VibeForm), fields render as editable inputs.
 * When renderField is absent, falls back to FormFieldValue (read-only display).
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
import type { ReactNode } from 'react'
import { useCallback, useEffect, useRef } from 'react'
import type { Column } from '../types'
import type { FieldSlotProps } from '../types/layout-types'
import { PropertySheetAdapter } from '../adapters/PropertySheetAdapter'
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
  /** Optional render slot. When provided, replaces FormFieldValue for each field. */
  renderField?: (props: FieldSlotProps) => ReactNode
}

export const PropertySheet = observer(function PropertySheet({
  data,
  columns,
  interactionStore,
  labelWidth = '200px',
  gap = '1rem',
  onFieldChange,
  renderField,
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
      // Don't hijack keyboard events inside slot editors
      const target = event.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        if (event.key !== 'Tab') return
      }

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
  const handleFieldClick = useCallback(
    (fieldId: string) => {
      if (interactionStore) {
        interactionStore.focusField(fieldId)
        logger.debug('PropertySheet field clicked', { fieldId })
      }
    },
    [interactionStore],
  )

  return (
    // biome-ignore lint/a11y/noNoninteractiveTabindex: Container needs to be focusable for keyboard navigation
    <div ref={containerRef} className="property-sheet" data-testid="property-sheet" tabIndex={0}>
      {columns.map((column, index) => {
        const fieldId = column.id
        const value = data[column.field || column.id]
        const isFocused = interactionStore?.focusedFieldId === fieldId

        return (
          // biome-ignore lint/a11y/noStaticElementInteractions: Field rows need click+keyboard interaction
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
              <label htmlFor={`field-${fieldId}`}>{column.label || column.name || column.id}</label>
              {column.required && <span className="property-sheet-field__required">*</span>}
            </div>
            <div className="property-sheet-field__value">
              {renderField ? (
                renderField({
                  fieldId,
                  column,
                  value,
                  rowData: data,
                  rowIndex: index,
                  onChange: onFieldChange,
                })
              ) : (
                <FormFieldValue
                  fieldId={fieldId}
                  value={value}
                  column={column}
                  rowData={data}
                  rowIndex={index}
                  cellClassName="property-sheet-cell"
                  containerClassName="property-sheet-field-value"
                />
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
})
