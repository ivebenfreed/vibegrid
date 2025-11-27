/**
 * InteractionStore - Interaction State Management (MobX)
 *
 * Migrated from interaction-state.ts (Legend State → MobX)
 *
 * This store handles all UI interaction state including:
 * - Selection (cells, rows, ranges, multi-selection)
 * - Editing (cell editing, validation)
 * - Focus (keyboard navigation)
 * - Hover state
 * - Drag and drop (cell drag, drag-to-select)
 * - Column resize
 * - Menu states (header menus, context menus, visibility menu, group menu)
 * - Clipboard operations
 *
 * This is the most complex interaction layer with sophisticated selection logic.
 */

import { action, computed, makeObservable, observable, runInAction } from 'mobx'
import type { IStore } from '@/app/stores/types'
import { DisposerManager } from '@/app/stores/utils/disposer'
import { createLogger } from '@/shared/lib/logging'
import type { TableCoreStore } from './TableCoreStore'
import type { VisualStateStore } from './VisualStateStore'

const log = createLogger('components/vibegrid/stores/InteractionStore')

// ====================================
// ASSERTION HELPERS
// ====================================

/**
 * Assert that a store dependency is present
 * Throws a clear error if the store was not initialized
 */
function assertStorePresent<T>(store: T | null, name: string): asserts store is T {
  if (!store) {
    throw new Error(`InteractionStore: ${name} not initialized. Call set${name}() before use.`)
  }
}

// ====================================
// TYPES
// ====================================

export interface SelectAllCheckboxState {
  checked: boolean
  indeterminate: boolean
}

export interface HeaderMenuState {
  openMenu: string | null // columnId of open menu
  position: { x: number; y: number }
  menuType: 'filter' | 'sort' | 'settings' | null
}

export interface ContextMenuState {
  isOpen: boolean
  position: { x: number; y: number }
  context: 'cell' | 'row' | 'column' | 'header' | null
  targetId: string | null // cellId, rowId, or columnId
}

export interface ColumnVisibilityMenuState {
  isOpen: boolean
  searchValue: string
}

export interface GroupConfigMenuState {
  isOpen: boolean
}

export interface ClipboardState {
  data: any[][] | null
  operation: 'copy' | 'cut' | null
  copiedCells: Set<string>
  richData?: import('../types/clipboard-types').VibeGridClipboardData // Rich clipboard data for paste validation
}

export interface ColumnResizeState {
  isResizing: boolean
  columnId: string
  startWidth: number
  newWidth: number
}

export interface DragSource {
  row: string
  column: string
}

export interface EditValidation {
  isValid: boolean
  message?: string
}

// ====================================
// STORE
// ====================================

/**
 * InteractionStore - Manages all UI interaction state
 *
 * Handles:
 * - Cell and row selection (single, multi, range)
 * - Cell editing with validation
 * - Keyboard navigation and focus
 * - Hover state tracking
 * - Drag and drop operations
 * - Column resizing
 * - Menu state management
 * - Clipboard operations
 */
export class InteractionStore implements IStore {
  // ====================================
  // MOUSE COORDINATE STATE
  // ====================================

  @observable mouseX: number = 0
  @observable mouseY: number = 0
  @observable isMouseDown: boolean = false

  // ====================================
  // SELECTION STATE
  // ====================================

  @observable selectedCells: Set<string> = new Set()
  @observable selectedRows: Set<string> = new Set()
  @observable anchorCell: string | null = null
  @observable selectionMode: 'cell' | 'row' | 'range' | 'multi' = 'cell'
  @observable isSelecting: boolean = false
  @observable lastBulkSelectionTime: number = 0

  // Version tracking for selection state changes (used by OverlayManager for efficient change detection)
  @observable selectionVersion: number = 0

  // ====================================
  // EDITING STATE
  // ====================================

  @observable editingCell: string | null = null
  @observable editValue: any = null
  @observable isEditing: boolean = false
  @observable isCancelling: boolean = false
  @observable editValidation: EditValidation | null = null

  // ====================================
  // FOCUS STATE
  // ====================================

  @observable focusedCell: string | null = null

  // ====================================
  // HOVER STATE
  // ====================================

  @observable hoveredCell: string | null = null
  @observable hoveredRow: string | null = null

  // ====================================
  // DRAG STATE
  // ====================================

  @observable isDragging: boolean = false
  @observable dragSource: DragSource | null = null
  @observable dragTarget: DragSource | null = null

  // Drag selection state (for drag-to-select ranges)
  @observable isDragSelecting: boolean = false
  @observable dragSelectStart: string | null = null
  @observable dragSelectCurrent: string | null = null

  // ====================================
  // RESIZE STATE
  // ====================================

  @observable resizingColumn: string | null = null
  @observable resizeStartX: number = 0
  @observable resizeStartWidth: number = 0
  @observable columnResize: ColumnResizeState | null = null

  // Version tracking for resize state changes
  @observable columnResizeVersion: number = 0

  // Track last resize end time to prevent sort on resize mouseup
  @observable lastResizeEndTime: number = 0

