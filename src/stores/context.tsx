/**
 * VibeGrid Store Context
 *
 * Provides all VibeGrid stores to components via React Context
 */

import { observer } from 'mobx-react-lite'
import type React from 'react'
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { useSchemaRegistry } from '@/app/stores'
import { getLogger } from '@/shared/lib/logging'
import { createVibeGridXCoordinateManager } from '../coordinates/VibeGridXCoordinateManager'
import { ObservableCoordinateManager } from '../coordinates/ObservableCoordinateManager'
import { EditingStore } from './EditingStore'
import { GanttViewStore } from './GanttViewStore'
import { InitStore } from './InitStore'
import { InteractionStore } from './InteractionStore'
import { PersistenceStore } from './PersistenceStore'
import { TableCoreStore } from './TableCoreStore'
import { ViewModeStore } from './ViewModeStore'
import { VirtualViewportStore } from './VirtualViewportStore'
import { VisualStateStore } from './VisualStateStore'

const logger = getLogger(['vibegrid', 'stores', 'context'])

// ====================================
// TYPES
// ====================================

export interface VibeGridStores {
  tableCoreStore: TableCoreStore
  visualStateStore: VisualStateStore
  interactionStore: InteractionStore
  editingStore: EditingStore
  persistenceStore: PersistenceStore
  initStore: InitStore
  virtualViewportStore: VirtualViewportStore
  viewModeStore: ViewModeStore
  ganttViewStore: GanttViewStore
  coordinateManager: ObservableCoordinateManager
}

export interface VibeGridStoreProviderProps {
  children: React.ReactNode
  entityType: string
  orgId?: string
  tableId?: string
}

// ====================================
// CONTEXT
// ====================================

const VibeGridStoreContext = createContext<VibeGridStores | null>(null)

// ====================================
// PROVIDER
// ====================================

/**
 * Provider component for VibeGrid stores
 * Creates and initializes all stores, provides them to child components
 *
 * NOTE: This component should NOT be wrapped in observer() because:
 * 1. It only renders once to provide stable store instances via useMemo
 * 2. Wrapping in observer() causes remount when ANY MobX observable changes
 * 3. Child components (VibeGridInner) use observer() for reactive updates
 */
