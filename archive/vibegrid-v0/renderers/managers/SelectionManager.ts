import type { CellRef, TableRow } from '../../types';

// ====================================
// SELECTION MANAGER
// ====================================

const CSS_CLASSES = {
  SELECTED: 'vibegridx-selected',
  EDITING: 'vibegridx-editing',
  ROW_SELECTED: 'vibegridx-row-selected'
} as const;

interface SelectionState {
  selectedCells: Set<string>;
  selectedRows: Set<string>;
  editingCell: CellRef | null;
}

/**
 * Manages cell and row selection state and visual updates
 * Extracted from TableRenderer for better separation of concerns
 */
export class SelectionManager {
  private selectedCells = new Set<string>();
  private selectedRows = new Set<string>();
  private editingCell: CellRef | null = null;
  
  // DOM access functions (injected dependencies)
  private getCellElement: (rowId: string, columnId: string) => HTMLElement | null;
  private forEachRowElement: (callback: (element: HTMLElement, rowId: string) => void) => void;
  private getHeaderElement: () => HTMLElement;
  private isSelectionColumnEnabled: () => boolean;
  
  constructor(dependencies: {
    getCellElement: (rowId: string, columnId: string) => HTMLElement | null;
    forEachRowElement: (callback: (element: HTMLElement, rowId: string) => void) => void;
    getHeaderElement: () => HTMLElement;
    isSelectionColumnEnabled: () => boolean;
  }) {
    this.getCellElement = dependencies.getCellElement;
    this.forEachRowElement = dependencies.forEachRowElement;
    this.getHeaderElement = dependencies.getHeaderElement;
    this.isSelectionColumnEnabled = dependencies.isSelectionColumnEnabled;
  }
  
  /**
   * Get current selection state
   */
  getSelectionState(): SelectionState {
    return {
      selectedCells: new Set(this.selectedCells),
      selectedRows: new Set(this.selectedRows),
      editingCell: this.editingCell ? { ...this.editingCell } : null
    };
  }
  
  /**
   * Get selected cells
   */
  getSelectedCells(): Set<string> {
    return new Set(this.selectedCells);
  }
  
  /**
   * Get selected rows
   */
  getSelectedRows(): Set<string> {
    return new Set(this.selectedRows);
  }
  
  /**
   * Get currently editing cell
   */
  getEditingCell(): CellRef | null {
    return this.editingCell ? { ...this.editingCell } : null;
  }
  
  /**
   * Check if a cell is selected
   */
  isCellSelected(rowId: string, columnId: string): boolean {
    return this.selectedCells.has(`${rowId}:${columnId}`);
  }
  
  /**
   * Check if a row is selected
   */
  isRowSelected(rowId: string): boolean {
    return this.selectedRows.has(rowId);
  }
  
  /**
   * Check if a cell is being edited
   */
  isCellEditing(rowId: string, columnId: string): boolean {
    return this.editingCell?.rowId === rowId && this.editingCell?.columnId === columnId;
  }
  
  /**
   * Set editing cell and update DOM
   */
  setEditingCell(cellRef: CellRef | null): void {
    const oldEditing = this.editingCell;
    this.editingCell = cellRef;
    
    // Update old editing cell
    if (oldEditing) {
      const oldElement = this.getCellElement(oldEditing.rowId, oldEditing.columnId);
      if (oldElement) {
        oldElement.classList.remove(CSS_CLASSES.EDITING);
        oldElement.contentEditable = 'false';
      }
    }
    
    // Update new editing cell
    if (cellRef) {
      const newElement = this.getCellElement(cellRef.rowId, cellRef.columnId);
      if (newElement) {
        newElement.classList.add(CSS_CLASSES.EDITING);
        newElement.contentEditable = 'true';
        newElement.focus({ preventScroll: true });
      }
    }
  }
  
  /**
   * Set selected cells and update DOM
   */
  setSelectedCells(selectedCells: Set<string>): void {
    // Remove old selections
    this.selectedCells.forEach(cellKey => {
      const [rowId, columnId] = cellKey.split(':');
      const element = this.getCellElement(rowId, columnId);
      element?.classList.remove(CSS_CLASSES.SELECTED);
    });
    
    // Add new selections
    this.selectedCells = new Set(selectedCells);
    this.selectedCells.forEach(cellKey => {
      const [rowId, columnId] = cellKey.split(':');
      const element = this.getCellElement(rowId, columnId);
      element?.classList.add(CSS_CLASSES.SELECTED);
    });
  }
  
  /**
   * Set selected rows and update DOM
   */
  setSelectedRows(selectedRows: Set<string>, allRows: TableRow[] = []): void {
    this.selectedRows = new Set(selectedRows);
    
    // Update all visible row checkboxes and row styles
    this.forEachRowElement((rowElement, rowId) => {
      const isSelected = this.selectedRows.has(rowId);
      
      // Update checkbox
      const checkbox = rowElement.querySelector('.vibegridx-row-checkbox') as HTMLInputElement;
      if (checkbox) {
        checkbox.checked = isSelected;
      }
      
      // Update row style
      if (isSelected) {
        rowElement.classList.add(CSS_CLASSES.ROW_SELECTED);
      } else {
        rowElement.classList.remove(CSS_CLASSES.ROW_SELECTED);
      }
    });
    
    // Update header checkbox state if selection column is enabled
    if (this.isSelectionColumnEnabled() && allRows.length > 0) {
      const headerCheckbox = this.getHeaderElement().querySelector('.vibegridx-header-checkbox') as HTMLInputElement;
      if (headerCheckbox) {
        const allSelected = this.selectedRows.size === allRows.length && allRows.length > 0;
        const someSelected = this.selectedRows.size > 0 && this.selectedRows.size < allRows.length;
        
        headerCheckbox.checked = allSelected;
        headerCheckbox.indeterminate = someSelected;
      }
    }
  }
  
