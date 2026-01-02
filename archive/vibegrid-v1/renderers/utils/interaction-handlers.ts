// ====================================
// INTERACTION HANDLERS UTILITIES
// ====================================
// Event handling and interaction utilities for unified renderer

import type { Column } from '../../types'

/**
 * Setup drag handlers for column reordering
 */
export function setupColumnDragHandlers(
  headerCell: HTMLElement,
  column: Column,
  onDragStart: (columnId: string, e: DragEvent) => void,
  onDragEnd: (columnId: string, e: DragEvent) => void,
  onDragOver: (e: DragEvent) => void,
  onDrop: (targetColumnId: string, insertBefore: boolean, e: DragEvent) => void,
): void {
  if (column.id === '__selection') return // Selection column not draggable

  headerCell.draggable = true

  headerCell.addEventListener('dragstart', (e: DragEvent) => {
    e.dataTransfer!.effectAllowed = 'move'
    e.dataTransfer!.setData('text/plain', column.id)
    headerCell.classList.add('dragging')

    // Create custom drag image with column title
    const dragImage = document.createElement('div')
    dragImage.style.cssText = `
      position: fixed;
      top: -200px;
      left: 50px;
      background: transparent;
      color: hsl(var(--muted-foreground));
      padding: 0;
      border-radius: 0;
      font-size: 12px;
      font-weight: 600;
      box-shadow: none;
      border: none;
      white-space: nowrap;
      z-index: 99999;
      font-family: system-ui, -apple-system, sans-serif;
      text-align: left;
      opacity: 0.8;
    `

    // Get column label (same as header display)
    const columnLabel = column.label || column.title || column.header || column.id
    dragImage.textContent = columnLabel

    document.body.appendChild(dragImage)

    // Create the drag image with proper offset
    e.dataTransfer!.setDragImage(dragImage, dragImage.offsetWidth / 2, dragImage.offsetHeight / 2)

    // Clean up drag image after a short delay to ensure it's captured
    setTimeout(() => {
      if (document.body.contains(dragImage)) {
        document.body.removeChild(dragImage)
      }
    }, 100)

    onDragStart(column.id, e)
  })

  headerCell.addEventListener('dragend', (e: DragEvent) => {
    headerCell.classList.remove('dragging')

    // Clean up any remaining insertion lines
    document.querySelectorAll('.column-drop-line').forEach((line) => line.remove())

    onDragEnd(column.id, e)
  })

  headerCell.addEventListener('dragover', (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer!.dropEffect = 'move'

    // Show insertion line at the border where column will be inserted
    const rect = headerCell.getBoundingClientRect()
    const mouseX = e.clientX
    const cellCenterX = rect.left + rect.width / 2

    // Determine if inserting before or after this column
    const insertBefore = mouseX < cellCenterX

    // Remove any existing insertion lines
    document.querySelectorAll('.column-drop-line').forEach((line) => line.remove())

    // Get the header container (parent of header cells)
    const headerContainer = headerCell.parentElement
    if (!headerContainer) return

    // Create insertion line as an absolute positioned element in the header container
    const dropLine = document.createElement('div')
    dropLine.className = 'column-drop-line'

    // Calculate position relative to the header container
    const headerRect = headerContainer.getBoundingClientRect()
    const cellRect = headerCell.getBoundingClientRect()
    const linePosition = insertBefore
      ? cellRect.left - headerRect.left
      : cellRect.right - headerRect.left

    dropLine.style.cssText = `
      position: absolute;
      top: 0;
      bottom: 0;
      left: ${linePosition - 1.5}px;
      width: 3px;
      background: #3b82f6;
      border-radius: 1px;
      z-index: 9999;
      box-shadow: 0 0 4px rgba(59, 130, 246, 0.5);
      pointer-events: none;
      height: ${cellRect.height}px;
    `

    // Append to header container, not the cell itself
    headerContainer.style.position = 'relative'
    headerContainer.appendChild(dropLine)

    onDragOver(e)
  })

  headerCell.addEventListener('dragleave', (e: DragEvent) => {
    // Only remove if actually leaving the cell (not moving to child elements)
    if (!headerCell.contains(e.relatedTarget as Node)) {
      document.querySelectorAll('.column-drop-line').forEach((line) => line.remove())
    }
  })

  headerCell.addEventListener('drop', (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()

    console.log('🎯 DROP EVENT FIRED', {
      targetColumn: column.id,
      draggedColumn: e.dataTransfer!.getData('text/plain'),
    })

    // Clean up insertion lines
    document.querySelectorAll('.column-drop-line').forEach((line) => line.remove())

    const draggedColumnId = e.dataTransfer!.getData('text/plain')
    if (draggedColumnId && draggedColumnId !== column.id) {
      // Calculate insertion position (same logic as dragover)
      const rect = headerCell.getBoundingClientRect()
      const mouseX = e.clientX
      const cellCenterX = rect.left + rect.width / 2
      const insertBefore = mouseX < cellCenterX

      onDrop(column.id, insertBefore, e)
    }
  })
}

/**
 * Setup resize handlers for columns
 */
