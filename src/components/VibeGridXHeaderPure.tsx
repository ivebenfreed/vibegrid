/**
 * VibeGrid Header (MobX Version)
 *
 * Complete header with all child components migrated to MobX.
 * Includes: View Mode Toggle, Grouping Config, and Column Visibility controls.
 */

import { Download, GanttChart, Kanban, LayoutList, Link2, Network } from 'lucide-react'
import { observer } from 'mobx-react-lite'
import { useEffect, useMemo } from 'react'
import { Button } from '@/shared/components/ui/button'
import { ButtonGroup } from '@/shared/components/ui/button-group'
import { getLogger } from '@/shared/lib/logging'
import type { SchemaFieldDescriptor } from '../modules/GridModule'
import type { GridModuleRenderProps } from '../modules/GridModule'
import { viewModeRegistry } from '../modules'
import type { VibeGridStores } from '../stores/context'
import type { ViewMode } from '../stores/ViewModeStore'
import { FilterBuilder } from './FilterBuilder'
import { GroupConfigDropdownPure } from './GroupConfigDropdownPure'
import { SmartSearchInput } from './SmartSearchInput'
import { VibeGridXColumnVisibilityPure } from './VibeGridXColumnVisibilityPure'
import { ViewPicker } from './ViewPicker'
import type { ViewPickerProps } from './ViewPicker'

const logger = getLogger(['vibegrid', 'components', 'VibeGridXHeaderPure'])

/** Search configuration for smart text search (GH#1391) */
export interface SearchConfig {
  /** Columns to search. Defaults to all columns with isTextType() */
  searchableColumns?: string[]
  /** Placeholder text for search input. Defaults to "Search..." */
  searchPlaceholder?: string
  /** Disable smart search entirely. Defaults to false */
  disableSearch?: boolean
}

interface VibeGridXHeaderPureProps {
  stores: VibeGridStores
  enableGrouping?: boolean
  viewMode?: ViewMode
  onViewModeChange?: (mode: ViewMode) => void
  /** Schema field descriptors for registry-driven view gating (GH#2139) */
  schemaFields?: SchemaFieldDescriptor[]
  enableHierarchy?: boolean
  enableRowExpansion?: boolean // GH#1240 - Show expand all / collapse all buttons
  className?: string
  /** Smart text search configuration (GH#1391) */
  searchConfig?: SearchConfig
  /** Enable CSV export button in toolbar (GH#1551) */
  enableExport?: boolean
  /** Callback to export all filtered rows as CSV (GH#1551) */
  onExportAll?: () => void
  /** Copy link callback for URL state sharing (GH#1570) */
  onCopyLink?: () => void
  /** View picker props for saved views (GH#1570 P2.3) — when provided, replaces ButtonGroup */
  viewPickerProps?: Omit<ViewPickerProps, 'currentViewMode'>
  /** Leading content rendered before view picker (e.g., page title + record count) */
  toolbarLeading?: React.ReactNode
  /** Trailing content rendered after export button (e.g., creation button) */
  toolbarTrailing?: React.ReactNode
}

