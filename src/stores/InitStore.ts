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
 * Error recorded during hydration. `dependency` is a free-form string identifying
 * the failing subsystem (e.g. 'rendererInitialized'); the 10-flag HydrationState
 * was removed in GH#2925 p4, so this is no longer a typed key union.
 */
export interface HydrationError {
  dependency: string
  error: string
  timestamp: number
  canRetry: boolean
}

export interface HydrationMetrics {
  startTime: number
  endTime?: number
  totalDuration?: number
}

/**
 * 4-state lifecycle phase (GH#2925 p4 — sole source of truth).
 * Forward-only progression: 'init' → 'schema' → 'controllers' → 'painted'.
 */
export type InitPhase = 'init' | 'schema' | 'controllers' | 'painted'

const PHASE_ORDER: readonly InitPhase[] = ['init', 'schema', 'controllers', 'painted'] as const

// ====================================
// INIT STORE
// ====================================

export class InitStore implements IStore {
  // ====================================
  // OBSERVABLE STATE
  // ====================================

  /**
   * 4-state lifecycle phase (GH#2925 p4 — load-bearing).
   * Forward-only progression: 'init' → 'schema' → 'controllers' → 'painted'.
   */
  @observable phase: InitPhase = 'init'

  /**
   * Set to true once the substrate (or fallback) reports that the entity
   * collection's row count is definitively known (zero or non-zero).
   * Drives the empty-state vs loading-overlay decision in VibeGrid.tsx.
   */
  @observable entityDataKnownComplete: boolean = false

  @observable errors: HydrationError[] = []

