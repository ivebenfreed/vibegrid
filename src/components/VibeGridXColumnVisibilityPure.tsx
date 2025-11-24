import { ChevronDown, Columns3, Eye, EyeOff } from 'lucide-react'
import { observer } from 'mobx-react-lite'
import React from 'react'
import { Button } from '@/shared/components/ui/button'
import { Checkbox } from '@/shared/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu'
import { Input } from '@/shared/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip'
import { createLogger } from '@/shared/lib/logging'
import { formatFieldName } from '../column-defaults'
import type { VibeGridStores } from '../stores/context'
import type { Column } from '../types'

const fileLog = createLogger('components/vibegrid/components/VibeGridXColumnVisibilityPure')

interface VibeGridXColumnVisibilityPureProps {
  stores: VibeGridStores
  className?: string
}

export const VibeGridXColumnVisibilityPure = observer(function VibeGridXColumnVisibilityPure({
  stores,
  className = '',
}: VibeGridXColumnVisibilityPureProps) {
  const { tableCoreStore, interactionStore, visualStateStore } = stores

  // Get reactive data from MobX stores
  const columns = visualStateStore.columns
  const columnVisibility = visualStateStore.columnVisibility
  const isOpen = interactionStore.columnVisibilityMenuState.isOpen
  const searchValue = interactionStore.columnVisibilityMenuState.searchValue

  // Count hidden/visible columns
  const hiddenColumnCount = columns.filter((col) => columnVisibility[col.id] === false).length
  const visibleColumnCount = columns.filter((col) => columnVisibility[col.id] !== false).length

  // Event handlers using store action methods
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

  // Only calculate expensive operations when dropdown is open
  const filteredColumns = React.useMemo(() => {
    if (!isOpen) return [] // Don't calculate unless dropdown is open
    if (!searchValue) return columns
    return columns.filter((column) => {
      const displayName = getColumnDisplayName(column)
      return (
        displayName.toLowerCase().includes(searchValue.toLowerCase()) ||
        column.id.toLowerCase().includes(searchValue.toLowerCase()) ||
        (column.field && column.field.toLowerCase().includes(searchValue.toLowerCase()))
      )
    })
  }, [columns, searchValue, isOpen])

  // Categorize columns only when dropdown is open
  const categorizedColumns = React.useMemo(() => {
    if (!isOpen) return { required: [], business: [], system: [] } // Don't calculate unless dropdown is open

    const required: Column[] = []
    const business: Column[] = []
    const system: Column[] = []

    filteredColumns.forEach((column) => {
      const isRequired = column.hideable === false
      const isSystem = column.meta?.systemField

      if (isRequired) {
        required.push(column)
      } else if (isSystem) {
        system.push(column)
      } else {
        business.push(column)
      }
    })

    return { required, business, system }
  }, [filteredColumns, isOpen])

  const isColumnHidden = (columnId: string): boolean => {
    return columnVisibility[columnId] === false
  }

  const isColumnVisible = (columnId: string): boolean => {
    // Ensure explicit boolean value - treat undefined as true (default visible)
    const visible = columnVisibility[columnId] === false ? false : true
    return visible
  }

  const canHideColumn = (column: Column): boolean => {
    return column.hideable !== false
  }

  const getColumnDisplayName = (column: Column): string => {
    // Use explicit name if available, otherwise format the field/id
    return column.name || formatFieldName(column.field || column.id)
  }

  const renderColumnItem = (column: Column, isRequired: boolean, category: string = 'default') => {
    const isVisible = isColumnVisible(column.id)
    const canHide = canHideColumn(column)

    const columnItem = (
      <DropdownMenuItem
        className={`flex items-center space-x-2 ${!canHide ? 'opacity-60' : ''}`}
        onSelect={(e) => e.preventDefault()}
      >
        <Checkbox
          checked={isVisible}
          disabled={!canHide}
          onCheckedChange={(checked) => {
            if (canHide) {
              handleToggleColumn(column.id)
            }
          }}
        />
        <span className="flex-1 text-sm">{getColumnDisplayName(column)}</span>
        {isRequired && <span className="text-xs text-muted-foreground">Required</span>}
        {canHide && (
          <span className="text-xs text-muted-foreground opacity-60">
            {isVisible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
          </span>
        )}
      </DropdownMenuItem>
    )

    if (isRequired) {
      return (
        <Tooltip key={`${category}-${column.id}`}>
          <TooltipTrigger asChild>{columnItem}</TooltipTrigger>
          <TooltipContent>
            <p>This field is required and cannot be hidden</p>
          </TooltipContent>
        </Tooltip>
      )
    }

    return <div key={`${category}-${column.id}`}>{columnItem}</div>
  }

  const hidableColumnCount = columns.filter((col) => canHideColumn(col)).length

  return (
    <DropdownMenu open={isOpen} onOpenChange={handleOpenChange} modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className={`h-8 px-2 ${className}`}>
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
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        className="w-64 data-[state=open]:animate-none data-[state=closed]:animate-none"
        align="end"
        sideOffset={8}
        avoidCollisions={true}
        sticky="always"
        updatePositionStrategy="optimized"
        side="bottom"
        alignOffset={-8}
      >
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Column Visibility</span>
          <span className="text-xs text-muted-foreground">
            {visibleColumnCount}/{columns.length}
          </span>
        </DropdownMenuLabel>

        <div className="px-2 pb-2">
          <Input
            placeholder="Search columns..."
            value={searchValue}
            onChange={handleSearchChange}
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

        {/* Required Fields */}
        {categorizedColumns.required.length > 0 && (
          <>
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Required Fields ({categorizedColumns.required.length})
            </DropdownMenuLabel>
            {categorizedColumns.required.map((col) => renderColumnItem(col, true, 'required'))}
            {(categorizedColumns.business.length > 0 || categorizedColumns.system.length > 0) && (
              <DropdownMenuSeparator />
            )}
          </>
        )}

        {/* Business Fields */}
        {categorizedColumns.business.length > 0 && (
          <>
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Business Fields ({categorizedColumns.business.length})
            </DropdownMenuLabel>
            {categorizedColumns.business.map((col) => renderColumnItem(col, false, 'business'))}
            {categorizedColumns.system.length > 0 && <DropdownMenuSeparator />}
          </>
        )}

        {/* System Fields */}
        {categorizedColumns.system.length > 0 && (
          <>
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              System Fields ({categorizedColumns.system.length})
            </DropdownMenuLabel>
            {categorizedColumns.system.map((col) => renderColumnItem(col, false, 'system'))}
          </>
        )}

        {/* No Results */}
        {filteredColumns.length === 0 && searchValue && (
          <div className="px-2 py-4 text-center text-xs text-muted-foreground">
            No columns found matching "{searchValue}"
          </div>
        )}

        {/* Footer Info */}
        <DropdownMenuSeparator />
        <div className="px-2 py-2 text-xs text-muted-foreground">
          <div className="flex justify-between">
            <span>Visible: {visibleColumnCount}</span>
            <span>Hidden: {hiddenColumnCount}</span>
          </div>
          {hidableColumnCount < columns.length && (
            <div className="mt-1 text-xs opacity-75">
              {columns.length - hidableColumnCount} required field(s) always visible
            </div>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
})
