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
import { getLogger } from '@/shared/lib/logging'
import type { ObservableCoordinateManager } from '../coordinates/ObservableCoordinateManager'
import type { ModifierKeys } from '../coordination/InteractionCoordinator'
import type { InteractionStore } from '../stores/InteractionStore'
import type { TableCoreStore } from '../stores/TableCoreStore'
import type { VisualStateStore } from '../stores/VisualStateStore'

const fileLog = getLogger(['vibegrid', 'services', 'SelectionService'])

/**
 * SelectionService - Manages all selection operations
 */
export class SelectionService {
  constructor(
    private interactionStore: InteractionStore,
    private tableCoreStore: TableCoreStore,
    private visualStateStore: VisualStateStore,
    private coordinateManager: ObservableCoordinateManager,
  ) {
    fileLog.info('SelectionService initialized with ObservableCoordinateManager')
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
      currentAnchor: this.interactionStore.anchorCell,
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

    // Use InteractionStore's method to ensure version tracking
    this.interactionStore.selectCell(cellId, false)
  }

  /**
   * Select range of cells (rectangular range from anchor to target)
   */
  selectRange(fromCellId: string, toCellId: string): void {
    fileLog.debug('selectRange', {
      from: fromCellId,
      to: toCellId,
    })

    const cells = this.calculateRangeCells(fromCellId, toCellId)

    fileLog.debug('Range calculated', {
      cellCount: cells.length,
      cells: cells.slice(0, 5), // Log first 5 for debugging
    })

    // Use InteractionStore's method with data context for proper version tracking
    const dataContext = {
      rows: this.tableCoreStore.processedRows,
      columns: this.visualStateStore.columns,
      columnVisibility: this.visualStateStore.columnVisibility,
    }
    this.interactionStore.selectRange(fromCellId, toCellId, dataContext)
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

      // Increment version to trigger overlay updates
      this.interactionStore.selectionVersion++
    })
  }

  /**
   * Toggle entire row selection
   *
   * 🔧 FIX: Only selects VISIBLE columns to match coordinate system
   * Hidden columns don't exist in coordinator, so we only select visible ones
   */
  toggleRow(rowId: string): void {
    // Select ONLY VISIBLE columns (coordinator only tracks visible columns)
    const columns = this.visualStateStore.visibleOrderedColumns.filter((col) => col.id !== 'selection')
    const cells = columns.map((col) => `${rowId}:${col.id}`)

    fileLog.debug('toggleRow (visible columns only)', {
      rowId,
      cellCount: cells.length,
      visibleColumns: columns.length,
    })

    runInAction(() => {
      const selected = new Set(this.interactionStore.selectedCells)
      const allSelected = cells.every((c) => selected.has(c))

      if (allSelected) {
        // Deselect all cells in row
        cells.forEach((c) => selected.delete(c))
        fileLog.debug('Row deselected', { rowId })
      } else {
        // Select all cells in row
        cells.forEach((c) => selected.add(c))
        fileLog.debug('Row selected', { rowId })
      }

      this.interactionStore.selectedCells = selected

      // Increment version to trigger overlay updates
      this.interactionStore.selectionVersion++
    })
  }

  /**
   * Clear all selection
   */
  clearSelection(): void {
    fileLog.debug('clearSelection')

    // Use InteractionStore's method to ensure version tracking
    this.interactionStore.clearSelection()
  }

  /**
   * Calculate rectangular range of cells between two cell IDs
   *
   * Returns array of cellIds in format "rowId:columnId".
   * Handles both forward and backward selections.
   *
   * 🔧 KEY FIX: Uses coordinateManager for range calculation
   * This ensures selections use current column positions (after reorder/hide/resize)
   */
  private calculateRangeCells(from: string, to: string): string[] {
    // Parse cell IDs
    const [fromRowId, fromColId] = from.split(':')
    const [toRowId, toColId] = to.split(':')

    // Use coordinate manager for range calculation
    // This automatically uses the latest column order from VisualStateStore
    const cellRange = this.coordinateManager.calculateCellRange(
      { rowId: fromRowId, columnId: fromColId },
      { rowId: toRowId, columnId: toColId },
    )

    const cells = Array.from(cellRange)

    fileLog.debug('Range calculated via coordinator', {
      from,
      to,
      cellCount: cells.length,
      coordinatorVersion: this.coordinateManager.getVersion(),
    })

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
