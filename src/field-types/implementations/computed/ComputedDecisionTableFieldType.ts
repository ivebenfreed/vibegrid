/**
 * Computed Decision Table Field Type Implementation
 *
 * Handles computed_decision_table field types which display pass/fail/pending badges
 * with expandable violations. Values are computed at read time by the server-side
 * ComputedDecisionFieldEvaluator and arrive pre-enriched on entity records.
 *
 * The cell renderer creates DOM elements that display the decision result inline.
 * This field type is read-only (no editor) and supports filtering via the
 * decision_status operator.
 */

import type {
  CellEditor,
  CellFormatter,
  CellRenderer,
  EnhancedColumn,
  VibeGridFieldType,
} from '../../FieldTypeRegistry'

// ============================================================================
// Renderer
// ============================================================================

export class ComputedDecisionTableRenderer implements CellRenderer {
  render(value: any, _column: EnhancedColumn, _rowData: any): HTMLElement {
    const container = document.createElement('div')
    container.className = 'vibegridx-cell-computed-decision-table'
    container.style.cssText = 'display: flex; align-items: center; gap: 4px;'

    this.renderBadge(container, value)
    return container
  }

  update(element: HTMLElement, value: any, _column: EnhancedColumn): void {
    // Clear existing content and re-render
    element.innerHTML = ''
    this.renderBadge(element, value)
  }

  canHandle(column: EnhancedColumn): boolean {
    const type = column.cellType || column.type || ''
    return type === 'computed_decision_table'
  }

  private renderBadge(container: HTMLElement, value: any): void {
    const badge = document.createElement('span')
    badge.style.cssText =
      'display: inline-flex; align-items: center; gap: 4px; border-radius: 4px; border: 1px solid; padding: 1px 8px; font-size: 12px; line-height: 1.4;'

    if (!value || value.passed === null || value.passed === undefined) {
      // Pending state
      badge.textContent = 'pending'
      badge.style.backgroundColor = 'var(--color-muted, #f1f5f9)'
      badge.style.color = 'var(--color-muted-foreground, #64748b)'
      badge.style.borderColor = 'var(--color-border, #e2e8f0)'
      container.appendChild(badge)
      return
    }

    if (value.passed === true) {
      // Pass state
      const scoreText = value.score !== null && value.score !== undefined ? ` (${value.score})` : ''
      badge.textContent = `pass${scoreText}`
      badge.style.backgroundColor = 'var(--color-green-100, #dcfce7)'
      badge.style.color = 'var(--color-green-800, #166534)'
      badge.style.borderColor = 'var(--color-green-200, #bbf7d0)'
      container.appendChild(badge)
      return
    }

    // Fail state
    const scoreText = value.score !== null && value.score !== undefined ? ` (${value.score})` : ''
    const violationCount = Array.isArray(value.violations) ? value.violations.length : 0
    badge.textContent = `fail${scoreText}${violationCount > 0 ? ' \u25BE' : ''}`
    badge.style.backgroundColor = 'var(--color-red-100, #fee2e2)'
    badge.style.color = 'var(--color-red-800, #991b1b)'
    badge.style.borderColor = 'var(--color-red-200, #fecaca)'
    badge.style.cursor = violationCount > 0 ? 'pointer' : 'default'

    if (violationCount > 0) {
      badge.title = `${violationCount} violation${violationCount > 1 ? 's' : ''}`
    }

    container.appendChild(badge)
  }
}

// ============================================================================
// Editor (read-only)
// ============================================================================

export class ComputedDecisionTableEditor implements CellEditor {
  create(): HTMLElement {
    const div = document.createElement('div')
    div.textContent = 'Decision table result (read-only)'
    div.style.cssText =
      'padding: 8px; background: var(--color-muted, #f1f5f9); border: 2px dashed var(--color-border, #e2e8f0); border-radius: 4px; font-size: 12px; color: var(--color-muted-foreground, #64748b);'
    return div
  }
  getValue(): any {
    return null
  }
  setValue(): void {}
  validate(): any {
    return { valid: true, errors: [] }
  }
  destroy(): void {}
  supportsInlineEditing(): boolean {
    return false
  }
}

// ============================================================================
// Formatter
// ============================================================================

class ComputedDecisionTableFormatter implements CellFormatter {
  format(value: any): string {
    if (!value || value.passed === null || value.passed === undefined) {
      return 'pending'
    }
    if (value.passed === true) {
      const scoreText = value.score !== null && value.score !== undefined ? ` (${value.score})` : ''
      return `pass${scoreText}`
    }
    const scoreText = value.score !== null && value.score !== undefined ? ` (${value.score})` : ''
    return `fail${scoreText}`
  }

  parse(): any {
    return null // Read-only field
  }

  formatForExport(value: any): string {
    return this.format(value)
  }
}

// ============================================================================
// Field Type Definition
// ============================================================================

export const ComputedDecisionTableFieldType: VibeGridFieldType = {
  type: 'computed_decision_table',
  category: 'computed',
  renderer: new ComputedDecisionTableRenderer(),
  editor: new ComputedDecisionTableEditor(),
  formatter: new ComputedDecisionTableFormatter(),
  metadata: {
    supportsSorting: true,
    supportsFiltering: true,
    supportsGrouping: false,
    supportsAggregation: false,
    isCalculatedField: true,
    isReadOnly: true,
    hasRichDisplay: true,
  },
  interactionPolicy: {
    defaultAction: 'none',
    editTrigger: 'none',
    blurPolicy: 'cancel',
  },
  getFormatter() {
    return (value: any): string => {
      if (!value || value.passed === null || value.passed === undefined) {
        return 'pending'
      }
      if (value.passed === true) {
        const scoreText =
          value.score !== null && value.score !== undefined ? ` (${value.score})` : ''
        return `pass${scoreText}`
      }
      const scoreText = value.score !== null && value.score !== undefined ? ` (${value.score})` : ''
      return `fail${scoreText}`
    }
  },
}

// ============================================================================
// Registration
// ============================================================================

import { fieldTypeRegistry } from '../../FieldTypeRegistry'

fieldTypeRegistry.register('computed_decision_table', ComputedDecisionTableFieldType)
