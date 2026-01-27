import { getLogger } from '@/shared/lib/logging'
import { GRID_DIMENSIONS } from '../constants/grid-dimensions'
import type { VisualCellPosition } from './OverlayTypes'

const myLog = getLogger(['custom', 'vibegrid', 'overlays', 'SelectionOverlayDOM.ts'])

// ====================================
// DOM SELECTION OVERLAY
// ====================================

export interface SelectionOverlayConfig {
  selectionColor: string
  selectionBorderColor: string
  borderWidth: number
  cellHeight: number
}

export class SelectionOverlayDOM {
  private container: HTMLElement
  private config: SelectionOverlayConfig

  // Persistent container (appended once in constructor)
  private selectionContainer: HTMLDivElement | null = null

  // Pool of overlay elements for non-contiguous selection
  private overlayElements: HTMLDivElement[] = []
  private activeOverlayCount: number = 0

  // Track last bounds signature to avoid unnecessary updates
  private lastBoundsSignature: string | null = null

  // NOTE: Viewport tracking removed - now handled by DOM positioning system

  constructor(container: HTMLElement, config: SelectionOverlayConfig) {
    this.container = container
    // Use nice light blue selection colors
    this.config = {
      ...config,
    }

    // Ensure container has relative positioning for absolute children
    if (getComputedStyle(this.container).position === 'static') {
      this.container.style.position = 'relative'
    }

    // Initialize persistent container immediately
    this.initializeContainer()

    myLog.info('SelectionOverlayDOM: Created', {
      container: this.container,
      config: this.config,
    })
  }

  /**
   * Create persistent selection container (called once in constructor)
   */
  private initializeContainer(): void {
    this.selectionContainer = document.createElement('div')
    this.selectionContainer.className = 'vibegridx-selection-container'
    Object.assign(this.selectionContainer.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      right: '0',
      bottom: '0',
      pointerEvents: 'none',
      zIndex: `${GRID_DIMENSIONS.Z_INDEX.SELECTION}`, // 101
    })

    this.container.appendChild(this.selectionContainer)

