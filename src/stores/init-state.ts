/**
 * VibeGrid Init State Manager
 *
 * Centralized state management for tracking all VibeGrid initialization dependencies.
 * Prevents race conditions and ensures proper loading order.
 */

// TODO: Remove Legend State - migrating to MobX
// import { observable, computed, when } from '@legendapp/state';
import { createLogger } from '@/lib/logging';

const fileLog = createLogger('components/custom/vibegrid/stores/init-state');

// ====================================
// HYDRATION STATE TYPES
// ====================================

export interface VibeGridHydrationState {
  // Schema must be loaded first - fundamental dependency
  schemaLoaded: boolean;  // Schema and column generation completed

  // Core data dependencies
  entityDataLoaded: boolean;
  entityObservableReady: boolean;

  // State system dependencies
  dataStateReady: boolean;
  visualStateReady: boolean;
  interactionStateReady: boolean;

  // Persistence dependencies
  dataPersistenceLoaded: boolean;
  visualPersistenceLoaded: boolean;

  // DOM and UI dependencies
  containerReady: boolean;
  viewportReady: boolean;
  cssStylesLoaded: boolean;

  // Renderer dependencies
  rendererInitialized: boolean;
  overlaySystemReady: boolean;
  positionTrackingReady: boolean;

  // Event system dependencies
  eventHandlersReady: boolean;
  mouseControllerReady: boolean;
  scrollControllerReady: boolean;

  // NEW: Field type system dependencies
  fieldTypeSystemReady: boolean;
}

export interface HydrationError {
  dependency: keyof VibeGridHydrationState;
  error: string;
  timestamp: number;
  canRetry: boolean;
}

export interface HydrationMetrics {
  startTime: number;
  endTime?: number;
  totalDuration?: number;
  dependencyTimings: Record<keyof VibeGridHydrationState, number>;
}

// ====================================
// HYDRATION MANAGER CLASS
// ====================================

export class VibeGridHydrationManager {
  private tableId: string;
  private entityType: string;

  // Core observables
  public hydrationState$ = observable<VibeGridHydrationState>({
    // Schema must be loaded first - fundamental dependency
    schemaLoaded: false,

    // Core data dependencies
    entityDataLoaded: false,
    entityObservableReady: false,

    // State system dependencies
    dataStateReady: false,
    visualStateReady: false,
    interactionStateReady: false,

    // Persistence dependencies
    dataPersistenceLoaded: false,
    visualPersistenceLoaded: false,

    // DOM and UI dependencies
    containerReady: false,
    viewportReady: false,
    cssStylesLoaded: false,

    // Renderer dependencies
    rendererInitialized: false,
    overlaySystemReady: false,
    positionTrackingReady: false,

    // Event system dependencies
    eventHandlersReady: false,
    mouseControllerReady: false,
    scrollControllerReady: false,

    // NEW: Field type system dependencies
    fieldTypeSystemReady: false,
  });

  public errors$ = observable<HydrationError[]>([]);
  public metrics$ = observable<HydrationMetrics>({
    startTime: Date.now(),
    dependencyTimings: {} as Record<keyof VibeGridHydrationState, number>,
  });

  // Computed states
  public isFullyHydrated$ = computed(() => {
    const state = this.hydrationState$.get();
    const allDependenciesReady = Object.values(state).every(ready => ready === true);

    if (allDependenciesReady && !this.metrics$.endTime.get()) {
      this.metrics$.endTime.set(Date.now());
      this.metrics$.totalDuration.set(
        this.metrics$.endTime.get()! - this.metrics$.startTime.get()
      );
      fileLog.info('🎉 VibeGrid fully hydrated', {
        tableId: this.tableId,
        entityType: this.entityType,
        duration: this.metrics$.totalDuration.get(),
        dependencyTimings: this.metrics$.dependencyTimings.get(),
      });
    }

    return allDependenciesReady;
  });

  public hasErrors$ = computed(() => this.errors$.get().length > 0);

  public criticalErrors$ = computed(() =>
    this.errors$.get().filter(error => !error.canRetry)
  );

  public hydrationProgress$ = computed(() => {
    const state = this.hydrationState$.get();
    const dependencies = Object.values(state);
    const completed = dependencies.filter(ready => ready === true).length;
    const total = dependencies.length;
    return Math.round((completed / total) * 100);
  });

  // Timeout management
  private timeouts = new Map<keyof VibeGridHydrationState, NodeJS.Timeout>();
  private readonly DEPENDENCY_TIMEOUT = 15000; // 15 seconds per dependency

