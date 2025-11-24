/**
 * ⚠️ NOT MIGRATED TO MOBX - FILE DISABLED ⚠️
 *
 * This file has not been migrated from Legend State to MobX.
 * It is currently NOT USED anywhere in the codebase.
 *
 * Status: DISABLED - Do not import or use
 * Original: Available in archive/vibegrid/
 *
 * To re-enable:
 * 1. Migrate Legend State observables to MobX
 * 2. Update imports and reactive patterns
 * 3. Test thoroughly
 * 4. Remove this warning
 */

// This file is disabled and will throw errors if used
throw new Error('This file has not been migrated to MobX - see file header for details')

/**
 * Position Utility Hooks
 *
 * Common patterns and utilities for working with cell positions.
 */

// TODO: Remove Legend State - migrating to MobX
import { computed } from 'mobx'
import type { Bounds, CellCoordinates, Position } from '../types/coordinate-types'
import { CoordinateUtils } from '../types/coordinate-types'
import { useCellPosition$, useMultipleCellPositions$ } from './use-cell-position'

/**
 * Get the bounding box that encompasses multiple cells
 */
export function useSelectionBounds$(cellKeys: string[]) {
  const positions$ = useMultipleCellPositions$(cellKeys)

  return computed(() => {
    const positionsData = positions$.get()
    const validPositions = positionsData
      .map((item: any) => item.position)
      .filter((pos: any): pos is NonNullable<typeof pos> => pos !== null)

    if (validPositions.length === 0) return null

    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity

    validPositions.forEach((pos) => {
      if (pos) {
        minX = Math.min(minX, pos.x)
        minY = Math.min(minY, pos.y)
        maxX = Math.max(maxX, pos.x + pos.width)
        maxY = Math.max(maxY, pos.y + pos.height)
      }
    })

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
      cellCount: validPositions.length,
      source: 'calculated' as const,
    }
  })
}

/**
 * Check if a position is within a cell's bounds
 */
export function usePositionInCell$(cellKey: string, targetPosition: Position) {
  const cellPosition$ = useCellPosition$(cellKey)

  return computed(() => {
    const cellPos = cellPosition$.get()
    if (!cellPos) return false

    return CoordinateUtils.isPositionInBounds(targetPosition, cellPos)
  })
}

/**
 * Find the closest cell to a given position
 */
export function useClosestCell$(targetPosition: Position, candidateCellKeys: string[]) {
  const positions$ = useMultipleCellPositions$(candidateCellKeys)

  return computed(() => {
    const positionsData = positions$.get()
    let closestCell: { cellKey: string; distance: number; position: CellCoordinates } | null = null

    positionsData.forEach(({ cellKey, position }: { cellKey: any; position: any }) => {
      if (!position) return

      const cellCenter: Position = {
        x: position.x + position.width / 2,
        y: position.y + position.height / 2,
      }

      const distance = CoordinateUtils.getDistance(targetPosition, cellCenter)

      if (!closestCell || distance < closestCell.distance) {
        closestCell = { cellKey, distance, position }
      }
    })

    return closestCell
  })
}

/**
 * Get cells that overlap with a given bounds
 */
export function useOverlappingCells$(targetBounds: Bounds, candidateCellKeys: string[]) {
  const positions$ = useMultipleCellPositions$(candidateCellKeys)

  return computed(() => {
    const positionsData = positions$.get()
    const overlapping: Array<{ cellKey: string; position: CellCoordinates; overlap: Bounds }> = []

    positionsData.forEach(({ cellKey, position }: { cellKey: any; position: any }) => {
      if (!position) return

      const overlap = CoordinateUtils.getIntersection(targetBounds, position)
      if (overlap) {
        overlapping.push({ cellKey, position, overlap })
      }
    })

    return overlapping
  })
}

/**
 * Track relative position of one cell to another
 */
export function useRelativePosition$(baseCellKey: string, targetCellKey: string) {
  const basePosition$ = useCellPosition$(baseCellKey)
  const targetPosition$ = useCellPosition$(targetCellKey)

  return computed(() => {
    const basePos = basePosition$.get()
    const targetPos = targetPosition$.get()

    if (!basePos || !targetPos) return null

    return {
      deltaX: targetPos.x - basePos.x,
      deltaY: targetPos.y - basePos.y,
      distance: CoordinateUtils.getDistance(
        { x: basePos.x + basePos.width / 2, y: basePos.y + basePos.height / 2 },
        { x: targetPos.x + targetPos.width / 2, y: targetPos.y + targetPos.height / 2 },
      ),
      direction: {
        horizontal: targetPos.x > basePos.x ? 'right' : targetPos.x < basePos.x ? 'left' : 'same',
        vertical: targetPos.y > basePos.y ? 'below' : targetPos.y < basePos.y ? 'above' : 'same',
      },
    }
  })
}

