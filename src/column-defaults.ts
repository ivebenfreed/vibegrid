/**
 * Default column configurations by cell type
 */

import type { CellType, Column } from './types'

export const COLUMN_DEFAULTS: Record<
  CellType,
  { width: number; minWidth: number; maxWidth: number }
> = {
  // Basic text types
  text: { width: 200, minWidth: 120, maxWidth: 400 },
  longtext: { width: 300, minWidth: 200, maxWidth: 600 },
  textarea: { width: 300, minWidth: 200, maxWidth: 600 },
  'rich-text': { width: 350, minWidth: 250, maxWidth: 700 },
  rich_text: { width: 350, minWidth: 250, maxWidth: 700 },
  markdown: { width: 300, minWidth: 200, maxWidth: 600 },

  // Number types
  number: { width: 120, minWidth: 80, maxWidth: 200 },
  integer: { width: 100, minWidth: 70, maxWidth: 150 },
  decimal: { width: 130, minWidth: 90, maxWidth: 200 },
  percentage: { width: 110, minWidth: 80, maxWidth: 150 },

  // Boolean
  boolean: { width: 80, minWidth: 70, maxWidth: 100 },

  // Date/time types
  date: { width: 150, minWidth: 120, maxWidth: 200 },
  datetime: { width: 200, minWidth: 160, maxWidth: 300 },
  'datetime-local': { width: 200, minWidth: 160, maxWidth: 300 },
  time: { width: 120, minWidth: 90, maxWidth: 150 },
  timestamp: { width: 200, minWidth: 160, maxWidth: 300 },
  timestamptz: { width: 220, minWidth: 180, maxWidth: 350 },

  // Selection types
  select: { width: 140, minWidth: 100, maxWidth: 200 },
  'single-select': { width: 140, minWidth: 100, maxWidth: 200 },
  'select-multi': { width: 200, minWidth: 150, maxWidth: 350 },
  'multi-select': { width: 200, minWidth: 150, maxWidth: 350 },

  // Communication types
  email: { width: 200, minWidth: 150, maxWidth: 350 },
  url: { width: 250, minWidth: 180, maxWidth: 500 },
  phone: { width: 150, minWidth: 120, maxWidth: 200 },

  // Rich data types
  file: { width: 180, minWidth: 140, maxWidth: 300 },
  image: { width: 150, minWidth: 120, maxWidth: 250 },
  currency: { width: 130, minWidth: 100, maxWidth: 200 },
  color: { width: 100, minWidth: 80, maxWidth: 150 },
  json: { width: 200, minWidth: 150, maxWidth: 400 },

  // Interactive types
  rating: { width: 140, minWidth: 100, maxWidth: 200 },
  slider: { width: 180, minWidth: 140, maxWidth: 250 },

  // System option types (DataForge)
  status: { width: 140, minWidth: 100, maxWidth: 200 },
  status_option: { width: 140, minWidth: 100, maxWidth: 200 },
  priority_option: { width: 120, minWidth: 90, maxWidth: 180 },
  category_option: { width: 140, minWidth: 100, maxWidth: 200 },
  task_type_option: { width: 140, minWidth: 100, maxWidth: 200 },
  discussion_type_option: { width: 160, minWidth: 120, maxWidth: 220 },

  // Reference types
  'reference-select': { width: 160, minWidth: 120, maxWidth: 300 },
  user_reference: { width: 180, minWidth: 140, maxWidth: 300 },
  custom_user_reference: { width: 180, minWidth: 140, maxWidth: 300 },
  entity_reference: { width: 180, minWidth: 140, maxWidth: 300 },
  custom_entity_reference: { width: 180, minWidth: 140, maxWidth: 300 },

  // Computed/rollup types
  rollup_count: { width: 100, minWidth: 80, maxWidth: 150 },
  rollup_sum: { width: 120, minWidth: 90, maxWidth: 180 },
  rollup_average: { width: 120, minWidth: 90, maxWidth: 180 },
  rollup_concat: { width: 200, minWidth: 150, maxWidth: 400 },
  computed_expression: { width: 150, minWidth: 120, maxWidth: 300 },
  computed_formula: { width: 150, minWidth: 120, maxWidth: 300 },
  computed_decision_table: { width: 160, minWidth: 120, maxWidth: 250 },

  // COI-specific types (GH#1236)
  'currency-abbreviated': { width: 100, minWidth: 80, maxWidth: 150 },
  'additional-insured': { width: 120, minWidth: 100, maxWidth: 180 },
  'expiration-date': { width: 100, minWidth: 80, maxWidth: 150 },
  'row-expand': { width: 40, minWidth: 40, maxWidth: 40 },

  // Admin types (GH#218)
  'badge-list': { width: 250, minWidth: 150, maxWidth: 400 },

  // Entity field types
  'entity-name': { width: 200, minWidth: 150, maxWidth: 400 },
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
