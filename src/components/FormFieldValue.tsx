/**
 * FormFieldValue - Shared field value renderer for VibeForm layouts
 *
 * Renders a field value using ModularCellBridge (existing VibeGrid cell renderers).
 * Used by SingleColumnForm, TwoColumnForm, GroupedForm, GridForm, InlineRow,
 * and PropertySheet (display mode).
 */

import { observer } from 'mobx-react-lite'
import { useEffect, useMemo, useRef } from 'react'
import type { Column } from '../types'
import { SlotRegistry } from '../slots/SlotRegistry'
import { registerDefaultSlots } from '../slots/slot-initialization'
import { useVibeGridStoresOptional } from '../stores/context'
import { getLogger } from '@/shared/lib/logging'

const logger = getLogger(['vibegrid', 'FormFieldValue'])

export interface FormFieldValueProps {
  fieldId: string
  value: any
  column: Column
  rowData: any
  rowIndex: number
  /** CSS class added to the cell element (e.g. 'single-column-form-cell') */
  cellClassName: string
  /** Width applied to the cell element (default '100%') */
  cellWidth?: string
  /** CSS class for the container div */
  containerClassName?: string
}

export const FormFieldValue = observer(function FormFieldValue({
  fieldId,
  value,
  column,
  rowData: _rowData,
  rowIndex: _rowIndex,
  cellClassName,
  cellWidth = '100%',
  containerClassName,
}: FormFieldValueProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  // Use SlotRegistry from VibeGrid context, or create a standalone one
  const contextStores = useVibeGridStoresOptional()
  const slotRegistry = useMemo(() => {
    if (contextStores) return contextStores.initStore.slotRegistry
    const registry = new SlotRegistry()
    registerDefaultSlots(registry)
    registry.preloadForColumns([column], { viewMode: 'form' })
    return registry
  }, [contextStores, column])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    container.innerHTML = ''

    try {
      const renderer = slotRegistry.resolve(column, { viewMode: 'form' })
      if (renderer) {
        const cellElement = renderer.render(value, column, { viewMode: 'form' })
        cellElement.style.position = 'static'
        cellElement.style.left = 'auto'
        cellElement.style.width = cellWidth
        cellElement.style.flexBasis = 'auto' // override grid's fixed flex-basis
        cellElement.classList.add(cellClassName)
        container.appendChild(cellElement)
      } else {
        container.textContent = String(value || '')
      }
    } catch (error) {
      logger.error('Error rendering form field value', {
        fieldId,
        cellClassName,
        error,
      })
      container.textContent = String(value || '')
    }
  }, [value, column, fieldId, cellClassName, cellWidth, slotRegistry])

  return <div ref={containerRef} id={`field-${fieldId}`} className={containerClassName} />
})