  // ====================================
  // MENU STATES
  // ====================================

  @observable headerMenuState: HeaderMenuState = {
    openMenu: null,
    position: { x: 0, y: 0 },
    menuType: null,
  }

  @observable contextMenuState: ContextMenuState = {
    isOpen: false,
    position: { x: 0, y: 0 },
    context: null,
    targetId: null,
  }

  @observable columnVisibilityMenuState: ColumnVisibilityMenuState = {
    isOpen: false,
    searchValue: '',
  }

  @observable groupConfigMenuState: GroupConfigMenuState = {
    isOpen: false,
  }

  // ====================================
  // CLIPBOARD STATE
  // ====================================

  @observable clipboard: ClipboardState | null = null

  // Version tracking for clipboard state changes
  @observable clipboardVersion: number = 0

  // ====================================
  // DEPENDENCIES (Injected)
  // ====================================

  private tableCore$: unknown = null // Legacy tableCore reference
  private tableCoreStore: TableCoreStore | null = null
  private visualStateStore: VisualStateStore | null = null
  private collection: any = null // TanStack DB collection for entity mutations
  private disposers = new DisposerManager()

  constructor(tableCore$?: any) {
    makeObservable(this)
    this.tableCore$ = tableCore$
  }

  /**
   * Set TableCoreStore reference (for MobX architecture)
   */
  setTableCoreStore(store: TableCoreStore): void {
    this.tableCoreStore = store
  }

  /**
   * Set VisualStateStore reference (for MobX architecture)
   */
  setVisualStateStore(store: VisualStateStore): void {
    this.visualStateStore = store
  }

  /**
   * Set TanStack DB collection for entity mutations
   */
  setCollection(collection: any): void {
    this.collection = collection
    log.info('TanStack DB collection set', {
      hasCollection: !!collection,
    })
  }

  /**
   * Initialize store
   */
  @action
  async init(): Promise<void> {
    log.info('Initializing InteractionStore')
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    this.disposers.dispose()
    log.info('InteractionStore disposed')
  }

  /**
   * Reset to default state
   */
  @action
  reset(): void {
    this.mouseX = 0
    this.mouseY = 0
    this.isMouseDown = false
    this.selectedCells = new Set()
    this.selectedRows = new Set()
    this.anchorCell = null
    this.selectionMode = 'cell'
    this.isSelecting = false
    this.lastBulkSelectionTime = 0
    this.editingCell = null
    this.editValue = null
    this.isEditing = false
    this.isCancelling = false
    this.editValidation = null
    this.focusedCell = null
    this.hoveredCell = null
    this.hoveredRow = null
    this.isDragging = false
    this.dragSource = null
    this.dragTarget = null
    this.isDragSelecting = false
    this.dragSelectStart = null
    this.dragSelectCurrent = null
    this.resizingColumn = null
    this.resizeStartX = 0
    this.resizeStartWidth = 0
    this.columnResize = null
    this.headerMenuState = { openMenu: null, position: { x: 0, y: 0 }, menuType: null }
    this.contextMenuState = {
      isOpen: false,
      position: { x: 0, y: 0 },
      context: null,
      targetId: null,
    }
    this.columnVisibilityMenuState = { isOpen: false, searchValue: '' }
    this.groupConfigMenuState = { isOpen: false }
    this.clipboard = null
    log.info('InteractionStore reset to defaults')
  }

  // ====================================
  // COMPUTED VALUES
  // ====================================

  /**
   * Select all checkbox state (computed from selected cells)
   */
  @computed get selectAllCheckboxState(): SelectAllCheckboxState {
    const selectedCount = this.selectedCells.size

    if (selectedCount === 0) {
      return { checked: false, indeterminate: false }
    } else {
      // Without data context, show indeterminate when any cells are selected
      return { checked: false, indeterminate: true }
    }
  }

  /**
   * Get current hovered cell from mouse position
   */
  @computed get currentHoveredCell(): string | null {
    if (this.mouseX === 0 && this.mouseY === 0) return null

    // Find cell at coordinates using DOM
    const targetElement = document.elementFromPoint(this.mouseX, this.mouseY)
    const cellElement = targetElement?.closest('[data-row-id][data-column-id]')

    if (cellElement) {
      const rowId = cellElement.getAttribute('data-row-id')
      const columnId = cellElement.getAttribute('data-column-id')
      return `${rowId}:${columnId}`
    }

    return null
  }

  // ====================================
  // MOUSE COORDINATE ACTIONS
  // ====================================

  @action
  setMousePosition(x: number, y: number): void {
    this.mouseX = x
    this.mouseY = y
  }

  @action
  setMouseDown(isDown: boolean): void {
    this.isMouseDown = isDown
  }

  // ====================================
  // SELECTION ACTIONS
  // ====================================

