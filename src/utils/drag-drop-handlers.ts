/**
 * Drag and Drop Handlers for VibeGrid
 *
 * Simplified implementation following VibeGrid patterns for row drag and drop.
 */

import { getLogger } from '@/shared/lib/logging'
import type { GroupRowOrderConfig } from '../stores/TableCoreStore'

const fileLog = getLogger(['custom', 'vibegrid', 'utils', 'drag-drop-handlers.ts'])

// ====================================
// TYPES
// ====================================

export interface DragDropCallbacks {
  onRowMove: (draggedRowId: string, targetGroupId: string, newIndex: number) => boolean
  onFlatRowMove?: (fromIndex: number, toIndex: number) => boolean
  onDragStart?: (rowId: string, groupId?: string) => void
  onDragEnd?: (success: boolean) => void
  isGroupMode?: () => boolean
}

// ====================================
// DRAG AND DROP MANAGER
// ====================================

export class DragDropManager {
  private callbacks: DragDropCallbacks

  constructor(callbacks: DragDropCallbacks) {
    this.callbacks = callbacks
    fileLog.debug('🎯 DragDropManager initialized')
  }

  /**
   * Set container for drag operations (compatibility method)
   */
  setContainer(container: HTMLElement): void {
    // Store container reference if needed for future drag operations
    fileLog.debug('🏗️ Container set for drag operations', { containerClass: container.className })
  }

  /**
   * Setup row for drag and drop (alias for setupRowDragHandlers)
   */
  setupRowForDragDrop(rowElement: HTMLElement, row: any): void {
    const rowType = row.type || 'data'
    const groupId = row.groupId

    this.setupRowDragHandlers(rowElement, row.id, rowType, groupId)
  }

  /**
   * Create drag handle element
   */
  createDragHandle(): HTMLElement {
    const handle = document.createElement('div')
    handle.className = 'vibegrid-drag-handle'

    // Handle styling
    Object.assign(handle.style, {
      width: '20px',
      height: '20px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'grab',
      borderRadius: '4px',
      opacity: '0.6',
      transition: 'opacity 0.2s ease',
    })

    // Drag icon (two rows of three dots)
    handle.innerHTML = `
      <svg width="12" height="16" viewBox="0 0 12 16" fill="currentColor">
        <circle cx="3" cy="4" r="1.5"/>
        <circle cx="9" cy="4" r="1.5"/>
        <circle cx="3" cy="8" r="1.5"/>
        <circle cx="9" cy="8" r="1.5"/>
        <circle cx="3" cy="12" r="1.5"/>
        <circle cx="9" cy="12" r="1.5"/>
      </svg>
    `

    return handle
  }

  /**
   * Setup row drag handlers (following VibeGrid pattern)
   */
  setupRowDragHandlers(
    rowElement: HTMLElement,
    rowId: string,
    rowType: 'data' | 'group' | 'summary',
    groupId?: string,
  ): void {
    fileLog.debug('🎯 setupRowDragHandlers called', {
      rowId,
      rowType,
      groupId,
      hasRowElement: !!rowElement,
      dataGroupId: rowElement?.dataset?.groupId,
    })

    // Only data rows are draggable
    if (rowType !== 'data') {
      fileLog.debug('⏭️ Skipping non-data row', { rowId, rowType })
      return
    }

    const isGroupMode = this.callbacks.isGroupMode?.() ?? true
    fileLog.debug('🔍 Group mode check', { isGroupMode, groupId, hasGroupId: !!groupId })

    if (isGroupMode && !groupId) {
      fileLog.error('❌ Cannot setup drag handlers: no group ID provided for grouped mode', {
        rowId,
        isGroupMode,
        groupId,
        dataGroupId: rowElement?.dataset?.groupId,
        allDataAttributes: Object.assign({}, rowElement?.dataset),
      })
      return
    }

    // Note: HTML5 drag events are no longer used - MouseController handles row dragging
    // This is kept for compatibility but no longer sets up event listeners
    fileLog.debug('🎯 Row drag handlers setup (MouseController mode)', {
      rowId,
      groupId,
      isGroupMode,
    })
  }

  /**
   * Remove all drop indicators
   */
  private removeDropIndicators(): void {
    const indicators = document.querySelectorAll('.vibegrid-drop-indicator')
    indicators.forEach((indicator) => indicator.remove())
  }

  /**
   * Destroy the drag drop manager
   */
  destroy(): void {
    this.removeDropIndicators()
    fileLog.debug('🧹 DragDropManager destroyed')
  }
}

// ====================================
// UTILITY FUNCTIONS
// ====================================

/**
 * Apply custom row ordering to a group's data rows
 */
export function applyGroupRowOrdering(
  dataRows: any[],
  groupId: string,
  groupRowOrders: Record<string, GroupRowOrderConfig>,
): any[] {
  const orderConfig = groupRowOrders[groupId]

  if (!orderConfig || !orderConfig.rowIds.length) {
    // No custom ordering, return as-is
    return dataRows
  }

  const orderedRows: any[] = []
  const rowsById = new Map(dataRows.map((row) => [row.id, row]))

  // Add rows in specified order
  orderConfig.rowIds.forEach((rowId) => {
    const row = rowsById.get(rowId)
    if (row) {
      orderedRows.push(row)
      rowsById.delete(rowId)
    }
  })

  // Add any remaining rows that weren't in the order config
  rowsById.forEach((row) => orderedRows.push(row))

  fileLog.debug('✅ Applied group row ordering', {
    groupId,
    originalCount: dataRows.length,
    orderedCount: orderedRows.length,
    customOrder: orderConfig.rowIds.length,
  })

  return orderedRows
}

/**
 * Initialize group row order from current data
 */
export function initializeGroupRowOrder(
  groupId: string,
  dataRows: any[],
  setGroupRowOrder: (groupId: string, rowIds: string[]) => void,
): void {
  const rowIds = dataRows.map((row) => row.id)
  setGroupRowOrder(groupId, rowIds)

  fileLog.debug('🔧 Initialized group row order', {
    groupId,
    rowCount: rowIds.length,
  })
}
