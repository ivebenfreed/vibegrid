/**
 * BodyRenderer - Consolidated cell and row rendering for VibeGrid
 *
 * Combines RowRenderer, CellRenderer, and CellFormatter into a single module
 * for better maintainability and reduced file fragmentation.
 *
 * Phase 2.1 consolidation from:
 * - managers/RowRenderer.ts (388 lines)
 * - managers/CellRenderer.ts (327 lines)
 * - modules/CellFormatter.ts (245 lines)
 */

import { reaction } from 'mobx'
import { getLogger } from '@/shared/lib/logging'
import { GRID_DIMENSIONS } from '../../constants/grid-dimensions'
import type { HierarchyStore } from '../../stores/HierarchyStore'
import type { InteractionStore } from '../../stores/InteractionStore'
import type { TableCoreStore } from '../../stores/TableCoreStore'
import { DragDropManager } from '../../utils/drag-drop-handlers'
import type { SlotRegistry, CellRendererContext } from '../../slots/SlotRegistry'
import type { DOMElementFactory } from '../factories/DOMElementFactory'
import type { KeyboardNavigationController } from '../modules/KeyboardNavigationController'
import type { SelectionController } from '../modules/SelectionController'

const fileLog = getLogger(['custom', 'vibegrid', 'renderers', 'components', 'BodyRenderer.ts'])

const ROW_HEIGHT = GRID_DIMENSIONS.ROW_HEIGHT

// ====================================
// INTERFACES
// ====================================

export interface BodyRendererOptions {
  // MobX stores (new names)
  tableCoreStore: TableCoreStore
  interactionStore: InteractionStore
  visualStateStore: import('../../stores/VisualStateStore').VisualStateStore
  hierarchyStore?: HierarchyStore

  domFactory: DOMElementFactory
  selectionController?: SelectionController
  keyboardNavController?: KeyboardNavigationController
  enableSelectionColumn?: boolean
  container: HTMLElement

  // DOM utility functions
  createElement: (tag: string, className?: string) => HTMLElement

  // Cell creation callbacks
  onEntityUpdate?: (rowId: string, updates: Record<string, any>) => Promise<void> | void

  // SlotRegistry for cell rendering
  slotRegistry?: SlotRegistry
}

// ====================================
// BODY RENDERER CLASS
// ====================================

export class BodyRenderer {
  private tableCoreStore: TableCoreStore
  private interactionStore: InteractionStore
  private visualStateStore: import('../../stores/VisualStateStore').VisualStateStore
  private hierarchyStore?: HierarchyStore
  private domFactory: DOMElementFactory
  private selectionController?: SelectionController
  private keyboardNavController?: KeyboardNavigationController
  private enableSelectionColumn: boolean
  private container: HTMLElement
  private createElement: (tag: string, className?: string) => HTMLElement
  private onEntityUpdate?: (rowId: string, updates: Record<string, any>) => Promise<void> | void

  // Row state
  private activeRows: Map<string, HTMLElement> = new Map()
  private dragDropManager?: DragDropManager
  private isGroupedMode: boolean = false

  // Store context for potential drag selection
  // biome-ignore lint/correctness/noUnusedPrivateClassMembers: used in cell click and drag handlers
  private lastClickedCell: { cellId: string; row: any; column: any } | null = null

  // Observer cleanup
  private selectionObserverDisposer?: () => void

  // Row hover handling (JS-driven to avoid CSS :hover pitfalls with position:absolute cells)
  private rowHoverHandlers?: { over: EventListener; out: EventListener }

  // Cell rendering tracking for debugging invisible cells
  private cellRenderingStats = {
    rowsRequested: 0,
    rowsCreated: 0,
    cellsRequested: 0,
    cellsCreated: 0,
    lastRenderTime: 0,
    renderErrors: [] as string[],
  }

  // SlotRegistry for cell rendering
  private slotRegistry: SlotRegistry | null = null

  constructor(options: BodyRendererOptions) {
    this.tableCoreStore = options.tableCoreStore
    this.interactionStore = options.interactionStore
    this.visualStateStore = options.visualStateStore
    this.hierarchyStore = options.hierarchyStore
    this.domFactory = options.domFactory
    this.selectionController = options.selectionController
    this.keyboardNavController = options.keyboardNavController
    this.enableSelectionColumn = options.enableSelectionColumn ?? false
    this.container = options.container
    this.createElement = options.createElement
    this.onEntityUpdate = options.onEntityUpdate
    this.slotRegistry = options.slotRegistry || null

    // Initialize drag and drop manager with container
    this.initializeDragDrop()

    // Setup observer for selection changes to update checkboxes
    this.setupSelectionObserver()

    // Setup JS-driven row hover for selection column number↔checkbox swap
    if (this.enableSelectionColumn) {
      this.setupRowHoverHandling()
    }

    // Check if modular cell system is already available globally (from init manager)
    fileLog.info('🏗️ BodyRenderer initialized') // Keep: lifecycle
  }

  /**
   * Setup observer to watch selection changes and update checkboxes
   */
  private setupSelectionObserver(): void {
    // Use MobX reaction to observe selectedCells changes
    this.selectionObserverDisposer = reaction(
      () => this.interactionStore.selectedCells,
      () => {
        // Update all row checkboxes when selection changes
        this.updateAllRowCheckboxes()
        // GH#1437 P4: Cell selection classes now handled by delta reaction in SimplePassiveRenderer
        // Only update row checkboxes here
        fileLog.debug('📦 Selection states updated due to selection change')
      },
    )
  }

  /**
   * Cleanup observers and resources
   */
  destroy(): void {
    if (this.selectionObserverDisposer) {
      this.selectionObserverDisposer()
      this.selectionObserverDisposer = undefined
    }

    if (this.rowHoverHandlers) {
      this.container.removeEventListener('mouseover', this.rowHoverHandlers.over)
      this.container.removeEventListener('mouseout', this.rowHoverHandlers.out)
      this.rowHoverHandlers = undefined
    }

    // Clear active rows
    this.activeRows.clear()

    fileLog.info('🧹 BodyRenderer destroyed') // Keep: lifecycle
  }

  /**
   * Setup JS-driven row hover handling for the number↔checkbox swap.
   * CSS :hover on position:absolute rows is unreliable; event delegation is robust.
   */
  private setupRowHoverHandling(): void {
    const over = (e: Event) => {
      const target = e.target as HTMLElement
      // Only trigger when hovering the row header cell (selection column)
      if (!target.closest('.vibegridx-row-header-cell')) return
      const row = target.closest('.vibegridx-row') as HTMLElement | null
      if (row) row.classList.add('vibegridx-row-hovered')
    }
    const out = (e: Event) => {
      const target = e.target as HTMLElement
      const row = target.closest('.vibegridx-row') as HTMLElement | null
      if (row) {
        const related = (e as MouseEvent).relatedTarget as HTMLElement | null
        // Remove hover class when leaving the row header cell
        if (!row.querySelector('.vibegridx-row-header-cell')?.contains(related)) {
          row.classList.remove('vibegridx-row-hovered')
        }
      }
    }
    this.container.addEventListener('mouseover', over)
    this.container.addEventListener('mouseout', out)
    this.rowHoverHandlers = { over: over as EventListener, out: out as EventListener }
  }

  // ====================================
  // ROW RENDERING METHODS
  // ====================================

