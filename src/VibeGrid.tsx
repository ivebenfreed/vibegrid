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
import { createLogger } from '@/lib/logging'
import { SimplePassiveRenderer } from './renderers/core/SimplePassiveRenderer'
import { VibeGridXHeaderPure } from './components/VibeGridXHeaderPure'
import { VibeGridStoreProvider, useVibeGridStores } from './stores/context'
import { useVibeGridData } from './hooks/useVibeGridData'
import { VibeGridLoadingOverlay } from './components/VibeGridLoadingOverlay'

// Import VibeGrid CSS styles
import './vibegridx.css'

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

  const { rows, isLoading: isDataLoading, createEntity, updateEntity, deleteEntity } =
    useVibeGridData(entityType, visualStateStore)

  // ====================================
  // REFS
  // ====================================

  const containerRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<SimplePassiveRenderer | null>(null)

  // ====================================
  // SYNC TANSTACK DB DATA → TABLECORE STORE
  // ====================================

  useEffect(() => {
    if (rows) {
      tableCoreStore.setRows(rows)
    }
  }, [rows, tableCoreStore])

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

        // Wait for container
        if (!containerRef.current) {
          log.warn('⚠️ Container ref not available')
          return
        }

        // Wait for stores to be initialized
        if (!stores || !visualStateStore.columns.length) {
          log.info('⏳ Waiting for stores to initialize...')
          return
        }

        // Create the SimplePassiveRenderer with MobX stores
        const renderer = new SimplePassiveRenderer({
          container: containerRef.current,
          stores, // Pass MobX stores directly
          entityType,
          enableSelectionColumn,
          bufferSize,
          onEntityUpdate,
          onBatchEntityUpdate
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

    // Initialize when stores and data are ready
    if (stores && visualStateStore.columns.length > 0) {
      initializeRenderer()
    }

    // Cleanup
    return () => {
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
  }, [stores, visualStateStore.columns.length, entityType, tableId, rows])

  // ====================================
  // DERIVED STATE
  // ====================================

  const isReady = stores && visualStateStore.columns.length > 0 && !isDataLoading
  const isRendered = !!rendererRef.current

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

      {/* Header with menu components */}
      {isReady && !isDataLoading && isRendered && (
        <VibeGridXHeaderPure
          stores={stores}
          enableGrouping={enableGrouping}
          entityName={entityType}
          orgId={orgId}
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

      {/* Debug info in development */}
      {process.env.NODE_ENV === 'development' && isReady && (
        <div className="p-2 border-t bg-muted/50 text-xs space-y-1">
          <p>
            <strong>Architecture:</strong> MobX Stores + TanStack DB
          </p>
          <p>
            <strong>Renderer:</strong> SimplePassiveRenderer
          </p>
          <p>
            <strong>Rows:</strong> {rows?.length || 0} loaded
          </p>
          <p>
            <strong>Columns:</strong> {visualStateStore.columns.length}
          </p>
        </div>
      )}
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
  const { entityType, tableId, orgId } = props

  return (
    <VibeGridStoreProvider entityType={entityType} tableId={tableId} orgId={orgId}>
      <VibeGridInner {...props} />
    </VibeGridStoreProvider>
  )
}

export default VibeGrid
export type { VibeGridProps }
