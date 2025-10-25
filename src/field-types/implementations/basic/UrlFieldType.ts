/**
 * URL Field Type Implementation
 *
 * Handles URL field types with validation, auto-protocol addition, and clickable links.
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
 * URL Cell Renderer
 */
export class UrlRenderer implements CellRenderer {
  render(value: any, column: EnhancedColumn, rowData: any): HTMLElement {
    const container = document.createElement('span');
    container.className = column.editable === false
      ? 'vibegridx-cell-url'
      : 'vibegridx-cell-url-editable';

    // Handle null/undefined values
    if (value == null || value === '') {
      container.className += ' vibegridx-cell-empty';
      container.textContent = column.editable === false ? '' : 'Click to edit';
      container.style.opacity = '0.6';
      container.style.fontSize = '12px';
      return container;
    }

    // Format and validate URL
    const urlValue = this.formatValue(value, column);
    container.textContent = this.truncateUrl(urlValue, column);

    // Apply URL-specific styling
    container.style.color = '#2563eb';
    container.style.textDecoration = 'underline';
    container.style.cursor = 'pointer';
    container.title = urlValue; // Show full URL on hover

    // Make it clickable to open in new tab
    container.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.isValidUrl(urlValue)) {
        window.open(urlValue, '_blank', 'noopener,noreferrer');
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
      ? 'vibegridx-cell-url'
      : 'vibegridx-cell-url-editable';

    if (value == null || value === '') {
      element.className += ' vibegridx-cell-empty';
      element.textContent = column.editable === false ? '' : 'Click to edit';
      element.style.opacity = '0.6';
      element.style.color = '';
      element.style.textDecoration = '';
    } else {
      const urlValue = this.formatValue(value, column);
      element.textContent = this.truncateUrl(urlValue, column);
      element.title = urlValue;
      element.style.opacity = '1';
      element.style.color = '#2563eb';
      element.style.textDecoration = 'underline';
    }
  }

  canHandle(column: EnhancedColumn): boolean {
    const type = column.cellType || column.type || '';
    return (type as string) === 'url';
  }

  private formatValue(value: any, column: EnhancedColumn): string {
    if (value == null) return '';

    let urlValue = String(value).trim();

    // Auto-add protocol if missing
    if (urlValue && !this.hasProtocol(urlValue)) {
      urlValue = `https://${urlValue}`;
    }

    return urlValue;
  }

  private hasProtocol(url: string): boolean {
    return /^[a-z][a-z0-9+.-]*:/i.test(url);
  }

  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  private truncateUrl(url: string, column: EnhancedColumn): string {
    const maxLength = column.display?.truncateAt || column.validation?.maxLength || 50;

    if (url.length <= maxLength) return url;

    // Smart truncation - show protocol and domain, truncate path
    try {
      const urlObj = new URL(url);
      const baseUrl = `${urlObj.protocol}//${urlObj.hostname}`;

      if (baseUrl.length >= maxLength - 3) {
        return url.substring(0, maxLength - 3) + '...';
      }

      const remainingLength = maxLength - baseUrl.length - 3;
      const pathPart = urlObj.pathname + urlObj.search;

      if (pathPart.length <= remainingLength) {
        return baseUrl + pathPart;
      }

      return baseUrl + pathPart.substring(0, remainingLength) + '...';
    } catch {
      return url.substring(0, maxLength - 3) + '...';
    }
  }

  private applyDisplayMetadata(element: HTMLElement, displayMetadata: any): void {
    if (displayMetadata.showLinkIcon) {
      const icon = document.createElement('span');
      icon.textContent = '🔗';
      icon.style.marginRight = '4px';
      element.insertBefore(icon, element.firstChild);
    }
  }
}

/**
 * URL Cell Editor
 */
export class UrlEditor implements CellEditor {
  private currentElement: HTMLElement | null = null;
  private onSaveCallback: ((value: any) => void) | null = null;

