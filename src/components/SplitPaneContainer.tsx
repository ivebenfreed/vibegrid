/**
 * SplitPaneContainer - Two-pane layout with resizable divider
 *
 * Used in Gantt view to show:
 * - Left pane: Table columns (existing Vibegrid body)
 * - Right pane: Timeline with bars
 *
 * Both panes share synced vertical scroll.
 */

import { observer } from 'mobx-react-lite'
import type React from 'react'
import { useCallback, useRef, useEffect } from 'react'
import { cn } from '@/shared/lib/utils'
import { getLogger } from '@/shared/lib/logging'
import { CutoffResizer } from './CutoffResizer'

const logger = getLogger(['vibegrid', 'components', 'SplitPaneContainer'])

// ====================================
// COMPONENT PROPS
// ====================================

interface SplitPaneContainerProps {
  /** Content for the left pane */
  leftPane: React.ReactNode
  /** Content for the right pane */
  rightPane: React.ReactNode
  /** Width of the left pane in pixels */
  cutoffWidth: number
  /** Called when cutoff width changes */
  onCutoffResize: (newWidth: number) => void
  /** Called when resize ends (for persistence) */
  onResizeEnd?: () => void
  /** Called on double-click (reset to default) */
  onReset?: () => void
  /** Minimum width for left pane */
  minLeftWidth?: number
  /** Maximum width for left pane */
  maxLeftWidth?: number
  /** Additional class names for container */
  className?: string
  /** Height of the container */
  height?: number | string
}

// ====================================
// COMPONENT
// ====================================

export const SplitPaneContainer = observer(function SplitPaneContainer({
  leftPane,
  rightPane,
  cutoffWidth,
  onCutoffResize,
  onResizeEnd,
  onReset,
  minLeftWidth = 200,
  maxLeftWidth,
  className,
  height = '100%',
}: SplitPaneContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const leftPaneRef = useRef<HTMLDivElement>(null)
  const rightPaneRef = useRef<HTMLDivElement>(null)

  // Handle resize delta from CutoffResizer
  const handleResize = useCallback(
    (deltaX: number) => {
      const containerWidth = containerRef.current?.clientWidth ?? 1000
      const effectiveMaxWidth = maxLeftWidth ?? containerWidth * 0.7

      let newWidth = cutoffWidth + deltaX

      // Clamp to bounds
      newWidth = Math.max(minLeftWidth, Math.min(newWidth, effectiveMaxWidth))

      if (newWidth !== cutoffWidth) {
        onCutoffResize(newWidth)
      }
    },
    [cutoffWidth, onCutoffResize, minLeftWidth, maxLeftWidth],
  )

  // Sync vertical scroll between panes
  useEffect(() => {
    const leftEl = leftPaneRef.current
    const rightEl = rightPaneRef.current

    if (!leftEl || !rightEl) return

    let isSyncing = false

    const syncScroll = (source: HTMLElement, target: HTMLElement) => {
      if (isSyncing) return

      isSyncing = true
      target.scrollTop = source.scrollTop
      // Reset flag after next frame to prevent loops
      requestAnimationFrame(() => {
        isSyncing = false
      })
    }

    const handleLeftScroll = () => syncScroll(leftEl, rightEl)
    const handleRightScroll = () => syncScroll(rightEl, leftEl)

    leftEl.addEventListener('scroll', handleLeftScroll, { passive: true })
    rightEl.addEventListener('scroll', handleRightScroll, { passive: true })

    logger.debug('Scroll sync listeners attached')

    return () => {
      leftEl.removeEventListener('scroll', handleLeftScroll)
      rightEl.removeEventListener('scroll', handleRightScroll)
      logger.debug('Scroll sync listeners detached')
    }
  }, [])

  return (
    <div
      ref={containerRef}
      className={cn('flex flex-row overflow-hidden', className)}
      style={{ height }}
    >
      {/* Left Pane (Table) */}
      <div ref={leftPaneRef} className="flex-shrink-0 overflow-auto" style={{ width: cutoffWidth }}>
        {leftPane}
      </div>

      {/* Resizer */}
      <CutoffResizer onResize={handleResize} onResizeEnd={onResizeEnd} onReset={onReset} />

      {/* Right Pane (Timeline) */}
      <div ref={rightPaneRef} className="flex-1 overflow-auto min-w-0">
        {rightPane}
      </div>
    </div>
  )
})
