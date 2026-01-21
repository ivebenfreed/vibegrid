/**
 * VisualStateStore - Visual State Management (MobX)
 *
 * Migrated from visual-state.ts (Legend State → MobX)
 *
 * This is the SINGLE SOURCE OF TRUTH for all visual aspects of the table:
 * - Column dimensions (widths, positions, visibility)
 * - Scroll state and viewport calculations
 * - Layout geometry (total dimensions, visible ranges)
 * - Visual synchronization between header and body
 * - Sorting, filtering, and grouping configuration
 *
 * All renderers, managers, and components should read from this store ONLY.
 */

import { action, computed, makeObservable, observable } from 'mobx'
import type { IStore } from '@/app/stores/types'
import { DisposerManager } from '@/app/stores/utils/disposer'
import { getLogger } from '@/shared/lib/logging'
import { GRID_DIMENSIONS } from '../constants/grid-dimensions'
import type { ObservableCoordinateManager } from '../coordinates/ObservableCoordinateManager'
import type { ModularCellBridge } from '../field-types/ModularCellBridge'
import type { Column, FilterConfig, GroupConfig, SortConfig } from '../types'
import type { FilterGroup } from '../types/filter-types'
import { assertInvariant } from '../utils/invariants'

const logger = getLogger(['vibegrid', 'stores', 'VisualStateStore'])

// ====================================
// TYPES
// ====================================

export interface ColumnLayout {
  id: string
  width: number
  xOffset: number
  visible: boolean
  order: number
}

export interface ViewportGeometry {
  // Viewport dimensions
  viewportWidth: number
  viewportHeight: number

  // Scroll positions
  scrollLeft: number
  scrollTop: number

  // Content dimensions
  totalWidth: number
  totalHeight: number

  // Visible ranges
  visibleColumnRange: { start: number; end: number }
  visibleRowRange: { start: number; end: number }
}

// ====================================
// STORE
// ====================================

/**
 * VisualStateStore - Manages all visual aspects of the grid
 *
 * Handles:
 * - Column layout (widths, visibility, order, positions)
 * - Viewport state (size, scroll position)
 * - Geometry calculations
 * - Sorting, filtering, grouping configuration
 * - Persistence (localStorage integration)
 */
export class VisualStateStore implements IStore {
  // ====================================
  // COLUMN STATE
  // ====================================

  @observable columns: Column[] = []
  @observable columnWidths: Record<string, number> = {}
  @observable columnVisibility: Record<string, boolean> = {}
  @observable columnOrder: string[] = []

  // ====================================
  // VIEWPORT STATE
  // ====================================

  @observable viewportWidth: number = 0
  @observable viewportHeight: number = 0
  @observable scrollLeft: number = 0
  @observable scrollTop: number = 0

  // ====================================
  // DATA DIMENSIONS
  // ====================================

  @observable rowCount: number = 0
  @observable rowHeight: number = 40
  @observable groupBy: any = null // Legacy grouping configuration

  // ====================================
  // VISUAL CONFIGURATION (Display Preferences)
  // ====================================

  @observable sortBy: SortConfig[] = []
  @observable filters: FilterConfig[] = []
  @observable filterGroup: FilterGroup | null = null
  @observable groupConfig: GroupConfig | null = null

  // ====================================
  // METADATA
  // ====================================

  @observable entityType: string = ''
  @observable orgId: string = ''
  @observable userId: string = ''

  // ====================================
  // DEPENDENCIES
  // ====================================

  private coordinateManager?: ObservableCoordinateManager
  private interactionStore?: import('./InteractionStore').InteractionStore
  private modularCellBridge: ModularCellBridge | null = null

  // ====================================
  // LIFECYCLE
  // ====================================

  private disposers = new DisposerManager()
  private tableCoreStore: any = null // TableCoreStore reference for offset calculations

  constructor() {
    makeObservable(this)
  }

  /**
   * Set table core store (dependency injection for variable-height virtual scrolling)
   */
  @action
  setTableCoreStore(store: any): void {
    this.tableCoreStore = store
    logger.info('TableCoreStore set on VisualStateStore')
  }

  /**
   * Set coordinate manager (dependency injection)
   */
  @action
  setCoordinateManager(manager: ObservableCoordinateManager): void {
    this.coordinateManager = manager
    logger.info('ObservableCoordinateManager set on VisualStateStore')
  }

  /**
   * Set interaction store (for clearing selections)
   */
  @action
  setInteractionStore(store: import('./InteractionStore').InteractionStore): void {
    this.interactionStore = store
    logger.info('Interaction store set on VisualStateStore')
  }

