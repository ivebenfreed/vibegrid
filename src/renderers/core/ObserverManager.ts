/**
 * ObserverManager — Manages ~12 active MobX reactions for SimplePassiveRenderer.
 *
 * Extracted from SimplePassiveRenderer.initFocusedObservers() to isolate the
 * reaction lifecycle (create, enable, dispose) into a single cohesive unit.
 *
 * GH#2034 Phase 4
 */

import { reaction, runInAction } from 'mobx'
import { getLogger } from '@/shared/lib/logging'
import { GRID_DIMENSIONS } from '../../constants/grid-dimensions'
import { determineUpdateStrategy } from '../../utils/update-router'

import type { DebugStore } from '../../stores/DebugStore'
import type { EditingStore } from '../../stores/EditingStore'
import type { InitStore } from '../../stores/InitStore'
import type { InteractionStore } from '../../stores/InteractionStore'
import type { TableCoreStore } from '../../stores/TableCoreStore'
import type { VisualStateStore } from '../../stores/VisualStateStore'
import type { ViewportStore } from '../../stores/ViewportStore'
import type { GridLineCanvas } from './GridLineCanvas'
import type { RowPreRenderBuffer } from './RowPreRenderBuffer'
import type { BodyRenderer } from '../components/BodyRenderer'

const fileLog = getLogger(['custom', 'vibegrid', 'renderers', 'core', 'ObserverManager.ts'])

/**
 * Interface for the renderer methods and state that reactions need.
 * Avoids coupling ObserverManager to the full SimplePassiveRenderer class.
 */
export interface ObserverManagerDeps {
  // Stores
  tableCoreStore: TableCoreStore
  visualStateStore: VisualStateStore
  interactionStore: InteractionStore
  editingStore: EditingStore
  initStore: InitStore
  debugStore: DebugStore
  viewportStore: ViewportStore

  // Renderer components
  getBodyRenderer(): BodyRenderer | null
  getGridLineCanvas(): GridLineCanvas | null
  getViewport(): HTMLElement | null
  getBodyContainer(): HTMLElement | null
  getPreRenderBuffer(): RowPreRenderBuffer

  // Instance state
  getIsDestroyed(): boolean

  // Visible range state (shared with SPR for virtual scroll)
  getLastVisibleColumns(): { start: number; end: number } | null
  setLastVisibleColumns(range: { start: number; end: number } | null): void
  getLastVisibleRows(): { start: number; end: number } | null
  setLastVisibleRows(range: { start: number; end: number } | null): void

  // Renderer methods called by reactions
  renderBody(): void
  renderHeader(): void
  updateColumnWidth(columnId: string, width: number): void
  handleIncrementalViewportReady(): void
  updateVirtualRows(previousRange: { start: number; end: number }, currentRange: { start: number; end: number }): void
  updateVirtualColumns(
    previousRange: { start: number; end: number },
    currentRange: { start: number; end: number },
  ): void
  setupPreRenderContext(): void
}

export class ObserverManager {
  private observersEnabled = false

  // Disposer fields for all reactions
  private dataObserverDisposer: (() => void) | null = null
  private visualObserverDisposer: (() => void) | null = null
  private columnVisibilityObserverDisposer: (() => void) | null = null
  private columnOrderObserverDisposer: (() => void) | null = null
  private columnWidthsObserverDisposer: (() => void) | null = null
  private virtualScrollObserverDisposer: (() => void) | null = null
  private horizontalScrollObserverDisposer: (() => void) | null = null
  private interactionObserverDisposer: (() => void) | null = null
  private scrollObserverDisposer: (() => void) | null = null
  private dragSelectionObserverDisposer: (() => void) | null = null
  private expansionObserverDisposer: (() => void) | null = null
  private searchFilterObserverDisposer: (() => void) | null = null
  private selectionDeltaDisposer: (() => void) | null = null
  private gridLineCanvasDisposer: (() => void) | null = null
  private disposers: (() => void)[] = []

