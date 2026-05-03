/**
 * GanttTimeline - Renders the timeline portion of Gantt view
 *
 * Includes:
 * - Time scale header (days/weeks/months)
 * - Gantt bars for each row
 * - Today line indicator
 */

import { observer } from 'mobx-react-lite'
import type React from 'react'
import { useCallback, useEffect, useRef } from 'react'
import { cn } from '@/shared/lib/utils'
import { getLogger } from '@/shared/lib/logging'
import { useGanttViewStore, useTableCoreStore } from '../stores/context'
import type { DependencyEdge, DragMode, ZoomLevel } from '../stores/GanttViewStore'
import { DependencyArrowLayer } from './DependencyArrowLayer'
import { GanttBar } from './GanttBar'

const logger = getLogger(['vibegrid', 'components', 'GanttTimeline'])

// ====================================
// CONSTANTS
// ====================================

const HEADER_HEIGHT = 36 // Match GRID_DIMENSIONS.HEADER_HEIGHT
const ROW_HEIGHT = 34 // Match GRID_DIMENSIONS.ROW_HEIGHT — keep in sync with grid-dimensions.ts

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
    const daysSinceStart = Math.floor((current.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000))
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
    <div className="relative border-b bg-muted/50 flex-shrink-0" style={{ height: HEADER_HEIGHT, width }}>
      {markers.map((marker, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: stable marker order from date range
        <div key={i} className="absolute flex flex-col items-start" style={{ left: marker.left }}>
          <div className="h-2 w-px bg-border" />
          <span className="text-xs text-muted-foreground whitespace-nowrap px-1">{marker.label}</span>
        </div>
      ))}
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
// DEPENDENCY DRAG LINE
// ====================================

interface DependencyDragLineProps {
  sourceBar: { left: number; top: number; width: number; height: number } | undefined
  sourceEdge: DependencyEdge | null
  currentX: number
  currentY: number
  hasTarget: boolean
  containerRef: React.RefObject<HTMLDivElement | null>
}

function DependencyDragLine({
  sourceBar,
  sourceEdge,
  currentX,
  currentY,
  hasTarget,
  containerRef,
}: DependencyDragLineProps) {
  if (!sourceBar || !sourceEdge) return null

  // Calculate start point based on source edge
  const startX = sourceEdge === 'start' ? sourceBar.left : sourceBar.left + sourceBar.width
  const startY = sourceBar.top + sourceBar.height / 2 + 4 // +4 for the row padding

  // Convert screen coordinates to container-relative coordinates
  // The SVG is inside the bars container which starts after the header
  const containerRect = containerRef.current?.getBoundingClientRect()
  const scrollLeft = containerRef.current?.scrollLeft || 0
  const scrollTop = containerRef.current?.scrollTop || 0

  // Subtract header height since SVG is positioned inside bars container (after header)
  const endX = containerRect ? currentX - containerRect.left + scrollLeft : currentX
  const endY = containerRect ? currentY - containerRect.top + scrollTop - HEADER_HEIGHT : currentY

  // Matching style with DependencyArrowLayer
  const color = hasTarget ? '#22c55e' : '#6b7280' // green when valid target, gray otherwise

  return (
    // biome-ignore lint/a11y/noSvgWithoutTitle: decorative drag indicator
    <svg className="absolute inset-0 pointer-events-none z-40" style={{ overflow: 'visible' }}>
      {/* Simple line - no arrowhead */}
      <line
        x1={startX}
        y1={startY}
        x2={endX}
        y2={endY}
        stroke={color}
        strokeWidth={1.5}
        strokeDasharray={hasTarget ? 'none' : '4,4'}
        strokeLinecap="round"
      />
      {/* Start node */}
      <circle cx={startX} cy={startY} r={3} fill={color} />
      {/* End node (follows cursor) */}
      <circle cx={endX} cy={endY} r={hasTarget ? 5 : 3} fill={color} />
    </svg>
  )
}

// ====================================
// MAIN COMPONENT
// ====================================

interface GanttTimelineProps {
  className?: string
  onBarClick?: (rowId: string) => void
}