  /**
   * Set modular cell bridge for affordance precomputation.
   */
  @action
  setModularCellBridge(bridge: ModularCellBridge | null): void {
    this.modularCellBridge = bridge

    if (bridge && this.columns.length > 0) {
      bridge.precomputeAffordances(this.columns)
    }
  }

  getModularCellBridge(): ModularCellBridge | null {
    return this.modularCellBridge
  }

  /**
   * Initialize store with columns and context
   */
  @action
  async init(): Promise<void> {
    logger.info('Initializing VisualStateStore')
    // Initialization logic will be added when integrating with parent component
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    this.disposers.dispose()
    logger.info('VisualStateStore disposed')
  }

  /**
   * Reset to default state
   */
  @action
  reset(): void {
    this.columns = []
    this.columnWidths = {}
    this.columnVisibility = {}
    this.columnOrder = []
    this.viewportWidth = 0
    this.viewportHeight = 0
    this.scrollLeft = 0
    this.scrollTop = 0
    this.rowCount = 0
    this.rowHeight = 40
    this.sortBy = []
    this.filters = []
    this.filterGroup = null
    this.groupConfig = null
    this.entityType = ''
    this.orgId = ''
    this.userId = ''
    logger.info('VisualStateStore reset to defaults')
  }

  // ====================================
  // COMPUTED VALUES
  // ====================================

  /**
   * Column layouts with cumulative positioning
   */
  @computed get columnLayouts(): ColumnLayout[] {
    let cumulativeX = 70 // Start after drag column (30px) + row header (40px)
    const layouts: ColumnLayout[] = []

    this.columnOrder.forEach((columnId, index) => {
      const column = this.columns.find((c) => c.id === columnId)
      if (!column) return

      const width = this.columnWidths[columnId] || column.width || 150
      const visible = this.columnVisibility[columnId] !== false

      const layout: ColumnLayout = {
        id: columnId,
        width,
        xOffset: cumulativeX,
        visible,
        order: index,
      }

      layouts.push(layout)

      if (visible) {
        cumulativeX += width
      }
    })

    return layouts
  }

  /**
   * Visible columns only (filtered)
   */
  @computed get visibleColumns(): ColumnLayout[] {
    return this.columnLayouts.filter((col) => col.visible)
  }

  /**
   * Total width of all visible columns
   */
  @computed get totalColumnsWidth(): number {
    return this.visibleColumns.reduce((sum, col) => sum + col.width, 0)
  }

  /**
   * Total table width (including fixed columns)
   */
  @computed get totalWidth(): number {
    return 70 + this.totalColumnsWidth // drag column (30px) + row header (40px) + columns
  }

  /**
   * Total table height
   */
  @computed get totalHeight(): number {
    return this.rowCount * this.rowHeight
  }

  /**
   * Visible column range based on scroll position
   * 🚀 PERF: Column virtualization ENABLED - only render columns in viewport + buffer
   * Cells use absolute xOffset positioning, so they sync with header correctly
   */
  @computed get visibleColumnRange(): { start: number; end: number } {
    const columns = this.visibleColumns
    if (columns.length === 0) {
      return { start: 0, end: 0 }
    }

    const buffer = GRID_DIMENSIONS.BUFFER_COLUMNS // 2 columns buffer each side
    const scrollLeft = this.scrollLeft
    const viewportWidth = this.viewportWidth

    // Find first visible column (whose right edge is past scrollLeft)
    let start = 0
    for (let i = 0; i < columns.length; i++) {
      const col = columns[i]
      if (col.xOffset + col.width > scrollLeft) {
        start = Math.max(0, i - buffer)
        break
      }
    }

    // Find last visible column (whose left edge is before scrollLeft + viewportWidth)
    let end = columns.length
    for (let i = start; i < columns.length; i++) {
      const col = columns[i]
      if (col.xOffset > scrollLeft + viewportWidth) {
        end = Math.min(columns.length, i + buffer)
        break
      }
    }

    return { start, end }
  }

