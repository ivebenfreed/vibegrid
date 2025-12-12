/**
 * DependencyArrowLayer - SVG overlay for rendering dependency arrows
 *
 * Renders bezier curve arrows between Gantt bars to show dependencies.
 * Supports finish-to-start, start-to-start, finish-to-finish, start-to-finish.
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
}

// ====================================
// ARROW PATH CALCULATION
// ====================================

interface ArrowPath {
  id: string
  path: string
  dependencyType: Dependency['dependencyType']
}

function calculateArrowPath(
  source: BarPosition,
  target: BarPosition,
  dependencyType: Dependency['dependencyType'],
): string {
  // Calculate start and end points based on dependency type
  let startX: number
  let startY: number
  let endX: number
  let endY: number

  const sourceCenter = source.top + source.height / 2
  const targetCenter = target.top + target.height / 2

  // Padding values for arrow start/end points
  const PADDING = 4
  const ARROW_HEAD_SPACE = 10

  switch (dependencyType) {
    case 'finish_to_start':
      // Arrow from END of source to START of target
      startX = source.left + source.width + PADDING // Past right edge
      startY = sourceCenter
      endX = target.left - ARROW_HEAD_SPACE // Before left edge
      endY = targetCenter
      break
    case 'start_to_start':
      // Arrow from START of source to START of target
      startX = source.left - PADDING // Before left edge
      startY = sourceCenter
      endX = target.left - ARROW_HEAD_SPACE // Before left edge
      endY = targetCenter
      break
    case 'finish_to_finish':
      // Arrow from END of source to END of target
      startX = source.left + source.width + PADDING // Past right edge
      startY = sourceCenter
      endX = target.left + target.width + ARROW_HEAD_SPACE // Past right edge
      endY = targetCenter
      break
    case 'start_to_finish':
      // Arrow from START of source to END of target
      startX = source.left - PADDING // Before left edge
      startY = sourceCenter
      endX = target.left + target.width + ARROW_HEAD_SPACE // Past right edge
      endY = targetCenter
      break
    default:
      // Default to finish_to_start
      startX = source.left + source.width + PADDING
      startY = sourceCenter
      endX = target.left - ARROW_HEAD_SPACE
      endY = targetCenter
  }

  // Calculate bezier curve control points
  const dx = endX - startX
  const dy = endY - startY

  // Use horizontal bezier for smoother curves
  const controlOffset = Math.min(Math.abs(dx) * 0.5, 50)

  const cx1 = startX + controlOffset
  const cy1 = startY
  const cx2 = endX - controlOffset
  const cy2 = endY

  return `M ${startX} ${startY} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${endX} ${endY}`
}

// ====================================
// DEPENDENCY TYPE COLORS
// ====================================

const DEPENDENCY_COLORS: Record<Dependency['dependencyType'], string> = {
  finish_to_start: '#6366f1', // indigo (most common, default)
  start_to_start: '#8b5cf6', // violet
  finish_to_finish: '#06b6d4', // cyan
  start_to_finish: '#f59e0b', // amber (rare)
}

// ====================================
// ARROW HEAD MARKERS
// ====================================

const ArrowMarkers = () => (
  <defs>
    {/* Finish-to-Start (indigo) */}
    <marker id="arrowhead-fs" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
      <polygon points="0 0, 10 3.5, 0 7" fill={DEPENDENCY_COLORS.finish_to_start} />
    </marker>
    {/* Start-to-Start (violet) */}
    <marker id="arrowhead-ss" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
      <polygon points="0 0, 10 3.5, 0 7" fill={DEPENDENCY_COLORS.start_to_start} />
    </marker>
    {/* Finish-to-Finish (cyan) */}
    <marker id="arrowhead-ff" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
      <polygon points="0 0, 10 3.5, 0 7" fill={DEPENDENCY_COLORS.finish_to_finish} />
    </marker>
    {/* Start-to-Finish (amber) */}
    <marker id="arrowhead-sf" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
      <polygon points="0 0, 10 3.5, 0 7" fill={DEPENDENCY_COLORS.start_to_finish} />
    </marker>
    {/* Selected (red) */}
    <marker
      id="arrowhead-selected"
      markerWidth="10"
      markerHeight="7"
      refX="9"
      refY="3.5"
      orient="auto"
    >
      <polygon points="0 0, 10 3.5, 0 7" fill="#ef4444" />
    </marker>
  </defs>
)

