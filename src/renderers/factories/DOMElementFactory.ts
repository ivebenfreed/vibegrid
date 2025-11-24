/**
 * DOMElementFactory - Centralized DOM element creation for VibeGrid
 * Provides consistent element creation patterns and styling
 */

import { createLogger } from '@/shared/lib/logging';
import type { InteractionStore } from '../../stores/InteractionStore';
import type { TableCoreStore } from '../../stores/TableCoreStore';
import type { SelectionController } from '../modules/SelectionController';

const fileLog = createLogger('components/custom/vibegrid/renderers/factories/DOMElementFactory.ts');

const ROW_HEIGHT = 40;
const HEADER_HEIGHT = 48;

export interface DOMElementFactoryOptions {
  interactionStore: InteractionStore;
  tableCoreStore?: TableCoreStore;
  selectionController?: SelectionController;
  enableSelectionColumn?: boolean;
  onEntityUpdate?: (rowId: string, updates: Record<string, any>) => Promise<void> | void;
  visualOperations?: any; // Visual operations instance (will be migrated later)
}

export class DOMElementFactory {
  private interactionStore: InteractionStore;
  private tableCoreStore?: TableCoreStore;
  private selectionController?: SelectionController;
  private enableSelectionColumn: boolean;
  private onEntityUpdate?: (rowId: string, updates: Record<string, any>) => Promise<void> | void;
  private visualOperations?: any;

  constructor(options: DOMElementFactoryOptions) {
    this.interactionStore = options.interactionStore;
    this.tableCoreStore = options.tableCoreStore;
    this.selectionController = options.selectionController;
    this.enableSelectionColumn = options.enableSelectionColumn ?? false;
    this.onEntityUpdate = options.onEntityUpdate;
    this.visualOperations = options.visualOperations;
  }

  /**
   * Base element creation with consistent className handling
   */
  createElement(tag: string, className: string): HTMLElement {
    const el = document.createElement(tag);
    el.className = className;
    return el;
  }

  /**
   * Create group header element with expand/collapse functionality
   */
  createGroupHeaderElement(groupRow: any, rowIndex: number): HTMLElement {
    const groupData = groupRow.data;
    const level = groupRow.level || 0;
    const isExpanded = groupRow.isExpanded;

    // Debug logging for missing group data
    if (!groupData) {
      console.error('❌ Group row missing data!', {
        rowIndex,
        groupRowId: groupRow.id,
        groupRowKeys: Object.keys(groupRow),
        fullGroupRow: groupRow
      });
    }

    const rowElement = this.createElement('div', 'vibegridx-row vibegridx-group-header');
    rowElement.dataset.rowId = groupRow.id;
    rowElement.dataset.groupId = groupRow.id;
    rowElement.style.cssText = `
      position: absolute;
      top: ${rowIndex * ROW_HEIGHT}px;
      left: 0;
      right: 0;
      height: ${ROW_HEIGHT}px;
      display: flex;
      align-items: center;
      background: #f8f9fa;
      border-bottom: 1px solid #e9ecef;
      font-weight: 600;
      padding-left: ${level * 20 + 12}px;
      cursor: pointer;
    `;

    // Create expand/collapse button
    const expandButton = this.createElement('div', 'vibegridx-group-expand');
    expandButton.style.cssText = `
      width: 20px;
      height: 20px;
      margin-right: 8px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 3px;
      background: rgba(0,0,0,0.1);
    `;

    // Triangle icon for expand/collapse
    const triangle = this.createElement('span', 'triangle-icon');
    triangle.style.cssText = `
      width: 0;
      height: 0;
      border-left: 4px solid transparent;
      border-right: 4px solid transparent;
      border-top: 6px solid #666;
      transform: ${isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)'};
      transition: transform 0.2s ease;
    `;
    expandButton.appendChild(triangle);

    // Group label
    const groupLabel = this.createElement('div', 'vibegridx-group-label');
    groupLabel.textContent = `${groupData.field}: ${groupData.displayValue} (${groupData.rowCount} items)`;
    groupLabel.style.cssText = 'flex: 1; font-size: 14px;';

    // Note: Click handling delegated to MouseController
    // No direct event handlers in factory - keeps concerns separated

    rowElement.appendChild(expandButton);
    rowElement.appendChild(groupLabel);

    return rowElement;
  }

