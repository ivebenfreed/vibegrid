/**
 * Rollup cell renderers for computed aggregation fields
 */

import type { Column } from '../../column-types';

export function rollupCount(value: any, column: Column): string {
  if (value === null || value === undefined) {
    return '0';
  }
  
  const count = Number(value);
  if (isNaN(count)) {
    return '0';
  }
  
  return count.toString();
}

export function rollupSum(value: any, column: Column): string {
  if (value === null || value === undefined) {
    return '0';
  }
  
  const sum = Number(value);
  if (isNaN(sum)) {
    return '0';
  }
  
  // Format with appropriate decimal places
  return sum % 1 === 0 ? sum.toString() : sum.toFixed(2);
}

export function rollupAverage(value: any, column: Column): string {
  if (value === null || value === undefined) {
    return '0';
  }
  
  const average = Number(value);
  if (isNaN(average)) {
    return '0';
  }
  
  // Always show 2 decimal places for averages
  return average.toFixed(2);
}

export function rollupConcat(value: any, column: Column): string {
  if (value === null || value === undefined || value === '') {
    return '';
  }
  
  return String(value);
}