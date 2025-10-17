import { log } from '@/logger';
const fileLog = log('components/custom/vibegrid/renderers/systems/PerformanceSystem.ts');
// ====================================
// PERFORMANCE MONITOR
// ====================================

// ====================================
// TYPES
// ====================================

export interface PerformanceTargets {
  initialRender: number;    // Target time for initial render (ms)
  cellUpdate: number;       // Target time for single cell update (ms)
  scrollFPS: number;        // Target FPS for scrolling
  batchSize: number;        // Max cells per batch update
}

export interface RenderPhaseMetrics {
  header: number;
  viewport: number;
  visibleRows: number;
  optimisticOps: number;
  total: number;
}

export interface PerformanceMetrics {
  lastRenderTime: number;
  averageRenderTime: number;
  frameRate: number;
  slowRenders: number;
  renderCount: number;
  phases: RenderPhaseMetrics;
}

export interface PerformanceEvent {
  type: 'render.complete' | 'slow.render' | 'batch.update' | 'frame.drop';
  timestamp: number;
  duration: number;
  details?: any;
}

// ====================================
// CONSTANTS
// ====================================

const DEFAULT_TARGETS: PerformanceTargets = {
  initialRender: 70,
  cellUpdate: 0.5,
  scrollFPS: 60,
  batchSize: 100
};

// ====================================
// PERFORMANCE MONITOR
// ====================================

export class PerformanceSystem {
  private targets: PerformanceTargets;
  private renderHistory: number[] = [];
  private renderStartTime: number = 0;
  private lastRenderTime: number = 0;
  private slowRenderCount: number = 0;
  private renderCount: number = 0;
  private frameId: number = 0;
  private lastFrameTime: number = 0;
  private frameRates: number[] = [];
  private phaseMetrics: RenderPhaseMetrics = {
    header: 0,
    viewport: 0,
    visibleRows: 0,
    optimisticOps: 0,
    total: 0
  };
  private eventCallback?: (event: PerformanceEvent) => void;
  
  constructor(
    targets: Partial<PerformanceTargets> = {},
    eventCallback?: (event: PerformanceEvent) => void
  ) {
    this.targets = { ...DEFAULT_TARGETS, ...targets };
    this.eventCallback = eventCallback;
  }
  
  // ====================================
  // RENDER TRACKING
  // ====================================
  
  /**
   * Start tracking a render operation
   */
  startRender(): void {
    this.renderStartTime = performance.now();
  }
  
  /**
   * End render tracking and record metrics
   */
  endRender(rowCount: number = 0): number {
    const renderTime = performance.now() - this.renderStartTime;
    this.lastRenderTime = renderTime;
    this.renderCount++;
    
    // Update history (keep last 100 renders)
    this.renderHistory.push(renderTime);
    if (this.renderHistory.length > 100) {
      this.renderHistory.shift();
    }
    
    // Check for slow render
    if (renderTime > this.targets.initialRender) {
      this.slowRenderCount++;
      this.emitEvent({
        type: 'slow.render',
        timestamp: Date.now(),
        duration: renderTime,
        details: { rowCount }
      });
    }
    
    this.emitEvent({
      type: 'render.complete',
      timestamp: Date.now(),
      duration: renderTime,
      details: { rowCount }
    });
    
    return renderTime;
  }
  
  /**
   * Record phase timing
   */
  recordPhase(phase: keyof RenderPhaseMetrics, duration: number): void {
    this.phaseMetrics[phase] = duration;
  }
  
  /**
   * Update phase metrics from external measurements
   */
  updatePhaseMetrics(phases: Partial<RenderPhaseMetrics>): void {
    Object.assign(this.phaseMetrics, phases);
  }
  
  // ====================================
  // FRAME RATE TRACKING
  // ====================================
  
  /**
   * Track frame rate for smooth scrolling
   */
  trackFrame(): void {
    const now = performance.now();
    if (this.lastFrameTime) {
      const frameDuration = now - this.lastFrameTime;
      const fps = 1000 / frameDuration;
      
      this.frameRates.push(fps);
      if (this.frameRates.length > 60) { // Keep last 60 frames
        this.frameRates.shift();
      }
      
      // Check for frame drops
      if (fps < this.targets.scrollFPS * 0.8) { // 80% of target
        this.emitEvent({
          type: 'frame.drop',
          timestamp: Date.now(),
          duration: frameDuration,
          details: { fps, target: this.targets.scrollFPS }
        });
      }
    }
    this.lastFrameTime = now;
  }
  
