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
 * - Clipboard operations
 * - Row expansion
 *
 * Menu states extracted to MenuStateStore (GH#2034 P1)
 * Filter builder state extracted to FilterBuilderStore (GH#2034 P1)
 *
 * This is the most complex interaction layer with sophisticated selection logic.
 */

import { action, computed, makeObservable, observable } from 'mobx'
import type { Collection } from '@tanstack/db'
import type { IStore } from '@/app/stores/types'
import { DisposerManager } from '@/app/stores/utils/disposer'
import { getLogger } from '@/shared/lib/logging'
import type { TableCoreStore } from './TableCoreStore'
import type { VisualStateStore } from './VisualStateStore'

const logger = getLogger(['vibegrid', 'stores', 'InteractionStore'])

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

export interface ColumnDragState {
  isDragging: boolean
  draggedColumnId: string | null
  targetColumnId: string | null
  startIndex: number
  currentIndex: number
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
 * - Keyboard navigation and focus
 * - Hover state tracking
 * - Drag and drop operations
 * - Column resizing
 * - Clipboard operations
 * - Row expansion
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
  // EDITING STATE - MOVED TO EditingStore
  // ====================================
  // All editing state moved to src/systems/vibegrid/stores/EditingStore.ts
  // Use editingStore.isEditing, editingStore.editingCell, etc. instead

  // ====================================
  // FOCUS STATE
  // ====================================

  @observable focusedCell: string | null = null

  // ====================================
  // LAYOUT STATE (for PropertySheet)
  // ====================================

  @observable activeLayout: 'grid' | 'property-sheet' = 'grid'
  @observable focusedFieldId: string | null = null

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
  @observable columnDrag: ColumnDragState | null = null

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
  // CLIPBOARD STATE
  // ====================================

  @observable clipboard: ClipboardState | null = null

  // Version tracking for clipboard state changes
  @observable clipboardVersion: number = 0

  // ====================================
  // ROW EXPANSION STATE (GH#1240)
  // ====================================

  /** Set of currently expanded row IDs */
  @observable expandedRowIds: Set<string> = new Set()

  /** Map of expanded row states (loading/data/error) */
  @observable expandedRowStates: Map<
    string,
    {
      data: unknown[] | null
      isLoading: boolean
      error: Error | null
      loadedAt: number | null
    }
  > = new Map()

  /** Version tracking for expansion state changes */
  @observable expansionVersion: number = 0

  /** Whether row expansion is enabled */
  @observable rowExpansionEnabled: boolean = false

  /** Whether multiple rows can be expanded simultaneously */
  @observable allowMultipleExpansion: boolean = true

  // ====================================
  // DEPENDENCIES (Injected)
  // ====================================

  // biome-ignore lint/correctness/noUnusedPrivateClassMembers: Assigned in constructor
  private tableCore$: unknown = null // Legacy tableCore reference
  private tableCoreStore: TableCoreStore | null = null
  private visualStateStore: VisualStateStore | null = null
  // biome-ignore lint/correctness/noUnusedPrivateClassMembers: Assigned via setCollection()
  private collection: Collection<any, any, any, any, any> | null = null // TanStack DB collection for entity mutations
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
  setCollection(collection: Collection<any, any, any, any, any>): void {
    this.collection = collection
    logger.info('TanStack DB collection set', {
      hasCollection: !!collection,
    })
  }

  /**
   * Initialize store
   */
  @action
  async init(): Promise<void> {
    logger.info('Initializing InteractionStore')
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    this.disposers.dispose()
    logger.info('InteractionStore disposed')
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
    // Editing state moved to EditingStore
    this.focusedCell = null
    this.activeLayout = 'grid'
    this.focusedFieldId = null
    this.hoveredCell = null
    this.hoveredRow = null
    this.isDragging = false
    this.dragSource = null
    this.dragTarget = null
    this.columnDrag = null
    this.isDragSelecting = false
    this.dragSelectStart = null
    this.dragSelectCurrent = null
    this.resizingColumn = null
    this.resizeStartX = 0
    this.resizeStartWidth = 0
    this.columnResize = null
    this.clipboard = null
    // Reset expansion state (GH#1240)
    this.expandedRowIds = new Set()
    this.expandedRowStates = new Map()
    this.rowExpansionEnabled = false
    this.allowMultipleExpansion = true
    logger.info('InteractionStore reset to defaults')
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
      logger.debug('Single cell selection (cleared others)', { cellId })
    } else {
      // MULTI SELECTION: Toggle cell in existing selection
      const currentSelected = new Set(this.selectedCells)

      if (currentSelected.has(cellId)) {
        currentSelected.delete(cellId)
        logger.debug('Removed cell from multi-selection', { cellId })
      } else {
        currentSelected.add(cellId)
        logger.debug('Added cell to multi-selection', { cellId })
      }

      this.selectedCells = currentSelected
      this.anchorCell = cellId
    }

    // Increment version to trigger overlay updates
    this.selectionVersion++
    logger.debug('📊 Selection version incremented', {
      newVersion: this.selectionVersion,
      cellId,
      isMulti,
    })

    logger.info('Cell selected', { cellId, isMulti, selectionCount: this.selectedCells.size })
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
  handleCellClick(cellId: string, _isEditable: boolean, ctrlKey: boolean, shiftKey: boolean): void {
    // Assert stores are initialized
    assertStorePresent(this.tableCoreStore, 'TableCoreStore')
    assertStorePresent(this.visualStateStore, 'VisualStateStore')

    // CONFLICT PREVENTION: Skip if row/column selection just happened
    const now = Date.now()
    if (now - this.lastBulkSelectionTime < 50) {
      logger.info('Skipping cell click - recent bulk selection detected', {
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
      logger.info('Shift+click range selection', {
        from: this.anchorCell,
        to: cellId,
        hasDataContext: !!dataContext,
      })
    } else if (ctrlKey) {
      // CTRL+CLICK: Multi-select (toggle cell in selection)
      this.selectCell(cellId, true)
      logger.info('Ctrl+click multi-select', { cellId })
    } else {
      // NORMAL CLICK: Single selection
      this.selectCell(cellId, false)
      logger.info('Normal click single selection', { cellId })
    }

    // ✅ REFACTORED: Auto-edit removed
    // Editing is now handled by CellActionRouter based on interaction policies
    // This method only handles selection, not editing

    logger.info('Cell click handled', {
      cellId,
      ctrlKey,
      shiftKey,
      selectedCells: this.selectedCells.size,
    })
  }

  /**
   * Get data context for range selection (MobX stores)
   */
  private getDataContext(): { rows: any[]; columns: any[]; columnVisibility: Record<string, boolean> } | undefined {
    // Assert stores are initialized before accessing
    assertStorePresent(this.tableCoreStore, 'TableCoreStore')
    assertStorePresent(this.visualStateStore, 'VisualStateStore')

    try {
      const rows = this.tableCoreStore.processedRows || []
      const columns = this.visualStateStore.columns || []
      const columnVisibility = this.visualStateStore.columnVisibility || {}

      return { rows, columns, columnVisibility }
    } catch (error) {
      logger.error('Error getting data context', { error })
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
      logger.debug('Single row selection (cleared others)', { rowId })
    } else {
      // MULTI SELECTION: Toggle row in existing selection
      const currentSelected = new Set(this.selectedRows)

      if (currentSelected.has(rowId)) {
        currentSelected.delete(rowId)
        logger.debug('Removed row from multi-selection', { rowId })
      } else {
        currentSelected.add(rowId)
        logger.debug('Added row to multi-selection', { rowId })
      }

      this.selectedRows = currentSelected
    }

    // Increment version to trigger overlay updates
    this.selectionVersion++

    logger.info('Row selected', { rowId, isMulti, selectionCount: this.selectedRows.size })
  }

  /**
   * Select all cells
   */
  @action
  selectAll(dataContext?: { rows: any[]; columns: any[]; columnVisibility: Record<string, boolean> }): void {
    if (!dataContext) {
      logger.warn('selectAll called without data context - ignoring')
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

    logger.info('All cells selected with data context', {
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

    logger.info('Selection and focus cleared')
  }

  /**
   * Handle outside click
   *
   * Note: Editing outside click handling moved to EditingStore.handleOutsideClick()
   */
  @action
  handleOutsideClick(): void {
    logger.info('Outside click - clearing selection')
    this.clearSelection()
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

    logger.info('Focused cell changed', { cellId })
  }

  /**
   * Set active layout mode
   */
  @action
  setLayout(layout: 'grid' | 'property-sheet'): void {
    this.activeLayout = layout
    logger.info('Layout changed', { layout })
  }

  /**
   * Focus a field (for PropertySheet navigation)
   */
  @action
  focusField(fieldId: string | null): void {
    this.focusedFieldId = fieldId
    logger.info('Field focused', { fieldId })
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

      logger.info('Simple range selection (no data context)', {
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
      logger.warn('Range selection failed - could not find indices', {
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

      logger.info('Fallback range selection (index lookup failed)', {
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
          logger.info('Selection constrained to group boundary', {
            originalMaxRow: Math.max(startRowIndex, endRowIndex),
            constrainedMaxRow: maxRowIndex,
            groupId: startGroupId,
          })
          break
        }
      }
    }

    // Select all cells in the range, skipping non-data rows (group headers, expanded content)
    const newSelection = new Set<string>()
    for (let rowIndex = minRowIndex; rowIndex <= maxRowIndex; rowIndex++) {
      const row = rows[rowIndex]
      if (row.type && row.type !== 'data') continue
      for (let colIndex = minColIndex; colIndex <= maxColIndex; colIndex++) {
        const rowId = row.id
        const columnId = visibleColumns[colIndex].id
        newSelection.add(`${rowId}:${columnId}`)
      }
    }

    this.selectedCells = newSelection
    this.anchorCell = startCellId

    // Increment version to trigger overlay updates
    this.selectionVersion++

    logger.info('Full range selection with data context', {
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

    logger.info('Row cells selected', {
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

    logger.info('Column cells selected', {
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
      logger.info('Row cells deselected', { rowId })
    } else {
      // Select row - replace existing selection to avoid mixing partial-column
      // drag selections with full-row checkbox selections (causes overlay expansion)
      const newSelection = new Set<string>()
      for (const cellId of rowCells) {
        newSelection.add(cellId)
      }
      this.selectedCells = newSelection
      logger.info('Row cells selected (replaced selection)', { rowId })
    }

    // Increment version to trigger overlay updates
    this.selectionVersion++
  }

  /**
   * Toggle cell selection
   */
  @action
  toggleCellSelection(rowId: string, columnId: string, isCtrlKey: boolean = false, isShiftKey: boolean = false): void {
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

    logger.info('Cell selection toggled', { rowId, columnId, isCtrlKey, isShiftKey })
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
        dataColumns.every((col) => this.selectedCells.has(`${row.id}:${col.id}`)) && dataColumns.length > 0

      rowStates.set(row.id, isRowSelected)
    }

    return rowStates
  }

  // ====================================
  // EDITING ACTIONS - MOVED TO EditingStore
  // ====================================
  // All editing actions have been moved to src/systems/vibegrid/stores/EditingStore.ts
  // Use editingStore.startEdit(), editingStore.commitEdit(), etc. instead
  //
  // This removes ~190 lines of duplicate state management
  // Fixes Issues #3, #6, #7 from planning/active/keyboard-editing-vibegrid-refactor/

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

    logger.info('Drag started', { source })
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

    logger.info('Drag ended', { source, target })

    return { source, target }
  }

  @action
  startColumnDrag(columnId: string, startIndex: number): void {
    this.isDragging = true
    this.columnDrag = {
      isDragging: true,
      draggedColumnId: columnId,
      targetColumnId: null,
      startIndex,
      currentIndex: startIndex,
    }

    logger.info('Column drag started', { columnId, startIndex })
  }

  @action
  updateColumnDragTarget(targetColumnId: string, targetIndex: number): void {
    if (!this.columnDrag) {
      return
    }

    this.columnDrag = {
      ...this.columnDrag,
      targetColumnId,
      currentIndex: targetIndex,
    }
  }

  @action
  endColumnDrag(): ColumnDragState | null {
    const state = this.columnDrag
    this.isDragging = false
    this.columnDrag = null

    logger.info('Column drag ended', { state })

    return state
  }

  @action
  startDragSelect(cellId: string): void {
    this.isDragSelecting = true
    this.dragSelectStart = cellId
    this.dragSelectCurrent = cellId

    logger.info('Drag selection started', { startCell: cellId })
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

    logger.info('Drag selection ended', { start, end: current })

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
    // Editing state moved to EditingStore (edit session will be cancelled separately if needed)

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

    logger.info('Column resize started, selections cleared', { columnId, startX, startWidth })
  }

  @action
  updateColumnResize(currentX: number): { columnId: string; newWidth: number } | null {
    if (!this.resizingColumn) return null

    const deltaX = currentX - this.resizeStartX
    const newWidth = Math.max(50, this.resizeStartWidth + deltaX)

    if (this.columnResize) {
      logger.info('Setting columnResize with new width', {
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

    logger.info('Column resize ended', { columnId: resizingColumn, newWidth })

    return { columnId: resizingColumn, newWidth }
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

    logger.info('Clipboard set', {
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

    logger.info('Clipboard cleared')
  }

  // ====================================
  // VISUAL UPDATE METHODS
  // ====================================

  /**
   * Update visual selection state for cells in the DOM
   */
  updateCellSelectionVisuals(getCellElement: (rowId: string, columnId: string) => HTMLElement | null): void {
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

  // ====================================
  // ROW EXPANSION ACTIONS (GH#1240)
  // ====================================

  /**
   * Enable row expansion with configuration
   */
  @action
  enableRowExpansion(allowMultiple: boolean = true): void {
    this.rowExpansionEnabled = true
    this.allowMultipleExpansion = allowMultiple
    logger.info('Row expansion enabled', { allowMultiple })
  }

  /**
   * Disable row expansion
   */
  @action
  disableRowExpansion(): void {
    this.rowExpansionEnabled = false
    this.expandedRowIds = new Set()
    this.expandedRowStates = new Map()
    this.expansionVersion++
    logger.info('Row expansion disabled')
  }

  /**
   * Expand a single row
   */
  @action
  expandRow(rowId: string): void {
    if (!this.rowExpansionEnabled) return

    // If single expansion mode, collapse others first
    if (!this.allowMultipleExpansion && this.expandedRowIds.size > 0) {
      this.expandedRowIds = new Set()
    }

    const newExpanded = new Set(this.expandedRowIds)
    newExpanded.add(rowId)
    this.expandedRowIds = newExpanded

    // GH#1240: Don't initialize state here - let the expansion observer handle loading
    // The observer in SimplePassiveRenderer will set isLoading and trigger the actual load

    this.expansionVersion++
    logger.info('Row expanded', { rowId, totalExpanded: newExpanded.size })
  }

  /**
   * Collapse a single row
   */
  @action
  collapseRow(rowId: string): void {
    const newExpanded = new Set(this.expandedRowIds)
    newExpanded.delete(rowId)
    this.expandedRowIds = newExpanded

    // Keep the state in cache (don't delete from expandedRowStates)
    // This allows for quick re-expansion without refetching

    this.expansionVersion++
    logger.info('Row collapsed', { rowId, totalExpanded: newExpanded.size })
  }

  /**
   * Toggle expansion state of a row
   */
  @action
  toggleRowExpansion(rowId: string): void {
    if (this.expandedRowIds.has(rowId)) {
      this.collapseRow(rowId)
    } else {
      this.expandRow(rowId)
    }
  }

  /**
   * Expand all rows (requires row IDs to be provided)
   */
  @action
  expandAllRows(rowIds: string[]): void {
    if (!this.rowExpansionEnabled) return

    const newExpanded = new Set(rowIds)
    this.expandedRowIds = newExpanded

    // GH#1240: Don't initialize state here - let the expansion observer handle loading

    this.expansionVersion++
    logger.info('All rows expanded', { count: rowIds.length })
  }

  /**
   * Collapse all rows
   */
  @action
  collapseAllRows(): void {
    this.expandedRowIds = new Set()
    this.expansionVersion++
    logger.info('All rows collapsed')
  }

  /**
   * Check if a row is expanded
   */
  isRowExpanded(rowId: string): boolean {
    return this.expandedRowIds.has(rowId)
  }

  /**
   * Get expanded data for a row (from cache)
   */
  getExpandedData(rowId: string): unknown[] | null {
    return this.expandedRowStates.get(rowId)?.data ?? null
  }

  /**
   * Check if expanded data is loading for a row
   */
  isExpandedDataLoading(rowId: string): boolean {
    return this.expandedRowStates.get(rowId)?.isLoading ?? false
  }

  /**
   * Set expanded data for a row (called after async load)
   */
  @action
  setExpandedData(rowId: string, data: unknown[] | null, error: Error | null = null): void {
    this.expandedRowStates.set(rowId, {
      data,
      isLoading: false,
      error,
      loadedAt: Date.now(),
    })
    this.expansionVersion++
    logger.info('Expanded data set', {
      rowId,
      hasData: !!data,
      itemCount: data?.length ?? 0,
      hasError: !!error,
    })
  }

  /**
   * Set loading state for expanded data
   */
  @action
  setExpandedDataLoading(rowId: string): void {
    const current = this.expandedRowStates.get(rowId)
    this.expandedRowStates.set(rowId, {
      data: current?.data ?? null,
      isLoading: true,
      error: null,
      loadedAt: current?.loadedAt ?? null,
    })
    this.expansionVersion++
  }

  /**
   * Clear expanded data cache for a row
   */
  @action
  clearExpandedDataCache(rowId: string): void {
    this.expandedRowStates.delete(rowId)
    this.expansionVersion++
    logger.info('Expanded data cache cleared', { rowId })
  }

  /**
   * Clear all expanded data cache
   */
  @action
  clearAllExpandedDataCache(): void {
    this.expandedRowStates = new Map()
    this.expansionVersion++
    logger.info('All expanded data cache cleared')
  }

  /**
   * Computed: number of expanded rows
   */
  @computed get expandedRowCount(): number {
    return this.expandedRowIds.size
  }

  /**
   * Computed: whether any rows are expanded
   */
  @computed get hasExpandedRows(): boolean {
    return this.expandedRowIds.size > 0
  }

  /**
   * Readable state for agent context
   * JSON-serializable snapshot of interaction state
   */
  @computed get readableState(): InteractionReadableState {
    return {
      selectedRowIds: Array.from(this.selectedRows ?? []),
      selectedCellIds: Array.from(this.selectedCells ?? []),
      focusedCell: this.focusedCell
        ? {
            rowId: this.focusedCell.split(':')[0],
            columnId: this.focusedCell.split(':')[1],
          }
        : null,
      isEditing: false, // Editing state moved to EditingStore
    }
  }
}

/**
 * Readable state interface for InteractionStore
 */
export interface InteractionReadableState {
  selectedRowIds: string[]
  selectedCellIds: string[]
  focusedCell: { rowId: string; columnId: string } | null
  isEditing: boolean
}
