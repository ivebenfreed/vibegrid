/**
 * SelectionOverlayController - Manages selection overlay and fill handle
 *
 * Responsibilities:
 * - Watches selectionVersion for changes
 * - Updates canvas overlay with selected cell positions
 * - Shows/hides fill handle based on selection
 * - Hides selection during column resize (prevents visual conflicts)
 * - Restores selection after resize ends
 *
 * Extracted from OverlayManager.linkToInteractionsObservable() (lines 304-418)
 *
 * @see planning/active/vibegrid-complexity-refactor/IMPLEMENTATION.md Phase 2.2
 */

import { reaction } from 'mobx'
import { getLogger } from '@/shared/lib/logging'
import { GRID_DIMENSIONS } from '../../../constants/grid-dimensions'
import type { ObservableCoordinateManager } from '../../../coordinates/ObservableCoordinateManager'
import type { CanvasOverlayDOM } from '../../../overlays/CanvasOverlayDOM'
import type { VisualCellPosition } from '../../../overlays/OverlayTypes'
import type { ViewportInfo } from '../../../types'
import { OverlayController, type OverlayControllerOptions } from './OverlayController'

const fileLog = getLogger(['vibegrid', 'renderers', 'SelectionOverlayController'])
const ROW_HEIGHT = GRID_DIMENSIONS.ROW_HEIGHT

/**
 * Options for SelectionOverlayController
 * Extends base options with selection-specific dependencies
 */
export interface SelectionOverlayControllerOptions extends OverlayControllerOptions {
  /** Canvas overlay instance for rendering selection */
  canvasOverlay: CanvasOverlayDOM
  /** Coordinate manager for cell position lookups */
  coordinateManager: ObservableCoordinateManager
  /** Function to get current viewport info */
  getViewportInfo: () => ViewportInfo
}

/**
 * SelectionOverlayController - First concrete controller implementation
 *
 * Pattern established:
 * 1. Watch specific version/state via MobX reaction
 * 2. Detect changes using version comparison
 * 3. Schedule DOM update via scheduleUpdate()
 * 4. Update overlay in RAF callback
 *
 * Special handling:
 * - Hides selection during column resize (prevents visual conflicts)
 * - Restores selection when resize ends
 * - Clears selection when no cells selected
 */
export class SelectionOverlayController extends OverlayController {
  private canvasOverlay: CanvasOverlayDOM
  private coordinateManager: ObservableCoordinateManager
  private getViewportInfo: () => ViewportInfo

  // State tracking for deduplication and resize handling
  private lastSelectionVersion: number = -1
  private wasColumnResizing: boolean = false
  // Re-entrancy guard to prevent concurrent overlay updates during rapid scroll
  private isUpdating: boolean = false

  constructor(options: SelectionOverlayControllerOptions) {
    super(options)
    this.canvasOverlay = options.canvasOverlay
    this.coordinateManager = options.coordinateManager
    this.getViewportInfo = options.getViewportInfo
  }

  /**
   * Initialize selection overlay reactions
   *
   * Watches:
   * - selectionVersion: Detects when selection changes
   * - columnResize.isResizing: Detects resize state for hiding/showing
   * - selectedCells: The actual selection set for updates
   * - coordinateManager changes: Redraws selection when columns reorder/resize/hide
   */
  init(): void {
    // Watch selection version and resize state
    const dispose = reaction(
      () => {
        // Track dependencies by accessing observable properties
        return {
          selectionVersion: this.interactionStore.selectionVersion,
          selectedCells: this.interactionStore.selectedCells,
          columnResize: this.interactionStore.columnResize,
        }
      },
      (state) => {
        const isColumnResizing = !!state.columnResize?.isResizing

        // Version-based change detection (O(1) comparison)
        const selectionChanged = this.lastSelectionVersion !== state.selectionVersion
        const resizeStateChanged = this.wasColumnResizing !== isColumnResizing

        fileLog.debug('Selection state changed', {
          selectionVersion: state.selectionVersion,
          lastVersion: this.lastSelectionVersion,
          selectionChanged,
          resizeStateChanged,
          isColumnResizing,
          selectedCount: state.selectedCells.size,
        })

        // Skip if nothing changed
        if (!selectionChanged && !resizeStateChanged) {
          return
        }

        // Update tracking
        this.lastSelectionVersion = state.selectionVersion

        // Schedule DOM update for next frame
        this.scheduleUpdate(() => {
          this.handleSelectionUpdate(state.selectedCells, isColumnResizing)
        })
      },
    )

    this.disposers.push(dispose)

    // Subscribe to coordinate manager changes (column reorder/resize/hide)
    // When coordinates change, redraw selection with new positions
    const unsubscribeCoordinates = this.coordinateManager.subscribe((event) => {
      fileLog.debug('Coordinate change detected, redrawing selection', {
        eventType: event.type,
        version: event.newMapping.version,
        selectedCells: this.interactionStore.selectedCells.size,
      })

      // Defer until next frame so DOM updates first
      requestAnimationFrame(() => {
        if (this.interactionStore.selectedCells.size > 0) {
          fileLog.debug('Redrawing selection with updated coordinates', {
            selectedCells: this.interactionStore.selectedCells.size,
            coordinatorVersion: this.coordinateManager.getVersion(),
          })
          this.updateSelection(this.interactionStore.selectedCells)
        }
      })
    })

    this.disposers.push(unsubscribeCoordinates)

    fileLog.info('✅ SelectionOverlayController initialized')
  }

