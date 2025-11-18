/**
 * Text Field Type Implementation
 *
 * Handles text, longtext, and textarea field types with proper rendering, editing, and formatting.
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
import { fieldTypeRegistry } from '../../FieldTypeRegistry';
import { createLogger } from '@/shared/lib/logging';

const fieldLog = createLogger('components/custom/vibegrid/field-types/implementations/basic/TextFieldType.ts');

/**
 * Text Cell Renderer
 */
export class TextRenderer implements CellRenderer {
  render(value: any, column: EnhancedColumn, rowData: any): HTMLElement {
    fieldLog.debug('📝 [FIELD-TEXT] Rendering text field', {
      columnId: column.id,
      fieldType: column.cellType || column.type,
      value: value,
      editable: column.editable !== false
    });

    const container = document.createElement('span');
    const fieldType = column.cellType || column.type || 'text';

    // Set appropriate CSS class based on editability (plain text hover pattern)
    const hoverClass = column.editable === false ? 'vibegridx-text-readonly' : 'vibegridx-text-editable';
    container.className = `vibegridx-cell-${fieldType} ${hoverClass}`;

    // Handle null/undefined values
    if (value == null || value === '') {
      container.className += ' vibegridx-cell-empty';
      container.textContent = column.editable === false ? '' : 'Click to edit...';
      container.style.opacity = '0.6';
      container.style.fontSize = '12px';
      return container;
    }

    // Format value for display based on field type
    const displayValue = this.formatValueByType(value, column);
    container.textContent = displayValue;
    container.title = displayValue; // Tooltip for overflow text

    // Apply common text overflow handling
    container.style.maxWidth = '100%';
    container.style.overflow = 'hidden';
    container.style.textOverflow = 'ellipsis';
    container.style.whiteSpace = 'nowrap';
    container.style.display = 'block';

    // Apply field-specific styling
    this.applyFieldTypeSpecificStyling(container, fieldType);

    // Apply backend display metadata if available
    if (column.display) {
      this.applyDisplayMetadata(container, column.display);
    }

    return container;
  }

  update(element: HTMLElement, value: any, column: EnhancedColumn): void {
    // Clear existing content
    element.className = column.editable === false
      ? 'vibegridx-cell-text'
      : 'vibegridx-cell-text-editable';

    // Handle empty values
    if (value == null || value === '') {
      element.className += ' vibegridx-cell-empty';
      element.textContent = column.editable === false ? '' : 'Click to edit';
      element.title = '';
      element.style.opacity = '0.6';
    } else {
      const displayValue = this.formatValueByType(value, column);
      element.textContent = displayValue;
      element.title = displayValue; // Tooltip for overflow text
      element.style.opacity = '1';
    }
  }

  canHandle(column: EnhancedColumn): boolean {
    const type = column.cellType || column.type || '';
    return ['text', 'string', 'email', 'url', 'phone', 'longtext', 'textarea', 'markdown', 'html', 'richtext'].includes(type);
  }

