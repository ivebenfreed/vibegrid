/**
 * SelectionController - Manages all selection operations for VibeGrid
 * Handles cell, row, column, and range selection logic
 *
 * MIGRATED TO MOBX - uses InteractionStore directly
 */

import { runInAction } from 'mobx'
import { toast } from 'sonner'
import { getLogger } from '@/shared/lib/logging'
import type { InteractionStore } from '../../stores/InteractionStore'
import { isSparsePlaceholder } from '../../stores/TableCoreStore'

const fileLog = getLogger(['custom', 'vibegrid', 'renderers', 'modules', 'SelectionController.ts'])

export interface SelectionControllerOptions {
  interactionStore: InteractionStore
  getProcessedRows: () => any[]
  getVisibleColumns: () => any[]
  bodyRenderer?: any // For updating checkbox visual state
  /**
   * GH#2804 B10: optional entity-name accessor used at select-all time to
   * decide whether to enter marker mode. Returns the canonical entity type
   * (e.g. 'RFI', 'Project'). When omitted, select-all always uses the legacy
   * O(N) Set-population path.
   */
  getEntityName?: () => string | null
}

export class SelectionController {
  private interactionStore: InteractionStore
  private getProcessedRows: () => any[]
  private getVisibleColumns: () => any[]
  private getEntityName: () => string | null
  public bodyRenderer?: any // Public to allow SimplePassiveRenderer to set it
  private lastSelectedRowId: string | null = null

  constructor(options: SelectionControllerOptions) {
    this.interactionStore = options.interactionStore
    this.getProcessedRows = options.getProcessedRows
    this.getVisibleColumns = options.getVisibleColumns
    this.getEntityName = options.getEntityName ?? (() => null)
    this.bodyRenderer = options.bodyRenderer
  }

  /**
   * Select all cells in the table
   */
  selectAllCells(): void {
    const processedRows = this.getProcessedRows()
    const visibleColumns = this.getVisibleColumns()
    const selectedCells = new Set<string>()

    // GH#2812 sparse guard: for-of on a sparse array yields undefined for
    // holes (ECMA-262 §22.1.5). Skip holes + sparse placeholders so unloaded
    // rows are not added to the selection.
    for (const row of processedRows) {
      if (!row || isSparsePlaceholder(row)) continue
      for (const column of visibleColumns) {
        if (column.id === 'selection') continue
        selectedCells.add(`${row.id}:${column.id}`)
      }
    }

    runInAction(() => {
      this.interactionStore.selectedCells = selectedCells
      this.interactionStore.selectionVersion++
    })
    fileLog.debug('Selected all cells', { count: selectedCells.size })
  }

  /**
   * Select an entire column
   */
  selectColumn(columnId: string): void {
    const processedRows = this.getProcessedRows()

    // Use interaction store method to ensure proper state management
    this.interactionStore.selectColumnCells(columnId, processedRows)

    fileLog.debug('Column selected via InteractionStore', {
      columnId,
      rowCount: processedRows.length,
    })
  }

  /**
   * Select an entire row
   */
  selectRow(rowId: string): void {
    const visibleColumns = this.getVisibleColumns()

    // Use interaction store method to ensure proper state management
    this.interactionStore.selectRowCells(rowId, visibleColumns)

    this.lastSelectedRowId = rowId

    // Update checkbox visual state
    if (this.bodyRenderer?.updateAllRowCheckboxes) {
      this.bodyRenderer.updateAllRowCheckboxes()
    }

    fileLog.debug('Row selected via InteractionStore', {
      rowId,
      columnCount: visibleColumns.length,
    })
  }

  /**
   * Toggle row selection
   */
  toggleRowSelection(rowId: string): void {
    const visibleColumns = this.getVisibleColumns()

    // Use interaction store method to ensure proper state management
    this.interactionStore.toggleRowCells(rowId, visibleColumns)

    this.lastSelectedRowId = rowId

    // Update checkbox visual state
    if (this.bodyRenderer?.updateAllRowCheckboxes) {
      this.bodyRenderer.updateAllRowCheckboxes()
    }

    fileLog.debug('Row selection toggled via InteractionStore', { rowId })
  }

