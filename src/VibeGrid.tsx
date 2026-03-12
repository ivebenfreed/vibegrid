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
import { Download } from 'lucide-react'
import { reaction } from 'mobx'
import { observer } from 'mobx-react-lite'
import type React from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useCommandBus, useUndoRouter } from '@/app/stores'
import {
  useDependencyCollection,
  useMembersCollection,
} from '@/shared/data/db/hooks/useEntityCollection'
import { getLogger } from '@/shared/lib/logging'
import { ActionsBar } from './components/ActionsBar'
import { DebugOverlay } from './components/DebugOverlay'
import { FloatingActionsMenu } from './components/FloatingActionsMenu'
// GH#1240: ExpandedContentPortals renders nested VibeGrid via React portals
import { ExpandedContentPortals } from './components/ExpandedContentPortals'
// GH#1658: Ghost rows for inline creation
import { GhostRowPortal } from './components/GhostRowPortal'
import { GanttToolbar } from './components/GanttToolbar'
import { VibeGridLoadingOverlay } from './components/VibeGridLoadingOverlay'
import type { ViewPickerProps } from './components/ViewPicker'
import { VibeGridXHeaderPure } from './components/VibeGridXHeaderPure'
import { useEntityReferenceData } from './hooks/useEntityReferenceData'
import { useVibeGridData } from './hooks/useVibeGridData'
import { useVibeGridHierarchy } from './hooks/useVibeGridHierarchy'
import { useRowExpansion } from './hooks/useRowExpansion'
import { viewModeRegistry } from './modules'
import type { GridModule } from './modules'
import { SimplePassiveRenderer } from './renderers/core/SimplePassiveRenderer'
import { useVibeGridStores, useCollectionOverride } from './stores/context'
import type { ViewMode } from './stores/ViewModeStore'
import type {
  RowExpansionConfig,
  RowExpansionChangeEvent,
  ExpandedDataLoadEvent,
} from './types/row-expansion'
import type { Column, TableRow } from './types'
import { downloadCSV, getExportableColumns, getExportFilename, rowsToCSV } from './utils/csv-export'

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
  preserveSelection?: boolean // Keep selection after action (e.g. CSV export)
}

// ====================================
// COMPONENT PROPS
// ====================================

interface VibeGridProps<_T = any> {
  tableId: string // Unique identifier for this table instance
  entityType: string // Entity type (determines data source)
  entityDisplayName?: string // User-friendly display name for the entity (e.g., "Document" instead of "GCFile")
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

  // View mode (props-based, no MobX toggle)
  viewMode?: ViewMode
  onViewModeChange?: (mode: ViewMode) => void
  enableKanban?: boolean

  // Testing mode - skip TanStack DB data fetching (use with MockDataInjector)
  skipDataFetching?: boolean

  // Collection override for nested grids or mock testing (GH#1240)
  collectionOverride?: { items: any[]; count: number }

  // Column overrides for nested grids (GH#1240)
  columnOverrides?: Column[]

  // Toolbar and header visibility (GH#1240)
  showToolbar?: boolean
  showHeader?: boolean
  showPagination?: boolean
  minHeight?: number
  maxHeight?: number

  // Drag and drop (aliased from enableDragAndDrop for clarity)
  enableDragDrop?: boolean

  // Virtualization control (for nested grids that don't need it)
  enableVirtualization?: boolean

  // Row expansion (GH#1240)
  rowExpansionConfig?: RowExpansionConfig
  onRowExpansionChange?: (event: RowExpansionChangeEvent) => void
  onExpandedDataLoad?: (event: ExpandedDataLoadEvent) => void

  // Smart text search (GH#1391)
  /** Columns to search. Defaults to all columns with isTextType() */
  searchableColumns?: string[]
  /** Placeholder text for search input. Defaults to "Search..." */
  searchPlaceholder?: string
  /** Disable smart search entirely. Defaults to false */
  disableSearch?: boolean

  // System-level row predicate (not shown in filter bar)
  /**
   * Predicate applied before user-visible filters. Rows returning false are hidden.
   * Use for structural exclusions like upload-pending entities.
   */
  systemPredicate?: (row: any) => boolean

  // CSV export (GH#1551)
  /** Enable CSV export buttons in the toolbar and ActionsBar. Defaults to false. */
  enableExport?: boolean

