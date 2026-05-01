/**
 * Badge list cell renderer
 *
 * Renders an array of values as inline badges with `+N` overflow.
 *
 * Two value-shape paths supported:
 *
 * 1. **Pre-resolved names** (legacy): `value` is `string[]` of display
 *    names. Renders directly as badges. No collection lookup.
 *
 * 2. **F' source-row inline IDs** (GH#2786): `value` is `string[]` of
 *    target entity IDs and the column carries a `relationshipTargetEntity`
 *    pointing at the target entity_type. The renderer resolves each ID
 *    to a display name from the already-synced TanStack DB collection
 *    (`getExistingEntityCollection`) and renders the names. IDs that
 *    don't resolve fall through to the raw ID string \u2014 re-rendering
 *    happens automatically when the target collection's MobX/observable
 *    state updates (TanStack DB reactivity).
 *
 * Pre-F' (badge-list-live + bridge) is gone (P6a deletion); this is the
 * only badge-list renderer post-cutover.
 */

import { getExistingEntityCollection } from '@/shared/data/db/collections/registry'
import type { Column } from '../../types'
import { getCachedName } from '../../utils/relationshipNameCache'
import type { CellRenderer, CellRendererContext } from '../SlotRegistry'
import { applyAffordanceAttrs } from '../applyAffordanceAttrs'

const BADGE_LIST_MAX_VISIBLE = 3

class BadgeListCellRenderer implements CellRenderer {
  render(value: unknown, column: Column, context: CellRendererContext): HTMLElement {
    const container = document.createElement('div')
    container.style.cssText = 'display:flex;flex-wrap:nowrap;gap:4px;align-items:center;overflow:hidden;'

    const items = this.normalize(value, column, context)
    if (items.length === 0) {
      container.textContent = '\u2014'
      container.style.opacity = '0.5'
      return container
    }

    const visible = items.slice(0, BADGE_LIST_MAX_VISIBLE)
    const overflow = items.length - BADGE_LIST_MAX_VISIBLE

    for (const name of visible) {
      container.appendChild(this.badge(name))
    }
    if (overflow > 0) {
      const more = this.badge(`+${overflow}`)
      more.title = items.join(', ')
      more.style.fontWeight = '600'
      more.style.backgroundColor = 'hsl(var(--accent))'
      more.style.color = 'hsl(var(--accent-foreground))'
      container.appendChild(more)
    }

    applyAffordanceAttrs(container, this, false)
    return container
  }

  format(value: unknown, column: Column, context: CellRendererContext): string {
    const items = this.normalize(value, column, context)
    return items.join(', ')
  }

  validate(): string | null {
    return null // read-only
  }

  affordances = {
    sortable: false,
    filterable: false,
    editable: false,
    resizable: true,
    reorderable: true,
    groupable: false,
  }

  interactionPolicy = {
    defaultAction: 'custom' as const,
    editTrigger: 'none' as const,
    blurPolicy: 'cancel' as const,
  }

  affordanceGroup = { group: 'editable-badge', whenNotEditable: 'readonly-badge' }
  metadata = { category: 'basic' as const, description: 'Badge list with +N overflow' }

  /**
   * Coerce the cell value to a `string[]` of display labels, resolving
   * F' inline IDs against the target entity collection when the column
   * carries `relationshipTargetEntity`.
   */
  private normalize(value: unknown, column: Column, context: CellRendererContext): string[] {
    if (!value || !Array.isArray(value)) return []
    const targetEntityType = (column as { relationshipTargetEntity?: string | null }).relationshipTargetEntity
    const displayField =
      ((column as { relationshipDisplayField?: string }).relationshipDisplayField as string) || 'name'
    const orgId = context.organizationId

    let resolver: ((id: string) => string | undefined) | null = null
    if (targetEntityType && orgId) {
      const coll = getExistingEntityCollection(targetEntityType, orgId) as
        | { get?: (id: string) => unknown }
        | null
      if (coll && typeof coll.get === 'function') {
        resolver = (id: string) => {
          const rec = coll.get!(id) as Record<string, unknown> | undefined
          if (!rec) return undefined
          // Try the configured display field, then 'name', then 'title'.
          const v = rec[displayField] ?? rec.name ?? rec.title
          return typeof v === 'string' && v.length > 0 ? v : undefined
        }
      }
    }

    return value.map((v: unknown) => {
      if (typeof v !== 'string') {
        return ((v as Record<string, unknown>)?.name as string) ?? String(v)
      }
      if (resolver) {
        const resolved = resolver(v)
        if (resolved) return resolved
      }
      // GH#2786 follow-up: fall back to the scoped relationship name cache,
      // populated by the by-ID batch fetch in `useRelationshipTargetCollections`.
      // This covers high-cardinality target types (User, Drawing, File, ...) for
      // which we never warm a full entity collection.
      if (targetEntityType && orgId) {
        const cached = getCachedName(orgId, targetEntityType, v)
        if (cached) return cached
      }
      // Fallback: render raw value (could be an unresolved ID \u2014 the row
      // re-renders when the target collection's records or scoped name cache arrive).
      return v
    })
  }

  private badge(label: string): HTMLElement {
    const el = document.createElement('span')
    el.textContent = label
    el.dataset.action = 'edit'
    el.dataset.affordanceRole = 'badge'
    el.style.cssText = `
      display:inline-flex;align-items:center;
      padding:1px 8px;border-radius:9999px;
      font-size:11px;font-weight:500;white-space:nowrap;line-height:1.4;
      background:hsl(var(--muted));color:hsl(var(--muted-foreground));
      border:1px solid hsl(var(--border));
    `
    return el
  }
}

export const badgeListCellRenderer = new BadgeListCellRenderer()
