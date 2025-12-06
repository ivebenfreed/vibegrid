/**
 * GanttTimeline - Renders the timeline portion of Gantt view
 *
 * Includes:
 * - Time scale header (days/weeks/months)
 * - Gantt bars for each row
 * - Today line indicator
 */

import { observer } from 'mobx-react-lite'
import React, { useCallback, useEffect, useRef } from 'react'
import { cn } from '@/shared/lib/utils'
import { getLogger } from '@/shared/lib/logging'
import { useGanttViewStore, useTableCoreStore } from '../stores/context'
import type { BarPosition, ZoomLevel } from '../stores/GanttViewStore'
import { DependencyArrowLayer } from './DependencyArrowLayer'

const logger = getLogger(['vibegrid', 'components', 'GanttTimeline'])

// ====================================
// CONSTANTS
// ====================================

const HEADER_HEIGHT = 48 // Match table column header height (GRID_DIMENSIONS.HEADER_HEIGHT)
const ROW_HEIGHT = 40 // Match table row height (GRID_DIMENSIONS.ROW_HEIGHT)

// Colors for bars (can be based on status later)
const BAR_COLORS = {
  default: 'bg-primary/80 hover:bg-primary',
  completed: 'bg-green-500/80 hover:bg-green-500',
  blocked: 'bg-red-500/80 hover:bg-red-500',
  active: 'bg-blue-500/80 hover:bg-blue-500',
}

// ====================================
// TIME SCALE HEADER
// ====================================

interface TimeScaleHeaderProps {
  startDate: Date
  endDate: Date
  pixelsPerDay: number
  zoomLevel: ZoomLevel
  width: number
}

function TimeScaleHeader({
  startDate,
  endDate,
  pixelsPerDay,
  zoomLevel,
  width,
}: TimeScaleHeaderProps) {
  const markers: { date: Date; label: string; left: number }[] = []

  // Generate markers based on zoom level
  const current = new Date(startDate)
  current.setHours(0, 0, 0, 0)

  while (current <= endDate) {
    const daysSinceStart = Math.floor(
      (current.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000),
    )
    const left = daysSinceStart * pixelsPerDay

    let label = ''
    let showMarker = false

    switch (zoomLevel) {
      case 'day':
        // Show every day
        label = current.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' })
        showMarker = true
        break
      case 'week':
        // Show every Monday
        if (current.getDay() === 1) {
          label = current.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          showMarker = true
        }
        break
      case 'month':
        // Show first of each month
        if (current.getDate() === 1) {
          label = current.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
          showMarker = true
        }
        break
      case 'quarter':
        // Show first of each quarter
        if (current.getDate() === 1 && current.getMonth() % 3 === 0) {
          label = `Q${Math.floor(current.getMonth() / 3) + 1} ${current.getFullYear()}`
          showMarker = true
        }
        break
    }

    if (showMarker) {
      markers.push({ date: new Date(current), label, left })
    }

    current.setDate(current.getDate() + 1)
  }

  return (
    <div
      className="relative border-b bg-muted/50 flex-shrink-0 sticky top-0 z-20"
      style={{ height: HEADER_HEIGHT, width }}
    >
      {markers.map((marker, i) => (
        <div
          key={i}
          className="absolute flex flex-col items-start"
          style={{ left: marker.left }}
        >
          <div className="h-2 w-px bg-border" />
          <span className="text-xs text-muted-foreground whitespace-nowrap px-1">
            {marker.label}
          </span>
        </div>
      ))}
    </div>
  )
}

// ====================================
// GANTT BAR
// ====================================

interface GanttBarProps {
  bar: BarPosition
  isPreview?: boolean
  isDragging?: boolean
  onClick?: (rowId: string) => void
  onDragStart?: (barId: string, mode: 'move' | 'resize-start' | 'resize-end', startX: number) => void
}

const HANDLE_WIDTH = 8 // Width of resize handles in pixels

