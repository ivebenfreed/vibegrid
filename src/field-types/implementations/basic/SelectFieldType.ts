/**
 * Select Field Type Implementation
 *
 * Handles select, single-select, multi-select, and enum field types with proper validation,
 * formatting, and editing. Integrates with backend Enhanced Field Handler metadata.
 */

import { createLogger } from '@/lib/logging';
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
import { formatFieldForDisplay } from '@/server/dataforge/fields/display-formatters';
import { getOptionIconDisplay } from '../../../utils/icon-mapping';

const fileLog = createLogger('components/custom/vibegrid/field-types/implementations/basic/SelectFieldType');

interface SelectOption {
  value: string;
  label: string;
  color?: string;
  backgroundColor?: string;
  icon?: string;
  group?: string;
  disabled?: boolean;
}

/**
 * Select Cell Renderer
 */
export class SelectRenderer implements CellRenderer {
  render(value: any, column: EnhancedColumn, rowData: any): HTMLElement {
    // 🚀 PERFORMANCE: Removed expensive logging from hot path

    const container = document.createElement('span');
    // Don't set classes here - let BodyRenderer handle the base classes
    // Only add styling that's specific to the badge display

    // Handle null/undefined values
    if (value == null || value === '') {
      container.className = 'vibegridx-cell-empty';
      container.textContent = column.editable === false ? '' : 'Select option';
      container.style.opacity = '0.6';
      container.style.fontSize = '12px';
      return container;
    }

    const fieldType = column.cellType || column.type || 'select';

    // Handle multi-select values
    if (this.isMultiSelect(fieldType) && Array.isArray(value)) {
      return this.renderMultiSelectValue(container, value, column);
    } else {
      return this.renderSingleSelectValue(container, value, column);
    }
  }

  update(element: HTMLElement, value: any, column: EnhancedColumn): void {
    // Clear existing content
    element.innerHTML = '';
    // Don't override classes - preserve what BodyRenderer set

    // Handle empty values
    if (value == null || value === '') {
      element.classList.add('vibegridx-cell-empty');
      element.textContent = column.editable === false ? '' : 'Select option';
      element.style.opacity = '0.6';
      return;
    }

    const fieldType = column.cellType || column.type || 'select';

    // Re-render based on type
    if (this.isMultiSelect(fieldType) && Array.isArray(value)) {
      this.renderMultiSelectValue(element, value, column);
    } else {
      this.renderSingleSelectValue(element, value, column);
    }
    element.style.opacity = '1';
  }

  canHandle(column: EnhancedColumn): boolean {
    const type = column.cellType || column.type || '';
    return ['select', 'single-select', 'multi-select', 'enum', 'custom_option_reference', 'status'].includes(type);
  }

  private renderSingleSelectValue(container: HTMLElement, value: any, column: EnhancedColumn): HTMLElement {
    const option = this.findOption(value, column);

    if (option) {
      // Add hover class for dropdown indicator (editable badges get larger scale)
      const hoverClass = column.editable !== false ? 'vibegridx-badge-dropdown' : 'vibegridx-badge-readonly';
      container.className = `vibegridx-enum-badge ${hoverClass}`;

      // Apply badge styling directly to container instead of creating nested element
      container.textContent = option.label;
      container.style.cssText = `
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
      `;

      if (option.icon) {
        const iconSymbol = getOptionIconDisplay(option.icon);
        if (iconSymbol) {
          const icon = document.createElement('span');
          icon.textContent = iconSymbol;
          icon.style.fontSize = '10px';
          container.insertBefore(icon, container.firstChild);
        }
      }
    } else {
      // Unknown value
      container.textContent = String(value);
      container.style.fontStyle = 'italic';
      container.style.opacity = '0.7';
    }

    return container;
  }

