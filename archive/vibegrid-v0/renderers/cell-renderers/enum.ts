import type { Column } from '../types';
import { log } from '@/logger';
const fileLog = log('components/custom/vibegrid/renderers/cell-renderers/enum.ts');

/**
 * Fast enum rendering function for table cells
 * Generates badge HTML with proper null state handling
 */
export function enumValue(value: any, column: Column): string {
  // Handle null/undefined with proper empty state
  if (value === null || value === undefined) {
    return `<div class="vibegridx-cell-empty-state">
      <svg class="h-3 w-3 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
      </svg>
      <span class="text-xs text-muted-foreground">None</span>
    </div>`;
  }
  
  // Column must have options configured - no fallbacks
  if (!column.options || !Array.isArray(column.options)) {
    fileLog.warn(`[enumValue] Column ${column.id} is type 'enum' but missing options array`);
    return String(value);
  }
  
  // Find the option from column configuration
  const option = column.options.find(opt => {
    if (typeof opt === 'string') return opt === value;
    return opt.value === value;
  });
  
  if (!option) {
    fileLog.warn(`[enumValue] Value '${value}' not found in column ${column.id} options`);
    return String(value);
  }
  
  // Extract label and styling
  const label = typeof option === 'string' ? option : option.label;
  const cssClass = typeof option === 'string' 
    ? `vibegridx-enum-badge-${String(value).toLowerCase().replace(/[^a-z0-9]/g, '-')}`
    : (option.cssClass || `vibegridx-enum-badge-${String(value).toLowerCase().replace(/[^a-z0-9]/g, '-')}`);
  
  return `<span class="vibegridx-enum-badge ${cssClass}">${label}</span>`;
}