  private formatValueByType(value: any, column: EnhancedColumn): string {
    if (value == null) return '';

    const fieldType = (column.cellType || column.type || 'text') as string;
    let strValue = String(value);

    // For multi-line fields, convert to single line for display
    if (['longtext', 'textarea', 'markdown', 'html', 'richtext'].includes(fieldType)) {
      strValue = strValue.replace(/\s+/g, ' ').trim();
    }

    // Apply field-specific formatting
    switch (fieldType) {
      case 'email':
        strValue = strValue.toLowerCase();
        break;
      case 'url':
        if (strValue && !strValue.match(/^https?:\/\//)) {
          strValue = `${strValue}`;
        }
        break;
      case 'phone':
        // Basic phone formatting could go here
        break;
    }

    // Apply length limits from backend metadata if available
    if (column.validation?.maxLength && strValue.length > column.validation.maxLength) {
      return strValue.substring(0, column.validation.maxLength) + '...';
    }

    // Apply display truncation
    const maxDisplayLength = column.display?.truncateAt || 100;
    if (strValue.length > maxDisplayLength) {
      return strValue.substring(0, maxDisplayLength) + '...';
    }

    return strValue;
  }

  private applyFieldTypeSpecificStyling(element: HTMLElement, fieldType: string): void {
    switch (fieldType) {
      case 'email':
        element.style.fontFamily = 'monospace';
        element.style.fontSize = '12px';
        break;
      case 'url':
        element.style.color = '#2563eb';
        element.style.textDecoration = 'underline';
        break;
      case 'phone':
        element.style.fontFamily = 'monospace';
        break;
      case 'longtext':
      case 'textarea':
      case 'markdown':
      case 'html':
      case 'richtext':
        element.style.fontStyle = 'italic';
        element.style.color = '#6b7280';
        break;
    }
  }

  private applyDisplayMetadata(element: HTMLElement, displayMetadata: any): void {
    if (displayMetadata.textAlign) {
      element.style.textAlign = displayMetadata.textAlign;
    }

    if (displayMetadata.fontWeight) {
      element.style.fontWeight = displayMetadata.fontWeight;
    }

    if (displayMetadata.truncateAt && element.textContent) {
      const text = element.textContent;
      if (text.length > displayMetadata.truncateAt) {
        element.textContent = text.substring(0, displayMetadata.truncateAt) + '...';
        element.title = text; // Show full text on hover
      }
    }
  }
}

/**
 * Text Cell Editor
 */
export class TextEditor implements CellEditor {
  private currentElement: HTMLElement | null = null;
  private onSaveCallback: ((value: any) => void) | null = null;

  create(value: any, column: EnhancedColumn, onSave: (value: any) => void): HTMLElement {
    this.onSaveCallback = onSave;

    // Determine if this should be a textarea or input
    const isMultiline = this.isMultilineField(column);

    const input = document.createElement(isMultiline ? 'textarea' : 'input');
    this.currentElement = input;

    // Set initial value
    const displayValue = value == null ? '' : String(value);
    if (isMultiline) {
      (input as HTMLTextAreaElement).value = displayValue;
    } else {
      (input as HTMLInputElement).value = displayValue;
      (input as HTMLInputElement).type = 'text';
    }

    // Apply styling
    input.className = 'vibegridx-text-editor';
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
      resize: none;
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
    input.addEventListener('keydown', this.handleKeyDown.bind(this) as EventListener);

    // Auto-focus
    setTimeout(() => input.focus(), 0);

    return input;
  }

  getValue(element: HTMLElement): any {
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      const value = element.value.trim();
      return value === '' ? null : value;
    }
    return null;
  }

  setValue(element: HTMLElement, value: any): void {
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      element.value = value == null ? '' : String(value);
    }
  }

  validate(value: any, column: EnhancedColumn): ValidationResult {
    const errors: string[] = [];
    const strValue = value == null ? '' : String(value);

    // Required validation
    if (column.validation?.required && strValue.trim() === '') {
      errors.push(column.validation.messages?.required || `${column.name} is required`);
    }

    // Length validation
    if (column.validation?.minLength && strValue.length < column.validation.minLength) {
      errors.push(`${column.name} must be at least ${column.validation.minLength} characters`);
    }

    if (column.validation?.maxLength && strValue.length > column.validation.maxLength) {
      errors.push(`${column.name} must be no more than ${column.validation.maxLength} characters`);
    }

    // Pattern validation
    if (column.validation?.pattern && strValue && !new RegExp(column.validation.pattern).test(strValue)) {
      errors.push(column.validation.messages?.pattern || `${column.name} format is invalid`);
    }

    return {
      valid: errors.length === 0,
      errors,
      transformedValue: value
    };
  }

  destroy(element: HTMLElement): void {
    // Clean up event listeners and references
    this.currentElement = null;
    this.onSaveCallback = null;
  }

  supportsInlineEditing(): boolean {
    return true;
  }

  supportsModalEditing(): boolean {
    return true;
  }

  private isMultilineField(column: EnhancedColumn): boolean {
    const type = column.cellType || column.type || '';
    return ['longtext', 'textarea'].includes(type) ||
           (column.editor?.multiline === true) ||
           (column.editor?.rows && column.editor.rows > 1);
  }

  private applyEditorMetadata(element: HTMLElement, editorMetadata: any): void {
    if (element instanceof HTMLTextAreaElement) {
      if (editorMetadata.rows) {
        element.rows = editorMetadata.rows;
      }
      if (editorMetadata.cols) {
        element.cols = editorMetadata.cols;
      }
    }

    if (editorMetadata.placeholder) {
      element.setAttribute('placeholder', editorMetadata.placeholder);
    }
  }

  private applyValidationMetadata(element: HTMLElement, validationMetadata: any): void {
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      if (validationMetadata.maxLength) {
        element.maxLength = validationMetadata.maxLength;
      }

      if (validationMetadata.pattern && element instanceof HTMLInputElement) {
        element.pattern = validationMetadata.pattern;
      }

      if (validationMetadata.required) {
        element.required = true;
      }
    }
  }

  private handleSave(): void {
    if (this.currentElement && this.onSaveCallback) {
      const value = this.getValue(this.currentElement);
      this.onSaveCallback(value);
    }
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      // For single-line inputs, save on Enter
      if (this.currentElement instanceof HTMLInputElement) {
        event.preventDefault();
        this.handleSave();
      }
    } else if (event.key === 'Escape') {
      // Cancel editing
      event.preventDefault();
      if (this.currentElement) {
        this.currentElement.blur();
      }
    }
  }
}

