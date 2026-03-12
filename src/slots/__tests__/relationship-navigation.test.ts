/**
 * @vitest-environment jsdom
 *
 * Relationship Field Navigation Tests (GH#1843)
 *
 * Tests for the navigate-on-click + pencil-edit affordance pattern
 * on EntityReferenceCellRenderer and UserReferenceCellRenderer.
 *
 * Verifies:
 * - B1: Badge click navigates (data-affordance="navigate" on badge)
 * - B2: Pencil icon triggers edit (data-affordance="edit" on icon)
 * - B3: Container does NOT get data-affordance (affordances live on children)
 * - B5: Navigation arrow (↗) rendered on badges
 * - interactionPolicy and affordanceGroup are correct
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

vi.mock('@/server/domain/shared/dataforge-stubs/display-formatters', () => ({
  formatFieldForDisplay: (value: unknown) => String(value ?? ''),
}))

vi.mock('../../utils/icon-mapping', () => ({
  getOptionIconDisplay: () => null,
}))

// Import after mocking
import { SlotRegistry } from '../SlotRegistry'
import type { CellRenderer, CellRendererContext } from '../SlotRegistry'
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

async function resolveRenderer(
  registry: SlotRegistry,
  fieldType: string,
  context: CellRendererContext,
  columnOverrides: Partial<Column> = {},
): Promise<CellRenderer> {
  const column = createColumn(fieldType, columnOverrides)
  await registry.preloadForColumns([column], context)
  const renderer = registry.resolve(column, context)
  expect(renderer).toBeDefined()
  return renderer!
}

describe('Relationship Field Navigation (GH#1843)', () => {
  let registry: SlotRegistry

  beforeEach(() => {
    registry = new SlotRegistry()
    registerDefaultSlots(registry)
  })

  describe('EntityReferenceCellRenderer', () => {
    it('should have navigate as defaultAction and icon as editTrigger', async () => {
      const ctx = createContext()
      const renderer = await resolveRenderer(registry, 'entity_reference', ctx)
      expect((renderer as any).interactionPolicy).toEqual({
        defaultAction: 'navigate',
        editTrigger: 'icon',
        blurPolicy: 'commit',
      })
    })

    it('should have navigable-badge-with-edit-icon affordanceGroup', async () => {
      const ctx = createContext()
      const renderer = await resolveRenderer(registry, 'entity_reference', ctx)
      expect((renderer as any).affordanceGroup).toEqual({
        group: 'navigable-badge-with-edit-icon',
        whenNotEditable: 'link-only',
      })
    })

    it('should render badge with data-affordance="navigate" and arrow icon', async () => {
      const ctx = createContext({
        rowData: { entity_reference_name: 'Acme Corp' },
      } as any)
      const renderer = await resolveRenderer(registry, 'entity_reference', ctx, {
        targetEntityType: 'Vendor',
      } as any)
      const column = createColumn('entity_reference', {
        targetEntityType: 'Vendor',
      } as any)

      const el = renderer.render('some-uuid', column, ctx)

      // Badge should have data-affordance="navigate"
      const badge = el.querySelector('.vibegridx-entity-badge')
      expect(badge).toBeTruthy()
      expect(badge!.getAttribute('data-affordance')).toBe('navigate')

      // Badge should have entity type and id attributes
      expect(badge!.getAttribute('data-entity-type')).toBe('Vendor')
      expect(badge!.getAttribute('data-entity-id')).toBe('some-uuid')

      // Arrow icon should be present
      const arrow = el.querySelector('.vibegridx-entity-badge-arrow')
      expect(arrow).toBeTruthy()
      expect(arrow!.textContent).toBe('↗')
    })

    it('should render pencil edit icon with data-affordance="edit" when editable', async () => {
      const ctx = createContext({
        rowData: { entity_reference_name: 'Acme Corp' },
      } as any)
      const renderer = await resolveRenderer(registry, 'entity_reference', ctx, {
        editable: true,
        targetEntityType: 'Vendor',
      } as any)
      const column = createColumn('entity_reference', {
        editable: true,
        targetEntityType: 'Vendor',
      } as any)

      const el = renderer.render('some-uuid', column, ctx)

      // Pencil icon should be present with edit affordance
      const pencilIcon = el.querySelector('.vibegridx-entity-reference-edit-icon')
      expect(pencilIcon).toBeTruthy()
      expect(pencilIcon!.getAttribute('data-affordance')).toBe('edit')
      expect(pencilIcon!.getAttribute('data-affordance-role')).toBe('icon')
    })

    it('should NOT render pencil icon when column is not editable', async () => {
      const ctx = createContext({
        rowData: { entity_reference_name: 'Acme Corp' },
      } as any)
      const renderer = await resolveRenderer(registry, 'entity_reference', ctx, {
        editable: false,
        targetEntityType: 'Vendor',
      } as any)
      const column = createColumn('entity_reference', {
        editable: false,
        targetEntityType: 'Vendor',
      } as any)

      const el = renderer.render('some-uuid', column, ctx)

      const pencilIcon = el.querySelector('.vibegridx-entity-reference-edit-icon')
      expect(pencilIcon).toBeNull()
    })

    it('should NOT set data-affordance on container (only on child elements)', async () => {
      const ctx = createContext({
        rowData: { entity_reference_name: 'Acme Corp' },
      } as any)
      const renderer = await resolveRenderer(registry, 'entity_reference', ctx, {
        editable: true,
        targetEntityType: 'Vendor',
      } as any)
      const column = createColumn('entity_reference', {
        editable: true,
        targetEntityType: 'Vendor',
      } as any)

      const el = renderer.render('some-uuid', column, ctx)

      // Container should NOT have data-affordance
      expect(el.getAttribute('data-affordance')).toBeNull()
      // Container should have data-affordance-group
      expect(el.getAttribute('data-affordance-group')).toBe('navigable-badge-with-edit-icon')
    })

    it('should render empty state without navigate badge', async () => {
      const ctx = createContext()
      const renderer = await resolveRenderer(registry, 'entity_reference', ctx)
      const column = createColumn('entity_reference')

      const el = renderer.render(null, column, ctx)

      const badge = el.querySelector('.vibegridx-entity-badge')
      expect(badge).toBeNull()
    })

    it('should have relationship category in metadata', async () => {
      const renderer = await resolveRenderer(registry, 'entity_reference', createContext())
      expect((renderer as any).metadata?.category).toBe('relationship')
    })
  })

  describe('UserReferenceCellRenderer', () => {
    it('should have navigate as defaultAction and icon as editTrigger', async () => {
      const renderer = await resolveRenderer(registry, 'user_reference', createContext())
      expect((renderer as any).interactionPolicy).toEqual({
        defaultAction: 'navigate',
        editTrigger: 'icon',
        blurPolicy: 'commit',
      })
    })

    it('should have navigable-badge-with-edit-icon affordanceGroup', async () => {
      const renderer = await resolveRenderer(registry, 'user_reference', createContext())
      expect((renderer as any).affordanceGroup).toEqual({
        group: 'navigable-badge-with-edit-icon',
        whenNotEditable: 'link-only',
      })
    })

    it('should render pencil edit icon when editable', async () => {
      const ctx = createContext({
        rowData: { user_reference_name: 'Jane Doe' },
      } as any)
      const renderer = await resolveRenderer(registry, 'user_reference', ctx, {
        editable: true,
      })
      const column = createColumn('user_reference', { editable: true })

      const el = renderer.render('user-uuid', column, ctx)

      const pencilIcon = el.querySelector('.vibegridx-user-reference-edit-icon')
      expect(pencilIcon).toBeTruthy()
      expect(pencilIcon!.getAttribute('data-affordance')).toBe('edit')
    })

    it('should NOT set data-affordance on container', async () => {
      const ctx = createContext({
        rowData: { user_reference_name: 'Jane Doe' },
      } as any)
      const renderer = await resolveRenderer(registry, 'user_reference', ctx, {
        editable: true,
      })
      const column = createColumn('user_reference', { editable: true })

      const el = renderer.render('user-uuid', column, ctx)

      expect(el.getAttribute('data-affordance')).toBeNull()
      expect(el.getAttribute('data-affordance-group')).toBe('navigable-badge-with-edit-icon')
    })

    it('should have relationship category in metadata', async () => {
      const renderer = await resolveRenderer(registry, 'user_reference', createContext())
      expect((renderer as any).metadata?.category).toBe('relationship')
    })
  })

  describe('Badge click targets correct entity (GH#1843 bugfix)', () => {
    it('entity reference badge should have data-entity-type and data-entity-id for direct navigation', async () => {
      const targetEntityId = 'vendor-uuid-1234'
      const ctx = createContext({
        rowData: { entity_reference_name: 'Acme Vendor' },
      } as any)
      const renderer = await resolveRenderer(registry, 'entity_reference', ctx, {
        editable: true,
      })
      // targetEntityType is a runtime property not in the Column type, cast through unknown
      const column = {
        ...createColumn('entity_reference', { editable: true }),
        targetEntityType: 'Vendor',
      } as unknown as Column

      const el = renderer.render(targetEntityId, column, ctx)

      // The badge must carry data-entity-type and data-entity-id so onCellClick
      // can navigate to the REFERENCED entity, not the row entity
      const badge = el.querySelector('[data-affordance="navigate"]') as HTMLElement
      expect(badge).toBeTruthy()
      expect(badge.dataset.entityType).toBe('Vendor')
      expect(badge.dataset.entityId).toBe(targetEntityId)
    })

    it('onCellClick can use event.preventDefault() to signal handled to CellActionRouter', () => {
      // CellActionRouter checks nativeEvent.defaultPrevented after calling onCellClick
      const badge = document.createElement('div')
      badge.setAttribute('data-affordance', 'navigate')
      badge.setAttribute('data-entity-type', 'Vendor')
      badge.setAttribute('data-entity-id', 'vendor-123')
      document.body.appendChild(badge)

      const event = new MouseEvent('click', { bubbles: true, cancelable: true })
      Object.defineProperty(event, 'target', { value: badge })

      // Simulate what EntityListView does on badge click
      const target = event.target as HTMLElement
      const found = target.closest<HTMLElement>(
        '[data-affordance="navigate"][data-entity-type][data-entity-id]',
      )
      if (found?.dataset.entityType && found?.dataset.entityId) {
        event.preventDefault()
      }

      expect(event.defaultPrevented).toBe(true)
      document.body.removeChild(badge)
    })
  })
})