  // Internal state for reactions
  private lastDataVersion = 0
  private lastConfigVersion = 0
  private lastStructureVersion = 0
  private _lastSelectedCells: Set<string> = new Set()
  private pendingRAF: number | null = null

  constructor(private deps: ObserverManagerDeps) {}

  /** Enable observers (after initial render). */
  enable(): void {
    this.observersEnabled = true
  }

  /** Disable observers (during re-init). */
  disable(): void {
    this.observersEnabled = false
  }

  /** Create all reactions. Called once during init. */
  init(): void {
    fileLog.info('🎯 Initializing focused observers')

    this.createDataObserver()
    this.createColumnVisibilityObserver()
    this.createSearchFilterObserver()
    this.createExpansionObserver()
    this.createIncrementalProcessingObserver()
    this.createColumnOrderObserver()
    this.createColumnWidthsObserver()
    this.createVirtualScrollObserver()
    this.createHorizontalScrollObserver()
    this.createHydrationObserver()
    this.createSelectionDeltaReaction()
    this.createGridLineCanvasReactions()

    fileLog.debug('✅ Focused observers initialized')
  }

  /** Dispose all reactions cleanly. */
  dispose(): void {
    // Cancel any pending RAF
    if (this.pendingRAF !== null) {
      cancelAnimationFrame(this.pendingRAF)
      this.pendingRAF = null
    }

    // GH#1442: Clean up canvas grid lines
    if (this.gridLineCanvasDisposer) {
      this.gridLineCanvasDisposer()
      this.gridLineCanvasDisposer = null
    }

    // Clean up focused observers
    if (this.dataObserverDisposer) {
      this.dataObserverDisposer()
      this.dataObserverDisposer = null
    }
    if (this.visualObserverDisposer) {
      this.visualObserverDisposer()
      this.visualObserverDisposer = null
    }
    if (this.columnVisibilityObserverDisposer) {
      this.columnVisibilityObserverDisposer()
      this.columnVisibilityObserverDisposer = null
    }
    if (this.columnOrderObserverDisposer) {
      this.columnOrderObserverDisposer()
      this.columnOrderObserverDisposer = null
    }
    if (this.columnWidthsObserverDisposer) {
      this.columnWidthsObserverDisposer()
      this.columnWidthsObserverDisposer = null
    }
    if (this.virtualScrollObserverDisposer) {
      this.virtualScrollObserverDisposer()
      this.virtualScrollObserverDisposer = null
    }
    if (this.horizontalScrollObserverDisposer) {
      this.horizontalScrollObserverDisposer()
      this.horizontalScrollObserverDisposer = null
    }
    if (this.interactionObserverDisposer) {
      this.interactionObserverDisposer()
      this.interactionObserverDisposer = null
    }
    if (this.scrollObserverDisposer) {
      this.scrollObserverDisposer()
      this.scrollObserverDisposer = null
    }
    if (this.dragSelectionObserverDisposer) {
      this.dragSelectionObserverDisposer()
      this.dragSelectionObserverDisposer = null
    }
    // GH#1240: Clean up expansion observer
    if (this.expansionObserverDisposer) {
      this.expansionObserverDisposer()
      this.expansionObserverDisposer = null
    }
    // GH#1391: Clean up search filter observer
    if (this.searchFilterObserverDisposer) {
      this.searchFilterObserverDisposer()
      this.searchFilterObserverDisposer = null
    }
    // GH#1437 P4: Clean up selection delta observer
    if (this.selectionDeltaDisposer) {
      this.selectionDeltaDisposer()
      this.selectionDeltaDisposer = null
    }

    // Clean up legacy disposers (if any remain)
    for (const dispose of this.disposers) dispose()
    this.disposers = []
  }

  // ====================================
  // INDIVIDUAL REACTION FACTORIES
  // ====================================

