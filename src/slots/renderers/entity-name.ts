/**
 * Entity name cell renderer
 */

import type { Column } from '../../types'
import type { CellRenderer, CellRendererContext } from '../SlotRegistry'
import { applyAffordanceAttrs } from '../applyAffordanceAttrs'
import { isEmpty } from './helpers'
import { highlightMatch } from '../../utils/highlight-text'
import { resolveRecordLabel } from '@/shared/lib/entity-name-utils'

class EntityNameCellRenderer implements CellRenderer {
  render(value: unknown, column: Column, context: CellRendererContext): HTMLElement {
    const container = document.createElement('div')
    const isEditable = column.editable !== false

    container.className = 'vibegridx-cell-entity-name'
    container.dataset.fieldType = 'entity-name'
    container.style.display = 'flex'
    container.style.alignItems = 'center'
    container.style.gap = '8px'
    container.style.width = '100%'
    container.style.height = '100%'

    // Text element (link-styled)
    const textEl = document.createElement('span')
    textEl.className = 'vibegridx-entity-name-text'
    textEl.style.cssText =
      'display: inline-block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; color: var(--primary); text-decoration: none; transition: text-decoration 0.2s;'
    textEl.dataset.action = 'navigate'
    textEl.dataset.affordanceRole = 'link'
    textEl.dataset.fieldType = 'entity-name'

    // The bound column (usually the archetype's `name`) is often empty on synced
    // records whose label lives elsewhere (RFI → subject, Photo → filename).
    // Fall back to the row's conventional label fields before giving up.
    const rowData = (context as { rowData?: Record<string, unknown> }).rowData
    const fallbackLabel = isEmpty(value) && rowData ? resolveRecordLabel(rowData) : null
    const resolvedValue = isEmpty(value) ? fallbackLabel : value

    if (isEmpty(resolvedValue)) {
      textEl.textContent = 'Untitled'
      textEl.style.opacity = '0.5'
      textEl.style.fontStyle = 'italic'
    } else {
      const displayValue = String(resolvedValue)
      // GH#1391: Highlight matching search text
      const searchText = context.searchText as string | undefined
      const highlighted = searchText ? highlightMatch(displayValue, searchText) : null
      if (highlighted) {
        textEl.innerHTML = highlighted
      } else {
        textEl.textContent = displayValue
      }
    }

    container.appendChild(textEl)

    // Pencil icon (shown on hover via CSS) — only when column is editable
    if (isEditable) {
      const pencilIcon = document.createElement('span')
      pencilIcon.className = 'vibegridx-entity-name-edit-icon'
      pencilIcon.innerHTML = '\u270F\uFE0F'
      pencilIcon.style.cssText = 'opacity: 0; transition: opacity 0.2s; font-size: 14px; flex-shrink: 0;'
      pencilIcon.title = 'Click to edit inline'
      pencilIcon.dataset.action = 'edit'
      pencilIcon.dataset.affordanceRole = 'icon'
      container.appendChild(pencilIcon)
    }

    applyAffordanceAttrs(container, this, isEditable)
    return container
  }

  format(value: unknown, _column: Column, context: CellRendererContext): string {
    if (!isEmpty(value)) return String(value)
    // Match render()'s fallback so CSV export and clipboard carry the same label
    // the user sees on screen rather than a blank cell.
    const rowData = (context as { rowData?: Record<string, unknown> }).rowData
    return (rowData ? resolveRecordLabel(rowData) : null) ?? ''
  }

  validate(value: unknown, column: Column, _context: CellRendererContext): string | null {
    if (column.required && isEmpty(value)) {
      return `${column.name || 'Field'} is required`
    }
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
    whenNotEditable: 'link-only',
  }

  metadata = { category: 'basic' as const, description: 'Entity name cell renderer' }
}

export const entityNameCellRenderer = new EntityNameCellRenderer()
