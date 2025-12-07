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
import type { BarPosition, DependencyEdge, ZoomLevel } from '../stores/GanttViewStore'
import { DependencyArrowLayer } from './DependencyArrowLayer'

const NODE_SIZE = 12 // Size of dependency nodes in pixels

const logger = getLogger(['vibegrid', 'components', 'GanttTimeline'])

// ====================================
// CONSTANTS
// ====================================

const HEADER_HEIGHT = 48 // Match table column header height (GRID_DIMENSIONS.HEADER_HEIGHT)
const ROW_HEIGHT = 40 // Match table row height (GRID_DIMENSIONS.ROW_HEIGHT)

// Default bar color class (when no status color is provided)
const DEFAULT_BAR_CLASS = 'bg-primary/80 hover:bg-primary hover:shadow-md'

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
  isSelected?: boolean
  isDependencyDragTarget?: boolean
  onClick?: (rowId: string, isMulti: boolean) => void
  onDragStart?: (barId: string, mode: 'move' | 'resize-start' | 'resize-end', startX: number) => void
  onDependencyDragStart?: (barId: string, edge: DependencyEdge, x: number, y: number) => void
  onDependencyNodeHover?: (barId: string, edge: DependencyEdge) => void
  onDependencyNodeLeave?: () => void
}

const HANDLE_WIDTH = 8 // Width of resize handles in pixels

