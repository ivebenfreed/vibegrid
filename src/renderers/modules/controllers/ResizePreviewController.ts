/**
 * ResizePreviewController - Manages column resize preview overlay
 *
 * Responsibilities:
 * - Watches columnResize state for changes
 * - Shows column resize preview (vertical line) during resize
 * - Clears resize preview when resize ends
 * - Updates preview position as column is dragged
 *
 * Extracted from OverlayManager.linkToInteractionsObservable() (lines 523-543)
 *
 * @see planning/active/vibegrid-complexity-refactor/IMPLEMENTATION.md Phase 2.5
 */

import { reaction } from 'mobx'
import { getLogger } from '@/shared/lib/logging'
import type { CanvasOverlayDOM } from '../../../overlays/CanvasOverlayDOM'
import { OverlayController, type OverlayControllerOptions } from './OverlayController'

const fileLog = getLogger(['vibegrid', 'renderers', 'ResizePreviewController'])

/**
 * Options for ResizePreviewController
 * Extends base options with resize-specific dependencies
 */
export interface ResizePreviewControllerOptions extends OverlayControllerOptions {
  /** Canvas overlay instance for rendering resize preview */
  canvasOverlay: CanvasOverlayDOM
}

/**
 * ResizePreviewController - Manages column resize preview
 *
 * Pattern:
 * 1. Watch columnResize state via MobX reaction
 * 2. Detect changes (no version number, watches actual state)
 * 3. Schedule DOM update via scheduleUpdate()
 * 4. Update resize preview in RAF callback
 *
 * Simple controller - just shows/hides resize preview line.
 */
export class ResizePreviewController extends OverlayController {
  private canvasOverlay: CanvasOverlayDOM

  // State tracking for deduplication
  private lastResizeState: string = ''

  constructor(options: ResizePreviewControllerOptions) {
    super(options)
    this.canvasOverlay = options.canvasOverlay
  }

  /**
   * Initialize resize preview reactions
   *
   * Watches:
   * - columnResize: The resize state (columnId, newWidth, isResizing)
   */
  init(): void {
    const dispose = reaction(
      () => {
        // Track dependencies by accessing observable properties
        return {
          columnResize: this.interactionStore.columnResize,
        }
      },
      (state) => {
        // Detect changes by comparing resize state string
        // No version number available, so we stringify the state
        const resizeStateString = state.columnResize
          ? `${state.columnResize.columnId}:${state.columnResize.newWidth}`
          : ''
        const resizeChanged = this.lastResizeState !== resizeStateString

        fileLog.debug('Resize preview state changed', {
          resizeState: resizeStateString,
          lastState: this.lastResizeState,
          resizeChanged,
          hasResize: !!state.columnResize,
        })

        // Skip if nothing changed
        if (!resizeChanged) {
          return
        }

        // Update tracking
        this.lastResizeState = resizeStateString

        // Schedule DOM update for next frame
        this.scheduleUpdate(() => {
          this.handleResizePreviewUpdate(state.columnResize)
        })
      },
    )

    this.disposers.push(dispose)

    fileLog.info('✅ ResizePreviewController initialized')
  }

  /**
   * Handle resize preview update in RAF callback
   *
   * Manages two scenarios:
   * 1. Column is resizing: Show resize preview at new width
   * 2. Resize ended: Clear resize preview
   */
  private handleResizePreviewUpdate(
    columnResize: {
      isResizing: boolean
      columnId: string
      startWidth: number
      newWidth: number
    } | null,
  ): void {
    if (!this.canvasOverlay.isInitialized) {
      fileLog.debug('Canvas overlay not initialized, skipping resize preview update')
      return
    }

    if (columnResize) {
      // Show resize preview
      fileLog.debug('Showing column resize preview', {
        columnId: columnResize.columnId,
        newWidth: columnResize.newWidth,
        isResizing: columnResize.isResizing,
      })
      this.canvasOverlay.updateColumnResizePreview(columnResize)
    } else {
      // Clear resize preview
      fileLog.debug('Clearing column resize preview')
      this.canvasOverlay.updateColumnResizePreview(null)
    }
  }
}
