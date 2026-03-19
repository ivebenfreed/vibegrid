/**
 * Default slot registrations for VibeGrid
 *
 * Registers all built-in field type CellRenderers at priority 0.
 * Called during each grid instance's initialization.
 * Idempotent - safe to call multiple times on the same registry.
 */

import { formatFieldForDisplay } from '@/shared/lib/display-formatters'
import { getLogger } from '@/shared/lib/logging'
import { getOptionIconDisplay } from '../utils/icon-mapping'
import type { Column } from '../types'
import type { CellRenderer, CellRendererContext, SlotRegistry } from './SlotRegistry'
import { applyAffordanceAttrs } from './applyAffordanceAttrs'

const logger = getLogger(['vibegrid', 'slots', 'slot-initialization'])

// ============================================================
// HELPERS
// ============================================================

/**
 * Render the empty-cell placeholder.
 * If editable, show "Edit" pencil; otherwise show blank.
 */
function renderEmpty(element: HTMLElement, isEditable: boolean): void {
  element.className = 'vibegridx-cell-empty'
  if (isEditable) {
    element.innerHTML = '<span style="opacity: 0.6;">Edit \u270F\uFE0F</span>'
  } else {
    element.textContent = ''
  }
}

function isEmpty(value: unknown): boolean {
  return value == null || value === ''
}

/**
 * Wrap text in a child span with affordance attributes.
 * Enables CSS descendant selectors for hover/cursor on content vs padding.
 */
function wrapTextContent(container: HTMLElement, text: string, isEditable: boolean): void {
  const content = document.createElement('span')
  content.textContent = text
  content.style.cssText = 'overflow: hidden; text-overflow: ellipsis; white-space: nowrap;'
  if (isEditable) {
    content.dataset.affordance = 'edit'
    content.dataset.affordanceRole = 'content'
  }
  container.appendChild(content)
}

/**
 * Get backend-resolved display name for an entity reference field.
 * Returns the `{column.id}_name` value ONLY if it's a synthetic resolved field
 * (injected by UnifiedResolver), not a real schema field that happens to match.
 * Prevents collisions like "project" (entity ref) + "project_name" (extracted text).
 */
function getResolvedDisplayName(
  rowData: Record<string, unknown> | undefined,
  column: { id: string },
  context: Record<string, unknown>,
): string | null {
  if (!rowData) return null
  const nameKey = `${column.id}_name`
  const resolved = rowData[nameKey]
  if (!resolved) return null

  // If the _name key is a real schema field, don't treat it as resolved display data
  const tableCoreStore = context.tableCoreStore as
    | { columns?: Array<{ field?: string; id?: string }> }
    | undefined
  if (tableCoreStore?.columns?.some((col) => col.field === nameKey || col.id === nameKey)) {
    return null
  }

  return String(resolved)
}

// ============================================================
// FALLBACK RENDERER (priority -1, catch-all)
// ============================================================

class TextFallbackCellRenderer implements CellRenderer {
  render(value: unknown, column: Column, _context: CellRendererContext): HTMLElement {
    const element = document.createElement('span')
    element.className = 'vg-cell-text'
    const isEditable = column.editable !== false
    wrapTextContent(element, value != null ? String(value) : '', isEditable)
    applyAffordanceAttrs(element, this, isEditable)
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

const textFallbackRenderer = new TextFallbackCellRenderer()

// ============================================================
// 1. TEXT
// ============================================================

class TextCellRenderer implements CellRenderer {
  render(value: unknown, column: Column, _context: CellRendererContext): HTMLElement {
    const el = document.createElement('span')
    const isEditable = column.editable !== false

    if (isEmpty(value)) {
      renderEmpty(el, isEditable)
      applyAffordanceAttrs(el, this, isEditable)
      return el
    }

    const fieldType = column.cellType || 'text'
    el.className = `vibegridx-cell-${fieldType}`
    el.style.maxWidth = '100%'

    const displayValue = String(value)
    wrapTextContent(el, displayValue, isEditable)
    el.title = displayValue

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

// ============================================================
// 2. NUMBER
// ============================================================

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
    el.style.textAlign = 'right'
    el.style.fontVariantNumeric = 'tabular-nums'
    wrapTextContent(el, this.formatNumber(value, column), isEditable)

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

// ============================================================
// 3. DATE
// ============================================================

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
      <div data-affordance="${affordance}" data-affordance-role="badge" style="
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

// ============================================================
// 4. BOOLEAN
// ============================================================

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
      <div data-affordance="${affordance}" data-affordance-role="control" style="
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

// ============================================================
// 5. SELECT
// ============================================================

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
      badge.dataset.affordance = isEditable ? 'edit' : 'none'
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
      badge.dataset.affordance = isEditable ? 'edit' : 'none'
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

// ============================================================
// 6. EMAIL
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
    el.style.fontFamily = 'monospace'
    el.style.fontSize = '12px'
    el.style.color = '#2563eb'
    el.dataset.emailHref = `mailto:${emailValue}`
    wrapTextContent(el, emailValue, isEditable)

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

  interactionPolicy = {
    defaultAction: 'edit' as const,
    editTrigger: 'content-click' as const,
    blurPolicy: 'commit' as const,
  }

  metadata = { category: 'basic' as const, description: 'Email cell renderer' }
}

// ============================================================
// 7. URL
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
    textEl.dataset.affordance = 'navigate'
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
      pencilIcon.dataset.affordance = 'edit'
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
// 8. PHONE
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
    el.style.fontFamily = 'monospace'
    el.style.fontVariantNumeric = 'tabular-nums'
    wrapTextContent(el, this.formatPhone(value), isEditable)

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

  interactionPolicy = {
    defaultAction: 'edit' as const,
    editTrigger: 'content-click' as const,
    blurPolicy: 'commit' as const,
  }

  metadata = { category: 'basic' as const, description: 'Phone cell renderer' }
}

// ============================================================
// 9. COLOR
// ============================================================

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

// ============================================================
// 10. CURRENCY (dedicated, separate from number/currency alias)
// ============================================================

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
    el.style.textAlign = 'right'
    el.style.fontVariantNumeric = 'tabular-nums'
    wrapTextContent(el, this.formatCurrency(value, column), isEditable)

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

  interactionPolicy = {
    defaultAction: 'edit' as const,
    editTrigger: 'content-click' as const,
    blurPolicy: 'commit' as const,
  }

  metadata = { category: 'basic' as const, description: 'Currency cell renderer' }
}

// ============================================================
// 11. FILE
// ============================================================

class FileCellRenderer implements CellRenderer {
  render(value: unknown, column: Column, _context: CellRendererContext): HTMLElement {
    const el = document.createElement('div')
    const isEditable = column.editable !== false

    if (isEmpty(value)) {
      renderEmpty(el, isEditable)
      applyAffordanceAttrs(el, this, isEditable)
      return el
    }

    el.className = 'vibegridx-cell-file'
    el.style.cssText = 'display: flex; align-items: center; gap: 6px;'

    const fileData = this.parseFileValue(value)
    const icon = this.getFileIcon(fileData.type)
    const sizeText = fileData.size ? this.formatFileSize(fileData.size) : ''

    el.innerHTML = `
      <span style="font-size: 14px;">${icon}</span>
      <div style="flex: 1; min-width: 0;">
        <div style="font-weight: 500; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
          ${fileData.name}
        </div>
        ${sizeText ? `<div style="font-size: 10px; color: #6b7280;">${sizeText}</div>` : ''}
      </div>
    `

    applyAffordanceAttrs(el, this, isEditable)
    return el
  }

  format(value: unknown, _column: Column, _context: CellRendererContext): string {
    if (value == null) return ''
    const fileData = this.parseFileValue(value)
    return fileData.name
  }

  private parseFileValue(value: unknown): {
    url: string
    name: string
    size?: number
    type?: string
  } {
    if (typeof value === 'object' && value !== null) {
      const obj = value as Record<string, unknown>
      return {
        url: String(obj.url || ''),
        name: String(obj.name || 'Unknown file'),
        size: obj.size as number | undefined,
        type: obj.type as string | undefined,
      }
    }
    if (typeof value === 'string') {
      const fileName = value.split('/').pop() || 'file'
      return { url: value, name: fileName }
    }
    return { url: '', name: 'Invalid file' }
  }

