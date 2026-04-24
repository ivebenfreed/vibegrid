/**
 * Computed field cell renderers: Expression, Formula, Decision Table
 */

import type { Column } from '../../types'
import type { CellRenderer, CellRendererContext } from '../SlotRegistry'
import { applyAffordanceAttrs } from '../applyAffordanceAttrs'
import { getOptionIconDisplay } from '../../utils/icon-mapping'

// ============================================================
// Option-set helpers — scalar computed fields that carry an
// `optionSet` (resolved server-side into `column.options`) render
// as colored badges identical to SelectCellRenderer.
// ============================================================

interface ComputedOption {
  value: string
  label: string
  color?: string
  backgroundColor?: string
  icon?: string
}

function getColumnOptions(column: Column): ComputedOption[] {
  if (column.options && Array.isArray(column.options)) {
    return column.options.map((opt: unknown) =>
      typeof opt === 'string' ? { value: opt, label: opt } : (opt as ComputedOption),
    )
  }
  if (column.validation?.enum && Array.isArray(column.validation.enum)) {
    return column.validation.enum.map((val: unknown) => ({ value: String(val), label: String(val) }))
  }
  if (column.editor?.options && Array.isArray(column.editor.options)) {
    return column.editor.options.map((opt: unknown) =>
      typeof opt === 'string' ? { value: opt, label: opt } : (opt as ComputedOption),
    )
  }
  return []
}

function findOption(value: unknown, options: ComputedOption[]): ComputedOption | null {
  const s = String(value)
  return (
    options.find((opt) => opt.value === s) ??
    options.find((opt) => opt.value.toLowerCase() === s.toLowerCase()) ??
    null
  )
}

function buildOptionBadge(option: ComputedOption): HTMLElement {
  const badge = document.createElement('span')
  badge.className = 'vibegridx-enum-badge'
  badge.textContent = option.label
  badge.style.cssText = `
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 2px 8px;
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
  return badge
}

/**
 * If `column` has options (from an `optionSet`) and `value` maps to one,
 * return a badge element; otherwise return null so the caller falls back
 * to plain-text rendering.
 */
function tryRenderOptionBadge(value: unknown, column: Column): HTMLElement | null {
  if (value == null || value === '') return null
  const options = getColumnOptions(column)
  if (options.length === 0) return null
  const match = findOption(value, options)
  return match ? buildOptionBadge(match) : null
}

/**
 * Plain string rendering for computed scalars without an option-set.
 * Numbers and other primitives pass through via String().
 */
function formatComputedValue(value: unknown): string {
  if (value == null) return ''
  return String(value)
}

// ============================================================
// COMPUTED EXPRESSION
// ============================================================

class ComputedExpressionCellRenderer implements CellRenderer {
  render(value: unknown, column: Column, _context: CellRendererContext): HTMLElement {
    const container = document.createElement('div')
    container.className = 'vibegridx-cell-computed'
    container.style.cssText = 'display: flex; align-items: center; gap: 6px; font-variant-numeric: tabular-nums;'

    const indicator = document.createElement('span')
    indicator.textContent = 'f(x)'
    indicator.title = 'Computed expression'
    indicator.style.cssText = 'font-size: 10px; opacity: 0.7; font-weight: bold;'

    const badge = tryRenderOptionBadge(value, column)
    if (badge) {
      container.appendChild(badge)
    } else {
      const valueSpan = document.createElement('span')
      valueSpan.textContent = formatComputedValue(value)
      valueSpan.style.cssText = 'font-weight: 500; color: #059669;'
      container.appendChild(valueSpan)
    }
    container.appendChild(indicator)

    applyAffordanceAttrs(container, this, false)
    return container
  }

  format(value: unknown, column: Column, _context: CellRendererContext): string {
    const options = getColumnOptions(column)
    if (options.length > 0) {
      const match = findOption(value, options)
      if (match) return match.label
    }
    return formatComputedValue(value)
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
// COMPUTED FORMULA
// ============================================================

class ComputedFormulaCellRenderer implements CellRenderer {
  render(value: unknown, column: Column, _context: CellRendererContext): HTMLElement {
    const container = document.createElement('div')
    container.className = 'vibegridx-cell-computed'
    container.style.cssText = 'display: flex; align-items: center; gap: 6px; font-variant-numeric: tabular-nums;'

    const indicator = document.createElement('span')
    indicator.textContent = '\u03A3f'
    indicator.title = 'Computed formula'
    indicator.style.cssText = 'font-size: 10px; opacity: 0.7; font-weight: bold;'

    const badge = tryRenderOptionBadge(value, column)
    if (badge) {
      container.appendChild(badge)
    } else {
      const valueSpan = document.createElement('span')
      valueSpan.textContent = formatComputedValue(value)
      valueSpan.style.cssText = 'font-weight: 500; color: #059669;'
      container.appendChild(valueSpan)
    }
    container.appendChild(indicator)

    applyAffordanceAttrs(container, this, false)
    return container
  }

  format(value: unknown, column: Column, _context: CellRendererContext): string {
    const options = getColumnOptions(column)
    if (options.length > 0) {
      const match = findOption(value, options)
      if (match) return match.label
    }
    return formatComputedValue(value)
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
// COMPUTED DECISION TABLE
// ============================================================

class ComputedDecisionTableCellRenderer implements CellRenderer {
  render(value: unknown, _column: Column, _context: CellRendererContext): HTMLElement {
    const container = document.createElement('div')
    container.className = 'vibegridx-cell-computed-decision-table'
    container.style.cssText = 'display: flex; align-items: center; gap: 6px; font-variant-numeric: tabular-nums;'

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

export const computedExpressionCellRenderer = new ComputedExpressionCellRenderer()
export const computedFormulaCellRenderer = new ComputedFormulaCellRenderer()
export const computedDecisionTableCellRenderer = new ComputedDecisionTableCellRenderer()
