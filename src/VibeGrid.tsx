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
import { useDependencyCollection, useMembersCollection } from '@/shared/data/db/hooks/useEntityCollection'
import { getSQLiteClient } from '@/shared/data/db/sqlite/client'
import { getLegacyMigrationDiagnostics } from '@/shared/data/db/sqlite/migration'
import { getLogger } from '@/shared/lib/logging'
import { UpdateEntityRecordCommand } from '@/systems/commands/dataforge/UpdateEntityRecordCommand'
import { BatchUpdateEntityRecordsCommand } from '@/systems/commands/dataforge/BatchUpdateEntityRecordsCommand'
import { ActionsBar } from './components/ActionsBar'
import { DebugOverlay } from './components/DebugOverlay'
import { FloatingActionsMenu } from './components/FloatingActionsMenu'
// GH#1240: ExpandedContentPortals renders nested VibeGrid via React portals
import { ExpandedContentPortals } from './components/ExpandedContentPortals'
// GH#1658: Ghost rows for inline creation
import { GhostRowPortal } from './components/GhostRowPortal'
import { GanttToolbar } from './components/GanttToolbar'
import { ModuleErrorBoundary, ModuleErrorFallback } from './components/ModuleErrorBoundary'
import { VibeGridEmptyState } from './components/VibeGridEmptyState'
import { VibeGridLoadingOverlay } from './components/VibeGridLoadingOverlay'
import type { ViewPickerProps } from './components/ViewPicker'
import { VibeGridXHeaderPure } from './components/VibeGridXHeaderPure'
import { useEntityReferenceData } from './hooks/useEntityReferenceData'
import { useRelationshipTargetCollections } from './hooks/useRelationshipTargetCollections'
import { useVibeGridData } from './hooks/useVibeGridData'
import { useVibeGridHierarchy } from './hooks/useVibeGridHierarchy'
import { useRowExpansion } from './hooks/useRowExpansion'
import { viewModeRegistry } from './modules'
import type { GridModule } from './modules'
import { SimplePassiveRenderer } from './renderers/core/SimplePassiveRenderer'
import { useVibeGridStores, useCollectionOverride } from './stores/context'
import type { ViewMode } from './stores/ViewModeStore'
import type { RowExpansionConfig, RowExpansionChangeEvent, ExpandedDataLoadEvent } from './types/row-expansion'
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
  entityDisplayName?: string // User-friendly display name for the entity (e.g., "Document" instead of "File")
  orgId?: string // Organization ID for multi-tenant support

  // Common options
  className?: string
  height?: number | string
  width?: number | string

  // Event handlers (all optional)
  onCellClick?: (rowId: string, columnId: string, event?: MouseEvent) => void
  onCellDoubleClick?: (rowId: string, columnId: string) => void
  onSelectionChange?: (selectedCells: Set<string>) => void
  onEditingChange?: (editingCell: { rowId: string; columnId: string } | null) => void
  onPerformanceUpdate?: (metrics: any) => void
  onEntityUpdate?: (rowId: string, updates: Record<string, any>) => Promise<void> | void
  onBatchEntityUpdate?: (updates: Array<{ id: string; updates: Record<string, any> }>) => Promise<void> | void

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
  /** Schema field descriptors for registry-driven view gating (GH#2139) */
  schemaFields?: import('./modules/GridModule').SchemaFieldDescriptor[]

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

  // GH#2361: Read-only mode (viewer role → all cells non-editable)
  /** When true, all columns become non-editable regardless of schema. */
  readOnly?: boolean

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

  /** Leading content for the toolbar (e.g., page title + record count) */
  toolbarLeading?: React.ReactNode
  /** Trailing content for the toolbar (e.g., creation button) */
  toolbarTrailing?: React.ReactNode

  // Empty-state slot + copy overrides (GH#2934)
  /** Consumer-supplied call-to-action node for the `empty` variant (e.g., a creation button).
   *  Ignored for `search` and `filter` variants. */
  emptyStateCta?: React.ReactNode
  /** Override headline for the `empty` variant. Ignored for `search` and `filter`. */
  emptyStateHeadline?: string
  /** Override body copy for the `empty` variant. Ignored for `search` and `filter`. */
  emptyStateBody?: string

  // Empty-state dropzone mode (GH#3016)
  /**
   * Visual mode for the empty state.
   * - `default` (omitted): standard centered message + optional CTA below the column header strip.
   * - `dropzone`: full-bleed overlay that visually hides the column header strip and renders
   *   `emptyStateContent` (typically an inline upload dropzone) as the primary affordance.
   *
   * Applies to all variants (`empty`, `search`, `filter`) so the dropzone stays usable when
   * a filter excludes every row.
   */
  emptyStateMode?: 'default' | 'dropzone'
  /**
   * Custom content rendered inside the empty state when `emptyStateMode === 'dropzone'`.
   * Typically an `<EntityUploadDropzone>` configured with the same upload flow that the
   * toolbar's "Upload Files" button uses.
   */
  emptyStateContent?: React.ReactNode
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
    schemaFields,
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
    // GH#2361: Read-only mode
    readOnly = false,
    // Inline creation (GH#1658)
    enableInlineCreation = false,
    onInlineCreate,
    onEscalate,
    // Toolbar slots
    toolbarLeading,
    toolbarTrailing,
    // Empty-state slot + copy overrides (GH#2934)
    emptyStateCta,
    emptyStateHeadline,
    emptyStateBody,
    // Empty-state dropzone mode (GH#3016)
    emptyStateMode = 'default',
    emptyStateContent,
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
    viewportStore,
    ganttViewStore,
    kanbanViewStore,
    hierarchyStore,
    debugStore,
    inlineCreationStore,
  } = stores

  // NOTE: Field types are lazily loaded in InitStore.initializeStores() before TableCoreStore.init()
  // This ensures they're only loaded when VibeGrid is actually rendered, not at app startup.

  // Expose `window.__vibegrid_debug` global on the active grid when
  // `?debug=vibegrid` is set on the URL. Verification harnesses read this
  // to inspect live store state, the active substrate cursor + query, and
  // the SharedWorker SQLite client. The `lastCursor` / `lastQuery` slots
  // are populated by `useSubstrateGridRows` once the substrate query
  // initializes; the boot-side migration diagnostics are sourced from the
  // module-local state in `migration.ts` (GH#2806 P1.5).
  useEffect(() => {
    if (typeof window === 'undefined') return
    const search = new URLSearchParams(window.location.search)
    if (search.get('debug') !== 'vibegrid') return

    const debugApi = {
      viewportStore,
      tableCoreStore,
      interactionStore,
      // editingStore + visualStateStore are exposed for verification of B11
      // (filter pushdown via setFilters) and edit-parity tests on
      // substrate-bounded grids. Reading-only — harnesses call methods on
      // these stores to drive the same flows the UI does.
      editingStore,
      visualStateStore,
      // GH#2925 p0 B1: expose initStore directly so the 4-state phase
      // machine (phase + entityDataKnownComplete) is reachable in the
      // browser console without a React Fiber walk.
      initStore,
      // SharedWorker-backed SQLite client. Verification reads
      // `sqliteClient.isLeader`, broadcast-channel state, and connection
      // status to assert multi-tab fanout (GH#2806 B4).
      sqliteClient: getSQLiteClient(),
      // Populated via reaction in `useSubstrateGridRows` whenever a new
      // cursor is sent to the worker.
      lastCursor: null as { start: number; size: number } | null,
      // Populated by `useSubstrateGridRows` once the substrate Query is
      // initialized; the verification harness reads `lastQuery.shape` and
      // calls `lastQuery.patch({filter})` directly to drive SQL pushdown.
      lastQuery: null as unknown,
      // GH#2928 B1 — ring buffer for cold-start telemetry events
      // (`query.firstCell` from the SQLite worker, plus P3's
      // `cold_start_bypass.*` events). Pushed to by `telemetry-bridge.ts`'s
      // `mirrorToColdStartBuffer`; capped at 100 entries (push + shift).
      // Initialized empty here so the bridge's defensive `Array.isArray`
      // check passes as soon as the debug surface mounts.
      coldStart: [] as Array<unknown>,
      // GH#2928 B2 — drop OPFS state for the active org and reload. Uses
      // `location.reload()` (NOT `location.href = location.pathname`) so
      // the `?debug=vibegrid` (and any other) query params survive the
      // round trip — V0 of the spec verification depends on this.
      async resetOPFS() {
        const client = getSQLiteClient()
        const targetOrgId = client.orgId
        if (!targetOrgId) throw new Error('No active org on client')
        // biome-ignore lint/suspicious/noConsole: visible diagnostic for debug helper
        console.warn('[__vibegrid_debug.resetOPFS] resetting OPFS — page will reload')
        const result = await client.resetForOrg(targetOrgId)
        // biome-ignore lint/suspicious/noConsole: visible diagnostic for debug helper
        console.log('[__vibegrid_debug.resetOPFS] result', result)
        // location.reload() preserves query params (?debug=vibegrid&...).
        setTimeout(() => location.reload(), 200)
        return result
      },
      // Boot diagnostics for the legacy OPFS table migration (GH#2806 P1.5).
      // Returns `{ lastResult, ranAt }` from the most recent
      // `migrateLegacyEntityTables` call, or null if migration hasn't fired
      // in this session.
      get boot() {
        return { legacyMigration: getLegacyMigrationDiagnostics() }
      },
      // Selection shape will change in wave 3b. Until then, expose
      // whatever's on InteractionStore via a getter so verification
      // keeps reading the latest shape.
      get selection() {
        const i = interactionStore as unknown as Record<string, unknown>
        return i.selection ?? i.selectedCells ?? null
      },
      // GH#2848: programmatic memory diagnostic. `performance.memory` only
      // reports the V8 JS heap — it misses WASM (wa-sqlite + DB pages),
      // worker heaps, DOM, and renderer-process overhead, which is where
      // most of the substrate's footprint lives. This helper aggregates
      // every source we can reach without DevTools attached. Run while
      // the tab is in a bad state and paste the result.
      async memoryReport() {
        const out: Record<string, unknown> = {
          ts: new Date().toISOString(),
          crossOriginIsolated: typeof crossOriginIsolated !== 'undefined' ? crossOriginIsolated : 'undef',
          ua: navigator.userAgent.slice(0, 80),
        }
        // 1. V8 JS heap (Chrome only; precise-memory-info gives finer numbers)
        const pm = (performance as unknown as { memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number } }).memory
        if (pm) {
          out.jsHeap = {
            usedMB: +(pm.usedJSHeapSize / 1e6).toFixed(1),
            totalMB: +(pm.totalJSHeapSize / 1e6).toFixed(1),
            limitMB: +(pm.jsHeapSizeLimit / 1e6).toFixed(0),
          }
        }
        // 2. UA-specific cross-context memory (the closest API to Chrome
        // Task Manager's footprint — covers Wasm + workers + DOM by
        // attribution). Requires `crossOriginIsolated`. If gated, the
        // call rejects with SecurityError.
        const measureFn = (performance as unknown as { measureUserAgentSpecificMemory?: () => Promise<{ bytes: number; breakdown: Array<{ bytes: number; types?: string[]; attribution?: Array<{ scope?: string; url?: string }> }> }> }).measureUserAgentSpecificMemory
        if (typeof measureFn === 'function') {
          try {
            const m = await measureFn.call(performance)
            out.measureUA = {
              totalMB: +(m.bytes / 1e6).toFixed(1),
              breakdown: m.breakdown
                .filter((b) => b.bytes > 0)
                .map((b) => ({
                  types: b.types?.join('+') ?? '?',
                  scope: b.attribution?.[0]?.scope ?? '-',
                  url: (b.attribution?.[0]?.url ?? '').slice(-50),
                  MB: +(b.bytes / 1e6).toFixed(1),
                }))
                .sort((a, b) => b.MB - a.MB),
            }
          } catch (e) {
            out.measureUA_err = e instanceof Error ? e.message : String(e)
          }
        } else {
          out.measureUA = 'API unavailable (browser or COOP/COEP gating)'
        }
        // 3. DOM counters
        out.dom = {
          nodes: document.querySelectorAll('*').length,
          inputs: document.querySelectorAll('input,textarea,select').length,
          gridcells: document.querySelectorAll('[data-testid^="cell-"]').length,
          listenerHeuristic: 'inspect Memory tab → Heap snapshot for true count',
        }
        // 4. Substrate metrics
        const tcs = tableCoreStore as unknown as { rawRows?: unknown[]; processedRows?: unknown[]; loadedWindowStart?: number; loadedWindowEnd?: number }
        const rawLen = Array.isArray(tcs.rawRows) ? tcs.rawRows.length : 0
        let loadedCount = 0
        let sampleRowBytes = 0
        if (Array.isArray(tcs.rawRows)) {
          tcs.rawRows.forEach((r) => {
            loadedCount++
            if (sampleRowBytes === 0 && r) {
              try {
                sampleRowBytes = JSON.stringify(r).length
              } catch {
                /* ignore */
              }
            }
          })
        }
        out.substrate = {
          rawRowsLength: rawLen,
          actuallyLoaded: loadedCount,
          loadedWindow: [tcs.loadedWindowStart, tcs.loadedWindowEnd],
          processedRowsLength: Array.isArray(tcs.processedRows) ? tcs.processedRows.length : 0,
          sampleRowBytes,
          loadedRowsEstMB: +((loadedCount * sampleRowBytes) / 1e6).toFixed(1),
        }
        // 5. CommandBus + EditingStore retention
        const es = editingStore as unknown as {
          inFlight?: { size: number }
          commandBus?: { history?: unknown[]; undoneCommands?: unknown[]; config?: { maxHistorySize?: number } }
        }
        out.editing = {
          inFlight: es.inFlight?.size ?? 0,
          commandBusHistory: es.commandBus?.history?.length ?? 0,
          commandBusUndone: es.commandBus?.undoneCommands?.length ?? 0,
          commandBusCap: es.commandBus?.config?.maxHistorySize ?? 100,
        }
        // 6. SqliteClient pending requests + WORKER MEMORY (V8 + WASM)
        const sc = getSQLiteClient() as unknown as {
          pendingRequests?: { size: number }
          isLeader?: boolean
          memoryStats?: () => Promise<{ workerJSHeapUsedBytes: number; workerJSHeapTotalBytes: number; wasmHeapBytes: number }>
        }
        let workerMem: unknown = 'memoryStats() unavailable'
        if (typeof sc.memoryStats === 'function') {
          try {
            const ms = await sc.memoryStats()
            workerMem = {
              workerJSHeapMB: +(ms.workerJSHeapUsedBytes / 1e6).toFixed(1),
              workerJSHeapTotalMB: +(ms.workerJSHeapTotalBytes / 1e6).toFixed(1),
              wasmHeapMB: +(ms.wasmHeapBytes / 1e6).toFixed(1),
            }
          } catch (e) {
            workerMem = `memoryStats() rejected: ${e instanceof Error ? e.message : String(e)}`
          }
        }
        out.sqlite = {
          pendingRequests: sc.pendingRequests?.size ?? 0,
          isLeader: sc.isLeader ?? false,
          worker: workerMem,
        }
        return out
      },
    }
    ;(window as unknown as { __vibegrid_debug?: unknown }).__vibegrid_debug = debugApi
    return () => {
      delete (window as unknown as { __vibegrid_debug?: unknown }).__vibegrid_debug
    }
  }, [viewportStore, tableCoreStore, interactionStore, editingStore, visualStateStore, initStore])

  const cutoffWidth = viewModeStore.cutoffWidth

  // GH#2139: Validate requested viewMode against available modules.
  // If the requested mode is not available (e.g., kanban on schema with no groupable fields),
  // silently fall back to table.
  const effectiveViewMode = useMemo(() => {
    if (viewMode === 'table') return 'table'
    const renderProps = { tableId, entityType, schemaFields }
    const available = viewModeRegistry.getAvailableModules(renderProps, stores)
    if (available.includes(viewMode)) return viewMode
    // Stale URL param on incompatible schema — fall back to table
    if (onViewModeChange) onViewModeChange('table')
    return 'table' as ViewMode
  }, [viewMode, tableId, entityType, schemaFields, stores, onViewModeChange])

  // ViewModeRegistry: load + activate module on viewMode change
  const [activeModule, setActiveModule] = useState<GridModule | null>(null)
  const moduleCleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    let cancelled = false
    moduleCleanupRef.current?.()
    moduleCleanupRef.current = null

    viewModeRegistry.get(effectiveViewMode).then((module) => {
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
  }, [effectiveViewMode, stores])

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
  const dependencyCollection = useDependencyCollection(effectiveViewMode === 'gantt' ? entityType : '')

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
    if (!ganttViewStore || effectiveViewMode !== 'gantt') return

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
  }, [rawDependencies, ganttViewStore, effectiveViewMode, entityType])

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

    const phase = stores.initStore.phase
    const entityDataKnownComplete = stores.initStore.entityDataKnownComplete

    if (phase !== 'init' && entityDataKnownComplete) {
      logger.info('[VGDEBUG] 🎯 Schema + data known - initializing baseline snapshot', {
        phase,
        entityDataKnownComplete,
        columnCount: tableCoreStore.columns.length,
      })
      tableCoreStore.initializeBaselineSnapshot()
    }
  }, [
    stores?.initStore.phase,
    stores?.initStore.entityDataKnownComplete,
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
  // so that badge-list-live cells update automatically when target entities change
  const entityRefBridges = useEntityReferenceData(tableCoreStore)

  // GH#2786 (F') P6a: badge-list-live + useBadgeListEnrichment bridge
  // are deleted. Relationship badges now render via the static
  // badge-list renderer reading source-row inline IDs (P2 dual-write)
  // and resolving names locally from synced target collections.
  //
  // GH#2786 follow-up: route cross-entity name resolution through the
  // SharedWorker priority queue (GH#2692). The hook below registers each
  // relationship target's collection on the *background* lane (so the
  // page's own entity preempts) and bulk-fetches visible-cell ids via
  // client.fetchEntityByIds. badge-list.ts continues to read names via
  // getExistingEntityCollection() — it doesn't need to know about this hook.
  const relationshipTargetSlots = useRelationshipTargetCollections(tableCoreStore)

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

  // GH#2361: Sync readOnly prop to TableCoreStore
  useEffect(() => {
    if (!tableCoreStore) return
    tableCoreStore.setReadOnly(readOnly)
  }, [readOnly, tableCoreStore])

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

  // CommandBus-routed onEntityUpdate wrapper — routes fill handle, paste, and other
  // non-EditingStore mutations through CommandBus for undo/redo tracking.
  const commandBusEntityUpdate = useCallback(
    async (rowId: string, updates: Record<string, any>) => {
      const directUpdate = onEntityUpdate || updateEntity
      if (!commandBus || !collection) {
        directUpdate?.(rowId, updates)
        return
      }

      const fields = Object.keys(updates)
      if (fields.length === 0) return

      // Look up previous values from collection
      const currentData = collection.get(String(rowId))

      try {
        if (fields.length === 1) {
          const field = fields[0]
          const command = new UpdateEntityRecordCommand()
          const result = await commandBus.execute(command, {
            collection,
            entityName: entityType,
            recordId: String(rowId),
            field,
            newValue: updates[field],
            previousValue: currentData?.[field] ?? null,
          })
          if (!result.success) {
            directUpdate?.(rowId, updates)
          }
        } else {
          const command = new BatchUpdateEntityRecordsCommand()
          const result = await commandBus.execute(command, {
            collection,
            entityName: entityType,
            updates: fields.map((field) => ({
              recordId: String(rowId),
              field,
              newValue: updates[field],
              previousValue: currentData?.[field] ?? null,
            })),
          })
          if (!result.success) {
            directUpdate?.(rowId, updates)
          }
        }
      } catch {
        directUpdate?.(rowId, updates)
      }
    },
    [commandBus, collection, entityType, onEntityUpdate, updateEntity],
  )
  const commandBusEntityUpdateRef = useRef(commandBusEntityUpdate)
  commandBusEntityUpdateRef.current = commandBusEntityUpdate

  // Set TanStack DB collection on GanttViewStore for bar drag persistence
  useEffect(() => {
    if (!ganttViewStore || !collection) return
    logger.info('Setting TanStack DB collection on GanttViewStore', {
      hasCollection: !!collection,
      entityType,
    })
    ganttViewStore.setCollection(collection)
  }, [collection, ganttViewStore, entityType])

  // Set CommandBus on GanttViewStore for undo/redo on bar drag
  useEffect(() => {
    if (!ganttViewStore || !commandBus) return
    ganttViewStore.setCommandBus(commandBus)
  }, [ganttViewStore, commandBus])

  // Set TanStack DB collection on KanbanViewStore for card drag persistence
  useEffect(() => {
    if (!kanbanViewStore || !collection) return
    logger.info('Setting TanStack DB collection on KanbanViewStore', {
      hasCollection: !!collection,
      entityType,
    })
    kanbanViewStore.setCollection(collection)
  }, [collection, kanbanViewStore, entityType])

  // Set CommandBus on KanbanViewStore for undo/redo on card drag
  useEffect(() => {
    if (!kanbanViewStore || !commandBus) return
    kanbanViewStore.setCommandBus(commandBus)
  }, [kanbanViewStore, commandBus])

  // Set TanStack DB dependency collection on GanttViewStore for optimistic updates
  useEffect(() => {
    if (!ganttViewStore) return
    logger.info('Setting TanStack DB dependency collection on GanttViewStore', {
      hasDependencyCollection: !!dependencyCollection,
      entityType,
      isGanttMode: effectiveViewMode === 'gantt',
    })
    ganttViewStore.setDependencyCollection(dependencyCollection)
  }, [dependencyCollection, ganttViewStore, entityType, effectiveViewMode])

  // Auto-detect status and progress fields for Gantt bar coloring
  useEffect(() => {
    if (!ganttViewStore || effectiveViewMode !== 'gantt' || !tableCoreStore) return

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
  }, [ganttViewStore, effectiveViewMode, tableCoreStore, tableCoreStore?.columns])

  // Auto-detect status field and colors for Kanban view
  useEffect(() => {
    if (!kanbanViewStore || effectiveViewMode !== 'kanban' || !tableCoreStore) return

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
          .filter((opt: any) => opt.value)
          .map((opt: any) => ({
            value: opt.value,
            label: opt.label || opt.value,
            color: opt.color || '#000000',
            backgroundColor: opt.backgroundColor || undefined,
          }))
        if (colorOptions.length > 0) {
          kanbanViewStore.setStatusColorMap(colorOptions, statusCol.id)
          logger.info('Set Kanban status color map from schema', { count: colorOptions.length })
        }
      }
    }
  }, [kanbanViewStore, effectiveViewMode, tableCoreStore, tableCoreStore?.columns])

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

    // Provide the container to InitStore — this is the canonical "container
    // ready" signal; `transitionPhase('schema')` will assert it was called.
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
        onEntityUpdate: (rowId, updates) => commandBusEntityUpdateRef.current(rowId, updates),
        onBatchEntityUpdate: (updates) => onBatchEntityUpdateRef.current?.(updates),
        onCellClick: (rowId, columnId, event) => onCellClickRef.current?.(rowId, columnId, event),
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
    // GH#2812 sparse guard: find visits holes as undefined per ECMA-262 §22.1.3.9.
    return tableCoreStore.processedRows.find((row) => row && row.id === rowId)
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
    // GH#2812: Array.prototype.map skips holes per ECMA-262 §22.1.3.21, so
    // unloaded sparse indices are naturally excluded from the export rows.
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
          // GH#2812 sparse guard: find visits holes as undefined per ECMA-262 §22.1.3.9.
          const vrow = tableCoreStore.processedRows.find((r) => r && r.id === id)
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
    if (effectiveViewMode !== 'gantt') return

    // Track which store initiated the scroll to avoid infinite loops
    let scrollSource: 'table' | 'gantt' | null = null

    // Table → Gantt: When table scrolls vertically, sync to Gantt
    const disposeTableToGantt = reaction(
      () => stores.viewportStore.scrollTop,
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
  }, [effectiveViewMode, ganttViewStore, stores.viewportStore.scrollTop])

  // ====================================
  // SAFARI GESTURE PREVENTION (GH#2200)
  // Prevent pinch-zoom on the grid container on iOS Safari.
  // gesturestart/gesturechange/gestureend are Safari-specific events.
  // ====================================

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const preventGesture = (e: Event) => e.preventDefault()

    container.addEventListener('gesturestart', preventGesture, { passive: false })
    container.addEventListener('gesturechange', preventGesture, { passive: false })
    container.addEventListener('gestureend', preventGesture, { passive: false })

    return () => {
      container.removeEventListener('gesturestart', preventGesture)
      container.removeEventListener('gesturechange', preventGesture)
      container.removeEventListener('gestureend', preventGesture)
    }
  }, [])

  // ====================================
  // DERIVED STATE
  // ====================================

  // GH#2925 (p3/p4): overlay + empty-state predicates derived from InitStore.phase
  // and entityDataKnownComplete. The 'isReady' / 'isRendered' compound flags
  // and the legacy 10-flag hydrationState are removed.
  const showLoadingOverlay =
    !initStore ||
    initStore.phase !== 'painted' ||
    (!initStore.entityDataKnownComplete && tableCoreStore.processedRows.length === 0)

  // GH#2934 (p2): unified mount predicate — fires for any zero-row state
  // (empty / search-to-zero / filter-to-zero). Variant is resolved at the
  // render site below. Keeps the `isIncrementalProcessing` guard to avoid
  // flashing "empty" mid-stream during pagination.
  const showEmptyState =
    !!initStore &&
    initStore.phase === 'painted' &&
    initStore.entityDataKnownComplete &&
    tableCoreStore.processedRows.length === 0 &&
    !tableCoreStore.isIncrementalProcessing

  // Variant resolution — treat a filter group with no conditions as "no filter active"
  // (a consumer could call applyFilterGroup({logic: 'AND', conditions: []}) which we
  // must not mis-classify as the `filter` variant).
  const searchActive = Boolean(visualStateStore.globalSearchText)
  const filterActive = (visualStateStore.filterGroup?.conditions?.length ?? 0) > 0
  const emptyVariant: 'empty' | 'search' | 'filter' = searchActive
    ? 'search'
    : filterActive
      ? 'filter'
      : 'empty'

  // Header should show as soon as stores are ready (don't wait for renderer)
  // GH#1240: Respect showHeader prop for nested grids that don't need headers
  const shouldShowHeader = showHeader && !!stores && !isDataLoading && visualStateStore.columns.length > 0

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
      showLoadingOverlay,
      showEmptyState,
      phase: initStore?.phase,
      entityDataKnownComplete: initStore?.entityDataKnownComplete,
      processedRowCount: tableCoreStore.processedRows.length,
      columnCount: visualStateStore.columns.length,
      isDataLoading,
      hasStores: !!stores,
    })
  }, [
    shouldShowHeader,
    showLoadingOverlay,
    showEmptyState,
    initStore?.phase,
    initStore?.entityDataKnownComplete,
    tableCoreStore.processedRows.length,
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
      {showLoadingOverlay && initStore && (
        <div className="absolute inset-0 z-10">
          <VibeGridLoadingOverlay initStore={initStore} height={height} width={width} />
        </div>
      )}

      {/* Debug overlay - enable via console: __VIBEGRID_DEBUG__.enable() */}
      {debugStore && <DebugOverlay debugStore={debugStore} />}

      {/* Invisible data bridges for reactive entity reference resolution */}
      {entityRefBridges}

      {/* GH#2786 follow-up: relationship target collection slots — register
          target collections on the background priority-queue lane so name
          resolution works without preempting the page's own entity bootstrap. */}
      {relationshipTargetSlots}

      {/* Header with menu components - Show as soon as columns are ready */}
      {shouldShowHeader && (
        <VibeGridXHeaderPure
          stores={stores}
          enableGrouping={enableGrouping}
          viewMode={effectiveViewMode}
          onViewModeChange={onViewModeChange}
          schemaFields={schemaFields}
          enableHierarchy={enableHierarchy}
          enableRowExpansion={rowExpansionConfig?.enabled}
          searchConfig={searchConfig}
          enableExport={enableExport}
          onExportAll={handleExportAll}
          onCopyLink={onCopyLink}
          viewPickerProps={viewPickerProps}
          toolbarLeading={toolbarLeading}
          toolbarTrailing={toolbarTrailing}
        />
      )}

      {/* Gantt toolbar — wrapped in ModuleErrorBoundary so any transient
          read of ganttViewStore (availableDateFields, fieldMapping, etc.)
          during cold-load can't bubble past VibeGrid to the route-level
          GeneralError page. Deferred until phase==='painted' so the
          toolbar mounts against ready schema + data. */}
      {effectiveViewMode === 'gantt' && initStore.phase === 'painted' && (
        <ModuleErrorBoundary
          fallback={(error, reset) => (
            <ModuleErrorFallback
              error={error}
              onReset={reset}
              onSwitchToTable={onViewModeChange ? () => onViewModeChange('table') : undefined}
            />
          )}
        >
          <GanttToolbar />
        </ModuleErrorBoundary>
      )}

      {/* Main content area - Table, Split Pane (Gantt), or Kanban */}
      {/* IMPORTANT: containerRef must always be the same DOM element to keep renderer attached */}
      <div
        className={`flex-1 flex flex-row ${effectiveViewMode === 'kanban' ? 'overflow-x-auto overflow-y-hidden' : 'overflow-hidden'}`}
        style={{ minHeight: 0 }}
      >
        {/* Table container - ALWAYS rendered to maintain renderer attachment */}
        {/* Hidden when in Kanban mode, but kept in DOM to preserve renderer state */}
        <div
          style={{
            position: 'relative',
            flex:
              effectiveViewMode === 'kanban'
                ? '0 0 0px'
                : effectiveViewMode === 'gantt'
                  ? `0 0 ${cutoffWidth}px`
                  : '1 1 auto',
            overflow: 'hidden',
          }}
        >
          <div
            ref={containerRef}
            className="vibegrid-pure-renderer h-full overflow-auto"
            data-testid={`vibegrid-pure-renderer-${tableId}`}
            data-vibegrid-container="true"
            style={{
              width: '100%',
              height: '100%',
              position: 'relative',
              zIndex: 0,
              outline: 'none',
              overflow: effectiveViewMode === 'kanban' ? 'hidden' : 'auto',
              visibility: effectiveViewMode === 'kanban' ? 'hidden' : 'visible',
            }}
          />
          {/* GH#2934 (p2): Unified empty state — variant resolved from active search/filter.
              Subsumes the legacy inline search/filter empty block and routes all three
              zero-row surfaces through VibeGridEmptyState.
              GH#3016: When `emptyStateMode === 'dropzone'`, the empty state goes full-bleed
              (covers the column header strip) and renders `emptyStateContent` (typically an
              inline upload dropzone) as the primary affordance. The dropzone is useful for
              both truly-empty and filter-empty cases (user can still drop new files). */}
          {effectiveViewMode !== 'kanban' && showEmptyState && (
            <VibeGridEmptyState
              variant={emptyVariant}
              entityDisplayName={entityDisplayName}
              headline={emptyVariant === 'empty' ? emptyStateHeadline : undefined}
              body={emptyVariant === 'empty' ? emptyStateBody : undefined}
              cta={emptyVariant === 'empty' ? emptyStateCta : undefined}
              mode={emptyStateMode}
              dropzoneContent={emptyStateMode === 'dropzone' ? emptyStateContent : undefined}
            />
          )}
        </div>

        {/* Non-table view modes — rendered by activeModule via
            ViewModeRegistry. Wrapped in ModuleErrorBoundary so a
            transient read of partially-hydrated substrate state during
            a view-mode switch can't bubble past VibeGrid to the
            route-level GeneralError 500 page. Deferred until
            phase==='painted' so Gantt/Kanban only mount against ready
            data; the loading overlay above keeps the area visually
            covered while we wait. */}
        {activeModule && activeModule.id !== 'table' && initStore.phase === 'painted' && (
          <ModuleErrorBoundary
            fallback={(error, reset) => (
              <ModuleErrorFallback
                error={error}
                onReset={reset}
                onSwitchToTable={onViewModeChange ? () => onViewModeChange('table') : undefined}
              />
            )}
          >
            {activeModule.render(
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
                onEntityUpdate: commandBusEntityUpdate,
                schemaFields,
              },
              stores,
            )}
          </ModuleErrorBoundary>
        )}

        {/* Actions bar - appears when rows are selected (not in Kanban mode) */}
        {effectiveViewMode !== 'kanban' && enableSelectionColumn && (rowActions || enableDelete || enableExport) && (
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
              onRowAction ? (actionId, rowData) => onRowAction(actionId, [rowData.id], [rowData]) : undefined
            }
            enableDelete={enableDelete}
            onDelete={effectiveOnDelete ? (rowId, rowData) => effectiveOnDelete([rowId], [rowData]) : undefined}
            deleteConfirmation={deleteConfirmation ? (rowData) => deleteConfirmation([rowData]) : undefined}
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