  // URL state sharing (GH#1570)
  /** Callback to copy the current view URL to clipboard */
  onCopyLink?: () => void

  // View picker (GH#1570 P2.3)
  /** Props for the saved views picker (replaces ButtonGroup when provided) */
  viewPickerProps?: Omit<ViewPickerProps, 'currentViewMode'>

  // Inline creation (GH#1658)
  /** Enable inline ghost row creation. Requires onInlineCreate. Default: false. */
  enableInlineCreation?: boolean
  /** Called when user commits an inline ghost row. Returns the created record's id. */
  onInlineCreate?: (defaults: Record<string, unknown>) => Promise<string>
  /**
   * Called when a ghost row click triggers the escalation threshold (>3 required fields
   * or relationship fields). The parent should open QuickCreatePanel with these inheritedFields.
   * If not provided, escalation is silently ignored (ghost row does nothing).
   */
  onEscalate?: (groupId: string, inheritedFields: Record<string, unknown>) => void
}

// ====================================
// INNER COMPONENT (Uses MobX stores from context)
// ====================================

function VibeGridInnerBase(props: VibeGridProps) {
  const {
    tableId,
    entityType,
    entityDisplayName,
    orgId,
    className = '',
    height = 600,
    width = '100%',
    enableSelectionColumn = true,
    onCellClick,
    onCellDoubleClick: _onCellDoubleClick,
    onSelectionChange: _onSelectionChange,
    onEditingChange: _onEditingChange,
    onPerformanceUpdate: _onPerformanceUpdate,
    onEntityUpdate,
    onBatchEntityUpdate,
    rowActions,
    onRowAction,
    enableDelete,
    onDelete,
    deleteConfirmation,
    enableVirtualScrolling: _enableVirtualScrolling = true,
    bufferSize = 10,
    enableGrouping = true,
    enableFiltering: _enableFiltering = true,
    enableSorting: _enableSorting = true,
    enableDragAndDrop = true,
    enableHierarchy = false,
    viewMode = 'table',
    onViewModeChange,
    enableKanban = false,
    skipDataFetching = false,
    collectionOverride: _collectionOverride, // Used by context provider, not directly here
    showToolbar: _showToolbar = true,
    showHeader = true,
    rowExpansionConfig,
    onRowExpansionChange,
    onExpandedDataLoad,
    // Smart text search (GH#1391)
    searchableColumns,
    searchPlaceholder,
    disableSearch = false,
    // System-level row predicate
    systemPredicate,
    // CSV export (GH#1551)
    enableExport = false,
    // URL state sharing (GH#1570)
    onCopyLink,
    // View picker (GH#1570 P2.3)
    viewPickerProps,
    // Inline creation (GH#1658)
    enableInlineCreation = false,
    onInlineCreate,
    onEscalate,
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
    kanbanViewStore,
    hierarchyStore,
    debugStore,
    inlineCreationStore,
  } = stores

  // NOTE: Field types are lazily loaded in InitStore.initializeStores() before TableCoreStore.init()
  // This ensures they're only loaded when VibeGrid is actually rendered, not at app startup.

  const cutoffWidth = viewModeStore.cutoffWidth

  // ViewModeRegistry: load + activate module on viewMode change
  const [activeModule, setActiveModule] = useState<GridModule | null>(null)
  const moduleCleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    let cancelled = false
    moduleCleanupRef.current?.()
    moduleCleanupRef.current = null

    viewModeRegistry.get(viewMode).then((module) => {
      if (cancelled) return
      const cleanup = module.init?.(stores)
      moduleCleanupRef.current = cleanup ?? null
      // D2: Register module-specific slots (e.g., Gantt left-pane overrides)
      module.registerSlots?.(stores.initStore.slotRegistry)
      setActiveModule(module)
    })

    return () => {
      cancelled = true
      moduleCleanupRef.current?.()
    }
  }, [viewMode, stores])

  // ====================================
  // TANSTACK DB INTEGRATION
  // ====================================

  // Get collection override from context (for mock testing)
  const collectionOverride = useCollectionOverride()

  // NOTE: useVibeGridData now pushes rows directly to tableCoreStore.setRows()
  // This eliminates the need for a useEffect bridge and prevents duplicate updates
  // on server echo after optimistic updates
  // When skipDataFetching=true, the hook returns no-op functions (for mock data mode)
  const {
    isLoading: isDataLoading,
    collection,
    createEntity: _createEntity,
    updateEntity,
    deleteEntity,
  } = useVibeGridData(entityType, tableCoreStore, visualStateStore, initStore, {
    skip: skipDataFetching,
    collectionOverride,
    systemPredicate,
  })

  // Default bulk delete handler — falls back to internal deleteEntity when no onDelete prop provided
  const effectiveOnDelete = useMemo(() => {
    if (onDelete) return onDelete
    if (!enableDelete) return undefined
    return async (rowIds: string[]) => {
      await Promise.all(rowIds.map((id) => deleteEntity(id)))
    }
  }, [onDelete, enableDelete, deleteEntity])

  // Load hierarchy relationships when hierarchy mode is enabled
  useVibeGridHierarchy({
    entityType,
    hierarchyStore,
    tableCoreStore,
  })

  // Row expansion integration (GH#1240)
  logger.info('🔄 VibeGrid rowExpansionConfig', {
    hasConfig: !!rowExpansionConfig,
    enabled: rowExpansionConfig?.enabled,
    enabledFallback: rowExpansionConfig?.enabled ?? false,
  })
  const _rowExpansion = useRowExpansion(interactionStore, {
    enabled: rowExpansionConfig?.enabled ?? false,
    allowMultiple: rowExpansionConfig?.allowMultiple ?? true,
    loadData: rowExpansionConfig?.loadExpandedData,
    cacheTTL: 5 * 60 * 1000, // 5 minutes
    onExpansionChange: onRowExpansionChange
      ? (expandedRowIds) => {
          onRowExpansionChange({
            type: expandedRowIds.size > 0 ? 'expand' : 'collapse',
            rowIds: Array.from(expandedRowIds),
            expandedRowIds,
          })
        }
      : undefined,
    onDataLoaded: onExpandedDataLoad
      ? (rowId, data) => {
          onExpandedDataLoad({
            rowId,
            data,
            error: null,
            duration: 0, // Could track this if needed
          })
        }
      : undefined,
    onLoadError: onExpandedDataLoad
      ? (rowId, error) => {
          onExpandedDataLoad({
            rowId,
            data: null,
            error,
            duration: 0,
          })
        }
      : undefined,
  })

  // GH#1240: Data loading is now handled by SimplePassiveRenderer's expansion observer
  // which is a proper MobX reaction that has access to the same interactionStore instance

  // Fetch organization members for UserReference fields
  const membersCollection = useMembersCollection()
  const {
    data: members = [],
    isLoading: membersLoading,
    status: membersStatus,
  } = useLiveQuery(
    (q) => {
      if (!membersCollection) return undefined
      return q.from({ members: membersCollection })
    },
    [membersCollection],
  )

  // Get dependency collection for Gantt (only when in gantt mode)
  const dependencyCollection = useDependencyCollection(viewMode === 'gantt' ? entityType : '')

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
    if (!ganttViewStore || viewMode !== 'gantt') return

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
  }, [rawDependencies, ganttViewStore, viewMode, entityType])

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

  // Stable refs for callback props — prevents renderer destroy/recreate on every parent re-render.
  // The renderer factory closure reads from these refs (always latest value), so the effect
  // only re-runs when structural props change (stores, entityType, tableId, etc.).
  const onCellClickRef = useRef(onCellClick)
  onCellClickRef.current = onCellClick
  const onEntityUpdateRef = useRef(onEntityUpdate)
  onEntityUpdateRef.current = onEntityUpdate
  const onBatchEntityUpdateRef = useRef(onBatchEntityUpdate)
  onBatchEntityUpdateRef.current = onBatchEntityUpdate
  const updateEntityRef = useRef(updateEntity)
  updateEntityRef.current = updateEntity

  // NOTE: The old "SYNC TANSTACK DB DATA → TABLECORE STORE" useEffect has been removed.
  // useVibeGridData now pushes directly to tableCoreStore.setRows() internally,
  // which eliminates duplicate updates on server echo after optimistic updates.

  // Initialize baseline snapshot when both schema AND data are ready
  // CRITICAL: This ensures baseline is created on initial load, not on first edit
  // Without this, detectChangedCells() returns empty on first edit → versions don't increment → observer doesn't fire
  // biome-ignore lint/correctness/useExhaustiveDependencies: Intentionally specific deps - only re-run when these exact hydration fields change
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

  // Reactive bridge: entity reference target collections → tableCoreStore.entityReferenceData
  // Renders one invisible bridge component per target entity type (e.g., Company, Vendor)
  // so that entity_reference cells update automatically when target entities change
  const entityRefBridges = useEntityReferenceData(tableCoreStore)

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

  // GH#1240: Set row expansion config on TableCoreStore
  useEffect(() => {
    if (!tableCoreStore) return
    logger.info('Setting row expansion config on TableCoreStore', {
      enabled: rowExpansionConfig?.enabled,
    })
    tableCoreStore.setRowExpansionConfig(rowExpansionConfig ?? null)
  }, [rowExpansionConfig, tableCoreStore])

  // Set TanStack DB collection on EditingStore for edit persistence
  useEffect(() => {
    if (!editingStore || !collection) return
    logger.info('Setting TanStack DB collection on EditingStore', {
      hasCollection: !!collection,
      entityType,
    })
    editingStore.setCollection(collection)
  }, [collection, editingStore, entityType])

  // Set CommandBus on EditingStore for undo/redo tracking (GH#1827)
  const commandBus = useCommandBus()
  useEffect(() => {
    if (!editingStore || !commandBus) return
    editingStore.setCommandBus(commandBus)
  }, [editingStore, commandBus])

  // GH#1827 P2: Register VibGrid as an undo surface via FocusAwareUndoRouter
  const undoRouter = useUndoRouter()
  useEffect(() => {
    if (!commandBus || !undoRouter) return
    const dispose = undoRouter.registerSurface('vibegrid', {
      canUndo: () => commandBus.canUndo,
      canRedo: () => commandBus.canRedo,
      undo: async () => {
        await commandBus.undo()
      },
      redo: async () => {
        await commandBus.redo()
      },
      undoDescription: () => {
        const history = commandBus.commandHistory
        if (history.length === 0) return 'grid edit'
        return history[history.length - 1].metadata.description
      },
      containerSelector: '[data-surface="vibegrid"]',
    })
    return dispose
  }, [commandBus, undoRouter])

  // Set TanStack DB collection on GanttViewStore for bar drag persistence
  useEffect(() => {
    if (!ganttViewStore || !collection) return
    logger.info('Setting TanStack DB collection on GanttViewStore', {
      hasCollection: !!collection,
      entityType,
    })
    ganttViewStore.setCollection(collection)
  }, [collection, ganttViewStore, entityType])

  // Set TanStack DB collection on KanbanViewStore for card drag persistence
  useEffect(() => {
    if (!kanbanViewStore || !collection) return
    logger.info('Setting TanStack DB collection on KanbanViewStore', {
      hasCollection: !!collection,
      entityType,
    })
    kanbanViewStore.setCollection(collection)
  }, [collection, kanbanViewStore, entityType])

  // Set TanStack DB dependency collection on GanttViewStore for optimistic updates
  useEffect(() => {
    if (!ganttViewStore) return
    logger.info('Setting TanStack DB dependency collection on GanttViewStore', {
      hasDependencyCollection: !!dependencyCollection,
      entityType,
      isGanttMode: viewMode === 'gantt',
    })
    ganttViewStore.setDependencyCollection(dependencyCollection)
  }, [dependencyCollection, ganttViewStore, entityType, viewMode])

  // Auto-detect status and progress fields for Gantt bar coloring
  useEffect(() => {
    if (!ganttViewStore || viewMode !== 'gantt' || !tableCoreStore) return

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
  }, [ganttViewStore, viewMode, tableCoreStore, tableCoreStore?.columns])

  // Auto-detect status field and colors for Kanban view
  useEffect(() => {
    if (!kanbanViewStore || viewMode !== 'kanban' || !tableCoreStore) return

    const columns = tableCoreStore.columns
    if (!columns || columns.length === 0) return

    // Find status field (look for 'status' in name or type)
    const statusCol = columns.find((col: any) => {
      const id = col.id?.toLowerCase() || ''
      const name = (col.name || '').toLowerCase()
      const type = (col.type || col.cellType || '').toLowerCase()
      return id === 'status' || name === 'status' || type === 'status' || type === 'status_set'
    })

    if (statusCol) {
      // Set the group by field
      kanbanViewStore.setGroupByField(statusCol.id)

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
          kanbanViewStore.setStatusColorMap(colorOptions)
          logger.info('Set Kanban status color map from schema', { count: colorOptions.length })
        }
      }
    }
  }, [kanbanViewStore, viewMode, tableCoreStore, tableCoreStore?.columns])

  // ====================================
  // INITIALIZATION (P4 - Deterministic via InitStore)
  // ====================================

  // Renderer creation is now deterministic via InitStore.
  // VibeGrid.tsx provides: container ref + renderer factory.
  // InitStore's MobX reaction watches columns.length > 0 && container && factory,
  // then creates the renderer synchronously. No race conditions.

  useEffect(() => {
    if (!stores || !stores.initStore) {
      logger.warn('[VGDEBUG] Stores not ready for initialization')
      return
    }

    if (!containerRef.current) {
      logger.warn('[VGDEBUG] Container ref not available')
      return
    }

    // Mark container as ready (hydration tracking) — only on first run;
    // this effect re-fires when callback props change to recreate the renderer,
    // but the container itself is already ready.
    if (!stores.initStore.hydrationState.containerReady) {
      stores.initStore.markReady('containerReady')
      logger.info('[VGDEBUG] Container ready')
    }

    // Provide the container to InitStore
    stores.initStore.setContainer(containerRef.current)

    // Provide a renderer factory that delegates callbacks through refs (always latest value).
    // This prevents unnecessary renderer destroy/recreate cycles when callback props change,
    // while ensuring the renderer always calls the most current callback.
    stores.initStore.setRendererFactory((container: HTMLElement) => {
      logger.info('Renderer factory called by InitStore', { tableId, entityType })

      return new SimplePassiveRenderer({
        container,
        stores,
        entityType,
        enableSelectionColumn,
        bufferSize,
        onEntityUpdate: (rowId, updates) =>
          (onEntityUpdateRef.current || updateEntityRef.current)?.(rowId, updates),
        onBatchEntityUpdate: (updates) => onBatchEntityUpdateRef.current?.(updates),
        onCellClick: (rowId, columnId) => onCellClickRef.current?.(rowId, columnId),
      })
    })

    // Sync rendererRef with initStore.renderer for cleanup on unmount
    const rendererSyncDisposer = reaction(
      () => stores.initStore.renderer,
      (renderer) => {
        rendererRef.current = renderer
      },
      { fireImmediately: true },
    )

    // Cleanup on unmount or dependency change (e.g. callback prop changes)
    return () => {
      rendererSyncDisposer()

      // Destroy renderer so a fresh one can be created with updated callbacks
      if (stores?.initStore) {
        stores.initStore.destroyRenderer()
      }
      rendererRef.current = null
    }
  }, [
    stores,
    // NOTE: Callback props (onCellClick, onEntityUpdate, onBatchEntityUpdate, updateEntity)
    // are intentionally NOT in deps — they're read from refs inside the renderer factory.
    // This prevents unnecessary destroyRenderer()/createRenderer() cycles when parent
    // re-renders with new inline callbacks, which caused the "double flash" on page reload.
    // NOTE: visualStateStore.columns.length intentionally NOT in deps.
    // The renderer reaction in InitStore watches columns.length and creates the renderer
    // when columns are ready — no need to destroy/recreate the renderer here.
    enableSelectionColumn,
    entityType,
    tableId,
    bufferSize,
  ]) // Depend on stores and structural props only — callbacks via refs

  // Bridge MobX selection state to optional external callback.
  useEffect(() => {
    if (!_onSelectionChange) return

    const dispose = reaction(
      () => Array.from(interactionStore.selectedCells),
      (selectedCells) => {
        _onSelectionChange(new Set(selectedCells))
      },
      { fireImmediately: true },
    )

    return () => dispose()
  }, [_onSelectionChange, interactionStore])

  // ====================================
  // ROW ACTIONS HELPER
  // ====================================

  // Helper function to get row data by ID
  const getRowData = (rowId: string) => {
    return tableCoreStore.processedRows.find((row) => row.id === rowId)
  }

  // GH#1551: CSV export helpers
  // Extract field data from a VirtualRow's entity object.
  // Real API entities have nested structure: entity.data = {name, status, ...}
  // Mock/flat entities store fields directly on the object: entity = {id, name, status, ...}
  const extractRowData = useCallback((rowData: any): Record<string, unknown> => {
    if (!rowData) return {}
    const nested = (rowData as TableRow).data
    return nested !== undefined ? nested : rowData
  }, [])

  const getExportRows = useCallback(() => {
    return tableCoreStore.processedRows.map((row) => ({
      id: row.id,
      type: row.type,
      data: row.type === 'data' ? extractRowData(row.data) : {},
    }))
  }, [tableCoreStore, extractRowData])

  const getExportColumns = useCallback(() => {
    return getExportableColumns(tableCoreStore.columns as any, visualStateStore.columnVisibility)
  }, [tableCoreStore, visualStateStore])

  const handleExportAll = useCallback(() => {
    if (tableCoreStore.isIncrementalProcessing) return
    const rows = getExportRows()
    const columns = getExportColumns()
    const csv = rowsToCSV(rows, columns as any)
    const filename = getExportFilename(entityType)
    downloadCSV(csv, filename)
  }, [getExportRows, getExportColumns, entityType, tableCoreStore])

  // Build row actions with export injected when enabled
  const effectiveRowActions = (() => {
    if (!enableExport) return rowActions
    const exportAction: RowAction = {
      id: 'export-csv',
      label: 'Export CSV',
      icon: Download,
      preserveSelection: true,
    }
    return [...(rowActions || []), exportAction]
  })()

  // Wrap onRowAction to handle export-csv action
  const handleRowAction = useCallback(
    (actionId: string, rowIds: string[], rowsData: any[]) => {
      if (actionId === 'export-csv') {
        if (tableCoreStore.isIncrementalProcessing) return
        // Export only the selected rows
        const rows = rowIds.map((id) => {
          const vrow = tableCoreStore.processedRows.find((r) => r.id === id)
          return {
            id,
            type: 'data' as const,
            data: vrow?.type === 'data' ? extractRowData(vrow.data) : {},
          }
        })
        const columns = getExportColumns()
        const csv = rowsToCSV(rows, columns as any)
        const filename = getExportFilename(entityType)
        downloadCSV(csv, filename)
        return
      }
      onRowAction?.(actionId, rowIds, rowsData)
    },
    [onRowAction, getExportColumns, entityType, tableCoreStore, extractRowData],
  )

  // Sync vertical scroll between table (VisualStateStore) and Gantt (GanttViewStore)
  // This ensures both panes scroll together vertically
  useEffect(() => {
    if (viewMode !== 'gantt') return

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
  }, [viewMode, visualStateStore, ganttViewStore])

  // ====================================
  // DERIVED STATE
  // ====================================

  // isReady: basic data readiness (stores exist, data loaded)
  // isRendered: renderer has fully painted (header + body + browser paint complete)
  // Uses InitStore.isFullyHydrated (MobX computed) instead of checking rendererRef
  // because the ref is set when the renderer object is created, before it has actually
  // painted rows. isFullyHydrated waits for rendererInitialized (Phase 6 RAF).
  const isReady = stores && !isDataLoading
  const isRendered = initStore?.isFullyHydrated ?? false

  // Header should show as soon as stores are ready (don't wait for renderer)
  // GH#1240: Respect showHeader prop for nested grids that don't need headers
  const shouldShowHeader = showHeader && isReady && visualStateStore.columns.length > 0

  // GH#1391: Smart text search configuration
  const searchConfig = {
    searchableColumns,
    searchPlaceholder,
    disableSearch,
  }

  // GH#1391: Wire searchableColumns to TableCoreStore for data pipeline
  useEffect(() => {
    if (tableCoreStore) {
      tableCoreStore.setSearchableColumns(searchableColumns)
    }
  }, [searchableColumns, tableCoreStore])

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
      data-surface="vibegrid"
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

      {/* Invisible data bridges for reactive entity reference resolution */}
      {entityRefBridges}

      {/* Header with menu components - Show as soon as columns are ready */}
      {shouldShowHeader && (
        <VibeGridXHeaderPure
          stores={stores}
          enableGrouping={enableGrouping}
          viewMode={viewMode}
          onViewModeChange={onViewModeChange}
          enableKanban={enableKanban}
          enableHierarchy={enableHierarchy}
          enableRowExpansion={rowExpansionConfig?.enabled}
          searchConfig={searchConfig}
          enableExport={enableExport}
          onExportAll={handleExportAll}
          onCopyLink={onCopyLink}
          viewPickerProps={viewPickerProps}
        />
      )}

      {/* Gantt toolbar - spans full width above split pane */}
      {viewMode === 'gantt' && <GanttToolbar />}

      {/* Main content area - Table, Split Pane (Gantt), or Kanban */}
      {/* IMPORTANT: containerRef must always be the same DOM element to keep renderer attached */}
      <div className="flex-1 flex flex-row overflow-hidden" style={{ minHeight: 0 }}>
        {/* Table container - ALWAYS rendered to maintain renderer attachment */}
        {/* Hidden when in Kanban mode, but kept in DOM to preserve renderer state */}
        <div
          ref={containerRef}
          className="vibegrid-pure-renderer h-full overflow-auto"
          data-testid={`vibegrid-pure-renderer-${tableId}`}
          data-vibegrid-container="true"
          style={{
            width: viewMode === 'kanban' ? 0 : viewMode === 'gantt' ? cutoffWidth : '100%',
            flexShrink: 0,
            position: 'relative',
            zIndex: 0, // Creates stacking context so renderer's internal z-indexes (header z-10) don't escape above the loading overlay (z-10)
            outline: 'none',
            overflow: viewMode === 'kanban' ? 'hidden' : 'auto',
            visibility: viewMode === 'kanban' ? 'hidden' : 'visible',
          }}
        />

        {/* Non-table view modes — rendered by activeModule via ViewModeRegistry */}
        {activeModule &&
          activeModule.id !== 'table' &&
          activeModule.render(
            {
              tableId,
              entityType,
              entityDisplayName,
              orgId,
              className: '',
              enableDragAndDrop,
              enableSelectionColumn,
              enableGrouping,
              enableHierarchy,
              onCellClick,
              onEntityUpdate: onEntityUpdate || updateEntity,
            },
            stores,
          )}

        {/* Actions bar - appears when rows are selected (not in Kanban mode) */}
        {viewMode !== 'kanban' &&
          enableSelectionColumn &&
          (rowActions || enableDelete || enableExport) && (
            <ActionsBar
              rowActions={enableExport ? effectiveRowActions : rowActions}
              onRowAction={enableExport ? handleRowAction : onRowAction}
              enableDelete={enableDelete}
              onDelete={effectiveOnDelete}
              deleteConfirmation={deleteConfirmation}
              getRowData={getRowData}
              isExportDisabled={enableExport ? tableCoreStore.isIncrementalProcessing : undefined}
            />
          )}

        {/* Floating row action menu (3-dots) - renders via portal when triggered */}
        {(rowActions || enableDelete) && (
          <FloatingActionsMenu
            rowActions={rowActions}
            onRowAction={
              onRowAction
                ? (actionId, rowData) => onRowAction(actionId, [rowData.id], [rowData])
                : undefined
            }
            enableDelete={enableDelete}
            onDelete={
              effectiveOnDelete
                ? (rowId, rowData) => effectiveOnDelete([rowId], [rowData])
                : undefined
            }
            deleteConfirmation={
              deleteConfirmation ? (rowData) => deleteConfirmation([rowData]) : undefined
            }
            getRowData={getRowData}
          />
        )}
      </div>

      {/* GH#1240: Render nested VibeGrid into expanded row containers via React portals */}
      {rowExpansionConfig?.enabled && (
        <ExpandedContentPortals
          containerRef={containerRef}
          rowExpansionConfig={rowExpansionConfig}
          interactionStore={interactionStore}
          tableCoreStore={tableCoreStore}
          entityType={entityType}
          orgId={orgId}
        />
      )}

      {/* GH#1658: Ghost rows for inline creation */}
      {enableInlineCreation && (
        <GhostRowPortal
          containerRef={containerRef}
          inlineCreationStore={inlineCreationStore}
          tableCoreStore={tableCoreStore}
          visualStateStore={visualStateStore}
          interactionStore={interactionStore}
          editingStore={editingStore}
          entityDisplayName={entityDisplayName || entityType}
          onInlineCreate={onInlineCreate}
          onEscalate={onEscalate}
        />
      )}

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
