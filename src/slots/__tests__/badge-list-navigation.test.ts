/**
 * @vitest-environment jsdom
 *
 * Badge-list relationship navigation + edit affordance tests (GH#1843 restore).
 *
 * Verifies the badge-list cell renderer emits the DOM contract that
 * EntityListView's click listener depends on to open EntityDrawer:
 *
 *   <div data-affordance="navigate" data-affordance-group="link-with-edit-icon" data-editable="true">
 *     <span data-action="navigate" data-entity-type="..." data-entity-id="...">name ↗</span>
 *     ...
 *     <span data-action="edit" data-affordance-role="icon">✏️</span>
 *   </div>
 *
 * Path coverage:
 *   1. Substrate `__rel` join projection (Array<{id, name}>) — primary path
 *   2. Legacy ID array + collection lookup
 *   3. Pre-resolved string array (enum tags) — non-navigable
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/shared/data/db/collections/registry', () => ({
  getExistingEntityCollection: vi.fn(() => null),
}))

vi.mock('@/shared/lib/entity-type-color', () => ({
  getEntityTypeColor: () => '#0ea5e9',
  getEntityTypeTintedBackground: () => '#e0f2fe',
}))

import { badgeListCellRenderer } from '../renderers/badge-list'
import type { Column } from '../../types'
import type { CellRendererContext } from '../SlotRegistry'
import { getExistingEntityCollection } from '@/shared/data/db/collections/registry'

function relColumn(overrides: Partial<Column> = {}): Column {
  return {
    id: 'project_belongs_to',
    field: 'project_belongs_to',
    name: 'Project',
    cellType: 'badge-list' as Column['cellType'],
    width: 200,
    relationshipTargetEntity: 'Project',
    relationshipDisplayField: 'name',
    editable: true,
    ...overrides,
  } as Column
}

function ctx(rowData?: Record<string, unknown>): CellRendererContext {
  return {
    viewMode: 'table',
    entityType: 'RFI',
    schemaId: 'default',
    organizationId: 'org-1',
    ...(rowData ? { rowData } : {}),
  } as CellRendererContext
}

describe('badge-list renderer — relationship navigation (GH#1843 restore)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Path 1: substrate __rel join projection', () => {
    it('reads Array<{id, name}> pairs and emits navigable badges', () => {
      const column = relColumn()
      const rowData = {
        project_belongs_to__rel: [
          { id: 'proj-1', name: 'Project Apex' },
          { id: 'proj-2', name: 'Project Beta' },
        ],
      }
      // value is the source-row inline IDs array (the substrate spreads `data.*`)
      const el = badgeListCellRenderer.render(['proj-1', 'proj-2'], column, ctx(rowData))

      // Container affordance contract
      expect(el.getAttribute('data-affordance')).toBe('navigate')
      expect(el.getAttribute('data-affordance-group')).toBe('link-with-edit-icon')
      expect(el.getAttribute('data-editable')).toBe('true')

      // Per-badge navigate attrs
      const badges = el.querySelectorAll('[data-action="navigate"]')
      expect(badges).toHaveLength(2)
      expect(badges[0].getAttribute('data-entity-type')).toBe('Project')
      expect(badges[0].getAttribute('data-entity-id')).toBe('proj-1')
      expect(badges[1].getAttribute('data-entity-id')).toBe('proj-2')

      // Display name + arrow hint
      expect(badges[0].textContent).toContain('Project Apex')
      expect(badges[0].textContent).toContain('↗')
      expect(badges[1].textContent).toContain('Project Beta')
    })

    it('falls back to ID suffix when name is empty (target not yet loaded)', () => {
      const column = relColumn()
      const rowData = {
        project_belongs_to__rel: [{ id: 'project-abc-123456', name: '' }],
      }
      const el = badgeListCellRenderer.render(['project-abc-123456'], column, ctx(rowData))
      const badge = el.querySelector('[data-action="navigate"]')
      expect(badge).not.toBeNull()
      // Still navigable even without resolved name
      expect(badge!.getAttribute('data-entity-id')).toBe('project-abc-123456')
      expect(badge!.textContent).toContain('#123456')
    })

    it('appends pencil edit icon when column is editable', () => {
      const column = relColumn()
      const rowData = {
        project_belongs_to__rel: [{ id: 'p1', name: 'P1' }],
      }
      const el = badgeListCellRenderer.render(['p1'], column, ctx(rowData))
      const pencil = el.querySelector('[data-action="edit"]')
      expect(pencil).not.toBeNull()
      expect(pencil!.getAttribute('data-affordance-role')).toBe('icon')
      expect(pencil!.textContent).toBe('✏️')
      // Must be discoverable in a11y tree (rule: opacity:0, not display:none)
      expect((pencil as HTMLElement).style.opacity).toBe('0')
      expect((pencil as HTMLElement).style.display).not.toBe('none')
    })

    it('omits pencil when column is not editable', () => {
      const column = relColumn({ editable: false })
      const rowData = {
        project_belongs_to__rel: [{ id: 'p1', name: 'P1' }],
      }
      const el = badgeListCellRenderer.render(['p1'], column, ctx(rowData))
      expect(el.querySelector('[data-action="edit"]')).toBeNull()
      expect(el.getAttribute('data-editable')).toBe('false')
    })

    it('shows +N overflow chip for >3 items', () => {
      const column = relColumn()
      const items = Array.from({ length: 5 }, (_, i) => ({ id: `p${i}`, name: `P${i}` }))
      const rowData = { project_belongs_to__rel: items }
      const el = badgeListCellRenderer.render(items.map((i) => i.id), column, ctx(rowData))
      const navigable = el.querySelectorAll('[data-action="navigate"]')
      expect(navigable).toHaveLength(3)
      const overflow = el.querySelector('[data-affordance-role="overflow"]')
      expect(overflow).not.toBeNull()
      expect(overflow!.textContent).toBe('+2')
    })
  })

  describe('Path 2: legacy ID array + collection lookup', () => {
    it('resolves names via collection and emits navigable badges', () => {
      const column = relColumn()
      vi.mocked(getExistingEntityCollection).mockReturnValue({
        get: (id: string) => {
          if (id === 'p1') return { id: 'p1', name: 'Project Apex' }
          return undefined
        },
      } as never)

      // No __rel in rowData — forces path 2
      const el = badgeListCellRenderer.render(['p1', 'p2'], column, ctx({}))
      const badges = el.querySelectorAll('[data-action="navigate"]')
      expect(badges).toHaveLength(2)
      expect(badges[0].textContent).toContain('Project Apex')
      // Unresolved → fallback to ID suffix, still navigable
      expect(badges[1].getAttribute('data-entity-id')).toBe('p2')
    })

    it('still emits navigable badges when collection has no entry yet', () => {
      const column = relColumn()
      vi.mocked(getExistingEntityCollection).mockReturnValue({ get: () => undefined } as never)
      const el = badgeListCellRenderer.render(['ghost-id-789012'], column, ctx({}))
      const badge = el.querySelector('[data-action="navigate"]')
      expect(badge).not.toBeNull()
      expect(badge!.getAttribute('data-entity-id')).toBe('ghost-id-789012')
    })
  })

  describe('Path 3: pre-resolved enum tag names (non-relationship)', () => {
    it('renders readonly badges without navigate affordance', () => {
      const column = {
        id: 'tags',
        field: 'tags',
        name: 'Tags',
        cellType: 'badge-list' as Column['cellType'],
        width: 200,
        editable: false,
      } as Column // no relationshipTargetEntity

      const el = badgeListCellRenderer.render(['urgent', 'review'], column, ctx({}))
      // No navigable badges
      expect(el.querySelectorAll('[data-action="navigate"]')).toHaveLength(0)
      // Container should not advertise navigate either when not editable + no relationship
      expect(el.getAttribute('data-editable')).toBe('false')
      // Names still rendered
      expect(el.textContent).toContain('urgent')
      expect(el.textContent).toContain('review')
    })
  })

  describe('EntityListView listener compatibility', () => {
    it('a clicked badge matches the listener selector', () => {
      const column = relColumn()
      const rowData = {
        project_belongs_to__rel: [{ id: 'proj-1', name: 'Project Apex' }],
      }
      const el = badgeListCellRenderer.render(['proj-1'], column, ctx(rowData))
      document.body.appendChild(el)
      const badge = el.querySelector('[data-action="navigate"]') as HTMLElement
      const found = badge.closest<HTMLElement>(
        '[data-action="navigate"][data-entity-type][data-entity-id], [data-affordance="navigate"][data-entity-type][data-entity-id]',
      )
      expect(found).toBe(badge)
      expect(found!.dataset.entityType).toBe('Project')
      expect(found!.dataset.entityId).toBe('proj-1')
      document.body.removeChild(el)
    })

    it('a clicked pencil does NOT match the navigate listener', () => {
      const column = relColumn()
      const rowData = {
        project_belongs_to__rel: [{ id: 'proj-1', name: 'Project Apex' }],
      }
      const el = badgeListCellRenderer.render(['proj-1'], column, ctx(rowData))
      document.body.appendChild(el)
      const pencil = el.querySelector('[data-action="edit"]') as HTMLElement
      const found = pencil.closest<HTMLElement>(
        '[data-action="navigate"][data-entity-type][data-entity-id], [data-affordance="navigate"][data-entity-type][data-entity-id]',
      )
      // Pencil itself: data-action="edit", no entity-id → no match.
      // Container: data-affordance="navigate" but no data-entity-id → no match.
      expect(found).toBeNull()
      document.body.removeChild(el)
    })
  })
})
