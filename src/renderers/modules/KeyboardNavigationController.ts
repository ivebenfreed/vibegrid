/**
 * KeyboardNavigationController - Handles keyboard navigation for VibeGrid
 * Manages arrow key movement, keyboard selection, and keyboard shortcuts
 *
 * MIGRATED TO MOBX - uses InteractionStore directly
 */

import { runInAction } from 'mobx'
import { getLogger } from '@/shared/lib/logging'
import type { EditingStore } from '../../stores/EditingStore'
import type { InteractionStore } from '../../stores/InteractionStore'
import type { TableCoreStore } from '../../stores/TableCoreStore'
import {
  isSparsePlaceholder,
  nextLoadedRowIndex as nextLoadedRowIndexInWindow,
  previousLoadedRowIndex as previousLoadedRowIndexInWindow,
} from '../../stores/TableCoreStore'
import type { SelectionController } from './SelectionController'

const logger = getLogger('components/custom/vibegrid/renderers/modules/KeyboardNavigationController.ts')

export interface KeyboardNavigationOptions {
  interactionStore: InteractionStore
  editingStore: EditingStore
  selectionController: SelectionController
  getProcessedRows: () => any[]
  getVisibleColumns: () => any[]
  container: HTMLElement
  /**
   * GH#2804 round-3 review fix: optional TableCoreStore reference. When
   * provided, sparse-row scans use the O(1) window-based helpers
   * (`nextLoadedRowIndex` / `previousLoadedRowIndex`) instead of the
   * file-local linear scan. At 100k rows with a small loaded window,
   * PageUp/PageDown previously scanned ~99,900 placeholders linearly.
   */
  tableCoreStore?: TableCoreStore
}

export class KeyboardNavigationController {
  private interactionStore: InteractionStore
  private editingStore: EditingStore
  private selectionController: SelectionController
  private getProcessedRows: () => any[]
  private getVisibleColumns: () => any[]
  private container: HTMLElement
  private tableCoreStore?: TableCoreStore

  constructor(options: KeyboardNavigationOptions) {
    this.interactionStore = options.interactionStore
    this.editingStore = options.editingStore
    this.selectionController = options.selectionController
    this.getProcessedRows = options.getProcessedRows
    this.getVisibleColumns = options.getVisibleColumns
    this.container = options.container
    this.tableCoreStore = options.tableCoreStore
  }

  /**
   * GH#2804 round-3 review fix: sparse-aware "next loaded index" lookup.
   *
   * When `processedRows.length` matches the TableCoreStore's full sparse
   * array length (i.e., `processedRows[i]` and `rawRows[i]` share the same
   * indexing — the unsliced/wrapped path), use the O(1) window-based
   * helper. This avoids scanning ~99,900 placeholders linearly on a 100k
   * row table where only a small window is loaded.
   *
   * When indices don't align (e.g., `baseRows` returned a slice of just the
   * loaded window, so processedRows.length = window size << totalCount),
   * fall back to the linear scan — it's O(window size) which is small.
   *
   * The window-based helper degenerates correctly on dense data: when
   * loadedWindowEnd === processedRows.length, every index in [0, end) is
   * loaded, so it always returns the requested index.
   */
  private nextLoadedIndex(rows: any[], start: number): number {
    const store = this.tableCoreStore
    if (store && this.isWindowAlignedWithProcessedRows(rows.length)) {
      return nextLoadedRowIndexInWindow(
        Math.max(0, start),
        store.loadedWindowStart,
        store.loadedWindowEnd,
        rows.length,
      )
    }
    return findNextLoadedIndex(rows, start)
  }

  private previousLoadedIndex(rows: any[], start: number): number {
    const store = this.tableCoreStore
    if (store && this.isWindowAlignedWithProcessedRows(rows.length)) {
      const clampedStart = Math.min(
        Math.max(0, start),
        Math.max(0, rows.length - 1),
      )
      return previousLoadedRowIndexInWindow(
        clampedStart,
        store.loadedWindowStart,
        store.loadedWindowEnd,
      )
    }
    return findPreviousLoadedIndex(rows, start)
  }

