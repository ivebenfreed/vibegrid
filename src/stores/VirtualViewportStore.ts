/**
 * VirtualViewportStore - MobX store for virtualization and viewport state
 *
 * Replaces global mutable state in VirtualScrollManager with proper MobX observables.
 *
 * Benefits:
 * - Each grid instance has its own viewport store (supports multiple grids)
 * - MobX reactions can observe scroll/viewport changes
 * - Computed visible ranges update reactively
 * - No global state pollution
 * - Easier to test (no shared state between tests)
 *
 * Usage:
 * ```typescript
 * const viewportStore = new VirtualViewportStore()
 *
 * // Update scroll position
 * viewportStore.updateScroll(scrollTop, scrollLeft)
 *
 * // Get visible row range (computed, memoized)
 * const { start, end } = viewportStore.visibleRowRange
 *
 * // React to changes
 * reaction(
 *   () => viewportStore.visibleRowRange,
 *   (range) => console.log('Visible rows changed:', range)
 * )
 * ```
 */

import { action, computed, makeObservable, observable } from 'mobx'
import type { IStore } from '@/app/stores/types'
import { DisposerManager } from '@/app/stores/utils/disposer'
import { createLogger } from '@/shared/lib/logging'
import { GRID_DIMENSIONS } from '../constants/grid-dimensions'

const log = createLogger('vibegrid/stores/VirtualViewportStore')

const ROW_HEIGHT = GRID_DIMENSIONS.ROW_HEIGHT

/**
 * VirtualViewportStore - Manages viewport and virtualization state
 *
 * Tracks:
 * - Scroll position (scrollTop, scrollLeft)
 * - Viewport dimensions (width, height)
 * - Content dimensions (total width, total height)
 * - Visible ranges (computed from above)
 */
export class VirtualViewportStore implements IStore {
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

  @observable totalContentHeight: number = 0
  @observable totalContentWidth: number = 0

  // ====================================
  // ROW OFFSETS (for variable height rows)
  // ====================================

  /**
   * Optional row offsets array for variable-height rows
   * If not set, assumes fixed ROW_HEIGHT for all rows
   */
  @observable rowOffsets: number[] | null = null

  // ====================================
  // LIFECYCLE
  // ====================================

  private disposers = new DisposerManager()

  constructor() {
    makeObservable(this)
    log.debug('VirtualViewportStore created')
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
   * Visible row range based on scroll position and viewport height
   * Handles both fixed and variable row heights
   */
  @computed
  get visibleRowRange(): { start: number; end: number } {
    if (this.rowOffsets && this.rowOffsets.length > 0) {
      // Variable height rows - use binary search on offsets
      const start = this.findRowIndexAtOffset(this.scrollTop)
      const end = this.findRowIndexAtOffset(this.scrollTop + this.viewportHeight)
      return { start: Math.max(0, start - 1), end: end + 2 } // +2 for buffer
    }

    // Fixed height rows - simple calculation
    const start = Math.floor(this.scrollTop / ROW_HEIGHT)
    const visibleCount = Math.ceil(this.viewportHeight / ROW_HEIGHT)
    const end = start + visibleCount + 1 // +1 for buffer
    return { start, end }
  }

  /**
   * Visible column range
   * Currently returns full range (columns not virtualized yet)
   * TODO: Implement column virtualization when needed
   */
  @computed
  get visibleColumnRange(): { start: number; end: number } {
    // For now, render all columns (no horizontal virtualization)
    return { start: 0, end: Infinity }
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
   * Check if a column index is visible
   */
  isColumnVisible(columnIndex: number): boolean {
    const { start, end } = this.visibleColumnRange
    return columnIndex >= start && columnIndex <= end
  }

  /**
   * Binary search to find row index at given Y offset
   * Used for variable-height rows
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
    log.info('VirtualViewportStore initialized')
  }

  @action
  reset(): void {
    this.scrollTop = 0
    this.scrollLeft = 0
    this.viewportWidth = 0
    this.viewportHeight = 0
    this.totalContentHeight = 0
    this.totalContentWidth = 0
    this.rowOffsets = null
    log.debug('VirtualViewportStore reset')
  }

  dispose(): void {
    this.disposers.dispose()
    log.debug('VirtualViewportStore disposed')
  }
}
