/**
 * EditingOverlayController - Manages editing overlay positioning and visibility
 *
 * Responsibilities:
 * - Watches editingCell and isEditing state for changes
 * - Positions editing overlay over the cell being edited
 * - Manages data-editing attribute on cells (hides cell content during edit)
 * - Clears data-editing from all cells when transitioning between edits
 * - Gets cell values and positions for overlay display
 *
 * Extracted from OverlayManager.linkToInteractionsObservable() (lines 420-468)
 *
 * @see planning/active/vibegrid-complexity-refactor/IMPLEMENTATION.md Phase 2.3
 */

import { reaction } from 'mobx'
import { getLogger } from '@/shared/lib/logging'
import { domPositions$, PositionEvents } from '../../../stores/dom-position-state'
import type { EditingOverlay } from '../../../overlays/EditingOverlay'
import type { EditingStore } from '../../../stores/EditingStore'
import type { TableCoreStore } from '../../../stores/TableCoreStore'
import { OverlayController, type OverlayControllerOptions } from './OverlayController'

const fileLog = getLogger(['vibegrid', 'renderers', 'EditingOverlayController'])

/**
 * Options for EditingOverlayController
 * Extends base options with editing-specific dependencies
 */
export interface EditingOverlayControllerOptions extends OverlayControllerOptions {
  /** Editing overlay instance for showing/hiding editor */
  editingOverlay: EditingOverlay
  /** EditingStore for accessing editing state */
  editingStore: EditingStore
  /** TableCoreStore for accessing columns and row data */
  tableCoreStore: TableCoreStore
}

/**
 * EditingOverlayController - Manages editing overlay
 *
 * Pattern:
 * 1. Watch editingCell and isEditing state via MobX reaction
 * 2. Detect changes (no version number for editing, watches actual state)
 * 3. Schedule DOM update via scheduleUpdate()
 * 4. Update overlay and data-editing attributes in RAF callback
 *
 * Key difference from SelectionOverlayController:
 * - No version-based detection (editing doesn't have version number)
 * - Watches actual state changes (editingCell, isEditing)
 * - More complex DOM manipulation (data-editing attribute management)
 */
export class EditingOverlayController extends OverlayController {
  private editingOverlay: EditingOverlay
  private editingStore: EditingStore
  private tableCoreStore: TableCoreStore

  // State tracking for deduplication
  private lastEditingCell: string | null = null

  constructor(options: EditingOverlayControllerOptions) {
    super(options)
    this.editingOverlay = options.editingOverlay
    this.editingStore = options.editingStore
    this.tableCoreStore = options.tableCoreStore
  }

  /**
   * Initialize editing overlay reactions
   *
   * Watches:
   * - editingCell: Which cell is being edited (or null)
   * - isEditing: Whether editing is active
   * - editValue: Current value being edited
   */
  init(): void {
    const dispose = reaction(
      () => {
        // Track dependencies by accessing observable properties
        return {
          editingCell: this.editingStore.editingCell,
          isEditing: this.editingStore.isEditing,
          editValue: this.editingStore.editValue,
        }
      },
      (state) => {
        // Detect changes (no version number, compare actual state)
        const editingChanged = this.lastEditingCell !== state.editingCell

        fileLog.debug('Editing state changed', {
          editingCell: state.editingCell,
          lastEditingCell: this.lastEditingCell,
          isEditing: state.isEditing,
          editingChanged,
        })

        // Skip if nothing changed
        if (!editingChanged) {
          return
        }

        // Update tracking
        this.lastEditingCell = state.editingCell

        // Schedule DOM update for next frame
        this.scheduleUpdate(() => {
          this.handleEditingUpdate(state)
        })
      },
    )

    this.disposers.push(dispose)

    fileLog.info('✅ EditingOverlayController initialized')
  }

  /**
   * Handle editing update in RAF callback
   *
   * Manages two scenarios:
   * 1. Start editing: Show overlay at cell position, mark cell with data-editing
   * 2. Stop editing: Hide overlay, clear data-editing from all cells
   *
   * CRITICAL: Always clears data-editing from ALL cells first to handle
   * direct transitions between editing different cells.
   */
  private handleEditingUpdate(state: {
    editingCell: string | null
    isEditing: boolean
    editValue: any
  }): void {
    // CRITICAL FIX: Always remove data-editing from ALL cells first
    // This ensures proper cleanup when transitioning directly between edits
    // Without this, the old cell keeps data-editing="true" and has pointer-events: none
    const editingCells = this.container.querySelectorAll('[data-editing="true"]')
    editingCells.forEach((cell) => {
      ;(cell as HTMLElement).removeAttribute('data-editing')
    })

    if (state.isEditing && state.editingCell) {
      // Show editing overlay
      this.showEditingOverlay(state.editingCell, state.editValue)
    } else {
      // Hide editing overlay
      fileLog.debug('Hiding editing overlay')
      this.editingOverlay.hide()
    }
  }

