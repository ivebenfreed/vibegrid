/**
 * Select cell renderer
 */

import type { Column } from '../../types'
import type { CellRenderer, CellRendererContext } from '../SlotRegistry'
import { applyAffordanceAttrs } from '../applyAffordanceAttrs'
import { getOptionIconDisplay } from '../../utils/icon-mapping'
import { isEmpty, renderEmpty } from './helpers'

interface SelectOption {
  value: string
  label: string
  color?: string
  backgroundColor?: string
  icon?: string
}

class SelectCellRenderer implements CellRenderer {
  render(value: unknown, column: Column, _context: CellRendererContext): HTMLElement {
    const el = document.createElement('span')
    const isEditable = column.editable !== false

    if (isEmpty(value)) {
      renderEmpty(el, isEditable)
      applyAffordanceAttrs(el, this, isEditable)
      return el
    }

    const fieldType = (column.cellType || 'select') as string
    const isMulti = fieldType === 'multi-select' || fieldType === 'select-multi'

    if (isMulti && Array.isArray(value)) {
      this.renderMulti(el, value as unknown[], column, isEditable)
    } else {
      this.renderSingle(el, value, column, isEditable)
    }

    applyAffordanceAttrs(el, this, isEditable)
    return el
  }

  format(value: unknown, column: Column, _context: CellRendererContext): string {
    if (value == null) return ''
    if (Array.isArray(value)) {
      return value
        .map((v) => {
          const opt = this.findOption(v, column)
          return opt ? opt.label : String(v)
        })
        .join(', ')
    }
    const opt = this.findOption(value, column)
    return opt ? opt.label : String(value)
  }

  validate(value: unknown, column: Column, _context: CellRendererContext): string | null {
    if (isEmpty(value) || (Array.isArray(value) && value.length === 0)) {
      if (column.required) return `${column.name || 'Field'} is required`
    }
    return null
  }

  private renderSingle(
    container: HTMLElement,
    value: unknown,
    column: Column,
    isEditable: boolean,
  ): void {
    const option = this.findOption(value, column)
    if (option) {
      const badge = document.createElement('span')
      badge.className = 'vibegridx-enum-badge'
      badge.dataset.action = isEditable ? 'edit' : 'none'
      badge.dataset.affordanceRole = 'badge'
      badge.textContent = option.label
      badge.style.cssText = `
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 8px;
        border-radius: 6px;
        font-size: 0.75rem;
        font-weight: 500;
        white-space: nowrap;
        background-color: ${option.backgroundColor || '#f3f4f6'};
        color: ${option.color || '#374151'};
        border: 1px solid ${option.backgroundColor ? 'transparent' : '#d1d5db'};
      `
      if (option.icon) {
        const iconSymbol = getOptionIconDisplay(option.icon)
        if (iconSymbol) {
          const iconEl = document.createElement('span')
          iconEl.textContent = iconSymbol
          iconEl.style.fontSize = '10px'
          badge.insertBefore(iconEl, badge.firstChild)
        }
      }
      container.appendChild(badge)
    } else {
      container.textContent = String(value)
      container.style.fontStyle = 'italic'
      container.style.opacity = '0.7'
    }
  }

  private renderMulti(
    container: HTMLElement,
    values: unknown[],
    column: Column,
    isEditable: boolean,
  ): void {
    container.style.cssText = 'display: flex; flex-wrap: wrap; gap: 4px; align-items: center;'

    if (values.length === 0) {
      container.textContent = 'No selection'
      container.style.opacity = '0.6'
      return
    }

    for (const val of values) {
      const option = this.findOption(val, column)
      const badge = document.createElement('span')
      badge.className = 'vibegridx-select-badge'
      badge.dataset.action = isEditable ? 'edit' : 'none'
      badge.dataset.affordanceRole = 'badge'

      const opt = option || { value: String(val), label: String(val) }
      badge.textContent = opt.label
      badge.style.cssText = `
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 12px;
        font-weight: 500;
        white-space: nowrap;
        background-color: ${opt.backgroundColor || '#f3f4f6'};
        color: ${opt.color || '#374151'};
        border: 1px solid ${opt.backgroundColor ? 'transparent' : '#d1d5db'};
      `
      if (!option) {
        badge.style.opacity = '0.7'
        badge.style.fontStyle = 'italic'
      }
      if (opt.icon) {
        const iconSymbol = getOptionIconDisplay(opt.icon)
        if (iconSymbol) {
          const iconEl = document.createElement('span')
          iconEl.textContent = iconSymbol
          iconEl.style.fontSize = '10px'
          badge.insertBefore(iconEl, badge.firstChild)
        }
      }
      container.appendChild(badge)
    }
  }

  private findOption(value: unknown, column: Column): SelectOption | null {
    const stringValue = String(value)
    const options = this.getOptions(column)
    // Exact match first, then case-insensitive fallback (handles e.g. saved 'a' vs option 'A')
    return (
      options.find((opt) => opt.value === stringValue) ??
      options.find((opt) => opt.value.toLowerCase() === stringValue.toLowerCase()) ??
      null
    )
  }

  private getOptions(column: Column): SelectOption[] {
    if (column.options && Array.isArray(column.options)) {
      return column.options.map((opt: unknown) =>
        typeof opt === 'string' ? { value: opt, label: opt } : (opt as SelectOption),
      )
    }
    if (column.validation?.enum && Array.isArray(column.validation.enum)) {
      return column.validation.enum.map((val: unknown) => ({
        value: String(val),
        label: String(val),
      }))
    }
    if (column.editor?.options && Array.isArray(column.editor.options)) {
      return column.editor.options.map((opt: unknown) =>
        typeof opt === 'string' ? { value: opt, label: opt } : (opt as SelectOption),
      )
    }
    return []
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

  metadata = { category: 'basic' as const, description: 'Select cell renderer' }
}

export const selectCellRenderer = new SelectCellRenderer()
