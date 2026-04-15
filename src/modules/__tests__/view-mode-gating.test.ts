/**
 * View Mode Gating Tests (GH#2139)
 *
 * Tests canHandle predicates for view mode modules.
 * These predicates determine which view modes are available
 * based on schema field descriptors.
 *
 * Key behaviors:
 * - Kanban: requires groupable fields (status_set, single-select, multi-select, priority)
 * - Kanban: graceful fallback (returns true) when schemaFields is undefined or empty
 * - Gantt: always returns true (works without date fields, just won't show bars)
 * - Table: always returns true (default view, always available)
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GridModuleRenderProps, SchemaFieldDescriptor } from '../GridModule'
import type { VibeGridStores } from '../../stores/context'

// Mock logger to avoid side effects
vi.mock('@/shared/lib/logging', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

// Import the registry - registerBuiltInModules() runs at import time via index.ts
import { viewModeRegistry } from '../index'

/** Helper to build a minimal GridModuleRenderProps with schemaFields */
function makeProps(schemaFields?: SchemaFieldDescriptor[]): GridModuleRenderProps {
  return {
    tableId: 'test-table',
    entityType: 'Task',
    schemaFields,
  }
}

/** Helper to build a SchemaFieldDescriptor */
function field(fieldType: string, slug?: string): SchemaFieldDescriptor {
  return {
    fieldId: `field_${slug ?? fieldType}`,
    fieldType,
    label: slug ?? fieldType,
    slug: slug ?? fieldType,
  }
}

const mockStores = {} as VibeGridStores

// ============================================================================
// Kanban canHandle predicate
// ============================================================================

describe('Kanban canHandle predicate', () => {
  it('returns true when schemaFields is undefined (graceful fallback)', () => {
    const meta = viewModeRegistry.getMetadata('kanban')
    expect(meta).toBeDefined()
    expect(meta!.canHandle).toBeDefined()

    const result = meta!.canHandle!(makeProps(undefined), mockStores)
    expect(result).toBe(true)
  })

  it('returns true when schemaFields is empty array (graceful fallback)', () => {
    const meta = viewModeRegistry.getMetadata('kanban')

    const result = meta!.canHandle!(makeProps([]), mockStores)
    expect(result).toBe(true)
  })

  it('returns true when schema has a status_set field', () => {
    const meta = viewModeRegistry.getMetadata('kanban')

    const result = meta!.canHandle!(makeProps([field('text', 'name'), field('status_set', 'status')]), mockStores)
    expect(result).toBe(true)
  })

  it('returns true when schema has a single-select field', () => {
    const meta = viewModeRegistry.getMetadata('kanban')

    const result = meta!.canHandle!(
      makeProps([field('number', 'amount'), field('single-select', 'category')]),
      mockStores,
    )
    expect(result).toBe(true)
  })

  it('returns true when schema has a multi-select field', () => {
    const meta = viewModeRegistry.getMetadata('kanban')

    const result = meta!.canHandle!(makeProps([field('text', 'name'), field('multi-select', 'tags')]), mockStores)
    expect(result).toBe(true)
  })

  it('returns true when schema has a priority field', () => {
    const meta = viewModeRegistry.getMetadata('kanban')

    const result = meta!.canHandle!(makeProps([field('text', 'title'), field('priority', 'priority')]), mockStores)
    expect(result).toBe(true)
  })

  it('returns false when schema has only entity_reference (removed field type)', () => {
    const meta = viewModeRegistry.getMetadata('kanban')

    const result = meta!.canHandle!(
      makeProps([field('text', 'name'), field('entity_reference', 'assignee')]),
      mockStores,
    )
    expect(result).toBe(false)
  })

  it('returns false when schema has only text and number fields', () => {
    const meta = viewModeRegistry.getMetadata('kanban')

    const result = meta!.canHandle!(
      makeProps([field('text', 'name'), field('number', 'amount'), field('date', 'created_at')]),
      mockStores,
    )
    expect(result).toBe(false)
  })

  it('returns false when schema has only non-groupable fields', () => {
    const meta = viewModeRegistry.getMetadata('kanban')

    const result = meta!.canHandle!(
      makeProps([
        field('text', 'title'),
        field('number', 'count'),
        field('date', 'due_date'),
        field('datetime', 'created_at'),
        field('boolean', 'is_active'),
        field('url', 'link'),
        field('email', 'contact'),
      ]),
      mockStores,
    )
    expect(result).toBe(false)
  })

  it('returns true when at least one groupable field exists among many non-groupable', () => {
    const meta = viewModeRegistry.getMetadata('kanban')

    const result = meta!.canHandle!(
      makeProps([
        field('text', 'title'),
        field('number', 'count'),
        field('date', 'due_date'),
        field('status_set', 'status'), // This one is groupable
        field('boolean', 'is_active'),
      ]),
      mockStores,
    )
    expect(result).toBe(true)
  })

  it('returns true when multiple groupable fields exist', () => {
    const meta = viewModeRegistry.getMetadata('kanban')

    const result = meta!.canHandle!(
      makeProps([field('status_set', 'status'), field('priority', 'priority'), field('single-select', 'category')]),
      mockStores,
    )
    expect(result).toBe(true)
  })
})

