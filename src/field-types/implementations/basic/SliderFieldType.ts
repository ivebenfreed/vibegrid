/**
 * Slider Field Type - Range slider with min/max/step controls
 */

import type { FieldTypeAffordance } from '../../../affordances/types'
import type {
  CellEditor,
  CellFormatter,
  CellRenderer,
  EnhancedColumn,
  ValidationResult,
  VibeGridFieldType,
} from '../../FieldTypeRegistry'

export class SliderRenderer implements CellRenderer {
  render(value: any, column: EnhancedColumn): HTMLElement {
    const container = document.createElement('div')
    const isEditable = column.editable !== false

    // Add affordance data attributes
    container.dataset.affordance = isEditable ? 'toggle' : 'none'
    container.dataset.affordanceRole = 'control'

    container.className = 'vibegridx-cell-slider'
    container.style.cssText = 'display: flex; align-items: center; gap: 8px; width: 100%;'

    const numValue = Number(value) || 0
    const min = column.validation?.min || 0
    const max = column.validation?.max || 100
    const _step = column.editor?.step || 1

    // Progress bar representation
    const progressBar = document.createElement('div')
    progressBar.style.cssText = `
      flex: 1; height: 6px; background: #e5e7eb; border-radius: 3px; position: relative;
    `

    const progress = document.createElement('div')
    const percentage = ((numValue - min) / (max - min)) * 100
    progress.style.cssText = `
      height: 100%; background: #3b82f6; border-radius: 3px; width: ${Math.max(0, Math.min(100, percentage))}%;
    `
    progressBar.appendChild(progress)

    // Value display
    const valueSpan = document.createElement('span')
    valueSpan.textContent = String(numValue)
    valueSpan.style.cssText =
      'font-size: 12px; font-weight: 500; min-width: 30px; text-align: right;'

    container.appendChild(progressBar)
    container.appendChild(valueSpan)
    return container
  }

  update(element: HTMLElement, value: any): void {
    const valueSpan = element.querySelector('span')
    const progress = element.querySelector('div > div')

    if (valueSpan) valueSpan.textContent = String(Number(value) || 0)
    if (progress instanceof HTMLElement) {
      const numValue = Number(value) || 0
      const percentage = (numValue / 100) * 100 // Assuming 0-100 range
      progress.style.width = `${Math.max(0, Math.min(100, percentage))}%`
    }
  }

  canHandle(column: EnhancedColumn): boolean {
    return ((column.cellType || column.type) as string) === 'slider'
  }
}

export class SliderEditor implements CellEditor {
  create(value: any, column: EnhancedColumn, onSave: (value: any) => void): HTMLElement {
    this.onSaveCallback = onSave

    const container = document.createElement('div')
    container.className = 'vibegridx-slider-editor'
    container.setAttribute('data-testid', 'slider-editor')
    container.setAttribute('data-field-type', 'slider')
    container.setAttribute('data-column-id', column.id)
    container.setAttribute('data-editable', 'true')
    container.style.cssText =
      'width: 100%; height: 100%; display: flex; align-items: center; gap: 8px;'

    const slider = document.createElement('input')
    slider.type = 'range'
    slider.min = String(column.validation?.min || 0)
    slider.max = String(column.validation?.max || 100)
    slider.step = String(column.editor?.step || 1)
    slider.value = String(Number(value) || 0)
    slider.style.cssText = 'flex: 1; height: 20px;'

    const valueSpan = document.createElement('span')
    valueSpan.textContent = slider.value
    valueSpan.style.cssText = 'font-size: 12px; min-width: 30px; text-align: right;'

    slider.addEventListener('input', () => {
      valueSpan.textContent = slider.value
    })

    slider.addEventListener('change', () => {
      onSave(Number(slider.value))
    })

    this.currentElement = container
    container.appendChild(slider)
    container.appendChild(valueSpan)

    setTimeout(() => slider.focus(), 0)
    return container
  }

  getValue(element: HTMLElement): any {
    const slider = element.querySelector('input[type="range"]') as HTMLInputElement
    return slider ? Number(slider.value) : null
  }

  setValue(element: HTMLElement, value: any): void {
    const slider = element.querySelector('input[type="range"]') as HTMLInputElement
    const valueSpan = element.querySelector('span')
    const numValue = Number(value) || 0

    if (slider) slider.value = String(numValue)
    if (valueSpan) valueSpan.textContent = String(numValue)
  }

  validate(value: any, column: EnhancedColumn): ValidationResult {
    const numValue = Number(value)
    const min = column.validation?.min || 0
    const max = column.validation?.max || 100
    const errors: string[] = []

    if (Number.isNaN(numValue)) {
      errors.push(`${column.name} must be a number`)
    } else if (numValue < min || numValue > max) {
      errors.push(`${column.name} must be between ${min} and ${max}`)
    }

    return { valid: errors.length === 0, errors, transformedValue: numValue }
  }

  destroy(): void {
    this.currentElement = null
    this.onSaveCallback = null
  }

  supportsInlineEditing(): boolean {
    return true
  }
}

export const SliderFieldType: VibeGridFieldType = {
  type: 'slider',
  category: 'basic',
  renderer: new SliderRenderer(),
  editor: new SliderEditor(),
  formatter: new (class implements CellFormatter {
    format(value: any): string {
      return String(Number(value) || 0)
    }
    parse(text: string): any {
      return Number(text) || 0
    }
  })(),
  metadata: {
    supportsSorting: true,
    supportsFiltering: true,
    supportsGrouping: true,
    supportsAggregation: true,
    requiresSpecialEditor: true,
    hasRichDisplay: true,
  },
  getFormatter() {
    const fmt = this.formatter
    return (value: any, _rowData?: any, column?: any) => fmt.format(value, column)
  },

  // 🎯 Affordance Group System
  affordance: {
    group: 'toggle-control',
    whenNotEditable: 'readonly-display',
  } as FieldTypeAffordance,
}

import { fieldTypeRegistry } from '../../FieldTypeRegistry'

fieldTypeRegistry.register('slider', SliderFieldType)
