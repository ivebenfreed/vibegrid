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
import type { DOMElementFactory } from '../factories/DOMElementFactory'
import type { KeyboardNavigationController } from '../modules/KeyboardNavigationController'
import type { SelectionController } from '../modules/SelectionController'

const fileLog = getLogger(['custom', 'vibegrid', 'renderers', 'components', 'BodyRenderer.ts'])

const ROW_HEIGHT = 40

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

  // Field type system bridge
  modularCellBridge?: any
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
  private lastClickedCell: { cellId: string; row: any; column: any } | null = null

  // Observer cleanup
  private selectionObserverDisposer?: () => void

  // Cell rendering tracking for debugging invisible cells
  private cellRenderingStats = {
    rowsRequested: 0,
    rowsCreated: 0,
    cellsRequested: 0,
    cellsCreated: 0,
    lastRenderTime: 0,
    renderErrors: [] as string[],
  }

  // NEW: Modular cell system support
  private modularCellBridge: any = null

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
    this.modularCellBridge = options.modularCellBridge || null

    // Initialize drag and drop manager with container
    this.initializeDragDrop()

    // Setup observer for selection changes to update checkboxes
    this.setupSelectionObserver()

    // Check if modular cell system is already available globally (from init manager)
    // This allows synchronous access if it's already initialized
    if (typeof window !== 'undefined' && (window as any).vibegridCellBridge) {
      this.modularCellBridge = (window as any).vibegridCellBridge
      fileLog.debug('🎯 [FIELD-BRIDGE] Modular cell system already available from init manager')
    } else {
      // Initialize modular cell system asynchronously as fallback
      this.initializeModularCellSystem()
    }

    fileLog.info('🏗️ BodyRenderer initialized (Phase 2.1 consolidated)') // Keep: lifecycle
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
        // Update cell selection classes (for .vibegridx-selected)
        this.updateAllCellSelectionClasses()
        fileLog.debug('📦 Selection states updated due to selection change')
      },
    )
  }

  /**
   * Initialize modular cell system for enhanced field type support
   */
  private async initializeModularCellSystem(): Promise<void> {
    // First check if it's already available globally (from init manager)
    if (typeof window !== 'undefined' && (window as any).vibegridCellBridge) {
      this.modularCellBridge = (window as any).vibegridCellBridge
      fileLog.debug(
        '🎯 [FIELD-BRIDGE] Modular cell system already initialized (from init manager)',
        {
          supportedTypes: this.modularCellBridge.getStats().registry.totalTypes,
          basicTypes: this.modularCellBridge.getStats().registry.basicTypes.length,
          relationshipTypes: this.modularCellBridge.getStats().registry.relationshipTypes.length,
          rollupTypes: this.modularCellBridge.getStats().registry.rollupTypes.length,
        },
      )
      return
    }

    try {
      // Fallback: Dynamically import the modular system to avoid circular dependencies
      const modularModule = await import('../../field-types')
      this.modularCellBridge = modularModule.modularCellBridge

      fileLog.debug('🎯 [FIELD-BRIDGE] Modular cell system initialized in BodyRenderer', {
        supportedTypes: this.modularCellBridge.getStats().registry.totalTypes,
        basicTypes: this.modularCellBridge.getStats().registry.basicTypes.length,
        relationshipTypes: this.modularCellBridge.getStats().registry.relationshipTypes.length,
        rollupTypes: this.modularCellBridge.getStats().registry.rollupTypes.length,
      })
    } catch (error) {
      fileLog.error('❌ [FIELD-BRIDGE] Modular cell system failed to initialize - FAIL FAST', {
        error,
      })
      // FAIL FAST - Don't use legacy, surface the real issue
      throw error
    }
  }

  /**
   * Cleanup observers and resources
   */
  destroy(): void {
    if (this.selectionObserverDisposer) {
      this.selectionObserverDisposer()
      this.selectionObserverDisposer = undefined
    }

    // Clear active rows
    this.activeRows.clear()

    fileLog.info('🧹 BodyRenderer destroyed') // Keep: lifecycle
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
  ): HTMLElement {
    // Track row rendering for debugging invisible cells
    this.cellRenderingStats.rowsRequested++
    this.cellRenderingStats.lastRenderTime = Date.now()

    // PERF: Debug logging removed from hot path - object creation was expensive
    // Enable via: __VIBEGRID_DEBUG__.enable() for render timeline instead

    // PERF: updateGroupedModeStatus() is called once per render cycle, not per row
    // It was previously called here but moved to renderer initialization for performance
    const rowElement = this.createElement('div', 'vibegridx-row')
    rowElement.dataset.rowId = row.id

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
    if (rowIndex % 2 !== 0) {
      rowElement.classList.add('vibegridx-row-alt')
    }

    // PERF: Use transform for GPU-accelerated positioning (doesn't trigger layout)
    rowElement.style.transform = `translateY(${rowIndex * ROW_HEIGHT}px)`

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
      precomputed?.visibleColumns ??
      columns.filter((col) => columnLayouts.some((l) => l.id === col.id))

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

      // Use the layout's xOffset for absolute positioning (already includes cumulative positioning)
      const cell = this.createCellElement(row, column, colIndex, layout.xOffset, layout.width)
      rowElement.appendChild(cell)

      this.cellRenderingStats.cellsCreated++
    })

    // Defer remaining columns with requestIdleCallback for smoother initial render
    if (deferredColumns.length > 0) {
      const deferredRender = () => {
        deferredColumns.forEach((column, relativeIndex) => {
          const colIndex = essentialColumnCount + relativeIndex
          this.cellRenderingStats.cellsRequested++

          // PERF: O(1) lookup using layoutMap from closure
          const layout = layoutMap.get(column.id)
          if (!layout) {
            fileLog.warn('🚨 [CELL-DEBUG] No layout found for deferred column', {
              columnId: column.id,
              columnField: column.field,
            })
            return
          }

          // Use the layout's xOffset for absolute positioning
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
   * Create row header with number or checkbox (no longer handles drag)
   * PERF: Static styles in CSS (.vibegridx-row-header-cell), no inline styles needed
   */
  private createRowHeader(row: any, rowIndex: number): HTMLElement {
    const rowHeader = this.createElement('div', 'vibegridx-row-header-cell')
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
      allVisibleColumns.every((col) => selectedCells.has(`${row.id}:${col.id}`)) &&
      allVisibleColumns.length > 0

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
    rowElement.style.transform = `translateY(${rowIndex * ROW_HEIGHT}px)`
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
  createExpandedContentRowElement(
    expandedRow: any,
    rowIndex: number,
    parentRow: any,
  ): HTMLElement {
    const rowElement = this.createElement('div', 'vibegridx-row vibegridx-expanded-content-row')
    rowElement.dataset.rowId = expandedRow.id
    rowElement.dataset.parentRowId = expandedRow.parentRowId

    // PERF: Use transform for GPU-accelerated positioning
    rowElement.style.transform = `translateY(${rowIndex * ROW_HEIGHT}px)`
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
      background: var(--vibegrid-expanded-bg, #f9fafb);
      border-left: 2px solid var(--vibegrid-expanded-border, #e5e7eb);
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
    // Data is loaded - container will be populated by React component
    else if (expandedRow.expandedData && expandedRow.expandedData.length > 0) {
      // The content container is ready for React to mount the nested VibeGrid
      // Mark it with a data attribute so the React bridge can find it
      contentContainer.dataset.hasData = 'true'
      contentContainer.dataset.itemCount = String(expandedRow.expandedData.length)
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

  // ====================================
  // CELL RENDERING METHODS
  // ====================================

  /**
   * Create a cell element using the unified CellFactory
   */
  createCellElement(
    row: any,
    column: any,
    colIndex: number,
    xPosition?: number,
    widthOverride?: number,
  ): HTMLElement {
    // PERFORMANCE: Simplified cell creation using ModularCellBridge efficiently
    const rowData = row.data || row
    const value = rowData[column.id]

    if (this.modularCellBridge) {
      try {
        // PERF: Debug logging removed from hot path (was creating objects for every cell)

        // Use the unified CellFactory with column config
        const effectiveWidth =
          widthOverride ?? this.visualStateStore.columnWidths[column.id] ?? column.width ?? 150
        const columnForRender = {
          ...column,
          width: effectiveWidth,
          tableCoreStore: this.tableCoreStore,
          tableCore$: this.tableCoreStore,
        }

        const cellElement = this.modularCellBridge.createCell(value, columnForRender, rowData, {
          rowIndex: 0,
          columnIndex: colIndex,
          xPosition,
          width: effectiveWidth,
        })

        // Check if this cell is selected and apply selection class
        const cellId = `${row.id}:${column.id}`
        const isSelected = this.interactionStore.selectedCells.has(cellId)
        if (isSelected) {
          cellElement.classList.add('vibegridx-selected')
        }

        // Add interaction handlers that the CellFactory doesn't handle
        this.addCellInteractionHandlers(cellElement, row, column, rowData[column.id])

        return cellElement
      } catch (error) {
        fileLog.error('❌ [BODY-RENDERER] CellFactory failed - FAIL FAST', {
          error,
          columnId: column.id,
          fieldType: column.cellType || column.type,
        })
        throw error // Fail fast - don't use fallback
      }
    }

    // CellFactory must be available - no fallback allowed
    throw new Error('ModularCellBridge not available - field type system not initialized')
  }

  // Note: Basic cell fallback removed - CellFactory must work

  /**
   * Add interaction handlers to cell elements
   */
  private addCellInteractionHandlers(
    cellElement: HTMLElement,
    row: any,
    column: any,
    _value: any,
  ): void {
    // ✅ REMOVED: Old content click handler (now handled by CellActionRouter spatial detection)
    // CellActionRouter detects content vs padding clicks and routes accordingly:
    // - Content click → editSessionManager.start() (via CellActionRouter)
    // - Padding click → selection only (via SelectionService)

    // Set data attributes for InteractionCoordinator
    cellElement.setAttribute('data-row-id', row.id)
    cellElement.setAttribute('data-column-id', column.id)

    // Set test ID for automated testing
    cellElement.setAttribute('data-testid', `cell-${row.id}-${column.id}`)

    // Set field type metadata for CellActionRouter
    if (column.fieldType) {
      cellElement.setAttribute(
        'data-field-type',
        column.fieldType.type || column.cellType || 'text',
      )
    }
  }

  // Note: Cell formatting methods removed - now handled by unified CellFactory

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
    const checkboxStates = this.interactionStore.getRowCheckboxStates(
      processedRows,
      allVisibleColumns,
    )

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
          } else {
            cellElement.classList.remove('vibegridx-selected')
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
  updateCellValue(rowId: string, columnId: string, newValue: any, column: any): boolean {
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

    if (this.modularCellBridge) {
      try {
        const row = this.tableCoreStore.processedRows.find((r: any) => r.id === rowId)
        const rowData = row?.data || row

        if (!rowData) {
          fileLog.warn('Row data not found for cell update', { rowId, columnId })
          return false
        }

        const effectiveWidth = this.visualStateStore.columnWidths[column.id] ?? column.width ?? 150
        const columnForRender = {
          ...column,
          width: effectiveWidth,
          tableCoreStore: this.tableCoreStore,
          tableCore$: this.tableCoreStore,
        }

        // Use renderer's update method to preserve event listeners
        // This prevents losing hover handlers and other attached events
        this.modularCellBridge.updateCell(cellElement, newValue, columnForRender, rowData)

        fileLog.debug('✅ Cell value updated (granular)', {
          rowId,
          columnId,
          newValue,
          method: 'cell-level',
          fieldType: column.fieldType?.type || column.type,
        })

        return true
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
        const success = this.updateCellValue(rowId, columnId, newValue, column)

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

    const newRowElement = this.createRowElement(
      row,
      rowIndex,
      columns,
      columnVisibility,
      baseOffset,
    )

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
    rowElement.style.transform = `translateY(${newRowIndex * ROW_HEIGHT}px)`

    // 2. Update row ID
    const oldRowId = rowElement.dataset.rowId
    rowElement.dataset.rowId = newRow.id

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

    // 4. Update row header (row number or checkbox)
    const rowHeader = rowElement.querySelector('.vibegridx-row-header-cell')
    if (rowHeader) {
      const checkbox = rowHeader.querySelector('input[type="checkbox"]') as HTMLInputElement
      if (checkbox) {
        checkbox.dataset.rowId = newRow.id
        // Update checkbox state based on selection
        const allVisibleColumns = this.visualStateStore.visibleColumns
        const isSelected =
          this.interactionStore.getRowCheckboxStates([newRow], allVisibleColumns).get(newRow.id) ||
          false
        checkbox.checked = isSelected
      } else {
        // Update row number
        rowHeader.textContent = String(newRowIndex + 1)
      }
    }

    // 5. Update drag column
    const dragColumn = rowElement.querySelector('.vibegridx-drag-column')
    if (dragColumn) {
      ;(dragColumn as HTMLElement).dataset.rowId = newRow.id
    }

    // 6. Update cells - this is the main performance win
    const columnLayouts = precomputed?.columnLayouts ?? this.visualStateStore.visibleColumns
    const visibleColumnsOnly =
      precomputed?.visibleColumns ??
      columns.filter((col) => columnLayouts.some((l) => l.id === col.id))

    // Get all cells in the row
    const cells = rowElement.querySelectorAll('.vibegridx-cell')

    visibleColumnsOnly.forEach((column, colIndex) => {
      const cell = cells[colIndex] as HTMLElement
      if (!cell) return

      const value = rowData[column.id]

      // Update cell attributes
      cell.dataset.rowId = newRow.id

      // Update cell content using fast path
      this.updateCellContentFast(cell, value, column, rowData)
    })

    // Track in activeRows map (remove old, add new)
    if (oldRowId && oldRowId !== newRow.id) {
      this.activeRows.delete(oldRowId)
    }
    this.activeRows.set(newRow.id, rowElement)

    return rowElement
  }

  /**
   * 🚀 PERF: Fast cell content update without recreating DOM
   */
  private updateCellContentFast(cell: HTMLElement, value: any, column: any, rowData: any): void {
    // Clear existing content
    cell.innerHTML = ''

    // Use the field type renderer if available (fast path)
    if (column.fieldType?.renderer) {
      try {
        // CRITICAL: Enhance column with tableCoreStore like createCellElement does
        // Some renderers (UserReferenceFieldType) need this to look up user data
        const columnForRender = {
          ...column,
          tableCoreStore: this.tableCoreStore,
          tableCore$: this.tableCoreStore,
        }
        const content = column.fieldType.renderer.render(value, columnForRender, rowData)
        cell.appendChild(content)
        return
      } catch {
        // Fall through to formatter
      }
    }

    // Fallback to formatter
    if (column.formatter) {
      const displayValue = column.formatter(value, rowData, column)
      cell.textContent = displayValue
    } else {
      cell.textContent = value != null ? String(value) : ''
    }
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
    const cellUnderMouse = elementUnderMouse?.closest(
      '[data-row-id][data-column-id]',
    ) as HTMLElement

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
