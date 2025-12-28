/**
 * GanttBar - Individual task bar in the Gantt timeline
 *
 * Renders a task bar with:
 * - Status-based colors
 * - Progress fill (optional)
 * - Label display
 * - Critical path highlighting (optional)
 * - Custom shapes: rectangle (default), diamond, circle (future)
 * - Drag interactions: move, resize-start, resize-end
 * - Dependency node creation
 *
 * @see planning/specs/215-gantt-view-polish.md sections 2.4-2.6
 */

import { observer } from 'mobx-react-lite'
import type React from 'react'
import { cn } from '@/shared/lib/utils'
import type { BarPosition, DependencyEdge, DragMode } from '../stores/GanttViewStore'

// ====================================
// CONSTANTS
// ====================================

const HANDLE_WIDTH = 8 // Width of resize handles in pixels
const NODE_SIZE = 12 // Size of dependency nodes in pixels

// ====================================
// TYPES
// ====================================

export type BarShape = 'rectangle' | 'diamond' | 'circle'

export interface GanttBarProps {
  /** Bar position and metadata from GanttViewStore */
  bar: BarPosition

  /** Click handler for bar selection */
  onClick?: (rowId: string) => void

  /** Whether this bar is on the critical path */
  isCritical?: boolean

  /** Bar shape (rectangle, diamond, circle) */
  shape?: BarShape

  /** Whether this bar is currently being dragged (show dimmed) */
  isDragging?: boolean

  /** Handler for starting drag operations (move, resize) */
  onDragStart?: (barId: string, mode: DragMode, startX: number) => void

  /** Handler for starting dependency drag from node */
  onDependencyDragStart?: (barId: string, edge: DependencyEdge, x: number, y: number) => void

  /** Handler when hovering over dependency node (for drop target) */
  onDependencyNodeHover?: (barId: string, edge: DependencyEdge) => void

  /** Handler when leaving dependency node */
  onDependencyNodeLeave?: () => void

  /** Whether this bar is a valid drop target for dependency creation */
  isDependencyDragTarget?: boolean

  /** Additional CSS classes */
  className?: string
}

// ====================================
// STATUS COLORS
// ====================================

/**
 * Calculate relative luminance of a hex color
 * Returns a value between 0 (darkest) and 1 (lightest)
 */
function getLuminance(hex: string): number {
  // Remove # if present
  const color = hex.replace('#', '')

  // Parse RGB values
  const r = Number.parseInt(color.substring(0, 2), 16) / 255
  const g = Number.parseInt(color.substring(2, 4), 16) / 255
  const b = Number.parseInt(color.substring(4, 6), 16) / 255

  // Apply gamma correction
  const rLinear = r <= 0.03928 ? r / 12.92 : ((r + 0.055) / 1.055) ** 2.4
  const gLinear = g <= 0.03928 ? g / 12.92 : ((g + 0.055) / 1.055) ** 2.4
  const bLinear = b <= 0.03928 ? b / 12.92 : ((b + 0.055) / 1.055) ** 2.4

  // Calculate luminance
  return 0.2126 * rLinear + 0.7152 * gLinear + 0.0722 * bLinear
}

/**
 * Check if a color is light (should use dark text)
 */
function isLightColor(hex: string): boolean {
  return getLuminance(hex) > 0.5
}

/**
 * Get background color class based on status
 * Uses the statusColor from BarPosition if available
 */
function getStatusColorClass(bar: BarPosition, isCritical?: boolean): string {
  // Critical path takes precedence
  if (isCritical) {
    return 'bg-red-500/90 hover:bg-red-500'
  }

  // Use status color if available
  if (bar.statusColor) {
    // statusColor is a hex value, use inline style instead
    return ''
  }

  // Default color
  return 'bg-primary/80 hover:bg-primary'
}

/**
 * Get inline style for status color when using hex values
 */
function getStatusColorStyle(bar: BarPosition, isCritical?: boolean): React.CSSProperties {
  if (isCritical) {
    return {} // Use class-based styling for critical path
  }

  if (bar.statusColor) {
    return {
      backgroundColor: bar.statusColor,
    }
  }

  return {}
}

/**
 * Get text color class based on background color luminance
 */
function getTextColorClass(bar: BarPosition, isCritical?: boolean): string {
  if (isCritical) {
    return 'text-white' // Red background always uses white text
  }

  if (bar.statusColor && isLightColor(bar.statusColor)) {
    return 'text-gray-900' // Light background uses dark text
  }

  return 'text-white' // Dark background uses white text
}

// ====================================
// COMPONENT
// ====================================

