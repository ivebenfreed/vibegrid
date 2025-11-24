/**
 * Color Field Type Implementation
 *
 * Handles color field types with hex, RGB, HSL, and named color support.
 * Provides color preview and picker functionality.
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
 * Color Cell Renderer
 */
export class ColorRenderer implements CellRenderer {
  render(value: any, column: EnhancedColumn, rowData: any): HTMLElement {
    const container = document.createElement('div');
    container.className = column.editable === false
      ? 'vibegridx-cell-color'
      : 'vibegridx-cell-color-editable';

    container.style.cssText = `
      display: flex;
      align-items: center;
      gap: 6px;
      height: 100%;
    `;

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

    // Create color preview swatch
    const swatch = document.createElement('div');
    swatch.className = 'vibegridx-color-swatch';
    const colorValue = this.normalizeColor(value);

    swatch.style.cssText = `
      width: 16px;
      height: 16px;
      border-radius: 3px;
      border: 1px solid #d1d5db;
      background-color: ${colorValue};
      flex-shrink: 0;
    `;

    // Create color text
    const textSpan = document.createElement('span');
    textSpan.className = 'vibegridx-color-text';
    textSpan.textContent = this.formatValue(value, column);
    textSpan.style.cssText = `
      font-family: monospace;
      font-size: 12px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    `;

    container.appendChild(swatch);
    container.appendChild(textSpan);

    // Apply backend display metadata if available
    if (column.display) {
      this.applyDisplayMetadata(container, swatch, column.display);
    }

    return container;
  }

  update(element: HTMLElement, value: any, column: EnhancedColumn): void {
    element.className = column.editable === false
      ? 'vibegridx-cell-color'
      : 'vibegridx-cell-color-editable';

    element.innerHTML = '';

    // Handle empty values with consistent empty state
    if (value == null || value === '') {
      if (column.editable === false) {
        element.className = 'vibegridx-cell-empty';
        element.textContent = '';
      } else {
        element.className = 'vibegridx-cell-empty vibegridx-text-editable';
        element.innerHTML = '<span style="opacity: 0.6;">Edit ✏️</span>';
      }
    } else {
      // Re-create swatch and text
      const swatch = document.createElement('div');
      swatch.className = 'vibegridx-color-swatch';
      const colorValue = this.normalizeColor(value);

      swatch.style.cssText = `
        width: 16px;
        height: 16px;
        border-radius: 3px;
        border: 1px solid #d1d5db;
        background-color: ${colorValue};
        flex-shrink: 0;
      `;

      const textSpan = document.createElement('span');
      textSpan.className = 'vibegridx-color-text';
      textSpan.textContent = this.formatValue(value, column);
      textSpan.style.cssText = `
        font-family: monospace;
        font-size: 12px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      `;

      element.appendChild(swatch);
      element.appendChild(textSpan);
    }
  }

  canHandle(column: EnhancedColumn): boolean {
    const type = column.cellType || column.type || '';
    return (type as string) === 'color';
  }

  private formatValue(value: any, column: EnhancedColumn): string {
    if (value == null) return '';

    const colorValue = String(value).trim();

    // Return normalized color for consistent display
    return this.normalizeColor(colorValue);
  }

