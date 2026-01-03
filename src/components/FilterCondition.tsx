/**
 * FilterCondition Component
 *
 * GH#216: Multi-Level Advanced Filtering for VibeGrid
 *
 * The main row component that composes field picker, operator picker, and value input.
 * Each condition represents a single field comparison (field, operator, value).
 */

import { X } from 'lucide-react'
import { observer } from 'mobx-react-lite'
import { Button } from '@/shared/components/ui/button'
import { getLogger } from '@/shared/lib/logging'
import { FilterFieldPicker } from './FilterFieldPicker'
import { FilterOperatorPicker, getOperatorsForFieldType } from './FilterOperatorPicker'
import { FilterValueInput } from './FilterValueInput'
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
}

export const FilterCondition = observer(function FilterCondition({
  condition,
  columns,
  index,
  onChange,
  onRemove,
  className,
}: FilterConditionProps) {
  const selectedColumn = columns.find((col) => col.id === condition.field)

  const handleFieldChange = (fieldId: string) => {
    const newColumn = columns.find((col) => col.id === fieldId)
    const operators = newColumn ? getOperatorsForFieldType(newColumn.cellType ?? 'text') : []
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
    onChange({
      ...condition,
      operator,
      value: needsValue ? condition.value : null,
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
    <div
      data-testid={`vibegrid-filter-condition-${index}`}
      className={`flex items-center gap-2 ${className ?? ''}`}
    >
      <FilterFieldPicker
        columns={columns}
        value={condition.field}
        onChange={handleFieldChange}
        index={index}
      />

      <FilterOperatorPicker
        cellType={selectedColumn?.cellType ?? 'text'}
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
  )
})
