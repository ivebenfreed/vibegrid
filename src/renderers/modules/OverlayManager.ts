/**
 * OverlayManager - Centralized management of all overlay components for VibeGrid
 * Handles canvas overlay, selection manager, editing overlay, and context menu
 */

import { reaction, runInAction } from 'mobx'
import { createLogger } from '@/shared/lib/logging'
import { ContextMenuManager } from '../../components/ContextMenu'
import { GRID_DIMENSIONS } from '../../constants/grid-dimensions'
import type { CoordinateMapping } from '../../coordinates/VibeGridXCoordinateManager'
import type { ObservableCoordinateManager } from '../../coordinates/ObservableCoordinateManager'
import { CanvasOverlayDOM } from '../../overlays/CanvasOverlayDOM'
import { ColumnDragOverlayDOM } from '../../overlays/ColumnDragOverlayDOM'
import { EditingOverlay } from '../../overlays/EditingOverlay'
import type { VisualCellPosition } from '../../overlays/OverlayTypes'
// EditSessionManager removed - using EditingStore directly
// New hybrid coordinate system imports
import { domPositions$, PositionEvents, positionTracker } from '../../stores/dom-position-state'
import type { EditingStore } from '../../stores/EditingStore'
import type { InteractionStore } from '../../stores/InteractionStore'
// SelectionManager functionality consolidated into interaction-state
import type { TableCoreStore } from '../../stores/TableCoreStore'
import type { ViewportInfo } from '../../types'
import { virtualCellPosition$ } from '../../virtualization/VirtualScrollManager'
// Phase 2.6: New overlay controllers
import { SelectionOverlayController } from './controllers/SelectionOverlayController'
import { EditingOverlayController } from './controllers/EditingOverlayController'
import { ClipboardOverlayController } from './controllers/ClipboardOverlayController'
import { ResizePreviewController } from './controllers/ResizePreviewController'

// Re-export CoordinateMapping for consumers
export type { CoordinateMapping }

const fileLog = createLogger('components/vibegrid/renderers/OverlayManager')

// Use centralized dimensions from the new system
const ROW_HEIGHT = GRID_DIMENSIONS.ROW_HEIGHT
const HEADER_HEIGHT = GRID_DIMENSIONS.HEADER_HEIGHT

export interface OverlayManagerOptions {
  container: HTMLElement
  tableCoreStore: TableCoreStore
  interactionStore: InteractionStore
  editingStore: EditingStore
  coordinateManager: ObservableCoordinateManager
  enableSelectionColumn?: boolean
  headerContainer?: HTMLElement | null
  bodyContainer?: HTMLElement | null
  getProcessedRows: () => any[]
  onEntityUpdate?: (rowId: string, updates: Record<string, any>) => Promise<void> | void
}

export class OverlayManager {
  private container: HTMLElement
  private tableCoreStore: TableCoreStore
  private interactionStore: InteractionStore
  private editingStore: EditingStore
  private coordinateManager: ObservableCoordinateManager
  private enableSelectionColumn: boolean
  private headerContainer: HTMLElement | null
  private bodyContainer: HTMLElement | null
  private getProcessedRows: () => any[]
  private onEntityUpdate?: (rowId: string, updates: Record<string, any>) => Promise<void> | void

  // Overlay instances
  private canvasOverlay: CanvasOverlayDOM | null = null
  // Selection now managed through tableInteraction$ observable
  private editingOverlay: EditingOverlay | null = null
  private contextMenu: ContextMenuManager | null = null
  private columnDragOverlay: ColumnDragOverlayDOM | null = null
  // Note: FillHandleLayer is managed by CanvasOverlayDOM, not created here

  // Service layer - EditSessionManager removed (replaced by EditingStore)

  // Phase 2.6: Overlay controllers
  private selectionController: SelectionOverlayController | null = null
  private editingController: EditingOverlayController | null = null
  private clipboardController: ClipboardOverlayController | null = null
  private resizePreviewController: ResizePreviewController | null = null

  // Performance optimization caches
  private lastSelectionVersion: number = -1 // Version-based deduplication (O(1) comparison)
  private lastClipboardVersion: number = -1 // Version-based clipboard deduplication (O(1) comparison)
  private updateSelectionRAF: number | null = null
  private lastCoordinateMappingVersion: number = -1
  private coordinateMapping: CoordinateMapping | null = null

  // MobX reaction disposers
  private disposers: (() => void)[] = []

  constructor(options: OverlayManagerOptions) {
    this.container = options.container
    this.tableCoreStore = options.tableCoreStore
    this.interactionStore = options.interactionStore
    this.editingStore = options.editingStore
    this.coordinateManager = options.coordinateManager
    this.enableSelectionColumn = options.enableSelectionColumn ?? false
    this.headerContainer = options.headerContainer || null
    this.bodyContainer = options.bodyContainer || null
    this.getProcessedRows = options.getProcessedRows
    this.onEntityUpdate = options.onEntityUpdate

    // EditSessionManager removed - using EditingStore directly

    this.initOverlays()

    // 🔧 KEY FIX: Subscribe to coordinate changes to redraw selections
    // When columns are reordered/resized/hidden, we need to recalculate visual positions
    this.setupCoordinateSubscription()
  }

