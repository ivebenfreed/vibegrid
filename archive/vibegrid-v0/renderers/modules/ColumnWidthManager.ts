/**
 * ColumnWidthManager - Manages column width updates and synchronization
 * Handles width updates for header cells, body cells, and header scroll sync
 */

import { log } from '@/logger'

const fileLog = log('components/custom/vibegrid/renderers/modules/ColumnWidthManager.ts')

export interface ColumnWidthManagerOptions {
  headerContainer?: HTMLElement | null
  bodyContainer?: HTMLElement | null
  headerViewport?: HTMLElement | null
}

export class ColumnWidthManager {
  private headerContainer?: HTMLElement | null
  private bodyContainer?: HTMLElement | null
  private headerViewport?: HTMLElement | null
  private _scrollRAF: number | null = null

  constructor(options: ColumnWidthManagerOptions) {
    this.headerContainer = options.headerContainer
    this.bodyContainer = options.bodyContainer
    this.headerViewport = options.headerViewport

    fileLog.info('🏗️ ColumnWidthManager initialized')
  }

  /**
   * Update header cell width to keep in sync with column resize
   */
  updateHeaderCellWidth(columnId: string, newWidth: number): void {
    if (!this.headerContainer) return

    const headerCell = this.headerContainer.querySelector(
      `[data-field="${columnId}"]`,
    ) as HTMLElement
    if (headerCell) {
      // Update the flex-basis style to match new width
      const currentStyle = headerCell.style.cssText
      const updatedStyle = currentStyle.replace(/flex:\s*0\s+0\s+\d+px/, `flex: 0 0 ${newWidth}px`)
      headerCell.style.cssText = updatedStyle

      fileLog.debug('📏 Updated header cell width', {
        columnId,
        newWidth,
        previousStyle: currentStyle.match(/flex:\s*0\s+0\s+\d+px/)?.[0],
        updatedStyle: `flex: 0 0 ${newWidth}px`,
      })
    } else {
      fileLog.warn('⚠️ Header cell not found for width update', { columnId })
    }
  }

  /**
   * Update body cell widths to keep in sync with column resize
   */
  updateBodyCellWidths(columnId: string, newWidth: number): void {
    if (!this.bodyContainer) return

    const bodyCells = this.bodyContainer.querySelectorAll(
      `[data-column-id="${columnId}"]`,
    ) as NodeListOf<HTMLElement>
    if (bodyCells && bodyCells.length > 0) {
      bodyCells.forEach((cell) => {
        // Update the flex-basis style to match new width
        const currentStyle = cell.style.cssText
        const updatedStyle = currentStyle.replace(
          /flex:\s*0\s+0\s+\d+px/,
          `flex: 0 0 ${newWidth}px`,
        )
        cell.style.cssText = updatedStyle
      })

      fileLog.debug('📏 Updated body cell widths', {
        columnId,
        newWidth,
        cellsUpdated: bodyCells.length,
      })
    } else {
      fileLog.debug('📏 No body cells found for width update', { columnId })
    }
  }

  /**
   * Update both header and body cell widths for column resize
   */
  updateColumnWidth(columnId: string, newWidth: number): void {
    this.updateHeaderCellWidth(columnId, newWidth)
    this.updateBodyCellWidths(columnId, newWidth)

    fileLog.info('📏 Column width updated', { columnId, newWidth })
  }

  /**
   * Synchronize header horizontal scroll with viewport
   * Extracted from SimplePassiveRenderer for better modularity
   */
  syncHeaderScroll(scrollLeft: number): void {
    if (!this._scrollRAF && this.headerViewport) {
      this._scrollRAF = requestAnimationFrame(() => {
        if (this.headerViewport) {
          this.headerViewport.scrollLeft = scrollLeft
          fileLog.debug('📜 Header scroll synced', { scrollLeft })
        }
        this._scrollRAF = null
      })
    }
  }

  /**
   * Update container references
   */
  setContainers(options: ColumnWidthManagerOptions): void {
    this.headerContainer = options.headerContainer
    this.bodyContainer = options.bodyContainer
    this.headerViewport = options.headerViewport
  }

  /**
   * Clean up column width manager
   */
  destroy(): void {
    if (this._scrollRAF) {
      cancelAnimationFrame(this._scrollRAF)
      this._scrollRAF = null
    }

    fileLog.info('🧹 ColumnWidthManager destroyed')
  }
}
