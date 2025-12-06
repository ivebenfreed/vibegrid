/**
 * DependencyArrowLayer - SVG overlay for rendering dependency arrows
 *
 * Renders bezier curve arrows between Gantt bars to show dependencies.
 * Supports finish-to-start, start-to-start, finish-to-finish, start-to-finish.
 */

import { observer } from 'mobx-react-lite'
import React from 'react'
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
}

// ====================================
// ARROW PATH CALCULATION
// ====================================

interface ArrowPath {
  id: string
  path: string
  color: string
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
      startX = source.left + source.width + PADDING  // Past right edge
      startY = sourceCenter
      endX = target.left - ARROW_HEAD_SPACE          // Before left edge
      endY = targetCenter
      break
    case 'start_to_start':
      // Arrow from START of source to START of target
      startX = source.left - PADDING                 // Before left edge
      startY = sourceCenter
      endX = target.left - ARROW_HEAD_SPACE          // Before left edge
      endY = targetCenter
      break
    case 'finish_to_finish':
      // Arrow from END of source to END of target
      startX = source.left + source.width + PADDING  // Past right edge
      startY = sourceCenter
      endX = target.left + target.width + ARROW_HEAD_SPACE  // Past right edge
      endY = targetCenter
      break
    case 'start_to_finish':
      // Arrow from START of source to END of target
      startX = source.left - PADDING                 // Before left edge
      startY = sourceCenter
      endX = target.left + target.width + ARROW_HEAD_SPACE  // Past right edge
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
// ARROW HEAD MARKER
// ====================================

const ArrowMarker = () => (
  <defs>
    <marker
      id="arrowhead"
      markerWidth="10"
      markerHeight="7"
      refX="9"
      refY="3.5"
      orient="auto"
    >
      <polygon
        points="0 0, 10 3.5, 0 7"
        fill="#6366f1"
      />
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
}: DependencyArrowLayerProps) {
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
    const arrowSourceBar = barMap.get(dep.targetEntityId)  // predecessor
    const arrowTargetBar = barMap.get(dep.sourceEntityId)  // successor

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
      color: 'text-muted-foreground',
    })
  }

  logger.info('DependencyArrowLayer render', {
    dependencyCount: dependencies.length,
    arrowCount: arrows.length,
    barCount: barPositions.length,
    width,
    height,
    firstArrow: arrows[0],
  })

  if (arrows.length === 0) {
    logger.warn('No arrows to render - dependencies may not match bar rowIds')
    return null
  }

  return (
    <svg
      className="absolute inset-0 pointer-events-none overflow-visible"
      style={{ width, height }}
      aria-hidden="true"
    >
      <ArrowMarker />
      <g className="dependency-arrows">
        {arrows.map((arrow) => (
          <path
            key={arrow.id}
            d={arrow.path}
            fill="none"
            stroke="#6366f1"
            strokeWidth={2}
            markerEnd="url(#arrowhead)"
          />
        ))}
      </g>
    </svg>
  )
})
