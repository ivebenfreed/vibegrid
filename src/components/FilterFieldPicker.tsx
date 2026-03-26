/**
 * FilterFieldPicker Component
 *
 * GH#216: Multi-Level Advanced Filtering for VibeGrid
 *
 * Searchable dropdown for selecting which column/field to filter.
 * Used within FilterCondition rows.
 *
 * Phase 3: Field picker with search, column list, and selection state.
 */

import { Check, ChevronDown, Search } from 'lucide-react'
import { observer } from 'mobx-react-lite'
import { useMemo, useState } from 'react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/components/ui/popover'
import { cn } from '@/shared/lib/utils'
import type { Column } from '../types'

export interface FilterFieldPickerProps {
  columns: Column[]
  value: string | null
  onChange: (fieldId: string) => void
  index: number
  className?: string
}

export const FilterFieldPicker = observer(function FilterFieldPicker({
  columns,
  value,
  onChange,
  index,
  className,
}: FilterFieldPickerProps) {
  const [open, setOpen] = useState(false)
  const [searchValue, setSearchValue] = useState('')

  const filteredColumns = useMemo(() => {
    if (!searchValue) return columns
    const lower = searchValue.toLowerCase()
    return columns.filter((col) => col.name.toLowerCase().includes(lower) || col.id.toLowerCase().includes(lower))
  }, [columns, searchValue])

  const selectedColumn = columns.find((col) => col.id === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            data-testid={`vibegrid-filter-field-${index}`}
            className={cn('w-[180px] justify-between', className)}
          />
        }
      >
        {selectedColumn?.name ?? 'Select field...'}
        <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0">
        <div className="flex items-center border-b px-3 py-2">
          <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
          <Input
            placeholder="Search fields..."
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            className="h-8 border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
          />
        </div>
        <div className="max-h-[300px] overflow-y-auto p-1">
          {filteredColumns.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No fields found.</p>
          ) : (
            filteredColumns.map((column) => (
              <button
                key={column.id}
                type="button"
                onClick={() => {
                  onChange(column.id)
                  setOpen(false)
                  setSearchValue('')
                }}
                className={cn(
                  'relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground',
                  value === column.id && 'bg-accent',
                )}
              >
                <Check className={cn('mr-2 h-4 w-4', value === column.id ? 'opacity-100' : 'opacity-0')} />
                {column.name}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
})
