/**
 * InitStore - VibeGrid Initialization & Lifecycle Coordinator (MobX)
 *
 * Migrated from init-state.ts (Legend State → MobX)
 *
 * This store handles:
 * - Coordinating initialization of all VibeGrid stores
 * - Tracking hydration progress and dependencies
 * - Managing store lifecycle (init, dispose, reset)
 * - Error handling and timeout detection
 *
 * Architecture:
 * - All stores must implement IStore interface (init, dispose, reset)
 * - InitStore coordinates the initialization sequence
 * - Progress tracking for debugging and UI feedback
 */

import { action, computed, makeObservable, observable, reaction } from 'mobx'
import type { IStore } from '@/app/stores/types'
import { DisposerManager } from '@/app/stores/utils/disposer'
import { getLogger } from '@/shared/lib/logging'
import { GRID_DIMENSIONS } from '../constants/grid-dimensions'
import { SlotRegistry } from '../slots/SlotRegistry'
import { registerDefaultSlots } from '../slots/slot-initialization'
import type { SimplePassiveRenderer } from '../renderers/core/SimplePassiveRenderer'
import type { InteractionStore } from './InteractionStore'
import type { PersistenceStore } from './PersistenceStore'
import type { TableCoreStore } from './TableCoreStore'
import type { ViewportStore } from './ViewportStore'
import type { VisualStateStore } from './VisualStateStore'

const logger = getLogger(['vibegrid', 'stores', 'InitStore'])

// ====================================
// TYPES
// ====================================

/**
 * Hydration state for tracking initialization progress
 */
export interface HydrationState {
  // Store initialization
  tableCoreStoreReady: boolean
  visualStateStoreReady: boolean
  interactionStoreReady: boolean
  persistenceStoreReady: boolean

  // Schema and data
  schemaLoaded: boolean
  entityDataLoaded: boolean

  // DOM dependencies
  containerReady: boolean
  viewportReady: boolean

  // Renderer dependencies
  rendererInitialized: boolean
  eventHandlersReady: boolean
}

export interface HydrationError {
  dependency: keyof HydrationState
  error: string
  timestamp: number
  canRetry: boolean
}

export interface HydrationMetrics {
  startTime: number
  endTime?: number
  totalDuration?: number
  dependencyTimings: Partial<Record<keyof HydrationState, number>>
}

// ====================================
// INIT STORE
// ====================================

export class InitStore implements IStore {
  // ====================================
  // OBSERVABLE STATE
  // ====================================

  @observable hydrationState: HydrationState = {
    // Store initialization
    tableCoreStoreReady: false,
    visualStateStoreReady: false,
    interactionStoreReady: false,
    persistenceStoreReady: false,

    // Schema and data
    schemaLoaded: false,
    entityDataLoaded: false,

    // DOM dependencies
    containerReady: false,
    viewportReady: false,

    // Renderer dependencies
    rendererInitialized: false,
    eventHandlersReady: false,
  }

  @observable errors: HydrationError[] = []

  @observable metrics: HydrationMetrics = {
    startTime: Date.now(),
    dependencyTimings: {},
  }

  /**
   * The renderer instance, created deterministically by InitStore
   * when columns are ready and the container is set.
   */
  @observable.ref renderer: SimplePassiveRenderer | null = null

  /** SlotRegistry instance for this grid - created during init, shared with all consumers */
  public slotRegistry: SlotRegistry = new SlotRegistry()

  // ====================================
  // DEPENDENCIES
  // ====================================

  private tableCoreStore: TableCoreStore | null = null
  private visualStateStore: VisualStateStore | null = null
  private interactionStore: InteractionStore | null = null
  private persistenceStore: PersistenceStore | null = null
  private viewportStore: ViewportStore | null = null

  private tableId: string
  private entityType: string
  private disposers = new DisposerManager()

  /**
   * DOM container element provided by VibeGrid.tsx via setContainer().
   * @observable.ref so MobX reaction can track when container is set.
   */
  @observable.ref
  private container: HTMLElement | null = null

  /**
   * Factory function provided by VibeGrid.tsx that creates a SimplePassiveRenderer.
   * This avoids InitStore needing to know about renderer options (entityType, callbacks, etc).
   * @observable.ref so MobX reaction can track when factory is set.
   */
  @observable.ref
  private rendererFactory: ((container: HTMLElement) => SimplePassiveRenderer) | null = null

