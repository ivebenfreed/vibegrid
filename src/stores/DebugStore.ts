/**
 * VibGrid Debug Store
 *
 * MobX store for tracking performance metrics and virtual scroll diagnostics.
 * Enabled via localStorage flag: localStorage.setItem('vibegrid_debug', 'true')
 */

import { action, computed, makeObservable, observable } from 'mobx'
import type { IStore } from '@/app/stores/types'
import { getLogger } from '@/shared/lib/logging'
import { GRID_DIMENSIONS } from '../constants/grid-dimensions'

const logger = getLogger(['vibegrid', 'stores', 'DebugStore'])

export interface PerformanceMetric {
  name: string
  startTime: number
  endTime?: number
  durationMs?: number
}

export interface RenderMetrics {
  lastRenderStartMs: number
  lastRenderEndMs: number
  lastRenderDurationMs: number
  totalRenderCount: number
  avgRenderDurationMs: number
}

export interface RenderHistoryEntry {
  timestamp: number
  durationMs: number
  rowsRendered: number
  isHiccup: boolean // >16ms frame budget
}

export interface VirtualScrollMetrics {
  visibleRowStart: number
  visibleRowEnd: number
  renderedRowStart: number // Includes buffer
  renderedRowEnd: number // Includes buffer
  totalRowsInDOM: number
  totalRowsInData: number
  scrollTop: number
  viewportHeight: number
  bufferRows: number
}

/**
 * DebugStore - Performance metrics and diagnostics for VibGrid
 */
export class DebugStore implements IStore {
  // ====================================
  // DEBUG MODE
  // ====================================

  @observable isEnabled: boolean = false

  // ====================================
  // TIMING METRICS
  // ====================================

  @observable private _metrics: Map<string, PerformanceMetric> = new Map()
  @observable renderMetrics: RenderMetrics = {
    lastRenderStartMs: 0,
    lastRenderEndMs: 0,
    lastRenderDurationMs: 0,
    totalRenderCount: 0,
    avgRenderDurationMs: 0,
  }

  // ====================================
  // VIRTUAL SCROLL STATE
  // ====================================

  @observable virtualScrollMetrics: VirtualScrollMetrics = {
    visibleRowStart: -1,
    visibleRowEnd: -1,
    renderedRowStart: -1,
    renderedRowEnd: -1,
    totalRowsInDOM: 0,
    totalRowsInData: 0,
    scrollTop: 0,
    viewportHeight: 0,
    bufferRows: GRID_DIMENSIONS.BUFFER_ROWS,
  }

  // ====================================
  // PHASE TRACKING
  // ====================================

  @observable phases: Map<
    string,
    { start: number; end?: number; status: 'pending' | 'active' | 'complete' }
  > = new Map()

  // Render durations history for averaging
  private renderDurations: number[] = []
  private maxHistorySize = 50

  // ====================================
  // RENDER HISTORY (for hiccup detection)
  // ====================================

  @observable renderHistory: RenderHistoryEntry[] = []
  private maxRenderHistorySize = 30 // Show last 30 renders

  constructor() {
    makeObservable(this)
    this.checkDebugEnabled()
    logger.debug('DebugStore created', { isEnabled: this.isEnabled })
  }

  // ====================================
  // COMPUTED
  // ====================================

  @computed
  get activeMetrics(): PerformanceMetric[] {
    return Array.from(this._metrics.values()).filter((m) => !m.endTime)
  }

  @computed
  get completedMetrics(): PerformanceMetric[] {
    return Array.from(this._metrics.values())
      .filter((m) => m.endTime)
      .slice(-20) // Last 20 metrics
  }

  @computed
  get virtualRowRangeDisplay(): string {
    const { visibleRowStart, visibleRowEnd, totalRowsInData } = this.virtualScrollMetrics
    if (visibleRowStart === -1) return 'Not initialized'
    return `${visibleRowStart}-${visibleRowEnd} of ${totalRowsInData}`
  }

  @computed
  get renderedRowRangeDisplay(): string {
    const { renderedRowStart, renderedRowEnd, bufferRows } = this.virtualScrollMetrics
    if (renderedRowStart === -1) return 'Not initialized'
    return `${renderedRowStart}-${renderedRowEnd} (±${bufferRows} buffer)`
  }

  @computed
  get domEfficiency(): string {
    const { totalRowsInDOM, totalRowsInData } = this.virtualScrollMetrics
    if (totalRowsInData === 0) return 'N/A'
    const pct = ((totalRowsInDOM / totalRowsInData) * 100).toFixed(1)
    return `${totalRowsInDOM}/${totalRowsInData} (${pct}%)`
  }

  @computed
  get activePhases(): Array<{ name: string; durationMs: number; status: string }> {
    const now = performance.now()
    return Array.from(this.phases.entries()).map(([name, phase]) => ({
      name,
      durationMs: phase.end ? phase.end - phase.start : now - phase.start,
      status: phase.status,
    }))
  }

  @computed
  get hiccupCount(): number {
    return this.renderHistory.filter((r) => r.isHiccup).length
  }

  @computed
  get recentHiccups(): RenderHistoryEntry[] {
    return this.renderHistory.filter((r) => r.isHiccup).slice(-5)
  }

  // ====================================
  // ACTIONS
  // ====================================