  constructor(tableId: string, entityType: string) {
    this.tableId = tableId;
    this.entityType = entityType;

    fileLog.info('🚀 Hydration manager created', {
      tableId,
      entityType,
      totalDependencies: Object.keys(this.hydrationState$.get()).length,
    });

    // Initialize field type system using dynamic import to avoid circular dependencies
    this.initializeFieldTypeSystem().catch(error => {
      fileLog.error('❌ [FIELD-SYSTEM] Dynamic initialization failed', { error: error.message });
      this.markError('fieldTypeSystemReady', `Field type system failed: ${error.message}`, false);
    });

    this.setupTimeouts();
    this.logProgress();
  }

  // ====================================
  // PUBLIC API
  // ====================================

  /**
   * Mark a dependency as ready
   */
  public markReady(dependency: keyof VibeGridHydrationState): void {
    if (this.hydrationState$[dependency].get()) {
      fileLog.warn('🔄 Dependency already marked ready', { dependency, tableId: this.tableId });
      return;
    }

    const timing = Date.now() - this.metrics$.startTime.get();
    this.metrics$.dependencyTimings[dependency].set(timing);
    this.hydrationState$[dependency].set(true);

    // Clear timeout for this dependency
    const timeout = this.timeouts.get(dependency);
    if (timeout) {
      clearTimeout(timeout);
      this.timeouts.delete(dependency);
    }

    fileLog.info('✅ Dependency ready', {
      dependency,
      timing: `${timing}ms`,
      tableId: this.tableId,
      progress: this.hydrationProgress$.get(),
    });
  }

  /**
   * Mark a dependency as failed
   */
  public markError(
    dependency: keyof VibeGridHydrationState,
    error: string,
    canRetry: boolean = true
  ): void {
    const hydrationError: HydrationError = {
      dependency,
      error,
      timestamp: Date.now(),
      canRetry,
    };

    this.errors$.push(hydrationError);

    fileLog.error('❌ Dependency failed', {
      dependency,
      error,
      canRetry,
      tableId: this.tableId,
    });
  }

  /**
   * Retry a failed dependency
   */
  public retry(dependency: keyof VibeGridHydrationState): void {
    // Remove error for this dependency
    const currentErrors = this.errors$.get();
    const filteredErrors = currentErrors.filter(err => err.dependency !== dependency);
    this.errors$.set(filteredErrors);

    // Reset the dependency state
    this.hydrationState$[dependency].set(false);

    // Restart timeout
    this.setupTimeoutForDependency(dependency);

    fileLog.info('🔄 Retrying dependency', { dependency, tableId: this.tableId });
  }

  /**
   * Reset all hydration state (for retry)
   */
  public reset(): void {
    // Clear all timeouts
    this.timeouts.forEach(timeout => clearTimeout(timeout));
    this.timeouts.clear();

    // Reset state
    Object.keys(this.hydrationState$.get()).forEach(key => {
      this.hydrationState$[key as keyof VibeGridHydrationState].set(false);
    });

    // Reset metrics and errors
    this.errors$.set([]);
    this.metrics$.set({
      startTime: Date.now(),
      endTime: undefined,
      totalDuration: undefined,
      dependencyTimings: {} as Record<keyof VibeGridHydrationState, number>,
    });

    // Restart timeouts
    this.setupTimeouts();

    fileLog.info('🔄 Hydration state reset', { tableId: this.tableId });
  }

  /**
   * Get current status for debugging
   */
  public getStatus() {
    return {
      tableId: this.tableId,
      entityType: this.entityType,
      isFullyHydrated: this.isFullyHydrated$.get(),
      progress: this.hydrationProgress$.get(),
      state: this.hydrationState$.get(),
      errors: this.errors$.get(),
      metrics: this.metrics$.get(),
      pendingTimeouts: Array.from(this.timeouts.keys()),
    };
  }

