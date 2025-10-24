/**
 * VibeGrid Performance Profiler
 *
 * Tracks and measures performance bottlenecks during VibeGrid initialization and rendering
 */

import { createLogger } from '@/lib/logging';

const fileLog = createLogger('components/custom/vibegrid/performance/PerformanceProfiler.ts');

export interface PerformanceMetric {
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  metadata?: Record<string, any>;
}

export interface PerformanceReport {
  sessionId: string;
  startTime: number;
  endTime?: number;
  totalDuration?: number;
  metrics: PerformanceMetric[];
  summary: {
    initializationTime: number;
    renderingTime: number;
    cellCreationTime: number;
    domManipulationTime: number;
    bottlenecks: string[];
  };
}

export class VibeGridPerformanceProfiler {
  private sessionId: string;
  private startTime: number;
  private metrics: Map<string, PerformanceMetric> = new Map();
  private activeMetrics: Set<string> = new Set();
  private enabled: boolean = false;

  constructor(enabled: boolean = true) {
    this.enabled = enabled;
    this.sessionId = `vg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.startTime = performance.now();

    if (this.enabled) {
      fileLog.debug('🚀 [PERFORMANCE] VibeGrid performance profiler started', {
        sessionId: this.sessionId,
        startTime: this.startTime
      });
    }
  }

  /**
   * Start measuring a performance metric
   */
  startMetric(name: string, metadata?: Record<string, any>): void {
    if (!this.enabled) return;

    if (this.activeMetrics.has(name)) {
      // Instead of warning, end the existing metric and start fresh
      this.endMetric(name);
      fileLog.debug('🔄 [PERFORMANCE] Restarting metric', { name });
    }

    const metric: PerformanceMetric = {
      name,
      startTime: performance.now(),
      metadata
    };

    this.metrics.set(name, metric);
    this.activeMetrics.add(name);

    fileLog.debug('⏱️ [PERFORMANCE] Started metric', {
      name,
      startTime: metric.startTime,
      metadata
    });
  }

  /**
   * End measuring a performance metric
   */
  endMetric(name: string, additionalMetadata?: Record<string, any>): number | null {
    if (!this.enabled) return null;

    const metric = this.metrics.get(name);
    if (!metric) {
      fileLog.warn('⚠️ [PERFORMANCE] Metric not found', { name });
      return null;
    }

    if (!this.activeMetrics.has(name)) {
      fileLog.warn('⚠️ [PERFORMANCE] Metric not active', { name });
      return null;
    }

    const endTime = performance.now();
    const duration = endTime - metric.startTime;

    metric.endTime = endTime;
    metric.duration = duration;
    if (additionalMetadata) {
      metric.metadata = { ...metric.metadata, ...additionalMetadata };
    }

    this.activeMetrics.delete(name);

    fileLog.debug('✅ [PERFORMANCE] Completed metric', {
      name,
      duration: `${duration.toFixed(2)}ms`,
      metadata: metric.metadata
    });

    return duration;
  }

  /**
   * Add a marker for instant events
   */
  addMarker(name: string, metadata?: Record<string, any>): void {
    if (!this.enabled) return;

    const metric: PerformanceMetric = {
      name,
      startTime: performance.now(),
      endTime: performance.now(),
      duration: 0,
      metadata
    };

    this.metrics.set(`marker-${name}-${metric.startTime}`, metric);

    fileLog.debug('📍 [PERFORMANCE] Added marker', {
      name,
      time: metric.startTime,
      metadata
    });
  }

  /**
   * Generate performance report
   */
  generateReport(): PerformanceReport {
    const endTime = performance.now();
    const totalDuration = endTime - this.startTime;

    const metricsArray = Array.from(this.metrics.values());

    // Calculate summary metrics
    const initMetrics = metricsArray.filter(m =>
      m.name.includes('init') || m.name.includes('dependency')
    );
    const renderMetrics = metricsArray.filter(m =>
      m.name.includes('render') || m.name.includes('body')
    );
    const cellMetrics = metricsArray.filter(m =>
      m.name.includes('cell') || m.name.includes('row')
    );
    const domMetrics = metricsArray.filter(m =>
      m.name.includes('dom') || m.name.includes('element')
    );

    const initializationTime = initMetrics.reduce((sum, m) => sum + (m.duration || 0), 0);
    const renderingTime = renderMetrics.reduce((sum, m) => sum + (m.duration || 0), 0);
    const cellCreationTime = cellMetrics.reduce((sum, m) => sum + (m.duration || 0), 0);
    const domManipulationTime = domMetrics.reduce((sum, m) => sum + (m.duration || 0), 0);

    // Identify bottlenecks (metrics taking > 100ms)
    const bottlenecks = metricsArray
      .filter(m => (m.duration || 0) > 100)
      .map(m => `${m.name}: ${m.duration?.toFixed(2)}ms`)
      .sort((a, b) => {
        const durationA = parseFloat(a.split(': ')[1]);
        const durationB = parseFloat(b.split(': ')[1]);
        return durationB - durationA;
      });

    const report: PerformanceReport = {
      sessionId: this.sessionId,
      startTime: this.startTime,
      endTime,
      totalDuration,
      metrics: metricsArray,
      summary: {
        initializationTime,
        renderingTime,
        cellCreationTime,
        domManipulationTime,
        bottlenecks
      }
    };

    if (this.enabled) {
      fileLog.debug('📊 [PERFORMANCE] Performance report generated', {
        sessionId: this.sessionId,
        totalDuration: `${totalDuration.toFixed(2)}ms`,
        summary: report.summary,
        metricsCount: metricsArray.length
      });
    }

    return report;
  }

  /**
   * Log performance summary to console
   */
  logSummary(): void {
    if (!this.enabled) return;

    const report = this.generateReport();

    fileLog.debug('🚀 VibeGrid Performance Report', {
      sessionId: report.sessionId,
      totalDuration: report.totalDuration?.toFixed(2),
      breakdown: {
        initialization: report.summary.initializationTime.toFixed(2),
        rendering: report.summary.renderingTime.toFixed(2),
        cellCreation: report.summary.cellCreationTime.toFixed(2),
        domOperations: report.summary.domManipulationTime.toFixed(2)
      },
      bottlenecks: report.summary.bottlenecks.length > 0 ? report.summary.bottlenecks : undefined,
      totalMetrics: report.metrics.length
    });
  }

  /**
   * Get current session ID
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Check if profiler is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Enable or disable profiler
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (enabled) {
      fileLog.debug('✅ [PERFORMANCE] Profiler enabled');
    } else {
      fileLog.debug('⏸️ [PERFORMANCE] Profiler disabled');
    }
  }
}

// Global instance for easy access
export const vibeGridProfiler = new VibeGridPerformanceProfiler(
  // Enable in development or when explicitly requested
  process.env.NODE_ENV === 'development' ||
  typeof window !== 'undefined' && (window as any).enableVibeGridProfiler
);

// Expose to window for debugging
if (typeof window !== 'undefined') {
  (window as any).vibeGridProfiler = vibeGridProfiler;
}