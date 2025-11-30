/**
 * Currency Field Type Implementation
 *
 * Handles currency field types with amount/currency code validation and locale formatting.
 * Integrates with backend Enhanced Field Handler metadata.
 */

import type {
  CellEditor,
  CellFormatter,
  CellRenderer,
  CellValidator,
  EnhancedColumn,
  FormattingContext,
  ValidationResult,
  VibeGridFieldType,
} from '../../FieldTypeRegistry'

interface CurrencyValue {
  amount: number
  currency: string
}

/**
 * Currency Cell Renderer
 */
export class CurrencyRenderer implements CellRenderer {
  render(value: any, column: EnhancedColumn, _rowData: any): HTMLElement {
    const container = document.createElement('span')
    container.className =
      column.editable === false ? 'vibegridx-cell-currency' : 'vibegridx-cell-currency-editable'

    // Handle null/undefined values with consistent empty state
    if (value == null || value === '') {
      if (column.editable === false) {
        container.className = 'vibegridx-cell-empty'
        container.textContent = ''
      } else {
        container.className = 'vibegridx-cell-empty vibegridx-text-editable'
        container.innerHTML = '<span style="opacity: 0.6;">Edit ✏️</span>'
      }
      return container
    }

    const displayValue = this.formatValue(value, column)
    container.textContent = displayValue
    container.style.textAlign = 'right'
    container.style.fontVariantNumeric = 'tabular-nums'

    return container
  }

  update(element: HTMLElement, value: any, column: EnhancedColumn): void {
    element.className =
      column.editable === false ? 'vibegridx-cell-currency' : 'vibegridx-cell-currency-editable'

    // Handle empty values with consistent empty state
    if (value == null || value === '') {
      if (column.editable === false) {
        element.className = 'vibegridx-cell-empty'
        element.textContent = ''
      } else {
        element.className = 'vibegridx-cell-empty vibegridx-text-editable'
        element.innerHTML = '<span style="opacity: 0.6;">Edit ✏️</span>'
      }
    } else {
      element.textContent = this.formatValue(value, column)
      element.style.opacity = '1'
    }
  }

  canHandle(column: EnhancedColumn): boolean {
    const type = column.cellType || column.type || ''
    return (type as string) === 'currency'
  }

  private formatValue(value: any, _column: EnhancedColumn): string {
    if (value == null) return ''

    const currencyData = this.parseCurrencyValue(value)
    const locale = 'en-US'

    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currencyData.currency,
    }).format(currencyData.amount)
  }

  private parseCurrencyValue(value: any): CurrencyValue {
    if (typeof value === 'object' && value !== null) {
      return {
        amount: Number(value.amount) || 0,
        currency: value.currency || 'USD',
      }
    }

    return {
      amount: Number(value) || 0,
      currency: 'USD',
    }
  }
}

/**
 * Currency Cell Editor
 */
export class CurrencyEditor implements CellEditor {
  private currentElement: HTMLElement | null = null
  private onSaveCallback: ((value: any) => void) | null = null

  create(value: any, _column: EnhancedColumn, onSave: (value: any) => void): HTMLElement {
    this.onSaveCallback = onSave

    const container = document.createElement('div')
    container.className = 'vibegridx-currency-editor'
    container.style.cssText = `
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      gap: 4px;
    `

    const currencyData = this.parseCurrencyValue(value)

    // Amount input
    const amountInput = document.createElement('input')
    amountInput.type = 'number'
    amountInput.step = '0.01'
    amountInput.className = 'vibegridx-currency-amount'
    amountInput.value = String(currencyData.amount)
    amountInput.style.cssText = `
      flex: 1;
      height: 100%;
      border: none;
      outline: none;
      background: transparent;
      font-family: inherit;
      font-size: inherit;
      padding: 0;
      margin: 0;
      text-align: right;
    `

    // Currency select
    const currencySelect = document.createElement('select')
    currencySelect.className = 'vibegridx-currency-code'
    currencySelect.style.cssText = `
      border: none;
      outline: none;
      background: transparent;
      font-family: inherit;
      font-size: inherit;
      padding: 0;
      margin: 0;
      cursor: pointer;
    `

    this.addCurrencyOptions(currencySelect, currencyData.currency)

    this.currentElement = container
    container.appendChild(amountInput)
    container.appendChild(currencySelect)

    // Event handlers
    amountInput.addEventListener('blur', () => this.handleSave())
    currencySelect.addEventListener('blur', () => this.handleSave())
    amountInput.addEventListener('keydown', (e) => this.handleKeyDown(e))

    setTimeout(() => amountInput.focus(), 0)

    return container
  }

  getValue(element: HTMLElement): any {
    const amountInput = element.querySelector(
      '.vibegridx-currency-amount',
    ) as HTMLInputElement | null
    const currencySelect = element.querySelector(
      '.vibegridx-currency-code',
    ) as unknown as HTMLSelectElement | null

    if (amountInput && currencySelect) {
      const amount = parseFloat(amountInput.value)
      const currency = currencySelect.value

      if (Number.isNaN(amount)) return null

      return {
        amount,
        currency,
      }
    }
    return null
  }

