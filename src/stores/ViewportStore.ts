/**
 * ViewportStore - Consolidated viewport and scroll state (MobX)
 *
 * Single source of truth for:
 * - Scroll position (scrollTop, scrollLeft)
 * - Viewport dimensions (width, height)
 * - Content dimensions (total width, total height)
 * - Row offsets (variable-height rows)
 * - Visible row/column range calculations
 * - Coordinate queries (delegated to ObservableCoordinateManager)
 *
 * Replaces:
 * - VirtualViewportStore (deleted)
 * - Viewport state from VisualStateStore (moved here)
 * - VirtualScrollManager global state (deleted)
 *
 * @see planning/specs/1413-vibegrid-architecture-consolidation.md Phase P2
 */

import { action, computed, makeObservable, observable } from 'mobx'
import type { IStore } from '@/app/stores/types'
import { DisposerManager } from '@/app/stores/utils/disposer'
import { getLogger } from '@/shared/lib/logging'
import { GRID_DIMENSIONS } from '../constants/grid-dimensions'
import type { ObservableCoordinateManager } from '../coordinates/ObservableCoordinateManager'
import type {
  CoordinatePosition,
  ViewportAwarePosition,
} from '../coordinates/VibeGridXCoordinateManager'

const logger = getLogger(['vibegrid', 'stores', 'ViewportStore'])

const ROW_HEIGHT = GRID_DIMENSIONS.ROW_HEIGHT

/**
 * ViewportStore - Manages viewport geometry, scroll position, and coordinate queries
 */
export class ViewportStore implements IStore {
  // ====================================
  // SCROLL STATE
  // ====================================

  @observable scrollTop: number = 0
  @observable scrollLeft: number = 0

  // ====================================
  // VIEWPORT DIMENSIONS
  // ====================================

  @observable viewportWidth: number = 0
  @observable viewportHeight: number = 0

  // ====================================
  // CONTENT DIMENSIONS
  // ====================================

  @observable totalContentWidth: number = 0
  @observable totalContentHeight: number = 0

  // ====================================
  // ROW OFFSETS (for variable height rows)
  // ====================================

  /**
   * Optional row offsets array for variable-height rows.
   * If not set, assumes fixed ROW_HEIGHT for all rows.
   */
  @observable rowOffsets: number[] | null = null

  // ====================================
  // DEPENDENCIES
  // ====================================

  private coordinateManager: ObservableCoordinateManager | null = null
  private tableCoreStore: any = null // TableCoreStore reference for offset calculations

  // ====================================
  // LIFECYCLE
  // ====================================

  private disposers = new DisposerManager()

  constructor() {
    makeObservable(this)
    logger.debug('ViewportStore created')
  }

  // ====================================
  // DEPENDENCY INJECTION
  // ====================================

  /**
   * Set coordinate manager (dependency injection)
   */
  setCoordinateManager(manager: ObservableCoordinateManager): void {
    this.coordinateManager = manager
    logger.info('ObservableCoordinateManager set on ViewportStore')
  }

  /**
   * Set table core store (dependency injection for variable-height virtual scrolling)
   */
  @action
  setTableCoreStore(store: any): void {
    this.tableCoreStore = store
    logger.info('TableCoreStore set on ViewportStore')
  }

  // ====================================
  // ACTIONS (State Updates)
  // ====================================

  /**
   * Update scroll position
   */
  @action
  updateScroll(scrollTop: number, scrollLeft: number): void {
    this.scrollTop = scrollTop
    this.scrollLeft = scrollLeft
  }

  /**
   * Update viewport dimensions
   */
  @action
  updateViewportSize(width: number, height: number): void {
    this.viewportWidth = width
    this.viewportHeight = height
    logger.debug('Viewport size updated', { width, height })
  }

  /**
   * Update total content dimensions
   */
  @action
  updateContentSize(width: number, height: number): void {
    this.totalContentWidth = width
    this.totalContentHeight = height
  }

  /**
   * Set row offsets for variable-height rows
   * @param offsets Array where offsets[i] is the Y position of row i
   */
  @action
  setRowOffsets(offsets: number[]): void {
    this.rowOffsets = offsets
  }

  /**
   * Clear row offsets (revert to fixed height)
   */
  @action
  clearRowOffsets(): void {
    this.rowOffsets = null
  }

  // ====================================
  // COMPUTED (Visible Ranges)
  // ====================================

