/**
 * Date Field Type Implementation
 *
 * Handles date, datetime, datetime-local, and time field types with proper validation,
 * formatting, and editing. Integrates with backend Enhanced Field Handler metadata.
 */

import { formatFieldForDisplay } from '@/server/domain/dataforge/fields/display-formatters'
import { getLogger } from '@/shared/lib/logging'
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
import { fieldTypeRegistry } from '../../FieldTypeRegistry'

const fileLog = getLogger(['vibegrid', 'field-types', 'implementations', 'basic', 'DateFieldType'])

/**
 * Date Cell Renderer
 */
export class DateRenderer implements CellRenderer {
  render(value: any, column: EnhancedColumn, rowData: any): HTMLElement {
    const container = document.createElement('div')

    // Handle null/undefined values with consistent empty state
    if (value == null || value === '') {
      if (column.editable === false) {
        container.className = 'vibegridx-cell-empty'
        container.textContent = ''
      } else {
        container.className = 'vibegridx-cell-empty'
        container.innerHTML = '<span style="opacity: 0.6;">Edit ✏️</span>'
      }
      return container
    }

    // Date badges use affordance system for cursor/hover
    container.className = 'vibegridx-date-badge'

    // Use the exact same formatting as original BodyRenderer
    const cellType = column.cellType || column.type || 'date'
    const displayValue = this.formatCellValue(value, cellType, column)
    const isEditable = column.editable !== false

    // Create badge with calendar icon
    const dateType = this.getDateType(cellType)
    container.innerHTML = this.createDateBadge(displayValue, dateType, isEditable)

    // Apply backend display metadata if available
    if (column.display) {
      this.applyDisplayMetadata(container, column.display)
    }

    return container
  }

  private getDateType(cellType: string): 'date' | 'datetime' | 'time' {
    if (['time'].includes(cellType)) return 'time'
    if (['datetime', 'datetime-local', 'timestamp', 'timestamptz'].includes(cellType))
      return 'datetime'
    return 'date'
  }

