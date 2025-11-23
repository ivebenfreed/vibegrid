/**
 * Number Field Type Implementation
 *
 * Handles number, integer, decimal, and percentage field types with proper validation,
 * formatting, and editing. Integrates with backend Enhanced Field Handler metadata.
 */

import type {
  VibeGridFieldType,
  CellRenderer,
  CellEditor,
  CellFormatter,
  CellValidator,
  EnhancedColumn,
  ValidationResult,
  FormattingContext,
  FieldMetadata
} from '../../FieldTypeRegistry';

/**
 * Number Cell Renderer
 */
export class NumberRenderer implements CellRenderer {
  render(value: any, column: EnhancedColumn, rowData: any): HTMLElement {
    const container = document.createElement('span');

    // Add hover class based on editability (plain text hover pattern)
    const hoverClass = column.editable === false ? 'vibegridx-text-readonly' : 'vibegridx-text-editable';
    container.className = `vibegridx-cell-number ${hoverClass}`;

    // Handle null/undefined values with consistent empty state
    if (value == null || value === '') {
      if (column.editable === false) {
        container.className = 'vibegridx-cell-empty';
        container.textContent = '';
      } else {
        container.className = 'vibegridx-cell-empty vibegridx-text-editable';
        container.innerHTML = '<span style="opacity: 0.6;">Edit ✏️</span>';
      }
      return container;
    }

    // Format value for display
    const displayValue = this.formatValue(value, column);
    container.textContent = displayValue;

    // Apply number-specific styling
    container.style.textAlign = 'right';
    container.style.fontVariantNumeric = 'tabular-nums';
    container.style.fontFamily = 'inherit';

    // Apply backend display metadata if available
    if (column.display) {
      this.applyDisplayMetadata(container, column.display);
    }

    return container;
  }

  update(element: HTMLElement, value: any, column: EnhancedColumn): void {
    // Clear existing content
    element.className = column.editable === false
      ? 'vibegridx-cell-number'
      : 'vibegridx-cell-number-editable';

    // Handle empty values
    if (value == null || value === '') {
      if (column.editable === false) {
        element.className += ' vibegridx-cell-empty';
        element.textContent = '';
      } else {
        element.className += ' vibegridx-cell-empty vibegridx-text-editable';
        element.innerHTML = '<span style="opacity: 0.6;">Edit ✏️</span>';
      }
    } else {
      element.textContent = this.formatValue(value, column);
      element.style.opacity = '1';
    }
  }

  canHandle(column: EnhancedColumn): boolean {
    const type = column.cellType || column.type || '';
    return ['number', 'integer', 'decimal', 'percentage', 'currency'].includes(type);
  }

  private formatValue(value: any, column: EnhancedColumn): string {
    if (value == null) return '';

    const numValue = Number(value);
    if (isNaN(numValue)) return String(value);

    const type = column.cellType || column.type || 'number';

    switch (type as string) {
      case 'integer':
        return Math.round(numValue).toLocaleString();

      case 'decimal':
        const precision = column.validation?.precision || column.editor?.precision || 2;
        return numValue.toLocaleString(undefined, {
          minimumFractionDigits: precision,
          maximumFractionDigits: precision
        });

      case 'percentage':
        return `${numValue.toFixed(1)}%`;

      case 'currency':
        const currency = column.editor?.currencyCode || column.validation?.currencyCode || 'USD';
        return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: currency
        }).format(numValue);

      case 'number':
      default:
        return numValue.toLocaleString();
    }
  }

  private applyDisplayMetadata(element: HTMLElement, displayMetadata: any): void {
    if (displayMetadata.textAlign) {
      element.style.textAlign = displayMetadata.textAlign;
    }

    if (displayMetadata.fontWeight) {
      element.style.fontWeight = displayMetadata.fontWeight;
    }

    if (displayMetadata.format === 'currency' && displayMetadata.currency) {
      // Currency formatting handled in formatValue
    }
  }
}

/**
 * Number Cell Editor
 */
export class NumberEditor implements CellEditor {
  private currentElement: HTMLElement | null = null;
  private onSaveCallback: ((value: any) => void) | null = null;

