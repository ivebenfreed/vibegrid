/**
 * SelectionController - Manages all selection operations for VibeGrid
 * Handles cell, row, column, and range selection logic
 *
 * MIGRATED TO MOBX - uses InteractionStore directly
 */

import { createLogger } from '@/lib/logging';
import { runInAction } from 'mobx';
import type { InteractionStore } from '../../stores/InteractionStore';

const fileLog = createLogger('components/custom/vibegrid/renderers/modules/SelectionController.ts');

export interface SelectionControllerOptions {
  interactionStore: InteractionStore;
  getProcessedRows: () => any[];
  getVisibleColumns: () => any[];
  bodyRenderer?: any; // For updating checkbox visual state
}

export class SelectionController {
  private interactionStore: InteractionStore;
  private getProcessedRows: () => any[];
  private getVisibleColumns: () => any[];
  public bodyRenderer?: any; // Public to allow SimplePassiveRenderer to set it
  private lastSelectedRowId: string | null = null;

  constructor(options: SelectionControllerOptions) {
    this.interactionStore = options.interactionStore;
    this.getProcessedRows = options.getProcessedRows;
    this.getVisibleColumns = options.getVisibleColumns;
    this.bodyRenderer = options.bodyRenderer;
  }

  /**
   * Select all cells in the table
   */
  selectAllCells(): void {
    const processedRows = this.getProcessedRows();
    const visibleColumns = this.getVisibleColumns();
    const selectedCells = new Set<string>();

    for (const row of processedRows) {
      for (const column of visibleColumns) {
        if (column.id === 'selection') continue;
        selectedCells.add(`${row.id}:${column.id}`);
      }
    }

    runInAction(() => {
      this.interactionStore.selectedCells = selectedCells;
    });
    fileLog.debug('Selected all cells', { count: selectedCells.size });
  }

  /**
   * Select an entire column
   */
  selectColumn(columnId: string): void {
    const processedRows = this.getProcessedRows();

    // Use interaction store method to ensure proper state management
    this.interactionStore.selectColumnCells(columnId, processedRows);

    fileLog.debug('Column selected via InteractionStore', {
      columnId,
      rowCount: processedRows.length
    });
  }

  /**
   * Select an entire row
   */
  selectRow(rowId: string): void {
    const visibleColumns = this.getVisibleColumns();

    // Use interaction store method to ensure proper state management
    this.interactionStore.selectRowCells(rowId, visibleColumns);

    this.lastSelectedRowId = rowId;

    // Update checkbox visual state
    if (this.bodyRenderer?.updateAllRowCheckboxes) {
      this.bodyRenderer.updateAllRowCheckboxes();
    }

    fileLog.debug('Row selected via InteractionStore', {
      rowId,
      columnCount: visibleColumns.length
    });
  }

  /**
   * Toggle row selection
   */
  toggleRowSelection(rowId: string): void {
    const visibleColumns = this.getVisibleColumns();

    // Use interaction store method to ensure proper state management
    this.interactionStore.toggleRowCells(rowId, visibleColumns);

    this.lastSelectedRowId = rowId;

    // Update checkbox visual state
    if (this.bodyRenderer?.updateAllRowCheckboxes) {
      this.bodyRenderer.updateAllRowCheckboxes();
    }

    fileLog.debug('Row selection toggled via InteractionStore', { rowId });
  }

  /**
   * Select a range of rows
   */
  selectRowRange(startRowId: string, endRowId: string): void {
    const processedRows = this.getProcessedRows();
    const visibleColumns = this.getVisibleColumns();

    const startRowIndex = processedRows.findIndex(r => r.id === startRowId);
    const endRowIndex = processedRows.findIndex(r => r.id === endRowId);

    if (startRowIndex === -1 || endRowIndex === -1) {
      fileLog.warn('Could not find row indices for range selection', {
        startRowId,
        endRowId,
        startRowIndex,
        endRowIndex
      });
      return;
    }

    const minRowIndex = Math.min(startRowIndex, endRowIndex);
    const maxRowIndex = Math.max(startRowIndex, endRowIndex);

    const selectedCells = new Set<string>();

    for (let r = minRowIndex; r <= maxRowIndex; r++) {
      const row = processedRows[r];
      for (const column of visibleColumns) {
        if (column.id === 'selection') continue;
        selectedCells.add(`${row.id}:${column.id}`);
      }
    }

    runInAction(() => {
      this.interactionStore.selectedCells = selectedCells;
      this.interactionStore.anchorCell = `${startRowId}:${visibleColumns[0]?.id}`;
    });

    // Update checkbox visual state
    if (this.bodyRenderer?.updateAllRowCheckboxes) {
      this.bodyRenderer.updateAllRowCheckboxes();
    }

    fileLog.debug('Row range selected', {
      startRowId,
      endRowId,
      rowCount: maxRowIndex - minRowIndex + 1,
      cellCount: selectedCells.size
    });
  }

