/**
 * Color cell renderer
 */

import type { Column } from '../../types'
import type { CellRenderer, CellRendererContext } from '../SlotRegistry'
import { applyAffordanceAttrs } from '../applyAffordanceAttrs'
import { isEmpty, renderEmpty } from './helpers'

class ColorCellRenderer implements CellRenderer {
  render(value: unknown, column: Column, _context: CellRendererContext): HTMLElement {
    const el = document.createElement('div')
    const isEditable = column.editable !== false

    if (isEmpty(value)) {
      renderEmpty(el, isEditable)
      applyAffordanceAttrs(el, this, isEditable)
      return el
    }

    el.className = 'vibegridx-cell-color'
    el.style.cssText = 'display: flex; align-items: center; gap: 6px; height: 100%;'

    const colorValue = this.normalizeColor(value)

    const swatch = document.createElement('div')
    swatch.style.cssText = `
      width: 16px; height: 16px; border-radius: 3px;
      border: 1px solid #d1d5db; background-color: ${colorValue}; flex-shrink: 0;
    `

    const textSpan = document.createElement('span')
    textSpan.textContent = colorValue
    textSpan.style.cssText =
      'font-family: monospace; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;'

    el.appendChild(swatch)
    el.appendChild(textSpan)

    applyAffordanceAttrs(el, this, isEditable)
    return el
  }

  format(value: unknown, _column: Column, _context: CellRendererContext): string {
    if (value == null) return ''
    return this.normalizeColor(value)
  }

  validate(value: unknown, column: Column, _context: CellRendererContext): string | null {
    if (isEmpty(value)) {
      if (column.required) return `${column.name || 'Field'} is required`
      return null
    }
    const colorStr = String(value).trim()
    if (
      !/^#?[0-9A-Fa-f]{3,6}$/.test(colorStr) &&
      !/^rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)$/i.test(colorStr)
    ) {
      return `${column.name || 'Field'} must be a valid color`
    }
    return null
  }

  private normalizeColor(value: unknown): string {
    if (!value) return '#000000'
    const trimmed = String(value).trim()

    if (/^#[0-9A-Fa-f]{6}$/.test(trimmed)) return trimmed.toUpperCase()
    if (/^#[0-9A-Fa-f]{3}$/.test(trimmed)) {
      return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`.toUpperCase()
    }
    if (/^[0-9A-Fa-f]{6}$/.test(trimmed)) return `#${trimmed.toUpperCase()}`
    if (/^[0-9A-Fa-f]{3}$/.test(trimmed)) {
      return `#${trimmed[0]}${trimmed[0]}${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}`.toUpperCase()
    }

    const rgbMatch = trimmed.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i)
    if (rgbMatch) {
      const r = Number.parseInt(rgbMatch[1], 10)
      const g = Number.parseInt(rgbMatch[2], 10)
      const b = Number.parseInt(rgbMatch[3], 10)
      return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`.toUpperCase()
    }

    return '#000000'
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

  metadata = { category: 'basic' as const, description: 'Color cell renderer' }
}

export const colorCellRenderer = new ColorCellRenderer()
