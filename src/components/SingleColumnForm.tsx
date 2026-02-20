/**
 * SingleColumnForm - Stacked Vertical Form Layout
 *
 * Renders entity fields as vertically stacked label:value pairs:
 * - Label above value
 * - Tab/ArrowUp/Down navigation between fields
 * - Uses existing VibeGrid field type renderers
 *
 * Layout:
 * ┌─────────────────────────┐
 * │ Label A                 │
 * │ [    Value A          ] │
 * ├─────────────────────────┤
 * │ Label B                 │
 * │ [    Value B          ] │
 * └─────────────────────────┘
 */

import { observer } from 'mobx-react-lite'
import { useEffect, useRef } from 'react'
import type { Column } from '../types'
import { SingleColumnLayoutAdapter } from '../adapters/SingleColumnLayoutAdapter'
import type { InteractionStore } from '../stores/InteractionStore'
import { FormFieldValue } from './FormFieldValue'
import './SingleColumnForm.css'
import { getLogger } from '@/shared/lib/logging'

const logger = getLogger(['vibegrid', 'SingleColumnForm'])

export interface SingleColumnFormProps {
  /** Entity data to display */
  data: any
  /** Field definitions (columns) */
  columns: Column[]
  /** Interaction store for selection/focus state */
  interactionStore: InteractionStore | null
  /** Gap between fields (CSS value) */
  fieldGap?: string
  /** Gap between label and value (CSS value) */
  labelGap?: string
  /** Field change callback (for VibeForm integration) */
  onFieldChange?: (fieldId: string, value: any) => void
}

export const SingleColumnForm = observer(function SingleColumnForm({
  data,
  columns,
  interactionStore,
  fieldGap = '1.5rem',
  labelGap = '0.5rem',
  onFieldChange,
}: SingleColumnFormProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const adapterRef = useRef<SingleColumnLayoutAdapter | null>(null)

  // Initialize adapter
  useEffect(() => {
    adapterRef.current = new SingleColumnLayoutAdapter({
      columns,
      fieldGap,
      labelGap,
    })

    logger.debug('SingleColumnForm adapter initialized', {
      columnCount: columns.length,
      fieldGap,
      labelGap,
    })
  }, [columns, fieldGap, labelGap])

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
            nextFieldId = neighbors.up || null
          }
          break
      }

      if (nextFieldId) {
        event.preventDefault()
        interactionStore.focusField(nextFieldId)

        const nextElement = container.querySelector(
          `[data-testid="single-column-field-${nextFieldId}"]`,
        ) as HTMLElement
        if (nextElement?.scrollIntoView) {
          nextElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
        }

        logger.debug('SingleColumnForm keyboard navigation', {
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
      logger.debug('SingleColumnForm field clicked', { fieldId })
    }
  }

  const containerStyle = adapterRef.current?.getContainerStyle() ?? {
    display: 'flex',
    flexDirection: 'column',
    gap: fieldGap,
  }

  return (
    <div
      ref={containerRef}
      className="single-column-form"
      data-testid="single-column-form"
      style={containerStyle}
    >
      {columns.map((column, index) => {
        const fieldId = column.id
        const value = data[column.field || column.id]
        const isFocused = interactionStore?.focusedFieldId === fieldId

        return (
          <div
            key={fieldId}
            className={`single-column-form-field ${isFocused ? 'single-column-form-field--focused' : ''}`}
            data-testid={`single-column-field-${fieldId}`}
            onClick={() => handleFieldClick(fieldId)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                handleFieldClick(fieldId)
              }
            }}
            tabIndex={-1}
          >
            <div className="single-column-form-field__label">
              <label htmlFor={`field-${fieldId}`}>{column.label || column.id}</label>
              {column.required && <span className="single-column-form-field__required">*</span>}
            </div>
            <div className="single-column-form-field__value">
              <FormFieldValue
                fieldId={fieldId}
                value={value}
                column={column}
                rowData={data}
                rowIndex={index}
                cellClassName="single-column-form-cell"
                containerClassName="single-column-form-field-value"
              />
            </div>
          </div>
        )
      })}
    </div>
  )
})
