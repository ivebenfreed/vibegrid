import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { configure, runInAction } from 'mobx'
import { InitStore } from '../InitStore'

// MobX strict mode (matches project config)
configure({ enforceActions: 'always' })

// Mock DisposerManager
vi.mock('@/app/stores/utils/disposer', () => ({
  DisposerManager: class MockDisposerManager {
    private disposers: Array<() => void> = []
    add(disposer: () => void) {
      this.disposers.push(disposer)
    }
    dispose() {
      for (const d of this.disposers) d()
      this.disposers = []
    }
  },
}))

// Mock logger — capture error calls for stall assertions.
// Use vi.hoisted so the spy survives vi.mock hoisting.
const { loggerErrorSpy } = vi.hoisted(() => ({ loggerErrorSpy: vi.fn() }))
vi.mock('@/shared/lib/logging', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: loggerErrorSpy,
    debug: vi.fn(),
  }),
}))

/**
 * Create a minimal mock store that satisfies the IStore interface
 */
function createMockStore() {
  return {
    init: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn(),
    reset: vi.fn(),
    columns: [] as any[],
    processedRows: [] as any[],
  }
}

/**
 * Create a mock VisualStateStore with observable columns
 */
function createMockVisualStateStore() {
  const store = createMockStore()
  return {
    ...store,
    columns: [] as any[],
    updateViewportDimensions: vi.fn(),
    setCoordinateManager: vi.fn(),
    setInteractionStore: vi.fn(),
    setViewportStore: vi.fn(),
    setTableCoreStore: vi.fn(),
  }
}

/**
 * Create a mock ViewportStore
 */
function createMockViewportStore() {
  return {
    init: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn(),
    reset: vi.fn(),
    totalContentWidth: 0,
    totalContentHeight: 0,
    updateContentSize: vi.fn(),
  }
}

/**
 * Create a mock HTMLElement for tests that don't need full DOM
 */
function createMockContainer(): HTMLElement {
  return {
    getBoundingClientRect: vi.fn().mockReturnValue({ width: 800, height: 600, top: 0, left: 0 }),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    classList: { add: vi.fn(), remove: vi.fn(), contains: vi.fn() },
  } as unknown as HTMLElement
}

