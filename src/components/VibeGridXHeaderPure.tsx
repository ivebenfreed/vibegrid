/**
 * VibeGrid Header (MobX Version)
 *
 * Complete header with all child components migrated to MobX.
 * Includes: View Mode Toggle, Entity Add, Grouping Config, and Column Visibility controls.
 */

import { GanttChart, Kanban, LayoutList, Network } from 'lucide-react'
import { observer } from 'mobx-react-lite'
import React, { useEffect } from 'react'
import { Button } from '@/shared/components/ui/button'
import { ButtonGroup } from '@/shared/components/ui/button-group'
import { getLogger } from '@/shared/lib/logging'
import type { VibeGridStores } from '../stores/context'
import type { ViewMode } from '../stores/ViewModeStore'
import { FilterBuilder } from './FilterBuilder'
import { GroupConfigDropdownPure } from './GroupConfigDropdownPure'
import { VibeGridEntityAdd } from './VibeGridEntityAdd'
import { VibeGridXColumnVisibilityPure } from './VibeGridXColumnVisibilityPure'

const logger = getLogger(['vibegrid', 'components', 'VibeGridXHeaderPure'])

interface VibeGridXHeaderPureProps {
  stores: VibeGridStores
  enableGrouping?: boolean
  viewMode?: ViewMode
  onViewModeChange?: (mode: ViewMode) => void
  enableKanban?: boolean
  enableHierarchy?: boolean
  className?: string
  entityName?: string
  entityDisplayName?: string // User-friendly display name (e.g., "Document" instead of "GCFile")
  orgId?: string
  createEntity: (data: Record<string, any>) => void
}

export const VibeGridXHeaderPure = observer(function VibeGridXHeaderPure({
  stores,
  enableGrouping = false,
  viewMode = 'table',
  onViewModeChange,
  enableKanban = false,
  enableHierarchy = false,
  className = '',
  entityName,
  entityDisplayName,
  orgId,
  createEntity,
}: VibeGridXHeaderPureProps) {
  const { visualStateStore, hierarchyStore } = stores

  // Calculate hidden column count
  const hiddenColumnCount = visualStateStore.columns.filter(
    (col) => visualStateStore.columnVisibility[col.id] === false,
  ).length

  // Log when component mounts and on every render
  useEffect(() => {
    logger.info('🎨 VibeGridXHeaderPure MOUNTED', {
      hasStores: !!stores,
      hasVisualStateStore: !!visualStateStore,
      columnCount: visualStateStore.columns.length,
      hiddenColumnCount,
      enableGrouping,
      viewMode,
      entityName,
      hasOrgId: !!orgId,
      hasCreateEntity: !!createEntity,
    })

    return () => {
      logger.info('🧹 VibeGridXHeaderPure UNMOUNTED')
    }
  }, [])

  // Log on every render (data changes)
  logger.debug('🔄 VibeGridXHeaderPure RENDER', {
    columnCount: visualStateStore.columns.length,
    hiddenColumnCount,
    visibleColumnCount: visualStateStore.columns.length - hiddenColumnCount,
  })

  return (
    <div
      className={`vibegridx-header-toolbar flex items-center justify-between p-2 border-b bg-muted/50 ${className}`}
      data-testid="vibegrid-header"
      style={{
        minHeight: '44px',
        flexShrink: 0,
      }}
    >
      <div className="flex items-center gap-2">
        {/* View Mode Toggle - only show if callback provided */}
        {onViewModeChange ? (
          <ButtonGroup>
            <Button
              variant={viewMode === 'table' ? 'default' : 'outline'}
              size="sm"
              onClick={() => onViewModeChange('table')}
              aria-pressed={viewMode === 'table'}
              data-testid="view-mode-table"
            >
              <LayoutList className="size-4" />
              Table
            </Button>
            <Button
              variant={viewMode === 'gantt' ? 'default' : 'outline'}
              size="sm"
              onClick={() => onViewModeChange('gantt')}
              aria-pressed={viewMode === 'gantt'}
              data-testid="view-mode-gantt"
            >
              <GanttChart className="size-4" />
              Gantt
            </Button>
            {enableKanban && (
              <Button
                variant={viewMode === 'kanban' ? 'default' : 'outline'}
                size="sm"
                onClick={() => onViewModeChange('kanban')}
                aria-pressed={viewMode === 'kanban'}
                data-testid="view-mode-kanban"
              >
                <Kanban className="size-4" />
                Kanban
              </Button>
            )}
          </ButtonGroup>
        ) : (
          <span className="text-sm font-medium">Table View</span>
        )}

        {/* Hierarchy Toggle */}
        {enableHierarchy && (
          <Button
            variant={hierarchyStore.isHierarchyActive ? 'default' : 'outline'}
            size="sm"
            onClick={() => {
              if (hierarchyStore.isHierarchyActive) {
                hierarchyStore.setHierarchyMode('none')
              } else {
                hierarchyStore.setHierarchyMode('self-ref')
              }
            }}
            aria-pressed={hierarchyStore.isHierarchyActive}
            title={
              hierarchyStore.isHierarchyActive ? 'Disable hierarchy view' : 'Enable hierarchy view'
            }
            data-testid="toggle-hierarchy"
          >
            <Network className="size-4 mr-1" />
            Hierarchy
          </Button>
        )}

        {hiddenColumnCount > 0 && (
          <span className="text-xs text-muted-foreground">
            ({hiddenColumnCount} columns hidden)
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        {/* Entity Add Component */}
        {entityName && (
          <VibeGridEntityAdd
            stores={stores}
            entityName={entityName}
            entityDisplayName={entityDisplayName}
            orgId={orgId}
            createEntity={createEntity}
          />
        )}

        {/* Group By Dropdown */}
        {enableGrouping && <GroupConfigDropdownPure stores={stores} />}

        {/* Filter Builder */}
        <FilterBuilder stores={stores} />

        {/* Column Visibility Dropdown */}
        <VibeGridXColumnVisibilityPure stores={stores} />
      </div>
    </div>
  )
})