  @action
  checkDebugEnabled(): void {
    if (typeof window !== 'undefined') {
      this.isEnabled = localStorage.getItem('vibegrid_debug') === 'true'
    }
  }

  @action
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled
    if (typeof window !== 'undefined') {
      if (enabled) {
        localStorage.setItem('vibegrid_debug', 'true')
      } else {
        localStorage.removeItem('vibegrid_debug')
      }
    }
    logger.info('Debug mode changed', { enabled })
  }

  @action
  startMetric(name: string): void {
    if (!this.isEnabled) return
    this._metrics.set(name, {
      name,
      startTime: performance.now(),
    })
  }

  @action
  endMetric(name: string): void {
    if (!this.isEnabled) return
    const metric = this._metrics.get(name)
    if (metric && !metric.endTime) {
      metric.endTime = performance.now()
      metric.durationMs = metric.endTime - metric.startTime
      logger.debug(`⏱️ ${name}: ${metric.durationMs.toFixed(2)}ms`)
    }
  }

  @action
  startPhase(name: string): void {
    if (!this.isEnabled) return
    this.phases.set(name, {
      start: performance.now(),
      status: 'active',
    })
    logger.debug(`🚀 Phase started: ${name}`)
  }

  @action
  endPhase(name: string): void {
    if (!this.isEnabled) return
    const phase = this.phases.get(name)
    if (phase) {
      phase.end = performance.now()
      phase.status = 'complete'
      const duration = phase.end - phase.start
      logger.debug(`✅ Phase complete: ${name} (${duration.toFixed(2)}ms)`)
    }
  }

  @action
  recordRender(durationMs: number, rowsRendered?: number): void {
    if (!this.isEnabled) return

    this.renderDurations.push(durationMs)
    if (this.renderDurations.length > this.maxHistorySize) {
      this.renderDurations.shift()
    }

    const avg = this.renderDurations.reduce((a, b) => a + b, 0) / this.renderDurations.length

    this.renderMetrics = {
      lastRenderStartMs: performance.now() - durationMs,
      lastRenderEndMs: performance.now(),
      lastRenderDurationMs: durationMs,
      totalRenderCount: this.renderMetrics.totalRenderCount + 1,
      avgRenderDurationMs: avg,
    }

    // Add to render history for timeline visualization
    const entry: RenderHistoryEntry = {
      timestamp: performance.now(),
      durationMs,
      rowsRendered: rowsRendered ?? this.virtualScrollMetrics.totalRowsInDOM,
      isHiccup: durationMs > 16, // Frame budget exceeded
    }

    this.renderHistory.push(entry)
    if (this.renderHistory.length > this.maxRenderHistorySize) {
      this.renderHistory.shift()
    }

    // Log hiccups for debugging
    if (entry.isHiccup) {
      logger.warn(`⚠️ HICCUP: Render took ${durationMs.toFixed(2)}ms (>${16}ms budget)`, {
        rowsRendered: entry.rowsRendered,
      })
    }
  }

  @action
  updateVirtualScrollMetrics(metrics: Partial<VirtualScrollMetrics>): void {
    if (!this.isEnabled) return
    this.virtualScrollMetrics = {
      ...this.virtualScrollMetrics,
      ...metrics,
    }
  }

  // ====================================
  // ISTORE IMPLEMENTATION
  // ====================================

  async init(): Promise<void> {
    this.checkDebugEnabled()
    logger.info('DebugStore initialized', { isEnabled: this.isEnabled })
  }

  @action
  reset(): void {
    this._metrics.clear()
    this.phases.clear()
    this.renderDurations = []
    this.renderHistory = []
    this.renderMetrics = {
      lastRenderStartMs: 0,
      lastRenderEndMs: 0,
      lastRenderDurationMs: 0,
      totalRenderCount: 0,
      avgRenderDurationMs: 0,
    }
    this.virtualScrollMetrics = {
      visibleRowStart: -1,
      visibleRowEnd: -1,
      renderedRowStart: -1,
      renderedRowEnd: -1,
      totalRowsInDOM: 0,
      totalRowsInData: 0,
      scrollTop: 0,
      viewportHeight: 0,
      bufferRows: GRID_DIMENSIONS.BUFFER_ROWS,
    }
    logger.debug('DebugStore reset')
  }

  dispose(): void {
    this.reset()
    logger.debug('DebugStore disposed')
  }
}

// ====================================
// GLOBAL DEBUG HELPERS (for console)
// ====================================

if (typeof window !== 'undefined') {
  const debugLogger = getLogger(['vibegrid', 'debug-tools'])
  ;(window as any).__VIBEGRID_DEBUG__ = {
    enable: () => {
      localStorage.setItem('vibegrid_debug', 'true')
      debugLogger.info('✅ VibGrid debug enabled. Reload to see debug overlay.')
    },
    disable: () => {
      localStorage.removeItem('vibegrid_debug')
      debugLogger.info('❌ VibGrid debug disabled. Reload to hide debug overlay.')
    },
    status: () => {
      const enabled = localStorage.getItem('vibegrid_debug') === 'true'
      debugLogger.info(`VibGrid debug: ${enabled ? '✅ enabled' : '❌ disabled'}`)
      return enabled
    },
  }
}
