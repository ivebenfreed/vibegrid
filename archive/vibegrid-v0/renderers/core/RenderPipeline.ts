// ====================================
// RENDER PIPELINE
// ====================================

import { log } from '@/logger'
import type { RenderState, ViewportInfo } from '../../types'
import type { HeaderEngine } from '../engines/HeaderEngine'
import type { RowEngine } from '../engines/RowEngine'
import type { ColumnManager } from '../managers/ColumnManager'
import type { VirtualScrollManager } from '../managers/VirtualScrollManager'
import type { DOMSystem } from '../systems/DOMSystem'
import type { PerformanceSystem } from '../systems/PerformanceSystem'

const fileLog = log('components/custom/vibegrid/renderers/core/RenderPipeline.ts')

// ====================================
// TYPES
// ====================================

export interface RenderPipelineConfig {
  virtualGrid: VirtualScrollManager
  domManager: DOMSystem
  headerRenderer: HeaderEngine
  rowRenderingEngine: RowEngine
  performanceMonitor: PerformanceSystem
  rowHeight: number
  onScroll?: (viewport: ViewportInfo) => void
}

export interface RenderContext {
  renderState: RenderState
  isFirstRender: boolean
}

// ====================================
// RENDER PIPELINE
// ====================================

/**
 * Orchestrates the rendering pipeline for the table
 * Manages render timing, viewport updates, and performance monitoring
 */
export class RenderPipeline {
  private config: RenderPipelineConfig
  private isFirstRender = true
  private lastRenderedDataVersion: number = -1
  private pendingRenderFrame: number | null = null

  constructor(config: RenderPipelineConfig) {
    this.config = config
  }