  /**
   * VERSION-BASED DATA OBSERVER
   * React to version changes instead of processedRows to avoid unnecessary recomputation.
   */
  private createDataObserver(): void {
    const { tableCoreStore, initStore } = this.deps

    fileLog.info('🎯 Creating version-based data observer - tracking dataVersion/configVersion/structureVersion')

    this.dataObserverDisposer = reaction(
      () => {
        return {
          dataVersion: tableCoreStore.dataVersion,
          configVersion: tableCoreStore.configVersion,
          structureVersion: tableCoreStore.structureVersion,
          // GH#2786 (F') P6a: badgeDataVersion dropped — relationship
          // badges now derive from row dataVersion via inline IDs, no
          // separate version counter needed.
          lastChangeMetadata: tableCoreStore.lastChangeMetadata,
        }
      },
      ({ dataVersion, configVersion, structureVersion, lastChangeMetadata }) => {
        fileLog.debug('🔍 VERSION CHANGE DETECTED', {
          observersEnabled: this.observersEnabled,
          dataVersion,
          configVersion,
          structureVersion,
          changeType: lastChangeMetadata?.type,
          estimatedCells: lastChangeMetadata?.estimatedCellCount,
          timestamp: Date.now(),
        })

        // GUARD: Skip if observers are not enabled yet
        if (!this.observersEnabled) {
          fileLog.debug('⏸️ VERSION: Observers not enabled yet')
          return
        }

        // GUARD: Only render if grid is fully initialized
        if (initStore && !initStore.isFullyHydrated) {
          fileLog.debug('⏸️ VERSION: Skipping render during initialization')
          return
        }

        // GUARD: Skip if no version change (initial reaction)
        if (
          dataVersion === this.lastDataVersion &&
          configVersion === this.lastConfigVersion &&
          structureVersion === this.lastStructureVersion
        ) {
          fileLog.debug('⏭️ No version change detected, skipping')
          return
        }

        // Update tracked versions
        this.lastDataVersion = dataVersion
        this.lastConfigVersion = configVersion
        this.lastStructureVersion = structureVersion

        // Determine update strategy using the update router
        const strategy = determineUpdateStrategy(lastChangeMetadata)

        fileLog.info('🎯 Routing update based on strategy', {
          strategy,
          changeType: lastChangeMetadata?.type,
          estimatedCells: lastChangeMetadata?.estimatedCellCount,
        })

        // Route based on strategy
        if (strategy === 'full-render') {
          fileLog.info('🔄 Full render triggered', {
            reason: lastChangeMetadata?.type || 'structural/config change',
            dataVersion,
            configVersion,
            structureVersion,
          })

          this.deps.renderBody()
          return
        }

        // GRANULAR UPDATE PATHS (cell-level or row-level)
        const changedCells = tableCoreStore.lastChangedCells

        if (!changedCells || changedCells.size === 0) {
          fileLog.warn('⚠️ Granular update strategy but no changed cells found, falling back to full render')
          this.deps.renderBody()
          return
        }

        if (strategy === 'cell-level') {
          const totalCells = Array.from(changedCells.values()).reduce((sum, cols) => sum + cols.size, 0)

          fileLog.info('🎯 Cell-level update (fast path)', {
            rowsAffected: changedCells.size,
            cellsChanged: totalCells,
            skipProcessedRowsRecompute: true,
          })

          const bodyRenderer = this.deps.getBodyRenderer()
          if (bodyRenderer) {
            bodyRenderer.updateCells(changedCells)

            // Clear the changed cells map AND stats for next update
            runInAction(() => {
              tableCoreStore.lastChangedCells.clear()
              tableCoreStore.lastChangeStats = { rowsChanged: 0, totalCellsChanged: 0 }
            })
          } else {
            fileLog.error('❌ BodyRenderer not available for cell-level update')
          }

          return
        }

        if (strategy === 'row-level') {
          fileLog.info('🎯 Row-level update (treating as cell-level for MVP)', {
            rowsAffected: changedCells.size,
            skipProcessedRowsRecompute: true,
          })

          const bodyRenderer = this.deps.getBodyRenderer()
          if (bodyRenderer) {
            bodyRenderer.updateCells(changedCells)

            // Clear the changed cells map AND stats for next update
            runInAction(() => {
              tableCoreStore.lastChangedCells.clear()
              tableCoreStore.lastChangeStats = { rowsChanged: 0, totalCellsChanged: 0 }
            })
          } else {
            fileLog.error('❌ BodyRenderer not available for row-level update')
          }

          return
        }
      },
    )
  }