  /**
   * Select a range of rows
   */
  selectRowRange(startRowId: string, endRowId: string): void {
    const processedRows = this.getProcessedRows()
    const visibleColumns = this.getVisibleColumns()

    // GH#2812 sparse guard: findIndex visits holes as undefined per
    // ECMA-262 §22.1.3.10, so we must guard `r` before accessing `.id`.
    const startRowIndex = processedRows.findIndex((r) => r && r.id === startRowId)
    const endRowIndex = processedRows.findIndex((r) => r && r.id === endRowId)

    // GH#2804 B7 sparse guard: when start or end is in an unloaded window,
    // findIndex returns -1 (placeholders share an id). The previous fallback
    // selected ALL loaded rows, which is wrong — that silently selects rows
    // outside the user's intended range.
    // GH#2804 review fix: refuse the operation, leave selection unchanged,
    // and surface a transient toast asking the user to scroll first.
    if (startRowIndex === -1 || endRowIndex === -1) {
      fileLog.warn('Range select start/end not loaded — refusing to select', {
        startRowId,
        endRowId,
        startRowIndex,
        endRowIndex,
      })
      toast.message('Range select unavailable — endpoint rows not loaded. Scroll to load them and try again.')
      return
    }

    const minRowIndex = Math.min(startRowIndex, endRowIndex)
    const maxRowIndex = Math.max(startRowIndex, endRowIndex)

    const selectedCells = new Set<string>()
    let loadedInRange = 0
    let sparseInRange = 0

    for (let r = minRowIndex; r <= maxRowIndex; r++) {
      const row = processedRows[r]
      // GH#2804 B7 sparse guard: skip placeholder rows; their shared id
      // would collapse the selection set + bulk actions can't operate on them.
      if (!row || isSparsePlaceholder(row)) {
        sparseInRange++
        continue
      }
      loadedInRange++
      for (const column of visibleColumns) {
        if (column.id === 'selection') continue
        selectedCells.add(`${row.id}:${column.id}`)
      }
    }

    if (sparseInRange > 0) {
      const requested = maxRowIndex - minRowIndex + 1
      toast.message(`Selected ${loadedInRange} of ${requested} rows in range — scroll to load more.`)
    }

    runInAction(() => {
      this.interactionStore.selectedCells = selectedCells
      this.interactionStore.anchorCell = `${startRowId}:${visibleColumns[0]?.id}`
      // CRITICAL: Increment selectionVersion so SelectionOverlayController updates
      this.interactionStore.selectionVersion++
    })

    // Update checkbox visual state
    if (this.bodyRenderer?.updateAllRowCheckboxes) {
      this.bodyRenderer.updateAllRowCheckboxes()
    }

    fileLog.debug('Row range selected', {
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

    // GH#2812 sparse guard: findIndex visits holes as undefined per
    // ECMA-262 §22.1.3.10, so we must guard `r` before accessing `.id`.
    const startRowIndex = processedRows.findIndex((r) => r && r.id === startRowId)
    const endRowIndex = processedRows.findIndex((r) => r && r.id === endRowId)
    const startColIndex = visibleColumns.findIndex((c) => c.id === startColumnId)
    const endColIndex = visibleColumns.findIndex((c) => c.id === endColumnId)

    if (startColIndex === -1 || endColIndex === -1) {
      return
    }

    // GH#2804 B7 sparse guard: when start or end row is unloaded, the previous
    // fallback selected ALL loaded rows — which silently selects rows outside
    // the user's intended range.
    // GH#2804 review fix: refuse the operation, leave selection unchanged,
    // and surface a transient toast asking the user to scroll first.
    if (startRowIndex === -1 || endRowIndex === -1) {
      toast.message('Range select unavailable — endpoint rows not loaded. Scroll to load them and try again.')
      return
    }

    const minRowIndex = Math.min(startRowIndex, endRowIndex)
    const maxRowIndex = Math.max(startRowIndex, endRowIndex)
    const minColIndex = Math.min(startColIndex, endColIndex)
    const maxColIndex = Math.max(startColIndex, endColIndex)

    const selectedCells = new Set<string>()
    let sparseInRange = 0
    let loadedInRange = 0

    for (let r = minRowIndex; r <= maxRowIndex; r++) {
      const row = processedRows[r]
      // GH#2804 B7 sparse guard: no-op on sparse placeholder; never add
      // `__sparse__:column` entries to the selection set.
      if (!row || isSparsePlaceholder(row)) {
        sparseInRange++
        continue
      }
      loadedInRange++
      for (let c = minColIndex; c <= maxColIndex; c++) {
        const column = visibleColumns[c]
        if (column.id !== 'selection') {
          selectedCells.add(`${row.id}:${column.id}`)
        }
      }
    }

    if (sparseInRange > 0) {
      const requested = maxRowIndex - minRowIndex + 1
      toast.message(`Selected ${loadedInRange} of ${requested} rows in range — scroll to load more.`)
    }

    runInAction(() => {
      this.interactionStore.selectedCells = selectedCells
      this.interactionStore.selectionVersion++
    })

    fileLog.debug('Cell range selected', {
      startCell,
      endCell,
      cellCount: selectedCells.size,
    })
  }

  /**
   * Clear all selections
   */
  clearSelection(): void {
    // Use interaction store method to ensure proper state management
    this.interactionStore.clearSelection()
    this.lastSelectedRowId = null
    fileLog.debug('Selection cleared via InteractionStore')
  }

  /**
   * Select all cells in the table (for select all checkbox)
   *
   * GH#2806 P8: marker-model select-all is unconditional (O(1) — set
   * selectionMarkerMode to 'all-with-exclusions') so 100k-row grids don't
   * materialize a 100k-element Set. The legacy O(N) Set-population path was
   * removed when substrate became the unconditional VibeGrid data path.
   */
  handleSelectAllToggle(): void {
    const interaction = this.interactionStore
    const isMarkerActive = interaction.selectionMarkerMode === 'all-with-exclusions'
    const selectedCells = interaction.selectedCells
    const processedRows = this.getProcessedRows()
    const visibleColumns = this.getVisibleColumns()
    const entityName = this.getEntityName()

    fileLog.debug('🎯 Select all checkbox toggled', {
      currentSelection: selectedCells.size,
      totalRows: processedRows.length,
      totalColumns: visibleColumns.length,
      entityName,
      isMarkerActive,
    })

    // If marker mode is currently active, "select all" toggle = deselect
    // (clear marker + selections). Bypasses the legacy `selectedCells.size === 0`
    // branch which would otherwise re-select.
    if (isMarkerActive) {
      this.interactionStore.clearSelection()
      fileLog.debug('✅ Marker mode cleared via SelectionController')
    } else if (selectedCells.size === 0) {
      // GH#2806 P8: unconditional O(1) select-all via marker mode. NO Set
      // populated with 100k ids. Bulk actions iterate via
      // iterateSelectedRowIds().
      this.interactionStore.setSelectionMode('all-with-exclusions')
      fileLog.debug('✅ Marker-mode select-all triggered', { entityName })
    } else {
      // Has selection - clear all via interaction store
      this.interactionStore.clearSelection()
      fileLog.debug('✅ Clear selection triggered via SelectionController')
    }

    // Update checkbox visual state
    if (this.bodyRenderer?.updateAllRowCheckboxes) {
      this.bodyRenderer.updateAllRowCheckboxes()
    }
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
   * Update select all checkbox state (reactive)
   */
  getSelectAllState(): { checked: boolean; indeterminate: boolean } {
    const processedRows = this.getProcessedRows()
    const visibleColumns = this.getVisibleColumns()

    if (processedRows.length === 0 || visibleColumns.length === 0) {
      return { checked: false, indeterminate: false }
    }

    // Use reactive checkbox states from interaction store
    const checkboxStates = this.interactionStore.getRowCheckboxStates(processedRows, visibleColumns)

    // GH#2812 sparse guard: for-of yields undefined for holes (ECMA-262
    // §22.1.5). Count loaded rows separately so the "all selected" comparison
    // doesn't include unloaded sparse indices.
    let totalRows = 0
    let selectedRowCount = 0

    for (const row of processedRows) {
      if (!row || isSparsePlaceholder(row)) continue
      totalRows++
      if (checkboxStates.get(row.id)) {
        selectedRowCount++
      }
    }

    if (selectedRowCount === 0) {
      return { checked: false, indeterminate: false }
    } else if (selectedRowCount === totalRows) {
      return { checked: true, indeterminate: false }
    } else {
      return { checked: false, indeterminate: true }
    }
  }
}