export const GanttBar = observer(function GanttBar({
  bar,
  onClick,
  isCritical = false,
  shape = 'rectangle',
  isDragging = false,
  onDragStart,
  onDependencyDragStart,
  onDependencyNodeHover,
  onDependencyNodeLeave,
  isDependencyDragTarget = false,
  className,
}: GanttBarProps) {
  const colorClass = getStatusColorClass(bar, isCritical)
  const colorStyle = getStatusColorStyle(bar, isCritical)
  const textColorClass = getTextColorClass(bar, isCritical)

  // Common positioning styles
  const positionStyle: React.CSSProperties = {
    left: bar.left,
    top: bar.top + 4, // Center in row with padding
    width: bar.width,
    height: bar.height,
    zIndex: 10, // Above dependency lines (z-5) but below drag preview (z-30)
    ...colorStyle,
  }

  // Build tooltip text
  const tooltipText = [
    bar.label,
    `${bar.startDate.toLocaleDateString()} - ${bar.endDate.toLocaleDateString()}`,
    bar.progress !== undefined ? `Progress: ${bar.progress}%` : null,
    bar.status ? `Status: ${bar.status}` : null,
  ]
    .filter(Boolean)
    .join('\n')

  // Drag handlers
  const handleBodyPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return // Only left mouse button
    e.preventDefault()
    e.stopPropagation()
    onDragStart?.(bar.rowId, 'move', e.clientX)
  }

  const handleLeftHandlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    onDragStart?.(bar.rowId, 'resize-start', e.clientX)
  }

  const handleRightHandlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    onDragStart?.(bar.rowId, 'resize-end', e.clientX)
  }

  // Dependency node handlers
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

  const handleStartNodeEnter = () => onDependencyNodeHover?.(bar.rowId, 'start')
  const handleEndNodeEnter = () => onDependencyNodeHover?.(bar.rowId, 'end')
  const handleNodeLeave = () => onDependencyNodeLeave?.()

  // Rectangle (default) shape
  if (shape === 'rectangle') {
    return (
      <div
        className={cn(
          'absolute rounded cursor-pointer transition-colors group',
          'flex items-center text-xs',
          textColorClass,
          'shadow-sm focus:outline-none',
          'border-0',
          colorClass,
          isCritical && 'ring-2 ring-red-600 ring-offset-1',
          isDragging && 'opacity-40',
          isDependencyDragTarget && 'ring-2 ring-yellow-400 ring-offset-1',
          className,
        )}
        style={positionStyle}
        onClick={() => onClick?.(bar.rowId)}
        title={tooltipText}
      >
        {/* Left dependency node (start) */}
        <div
          className={cn(
            'absolute rounded-full bg-blue-500 border-2 border-white shadow-md cursor-crosshair',
            'opacity-0 group-hover:opacity-100 hover:scale-125 transition-all z-30',
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
            'absolute top-0 bottom-0 cursor-ew-resize',
            'opacity-0 group-hover:opacity-100 hover:bg-white/30',
            'rounded-l transition-opacity z-20',
          )}
          style={{ width: HANDLE_WIDTH, left: NODE_SIZE / 2 }}
          onPointerDown={handleLeftHandlePointerDown}
        />

        {/* Progress fill - show lighter unfilled portion */}
        {bar.progress != null && bar.progress >= 0 && bar.progress < 100 && (
          <div
            className="absolute inset-0 bg-black/30 pointer-events-none"
            style={{
              left: `${bar.progress}%`,
              right: 0,
              borderTopRightRadius: 'inherit',
              borderBottomRightRadius: 'inherit',
            }}
          />
        )}

        {/* Bar body (for move drag) */}
        <div
          className="flex-1 h-full flex items-center cursor-grab active:cursor-grabbing px-2 z-10"
          onPointerDown={handleBodyPointerDown}
        >
          {/* Progress percentage badge for bars with progress */}
          {bar.progress != null && bar.progress > 0 && bar.width > 100 && (
            <span className="absolute right-1 text-[10px] opacity-80 z-10">
              {Math.round(bar.progress)}%
            </span>
          )}

          {/* Label - inside bar when wide enough */}
          {bar.width > 60 && <span className="truncate relative z-10">{bar.label}</span>}
        </div>

        {/* External label - shown to the right when bar is too narrow */}
        {bar.width <= 60 && bar.label && (
          <span
            className="absolute text-xs text-foreground whitespace-nowrap pointer-events-none bg-background/90 px-1 rounded"
            style={{
              left: bar.width + 8,
              top: '50%',
              transform: 'translateY(-50%)',
              zIndex: 15, // Above dependency lines (z-5)
            }}
          >
            {bar.label}
          </span>
        )}

        {/* Right resize handle */}
        <div
          className={cn(
            'absolute top-0 bottom-0 cursor-ew-resize',
            'opacity-0 group-hover:opacity-100 hover:bg-white/30',
            'rounded-r transition-opacity z-20',
          )}
          style={{ width: HANDLE_WIDTH, right: NODE_SIZE / 2 }}
          onPointerDown={handleRightHandlePointerDown}
        />

        {/* Right dependency node (end) */}
        <div
          className={cn(
            'absolute rounded-full bg-green-500 border-2 border-white shadow-md cursor-crosshair',
            'opacity-0 group-hover:opacity-100 hover:scale-125 transition-all z-30',
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

  // Diamond shape (milestone)
  if (shape === 'diamond') {
    const size = bar.height
    return (
      <button
        type="button"
        className="absolute cursor-pointer focus:outline-none border-0 bg-transparent p-0"
        style={{
          left: bar.left,
          top: bar.top + 4,
          width: size,
          height: size,
        }}
        onClick={() => onClick?.(bar.rowId)}
        title={tooltipText}
      >
        <div
          className={cn(
            'w-full h-full rotate-45 shadow-sm transition-colors',
            colorClass,
            isCritical && 'ring-2 ring-red-600',
          )}
          style={colorStyle}
        />
      </button>
    )
  }

  // Circle shape (event)
  if (shape === 'circle') {
    const size = bar.height
    return (
      <button
        type="button"
        className={cn(
          'absolute rounded-full cursor-pointer transition-colors shadow-sm',
          'focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-ring',
          'border-0 p-0',
          colorClass,
          isCritical && 'ring-2 ring-red-600 ring-offset-1',
        )}
        style={{
          left: bar.left,
          top: bar.top + 4,
          width: size,
          height: size,
          ...colorStyle,
        }}
        onClick={() => onClick?.(bar.rowId)}
        title={tooltipText}
      />
    )
  }

  // Fallback to rectangle
  return null
})