  private getFileIcon(type?: string): string {
    if (!type) return '\uD83D\uDCC4' // 📄
    if (type.startsWith('image/')) return '\uD83D\uDDBC\uFE0F' // 🖼️
    if (type.startsWith('video/')) return '\uD83C\uDFA5' // 🎥
    if (type.startsWith('audio/')) return '\uD83C\uDFB5' // 🎵
    if (type.includes('pdf')) return '\uD83D\uDCD5' // 📕
    return '\uD83D\uDCC4' // 📄
  }

  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${Number.parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`
  }

  affordances = {
    sortable: true,
    filterable: true,
    editable: false,
    resizable: true,
    reorderable: true,
    groupable: false,
  }

  interactionPolicy = {
    defaultAction: 'custom' as const,
    editTrigger: 'none' as const,
    blurPolicy: 'commit' as const,
  }

  metadata = { category: 'basic' as const, description: 'File cell renderer' }
}

// ============================================================
// 12. IMAGE
// ============================================================

class ImageCellRenderer implements CellRenderer {
  render(value: unknown, column: Column, _context: CellRendererContext): HTMLElement {
    const el = document.createElement('div')
    const isEditable = column.editable !== false

    el.className = 'vibegridx-cell-image'
    el.style.cssText = 'display: flex; align-items: center; gap: 6px; height: 100%;'

    if (!value) {
      el.innerHTML = '<span style="opacity: 0.6; font-size: 12px;">No image</span>'
      applyAffordanceAttrs(el, this, isEditable)
      return el
    }

    const imageData =
      typeof value === 'object' && value !== null
        ? (value as Record<string, unknown>)
        : { url: String(value), name: 'image' }

    const img = document.createElement('img')
    img.src = String(imageData.url || '')
    img.alt = String(imageData.name || 'Image')
    img.style.cssText =
      'width: 24px; height: 24px; object-fit: cover; border-radius: 3px; border: 1px solid #d1d5db;'

    const nameSpan = document.createElement('span')
    nameSpan.textContent = String(imageData.name || 'Image')
    nameSpan.style.cssText =
      'font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;'

    el.appendChild(img)
    el.appendChild(nameSpan)

    applyAffordanceAttrs(el, this, isEditable)
    return el
  }

  format(value: unknown, _column: Column, _context: CellRendererContext): string {
    if (value == null) return ''
    if (typeof value === 'object' && value !== null) {
      return String((value as Record<string, unknown>).name || '')
    }
    return String(value)
  }

  affordances = {
    sortable: true,
    filterable: true,
    editable: false,
    resizable: true,
    reorderable: true,
    groupable: false,
  }

  interactionPolicy = {
    defaultAction: 'custom' as const,
    editTrigger: 'none' as const,
    blurPolicy: 'commit' as const,
  }

  metadata = { category: 'basic' as const, description: 'Image cell renderer' }
}

// ============================================================
// 13. RATING
// ============================================================

class RatingCellRenderer implements CellRenderer {
  render(value: unknown, column: Column, _context: CellRendererContext): HTMLElement {
    const el = document.createElement('div')
    const isEditable = column.editable !== false

    el.className = 'vibegridx-cell-rating'
    el.style.cssText = 'display: flex; align-items: center; gap: 2px;'

    const rating = Number(value) || 0
    const maxRating = column.max || 5

    for (let i = 1; i <= maxRating; i++) {
      const star = document.createElement('span')
      star.textContent = i <= rating ? '\u2605' : '\u2606' // ★ or ☆
      star.style.cssText = `color: ${i <= rating ? '#fbbf24' : '#d1d5db'}; font-size: 14px;`
      el.appendChild(star)
    }

    if (rating > 0) {
      const text = document.createElement('span')
      text.textContent = ` ${rating}/${maxRating}`
      text.style.cssText = 'font-size: 11px; color: #6b7280; margin-left: 4px;'
      el.appendChild(text)
    }

    applyAffordanceAttrs(el, this, isEditable)
    return el
  }

  format(value: unknown, _column: Column, _context: CellRendererContext): string {
    return value ? `${value} stars` : '0 stars'
  }

  validate(value: unknown, column: Column, _context: CellRendererContext): string | null {
    const rating = Number(value)
    const maxRating = column.max || 5
    if (Number.isNaN(rating) || rating < 0 || rating > maxRating) {
      return `${column.name || 'Field'} must be between 0 and ${maxRating}`
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
    editTrigger: 'click' as const,
    blurPolicy: 'commit' as const,
  }

  metadata = { category: 'basic' as const, description: 'Rating cell renderer' }
}

// ============================================================
// 14. SLIDER
// ============================================================

class SliderCellRenderer implements CellRenderer {
  render(value: unknown, column: Column, _context: CellRendererContext): HTMLElement {
    const el = document.createElement('div')
    const isEditable = column.editable !== false

    el.className = 'vibegridx-cell-slider'
    el.style.cssText = 'display: flex; align-items: center; gap: 8px; width: 100%;'

    const numValue = Number(value) || 0
    const min = column.min ?? 0
    const max = column.max ?? 100
    const percentage = ((numValue - min) / (max - min)) * 100

    const progressBar = document.createElement('div')
    progressBar.style.cssText =
      'flex: 1; height: 6px; background: #e5e7eb; border-radius: 3px; position: relative;'

    const progress = document.createElement('div')
    progress.style.cssText = `height: 100%; background: #3b82f6; border-radius: 3px; width: ${Math.max(0, Math.min(100, percentage))}%;`
    progressBar.appendChild(progress)

    const valueSpan = document.createElement('span')
    valueSpan.textContent = String(numValue)
    valueSpan.style.cssText =
      'font-size: 12px; font-weight: 500; min-width: 30px; text-align: right;'

    el.appendChild(progressBar)
    el.appendChild(valueSpan)

    applyAffordanceAttrs(el, this, isEditable)
    return el
  }

  format(value: unknown, _column: Column, _context: CellRendererContext): string {
    return String(Number(value) || 0)
  }

  validate(value: unknown, column: Column, _context: CellRendererContext): string | null {
    const numValue = Number(value)
    if (Number.isNaN(numValue)) return `${column.name || 'Field'} must be a number`
    const min = column.min ?? 0
    const max = column.max ?? 100
    if (numValue < min || numValue > max) {
      return `${column.name || 'Field'} must be between ${min} and ${max}`
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
    editTrigger: 'click' as const,
    blurPolicy: 'commit' as const,
  }

  metadata = { category: 'basic' as const, description: 'Slider cell renderer' }
}

// ============================================================
// 15. MARKDOWN
// ============================================================

class MarkdownCellRenderer implements CellRenderer {
  render(value: unknown, column: Column, _context: CellRendererContext): HTMLElement {
    const el = document.createElement('div')
    const isEditable = column.editable !== false

    el.className = 'vibegridx-cell-markdown'

    if (!value) {
      el.innerHTML = '<span style="opacity: 0.6; font-size: 12px;">No content</span>'
      applyAffordanceAttrs(el, this, isEditable)
      return el
    }

    const text = String(value)
    el.innerHTML = this.createMarkdownPreview(text)
    el.style.cssText =
      'font-size: 12px; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; text-overflow: ellipsis;'

    applyAffordanceAttrs(el, this, isEditable)
    return el
  }

  format(value: unknown, _column: Column, _context: CellRendererContext): string {
    return value ? String(value) : ''
  }

