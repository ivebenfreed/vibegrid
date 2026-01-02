// ====================================
// ROW RENDERING UTILITIES
// ====================================
// Extracted shared row rendering utilities for unified renderer

// UnifiedTableRow type - simplified for utilities
type UnifiedTableRow = {
  type: 'group' | 'data' | 'summary'
  id: string
  [key: string]: any
}

export const ROW_HEIGHT = 40
export const GROUP_ROW_HEIGHT = 44
export const SUMMARY_ROW_HEIGHT = 36

/**
 * Calculate the vertical offset for a row based on all previous row heights
 */
export function calculateRowOffset(rows: UnifiedTableRow[], rowIndex: number): number {
  if (!rows || rowIndex >= rows.length) {
    return rowIndex * ROW_HEIGHT // Fallback
  }

  let offset = 0
  for (let i = 0; i < rowIndex; i++) {
    offset += rows[i].height
  }

  return offset
}

/**
 * Calculate total height of all rows
 */
export function calculateTotalHeight(rows: UnifiedTableRow[]): number {
  return rows.reduce((sum, row) => sum + row.height, 0)
}

/**
 * Find visible row range based on scroll position
 */
export function findVisibleRange(
  rows: UnifiedTableRow[],
  scrollTop: number,
  viewportHeight: number,
  bufferRows: number = 5,
): { start: number; end: number } {
  if (rows.length === 0) {
    return { start: 0, end: 0 }
  }

  let currentOffset = 0
  let start = 0
  let end = rows.length

  // Find start index with buffer
  const startThreshold = scrollTop - bufferRows * ROW_HEIGHT
  for (let i = 0; i < rows.length; i++) {
    if (currentOffset >= startThreshold) {
      start = Math.max(0, i)
      break
    }
    currentOffset += rows[i].height
  }

  // Find end index with buffer
  const endThreshold = scrollTop + viewportHeight + bufferRows * ROW_HEIGHT
  currentOffset = 0
  for (let i = 0; i < rows.length; i++) {
    currentOffset += rows[i].height
    if (currentOffset >= endThreshold) {
      end = Math.min(rows.length, i + 1)
      break
    }
  }

  return { start, end }
}

/**
 * Apply row type-specific CSS classes
 */
export function applyRowTypeClasses(element: HTMLElement, row: UnifiedTableRow): void {
  // Remove existing type classes
  element.classList.remove(
    'vibegridx-data-row',
    'vibegridx-group-row',
    'vibegridx-summary-row',
    'vibegridx-grouped-row',
  )

  // Apply type-specific class
  element.classList.add(`vibegridx-${row.type}-row`)

  // Apply nesting styles for grouped rows
  if (row.level && row.level > 0) {
    element.classList.add('vibegridx-grouped-row')
    element.dataset.groupLevel = String(row.level)
  } else {
    delete element.dataset.groupLevel
  }
}

/**
 * Get row height based on type
 */
export function getRowHeight(rowType: 'data' | 'group' | 'summary'): number {
  switch (rowType) {
    case 'group':
      return GROUP_ROW_HEIGHT
    case 'summary':
      return SUMMARY_ROW_HEIGHT
    default:
      return ROW_HEIGHT
  }
}

/**
 * Create row element with base styles
 */
export function createRowElement(row: UnifiedTableRow, offset: number): HTMLElement {
  const element = document.createElement('div')
  element.className = 'vibegridx-row'
  element.dataset.rowId = row.id
  element.dataset.rowType = row.type

  if (row.groupId) {
    element.dataset.groupId = row.groupId
  }

  Object.assign(element.style, {
    position: 'absolute',
    top: `${offset}px`,
    left: '0',
    right: '0',
    height: `${row.height}px`,
    display: 'flex',
    width: 'fit-content',
  })

  applyRowTypeClasses(element, row)

  return element
}
