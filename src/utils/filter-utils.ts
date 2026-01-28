/**
 * Filter Utilities
 *
 * GH#216: Multi-Level Advanced Filtering for VibeGrid
 * GH#1391: Smart Text Search - applyTextSearch function
 *
 * Provides validation and utility functions for filter conditions and groups.
 */

import type { ValidationError, FilterGroup, FilterCondition } from '../types/filter-types'
import type { Column } from '../types'
import { isTextType } from '../column-types'

/**
 * Threshold for showing complexity warning
 */
export const COMPLEXITY_WARNING_THRESHOLD = 10

/**
 * Validate a filter condition
 *
 * Returns a ValidationError if the condition is invalid, null otherwise.
 */
export function validateCondition(condition: FilterCondition): ValidationError | null {
  // Field is required
  if (!condition.field) {
    return { conditionId: condition.id, message: 'Please select a field' }
  }

  // Value is required (except for is_empty/is_not_empty)
  if (condition.operator !== 'is_empty' && condition.operator !== 'is_not_empty') {
    if (condition.value === null || condition.value === undefined || condition.value === '') {
      return { conditionId: condition.id, message: 'Please enter a value' }
    }
  }

  // Validate regex
  if (condition.operator === 'regex') {
    try {
      new RegExp(String(condition.value))
    } catch {
      return { conditionId: condition.id, message: 'Invalid regex pattern' }
    }
  }

  return null
}

/**
 * Validate all conditions in a filter group
 *
 * Returns an array of ValidationErrors for all invalid conditions.
 */
export function validateFilterGroup(group: FilterGroup): ValidationError[] {
  const errors: ValidationError[] = []

  for (const item of group.conditions) {
    if ('logic' in item) {
      // Nested group
      errors.push(...validateFilterGroup(item))
    } else {
      // Condition
      const error = validateCondition(item)
      if (error) errors.push(error)
    }
  }

  return errors
}

/**
 * Count total conditions in a filter group (recursive)
 */
export function countConditions(group: FilterGroup): number {
  let count = 0
  for (const item of group.conditions) {
    if ('logic' in item) {
      count += countConditions(item)
    } else {
      count += 1
    }
  }
  return count
}

// ====================================
// FILTER EVALUATION FUNCTIONS
// ====================================

/**
 * Evaluate a single filter condition against a row
 *
 * @param row - The row data to evaluate
 * @param condition - The filter condition to check
 * @returns true if the row matches the condition, false otherwise
 */
export function evaluateCondition(row: any, condition: FilterCondition): boolean {
  // Get the value from the row - handle both flat and nested data structures
  const value = row.data ? row.data[condition.field] : row[condition.field]
  const filterValue = condition.value

  switch (condition.operator) {
    case 'equals':
      return value === filterValue

    case 'not_equals':
      return value !== filterValue

    case 'contains': {
      const valueStr = String(value ?? '').toLowerCase()
      const filterStr = String(filterValue ?? '').toLowerCase()
      return condition.caseSensitive
        ? String(value ?? '').includes(String(filterValue ?? ''))
        : valueStr.includes(filterStr)
    }

    case 'not_contains': {
      const valueStr = String(value ?? '').toLowerCase()
      const filterStr = String(filterValue ?? '').toLowerCase()
      return condition.caseSensitive
        ? !String(value ?? '').includes(String(filterValue ?? ''))
        : !valueStr.includes(filterStr)
    }

    case 'starts_with': {
      const valueStr = String(value ?? '').toLowerCase()
      const filterStr = String(filterValue ?? '').toLowerCase()
      return condition.caseSensitive
        ? String(value ?? '').startsWith(String(filterValue ?? ''))
        : valueStr.startsWith(filterStr)
    }

    case 'ends_with': {
      const valueStr = String(value ?? '').toLowerCase()
      const filterStr = String(filterValue ?? '').toLowerCase()
      return condition.caseSensitive
        ? String(value ?? '').endsWith(String(filterValue ?? ''))
        : valueStr.endsWith(filterStr)
    }

    case 'greater_than':
      return Number(value) > Number(filterValue)

    case 'less_than':
      return Number(value) < Number(filterValue)

    case 'is_empty':
      return value === null || value === undefined || value === ''

    case 'is_not_empty':
      return value !== null && value !== undefined && value !== ''

    case 'in':
      return Array.isArray(filterValue) && filterValue.includes(value)

    case 'not_in':
      return !Array.isArray(filterValue) || !filterValue.includes(value)

    case 'regex':
      try {
        const flags = condition.caseSensitive ? '' : 'i'
        return new RegExp(String(filterValue), flags).test(String(value ?? ''))
      } catch {
        // Invalid regex pattern - treat as no match
        return false
      }

    default:
      // Unknown operator - default to pass
      return true
  }
}

