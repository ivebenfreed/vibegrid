/**
 * RowRenderer - Specialized renderer for VibeGrid table rows
 *
 * Handles row creation, group headers, row selection interactions, and checkbox management.
 * Extracted from SimplePassiveRenderer for better modularity and maintainability.
 */

import { log } from '@/logger'
import type { TableCore$, TableInteraction$, TableViewport$ } from '../../stores/pure-observables'
import type { DOMElementFactory } from '../factories/DOMElementFactory'
import type { SelectionController } from '../modules/SelectionController'
import type { CellRenderer } from './CellRenderer'

const fileLog = log('components/custom/vibegrid/renderers/managers/RowRenderer.ts')

const ROW_HEIGHT = 40

export interface RowRendererOptions {
  tableCore$: TableCore$
  tableInteraction$: TableInteraction$
  tableViewport$: TableViewport$
  domFactory: DOMElementFactory
  cellRenderer: CellRenderer
  selectionController?: SelectionController
  enableSelectionColumn?: boolean

  // DOM utility functions
  createElement: (tag: string, className?: string) => HTMLElement
}

export class RowRenderer {
  private tableCore$: TableCore$
  private tableInteraction$: TableInteraction$
  private tableViewport$: TableViewport$
  private domFactory: DOMElementFactory
  private cellRenderer: CellRenderer
  private selectionController?: SelectionController
  private enableSelectionColumn: boolean
  private createElement: (tag: string, className?: string) => HTMLElement

  // Row state
  private activeRows: Map<string, HTMLElement> = new Map()

  constructor(options: RowRendererOptions) {
    this.tableCore$ = options.tableCore$
    this.tableInteraction$ = options.tableInteraction$
    this.tableViewport$ = options.tableViewport$
    this.domFactory = options.domFactory
    this.cellRenderer = options.cellRenderer
    this.selectionController = options.selectionController
    this.enableSelectionColumn = options.enableSelectionColumn ?? false
    this.createElement = options.createElement
  }

  /**
   * Create a complete row element with header and cells
   */
  createRowElement(
    row: any,
    rowIndex: number,
    columns: any[],
    columnVisibility: Record<string, boolean>,
    startX: number = 40,
  ): HTMLElement {
    const rowElement = this.createElement('div', 'vibegridx-row')
    rowElement.dataset.rowId = row.id
    rowElement.style.cssText = `
      position: absolute;
      top: ${rowIndex * ROW_HEIGHT}px;
      left: 0;
      right: 0;
      height: ${ROW_HEIGHT}px;
      border-bottom: 1px solid #f1f3f5;
      background: ${rowIndex % 2 === 0 ? '#ffffff' : '#f8f9fa'};
    `

    // Add row header (row number or checkbox selector) with absolute positioning
    const rowHeader = this.createRowHeader(row, rowIndex)
    rowHeader.style.position = 'absolute'
    rowHeader.style.left = '0'
    rowHeader.style.top = '0'
    rowElement.appendChild(rowHeader)

    // Add cells with absolute positioning
    let currentX = startX
    columns.forEach((column, colIndex) => {
      const cell = this.cellRenderer.createCellElement(row, column, colIndex, currentX)
      rowElement.appendChild(cell)
      currentX += column.width
    })

    // Calculate total width to ensure consistent scrolling with header
    const allVisibleColumns = this.tableCore$.columns
      .get()
      .filter((col) => this.tableCore$.columnVisibility.get()[col.id] !== false)
    const totalRowWidth = 40 + allVisibleColumns.reduce((sum, col) => sum + col.width, 0)
    rowElement.style.width = `${totalRowWidth}px`
    rowElement.style.minWidth = `${totalRowWidth}px`

    // Track active row
    this.activeRows.set(row.id, rowElement)

    return rowElement
  }

