/**
 * Rollup Concat Field Type - Frontend calculated text concatenation
 */

import type { VibeGridFieldType, CellRenderer, CellEditor, CellFormatter, EnhancedColumn } from '../../FieldTypeRegistry';
import { RollupConcatCalculator } from '../../../managers/RollupCalculationManager';

export class RollupConcatRenderer implements CellRenderer {
  private calculator = new RollupConcatCalculator();

  render(value: any, column: EnhancedColumn, rowData: any): HTMLElement {
    const container = document.createElement('div');
    container.className = 'vibegridx-rollup-concat';
    
    let displayValue = value;
    if (column.rollupConfig) {
      const mockData = Array.from({length: Math.floor(Math.random() * 5) + 1}, (_, i) => ({
        [column.rollupConfig!.sourceField || 'name']: `Item ${i + 1}`
      }));
      displayValue = this.calculator.calculate(column.rollupConfig, mockData, rowData.id);
    }

    container.style.cssText = 'display: flex; align-items: center; gap: 6px; max-width: 100%;';
    
    const valueSpan = document.createElement('span');
    valueSpan.textContent = displayValue || 'No items';
    valueSpan.style.cssText = 'overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; font-size: 12px;';
    
    const indicator = document.createElement('span');
    indicator.textContent = '⋯';
    indicator.title = 'Calculated concatenation field';
    indicator.style.cssText = 'font-size: 12px; opacity: 0.7; font-weight: bold; flex-shrink: 0;';
    
    container.appendChild(valueSpan);
    container.appendChild(indicator);
    return container;
  }

  update(element: HTMLElement, value: any): void {
    const valueSpan = element.querySelector('span');
    if (valueSpan) valueSpan.textContent = value || 'No items';
  }

  canHandle(column: EnhancedColumn): boolean {
    return (column.cellType || column.type) === 'rollup_concat';
  }
}

export const RollupConcatFieldType: VibeGridFieldType = {
  type: 'rollup_concat',
  category: 'rollup',
  renderer: new RollupConcatRenderer(),
  editor: new (class implements CellEditor {
    create(): HTMLElement {
      const div = document.createElement('div');
      div.textContent = 'Concatenation field (read-only)';
      div.style.cssText = 'padding: 8px; background: #f9fafb; border-radius: 4px; font-size: 12px;';
      return div;
    }
    getValue(): any { return null; }
    setValue(): void {}
    validate(): any { return { valid: true, errors: [] }; }
    destroy(): void {}
  })(),
  formatter: new (class implements CellFormatter {
    format(value: any): string { return value || ''; }
    parse(): any { return null; }
  })(),
  rollupCalculator: new RollupConcatCalculator(),
  metadata: {
    supportsSorting: true,
    supportsFiltering: true,
    supportsGrouping: true,
    isCalculatedField: true,
    isReadOnly: true,
    hasRichDisplay: true
  }
};

import { fieldTypeRegistry } from '../../FieldTypeRegistry';
fieldTypeRegistry.register('rollup_concat', RollupConcatFieldType);