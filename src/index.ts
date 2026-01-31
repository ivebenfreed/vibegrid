// ====================================
// VIBEGRIDX - COMPLETE POC EXPORT
// ====================================

export type { VibeGridProps, RowAction } from './VibeGrid'
// Main component
export { VibeGrid } from './VibeGrid'

// Modular components removed - files don't exist

// ====================================
// CORE TYPES
// ====================================

export type {
  CellRef,
  Column,
  DragContext,
  DraggedItem,
  DropTarget,
  EditContext,
  EditingState,
  FilterConfig,
  FilterOperator,
  GroupNode,
  OptimisticOperation,
  RendererOptions,
  RenderState,
  SelectionContext,
  SelectionMode,
  SelectionRange,
  SortConfig,
  TableConfig,
  TableContext,
  TableEvents,
  TableRow,
  TableSettings,
  ViewContext,
  ViewportInfo,
} from './types'

export type {
  FilterCondition,
  FilterGroup,
  FilterPreset,
  FilterBuilderState,
  ValidationError,
} from './types/filter-types'

// Row expansion types (GH#1240)
export type {
  RowExpansionConfig,
  ExpandedContentProps,
  ExpandedRowState,
  ExpansionCacheConfig,
  ExpandedContentVirtualRow,
  RowExpansionChangeEvent,
  ExpandedDataLoadEvent,
  RowExpansionActions,
  VibeGridExpansionProps,
} from './types/row-expansion'
export { isExpandedContentRow } from './types/row-expansion'

// Row expansion processor functions
export {
  processExpandedRows,
  createExpandedContentRow,
  calculateExpandedHeight,
  recalculateRowOffsets,
  getParentRowId,
  isExpandedContentRowId,
  getTotalExpandedHeight,
  filterExpandedRows,
  getNavigableRowIndices,
} from './processors/RowExpansionProcessor'

// Row expansion hook
export { useRowExpansion } from './hooks/useRowExpansion'

// Row expansion components (GH#1240 P2.4)
export { ExpandedContentPortals } from './components/ExpandedContentPortals'

// ====================================
// CORE RENDERER
// ====================================

export { SimplePassiveRenderer } from './renderers/core/SimplePassiveRenderer'

// ====================================
// VIRTUALIZATION
// ====================================

// Virtualization handled internally by UnifiedTableRenderer

// ====================================
// CANVAS OVERLAYS
// ====================================

// Canvas overlays available in './overlays/' directory

// ====================================
// UTILITY HOOKS
// ====================================

// Hook exports removed - check VibeGrid component directly

// ====================================
// ARCHITECTURE CONSTANTS
// ====================================

export const VIBEGRIDX_PERFORMANCE_TARGETS = {
  INITIAL_RENDER: 70, // ms
  CELL_UPDATE: 0.5, // ms
  SCROLL_FPS: 60, // fps
  MAX_VISIBLE_ROWS: 1000,
  ACTOR_POOL_SIZE: 20,
} as const

export const VIBEGRID_FEATURES = {
  PURE_OBSERVABLES: true,
  VIRTUAL_SCROLLING: true,
  CANVAS_OVERLAYS: true,
  OPTIMISTIC_UPDATES: true,
  DIRECT_DOM_UPDATES: true,
  DOMAIN_INTEGRATION: true,
} as const

/**
 * Architecture Summary:
 *
 * - SimplePassiveRenderer:
 *    Direct DOM manipulation for performance
 *    Granular updates only where needed
 *    <70ms initial render, <0.5ms cell updates
 *
 * - MobX State Management:
 *    TableCoreStore (data & configuration with persistence)
 *    InteractionStore (UI state - selection, editing, menus)
 *    VisualStateStore (viewport & scroll state)
 *
 * - Virtual Scrolling:
 *    Viewport-based row rendering
 *    Buffer and overscan for smooth scrolling
 *    Performance-optimized calculations
 *
 * - Canvas Overlays:
 *    Selection indicators and drag visualizations
 *    Layer-based rendering optimization
 *    Coordinate system management
 *
 * - Complete TypeScript Support:
 *    Comprehensive type system
 *    Observable type safety
 *    Column and entity typing
 *
 * This implementation achieves Notion/ClickUp-level performance using
 * MobX for reactive coordination while maintaining React for business
 * logic and leveraging direct DOM manipulation for performance-critical
 * rendering.
 */
