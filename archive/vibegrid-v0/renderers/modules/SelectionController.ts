/**
 * SelectionController - Manages all selection operations for VibeGrid
 * Handles cell, row, column, and range selection logic
 */

import { log } from '@/logger'
import type { TableInteraction$ } from '../../../stores/pure-observables'

const fileLog = log('components/custom/vibegrid/renderers/modules/SelectionController.ts')

export interface SelectionControllerOptions {
  tableInteraction$: TableInteraction$
  getProcessedRows: () => any[]
  getVisibleColumns: () => any[]
}

export class SelectionController {
  private tableInteraction$: TableInteraction$
  private getProcessedRows: () => any[]
  private getVisibleColumns: () => any[]
  private lastSelectedRowId: string | null = null

  constructor(options: SelectionControllerOptions) {
    this.tableInteraction$ = options.tableInteraction$
    this.getProcessedRows = options.getProcessedRows
    this.getVisibleColumns = options.getVisibleColumns
  }

  /**
   * Select all cells in the table
   */
  selectAllCells(): void {
    const processedRows = this.getProcessedRows()
    const visibleColumns = this.getVisibleColumns()
    const selectedCells = new Set<string>()

    for (const row of processedRows) {
      for (const column of visibleColumns) {
        if (column.id === 'selection') continue
        selectedCells.add(`${row.id}:${column.id}`)
      }
    }

    this.tableInteraction$.selectedCells.set(selectedCells)
    fileLog.info('Selected all cells', { count: selectedCells.size })
  }

  /**
   * Select an entire column
   */
  selectColumn(columnId: string): void {
    const processedRows = this.getProcessedRows()
    const selectedCells = new Set<string>()

    for (const row of processedRows) {
      selectedCells.add(`${row.id}:${columnId}`)
    }

    this.tableInteraction$.selectedCells.set(selectedCells)
    this.tableInteraction$.anchorCell.set(`${processedRows[0]?.id}:${columnId}`)

    fileLog.info('Column selected', {
      columnId,
      cellCount: selectedCells.size,
    })
  }

  /**
   * Select an entire row
   */
  selectRow(rowId: string): void {
    const visibleColumns = this.getVisibleColumns()
    const selectedCells = new Set<string>()

    for (const column of visibleColumns) {
      if (column.id === 'selection') continue
      selectedCells.add(`${rowId}:${column.id}`)
    }

    this.tableInteraction$.selectedCells.set(selectedCells)
    this.tableInteraction$.anchorCell.set(`${rowId}:${visibleColumns[0]?.id}`)
    this.lastSelectedRowId = rowId

    fileLog.info('Row selected', {
      rowId,
      cellCount: selectedCells.size,
    })
  }

  /**
   * Toggle row selection
   */
  toggleRowSelection(rowId: string): void {
    const visibleColumns = this.getVisibleColumns()
    const currentSelection = this.tableInteraction$.selectedCells.get()
    const newSelection = new Set(currentSelection)

    const rowCells: string[] = []
    for (const column of visibleColumns) {
      if (column.id === 'selection') continue
      rowCells.push(`${rowId}:${column.id}`)
    }

    const isRowSelected = rowCells.every((cellId) => currentSelection.has(cellId))

    if (isRowSelected) {
      // Deselect row
      for (const cellId of rowCells) {
        newSelection.delete(cellId)
      }
      fileLog.info('Row deselected', { rowId })
    } else {
      // Select row
      for (const cellId of rowCells) {
        newSelection.add(cellId)
      }
      fileLog.info('Row selected', { rowId })
    }

    this.tableInteraction$.selectedCells.set(newSelection)
    this.lastSelectedRowId = rowId
  }