  /**
   * Subscribe to coordinate manager changes
   * Redraws selections when layout changes (reorder, hide, resize)
   * 🔧 FIX: Defer redraw until next frame so DOM updates first
   */
  private setupCoordinateSubscription(): void {
    const unsubscribe = this.coordinateManager.subscribe((event) => {
      fileLog.info('🔄 Coordinate change detected, scheduling selection redraw', {
        eventType: event.type,
        version: event.newMapping.version,
        selectedCells: this.interactionStore.selectedCells.size,
      })

      // 🔧 FIX: Defer until next frame so DOM updates with new layout first
      requestAnimationFrame(() => {
        if (this.interactionStore.selectedCells.size > 0) {
          fileLog.info('🎨 Redrawing selections with updated DOM layout', {
            selectedCells: this.interactionStore.selectedCells.size,
            coordinatorVersion: this.coordinateManager.getVersion(),
          })
          this.performCanvasSelectionUpdate(this.interactionStore.selectedCells)
        }
      })
    })

    // Add to disposers for cleanup
    this.disposers.push(unsubscribe)

    fileLog.info('✅ Coordinate subscription established for selection overlay sync')
  }

  /**
   * Initialize all overlay components
   */
  private initOverlays(): void {
    fileLog.info('🎨 Initializing overlay system') // Keep: lifecycle

    // Create canvas overlay
    this.canvasOverlay = new CanvasOverlayDOM(
      {
        selectionColor: 'rgba(59, 130, 246, 0.1)',
        selectionBorderColor: 'rgb(59, 130, 246)',
        selectionBorderWidth: 2,
        borderWidth: 2,
        dragIndicatorColor: 'rgb(59, 130, 246)',
        enableAnimations: true,
        animationDuration: 200,
        enableLayerCaching: true,
        maxSelectableCells: 10000,
        cellHeight: ROW_HEIGHT,
        cellWidth: 150, // Default width, updated by coordinate mapping
      },
      (event) => {
        fileLog.debug('📋 Canvas overlay event:', event)
        // Handle fill events from the overlay system
        if (event.type === 'FILL_PREVIEW' && 'previewCells' in event && event.previewCells) {
          // Convert preview cell IDs to visual positions and render
          const visualPositions = this.getVisualCellPositions(event.previewCells)
          if (this.canvasOverlay) {
            const fillHandleLayer = this.canvasOverlay.getFillHandleLayer()
            fillHandleLayer.renderFillPreviewWithVisualPositions(visualPositions)
          }
        } else if (event.type === 'FILL_COMPLETE' && 'fillCells' in event && event.fillCells) {
          this.handleFillComplete(event.fillCells)
        }
      },
    )

    // Pass getProcessedRows to canvas overlay for group boundary constraints
    this.canvasOverlay.setProcessedRowsGetter(this.getProcessedRows)

    // Canvas overlay will be initialized in initializeOverlay() method
    // after DOM is ready

    // Selection is now managed through tableInteraction$ observable
    // Visual updates can be done via tableInteraction$.updateCellSelectionVisuals()

    // Create editing overlay
    this.editingOverlay = new EditingOverlay(this.container, {
      interactionStore: this.interactionStore,
      onUpdate: (value) => {
        // ✅ Delegate to EditingStore for session tracking
        this.editingStore.updatePendingValue(value)
      },
      onCommit: async (value) => {
        // ✅ Delegate to EditingStore for proper commit handling
        await this.editingStore.commitEdit('user-action', value)
      },
      onCancel: () => {
        // ✅ Delegate to EditingStore for proper cancel handling
        this.editingStore.cancelEdit('user-action')
      },
      relationshipContext: {
        relationshipResolvers: {},
      },
      getRowData: (rowId: string) => {
        const processedRows = this.getProcessedRows()
        return processedRows.find((row: any) => row.id === rowId) || null
      },
    })

    // Create context menu
    this.contextMenu = new ContextMenuManager(this.container)

    // Create column drag overlay
    this.columnDragOverlay = new ColumnDragOverlayDOM(this.container, {
      cellHeight: ROW_HEIGHT,
      headerHeight: HEADER_HEIGHT,
    })

    // Note: FillHandleLayer and ColumnResizeOverlay are lazily created by CanvasOverlayDOM

    // Phase 2.6: Initialize overlay controllers
    this.initControllers()

    // Link to existing interactions observable instead of setting up separate observer
    this.linkToInteractionsObservable()

    fileLog.info(
      '✅ Overlay system initialized (CanvasOverlay handles fill handle & resize preview)',
    ) // Keep: lifecycle
  }