  private createMarkdownPreview(markdown: string): string {
    return markdown
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/^# (.*$)/gm, '<h3>$1</h3>')
      .replace(/^## (.*$)/gm, '<h4>$1</h4>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
      .replace(/\n/g, '<br>')
  }

  affordances = {
    sortable: true,
    filterable: true,
    editable: true,
    resizable: true,
    reorderable: true,
    groupable: false,
  }

  interactionPolicy = {
    defaultAction: 'edit' as const,
    editTrigger: 'content-click' as const,
    blurPolicy: 'commit' as const,
  }

  metadata = { category: 'basic' as const, description: 'Markdown cell renderer' }
}

// ============================================================
// 16. ENTITY NAME
// ============================================================

class EntityNameCellRenderer implements CellRenderer {
  render(value: unknown, column: Column, _context: CellRendererContext): HTMLElement {
    const container = document.createElement('div')
    const isEditable = column.editable !== false

    container.className = 'vibegridx-cell-entity-name'
    container.dataset.fieldType = 'entity-name'
    container.style.display = 'flex'
    container.style.alignItems = 'center'
    container.style.gap = '8px'
    container.style.width = '100%'
    container.style.height = '100%'

    // Text element (link-styled)
    const textEl = document.createElement('span')
    textEl.className = 'vibegridx-entity-name-text'
    textEl.style.cssText =
      'display: inline-block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; color: var(--primary); text-decoration: none; transition: text-decoration 0.2s;'
    textEl.dataset.affordance = 'navigate'
    textEl.dataset.affordanceRole = 'link'
    textEl.dataset.fieldType = 'entity-name'

    if (isEmpty(value)) {
      textEl.textContent = 'Untitled'
      textEl.style.opacity = '0.5'
      textEl.style.fontStyle = 'italic'
    } else {
      textEl.textContent = String(value)
    }

    // Pencil icon (shown on hover via CSS)
    const pencilIcon = document.createElement('span')
    pencilIcon.className = 'vibegridx-entity-name-edit-icon'
    pencilIcon.innerHTML = '\u270F\uFE0F'
    pencilIcon.style.cssText =
      'opacity: 0; transition: opacity 0.2s; font-size: 14px; flex-shrink: 0;'
    pencilIcon.title = 'Click to edit inline'
    pencilIcon.dataset.affordance = isEditable ? 'edit' : 'none'
    pencilIcon.dataset.affordanceRole = 'icon'

    container.appendChild(textEl)
    container.appendChild(pencilIcon)

    applyAffordanceAttrs(container, this, isEditable)
    return container
  }

  format(value: unknown, _column: Column, _context: CellRendererContext): string {
    if (value == null) return ''
    return String(value)
  }

  validate(value: unknown, column: Column, _context: CellRendererContext): string | null {
    if (column.required && isEmpty(value)) {
      return `${column.name || 'Field'} is required`
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
    defaultAction: 'navigate' as const,
    editTrigger: 'icon' as const,
    blurPolicy: 'commit' as const,
  }

  affordanceGroup = {
    group: 'link-with-edit-icon',
    whenNotEditable: 'link-only',
  }

  metadata = { category: 'basic' as const, description: 'Entity name cell renderer' }
}

// ============================================================
// 17. ROW EXPAND
// ============================================================

class RowExpandCellRenderer implements CellRenderer {
  render(_value: unknown, _column: Column, _context: CellRendererContext): HTMLElement {
    const container = document.createElement('div')
    container.className = 'vibegridx-expand-cell'

    // RowExpand gets rowData from the context or column's internal state
    // The BodyRenderer passes rowData as the value for this cell type
    const rowData = _value as Record<string, unknown> | null

    const canExpand = rowData?._canExpand !== false
    if (!canExpand || !rowData) {
      return container
    }

    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'vibegridx-expand-button'
    button.setAttribute('data-action', 'expand-row')
    button.setAttribute('data-row-id', String(rowData.id || ''))
    button.setAttribute('aria-label', rowData._isExpanded ? 'Collapse row' : 'Expand row')
    button.setAttribute('aria-expanded', String(!!rowData._isExpanded))

    const chevron = document.createElement('span')
    chevron.className = 'vibegridx-expand-chevron'
    if (rowData._isExpanded) {
      chevron.classList.add('vibegridx-expand-chevron--expanded')
    }
    chevron.textContent = '\u203A' // ›

    button.appendChild(chevron)
    container.appendChild(button)

    applyAffordanceAttrs(container, this, false)
    return container
  }

  format(value: unknown, _column: Column, _context: CellRendererContext): string {
    return value ? '\u25BC' : '\u25B6' // ▼ or ▶
  }

  affordances = {
    sortable: false,
    filterable: false,
    editable: false,
    resizable: false,
    reorderable: false,
    groupable: false,
  }

  interactionPolicy = {
    defaultAction: 'custom' as const,
    editTrigger: 'none' as const,
    blurPolicy: 'commit' as const,
  }

  metadata = { category: 'basic' as const, description: 'Row expand/collapse renderer' }
}

// ============================================================
// 20. COMPUTED EXPRESSION
// ============================================================

class ComputedExpressionCellRenderer implements CellRenderer {
  render(value: unknown, _column: Column, _context: CellRendererContext): HTMLElement {
    const container = document.createElement('div')
    container.className = 'vibegridx-cell-computed'
    container.style.cssText =
      'display: flex; align-items: center; gap: 6px; font-variant-numeric: tabular-nums;'

    const valueSpan = document.createElement('span')
    valueSpan.textContent = String(value ?? '')
    valueSpan.style.cssText = 'font-weight: 500; color: #059669;'

    const indicator = document.createElement('span')
    indicator.textContent = 'f(x)'
    indicator.title = 'Computed expression'
    indicator.style.cssText = 'font-size: 10px; opacity: 0.7; font-weight: bold;'

    container.appendChild(valueSpan)
    container.appendChild(indicator)

    applyAffordanceAttrs(container, this, false)
    return container
  }

  format(value: unknown, _column: Column, _context: CellRendererContext): string {
    return String(value ?? '')
  }

  validate(_value: unknown, _column: Column, _context: CellRendererContext): string | null {
    return null
  }

  affordances = {
    sortable: true,
    filterable: true,
    editable: false,
    resizable: true,
    reorderable: true,
    groupable: true,
  }

  interactionPolicy = {
    defaultAction: 'none' as const,
    editTrigger: 'none' as const,
    blurPolicy: 'commit' as const,
  }

  affordanceGroup = {
    group: 'readonly-display',
    whenNotEditable: 'readonly-display',
  }

  metadata = {
    category: 'computed' as const,
    description: 'Computed expression renderer',
  }
}

// ============================================================
// 21. COMPUTED FORMULA
// ============================================================

class ComputedFormulaCellRenderer implements CellRenderer {
  render(value: unknown, _column: Column, _context: CellRendererContext): HTMLElement {
    const container = document.createElement('div')
    container.className = 'vibegridx-cell-computed'
    container.style.cssText =
      'display: flex; align-items: center; gap: 6px; font-variant-numeric: tabular-nums;'

    const valueSpan = document.createElement('span')
    valueSpan.textContent = String(value ?? '')
    valueSpan.style.cssText = 'font-weight: 500; color: #059669;'

    const indicator = document.createElement('span')
    indicator.textContent = '\u03A3f'
    indicator.title = 'Computed formula'
    indicator.style.cssText = 'font-size: 10px; opacity: 0.7; font-weight: bold;'

    container.appendChild(valueSpan)
    container.appendChild(indicator)

    applyAffordanceAttrs(container, this, false)
    return container
  }

  format(value: unknown, _column: Column, _context: CellRendererContext): string {
    return String(value ?? '')
  }

  validate(_value: unknown, _column: Column, _context: CellRendererContext): string | null {
    return null
  }

  affordances = {
    sortable: true,
    filterable: true,
    editable: false,
    resizable: true,
    reorderable: true,
    groupable: true,
  }

  interactionPolicy = {
    defaultAction: 'none' as const,
    editTrigger: 'none' as const,
    blurPolicy: 'commit' as const,
  }

  affordanceGroup = {
    group: 'readonly-display',
    whenNotEditable: 'readonly-display',
  }

  metadata = {
    category: 'computed' as const,
    description: 'Computed formula renderer',
  }
}

// ============================================================
// 22. COMPUTED DECISION TABLE
// ============================================================

class ComputedDecisionTableCellRenderer implements CellRenderer {
  render(value: unknown, _column: Column, _context: CellRendererContext): HTMLElement {
    const container = document.createElement('div')
    container.className = 'vibegridx-cell-computed-decision-table'
    container.style.cssText =
      'display: flex; align-items: center; gap: 6px; font-variant-numeric: tabular-nums;'

    const { label, status } = this.resolveDecision(value)
    const badge = document.createElement('span')
    badge.textContent = label
    badge.style.cssText = this.badgeStyle(status)

    // Add violations tooltip for fail state
    // Note: ComputedFieldResult.violations is string[] (message strings, not objects)
    const obj = value as Record<string, unknown> | null
    if (status === 'fail' && obj) {
      const violations = Array.isArray(obj.violations) ? obj.violations : []
      if (violations.length > 0) {
        badge.textContent = `${label} \u25BE`
        badge.style.cursor = 'pointer'
        const lines = violations.map((v: unknown) => {
          // violations can be plain strings (from computed-field-helpers)
          // or objects with { ruleId, ruleName, severity, message } (from DecisionResult)
          if (typeof v === 'string') return `\u2717 ${v}`
          if (typeof v === 'object' && v !== null) {
            const vo = v as Record<string, unknown>
            const severity = vo.severity === 'warning' ? '\u26A0' : '\u2717'
            const name = vo.ruleName ? `${vo.ruleName}: ` : ''
            return `${severity} ${name}${vo.message ?? ''}`
          }
          return String(v)
        })
        badge.title = `${violations.length} violation${violations.length > 1 ? 's' : ''}:\n${lines.join('\n')}`
      }
    }

    container.appendChild(badge)
    applyAffordanceAttrs(container, this, false)
    return container
  }

