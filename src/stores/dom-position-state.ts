/**
 * DOM Position State - Reactive DOM Position Tracking (MOBX)
 *
 * This store tracks actual DOM positions of rendered cells using
 * a single scroll-based trigger for reliable position updates.
 *
 * MIGRATED TO MOBX - Uses observable class with @observable properties
 */

import { action, computed, makeObservable, observable, runInAction } from 'mobx'
import { getLogger } from '@/shared/lib/logging'
import type {
  CellCoordinates,
  CellPositionMap,
  PositionChangeEvent,
  PositionUpdateHandler,
} from '../types/coordinate-types'
import type { ViewportStore } from './ViewportStore'

const fileLog = getLogger(['custom', 'vibegrid', 'stores', 'dom-position-state.ts'])

interface ColumnPositionCache {
  columnPositions: Map<string, { offset: number; width: number }>
  totalWidth: number
  lastColumnUpdate: number
}

/**
 * MobX store for DOM position tracking
 */
class DOMPositionStore {
  // Observable properties
  @observable cellPositions: CellPositionMap = new Map()

  /**
   * Container rect tracks absolute page position of the viewport container.
   * ViewportStore does not track this (it only has scroll/viewport dimensions),
   * so we keep it here.
   */
  @observable.ref containerRect: DOMRect | null = null

  @observable columnCache: ColumnPositionCache = {
    columnPositions: new Map(),
    totalWidth: 0,
    lastColumnUpdate: 0,
  }

  @observable lastUpdate: number = 0
  @observable isTracking: boolean = false

  // Reference to coordinate mapping for reactive position calculation
  @observable coordinateMapping: any = null

  /**
   * ViewportStore reference for reading scroll/viewport state.
   * Set once during init via setViewportStore(). Not observable - plain reference.
   */
  viewportStore: ViewportStore | null = null

  constructor() {
    makeObservable(this)
  }

  /**
   * Set ViewportStore reference (dependency injection)
   */
  setViewportStore(store: ViewportStore): void {
    this.viewportStore = store
    fileLog.debug('ViewportStore set on DOMPositionStore')
  }

  /**
   * Computed cell positions derived from coordinate mapping
   * This eliminates expensive DOM scanning by calculating positions mathematically
   *
   * @deprecated Use ObservableCoordinateManager.getCellPosition() instead
   */
  @computed
  get computedCellPositions(): CellPositionMap {
    if (
      !this.coordinateMapping ||
      !this.coordinateMapping.rows ||
      !this.coordinateMapping.columns
    ) {
      return new Map()
    }

    const positions = new Map()
    const { rows, columns } = this.coordinateMapping

    // Calculate positions mathematically from coordinate mapping
    rows.forEach((row: any) => {
      columns.forEach((column: any) => {
        const cellKey = `${row.rowId}:${column.columnId}`
        positions.set(cellKey, {
          x: column.x,
          y: row.y,
          width: column.width,
          height: row.height,
          rowId: row.rowId,
          columnId: column.columnId,
          rowIndex: row.index,
          columnIndex: column.index,
        })
      })
    })

    fileLog.debug('Calculated cell positions from coordinate mapping', {
      totalPositions: positions.size,
      rows: rows.length,
      columns: columns.length,
    })

    return positions
  }

  /**
   * Update cell positions
   */
  @action
  updateCellPositions(positions: CellPositionMap, timestamp: number): void {
    this.cellPositions = positions
    this.lastUpdate = timestamp
  }

  /**
   * Update container rect (absolute page position of viewport container)
   */
  @action
  updateContainerRect(rect: DOMRect): void {
    this.containerRect = rect
  }

  /**
   * Update column cache
   */
  @action
  updateColumnCache(cache: ColumnPositionCache): void {
    this.columnCache = cache
  }

  /**
   * Set tracking status
   */
  @action
  setTracking(tracking: boolean): void {
    this.isTracking = tracking
  }

  /**
   * Update coordinate mapping reference
   */
  @action
  updateCoordinateMapping(mapping: any): void {
    this.coordinateMapping = mapping
    fileLog.debug('Updated coordinate mapping reference for computed positions', {
      hasRows: !!mapping?.rows,
      hasColumns: !!mapping?.columns,
      rowCount: mapping?.rows?.length || 0,
      columnCount: mapping?.columns?.length || 0,
    })
  }
}