export const VibeGridStoreProvider: React.FC<VibeGridStoreProviderProps> = ({
  children,
  entityType,
  orgId,
  tableId = 'default',
}) => {
  const [initError, setInitError] = useState<string | null>(null)

  // Get schema registry from root store
  const schemaRegistry = useSchemaRegistry()

  // Create and initialize stores once using useMemo
  const stores = useMemo(() => {
    logger.info('🏗️ Creating and initializing VibeGrid stores', {
      entityType,
      orgId,
      tableId,
    })

    // Create coordinate manager (shared single source of truth)
    // Wrap in ObservableCoordinateManager for MobX reactivity
    const baseCoordinator = createVibeGridXCoordinateManager()
    const coordinateManager = new ObservableCoordinateManager(baseCoordinator)

    // Create all stores
    const tableCoreStore = new TableCoreStore(entityType)
    const visualStateStore = new VisualStateStore()
    const interactionStore = new InteractionStore()
    const editingStore = new EditingStore(tableCoreStore, visualStateStore)
    const persistenceStore = new PersistenceStore(entityType, orgId)
    const initStore = new InitStore(tableId, entityType)
    const virtualViewportStore = new VirtualViewportStore()
    const viewModeStore = new ViewModeStore()
    const ganttViewStore = new GanttViewStore()

    // Set up dependency injection between stores
    // VisualStateStore needs CoordinateManager for layout tracking
    visualStateStore.setCoordinateManager(coordinateManager)

    // VisualStateStore needs InteractionStore for clearing selections
    visualStateStore.setInteractionStore(interactionStore)

    // VisualStateStore needs TableCoreStore for variable-height virtual scrolling
    visualStateStore.setTableCoreStore(tableCoreStore)

    // TableCoreStore needs VisualStateStore for filters, sorting, grouping
    tableCoreStore.setVisualStateInputs(visualStateStore)

    // TableCoreStore needs SchemaRegistry for column generation
    tableCoreStore.setSchemaRegistry(schemaRegistry)

    // TableCoreStore needs CoordinateManager for row position tracking
    tableCoreStore.setCoordinateManager(coordinateManager)

    // TableCoreStore needs InteractionStore for clearing selections
    tableCoreStore.setInteractionStore(interactionStore)

    // InteractionStore needs TableCoreStore and VisualStateStore for data context
    interactionStore.setTableCoreStore(tableCoreStore)
    interactionStore.setVisualStateStore(visualStateStore)

    // EditingStore initialized with dependencies in constructor
    // Call init() to set up any reactions
    editingStore.init()

    // PersistenceStore needs all stores to save/load preferences
    persistenceStore.setTableCoreStore(tableCoreStore)
    persistenceStore.setVisualStateStore(visualStateStore)
    persistenceStore.setInteractionStore(interactionStore)
    persistenceStore.setGanttViewStore(ganttViewStore)
    persistenceStore.setViewModeStore(viewModeStore)

    // InitStore coordinates all stores
    initStore.setTableCoreStore(tableCoreStore)
    initStore.setVisualStateStore(visualStateStore)
    initStore.setInteractionStore(interactionStore)
    initStore.setPersistenceStore(persistenceStore)

    // GanttViewStore needs TableCoreStore for row data
    ganttViewStore.setTableCoreStore(tableCoreStore)

    // GanttViewStore needs SchemaRegistry for loading dependencies
    ganttViewStore.setSchemaRegistry(schemaRegistry, entityType)

    // Initialize synchronously
    initStore.init().catch((error) => {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      setInitError(errorMessage)
      logger.error('❌ VibeGrid store initialization failed', {
        entityType,
        tableId,
        error: errorMessage,
      })
    })

    logger.info('✅ VibeGrid stores created, wired, and initialized', {
      entityType,
      tableId,
    })

    return {
      tableCoreStore,
      visualStateStore,
      interactionStore,
      editingStore,
      persistenceStore,
      initStore,
      virtualViewportStore,
      viewModeStore,
      ganttViewStore,
      coordinateManager,
    }
  }, [entityType, orgId, tableId])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      logger.info('🧹 Cleaning up VibeGrid stores...', {
        entityType,
        tableId,
      })

      // Dispose ALL stores to clear timeouts and prevent memory leaks
      stores.tableCoreStore.dispose()
      stores.visualStateStore.dispose()
      stores.interactionStore.dispose()
      stores.editingStore.dispose()
      stores.persistenceStore.dispose()
      stores.initStore.dispose()
      stores.viewModeStore.dispose()
      stores.ganttViewStore.dispose()
    }
  }, []) // Run cleanup only on unmount

  // Show error state if initialization failed
  if (initError) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded">
        <h3 className="font-semibold text-red-800">VibeGrid Initialization Error</h3>
        <p className="text-red-600 text-sm mt-1">{initError}</p>
      </div>
    )
  }

  // Provide stores to children immediately (initialization happens in useMemo)
  return <VibeGridStoreContext.Provider value={stores}>{children}</VibeGridStoreContext.Provider>
}

VibeGridStoreProvider.displayName = 'VibeGridStoreProvider'

// ====================================
// HOOKS
// ====================================

/**
 * Hook to access VibeGrid stores from components
 * Must be used within VibeGridStoreProvider
 */
export function useVibeGridStores(): VibeGridStores {
  const context = useContext(VibeGridStoreContext)

  if (!context) {
    throw new Error('useVibeGridStores must be used within VibeGridStoreProvider')
  }

  return context
}

/**
 * Hook to access a specific store
 */
export function useTableCoreStore(): TableCoreStore {
  return useVibeGridStores().tableCoreStore
}

export function useVisualStateStore(): VisualStateStore {
  return useVibeGridStores().visualStateStore
}

export function useInteractionStore(): InteractionStore {
  return useVibeGridStores().interactionStore
}

export function useEditingStore(): EditingStore {
  return useVibeGridStores().editingStore
}

export function usePersistenceStore(): PersistenceStore {
  return useVibeGridStores().persistenceStore
}

export function useInitStore(): InitStore {
  return useVibeGridStores().initStore
}

export function useCoordinateManager(): ObservableCoordinateManager {
  return useVibeGridStores().coordinateManager
}

export function useViewModeStore(): ViewModeStore {
  return useVibeGridStores().viewModeStore
}

export function useGanttViewStore(): GanttViewStore {
  return useVibeGridStores().ganttViewStore
}
