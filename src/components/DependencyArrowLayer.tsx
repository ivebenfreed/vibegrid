/**
 * DependencyArrowLayer - SVG overlay for rendering dependency lines
 *
 * Renders clean orthogonal (right-angle) lines between Gantt bars.
 * Connection type is shown by which end of the bar the line connects to.
 * Click to select, Delete/Backspace to remove.
 */

import { observer } from 'mobx-react-lite'
import type React from 'react'
import { useCallback, useEffect } from 'react'
import type { BarPosition } from '../stores/GanttViewStore'
import { getLogger } from '@/shared/lib/logging'

const logger = getLogger(['vibegrid', 'components', 'DependencyArrowLayer'])

// ====================================
// TYPES
// ====================================

export interface Dependency {
  id: string
  sourceEntityId: string
  targetEntityId: string
  dependencyType: 'finish_to_start' | 'start_to_start' | 'finish_to_finish' | 'start_to_finish'
}

interface DependencyArrowLayerProps {
  dependencies: Dependency[]
  barPositions: BarPosition[]
  width: number
  height: number
  selectedDependencyId?: string | null
  onSelectDependency?: (dependencyId: string | null) => void
  onDeleteDependency?: (dependencyId: string) => void
  /** Whether critical path highlighting is enabled */
  showCriticalPath?: boolean
  /** Set of row IDs on the critical path */
  criticalPathIds?: Set<string>
}

// ====================================
// CONSTANTS
// ====================================

const DEFAULT_COLOR = '#6b7280' // gray-500 - visible but not distracting
const SELECTED_COLOR = '#ef4444' // red-500
const CRITICAL_COLOR = '#dc2626' // red-600
const DEFAULT_STROKE = 1.5
const SELECTED_STROKE = 2.5
const CORNER_RADIUS = 4 // Rounded corners on the orthogonal path
const NODE_RADIUS = 4 // Connection point indicator size
const NODE_STROKE = 1.5 // White border around nodes

// ====================================
// ORTHOGONAL PATH CALCULATION
// ====================================

interface LinePath {
  id: string
  path: string
  isCritical: boolean
  startX: number
  startY: number
  endX: number
  endY: number
}

interface PathResult {
  path: string
  startX: number
  startY: number
  endX: number
  endY: number
}

const STUB_LENGTH = 12 // How far to extend before first turn

/**
 * Calculate orthogonal (right-angle) path between two bars
 *
 * Path structure:
 * - Horizontal stub from bar connection point
 * - Vertical segment connecting row centers (startY to endY)
 * - Horizontal segment to target
 *
 * The vertical segment X position depends on dependency type and bar positions.
 */
function calculateOrthogonalPath(
  source: BarPosition,
  target: BarPosition,
  dependencyType: Dependency['dependencyType'],
): PathResult {
  const startY = source.top + source.height / 2 + 4 // Row center
  const endY = target.top + target.height / 2 + 4 // Row center
  const r = CORNER_RADIUS

  // Determine connection points based on dependency type
  let startX: number
  let endX: number

  switch (dependencyType) {
    case 'finish_to_start':
      startX = source.left + source.width // Exit from end
      endX = target.left // Enter at start
      break
    case 'start_to_start':
      startX = source.left // Exit from start
      endX = target.left // Enter at start
      break
    case 'finish_to_finish':
      startX = source.left + source.width // Exit from end
      endX = target.left + target.width // Enter at end
      break
    case 'start_to_finish':
      startX = source.left // Exit from start
      endX = target.left + target.width // Enter at end
      break
    default:
      startX = source.left + source.width
      endX = target.left
  }

  // Same row - simple horizontal line
  if (Math.abs(startY - endY) < 2) {
    return {
      path: `M ${startX} ${startY} L ${endX} ${endY}`,
      startX,
      startY,
      endX,
      endY,
    }
  }

  const goingDown = endY > startY

  // Calculate where the vertical segment should be
  // For FS: vertical is to the right of both connection points
  // For SS: vertical is to the left of both connection points
  // For FF: vertical is to the right of both connection points
  // For SF: vertical is to the left of source, right of target (or route around)

  let vertX: number

  switch (dependencyType) {
    case 'finish_to_start':
      // Vertical line should be between the two connection points
      // or to the right if target is before source
      vertX = Math.max(startX, endX) + STUB_LENGTH
      if (startX < endX) {
        // Normal case: source ends before target starts
        vertX = startX + STUB_LENGTH
      }
      break
    case 'start_to_start':
      // Vertical to the left of both starts
      vertX = Math.min(startX, endX) - STUB_LENGTH
      break
    case 'finish_to_finish':
      // Vertical to the right of both ends
      vertX = Math.max(startX, endX) + STUB_LENGTH
      break
    case 'start_to_finish':
      // Complex case - may need to route around
      vertX = Math.min(startX, endX) - STUB_LENGTH
      break
    default:
      vertX = startX + STUB_LENGTH
  }

  // Build the path with rounded corners
  let path = `M ${startX} ${startY}`

  // Horizontal to vertical X position
  const hDir = vertX > startX ? 1 : -1
  path += ` L ${vertX - hDir * r} ${startY}`

  // Corner 1: turn vertical
  if (goingDown) {
    path += ` Q ${vertX} ${startY} ${vertX} ${startY + r}`
  } else {
    path += ` Q ${vertX} ${startY} ${vertX} ${startY - r}`
  }

  // Vertical segment from row center to row center
  if (goingDown) {
    path += ` L ${vertX} ${endY - r}`
  } else {
    path += ` L ${vertX} ${endY + r}`
  }

  // Corner 2: turn horizontal toward target
  const hDir2 = endX > vertX ? 1 : -1
  if (goingDown) {
    path += ` Q ${vertX} ${endY} ${vertX + hDir2 * r} ${endY}`
  } else {
    path += ` Q ${vertX} ${endY} ${vertX + hDir2 * r} ${endY}`
  }

  // Horizontal to target
  path += ` L ${endX} ${endY}`

  return { path, startX, startY, endX, endY }
}

