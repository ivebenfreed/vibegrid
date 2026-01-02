import { ChevronDown, Plus, Settings2, X } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

import type { Column, GroupConfig, GroupField } from '../types'

interface GroupConfigDropdownProps {
  columns: Column[]
  groupConfig: GroupConfig | null
  onGroupConfigChange: (config: GroupConfig | null) => void
  className?: string
}

export function GroupConfigDropdown({
  columns,
  groupConfig,
  onGroupConfigChange,
  className = '',
}: GroupConfigDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)

  // Available columns for grouping (only select/enum fields suitable for grouping)
  const availableColumns = columns.filter((col) => {
    // Exclude system columns
    if (col.id === '__selection' || col.id === 'id' || col.field?.startsWith('__')) {
      return false
    }

    // Only include select and enum fields for grouping
    const cellType = col.cellType || col.type
    const hasOptions = col.options && col.options.length > 0
    const isSelectType =
      cellType === 'select' || cellType === 'select-multi' || cellType === 'reference-select'

    // Include if it's explicitly a select type OR has options (indicating enum values)
    return isSelectType || hasOptions
  })

  const handleAddGroupField = (columnId: string) => {
    const column = availableColumns.find((col) => col.id === columnId)
    if (!column) return

    const newField: GroupField = {
      field: column.field || column.id,
      label: column.name || column.id,
      sortDirection: 'asc',
    }

    const newConfig: GroupConfig = {
      fields: [...(groupConfig?.fields || []), newField],
      sortBy: 'name',
      sortDirection: 'asc',
      aggregations: groupConfig?.aggregations || [],
      expandedGroups: groupConfig?.expandedGroups || new Set(),
      colorScheme: 'auto',
    }

    onGroupConfigChange(newConfig)
    setIsOpen(false) // Close dropdown after selection
  }

  const handleRemoveGroupField = (index: number) => {
    if (!groupConfig) return

    const newFields = groupConfig.fields.filter((_, i) => i !== index)

    if (newFields.length === 0) {
      onGroupConfigChange(null)
    } else {
      onGroupConfigChange({
        ...groupConfig,
        fields: newFields,
      })
    }
  }

  const handleClearGrouping = () => {
    onGroupConfigChange(null)
    setIsOpen(false)
  }

  // Get available columns that aren't already used for grouping
  const availableForGrouping = availableColumns.filter(
    (col) => !groupConfig?.fields.some((field) => field.field === (col.field || col.id)),
  )

  const hasActiveGrouping = groupConfig && groupConfig.fields.length > 0
  const activeGroupCount = groupConfig?.fields.length || 0

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant={hasActiveGrouping ? 'default' : 'outline'}
          size="sm"
          className={`h-8 ${className}`}
        >
          <Settings2 size={14} className="mr-1" />
          Group By
          {hasActiveGrouping && (
            <Badge variant="secondary" className="ml-1 text-xs px-1 py-0">
              {activeGroupCount}
            </Badge>
          )}
          <ChevronDown size={14} className="ml-1" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {/* Current Grouping Fields */}
        {hasActiveGrouping && (
          <>
            <DropdownMenuLabel className="text-xs">Active Grouping</DropdownMenuLabel>
            {groupConfig.fields.map((field, index) => (
              <DropdownMenuItem
                key={`${field.field}-${index}`}
                className="flex items-center justify-between p-2"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="text-sm truncate">{field.label}</span>
                  <Badge variant="outline" className="text-xs">
                    {field.sortDirection === 'asc' ? 'A-Z' : 'Z-A'}
                  </Badge>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    handleRemoveGroupField(index)
                  }}
                  className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive ml-2"
                >
                  <X size={12} />
                </Button>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
          </>
        )}

        {/* Available Fields to Group By */}
        {availableForGrouping.length > 0 && (
          <>
            <DropdownMenuLabel className="text-xs">Group by Field</DropdownMenuLabel>
            {availableForGrouping.map((column) => (
              <DropdownMenuItem
                key={column.id}
                onClick={() => handleAddGroupField(column.id)}
                className="flex items-center justify-between"
              >
                <span className="text-sm">{column.name || column.id}</span>
                <Badge variant="outline" className="text-xs">
                  {column.cellType || column.type || 'select'}
                </Badge>
              </DropdownMenuItem>
            ))}
          </>
        )}

        {/* No available fields */}
        {availableForGrouping.length === 0 && !hasActiveGrouping && (
          <DropdownMenuItem disabled className="text-center text-muted-foreground">
            No groupable fields available
          </DropdownMenuItem>
        )}

        {/* Clear All Option */}
        {hasActiveGrouping && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleClearGrouping} className="text-destructive">
              <X size={14} className="mr-2" />
              Clear All Grouping
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
