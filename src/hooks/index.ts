/**
 * VibeGrid Hybrid Position Hooks - Public API
 *
 * This is the main entry point for all position-related hooks.
 * Import from this file to access the hybrid positioning system.
 */

// Core position hooks
export {
  useCellPosition$,
  useCellPositionByIds$,
  useCellPositionByIndices$,
  useMultipleCellPositions$,
  useCellVisibility$,
  useVisibleCellKeys$,
  useCellInVirtualRange$,
  useCellPositionWithFallback$,
  useOverlayCellPosition$,
  useCellBounds$,
  useCellPositionThrottled$,
  usePositionComparison$
} from './use-cell-position';

// Position utility hooks
export {
  useSelectionBounds$,
  usePositionInCell$,
  useClosestCell$,
  useOverlappingCells$,
  useRelativePosition$,
  useCellCenter$,
  useCellPositionStyle$,
  useCellPositionHistory$,
  useCellPositionSmooth$,
  useAreAdjacent$,
  useCellPositionInViewport$
} from './use-position-utils';

// Position tracking and lifecycle hooks
export {
  usePositionTracking,
  usePositionChangeHandler,
  useScrollTracking,
  useResizeTracking,
  useManualPositionUpdate,
  usePositionDebug
} from './use-position-tracking';

// Re-export types for convenience
export type {
  CellCoordinates,
  CellRef,
  Position,
  Bounds,
  ColumnLayout,
  RowLayout,
  VirtualBounds,
  VirtualViewport,
  VirtualRange,
  PositionChangeEvent,
  PositionUpdateHandler,
  CellPositionMap
} from '../types/coordinate-types';

// Re-export utility functions
export { CoordinateUtils, CoordinateTypeGuards } from '../types/coordinate-types';