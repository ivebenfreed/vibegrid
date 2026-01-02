// ====================================
// ROW RENDERING ENGINE
// ====================================

import { log } from '@/logger'
import type { Column, OptimisticOperation, RenderState, TableRow } from '../../types'
import type { ColumnManager } from '../managers/ColumnManager'
import type { SelectionManager } from '../managers/SelectionManager'
import type { VirtualScrollManager } from '../managers/VirtualScrollManager'
import type { DOMSystem } from '../systems/DOMSystem'
import { CellPipeline } from './CellPipeline'

const fileLog = log('components/custom/vibegrid/renderers/engines/RowEngine.ts')

// ====================================
// CONSTANTS
// ====================================

const CSS_CLASSES = {
  ROW: 'vibegridx-row',
  CELL: 'vibegridx-cell',
  SELECTED: 'vibegridx-selected',
  EDITING: 'vibegridx-editing',
  DIRTY: 'vibegridx-dirty',
  OPTIMISTIC: 'vibegridx-optimistic',
} as const

// ====================================
// TYPES
// ====================================

export interface RowEngineConfig {
  virtualGrid: VirtualScrollManager
  domManager: DOMSystem
  selectionManager: SelectionManager
  rowHeight: number
  enableSelectionColumn: boolean
}

export interface RowRenderMetrics {
  rowsRendered: number
  cellsRendered: number
  renderTime: number
}

// ====================================
// ROW RENDERING ENGINE
// ====================================

export class RowEngine {
  private config: RowEngineConfig
  private lastDimensions = { height: 0, width: 0 }

  constructor(config: RowEngineConfig) {
    this.config = config
  }

  // ====================================
  // PUBLIC API
  // ====================================

  /**
   * Pre-calculate and set body dimensions before rendering
   * This prevents layout recalculation on first scroll
   */
  initializeVirtualDimensions(state: RenderState): void {
    // Set the row count first
    this.config.virtualGrid.setRowCount(state.rows.length)

    // Calculate total height without updating columns width
    const totalHeight = this.config.virtualGrid.getTotalHeight()

    // Just set the body height to establish scrollable area
    this.config.domManager.getElement('body').style.height = `${totalHeight}px`
  }

  /**
   * Render all visible rows
   */
  renderVisibleRows(state: RenderState): RowRenderMetrics {
    const startTime = performance.now()

    const visibleRange = this.config.virtualGrid.getVisibleRange()

    const visibleRows = state.rows.slice(visibleRange.start, visibleRange.end)

    // Update virtual dimensions (in case row count changed)
    this.updateVirtualDimensions(state)

    // Fail fast if visible rows calculation is wrong
    if (visibleRows.length === 0 && state.rows.length > 0) {
      throw new Error(
        'RowEngine: Virtual scrolling returned empty visible rows when data exists - check virtual grid configuration',
      )
    }

    const rowsToRender = visibleRows

    // Clean up rows that are no longer visible
    this.cleanupInvisibleRows(rowsToRender)

    // Render visible rows with batched DOM updates
    const cellCount = this.renderRowsBatched(rowsToRender, visibleRange.start, state)

    const renderTime = performance.now() - startTime

    return {
      rowsRendered: rowsToRender.length,
      cellsRendered: cellCount,
      renderTime,
    }
  }

  /**
   * Update a single row's DOM without full re-render
   */
  updateSingleRow(
    rowId: string,
    newData: any,
    state: RenderState,
    relationshipResolvers?: Record<string, (id: string | string[]) => string>,
  ): void {
    const rowElement = this.config.domManager.getRowElement(rowId)
    if (!rowElement) {
      fileLog.warn('RowEngine: updateSingleRow - row element not found:', rowId)
      return
    }

    fileLog.info('🔧 RowEngine: Updating single row', {
      rowId,
      hasRowElement: !!rowElement,
      newDataKeys: Object.keys(newData),
    })

    // Create TableRow format
    const row: TableRow = {
      id: rowId,
      data: newData,
      metadata: {
        isSelected: false,
        isDirty: false,
        isGroup: false,
        level: 0,
      },
    }

    // Re-render this row's cells
    this.renderRowCells(row, rowElement, state, relationshipResolvers)
  }