  /**
   * Select a range of rows
   */
  selectRowRange(startRowId: string, endRowId: string): void {
    const processedRows = this.getProcessedRows()
    const visibleColumns = this.getVisibleColumns()

    const startRowIndex = processedRows.findIndex((r) => r.id === startRowId)
    const endRowIndex = processedRows.findIndex((r) => r.id === endRowId)

    if (startRowIndex === -1 || endRowIndex === -1) {
      fileLog.warn('Could not find row indices for range selection', {
        startRowId,
        endRowId,
        startRowIndex,
        endRowIndex,
      })
      return
    }

    const minRowIndex = Math.min(startRowIndex, endRowIndex)
    const maxRowIndex = Math.max(startRowIndex, endRowIndex)

    const selectedCells = new Set<string>()

    for (let r = minRowIndex; r <= maxRowIndex; r++) {
      const row = processedRows[r]
      for (const column of visibleColumns) {
        if (column.id === 'selection') continue
        selectedCells.add(`${row.id}:${column.id}`)
      }
    }

    this.tableInteraction$.selectedCells.set(selectedCells)
    this.tableInteraction$.anchorCell.set(`${startRowId}:${visibleColumns[0]?.id}`)

    fileLog.info('Row range selected', {
      startRowId,
      endRowId,
      rowCount: maxRowIndex - minRowIndex + 1,
      cellCount: selectedCells.size,
    })
  }

  /**
   * Select range of cells (for keyboard navigation)
   */
  selectCellRange(startCell: string, endCell: string): void {
    const [startRowId, startColumnId] = startCell.split(':')
    const [endRowId, endColumnId] = endCell.split(':')

    const processedRows = this.getProcessedRows()
    const visibleColumns = this.getVisibleColumns()

    const startRowIndex = processedRows.findIndex((r) => r.id === startRowId)
    const endRowIndex = processedRows.findIndex((r) => r.id === endRowId)
    const startColIndex = visibleColumns.findIndex((c) => c.id === startColumnId)
    const endColIndex = visibleColumns.findIndex((c) => c.id === endColumnId)

    if (startRowIndex === -1 || endRowIndex === -1 || startColIndex === -1 || endColIndex === -1) {
      return
    }

    const minRowIndex = Math.min(startRowIndex, endRowIndex)
    const maxRowIndex = Math.max(startRowIndex, endRowIndex)
    const minColIndex = Math.min(startColIndex, endColIndex)
    const maxColIndex = Math.max(startColIndex, endColIndex)

    const selectedCells = new Set<string>()

    for (let r = minRowIndex; r <= maxRowIndex; r++) {
      const row = processedRows[r]
      for (let c = minColIndex; c <= maxColIndex; c++) {
        const column = visibleColumns[c]
        if (column.id !== 'selection') {
          selectedCells.add(`${row.id}:${column.id}`)
        }
      }
    }

    this.tableInteraction$.selectedCells.set(selectedCells)

    fileLog.info('Cell range selected', {
      startCell,
      endCell,
      cellCount: selectedCells.size,
    })
  }

  /**
   * Clear all selections
   */
  clearSelection(): void {
    this.tableInteraction$.selectedCells.set(new Set())
    this.tableInteraction$.anchorCell.set(null)
    this.lastSelectedRowId = null
    fileLog.info('Selection cleared')
  }

  /**
   * Get the last selected row ID
   */
  getLastSelectedRowId(): string | null {
    return this.lastSelectedRowId
  }

  /**
   * Set the last selected row ID
   */
  setLastSelectedRowId(rowId: string | null): void {
    this.lastSelectedRowId = rowId
  }

  /**
   * Handle row checkbox toggle
   */
  handleRowCheckboxToggle(rowId: string, isShiftKey: boolean): void {
    if (isShiftKey && this.lastSelectedRowId) {
      // Select range of rows
      this.selectRowRange(this.lastSelectedRowId, rowId)
    } else {
      // Toggle single row
      this.toggleRowSelection(rowId)
    }
  }

  /**
   * Update select all checkbox state
   */
  getSelectAllState(): { checked: boolean; indeterminate: boolean } {
    const processedRows = this.getProcessedRows()
    const visibleColumns = this.getVisibleColumns()
    const selectedCells = this.tableInteraction$.selectedCells.get()

    if (processedRows.length === 0 || visibleColumns.length === 0) {
      return { checked: false, indeterminate: false }
    }

    let totalCells = 0
    let selectedCount = 0

    for (const row of processedRows) {
      for (const column of visibleColumns) {
        if (column.id === 'selection') continue
        totalCells++
        if (selectedCells.has(`${row.id}:${column.id}`)) {
          selectedCount++
        }
      }
    }

    if (selectedCount === 0) {
      return { checked: false, indeterminate: false }
    } else if (selectedCount === totalCells) {
      return { checked: true, indeterminate: false }
    } else {
      return { checked: false, indeterminate: true }
    }
  }
}
