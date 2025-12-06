/**
 * GanttTimeline - Renders the timeline portion of Gantt view
 *
 * Includes:
 * - Time scale header (days/weeks/months)
 * - Gantt bars for each row
 * - Today line indicator
 */

import { observer } from 'mobx-react-lite'
import React, { useRef } from 'react'
import { cn } from '@/shared/lib/utils'
import { getLogger } from '@/shared/lib/logging'
import { useGanttViewStore } from '../stores/context'
import type { BarPosition, ZoomLevel } from '../stores/GanttViewStore'
import { DependencyArrowLayer } from './DependencyArrowLayer'

const logger = getLogger(['vibegrid', 'components', 'GanttTimeline'])

// ====================================
// CONSTANTS
// ====================================

const HEADER_HEIGHT = 50
const ROW_HEIGHT = 36

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
  const containerRef = useRef<HTMLDivElement>(null)

  const { timeScale, barPositions, todayLinePosition, timelineWidth, dependencies } = ganttViewStore

  // Calculate total height based on number of rows
  const totalHeight = barPositions.length * ROW_HEIGHT

  logger.info('GanttTimeline render', {
    barCount: barPositions.length,
    dependencyCount: dependencies.length,
    timelineWidth,
    totalHeight,
    zoomLevel: timeScale.zoomLevel,
  })

  return (
    <div
      ref={containerRef}
      className={cn('h-full w-full overflow-auto', className)}
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
        {/* Grid lines (vertical) */}
        <div className="absolute inset-0 pointer-events-none">
          {/* Could add vertical grid lines here based on zoom level */}
        </div>

        {/* Today line */}
        {todayLinePosition !== null && (
          <TodayLine position={todayLinePosition} height={totalHeight} />
        )}

        {/* Render bars */}
        {barPositions.map((bar) => (
          <GanttBar key={bar.rowId} bar={bar} onClick={onBarClick} />
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