  /**
   * Create row element with optional selection checkbox
   */
  createRowElement(
    row: any, 
    rowIndex: number, 
    columns: any[],
    columnVisibility: Record<string, boolean>,
    cellElementFactory: (row: any, column: any, colIndex: number) => HTMLElement
  ): HTMLElement {
    const rowElement = this.createElement('div', 'vibegridx-row');
    rowElement.dataset.rowId = row.id;
    rowElement.style.cssText = `
      position: absolute;
      top: ${rowIndex * ROW_HEIGHT}px;
      left: 0;
      right: 0;
      height: ${ROW_HEIGHT}px;
      display: flex;
      align-items: center;
      border-bottom: 1px solid #f1f3f5;
      background: ${rowIndex % 2 === 0 ? '#ffffff' : '#f8f9fa'};
    `;
    
    // Add row header (row number or checkbox selector)
    const rowHeader = this.createElement('div', 'vibegridx-row-header');
    rowHeader.style.cssText = `
      width: 40px;
      min-width: 40px;
      height: ${ROW_HEIGHT}px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: inherit;
      border-right: 1px solid #f1f3f5;
      flex-shrink: 0;
    `;
    rowHeader.dataset.rowId = row.id;

    if (this.enableSelectionColumn) {
      // Add checkbox for row selection
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.style.cssText = `
        width: 16px;
        height: 16px;
        cursor: pointer;
        margin: 0;
      `;
      checkbox.dataset.rowId = row.id;
      
      // Add change handler
      checkbox.addEventListener('change', (e) => {
        const isShiftKey = (e as any).shiftKey;
        // Delegate to selection controller
        this.selectionController?.handleRowCheckboxToggle(row.id, isShiftKey);
      });
      
      rowHeader.appendChild(checkbox);
    } else {
      // Add row number
      const rowNumber = this.createElement('span', 'vibegridx-row-number');
      rowNumber.textContent = String(rowIndex + 1);
      rowNumber.style.cssText = `
        font-size: 12px;
        color: #6c757d;
        font-weight: 500;
      `;
      rowHeader.appendChild(rowNumber);
    }
    
    rowElement.appendChild(rowHeader);
    
    // Add data cells
    columns.forEach((column, colIndex) => {
      // Skip hidden columns
      if (columnVisibility[column.id] === false) {
        return;
      }

      const cell = cellElementFactory(row, column, colIndex);
      rowElement.appendChild(cell);
    });
    
    return rowElement;
  }

  /**
   * Create corner header cell (top-left cell that aligns with row headers)
   */
  createCornerHeaderCell(): { cornerCell: HTMLElement; selectAllCheckbox?: HTMLInputElement } {
    const cornerCell = this.createElement('div', 'vibegridx-corner-header');
    cornerCell.classList.add('vibegridx-header-corner-cell');
    cornerCell.style.cssText = `
      width: 40px;
      min-width: 40px;
      height: ${HEADER_HEIGHT}px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      cursor: pointer;
    `;

    let selectAllCheckbox: HTMLInputElement | undefined;

    if (this.enableSelectionColumn) {
      // Add "select all" checkbox in corner
      selectAllCheckbox = document.createElement('input');
      selectAllCheckbox.type = 'checkbox';
      selectAllCheckbox.style.cssText = `
        width: 16px;
        height: 16px;
        cursor: pointer;
        margin: 0;
      `;
      selectAllCheckbox.title = 'Select all rows';
      
      cornerCell.appendChild(selectAllCheckbox);
    }

    return { cornerCell, selectAllCheckbox };
  }

