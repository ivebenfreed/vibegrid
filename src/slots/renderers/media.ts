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
    img.style.cssText = 'width: 24px; height: 24px; object-fit: cover; border-radius: 3px; border: 1px solid #d1d5db;'

    const nameSpan = document.createElement('span')
    nameSpan.textContent = String(imageData.name || 'Image')
    nameSpan.style.cssText = 'font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;'

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

// ============================================================
// FILE PATH / URL LINK
// ============================================================

/**
 * Renders a stored file path or URL (e.g. `file_path`, `file_url`) as a
 * clickable link that opens the file inline in a new tab.
 *
 *  - Durable R2 keys (`files/{org}/…`, `documents/…`, etc.) link through the
 *    Files worker: `/api/files/view/{encodedKey}` — org-scoped, never expires.
 *  - Already-qualified http(s) URLs link directly (e.g. an external source URL).
 *
 * Wired to the same `data-url-href` + `data-action="navigate"` contract the
 * URL cell uses, so CellActionRouter opens it via `window.open(_, '_blank')`.
 */
class FilePathLinkCellRenderer implements CellRenderer {
  render(value: unknown, column: Column, _context: CellRendererContext): HTMLElement {
    const container = document.createElement('div')
    const isEditable = column.editable !== false

    if (isEmpty(value)) {
      renderEmpty(container, isEditable)
      applyAffordanceAttrs(container, this, isEditable)
      return container
    }

    container.className = 'vibegridx-cell-file-link'
    container.style.cssText = 'display: flex; align-items: center; gap: 6px; width: 100%;'

    const raw = String(value).trim()
    const href = this.toHref(raw)

    const link = document.createElement('span')
    link.className = 'vibegridx-file-link-text'
    link.style.cssText =
      'display: inline-block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; color: #2563eb; text-decoration: underline;'
    link.textContent = this.label(raw)
    link.title = raw
    link.dataset.action = 'navigate'
    link.dataset.affordanceRole = 'link'
    if (href) link.dataset.urlHref = href

    container.appendChild(link)
    applyAffordanceAttrs(container, this, isEditable)
    return container
  }

  format(value: unknown, _column: Column, _context: CellRendererContext): string {
    return value == null ? '' : this.label(String(value).trim())
  }

  /** Build the open-inline href: external URLs pass through; R2 keys go via the Files worker. */
  private toHref(raw: string): string | null {
    if (/^https?:\/\//i.test(raw)) return raw
    // Reject other URI schemes (javascript:, data:, …); real R2 keys have none.
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return null
    // Treat anything else as an R2 object key.
    return `/api/files/view/${encodeURIComponent(raw)}`
  }

  /** Human-friendly label: the file's basename, not the full key/URL. */
  private label(raw: string): string {
    const noQuery = raw.split('?')[0] ?? raw
    const segment = noQuery.split('/').filter(Boolean).pop()
    if (!segment) return raw
    try {
      return decodeURIComponent(segment)
    } catch {
      return segment
    }
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

  metadata = { category: 'basic' as const, description: 'File path/URL link cell renderer' }
}

export const fileCellRenderer = new FileCellRenderer()
export const imageCellRenderer = new ImageCellRenderer()
export const filePathLinkCellRenderer = new FilePathLinkCellRenderer()

/** Column ids that should render as a clickable file link instead of plain text. */
export const FILE_LINK_COLUMN_IDS = new Set(['file_path', 'file_url'])