  /**
   * Select a single cell
   */
  @action
  selectCell(cellId: string, isMulti: boolean = false): void {
    // CLEAR ROW SELECTION: Cell selection clears row selection mode
    this.selectedRows = new Set()

    if (!isMulti) {
      // CLEAR SELECTION: Single selection replaces all
      this.selectedCells = new Set([cellId])
      this.anchorCell = cellId
      log.debug('Single cell selection (cleared others)', { cellId })
    } else {
      // MULTI SELECTION: Toggle cell in existing selection
      const currentSelected = new Set(this.selectedCells)

      if (currentSelected.has(cellId)) {
        currentSelected.delete(cellId)
        log.debug('Removed cell from multi-selection', { cellId })
      } else {
        currentSelected.add(cellId)
        log.debug('Added cell to multi-selection', { cellId })
      }

      this.selectedCells = currentSelected
      this.anchorCell = cellId
    }

    // Increment version to trigger overlay updates
    this.selectionVersion++
    log.debug('📊 Selection version incremented', {
      newVersion: this.selectionVersion,
      cellId,
      isMulti
    })

    log.info('Cell selected', { cellId, isMulti, selectionCount: this.selectedCells.size })
  }

  /**
   * Handle cell click with selection logic only
   *
   * @param cellId - The cell ID to handle
   * @param isEditable - DEPRECATED: No longer used (editing handled by CellActionRouter)
   * @param ctrlKey - Whether Ctrl key was pressed (for multi-select)
   * @param shiftKey - Whether Shift key was pressed (for range select)
   */
  @action
  handleCellClick(cellId: string, isEditable: boolean, ctrlKey: boolean, shiftKey: boolean): void {
    // Assert stores are initialized
    assertStorePresent(this.tableCoreStore, 'TableCoreStore')
    assertStorePresent(this.visualStateStore, 'VisualStateStore')

    // CONFLICT PREVENTION: Skip if row/column selection just happened
    const now = Date.now()
    if (now - this.lastBulkSelectionTime < 50) {
      log.info('Skipping cell click - recent bulk selection detected', {
        cellId,
        timeSinceLastBulk: now - this.lastBulkSelectionTime,
      })
      return
    }

    // 1. Always set focus
    this.setFocusedCell(cellId)

    // 2. Handle selection with Shift and Ctrl support
    if (shiftKey && this.anchorCell) {
      // SHIFT+CLICK: Range selection from anchor cell
      const dataContext = this.getDataContext()
      this.selectRange(this.anchorCell, cellId, dataContext)
      log.info('Shift+click range selection', {
        from: this.anchorCell,
        to: cellId,
        hasDataContext: !!dataContext,
      })
    } else if (ctrlKey) {
      // CTRL+CLICK: Multi-select (toggle cell in selection)
      this.selectCell(cellId, true)
      log.info('Ctrl+click multi-select', { cellId })
    } else {
      // NORMAL CLICK: Single selection
      this.selectCell(cellId, false)
      log.info('Normal click single selection', { cellId })
    }

    // ✅ REFACTORED: Auto-edit removed
    // Editing is now handled by CellActionRouter based on interaction policies
    // This method only handles selection, not editing

    log.info('Cell click handled', {
      cellId,
      ctrlKey,
      shiftKey,
      selectedCells: this.selectedCells.size,
    })
  }

  /**
   * Get data context for range selection (MobX stores)
   */
  private getDataContext():
    | { rows: any[]; columns: any[]; columnVisibility: Record<string, boolean> }
    | undefined {
    // Assert stores are initialized before accessing
    assertStorePresent(this.tableCoreStore, 'TableCoreStore')
    assertStorePresent(this.visualStateStore, 'VisualStateStore')

    try {
      const rows = this.tableCoreStore.processedRows || []
      const columns = this.visualStateStore.columns || []
      const columnVisibility = this.visualStateStore.columnVisibility || {}

      return { rows, columns, columnVisibility }
    } catch (error) {
      log.error('Error getting data context', error)
      return undefined
    }
  }

  /**
   * Select a row
   */
  @action
  selectRow(rowId: string, isMulti: boolean = false): void {
    // CLEAR CELL SELECTION: Row selection clears cell selection mode
    this.selectedCells = new Set()

    if (!isMulti) {
      // CLEAR SELECTION: Single row selection replaces all
      this.selectedRows = new Set([rowId])
      log.debug('Single row selection (cleared others)', { rowId })
    } else {
      // MULTI SELECTION: Toggle row in existing selection
      const currentSelected = new Set(this.selectedRows)

      if (currentSelected.has(rowId)) {
        currentSelected.delete(rowId)
        log.debug('Removed row from multi-selection', { rowId })
      } else {
        currentSelected.add(rowId)
        log.debug('Added row to multi-selection', { rowId })
      }

      this.selectedRows = currentSelected
    }

    // Increment version to trigger overlay updates
    this.selectionVersion++

    log.info('Row selected', { rowId, isMulti, selectionCount: this.selectedRows.size })
  }