  /**
   * Update a single cell's DOM without full re-render
   */
  updateSingleCell(
    rowId: string,
    columnId: string,
    newValue: any,
    column: Column,
    relationshipResolvers?: Record<string, (id: string | string[]) => string>,
  ): void {
    const cellElement = this.config.domManager.getCellElement(rowId, columnId)
    if (!cellElement) {
      fileLog.warn('RowEngine: updateSingleCell - cell element not found:', { rowId, columnId })
      return
    }

    fileLog.info('🔧 RowEngine: Updating single cell', {
      rowId,
      columnId,
      newValue,
      hasElement: !!cellElement,
    })

    // Create row data with the new value
    const rowData = { [column.field || columnId]: newValue }

    // Check if this is a relationship column and resolve it
    if (column && (column.cellType || column.type)?.startsWith('relationship')) {
      const resolver = relationshipResolvers?.[columnId]
      if (resolver && newValue != null) {
        try {
          const resolvedValue = resolver(newValue)
          rowData[`__resolved_${columnId}`] = resolvedValue
          fileLog.info('🔧 RowEngine: Resolved relationship value', {
            columnId,
            rawValue: newValue,
            resolvedValue,
          })
        } catch (error) {
          fileLog.error('RowEngine: Error resolving relationship', {
            columnId,
            value: newValue,
            error,
          })
        }
      }
    }

    // Create new cell content
    const content = CellPipeline.createCellContent(newValue, column, rowData)

    // Replace the cell content
    while (cellElement.firstChild) {
      cellElement.removeChild(cellElement.firstChild)
    }
    cellElement.appendChild(content)
  }

  /**
   * Apply optimistic operations to cells
   */
  applyOptimisticOperations(operations: Map<string, OptimisticOperation> | undefined): void {
    if (!operations || operations.size === 0) {
      return
    }

    operations.forEach((operation) => {
      const cellElement = this.getCellElement(operation.entityId, operation.field)
      if (cellElement) {
        cellElement.classList.add(CSS_CLASSES.OPTIMISTIC)

        // Visual feedback for optimistic updates
        cellElement.style.backgroundColor = 'rgba(59, 130, 246, 0.1)'
        cellElement.style.borderLeft = '3px solid rgb(59, 130, 246)'
      }
    })
  }

  // ====================================
  // PRIVATE METHODS
  // ====================================

  private updateVirtualDimensions(state?: RenderState): void {
    const totalHeight = this.config.virtualGrid.getTotalHeight()
    const totalWidth = this.getTotalColumnsWidth(state)

    // Batch DOM style updates
    this.config.domManager.getElement('body').style.height = `${totalHeight}px`
    this.config.domManager.getElement('body').style.width = `${totalWidth}px`

    // Handle viewport overflow
    const maxScroll = totalHeight - this.config.domManager.getElement('viewport').clientHeight
    if (maxScroll > 0) {
      this.config.domManager.getElement('viewport').style.overflowY = 'scroll'
    }

    // Track dimension changes
    if (totalHeight !== this.lastDimensions.height || totalWidth !== this.lastDimensions.width) {
      this.lastDimensions = { height: totalHeight, width: totalWidth }
    }
  }

  private cleanupInvisibleRows(visibleRows: TableRow[]): void {
    let removedCount = 0
    this.config.domManager.forEachRowElement((element, rowId) => {
      if (!visibleRows.find((row) => row.id === rowId)) {
        this.config.domManager.removeRowElement(rowId)
        element.remove() // Also remove from DOM
        removedCount++
      }
    })
  }