/**
 * Get the visual center point of a cell
 */
export function useCellCenter$(cellKey: string) {
  const position$ = useCellPosition$(cellKey)

  return computed(() => {
    const pos = position$.get()
    if (!pos) return null

    return {
      x: pos.x + pos.width / 2,
      y: pos.y + pos.height / 2,
    }
  })
}

/**
 * Get CSS style object for absolute positioning
 */
export function useCellPositionStyle$(
  cellKey: string,
  options: {
    offset?: { x?: number; y?: number }
    zIndex?: number
    includeSize?: boolean
  } = {},
) {
  const position$ = useCellPosition$(cellKey)

  return computed(() => {
    const pos = position$.get()
    if (!pos) return {}

    const { offset = {}, zIndex, includeSize = true } = options

    const style: React.CSSProperties = {
      position: 'absolute',
      left: pos.x + (offset.x || 0),
      top: pos.y + (offset.y || 0),
    }

    if (includeSize) {
      style.width = pos.width
      style.height = pos.height
    }

    if (zIndex !== undefined) {
      style.zIndex = zIndex
    }

    return style
  })
}

/**
 * Track position changes over time for animations
 */
export function useCellPositionHistory$(cellKey: string, maxHistory: number = 5) {
  const position$ = useCellPosition$(cellKey)

  // Store history in a computed that tracks changes
  return computed(() => {
    const currentPos = position$.get()
    if (!currentPos) return []

    // This is a simplified version - in a real implementation,
    // you'd want to use a more sophisticated state management
    // to track history across renders
    return [currentPos]
  })
}

/**
 * Get position with smooth interpolation for animations
 */
export function useCellPositionSmooth$(cellKey: string, duration: number = 150) {
  const position$ = useCellPosition$(cellKey)

  return computed(() => {
    const pos = position$.get()
    if (!pos) return null

    // This is a placeholder - real smooth positioning would require
    // animation state management and requestAnimationFrame updates
    return {
      ...pos,
      isAnimating: false,
      targetPosition: pos,
      duration,
    }
  })
}

/**
 * Check if cells are adjacent (neighboring)
 */
export function useAreAdjacent$(cellKey1: string, cellKey2: string) {
  const pos1$ = useCellPosition$(cellKey1)
  const pos2$ = useCellPosition$(cellKey2)

  return computed(() => {
    const pos1 = pos1$.get()
    const pos2 = pos2$.get()

    if (!pos1 || !pos2) return false

    // Check if cells share an edge (adjacent)
    const horizontallyAdjacent =
      Math.abs(pos1.x + pos1.width - pos2.x) < 1 || // pos1 to left of pos2
      Math.abs(pos2.x + pos2.width - pos1.x) < 1 // pos2 to left of pos1

    const verticallyAdjacent =
      Math.abs(pos1.y + pos1.height - pos2.y) < 1 || // pos1 above pos2
      Math.abs(pos2.y + pos2.height - pos1.y) < 1 // pos2 above pos1

    const horizontallyAligned =
      Math.abs(pos1.y - pos2.y) < 1 && Math.abs(pos1.height - pos2.height) < 1
    const verticallyAligned = Math.abs(pos1.x - pos2.x) < 1 && Math.abs(pos1.width - pos2.width) < 1

    return (
      (horizontallyAdjacent && horizontallyAligned) || (verticallyAdjacent && verticallyAligned)
    )
  })
}

/**
 * Get position relative to viewport/container
 */
export function useCellPositionInViewport$(cellKey: string) {
  const position$ = useCellPosition$(cellKey)

  return computed(() => {
    const pos = position$.get()
    if (!pos) return null

    // This would need to be enhanced with actual viewport calculations
    // For now, return the position as-is
    return {
      ...pos,
      isInViewport: pos.isVisible,
      viewportX: pos.x,
      viewportY: pos.y,
    }
  })
}
