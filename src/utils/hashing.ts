import { hash } from 'ohash'
import { getLogger } from '@/shared/lib/logging'
import type { Column } from '../types'

const _logger = getLogger(['vibegrid', 'utils', 'hashing'])

// Metadata columns excluded from change detection
// Include both camelCase and snake_case variants since data may come in either format
export const METADATA_COLUMNS = new Set([
  'updatedAt',
  'updated_at',
  'createdAt',
  'created_at',
  'version',
  'lastModifiedBy',
  'last_modified_by',
  'lastModifiedAt',
  'last_modified_at',
])

/**
 * Normalize value to stable primitive representation based on field type
 * This prevents false positives from object reference changes
 *
 * KEY INSIGHT: TanStack DB optimistic updates send string IDs, but server echo
 * returns resolved objects with {id, name, color, ...}. We must normalize both
 * to the same ID to prevent false change detection.
 */
export function normalizeValue(column: Column, value: any): any {
  if (value === null || value === undefined) return null

  // Cast to string to allow broader comparisons (strict union limits checking)
  const cellType = column.cellType as string

  // UNIVERSAL OBJECT-WITH-ID NORMALIZATION
  // Catches: status, select, option, reference-select, etc.
  // This handles both string IDs (optimistic) and resolved objects (server echo)
  // By normalizing {id: "x", name: "...", ...} to just "x", we ensure consistent hashing
  if (typeof value === 'object' && !Array.isArray(value) && value.id) {
    return value.id
  }

  // Status/Option fields: already handles objects above, this catches string IDs
  if (
    cellType === 'status' ||
    cellType === 'status_set' ||
    cellType === 'select' ||
    cellType === 'single-select' ||
    cellType === 'status_option' ||
    cellType === 'priority_option' ||
    cellType === 'category_option' ||
    cellType === 'custom_option_reference'
  ) {
    if (typeof value === 'string') return value
    if (typeof value === 'object' && value?.value) return value.value
    return null
  }

  // Multi-reference fields: normalize to array of IDs
  if (cellType === 'select-multi' || cellType === 'multi-select') {
    if (!Array.isArray(value)) return []
    return value
      .map((v: any) => (typeof v === 'string' ? v : v?.id || null))
      .filter(Boolean)
      .sort()
  }

  // Dates: normalize to ISO string
  if (cellType === 'date' || cellType === 'datetime') {
    if (value instanceof Date) return value.toISOString()
    if (typeof value === 'string') return value
    return null
  }

  // Primitives: return as-is
  const type = typeof value
  if (type === 'string' || type === 'number' || type === 'boolean') {
    return value
  }

  // Other objects/arrays: use JSON.stringify for stable comparison
  // This handles complex field types consistently
  try {
    return JSON.stringify(value)
  } catch (_e) {
    return String(value)
  }
}

/**
 * Hash value - fast path for primitives, ohash for complex values
 */
export function hashValue(value: any): string {
  if (value === null || value === undefined) return 'null'
  const type = typeof value

  // Fast path: inline hash for primitives
  if (type === 'string') return `str:${value}`
  if (type === 'number') return `num:${value}`
  if (type === 'boolean') return `bool:${value}`

  // For complex values, use ohash (deterministic for same input)
  return hash(value)
}

/**
 * Row snapshot for change detection
 */
export interface RowSnapshot {
  id: string
  orderIndex: number
  dataHash: string // Hash of non-metadata columns only
  columnHashes: Map<string, string> // Per-column hashes
}

/**
 * Create row snapshot with per-column hashing and loop-back protection
 * Normalizes values per field type before hashing to prevent false positives
 */
export function createRowSnapshot(row: any, columns: Column[]): RowSnapshot {
  const columnHashes = new Map<string, string>()
  const dataColumnHashes: string[] = []

  for (const col of columns) {
    const rawValue = row[col.id]
    // Normalize value based on field type (refs→IDs, dates→ISO, etc.)
    const normalizedValue = normalizeValue(col, rawValue)
    const colHash = hashValue(normalizedValue)
    columnHashes.set(col.id, colHash)

    // Exclude metadata from dataHash (loop-back protection)
    if (!METADATA_COLUMNS.has(col.id)) {
      dataColumnHashes.push(colHash)
    }
  }

  // Combined hash of data columns only
  const dataHash = hash(dataColumnHashes.join('|'))

  return {
    id: row.id,
    orderIndex: row.orderIndex || 0,
    dataHash,
    columnHashes,
  }
}
