/**
 * Date cell renderer
 */

import { parseAsLocalDate } from '@/shared/lib/format-date'
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

    // Only expiration-type columns get the red-when-past treatment. Gating on
    // the column identifier keeps arbitrary date columns (due dates, end dates,
    // etc.) in the default blue until we decide to broaden the convention.
    const isExpirationColumn = this.isExpirationColumn(column)
    const isPast = isExpirationColumn && this.isDateInPast(value, cellType)

    const badgeBg = isPast ? '#fef2f2' : '#eff6ff'
    const badgeFg = isPast ? '#991b1b' : '#1e40af'
    const badgeBorder = isPast ? '#fecaca' : '#bfdbfe'

    el.innerHTML = `
      <div data-action="${affordance}" data-affordance-role="badge" style="
        display: inline-flex;
        align-items: center;
        padding: 4px 8px;
        border-radius: 6px;
        font-size: 0.75rem;
        font-weight: 500;
        white-space: nowrap;
        background-color: ${badgeBg};
        color: ${badgeFg};
        border: 1px solid ${badgeBorder};
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

  /**
   * Heuristic: a column represents an expiration date if "expir" appears in
   * its id, field, name, or label. Catches `earliest_expiration_date`,
   * `gl_expiration_date`, `Expiration Date`, etc.
   */
  private isExpirationColumn(column: Column): boolean {
    const candidates = [column.id, column.field, column.name, column.label]
    return candidates.some(
      (v) => typeof v === 'string' && v.toLowerCase().includes('expir'),
    )
  }

  /**
   * Returns true when the value parses to a calendar date/time strictly before
   * "now". For date-only cells ('date') we compare at day granularity (today is
   * NOT past); for datetime/time cells we compare at instant granularity.
   */
  private isDateInPast(value: unknown, cellType: string): boolean {
    const dateObj = parseAsLocalDate(value)
    if (!dateObj || Number.isNaN(dateObj.getTime())) return false

    const now = new Date()
    if (cellType === 'datetime' || cellType === 'datetime-local' || cellType === 'timestamp' || cellType === 'timestamptz' || cellType === 'time') {
      return dateObj.getTime() < now.getTime()
    }
    // Date-only: compare at day granularity in local time.
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    return dateObj.getTime() < startOfToday.getTime()
  }

  private basicFormat(value: unknown, cellType: string): string {
    const dateObj = parseAsLocalDate(value)
    if (!dateObj) return String(value ?? '')

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
