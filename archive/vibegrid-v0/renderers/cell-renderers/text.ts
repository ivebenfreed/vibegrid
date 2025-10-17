import type { Column } from '../types';

/**
 * Fast text rendering function for table cells
 * Handles strings, objects (as JSON), and null/undefined values
 */
export function text(value: any, column: Column): string {
  if (value === null || value === undefined) return '';
  
  if (typeof value === 'object') {
    try {
      const json = JSON.stringify(value);
      return json.length > 50 ? json.substring(0, 47) + '...' : json;
    } catch {
      return '[Object]';
    }
  }
  
  return String(value);
}