  /**
   * Visible row range based on scroll position (variable-height aware)
   * INCLUDES BUFFER_ROWS for smooth scrolling (render rows before they're visible)
   */
  @computed get visibleRowRange(): { start: number; end: number } {
    const buffer = GRID_DIMENSIONS.BUFFER_ROWS // 10 rows buffer

    // Use offset-based calculation for variable-height rows if available
    if (this.tableCoreStore?.findRowAtScrollPosition) {
      const visibleStart = this.tableCoreStore.findRowAtScrollPosition(this.scrollTop)
      const visibleEnd = Math.min(
        this.rowCount - 1,
        this.tableCoreStore.findRowAtScrollPosition(
          this.scrollTop + Math.max(this.viewportHeight, 400),
        ) + 1,
      )

      return {
        start: Math.max(0, visibleStart - buffer),
        end: Math.min(this.rowCount, visibleEnd + buffer),
      }
    }

    // Fallback to constant-height calculation if TableCoreStore not set
    const visibleStart = Math.floor(this.scrollTop / this.rowHeight)
    const visibleEnd =
      Math.ceil((this.scrollTop + Math.max(this.viewportHeight, 400)) / this.rowHeight) + 1

    return {
      start: Math.max(0, visibleStart - buffer),
      end: Math.min(this.rowCount, visibleEnd + buffer),
    }
  }

  /**
   * Complete viewport geometry
   */
  @computed get geometry(): ViewportGeometry {
    return {
      viewportWidth: this.viewportWidth,
      viewportHeight: this.viewportHeight,
      scrollLeft: this.scrollLeft,
      scrollTop: this.scrollTop,
      totalWidth: this.totalWidth,
      totalHeight: this.totalHeight,
      visibleColumnRange: this.visibleColumnRange,
      visibleRowRange: this.visibleRowRange,
    }
  }

  /**
   * Get ordered columns (respecting columnOrder)
   */
  @computed get orderedColumns(): Column[] {
    // Safety check: If columnOrder is empty but columns exist, use columns order
    const orderToUse =
      this.columnOrder.length > 0 ? this.columnOrder : this.columns.map((col) => col.id)

    return orderToUse
      .map((id) => this.columns.find((col) => col.id === id))
      .filter((col): col is Column => col !== undefined)
  }

  /**
   * Get visible ordered columns
   */
  @computed get visibleOrderedColumns(): Column[] {
    return this.orderedColumns.filter((col) => this.columnVisibility[col.id] !== false)
  }

  /**
   * Count of active filter conditions (recursive)
   */
  @computed get activeFilterCount(): number {
    if (!this.filterGroup) return 0
    return this.countConditions(this.filterGroup)
  }

  /**
   * Recursively count conditions in a filter group
   */
  private countConditions(group: FilterGroup): number {
    let count = 0
    for (const item of group.conditions) {
      if ('logic' in item) {
        // It's a nested FilterGroup
        count += this.countConditions(item)
      } else {
        // It's a FilterCondition
        count += 1
      }
    }
    return count
  }

  // ====================================
  // INITIALIZATION ACTIONS
  // ====================================

  /**
   * Initialize visual state with columns and context
   */
  @action
  initialize(columns: Column[], entityType: string, orgId: string, userId: string): void {
    const defaultWidths = Object.fromEntries(columns.map((col) => [col.id, col.width || 150]))
    // Respect column.hidden property - hide columns marked as hidden by default
    const defaultVisibility = Object.fromEntries(columns.map((col) => [col.id, !col.hidden]))
    const defaultOrder = columns.map((col) => col.id)

    this.columns = columns
    this.columnWidths = defaultWidths
    this.columnVisibility = defaultVisibility
    this.columnOrder = defaultOrder
    this.viewportWidth = 0
    this.viewportHeight = 0
    this.scrollLeft = 0
    this.scrollTop = 0
    this.rowCount = 0
    this.rowHeight = 40
    this.groupConfig = null
    this.sortBy = []
    this.filters = []
    this.entityType = entityType
    this.orgId = orgId
    this.userId = userId

    logger.info('Visual state initialized', { entityType, columnCount: columns.length })
  }

