/**
 * Rollup Sum Field Type Implementation
 *
 * Handles rollup_sum field types with frontend calculation of numeric sums.
 */

import type { FieldTypeAffordance } from '../../../affordances/types'
import { RollupSumCalculator } from '../../../managers/RollupCalculationManager'
import type {
  CellEditor,
  CellFormatter,
  CellRenderer,
  EnhancedColumn,
  VibeGridFieldType,
} from '../../FieldTypeRegistry'

export class RollupSumRenderer implements CellRenderer {
  private calculator = new RollupSumCalculator()

  render(value: any, column: EnhancedColumn, rowData: any): HTMLElement {
    const container = document.createElement('div')

    // Rollup fields are always read-only
    container.dataset.affordance = 'none'
    container.dataset.affordanceRole = 'content'

    container.className = 'vibegridx-rollup-sum'

    let displayValue = value
    if (column.rollupConfig) {
      const sourceData = this.getMockSourceData()
      displayValue = this.calculator.calculate(column.rollupConfig, sourceData, rowData.id)
    }

    container.style.cssText = `
      display: flex;
      align-items: center;
      gap: 6px;
      font-variant-numeric: tabular-nums;
      color: #374151;
    `

    const valueSpan = document.createElement('span')
    valueSpan.className = 'vibegridx-rollup-value'

    // Format as currency if source field suggests it
    const formatted = this.formatSumValue(displayValue, column)
    valueSpan.textContent = formatted
    valueSpan.style.cssText = `font-weight: 500; text-align: right;`

    const indicator = document.createElement('span')
    indicator.textContent = '∑'
    indicator.title = 'Calculated sum field'
    indicator.style.cssText = `font-size: 12px; opacity: 0.7; font-weight: bold;`

    container.appendChild(valueSpan)
    container.appendChild(indicator)
    return container
  }

  update(element: HTMLElement, value: any, column: EnhancedColumn): void {
    const valueSpan = element.querySelector('.vibegridx-rollup-value')
    if (valueSpan && column.rollupConfig) {
      const sourceData = this.getMockSourceData()
      const calculatedValue = this.calculator.calculate(column.rollupConfig, sourceData, 'unknown')
      valueSpan.textContent = this.formatSumValue(calculatedValue, column)
    }
  }

  canHandle(column: EnhancedColumn): boolean {
    return ((column.cellType || column.type) as string) === 'rollup_sum'
  }

  private formatSumValue(value: number, column: EnhancedColumn): string {
    if (value == null || isNaN(value)) return '0'

    const precision = column.rollupConfig?.precision || 2
    return value.toLocaleString(undefined, {
      minimumFractionDigits: precision,
      maximumFractionDigits: precision,
    })
  }

  private getMockSourceData(): any[] {
    return Array.from({ length: Math.floor(Math.random() * 10) }, (_, i) => ({
      id: `mock-${i}`,
      amount: Math.random() * 1000,
      budget_amount: Math.random() * 500,
    }))
  }
}

export const RollupSumFieldType: VibeGridFieldType = {
  type: 'rollup_sum',
  category: 'rollup',
  renderer: new RollupSumRenderer(),
  editor: new (class implements CellEditor {
    create(): HTMLElement {
      const div = document.createElement('div')
      div.textContent = 'Sum field (read-only)'
      div.style.cssText = 'padding: 8px; background: #f9fafb; border-radius: 4px; font-size: 12px;'
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
  })(),
  formatter: new (class implements CellFormatter {
    format(value: any): string {
      return String(value || 0)
    }
    parse(): any {
      return null
    }
  })(),
  rollupCalculator: new RollupSumCalculator(),
  metadata: {
    supportsSorting: true,
    supportsFiltering: true,
    supportsGrouping: true,
    supportsAggregation: true,
    requiresSpecialEditor: false,
    hasRichDisplay: true,
    isCalculatedField: true,
    isReadOnly: true,
  },
  getFormatter() {
    const fmt = this.formatter
    return (value: any, rowData?: any, column?: any) => fmt.format(value, column)
  },

  // 🎯 Affordance Group System
  affordance: {
    group: 'readonly-display',
    whenNotEditable: 'readonly-display',
  } as FieldTypeAffordance,
}

import { fieldTypeRegistry } from '../../FieldTypeRegistry'

fieldTypeRegistry.register('rollup_sum', RollupSumFieldType)
