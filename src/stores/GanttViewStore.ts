/**
 * GanttViewStore - Computes Gantt bar positions from entity data
 *
 * Manages:
 * - Time scale (zoom level, visible range)
 * - Bar positions computed from row data
 * - Date field mapping (start/end fields)
 */

import { action, computed, makeObservable, observable, reaction, runInAction } from 'mobx'
import type { Collection } from '@tanstack/db'
import type { IStore } from '@/app/stores/types'
import { getLogger } from '@/shared/lib/logging'
import type { CommandBus } from '@/systems/commands/CommandBus'
import {
  BatchUpdateEntityRecordsCommand,
  type FieldUpdate,
} from '@/systems/commands/dataforge/BatchUpdateEntityRecordsCommand'
import type { DependencyRecord } from '@/shared/data/db/collections/dependency-collection'
import type { DependencyMetadata } from '@/shared/types/dataforge'
import { calculateCascadeUpdates } from '../utils/cascade-scheduler'
import { calculateCriticalPath } from '../utils/critical-path'
import { wouldCreateCycle } from '../utils/dependency-validator'
import type { SchemaRegistryLike } from '../types'
import { formatFieldName } from '../column-defaults'
import type { TableCoreStore } from './TableCoreStore'

const logger = getLogger(['vibegrid', 'stores', 'GanttViewStore'])

// ====================================
// TYPES
// ====================================

export type ZoomLevel = 'day' | 'week' | 'month' | 'quarter'

export type DragMode = 'move' | 'resize-start' | 'resize-end' | null

export interface DragState {
  /** ID of the bar being dragged */
  barId: string | null
  /** Type of drag operation */
  mode: DragMode
  /** Original bar position when drag started */
  originalBar: BarPosition | null
  /** Current preview position during drag */
  previewBar: BarPosition | null
  /** Starting X position of the pointer */
  startX: number
  /** Is drag currently active */
  isDragging: boolean
}

export interface TimeScale {
  /** Pixels per day at current zoom */
  pixelsPerDay: number
  /** Start of visible range */
  startDate: Date
  /** End of visible range */
  endDate: Date
  /** Current zoom level */
  zoomLevel: ZoomLevel
}

/** Status option with color metadata from schema */
export interface StatusColorOption {
  value: string
  label: string
  color: string
  backgroundColor: string
}

export interface BarPosition {
  /** Row ID this bar belongs to */
  rowId: string
  /** Left position in pixels from timeline start */
  left: number
  /** Width in pixels */
  width: number
  /** Top position (from row) */
  top: number
  /** Height (matches row height) */
  height: number
  /** Original start date */
  startDate: Date
  /** Original end date */
  endDate: Date
  /** Bar label (typically task title) */
  label: string
  /** Progress percentage (0-100), null if not available */
  progress: number | null
  /** Status string for color coding, null if not available */
  status: string | null
  /** Background color for the bar (from status metadata) */
  statusColor: string | null
}

export interface GanttFieldMapping {
  /** Field name for bar start date */
  startField: string
  /** Field name for bar end date */
  endField: string
  /** Field name for bar label */
  labelField: string
  /** Field name for progress percentage (0-100), optional */
  progressField?: string
  /** Field name for status (for color coding), optional */
  statusField?: string
}

export interface GanttDependency {
  id: string
  sourceEntityId: string
  targetEntityId: string
  dependencyType: 'finish_to_start' | 'start_to_start' | 'finish_to_finish' | 'start_to_finish'
  /** Lag in days (positive = delay, negative = lead/overlap) */
  lagDays?: number
}

export type DependencyEdge = 'start' | 'end'

/**
 * Gantt display configuration from entity schema's business_metadata.gantt
 */
export interface GanttMetadata {
  /** Default bar shape for all entities of this type */
  barShape?: 'bar' | 'diamond' | 'circle' | 'arrow'
  /** Field name to determine shape dynamically per entity */
  barShapeField?: string
  /** Field name for progress percentage */
  progressField?: string
  /** Whether to show progress bar */
  showProgress?: boolean
}

// ====================================
// GANTT SORT & FILTER TYPES
// ====================================

export type GanttSortField = 'start_date' | 'end_date' | 'duration' | 'name'
export type GanttSortDirection = 'asc' | 'desc'
export type GanttQuickFilter = 'all' | 'today' | 'overdue' | 'this_week' | 'has_dependencies'

export interface GanttDateRangeFilter {
  start: Date | null
  end: Date | null
}

export interface DependencyDragState {
  /** Is dependency drag currently active */
  isDragging: boolean
  /** Source bar ID */
  sourceBarId: string | null
  /** Which edge the drag started from */
  sourceEdge: DependencyEdge | null
  /** Current mouse position (relative to timeline container) */
  currentX: number
  currentY: number
  /** Target bar ID if hovering over one */
  targetBarId: string | null
  /** Target edge if hovering over one */
  targetEdge: DependencyEdge | null
  /** ID of dependency being edited (null = creating new) */
  editingDependencyId: string | null
  /** Which end of the dependency is being dragged ('source' or 'target') */
  editingEnd: 'source' | 'target' | null
}

// ====================================
// CONSTANTS
// ====================================

const ZOOM_PIXELS_PER_DAY: Record<ZoomLevel, number> = {
  day: 50,
  week: 20,
  month: 6,
  quarter: 2,
}

const DEFAULT_ROW_HEIGHT = 34 // Match GRID_DIMENSIONS.ROW_HEIGHT — keep in sync with grid-dimensions.ts

// ====================================
// STORE
// ====================================

export class GanttViewStore implements IStore {
  // Dependencies
  private tableCoreStore: TableCoreStore | null = null
  private schemaRegistry: SchemaRegistryLike | null = null
  private entityType: string = ''
  private disposeSchemaReaction?: () => void
  private collection: Collection<any, any, any, any, any> | null = null // TanStack DB collection for entity updates
  private dependencyCollection: Collection<any, any, any, any, any> | null = null // TanStack DB collection for dependencies
  private commandBus: CommandBus | null = null // CommandBus for undo/redo tracking

  // ====================================
  // OBSERVABLE STATE
  // ====================================

  /** Current zoom level */
  @observable zoomLevel: ZoomLevel = 'week'

