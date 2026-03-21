/**
 * FillDragController - Fill handle drag logic for VibeGrid
 *
 * Extracted from MouseController. Handles fill handle detection,
 * fill drag start, move, and completion by delegating to InteractionCoordinator.
 */

import { getLogger } from '@/shared/lib/logging'
import type { InteractionCoordinator } from '../../coordination/InteractionCoordinator'

const fileLog = getLogger(['custom', 'vibegrid', 'renderers', 'modules', 'FillDragController.ts'])

export interface FillDragControllerDeps {
  coordinator?: InteractionCoordinator // has handleFillStart(), handleFillMove(), handleFillComplete()
}

/**
 * Manages fill handle drag operations in the grid.
 *
 * Responsibilities:
 * - Detect fill handle elements on mousedown
 * - Delegate fill start to InteractionCoordinator
 * - Track fill drag state during mousemove
 * - Complete fill operation on mouseup
 */
export class FillDragController {
  private coordinator?: InteractionCoordinator

  constructor(deps: FillDragControllerDeps) {
    this.coordinator = deps.coordinator
    fileLog.debug('FillDragController initialized')
  }

  /**
   * Check if a mousedown target is a fill handle element.
   *
   * @param target - The element that received the mousedown event
   * @returns true if the target is or is within a fill handle
   */
  isFillHandleTarget(target: HTMLElement): boolean {
    return !!target.closest('.vibegridx-fill-handle')
  }

  /**
   * Handle fill drag start. Called on mousedown when isFillHandleTarget() returns true.
   * Notifies the coordinator about fill start.
   */
  handleFillStart(): void {
    fileLog.info('Fill handle mousedown detected - starting fill drag')
    if (this.coordinator?.handleFillStart) {
      this.coordinator.handleFillStart()
    }
  }

  /**
   * Handle fill drag start after drag threshold is exceeded.
   * Called when drag threshold is met during an active fill drag.
   */
  handleFillDragThresholdExceeded(): void {
    fileLog.info('Fill drag started')
    if (this.coordinator?.handleFillStart) {
      this.coordinator.handleFillStart()
    }
  }

  /**
   * Handle fill drag move. Called on mousemove during an active fill drag.
   * Finds the cell under the mouse and notifies the coordinator.
   *
   * @param target - The DOM element currently under the mouse
   */
  handleFillMove(target: HTMLElement): void {
    if (!this.coordinator?.handleFillMove) return

    const cellElement = target.closest('[data-row-id][data-column-id]')
    if (!cellElement) return

    const rowId = cellElement.getAttribute('data-row-id')
    const columnId = cellElement.getAttribute('data-column-id')

    if (rowId && columnId) {
      this.coordinator.handleFillMove({ rowId, columnId })
    }
  }

  /**
   * Handle fill drag completion. Called on mouseup after a fill drag.
   * Finds the cell under the mouse and notifies the coordinator to complete the fill.
   *
   * @param target - The DOM element under the mouse at mouseup
   */
  handleFillComplete(target: HTMLElement): void {
    fileLog.info('Fill drag ended - completing fill operation')
    if (!this.coordinator?.handleFillComplete) return

    const cellElement = target.closest('[data-row-id][data-column-id]')
    if (!cellElement) return

    const rowId = cellElement.getAttribute('data-row-id')
    const columnId = cellElement.getAttribute('data-column-id')

    if (rowId && columnId) {
      this.coordinator.handleFillComplete({ rowId, columnId })
    }
  }
}