export const GanttTimeline = observer(function GanttTimeline({ className, onBarClick }: GanttTimelineProps) {
  const ganttViewStore = useGanttViewStore()
  const tableCoreStore = useTableCoreStore()
  const containerRef = useRef<HTMLDivElement>(null)

  const {
    timeScale,
    barPositions,
    todayLinePosition,
    timelineWidth,
    dependencies,
    scrollLeft,
    scrollTop,
    showCriticalPath,
    criticalPathIds,
    selectedDependencyId,
    dragState,
    dependencyDragState,
  } = ganttViewStore

  // Dependency arrow handlers
  const handleSelectDependency = useCallback(
    (dependencyId: string | null) => {
      ganttViewStore.selectDependency(dependencyId)
    },
    [ganttViewStore],
  )

  const handleDeleteDependency = useCallback(
    (dependencyId: string) => {
      ganttViewStore.deleteDependency(dependencyId)
    },
    [ganttViewStore],
  )

  // Bar drag handlers
  const handleDragStart = useCallback(
    (barId: string, mode: DragMode, startX: number) => {
      ganttViewStore.startDrag(barId, mode, startX)
    },
    [ganttViewStore],
  )

  // Track pointer move and up during bar drag
  useEffect(() => {
    if (!dragState.isDragging) return

    const handlePointerMove = (e: PointerEvent) => {
      ganttViewStore.updateDrag(e.clientX)
    }

    const handlePointerUp = () => {
      ganttViewStore.endDrag()
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [dragState.isDragging, ganttViewStore])

  // Dependency drag handlers
  const handleDependencyDragStart = useCallback(
    (barId: string, edge: DependencyEdge, x: number, y: number) => {
      ganttViewStore.startDependencyDrag(barId, edge, x, y)
    },
    [ganttViewStore],
  )

  const handleDependencyNodeHover = useCallback(
    (barId: string, edge: DependencyEdge) => {
      if (dependencyDragState.isDragging && barId !== dependencyDragState.sourceBarId) {
        ganttViewStore.updateDependencyDrag(dependencyDragState.currentX, dependencyDragState.currentY, barId, edge)
      }
    },
    [ganttViewStore, dependencyDragState],
  )

  const handleDependencyNodeLeave = useCallback(() => {
    if (dependencyDragState.isDragging) {
      ganttViewStore.updateDependencyDrag(
        dependencyDragState.currentX,
        dependencyDragState.currentY,
        undefined,
        undefined,
      )
    }
  }, [ganttViewStore, dependencyDragState])

  // Track pointer move and up during dependency drag
  useEffect(() => {
    if (!dependencyDragState.isDragging) return

    const handlePointerMove = (e: PointerEvent) => {
      ganttViewStore.updateDependencyDrag(e.clientX, e.clientY)
    }

    const handlePointerUp = () => {
      ganttViewStore.endDependencyDrag()
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        ganttViewStore.cancelDependencyDrag()
      }
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [dependencyDragState.isDragging, ganttViewStore])

  // Get actual row count from table (matches table view exactly)
  const rowCount = tableCoreStore.processedRows.length

  // Calculate total height based on actual row count
  const totalHeight = rowCount * ROW_HEIGHT

  // Handle scroll events - save to MobX store
  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const target = e.currentTarget
      ganttViewStore.setScrollPosition(target.scrollLeft, target.scrollTop)
    },
    [ganttViewStore],
  )

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
    <div ref={containerRef} className={cn('h-full w-full overflow-auto', className)} onScroll={handleScroll}>
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
              // biome-ignore lint/suspicious/noArrayIndexKey: positional zebra stripes never reorder
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
        {todayLinePosition !== null && <TodayLine position={todayLinePosition} height={totalHeight} />}

        {/* Render bars */}
        {barPositions.map((bar) => {
          // Get row data for dynamic shape lookup
          // GH#2812 sparse guard: find visits holes as undefined per ECMA-262 §22.1.3.9.
          const row = tableCoreStore.processedRows.find((r) => r && r.id === bar.rowId)
          const rowData = row?.data || row || {}
          const shape = ganttViewStore.getBarShapeForRow(rowData as Record<string, unknown>)
          const isDragging = dragState.isDragging && dragState.barId === bar.rowId
          const isDependencyDragTarget = dependencyDragState.isDragging && dependencyDragState.targetBarId === bar.rowId

          return (
            <GanttBar
              key={bar.rowId}
              bar={bar}
              onClick={onBarClick}
              isCritical={showCriticalPath && criticalPathIds.has(bar.rowId)}
              shape={shape}
              isDragging={isDragging}
              onDragStart={handleDragStart}
              onDependencyDragStart={handleDependencyDragStart}
              onDependencyNodeHover={handleDependencyNodeHover}
              onDependencyNodeLeave={handleDependencyNodeLeave}
              isDependencyDragTarget={isDependencyDragTarget}
            />
          )
        })}

        {/* Preview bar during drag */}
        {dragState.isDragging && dragState.previewBar && (
          <div
            className="absolute rounded bg-primary/60 border-2 border-dashed border-primary pointer-events-none z-30"
            style={{
              left: dragState.previewBar.left,
              top: dragState.previewBar.top + 4,
              width: dragState.previewBar.width,
              height: dragState.previewBar.height,
            }}
          />
        )}

        {/* Dependency drag line */}
        {dependencyDragState.isDragging && (
          <DependencyDragLine
            sourceBar={barPositions.find((b) => b.rowId === dependencyDragState.sourceBarId)}
            sourceEdge={dependencyDragState.sourceEdge}
            currentX={dependencyDragState.currentX}
            currentY={dependencyDragState.currentY}
            hasTarget={!!dependencyDragState.targetBarId}
            containerRef={containerRef}
          />
        )}

        {/* Dependency lines */}
        {dependencies.length > 0 && (
          <DependencyArrowLayer
            dependencies={dependencies}
            barPositions={barPositions}
            width={timelineWidth}
            height={totalHeight}
            showCriticalPath={showCriticalPath}
            criticalPathIds={criticalPathIds}
            selectedDependencyId={selectedDependencyId}
            onSelectDependency={handleSelectDependency}
            onDeleteDependency={handleDeleteDependency}
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