/**
 * Text Cell Formatter
 */
export class TextFormatter implements CellFormatter {
  format(value: any, column: EnhancedColumn, context?: FormattingContext): string {
    if (value == null) return '';

    const strValue = String(value);

    // Apply capitalization if specified in backend metadata
    if (column.display?.textTransform) {
      switch (column.display.textTransform) {
        case 'uppercase':
          return strValue.toUpperCase();
        case 'lowercase':
          return strValue.toLowerCase();
        case 'capitalize':
          return strValue.charAt(0).toUpperCase() + strValue.slice(1);
      }
    }

    return strValue;
  }

  parse(text: string, column: EnhancedColumn): any {
    return text.trim() === '' ? null : text.trim();
  }

  formatForDisplay(value: any, column: EnhancedColumn): string {
    return this.format(value, column);
  }

  formatForExport(value: any, column: EnhancedColumn): string {
    return value == null ? '' : String(value);
  }
}

/**
 * Text Cell Validator
 */
export class TextValidator implements CellValidator {
  validate(value: any, column: EnhancedColumn): ValidationResult {
    // Reuse the editor's validation logic
    const editor = new TextEditor();
    return editor.validate(value, column);
  }

  getConstraints(column: EnhancedColumn): Record<string, any> {
    const constraints: Record<string, any> = {};

    if (column.validation?.required) {
      constraints.required = true;
    }

    if (column.validation?.minLength) {
      constraints.minLength = column.validation.minLength;
    }

    if (column.validation?.maxLength) {
      constraints.maxLength = column.validation.maxLength;
    }

    if (column.validation?.pattern) {
      constraints.pattern = column.validation.pattern;
    }

    return constraints;
  }
}

/**
 * Text Field Type Definition
 */
export const TextFieldType: VibeGridFieldType = {
  type: 'text',
  category: 'basic',
  renderer: new TextRenderer(),
  editor: new TextEditor(),
  formatter: new TextFormatter(),
  validator: new TextValidator(),
  metadata: {
    supportsSorting: true,
    supportsFiltering: true,
    supportsGrouping: true,
    supportsAggregation: false,
    requiresSpecialEditor: false,
    hasRichDisplay: false,
    supportsValidation: true,
    supportsFormatting: true
  },

  // 🚀 NEW: Simple formatter interface for pre-computation
  getFormatter(): (value: any, rowData?: any, column?: any) => string {
    const formatter = new TextFormatter();
    return (value: any, rowData?: any, column?: any) => {
      return formatter.format(value, column);
    };
  },

  // 🚀 NEW: Optional editor interface
  getEditor(): any {
    return new TextEditor();
  },

  // 🚀 NEW: Interaction policy
  interactionPolicy: {
    defaultAction: 'edit',         // Text fields are for editing
    editTrigger: 'content-click',  // ✅ Click content to edit, click padding to select
    blurPolicy: 'commit'           // Save on blur
  }
};

// Register immediately
fieldLog.info('📝 [FIELD-TEXT] Registering TextFieldType');
fieldTypeRegistry.register('text', TextFieldType);
fieldLog.info('✅ [FIELD-TEXT] TextFieldType registered for: text');