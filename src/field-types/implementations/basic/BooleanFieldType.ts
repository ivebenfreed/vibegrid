/**
 * Boolean Field Type Implementation
 *
 * Handles boolean field types with proper validation, formatting, and editing.
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
 * Boolean Cell Renderer
 */
export class BooleanRenderer implements CellRenderer {
  render(value: any, column: EnhancedColumn, rowData: any): HTMLElement {
    const container = document.createElement('div');

    // Handle null/undefined values
    if (value == null) {
      container.className = 'vibegridx-cell-empty';
      container.textContent = column.editable === false ? '' : 'Click to edit';
      container.style.opacity = '0.6';
      container.style.fontSize = '12px';
      return container;
    }

    // Determine hover class based on editability
    const hoverClass = column.editable === false ? 'vibegridx-badge-readonly' : 'vibegridx-badge-editable';
    container.className = `vibegridx-boolean-badge ${hoverClass}`;

    // Format value for display
    const boolValue = this.parseBoolean(value);
    const displayValue = this.formatValue(value, column);

    // Create boolean badge
    container.innerHTML = this.createBooleanBadge(displayValue, boolValue);

    // Apply backend display metadata if available
    if (column.display) {
      this.applyDisplayMetadata(container, column.display);
    }

    return container;
  }

  private createBooleanBadge(displayValue: string, boolValue: boolean | null): string {
    // Determine colors based on boolean value
    let backgroundColor = '#f3f4f6';
    let textColor = '#6b7280';
    let icon = '○';

    if (boolValue === true) {
      backgroundColor = '#d1fae5';
      textColor = '#065f46';
      icon = '✓';
    } else if (boolValue === false) {
      backgroundColor = '#fee2e2';
      textColor = '#991b1b';
      icon = '✗';
    }

    return `
      <div style="
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 8px;
        border-radius: 6px;
        font-size: 0.75rem;
        font-weight: 600;
        white-space: nowrap;
        background-color: ${backgroundColor};
        color: ${textColor};
        border: 1px solid ${backgroundColor};
        max-width: 100%;
        min-width: 0;
      ">
        <span style="font-size: 10px; flex-shrink: 0;">${icon}</span>
        <span style="
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          min-width: 0;
          flex: 1;
        ">${displayValue}</span>
      </div>
    `;
  }

  update(element: HTMLElement, value: any, column: EnhancedColumn): void {
    // Clear existing content
    element.className = column.editable === false
      ? 'vibegridx-cell-boolean'
      : 'vibegridx-cell-boolean-editable';

    // Handle empty values
    if (value == null) {
      element.className += ' vibegridx-cell-empty';
      element.textContent = column.editable === false ? '' : 'Click to edit';
      element.style.opacity = '0.6';
      element.style.color = '';
    } else {
      element.textContent = this.formatValue(value, column);
      element.style.opacity = '1';

      // Apply color coding
      const boolValue = this.parseBoolean(value);
      if (boolValue === true) {
        element.style.color = '#059669';
      } else if (boolValue === false) {
        element.style.color = '#dc2626';
      }
    }
  }

  canHandle(column: EnhancedColumn): boolean {
    const type = column.cellType || column.type || '';
    return type === 'boolean';
  }

  private formatValue(value: any, column: EnhancedColumn): string {
    const boolValue = this.parseBoolean(value);

    if (boolValue === null) return '';

    // Check for custom labels from backend metadata
    if (column.display?.trueLabel && column.display?.falseLabel) {
      return boolValue ? column.display.trueLabel : column.display.falseLabel;
    }

    // Default formatting
    return boolValue ? 'Yes' : 'No';
  }

  private parseBoolean(value: any): boolean | null {
    if (value == null) return null;

    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'string') {
      const lowerValue = value.toLowerCase().trim();
      if (['true', 'yes', 'y', '1', 'on'].includes(lowerValue)) {
        return true;
      }
      if (['false', 'no', 'n', '0', 'off'].includes(lowerValue)) {
        return false;
      }
    }