/**
 * Type guard to check if an item is a FilterGroup (has 'logic' property)
 */
function isFilterGroup(item: FilterCondition | FilterGroup): item is FilterGroup {
  return 'logic' in item
}

/**
 * Evaluate a filter group (recursive AND/OR logic)
 *
 * @param row - The row data to evaluate
 * @param group - The filter group with nested conditions/groups
 * @returns true if the row matches the group criteria, false otherwise
 */
export function evaluateFilterGroup(row: any, group: FilterGroup): boolean {
  // Empty groups match all rows
  if (group.conditions.length === 0) {
    return true
  }

  // Evaluate each condition or nested group
  const results = group.conditions.map((item) => {
    if (isFilterGroup(item)) {
      // Nested group - recursively evaluate
      return evaluateFilterGroup(row, item)
    } else {
      // Condition - skip incomplete conditions (no field set)
      if (!item.field) {
        return true
      }
      return evaluateCondition(row, item)
    }
  })

  // Apply logic (AND = all must match, OR = any must match)
  if (group.logic === 'AND') {
    return results.every((r) => r)
  } else {
    return results.some((r) => r)
  }
}

/**
 * Apply nested filter group to an array of rows
 *
 * @param rows - Array of rows to filter
 * @param filterGroup - The filter group to apply (null means no filter)
 * @returns Filtered array of rows that match the filter criteria
 */
export function applyNestedFilters(rows: any[], filterGroup: FilterGroup | null): any[] {
  // No filter or empty conditions = return all rows
  if (!filterGroup || filterGroup.conditions.length === 0) {
    return rows
  }

  return rows.filter((row) => evaluateFilterGroup(row, filterGroup))
}

// ====================================
// TEXT SEARCH FUNCTIONS (GH#1391)
// ====================================

/**
 * Apply text search across specified columns.
 * Returns rows where any searchable column contains the search text (case-insensitive).
 *
 * Uses existing isTextType() to determine default searchable columns:
 * - text, longtext, rich-text, email, url, phone
 *
 * @param rows - Array of rows to search
 * @param searchText - The search text to find
 * @param columns - Column definitions for the grid
 * @param searchableColumnIds - Optional list of specific column IDs to search
 * @returns Filtered array of rows that match the search criteria
 */
export function applyTextSearch(
  rows: any[],
  searchText: string,
  columns: Column[],
  searchableColumnIds?: string[],
): any[] {
  const trimmed = searchText.trim().toLowerCase()
  if (!trimmed) return rows

  // Determine which columns to search
  // Uses existing isTextType() from column-types.ts for consistency
  const columnsToSearch = searchableColumnIds
    ? columns.filter((c) => searchableColumnIds.includes(c.id))
    : columns.filter((c) => isTextType(c.cellType || ''))

  if (columnsToSearch.length === 0) return rows

  return rows.filter((row) => {
    return columnsToSearch.some((col) => {
      // Use column.field for row data lookup (per Codex review note)
      // Support both row[field] and row.data[field] patterns
      const field = col.field || col.id
      const value = row[field] ?? row.data?.[field]
      if (value == null) return false
      return String(value).toLowerCase().includes(trimmed)
    })
  })
}
