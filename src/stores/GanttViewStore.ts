/**
 * GanttViewStore - Computes Gantt bar positions from entity data
 *
 * Manages:
 * - Time scale (zoom level, visible range)
 * - Bar positions computed from row data
 * - Date field mapping (start/end fields)
 */

import { action, computed, makeObservable, observable } from 'mobx'
import type { IStore } from '@/app/stores/types'
import { getLogger } from '@/shared/lib/logging'
import type { TableCoreStore } from './TableCoreStore'

const logger = getLogger(['vibegrid', 'stores', 'GanttViewStore'])

// ====================================
// TYPES
// ====================================

export type ZoomLevel = 'day' | 'week' | 'month' | 'quarter'

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

// ====================================
// CONSTANTS
// ====================================

const ZOOM_PIXELS_PER_DAY: Record<ZoomLevel, number> = {
  day: 50,
  week: 20,
  month: 6,
  quarter: 2,
}

const DEFAULT_ROW_HEIGHT = 36

// ====================================
// STORE
// ====================================

export class GanttViewStore implements IStore {
  // Dependencies
  private tableCoreStore: TableCoreStore | null = null

  // ====================================
  // OBSERVABLE STATE
  // ====================================

  /** Current zoom level */
  @observable zoomLevel: ZoomLevel = 'week'

  /** Scroll offset of timeline (horizontal) */
  @observable scrollLeft: number = 0

  /** Field mapping for bar dates */
  @observable fieldMapping: GanttFieldMapping = {
    startField: 'start_date',
    endField: 'end_date',
    labelField: 'name',
  }

  /** Today's date (for "today" line) */
  @observable today: Date = new Date()

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

    for (const row of rows) {
      // VirtualRow has { type, id, data } structure - actual row data is in row.data
      const rowData = row.data || row
      const startDate = this.parseDate(rowData[this.fieldMapping.startField])
      const endDate = this.parseDate(rowData[this.fieldMapping.endField])

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

    let currentTop = 0

    for (const row of rows) {
      // VirtualRow has { type, id, data } structure - actual row data is in row.data
      const rowData = row.data || row
      const startDate = this.parseDate(rowData[this.fieldMapping.startField])
      const endDate = this.parseDate(rowData[this.fieldMapping.endField])

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
  setFieldMapping(mapping: Partial<GanttFieldMapping>): void {
    this.fieldMapping = { ...this.fieldMapping, ...mapping }
    logger.info('Field mapping updated', { mapping: this.fieldMapping })
  }

  @action
  scrollToToday(): void {
    if (this.todayLinePosition !== null) {
      // Center today in viewport (assuming ~600px viewport)
      this.scrollLeft = Math.max(0, this.todayLinePosition - 300)
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
      return isNaN(parsed.getTime()) ? null : parsed
    }
    if (typeof value === 'number') return new Date(value)
    return null
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
    this.today = new Date()
  }

  dispose(): void {
    logger.info('GanttViewStore disposed')
  }
}
