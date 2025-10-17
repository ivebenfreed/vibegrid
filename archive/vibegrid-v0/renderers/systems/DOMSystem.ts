import type { Column } from '../../types';
import { log } from '@/logger';
const fileLog = log('components/custom/vibegrid/renderers/systems/DOMSystem.ts');

// ====================================
// DOM STRUCTURE MANAGER
// ====================================

const CSS_CLASSES = {
  TABLE: 'vibegridx-table',
  HEADER: 'vibegridx-header',
  BODY: 'vibegridx-body',
  ROW: 'vibegridx-row',
  CELL: 'vibegridx-cell',
  SELECTED: 'vibegridx-selected',
  EDITING: 'vibegridx-editing',
  DIRTY: 'vibegridx-dirty',
  OPTIMISTIC: 'vibegridx-optimistic'
} as const;

interface DOMElements {
  container: HTMLElement;
  table: HTMLElement;
  headerViewport: HTMLElement;
  header: HTMLElement;
  viewport: HTMLElement;
  body: HTMLElement;
  canvasContainer: HTMLElement;
}

/**
 * Manages DOM structure creation and element management
 * Extracted from TableRenderer for better separation of concerns
 */
export class DOMSystem {
  private elements: DOMElements;
  private rowElements = new Map<string, HTMLElement>();
  private cellElements = new Map<string, HTMLElement>(); // "rowId:columnId" -> element
  
  constructor(container: HTMLElement) {
    this.elements = this.initializeDOM(container);
  }
  
  /**
   * Initialize the complete DOM structure
   */
  private initializeDOM(container: HTMLElement): DOMElements {
    fileLog.info('🔧 DOMSystem: Starting DOM initialization');
    
    // Clear and setup container
    container.innerHTML = '';
    container.className = CSS_CLASSES.TABLE;
    
    // Create table structure
    const table = document.createElement('div');
    table.className = 'vibegridx-table-wrapper';
    Object.assign(table.style, {
      display: 'flex',
      flexDirection: 'column',
      width: '100%',
      height: '100%'
    });
    
    // Create header viewport for synchronized horizontal scrolling
    const headerViewport = document.createElement('div');
    headerViewport.className = 'vibegridx-header-viewport';
    Object.assign(headerViewport.style, {
      overflow: 'hidden',
      position: 'relative',
      flexShrink: '0' // Don't shrink header
    });
    
    const header = document.createElement('div');
    header.className = CSS_CLASSES.HEADER;
    Object.assign(header.style, {
      position: 'relative',
      whiteSpace: 'nowrap'
    });
    
    headerViewport.appendChild(header);
    
    // Create viewport for scrollable content
    const viewport = document.createElement('div');
    viewport.className = 'vibegridx-viewport';
    // Prevent viewport from receiving focus (focus is managed on container)
    viewport.setAttribute('tabindex', '-1');
    Object.assign(viewport.style, {
      overflow: 'auto',
      position: 'relative',
      flex: '1 1 auto', // Grow and shrink
      minHeight: '0',
      width: '100%'
    });
    
    // Create body for table rows
    const body = document.createElement('div');
    body.className = CSS_CLASSES.BODY;
    body.style.position = 'relative';
    
    viewport.appendChild(body);
    
    // Pre-create canvas overlay container for immediate initialization
    const canvasContainer = document.createElement('div');
    canvasContainer.className = 'vibegridx-canvas-overlay-container';
    Object.assign(canvasContainer.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      width: '100%',  // Cover the full content width
      height: '100%', // Cover the full content height
      pointerEvents: 'none', // Canvas is display only, DOM cells handle events
      zIndex: '100'  // Higher z-index to ensure it's on top
    });
    
    body.appendChild(canvasContainer);
    
    // Assemble final structure
    table.appendChild(headerViewport);
    table.appendChild(viewport);
    container.appendChild(table);
    
    fileLog.info('🔧 DOMSystem: DOM initialization complete');
    
