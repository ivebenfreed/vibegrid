/**
 * Select Field Type Implementation
 *
 * Handles select, single-select, multi-select, and enum field types with proper validation,
 * formatting, and editing. Integrates with backend Enhanced Field Handler metadata.
 */

import type { FieldTypeAffordance } from '../../../affordances/types'
import { getOptionIconDisplay } from '../../../utils/icon-mapping'
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
import { fieldTypeRegistry } from '../../FieldTypeRegistry'

interface SelectOption {
  value: string
  label: string
  color?: string
  backgroundColor?: string
  icon?: string
  group?: string
  disabled?: boolean
}

/**
 * Select Cell Renderer
 */
export class SelectRenderer implements CellRenderer {
  render(value: any, column: EnhancedColumn, _rowData: any): HTMLElement {
    // 🚀 PERFORMANCE: Removed expensive logging from hot path

    const container = document.createElement('span')
    // Don't set classes here - let BodyRenderer handle the base classes
    // Only add styling that's specific to the badge display

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

    const fieldType = column.cellType || column.type || 'select'

    // Handle multi-select values
    if (this.isMultiSelect(fieldType) && Array.isArray(value)) {
      return this.renderMultiSelectValue(container, value, column)
    } else {
      return this.renderSingleSelectValue(container, value, column)
    }
  }

  update(element: HTMLElement, value: any, column: EnhancedColumn): void {
    // Clear existing content
    element.innerHTML = ''
    // Don't override classes - preserve what BodyRenderer set

    // Handle empty values with consistent empty state
    if (value == null || value === '') {
      if (column.editable === false) {
        element.className = 'vibegridx-cell-empty'
        element.textContent = ''
      } else {
        element.className = 'vibegridx-cell-empty'
        element.innerHTML = '<span style="opacity: 0.6;">Edit ✏️</span>'
      }
      return
    }

    const fieldType = column.cellType || column.type || 'select'

    // Re-render based on type
    if (this.isMultiSelect(fieldType) && Array.isArray(value)) {
      this.renderMultiSelectValue(element, value, column)
    } else {
      this.renderSingleSelectValue(element, value, column)
    }
    element.style.opacity = '1'
  }

  canHandle(column: EnhancedColumn): boolean {
    const type = column.cellType || column.type || ''
    return [
      'select',
      'single-select',
      'multi-select',
      'select-multi',
      'enum',
      'custom_option_reference',
      'status',
    ].includes(type)
  }

  private renderSingleSelectValue(
    container: HTMLElement,
    value: any,
    column: EnhancedColumn,
  ): HTMLElement {
    const option = this.findOption(value, column)

    if (option) {
      // Create badge element (content that triggers edit)
      const badge = document.createElement('span')
      const isEditable = column.editable !== false

      // ✅ Affordance data attributes for cursor/hover behavior
      badge.dataset.affordance = isEditable ? 'edit' : 'none'
      badge.dataset.affordanceRole = 'badge'

      // Badge styling - cursor/hover controlled by data-affordance attributes
      badge.className = 'vibegridx-enum-badge'

      // Apply badge styling
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
      // cursor is now controlled by CSS via data-affordance attribute

      if (option.icon) {
        const iconSymbol = getOptionIconDisplay(option.icon)
        if (iconSymbol) {
          const icon = document.createElement('span')
          icon.textContent = iconSymbol
          icon.style.fontSize = '10px'
          badge.insertBefore(icon, badge.firstChild)
        }
      }

      // Append badge to container (padding around badge allows selection-only clicks)
      container.appendChild(badge)
    } else {
      // Unknown value - no badge, just text
      container.textContent = String(value)
      container.style.fontStyle = 'italic'
      container.style.opacity = '0.7'
    }

    return container
  }

  private renderMultiSelectValue(
    container: HTMLElement,
    values: any[],
    column: EnhancedColumn,
  ): HTMLElement {
    container.style.cssText = `
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      align-items: center;
    `

    if (values.length === 0) {
      container.textContent = 'No selection'
      container.style.opacity = '0.6'
      return container
    }

    const isEditable = column.editable !== false
    values.forEach((value) => {
      const option = this.findOption(value, column)
      if (option) {
        const badge = this.createOptionBadge(option, isEditable)
        badge.style.fontSize = '11px' // Smaller for multi-select
        container.appendChild(badge)
      } else {
        const unknownBadge = this.createOptionBadge(
          {
            value: String(value),
            label: String(value),
          },
          isEditable,
        )
        unknownBadge.style.opacity = '0.7'
        unknownBadge.style.fontStyle = 'italic'
        container.appendChild(unknownBadge)
      }
    })

    return container
  }