  /**
   * COLUMN VISIBILITY OBSERVER: MobX reaction for column visibility changes
   */
  private createColumnVisibilityObserver(): void {
    const { visualStateStore, initStore } = this.deps

    this.columnVisibilityObserverDisposer = reaction(
      () => visualStateStore.columnVisibility,
      (columnVisibility) => {
        // GUARD: Skip if observers are not enabled yet
        if (!this.observersEnabled) {
          fileLog.debug('⏸️ COLUMN VISIBILITY: Observers not enabled yet')
          return
        }

        // GUARD: Only render if grid is fully initialized
        const isFullyInitialized = initStore.isFullyHydrated
        if (!isFullyInitialized) {
          fileLog.debug('⏸️ COLUMN VISIBILITY: Skipping render during initialization')
          return
        }

        const hiddenColumns = Object.entries(columnVisibility).filter(([_, visible]) => visible === false)

        fileLog.debug('🎨 Column visibility changed - forcing layout re-render', {
          hiddenColumnsCount: hiddenColumns.length,
          hiddenColumns: hiddenColumns.map(([id]) => id),
        })

        // Force re-render when column visibility changes
        this.deps.renderHeader()
        this.deps.renderBody()
      },
    )
  }

  /**
   * GH#1391: SEARCH FILTER OBSERVER - triggers body re-render when search text changes
   */
  private createSearchFilterObserver(): void {
    const { visualStateStore, initStore, tableCoreStore } = this.deps

    this.searchFilterObserverDisposer = reaction(
      () => visualStateStore.globalSearchText,
      (searchText) => {
        // GUARD: Skip if observers are not enabled yet
        if (!this.observersEnabled) {
          fileLog.debug('⏸️ SEARCH FILTER: Observers not enabled yet')
          return
        }

        // GUARD: Only render if grid is fully initialized
        const isFullyInitialized = initStore.isFullyHydrated
        if (!isFullyInitialized) {
          fileLog.debug('⏸️ SEARCH FILTER: Skipping render during initialization')
          return
        }

        fileLog.info('🔍 SEARCH FILTER CHANGE DETECTED - triggering body re-render', {
          searchText,
          hasSearch: searchText.trim().length > 0,
          processedRowCount: tableCoreStore.processedRows.length,
        })

        // Re-render body with filtered rows
        this.deps.renderBody()
      },
    )
  }

