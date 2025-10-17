/**
 * URL cell renderer
 */

import type { Column } from '../../column-types';

export function url(value: any, column: Column): string {
  if (value === null || value === undefined || value === '') {
    return '';
  }
  
  const url = String(value);
  
  // Display domain only for better readability
  try {
    const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
    return urlObj.hostname;
  } catch {
    return url; // Show invalid URLs as-is
  }
}