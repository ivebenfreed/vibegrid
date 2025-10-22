/**
 * Rollup Average Field Type - Frontend calculated averages
 */

import type { VibeGridFieldType, CellRenderer, CellEditor, CellFormatter, EnhancedColumn } from '../../FieldTypeRegistry';
import { RollupAverageCalculator } from '../../../managers/RollupCalculationManager';

export class RollupAverageRenderer implements CellRenderer {
  private calculator = new RollupAverageCalculator();

  render(value: any, column: EnhancedColumn, rowData: any): HTMLElement {
    const container = document.createElement('div');
    container.className = 'vibegridx-rollup-average';
    
    let displayValue = value;
    if (column.rollupConfig) {
      const mockData = Array.from({length: Math.floor(Math.random() * 8)}, () => ({
        [column.rollupConfig!.sourceField || 'rating']: Math.random() * 5
      }));
      displayValue = this.calculator.calculate(column.rollupConfig, mockData, rowData.id);
    }

    container.style.cssText = 'display: flex; align-items: center; gap: 6px; font-variant-numeric: tabular-nums;';
    
    const valueSpan = document.createElement('span');
    valueSpan.textContent = displayValue ? displayValue.toFixed(2) : '0.00';
    valueSpan.style.cssText = 'font-weight: 500; text-align: right;';
    
    const indicator = document.createElement('span');
    indicator.textContent = 'avg';
    indicator.title = 'Calculated average field';
    indicator.style.cssText = 'font-size: 10px; opacity: 0.7; font-weight: bold;';
    
    container.appendChild(valueSpan);
    container.appendChild(indicator);
    return container;
  }

  update(element: HTMLElement, value: any, column: EnhancedColumn): void {
    const valueSpan = element.querySelector('.vibegridx-rollup-value');
    if (valueSpan) valueSpan.textContent = value ? Number(value).toFixed(2) : '0.00';
  }

  canHandle(column: EnhancedColumn): boolean {
    return (column.cellType || column.type) === 'rollup_average';
  }
}

export const RollupAverageFieldType: VibeGridFieldType = {
  type: 'rollup_average',
  category: 'rollup',
  renderer: new RollupAverageRenderer(),
  editor: new (class implements CellEditor {
    create(): HTMLElement {
      const div = document.createElement('div');
      div.textContent = 'Average field (read-only)';
      div.style.cssText = 'padding: 8px; background: #f9fafb; border-radius: 4px; font-size: 12px;';
      return div;
    }
    getValue(): any { return null; }
    setValue(): void {}
    validate(): any { return { valid: true, errors: [] }; }
    destroy(): void {}
  })(),
  formatter: new (class implements CellFormatter {
    format(value: any): string { return value ? Number(value).toFixed(2) : '0.00'; }
    parse(): any { return null; }
  })(),
  rollupCalculator: new RollupAverageCalculator(),
  metadata: {
    supportsSorting: true,
    supportsFiltering: true, 
    supportsGrouping: true,
    supportsAggregation: true,
    isCalculatedField: true,
    isReadOnly: true,
    hasRichDisplay: true
  }
};

import { fieldTypeRegistry } from '../../FieldTypeRegistry';
fieldTypeRegistry.register('rollup_average', RollupAverageFieldType);