  private normalizeColor(color: string): string {
    if (!color) return '#000000';

    const trimmed = color.trim();

    // If it's already a valid hex color
    if (/^#[0-9A-Fa-f]{6}$/.test(trimmed)) {
      return trimmed.toUpperCase();
    }

    // If it's a 3-digit hex, expand it
    if (/^#[0-9A-Fa-f]{3}$/.test(trimmed)) {
      return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`.toUpperCase();
    }

    // If it's hex without #, add it
    if (/^[0-9A-Fa-f]{6}$/.test(trimmed)) {
      return `#${trimmed.toUpperCase()}`;
    }

    if (/^[0-9A-Fa-f]{3}$/.test(trimmed)) {
      return `#${trimmed[0]}${trimmed[0]}${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}`.toUpperCase();
    }

    // RGB format
    const rgbMatch = trimmed.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i);
    if (rgbMatch) {
      const r = parseInt(rgbMatch[1], 10);
      const g = parseInt(rgbMatch[2], 10);
      const b = parseInt(rgbMatch[3], 10);
      return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`.toUpperCase();
    }

    // Named colors (basic set)
    const namedColors: Record<string, string> = {
      red: '#FF0000', green: '#008000', blue: '#0000FF', black: '#000000', white: '#FFFFFF',
      yellow: '#FFFF00', cyan: '#00FFFF', magenta: '#FF00FF', orange: '#FFA500', purple: '#800080',
      pink: '#FFC0CB', brown: '#A52A2A', gray: '#808080', grey: '#808080'
    };

    const namedColor = namedColors[trimmed.toLowerCase()];
    if (namedColor) {
      return namedColor;
    }

    // Fallback to black for invalid colors
    return '#000000';
  }

  private applyDisplayMetadata(container: HTMLElement, swatch: HTMLElement, displayMetadata: any): void {
    if (displayMetadata.showColorPreview === false) {
      swatch.style.display = 'none';
    }

    if (displayMetadata.swatchSize) {
      swatch.style.width = `${displayMetadata.swatchSize}px`;
      swatch.style.height = `${displayMetadata.swatchSize}px`;
    }
  }
}

/**
 * Color Cell Editor
 */
export class ColorEditor implements CellEditor {
  private currentElement: HTMLElement | null = null;
  private onSaveCallback: ((value: any) => void) | null = null;

  create(value: any, column: EnhancedColumn, onSave: (value: any) => void): HTMLElement {
    this.onSaveCallback = onSave;

    const container = document.createElement('div');
    container.className = 'vibegridx-color-editor';
    container.style.cssText = `
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      gap: 4px;
    `;

    // Color picker input
    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.className = 'vibegridx-color-picker';
    colorInput.style.cssText = `
      width: 32px;
      height: 24px;
      border: none;
      border-radius: 3px;
      cursor: pointer;
      padding: 0;
    `;

    // Text input for manual entry
    const textInput = document.createElement('input');
    textInput.type = 'text';
    textInput.className = 'vibegridx-color-text-input';
    textInput.placeholder = '#FFFFFF';
    textInput.style.cssText = `
      flex: 1;
      height: 100%;
      border: none;
      outline: none;
      background: transparent;
      font-family: monospace;
      font-size: 12px;
      padding: 0;
      margin: 0;
    `;

    this.currentElement = container;

    // Set initial values
    const normalizedColor = this.normalizeColor(value);
    colorInput.value = normalizedColor;
    textInput.value = normalizedColor;

    // Sync color picker and text input
    colorInput.addEventListener('input', () => {
      textInput.value = colorInput.value.toUpperCase();
    });

    textInput.addEventListener('input', () => {
      const normalized = this.normalizeColor(textInput.value);
      if (this.isValidHexColor(normalized)) {
        colorInput.value = normalized;
      }
    });

    // Event handlers
    colorInput.addEventListener('blur', () => this.handleSave());
    textInput.addEventListener('blur', () => this.handleSave());
    textInput.addEventListener('keydown', (e) => this.handleKeyDown(e));

    container.appendChild(colorInput);
    container.appendChild(textInput);

    // Auto-focus text input
    setTimeout(() => textInput.focus(), 0);

    return container;
  }

  getValue(element: HTMLElement): any {
    const textInput = element.querySelector('.vibegridx-color-text-input') as HTMLInputElement;
    if (textInput) {
      const value = textInput.value.trim();
      return value === '' ? null : value;
    }
    return null;
  }

  setValue(element: HTMLElement, value: any): void {
    const colorInput = element.querySelector('.vibegridx-color-picker') as HTMLInputElement;
    const textInput = element.querySelector('.vibegridx-color-text-input') as HTMLInputElement;

    const normalizedColor = this.normalizeColor(value);

    if (colorInput) colorInput.value = normalizedColor;
    if (textInput) textInput.value = normalizedColor;
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

    const colorValue = String(value).trim();

    // Validate color format
    if (!this.isValidColor(colorValue)) {
      errors.push(`${column.name} must be a valid color (hex, rgb, hsl, or named color)`);
    }

    // Check allowed formats (if specified in backend)
    if (column.validation?.colorFormats && Array.isArray(column.validation.colorFormats)) {
      const format = this.detectColorFormat(colorValue);
      if (!column.validation.colorFormats.includes(format)) {
        errors.push(`${column.name} must use an allowed format: ${column.validation.colorFormats.join(', ')}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      transformedValue: this.normalizeColor(colorValue)
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
    return true;
  }