// ============================================================================
// Gantt canHandle predicate
// ============================================================================

describe('Gantt canHandle predicate', () => {
  it('always returns true (works without date fields)', () => {
    const meta = viewModeRegistry.getMetadata('gantt')
    expect(meta).toBeDefined()
    expect(meta!.canHandle).toBeDefined()

    const result = meta!.canHandle!(makeProps([field('text', 'name')]), mockStores)
    expect(result).toBe(true)
  })

  it('returns true when schemaFields is undefined', () => {
    const meta = viewModeRegistry.getMetadata('gantt')

    const result = meta!.canHandle!(makeProps(undefined), mockStores)
    expect(result).toBe(true)
  })

  it('returns true when schemaFields is empty', () => {
    const meta = viewModeRegistry.getMetadata('gantt')

    const result = meta!.canHandle!(makeProps([]), mockStores)
    expect(result).toBe(true)
  })

  it('returns true when schema has date fields', () => {
    const meta = viewModeRegistry.getMetadata('gantt')

    const result = meta!.canHandle!(makeProps([field('date', 'start_date'), field('date', 'end_date')]), mockStores)
    expect(result).toBe(true)
  })
})

// ============================================================================
// Table canHandle predicate
// ============================================================================

describe('Table canHandle predicate', () => {
  it('always returns true (default view)', () => {
    const meta = viewModeRegistry.getMetadata('table')
    expect(meta).toBeDefined()
    expect(meta!.canHandle).toBeDefined()

    const result = meta!.canHandle!(makeProps([field('text', 'name')]), mockStores)
    expect(result).toBe(true)
  })

  it('returns true when schemaFields is undefined', () => {
    const meta = viewModeRegistry.getMetadata('table')

    const result = meta!.canHandle!(makeProps(undefined), mockStores)
    expect(result).toBe(true)
  })

  it('returns true when schemaFields is empty', () => {
    const meta = viewModeRegistry.getMetadata('table')

    const result = meta!.canHandle!(makeProps([]), mockStores)
    expect(result).toBe(true)
  })
})

// ============================================================================
// getAvailableModules integration
// ============================================================================

describe('getAvailableModules with schema fields', () => {
  it('returns all three modules when schema has groupable fields', () => {
    const props = makeProps([field('status_set', 'status'), field('date', 'due_date')])
    const available = viewModeRegistry.getAvailableModules(props, mockStores)

    expect(available).toContain('table')
    expect(available).toContain('kanban')
    expect(available).toContain('gantt')
  })

  it('excludes kanban when schema has only non-groupable fields', () => {
    const props = makeProps([field('text', 'name'), field('number', 'amount')])
    const available = viewModeRegistry.getAvailableModules(props, mockStores)

    expect(available).toContain('table')
    expect(available).not.toContain('kanban')
    expect(available).toContain('gantt')
  })

  it('includes kanban when schemaFields is undefined (graceful fallback)', () => {
    const props = makeProps(undefined)
    const available = viewModeRegistry.getAvailableModules(props, mockStores)

    expect(available).toContain('table')
    expect(available).toContain('kanban')
    expect(available).toContain('gantt')
  })

  it('includes kanban when schemaFields is empty (graceful fallback)', () => {
    const props = makeProps([])
    const available = viewModeRegistry.getAvailableModules(props, mockStores)

    expect(available).toContain('table')
    expect(available).toContain('kanban')
    expect(available).toContain('gantt')
  })
})

// ============================================================================
// isEnabled predicates
// ============================================================================

describe('isEnabled predicates', () => {
  it('table isEnabled returns true', () => {
    const meta = viewModeRegistry.getMetadata('table')
    expect(meta!.isEnabled).toBeDefined()
    expect(meta!.isEnabled!()).toBe(true)
  })

  it('kanban isEnabled returns true', () => {
    const meta = viewModeRegistry.getMetadata('kanban')
    expect(meta!.isEnabled).toBeDefined()
    expect(meta!.isEnabled!()).toBe(true)
  })

  it('gantt isEnabled returns true', () => {
    const meta = viewModeRegistry.getMetadata('gantt')
    expect(meta!.isEnabled).toBeDefined()
    expect(meta!.isEnabled!()).toBe(true)
  })
})
