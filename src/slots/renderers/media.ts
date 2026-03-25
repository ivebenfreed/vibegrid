/**
 * Media cell renderers: File, Image
 */

import type { Column } from '../../types'
import type { CellRenderer, CellRendererContext } from '../SlotRegistry'
import { applyAffordanceAttrs } from '../applyAffordanceAttrs'
import { isEmpty, renderEmpty } from './helpers'

// ============================================================
// FILE
// ============================================================

class FileCellRenderer implements CellRenderer {
  render(value: unknown, column: Column, _context: CellRendererContext): HTMLElement {
    const el = document.createElement('div')
    const isEditable = column.editable !== false

    if (isEmpty(value)) {
      renderEmpty(el, isEditable)
      applyAffordanceAttrs(el, this, isEditable)
      return el
    }

    el.className = 'vibegridx-cell-file'
    el.style.cssText = 'display: flex; align-items: center; gap: 6px;'

    const fileData = this.parseFileValue(value)
    const icon = this.getFileIcon(fileData.type)
    const sizeText = fileData.size ? this.formatFileSize(fileData.size) : ''

    el.innerHTML = `
      <span style="font-size: 14px;">${icon}</span>
      <div style="flex: 1; min-width: 0;">
        <div style="font-weight: 500; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
          ${fileData.name}
        </div>
        ${sizeText ? `<div style="font-size: 10px; color: #6b7280;">${sizeText}</div>` : ''}
      </div>
    `

    applyAffordanceAttrs(el, this, isEditable)
    return el
  }

  format(value: unknown, _column: Column, _context: CellRendererContext): string {
    if (value == null) return ''
    const fileData = this.parseFileValue(value)
    return fileData.name
  }

  private parseFileValue(value: unknown): {
    url: string
    name: string
    size?: number
    type?: string
  } {
    if (typeof value === 'object' && value !== null) {
      const obj = value as Record<string, unknown>
      return {
        url: String(obj.url || ''),
        name: String(obj.name || 'Unknown file'),
        size: obj.size as number | undefined,
        type: obj.type as string | undefined,
      }
    }
    if (typeof value === 'string') {
      const fileName = value.split('/').pop() || 'file'
      return { url: value, name: fileName }
    }
    return { url: '', name: 'Invalid file' }
  }

  private getFileIcon(type?: string): string {
    if (!type) return '\uD83D\uDCC4' // 📄
    if (type.startsWith('image/')) return '\uD83D\uDDBC\uFE0F' // 🖼️
    if (type.startsWith('video/')) return '\uD83C\uDFA5' // 🎥
    if (type.startsWith('audio/')) return '\uD83C\uDFB5' // 🎵
    if (type.includes('pdf')) return '\uD83D\uDCD5' // 📕
    return '\uD83D\uDCC4' // 📄
  }

  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${Number.parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`
  }

  affordances = {
    sortable: true,
    filterable: true,
    editable: false,
    resizable: true,
    reorderable: true,
    groupable: false,
  }

  interactionPolicy = {
    defaultAction: 'custom' as const,
    editTrigger: 'none' as const,
    blurPolicy: 'commit' as const,
  }

  metadata = { category: 'basic' as const, description: 'File cell renderer' }
}

// ============================================================
// IMAGE
// ============================================================

class ImageCellRenderer implements CellRenderer {
  render(value: unknown, column: Column, _context: CellRendererContext): HTMLElement {
    const el = document.createElement('div')
    const isEditable = column.editable !== false

    el.className = 'vibegridx-cell-image'
    el.style.cssText = 'display: flex; align-items: center; gap: 6px; height: 100%;'

    if (!value) {
      el.innerHTML = '<span style="opacity: 0.6; font-size: 12px;">No image</span>'
      applyAffordanceAttrs(el, this, isEditable)
      return el
    }

    const imageData =
      typeof value === 'object' && value !== null
        ? (value as Record<string, unknown>)
        : { url: String(value), name: 'image' }

    const img = document.createElement('img')
    img.src = String(imageData.url || '')
    img.alt = String(imageData.name || 'Image')
    img.style.cssText =
      'width: 24px; height: 24px; object-fit: cover; border-radius: 3px; border: 1px solid #d1d5db;'

    const nameSpan = document.createElement('span')
    nameSpan.textContent = String(imageData.name || 'Image')
    nameSpan.style.cssText =
      'font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;'

    el.appendChild(img)
    el.appendChild(nameSpan)

    applyAffordanceAttrs(el, this, isEditable)
    return el
  }

  format(value: unknown, _column: Column, _context: CellRendererContext): string {
    if (value == null) return ''
    if (typeof value === 'object' && value !== null) {
      return String((value as Record<string, unknown>).name || '')
    }
    return String(value)
  }

  affordances = {
    sortable: true,
    filterable: true,
    editable: false,
    resizable: true,
    reorderable: true,
    groupable: false,
  }

  interactionPolicy = {
    defaultAction: 'custom' as const,
    editTrigger: 'none' as const,
    blurPolicy: 'commit' as const,
  }

  metadata = { category: 'basic' as const, description: 'Image cell renderer' }
}

export const fileCellRenderer = new FileCellRenderer()
export const imageCellRenderer = new ImageCellRenderer()