  /** Drag state for bar interactions */
  @observable dragState: DragState = {
    barId: null,
    mode: null,
    originalBar: null,
    previewBar: null,
    startX: 0,
    isDragging: false,
  }

  /** Scroll offset of timeline (horizontal) */
  @observable scrollLeft: number = 0

  /** Scroll offset of timeline (vertical) */
  @observable scrollTop: number = 0

  /** Field mapping for bar dates */
  @observable fieldMapping: GanttFieldMapping = {
    startField: 'start_date',
    endField: 'end_date',
    labelField: 'name',
  }

  /** Status color options from schema (value -> color mapping) */
  @observable statusColorMap: Map<string, StatusColorOption> = new Map()

  /** Today's date (for "today" line) */
  @observable today: Date = new Date()

  /** Dependencies between entities */
  @observable dependencies: GanttDependency[] = []

  /** Raw dependency metadata from schema */
  @observable dependencyMetadata: DependencyMetadata | null = null

  /** Drag state for creating new dependencies */
  @observable dependencyDragState: DependencyDragState = {
    isDragging: false,
    sourceBarId: null,
    sourceEdge: null,
    currentX: 0,
    currentY: 0,
    targetBarId: null,
    targetEdge: null,
    editingDependencyId: null,
    editingEnd: null,
  }

  // ====================================
  // GANTT-SPECIFIC SORT & FILTER STATE
  // ====================================

  /** Gantt sort field (independent of table sorting) */
  @observable ganttSortField: GanttSortField = 'start_date'

  /** Gantt sort direction */
  @observable ganttSortDirection: GanttSortDirection = 'asc'

  /** Active quick filter */
  @observable activeQuickFilter: GanttQuickFilter = 'all'

  /** Date range filter for Gantt view */
  @observable dateRangeFilter: GanttDateRangeFilter = {
    start: null,
    end: null,
  }

  /** Whether to show critical path highlighting */
  @observable showCriticalPath: boolean = false

  /** Set of row IDs on the critical path */
  @observable criticalPathIds: Set<string> = new Set()

  /** Gantt metadata from entity schema */
  @observable ganttMetadata: GanttMetadata | null = null

  constructor() {
    makeObservable(this)
    logger.info('GanttViewStore initialized')
  }

  // ====================================
  // DEPENDENCY INJECTION
  // ====================================

  setTableCoreStore(store: TableCoreStore): void {
    this.tableCoreStore = store
    logger.info('TableCoreStore injected into GanttViewStore')
  }

  /**
   * Set schema registry and entity type for loading dependencies
   * Sets up a reaction to automatically load dependencies when schema is ready
   */
  @action
  setSchemaRegistry(registry: SchemaRegistryLike, entityType: string): void {
    this.schemaRegistry = registry
    this.entityType = entityType

    // Dispose previous reaction if any
    this.disposeSchemaReaction?.()

    // Set up reaction to load dependencies when schema is ready
    this.disposeSchemaReaction = reaction(
      () => ({
        isReady: registry.isReady,
        schemas: registry.schemas,
      }),
      ({ isReady, schemas }) => {
        if (isReady && schemas) {
          this.loadDependenciesFromSchema()
        }
      },
      { fireImmediately: true },
    )

    logger.info('SchemaRegistry injected into GanttViewStore', { entityType })
  }

  /**
   * Load dependencies from the schema registry
   */
  @action
  private loadDependenciesFromSchema(): void {
    if (!this.schemaRegistry?.schemas || !this.entityType) return

    const schema = this.schemaRegistry.schemas.byName[this.entityType]
    if (!schema) {
      logger.debug('Schema not found for entity type', { entityType: this.entityType })
      return
    }

    const depMetadata = schema.dependencies
    if (!depMetadata || !depMetadata.supportsDependencies) {
      logger.debug('Entity type does not support dependencies', { entityType: this.entityType })
      this.dependencyMetadata = null
      this.dependencies = []
      return
    }

    // Store raw metadata
    this.dependencyMetadata = depMetadata

    // Convert to GanttDependency format
    const ganttDeps: GanttDependency[] = depMetadata.currentDependencies
      .filter((dep) => dep.sourceEntityType === this.entityType)
      .map((dep) => ({
        id: dep.id,
        sourceEntityId: dep.sourceEntityId,
        targetEntityId: dep.targetEntityId,
        dependencyType: dep.dependencyType,
      }))

    this.dependencies = ganttDeps
    logger.info('Dependencies loaded from schema', {
      entityType: this.entityType,
      count: ganttDeps.length,
      totalInMetadata: depMetadata.dependencyCount,
    })
  }

  // ====================================
  // COMPUTED: AVAILABLE DATE FIELDS
  // ====================================

  /**
   * Get list of date-compatible fields from the entity schema
   * These can be used for start/end date field mapping
   */
  @computed
  get availableDateFields(): Array<{ id: string; name: string; type: string }> {
    if (!this.tableCoreStore) return []

    const columns = this.tableCoreStore.columns
    const dateTypes = ['date', 'datetime', 'timestamp', 'date_range']

    return columns
      .filter((col) => {
        const colType = (col.type || col.cellType || '').toLowerCase()
        return dateTypes.includes(colType)
      })
      .map((col) => ({
        id: col.id,
        name: col.name || formatFieldName(col.id),
        type: col.type || col.cellType || 'date',
      }))
  }

  /**
   * Get list of text fields for label mapping
   */
  @computed
  get availableLabelFields(): Array<{ id: string; name: string }> {
    if (!this.tableCoreStore) return []

    const columns = this.tableCoreStore.columns
    const textTypes = ['text', 'string', 'longtext', 'textarea']

    return columns
      .filter((col) => {
        const colType = (col.type || col.cellType || '').toLowerCase()
        return textTypes.includes(colType) || col.id === 'name' || col.id === 'title'
      })
      .map((col) => ({
        id: col.id,
        name: col.name || formatFieldName(col.id),
      }))
  }

  // ====================================
  // COMPUTED: TIME SCALE
  // ====================================

  @computed
  get pixelsPerDay(): number {
    return ZOOM_PIXELS_PER_DAY[this.zoomLevel]
  }

