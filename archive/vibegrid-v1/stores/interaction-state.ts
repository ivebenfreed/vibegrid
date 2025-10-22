/**
 * Interaction State - tableInteraction$ observable
 * Extracted from pure-observables.ts lines 872-1437
 *
 * This module handles all UI interaction state including selection, editing,
 * hover, drag, and menu states. This is the most complex layer with ~566 lines
 * of sophisticated interaction logic.
 */

import { observable, computed, batch } from '@legendapp/state';
import { getUpdateFunction } from '../utils/entity-update-helpers';
import { log } from '@/logger';

const fileLog = log('components/custom/vibegrid/stores/interaction-state.ts');

// ====================================
// TYPES
// ====================================

export interface TableInteractionState {
  // Selection state
  selectedCells: Set<string>;
  selectedRows: Set<string>;
  anchorCell: string | null;
  selectionMode: 'cell' | 'row' | 'range' | 'multi';
  isSelecting: boolean;

  // Select all checkbox state
  selectAllCheckboxState: {
    checked: boolean;
    indeterminate: boolean;
  };

  // Editing state
  editingCell: string | null;
  editValue: any;
  isEditing: boolean;
  editValidation: { isValid: boolean; message?: string } | null;

  // Focus state (keyboard navigation)
  focusedCell: string | null;
  anchorCell: string | null;

  // Hover state
  hoveredCell: string | null;
  hoveredRow: string | null;

  // Drag state
  isDragging: boolean;
  dragSource: string | null;
  dragTarget: string | null;

  // Resize state
  resizingColumn: string | null;
  resizeStartX: number;
  resizeStartWidth: number;

  // UI Menu/Dropdown State
  headerMenuState: {
    openMenu: string | null; // columnId of open menu
    position: { x: number; y: number };
    menuType: 'filter' | 'sort' | 'settings' | null;
  };

  contextMenuState: {
    isOpen: boolean;
    position: { x: number; y: number };
    context: 'cell' | 'row' | 'column' | 'header' | null;
    targetId: string | null; // cellId, rowId, or columnId
  };

  columnVisibilityMenuState: {
    isOpen: boolean;
    searchValue: string;
  };

  groupConfigMenuState: {
    isOpen: boolean;
  };

  // Clipboard state
  clipboard: {
    data: any[][] | null;
    operation: 'copy' | 'cut' | null;
    copiedCells: Set<string>;
  } | null;
}

// Re-export the observable type
export type TableInteraction$ = ReturnType<typeof createTableInteraction$>;

// ====================================
// INTERACTION STATE OBSERVABLE FACTORY
// ====================================

