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

// Position tracking and lifecycle hooks
export {
  useManualPositionUpdate,
  usePositionChangeHandler,
  usePositionDebug,
  usePositionTracking,
  useResizeTracking,
  useScrollTracking,
} from './use-position-tracking'

// Note: Core position hooks (useCellPosition, etc.) removed in Phase 6
// Controllers use coordinateManager directly via MobX reactions
// React components use observer() + coordinateManager for reactivity
// No special hooks needed with proper MobX integration