  @observable metrics: HydrationMetrics = {
    startTime: Date.now(),
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

  /**
   * GH#2925 p4 — generation id used to invalidate stale 15s hydration-stall
   * timers when reset()/init() is called before the previous timer fires.
   */
  private generationId = 0

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
   * Accepts null so callers can clear the reference during teardown.
   */
  @action
  setContainer(container: HTMLElement | null): void {
    this.container = container
    logger.info('Container set on InitStore', {
      tableId: this.tableId,
      hasContainer: !!container,
    })
  }

  /**
   * Mark entity data as known-complete.
   *
   * Called when the substrate (or fallback) confirms the entity collection's
   * row count is definitively known (zero or non-zero). Drives the
   * empty-state vs loading-overlay decision in VibeGrid.tsx. Idempotent.
   */
  @action
  markEntityDataKnownComplete(): void {
    if (this.entityDataKnownComplete) return
    this.entityDataKnownComplete = true
  }

  /**
   * Advance the lifecycle phase forward (GH#2925 p4 — load-bearing).
   *
   * Invariants:
   * - Strictly forward: 'init' → 'schema' → 'controllers' → 'painted'.
   * - No skips, no regression. Backward/skipped transitions throw.
   * - `transitionPhase('schema')` warns (but does not throw) if `setContainer()`
   *   has not yet been called. In the React lifecycle, `setContainer` runs from
   *   a passive useEffect AFTER microtasks drain — `initializeStores`'s four
   *   awaits often complete first, so `transitionPhase('schema')` legitimately
   *   precedes the container being set. The renderer-creation reaction
   *   (`setupRendererReaction`) handles the cross-timing via `hasContainer`.
   */
  @action
  transitionPhase(next: InitPhase): void {
    if (next === 'schema' && this.container === null) {
      logger.warn('transitionPhase("schema") — container not yet set; renderer reaction will wait', {
        tableId: this.tableId,
      })
    }
    const currentIdx = PHASE_ORDER.indexOf(this.phase)
    const nextIdx = PHASE_ORDER.indexOf(next)
    if (nextIdx !== currentIdx + 1) {
      throw new Error(
        `InitStore.transitionPhase: invalid transition '${this.phase}' → '${next}'. ` +
          `Phases must progress forward through ${PHASE_ORDER.join(' → ')}.`,
      )
    }
    this.phase = next
    logger.info('InitStore phase advanced', {
      tableId: this.tableId,
      phase: next,
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
  get hasErrors(): boolean {
    return this.errors.length > 0
  }

  @computed
  get criticalErrors(): HydrationError[] {
    return this.errors.filter((error) => !error.canRetry)
  }

  // ====================================
  // PUBLIC API
  // ====================================

  /**
   * Mark a subsystem as failed.
   *
   * `dependency` is a free-form identifier (e.g. 'rendererInitialized'); the
   * 10-flag HydrationState was removed in GH#2925 p4.
   */
  @action
  markError(dependency: string, error: string, canRetry: boolean = true): void {
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
      }

      // Step 2: Initialize TableCoreStore (loads schema)
      if (this.tableCoreStore) {
        await this.tableCoreStore.init()
      }

      // Step 3: Initialize VisualStateStore
      if (this.visualStateStore) {
        await this.visualStateStore.init()
      }

      // Step 4: Initialize InteractionStore
      if (this.interactionStore) {
        await this.interactionStore.init()
      }

      // GH#2925 p4: advance phase machine — schema + stores ready.
      // Asserts `setContainer()` has been called.
      this.transitionPhase('schema')

      // Step 4.5: Preload slots for the loaded columns
      if (this.tableCoreStore && this.visualStateStore) {
        const columns = this.visualStateStore.columns
        if (columns.length > 0) {
          // organizationId MUST match what BodyRenderer passes to resolve(),
          // otherwise every cell hits the cache-miss-after-preload warning path
          // (cache key includes organizationId — see SlotRegistry.getCacheKey).
          const slotContext = {
            entityType: this.entityType,
            viewMode: 'table' as const,
            organizationId: this.visualStateStore.orgId,
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
      phase: this.phase,
      entityDataKnownComplete: this.entityDataKnownComplete,
      errors: this.errors,
      metrics: this.metrics,
    }
  }

  /**
   * Wait for full hydration (Promise-based)
   */
  async waitForHydration(timeoutMs: number = 30000): Promise<boolean> {
    return new Promise((resolve, reject) => {
      // If already painted, resolve immediately
      if (this.phase === 'painted') {
        resolve(true)
        return
      }

      // Set up overall timeout
      const overallTimeout = setTimeout(() => {
        reject(new Error(`VibeGrid hydration timeout after ${timeoutMs}ms`))
      }, timeoutMs)

      // Poll for completion (MobX doesn't have direct "when" like Legend State)
      const checkInterval = setInterval(() => {
        if (this.phase === 'painted') {
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

    // GH#2925 p4: arm the 15s hydration-stall watchdog. The generation id
    // makes the timer self-invalidate if reset()/init() runs again before
    // it fires (e.g. fast unmount/remount during navigation).
    const capturedGen = this.generationId
    setTimeout(() => {
      if (this.generationId !== capturedGen) return
      if (this.phase === 'painted') return
      this.recordHydrationStall()
    }, 15_000)

    // Initialize all stores
    await this.initializeStores()

    logger.info('✅ InitStore initialized', {
      tableId: this.tableId,
    })
  }

  dispose(): void {
    // Invalidate any pending hydration-stall timer
    this.generationId += 1

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
    // GH#2925 p4: bump generation id BEFORE doing anything so any pending
    // 15s hydration-stall timer from the previous init() no-ops.
    this.generationId += 1

    // Destroy renderer and ResizeObserver
    this.destroyRenderer()

    // Reset all stores
    this.resetStores()

    // Reset metrics and errors
    this.resetHydrationState()

    logger.info('🔄 InitStore reset', {
      tableId: this.tableId,
    })
  }

  // ====================================
  // PRIVATE METHODS
  // ====================================

  /**
   * GH#2925 p4 — re-armed 15s hydration-stall watchdog.
   *
   * Fires if `phase !== 'painted'` 15 seconds after init() and no reset()
   * has happened in the interim. Logs an error including the current phase
   * and entityDataKnownComplete; does NOT fail the user-visible flow — the
   * 200ms scheduleAfterPaint fallback in renderer init is the actual stall
   * escape, this is purely diagnostic.
   */
  @action
  private recordHydrationStall(): void {
    logger.error('VIbeGrid hydration stalled', {
      phase: this.phase,
      entityDataKnownComplete: this.entityDataKnownComplete,
      generationId: this.generationId,
      tableId: this.tableId,
      entityType: this.entityType,
    })
  }

  @action
  private resetHydrationState(): void {
    // GH#2925 p4: phase machine is the single source of truth.
    this.phase = 'init'
    this.entityDataKnownComplete = false

    // Reset metrics and errors
    this.errors = []
    this.metrics = {
      startTime: Date.now(),
    }
  }

  /**
   * Set up MobX reaction that creates the renderer when:
   * - columns are loaded (visualStateStore.columns.length > 0)
   * - container is set (this.container)
   * - rendererFactory is set
   * - renderer has not already been created (!this.renderer)
   *
   * This replaces the VibeGrid.tsx autorun that previously raced with initializeStores().
   */
  private setupRendererReaction(): void {
    const rendererReaction = reaction(
      () => ({
        columnCount: this.visualStateStore?.columns.length ?? 0,
        hasContainer: !!this.container,
        hasFactory: !!this.rendererFactory,
        alreadyInitialized: !!this.renderer,
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
        // GH#2804 B5: when serverTotalRows is set (substrate cursor-bounded
        // path), the server is authoritative for total row count. Skipping
        // the recomputation prevents totalContentHeight from being driven by
        // the windowed processedRows.length (e.g. 200) instead of the full
        // server count (e.g. 100_000).
        if (viewportStore.serverTotalRows !== null) {
          logger.debug('Skipping content size update — serverTotalRows set', {
            tableId: this.tableId,
            rowCount,
            serverTotalRows: viewportStore.serverTotalRows,
          })
          return
        }

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

    // GH#2804 B5 round-5 fix: companion reaction for the substrate cursor-bounded
    // path. The reaction above bails out when serverTotalRows is non-null because
    // processedRows.length is the WINDOWED count (e.g. 127 real rows out of 1000
    // server count — the sparse placeholders are filtered out by processedRows'
    // filter/sort pipeline, even though TableCoreStore.rawRows is sparse-padded
    // to the full count by setSparseRows). Without this reaction the body
    // container's `style.height = totalHeight` ends up at 0 (or the rowCount * RH
    // of the windowed result), so the inner scroll canvas only grows to that
    // small height — the page can't scroll past the loaded window and the
    // viewport→cursor patch reaction never sees a visibleRowRange.start > 0.
    // Drive totalContentHeight directly from `viewportStore.totalRows` (which
    // already returns serverTotalRows when set, falling back to derivation).
    const serverTotalRowsReaction = reaction(
      () => viewportStore.totalRows,
      (totalRows) => {
        if (viewportStore.serverTotalRows === null) return
        const totalHeight = totalRows * GRID_DIMENSIONS.ROW_HEIGHT
        viewportStore.updateContentSize(viewportStore.totalContentWidth, totalHeight)
        logger.debug('Updated ViewportStore content size from serverTotalRows', {
          tableId: this.tableId,
          totalRows,
          totalHeight,
        })
      },
      { fireImmediately: true },
    )

    this.disposers.add(serverTotalRowsReaction)
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
    }
  }
}

/**
 * Factory function to create InitStore
 */
export function createInitStore(tableId: string, entityType: string): InitStore {
  return new InitStore(tableId, entityType)
}
