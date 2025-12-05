/**
 * Email Field Type Implementation
 *
 * Handles email field types with RFC validation, auto-lowercase transformation,
 * and proper formatting. Integrates with backend Enhanced Field Handler metadata.
 */

import type { FieldTypeAffordance } from '../../../affordances/types'
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
 * Email Cell Renderer
 */
export class EmailRenderer implements CellRenderer {
  render(value: any, column: EnhancedColumn, rowData: any): HTMLElement {
    const container = document.createElement('span')
    const isEditable = column.editable !== false
    container.className = isEditable ? 'vibegridx-cell-email-editable' : 'vibegridx-cell-email'

    // Handle null/undefined values with consistent empty state
    if (value == null || value === '') {
      if (!isEditable) {
        container.className = 'vibegridx-cell-empty'
        container.textContent = ''
      } else {
        container.className = 'vibegridx-cell-empty'
        container.innerHTML = '<span style="opacity: 0.6;">Edit ✏️</span>'
      }
      return container
    }

    // Format value for display
    const displayValue = this.formatValue(value, column)
    container.textContent = displayValue

    // Add affordance for the navigate action (email link)
    container.dataset.affordance = 'navigate'
    container.dataset.affordanceRole = 'link'

    // Apply email-specific styling
    container.style.color = '#2563eb' // Blue for email links
    container.style.textDecoration = 'none'

    // Store email href for coordinator to handle (no stopPropagation)
    container.dataset.emailHref = `mailto:${displayValue}`

    // Apply backend display metadata if available
    if (column.display) {
      this.applyDisplayMetadata(container, column.display)
    }

    return container
  }

  update(element: HTMLElement, value: any, column: EnhancedColumn): void {
    // Clear existing content
    element.className =
      column.editable === false ? 'vibegridx-cell-email' : 'vibegridx-cell-email-editable'

    // Handle empty values with consistent empty state
    if (value == null || value === '') {
      if (column.editable === false) {
        element.className = 'vibegridx-cell-empty'
        element.textContent = ''
      } else {
        element.className = 'vibegridx-cell-empty'
        element.innerHTML = '<span style="opacity: 0.6;">Edit ✏️</span>'
      }
    } else {
      element.textContent = this.formatValue(value, column)
      element.style.opacity = '1'
      element.style.color = '#2563eb'
    }
  }

  canHandle(column: EnhancedColumn): boolean {
    const type = column.cellType || column.type || ''
    return (type as string) === 'email'
  }

  private formatValue(value: any, column: EnhancedColumn): string {
    if (value == null) return ''

    const emailValue = String(value).toLowerCase().trim()

    // Apply length limits from backend metadata if available
    if (column.validation?.maxLength && emailValue.length > column.validation.maxLength) {
      return emailValue.substring(0, column.validation.maxLength) + '...'
    }

    return emailValue
  }

  private applyDisplayMetadata(element: HTMLElement, displayMetadata: any): void {
    if (displayMetadata.textAlign) {
      element.style.textAlign = displayMetadata.textAlign
    }

    if (displayMetadata.showLinkIcon) {
      const icon = document.createElement('span')
      icon.textContent = '📧'
      icon.style.marginLeft = '4px'
      element.appendChild(icon)
    }
  }
}

/**
 * Email Cell Editor
 */
export class EmailEditor implements CellEditor {
  private currentElement: HTMLElement | null = null
  private onSaveCallback: ((value: any) => void) | null = null

  create(value: any, column: EnhancedColumn, onSave: (value: any) => void): HTMLElement {
    this.onSaveCallback = onSave

    const input = document.createElement('input')
    this.currentElement = input

    // Set input type and attributes
    input.type = 'email'

    // Set initial value
    const emailValue = value == null ? '' : String(value)
    input.value = emailValue

    // Apply styling
    input.className = 'vibegridx-email-editor'
    input.style.cssText = `
      width: 100%;
      height: 100%;
      border: none;
      outline: none;
      background: transparent;
      font-family: inherit;
      font-size: inherit;
      padding: 0;
      margin: 0;
    `

    // Apply backend editor metadata if available
    if (column.editor) {
      this.applyEditorMetadata(input, column.editor)
    }

    // Apply validation metadata if available
    if (column.validation) {
      this.applyValidationMetadata(input, column.validation)
    }

    // Event handlers
    input.addEventListener('blur', () => this.handleSave())
    input.addEventListener('keydown', (e) => this.handleKeyDown(e))

    // Auto-focus and select all
    setTimeout(() => {
      input.focus()
      input.select()
    }, 0)

    return input
  }

  getValue(element: HTMLElement): any {
    if (element instanceof HTMLInputElement) {
      const value = element.value.trim().toLowerCase()
      return value === '' ? null : value
    }
    return null
  }