export function setupColumnResizeHandlers(
  resizeHandle: HTMLElement,
  column: Column,
  onResizeStart: (columnId: string, startX: number, startWidth: number) => void,
  onResizeMove: (deltaX: number) => void,
  onResizeEnd: (columnId: string, newWidth: number) => void,
): void {
  let startX = 0
  let startWidth = 0
  let currentWidth = 0

  const handleMouseMove = (e: MouseEvent) => {
    const deltaX = e.clientX - startX
    currentWidth = Math.max(50, startWidth + deltaX) // Min width 50px
    onResizeMove(deltaX)
  }

  const handleMouseUp = () => {
    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', handleMouseUp)
    document.body.style.cursor = ''
    onResizeEnd(column.id, currentWidth)
  }

  resizeHandle.addEventListener('mousedown', (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    const headerCell = resizeHandle.parentElement as HTMLElement
    startX = e.clientX
    startWidth = headerCell.offsetWidth
    currentWidth = startWidth

    document.body.style.cursor = 'col-resize'
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    onResizeStart(column.id, startX, startWidth)
  })
}

/**
 * Setup row selection handlers
 */
export function setupRowSelectionHandlers(
  rowElement: HTMLElement,
  rowId: string,
  onSelect: (rowId: string, multi: boolean, range: boolean) => void,
): void {
  rowElement.addEventListener('click', (e: MouseEvent) => {
    // Ignore clicks on interactive elements
    const target = e.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'BUTTON') {
      return
    }

    const multi = e.ctrlKey || e.metaKey
    const range = e.shiftKey

    onSelect(rowId, multi, range)
  })
}

/**
 * Setup cell editing handlers
 */
export function setupCellEditingHandlers(
  cellElement: HTMLElement,
  rowId: string,
  columnId: string,
  onEditStart: (rowId: string, columnId: string) => void,
  onEditEnd: (rowId: string, columnId: string, value: any) => void,
  onEditCancel: (rowId: string, columnId: string) => void,
): void {
  cellElement.addEventListener('dblclick', (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onEditStart(rowId, columnId)
  })
}

/**
 * Setup keyboard navigation handlers
 */
export function setupKeyboardHandlers(
  container: HTMLElement,
  onNavigate: (direction: 'up' | 'down' | 'left' | 'right') => void,
  onEdit: () => void,
  onDelete: () => void,
  onSelectAll: () => void,
  onCopy: () => void,
  onPaste: () => void,
  onUndo: () => void,
  onRedo: () => void,
): () => void {
  const handleKeyDown = (e: KeyboardEvent) => {
    // Navigation
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      onNavigate('up')
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      onNavigate('down')
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      onNavigate('left')
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      onNavigate('right')
    }
    // Editing
    else if (e.key === 'Enter' || e.key === 'F2') {
      e.preventDefault()
      onEdit()
    }
    // Delete
    else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      onDelete()
    }
    // Select All
    else if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
      e.preventDefault()
      onSelectAll()
    }
    // Copy
    else if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
      e.preventDefault()
      onCopy()
    }
    // Paste
    else if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
      e.preventDefault()
      onPaste()
    }
    // Undo
    else if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault()
      onUndo()
    }
    // Redo
    else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
      e.preventDefault()
      onRedo()
    }
  }

  container.addEventListener('keydown', handleKeyDown)

  // Return cleanup function
  return () => {
    container.removeEventListener('keydown', handleKeyDown)
  }
}

/**
 * Setup context menu handlers
 */
export function setupContextMenuHandlers(
  element: HTMLElement,
  onContextMenu: (x: number, y: number, context: any) => void,
): void {
  element.addEventListener('contextmenu', (e: MouseEvent) => {
    e.preventDefault()

    const target = e.target as HTMLElement
    const cell = target.closest('.vibegridx-cell')
    const row = target.closest('.vibegridx-row')

    const context = {
      rowId: row?.getAttribute('data-row-id'),
      columnId: cell?.getAttribute('data-column-id'),
      rowType: row?.getAttribute('data-row-type'),
      isHeader: target.closest('.vibegridx-header-cell') !== null,
    }

    onContextMenu(e.clientX, e.clientY, context)
  })
}

/**
 * Setup drag and drop handlers for rows
 */
export function setupRowDragHandlers(
  rowElement: HTMLElement,
  rowId: string,
  rowType: 'data' | 'group' | 'summary',
  onDragStart: (rowId: string) => void,
  onDragOver: (e: DragEvent, targetRowId: string) => void,
  onDrop: (sourceRowId: string, targetRowId: string, position: 'before' | 'after') => void,
): void {
  // Only data rows are draggable by default
  if (rowType !== 'data') return

  rowElement.draggable = true

  rowElement.addEventListener('dragstart', (e: DragEvent) => {
    e.dataTransfer!.effectAllowed = 'move'
    e.dataTransfer!.setData('text/plain', rowId)
    rowElement.classList.add('dragging')
    onDragStart(rowId)
  })

  rowElement.addEventListener('dragend', () => {
    rowElement.classList.remove('dragging')
  })

  rowElement.addEventListener('dragover', (e: DragEvent) => {
    e.preventDefault()
    e.dataTransfer!.dropEffect = 'move'
    onDragOver(e, rowId)
  })

  rowElement.addEventListener('drop', (e: DragEvent) => {
    e.preventDefault()
    const sourceRowId = e.dataTransfer!.getData('text/plain')

    if (sourceRowId !== rowId) {
      const rect = rowElement.getBoundingClientRect()
      const position = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
      onDrop(sourceRowId, rowId, position)
    }
  })
}