  private renderMultiSelectValue(container: HTMLElement, values: any[], column: EnhancedColumn): HTMLElement {
    container.style.cssText = `
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      align-items: center;
    `;

    if (values.length === 0) {
      container.textContent = 'No selection';
      container.style.opacity = '0.6';
      return container;
    }

    values.forEach(value => {
      const option = this.findOption(value, column);
      if (option) {
        const badge = this.createOptionBadge(option);
        badge.style.fontSize = '11px'; // Smaller for multi-select
        container.appendChild(badge);
      } else {
        const unknownBadge = this.createOptionBadge({
          value: String(value),
          label: String(value)
        });
        unknownBadge.style.opacity = '0.7';
        unknownBadge.style.fontStyle = 'italic';
        container.appendChild(unknownBadge);
      }
    });

    return container;
  }

  private createOptionBadge(option: SelectOption): HTMLElement {
    const badge = document.createElement('span');
    badge.className = 'vibegridx-select-badge';
    badge.textContent = option.label;

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
    `;

    if (option.icon) {
      const iconSymbol = getOptionIconDisplay(option.icon);
      if (iconSymbol) {
        const icon = document.createElement('span');
        icon.textContent = iconSymbol;
        icon.style.fontSize = '10px';
        badge.insertBefore(icon, badge.firstChild);
      }
    }

    return badge;
  }

  private findOption(value: any, column: EnhancedColumn): SelectOption | null {
    const stringValue = String(value);

    // 🚀 PERFORMANCE: Removed expensive console logging from hot path

    // Use schema data
    const options = this.getOptions(column);
    const found = options.find(opt => opt.value === stringValue);

    return found || null;
  }

  private getOptions(column: EnhancedColumn): SelectOption[] {
    // Priority: column.options > validation.enum > editor.options > default
    if (column.options && Array.isArray(column.options)) {
      return column.options.map(opt =>
        typeof opt === 'string' ? { value: opt, label: opt } : opt
      );
    }

    if (column.validation?.enum && Array.isArray(column.validation.enum)) {
      return column.validation.enum.map(val => ({ value: String(val), label: String(val) }));
    }

    if (column.editor?.options && Array.isArray(column.editor.options)) {
      return column.editor.options.map(opt =>
        typeof opt === 'string' ? { value: opt, label: opt } : opt
      );
    }


    return [];
  }

  private isMultiSelect(fieldType: string): boolean {
    return fieldType === 'multi-select';
  }
}

/**
 * Select Cell Editor
 */
export class SelectEditor implements CellEditor {
  private currentElement: HTMLElement | null = null;
  private onSaveCallback: ((value: any) => void) | null = null;

  create(value: any, column: EnhancedColumn, onSave: (value: any) => void): HTMLElement {
    this.onSaveCallback = onSave;

    const fieldType = column.cellType || column.type || 'select';

    if (this.isMultiSelect(fieldType)) {
      return this.createMultiSelectEditor(value, column);
    } else {
      return this.createSingleSelectEditor(value, column);
    }
  }

  getValue(element: HTMLElement): any {
    if (element instanceof HTMLSelectElement) {
      if (element.multiple) {
        const selectedOptions = Array.from(element.selectedOptions);
        return selectedOptions.map(opt => opt.value);
      } else {
        return element.value === '' ? null : element.value;
      }
    }
    return null;
  }

  setValue(element: HTMLElement, value: any): void {
    if (element instanceof HTMLSelectElement) {
      if (element.multiple && Array.isArray(value)) {
        Array.from(element.options).forEach(option => {
          option.selected = value.includes(option.value);
        });
      } else {
        element.value = value == null ? '' : String(value);
      }
    }
  }

  validate(value: any, column: EnhancedColumn): ValidationResult {
    const errors: string[] = [];
    const fieldType = column.cellType || column.type || 'select';

    // Handle null/empty values
    if (value == null || value === '' || (Array.isArray(value) && value.length === 0)) {
      if (column.validation?.required) {
        errors.push(column.validation.messages?.required || `${column.name} is required`);
      }
      return { valid: errors.length === 0, errors, transformedValue: value };
    }

    const options = this.getOptions(column);
    const optionValues = options.map(opt => opt.value);

    if (this.isMultiSelect(fieldType)) {
      if (!Array.isArray(value)) {
        errors.push(`${column.name} must be an array for multi-select`);
        return { valid: false, errors, transformedValue: value };
      }

      // Check each value is valid
      const invalidValues = value.filter(val => !optionValues.includes(String(val)));
      if (invalidValues.length > 0) {
        errors.push(`${column.name} contains invalid options: ${invalidValues.join(', ')}`);
      }
    } else {
      // Single select validation
      if (!optionValues.includes(String(value))) {
        errors.push(`${column.name} must be one of: ${optionValues.join(', ')}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      transformedValue: value
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
    return true; // For complex multi-select scenarios
  }