  /**
   * Select all cells
   */
  @action
  selectAll(dataContext?: {
    rows: any[]
    columns: any[]
    columnVisibility: Record<string, boolean>
  }): void {
    if (!dataContext) {
      log.warn('selectAll called without data context - ignoring')
      return
    }

    const { rows, columns, columnVisibility } = dataContext
    const visibleColumns = columns.filter((col: any) => columnVisibility[col.id] !== false)

    const allCells = new Set<string>()
    for (const row of rows) {
      for (const column of visibleColumns) {
        allCells.add(`${row.id}:${column.id}`)
      }
    }

    this.selectedCells = allCells

    // Increment version to trigger overlay updates
    this.selectionVersion++

    log.info('All cells selected with data context', {
      totalCells: this.selectedCells.size,
    })
  }

  /**
   * Clear all selection and focus state
   * 🔧 Also clear focus/hover to avoid stale cell references after layout changes
   */
  @action
  clearSelection(): void {
    this.selectedCells = new Set()
    this.selectedRows = new Set()
    this.anchorCell = null
    this.focusedCell = null
    this.hoveredCell = null
    this.hoveredRow = null

    // Increment version to trigger overlay updates
    this.selectionVersion++

    log.info('Selection and focus cleared')
  }

  /**
   * Handle outside click
   */
  @action
  async handleOutsideClick(): Promise<void> {
    if (this.isEditing) {
      log.info('Outside click while editing - saving edit and preserving selection')
      // ✅ Pass editValue to ensure latest typed value is saved (fix stale value bug)
      await this.saveEdit(this.editValue)
    } else {
      log.info('Outside click - clearing selection')
      this.clearSelection()
    }
  }

  /**
   * Set focused cell
   */
  @action
  setFocusedCell(cellId: string | null): void {
    this.focusedCell = cellId

    // If no anchor cell is set, use focused cell as anchor
    if (cellId && !this.anchorCell) {
      this.anchorCell = cellId
    }

    log.info('Focused cell changed', { cellId })
  }

  /**
   * Select range of cells
   */
  @action
  selectRange(
    startCellId: string,
    endCellId: string,
    dataContext?: { rows: any[]; columns: any[]; columnVisibility: Record<string, boolean> },
  ): void {
    // If no data context provided, fall back to simple selection
    if (!dataContext) {
      const cellsToSelect = new Set<string>()
      cellsToSelect.add(startCellId)
      cellsToSelect.add(endCellId)

      this.selectedCells = cellsToSelect
      this.anchorCell = startCellId

      // Increment version to trigger overlay updates
      this.selectionVersion++

      log.info('Simple range selection (no data context)', {
        count: cellsToSelect.size,
        from: startCellId,
        to: endCellId,
      })
      return
    }

    // Full range selection with data context
    const [startRowId, startColId] = startCellId.split(':')
    const [endRowId, endColId] = endCellId.split(':')

    const { rows } = dataContext

    // FIX: Use visual column order from VisualStateStore instead of dataContext columns
    // This ensures range selection respects column reordering
    assertStorePresent(this.visualStateStore, 'VisualStateStore')
    const visibleColumns = this.visualStateStore.visibleOrderedColumns

    // Get row and column indices
    const startRowIndex = rows.findIndex((row: any) => row.id === startRowId)
    const endRowIndex = rows.findIndex((row: any) => row.id === endRowId)
    const startColIndex = visibleColumns.findIndex((col: any) => col.id === startColId)
    const endColIndex = visibleColumns.findIndex((col: any) => col.id === endColId)

    if (startRowIndex === -1 || endRowIndex === -1 || startColIndex === -1 || endColIndex === -1) {
      log.warn('Range selection failed - could not find indices', {
        startRowIndex,
        endRowIndex,
        startColIndex,
        endColIndex,
      })

      // Fallback to simple selection
      const cellsToSelect = new Set<string>()
      cellsToSelect.add(startCellId)
      cellsToSelect.add(endCellId)

      this.selectedCells = cellsToSelect
      this.anchorCell = startCellId

      // Increment version to trigger overlay updates
      this.selectionVersion++

      log.info('Fallback range selection (index lookup failed)', {
        count: cellsToSelect.size,
      })
      return
    }

    // Ensure proper ordering
    const minRowIndex = Math.min(startRowIndex, endRowIndex)
    let maxRowIndex = Math.max(startRowIndex, endRowIndex)
    const minColIndex = Math.min(startColIndex, endColIndex)
    const maxColIndex = Math.max(startColIndex, endColIndex)

    // Constrain selection to group boundaries
    // Check if rows have group information (VirtualRow with parentGroupId)
    const startRow = rows[minRowIndex]
    if (startRow && 'parentGroupId' in startRow && startRow.type === 'data') {
      const startGroupId = startRow.parentGroupId

      // Find the last row in the same group
      for (let rowIndex = minRowIndex + 1; rowIndex <= maxRowIndex; rowIndex++) {
        const currentRow = rows[rowIndex]

        // Stop if we hit a different group or a group header
        if (currentRow.type !== 'data' || currentRow.parentGroupId !== startGroupId) {
          maxRowIndex = rowIndex - 1
          log.info('Selection constrained to group boundary', {
            originalMaxRow: Math.max(startRowIndex, endRowIndex),
            constrainedMaxRow: maxRowIndex,
            groupId: startGroupId,
          })
          break
        }
      }
    }

    // Select all cells in the range
    const newSelection = new Set<string>()
    for (let rowIndex = minRowIndex; rowIndex <= maxRowIndex; rowIndex++) {
      for (let colIndex = minColIndex; colIndex <= maxColIndex; colIndex++) {
        const rowId = rows[rowIndex].id
        const columnId = visibleColumns[colIndex].id
        newSelection.add(`${rowId}:${columnId}`)
      }
    }

    this.selectedCells = newSelection
    this.anchorCell = startCellId

    // Increment version to trigger overlay updates
    this.selectionVersion++

    log.info('Full range selection with data context', {
      start: startCellId,
      end: endCellId,
      totalCells: newSelection.size,
      rowRange: `${minRowIndex}-${maxRowIndex}`,
      colRange: `${minColIndex}-${maxColIndex}`,
    })
  }