  create(value: any, column: EnhancedColumn, onSave: (value: any) => void): HTMLElement {
    this.onSaveCallback = onSave;

    const input = document.createElement('input');
    this.currentElement = input;

    input.type = 'url';
    input.placeholder = 'https://example.com';

    // Set initial value (without auto-protocol for editing)
    const urlValue = value == null ? '' : String(value);
    input.value = urlValue;

    input.className = 'vibegridx-url-editor';
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

      // Auto-add protocol if missing
      if (value && !this.hasProtocol(value)) {
        return `https://${value}`;
      }

      return value;
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

    let urlValue = String(value).trim();

    // Auto-add protocol if missing
    if (urlValue && !this.hasProtocol(urlValue)) {
      urlValue = `https://${urlValue}`;
    }

    // URL format validation
    try {
      new URL(urlValue);
    } catch {
      errors.push(column.validation?.messages?.pattern || `${column.name} must be a valid URL`);
    }

    // Length validation
    if (column.validation?.maxLength && urlValue.length > column.validation.maxLength) {
      errors.push(`${column.name} must be no more than ${column.validation.maxLength} characters`);
    }

    // Protocol validation (if specified in backend)
    if (column.validation?.urlProtocols && Array.isArray(column.validation.urlProtocols)) {
      try {
        const url = new URL(urlValue);
        if (!column.validation.urlProtocols.includes(url.protocol)) {
          errors.push(`${column.name} must use an allowed protocol: ${column.validation.urlProtocols.join(', ')}`);
        }
      } catch {
        // URL parsing already failed above
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      transformedValue: urlValue // Auto-protocol transformation
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

  private hasProtocol(url: string): boolean {
    return /^[a-z][a-z0-9+.-]*:/i.test(url);
  }

  private applyEditorMetadata(input: HTMLInputElement, editorMetadata: any): void {
    if (editorMetadata.placeholder) {
      input.placeholder = editorMetadata.placeholder;
    }

    if (editorMetadata.autoComplete !== false) {
      input.autocomplete = 'url';
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
 * URL Cell Formatter
 */
export class UrlFormatter implements CellFormatter {
  format(value: any, column: EnhancedColumn, context?: FormattingContext): string {
    if (value == null) return '';

    let urlValue = String(value).trim();

    // Auto-add protocol if missing
    if (urlValue && !this.hasProtocol(urlValue)) {
      urlValue = `https://${urlValue}`;
    }

    return urlValue;
  }

  parse(text: string, column: EnhancedColumn): any {
    if (text.trim() === '') return null;

    let urlValue = text.trim();

    // Auto-add protocol if missing
    if (urlValue && !this.hasProtocol(urlValue)) {
      urlValue = `https://${urlValue}`;
    }

    return urlValue;
  }

  formatForDisplay(value: any, column: EnhancedColumn): string {
    return this.format(value, column);
  }

  formatForExport(value: any, column: EnhancedColumn): string {
    return value == null ? '' : String(value);
  }

  private hasProtocol(url: string): boolean {
    return /^[a-z][a-z0-9+.-]*:/i.test(url);
  }
}

/**
 * URL Cell Validator
 */
export class UrlValidator implements CellValidator {
  validate(value: any, column: EnhancedColumn): ValidationResult {
    const editor = new UrlEditor();
    return editor.validate(value, column);
  }

  getConstraints(column: EnhancedColumn): Record<string, any> {
    const constraints: Record<string, any> = {};

    if (column.validation?.required) {
      constraints.required = true;
    }

    if (column.validation?.maxLength) {
      constraints.maxLength = column.validation.maxLength;
    }

    constraints.format = 'url';
    constraints.autoProtocol = true;

    if (column.validation?.urlProtocols) {
      constraints.allowedProtocols = column.validation.urlProtocols;
    }

    return constraints;
  }
}

/**
 * URL Field Type Definition
 */
export const UrlFieldType: VibeGridFieldType = {
  type: 'url',
  category: 'basic',
  renderer: new UrlRenderer(),
  editor: new UrlEditor(),
  formatter: new UrlFormatter(),
  validator: new UrlValidator(),
  metadata: {
    supportsSorting: true,
    supportsFiltering: true,
    supportsGrouping: true,
    supportsAggregation: false,
    requiresSpecialEditor: false,
    hasRichDisplay: true,
    supportsValidation: true,
    supportsFormatting: true
  },
  getFormatter() {
    const fmt = this.formatter;
    return (value: any, rowData?: any, column?: any) => fmt.format(value, column);
  }
};

// Register with the global registry
import { fieldTypeRegistry } from '../../FieldTypeRegistry';
fieldTypeRegistry.register('url', UrlFieldType);