  /**
   * GH#1240: ROW EXPANSION OBSERVER - triggers data loading and body re-render
   */
  private createExpansionObserver(): void {
    const { interactionStore, initStore, tableCoreStore } = this.deps

    this.expansionObserverDisposer = reaction(
      () => interactionStore.expansionVersion,
      async (expansionVersion) => {
        fileLog.info('🔄 ROW EXPANSION CHANGE DETECTED', {
          expansionVersion,
          observersEnabled: this.observersEnabled,
          expandedRowIds: Array.from(interactionStore.expandedRowIds),
        })

        // GUARD: Skip if observers are not enabled yet
        if (!this.observersEnabled) {
          fileLog.debug('⏸️ EXPANSION: Observers not enabled yet')
          return
        }

        // GUARD: Only render if grid is fully initialized
        if (initStore && !initStore.isFullyHydrated) {
          fileLog.debug('⏸️ EXPANSION: Skipping render during initialization')
          return
        }

        // GH#1240: Trigger data loading for expanded rows
        // GH#1429 ML4: Guard against destroyed state to prevent memory leaks from async callbacks
        const expansionConfig = tableCoreStore.getRowExpansionConfig()
        if (expansionConfig?.enabled && expansionConfig.loadExpandedData) {
          for (const rowId of interactionStore.expandedRowIds) {
            // GH#1429 ML4: Check destroyed state before each async operation
            if (this.deps.getIsDestroyed()) {
              fileLog.debug('⏭️ Skipping expansion load - instance destroyed', { rowId })
              return
            }
            const state = interactionStore.expandedRowStates.get(rowId)
            // Only load if not already loaded or loading
            if (!state?.data && !state?.isLoading) {
              interactionStore.setExpandedDataLoading(rowId)
              try {
                const data = await expansionConfig.loadExpandedData(rowId, null)
                // GH#1429 ML4: Check destroyed state after async operation completes
                if (this.deps.getIsDestroyed()) {
                  fileLog.debug('⏭️ Skipping expansion data set - instance destroyed after load', {
                    rowId,
                  })
                  return
                }
                interactionStore.setExpandedData(rowId, data as unknown[], null)
                fileLog.info('✅ Expanded data loaded', {
                  rowId,
                  itemCount: (data as unknown[])?.length,
                })
              } catch (error) {
                // GH#1429 ML4: Check destroyed state before error handling
                if (this.deps.getIsDestroyed()) {
                  fileLog.debug('⏭️ Skipping expansion error handling - instance destroyed', {
                    rowId,
                  })
                  return
                }
                const err = error instanceof Error ? error : new Error(String(error))
                interactionStore.setExpandedData(rowId, null, err)
                fileLog.error('❌ Failed to load expanded data', { rowId, error: err.message })
              }
            }
          }
        }

        // GH#1429 ML4: Final guard before re-render
        if (this.deps.getIsDestroyed()) {
          fileLog.debug('⏭️ Skipping expansion re-render - instance destroyed')
          return
        }

        fileLog.info('🔄 Expansion state changed - triggering body re-render', {
          expandedCount: interactionStore.expandedRowIds.size,
        })

        // Force body re-render when expansion changes
        runInAction(() => {
          this.deps.renderBody()
        })
      },
    )
  }

  /**
   * GH#1422: INCREMENTAL PROCESSING OBSERVER - handles viewport-first rendering for large datasets
   */
  private createIncrementalProcessingObserver(): void {
    const { tableCoreStore, initStore } = this.deps

    const incrementalProcessingDisposer = reaction(
      () => ({
        isProcessing: tableCoreStore.isIncrementalProcessing,
        progress: tableCoreStore.processingProgress,
      }),
      ({ isProcessing, progress }) => {
        // GUARD: Skip if observers are not enabled yet
        if (!this.observersEnabled) {
          fileLog.debug('⏸️ INCREMENTAL: Observers not enabled yet')
          return
        }

        // GUARD: Only render if grid is fully initialized
        if (initStore && !initStore.isFullyHydrated) {
          fileLog.debug('⏸️ INCREMENTAL: Skipping render during initialization')
          return
        }

        // GUARD: Skip if not in incremental processing mode
        if (!isProcessing && progress === 100) {
          return
        }

        fileLog.info('📊 INCREMENTAL PROCESSING UPDATE', {
          isProcessing,
          progress,
          timestamp: Date.now(),
        })

        // When viewport is first ready (progress > 0), do an immediate render
        if (progress > 0 && progress < 100) {
          fileLog.info('🎯 Viewport ready - triggering incremental render', { progress })
          this.deps.handleIncrementalViewportReady()
        }

        // When processing completes, do a final full render
        if (progress === 100 && !isProcessing) {
          fileLog.info('✅ Incremental processing complete - triggering final render')
          this.deps.renderBody()
        }
      },
    )
    this.disposers.push(incrementalProcessingDisposer)
  }

