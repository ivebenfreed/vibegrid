/**
 * GanttBar - Individual task bar in the Gantt timeline
 *
 * Renders a task bar with:
 * - Status-based colors
 * - Progress fill (optional)
 * - Label display
 * - Critical path highlighting (optional)
 * - Custom shapes: rectangle (default), diamond, circle (future)
 *
 * @see planning/specs/215-gantt-view-polish.md sections 2.4-2.6
 */

import { observer } from 'mobx-react-lite'
import { cn } from '@/shared/lib/utils'
import type { BarPosition } from '../stores/GanttViewStore'

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

  /** Additional CSS classes */
  className?: string
}

// ====================================
// STATUS COLORS
// ====================================

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

// ====================================
// COMPONENT
// ====================================

export const GanttBar = observer(function GanttBar({
  bar,
  onClick,
  isCritical = false,
  shape = 'rectangle',
  className,
}: GanttBarProps) {
  const colorClass = getStatusColorClass(bar, isCritical)
  const colorStyle = getStatusColorStyle(bar, isCritical)

  // Common positioning styles
  const positionStyle: React.CSSProperties = {
    left: bar.left,
    top: bar.top + 4, // Center in row with padding
    width: bar.width,
    height: bar.height,
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

  // Rectangle (default) shape
  if (shape === 'rectangle') {
    return (
      <button
        type="button"
        className={cn(
          'absolute rounded cursor-pointer transition-colors',
          'flex items-center px-2 text-xs text-white truncate',
          'shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-ring',
          'border-0',
          colorClass,
          isCritical && 'ring-2 ring-red-600 ring-offset-1',
          className,
        )}
        style={positionStyle}
        onClick={() => onClick?.(bar.rowId)}
        title={tooltipText}
      >
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
        {/* Progress percentage badge for bars with progress */}
        {bar.progress != null && bar.progress > 0 && bar.width > 100 && (
          <span className="absolute right-1 text-[10px] opacity-80 z-10">
            {Math.round(bar.progress)}%
          </span>
        )}

        {/* Label */}
        {bar.width > 60 && <span className="truncate relative z-10">{bar.label}</span>}
      </button>
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