function GanttBar({
  bar,
  isPreview = false,
  isDragging = false,
  onClick,
  onDragStart,
}: GanttBarProps) {
  // Handle pointer down on the bar body (move operation)
  const handleBodyPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return // Only left mouse button
    e.preventDefault()
    e.stopPropagation()
    onDragStart?.(bar.rowId, 'move', e.clientX)
  }

  // Handle pointer down on left edge (resize start)
  const handleLeftHandlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    onDragStart?.(bar.rowId, 'resize-start', e.clientX)
  }

  // Handle pointer down on right edge (resize end)
  const handleRightHandlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    onDragStart?.(bar.rowId, 'resize-end', e.clientX)
  }

  // Don't allow click during drag
  const handleClick = (e: React.MouseEvent) => {
    if (isDragging) {
      e.preventDefault()
      e.stopPropagation()
      return
    }
    onClick?.(bar.rowId)
  }

  // Determine if bar is too narrow to fit text inside
  // Use text length to estimate needed width (~7px per character + padding)
  const estimatedTextWidth = bar.label.length * 7 + 24
  const isNarrowBar = bar.width < estimatedTextWidth

  return (
    <div
      className={cn(
        'absolute rounded transition-colors select-none',
        'flex items-center text-xs',
        'shadow-sm group',
        isPreview ? 'opacity-70 border-2 border-dashed border-primary' : BAR_COLORS.default,
        isDragging && !isPreview && 'opacity-40',
      )}
      style={{
        left: bar.left,
        top: bar.top + 4, // Center in row with padding
        width: bar.width,
        height: bar.height,
      }}
      onClick={handleClick}
      title={`${bar.label}\n${bar.startDate.toLocaleDateString()} - ${bar.endDate.toLocaleDateString()}`}
    >
      {/* Left resize handle */}
      <div
        className={cn(
          'absolute left-0 top-0 bottom-0 cursor-ew-resize',
          'opacity-0 group-hover:opacity-100 hover:bg-white/30',
          'rounded-l transition-opacity',
        )}
        style={{ width: HANDLE_WIDTH }}
        onPointerDown={handleLeftHandlePointerDown}
      />

      {/* Bar body (for move) */}
      <div
        className="flex-1 h-full flex items-center cursor-grab active:cursor-grabbing overflow-visible"
        onPointerDown={handleBodyPointerDown}
      >
        {/* Label - inside bar for wide bars, overflow right for narrow bars */}
        <span
          className={cn(
            'whitespace-nowrap text-xs pointer-events-none',
            isNarrowBar
              ? 'absolute left-full ml-2 text-foreground/80' // Overflow to right
              : 'px-2 text-white truncate w-full text-center', // Inside bar
          )}
        >
          {bar.label}
        </span>
      </div>

      {/* Right resize handle */}
      <div
        className={cn(
          'absolute right-0 top-0 bottom-0 cursor-ew-resize',
          'opacity-0 group-hover:opacity-100 hover:bg-white/30',
          'rounded-r transition-opacity',
        )}
        style={{ width: HANDLE_WIDTH }}
        onPointerDown={handleRightHandlePointerDown}
      />
    </div>
  )
}

// ====================================
// TODAY LINE
// ====================================

interface TodayLineProps {
  position: number
  height: number
}

function TodayLine({ position, height }: TodayLineProps) {
  return (
    <div
      className="absolute w-0.5 bg-red-500 z-10 pointer-events-none"
      style={{
        left: position,
        top: 0,
        height,
      }}
    >
      <div className="absolute -top-1 -left-1 w-2.5 h-2.5 bg-red-500 rounded-full" />
    </div>
  )
}

// ====================================
// MAIN COMPONENT
// ====================================

interface GanttTimelineProps {
  className?: string
  onBarClick?: (rowId: string) => void
}