  /**
   * Create a complete row element with header and cells
   */
  createRowElement(
    row: any,
    rowIndex: number,
    columns: any[],
    _columnVisibility: Record<string, boolean>,
    startX: number = GRID_DIMENSIONS.CONTENT_OFFSET_X, // Use constant from centralized dimensions
    // PERF: Pre-computed values to avoid per-row recalculation
    precomputed?: {
      visibleColumns: any[]
      columnLayouts: any[]
      totalWidth: number
    },
    _useShellCells: boolean = false, // deprecated — always creates full rows now
  ): HTMLElement {
    // Track row rendering for debugging invisible cells
    this.cellRenderingStats.rowsRequested++
    this.cellRenderingStats.lastRenderTime = Date.now()

    // GH#1240: Handle expanded-content rows specially
    if (row.type === 'expanded-content') {
      const parentRow = this.tableCoreStore.processedRows.find((r: any) => r.id === row.parentRowId)
      return this.createExpandedContentRowElement(row, rowIndex, parentRow)
    }

    // PERF: Debug logging removed from hot path - object creation was expensive
    // Enable via: __VIBEGRID_DEBUG__.enable() for render timeline instead

    // PERF: updateGroupedModeStatus() is called once per render cycle, not per row
    // It was previously called here but moved to renderer initialization for performance
    const rowElement = this.createElement('div', 'vibegridx-row')
    rowElement.dataset.rowId = row.id

    // ARIA: Add row semantics (rowindex is 1-based, +2 because row 1 is header)
    rowElement.setAttribute('role', 'row')
    rowElement.setAttribute('aria-rowindex', String(rowIndex + 2))

    // Support custom row class names from row data (GH#1200)
    if (row._rowClassName) {
      rowElement.classList.add(row._rowClassName)
      rowElement.dataset.rowClassName = row._rowClassName
    }

    // Add group ID for data rows in grouped mode (needed for drag and drop)
    if (row.type === 'data' && row.groupId) {
      rowElement.setAttribute('data-group-id', row.groupId)
    }

    // startX now comes from visual state which already includes drag + checkbox columns (70px total)
    const _adjustedStartX = startX

    // Add alternating row class for CSS styling (supports dark mode)
    // Use dataIndex (position among data rows only) so expanded-content rows
    // don't disrupt the zebra stripe pattern
    const zebraIndex = row.dataIndex ?? rowIndex
    if (zebraIndex % 2 !== 0) {
      rowElement.classList.add('vibegridx-row-alt')
    }

    // PERF: Use transform for GPU-accelerated positioning (doesn't trigger layout)
    // GH#1240: Use actual offset for variable row heights (expanded rows have different heights)
    const rowOffset = this.tableCoreStore.rowOffsets[rowIndex] ?? rowIndex * ROW_HEIGHT
    rowElement.style.transform = `translateY(${rowOffset}px)`

    // Add drag column (always present for consistent layout)
    // PERF: CSS handles all static styles - only set position if needed
    const dragColumn = this.createDragColumn(row)
    rowElement.appendChild(dragColumn)

    // Add row header (checkbox or row number)
    // PERF: CSS handles all static styles
    const rowHeader = this.createRowHeader(row, rowIndex)
    rowElement.appendChild(rowHeader)

    // Add hierarchy toggle column for hierarchical data rows
    // Renders expand/collapse icons and provides indentation via level
    if (this.hierarchyStore?.isHierarchyActive && row.type === 'data') {
      const hierarchyToggle = this.createHierarchyToggle(row)
      rowElement.appendChild(hierarchyToggle)
    }

    // PERF: Use pre-computed values if available, otherwise fall back to computing
    // This avoids repeated MobX computed property reads and array filtering for each row
    const columnLayouts = precomputed?.columnLayouts ?? this.visualStateStore.visibleColumns
    const visibleColumnsOnly =
      precomputed?.visibleColumns ?? columns.filter((col) => columnLayouts.some((l) => l.id === col.id))

    // PERF: Create layout lookup map ONCE per row instead of O(n) find() per column
    // This changes from O(columns * layouts) to O(columns + layouts)
    const layoutMap = new Map<string, any>()
    for (const layout of columnLayouts) {
      layoutMap.set(layout.id, layout)
    }

    // PERFORMANCE: Progressive column rendering for faster initial load
    // Render essential columns first (first 6), then defer remaining columns
    const essentialColumnCount = Math.min(6, visibleColumnsOnly.length)
    const essentialColumns = visibleColumnsOnly.slice(0, essentialColumnCount)
    const deferredColumns = visibleColumnsOnly.slice(essentialColumnCount)

    // Render essential columns immediately
    essentialColumns.forEach((column, colIndex) => {
      this.cellRenderingStats.cellsRequested++

      // PERF: O(1) lookup instead of O(n) find()
      const layout = layoutMap.get(column.id)
      if (!layout) {
        // This shouldn't happen now since we filtered, but keep the check for safety
        fileLog.warn('🚨 [CELL-DEBUG] No layout found for column', {
          columnId: column.id,
          columnField: column.field,
          availableLayouts: columnLayouts.map((l) => l.id),
        })
        return
      }

      const cell = this.createCellElement(row, column, colIndex, layout.xOffset, layout.width)
      rowElement.appendChild(cell)

      this.cellRenderingStats.cellsCreated++
    })

    // Defer remaining columns with requestIdleCallback for smoother initial render
    if (deferredColumns.length > 0) {
      // Capture the row ID at creation time to detect recycling
      const originalRowId = row.id
      const deferredRender = () => {
        // GUARD: If the row element was recycled for a different row since this
        // callback was scheduled, bail out. Without this guard, stale deferred
        // callbacks append cells with old row data to recycled rows, causing
        // duplicate/corrupt cells — most visible when scrolling back up.
        if (rowElement.dataset.rowId !== originalRowId) return

        // GH#1435: Gate deferred render by current visible range to avoid creating
        // out-of-range cells if horizontal scroll changed during the idle wait
        const currentRange = this.visualStateStore.visibleColumnRange
        const currentVisible = this.visualStateStore.visibleColumns
        const inRangeIds = new Set<string>()
        // Build fresh layout map from current visual state — avoids stale widths if a
        // column was resized between row creation and this deferred render firing.
        const freshLayoutMap = new Map<string, any>()
        for (let i = currentRange.start; i < currentRange.end && i < currentVisible.length; i++) {
          inRangeIds.add(currentVisible[i].id)
          freshLayoutMap.set(currentVisible[i].id, currentVisible[i])
        }

        deferredColumns.forEach((column, relativeIndex) => {
          // Skip if column is no longer in visible range (scroll changed during defer)
          if (!inRangeIds.has(column.id)) return

          // Skip if cell already exists (e.g., reconciliation already added it)
          const existingCell = rowElement.querySelector(`.vibegridx-cell[data-column-id="${column.id}"]`)
          if (existingCell) return

          const colIndex = essentialColumnCount + relativeIndex
          this.cellRenderingStats.cellsRequested++

          // Use fresh layout from current visual state; fall back to captured layout.
          // Fresh layout ensures correct xOffset/width after a column resize fires
          // between row creation and this deferred render.
          const layout = freshLayoutMap.get(column.id) ?? layoutMap.get(column.id)
          if (!layout) {
            fileLog.warn('🚨 [CELL-DEBUG] No layout found for deferred column', {
              columnId: column.id,
              columnField: column.field,
            })
            return
          }

          const cell = this.createCellElement(row, column, colIndex, layout.xOffset, layout.width)
          rowElement.appendChild(cell)

          this.cellRenderingStats.cellsCreated++
        })
      }

      // Use requestIdleCallback if available, otherwise setTimeout
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(deferredRender, { timeout: 50 })
      } else {
        setTimeout(deferredRender, 0)
      }
    }