  /**
   * Phase 2.6: Initialize overlay controllers
   * Creates and initializes specialized controllers for each overlay type
   */
  private initControllers(): void {
    // SelectionOverlayController - manages selection overlay and fill handle
    if (this.canvasOverlay) {
      this.selectionController = new SelectionOverlayController({
        container: this.container,
        interactionStore: this.interactionStore,
        canvasOverlay: this.canvasOverlay,
        coordinateManager: this.coordinateManager,
        getViewportInfo: () => this.getViewportInfo(),
      })
      this.selectionController.init()
      fileLog.info('✅ SelectionOverlayController initialized and active')
    }

    // EditingOverlayController - manages editing overlay
    if (this.editingOverlay) {
      this.editingController = new EditingOverlayController({
        container: this.container,
        interactionStore: this.interactionStore,
        editingStore: this.editingStore,
        editingOverlay: this.editingOverlay,
        tableCoreStore: this.tableCoreStore,
      })
      this.editingController.init()
      fileLog.info('✅ EditingOverlayController initialized and active')
    }

    // ClipboardOverlayController - manages clipboard indicators
    if (this.canvasOverlay) {
      this.clipboardController = new ClipboardOverlayController({
        container: this.container,
        interactionStore: this.interactionStore,
        canvasOverlay: this.canvasOverlay,
        coordinateManager: this.coordinateManager,
      })
      this.clipboardController.init()
      fileLog.info('✅ ClipboardOverlayController initialized and active')
    }

    // ResizePreviewController - manages column resize preview
    if (this.canvasOverlay) {
      this.resizePreviewController = new ResizePreviewController({
        container: this.container,
        interactionStore: this.interactionStore,
        canvasOverlay: this.canvasOverlay,
      })
      this.resizePreviewController.init()
      fileLog.info('✅ ResizePreviewController initialized and active')
    }
  }

  /**
   * CONSOLIDATED: Single reactive observer for all overlay updates
   * Replaces 3 separate observers to eliminate cascading reactive chain
   */
  private linkToInteractionsObservable(): void {
    // State tracking for deduplication
    let lastEditingCell: string | null = null
    let lastResizeState: string = '' // Track full resize state as string
    let wasColumnResizing = false
    let pendingUpdate: number | null = null

    // BUGFIX: Pending update flags that ACCUMULATE across RAF cancellations
    // This fixes the "poisoned cell" bug where rapid reactions (blur + selection)
    // would cancel each other's RAF callbacks and lose the selection update.
    // See: sessions/2025-11-25/session-5/plan.md for full root cause analysis
    let pendingSelectionUpdate = false
    let pendingEditingUpdate = false
    let pendingClipboardUpdate = false
    let pendingResizeUpdate = false

    // SINGLE OBSERVER: Watches all relevant state in one place using MobX reaction
    this.disposers.push(
      reaction(
        () => {
          // Safety check for observable availability
          if (!this.interactionStore) {
            return null
          }

          // DEBUG: Log every observer trigger
          fileLog.debug('🔍 REACTIVE: OverlayManager reaction triggered')

          // READ ALL STATE: Track dependencies by accessing observable properties
          try {
            const state = {
              // Selection state - direct property access (no .get())
              selectedCells: this.interactionStore.selectedCells,
              focusedCell: this.interactionStore.focusedCell,
              hoveredCell: this.interactionStore.hoveredCell,
              selectionVersion: this.interactionStore.selectionVersion,

              // Editing state (from EditingStore)
              editingCell: this.editingStore.editingCell,
              editValue: this.editingStore.editValue,
              isEditing: this.editingStore.isEditing,

              // Clipboard state
              clipboard: this.interactionStore.clipboard,
              clipboardVersion: this.interactionStore.clipboardVersion,

              // Column resize state
              columnResize: this.interactionStore.columnResize,
              columnResizeVersion: this.interactionStore.columnResizeVersion,
            }

            // Debug clipboard state
            if (state.clipboard) {
              fileLog.debug('📋 OverlayManager detected clipboard state', {
                operation: state.clipboard.operation,
                copiedCellsCount: state.clipboard.copiedCells.size,
              })
            }

            return state
          } catch (error) {
            fileLog.debug('🔍 REACTIVE: Error reading state, likely during unmount', error)
            return null
          }
        },
        (state) => {
          if (!state) {
            return
          }

          fileLog.debug('🔍 REACTIVE: Reaction effect triggered', {
            selectedCount: state.selectedCells.size,
            editingCell: state.editingCell,
            isEditing: state.isEditing,
            observerCallCount: Date.now(),
          })

          // DEDUPLICATION: Skip if nothing meaningful changed
          // Version-based comparison (O(1)) replaces string building (O(n log n))
          const selectionChanged = this.lastSelectionVersion !== state.selectionVersion
          const editingChanged = lastEditingCell !== state.editingCell
          const clipboardChanged = this.lastClipboardVersion !== state.clipboardVersion

          // DEBUG: Log version comparison
          fileLog.debug('🔍 VERSION COMPARISON', {
            lastSelectionVersion: this.lastSelectionVersion,
            currentSelectionVersion: state.selectionVersion,
            selectionChanged,
            selectedCellsSize: state.selectedCells.size,
          })
          const resizeStateString = state.columnResize
            ? `${state.columnResize.columnId}:${state.columnResize.newWidth}`
            : ''
          const resizeChanged = lastResizeState !== resizeStateString // Detect width changes OR start/stop
          const isColumnResizing = !!state.columnResize?.isResizing

          // IMPORTANT: Don't skip if columnResize changed (resize preview needs immediate updates including clear)
          if (!selectionChanged && !editingChanged && !clipboardChanged && !resizeChanged) {
            fileLog.debug('🔍 REACTIVE: No meaningful changes, skipping update')
            return
          }

          // Update deduplication tracking
          this.lastSelectionVersion = state.selectionVersion
          lastEditingCell = state.editingCell
          lastResizeState = resizeStateString
          this.lastClipboardVersion = state.clipboardVersion

          // BUGFIX: Accumulate change flags instead of overwriting
          // This ensures that when RAF is cancelled, previous changes aren't lost
          if (selectionChanged) pendingSelectionUpdate = true
          if (editingChanged) pendingEditingUpdate = true
          if (clipboardChanged) pendingClipboardUpdate = true
          if (resizeChanged) pendingResizeUpdate = true

          fileLog.debug('🔍 REACTIVE: Consolidated state changed', {
            selectionChanged,
            editingChanged,
            clipboardChanged,
            resizeChanged,
            pendingSelectionUpdate,
            pendingEditingUpdate,
            pendingClipboardUpdate,
            pendingResizeUpdate,
            selectedCount: state.selectedCells.size,
            editingCell: state.editingCell,
            isEditing: state.isEditing,
            hasClipboard: !!state.clipboard,
            clipboardOperation: state.clipboard?.operation,
            clipboardCellCount: state.clipboard?.copiedCells?.size,
          })

          // BATCH DOM UPDATES: Cancel any pending update and schedule new one
          if (pendingUpdate !== null) {
            cancelAnimationFrame(pendingUpdate)
          }

          pendingUpdate = requestAnimationFrame(() => {
            pendingUpdate = null

            // BUGFIX: Capture and reset pending flags at RAF execution time
            // This ensures all accumulated changes are processed even if RAF was rescheduled
            const doSelectionUpdate = pendingSelectionUpdate
            const doEditingUpdate = pendingEditingUpdate
            const doClipboardUpdate = pendingClipboardUpdate
            const doResizeUpdate = pendingResizeUpdate
            pendingSelectionUpdate = false
            pendingEditingUpdate = false
            pendingClipboardUpdate = false
            pendingResizeUpdate = false

            // BATCHED: All DOM updates happen together in a single frame
            // Phase 2.6: All overlay updates now handled by dedicated controllers

            wasColumnResizing = isColumnResizing
          })
        },
      ),
    )

    fileLog.debug(
      '✅ Consolidated reactive observer established - eliminated multiple observer chain',
    )
  }