  /**
   * Initialize columns with saved preferences
   */
  @action
  initializeColumns(columns: Column[], entityType: string, orgId: string, userId: string): void {
    // NOTE: PersistenceStore loads preferences BEFORE this method is called.
    // We should only apply defaults for values that haven't been loaded yet.
    // Check if values already exist before overwriting them.

    // Always update columns from schema (schema is source of truth for column definitions)
    // This ensures new columns get added when schema changes
    this.columns = columns

    // Only set columnWidths if empty (PersistenceStore may have already loaded them)
    if (Object.keys(this.columnWidths).length === 0) {
      this.columnWidths = Object.fromEntries(columns.map((col) => [col.id, col.width || 150]))
    }

    // Only set columnVisibility if empty (PersistenceStore may have already loaded them)
    if (Object.keys(this.columnVisibility).length === 0) {
      // Respect column.hidden property - hide columns marked as hidden by default
      this.columnVisibility = Object.fromEntries(columns.map((col) => [col.id, !col.hidden]))
    }

    // Handle columnOrder - merge new columns that exist in schema but not in saved order
    if (this.columnOrder.length === 0) {
      // No saved order - use schema order
      this.columnOrder = columns.map((col) => col.id)
    } else {
      // Merge new columns: add any columns from schema that aren't in saved order
      const savedOrderSet = new Set(this.columnOrder)
      const newColumns = columns.filter((col) => !savedOrderSet.has(col.id)).map((col) => col.id)
      if (newColumns.length > 0) {
        // Append new columns to the end of the order
        this.columnOrder = [...this.columnOrder, ...newColumns]
        logger.info('Added new columns to order', { newColumns })
      }

      // Also add new columns to columnVisibility with default values
      for (const col of columns) {
        if (this.columnVisibility[col.id] === undefined) {
          this.columnVisibility[col.id] = !col.hidden
        }
        if (this.columnWidths[col.id] === undefined) {
          this.columnWidths[col.id] = col.width || 150
        }
      }

      // SCHEMA OVERRIDE: Ensure columns explicitly marked as visible (hidden: false)
      // are shown even if cached preferences had them hidden.
      // This handles cases where schema changed from hidden to visible.
      for (const col of columns) {
        if (col.hidden === false && this.columnVisibility[col.id] === false) {
          logger.info('Overriding cached visibility with schema default', {
            columnId: col.id,
            reason: 'Schema marks column as visible (hidden: false)',
          })
          this.columnVisibility[col.id] = true
        }
      }
    }

    // Only set groupConfig if null (PersistenceStore may have already loaded it)
    // groupConfig is intentionally left as-is if already set

    // Only set sortBy if empty (PersistenceStore may have already loaded it)
    // sortBy is intentionally left as-is if already set

    // Only set filters if empty (PersistenceStore may have already loaded it)
    // filters is intentionally left as-is if already set

    // Always set metadata
    this.entityType = entityType
    this.orgId = orgId
    this.userId = userId

    // 🔧 FIX: Initialize coordinator with visible columns and actual widths
    this.updateCoordinatorWithCurrentLayout()

    // 🚀 PERF: Pre-compute affordances for all columns at initialization time
    // This eliminates lazy affordance resolution during cell creation
    if (this.modularCellBridge) {
      this.modularCellBridge.precomputeAffordances(columns)
    }

    logger.info('Columns initialized (preserving loaded preferences)', {
      entityType,
      orgId,
      userId,
      columnsCount: columns.length,
      hasColumnWidths: Object.keys(this.columnWidths).length > 0,
      hasColumnVisibility: Object.keys(this.columnVisibility).length > 0,
      hasColumnOrder: this.columnOrder.length > 0,
      hasGroupConfig: !!this.groupConfig,
      hasSortBy: this.sortBy.length > 0,
      hasFilters: this.filters.length > 0,
      coordinatorInitialized: !!this.coordinateManager,
    })
  }

  // ====================================
  // COLUMN OPERATIONS
  // ====================================

  /**
   * Update column width
   */
  @action
  setColumnWidth(columnId: string, width: number): void {
    this.columnWidths = {
      ...this.columnWidths,
      [columnId]: width,
    }

    // 🔧 FIX: Use visibleOrderedColumns with actual widths, not schema defaults
    this.updateCoordinatorWithCurrentLayout()

    logger.debug('Column width updated', { columnId, width })
  }

  /**
   * Update column width during resize (convenience method)
   */
  @action
  updateColumnWidth(columnId: string, width: number): void {
    this.setColumnWidth(columnId, width)
  }

  /**
   * Get effective width for a column
   */
  getColumnWidth(columnId: string): number {
    // 1. Try persisted user preference
    if (this.columnWidths[columnId] != null) {
      return this.columnWidths[columnId]
    }

    // 2. Fall back to column schema default
    const column = this.columns.find((c) => c.id === columnId)
    if (column?.width != null) {
      return column.width
    }

    // 3. Final fallback
    return 150
  }

  /**
   * Toggle column visibility
   */
  @action
  toggleColumnVisibility(columnId: string): void {
    const newVisibility = !this.columnVisibility[columnId]

    this.columnVisibility = {
      ...this.columnVisibility,
      [columnId]: newVisibility,
    }

    // Clear selections on column operations (simpler UX)
    this.clearSelections()

    // Update coordinator with new layout
    this.updateCoordinatorWithCurrentLayout()

    logger.info('Column visibility toggled (selection cleared)', {
      columnId,
      visible: newVisibility,
    })
  }