export function createTableInteraction$(tableCore$?: any) {
  fileLog.info('<� Creating tableInteraction$ observable');

  const tableInteraction$ = observable({
    // Mouse coordinate state (pure input)
    mouseX: 0,
    mouseY: 0,
    isMouseDown: false,

    // Selection state
    selectedCells: new Set<string>(),
    selectedRows: new Set<string>(),
    anchorCell: null as string | null,
    selectionMode: 'cell' as 'cell' | 'row' | 'range' | 'multi',
    isSelecting: false,
    lastBulkSelectionTime: 0,

    // Select all checkbox state (computed)
    // Note: This is now a simple state-based computation without data coupling
    // The renderer should manage the complex logic and update this state appropriately
    selectAllCheckboxState: computed((get) => {
      try {
        const selectedCells = get(() => tableInteraction$.selectedCells);
        const selectedCount = selectedCells.size;

        if (selectedCount === 0) {
          return { checked: false, indeterminate: false };
        } else {
          // Without data context, we can't determine if all cells are selected
          // So we show indeterminate when any cells are selected
          // The renderer should provide a proper setSelectAllState method
          return { checked: false, indeterminate: true };
        }
      } catch (error) {
        return { checked: false, indeterminate: false };
      }
    }),

    // Row checkbox states (computed method - called by renderer with data context)
    getRowCheckboxStates(rows: any[], visibleColumns: any[]): Map<string, boolean> {
      const selectedCells = tableInteraction$.selectedCells.get();
      const rowStates = new Map<string, boolean>();

      // Filter out selection column to match toggleRowCells behavior
      const dataColumns = visibleColumns.filter(col => col.id !== 'selection');

      for (const row of rows) {
        const isRowSelected = dataColumns.every(col =>
          selectedCells.has(`${row.id}:${col.id}`)
        ) && dataColumns.length > 0;

        rowStates.set(row.id, isRowSelected);
      }

      return rowStates;
    },

    // Editing state
    editingCell: null as string | null,
    editValue: null as any,
    isEditing: false,
    isCancelling: false, // Prevents saveEdit() from executing during cancelEdit()
    editValidation: null as { isValid: boolean; message?: string } | null,

    // Focus state (keyboard navigation)
    focusedCell: null as string | null,

    // Hover state
    hoveredCell: null as string | null,
    hoveredRow: null as string | null,

    // Drag state
    isDragging: false,
    dragSource: null as { row: string; column: string } | null,
    dragTarget: null as { row: string; column: string } | null,

    // Drag selection state (for drag-to-select ranges)
    isDragSelecting: false,
    dragSelectStart: null as string | null,
    dragSelectCurrent: null as string | null,

    // Resize state
    resizingColumn: null as string | null,
    resizeStartX: 0,
    resizeStartWidth: 0,

    // Column resize state for overlay
    columnResize: null as {
      isResizing: boolean;
      columnId: string;
      startWidth: number;
      newWidth: number;
    } | null,

    // UI Menu/Dropdown State
    headerMenuState: {
      openMenu: null as string | null, // columnId of open menu
      position: { x: 0, y: 0 },
      menuType: null as 'filter' | 'sort' | 'settings' | null
    },

    contextMenuState: {
      isOpen: false,
      position: { x: 0, y: 0 },
      context: null as 'cell' | 'row' | 'column' | 'header' | null,
      targetId: null as string | null // cellId, rowId, or columnId
    },

    columnVisibilityMenuState: {
      isOpen: false,
      searchValue: ''
    },

    groupConfigMenuState: {
      isOpen: false
    },

    // Clipboard state
    clipboard: null as {
      data: any[][] | null;
      operation: 'copy' | 'cut' | null;
      copiedCells: Set<string>;
    } | null,

    // Computed: Cell at current mouse position (pure reactive function)
    get currentHoveredCell() {
      const mouseX = tableInteraction$.mouseX.get();
      const mouseY = tableInteraction$.mouseY.get();

      if (mouseX === 0 && mouseY === 0) return null;

      // Pure function: Find cell at coordinates using DOM
      const targetElement = document.elementFromPoint(mouseX, mouseY);
      const cellElement = targetElement?.closest('[data-row-id][data-column-id]');

      if (cellElement) {
        const rowId = cellElement.getAttribute('data-row-id');
        const columnId = cellElement.getAttribute('data-column-id');
        return `${rowId}:${columnId}`;
      }

      return null;
    },


    // Pure mouse coordinate methods
    setMousePosition(x: number, y: number) {
      tableInteraction$.mouseX.set(x);
      tableInteraction$.mouseY.set(y);
    },

    setMouseDown(isDown: boolean) {
      tableInteraction$.isMouseDown.set(isDown);
    },

    // Direct manipulation methods
    selectCell(cellId: string, isMulti: boolean = false) {
      batch(() => {
        // CLEAR ROW SELECTION: Cell selection clears row selection mode
        tableInteraction$.selectedRows.set(new Set());

        if (!isMulti) {
          // CLEAR SELECTION: Single selection replaces all
          const newSelection = new Set([cellId]);
          tableInteraction$.selectedCells.set(newSelection);
          tableInteraction$.anchorCell.set(cellId);

          fileLog.debug('🎯 Single cell selection (cleared others)', { cellId });
        } else {
          // MULTI SELECTION: Toggle cell in existing selection
          const currentSelected = new Set(tableInteraction$.selectedCells.get());

          if (currentSelected.has(cellId)) {
            currentSelected.delete(cellId);
            fileLog.debug('🎯 Removed cell from multi-selection', { cellId });
          } else {
            currentSelected.add(cellId);
            fileLog.debug('🎯 Added cell to multi-selection', { cellId });
          }

          tableInteraction$.selectedCells.set(currentSelected);
          tableInteraction$.anchorCell.set(cellId);
        }
      });

      fileLog.info('<� Cell selected', { cellId, isMulti, selectionCount: tableInteraction$.selectedCells.get().size });
    },

    // Pure cell click handler - minimal logic, reactive approach
    handleCellClick(cellId: string, isEditable: boolean, ctrlKey: boolean, shiftKey: boolean) {
      // CONFLICT PREVENTION: Skip if row/column selection just happened
      // This prevents MouseController from overriding SelectionController
      const now = Date.now();
      const lastBulkSelection = tableInteraction$.lastBulkSelectionTime?.get() || 0;
      if (now - lastBulkSelection < 50) { // Within 50ms of bulk selection
        fileLog.info('🚫 Skipping cell click - recent bulk selection detected', {
          cellId,
          timeSinceLastBulk: now - lastBulkSelection
        });
        return;
      }

      batch(() => {
        // 1. Always set focus
        this.setFocusedCell(cellId);

        // 2. Handle selection
        // Ctrl+click is disabled in this system - treat it as regular click
        if (!shiftKey) {
          this.selectCell(cellId, false);
        }

        // 3. For editable cells, start editing AND ensure the cell is also selected
        if (isEditable && !shiftKey) {
          // Get the actual cell value for editing
          const [rowId, columnId] = cellId.split(':');
          const processedRows = tableCore$?.processedRows?.get() || [];
          const row = processedRows.find((r: any) => r.id === rowId);
          const cellValue = row ? row[columnId] : '';

          fileLog.info('🔍 Cell value retrieval debug', {
            cellId,
            rowId,
            columnId,
            hasTableCore: !!tableCore$,
            hasProcessedRows: !!tableCore$?.processedRows,
            processedRowsCount: processedRows.length,
            foundRow: !!row,
            cellValue,
            firstRowId: processedRows[0]?.id,
            rowIds: processedRows.map(r => r.id).slice(0, 3)
          });

          tableInteraction$.startEdit(cellId, cellValue);
        }
      });

      fileLog.info('🖱️ Cell click handled', {
        cellId,
        isEditable,
        ctrlKey,
        shiftKey,
        didStartEdit: isEditable && !shiftKey
      });
    },

    selectRow(rowId: string, isMulti: boolean = false) {
      batch(() => {
        // CLEAR CELL SELECTION: Row selection clears cell selection mode
        tableInteraction$.selectedCells.set(new Set());

        if (!isMulti) {
          // CLEAR SELECTION: Single row selection replaces all
          const newSelection = new Set([rowId]);
          tableInteraction$.selectedRows.set(newSelection);

          fileLog.debug('🎯 Single row selection (cleared others)', { rowId });
        } else {
          // MULTI SELECTION: Toggle row in existing selection
          const currentSelected = new Set(tableInteraction$.selectedRows.get());

          if (currentSelected.has(rowId)) {
            currentSelected.delete(rowId);
            fileLog.debug('🎯 Removed row from multi-selection', { rowId });
          } else {
            currentSelected.add(rowId);
            fileLog.debug('🎯 Added row to multi-selection', { rowId });
          }

          tableInteraction$.selectedRows.set(currentSelected);
        }
      });

      fileLog.info('<� Row selected', { rowId, isMulti, selectionCount: tableInteraction$.selectedRows.get().size });
    },

    selectAll(dataContext?: { rows: any[], columns: any[], columnVisibility: Record<string, boolean> }) {
      if (!dataContext) {
        // Without data context, can't determine what "all" means
        fileLog.warn('⚠️ selectAll called without data context - ignoring');
        return;
      }

      batch(() => {
        const { rows, columns, columnVisibility } = dataContext;
        const visibleColumns = columns.filter((col: any) => columnVisibility[col.id] !== false);

        const allCells = new Set<string>();
        for (const row of rows) {
          for (const column of visibleColumns) {
            allCells.add(`${row.id}:${column.id}`);
          }
        }

        tableInteraction$.selectedCells.set(allCells);
      });

      fileLog.info('✅ All cells selected with data context', {
        totalCells: tableInteraction$.selectedCells.get().size
      });
    },

    clearSelection() {
      batch(() => {
        tableInteraction$.selectedCells.set(new Set());
        tableInteraction$.selectedRows.set(new Set());
        tableInteraction$.anchorCell.set(null);
      });

      fileLog.info('<� Selection cleared');
    },

    // Outside click handler with editing state logic
    async handleOutsideClick() {
      const isCurrentlyEditing = tableInteraction$.isEditing.get();

      if (isCurrentlyEditing) {
        fileLog.info('<� Outside click while editing - saving edit and preserving selection');
        await this.saveEdit();
        // Selection is preserved when finishing an edit
      } else {
        fileLog.info('<� Outside click - clearing selection');
        this.clearSelection();
      }
    },

    setFocusedCell(cellId: string | null) {
      tableInteraction$.focusedCell.set(cellId);
      // If no anchor cell is set, use focused cell as anchor
      if (cellId && !tableInteraction$.anchorCell.get()) {
        tableInteraction$.anchorCell.set(cellId);
      }

      fileLog.info('<� Focused cell changed', { cellId });
    },

    selectRange(startCellId: string, endCellId: string, dataContext?: { rows: any[], columns: any[], columnVisibility: Record<string, boolean> }) {
      // If no data context provided, fall back to simple selection
      if (!dataContext) {
        const cellsToSelect = new Set<string>();
        cellsToSelect.add(startCellId);
        cellsToSelect.add(endCellId);

        batch(() => {
          tableInteraction$.selectedCells.set(cellsToSelect);
          tableInteraction$.anchorCell.set(startCellId);
        });

        fileLog.info('🎯 Simple range selection (no data context)', {
          count: cellsToSelect.size,
          from: startCellId,
          to: endCellId
        });
        return;
      }

      // Full range selection with data context
      const [startRowId, startColId] = startCellId.split(':');
      const [endRowId, endColId] = endCellId.split(':');

      const { rows, columns, columnVisibility } = dataContext;
      const visibleColumns = columns.filter((col: any) => columnVisibility[col.id] !== false);

      fileLog.debug('🎯 Range selection debug', {
        startCellId,
        endCellId,
        startRowId,
        startColId,
        endRowId,
        endColId,
        rowsCount: rows.length,
        columnsCount: columns.length,
        visibleColumnsCount: visibleColumns.length,
        firstRowId: rows[0]?.id,
        firstColumnId: visibleColumns[0]?.id
      });

      // Get row and column indices
      const startRowIndex = rows.findIndex((row: any) => row.id === startRowId);
      const endRowIndex = rows.findIndex((row: any) => row.id === endRowId);
      const startColIndex = visibleColumns.findIndex((col: any) => col.id === startColId);
      const endColIndex = visibleColumns.findIndex((col: any) => col.id === endColId);

      fileLog.debug('🎯 Index lookup results', {
        startRowIndex,
        endRowIndex,
        startColIndex,
        endColIndex
      });

      if (startRowIndex === -1 || endRowIndex === -1 || startColIndex === -1 || endColIndex === -1) {
        fileLog.warn('⚠️ Range selection failed - could not find indices', {
          startRowIndex,
          endRowIndex,
          startColIndex,
          endColIndex,
          startRowId,
          endRowId,
          startColId,
          endColId,
          rowIds: rows.slice(0, 3).map(r => r.id),
          columnIds: visibleColumns.slice(0, 3).map(c => c.id)
        });

        // Fall back to simple selection of just the two end cells
        const cellsToSelect = new Set<string>();
        cellsToSelect.add(startCellId);
        cellsToSelect.add(endCellId);

        batch(() => {
          tableInteraction$.selectedCells.set(cellsToSelect);
          tableInteraction$.anchorCell.set(startCellId);
        });

        fileLog.info('🎯 Fallback range selection (index lookup failed)', {
          count: cellsToSelect.size,
          from: startCellId,
          to: endCellId
        });
        return;
      }

      // Ensure proper ordering
      const minRowIndex = Math.min(startRowIndex, endRowIndex);
      const maxRowIndex = Math.max(startRowIndex, endRowIndex);
      const minColIndex = Math.min(startColIndex, endColIndex);
      const maxColIndex = Math.max(startColIndex, endColIndex);

      // Select all cells in the range
      const newSelection = new Set<string>();
      for (let rowIndex = minRowIndex; rowIndex <= maxRowIndex; rowIndex++) {
        for (let colIndex = minColIndex; colIndex <= maxColIndex; colIndex++) {
          const rowId = rows[rowIndex].id;
          const columnId = visibleColumns[colIndex].id;
          newSelection.add(`${rowId}:${columnId}`);
        }
      }

      batch(() => {
        tableInteraction$.selectedCells.set(newSelection);
        tableInteraction$.anchorCell.set(startCellId);
      });

      fileLog.info('🎯 Full range selection with data context', {
        start: startCellId,
        end: endCellId,
        totalCells: newSelection.size,
        rowRange: `${minRowIndex}-${maxRowIndex}`,
        colRange: `${minColIndex}-${maxColIndex}`
      });
    },

    /**
     * Select entire row as cells (for SelectionController)
     */
    selectRowCells(rowId: string, visibleColumns: any[]) {
      batch(() => {
        // CLEAR PREVIOUS SELECTIONS: Row selection replaces all
        tableInteraction$.selectedRows.set(new Set());
        tableInteraction$.selectedCells.set(new Set());

        const selectedCells = new Set<string>();
        for (const column of visibleColumns) {
          if (column.id === 'selection') continue;
          selectedCells.add(`${rowId}:${column.id}`);
        }

        tableInteraction$.selectedCells.set(selectedCells);
        tableInteraction$.anchorCell.set(`${rowId}:${visibleColumns[0]?.id}`);
        tableInteraction$.lastBulkSelectionTime.set(Date.now());

        fileLog.info('📋 Row cells selected', {
          rowId,
          cellCount: selectedCells.size
        });
      });
    },

    /**
     * Select entire column as cells (for SelectionController)
     */
    selectColumnCells(columnId: string, processedRows: any[]) {
      batch(() => {
        // CLEAR PREVIOUS SELECTIONS: Column selection replaces all
        tableInteraction$.selectedRows.set(new Set());
        tableInteraction$.selectedCells.set(new Set());

        const selectedCells = new Set<string>();
        for (const row of processedRows) {
          selectedCells.add(`${row.id}:${columnId}`);
        }

        tableInteraction$.selectedCells.set(selectedCells);
        tableInteraction$.anchorCell.set(`${processedRows[0]?.id}:${columnId}`);
        tableInteraction$.lastBulkSelectionTime.set(Date.now());

        fileLog.info('📋 Column cells selected', {
          columnId,
          cellCount: selectedCells.size
        });
      });
    },

    /**
     * Toggle row selection as cells (for SelectionController)
     */
    toggleRowCells(rowId: string, visibleColumns: any[]) {
      const currentSelection = tableInteraction$.selectedCells.get();

      const rowCells: string[] = [];
      for (const column of visibleColumns) {
        if (column.id === 'selection') continue;
        rowCells.push(`${rowId}:${column.id}`);
      }

      const isRowSelected = rowCells.every(cellId => currentSelection.has(cellId));

      if (isRowSelected) {
        // Deselect row - remove only this row's cells from selection
        const newSelection = new Set(currentSelection);
        for (const cellId of rowCells) {
          newSelection.delete(cellId);
        }
        tableInteraction$.selectedCells.set(newSelection);
        fileLog.info('📋 Row cells deselected', { rowId });
      } else {
        // Select row - clear all previous selections and select only this row
        const newSelection = new Set(rowCells);
        tableInteraction$.selectedCells.set(newSelection);
        fileLog.info('📋 Row cells selected (previous selection cleared)', { rowId });
      }
    },

    toggleCellSelection(rowId: string, columnId: string, isCtrlKey: boolean = false, isShiftKey: boolean = false) {
      const cellId = `${rowId}:${columnId}`;
      batch(() => {
        const cells = new Set(tableInteraction$.selectedCells.get());

        if (isShiftKey && tableInteraction$.anchorCell.get()) {
          // Shift+click for range selection
          tableInteraction$.selectRange(tableInteraction$.anchorCell.get()!, cellId);
        } else if (isCtrlKey) {
          // Ctrl/Cmd+click for multi-selection toggle
          if (cells.has(cellId)) {
            cells.delete(cellId);
          } else {
            cells.add(cellId);
          }
          tableInteraction$.selectedCells.set(cells);
        } else {
          // Regular click - clear selection and select only this cell
          tableInteraction$.selectedCells.set(new Set([cellId]));
          tableInteraction$.anchorCell.set(cellId);
        }
      });

      fileLog.info('<� Cell selection toggled', { rowId, columnId, isCtrlKey, isShiftKey });
    },

    startEdit(cellId: string, initialValue?: any) {
      batch(() => {
        tableInteraction$.editingCell.set(cellId);
        tableInteraction$.editValue.set(initialValue ?? null);
        tableInteraction$.isEditing.set(true);
        tableInteraction$.editValidation.set(null);
      });

      fileLog.info('<� Edit started', { cellId, initialValue });
    },

    updateEditValue(value: any) {
      tableInteraction$.editValue.set(value);
      // Clear validation on value change
      tableInteraction$.editValidation.set(null);
    },

    async saveEdit(finalValue?: any) {
      const editingCell = tableInteraction$.editingCell.get();
      const isCancelling = tableInteraction$.isCancelling.get();
      const editValue = finalValue !== undefined ? finalValue : tableInteraction$.editValue.get();

      // Prevent saveEdit during cancellation race condition
      if (isCancelling) {
        fileLog.warn('⚠ saveEdit blocked - edit operation is being cancelled');
        return;
      }

      if (!editingCell) {
        fileLog.warn('� saveEdit called but no cell is being edited');
        return;
      }

      // Parse cell ID to extract row ID and field name (format: "<rowId>:<columnId>")
      const cellParts = editingCell.split(':');
      if (cellParts.length !== 2) {
        fileLog.warn('⚠ Invalid cell ID format for entity update', {
          editingCell,
          expectedFormat: 'rowId:columnId',
          actualParts: cellParts
        });
        return;
      }

      const rowId = cellParts[0];
      const fieldName = cellParts[1]; // Column ID is the field name

      // Get entity type from tableCore$
      const entityType = tableCore$?.entityType?.get();
      if (!entityType) {
        fileLog.warn('⚠ No entity type available for entity update', { editingCell, rowId, fieldName });
        return;
      }

      try {
        // CRITICAL FIX: Actually persist the edit to the entity
        fileLog.info('🔄 Persisting field edit to entity', {
          entityType,
          rowId,
          fieldName,
          editValue,
          cellId: editingCell
        });

        const updateEntity = getUpdateFunction(entityType);
        const updateData = { [fieldName]: editValue };

        // Persist the change - this will trigger reactive sync
        await updateEntity(rowId, updateData);

        fileLog.info('✅ Field edit successfully persisted and will trigger sync', {
          entityType,
          rowId,
          fieldName,
          newValue: editValue
        });

      } catch (error) {
        fileLog.error('❌ Failed to persist field edit', {
          entityType,
          rowId,
          fieldName,
          editValue,
          error: error instanceof Error ? error.message : String(error)
        });

        // Show error state (could add visual error indication here)
        tableInteraction$.editValidation.set({
          isValid: false,
          message: `Failed to save: ${error instanceof Error ? error.message : 'Unknown error'}`
        });
        return; // Don't clear editing state on error
      }

      // Clear editing state after successful save
      batch(() => {
        tableInteraction$.editingCell.set(null);
        tableInteraction$.editValue.set(null);
        tableInteraction$.isEditing.set(false);
        tableInteraction$.isCancelling.set(false); // Reset cancelling flag
        tableInteraction$.editValidation.set(null);
      });

      fileLog.info('✅ Edit saved and synced', { cellId: editingCell, value: editValue });
    },

    cancelEdit() {
      const editingCell = tableInteraction$.editingCell.get();

      batch(() => {
        tableInteraction$.editingCell.set(null);
        tableInteraction$.editValue.set(null);
        tableInteraction$.isEditing.set(false);
        tableInteraction$.editValidation.set(null);
      });

      fileLog.info('<� Edit cancelled', { cellId: editingCell });
    },

    setHover(cellId: string | null, rowId: string | null = null) {
      batch(() => {
        tableInteraction$.hoveredCell.set(cellId);
        tableInteraction$.hoveredRow.set(rowId);
      });
    },

    clearHover() {
      batch(() => {
        tableInteraction$.hoveredCell.set(null);
        tableInteraction$.hoveredRow.set(null);
      });
    },

    startDrag(source: { row: string; column: string }) {
      batch(() => {
        tableInteraction$.isDragging.set(true);
        tableInteraction$.dragSource.set(source);
        tableInteraction$.dragTarget.set(null);
      });

      fileLog.info('<� Drag started', { source });
    },

    updateDragTarget(target: { row: string; column: string }) {
      tableInteraction$.dragTarget.set(target);
    },

    endDrag() {
      const source = tableInteraction$.dragSource.get();
      const target = tableInteraction$.dragTarget.get();

      batch(() => {
        tableInteraction$.isDragging.set(false);
        tableInteraction$.dragSource.set(null);
        tableInteraction$.dragTarget.set(null);
      });

      fileLog.info('<� Drag ended', { source, target });

      return { source, target };
    },

    startDragSelect(cellId: string) {
      batch(() => {
        tableInteraction$.isDragSelecting.set(true);
        tableInteraction$.dragSelectStart.set(cellId);
        tableInteraction$.dragSelectCurrent.set(cellId);
      });

      fileLog.info('<� Drag selection started', { startCell: cellId });
    },

    updateDragSelect(cellId: string) {
      tableInteraction$.dragSelectCurrent.set(cellId);
    },

    endDragSelect() {
      const start = tableInteraction$.dragSelectStart.get();
      const current = tableInteraction$.dragSelectCurrent.get();

      batch(() => {
        tableInteraction$.isDragSelecting.set(false);
        tableInteraction$.dragSelectStart.set(null);
        tableInteraction$.dragSelectCurrent.set(null);
      });

      fileLog.info('<� Drag selection ended', { start, end: current });

      return { start, end: current };
    },

    // Alias methods for compatibility with CellRenderer
    startDragSelection(cellId: string) {
      return tableInteraction$.startDragSelect(cellId);
    },

    updateDragSelection(cellId: string, dataContext?: { rows: any[], columns: any[], columnVisibility: Record<string, boolean> }) {
      // When dragging, select the range from start to current
      const start = tableInteraction$.dragSelectStart.get();
      if (start && cellId !== tableInteraction$.dragSelectCurrent.get()) {
        tableInteraction$.selectRange(start, cellId, dataContext);
        tableInteraction$.updateDragSelect(cellId);
      }
    },

    endDragSelection() {
      return tableInteraction$.endDragSelect();
    },

    startColumnResize(columnId: string, startX: number, startWidth: number) {
      batch(() => {
        // Clear any existing selections when starting column resize
        tableInteraction$.selectedCells.set(new Set());
        tableInteraction$.editingCell.set(null);
        tableInteraction$.editValue.set('');

        // Set column resize state
        tableInteraction$.resizingColumn.set(columnId);
        tableInteraction$.resizeStartX.set(startX);
        tableInteraction$.resizeStartWidth.set(startWidth);
        tableInteraction$.columnResize.set({
          isResizing: true,
          columnId,
          startWidth,
          newWidth: startWidth
        });
      });

      fileLog.info('<� Column resize started, selections cleared', { columnId, startX, startWidth });
    },

    updateColumnResize(currentX: number) {
      const resizingColumn = tableInteraction$.resizingColumn.get();
      const startX = tableInteraction$.resizeStartX.get();
      const startWidth = tableInteraction$.resizeStartWidth.get();

      if (!resizingColumn) return;

      const deltaX = currentX - startX;
      const newWidth = Math.max(50, startWidth + deltaX); // Minimum width of 50px

      const currentResize = tableInteraction$.columnResize.get();
      if (currentResize) {
        fileLog.info('[RESIZE] 🔧 INTERACTION STATE: Setting columnResize with new width', {
          resizingColumn,
          newWidth,
          previousWidth: currentResize.newWidth,
          isResizing: currentResize.isResizing
        });

        tableInteraction$.columnResize.set({
          ...currentResize,
          newWidth
        });

        fileLog.info('[RESIZE] ✅ INTERACTION STATE: columnResize.set() completed', {
          newState: tableInteraction$.columnResize.get()
        });
      }

      return { columnId: resizingColumn, newWidth };
    },

    endColumnResize() {
      const resizingColumn = tableInteraction$.resizingColumn.get();
      const newWidth = tableInteraction$.columnResize.get()?.newWidth;

      batch(() => {
        tableInteraction$.resizingColumn.set(null);
        tableInteraction$.resizeStartX.set(0);
        tableInteraction$.resizeStartWidth.set(0);
        tableInteraction$.columnResize.set(null);
      });

      fileLog.info('<� Column resize ended', { columnId: resizingColumn, newWidth });

      return { columnId: resizingColumn, newWidth };
    },

    openHeaderMenu(columnId: string, position: { x: number; y: number }, menuType: 'filter' | 'sort' | 'settings') {
      batch(() => {
        // Close other menus first
        tableInteraction$.contextMenuState.isOpen.set(false);
        tableInteraction$.columnVisibilityMenuState.isOpen.set(false);
        tableInteraction$.groupConfigMenuState.isOpen.set(false);

        // Open header menu
        tableInteraction$.headerMenuState.openMenu.set(columnId);
        tableInteraction$.headerMenuState.position.set(position);
        tableInteraction$.headerMenuState.menuType.set(menuType);
      });

      fileLog.info('<� Header menu opened', { columnId, position, menuType });
    },

    closeHeaderMenu() {
      batch(() => {
        tableInteraction$.headerMenuState.openMenu.set(null);
        tableInteraction$.headerMenuState.position.set({ x: 0, y: 0 });
        tableInteraction$.headerMenuState.menuType.set(null);
      });

      fileLog.info('<� Header menu closed');
    },

    openContextMenu(position: { x: number; y: number }, context: 'cell' | 'row' | 'column' | 'header', targetId: string) {
      batch(() => {
        // Close other menus first
        tableInteraction$.headerMenuState.openMenu.set(null);
        tableInteraction$.columnVisibilityMenuState.isOpen.set(false);
        tableInteraction$.groupConfigMenuState.isOpen.set(false);

        // Open context menu
        tableInteraction$.contextMenuState.isOpen.set(true);
        tableInteraction$.contextMenuState.position.set(position);
        tableInteraction$.contextMenuState.context.set(context);
        tableInteraction$.contextMenuState.targetId.set(targetId);
      });

      fileLog.info('<� Context menu opened', { position, context, targetId });
    },

    closeContextMenu() {
      batch(() => {
        tableInteraction$.contextMenuState.isOpen.set(false);
        tableInteraction$.contextMenuState.position.set({ x: 0, y: 0 });
        tableInteraction$.contextMenuState.context.set(null);
        tableInteraction$.contextMenuState.targetId.set(null);
      });

      fileLog.info('<� Context menu closed');
    },

    openColumnVisibilityMenu() {
      batch(() => {
        // Close other menus first
        tableInteraction$.headerMenuState.openMenu.set(null);
        tableInteraction$.contextMenuState.isOpen.set(false);
        tableInteraction$.groupConfigMenuState.isOpen.set(false);

        // Open column visibility menu
        tableInteraction$.columnVisibilityMenuState.isOpen.set(true);
        tableInteraction$.columnVisibilityMenuState.searchValue.set('');
      });

      fileLog.info('<� Column visibility menu opened');
    },

    closeColumnVisibilityMenu() {
      batch(() => {
        tableInteraction$.columnVisibilityMenuState.isOpen.set(false);
        tableInteraction$.columnVisibilityMenuState.searchValue.set('');
      });

      fileLog.info('<� Column visibility menu closed');
    },

    setColumnVisibilitySearch(searchValue: string) {
      tableInteraction$.columnVisibilityMenuState.searchValue.set(searchValue);
    },

    openGroupConfigMenu() {
      batch(() => {
        // Close other menus first
        tableInteraction$.headerMenuState.openMenu.set(null);
        tableInteraction$.contextMenuState.isOpen.set(false);
        tableInteraction$.columnVisibilityMenuState.isOpen.set(false);

        // Open group config menu
        tableInteraction$.groupConfigMenuState.isOpen.set(true);
      });

      fileLog.info('<� Group config menu opened');
    },

    closeGroupConfigMenu() {
      batch(() => {
        tableInteraction$.groupConfigMenuState.isOpen.set(false);
      });

      fileLog.info('<� Group config menu closed');
    },

    setClipboard(clipboardData: { data: any[][], operation: 'copy' | 'cut' }) {
      const selectedCells = tableInteraction$.selectedCells.get();

      tableInteraction$.clipboard.set({
        data: clipboardData.data,
        operation: clipboardData.operation,
        copiedCells: new Set(selectedCells)
      });

      fileLog.info('📋 Clipboard set', {
        operation: clipboardData.operation,
        cellCount: selectedCells.size,
        clipboardState: tableInteraction$.clipboard.get()
      });
    },

    clearClipboard() {
      tableInteraction$.clipboard.set(null);
      fileLog.info('📋 Clipboard cleared');
    },

    // ====================================
    // VISUAL UPDATE METHODS (Consolidated from SelectionManager)
    // ====================================

    /**
     * Update visual selection state for cells in the DOM
     * This replaces SelectionManager's setSelectedCells with DOM updates
     */
    updateCellSelectionVisuals(
      getCellElement: (rowId: string, columnId: string) => HTMLElement | null
    ) {
      const selectedCells = tableInteraction$.selectedCells.get();

      // Find all cells with selection class and remove it
      document.querySelectorAll('.vibegridx-selected').forEach(el => {
        el.classList.remove('vibegridx-selected');
      });

      // Add selection class to currently selected cells
      selectedCells.forEach(cellKey => {
        const [rowId, columnId] = cellKey.split(':');
        const element = getCellElement(rowId, columnId);
        element?.classList.add('vibegridx-selected');
      });
    },

    /**
     * Update visual selection state for rows in the DOM
     * This replaces SelectionManager's setSelectedRows with DOM updates
     */
    updateRowSelectionVisuals(
      forEachRowElement: (callback: (element: HTMLElement, rowId: string) => void) => void
    ) {
      const selectedRows = tableInteraction$.selectedRows.get();

      // Update all row elements
      forEachRowElement((element, rowId) => {
        if (selectedRows.has(rowId)) {
          element.classList.add('vibegridx-row-selected');
        } else {
          element.classList.remove('vibegridx-row-selected');
        }
      });
    },

    /**
     * Update visual editing state for a cell in the DOM
     * This replaces SelectionManager's setEditingCell with DOM updates
     */
    updateEditingCellVisual(
      getCellElement: (rowId: string, columnId: string) => HTMLElement | null,
      oldCellId?: string | null,
      newCellId?: string | null
    ) {
      // Remove editing state from old cell
      if (oldCellId) {
        const [rowId, columnId] = oldCellId.split(':');
        const oldElement = getCellElement(rowId, columnId);
        if (oldElement) {
          oldElement.classList.remove('vibegridx-editing');
          oldElement.contentEditable = 'false';
        }
      }

      // Add editing state to new cell
      if (newCellId) {
        const [rowId, columnId] = newCellId.split(':');
        const newElement = getCellElement(rowId, columnId);
        if (newElement) {
          newElement.classList.add('vibegridx-editing');
          newElement.contentEditable = 'true';
          newElement.focus({ preventScroll: true });
        }
      }
    }
  });

  return tableInteraction$;
}