/**
 * CutoffResizer - Draggable divider between split panes
 *
 * Used in Gantt view to resize the left (table) and right (timeline) panes.
 * Double-click resets to default width.
 */

import { observer } from 'mobx-react-lite'
import type React from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/shared/lib/utils'
import { getLogger } from '@/shared/lib/logging'

const logger = getLogger(['vibegrid', 'components', 'CutoffResizer'])

// ====================================
// COMPONENT PROPS
// ====================================

interface CutoffResizerProps {
  /** Called during drag with delta X pixels */
  onResize: (deltaX: number) => void
  /** Called when drag ends */
  onResizeEnd?: () => void
  /** Called on double-click to reset */
  onReset?: () => void
  /** Additional class names */
  className?: string
}

// ====================================
// COMPONENT
// ====================================

export const CutoffResizer = observer(function CutoffResizer({
  onResize,
  onResizeEnd,
  onReset,
  className,
}: CutoffResizerProps) {
  const [isDragging, setIsDragging] = useState(false)
  const startXRef = useRef<number>(0)

  // Handle mouse down - start dragging
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    setIsDragging(true)
    startXRef.current = e.clientX

    logger.debug('Resizer drag started', { startX: e.clientX })
  }, [])

  // Handle double click - reset to default
  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()

      if (onReset) {
        onReset()
        logger.debug('Resizer reset to default')
      }
    },
    [onReset],
  )

  // Global mouse move/up handlers (attached when dragging)
  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - startXRef.current
      startXRef.current = e.clientX
      onResize(deltaX)
    }

    const handleMouseUp = () => {
      setIsDragging(false)
      onResizeEnd?.()
      logger.debug('Resizer drag ended')
    }

    // Attach global listeners
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    // Prevent text selection during drag
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }
  }, [isDragging, onResize, onResizeEnd])

  return (
    // biome-ignore lint/a11y/useSemanticElements: Custom interactive resizer element
    <div
      className={cn(
        // Base styles
        'relative flex-shrink-0 w-1 cursor-col-resize',
        'bg-border hover:bg-primary/20 transition-colors',
        // Wider hit area
        'before:absolute before:inset-y-0 before:-left-1 before:-right-1',
        'before:cursor-col-resize',
        // Active state
        isDragging && 'bg-primary/40',
        className,
      )}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
      role="separator"
      aria-orientation="vertical"
      aria-valuenow={0}
      tabIndex={0}
    >
      {/* Visual grip indicator */}
      <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 flex items-center pointer-events-none">
        <div className="w-0.5 h-8 bg-muted-foreground/30 rounded-full" />
      </div>
    </div>
  )
})
