/**
 * Position Tracking Initialization Hooks
 *
 * These hooks handle the setup and lifecycle of the hybrid positioning system.
 */

import { useEffect, useRef } from 'react'
import { getLogger } from '@/shared/lib/logging'
import { PositionEvents, positionTracker } from '../stores/dom-position-state'
import type { ColumnLayout, PositionUpdateHandler } from '../types/coordinate-types'
import {
  updateVirtualBounds,
  updateVirtualColumns,
  updateVirtualViewport,
} from '../virtualization/VirtualScrollManager'

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
  const { enabled = true, columns = [], totalRows = 0, viewportDimensions } = options
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

    // Update virtual bounds with column information
    if (columns.length > 0) {
      updateVirtualColumns(columns)
    }

    if (totalRows > 0) {
      updateVirtualBounds({ totalRows })
    }

    // Update viewport dimensions if provided
    if (viewportDimensions) {
      updateVirtualViewport({
        viewportWidth: viewportDimensions.width,
        viewportHeight: viewportDimensions.height,
      })
    }

    isInitialized.current = true

    return () => {
      fileLog.debug('🧹 Cleaning up position tracking')
      positionTracker.cleanup()
      isInitialized.current = false
    }
  }, [enabled, containerRef, columns.length, totalRows, viewportDimensions, columns])

  // Update column layouts when they change
  useEffect(() => {
    if (isInitialized.current && columns.length > 0) {
      fileLog.debug('📊 Updating column layouts', { columnCount: columns.length })
      updateVirtualColumns(columns)
    }
  }, [columns])

  // Update row count when it changes
  useEffect(() => {
    if (isInitialized.current && totalRows > 0) {
      fileLog.debug('📊 Updating row count', { totalRows })
      updateVirtualBounds({ totalRows })
    }
  }, [totalRows])

  // Update viewport dimensions when they change
  useEffect(() => {
    if (isInitialized.current && viewportDimensions) {
      fileLog.debug('📐 Updating viewport dimensions', viewportDimensions)
      updateVirtualViewport({
        viewportWidth: viewportDimensions.width,
        viewportHeight: viewportDimensions.height,
      })
    }
  }, [viewportDimensions?.width, viewportDimensions?.height, viewportDimensions])

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
  }, deps)
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

        const scrollTop = element.scrollTop
        const scrollLeft = element.scrollLeft

        updateVirtualViewport({
          scrollTop,
          scrollLeft,
        })

        lastUpdate.current = now
        rafId = null

        fileLog.debug('📜 Scroll position updated', { scrollTop, scrollLeft })
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

        const rect = element.getBoundingClientRect()

        updateVirtualViewport({
          viewportWidth: rect.width,
          viewportHeight: rect.height,
        })

        lastUpdate.current = now
        rafId = null

        fileLog.debug('📐 Viewport size updated', {
          width: rect.width,
          height: rect.height,
        })
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
    updateViewport: (viewport: {
      scrollTop?: number
      scrollLeft?: number
      viewportWidth?: number
      viewportHeight?: number
    }) => {
      fileLog.debug('🔄 Manual viewport update', viewport)
      updateVirtualViewport(viewport)
    },
    updateBounds: (bounds: { totalRows?: number; columnWidths?: number[]; rowHeight?: number }) => {
      fileLog.debug('🔄 Manual bounds update', bounds)
      updateVirtualBounds(bounds)
    },
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