    myLog.info('SelectionOverlayDOM: Container initialized', {
      zIndex: GRID_DIMENSIONS.Z_INDEX.SELECTION,
    })
  }

  // NOTE: updateViewport method removed - viewport handled by DOM positioning system

  // NOTE: Old coordinate mapping method removed - now using DOM positioning only

  /**
   * Update with visual cell positions directly
   * Supports non-contiguous selection by drawing separate rectangles for each row group
   */
  updateWithVisualPositions(visualCells: VisualCellPosition[]): void {
    if (!this.selectionContainer) return

    myLog.info('SelectionOverlayDOM.updateWithVisualPositions', {
      cellCount: visualCells.length,
      containerExists: !!this.selectionContainer,
      firstCells: visualCells.slice(0, 2).map((c) => ({
        key: c.cellKey,
        pos: { x: c.x, y: c.y, w: c.width, h: c.height },
      })),
    })

    if (visualCells.length === 0) {
      // Clear selection - hide all overlay elements
      this.hideAllOverlays()
      this.lastBoundsSignature = null
      return
    }

    // Group cells by row (Y position)
    const rowGroups = this.groupCellsByRow(visualCells)

    // Merge contiguous rows into ranges
    const ranges = this.mergeContiguousRows(rowGroups)

    // Create bounds signature for diffing
    const boundsSignature = ranges.map((r) => `${r.minX},${r.minY},${r.maxX},${r.maxY}`).join('|')

    if (boundsSignature === this.lastBoundsSignature) {
      myLog.debug('SelectionOverlayDOM: Bounds unchanged, skipping update')
      return
    }

    this.lastBoundsSignature = boundsSignature

    // Update overlay elements for each range
    this.activeOverlayCount = 0
    for (const range of ranges) {
      this.updateOrCreateOverlay(this.activeOverlayCount, range)
      this.activeOverlayCount++
    }

    // Hide any extra overlay elements
    for (let i = this.activeOverlayCount; i < this.overlayElements.length; i++) {
      this.overlayElements[i].style.display = 'none'
    }

    myLog.info('SelectionOverlayDOM: Updated selection', {
      rangeCount: ranges.length,
      activeOverlays: this.activeOverlayCount,
    })
  }

  /**
   * Group cells by their Y position (row)
   */
  private groupCellsByRow(
    cells: VisualCellPosition[],
  ): Map<number, { minX: number; maxX: number; y: number; height: number }> {
    const rowGroups = new Map<number, { minX: number; maxX: number; y: number; height: number }>()

    for (const cell of cells) {
      const existing = rowGroups.get(cell.y)
      if (existing) {
        existing.minX = Math.min(existing.minX, cell.x)
        existing.maxX = Math.max(existing.maxX, cell.x + cell.width)
      } else {
        rowGroups.set(cell.y, {
          minX: cell.x,
          maxX: cell.x + cell.width,
          y: cell.y,
          height: cell.height,
        })
      }
    }

    return rowGroups
  }

  /**
   * Merge contiguous rows into ranges
   * Rows are contiguous if they're adjacent (next row Y = current row Y + height)
   */
  private mergeContiguousRows(
    rowGroups: Map<number, { minX: number; maxX: number; y: number; height: number }>,
  ): Array<{ minX: number; minY: number; maxX: number; maxY: number }> {
    // Sort rows by Y position
    const sortedRows = Array.from(rowGroups.values()).sort((a, b) => a.y - b.y)

    if (sortedRows.length === 0) return []

    const ranges: Array<{ minX: number; minY: number; maxX: number; maxY: number }> = []
    let currentRange = {
      minX: sortedRows[0].minX,
      minY: sortedRows[0].y,
      maxX: sortedRows[0].maxX,
      maxY: sortedRows[0].y + sortedRows[0].height,
    }

    for (let i = 1; i < sortedRows.length; i++) {
      const row = sortedRows[i]
      const prevRow = sortedRows[i - 1]

      // Check if this row is contiguous with the current range
      // Allow small tolerance (1px) for rounding errors
      const isContiguous = Math.abs(row.y - (prevRow.y + prevRow.height)) <= 1

      if (isContiguous) {
        // Extend current range
        currentRange.minX = Math.min(currentRange.minX, row.minX)
        currentRange.maxX = Math.max(currentRange.maxX, row.maxX)
        currentRange.maxY = row.y + row.height
      } else {
        // Start new range
        ranges.push(currentRange)
        currentRange = {
          minX: row.minX,
          minY: row.y,
          maxX: row.maxX,
          maxY: row.y + row.height,
        }
      }
    }

    // Don't forget the last range
    ranges.push(currentRange)

    return ranges
  }

  /**
   * Update or create an overlay element at the given index
   */
  private updateOrCreateOverlay(
    index: number,
    bounds: { minX: number; minY: number; maxX: number; maxY: number },
  ): void {
    let element = this.overlayElements[index]

    if (!element) {
      // Create new element
      element = document.createElement('div')
      element.className = 'vibegridx-selection-overlay vibegridx-selection-merged'
      Object.assign(element.style, {
        position: 'absolute',
        pointerEvents: 'none',
        backgroundColor: this.config.selectionColor,
        border: `${this.config.borderWidth}px solid ${this.config.selectionBorderColor}`,
        boxSizing: 'border-box',
        borderRadius: '3px',
      })
      this.selectionContainer!.appendChild(element)
      this.overlayElements.push(element)
    }

    // Update position and size
    Object.assign(element.style, {
      display: 'block',
      left: `${bounds.minX}px`,
      top: `${bounds.minY}px`,
      width: `${bounds.maxX - bounds.minX}px`,
      height: `${bounds.maxY - bounds.minY}px`,
    })
  }

  /**
   * Hide all overlay elements
   */
  private hideAllOverlays(): void {
    for (const element of this.overlayElements) {
      element.style.display = 'none'
    }
    this.activeOverlayCount = 0
  }

  /**
   * Hide selection overlay (for suspendSelectionOverlay)
   */
  hide(): void {
    if (this.selectionContainer) {
      this.selectionContainer.style.display = 'none'
    }
    myLog.debug('SelectionOverlayDOM: Hidden')
  }

  /**
   * Show selection overlay (after resume)
   */
  show(): void {
    if (this.selectionContainer) {
      this.selectionContainer.style.display = 'block'
    }
    myLog.debug('SelectionOverlayDOM: Shown')
  }

  /**
   * Clear all selection elements
   */
  clearSelection(): void {
    myLog.info('SelectionOverlayDOM: Clearing selection')
    this.hideAllOverlays()
    this.lastBoundsSignature = null
  }

  /**
   * Destroy the overlay and clean up
   */
  destroy(): void {
    this.lastBoundsSignature = null

    // Remove all overlay elements
    for (const element of this.overlayElements) {
      element.remove()
    }
    this.overlayElements = []
    this.activeOverlayCount = 0

    // Remove persistent container
    if (this.selectionContainer) {
      this.selectionContainer.remove()
      this.selectionContainer = null
    }

    myLog.info('SelectionOverlayDOM: Destroyed')
  }
}
