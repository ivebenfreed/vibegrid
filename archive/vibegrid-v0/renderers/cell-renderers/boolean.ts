import type { Column } from '../types';

/**
 * Fast boolean rendering function for table cells
 * Shows checkmark for true, empty for false
 */
export function boolean(value: any, column: Column): string {
  if (value === null || value === undefined) return '';
  
  return value ? '✓' : '';
}