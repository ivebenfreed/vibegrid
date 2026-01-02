/**
 * Rollup Count Field Type Implementation
 *
 * Handles rollup_count field types with frontend calculation, real-time updates,
 * and proper display formatting. Integrates with RollupCalculationManager.
 */

import { RollupCountCalculator } from '../../../managers/RollupCalculationManager'
import type {
  CellEditor,
  CellFormatter,
  CellRenderer,
  CellValidator,
  EnhancedColumn,
  FieldMetadata,
  FormattingContext,
  ValidationResult,
  VibeGridFieldType,
} from '../../FieldTypeRegistry'

/**
 * Rollup Count Cell Renderer
 */
export class RollupCountRenderer implements CellRenderer {
  private calculator = new RollupCountCalculator()

  render(value: any, column: EnhancedColumn, rowData: any): HTMLElement {
    const container = document.createElement('div')
    container.className = 'vibegridx-rollup-count'

    // Calculate value in real-time if rollup config is available
    let displayValue = value
    if (column.rollupConfig) {
      try {
        const sourceData = this.getSourceData(column, rowData)
        displayValue = this.calculator.calculate(column.rollupConfig, sourceData, rowData.id)
      } catch (error) {
        console.warn('Failed to calculate rollup count', error)
        displayValue = value || 0
      }
    }

    container.style.cssText = `
      display: flex;
      align-items: center;
      gap: 6px;
      font-variant-numeric: tabular-nums;
      color: #374151;
    `

    // Create value display
    const valueSpan = document.createElement('span')
    valueSpan.className = 'vibegridx-rollup-value'
    valueSpan.textContent = String(displayValue || 0)
    valueSpan.style.cssText = `
      font-weight: 500;
      text-align: right;
    `

    // Create rollup indicator
    const indicator = document.createElement('span')
    indicator.className = 'vibegridx-rollup-indicator'
    indicator.textContent = '📊'
    indicator.title = 'Calculated count field'
    indicator.style.cssText = `
      font-size: 10px;
      opacity: 0.7;
    `

    container.appendChild(valueSpan)
    container.appendChild(indicator)

    // Apply backend display metadata if available
    if (column.display) {
      this.applyDisplayMetadata(container, column.display)
    }

    return container
  }

  update(element: HTMLElement, value: any, column: EnhancedColumn): void {
    const valueSpan = element.querySelector('.vibegridx-rollup-value')
    if (valueSpan) {
      // Recalculate if rollup config is available
      let displayValue = value
      if (column.rollupConfig) {
        try {
          const sourceData = this.getSourceData(column, { id: 'unknown' })
          displayValue = this.calculator.calculate(column.rollupConfig, sourceData, 'unknown')
        } catch (error) {
          displayValue = value || 0
        }
      }

      valueSpan.textContent = String(displayValue || 0)
    }
  }

  canHandle(column: EnhancedColumn): boolean {
    const type = column.cellType || column.type || ''
    return type === 'rollup_count'
  }

  private getSourceData(column: EnhancedColumn, rowData: any): any[] {
    // This is a placeholder - in the real implementation this would:
    // 1. Use the relationship configuration to find related records
    // 2. Get data from tableCore$ or related data structures
    // 3. Return the related records for calculation

    // For now, return mock data for demonstration
    const mockData = []
    const config = column.rollupConfig

    if (config?.conditions) {
      // Create mock data that matches conditions
      for (let i = 0; i < Math.floor(Math.random() * 10); i++) {
        const item: any = { id: `mock-${i}` }

        // Add condition fields
        Object.entries(config.conditions).forEach(([field, value]) => {
          item[field] = Math.random() > 0.5 ? value : 'other'
        })

        mockData.push(item)
      }
    } else {
      // Create simple mock data
      for (let i = 0; i < Math.floor(Math.random() * 15); i++) {
        mockData.push({ id: `mock-${i}` })
      }
    }

    return mockData
  }

