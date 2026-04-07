/**
 * Entity reference cell renderer
 */

import type { Column } from '../../types'
import type { CellRenderer, CellRendererContext } from '../SlotRegistry'
import { applyAffordanceAttrs } from '../applyAffordanceAttrs'
import { getResolvedDisplayName, isEmpty, renderEmpty } from './helpers'

class EntityReferenceCellRenderer implements CellRenderer {
  render(value: unknown, column: Column, context: CellRendererContext): HTMLElement {
    const container = document.createElement('div')
    const isEditable = column.editable !== false

    container.className = 'vibegridx-entity-reference'
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

    // Multi-value handling: array of entity IDs
    if (Array.isArray(value) && value.length >= 2) {
      return this.renderMultiValue(value, column, context, container, isEditable)
    }

    // Unwrap single-element arrays
    const singleValue = Array.isArray(value) ? value[0] : value

    // Resolve the raw entity ID for data attributes
    const rawEntityId =
      typeof singleValue === 'string'
        ? singleValue
        : typeof singleValue === 'object' && singleValue !== null && 'id' in singleValue
          ? String((singleValue as Record<string, unknown>).id)
          : String(singleValue)

    const rowData = (context as Record<string, unknown>).rowData as Record<string, unknown> | undefined

    // Check for backend-resolved display name (_name suffix from UnifiedResolver)
    const resolvedDisplayName = getResolvedDisplayName(rowData, column, context as Record<string, unknown>)
    if (resolvedDisplayName) {
      container.innerHTML = this.createEntityBadge(resolvedDisplayName, column, rawEntityId)
      this.applyNavigableAffordance(container, isEditable)
      return container
    }

    if (rowData) {
      // Legacy: check __resolved_ prefix (deprecated, kept as fallback)
      const resolvedValue = rowData[`__resolved_${column.id}`]
      if (resolvedValue) {
        const name =
          typeof resolvedValue === 'object' && resolvedValue !== null
            ? String(
                (resolvedValue as Record<string, unknown>).name ||
                  (resolvedValue as Record<string, unknown>).title ||
                  singleValue,
              )
            : String(resolvedValue)
        container.innerHTML = this.createEntityBadge(name, column, rawEntityId)
        this.applyNavigableAffordance(container, isEditable)
        return container
      }
    }

    // If singleValue is an object with .name or .title, use that
    if (typeof singleValue === 'object' && singleValue !== null) {
      const candidate = (singleValue as Record<string, unknown>).name || (singleValue as Record<string, unknown>).title
      if (candidate) {
        container.innerHTML = this.createEntityBadge(String(candidate), column, rawEntityId)
        this.applyNavigableAffordance(container, isEditable)
        return container
      }
    }

    // Unresolved UUID - try async resolution via TableCoreStore
    const entityId = String(singleValue)
    const tableCoreStore = (context as Record<string, any>).tableCoreStore as
      | {
          getEntityReferenceRecord: (t: string, id: string) => any
          ensureEntityReferenceRecord: (t: string, id: string) => Promise<any>
        }
      | undefined
    const targetEntity =
      (column as any).relationshipConfig?.targetEntityType ||
      (column as any).relationshipTargetEntity ||
      (column as any).targetEntityType ||
      null

    if (tableCoreStore && targetEntity) {
      // Check synchronous cache first
      const cached = tableCoreStore.getEntityReferenceRecord(targetEntity, entityId)
      if (cached) {
        const name = cached.name || cached.title || `${targetEntity} ${entityId.slice(-4)}`
        container.innerHTML = this.createEntityBadge(String(name), column, entityId)
        this.applyNavigableAffordance(container, isEditable)
        return container
      }

      // Async resolve — show placeholder, update when data arrives
      // Don't apply navigable affordance (pencil icon) during loading state
      container.textContent = 'Loading...'
      container.style.opacity = '0.6'

      tableCoreStore
        .ensureEntityReferenceRecord(targetEntity, entityId)
        .then((record: any) => {
          if (record) {
            const name = record.name || record.title || `${targetEntity} ${entityId.slice(-4)}`
            container.innerHTML = this.createEntityBadge(String(name), column, entityId)
            this.applyNavigableAffordance(container, isEditable)
            container.style.opacity = '1'
          } else {
            container.textContent = `${targetEntity} ${entityId.slice(-4)}`
            container.style.opacity = '0.6'
          }
        })
        .catch(() => {
          container.textContent = `${targetEntity} ${entityId.slice(-4)}`
          container.style.opacity = '0.6'
        })
      return container
    }

    // No store or target entity — show truncated ID
    container.textContent = entityId.length > 8 ? `${entityId.slice(-8)}` : String(singleValue)
    container.style.opacity = '0.6'
    applyAffordanceAttrs(container, this, isEditable)
    return container
  }

