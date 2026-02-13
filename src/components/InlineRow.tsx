/**
 * InlineRow - Horizontal Inline Layout
 *
 * Renders entity fields horizontally in a single row:
 * - Compact horizontal layout
 * - Optional labels (hidden by default)
 * - Left/Right navigation
 * - Uses existing VibeGrid field type renderers
 *
 * Layout:
 * ┌─────────────────────────────────────────────┐
 * │ [Status] [Priority] [Assignee] [Due Date]   │
 * └─────────────────────────────────────────────┘
 *
 * Use cases:
 * - Entity detail header metadata row
 * - Inline property editors
 * - Compact filter bars
 */

import { observer } from 'mobx-react-lite'
import { useEffect, useRef } from 'react'
import type { Column } from '../types'
import { InlineRowLayoutAdapter } from '../adapters/InlineRowLayoutAdapter'
import type { InteractionStore } from '../stores/InteractionStore'
import { FormFieldValue } from './FormFieldValue'
import './InlineRow.css'
import { getLogger } from '@/shared/lib/logging'

const logger = getLogger(['vibegrid', 'InlineRow'])

export interface InlineRowProps {
  /** Entity data to display */
  data: any
  /** Field definitions (columns) */
  columns: Column[]
  /** Interaction store for selection/focus state */
  interactionStore: InteractionStore | null
  /** Gap between fields (CSS value) */
  fieldGap?: string
  /** Whether to show labels (default: false for compact mode) */
  showLabels?: boolean
  /** Field width behavior */
  fieldWidth?: 'auto' | 'equal' | 'content'
  /** Field change callback (for VibeForm integration) */
  onFieldChange?: (fieldId: string, value: any) => void
}

export const InlineRow = observer(function InlineRow({
  data,
  columns,
  interactionStore,
  fieldGap = '0.75rem',
  showLabels = false,
  fieldWidth = 'auto',
  onFieldChange,
}: InlineRowProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const adapterRef = useRef<InlineRowLayoutAdapter | null>(null)

  // Initialize adapter
  useEffect(() => {
    adapterRef.current = new InlineRowLayoutAdapter({
      columns,
      fieldGap,
      showLabels,
      fieldWidth,
    })

    logger.debug('InlineRow adapter initialized', {
      columnCount: columns.length,
      fieldGap,
      showLabels,
      fieldWidth,
    })
  }, [columns, fieldGap, showLabels, fieldWidth])

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
        case 'ArrowLeft':
          nextFieldId = neighbors.left || null
          break
        case 'ArrowRight':
          nextFieldId = neighbors.right || null
          break
        case 'Tab':
          if (!event.shiftKey) {
            nextFieldId = neighbors.right || null
          } else {
            nextFieldId = neighbors.left || null
          }
          break
      }

      if (nextFieldId) {
        event.preventDefault()
        interactionStore.focusField(nextFieldId)

        const nextElement = container.querySelector(
          `[data-testid="inline-row-field-${nextFieldId}"]`,
        ) as HTMLElement
        if (nextElement?.scrollIntoView) {
          nextElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
        }

        logger.debug('InlineRow keyboard navigation', {
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
      logger.debug('InlineRow field clicked', { fieldId })
    }
  }

  return (
    <div ref={containerRef} className="inline-row" data-testid="inline-row">
      {columns.map((column, index) => {
        const fieldId = column.id
        const value = data[column.field || column.id]
        const isFocused = interactionStore?.focusedFieldId === fieldId

        return (
          <div
            key={fieldId}
            className={`inline-row-field ${isFocused ? 'inline-row-field--focused' : ''}`}
            data-testid={`inline-row-field-${fieldId}`}
            onClick={() => handleFieldClick(fieldId)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                handleFieldClick(fieldId)
              }
            }}
            tabIndex={-1}
            style={adapterRef.current?.getFieldStyle(fieldId)}
          >
            {showLabels && (
              <div className="inline-row-field__label">
                <label htmlFor={`field-${fieldId}`}>{column.label || column.id}</label>
              </div>
            )}
            <div className="inline-row-field__value">
              <FormFieldValue
                fieldId={fieldId}
                value={value}
                column={column}
                rowData={data}
                rowIndex={index}
                cellClassName="inline-row-cell"
                cellWidth="auto"
                containerClassName="inline-row-field-value"
              />
            </div>
          </div>
        )
      })}
    </div>
  )
})