  /**
   * COLUMN ORDER OBSERVER: MobX reaction for column order changes
   */
  private createColumnOrderObserver(): void {
    const { visualStateStore, initStore } = this.deps

    this.columnOrderObserverDisposer = reaction(
      () => visualStateStore.columnOrder,
      () => {
        fileLog.debug('🔄 COLUMN ORDER CHANGE DETECTED via dedicated observer', {
          observersEnabled: this.observersEnabled,
          timestamp: Date.now(),
        })

        // GUARD: Skip if observers are not enabled yet
        if (!this.observersEnabled) {
          fileLog.debug('⏸️ COLUMN ORDER: Observers not enabled yet')
          return
        }

        // GUARD: Only render if grid is fully initialized
        const isFullyInitialized = initStore.isFullyHydrated
        if (!isFullyInitialized) {
          fileLog.debug('⏸️ COLUMN ORDER: Skipping render during initialization')
          return
        }

        const columnOrder = visualStateStore.columnOrder

        fileLog.debug('🎨 Column order changed - forcing layout re-render', {
          columnOrderLength: columnOrder.length,
          columnOrder: columnOrder,
        })

        // Force re-render when column order changes
        runInAction(() => {
          this.deps.renderHeader()
          this.deps.renderBody()
        })
      },
    )
  }

  /**
   * COLUMN WIDTHS OBSERVER: Optimized for direct style updates (no re-render)
   */
  private createColumnWidthsObserver(): void {
    const { visualStateStore, initStore } = this.deps

    this.columnWidthsObserverDisposer = reaction(
      () => visualStateStore.columnWidths,
      (columnWidths, prevWidths) => {
        fileLog.debug('[RESIZE] 🔄 COLUMN WIDTH CHANGE DETECTED via dedicated observer', {
          observersEnabled: this.observersEnabled,
          timestamp: Date.now(),
        })

        // GUARD: Skip if observers are not enabled yet
        if (!this.observersEnabled) {
          fileLog.debug('[RESIZE] ⏸️ COLUMN WIDTHS: Observers not enabled yet')
          return
        }

        // GUARD: Only render if grid is fully initialized
        const isFullyInitialized = initStore.isFullyHydrated
        if (!isFullyInitialized) {
          fileLog.debug('[RESIZE] ⏸️ COLUMN WIDTHS: Skipping during initialization')
          return
        }

        // OPTIMIZED: Direct style updates instead of full re-render
        const changedColumns = Object.keys(columnWidths).filter(
          (columnId) => columnWidths[columnId] !== prevWidths?.[columnId],
        )

        if (changedColumns.length === 0) {
          fileLog.debug('[RESIZE] ⏭️ No actual column width changes detected')
          return
        }

        fileLog.info('[RESIZE] 🎨 Applying direct column width updates (no re-render)', {
          columnsChanged: changedColumns.length,
          changedColumnIds: changedColumns,
        })

        // Update each changed column's width directly
        changedColumns.forEach((columnId) => {
          this.deps.updateColumnWidth(columnId, columnWidths[columnId])
        })

        // Invalidate pre-render buffer
        const preRenderBuffer = this.deps.getPreRenderBuffer()
        preRenderBuffer.invalidate()
        this.deps.setupPreRenderContext()

        fileLog.debug('[RESIZE] ✅ Column widths updated via direct style manipulation', {
          columnsUpdated: changedColumns.length,
          skippedFullRender: true,
        })
      },
    )
  }