  /**
   * Select entire row as cells
   */
  @action
  selectRowCells(rowId: string, visibleColumns: any[]): void {
    // CLEAR PREVIOUS SELECTIONS
    this.selectedRows = new Set()
    this.selectedCells = new Set()

    const selectedCells = new Set<string>()
    for (const column of visibleColumns) {
      if (column.id === 'selection') continue
      selectedCells.add(`${rowId}:${column.id}`)
    }

    this.selectedCells = selectedCells
    this.anchorCell = `${rowId}:${visibleColumns[0]?.id}`
    this.lastBulkSelectionTime = Date.now()

    // Increment version to trigger overlay updates
    this.selectionVersion++

    log.info('Row cells selected', {
      rowId,
      cellCount: selectedCells.size,
    })
  }

  /**
   * Select entire column as cells
   */
  @action
  selectColumnCells(columnId: string, processedRows: any[]): void {
    // CLEAR PREVIOUS SELECTIONS
    this.selectedRows = new Set()
    this.selectedCells = new Set()

    const selectedCells = new Set<string>()
    for (const row of processedRows) {
      selectedCells.add(`${row.id}:${columnId}`)
    }

    this.selectedCells = selectedCells
    this.anchorCell = `${processedRows[0]?.id}:${columnId}`
    this.lastBulkSelectionTime = Date.now()

    // Increment version to trigger overlay updates
    this.selectionVersion++

    log.info('Column cells selected', {
      columnId,
      cellCount: selectedCells.size,
    })
  }

  /**
   * Toggle row selection as cells
   */
  @action
  toggleRowCells(rowId: string, visibleColumns: any[]): void {
    const rowCells: string[] = []
    for (const column of visibleColumns) {
      if (column.id === 'selection') continue
      rowCells.push(`${rowId}:${column.id}`)
    }

    const isRowSelected = rowCells.every((cellId) => this.selectedCells.has(cellId))

    if (isRowSelected) {
      // Deselect row - remove only this row's cells from selection
      const newSelection = new Set(this.selectedCells)
      for (const cellId of rowCells) {
        newSelection.delete(cellId)
      }
      this.selectedCells = newSelection
      log.info('Row cells deselected', { rowId })
    } else {
      // Select row - clear all previous selections and select only this row
      this.selectedCells = new Set(rowCells)
      log.info('Row cells selected (previous selection cleared)', { rowId })
    }

    // Increment version to trigger overlay updates
    this.selectionVersion++
  }

  /**
   * Toggle cell selection
   */
  @action
  toggleCellSelection(
    rowId: string,
    columnId: string,
    isCtrlKey: boolean = false,
    isShiftKey: boolean = false,
  ): void {
    const cellId = `${rowId}:${columnId}`
    const cells = new Set(this.selectedCells)

    if (isShiftKey && this.anchorCell) {
      // Shift+click for range selection
      this.selectRange(this.anchorCell, cellId)
      // Note: selectRange already increments selectionVersion
    } else if (isCtrlKey) {
      // Ctrl/Cmd+click for multi-selection toggle
      if (cells.has(cellId)) {
        cells.delete(cellId)
      } else {
        cells.add(cellId)
      }
      this.selectedCells = cells

      // Increment version to trigger overlay updates
      this.selectionVersion++
    } else {
      // Regular click - clear selection and select only this cell
      this.selectedCells = new Set([cellId])
      this.anchorCell = cellId

      // Increment version to trigger overlay updates
      this.selectionVersion++
    }

    log.info('Cell selection toggled', { rowId, columnId, isCtrlKey, isShiftKey })
  }

  /**
   * Get row checkbox states
   */
  getRowCheckboxStates(rows: any[], visibleColumns: any[]): Map<string, boolean> {
    const rowStates = new Map<string, boolean>()

    // Filter out selection column
    const dataColumns = visibleColumns.filter((col) => col.id !== 'selection')

    for (const row of rows) {
      const isRowSelected =
        dataColumns.every((col) => this.selectedCells.has(`${row.id}:${col.id}`)) &&
        dataColumns.length > 0

      rowStates.set(row.id, isRowSelected)
    }

    return rowStates
  }