  private renderRowsBatched(rows: TableRow[], startIndex: number, state?: RenderState): number {
    const fragment = document.createDocumentFragment()
    const newRowElements: Array<{ element: HTMLElement; rowId: string }> = []
    let totalCells = 0
    let existingRowCount = 0
    let newRowCount = 0

    // Pre-create new rows in fragment (batched DOM insertion)
    rows.forEach((row, index) => {
      const absoluteIndex = startIndex + index

      let rowElement = this.config.domManager.getRowElement(row.id)
      if (!rowElement) {
        rowElement = this.createRowElement(row)
        newRowElements.push({ element: rowElement, rowId: row.id })
        fragment.appendChild(rowElement)
        newRowCount++
      } else {
        existingRowCount++
      }

      // Position and update row content
      this.updateRowElement(row, rowElement, absoluteIndex, state)
      totalCells += this.getColumnCount(state)
    })

    // Only log occasionally for performance
    if (Math.random() < 0.05) {
      fileLog.info('🎨 RowEngine: Row processing complete', {
        existingRows: existingRowCount,
        newRows: newRowCount,
        totalRows: rows.length,
      })
    }

    // Single DOM append for all new rows
    if (newRowElements.length > 0) {
      this.config.domManager.getElement('body').appendChild(fragment)

      // Register new elements
      newRowElements.forEach(({ element, rowId }) => {
        this.config.domManager.setRowElement(rowId, element)
      })
    }

    return totalCells
  }

  private createRowElement(row: TableRow): HTMLElement {
    const rowElement = document.createElement('div')
    rowElement.className = CSS_CLASSES.ROW
    rowElement.dataset.rowId = row.id
    rowElement.style.borderBottom = '1px solid var(--border)'
    rowElement.style.boxSizing = 'border-box'
    return rowElement
  }

  private updateRowElement(
    row: TableRow,
    rowElement: HTMLElement,
    index: number,
    state?: RenderState,
  ): void {
    // Position row
    const top = this.config.virtualGrid.getRowTop(index)
    rowElement.style.position = 'absolute'
    rowElement.style.top = `${top}px`
    rowElement.style.left = '0px'

    // Calculate total width from columns
    const totalWidth = this.getTotalColumnsWidth(state)
    rowElement.style.width = `${totalWidth}px`
    rowElement.style.height = `${this.config.virtualGrid.getRowHeight()}px`

    // Update row content
    this.renderRowCells(row, rowElement, state)

    // Apply row state styling
    rowElement.classList.toggle(CSS_CLASSES.DIRTY, row.metadata.isDirty || false)
  }

  renderRowCells(
    row: TableRow,
    rowElement: HTMLElement,
    state?: RenderState,
    relationshipResolvers?: Record<string, (id: string | string[]) => string>,
  ): void {
    // Get columns to render - this must come from state to ensure proper ordering
    const columnsToRender = this.getColumnsToRender(row, state)

    // Use row data as-is since ViewActor has already resolved relationships
    const rowDataWithResolved = row

    // Clear existing content properly to avoid overlapping cells
    while (rowElement.firstChild) {
      rowElement.removeChild(rowElement.firstChild)
    }

    // Also clear cell cache for this row to prevent stale references
    const keysToRemove: string[] = []
    this.config.domManager['cellElements'].forEach((_, key) => {
      if (key.startsWith(`${row.id}:`)) {
        keysToRemove.push(key)
      }
    })
    keysToRemove.forEach((key) => this.config.domManager['cellElements'].delete(key))

    // Create document fragment for batched insertion
    const fragment = document.createDocumentFragment()

    // Always add selection checkbox cell (selection column is always enabled)
    const selectionCell = this.createSelectionCell(row)
    fragment.appendChild(selectionCell)

    // Add data cells
    columnsToRender.forEach((column, index) => {
      const cell = this.createDataCell(
        rowDataWithResolved,
        column,
        index,
        columnsToRender,
        state?.coordinateMapping,
      )
      fragment.appendChild(cell)
    })

    // Single DOM insertion
    rowElement.appendChild(fragment)
  }

