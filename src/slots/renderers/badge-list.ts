/**
 * Badge list cell renderer
 *
 * Renders an array of relationship targets (or pre-resolved labels) as
 * inline badges with `+N` overflow.
 *
 * For relationship columns, each badge carries the target entity's
 * `data-entity-type` + `data-entity-id` and `data-action="navigate"`.
 * Clicks bubble to `EntityListView`'s listener which opens the target in
 * the EntityDrawer side panel (GH#1843). When the column is editable, a
 * pencil icon appears at the end of the cell on hover and routes to the
 * relationship picker editor via `data-action="edit"` (interactionPolicy
 * `editTrigger: 'icon'`).
 *
 * Three value-shape paths supported, in priority order:
 *
 * 1. **Substrate join projection** (GH#2848 follow-up B): the substrate's
 *    `kind: 'join'` projection emits a sibling field on the row at
 *    `rowData[`${columnId}__rel`]` containing `Array<{id, name}>` aligned
 *    with the source-row inline IDs. The renderer reads pairs directly —
 *    no collection lookup, no parallel-array reconciliation. Empty `name`
 *    means the target row hasn't loaded yet under this entity_type filter;
 *    the renderer falls back to an ID suffix and the row re-renders when
 *    the next substrate delta lands. This is the primary path once
 *    relationship columns produce a join projection in
 *    `use-substrate-grid-rows.ts`.
 *
 * 2. **F' source-row inline IDs** (GH#2786 legacy): `value` is `string[]`
 *    of target entity IDs and the column carries a
 *    `relationshipTargetEntity`. The renderer resolves each ID via the
 *    already-synced TanStack DB collection (`getExistingEntityCollection`).
 *    Retained as a fallback for: (a) non-substrate grids, (b) the brief
 *    window before the substrate's first delta lands. IDs that don't
 *    resolve fall through to the raw ID suffix — re-rendering happens
 *    automatically when the target collection's observable state updates.
 *
 * 3. **Pre-resolved names** (legacy): `value` is `string[]` of display
 *    names already (for non-relationship list columns like enum tags).
 *    Renders as badges without navigation affordances.
 *
 * Per-target-entity badge color (GH#2848 follow-up B): the chip background
 * is tinted with the target entity_type's accent color (shared with the
 * EntityPicker dot via `shared/lib/entity-type-color.ts`). Falls back to
 * the previous neutral muted style when the column is not a relationship
 * column or no schema color is registered.
 *
 * Pre-F' (badge-list-live + bridge) is gone (P6a deletion); this is the
 * only badge-list renderer post-cutover.
 */

import { getExistingEntityCollection } from '@/shared/data/db/collections/registry'
import {
  getEntityTypeTintedBackground,
  getEntityTypeColor,
} from '@/shared/lib/entity-type-color'
import type { Column } from '../../types'
import type { CellRenderer, CellRendererContext } from '../SlotRegistry'
import { applyAffordanceAttrs } from '../applyAffordanceAttrs'

const BADGE_LIST_MAX_VISIBLE = 3

/** A single badge target — `id` is empty for non-relationship enum tags. */
interface RelItem {
  id: string
  name: string
}

class BadgeListCellRenderer implements CellRenderer {
  render(value: unknown, column: Column, context: CellRendererContext): HTMLElement {
    const container = document.createElement('div')
    container.style.cssText = 'display:flex;flex-wrap:nowrap;gap:4px;align-items:center;overflow:hidden;'

    const items = this.normalize(value, column, context)
    const targetEntityType = (column as { relationshipTargetEntity?: string | null })
      .relationshipTargetEntity ?? null
    const isEditable = column.editable !== false && Boolean(targetEntityType)

    if (items.length === 0) {
      container.textContent = '—'
      container.style.opacity = '0.5'
      applyAffordanceAttrs(container, this, isEditable)
      return container
    }

    const visible = items.slice(0, BADGE_LIST_MAX_VISIBLE)
    const overflow = items.length - BADGE_LIST_MAX_VISIBLE

    for (const item of visible) {
      container.appendChild(this.badge(item, targetEntityType))
    }
    if (overflow > 0) {
      const more = this.overflowBadge(overflow, items)
      container.appendChild(more)
    }

    // Container affordance + pencil edit icon on hover (GH#1843 affordance
    // restoration). The container picks up `data-affordance="navigate"` from
    // applyAffordanceAttrs (defaultAction='navigate'), but never carries
    // `data-entity-id` — only individual badges do. EntityListView's
    // `closest('[data-action="navigate"][data-entity-type][data-entity-id]')`
    // listener therefore matches the clicked badge, not the container, and
    // pencil clicks (`data-action="edit"`) bypass the navigate listener and
    // route to the picker editor via interactionPolicy.editTrigger='icon'.
    applyAffordanceAttrs(container, this, isEditable)
    if (isEditable) {
      container.appendChild(this.pencil())
    }
    return container
  }

