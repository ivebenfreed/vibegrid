/**
 * Image Field Type - Image upload with preview and format validation
 */

import type {
  CellEditor,
  CellFormatter,
  CellRenderer,
  EnhancedColumn,
  VibeGridFieldType,
} from '../../FieldTypeRegistry'

export class ImageRenderer implements CellRenderer {
  render(value: any, column: EnhancedColumn): HTMLElement {
    const container = document.createElement('div')
    container.className = 'vibegridx-cell-image'
    container.style.cssText = 'display: flex; align-items: center; gap: 6px; height: 100%;'

    if (!value) {
      container.innerHTML = '<span style="opacity: 0.6; font-size: 12px;">No image</span>'
      return container
    }

    const imageData = typeof value === 'object' ? value : { url: String(value), name: 'image' }

    const img = document.createElement('img')
    img.src = imageData.url
    img.alt = imageData.name || 'Image'
    img.style.cssText =
      'width: 24px; height: 24px; object-fit: cover; border-radius: 3px; border: 1px solid #d1d5db;'

    const nameSpan = document.createElement('span')
    nameSpan.textContent = imageData.name || 'Image'
    nameSpan.style.cssText =
      'font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;'

    container.appendChild(img)
    container.appendChild(nameSpan)
    return container
  }

  update(element: HTMLElement, value: any): void {
    element.innerHTML = ''
    element.appendChild(this.render(value, {} as any).firstChild as HTMLElement)
  }

  canHandle(column: EnhancedColumn): boolean {
    return (column.cellType || column.type) === 'image'
  }
}

export const ImageFieldType: VibeGridFieldType = {
  type: 'image',
  category: 'basic',
  renderer: new ImageRenderer(),
  editor: new (class implements CellEditor {
    create(value: any, column: EnhancedColumn, onSave: (value: any) => void): HTMLElement {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = 'image/*'
      input.style.cssText = 'width: 100%; height: 100%; font-size: 12px;'
      input.addEventListener('change', () => {
        const file = input.files?.[0]
        if (file) {
          onSave({
            url: `mock://images/${file.name}`,
            name: file.name,
            size: file.size,
            type: file.type,
          })
        }
      })
      return input
    }
    getValue(): any {
      return null
    }
    setValue(): void {}
    validate(): any {
      return { valid: true, errors: [] }
    }
    destroy(): void {}
  })(),
  formatter: new (class implements CellFormatter {
    format(value: any): string {
      return value ? (typeof value === 'object' ? value.name : String(value)) : ''
    }
    parse(): any {
      return null
    }
  })(),
  metadata: {
    supportsSorting: true,
    supportsFiltering: true,
    requiresSpecialEditor: true,
    hasRichDisplay: true,
  },
}

import { fieldTypeRegistry } from '../../FieldTypeRegistry'

fieldTypeRegistry.register('image', ImageFieldType)