  private createOptionBadge(option: SelectOption, isEditable = true): HTMLElement {
    const badge = document.createElement('span')
    badge.className = 'vibegridx-select-badge'
    badge.textContent = option.label

    // ✅ Affordance data attributes for cursor/hover behavior
    badge.dataset.affordance = isEditable ? 'edit' : 'none'
    badge.dataset.affordanceRole = 'badge'

    badge.style.cssText = `
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 500;
      white-space: nowrap;
      background-color: ${option.backgroundColor || '#f3f4f6'};
      color: ${option.color || '#374151'};
      border: 1px solid ${option.backgroundColor ? 'transparent' : '#d1d5db'};
    `
    // cursor is now controlled by CSS via data-affordance attribute

    if (option.icon) {
      const iconSymbol = getOptionIconDisplay(option.icon)
      if (iconSymbol) {
        const icon = document.createElement('span')
        icon.textContent = iconSymbol
        icon.style.fontSize = '10px'
        badge.insertBefore(icon, badge.firstChild)
      }
    }

    return badge
  }

  private findOption(value: any, column: EnhancedColumn): SelectOption | null {
    const stringValue = String(value)

    // 🚀 PERFORMANCE: Removed expensive console logging from hot path

    // Use schema data
    const options = this.getOptions(column)
    // Exact match first, then case-insensitive fallback (handles e.g. saved 'a' vs option 'A')
    const found =
      options.find((opt) => opt.value === stringValue) ??
      options.find((opt) => opt.value.toLowerCase() === stringValue.toLowerCase())

    return found || null
  }

  private getOptions(column: EnhancedColumn): SelectOption[] {
    // Priority: column.options > validation.enum > editor.options > default
    if (column.options && Array.isArray(column.options)) {
      return column.options.map((opt) =>
        typeof opt === 'string' ? { value: opt, label: opt } : opt,
      )
    }

    if (column.validation?.enum && Array.isArray(column.validation.enum)) {
      return column.validation.enum.map((val: any) => ({ value: String(val), label: String(val) }))
    }

    if (column.editor?.options && Array.isArray(column.editor.options)) {
      return column.editor.options.map((opt: any) =>
        typeof opt === 'string' ? { value: opt, label: opt } : opt,
      )
    }

    return []
  }

  private isMultiSelect(fieldType: string): boolean {
    return fieldType === 'multi-select' || fieldType === 'select-multi'
  }
}

/**
 * Select Cell Editor
 */
export class SelectEditor implements CellEditor {
  private currentElement: HTMLSelectElement | null = null
  private onSaveCallback: ((value: any) => void) | null = null

  create(value: any, column: EnhancedColumn, onSave: (value: any) => void): HTMLElement {
    this.onSaveCallback = onSave

    const fieldType = column.cellType || column.type || 'select'

    if (this.isMultiSelect(fieldType)) {
      return this.createMultiSelectEditor(value, column)
    } else {
      return this.createSingleSelectEditor(value, column)
    }
  }

  getValue(element: HTMLElement): any {
    if (element instanceof HTMLSelectElement) {
      if (element.multiple) {
        const selectedOptions = Array.from(element.selectedOptions)
        return selectedOptions.map((opt) => opt.value)
      } else {
        return element.value === '' ? null : element.value
      }
    }
    return null
  }

  setValue(element: HTMLElement, value: any): void {
    if (element instanceof HTMLSelectElement) {
      if (element.multiple && Array.isArray(value)) {
        Array.from(element.options).forEach((option) => {
          option.selected = value.includes(option.value)
        })
      } else {
        element.value = value == null ? '' : String(value)
      }
    }
  }