  private createSelectionCell(row: TableRow): HTMLElement {
    const cellKey = `${row.id}:__selection`
    const isRowSelected = this.config.selectionManager.isRowSelected(row.id)

    const cell = document.createElement('div')
    cell.className = 'vibegridx-cell vibegridx-selection-cell'
    cell.setAttribute('data-row-id', row.id)
    cell.setAttribute('data-column-id', '__selection')
    cell.setAttribute('data-cell-key', cellKey)
    cell.setAttribute('role', 'gridcell')

    // Style selection cell
    Object.assign(cell.style, {
      position: 'absolute',
      left: '0',
      width: '48px',
      height: `${this.config.rowHeight}px`,
      borderRight: '1px solid var(--border)',
      boxSizing: 'border-box',
      overflow: 'hidden',
      zIndex: '5',
      background: 'var(--background)',
    })

    // Create checkbox wrapper
    const wrapper = document.createElement('div')
    Object.assign(wrapper.style, {
      width: '100%',
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    })

    const label = document.createElement('label')
    label.className = 'vibegridx-checkbox-wrapper'
    label.setAttribute('data-row-id', row.id)

    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    checkbox.className = 'vibegridx-row-checkbox'
    checkbox.setAttribute('data-row-id', row.id)
    checkbox.checked = isRowSelected

    const span = document.createElement('span')
    span.className = 'vibegridx-checkbox-custom'

    label.appendChild(checkbox)
    label.appendChild(span)
    wrapper.appendChild(label)
    cell.appendChild(wrapper)

    this.config.domManager.setCellElement(row.id, '__selection', cell)

    return cell
  }

  private createDataCell(
    row: TableRow,
    column: Column,
    index: number,
    allColumns: Column[],
    coordinateMapping?: any,
  ): HTMLElement {
    const cellKey = `${row.id}:${column.id}`
    const value = row.data[column.field || column.id]

    if (!coordinateMapping) {
      throw new Error(`RowEngine: Missing coordinate mapping for cell ${cellKey}`)
    }

    // Get width from coordinate mapping (state machine authority)
    const coordinateColumn = coordinateMapping.columns.find((c: any) => c.columnId === column.id)
    if (!coordinateColumn) {
      throw new Error(`RowEngine: Column ${column.id} not found in coordinate mapping`)
    }

    const width = coordinateColumn.width
    const xOffset = coordinateColumn.offset

    // DEBUG: Log DOM position calculation
    if (column.id === 'project' && row.id === '03097812-7cc9-4d3d-87d3-e0626ee2cfd8') {
      fileLog.info('🔍 RowEngine: Creating project cell DOM position', {
        rowId: row.id,
        columnId: column.id,
        columnIndex: index,
        calculatedXOffset: xOffset,
        columnWidth: width,
        allColumnsCount: allColumns.length,
        allColumnIds: allColumns.map((c) => c.id),
        enableSelectionColumn: this.config.enableSelectionColumn,
      })
    }

    // Create cell element
    const cell = document.createElement('div')
    cell.className = CSS_CLASSES.CELL
    cell.setAttribute('data-row-id', row.id)
    cell.setAttribute('data-column-id', column.id)
    cell.setAttribute('data-cell-key', cellKey)
    cell.setAttribute('role', 'gridcell')

    // Apply state classes
    const isSelected = this.config.selectionManager.isCellSelected(row.id, column.id)
    const isEditing = this.config.selectionManager.isCellEditing(row.id, column.id)
    const isDirty = row.metadata.isDirty || false

    if (isSelected) cell.classList.add(CSS_CLASSES.SELECTED)
    if (isEditing) cell.classList.add(CSS_CLASSES.EDITING)
    if (isDirty) cell.classList.add(CSS_CLASSES.DIRTY)

    // Style cell
    Object.assign(cell.style, {
      position: 'absolute',
      left: `${xOffset}px`,
      width: `${width}px`,
      height: `${this.config.rowHeight}px`,
      borderRight: '1px solid var(--border)',
      boxSizing: 'border-box',
      overflow: 'hidden',
    })

    // Create content using CellPipeline
    const content = CellPipeline.createCellContent(value, column, row.data)
    cell.appendChild(content)

    this.config.domManager.setCellElement(row.id, column.id, cell)

    return cell
  }