  /**
   * Add a cell to selection
   */
  addCellToSelection(rowId: string, columnId: string): void {
    const cellKey = `${rowId}:${columnId}`;
    const newSelection = new Set(this.selectedCells);
    newSelection.add(cellKey);
    this.setSelectedCells(newSelection);
  }
  
  /**
   * Remove a cell from selection
   */
  removeCellFromSelection(rowId: string, columnId: string): void {
    const cellKey = `${rowId}:${columnId}`;
    const newSelection = new Set(this.selectedCells);
    newSelection.delete(cellKey);
    this.setSelectedCells(newSelection);
  }
  
  /**
   * Toggle cell selection
   */
  toggleCellSelection(rowId: string, columnId: string): boolean {
    const cellKey = `${rowId}:${columnId}`;
    const isCurrentlySelected = this.selectedCells.has(cellKey);
    
    if (isCurrentlySelected) {
      this.removeCellFromSelection(rowId, columnId);
    } else {
      this.addCellToSelection(rowId, columnId);
    }
    
    return !isCurrentlySelected;
  }
  
  /**
   * Add a row to selection
   */
  addRowToSelection(rowId: string, allRows: TableRow[] = []): void {
    const newSelection = new Set(this.selectedRows);
    newSelection.add(rowId);
    this.setSelectedRows(newSelection, allRows);
  }
  
  /**
   * Remove a row from selection
   */
  removeRowFromSelection(rowId: string, allRows: TableRow[] = []): void {
    const newSelection = new Set(this.selectedRows);
    newSelection.delete(rowId);
    this.setSelectedRows(newSelection, allRows);
  }
  
  /**
   * Toggle row selection
   */
  toggleRowSelection(rowId: string, allRows: TableRow[] = []): boolean {
    const isCurrentlySelected = this.selectedRows.has(rowId);
    
    if (isCurrentlySelected) {
      this.removeRowFromSelection(rowId, allRows);
    } else {
      this.addRowToSelection(rowId, allRows);
    }
    
    return !isCurrentlySelected;
  }
  
  /**
   * Select all rows
   */
  selectAllRows(allRows: TableRow[]): void {
    const allRowIds = new Set(allRows.map(row => row.id));
    this.setSelectedRows(allRowIds, allRows);
  }
  
  /**
   * Clear all row selection
   */
  clearRowSelection(allRows: TableRow[] = []): void {
    this.setSelectedRows(new Set(), allRows);
  }
  
  /**
   * Clear all cell selection
   */
  clearCellSelection(): void {
    this.setSelectedCells(new Set());
  }
  
  /**
   * Clear all selections
   */
  clearAllSelections(allRows: TableRow[] = []): void {
    this.clearCellSelection();
    this.clearRowSelection(allRows);
    this.setEditingCell(null);
  }
  
  /**
   * Select a range of cells
   */
  selectCellRange(startRow: string, startCol: string, endRow: string, endCol: string, allRows: TableRow[], allColumns: string[]): void {
    // Get row and column indices
    const startRowIndex = allRows.findIndex(row => row.id === startRow);
    const endRowIndex = allRows.findIndex(row => row.id === endRow);
    const startColIndex = allColumns.indexOf(startCol);
    const endColIndex = allColumns.indexOf(endCol);
    
    if (startRowIndex === -1 || endRowIndex === -1 || startColIndex === -1 || endColIndex === -1) {
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
        const rowId = allRows[rowIndex].id;
        const columnId = allColumns[colIndex];
        newSelection.add(`${rowId}:${columnId}`);
      }
    }
    
    this.setSelectedCells(newSelection);
  }
  
  /**
   * Get selection statistics
   */
  getSelectionStats() {
    return {
      selectedCells: this.selectedCells.size,
      selectedRows: this.selectedRows.size,
      hasEditingCell: this.editingCell !== null,
      editingCell: this.editingCell
    };
  }
  
  /**
   * Update cell visual state (for optimistic updates)
   */
  updateCellVisualState(rowId: string, columnId: string, state: {
    isSelected?: boolean;
    isEditing?: boolean;
    isDirty?: boolean;
    isOptimistic?: boolean;
  }): void {
    const element = this.getCellElement(rowId, columnId);
    if (!element) return;
    
    if (state.isSelected !== undefined) {
      element.classList.toggle(CSS_CLASSES.SELECTED, state.isSelected);
    }
    
    if (state.isEditing !== undefined) {
      element.classList.toggle(CSS_CLASSES.EDITING, state.isEditing);
      element.contentEditable = state.isEditing ? 'true' : 'false';
    }
    
    if (state.isDirty !== undefined) {
      element.classList.toggle('vibegridx-dirty', state.isDirty);
    }
    
    if (state.isOptimistic !== undefined) {
      element.classList.toggle('vibegridx-optimistic', state.isOptimistic);
    }
  }
  
  /**
   * CSS class constants
   */
  static get CSS_CLASSES() {
    return CSS_CLASSES;
  }
}