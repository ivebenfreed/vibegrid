import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ChevronDown, Columns3, Eye, EyeOff, GripVertical, Save } from 'lucide-react'
import { observer } from 'mobx-react-lite'
import React from 'react'
import { toast } from 'sonner'
import { orpcClient } from '@/shared/data/orpc/client'
import { Button } from '@/shared/components/ui/button'
import { Checkbox } from '@/shared/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu'
import { Input } from '@/shared/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip'
import { getLogger } from '@/shared/lib/logging'
import { formatFieldName } from '../column-defaults'
import type { VibeGridStores } from '../stores/context'
import type { Column } from '../types'

const fileLog = getLogger(['vibegrid', 'components', 'VibeGridXColumnVisibilityPure'])

interface VibeGridXColumnVisibilityPureProps {
  stores: VibeGridStores
  className?: string
}

// System column IDs that don't exist in the schema (not persistable)
const SYSTEM_COLUMN_IDS = new Set([
  '__selection',
  '__row_number',
  '__drag_handle',
  '__row_actions',
  'selection',
  'row-expand',
  'row-number',
  'row-actions',
  'drag-handle',
])

interface SortableColumnItemProps {
  column: Column
  isVisible: boolean
  canHide: boolean
  isDraggable: boolean
  isSearchMatch: boolean
  onToggle: (columnId: string) => void
  getDisplayName: (column: Column) => string
}

const SortableColumnItem = observer(function SortableColumnItem({
  column,
  isVisible,
  canHide,
  isDraggable,
  isSearchMatch,
  onToggle,
  getDisplayName,
}: SortableColumnItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: column.id,
    disabled: !isDraggable,
  })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : isSearchMatch ? 1 : 0.35,
    zIndex: isDragging ? 10 : undefined,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-1.5 px-2 py-1 rounded-sm hover:bg-accent ${!canHide ? 'opacity-60' : ''} ${isSearchMatch ? 'bg-accent/50' : ''}`}
    >
      {/* Drag handle */}
      <span
        {...(isDraggable ? { ...attributes, ...listeners } : {})}
        className={`text-muted-foreground flex-shrink-0 ${isDraggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-default opacity-0'}`}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </span>

      {/* Checkbox */}
      <Checkbox
        checked={isVisible}
        disabled={!canHide}
        onCheckedChange={() => {
          if (canHide) onToggle(column.id)
        }}
      />

      {/* Column name */}
      <span className="flex-1 text-sm truncate">{getDisplayName(column)}</span>

      {/* Required badge */}
      {!canHide && <span className="text-xs text-muted-foreground flex-shrink-0">Required</span>}
    </div>
  )
})

