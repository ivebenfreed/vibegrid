/**
 * Computed Field Types Implementation
 *
 * Handles computed_expression and computed_formula field types with mathematical expressions.
 */

import type {
  CellEditor,
  CellFormatter,
  CellRenderer,
  EnhancedColumn,
  ValidationResult,
  VibeGridFieldType,
} from '../../FieldTypeRegistry'

export class ComputedRenderer implements CellRenderer {
  render(value: any, column: EnhancedColumn, rowData: any): HTMLElement {
    const container = document.createElement('div')
    container.className = 'vibegridx-cell-computed'
    container.style.cssText =
      'display: flex; align-items: center; gap: 6px; font-variant-numeric: tabular-nums;'

    // Calculate value if expression is available
    let displayValue = value
    if (column.editor?.expression || column.validation?.expression) {
      try {
        displayValue = this.evaluateExpression(
          column.editor?.expression || column.validation?.expression,
          rowData,
        )
      } catch (error) {
        displayValue = 'Error'
      }
    }

    const valueSpan = document.createElement('span')
    valueSpan.textContent = String(displayValue || 0)
    valueSpan.style.cssText = 'font-weight: 500; color: #059669;'

    const indicator = document.createElement('span')
    indicator.textContent = 'f(x)'
    indicator.title = 'Computed field'
    indicator.style.cssText = 'font-size: 10px; opacity: 0.7; font-weight: bold;'

    container.appendChild(valueSpan)
    container.appendChild(indicator)
    return container
  }

  update(element: HTMLElement, value: any, column: EnhancedColumn): void {
    const valueSpan = element.querySelector('span')
    if (valueSpan) {
      let displayValue = value
      if (column.editor?.expression) {
        try {
          displayValue = this.evaluateExpression(column.editor.expression, {})
        } catch {
          displayValue = 'Error'
        }
      }
      valueSpan.textContent = String(displayValue || 0)
    }
  }

  canHandle(column: EnhancedColumn): boolean {
    const type = column.cellType || column.type || ''
    return ['computed_expression', 'computed_formula'].includes(type)
  }

  private evaluateExpression(expression: string, rowData: any): number {
    // Simple expression evaluation for demo
    // In reality, this would use the backend ExpressionEvaluator
    try {
      // Mock calculation
      const mockVars = { a: 10, b: 5, price: 100, quantity: 2 }
      const expr = expression.replace(/\b(\w+)\b/g, (match) => {
        return mockVars[match as keyof typeof mockVars]?.toString() || '0'
      })

      // Basic math evaluation (unsafe - for demo only)
      const result = eval(expr.replace(/[^0-9+\-*/.() ]/g, ''))
      return Number(result) || 0
    } catch {
      return 0
    }
  }
}

export class ComputedEditor implements CellEditor {
  create(): HTMLElement {
    const div = document.createElement('div')
    div.textContent = 'Computed field (read-only)'
    div.style.cssText =
      'padding: 8px; background: #f0f9ff; border: 2px dashed #0ea5e9; border-radius: 4px; font-size: 12px; color: #0c4a6e;'
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

export const ComputedExpressionFieldType: VibeGridFieldType = {
  type: 'computed_expression',
  category: 'computed',
  renderer: new ComputedRenderer(),
  editor: new ComputedEditor(),
  formatter: new (class implements CellFormatter {
    format(value: any): string {
      return String(value || 0)
    }
    parse(): any {
      return null
    }
  })(),
  metadata: {
    supportsSorting: true,
    supportsFiltering: true,
    supportsGrouping: true,
    isCalculatedField: true,
    isReadOnly: true,
    hasRichDisplay: true,
  },
}

export const ComputedFormulaFieldType: VibeGridFieldType = {
  type: 'computed_formula',
  category: 'computed',
  renderer: new ComputedRenderer(),
  editor: new ComputedEditor(),
  formatter: new (class implements CellFormatter {
    format(value: any): string {
      return String(value || 0)
    }
    parse(): any {
      return null
    }
  })(),
  metadata: {
    supportsSorting: true,
    supportsFiltering: true,
    supportsGrouping: true,
    isCalculatedField: true,
    isReadOnly: true,
    hasRichDisplay: true,
  },
}

import { fieldTypeRegistry } from '../../FieldTypeRegistry'

fieldTypeRegistry.register('computed_expression', ComputedExpressionFieldType)
fieldTypeRegistry.register('computed_formula', ComputedFormulaFieldType)
