/**
 * Position Tracking Initialization Hooks
 *
 * These hooks handle the setup and lifecycle of the hybrid positioning system.
 */

import { useEffect, useRef } from 'react'
import { getLogger } from '@/shared/lib/logging'
import { PositionEvents, positionTracker } from '../stores/dom-position-state'
import type { ColumnLayout, PositionUpdateHandler } from '../types/coordinate-types'

const fileLog = getLogger(['custom', 'vibegrid', 'hooks', 'use-position-tracking.ts'])

/**
 * Initialize position tracking for a VibeGrid container
 *
 * This hook should be called once at the top level of VibeGrid
 */
export function usePositionTracking(
  containerRef: React.RefObject<HTMLElement>,
  options: {
    enabled?: boolean
    columns?: ColumnLayout[]
    totalRows?: number
    viewportDimensions?: { width: number; height: number }
  } = {},
) {
  const { enabled = true, columns = [], totalRows = 0 } = options
  const isInitialized = useRef(false)

  useEffect(() => {
    if (!enabled || !containerRef.current || isInitialized.current) {
      return
    }

    fileLog.debug('🎯 Initializing position tracking', {
      containerElement: containerRef.current.tagName,
      columns: columns.length,
      totalRows,
    })

    // Initialize DOM position tracking
    positionTracker.initialize(containerRef.current)

    // Virtual bounds/columns/viewport are now managed by ViewportStore.
    // No global update functions needed.

    isInitialized.current = true

    return () => {
      fileLog.debug('🧹 Cleaning up position tracking')
      positionTracker.cleanup()
      isInitialized.current = false
    }
  }, [enabled, containerRef, columns.length, totalRows])

  // Column layouts, row count, and viewport dimensions are now
  // managed by ViewportStore. The global VirtualScrollManager update
  // functions have been removed in P2 consolidation.

  return {
    isTracking: isInitialized.current,
    status: isInitialized.current ? positionTracker.getStatus() : null,
  }
}

/**
 * Hook for components that need to respond to position changes
 */
export function usePositionChangeHandler(handler: PositionUpdateHandler, deps: any[] = []) {
  useEffect(() => {
    const unsubscribe = PositionEvents.subscribe(handler)

    fileLog.debug('📡 Subscribed to position changes')

    return () => {
      unsubscribe()
      fileLog.debug('📡 Unsubscribed from position changes')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, handler])
}

/**
 * Hook for scroll event handling with virtual viewport updates
 */
export function useScrollTracking(
  scrollableRef: React.RefObject<HTMLElement>,
  options: {
    enabled?: boolean
    throttleMs?: number
  } = {},
) {
  const { enabled = true, throttleMs = 16 } = options
  const lastUpdate = useRef(0)

  useEffect(() => {
    if (!enabled || !scrollableRef.current) return

    const element = scrollableRef.current
    let rafId: number | null = null

    const handleScroll = () => {
      if (rafId) return // Already scheduled

      rafId = requestAnimationFrame(() => {
        const now = Date.now()
        if (now - lastUpdate.current < throttleMs) {
          rafId = null
          return
        }

        // Scroll position is now tracked by ViewportStore via ScrollController.
        // This hook only needs to schedule RAF for throttling.

        lastUpdate.current = now
        rafId = null

        fileLog.debug('📜 Scroll position tracked (ViewportStore handles state)')
      })
    }

    element.addEventListener('scroll', handleScroll, { passive: true })

    fileLog.debug('📜 Scroll tracking initialized')

    return () => {
      element.removeEventListener('scroll', handleScroll)
      if (rafId) {
        cancelAnimationFrame(rafId)
      }
      fileLog.debug('📜 Scroll tracking cleaned up')
    }
  }, [enabled, scrollableRef, throttleMs])
}

/**
 * Hook for resize event handling with viewport updates
 */
export function useResizeTracking(
  containerRef: React.RefObject<HTMLElement>,
  options: {
    enabled?: boolean
    throttleMs?: number
  } = {},
) {
  const { enabled = true, throttleMs = 16 } = options
  const lastUpdate = useRef(0)

  useEffect(() => {
    if (!enabled || !containerRef.current) return

    const element = containerRef.current
    let rafId: number | null = null

    const handleResize = () => {
      if (rafId) return // Already scheduled

      rafId = requestAnimationFrame(() => {
        const now = Date.now()
        if (now - lastUpdate.current < throttleMs) {
          rafId = null
          return
        }

        // Viewport dimensions are now tracked by ViewportStore.
        // This hook only needs to schedule RAF for throttling.

        lastUpdate.current = now
        rafId = null

        fileLog.debug('📐 Viewport resize tracked (ViewportStore handles state)')
      })
    }

    const resizeObserver = new ResizeObserver(handleResize)
    resizeObserver.observe(element)

    fileLog.debug('📐 Resize tracking initialized')

    return () => {
      resizeObserver.disconnect()
      if (rafId) {
        cancelAnimationFrame(rafId)
      }
      fileLog.debug('📐 Resize tracking cleaned up')
    }
  }, [enabled, containerRef, throttleMs])
}

/**
 * Hook for manual position updates (useful for testing)
 */
export function useManualPositionUpdate() {
  return {
    forceUpdate: () => {
      fileLog.debug('🔄 Manual position update triggered')
      positionTracker.forceUpdate()
    },
    // updateViewport and updateBounds removed in P2 consolidation.
    // Use ViewportStore actions directly instead.
  }
}

/**
 * Development hook for debugging position state
 */
export function usePositionDebug(enabled: boolean = false) {
  usePositionChangeHandler(
    (event) => {
      if (enabled) {
        fileLog.debug('🐛 Position change debug', {
          type: event.type,
          cellKey: event.cellKey,
          oldPosition: event.oldPosition,
          newPosition: event.newPosition,
          timestamp: event.timestamp,
        })
      }
    },
    [enabled],
  )

  return {
    getStatus: () => positionTracker.getStatus(),
    enabled,
  }
}