  // ====================================
  // EDITING ACTIONS
  // ====================================

  /**
   * Start editing a cell
   *
   * Always updates selection to the editing cell.
   */
  @action
  startEdit(cellId: string, initialValue?: any): void {
    // Always update selection to the editing cell
    this.selectedCells = new Set([cellId])
    this.anchorCell = cellId

    this.editingCell = cellId
    this.editValue = initialValue ?? null
    this.isEditing = true
    this.editValidation = null

    log.info('Edit started', { cellId, initialValue })
  }

  /**
   * Update edit value
   */
  @action
  updateEditValue(value: any): void {
    this.editValue = value
    // Clear validation on value change
    this.editValidation = null
  }

  /**
   * Save edit using TanStack DB collection mutation
   *
   * This implements optimistic updates with:
   * - Immediate UI feedback (clear editing state)
   * - Automatic rollback on error
   * - Performance timing metrics
   * - Real-time sync via WebSocket
   */
  @action
  async saveEdit(finalValue?: any): Promise<void> {
    const editingCell = this.editingCell
    const editValue = finalValue !== undefined ? finalValue : this.editValue

    // Prevent saveEdit during cancellation
    if (this.isCancelling) {
      log.warn('saveEdit blocked - edit operation is being cancelled')
      return
    }

    if (!editingCell) {
      log.warn('saveEdit called but no cell is being edited')
      return
    }

    // Parse cell ID
    const cellParts = editingCell.split(':')
    if (cellParts.length !== 2) {
      log.warn('Invalid cell ID format for entity update', {
        editingCell,
        expectedFormat: 'rowId:columnId',
      })
      return
    }

    const rowId = cellParts[0]
    const fieldName = cellParts[1]

    // Check if TanStack DB collection is available
    if (!this.collection) {
      log.error('Cannot save: TanStack DB collection not set', {
        editingCell,
        rowId,
        fieldName,
        hint: 'Call setCollection() before editing',
      })

      this.editValidation = {
        isValid: false,
        message: 'Save failed: Database collection not available',
      }
      return
    }

    // Get current data to check for changes
    const currentData = this.collection.get(String(rowId))
    const currentValue = currentData?.[fieldName]

    // OPTIMIZATION: Skip update if value hasn't changed
    if (currentValue === editValue) {
      log.info('Skipping save - value unchanged', {
        rowId,
        fieldName,
        value: editValue,
      })

      // Clear editing state without saving
      this.editingCell = null
      this.editValue = null
      this.isEditing = false
      this.isCancelling = false
      this.editValidation = null

      return
    }

    // Start performance timing
    const startTime = performance.now()

    // Optimistic update using TanStack DB collection
    // The collection handles the optimistic state update immediately
    const tx = this.collection.update(String(rowId), (draft: any) => {
      draft[fieldName] = editValue
      draft.updatedAt = new Date().toISOString()
    })

    const localDuration = performance.now() - startTime
    log.info('Optimistic edit applied to collection', {
      rowId,
      fieldName,
      editValue,
      localDuration: `${localDuration.toFixed(1)}ms`,
      cellId: editingCell,
      note: 'Table will react automatically via useVibeGridData hook',
    })

    // Clear editing state immediately (optimistic UX)
    // The table will re-render automatically when the collection updates
    this.editingCell = null
    this.editValue = null
    this.isEditing = false
    this.isCancelling = false
    this.editValidation = null

    // Monitor persistence status
    // TanStack DB automatically rolls back on error - we just log it
    tx.isPersisted.promise
      .then(() => {
        const totalDuration = performance.now() - startTime
        log.info('Edit persisted to server', {
          rowId,
          fieldName,
          editValue,
          localDuration: `${localDuration.toFixed(1)}ms`,
          totalDuration: `${totalDuration.toFixed(1)}ms`,
          networkDuration: `${(totalDuration - localDuration).toFixed(1)}ms`,
          note: 'Optimistic update confirmed',
        })
      })
      .catch((error: any) => {
        const errorMessage = error instanceof Error ? error.message : String(error)

        log.error('Edit persistence failed - TanStack DB auto-rollback', {
          rowId,
          fieldName,
          editValue,
          error: errorMessage,
          note: 'Collection automatically rolled back, table will react via hook',
        })

        // TanStack DB automatically rolls back the collection state
        // The table will re-render with the original value via useVibeGridData
        // No manual rollback needed!
      })
  }

  /**
   * Cancel edit
   */
  @action
  cancelEdit(): void {
    const editingCell = this.editingCell

    // ✅ Set flag to block any pending saveEdit calls
    this.isCancelling = true

    this.editingCell = null
    this.editValue = null
    this.isEditing = false
    this.editValidation = null

    log.info('Edit cancelled', { cellId: editingCell })

    // ✅ Clear flag after microtask (allows current event loop to complete)
    queueMicrotask(() => {
      runInAction(() => {
        this.isCancelling = false
      })
    })
  }

