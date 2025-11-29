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

import { action, computed, makeObservable, observable } from 'mobx'
import type { IStore } from '@/app/stores/types'
import { DisposerManager } from '@/app/stores/utils/disposer'
import { getLogger } from '@/shared/lib/logging'
import type { InteractionStore } from './InteractionStore'
import type { PersistenceStore } from './PersistenceStore'
import type { TableCoreStore } from './TableCoreStore'
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

  // ====================================
  // DEPENDENCIES
  // ====================================

  private tableCoreStore: TableCoreStore | null = null
  private visualStateStore: VisualStateStore | null = null
  private interactionStore: InteractionStore | null = null
  private persistenceStore: PersistenceStore | null = null

  private tableId: string
  private entityType: string
  private disposers = new DisposerManager()

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
          reject(
            new Error(
              `Critical hydration errors: ${this.criticalErrors.map((e) => e.error).join(', ')}`,
            ),
          )
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
    this.timeouts.forEach((timeout) => clearTimeout(timeout))
    this.timeouts.clear()

    // Dispose all stores
    this.disposeStores()

    // Dispose reactions
    this.disposers.dispose()

    logger.info('🧹 InitStore disposed', {
      tableId: this.tableId,
    })
  }

  @action
  reset(): void {
    // Clear timeouts
    this.timeouts.forEach((timeout) => clearTimeout(timeout))
    this.timeouts.clear()

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

  private setupTimeouts(): void {
    Object.keys(this.hydrationState).forEach((dependency) => {
      this.setupTimeoutForDependency(dependency as keyof HydrationState)
    })
  }

  private setupTimeoutForDependency(dependency: keyof HydrationState): void {
    const timeout = setTimeout(() => {
      // Only log error if dependency is STILL not ready (prevents false positives from store recreation)
      if (!this.hydrationState[dependency]) {
        this.markError(
          dependency,
          `Dependency '${dependency}' timed out after ${this.DEPENDENCY_TIMEOUT}ms`,
          true,
        )
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