  /**
   * The O(1) helpers index into `rawRows` (length=totalCount). They are
   * only safe when `processedRows` has the same length and indexing — i.e.
   * either no sparse window is active (dense path: window covers full
   * array) or the array was wrapped without slicing.
   */
  private isWindowAlignedWithProcessedRows(processedRowsLength: number): boolean {
    const store = this.tableCoreStore
    if (!store) return false
    // Dense (no sparse window) — both window helpers degenerate to identity.
    if (store.loadedWindowEnd === processedRowsLength && store.loadedWindowStart === 0) {
      return true
    }
    // Sparse: window indices align with processedRows when the array was
    // not sliced (length matches the rawRows allocation).
    return processedRowsLength >= store.loadedWindowEnd
  }

  /**
   * Handle arrow key navigation
   * Note: This method is only called when NOT editing (checked in handleKeyDown)
   *
   * PHASE 5: Now includes focus validation and recovery
   */
  handleArrowKey(direction: 'up' | 'down' | 'left' | 'right', isShiftKey: boolean): void {
    const processedRows = this.getProcessedRows()
    const visibleColumns = this.getVisibleColumns()
    const focusedCell = this.interactionStore.focusedCell

    logger.debug('Handling arrow key', { direction, isShiftKey, focusedCell })

    // Ensure we have rows and columns
    if (processedRows.length === 0 || visibleColumns.length === 0) {
      return
    }

    // If no focused cell, focus the first cell
    if (!focusedCell) {
      // GH#2804 B7 sparse guard: skip past unloaded rows when looking for the
      // first focusable row — focusing a placeholder would NPE on `.id`.
      const firstLoadedIdx = this.nextLoadedIndex(processedRows, 0)
      if (firstLoadedIdx === -1) return
      const firstRow = processedRows[firstLoadedIdx]
      const firstColumn = visibleColumns.find((c) => c.id !== 'selection') || visibleColumns[0]
      const firstCellId = `${firstRow.id}:${firstColumn.id}`
      this.interactionStore.setFocusedCell(firstCellId)
      this.interactionStore.toggleCellSelection(firstRow.id, firstColumn.id, false, false)
      return
    }

    // PHASE 5: FOCUS VALIDATION
    // Validate that focused cell still exists in current rows/columns
    // GH#2812 sparse guard: findIndex visits holes as undefined per
    // ECMA-262 §22.1.3.10, so we must guard `r` before accessing `.id`.
    const [currentRowId, currentColumnId] = focusedCell.split(':')
    const currentRowIndex = processedRows.findIndex((r) => r && r.id === currentRowId)
    const currentColIndex = visibleColumns.findIndex((c) => c.id === currentColumnId)

    // PHASE 5: FOCUS RECOVERY
    // If focus is invalid (row/column hidden, filtered, etc.), recover to first visible cell
    if (currentRowIndex === -1 || currentColIndex === -1) {
      logger.warn('Focus invalid after config change, recovering', {
        focusedCell,
        rowFound: currentRowIndex !== -1,
        colFound: currentColIndex !== -1,
        reason: currentRowIndex === -1 ? 'Row not found (filtered/deleted)' : 'Column not found (hidden)',
      })

      this.recoverFocus(processedRows, visibleColumns)
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
        if (visibleColumns[newColIndex]?.id === 'selection' && newColIndex < visibleColumns.length - 1) {
          newColIndex++
        }
        break
    }

    // GH#2804 B7 sparse guard: when the target row is a sparse placeholder,
    // skip forward (down/right) or backward (up/left) to the next loaded
    // row. If none exists in that direction, no-op rather than crash.
    let resolvedRowIndex = newRowIndex
    if (direction === 'up' || direction === 'left') {
      const prev = this.previousLoadedIndex(processedRows, resolvedRowIndex)
      if (prev !== -1) resolvedRowIndex = prev
    } else {
      const next = this.nextLoadedIndex(processedRows, resolvedRowIndex)
      if (next !== -1) resolvedRowIndex = next
    }
    const newRow = processedRows[resolvedRowIndex]
    if (!newRow || isSparsePlaceholder(newRow)) {
      logger.debug('Arrow nav: no loaded row reachable, no-op', { direction, resolvedRowIndex })
      return
    }
    const newColumn = visibleColumns[newColIndex]
    const newCellId = `${newRow.id}:${newColumn.id}`

    this.interactionStore.setFocusedCell(newCellId)

    if (isShiftKey) {
      // Range selection
      const anchorCell = this.interactionStore.anchorCell
      const selectionAnchor = anchorCell || `${currentRowId}:${currentColumnId}`
      this.selectKeyboardRange(selectionAnchor, newCellId)
    } else {
      // Single cell selection - anchor will be set by setFocusedCell
      this.interactionStore.toggleCellSelection(newRow.id, newColumn.id, false, false)
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

    // CRITICAL: During editing, only handle Escape (to cancel)
    // All other keys (including Ctrl+A) should work normally in the editor
    if (this.editingStore.isEditing && event.key !== 'Escape') {
      logger.debug('Key pressed during editing - letting editor handle it', {
        key: event.key,
        editingCell: this.editingStore.editingCell,
      })
      return false // Let the editor handle all keys except Escape
    }

    switch (event.key) {
      case 'a':
      case 'A':
        if (isCtrlKey) {
          event.preventDefault()
          // GH#2806 P8: marker-model select-all is unconditional (O(1)).
          // Bulk actions iterate via iterateSelectedRowIds() in marker mode.
          this.interactionStore.setSelectionMode('all-with-exclusions')
          logger.debug('⌨️ Ctrl+A marker-mode select-all triggered')
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

      case 'Enter': {
        // Use InteractionStore focused cell
        const focusedCell = this.interactionStore.focusedCell
        if (focusedCell) {
          const [rowId, columnId] = focusedCell.split(':')
          const cellId = `${rowId}:${columnId}`

          // Check if column is editable before starting edit mode
          const columns = this.getVisibleColumns()
          const column = columns.find((c) => c.id === columnId)
          if (column && column.editable === false) {
            return true // Consume the event but don't start editing
          }

          if (!column) {
            logger.warn('Column not found for editing', { columnId })
            return true
          }

          // FIXED: Now uses EditingStore with full column object
          // This ensures consistent value lookup (column.field + row.data[field])
          // Fixes Issue #3 from detailed-issues.md (keyboard vs click desync)
          this.editingStore.startEdit(cellId, column)
          return true
        }
        break
      }

      case 'Tab': {
        event.preventDefault()
        event.stopPropagation()
        this.handleArrowKey(event.shiftKey ? 'left' : 'right', false)
        return true
      }

      case 'F2':
      case 'f2': {
        const focusedCell = this.interactionStore.focusedCell
        if (focusedCell) {
          const [rowId, columnId] = focusedCell.split(':')
          const cellId = `${rowId}:${columnId}`

          // Check if column is editable before starting edit mode
          const columns = this.getVisibleColumns()
          const column = columns.find((c) => c.id === columnId)
          if (column && column.editable === false) {
            return true // Consume the event but don't start editing
          }

          if (!column) {
            logger.warn('Column not found for editing', { columnId })
            return true
          }

          // FIXED: Now uses EditingStore with full column object
          // This ensures consistent value lookup (column.field + row.data[field])
          // Fixes Issue #3 from detailed-issues.md (keyboard vs click desync)
          this.editingStore.startEdit(cellId, column)
          return true
        }
        break
      }

      case 'Escape':
        // If currently editing, just cancel the edit and keep selection
        if (this.editingStore.isEditing) {
          this.editingStore.cancelEdit('escape')
          // Keep the cell selected after canceling edit and focus container for keyboard events
          this.container.focus()
          return true
        }

        // If clipboard highlight exists, clear it first (independent of selection)
        if (this.interactionStore.clipboard) {
          this.interactionStore.clearClipboard()
          return true
        }

        // If no clipboard, then clear selection
        this.interactionStore.clearSelection()
        this.interactionStore.setFocusedCell(null)
        return true

      case 'Delete':
      case 'Backspace': {
        const currentFocusedCell = this.interactionStore.focusedCell
        if ((currentFocusedCell && !event.target) || (event.target as HTMLElement).tagName !== 'INPUT') {
          // Could trigger delete action here
          logger.debug('Delete key pressed on focused cell', { focusedCell: currentFocusedCell })
          return true
        }
        break
      }
    }

    return false
  }

  /**
   * Set focused cell from external interaction
   */
  setFocusedCell(cellId: string | null): void {
    // Use InteractionStore only - no local state
    this.interactionStore.setFocusedCell(cellId)
  }

  /**
   * Get current focused cell
   */
  getFocusedCell(): string | null {
    return this.interactionStore.focusedCell
  }

  /**
   * Set selection anchor for range selection
   */
  setSelectionAnchor(cellId: string | null): void {
    runInAction(() => {
      this.interactionStore.anchorCell = cellId
    })
  }

  /**
   * Get current selection anchor
   */
  getSelectionAnchor(): string | null {
    return this.interactionStore.anchorCell
  }

  /**
   * Clear keyboard navigation state
   */
  clear(): void {
    runInAction(() => {
      this.interactionStore.setFocusedCell(null)
      this.interactionStore.anchorCell = null
    })
  }

  /**
   * Recover focus to first visible cell
   *
   * PHASE 5: Called when focused cell is invalid (hidden/filtered/deleted)
   * Ensures keyboard navigation continues to work after config changes
   *
   * @param processedRows Current visible rows
   * @param visibleColumns Current visible columns
   */
  private recoverFocus(processedRows: any[], visibleColumns: any[]): void {
    if (processedRows.length === 0 || visibleColumns.length === 0) {
      logger.warn('Cannot recover focus - no visible rows or columns')
      return
    }

    // GH#2804 B7 sparse guard: anchor recovery falls back to the first
    // loaded row id when the saved index points into a sparse range.
    const firstLoadedIdx = this.nextLoadedIndex(processedRows, 0)
    if (firstLoadedIdx === -1) {
      logger.warn('Cannot recover focus - no loaded rows in viewport')
      return
    }
    const firstRow = processedRows[firstLoadedIdx]
    const firstCol = visibleColumns.find((c) => c.id !== 'selection') || visibleColumns[0]
    const firstCellId = `${firstRow.id}:${firstCol.id}`

    logger.info('Recovering focus to first visible cell', {
      cellId: firstCellId,
      rowId: firstRow.id,
      columnId: firstCol.id,
    })

    this.interactionStore.setFocusedCell(firstCellId)
    this.interactionStore.selectCell(firstCellId, false)
  }
}

/**
 * GH#2804 B7 sparse guard helper: scan forward from `start` for the first
 * row that is not a sparse placeholder. Returns -1 if none found.
 *
 * Exported for direct unit tests; controller methods use it internally.
 */
export function findNextLoadedIndex(rows: any[], start: number): number {
  for (let i = Math.max(0, start); i < rows.length; i++) {
    const r = rows[i]
    if (r && !isSparsePlaceholder(r)) return i
  }
  return -1
}

/**
 * GH#2804 B7 sparse guard helper: scan backward from `start` for the first
 * row that is not a sparse placeholder. Returns -1 if none found.
 */
export function findPreviousLoadedIndex(rows: any[], start: number): number {
  for (let i = Math.min(rows.length - 1, start); i >= 0; i--) {
    const r = rows[i]
    if (r && !isSparsePlaceholder(r)) return i
  }
  return -1
}