  /**
   * Compute date range from all rows
   * Returns min start date and max end date with padding
   */
  @computed
  get dateRange(): { start: Date; end: Date } {
    if (!this.tableCoreStore) {
      const now = new Date()
      return {
        start: new Date(now.getFullYear(), now.getMonth(), 1),
        end: new Date(now.getFullYear(), now.getMonth() + 3, 0),
      }
    }

    const rows = this.tableCoreStore.processedRows
    let minDate: Date | null = null
    let maxDate: Date | null = null

    // Check if we're using a date_range field for start (which contains both dates)
    const useDateRangeForStart = this.isDateRangeField(this.fieldMapping.startField)

    for (const row of rows) {
      // VirtualRow has { type, id, data } structure - actual row data is in row.data
      const rowData = row.data || row

      let startDate: Date | null
      let endDate: Date | null

      if (useDateRangeForStart) {
        // Extract both dates from the date_range field
        const dateRange = this.parseDateRange(rowData[this.fieldMapping.startField])
        startDate = dateRange.start
        endDate = dateRange.end
      } else {
        // Use separate start and end fields
        startDate = this.parseDate(rowData[this.fieldMapping.startField])
        endDate = this.parseDate(rowData[this.fieldMapping.endField])
      }

      if (startDate) {
        if (!minDate || startDate < minDate) minDate = startDate
      }
      if (endDate) {
        if (!maxDate || endDate > maxDate) maxDate = endDate
      }
    }

    // Default to 3 months if no data
    const now = new Date()
    if (!minDate) minDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    if (!maxDate) maxDate = new Date(now.getFullYear(), now.getMonth() + 2, 0)

    // Add padding (1 week on each side)
    const paddedStart = new Date(minDate)
    paddedStart.setDate(paddedStart.getDate() - 7)
    const paddedEnd = new Date(maxDate)
    paddedEnd.setDate(paddedEnd.getDate() + 7)

    return { start: paddedStart, end: paddedEnd }
  }

  @computed
  get timeScale(): TimeScale {
    return {
      pixelsPerDay: this.pixelsPerDay,
      startDate: this.dateRange.start,
      endDate: this.dateRange.end,
      zoomLevel: this.zoomLevel,
    }
  }

  /**
   * Total width of timeline in pixels
   */
  @computed
  get timelineWidth(): number {
    const { start, end } = this.dateRange
    const days = this.daysBetween(start, end)
    return days * this.pixelsPerDay
  }

  // ====================================
  // COMPUTED: BAR POSITIONS
  // ====================================

  /**
   * Compute bar positions for all visible rows
   */
  @computed
  get barPositions(): BarPosition[] {
    if (!this.tableCoreStore) return []

    // Use table's processed rows - Gantt syncs to table state
    const rows = this.tableCoreStore.processedRows
    const positions: BarPosition[] = []
    const { start: timelineStart } = this.dateRange

    // Check if we're using a date_range field for start (which contains both dates)
    const useDateRangeForStart = this.isDateRangeField(this.fieldMapping.startField)

    let currentTop = 0

    for (const row of rows) {
      // VirtualRow has { type, id, data } structure - actual row data is in row.data
      const rowData = row.data || row

      let startDate: Date | null
      let endDate: Date | null

      if (useDateRangeForStart) {
        // Extract both dates from the date_range field
        const dateRange = this.parseDateRange(rowData[this.fieldMapping.startField])
        startDate = dateRange.start
        endDate = dateRange.end
      } else {
        // Use separate start and end fields
        startDate = this.parseDate(rowData[this.fieldMapping.startField])
        endDate = this.parseDate(rowData[this.fieldMapping.endField])
      }

      // Skip rows without valid dates
      if (!startDate || !endDate) {
        currentTop += DEFAULT_ROW_HEIGHT
        continue
      }

      // Ensure end is after start
      const effectiveEnd = endDate > startDate ? endDate : new Date(startDate.getTime() + 86400000) // +1 day

      const left = this.daysBetween(timelineStart, startDate) * this.pixelsPerDay
      const width = Math.max(this.daysBetween(startDate, effectiveEnd) * this.pixelsPerDay, 20) // Min 20px width

      // Extract progress if field is configured
      let progress: number | null = null
      if (this.fieldMapping.progressField) {
        const rawProgress = rowData[this.fieldMapping.progressField]
        if (typeof rawProgress === 'number') {
          progress = Math.max(0, Math.min(100, rawProgress))
        } else if (typeof rawProgress === 'string') {
          const parsed = parseFloat(rawProgress)
          if (!Number.isNaN(parsed)) {
            progress = Math.max(0, Math.min(100, parsed))
          }
        }
      }

      // Extract status if field is configured
      let status: string | null = null
      let statusColor: string | null = null
      if (this.fieldMapping.statusField) {
        const rawStatus = rowData[this.fieldMapping.statusField]
        if (rawStatus != null) {
          status = String(rawStatus).toLowerCase()
          // Look up color from status color map
          const statusOption = this.statusColorMap.get(status)
          if (statusOption) {
            statusColor = statusOption.backgroundColor
          }
        }
      }

      positions.push({
        rowId: row.id,
        left,
        width,
        top: currentTop,
        height: DEFAULT_ROW_HEIGHT - 8,
        startDate,
        endDate: effectiveEnd,
        label: String(rowData[this.fieldMapping.labelField] || ''),
        progress,
        status,
        statusColor,
      })

      currentTop += DEFAULT_ROW_HEIGHT
    }

    logger.debug('Computed bar positions', { count: positions.length })
    return positions
  }

  /**
   * Get bar position by row ID
   */
  getBarPosition(rowId: string): BarPosition | undefined {
    return this.barPositions.find((bar) => bar.rowId === rowId)
  }

  // ====================================
  // COMPUTED: TODAY LINE
  // ====================================

  @computed
  get todayLinePosition(): number | null {
    const { start, end } = this.dateRange
    if (this.today < start || this.today > end) return null
    return this.daysBetween(start, this.today) * this.pixelsPerDay
  }

  // ====================================
  // COMPUTED: GANTT SORTED & FILTERED ROWS
  // ====================================

