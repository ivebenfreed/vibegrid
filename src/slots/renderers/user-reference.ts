/**
 * User reference cell renderer
 */

import type { Column } from '../../types'
import type { CellRenderer, CellRendererContext } from '../SlotRegistry'
import { applyAffordanceAttrs } from '../applyAffordanceAttrs'
import { getResolvedDisplayName, isEmpty, renderEmpty } from './helpers'

class UserReferenceCellRenderer implements CellRenderer {
  render(value: unknown, column: Column, context: CellRendererContext): HTMLElement {
    const container = document.createElement('div')
    const isEditable = column.editable !== false

    container.className = 'vibegridx-user-reference'
    container.style.cssText =
      'max-width: 100%; min-width: 0; overflow: hidden; display: flex; align-items: center; gap: 4px;'

    if (isEmpty(value)) {
      renderEmpty(container, isEditable)
      applyAffordanceAttrs(container, this, isEditable)
      // Empty cells: whole area should trigger edit, not navigate (nothing to navigate to)
      if (isEditable) {
        container.setAttribute('data-affordance', 'edit')
      }
      return container
    }

    const rawUserId = typeof value === 'string' ? value : String(value)

    const rowData = (context as Record<string, unknown>).rowData as Record<string, unknown> | undefined

    // Check for backend-resolved display name (_name suffix from UnifiedResolver)
    const userResolvedName = getResolvedDisplayName(rowData, column, context as Record<string, unknown>)
    if (userResolvedName) {
      container.innerHTML = this.createUserBadgeFromName(userResolvedName, rawUserId)
      this.applyNavigableAffordance(container, isEditable)
      return container
    }

    if (rowData) {
      // Legacy: check _resolved suffix (deprecated, kept as fallback)
      const resolvedValue = rowData[`${column.id}_resolved`]
      if (resolvedValue) {
        container.innerHTML = this.createUserBadgeFromName(String(resolvedValue), rawUserId)
        this.applyNavigableAffordance(container, isEditable)
        return container
      }
    }

    // If value is not a UUID (no dash pattern), treat as display name
    if (typeof value === 'string' && !/^[0-9a-f-]{36}$/i.test(value)) {
      container.innerHTML = this.createUserBadgeFromName(value)
      this.applyNavigableAffordance(container, isEditable)
      return container
    }

    // Unresolved UUID - show truncated "User xxxx"
    const userId = String(value)
    container.textContent = `User ${userId.slice(-4)}`
    container.style.opacity = '0.6'
    container.style.fontStyle = 'italic'
    applyAffordanceAttrs(container, this, isEditable)
    return container
  }

  format(value: unknown, column: Column, context: CellRendererContext): string {
    if (isEmpty(value)) return ''

    const rowData = (context as Record<string, unknown>).rowData as Record<string, unknown> | undefined

    const userFormatResolved = getResolvedDisplayName(rowData, column, context as Record<string, unknown>)
    if (userFormatResolved) return userFormatResolved

    if (rowData) {
      const resolvedValue = rowData[`${column.id}_resolved`]
      if (resolvedValue) return String(resolvedValue)
    }

    if (typeof value === 'string' && !/^[0-9a-f-]{36}$/i.test(value)) {
      return value
    }

    return `User ${String(value).slice(-4)}`
  }

  private createUserBadgeFromName(displayName: string, userId?: string): string {
    const initials = this.getInitials(displayName)
    const entityIdAttr = userId ? ` data-entity-id="${userId}"` : ''
    return `<div class="vibegridx-user-badge" data-affordance="navigate" data-action="navigate" data-entity-type="User"${entityIdAttr} title="${displayName}" style="display:inline-flex;align-items:center;gap:6px;padding:4px 8px;border-radius:6px;font-size:0.75rem;font-weight:500;white-space:nowrap;cursor:pointer;background-color:var(--user-badge-bg, #f3f4f6);color:var(--user-badge-text, #374151);border:1px solid var(--user-badge-border, #d1d5db);max-width:100%;min-width:0;"><div class="vibegridx-user-avatar" style="width:18px;height:18px;border-radius:50%;background-color:var(--user-badge-avatar-bg, #6366f1);color:white;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:600;flex-shrink:0;">${initials}</div><span class="vibegridx-user-name" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;flex:1;">${displayName}</span><span class="vibegridx-user-badge-arrow" style="opacity:0.5;font-size:10px;flex-shrink:0;line-height:1;">\u2197</span></div>`
  }

  private getInitials(name: string): string {
    if (!name) return '?'
    const words = name.trim().split(/\s+/)
    if (words.length === 1) {
      return words[0].charAt(0).toUpperCase()
    }
    return words
      .slice(0, 2)
      .map((word) => word.charAt(0).toUpperCase())
      .join('')
  }

  /** Apply container attrs + pencil icon for navigable badge pattern */
  private applyNavigableAffordance(container: HTMLElement, isEditable: boolean): void {
    container.setAttribute('data-affordance-group', this.affordanceGroup.group)
    container.setAttribute('data-editable', isEditable ? 'true' : 'false')

    if (isEditable) {
      const pencilIcon = document.createElement('span')
      pencilIcon.className = 'vibegridx-user-reference-edit-icon'
      pencilIcon.textContent = '\u270F\uFE0F'
      pencilIcon.style.cssText =
        'opacity: 0; transition: opacity 0.2s; font-size: 14px; flex-shrink: 0; cursor: pointer;'
      pencilIcon.dataset.action = 'edit'
      pencilIcon.dataset.affordanceRole = 'icon'
      pencilIcon.title = 'Edit link'
      container.appendChild(pencilIcon)
    }
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
    group: 'navigable-badge-with-edit-icon',
    whenNotEditable: 'link-only',
  }

  metadata = { category: 'relationship' as const, description: 'User reference cell renderer' }
}

export const userReferenceCellRenderer = new UserReferenceCellRenderer()
