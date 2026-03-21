/**
 * VibeGrid Store Context
 *
 * Provides all VibeGrid stores to components via React Context
 */

import type React from 'react'
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { useSchemaRegistry } from '@/app/stores'
import { getLogger } from '@/shared/lib/logging'
import { createVibeGridXCoordinateManager } from '../coordinates/VibeGridXCoordinateManager'
import { ObservableCoordinateManager } from '../coordinates/ObservableCoordinateManager'
import { domPositionStore } from './dom-position-state'
import { DebugStore } from './DebugStore'
import { EditingStore } from './EditingStore'
import { FilterBuilderStore } from './FilterBuilderStore'
import { InlineCreationStore } from './InlineCreationStore'
import { GanttViewStore } from './GanttViewStore'
import { HierarchyStore } from './HierarchyStore'
import { InitStore } from './InitStore'
import { InteractionStore } from './InteractionStore'
import { KanbanViewStore } from './KanbanViewStore'
import { MenuStateStore } from './MenuStateStore'
import { PersistenceStore } from './PersistenceStore'
import { TableCoreStore } from './TableCoreStore'
import { ViewModeStore } from './ViewModeStore'
import { ViewportStore } from './ViewportStore'
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
  viewportStore: ViewportStore
  viewModeStore: ViewModeStore
  ganttViewStore: GanttViewStore
  kanbanViewStore: KanbanViewStore
  hierarchyStore: HierarchyStore
  coordinateManager: ObservableCoordinateManager
  debugStore: DebugStore
  inlineCreationStore: InlineCreationStore
  filterBuilderStore: FilterBuilderStore
  menuStateStore: MenuStateStore
}

// SchemaRegistryLike imported from types and re-exported for backward compatibility
import type { SchemaRegistryLike } from '../types'
export type { SchemaRegistryLike }

export interface VibeGridStoreProviderProps {
  children: React.ReactNode
  entityType: string
  orgId?: string
  tableId?: string
  /**
   * Override the schema registry for testing with mock data.
   * When provided, bypasses useSchemaRegistry() and uses this directly.
   */
  schemaRegistryOverride?: SchemaRegistryLike
  /**
   * Override the TanStack DB collection for testing with mock data.
   * When provided, bypasses useEntityCollection() and uses this directly.
   * This allows VibeGrid to work with in-memory mock data instead of API calls.
   */
  collectionOverride?: any
  /**
   * GH#1861: Additional columns merged into schema-generated columns during init.
   * Included in preloadForColumns() and VisualStateStore initialization — no post-init effect needed.
   */
  appendColumns?: import('../types').Column[]
}

// ====================================
// CONTEXT
// ====================================

const VibeGridStoreContext = createContext<VibeGridStores | null>(null)

/**
 * Context for collection override (used for mock testing)
 * Separate from stores context because it's not a MobX store
 */
