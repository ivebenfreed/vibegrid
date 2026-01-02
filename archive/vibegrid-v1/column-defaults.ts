/**
 * Default column configurations by cell type
 */

import type { CellType, Column } from './column-types'

export const COLUMN_DEFAULTS: Record<
  CellType,
  { width: number; minWidth: number; maxWidth: number }
> = {
  text: { width: 200, minWidth: 120, maxWidth: 400 },
  number: { width: 120, minWidth: 80, maxWidth: 200 },
  date: { width: 150, minWidth: 120, maxWidth: 200 },
  boolean: { width: 80, minWidth: 70, maxWidth: 100 },
  select: { width: 140, minWidth: 100, maxWidth: 200 },
  'select-multi': { width: 200, minWidth: 150, maxWidth: 350 },
  'reference-select': { width: 160, minWidth: 120, maxWidth: 300 },
} as const

/**
 * Apply default values to columns based on their cell type
 */
export function applyColumnDefaults<T>(columns: Column<T>[]): Column<T>[] {
  return columns.map((col) => {
    const defaults = COLUMN_DEFAULTS[col.cellType as CellType]

    // No fallback - cellType must be valid
    if (!defaults) {
      throw new Error(
        `Unknown cellType '${col.cellType}' for column '${col.id}'. Available types: ${Object.keys(COLUMN_DEFAULTS).join(', ')}`,
      )
    }

    return {
      ...col,
      width: col.width ?? defaults.width,
      minWidth: col.minWidth ?? defaults.minWidth,
      maxWidth: col.maxWidth ?? defaults.maxWidth,
      editable: col.editable ?? true,
    }
  })
}

/**
 * Format field name to display name
 * e.g., "firstName" -> "First Name", "statusId" -> "Status"
 */
export function formatFieldName(field: string): string {
  return field
    .replace(/([A-Z])/g, ' $1') // Add space before capital letters
    .replace(/^./, (str) => str.toUpperCase()) // Capitalize first letter
    .replace(/Id$/, '') // Remove "Id" suffix
    .replace(/_/g, ' ') // Replace underscores with spaces
    .trim()
}
