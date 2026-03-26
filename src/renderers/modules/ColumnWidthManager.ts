/**
 * ColumnWidthManager - Manages column width updates and synchronization
 * Handles width updates for header cells, body cells, and header scroll sync
 */

import { getLogger } from '@/shared/lib/logging'

const fileLog = getLogger(['custom', 'vibegrid', 'renderers', 'modules', 'ColumnWidthManager.ts'])

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

    fileLog.debug('🏗️ ColumnWidthManager initialized')
  }

  /**
   * Update header cell width to keep in sync with column resize
   */
  updateHeaderCellWidth(columnId: string, newWidth: number): void {
    if (!this.headerContainer) return

    const headerCell = this.headerContainer.querySelector(`[data-field="${columnId}"]`) as HTMLElement
    if (headerCell) {
      // Update the width style to match HeaderRenderer's absolute positioning approach
      headerCell.style.width = `${newWidth}px`

      fileLog.debug('[RESIZE] 📏 ColumnWidthManager updated header cell width', {
        columnId,
        newWidth,
        method: 'direct-width-style',
        elementFound: true,
      })
    } else {
      fileLog.warn('[RESIZE] ⚠️ ColumnWidthManager header cell not found for width update', {
        columnId,
        selector: `[data-field="${columnId}"]`,
        containerExists: !!this.headerContainer,
      })
    }
  }

  /**
   * Update body cell widths to keep in sync with column resize
   */
  updateBodyCellWidths(columnId: string, newWidth: number): void {
    if (!this.bodyContainer) return

    const bodyCells = this.bodyContainer.querySelectorAll(`[data-column-id="${columnId}"]`) as NodeListOf<HTMLElement>
    if (bodyCells && bodyCells.length > 0) {
      bodyCells.forEach((cell) => {
        // Update the flex-basis style to match new width
        const currentStyle = cell.style.cssText
        const updatedStyle = currentStyle.replace(/flex:\s*0\s+0\s+\d+px/, `flex: 0 0 ${newWidth}px`)
        cell.style.cssText = updatedStyle
      })

      fileLog.debug('[RESIZE] 📏 ColumnWidthManager updated body cell widths', {
        columnId,
        newWidth,
        cellsUpdated: bodyCells.length,
        selector: `[data-column-id="${columnId}"]`,
      })
    } else {
      fileLog.warn('[RESIZE] ⚠️ ColumnWidthManager no body cells found for width update', {
        columnId,
        selector: `[data-column-id="${columnId}"]`,
        containerExists: !!this.bodyContainer,
      })
    }
  }

  /**
   * Update both header and body cell widths for column resize
   */
  updateColumnWidth(columnId: string, newWidth: number): void {
    this.updateHeaderCellWidth(columnId, newWidth)
    this.updateBodyCellWidths(columnId, newWidth)

    fileLog.debug('📏 Column width updated', { columnId, newWidth })
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

    fileLog.debug('🧹 ColumnWidthManager destroyed')
  }
}