    // PERF: Use pre-computed totalWidth if available, otherwise read from visual state
    const totalRowWidth = precomputed?.totalWidth ?? this.visualStateStore.geometry.totalWidth
    rowElement.style.width = `${totalRowWidth}px`
    rowElement.style.minWidth = `${totalRowWidth}px`

    // Track active row
    this.activeRows.set(row.id, rowElement)

    // Set up drag and drop for data rows in both grouped and flat modes
    if (row.type === 'data' && this.dragDropManager) {
      // Use simplified VibeGrid pattern for drag setup
      this.dragDropManager.setupRowDragHandlers(rowElement, row.id, row.type, row.groupId)
    }

    // Track successful row creation
    this.cellRenderingStats.rowsCreated++

    // PERF: Debug logging removed from hot path

    return rowElement
  }

  /**
   * Create dedicated drag column (always present for consistent layout)
   * PERF: Static styles in CSS (.vibegridx-drag-column), no inline styles needed
   */
  private createDragColumn(row: any): HTMLElement {
    const dragColumn = this.createElement('div', 'vibegridx-drag-column')

    const isDataRow = row.type === 'data' && this.dragDropManager
    const canDragRow = isDataRow // Support drag in both grouped and flat modes

    // PERF: Use CSS class for cursor style instead of inline
    if (canDragRow) {
      dragColumn.classList.add('vibegridx-drag-column--draggable')
    }

    dragColumn.dataset.rowId = row.id
    dragColumn.dataset.columnId = '__drag_handle'

    // Add drag functionality for data rows in both grouped and flat modes
    if (canDragRow) {
      // Add drag handle with CSS-controlled visibility
      const dragHandle = this.dragDropManager!.createDragHandle()
      dragHandle.classList.add('vibegridx-drag-handle')
      dragColumn.appendChild(dragHandle)
    }

    return dragColumn
  }

  /**
   * Create row header with number and optional checkbox (no longer handles drag)
   * When enableSelectionColumn: shows row number by default, checkbox on hover
   * PERF: Static styles in CSS (.vibegridx-row-header-cell), no inline styles needed
   */
  private createRowHeader(row: any, rowIndex: number): HTMLElement {
    const rowHeader = this.createElement('div', 'vibegridx-row-header-cell')
    rowHeader.dataset.rowId = row.id

    if (this.enableSelectionColumn) {
      // Show row number (hidden on hover via CSS)
      const rowNumber = document.createElement('span')
      rowNumber.className = 'vibegridx-row-number'
      rowNumber.textContent = String(rowIndex + 1)
      rowHeader.appendChild(rowNumber)

      // Show checkbox on hover (or when row is selected)
      const checkbox = this.createRowCheckbox(row)
      rowHeader.appendChild(checkbox)
    } else {
      // Show row number only (no selection)
      rowHeader.textContent = String(rowIndex + 1)
    }

    // Add click handler for row selection
    this.setupRowHeaderHandler(rowHeader, row)

    return rowHeader
  }

  /**
   * Create checkbox for row selection
   * PERF: Static styles in CSS (.vibegridx-row-checkbox)
   */
  private createRowCheckbox(row: any): HTMLInputElement {
    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    checkbox.className = 'vibegridx-row-checkbox'
    checkbox.dataset.rowId = row.id

    // Check if this row is currently selected (use ALL visible columns from visual state)
    const allVisibleColumns = this.visualStateStore.visibleColumns

    const selectedCells = this.interactionStore.selectedCells
    const isRowSelected =
      allVisibleColumns.every((col) => selectedCells.has(`${row.id}:${col.id}`)) && allVisibleColumns.length > 0

    checkbox.checked = isRowSelected

    return checkbox
  }

  /**
   * Set up row header click handling
   */
  private setupRowHeaderHandler(rowHeader: HTMLElement, row: any): void {
    // BodyRenderer should NOT handle selection logic - just render and emit events
    // MouseController will handle all interactions via event delegation
    fileLog.debug('🎯 Row header setup for rendering only', { rowId: row.id })

    // Just add data attributes that MouseController can use
    rowHeader.setAttribute('data-row-id', row.id)
    rowHeader.setAttribute('data-interaction-type', 'row-header')
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
    // PERF: Use transform for GPU-accelerated positioning
    // GH#1240: Use actual offset for variable row heights
    const rowOffset = this.tableCoreStore.rowOffsets[rowIndex] ?? rowIndex * ROW_HEIGHT
    rowElement.style.transform = `translateY(${rowOffset}px)`
    // Group-specific styles (background varies by level)
    rowElement.style.background = level === 0 ? '#e3f2fd' : '#f5f5f5'
    rowElement.style.borderBottom = `2px solid ${level === 0 ? '#2196f3' : '#9e9e9e'}`
    rowElement.style.fontWeight = level === 0 ? '600' : '500'
    rowElement.style.cursor = 'pointer'
    rowElement.style.userSelect = 'none'

    // Add expand/collapse button with proper indentation
    const expandButton = this.createGroupExpandButton(level, isExpanded)
    rowElement.appendChild(expandButton)

    // Group label with count
    const groupLabel = this.createGroupLabel(groupData)
    rowElement.appendChild(groupLabel)

    // Add data attribute for MouseController to detect group clicks
    rowElement.setAttribute('data-group-id', groupRow.id)

    return rowElement
  }

  /**
   * Create expanded content row element for row expansion (GH#1240)
   *
   * This creates a container for expanded content that will be rendered
   * by the React component via renderExpandedContent callback.
   */
  createExpandedContentRowElement(expandedRow: any, rowIndex: number, _parentRow: any): HTMLElement {
    const rowElement = this.createElement('div', 'vibegridx-row vibegridx-expanded-content-row')
    rowElement.dataset.rowId = expandedRow.id
    rowElement.dataset.parentRowId = expandedRow.parentRowId

    // PERF: Use transform for GPU-accelerated positioning
    // GH#1240: Use actual offset for variable row heights (expanded rows have different heights)
    const rowOffset = this.tableCoreStore.rowOffsets[rowIndex] ?? rowIndex * ROW_HEIGHT
    rowElement.style.transform = `translateY(${rowOffset}px)`
    rowElement.style.height = `${expandedRow.height || 200}px`

    // Full width spanning all columns
    const totalRowWidth = this.visualStateStore.geometry.totalWidth
    rowElement.style.width = `${totalRowWidth}px`
    rowElement.style.minWidth = `${totalRowWidth}px`

    // Create the expanded content container
    const contentContainer = this.createElement('div', 'vibegridx-expanded-content-container')
    contentContainer.dataset.rowId = expandedRow.parentRowId
    contentContainer.style.cssText = `
      width: 100%;
      height: 100%;
      overflow: auto;
      background: hsl(var(--muted));
      border-left: 2px solid hsl(var(--border));
      padding: 8px 16px 8px 70px;
    `

    // Show loading state if data is being fetched
    if (expandedRow.isLoading) {
      const loadingIndicator = this.createElement('div', 'vibegridx-expanded-loading')
      loadingIndicator.innerHTML = `
        <div class="vibegridx-expand-spinner"></div>
        <span>Loading...</span>
      `
      contentContainer.appendChild(loadingIndicator)
    }
    // Show error state if loading failed
    else if (expandedRow.error) {
      const errorContainer = this.createElement('div', 'vibegridx-expanded-error')
      errorContainer.innerHTML = `
        <span class="vibegridx-expanded-error-icon">⚠️</span>
        <span class="vibegridx-expanded-error-message">${expandedRow.error.message || 'Failed to load'}</span>
        <button class="vibegridx-expanded-retry-btn" data-action="retry-expand" data-row-id="${expandedRow.parentRowId}">
          Retry
        </button>
      `
      contentContainer.appendChild(errorContainer)
    }
    // Show "no data" state if expandedData is empty array
    else if (expandedRow.expandedData && expandedRow.expandedData.length === 0) {
      const emptyContainer = this.createElement('div', 'vibegridx-expanded-empty')
      emptyContainer.textContent = 'No items'
      contentContainer.appendChild(emptyContainer)
    }
    // Data is loaded - mark container for React portal (ExpandedContentPortals renders nested VibeGrid)
    else if (expandedRow.expandedData && expandedRow.expandedData.length > 0) {
      contentContainer.dataset.hasData = 'true'
      contentContainer.dataset.itemCount = String(expandedRow.expandedData.length)
      // GH#1240: React portal (ExpandedContentPortals) will detect data-has-data="true"
      // and render a nested VibeGrid into this container
    }
    // Default: data not yet loaded but not loading either (initial state)
    else {
      const placeholderContainer = this.createElement('div', 'vibegridx-expanded-placeholder')
      placeholderContainer.textContent = 'Expand to load data'
      contentContainer.appendChild(placeholderContainer)
    }

    rowElement.appendChild(contentContainer)

    // Track in activeRows
    this.activeRows.set(expandedRow.id, rowElement)

    fileLog.debug('🔽 Created expanded content row', {
      rowId: expandedRow.id,
      parentRowId: expandedRow.parentRowId,
      height: expandedRow.height,
      isLoading: expandedRow.isLoading,
      hasData: !!expandedRow.expandedData,
      itemCount: expandedRow.expandedData?.length || 0,
    })

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
   * Create hierarchy toggle column for hierarchical data rows.
   * Shows expand/collapse icons for rows with children and provides
   * visual indentation based on hierarchy level.
   */
  private createHierarchyToggle(row: any): HTMLElement {
    const level = row.level ?? 0
    const isExpandable = row.isExpandable ?? false
    const isExpanded = row.isExpanded ?? false
    const rowId = row.id

    const toggleColumn = this.createElement('div', 'vibegridx-hierarchy-toggle')
    toggleColumn.style.cssText = `
      width: ${24 + level * 16}px;
      min-width: ${24 + level * 16}px;
      height: ${ROW_HEIGHT}px;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      padding-left: ${level * 16}px;
      flex-shrink: 0;
    `
    toggleColumn.dataset.rowId = rowId
    toggleColumn.dataset.hierarchyLevel = String(level)

    // Only show toggle icon if row has children
    if (isExpandable) {
      const toggle = this.createElement('span', 'vibegridx-hierarchy-icon')
      toggle.innerHTML = isExpanded ? '▼' : '▶'
      toggle.style.cssText = `
        font-size: 10px;
        color: #666;
        cursor: pointer;
        padding: 4px;
        transition: transform 0.15s ease;
        user-select: none;
      `
      toggle.dataset.rowId = rowId
      toggle.dataset.action = 'toggle-hierarchy'

      // Handle click to toggle expansion
      toggle.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()

        if (this.hierarchyStore) {
          this.hierarchyStore.toggleRowExpansion(rowId)
          fileLog.debug('🔽 Hierarchy toggle clicked', {
            rowId,
            wasExpanded: isExpanded,
          })
        }
      })

      toggleColumn.appendChild(toggle)
    }

    return toggleColumn
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

    // Use column display name instead of raw field name
    const column = this.visualStateStore?.columns?.find((c: any) => c.field === groupData.field || c.id === groupData.field)
    const fieldName = column?.name || groupData.field.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
    const displayValue = groupData.displayValue
    const count = groupData.rowCount

    groupLabel.innerHTML = `
      <strong>${fieldName}:</strong>
      <span style="margin: 0 8px;">${displayValue}</span>
      <span style="color: #666; font-size: 12px;">(${count} ${count === 1 ? 'item' : 'items'})</span>
    `

    return groupLabel
  }

  // ====================================
  // CELL RENDERING METHODS
  // ====================================

  /**
   * Create a cell element using SlotRegistry
   */
  createCellElement(
    row: any,
    column: any,
    colIndex: number,
    xPosition?: number,
    widthOverride?: number,
    _context: 'scroll' | 'initial' | 'manual' = 'initial',
  ): HTMLElement {
    // PERFORMANCE: Simplified cell creation using SlotRegistry
    const baseRowData = row.data || row

    // GH#1240: Inject expansion state for row-expand column
    const isExpanded = this.interactionStore.expandedRowIds.has(row.id)
    const rowData = column.cellType === 'row-expand' ? { ...baseRowData, _isExpanded: isExpanded } : baseRowData

    const value = rowData[column.id]

    // Use SlotRegistry for cell rendering (D2 pipeline)
    if (this.slotRegistry) {
      try {
        const effectiveWidth = widthOverride ?? this.visualStateStore.columnWidths[column.id] ?? column.width ?? 150

        const context: CellRendererContext = {
          viewMode: 'table',
          entityType: this.tableCoreStore?.entityType,
          organizationId: this.visualStateStore?.orgId,
          rowData,
          tableCoreStore: this.tableCoreStore,
          searchText: this.visualStateStore?.globalSearchText || '',
        }

        const renderer = this.slotRegistry.resolve(column, context)

        let cellElement: HTMLElement
        if (renderer) {
          cellElement = renderer.render(value, column, context)
          // Affordance attributes are applied by each renderer in its render() method.
          // Do NOT call applyAffordanceAttrs here — it would overwrite renderer-specific
          // overrides (e.g., empty relationship cells override navigate → edit).
        } else {
          // No renderer found - create basic text cell
          cellElement = document.createElement('div')
          cellElement.className = 'vibegridx-cell'
          cellElement.textContent = value != null ? String(value) : ''
        }

        // Ensure cell has required classes and positioning
        cellElement.classList.add('vibegridx-cell')
        cellElement.style.width = `${effectiveWidth}px`
        cellElement.style.minWidth = `${effectiveWidth}px`
        cellElement.style.maxWidth = `${effectiveWidth}px`
        if (xPosition !== undefined) {
          cellElement.style.left = `${xPosition}px`
        }

        // ARIA
        cellElement.setAttribute('role', 'gridcell')
        cellElement.setAttribute('aria-colindex', String(colIndex + 1))

        // Selection state
        const cellId = `${row.id}:${column.id}`
        if (this.interactionStore.selectedCells.has(cellId)) {
          cellElement.classList.add('vibegridx-selected')
          cellElement.setAttribute('aria-selected', 'true')
        }

        // Interaction handlers
        this.addCellInteractionHandlers(cellElement, row, column, value)

        return cellElement
      } catch (error) {
        fileLog.error('❌ [BODY-RENDERER] SlotRegistry render failed', {
          error,
          columnId: column.id,
          cellType: column.cellType,
        })
        throw error
      }
    }

    throw new Error('SlotRegistry not available for cell rendering')
  }

  // Note: Basic cell fallback removed - SlotRegistry must work

  /**
   * Add interaction handlers to cell elements
   */
  private addCellInteractionHandlers(cellElement: HTMLElement, row: any, column: any, _value: any): void {
    // ✅ REMOVED: Old content click handler (now handled by CellActionRouter spatial detection)
    // CellActionRouter detects content vs padding clicks and routes accordingly:
    // - Content click → editSessionManager.start() (via CellActionRouter)
    // - Padding click → selection only (via SelectionService)

    // Set data attributes for InteractionCoordinator
    cellElement.setAttribute('data-row-id', row.id)
    cellElement.setAttribute('data-column-id', column.id)

    // Set test ID for automated testing
    cellElement.setAttribute('data-testid', `cell-${row.id}-${column.id}`)

    // Set aria-label for accessibility and chrome-devtools-axi snapshot visibility
    const cellText = cellElement.textContent?.trim()
    if (cellText && column.name) {
      cellElement.setAttribute('aria-label', `${column.name}: ${cellText}`)
    }

    // Set field type metadata for CellActionRouter
    if (column.cellType) {
      cellElement.setAttribute('data-field-type', column.cellType)
    }
  }

  // Note: Cell formatting methods removed - now handled by SlotRegistry

  // ====================================
  // ROW MANAGEMENT METHODS
  // ====================================

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
   * Update all row checkboxes based on current selection (reactive)
   */
  updateAllRowCheckboxes(): void {
    // Use UNIFIED visual state's visible columns - no duplicate filtering
    const allVisibleColumns = this.visualStateStore.visibleColumns
    const processedRows = this.tableCoreStore.processedRows

    // Get reactive checkbox states from interaction state
    const checkboxStates = this.interactionStore.getRowCheckboxStates(processedRows, allVisibleColumns)

    this.activeRows.forEach((rowElement, rowId) => {
      const checkbox = rowElement.querySelector('input[type="checkbox"]') as HTMLInputElement
      if (checkbox) {
        const isRowSelected = checkboxStates.get(rowId) || false
        checkbox.checked = isRowSelected
      }
    })
  }

  /**
   * Update selection classes on all visible cells
   * Called by selection reaction when selectedCells changes
   */
  updateAllCellSelectionClasses(): void {
    const selectedCells = this.interactionStore.selectedCells

    this.activeRows.forEach((rowElement, rowId) => {
      // Find all data cells in this row (exclude drag handle, checkbox columns)
      const cells = rowElement.querySelectorAll('.vibegridx-cell[data-column-id]')
      cells.forEach((cellElement) => {
        const columnId = cellElement.getAttribute('data-column-id')
        if (columnId) {
          const cellId = `${rowId}:${columnId}`
          const isSelected = selectedCells.has(cellId)
          if (isSelected) {
            cellElement.classList.add('vibegridx-selected')
            cellElement.setAttribute('aria-selected', 'true')
          } else {
            cellElement.classList.remove('vibegridx-selected')
            cellElement.removeAttribute('aria-selected')
          }
        }
      })
    })
  }

  // ====================================
  // DRAG AND DROP METHODS
  // ====================================

  /**
   * Initialize drag and drop functionality
   */
  private initializeDragDrop(): void {
    this.dragDropManager = new DragDropManager({
      onRowMove: (draggedRowId: string, targetGroupId: string, newIndex: number): boolean => {
        fileLog.debug('🔄 Row move requested via drag and drop (grouped)', {
          draggedRowId,
          targetGroupId,
          newIndex,
        })

        // Get current group structure to determine the source group
        const processedRows = this.tableCoreStore.processedRows
        const draggedRow = processedRows.find((r) => r.id === draggedRowId)
        if (!draggedRow || draggedRow.type !== 'data') {
          fileLog.error('❌ Invalid dragged row or not a data row', { draggedRowId })
          return false
        }

        // Find the source group by looking at the group hierarchy
        const sourceGroupId = draggedRow.groupId || this.findRowGroupId(draggedRowId)
        if (!sourceGroupId) {
          fileLog.error('❌ Could not determine source group for dragged row', { draggedRowId })
          return false
        }

        // Move row within group using data state method
        try {
          this.tableCoreStore.moveRowInGroup(sourceGroupId, targetGroupId, draggedRowId, newIndex)
          fileLog.debug('✅ Row move delegated to drag handler', {
            draggedRowId,
            sourceGroupId,
            targetGroupId,
            newIndex,
          })
          return true
        } catch (error) {
          fileLog.error('❌ Row move failed', { error })
          return false
        }
      },

      onFlatRowMove: (fromIndex: number, toIndex: number) => {
        fileLog.debug('🔄 Row move requested via drag and drop (flat)', {
          fromIndex,
          toIndex,
        })

        // Move row in flat mode
        const success = this.tableCoreStore.moveRowInFlat(fromIndex, toIndex)

        fileLog.debug('✅ Row moved in flat mode', {
          success,
          fromIndex,
          toIndex,
        })

        return success
      },

      isGroupMode: () => {
        this.updateGroupedModeStatus()
        return this.isGroupedMode
      },

      onDragStart: () => {
        fileLog.debug('🎯 Drag operation started')
      },

      onDragEnd: () => {
        fileLog.debug('🎯 Drag operation ended')
      },
    })

    // Set the container for drag operations
    if (this.dragDropManager) {
      this.dragDropManager.setContainer(this.container)
    }
  }

  /**
   * Update grouped mode status based on current table state
   */
  private updateGroupedModeStatus(): void {
    try {
      // Get grouping configuration from visual operations
      const groupConfig = this.visualStateStore.getGroupConfig()
      this.isGroupedMode = !!(groupConfig && groupConfig.fields && groupConfig.fields.length > 0)
    } catch (error) {
      // Fallback: assume not grouped if unable to get config
      this.isGroupedMode = false
      fileLog.warn('Failed to get group config, assuming not grouped', { error })
    }
  }

  /**
   * Find the group ID for a given row ID by traversing the processed rows
   */
  private findRowGroupId(rowId: string): string | null {
    const processedRows = this.tableCoreStore.processedRows
    let currentGroupId: string | null = null

    for (const row of processedRows) {
      if (row.type === 'group') {
        currentGroupId = row.id
      } else if (row.type === 'data' && row.id === rowId) {
        return currentGroupId
      }
    }

    return null
  }

  /**
   * Refresh drag and drop setup for all active rows
   */
  refreshDragDropSetup(): void {
    this.updateGroupedModeStatus()

    if (!this.dragDropManager) {
      return
    }

    this.activeRows.forEach((rowElement, rowId) => {
      const row = this.tableCoreStore.processedRows.find((r) => r.id === rowId)
      if (row && row.type === 'data') {
        this.dragDropManager!.setupRowForDragDrop(rowElement, row)
      }
    })

    fileLog.debug('🔄 Drag and drop setup refreshed for all active rows')
  }

  /**
   * @deprecated OBSOLETE: Mouse handling moved to reactive MouseController
   * This method is no longer called - MouseController handles all mouse events reactively
   * Can be removed after verifying no references exist
   */
  handleCellMouseDown(e: MouseEvent, cellElement: HTMLElement, target: HTMLElement): void {
    const rowId = cellElement.getAttribute('data-row-id')
    const columnId = cellElement.getAttribute('data-column-id')

    if (!rowId || !columnId) {
      fileLog.warn('⚠️ Cell mouse down on element without row/column data')
      return
    }

    // Find the row and column data
    const rows = this.tableCoreStore.processedRows
    const columns = this.tableCoreStore.columns
    const row = rows.find((r) => r.id === rowId)
    const column = columns.find((c) => c.id === columnId)

    if (!row || !column) {
      fileLog.warn('⚠️ Row or column not found for cell mouse down')
      return
    }

    const isCtrlKey = e.ctrlKey || e.metaKey
    const isShiftKey = e.shiftKey
    const cellId = `${row.id}:${column.id}`

    fileLog.debug('🖱️ Cell mouse down - immediate selection', {
      rowId: row.id,
      columnId: column.id,
      ctrl: isCtrlKey,
      shift: isShiftKey,
      target: target.className,
    })

    // Provide immediate selection feedback
    // Update keyboard navigation focus - use interaction state instead of local state
    this.interactionStore.setFocusedCell(cellId)

    // Focus the container so it can receive keyboard events
    this.container.focus()

    if (isShiftKey && this.interactionStore.anchorCell) {
      // Shift+click for range selection
      this.interactionStore.selectRange(this.interactionStore.anchorCell!, cellId)
    } else if (isCtrlKey) {
      // Ctrl/Cmd+click for multi-selection toggle
      this.interactionStore.toggleCellSelection(row.id, column.id, isCtrlKey, isShiftKey)
    } else {
      // Regular click - use toggleCellSelection to properly set anchor
      this.interactionStore.toggleCellSelection(row.id, column.id, isCtrlKey, isShiftKey)

      // Store context in case drag selection starts later
      this.lastClickedCell = { cellId, row, column }
    }
  }

  /**
   * @deprecated OBSOLETE: Click handling moved to reactive MouseController
   * This method is no longer called - MouseController handles all interactions reactively
   * Can be removed after verifying no references exist
   */
  handleCellClick(e: MouseEvent, cellElement: HTMLElement, target: HTMLElement): void {
    const rowId = cellElement.getAttribute('data-row-id')
    const columnId = cellElement.getAttribute('data-column-id')

    if (!rowId || !columnId) {
      fileLog.warn('⚠️ Cell click on element without row/column data')
      return
    }

    // Find the row and column data
    const rows = this.tableCoreStore.processedRows
    const columns = this.tableCoreStore.columns
    const row = rows.find((r) => r.id === rowId)
    const column = columns.find((c) => c.id === columnId)

    if (!row || !column) {
      fileLog.warn('⚠️ Cell click on unknown row/column', { rowId, columnId })
      return
    }

    // If click is on content element with editable class, ignore for selection
    // These elements have their own click handlers for editing
    if (
      target &&
      target.classList &&
      (target.classList.contains('vibegridx-cell-text-editable') ||
        target.classList.contains('vibegridx-cell-badge-editable') ||
        target.classList.contains('vibegridx-cell-number-editable') ||
        target.classList.contains('vibegridx-cell-boolean-editable') ||
        target.classList.contains('vibegridx-cell-empty-editable') ||
        target.classList.contains('vibegridx-enum-badge'))
    ) {
      fileLog.debug('📝 Content element clicked, ignoring for selection')
      return // Content clicks are handled separately for editing
    }

    const isCtrlKey = e.ctrlKey || e.metaKey
    const isShiftKey = e.shiftKey
    const cellId = `${row.id}:${column.id}`

    fileLog.debug('🖱️ Cell whitespace clicked - selection mode', {
      rowId: row.id,
      columnId: column.id,
      ctrl: isCtrlKey,
      shift: isShiftKey,
      target: target.className,
    })

    // Update keyboard navigation focus - use interaction state instead of local state
    this.interactionStore.setFocusedCell(cellId)
    // Note: anchorCell is handled by setFocusedCell when no anchor exists

    // Focus the container so it can receive keyboard events
    this.container.focus()

    // Prevent text selection during drag
    e.preventDefault()

    if (isShiftKey && this.interactionStore.anchorCell) {
      // Shift+click for range selection
      this.interactionStore.selectRange(this.interactionStore.anchorCell!, cellId)
    } else if (isCtrlKey) {
      // Ctrl/Cmd+click for multi-selection toggle
      this.interactionStore.toggleCellSelection(row.id, column.id, isCtrlKey, isShiftKey)
    } else {
      // Regular click - use toggleCellSelection to properly set anchor
      // NOTE: Do NOT start drag selection immediately - wait for MouseController to detect actual dragging
      this.interactionStore.toggleCellSelection(row.id, column.id, isCtrlKey, isShiftKey)

      // Store context in case drag selection starts later
      this.lastClickedCell = { cellId, row, column }
    }

    // NOTE: Mouse move and up handlers are now managed by MouseController
    // This avoids duplicate event listeners and conflicting drag detection logic
  }

  // ====================================
  // GRANULAR UPDATE METHODS (Cell-level)
  // ====================================

  /**
   * Update a single cell's value in the DOM
   * Preserves cell structure, only updates content
   */
  updateCellValue(rowId: string, columnId: string, newValue: any, column: any, rowData?: any): boolean {
    const cellElement = this.container.querySelector(
      `[data-row-id="${rowId}"][data-column-id="${columnId}"]`,
    ) as HTMLElement

    if (!cellElement) {
      // Debug: Check what cells exist for this row to understand the mismatch
      const rowCells = this.container.querySelectorAll(`[data-row-id="${rowId}"]`)
      const existingColumnIds = Array.from(rowCells)
        .map((el) => el.getAttribute('data-column-id'))
        .filter(Boolean)
      fileLog.warn('Cell element not found for update', {
        rowId: rowId.substring(0, 8),
        columnId,
        existingColumnIds: existingColumnIds.slice(0, 5), // First 5 to avoid spam
        rowCellCount: rowCells.length,
      })
      return false
    }

    if (this.slotRegistry) {
      try {
        const context: CellRendererContext = {
          viewMode: 'table',
          entityType: this.tableCoreStore?.entityType,
          organizationId: this.visualStateStore?.orgId,
          rowData,
          tableCoreStore: this.tableCoreStore,
          searchText: this.visualStateStore?.globalSearchText || '',
        }
        const renderer = this.slotRegistry.resolve(column, context)
        if (renderer) {
          const newCellContent = renderer.render(newValue, column, context)
          // Replace cell content with the renderer's container element.
          // Do NOT move children — async renderers (e.g. EntityReferenceRenderer)
          // hold a reference to their container and update it after fetch completes.
          // Moving children orphans the container, so async updates go to a detached node.
          cellElement.innerHTML = ''
          cellElement.appendChild(newCellContent)
          // Copy over data attributes from rendered element
          for (const attr of Array.from(newCellContent.attributes)) {
            if (attr.name.startsWith('data-')) {
              cellElement.setAttribute(attr.name, attr.value)
            }
          }

          fileLog.debug('✅ Cell value updated (granular)', {
            rowId,
            columnId,
            newValue,
            method: 'cell-level',
            cellType: column.cellType || column.type,
          })

          return true
        }
      } catch (error) {
        fileLog.error('Cell update failed', { rowId, columnId, error })
        return false
      }
    }

    // Fallback: simple text update
    cellElement.textContent = CellFormatter.formatCellValue(newValue)
    fileLog.warn('Cell updated with fallback formatter', {
      rowId,
      columnId,
    })
    return true
  }

  /**
   * Update multiple cells efficiently (batch update)
   */
  updateCells(changedCells: Map<string, Set<string>>): void {
    const startTime = performance.now()
    let updateCount = 0
    let failCount = 0

    // Pre-compute visible column IDs once for all updates
    const visibleColumnIds = new Set(this.visualStateStore.visibleColumns.map((c) => c.id))

    changedCells.forEach((columnIds, rowId) => {
      const row = this.tableCoreStore.processedRows.find((r: any) => r.id === rowId)
      if (!row) {
        fileLog.warn('Row not found for batch update', { rowId })
        failCount++
        return
      }

      const rowData = row.data || row

      columnIds.forEach((columnId) => {
        const column = this.tableCoreStore.columns.find((c: any) => c.id === columnId)
        if (!column) {
          fileLog.warn('Column not found for batch update', { rowId, columnId })
          failCount++
          return
        }

        // Skip hidden columns - they don't have DOM elements rendered
        if (!visibleColumnIds.has(columnId)) {
          // Silent skip - hidden column data changed but no DOM update needed
          return
        }

        const newValue = rowData[columnId]
        const success = this.updateCellValue(rowId, columnId, newValue, column, rowData)

        if (success) {
          updateCount++
        } else {
          failCount++
        }
      })
    })

    const duration = performance.now() - startTime

    fileLog.info('📊 Batch cell update complete', {
      rowsAffected: changedCells.size,
      cellsUpdated: updateCount,
      cellsFailed: failCount,
      duration: `${duration.toFixed(2)}ms`,
      avgPerCell: updateCount > 0 ? `${(duration / updateCount).toFixed(2)}ms` : 'N/A',
    })
  }

  /**
   * Update entire row element (fallback for multi-cell changes)
   */
  updateRowElement(rowId: string, rowIndex: number): boolean {
    const row = this.tableCoreStore.processedRows.find((r: any) => r.id === rowId)
    const oldRowElement = this.activeRows.get(rowId)

    if (!oldRowElement || !row) {
      fileLog.warn('Row or element not found for update', {
        rowId,
        hasRow: !!row,
        hasElement: !!oldRowElement,
      })
      return false
    }

    const columns = this.tableCoreStore.columns
    const columnVisibility = this.visualStateStore.columnVisibility
    const baseOffset = 70

    const newRowElement = this.createRowElement(row, rowIndex, columns, columnVisibility, baseOffset)

    oldRowElement.replaceWith(newRowElement)
    this.activeRows.set(rowId, newRowElement)

    fileLog.debug('✅ Row element updated (row-level)', {
      rowId,
      rowIndex,
      method: 'row-level',
    })

    return true
  }

  // ====================================
  // ROW RECYCLING METHODS
  // ====================================

  /**
   * 🚀 PERF: Recycle existing row element for new data
   *
   * Instead of destroying and recreating DOM, we:
   * 1. Update position (transform)
   * 2. Update row ID attributes
   * 3. Update cell contents in-place
   *
   * This is ~10x faster than create/destroy because:
   * - No DOM element creation
   * - No event handler setup
   * - Just property/content updates
   */
  recycleRowForNewData(
    rowElement: HTMLElement,
    newRow: any,
    newRowIndex: number,
    columns: any[],
    precomputed?: {
      visibleColumns: any[]
      columnLayouts: any[]
      totalWidth: number
    },
  ): HTMLElement {
    const rowData = newRow.data || newRow

    // 1. Update position
    // GH#1240: Use actual offset for variable row heights (expanded rows have different heights)
    const rowOffset = this.tableCoreStore.rowOffsets[newRowIndex] ?? newRowIndex * ROW_HEIGHT
    rowElement.style.transform = `translateY(${rowOffset}px)`

    // 2. Update row ID
    const oldRowId = rowElement.dataset.rowId
    rowElement.dataset.rowId = newRow.id

    // ARIA: Update row index for recycled row
    rowElement.setAttribute('aria-rowindex', String(newRowIndex + 2))

    // Update group ID if present
    if (newRow.type === 'data' && newRow.groupId) {
      rowElement.setAttribute('data-group-id', newRow.groupId)
    } else {
      rowElement.removeAttribute('data-group-id')
    }

    // 3. Update alternating row class
    rowElement.classList.remove('vibegridx-row-alt')
    if (newRowIndex % 2 !== 0) {
      rowElement.classList.add('vibegridx-row-alt')
    }

    // Support custom row class names from row data (GH#1200)
    // Remove old class if it exists and add new one
    if (rowElement.dataset.rowClassName) {
      rowElement.classList.remove(rowElement.dataset.rowClassName)
      delete rowElement.dataset.rowClassName
    }
    if (newRow._rowClassName) {
      rowElement.classList.add(newRow._rowClassName)
      rowElement.dataset.rowClassName = newRow._rowClassName
    }

    // 4. Update row header (row number + optional checkbox)
    const rowHeader = rowElement.querySelector('.vibegridx-row-header-cell') as HTMLElement | null
    if (rowHeader) {
      // CRITICAL: Update rowHeader's data-row-id for MouseController event delegation
      rowHeader.dataset.rowId = newRow.id
      const checkbox = rowHeader.querySelector('input[type="checkbox"]') as HTMLInputElement
      if (checkbox) {
        checkbox.dataset.rowId = newRow.id
        // Update checkbox state based on selection
        const allVisibleColumns = this.visualStateStore.visibleColumns
        const isSelected =
          this.interactionStore.getRowCheckboxStates([newRow], allVisibleColumns).get(newRow.id) || false
        checkbox.checked = isSelected
        // Update row number span (shown when not hovering and not selected)
        const rowNumberSpan = rowHeader.querySelector('.vibegridx-row-number') as HTMLElement | null
        if (rowNumberSpan) {
          rowNumberSpan.textContent = String(newRowIndex + 1)
        }
      } else {
        // No checkbox — pure row number display
        rowHeader.textContent = String(newRowIndex + 1)
      }
    }

    // 5. Update drag column
    const dragColumn = rowElement.querySelector('.vibegridx-drag-column')
    if (dragColumn) {
      ;(dragColumn as HTMLElement).dataset.rowId = newRow.id
    }

    // 6. Update cells using column-ID-based mapping (not index-based)
    // The recycled row may have cells for a different column range (different count
    // and/or different columns) if horizontal scroll changed since the row was pooled.
    const columnLayouts = precomputed?.columnLayouts ?? this.visualStateStore.visibleColumns
    const visibleColumnsOnly =
      precomputed?.visibleColumns ?? columns.filter((col) => columnLayouts.some((l) => l.id === col.id))

    // Create layout lookup map for O(1) lookups
    const layoutMap = new Map<string, any>()
    for (const layout of columnLayouts) {
      layoutMap.set(layout.id, layout)
    }

    // Build map of existing cells by column ID (not index)
    const existingCellMap = new Map<string, HTMLElement>()
    for (const cell of rowElement.querySelectorAll('.vibegridx-cell')) {
      const colId = (cell as HTMLElement).dataset.columnId
      if (colId) existingCellMap.set(colId, cell as HTMLElement)
    }

    // Track which columns we need — columns not in this set get removed
    const neededColumnIds = new Set<string>()
    for (const col of visibleColumnsOnly) {
      neededColumnIds.add(col.id)
    }

    // Remove orphan cells (exist in DOM but not needed for current column range)
    for (const [colId, cellEl] of existingCellMap) {
      if (!neededColumnIds.has(colId)) {
        cellEl.remove()
        existingCellMap.delete(colId)
      }
    }

    // Update existing cells and create missing ones
    visibleColumnsOnly.forEach((column, colIndex) => {
      const value = rowData[column.id]
      const layout = layoutMap.get(column.id)
      let cell = existingCellMap.get(column.id)

      if (cell) {
        // Reuse existing cell — update identity, position, and content
        cell.dataset.rowId = newRow.id
        cell.dataset.columnId = column.id

        if (layout) {
          cell.style.left = `${layout.xOffset}px`
          cell.style.width = `${layout.width}px`
        }

        // Reset cell state for re-rendering
        cell.className = 'vibegridx-cell'
        cell.textContent = ''
        cell.removeAttribute('data-field')
        cell.removeAttribute('data-testid')
        cell.removeAttribute('data-field-type')
        for (const attr of Array.from(cell.attributes)) {
          if (attr.name.startsWith('data-affordance') || attr.name.startsWith('data-cell-')) {
            cell.removeAttribute(attr.name)
          }
        }
        cell.classList.remove('vibegridx-selected')
      } else {
        // Create new cell for a column the recycled row didn't have
        cell = this.createCellElement(
          newRow,
          { ...column, width: layout?.width ?? column.width ?? 150 },
          colIndex,
          layout?.xOffset,
          layout?.width,
        )
        rowElement.appendChild(cell)
      }

      // Render cell content for reused cells
      if (existingCellMap.has(column.id)) {
        // Only re-render reused cells — new cells from createCellElement are already rendered
        try {
          if (this.slotRegistry) {
            // D2 pipeline: use SlotRegistry
            const context: CellRendererContext = {
              viewMode: 'table',
              entityType: this.tableCoreStore?.entityType,
              organizationId: this.visualStateStore?.orgId,
              rowData,
              tableCoreStore: this.tableCoreStore,
            }
            const renderer = this.slotRegistry.resolve(column, context)
            if (renderer) {
              const cellContent = renderer.render(value, column, context)
              // Affordance attributes applied by renderer internally — do not re-apply here.
              cell.dataset.field = column.field || column.id
              cell.setAttribute('data-testid', `cell-${newRow.id}-${column.id}`)
              if (column.cellType) {
                cell.setAttribute('data-field-type', column.cellType)
              }
              // Replace cell content with the renderer's container element.
              // Do NOT move children — async renderers (e.g. EntityReferenceRenderer)
              // hold a reference to their container and update it after fetch completes.
              // Moving children orphans the container, so async updates go to a detached node.
              cell.innerHTML = ''
              cell.appendChild(cellContent)
            } else {
              cell.textContent = column.formatter ? column.formatter(value, rowData, column) : String(value ?? '')
            }
          } else {
            cell.textContent = column.formatter ? column.formatter(value, rowData, column) : String(value ?? '')
          }
        } catch (_error) {
          cell.textContent = column.formatter ? column.formatter(value, rowData, column) : String(value ?? '')
        }
      }
    })

    // Track in activeRows map (remove old, add new)
    if (oldRowId && oldRowId !== newRow.id) {
      this.activeRows.delete(oldRowId)
    }
    this.activeRows.set(newRow.id, rowElement)

    return rowElement
  }
}