  setValue(element: HTMLElement, value: any): void {
    if (element instanceof HTMLInputElement) {
      element.value = value == null ? '' : String(value).toLowerCase()
    }
  }

  validate(value: any, column: EnhancedColumn): ValidationResult {
    const errors: string[] = []

    // Handle null/empty values
    if (value == null || value === '') {
      if (column.validation?.required) {
        errors.push(column.validation.messages?.required || `${column.name} is required`)
      }
      return { valid: errors.length === 0, errors, transformedValue: null }
    }

    const emailValue = String(value).toLowerCase().trim()

    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(emailValue)) {
      errors.push(
        column.validation?.messages?.pattern || `${column.name} must be a valid email address`,
      )
    }

    // Length validation
    if (column.validation?.maxLength && emailValue.length > column.validation.maxLength) {
      errors.push(`${column.name} must be no more than ${column.validation.maxLength} characters`)
    }

    // Domain validation (if specified in backend)
    if (column.validation?.allowedDomains && Array.isArray(column.validation.allowedDomains)) {
      const domain = emailValue.split('@')[1]
      if (!column.validation.allowedDomains.includes(domain)) {
        errors.push(
          `${column.name} must use an allowed domain: ${column.validation.allowedDomains.join(', ')}`,
        )
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      transformedValue: emailValue, // Auto-lowercase transformation
    }
  }

  destroy(element: HTMLElement): void {
    this.currentElement = null
    this.onSaveCallback = null
  }

  supportsInlineEditing(): boolean {
    return true
  }

  supportsModalEditing(): boolean {
    return false
  }

  private applyEditorMetadata(input: HTMLInputElement, editorMetadata: any): void {
    if (editorMetadata.placeholder) {
      input.placeholder = editorMetadata.placeholder
    }

    if (editorMetadata.autoComplete !== false) {
      input.autocomplete = 'email'
    }
  }

  private applyValidationMetadata(input: HTMLInputElement, validationMetadata: any): void {
    if (validationMetadata.maxLength) {
      input.maxLength = validationMetadata.maxLength
    }

    if (validationMetadata.pattern) {
      input.pattern = validationMetadata.pattern
    }

    if (validationMetadata.required) {
      input.required = true
    }
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
        this.currentElement.blur()
      }
    }
  }
}

/**
 * Email Cell Formatter
 */
export class EmailFormatter implements CellFormatter {
  format(value: any, column: EnhancedColumn, context?: FormattingContext): string {
    if (value == null) return ''

    // Auto-lowercase email addresses
    return String(value).toLowerCase().trim()
  }

  parse(text: string, column: EnhancedColumn): any {
    if (text.trim() === '') return null

    // Auto-lowercase and trim
    return text.toLowerCase().trim()
  }

  formatForDisplay(value: any, column: EnhancedColumn): string {
    return this.format(value, column)
  }

  formatForExport(value: any, column: EnhancedColumn): string {
    return value == null ? '' : String(value)
  }
}

/**
 * Email Cell Validator
 */
export class EmailValidator implements CellValidator {
  validate(value: any, column: EnhancedColumn): ValidationResult {
    const editor = new EmailEditor()
    return editor.validate(value, column)
  }

  getConstraints(column: EnhancedColumn): Record<string, any> {
    const constraints: Record<string, any> = {}

    if (column.validation?.required) {
      constraints.required = true
    }

    if (column.validation?.maxLength) {
      constraints.maxLength = column.validation.maxLength
    }

    constraints.pattern = '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$'
    constraints.format = 'email'

    return constraints
  }
}

/**
 * Email Field Type Definition
 */
export const EmailFieldType: VibeGridFieldType = {
  type: 'email',
  category: 'basic',
  renderer: new EmailRenderer(),
  editor: new EmailEditor(),
  formatter: new EmailFormatter(),
  validator: new EmailValidator(),
  metadata: {
    supportsSorting: true,
    supportsFiltering: true,
    supportsGrouping: true,
    supportsAggregation: false,
    requiresSpecialEditor: false,
    hasRichDisplay: true,
    supportsValidation: true,
    supportsFormatting: true,
  },
  getFormatter() {
    const fmt = this.formatter
    return (value: any, rowData?: any, column?: any) => fmt.format(value, column)
  },

  // 🚀 Interaction policy
  interactionPolicy: {
    defaultAction: 'navigate', // Email fields navigate to mailto: URL
    editTrigger: 'icon', // Click icon to edit (e.g., pencil icon)
    blurPolicy: 'commit', // Save on blur
  },

  // 🎯 Affordance Group System
  affordance: {
    group: 'link-only', // Navigate to mailto: URL
    whenNotEditable: 'link-only', // Still navigable when not editable
  } as FieldTypeAffordance,
}

// Register with the global registry
import { fieldTypeRegistry } from '../../FieldTypeRegistry'

fieldTypeRegistry.register('email', EmailFieldType)