  format(value: unknown, column: Column, context: CellRendererContext): string {
    const items = this.normalize(value, column, context)
    return items.map((i) => i.name || i.id).filter(Boolean).join(', ')
  }

  validate(): string | null {
    return null
  }

  affordances = {
    sortable: true,
    filterable: true,
    editable: true,
    resizable: true,
    reorderable: true,
    groupable: true,
  }

  interactionPolicy = {
    defaultAction: 'navigate' as const,
    editTrigger: 'icon' as const,
    blurPolicy: 'commit' as const,
  }

  affordanceGroup = {
    group: 'link-with-edit-icon',
    whenNotEditable: 'readonly-link',
  }

  metadata = { category: 'relationship' as const, description: 'Relationship badge list with navigation + edit affordances' }

  /**
   * Coerce the cell value to `RelItem[]` (`{id, name}` pairs).
   *
   * Resolution order:
   *   1. Substrate join projection — `rowData[`${columnId}__rel`]`,
   *      written by `query-maintenance.ts` evaluateQuery from a
   *      `kind:'join'` projection emitted by `use-substrate-grid-rows.ts`.
   *      Already in `Array<{id, name}>` shape, source-row order preserved.
   *      Primary path for substrate-owned grids.
   *   2. Legacy in-memory ID resolution — `getExistingEntityCollection` +
   *      `.get(id)` against the target entity's TanStack DB collection.
   *      Retained as a fallback for non-substrate grids and for the brief
   *      window before the substrate's first delta lands. Returns
   *      `{id, name: resolvedNameOrEmpty}` so the navigate affordance is
   *      always wired even before names land.
   *   3. Raw value passthrough — the cell already contains display strings
   *      (non-relationship list columns, e.g. tag enums). Returned as
   *      `{id: '', name}` — badges in this path skip the navigate affordance.
   */
  private normalize(value: unknown, column: Column, context: CellRendererContext): RelItem[] {
    const targetEntityType = (column as { relationshipTargetEntity?: string | null }).relationshipTargetEntity
    const displayField =
      ((column as { relationshipDisplayField?: string }).relationshipDisplayField as string) || 'name'
    const orgId = context.organizationId

    // Path 1: substrate join projection (Array<{id, name}>).
    if (targetEntityType) {
      const rowData = (context as { rowData?: Record<string, unknown> }).rowData
      const projectedKey = `${column.id}__rel`
      const projected = rowData ? rowData[projectedKey] : undefined
      if (Array.isArray(projected) && projected.length > 0) {
        const out: RelItem[] = []
        for (const entry of projected) {
          if (entry && typeof entry === 'object' && 'id' in entry) {
            const e = entry as { id: unknown; name?: unknown }
            const id = typeof e.id === 'string' ? e.id : ''
            const name = typeof e.name === 'string' ? e.name : ''
            if (id || name) out.push({ id, name })
          }
        }
        if (out.length > 0) return out
        // Defensive: fall through if projection was malformed.
      }
    }

    if (!value || !Array.isArray(value)) return []

    // Path 2: legacy collection lookup. `value` is `string[]` of IDs.
    if (targetEntityType && orgId) {
      const coll = getExistingEntityCollection(targetEntityType, orgId) as
        | { get?: (id: string) => unknown }
        | null
      const resolver = coll && typeof coll.get === 'function'
        ? (id: string): string => {
            const rec = coll.get!(id) as Record<string, unknown> | undefined
            if (!rec) return ''
            const v = rec[displayField] ?? rec.name ?? rec.title
            return typeof v === 'string' ? v : ''
          }
        : null
      return value.map((v: unknown) => {
        if (typeof v === 'string') {
          return { id: v, name: resolver ? resolver(v) : '' }
        }
        if (v && typeof v === 'object' && 'id' in (v as Record<string, unknown>)) {
          const o = v as Record<string, unknown>
          const id = typeof o.id === 'string' ? o.id : ''
          const name = typeof o.name === 'string' ? o.name : (resolver && id ? resolver(id) : '')
          return { id, name }
        }
        return { id: '', name: String(v) }
      })
    }

    // Path 3: pre-resolved names (enum tags, non-relationship list columns).
    return value.map((v: unknown) => {
      if (typeof v === 'string') return { id: '', name: v }
      if (v && typeof v === 'object') {
        const o = v as Record<string, unknown>
        const name = typeof o.name === 'string' ? o.name : String(v)
        return { id: '', name }
      }
      return { id: '', name: String(v) }
    })
  }