  format(value: unknown, _column: Column, _context: CellRendererContext): string {
    return this.resolveDecision(value).label
  }

  validate(_value: unknown, _column: Column, _context: CellRendererContext): string | null {
    return null
  }

  private resolveDecision(value: unknown): { label: string; status: 'pass' | 'fail' | 'pending' } {
    if (value == null) return { label: 'pending', status: 'pending' }
    if (typeof value === 'object') {
      const obj = value as Record<string, unknown>
      if (obj.status != null) {
        const s = String(obj.status)
        const score = typeof obj.score === 'number' ? ` (${Math.round(obj.score)})` : ''
        const status = s === 'pass' ? 'pass' : s === 'fail' ? 'fail' : 'pending'
        return { label: `${s}${score}`, status }
      }
      if (obj.passed != null) {
        const passed = !!obj.passed
        const label = passed ? 'pass' : 'fail'
        const score = typeof obj.score === 'number' ? ` (${Math.round(obj.score)})` : ''
        return { label: `${label}${score}`, status: passed ? 'pass' : 'fail' }
      }
    }
    return { label: String(value), status: 'pending' }
  }

  private badgeStyle(status: 'pass' | 'fail' | 'pending'): string {
    const base =
      'display: inline-flex; align-items: center; gap: 4px; border-radius: 4px; border: 1px solid; padding: 1px 8px; font-size: 12px; line-height: 1.4; font-weight: 500;'
    switch (status) {
      case 'pass':
        return `${base} background-color: var(--color-green-100, #dcfce7); color: var(--color-green-800, #166534); border-color: var(--color-green-200, #bbf7d0);`
      case 'fail':
        return `${base} background-color: var(--color-red-100, #fee2e2); color: var(--color-red-800, #991b1b); border-color: var(--color-red-200, #fecaca);`
      default:
        return `${base} background-color: var(--color-muted, #f1f5f9); color: var(--color-muted-foreground, #64748b); border-color: var(--color-border, #e2e8f0);`
    }
  }

  affordances = {
    sortable: true,
    filterable: true,
    editable: false,
    resizable: true,
    reorderable: true,
    groupable: false,
  }

  interactionPolicy = {
    defaultAction: 'none' as const,
    editTrigger: 'none' as const,
    blurPolicy: 'commit' as const,
  }

  affordanceGroup = {
    group: 'readonly-display',
    whenNotEditable: 'readonly-display',
  }

  metadata = {
    category: 'computed' as const,
    description: 'Computed decision table renderer',
  }
}

// ============================================================
// PHASE 2c: ROLLUP FIELD TYPE CELLRENDERERS
// ============================================================

// --- 23. ROLLUP COUNT ---

class RollupCountCellRenderer implements CellRenderer {
  render(value: unknown, _column: Column, _context: CellRendererContext): HTMLElement {
    const container = document.createElement('div')

    container.className = 'vibegridx-rollup-count'
    container.style.cssText = `
      display: flex;
      align-items: center;
      gap: 6px;
      font-variant-numeric: tabular-nums;
      color: #374151;
    `

    const valueSpan = document.createElement('span')
    valueSpan.className = 'vibegridx-rollup-value'
    valueSpan.textContent = String(value || 0)
    valueSpan.style.cssText = `
      font-weight: 500;
      text-align: right;
    `

    const indicator = document.createElement('span')
    indicator.className = 'vibegridx-rollup-indicator'
    indicator.textContent = '\uD83D\uDCCA'
    indicator.title = 'Rollup count field'
    indicator.style.cssText = `
      font-size: 10px;
      opacity: 0.7;
    `

    container.appendChild(valueSpan)
    container.appendChild(indicator)

    applyAffordanceAttrs(container, this, false)
    return container
  }

  format(value: unknown, _column: Column, _context: CellRendererContext): string {
    return String(value || 0)
  }

  validate(_value: unknown, _column: Column, _context: CellRendererContext): string | null {
    return null
  }

  affordances = {
    sortable: true,
    filterable: true,
    editable: false,
    resizable: true,
    reorderable: true,
    groupable: true,
  }

  interactionPolicy = {
    defaultAction: 'none' as const,
    editTrigger: 'none' as const,
    blurPolicy: 'commit' as const,
  }

  affordanceGroup = {
    group: 'readonly-display',
    whenNotEditable: 'readonly-display',
  }

  metadata = { category: 'rollup' as const, description: 'Rollup count renderer' }
}

// --- 24. ROLLUP SUM ---

class RollupSumCellRenderer implements CellRenderer {
  render(value: unknown, _column: Column, _context: CellRendererContext): HTMLElement {
    const container = document.createElement('div')

    container.className = 'vibegridx-rollup-sum'
    container.style.cssText = `
      display: flex;
      align-items: center;
      gap: 6px;
      font-variant-numeric: tabular-nums;
      color: #374151;
    `

    const valueSpan = document.createElement('span')
    valueSpan.className = 'vibegridx-rollup-value'
    valueSpan.textContent = this.formatLocaleNumber(value)
    valueSpan.style.cssText = `
      font-weight: 500;
      text-align: right;
    `

    const indicator = document.createElement('span')
    indicator.className = 'vibegridx-rollup-indicator'
    indicator.textContent = '\u03A3'
    indicator.title = 'Rollup sum field'
    indicator.style.cssText = `
      font-size: 10px;
      opacity: 0.7;
    `

    container.appendChild(valueSpan)
    container.appendChild(indicator)

    applyAffordanceAttrs(container, this, false)
    return container
  }

  format(value: unknown, _column: Column, _context: CellRendererContext): string {
    return this.formatLocaleNumber(value)
  }

  validate(_value: unknown, _column: Column, _context: CellRendererContext): string | null {
    return null
  }

  private formatLocaleNumber(value: unknown): string {
    if (value == null) return '0'
    const num = Number(value)
    if (Number.isNaN(num)) return '0'
    return num.toLocaleString()
  }

  affordances = {
    sortable: true,
    filterable: true,
    editable: false,
    resizable: true,
    reorderable: true,
    groupable: true,
  }

  interactionPolicy = {
    defaultAction: 'none' as const,
    editTrigger: 'none' as const,
    blurPolicy: 'commit' as const,
  }

  affordanceGroup = {
    group: 'readonly-display',
    whenNotEditable: 'readonly-display',
  }

  metadata = { category: 'rollup' as const, description: 'Rollup sum renderer' }
}

// --- 25. ROLLUP AVERAGE ---

class RollupAverageCellRenderer implements CellRenderer {
  render(value: unknown, _column: Column, _context: CellRendererContext): HTMLElement {
    const container = document.createElement('div')

    container.className = 'vibegridx-rollup-average'
    container.style.cssText = `
      display: flex;
      align-items: center;
      gap: 6px;
      font-variant-numeric: tabular-nums;
      color: #374151;
    `

    const valueSpan = document.createElement('span')
    valueSpan.className = 'vibegridx-rollup-value'
    valueSpan.textContent = this.formatDecimal(value)
    valueSpan.style.cssText = `
      font-weight: 500;
      text-align: right;
    `

    const indicator = document.createElement('span')
    indicator.className = 'vibegridx-rollup-indicator'
    indicator.textContent = 'x\u0304'
    indicator.title = 'Rollup average field'
    indicator.style.cssText = `
      font-size: 10px;
      opacity: 0.7;
    `

    container.appendChild(valueSpan)
    container.appendChild(indicator)

    applyAffordanceAttrs(container, this, false)
    return container
  }

