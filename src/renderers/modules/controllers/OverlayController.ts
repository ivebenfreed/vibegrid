/**
 * OverlayController - Base class for all overlay controllers
 *
 * Provides shared infrastructure for managing overlay updates:
 * - RAF scheduling to prevent accumulation bugs
 * - Standard disposal pattern for MobX reactions
 * - Consistent API across all controllers
 *
 * Design Context:
 * - Extracted from OverlayManager.linkToInteractionsObservable() (330 lines)
 * - Implements RAF bugfix from sessions/2025-11-25/session-5 (poisoned cell bug)
 * - Part of Phase 2: OverlayManager Split refactor
 *
 * @see planning/active/vibegrid-complexity-refactor/IMPLEMENTATION.md Phase 2.1
 */

import type { InteractionStore } from '../../../stores/InteractionStore'

/**
 * Options passed to all overlay controllers
 *
 * Each specialized controller extends this interface with additional dependencies
 * (e.g., CanvasOverlayDOM, EditingOverlay, CoordinateManager)
 */
export interface OverlayControllerOptions {
  /** The container element for the grid */
  container: HTMLElement
  /** Store managing user interactions and overlay state */
  interactionStore: InteractionStore
}

/**
 * Base class for all overlay controllers
 *
 * Responsibilities:
 * - Provides RAF scheduling to prevent accumulation bugs
 * - Manages disposer lifecycle for MobX reactions
 * - Defines contract for controller initialization
 *
 * Subclasses must:
 * 1. Implement abstract init() to set up MobX reactions
 * 2. Add disposers to this.disposers array for cleanup
 * 3. Use scheduleUpdate() for all DOM updates
 *
 * Example usage:
 * ```typescript
 * class SelectionOverlayController extends OverlayController {
 *   init(): void {
 *     const dispose = reaction(
 *       () => this.interactionStore.selectionVersion,
 *       (version) => {
 *         this.scheduleUpdate(() => this.updateSelection())
 *       }
 *     )
 *     this.disposers.push(dispose)
 *   }
 * }
 * ```
 */
export abstract class OverlayController {
  protected container: HTMLElement
  protected interactionStore: InteractionStore
  protected rafHandle: number | null = null
  protected disposers: (() => void)[] = []

  constructor(options: OverlayControllerOptions) {
    this.container = options.container
    this.interactionStore = options.interactionStore
  }

  /**
   * Initialize controller - set up MobX reactions
   *
   * Called by OverlayManager after all controllers are constructed.
   * Subclasses implement this to create their reactive observers.
   *
   * IMPORTANT: Add all disposers to this.disposers array:
   * ```typescript
   * const dispose = reaction(...)
   * this.disposers.push(dispose)
   * ```
   */
  abstract init(): void

  /**
   * Schedule a DOM update for the next animation frame
   *
   * Prevents RAF accumulation bug by cancelling any pending update.
   * This ensures only the latest update runs, even if multiple reactions
   * fire in rapid succession.
   *
   * Key behavior:
   * - Cancels pending RAF before scheduling new one
   * - Clears RAF handle after callback executes
   * - Thread-safe: only one RAF pending at a time
   *
   * Example:
   * ```typescript
   * this.scheduleUpdate(() => {
   *   // Perform DOM updates here
   *   this.canvasOverlay.updateSelection(...)
   * })
   * ```
   */
  protected scheduleUpdate(callback: () => void): void {
    // Cancel any pending update to prevent RAF accumulation
    if (this.rafHandle !== null) {
      cancelAnimationFrame(this.rafHandle)
    }

    // Schedule new update for next frame
    this.rafHandle = requestAnimationFrame(() => {
      this.rafHandle = null
      callback()
    })
  }

  /**
   * Cleanup all resources
   *
   * - Cancels any pending RAF
   * - Disposes all MobX reactions
   * - Clears disposer array
   *
   * Called by OverlayManager.destroy() during grid teardown.
   */
  dispose(): void {
    // Cancel pending RAF if any
    if (this.rafHandle !== null) {
      cancelAnimationFrame(this.rafHandle)
      this.rafHandle = null
    }

    // Dispose all MobX reactions
    this.disposers.forEach((disposer) => disposer())
    this.disposers = []
  }
}