function getArrowMarkerId(depType: Dependency['dependencyType']): string {
  switch (depType) {
    case 'finish_to_start':
      return 'arrowhead-fs'
    case 'start_to_start':
      return 'arrowhead-ss'
    case 'finish_to_finish':
      return 'arrowhead-ff'
    case 'start_to_finish':
      return 'arrowhead-sf'
    default:
      return 'arrowhead-fs'
  }
}

// Legacy marker for backwards compatibility
const ArrowMarker = () => (
  <defs>
    <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
      <polygon points="0 0, 10 3.5, 0 7" fill="#6366f1" />
    </marker>
  </defs>
)

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

  // Handle click on arrow
  const handleArrowClick = useCallback(
    (e: React.MouseEvent, dependencyId: string) => {
      e.stopPropagation()
      onSelectDependency?.(dependencyId)
    },
    [onSelectDependency],
  )

  // Handle click on background (deselect)
  const handleBackgroundClick = useCallback(() => {
    onSelectDependency?.(null)
  }, [onSelectDependency])

  // Build lookup map for bar positions by rowId
  const barMap = new Map<string, BarPosition>()
  for (const bar of barPositions) {
    barMap.set(bar.rowId, bar)
  }

  // Calculate arrow paths
  const arrows: ArrowPath[] = []

  for (const dep of dependencies) {
    // IMPORTANT: In "A depends on B" relationship:
    // - dep.sourceEntityId = A (the successor, waiting on dependency)
    // - dep.targetEntityId = B (the predecessor, must complete first)
    // For arrow visualization, we draw FROM predecessor TO successor
    // So we SWAP: arrow source = dep.target, arrow target = dep.source
    const arrowSourceBar = barMap.get(dep.targetEntityId) // predecessor
    const arrowTargetBar = barMap.get(dep.sourceEntityId) // successor

    if (!arrowSourceBar || !arrowTargetBar) {
      logger.debug('Skipping dependency - missing bar', {
        depId: dep.id,
        hasArrowSource: !!arrowSourceBar,
        hasArrowTarget: !!arrowTargetBar,
      })
      continue
    }

    const path = calculateArrowPath(arrowSourceBar, arrowTargetBar, dep.dependencyType)
    arrows.push({
      id: dep.id,
      path,
      dependencyType: dep.dependencyType,
    })
  }

  logger.debug('DependencyArrowLayer render', {
    dependencyCount: dependencies.length,
    arrowCount: arrows.length,
    selectedDependencyId,
  })

  if (arrows.length === 0) {
    return null
  }

  return (
    <svg
      className="absolute inset-0 overflow-visible pointer-events-none"
      style={{ width, height }}
    >
      <ArrowMarkers />
      <g className="dependency-arrows">
        {arrows.map((arrow) => {
          const isSelected = arrow.id === selectedDependencyId
          const color = isSelected ? '#ef4444' : DEPENDENCY_COLORS[arrow.dependencyType]
          const markerId = isSelected
            ? 'arrowhead-selected'
            : getArrowMarkerId(arrow.dependencyType)
          return (
            <g key={arrow.id}>
              {/* Invisible wider path for easier clicking */}
              <path
                d={arrow.path}
                fill="none"
                stroke="transparent"
                strokeWidth={16}
                className="cursor-pointer pointer-events-auto"
                onClick={(e) => handleArrowClick(e, arrow.id)}
              />
              {/* Visible arrow */}
              <path
                d={arrow.path}
                fill="none"
                stroke={color}
                strokeWidth={isSelected ? 3 : 2}
                markerEnd={`url(#${markerId})`}
                className="pointer-events-none transition-colors"
              />
            </g>
          )
        })}
      </g>
    </svg>
  )
})