    if (typeof value === 'number') {
      return value !== 0;
    }

    return null;
  }

  private applyDisplayMetadata(element: HTMLElement, displayMetadata: any): void {
    if (displayMetadata.textAlign) {
      element.style.textAlign = displayMetadata.textAlign;
    }

    if (displayMetadata.fontWeight) {
      element.style.fontWeight = displayMetadata.fontWeight;
    }

    if (displayMetadata.trueColor || displayMetadata.falseColor) {
      // Color would be applied based on value in formatValue
    }
  }
}

/**
 * Boolean Cell Editor
 */
export class BooleanEditor implements CellEditor {
  private currentElement: HTMLSelectElement | null = null;
  private onSaveCallback: ((value: any) => void) | null = null;

  create(value: any, column: EnhancedColumn, onSave: (value: any) => void): HTMLElement {
    this.onSaveCallback = onSave;

    // Create a select dropdown for boolean values
    const select = document.createElement('select');
    this.currentElement = select;

    // Set initial value
    const boolValue = this.parseBoolean(value);

    // Apply styling
    select.className = 'vibegridx-boolean-editor';
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
    `;

    // Add options
    this.addOptions(select, column, boolValue);

    // Apply backend editor metadata if available
    if (column.editor) {
      this.applyEditorMetadata(select, column.editor);
    }

    // Event handlers
    select.addEventListener('blur', () => this.handleSave());
    select.addEventListener('keydown', (e) => this.handleKeyDown(e));
    select.addEventListener('change', () => this.handleSave());

    // Auto-focus
    setTimeout(() => select.focus(), 0);

    return select as unknown as HTMLElement;
  }

  getValue(element: HTMLElement): any {
    if (element instanceof HTMLSelectElement) {
      const value = element.value;
      if (value === '') return null;
      return value === 'true';
    }
    return null;
  }

  setValue(element: HTMLElement, value: any): void {
    if (element instanceof HTMLSelectElement) {
      const boolValue = this.parseBoolean(value);
      if (boolValue === null) {
        element.value = '';
      } else {
        element.value = boolValue ? 'true' : 'false';
      }
    }
  }

  validate(value: any, column: EnhancedColumn): ValidationResult {
    const errors: string[] = [];

    // Handle null/empty values
    if (value == null) {
      if (column.validation?.required) {
        errors.push(column.validation.messages?.required || `${column.name} is required`);
      }
      return { valid: errors.length === 0, errors, transformedValue: null };
    }

    const boolValue = this.parseBoolean(value);

    // Check if it's a valid boolean
    if (boolValue === null) {
      errors.push(`${column.name} must be a valid boolean value`);
      return { valid: false, errors, transformedValue: value };
    }

    return {
      valid: errors.length === 0,
      errors,
      transformedValue: boolValue
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

  private parseBoolean(value: any): boolean | null {
    if (value == null) return null;

    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'string') {
      const lowerValue = value.toLowerCase().trim();
      if (['true', 'yes', 'y', '1', 'on'].includes(lowerValue)) {
        return true;
      }
      if (['false', 'no', 'n', '0', 'off'].includes(lowerValue)) {
        return false;
      }
    }

    if (typeof value === 'number') {
      return value !== 0;
    }

    return null;
  }

  private addOptions(select: HTMLSelectElement, column: EnhancedColumn, currentValue: boolean | null): void {
    // Empty option for null value
    const emptyOption = document.createElement('option');
    emptyOption.value = '';
    emptyOption.textContent = '(Select)';
    select.appendChild(emptyOption);

    // True option
    const trueOption = document.createElement('option');
    trueOption.value = 'true';
    trueOption.textContent = column.display?.trueLabel || 'Yes';
    if (currentValue === true) {
      trueOption.selected = true;
    }
    select.appendChild(trueOption);

    // False option
    const falseOption = document.createElement('option');
    falseOption.value = 'false';
    falseOption.textContent = column.display?.falseLabel || 'No';
    if (currentValue === false) {
      falseOption.selected = true;
    }
    select.appendChild(falseOption);
  }

  private applyEditorMetadata(select: HTMLSelectElement, editorMetadata: any): void {
    if (editorMetadata.allowClear === false) {
      // Remove empty option
      const emptyOption = select.querySelector('option[value=""]');
      if (emptyOption) {
        emptyOption.remove();
      }
    }
  }

  private handleSave(): void {
    if (this.currentElement && this.onSaveCallback) {
      const value = this.getValue(this.currentElement as unknown as HTMLElement);
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
 * Boolean Cell Formatter
 */
export class BooleanFormatter implements CellFormatter {
  format(value: any, column: EnhancedColumn, context?: FormattingContext): string {
    const boolValue = this.parseBoolean(value);

    if (boolValue === null) return '';

    // Check for custom labels from backend metadata or context
    const trueLabel = column.display?.trueLabel || context?.trueLabel || 'Yes';
    const falseLabel = column.display?.falseLabel || context?.falseLabel || 'No';

    return boolValue ? trueLabel : falseLabel;
  }

  parse(text: string, column: EnhancedColumn): any {
    if (text.trim() === '') return null;

    const lowerText = text.toLowerCase().trim();

    // Check custom labels first
    if (column.display?.trueLabel && lowerText === column.display.trueLabel.toLowerCase()) {
      return true;
    }
    if (column.display?.falseLabel && lowerText === column.display.falseLabel.toLowerCase()) {
      return false;
    }

    // Standard boolean parsing
    if (['true', 'yes', 'y', '1', 'on'].includes(lowerText)) {
      return true;
    }
    if (['false', 'no', 'n', '0', 'off'].includes(lowerText)) {
      return false;
    }

    return null;
  }

  formatForDisplay(value: any, column: EnhancedColumn): string {
    return this.format(value, column);
  }

  formatForExport(value: any, column: EnhancedColumn): string {
    const boolValue = this.parseBoolean(value);
    if (boolValue === null) return '';
    return boolValue ? 'true' : 'false';
  }

  private parseBoolean(value: any): boolean | null {
    if (value == null) return null;

    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'string') {
      const lowerValue = value.toLowerCase().trim();
      if (['true', 'yes', 'y', '1', 'on'].includes(lowerValue)) {
        return true;
      }
      if (['false', 'no', 'n', '0', 'off'].includes(lowerValue)) {
        return false;
      }
    }

    if (typeof value === 'number') {
      return value !== 0;
    }

    return null;
  }
}

/**
 * Boolean Cell Validator
 */
export class BooleanValidator implements CellValidator {
  validate(value: any, column: EnhancedColumn): ValidationResult {
    const editor = new BooleanEditor();
    return editor.validate(value, column);
  }

  getConstraints(column: EnhancedColumn): Record<string, any> {
    const constraints: Record<string, any> = {};

    if (column.validation?.required) {
      constraints.required = true;
    }

    return constraints;
  }
}

/**
 * Boolean Field Type Definition
 */
export const BooleanFieldType: VibeGridFieldType = {
  type: 'boolean',
  category: 'basic',
  renderer: new BooleanRenderer(),
  editor: new BooleanEditor(),
  formatter: new BooleanFormatter(),
  validator: new BooleanValidator(),
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
  },

  // 🚀 Interaction policy
  interactionPolicy: {
    defaultAction: 'edit',    // Boolean fields toggle on click
    editTrigger: 'click',     // Click anywhere to toggle
    blurPolicy: 'commit'      // Save on blur
  }
};

// Register with the global registry
import { fieldTypeRegistry } from '../../FieldTypeRegistry';
fieldTypeRegistry.register('boolean', BooleanFieldType);