  /**
   * Create header cell for column
   */
  createHeaderCell(column: any, width: number): HTMLElement {
    const headerCell = this.createElement('div', 'vibegridx-header-cell');
    headerCell.dataset.field = column.id; // Add field ID for sort updates
    headerCell.style.cssText = `
      flex: 0 0 ${width}px;
      height: 100%;
      padding: 0 12px;
      display: flex;
      align-items: center;
      font-weight: 600;
      font-size: 14px;
      position: relative;
    `;

    return headerCell;
  }

  /**
   * Create header text group with label and sort icon
   */
  createHeaderTextGroup(column: any): HTMLElement {
    const textGroup = this.createElement('div', 'vibegridx-header-text-group');
    textGroup.style.cssText = 'display: flex; align-items: center; gap: 6px; flex: 1; min-width: 0;';

    // Header text
    const headerText = this.createElement('span', 'vibegridx-header-text');
    headerText.style.cssText = 'flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
    headerText.textContent = column.label || column.name || column.id;

    textGroup.appendChild(headerText);

    // Sort icon (if column is sortable)
    if (column.sortable !== false) {
      const sortIcon = this.createElement('span', 'vibegridx-sort-icon');
      sortIcon.style.cssText = `
        flex-shrink: 0;
        min-width: 20px;
        width: 20px;
        height: 20px;
        margin-left: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0.4;
        transition: opacity 0.2s ease, transform 0.1s ease;
        cursor: pointer;
        border-radius: 3px;
      `;
      sortIcon.innerHTML = this.createSortIconSVG(null); // No sort initially

      // Enhanced hover effects
      sortIcon.addEventListener('mouseenter', () => {
        sortIcon.style.opacity = '0.8';
        sortIcon.style.backgroundColor = 'rgba(59, 130, 246, 0.1)';
      });

      sortIcon.addEventListener('mouseleave', () => {
        const isActive = sortIcon.classList.contains('active');
        sortIcon.style.opacity = isActive ? '1' : '0.4';
        sortIcon.style.backgroundColor = 'transparent';
      });

      textGroup.appendChild(sortIcon);
    }

    return textGroup;
  }

  /**
   * Create resize handle for column
   */
  createResizeHandle(): HTMLElement {
    const resizeHandle = this.createElement('div', 'vibegridx-resize-handle');
    resizeHandle.style.cssText = `
      position: absolute;
      top: 0;
      right: 0;
      width: 4px;
      height: 100%;
      cursor: col-resize;
      background: transparent;
      z-index: 10;
    `;
    resizeHandle.title = 'Resize column';
    
    return resizeHandle;
  }

  /**
   * Create sort icon SVG - Enhanced with better visibility and size
   */
  private createSortIconSVG(direction: 'asc' | 'desc' | null): string {
    const activeColor = '#3b82f6';
    const inactiveColor = '#9ca3af';
    const hoverColor = '#6366f1';

    return `
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" class="vibegridx-sort-svg">
        <path d="M10 4L14 9H6L10 4Z" fill="${direction === 'asc' ? activeColor : inactiveColor}" stroke="${direction === 'asc' ? activeColor : 'transparent'}" stroke-width="0.5" />
        <path d="M10 16L6 11H14L10 16Z" fill="${direction === 'desc' ? activeColor : inactiveColor}" stroke="${direction === 'desc' ? activeColor : 'transparent'}" stroke-width="0.5" />
      </svg>
    `;
  }

  /**
   * Update sort icon for a column with enhanced visual feedback
   */
  updateSortIcon(headerElement: HTMLElement, direction: 'asc' | 'desc' | null): void {
    const sortIcon = headerElement.querySelector('.vibegridx-sort-icon');
    if (sortIcon) {
      sortIcon.innerHTML = this.createSortIconSVG(direction);

      // Update visual state
      if (direction) {
        sortIcon.classList.add('active');
        (sortIcon as HTMLElement).style.opacity = '1';
        (sortIcon as HTMLElement).style.color = '#3b82f6';
      } else {
        sortIcon.classList.remove('active');
        (sortIcon as HTMLElement).style.opacity = '0.4';
        (sortIcon as HTMLElement).style.color = '#9ca3af';
      }
    }
  }
}