  format(value: unknown, _column: Column, _context: CellRendererContext): string {
    return this.formatDecimal(value)
  }

  validate(_value: unknown, _column: Column, _context: CellRendererContext): string | null {
    return null
  }

  private formatDecimal(value: unknown): string {
    if (value == null) return '0.00'
    const num = Number(value)
    if (Number.isNaN(num)) return '0.00'
    return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  affordances = {
    sortable: true,
    filterable: true,
    editable: false,
    resizable: true,
    reorderable: true,
    groupable: true,
  }

  interactionPolicy = {
    defaultAction: 'none' as const,
    editTrigger: 'none' as const,
    blurPolicy: 'commit' as const,
  }

  affordanceGroup = {
    group: 'readonly-display',
    whenNotEditable: 'readonly-display',
  }

  metadata = { category: 'rollup' as const, description: 'Rollup average renderer' }
}

// --- 26. ROLLUP CONCAT ---

class RollupConcatCellRenderer implements CellRenderer {
  render(value: unknown, _column: Column, _context: CellRendererContext): HTMLElement {
    const container = document.createElement('div')

    container.className = 'vibegridx-rollup-concat'
    container.style.cssText = `
      display: flex;
      align-items: center;
      gap: 6px;
      max-width: 100%;
      color: #374151;
    `

    const valueSpan = document.createElement('span')
    valueSpan.className = 'vibegridx-rollup-value'
    valueSpan.textContent = this.formatConcat(value)
    valueSpan.title = this.formatConcat(value)
    valueSpan.style.cssText = `
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      flex: 1;
      font-size: 12px;
    `

    const indicator = document.createElement('span')
    indicator.className = 'vibegridx-rollup-indicator'
    indicator.textContent = '\uD83D\uDCDD'
    indicator.title = 'Rollup concat field'
    indicator.style.cssText = `
      font-size: 10px;
      opacity: 0.7;
      flex-shrink: 0;
    `

    container.appendChild(valueSpan)
    container.appendChild(indicator)

    applyAffordanceAttrs(container, this, false)
    return container
  }

  format(value: unknown, _column: Column, _context: CellRendererContext): string {
    return this.formatConcat(value)
  }

  validate(_value: unknown, _column: Column, _context: CellRendererContext): string | null {
    return null
  }

  private formatConcat(value: unknown): string {
    if (value == null) return ''
    if (Array.isArray(value)) return value.join(', ')
    return String(value)
  }

  affordances = {
    sortable: true,
    filterable: true,
    editable: false,
    resizable: true,
    reorderable: true,
    groupable: false,
  }

  interactionPolicy = {
    defaultAction: 'none' as const,
    editTrigger: 'none' as const,
    blurPolicy: 'commit' as const,
  }

  affordanceGroup = {
    group: 'readonly-display',
    whenNotEditable: 'readonly-display',
  }

  metadata = { category: 'rollup' as const, description: 'Rollup concat renderer' }
}

// ============================================================
// PHASE 2b: RELATIONSHIP FIELD TYPE CELLRENDERERS
// ============================================================

// --- 25. ENTITY REFERENCE ---

class EntityReferenceCellRenderer implements CellRenderer {
  render(value: unknown, column: Column, context: CellRendererContext): HTMLElement {
    const container = document.createElement('div')
    const isEditable = column.editable !== false

    container.className = 'vibegridx-entity-reference'
    container.style.cssText =
      'max-width: 100%; min-width: 0; overflow: hidden; display: flex; align-items: center; gap: 4px;'

    if (isEmpty(value)) {
      renderEmpty(container, isEditable)
      applyAffordanceAttrs(container, this, isEditable)
      // Empty cells: whole area should trigger edit, not navigate (nothing to navigate to)
      if (isEditable) {
        container.setAttribute('data-affordance', 'edit')
      }
      return container
    }

    // Multi-value handling: array of entity IDs
    if (Array.isArray(value) && value.length >= 2) {
      return this.renderMultiValue(value, column, context, container, isEditable)
    }

    // Unwrap single-element arrays
    const singleValue = Array.isArray(value) ? value[0] : value

    // Resolve the raw entity ID for data attributes
    const rawEntityId =
      typeof singleValue === 'string'
        ? singleValue
        : typeof singleValue === 'object' && singleValue !== null && 'id' in singleValue
          ? String((singleValue as Record<string, unknown>).id)
          : String(singleValue)

    const rowData = (context as Record<string, unknown>).rowData as
      | Record<string, unknown>
      | undefined

    // Check for backend-resolved display name (_name suffix from UnifiedResolver)
    const resolvedDisplayName = getResolvedDisplayName(
      rowData,
      column,
      context as Record<string, unknown>,
    )
    if (resolvedDisplayName) {
      container.innerHTML = this.createEntityBadge(resolvedDisplayName, column, rawEntityId)
      this.applyNavigableAffordance(container, isEditable)
      return container
    }

    if (rowData) {
      // Legacy: check __resolved_ prefix (deprecated, kept as fallback)
      const resolvedValue = rowData[`__resolved_${column.id}`]
      if (resolvedValue) {
        const name =
          typeof resolvedValue === 'object' && resolvedValue !== null
            ? String(
                (resolvedValue as Record<string, unknown>).name ||
                  (resolvedValue as Record<string, unknown>).title ||
                  singleValue,
              )
            : String(resolvedValue)
        container.innerHTML = this.createEntityBadge(name, column, rawEntityId)
        this.applyNavigableAffordance(container, isEditable)
        return container
      }
    }

    // If singleValue is an object with .name or .title, use that
    if (typeof singleValue === 'object' && singleValue !== null) {
      const candidate =
        (singleValue as Record<string, unknown>).name ||
        (singleValue as Record<string, unknown>).title
      if (candidate) {
        container.innerHTML = this.createEntityBadge(String(candidate), column, rawEntityId)
        this.applyNavigableAffordance(container, isEditable)
        return container
      }
    }

    // Unresolved UUID - try async resolution via TableCoreStore
    const entityId = String(singleValue)
    const tableCoreStore = (context as Record<string, any>).tableCoreStore as
      | {
          getEntityReferenceRecord: (t: string, id: string) => any
          ensureEntityReferenceRecord: (t: string, id: string) => Promise<any>
        }
      | undefined
    const targetEntity =
      (column as any).relationshipConfig?.targetEntityType ||
      (column as any).relationshipTargetEntity ||
      (column as any).targetEntityType ||
      null

    if (tableCoreStore && targetEntity) {
      // Check synchronous cache first
      const cached = tableCoreStore.getEntityReferenceRecord(targetEntity, entityId)
      if (cached) {
        const name = cached.name || cached.title || `${targetEntity} ${entityId.slice(-4)}`
        container.innerHTML = this.createEntityBadge(String(name), column, entityId)
        this.applyNavigableAffordance(container, isEditable)
        return container
      }

      // Async resolve — show placeholder, update when data arrives
      // Don't apply navigable affordance (pencil icon) during loading state
      container.textContent = 'Loading...'
      container.style.opacity = '0.6'

      tableCoreStore
        .ensureEntityReferenceRecord(targetEntity, entityId)
        .then((record: any) => {
          if (record) {
            const name = record.name || record.title || `${targetEntity} ${entityId.slice(-4)}`
            container.innerHTML = this.createEntityBadge(String(name), column, entityId)
            this.applyNavigableAffordance(container, isEditable)
            container.style.opacity = '1'
          } else {
            container.textContent = `${targetEntity} ${entityId.slice(-4)}`
            container.style.opacity = '0.6'
          }
        })
        .catch(() => {
          container.textContent = `${targetEntity} ${entityId.slice(-4)}`
          container.style.opacity = '0.6'
        })
      return container
    }

    // No store or target entity — show truncated ID
    container.textContent = entityId.length > 8 ? `${entityId.slice(-8)}` : String(singleValue)
    container.style.opacity = '0.6'
    applyAffordanceAttrs(container, this, isEditable)
    return container
  }

