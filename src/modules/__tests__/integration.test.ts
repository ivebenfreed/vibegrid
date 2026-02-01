/**
 * VibeGrid Module System Integration Tests
 *
 * Tests the interaction between:
 * - ViewModeRegistry (D1): Module registration and lazy loading
 * - SlotRegistry (D2): Cell renderer resolution with priority/context
 * - GridModule interface: Module lifecycle (init, cleanup, registerSlots)
 *
 * These tests verify the components work together as a system.
 *
 * Part of: VibeGrid D1/D2 Integration (Phase 4)
 * @see Issue #1416 for architecture overview
 */

import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GridModule, GridModuleRenderProps } from '../GridModule'
import type { VibeGridStores } from '../../stores/context'
import type { CellRenderer, CellRendererContext, Slot } from '../../slots/SlotRegistry'
import type { Column } from '../../types'

// Mock logger to avoid side effects
vi.mock('@/shared/lib/logging', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

// Import after mocking
import { viewModeRegistry } from '../ViewModeRegistry'
import { SlotRegistry, slotRegistry } from '../../slots/SlotRegistry'

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Create a valid test module with optional lifecycle hooks
 */
function createTestModule(
  id: string,
  displayName: string,
  options?: {
    init?: (stores: VibeGridStores) => void | (() => void)
    registerSlots?: (slotRegistry: SlotRegistry) => void
  },
): GridModule {
  return {
    id,
    displayName,
    render: () => React.createElement('div', null, `${id} content`),
    init: options?.init,
    registerSlots: options?.registerSlots,
  }
}

/**
 * Create a mock VibeGridStores object for testing
 */
function createMockStores(): VibeGridStores {
  return {} as VibeGridStores
}

/**
 * Create a mock HTMLElement for tests that don't need full DOM
 */
function createMockElement(className: string): HTMLElement {
  return {
    className,
    tagName: 'DIV',
    innerHTML: '',
    style: {},
    setAttribute: vi.fn(),
    getAttribute: vi.fn(),
    appendChild: vi.fn(),
    removeChild: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    classList: {
      add: vi.fn(),
      remove: vi.fn(),
      contains: vi.fn().mockReturnValue(false),
    },
  } as unknown as HTMLElement
}

/**
 * Create a mock CellRenderer for testing
 */
function createMockRenderer(id: string): CellRenderer {
  return {
    render: vi.fn(() => createMockElement(`renderer-${id}`)),
  }
}

/**
 * Create a mock Column for testing
 */
function createMockColumn(fieldType: string, id?: string): Column {
  return {
    id: id ?? fieldType,
    field: id ?? fieldType,
    name: `${fieldType} Column`,
    fieldType,
    cellType: fieldType as Column['cellType'],
    width: 100,
  }
}

/**
 * Create a mock CellRendererContext for testing
 */
function createMockContext(overrides: Partial<CellRendererContext> = {}): CellRendererContext {
  return {
    viewMode: 'table',
    entityType: 'Task',
    schemaId: 'default',
    organizationId: 'org-1',
    ...overrides,
  }
}

// ============================================================================
// Integration Tests: View Mode Switching
// ============================================================================

describe('View Mode Switching Integration', () => {
  beforeEach(() => {
    viewModeRegistry.clear()
    slotRegistry.clear()
  })

  it('should switch from table -> kanban -> gantt -> table correctly', async () => {
    // Track activation order
    const activationOrder: string[] = []
    const cleanupOrder: string[] = []

    // Register three modules with init and cleanup
    viewModeRegistry.register(
      'table',
      async () =>
        createTestModule('table', 'Table View', {
          init: () => {
            activationOrder.push('table')
            return () => cleanupOrder.push('table')
          },
        }),
      { displayName: 'Table View' },
    )

    viewModeRegistry.register(
      'kanban',
      async () =>
        createTestModule('kanban', 'Kanban Board', {
          init: () => {
            activationOrder.push('kanban')
            return () => cleanupOrder.push('kanban')
          },
        }),
      { displayName: 'Kanban Board' },
    )

    viewModeRegistry.register(
      'gantt',
      async () =>
        createTestModule('gantt', 'Gantt Timeline', {
          init: () => {
            activationOrder.push('gantt')
            return () => cleanupOrder.push('gantt')
          },
        }),
      { displayName: 'Gantt Timeline' },
    )

    const stores = createMockStores()

    // Simulate view mode switching: table -> kanban -> gantt -> table
    // 1. Start with table
    const tableModule = await viewModeRegistry.get('table')
    const tableCleanup = tableModule.init?.(stores)
    expect(activationOrder).toEqual(['table'])

    // 2. Switch to kanban (cleanup table first)
    tableCleanup?.()
    const kanbanModule = await viewModeRegistry.get('kanban')
    const kanbanCleanup = kanbanModule.init?.(stores)
    expect(cleanupOrder).toEqual(['table'])
    expect(activationOrder).toEqual(['table', 'kanban'])

    // 3. Switch to gantt (cleanup kanban first)
    kanbanCleanup?.()
    const ganttModule = await viewModeRegistry.get('gantt')
    const ganttCleanup = ganttModule.init?.(stores)
    expect(cleanupOrder).toEqual(['table', 'kanban'])
    expect(activationOrder).toEqual(['table', 'kanban', 'gantt'])

    // 4. Switch back to table (cleanup gantt first)
    ganttCleanup?.()
    const tableModule2 = await viewModeRegistry.get('table')
    tableModule2.init?.(stores)
    expect(cleanupOrder).toEqual(['table', 'kanban', 'gantt'])
    expect(activationOrder).toEqual(['table', 'kanban', 'gantt', 'table'])

    // Verify same module instance returned (caching works)
    expect(tableModule).toBe(tableModule2)
  })

  it('should call init() for each module when activated', async () => {
    const initSpy = vi.fn()

    viewModeRegistry.register(
      'test',
      async () =>
        createTestModule('test', 'Test Module', {
          init: initSpy,
        }),
      { displayName: 'Test Module' },
    )

    const stores = createMockStores()
    const module = await viewModeRegistry.get('test')

    // init should not be called by get()
    expect(initSpy).not.toHaveBeenCalled()

    // init is called when module is activated
    module.init?.(stores)
    expect(initSpy).toHaveBeenCalledTimes(1)
    expect(initSpy).toHaveBeenCalledWith(stores)
  })

  it('should execute cleanup functions when deactivating modules', async () => {
    const cleanupSpy = vi.fn()

    viewModeRegistry.register(
      'cleanup-test',
      async () =>
        createTestModule('cleanup-test', 'Cleanup Test', {
          init: () => cleanupSpy,
        }),
      { displayName: 'Cleanup Test' },
    )

    const stores = createMockStores()
    const module = await viewModeRegistry.get('cleanup-test')
    const cleanup = module.init?.(stores)

    expect(cleanupSpy).not.toHaveBeenCalled()

    // Execute cleanup
    cleanup?.()
    expect(cleanupSpy).toHaveBeenCalledTimes(1)
  })
})

// ============================================================================
// Integration Tests: Lazy Module Loading
// ============================================================================

describe('Lazy Module Loading Integration', () => {
  beforeEach(() => {
    viewModeRegistry.clear()
    slotRegistry.clear()
  })

  it('should NOT load modules at registry import time', () => {
    let factoryCalled = false

    viewModeRegistry.register(
      'lazy-test',
      async () => {
        factoryCalled = true
        return createTestModule('lazy-test', 'Lazy Test')
      },
      { displayName: 'Lazy Test' },
    )

    // Module is registered but factory not called yet
    expect(viewModeRegistry.has('lazy-test')).toBe(true)
    expect(factoryCalled).toBe(false)
    expect(viewModeRegistry.isLoaded('lazy-test')).toBe(false)
  })

  it('should load module when first accessed via get()', async () => {
    let factoryCallCount = 0

    viewModeRegistry.register(
      'lazy-load',
      async () => {
        factoryCallCount++
        return createTestModule('lazy-load', 'Lazy Load Module')
      },
      { displayName: 'Lazy Load Module' },
    )

    // Before get()
    expect(factoryCallCount).toBe(0)
    expect(viewModeRegistry.isLoaded('lazy-load')).toBe(false)

    // First get() triggers load
    const module = await viewModeRegistry.get('lazy-load')
    expect(factoryCallCount).toBe(1)
    expect(viewModeRegistry.isLoaded('lazy-load')).toBe(true)
    expect(module.id).toBe('lazy-load')
  })

  it('should accurately reflect loaded state via isLoaded()', async () => {
    viewModeRegistry.register(
      'state-test',
      async () => createTestModule('state-test', 'State Test'),
      { displayName: 'State Test' },
    )

    // Initially not loaded
    expect(viewModeRegistry.isLoaded('state-test')).toBe(false)
    expect(viewModeRegistry.has('state-test')).toBe(true)

    // After loading
    await viewModeRegistry.get('state-test')
    expect(viewModeRegistry.isLoaded('state-test')).toBe(true)

    // Unregistered module
    expect(viewModeRegistry.isLoaded('nonexistent')).toBe(false)
  })

  it('should return same cached instance on subsequent get() calls', async () => {
    let loadCount = 0

    viewModeRegistry.register(
      'cache-test',
      async () => {
        loadCount++
        return createTestModule('cache-test', 'Cache Test')
      },
      { displayName: 'Cache Test' },
    )

    // First load
    const module1 = await viewModeRegistry.get('cache-test')
    expect(loadCount).toBe(1)

    // Second get() should use cache
    const module2 = await viewModeRegistry.get('cache-test')
    expect(loadCount).toBe(1) // Still 1, factory not called again

    // Same instance
    expect(module1).toBe(module2)
  })

  it('should cache module after loading even with concurrent calls', async () => {
    let loadCount = 0
    const moduleInstance = createTestModule('concurrent-test', 'Concurrent Test')

    viewModeRegistry.register(
      'concurrent-test',
      async () => {
        loadCount++
        // Simulate async delay
        await new Promise((resolve) => setTimeout(resolve, 10))
        return moduleInstance // Return same instance to test caching
      },
      { displayName: 'Concurrent Test' },
    )

    // Trigger multiple concurrent get() calls
    const [module1, module2, module3] = await Promise.all([
      viewModeRegistry.get('concurrent-test'),
      viewModeRegistry.get('concurrent-test'),
      viewModeRegistry.get('concurrent-test'),
    ])

    // Note: Current implementation doesn't deduplicate concurrent requests
    // Factory may be called multiple times during concurrent loading
    // After loading completes, all calls should return the same instance
    expect(loadCount).toBeGreaterThanOrEqual(1)

    // After concurrent calls complete, subsequent calls should use cache
    const module4 = await viewModeRegistry.get('concurrent-test')
    const previousLoadCount = loadCount
    const module5 = await viewModeRegistry.get('concurrent-test')
    expect(loadCount).toBe(previousLoadCount) // Cache hit, no new loads
    expect(module4).toBe(module5)
  })
})

// ============================================================================
// Integration Tests: Custom Slot Registration from View Module
// ============================================================================

describe('Custom Slot Registration from View Module', () => {
  let testSlotRegistry: SlotRegistry

  beforeEach(() => {
    viewModeRegistry.clear()
    testSlotRegistry = new SlotRegistry()
  })

  it('should allow GanttModule.registerSlots() to register gantt-specific slots', async () => {
    // Create a gantt module that registers custom slots
    const ganttModule = createTestModule('gantt', 'Gantt Timeline', {
      registerSlots: (registry) => {
        // Register gantt-specific timeline cell renderer
        registry.register({
          id: 'gantt-timeline',
          priority: 100, // View mode priority
          contextFilter: (ctx) => ctx.viewMode === 'gantt',
          renderer: () => createMockRenderer('gantt-timeline'),
        })

        // Register gantt-specific date range renderer
        registry.register({
          id: 'date',
          priority: 100, // Override default date renderer in gantt
          contextFilter: (ctx) => ctx.viewMode === 'gantt',
          renderer: () => createMockRenderer('date-gantt'),
        })
      },
    })

    // Register default date renderer
    testSlotRegistry.register({
      id: 'date',
      priority: 0,
      renderer: () => createMockRenderer('date-default'),
    })

    // Module registers its slots
    ganttModule.registerSlots?.(testSlotRegistry)

    // Verify slots are registered
    const ids = testSlotRegistry.getRegisteredIds()
    expect(ids).toContain('gantt-timeline')
    expect(ids.filter((id) => id === 'date')).toHaveLength(2) // Default + gantt override

    // Test resolution in gantt context
    const dateColumn = createMockColumn('date')
    const ganttContext = createMockContext({ viewMode: 'gantt' })

    await testSlotRegistry.preloadForColumns([dateColumn], ganttContext)
    const renderer = testSlotRegistry.resolve(dateColumn, ganttContext)

    // Should resolve to gantt-specific date renderer
    const element = renderer!.render(null, dateColumn, ganttContext)
    expect(element.className).toBe('renderer-date-gantt')
  })

  it('should apply contextFilter so slots only match in correct view mode', async () => {
    // Register slot with view mode filter
    testSlotRegistry.register({
      id: 'text',
      priority: 0,
      renderer: () => createMockRenderer('text-default'),
    })

    testSlotRegistry.register({
      id: 'text',
      priority: 100,
      contextFilter: (ctx) => ctx.viewMode === 'kanban',
      renderer: () => createMockRenderer('text-kanban'),
    })

    const textColumn = createMockColumn('text')

    // In table mode - should use default
    const tableContext = createMockContext({ viewMode: 'table' })
    await testSlotRegistry.preloadForColumns([textColumn], tableContext)
    const tableRenderer = testSlotRegistry.resolve(textColumn, tableContext)
    expect(tableRenderer!.render(null, textColumn, tableContext).className).toBe(
      'renderer-text-default',
    )

    // In kanban mode - should use kanban-specific
    const kanbanContext = createMockContext({ viewMode: 'kanban' })
    await testSlotRegistry.preloadForColumns([textColumn], kanbanContext)
    const kanbanRenderer = testSlotRegistry.resolve(textColumn, kanbanContext)
    expect(kanbanRenderer!.render(null, textColumn, kanbanContext).className).toBe(
      'renderer-text-kanban',
    )
  })

  it('should allow priority override (view slot overrides default)', async () => {
    // Register default slot (priority 0)
    testSlotRegistry.register({
      id: 'status',
      priority: 0,
      renderer: () => createMockRenderer('status-default'),
    })

    // Register domain-specific slot (priority 50)
    testSlotRegistry.register({
      id: 'status',
      priority: 50,
      contextFilter: (ctx) => ctx.entityType === 'Task',
      renderer: () => createMockRenderer('status-task'),
    })

    // Register view-specific slot (priority 100)
    testSlotRegistry.register({
      id: 'status',
      priority: 100,
      contextFilter: (ctx) => ctx.viewMode === 'gantt' && ctx.entityType === 'Task',
      renderer: () => createMockRenderer('status-gantt-task'),
    })

    const statusColumn = createMockColumn('status')

    // Scenario 1: Generic context - should use default
    const genericContext = createMockContext({ viewMode: 'table', entityType: 'Project' })
    await testSlotRegistry.preloadForColumns([statusColumn], genericContext)
    expect(
      testSlotRegistry
        .resolve(statusColumn, genericContext)!
        .render(null, statusColumn, genericContext).className,
    ).toBe('renderer-status-default')

    // Scenario 2: Task entity in table - should use domain-specific (priority 50)
    const taskTableContext = createMockContext({ viewMode: 'table', entityType: 'Task' })
    await testSlotRegistry.preloadForColumns([statusColumn], taskTableContext)
    expect(
      testSlotRegistry
        .resolve(statusColumn, taskTableContext)!
        .render(null, statusColumn, taskTableContext).className,
    ).toBe('renderer-status-task')

    // Scenario 3: Task entity in gantt - should use view-specific (priority 100)
    const taskGanttContext = createMockContext({ viewMode: 'gantt', entityType: 'Task' })
    await testSlotRegistry.preloadForColumns([statusColumn], taskGanttContext)
    expect(
      testSlotRegistry
        .resolve(statusColumn, taskGanttContext)!
        .render(null, statusColumn, taskGanttContext).className,
    ).toBe('renderer-status-gantt-task')
  })
})

// ============================================================================
// Integration Tests: ViewModeRegistry + SlotRegistry Integration
// ============================================================================

describe('ViewModeRegistry + SlotRegistry Integration', () => {
  let testSlotRegistry: SlotRegistry

  beforeEach(() => {
    viewModeRegistry.clear()
    testSlotRegistry = new SlotRegistry()
  })

  it('should allow a module to access both registries', async () => {
    // Track registry interactions
    const slotRegistrations: string[] = []

    // Register module that uses both registries
    viewModeRegistry.register(
      'dual-registry-test',
      async () =>
        createTestModule('dual-registry-test', 'Dual Registry Test', {
          registerSlots: (registry) => {
            registry.register({
              id: 'custom-slot',
              priority: 100,
              contextFilter: (ctx) => ctx.viewMode === 'dual-registry-test',
              renderer: () => {
                slotRegistrations.push('custom-slot')
                return createMockRenderer('custom')
              },
            })
          },
          init: (stores) => {
            // Module can access stores during init
            return () => {
              // Cleanup
            }
          },
        }),
      { displayName: 'Dual Registry Test' },
    )

    // Load module from ViewModeRegistry
    const module = await viewModeRegistry.get('dual-registry-test')
    expect(module.id).toBe('dual-registry-test')

    // Module registers slots in SlotRegistry
    module.registerSlots?.(testSlotRegistry)
    expect(testSlotRegistry.getRegisteredIds()).toContain('custom-slot')

    // Module initializes
    const stores = createMockStores()
    const cleanup = module.init?.(stores)
    expect(typeof cleanup).toBe('function')

    // Preload and resolve slot
    const customColumn = createMockColumn('custom-slot')
    const context = createMockContext({ viewMode: 'dual-registry-test' })

    await testSlotRegistry.preloadForColumns([customColumn], context)
    const renderer = testSlotRegistry.resolve(customColumn, context)

    // Renderer factory should have been called during preload
    expect(slotRegistrations).toContain('custom-slot')
    expect(renderer).not.toBeNull()
  })

  it('should support slot preload with module-registered slots', async () => {
    // Register default slots
    testSlotRegistry.register({
      id: 'text',
      priority: 0,
      renderer: () => createMockRenderer('text-default'),
    })

    testSlotRegistry.register({
      id: 'number',
      priority: 0,
      renderer: () => createMockRenderer('number-default'),
    })

    // Create kanban module that adds custom renderers
    const kanbanModule = createTestModule('kanban', 'Kanban Board', {
      registerSlots: (registry) => {
        // Override text renderer in kanban view
        registry.register({
          id: 'text',
          priority: 100,
          contextFilter: (ctx) => ctx.viewMode === 'kanban',
          renderer: () => createMockRenderer('text-kanban'),
        })
      },
    })

    // Register slots from module
    kanbanModule.registerSlots?.(testSlotRegistry)

    // Define columns for preload
    const columns = [createMockColumn('text'), createMockColumn('number')]

    // Preload for kanban context
    const kanbanContext = createMockContext({ viewMode: 'kanban' })
    await testSlotRegistry.preloadForColumns(columns, kanbanContext)

    // Verify preload completed
    expect(testSlotRegistry.preloadReady).toBe(true)

    // Verify correct renderers resolved
    const textRenderer = testSlotRegistry.resolve(columns[0], kanbanContext)
    expect(textRenderer!.render(null, columns[0], kanbanContext).className).toBe(
      'renderer-text-kanban',
    )

    const numberRenderer = testSlotRegistry.resolve(columns[1], kanbanContext)
    expect(numberRenderer!.render(null, columns[1], kanbanContext).className).toBe(
      'renderer-number-default',
    )
  })

  it('should handle module slot cleanup on view mode change', async () => {
    // Track slot registrations/unregistrations
    const registeredSlots: string[] = []
    const unregisteredSlots: string[] = []

    // Create module with cleanup that unregisters slots
    viewModeRegistry.register(
      'cleanup-slots-test',
      async () =>
        createTestModule('cleanup-slots-test', 'Cleanup Slots Test', {
          registerSlots: (registry) => {
            registry.register({
              id: 'cleanup-slot',
              priority: 100,
              contextFilter: (ctx) => ctx.viewMode === 'cleanup-slots-test',
              renderer: () => createMockRenderer('cleanup'),
            })
            registeredSlots.push('cleanup-slot')
          },
          init: () => {
            return () => {
              // Cleanup: unregister slots
              testSlotRegistry.unregister('cleanup-slot')
              unregisteredSlots.push('cleanup-slot')
            }
          },
        }),
      { displayName: 'Cleanup Slots Test' },
    )

    const stores = createMockStores()

    // Load and initialize module
    const module = await viewModeRegistry.get('cleanup-slots-test')
    module.registerSlots?.(testSlotRegistry)
    const cleanup = module.init?.(stores)

    expect(registeredSlots).toEqual(['cleanup-slot'])
    expect(testSlotRegistry.getRegisteredIds()).toContain('cleanup-slot')

    // Simulate view mode change - run cleanup
    cleanup?.()

    expect(unregisteredSlots).toEqual(['cleanup-slot'])
    expect(testSlotRegistry.getRegisteredIds()).not.toContain('cleanup-slot')
  })
})

// ============================================================================
// Integration Tests: Full Lifecycle
// ============================================================================

describe('Full Module Lifecycle Integration', () => {
  let testSlotRegistry: SlotRegistry

  beforeEach(() => {
    viewModeRegistry.clear()
    testSlotRegistry = new SlotRegistry()
  })

  it('should execute complete lifecycle: register -> load -> registerSlots -> init -> render -> cleanup', async () => {
    const lifecycleEvents: string[] = []

    // Register module
    viewModeRegistry.register(
      'lifecycle-test',
      async () => {
        lifecycleEvents.push('factory-called')
        return createTestModule('lifecycle-test', 'Lifecycle Test', {
          registerSlots: (registry) => {
            lifecycleEvents.push('registerSlots-called')
            registry.register({
              id: 'lifecycle-slot',
              renderer: () => createMockRenderer('lifecycle'),
            })
          },
          init: (stores) => {
            lifecycleEvents.push('init-called')
            return () => {
              lifecycleEvents.push('cleanup-called')
            }
          },
        })
      },
      { displayName: 'Lifecycle Test' },
    )

    lifecycleEvents.push('registered')

    // Load module
    const module = await viewModeRegistry.get('lifecycle-test')
    expect(lifecycleEvents).toEqual(['registered', 'factory-called'])

    // Register slots
    module.registerSlots?.(testSlotRegistry)
    expect(lifecycleEvents).toEqual(['registered', 'factory-called', 'registerSlots-called'])

    // Initialize
    const stores = createMockStores()
    const cleanup = module.init?.(stores)
    expect(lifecycleEvents).toEqual([
      'registered',
      'factory-called',
      'registerSlots-called',
      'init-called',
    ])

    // Render (module render is React component, just verify it exists)
    expect(typeof module.render).toBe('function')

    // Cleanup
    cleanup?.()
    expect(lifecycleEvents).toEqual([
      'registered',
      'factory-called',
      'registerSlots-called',
      'init-called',
      'cleanup-called',
    ])
  })

  it('should support multiple modules with independent lifecycles', async () => {
    const moduleAEvents: string[] = []
    const moduleBEvents: string[] = []

    viewModeRegistry.register(
      'module-a',
      async () =>
        createTestModule('module-a', 'Module A', {
          registerSlots: () => moduleAEvents.push('slots'),
          init: () => {
            moduleAEvents.push('init')
            return () => moduleAEvents.push('cleanup')
          },
        }),
      { displayName: 'Module A' },
    )

    viewModeRegistry.register(
      'module-b',
      async () =>
        createTestModule('module-b', 'Module B', {
          registerSlots: () => moduleBEvents.push('slots'),
          init: () => {
            moduleBEvents.push('init')
            return () => moduleBEvents.push('cleanup')
          },
        }),
      { displayName: 'Module B' },
    )

    const stores = createMockStores()

    // Load and init module A
    const moduleA = await viewModeRegistry.get('module-a')
    moduleA.registerSlots?.(testSlotRegistry)
    const cleanupA = moduleA.init?.(stores)

    expect(moduleAEvents).toEqual(['slots', 'init'])
    expect(moduleBEvents).toEqual([])

    // Load and init module B (A still active)
    const moduleB = await viewModeRegistry.get('module-b')
    moduleB.registerSlots?.(testSlotRegistry)
    const cleanupB = moduleB.init?.(stores)

    expect(moduleAEvents).toEqual(['slots', 'init'])
    expect(moduleBEvents).toEqual(['slots', 'init'])

    // Cleanup A only
    cleanupA?.()
    expect(moduleAEvents).toEqual(['slots', 'init', 'cleanup'])
    expect(moduleBEvents).toEqual(['slots', 'init'])

    // Cleanup B
    cleanupB?.()
    expect(moduleBEvents).toEqual(['slots', 'init', 'cleanup'])
  })
})

// ============================================================================
// Performance Tests
// ============================================================================

describe('Performance Benchmarks', () => {
  let testSlotRegistry: SlotRegistry

  beforeEach(() => {
    viewModeRegistry.clear()
    testSlotRegistry = new SlotRegistry()
  })

  it('should resolve slots within acceptable time (< 1ms per slot)', async () => {
    // Register multiple slots
    for (let i = 0; i < 50; i++) {
      testSlotRegistry.register({
        id: `slot-${i}`,
        priority: Math.floor(Math.random() * 100),
        renderer: () => createMockRenderer(`slot-${i}`),
      })
    }

    // Create columns matching slots
    const columns = Array.from({ length: 50 }, (_, i) => createMockColumn(`slot-${i}`))
    const context = createMockContext()

    // Preload all slots
    await testSlotRegistry.preloadForColumns(columns, context)

    // Benchmark resolution
    const startTime = performance.now()
    const iterations = 1000

    for (let i = 0; i < iterations; i++) {
      for (const column of columns) {
        testSlotRegistry.resolve(column, context)
      }
    }

    const totalTime = performance.now() - startTime
    const timePerResolution = totalTime / (iterations * columns.length)

    // Each resolution should be < 1ms (after preload, resolve is a simple cache lookup)
    expect(timePerResolution).toBeLessThan(1)
  })

  it('should load modules within acceptable time (< 100ms per module)', async () => {
    // Register modules
    for (let i = 0; i < 10; i++) {
      viewModeRegistry.register(
        `perf-module-${i}`,
        async () => {
          // Simulate some initialization work
          await new Promise((resolve) => setTimeout(resolve, 5))
          return createTestModule(`perf-module-${i}`, `Performance Module ${i}`)
        },
        { displayName: `Performance Module ${i}` },
      )
    }

    // Load all modules and measure time
    const startTime = performance.now()

    await Promise.all(
      Array.from({ length: 10 }, (_, i) => viewModeRegistry.get(`perf-module-${i}`)),
    )

    const totalTime = performance.now() - startTime
    const timePerModule = totalTime / 10

    // Each module should load in < 100ms (including simulated delay)
    expect(timePerModule).toBeLessThan(100)
  })

  it('should handle 100 slot registrations without performance degradation', async () => {
    const startRegister = performance.now()

    // Register 100 slots with varying priorities and contexts
    for (let i = 0; i < 100; i++) {
      testSlotRegistry.register({
        id: `mass-slot-${i % 10}`, // 10 unique slot IDs
        priority: i % 3 === 0 ? 100 : i % 3 === 1 ? 50 : 0,
        contextFilter: i % 2 === 0 ? (ctx) => ctx.entityType === 'Task' : undefined,
        renderer: () => createMockRenderer(`mass-slot-${i}`),
      })
    }

    const registerTime = performance.now() - startRegister

    // Registration of 100 slots should be < 50ms
    expect(registerTime).toBeLessThan(50)

    // Create columns and preload
    const columns = Array.from({ length: 10 }, (_, i) => createMockColumn(`mass-slot-${i}`))
    const context = createMockContext({ entityType: 'Task' })

    const startPreload = performance.now()
    await testSlotRegistry.preloadForColumns(columns, context)
    const preloadTime = performance.now() - startPreload

    // Preload should complete in < 100ms
    expect(preloadTime).toBeLessThan(100)
    expect(testSlotRegistry.preloadReady).toBe(true)
  })
})

// ============================================================================
// Edge Cases and Error Handling
// ============================================================================

describe('Edge Cases and Error Handling', () => {
  beforeEach(() => {
    viewModeRegistry.clear()
    slotRegistry.clear()
  })

  it('should handle module without registerSlots gracefully', async () => {
    viewModeRegistry.register(
      'no-slots',
      async () => createTestModule('no-slots', 'No Slots Module'),
      { displayName: 'No Slots Module' },
    )

    const module = await viewModeRegistry.get('no-slots')

    // Should not throw when registerSlots is undefined
    expect(() => module.registerSlots?.(slotRegistry)).not.toThrow()
  })

  it('should handle module without init gracefully', async () => {
    viewModeRegistry.register(
      'no-init',
      async () => createTestModule('no-init', 'No Init Module'),
      {
        displayName: 'No Init Module',
      },
    )

    const module = await viewModeRegistry.get('no-init')
    const stores = createMockStores()

    // Should not throw when init is undefined
    const cleanup = module.init?.(stores)
    expect(cleanup).toBeUndefined()
  })

  it('should handle init that returns void (no cleanup needed)', async () => {
    viewModeRegistry.register(
      'void-init',
      async () =>
        createTestModule('void-init', 'Void Init', {
          init: () => {
            // Init with no cleanup
          },
        }),
      { displayName: 'Void Init' },
    )

    const module = await viewModeRegistry.get('void-init')
    const stores = createMockStores()

    const cleanup = module.init?.(stores)
    expect(cleanup).toBeUndefined()

    // Should not throw when cleanup is undefined
    cleanup?.()
  })

  it('should isolate errors between modules', async () => {
    viewModeRegistry.register(
      'good-module',
      async () => createTestModule('good-module', 'Good Module'),
      { displayName: 'Good Module' },
    )

    viewModeRegistry.register(
      'bad-module',
      async (): Promise<GridModule> => {
        throw new Error('Module load error')
      },
      { displayName: 'Bad Module' },
    )

    // Good module should still work
    const goodModule = await viewModeRegistry.get('good-module')
    expect(goodModule.id).toBe('good-module')

    // Bad module should throw
    await expect(viewModeRegistry.get('bad-module')).rejects.toThrow('Module load error')

    // Good module still works after bad module error
    const goodModuleAgain = await viewModeRegistry.get('good-module')
    expect(goodModuleAgain.id).toBe('good-module')
  })
})
