/**
 * Contact cell renderers: Email, URL, Phone
 */

import type { Column } from '../../types'
import type { CellRenderer, CellRendererContext } from '../SlotRegistry'
import { applyAffordanceAttrs } from '../applyAffordanceAttrs'
import { isEmpty, renderEmpty } from './helpers'

// ============================================================
// EMAIL
// ============================================================

class EmailCellRenderer implements CellRenderer {
  render(value: unknown, column: Column, _context: CellRendererContext): HTMLElement {
    const el = document.createElement('span')
    const isEditable = column.editable !== false

    if (isEmpty(value)) {
      renderEmpty(el, isEditable)
      applyAffordanceAttrs(el, this, isEditable)
      return el
    }

    const emailValue = String(value).toLowerCase().trim()
    el.className = 'vibegridx-cell-email'
    el.textContent = emailValue
    el.style.fontFamily = 'monospace'
    el.style.fontSize = '12px'
    el.style.color = '#2563eb'
    el.dataset.emailHref = `mailto:${emailValue}`

    applyAffordanceAttrs(el, this, isEditable)
    return el
  }

  format(value: unknown, _column: Column, _context: CellRendererContext): string {
    if (value == null) return ''
    return String(value).toLowerCase().trim()
  }

  validate(value: unknown, column: Column, _context: CellRendererContext): string | null {
    if (isEmpty(value)) {
      if (column.required) return `${column.name || 'Field'} is required`
      return null
    }
    const emailValue = String(value).toLowerCase().trim()
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(emailValue)) {
      return `${column.name || 'Field'} must be a valid email address`
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

  affordanceGroup = { group: 'editable-content', whenNotEditable: 'readonly-display' }

  interactionPolicy = {
    defaultAction: 'edit' as const,
    editTrigger: 'content-click' as const,
    blurPolicy: 'commit' as const,
  }

  metadata = { category: 'basic' as const, description: 'Email cell renderer' }
}

// ============================================================
// URL
// ============================================================

class UrlCellRenderer implements CellRenderer {
  render(value: unknown, column: Column, _context: CellRendererContext): HTMLElement {
    const container = document.createElement('div')
    const isEditable = column.editable !== false

    if (isEmpty(value)) {
      renderEmpty(container, isEditable)
      applyAffordanceAttrs(container, this, isEditable)
      return container
    }

    container.className = 'vibegridx-cell-url'
    container.style.display = 'flex'
    container.style.alignItems = 'center'
    container.style.gap = '8px'
    container.style.width = '100%'

    const urlValue = this.normalizeUrl(value)

    const textEl = document.createElement('span')
    textEl.className = 'vibegridx-url-text'
    textEl.style.cssText =
      'display: inline-block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; color: #2563eb; text-decoration: underline;'
    textEl.textContent = urlValue
    textEl.title = urlValue
    textEl.dataset.action = 'navigate'
    textEl.dataset.affordanceRole = 'link'

    try {
      new URL(urlValue)
      textEl.dataset.urlHref = urlValue
    } catch {
      // Invalid URL, no href
    }

    container.appendChild(textEl)

    if (isEditable) {
      const pencilIcon = document.createElement('span')
      pencilIcon.className = 'vibegridx-url-edit-icon'
      pencilIcon.innerHTML = '\u270F\uFE0F'
      pencilIcon.style.cssText =
        'opacity: 0; transition: opacity 0.2s; font-size: 14px; flex-shrink: 0;'
      pencilIcon.dataset.action = 'edit'
      pencilIcon.dataset.affordanceRole = 'icon'
      container.appendChild(pencilIcon)
    }

    applyAffordanceAttrs(container, this, isEditable)
    return container
  }

  format(value: unknown, _column: Column, _context: CellRendererContext): string {
    if (value == null) return ''
    return this.normalizeUrl(value)
  }

  validate(value: unknown, column: Column, _context: CellRendererContext): string | null {
    if (isEmpty(value)) {
      if (column.required) return `${column.name || 'Field'} is required`
      return null
    }
    const urlValue = this.normalizeUrl(value)
    try {
      new URL(urlValue)
    } catch {
      return `${column.name || 'Field'} must be a valid URL`
    }
    return null
  }

  handleClick(context: CellRendererContext & { rowData: unknown; column: Column }): void {
    // Navigation handled by CellActionRouter via data-affordance attributes
    const _ = context // unused, handled via DOM data attributes
  }

  private normalizeUrl(value: unknown): string {
    let urlValue = String(value).trim()
    if (urlValue && !/^[a-z][a-z0-9+.-]*:/i.test(urlValue)) {
      urlValue = `https://${urlValue}`
    }
    return urlValue
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
    defaultAction: 'custom' as const,
    editTrigger: 'icon' as const,
    blurPolicy: 'commit' as const,
  }

  metadata = { category: 'basic' as const, description: 'URL cell renderer' }
}

// ============================================================
// PHONE
// ============================================================

class PhoneCellRenderer implements CellRenderer {
  render(value: unknown, column: Column, _context: CellRendererContext): HTMLElement {
    const el = document.createElement('span')
    const isEditable = column.editable !== false

    if (isEmpty(value)) {
      renderEmpty(el, isEditable)
      applyAffordanceAttrs(el, this, isEditable)
      return el
    }

    el.className = 'vibegridx-cell-phone'
    el.textContent = this.formatPhone(value)
    el.style.fontFamily = 'monospace'
    el.style.fontVariantNumeric = 'tabular-nums'

    const cleaned = String(value).replace(/\D/g, '')
    if (cleaned) {
      el.dataset.phoneHref = `tel:${cleaned}`
    }

    applyAffordanceAttrs(el, this, isEditable)
    return el
  }

  format(value: unknown, _column: Column, _context: CellRendererContext): string {
    if (value == null) return ''
    return this.formatPhone(value)
  }

  validate(value: unknown, column: Column, _context: CellRendererContext): string | null {
    if (isEmpty(value)) {
      if (column.required) return `${column.name || 'Field'} is required`
      return null
    }
    const cleaned = String(value).replace(/\D/g, '')
    if (cleaned.length < 10) return `${column.name || 'Field'} must be at least 10 digits`
    if (cleaned.length > 15) return `${column.name || 'Field'} must be no more than 15 digits`
    return null
  }

  private formatPhone(value: unknown): string {
    const phone = String(value)
    const cleaned = phone.replace(/\D/g, '')
    if (cleaned.length === 0) return phone
    if (cleaned.length === 10) {
      return `+1 (${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`
    }
    if (cleaned.length === 11 && cleaned[0] === '1') {
      return `+1 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`
    }
    if (cleaned.length > 10) return `+${cleaned}`
    return cleaned
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

  metadata = { category: 'basic' as const, description: 'Phone cell renderer' }
}

export const emailCellRenderer = new EmailCellRenderer()
export const urlCellRenderer = new UrlCellRenderer()
export const phoneCellRenderer = new PhoneCellRenderer()
