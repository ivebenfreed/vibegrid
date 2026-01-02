// ====================================
// CELL RENDERING UTILITIES
// ====================================
// Extracted shared cell rendering utilities for unified renderer

import type { Column } from '../../types'

const CELL_HEIGHT = 40

/**
 * Create cell element with base styles
 */
export function createCellElement(
  rowId: string,
  column: Column,
  width: number,
  height: number = CELL_HEIGHT,
): HTMLElement {
  const cell = document.createElement('div')
  cell.className = 'vibegridx-cell'
  cell.dataset.rowId = rowId
  cell.dataset.columnId = column.id

  Object.assign(cell.style, {
    position: 'relative',
    width: `${width}px`,
    height: `${height}px`,
    borderRight: '1px solid var(--border)',
    flexShrink: '0',
    overflow: 'hidden',
    minWidth: '0',
  })

  return cell
}

/**
 * Create checkbox element for selection
 */
export function createCheckbox(checked: boolean): HTMLElement {
  const wrapper = document.createElement('label')
  wrapper.className = 'vibegridx-checkbox-wrapper'
  wrapper.style.cssText = `
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    cursor: pointer;
  `

  const checkbox = document.createElement('input')
  checkbox.type = 'checkbox'
  checkbox.className = 'vibegridx-checkbox'
  checkbox.checked = checked
  checkbox.style.cssText = `
    width: 16px;
    height: 16px;
    cursor: pointer;
  `

  const custom = document.createElement('span')
  custom.className = 'vibegridx-checkbox-custom'

  wrapper.appendChild(checkbox)
  wrapper.appendChild(custom)

  return wrapper
}

/**
 * Format cell value for display
 */
export function formatCellValue(value: any, column: Column): string {
  if (value == null) return ''

  // Use column formatter if available
  if (column.formatter) {
    return column.formatter(value)
  }

  // Default formatting based on type
  if (value instanceof Date) {
    return value.toLocaleDateString()
  }

  if (typeof value === 'boolean') {
    return value ? '✓' : ''
  }

  if (typeof value === 'object') {
    return JSON.stringify(value)
  }

  return String(value)
}

/**
 * Create text content element for cell
 */
export function createCellContent(
  value: any,
  column: Column,
  rowData?: Record<string, any>,
): HTMLElement {
  const content = document.createElement('div')
  content.className = 'vibegridx-cell-content'
  content.style.cssText = `
    padding: 0 12px;
    display: flex;
    align-items: center;
    height: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  `

  // Apply column alignment
  if (column.align) {
    content.style.justifyContent =
      column.align === 'right' ? 'flex-end' : column.align === 'center' ? 'center' : 'flex-start'
  }

  const text = formatCellValue(value, column)
  content.textContent = text

  return content
}

/**
 * Update cell content efficiently
 */
export function updateCellContent(
  cell: HTMLElement,
  value: any,
  column: Column,
  isSelected: boolean = false,
): void {
  // Clear existing content
  cell.innerHTML = ''

  if (column.id === '__selection') {
    const checkbox = createCheckbox(isSelected)
    cell.appendChild(checkbox)
  } else {
    const content = createCellContent(value, column)
    cell.appendChild(content)
  }

  // Apply selection styling
  if (isSelected && column.id !== '__selection') {
    cell.classList.add('vibegridx-cell-selected')
  } else {
    cell.classList.remove('vibegridx-cell-selected')
  }
}

/**
 * Create header cell element
 */
export function createHeaderCell(
  column: Column,
  width: number,
  sortable: boolean = true,
  resizable: boolean = true,
): HTMLElement {
  const cell = document.createElement('div')
  cell.className = 'vibegridx-header-cell'
  cell.dataset.column = column.id
  cell.dataset.field = column.field || column.id

  Object.assign(cell.style, {
    position: 'relative',
    width: `${width}px`,
    height: `${CELL_HEIGHT}px`,
    display: 'flex',
    alignItems: 'center',
    padding: '0 12px',
    borderRight: '1px solid var(--border)',
    cursor: sortable && column.sortable !== false ? 'pointer' : 'default',
    userSelect: 'none',
    flexShrink: '0',
  })

  // Add content
  if (column.id === '__selection') {
    cell.classList.add('vibegridx-selection-header')
    const checkbox = createCheckbox(false)
    cell.appendChild(checkbox)
  } else {
    const contentWrapper = document.createElement('div')
    contentWrapper.style.cssText = `
      display: flex;
      align-items: center;
      flex: 1;
      gap: 4px;
      overflow: hidden;
    `

    const content = document.createElement('span')
    content.className = 'vibegridx-header-text'
    content.textContent = column.name || column.id
    contentWrapper.appendChild(content)

    cell.appendChild(contentWrapper)

    // Add resize handle
    if (resizable && column.resizable !== false) {
      const handle = document.createElement('div')
      handle.className = 'vibegridx-resize-handle'
      handle.dataset.column = column.id
      Object.assign(handle.style, {
        position: 'absolute',
        right: '0',
        top: '0',
        width: '4px',
        height: '100%',
        cursor: 'col-resize',
      })
      cell.appendChild(handle)
    }
  }

  return cell
}
