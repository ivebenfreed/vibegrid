import {
  closestCenter,
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { observer } from '@legendapp/state/react'
import { ChevronDown, GripVertical, Plus, Settings2, X } from 'lucide-react'
import React from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { formatFieldName } from '../column-defaults'
import type { TableCore$ } from '../stores/data-state'
import type { TableInteraction$ } from '../stores/interaction-state'
import { createVibeGridVisualState } from '../stores/visual-state'
import type { Column, GroupConfig, GroupField } from '../types'

interface GroupConfigDropdownPureProps {
  tableCore$: TableCore$
  tableInteraction$: TableInteraction$
  visualState: ReturnType<typeof createVibeGridVisualState>
  className?: string
}

interface SortableGroupFieldProps {
  field: GroupField
  index: number
  onRemove: (index: number) => void
}

const SortableGroupField = ({ field, index, onRemove }: SortableGroupFieldProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `${field.field}-${index}`,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.8 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center justify-between p-2 rounded-sm hover:bg-accent/50 cursor-grab active:cursor-grabbing"
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing p-1 hover:bg-accent rounded text-muted-foreground"
        >
          <GripVertical size={12} />
        </div>
        <span className="text-sm truncate">{field.displayName}</span>
        {index === 0 && (
          <Badge variant="outline" className="text-xs px-1">
            Primary
          </Badge>
        )}
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onRemove(index)
        }}
        className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive ml-2"
      >
        <X size={12} />
      </Button>
    </div>
  )
}