  /**
   * Wait for full hydration (returns Promise)
   */
  public async waitForHydration(timeoutMs: number = 30000): Promise<boolean> {
    return new Promise((resolve, reject) => {
      // If already hydrated, resolve immediately
      if (this.isFullyHydrated$.get()) {
        resolve(true);
        return;
      }

      // Set up overall timeout
      const overallTimeout = setTimeout(() => {
        reject(new Error(`VibeGrid hydration timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      // Watch for completion
      const unsubscribe = when(this.isFullyHydrated$, () => {
        clearTimeout(overallTimeout);
        unsubscribe();
        resolve(true);
      });

      // Watch for critical errors
      const errorUnsubscribe = when(() => this.criticalErrors$.get().length > 0, () => {
        clearTimeout(overallTimeout);
        unsubscribe();
        errorUnsubscribe();
        reject(new Error(`Critical hydration errors: ${this.criticalErrors$.get().map(e => e.error).join(', ')}`));
      });
    });
  }

  /**
   * Initialize field type system (NEW)
   */
  /**
   * Initialize field type system (FIXED)
   */
  public async initializeFieldTypeSystem(): Promise<void> {
    try {
      fileLog.info('🔧 [FIELD-SYSTEM] Initializing field type system via hydration manager', {
        tableId: this.tableId
      });

      // Use proper ES6 import to ensure all field types are registered
      const fieldTypesModule = await import('../field-types');
      const { fieldTypeRegistry, initializeFieldTypeSystem, modularCellBridge } = fieldTypesModule;

      // Validate that fieldTypeRegistry exists
      if (!fieldTypeRegistry) {
        throw new Error('fieldTypeRegistry not available after import');
      }

      // Call initialization with detailed error handling
      try {
        initializeFieldTypeSystem(); // This calls the function that accesses the registry

        const stats = fieldTypeRegistry.getRegisteredTypes();

        fileLog.info('🎯 [FIELD-SYSTEM] Field type system initialized via hydration', {
          totalFieldTypes: stats.length,
          basicTypes: fieldTypeRegistry.getTypesByCategory('basic'),
          relationshipTypes: fieldTypeRegistry.getTypesByCategory('relationship'),
          rollupTypes: fieldTypeRegistry.getTypesByCategory('rollup'),
          computedTypes: fieldTypeRegistry.getTypesByCategory('computed'),
          tableId: this.tableId
        });

        // Make field system available globally for browser inspection
        if (typeof window !== 'undefined') {
          window.vibegridFieldRegistry = fieldTypeRegistry;
          window.vibegridCellBridge = modularCellBridge;
          fileLog.info('🌐 [FIELD-SYSTEM] Field system exposed globally for debugging');
        }

        this.markReady('fieldTypeSystemReady');
        fileLog.info('✅ [FIELD-SYSTEM] Field type system ready', { tableId: this.tableId });

      } catch (initError) {
        fileLog.error('❌ [FIELD-SYSTEM] Initialization function failed - FAIL FAST', {
          error: initError.message,
          stack: initError.stack,
          tableId: this.tableId
        });
        throw initError;
      }

    } catch (error) {
      fileLog.error('❌ [FIELD-SYSTEM] Complete failure - FAIL FAST', {
        error: error.message,
        stack: error.stack,
        tableId: this.tableId
      });
      this.markError('fieldTypeSystemReady', `Field type system failed: ${error.message}`, false); // Not retryable
      throw error; // FAIL FAST
    }
  }

  /**
   * Cleanup when component unmounts
   */
  public cleanup(): void {
    this.timeouts.forEach(timeout => clearTimeout(timeout));
    this.timeouts.clear();
    fileLog.info('🧹 Hydration manager cleaned up', { tableId: this.tableId });
  }

  // ====================================
  // PRIVATE METHODS
  // ====================================

  private setupTimeouts(): void {
    Object.keys(this.hydrationState$.get()).forEach(dependency => {
      this.setupTimeoutForDependency(dependency as keyof VibeGridHydrationState);
    });
  }

  private setupTimeoutForDependency(dependency: keyof VibeGridHydrationState): void {
    const timeout = setTimeout(() => {
      if (!this.hydrationState$[dependency].get()) {
        this.markError(
          dependency,
          `Dependency '${dependency}' timed out after ${this.DEPENDENCY_TIMEOUT}ms`,
          true
        );
      }
    }, this.DEPENDENCY_TIMEOUT);

    this.timeouts.set(dependency, timeout);
  }

  private logProgress(): void {
    // Log progress every time progress changes
    this.hydrationProgress$.onChange((progress) => {
      if (progress % 10 === 0 || progress === 100) { // Log every 10% or at completion
        fileLog.info('📊 Hydration progress', {
          progress: `${progress}%`,
          tableId: this.tableId,
          readyDependencies: Object.entries(this.hydrationState$.get())
            .filter(([_, ready]) => ready)
            .map(([dependency]) => dependency),
        });
      }
    });
  }
}

// ====================================
// FACTORY FUNCTION
// ====================================

/**
 * Create a new hydration manager instance
 */
export function createHydrationManager(
  tableId: string,
  entityType: string
): VibeGridHydrationManager {
  return new VibeGridHydrationManager(tableId, entityType);
}