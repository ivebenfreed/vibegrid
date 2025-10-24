/**
 * KeyboardNavigationController - Handles keyboard navigation for VibeGrid
 * Manages arrow key movement, keyboard selection, and keyboard shortcuts
 *
 * MIGRATED TO MOBX - uses InteractionStore directly
 */

import { createLogger } from '@/lib/logging';
import { runInAction } from 'mobx';
import type { InteractionStore } from '../../stores/InteractionStore';
import { SelectionController } from './SelectionController';

const fileLog = createLogger('components/custom/vibegrid/renderers/modules/KeyboardNavigationController.ts');

export interface KeyboardNavigationOptions {
  interactionStore: InteractionStore;
  selectionController: SelectionController;
  getProcessedRows: () => any[];
  getVisibleColumns: () => any[];
  container: HTMLElement;
}

export class KeyboardNavigationController {
  private interactionStore: InteractionStore;
  private selectionController: SelectionController;
  private getProcessedRows: () => any[];
  private getVisibleColumns: () => any[];
  private container: HTMLElement;

  constructor(options: KeyboardNavigationOptions) {
    this.interactionStore = options.interactionStore;
    this.selectionController = options.selectionController;
    this.getProcessedRows = options.getProcessedRows;
    this.getVisibleColumns = options.getVisibleColumns;
    this.container = options.container;
  }

  /**
   * Handle arrow key navigation
   */
  handleArrowKey(direction: 'up' | 'down' | 'left' | 'right', isShiftKey: boolean): void {
    const processedRows = this.getProcessedRows();
    const visibleColumns = this.getVisibleColumns();
    const focusedCell = this.interactionStore.focusedCell;

    fileLog.debug('Handling arrow key', { direction, isShiftKey, focusedCell });

    // Ensure we have rows and columns
    if (processedRows.length === 0 || visibleColumns.length === 0) {
      return;
    }

    // If no focused cell, focus the first cell
    if (!focusedCell) {
      const firstRow = processedRows[0];
      const firstColumn = visibleColumns.find(c => c.id !== 'selection') || visibleColumns[0];
      const firstCellId = `${firstRow.id}:${firstColumn.id}`;
      this.interactionStore.setFocusedCell(firstCellId);
      this.interactionStore.toggleCellSelection(firstRow.id, firstColumn.id, false, false);
      return;
    }

    const [currentRowId, currentColumnId] = focusedCell.split(':');
    const currentRowIndex = processedRows.findIndex(r => r.id === currentRowId);
    const currentColIndex = visibleColumns.findIndex(c => c.id === currentColumnId);

    if (currentRowIndex === -1 || currentColIndex === -1) {
      return;
    }

    let newRowIndex = currentRowIndex;
    let newColIndex = currentColIndex;

    switch (direction) {
      case 'up':
        newRowIndex = Math.max(0, currentRowIndex - 1);
        break;
      case 'down':
        newRowIndex = Math.min(processedRows.length - 1, currentRowIndex + 1);
        break;
      case 'left':
        newColIndex = Math.max(0, currentColIndex - 1);
        // Skip selection column
        if (visibleColumns[newColIndex]?.id === 'selection' && newColIndex > 0) {
          newColIndex--;
        }
        break;
      case 'right':
        newColIndex = Math.min(visibleColumns.length - 1, currentColIndex + 1);
        // Skip selection column
        if (visibleColumns[newColIndex]?.id === 'selection' && newColIndex < visibleColumns.length - 1) {
          newColIndex++;
        }
        break;
    }

    const newRow = processedRows[newRowIndex];
    const newColumn = visibleColumns[newColIndex];
    const newCellId = `${newRow.id}:${newColumn.id}`;

    this.interactionStore.setFocusedCell(newCellId);

    if (isShiftKey) {
      // Range selection
      const anchorCell = this.interactionStore.anchorCell;
      const selectionAnchor = anchorCell || `${currentRowId}:${currentColumnId}`;
      this.selectKeyboardRange(selectionAnchor, newCellId);
    } else {
      // Single cell selection - anchor will be set by setFocusedCell
      this.interactionStore.toggleCellSelection(newRow.id, newColumn.id, false, false);
    }

    // Ensure the focused cell is visible
    this.scrollCellIntoView(newRow.id, newColumn.id);
  }

