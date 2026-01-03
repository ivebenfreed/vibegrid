/**
 * FilterValueInput Component
 *
 * GH#216: Multi-Level Advanced Filtering for VibeGrid
 *
 * Field-type aware input component for filter conditions.
 * Shows appropriate input control based on field type and operator.
 *
 * Supported field types:
 * - text: Regular text input
 * - number/currency/percent: Number input
 * - date/datetime: Date picker
 * - boolean/checkbox: Toggle switch
 * - status/single_select: Select dropdown with options
 * - relationship: Text input (entity picker is complex, deferred)
 * - is_empty/is_not_empty operators: No input needed
 */

import { observer } from 'mobx-react-lite'
import { Input } from '@/shared/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select'
import { Switch } from '@/shared/components/ui/switch'
import type { CellType } from '../column-types'
import type { Column, FilterOperator } from '../types'

// Cell types that render as boolean/checkbox
const BOOLEAN_CELL_TYPES: ReadonlySet<string> = new Set(['boolean', 'checkbox'])

// Cell types that render as select/dropdown with options
const SELECT_CELL_TYPES: ReadonlySet<string> = new Set([
  'status',
  'status_option',
  'single-select',
  'select',
  'priority_option',
  'category_option',
  'task_type_option',
  'discussion_type_option',
])

// Cell types that render as number input
const NUMBER_CELL_TYPES: ReadonlySet<string> = new Set([
  'number',
  'integer',
  'decimal',
  'currency',
  'percentage',
])

// Cell types that render as date input
const DATE_CELL_TYPES: ReadonlySet<string> = new Set([
  'date',
  'datetime',
  'datetime-local',
  'timestamp',
  'timestamptz',
])

export interface FilterValueInputProps {
  column: Column | null
  operator: FilterOperator | null
  value: any
  onChange: (value: any) => void
  index: number
  className?: string
}

export const FilterValueInput = observer(function FilterValueInput({
  column,
  operator,
  value,
  onChange,
  index,
  className,
}: FilterValueInputProps) {
  // Empty operators don't need a value
  if (operator === 'is_empty' || operator === 'is_not_empty') {
    return (
      <div
        data-testid={`vibegrid-filter-value-${index}`}
        className="text-sm text-muted-foreground italic px-2"
      >
        (no value needed)
      </div>
    )
  }

  if (!column) {
    return (
      <Input
        data-testid={`vibegrid-filter-value-${index}`}
        placeholder="Select field first"
        disabled
        className={className}
      />
    )
  }

  const cellType: CellType | string = column.cellType ?? 'text'

  // Boolean field
  if (BOOLEAN_CELL_TYPES.has(cellType)) {
    return (
      <div data-testid={`vibegrid-filter-value-${index}`} className="flex items-center gap-2">
        <Switch checked={value === true} onCheckedChange={(checked) => onChange(checked)} />
        <span className="text-sm">{value ? 'True' : 'False'}</span>
      </div>
    )
  }

  // Enum/Status field with options
  if (SELECT_CELL_TYPES.has(cellType) && column.options) {
    return (
      <Select value={value ?? ''} onValueChange={onChange}>
        <SelectTrigger data-testid={`vibegrid-filter-value-${index}`} className={className}>
          <SelectValue placeholder="Select value..." />
        </SelectTrigger>
        <SelectContent>
          {(
            column.options as Array<{ id?: string; value?: string; label?: string; name?: string }>
          ).map((opt) => (
            <SelectItem key={opt.id || opt.value} value={opt.value || opt.id || ''}>
              {opt.label || opt.name || opt.value}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }

  // Number field
  if (NUMBER_CELL_TYPES.has(cellType)) {
    return (
      <Input
        type="number"
        data-testid={`vibegrid-filter-value-${index}`}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.valueAsNumber || null)}
        placeholder="Enter number..."
        className={className}
      />
    )
  }

  // Date field
  if (DATE_CELL_TYPES.has(cellType)) {
    return (
      <Input
        type="date"
        data-testid={`vibegrid-filter-value-${index}`}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className={className}
      />
    )
  }

  // Default: Text input (also handles relationship fields for now)
  return (
    <Input
      type="text"
      data-testid={`vibegrid-filter-value-${index}`}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Enter value..."
      className={className}
    />
  )
})