  validate(value: any, column: EnhancedColumn): ValidationResult {
    const errors: string[] = []
    const fieldType = column.cellType || column.type || 'select'

    // Handle null/empty values
    if (value == null || value === '' || (Array.isArray(value) && value.length === 0)) {
      if (column.validation?.required) {
        errors.push(column.validation.messages?.required || `${column.name} is required`)
      }
      return { valid: errors.length === 0, errors, transformedValue: value }
    }

    const options = this.getOptions(column)
    const optionValues = options.map((opt) => opt.value)

    if (this.isMultiSelect(fieldType)) {
      if (!Array.isArray(value)) {
        errors.push(`${column.name} must be an array for multi-select`)
        return { valid: false, errors, transformedValue: value }
      }

      // Check each value is valid
      const invalidValues = value.filter((val) => !optionValues.includes(String(val)))
      if (invalidValues.length > 0) {
        errors.push(`${column.name} contains invalid options: ${invalidValues.join(', ')}`)
      }
    } else {
      // Single select validation
      if (!optionValues.includes(String(value))) {
        errors.push(`${column.name} must be one of: ${optionValues.join(', ')}`)
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      transformedValue: value,
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
    return true // For complex multi-select scenarios
  }

  private createSingleSelectEditor(value: any, column: EnhancedColumn): HTMLElement {
    const select = document.createElement('select')
    this.currentElement = select

    // Apply styling
    select.className = 'vibegridx-select-editor'
    select.setAttribute('data-testid', 'select-editor')
    select.setAttribute('data-field-type', 'select')
    select.setAttribute('data-column-id', column.id)
    select.setAttribute('data-editable', 'true')
    select.style.cssText = `
      width: 100%;
      height: 100%;
      border: none;
      outline: none;
      background: transparent;
      font-family: inherit;
      font-size: inherit;
      padding: 0;
      margin: 0;
      cursor: pointer;
    `

    // Add options
    this.addOptions(select, column, value)

    // Event handlers
    select.addEventListener('blur', () => this.handleSave())
    select.addEventListener('keydown', (e) => this.handleKeyDown(e))
    select.addEventListener('change', () => this.handleSave())

    // Auto-focus
    setTimeout(() => select.focus(), 0)

    return select as unknown as HTMLElement
  }

  private createMultiSelectEditor(value: any, column: EnhancedColumn): HTMLElement {
    const select = document.createElement('select')
    select.multiple = true
    this.currentElement = select

    // Apply styling
    select.className = 'vibegridx-multiselect-editor'
    select.style.cssText = `
      width: 100%;
      height: 100%;
      border: none;
      outline: none;
      background: white;
      font-family: inherit;
      font-size: inherit;
      padding: 2px;
      margin: 0;
      cursor: pointer;
    `

    // Add options
    this.addOptions(select, column, value)

    // Event handlers
    select.addEventListener('blur', () => this.handleSave())
    select.addEventListener('keydown', (e) => this.handleKeyDown(e))

    // Auto-focus
    setTimeout(() => select.focus(), 0)

    return select as unknown as HTMLElement
  }

  private addOptions(select: HTMLSelectElement, column: EnhancedColumn, currentValue: any): void {
    const options = this.getOptions(column)

    // Add empty option for single select (unless required)
    if (!select.multiple && !column.validation?.required) {
      const emptyOption = document.createElement('option')
      emptyOption.value = ''
      emptyOption.textContent = '(Select option)'
      select.appendChild(emptyOption)
    }

    // Add all options
    options.forEach((option) => {
      const optionElement = document.createElement('option')
      optionElement.value = option.value
      optionElement.textContent = option.label

      if (option.disabled) {
        optionElement.disabled = true
      }

      // Set selected state (case-insensitive for values saved with different casing)
      if (select.multiple && Array.isArray(currentValue)) {
        optionElement.selected = currentValue.some(
          (v: any) => String(v).toLowerCase() === option.value.toLowerCase(),
        )
      } else {
        optionElement.selected = String(currentValue).toLowerCase() === option.value.toLowerCase()
      }

      select.appendChild(optionElement)
    })
  }

  private getOptions(column: EnhancedColumn): SelectOption[] {
    // Same logic as renderer
    if (column.options && Array.isArray(column.options)) {
      return column.options.map((opt) =>
        typeof opt === 'string' ? { value: opt, label: opt } : opt,
      )
    }

    if (column.validation?.enum && Array.isArray(column.validation.enum)) {
      return column.validation.enum.map((val: any) => ({ value: String(val), label: String(val) }))
    }

    if (column.editor?.options && Array.isArray(column.editor.options)) {
      return column.editor.options.map((opt: any) =>
        typeof opt === 'string' ? { value: opt, label: opt } : opt,
      )
    }

    return []
  }

  private isMultiSelect(fieldType: string): boolean {
    return fieldType === 'multi-select' || fieldType === 'select-multi'
  }

  private handleSave(): void {
    if (this.currentElement && this.onSaveCallback) {
      const value = this.getValue(this.currentElement as unknown as HTMLElement)
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
 * Select Cell Formatter
 */
export class SelectFormatter implements CellFormatter {
  format(value: any, column: EnhancedColumn, _context?: FormattingContext): string {
    if (value == null) return ''

    const fieldType = column.cellType || column.type || 'select'

    if (this.isMultiSelect(fieldType) && Array.isArray(value)) {
      return this.formatMultiSelectValue(value, column)
    } else {
      return this.formatSingleSelectValue(value, column)
    }
  }

  parse(text: string, column: EnhancedColumn): any {
    if (text.trim() === '') return null

    const fieldType = column.cellType || column.type || 'select'

    if (this.isMultiSelect(fieldType)) {
      // Parse comma-separated values
      return text
        .split(',')
        .map((val) => val.trim())
        .filter((val) => val)
    } else {
      return text.trim()
    }
  }

  formatForDisplay(value: any, column: EnhancedColumn): string {
    return this.format(value, column)
  }

  formatForExport(value: any, _column: EnhancedColumn): string {
    if (value == null) return ''

    if (Array.isArray(value)) {
      return value.join(', ')
    }

    return String(value)
  }

  private formatSingleSelectValue(value: any, column: EnhancedColumn): string {
    const option = this.findOption(value, column)
    return option ? option.label : String(value)
  }

  private formatMultiSelectValue(values: any[], column: EnhancedColumn): string {
    if (values.length === 0) return ''

    const labels = values.map((value) => {
      const option = this.findOption(value, column)
      return option ? option.label : String(value)
    })

    return labels.join(', ')
  }

  private findOption(value: any, column: EnhancedColumn): SelectOption | null {
    const stringValue = String(value)
    const options = this.getOptions(column)
    return (
      options.find((opt) => opt.value === stringValue) ??
      options.find((opt) => opt.value.toLowerCase() === stringValue.toLowerCase()) ??
      null
    )
  }

  private getOptions(column: EnhancedColumn): SelectOption[] {
    if (column.options && Array.isArray(column.options)) {
      return column.options.map((opt) =>
        typeof opt === 'string' ? { value: opt, label: opt } : opt,
      )
    }

    if (column.validation?.enum && Array.isArray(column.validation.enum)) {
      return column.validation.enum.map((val: any) => ({ value: String(val), label: String(val) }))
    }

    if (column.editor?.options && Array.isArray(column.editor.options)) {
      return column.editor.options.map((opt: any) =>
        typeof opt === 'string' ? { value: opt, label: opt } : opt,
      )
    }

    return []
  }

  private isMultiSelect(fieldType: string): boolean {
    return fieldType === 'multi-select' || fieldType === 'select-multi'
  }
}

/**
 * Select Cell Validator
 */
export class SelectValidator implements CellValidator {
  validate(value: any, column: EnhancedColumn): ValidationResult {
    const editor = new SelectEditor()
    return editor.validate(value, column)
  }

  getConstraints(column: EnhancedColumn): Record<string, any> {
    const constraints: Record<string, any> = {}

    if (column.validation?.required) {
      constraints.required = true
    }

    const options = this.getOptions(column)
    if (options.length > 0) {
      constraints.enum = options.map((opt) => opt.value)
    }

    return constraints
  }

  private getOptions(column: EnhancedColumn): SelectOption[] {
    if (column.options && Array.isArray(column.options)) {
      return column.options.map((opt) =>
        typeof opt === 'string' ? { value: opt, label: opt } : opt,
      )
    }

    if (column.validation?.enum && Array.isArray(column.validation.enum)) {
      return column.validation.enum.map((val: any) => ({ value: String(val), label: String(val) }))
    }

    return []
  }
}

/**
 * Select Field Type Definition
 */
export const SelectFieldType: VibeGridFieldType & { affordance: FieldTypeAffordance } = {
  type: 'select',
  category: 'basic',
  renderer: new SelectRenderer(),
  editor: new SelectEditor(),
  formatter: new SelectFormatter(),
  validator: new SelectValidator(),
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

  // 🎯 Affordance declaration - badge that opens dropdown on click
  affordance: {
    group: 'editable-badge', // Badge with scale hover effect, pointer cursor
    whenNotEditable: 'readonly-badge', // Badge without interaction (subtle brightness hover)
  },

  // 🚀 Simple formatter interface for pre-computation
  getFormatter(): (value: any, rowData?: any, column?: any) => string {
    const formatter = new SelectFormatter()
    return (value: any, _rowData?: any, column?: any) => {
      if (!column) return String(value || '')

      // Use reactive options from schema store if available
      if (column.fieldId && typeof window !== 'undefined' && (window as any).schemaStore) {
        try {
          const options = (window as any).schemaStore.getFieldOptions(column.fieldId)
          if (options && Array.isArray(options)) {
            // Create temporary column with reactive options
            const tempColumn = { ...column, options }
            return formatter.format(value, tempColumn)
          }
        } catch {
          // Fallback to column options
        }
      }

      return formatter.format(value, column)
    }
  },

  // 🚀 NEW: Optional editor interface
  getEditor(): any {
    return new SelectEditor()
  },

  // 🚀 Interaction policy (legacy - being replaced by affordance system)
  interactionPolicy: {
    defaultAction: 'edit', // Select fields open dropdown on click
    editTrigger: 'content-click', // Click badge content to open dropdown (padding = selection only)
    blurPolicy: 'commit', // Save on blur
  },
}

// Register immediately
fieldTypeRegistry.register('select', SelectFieldType)
fieldTypeRegistry.register('single-select', SelectFieldType)
fieldTypeRegistry.register('multi-select', SelectFieldType)
fieldTypeRegistry.register('select-multi', SelectFieldType)
fieldTypeRegistry.register('enum', SelectFieldType)
fieldTypeRegistry.register('custom_select', SelectFieldType)
fieldTypeRegistry.register('custom_option_reference', SelectFieldType)
fieldTypeRegistry.register('status', SelectFieldType)