  /** Apply container attrs + pencil icon for navigable badge pattern */
  private applyNavigableAffordance(container: HTMLElement, isEditable: boolean): void {
    // Set container-level attributes for CSS (but NOT data-affordance — that lives on child elements)
    container.setAttribute('data-affordance-group', this.affordanceGroup.group)
    container.setAttribute('data-editable', isEditable ? 'true' : 'false')

    // Append pencil edit icon when editable
    if (isEditable) {
      const pencilIcon = document.createElement('span')
      pencilIcon.className = 'vibegridx-entity-reference-edit-icon'
      pencilIcon.textContent = '\u270F\uFE0F'
      pencilIcon.style.cssText =
        'opacity: 0; transition: opacity 0.2s; font-size: 14px; flex-shrink: 0; cursor: pointer;'
      pencilIcon.dataset.action = 'edit'
      pencilIcon.dataset.affordanceRole = 'icon'
      pencilIcon.title = 'Edit link'
      container.appendChild(pencilIcon)
    }
  }

  /** Render multi-value relationship cell: first badge + "+N more" overflow */
  private renderMultiValue(
    values: unknown[],
    column: Column,
    context: CellRendererContext,
    container: HTMLElement,
    isEditable: boolean,
  ): HTMLElement {
    // Render first badge using single-value path
    const firstId = String(values[0])
    const rowData = (context as Record<string, unknown>).rowData as Record<string, unknown> | undefined
    const resolvedName = getResolvedDisplayName(rowData, column, context as Record<string, unknown>)
    const displayName = resolvedName ?? firstId.slice(-4)
    container.innerHTML = this.createEntityBadge(displayName, column, firstId)

    // "+N more" overflow badge
    const overflowCount = values.length - 1
    const overflowBadge = document.createElement('span')
    overflowBadge.className = 'vibegridx-entity-overflow-badge'
    overflowBadge.textContent = `+${overflowCount} more`
    overflowBadge.style.cssText =
      'display:inline-flex;align-items:center;padding:2px 6px;border-radius:4px;font-size:0.7rem;font-weight:500;cursor:pointer;color:var(--entity-badge-text, #0369a1);background-color:var(--entity-badge-bg, #f0f9ff);border:1px solid var(--entity-badge-border, #bae6fd);white-space:nowrap;'
    overflowBadge.dataset.affordanceRole = 'overflow-trigger'

    // Hover on overflow badge shows popover with all entity badges.
    // Popover is created once (lazily) and shown/hidden to avoid DOM churn.
    let popover: HTMLElement | null = null
    let hideTimeout: ReturnType<typeof setTimeout> | null = null

    // Lazy-render: only create badge DOM for visible items.
    // Renders an initial batch, then appends more as user scrolls near the bottom.
    const BATCH_SIZE = 20
    let renderedCount = 0

    // Per-entity name resolution for multi-value (GH#2439 B12)
    const tableCoreStore = (context as Record<string, any>).tableCoreStore as
      | {
          getEntityReferenceRecord: (t: string, id: string) => any
          ensureEntityReferenceRecord: (t: string, id: string) => Promise<any>
        }
      | undefined
    const targetEntity =
      (column as any).relationshipConfig?.targetEntityType ||
      (column as any).relationshipTargetEntity ||
      (column as any).targetEntityType ||
      null

    const resolveEntityName = (entityId: string): string => {
      // Try rowData _name field for first entity only (backend only resolves single-value)
      if (rowData) {
        const nameKey = `${column.id}_name`
        const nameFromData = rowData[nameKey]
        // Only use rowData name for the first entity (it's a single value, not per-entity)
        if (nameFromData && entityId === firstId) return String(nameFromData)
      }
      // Try tableCoreStore cache
      if (tableCoreStore && targetEntity) {
        const cached = tableCoreStore.getEntityReferenceRecord(targetEntity, entityId)
        if (cached) return cached.name || cached.title || entityId.slice(-4)
      }
      return entityId.slice(-4)
    }

    const renderBatch = (pop: HTMLElement, count: number): void => {
      const end = Math.min(renderedCount + count, values.length)
      for (let i = renderedCount; i < end; i++) {
        const eid = String(values[i])
        const displayName = resolveEntityName(eid)
        const wrapper = document.createElement('div')
        wrapper.innerHTML = this.createEntityBadge(displayName, column, eid)
        const badge = wrapper.firstElementChild as HTMLElement
        if (badge) {
          pop.appendChild(badge)
          // Trigger async resolution for cache misses
          if (tableCoreStore && targetEntity && displayName === eid.slice(-4)) {
            tableCoreStore.ensureEntityReferenceRecord(targetEntity, eid).then((record: any) => {
              if (record && badge) {
                const name = record.name || record.title || eid.slice(-4)
                const nameEl = badge.querySelector('.vibegridx-entity-name')
                if (nameEl) nameEl.textContent = name
                badge.title = name
              }
            }).catch(() => { /* graceful degradation */ })
          }
        }
      }
      renderedCount = end
    }

    const ensurePopover = (): HTMLElement => {
      if (popover) return popover

      popover = document.createElement('div')
      popover.className = 'vibegridx-entity-overflow-popover'
      popover.style.cssText =
        'position:fixed;z-index:9999;display:flex;flex-direction:column;gap:4px;padding:8px;border-radius:8px;border:1px solid var(--border, #e5e7eb);background-color:var(--card, white);box-shadow:0 4px 12px rgba(0,0,0,0.15);max-height:200px;max-width:320px;overflow-y:auto;'

      // Render first batch only
      renderBatch(popover, BATCH_SIZE)

      // Load more as user scrolls near bottom
      popover.addEventListener('scroll', () => {
        if (renderedCount >= values.length) return
        const el = popover!
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 40) {
          renderBatch(el, BATCH_SIZE)
        }
      })

      popover.addEventListener('mouseenter', () => {
        if (hideTimeout) clearTimeout(hideTimeout)
      })
      popover.addEventListener('mouseleave', () => {
        hideTimeout = setTimeout(hidePopover, 150)
      })

      document.body.appendChild(popover)
      return popover
    }

