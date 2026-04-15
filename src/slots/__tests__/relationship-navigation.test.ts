/**
 * @vitest-environment jsdom
 *
 * Relationship Field Navigation Tests (GH#1843)
 *
 * NOTE: entity_reference and user_reference field types were removed in GH#2552.
 * Relationships are now managed through URS (UnifiedRelationshipService),
 * not field-level references. The reference-select and reference-multi types
 * handle relationship display in the grid.
 *
 * The original EntityReferenceCellRenderer and UserReferenceCellRenderer
 * slot registrations have been removed from slot-initialization.ts.
 * This test file now verifies that the removed types are no longer registered.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Column } from '../../types'

// Mock dependencies before imports
vi.mock('@/shared/lib/logging', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

vi.mock('@/shared/lib/display-formatters', () => ({
  formatFieldForDisplay: (value: unknown) => String(value ?? ''),
}))

vi.mock('../../utils/icon-mapping', () => ({
  getOptionIconDisplay: () => null,
}))

// Import after mocking
import { SlotRegistry } from '../SlotRegistry'
import type { CellRendererContext } from '../SlotRegistry'
import { registerDefaultSlots } from '../slot-initialization'

function createColumn(fieldType: string, overrides: Partial<Column> = {}): Column {
  return {
    id: fieldType,
    field: fieldType,
    name: `${fieldType} Column`,
    cellType: fieldType as Column['cellType'],
    width: 100,
    ...overrides,
  }
}

function createContext(overrides: Partial<CellRendererContext> = {}): CellRendererContext {
  return {
    viewMode: 'table',
    entityType: 'Task',
    schemaId: 'default',
    organizationId: 'org-1',
    ...overrides,
  }
}

describe('GH#2552: Legacy relationship field types removed', () => {
  let registry: SlotRegistry

  beforeEach(() => {
    registry = new SlotRegistry()
    registerDefaultSlots(registry)
  })

  it('entity_reference slot is no longer registered', async () => {
    const column = createColumn('entity_reference')
    const ctx = createContext()
    await registry.preloadForColumns([column], ctx)
    const renderer = registry.resolve(column, ctx)
    // entity_reference is no longer a registered slot — falls back to default/undefined
    expect(renderer).toBeUndefined()
  })

  it('user_reference slot is no longer registered', async () => {
    const column = createColumn('user_reference')
    const ctx = createContext()
    await registry.preloadForColumns([column], ctx)
    const renderer = registry.resolve(column, ctx)
    // user_reference is no longer a registered slot — falls back to default/undefined
    expect(renderer).toBeUndefined()
  })

  it('Badge click targets can still be constructed for navigation (DOM-only test)', () => {
    // CellActionRouter checks nativeEvent.defaultPrevented after calling onCellClick
    const badge = document.createElement('div')
    badge.setAttribute('data-affordance', 'navigate')
    badge.setAttribute('data-entity-type', 'Vendor')
    badge.setAttribute('data-entity-id', 'vendor-123')
    document.body.appendChild(badge)

    const event = new MouseEvent('click', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'target', { value: badge })

    const target = event.target as HTMLElement
    const found = target.closest<HTMLElement>('[data-affordance="navigate"][data-entity-type][data-entity-id]')
    if (found?.dataset.entityType && found?.dataset.entityId) {
      event.preventDefault()
    }

    expect(event.defaultPrevented).toBe(true)
    document.body.removeChild(badge)
  })
})