  /**
   * Main render method - orchestrates the entire rendering pipeline
   */
  render(state: RenderState): void {
    this.config.performanceMonitor.startRender()

    // Column information now comes from state machine coordinate mapping
    // No need to update ColumnManager as it's now passive and gets data from render state

    try {
      // STEP 1: Render header
      const headerMetrics = this.config.headerRenderer.renderHeader(state)
      this.config.performanceMonitor.recordPhase('header', headerMetrics.renderTime)

      // Check if this is the first render
      if (this.isFirstRender) {
        fileLog.info('🎨 RenderOrchestrator: First render - executing synchronously')
        this.isFirstRender = false

        // CRITICAL: Set row count BEFORE updating viewport
        this.config.virtualGrid.setRowCount(state.rows.length)

        // STEP 2: Update viewport
        const viewportStart = performance.now()
        this.updateViewport(state)
        const viewportTime = performance.now() - viewportStart
        this.config.performanceMonitor.recordPhase('viewport', viewportTime)

        // Log viewport info for debugging
        fileLog.info('🎨 RenderOrchestrator: First render viewport info AFTER updateViewport', {
          visibleRange: this.config.virtualGrid.getVisibleRange(),
          metrics: this.config.virtualGrid.getMetrics(),
        })

        // STEP 3: Render visible rows
        fileLog.info('🎨 RenderOrchestrator: About to render visible rows synchronously')
        const metrics = this.config.rowRenderingEngine.renderVisibleRows(state)
        this.config.performanceMonitor.recordPhase('visibleRows', metrics.renderTime)
        fileLog.info('🎨 RenderOrchestrator: Visible rows rendered synchronously', metrics)

        // STEP 4: Apply optimistic operations
        const optimisticStart = performance.now()
        this.config.rowRenderingEngine.applyOptimisticOperations(state.optimisticOperations)
        const optimisticTime = performance.now() - optimisticStart
        this.config.performanceMonitor.recordPhase('optimisticOps', optimisticTime)

        // Performance timing
        const totalTime = this.config.performanceMonitor.endRender(state.rows.length)
        this.config.performanceMonitor.recordPhase('total', totalTime)
        this.config.performanceMonitor.logBreakdown()

        fileLog.info('🎨 RenderOrchestrator: First render complete synchronously', {
          renderTime: totalTime,
          rowCount: state.rows.length,
          timestamp: performance.now(),
        })

        // Send viewport update for canvas overlay
        const initialViewport: ViewportInfo = {
          start: this.config.virtualGrid.getVisibleRange().start,
          end: this.config.virtualGrid.getVisibleRange().end,
          height: this.config.domManager.getElement('viewport').clientHeight,
          width: this.config.domManager.getElement('viewport').clientWidth,
          scrollTop: this.config.domManager.getElement('viewport').scrollTop,
          scrollLeft: this.config.domManager.getElement('viewport').scrollLeft,
          itemHeight: this.config.virtualGrid.getRowHeight(),
        }

        this.config.onScroll?.(initialViewport)
      } else {
        // Subsequent renders: use RAF for better performance
        // Reduce logging frequency for performance
        if (Math.random() < 0.1) {
          fileLog.info('🎨 RenderOrchestrator: Using RAF render path (subsequent render)', {
            rowCount: state.rows.length,
            columnCount: state.columns?.length,
            timestamp: performance.now(),
            firstRenderComplete: this.firstRenderComplete,
          })
        }

        // Batch all DOM reads before RAF to avoid forced reflows
        const measurements = this.batchMeasureDOMElements()
        const visibleRange = this.config.virtualGrid.getVisibleRange()
        const rowHeight = this.config.virtualGrid.getRowHeight()

        // Pre-calculate viewport updates before RAF
        let viewportHeight = measurements.viewport.client.height
        let viewportWidth = measurements.viewport.client.width

        // Fallback logic if viewport has no dimensions
        if (!viewportHeight || viewportHeight === 0) {
          viewportHeight =
            measurements.container.client.height || measurements.table.client.height || 600
        }

        if (!viewportWidth || viewportWidth === 0) {
          viewportWidth =
            measurements.container.client.width ||
            measurements.table.client.width ||
            Math.min(800, window.innerWidth - 32)
        }

        const scrollTop = measurements.viewport.scroll.top
        const scrollLeft = measurements.viewport.scroll.left

        // Calculate new viewport before RAF
        const currentViewport = this.config.virtualGrid.calculateViewportFromScroll(
          scrollTop,
          viewportHeight,
          viewportWidth,
          state.rows.length,
        )

        // Update virtual grid with new viewport (just updates internal state, no DOM)
        const hasViewportChanged = this.config.virtualGrid.updateViewport(
          currentViewport,
          state.rows.length,
        )

        // Get the updated visible range after viewport update
        const updatedVisibleRange = this.config.virtualGrid.getVisibleRange()

        // Only render if viewport actually changed or if data changed
        if (hasViewportChanged || this.hasDataChanged(state)) {
          // Cancel any pending render frame to prevent duplicate renders
          if (this.pendingRenderFrame !== null) {
            cancelAnimationFrame(this.pendingRenderFrame)
          }

          this.pendingRenderFrame = requestAnimationFrame(() => {
            this.pendingRenderFrame = null
            // Reduce logging for performance
            if (Math.random() < 0.05) {
              fileLog.info('🎨 RenderOrchestrator: RAF callback executing', {
                timestamp: performance.now(),
              })
            }

            // Only DOM writes in RAF - no reads
            this.config.rowRenderingEngine.renderVisibleRows(state)
            this.config.rowRenderingEngine.applyOptimisticOperations(state.optimisticOperations)

            // Performance timing
            const renderTime = this.config.performanceMonitor.endRender(state.rows.length)
            this.config.performanceMonitor.recordPhase('total', renderTime)

            // Send viewport update for canvas overlay using pre-calculated values
            const viewport: ViewportInfo = {
              start: updatedVisibleRange.start,
              end: updatedVisibleRange.end,
              height: viewportHeight,
              width: viewportWidth,
              scrollTop: scrollTop,
              scrollLeft: scrollLeft,
              itemHeight: rowHeight,
            }

            this.config.onScroll?.(viewport)
          })
        } else {
          // Skip render if nothing changed
          this.config.performanceMonitor.endRender(state.rows.length)
        }
      }
    } finally {
      // Performance metrics are tracked by PerformanceMonitor
    }
  }