  private createDateBadge(
    displayValue: string,
    type: 'date' | 'datetime' | 'time',
    isEditable: boolean,
  ): string {
    const affordance = isEditable ? 'edit' : 'none'
    return `
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
  }

  update(element: HTMLElement, value: any, column: EnhancedColumn): void {
    // Clear existing content
    element.className =
      column.editable === false ? 'vibegridx-cell-date' : 'vibegridx-cell-date-editable'

    // Handle empty values
    if (value == null || value === '') {
      if (column.editable === false) {
        element.className += ' vibegridx-cell-empty'
        element.textContent = ''
      } else {
        element.className += ' vibegridx-cell-empty'
        element.innerHTML = '<span style="opacity: 0.6;">Edit ✏️</span>'
      }
    } else {
      element.textContent = this.formatValue(value, column)
      element.style.opacity = '1'
    }
  }

  canHandle(column: EnhancedColumn): boolean {
    const type = column.cellType || column.type || ''
    return ['date', 'datetime', 'datetime-local', 'time', 'timestamp', 'timestamptz'].includes(type)
  }

  private formatCellValue(value: any, type?: string, column?: any): string {
    if (value === null || value === undefined) return ''
    // Use the DataForge formatter if type is provided
    if (type) {
      try {
        const formatted = formatFieldForDisplay(value, type, column)
        if (formatted !== null && formatted !== undefined) {
          return String(formatted)
        }
      } catch (error) {
        // Fall back to simple formatting if DataForge formatter fails
        fileLog.warn('DataForge formatter failed, using fallback', { error, type, value })
      }
    }
    // Fallback to basic date formatting
    return this.formatValue(value, column)
  }

  private formatValue(value: any, column: EnhancedColumn): string {
    if (value == null) return ''

    const type = column.cellType || column.type || 'date'
    let dateObj: Date

    // Parse the value into a Date object
    if (value instanceof Date) {
      dateObj = value
    } else {
      dateObj = new Date(value)
      if (isNaN(dateObj.getTime())) {
        return String(value) // Return original if can't parse
      }
    }

    // Format based on type
    switch (type as string) {
      case 'date':
        return dateObj.toLocaleDateString()

      case 'datetime-local':
      case 'timestamp':
      case 'timestamptz':
        return dateObj.toLocaleString()

      case 'time':
        return dateObj.toLocaleTimeString(undefined, {
          hour: '2-digit',
          minute: '2-digit',
        })

      default:
        return dateObj.toLocaleDateString()
    }
  }

  private applyDisplayMetadata(element: HTMLElement, displayMetadata: any): void {
    if (displayMetadata.textAlign) {
      element.style.textAlign = displayMetadata.textAlign
    }

    if (displayMetadata.fontWeight) {
      element.style.fontWeight = displayMetadata.fontWeight
    }

    if (displayMetadata.dateFormat) {
      // Custom date formatting would be applied here
    }
  }
}

/**
 * Date Cell Editor
 */
export class DateEditor implements CellEditor {
  private currentElement: HTMLElement | null = null
  private onSaveCallback: ((value: any) => void) | null = null

  create(value: any, column: EnhancedColumn, onSave: (value: any) => void): HTMLElement {
    this.onSaveCallback = onSave

    const input = document.createElement('input')
    this.currentElement = input

    // Determine input type based on field type
    const fieldType = column.cellType || column.type || 'date'
    input.type = this.getInputType(fieldType)

    // Set initial value
    const formattedValue = this.formatValueForInput(value, fieldType)
    if (formattedValue) {
      input.value = formattedValue
    }

    // Apply styling
    input.className = 'vibegridx-date-editor'
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

    // Auto-focus
    setTimeout(() => input.focus(), 0)

    return input
  }

  getValue(element: HTMLElement): any {
    if (element instanceof HTMLInputElement) {
      const value = element.value.trim()
      if (value === '') return null

      const fieldType = this.getFieldTypeFromInput(element)
      return this.parseValueFromInput(value, fieldType)
    }
    return null
  }

  setValue(element: HTMLElement, value: any): void {
    if (element instanceof HTMLInputElement) {
      const fieldType = this.getFieldTypeFromInput(element)
      const formattedValue = this.formatValueForInput(value, fieldType)
      element.value = formattedValue || ''
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

    // Parse into Date object
    let dateObj: Date
    if (value instanceof Date) {
      dateObj = value
    } else {
      dateObj = new Date(value)
    }

    // Check if it's a valid date
    if (isNaN(dateObj.getTime())) {
      errors.push(`${column.name} must be a valid date`)
      return { valid: false, errors, transformedValue: value }
    }

    // Date range validation
    if (column.validation?.minDate) {
      const minDate = new Date(column.validation.minDate)
      if (dateObj < minDate) {
        errors.push(`${column.name} must be after ${minDate.toLocaleDateString()}`)
      }
    }

    if (column.validation?.maxDate) {
      const maxDate = new Date(column.validation.maxDate)
      if (dateObj > maxDate) {
        errors.push(`${column.name} must be before ${maxDate.toLocaleDateString()}`)
      }
    }

    // Business rule validation (if available from backend)
    if (column.validation?.businessRules) {
      const businessErrors = this.validateBusinessRules(dateObj, column)
      errors.push(...businessErrors)
    }

    return {
      valid: errors.length === 0,
      errors,
      transformedValue: dateObj,
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

  private getInputType(fieldType: string): string {
    switch (fieldType) {
      case 'datetime-local':
      case 'timestamp':
      case 'timestamptz':
        return 'datetime-local'
      case 'time':
        return 'time'
      case 'date':
      default:
        return 'date'
    }
  }

  private formatValueForInput(value: any, fieldType: string): string | null {
    if (value == null) return null

    let dateObj: Date
    if (value instanceof Date) {
      dateObj = value
    } else {
      dateObj = new Date(value)
      if (isNaN(dateObj.getTime())) return null
    }

    switch (fieldType) {
      case 'date':
        return dateObj.toISOString().split('T')[0] // YYYY-MM-DD

      case 'datetime-local':
      case 'timestamptz': {
        const isoString = dateObj.toISOString()
        return isoString.slice(0, 16) // YYYY-MM-DDTHH:MM
      }

      case 'time':
        return dateObj.toTimeString().slice(0, 5) // HH:MM

      default:
        return dateObj.toISOString().split('T')[0]
    }
  }

  private parseValueFromInput(value: string, fieldType: string): Date | null {
    if (!value) return null

    switch (fieldType) {
      case 'date':
        return new Date(value + 'T00:00:00.000Z')

      case 'datetime-local':
      case 'timestamptz':
        return new Date(value)

      case 'time': {
        const today = new Date()
        const [hours, minutes] = value.split(':')
        today.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0)
        return today
      }

      default:
        return new Date(value)
    }
  }

  private getFieldTypeFromInput(element: HTMLInputElement): string {
    // This would ideally be stored in the element or passed through context
    // For now, infer from input type
    switch (element.type) {
      case 'datetime-local':
        return 'datetime-local'
      case 'time':
        return 'time'
      case 'date':
      default:
        return 'date'
    }
  }

  private applyEditorMetadata(input: HTMLInputElement, editorMetadata: any): void {
    if (editorMetadata.dateFormat) {
      // Browser native date inputs don't support custom formats
      // This would be used for custom date picker implementations
    }

    if (editorMetadata.minDate) {
      const minDate = this.formatValueForInput(
        editorMetadata.minDate,
        this.getFieldTypeFromInput(input),
      )
      if (minDate) input.min = minDate
    }

    if (editorMetadata.maxDate) {
      const maxDate = this.formatValueForInput(
        editorMetadata.maxDate,
        this.getFieldTypeFromInput(input),
      )
      if (maxDate) input.max = maxDate
    }
  }

  private applyValidationMetadata(input: HTMLInputElement, validationMetadata: any): void {
    if (validationMetadata.minDate) {
      const minDate = this.formatValueForInput(
        validationMetadata.minDate,
        this.getFieldTypeFromInput(input),
      )
      if (minDate) input.min = minDate
    }

    if (validationMetadata.maxDate) {
      const maxDate = this.formatValueForInput(
        validationMetadata.maxDate,
        this.getFieldTypeFromInput(input),
      )
      if (maxDate) input.max = maxDate
    }

    if (validationMetadata.required) {
      input.required = true
    }
  }

  private validateBusinessRules(dateObj: Date, column: EnhancedColumn): string[] {
    const errors: string[] = []
    const businessRules = column.validation?.businessRules

    if (businessRules?.mustBeBefore) {
      // This would check against another date field in the same row
      // Implementation would depend on having access to the full row data
    }

    if (businessRules?.mustBeAfter) {
      // Similar to mustBeBefore
    }

    return errors
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
 * Date Cell Formatter
 */
export class DateFormatter implements CellFormatter {
  format(value: any, column: EnhancedColumn, context?: FormattingContext): string {
    if (value == null) return ''

    let dateObj: Date
    if (value instanceof Date) {
      dateObj = value
    } else {
      dateObj = new Date(value)
      if (isNaN(dateObj.getTime())) return String(value)
    }

    const type = column.cellType || column.type || 'date'
    const locale = context?.locale || 'en-US'
    const timezone = context?.timezone

    const options: Intl.DateTimeFormatOptions = {}
    if (timezone) {
      options.timeZone = timezone
    }

    switch (type as string) {
      case 'date':
        return dateObj.toLocaleDateString(locale, options)

      case 'datetime-local':
      case 'timestamp':
        return dateObj.toLocaleString(locale, options)

      case 'time':
        return dateObj.toLocaleTimeString(locale, {
          ...options,
          hour: '2-digit',
          minute: '2-digit',
        })

      default:
        return dateObj.toLocaleDateString(locale, options)
    }
  }

  parse(text: string, column: EnhancedColumn): any {
    if (text.trim() === '') return null

    const dateObj = new Date(text)
    return isNaN(dateObj.getTime()) ? null : dateObj
  }

  formatForDisplay(value: any, column: EnhancedColumn): string {
    return this.format(value, column)
  }

  formatForExport(value: any, column: EnhancedColumn): string {
    if (value == null) return ''

    let dateObj: Date
    if (value instanceof Date) {
      dateObj = value
    } else {
      dateObj = new Date(value)
      if (isNaN(dateObj.getTime())) return String(value)
    }

    const type = column.cellType || column.type || 'date'

    switch (type as string) {
      case 'date':
        return dateObj.toISOString().split('T')[0]
      case 'time':
        return dateObj.toTimeString().slice(0, 8)
      default:
        return dateObj.toISOString()
    }
  }
}

/**
 * Date Cell Validator
 */
export class DateValidator implements CellValidator {
  validate(value: any, column: EnhancedColumn): ValidationResult {
    const editor = new DateEditor()
    return editor.validate(value, column)
  }

  getConstraints(column: EnhancedColumn): Record<string, any> {
    const constraints: Record<string, any> = {}

    if (column.validation?.required) {
      constraints.required = true
    }

    if (column.validation?.minDate) {
      constraints.minDate = column.validation.minDate
    }

    if (column.validation?.maxDate) {
      constraints.maxDate = column.validation.maxDate
    }

    return constraints
  }
}

/**
 * Date Field Type Definition
 */
export const DateFieldType: VibeGridFieldType & { affordance: FieldTypeAffordance } = {
  type: 'date',
  category: 'basic',
  renderer: new DateRenderer(),
  editor: new DateEditor(),
  formatter: new DateFormatter(),
  validator: new DateValidator(),
  metadata: {
    supportsSorting: true,
    supportsFiltering: true,
    supportsGrouping: true,
    supportsAggregation: false,
    requiresSpecialEditor: false,
    hasRichDisplay: false,
    supportsValidation: true,
    supportsFormatting: true,
  },

  // 🎯 Affordance declaration - badge that opens date picker on click
  affordance: {
    group: 'editable-badge', // Badge with scale hover effect, pointer cursor
    whenNotEditable: 'readonly-badge', // Badge without interaction
  },

  getFormatter() {
    const fmt = this.formatter
    return (value: any, rowData?: any, column?: any) => fmt.format(value, column)
  },

  // 🚀 Interaction policy (legacy - being replaced by affordance system)
  interactionPolicy: {
    defaultAction: 'edit', // Date fields are for editing
    editTrigger: 'content-click', // Click content to edit
    blurPolicy: 'commit', // Save on blur
  },
}

// Register immediately
fieldTypeRegistry.register('date', DateFieldType)
fieldTypeRegistry.register('datetime', DateFieldType)
fieldTypeRegistry.register('datetime-local', DateFieldType)
fieldTypeRegistry.register('time', DateFieldType)
fieldTypeRegistry.register('timestamp', DateFieldType)
fieldTypeRegistry.register('timestamptz', DateFieldType)
