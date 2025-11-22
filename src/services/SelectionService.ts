/**
 * SelectionService - Single source of truth for selection logic
 *
 * Clean facade over InteractionStore selection state.
 * Handles all selection modes: single, multi, range, row selection.
 *
 * Key responsibilities:
 * - Manage selection state (selectedCells, anchorCell, focusedCell)
 * - Handle modifier key combinations (Ctrl, Shift)
 * - Calculate rectangular ranges for range selection
 * - Toggle row and cell selection
 */

import { runInAction } from 'mobx'
import { createLogger } from '@/shared/lib/logging'
import type { InteractionStore } from '../stores/InteractionStore'
import type { TableCoreStore } from '../stores/TableCoreStore'
import type { VisualStateStore } from '../stores/VisualStateStore'
import type { ModifierKeys } from '../coordination/InteractionCoordinator'

const fileLog = createLogger('components/vibegrid/services/SelectionService')

/**
 * SelectionService - Manages all selection operations
 */
export class SelectionService {
  constructor(
    private interactionStore: InteractionStore,
    private tableCoreStore: TableCoreStore,
    private visualStateStore: VisualStateStore
  ) {
    fileLog.info('SelectionService initialized')
  }

  /**
   * Handle pointer down - entry point from InteractionCoordinator
   *
   * Updates focus and selection based on modifier keys:
   * - No modifiers: Single selection
   * - Shift: Range selection (from anchor to current)
   * - Ctrl/Meta: Toggle selection (add/remove from set)
   */
  handlePointerDown(cellId: string, modifiers: ModifierKeys): void {
    fileLog.debug('handlePointerDown', {
      cellId,
      modifiers,
      currentAnchor: this.interactionStore.anchorCell
    })

    // Set focus first
    runInAction(() => {
      this.interactionStore.focusedCell = cellId
    })

    // Handle selection based on modifiers
    if (modifiers.shift && this.interactionStore.anchorCell) {
      // Range selection from anchor to current
      this.selectRange(this.interactionStore.anchorCell, cellId)
    } else if (modifiers.ctrl || modifiers.meta) {
      // Toggle selection (add/remove from set)
      this.toggleCell(cellId)
    } else {
      // Single selection (clear previous)
      this.selectCell(cellId)
    }
  }

  /**
   * Select single cell (clears previous selection)
   */
  selectCell(cellId: string): void {
    fileLog.debug('selectCell', { cellId })

    runInAction(() => {
      this.interactionStore.selectedCells = new Set([cellId])
      this.interactionStore.anchorCell = cellId
    })
  }

  /**
   * Select range of cells (rectangular range from anchor to target)
   */
  selectRange(fromCellId: string, toCellId: string): void {
    fileLog.debug('selectRange', {
      from: fromCellId,
      to: toCellId
    })

    const cells = this.calculateRangeCells(fromCellId, toCellId)

    fileLog.debug('Range calculated', {
      cellCount: cells.length,
      cells: cells.slice(0, 5) // Log first 5 for debugging
    })

    runInAction(() => {
      this.interactionStore.selectedCells = new Set(cells)
      // Keep anchor unchanged for subsequent range selections
    })
  }

  /**
   * Toggle cell selection (add if not selected, remove if selected)
   */
  toggleCell(cellId: string): void {
    fileLog.debug('toggleCell', { cellId })

    runInAction(() => {
      const selected = new Set(this.interactionStore.selectedCells)
      if (selected.has(cellId)) {
        selected.delete(cellId)
        fileLog.debug('Cell removed from selection', { cellId })
      } else {
        selected.add(cellId)
        fileLog.debug('Cell added to selection', { cellId })
      }
      this.interactionStore.selectedCells = selected
      this.interactionStore.anchorCell = cellId
    })
  }

  /**
   * Toggle entire row selection
   *
   * If all cells in row are selected, deselect them.
   * Otherwise, select all cells in row.
   */
  toggleRow(rowId: string): void {
    const columns = this.visualStateStore.columns.filter(col => col.id !== 'selection')
    const cells = columns.map(col => `${rowId}:${col.id}`)

    fileLog.debug('toggleRow', {
      rowId,
      cellCount: cells.length
    })

    runInAction(() => {
      const selected = new Set(this.interactionStore.selectedCells)
      const allSelected = cells.every(c => selected.has(c))

      if (allSelected) {
        // Deselect all cells in row
        cells.forEach(c => selected.delete(c))
        fileLog.debug('Row deselected', { rowId })
      } else {
        // Select all cells in row
        cells.forEach(c => selected.add(c))
        fileLog.debug('Row selected', { rowId })
      }

      this.interactionStore.selectedCells = selected
    })
  }

  /**
   * Clear all selection
   */
  clearSelection(): void {
    fileLog.debug('clearSelection')

    runInAction(() => {
      this.interactionStore.selectedCells = new Set()
      this.interactionStore.anchorCell = null
    })
  }

  /**
   * Calculate rectangular range of cells between two cell IDs
   *
   * Returns array of cellIds in format "rowId:columnId".
   * Handles both forward and backward selections.
   */
  private calculateRangeCells(from: string, to: string): string[] {
    // Get data context
    const rows = this.tableCoreStore.processedRows || []
    const allColumns = this.visualStateStore.columns.filter(col => col.id !== 'selection')
    const columnVisibility = this.visualStateStore.columnVisibility
    // Only use visible columns for range calculation
    const columns = allColumns.filter(col => columnVisibility[col.id] !== false)

    fileLog.debug('Range calculation column context', {
      totalColumns: allColumns.length,
      visibleColumns: columns.length,
      hiddenColumns: allColumns.length - columns.length
    })

    // Parse cell IDs
    const [fromRowId, fromColId] = from.split(':')
    const [toRowId, toColId] = to.split(':')

    // Find indices
    const fromRowIdx = rows.findIndex((r: any) => r.id === fromRowId)
    const toRowIdx = rows.findIndex((r: any) => r.id === toRowId)
    const fromColIdx = columns.findIndex(c => c.id === fromColId)
    const toColIdx = columns.findIndex(c => c.id === toColId)

    // Validate indices
    if (fromRowIdx === -1 || toRowIdx === -1 || fromColIdx === -1 || toColIdx === -1) {
      fileLog.warn('Range calculation failed - invalid indices', {
        fromRowIdx,
        toRowIdx,
        fromColIdx,
        toColIdx
      })
      return [from, to] // Fallback to just from and to
    }

    // Calculate rectangular range
    const minRow = Math.min(fromRowIdx, toRowIdx)
    const maxRow = Math.max(fromRowIdx, toRowIdx)
    const minCol = Math.min(fromColIdx, toColIdx)
    const maxCol = Math.max(fromColIdx, toColIdx)

    fileLog.debug('Range bounds', {
      rows: `${minRow} to ${maxRow}`,
      cols: `${minCol} to ${maxCol}`,
      totalCells: (maxRow - minRow + 1) * (maxCol - minCol + 1)
    })

    // Generate all cell IDs in range
    const cells: string[] = []
    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        cells.push(`${rows[r].id}:${columns[c].id}`)
      }
    }

    return cells
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    fileLog.info('SelectionService disposed')
    // No resources to clean up
  }
}
