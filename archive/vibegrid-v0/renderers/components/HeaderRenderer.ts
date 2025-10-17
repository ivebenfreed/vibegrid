/**
 * HeaderRenderer - Specialized renderer for VibeGrid table headers
 * Handles column headers, sorting, resizing, and select-all functionality
 */

import { log } from '@/logger';
import { observe } from '@legendapp/state';
import type { TableCore$, TableInteraction$, TableViewport$ } from '../../stores/pure-observables';
import type { DOMElementFactory } from '../factories/DOMElementFactory';
import type { SelectionController } from '../modules/SelectionController';
import type { CoordinateMapping } from '../modules/OverlayManager';
import { setupColumnDragHandlers } from '../utils/interaction-handlers';

const fileLog = log('components/custom/vibegrid/renderers/components/HeaderRenderer.ts');

const ROW_HEIGHT = 40;
const HEADER_HEIGHT = 48;

export interface HeaderRendererOptions {
  headerContainer: HTMLElement;
  tableCore$: TableCore$;
  tableInteraction$: TableInteraction$;
  tableViewport$: TableViewport$;
  domFactory: DOMElementFactory;
  selectionController?: SelectionController;
  coordinateMapping: CoordinateMapping;
  enableSelectionColumn?: boolean;
  
  // Callbacks for coordinate updates
  updateCoordinateMapping: (mapping: CoordinateMapping) => void;
}

export class HeaderRenderer {
  private headerContainer: HTMLElement;
  private tableCore$: TableCore$;
  private tableInteraction$: TableInteraction$;
  private tableViewport$: TableViewport$;
  private domFactory: DOMElementFactory;
  private selectionController?: SelectionController;
  private coordinateMapping: CoordinateMapping;
  private enableSelectionColumn: boolean;
  private updateCoordinateMapping: (mapping: CoordinateMapping) => void;
  
  // Header state
  private selectAllCheckbox: HTMLInputElement | null = null;

  constructor(options: HeaderRendererOptions) {
    this.headerContainer = options.headerContainer;
    this.tableCore$ = options.tableCore$;
    this.tableInteraction$ = options.tableInteraction$;
    this.tableViewport$ = options.tableViewport$;
    this.domFactory = options.domFactory;
    this.selectionController = options.selectionController;
    this.coordinateMapping = options.coordinateMapping;
    this.enableSelectionColumn = options.enableSelectionColumn ?? false;
    this.updateCoordinateMapping = options.updateCoordinateMapping;
  }

  /**
   * Render complete table header
   */
  render(): void {
    if (!this.headerContainer) return;
    
    const columns = this.tableCore$.columns.get();
    const columnVisibility = this.tableCore$.columnVisibility.get();
    fileLog.info('🎨 Rendering header', { columnCount: columns.length });
    
    this.headerContainer.innerHTML = '';
    
    const headerRow = this.domFactory.createElement('div', 'vibegridx-header-row');
    headerRow.style.cssText = `
      display: flex;
      height: ${HEADER_HEIGHT}px;
      align-items: center;
    `;
    
    // Add corner header cell (aligns with row headers)
    const { cornerCell, selectAllCheckbox } = this.domFactory.createCornerHeaderCell();
    this.selectAllCheckbox = selectAllCheckbox || null;
    
    // Add select all checkbox handler
    if (this.selectAllCheckbox) {
      this.setupSelectAllHandler();
    }
    
    headerRow.appendChild(cornerCell);
    
    // Filter visible columns and get virtual column range
    const allVisibleColumns = columns.filter(col => columnVisibility[col.id] !== false);
    const visibleColumnRange = this.tableViewport$.visibleColumns.get();
    const startColIndex = Math.max(0, visibleColumnRange.start);
    const endColIndex = Math.min(allVisibleColumns.length, visibleColumnRange.end);
    const virtualColumns = allVisibleColumns.slice(startColIndex, endColIndex);
    
    fileLog.info('🎨 Header virtual scrolling', {
      totalColumns: columns.length,
      allVisibleColumns: allVisibleColumns.length,
      virtualRange: `${startColIndex}-${endColIndex}`,
      renderingColumns: virtualColumns.length
    });
    
    // Update column coordinate mapping only if columns have changed
    const needsCoordinateUpdate = this.updateColumnCoordinateMapping(allVisibleColumns);

    // Calculate column positioning for virtual scrolling
    let xOffset = 40; // Start after row header
    for (let i = 0; i < startColIndex; i++) {
      xOffset += allVisibleColumns[i].width;
    }

    // Render virtual columns
    virtualColumns.forEach((column, virtualIndex) => {
      const actualIndex = startColIndex + virtualIndex;
      const headerCell = this.createColumnHeader(column, actualIndex, xOffset);
      headerRow.appendChild(headerCell);
      xOffset += column.width;
    });

    // Set total width for proper overflow handling
    const totalHeaderWidth = 40 + allVisibleColumns.reduce((sum, col) => sum + col.width, 0);
    headerRow.style.width = `${totalHeaderWidth}px`;
    headerRow.style.minWidth = `${totalHeaderWidth}px`;

    this.headerContainer.appendChild(headerRow);

    // Update header container width
    this.headerContainer.style.width = `${totalHeaderWidth}px`;
    this.headerContainer.style.minWidth = `${totalHeaderWidth}px`;

    // Only update coordinate mapping if columns actually changed
    if (needsCoordinateUpdate) {
      this.coordinateMapping.version++;
      this.updateCoordinateMapping(this.coordinateMapping);
    }
    
    fileLog.info('✅ Header rendered with total width', { totalHeaderWidth });
  }