export const VibeGridXColumnVisibilityPure = observer(function VibeGridXColumnVisibilityPure({
  stores,
  className = '',
}: VibeGridXColumnVisibilityPureProps) {
  const { interactionStore, visualStateStore } = stores

  // Get reactive data from MobX stores
  const columns = visualStateStore.columns
  const columnVisibility = visualStateStore.columnVisibility
  const columnOrder = visualStateStore.columnOrder
  const isOpen = interactionStore.columnVisibilityMenuState.isOpen
  const searchValue = interactionStore.columnVisibilityMenuState.searchValue
  const entityType = visualStateStore.entityType

  // DnD state
  const [_isDragging, setIsDragging] = React.useState(false)
  const [isSaving, setIsSaving] = React.useState(false)

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  // Count hidden/visible columns
  const hiddenColumnCount = columns.filter((col) => columnVisibility[col.id] === false).length
  const visibleColumnCount = columns.filter((col) => columnVisibility[col.id] !== false).length

  // Event handlers
  const handleOpenChange = React.useCallback(
    (open: boolean) => {
      fileLog.debug('ColumnVisibility dropdown state change', { isOpen: open })
      if (open) {
        interactionStore.openColumnVisibilityMenu()
      } else {
        interactionStore.closeColumnVisibilityMenu()
      }
    },
    [interactionStore],
  )

  const handleToggleColumn = React.useCallback(
    (columnId: string) => {
      visualStateStore.toggleColumnVisibility(columnId)
    },
    [visualStateStore],
  )

  const handleShowAll = React.useCallback(() => {
    visualStateStore.showAllColumns()
    interactionStore.setColumnVisibilitySearch('')
  }, [visualStateStore, interactionStore])

  const handleHideAll = React.useCallback(() => {
    visualStateStore.hideAllColumns()
    interactionStore.setColumnVisibilitySearch('')
  }, [visualStateStore, interactionStore])

  const handleSearchChange = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      interactionStore.setColumnVisibilitySearch(e.target.value)
    },
    [interactionStore],
  )

  // DnD handlers
  const handleDragStart = React.useCallback(() => {
    setIsDragging(true)
  }, [])

  const handleDragEnd = React.useCallback(
    (event: DragEndEvent) => {
      setIsDragging(false)
      const { active, over } = event
      if (!over || active.id === over.id) return

      const currentOrder = columnOrder.length > 0 ? columnOrder : columns.map((c) => c.id)
      const oldIndex = currentOrder.indexOf(active.id as string)
      const newIndex = currentOrder.indexOf(over.id as string)

      if (oldIndex !== -1 && newIndex !== -1) {
        const newOrder = arrayMove(currentOrder, oldIndex, newIndex)
        visualStateStore.setColumnOrder(newOrder)
      }
    },
    [columnOrder, columns, visualStateStore],
  )

  // Save column order to schema
  const handleSaveToSchema = React.useCallback(async () => {
    if (!entityType) return

    const currentOrder = columnOrder.length > 0 ? columnOrder : columns.map((c) => c.id)
    // Only include schema fields (exclude system/UI columns)
    const schemaFieldOrder = currentOrder.filter((id) => !SYSTEM_COLUMN_IDS.has(id))

    setIsSaving(true)
    try {
      const result = (await orpcClient.dataforge.schema.reorderFields({
        entityName: entityType,
        fieldOrder: schemaFieldOrder,
      })) as { success: boolean; error?: string }

      if (result.success) {
        toast.success('Column order saved to schema')
      } else {
        toast.error(result.error || 'Failed to save column order')
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save column order'
      toast.error(msg)
    } finally {
      setIsSaving(false)
    }
  }, [entityType, columnOrder, columns])

  // Helper functions
  const getColumnDisplayName = React.useCallback((column: Column): string => {
    return column.name || formatFieldName(column.field || column.id)
  }, [])

  const isColumnVisible = (columnId: string): boolean => {
    return columnVisibility[columnId] !== false
  }

  const canHideColumn = (column: Column): boolean => {
    return column.hideable !== false
  }

  const isDraggableColumn = (column: Column): boolean => {
    return !SYSTEM_COLUMN_IDS.has(column.id)
  }

  const hidableColumnCount = columns.filter((col) => canHideColumn(col)).length

  // Build sorted column list for display (respects current columnOrder)
  const sortedColumns = React.useMemo(() => {
    if (!isOpen) return []
    const order = columnOrder.length > 0 ? columnOrder : columns.map((c) => c.id)
    const colMap = new Map(columns.map((c) => [c.id, c]))
    const ordered = order.map((id) => colMap.get(id)).filter((c): c is Column => c != null)
    // Append any columns not in order (safety)
    const inOrder = new Set(order)
    const extra = columns.filter((c) => !inOrder.has(c.id))
    return [...ordered, ...extra]
  }, [columns, columnOrder, isOpen])

  // Set of column IDs matching the search (empty search = all match)
  const matchingColumnIds = React.useMemo(() => {
    if (!searchValue) return null // null means "all match"
    const query = searchValue.toLowerCase()
    const ids = new Set<string>()
    for (const column of sortedColumns) {
      const displayName = getColumnDisplayName(column)
      if (
        displayName.toLowerCase().includes(query) ||
        column.id.toLowerCase().includes(query) ||
        (column.field && column.field.toLowerCase().includes(query))
      ) {
        ids.add(column.id)
      }
    }
    return ids
  }, [sortedColumns, searchValue, getColumnDisplayName])

  return (
    <DropdownMenu open={isOpen} onOpenChange={handleOpenChange} modal={false}>
      <DropdownMenuTrigger
        render={<Button variant="outline" size="sm" className={`h-8 px-2 ${className}`} />}
      >
        <Columns3 className="h-4 w-4 mr-1" />
        <span className="text-xs">
          Columns
          {hiddenColumnCount > 0 && (
            <span className="ml-1 px-1.5 py-0.5 bg-muted rounded text-muted-foreground">
              {hiddenColumnCount} hidden
            </span>
          )}
        </span>
        <ChevronDown className="h-3 w-3 ml-1" />
      </DropdownMenuTrigger>

      <DropdownMenuContent
        className="w-64 data-[open]:animate-none data-[closed]:animate-none"
        align="end"
        sideOffset={8}
        side="bottom"
        alignOffset={-8}
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex items-center justify-between">
            <span>Columns</span>
            <span className="text-xs text-muted-foreground">
              {visibleColumnCount}/{columns.length}
            </span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>

        <div className="px-2 pb-2">
          <Input
            placeholder="Search columns..."
            value={searchValue}
            onChange={handleSearchChange}
            onKeyDown={(e) => e.stopPropagation()}
            className="h-8 text-xs"
          />
        </div>

        <DropdownMenuSeparator />

        {/* Show/Hide All Controls */}
        <div className="flex gap-1 px-2 pb-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs flex-1"
            onClick={handleShowAll}
          >
            <Eye className="h-3 w-3 mr-1" />
            Show All
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs flex-1"
            onClick={handleHideAll}
            disabled={hidableColumnCount === 0}
          >
            <EyeOff className="h-3 w-3 mr-1" />
            Hide All
          </Button>
        </div>

        <DropdownMenuSeparator />

        {/* Sortable Column List */}
        <div className="py-1 max-h-64 overflow-y-auto">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={sortedColumns.map((c) => c.id)}
              strategy={verticalListSortingStrategy}
            >
              {sortedColumns.map((column) => (
                <SortableColumnItem
                  key={column.id}
                  column={column}
                  isVisible={isColumnVisible(column.id)}
                  canHide={canHideColumn(column)}
                  isDraggable={isDraggableColumn(column)}
                  isSearchMatch={matchingColumnIds === null || matchingColumnIds.has(column.id)}
                  onToggle={handleToggleColumn}
                  getDisplayName={getColumnDisplayName}
                />
              ))}
            </SortableContext>
          </DndContext>

          {matchingColumnIds !== null && matchingColumnIds.size === 0 && (
            <div className="px-2 py-4 text-center text-xs text-muted-foreground">
              No columns matching "{searchValue}"
            </div>
          )}
        </div>

        <DropdownMenuSeparator />

        {/* Footer */}
        <div className="px-2 py-2 space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Visible: {visibleColumnCount}</span>
            <span>Hidden: {hiddenColumnCount}</span>
          </div>

          {/* Save to Schema button */}
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs w-full"
                  onClick={handleSaveToSchema}
                  disabled={isSaving || !entityType}
                />
              }
            >
              <Save className="h-3 w-3 mr-1" />
              {isSaving ? 'Saving...' : 'Save Order to Schema'}
            </TooltipTrigger>
            <TooltipContent>
              <p>Persist current column order as the default for all users</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
})
