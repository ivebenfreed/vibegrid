/**
 * FilterOperatorPicker Component
 *
 * GH#216: Multi-Level Advanced Filtering for VibeGrid
 *
 * Shows filter operators based on field type (text, number, date, etc.).
 * Each field type has a specific set of applicable operators.
 */

import { observer } from 'mobx-react-lite'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import type { FilterOperator } from '../types'

// ====================================
// OPERATOR SETS BY FIELD TYPE
// ====================================

const TEXT_OPERATORS = [
  'equals',
  'not_equals',
  'contains',
  'not_contains',
  'starts_with',
  'ends_with',
  'is_empty',
  'is_not_empty',
  'regex',
] as const

const NUMBER_OPERATORS = ['equals', 'not_equals', 'greater_than', 'less_than', 'is_empty', 'is_not_empty'] as const

const DATE_OPERATORS = ['equals', 'not_equals', 'greater_than', 'less_than', 'is_empty', 'is_not_empty'] as const

const BOOLEAN_OPERATORS = ['equals', 'is_empty', 'is_not_empty'] as const

const ENUM_OPERATORS = ['equals', 'not_equals', 'in', 'not_in', 'is_empty', 'is_not_empty'] as const

/**
 * Relationship cells hold an ARRAY of target-entity ids, so a match is set
 * membership over that array (the bridge translates `equals` / `in` into
 * substring predicates over the stored JSON text — see
 * `vibegrid-sort-filter-bridge.ts`).
 *
 * `not_equals` / `not_in` are deliberately absent: the v1 server predicate AST
 * (`packages/shared-types/src/predicate.ts`) has neither `neq` nor a negated
 * substring op, and a plain `notIn` compares against the whole JSON text — so
 * it would match every row, including the ones the user meant to exclude. An
 * operator that silently returns the wrong rows is worse than one that isn't
 * offered; add them back when the AST grows a negation.
 */
const RELATIONSHIP_OPERATORS = ['equals', 'in', 'is_empty', 'is_not_empty'] as const

const DECISION_TABLE_OPERATORS = ['decision_status', 'is_empty', 'is_not_empty'] as const

// ====================================
// OPERATOR HELPER FUNCTION
// ====================================

/**
 * Returns the applicable operators for a given cell/field type.
 *
 * @param cellType - The VibeGrid cell type (text, number, date, etc.)
 * @returns Array of filter operators applicable to this field type
 */
export function getOperatorsForFieldType(cellType: string): FilterOperator[] {
  switch (cellType) {
    // Text-based types
    case 'text':
    case 'email':
    case 'phone':
    case 'url':
      return [...TEXT_OPERATORS]

    // Numeric types
    case 'number':
    case 'currency':
    case 'percent':
      return [...NUMBER_OPERATORS]

    // Date/time types
    case 'date':
    case 'datetime':
      return [...DATE_OPERATORS]

    // Boolean types
    case 'boolean':
    case 'checkbox':
      return [...BOOLEAN_OPERATORS]

    // Enum/select types
    case 'status':
    case 'single_select':
    case 'multi_select':
      return [...ENUM_OPERATORS]

    // Relationship types. `column-generation.ts` renders relationship
    // projections as `badge-list`; `badge-list-live` is the pre-F' name still
    // present on some column producers. These hold target-entity ids, so the
    // substring operators (starts_with / regex / …) that TEXT_OPERATORS
    // offered were meaningless here — RELATIONSHIP_OPERATORS was declared for
    // exactly this case but never wired up.
    case 'badge-list':
    case 'badge-list-live':
    case 'relationship':
    case 'entity-reference':
      return [...RELATIONSHIP_OPERATORS]

    // Computed decision table types
    case 'computed_decision_table':
      return [...DECISION_TABLE_OPERATORS]

    // Default to text operators for unknown types
    default:
      return [...TEXT_OPERATORS]
  }
}

// ====================================
// OPERATOR LABELS
// ====================================

const OPERATOR_LABELS: Record<string, string> = {
  equals: 'equals',
  not_equals: 'not equals',
  contains: 'contains',
  not_contains: 'not contains',
  starts_with: 'starts with',
  ends_with: 'ends with',
  greater_than: 'greater than',
  less_than: 'less than',
  between: 'between',
  is_empty: 'is empty',
  is_not_empty: 'is not empty',
  in: 'is any of',
  not_in: 'is none of',
  regex: 'matches regex',
  decision_status: 'decision status is',
}

/**
 * Human label for an operator. Single source for the dropdown rows AND the
 * trigger — they disagreed before, because `Select.Value` falls back to the
 * raw item value when no formatter is supplied.
 */
export function getOperatorLabel(operator: string | null | undefined): string {
  if (!operator) return ''
  return OPERATOR_LABELS[operator] ?? operator
}

// ====================================
// COMPONENT
// ====================================

export interface FilterOperatorPickerProps {
  /** The cell/field type to determine available operators */
  cellType: string
  /** Currently selected operator */
  value: FilterOperator | null
  /** Callback when operator changes */
  onChange: (operator: FilterOperator) => void
  /** Index for unique data-testid */
  index: number
  /** Optional additional class names */
  className?: string
}

export const FilterOperatorPicker = observer(function FilterOperatorPicker({
  cellType,
  value,
  onChange,
  index,
  className,
}: FilterOperatorPickerProps) {
  const operators = getOperatorsForFieldType(cellType)

  return (
    <Select value={value ?? undefined} onValueChange={(val) => onChange(val as FilterOperator)}>
      <SelectTrigger data-testid={`vibegrid-filter-operator-${index}`} className={className}>
        {/*
          `Select.Value` renders the raw item VALUE unless given a formatter,
          so the trigger read "in" / "not_in" while the dropdown row that set
          it read "is any of" / "is none of". Map through the same labels the
          options use. (Pre-existing for enum columns, which have always
          offered `in`; relationship columns just made it easy to hit.)
        */}
        <SelectValue placeholder="Select operator...">
          {(selected: string | null) => getOperatorLabel(selected) || 'Select operator...'}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {operators.map((op) => (
          <SelectItem key={op} value={op}>
            {getOperatorLabel(op)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
})
