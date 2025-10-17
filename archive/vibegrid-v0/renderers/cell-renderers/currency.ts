/**
 * Currency cell renderer
 */

import type { Column } from '../../column-types';

export function currency(value: any, column: Column): string {
  if (value === null || value === undefined) {
    return '';
  }
  
  // Handle JSONB currency format: {amount: number, currency: string}
  if (typeof value === 'object' && value.amount !== undefined) {
    const { amount, currency = 'USD' } = value;
    
    if (amount === null || amount === undefined) {
      return '';
    }
    
    // Format currency using Intl.NumberFormat
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency.toUpperCase()
      }).format(Number(amount));
    } catch {
      // Fallback for invalid currency codes
      return `${currency} ${Number(amount).toFixed(2)}`;
    }
  }
  
  // Handle simple numeric values
  const numValue = Number(value);
  if (isNaN(numValue)) {
    return String(value);
  }
  
  // Default to USD formatting
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(numValue);
}