  /**
   * Schedule next frame tracking
   */
  scheduleFrameTracking(callback: () => void): void {
    if (this.frameId) {
      cancelAnimationFrame(this.frameId);
    }
    
    this.frameId = requestAnimationFrame(() => {
      this.trackFrame();
      callback();
    });
  }
  
  /**
   * Cancel frame tracking
   */
  cancelFrameTracking(): void {
    if (this.frameId) {
      cancelAnimationFrame(this.frameId);
      this.frameId = 0;
    }
  }
  
  // ====================================
  // BATCH UPDATE TRACKING
  // ====================================
  
  /**
   * Track batch update performance
   */
  trackBatchUpdate(updateCount: number, duration: number): void {
    const perItemTime = duration / updateCount;
    
    if (perItemTime > this.targets.cellUpdate) {
      fileLog.warn(`Slow batch update: ${duration.toFixed(2)}ms for ${updateCount} cells (${perItemTime.toFixed(2)}ms per cell)`);
      
      this.emitEvent({
        type: 'batch.update',
        timestamp: Date.now(),
        duration,
        details: {
          updateCount,
          perItemTime,
          targetPerItem: this.targets.cellUpdate
        }
      });
    }
  }
  
  // ====================================
  // METRICS & REPORTING
  // ====================================
  
  /**
   * Get current performance metrics
   */
  getMetrics(): PerformanceMetrics {
    const averageRenderTime = this.renderHistory.length > 0
      ? this.renderHistory.reduce((sum, time) => sum + time, 0) / this.renderHistory.length
      : 0;
    
    const averageFrameRate = this.frameRates.length > 0
      ? this.frameRates.reduce((sum, fps) => sum + fps, 0) / this.frameRates.length
      : 0;
    
    return {
      lastRenderTime: this.lastRenderTime,
      averageRenderTime,
      frameRate: averageFrameRate,
      slowRenders: this.slowRenderCount,
      renderCount: this.renderCount,
      phases: { ...this.phaseMetrics }
    };
  }
  
  /**
   * Get performance summary
   */
  getSummary(): string {
    const metrics = this.getMetrics();
    return `Performance: ${metrics.averageRenderTime.toFixed(1)}ms avg, ${metrics.frameRate.toFixed(0)}fps, ${metrics.slowRenders}/${metrics.renderCount} slow renders`;
  }
  
  /**
   * Log detailed performance breakdown
   */
  logBreakdown(): void {
    const metrics = this.getMetrics();
    fileLog.info('🔍 RENDER PIPELINE BREAKDOWN:', {
      'Header': `${metrics.phases.header.toFixed(2)}ms`,
      'Viewport': `${metrics.phases.viewport.toFixed(2)}ms`,
      'Visible rows': `${metrics.phases.visibleRows.toFixed(2)}ms`,
      'Optimistic ops': `${metrics.phases.optimisticOps.toFixed(2)}ms`,
      'TOTAL': `${metrics.phases.total.toFixed(2)}ms`,
      'Average': `${metrics.averageRenderTime.toFixed(2)}ms`,
      'Frame rate': `${metrics.frameRate.toFixed(0)}fps`
    });
  }
  
  /**
   * Reset all metrics
   */
  reset(): void {
    this.renderHistory = [];
    this.renderStartTime = 0;
    this.lastRenderTime = 0;
    this.slowRenderCount = 0;
    this.renderCount = 0;
    this.frameRates = [];
    this.lastFrameTime = 0;
    this.phaseMetrics = {
      header: 0,
      viewport: 0,
      visibleRows: 0,
      optimisticOps: 0,
      total: 0
    };
  }
  
  /**
   * Get performance targets
   */
  getTargets(): PerformanceTargets {
    return { ...this.targets };
  }
  
  /**
   * Update performance targets
   */
  updateTargets(targets: Partial<PerformanceTargets>): void {
    Object.assign(this.targets, targets);
  }
  
  // ====================================
  // PRIVATE METHODS
  // ====================================
  
  private emitEvent(event: PerformanceEvent): void {
    this.eventCallback?.(event);
  }
}