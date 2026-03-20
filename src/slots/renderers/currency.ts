/**
 * Currency cell renderer
 */

import type { Column } from '../../types'
import type { CellRenderer, CellRendererContext } from '../SlotRegistry'
import { applyAffordanceAttrs } from '../applyAffordanceAttrs'
import { isEmpty, renderEmpty } from './helpers'

class CurrencyCellRenderer implements CellRenderer {
  render(value: unknown, column: Column, _context: CellRendererContext): HTMLElement {
    const el = document.createElement('span')
    const isEditable = column.editable !== false

    if (isEmpty(value)) {
      renderEmpty(el, isEditable)
      applyAffordanceAttrs(el, this, isEditable)
      return el
    }

    el.className = 'vibegridx-cell-currency'
    el.textContent = this.formatCurrency(value, column)
    el.style.textAlign = 'right'
    el.style.fontVariantNumeric = 'tabular-nums'

    applyAffordanceAttrs(el, this, isEditable)
    return el
  }

  format(value: unknown, column: Column, _context: CellRendererContext): string {
    if (value == null) return ''
    return this.formatCurrency(value, column)
  }

  validate(value: unknown, column: Column, _context: CellRendererContext): string | null {
    if (isEmpty(value)) {
      if (column.required) return `${column.name || 'Field'} is required`
      return null
    }
    const parsed = this.parseCurrencyValue(value)
    if (Number.isNaN(parsed.amount)) {
      return `${column.name || 'Field'} must be a valid amount`
    }
    return null
  }

  private formatCurrency(value: unknown, column: Column): string {
    const parsed = this.parseCurrencyValue(value)
    const currency = parsed.currency || column.currency || 'USD'
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(parsed.amount)
  }

  private parseCurrencyValue(value: unknown): { amount: number; currency: string } {
    if (typeof value === 'object' && value !== null) {
      const obj = value as Record<string, unknown>
      return {
        amount: Number(obj.amount) || 0,
        currency: String(obj.currency || 'USD'),
      }
    }
    return { amount: Number(value) || 0, currency: 'USD' }
  }

  affordances = {
    sortable: true,
    filterable: true,
    editable: true,
    resizable: true,
    reorderable: true,
    groupable: true,
  }

  affordanceGroup = { group: 'editable-content', whenNotEditable: 'readonly-display' }

  interactionPolicy = {
    defaultAction: 'edit' as const,
    editTrigger: 'content-click' as const,
    blurPolicy: 'commit' as const,
  }

  metadata = { category: 'basic' as const, description: 'Currency cell renderer' }
}

export const currencyCellRenderer = new CurrencyCellRenderer()
