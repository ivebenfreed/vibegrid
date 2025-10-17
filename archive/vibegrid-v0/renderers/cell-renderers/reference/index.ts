/**
 * Reference cell renderers for system and custom option fields
 */

import type { Column } from '../../../column-types';

/**
 * Fast renderer for reference-select fields (single option)
 */
export function referenceSelect(value: string | null, column: Column): string {
  if (!value) return '';
  
  // For system references, we need to resolve the option
  if (column.referenceType === 'system' && column.systemOptionType && column.systemArchetype) {
    // This is a fast renderer - we can't use hooks here
    // Return the raw value for now, full rendering happens in the React component
    return value;
  }
  
  // For custom references
  if (column.referenceType === 'custom' && column.customOptionSet) {
    return value;
  }
  
  return value || '';
}

/**
 * Fast renderer for reference-multi fields (multiple options)
 */
export function referenceMulti(value: string[] | null, column: Column): string {
  if (!value || !Array.isArray(value) || value.length === 0) return '';
  
  // For fast rendering, just join the values
  return value.join(', ');
}

// Export React components from separate file
export { ReferenceSelectCell, ReferenceMultiCell } from './components';