export const GanttTimeline = observer(function GanttTimeline({
  className,
  onBarClick,
}: GanttTimelineProps) {
  const ganttViewStore = useGanttViewStore()
  const tableCoreStore = useTableCoreStore()
  const containerRef = useRef<HTMLDivElement>(null)

  const { timeScale, barPositions, todayLinePosition, timelineWidth, dependencies, scrollLeft, scrollTop, dragState } = ganttViewStore

  // Get actual row count from table (matches table view exactly)
  const rowCount = tableCoreStore.processedRows.length

  // Calculate total height based on actual row count
  const totalHeight = rowCount * ROW_HEIGHT

  // Handle scroll events - save to MobX store
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget
    ganttViewStore.setScrollPosition(target.scrollLeft, target.scrollTop)
  }, [ganttViewStore])

  // Restore scroll position from store on mount and when values change programmatically
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // Only update if different (avoid infinite loop)
    if (Math.abs(container.scrollLeft - scrollLeft) > 1) {
      container.scrollLeft = scrollLeft
    }
    if (Math.abs(container.scrollTop - scrollTop) > 1) {
      container.scrollTop = scrollTop
    }
  }, [scrollLeft, scrollTop])

  // ====================================
  // DRAG HANDLING
  // ====================================

  // Start drag on a bar
  const handleDragStart = useCallback(
    (barId: string, mode: 'move' | 'resize-start' | 'resize-end', startX: number) => {
      ganttViewStore.startDrag(barId, mode, startX)
    },
    [ganttViewStore],
  )

  // Global pointer move handler during drag
  useEffect(() => {
    if (!dragState.isDragging) return

    const handlePointerMove = (e: PointerEvent) => {
      ganttViewStore.updateDrag(e.clientX)
    }

    const handlePointerUp = () => {
      ganttViewStore.endDrag()
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        ganttViewStore.cancelDrag()
      }
    }

    // Add global listeners
    document.addEventListener('pointermove', handlePointerMove)
    document.addEventListener('pointerup', handlePointerUp)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointermove', handlePointerMove)
      document.removeEventListener('pointerup', handlePointerUp)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [dragState.isDragging, ganttViewStore])

  logger.debug('GanttTimeline render', {
    barCount: barPositions.length,
    dependencyCount: dependencies.length,
    timelineWidth,
    totalHeight,
    zoomLevel: timeScale.zoomLevel,
    scrollLeft,
    scrollTop,
    isDragging: dragState.isDragging,
  })

  return (
    <div
      ref={containerRef}
      className={cn('h-full w-full overflow-auto', className)}
      onScroll={handleScroll}
    >
      {/* Time scale header */}
      <TimeScaleHeader
        startDate={timeScale.startDate}
        endDate={timeScale.endDate}
        pixelsPerDay={timeScale.pixelsPerDay}
        zoomLevel={timeScale.zoomLevel}
        width={timelineWidth}
      />

      {/* Bars container */}
      <div
        className="relative"
        style={{
          width: timelineWidth,
          height: totalHeight,
          minHeight: 400,
        }}
      >
        {/* Row backgrounds (zebra striping) - matches table */}
        <div className="absolute inset-0 pointer-events-none">
          {Array.from({ length: rowCount }, (_, index) => (
            <div
              key={`row-bg-${index}`}
              className={index % 2 === 0 ? 'bg-background' : 'bg-muted'}
              style={{
                position: 'absolute',
                left: 0,
                top: index * ROW_HEIGHT,
                width: '100%',
                height: ROW_HEIGHT,
                borderBottom: '1px solid var(--border)',
              }}
            />
          ))}
        </div>

        {/* Today line */}
        {todayLinePosition !== null && (
          <TodayLine position={todayLinePosition} height={totalHeight} />
        )}

        {/* Render bars */}
        {barPositions.map((bar) => (
          <GanttBar
            key={bar.rowId}
            bar={bar}
            isDragging={dragState.isDragging && dragState.barId === bar.rowId}
            onClick={onBarClick}
            onDragStart={handleDragStart}
          />
        ))}

        {/* Preview bar during drag */}
        {dragState.isDragging && dragState.previewBar && (
          <GanttBar
            key="preview-bar"
            bar={dragState.previewBar}
            isPreview={true}
          />
        )}

        {/* Dependency arrows */}
        {dependencies.length > 0 && (
          <DependencyArrowLayer
            dependencies={dependencies}
            barPositions={barPositions}
            width={timelineWidth}
            height={totalHeight}
          />
        )}

        {/* Empty state */}
        {barPositions.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
            No tasks with dates to display
          </div>
        )}
      </div>
    </div>
  )
})
