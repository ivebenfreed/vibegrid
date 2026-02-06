/**
 * File Field Type Implementation
 *
 * Handles file field types with upload, preview, and metadata display.
 */

import type { FieldTypeAffordance } from '../../../affordances/types'
import type {
  CellEditor,
  CellFormatter,
  CellRenderer,
  CellValidator,
  EnhancedColumn,
  ValidationResult,
  VibeGridFieldType,
} from '../../FieldTypeRegistry'

interface FileValue {
  url: string
  name: string
  size?: number
  type?: string
  metadata?: Record<string, any>
}

export class FileRenderer implements CellRenderer {
  render(value: any, column: EnhancedColumn, _rowData: any): HTMLElement {
    const container = document.createElement('div')
    const isEditable = column.editable !== false

    // Add affordance data attributes
    container.dataset.affordance = isEditable ? 'edit' : 'none'
    container.dataset.affordanceRole = 'badge'

    container.className = 'vibegridx-cell-file'

    // Handle null/undefined values with consistent empty state
    if (value == null || value === '') {
      if (!isEditable) {
        container.className = 'vibegridx-cell-empty'
        container.textContent = ''
      } else {
        container.className = 'vibegridx-cell-empty'
        container.innerHTML = '<span style="opacity: 0.6;">Edit ✏️</span>'
      }
      return container
    }

    const fileData = this.parseFileValue(value)
    container.innerHTML = this.createFileDisplay(fileData)
    container.style.cssText = 'display: flex; align-items: center; gap: 6px;'

    return container
  }

  update(element: HTMLElement, value: any, column: EnhancedColumn): void {
    const isEditable = column.editable !== false

    // Update affordance attributes
    element.dataset.affordance = isEditable ? 'edit' : 'none'
    element.dataset.affordanceRole = 'badge'

    element.className = 'vibegridx-cell-file'

    // Handle empty values with consistent empty state
    if (value == null || value === '') {
      if (!isEditable) {
        element.className = 'vibegridx-cell-empty'
        element.textContent = ''
      } else {
        element.className = 'vibegridx-cell-empty'
        element.innerHTML = '<span style="opacity: 0.6;">Edit ✏️</span>'
      }
    } else {
      const fileData = this.parseFileValue(value)
      element.innerHTML = this.createFileDisplay(fileData)
    }
  }

  canHandle(column: EnhancedColumn): boolean {
    return ((column.cellType || column.type) as string) === 'file'
  }

  private parseFileValue(value: any): FileValue {
    if (typeof value === 'object' && value !== null) {
      return {
        url: value.url || '',
        name: value.name || 'Unknown file',
        size: value.size,
        type: value.type,
        metadata: value.metadata,
      }
    }

    if (typeof value === 'string') {
      const fileName = value.split('/').pop() || 'file'
      return {
        url: value,
        name: fileName,
        size: undefined,
        type: this.getFileTypeFromName(fileName),
      }
    }

    return { url: '', name: 'Invalid file' }
  }

  private createFileDisplay(fileData: FileValue): string {
    const icon = this.getFileIcon(fileData.type)
    const sizeText = fileData.size ? this.formatFileSize(fileData.size) : ''

    return `
      <span style="font-size: 14px;">${icon}</span>
      <div style="flex: 1; min-width: 0;">
        <div style="font-weight: 500; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
          ${fileData.name}
        </div>
        ${sizeText ? `<div style="font-size: 10px; color: #6b7280;">${sizeText}</div>` : ''}
      </div>
    `
  }

  private getFileIcon(type?: string): string {
    if (!type) return '📄'

    if (type.startsWith('image/')) return '🖼️'
    if (type.startsWith('video/')) return '🎥'
    if (type.startsWith('audio/')) return '🎵'
    if (type.includes('pdf')) return '📕'
    if (type.includes('word')) return '📘'
    if (type.includes('excel') || type.includes('spreadsheet')) return '📊'
    if (type.includes('powerpoint') || type.includes('presentation')) return '📋'
    if (type.includes('zip') || type.includes('archive')) return '📦'

    return '📄'
  }

  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B'

    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))

    return `${parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`
  }

  private getFileTypeFromName(fileName: string): string {
    const ext = fileName.split('.').pop()?.toLowerCase()

    const typeMap: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      pdf: 'application/pdf',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xls: 'application/vnd.ms-excel',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      zip: 'application/zip',
      txt: 'text/plain',
    }

    return typeMap[ext || ''] || 'application/octet-stream'
  }
}

export class FileEditor implements CellEditor {
  private onSaveCallback: ((value: any) => void) | null = null

