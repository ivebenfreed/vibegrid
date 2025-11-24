/**
 * KeyboardNavigationController - Handles keyboard navigation for VibeGrid
 * Manages arrow key movement, keyboard selection, and keyboard shortcuts
 */

import { log } from '@/logger'
import type { TableInteraction$ } from '../../../stores/pure-observables'
import { SelectionController } from './SelectionController'

const fileLog = log('components/custom/vibegrid/renderers/modules/KeyboardNavigationController.ts')

export interface KeyboardNavigationOptions {
  tableInteraction$: TableInteraction$
  selectionController: SelectionController
  getProcessedRows: () => any[]
  getVisibleColumns: () => any[]
  container: HTMLElement
}

export class KeyboardNavigationController {
  private tableInteraction$: TableInteraction$
  private selectionController: SelectionController
  private getProcessedRows: () => any[]
  private getVisibleColumns: () => any[]
  private container: HTMLElement

  private focusedCell: string | null = null
  private selectionAnchor: string | null = null

  constructor(options: KeyboardNavigationOptions) {
    this.tableInteraction$ = options.tableInteraction$
    this.selectionController = options.selectionController
    this.getProcessedRows = options.getProcessedRows
    this.getVisibleColumns = options.getVisibleColumns
    this.container = options.container
  }

  /**
   * Handle arrow key navigation
   */
  handleArrowKey(direction: 'up' | 'down' | 'left' | 'right', isShiftKey: boolean): void {
    const processedRows = this.getProcessedRows()
    const visibleColumns = this.getVisibleColumns()

    fileLog.info('Handling arrow key', { direction, isShiftKey, focusedCell: this.focusedCell })

    // Ensure we have rows and columns
    if (processedRows.length === 0 || visibleColumns.length === 0) {
      return
    }

    // If no focused cell, focus the first cell
    if (!this.focusedCell) {
      const firstRow = processedRows[0]
      const firstColumn = visibleColumns.find((c) => c.id !== 'selection') || visibleColumns[0]
      this.focusedCell = `${firstRow.id}:${firstColumn.id}`
      this.selectionAnchor = this.focusedCell
      this.tableInteraction$.toggleCellSelection(firstRow.id, firstColumn.id, false, false)
      return
    }

    const [currentRowId, currentColumnId] = this.focusedCell.split(':')
    const currentRowIndex = processedRows.findIndex((r) => r.id === currentRowId)
    const currentColIndex = visibleColumns.findIndex((c) => c.id === currentColumnId)

    if (currentRowIndex === -1 || currentColIndex === -1) {
      return
    }

    let newRowIndex = currentRowIndex
    let newColIndex = currentColIndex

    switch (direction) {
      case 'up':
        newRowIndex = Math.max(0, currentRowIndex - 1)
        break
      case 'down':
        newRowIndex = Math.min(processedRows.length - 1, currentRowIndex + 1)
        break
      case 'left':
        newColIndex = Math.max(0, currentColIndex - 1)
        // Skip selection column
        if (visibleColumns[newColIndex]?.id === 'selection' && newColIndex > 0) {
          newColIndex--
        }
        break
      case 'right':
        newColIndex = Math.min(visibleColumns.length - 1, currentColIndex + 1)
        // Skip selection column
        if (
          visibleColumns[newColIndex]?.id === 'selection' &&
          newColIndex < visibleColumns.length - 1
        ) {
          newColIndex++
        }
        break
    }

    const newRow = processedRows[newRowIndex]
    const newColumn = visibleColumns[newColIndex]
    const newCellId = `${newRow.id}:${newColumn.id}`

    this.focusedCell = newCellId

    if (isShiftKey) {
      // Range selection
      if (!this.selectionAnchor) {
        this.selectionAnchor = `${currentRowId}:${currentColumnId}`
      }
      this.selectKeyboardRange(this.selectionAnchor, newCellId)
    } else {
      // Single cell selection
      this.selectionAnchor = newCellId
      this.tableInteraction$.toggleCellSelection(newRow.id, newColumn.id, false, false)
    }

    // Ensure the focused cell is visible
    this.scrollCellIntoView(newRow.id, newColumn.id)
  }

  /**
   * Select range using keyboard navigation
   */
  private selectKeyboardRange(startCell: string, endCell: string): void {
    this.selectionController.selectCellRange(startCell, endCell)
  }

  /**
   * Scroll cell into view if needed
   */
  private scrollCellIntoView(rowId: string, columnId: string): void {
    const cellElement = this.container.querySelector(
      `.vibegridx-cell[data-row-id="${rowId}"][data-column-id="${columnId}"]`,
    ) as HTMLElement

    if (cellElement) {
      cellElement.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'nearest',
      })
    }
  }

  /**
   * Handle keyboard events
   */
  handleKeyDown(event: KeyboardEvent): boolean {
    const isCtrlKey = event.ctrlKey || event.metaKey
    const isShiftKey = event.shiftKey

    switch (event.key) {
      case 'a':
      case 'A':
        if (isCtrlKey) {
          event.preventDefault()
          this.selectionController.selectAllCells()
          return true
        }
        break

      case 'ArrowUp':
        event.preventDefault()
        this.handleArrowKey('up', isShiftKey)
        return true

      case 'ArrowDown':
        event.preventDefault()
        this.handleArrowKey('down', isShiftKey)
        return true

      case 'ArrowLeft':
        event.preventDefault()
        this.handleArrowKey('left', isShiftKey)
        return true

      case 'ArrowRight':
        event.preventDefault()
        this.handleArrowKey('right', isShiftKey)
        return true

      case 'Enter':
        if (this.focusedCell) {
          const [rowId, columnId] = this.focusedCell.split(':')
          const cellId = `${rowId}:${columnId}`

          // Get current value
          const processedRows = this.getProcessedRows()
          const row = processedRows.find((r) => r.id === rowId)
          const value = row ? row[columnId] : ''

          // Start editing
          this.tableInteraction$.startEdit(cellId, value ? String(value) : '')
          return true
        }
        break

      case 'Escape':
        this.selectionController.clearSelection()
        this.focusedCell = null
        this.selectionAnchor = null
        return true

      case 'Delete':
      case 'Backspace':
        if (
          (this.focusedCell && !event.target) ||
          (event.target as HTMLElement).tagName !== 'INPUT'
        ) {
          // Could trigger delete action here
          fileLog.info('Delete key pressed on focused cell', { focusedCell: this.focusedCell })
          return true
        }
        break
    }

    return false
  }

  /**
   * Set focused cell from external interaction
   */
  setFocusedCell(cellId: string | null): void {
    this.focusedCell = cellId
    if (cellId && !this.selectionAnchor) {
      this.selectionAnchor = cellId
    }
  }

  /**
   * Get current focused cell
   */
  getFocusedCell(): string | null {
    return this.focusedCell
  }

  /**
   * Set selection anchor for range selection
   */
  setSelectionAnchor(cellId: string | null): void {
    this.selectionAnchor = cellId
  }

  /**
   * Get current selection anchor
   */
  getSelectionAnchor(): string | null {
    return this.selectionAnchor
  }

  /**
   * Clear keyboard navigation state
   */
  clear(): void {
    this.focusedCell = null
    this.selectionAnchor = null
  }
}
