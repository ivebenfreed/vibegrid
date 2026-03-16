import { getLogger } from '@/shared/lib/logging'
import type { CoordinateMapping } from '../coordinates/VibeGridXCoordinateManager'
import type { ViewportInfo } from '../types'

const fileLog = getLogger(['custom', 'vibegrid', 'overlays', 'DragPreviewOverlayDOM.ts'])

// ====================================
// DRAG PREVIEW OVERLAY - DOM Implementation
// ====================================

export interface DragPreviewOverlayConfig {
  selectionColor: string
  selectionBorderColor: string
  cellWidth: number
  cellHeight: number
  opacity?: number
}

export interface DragState {
  isDragging: boolean
  startCell: { row: number; column: number } | null
  currentCell: { row: number; column: number } | null
}

export class DragPreviewOverlayDOM {
  private container: HTMLElement
  private config: DragPreviewOverlayConfig
  private coordinateMapping: CoordinateMapping | null = null

  // DOM elements
  private overlayContainer: HTMLDivElement | null = null
  private preview: HTMLDivElement | null = null

  constructor(container: HTMLElement, config: DragPreviewOverlayConfig) {
    this.container = container
    this.config = {
      opacity: 0.3,
      ...config,
    }

    this.initContainer()
  }

  /**
   * Initialize DOM container
   */
  private initContainer(): void {
    this.overlayContainer = document.createElement('div')
    this.overlayContainer.className = 'vibegridx-drag-preview-container'
    Object.assign(this.overlayContainer.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      right: '0',
      bottom: '0',
      pointerEvents: 'none',
      zIndex: '8',
    })

    this.container.appendChild(this.overlayContainer)
  }

  /**
   * Update coordinate mapping
   */
  updateCoordinateMapping(mapping: CoordinateMapping): void {
    this.coordinateMapping = mapping
  }

  /**
   * Update drag preview
   */
  updatePreview(dragState: DragState | null, viewport: ViewportInfo | null): void {
    if (!dragState?.isDragging || !dragState.startCell || !dragState.currentCell || !viewport) {
      this.clear()
      return
    }

    // Skip for column drag operations (let interaction-handlers.ts handle those)
    // Column drags have specific drag handlers with custom drag images
    if (this.isColumnDragOperation()) {
      this.clear()
      return
    }

    // Calculate bounds
    const bounds = this.calculateDragBounds(dragState, viewport)

    // Show preview
    this.showPreview(bounds.x, bounds.y, bounds.width, bounds.height)
  }

  /**
   * Check if this is a column drag operation (vs cell selection drag)
   */
  private isColumnDragOperation(): boolean {
    // Column drags are handled by interaction-handlers.ts with setDragImage
    // We can detect them by checking for active column drag via DOM or by checking if the drag preview exists in body
    const draggingHeaders = document.querySelectorAll(
      '.vibegridx-header-cell.dragging, .vibegridx-dragging',
    )
    const bodyDragPreview = document.body.querySelector('.vibegridx-column-drag-preview')

    // Also check if any header elements are currently being dragged (via drag state in DOM)
    const headerContainer = document.querySelector('.vibegridx-header-container')
    const isDragInProgress =
      headerContainer?.classList.contains('dragging') ||
      headerContainer?.querySelector('.dragging') !== null

    const isColumnDrag = draggingHeaders.length > 0 || bodyDragPreview !== null || isDragInProgress

    if (isColumnDrag) {
      fileLog.debug('DragPreviewOverlayDOM: Column drag detected, skipping general drag preview', {
        draggingHeaders: draggingHeaders.length,
        bodyDragPreview: !!bodyDragPreview,
        isDragInProgress,
      })
    }

    return isColumnDrag
  }

  /**
   * Show drag preview
   */
  private showPreview(x: number, y: number, width: number, height: number): void {
    if (!this.overlayContainer) return

    // Create or update preview element
    if (!this.preview) {
      this.preview = document.createElement('div')
      this.preview.className = 'vibegridx-drag-preview'
      this.overlayContainer.appendChild(this.preview)
    }

    // Apply styles
    Object.assign(this.preview.style, {
      position: 'absolute',
      left: `${x}px`,
      top: `${y}px`,
      width: `${width}px`,
      height: `${height}px`,
      backgroundColor: this.config.selectionColor,
      border: `2px solid ${this.config.selectionBorderColor}`,
      borderRadius: '2px',
      boxSizing: 'border-box',
      opacity: String(this.config.opacity),
      pointerEvents: 'none',
      transition: 'all 100ms ease-out',
    })

    fileLog.debug('DragPreviewOverlayDOM: Preview shown', { x, y, width, height })
  }

  /**
   * Calculate drag bounds
   */
  private calculateDragBounds(
    dragState: DragState,
    viewport: ViewportInfo,
  ): { x: number; y: number; width: number; height: number } {
    // Validate input data to avoid NaN calculations
    const startRow = this.parseNumeric(dragState.startCell!.row)
    const startCol = this.parseNumeric(dragState.startCell!.column)
    const currentRow = this.parseNumeric(dragState.currentCell!.row)
    const currentCol = this.parseNumeric(dragState.currentCell!.column)

    // If any values are invalid, return zero bounds
    if (startRow === null || startCol === null || currentRow === null || currentCol === null) {
      fileLog.debug('DragPreviewOverlayDOM: Invalid cell coordinates detected, skipping preview', {
        startCell: dragState.startCell,
        currentCell: dragState.currentCell,
      })
      return { x: 0, y: 0, width: 0, height: 0 }
    }

    const minRow = Math.min(startRow, currentRow)
    const maxRow = Math.max(startRow, currentRow)
    const minCol = Math.min(startCol, currentCol)
    const maxCol = Math.max(startCol, currentCol)

    // Adjust for viewport offset
    const viewportOffset = viewport.start * this.config.cellHeight

    return {
      x: minCol * this.config.cellWidth,
      y: minRow * this.config.cellHeight - viewportOffset,
      width: (maxCol - minCol + 1) * this.config.cellWidth,
      height: (maxRow - minRow + 1) * this.config.cellHeight,
    }
  }

  /**
   * Parse a value to a numeric value, returning null if invalid
   */
  private parseNumeric(value: any): number | null {
    if (typeof value === 'number' && !Number.isNaN(value)) {
      return value
    }
    if (typeof value === 'string') {
      const parsed = parseInt(value, 10)
      return Number.isNaN(parsed) ? null : parsed
    }
    return null
  }

  /**
   * Clear preview
   */
  clear(): void {
    if (this.preview) {
      this.preview.style.opacity = '0'
      setTimeout(() => {
        if (this.preview) {
          this.preview.remove()
          this.preview = null
        }
      }, 100)
    }
  }

  /**
   * Destroy the overlay
   */
  destroy(): void {
    this.clear()

    if (this.overlayContainer) {
      this.overlayContainer.remove()
      this.overlayContainer = null
    }
  }
}
