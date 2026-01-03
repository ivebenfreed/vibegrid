/**
 * FilterBuilder Component
 *
 * GH#216: Multi-Level Advanced Filtering for VibeGrid
 *
 * Dropdown component for building advanced filter conditions with AND/OR logic.
 * Supports up to 3 levels of nesting (Notion-style).
 *
 * Phase 2: Basic dropdown structure with empty state, add condition button,
 * and apply/clear buttons.
 */

import { Filter, Plus } from 'lucide-react'
import { observer } from 'mobx-react-lite'
import React from 'react'
import { Button } from '@/shared/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/shared/components/ui/dropdown-menu'
import { getLogger } from '@/shared/lib/logging'
import type { VibeGridStores } from '../stores/context'

const logger = getLogger(['vibegrid', 'FilterBuilder'])

export interface FilterBuilderProps {
  stores: VibeGridStores
  className?: string
}

export const FilterBuilder = observer(function FilterBuilder({
  stores,
  className,
}: FilterBuilderProps) {
  const { interactionStore, visualStateStore } = stores
  const { filterBuilderState } = interactionStore
  const { activeFilterCount, filterGroup } = visualStateStore

  // Handle keyboard events for Escape key
  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Escape') {
        interactionStore.closeFilterBuilder()
      }
    },
    [interactionStore],
  )

  // Handle open/close state changes
  const handleOpenChange = React.useCallback(
    (open: boolean) => {
      if (open) {
        interactionStore.openFilterBuilder()
      } else {
        interactionStore.closeFilterBuilder()
      }
    },
    [interactionStore],
  )

  // Handle add condition button click
  const handleAddCondition = React.useCallback(() => {
    // Will be implemented in Phase 3
    logger.info('Add condition clicked')
  }, [])

  // Handle clear button click
  const handleClear = React.useCallback(() => {
    // Will clear filters in Phase 6
    interactionStore.closeFilterBuilder()
  }, [interactionStore])

  // Handle apply button click
  const handleApply = React.useCallback(() => {
    // Will apply filters in Phase 6
    interactionStore.closeFilterBuilder()
  }, [interactionStore])

  return (
    <DropdownMenu
      open={filterBuilderState.isOpen}
      onOpenChange={handleOpenChange}
    >
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          data-testid="vibegrid-filter-btn"
          className={className}
        >
          <Filter className="h-4 w-4 mr-2" />
          Filters
          {activeFilterCount > 0 && (
            <span className="ml-1 rounded-full bg-primary px-1.5 text-xs text-primary-foreground">
              {activeFilterCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        data-testid="vibegrid-filter-dropdown"
        className="w-[400px] p-4"
        align="start"
        onKeyDown={handleKeyDown}
      >
        {/* Empty state */}
        {!filterBuilderState.draftFilterGroup && !filterGroup && (
          <div className="text-center text-muted-foreground py-4">
            No filters applied
          </div>
        )}

        {/* Add condition button */}
        <Button
          variant="ghost"
          size="sm"
          data-testid="vibegrid-filter-add-condition"
          className="w-full justify-start"
          onClick={handleAddCondition}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add condition
        </Button>

        {/* Footer with Apply/Clear */}
        <div className="flex justify-end gap-2 mt-4 pt-4 border-t">
          <Button
            variant="ghost"
            size="sm"
            data-testid="vibegrid-filter-clear"
            onClick={handleClear}
          >
            Clear
          </Button>
          <Button
            size="sm"
            data-testid="vibegrid-filter-apply"
            onClick={handleApply}
          >
            Apply
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
})
