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

import React, { useEffect, useRef } from 'react'
import { observer } from 'mobx-react-lite'
import { autorun } from 'mobx'
import { useLiveQuery } from '@tanstack/react-db'
import { createLogger } from '@/shared/lib/logging'
import { SimplePassiveRenderer } from './renderers/core/SimplePassiveRenderer'
import { VibeGridXHeaderPure } from './components/VibeGridXHeaderPure'
import { VibeGridStoreProvider, useVibeGridStores } from './stores/context'
import { useVibeGridData } from './hooks/useVibeGridData'
import { VibeGridLoadingOverlay } from './components/VibeGridLoadingOverlay'
import { membersCollection } from '@/shared/data/db/collections/member-collection'

// Import VibeGrid CSS styles
import './vibegridx.css'

// Import logging presets (exposes __VIBEGRID_LOGS__ on window)
import './utils/logging-presets'

const log = createLogger('components/vibegrid/VibeGrid')

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
    updates: Array<{ id: string; updates: Record<string, any> }>
  ) => Promise<void> | void

  // Performance options
  enableVirtualScrolling?: boolean
  bufferSize?: number

  // Feature flags
  enableGrouping?: boolean
  enableFiltering?: boolean
  enableSorting?: boolean
  enableDragAndDrop?: boolean
  enableSelectionColumn?: boolean
}

// ====================================
// INNER COMPONENT (Uses MobX stores from context)
// ====================================