  /**
   * Select range of cells (for keyboard navigation)
   */
  selectCellRange(startCell: string, endCell: string): void {
    const [startRowId, startColumnId] = startCell.split(':');
    const [endRowId, endColumnId] = endCell.split(':');

    const processedRows = this.getProcessedRows();
    const visibleColumns = this.getVisibleColumns();

    const startRowIndex = processedRows.findIndex(r => r.id === startRowId);
    const endRowIndex = processedRows.findIndex(r => r.id === endRowId);
    const startColIndex = visibleColumns.findIndex(c => c.id === startColumnId);
    const endColIndex = visibleColumns.findIndex(c => c.id === endColumnId);

    if (startRowIndex === -1 || endRowIndex === -1 || startColIndex === -1 || endColIndex === -1) {
      return;
    }

    const minRowIndex = Math.min(startRowIndex, endRowIndex);
    const maxRowIndex = Math.max(startRowIndex, endRowIndex);
    const minColIndex = Math.min(startColIndex, endColIndex);
    const maxColIndex = Math.max(startColIndex, endColIndex);

    const selectedCells = new Set<string>();

    for (let r = minRowIndex; r <= maxRowIndex; r++) {
      const row = processedRows[r];
      for (let c = minColIndex; c <= maxColIndex; c++) {
        const column = visibleColumns[c];
        if (column.id !== 'selection') {
          selectedCells.add(`${row.id}:${column.id}`);
        }
      }
    }

    runInAction(() => {
      this.interactionStore.selectedCells = selectedCells;
    });

    fileLog.debug('Cell range selected', {
      startCell,
      endCell,
      cellCount: selectedCells.size
    });
  }

  /**
   * Clear all selections
   */
  clearSelection(): void {
    // Use interaction store method to ensure proper state management
    this.interactionStore.clearSelection();
    this.lastSelectedRowId = null;
    fileLog.debug('Selection cleared via InteractionStore');
  }

  /**
   * Select all cells in the table (for select all checkbox)
   */
  handleSelectAllToggle(): void {
    const selectedCells = this.interactionStore.selectedCells;
    const processedRows = this.getProcessedRows();
    const visibleColumns = this.getVisibleColumns();

    fileLog.debug('🎯 Select all checkbox toggled', {
      currentSelection: selectedCells.size,
      totalRows: processedRows.length,
      totalColumns: visibleColumns.length
    });

    if (selectedCells.size === 0) {
      // No selection - select all cells via interaction store
      this.interactionStore.selectAll({
        rows: processedRows,
        columns: visibleColumns,
        columnVisibility: this.getColumnVisibility()
      });
      fileLog.debug('✅ Select all triggered via SelectionController');
    } else {
      // Has selection - clear all via interaction store
      this.interactionStore.clearSelection();
      fileLog.debug('✅ Clear selection triggered via SelectionController');
    }

    // Update checkbox visual state
    if (this.bodyRenderer?.updateAllRowCheckboxes) {
      this.bodyRenderer.updateAllRowCheckboxes();
    }
  }

  /**
   * Get column visibility for interaction state
   */
  private getColumnVisibility(): Record<string, boolean> {
    const visibleColumns = this.getVisibleColumns();
    const columnVisibility: Record<string, boolean> = {};

    visibleColumns.forEach(col => {
      columnVisibility[col.id] = true;
    });

    return columnVisibility;
  }

  /**
   * Get the last selected row ID
   */
  getLastSelectedRowId(): string | null {
    return this.lastSelectedRowId;
  }

  /**
   * Set the last selected row ID
   */
  setLastSelectedRowId(rowId: string | null): void {
    this.lastSelectedRowId = rowId;
  }

  /**
   * Handle row checkbox toggle
   */
  handleRowCheckboxToggle(rowId: string, isShiftKey: boolean): void {
    if (isShiftKey && this.lastSelectedRowId) {
      // Select range of rows
      this.selectRowRange(this.lastSelectedRowId, rowId);
    } else {
      // Toggle single row
      this.toggleRowSelection(rowId);
    }
  }

  /**
   * Update select all checkbox state (reactive)
   */
  getSelectAllState(): { checked: boolean; indeterminate: boolean } {
    const processedRows = this.getProcessedRows();
    const visibleColumns = this.getVisibleColumns();

    if (processedRows.length === 0 || visibleColumns.length === 0) {
      return { checked: false, indeterminate: false };
    }

    // Use reactive checkbox states from interaction store
    const checkboxStates = this.interactionStore.getRowCheckboxStates(processedRows, visibleColumns);

    const totalRows = processedRows.length;
    let selectedRowCount = 0;

    for (const row of processedRows) {
      if (checkboxStates.get(row.id)) {
        selectedRowCount++;
      }
    }

    if (selectedRowCount === 0) {
      return { checked: false, indeterminate: false };
    } else if (selectedRowCount === totalRows) {
      return { checked: true, indeterminate: false };
    } else {
      return { checked: false, indeterminate: true };
    }
  }
}