  /**
   * Handle selection update in RAF callback
   *
   * Manages three scenarios:
   * 1. Resize started: Hide selection overlay
   * 2. Resize ended: Restore selection overlay
   * 3. Selection changed (not resizing): Update selection
   */
  private handleSelectionUpdate(selectedCells: Set<string>, isColumnResizing: boolean): void {
    // Handle resize state transitions
    if (isColumnResizing && !this.wasColumnResizing) {
      // Resize started - hide selection
      fileLog.debug('[RESIZE] Hiding selection overlay for column resize')
      const selectionOverlay = this.canvasOverlay.getSelectionOverlayInstance()
      if (selectionOverlay) {
        selectionOverlay.hide()
      }
      this.canvasOverlay.hideFillHandle()
      this.wasColumnResizing = true
      return
    }

    if (!isColumnResizing && this.wasColumnResizing) {
      // Resize ended - restore selection
      fileLog.debug('[RESIZE] Restoring selection overlay after resize', {
        selectedCount: selectedCells.size,
      })
      const selectionOverlay = this.canvasOverlay.getSelectionOverlayInstance()
      if (selectionOverlay) {
        selectionOverlay.show()
      }
      this.wasColumnResizing = false

      // Update selection with current cells
      if (selectedCells.size > 0) {
        this.updateSelection(selectedCells)
      } else {
        this.clearSelection()
      }
      return
    }

    // Normal selection update (not during resize)
    if (!isColumnResizing) {
      if (selectedCells.size > 0) {
        this.updateSelection(selectedCells)
      } else {
        this.clearSelection()
      }
    } else {
      fileLog.debug('[RESIZE] Skipping selection update during column resize')
    }
  }

  /**
   * Update selection overlay with selected cells
   *
   * Steps:
   * 1. Convert cell IDs to visual positions via coordinator
   * 2. Update viewport info for overlay positioning
   * 3. Update canvas overlay with visual positions
   * 4. Show/hide fill handle based on selection
   */
  private updateSelection(selectedCells: Set<string>): void {
    if (!this.canvasOverlay.isInitialized) {
      fileLog.debug('Canvas overlay not initialized, skipping selection update')
      return
    }

    // Re-entrancy guard: skip if already updating (prevents concurrent overlay updates)
    if (this.isUpdating) {
      fileLog.debug('Selection update already in progress, skipping')
      return
    }
    this.isUpdating = true

    try {
      // Convert selected cells to visual positions
      const visualCells = this.getVisualCellPositions(selectedCells)

      // Update viewport info
      const viewportInfo = this.getViewportInfo()

      // Update canvas overlay
      this.canvasOverlay.updateViewport(viewportInfo)
      this.canvasOverlay.updateSelectionWithVisualPositions(visualCells)

      // Show/hide fill handle based on selection
      if (visualCells.length > 0) {
        this.canvasOverlay.renderFillHandle(visualCells, undefined, viewportInfo)
      } else {
        this.canvasOverlay.hideFillHandle()
      }

      fileLog.debug('Selection updated', {
        cellCount: selectedCells.size,
        visualCellCount: visualCells.length,
      })
    } finally {
      this.isUpdating = false
    }
  }

  /**
   * Clear selection overlay
   */
  private clearSelection(): void {
    if (!this.canvasOverlay.isInitialized) {
      return
    }

    this.canvasOverlay.updateSelectionWithVisualPositions([])
    this.canvasOverlay.hideFillHandle()

    fileLog.debug('Selection cleared')
  }

  /**
   * Convert cell IDs to visual positions
   *
   * Uses coordinator as single source of truth for cell positions.
   * Filters out cells that aren't visible in coordinator (hidden columns, etc.)
   *
   * @param selectedCells Set of cell IDs (format: "rowId:columnId")
   * @returns Array of visual positions with x, y, width, height
   */
  private getVisualCellPositions(selectedCells: Set<string>): VisualCellPosition[] {
    const visualPositions: VisualCellPosition[] = []

    fileLog.debug('Getting visual cell positions from coordinator', {
      selectedCount: selectedCells.size,
      coordinatorVersion: this.coordinateManager.getVersion(),
    })

    selectedCells.forEach((cellId) => {
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

    fileLog.debug('Visual positions from coordinator', {
      cellCount: selectedCells.size,
      positionsFound: visualPositions.length,
    })

    return visualPositions
  }
}