  /**
   * Get rows sorted by Gantt-specific sort settings.
   * This is independent of the table's sort order.
   */
  @computed
  get ganttSortedRows(): any[] {
    if (!this.tableCoreStore) return []

    const rows = [...this.tableCoreStore.processedRows]
    const { ganttSortField, ganttSortDirection } = this

    return rows.sort((a, b) => {
      const aData = a.data || a
      const bData = b.data || b

      let aValue: any
      let bValue: any

      switch (ganttSortField) {
        case 'start_date':
          aValue = this.parseDate(aData[this.fieldMapping.startField])?.getTime() ?? 0
          bValue = this.parseDate(bData[this.fieldMapping.startField])?.getTime() ?? 0
          break
        case 'end_date':
          aValue = this.parseDate(aData[this.fieldMapping.endField])?.getTime() ?? 0
          bValue = this.parseDate(bData[this.fieldMapping.endField])?.getTime() ?? 0
          break
        case 'duration': {
          const aStart = this.parseDate(aData[this.fieldMapping.startField])
          const aEnd = this.parseDate(aData[this.fieldMapping.endField])
          const bStart = this.parseDate(bData[this.fieldMapping.startField])
          const bEnd = this.parseDate(bData[this.fieldMapping.endField])
          aValue = aStart && aEnd ? this.daysBetween(aStart, aEnd) : 0
          bValue = bStart && bEnd ? this.daysBetween(bStart, bEnd) : 0
          break
        }
        case 'name':
          aValue = String(aData[this.fieldMapping.labelField] || '').toLowerCase()
          bValue = String(bData[this.fieldMapping.labelField] || '').toLowerCase()
          break
        default:
          return 0
      }

      if (aValue < bValue) return ganttSortDirection === 'asc' ? -1 : 1
      if (aValue > bValue) return ganttSortDirection === 'asc' ? 1 : -1
      return 0
    })
  }

  /**
   * Get rows filtered by Gantt-specific quick filter and date range.
   * This builds on ganttSortedRows.
   */
  @computed
  get ganttFilteredRows(): any[] {
    let rows = this.ganttSortedRows

    // Apply quick filter
    if (this.activeQuickFilter !== 'all') {
      rows = rows.filter((row) => this.matchesQuickFilter(row))
    }

    // Apply date range filter
    if (this.dateRangeFilter.start || this.dateRangeFilter.end) {
      rows = rows.filter((row) => this.matchesDateRange(row))
    }

    return rows
  }

  /**
   * Check if a row matches the current quick filter
   */
  private matchesQuickFilter(row: any): boolean {
    const data = row.data || row
    const startDate = this.parseDate(data[this.fieldMapping.startField])
    const endDate = this.parseDate(data[this.fieldMapping.endField])
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    switch (this.activeQuickFilter) {
      case 'today':
        // Task spans today
        return startDate !== null && endDate !== null && startDate <= today && endDate >= today
      case 'overdue':
        // End date is before today
        return endDate !== null && endDate < today
      case 'this_week': {
        // Task overlaps with this week
        const weekEnd = new Date(today)
        weekEnd.setDate(weekEnd.getDate() + 7)
        return startDate !== null && endDate !== null && startDate <= weekEnd && endDate >= today
      }
      case 'has_dependencies':
        // Row has at least one dependency
        return this.dependencies.some((d) => d.sourceEntityId === row.id || d.targetEntityId === row.id)
      default:
        return true
    }
  }

  /**
   * Check if a row matches the date range filter
   */
  private matchesDateRange(row: any): boolean {
    const data = row.data || row
    const startDate = this.parseDate(data[this.fieldMapping.startField])
    const endDate = this.parseDate(data[this.fieldMapping.endField])

    // Row must have dates to be filtered
    if (!startDate || !endDate) return false

    const { start: filterStart, end: filterEnd } = this.dateRangeFilter

    // If filter start is set, task must end on or after it
    if (filterStart && endDate < filterStart) return false

    // If filter end is set, task must start on or before it
    if (filterEnd && startDate > filterEnd) return false

    return true
  }

  // ====================================
  // ACTIONS
  // ====================================

  @action
  setZoomLevel(level: ZoomLevel): void {
    if (this.zoomLevel === level) return
    logger.info('Zoom level changed', { from: this.zoomLevel, to: level })
    this.zoomLevel = level
  }

  @action
  zoomIn(): void {
    const levels: ZoomLevel[] = ['quarter', 'month', 'week', 'day']
    const currentIndex = levels.indexOf(this.zoomLevel)
    if (currentIndex < levels.length - 1) {
      this.setZoomLevel(levels[currentIndex + 1])
    }
  }

  @action
  zoomOut(): void {
    const levels: ZoomLevel[] = ['quarter', 'month', 'week', 'day']
    const currentIndex = levels.indexOf(this.zoomLevel)
    if (currentIndex > 0) {
      this.setZoomLevel(levels[currentIndex - 1])
    }
  }

  @action
  setScrollLeft(value: number): void {
    this.scrollLeft = Math.max(0, value)
  }

  @action
  setScrollTop(value: number): void {
    this.scrollTop = Math.max(0, value)
  }

  @action
  setScrollPosition(left: number, top: number): void {
    this.scrollLeft = Math.max(0, left)
    this.scrollTop = Math.max(0, top)
  }

  @action
  setFieldMapping(mapping: Partial<GanttFieldMapping>): void {
    this.fieldMapping = { ...this.fieldMapping, ...mapping }
    logger.info('Field mapping updated', { mapping: this.fieldMapping })
  }

  @action
  setDependencies(deps: GanttDependency[]): void {
    this.dependencies = deps
    logger.info('Dependencies updated', { count: deps.length })
  }

  @action
  setStatusColorMap(options: StatusColorOption[]): void {
    this.statusColorMap.clear()
    for (const opt of options) {
      this.statusColorMap.set(opt.value.toLowerCase(), opt)
    }
    logger.info('Status color map updated', { count: options.length })
  }

  @action
  scrollToToday(): void {
    if (this.todayLinePosition !== null) {
      // Center today in viewport (assuming ~600px viewport)
      this.scrollLeft = Math.max(0, this.todayLinePosition - 300)
    }
  }

  // ====================================
  // GANTT SORT & FILTER ACTIONS
  // ====================================

  /**
   * Set Gantt sort field and direction
   * @param field - The field to sort by
   * @param direction - Sort direction (optional, defaults to 'asc')
   */
  @action
  setGanttSort(field: GanttSortField, direction?: GanttSortDirection): void {
    this.ganttSortField = field
    this.ganttSortDirection = direction ?? 'asc'
    logger.info('Gantt sort updated', { field, direction: this.ganttSortDirection })
  }