export const GroupConfigDropdownPure = observer(function GroupConfigDropdownPure({
  tableCore$,
  tableInteraction$,
  visualState,
  className = '',
}: GroupConfigDropdownPureProps) {
  // Get reactive data from observables
  const columns = tableCore$.columns.get()
  const groupConfig = tableCore$.groupConfig.get()
  const isOpen = tableInteraction$.groupConfigMenuState.isOpen.get()

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  // Event handlers using observable methods
  const handleOpenChange = React.useCallback(
    (open: boolean) => {
      if (open) {
        tableInteraction$.openGroupConfigMenu()
      } else {
        tableInteraction$.closeGroupConfigMenu()
      }
    },
    [tableInteraction$],
  )

  const handleDragEnd = React.useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event

      if (active.id !== over?.id && groupConfig) {
        // Extract indices from the drag item ids
        const activeIndex = groupConfig.fields.findIndex(
          (field, index) => `${field.field}-${index}` === active.id,
        )
        const overIndex = groupConfig.fields.findIndex(
          (field, index) => `${field.field}-${index}` === over?.id,
        )

        if (activeIndex !== -1 && overIndex !== -1) {
          const reorderedFields = arrayMove(groupConfig.fields, activeIndex, overIndex)

          // Explicitly create a new GroupConfig to ensure Set is properly cloned
          const newConfig: GroupConfig = {
            fields: reorderedFields,
            sortBy: groupConfig.sortBy,
            sortDirection: groupConfig.sortDirection,
            aggregations: groupConfig.aggregations,
            expandedGroups: new Set(groupConfig.expandedGroups), // Explicitly clone the Set
            colorScheme: groupConfig.colorScheme,
          }

          visualState.visualOperations.setGroupConfig(newConfig)
        }
      }
    },
    [groupConfig, visualState],
  )

  // Available columns for grouping (only select/enum fields suitable for grouping)
  const availableColumns = React.useMemo(() => {
    return columns.filter((col) => {
      // Exclude system columns
      if (col.id === '__selection' || col.id === 'id' || col.field?.startsWith('__')) {
        return false
      }

      // Only include select and enum fields for grouping
      const cellType = col.cellType || col.type
      const hasOptions = col.options && col.options.length > 0

      // Check for all single-select types that can be grouped
      const singleSelectTypes = [
        'select',
        'single-select',
        'reference-select',
        'user_reference',
        'entity_reference',
        'custom_user_reference',
        'custom_entity_reference',
        'priority_option',
        'status_option',
        'category_option',
        'task_type_option',
      ]

      const isSelectType = singleSelectTypes.includes(cellType as string)

      // Exclude multi-select types from grouping
      const isMultiSelect = cellType === 'select-multi' || cellType === 'multi-select'

      // Include if it's a single-select type OR has options (but not multi-select)
      return (isSelectType || hasOptions) && !isMultiSelect
    })
  }, [columns])

  const handleAddGroupField = React.useCallback(
    (columnId: string) => {
      const column = availableColumns.find((col) => col.id === columnId)
      if (!column) return

      const newField: GroupField = {
        field: column.field || column.id,
        displayName: column.label || formatFieldName(column.field || column.id),
      }

      const newConfig: GroupConfig = {
        fields: [...(groupConfig?.fields || []), newField],
        sortBy: 'name',
        sortDirection: 'asc',
        aggregations: groupConfig?.aggregations || [],
        expandedGroups: new Set(), // Start with all groups collapsed, user can expand as needed
        colorScheme: 'auto',
      }

      visualState.visualOperations.setGroupConfig(newConfig)
      tableInteraction$.closeGroupConfigMenu()
    },
    [availableColumns, groupConfig, visualState, tableInteraction$],
  )

  const handleRemoveGroupField = React.useCallback(
    (index: number) => {
      if (!groupConfig) return

      const newFields = groupConfig.fields.filter((_, i) => i !== index)

      if (newFields.length === 0) {
        visualState.visualOperations.setGroupConfig(null)
      } else {
        // Explicitly create a new GroupConfig to ensure Set is properly cloned
        const newConfig: GroupConfig = {
          fields: newFields,
          sortBy: groupConfig.sortBy,
          sortDirection: groupConfig.sortDirection,
          aggregations: groupConfig.aggregations,
          expandedGroups: new Set(groupConfig.expandedGroups), // Explicitly clone the Set
          colorScheme: groupConfig.colorScheme,
        }
        visualState.visualOperations.setGroupConfig(newConfig)
      }
    },
    [groupConfig, visualState],
  )

  const handleClearGrouping = React.useCallback(() => {
    visualState.visualOperations.setGroupConfig(null)
    tableInteraction$.closeGroupConfigMenu()
  }, [visualState, tableInteraction$])

  // Get available columns that aren't already used for grouping
  const availableForGrouping = React.useMemo(() => {
    return availableColumns.filter(
      (col) => !groupConfig?.fields.some((field) => field.field === (col.field || col.id)),
    )
  }, [availableColumns, groupConfig])

  const hasActiveGrouping = groupConfig && groupConfig.fields.length > 0
  const activeGroupCount = groupConfig?.fields.length || 0

  return (
    <DropdownMenu open={isOpen} onOpenChange={handleOpenChange}>
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
            <div className="px-1">
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={groupConfig.fields.map((field, index) => `${field.field}-${index}`)}
                  strategy={verticalListSortingStrategy}
                >
                  {groupConfig.fields.map((field, index) => (
                    <SortableGroupField
                      key={`${field.field}-${index}`}
                      field={field}
                      index={index}
                      onRemove={handleRemoveGroupField}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            </div>
            <DropdownMenuSeparator />
          </>
        )}

        {/* Available Fields to Group By */}
        {availableForGrouping.length > 0 && (
          <>
            <DropdownMenuLabel className="text-xs">Group by Field</DropdownMenuLabel>
            {availableForGrouping.map((column) => {
              // Format the type label for better user understanding
              const cellType = column.cellType || column.type || 'select'
              let typeLabel = 'Select'

              if (['user_reference', 'custom_user_reference'].includes(cellType as string)) {
                typeLabel = 'User'
              } else if (
                ['entity_reference', 'custom_entity_reference'].includes(cellType as string)
              ) {
                typeLabel = 'Relationship'
              } else if (cellType === 'priority_option') {
                typeLabel = 'Priority'
              } else if (cellType === 'status_option' || cellType === 'status') {
                typeLabel = 'Status'
              } else if (cellType === 'category_option') {
                typeLabel = 'Category'
              } else if (cellType === 'task_type_option') {
                typeLabel = 'Type'
              } else if (
                ['select', 'single-select', 'reference-select'].includes(cellType as string)
              ) {
                typeLabel = 'Select'
              }

              return (
                <DropdownMenuItem
                  key={column.id}
                  onClick={() => handleAddGroupField(column.id)}
                  className="flex items-center justify-between"
                >
                  <span className="text-sm">
                    {column.label || formatFieldName(column.field || column.id)}
                  </span>
                  <Badge variant="outline" className="text-xs">
                    {typeLabel}
                  </Badge>
                </DropdownMenuItem>
              )
            })}
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
})