  create(value: any, column: EnhancedColumn, onSave: (value: any) => void): HTMLElement {
    this.onSaveCallback = onSave;

    const input = document.createElement('input');
    this.currentElement = input;

    // Set input type and attributes
    const type = column.cellType || column.type || 'number';
    input.type = 'number';

    // Set initial value
    const numValue = value != null ? Number(value) : '';
    input.value = isNaN(Number(numValue)) ? '' : String(numValue);

    // Apply styling
    input.className = 'vibegridx-number-editor';
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
      text-align: right;
      font-variant-numeric: tabular-nums;
    `;

    // Apply type-specific attributes
    this.applyTypeSpecificAttributes(input, column, type);

    // Apply backend editor metadata if available
    if (column.editor) {
      this.applyEditorMetadata(input, column.editor);
    }

    // Apply validation metadata if available
    if (column.validation) {
      this.applyValidationMetadata(input, column.validation);
    }

    // Event handlers
    input.addEventListener('blur', () => this.handleSave());
    input.addEventListener('keydown', (e) => this.handleKeyDown(e));

    // Auto-focus and select all
    setTimeout(() => {
      input.focus();
      input.select();
    }, 0);

    return input;
  }

  getValue(element: HTMLElement): any {
    if (element instanceof HTMLInputElement) {
      const value = element.value.trim();
      if (value === '') return null;

      const numValue = Number(value);
      return isNaN(numValue) ? null : numValue;
    }
    return null;
  }

  setValue(element: HTMLElement, value: any): void {
    if (element instanceof HTMLInputElement) {
      const numValue = value != null ? Number(value) : '';
      element.value = isNaN(Number(numValue)) ? '' : String(numValue);
    }
  }

  validate(value: any, column: EnhancedColumn): ValidationResult {
    const errors: string[] = [];

    // Handle null/empty values
    if (value == null || value === '') {
      if (column.validation?.required) {
        errors.push(column.validation.messages?.required || `${column.name} is required`);
      }
      return { valid: errors.length === 0, errors, transformedValue: null };
    }

    const numValue = Number(value);

    // Check if it's a valid number
    if (isNaN(numValue)) {
      errors.push(`${column.name} must be a valid number`);
      return { valid: false, errors, transformedValue: value };
    }

    // Type-specific validation
    const type = column.cellType || column.type || 'number';
    if ((type as string) === 'integer' && !Number.isInteger(numValue)) {
      errors.push(`${column.name} must be a whole number`);
    }

    // Range validation
    if (column.validation?.min !== undefined && numValue < column.validation.min) {
      errors.push(`${column.name} must be at least ${column.validation.min}`);
    }

    if (column.validation?.max !== undefined && numValue > column.validation.max) {
      errors.push(`${column.name} must be no more than ${column.validation.max}`);
    }

    // Percentage specific validation
    if ((type as string) === 'percentage') {
      if (numValue < 0 || numValue > 100) {
        errors.push(`${column.name} must be between 0 and 100`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      transformedValue: numValue
    };
  }

  destroy(element: HTMLElement): void {
    this.currentElement = null;
    this.onSaveCallback = null;
  }

  supportsInlineEditing(): boolean {
    return true;
  }

  supportsModalEditing(): boolean {
    return false;
  }

  private applyTypeSpecificAttributes(input: HTMLInputElement, column: EnhancedColumn, type: string): void {
    switch (type as string) {
      case 'integer':
        input.step = '1';
        break;
      case 'decimal':
        const precision = column.validation?.precision || 2;
        input.step = `0.${'0'.repeat(precision - 1)}1`;
        break;
      case 'percentage':
        input.min = '0';
        input.max = '100';
        input.step = '0.1';
        break;
      case 'currency':
        input.step = '0.01';
        break;
    }

    // Apply min/max from validation
    if (column.validation?.min !== undefined) {
      input.min = String(column.validation.min);
    }
    if (column.validation?.max !== undefined) {
      input.max = String(column.validation.max);
    }
  }

  private applyEditorMetadata(input: HTMLInputElement, editorMetadata: any): void {
    if (editorMetadata.step) {
      input.step = String(editorMetadata.step);
    }

    if (editorMetadata.showSpinners === false) {
      input.style.appearance = 'textfield';
    }

    if (editorMetadata.placeholder) {
      input.placeholder = editorMetadata.placeholder;
    }
  }

  private applyValidationMetadata(input: HTMLInputElement, validationMetadata: any): void {
    if (validationMetadata.min !== undefined) {
      input.min = String(validationMetadata.min);
    }

    if (validationMetadata.max !== undefined) {
      input.max = String(validationMetadata.max);
    }

    if (validationMetadata.required) {
      input.required = true;
    }
  }

  private handleSave(): void {
    if (this.currentElement && this.onSaveCallback) {
      const value = this.getValue(this.currentElement);
      this.onSaveCallback(value);
    }
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.handleSave();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      if (this.currentElement) {
        this.currentElement.blur();
      }
    }
  }
}

/**
 * Number Cell Formatter
 */
export class NumberFormatter implements CellFormatter {
  format(value: any, column: EnhancedColumn, context?: FormattingContext): string {
    if (value == null) return '';

    const numValue = Number(value);
    if (isNaN(numValue)) return String(value);

    const type = column.cellType || column.type || 'number';
    const locale = context?.locale || 'en-US';

    switch (type as string) {
      case 'integer':
        return Math.round(numValue).toLocaleString(locale);

      case 'decimal':
        const precision = column.validation?.precision || column.editor?.precision || 2;
        return numValue.toLocaleString(locale, {
          minimumFractionDigits: precision,
          maximumFractionDigits: precision
        });

      case 'percentage':
        return `${numValue.toFixed(1)}%`;

      case 'currency':
        const currency = context?.currency ||
                        column.editor?.currencyCode ||
                        column.validation?.currencyCode || 'USD';
        return new Intl.NumberFormat(locale, {
          style: 'currency',
          currency: currency
        }).format(numValue);

      case 'number':
      default:
        return numValue.toLocaleString(locale);
    }
  }

  parse(text: string, column: EnhancedColumn): any {
    if (text.trim() === '') return null;

    // Remove common formatting characters
    const cleanText = text.replace(/[,$%]/g, '');

    const numValue = Number(cleanText);
    return isNaN(numValue) ? null : numValue;
  }

  formatForDisplay(value: any, column: EnhancedColumn): string {
    return this.format(value, column);
  }

  formatForExport(value: any, column: EnhancedColumn): string {
    return value == null ? '' : String(value);
  }
}

/**
 * Number Cell Validator
 */
export class NumberValidator implements CellValidator {
  validate(value: any, column: EnhancedColumn): ValidationResult {
    const editor = new NumberEditor();
    return editor.validate(value, column);
  }

  getConstraints(column: EnhancedColumn): Record<string, any> {
    const constraints: Record<string, any> = {};

    if (column.validation?.required) {
      constraints.required = true;
    }

    if (column.validation?.min !== undefined) {
      constraints.min = column.validation.min;
    }

    if (column.validation?.max !== undefined) {
      constraints.max = column.validation.max;
    }

    const type = column.cellType || column.type || 'number';
    if ((type as string) === 'integer') {
      constraints.step = 1;
    }

    return constraints;
  }
}

/**
 * Number Field Type Definition
 */
export const NumberFieldType: VibeGridFieldType = {
  type: 'number',
  category: 'basic',
  renderer: new NumberRenderer(),
  editor: new NumberEditor(),
  formatter: new NumberFormatter(),
  validator: new NumberValidator(),
  metadata: {
    supportsSorting: true,
    supportsFiltering: true,
    supportsGrouping: true,
    supportsAggregation: true,
    requiresSpecialEditor: false,
    hasRichDisplay: true,
    supportsValidation: true,
    supportsFormatting: true
  },
  getFormatter() {
    const fmt = this.formatter;
    return (value: any, rowData?: any, column?: any) => fmt.format(value, column);
  },

  // 🚀 NEW: Interaction policy
  interactionPolicy: {
    defaultAction: 'edit',         // Number fields are for editing
    editTrigger: 'content-click',  // ✅ Click content to edit, click padding to select
    blurPolicy: 'commit'           // Save on blur
  }
};

// Register with the global registry
import { fieldTypeRegistry } from '../../FieldTypeRegistry';
fieldTypeRegistry.register('number', NumberFieldType);
fieldTypeRegistry.register('integer', NumberFieldType);
fieldTypeRegistry.register('decimal', NumberFieldType);
fieldTypeRegistry.register('percentage', NumberFieldType);
fieldTypeRegistry.register('currency', NumberFieldType);