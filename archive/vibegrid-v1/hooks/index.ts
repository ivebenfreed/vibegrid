/**
 * VibeGrid Hybrid Position Hooks - Public API
 *
 * This is the main entry point for all position-related hooks.
 * Import from this file to access the hybrid positioning system.
 */

// Re-export types for convenience
export type {
  Bounds,
  CellCoordinates,
  CellPositionMap,
  CellRef,
  ColumnLayout,
  Position,
  PositionChangeEvent,
  PositionUpdateHandler,
  RowLayout,
  VirtualBounds,
  VirtualRange,
  VirtualViewport,
} from '../types/coordinate-types'
// Re-export utility functions
export { CoordinateTypeGuards, CoordinateUtils } from '../types/coordinate-types'
// Core position hooks
export {
  useCellBounds$,
  useCellInVirtualRange$,
  useCellPosition$,
  useCellPositionByIds$,
  useCellPositionByIndices$,
  useCellPositionThrottled$,
  useCellPositionWithFallback$,
  useCellVisibility$,
  useMultipleCellPositions$,
  useOverlayCellPosition$,
  usePositionComparison$,
  useVisibleCellKeys$,
} from './use-cell-position'
// Position tracking and lifecycle hooks
export {
  useManualPositionUpdate,
  usePositionChangeHandler,
  usePositionDebug,
  usePositionTracking,
  useResizeTracking,
  useScrollTracking,
} from './use-position-tracking'
// Position utility hooks
export {
  useAreAdjacent$,
  useCellCenter$,
  useCellPositionHistory$,
  useCellPositionInViewport$,
  useCellPositionSmooth$,
  useCellPositionStyle$,
  useClosestCell$,
  useOverlappingCells$,
  usePositionInCell$,
  useRelativePosition$,
  useSelectionBounds$,
} from './use-position-utils'