    const showPopover = () => {
      if (hideTimeout) clearTimeout(hideTimeout)
      const el = ensurePopover()
      const rect = overflowBadge.getBoundingClientRect()
      el.style.left = `${rect.left}px`
      el.style.top = `${rect.bottom + 4}px`
      el.style.display = 'flex'
    }

    const hidePopover = () => {
      if (popover) {
        popover.style.display = 'none'
      }
    }

    overflowBadge.addEventListener('mouseenter', showPopover)
    overflowBadge.addEventListener('mouseleave', () => {
      hideTimeout = setTimeout(hidePopover, 150)
    })

    container.appendChild(overflowBadge)
    this.applyNavigableAffordance(container, isEditable)
    return container
  }

  format(value: unknown, column: Column, context: CellRendererContext): string {
    if (isEmpty(value)) return ''

    const rowData = (context as Record<string, unknown>).rowData as Record<string, unknown> | undefined

    const resolvedDisplayName2 = getResolvedDisplayName(rowData, column, context as Record<string, unknown>)
    if (resolvedDisplayName2) return resolvedDisplayName2

    if (rowData) {
      const resolvedValue = rowData[`__resolved_${column.id}`]
      if (resolvedValue) {
        if (typeof resolvedValue === 'object' && resolvedValue !== null) {
          return String(
            (resolvedValue as Record<string, unknown>).name ||
              (resolvedValue as Record<string, unknown>).title ||
              value,
          )
        }
        return String(resolvedValue)
      }
    }

    if (typeof value === 'object' && value !== null) {
      const candidate = (value as Record<string, unknown>).name || (value as Record<string, unknown>).title
      if (candidate) return String(candidate)
    }

    return String(value)
  }

  private createEntityBadge(displayName: string, column: Column, entityId?: string): string {
    const targetEntity =
      ((column as any).relationshipConfig?.targetEntityType as string | undefined) ||
      ((column as any).relationshipTargetEntity as string | undefined) ||
      ((column as any).targetEntityType as string | undefined)
    const iconLetter = (targetEntity || displayName).charAt(0).toUpperCase()
    const entityTypeAttr = targetEntity ? ` data-entity-type="${targetEntity}"` : ''
    const entityIdAttr = entityId ? ` data-entity-id="${entityId}"` : ''

    return `<div class="vibegridx-entity-badge" data-affordance="navigate" data-action="navigate"${entityTypeAttr}${entityIdAttr} title="${displayName}" style="display:inline-flex;align-items:center;gap:6px;padding:4px 8px;border-radius:6px;font-size:0.75rem;font-weight:500;white-space:nowrap;cursor:pointer;background-color:var(--entity-badge-bg, #f0f9ff);color:var(--entity-badge-text, #0369a1);border:1px solid var(--entity-badge-border, #bae6fd);max-width:100%;min-width:0;"><div class="vibegridx-entity-icon" style="width:14px;height:14px;border-radius:3px;background-color:var(--entity-badge-icon-bg, #0ea5e9);color:white;display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:600;flex-shrink:0;">${iconLetter}</div><span class="vibegridx-entity-name" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;flex:1;">${displayName}</span><span class="vibegridx-entity-badge-arrow" style="opacity:0.5;font-size:10px;flex-shrink:0;line-height:1;">\u2197</span></div>`
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

  metadata = { category: 'relationship' as const, description: 'Entity reference cell renderer' }
}

export const entityReferenceCellRenderer = new EntityReferenceCellRenderer()
