/**
 * Phone Field Type Implementation
 *
 * Handles phone field types with international formatting, validation, and tel links.
 * Integrates with backend Enhanced Field Handler metadata.
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
 * Phone Cell Renderer
 */
export class PhoneRenderer implements CellRenderer {
  render(value: any, column: EnhancedColumn, rowData: any): HTMLElement {
    const container = document.createElement('span');
    container.className = column.editable === false
      ? 'vibegridx-cell-phone'
      : 'vibegridx-cell-phone-editable';

    // Handle null/undefined values
    if (value == null || value === '') {
      container.className += ' vibegridx-cell-empty';
      container.textContent = column.editable === false ? '' : 'Click to edit';
      container.style.opacity = '0.6';
      container.style.fontSize = '12px';
      return container;
    }

    // Format value for display
    const displayValue = this.formatValue(value, column);
    container.textContent = displayValue;

    // Apply phone-specific styling
    container.style.color = '#2563eb';
    container.style.cursor = 'pointer';
    container.style.fontVariantNumeric = 'tabular-nums';

    // Make it clickable to initiate phone call
    container.addEventListener('click', (e) => {
      e.stopPropagation();
      const cleanPhone = this.cleanPhoneNumber(String(value));
      if (cleanPhone) {
        window.open(`tel:${cleanPhone}`, '_self');
      }
    });

    // Apply backend display metadata if available
    if (column.display) {
      this.applyDisplayMetadata(container, column.display);
    }

    return container;
  }

  update(element: HTMLElement, value: any, column: EnhancedColumn): void {
    element.className = column.editable === false
      ? 'vibegridx-cell-phone'
      : 'vibegridx-cell-phone-editable';

    if (value == null || value === '') {
      element.className += ' vibegridx-cell-empty';
      element.textContent = column.editable === false ? '' : 'Click to edit';
      element.style.opacity = '0.6';
    } else {
      element.textContent = this.formatValue(value, column);
      element.style.opacity = '1';
      element.style.color = '#2563eb';
    }
  }

  canHandle(column: EnhancedColumn): boolean {
    const type = column.cellType || column.type || '';
    return type === 'phone';
  }

  private formatValue(value: any, column: EnhancedColumn): string {
    if (value == null) return '';

    const phoneValue = String(value);
    const format = column.validation?.phoneFormat || column.editor?.phoneFormat || 'international';

    return this.formatPhoneNumber(phoneValue, format);
  }

  private formatPhoneNumber(phone: string, format: string): string {
    // Remove all non-numeric characters
    const cleaned = phone.replace(/\D/g, '');

    if (cleaned.length === 0) return phone;

    // Format based on specified format
    switch (format) {
      case 'national':
        return this.formatNational(cleaned);
      case 'e164':
        return this.formatE164(cleaned);
      case 'international':
      default:
        return this.formatInternational(cleaned);
    }
  }

  private formatInternational(cleaned: string): string {
    // US phone numbers
    if (cleaned.length === 10) {
      return `+1 (${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
    } else if (cleaned.length === 11 && cleaned[0] === '1') {
      return `+1 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
    }

    // International format with country code
    if (cleaned.length > 10) {
      return `+${cleaned}`;
    }

    // Fallback for other lengths
    return cleaned;
  }

  private formatNational(cleaned: string): string {
    // US phone numbers without country code
    if (cleaned.length === 10) {
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
    } else if (cleaned.length === 11 && cleaned[0] === '1') {
      return `(${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
    }

    return cleaned;
  }

  private formatE164(cleaned: string): string {
    // E.164 format: +[country code][number]
    if (cleaned.length === 10) {
      return `+1${cleaned}`;
    } else if (cleaned.length === 11 && cleaned[0] === '1') {
      return `+${cleaned}`;
    } else if (cleaned.length > 0 && !cleaned.startsWith('1')) {
      return `+${cleaned}`;
    }

    return cleaned;
  }

  private cleanPhoneNumber(phone: string): string {
    return phone.replace(/\D/g, '');
  }

  private applyDisplayMetadata(element: HTMLElement, displayMetadata: any): void {
    if (displayMetadata.showPhoneIcon) {
      const icon = document.createElement('span');
      icon.textContent = '📞';
      icon.style.marginRight = '4px';
      element.insertBefore(icon, element.firstChild);
    }
  }
}

/**
 * Phone Cell Editor
 */
export class PhoneEditor implements CellEditor {
  private currentElement: HTMLElement | null = null;
  private onSaveCallback: ((value: any) => void) | null = null;

  create(value: any, column: EnhancedColumn, onSave: (value: any) => void): HTMLElement {
    this.onSaveCallback = onSave;

    const input = document.createElement('input');
    this.currentElement = input;

    input.type = 'tel';
    input.placeholder = '+1 (555) 123-4567';

    // Set initial value
    const phoneValue = value == null ? '' : String(value);
    input.value = phoneValue;

    input.className = 'vibegridx-phone-editor';
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
      font-variant-numeric: tabular-nums;
    `;

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
    input.addEventListener('input', (e) => this.handleInput(e));

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
      return value === '' ? null : value;
    }
    return null;
  }

