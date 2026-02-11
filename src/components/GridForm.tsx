/**
 * GridForm - Configurable Grid Form Layout
 *
 * Renders entity fields in a configurable CSS grid:
 * - Configurable number of columns (default 2)
 * - Explicit field placements (row, col, span)
 * - Label above value (within each cell)
 * - Full keyboard navigation (Arrow keys + Tab)
 * - Uses existing VibeGrid field type renderers
 *
 * Layout (3-column example):
 * +-------------+-------------+-------------+
 * | Label A     | Label B     | Label C     |
 * | [ Value A ] | [ Value B ] | [ Value C ] |
 * +-------------+-------------+-------------+
 * | Label D (span 2)          | Label E     |
 * | [ Value D                ]| [ Value E ] |
 * +-------------+-------------+-------------+
 */

import { observer } from 'mobx-react-lite'
import { useEffect, useRef, useMemo } from 'react'
import type { Column } from '../types'
import type { FieldPlacement } from '../types/layout-types'
import { GridLayoutAdapter } from '../adapters/GridLayoutAdapter'
import { modularCellBridge } from '../field-types/ModularCellBridge'
import type { InteractionStore } from '../stores/InteractionStore'
import './GridForm.css'
import { getLogger } from '@/shared/lib/logging'

const logger = getLogger(['vibegrid', 'GridForm'])

export interface GridFormProps {
  /** Entity data to display */
  data: any
  /** Field definitions (columns) */
  columns: Column[]
  /** Interaction store for selection/focus state */
  interactionStore: InteractionStore | null
  /** Explicit field placements */
  fieldPlacements?: FieldPlacement[]
  /** Number of grid columns (default 2) */
  gridColumns?: number
  /** Gap between fields (CSS value) */
  fieldGap?: string
  /** Field change callback (for VibeForm integration) */
  onFieldChange?: (fieldId: string, value: any) => void
}

export const GridForm = observer(function GridForm({
  data,
  columns,
  interactionStore,
  fieldPlacements,
  gridColumns = 2,
  fieldGap = '1rem',
  onFieldChange,
}: GridFormProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const adapterRef = useRef<GridLayoutAdapter | null>(null)

  // Initialize adapter
  useEffect(() => {
    adapterRef.current = new GridLayoutAdapter({
      columns,
      gridColumns,
      fieldPlacements,
      fieldGap,
    })

    logger.debug('GridForm adapter initialized', {
      columnCount: columns.length,
      gridColumns,
      fieldPlacements: fieldPlacements?.length ?? 0,
      fieldGap,
    })
  }, [columns, gridColumns, fieldPlacements, fieldGap])

  // Compute tab order for keyboard navigation
  const tabOrder = useMemo(() => {
    if (!adapterRef.current) return columns.map((c) => c.id)
    return adapterRef.current.getTabOrder()
  }, [columns, gridColumns, fieldPlacements])

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
            // Tab forward: right first, then down to next row
            nextFieldId = neighbors.right || neighbors.down || null
          } else {
            // Shift+Tab: left first, then up to previous row
            nextFieldId = neighbors.left || neighbors.up || null
          }
          break
      }

      if (nextFieldId) {
        event.preventDefault()
        interactionStore.focusField(nextFieldId)

        const nextElement = container.querySelector(
          `[data-testid="grid-form-field-${nextFieldId}"]`,
        ) as HTMLElement
        if (nextElement?.scrollIntoView) {
          nextElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
        }

        logger.debug('GridForm keyboard navigation', {
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
  const handleFieldClick = (fieldId: string): void => {
    if (interactionStore) {
      interactionStore.focusField(fieldId)
      logger.debug('GridForm field clicked', { fieldId })
    }
  }

  // Build column-to-index map for field value lookups
  const columnMap = useMemo(() => {
    const map = new Map<string, { column: Column; index: number }>()
    for (let i = 0; i < columns.length; i++) {
      map.set(columns[i].id, { column: columns[i], index: i })
    }
    return map
  }, [columns])

  // Get grid template columns style
  const gridStyle = useMemo(() => ({
    gridTemplateColumns: Array(gridColumns).fill('1fr').join(' '),
  }), [gridColumns])

  return (
    <div
      ref={containerRef}
      className="grid-form"
      data-testid="grid-form"
      style={gridStyle}
    >
      {tabOrder.map((fieldId) => {
        const entry = columnMap.get(fieldId)
        if (!entry) return null

        const { column, index } = entry
        const value = data[column.field || column.id]
        const isFocused = interactionStore?.focusedFieldId === fieldId

        // Get span from adapter for CSS grid placement
        const placedField = adapterRef.current?.getPlacedField(fieldId)
        const span = placedField?.span ?? 1

        const fieldStyle = span > 1 ? { gridColumn: `span ${span}` } : undefined

        return (
          <div
            key={fieldId}
            className={`grid-form-field ${isFocused ? 'grid-form-field--focused' : ''}`}
            data-testid={`grid-form-field-${fieldId}`}
            style={fieldStyle}
            onClick={() => handleFieldClick(fieldId)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                handleFieldClick(fieldId)
              }
            }}
            tabIndex={-1}
          >
            <div className="grid-form-field__label">
              <label htmlFor={`field-${fieldId}`}>{column.label || column.id}</label>
              {column.required && <span className="grid-form-field__required">*</span>}
            </div>
            <div className="grid-form-field__value">
              <GridFormFieldValue
                fieldId={fieldId}
                value={value}
                column={column}
                rowData={data}
                rowIndex={index}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
})

/**
 * GridFormFieldValue - Renders field value using existing VibeGrid cell renderers
 */
const GridFormFieldValue = observer(function GridFormFieldValue({
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
      cellElement.classList.add('grid-form-cell')

      container.appendChild(cellElement)
    } catch (error) {
      logger.error('Error rendering grid form field value', {
        fieldId,
        error,
      })
      container.textContent = String(value || '')
    }
  }, [value, column, rowData, rowIndex, fieldId])

  return <div ref={containerRef} id={`field-${fieldId}`} className="grid-form-field-value" />
})