// Export singleton instance
export const domPositionStore = new DOMPositionStore()

// Backwards compatibility export
export const domPositions$ = {
  get: () => domPositionStore,
  cellPositions: {
    get: () => domPositionStore.cellPositions,
    set: (positions: CellPositionMap) =>
      runInAction(() => {
        domPositionStore.cellPositions = positions
      }),
  },
  columnCache: {
    get: () => domPositionStore.columnCache,
    set: (cache: ColumnPositionCache) =>
      runInAction(() => {
        domPositionStore.columnCache = cache
      }),
  },
  lastUpdate: {
    get: () => domPositionStore.lastUpdate,
    set: (timestamp: number) =>
      runInAction(() => {
        domPositionStore.lastUpdate = timestamp
      }),
  },
  isTracking: {
    get: () => domPositionStore.isTracking,
    set: (tracking: boolean) =>
      runInAction(() => {
        domPositionStore.isTracking = tracking
      }),
  },
}

// Event handlers
const positionChangeHandlers = new Set<PositionUpdateHandler>()

// Store container reference outside of observable to avoid circular references
let tableContainer: HTMLElement | null = null

/**
 * Reactive Position Tracker
 *
 * Uses a single scroll event listener to track viewport position changes
 * and update the reactive observable automatically.
 */
class ReactivePositionTracker {
  private rafId: number | null = null
  private isInitialized = false
  private lastUpdateTime = 0
  private lastContainerRectTime = 0
  private updateThrottle = 100 // ~10fps max (further reduced to prevent forced reflows during initialization)
  private isUpdating = false
  private pendingUpdate = false
  private scrollDebounceTimer: ReturnType<typeof setTimeout> | null = null

  /**
   * Initialize tracking on a table container
   */
  initialize(container: HTMLElement): void {
    if (this.isInitialized) {
      this.cleanup()
    }

    // Find the viewport container which is where cells and overlays live
    const viewportContainer =
      (container.querySelector('.vibegridx-viewport') as HTMLElement) || container

    fileLog.debug('🎯 Initializing DOM position tracking', {
      containerClass: container.className,
      viewportClass: viewportContainer.className,
      existingCells: viewportContainer.querySelectorAll('[data-row-id][data-column-id]').length,
      usingViewport: viewportContainer !== container,
    })

    tableContainer = viewportContainer
    domPositionStore.setTracking(true)

    // Setup single scroll-based trigger
    this.setupScrollListener(viewportContainer)
    this.isInitialized = true

    // Defer initial position update to prevent blocking initialization
    fileLog.debug('🚀 Position tracker initialized, deferring initial update to prevent reflows', {
      cellsFound: viewportContainer.querySelectorAll('[data-row-id][data-column-id]').length,
    })

    // Defer initial update by 500ms to allow DOM to settle and prevent forced reflows during initialization
    setTimeout(() => {
      if (this.isInitialized) {
        this.schedulePositionUpdate()
      }
    }, 500)
  }

  /**
   * Setup scroll listener for position tracking
   *
   * P3 Consolidation: Window resize listener REMOVED.
   * Viewport resizing is now handled by a single ResizeObserver in VibeGrid.tsx
   * which calls ViewportStore.updateViewportSize(). All downstream effects flow
   * through MobX reactions on ViewportStore.
   *
   * Cell positions are calculated mathematically from coordinate mapping:
   * - row position = rowIndex x ROW_HEIGHT
   * - column position = sum of previous column widths
   *
   * Overlays that need positions should use:
   * - computedCellPositions (mathematical calculation)
   * - Or call requestPositionUpdate() explicitly when editing starts
   */
  private setupScrollListener(_container: HTMLElement): void {
    // P3: No event listeners here. Resize is handled by ResizeObserver in VibeGrid.tsx.
    // Position updates can still be triggered explicitly via requestPositionUpdate().
    fileLog.debug(
      '✅ Position tracking initialized (no resize listener - handled by VibeGrid ResizeObserver)',
    )
  }

