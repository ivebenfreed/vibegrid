/**
 * FilterCondition Component
 *
 * GH#216: Multi-Level Advanced Filtering for VibeGrid
 *
 * The main row component that composes field picker, operator picker, and value input.
 * Each condition represents a single field comparison (field, operator, value).
 *
 * Phase 7: Inline validation error display.
 */

import { X } from 'lucide-react'
import { observer } from 'mobx-react-lite'
import { Button } from '@/shared/components/ui/button'
import { getLogger } from '@/shared/lib/logging'
import { FilterFieldPicker } from './FilterFieldPicker'
import { FilterOperatorPicker, getOperatorsForFieldType } from './FilterOperatorPicker'
import { FilterValueInput } from './FilterValueInput'
import { getRelationshipTarget } from '../utils/relationship-column'
import type { InViewRelationshipOption } from './FilterRelationshipValue'
import type { FilterCondition as FilterConditionType } from '../types/filter-types'
import type { Column, FilterOperator } from '../types'

const logger = getLogger(['vibegrid', 'FilterCondition'])

export interface FilterConditionProps {
  condition: FilterConditionType
  columns: Column[]
  index: number
  onChange: (condition: FilterConditionType) => void
  onRemove: () => void
  className?: string
  /** Validation error message to display */
  errorMessage?: string
  /** Distinct relationship targets present in the grid's loaded rows, by column id. */
  inViewRelationshipOptions?: Record<string, readonly InViewRelationshipOption[]>
}

export const FilterCondition = observer(function FilterCondition({
  condition,
  columns,
  index,
  onChange,
  onRemove,
  className,
  errorMessage,
  inViewRelationshipOptions,
}: FilterConditionProps) {
  const selectedColumn = columns.find((col) => col.id === condition.field)

  // Relationship columns hold target-entity ids, so they get the relationship
  // operator set and the entity-picker value control. The array-membership
  // semantics their conditions need are applied downstream, in the SQL bridge
  // (`collectRelationshipFields`) and the JS evaluator — both derive it from
  // the columns, so saved views built before this change get it too.
  const relationshipTarget = getRelationshipTarget(selectedColumn)
  const effectiveCellType = relationshipTarget ? 'badge-list' : (selectedColumn?.cellType ?? 'text')

  const handleFieldChange = (fieldId: string) => {
    const newColumn = columns.find((col) => col.id === fieldId)
    const newRelationship = getRelationshipTarget(newColumn)
    const newCellType = newRelationship ? 'badge-list' : (newColumn?.cellType ?? 'text')
    const operators = newColumn ? getOperatorsForFieldType(newCellType) : []
    const defaultOperator = operators[0] ?? 'equals'

    onChange({
      ...condition,
      field: fieldId,
      operator: defaultOperator,
      value: null, // Reset value when field changes
    })
    logger.debug('Field changed', { fieldId, operator: defaultOperator })
  }

  const handleOperatorChange = (operator: FilterOperator) => {
    const needsValue = operator !== 'is_empty' && operator !== 'is_not_empty'
    // `in` / `not_in` carry a set; the others carry a scalar. Reshape rather
    // than handing the value control a type it can't render.
    const isSetOperator = operator === 'in' || operator === 'not_in'
    let nextValue = needsValue ? condition.value : null
    if (needsValue && relationshipTarget) {
      if (isSetOperator && !Array.isArray(nextValue)) {
        nextValue = nextValue == null || nextValue === '' ? [] : [nextValue]
      } else if (!isSetOperator && Array.isArray(nextValue)) {
        nextValue = nextValue.length > 0 ? nextValue[0] : null
      }
    }
    onChange({
      ...condition,
      operator,
      value: nextValue,
    })
    logger.debug('Operator changed', { operator, needsValue })
  }

  const handleValueChange = (value: unknown) => {
    onChange({
      ...condition,
      value,
    })
    logger.debug('Value changed', { value })
  }

  return (
    <div className="flex flex-col gap-1">
      <div data-testid={`vibegrid-filter-condition-${index}`} className={`flex items-center gap-2 ${className ?? ''}`}>
        <FilterFieldPicker columns={columns} value={condition.field} onChange={handleFieldChange} index={index} />

        <FilterOperatorPicker
          cellType={effectiveCellType}
          value={condition.operator}
          onChange={handleOperatorChange}
          index={index}
        />

        <FilterValueInput
          column={selectedColumn ?? null}
          operator={condition.operator}
          value={condition.value}
          onChange={handleValueChange}
          index={index}
          inViewRelationshipOptions={inViewRelationshipOptions}
        />

        <Button
          variant="ghost"
          size="icon"
          data-testid={`vibegrid-filter-remove-${index}`}
          onClick={onRemove}
          className="h-8 w-8 shrink-0"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Inline validation error */}
      {errorMessage && (
        <span data-testid={`vibegrid-filter-error-${index}`} className="text-sm text-destructive pl-1">
          {errorMessage}
        </span>
      )}
    </div>
  )
})