  // ====================================
  // HOVER ACTIONS
  // ====================================

  @action
  setHover(cellId: string | null, rowId: string | null = null): void {
    this.hoveredCell = cellId
    this.hoveredRow = rowId
  }

  @action
  clearHover(): void {
    this.hoveredCell = null
    this.hoveredRow = null
  }

  // ====================================
  // DRAG ACTIONS
  // ====================================

  @action
  startDrag(source: DragSource): void {
    this.isDragging = true
    this.dragSource = source
    this.dragTarget = null

    log.info('Drag started', { source })
  }

  @action
  updateDragTarget(target: DragSource): void {
    this.dragTarget = target
  }

  @action
  endDrag(): { source: DragSource | null; target: DragSource | null } {
    const source = this.dragSource
    const target = this.dragTarget

    this.isDragging = false
    this.dragSource = null
    this.dragTarget = null

    log.info('Drag ended', { source, target })

    return { source, target }
  }

  @action
  startDragSelect(cellId: string): void {
    this.isDragSelecting = true
    this.dragSelectStart = cellId
    this.dragSelectCurrent = cellId

    log.info('Drag selection started', { startCell: cellId })
  }

  @action
  updateDragSelect(cellId: string): void {
    this.dragSelectCurrent = cellId
  }

  @action
  endDragSelect(): { start: string | null; end: string | null } {
    const start = this.dragSelectStart
    const current = this.dragSelectCurrent

    this.isDragSelecting = false
    this.dragSelectStart = null
    this.dragSelectCurrent = null

    log.info('Drag selection ended', { start, end: current })

    return { start, end: current }
  }

  /**
   * Alias methods for compatibility
   */
  @action
  startDragSelection(cellId: string): void {
    this.startDragSelect(cellId)
  }

  @action
  updateDragSelection(
    cellId: string,
    dataContext?: { rows: any[]; columns: any[]; columnVisibility: Record<string, boolean> },
  ): void {
    // When dragging, select the range from start to current
    if (this.dragSelectStart && cellId !== this.dragSelectCurrent) {
      this.selectRange(this.dragSelectStart, cellId, dataContext)
      this.updateDragSelect(cellId)
    }
  }

  @action
  endDragSelection(): { start: string | null; end: string | null } {
    return this.endDragSelect()
  }

  // ====================================
  // COLUMN RESIZE ACTIONS
  // ====================================

  @action
  startColumnResize(columnId: string, startX: number, startWidth: number): void {
    // Clear selections when starting column resize
    this.selectedCells = new Set()
    this.editingCell = null
    this.editValue = ''

    // Set column resize state
    this.resizingColumn = columnId
    this.resizeStartX = startX
    this.resizeStartWidth = startWidth
    this.columnResize = {
      isResizing: true,
      columnId,
      startWidth,
      newWidth: startWidth,
    }

    // Increment version to trigger overlay updates
    this.columnResizeVersion++

    log.info('Column resize started, selections cleared', { columnId, startX, startWidth })
  }

  @action
  updateColumnResize(currentX: number): { columnId: string; newWidth: number } | null {
    if (!this.resizingColumn) return null

    const deltaX = currentX - this.resizeStartX
    const newWidth = Math.max(50, this.resizeStartWidth + deltaX)

    if (this.columnResize) {
      log.info('Setting columnResize with new width', {
        resizingColumn: this.resizingColumn,
        newWidth,
        previousWidth: this.columnResize.newWidth,
      })

      this.columnResize = {
        ...this.columnResize,
        newWidth,
      }

      // Increment version to trigger overlay updates
      this.columnResizeVersion++
    }

    return { columnId: this.resizingColumn, newWidth }
  }

  @action
  endColumnResize(): { columnId: string | null; newWidth: number | undefined } {
    const resizingColumn = this.resizingColumn
    const newWidth = this.columnResize?.newWidth

    this.resizingColumn = null
    this.resizeStartX = 0
    this.resizeStartWidth = 0
    this.columnResize = null

    // Track resize end time to prevent sort trigger
    this.lastResizeEndTime = Date.now()

    // Increment version to trigger overlay updates
    this.columnResizeVersion++

    log.info('Column resize ended', { columnId: resizingColumn, newWidth })

    return { columnId: resizingColumn, newWidth }
  }

  // ====================================
  // MENU ACTIONS
  // ====================================

  @action
  openHeaderMenu(
    columnId: string,
    position: { x: number; y: number },
    menuType: 'filter' | 'sort' | 'settings',
  ): void {
    // Close other menus first
    this.contextMenuState.isOpen = false
    this.columnVisibilityMenuState.isOpen = false
    this.groupConfigMenuState.isOpen = false

    // Open header menu
    this.headerMenuState = {
      openMenu: columnId,
      position,
      menuType,
    }

    log.info('Header menu opened', { columnId, position, menuType })
  }

  @action
  closeHeaderMenu(): void {
    this.headerMenuState = {
      openMenu: null,
      position: { x: 0, y: 0 },
      menuType: null,
    }

    log.info('Header menu closed')
  }