// ====================================
// MAIN COMPONENT
// ====================================

export const DependencyArrowLayer = observer(function DependencyArrowLayer({
  dependencies,
  barPositions,
  width,
  height,
  selectedDependencyId,
  onSelectDependency,
  onDeleteDependency,
  showCriticalPath = false,
  criticalPathIds = new Set(),
}: DependencyArrowLayerProps) {
  // Handle keyboard delete
  useEffect(() => {
    if (!selectedDependencyId || !onDeleteDependency) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        onDeleteDependency(selectedDependencyId)
      } else if (e.key === 'Escape') {
        onSelectDependency?.(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedDependencyId, onDeleteDependency, onSelectDependency])

  // Handle click on line
  const handleLineClick = useCallback(
    (e: React.MouseEvent, dependencyId: string) => {
      e.stopPropagation()
      onSelectDependency?.(dependencyId)
    },
    [onSelectDependency],
  )

  // Build lookup map for bar positions by rowId
  const barMap = new Map<string, BarPosition>()
  for (const bar of barPositions) {
    barMap.set(bar.rowId, bar)
  }

  // Calculate line paths
  const lines: LinePath[] = []

  for (const dep of dependencies) {
    // In "A depends on B": sourceEntityId = A (successor), targetEntityId = B (predecessor)
    // Arrow goes FROM predecessor TO successor
    const predecessorBar = barMap.get(dep.targetEntityId)
    const successorBar = barMap.get(dep.sourceEntityId)

    if (!predecessorBar || !successorBar) {
      logger.debug('Skipping dependency - missing bar', {
        depId: dep.id,
        hasPredecessor: !!predecessorBar,
        hasSuccessor: !!successorBar,
      })
      continue
    }

    const pathResult = calculateOrthogonalPath(predecessorBar, successorBar, dep.dependencyType)

    // Line is on critical path if both connected tasks are on critical path
    const isCritical =
      showCriticalPath &&
      criticalPathIds.has(dep.sourceEntityId) &&
      criticalPathIds.has(dep.targetEntityId)

    lines.push({
      id: dep.id,
      path: pathResult.path,
      isCritical,
      startX: pathResult.startX,
      startY: pathResult.startY,
      endX: pathResult.endX,
      endY: pathResult.endY,
    })
  }

  logger.debug('DependencyArrowLayer render', {
    dependencyCount: dependencies.length,
    lineCount: lines.length,
    selectedDependencyId,
  })

  if (lines.length === 0) {
    return null
  }

  return (
    <svg
      className="absolute inset-0 overflow-visible pointer-events-none"
      style={{ width, height, zIndex: 5 }}
    >
      <g className="dependency-lines">
        {lines.map((line) => {
          const isSelected = line.id === selectedDependencyId

          // Determine color and stroke width
          let color: string
          let strokeWidth: number

          if (isSelected) {
            color = SELECTED_COLOR
            strokeWidth = SELECTED_STROKE
          } else if (line.isCritical) {
            color = CRITICAL_COLOR
            strokeWidth = SELECTED_STROKE
          } else {
            color = DEFAULT_COLOR
            strokeWidth = DEFAULT_STROKE
          }

          return (
            <g key={line.id} className="group">
              {/* Invisible wider path for easier clicking */}
              <path
                d={line.path}
                fill="none"
                stroke="transparent"
                strokeWidth={12}
                className="cursor-pointer pointer-events-auto"
                onClick={(e) => handleLineClick(e, line.id)}
              />
              {/* Visible line */}
              <path
                d={line.path}
                fill="none"
                stroke={color}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                className="pointer-events-none transition-colors"
              />
              {/* Start connection point */}
              <circle
                cx={line.startX}
                cy={line.startY}
                r={NODE_RADIUS}
                fill={color}
                stroke="white"
                strokeWidth={NODE_STROKE}
                className="pointer-events-none"
              />
              {/* End connection point */}
              <circle
                cx={line.endX}
                cy={line.endY}
                r={NODE_RADIUS}
                fill={color}
                stroke="white"
                strokeWidth={NODE_STROKE}
                className="pointer-events-none"
              />
            </g>
          )
        })}
      </g>
    </svg>
  )
})