  /**
   * Initialize the canvas overlay in the proper container
   * Call this after DOM is ready
   */
  initializeOverlay(): void {
    if (!this.canvasOverlay || this.canvasOverlay.isInitialized) {
      return
    }

    // Use viewport container (the scrolling container) for the overlay
    // This ensures the overlay scrolls with the content
    const targetContainer =
      (this.container.querySelector('.vibegridx-viewport') as HTMLElement) || this.container

    if (!targetContainer) {
      fileLog.error('❌ No target container found for overlay initialization')
      return
    }

    try {
      this.canvasOverlay.init(targetContainer)
      fileLog.info('🎨 Canvas overlay initialized in viewport container') // Keep: lifecycle

      // Initialize DOM position tracking now that overlay is ready
      this.initializeDOMPositionTracking()
    } catch (error) {
      fileLog.error('❌ Failed to initialize canvas overlay', error)
    }
  }

  /**
   * Initialize DOM position tracking after overlay is ready
   */
  private initializeDOMPositionTracking(): void {
    try {
      positionTracker.initialize(this.container)
      fileLog.info('✅ DOM position tracking initialized') // Keep: lifecycle
    } catch (error) {
      fileLog.error('❌ Failed to initialize DOM position tracking', error)
    }
  }

  /**
   * Update selection display (optimized with change detection and throttling)
   */
  updateSelection(selectedCells: Set<string>): void {
    fileLog.debug('🔄 OverlayManager.updateSelection called', {
      selectedCells: Array.from(selectedCells),
      cellCount: selectedCells.size,
    })

    // BATCH: Use MobX runInAction to prevent multiple reactive triggers
    runInAction(() => {
      // Update selection visuals using InteractionStore
      this.interactionStore.selectedCells = selectedCells
    })

    fileLog.debug('🎯 Updating overlay for selection', {
      selectedCells: Array.from(selectedCells),
    })

    // Cancel any pending updates and run immediately
    if (this.updateSelectionRAF !== null) {
      cancelAnimationFrame(this.updateSelectionRAF)
      this.updateSelectionRAF = null
    }

    // Update overlay directly without RAF throttling for better responsiveness
    this.performCanvasSelectionUpdate(selectedCells)
  }