  /**
   * ResizeObserver for tracking container dimension changes
   */
  private resizeObserver: ResizeObserver | null = null

  // Timeout tracking
  private timeouts = new Map<keyof HydrationState, NodeJS.Timeout>()
  private readonly DEPENDENCY_TIMEOUT = 15000 // 15 seconds

  // ====================================
  // CONSTRUCTOR
  // ====================================

  constructor(tableId: string, entityType: string) {
    this.tableId = tableId
    this.entityType = entityType

    makeObservable(this)

    logger.info('🚀 InitStore created', {
      tableId,
      entityType,
      totalDependencies: Object.keys(this.hydrationState).length,
    })
  }

  // ====================================
  // DEPENDENCY INJECTION
  // ====================================

  setTableCoreStore(store: TableCoreStore): void {
    this.tableCoreStore = store
  }

  setVisualStateStore(store: VisualStateStore): void {
    this.visualStateStore = store
  }

  setInteractionStore(store: InteractionStore): void {
    this.interactionStore = store
  }

  setPersistenceStore(store: PersistenceStore): void {
    this.persistenceStore = store
  }

  setViewportStore(store: ViewportStore): void {
    this.viewportStore = store
  }

  // ====================================
  // RENDERER LIFECYCLE (P4 - Deterministic Initialization)
  // ====================================

  /**
   * Set the DOM container element for the renderer.
   * Called by VibeGrid.tsx when the containerRef is available.
   */
  @action
  setContainer(container: HTMLElement): void {
    this.container = container
    logger.info('Container set on InitStore', {
      tableId: this.tableId,
      hasContainer: !!container,
    })
  }

  /**
   * Set the factory function that creates a SimplePassiveRenderer.
   * The factory captures closure variables from VibeGrid.tsx (entityType, callbacks, etc)
   * so InitStore doesn't need to know about renderer options.
   */
  @action
  setRendererFactory(factory: (container: HTMLElement) => SimplePassiveRenderer): void {
    this.rendererFactory = factory
    logger.info('Renderer factory set on InitStore', {
      tableId: this.tableId,
    })
  }

  // ====================================
  // COMPUTED VALUES
  // ====================================

  @computed
  get isFullyHydrated(): boolean {
    const allReady = Object.values(this.hydrationState).every((ready) => ready === true)

    if (allReady && !this.metrics.endTime) {
      this.recordHydrationComplete()
    }

    return allReady
  }

  @computed
  get hasErrors(): boolean {
    return this.errors.length > 0
  }

  @computed
  get criticalErrors(): HydrationError[] {
    return this.errors.filter((error) => !error.canRetry)
  }

  @computed
  get hydrationProgress(): number {
    const values = Object.values(this.hydrationState)
    const completed = values.filter((ready) => ready === true).length
    const total = values.length
    return Math.round((completed / total) * 100)
  }

  /**
   * Alias for isFullyHydrated - provides a clearer API for VibeGrid.tsx consumers.
   * Returns true when all hydration dependencies (including renderer) are ready.
   */
  @computed
  get isFullyReady(): boolean {
    return this.isFullyHydrated
  }

  // ====================================
  // PUBLIC API
  // ====================================

  /**
   * Mark a dependency as ready
   */
  @action
  markReady(dependency: keyof HydrationState): void {
    if (this.hydrationState[dependency]) {
      logger.warn('🔄 Dependency already marked ready', {
        dependency,
        tableId: this.tableId,
      })
      return
    }

    const timing = Date.now() - this.metrics.startTime
    this.metrics.dependencyTimings[dependency] = timing
    this.hydrationState[dependency] = true

    // Clear timeout for this dependency
    const timeout = this.timeouts.get(dependency)
    if (timeout) {
      clearTimeout(timeout)
      this.timeouts.delete(dependency)
    }

    logger.info('✅ Dependency ready', {
      dependency,
      timing: `${timing}ms`,
      tableId: this.tableId,
      progress: this.hydrationProgress,
    })
  }

  /**
   * Mark a dependency as failed
   */
  @action
  markError(dependency: keyof HydrationState, error: string, canRetry: boolean = true): void {
    const hydrationError: HydrationError = {
      dependency,
      error,
      timestamp: Date.now(),
      canRetry,
    }

    this.errors.push(hydrationError)

    logger.error('❌ Dependency failed', {
      dependency,
      error,
      canRetry,
      tableId: this.tableId,
    })
  }

