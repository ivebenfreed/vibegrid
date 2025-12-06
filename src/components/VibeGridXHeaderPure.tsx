/**
 * VibeGrid Header (MobX Version)
 *
 * Complete header with all child components migrated to MobX.
 * Includes: View Mode Toggle, Entity Add, Grouping Config, and Column Visibility controls.
 */

import { Calendar, GanttChart, LayoutList, Minus, Plus, RotateCcw } from 'lucide-react'
import { observer } from 'mobx-react-lite'
import React, { useEffect } from 'react'
import { Button } from '@/shared/components/ui/button'
import { ButtonGroup } from '@/shared/components/ui/button-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select'
import { getLogger } from '@/shared/lib/logging'
import type { VibeGridStores } from '../stores/context'
import type { ZoomLevel } from '../stores/GanttViewStore'
import { GroupConfigDropdownPure } from './GroupConfigDropdownPure'
import { VibeGridEntityAdd } from './VibeGridEntityAdd'
import { VibeGridXColumnVisibilityPure } from './VibeGridXColumnVisibilityPure'

const ZOOM_LEVELS: { value: ZoomLevel; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'quarter', label: 'Quarter' },
]

const logger = getLogger(['vibegrid', 'components', 'VibeGridXHeaderPure'])

interface VibeGridXHeaderPureProps {
  stores: VibeGridStores
  enableGrouping?: boolean
  enableGantt?: boolean
  className?: string
  entityName?: string
  orgId?: string
  createEntity: (data: Record<string, any>) => void
}

export const VibeGridXHeaderPure = observer(function VibeGridXHeaderPure({
  stores,
  enableGrouping = false,
  enableGantt = false,
  className = '',
  entityName,
  orgId,
  createEntity,
}: VibeGridXHeaderPureProps) {
  const { visualStateStore, viewModeStore, ganttViewStore } = stores

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
      enableGantt,
      viewMode: viewModeStore.mode,
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
      style={{
        minHeight: '44px',
        flexShrink: 0,
      }}
    >
      <div className="flex items-center gap-2">
        {/* View Mode Toggle - only show if gantt is enabled */}
        {enableGantt ? (
          <ButtonGroup>
            <Button
              variant={viewModeStore.isTableMode ? 'default' : 'outline'}
              size="sm"
              onClick={() => viewModeStore.setMode('table')}
              aria-pressed={viewModeStore.isTableMode}
            >
              <LayoutList className="size-4" />
              Table
            </Button>
            <Button
              variant={viewModeStore.isGanttMode ? 'default' : 'outline'}
              size="sm"
              onClick={() => viewModeStore.setMode('gantt')}
              aria-pressed={viewModeStore.isGanttMode}
            >
              <GanttChart className="size-4" />
              Gantt
            </Button>
          </ButtonGroup>
        ) : (
          <span className="text-sm font-medium">Table View</span>
        )}
        {hiddenColumnCount > 0 && (
          <span className="text-xs text-muted-foreground">
            ({hiddenColumnCount} columns hidden)
          </span>
        )}

        {/* Gantt zoom controls - only show in Gantt mode */}
        {enableGantt && viewModeStore.isGanttMode && (
          <>
            <div className="w-px h-6 bg-border mx-2" />
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => ganttViewStore.zoomOut()}
                disabled={ganttViewStore.zoomLevel === 'quarter'}
                title="Zoom out"
              >
                <Minus className="h-4 w-4" />
              </Button>

              <Select
                value={ganttViewStore.zoomLevel}
                onValueChange={(value) => ganttViewStore.setZoomLevel(value as ZoomLevel)}
              >
                <SelectTrigger className="w-24 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ZOOM_LEVELS.map((level) => (
                    <SelectItem key={level.value} value={level.value}>
                      {level.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => ganttViewStore.zoomIn()}
                disabled={ganttViewStore.zoomLevel === 'day'}
                title="Zoom in"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            <div className="w-px h-6 bg-border" />

            <Button
              variant="ghost"
              size="sm"
              onClick={() => ganttViewStore.scrollToToday()}
              title="Scroll to today"
            >
              <Calendar className="h-4 w-4 mr-1" />
              Today
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => ganttViewStore.setZoomLevel('week')}
              title="Reset to week view"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>

            {ganttViewStore.dependencies.length > 0 && (
              <>
                <div className="w-px h-6 bg-border" />
                <span className="text-xs text-muted-foreground">
                  {ganttViewStore.dependencies.length} dependencies
                </span>
              </>
            )}
          </>
        )}
      </div>

      <div className="flex items-center gap-2">
        {/* Entity Add Component */}
        {entityName && (
          <VibeGridEntityAdd
            stores={stores}
            entityName={entityName}
            orgId={orgId}
            createEntity={createEntity}
          />
        )}

        {/* Group By Dropdown */}
        {enableGrouping && <GroupConfigDropdownPure stores={stores} />}

        {/* Column Visibility Dropdown */}
        <VibeGridXColumnVisibilityPure stores={stores} />
      </div>
    </div>
  )
})
