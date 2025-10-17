/**
 * Computed field cell renderers
 */

import type { Column } from '../../column-types';

export function computedExpression(value: any, column: Column): string {
  if (value === null || value === undefined) {
    return '';
  }
  
  // Computed expressions return calculated values
  const computed = Number(value);
  if (!isNaN(computed)) {
    // Format numeric results
    return computed % 1 === 0 ? computed.toString() : computed.toFixed(2);
  }
  
  // Handle non-numeric computed results
  return String(value);
}

export function computedFormula(value: any, column: Column): string {
  if (value === null || value === undefined) {
    return '';
  }
  
  // Computed formulas can return various types
  const computed = Number(value);
  if (!isNaN(computed)) {
    // Format numeric results with appropriate precision
    return computed % 1 === 0 ? computed.toString() : computed.toFixed(2);
  }
  
  // Handle non-numeric formula results (strings, booleans, etc.)
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }
  
  return String(value);
}