  /**
   * VIRTUAL SCROLL OBSERVER: Incremental updates with buffer-aware triggering
   */
  private createVirtualScrollObserver(): void {
    const { viewportStore, visualStateStore, tableCoreStore, debugStore } = this.deps

    this.virtualScrollObserverDisposer = reaction(
      () => viewportStore.scrollTop,
      () => {
        if (!this.observersEnabled) return

        const scrollTop = viewportStore.scrollTop
        const viewportHeight = viewportStore.viewportHeight
        const rowCount = visualStateStore.rowCount
        const buffer = GRID_DIMENSIONS.BUFFER_ROWS

        // Calculate VISIBLE range (what user can see - no buffer)
        const visibleStart = tableCoreStore.findRowAtScrollPosition(scrollTop)
        const visibleEnd = Math.min(
          rowCount,
          tableCoreStore.findRowAtScrollPosition(scrollTop + Math.max(viewportHeight, 400)) + 1,
        )

        // Calculate RENDER range (visible + buffer on both sides)
        const renderStart = Math.max(0, visibleStart - buffer)
        const renderEnd = Math.min(rowCount, visibleEnd + buffer)

        const currentRenderRange = { start: renderStart, end: renderEnd }
        const previousRenderRange = this.deps.getLastVisibleRows() || { start: -1, end: -1 }

        // Only update if visible rows would extend beyond previously rendered buffer
        const needsUpdate =
          previousRenderRange.start === -1 || // Initial render
          visibleStart < previousRenderRange.start || // Scrolled above rendered range
          visibleEnd > previousRenderRange.end // Scrolled below rendered range

        // Update debug metrics with current visible range (even if not re-rendering)
        debugStore.updateVirtualScrollMetrics({
          visibleRowStart: visibleStart,
          visibleRowEnd: visibleEnd,
          scrollTop,
          viewportHeight,
        })

        if (needsUpdate) {
          fileLog.debug('🚀 VIRTUAL SCROLL: Buffer-aware incremental update', {
            scrollTop,
            visibleRange: `${visibleStart}-${visibleEnd}`,
            renderRange: `${renderStart}-${renderEnd}`,
            previousRenderRange: `${previousRenderRange.start}-${previousRenderRange.end}`,
            reason:
              previousRenderRange.start === -1
                ? 'initial'
                : visibleStart < previousRenderRange.start
                  ? 'scrolled_up'
                  : 'scrolled_down',
          })

          // Update debug metrics with new rendered range
          debugStore.updateVirtualScrollMetrics({
            renderedRowStart: renderStart,
            renderedRowEnd: renderEnd,
          })

          this.deps.updateVirtualRows(previousRenderRange, currentRenderRange)
          this.deps.setLastVisibleRows(currentRenderRange)
        }
      },
    )
  }

  /**
   * HORIZONTAL SCROLL OBSERVER: Column virtualization - immediate update, no debounce
   */
  private createHorizontalScrollObserver(): void {
    const { viewportStore, visualStateStore } = this.deps

    this.horizontalScrollObserverDisposer = reaction(
      () => ({
        scrollLeft: viewportStore.scrollLeft,
        columnRange: visualStateStore.visibleColumnRange,
      }),
      ({ columnRange: currentColumnRange }) => {
        if (!this.observersEnabled) return

        const previousColumnRange = this.deps.getLastVisibleColumns() || { start: -1, end: -1 }

        const needsUpdate =
          previousColumnRange.start === -1 ||
          currentColumnRange.start !== previousColumnRange.start ||
          currentColumnRange.end !== previousColumnRange.end

        if (needsUpdate) {
          fileLog.debug('HORIZONTAL SCROLL: Column virtualization update', {
            previousColumnRange: `${previousColumnRange.start}-${previousColumnRange.end}`,
            newColumnRange: `${currentColumnRange.start}-${currentColumnRange.end}`,
          })

          // Invalidate pre-render buffer
          const preRenderBuffer = this.deps.getPreRenderBuffer()
          preRenderBuffer.invalidate()
          this.deps.setupPreRenderContext()

          // Always use incremental update - initial renderBody() already placed columns
          if (previousColumnRange.start !== -1) {
            this.deps.updateVirtualColumns(previousColumnRange, currentColumnRange)
          }
          this.deps.setLastVisibleColumns(currentColumnRange)
        }
      },
    )
  }