  /** Apply container attrs + pencil icon for navigable badge pattern */
  private applyNavigableAffordance(container: HTMLElement, isEditable: boolean): void {
    // Set container-level attributes for CSS (but NOT data-affordance — that lives on child elements)
    container.setAttribute('data-affordance-group', this.affordanceGroup.group)
    container.setAttribute('data-editable', isEditable ? 'true' : 'false')

    // Append pencil edit icon when editable
    if (isEditable) {
      const pencilIcon = document.createElement('span')
      pencilIcon.className = 'vibegridx-entity-reference-edit-icon'
      pencilIcon.textContent = '✏️'
      pencilIcon.style.cssText =
        'opacity: 0; transition: opacity 0.2s; font-size: 14px; flex-shrink: 0; cursor: pointer;'
      pencilIcon.dataset.affordance = 'edit'
      pencilIcon.dataset.affordanceRole = 'icon'
      pencilIcon.title = 'Edit link'
      container.appendChild(pencilIcon)
    }
  }

  /** Render multi-value relationship cell: first badge + "+N more" overflow */
  private renderMultiValue(
    values: unknown[],
    column: Column,
    context: CellRendererContext,
    container: HTMLElement,
    isEditable: boolean,
  ): HTMLElement {
    // Render first badge using single-value path
    const firstId = String(values[0])
    const rowData = (context as Record<string, unknown>).rowData as
      | Record<string, unknown>
      | undefined
    const resolvedName = getResolvedDisplayName(rowData, column, context as Record<string, unknown>)
    const displayName = resolvedName ?? firstId.slice(-4)
    container.innerHTML = this.createEntityBadge(displayName, column, firstId)

    // "+N more" overflow badge
    const overflowCount = values.length - 1
    const overflowBadge = document.createElement('span')
    overflowBadge.className = 'vibegridx-entity-overflow-badge'
    overflowBadge.textContent = `+${overflowCount} more`
    overflowBadge.style.cssText =
      'display:inline-flex;align-items:center;padding:2px 6px;border-radius:4px;font-size:0.7rem;font-weight:500;cursor:pointer;color:var(--entity-badge-text, #0369a1);background-color:var(--entity-badge-bg, #f0f9ff);border:1px solid var(--entity-badge-border, #bae6fd);white-space:nowrap;'
    overflowBadge.dataset.affordanceRole = 'overflow-trigger'

    // Hover on overflow badge shows popover with all entity badges.
    // Popover is created once (lazily) and shown/hidden to avoid DOM churn.
    let popover: HTMLElement | null = null
    let hideTimeout: ReturnType<typeof setTimeout> | null = null

    // Lazy-render: only create badge DOM for visible items.
    // Renders an initial batch, then appends more as user scrolls near the bottom.
    const BATCH_SIZE = 20
    let renderedCount = 0

    const renderBatch = (pop: HTMLElement, count: number): void => {
      const rowData = (context as Record<string, unknown>).rowData as
        | Record<string, unknown>
        | undefined
      const end = Math.min(renderedCount + count, values.length)
      for (let i = renderedCount; i < end; i++) {
        const eid = String(values[i])
        const resolvedName = getResolvedDisplayName(
          rowData,
          column,
          context as Record<string, unknown>,
        )
        const displayName = resolvedName ?? eid.slice(-4)
        const wrapper = document.createElement('div')
        wrapper.innerHTML = this.createEntityBadge(displayName, column, eid)
        const badge = wrapper.firstElementChild as HTMLElement
        if (badge) pop.appendChild(badge)
      }
      renderedCount = end
    }

    const ensurePopover = (): HTMLElement => {
      if (popover) return popover

      popover = document.createElement('div')
      popover.className = 'vibegridx-entity-overflow-popover'
      popover.style.cssText =
        'position:fixed;z-index:9999;display:flex;flex-direction:column;gap:4px;padding:8px;border-radius:8px;border:1px solid var(--border, #e5e7eb);background-color:var(--card, white);box-shadow:0 4px 12px rgba(0,0,0,0.15);max-height:200px;max-width:320px;overflow-y:auto;'

      // Render first batch only
      renderBatch(popover, BATCH_SIZE)

      // Load more as user scrolls near bottom
      popover.addEventListener('scroll', () => {
        if (renderedCount >= values.length) return
        const el = popover!
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 40) {
          renderBatch(el, BATCH_SIZE)
        }
      })

      popover.addEventListener('mouseenter', () => {
        if (hideTimeout) clearTimeout(hideTimeout)
      })
      popover.addEventListener('mouseleave', () => {
        hideTimeout = setTimeout(hidePopover, 150)
      })

      document.body.appendChild(popover)
      return popover
    }

    const showPopover = () => {
      if (hideTimeout) clearTimeout(hideTimeout)
      const el = ensurePopover()
      const rect = overflowBadge.getBoundingClientRect()
      el.style.left = `${rect.left}px`
      el.style.top = `${rect.bottom + 4}px`
      el.style.display = 'flex'
    }

    const hidePopover = () => {
      if (popover) {
        popover.style.display = 'none'
      }
    }

    overflowBadge.addEventListener('mouseenter', showPopover)
    overflowBadge.addEventListener('mouseleave', () => {
      hideTimeout = setTimeout(hidePopover, 150)
    })

    container.appendChild(overflowBadge)
    this.applyNavigableAffordance(container, isEditable)
    return container
  }

  format(value: unknown, column: Column, context: CellRendererContext): string {
    if (isEmpty(value)) return ''

    const rowData = (context as Record<string, unknown>).rowData as
      | Record<string, unknown>
      | undefined

    const resolvedDisplayName2 = getResolvedDisplayName(
      rowData,
      column,
      context as Record<string, unknown>,
    )
    if (resolvedDisplayName2) return resolvedDisplayName2

    if (rowData) {
      const resolvedValue = rowData[`__resolved_${column.id}`]
      if (resolvedValue) {
        if (typeof resolvedValue === 'object' && resolvedValue !== null) {
          return String(
            (resolvedValue as Record<string, unknown>).name ||
              (resolvedValue as Record<string, unknown>).title ||
              value,
          )
        }
        return String(resolvedValue)
      }
    }

    if (typeof value === 'object' && value !== null) {
      const candidate =
        (value as Record<string, unknown>).name || (value as Record<string, unknown>).title
      if (candidate) return String(candidate)
    }

    return String(value)
  }

  private createEntityBadge(displayName: string, column: Column, entityId?: string): string {
    const targetEntity =
      ((column as any).relationshipConfig?.targetEntityType as string | undefined) ||
      ((column as any).relationshipTargetEntity as string | undefined) ||
      ((column as any).targetEntityType as string | undefined)
    const iconLetter = (targetEntity || displayName).charAt(0).toUpperCase()
    const entityTypeAttr = targetEntity ? ` data-entity-type="${targetEntity}"` : ''
    const entityIdAttr = entityId ? ` data-entity-id="${entityId}"` : ''

    return `<div class="vibegridx-entity-badge" data-affordance="navigate"${entityTypeAttr}${entityIdAttr} title="${displayName}" style="display:inline-flex;align-items:center;gap:6px;padding:4px 8px;border-radius:6px;font-size:0.75rem;font-weight:500;white-space:nowrap;cursor:pointer;background-color:var(--entity-badge-bg, #f0f9ff);color:var(--entity-badge-text, #0369a1);border:1px solid var(--entity-badge-border, #bae6fd);max-width:100%;min-width:0;"><div class="vibegridx-entity-icon" style="width:14px;height:14px;border-radius:3px;background-color:var(--entity-badge-icon-bg, #0ea5e9);color:white;display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:600;flex-shrink:0;">${iconLetter}</div><span class="vibegridx-entity-name" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;flex:1;">${displayName}</span><span class="vibegridx-entity-badge-arrow" style="opacity:0.5;font-size:10px;flex-shrink:0;line-height:1;">↗</span></div>`
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
    defaultAction: 'navigate' as const,
    editTrigger: 'icon' as const,
    blurPolicy: 'commit' as const,
  }

  affordanceGroup = {
    group: 'navigable-badge-with-edit-icon',
    whenNotEditable: 'link-only',
  }