  /**
   * Build a single relationship badge. When `targetEntityType` is non-null
   * AND the item carries an `id`, the badge becomes navigable (carries
   * `data-action="navigate"` + `data-entity-type` + `data-entity-id` for
   * EntityListView's closest() listener) and is tinted with the per-entity-
   * type accent color. Otherwise it falls back to a neutral readonly chip
   * (used for path 3 enum tags and for items where the substrate hasn't
   * resolved a usable id).
   */
  private badge(item: RelItem, targetEntityType: string | null): HTMLElement {
    const navigable = Boolean(targetEntityType && item.id)
    const label = item.name || (item.id ? `#${item.id.slice(-6)}` : '')
    const el = document.createElement('span')
    el.className = 'vibegridx-entity-badge'
    el.dataset.affordanceRole = navigable ? 'link' : 'badge'
    if (navigable) {
      el.dataset.action = 'navigate'
      el.dataset.entityType = targetEntityType!
      el.dataset.entityId = item.id
      el.title = label
      const bg = getEntityTypeTintedBackground(targetEntityType!, null, 0.18)
      const accent = getEntityTypeColor(targetEntityType!, null)
      el.style.cssText = `
        display:inline-flex;align-items:center;gap:4px;
        padding:1px 8px;border-radius:9999px;
        font-size:11px;font-weight:500;white-space:nowrap;line-height:1.4;
        background:${bg};color:${accent};
        border:1px solid ${bg};
        cursor:pointer;
      `
      const text = document.createElement('span')
      text.className = 'vibegridx-entity-name'
      text.textContent = label
      text.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;'
      el.appendChild(text)
      const arrow = document.createElement('span')
      arrow.className = 'vibegridx-entity-badge-arrow'
      arrow.textContent = '↗' // ↗ navigate hint
      arrow.style.cssText = 'opacity:0.5;font-size:10px;flex-shrink:0;line-height:1;'
      arrow.setAttribute('aria-hidden', 'true')
      el.appendChild(arrow)
    } else {
      el.textContent = label
      el.style.cssText = `
        display:inline-flex;align-items:center;
        padding:1px 8px;border-radius:9999px;
        font-size:11px;font-weight:500;white-space:nowrap;line-height:1.4;
        background:hsl(var(--muted));color:hsl(var(--muted-foreground));
        border:1px solid hsl(var(--border));
      `
    }
    return el
  }

  /** "+N" overflow chip with a tooltip listing all hidden labels. */
  private overflowBadge(overflow: number, allItems: RelItem[]): HTMLElement {
    const more = document.createElement('span')
    more.textContent = `+${overflow}`
    more.title = allItems.map((i) => i.name || i.id).filter(Boolean).join(', ')
    more.style.cssText = `
      display:inline-flex;align-items:center;
      padding:1px 8px;border-radius:9999px;
      font-size:11px;font-weight:600;white-space:nowrap;line-height:1.4;
      background:hsl(var(--accent));color:hsl(var(--accent-foreground));
      border:1px solid hsl(var(--border));
    `
    more.dataset.affordanceRole = 'overflow'
    return more
  }

  /**
   * Hover-revealed pencil icon (GH#1843). Sits as the last child of the
   * cell container; CSS in `affordances.css` tied to the
   * `link-with-edit-icon` affordance group reveals it on container hover.
   * Inline `opacity:0` is the bare-minimum guarantee — `display:none` would
   * remove it from the a11y tree and break chrome-devtools-axi snapshots
   * (see `.claude/rules/agent-testability.md` rule 4).
   */
  private pencil(): HTMLElement {
    const icon = document.createElement('span')
    icon.className = 'vibegridx-entity-reference-edit-icon'
    icon.textContent = '✏️'
    icon.dataset.action = 'edit'
    icon.dataset.affordanceRole = 'icon'
    icon.title = 'Edit relationship'
    icon.setAttribute('aria-label', 'Edit relationship')
    icon.style.cssText =
      'opacity:0;transition:opacity 0.2s;font-size:12px;flex-shrink:0;cursor:pointer;margin-left:auto;padding:0 2px;'
    return icon
  }
}

export const badgeListCellRenderer = new BadgeListCellRenderer()
