import { hash } from 'ohash'
import { createLogger } from '@/shared/lib/logging'
import type { Column } from '../types'

const log = createLogger('vibegrid/utils/hashing')

// Metadata columns excluded from change detection
export const METADATA_COLUMNS = new Set([
  'updatedAt',
  'createdAt',
  'version',
  'lastModifiedBy',
  'lastModifiedAt',
])

/**
 * Normalize value to stable primitive representation based on field type
 * This prevents false positives from object reference changes
 */
export function normalizeValue(column: Column, value: any): any {
  if (value === null || value === undefined) return null

  const fieldType = column.fieldType?.type

  // Reference fields: normalize to ID only
  if (fieldType === 'user_reference' || fieldType === 'entity_reference') {
    // Value might be ID (string) or resolved object { id, ... }
    if (typeof value === 'string') return value
    if (typeof value === 'object' && value.id) return value.id
    return null
  }

  // Multi-reference fields: normalize to array of IDs
  if (fieldType === 'multi_select' || fieldType === 'tags') {
    if (!Array.isArray(value)) return []
    return value
      .map((v) => (typeof v === 'string' ? v : v?.id || null))
      .filter(Boolean)
      .sort()
  }

  // Dates: normalize to ISO string
  if (fieldType === 'date' || fieldType === 'datetime') {
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
  } catch (e) {
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
