/**
 * Hybrid Cell Position Hooks
 *
 * These hooks provide a unified API for getting cell positions,
 * automatically choosing between DOM positions (for rendered cells)
 * and virtual positions (for non-rendered cells).
 */

import { computed } from '@legendapp/state'
import { domPositions$ } from '../stores/dom-position-state'
import type { CellCoordinates, CellRef } from '../types/coordinate-types'
import { CoordinateUtils } from '../types/coordinate-types'
import { virtualCellPosition$ } from '../virtualization/VirtualScrollManager'

/**
 * Get position for a cell using hybrid approach
 *
 * This is the primary hook for getting cell positions. It automatically:
 * 1. Checks if the cell is rendered in DOM (highest accuracy)
 * 2. Falls back to virtual calculation if not in DOM
 * 3. Returns reactive observable that updates when positions change
 */
export function useCellPosition$(cellKey: string) {
  return computed(() => {
    // Try DOM position first (for rendered cells)
    const domPositions = domPositions$.cellPositions.get()
    const domPosition = domPositions.get(cellKey)

    if (domPosition) {
      return {
        ...domPosition,
        source: 'dom' as const,
        priority: 'high' as const,
      }
    }

    // Fall back to virtual calculation (for non-rendered cells)
    const virtualCalc = virtualCellPosition$.get()
    const cellRef = CoordinateUtils.parseCellKey(cellKey)

    if (cellRef) {
      const virtualPosition = virtualCalc.getCellPositionByIds(cellRef.rowId, cellRef.columnId)
      if (virtualPosition) {
        return {
          ...virtualPosition,
          source: 'virtual' as const,
          priority: 'low' as const,
        }
      }
    }

    return null
  })
}

/**
 * Get position for a cell by row and column IDs
 */
export function useCellPositionByIds$(rowId: string, columnId: string) {
  const cellKey = CoordinateUtils.createCellKey(rowId, columnId)
  return useCellPosition$(cellKey)
}

/**
 * Get position for a cell by row and column indices
 */
export function useCellPositionByIndices$(rowIndex: number, columnIndex: number) {
  const cellKey = CoordinateUtils.createCellKey(rowIndex.toString(), columnIndex.toString())
  return useCellPosition$(cellKey)
}

/**
 * Get positions for multiple cells efficiently
 */
export function useMultipleCellPositions$(cellKeys: string[]) {
  return computed(() => {
    const domPositions = domPositions$.cellPositions.get()
    const virtualCalc = virtualCellPosition$.get()

    return cellKeys.map((cellKey) => {
      // Try DOM first
      const domPosition = domPositions.get(cellKey)
      if (domPosition) {
        return {
          cellKey,
          position: { ...domPosition, source: 'dom' as const, priority: 'high' as const },
        }
      }

      // Fall back to virtual
      const cellRef = CoordinateUtils.parseCellKey(cellKey)
      if (cellRef) {
        const virtualPosition = virtualCalc.getCellPositionByIds(cellRef.rowId, cellRef.columnId)
        if (virtualPosition) {
          return {
            cellKey,
            position: { ...virtualPosition, source: 'virtual' as const, priority: 'low' as const },
          }
        }
      }

      return { cellKey, position: null }
    })
  })
}

/**
 * Check if a cell is currently visible in the DOM
 */
export function useCellVisibility$(cellKey: string) {
  return computed(() => {
    const domPositions = domPositions$.cellPositions.get()
    const position = domPositions.get(cellKey)
    return position?.isVisible || false
  })
}

/**
 * Get all currently visible cell keys
 */
export function useVisibleCellKeys$() {
  return computed(() => {
    const domPositions = domPositions$.cellPositions.get()
    return Array.from(domPositions.entries())
      .filter(([_, position]) => position.isVisible)
      .map(([cellKey, _]) => cellKey)
  })
}

/**
 * Track whether a cell is in the virtual viewport range
 */
export function useCellInVirtualRange$(cellKey: string) {
  return computed(() => {
    const cellRef = CoordinateUtils.parseCellKey(cellKey)
    if (!cellRef) return false

    const virtualCalc = virtualCellPosition$.get()
    const rowIndex = virtualCalc.getRowIndex(cellRef.rowId)
    const columnIndex = virtualCalc.getColumnIndex(cellRef.columnId)

    if (rowIndex === -1 || columnIndex === -1) return false

    return virtualCalc.isCellInVisibleRange(rowIndex, columnIndex)
  })
}

/**
 * Get position with fallback to specific default
 */
export function useCellPositionWithFallback$(cellKey: string, fallback: CellCoordinates) {
  return computed(() => {
    const position = useCellPosition$(cellKey).get()
    return position || fallback
  })
}

/**
 * Hook for overlay positioning - includes additional metadata
 */
export function useOverlayCellPosition$(cellKey: string) {
  return computed(() => {
    const position = useCellPosition$(cellKey).get()

    if (!position) return null

    return {
      ...position,
      // Additional metadata for overlays
      isStable: position.source === 'dom', // DOM positions are more stable
      shouldUpdate: position.timestamp > Date.now() - 100, // Recent update
      zIndex: position.source === 'dom' ? 10 : 5, // DOM positions higher priority
    }
  })
}

/**
 * Get cell bounds for intersection/collision detection
 */
export function useCellBounds$(cellKey: string) {
  return computed(() => {
    const position = useCellPosition$(cellKey).get()

    if (!position) return null

    return {
      left: position.x,
      top: position.y,
      right: position.x + position.width,
      bottom: position.y + position.height,
      centerX: position.x + position.width / 2,
      centerY: position.y + position.height / 2,
    }
  })
}

/**
 * Hook for performance-sensitive components that need to minimize recalculations
 */
export function useCellPositionThrottled$(cellKey: string, throttleMs: number = 16) {
  return computed(() => {
    const position = useCellPosition$(cellKey).get()

    if (!position) return null

    // Throttle position updates to specified interval
    const throttledTimestamp = Math.floor(position.timestamp / throttleMs) * throttleMs

    return {
      ...position,
      timestamp: throttledTimestamp,
    }
  })
}

/**
 * Debug hook to compare DOM vs Virtual positions
 */
export function usePositionComparison$(cellKey: string) {
  return computed(() => {
    const domPositions = domPositions$.cellPositions.get()
    const domPosition = domPositions.get(cellKey)

    const virtualCalc = virtualCellPosition$.get()
    const cellRef = CoordinateUtils.parseCellKey(cellKey)
    const virtualPosition = cellRef
      ? virtualCalc.getCellPositionByIds(cellRef.rowId, cellRef.columnId)
      : null

    return {
      cellKey,
      dom: domPosition || null,
      virtual: virtualPosition || null,
      hasBoth: !!(domPosition && virtualPosition),
      difference:
        domPosition && virtualPosition
          ? {
              x: Math.abs(domPosition.x - virtualPosition.x),
              y: Math.abs(domPosition.y - virtualPosition.y),
              width: Math.abs(domPosition.width - virtualPosition.width),
              height: Math.abs(domPosition.height - virtualPosition.height),
            }
          : null,
    }
  })
}