  @action
  openContextMenu(
    position: { x: number; y: number },
    context: 'cell' | 'row' | 'column' | 'header',
    targetId: string,
  ): void {
    // Close other menus first
    this.headerMenuState.openMenu = null
    this.columnVisibilityMenuState.isOpen = false
    this.groupConfigMenuState.isOpen = false

    // Open context menu
    this.contextMenuState = {
      isOpen: true,
      position,
      context,
      targetId,
    }

    log.info('Context menu opened', { position, context, targetId })
  }

  @action
  closeContextMenu(): void {
    this.contextMenuState = {
      isOpen: false,
      position: { x: 0, y: 0 },
      context: null,
      targetId: null,
    }

    log.info('Context menu closed')
  }

  @action
  openColumnVisibilityMenu(): void {
    // Close other menus first
    this.headerMenuState.openMenu = null
    this.contextMenuState.isOpen = false
    this.groupConfigMenuState.isOpen = false

    // Open column visibility menu
    this.columnVisibilityMenuState = {
      isOpen: true,
      searchValue: '',
    }

    log.info('Column visibility menu opened')
  }

  @action
  closeColumnVisibilityMenu(): void {
    this.columnVisibilityMenuState = {
      isOpen: false,
      searchValue: '',
    }

    log.info('Column visibility menu closed')
  }

  @action
  setColumnVisibilitySearch(searchValue: string): void {
    this.columnVisibilityMenuState = {
      ...this.columnVisibilityMenuState,
      searchValue,
    }
  }

  @action
  openGroupConfigMenu(): void {
    // Close other menus first
    this.headerMenuState.openMenu = null
    this.contextMenuState.isOpen = false
    this.columnVisibilityMenuState.isOpen = false

    // Open group config menu
    this.groupConfigMenuState = {
      isOpen: true,
    }

    log.info('Group config menu opened')
  }

  @action
  closeGroupConfigMenu(): void {
    this.groupConfigMenuState = {
      isOpen: false,
    }

    log.info('Group config menu closed')
  }

  // ====================================
  // CLIPBOARD ACTIONS
  // ====================================

  @action
  setClipboard(clipboardData: {
    data: any[][]
    operation: 'copy' | 'cut'
    richData?: import('../types/clipboard-types').VibeGridClipboardData
  }): void {
    this.clipboard = {
      data: clipboardData.data,
      operation: clipboardData.operation,
      copiedCells: new Set(this.selectedCells),
      richData: clipboardData.richData,
    }

    // Increment version to trigger overlay updates
    this.clipboardVersion++

    log.info('Clipboard set', {
      operation: clipboardData.operation,
      cellCount: this.selectedCells.size,
      hasRichData: !!clipboardData.richData,
    })
  }

  @action
  clearClipboard(): void {
    this.clipboard = null

    // Increment version to trigger overlay updates
    this.clipboardVersion++

    log.info('Clipboard cleared')
  }

  // ====================================
  // VISUAL UPDATE METHODS
  // ====================================

  /**
   * Update visual selection state for cells in the DOM
   */
  updateCellSelectionVisuals(
    getCellElement: (rowId: string, columnId: string) => HTMLElement | null,
  ): void {
    // Find all cells with selection class and remove it
    document.querySelectorAll('.vibegridx-selected').forEach((el) => {
      el.classList.remove('vibegridx-selected')
    })

    // Add selection class to currently selected cells
    this.selectedCells.forEach((cellKey) => {
      const [rowId, columnId] = cellKey.split(':')
      const element = getCellElement(rowId, columnId)
      element?.classList.add('vibegridx-selected')
    })
  }

  /**
   * Update visual selection state for rows in the DOM
   */
  updateRowSelectionVisuals(
    forEachRowElement: (callback: (element: HTMLElement, rowId: string) => void) => void,
  ): void {
    // Update all row elements
    forEachRowElement((element, rowId) => {
      if (this.selectedRows.has(rowId)) {
        element.classList.add('vibegridx-row-selected')
      } else {
        element.classList.remove('vibegridx-row-selected')
      }
    })
  }

  /**
   * Update visual editing state for a cell in the DOM
   */
  updateEditingCellVisual(
    getCellElement: (rowId: string, columnId: string) => HTMLElement | null,
    oldCellId?: string | null,
    newCellId?: string | null,
  ): void {
    // Remove editing state from old cell
    if (oldCellId) {
      const [rowId, columnId] = oldCellId.split(':')
      const oldElement = getCellElement(rowId, columnId)
      if (oldElement) {
        oldElement.classList.remove('vibegridx-editing')
        oldElement.contentEditable = 'false'
      }
    }

    // Add editing state to new cell
    if (newCellId) {
      const [rowId, columnId] = newCellId.split(':')
      const newElement = getCellElement(rowId, columnId)
      if (newElement) {
        newElement.classList.add('vibegridx-editing')
        newElement.contentEditable = 'true'
        newElement.focus({ preventScroll: true })
      }
    }
  }
}