  /**
   * Perform the actual canvas selection update (separated for throttling)
   */
  private performCanvasSelectionUpdate(selectedCells: Set<string>): void {
    if (this.canvasOverlay && this.canvasOverlay.isInitialized) {
      // Convert selected cells to visual positions
      const visualCells = this.getVisualCellPositions(selectedCells)

      // Update viewport info
      const viewportInfo = this.getViewportInfo()

      this.canvasOverlay.updateViewport(viewportInfo)
      this.canvasOverlay.updateSelectionWithVisualPositions(visualCells)

      // Show/hide fill handle based on selection
      if (visualCells.length > 0) {
        this.canvasOverlay.renderFillHandle(visualCells, undefined, viewportInfo)
      } else {
        this.canvasOverlay.hideFillHandle()
      }
    }
  }

  /**
   * Compare two Sets for equality (optimized for performance)
   */
  private areSetsEqual(set1: Set<string>, set2: Set<string>): boolean {
    if (set1.size !== set2.size) return false
    for (const item of set1) {
      if (!set2.has(item)) return false
    }
    return true
  }

  // NOTE: updateEditingOverlay method removed - editing overlays now handled reactively via interactions observable

  /**
   * Get current cell value from data
   */
  private getCellValue(rowId: string, columnId: string): any {
    const processedRows = this.tableCoreStore.processedRows

    // Debug the full data structure
    fileLog.debug('getCellValue DETAILED DEBUG', {
      targetRowId: rowId,
      targetColumnId: columnId,
      totalRows: processedRows?.length || 0,
      firstFewRowIds: processedRows?.slice(0, 3).map((r: any) => r.id) || [],
      allRowIds: processedRows?.map((r: any) => r.id) || [],
      sampleRowStructure: processedRows?.[0]
        ? Object.keys(processedRows[0]).slice(0, 8)
        : 'no rows',
    })

    const row = processedRows.find((r: any) => r.id === rowId)

    if (!row) {
      fileLog.debug('getCellValue: Row NOT found', {
        targetRowId: rowId,
        availableRowIds: processedRows?.map((r: any) => r.id) || [],
      })
      return ''
    }

    const value = row[columnId]

    fileLog.debug('getCellValue: Row found, extracting value', {
      targetRowId: rowId,
      foundRowId: row.id,
      targetColumnId: columnId,
      extractedValue: value,
      rowKeys: Object.keys(row).slice(0, 8),
      hasTargetColumn: columnId in row,
    })

    fileLog.debug('📄 Getting cell value for editing', {
      rowId,
      columnId,
      foundRow: !!row,
      cellValue: value,
      rowKeys: row ? Object.keys(row).slice(0, 5) : [],
    })

    return value
  }

  /**
   * Update column resize preview
   */
  updateColumnResizePreview(resizeState: any): void {
    // Only log when there's an actual resize happening
    if (resizeState?.isResizing) {
      fileLog.debug('[RESIZE] 🎨 OverlayManager.updateColumnResizePreview called', {
        resizeState,
        canvasOverlayExists: !!this.canvasOverlay,
        isInitialized: this.canvasOverlay?.isInitialized,
      })
    }

    // Ensure overlay is initialized
    if (!this.canvasOverlay?.isInitialized) {
      if (resizeState?.isResizing) {
        fileLog.debug('[RESIZE] 🎨 Initializing overlay for resize preview')
      }
      this.initializeOverlay()
    }

    if (this.canvasOverlay && this.canvasOverlay.isInitialized) {
      if (resizeState?.isResizing) {
        fileLog.debug('[RESIZE] 🎨 Passing resize state to canvasOverlay')
      }
      this.canvasOverlay.updateColumnResizePreview(resizeState)
    } else if (resizeState?.isResizing) {
      fileLog.warn('[RESIZE] ⚠️ Cannot update resize preview - overlay not ready', {
        canvasOverlay: !!this.canvasOverlay,
        isInitialized: this.canvasOverlay?.isInitialized,
      })
    }
  }

  /**
   * Update column drag preview
   */
  updateColumnDragPreview(dragState: any): void {
    if (this.canvasOverlay) {
      const viewportInfo = this.getViewportInfo()
      if (dragState) {
        this.canvasOverlay.updateDragPreview(dragState, viewportInfo)
      } else {
        this.canvasOverlay.updateDragPreview(null, null)
      }
    }
  }

  /**
   * Show context menu
   */
  showContextMenu(options: {
    x: number
    y: number
    rowId: string
    columnId: string
    items: Array<{
      label: string
      icon?: string
      action: () => void
    }>
  }): void {
    if (this.contextMenu) {
      // Transform options into ContextMenuProps format
      this.contextMenu.show({
        isVisible: true,
        position: { x: options.x, y: options.y, clientX: options.x, clientY: options.y },
        context: {
          type: 'cell' as const,
          rowId: options.rowId,
          columnId: options.columnId,
        },
        onClose: () => this.hideContextMenu(),
        onCopy: () => {}, // Handled by context menu items
        onPaste: () => {}, // Handled by context menu items
      })
    }
  }

  /**
   * Hide context menu
   */
  hideContextMenu(): void {
    if (this.contextMenu) {
      this.contextMenu.hide()
    }
  }