  /**
   * Request a position update explicitly (for overlay positioning during editing)
   */
  requestPositionUpdate(): void {
    this.schedulePositionUpdate()
  }

  /**
   * Schedule a position update (RAF throttled)
   * PERFORMANCE OPTIMIZED: Better throttling and coalescing
   */
  private schedulePositionUpdate(): void {
    if (this.rafId || this.isUpdating || this.pendingUpdate) return // Already scheduled or updating

    const now = Date.now()
    if (now - this.lastUpdateTime < this.updateThrottle) {
      // Use pendingUpdate flag to prevent multiple setTimeout calls
      if (!this.pendingUpdate) {
        this.pendingUpdate = true
        setTimeout(
          () => {
            this.pendingUpdate = false
            this.schedulePositionUpdate()
          },
          this.updateThrottle - (now - this.lastUpdateTime),
        )
      }
      return
    }

    this.rafId = requestAnimationFrame(() => {
      this.updatePositions()
      this.rafId = null
    })
  }

  /**
   * Update positions for all pending cells
   * PERFORMANCE OPTIMIZED: Batch DOM reads to minimize forced reflows
   */
  private updatePositions(): void {
    if (!tableContainer || this.isUpdating) return
    this.isUpdating = true

    const container = tableContainer
    const timestamp = Date.now()

    // Update lastUpdateTime to prevent throttle issues
    this.lastUpdateTime = timestamp

    const currentPositions = domPositionStore.cellPositions
    const newPositions = new Map(currentPositions)

    // Discover all cells in the DOM to ensure complete tracking
    const allCellsInDOM = container.querySelectorAll('[data-row-id][data-column-id]')
    const allCellElements = Array.from(allCellsInDOM) as HTMLElement[]

    // Extract metadata in a single pass
    const cellsToUpdate = allCellElements.map((cell) => ({
      element: cell,
      rowId: cell.getAttribute('data-row-id')!,
      columnId: cell.getAttribute('data-column-id')!,
      cellKey: `${cell.getAttribute('data-row-id')}:${cell.getAttribute('data-column-id')}`,
    }))

    fileLog.debug('📐 Position update', {
      cellsInDOM: allCellsInDOM.length,
      tracked: currentPositions.size,
      updating: cellsToUpdate.length,
    })

    // Get viewport container once to avoid repeated queries
    const viewportContainer =
      (container.querySelector('.vibegridx-viewport') as HTMLElement) || container

    // Read scroll position from ViewportStore (single source of truth)
    const vs = domPositionStore.viewportStore
    const scrollLeft = vs ? vs.scrollLeft : 0
    const scrollTop = vs ? vs.scrollTop : 0

    // Container rect: still read from DOM since ViewportStore doesn't track absolute page position
    let viewportRect: DOMRect | null = null
    const lastContainerRectUpdate = domPositionStore.containerRect ? this.lastContainerRectTime : 0
    const viewportUpdateNeeded =
      !domPositionStore.containerRect || timestamp - lastContainerRectUpdate > 100 // 10fps max for container rect updates

    if (viewportContainer && viewportUpdateNeeded) {
      viewportRect = viewportContainer.getBoundingClientRect()
      this.lastContainerRectTime = timestamp
      runInAction(() => {
        domPositionStore.updateContainerRect(viewportRect!)
      })
    } else {
      viewportRect = domPositionStore.containerRect
    }

    // Process all cells with pre-calculated viewport data
    cellsToUpdate.forEach(({ element: cell, rowId, columnId, cellKey }) => {
      if (!rowId || !columnId || !viewportRect) return

      const oldPosition = currentPositions.get(cellKey)

      // Single getBoundingClientRect call per cell
      const cellRect = cell.getBoundingClientRect()

      // Calculate position relative to viewport container
      const relativeX = cellRect.left - viewportRect.left
      const relativeY = cellRect.top - viewportRect.top

      // CRITICAL FIX: Since the overlay container is inside the scrolling viewport,
      // we need absolute positions within the scrollable area, not viewport-relative
      // Add scroll offset to get absolute position within scrollable content
      const absoluteX = relativeX + scrollLeft
      const absoluteY = relativeY + scrollTop

      // Log detailed position calculation for debugging (reduced frequency)
      if (columnId === 'satisfaction_rating' && Math.random() < 0.1) {
        // Only 10% of the time
        fileLog.debug('🎯 SCROLL FIX: Position calculation for satisfaction_rating', {
          cellKey,
          cellRect: { left: cellRect.left, top: cellRect.top },
          viewportRect: { left: viewportRect.left, top: viewportRect.top },
          relativeX,
          relativeY,
          scrollLeft,
          scrollTop,
          absoluteX,
          absoluteY,
        })
      }

      const newPosition: CellCoordinates = {
        x: absoluteX, // Use absolute position within scrollable content
        y: absoluteY, // Use absolute position within scrollable content
        width: cellRect.width,
        height: cellRect.height,
        source: 'dom',
        isVisible: cellRect.width > 0 && cellRect.height > 0,
        timestamp,
      }

      newPositions.set(cellKey, newPosition)

      // Emit position change event
      if (oldPosition && this.hasPositionChanged(oldPosition, newPosition)) {
        this.emitPositionChange({
          type: 'resize',
          cellKey,
          oldPosition,
          newPosition,
          timestamp,
        })
      }
    })

    // Only update if there are actual changes
    let hasChanges = false
    if (newPositions.size !== currentPositions.size) {
      hasChanges = true
    } else {
      for (const [key, position] of newPositions) {
        const oldPosition = currentPositions.get(key)
        if (!oldPosition || this.hasPositionChanged(oldPosition, position)) {
          hasChanges = true
          break
        }
      }
    }

    if (hasChanges) {
      // Batch update using MobX runInAction
      runInAction(() => {
        domPositionStore.updateCellPositions(newPositions, timestamp)
      })

      fileLog.debug('📊 Position update complete', {
        updatedCells: cellsToUpdate.length,
        totalCells: newPositions.size,
        timestamp,
      })
    }

    this.isUpdating = false
  }

