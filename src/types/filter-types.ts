import type { FilterOperator } from '../types'

/**
 * A filter condition for a single field comparison
 */
export interface FilterCondition {
  /** UUID for React key */
  id: string
  /** Column/field ID */
  field: string
  /** One of 14 operators from types.ts */
  operator: FilterOperator
  /** Value to compare against */
  value: any
  /** For text operators (contains, starts_with, etc.) */
  caseSensitive?: boolean
}

/**
 * A group of filter conditions or nested groups with AND/OR logic.
 * Supports up to 3 levels of nesting (Notion-style).
 */
export interface FilterGroup {
  logic: 'AND' | 'OR'
  conditions: (FilterCondition | FilterGroup)[]
}

/**
 * A saved filter preset
 */
export interface FilterPreset {
  /** UUID */
  id: string
  /** User-provided name */
  name: string
  /** The saved filter configuration */
  filterGroup: FilterGroup
  /** ISO timestamp */
  createdAt: string
}

/**
 * Validation error for a filter condition
 */
export interface ValidationError {
  /** ID of the condition with error */
  conditionId: string
  /** Error message to display */
  message: string
}

/**
 * State for the filter builder UI
 */
export interface FilterBuilderState {
  isOpen: boolean
  searchValue: string
  draftFilterGroup: FilterGroup | null
  presets: FilterPreset[]
  validationErrors: ValidationError[]
  showComplexityWarning: boolean
}