  /**
   * Get visual cell positions from selected cells using coordinate manager
   * 🔧 KEY FIX: Use coordinator for positions, not DOM queries
   */
  private getVisualCellPositions(selectedCells: Set<string>): VisualCellPosition[] {
    const visualPositions: VisualCellPosition[] = []

    fileLog.info('🎨 Getting visual cell positions from coordinator', {
      selectedCount: selectedCells.size,
      coordinatorVersion: this.coordinateManager.getVersion(),
    })

    selectedCells.forEach((cellId) => {
      const [rowId, columnId] = cellId.split(':')

      // 🔧 Use coordinator for cell position (single source of truth)
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

        fileLog.debug('📍 Cell position from coordinator', {
          cellId,
          x: coordPosition.x,
          y: coordPosition.y,
          width: columnWidth,
          coordinatorVersion: this.coordinateManager.getVersion(),
        })

        visualPositions.push(visualPos)
      } else {
        fileLog.warn('❌ Cell position not found in coordinator', { cellId, rowId, columnId })
      }
    })

    fileLog.info('✅ Visual positions from coordinator', {
      cellCount: selectedCells.size,
      positionsFound: visualPositions.length,
    })

    return visualPositions
  }

  /**
   * Get cell position for editing overlay
   */
  private getCellPosition(
    rowId: string,
    columnId: string,
  ): { x: number; y: number; width: number; height: number } | null {
    // PERFORMANCE FIX: Use cached scroll position instead of DOM read
    const cachedViewport = PositionEvents.getViewportCache()
    const currentScrollLeft = cachedViewport.scrollLeft || 0

    const cellKey = `${rowId}:${columnId}`

    // Try DOM position first (highest accuracy)
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

    // DIRECT SOLUTION: Calculate position directly from DOM
    fileLog.debug('DOM position not cached, calculating directly', { cellKey })

    const cell = this.container.querySelector(
      `[data-row-id="${rowId}"][data-column-id="${columnId}"]`,
    ) as HTMLElement
    if (cell) {
      // Find the actual scrollable container that contains this cell
      let viewportContainer = cell.closest('.vibegridx-viewport') as HTMLElement
      if (!viewportContainer) {
        // Try finding from the main container
        viewportContainer = this.container.querySelector('.vibegridx-viewport') as HTMLElement
      }
      if (!viewportContainer) {
        // Fallback: find the scrollable parent of the cell
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
        fileLog.error('❌ No viewport container found - using main container', {
          cellKey,
          containerClass: this.container.className,
          cellParentClass: cell.parentElement?.className,
        })
        viewportContainer = this.container
      }

      if (viewportContainer) {
        const cellRect = cell.getBoundingClientRect()
        const viewportRect = viewportContainer.getBoundingClientRect()

        // Calculate viewport-relative position
        const relativeX = cellRect.left - viewportRect.left
        const relativeY = cellRect.top - viewportRect.top

        // CRITICAL: Add scroll offset to get absolute position within scrollable content
        // This matches the logic in dom-position-state.ts:406-407
        const scrollLeft = viewportContainer.scrollLeft || 0
        const scrollTop = viewportContainer.scrollTop || 0

        const directPosition = {
          x: relativeX + scrollLeft,
          y: relativeY + scrollTop,
          width: cellRect.width,
          height: cellRect.height,
        }

        fileLog.debug('Calculated cell position from DOM', { cellKey, position: directPosition })
        return directPosition
      }
    }

    // No DOM position means cell is not visible - overlays only render for visible cells
    fileLog.debug('Cell not visible in DOM, no overlay needed', {
      cellKey,
      rowId,
      columnId,
    })

    return null
  }

  /**
   * Get viewport info
   */
  private getViewportInfo(): ViewportInfo {
    // PERFORMANCE FIX: Use cached viewport measurements instead of DOM reads
    const cachedViewport = PositionEvents.getViewportCache()

    // If cache is fresh, use it directly
    if (cachedViewport.containerRect && cachedViewport.lastViewportUpdate > 0) {
      fileLog.debug('Using cached viewport measurements')

      return {
        start: 0,
        end: 0,
        height: cachedViewport.clientHeight,
        width: cachedViewport.clientWidth,
        scrollTop: cachedViewport.scrollTop,
        scrollLeft: cachedViewport.scrollLeft,
        viewportWidth: cachedViewport.clientWidth,
        viewportHeight: cachedViewport.clientHeight,
        itemHeight: 40,
      }
    }

    // Fallback to DOM reads if cache is empty (should be rare)
    fileLog.debug('Viewport cache miss, reading from DOM')
    const scrollContainer =
      this.bodyContainer ||
      (this.container.querySelector('.vibegridx-body-container') as HTMLElement) ||
      this.container

    let scrollTop = 0
    let scrollLeft = 0
    let viewportWidth = 0
    let viewportHeight = 0

    try {
      scrollTop = scrollContainer.scrollTop || 0
      scrollLeft = scrollContainer.scrollLeft || 0
      viewportWidth = scrollContainer.clientWidth || 0
      viewportHeight = scrollContainer.clientHeight || 0
    } catch (e) {
      fileLog.debug('Failed to get viewport measurements from DOM', e)
    }

    return {
      start: 0,
      end: 0,
      height: viewportHeight,
      width: viewportWidth,
      scrollTop,
      scrollLeft,
      viewportWidth,
      viewportHeight,
      itemHeight: 40,
    }
  }

  /**
   * Set header container reference
   */
  setHeaderContainer(headerContainer: HTMLElement | null): void {
    this.headerContainer = headerContainer
  }

  /**
   * Set body container reference
   */
  setBodyContainer(bodyContainer: HTMLElement | null): void {
    this.bodyContainer = bodyContainer
  }

  /**
   * Get EditSessionManager - DEPRECATED - removed in Phase 2
   * Use editingStore directly instead
   */
  // getEditSessionManager() method removed - EditSessionManager deleted

  /**
   * Handle fill complete - copy values from selected cells to fill target cells
   */
  private async handleFillComplete(fillCells: Set<string>): Promise<void> {
    fileLog.info('📋 Fill complete triggered', { fillCellsCount: fillCells.size })

    if (!this.onEntityUpdate) {
      fileLog.warn('📋 Fill skipped - no update callback available')
      return
    }

    const selectedCells = this.interactionStore.selectedCells
    if (selectedCells.size === 0) {
      fileLog.warn('📋 Fill skipped - no source cells selected')
      return
    }

    const rows = this.getProcessedRows()
    const columns = this.tableCoreStore.columns

    // Build row and column indices for sorting
    const rowIdToIndex = new Map<string, number>()
    rows.forEach((row, index) => rowIdToIndex.set(row.id, index))
    const columnIdToIndex = new Map<string, number>()
    columns.forEach((col: any, index: number) => columnIdToIndex.set(col.id, index))

    // Sort selected cells by row, then by column to establish pattern order
    const sortedSelectedCells = Array.from(selectedCells).sort((a, b) => {
      const [rowIdA, colIdA] = a.split(':')
      const [rowIdB, colIdB] = b.split(':')
      const rowIndexA = rowIdToIndex.get(rowIdA) ?? Infinity
      const rowIndexB = rowIdToIndex.get(rowIdB) ?? Infinity
      if (rowIndexA !== rowIndexB) {
        return rowIndexA - rowIndexB
      }
      const colIndexA = columnIdToIndex.get(colIdA) ?? Infinity
      const colIndexB = columnIdToIndex.get(colIdB) ?? Infinity
      return colIndexA - colIndexB
    })

    // Extract ALL source values in pattern order (not just first per column)
    // Group by column for pattern matching
    const sourceValuesByColumn = new Map<string, any[]>() // columnId -> array of values
    sortedSelectedCells.forEach((cellId) => {
      const [rowId, columnId] = cellId.split(':')
      const row = rows.find((r) => r.id === rowId)

      if (row) {
        const value = (row as any).data ? (row as any).data[columnId] : row[columnId]
        if (!sourceValuesByColumn.has(columnId)) {
          sourceValuesByColumn.set(columnId, [])
        }
        sourceValuesByColumn.get(columnId)!.push(value)
      }
    })

    // Calculate the pattern length (number of unique rows in selection)
    const selectedRowIds = new Set(sortedSelectedCells.map((cellId) => cellId.split(':')[0]))
    const patternLength = selectedRowIds.size

    fileLog.info('📋 Fill source pattern extracted', {
      patternLength,
      columnCount: sourceValuesByColumn.size,
      columns: Array.from(sourceValuesByColumn.keys()),
      totalSourceCells: sortedSelectedCells.length,
    })

    // Sort fill cells by row, then by column to match pattern application order
    const sortedFillCells = Array.from(fillCells).sort((a, b) => {
      const [rowIdA, colIdA] = a.split(':')
      const [rowIdB, colIdB] = b.split(':')
      const rowIndexA = rowIdToIndex.get(rowIdA) ?? Infinity
      const rowIndexB = rowIdToIndex.get(rowIdB) ?? Infinity
      if (rowIndexA !== rowIndexB) {
        return rowIndexA - rowIndexB
      }
      const colIndexA = columnIdToIndex.get(colIdA) ?? Infinity
      const colIndexB = columnIdToIndex.get(colIdB) ?? Infinity
      return colIndexA - colIndexB
    })

    // Apply source values to fill target cells with pattern repetition
    let successCount = 0
    let errorCount = 0
    let skippedCount = 0

    // Track which fill row we're on to calculate pattern index
    let currentFillRow = ''
    let fillRowIndex = 0

    for (const fillCellId of sortedFillCells) {
      const [rowId, columnId] = fillCellId.split(':')

      // Track row changes to calculate pattern index
      if (currentFillRow !== rowId) {
        if (currentFillRow !== '') {
          fillRowIndex++
        }
        currentFillRow = rowId
      }

      // Only fill if we have source values for this column
      if (sourceValuesByColumn.has(columnId)) {
        const columnValues = sourceValuesByColumn.get(columnId)!

        // Use modulo to repeat pattern cyclically
        const patternIndex = fillRowIndex % patternLength
        const newValue = columnValues[Math.min(patternIndex, columnValues.length - 1)]

        // Get current value of target cell
        const targetRow = rows.find((r) => r.id === rowId)
        const currentValue = targetRow
          ? (targetRow as any).data
            ? (targetRow as any).data[columnId]
            : targetRow[columnId]
          : undefined

        // Skip update if value is unchanged
        if (currentValue === newValue) {
          skippedCount++
          continue
        }

        try {
          if (this.onEntityUpdate) {
            await this.onEntityUpdate(rowId, { [columnId]: newValue })
            successCount++
          }
        } catch (error) {
          errorCount++
          fileLog.error('📋 Fill failed for cell', {
            cellId: fillCellId,
            error: error instanceof Error ? error.message : error,
          })
        }
      }
    }

    fileLog.info('📋 Fill operation completed', {
      successCount,
      errorCount,
      skippedCount,
      totalAttempted: fillCells.size,
      patternLength,
    })

    // Expand selection to include all filled cells (original + filled)
    if (successCount > 0) {
      runInAction(() => {
        const newSelection = new Set([...selectedCells, ...fillCells])
        this.interactionStore.selectedCells = newSelection
        fileLog.info('📋 Selection expanded to include filled cells', {
          originalCount: selectedCells.size,
          filledCount: fillCells.size,
          newSelectionCount: newSelection.size,
        })
      })
    }
  }

  /**
   * Clean up all overlays
   */
  destroy(): void {
    fileLog.info('🧹 Destroying overlay system') // Keep: lifecycle

    // Phase 2.6: Dispose overlay controllers
    if (this.selectionController) {
      this.selectionController.dispose()
      this.selectionController = null
    }
    if (this.editingController) {
      this.editingController.dispose()
      this.editingController = null
    }
    if (this.clipboardController) {
      this.clipboardController.dispose()
      this.clipboardController = null
    }
    if (this.resizePreviewController) {
      this.resizePreviewController.dispose()
      this.resizePreviewController = null
    }

    // Dispose of MobX reactions
    this.disposers.forEach((dispose) => dispose())
    this.disposers = []

    // Clean up RAF to prevent memory leaks
    if (this.updateSelectionRAF !== null) {
      cancelAnimationFrame(this.updateSelectionRAF)
      this.updateSelectionRAF = null
    }

    // Clear caches
    this.lastSelectionVersion = -1
    this.lastClipboardVersion = -1
    this.lastCoordinateMappingVersion = -1

    // Clear selections using interaction-state
    this.interactionStore.clearSelection()

    if (this.canvasOverlay) {
      this.canvasOverlay.destroy()
      this.canvasOverlay = null
    }

    if (this.editingOverlay) {
      this.editingOverlay.hide()
      this.editingOverlay = null
    }

    if (this.contextMenu) {
      this.contextMenu.destroy()
      this.contextMenu = null
    }

    if (this.columnDragOverlay) {
      this.columnDragOverlay.destroy()
      this.columnDragOverlay = null
    }

    // Note: FillHandleLayer cleanup handled by CanvasOverlayDOM.destroy()

    // Selection cleanup not needed - handled by interaction-state

    fileLog.info('✅ Overlay system destroyed') // Keep: lifecycle
  }

  /**
   * Get canvas overlay instance (for direct access when needed)
   */
  getCanvasOverlay(): CanvasOverlayDOM | null {
    return this.canvasOverlay
  }

  /**
   * Get selection manager instance
   */
  // Selection is managed through tableInteraction$ - no separate manager needed

  /**
   * Get editing overlay instance
   */
  getEditingOverlay(): EditingOverlay | null {
    return this.editingOverlay
  }

  /**
   * Get context menu instance
   */
  getContextMenu(): ContextMenuManager | null {
    return this.contextMenu
  }

  /**
   * Get column drag overlay instance
   */
  getColumnDragOverlay(): ColumnDragOverlayDOM | null {
    return this.columnDragOverlay
  }

  /**
   * Update coordinate mapping for all overlays
   * This method is called by SimplePassiveRenderer when coordinates change
   */
  updateCoordinateMapping(mapping: CoordinateMapping): void {
    // PERFORMANCE: Deduplicate coordinate mapping updates
    if (this.lastCoordinateMappingVersion === mapping.version) {
      fileLog.debug('🔄 Coordinate mapping unchanged, skipping update', {
        version: mapping.version,
        lastVersion: this.lastCoordinateMappingVersion,
      })
      return
    }

    this.lastCoordinateMappingVersion = mapping.version

    // Store the mapping so we can pass it when overlays are lazy-created
    this.coordinateMapping = mapping

    fileLog.debug('[RESIZE-PREVIEW] 🔄 OverlayManager: Coordinate mapping updated', {
      version: mapping.version,
      rowCount: mapping.rows.length,
      columnCount: mapping.columns.length,
      storedMapping: !!this.coordinateMapping,
    })

    // Delegate to canvas overlay which handles all sub-overlays
    if (this.canvasOverlay) {
      fileLog.debug('[RESIZE-PREVIEW] 📍 Passing mapping to CanvasOverlay')
      this.canvasOverlay.updateCoordinateMapping(mapping)
    }

    // Update column drag overlay
    if (this.columnDragOverlay) {
      this.columnDragOverlay.updateCoordinateMapping(mapping)
    }

    // Note: FillHandleLayer coordinate mapping handled by CanvasOverlayDOM
  }
}