  /**
   * Visible row range based on scroll position and viewport height.
   * Handles both fixed and variable row heights.
   * INCLUDES BUFFER_ROWS for smooth scrolling.
   */
  @computed
  get visibleRowRange(): { start: number; end: number } {
    const buffer = GRID_DIMENSIONS.BUFFER_ROWS

    // Use offset-based calculation for variable-height rows if available
    if (this.tableCoreStore?.findRowAtScrollPosition) {
      const visibleStart = this.tableCoreStore.findRowAtScrollPosition(this.scrollTop)
      const visibleEnd = Math.min(
        this.totalRows - 1,
        this.tableCoreStore.findRowAtScrollPosition(
          this.scrollTop + Math.max(this.viewportHeight, 400),
        ) + 1,
      )

      return {
        start: Math.max(0, visibleStart - buffer),
        end: Math.min(this.totalRows, visibleEnd + buffer),
      }
    }

    // Fallback: binary search on rowOffsets
    if (this.rowOffsets && this.rowOffsets.length > 0) {
      const start = this.findRowIndexAtOffset(this.scrollTop)
      const end = this.findRowIndexAtOffset(this.scrollTop + this.viewportHeight)
      return {
        start: Math.max(0, start - buffer),
        end: Math.min(this.rowOffsets.length, end + buffer + 2),
      }
    }

    // Fallback to constant-height calculation
    const visibleStart = Math.floor(this.scrollTop / ROW_HEIGHT)
    const visibleEnd =
      Math.ceil((this.scrollTop + Math.max(this.viewportHeight, 400)) / ROW_HEIGHT) + 1

    return {
      start: Math.max(0, visibleStart - buffer),
      end: Math.min(this.totalRows, visibleEnd + buffer),
    }
  }

  /**
   * Total number of rows based on offsets or content height
   */
  @computed
  get totalRows(): number {
    if (this.rowOffsets) {
      return this.rowOffsets.length
    }
    if (this.totalContentHeight > 0) {
      return Math.ceil(this.totalContentHeight / ROW_HEIGHT)
    }
    return 0
  }

  // ====================================
  // COORDINATE QUERIES (delegate to coordinateManager)
  // ====================================

  /**
   * Get cell position by row and column IDs
   */
  getCellPosition(rowId: string, columnId: string): CoordinatePosition | null {
    if (!this.coordinateManager) return null
    return this.coordinateManager.cellRefToPosition({ rowId, columnId })
  }

  /**
   * Get cell position with viewport awareness
   */
  getViewportAwarePosition(rowId: string, columnId: string): ViewportAwarePosition | null {
    if (!this.coordinateManager) return null
    const range = this.visibleRowRange
    return this.coordinateManager.getCellPositionWithViewport(rowId, columnId, {
      start: range.start,
      end: range.end,
      height: this.viewportHeight,
      width: this.viewportWidth,
      scrollTop: this.scrollTop,
      scrollLeft: this.scrollLeft,
      viewportWidth: this.viewportWidth,
      viewportHeight: this.viewportHeight,
      itemHeight: ROW_HEIGHT,
    })
  }

  // ====================================
  // HELPERS
  // ====================================

  /**
   * Check if a row index is visible
   */
  isRowVisible(rowIndex: number): boolean {
    const { start, end } = this.visibleRowRange
    return rowIndex >= start && rowIndex <= end
  }

  /**
   * Binary search to find row index at given Y offset.
   * Used for variable-height rows.
   */
  private findRowIndexAtOffset(offset: number): number {
    if (!this.rowOffsets || this.rowOffsets.length === 0) {
      return 0
    }

    let left = 0
    let right = this.rowOffsets.length - 1

    while (left < right) {
      const mid = Math.floor((left + right) / 2)
      if (this.rowOffsets[mid] < offset) {
        left = mid + 1
      } else {
        right = mid
      }
    }

    return left
  }

  // ====================================
  // IStore Implementation
  // ====================================

  async init(): Promise<void> {
    logger.info('ViewportStore initialized')
  }

  @action
  reset(): void {
    this.scrollTop = 0
    this.scrollLeft = 0
    this.viewportWidth = 0
    this.viewportHeight = 0
    this.totalContentWidth = 0
    this.totalContentHeight = 0
    this.rowOffsets = null
    logger.debug('ViewportStore reset')
  }

  dispose(): void {
    this.disposers.dispose()
    logger.debug('ViewportStore disposed')
  }
}
