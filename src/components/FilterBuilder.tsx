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
 * Phase 4: Integrated FilterGroup for nested conditions with AND/OR toggle.
 * Phase 7: Validation and complexity warnings.
 */

import { AlertTriangle, Filter, Plus } from 'lucide-react'
import { observer } from 'mobx-react-lite'
import React from 'react'
import { Button } from '@/shared/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu'
import { getLogger } from '@/shared/lib/logging'
import type { VibeGridStores } from '../stores/context'
import type { FilterGroup as FilterGroupType } from '../types/filter-types'
import { FilterGroup } from './FilterGroup'

const logger = getLogger(['vibegrid', 'FilterBuilder'])

export interface FilterBuilderProps {
  stores: VibeGridStores
  className?: string
}

export const FilterBuilder = observer(function FilterBuilder({
  stores,
  className,
}: FilterBuilderProps) {
  const { interactionStore, visualStateStore, tableCoreStore } = stores
  const { filterBuilderState } = interactionStore
  const { activeFilterCount, filterGroup } = visualStateStore
  const { draftFilterGroup } = filterBuilderState
  const { hasValidationErrors, showComplexityWarning } = interactionStore

  // Get columns from tableCoreStore for FilterGroup
  const columns = tableCoreStore.columns

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

  // Handle draft filter group changes from FilterGroup component
  const handleDraftFilterGroupChange = React.useCallback(
    (updatedGroup: FilterGroupType) => {
      interactionStore.setDraftFilter(updatedGroup)
      logger.debug('Draft filter group updated', {
        conditionCount: updatedGroup.conditions.length,
      })
    },
    [interactionStore],
  )

  // Handle add first condition (creates initial draft group if needed)
  const handleAddCondition = React.useCallback(() => {
    if (!draftFilterGroup) {
      // Create initial draft group with one empty condition
      const newGroup: FilterGroupType = {
        logic: 'AND',
        conditions: [
          {
            id: crypto.randomUUID(),
            field: '',
            operator: 'equals',
            value: null,
          },
        ],
      }
      interactionStore.setDraftFilter(newGroup)
      logger.info('Created initial draft filter group')
    }
    // If draft already exists, the FilterGroup component handles adding conditions
  }, [interactionStore, draftFilterGroup])

  // Handle clear button click
  const handleClear = React.useCallback(() => {
    interactionStore.setDraftFilter(null)
    visualStateStore.clearFilterGroup()
    interactionStore.closeFilterBuilder()
    logger.info('Filters cleared')
  }, [interactionStore, visualStateStore])

  // Handle apply button click
  const handleApply = React.useCallback(() => {
    if (draftFilterGroup) {
      visualStateStore.applyFilterGroup(draftFilterGroup)
      logger.info('Filters applied', {
        conditionCount: draftFilterGroup.conditions.length,
      })
    }
    interactionStore.closeFilterBuilder()
  }, [interactionStore, visualStateStore, draftFilterGroup])

  // Determine which filter group to display (draft takes precedence)
  const displayFilterGroup = draftFilterGroup ?? filterGroup

  return (
    <DropdownMenu open={filterBuilderState.isOpen} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" data-testid="vibegrid-filter-btn" className={className}>
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
        className="w-[500px] p-4"
        align="start"
        onKeyDown={handleKeyDown}
      >
        {/* Complexity warning */}
        {showComplexityWarning && (
          <div
            data-testid="vibegrid-filter-complexity-warning"
            className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 px-3 py-2 rounded mb-2"
          >
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Complex filter: 10+ conditions may slow down filtering
          </div>
        )}

        {/* Filter group or empty state */}
        {displayFilterGroup ? (
          <FilterGroup
            group={displayFilterGroup}
            columns={columns}
            depth={0}
            onChange={handleDraftFilterGroupChange}
            className="mb-4"
          />
        ) : (
          <div className="text-center text-muted-foreground py-4">
            <p className="mb-2">No filters applied</p>
            <Button
              variant="ghost"
              size="sm"
              data-testid="vibegrid-filter-add-condition"
              onClick={handleAddCondition}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add condition
            </Button>
          </div>
        )}

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
            disabled={hasValidationErrors}
            onClick={handleApply}
          >
            Apply
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
})
