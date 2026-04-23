/**
 * GH#2651 P1.3 — Badge list (live) cell renderer
 *
 * Visual parity with ./badge-list.ts; the difference is the *source* of the
 * badge names:
 *
 * - `badge-list` reads names from the cell value (server-enriched rel__ array).
 * - `badge-list-live` reads names from `tableCoreStore.relationshipBadgeData`,
 *   which is populated by the React `useBadgeListEnrichment` bridge that runs
 *   a TanStack DB liveQuery join over the Rel_* + target-entity collections.
 *
 * On cache miss the renderer shows a single dimmed `…` placeholder. When the
 * bridge writes the cache the MobX observable triggers a re-render and the
 * placeholder is replaced by real badges. Cache hits render identically to
 * badge-list (same container/badge styling, same +N overflow).
 */

import type { Column } from '../../types'
import type { CellRenderer, CellRendererContext } from '../SlotRegistry'
import { applyAffordanceAttrs } from '../applyAffordanceAttrs'

const BADGE_LIST_MAX_VISIBLE = 3

class BadgeListLiveCellRenderer implements CellRenderer {
  render(_value: unknown, column: Column, context: CellRendererContext): HTMLElement {
    const container = document.createElement('div')
    container.style.cssText = 'display:flex;flex-wrap:nowrap;gap:4px;align-items:center;overflow:hidden;'

    const relCfg = (column as any).relationshipConfig as
      | { relationshipEntity?: string; direction?: 'source' | 'target' }
      | undefined
    const rowData = (context as Record<string, unknown>).rowData as Record<string, unknown> | undefined
    const anchorId = rowData?.id as string | undefined
    const tableCoreStore = (context as Record<string, any>).tableCoreStore as
      | {
          getRelationshipBadges: (
            relationshipEntity: string,
            direction: 'source' | 'target',
            anchorId: string,
          ) => string[] | undefined
        }
      | undefined

    // Missing configuration or no row anchor → empty dash (matches badge-list).
    if (!relCfg?.relationshipEntity || !relCfg.direction || !anchorId || !tableCoreStore) {
      container.textContent = '\u2014'
      container.style.opacity = '0.5'
      return container
    }

    const cached = tableCoreStore.getRelationshipBadges(
      relCfg.relationshipEntity,
      relCfg.direction,
      anchorId,
    )

    // Cache miss: show a dimmed ellipsis placeholder. The MobX reaction on the
    // observable map will re-render this cell once the bridge writes names.
    if (cached === undefined) {
      const placeholder = this.badge('\u2026')
      placeholder.style.opacity = '0.5'
      container.appendChild(placeholder)
      applyAffordanceAttrs(container, this, false)
      return container
    }

    // Cache hit with zero badges: empty dash (matches badge-list empty branch).
    if (cached.length === 0) {
      container.textContent = '\u2014'
      container.style.opacity = '0.5'
      return container
    }

    const visible = cached.slice(0, BADGE_LIST_MAX_VISIBLE)
    const overflow = cached.length - BADGE_LIST_MAX_VISIBLE

    for (const name of visible) {
      container.appendChild(this.badge(name))
    }
    if (overflow > 0) {
      const more = this.badge(`+${overflow}`)
      more.title = cached.join(', ')
      more.style.fontWeight = '600'
      more.style.backgroundColor = 'hsl(var(--accent))'
      more.style.color = 'hsl(var(--accent-foreground))'
      container.appendChild(more)
    }

    applyAffordanceAttrs(container, this, false)
    return container
  }

  format(_value: unknown, column: Column, context: CellRendererContext): string {
    const relCfg = (column as any).relationshipConfig as
      | { relationshipEntity?: string; direction?: 'source' | 'target' }
      | undefined
    const rowData = (context as Record<string, unknown>).rowData as Record<string, unknown> | undefined
    const anchorId = rowData?.id as string | undefined
    const tableCoreStore = (context as Record<string, any>).tableCoreStore as
      | {
          getRelationshipBadges: (
            relationshipEntity: string,
            direction: 'source' | 'target',
            anchorId: string,
          ) => string[] | undefined
        }
      | undefined

    if (!relCfg?.relationshipEntity || !relCfg.direction || !anchorId || !tableCoreStore) return ''
    const cached = tableCoreStore.getRelationshipBadges(
      relCfg.relationshipEntity,
      relCfg.direction,
      anchorId,
    )
    return cached?.join(', ') ?? ''
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
  metadata = { category: 'relationship' as const, description: 'Badge list populated via live Rel_* join' }

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

export const badgeListLiveCellRenderer = new BadgeListLiveCellRenderer()