    return {
      container,
      table,
      headerViewport,
      header,
      viewport,
      body,
      canvasContainer
    };
  }
  
  /**
   * Get DOM elements
   */
  getElements(): DOMElements {
    return this.elements;
  }
  
  /**
   * Get specific element
   */
  getElement<K extends keyof DOMElements>(key: K): DOMElements[K] {
    return this.elements[key];
  }
  
  /**
   * Create a header cell element
   */
  createHeaderCell(column: Column, width: number): HTMLElement {
    const headerCell = document.createElement('div');
    headerCell.className = 'vibegridx-header-cell';
    headerCell.dataset.columnId = column.id;
    Object.assign(headerCell.style, {
      display: 'inline-block',
      width: `${width}px`,
      position: 'relative',
      borderRight: '1px solid #e0e0e0',
      userSelect: 'none'
    });
    
    const headerText = document.createElement('span');
    headerText.className = 'vibegridx-header-text';
    headerText.textContent = column.name || column.id;
    Object.assign(headerText.style, {
      padding: '8px 12px',
      display: 'block',
      fontWeight: '500'
    });
    
    const sortIcon = document.createElement('span');
    sortIcon.className = 'vibegridx-sort-icon';
    Object.assign(sortIcon.style, {
      position: 'absolute',
      right: '24px',
      top: '50%',
      transform: 'translateY(-50%)',
      fontSize: '12px'
    });
    
    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'vibegridx-resize-handle';
    Object.assign(resizeHandle.style, {
      position: 'absolute',
      right: '0',
      top: '0',
      width: '4px',
      height: '100%',
      cursor: 'col-resize',
      backgroundColor: 'transparent'
    });
    
    headerCell.appendChild(headerText);
    headerCell.appendChild(sortIcon);
    headerCell.appendChild(resizeHandle);
    
    return headerCell;
  }
  
  /**
   * Create a selection header cell
   */
  createSelectionHeaderCell(): HTMLElement {
    const selectionHeader = document.createElement('div');
    selectionHeader.className = 'vibegridx-header-cell vibegridx-selection-header';
    Object.assign(selectionHeader.style, {
      display: 'inline-block',
      width: '48px',
      textAlign: 'center',
      borderRight: '1px solid #e0e0e0'
    });
    
    const checkboxWrapper = document.createElement('label');
    checkboxWrapper.className = 'vibegridx-checkbox-wrapper';
    checkboxWrapper.style.cursor = 'pointer';
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'vibegridx-select-all-checkbox';
    Object.assign(checkbox.style, {
      margin: '0',
      cursor: 'pointer'
    });
    
    const checkboxCustom = document.createElement('span');
    checkboxCustom.className = 'vibegridx-checkbox-custom';
    
    checkboxWrapper.appendChild(checkbox);
    checkboxWrapper.appendChild(checkboxCustom);
    selectionHeader.appendChild(checkboxWrapper);
    
    return selectionHeader;
  }
  
  /**
   * Create a row element
   */
  createRowElement(rowId: string, rowHeight: number): HTMLElement {
    const rowElement = document.createElement('div');
    rowElement.className = CSS_CLASSES.ROW;
    rowElement.dataset.rowId = rowId;
    Object.assign(rowElement.style, {
      position: 'absolute',
      left: '0',
      right: '0',
      height: `${rowHeight}px`,
      borderBottom: '1px solid #f0f0f0',
      backgroundColor: '#ffffff',
      boxSizing: 'border-box'
    });
    
    // Cache the row element
    this.rowElements.set(rowId, rowElement);
    
    return rowElement;
  }
  
  /**
   * Create a data cell element
   */
  createDataCell(rowId: string, columnId: string, width: number, content: HTMLElement): HTMLElement {
    const cell = document.createElement('div');
    cell.className = CSS_CLASSES.CELL;
    cell.dataset.rowId = rowId;
    cell.dataset.columnId = columnId;
    
    Object.assign(cell.style, {
      display: 'inline-block',
      width: `${width}px`,
      height: '100%',
      borderRight: '1px solid #f0f0f0',
      boxSizing: 'border-box',
      verticalAlign: 'top',
      position: 'relative'
    });
    
    cell.appendChild(content);
    
    // Cache the cell element
    const cellKey = `${rowId}:${columnId}`;
    this.cellElements.set(cellKey, cell);
    
    return cell;
  }
  
  /**
   * Create a selection cell element
   */
  createSelectionCell(rowId: string, isSelected: boolean): HTMLElement {
    const cell = document.createElement('div');
    cell.className = `${CSS_CLASSES.CELL} vibegridx-selection-cell`;
    cell.dataset.rowId = rowId;
    cell.dataset.columnId = '__selection';
    
    Object.assign(cell.style, {
      display: 'inline-block',
      width: '48px',
      height: '100%',
      borderRight: '1px solid #f0f0f0',
      textAlign: 'center',
      backgroundColor: isSelected ? '#e3f2fd' : 'transparent',
      boxSizing: 'border-box'
    });
    
    const wrapper = document.createElement('div');
    Object.assign(wrapper.style, {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%'
    });
    
    const label = document.createElement('label');
    label.className = 'vibegridx-checkbox-wrapper';
    label.style.cursor = 'pointer';
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = isSelected;
    checkbox.className = 'vibegridx-row-checkbox';
    Object.assign(checkbox.style, {
      margin: '0',
      cursor: 'pointer'
    });
    
    const span = document.createElement('span');
    span.className = 'vibegridx-checkbox-custom';
    
    label.appendChild(checkbox);
    label.appendChild(span);
    wrapper.appendChild(label);
    cell.appendChild(wrapper);
    
    return cell;
  }
  
  /**
   * Get cached row element
   */
  getRowElement(rowId: string): HTMLElement | undefined {
    return this.rowElements.get(rowId);
  }
  
  /**
   * Get cached cell element
   */
  getCellElement(rowId: string, columnId: string): HTMLElement | undefined {
    return this.cellElements.get(`${rowId}:${columnId}`);
  }
  
  /**
   * Clear row element cache
   */
  clearRowCache(rowId: string): void {
    this.rowElements.delete(rowId);
    
    // Clear all cell elements for this row
    const cellsToRemove: string[] = [];
    for (const [cellKey] of this.cellElements) {
      if (cellKey.startsWith(`${rowId}:`)) {
        cellsToRemove.push(cellKey);
      }
    }
    cellsToRemove.forEach(key => this.cellElements.delete(key));
  }
  
  /**
   * Clear all element caches
   */
  clearAllCaches(): void {
    this.rowElements.clear();
    this.cellElements.clear();
  }
  
  /**
   * Iterate over cached row elements
   */
  forEachRowElement(callback: (element: HTMLElement, rowId: string) => void): void {
    this.rowElements.forEach(callback);
  }
  
  /**
   * Iterate over cached cell elements
   */
  forEachCellElement(callback: (element: HTMLElement, cellKey: string) => void): void {
    this.cellElements.forEach(callback);
  }
  
  /**
   * Remove row element from cache and DOM
   */
  removeRowElement(rowId: string): void {
    const element = this.rowElements.get(rowId);
    if (element) {
      element.remove();
      this.clearRowCache(rowId);
    }
  }
  
  /**
   * Set row element in cache
   */
  setRowElement(rowId: string, element: HTMLElement): void {
    this.rowElements.set(rowId, element);
  }
  
  /**
   * Set cell element in cache
   */
  setCellElement(rowId: string, columnId: string, element: HTMLElement): void {
    const cellKey = `${rowId}:${columnId}`;
    this.cellElements.set(cellKey, element);
  }
  
  /**
   * Update row element styles
   */
  updateRowStyles(rowId: string, styles: Partial<CSSStyleDeclaration>): void {
    const rowElement = this.rowElements.get(rowId);
    if (rowElement) {
      Object.assign(rowElement.style, styles);
    }
  }
  
  /**
   * Update cell element styles
   */
  updateCellStyles(rowId: string, columnId: string, styles: Partial<CSSStyleDeclaration>): void {
    const cellElement = this.cellElements.get(`${rowId}:${columnId}`);
    if (cellElement) {
      Object.assign(cellElement.style, styles);
    }
  }
  
  /**
   * Get element cache metrics
   */
  getCacheMetrics() {
    return {
      rowElements: this.rowElements.size,
      cellElements: this.cellElements.size,
      totalElements: this.rowElements.size + this.cellElements.size
    };
  }
  
  /**
   * CSS class constants
   */
  static get CSS_CLASSES() {
    return CSS_CLASSES;
  }
}