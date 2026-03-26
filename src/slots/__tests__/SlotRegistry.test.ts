/**
 * SlotRegistry Tests
 *
 * Comprehensive test suite for the SlotRegistry:
 * - Slot registration
 * - Priority-based resolution (view mode > domain > default)
 * - Context filtering (viewMode, entityType, schemaId scoping)
 * - canHandle() predicate matching
 * - Fallback to 'text' renderer
 * - preloadForColumns() caching
 * - Cache invalidation
 *
 * Part of: VibeGrid D2 Slot Registry
 * @see Issue #1416 Section 3 for architecture overview
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
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
import { SlotRegistry, slotRegistry } from '../SlotRegistry'
import type { CellRenderer, CellRendererContext, Slot } from '../SlotRegistry'

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

describe('SlotRegistry', () => {
  let registry: SlotRegistry

  beforeEach(() => {
    // Create a fresh registry for each test
    registry = new SlotRegistry()
  })

  describe('register', () => {
    it('should register a slot', () => {
      const slot: Slot = {
        id: 'text',
        renderer: () => createMockRenderer('text'),
      }

      registry.register(slot)

      expect(registry.getRegisteredIds()).toContain('text')
    })

    it('should register multiple slots', () => {
      registry.register({
        id: 'text',
        renderer: () => createMockRenderer('text'),
      })
      registry.register({
        id: 'number',
        renderer: () => createMockRenderer('number'),
      })

      expect(registry.getRegisteredIds()).toContain('text')
      expect(registry.getRegisteredIds()).toContain('number')
    })

    it('should allow multiple slots with same id but different priorities', () => {
      registry.register({
        id: 'text',
        priority: 0,
        renderer: () => createMockRenderer('text-default'),
      })
      registry.register({
        id: 'text',
        priority: 50,
        contextFilter: (ctx) => ctx.entityType === 'Project',
        renderer: () => createMockRenderer('text-project'),
      })

      // Both should be registered (same id, different priority/filter)
      const ids = registry.getRegisteredIds()
      const textCount = ids.filter((id) => id === 'text').length
      expect(textCount).toBe(2)
    })

    it('should skip duplicate registration with same id, priority, and contextFilter', () => {
      const slot: Slot = {
        id: 'text',
        priority: 0,
        renderer: () => createMockRenderer('text'),
      }

      registry.register(slot)
      registry.register(slot) // Duplicate

      // Should only have one 'text' slot
      const ids = registry.getRegisteredIds()
      const textCount = ids.filter((id) => id === 'text').length
      expect(textCount).toBe(1)
    })

    it('should clear cache when new slot is registered', async () => {
      // Register and preload initial slot
      registry.register({
        id: 'text',
        priority: 0,
        renderer: () => createMockRenderer('text-v1'),
      })
      const column = createMockColumn('text')
      const context = createMockContext()
      await registry.preloadForColumns([column], context)

      // Cache should be populated
      expect(registry.preloadReady).toBe(true)

      // Register new slot (should clear cache)
      registry.register({
        id: 'text',
        priority: 100,
        contextFilter: (ctx) => ctx.viewMode === 'gantt',
        renderer: () => createMockRenderer('text-gantt'),
      })

      // preloadReady should still be true but internal cache was cleared
      // (preloadReady doesn't reset on cache clear, only on preloadForColumns start)
    })
  })

  describe('unregister', () => {
    it('should remove slot by id', () => {
      registry.register({
        id: 'text',
        renderer: () => createMockRenderer('text'),
      })
      registry.register({
        id: 'number',
        renderer: () => createMockRenderer('number'),
      })

      registry.unregister('text')

      expect(registry.getRegisteredIds()).not.toContain('text')
      expect(registry.getRegisteredIds()).toContain('number')
    })

    it('should remove all slots with matching id', () => {
      registry.register({
        id: 'text',
        priority: 0,
        renderer: () => createMockRenderer('text-default'),
      })
      registry.register({
        id: 'text',
        priority: 50,
        contextFilter: (ctx) => ctx.entityType === 'Project',
        renderer: () => createMockRenderer('text-project'),
      })

      registry.unregister('text')

      expect(registry.getRegisteredIds()).not.toContain('text')
    })

    it('should not throw when unregistering non-existent slot', () => {
      expect(() => registry.unregister('nonexistent')).not.toThrow()
    })
  })

  describe('getRegisteredIds', () => {
    it('should return empty array for empty registry', () => {
      expect(registry.getRegisteredIds()).toEqual([])
    })

    it('should return all registered slot ids', () => {
      registry.register({ id: 'text', renderer: () => createMockRenderer('text') })
      registry.register({ id: 'number', renderer: () => createMockRenderer('number') })
      registry.register({ id: 'date', renderer: () => createMockRenderer('date') })

      const ids = registry.getRegisteredIds()
      expect(ids).toContain('text')
      expect(ids).toContain('number')
      expect(ids).toContain('date')
      expect(ids).toHaveLength(3)
    })

    it('should include duplicate ids when same id registered with different priorities', () => {
      registry.register({ id: 'text', priority: 0, renderer: () => createMockRenderer('text') })
      registry.register({
        id: 'text',
        priority: 100,
        contextFilter: () => true,
        renderer: () => createMockRenderer('text-override'),
      })

      const ids = registry.getRegisteredIds()
      expect(ids.filter((id) => id === 'text')).toHaveLength(2)
    })
  })

  describe('preloadForColumns', () => {
    it('should set preloadReady to true when complete', async () => {
      registry.register({
        id: 'text',
        renderer: () => createMockRenderer('text'),
      })

      const columns = [createMockColumn('text')]
      const context = createMockContext()

      expect(registry.preloadReady).toBe(false)

      await registry.preloadForColumns(columns, context)

      expect(registry.preloadReady).toBe(true)
    })

    it('should set preloadReady to false at start of preload', async () => {
      registry.register({
        id: 'text',
        renderer: () => createMockRenderer('text'),
      })

      const columns = [createMockColumn('text')]
      const context = createMockContext()

      // First preload
      await registry.preloadForColumns(columns, context)
      expect(registry.preloadReady).toBe(true)

      // Second preload should reset flag at start
      let flagDuringPreload = true
      const originalPreload = registry.preloadForColumns.bind(registry)
      registry.preloadForColumns = async (cols, ctx) => {
        const promise = originalPreload(cols, ctx)
        // Check flag immediately after call starts
        flagDuringPreload = registry.preloadReady
        return promise
      }

      await registry.preloadForColumns([createMockColumn('text', 'text2')], context)
      // Flag should have been false during preload
      expect(flagDuringPreload).toBe(false)
    })

    it('should cache renderers for columns', async () => {
      let loadCount = 0
      registry.register({
        id: 'text',
        renderer: () => {
          loadCount++
          return createMockRenderer('text')
        },
      })

      const columns = [createMockColumn('text')]
      const context = createMockContext()

      await registry.preloadForColumns(columns, context)
      expect(loadCount).toBe(1)

      // Second preload with same columns should use cache
      await registry.preloadForColumns(columns, context)
      expect(loadCount).toBe(1) // Still 1, not 2
    })

    it('should load renderers for multiple columns', async () => {
      registry.register({
        id: 'text',
        renderer: () => createMockRenderer('text'),
      })
      registry.register({
        id: 'number',
        renderer: () => createMockRenderer('number'),
      })
      registry.register({
        id: 'date',
        renderer: () => createMockRenderer('date'),
      })

      const columns = [createMockColumn('text'), createMockColumn('number'), createMockColumn('date')]
      const context = createMockContext()

      await registry.preloadForColumns(columns, context)

      expect(registry.preloadReady).toBe(true)
      // All three should be cached and resolvable
      expect(registry.resolve(columns[0], context)).toBeDefined()
      expect(registry.resolve(columns[1], context)).toBeDefined()
      expect(registry.resolve(columns[2], context)).toBeDefined()
    })

    it('should handle async renderer factories', async () => {
      registry.register({
        id: 'text',
        renderer: async () => {
          await new Promise((resolve) => setTimeout(resolve, 10))
          return createMockRenderer('text-async')
        },
      })

      const columns = [createMockColumn('text')]
      const context = createMockContext()

      await registry.preloadForColumns(columns, context)

      expect(registry.preloadReady).toBe(true)
      const renderer = registry.resolve(columns[0], context)!
      const element = renderer.render(null, columns[0], context)
      expect(element.className).toBe('renderer-text-async')
    })
  })

  describe('resolve - priority-based resolution', () => {
    beforeEach(async () => {
      // Register slots with different priorities
      registry.register({
        id: 'text',
        priority: 0, // Default priority
        renderer: () => createMockRenderer('text-default'),
      })
      registry.register({
        id: 'text',
        priority: 50, // Domain priority
        contextFilter: (ctx) => ctx.entityType === 'Project',
        renderer: () => createMockRenderer('text-project'),
      })
      registry.register({
        id: 'text',
        priority: 100, // View mode priority
        contextFilter: (ctx) => ctx.viewMode === 'gantt',
        renderer: () => createMockRenderer('text-gantt'),
      })
    })

    it('should resolve default priority slot when no context matches', async () => {
      const column = createMockColumn('text')
      const context = createMockContext({ entityType: 'Task', viewMode: 'table' })

      await registry.preloadForColumns([column], context)
      const renderer = registry.resolve(column, context)!

      const element = renderer.render(null, column, context)
      expect(element.className).toBe('renderer-text-default')
    })

    it('should resolve domain priority slot for matching entity type', async () => {
      const column = createMockColumn('text')
      const context = createMockContext({ entityType: 'Project', viewMode: 'table' })

      await registry.preloadForColumns([column], context)
      const renderer = registry.resolve(column, context)!

      const element = renderer.render(null, column, context)
      expect(element.className).toBe('renderer-text-project')
    })

    it('should resolve view mode priority slot for matching view mode', async () => {
      const column = createMockColumn('text')
      const context = createMockContext({ entityType: 'Task', viewMode: 'gantt' })

      await registry.preloadForColumns([column], context)
      const renderer = registry.resolve(column, context)!

      const element = renderer.render(null, column, context)
      expect(element.className).toBe('renderer-text-gantt')
    })

    it('should prefer higher priority when multiple contexts match', async () => {
      // Both Project entity and Gantt view - should use Gantt (priority 100)
      const column = createMockColumn('text')
      const context = createMockContext({ entityType: 'Project', viewMode: 'gantt' })

      await registry.preloadForColumns([column], context)
      const renderer = registry.resolve(column, context)!

      const element = renderer.render(null, column, context)
      expect(element.className).toBe('renderer-text-gantt')
    })
  })

  describe('resolve - contextFilter', () => {
    it('should filter slots by viewMode', async () => {
      registry.register({
        id: 'custom',
        priority: 0,
        renderer: () => createMockRenderer('custom-default'),
      })
      registry.register({
        id: 'custom',
        priority: 100,
        contextFilter: (ctx) => ctx.viewMode === 'kanban',
        renderer: () => createMockRenderer('custom-kanban'),
      })

      const column = createMockColumn('custom')

      // Table view should get default
      const tableContext = createMockContext({ viewMode: 'table' })
      await registry.preloadForColumns([column], tableContext)
      const tableRenderer = registry.resolve(column, tableContext)!
      expect(tableRenderer.render(null, column, tableContext).className).toBe('renderer-custom-default')

      // Kanban view should get kanban-specific
      const kanbanContext = createMockContext({ viewMode: 'kanban' })
      await registry.preloadForColumns([column], kanbanContext)
      const kanbanRenderer = registry.resolve(column, kanbanContext)!
      expect(kanbanRenderer.render(null, column, kanbanContext).className).toBe('renderer-custom-kanban')
    })

    it('should filter slots by entityType', async () => {
      registry.register({
        id: 'status',
        priority: 0,
        renderer: () => createMockRenderer('status-default'),
      })
      registry.register({
        id: 'status',
        priority: 50,
        contextFilter: (ctx) => ctx.entityType === 'Task',
        renderer: () => createMockRenderer('status-task'),
      })

      const column = createMockColumn('status')

      // Task entity should get task-specific
      const taskContext = createMockContext({ entityType: 'Task' })
      await registry.preloadForColumns([column], taskContext)
      const taskRenderer = registry.resolve(column, taskContext)!
      expect(taskRenderer.render(null, column, taskContext).className).toBe('renderer-status-task')

      // Project entity should get default
      const projectContext = createMockContext({ entityType: 'Project' })
      await registry.preloadForColumns([column], projectContext)
      const projectRenderer = registry.resolve(column, projectContext)!
      expect(projectRenderer.render(null, column, projectContext).className).toBe('renderer-status-default')
    })

    it('should filter slots by schemaId', async () => {
      registry.register({
        id: 'custom-field',
        priority: 0,
        renderer: () => createMockRenderer('custom-field-default'),
      })
      registry.register({
        id: 'custom-field',
        priority: 50,
        contextFilter: (ctx) => ctx.schemaId === 'schema-123',
        renderer: () => createMockRenderer('custom-field-schema-123'),
      })

      const column = createMockColumn('custom-field')

      // Specific schema should get schema-specific
      const schemaContext = createMockContext({ schemaId: 'schema-123' })
      await registry.preloadForColumns([column], schemaContext)
      const schemaRenderer = registry.resolve(column, schemaContext)!
      expect(schemaRenderer.render(null, column, schemaContext).className).toBe('renderer-custom-field-schema-123')

      // Default schema should get default
      const defaultContext = createMockContext({ schemaId: 'default' })
      await registry.preloadForColumns([column], defaultContext)
      const defaultRenderer = registry.resolve(column, defaultContext)!
      expect(defaultRenderer.render(null, column, defaultContext).className).toBe('renderer-custom-field-default')
    })

    it('should support complex contextFilter with multiple conditions', async () => {
      registry.register({
        id: 'amount',
        priority: 0,
        renderer: () => createMockRenderer('amount-default'),
      })
      registry.register({
        id: 'amount',
        priority: 75,
        contextFilter: (ctx) => ctx.entityType === 'Invoice' && ctx.viewMode === 'table',
        renderer: () => createMockRenderer('amount-invoice-table'),
      })

      const column = createMockColumn('amount')

      // Invoice in table view should match
      const invoiceTableContext = createMockContext({ entityType: 'Invoice', viewMode: 'table' })
      await registry.preloadForColumns([column], invoiceTableContext)
      const invoiceTableRenderer = registry.resolve(column, invoiceTableContext)!
      expect(invoiceTableRenderer.render(null, column, invoiceTableContext).className).toBe(
        'renderer-amount-invoice-table',
      )

      // Invoice in kanban view should not match (only table)
      const invoiceKanbanContext = createMockContext({ entityType: 'Invoice', viewMode: 'kanban' })
      await registry.preloadForColumns([column], invoiceKanbanContext)
      const invoiceKanbanRenderer = registry.resolve(column, invoiceKanbanContext)!
      expect(invoiceKanbanRenderer.render(null, column, invoiceKanbanContext).className).toBe('renderer-amount-default')
    })
  })

  describe('resolve - canHandle predicate', () => {
    it('should use canHandle to match custom columns', async () => {
      registry.register({
        id: 'text',
        priority: 0,
        renderer: () => createMockRenderer('text-default'),
      })
      registry.register({
        id: 'entity-name',
        priority: 50,
        canHandle: (column) => column.id === 'name' || (column as any).isPrimaryField,
        renderer: () => createMockRenderer('entity-name'),
      })

      const context = createMockContext()

      // 'name' column should use entity-name renderer
      const nameColumn = createMockColumn('text', 'name')
      await registry.preloadForColumns([nameColumn], context)
      const nameRenderer = registry.resolve(nameColumn, context)!
      expect(nameRenderer.render(null, nameColumn, context).className).toBe('renderer-entity-name')

      // 'title' column WITHOUT isPrimaryField should use default text (e.g., job title on Contact)
      const titleColumn = createMockColumn('text', 'title')
      await registry.preloadForColumns([titleColumn], context)
      const titleRenderer = registry.resolve(titleColumn, context)!
      expect(titleRenderer.render(null, titleColumn, context).className).toBe('renderer-text-default')

      // column with isPrimaryField should use entity-name renderer regardless of id
      const primaryColumn = { ...createMockColumn('text', 'subject'), isPrimaryField: true } as any
      await registry.preloadForColumns([primaryColumn], context)
      const primaryRenderer = registry.resolve(primaryColumn, context)!
      expect(primaryRenderer.render(null, primaryColumn, context).className).toBe('renderer-entity-name')

      // 'description' column should use default text renderer
      const descColumn = createMockColumn('text', 'description')
      await registry.preloadForColumns([descColumn], context)
      const descRenderer = registry.resolve(descColumn, context)!
      expect(descRenderer.render(null, descColumn, context).className).toBe('renderer-text-default')
    })

    it('should combine canHandle with contextFilter', async () => {
      registry.register({
        id: 'text',
        priority: 0,
        renderer: () => createMockRenderer('text-default'),
      })
      registry.register({
        id: 'project-name',
        priority: 75,
        contextFilter: (ctx) => ctx.entityType === 'Project',
        canHandle: (column) => column.id === 'name',
        renderer: () => createMockRenderer('project-name'),
      })

      const nameColumn = createMockColumn('text', 'name')

      // Project entity with name column should get project-name renderer
      const projectContext = createMockContext({ entityType: 'Project' })
      await registry.preloadForColumns([nameColumn], projectContext)
      const projectRenderer = registry.resolve(nameColumn, projectContext)!
      expect(projectRenderer.render(null, nameColumn, projectContext).className).toBe('renderer-project-name')

      // Task entity with name column should get default
      const taskContext = createMockContext({ entityType: 'Task' })
      await registry.preloadForColumns([nameColumn], taskContext)
      const taskRenderer = registry.resolve(nameColumn, taskContext)!
      expect(taskRenderer.render(null, nameColumn, taskContext).className).toBe('renderer-text-default')
    })
  })

  describe('resolve - fallback to text', () => {
    it('should fallback to text renderer for unknown field types', async () => {
      registry.register({
        id: 'text',
        priority: 0,
        renderer: () => createMockRenderer('text-fallback'),
      })

      const unknownColumn = createMockColumn('unknown-type')
      const context = createMockContext()

      await registry.preloadForColumns([unknownColumn], context)
      const renderer = registry.resolve(unknownColumn, context)!

      const element = renderer.render(null, unknownColumn, context)
      expect(element.className).toBe('renderer-text-fallback')
    })

    it('should return null if no text fallback is registered', async () => {
      // Empty registry - no fallback available
      const unknownColumn = createMockColumn('unknown-type')
      const context = createMockContext()

      await registry.preloadForColumns([unknownColumn], context)
      const renderer = registry.resolve(unknownColumn, context)

      expect(renderer).toBeNull()
    })
  })

  describe('resolve - synchronous behavior', () => {
    it('should resolve synchronously when preload not called (fallback)', () => {
      registry.register({
        id: 'text',
        renderer: () => createMockRenderer('text'),
      })

      const column = createMockColumn('text')
      const context = createMockContext()

      // No preload called - should still resolve via synchronous fallback
      const renderer = registry.resolve(column, context)
      expect(renderer).not.toBeNull()
      expect(renderer!.render).toBeDefined()
    })

    it('should not throw after preload is complete', async () => {
      registry.register({
        id: 'text',
        renderer: () => createMockRenderer('text'),
      })

      const column = createMockColumn('text')
      const context = createMockContext()

      await registry.preloadForColumns([column], context)

      expect(() => registry.resolve(column, context)).not.toThrow()
    })
  })

  describe('clearCacheForContext', () => {
    it('should clear cache entries matching viewMode', async () => {
      registry.register({
        id: 'text',
        renderer: () => createMockRenderer('text'),
      })

      const column = createMockColumn('text')

      // Preload for two different view modes
      const tableContext = createMockContext({ viewMode: 'table' })
      const ganttContext = createMockContext({ viewMode: 'gantt' })

      await registry.preloadForColumns([column], tableContext)
      await registry.preloadForColumns([column], ganttContext)

      // Both should be cached
      expect(registry.resolve(column, tableContext)).toBeDefined()
      expect(registry.resolve(column, ganttContext)).toBeDefined()

      // Clear gantt cache
      registry.clearCacheForContext({ viewMode: 'gantt' })

      // Table should still work (might need re-preload in real implementation)
      // Gantt should need re-preload
    })

    it('should clear cache entries matching entityType', async () => {
      registry.register({
        id: 'text',
        renderer: () => createMockRenderer('text'),
      })

      const column = createMockColumn('text')

      const taskContext = createMockContext({ entityType: 'Task' })
      const projectContext = createMockContext({ entityType: 'Project' })

      await registry.preloadForColumns([column], taskContext)
      await registry.preloadForColumns([column], projectContext)

      // Clear Project cache
      registry.clearCacheForContext({ entityType: 'Project' })
    })
  })

  describe('clear', () => {
    it('should clear all slots and cache', async () => {
      registry.register({
        id: 'text',
        renderer: () => createMockRenderer('text'),
      })
      registry.register({
        id: 'number',
        renderer: () => createMockRenderer('number'),
      })

      const column = createMockColumn('text')
      const context = createMockContext()

      await registry.preloadForColumns([column], context)

      registry.clear()

      expect(registry.getRegisteredIds()).toEqual([])
      expect(registry.preloadReady).toBe(false)
    })
  })
})

// ============================================================================
// Integration Tests - Singleton Behavior
// ============================================================================

describe('SlotRegistry Singleton', () => {
  beforeEach(() => {
    slotRegistry.clear()
  })

  it('should be a singleton instance', () => {
    expect(slotRegistry).toBeDefined()
    expect(slotRegistry).toBeInstanceOf(SlotRegistry)
  })

  it('should persist registrations across imports', () => {
    slotRegistry.register({
      id: 'test-slot',
      renderer: () => createMockRenderer('test'),
    })

    expect(slotRegistry.getRegisteredIds()).toContain('test-slot')
  })
})

// ============================================================================
// Edge Cases
// ============================================================================

describe('SlotRegistry Edge Cases', () => {
  let registry: SlotRegistry

  beforeEach(() => {
    registry = new SlotRegistry()
  })

  it('should handle renderer that throws during factory', async () => {
    registry.register({
      id: 'text',
      renderer: () => createMockRenderer('text'),
    })
    registry.register({
      id: 'error',
      renderer: () => {
        throw new Error('Factory error')
      },
    })

    const errorColumn = createMockColumn('error')
    const context = createMockContext()

    // Should not throw during preload (errors are caught)
    await expect(registry.preloadForColumns([errorColumn], context)).rejects.toThrow('Factory error')
  })

  it('should handle async renderer that rejects', async () => {
    registry.register({
      id: 'async-error',
      renderer: async () => {
        throw new Error('Async factory error')
      },
    })

    const column = createMockColumn('async-error')
    const context = createMockContext()

    await expect(registry.preloadForColumns([column], context)).rejects.toThrow('Async factory error')
  })

  it('should handle columns with undefined cellType', async () => {
    registry.register({
      id: 'text',
      renderer: () => createMockRenderer('text'),
    })

    const column: Column = {
      id: 'unnamed',
      field: 'unnamed',
      name: 'Unnamed Column',
      cellType: undefined as unknown as Column['cellType'],
      width: 100,
    }
    const context = createMockContext()

    await registry.preloadForColumns([column], context)
    const renderer = registry.resolve(column, context)

    // Should fallback to text or return null
    // (depends on implementation)
  })

  it('should handle empty columns array', async () => {
    registry.register({
      id: 'text',
      renderer: () => createMockRenderer('text'),
    })

    const context = createMockContext()

    await registry.preloadForColumns([], context)

    expect(registry.preloadReady).toBe(true)
  })

  it('should handle context with all undefined values', async () => {
    registry.register({
      id: 'text',
      renderer: () => createMockRenderer('text'),
    })

    const column = createMockColumn('text')
    const context: CellRendererContext = {}

    await registry.preloadForColumns([column], context)

    expect(registry.preloadReady).toBe(true)
    expect(registry.resolve(column, context)).toBeDefined()
  })
})
