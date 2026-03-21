/**
 * HoverTracker - Mouse position and hover state management for VibeGrid
 *
 * Extracted from MouseController. Tracks mouse position and delegates
 * hover state updates to InteractionStore.
 */

import { getLogger } from '@/shared/lib/logging'

const fileLog = getLogger(['custom', 'vibegrid', 'renderers', 'modules', 'HoverTracker.ts'])

export interface HoverTrackerDeps {
  interactionStore: any // InteractionStore - has setMousePosition(), setHover(), clearHover()
}

/**
 * Tracks mouse position within the grid and updates hover state.
 *
 * Responsibilities:
 * - Update mouse coordinates on InteractionStore
 * - Compute hovered cell/row from mouse position
 * - Delegate setHover/clearHover to InteractionStore
 */
export class HoverTracker {
  private interactionStore: any

  constructor(deps: HoverTrackerDeps) {
    this.interactionStore = deps.interactionStore
    fileLog.debug('HoverTracker initialized')
  }

  /**
   * Update mouse position on the interaction store.
   * Called by MouseController on every mousemove within the container.
   */
  updateMousePosition(clientX: number, clientY: number): void {
    this.interactionStore.setMousePosition(clientX, clientY)
  }

  /**
   * Set hover state for a specific cell.
   */
  setHover(rowId: string, columnId: string): void {
    this.interactionStore.setHover(rowId, columnId)
  }

  /**
   * Clear current hover state.
   */
  clearHover(): void {
    this.interactionStore.clearHover()
  }
}