  /**
   * Create row header with number or checkbox
   */
  private createRowHeader(row: any, rowIndex: number): HTMLElement {
    const rowHeader = this.createElement('div', 'vibegridx-row-header')
    rowHeader.style.cssText = `
      width: 40px;
      height: ${ROW_HEIGHT}px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #f8f9fa;
      border-right: 1px solid #e9ecef;
      font-size: 12px;
      color: #6c757d;
      cursor: pointer;
      user-select: none;
    `
    rowHeader.dataset.rowId = row.id

    if (this.enableSelectionColumn) {
      // Create checkbox for row selection
      const checkbox = this.createRowCheckbox(row)
      rowHeader.appendChild(checkbox)
    } else {
      // Show row number
      rowHeader.textContent = String(rowIndex + 1)
    }

    // Add click handler for row selection
    this.setupRowHeaderHandler(rowHeader, row)

    return rowHeader
  }

  /**
   * Create checkbox for row selection
   */
  private createRowCheckbox(row: any): HTMLInputElement {
    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    checkbox.style.cssText = `
      width: 16px;
      height: 16px;
      cursor: pointer;
      margin: 0;
    `
    checkbox.dataset.rowId = row.id

    // Check if this row is currently selected (use ALL visible columns, not just virtual ones)
    const allVisibleColumns = this.tableCore$.columns
      .get()
      .filter((col) => this.tableCore$.columnVisibility.get()[col.id] !== false)

    const selectedCells = this.tableInteraction$.selectedCells.get()
    const isRowSelected =
      allVisibleColumns.every((col) => selectedCells.has(`${row.id}:${col.id}`)) &&
      allVisibleColumns.length > 0

    checkbox.checked = isRowSelected

    return checkbox
  }

  /**
   * Set up row header click handling
   */
  private setupRowHeaderHandler(rowHeader: HTMLElement, row: any): void {
    rowHeader.addEventListener('click', (e) => {
      const target = e.target as HTMLElement
      const isCtrlKey = e.ctrlKey || e.metaKey

      // If click is directly on checkbox, let it handle the event
      if (target.tagName === 'INPUT' && target.getAttribute('type') === 'checkbox') {
        const checkbox = target as HTMLInputElement
        const isShiftKey = e.shiftKey

        fileLog.debug('🔘 Checkbox click detected', {
          rowId: row.id,
          isShiftKey,
          checkboxChecked: checkbox.checked,
        })

        if (isShiftKey) {
          // Shift+Click for row range selection
          fileLog.debug('🎯 Shift+Click detected - calling selectRowRange')
          const lastSelectedRowId = this.selectionController?.getLastSelectedRowId()
          if (lastSelectedRowId) {
            this.selectionController?.selectRowRange(lastSelectedRowId, row.id)
          }
        } else {
          // Use toggleRowSelection for proper multi-row behavior
          fileLog.debug('🔘 Regular click - calling toggleRowSelection', {
            rowId: row.id,
          })
          this.selectionController?.toggleRowSelection(row.id)
          this.selectionController?.setLastSelectedRowId(row.id)
        }
        return
      }

      // Click on row header area (but not checkbox) - still select row
      if (isCtrlKey) {
        // Ctrl+Click on row header - add to selection
        e.preventDefault()
        this.selectionController?.selectRow(row.id)
      } else {
        // Regular click - select entire row
        this.selectionController?.selectRow(row.id)
      }

      fileLog.info('🎯 Row header clicked', { rowId: row.id, isCtrlKey })
    })
  }

  /**
   * Create group header element for grouped data
   */
  createGroupHeaderElement(groupRow: any, rowIndex: number): HTMLElement {
    // Delegate to DOM Factory for consistent group header creation
    if (this.domFactory) {
      return this.domFactory.createGroupHeaderElement(groupRow, rowIndex)
    }

    // Fallback implementation for early initialization
    const groupData = groupRow.data
    const level = groupRow.level || 0
    const isExpanded = groupRow.isExpanded

    const rowElement = this.createElement('div', 'vibegridx-row vibegridx-group-header')
    rowElement.dataset.rowId = groupRow.id
    rowElement.dataset.groupId = groupRow.id
    rowElement.style.cssText = `
      position: absolute;
      top: ${rowIndex * ROW_HEIGHT}px;
      left: 0;
      right: 0;
      height: ${ROW_HEIGHT}px;
      display: flex;
      align-items: center;
      background: ${level === 0 ? '#e3f2fd' : '#f5f5f5'};
      border-bottom: 2px solid ${level === 0 ? '#2196f3' : '#9e9e9e'};
      font-weight: ${level === 0 ? '600' : '500'};
      cursor: pointer;
      user-select: none;
    `

    // Add expand/collapse button with proper indentation
    const expandButton = this.createGroupExpandButton(level, isExpanded)
    rowElement.appendChild(expandButton)

    // Group label with count
    const groupLabel = this.createGroupLabel(groupData)
    rowElement.appendChild(groupLabel)

    // Add click handler for expand/collapse
    this.setupGroupHeaderHandler(rowElement, groupRow, isExpanded)

    return rowElement
  }