  private createSingleSelectEditor(value: any, column: EnhancedColumn): HTMLElement {
    const select = document.createElement('select');
    this.currentElement = select;

    // Apply styling
    select.className = 'vibegridx-select-editor';
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
    this.addOptions(select, column, value);

    // Event handlers
    select.addEventListener('blur', () => this.handleSave());
    select.addEventListener('keydown', (e) => this.handleKeyDown(e));
    select.addEventListener('change', () => this.handleSave());

    // Auto-focus
    setTimeout(() => select.focus(), 0);

    return select;
  }

  private createMultiSelectEditor(value: any, column: EnhancedColumn): HTMLElement {
    const select = document.createElement('select');
    select.multiple = true;
    this.currentElement = select;

    // Apply styling
    select.className = 'vibegridx-multiselect-editor';
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
    `;

    // Add options
    this.addOptions(select, column, value);

    // Event handlers
    select.addEventListener('blur', () => this.handleSave());
    select.addEventListener('keydown', (e) => this.handleKeyDown(e));

    // Auto-focus
    setTimeout(() => select.focus(), 0);

    return select;
  }

  private addOptions(select: HTMLSelectElement, column: EnhancedColumn, currentValue: any): void {
    const options = this.getOptions(column);

    // Add empty option for single select (unless required)
    if (!select.multiple && !column.validation?.required) {
      const emptyOption = document.createElement('option');
      emptyOption.value = '';
      emptyOption.textContent = '(Select option)';
      select.appendChild(emptyOption);
    }

    // Add all options
    options.forEach(option => {
      const optionElement = document.createElement('option');
      optionElement.value = option.value;
      optionElement.textContent = option.label;

      if (option.disabled) {
        optionElement.disabled = true;
      }

      // Set selected state
      if (select.multiple && Array.isArray(currentValue)) {
        optionElement.selected = currentValue.includes(option.value);
      } else {
        optionElement.selected = String(currentValue) === option.value;
      }

      select.appendChild(optionElement);
    });
  }

  private getOptions(column: EnhancedColumn): SelectOption[] {
    // Same logic as renderer
    if (column.options && Array.isArray(column.options)) {
      return column.options.map(opt =>
        typeof opt === 'string' ? { value: opt, label: opt } : opt
      );
    }

    if (column.validation?.enum && Array.isArray(column.validation.enum)) {
      return column.validation.enum.map(val => ({ value: String(val), label: String(val) }));
    }

    if (column.editor?.options && Array.isArray(column.editor.options)) {
      return column.editor.options.map(opt =>
        typeof opt === 'string' ? { value: opt, label: opt } : opt
      );
    }

    return [];
  }

  private isMultiSelect(fieldType: string): boolean {
    return fieldType === 'multi-select';
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
 * Select Cell Formatter
 */
export class SelectFormatter implements CellFormatter {
  format(value: any, column: EnhancedColumn, context?: FormattingContext): string {
    if (value == null) return '';

    const fieldType = column.cellType || column.type || 'select';

    if (this.isMultiSelect(fieldType) && Array.isArray(value)) {
      return this.formatMultiSelectValue(value, column);
    } else {
      return this.formatSingleSelectValue(value, column);
    }
  }

  parse(text: string, column: EnhancedColumn): any {
    if (text.trim() === '') return null;

    const fieldType = column.cellType || column.type || 'select';

    if (this.isMultiSelect(fieldType)) {
      // Parse comma-separated values
      return text.split(',').map(val => val.trim()).filter(val => val);
    } else {
      return text.trim();
    }
  }

  formatForDisplay(value: any, column: EnhancedColumn): string {
    return this.format(value, column);
  }

  formatForExport(value: any, column: EnhancedColumn): string {
    if (value == null) return '';

    if (Array.isArray(value)) {
      return value.join(', ');
    }

    return String(value);
  }

  private formatSingleSelectValue(value: any, column: EnhancedColumn): string {
    const option = this.findOption(value, column);
    return option ? option.label : String(value);
  }

  private formatMultiSelectValue(values: any[], column: EnhancedColumn): string {
    if (values.length === 0) return '';

    const labels = values.map(value => {
      const option = this.findOption(value, column);
      return option ? option.label : String(value);
    });

    return labels.join(', ');
  }

  private findOption(value: any, column: EnhancedColumn): SelectOption | null {
    const options = this.getOptions(column);
    return options.find(opt => opt.value === String(value)) || null;
  }

  private getOptions(column: EnhancedColumn): SelectOption[] {
    if (column.options && Array.isArray(column.options)) {
      return column.options.map(opt =>
        typeof opt === 'string' ? { value: opt, label: opt } : opt
      );
    }

    if (column.validation?.enum && Array.isArray(column.validation.enum)) {
      return column.validation.enum.map(val => ({ value: String(val), label: String(val) }));
    }

    if (column.editor?.options && Array.isArray(column.editor.options)) {
      return column.editor.options.map(opt =>
        typeof opt === 'string' ? { value: opt, label: opt } : opt
      );
    }

    return [];
  }

  private isMultiSelect(fieldType: string): boolean {
    return fieldType === 'multi-select';
  }
}

/**
 * Select Cell Validator
 */
export class SelectValidator implements CellValidator {
  validate(value: any, column: EnhancedColumn): ValidationResult {
    const editor = new SelectEditor();
    return editor.validate(value, column);
  }

  getConstraints(column: EnhancedColumn): Record<string, any> {
    const constraints: Record<string, any> = {};

    if (column.validation?.required) {
      constraints.required = true;
    }

    const options = this.getOptions(column);
    if (options.length > 0) {
      constraints.enum = options.map(opt => opt.value);
    }

    return constraints;
  }

  private getOptions(column: EnhancedColumn): SelectOption[] {
    if (column.options && Array.isArray(column.options)) {
      return column.options.map(opt =>
        typeof opt === 'string' ? { value: opt, label: opt } : opt
      );
    }

    if (column.validation?.enum && Array.isArray(column.validation.enum)) {
      return column.validation.enum.map(val => ({ value: String(val), label: String(val) }));
    }

    return [];
  }
}

/**
 * Select Field Type Definition
 */
export const SelectFieldType: VibeGridFieldType = {
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
    supportsFormatting: true
  },

  // 🚀 NEW: Simple formatter interface for pre-computation
  getFormatter(): (value: any, rowData?: any, column?: any) => string {
    const formatter = new SelectFormatter();
    return (value: any, rowData?: any, column?: any) => {
      if (!column) return String(value || '');

      // Use reactive options from schema store if available
      if (column.fieldId && typeof window !== 'undefined' && (window as any).schemaStore) {
        try {
          const options = (window as any).schemaStore.getFieldOptions(column.fieldId);
          if (options && Array.isArray(options)) {
            // Create temporary column with reactive options
            const tempColumn = { ...column, options };
            return formatter.format(value, tempColumn);
          }
        } catch (error) {
          // Fallback to column options
        }
      }

      return formatter.format(value, column);
    };
  },

  // 🚀 NEW: Optional editor interface
  getEditor(): any {
    return new SelectEditor();
  }
};

// Register immediately
fieldTypeRegistry.register('select', SelectFieldType);
fieldTypeRegistry.register('single-select', SelectFieldType);
fieldTypeRegistry.register('multi-select', SelectFieldType);
fieldTypeRegistry.register('enum', SelectFieldType);
fieldTypeRegistry.register('custom_select', SelectFieldType);
fieldTypeRegistry.register('custom_option_reference', SelectFieldType);
fieldTypeRegistry.register('status', SelectFieldType);