  /**
   * Reorder columns
   */
  @action
  reorderColumns(
    sourceColumnId: string,
    targetColumnId: string,
    insertBefore: boolean = true,
  ): void {
    const currentOrder = [...this.columnOrder]
    const sourceIndex = currentOrder.indexOf(sourceColumnId)
    const targetIndex = currentOrder.indexOf(targetColumnId)

    if (sourceIndex === -1 || targetIndex === -1) {
      logger.warn('Column reorder failed: column not found', {
        sourceColumnId,
        targetColumnId,
        sourceIndex,
        targetIndex,
      })
      return
    }

    // Remove source column
    const [sourceColumn] = currentOrder.splice(sourceIndex, 1)

    // Recalculate target index after removal
    const adjustedTargetIndex = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex

    // Insert at appropriate position
    const insertIndex = insertBefore ? adjustedTargetIndex : adjustedTargetIndex + 1
    currentOrder.splice(insertIndex, 0, sourceColumn)

    this.columnOrder = currentOrder

    // Clear selections on column operations (simpler UX)
    this.clearSelections()

    // Update coordinator with new layout
    this.updateCoordinatorWithCurrentLayout()

    logger.info('Column reordered (selection cleared)', {
      sourceColumnId,
      targetColumnId,
      insertBefore,
      newOrder: currentOrder,
    })
  }

  /**
   * Update coordinator with current column layout
   * 🔧 KEY FIX: Send ONLY VISIBLE columns to coordinator
   * Hidden columns should not exist in the coordinate system at all
   */
  private updateCoordinatorWithCurrentLayout(): void {
    if (!this.coordinateManager) return

    const BASE_OFFSET = 70 // 30px drag + 40px checkbox

    // 🔧 CRITICAL: Only send VISIBLE columns to coordinator
    // Hidden columns should not exist in coordinate mapping
    // This ensures column indices match what's rendered in the DOM
    const layoutColumns = this.orderedColumns
      .filter((col) => this.columnVisibility[col.id] !== false)
      .map((col) => ({
        ...col,
        width: this.getColumnWidth(col.id),
      }))

    logger.info('🔧 Updating coordinator with VISIBLE columns only', {
      baseOffset: BASE_OFFSET,
      totalColumns: this.orderedColumns.length,
      visibleColumns: layoutColumns.length,
      hiddenColumns: this.orderedColumns.length - layoutColumns.length,
      columnIds: layoutColumns.map((c) => c.id),
      widths: layoutColumns.map((c) => c.width),
    })

    this.coordinateManager.updateColumns(layoutColumns, BASE_OFFSET)

    // Verify coordinator sync with visible columns
    assertInvariant(
      this.coordinateManager.getColumnCount() === layoutColumns.length,
      `Coordinator columns (${this.coordinateManager.getColumnCount()}) must match visible columns (${layoutColumns.length})`,
    )
  }

  /**
   * Reset all column preferences to defaults
   */
  @action
  resetColumns(): void {
    const defaultWidths = Object.fromEntries(this.columns.map((col) => [col.id, col.width || 150]))
    const defaultVisibility = Object.fromEntries(this.columns.map((col) => [col.id, true]))
    const defaultOrder = this.columns.map((col) => col.id)

    this.columnWidths = defaultWidths
    this.columnVisibility = defaultVisibility
    this.columnOrder = defaultOrder

    logger.info('Columns reset to defaults', { columnsCount: this.columns.length })
  }

  /**
   * Show all columns
   */
  @action
  showAllColumns(): void {
    const allVisible = Object.fromEntries(this.columns.map((col) => [col.id, true]))

    this.columnVisibility = allVisible
    logger.info('All columns shown', { columnCount: this.columns.length })
  }

  /**
   * Hide all columns except system columns
   */
  @action
  hideAllColumns(): void {
    const allHidden = Object.fromEntries(
      this.columns.map((col) => [col.id, col.id === 'id' || col.id === '__selection']),
    )

    this.columnVisibility = allHidden
    logger.info('All columns hidden (except system)', { columnCount: this.columns.length })
  }

  // ====================================
  // VIEWPORT OPERATIONS
  // ====================================

  /**
   * Update viewport size
   */
  @action
  setViewportSize(width: number, height: number): void {
    this.viewportWidth = width
    this.viewportHeight = height

    logger.debug('Viewport size updated', { width, height })
  }

  /**
   * Update viewport dimensions (alias)
   */
  @action
  updateViewportDimensions(width: number, height: number): void {
    this.setViewportSize(width, height)
  }