  /**
   * Create expand/collapse button for group headers
   */
  private createGroupExpandButton(level: number, isExpanded: boolean): HTMLElement {
    const expandButton = this.createElement('div', 'vibegridx-group-expand')
    expandButton.style.cssText = `
      width: ${40 + level * 20}px;
      min-width: ${40 + level * 20}px;
      height: ${ROW_HEIGHT}px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      color: #666;
      padding-left: ${level * 20}px;
    `

    // Triangle icon for expand/collapse
    const triangle = this.createElement('span', 'triangle-icon')
    triangle.innerHTML = isExpanded ? '▼' : '▶'
    triangle.style.cssText = `
      font-size: 12px;
      transition: transform 0.2s;
      margin-right: 8px;
    `
    expandButton.appendChild(triangle)

    return expandButton
  }

  /**
   * Create group label with field name and count
   */
  private createGroupLabel(groupData: any): HTMLElement {
    const groupLabel = this.createElement('div', 'vibegridx-group-label')
    groupLabel.style.cssText = `
      flex: 1;
      display: flex;
      align-items: center;
      padding: 0 12px;
      font-size: 14px;
      color: #333;
    `

    const fieldName = groupData.field.charAt(0).toUpperCase() + groupData.field.slice(1)
    const displayValue = groupData.displayValue
    const count = groupData.rowCount

    groupLabel.innerHTML = `
      <strong>${fieldName}:</strong> 
      <span style="margin: 0 8px;">${displayValue}</span>
      <span style="color: #666; font-size: 12px;">(${count} ${count === 1 ? 'item' : 'items'})</span>
    `

    return groupLabel
  }

  /**
   * Set up group header click handling
   */
  private setupGroupHeaderHandler(
    rowElement: HTMLElement,
    groupRow: any,
    isExpanded: boolean,
  ): void {
    rowElement.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()

      fileLog.info('🎯 Group header clicked', {
        groupId: groupRow.id,
        currentlyExpanded: isExpanded,
      })

      // Toggle group expansion via tableCore$
      this.tableCore$.toggleGroupExpansion(groupRow.id)
    })
  }

  /**
   * Get active rows map
   */
  getActiveRows(): Map<string, HTMLElement> {
    return this.activeRows
  }

  /**
   * Clear active rows tracking
   */
  clearActiveRows(): void {
    this.activeRows.clear()
  }

  /**
   * Update row selection visual state
   */
  updateRowSelectionVisual(rowId: string, isSelected: boolean): void {
    const rowElement = this.activeRows.get(rowId)
    if (rowElement) {
      const checkbox = rowElement.querySelector('input[type="checkbox"]') as HTMLInputElement
      if (checkbox) {
        checkbox.checked = isSelected
      }
    }
  }

  /**
   * Update all row checkboxes based on current selection
   */
  updateAllRowCheckboxes(): void {
    const selectedCells = this.tableInteraction$.selectedCells.get()
    const allVisibleColumns = this.tableCore$.columns
      .get()
      .filter((col) => this.tableCore$.columnVisibility.get()[col.id] !== false)

    this.activeRows.forEach((rowElement, rowId) => {
      const checkbox = rowElement.querySelector('input[type="checkbox"]') as HTMLInputElement
      if (checkbox) {
        const isRowSelected =
          allVisibleColumns.every((col) => selectedCells.has(`${rowId}:${col.id}`)) &&
          allVisibleColumns.length > 0

        checkbox.checked = isRowSelected
      }
    })
  }
}