  private normalizeColor(color: any): string {
    if (!color) return '#000000';

    const trimmed = String(color).trim();

    // If it's already a valid hex color
    if (/^#[0-9A-Fa-f]{6}$/.test(trimmed)) {
      return trimmed.toUpperCase();
    }

    // If it's a 3-digit hex, expand it
    if (/^#[0-9A-Fa-f]{3}$/.test(trimmed)) {
      return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`.toUpperCase();
    }

    // If it's hex without #, add it
    if (/^[0-9A-Fa-f]{6}$/.test(trimmed)) {
      return `#${trimmed.toUpperCase()}`;
    }

    if (/^[0-9A-Fa-f]{3}$/.test(trimmed)) {
      return `#${trimmed[0]}${trimmed[0]}${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}`.toUpperCase();
    }

    // Convert RGB to hex
    const rgbMatch = trimmed.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i);
    if (rgbMatch) {
      const r = parseInt(rgbMatch[1], 10);
      const g = parseInt(rgbMatch[2], 10);
      const b = parseInt(rgbMatch[3], 10);
      return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`.toUpperCase();
    }

    // Named colors
    const namedColors: Record<string, string> = {
      red: '#FF0000', green: '#008000', blue: '#0000FF', black: '#000000', white: '#FFFFFF',
      yellow: '#FFFF00', cyan: '#00FFFF', magenta: '#FF00FF', orange: '#FFA500', purple: '#800080',
      pink: '#FFC0CB', brown: '#A52A2A', gray: '#808080', grey: '#808080'
    };

    const namedColor = namedColors[trimmed.toLowerCase()];
    if (namedColor) {
      return namedColor;
    }

    return '#000000';
  }

  private isValidColor(color: string): boolean {
    const trimmed = color.trim();

    // Hex colors
    if (/^#?[0-9A-Fa-f]{3}$/.test(trimmed) || /^#?[0-9A-Fa-f]{6}$/.test(trimmed)) {
      return true;
    }

    // RGB format
    if (/^rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)$/i.test(trimmed)) {
      return true;
    }

    // HSL format
    if (/^hsl\(\s*\d+\s*,\s*\d+%\s*,\s*\d+%\s*\)$/i.test(trimmed)) {
      return true;
    }

    // Named colors
    const namedColors = ['red', 'green', 'blue', 'black', 'white', 'yellow', 'cyan', 'magenta', 'orange', 'purple', 'pink', 'brown', 'gray', 'grey'];
    if (namedColors.includes(trimmed.toLowerCase())) {
      return true;
    }

    return false;
  }

  private isValidHexColor(color: string): boolean {
    return /^#[0-9A-Fa-f]{6}$/.test(color);
  }

  private detectColorFormat(color: string): string {
    const trimmed = color.trim();

    if (/^#?[0-9A-Fa-f]{3,6}$/.test(trimmed)) return 'hex';
    if (/^rgb\(/i.test(trimmed)) return 'rgb';
    if (/^hsl\(/i.test(trimmed)) return 'hsl';
    return 'named';
  }

  private applyDisplayMetadata(container: HTMLElement, swatch: HTMLElement, displayMetadata: any): void {
    if (displayMetadata.showColorPreview === false) {
      swatch.style.display = 'none';
    }

    if (displayMetadata.swatchSize) {
      swatch.style.width = `${displayMetadata.swatchSize}px`;
      swatch.style.height = `${displayMetadata.swatchSize}px`;
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
        const textInput = this.currentElement.querySelector('.vibegridx-color-text-input') as HTMLInputElement;
        if (textInput) textInput.blur();
      }
    }
  }
}

/**
 * Color Cell Formatter
 */
export class ColorFormatter implements CellFormatter {
  format(value: any, column: EnhancedColumn, context?: FormattingContext): string {
    if (value == null) return '';

    const colorValue = String(value).trim();
    const outputFormat = context?.colorFormat || column.display?.colorFormat || 'hex';

    const normalizedHex = this.normalizeColor(colorValue);

    switch (outputFormat) {
      case 'rgb':
        return this.hexToRgb(normalizedHex);
      case 'hsl':
        return this.hexToHsl(normalizedHex);
      case 'hex':
      default:
        return normalizedHex;
    }
  }

  parse(text: string, column: EnhancedColumn): any {
    if (text.trim() === '') return null;
    return this.normalizeColor(text);
  }

  formatForDisplay(value: any, column: EnhancedColumn): string {
    return this.format(value, column);
  }

  formatForExport(value: any, column: EnhancedColumn): string {
    return value == null ? '' : this.normalizeColor(value);
  }

  private normalizeColor(color: any): string {
    // Same normalization logic as renderer
    if (!color) return '#000000';

    const trimmed = String(color).trim();

    if (/^#[0-9A-Fa-f]{6}$/.test(trimmed)) {
      return trimmed.toUpperCase();
    }

    if (/^#[0-9A-Fa-f]{3}$/.test(trimmed)) {
      return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`.toUpperCase();
    }

    if (/^[0-9A-Fa-f]{6}$/.test(trimmed)) {
      return `#${trimmed.toUpperCase()}`;
    }

    return '#000000';
  }

  private hexToRgb(hex: string): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgb(${r}, ${g}, ${b})`;
  }

  private hexToHsl(hex: string): string {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;

    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }

    return `hsl(${Math.round(h * 360)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;
  }
}

/**
 * Color Cell Validator
 */
export class ColorValidator implements CellValidator {
  validate(value: any, column: EnhancedColumn): ValidationResult {
    const editor = new ColorEditor();
    return editor.validate(value, column);
  }

  getConstraints(column: EnhancedColumn): Record<string, any> {
    const constraints: Record<string, any> = {};

    if (column.validation?.required) {
      constraints.required = true;
    }

    constraints.format = 'color';
    constraints.supportedFormats = ['hex', 'rgb', 'hsl', 'named'];

    if (column.validation?.colorFormats) {
      constraints.allowedFormats = column.validation.colorFormats;
    }

    return constraints;
  }
}

/**
 * Color Field Type Definition
 */
export const ColorFieldType: VibeGridFieldType = {
  type: 'color',
  category: 'basic',
  renderer: new ColorRenderer(),
  editor: new ColorEditor(),
  formatter: new ColorFormatter(),
  validator: new ColorValidator(),
  metadata: {
    supportsSorting: true,
    supportsFiltering: true,
    supportsGrouping: true,
    supportsAggregation: false,
    requiresSpecialEditor: true,
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
fieldTypeRegistry.register('color', ColorFieldType);