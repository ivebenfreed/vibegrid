/**
 * ScrollPhysics - Momentum scroll physics for JS-managed vertical scrolling
 *
 * Tracks pointer velocity from recent samples and provides momentum
 * deceleration via requestAnimationFrame after pointer release.
 *
 * GH#2219 Phase 3
 */

import { getLogger } from '@/shared/lib/logging'

const fileLog = getLogger(['custom', 'vibegrid', 'renderers', 'modules', 'ScrollPhysics.ts'])

interface VelocitySample {
  dy: number
  timestamp: number
}

export class ScrollPhysics {
  /** Ring buffer of recent move samples for velocity computation */
  private samples: VelocitySample[] = []
  private readonly MAX_SAMPLES = 5

  /** Active momentum animation frame ID */
  private rafId: number | null = null

  /** Deceleration coefficient per 16.67ms frame */
  private readonly DECELERATION = 0.95

  /** Velocity below which momentum stops (px per 16.67ms frame equivalent) */
  private readonly STOP_THRESHOLD = 0.5

  /** Last pointer Y for computing deltas */
  private lastY: number | null = null

  /** Last timestamp for delta time */
  private lastTimestamp: number | null = null

  /**
   * Begin tracking a new scroll gesture.
   * Call on scroll state entry (pointerdown that resolves to scroll).
   */
  begin(clientY: number): void {
    this.samples = []
    this.lastY = clientY
    this.lastTimestamp = performance.now()
    this.cancel() // Cancel any in-flight momentum
    fileLog.debug('ScrollPhysics.begin', { clientY })
  }

  /**
   * Record a pointer move during active scrolling.
   * Returns the delta Y to apply to scrollTop.
   *
   * @returns dy (negative = scroll down, positive = scroll up) — apply as viewport.scrollTop -= dy
   */
  addMove(clientY: number): number {
    const now = performance.now()
    const dy = this.lastY !== null ? clientY - this.lastY : 0

    if (this.lastTimestamp !== null) {
      this.samples.push({ dy, timestamp: now })
      // Keep only last MAX_SAMPLES
      if (this.samples.length > this.MAX_SAMPLES) {
        this.samples.shift()
      }
    }

    this.lastY = clientY
    this.lastTimestamp = now
    return dy
  }

  /**
   * Compute velocity from recent samples (px/ms).
   * Uses the full window of samples for a smoother average.
   */
  computeVelocity(): number {
    if (this.samples.length < 2) return 0

    const first = this.samples[0]
    const last = this.samples[this.samples.length - 1]
    const totalDy = this.samples.reduce((sum, s) => sum + s.dy, 0)
    const totalDt = last.timestamp - first.timestamp

    if (totalDt === 0) return 0
    return totalDy / totalDt // px/ms
  }

  /**
   * Start momentum scroll after pointer release.
   * Applies deceleration via RAF until velocity drops below threshold or bounds are hit.
   *
   * @param viewport - The scrollable element (viewport.scrollTop is mutated)
   */
  startMomentum(viewport: HTMLElement): void {
    const velocityPxMs = this.computeVelocity()
    // Convert to px per 16.67ms frame
    let velocity = velocityPxMs * 16.67

    fileLog.debug('ScrollPhysics.startMomentum', {
      velocityPxMs,
      velocityPerFrame: velocity,
      sampleCount: this.samples.length,
    })

    if (Math.abs(velocity) < this.STOP_THRESHOLD) {
      fileLog.debug('Velocity below threshold, no momentum')
      return
    }

    let lastFrameTime = performance.now()

    const step = (now: number) => {
      const dt = now - lastFrameTime
      lastFrameTime = now

      // Time-based deceleration: velocity *= DECELERATION^(dt/16.67)
      velocity *= this.DECELERATION ** (dt / 16.67)

      if (Math.abs(velocity) < this.STOP_THRESHOLD) {
        fileLog.debug('Momentum stopped (below threshold)')
        this.rafId = null
        return
      }

      // Apply scroll: negative velocity = finger moved up = scroll down
      const maxScrollTop = viewport.scrollHeight - viewport.clientHeight
      const newScrollTop = viewport.scrollTop - velocity

      // Clamp to bounds
      viewport.scrollTop = Math.max(0, Math.min(maxScrollTop, newScrollTop))

      // Stop if we hit bounds
      if (viewport.scrollTop <= 0 || viewport.scrollTop >= maxScrollTop) {
        fileLog.debug('Momentum stopped (bounds reached)')
        this.rafId = null
        return
      }

      this.rafId = requestAnimationFrame(step)
    }

    this.rafId = requestAnimationFrame(step)
  }

  /**
   * Cancel any in-flight momentum animation.
   * Call on new pointerdown to prevent compounding velocity.
   */
  cancel(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
      fileLog.debug('Momentum cancelled')
    }
  }

  /**
   * Check if momentum is currently animating.
   */
  get isAnimating(): boolean {
    return this.rafId !== null
  }

  /**
   * Reset all state.
   */
  reset(): void {
    this.cancel()
    this.samples = []
    this.lastY = null
    this.lastTimestamp = null
  }
}