  /**
   * Check if position has changed significantly
   */
  private hasPositionChanged(old: CellCoordinates, newPos: CellCoordinates): boolean {
    const threshold = 1 // 1px threshold
    return (
      Math.abs(old.x - newPos.x) > threshold ||
      Math.abs(old.y - newPos.y) > threshold ||
      Math.abs(old.width - newPos.width) > threshold ||
      Math.abs(old.height - newPos.height) > threshold ||
      old.isVisible !== newPos.isVisible
    )
  }

  /**
   * Emit position change event to handlers
   */
  private emitPositionChange(event: PositionChangeEvent): void {
    positionChangeHandlers.forEach((handler) => {
      try {
        handler(event)
      } catch (error) {
        fileLog.error('❌ Error in position change handler', { error })
      }
    })
  }

  /**
   * Cleanup all observers
   */
  cleanup(): void {
    // P3: No window resize listener to remove (handled by VibeGrid ResizeObserver)
    if (this.rafId) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }

    // Clean up debounce timer
    if (this.scrollDebounceTimer) {
      clearTimeout(this.scrollDebounceTimer)
      this.scrollDebounceTimer = null
    }

    tableContainer = null
    domPositionStore.setTracking(false)
    this.isInitialized = false

    fileLog.debug('🧹 DOM position tracking cleaned up')
  }

  /**
   * Force immediate position update (useful for testing)
   * Uses computed positions instead of DOM scanning
   */
  forceUpdate(): void {
    fileLog.debug('🔄 forceUpdate called - using computed positions instead of DOM scanning')
    this.updateFromComputedPositions()
  }

  /**
   * Update coordinate mapping reference for computed positions
   */
  updateCoordinateMapping(mapping: any): void {
    domPositionStore.updateCoordinateMapping(mapping)
  }

  /**
   * Update positions from computed observable instead of DOM scanning
   */
  private updateFromComputedPositions(): void {
    if (this.isUpdating) return
    this.isUpdating = true

    try {
      const computedPositions = domPositionStore.computedCellPositions

      if (computedPositions.size > 0) {
        runInAction(() => {
          domPositionStore.updateCellPositions(computedPositions, Date.now())
        })

        fileLog.debug('✅ COMPUTED: Updated positions from coordinate mapping', {
          positionCount: computedPositions.size,
          usesDOMScanning: false,
        })
      }
    } finally {
      this.isUpdating = false
    }
  }

  /**
   * Get current tracking status
   */
  getStatus(): { isTracking: boolean; cellCount: number; lastUpdate: number } {
    return {
      isTracking: domPositionStore.isTracking,
      cellCount: domPositionStore.cellPositions.size,
      lastUpdate: domPositionStore.lastUpdate,
    }
  }
}