  /**
   * Set the active quick filter
   */
  @action
  setQuickFilter(filter: GanttQuickFilter): void {
    this.activeQuickFilter = filter
    logger.info('Gantt quick filter updated', { filter })
  }

  /**
   * Set the date range filter
   */
  @action
  setDateRangeFilter(start: Date | null, end: Date | null): void {
    this.dateRangeFilter = { start, end }
    logger.info('Gantt date range filter updated', {
      start: start?.toISOString() ?? null,
      end: end?.toISOString() ?? null,
    })
  }

  /**
   * Clear all Gantt filters (reset to defaults)
   */
  @action
  clearFilters(): void {
    this.activeQuickFilter = 'all'
    this.dateRangeFilter = { start: null, end: null }
    logger.info('Gantt filters cleared')
  }

  /**
   * Toggle critical path highlighting
   */
  @action
  toggleCriticalPath(): void {
    this.showCriticalPath = !this.showCriticalPath
    if (this.showCriticalPath) {
      // Calculate critical path using forward/backward pass algorithm
      const criticalIds = calculateCriticalPath(this.barPositions, this.dependencies)
      this.criticalPathIds = new Set(criticalIds)
      logger.info('Critical path calculated', { count: criticalIds.length })
    } else {
      this.criticalPathIds.clear()
      logger.info('Critical path disabled')
    }
  }

  /**
   * Set Gantt metadata from entity schema's business_metadata
   */
  @action
  setGanttMetadata(metadata: GanttMetadata | null): void {
    this.ganttMetadata = metadata
    logger.info('Gantt metadata updated', { metadata })
  }

  /**
   * Get the bar shape for a specific row
   * Checks: 1) dynamic field value, 2) static config, 3) default 'rectangle'
   */
  getBarShapeForRow(rowData: Record<string, unknown>): 'rectangle' | 'diamond' | 'circle' {
    if (!this.ganttMetadata) return 'rectangle'

    // Check dynamic field first
    if (this.ganttMetadata.barShapeField) {
      const fieldValue = rowData[this.ganttMetadata.barShapeField]
      if (typeof fieldValue === 'string') {
        const shape = fieldValue.toLowerCase()
        if (shape === 'diamond' || shape === 'milestone') return 'diamond'
        if (shape === 'circle' || shape === 'event') return 'circle'
      }
    }

    // Fall back to static config
    if (this.ganttMetadata.barShape) {
      const shape = this.ganttMetadata.barShape
      if (shape === 'diamond') return 'diamond'
      if (shape === 'circle') return 'circle'
    }

    return 'rectangle'
  }

  // ====================================
  // COLLECTION (for entity updates)
  // ====================================

  /**
   * Set TanStack DB collection for entity updates during drag
   */
  setCollection(collection: Collection<any, any, any, any, any>): void {
    this.collection = collection
    logger.info('Collection set on GanttViewStore')
  }

  setCommandBus(commandBus: CommandBus): void {
    this.commandBus = commandBus
  }

  /**
   * Set TanStack DB collection for dependency CRUD with optimistic updates
   *
   * This enables:
   * - Optimistic create: Immediate UI update when creating dependencies
   * - Optimistic delete: Immediate UI update when deleting dependencies
   * - Automatic sync: TanStack DB handles persistence and rollback on error
   *
   * @param collection - TanStack DB dependency collection from useDependencyCollection
   */
  setDependencyCollection(collection: Collection<any, any, any, any, any> | null): void {
    this.dependencyCollection = collection
    logger.info('Dependency collection set on GanttViewStore', {
      hasCollection: !!collection,
    })
  }

  // ====================================
  // DRAG ACTIONS
  // ====================================

  /**
   * Start a drag operation on a bar
   */
  @action
  startDrag(barId: string, mode: DragMode, startX: number): void {
    const bar = this.barPositions.find((b) => b.rowId === barId)
    if (!bar) {
      logger.warn('Cannot start drag: bar not found', { barId })
      return
    }

    this.dragState = {
      barId,
      mode,
      originalBar: { ...bar },
      previewBar: { ...bar },
      startX,
      isDragging: true,
    }

    logger.debug('Drag started', { barId, mode, startX })
  }

  /**
   * Update the preview position during drag
   */
  @action
  updateDrag(currentX: number): void {
    if (!this.dragState.isDragging || !this.dragState.originalBar) return

    const deltaX = currentX - this.dragState.startX
    const deltaDays = Math.round(deltaX / this.pixelsPerDay)

    const original = this.dragState.originalBar
    const msPerDay = 24 * 60 * 60 * 1000

    let newStartDate: Date
    let newEndDate: Date

    switch (this.dragState.mode) {
      case 'move':
        // Move both dates by the same amount
        newStartDate = new Date(original.startDate.getTime() + deltaDays * msPerDay)
        newEndDate = new Date(original.endDate.getTime() + deltaDays * msPerDay)
        break

      case 'resize-start':
        // Only move start date (left edge)
        newStartDate = new Date(original.startDate.getTime() + deltaDays * msPerDay)
        newEndDate = original.endDate
        // Ensure start doesn't go past end
        if (newStartDate >= newEndDate) {
          newStartDate = new Date(newEndDate.getTime() - msPerDay)
        }
        break

      case 'resize-end':
        // Only move end date (right edge)
        newStartDate = original.startDate
        newEndDate = new Date(original.endDate.getTime() + deltaDays * msPerDay)
        // Ensure end doesn't go before start
        if (newEndDate <= newStartDate) {
          newEndDate = new Date(newStartDate.getTime() + msPerDay)
        }
        break

      default:
        return
    }

    // Calculate new position
    const { start: timelineStart } = this.dateRange
    const newLeft = this.daysBetween(timelineStart, newStartDate) * this.pixelsPerDay
    const newWidth = Math.max(this.daysBetween(newStartDate, newEndDate) * this.pixelsPerDay, 20)

    this.dragState.previewBar = {
      ...original,
      left: newLeft,
      width: newWidth,
      startDate: newStartDate,
      endDate: newEndDate,
    }
  }

