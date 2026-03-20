/**
 * Row expand/collapse cell renderer
 */

import type { Column } from '../../types'
import type { CellRenderer, CellRendererContext } from '../SlotRegistry'
import { applyAffordanceAttrs } from '../applyAffordanceAttrs'

class RowExpandCellRenderer implements CellRenderer {
  render(_value: unknown, _column: Column, _context: CellRendererContext): HTMLElement {
    const container = document.createElement('div')
    container.className = 'vibegridx-expand-cell'

    // RowExpand gets rowData from the context or column's internal state
    // The BodyRenderer passes rowData as the value for this cell type
    const rowData = _value as Record<string, unknown> | null

    const canExpand = rowData?._canExpand !== false
    if (!canExpand || !rowData) {
      return container
    }

    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'vibegridx-expand-button'
    button.setAttribute('data-action', 'expand-row')
    button.setAttribute('data-row-id', String(rowData.id || ''))
    button.setAttribute('aria-label', rowData._isExpanded ? 'Collapse row' : 'Expand row')
    button.setAttribute('aria-expanded', String(!!rowData._isExpanded))

    const chevron = document.createElement('span')
    chevron.className = 'vibegridx-expand-chevron'
    if (rowData._isExpanded) {
      chevron.classList.add('vibegridx-expand-chevron--expanded')
    }
    chevron.textContent = '\u203A' // ›

    button.appendChild(chevron)
    container.appendChild(button)

    applyAffordanceAttrs(container, this, false)
    return container
  }

  format(value: unknown, _column: Column, _context: CellRendererContext): string {
    return value ? '\u25BC' : '\u25B6' // ▼ or ▶
  }

  affordances = {
    sortable: false,
    filterable: false,
    editable: false,
    resizable: false,
    reorderable: false,
    groupable: false,
  }

  interactionPolicy = {
    defaultAction: 'custom' as const,
    editTrigger: 'none' as const,
    blurPolicy: 'commit' as const,
  }

  metadata = { category: 'basic' as const, description: 'Row expand/collapse renderer' }
}

export const rowExpandCellRenderer = new RowExpandCellRenderer()