  /**
   * Update viewport based on current dimensions and scroll position
   */
  private updateViewport(state: RenderState): void {
    // PERFORMANCE OPTIMIZATION: Batch all DOM measurements to prevent layout thrashing
    const measurements = this.batchMeasureDOMElements()

    // Use cached measurements for calculations - but check container if viewport is 0
    let viewportHeight = measurements.viewport.client.height
    let viewportWidth = measurements.viewport.client.width

    // If viewport has no height yet, try container measurements
    if (!viewportHeight || viewportHeight === 0) {
      viewportHeight =
        measurements.container.client.height || measurements.table.client.height || 600 // Ultimate fallback
      fileLog.info('🎨 RenderOrchestrator: Using container height as viewport had no height', {
        viewportHeight,
        containerHeight: measurements.container.client.height,
        tableHeight: measurements.table.client.height,
      })
    }

    if (!viewportWidth || viewportWidth === 0) {
      viewportWidth =
        measurements.container.client.width ||
        measurements.table.client.width ||
        Math.min(800, window.innerWidth - 32) // Ultimate fallback, responsive
    }

    const scrollTop = measurements.viewport.scroll.top
    const scrollLeft = measurements.viewport.scroll.left

    // Debug log actual measurements
    fileLog.info('🎨 RenderOrchestrator: updateViewport measurements', {
      viewportHeight,
      viewportWidth,
      containerHeight: measurements.container.client.height,
      viewportClientHeight: measurements.viewport.client.height,
      tableHeight: measurements.table.client.height,
      scrollTop,
      rowHeight: this.config.rowHeight,
      expectedRows: Math.ceil(viewportHeight / this.config.rowHeight),
    })

    // Use VirtualGridManager to calculate viewport
    const currentViewport = this.config.virtualGrid.calculateViewportFromScroll(
      scrollTop,
      viewportHeight,
      viewportWidth,
      scrollLeft,
    )

    this.config.virtualGrid.updateViewport(currentViewport, state.rows.length)
  }

  /**
   * Batch all DOM measurements to prevent layout thrashing.
   * The original updateViewport() method caused 42ms forced reflow by doing
   * 14 sequential DOM queries. This method consolidates them into a single pass.
   */
  private batchMeasureDOMElements() {
    // Cache DOM elements to avoid repeated lookups
    const viewportEl = this.config.domManager.getElement('viewport')
    const containerEl = this.config.domManager.getElement('container')
    const tableEl = this.config.domManager.getElement('table')

    // Batch all reads together to minimize layout recalculations
    const viewportBounds = viewportEl.getBoundingClientRect()
    const containerBounds = containerEl.getBoundingClientRect()
    const tableBounds = tableEl.getBoundingClientRect()

    return {
      viewport: {
        bounds: viewportBounds,
        client: {
          width: viewportEl.clientWidth,
          height: viewportEl.clientHeight,
        },
        scroll: {
          top: viewportEl.scrollTop || 0,
          left: viewportEl.scrollLeft || 0,
        },
        offset: {
          width: viewportEl.offsetWidth,
          height: viewportEl.offsetHeight,
        },
      },
      container: {
        bounds: containerBounds,
        client: {
          width: containerEl.clientWidth,
          height: containerEl.clientHeight,
        },
      },
      table: {
        bounds: tableBounds,
        client: {
          width: tableEl.clientWidth,
          height: tableEl.clientHeight,
        },
      },
    }
  }

  /**
   * Reset first render flag (useful for reinitialization)
   */
  resetFirstRender(): void {
    this.isFirstRender = true
    // Cancel any pending renders
    if (this.pendingRenderFrame !== null) {
      cancelAnimationFrame(this.pendingRenderFrame)
      this.pendingRenderFrame = null
    }
  }

  /**
   * Check if this is the first render
   */
  getIsFirstRender(): boolean {
    return this.isFirstRender
  }

  /**
   * Check if data has changed since last render
   */
  private hasDataChanged(state: RenderState): boolean {
    const currentVersion = state.version || 0
    const hasChanged = currentVersion !== this.lastRenderedDataVersion
    if (hasChanged) {
      this.lastRenderedDataVersion = currentVersion
    }
    return hasChanged
  }
}