  /**
   * End drag and persist changes to the database
   */
  @action
  async endDrag(): Promise<void> {
    if (!this.dragState.isDragging || !this.dragState.previewBar) {
      this.cancelDrag()
      return
    }

    const { barId, originalBar, previewBar } = this.dragState

    // Check if dates actually changed
    const startChanged = originalBar?.startDate.getTime() !== previewBar.startDate.getTime()
    const endChanged = originalBar?.endDate.getTime() !== previewBar.endDate.getTime()

    if (!startChanged && !endChanged) {
      logger.debug('Drag ended with no date changes')
      this.cancelDrag()
      return
    }

    // Capture values before clearing drag state
    const newStartDate = previewBar.startDate
    const newEndDate = previewBar.endDate

    // Calculate cascade updates BEFORE clearing drag state (needs current bar positions)
    const cascadeUpdates = calculateCascadeUpdates(barId!, newStartDate, newEndDate, this.dependencies, (id) => {
      const bar = this.barPositions.find((b) => b.rowId === id)
      return bar ? { id: bar.rowId, startDate: bar.startDate, endDate: bar.endDate } : undefined
    })

    // CRITICAL: Clear drag state BEFORE the update to prevent stale preview
    // The optimistic update from collection.update() may trigger re-sorting
    // which would leave the preview bar stuck at the old position
    this.cancelDrag()

    // Persist to database
    if (this.collection && barId) {
      try {
        const updates: Record<string, string> = {}

        if (startChanged) {
          updates[this.fieldMapping.startField] = newStartDate.toISOString()
        }
        if (endChanged) {
          updates[this.fieldMapping.endField] = newEndDate.toISOString()
        }

        logger.info('Persisting bar drag changes', {
          barId,
          startChanged,
          endChanged,
          newStart: newStartDate.toISOString(),
          newEnd: newEndDate.toISOString(),
          cascadeCount: cascadeUpdates.length,
        })

        // Build all field updates: main bar + cascades as one batch
        const entityName = this.tableCoreStore?.entityType ?? 'unknown'
        const allUpdates: FieldUpdate[] = []

        // Main bar updates
        if (startChanged) {
          allUpdates.push({
            recordId: barId,
            field: this.fieldMapping.startField,
            newValue: newStartDate.toISOString(),
            previousValue: originalBar?.startDate.toISOString() ?? null,
          })
        }
        if (endChanged) {
          allUpdates.push({
            recordId: barId,
            field: this.fieldMapping.endField,
            newValue: newEndDate.toISOString(),
            previousValue: originalBar?.endDate.toISOString() ?? null,
          })
        }

        // Cascade updates — capture previous values from current bar positions
        for (const cascade of cascadeUpdates) {
          const currentBar = this.barPositions.find((b) => b.rowId === cascade.entityId)
          allUpdates.push(
            {
              recordId: cascade.entityId,
              field: this.fieldMapping.startField,
              newValue: cascade.newStartDate.toISOString(),
              previousValue: currentBar?.startDate.toISOString() ?? null,
            },
            {
              recordId: cascade.entityId,
              field: this.fieldMapping.endField,
              newValue: cascade.newEndDate.toISOString(),
              previousValue: currentBar?.endDate.toISOString() ?? null,
            },
          )
        }

        if (this.commandBus) {
          // Single batch command — undo reverts main bar + all cascades atomically
          const cmd = new BatchUpdateEntityRecordsCommand()
          await this.commandBus.execute(cmd, {
            collection: this.collection,
            entityName,
            updates: allUpdates,
          })
        } else {
          // Direct fallback — apply all updates without undo tracking
          const promises = allUpdates.map((u) => {
            const tx = this.collection!.update(u.recordId, (draft: any) => {
              draft[u.field] = u.newValue
              draft.updated_at = new Date().toISOString()
            })
            return tx.isPersisted.promise
          })
          await Promise.all(promises)
        }

        logger.info('Bar drag changes persisted', {
          barId,
          cascadeCount: cascadeUpdates.length,
          totalUpdates: allUpdates.length,
          undoable: !!this.commandBus,
        })
      } catch (error) {
        logger.error('Failed to persist bar drag changes', {
          barId,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    } else {
      logger.warn('Cannot persist: no collection set', { barId })
    }
  }

  /**
   * Cancel drag without persisting changes
   */
  @action
  cancelDrag(): void {
    this.dragState = {
      barId: null,
      mode: null,
      originalBar: null,
      previewBar: null,
      startX: 0,
      isDragging: false,
    }
    logger.debug('Drag cancelled/ended')
  }

  // ====================================
  // DEPENDENCY DRAG ACTIONS
  // ====================================

  /**
   * Start dragging from a bar edge to create a dependency
   */
  @action
  startDependencyDrag(barId: string, edge: DependencyEdge, x: number, y: number): void {
    this.dependencyDragState = {
      isDragging: true,
      sourceBarId: barId,
      sourceEdge: edge,
      currentX: x,
      currentY: y,
      targetBarId: null,
      targetEdge: null,
      editingDependencyId: null,
      editingEnd: null,
    }
    logger.debug('Dependency drag started', { barId, edge, x, y })
  }

  /**
   * Start editing an existing dependency by dragging one of its endpoints
   * @param dependencyId - The dependency being edited
   * @param editEnd - Which end is being dragged ('source' = arrow start, 'target' = arrow end)
   * @param anchorBarId - The bar that stays fixed (the other end of the dependency)
   * @param x - Starting X position
   * @param y - Starting Y position
   */
  @action
  startDependencyEdit(
    dependencyId: string,
    editEnd: 'source' | 'target',
    anchorBarId: string,
    x: number,
    y: number,
  ): void {
    // When editing source, the anchor is the target (arrow points TO it)
    // When editing target, the anchor is the source (arrow comes FROM it)
    const anchorEdge: DependencyEdge = editEnd === 'source' ? 'start' : 'end'

    this.dependencyDragState = {
      isDragging: true,
      sourceBarId: anchorBarId,
      sourceEdge: anchorEdge,
      currentX: x,
      currentY: y,
      targetBarId: null,
      targetEdge: null,
      editingDependencyId: dependencyId,
      editingEnd: editEnd,
    }
    logger.debug('Dependency edit started', { dependencyId, editEnd, anchorBarId, x, y })
  }

  /**
   * Update dependency drag position and detect target
   */
  @action
  updateDependencyDrag(x: number, y: number, targetBarId?: string, targetEdge?: DependencyEdge): void {
    if (!this.dependencyDragState.isDragging) return

    this.dependencyDragState.currentX = x
    this.dependencyDragState.currentY = y
    this.dependencyDragState.targetBarId = targetBarId || null
    this.dependencyDragState.targetEdge = targetEdge || null
  }

  /**
   * End dependency drag and create/update the dependency if valid
   */
  @action
  async endDependencyDrag(): Promise<void> {
    const { sourceBarId, sourceEdge, targetBarId, targetEdge, editingDependencyId, editingEnd } =
      this.dependencyDragState

    // Validate we have a valid connection
    if (!sourceBarId || !targetBarId || sourceBarId === targetBarId) {
      logger.debug('Dependency drag ended without valid target', { sourceBarId, targetBarId })
      this.cancelDependencyDrag()
      return
    }

    // Handle editing existing dependency
    if (editingDependencyId && editingEnd) {
      await this.updateDependencyConnection(editingDependencyId, editingEnd, targetBarId)
      return
    }

    // Determine dependency type based on edges
    // For now, default to finish_to_start (most common)
    // sourceEdge = 'end' means "from the end of source" (finish)
    // targetEdge = 'start' means "to the start of target" (start)
    let dependencyType: GanttDependency['dependencyType'] = 'finish_to_start'

    if (sourceEdge === 'start' && targetEdge === 'start') {
      dependencyType = 'start_to_start'
    } else if (sourceEdge === 'end' && targetEdge === 'end') {
      dependencyType = 'finish_to_finish'
    } else if (sourceEdge === 'start' && targetEdge === 'end') {
      dependencyType = 'start_to_finish'
    }
    // Default: sourceEdge === 'end' && targetEdge === 'start' => finish_to_start

    // IMPORTANT: In our data model, "source depends_on target" means source WAITS for target.
    // When user drags from bar A's end to bar B's start, they mean "B depends on A"
    // (B cannot start until A finishes). So we SWAP the source/target:
    // - successorId (the bar you dragged TO) becomes the source (the one that waits)
    // - predecessorId (the bar you dragged FROM) becomes the target (must finish first)
    const successorId = targetBarId // The bar that will WAIT (dragged TO)
    const predecessorId = sourceBarId // The bar that must finish first (dragged FROM)

    // Check for cycle BEFORE creating dependency
    if (wouldCreateCycle(successorId, predecessorId, this.dependencies)) {
      logger.warn('Dependency would create a cycle, rejecting', {
        successorId,
        predecessorId,
      })
      this.cancelDependencyDrag()
      return
    }

    logger.info('Creating dependency', {
      predecessorId,
      successorId,
      sourceEdge,
      targetEdge,
      dependencyType,
    })

    // Clear drag state before creating
    this.cancelDependencyDrag()

    // Create the dependency using TanStack DB collection for optimistic updates
    if (this.dependencyCollection) {
      // Use collection.insert() for automatic optimistic update + persistence
      const tempId = `temp-dep-${Date.now()}`
      const newRecord: DependencyRecord = {
        id: tempId,
        sourceEntityType: this.entityType,
        sourceEntityId: successorId, // Successor = source (the one that depends/waits)
        targetEntityType: this.entityType,
        targetEntityId: predecessorId, // Predecessor = target (must complete first)
        relationshipType: 'depends_on',
        dependencyType,
        createdAt: new Date().toISOString(),
      }

      logger.info('Creating dependency via TanStack DB collection (optimistic)', {
        predecessorId,
        successorId,
        dependencyType,
      })

      const tx = this.dependencyCollection.insert(newRecord)

      // Also update local dependencies for immediate arrow rendering
      // (The live query from useLiveQuery will also update, but this ensures immediate feedback)
      runInAction(() => {
        const newDep: GanttDependency = {
          id: tempId,
          sourceEntityId: successorId,
          targetEntityId: predecessorId,
          dependencyType,
        }
        this.dependencies = [...this.dependencies, newDep]
      })

      // Wait for persistence and update with real ID
      tx.isPersisted.promise
        .then(() => {
          logger.info('Dependency persisted successfully', { tempId })
        })
        .catch((error: any) => {
          logger.error('Dependency creation failed, rolling back', {
            error: error?.message || 'Unknown error',
          })
          // Remove the optimistic dependency on error
          runInAction(() => {
            this.dependencies = this.dependencies.filter((d) => d.id !== tempId)
          })
        })
    } else {
      // Fallback: no collection available, log warning
      logger.warn('No dependency collection available - dependency not created')
    }
  }

  /**
   * Cancel dependency drag without creating
   */
  @action
  cancelDependencyDrag(): void {
    this.dependencyDragState = {
      isDragging: false,
      sourceBarId: null,
      sourceEdge: null,
      currentX: 0,
      currentY: 0,
      targetBarId: null,
      targetEdge: null,
      editingDependencyId: null,
      editingEnd: null,
    }
    logger.debug('Dependency drag cancelled')
  }

  /**
   * Update an existing dependency connection (reassign source or target)
   * @param dependencyId - The dependency being updated
   * @param editEnd - Which end was dragged ('source' or 'target')
   * @param newBarId - The new bar to connect to
   */
  @action
  async updateDependencyConnection(
    dependencyId: string,
    editEnd: 'source' | 'target',
    newBarId: string,
  ): Promise<void> {
    const existingDep = this.dependencies.find((d) => d.id === dependencyId)
    if (!existingDep) {
      logger.warn('Cannot update dependency - not found', { dependencyId })
      this.cancelDependencyDrag()
      return
    }

    // Determine new source/target based on which end was dragged
    // In our data model: sourceEntityId = successor (waits), targetEntityId = predecessor (must finish first)
    let newSourceEntityId: string
    let newTargetEntityId: string

    if (editEnd === 'source') {
      // Dragging the arrow tail (source = successor)
      newSourceEntityId = newBarId
      newTargetEntityId = existingDep.targetEntityId
    } else {
      // Dragging the arrow head (target = predecessor)
      newSourceEntityId = existingDep.sourceEntityId
      newTargetEntityId = newBarId
    }

    // Prevent self-referencing dependency
    if (newSourceEntityId === newTargetEntityId) {
      logger.debug('Cannot create self-referencing dependency')
      this.cancelDependencyDrag()
      return
    }

    // Check for cycle before updating
    const depsWithoutCurrent = this.dependencies.filter((d) => d.id !== dependencyId)
    if (wouldCreateCycle(newSourceEntityId, newTargetEntityId, depsWithoutCurrent)) {
      logger.warn('Updated dependency would create a cycle, rejecting', {
        dependencyId,
        newSourceEntityId,
        newTargetEntityId,
      })
      this.cancelDependencyDrag()
      return
    }

    logger.info('Updating dependency connection', {
      dependencyId,
      editEnd,
      oldSource: existingDep.sourceEntityId,
      oldTarget: existingDep.targetEntityId,
      newSource: newSourceEntityId,
      newTarget: newTargetEntityId,
    })

    // Store original for rollback
    const originalDeps = [...this.dependencies]

    // Optimistic update
    this.dependencies = this.dependencies.map((d) =>
      d.id === dependencyId ? { ...d, sourceEntityId: newSourceEntityId, targetEntityId: newTargetEntityId } : d,
    )

    // Clear drag state
    this.cancelDependencyDrag()

    // Persist via collection
    if (this.dependencyCollection) {
      try {
        const tx = this.dependencyCollection.update(dependencyId, (draft: any) => {
          draft.sourceEntityId = newSourceEntityId
          draft.targetEntityId = newTargetEntityId
        })
        await tx.isPersisted.promise
        logger.info('Dependency connection updated successfully', { dependencyId })
      } catch (error: any) {
        logger.error('Dependency update failed, rolling back', {
          error: error?.message || 'Unknown error',
        })
        // Rollback on error
        runInAction(() => {
          this.dependencies = originalDeps
        })
      }
    } else {
      logger.warn('No dependency collection available - update not persisted')
    }
  }

  /**
   * Selected dependency ID (for delete UI)
   */
  @observable selectedDependencyId: string | null = null

  /**
   * Select a dependency (for deletion or editing)
   */
  @action
  selectDependency(dependencyId: string | null): void {
    this.selectedDependencyId = dependencyId
    logger.debug('Dependency selected', { dependencyId })
  }

  /**
   * Delete a dependency by ID
   */
  @action
  async deleteDependency(dependencyId: string): Promise<void> {
    logger.info('Deleting dependency', { dependencyId })

    // Optimistic removal from local state
    const originalDeps = this.dependencies
    this.dependencies = this.dependencies.filter((d) => d.id !== dependencyId)

    // Clear selection if deleted
    if (this.selectedDependencyId === dependencyId) {
      this.selectedDependencyId = null
    }

    // Persist via collection
    if (this.dependencyCollection) {
      try {
        const tx = this.dependencyCollection.delete(dependencyId)
        await tx.isPersisted.promise
        logger.info('Dependency deleted successfully', { dependencyId })
      } catch (error: any) {
        logger.error('Dependency deletion failed, rolling back', {
          error: error?.message || 'Unknown error',
        })
        // Rollback on error
        runInAction(() => {
          this.dependencies = originalDeps
        })
      }
    } else {
      logger.warn('No dependency collection available - deletion not persisted')
    }
  }

  // ====================================
  // HELPERS
  // ====================================

  private parseDate(value: unknown): Date | null {
    if (!value) return null
    if (value instanceof Date) return value
    if (typeof value === 'string') {
      const parsed = new Date(value)
      return Number.isNaN(parsed.getTime()) ? null : parsed
    }
    if (typeof value === 'number') return new Date(value)
    return null
  }

  /**
   * Parse a date_range field value to extract start and end dates
   * Supports multiple formats:
   * - { start: Date, end: Date }
   * - { start_date: Date, end_date: Date }
   * - [startDate, endDate]
   * - "start/end" (ISO date strings separated by /)
   */
  private parseDateRange(value: unknown): { start: Date | null; end: Date | null } {
    if (!value) return { start: null, end: null }

    // Object format: { start: Date, end: Date } or { start_date, end_date }
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      const obj = value as Record<string, unknown>
      const start = this.parseDate(obj.start || obj.start_date || obj.startDate)
      const end = this.parseDate(obj.end || obj.end_date || obj.endDate)
      return { start, end }
    }

    // Array format: [startDate, endDate]
    if (Array.isArray(value) && value.length >= 2) {
      return {
        start: this.parseDate(value[0]),
        end: this.parseDate(value[1]),
      }
    }

    // String format: "2024-01-01/2024-01-31" (ISO dates separated by /)
    if (typeof value === 'string' && value.includes('/')) {
      const parts = value.split('/')
      if (parts.length >= 2) {
        return {
          start: this.parseDate(parts[0].trim()),
          end: this.parseDate(parts[1].trim()),
        }
      }
    }

    return { start: null, end: null }
  }

  /**
   * Get the column type for a field name
   */
  private getFieldType(fieldName: string): string | null {
    if (!this.tableCoreStore) return null
    const column = this.tableCoreStore.columns.find((col) => col.id === fieldName)
    return column?.type || column?.cellType || null
  }

  /**
   * Check if a field is a date_range type
   */
  private isDateRangeField(fieldName: string): boolean {
    const type = this.getFieldType(fieldName)
    return type?.toLowerCase() === 'date_range'
  }

  private daysBetween(start: Date, end: Date): number {
    const msPerDay = 24 * 60 * 60 * 1000
    return Math.ceil((end.getTime() - start.getTime()) / msPerDay)
  }

  // ====================================
  // IStore INTERFACE
  // ====================================

  init(): void {
    logger.info('GanttViewStore init called')
  }

  reset(): void {
    logger.info('GanttViewStore reset')
    this.zoomLevel = 'week'
    this.scrollLeft = 0
    this.scrollTop = 0
    this.today = new Date()
    this.cancelDrag()
    this.cancelDependencyDrag()
    // Reset Gantt sort/filter state
    this.ganttSortField = 'start_date'
    this.ganttSortDirection = 'asc'
    this.activeQuickFilter = 'all'
    this.dateRangeFilter = { start: null, end: null }
    this.showCriticalPath = false
    this.criticalPathIds.clear()
    this.ganttMetadata = null
  }

  dispose(): void {
    this.disposeSchemaReaction?.()
    logger.info('GanttViewStore disposed')
  }
}
