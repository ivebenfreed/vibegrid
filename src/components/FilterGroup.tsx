/**
 * FilterGroup Component
 *
 * GH#216: Multi-Level Advanced Filtering for VibeGrid
 *
 * Recursive component for nested AND/OR filter groups.
 * Supports up to 3 levels of nesting (Notion-style).
 *
 * Phase 4: Nested FilterGroup with AND/OR toggle
 */

import { Plus, Trash2 } from 'lucide-react'
import { observer } from 'mobx-react-lite'
import { Button } from '@/shared/components/ui/button'
import { getLogger } from '@/shared/lib/logging'
import { FilterCondition } from './FilterCondition'
import type { InViewRelationshipOption } from './FilterRelationshipValue'
import type { FilterCondition as FilterConditionType, FilterGroup as FilterGroupType } from '../types/filter-types'
import type { Column } from '../types'

const logger = getLogger(['vibegrid', 'FilterGroup'])

export interface FilterGroupProps {
  group: FilterGroupType
  columns: Column[]
  depth: number // 0-based depth
  onChange: (group: FilterGroupType) => void
  onRemove?: () => void // Optional - root group can't be removed
  className?: string
  /** Distinct relationship targets present in the grid's loaded rows, by column id. */
  inViewRelationshipOptions?: Record<string, readonly InViewRelationshipOption[]>
}

const MAX_DEPTH = 3

/**
 * Type guard to check if a condition is a nested FilterGroup
 */
function isFilterGroup(item: FilterConditionType | FilterGroupType): item is FilterGroupType {
  return 'logic' in item && ('conditions' in item || !('field' in item))
}

/**
 * Generate a stable key for a filter group based on its position and logic
 * Since nested groups don't have IDs, we use depth + index + logic as a compound key
 */
function getGroupKey(depth: number, index: number, logic: 'AND' | 'OR'): string {
  return `group-${depth}-${index}-${logic}`
}

export const FilterGroup = observer(function FilterGroup({
  group,
  columns,
  depth,
  onChange,
  onRemove,
  className,
  inViewRelationshipOptions,
}: FilterGroupProps) {
  const canAddGroup = depth < MAX_DEPTH - 1 // Can add if we're not at max depth

  const toggleLogic = () => {
    const newLogic = group.logic === 'AND' ? 'OR' : 'AND'
    logger.debug('Toggle logic', { from: group.logic, to: newLogic, depth })
    onChange({ ...group, logic: newLogic })
  }

  const addCondition = () => {
    const newCondition: FilterConditionType = {
      id: crypto.randomUUID(),
      field: '',
      operator: 'equals',
      value: null,
    }
    logger.debug('Add condition', { depth, conditionId: newCondition.id })
    onChange({ ...group, conditions: [...group.conditions, newCondition] })
  }

  const addGroup = () => {
    if (!canAddGroup) {
      logger.debug('Cannot add group - max depth reached', { depth, maxDepth: MAX_DEPTH })
      return
    }
    const newGroup: FilterGroupType = {
      logic: 'AND',
      conditions: [],
    }
    logger.debug('Add nested group', { depth, newDepth: depth + 1 })
    onChange({ ...group, conditions: [...group.conditions, newGroup] })
  }

  const updateCondition = (index: number, updated: FilterConditionType | FilterGroupType) => {
    const newConditions = [...group.conditions]
    newConditions[index] = updated
    logger.debug('Update condition', { index, depth })
    onChange({ ...group, conditions: newConditions })
  }

  const removeCondition = (index: number) => {
    logger.debug('Remove condition', { index, depth })
    onChange({ ...group, conditions: group.conditions.filter((_, i) => i !== index) })
  }

  return (
    <div
      data-testid={`vibegrid-filter-group-${depth}`}
      className={`${depth > 0 ? 'pl-4 border-l-2 border-muted' : ''} ${className ?? ''}`}
    >
      {/* Group header with AND/OR toggle */}
      <div className="flex items-center gap-2 mb-2">
        <Button
          variant="outline"
          size="sm"
          data-testid={`vibegrid-filter-logic-toggle-${depth}`}
          onClick={toggleLogic}
          className="text-xs font-medium min-w-[50px]"
        >
          {group.logic}
        </Button>
        {onRemove && (
          <Button
            variant="ghost"
            size="icon"
            data-testid={`vibegrid-filter-group-remove-${depth}`}
            onClick={onRemove}
            className="h-6 w-6"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        )}
      </div>

      {/* Conditions and nested groups */}
      <div className="space-y-2">
        {group.conditions.map((item, index) =>
          isFilterGroup(item) ? (
            // Nested group - recursive render
            <FilterGroup
              key={getGroupKey(depth + 1, index, item.logic)}
              group={item}
              columns={columns}
              depth={depth + 1}
              onChange={(updated) => updateCondition(index, updated)}
              onRemove={() => removeCondition(index)}
              inViewRelationshipOptions={inViewRelationshipOptions}
            />
          ) : (
            // Condition row
            <FilterCondition
              key={item.id}
              condition={item}
              columns={columns}
              index={index}
              onChange={(updated) => updateCondition(index, updated)}
              onRemove={() => removeCondition(index)}
              inViewRelationshipOptions={inViewRelationshipOptions}
            />
          ),
        )}
      </div>

      {/* Add buttons */}
      <div className="flex gap-2 mt-2">
        <Button variant="ghost" size="sm" data-testid={`vibegrid-filter-add-condition-${depth}`} onClick={addCondition}>
          <Plus className="h-3 w-3 mr-1" /> Condition
        </Button>
        {canAddGroup && (
          <Button variant="ghost" size="sm" data-testid={`vibegrid-filter-add-group-${depth}`} onClick={addGroup}>
            <Plus className="h-3 w-3 mr-1" /> Group
          </Button>
        )}
      </div>
    </div>
  )
})
