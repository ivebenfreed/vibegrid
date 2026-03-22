/**
 * Text and fallback cell renderers
 */

import type { Column } from '../../types'
import type { CellRenderer, CellRendererContext } from '../SlotRegistry'
import { applyAffordanceAttrs } from '../applyAffordanceAttrs'
import { isEmpty, renderEmpty } from './helpers'
import { highlightMatch } from '../../utils/highlight-text'

// ============================================================
// FALLBACK RENDERER (priority -1, catch-all)
// ============================================================

class TextFallbackCellRenderer implements CellRenderer {
  render(value: unknown, column: Column, _context: CellRendererContext): HTMLElement {
    const element = document.createElement('span')
    element.className = 'vg-cell-text'
    element.textContent = value != null ? String(value) : ''
    applyAffordanceAttrs(element, this, column.editable !== false)
    return element
  }

  format(value: unknown, _column: Column, _context: CellRendererContext): string {
    return value != null ? String(value) : ''
  }

  validate(_value: unknown, _column: Column, _context: CellRendererContext): string | null {
    return null
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

  metadata = {
    category: 'basic' as const,
    description: 'Fallback text renderer',
  }
}

// ============================================================
// TEXT
// ============================================================

class TextCellRenderer implements CellRenderer {
  render(value: unknown, column: Column, context: CellRendererContext): HTMLElement {
    const el = document.createElement('span')
    const isEditable = column.editable !== false

    if (isEmpty(value)) {
      renderEmpty(el, isEditable)
      applyAffordanceAttrs(el, this, isEditable)
      return el
    }

    const fieldType = column.cellType || 'text'
    el.className = `vibegridx-cell-${fieldType}`

    const displayValue = String(value)
    el.title = displayValue

    // GH#1391: Highlight matching search text
    const searchText = context.searchText as string | undefined
    const highlighted = searchText ? highlightMatch(displayValue, searchText) : null
    if (highlighted) {
      el.innerHTML = highlighted
    } else {
      el.textContent = displayValue
    }

    // Overflow handling — don't set display:block, it overrides the
    // flex centering applied by .vibegridx-cell (added by BodyRenderer)
    el.style.maxWidth = '100%'

    applyAffordanceAttrs(el, this, isEditable)
    return el
  }

  format(value: unknown, _column: Column, _context: CellRendererContext): string {
    if (value == null) return ''
    return String(value)
  }

  validate(value: unknown, column: Column, _context: CellRendererContext): string | null {
    if (column.required && (value == null || String(value).trim() === '')) {
      return `${column.name || 'Field'} is required`
    }
    const strValue = value == null ? '' : String(value)
    if (column.minLength && strValue.length < column.minLength) {
      return `${column.name || 'Field'} must be at least ${column.minLength} characters`
    }
    if (column.max && strValue.length > column.max) {
      return `${column.name || 'Field'} must be no more than ${column.max} characters`
    }
    return null
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

  metadata = { category: 'basic' as const, description: 'Text cell renderer' }
}

export const textFallbackRenderer = new TextFallbackCellRenderer()
export const textCellRenderer = new TextCellRenderer()
