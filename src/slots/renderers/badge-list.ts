/**
 * Badge list cell renderer
 */

import type { Column } from '../../types'
import type { CellRenderer, CellRendererContext } from '../SlotRegistry'
import { applyAffordanceAttrs } from '../applyAffordanceAttrs'

const BADGE_LIST_MAX_VISIBLE = 3

class BadgeListCellRenderer implements CellRenderer {
  render(value: unknown, _column: Column, _context: CellRendererContext): HTMLElement {
    const container = document.createElement('div')
    container.style.cssText =
      'display:flex;flex-wrap:nowrap;gap:4px;align-items:center;overflow:hidden;'

    const items = this.normalize(value)
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

  format(value: unknown): string {
    const items = this.normalize(value)
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

  private normalize(value: unknown): string[] {
    if (!value || !Array.isArray(value)) return []
    return value.map((v: unknown) =>
      typeof v === 'string' ? v : (((v as Record<string, unknown>)?.name as string) ?? String(v)),
    )
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