  setValue(element: HTMLElement, value: any): void {
    if (element instanceof HTMLInputElement) {
      element.value = value == null ? '' : String(value);
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

    const phoneValue = String(value);
    const cleaned = phoneValue.replace(/\D/g, '');

    // Basic length validation
    if (cleaned.length < 10) {
      errors.push(`${column.name} must be at least 10 digits`);
    }

    if (cleaned.length > 15) {
      errors.push(`${column.name} must be no more than 15 digits`);
    }

    // Format validation
    const format = column.validation?.phoneFormat || 'international';
    if (format === 'e164' && !phoneValue.startsWith('+')) {
      errors.push(`${column.name} must start with + for E.164 format`);
    }

    return {
      valid: errors.length === 0,
      errors,
      transformedValue: phoneValue
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

  private applyEditorMetadata(input: HTMLInputElement, editorMetadata: any): void {
    if (editorMetadata.placeholder) {
      input.placeholder = editorMetadata.placeholder;
    }

    if (editorMetadata.phoneFormat === 'e164') {
      input.placeholder = '+1234567890';
    } else if (editorMetadata.phoneFormat === 'national') {
      input.placeholder = '(555) 123-4567';
    }

    if (editorMetadata.autoComplete !== false) {
      input.autocomplete = 'tel';
    }
  }

  private applyValidationMetadata(input: HTMLInputElement, validationMetadata: any): void {
    if (validationMetadata.maxLength) {
      input.maxLength = validationMetadata.maxLength;
    }

    if (validationMetadata.required) {
      input.required = true;
    }
  }

  private handleInput(event: Event): void {
    const input = event.target as HTMLInputElement;

    // Auto-format as user types (optional enhancement)
    const format = this.getPhoneFormat(input);
    if (format === 'national') {
      const cleaned = input.value.replace(/\D/g, '');
      if (cleaned.length <= 10) {
        input.value = this.formatNationalAsTyping(cleaned);
      }
    }
  }

  private formatNationalAsTyping(cleaned: string): string {
    if (cleaned.length === 0) return '';
    if (cleaned.length <= 3) return cleaned;
    if (cleaned.length <= 6) return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3)}`;
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6, 10)}`;
  }

  private getPhoneFormat(input: HTMLInputElement): string {
    // Would get from column metadata in real implementation
    return 'international';
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
 * Phone Cell Formatter
 */
export class PhoneFormatter implements CellFormatter {
  format(value: any, column: EnhancedColumn, context?: FormattingContext): string {
    if (value == null) return '';

    const phoneValue = String(value);
    const format = context?.phoneFormat ||
                  column.validation?.phoneFormat ||
                  column.editor?.phoneFormat ||
                  'international';

    return this.formatPhoneNumber(phoneValue, format);
  }

  parse(text: string, column: EnhancedColumn): any {
    if (text.trim() === '') return null;
    return text.trim();
  }

  formatForDisplay(value: any, column: EnhancedColumn): string {
    return this.format(value, column);
  }

  formatForExport(value: any, column: EnhancedColumn): string {
    if (value == null) return '';

    // Export in E.164 format for consistency
    const cleaned = String(value).replace(/\D/g, '');
    if (cleaned.length === 10) {
      return `+1${cleaned}`;
    } else if (cleaned.length === 11 && cleaned[0] === '1') {
      return `+${cleaned}`;
    }

    return String(value);
  }

  private formatPhoneNumber(phone: string, format: string): string {
    const cleaned = phone.replace(/\D/g, '');

    if (cleaned.length === 0) return phone;

    switch (format) {
      case 'national':
        return this.formatNational(cleaned);
      case 'e164':
        return this.formatE164(cleaned);
      case 'international':
      default:
        return this.formatInternational(cleaned);
    }
  }

  private formatInternational(cleaned: string): string {
    if (cleaned.length === 10) {
      return `+1 (${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
    } else if (cleaned.length === 11 && cleaned[0] === '1') {
      return `+1 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
    }

    if (cleaned.length > 10) {
      return `+${cleaned}`;
    }

    return cleaned;
  }

  private formatNational(cleaned: string): string {
    if (cleaned.length === 10) {
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
    } else if (cleaned.length === 11 && cleaned[0] === '1') {
      return `(${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
    }

    return cleaned;
  }

  private formatE164(cleaned: string): string {
    if (cleaned.length === 10) {
      return `+1${cleaned}`;
    } else if (cleaned.length === 11 && cleaned[0] === '1') {
      return `+${cleaned}`;
    } else if (cleaned.length > 0) {
      return `+${cleaned}`;
    }

    return cleaned;
  }
}

/**
 * Phone Cell Validator
 */
export class PhoneValidator implements CellValidator {
  validate(value: any, column: EnhancedColumn): ValidationResult {
    const editor = new PhoneEditor();
    return editor.validate(value, column);
  }

  getConstraints(column: EnhancedColumn): Record<string, any> {
    const constraints: Record<string, any> = {};

    if (column.validation?.required) {
      constraints.required = true;
    }

    constraints.format = 'phone';
    constraints.minDigits = 10;
    constraints.maxDigits = 15;

    if (column.validation?.phoneFormat) {
      constraints.phoneFormat = column.validation.phoneFormat;
    }

    return constraints;
  }
}

/**
 * Phone Field Type Definition
 */
export const PhoneFieldType: VibeGridFieldType = {
  type: 'phone',
  category: 'basic',
  renderer: new PhoneRenderer(),
  editor: new PhoneEditor(),
  formatter: new PhoneFormatter(),
  validator: new PhoneValidator(),
  metadata: {
    supportsSorting: true,
    supportsFiltering: true,
    supportsGrouping: true,
    supportsAggregation: false,
    requiresSpecialEditor: false,
    hasRichDisplay: true,
    supportsValidation: true,
    supportsFormatting: true
  }
};

// Register with the global registry
import { fieldTypeRegistry } from '../../FieldTypeRegistry';
fieldTypeRegistry.register('phone', PhoneFieldType);