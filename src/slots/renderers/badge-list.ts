/**
 * Badge list cell renderer
 *
 * Renders an array of values as inline badges with `+N` overflow.
 *
 * Three value-shape paths supported, in priority order:
 *
 * 1. **Substrate join projection** (GH#2848 follow-up): the substrate's
 *    `kind: 'join'` projection emits a sibling field on the row at
 *    `rowData[`${columnId}__rel_names`]` containing the resolved display
 *    names as `string[]`. The renderer reads them directly. No collection
 *    lookup, no race against background warmup. This is the primary path
 *    once relationship columns produce a join projection in
 *    `use-substrate-grid-rows.ts`.
 *
 * 2. **F' source-row inline IDs** (GH#2786 legacy): `value` is `string[]`
 *    of target entity IDs and the column carries a
 *    `relationshipTargetEntity`. The renderer resolves each ID via the
 *    already-synced TanStack DB collection (`getExistingEntityCollection`).
 *    Retained as a fallback for: (a) non-substrate grids, (b) the brief
 *    window before the substrate's first delta lands. IDs that don't
 *    resolve fall through to the raw ID string \u2014 re-rendering happens
 *    automatically when the target collection's observable state updates.
 *
 * 3. **Pre-resolved names** (legacy): `value` is `string[]` of display
 *    names already (for non-relationship list columns like enum tags).
 *    Renders directly as badges.
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

    // GH#2848 follow-up B: per-target-entity badge color. When the column
    // is a relationship column we tint each chip with the target entity
    // type's accent (shared with the EntityPicker dot). For non-relationship
    // list columns (enum tags etc.) the tint is unset and the chip falls
    // back to the neutral muted style.
    const targetEntityType = (column as { relationshipTargetEntity?: string | null })
      .relationshipTargetEntity ?? null

    for (const name of visible) {
      container.appendChild(this.badge(name, targetEntityType))
    }
    if (overflow > 0) {
      const more = this.badge(`+${overflow}`, null)
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
   * Coerce the cell value to a `string[]` of display labels.
   *
   * Resolution order:
   *   1. Substrate join projection \u2014 `rowData[`${columnId}__rel_names`]`,
   *      written by `query-maintenance.ts` evaluateQuery from a `kind:'join'`
   *      projection emitted by `use-substrate-grid-rows.ts`. This is the
   *      primary path for substrate-owned grids.
   *   2. Legacy in-memory ID resolution \u2014 `getExistingEntityCollection` +
   *      `.get(id)` against the target entity's TanStack DB collection.
   *      Retained as a fallback for non-substrate grids and for the brief
   *      window before the substrate's first delta lands.
   *   3. Raw value passthrough \u2014 the cell already contains display strings
   *      (non-relationship list columns, e.g. tag enums).
   */
  private normalize(value: unknown, column: Column, context: CellRendererContext): string[] {
    if (!value || !Array.isArray(value)) return []
    const targetEntityType = (column as { relationshipTargetEntity?: string | null }).relationshipTargetEntity
    const displayField =
      ((column as { relationshipDisplayField?: string }).relationshipDisplayField as string) || 'name'
    const orgId = context.organizationId

    // Path 1: substrate join projection. The worker's evaluateQuery
    // attaches a sibling `${colId}__rel_names` array onto the row when a
    // `kind:'join'` projection is present. Length is bounded by the
    // window's union of inline IDs and is already in display-name form.
    if (targetEntityType) {
      const rowData = (context as { rowData?: Record<string, unknown> }).rowData
      const projectedKey = `${column.id}__rel_names`
      const projected = rowData ? rowData[projectedKey] : undefined
      if (Array.isArray(projected) && projected.length > 0) {
        const filtered = projected.filter(
          (n): n is string => typeof n === 'string' && n.length > 0,
        )
        if (filtered.length > 0) return filtered
        // projected was present but all names were empty strings (target
        // rows haven't loaded yet under this entity_type filter). Fall
        // through to path 2 so we still render IDs as best-effort.
      }
    }

    // Path 2: legacy collection lookup.
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
      // Fallback: render raw value (could be an unresolved ID \u2014 the row
      // re-renders when the target collection's records arrive).
      return v
    })
  }

  /**
   * Build a single badge element. When `targetEntityType` is non-null,
   * tint the chip with the per-entity-type accent color (shared with
   * EntityPicker via `shared/lib/entity-type-color.ts`); otherwise use
   * the neutral muted theme tokens.
   */
  private badge(label: string, targetEntityType: string | null): HTMLElement {
    const el = document.createElement('span')
    el.textContent = label
    el.dataset.action = 'edit'
    el.dataset.affordanceRole = 'badge'
    if (targetEntityType) {
      const bg = getEntityTypeTintedBackground(targetEntityType, null, 0.18)
      const accent = getEntityTypeColor(targetEntityType, null)
      el.style.cssText = `
        display:inline-flex;align-items:center;
        padding:1px 8px;border-radius:9999px;
        font-size:11px;font-weight:500;white-space:nowrap;line-height:1.4;
        background:${bg};color:${accent};
        border:1px solid ${bg};
      `
    } else {
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
}

export const badgeListCellRenderer = new BadgeListCellRenderer()