  create(_value: any, _column: EnhancedColumn, onSave: (value: any) => void): HTMLElement {
    this.onSaveCallback = onSave

    const container = document.createElement('div')
    container.className = 'vibegridx-file-editor'
    container.style.cssText = `
      width: 100%; height: 100%; display: flex; align-items: center; gap: 8px;
      background: #f9fafb; border: 2px dashed #d1d5db; border-radius: 4px; padding: 4px 8px;
    `

    const fileInput = document.createElement('input')
    fileInput.type = 'file'
    fileInput.style.cssText = 'flex: 1; font-size: 12px;'

    const uploadButton = document.createElement('button')
    uploadButton.textContent = 'Upload'
    uploadButton.style.cssText = `
      padding: 2px 8px; font-size: 12px; background: #3b82f6; color: white;
      border: none; border-radius: 3px; cursor: pointer;
    `

    fileInput.addEventListener('change', () => this.handleFileSelect(fileInput))
    uploadButton.addEventListener('click', () => fileInput.click())

    this.currentElement = container
    container.appendChild(fileInput)
    container.appendChild(uploadButton)

    return container
  }

  getValue(element: HTMLElement): any {
    const fileInput = element.querySelector('input[type="file"]') as HTMLInputElement
    const file = fileInput?.files?.[0]

    if (!file) return null

    // In a real implementation, this would upload the file and return the URL
    return {
      url: `mock://uploads/${file.name}`,
      name: file.name,
      size: file.size,
      type: file.type,
    }
  }

  setValue(_element: HTMLElement, _value: any): void {
    // File inputs can't be programmatically set for security reasons
  }

  validate(value: any, column: EnhancedColumn): ValidationResult {
    const errors: string[] = []

    if (value == null) {
      if (column.validation?.required) {
        errors.push(`${column.name} is required`)
      }
      return { valid: errors.length === 0, errors, transformedValue: null }
    }

    const fileData = typeof value === 'object' ? value : { size: 0, type: '' }

    // Size validation
    if (column.validation?.fileMaxSize && fileData.size > column.validation.fileMaxSize) {
      errors.push(`${column.name} file size exceeds ${column.validation.fileMaxSize} bytes`)
    }

    // Type validation
    if (column.validation?.fileAllowedTypes && fileData.type) {
      const allowed = column.validation.fileAllowedTypes
      if (!allowed.some((type: string) => fileData.type.includes(type))) {
        errors.push(`${column.name} file type not allowed. Allowed: ${allowed.join(', ')}`)
      }
    }

    return { valid: errors.length === 0, errors, transformedValue: value }
  }

  destroy(_element: HTMLElement): void {
    this.currentElement = null
    this.onSaveCallback = null
  }

  supportsInlineEditing(): boolean {
    return true
  }
  supportsModalEditing(): boolean {
    return true
  }

  private handleFileSelect(fileInput: HTMLInputElement): void {
    if (this.onSaveCallback && fileInput.files?.[0]) {
      const file = fileInput.files[0]
      const fileData = {
        url: `mock://uploads/${file.name}`,
        name: file.name,
        size: file.size,
        type: file.type,
      }
      this.onSaveCallback(fileData)
    }
  }
}

export const FileFieldType: VibeGridFieldType = {
  type: 'file',
  category: 'basic',
  renderer: new FileRenderer(),
  editor: new FileEditor(),
  formatter: new (class implements CellFormatter {
    format(value: any): string {
      if (!value) return ''
      const fileData = typeof value === 'object' ? value : { name: String(value) }
      return fileData.name || 'Unknown file'
    }
    parse(text: string): any {
      return text.trim() || null
    }
  })(),
  validator: new (class implements CellValidator {
    validate(value: any, column: EnhancedColumn): ValidationResult {
      const editor = new FileEditor()
      return editor.validate(value, column)
    }
    getConstraints(): Record<string, any> {
      return { format: 'file', supportsUpload: true }
    }
  })(),
  metadata: {
    supportsSorting: true,
    supportsFiltering: true,
    supportsGrouping: true,
    requiresSpecialEditor: true,
    hasRichDisplay: true,
    supportsValidation: true,
  },
  getFormatter() {
    const fmt = this.formatter
    return (value: any, _rowData?: any, column?: any) => fmt.format(value, column)
  },

  // 🎯 Affordance Group System
  affordance: {
    group: 'editable-badge',
    whenNotEditable: 'readonly-badge',
  } as FieldTypeAffordance,
}

import { fieldTypeRegistry } from '../../FieldTypeRegistry'

fieldTypeRegistry.register('file', FileFieldType)