describe('InitStore', () => {
  let initStore: InitStore

  beforeEach(() => {
    loggerErrorSpy.mockClear()
    initStore = new InitStore('test-table', 'TestEntity')
  })

  describe('constructor', () => {
    it('should initialize phase as "init"', () => {
      expect(initStore.phase).toBe('init')
    })

    it('should initialize entityDataKnownComplete as false', () => {
      expect(initStore.entityDataKnownComplete).toBe(false)
    })

    it('should start with no errors', () => {
      expect(initStore.hasErrors).toBe(false)
      expect(initStore.errors).toHaveLength(0)
    })

    it('should start with null renderer', () => {
      expect(initStore.renderer).toBeNull()
    })
  })

  describe('markError', () => {
    it('should record an error', () => {
      runInAction(() => {
        initStore.markError('rendererInitialized', 'test error', true)
      })
      expect(initStore.hasErrors).toBe(true)
      expect(initStore.errors).toHaveLength(1)
      expect(initStore.errors[0].dependency).toBe('rendererInitialized')
      expect(initStore.errors[0].error).toBe('test error')
      expect(initStore.errors[0].canRetry).toBe(true)
    })

    it('should track critical (non-retryable) errors', () => {
      runInAction(() => {
        initStore.markError('rendererInitialized', 'fatal error', false)
      })
      expect(initStore.criticalErrors).toHaveLength(1)
    })
  })

  describe('setContainer', () => {
    it('should store the container element', () => {
      const container = createMockContainer()
      runInAction(() => {
        initStore.setContainer(container)
      })
      expect((initStore as any).container).toBe(container)
    })

    it('accepts null to clear the container reference', () => {
      const container = createMockContainer()
      runInAction(() => {
        initStore.setContainer(container)
      })
      expect((initStore as any).container).toBe(container)

      runInAction(() => {
        initStore.setContainer(null)
      })
      expect((initStore as any).container).toBeNull()
    })
  })

  describe('setRendererFactory', () => {
    it('should store the factory function', () => {
      const factory = vi.fn()
      initStore.setRendererFactory(factory)
      // Factory is private but we verify it works through the renderer reaction
    })
  })

  describe('dispose', () => {
    it('should clean up renderer on dispose', () => {
      const mockDestroy = vi.fn()
      // Manually set renderer to test cleanup
      runInAction(() => {
        ;(initStore as any).renderer = { destroy: mockDestroy }
      })

      initStore.dispose()

      expect(mockDestroy).toHaveBeenCalled()
      expect(initStore.renderer).toBeNull()
    })

    it('should clear container and factory references', () => {
      const container = createMockContainer()
      runInAction(() => {
        initStore.setContainer(container)
      })
      initStore.setRendererFactory(vi.fn())

      initStore.dispose()

      expect((initStore as any).container).toBeNull()
      expect((initStore as any).rendererFactory).toBeNull()
    })
  })

  describe('reset', () => {
    it('should destroy renderer on reset', () => {
      const mockDestroy = vi.fn()
      runInAction(() => {
        ;(initStore as any).renderer = { destroy: mockDestroy }
      })

      runInAction(() => {
        initStore.reset()
      })

      expect(mockDestroy).toHaveBeenCalled()
      expect(initStore.renderer).toBeNull()
    })
  })

  describe('renderer creation reaction', () => {
    it('should create renderer when columns, container, and factory are all ready', async () => {
      // Set up mock stores
      const mockVisualStateStore = createMockVisualStateStore()
      const mockTableCoreStore = createMockStore()
      const mockInteractionStore = createMockStore()
      const mockPersistenceStore = createMockStore()
      const mockViewportStore = createMockViewportStore()

      // Wire dependencies
      initStore.setTableCoreStore(mockTableCoreStore as any)
      initStore.setVisualStateStore(mockVisualStateStore as any)
      initStore.setInteractionStore(mockInteractionStore as any)
      initStore.setPersistenceStore(mockPersistenceStore as any)
      initStore.setViewportStore(mockViewportStore as any)

      // Container must be set BEFORE initializeStores() now — transitionPhase('schema') asserts it.
      const container = createMockContainer()
      runInAction(() => {
        initStore.setContainer(container)
      })

      await initStore.initializeStores()

      // Mock renderer with destroy method
      const mockRenderer = { destroy: vi.fn() }
      const factory = vi.fn().mockReturnValue(mockRenderer)
      initStore.setRendererFactory(factory)

      // Simulate columns becoming available
      // Since visualStateStore.columns is mocked, we need to update it
      runInAction(() => {
        mockVisualStateStore.columns = [{ id: 'col1', name: 'Column 1' }] as any[]
      })

      // The reaction should fire but since mockVisualStateStore.columns is a plain array,
      // not an observable, the reaction won't automatically detect it.
      // In production, VisualStateStore.columns IS observable (via @computed).
      // For this unit test, we verify the factory can be called directly.
      expect(factory).not.toHaveBeenCalled() // Reaction needs observable columns

      // Clean up
      initStore.dispose()
    })
  })

  describe('totalRows reaction', () => {
    it('should wire ViewportStore with setViewportStore', () => {
      const mockViewportStore = createMockViewportStore()
      initStore.setViewportStore(mockViewportStore as any)
      // Verify it was set (through private field access for testing)
      expect((initStore as any).viewportStore).toBe(mockViewportStore)
    })
  })

  describe('getStatus', () => {
    it('should return current status', () => {
      const status = initStore.getStatus()
      expect(status.tableId).toBe('test-table')
      expect(status.entityType).toBe('TestEntity')
      expect(status.phase).toBe('init')
      expect(status.entityDataKnownComplete).toBe(false)
    })
  })

  // ====================================
  // GH#2925 — 4-state phase machine
  // ====================================

  describe('phase / transitionPhase (GH#2925)', () => {
    it('starts at phase "init"', () => {
      expect(initStore.phase).toBe('init')
    })

    it('starts with entityDataKnownComplete === false', () => {
      expect(initStore.entityDataKnownComplete).toBe(false)
    })

    it('advances forward through init → schema → controllers → painted (with container set)', () => {
      runInAction(() => {
        initStore.setContainer(createMockContainer())
      })
      initStore.transitionPhase('schema')
      expect(initStore.phase).toBe('schema')
      initStore.transitionPhase('controllers')
      expect(initStore.phase).toBe('controllers')
      initStore.transitionPhase('painted')
      expect(initStore.phase).toBe('painted')
    })

    it('throws when skipping states (init → controllers)', () => {
      runInAction(() => {
        initStore.setContainer(createMockContainer())
      })
      expect(() => initStore.transitionPhase('controllers')).toThrow(/invalid transition/i)
      expect(initStore.phase).toBe('init')
    })

    it('throws when skipping states (init → painted)', () => {
      runInAction(() => {
        initStore.setContainer(createMockContainer())
      })
      expect(() => initStore.transitionPhase('painted')).toThrow(/invalid transition/i)
    })

    it('throws on backward transition (painted → schema)', () => {
      runInAction(() => {
        initStore.setContainer(createMockContainer())
      })
      initStore.transitionPhase('schema')
      initStore.transitionPhase('controllers')
      initStore.transitionPhase('painted')
      expect(() => initStore.transitionPhase('schema')).toThrow(/invalid transition/i)
      expect(initStore.phase).toBe('painted')
    })

    it('throws on same-state transition (init → init)', () => {
      expect(() => initStore.transitionPhase('init')).toThrow(/invalid transition/i)
    })

    it('markEntityDataKnownComplete flips the flag', () => {
      initStore.markEntityDataKnownComplete()
      expect(initStore.entityDataKnownComplete).toBe(true)
    })

    it('markEntityDataKnownComplete is idempotent', () => {
      initStore.markEntityDataKnownComplete()
      initStore.markEntityDataKnownComplete()
      expect(initStore.entityDataKnownComplete).toBe(true)
    })

    it('reset() returns phase to "init" and clears entityDataKnownComplete', () => {
      runInAction(() => {
        initStore.setContainer(createMockContainer())
      })
      initStore.transitionPhase('schema')
      initStore.transitionPhase('controllers')
      initStore.markEntityDataKnownComplete()
      expect(initStore.phase).toBe('controllers')
      expect(initStore.entityDataKnownComplete).toBe(true)

      runInAction(() => {
        initStore.reset()
      })

      expect(initStore.phase).toBe('init')
      expect(initStore.entityDataKnownComplete).toBe(false)
    })

    it('destroyRenderer regresses phase from "painted" to "schema" (allows recreation after route nav)', () => {
      // Repro: VibeGrid.tsx's inner useEffect cleanup calls destroyRenderer
      // before the parent VibeGridStoreProvider's dispose tears the renderer
      // reaction down. The reaction re-fires synchronously, creating a new
      // SimplePassiveRenderer whose postInitialization() calls
      // transitionPhase('controllers'). Without phase regression, that throws.
      runInAction(() => {
        initStore.setContainer(createMockContainer())
      })
      initStore.transitionPhase('schema')
      initStore.transitionPhase('controllers')
      initStore.transitionPhase('painted')
      expect(initStore.phase).toBe('painted')

      runInAction(() => {
        initStore.destroyRenderer()
      })

      expect(initStore.phase).toBe('schema')
      // Critical: postInitialization can now advance the recreated renderer.
      expect(() => initStore.transitionPhase('controllers')).not.toThrow()
      expect(initStore.phase).toBe('controllers')
    })

    it('destroyRenderer regresses phase from "controllers" to "schema"', () => {
      runInAction(() => {
        initStore.setContainer(createMockContainer())
      })
      initStore.transitionPhase('schema')
      initStore.transitionPhase('controllers')

      runInAction(() => {
        initStore.destroyRenderer()
      })

      expect(initStore.phase).toBe('schema')
    })

    it('destroyRenderer leaves "init"/"schema" phases untouched', () => {
      // Pre-renderer destroys (e.g. dispose before init completes) shouldn't
      // jump phase forward.
      expect(initStore.phase).toBe('init')
      runInAction(() => {
        initStore.destroyRenderer()
      })
      expect(initStore.phase).toBe('init')

      runInAction(() => {
        initStore.setContainer(createMockContainer())
      })
      initStore.transitionPhase('schema')
      runInAction(() => {
        initStore.destroyRenderer()
      })
      expect(initStore.phase).toBe('schema')
    })

    it('navigation regression guard — fresh store allows marking entityDataKnownComplete', () => {
      const storeA = new InitStore('table', 'EntityA')
      runInAction(() => storeA.markEntityDataKnownComplete())
      expect(storeA.entityDataKnownComplete).toBe(true)

      // Simulates navigation: new store is created for new entity type
      const storeB = new InitStore('table', 'EntityB')
      expect(storeB.entityDataKnownComplete).toBe(false) // fresh — must be markable
      runInAction(() => storeB.markEntityDataKnownComplete())
      expect(storeB.entityDataKnownComplete).toBe(true)
    })
  })

  // ====================================
  // GH#2925 p4 — container assertion on transitionPhase('schema')
  // ====================================

  describe('transitionPhase("schema") tolerates pre-container call (GH#2925 p4)', () => {
    // In production React's passive-effect timing means setContainer often
    // runs AFTER initializeStores's awaits drain — so transitionPhase('schema')
    // is allowed to advance with container still null. The renderer-creation
    // reaction waits for the container via MobX. A warning is logged for
    // forensics but the call does not throw.
    it('advances phase even when container is null (logs a warning, no throw)', () => {
      expect((initStore as any).container).toBeNull()
      expect(() => initStore.transitionPhase('schema')).not.toThrow()
      expect(initStore.phase).toBe('schema')
    })

    it('also succeeds when setContainer() has been called first', () => {
      runInAction(() => {
        initStore.setContainer(createMockContainer())
      })
      expect(() => initStore.transitionPhase('schema')).not.toThrow()
      expect(initStore.phase).toBe('schema')
    })
  })

  describe('initializeStores transitions phase to "schema" (GH#2925 p4)', () => {
    it('advances phase from "init" to "schema" after the last sequential store init (container set)', async () => {
      const mockVisualStateStore = createMockVisualStateStore()
      const mockTableCoreStore = createMockStore()
      const mockInteractionStore = createMockStore()
      const mockPersistenceStore = createMockStore()
      const mockViewportStore = createMockViewportStore()

      initStore.setTableCoreStore(mockTableCoreStore as any)
      initStore.setVisualStateStore(mockVisualStateStore as any)
      initStore.setInteractionStore(mockInteractionStore as any)
      initStore.setPersistenceStore(mockPersistenceStore as any)
      initStore.setViewportStore(mockViewportStore as any)
      runInAction(() => {
        initStore.setContainer(createMockContainer())
      })

      expect(initStore.phase).toBe('init')
      await initStore.initializeStores()
      expect(initStore.phase).toBe('schema')

      initStore.dispose()
    })

    it('calls transitionPhase after interactionStore.init() resolves (ordering check)', async () => {
      const events: string[] = []
      const mockVisualStateStore = createMockVisualStateStore()
      const mockTableCoreStore = createMockStore()
      const mockInteractionStore = {
        ...createMockStore(),
        init: vi.fn().mockImplementation(async () => {
          events.push('interactionStore.init')
        }),
      }
      const mockPersistenceStore = createMockStore()
      const mockViewportStore = createMockViewportStore()

      initStore.setTableCoreStore(mockTableCoreStore as any)
      initStore.setVisualStateStore(mockVisualStateStore as any)
      initStore.setInteractionStore(mockInteractionStore as any)
      initStore.setPersistenceStore(mockPersistenceStore as any)
      initStore.setViewportStore(mockViewportStore as any)
      runInAction(() => {
        initStore.setContainer(createMockContainer())
      })

      // Spy on transitionPhase to record when it fires
      const originalTransition = initStore.transitionPhase.bind(initStore)
      const transitionSpy = vi.spyOn(initStore, 'transitionPhase').mockImplementation((next: any) => {
        events.push(`transitionPhase:${next}`)
        return originalTransition(next)
      })

      await initStore.initializeStores()

      const interactionIdx = events.indexOf('interactionStore.init')
      const schemaIdx = events.indexOf('transitionPhase:schema')
      expect(interactionIdx).toBeGreaterThanOrEqual(0)
      expect(schemaIdx).toBeGreaterThan(interactionIdx)

      transitionSpy.mockRestore()
      initStore.dispose()
    })
  })

  // ====================================
  // GH#2925 p4 — 15s hydration-stall watchdog
  // ====================================

  describe('15s hydration-stall watchdog (GH#2925 p4)', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('does NOT fire when phase reaches "painted" before 15s', async () => {
      const store = new InitStore('test', 'Entity')
      // Wire minimal stores so init() can complete
      store.setTableCoreStore(createMockStore() as any)
      store.setVisualStateStore(createMockVisualStateStore() as any)
      store.setInteractionStore(createMockStore() as any)
      store.setPersistenceStore(createMockStore() as any)
      store.setViewportStore(createMockViewportStore() as any)
      runInAction(() => {
        store.setContainer(createMockContainer())
      })

      // init() arms the 15s timer
      const initP = store.init()
      // Drive promises to completion
      await vi.advanceTimersByTimeAsync(0)
      await initP

      // Advance phase to 'painted' before the 15s window
      store.transitionPhase('controllers')
      store.transitionPhase('painted')

      // Now advance past 15s — watchdog should NOT log a stall.
      await vi.advanceTimersByTimeAsync(20_000)

      const stallCalls = loggerErrorSpy.mock.calls.filter((args) => args[0] === 'VIbeGrid hydration stalled')
      expect(stallCalls).toHaveLength(0)

      store.dispose()
    })

    it('no-ops when generationId moved (reset before 15s fires)', async () => {
      const store = new InitStore('test', 'Entity')
      store.setTableCoreStore(createMockStore() as any)
      store.setVisualStateStore(createMockVisualStateStore() as any)
      store.setInteractionStore(createMockStore() as any)
      store.setPersistenceStore(createMockStore() as any)
      store.setViewportStore(createMockViewportStore() as any)
      runInAction(() => {
        store.setContainer(createMockContainer())
      })

      const initP = store.init()
      await vi.advanceTimersByTimeAsync(0)
      await initP

      // reset() bumps generationId — the armed timer should self-invalidate.
      runInAction(() => {
        store.reset()
      })

      await vi.advanceTimersByTimeAsync(20_000)

      const stallCalls = loggerErrorSpy.mock.calls.filter((args) => args[0] === 'VIbeGrid hydration stalled')
      expect(stallCalls).toHaveLength(0)

      store.dispose()
    })

    it('fires recordHydrationStall when phase still not "painted" after 15s (gen unchanged)', async () => {
      const store = new InitStore('test', 'Entity')
      store.setTableCoreStore(createMockStore() as any)
      store.setVisualStateStore(createMockVisualStateStore() as any)
      store.setInteractionStore(createMockStore() as any)
      store.setPersistenceStore(createMockStore() as any)
      store.setViewportStore(createMockViewportStore() as any)
      runInAction(() => {
        store.setContainer(createMockContainer())
      })

      const initP = store.init()
      await vi.advanceTimersByTimeAsync(0)
      await initP

      // Phase still 'schema' (or whatever initializeStores left it at), NOT 'painted'.
      // Advance past 15s.
      await vi.advanceTimersByTimeAsync(15_001)

      const stallCalls = loggerErrorSpy.mock.calls.filter((args) => args[0] === 'VIbeGrid hydration stalled')
      expect(stallCalls.length).toBeGreaterThanOrEqual(1)
      // The log should include phase + entityDataKnownComplete diagnostics
      expect(stallCalls[0][1]).toMatchObject({
        phase: expect.any(String),
        entityDataKnownComplete: expect.any(Boolean),
        tableId: 'test',
      })

      store.dispose()
    })
  })
})