  /**
   * Select range using keyboard navigation
   */
  private selectKeyboardRange(startCell: string, endCell: string): void {
    this.selectionController.selectCellRange(startCell, endCell);
  }

  /**
   * Scroll cell into view if needed
   */
  private scrollCellIntoView(rowId: string, columnId: string): void {
    const cellElement = this.container.querySelector(
      `.vibegridx-cell[data-row-id="${rowId}"][data-column-id="${columnId}"]`
    ) as HTMLElement;

    if (cellElement) {
      cellElement.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'nearest'
      });
    }
  }

  /**
   * Handle keyboard events
   */
  handleKeyDown(event: KeyboardEvent): boolean {
    const isCtrlKey = event.ctrlKey || event.metaKey;
    const isShiftKey = event.shiftKey;

    switch (event.key) {
      case 'a':
      case 'A':
        if (isCtrlKey) {
          event.preventDefault();
          // REACTIVE: Select all directly via InteractionStore
          const processedRows = this.getProcessedRows();
          const visibleColumns = this.getVisibleColumns();
          this.interactionStore.selectAll({
            rows: processedRows,
            columns: visibleColumns,
            columnVisibility: Object.fromEntries(visibleColumns.map(col => [col.id, true]))
          });
          fileLog.debug('⌨️ Ctrl+A select all triggered via InteractionStore');
          return true;
        }
        break;

      case 'ArrowUp':
        event.preventDefault();
        this.handleArrowKey('up', isShiftKey);
        return true;

      case 'ArrowDown':
        event.preventDefault();
        this.handleArrowKey('down', isShiftKey);
        return true;

      case 'ArrowLeft':
        event.preventDefault();
        this.handleArrowKey('left', isShiftKey);
        return true;

      case 'ArrowRight':
        event.preventDefault();
        this.handleArrowKey('right', isShiftKey);
        return true;

      case 'Enter':
        // Use InteractionStore focused cell
        const focusedCell = this.interactionStore.focusedCell;
        if (focusedCell) {
          const [rowId, columnId] = focusedCell.split(':');
          const cellId = `${rowId}:${columnId}`;

          // Check if column is editable before starting edit mode
          const columns = this.getVisibleColumns();
          const column = columns.find(c => c.id === columnId);
          if (column && column.editable === false) {
            return true; // Consume the event but don't start editing
          }

          // Get current value
          const processedRows = this.getProcessedRows();
          const row = processedRows.find(r => r.id === rowId);
          const value = row ? row[columnId] : '';

          // Start editing
          this.interactionStore.startEdit(cellId, value ? String(value) : '');
          return true;
        }
        break;

      case 'Escape':
        // If currently editing, just cancel the edit and keep selection
        if (this.interactionStore.isEditing) {
          this.interactionStore.cancelEdit();
          // Keep the cell selected after canceling edit and focus container for keyboard events
          this.container.focus();
          return true;
        }

        // If not editing, clear selection
        this.interactionStore.clearSelection();
        this.interactionStore.setFocusedCell(null);
        return true;

      case 'Delete':
      case 'Backspace':
        const currentFocusedCell = this.interactionStore.focusedCell;
        if (currentFocusedCell && !event.target ||
            (event.target as HTMLElement).tagName !== 'INPUT') {
          // Could trigger delete action here
          fileLog.debug('Delete key pressed on focused cell', { focusedCell: currentFocusedCell });
          return true;
        }
        break;
    }

    return false;
  }

  /**
   * Set focused cell from external interaction
   */
  setFocusedCell(cellId: string | null): void {
    // Use InteractionStore only - no local state
    this.interactionStore.setFocusedCell(cellId);
  }

  /**
   * Get current focused cell
   */
  getFocusedCell(): string | null {
    return this.interactionStore.focusedCell;
  }

  /**
   * Set selection anchor for range selection
   */
  setSelectionAnchor(cellId: string | null): void {
    runInAction(() => {
      this.interactionStore.anchorCell = cellId;
    });
  }

  /**
   * Get current selection anchor
   */
  getSelectionAnchor(): string | null {
    return this.interactionStore.anchorCell;
  }

  /**
   * Clear keyboard navigation state
   */
  clear(): void {
    runInAction(() => {
      this.interactionStore.setFocusedCell(null);
      this.interactionStore.anchorCell = null;
    });
  }
}