  setValue(element: HTMLElement, value: any): void {
    const amountInput = element.querySelector('.vibegridx-currency-amount')
    const currencySelect = element.querySelector('.vibegridx-currency-code')
    const currencyData = this.parseCurrencyValue(value)

    if (amountInput instanceof HTMLInputElement) amountInput.value = String(currencyData.amount)
    if (currencySelect instanceof HTMLSelectElement) currencySelect.value = currencyData.currency
  }

  validate(value: any, column: EnhancedColumn): ValidationResult {
    const errors: string[] = []

    if (value == null) {
      if (column.validation?.required) {
        errors.push(column.validation.messages?.required || `${column.name} is required`)
      }
      return { valid: errors.length === 0, errors, transformedValue: null }
    }

    const currencyData = this.parseCurrencyValue(value)

    if (Number.isNaN(currencyData.amount)) {
      errors.push(`${column.name} amount must be a valid number`)
    }

    if (currencyData.amount < 0) {
      errors.push(`${column.name} amount cannot be negative`)
    }

    return {
      valid: errors.length === 0,
      errors,
      transformedValue: currencyData,
    }
  }

  destroy(_element: HTMLElement): void {
    this.currentElement = null
    this.onSaveCallback = null
  }

  supportsInlineEditing(): boolean {
    return true
  }

  supportsModalEditing(): boolean {
    return true
  }

  private parseCurrencyValue(value: any): CurrencyValue {
    if (typeof value === 'object' && value !== null) {
      return {
        amount: Number(value.amount) || 0,
        currency: value.currency || 'USD',
      }
    }

    return {
      amount: Number(value) || 0,
      currency: 'USD',
    }
  }

  private addCurrencyOptions(select: HTMLSelectElement, currentCurrency: string): void {
    const currencies = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD']

    currencies.forEach((currency) => {
      const option = document.createElement('option')
      option.value = currency
      option.textContent = currency
      option.selected = currency === currentCurrency
      select.appendChild(option)
    })
  }

  private handleSave(): void {
    if (this.currentElement && this.onSaveCallback) {
      const value = this.getValue(this.currentElement)
      this.onSaveCallback(value)
    }
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault()
      this.handleSave()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      if (this.currentElement) {
        const amountInput = this.currentElement.querySelector(
          '.vibegridx-currency-amount',
        ) as HTMLInputElement
        if (amountInput) amountInput.blur()
      }
    }
  }
}

/**
 * Currency Cell Formatter
 */
export class CurrencyFormatter implements CellFormatter {
  format(value: any, _column: EnhancedColumn, context?: FormattingContext): string {
    if (value == null) return ''

    const currencyData = this.parseCurrencyValue(value)
    const locale = context?.locale || 'en-US'

    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currencyData.currency,
    }).format(currencyData.amount)
  }

  parse(text: string, _column: EnhancedColumn): any {
    if (text.trim() === '') return null

    // Parse currency string like "$123.45" or "123.45 USD"
    const match = text.match(/([\d.,]+)|([A-Z]{3})/g)
    if (match) {
      const amount = parseFloat(match[0].replace(/,/g, ''))
      const currency = match[1] || 'USD'
      return { amount, currency }
    }

    return null
  }

  formatForDisplay(value: any, column: EnhancedColumn): string {
    return this.format(value, column)
  }

  formatForExport(value: any, _column: EnhancedColumn): string {
    if (value == null) return ''

    const currencyData = this.parseCurrencyValue(value)
    return `${currencyData.amount} ${currencyData.currency}`
  }

  private parseCurrencyValue(value: any): CurrencyValue {
    if (typeof value === 'object' && value !== null) {
      return {
        amount: Number(value.amount) || 0,
        currency: value.currency || 'USD',
      }
    }

    return {
      amount: Number(value) || 0,
      currency: 'USD',
    }
  }
}

/**
 * Currency Field Type Definition
 */
export const CurrencyFieldType: VibeGridFieldType = {
  type: 'currency',
  category: 'basic',
  renderer: new CurrencyRenderer(),
  editor: new CurrencyEditor(),
  formatter: new CurrencyFormatter(),
  validator: new (class implements CellValidator {
    validate(value: any, column: EnhancedColumn): ValidationResult {
      const editor = new CurrencyEditor()
      return editor.validate(value, column)
    }
    getConstraints(column: EnhancedColumn): Record<string, any> {
      return {
        required: column.validation?.required || false,
        format: 'currency',
        supportedCurrencies: ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD'],
      }
    }
  })(),
  metadata: {
    supportsSorting: true,
    supportsFiltering: true,
    supportsGrouping: true,
    supportsAggregation: true,
    requiresSpecialEditor: true,
    hasRichDisplay: true,
    supportsValidation: true,
    supportsFormatting: true,
  },
  getFormatter() {
    const fmt = this.formatter
    return (value: any, _rowData?: any, column?: any) => fmt.format(value, column)
  },
}

// Register with the global registry
import { fieldTypeRegistry } from '../../FieldTypeRegistry'

fieldTypeRegistry.register('currency', CurrencyFieldType)
