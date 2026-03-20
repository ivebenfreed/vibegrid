/**
 * Date cell renderer
 */

import type { Column } from '../../types'
import type { CellRenderer, CellRendererContext } from '../SlotRegistry'
import { applyAffordanceAttrs } from '../applyAffordanceAttrs'
import { formatFieldForDisplay, isEmpty, renderEmpty } from './helpers'

class DateCellRenderer implements CellRenderer {
  render(value: unknown, column: Column, _context: CellRendererContext): HTMLElement {
    const el = document.createElement('div')
    const isEditable = column.editable !== false

    // Detect empty/invalid values (including empty objects, TanStack DB proxies)
    const isEmptyOrInvalid =
      value == null ||
      value === '' ||
      (typeof value === 'object' &&
        !(value instanceof Date) &&
        (Object.keys(value as object).length === 0 ||
          'path' in (value as object) ||
          ('type' in (value as object) && (value as Record<string, unknown>).type === 'ref')))

    if (isEmptyOrInvalid) {
      renderEmpty(el, isEditable)
      applyAffordanceAttrs(el, this, isEditable)
      return el
    }

    el.className = 'vibegridx-date-badge'
    const cellType = (column.cellType || 'date') as string
    const displayValue = this.formatDateValue(value, cellType, column)
    const affordance = isEditable ? 'edit' : 'none'

    el.innerHTML = `
      <div data-action="${affordance}" data-affordance-role="badge" style="
        display: inline-flex;
        align-items: center;
        padding: 4px 8px;
        border-radius: 6px;
        font-size: 0.75rem;
        font-weight: 500;
        white-space: nowrap;
        background-color: #eff6ff;
        color: #1e40af;
        border: 1px solid #bfdbfe;
        max-width: 100%;
        min-width: 0;
        font-variant-numeric: tabular-nums;
        user-select: none;
      ">
        <span style="
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          min-width: 0;
          width: 100%;
        ">${displayValue}</span>
      </div>
    `

    applyAffordanceAttrs(el, this, isEditable)
    return el
  }

  format(value: unknown, column: Column, _context: CellRendererContext): string {
    if (value == null) return ''
    const cellType = (column.cellType || 'date') as string
    return this.formatDateValue(value, cellType, column)
  }

  validate(value: unknown, column: Column, _context: CellRendererContext): string | null {
    if (isEmpty(value)) {
      if (column.required) return `${column.name || 'Field'} is required`
      return null
    }
    const dateObj = value instanceof Date ? value : new Date(value as string | number)
    if (Number.isNaN(dateObj.getTime())) {
      return `${column.name || 'Field'} must be a valid date`
    }
    return null
  }

  private formatDateValue(value: unknown, cellType: string, _column: Column): string {
    if (value == null) return ''
    // Use DataForge formatter first
    try {
      const formatted = formatFieldForDisplay(value, cellType)
      if (formatted != null) return String(formatted)
    } catch {
      // Fall through to basic formatting
    }
    return this.basicFormat(value, cellType)
  }

  private basicFormat(value: unknown, cellType: string): string {
    const dateObj = value instanceof Date ? value : new Date(value as string | number)
    if (Number.isNaN(dateObj.getTime())) return String(value)

    switch (cellType) {
      case 'time':
        return dateObj.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
      case 'datetime':
      case 'datetime-local':
      case 'timestamp':
      case 'timestamptz':
        return dateObj.toLocaleString()
      default:
        return dateObj.toLocaleDateString()
    }
  }

  affordances = {
    sortable: true,
    filterable: true,
    editable: true,
    resizable: true,
    reorderable: true,
    groupable: true,
  }

  interactionPolicy = {
    defaultAction: 'edit' as const,
    editTrigger: 'content-click' as const,
    blurPolicy: 'commit' as const,
  }

  affordanceGroup = {
    group: 'editable-badge',
    whenNotEditable: 'readonly-badge',
  }

  metadata = { category: 'basic' as const, description: 'Date cell renderer' }
}

export const dateCellRenderer = new DateCellRenderer()
