/**
 * Boolean cell renderer
 */

import type { Column } from '../../types'
import type { CellRenderer, CellRendererContext } from '../SlotRegistry'
import { applyAffordanceAttrs } from '../applyAffordanceAttrs'
import { isEmpty, renderEmpty } from './helpers'

class BooleanCellRenderer implements CellRenderer {
  render(value: unknown, column: Column, _context: CellRendererContext): HTMLElement {
    const el = document.createElement('div')
    const isEditable = column.editable !== false

    if (isEmpty(value)) {
      renderEmpty(el, isEditable)
      applyAffordanceAttrs(el, this, isEditable)
      return el
    }

    const boolValue = this.parseBoolean(value)
    const displayValue = this.formatBoolDisplay(boolValue, column)

    // Minimal indicator mode
    const hasCustomLabels = column.display && 'trueLabel' in column.display
    const isMinimalIndicator = hasCustomLabels && column.display?.falseLabel === ''

    if (isMinimalIndicator) {
      el.className = 'vibegridx-boolean-indicator'
      if (boolValue && displayValue) {
        el.innerHTML = `<span style="color: #3b82f6; font-size: 1.25rem; line-height: 1;">${displayValue}</span>`
      } else {
        el.textContent = ''
      }
      applyAffordanceAttrs(el, this, isEditable)
      return el
    }

    el.className = 'vibegridx-boolean-badge'

    let backgroundColor = '#f3f4f6'
    let textColor = '#6b7280'
    let icon = '\u25CB' // ○

    if (boolValue === true) {
      backgroundColor = '#d1fae5'
      textColor = '#065f46'
      icon = '\u2713' // ✓
    } else if (boolValue === false) {
      backgroundColor = '#fee2e2'
      textColor = '#991b1b'
      icon = '\u2717' // ✗
    }

    const affordance = isEditable ? 'toggle' : 'none'
    el.innerHTML = `
      <div data-action="${affordance}" data-affordance-role="control" style="
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 8px;
        border-radius: 6px;
        font-size: 0.75rem;
        font-weight: 600;
        white-space: nowrap;
        background-color: ${backgroundColor};
        color: ${textColor};
        border: 1px solid ${backgroundColor};
        max-width: 100%;
        min-width: 0;
      ">
        <span style="font-size: 10px; flex-shrink: 0;">${icon}</span>
        <span style="
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          min-width: 0;
          flex: 1;
        ">${displayValue}</span>
      </div>
    `

    applyAffordanceAttrs(el, this, isEditable)
    return el
  }

  format(value: unknown, column: Column, _context: CellRendererContext): string {
    const boolValue = this.parseBoolean(value)
    if (boolValue === null) return ''
    return this.formatBoolDisplay(boolValue, column)
  }

  validate(value: unknown, column: Column, _context: CellRendererContext): string | null {
    if (value == null && column.required) {
      return `${column.name || 'Field'} is required`
    }
    return null
  }

  private parseBoolean(value: unknown): boolean | null {
    if (value == null) return null
    if (typeof value === 'boolean') return value
    if (typeof value === 'string') {
      const lower = value.toLowerCase().trim()
      if (['true', 'yes', 'y', '1', 'on'].includes(lower)) return true
      if (['false', 'no', 'n', '0', 'off'].includes(lower)) return false
    }
    if (typeof value === 'number') return value !== 0
    return null
  }

  private formatBoolDisplay(boolValue: boolean | null, column: Column): string {
    if (boolValue === null) return ''
    if (column.display && 'trueLabel' in column.display) {
      return boolValue ? column.display.trueLabel : (column.display.falseLabel ?? '')
    }
    return boolValue ? 'Yes' : 'No'
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
    editTrigger: 'click' as const,
    blurPolicy: 'commit' as const,
  }

  affordanceGroup = {
    group: 'editable-toggle',
    whenNotEditable: 'readonly-badge',
  }

  metadata = { category: 'basic' as const, description: 'Boolean cell renderer' }
}

export const booleanCellRenderer = new BooleanCellRenderer()
