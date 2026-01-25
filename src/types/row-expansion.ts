/**
 * Row Expansion Types
 *
 * Type definitions for the generic row expansion system.
 * GH#1240: VibeGrid Generic Row Expansion
 */

import type { VirtualRow, Column } from '../types'

// ====================================
// EXPANSION CONFIGURATION
// ====================================

/**
 * Configuration for row expansion behavior
 */
export interface RowExpansionConfig {
  /** Enable row expansion */
  enabled: boolean

  /** Allow multiple rows to be expanded simultaneously */
  allowMultiple?: boolean

  /** Persist expansion state to localStorage */
  persistState?: boolean

  /** Height of expanded content row (for virtualization) */
  expandedContentHeight?: number | 'auto' | ((rowId: string, data: unknown) => number)

  /** Render function for expanded content */
  renderExpandedContent?: (props: ExpandedContentProps) => React.ReactNode

  /** Columns for nested VibeGrid (if using nested grid pattern) */
  nestedColumns?: Column[]

  /** Entity type for nested data (for DataForge integration) */
  nestedEntityType?: string

  /** Relationship type linking parent to children */
  relationshipType?: string

  /** Data loader for expanded content */
  loadExpandedData?: (rowId: string, rowData: unknown) => Promise<unknown[]>

  /** Show loading state while fetching expanded data */
  showLoadingState?: boolean
}

/**
 * Props passed to renderExpandedContent function
 */
export interface ExpandedContentProps {
  /** Row ID of the parent row */
  rowId: string

  /** Data of the parent row */
  rowData: unknown

  /** Loaded expanded data (children) */
  expandedData: unknown[] | null

  /** Whether expanded data is loading */
  isLoading: boolean

  /** Error if data loading failed */
  error: Error | null

  /** Function to collapse this row */
  onCollapse: () => void

  /** Nested columns (if configured) */
  nestedColumns?: Column[]

  /** Nested entity type (if configured) */
  nestedEntityType?: string
}

// ====================================
// EXPANSION STATE
// ====================================

/**
 * State for a single expanded row
 */
export interface ExpandedRowState {
  /** Row ID */
  rowId: string

  /** Loaded child data */
  data: unknown[] | null

  /** Whether data is currently loading */
  isLoading: boolean

  /** Error if loading failed */
  error: Error | null

  /** Timestamp when data was loaded (for cache invalidation) */
  loadedAt: number | null
}

/**
 * Cache configuration for expanded data
 */
export interface ExpansionCacheConfig {
  /** Time-to-live in milliseconds (default: 5 minutes) */
  ttl?: number

  /** Maximum number of expanded rows to cache */
  maxSize?: number

  /** Clear cache on data mutation */
  invalidateOnMutation?: boolean
}

// ====================================
// VIRTUAL ROW TYPES
// ====================================

/**
 * Virtual row representing expanded content
 * Extends VirtualRow with expansion-specific fields
 */
export interface ExpandedContentVirtualRow extends VirtualRow {
  /** Row type marker */
  type: 'expanded-content'

  /** Parent row ID */
  parentRowId: string

  /** Loaded expanded data */
  expandedData: unknown[] | null

  /** Whether data is loading */
  isLoading: boolean

  /** Error state */
  error: Error | null
}

/**
 * Type guard to check if a virtual row is expanded content
 */
export function isExpandedContentRow(row: VirtualRow): row is ExpandedContentVirtualRow {
  return row.type === 'expanded-content'
}

// ====================================
// EXPANSION EVENTS
// ====================================

/**
 * Event fired when row expansion state changes
 */
export interface RowExpansionChangeEvent {
  /** Type of change */
  type: 'expand' | 'collapse' | 'expand-all' | 'collapse-all'

  /** Affected row IDs */
  rowIds: string[]

  /** Current set of expanded rows */
  expandedRowIds: Set<string>
}

/**
 * Event fired when expanded data is loaded
 */
export interface ExpandedDataLoadEvent {
  /** Row ID */
  rowId: string

  /** Loaded data */
  data: unknown[] | null

  /** Error if failed */
  error: Error | null

  /** Load duration in ms */
  duration: number
}

// ====================================
// EXPANSION ACTIONS
// ====================================

/**
 * Actions available for row expansion
 */
export interface RowExpansionActions {
  /** Expand a single row */
  expandRow: (rowId: string) => void

  /** Collapse a single row */
  collapseRow: (rowId: string) => void

  /** Toggle expansion state of a row */
  toggleRowExpansion: (rowId: string) => void

  /** Expand all rows */
  expandAll: () => void

  /** Collapse all rows */
  collapseAll: () => void

  /** Check if a row is expanded */
  isRowExpanded: (rowId: string) => boolean

  /** Get expanded data for a row */
  getExpandedData: (rowId: string) => unknown[] | null

  /** Check if expanded data is loading */
  isExpandedDataLoading: (rowId: string) => boolean

  /** Refresh expanded data for a row */
  refreshExpandedData: (rowId: string) => Promise<void>
}

// ====================================
// PROPS FOR VIBEGRID
// ====================================

/**
 * Props related to row expansion for VibeGrid component
 */
export interface VibeGridExpansionProps {
  /** Enable row expansion */
  enableRowExpansion?: boolean

  /** Row expansion configuration */
  rowExpansionConfig?: RowExpansionConfig

  /** Callback when expansion state changes */
  onRowExpansionChange?: (event: RowExpansionChangeEvent) => void

  /** Callback when expanded data is loaded */
  onExpandedDataLoad?: (event: ExpandedDataLoadEvent) => void
}