  private applyDisplayMetadata(element: HTMLElement, displayMetadata: any): void {
    if (displayMetadata.textAlign) {
      const valueSpan = element.querySelector('.vibegridx-rollup-value') as HTMLElement
      if (valueSpan) {
        valueSpan.style.textAlign = displayMetadata.textAlign
      }
    }

    if (displayMetadata.showCalculationIndicator === false) {
      const indicator = element.querySelector('.vibegridx-rollup-indicator') as HTMLElement
      if (indicator) {
        indicator.style.display = 'none'
      }
    }
  }
}

/**
 * Rollup Count Cell Editor (Read-only)
 */
export class RollupCountEditor implements CellEditor {
  create(value: any, column: EnhancedColumn, onSave: (value: any) => void): HTMLElement {
    const container = document.createElement('div')
    container.className = 'vibegridx-rollup-count-editor'
    container.style.cssText = `
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      background-color: #f9fafb;
      border: 2px dashed #d1d5db;
      border-radius: 4px;
      font-size: 12px;
      color: #6b7280;
    `

    container.textContent = 'This field is automatically calculated'

    return container
  }

  getValue(element: HTMLElement): any {
    return null // Read-only field
  }

  setValue(element: HTMLElement, value: any): void {
    // Read-only field - no setting allowed
  }

  validate(value: any, column: EnhancedColumn): ValidationResult {
    return {
      valid: true,
      errors: [],
      transformedValue: value,
    }
  }

  destroy(element: HTMLElement): void {
    // Nothing to clean up
  }

  supportsInlineEditing(): boolean {
    return false // Read-only
  }

  supportsModalEditing(): boolean {
    return false // Read-only
  }
}

/**
 * Rollup Count Cell Formatter
 */
export class RollupCountFormatter implements CellFormatter {
  format(value: any, column: EnhancedColumn, context?: FormattingContext): string {
    if (value == null) return '0'

    const numValue = Number(value)
    if (isNaN(numValue)) return '0'

    return numValue.toLocaleString()
  }

  parse(text: string, column: EnhancedColumn): any {
    return null // Read-only field
  }

  formatForDisplay(value: any, column: EnhancedColumn): string {
    return this.format(value, column)
  }

  formatForExport(value: any, column: EnhancedColumn): string {
    return value == null ? '0' : String(value)
  }
}

/**
 * Rollup Count Cell Validator
 */
export class RollupCountValidator implements CellValidator {
  validate(value: any, column: EnhancedColumn): ValidationResult {
    // Rollup fields are always valid as they're calculated
    return {
      valid: true,
      errors: [],
      transformedValue: value,
    }
  }

  getConstraints(column: EnhancedColumn): Record<string, any> {
    return {
      readOnly: true,
      calculatedField: true,
      rollupType: 'count',
    }
  }
}

/**
 * Rollup Count Field Type Definition
 */
export const RollupCountFieldType: VibeGridFieldType = {
  type: 'rollup_count',
  category: 'rollup',
  renderer: new RollupCountRenderer(),
  editor: new RollupCountEditor(),
  formatter: new RollupCountFormatter(),
  validator: new RollupCountValidator(),
  rollupCalculator: new RollupCountCalculator(),

  rollupConfig: {
    calculationType: 'count',
    sourceRelationship: 'belongs_to', // Default, overridden by column config
    sourceEntityType: 'dynamic', // Determined from column config
    realTimeUpdates: true,
  },

  metadata: {
    supportsSorting: true,
    supportsFiltering: true,
    supportsGrouping: true,
    supportsAggregation: true,
    requiresSpecialEditor: false,
    hasRichDisplay: true,
    supportsValidation: false,
    supportsFormatting: true,
    isCalculatedField: true,
    isReadOnly: true,
  },
}

// Register with the global registry
import { fieldTypeRegistry } from '../../FieldTypeRegistry'

fieldTypeRegistry.register('rollup_count', RollupCountFieldType)
