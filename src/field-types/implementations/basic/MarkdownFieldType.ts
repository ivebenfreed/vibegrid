/**
 * Markdown Field Type - Markdown with syntax validation and preview
 */

import type {
  CellEditor,
  CellRenderer,
  EnhancedColumn,
  VibeGridFieldType,
} from '../../FieldTypeRegistry'

export class MarkdownRenderer implements CellRenderer {
  render(value: any, column: EnhancedColumn): HTMLElement {
    const container = document.createElement('div')
    container.className = 'vibegridx-cell-markdown'

    if (!value) {
      container.innerHTML = '<span style="opacity: 0.6; font-size: 12px;">No content</span>'
      return container
    }

    const text = String(value)
    const preview = this.createMarkdownPreview(text)
    container.innerHTML = preview
    container.style.cssText =
      'font-size: 12px; line-height: 1.3; max-height: 60px; overflow: hidden;'

    return container
  }

  update(element: HTMLElement, value: any): void {
    if (!value) {
      element.innerHTML = '<span style="opacity: 0.6; font-size: 12px;">No content</span>'
    } else {
      element.innerHTML = this.createMarkdownPreview(String(value))
    }
  }

  canHandle(column: EnhancedColumn): boolean {
    return ((column.cellType || column.type) as string) === 'markdown'
  }

  private createMarkdownPreview(markdown: string): string {
    // Simple markdown preview (in reality would use a markdown parser)
    return markdown
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/^# (.*$)/gm, '<h3>$1</h3>')
      .replace(/^## (.*$)/gm, '<h4>$1</h4>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
      .replace(/\n/g, '<br>')
  }
}

export const MarkdownFieldType: VibeGridFieldType = {
  type: 'markdown',
  category: 'basic',
  renderer: new MarkdownRenderer(),
  editor: new (class implements CellEditor {
    create(value: any, column: EnhancedColumn, onSave: (value: any) => void): HTMLElement {
      const textarea = document.createElement('textarea')
      textarea.value = value || ''
      textarea.rows = 4
      textarea.placeholder = 'Enter markdown...'
      textarea.style.cssText =
        'width: 100%; height: 100%; border: none; outline: none; padding: 4px; font-family: monospace; font-size: 12px;'

      textarea.addEventListener('blur', () => onSave(textarea.value || null))
      setTimeout(() => textarea.focus(), 0)
      return textarea
    }
    getValue(element: HTMLElement): any {
      return (element as HTMLTextAreaElement).value || null
    }
    setValue(element: HTMLElement, value: any): void {
      ;(element as HTMLTextAreaElement).value = value || ''
    }
    validate(): any {
      return { valid: true, errors: [] }
    }
    destroy(): void {}
  })(),
  formatter: new (class {
    format(value: any): string {
      return value || ''
    }
    parse(text: string): any {
      return text.trim() || null
    }
  })(),
  metadata: {
    supportsSorting: true,
    supportsFiltering: true,
    requiresSpecialEditor: true,
    hasRichDisplay: true,
  },

  // 🚀 Interaction policy
  interactionPolicy: {
    defaultAction: 'edit', // Markdown/rich-text fields open editor
    editTrigger: 'content-click', // Click content to edit
    blurPolicy: 'commit', // Save on blur
  },
}

import { fieldTypeRegistry } from '../../FieldTypeRegistry'

fieldTypeRegistry.register('markdown', MarkdownFieldType)
fieldTypeRegistry.register('rich-text', MarkdownFieldType) // With hyphen
fieldTypeRegistry.register('richtext', MarkdownFieldType) // Without hyphen