  metadata = { category: 'relationship' as const, description: 'Entity reference cell renderer' }
}

// --- 26. USER REFERENCE ---

class UserReferenceCellRenderer implements CellRenderer {
  render(value: unknown, column: Column, context: CellRendererContext): HTMLElement {
    const container = document.createElement('div')
    const isEditable = column.editable !== false

    container.className = 'vibegridx-user-reference'
    container.style.cssText =
      'max-width: 100%; min-width: 0; overflow: hidden; display: flex; align-items: center; gap: 4px;'

    if (isEmpty(value)) {
      renderEmpty(container, isEditable)
      applyAffordanceAttrs(container, this, isEditable)
      // Empty cells: whole area should trigger edit, not navigate (nothing to navigate to)
      if (isEditable) {
        container.setAttribute('data-affordance', 'edit')
      }
      return container
    }

    const rawUserId = typeof value === 'string' ? value : String(value)

    const rowData = (context as Record<string, unknown>).rowData as
      | Record<string, unknown>
      | undefined

    // Check for backend-resolved display name (_name suffix from UnifiedResolver)
    const userResolvedName = getResolvedDisplayName(
      rowData,
      column,
      context as Record<string, unknown>,
    )
    if (userResolvedName) {
      container.innerHTML = this.createUserBadgeFromName(userResolvedName, rawUserId)
      this.applyNavigableAffordance(container, isEditable)
      return container
    }

    if (rowData) {
      // Legacy: check _resolved suffix (deprecated, kept as fallback)
      const resolvedValue = rowData[`${column.id}_resolved`]
      if (resolvedValue) {
        container.innerHTML = this.createUserBadgeFromName(String(resolvedValue), rawUserId)
        this.applyNavigableAffordance(container, isEditable)
        return container
      }
    }

    // If value is not a UUID (no dash pattern), treat as display name
    if (typeof value === 'string' && !/^[0-9a-f-]{36}$/i.test(value)) {
      container.innerHTML = this.createUserBadgeFromName(value)
      this.applyNavigableAffordance(container, isEditable)
      return container
    }

    // Unresolved UUID - show truncated "User xxxx"
    const userId = String(value)
    container.textContent = `User ${userId.slice(-4)}`
    container.style.opacity = '0.6'
    container.style.fontStyle = 'italic'
    applyAffordanceAttrs(container, this, isEditable)
    return container
  }

  format(value: unknown, column: Column, context: CellRendererContext): string {
    if (isEmpty(value)) return ''

    const rowData = (context as Record<string, unknown>).rowData as
      | Record<string, unknown>
      | undefined

    const userFormatResolved = getResolvedDisplayName(
      rowData,
      column,
      context as Record<string, unknown>,
    )
    if (userFormatResolved) return userFormatResolved

    if (rowData) {
      const resolvedValue = rowData[`${column.id}_resolved`]
      if (resolvedValue) return String(resolvedValue)
    }

    if (typeof value === 'string' && !/^[0-9a-f-]{36}$/i.test(value)) {
      return value
    }

    return `User ${String(value).slice(-4)}`
  }

  private createUserBadgeFromName(displayName: string, userId?: string): string {
    const initials = this.getInitials(displayName)
    const entityIdAttr = userId ? ` data-entity-id="${userId}"` : ''
    return `<div class="vibegridx-user-badge" data-affordance="navigate" data-entity-type="User"${entityIdAttr} title="${displayName}" style="display:inline-flex;align-items:center;gap:6px;padding:4px 8px;border-radius:6px;font-size:0.75rem;font-weight:500;white-space:nowrap;cursor:pointer;background-color:var(--user-badge-bg, #f3f4f6);color:var(--user-badge-text, #374151);border:1px solid var(--user-badge-border, #d1d5db);max-width:100%;min-width:0;"><div class="vibegridx-user-avatar" style="width:18px;height:18px;border-radius:50%;background-color:var(--user-badge-avatar-bg, #6366f1);color:white;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:600;flex-shrink:0;">${initials}</div><span class="vibegridx-user-name" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;flex:1;">${displayName}</span><span class="vibegridx-user-badge-arrow" style="opacity:0.5;font-size:10px;flex-shrink:0;line-height:1;">↗</span></div>`
  }

  private getInitials(name: string): string {
    if (!name) return '?'
    const words = name.trim().split(/\s+/)
    if (words.length === 1) {
      return words[0].charAt(0).toUpperCase()
    }
    return words
      .slice(0, 2)
      .map((word) => word.charAt(0).toUpperCase())
      .join('')
  }

  /** Apply container attrs + pencil icon for navigable badge pattern */
  private applyNavigableAffordance(container: HTMLElement, isEditable: boolean): void {
    container.setAttribute('data-affordance-group', this.affordanceGroup.group)
    container.setAttribute('data-editable', isEditable ? 'true' : 'false')

    if (isEditable) {
      const pencilIcon = document.createElement('span')
      pencilIcon.className = 'vibegridx-user-reference-edit-icon'
      pencilIcon.textContent = '✏️'
      pencilIcon.style.cssText =
        'opacity: 0; transition: opacity 0.2s; font-size: 14px; flex-shrink: 0; cursor: pointer;'
      pencilIcon.dataset.affordance = 'edit'
      pencilIcon.dataset.affordanceRole = 'icon'
      pencilIcon.title = 'Edit link'
      container.appendChild(pencilIcon)
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
    defaultAction: 'navigate' as const,
    editTrigger: 'icon' as const,
    blurPolicy: 'commit' as const,
  }

  affordanceGroup = {
    group: 'navigable-badge-with-edit-icon',
    whenNotEditable: 'link-only',
  }

  metadata = { category: 'relationship' as const, description: 'User reference cell renderer' }
}
// ============================================================
// SHARED STATELESS INSTANCES
// ============================================================

const textCellRenderer = new TextCellRenderer()
const numberCellRenderer = new NumberCellRenderer()
const dateCellRenderer = new DateCellRenderer()
const booleanCellRenderer = new BooleanCellRenderer()
const selectCellRenderer = new SelectCellRenderer()
const emailCellRenderer = new EmailCellRenderer()
const urlCellRenderer = new UrlCellRenderer()
const phoneCellRenderer = new PhoneCellRenderer()
const colorCellRenderer = new ColorCellRenderer()
const currencyCellRenderer = new CurrencyCellRenderer()
const fileCellRenderer = new FileCellRenderer()
const imageCellRenderer = new ImageCellRenderer()
const ratingCellRenderer = new RatingCellRenderer()
const sliderCellRenderer = new SliderCellRenderer()
const markdownCellRenderer = new MarkdownCellRenderer()
const entityNameCellRenderer = new EntityNameCellRenderer()
const rowExpandCellRenderer = new RowExpandCellRenderer()
const entityReferenceCellRenderer = new EntityReferenceCellRenderer()
const userReferenceCellRenderer = new UserReferenceCellRenderer()
const computedExpressionCellRenderer = new ComputedExpressionCellRenderer()
const computedFormulaCellRenderer = new ComputedFormulaCellRenderer()
const computedDecisionTableCellRenderer = new ComputedDecisionTableCellRenderer()
const rollupCountCellRenderer = new RollupCountCellRenderer()
const rollupSumCellRenderer = new RollupSumCellRenderer()
const rollupAverageCellRenderer = new RollupAverageCellRenderer()
const rollupConcatCellRenderer = new RollupConcatCellRenderer()

// ============================================================
// 28. BADGE LIST (admin many-to-many badges with +N overflow)
// ============================================================

const BADGE_LIST_MAX_VISIBLE = 3

class BadgeListCellRenderer implements CellRenderer {
  render(value: unknown, _column: Column, _context: CellRendererContext): HTMLElement {
    const container = document.createElement('div')
    container.style.cssText =
      'display:flex;flex-wrap:nowrap;gap:4px;align-items:center;overflow:hidden;'

    const items = this.normalize(value)
    if (items.length === 0) {
      container.textContent = '—'
      container.style.opacity = '0.5'
      return container
    }

    const visible = items.slice(0, BADGE_LIST_MAX_VISIBLE)
    const overflow = items.length - BADGE_LIST_MAX_VISIBLE

    for (const name of visible) {
      container.appendChild(this.badge(name))
    }
    if (overflow > 0) {
      const more = this.badge(`+${overflow}`)
      more.title = items.join(', ')
      more.style.fontWeight = '600'
      more.style.backgroundColor = 'hsl(var(--accent))'
      more.style.color = 'hsl(var(--accent-foreground))'
      container.appendChild(more)
    }

    applyAffordanceAttrs(container, this, false)
    return container
  }