// ====================================
// STATIC UTILITY METHODS (from CellFormatter)
// ====================================

export class CellFormatter {
  // Legacy properties for type compatibility (these methods should be in BodyRenderer)
  lastClickedCell: any = null
  interactionStore: any = null
  tableCoreStore: any = null
  visualStateStore: any = null
  renderTimeoutId: any = null
  cellRenderingStats: any = null
  activeRows: any = null
  container: any = null

  /**
   * Static method for formatting cell values (legacy compatibility)
   */
  static formatCellValue(value: any): string {
    return value != null ? String(value) : ''
  }

  /**
   * Get display text for empty values based on type
   */
  static getEmptyDisplayText(type?: string): string {
    switch (type) {
      case 'boolean':
        return 'Not set'
      case 'date':
      case 'datetime-local':
        return 'No date'
      case 'number':
      case 'integer':
      case 'float':
      case 'decimal':
      case 'currency':
        return '—'
      case 'tags':
        return 'No tags'
      case 'single-select':
      case 'select':
        return 'Select...'
      default:
        return ''
    }
  }

  /**
   * Check if value should be displayed as empty
   */
  static isEmptyValue(value: any, type?: string): boolean {
    if (value === null || value === undefined) return true

    if (type === 'boolean') {
      return false // Booleans are never empty, they're either true or false
    }

    if (typeof value === 'string') {
      return value.trim() === ''
    }

    if (Array.isArray(value)) {
      return value.length === 0
    }

    if (type === 'number' || type === 'integer' || type === 'float' || type === 'decimal') {
      return Number.isNaN(Number(value))
    }

    return false
  }

