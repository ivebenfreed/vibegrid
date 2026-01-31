/**
 * @deprecated This file contains experimental strict generic Column types that are no longer used.
 *
 * **DO NOT USE THIS FILE** - Use the runtime Column type from './types.ts' instead.
 *
 * **Background:**
 * This was an experiment in compile-time type safety using generics (Column<T, K extends keyof T>).
 * However, the runtime Column from types.ts with 100+ display/formatting properties became
 * the de facto standard used throughout the codebase.
 *
 * **Migration Status:**
 * - All core files now import Column from './types.ts'
 * - EnhancedColumn extends the runtime Column (not this strict one)
 * - Field type implementations use runtime Column properties
 *
 * **This file is kept for:**
 * - CellType export (re-exported from types.ts)
 * - Historical reference
 * - Potential future strict typing experiments
 *
 * **Removal plan:** Consider removing once CellType is consolidated into types.ts
 *
 * Type-safe column definitions with compile-time field type validation (DEPRECATED - see above)
 */

// Map entity field types to allowed cell types
type FieldTypeToCellType<T> = T extends string | null | undefined
  ? 'text' | 'select'
  : T extends number | null | undefined
    ? 'number'
    : T extends boolean | null | undefined
      ? 'boolean'
      : T extends Date | null | undefined
        ? 'date'
        : T extends Array<any>
          ? 'select-multi'
          : 'text'

// Type-safe column that validates cellType matches field type
export interface Column<T, K extends keyof T = keyof T> {
  id: string
  field: K & string
  name: string
  cellType: K extends keyof T ? FieldTypeToCellType<T[K]> : never

  // Optional properties
  width?: number
  minWidth?: number
  maxWidth?: number
  editable?: boolean

  // For relationships
  relationshipTable?: string
  relationshipDisplayField?: string

  // For enums and selects
  options?: Array<{ value: string; label: string; color?: string; group?: string }>

  // For system/custom references
  referenceType?: 'system' | 'custom'
  systemOptionType?: string // e.g., 'priority', 'status'
  systemArchetype?: string // e.g., 'project', 'task'
  customOptionSet?: string

  // PERFORMANCE: Pre-computed field config for optimized cell creation
  _cachedRenderer?: {
    fieldTypeConfig: any
    resolvedAt: number
  }
}

// Helper type to make column creation easier
export type ColumnDef<T> = {
  [K in keyof T]: Column<T, K>
}[keyof T]

// Export cell type union for use elsewhere - aligned with DataForge field types
export type CellType =
  // Basic types
  | 'text'
  | 'longtext'
  | 'textarea' // Multi-line text input
  | 'rich-text'
  | 'rich_text' // DataForge variant
  | 'markdown' // Markdown text
  | 'number'
  | 'integer'
  | 'decimal'
  | 'percentage' // Number formatted as percentage
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'datetime-local' // HTML5 datetime-local input
  | 'time' // Time picker
  | 'timestamp' // Unix timestamp
  | 'timestamptz' // Timestamp with timezone
  // Selection types
  | 'select'
  | 'single-select'
  | 'select-multi'
  | 'multi-select'
  // Communication types
  | 'email'
  | 'url'
  | 'phone'
  // Rich data types
  | 'file'
  | 'image' // Image upload/display
  | 'currency'
  | 'color'
  | 'json' // JSON field type
  // Interactive types
  | 'rating' // Star rating
  | 'slider' // Slider/progress bar
  // System option types (DataForge)
  | 'status'
  | 'status_option'
  | 'priority_option'
  | 'category_option'
  | 'task_type_option'
  | 'discussion_type_option'
  // Reference types
  | 'reference-select'
  | 'user_reference' // DataForge variant
  | 'custom_user_reference'
  | 'entity_reference' // DataForge variant
  | 'custom_entity_reference'
  // Computed/rollup types
  | 'rollup_count'
  | 'rollup_sum'
  | 'rollup_average'
  | 'rollup_concat'
  | 'computed_expression'
  | 'computed_formula'
  // COI-specific types (GH#1236)
  | 'currency-abbreviated'
  | 'additional-insured'
  | 'expiration-date'
  | 'row-expand' // Expandable row with chevron (B5)
  // Entity field types
  | 'entity-name' // Primary field with navigate affordance

// OPTIMIZED: Pre-computed Sets for O(1) lookup performance
export const SELECT_CELL_TYPES = new Set<CellType>([
  'enum' as CellType,
  'select',
  'single-select',
  'select-multi',
  'multi-select',
  'reference-select',
] as const)

export const DROPDOWN_CELL_TYPES = new Set<CellType>([
  ...SELECT_CELL_TYPES,
  'boolean',
  'date',
  'datetime',
] as const)

export const TEXT_CELL_TYPES = new Set<CellType>([
  'text',
  'longtext',
  'rich-text',
  'email',
  'url',
  'phone',
] as const)

// Utility functions for optimal type checking
export const isSelectType = (cellType: string): boolean =>
  SELECT_CELL_TYPES.has(cellType as CellType)
export const isDropdownType = (cellType: string): boolean =>
  DROPDOWN_CELL_TYPES.has(cellType as CellType)
export const isTextType = (cellType: string): boolean => TEXT_CELL_TYPES.has(cellType as CellType)
