/**
 * Number cell renderer
 */

import type { Column } from '../../types'
import type { CellRenderer, CellRendererContext } from '../SlotRegistry'
import { applyAffordanceAttrs } from '../applyAffordanceAttrs'
import { isEmpty, renderEmpty } from './helpers'

class NumberCellRenderer implements CellRenderer {
  render(value: unknown, column: Column, _context: CellRendererContext): HTMLElement {
    const el = document.createElement('span')
    const isEditable = column.editable !== false

    if (isEmpty(value)) {
      renderEmpty(el, isEditable)
      applyAffordanceAttrs(el, this, isEditable)
      return el
    }

    el.className = 'vibegridx-cell-number'
    el.textContent = this.formatNumber(value, column)
    el.style.textAlign = 'right'
    el.style.fontVariantNumeric = 'tabular-nums'

    applyAffordanceAttrs(el, this, isEditable)
    return el
  }

  format(value: unknown, column: Column, _context: CellRendererContext): string {
    return this.formatNumber(value, column)
  }

  validate(value: unknown, column: Column, _context: CellRendererContext): string | null {
    if (isEmpty(value)) {
      if (column.required) return `${column.name || 'Field'} is required`
      return null
    }
    const raw =
      typeof value === 'object' && value !== null && 'amount' in value
        ? (value as { amount: number }).amount
        : value
    const numValue = Number(raw)
    if (Number.isNaN(numValue)) return `${column.name || 'Field'} must be a valid number`
    const cellType = (column.cellType || 'number') as string
    if (cellType === 'integer' && !Number.isInteger(numValue)) {
      return `${column.name || 'Field'} must be a whole number`
    }
    if (column.min !== undefined && numValue < column.min) {
      return `${column.name || 'Field'} must be at least ${column.min}`
    }
    if (column.max !== undefined && numValue > column.max) {
      return `${column.name || 'Field'} must be no more than ${column.max}`
    }
    return null
  }

  private formatNumber(value: unknown, column: Column): string {
    if (value == null) return ''
    // Handle currency objects: {amount: number, currency: string}
    const raw =
      typeof value === 'object' && value !== null && 'amount' in value
        ? (value as { amount: number }).amount
        : value
    const numValue = Number(raw)
    if (Number.isNaN(numValue)) return String(value)

    const cellType = (column.cellType || 'number') as string
    switch (cellType) {
      case 'integer':
        return Math.round(numValue).toLocaleString()
      case 'decimal': {
        const precision = column.minimumFractionDigits ?? 2
        return numValue.toLocaleString(undefined, {
          minimumFractionDigits: precision,
          maximumFractionDigits: precision,
        })
      }
      case 'percentage':
        return `${numValue.toFixed(1)}%`
      case 'currency': {
        // Extract currency code from value object or column config
        const currencyCode =
          (typeof value === 'object' && value !== null && 'currency' in value
            ? (value as { currency: string }).currency
            : column.currency) || 'USD'
        return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: currencyCode,
        }).format(numValue)
      }
      default:
        return numValue.toLocaleString()
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
    group: 'editable-content',
    whenNotEditable: 'readonly-display',
  }

  metadata = { category: 'basic' as const, description: 'Number cell renderer' }
}

export const numberCellRenderer = new NumberCellRenderer()