// Export singleton instance
export const positionTracker = new ReactivePositionTracker()

// Position change event handling
export const PositionEvents = {
  /**
   * Subscribe to position change events
   */
  subscribe(handler: PositionUpdateHandler): () => void {
    positionChangeHandlers.add(handler)
    return () => positionChangeHandlers.delete(handler)
  },

  /**
   * Get current position for a cell
   */
  getCellPosition(cellKey: string): CellCoordinates | null {
    return domPositionStore.cellPositions.get(cellKey) || null
  },

  /**
   * Get positions for multiple cells
   */
  getMultipleCellPositions(
    cellKeys: string[],
  ): Array<{ key: string; position: CellCoordinates | null }> {
    const positions = domPositionStore.cellPositions
    return cellKeys.map((key) => ({
      key,
      position: positions.get(key) || null,
    }))
  },

  /**
   * Check if a cell is currently visible
   */
  isCellVisible(cellKey: string): boolean {
    const position = this.getCellPosition(cellKey)
    return position?.isVisible || false
  },

  /**
   * Get all visible cell keys
   */
  getVisibleCellKeys(): string[] {
    const positions = domPositionStore.cellPositions
    return Array.from(positions.entries())
      .filter(([_, pos]) => pos.isVisible)
      .map(([key, _]) => key)
  },

  /**
   * Get scroll position from ViewportStore
   */
  getScrollPosition(): { scrollLeft: number; scrollTop: number } {
    return {
      scrollLeft: domPositionStore.viewportStore?.scrollLeft ?? 0,
      scrollTop: domPositionStore.viewportStore?.scrollTop ?? 0,
    }
  },

  /**
   * Get viewport dimensions from ViewportStore
   */
  getViewportDimensions(): { clientWidth: number; clientHeight: number } {
    return {
      clientWidth: domPositionStore.viewportStore?.viewportWidth ?? 0,
      clientHeight: domPositionStore.viewportStore?.viewportHeight ?? 0,
    }
  },

  /**
   * Get cached container rect (absolute page position)
   */
  getContainerRect(): DOMRect | null {
    return domPositionStore.containerRect
  },

  /**
   * Update column position cache from coordinate manager
   */
  updateColumnCache(columns: Array<{ columnId: string; offset: number; width: number }>): void {
    const timestamp = Date.now()
    const columnPositions = new Map()
    let totalWidth = 0

    for (const column of columns) {
      columnPositions.set(column.columnId, {
        offset: column.offset,
        width: column.width,
      })
      totalWidth = Math.max(totalWidth, column.offset + column.width)
    }

    runInAction(() => {
      domPositionStore.updateColumnCache({
        columnPositions,
        totalWidth,
        lastColumnUpdate: timestamp,
      })
    })

    fileLog.debug('📊 COLUMN CACHE: Updated column positions', {
      columnCount: columns.length,
      totalWidth,
      columns: columns.map((c) => ({ id: c.columnId, offset: c.offset, width: c.width })),
    })
  },

  /**
   * Get cached column position
   */
  getColumnPosition(columnId: string): { offset: number; width: number } | null {
    const cache = domPositionStore.columnCache
    return cache.columnPositions.get(columnId) || null
  },

  /**
   * Get cached total width
   */
  getTotalWidth(): number {
    return domPositionStore.columnCache.totalWidth
  },

  /**
   * Get all cached column positions
   */
  getAllColumnPositions(): Map<string, { offset: number; width: number }> {
    return domPositionStore.columnCache.columnPositions
  },
}
