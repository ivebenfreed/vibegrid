/**
 * DragSelectionController - Drag-to-select rectangle logic for VibeGrid
 *
 * Extracted from MouseController. Handles starting, updating, and ending
 * cell drag selection with 8px threshold detection.
 */

import { getLogger } from '@/shared/lib/logging'
import type { VisualStateStore } from '../../stores/VisualStateStore'

const fileLog = getLogger(['custom', 'vibegrid', 'renderers', 'modules', 'DragSelectionController.ts'])

export interface DragSelectionControllerDeps {
  interactionStore: any // InteractionStore - has focusedCell, startDragSelect(), updateDragSelection(), endDragSelect(), isDragSelecting, dragSelectCurrent
  tableCoreStore?: any // TableCoreStore - has processedRows
  visualStateStore: VisualStateStore // has columns, columnVisibility
}

/**
 * Manages drag-to-select cell selection in the grid body.
 *
 * Responsibilities:
 * - Start drag selection using focused cell as anchor
 * - Update drag selection as mouse moves over cells
 * - End drag selection and return result
 * - Build data context (rows, columns, visibility) for range calculation
 */
export class DragSelectionController {
  private interactionStore: any
  private tableCoreStore?: any
  private visualStateStore: VisualStateStore

  constructor(deps: DragSelectionControllerDeps) {
    this.interactionStore = deps.interactionStore
    this.tableCoreStore = deps.tableCoreStore
    this.visualStateStore = deps.visualStateStore
    fileLog.debug('DragSelectionController initialized')
  }

  /**
   * Start a drag selection using the currently focused cell as anchor.
   * Called when drag threshold is exceeded and no column/row/fill drag is active.
   */
  startDragSelect(): void {
    const startCell = this.interactionStore.focusedCell
    if (startCell) {
      this.interactionStore.startDragSelect(startCell)
      fileLog.debug('Started drag selection reactively', { startCell })
    } else {
      fileLog.warn('No focused cell for drag start')
    }
  }

  /**
   * Update drag selection as mouse moves over a new cell.
   * Builds data context from stores for proper range calculation.
   *
   * @param target - The DOM element under the mouse
   */
  updateDragSelect(target: HTMLElement): void {
    if (!this.interactionStore.isDragSelecting) return

    const cellElement = target.closest('[data-row-id][data-column-id]')
    if (!cellElement) return

    const rowId = cellElement.getAttribute('data-row-id')
    const columnId = cellElement.getAttribute('data-column-id')
    const currentCellId = `${rowId}:${columnId}`

    // Skip if already on the same cell
    const currentDragCell = this.interactionStore.dragSelectCurrent
    if (currentCellId === currentDragCell) return

    fileLog.debug('Drag selection updated to new cell', {
      previousCell: currentDragCell,
      currentCell: currentCellId,
    })

    // Build data context from MobX stores for proper range selection
    try {
      const rows = this.tableCoreStore?.processedRows || []
      const columns = this.visualStateStore.columns || []
      const columnVisibility = this.visualStateStore.columnVisibility || {}

      const dataContext = {
        rows,
        columns,
        columnVisibility,
      }

      fileLog.debug('Drag selection data context', {
        rowsCount: dataContext.rows.length,
        columnsCount: dataContext.columns.length,
        visibilityKeys: Object.keys(dataContext.columnVisibility).length,
        firstRowId: dataContext.rows[0]?.id,
        firstColumnId: dataContext.columns[0]?.id,
        visibleColumns: dataContext.columns
          .filter((col: any) => dataContext.columnVisibility[col.id] !== false)
          .map((c: any) => c.id)
          .slice(0, 3),
      })

      // Only use data context if we have valid data
      if (dataContext.rows.length > 0 && dataContext.columns.length > 0) {
        this.interactionStore.updateDragSelection(currentCellId, dataContext)
      } else {
        fileLog.warn('Empty data context for drag selection, falling back to simple update', {
          rowsCount: dataContext.rows.length,
          columnsCount: dataContext.columns.length,
        })
        this.interactionStore.updateDragSelection(currentCellId)
      }
    } catch (error) {
      fileLog.warn('Failed to get data context for drag selection, falling back to simple update', {
        error,
      })
      this.interactionStore.updateDragSelection(currentCellId)
    }
  }

  /**
   * End drag selection and return the result.
   * Called on mouseup after a drag selection was in progress.
   */
  endDragSelect(): any {
    const dragResult = this.interactionStore.endDragSelect()
    fileLog.debug('Ended drag selection reactively', dragResult)
    return dragResult
  }
}