  /**
   * Show editing overlay at cell position
   *
   * Steps:
   * 1. Parse cell ID to get rowId and columnId
   * 2. Find column definition from TableCoreStore
   * 3. Get cell position (DOM-based calculation)
   * 4. Get cell value (from processedRows or editValue)
   * 5. Show overlay at position with value
   * 6. Mark cell with data-editing="true" to hide content
   */
  private showEditingOverlay(editingCell: string, editValue: any): void {
    console.log('🔥 SHOW_EDITING_OVERLAY CALLED', { editingCell, editValue })
    const [rowId, columnId] = editingCell.split(':')
    const columns = this.tableCoreStore.columns
    const column = columns.find((c: any) => c.id === columnId)

    if (!column) {
      fileLog.debug('Column not found for editing', { columnId })
      return
    }

    const position = this.getCellPosition(rowId, columnId)
    if (!position) {
      fileLog.debug('Cell position not found for editing', { rowId, columnId })
      return
    }

    const cell = { rowId, columnId }
    const actualValue = editValue !== undefined ? editValue : this.getCellValue(rowId, columnId)

    fileLog.debug('Showing editing overlay', {
      cellId: editingCell,
      position,
      value: actualValue,
    })

    const positionWithKey = { ...position, cellKey: editingCell }
    this.editingOverlay.showAt(positionWithKey, cell, column, actualValue)

    // Mark the cell as being edited to hide its content via CSS
    const cellElement = this.container.querySelector(
      `[data-row-id="${rowId}"][data-column-id="${columnId}"]`,
    ) as HTMLElement
    if (cellElement) {
      cellElement.dataset.editing = 'true'
    }
  }

  /**
   * Get cell value from table data
   *
   * Looks up value from TableCoreStore.processedRows.
   * Returns empty string if row or column not found.
   *
   * @param rowId Row ID to look up
   * @param columnId Column ID to look up
   * @returns Cell value or empty string
   */
  private getCellValue(rowId: string, columnId: string): any {
    const processedRows = this.tableCoreStore.processedRows

    fileLog.debug('getCellValue', {
      targetRowId: rowId,
      targetColumnId: columnId,
      totalRows: processedRows?.length || 0,
    })

    const row = processedRows.find((r: any) => r.id === rowId)

    if (!row) {
      fileLog.debug('getCellValue: Row not found', { targetRowId: rowId })
      return ''
    }

    const value = row[columnId]

    fileLog.debug('getCellValue: Value extracted', {
      targetRowId: rowId,
      targetColumnId: columnId,
      extractedValue: value,
    })

    return value
  }

  /**
   * Get cell position for editing overlay
   *
   * Uses DOM position tracking for accurate positioning.
   * Falls back to direct DOM calculation if not cached.
   *
   * Returns null if cell is not visible in DOM (virtualized out).
   *
   * @param rowId Row ID of cell
   * @param columnId Column ID of cell
   * @returns Position object with x, y, width, height or null
   */
  private getCellPosition(
    rowId: string,
    columnId: string,
  ): { x: number; y: number; width: number; height: number } | null {
    const cellKey = `${rowId}:${columnId}`

    // Try cached DOM position first (highest accuracy)
    const domPositions = domPositions$.cellPositions.get()
    const domPosition = domPositions.get(cellKey)

    if (domPosition && domPosition.isVisible) {
      fileLog.debug('Using cached DOM position', { cellKey })
      return {
        x: domPosition.x,
        y: domPosition.y,
        width: domPosition.width,
        height: domPosition.height,
      }
    }

    // Fallback: Calculate position directly from DOM
    fileLog.debug('DOM position not cached, calculating directly', { cellKey })

    const cell = this.container.querySelector(
      `[data-row-id="${rowId}"][data-column-id="${columnId}"]`,
    ) as HTMLElement

    if (!cell) {
      fileLog.debug('Cell not found in DOM', { cellKey })
      return null
    }

    // Find the scrollable viewport container
    let viewportContainer = cell.closest('.vibegridx-viewport') as HTMLElement
    if (!viewportContainer) {
      viewportContainer = this.container.querySelector('.vibegridx-viewport') as HTMLElement
    }
    if (!viewportContainer) {
      // Fallback: find scrollable parent
      let parent = cell.parentElement
      while (parent && parent !== this.container) {
        const overflow = getComputedStyle(parent).overflow
        if (overflow === 'auto' || overflow === 'scroll' || overflow === 'hidden') {
          viewportContainer = parent
          break
        }
        parent = parent.parentElement
      }
    }
    if (!viewportContainer) {
      fileLog.warn('No viewport container found, using main container', { cellKey })
      viewportContainer = this.container
    }

    // Calculate position relative to viewport with scroll offset
    const cellRect = cell.getBoundingClientRect()
    const viewportRect = viewportContainer.getBoundingClientRect()

    const relativeX = cellRect.left - viewportRect.left
    const relativeY = cellRect.top - viewportRect.top

    const scrollLeft = viewportContainer.scrollLeft || 0
    const scrollTop = viewportContainer.scrollTop || 0

    const position = {
      x: relativeX + scrollLeft,
      y: relativeY + scrollTop,
      width: cellRect.width,
      height: cellRect.height,
    }

    fileLog.debug('Calculated cell position from DOM', { cellKey, position })
    return position
  }
}
