/**
 * FrozenColumnPane - Non-scrolling overlay for frozen body columns
 *
 * Architecture:
 * - A `position: sticky; left: 0` element inside the viewport (scroll container)
 * - Compositor handles horizontal pinning (zero lag, no JS sync needed)
 * - Vertical scroll is native (element is inside the scroll container)
 * - Cloned frozen cells from body rows provide the visual layer
 * - Original frozen cells in the body are hidden via CSS (opacity: 0)
 * - pointer-events: none lets clicks pass through to hidden originals
 *
 * This eliminates the horizontal scroll bounce caused by the compositor
 * moving viewport content before JS scroll handlers can counteract it.
 */

import { getLogger } from '@/shared/lib/logging'

const fileLog = getLogger(['vibegrid', 'renderers', 'modules', 'FrozenColumnPane'])

export interface FrozenColumnPaneOptions {
  /** The viewport element (scroll container) — frozen layer is inserted as first child */
  viewport: HTMLElement
  /** Grid container element for event delegation (hover sync) */
  container: HTMLElement
}

export class FrozenColumnPane {
  private stickyLayer: HTMLElement
  private inner: HTMLElement
  private container: HTMLElement
  private isActive = false
  private hoverSyncOver: ((e: Event) => void) | null = null
  private hoverSyncOut: ((e: Event) => void) | null = null

  constructor(options: FrozenColumnPaneOptions) {
    this.container = options.container

    // Create sticky layer — first child of viewport
    this.stickyLayer = document.createElement('div')
    this.stickyLayer.className = 'vibegridx-frozen-body-pane'

    // Inner container holds frozen row clones with absolute positioning
    this.inner = document.createElement('div')
    this.inner.className = 'vibegridx-frozen-body-inner'

    this.stickyLayer.appendChild(this.inner)

    // Insert as FIRST child of viewport (before body container)
    options.viewport.insertBefore(this.stickyLayer, options.viewport.firstChild)

    this.setupHoverSync()

    fileLog.debug('FrozenColumnPane created')
  }

  /**
   * Update frozen pane content by cloning frozen elements from visible body rows.
   * Call after body render completes.
   *
   * @param bodyContainer The body element containing rendered rows
   * @param frozenPaneWidth Total width of frozen area (system cols + frozen data cols)
   * @param totalHeight Total body height (for scroll area sizing)
   */
  update(bodyContainer: HTMLElement, frozenPaneWidth: number, totalHeight: number): void {
    if (frozenPaneWidth <= 0) {
      this.hide()
      return
    }

    this.isActive = true
    this.stickyLayer.style.display = ''
    this.inner.style.width = `${frozenPaneWidth}px`
    this.inner.style.height = `${totalHeight}px`

    // Clear and rebuild clones
    this.inner.innerHTML = ''

    const rows = bodyContainer.querySelectorAll('.vibegridx-row')
    for (let i = 0; i < rows.length; i++) {
      this.cloneRowFrozenContent(rows[i] as HTMLElement)
    }

    fileLog.debug('Frozen pane updated', {
      width: frozenPaneWidth,
      rowCount: rows.length,
      totalHeight,
    })
  }

  /**
   * Clone frozen elements (system columns + frozen data cells) from a body row.
   */
  private cloneRowFrozenContent(originalRow: HTMLElement): void {
    const clone = document.createElement('div')
    // Copy row classes for correct styling (row-alt, row-selected, etc.)
    clone.className = originalRow.className
    clone.dataset.frozenClone = 'true'
    if (originalRow.dataset.rowId) {
      clone.dataset.rowId = originalRow.dataset.rowId
    }

    // Copy row positioning (transform: translateY for virtual scroll position)
    clone.style.transform = originalRow.style.transform
    clone.style.height = originalRow.style.height || '40px'

    // Clone system columns
    const dragCol = originalRow.querySelector('.vibegridx-drag-column')
    if (dragCol) {
      clone.appendChild(dragCol.cloneNode(true))
    }

    const rowHeader = originalRow.querySelector('.vibegridx-row-header-cell')
    if (rowHeader) {
      clone.appendChild(rowHeader.cloneNode(true))
    }

    // Clone frozen data cells
    const frozenCells = originalRow.querySelectorAll('.vibegridx-cell--frozen')
    for (let i = 0; i < frozenCells.length; i++) {
      clone.appendChild(frozenCells[i].cloneNode(true))
    }

    this.inner.appendChild(clone)
  }

  /**
   * Sync hover state from body rows to frozen pane clones.
   * Needed because pointer-events: none on the pane means CSS :hover doesn't trigger.
   */
  private setupHoverSync(): void {
    this.hoverSyncOver = (e: Event) => {
      if (!this.isActive) return
      const target = e.target as HTMLElement
      const row = target.closest('.vibegridx-row:not([data-frozen-clone])') as HTMLElement
      if (row?.dataset.rowId) {
        const clone = this.inner.querySelector(
          `[data-row-id="${row.dataset.rowId}"]`,
        ) as HTMLElement
        if (clone) clone.classList.add('vibegridx-row-hovered')
      }
    }

    this.hoverSyncOut = (e: Event) => {
      if (!this.isActive) return
      const target = e.target as HTMLElement
      const row = target.closest('.vibegridx-row:not([data-frozen-clone])') as HTMLElement
      if (row?.dataset.rowId) {
        const related = (e as MouseEvent).relatedTarget as HTMLElement | null
        if (!row.contains(related)) {
          const clone = this.inner.querySelector(
            `[data-row-id="${row.dataset.rowId}"]`,
          ) as HTMLElement
          if (clone) clone.classList.remove('vibegridx-row-hovered')
        }
      }
    }

    this.container.addEventListener('mouseover', this.hoverSyncOver)
    this.container.addEventListener('mouseout', this.hoverSyncOut)
  }

  /**
   * Hide the frozen pane (when no frozen columns exist).
   */
  hide(): void {
    this.isActive = false
    this.stickyLayer.style.display = 'none'
  }

  /**
   * Clean up DOM and event listeners.
   */
  destroy(): void {
    if (this.hoverSyncOver) {
      this.container.removeEventListener('mouseover', this.hoverSyncOver)
    }
    if (this.hoverSyncOut) {
      this.container.removeEventListener('mouseout', this.hoverSyncOut)
    }
    this.stickyLayer.remove()
    this.isActive = false

    fileLog.debug('FrozenColumnPane destroyed')
  }
}