  /**
   * Update scroll position
   */
  @action
  setScrollPosition(scrollLeft: number, scrollTop: number): void {
    this.scrollLeft = scrollLeft
    this.scrollTop = scrollTop

    logger.debug('Scroll position updated', { scrollLeft, scrollTop })
  }

  /**
   * Handle viewport scroll with change detection
   */
  @action
  handleViewportScroll(
    scrollLeft: number,
    scrollTop: number,
    source: 'header' | 'body' = 'body',
  ): void {
    // Skip update if values haven't changed
    if (this.scrollLeft === scrollLeft && this.scrollTop === scrollTop) {
      logger.debug('Scroll event with same values - skipping update', {
        scrollLeft,
        scrollTop,
        source,
      })
      return
    }

    this.scrollLeft = scrollLeft
    this.scrollTop = scrollTop

    logger.debug('Viewport scrolled', { scrollLeft, scrollTop, source, changed: true })
  }

  /**
   * Update row count
   */
  @action
  setRowCount(count: number): void {
    this.rowCount = count
    logger.debug('Row count updated', { count })
  }

  /**
   * Check if a specific column is in the visible viewport
   */
  isColumnInViewport(columnId: string): boolean {
    const column = this.columnLayouts.find((c) => c.id === columnId)
    if (!column || !column.visible) return false

    return (
      column.xOffset < this.scrollLeft + this.viewportWidth &&
      column.xOffset + column.width > this.scrollLeft
    )
  }

  /**
   * Scroll to make a specific column visible
   */
  @action
  scrollToColumn(columnId: string): void {
    const column = this.columnLayouts.find((c) => c.id === columnId)
    if (!column || !column.visible) return

    // Check if column is already visible
    if (
      column.xOffset >= this.scrollLeft &&
      column.xOffset + column.width <= this.scrollLeft + this.viewportWidth
    ) {
      return // Already visible
    }

    // Scroll to make column visible
    let newScrollLeft = this.scrollLeft
    if (column.xOffset < this.scrollLeft) {
      // Column is to the left of viewport
      newScrollLeft = column.xOffset
    } else if (column.xOffset + column.width > this.scrollLeft + this.viewportWidth) {
      // Column is to the right of viewport
      newScrollLeft = column.xOffset + column.width - this.viewportWidth
    }

    this.scrollLeft = newScrollLeft
    logger.debug('Scrolled to column', { columnId, newScrollLeft })
  }

  /**
   * Scroll to make a specific row visible
   */
  @action
  scrollToRow(rowIndex: number): void {
    const rowTop = rowIndex * this.rowHeight
    const rowBottom = rowTop + this.rowHeight

    // Check if row is already visible
    if (rowTop >= this.scrollTop && rowBottom <= this.scrollTop + this.viewportHeight) {
      return // Already visible
    }

    // Scroll to make row visible
    let newScrollTop = this.scrollTop
    if (rowTop < this.scrollTop) {
      // Row is above viewport
      newScrollTop = rowTop
    } else if (rowBottom > this.scrollTop + this.viewportHeight) {
      // Row is below viewport
      newScrollTop = rowBottom - this.viewportHeight
    }

    this.scrollTop = newScrollTop
    logger.debug('Scrolled to row', { rowIndex, newScrollTop })
  }

  // ====================================
  // GROUPING OPERATIONS
  // ====================================

  /**
   * Set grouping configuration
   */
  @action
  setGroupConfig(config: GroupConfig | null): void {
    logger.info('Setting group config', {
      config,
      hasFields: !!config?.fields,
      fieldsLength: config?.fields?.length,
      fields: config?.fields,
    })

    // Clear selections on grouping changes (layout changes significantly)
    this.clearSelections()

    this.groupConfig = config

    logger.info('Group config updated (selection cleared)', { config })
  }

  /**
   * Clear all selections (helper for column operations)
   */
  private clearSelections(): void {
    if (this.interactionStore) {
      this.interactionStore.clearSelection()
      logger.info('🔄 Selections cleared due to column operation')
    }
  }

  /**
   * Get current grouping configuration
   */
  getGroupConfig(): GroupConfig | null {
    return this.groupConfig
  }

  /**
   * Toggle group expansion/collapse
   */
  @action
  toggleGroupExpansion(groupId: string): void {
    if (!this.groupConfig) {
      logger.warn('No groupConfig found, cannot toggle expansion')
      return
    }

    const expandedGroups = new Set(this.groupConfig.expandedGroups)
    const wasExpanded = expandedGroups.has(groupId)

    if (wasExpanded) {
      expandedGroups.delete(groupId)
      logger.info('Group collapsed', { groupId })
    } else {
      expandedGroups.add(groupId)
      logger.info('Group expanded', { groupId })
    }

    this.groupConfig = {
      ...this.groupConfig,
      expandedGroups,
    }
  }

