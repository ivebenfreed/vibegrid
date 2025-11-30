/**
 * TextArea Field Type - Multi-line text with word/character limits
 */

import type {
  CellEditor,
  CellRenderer,
  EnhancedColumn,
  VibeGridFieldType,
} from '../../FieldTypeRegistry'

export class TextAreaRenderer implements CellRenderer {
  render(value: any, column: EnhancedColumn): HTMLElement {
    const container = document.createElement('span')

    // Add hover class based on editability (plain text hover pattern)
    const hoverClass =
      column.editable === false ? 'vibegridx-text-readonly' : 'vibegridx-text-editable'
    container.className = `vibegridx-cell-textarea ${hoverClass}`

    container.style.cssText = `
      padding: 4px;
      font-size: 13px;
      line-height: 1.4;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      display: block;
    `

    // Handle null/undefined values with consistent empty state
    if (value == null || value === '') {
      if (column.editable === false) {
        container.className = 'vibegridx-cell-empty'
        container.textContent = ''
      } else {
        container.className = 'vibegridx-cell-empty vibegridx-text-editable'
        container.innerHTML = '<span style="opacity: 0.6;">Edit ✏️</span>'
      }
      return container
    }

    const text = String(value)
    // Convert newlines to spaces for single-line display
    const singleLineText = text.replace(/\s+/g, ' ').trim()

    container.textContent = singleLineText
    container.title = text // Full text on hover (preserves original formatting)

    return container
  }

  update(element: HTMLElement, value: any, column: EnhancedColumn): void {
    // Handle empty values with consistent empty state
    if (value == null || value === '') {
      if (column.editable === false) {
        element.className = 'vibegridx-cell-empty'
        element.textContent = ''
      } else {
        element.className = 'vibegridx-cell-empty vibegridx-text-editable'
        element.innerHTML = '<span style="opacity: 0.6;">Edit ✏️</span>'
      }
    } else {
      element.style.opacity = '1'
      element.style.fontSize = '13px'
      const text = String(value)
      // Convert newlines to spaces for single-line display
      const singleLineText = text.replace(/\s+/g, ' ').trim()
      element.textContent = singleLineText
      element.title = text // Full text on hover (preserves original formatting)
    }
  }

  canHandle(column: EnhancedColumn): boolean {
    const type = column.cellType || column.type || ''
    return ['textarea', 'longtext'].includes(type)
  }
}

export class TextAreaEditor implements CellEditor {
  create(value: any, column: EnhancedColumn, onSave: (value: any) => void): HTMLElement {
    const textarea = document.createElement('textarea')
    textarea.value = value || ''
    textarea.rows = column.editor?.rows || 3
    textarea.style.cssText = `
      width: 100%; height: 100%; border: none; outline: none; background: transparent;
      font-family: inherit; font-size: inherit; padding: 4px; margin: 0; resize: none;
    `

    if (column.validation?.maxLength) {
      textarea.maxLength = column.validation.maxLength
    }

    textarea.addEventListener('blur', () => onSave(textarea.value || null))
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        textarea.blur()
      }
    })

    setTimeout(() => textarea.focus(), 0)
    return textarea
  }

  getValue(element: HTMLElement): any {
    return (element as HTMLTextAreaElement).value || null
  }

  setValue(element: HTMLElement, value: any): void {
    ;(element as HTMLTextAreaElement).value = value || ''
  }

  validate(value: any, column: EnhancedColumn): any {
    const errors: string[] = []
    const text = String(value || '')

    if (column.validation?.required && !text.trim()) {
      errors.push(`${column.name} is required`)
    }

    if (column.validation?.maxLength && text.length > column.validation.maxLength) {
      errors.push(`${column.name} must be no more than ${column.validation.maxLength} characters`)
    }

    return { valid: errors.length === 0, errors, transformedValue: value }
  }

  destroy(): void {}
  supportsInlineEditing(): boolean {
    return true
  }
  supportsModalEditing(): boolean {
    return true
  }
}

export const TextAreaFieldType: VibeGridFieldType = {
  type: 'textarea',
  category: 'basic',
  renderer: new TextAreaRenderer(),
  editor: new TextAreaEditor(),
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
    supportsGrouping: true,
    requiresSpecialEditor: true,
    hasRichDisplay: true,
  },
  getFormatter() {
    const fmt = this.formatter
    return (value: any, _rowData?: any, column?: any) => fmt.format(value, column)
  },

  // 🚀 Interaction policy
  interactionPolicy: {
    defaultAction: 'edit', // Textarea fields are for editing
    editTrigger: 'content-click', // Click content to edit
    blurPolicy: 'commit', // Save on blur
  },
}

import { fieldTypeRegistry } from '../../FieldTypeRegistry'

fieldTypeRegistry.register('textarea', TextAreaFieldType)
fieldTypeRegistry.register('longtext', TextAreaFieldType)
