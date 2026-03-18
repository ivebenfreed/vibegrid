/**
 * Shared sorting comparison utilities for VIbeGrid.
 *
 * Used by both TableCoreStore (synchronous path) and IncrementalRowProcessor
 * (incremental/background path) to ensure consistent sort behavior.
 */

/** Check if a value is empty (null, undefined, or empty string) */
export function isEmpty(val: any): boolean {
  return val == null || val === ''
}

/** Natural string collator: case-insensitive, numeric-aware */
const naturalCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
})

/**
 * Compare two sortable values with natural ordering:
 * - Nulls/empty always sort last (regardless of direction)
 * - Strings use locale-aware, case-insensitive, numeric-aware comparison
 * - Numbers use numeric comparison
 */
export function compareValues(aVal: any, bVal: any): number {
  const aEmpty = isEmpty(aVal)
  const bEmpty = isEmpty(bVal)

  // Both empty — equal
  if (aEmpty && bEmpty) return 0
  // Nulls always sort last (caller handles direction inversion)
  if (aEmpty) return 1
  if (bEmpty) return -1

  // String comparison: locale-aware, numeric, case-insensitive
  if (typeof aVal === 'string' && typeof bVal === 'string') {
    return naturalCollator.compare(aVal, bVal)
  }

  // Numeric comparison
  if (typeof aVal === 'number' && typeof bVal === 'number') {
    return aVal - bVal
  }

  // Mixed types: coerce to string for comparison
  return naturalCollator.compare(String(aVal), String(bVal))
}