  /**
   * Expand all groups
   */
  @action
  expandAllGroups(allGroupIds: Set<string>): void {
    if (!this.groupConfig) return

    this.groupConfig = {
      ...this.groupConfig,
      expandedGroups: allGroupIds,
    }

    logger.info('All groups expanded', { count: allGroupIds.size })
  }

  /**
   * Collapse all groups
   */
  @action
  collapseAllGroups(): void {
    if (!this.groupConfig) return

    this.groupConfig = {
      ...this.groupConfig,
      expandedGroups: new Set(),
    }

    logger.info('All groups collapsed')
  }

  // ====================================
  // FILTERING OPERATIONS
  // ====================================

  /**
   * Set filter for a field
   */
  @action
  setFilter(field: string, value: any, operator: FilterConfig['operator'] = 'equals'): void {
    const existingIndex = this.filters.findIndex((f) => f.field === field)
    const newFilter: FilterConfig = { field, value, operator }

    if (existingIndex >= 0) {
      // Update existing filter
      const updatedFilters = [...this.filters]
      updatedFilters[existingIndex] = newFilter
      this.filters = updatedFilters
    } else {
      // Add new filter
      this.filters = [...this.filters, newFilter]
    }

    logger.debug('Filter updated', { field, value, operator })
  }

  /**
   * Remove filter for a field
   */
  @action
  removeFilter(field: string): void {
    this.filters = this.filters.filter((f) => f.field !== field)
    logger.debug('Filter removed', { field })
  }

  /**
   * Clear all filters
   */
  @action
  clearFilters(): void {
    this.filters = []
    logger.debug('All filters cleared')
  }

  /**
   * Apply a filter group (GH#216: Multi-Level Advanced Filtering)
   *
   * This sets the active filterGroup used to filter the grid data.
   * Called when the user clicks "Apply" in the FilterBuilder.
   */
  @action
  applyFilterGroup(group: FilterGroup | null): void {
    this.filterGroup = group

    logger.info('Filter group applied', {
      hasGroup: !!group,
      conditionCount: group ? this.countConditions(group) : 0,
    })
  }

  /**
   * Clear the active filter group
   */
  @action
  clearFilterGroup(): void {
    this.filterGroup = null

    logger.info('Filter group cleared')
  }

  // ====================================
  // SORTING OPERATIONS
  // ====================================

  /**
   * Toggle sort for a field
   */
  @action
  toggleSort(field: string, isMultiSort: boolean = false): void {
    const existingIndex = this.sortBy.findIndex((s) => s.field === field)

    logger.info('toggleSort called', {
      field,
      isMultiSort,
      currentSortBy: this.sortBy,
      existingIndex,
    })

    if (existingIndex >= 0) {
      const currentSort = this.sortBy[existingIndex]
      if (currentSort.direction === 'asc') {
        // Switch to desc
        const updatedSort = [...this.sortBy]
        updatedSort[existingIndex] = { field, direction: 'desc' }
        this.sortBy = updatedSort
      } else {
        // Remove sort
        this.sortBy = this.sortBy.filter((s) => s.field !== field)
      }
    } else {
      // Add new sort (asc)
      const newSort: SortConfig = { field, direction: 'asc' }

      if (isMultiSort) {
        // Multi-sort: add to existing sorts
        this.sortBy = [...this.sortBy, newSort]
      } else {
        // Single sort: replace existing sorts
        this.sortBy = [newSort]
      }
    }

    // Clear selections when row order changes
    this.clearSelections()

    logger.info('Sort toggled (selection cleared)', {
      field,
      isMultiSort,
      sortBy: this.sortBy,
    })
  }

  /**
   * Set sort configuration
   */
  @action
  setSortBy(sortBy: SortConfig[]): void {
    this.sortBy = sortBy
    logger.debug('Sort configuration set', { sortBy })
  }

  /**
   * Clear all sorting
   */
  @action
  clearSort(): void {
    this.sortBy = []
    logger.debug('All sorting cleared')
  }

  // ====================================
  // PERSISTENCE OPERATIONS
  // ====================================