  /**
   * Create column header element
   */
  private createColumnHeader(column: any, actualIndex: number, xOffset: number): HTMLElement {
    const headerCell = this.domFactory.createHeaderCell(column, column.width);
    
    // Create header content with text and sort icon
    const textGroup = this.domFactory.createHeaderTextGroup(column);
    headerCell.appendChild(textGroup);
    
    // Update sort indicator if column is sorted
    this.updateSortIndicator(headerCell, column);
    
    // Add resize handle
    const resizeHandle = this.domFactory.createResizeHandle();
    this.setupResizeHandler(resizeHandle, column);
    headerCell.appendChild(resizeHandle);
    
    // Add click handler for sorting and column selection
    this.setupHeaderClickHandler(headerCell, column);

    // Add drag handling for column reordering
    this.setupColumnDragHandlers(headerCell, column);

    return headerCell;
  }

  /**
   * Update column coordinate mapping
   * @returns true if mapping changed, false if unchanged
   */
  private updateColumnCoordinateMapping(allVisibleColumns: any[]): boolean {
    const newColumns: any[] = [];
    let xOffset = 40; // Start after row header

    // Build new coordinate mapping for all visible columns
    allVisibleColumns.forEach((column, index) => {
      newColumns.push({
        columnId: column.id,
        x: xOffset,
        width: column.width,
        index: index,
        offset: xOffset
      });
      xOffset += column.width;
    });

    // Check if coordinate mapping has changed (including position)
    const hasChanged = !this.coordinateMapping.columns ||
      this.coordinateMapping.columns.length !== newColumns.length ||
      newColumns.some((newCol, index) => {
        const oldCol = this.coordinateMapping.columns?.[index];
        return !oldCol ||
               oldCol.columnId !== newCol.columnId ||
               oldCol.width !== newCol.width ||
               oldCol.x !== newCol.x;
      });

    if (hasChanged) {
      this.coordinateMapping.columns = newColumns;
      return true;
    }

    return false;
  }

  /**
   * Set up select all checkbox handler
   */
  private setupSelectAllHandler(): void {
    if (!this.selectAllCheckbox) return;
    
    this.selectAllCheckbox.addEventListener('click', (e) => {
      e.stopPropagation();
      
      // Check current selection state to determine action
      const selectedCells = this.tableInteraction$.selectedCells.get();
      const processedRows = this.tableCore$.processedRows.get();
      const columns = this.tableCore$.columns.get();
      const columnVisibility = this.tableCore$.columnVisibility.get();
      const visibleColumns = columns.filter(col => columnVisibility[col.id] !== false);
      
      fileLog.info('🎯 Select all checkbox clicked', {
        currentSelection: selectedCells.size,
        totalRows: processedRows.length,
        totalColumns: visibleColumns.length
      });
      
      if (selectedCells.size === 0) {
        // No selection - select all
        if (this.selectionController) {
          this.selectionController.selectAllCells();
        }
      } else {
        // Has selection - clear all
        if (this.selectionController) {
          this.selectionController.clearSelection();
        }
      }
    });
  }

