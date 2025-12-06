/**
 * GanttViewStore - Computes Gantt bar positions from entity data
 *
 * Manages:
 * - Time scale (zoom level, visible range)
 * - Bar positions computed from row data
 * - Date field mapping (start/end fields)
 */

import { action, computed, makeObservable, observable, reaction } from 'mobx'
import type { SchemaRegistryStore } from '@/app/stores/domain/SchemaRegistryStore'
import type { IStore } from '@/app/stores/types'
import { getLogger } from '@/shared/lib/logging'
import type { DependencyMetadata } from '@/shared/types/dataforge'
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
}

export interface GanttFieldMapping {
  /** Field name for bar start date */
  startField: string
  /** Field name for bar end date */
  endField: string
  /** Field name for bar label */
  labelField: string
}

export interface GanttDependency {
  id: string
  sourceEntityId: string
  targetEntityId: string
  dependencyType: 'finish_to_start' | 'start_to_start' | 'finish_to_finish' | 'start_to_finish'
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

const DEFAULT_ROW_HEIGHT = 40 // Match GRID_DIMENSIONS.ROW_HEIGHT

// ====================================
// STORE
// ====================================

export class GanttViewStore implements IStore {
  // Dependencies
  private tableCoreStore: TableCoreStore | null = null
  private schemaRegistry: SchemaRegistryStore | null = null
  private entityType: string = ''
  private disposeSchemaReaction?: () => void
  private collection: any = null // TanStack DB collection for updates

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

  /** Today's date (for "today" line) */
  @observable today: Date = new Date()

  /** Dependencies between entities */
  @observable dependencies: GanttDependency[] = []

  /** Raw dependency metadata from schema */
  @observable dependencyMetadata: DependencyMetadata | null = null

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
  setSchemaRegistry(registry: SchemaRegistryStore, entityType: string): void {
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
        name: col.name || col.id,
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
        name: col.name || col.id,
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

      positions.push({
        rowId: row.id,
        left,
        width,
        top: currentTop,
        height: DEFAULT_ROW_HEIGHT - 8, // Padding
        startDate,
        endDate: effectiveEnd,
        label: String(rowData[this.fieldMapping.labelField] || ''),
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
  scrollToToday(): void {
    if (this.todayLinePosition !== null) {
      // Center today in viewport (assuming ~600px viewport)
      this.scrollLeft = Math.max(0, this.todayLinePosition - 300)
    }
  }

  // ====================================
  // COLLECTION (for entity updates)
  // ====================================

  /**
   * Set TanStack DB collection for entity updates during drag
   */
  setCollection(collection: any): void {
    this.collection = collection
    logger.info('Collection set on GanttViewStore')
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
    const newStartDate = previewBar.startDate.toISOString()
    const newEndDate = previewBar.endDate.toISOString()

    // CRITICAL: Clear drag state BEFORE the update to prevent stale preview
    // The optimistic update from collection.update() may trigger re-sorting
    // which would leave the preview bar stuck at the old position
    this.cancelDrag()

    // Persist to database
    if (this.collection && barId) {
      try {
        const updates: Record<string, string> = {}

        if (startChanged) {
          updates[this.fieldMapping.startField] = newStartDate
        }
        if (endChanged) {
          updates[this.fieldMapping.endField] = newEndDate
        }

        logger.info('Persisting bar drag changes', {
          barId,
          startChanged,
          endChanged,
          newStart: newStartDate,
          newEnd: newEndDate,
        })

        const tx = this.collection.update(barId, (draft: any) => {
          Object.assign(draft, updates)
          draft.updated_at = new Date().toISOString()
        })

        // Wait for persistence (drag state already cleared)
        await tx.isPersisted.promise
        logger.info('Bar drag changes persisted', { barId })
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
  // HELPERS
  // ====================================

  private parseDate(value: unknown): Date | null {
    if (!value) return null
    if (value instanceof Date) return value
    if (typeof value === 'string') {
      const parsed = new Date(value)
      return isNaN(parsed.getTime()) ? null : parsed
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
  }

  dispose(): void {
    this.disposeSchemaReaction?.()
    logger.info('GanttViewStore disposed')
  }
}
