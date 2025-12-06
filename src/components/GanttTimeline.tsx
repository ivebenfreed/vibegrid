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

const TimeScaleHeader = observer(function TimeScaleHeader({
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
      className="relative border-b bg-muted/50 flex-shrink-0"
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
})

// ====================================
// GANTT BAR
// ====================================

interface GanttBarProps {
  bar: BarPosition
  onClick?: (rowId: string) => void
  rowIndex?: number
}

const GanttBar = observer(function GanttBar({ bar, onClick }: GanttBarProps) {
  return (
    <div
      className={cn(
        'absolute rounded cursor-pointer transition-colors',
        'flex items-center px-2 text-xs text-white truncate',
        'shadow-sm',
        BAR_COLORS.default,
      )}
      style={{
        left: bar.left,
        top: bar.top + 4, // Center in row with padding
        width: bar.width,
        height: bar.height,
      }}
      onClick={() => onClick?.(bar.rowId)}
      title={`${bar.label}\n${bar.startDate.toLocaleDateString()} - ${bar.endDate.toLocaleDateString()}`}
    >
      {bar.width > 60 && <span className="truncate">{bar.label}</span>}
    </div>
  )
})

// ====================================
// TODAY LINE
// ====================================

interface TodayLineProps {
  position: number
  height: number
}

const TodayLine = observer(function TodayLine({ position, height }: TodayLineProps) {
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
})

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

  const { timeScale, barPositions, todayLinePosition, timelineWidth, dependencies, scrollLeft, scrollTop } = ganttViewStore

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

  logger.debug('GanttTimeline render', {
    barCount: barPositions.length,
    dependencyCount: dependencies.length,
    timelineWidth,
    totalHeight,
    zoomLevel: timeScale.zoomLevel,
    scrollLeft,
    scrollTop,
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
        {barPositions.map((bar, index) => (
          <GanttBar key={bar.rowId} bar={bar} onClick={onBarClick} rowIndex={index} />
        ))}

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
