/**
 * ClipboardOverlayController - Manages clipboard overlay indicators
 *
 * Responsibilities:
 * - Watches clipboardVersion for changes
 * - Shows clipboard indicators (dashed border) on copied/cut cells
 * - Maintains clipboard overlay even when selection changes
 * - Clears clipboard overlay when clipboard is cleared
 * - Handles both copy (blue dashed) and cut (red dashed) operations
 *
 * Extracted from OverlayManager.linkToInteractionsObservable() (lines 470-521)
 *
 * @see planning/active/vibegrid-complexity-refactor/IMPLEMENTATION.md Phase 2.4
 */

import { reaction } from 'mobx'
import { getLogger } from '@/shared/lib/logging'
import { GRID_DIMENSIONS } from '../../../constants/grid-dimensions'
import type { ObservableCoordinateManager } from '../../../coordinates/ObservableCoordinateManager'
import type { CanvasOverlayDOM } from '../../../overlays/CanvasOverlayDOM'
import type { VisualCellPosition } from '../../../overlays/OverlayTypes'
import { OverlayController, type OverlayControllerOptions } from './OverlayController'

const fileLog = getLogger(['vibegrid', 'renderers', 'ClipboardOverlayController'])
const ROW_HEIGHT = GRID_DIMENSIONS.ROW_HEIGHT

/**
 * Options for ClipboardOverlayController
 * Extends base options with clipboard-specific dependencies
 */
export interface ClipboardOverlayControllerOptions extends OverlayControllerOptions {
  /** Canvas overlay instance for rendering clipboard indicators */
  canvasOverlay: CanvasOverlayDOM
  /** Coordinate manager for cell position lookups */
  coordinateManager: ObservableCoordinateManager
}

/**
 * ClipboardOverlayController - Manages clipboard overlay indicators
 *
 * Pattern:
 * 1. Watch clipboardVersion for changes
 * 2. Detect changes using version comparison
 * 3. Schedule DOM update via scheduleUpdate()
 * 4. Update clipboard overlay in RAF callback
 *
 * Special behavior:
 * - Clipboard overlay persists across selection changes
 * - Cleared only when clipboard is explicitly cleared (null)
 * - Shows different visual for copy (blue) vs cut (red)
 */
export class ClipboardOverlayController extends OverlayController {
  private canvasOverlay: CanvasOverlayDOM
  private coordinateManager: ObservableCoordinateManager

  // State tracking for deduplication
  private lastClipboardVersion: number = -1

  constructor(options: ClipboardOverlayControllerOptions) {
    super(options)
    this.canvasOverlay = options.canvasOverlay
    this.coordinateManager = options.coordinateManager
  }

  /**
   * Initialize clipboard overlay reactions
   *
   * Watches:
   * - clipboardVersion: Detects when clipboard changes
   * - clipboard: The actual clipboard state (copiedCells, operation)
   */
  init(): void {
    const dispose = reaction(
      () => {
        // Track dependencies by accessing observable properties
        return {
          clipboardVersion: this.interactionStore.clipboardVersion,
          clipboard: this.interactionStore.clipboard,
        }
      },
      (state) => {
        // Version-based change detection (O(1) comparison)
        const clipboardChanged = this.lastClipboardVersion !== state.clipboardVersion

        fileLog.debug('Clipboard state changed', {
          clipboardVersion: state.clipboardVersion,
          lastVersion: this.lastClipboardVersion,
          clipboardChanged,
          hasClipboard: !!state.clipboard,
          operation: state.clipboard?.operation,
          copiedCellsCount: state.clipboard?.copiedCells.size,
        })

        // Skip if nothing changed
        if (!clipboardChanged) {
          return
        }

        // Update tracking
        this.lastClipboardVersion = state.clipboardVersion

        // Schedule DOM update for next frame
        this.scheduleUpdate(() => {
          this.handleClipboardUpdate(state.clipboard)
        })
      },
    )

    this.disposers.push(dispose)

    fileLog.info('✅ ClipboardOverlayController initialized')
  }

  /**
   * Handle clipboard update in RAF callback
   *
   * Manages two scenarios:
   * 1. Clipboard has cells: Show clipboard indicators (copy or cut style)
   * 2. Clipboard cleared: Clear clipboard indicators
   */
  private handleClipboardUpdate(clipboard: {
    copiedCells: Set<string>
    operation: 'copy' | 'cut' | null
  } | null): void {
    if (!this.canvasOverlay.isInitialized) {
      fileLog.debug('Canvas overlay not initialized, skipping clipboard update')
      return
    }

    if (clipboard && clipboard.copiedCells.size > 0) {
      // Show clipboard overlay
      this.updateClipboardOverlay(clipboard.copiedCells, clipboard.operation === 'cut')
    } else {
      // Clear clipboard overlay
      fileLog.debug('Clearing clipboard overlay')
      this.canvasOverlay.clearClipboardIndicators()
    }
  }

  /**
   * Update clipboard overlay with copied/cut cells
   *
   * Steps:
   * 1. Convert cell IDs to visual positions via coordinator
   * 2. Update canvas overlay with visual positions
   * 3. Pass isCut flag to determine visual style (blue vs red)
   *
   * @param copiedCells Set of cell IDs that are copied/cut
   * @param isCut Whether this is a cut operation (vs copy)
   */
  private updateClipboardOverlay(copiedCells: Set<string>, isCut: boolean): void {
    // Convert cell IDs to visual positions
    const clipboardVisualCells = this.getVisualCellPositions(copiedCells)

    fileLog.debug('Updating clipboard overlay', {
      operation: isCut ? 'cut' : 'copy',
      cellCount: copiedCells.size,
      visualCellCount: clipboardVisualCells.length,
    })

    // Update canvas overlay with clipboard indicators
    this.canvasOverlay.updateClipboardWithVisualPositions(clipboardVisualCells, isCut)
  }

  /**
   * Convert cell IDs to visual positions
   *
   * Uses coordinator as single source of truth for cell positions.
   * Filters out cells that aren't visible in coordinator (hidden columns, etc.)
   *
   * @param copiedCells Set of cell IDs (format: "rowId:columnId")
   * @returns Array of visual positions with x, y, width, height
   */
  private getVisualCellPositions(copiedCells: Set<string>): VisualCellPosition[] {
    const visualPositions: VisualCellPosition[] = []

    fileLog.debug('Getting visual cell positions for clipboard', {
      copiedCount: copiedCells.size,
      coordinatorVersion: this.coordinateManager.getVersion(),
    })

    copiedCells.forEach((cellId) => {
      const [rowId, columnId] = cellId.split(':')

      // Use coordinator for cell position (single source of truth)
      const coordPosition = this.coordinateManager.getCellPosition(rowId, columnId)

      if (coordPosition) {
        // Get column width from coordinator
        const columnWidth = this.coordinateManager.getColumnWidth(columnId)

        const visualPos: VisualCellPosition = {
          cellKey: cellId,
          x: coordPosition.x,
          y: coordPosition.y,
          width: columnWidth,
          height: ROW_HEIGHT,
        }

        visualPositions.push(visualPos)
      } else {
        fileLog.debug('Cell position not found in coordinator (may be hidden)', {
          cellId,
          rowId,
          columnId,
        })
      }
    })

    fileLog.debug('Visual positions for clipboard', {
      cellCount: copiedCells.size,
      positionsFound: visualPositions.length,
    })

    return visualPositions
  }
}
