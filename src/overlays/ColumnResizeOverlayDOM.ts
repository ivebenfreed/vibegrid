import { getLogger } from '@/shared/lib/logging'
import type { CoordinateMapping } from '../coordinates/VibeGridXCoordinateManager'
import type { ColumnResizeState } from '../types'

const fileLog = getLogger(['custom', 'vibegrid', 'overlays', 'ColumnResizeOverlayDOM.ts'])

// ====================================
// COLUMN RESIZE OVERLAY - DOM Implementation
// ====================================

export interface ColumnResizeOverlayConfig {
  resizeIndicatorColor?: string
  resizeIndicatorWidth?: number
  headerHeight: number
  totalHeight: number
}

export class ColumnResizeOverlayDOM {
  private container: HTMLElement
  private config: ColumnResizeOverlayConfig

  // DOM elements
  private overlayContainer: HTMLDivElement | null = null
  private resizeIndicator: HTMLDivElement | null = null

  constructor(container: HTMLElement, config: ColumnResizeOverlayConfig) {
    this.container = container
    this.config = {
      resizeIndicatorColor: '#3b82f6',
      resizeIndicatorWidth: 2,
      ...config,
    }

    this.initContainer()
  }

  /**
   * Initialize DOM container
   */
  private initContainer(): void {
    this.overlayContainer = document.createElement('div')
    this.overlayContainer.className = 'vibegridx-column-resize-container'
    Object.assign(this.overlayContainer.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      right: '0',
      bottom: '0',
      pointerEvents: 'none',
      zIndex: '25',
    })

    this.container.appendChild(this.overlayContainer)
  }

  /**
   * Update coordinate mapping
   */
  updateCoordinateMapping(coordinateMapping: CoordinateMapping): void {
    this.coordinateMapping = coordinateMapping
  }

  /**
   * Update the resize indicator based on current resize state
   */
  updateResizePreview(resizeState: ColumnResizeState | null): void {
    fileLog.debug('[RESIZE-PREVIEW] 🎯 ColumnResizeOverlay.updateResizePreview called', {
      hasResizeState: !!resizeState,
      isResizing: resizeState?.isResizing,
      columnId: resizeState?.columnId,
      newWidth: resizeState?.newWidth,
    })

    if (!resizeState?.isResizing || !resizeState.columnId) {
      fileLog.debug('[RESIZE-PREVIEW] 🧹 Clearing resize preview (no active resize)')
      this.clear()
      return
    }

    // ALWAYS use DOM-based position calculation
    // The coordinate mapping can be stale (doesn't reflect column reorder/hide)
    // DOM positions are always accurate since they reflect the actual rendered state
    const position = this.calculateDOMPosition(resizeState)
    if (!position) {
      fileLog.warn('[RESIZE-PREVIEW] ⚠️ Could not calculate position from DOM')
      return
    }

    const { indicatorX, overlayX, scrollLeft } = position

    fileLog.debug('[RESIZE-PREVIEW] 📏 Column position from DOM', {
      columnId: resizeState.columnId,
      resizeWidth: resizeState.newWidth,
      calculatedX: indicatorX,
      scrollLeft,
      adjustedX: overlayX,
    })

    // Create or update resize indicator
    if (!this.resizeIndicator) {
      fileLog.debug('[RESIZE-PREVIEW] 🎨 Creating NEW resize indicator element')
      this.resizeIndicator = document.createElement('div')
      this.resizeIndicator.className = 'vibegridx-resize-indicator'
      this.overlayContainer?.appendChild(this.resizeIndicator)
      fileLog.debug('[RESIZE-PREVIEW] ✅ Resize indicator appended to overlay container')
    } else {
      fileLog.debug('[RESIZE-PREVIEW] ♻️ Reusing existing resize indicator')
    }

    // Position indicator using absolute positioning within overlay container
    Object.assign(this.resizeIndicator.style, {
      position: 'absolute',
      left: `${overlayX - this.config.resizeIndicatorWidth! / 2}px`,
      top: '0',
      width: `${this.config.resizeIndicatorWidth}px`,
      height: '100%',
      backgroundColor: this.config.resizeIndicatorColor,
      boxShadow: '0 0 4px rgba(59, 130, 246, 0.5)',
      pointerEvents: 'none',
      opacity: '1',
      transition: 'none',
      zIndex: '1000',
    })

    fileLog.debug('[RESIZE-PREVIEW] 🎨 Resize indicator positioned', {
      columnId: resizeState.columnId,
      newWidth: resizeState.newWidth,
      indicatorX,
      scrollLeft,
      adjustedX: overlayX,
    })
  }

  /**
   * Calculate position using live DOM elements
   * This is the authoritative source since DOM always reflects actual rendered state
   * (handles column reorder, hide, and scroll position correctly)
   */
  private calculateDOMPosition(
    resizeState: ColumnResizeState,
  ): { indicatorX: number; overlayX: number; scrollLeft: number } | null {
    const headerCell = document.querySelector(
      `.vibegridx-header-cell[data-column-id="${resizeState.columnId}"]`,
    ) as HTMLElement | null

    if (!headerCell) {
      fileLog.warn('[RESIZE-PREVIEW] ⚠️ Header cell not found for column', {
        columnId: resizeState.columnId,
      })
      return null
    }

    const overlayRect = this.overlayContainer?.getBoundingClientRect()
    const headerRect = headerCell.getBoundingClientRect()

    if (!overlayRect) {
      fileLog.warn('[RESIZE-PREVIEW] ⚠️ Overlay container rect unavailable')
      return null
    }

    const viewportElement =
      (this.container.parentElement?.closest('.vibegridx-viewport') as HTMLElement) ??
      (this.container.parentElement as HTMLElement) ??
      null
    const scrollLeft = viewportElement?.scrollLeft ?? 0

    const newWidth = resizeState.newWidth ?? headerRect.width
    const columnLeft = headerRect.left - overlayRect.left
    const overlayX = columnLeft + newWidth
    const indicatorX = overlayX + scrollLeft

    return { indicatorX, overlayX, scrollLeft }
  }

  /**
   * Clear the resize indicator
   */
  clear(): void {
    if (this.resizeIndicator) {
      this.resizeIndicator.remove()
      this.resizeIndicator = null
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