function GanttBar({
  bar,
  isPreview = false,
  isDragging = false,
  isSelected = false,
  isDependencyDragTarget = false,
  onClick,
  onDragStart,
  onDependencyDragStart,
  onDependencyNodeHover,
  onDependencyNodeLeave,
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

  // Handle dependency node drag start
  const handleStartNodePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    onDependencyDragStart?.(bar.rowId, 'start', e.clientX, e.clientY)
  }

  const handleEndNodePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    onDependencyDragStart?.(bar.rowId, 'end', e.clientX, e.clientY)
  }

  // Handle dependency node hover (for drop target detection)
  const handleStartNodeEnter = () => onDependencyNodeHover?.(bar.rowId, 'start')
  const handleEndNodeEnter = () => onDependencyNodeHover?.(bar.rowId, 'end')
  const handleNodeLeave = () => onDependencyNodeLeave?.()

  // Don't allow click during drag
  const handleClick = (e: React.MouseEvent) => {
    if (isDragging) {
      e.preventDefault()
      e.stopPropagation()
      return
    }
    // Cmd/Ctrl+click for multi-select
    const isMulti = e.metaKey || e.ctrlKey
    onClick?.(bar.rowId, isMulti)
  }

  // Determine if bar is too narrow to fit text inside
  // Use text length to estimate needed width (~7px per character + padding)
  const estimatedTextWidth = bar.label.length * 7 + 24
  const isNarrowBar = bar.width < estimatedTextWidth

  // Use status color from schema if available, otherwise use default class
  const hasStatusColor = !isPreview && bar.statusColor
  const barClasses = cn(
    'absolute rounded transition-all duration-150 select-none',
    'flex items-center text-xs',
    'shadow-sm group hover:z-10 hover:shadow-md',
    isPreview && 'opacity-70 border-2 border-dashed border-primary',
    !isPreview && !hasStatusColor && DEFAULT_BAR_CLASS,
    isDragging && !isPreview && 'opacity-40',
    isDependencyDragTarget && 'ring-2 ring-yellow-400 ring-offset-1',
    isSelected && 'ring-2 ring-primary ring-offset-1 ring-offset-background shadow-lg',
  )

  return (
    <div
      className={barClasses}
      style={{
        left: bar.left,
        top: bar.top + 4, // Center in row with padding
        width: bar.width,
        height: bar.height,
        // Apply status color from schema metadata if available
        ...(hasStatusColor && bar.statusColor && { backgroundColor: bar.statusColor }),
      }}
      onClick={handleClick}
      title={`${bar.label}\n${bar.startDate.toLocaleDateString()} - ${bar.endDate.toLocaleDateString()}`}
    >
      {/* Left dependency node (start) */}
      <div
        className={cn(
          'absolute rounded-full bg-blue-500 border-2 border-white shadow-md cursor-crosshair',
          'opacity-0 group-hover:opacity-100 hover:scale-125 transition-all z-20',
        )}
        style={{
          width: NODE_SIZE,
          height: NODE_SIZE,
          left: -NODE_SIZE / 2,
          top: '50%',
          transform: 'translateY(-50%)',
        }}
        onPointerDown={handleStartNodePointerDown}
        onPointerEnter={handleStartNodeEnter}
        onPointerLeave={handleNodeLeave}
        title="Drag to create dependency (from start)"
      />

      {/* Left resize handle */}
      <div
        className={cn(
          'absolute left-0 top-0 bottom-0 cursor-ew-resize',
          'opacity-0 group-hover:opacity-100 hover:bg-white/30',
          'rounded-l transition-opacity',
        )}
        style={{ width: HANDLE_WIDTH, left: NODE_SIZE / 2 }}
        onPointerDown={handleLeftHandlePointerDown}
      />

      {/* Progress fill (behind everything) */}
      {bar.progress !== null && bar.progress > 0 && (
        <div
          className="absolute inset-0 bg-white/25 rounded pointer-events-none"
          style={{ width: `${bar.progress}%` }}
        />
      )}

      {/* Bar body (for move) */}
      <div
        className="flex-1 h-full flex items-center cursor-grab active:cursor-grabbing overflow-visible relative z-10"
        onPointerDown={handleBodyPointerDown}
      >
        {/* Label - inside bar for wide bars, overflow right for narrow bars */}
        <span
          className={cn(
            'whitespace-nowrap text-xs pointer-events-none',
            isNarrowBar
              ? 'absolute left-full ml-2 text-foreground' // Overflow to right - use theme foreground
              : 'px-2 truncate w-full text-center', // Inside bar
            // When inside bar without status color (default primary bg), use white text
            !isNarrowBar && !hasStatusColor && 'text-white',
          )}
          style={
            // When inside bar with status color, use dark text since status backgrounds are light
            !isNarrowBar && hasStatusColor ? { color: '#374151' } : undefined
          }
        >
          {bar.label}
          {bar.progress !== null && ` (${Math.round(bar.progress)}%)`}
        </span>
      </div>

      {/* Right resize handle */}
      <div
        className={cn(
          'absolute top-0 bottom-0 cursor-ew-resize',
          'opacity-0 group-hover:opacity-100 hover:bg-white/30',
          'rounded-r transition-opacity',
        )}
        style={{ width: HANDLE_WIDTH, right: NODE_SIZE / 2 }}
        onPointerDown={handleRightHandlePointerDown}
      />

      {/* Right dependency node (end) */}
      <div
        className={cn(
          'absolute rounded-full bg-green-500 border-2 border-white shadow-md cursor-crosshair',
          'opacity-0 group-hover:opacity-100 hover:scale-125 transition-all z-20',
        )}
        style={{
          width: NODE_SIZE,
          height: NODE_SIZE,
          right: -NODE_SIZE / 2,
          top: '50%',
          transform: 'translateY(-50%)',
        }}
        onPointerDown={handleEndNodePointerDown}
        onPointerEnter={handleEndNodeEnter}
        onPointerLeave={handleNodeLeave}
        title="Drag to create dependency (from end)"
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
// DEPENDENCY DRAG LINE
// ====================================

interface DependencyDragLineProps {
  sourceBar: BarPosition
  sourceEdge: DependencyEdge
  currentX: number
  currentY: number
  hasTarget: boolean
}

function DependencyDragLine({
  sourceBar,
  sourceEdge,
  currentX,
  currentY,
  hasTarget,
}: DependencyDragLineProps) {
  // Calculate start point based on source edge
  const startX = sourceEdge === 'start' ? sourceBar.left : sourceBar.left + sourceBar.width
  const startY = sourceBar.top + sourceBar.height / 2 + 4 // +4 for the row padding

  return (
    <svg
      className="absolute inset-0 pointer-events-none z-30"
      style={{ overflow: 'visible' }}
    >
      {/* Main drag line */}
      <line
        x1={startX}
        y1={startY}
        x2={currentX}
        y2={currentY}
        stroke={hasTarget ? '#22c55e' : '#3b82f6'}
        strokeWidth={2}
        strokeDasharray={hasTarget ? 'none' : '5,5'}
        markerEnd={hasTarget ? 'url(#arrow-valid)' : 'url(#arrow-drag)'}
      />
      {/* Arrow markers */}
      <defs>
        <marker
          id="arrow-drag"
          markerWidth="10"
          markerHeight="10"
          refX="9"
          refY="3"
          orient="auto"
          markerUnits="strokeWidth"
        >
          <path d="M0,0 L0,6 L9,3 z" fill="#3b82f6" />
        </marker>
        <marker
          id="arrow-valid"
          markerWidth="10"
          markerHeight="10"
          refX="9"
          refY="3"
          orient="auto"
          markerUnits="strokeWidth"
        >
          <path d="M0,0 L0,6 L9,3 z" fill="#22c55e" />
        </marker>
      </defs>
      {/* Source indicator circle */}
      <circle
        cx={startX}
        cy={startY}
        r={6}
        fill={sourceEdge === 'start' ? '#3b82f6' : '#22c55e'}
        stroke="white"
        strokeWidth={2}
      />
    </svg>
  )
}

// ====================================
// MAIN COMPONENT
// ====================================

interface GanttTimelineProps {
  className?: string
  isLoading?: boolean
  selectedRowIds?: Set<string>
  onBarClick?: (rowId: string, isMulti: boolean) => void
}

export const GanttTimeline = observer(function GanttTimeline({
  className,
  isLoading = false,
  selectedRowIds,
  onBarClick,
}: GanttTimelineProps) {
  const ganttViewStore = useGanttViewStore()
  const tableCoreStore = useTableCoreStore()
  const containerRef = useRef<HTMLDivElement>(null)

  const { timeScale, barPositions, todayLinePosition, timelineWidth, dependencies, scrollLeft, scrollTop, dragState, dependencyDragState } = ganttViewStore

  // Get actual row count from table (matches table view exactly)
  const rowCount = tableCoreStore.processedRows.length

  // Calculate total height based on actual row count
  const totalHeight = rowCount * ROW_HEIGHT

  // Handle scroll events - save to MobX store
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget
    ganttViewStore.setScrollPosition(target.scrollLeft, target.scrollTop)
  }, [ganttViewStore])

  // Get container bounds for calculating relative positions
  const getContainerBounds = useCallback(() => {
    return containerRef.current?.getBoundingClientRect()
  }, [])

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
  // KEYBOARD & WHEEL SHORTCUTS
  // ====================================

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if focused in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      // +/= to zoom in, -/_ to zoom out
      if (e.key === '+' || e.key === '=') {
        e.preventDefault()
        ganttViewStore.zoomIn()
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault()
        ganttViewStore.zoomOut()
      }
      // 't' to scroll to today
      else if (e.key === 't' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        ganttViewStore.scrollToToday()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [ganttViewStore])

  // Ctrl+scroll wheel to zoom
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleWheel = (e: WheelEvent) => {
      // Only handle Ctrl+wheel (or Cmd+wheel on Mac)
      if (!e.ctrlKey && !e.metaKey) return

      e.preventDefault()

      // Scroll up (negative deltaY) = zoom in, scroll down = zoom out
      if (e.deltaY < 0) {
        ganttViewStore.zoomIn()
      } else if (e.deltaY > 0) {
        ganttViewStore.zoomOut()
      }
    }

    container.addEventListener('wheel', handleWheel, { passive: false })
    return () => container.removeEventListener('wheel', handleWheel)
  }, [ganttViewStore])

  // ====================================
  // DRAG HANDLING (BAR MOVE/RESIZE)
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

  // ====================================
  // DEPENDENCY DRAG HANDLING
  // ====================================

  // Start dependency drag from a bar edge
  const handleDependencyDragStart = useCallback(
    (barId: string, edge: DependencyEdge, x: number, y: number) => {
      const bounds = getContainerBounds()
      if (!bounds) return
      // Convert to coordinates relative to container
      const relX = x - bounds.left + scrollLeft
      const relY = y - bounds.top + scrollTop - HEADER_HEIGHT
      ganttViewStore.startDependencyDrag(barId, edge, relX, relY)
    },
    [ganttViewStore, getContainerBounds, scrollLeft, scrollTop],
  )

  // Track hover target for dependency drop
  const handleDependencyNodeHover = useCallback(
    (barId: string, edge: DependencyEdge) => {
      if (!dependencyDragState.isDragging) return
      ganttViewStore.updateDependencyDrag(
        dependencyDragState.currentX,
        dependencyDragState.currentY,
        barId,
        edge,
      )
    },
    [ganttViewStore, dependencyDragState],
  )

  const handleDependencyNodeLeave = useCallback(() => {
    if (!dependencyDragState.isDragging) return
    ganttViewStore.updateDependencyDrag(
      dependencyDragState.currentX,
      dependencyDragState.currentY,
      undefined,
      undefined,
    )
  }, [ganttViewStore, dependencyDragState])

  // Global pointer events for dependency drag
  useEffect(() => {
    if (!dependencyDragState.isDragging) return

    const handlePointerMove = (e: PointerEvent) => {
      const bounds = getContainerBounds()
      if (!bounds) return
      const relX = e.clientX - bounds.left + scrollLeft
      const relY = e.clientY - bounds.top + scrollTop - HEADER_HEIGHT
      ganttViewStore.updateDependencyDrag(
        relX,
        relY,
        dependencyDragState.targetBarId ?? undefined,
        dependencyDragState.targetEdge ?? undefined,
      )
    }

    const handlePointerUp = () => {
      ganttViewStore.endDependencyDrag()
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        ganttViewStore.cancelDependencyDrag()
      }
    }

    document.addEventListener('pointermove', handlePointerMove)
    document.addEventListener('pointerup', handlePointerUp)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointermove', handlePointerMove)
      document.removeEventListener('pointerup', handlePointerUp)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [dependencyDragState.isDragging, dependencyDragState.targetBarId, dependencyDragState.targetEdge, ganttViewStore, getContainerBounds, scrollLeft, scrollTop])

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
            isSelected={selectedRowIds?.has(bar.rowId) ?? false}
            isDependencyDragTarget={dependencyDragState.isDragging && dependencyDragState.targetBarId === bar.rowId}
            onClick={onBarClick}
            onDragStart={handleDragStart}
            onDependencyDragStart={handleDependencyDragStart}
            onDependencyNodeHover={handleDependencyNodeHover}
            onDependencyNodeLeave={handleDependencyNodeLeave}
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
            selectedDependencyId={ganttViewStore.selectedDependencyId}
            onSelectDependency={(id) => ganttViewStore.selectDependency(id)}
            onDeleteDependency={(id) => ganttViewStore.deleteDependency(id)}
          />
        )}

        {/* Dependency drag line during creation */}
        {dependencyDragState.isDragging && dependencyDragState.sourceBarId && (
          (() => {
            const sourceBar = barPositions.find((b) => b.rowId === dependencyDragState.sourceBarId)
            if (!sourceBar || !dependencyDragState.sourceEdge) return null
            return (
              <DependencyDragLine
                sourceBar={sourceBar}
                sourceEdge={dependencyDragState.sourceEdge}
                currentX={dependencyDragState.currentX}
                currentY={dependencyDragState.currentY}
                hasTarget={!!dependencyDragState.targetBarId}
              />
            )
          })()
        )}

        {/* Loading state */}
        {isLoading && barPositions.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <span className="text-sm">Loading timeline...</span>
            </div>
          </div>
        )}

        {/* Empty state (only show when not loading) */}
        {!isLoading && barPositions.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
            No tasks with dates to display
          </div>
        )}
      </div>
    </div>
  )
})