  /**
   * Format value for editing (raw format for input fields)
   */
  static formatForEdit(value: any, type?: string): string {
    if (value === null || value === undefined) return ''

    switch (type) {
      case 'boolean':
        return value ? 'true' : 'false'

      case 'date':
        if (value instanceof Date) {
          return value.toISOString().split('T')[0]
        }
        return String(value)

      case 'datetime-local':
        if (value instanceof Date) {
          return value.toISOString()
        }
        return String(value)

      case 'number':
      case 'integer':
      case 'float':
      case 'decimal':
      case 'currency':
      case 'percentage':
        return String(value)

      case 'tags':
        if (Array.isArray(value)) {
          return value.join(', ')
        }
        return String(value)

      case 'json':
        if (typeof value === 'object') {
          return JSON.stringify(value, null, 2)
        }
        return String(value)

      default:
        return String(value)
    }
  }

  /**
   * Parse edited value back to proper type
   */
  static parseEditedValue(value: string, type?: string): any {
    if (!value && value !== '0' && value !== 'false') return null

    switch (type) {
      case 'boolean':
        return value === 'true' || value === '1' || value === 'yes'

      case 'date':
      case 'datetime-local':
        return new Date(value)

      case 'number':
      case 'integer':
        return parseInt(value, 10)

      case 'float':
      case 'decimal':
      case 'currency':
      case 'percentage':
        return parseFloat(value)

      case 'tags':
        return value
          .split(',')
          .map((t) => t.trim())
          .filter((t) => t.length > 0)

      case 'json':
        try {
          return JSON.parse(value)
        } catch {
          return value
        }

      default:
        return value
    }
  }