  /**
   * Load ALL saved preferences from localStorage
   */
  loadAllSavedPreferences(
    _columns: Column[],
    entityType: string,
    orgId: string,
  ): {
    columnVisibility: Record<string, boolean> | null
    columnWidths: Record<string, number> | null
    columnOrder: string[] | null
    sortBy: SortConfig[] | null
    filters: FilterConfig[] | null
    groupConfig: GroupConfig | null
  } {
    try {
      // Extract base entity name if entityType already has org prefix
      let baseEntityType = entityType

      if (entityType.includes('_') && entityType.length > 36) {
        const parts = entityType.split('_')
        const firstPart = parts[0]

        if (firstPart.length === 36 && firstPart.includes('-')) {
          baseEntityType = parts.slice(1).join('_')
          logger.info('Extracted base entity type from prefixed entityType', {
            originalEntityType: entityType,
            extractedOrgId: firstPart,
            baseEntityType,
            providedOrgId: orgId,
          })
        }
      }

      // Normalize entityType to match localStorage keys
      const normalizedEntityType = baseEntityType
        .replace(/([A-Z])/g, '-$1')
        .toLowerCase()
        .replace(/^-/, '')

      const storageKey = orgId
        ? `vibegrid-simple-${orgId}_${normalizedEntityType}`
        : `vibegrid-simple-${normalizedEntityType}`
      const stored = localStorage.getItem(storageKey)

      if (stored) {
        const parsed = JSON.parse(stored)
        logger.info('Loading saved preferences from localStorage', {
          storageKey,
          hasColumnVisibility: !!parsed.columnVisibility,
          hasColumnWidths: !!parsed.columnWidths,
          hasColumnOrder: !!parsed.columnOrder,
          hasSortBy: !!parsed.sortBy,
          hasFilters: !!parsed.filters,
          hasGroupConfig: !!parsed.groupConfig,
        })

        const parsedColumnOrder = Array.isArray(parsed.columnOrder) ? parsed.columnOrder : null

        return {
          columnVisibility:
            parsed.columnVisibility && typeof parsed.columnVisibility === 'object'
              ? parsed.columnVisibility
              : null,
          columnWidths:
            parsed.columnWidths && typeof parsed.columnWidths === 'object'
              ? parsed.columnWidths
              : null,
          columnOrder: parsedColumnOrder,
          sortBy: Array.isArray(parsed.sortBy) ? parsed.sortBy : null,
          filters: Array.isArray(parsed.filters) ? parsed.filters : null,
          groupConfig:
            parsed.groupConfig &&
            parsed.groupConfig.fields &&
            Array.isArray(parsed.groupConfig.fields)
              ? {
                  ...parsed.groupConfig,
                  expandedGroups: new Set(parsed.groupConfig.expandedGroups || []),
                }
              : null,
        }
      }
    } catch (error) {
      logger.warn('Failed to load preferences', { error })
    }

    return {
      columnVisibility: null,
      columnWidths: null,
      columnOrder: null,
      sortBy: null,
      filters: null,
      groupConfig: null,
    }
  }

  /**
   * Get visible column range
   */
  getVisibleColumnRange(): { start: number; end: number } {
    return this.visibleColumnRange
  }

  /**
   * Get visible row range
   */
  getVisibleRowRange(): { start: number; end: number } {
    return this.visibleRowRange
  }

  /**
   * Readable state for agent context
   * JSON-serializable snapshot of visual configuration
   */
  @computed get readableState(): VisualStateReadableState {
    // Extract flat conditions from FilterGroup (which may have nested groups)
    const flattenConditions = (
      group: FilterGroup | null,
    ): Array<{ field: string; operator: string; value: unknown }> => {
      if (!group) return []
      const result: Array<{ field: string; operator: string; value: unknown }> = []
      for (const item of group.conditions) {
        if ('logic' in item) {
          // It's a nested FilterGroup - recursively flatten
          result.push(...flattenConditions(item))
        } else {
          // It's a FilterCondition
          result.push({
            field: item.field,
            operator: item.operator,
            value: item.value,
          })
        }
      }
      return result
    }

    return {
      filters: flattenConditions(this.filterGroup),
      filterCount: this.activeFilterCount,
      sortBy:
        this.sortBy?.map((s) => ({
          field: s.field,
          direction: s.direction,
        })) ?? [],
      groupConfig: this.groupConfig
        ? {
            field: this.groupConfig.fields?.[0]?.field ?? '',
            collapsed: this.groupConfig.expandedGroups?.size === 0,
          }
        : null,
    }
  }
}

/**
 * Readable state interface for VisualStateStore
 */
export interface VisualStateReadableState {
  filters: Array<{ field: string; operator: string; value: unknown }>
  filterCount: number
  sortBy: Array<{ field: string; direction: 'asc' | 'desc' }>
  groupConfig: { field: string; collapsed: boolean } | null
}