export const VibeGridXHeaderPure = observer(function VibeGridXHeaderPure({
  stores,
  enableGrouping = false,
  viewMode = 'table',
  onViewModeChange,
  schemaFields,
  enableHierarchy = false,
  enableRowExpansion: _enableRowExpansion = false,
  className = '',
  searchConfig,
  enableExport = false,
  onExportAll,
  onCopyLink,
  viewPickerProps,
  toolbarLeading,
  toolbarTrailing,
}: VibeGridXHeaderPureProps) {
  const { visualStateStore, hierarchyStore, tableCoreStore } = stores

  // Registry-driven view mode gating (GH#2139)
  const availableModules = useMemo(() => {
    const renderProps: GridModuleRenderProps = {
      tableId: '',
      entityType: '',
      schemaFields,
    }
    return viewModeRegistry.getAvailableModules(renderProps, stores)
  }, [schemaFields, stores])

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
    })

    return () => {
      logger.info('🧹 VibeGridXHeaderPure UNMOUNTED')
    }
  }, [enableGrouping, hiddenColumnCount, stores, viewMode, visualStateStore])

  // Log on every render (data changes)
  logger.debug('🔄 VibeGridXHeaderPure RENDER', {
    columnCount: visualStateStore.columns.length,
    hiddenColumnCount,
    visibleColumnCount: visualStateStore.columns.length - hiddenColumnCount,
  })

  return (
    <div
      className={`vibegridx-header-toolbar flex flex-wrap items-center justify-between gap-y-1 p-2 border-b bg-muted/50 ${className}`}
      data-testid="vibegrid-header"
      style={{
        minHeight: '44px',
        flexShrink: 0,
      }}
    >
      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 min-w-0">
        {/* Leading content (e.g., page title + record count) */}
        {toolbarLeading}

        {/* View Picker (saved views) — GH#1570 */}
        {viewPickerProps && <ViewPicker {...viewPickerProps} currentViewMode={viewMode} />}

        {/* View Mode Toggle — GH#2139 */}
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
              <span className="hidden sm:inline">Table</span>
            </Button>
            {availableModules.includes('gantt') && (
              <Button
                variant={viewMode === 'gantt' ? 'default' : 'outline'}
                size="sm"
                onClick={() => onViewModeChange('gantt')}
                aria-pressed={viewMode === 'gantt'}
                data-testid="view-mode-gantt"
              >
                <GanttChart className="size-4" />
                <span className="hidden sm:inline">Gantt</span>
              </Button>
            )}
            {availableModules.includes('kanban') && (
              <Button
                variant={viewMode === 'kanban' ? 'default' : 'outline'}
                size="sm"
                onClick={() => onViewModeChange('kanban')}
                aria-pressed={viewMode === 'kanban'}
                data-testid="view-mode-kanban"
              >
                <Kanban className="size-4" />
                <span className="hidden sm:inline">Kanban</span>
              </Button>
            )}
          </ButtonGroup>
        ) : !viewPickerProps ? (
          <span className="text-sm font-medium">Table View</span>
        ) : null}

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
            title={hierarchyStore.isHierarchyActive ? 'Disable hierarchy view' : 'Enable hierarchy view'}
            data-testid="toggle-hierarchy"
          >
            <Network className="size-4 mr-1" />
            <span className="hidden sm:inline">Hierarchy</span>
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 min-w-0">
        {/* Group By Dropdown */}
        {enableGrouping && <GroupConfigDropdownPure stores={stores} />}

        {/* Smart Text Search (GH#1391) */}
        {!searchConfig?.disableSearch && (
          <SmartSearchInput stores={stores} placeholder={searchConfig?.searchPlaceholder} />
        )}

        {/* Filter Builder */}
        <FilterBuilder stores={stores} />

        {/* Column Visibility Dropdown */}
        <VibeGridXColumnVisibilityPure stores={stores} />

        {/* Copy Link Button (GH#1570) */}
        {onCopyLink && (
          <Button
            variant="outline"
            size="sm"
            onClick={onCopyLink}
            title="Copy link to current view"
            data-testid="toolbar-copy-link"
          >
            <Link2 className="size-4" />
          </Button>
        )}

        {/* CSV Export Button (GH#1551) */}
        {enableExport && onExportAll && (
          <Button
            variant="outline"
            size="sm"
            onClick={onExportAll}
            disabled={tableCoreStore.isIncrementalProcessing}
            title={tableCoreStore.isIncrementalProcessing ? 'Processing data...' : 'Export as CSV'}
            data-testid="toolbar-export-csv"
          >
            <Download className="size-4" />
          </Button>
        )}

        {/* Trailing content (e.g., creation button) */}
        {toolbarTrailing}
      </div>
    </div>
  )
})