  /**
   * @deprecated OBSOLETE: Drag selection moved to reactive observer pattern
   * This method is no longer called - drag selection handled by focused observers
   * Can be removed after verifying no references exist
   */
  startDragSelectionOnDrag(e: MouseEvent): void {
    if (!this.lastClickedCell) {
      fileLog.warn('⚠️ Drag selection triggered but no last clicked cell context available')
      return
    }

    const { cellId } = this.lastClickedCell

    fileLog.debug('🖱️ Starting drag selection on actual drag detection', {
      startCell: cellId,
      mousePosition: { x: e.clientX, y: e.clientY },
    })

    // Now start drag selection since actual dragging is detected
    this.interactionStore.startDragSelection(cellId)
    // NOTE: No additional event listeners - MouseController handles all mouse events
  }

  /**
   * @deprecated OBSOLETE: Drag selection moved to reactive observer pattern
   * This method is no longer called - drag selection handled by focused observers
   * Can be removed after verifying no references exist
   */
  updateDragSelectionOnMove(e: MouseEvent): void {
    // Find the cell element under the mouse
    const elementUnderMouse = document.elementFromPoint(e.clientX, e.clientY)
    const cellUnderMouse = elementUnderMouse?.closest('[data-row-id][data-column-id]') as HTMLElement

    if (cellUnderMouse) {
      const rowId = cellUnderMouse.dataset.rowId
      const columnId = cellUnderMouse.dataset.columnId
      if (rowId && columnId) {
        const currentCellId = `${rowId}:${columnId}`
        // Create data context for the interaction state
        const dataContext = {
          rows: this.tableCoreStore.processedRows,
          columns: this.tableCoreStore.columns,
          columnVisibility: this.visualStateStore.columnVisibility,
        }
        this.interactionStore.updateDragSelection(currentCellId, dataContext)
      }
    }
  }

  /**
   * @deprecated OBSOLETE: Drag selection moved to reactive observer pattern
   * This method is no longer called - drag selection handled by focused observers
   * Can be removed after verifying no references exist
   */
  endDragSelectionOnMouseUp(): void {
    fileLog.debug('🖱️ Ending drag selection on mouse up')
    this.interactionStore.endDragSelection()

    // Clean up context since interaction is complete
    this.lastClickedCell = null
  }

  /**
   * Get current cell rendering statistics for debugging
   */
  getRenderingStats() {
    return {
      ...this.cellRenderingStats,
      activeRowsCount: this.activeRows.size,
      containerChildren: this.container.children.length,
      timeSinceLastRender: Date.now() - this.cellRenderingStats.lastRenderTime,
    }
  }
}
