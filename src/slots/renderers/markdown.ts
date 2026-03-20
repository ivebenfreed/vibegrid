/**
 * Markdown cell renderer
 */

import type { Column } from '../../types'
import type { CellRenderer, CellRendererContext } from '../SlotRegistry'
import { applyAffordanceAttrs } from '../applyAffordanceAttrs'
import { renderEmpty } from './helpers'

class MarkdownCellRenderer implements CellRenderer {
  render(value: unknown, column: Column, _context: CellRendererContext): HTMLElement {
    const el = document.createElement('div')
    const isEditable = column.editable !== false

    el.className = 'vibegridx-cell-markdown'

    if (!value) {
      renderEmpty(el, isEditable)
      applyAffordanceAttrs(el, this, isEditable)
      return el
    }

    const text = String(value)
    // Wrap markdown HTML in a content span with data-action for click routing
    const content = document.createElement('span')
    content.dataset.action = isEditable ? 'edit' : 'none'
    content.dataset.affordanceRole = 'content'
    content.innerHTML = this.createMarkdownPreview(text)
    content.style.cssText =
      'font-size: 12px; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; text-overflow: ellipsis;'
    el.appendChild(content)

    applyAffordanceAttrs(el, this, isEditable)
    return el
  }

  format(value: unknown, _column: Column, _context: CellRendererContext): string {
    return value ? String(value) : ''
  }

  private createMarkdownPreview(markdown: string): string {
    return markdown
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/^# (.*$)/gm, '<h3>$1</h3>')
      .replace(/^## (.*$)/gm, '<h4>$1</h4>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
      .replace(/\n/g, '<br>')
  }

  affordances = {
    sortable: true,
    filterable: true,
    editable: true,
    resizable: true,
    reorderable: true,
    groupable: false,
  }

  affordanceGroup = { group: 'editable-content', whenNotEditable: 'readonly-display' }

  interactionPolicy = {
    defaultAction: 'edit' as const,
    editTrigger: 'content-click' as const,
    blurPolicy: 'commit' as const,
  }

  metadata = { category: 'basic' as const, description: 'Markdown cell renderer' }
}

export const markdownCellRenderer = new MarkdownCellRenderer()
