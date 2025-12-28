/**
 * VibeGrid - High-Performance Data Grid Component
 *
 * Migrated to MobX + TanStack DB architecture
 *
 * Architecture:
 * - MobX stores for UI state management
 * - TanStack DB for entity data
 * - Direct DOM rendering for performance
 * - React components for controls and overlays
 */

import { useLiveQuery } from '@tanstack/react-db'
import { autorun, reaction } from 'mobx'
import { observer } from 'mobx-react-lite'
import type React from 'react'
import { useCallback, useEffect, useRef } from 'react'
import { membersCollection } from '@/shared/data/db/collections/member-collection'
import { useDependencyCollection } from '@/shared/data/db/hooks/useEntityCollection'
import { getLogger } from '@/shared/lib/logging'
import { ActionsBar } from './components/ActionsBar'
import { GRID_DIMENSIONS } from './constants/grid-dimensions'
import { CutoffResizer } from './components/CutoffResizer'
import { DebugOverlay } from './components/DebugOverlay'
import { GanttTimeline } from './components/GanttTimeline'
import { GanttToolbar } from './components/GanttToolbar'
import { VibeGridLoadingOverlay } from './components/VibeGridLoadingOverlay'
import { VibeGridXHeaderPure } from './components/VibeGridXHeaderPure'
import { useVibeGridData } from './hooks/useVibeGridData'
import { useVibeGridHierarchy } from './hooks/useVibeGridHierarchy'
import { SimplePassiveRenderer } from './renderers/core/SimplePassiveRenderer'
import { useVibeGridStores, VibeGridStoreProvider } from './stores/context'

// Import VibeGrid CSS styles
import './vibegridx.css'

// Import logging presets (exposes __VIBEGRID_LOGS__ on window)
import './utils/logging-presets'

const logger = getLogger(['vibegrid', 'VibeGrid'])

// ====================================
// ROW ACTION TYPES
// ====================================

export interface RowAction {
  id: string
  label: string
  icon?: React.ComponentType<{ className?: string }>
  onClick?: (rowData: any) => void | Promise<void>
  destructive?: boolean // Red color, requires confirmation
  hidden?: (rowData: any) => boolean // Conditional visibility
}

// ====================================
// COMPONENT PROPS
// ====================================

interface VibeGridProps<T = any> {
  tableId: string // Unique identifier for this table instance
  entityType: string // Entity type (determines data source)
  orgId?: string // Organization ID for multi-tenant support

  // Common options
  className?: string
  height?: number | string
  width?: number | string

  // Event handlers (all optional)
  onCellClick?: (rowId: string, columnId: string) => void
  onCellDoubleClick?: (rowId: string, columnId: string) => void
  onSelectionChange?: (selectedCells: Set<string>) => void
  onEditingChange?: (editingCell: { rowId: string; columnId: string } | null) => void
  onPerformanceUpdate?: (metrics: any) => void
  onEntityUpdate?: (rowId: string, updates: Record<string, any>) => Promise<void> | void
  onBatchEntityUpdate?: (
    updates: Array<{ id: string; updates: Record<string, any> }>,
  ) => Promise<void> | void

  // Row actions (optional)
  rowActions?: RowAction[]
  onRowAction?: (actionId: string, rowIds: string[], rowsData: any[]) => void | Promise<void>

  // Built-in delete action (optional)
  enableDelete?: boolean
  onDelete?: (rowIds: string[], rowsData: any[]) => Promise<void>
  deleteConfirmation?: (rowsData: any[]) => string | React.ReactNode

  // Performance options
  enableVirtualScrolling?: boolean
  bufferSize?: number

  // Feature flags
  enableGrouping?: boolean
  enableFiltering?: boolean
  enableSorting?: boolean
  enableDragAndDrop?: boolean
  enableSelectionColumn?: boolean
  enableHierarchy?: boolean

  // Gantt view (props-based, no MobX toggle)
  viewMode?: 'table' | 'gantt'
  onViewModeChange?: (mode: 'table' | 'gantt') => void
}