  private getColumnsToRender(row: TableRow, state?: RenderState): Column[] {
    if (!state) {
      throw new Error('RowEngine: Missing render state for column rendering')
    }

    // Use columns from render state if available
    const stateColumns = state.columns
    if (stateColumns && stateColumns.length > 0) {
      return stateColumns.filter((col) => col.id !== '__selection')
    }

    // Use coordinate mapping from state machine as authoritative source
    if (!state.coordinateMapping?.columns) {
      throw new Error('RowEngine: Missing coordinate mapping for column rendering')
    }

    const coordinateColumns = state.coordinateMapping.columns
    return coordinateColumns
      .filter((coord: any) => coord.columnId !== '__selection')
      .map((coord: any) => ({
        id: coord.columnId,
        name: coord.columnId,
        field: coord.columnId,
        type: 'text' as const,
        width: coord.width,
      }))
  }

  private calculateCellOffset(index: number, columns: Column[]): number {
    let offset = 48 // Always start after selection column (selection column is always enabled)

    const offsets: Array<{ columnId: string; width: number; cumulative: number }> = []

    for (let i = 0; i < index; i++) {
      const prevColumn = columns[i]
      const prevWidth = prevColumn.width || 120 // Use column width directly
      offset += prevWidth

      offsets.push({
        columnId: prevColumn.id,
        width: prevWidth,
        cumulative: offset,
      })
    }

    // DEBUG: Log offset calculation for project column
    if (index < columns.length && columns[index].id === 'project') {
      fileLog.info('🔍 RowEngine: calculateCellOffset for project column', {
        columnIndex: index,
        finalOffset: offset,
        enableSelectionColumn: this.config.enableSelectionColumn,
        selectionColumnWidth: 48, // Selection column is always enabled
        previousColumns: offsets,
      })
    }

    return offset
  }

  private getTotalColumnsWidth(state?: RenderState): number {
    if (!state?.coordinateMapping) {
      throw new Error('RowEngine: Missing coordinate mapping for total width calculation')
    }

    const coordinateColumns = state.coordinateMapping.columns
    // The coordinate mapping already includes the selection column width
    return coordinateColumns.reduce((sum: number, col: any) => sum + col.width, 0)
  }

  private resolveRelationships(
    row: TableRow,
    columns: Column[],
    resolvers: Record<string, (id: string | string[]) => string>,
  ): TableRow {
    // Create a copy of row data with resolved relationships
    const resolvedData = { ...row.data }

    columns.forEach((column) => {
      const cellType = column.cellType || column.type
      if (cellType?.startsWith('relationship') && resolvers[column.id]) {
        const field = column.field || column.id
        const value = row.data[field]
        if (value != null) {
          // Add resolved value with special key that renderers can use
          resolvedData[`__resolved_${column.id}`] = resolvers[column.id](value)
        }
      }
    })

    return {
      ...row,
      data: resolvedData,
    }
  }

  private getColumnCount(state?: RenderState): number {
    if (!state?.coordinateMapping?.columns) {
      throw new Error('RowEngine: Missing coordinate mapping for column count calculation')
    }

    // The coordinate mapping already includes the selection column
    return state.coordinateMapping.columns.length
  }

  private getCellElement(rowId: string, columnId: string): HTMLElement | null {
    return this.config.domManager
      .getElement('body')
      .querySelector(`[data-row-id="${rowId}"][data-column-id="${columnId}"]`) as HTMLElement
  }
}
