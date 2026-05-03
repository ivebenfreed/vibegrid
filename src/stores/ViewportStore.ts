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
import type { CoordinatePosition, ViewportAwarePosition } from '../coordinates/VibeGridXCoordinateManager'
import type { TableCoreStore } from './TableCoreStore'

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

  /**
   * GH#2804 B5: server-authoritative total row count, decoupled from
   * `rawRows.length`. When set (substrate cursor-bounded path), `totalRows`
   * returns this value instead of deriving from rowOffsets / totalContentHeight.
   *
   * When `null` (TanStack DB path or production paginator), falls back to the
   * existing derivation so non-substrate grids see no behavior change.
   *
   * Distinct from `0`: `0` means "server reports zero rows" (valid count);
   * `null` means "no server count yet, use fallback".
   */
  @observable serverTotalRows: number | null = null

  // ====================================
  // DEPENDENCIES
  // ====================================

  private coordinateManager: ObservableCoordinateManager | null = null
  private tableCoreStore: TableCoreStore | null = null // TableCoreStore reference for offset calculations

  // ====================================
  // LIFECYCLE
  // ====================================

  private disposers = new DisposerManager()

  /**
   * Callback for programmatic column scrolling.
   * Set by ScrollController during initialization.
   */
  private _scrollToColumnFn: ((columnId: string, behavior?: ScrollBehavior) => boolean) | null = null

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
  setTableCoreStore(store: TableCoreStore): void {
    this.tableCoreStore = store
    logger.info('TableCoreStore set on ViewportStore')
  }

  /**
   * Set the scroll-to-column implementation (called by ScrollController during init)
   */
  setScrollToColumnFn(fn: (columnId: string, behavior?: ScrollBehavior) => boolean): void {
    this._scrollToColumnFn = fn
  }

  /**
   * Scroll the grid viewport to bring a column into view.
   * Centers the column horizontally if it's outside the current viewport.
   * Returns true if the column was found and scrolled to.
   */
  scrollToColumn(columnId: string, behavior?: ScrollBehavior): boolean {
    if (!this._scrollToColumnFn) {
      logger.warn('scrollToColumn called before ScrollController initialized')
      return false
    }
    return this._scrollToColumnFn(columnId, behavior)
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

  /**
   * GH#2804 B5: set server-authoritative total row count.
   * Pass `null` to revert to fallback derivation (TanStack DB / production
   * paginator path). Substrate cursor-bounded path calls this on every
   * delta with `query.count`.
   */
  @action
  setServerTotalRows(n: number | null): void {
    this.serverTotalRows = n
  }

  // ====================================
  // COMPUTED (Visible Ranges)
  // ====================================

  /**
   * Visible row range based on scroll position and viewport height.
   * Handles both fixed and variable row heights.
   * INCLUDES BUFFER_ROWS for smooth scrolling.
   *
   * GH#2808 S1: in substrate cursor-bounded mode, `serverTotalRows` is set
   * to the full dataset size while `processedRows` only contains the loaded
   * window slice (see TableCoreStore.baseRows GH#2804 B7 sparse guard at
   * line 1165). That means `tableCoreStore.findRowAtScrollPosition` and
   * `this.rowOffsets` (synced from `tableCoreStore.rowOffsets`) only span
   * the loaded window — querying scrollTop=17000 against an offset array
   * that ends at ~4000 saturates at the last loaded index (~120) instead
   * of returning the logical row 500.
   *
   * The cursor reaction in `use-substrate-grid-rows.ts` reads
   * `visibleRowRange` to compute the next cursor window — so it must
   * receive *logical* row indices, not windowed ones. Since bounded mode
   * uses uniform ROW_HEIGHT for placeholder rows, fall back to
   * scrollTop / ROW_HEIGHT math against `serverTotalRows` whenever it is
   * set. Non-substrate paths (TanStack DB, production paginator) keep
   * `serverTotalRows = null` and take the original branch.
   */
  @computed
  get visibleRowRange(): { start: number; end: number } {
    const buffer = GRID_DIMENSIONS.BUFFER_ROWS

    // GH#2808 S1: substrate cursor-bounded mode — derive logical row
    // indices from scrollTop directly, bypassing the windowed offsets.
    if (this.serverTotalRows !== null) {
      const visibleStart = Math.floor(this.scrollTop / ROW_HEIGHT)
      const visibleEnd = Math.ceil((this.scrollTop + Math.max(this.viewportHeight, 400)) / ROW_HEIGHT) + 1

      return {
        start: Math.max(0, visibleStart - buffer),
        end: Math.min(this.serverTotalRows, visibleEnd + buffer),
      }
    }

    // Use offset-based calculation for variable-height rows if available
    if (this.tableCoreStore?.findRowAtScrollPosition) {
      const visibleStart = this.tableCoreStore.findRowAtScrollPosition(this.scrollTop)
      const visibleEnd = Math.min(
        this.totalRows - 1,
        this.tableCoreStore.findRowAtScrollPosition(this.scrollTop + Math.max(this.viewportHeight, 400)) + 1,
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
    const visibleEnd = Math.ceil((this.scrollTop + Math.max(this.viewportHeight, 400)) / ROW_HEIGHT) + 1

    return {
      start: Math.max(0, visibleStart - buffer),
      end: Math.min(this.totalRows, visibleEnd + buffer),
    }
  }

  /**
   * Total number of rows.
   *
   * GH#2804 B5: When `serverTotalRows` is set (substrate cursor-bounded path),
   * returns the server-authoritative count so downstream consumers
   * (GridLineCanvas bounds, RowPreRenderBuffer validity, "Showing X of Y" UI)
   * see the full dataset size rather than the windowed `rawRows.length`.
   *
   * Falls back to the original derivation (rowOffsets length, then content
   * height / ROW_HEIGHT) so TanStack DB / production paginator paths see no
   * behavior change.
   */
  @computed
  get totalRows(): number {
    if (this.serverTotalRows !== null) {
      return this.serverTotalRows
    }
    if (this.rowOffsets) {
      return this.rowOffsets.length - 1
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
    this.serverTotalRows = null
    logger.debug('ViewportStore reset')
  }

  dispose(): void {
    this.disposers.dispose()
    logger.debug('ViewportStore disposed')
  }
}