  /**
   * Set up resize handler for column
   */
  private setupResizeHandler(resizeHandle: HTMLElement, column: any): void {
    let isResizing = false;
    let startX = 0;
    let startWidth = column.width;
    
    resizeHandle.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      isResizing = true;
      startX = e.pageX;
      startWidth = column.width;
      
      // Update interaction state
      this.tableInteraction$.columnResize.set({
        isResizing: true,
        columnId: column.id,
        startWidth: startWidth,
        newWidth: startWidth
      });
      
      // Add document-level listeners for resize
      let resizeRAF: number | null = null;
      const handleMouseMove = (e: MouseEvent) => {
        if (!isResizing) return;
        
        // Throttle resize updates with requestAnimationFrame
        if (!resizeRAF) {
          resizeRAF = requestAnimationFrame(() => {
            const deltaX = e.pageX - startX;
            const newWidth = Math.max(50, startWidth + deltaX); // Min width 50px
            
            // Update resize state
            this.tableInteraction$.columnResize.set({
              isResizing: true,
              columnId: column.id,
              startWidth: startWidth,
              newWidth: newWidth
            });
            
            resizeRAF = null;
          });
        }
      };
      
      const handleMouseUp = () => {
        if (!isResizing) return;
        isResizing = false;
        
        // Cancel any pending resize RAF
        if (resizeRAF) {
          cancelAnimationFrame(resizeRAF);
          resizeRAF = null;
        }
        
        const resizeState = this.tableInteraction$.columnResize.get();
        if (resizeState && resizeState.newWidth) {
          // Apply the new width
          this.tableCore$.updateColumnWidth(column.id, resizeState.newWidth);
        }
        
        // Clear resize state
        this.tableInteraction$.columnResize.set(null);
        
        // Clean up listeners
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
      
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    });
  }

  /**
   * Set up column drag handlers for column reordering
   */
  private setupColumnDragHandlers(headerCell: HTMLElement, column: any): void {
    setupColumnDragHandlers(
      headerCell,
      column,
      (columnId: string, e: DragEvent) => {
        // On drag start
        fileLog.info('🎯 Column drag started', { columnId });
        this.tableInteraction$.isDragging.set(true);
        this.tableInteraction$.dragSource.set(columnId);
      },
      (columnId: string, e: DragEvent) => {
        // On drag end
        fileLog.info('🎯 Column drag ended', { columnId });
        this.tableInteraction$.isDragging.set(false);
        this.tableInteraction$.dragSource.set(null);
        this.tableInteraction$.dragTarget.set(null);
      },
      (e: DragEvent) => {
        // On drag over
        // Visual feedback is handled by overlay manager
      },
      (targetColumnId: string, e: DragEvent) => {
        // On drop - reorder columns
        const sourceColumnId = this.tableInteraction$.dragSource.get();
        if (sourceColumnId && sourceColumnId !== targetColumnId) {
          fileLog.info('🎯 Column dropped for reordering', {
            sourceColumnId,
            targetColumnId
          });
          this.tableCore$.reorderColumn(sourceColumnId, targetColumnId);
        }
      }
    );
  }

  /**
   * Set up header click handler for sorting and column selection
   */
  private setupHeaderClickHandler(headerCell: HTMLElement, column: any): void {
    headerCell.style.cursor = 'pointer';
    headerCell.addEventListener('click', (e) => {
      // Don't sort if clicking on resize handle
      if ((e.target as HTMLElement).classList.contains('vibegridx-resize-handle')) {
        return;
      }
      
      const isCtrlKey = e.ctrlKey || e.metaKey;
      const isShiftKey = e.shiftKey;
      
      if (isCtrlKey && !isShiftKey) {
        // Ctrl+Click on header - select entire column
        e.preventDefault();
        if (this.selectionController) {
          this.selectionController.selectColumn(column.id);
        }
        fileLog.info('🎯 Column selected', { columnId: column.id });
      } else {
        // Regular click or Shift+click - toggle sort
        // Shift+click enables multi-column sorting
        const isMultiSort = isShiftKey;
        
        fileLog.info('🔄 Column header clicked for sort', { 
          columnId: column.id, 
          field: column.field,
          usingField: column.field || column.id,
          isMultiSort,
          isShiftKey
        });
        
        // Use column.field for sorting (data field), not column.id (display identifier)
        // Pass isMultiSort parameter to enable/disable multi-column sorting
        this.tableCore$.toggleSort(column.field || column.id, isMultiSort);
      }
    });
  }

  /**
   * Update sort indicator for a column
   */
  private updateSortIndicator(headerCell: HTMLElement, column: any): void {
    const sortState = this.tableCore$.sortBy.get();
    const columnSort = sortState.find((s: any) => s.field === (column.field || column.id));
    
    if (columnSort) {
      this.domFactory.updateSortIcon(headerCell, columnSort.direction);
    } else {
      this.domFactory.updateSortIcon(headerCell, null);
    }
  }

  /**
   * Update all sort indicators
   */
  updateSortIndicators(): void {
    const headerCells = this.headerContainer.querySelectorAll('.vibegridx-header-cell');
    const columns = this.tableCore$.columns.get();
    
    headerCells.forEach((headerCell, index) => {
      const fieldId = headerCell.getAttribute('data-field');
      const column = columns.find(c => c.id === fieldId);
      
      if (column) {
        this.updateSortIndicator(headerCell as HTMLElement, column);
      }
    });
  }

  /**
   * Update select all checkbox visual state
   */
  updateSelectAllCheckboxVisual(state: { checked: boolean; indeterminate: boolean }): void {
    if (this.selectAllCheckbox) {
      this.selectAllCheckbox.checked = state.checked;
      this.selectAllCheckbox.indeterminate = state.indeterminate;
      
      fileLog.info('☑️ Select all checkbox updated', {
        checked: state.checked,
        indeterminate: state.indeterminate
      });
    }
  }

  /**
   * Update header cell width during resize
   */
  updateHeaderCellWidth(columnId: string, newWidth: number): void {
    const headerCell = this.headerContainer.querySelector(`[data-field="${columnId}"]`) as HTMLElement;
    if (headerCell) {
      headerCell.style.flex = `0 0 ${newWidth}px`;
      
      fileLog.debug('📏 Header cell width updated', {
        columnId,
        newWidth
      });
    }
  }

  /**
   * Get header container reference
   */
  getHeaderContainer(): HTMLElement {
    return this.headerContainer;
  }

  /**
   * Get select all checkbox reference
   */
  getSelectAllCheckbox(): HTMLInputElement | null {
    return this.selectAllCheckbox;
  }
}