  /**
   * HYDRATION OBSERVER: Re-render when grid becomes fully hydrated (for late-arriving data)
   */
  private createHydrationObserver(): void {
    const { initStore, tableCoreStore } = this.deps

    // CRITICAL: fireImmediately ensures initial render happens if data is already loaded
    const hydrationDisposer = reaction(
      () => initStore.isFullyHydrated,
      (isHydrated) => {
        if (isHydrated && this.observersEnabled) {
          fileLog.debug('🎯 Grid fully hydrated - triggering render for any pending data', {
            rowCount: tableCoreStore.processedRows.length,
          })
          // Re-render to show any data that arrived during initialization
          this.deps.renderBody()
        }
      },
      { fireImmediately: true },
    )
    this.disposers.push(hydrationDisposer)
  }

  /**
   * GH#1437 P4: Delta-based selection reaction.
   * Computes the delta between previous and current selection and
   * only updates the CHANGED cells (O(delta)).
   */
  private createSelectionDeltaReaction(): void {
    const { interactionStore } = this.deps

    this.selectionDeltaDisposer = reaction(
      () => interactionStore.selectionVersion,
      () => {
        const newSelected = interactionStore.selectedCells
        const added: string[] = []
        const removed: string[] = []

        for (const cellId of newSelected) {
          if (!this._lastSelectedCells.has(cellId)) added.push(cellId)
        }
        for (const cellId of this._lastSelectedCells) {
          if (!newSelected.has(cellId)) removed.push(cellId)
        }
        this._lastSelectedCells = new Set(newSelected)

        // O(delta) DOM updates
        const bodyContainer = this.deps.getBodyContainer()
        for (const cellId of added) {
          const [rowId, columnId] = cellId.split(':')
          const cell = this.findCellElement(bodyContainer, rowId, columnId)
          if (cell) {
            cell.classList.add('vibegridx-selected')
            cell.setAttribute('aria-selected', 'true')
          }
        }
        for (const cellId of removed) {
          const [rowId, columnId] = cellId.split(':')
          const cell = this.findCellElement(bodyContainer, rowId, columnId)
          if (cell) {
            cell.classList.remove('vibegridx-selected')
            cell.removeAttribute('aria-selected')
          }
        }
      },
    )
  }

  /**
   * GH#1442: Set up MobX reactions for canvas grid line redraws
   */
  private createGridLineCanvasReactions(): void {
    const canvas = this.deps.getGridLineCanvas()
    if (!canvas) return

    const { visualStateStore, viewportStore, tableCoreStore } = this.deps

    // Column layout reaction: redraw on column width/order/visibility changes
    const columnDisposer = reaction(
      () => visualStateStore.columnLayouts,
      () => {
        canvas.draw()
      },
    )

    // Viewport size reaction: resize canvas and redraw
    const viewportDisposer = reaction(
      () => ({
        width: viewportStore.viewportWidth,
        height: viewportStore.viewportHeight,
      }),
      () => {
        canvas.updateCanvasSize()
        canvas.draw()
      },
      { fireImmediately: true },
    )

    // Row offsets sync: wire tableCoreStore.rowOffsets into viewportStore
    const rowOffsetsSyncDisposer = reaction(
      () => tableCoreStore.rowOffsets,
      (offsets) => {
        viewportStore.setRowOffsets(offsets)
        canvas.draw()
      },
      { fireImmediately: true },
    )

    // Combine all disposers (scroll handler cleanup stays in SPR's initGridLineCanvas lifecycle)
    this.gridLineCanvasDisposer = () => {
      columnDisposer()
      viewportDisposer()
      rowOffsetsSyncDisposer()
    }
  }

  // ====================================
  // HELPERS
  // ====================================

  /**
   * Find a cell element by rowId and columnId via DOM query.
   */
  private findCellElement(bodyContainer: HTMLElement | null, rowId: string, columnId: string): HTMLElement | null {
    const rowElement = bodyContainer?.querySelector(`[data-row-id="${rowId}"]`)
    if (!rowElement) return null
    return rowElement.querySelector(`[data-column-id="${columnId}"]`) as HTMLElement | null
  }
}