const VibeGridCollectionOverrideContext = createContext<any | null>(null)

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
  schemaRegistryOverride,
  collectionOverride,
  appendColumns,
}) => {
  const [initError, setInitError] = useState<string | null>(null)

  // Get schema registry from root store, or use override for mock testing
  const rootSchemaRegistry = useSchemaRegistry()
  const schemaRegistry = schemaRegistryOverride ?? rootSchemaRegistry

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
    const viewportStore = new ViewportStore()
    const viewModeStore = new ViewModeStore()
    const ganttViewStore = new GanttViewStore()
    const kanbanViewStore = new KanbanViewStore()
    const hierarchyStore = new HierarchyStore()
    const debugStore = new DebugStore()
    const inlineCreationStore = new InlineCreationStore()
    const filterBuilderStore = new FilterBuilderStore()
    const menuStateStore = new MenuStateStore()

    // Set up dependency injection between stores
    // VisualStateStore needs CoordinateManager for layout tracking
    visualStateStore.setCoordinateManager(coordinateManager)

    // VisualStateStore needs InteractionStore for clearing selections
    visualStateStore.setInteractionStore(interactionStore)

    // VisualStateStore needs ViewportStore for scroll/viewport state (P2 consolidation)
    visualStateStore.setViewportStore(viewportStore)

    // ViewportStore needs CoordinateManager for coordinate queries
    viewportStore.setCoordinateManager(coordinateManager)

    // ViewportStore needs TableCoreStore for variable-height virtual scrolling
    viewportStore.setTableCoreStore(tableCoreStore)

    // DOMPositionStore needs ViewportStore for scroll/viewport state (P2 consolidation)
    domPositionStore.setViewportStore(viewportStore)

    // VisualStateStore needs TableCoreStore for variable-height virtual scrolling
    visualStateStore.setTableCoreStore(tableCoreStore)

    // TableCoreStore needs VisualStateStore for filters, sorting, grouping
    tableCoreStore.setVisualStateInputs(visualStateStore)

    // TableCoreStore needs HierarchyStore for hierarchical data display
    tableCoreStore.setHierarchyStore(hierarchyStore)

    // TableCoreStore needs SchemaRegistry for column generation
    tableCoreStore.setSchemaRegistry(schemaRegistry)

    // GH#1861: Set appendColumns before init() so they're merged during column generation
    if (appendColumns?.length) {
      tableCoreStore.setAppendColumns(appendColumns)
    }

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

    // D2: Wire SlotRegistry into EditingStore and VisualStateStore
    editingStore.setSlotRegistry(initStore.slotRegistry)
    visualStateStore.setSlotRegistry(initStore.slotRegistry)

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
    initStore.setViewportStore(viewportStore)

    // GanttViewStore needs TableCoreStore for row data
    ganttViewStore.setTableCoreStore(tableCoreStore)

    // GanttViewStore needs SchemaRegistry for loading dependencies
    ganttViewStore.setSchemaRegistry(schemaRegistry, entityType)

    // ViewModeStore needs GanttViewStore for auto-sort on Gantt activation
    viewModeStore.setGanttViewStore(ganttViewStore)

    // KanbanViewStore needs TableCoreStore for row data
    kanbanViewStore.setTableCoreStore(tableCoreStore)

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
      viewportStore,
      viewModeStore,
      ganttViewStore,
      kanbanViewStore,
      hierarchyStore,
      coordinateManager,
      debugStore,
      inlineCreationStore,
      filterBuilderStore,
      menuStateStore,
    }
  }, [entityType, orgId, tableId, schemaRegistry, appendColumns])

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
      stores.viewportStore.dispose()
      stores.viewModeStore.dispose()
      stores.ganttViewStore.dispose()
      stores.kanbanViewStore.dispose()
      stores.hierarchyStore.dispose()
      stores.debugStore.dispose()
      stores.inlineCreationStore.dispose()
      stores.filterBuilderStore.dispose()
      stores.menuStateStore.dispose()
      // GH#1429 ML1: Dispose coordinateManager to clear listener subscriptions
      stores.coordinateManager.dispose()
    }
  }, [
    entityType,
    stores.coordinateManager.dispose, // GH#1429 ML1
    stores.debugStore.dispose,
    stores.editingStore.dispose,
    stores.filterBuilderStore.dispose,
    stores.ganttViewStore.dispose,
    stores.hierarchyStore.dispose,
    stores.initStore.dispose,
    stores.inlineCreationStore.dispose,
    stores.interactionStore.dispose,
    stores.kanbanViewStore.dispose,
    stores.menuStateStore.dispose,
    stores.persistenceStore.dispose, // Dispose ALL stores to clear timeouts and prevent memory leaks
    stores.tableCoreStore.dispose,
    stores.viewportStore.dispose,
    stores.viewModeStore.dispose,
    stores.visualStateStore.dispose,
    tableId,
  ]) // Run cleanup only on unmount

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
  // Also provide collection override if specified (for mock testing)
  return (
    <VibeGridStoreContext.Provider value={stores}>
      <VibeGridCollectionOverrideContext.Provider value={collectionOverride}>
        {children}
      </VibeGridCollectionOverrideContext.Provider>
    </VibeGridStoreContext.Provider>
  )
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

export function useViewportStore(): ViewportStore {
  return useVibeGridStores().viewportStore
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

export function useKanbanViewStore(): KanbanViewStore {
  return useVibeGridStores().kanbanViewStore
}

export function useDebugStore(): DebugStore {
  return useVibeGridStores().debugStore
}

export function useHierarchyStore(): HierarchyStore {
  return useVibeGridStores().hierarchyStore
}

export function useInlineCreationStore(): InlineCreationStore {
  return useVibeGridStores().inlineCreationStore
}

export function useFilterBuilderStore(): FilterBuilderStore {
  return useVibeGridStores().filterBuilderStore
}

export function useMenuStateStore(): MenuStateStore {
  return useVibeGridStores().menuStateStore
}

/**
 * Hook to access collection override from context
 * Returns null if no override is provided (normal API-backed operation)
 * Returns the override collection for mock testing scenarios
 */
export function useCollectionOverride(): any | null {
  return useContext(VibeGridCollectionOverrideContext)
}

/**
 * Hook to optionally access VibeGrid stores from components
 * Returns null if not within VibeGridStoreProvider (safe for use in components that may or may not be in grid context)
 */
export function useVibeGridStoresOptional(): VibeGridStores | null {
  return useContext(VibeGridStoreContext)
}
