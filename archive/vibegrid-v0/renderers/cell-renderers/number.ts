import type { Column } from '../types'

/**
 * Fast number rendering function for table cells
 * Formats numbers with locale-specific separators
 */
export function number(value: any, column: Column): string {
  if (value === null || value === undefined) return ''

  return typeof value === 'number' ? value.toLocaleString() : String(value)
}
