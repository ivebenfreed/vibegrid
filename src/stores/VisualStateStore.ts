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

import { makeObservable, observable, action, computed, runInAction } from 'mobx'
import { createLogger } from '@/shared/lib/logging'
import { DisposerManager } from '@/app/stores/utils/disposer'
import type { IStore } from '@/app/stores/types'
import type { Column, GroupConfig, SortConfig, FilterConfig, VirtualRow } from '../types'
import { GroupProcessor } from '../processors/GroupProcessor'
import type { VibeGridXCoordinateManager } from '../coordinates/VibeGridXCoordinateManager'

const log = createLogger('components/vibegrid/stores/VisualStateStore')

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

  private coordinateManager?: VibeGridXCoordinateManager

  // ====================================
  // LIFECYCLE
  // ====================================

  private disposers = new DisposerManager()

  constructor() {
    makeObservable(this)
  }

  /**
   * Set coordinate manager (dependency injection)
   */
  @action
  setCoordinateManager(manager: VibeGridXCoordinateManager): void {
    this.coordinateManager = manager
    log.info('Coordinate manager set on VisualStateStore')
  }

  /**
   * Initialize store with columns and context
   */
  @action
  async init(): Promise<void> {
    log.info('Initializing VisualStateStore')
    // Initialization logic will be added when integrating with parent component
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    this.disposers.dispose()
    log.info('VisualStateStore disposed')
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
    this.groupConfig = null
    this.entityType = ''
    this.orgId = ''
    this.userId = ''
    log.info('VisualStateStore reset to defaults')
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
      const column = this.columns.find(c => c.id === columnId)
      if (!column) return

      const width = this.columnWidths[columnId] || column.width || 150
      const visible = this.columnVisibility[columnId] !== false

      const layout: ColumnLayout = {
        id: columnId,
        width,
        xOffset: cumulativeX,
        visible,
        order: index
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
    return this.columnLayouts.filter(col => col.visible)
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
   * NOTE: Column virtualization is DISABLED to fix header/body sync issues
   * Always render ALL columns
   */
  @computed get visibleColumnRange(): { start: number; end: number } {
    // DISABLED: Column virtualization
    // Always render ALL columns to maintain sync between header and body
    return {
      start: 0,
      end: this.visibleColumns.length
    }
  }

  /**
   * Visible row range based on scroll position
   */
  @computed get visibleRowRange(): { start: number; end: number } {
    const startRowIndex = Math.floor(this.scrollTop / this.rowHeight)
    const endRowIndex = Math.min(
      this.rowCount,
      Math.ceil((this.scrollTop + Math.max(this.viewportHeight, 400)) / this.rowHeight) + 1 // +1 because slice() is exclusive of end
    )

    return {
      start: startRowIndex,
      end: endRowIndex
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
      visibleRowRange: this.visibleRowRange
    }
  }

  /**
   * Get ordered columns (respecting columnOrder)
   */
  @computed get orderedColumns(): Column[] {
    // Safety check: If columnOrder is empty but columns exist, use columns order
    const orderToUse = this.columnOrder.length > 0 ? this.columnOrder : this.columns.map(col => col.id)

    return orderToUse
      .map(id => this.columns.find(col => col.id === id))
      .filter((col): col is Column => col !== undefined)
  }

  /**
   * Get visible ordered columns
   */
  @computed get visibleOrderedColumns(): Column[] {
    return this.orderedColumns.filter(col => this.columnVisibility[col.id] !== false)
  }

  // ====================================
  // INITIALIZATION ACTIONS
  // ====================================

  /**
   * Initialize visual state with columns and context
   */
  @action
  initialize(columns: Column[], entityType: string, orgId: string, userId: string): void {
    const defaultWidths = Object.fromEntries(
      columns.map(col => [col.id, col.width || 150])
    )
    const defaultVisibility = Object.fromEntries(
      columns.map(col => [col.id, true])
    )
    const defaultOrder = columns.map(col => col.id)

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

    log.info('Visual state initialized', { entityType, columnCount: columns.length })
  }

  /**
   * Initialize columns with saved preferences
   */
  @action
  initializeColumns(
    columns: Column[],
    entityType: string,
    orgId: string,
    userId: string
  ): void {
    // NOTE: PersistenceStore loads preferences BEFORE this method is called.
    // We should only apply defaults for values that haven't been loaded yet.
    // Check if values already exist before overwriting them.

    // Only set columns if not already set
    if (this.columns.length === 0) {
      this.columns = columns
    }

    // Only set columnWidths if empty (PersistenceStore may have already loaded them)
    if (Object.keys(this.columnWidths).length === 0) {
      this.columnWidths = Object.fromEntries(columns.map(col => [col.id, col.width || 150]))
    }

    // Only set columnVisibility if empty (PersistenceStore may have already loaded them)
    if (Object.keys(this.columnVisibility).length === 0) {
      this.columnVisibility = Object.fromEntries(columns.map(col => [col.id, true]))
    }

    // Only set columnOrder if empty (PersistenceStore may have already loaded it)
    if (this.columnOrder.length === 0) {
      this.columnOrder = columns.map(col => col.id)
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

    // Initialize coordinate manager with columns
    // This ensures coordinator has column positions from the start
    this.coordinateManager?.updateColumns(this.orderedColumns)

    log.info('Columns initialized (preserving loaded preferences)', {
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
      coordinatorInitialized: !!this.coordinateManager
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
      [columnId]: width
    }

    // Update coordinate manager with new column positions (xOffsets changed due to width)
    this.coordinateManager?.updateColumns(this.orderedColumns)

    log.debug('Column width updated', { columnId, width })
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
    const column = this.columns.find(c => c.id === columnId)
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
      [columnId]: newVisibility
    }

    // Update coordinate manager with visible columns only
    this.coordinateManager?.updateColumns(this.visibleOrderedColumns)

    log.info('Column visibility toggled', { columnId, visible: newVisibility })
  }

  /**
   * Reorder columns
   */
  @action
  reorderColumns(sourceColumnId: string, targetColumnId: string, insertBefore: boolean = true): void {
    const currentOrder = [...this.columnOrder]
    const sourceIndex = currentOrder.indexOf(sourceColumnId)
    const targetIndex = currentOrder.indexOf(targetColumnId)

    if (sourceIndex === -1 || targetIndex === -1) {
      log.warn('Column reorder failed: column not found', {
        sourceColumnId,
        targetColumnId,
        sourceIndex,
        targetIndex
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

    // 🔧 KEY FIX: Update coordinate manager with new column order
    // This ensures selections and overlays track the new positions
    log.info('🔧 REORDER: About to notify coordinator', {
      hasCoordinateManager: !!this.coordinateManager,
      orderedColumnsCount: this.orderedColumns.length,
      orderedColumnIds: this.orderedColumns.map(c => c.id)
    })

    this.coordinateManager?.updateColumns(this.orderedColumns)

    log.info('Column reordered (coordinator notified)', {
      sourceColumnId,
      targetColumnId,
      insertBefore,
      newOrder: currentOrder,
      coordinatorNotified: !!this.coordinateManager
    })
  }

  /**
   * Reset all column preferences to defaults
   */
  @action
  resetColumns(): void {
    const defaultWidths = Object.fromEntries(this.columns.map(col => [col.id, col.width || 150]))
    const defaultVisibility = Object.fromEntries(this.columns.map(col => [col.id, true]))
    const defaultOrder = this.columns.map(col => col.id)

    this.columnWidths = defaultWidths
    this.columnVisibility = defaultVisibility
    this.columnOrder = defaultOrder

    log.info('Columns reset to defaults', { columnsCount: this.columns.length })
  }

  /**
   * Show all columns
   */
  @action
  showAllColumns(): void {
    const allVisible = Object.fromEntries(
      this.columns.map(col => [col.id, true])
    )

    this.columnVisibility = allVisible
    log.info('All columns shown', { columnCount: this.columns.length })
  }

  /**
   * Hide all columns except system columns
   */
  @action
  hideAllColumns(): void {
    const allHidden = Object.fromEntries(
      this.columns.map(col => [col.id, col.id === 'id' || col.id === '__selection'])
    )

    this.columnVisibility = allHidden
    log.info('All columns hidden (except system)', { columnCount: this.columns.length })
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

    log.debug('Viewport size updated', { width, height })
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

    log.debug('Scroll position updated', { scrollLeft, scrollTop })
  }

  /**
   * Handle viewport scroll with change detection
   */
  @action
  handleViewportScroll(scrollLeft: number, scrollTop: number, source: 'header' | 'body' = 'body'): void {
    // Skip update if values haven't changed
    if (this.scrollLeft === scrollLeft && this.scrollTop === scrollTop) {
      log.debug('Scroll event with same values - skipping update', { scrollLeft, scrollTop, source })
      return
    }

    this.scrollLeft = scrollLeft
    this.scrollTop = scrollTop

    log.debug('Viewport scrolled', { scrollLeft, scrollTop, source, changed: true })
  }

  /**
   * Update row count
   */
  @action
  setRowCount(count: number): void {
    this.rowCount = count
    log.debug('Row count updated', { count })
  }

  /**
   * Check if a specific column is in the visible viewport
   */
  isColumnInViewport(columnId: string): boolean {
    const column = this.columnLayouts.find(c => c.id === columnId)
    if (!column || !column.visible) return false

    return column.xOffset < this.scrollLeft + this.viewportWidth &&
           column.xOffset + column.width > this.scrollLeft
  }

  /**
   * Scroll to make a specific column visible
   */
  @action
  scrollToColumn(columnId: string): void {
    const column = this.columnLayouts.find(c => c.id === columnId)
    if (!column || !column.visible) return

    // Check if column is already visible
    if (column.xOffset >= this.scrollLeft &&
        column.xOffset + column.width <= this.scrollLeft + this.viewportWidth) {
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
    log.debug('Scrolled to column', { columnId, newScrollLeft })
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
    log.debug('Scrolled to row', { rowIndex, newScrollTop })
  }

  // ====================================
  // GROUPING OPERATIONS
  // ====================================

  /**
   * Set grouping configuration
   */
  @action
  setGroupConfig(config: GroupConfig | null): void {
    log.info('Setting group config', {
      config,
      hasFields: !!config?.fields,
      fieldsLength: config?.fields?.length,
      fields: config?.fields
    })

    this.groupConfig = config
    log.info('Group config updated', { config })
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
      log.warn('No groupConfig found, cannot toggle expansion')
      return
    }

    const expandedGroups = new Set(this.groupConfig.expandedGroups)
    const wasExpanded = expandedGroups.has(groupId)

    if (wasExpanded) {
      expandedGroups.delete(groupId)
      log.info('Group collapsed', { groupId })
    } else {
      expandedGroups.add(groupId)
      log.info('Group expanded', { groupId })
    }

    this.groupConfig = {
      ...this.groupConfig,
      expandedGroups
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
      expandedGroups: allGroupIds
    }

    log.info('All groups expanded', { count: allGroupIds.size })
  }

  /**
   * Collapse all groups
   */
  @action
  collapseAllGroups(): void {
    if (!this.groupConfig) return

    this.groupConfig = {
      ...this.groupConfig,
      expandedGroups: new Set()
    }

    log.info('All groups collapsed')
  }

  // ====================================
  // FILTERING OPERATIONS
  // ====================================

  /**
   * Set filter for a field
   */
  @action
  setFilter(field: string, value: any, operator: FilterConfig['operator'] = 'equals'): void {
    const existingIndex = this.filters.findIndex(f => f.field === field)
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

    log.debug('Filter updated', { field, value, operator })
  }

  /**
   * Remove filter for a field
   */
  @action
  removeFilter(field: string): void {
    this.filters = this.filters.filter(f => f.field !== field)
    log.debug('Filter removed', { field })
  }

  /**
   * Clear all filters
   */
  @action
  clearFilters(): void {
    this.filters = []
    log.debug('All filters cleared')
  }

  // ====================================
  // SORTING OPERATIONS
  // ====================================

  /**
   * Toggle sort for a field
   */
  @action
  toggleSort(field: string, isMultiSort: boolean = false): void {
    const existingIndex = this.sortBy.findIndex(s => s.field === field)

    log.info('toggleSort called', {
      field,
      isMultiSort,
      currentSortBy: this.sortBy,
      existingIndex
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
        this.sortBy = this.sortBy.filter(s => s.field !== field)
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

    log.info('Sort toggled', {
      field,
      isMultiSort,
      sortBy: this.sortBy
    })
  }

  /**
   * Set sort configuration
   */
  @action
  setSortBy(sortBy: SortConfig[]): void {
    this.sortBy = sortBy
    log.debug('Sort configuration set', { sortBy })
  }

  /**
   * Clear all sorting
   */
  @action
  clearSort(): void {
    this.sortBy = []
    log.debug('All sorting cleared')
  }

  // ====================================
  // PERSISTENCE OPERATIONS
  // ====================================

  /**
   * Load ALL saved preferences from localStorage
   */
  loadAllSavedPreferences(columns: Column[], entityType: string, orgId: string): {
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
          log.info('Extracted base entity type from prefixed entityType', {
            originalEntityType: entityType,
            extractedOrgId: firstPart,
            baseEntityType,
            providedOrgId: orgId
          })
        }
      }

      // Normalize entityType to match localStorage keys
      const normalizedEntityType = baseEntityType
        .replace(/([A-Z])/g, '-$1')
        .toLowerCase()
        .replace(/^-/, '')

      const storageKey = orgId ? `vibegrid-simple-${orgId}_${normalizedEntityType}` : `vibegrid-simple-${normalizedEntityType}`
      const stored = localStorage.getItem(storageKey)

      if (stored) {
        const parsed = JSON.parse(stored)
        log.info('Loading saved preferences from localStorage', {
          storageKey,
          hasColumnVisibility: !!parsed.columnVisibility,
          hasColumnWidths: !!parsed.columnWidths,
          hasColumnOrder: !!parsed.columnOrder,
          hasSortBy: !!parsed.sortBy,
          hasFilters: !!parsed.filters,
          hasGroupConfig: !!parsed.groupConfig
        })

        const parsedColumnOrder = Array.isArray(parsed.columnOrder) ? parsed.columnOrder : null

        return {
          columnVisibility: parsed.columnVisibility && typeof parsed.columnVisibility === 'object' ? parsed.columnVisibility : null,
          columnWidths: parsed.columnWidths && typeof parsed.columnWidths === 'object' ? parsed.columnWidths : null,
          columnOrder: parsedColumnOrder,
          sortBy: Array.isArray(parsed.sortBy) ? parsed.sortBy : null,
          filters: Array.isArray(parsed.filters) ? parsed.filters : null,
          groupConfig: parsed.groupConfig && parsed.groupConfig.fields && Array.isArray(parsed.groupConfig.fields) ? {
            ...parsed.groupConfig,
            expandedGroups: new Set(parsed.groupConfig.expandedGroups || [])
          } : null
        }
      }
    } catch (error) {
      log.warn('Failed to load preferences', { error })
    }

    return {
      columnVisibility: null,
      columnWidths: null,
      columnOrder: null,
      sortBy: null,
      filters: null,
      groupConfig: null
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
}