const VibeGridInner = observer(<T extends Record<string, any> = any>(props: VibeGridProps<T>) => {
  const {
    tableId,
    entityType,
    orgId,
    className = '',
    height = 600,
    width = '100%',
    enableSelectionColumn = false,
    onCellClick,
    onCellDoubleClick,
    onSelectionChange,
    onEditingChange,
    onPerformanceUpdate,
    onEntityUpdate,
    onBatchEntityUpdate,
    enableVirtualScrolling = true,
    bufferSize = 10,
    enableGrouping = true,
    enableFiltering = true,
    enableSorting = true,
    enableDragAndDrop = true
  } = props

  // ====================================
  // GET MOBX STORES FROM CONTEXT
  // ====================================

  const stores = useVibeGridStores()
  const { tableCoreStore, visualStateStore, interactionStore, initStore } = stores

  // ====================================
  // TANSTACK DB INTEGRATION
  // ====================================

  const { rows, isLoading: isDataLoading, collection, createEntity, updateEntity, deleteEntity } =
    useVibeGridData(entityType, visualStateStore)

  // Fetch organization members for UserReference fields (automatic org context)
  const { data: members = [], isLoading: membersLoading, status: membersStatus } = useLiveQuery((q) =>
    q.from({ members: membersCollection })
  )

  // Log members query status
  useEffect(() => {
    log.info('[MEMBERS] useLiveQuery status', {
      status: membersStatus,
      isLoading: membersLoading,
      memberCount: members?.length || 0,
      hasMembersData: members && members.length > 0,
      firstMember: members?.[0]
    })
  }, [members, membersLoading, membersStatus])

  // ====================================
  // REFS
  // ====================================

  const containerRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<SimplePassiveRenderer | null>(null)

  // ====================================
  // SYNC TANSTACK DB DATA → TABLECORE STORE
  // ====================================

  useEffect(() => {
    if (!stores || !stores.initStore) {
      log.warn('[VGDEBUG] ⚠️ Stores not ready for entity data load')
      return
    }

    // Always set rows (even if empty array) and mark as loaded
    tableCoreStore.setRows(rows || [])

    // Mark entity data as loaded (even if empty - it means loading completed)
    stores.initStore.markReady('entityDataLoaded')
    log.info('[VGDEBUG] 📊 Entity data loaded', { rowCount: rows?.length || 0 })
  }, [rows, tableCoreStore, stores])

  // Sync members data to store for UserReference fields
  useEffect(() => {
    if (!tableCoreStore) return
    log.debug('Syncing members to TableCoreStore', { memberCount: members.length })
    tableCoreStore.setMembersData(members)
  }, [members, tableCoreStore])

  // Set TanStack DB collection on InteractionStore for entity mutations
  useEffect(() => {
    if (!interactionStore || !collection) return
    log.info('Setting TanStack DB collection on InteractionStore', {
      hasCollection: !!collection,
      entityType
    })
    interactionStore.setCollection(collection)
  }, [collection, interactionStore, entityType])

  // Set TanStack DB collection on TableCoreStore for cross-group moves
  useEffect(() => {
    if (!tableCoreStore || !collection) return
    log.info('Setting TanStack DB collection on TableCoreStore', {
      hasCollection: !!collection,
      entityType
    })
    tableCoreStore.setCollection(collection)
  }, [collection, tableCoreStore, entityType])

  // ====================================
  // INITIALIZATION
  // ====================================

  useEffect(() => {
    const initializeRenderer = async () => {
      try {
        log.info('🚀 Initializing VibeGrid renderer', {
          tableId,
          entityType,
          storesReady: !!stores,
          rowCount: rows?.length || 0
        })

        // Check if stores are available
        if (!stores || !stores.initStore) {
          log.warn('[VGDEBUG] ⚠️ Stores not ready for initialization')
          return
        }

        // Wait for container
        if (!containerRef.current) {
          log.warn('[VGDEBUG] ⚠️ Container ref not available')
          return
        }

        // Mark container as ready
        stores.initStore.markReady('containerReady')
        log.info('[VGDEBUG] ✅ Container ready')

        // Wait for stores to be initialized
        if (!visualStateStore.columns.length) {
          log.info('[VGDEBUG] ⏳ Waiting for columns to load...', {
            columnCount: visualStateStore.columns.length
          })
          return
        }

        log.info('[VGDEBUG] ✅ About to create SimplePassiveRenderer', {
          columnCount: visualStateStore.columns.length
        })

        // Create the SimplePassiveRenderer with MobX stores
        const renderer = new SimplePassiveRenderer({
          container: containerRef.current,
          stores, // Pass MobX stores directly
          entityType,
          enableSelectionColumn,
          bufferSize,
          onEntityUpdate,
          onBatchEntityUpdate,
          onCellClick // ✅ Thread onCellClick to InteractionCoordinator
        })

        rendererRef.current = renderer

        log.info('✅ SimplePassiveRenderer created successfully')

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

        log.info('🎯 VibeGrid fully initialized', {
          entityType,
          tableId,
          rowCount: rows?.length || 0
        })
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error'
        log.error('❌ Failed to initialize VibeGrid', err)
      }
    }

    // Use MobX autorun to reactively trigger initialization when columns are ready
    // This allows us to avoid having visualStateStore.columns in React dependencies
    const disposer = autorun(() => {
      // Read columns.length inside autorun to track it
      const hasColumns = visualStateStore.columns.length > 0

      if (stores && hasColumns && !rendererRef.current) {
        log.info('🎯 MobX autorun: Columns ready, initializing renderer', {
          columnCount: visualStateStore.columns.length
        })
        initializeRenderer()
      }
    })

    // Cleanup only on unmount
    return () => {
      // Dispose MobX autorun
      disposer()

      if (rendererRef.current) {
        log.debug('🧹 Cleaning up VibeGrid')

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
  // DERIVED STATE
  // ====================================

  // Use rendererRef to determine if ready - avoids MobX tracking of visualStateStore.columns
  const isReady = stores && !isDataLoading
  const isRendered = !!rendererRef.current

  // Header should show as soon as stores are ready (don't wait for renderer)
  const shouldShowHeader = isReady && visualStateStore.columns.length > 0

  // Log header visibility decision
  useEffect(() => {
    log.info('📊 Header visibility check', {
      shouldShowHeader,
      isReady,
      isRendered,
      showLoadingOverlay: (!isReady || !isRendered),
      columnCount: visualStateStore.columns.length,
      isDataLoading,
      hasStores: !!stores
    })
  }, [shouldShowHeader, isReady, isRendered, visualStateStore.columns.length, isDataLoading, stores])

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
        flexDirection: 'column'
      }}
    >
      {/* Loading overlay */}
      {(!isReady || !isRendered) && initStore && (
        <div className="absolute inset-0 z-10">
          <VibeGridLoadingOverlay initStore={initStore} height={height} width={width} />
        </div>
      )}

      {/* Header with menu components - Show as soon as columns are ready */}
      {shouldShowHeader && (
        <VibeGridXHeaderPure
          stores={stores}
          enableGrouping={enableGrouping}
          entityName={entityType}
          orgId={orgId}
          createEntity={createEntity}
        />
      )}

      {/* Main table container */}
      <div className="flex-1" style={{ minHeight: 0 }}>
        <div
          ref={containerRef}
          className="vibegrid-pure-renderer h-full w-full"
          data-testid={`vibegrid-pure-renderer-${tableId}`}
          data-vibegrid-container="true"
          style={{
            width: '100%',
            height: '100%',
            position: 'relative'
          }}
        />
      </div>

      {/* Debug info in development - removed to avoid MobX tracking */}
    </div>
  )
})

VibeGridInner.displayName = 'VibeGridInner'

// ====================================
// MAIN COMPONENT (Provides store context)
// ====================================

export function VibeGrid<T extends Record<string, any> = any>(
  props: VibeGridProps<T>
): React.ReactElement {
  // Note: VibeGrid expects to be wrapped in VibeGridStoreProvider by the parent
  // This allows for better control over store lifecycle from the parent component
  return <VibeGridInner {...props} />
}

export default VibeGrid
export type { VibeGridProps }
