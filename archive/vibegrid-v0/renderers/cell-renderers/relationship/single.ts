import { log } from '@/logger'
import type { Column } from '../../../types'

const fileLog = log('components/custom/vibegrid/renderers/cell-renderers/relationship/single.ts')

/**
 * Fast single relationship renderer - string version
 * Optimized for foreign key lookups with proper null state handling
 */
export function relationshipSingle(value: any, column: Column, rowData?: any): string {
  // Debug logging disabled for performance
  // fileLog.info('🔍 relationshipSingle: Called', { columnId: column.id, value });

  // First check for pre-resolved value from ViewActor
  if (rowData && rowData[`__resolved_${column.id}`]) {
    const resolvedValue = rowData[`__resolved_${column.id}`]
    if (resolvedValue) {
      return `<span class="vibegridx-relationship-badge">${resolvedValue}</span>`
    }
  }

  // Handle null/undefined with proper empty state
  if (value == null) {
    const placeholder = column.placeholder || 'Select...'
    return `<div class="vibegridx-cell-empty-state">
      <svg class="h-3 w-3 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
      </svg>
      <span class="text-xs text-muted-foreground">${placeholder}</span>
    </div>`
  }

  // If we get here, we just have an ID with no resolved value
  // This should rarely happen if ViewActor is working correctly
  return `<span class="vibegridx-relationship-badge vibegridx-relationship-unresolved">${String(value)}</span>`
}

/**
 * DOM-based single relationship renderer with proper tooltip support
 */
export function relationshipSingleBadge(value: any, column: Column, rowData?: any): HTMLElement {
  const container = document.createElement('div')
  container.style.cssText = `
    display: flex;
    align-items: center;
    width: 100%;
    padding: 4px 0;
  `

  // Get resolved value
  let displayValue = null
  if (rowData && rowData[`__resolved_${column.id}`]) {
    displayValue = rowData[`__resolved_${column.id}`]
  }

  // Handle null/undefined with proper empty state
  if (value == null || !displayValue) {
    const emptyState = document.createElement('span')
    emptyState.className =
      'text-muted-foreground text-xs italic cursor-pointer hover:text-foreground vibegridx-cell-badge-editable'
    emptyState.textContent = column.placeholder || 'Select...'
    container.appendChild(emptyState)
    return container
  }

  // Create badge
  const badge = document.createElement('span')
  badge.className =
    'inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 border-transparent bg-primary text-primary-foreground overflow-hidden cursor-pointer hover:bg-primary/80 vibegridx-cell-badge-editable vibegridx-badge'
  badge.style.cssText = `
    max-width: 100%;
    text-overflow: ellipsis;
    white-space: nowrap;
    overflow: hidden;
    display: inline-block;
  `

  badge.textContent = displayValue

  // Add tooltip for truncated content
  requestAnimationFrame(() => {
    if (badge.scrollWidth > badge.clientWidth) {
      badge.title = displayValue
    }
  })

  container.appendChild(badge)
  return container
}