// ====================================
// INNER COMPONENT (Uses MobX stores from context)
// ====================================

function VibeGridInnerBase(props: VibeGridProps) {
  const {
    tableId,
    entityType,
    orgId,
    className = '',
    height = 600,
    width = '100%',
    enableSelectionColumn = true,
    onCellClick,
    onCellDoubleClick,
    onSelectionChange,
    onEditingChange,
    onPerformanceUpdate,
    onEntityUpdate,
    onBatchEntityUpdate,
    rowActions,
    onRowAction,
    enableDelete,
    onDelete,
    deleteConfirmation,
    enableVirtualScrolling = true,
    bufferSize = 10,
    enableGrouping = true,
    enableFiltering = true,
    enableSorting = true,
    enableDragAndDrop = true,
    enableHierarchy = false,
    viewMode = 'table',
    onViewModeChange,
  } = props

  // ====================================
  // GET MOBX STORES FROM CONTEXT
  // ====================================

  const stores = useVibeGridStores()
  const {
    tableCoreStore,
    visualStateStore,
    interactionStore,
    editingStore,
    initStore,
    viewModeStore,
    ganttViewStore,
    hierarchyStore,
    debugStore,
  } = stores

  // NOTE: Field types are lazily loaded in InitStore.initializeStores() before TableCoreStore.init()
  // This ensures they're only loaded when VibeGrid is actually rendered, not at app startup.

  // Props-based view mode (no MobX toggle)
  const isGanttMode = viewMode === 'gantt'
  const cutoffWidth = viewModeStore.cutoffWidth

  // ====================================
  // TANSTACK DB INTEGRATION
  // ====================================

  // NOTE: useVibeGridData now pushes rows directly to tableCoreStore.setRows()
  // This eliminates the need for a useEffect bridge and prevents duplicate updates
  // on server echo after optimistic updates
  const {
    isLoading: isDataLoading,
    collection,
    createEntity,
    updateEntity,
    deleteEntity,
  } = useVibeGridData(entityType, tableCoreStore, visualStateStore, initStore)

  // Load hierarchy relationships when hierarchy mode is enabled
  useVibeGridHierarchy({
    entityType,
    hierarchyStore,
    tableCoreStore,
  })

  // Fetch organization members for UserReference fields (automatic org context)
  const {
    data: members = [],
    isLoading: membersLoading,
    status: membersStatus,
  } = useLiveQuery((q) => q.from({ members: membersCollection }))

  // Get dependency collection for Gantt (only when in gantt mode)
  const dependencyCollection = useDependencyCollection(isGanttMode ? entityType : '')

  // Fetch dependencies reactively using TanStack DB live query
  const { data: rawDependencies = [] } = useLiveQuery(
    (q) => {
      if (!dependencyCollection) return undefined
      return q.from({ dep: dependencyCollection }).select(({ dep }: any) => ({ ...dep }))
    },
    [dependencyCollection],
  )

  // Sync dependencies to GanttViewStore for arrow rendering
  useEffect(() => {
    if (!ganttViewStore || !isGanttMode) return

    // Convert raw dependencies to GanttDependency format
    const ganttDeps = rawDependencies.map((dep: any) => ({
      id: dep.id,
      sourceEntityId: dep.sourceEntityId,
      targetEntityId: dep.targetEntityId,
      dependencyType: dep.dependencyType || 'finish_to_start',
    }))

    ganttViewStore.setDependencies(ganttDeps)
    logger.debug('Synced dependencies to GanttViewStore', {
      count: ganttDeps.length,
      entityType,
    })
  }, [rawDependencies, ganttViewStore, isGanttMode, entityType])

  // Log members query status
  useEffect(() => {
    logger.info('[MEMBERS] useLiveQuery status', {
      status: membersStatus,
      isLoading: membersLoading,
      memberCount: members?.length || 0,
      hasMembersData: members && members.length > 0,
      firstMember: members?.[0],
    })
  }, [members, membersLoading, membersStatus])

  // ====================================
  // REFS
  // ====================================

  const containerRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<SimplePassiveRenderer | null>(null)

  // NOTE: The old "SYNC TANSTACK DB DATA → TABLECORE STORE" useEffect has been removed.
  // useVibeGridData now pushes directly to tableCoreStore.setRows() internally,
  // which eliminates duplicate updates on server echo after optimistic updates.

  // Initialize baseline snapshot when both schema AND data are ready
  // CRITICAL: This ensures baseline is created on initial load, not on first edit
  // Without this, detectChangedCells() returns empty on first edit → versions don't increment → observer doesn't fire
  useEffect(() => {
    if (!stores || !stores.initStore || !tableCoreStore) return

    const { schemaLoaded, entityDataLoaded } = stores.initStore.hydrationState

    if (schemaLoaded && entityDataLoaded) {
      logger.info('[VGDEBUG] 🎯 Both schema and data loaded - initializing baseline snapshot', {
        schemaLoaded,
        entityDataLoaded,
        columnCount: tableCoreStore.columns.length,
      })
      tableCoreStore.initializeBaselineSnapshot()
    }
  }, [
    stores?.initStore.hydrationState.schemaLoaded,
    stores?.initStore.hydrationState.entityDataLoaded,
    tableCoreStore,
    stores,
  ])

  // Sync members data to store for UserReference fields
  useEffect(() => {
    if (!tableCoreStore) return
    logger.debug('Syncing members to TableCoreStore', { memberCount: members.length })
    tableCoreStore.setMembersData(members)
  }, [members, tableCoreStore])

  // Set TanStack DB collection on InteractionStore for entity mutations
  useEffect(() => {
    if (!interactionStore || !collection) return
    logger.info('Setting TanStack DB collection on InteractionStore', {
      hasCollection: !!collection,
      entityType,
    })
    interactionStore.setCollection(collection)
  }, [collection, interactionStore, entityType])

  // Set TanStack DB collection on TableCoreStore for cross-group moves
  useEffect(() => {
    if (!tableCoreStore || !collection) return
    logger.info('Setting TanStack DB collection on TableCoreStore', {
      hasCollection: !!collection,
      entityType,
    })
    tableCoreStore.setCollection(collection)
  }, [collection, tableCoreStore, entityType])

  // Set TanStack DB collection on EditingStore for edit persistence
  useEffect(() => {
    if (!editingStore || !collection) return
    logger.info('Setting TanStack DB collection on EditingStore', {
      hasCollection: !!collection,
      entityType,
    })
    editingStore.setCollection(collection)
  }, [collection, editingStore, entityType])

  // Set TanStack DB collection on GanttViewStore for bar drag persistence
  useEffect(() => {
    if (!ganttViewStore || !collection) return
    logger.info('Setting TanStack DB collection on GanttViewStore', {
      hasCollection: !!collection,
      entityType,
    })
    ganttViewStore.setCollection(collection)
  }, [collection, ganttViewStore, entityType])

  // Set TanStack DB dependency collection on GanttViewStore for optimistic updates
  useEffect(() => {
    if (!ganttViewStore) return
    logger.info('Setting TanStack DB dependency collection on GanttViewStore', {
      hasDependencyCollection: !!dependencyCollection,
      entityType,
      isGanttMode,
    })
    ganttViewStore.setDependencyCollection(dependencyCollection)
  }, [dependencyCollection, ganttViewStore, entityType, isGanttMode])

  // Auto-detect status and progress fields for Gantt bar coloring
  useEffect(() => {
    if (!ganttViewStore || !isGanttMode || !tableCoreStore) return

    const columns = tableCoreStore.columns
    if (!columns || columns.length === 0) return

    // Find status field (look for 'status' in name or type)
    const statusCol = columns.find((col: any) => {
      const id = col.id?.toLowerCase() || ''
      const name = (col.name || '').toLowerCase()
      const type = (col.type || col.cellType || '').toLowerCase()
      return id === 'status' || name === 'status' || type === 'status' || type === 'status_set'
    })

    // Find progress field (look for 'progress', 'percent', 'completion')
    const progressCol = columns.find((col: any) => {
      const id = col.id?.toLowerCase() || ''
      const name = (col.name || '').toLowerCase()
      return (
        id.includes('progress') ||
        id.includes('percent') ||
        id.includes('completion') ||
        name.includes('progress') ||
        name.includes('percent') ||
        name.includes('completion')
      )
    })

    const updates: { statusField?: string; progressField?: string } = {}
    if (statusCol && !ganttViewStore.fieldMapping.statusField) {
      updates.statusField = statusCol.id

      // Extract status color options from column editor metadata
      const editorOptions = (statusCol as any).editor?.options || []
      if (editorOptions.length > 0) {
        const colorOptions = editorOptions
          .filter((opt: any) => opt.value && opt.backgroundColor)
          .map((opt: any) => ({
            value: opt.value,
            label: opt.label || opt.value,
            color: opt.color || '#000000',
            backgroundColor: opt.backgroundColor,
          }))
        if (colorOptions.length > 0) {
          ganttViewStore.setStatusColorMap(colorOptions)
          logger.info('Set status color map from schema', { count: colorOptions.length })
        }
      }
    }
    if (progressCol && !ganttViewStore.fieldMapping.progressField) {
      updates.progressField = progressCol.id
    }

    if (Object.keys(updates).length > 0) {
      logger.info('Auto-detected Gantt field mappings', updates)
      ganttViewStore.setFieldMapping(updates)
    }
  }, [ganttViewStore, isGanttMode, tableCoreStore, tableCoreStore?.columns])

  // ====================================
  // INITIALIZATION
  // ====================================

  useEffect(() => {
    const initializeRenderer = async () => {
      try {
        logger.info('🚀 Initializing VibeGrid renderer', {
          tableId,
          entityType,
          storesReady: !!stores,
          rowCount: tableCoreStore?.processedRows?.length || 0,
        })

        // Check if stores are available
        if (!stores || !stores.initStore) {
          logger.warn('[VGDEBUG] ⚠️ Stores not ready for initialization')
          return
        }

        // Wait for container
        if (!containerRef.current) {
          logger.warn('[VGDEBUG] ⚠️ Container ref not available')
          return
        }

        // Mark container as ready
        stores.initStore.markReady('containerReady')
        logger.info('[VGDEBUG] ✅ Container ready')

        // Wait for stores to be initialized
        if (!visualStateStore.columns.length) {
          logger.info('[VGDEBUG] ⏳ Waiting for columns to load...', {
            columnCount: visualStateStore.columns.length,
          })
          return
        }

        logger.info('[VGDEBUG] ✅ About to create SimplePassiveRenderer', {
          columnCount: visualStateStore.columns.length,
        })

        // Create the SimplePassiveRenderer with MobX stores
        const renderer = new SimplePassiveRenderer({
          container: containerRef.current,
          stores, // Pass MobX stores directly
          entityType,
          enableSelectionColumn,
          bufferSize,
          // Use updateEntity from hook as fallback if onEntityUpdate prop not provided
          onEntityUpdate: onEntityUpdate || updateEntity,
          onBatchEntityUpdate,
          onCellClick, // ✅ Thread onCellClick to InteractionCoordinator
        })

        rendererRef.current = renderer

        logger.info('✅ SimplePassiveRenderer created successfully')

        // Set up resize observer
        const resizeObserver = new ResizeObserver(() => {
          if (containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect()
            visualStateStore.updateViewportDimensions(rect.width, rect.height)
          }
        })

        resizeObserver.observe(containerRef.current)
        ;(renderer as any).resizeObserver = resizeObserver

        // Initial viewport update
        const initialRect = containerRef.current.getBoundingClientRect()
        visualStateStore.updateViewportDimensions(initialRect.width, initialRect.height)

        logger.info('🎯 VibeGrid fully initialized', {
          entityType,
          tableId,
          rowCount: tableCoreStore?.processedRows?.length || 0,
        })
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error'
        logger.error('❌ Failed to initialize VibeGrid', { err })
      }
    }

    // Use MobX autorun to reactively trigger initialization when columns are ready
    // This allows us to avoid having visualStateStore.columns in React dependencies
    // NOTE: Field types are already initialized by InitStore.initializeStores() before columns load
    const disposer = autorun(() => {
      // Read columns.length inside autorun to track it
      const hasColumns = visualStateStore.columns.length > 0

      if (stores && hasColumns && !rendererRef.current) {
        logger.info('🎯 MobX autorun: Columns ready, initializing renderer', {
          columnCount: visualStateStore.columns.length,
        })
        initializeRenderer()
      }
    })

    // Cleanup only on unmount
    return () => {
      // Dispose MobX autorun
      disposer()

      if (rendererRef.current) {
        logger.debug('🧹 Cleaning up VibeGrid')

        // Cleanup resize observer
        if ((rendererRef.current as any).resizeObserver) {
          ;(rendererRef.current as any).resizeObserver.disconnect()
        }

        rendererRef.current.destroy()
        rendererRef.current = null
      }
    }
  }, [stores]) // Only depend on stores - MobX autorun handles columns readiness!

  // ====================================
  // ROW ACTIONS HELPER
  // ====================================

  // Helper function to get row data by ID
  const getRowData = (rowId: string) => {
    return tableCoreStore.processedRows.find((row) => row.id === rowId)
  }

  // ====================================
  // GANTT VIEW CALLBACKS
  // ====================================

  // Handle cutoff resize (updates MobX store)
  const handleCutoffResize = useCallback(
    (newWidth: number) => {
      viewModeStore.setCutoffWidth(newWidth)
    },
    [viewModeStore],
  )

  // Handle resize end (could persist to localStorage/backend later)
  const handleResizeEnd = useCallback(() => {
    logger.debug('Cutoff resize ended', { width: viewModeStore.cutoffWidth })
  }, [viewModeStore.cutoffWidth])

  // Handle double-click reset
  const handleCutoffReset = useCallback(() => {
    viewModeStore.resetCutoffWidth()
  }, [viewModeStore])

  // Sync vertical scroll between table (VisualStateStore) and Gantt (GanttViewStore)
  // This ensures both panes scroll together vertically
  useEffect(() => {
    if (!isGanttMode) return

    // Track which store initiated the scroll to avoid infinite loops
    let scrollSource: 'table' | 'gantt' | null = null

    // Table → Gantt: When table scrolls vertically, sync to Gantt
    const disposeTableToGantt = reaction(
      () => visualStateStore.scrollTop,
      (tableScrollTop) => {
        if (scrollSource === 'gantt') {
          scrollSource = null
          return
        }
        if (Math.abs(ganttViewStore.scrollTop - tableScrollTop) > 1) {
          scrollSource = 'table'
          ganttViewStore.setScrollTop(tableScrollTop)
        }
      },
    )

    // Gantt → Table: When Gantt scrolls vertically, sync to table
    // IMPORTANT: We must scroll the actual DOM element, not just update the store
    // The store update alone doesn't trigger DOM scroll which breaks virtual rendering
    const disposeGanttToTable = reaction(
      () => ganttViewStore.scrollTop,
      (ganttScrollTop) => {
        if (scrollSource === 'table') {
          scrollSource = null
          return
        }
        // Find the table viewport and scroll it directly
        const viewport = containerRef.current?.querySelector('.vibegridx-viewport')
        if (viewport && Math.abs(viewport.scrollTop - ganttScrollTop) > 1) {
          scrollSource = 'gantt'
          viewport.scrollTop = ganttScrollTop
          // The DOM scroll event will update visualStateStore automatically
        }
      },
    )

    return () => {
      disposeTableToGantt()
      disposeGanttToTable()
    }
  }, [isGanttMode, visualStateStore, ganttViewStore])

  // ====================================
  // DERIVED STATE
  // ====================================

  // Use rendererRef to determine if ready - avoids MobX tracking of visualStateStore.columns
  const isReady = stores && !isDataLoading
  const isRendered = !!rendererRef.current

  // Header should show as soon as stores are ready (don't wait for renderer)
  const shouldShowHeader = isReady && visualStateStore.columns.length > 0

  // Log header visibility decision
  useEffect(() => {
    logger.info('📊 Header visibility check', {
      shouldShowHeader,
      isReady,
      isRendered,
      showLoadingOverlay: !isReady || !isRendered,
      columnCount: visualStateStore.columns.length,
      isDataLoading,
      hasStores: !!stores,
    })
  }, [
    shouldShowHeader,
    isReady,
    isRendered,
    visualStateStore.columns.length,
    isDataLoading,
    stores,
  ])

  // ====================================
  // RENDER
  // ====================================

  return (
    <div
      className={`vibegridx-container ${className}`}
      data-testid={`vibegrid-pure-${tableId}`}
      data-entity-type={entityType}
      style={{
        width,
        height,
        position: 'relative',
        outline: 'none',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Loading overlay */}
      {(!isReady || !isRendered) && initStore && (
        <div className="absolute inset-0 z-10">
          <VibeGridLoadingOverlay initStore={initStore} height={height} width={width} />
        </div>
      )}

      {/* Debug overlay - enable via console: __VIBEGRID_DEBUG__.enable() */}
      {debugStore && <DebugOverlay debugStore={debugStore} />}

      {/* Header with menu components - Show as soon as columns are ready */}
      {shouldShowHeader && (
        <VibeGridXHeaderPure
          stores={stores}
          enableGrouping={enableGrouping}
          viewMode={viewMode}
          onViewModeChange={onViewModeChange}
          enableHierarchy={enableHierarchy}
          entityName={entityType}
          orgId={orgId}
          createEntity={createEntity}
        />
      )}

      {/* Gantt toolbar - spans full width above split pane */}
      {isGanttMode && <GanttToolbar />}

      {/* Main content area - Table or Split Pane (Gantt) */}
      {/* IMPORTANT: containerRef must always be the same DOM element to keep renderer attached */}
      <div className="flex-1 flex flex-row overflow-hidden" style={{ minHeight: 0 }}>
        {/* Table container - always rendered to maintain renderer attachment */}
        <div
          ref={containerRef}
          className="vibegrid-pure-renderer h-full overflow-auto"
          data-testid={`vibegrid-pure-renderer-${tableId}`}
          data-vibegrid-container="true"
          style={{
            width: isGanttMode ? cutoffWidth : '100%',
            flexShrink: 0,
            position: 'relative',
            outline: 'none',
          }}
        />

        {/* Gantt Mode: Resizer and Timeline pane */}
        {isGanttMode && (
          <>
            <CutoffResizer
              onResize={(deltaX) => handleCutoffResize(viewModeStore.cutoffWidth + deltaX)}
              onResizeEnd={handleResizeEnd}
              onReset={handleCutoffReset}
            />
            {/* Right pane: Timeline */}
            <div className="flex-1 h-full min-w-0 overflow-auto">
              <GanttTimeline onBarClick={(rowId: string) => interactionStore.selectRow(rowId)} />
            </div>
          </>
        )}

        {/* Actions bar - appears when rows are selected */}
        {enableSelectionColumn && (rowActions || enableDelete) && (
          <ActionsBar
            rowActions={rowActions}
            onRowAction={onRowAction}
            enableDelete={enableDelete}
            onDelete={onDelete}
            deleteConfirmation={deleteConfirmation}
            getRowData={getRowData}
          />
        )}
      </div>

      {/* Debug info in development - removed to avoid MobX tracking */}
    </div>
  )
}

// Wrap with observer AFTER defining the function
const VibeGridInner = observer(VibeGridInnerBase)

// ====================================
// MAIN COMPONENT (Provides store context)
// ====================================

export function VibeGrid(props: VibeGridProps): React.ReactElement {
  return <VibeGridInner {...props} />
}

export default VibeGrid
export type { VibeGridProps }