  /**
   * Initialize all stores in correct order
   */
  @action
  async initializeStores(): Promise<void> {
    logger.info('🔄 Initializing all stores...', {
      tableId: this.tableId,
      entityType: this.entityType,
    })

    try {
      // Step 0: Register default slots and preload for columns
      registerDefaultSlots(this.slotRegistry)
      logger.info('Default slots registered', {
        slotCount: this.slotRegistry.getRegisteredIds().length,
      })

      // Step 1: Initialize PersistenceStore first (loads saved preferences)
      if (this.persistenceStore) {
        await this.persistenceStore.init()
        this.markReady('persistenceStoreReady')
      }

      // Step 2: Initialize TableCoreStore (loads schema)
      if (this.tableCoreStore) {
        await this.tableCoreStore.init()
        this.markReady('tableCoreStoreReady')
        this.markReady('schemaLoaded')
      }

      // Step 3: Initialize VisualStateStore
      if (this.visualStateStore) {
        await this.visualStateStore.init()
        this.markReady('visualStateStoreReady')
      }

      // Step 4: Initialize InteractionStore
      if (this.interactionStore) {
        await this.interactionStore.init()
        this.markReady('interactionStoreReady')
      }

      // Step 4.5: Preload slots for the loaded columns
      if (this.tableCoreStore && this.visualStateStore) {
        const columns = this.visualStateStore.columns
        if (columns.length > 0) {
          const slotContext = {
            entityType: this.entityType,
            viewMode: 'table' as const,
          }
          await this.slotRegistry.preloadForColumns(columns, slotContext)
          // Now that preload is complete, precompute affordances
          this.visualStateStore.precomputeAffordancesFromSlotRegistry(columns, slotContext)
          logger.info('✅ Slots preloaded for columns', {
            columnCount: columns.length,
          })
        }
      }

      // Step 5: Set up renderer creation reaction
      // When columns are ready AND container is set, create the renderer deterministically
      this.setupRendererReaction()

      // Step 6: Set up totalRows wiring reaction
      // When processedRows changes, update ViewportStore content size
      this.setupTotalRowsReaction()

      logger.info('✅ All stores initialized successfully', {
        tableId: this.tableId,
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      logger.error('❌ Store initialization failed', {
        tableId: this.tableId,
        error: errorMessage,
      })
      throw error
    }
  }

  /**
   * Dispose all stores
   */
  disposeStores(): void {
    logger.info('🧹 Disposing all stores...', {
      tableId: this.tableId,
    })

    this.tableCoreStore?.dispose()
    this.visualStateStore?.dispose()
    this.interactionStore?.dispose()
    this.persistenceStore?.dispose()

    logger.info('✅ All stores disposed', {
      tableId: this.tableId,
    })
  }

  /**
   * Reset all stores to default state
   */
  @action
  resetStores(): void {
    logger.info('🔄 Resetting all stores...', {
      tableId: this.tableId,
    })

    this.tableCoreStore?.reset()
    this.visualStateStore?.reset()
    this.interactionStore?.reset()
    this.persistenceStore?.reset()

    // Reset hydration state
    this.resetHydrationState()

    logger.info('✅ All stores reset', {
      tableId: this.tableId,
    })
  }

  /**
   * Get current status for debugging
   */
  getStatus() {
    return {
      tableId: this.tableId,
      entityType: this.entityType,
      isFullyHydrated: this.isFullyHydrated,
      progress: this.hydrationProgress,
      state: this.hydrationState,
      errors: this.errors,
      metrics: this.metrics,
      pendingTimeouts: Array.from(this.timeouts.keys()),
    }
  }

  /**
   * Wait for full hydration (Promise-based)
   */
  async waitForHydration(timeoutMs: number = 30000): Promise<boolean> {
    return new Promise((resolve, reject) => {
      // If already hydrated, resolve immediately
      if (this.isFullyHydrated) {
        resolve(true)
        return
      }

      // Set up overall timeout
      const overallTimeout = setTimeout(() => {
        reject(new Error(`VibeGrid hydration timeout after ${timeoutMs}ms`))
      }, timeoutMs)

      // Poll for completion (MobX doesn't have direct "when" like Legend State)
      const checkInterval = setInterval(() => {
        if (this.isFullyHydrated) {
          clearTimeout(overallTimeout)
          clearInterval(checkInterval)
          resolve(true)
        }

        if (this.criticalErrors.length > 0) {
          clearTimeout(overallTimeout)
          clearInterval(checkInterval)
          reject(new Error(`Critical hydration errors: ${this.criticalErrors.map((e) => e.error).join(', ')}`))
        }
      }, 100)
    })
  }

  // ====================================
  // ISTORE LIFECYCLE
  // ====================================

  async init(): Promise<void> {
    logger.info('🔄 Initializing InitStore...', {
      tableId: this.tableId,
      entityType: this.entityType,
    })

    // Timeouts disabled - dependencies are marked ready by components during initialization
    // The timeout system was causing false positives when stores were recreated

    // Initialize all stores
    await this.initializeStores()

    logger.info('✅ InitStore initialized', {
      tableId: this.tableId,
    })
  }

  dispose(): void {
    // Clear all timeouts
    for (const timeout of this.timeouts.values()) clearTimeout(timeout)
    this.timeouts.clear()

    // Destroy renderer and ResizeObserver
    this.destroyRenderer()

    // Dispose all stores
    this.disposeStores()

    // Dispose reactions (renderer reaction, totalRows reaction, etc)
    this.disposers.dispose()

    // Clear factory and container references
    this.rendererFactory = null
    this.container = null

    logger.info('🧹 InitStore disposed', {
      tableId: this.tableId,
    })
  }

  @action
  reset(): void {
    // Clear timeouts
    for (const timeout of this.timeouts.values()) clearTimeout(timeout)
    this.timeouts.clear()

    // Destroy renderer and ResizeObserver
    this.destroyRenderer()

    // Reset all stores
    this.resetStores()

    // Reset metrics and errors
    this.resetHydrationState()

    // Restart timeouts
    this.setupTimeouts()

    logger.info('🔄 InitStore reset', {
      tableId: this.tableId,
    })
  }

  // ====================================
  // PRIVATE METHODS
  // ====================================

  @action
  private recordHydrationComplete(): void {
    this.metrics.endTime = Date.now()
    this.metrics.totalDuration = this.metrics.endTime - this.metrics.startTime

    logger.info('🎉 VibeGrid fully hydrated', {
      tableId: this.tableId,
      entityType: this.entityType,
      duration: this.metrics.totalDuration,
      dependencyTimings: this.metrics.dependencyTimings,
    })
  }

  @action
  private resetHydrationState(): void {
    // Reset hydration state
    Object.keys(this.hydrationState).forEach((key) => {
      this.hydrationState[key as keyof HydrationState] = false
    })

    // Reset metrics and errors
    this.errors = []
    this.metrics = {
      startTime: Date.now(),
      dependencyTimings: {},
    }
  }

  /**
   * Set up MobX reaction that creates the renderer when:
   * - columns are loaded (visualStateStore.columns.length > 0)
   * - container is set (this.container)
   * - rendererFactory is set
   * - renderer has not already been created (!this.hydrationState.rendererInitialized)
   *
   * This replaces the VibeGrid.tsx autorun that previously raced with initializeStores().
   */
  private setupRendererReaction(): void {
    const rendererReaction = reaction(
      () => ({
        columnCount: this.visualStateStore?.columns.length ?? 0,
        hasContainer: !!this.container,
        hasFactory: !!this.rendererFactory,
        alreadyInitialized: this.hydrationState.rendererInitialized,
      }),
      ({ columnCount, hasContainer, hasFactory, alreadyInitialized }) => {
        if (columnCount > 0 && hasContainer && hasFactory && !alreadyInitialized) {
          logger.info('Renderer reaction triggered - creating renderer', {
            tableId: this.tableId,
            columnCount,
          })
          this.createRenderer()
        }
      },
      {
        // Fire immediately if conditions are already met (e.g. container set before columns load)
        fireImmediately: true,
      },
    )

    this.disposers.add(rendererReaction)
  }

  /**
   * Create the renderer using the factory function and set up the ResizeObserver.
   * This is called by the renderer reaction when all prerequisites are met.
   */
  @action
  private createRenderer(): void {
    if (!this.container || !this.rendererFactory) {
      logger.warn('Cannot create renderer - missing container or factory', {
        tableId: this.tableId,
        hasContainer: !!this.container,
        hasFactory: !!this.rendererFactory,
      })
      return
    }

    if (this.renderer) {
      logger.warn('Renderer already exists - skipping creation', {
        tableId: this.tableId,
      })
      return
    }

    try {
      // Create the renderer synchronously via factory
      const renderer = this.rendererFactory(this.container)
      this.renderer = renderer

      // Set up ResizeObserver to track container dimensions
      this.setupResizeObserver()

      // Initial viewport update
      if (this.container && this.visualStateStore) {
        const rect = this.container.getBoundingClientRect()
        this.visualStateStore.updateViewportDimensions(rect.width, rect.height)
      }

      logger.info('Renderer created successfully via InitStore', {
        tableId: this.tableId,
        entityType: this.entityType,
      })
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error'
      logger.error('Failed to create renderer', {
        tableId: this.tableId,
        error: errorMsg,
      })
      this.markError('rendererInitialized', errorMsg, true)
    }
  }

  /**
   * Set up ResizeObserver on the container to track viewport dimension changes.
   */
  private setupResizeObserver(): void {
    if (!this.container || !this.visualStateStore) return

    // Clean up existing observer
    if (this.resizeObserver) {
      this.resizeObserver.disconnect()
    }

    const visualStateStore = this.visualStateStore
    const container = this.container

    this.resizeObserver = new ResizeObserver(() => {
      const rect = container.getBoundingClientRect()
      visualStateStore.updateViewportDimensions(rect.width, rect.height)
    })

    this.resizeObserver.observe(this.container)
  }

  /**
   * Set up MobX reaction that watches processedRows.length and updates
   * ViewportStore.updateContentSize() when data loads.
   * This ensures totalRows is populated for virtual scrolling calculations.
   */
  private setupTotalRowsReaction(): void {
    if (!this.tableCoreStore || !this.viewportStore) {
      logger.debug('Skipping totalRows reaction - missing tableCoreStore or viewportStore', {
        tableId: this.tableId,
        hasTableCoreStore: !!this.tableCoreStore,
        hasViewportStore: !!this.viewportStore,
      })
      return
    }

    const tableCoreStore = this.tableCoreStore
    const viewportStore = this.viewportStore

    const totalRowsReaction = reaction(
      () => tableCoreStore.processedRows.length,
      (rowCount) => {
        const totalHeight = rowCount * GRID_DIMENSIONS.ROW_HEIGHT
        viewportStore.updateContentSize(viewportStore.totalContentWidth, totalHeight)

        logger.debug('Updated ViewportStore content size from processedRows', {
          tableId: this.tableId,
          rowCount,
          totalHeight,
        })
      },
      { fireImmediately: true },
    )

    this.disposers.add(totalRowsReaction)
  }

  /**
   * Destroy the current renderer and clean up associated resources.
   */
  @action
  destroyRenderer(): void {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect()
      this.resizeObserver = null
    }

    if (this.renderer) {
      this.renderer.destroy()
      this.renderer = null

      // Reset renderer-related hydration flags so the renderer creation
      // reaction can fire again when a new factory is provided.
      this.hydrationState.rendererInitialized = false
      this.hydrationState.viewportReady = false
      this.hydrationState.eventHandlersReady = false
    }
  }

  private setupTimeouts(): void {
    Object.keys(this.hydrationState).forEach((dependency) => {
      this.setupTimeoutForDependency(dependency as keyof HydrationState)
    })
  }

  private setupTimeoutForDependency(dependency: keyof HydrationState): void {
    const timeout = setTimeout(() => {
      // Only log error if dependency is STILL not ready (prevents false positives from store recreation)
      if (!this.hydrationState[dependency]) {
        this.markError(dependency, `Dependency '${dependency}' timed out after ${this.DEPENDENCY_TIMEOUT}ms`, true)
      }
    }, this.DEPENDENCY_TIMEOUT)

    this.timeouts.set(dependency, timeout)
  }
}

/**
 * Factory function to create InitStore
 */
export function createInitStore(tableId: string, entityType: string): InitStore {
  return new InitStore(tableId, entityType)
}