  format(value: unknown): string {
    const items = this.normalize(value)
    return items.join(', ')
  }

  validate(): string | null {
    return null // read-only
  }

  affordances = {
    sortable: false,
    filterable: false,
    editable: false,
    resizable: true,
    reorderable: true,
    groupable: false,
  }

  interactionPolicy = {
    defaultAction: 'custom' as const,
    editTrigger: 'none' as const,
    blurPolicy: 'cancel' as const,
  }

  affordanceGroup = { group: 'editable-badge', whenNotEditable: 'readonly-badge' }
  metadata = { category: 'basic' as const, description: 'Badge list with +N overflow' }

  private normalize(value: unknown): string[] {
    if (!value || !Array.isArray(value)) return []
    return value.map((v: unknown) =>
      typeof v === 'string' ? v : (((v as Record<string, unknown>)?.name as string) ?? String(v)),
    )
  }

  private badge(label: string): HTMLElement {
    const el = document.createElement('span')
    el.textContent = label
    el.dataset.affordance = 'edit'
    el.dataset.affordanceRole = 'badge'
    el.style.cssText = `
      display:inline-flex;align-items:center;
      padding:1px 8px;border-radius:9999px;
      font-size:11px;font-weight:500;white-space:nowrap;line-height:1.4;
      background:hsl(var(--muted));color:hsl(var(--muted-foreground));
      border:1px solid hsl(var(--border));
    `
    return el
  }
}

const badgeListCellRenderer = new BadgeListCellRenderer()

// ============================================================
// REGISTRATION
// ============================================================

/**
 * Register all default slots for built-in field types.
 *
 * Registers the text fallback at priority -1, and all field type
 * CellRenderers at priority 0 with their aliases.
 *
 * @param registry - SlotRegistry instance to register slots on
 */
export function registerDefaultSlots(registry: SlotRegistry): void {
  logger.debug('Registering default slots')

  // Catch-all fallback at priority -1
  registry.register({
    id: '__text_fallback__',
    priority: -1,
    canHandle: () => true,
    renderer: () => textFallbackRenderer,
  })

  // --- 1. Text ---
  registry.register({ id: 'text', priority: 0, renderer: () => textCellRenderer })
  registry.register({ id: 'string', priority: 0, renderer: () => textCellRenderer })

  // --- 2. Number ---
  registry.register({ id: 'number', priority: 0, renderer: () => numberCellRenderer })
  registry.register({ id: 'integer', priority: 0, renderer: () => numberCellRenderer })
  registry.register({ id: 'decimal', priority: 0, renderer: () => numberCellRenderer })
  registry.register({ id: 'percentage', priority: 0, renderer: () => numberCellRenderer })

  // --- 3. Date ---
  registry.register({ id: 'date', priority: 0, renderer: () => dateCellRenderer })
  registry.register({ id: 'datetime', priority: 0, renderer: () => dateCellRenderer })
  registry.register({ id: 'datetime-local', priority: 0, renderer: () => dateCellRenderer })
  registry.register({ id: 'time', priority: 0, renderer: () => dateCellRenderer })
  registry.register({ id: 'timestamp', priority: 0, renderer: () => dateCellRenderer })
  registry.register({ id: 'timestamptz', priority: 0, renderer: () => dateCellRenderer })

  // --- 4. Boolean ---
  registry.register({ id: 'boolean', priority: 0, renderer: () => booleanCellRenderer })

  // --- 5. Select ---
  registry.register({ id: 'select', priority: 0, renderer: () => selectCellRenderer })
  registry.register({ id: 'single-select', priority: 0, renderer: () => selectCellRenderer })
  registry.register({ id: 'multi-select', priority: 0, renderer: () => selectCellRenderer })
  registry.register({ id: 'select-multi', priority: 0, renderer: () => selectCellRenderer })
  registry.register({ id: 'enum', priority: 0, renderer: () => selectCellRenderer })
  registry.register({ id: 'custom_select', priority: 0, renderer: () => selectCellRenderer })
  registry.register({
    id: 'custom_option_reference',
    priority: 0,
    renderer: () => selectCellRenderer,
  })
  registry.register({ id: 'status', priority: 0, renderer: () => selectCellRenderer })

  // --- 6. Email ---
  registry.register({ id: 'email', priority: 0, renderer: () => emailCellRenderer })

  // --- 7. URL ---
  registry.register({ id: 'url', priority: 0, renderer: () => urlCellRenderer })

  // --- 8. Phone ---
  registry.register({ id: 'phone', priority: 0, renderer: () => phoneCellRenderer })

  // --- 9. Color ---
  registry.register({ id: 'color', priority: 0, renderer: () => colorCellRenderer })

  // --- 10. Currency (dedicated type, also registered as number/currency alias above) ---
  registry.register({ id: 'currency', priority: 0, renderer: () => currencyCellRenderer })

  // --- 11. File ---
  registry.register({ id: 'file', priority: 0, renderer: () => fileCellRenderer })
  registry.register({ id: 'file_upload', priority: 0, renderer: () => fileCellRenderer })

  // --- 12. Image ---
  registry.register({ id: 'image', priority: 0, renderer: () => imageCellRenderer })

  // --- 13. Rating ---
  registry.register({ id: 'rating', priority: 0, renderer: () => ratingCellRenderer })

  // --- 14. Slider ---
  registry.register({ id: 'slider', priority: 0, renderer: () => sliderCellRenderer })

  // --- 15. Markdown ---
  registry.register({ id: 'markdown', priority: 0, renderer: () => markdownCellRenderer })
  registry.register({ id: 'rich-text', priority: 0, renderer: () => markdownCellRenderer })
  registry.register({ id: 'richtext', priority: 0, renderer: () => markdownCellRenderer })
  registry.register({ id: 'html', priority: 0, renderer: () => markdownCellRenderer })
  registry.register({ id: 'textarea', priority: 0, renderer: () => markdownCellRenderer })
  registry.register({ id: 'longtext', priority: 0, renderer: () => markdownCellRenderer })

  // --- 16. Entity Name ---
  // Priority 50 so it wins over the default text renderer (priority 0) for name columns.
  // canHandle matches by column id ('name') or explicit isPrimaryField flag.
  registry.register({
    id: 'entity-name',
    priority: 50,
    canHandle: (column) => column.id === 'name' || (column as any).isPrimaryField === true,
    renderer: () => entityNameCellRenderer,
  })

  // --- 17. Row Expand ---
  registry.register({ id: 'row-expand', priority: 0, renderer: () => rowExpandCellRenderer })

  // --- 18. Entity Reference ---
  registry.register({
    id: 'entity_reference',
    priority: 0,
    renderer: () => entityReferenceCellRenderer,
  })

  // --- 19. User Reference ---
  registry.register({
    id: 'user_reference',
    priority: 0,
    renderer: () => userReferenceCellRenderer,
  })

  // --- 20. Computed Expression ---
  registry.register({
    id: 'computed_expression',
    priority: 0,
    renderer: () => computedExpressionCellRenderer,
  })

  // --- 21. Computed Formula ---
  registry.register({
    id: 'computed_formula',
    priority: 0,
    renderer: () => computedFormulaCellRenderer,
  })

  // --- 22. Computed Decision Table ---
  registry.register({
    id: 'computed_decision_table',
    priority: 0,
    renderer: () => computedDecisionTableCellRenderer,
  })

  // --- 23. Rollup Count ---
  registry.register({
    id: 'rollup_count',
    priority: 0,
    renderer: () => rollupCountCellRenderer,
  })

  // --- 24. Rollup Sum ---
  registry.register({
    id: 'rollup_sum',
    priority: 0,
    renderer: () => rollupSumCellRenderer,
  })

  // --- 25. Rollup Average ---
  registry.register({
    id: 'rollup_average',
    priority: 0,
    renderer: () => rollupAverageCellRenderer,
  })

  // --- 26. Rollup Concat ---
  registry.register({
    id: 'rollup_concat',
    priority: 0,
    renderer: () => rollupConcatCellRenderer,
  })

  // --- 27. Badge List ---
  registry.register({ id: 'badge-list', priority: 0, renderer: () => badgeListCellRenderer })

  logger.debug('Default slots registered', {
    slotCount: registry.getRegisteredIds().length,
  })
}
