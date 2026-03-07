// Core types for VibeGridX Pure Observable architecture

// View state management types
export type SortConfig = {
  field: string
  direction: 'asc' | 'desc'
}

export type FilterConfig = {
  field: string
  operator:
    | 'equals'
    | 'not_equals'
    | 'contains'
    | 'not_contains'
    | 'starts_with'
    | 'ends_with'
    | 'greater_than'
    | 'less_than'
    | 'is_empty'
    | 'is_not_empty'
    | 'in'
    | 'not_in'
    | 'regex'
  value: any
  caseSensitive?: boolean
  negate?: boolean
}

// Import our local column types
import type { CellType as BaseCellType, Column as BaseColumn } from './column-types'
import type { VibeGridClipboardData } from './types/clipboard-types'

// Re-export CellType for external use
export type { BaseCellType as CellType }

// EnumOption for backwards compatibility
export interface EnumOption {
  value: string
  label: string
  cssClass?: string
  color?: string
  backgroundColor?: string
  icon?: string
  description?: string
  group?: string
  disabled?: boolean // For disabling specific options in select dropdowns
}

// ====================================
// RELATIONSHIP OPTIONS PROVIDER TYPES
// ====================================

// Context provided to relationship options providers
export interface RelationshipContext {
  // Current entity being edited (null for new entities)
  currentEntity: any | null
  // Column metadata for the relationship field
  column: Column
  // Field name being edited
  fieldName: string
}

// Provider function that returns filtered options for a relationship field
export type RelationshipOptionsProvider = (
  context: RelationshipContext,
) => Promise<EnumOption[]> | EnumOption[]

// Map of field names to their options providers
export type RelationshipOptionsProviders = Record<string, RelationshipOptionsProvider>

// ====================================
// CORE ENTITY TYPES
// ====================================

export interface TableRow {
  id: string
  data: Record<string, any>
  metadata: {
    createdAt: Date
    updatedAt: Date
    version: number
    isNew?: boolean
    isDirty?: boolean
  }
  [key: string]: any // Allow dynamic property access for GroupProcessor
}

// Runtime column type with all options
export interface Column<T = any> extends Omit<BaseColumn<T>, 'options' | 'cellType'> {
  // Override cellType to use full CellType union (BaseColumn uses constrained FieldTypeToCellType)
  cellType?: BaseCellType

  // Legacy support
  label?: string // Alias for name
  title?: string // Alias for name (legacy)
  header?: string // Alias for name (legacy)
  type?: string // Legacy field

  // Additional runtime options - override base type to include string[] for backward compatibility
  options?:
    | string[]
    | EnumOption[]
    | Array<{ value: string; label: string; color?: string; group?: string }>

  // Dynamic options provider for relationship fields
  relationshipOptionsProvider?: RelationshipOptionsProvider

  // Entity type for filtering relationship options (e.g., 'task' for StatusDefinition filtering)
  relationshipEntityType?: string

  // Relationship metadata
  relationshipType?: 'many-to-one' | 'one-to-many' | 'many-to-many'

  // Rollup field configuration
  rollupRelationship?: string
  rollupSourceEntity?: string
  rollupSourceField?: string
  rollupConditions?: any

  // Column interaction
  resizable?: boolean

  // Validation
  required?: boolean
  min?: number
  max?: number
  validation?: any // Validation rules

  // Editor configuration
  editor?: any

  // Enhanced field metadata from backend schema enhancement
  display?: {
    width?: number
    minWidth?: number
    maxWidth?: number
    label?: string
    sortable?: boolean
    filterable?: boolean
    resizable?: boolean
    format?: string
    [key: string]: any
  }
  capabilities?: {
    supportsSorting?: boolean
    supportsFiltering?: boolean
    supportsGrouping?: boolean
    supportsAggregation?: boolean
    requiresSpecialEditor?: boolean
    hasRichDisplay?: boolean
    [key: string]: any
  }
  accessibility?: {
    ariaLabel?: string
    ariaDescription?: string
    ariaRequired?: boolean
    [key: string]: any
  }
  statusSet?: any // Status set configuration for status fields

  // Default values and metadata
  defaultValue?: any
  description?: string // Help text shown below form fields
  meta?: any // Additional metadata

  // Pre-bound formatter from CellRenderer.format() during column-generation
  formatter?: (value: any, rowData?: any, column?: Column) => string
  fieldId?: string // For reactive options lookup

  // Additional display formatting
  className?: string
  style?: Record<string, any>

  // Primary field marker (uses entity-name field type with pencil icon)
  isPrimaryField?: boolean

  // Column visibility
  hidden?: boolean // Hide column by default (can be shown via column visibility toggle)

  // Additional text renderer options
  minLength?: number
  pattern?: string
  patternError?: string
  searchTerm?: string
  textTransform?: 'uppercase' | 'lowercase' | 'capitalize'
  colorMap?: Record<string, string>
  fontWeight?: string
  fontSize?: string

  // Additional number renderer options
  minimumFractionDigits?: number
  maximumFractionDigits?: number
  step?: number
  useLocale?: boolean
  locale?: string
  currency?: string
  prefix?: string
  suffix?: string
  showArrows?: boolean
  showPlusSign?: boolean
  negativeFormat?: 'minus' | 'parentheses'
  negativeColor?: string
  positiveColor?: string
  zeroColor?: string
  colorScale?: any
  numberFormat?: any

  // Additional date renderer options
  inputFormat?: string
  dateOptions?: Intl.DateTimeFormatOptions
  timeOptions?: Intl.DateTimeFormatOptions
  dateTimeOptions?: Intl.DateTimeFormatOptions
  showRelativeTime?: boolean
  relativeTimePosition?: 'append' | 'replace'
  minDate?: string | Date
  maxDate?: string | Date
  allowedDaysOfWeek?: number[]
  pastColor?: string
  futureColor?: string
  todayColor?: string
  highlightOverdue?: boolean
  highlightUpcoming?: boolean
  upcomingDays?: number
  customFormat?: (date: Date) => string

  // Boolean renderer options
  allowNull?: boolean
  trueLabel?: string
  falseLabel?: string
  nullLabel?: string
  trueIcon?: string
  falseIcon?: string
  nullIcon?: string
  trueColor?: string
  falseColor?: string
  nullColor?: string
  trueBadgeColor?: string
  falseBadgeColor?: string
  nullBadgeColor?: string
  readOnly?: boolean

  // Enum renderer options
  enumOptions?: EnumOption[]
  strictEnum?: boolean
  multiple?: boolean
  maxSelections?: number
  minSelections?: number
  customRender?: (value: any, option?: EnumOption) => string

  // Column visibility options
  hideable?: boolean // Whether column can be hidden (default: true)
}

export interface TableSettings {
  enableVirtualScrolling?: boolean
  enableGrouping?: boolean
  enableFiltering?: boolean
  enableFormulas?: boolean
  enableCollaboration?: boolean
  pageSize?: number
  rowHeight?: number
  bufferSize?: number
  initialViewport?: ViewportInfo

  // Editing configuration - single-click is always enabled
  // No configuration needed - editing is always available
}

// ====================================
// SELECTION TYPES
// ====================================

export interface CellRef {
  rowId: string
  columnId: string
}

export interface SelectionRange {
  start: CellRef
  end: CellRef
}

export type SelectionMode = 'single' | 'range' | 'column' | 'row'

// ====================================
// INTERACTION TYPES
// ====================================

export interface ColumnDragState {
  isDragging: boolean
  draggedColumnId: string | null
  startIndex: number
  currentIndex: number
}

export interface ColumnResizeState {
  isResizing: boolean
  columnId: string
  startWidth: number
  newWidth: number
}

// ====================================
// EDIT TYPES
// ====================================

export interface EditingState {
  cellRef: CellRef
  value: any
  originalValue: any
  isValid: boolean
  validationErrors: string[]
}

export interface OptimisticOperation {
  id: string
  type: 'update' | 'create' | 'delete'
  entityId: string
  field: string
  newValue: any
  oldValue: any
  timestamp: number
}

// ====================================
// VIEW TYPES
// ====================================

// Removed duplicate SortConfig and FilterConfig interfaces
// Using the type definitions from the top of the file

export type FilterOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'starts_with'
  | 'ends_with'
  | 'greater_than'
  | 'less_than'
  | 'between'
  | 'is_empty'
  | 'is_not_empty'
  | 'in'
  | 'not_in'
  | 'regex'
  | 'decision_status'

export interface GroupNode {
  id: string
  field: string
  value: any
  displayValue: string // Human-readable display text
  level: number
  parentId?: string // For hierarchical grouping
  rowCount: number
  totalCount?: number // Recursive count for nested groups
  children: GroupNode[] | TableRow[]
  isCollapsed?: boolean
  summary?: Record<string, any>
  aggregations?: GroupAggregation[] // Calculated aggregations
  sortOrder?: number // Custom group ordering
}

// ====================================
// VIRTUAL ROW TYPES (for Mixed Rendering)
// ====================================

export type VirtualRowType = 'data' | 'group' | 'summary' | 'expanded-content'

export interface VirtualRow {
  type: VirtualRowType
  id: string
  index: number // Position in the flattened virtual array
  dataIndex?: number // Position among data rows only (excludes expanded-content/group rows, used for zebra striping)
  height: number // Row height (may vary by type)
  offset?: number // Vertical offset in pixels (for virtualization)
  data: TableRow | GroupNode | null // The actual data (null for expanded-content rows)
  level?: number // Nesting level for groups
  isExpandable?: boolean // Can be expanded/collapsed
  isExpanded?: boolean // Current expansion state for groups
  parentGroupId?: string // Parent group for data rows
  groupId?: string // Group ID for drag-drop operations (same as parentGroupId for data rows)
  // Expanded content row fields (GH#1240)
  parentRowId?: string // Parent row ID for expanded content rows
  expandedData?: unknown[] | null // Loaded data for expanded content
  isLoading?: boolean // Whether expanded data is loading
  error?: Error | null // Error from loading expanded data
}

// Group aggregation configuration and results
export interface GroupAggregation {
  field: string
  function: 'count' | 'sum' | 'avg' | 'min' | 'max' | 'unique'
  value: number | string
  displayValue: string
}

/**
 * Resolves entity names for relationship fields in group headers.
 * Returns the display name for an entity, or null if not found/loaded.
 */
export type RelationshipNameResolver = (targetEntityType: string, entityId: string) => string | null

// Group configuration for multi-level grouping
export interface GroupConfig {
  fields: GroupField[] // Multiple grouping fields
  sortBy: 'name' | 'count' | 'custom'
  sortDirection: 'asc' | 'desc'
  aggregations: AggregationConfig[]
  expandedGroups: Set<string> // Which groups are expanded
  colorScheme?: 'auto' | 'none' | 'custom'
  /** Optional resolver for relationship field display names */
  relationshipNameResolver?: RelationshipNameResolver
}

export interface GroupField {
  field: string // Column field name
  displayName: string // Human-readable name
  label?: string // Alias for displayName
  sortDirection?: 'asc' | 'desc' // Sort direction for this group
}

export interface AggregationConfig {
  field: string // Field to aggregate
  function: 'count' | 'sum' | 'avg' | 'min' | 'max' | 'unique'
  displayName?: string // Custom display name
  type?: 'count' | 'sum' | 'avg' | 'min' | 'max' | 'unique' // Alias for function
  label?: string // Alias for displayName
}

// ====================================
// DRAG TYPES
// ====================================

export interface DraggedItem {
  type: 'row' | 'column' | 'group' | 'cell'
  id: string
  index?: number
  data?: any
}

export interface DropTarget {
  type: 'row' | 'column' | 'group' | 'cell' | 'selection'
  id: string
  position: 'above' | 'below' | 'left' | 'right'
  valid: boolean
}

// ====================================
// VIEWPORT TYPES
// ====================================

export interface ViewportInfo {
  start: number
  end: number
  height: number
  width: number
  viewportWidth?: number
  viewportHeight?: number
  scrollTop: number
  scrollLeft?: number
  itemHeight: number
}

// ====================================
// CONTEXT TYPES
// ====================================

export interface TableContext {
  id: string
  entityType: 'task' | 'project' | 'user' | string
  columns: Column<any>[]
  rows: TableRow[] // Processed and sorted rows ready for rendering
  visibleRowIds: string[] // Currently visible row IDs in viewport
  allRowIds: string[] // All row IDs in the dataset
  settings: TableSettings
  version: number
  enableSelectionColumn: boolean

  // Row dimensions
  rowHeight: number
  totalRows: number

  // Coordinate mapping - single source of truth
  coordinateMapping?: any // Will be typed as CoordinateMapping after import

  // Entities from parent component (via EntityIntegration/domain atoms)
  entities: any[] // Raw entity data provided by parent

  // Relationship resolvers for foreign key lookups
  relationshipResolvers: Record<string, (id: string | string[]) => string>

  // Entity update handler for self-contained saves
  onEntityUpdate?: (rowId: string, updates: Record<string, any>) => Promise<void> | void

  // Batch entity update handler for bulk operations
  onBatchEntityUpdate?: (
    updates: Array<{ id: string; updates: Record<string, any> }>,
  ) => Promise<void> | void

  // Notification handler for user feedback
  onNotification?: (message: string, type: 'info' | 'warning' | 'error' | 'success') => void

  // View state now managed by store actor

  // Current viewport for coordinate calculations
  viewport: ViewportInfo | null

  // Selection state (for stateless canvas rendering)
  selectedCells: Set<string>

  // Actor references
  // Legacy actors section removed - Pure Observable architecture uses no actors

  // Performance tracking
  performance: {
    lastRenderTime: number
    totalRows: number
    visibleRows: number
    activeActors: number
  }

  // Timer for batching view updates during rapid data changes
  pendingViewUpdateTimer?: NodeJS.Timeout | null

  // Store actor for data subscription
  storeActor?: any

  // Pending surgical update data to be sent to renderer
  pendingSurgicalUpdate?: {
    changes: Array<{ id: string; operation: 'update'; data: any }>
    relationshipResolvers: Record<string, (id: string | string[]) => string>
  }

  // Relationship cache removed - now handled by store actor

  // Relationship data from store for edit dropdowns
  relationshipData?: {
    projects: any[]
    users: any[]
  }

  // Clipboard state (from overlay slice)
  clipboardState?: VibeGridClipboardData | null

  // Context menu state
  contextMenu: {
    isVisible: boolean
    position: { x: number; y: number; clientX: number; clientY: number } | null
    context: {
      type: 'cell' | 'header' | 'general'
      rowId?: string
      columnId?: string
    } | null
  }
}

export interface SelectionContext {
  selectedCells: Set<string> // "rowId:columnId"
  selectedRows: Set<string> // Row IDs for checkbox selection
  activeCell: CellRef | null
  selectionRanges: SelectionRange[]
  selectionMode: SelectionMode
  anchor: CellRef | null // For range selection
  lastSelectedRowId: string | null // For shift+click range selection
}

export interface EditContext {
  editingCell: CellRef | null
  editValue: any
  originalValue: any
  validationErrors: Map<string, string>
  optimisticOperations: Map<string, OptimisticOperation>
  isDirty: boolean
}

export interface ViewContext {
  groupBy: string[]
  groupTree: GroupNode[]
  collapsedGroups: Set<string>
  sortBy: SortConfig[]
  filters: FilterConfig[]
  viewport: ViewportInfo
  columnVisibility: Record<string, boolean> // columnId -> visible
  hiddenColumnCount: number
  columnOrder: string[] // Array of column IDs in display order
}

export interface DragContext {
  draggedItem: DraggedItem | null
  dropTarget: DropTarget | null
  isActive: boolean
  constraints: Record<string, any>
}

// Row selection state
export interface RowSelectionState {
  selectedRows: Set<string>
  lastSelectedRowId: string | null
  selectionMode: 'checkbox' | 'cell' | 'both'
}

// ====================================
// EVENT TYPES
// ====================================

export type TableEvents =
  // Entity configuration
  | { type: 'SET_ENTITY_TYPE'; entityType: string; columns: Column[] }
  | { type: 'SET_VISIBLE_ENTITIES'; entityIds: string[] }
  | { type: 'SET_ENTITIES'; entities: any[] }
  | { type: 'UPDATE_RELATIONSHIP_DATA'; relationshipTable: string; data: Record<string, any> }
  | { type: 'ROWS_SORTED'; rowIds: string[]; sortBy: SortConfig[] }

  // Selection events
  | {
      type: 'selection.cell.select'
      rowId: string
      columnId: string
      ctrlKey?: boolean
      shiftKey?: boolean
    }
  | { type: 'selection.range.select'; start: CellRef; end: CellRef }
  | { type: 'selection.row.select'; rowId: string; extend?: boolean }
  | { type: 'selection.column.select'; columnId: string; extend?: boolean }
  | { type: 'selection.bulk.set'; selectedCells: Set<string> }
  | { type: 'selection.clear' }
  | { type: 'selection.drag.start'; startCell: CellRef }
  | { type: 'selection.drag.move'; currentCell: CellRef; selectedCells: Set<string> }
  | { type: 'selection.drag.end'; selectedCells: Set<string> }
  | { type: 'selection.checkbox.toggle'; rowId: string }
  | { type: 'selection.checkbox.all' }
  | { type: 'selection.checkbox.none' }
  | { type: 'selection.checkbox.range'; startRowId: string; endRowId: string }

  // Edit events
  | { type: 'edit.cell.start'; rowId: string; columnId: string }
  | { type: 'edit.value.update'; value: any }
  | { type: 'edit.commit' }
  | { type: 'edit.cancel' }
  | { type: 'edit.row.create'; insertAfter?: string }

  // Keyboard events
  | { type: 'keyboard.arrow'; direction: 'up' | 'down' | 'left' | 'right'; extend?: boolean }
  | { type: 'keyboard.copy' }
  | { type: 'keyboard.paste'; data?: string }
  | { type: 'keyboard.delete' }
  | { type: 'keyboard.enter'; shift?: boolean }
  | { type: 'keyboard.tab'; shift?: boolean }
  | { type: 'keyboard.escape' }

  // Context menu events
  | {
      type: 'contextmenu.show'
      rowId: string
      columnId: string
      x: number
      y: number
      clientX: number
      clientY: number
    }
  | {
      type: 'contextmenu.show.header'
      columnId: string
      x: number
      y: number
      clientX: number
      clientY: number
    }
  | { type: 'contextmenu.show.general'; x: number; y: number; clientX: number; clientY: number }
  | { type: 'contextmenu.hide' }
  | { type: 'contextmenu.copy' }
  | { type: 'contextmenu.paste' }
  | { type: 'contextmenu.cut' }
  | { type: 'contextmenu.insert.row' }
  | { type: 'contextmenu.delete.row' }
  | { type: 'contextmenu.insert.column' }
  | { type: 'contextmenu.delete.column' }

  // Group events (enhanced)
  | { type: 'group.config.set'; config: GroupConfig }
  | { type: 'group.field.add'; field: GroupField }
  | { type: 'group.field.remove'; field: string }
  | { type: 'group.field.reorder'; fromIndex: number; toIndex: number }
  | { type: 'group.toggle'; groupId: string }
  | { type: 'group.expand.all' }
  | { type: 'group.collapse.all' }
  | { type: 'group.aggregation.add'; config: AggregationConfig }
  | { type: 'group.aggregation.remove'; field: string }
  | { type: 'group.aggregation.update'; field: string; config: AggregationConfig }
  | { type: 'group.sort.set'; sortBy: 'name' | 'count' | 'custom'; direction: 'asc' | 'desc' }
  | {
      type: 'group.move.item'
      itemId: string
      fromGroupId: string
      toGroupId: string
      newValue: any
    }

  // Legacy group events (deprecated - use enhanced events above)
  | { type: 'view.group.set'; groupBy: string[] }
  | { type: 'view.group.toggle'; groupId: string }
  | { type: 'view.sort.set'; sortBy: SortConfig[] }
  | { type: 'view.column.click'; columnId: string; field: string; shiftKey: boolean }
  | { type: 'view.filter.set'; filters: FilterConfig[] }
  | { type: 'view.viewport.update'; viewport: ViewportInfo }
  | { type: 'view.columns.toggle'; columnId: string }
  | { type: 'view.columns.show.all' }
  | { type: 'view.columns.hide.all' }
  | { type: 'view.columns.visibility.set'; visibility: Record<string, boolean> }
  | { type: 'view.columns.drag.start'; columnId: string; x: number; y: number }
  | { type: 'view.columns.drag.move'; x: number; y: number }
  | { type: 'view.columns.drag.end'; targetIndex: number }
  | { type: 'view.columns.drag.cancel' }
  | { type: 'view.columns.reorder'; fromIndex: number; toIndex: number }
  | { type: 'view.columns.order.set'; order: string[] }
  | { type: 'view.columns.order.reset' }
  | { type: 'view.columns.resize.start'; columnId: string; x: number; width: number }
  | { type: 'view.columns.resize.move'; columnId: string; width: number; x: number }
  | { type: 'view.columns.resize.end'; columnId: string; width: number }
  | { type: 'view.columns.resize.cancel' }
  | { type: 'view.column.resized'; columnId: string; width: number } // Event from view coordinator to parent

  // Drag events
  | { type: 'drag.row.start'; rowId: string }
  | { type: 'drag.row.over'; targetRowId: string; position: 'above' | 'below' }
  | { type: 'drag.row.drop' }
  | { type: 'drag.cancel' }

  // Performance events
  | { type: 'PERFORMANCE_MARK'; operation: string; duration: number }
  | { type: 'ACTOR_SPAWNED'; actorType: string; actorId: string }
  | { type: 'ACTOR_STOPPED'; actorType: string; actorId: string }

  // Resize state events from view coordinator
  | { type: 'view.resize.started'; columnId: string; startX: number; startWidth: number }
  | { type: 'view.resize.updated'; columnId: string; width: number }
  | { type: 'view.resize.ended' }
  | { type: 'view.resize.cancelled' }

  // Fill events (responses from canvas actor)
  | { type: 'FILL_START'; direction: 'vertical' | 'horizontal' }
  | { type: 'FILL_PREVIEW'; previewCells: Set<string> }
  | { type: 'FILL_COMPLETE'; fillCells: Set<string> }
  | { type: 'FILL_CANCEL' }

  // Data subscription events (from data subscription actor)
  | { type: 'DATA_UPDATE'; data: any[] }
  | { type: 'DATA_SUBSCRIPTION_ERROR'; error: Error }

  // Store subscription events
  | { type: 'STORE_SNAPSHOT_RECEIVED'; snapshot: any }

// ====================================
// CONFIGURATION TYPES
// ====================================

export interface TableConfig {
  id: string
  entityType: string
  columns: Column<any>[]
  entities?: any[] // CLEAN API: Pass entities directly instead of atomConfig
  relationshipResolvers?: Record<string, (id: string | string[]) => string> // Resolvers for relationship columns
  initialData?: TableRow[]
  initialRelationshipData?: Record<string, Array<{ id: string; [key: string]: any }>> // Initial relationship data from loader
  settings?: TableSettings
  enableSelectionColumn?: boolean
  persistedData?: any // Persisted UI state from localStorage (sync machine pattern)
  onEntityUpdate?: (rowId: string, updates: Record<string, any>) => Promise<void> | void // Generic entity update handler
  onBatchEntityUpdate?: (
    updates: Array<{ id: string; updates: Record<string, any> }>,
  ) => Promise<void> | void // Batch entity update handler
  onNotification?: (message: string, type: 'info' | 'warning' | 'error' | 'success') => void // Notification handler

  // New store-based architecture
  store?: any // Table data store instance from useTableData hook
  storeActor?: any // XState store actor for data subscription
  initialRows?: any[] // Pre-resolved rows for immediate render
}

// ====================================
// RELATIONSHIP DATA TYPES
// ====================================

export interface RelationshipDataProvider {
  [key: string]: {
    data: Array<{ id: string; name?: string; [key: string]: any }>
    displayField?: string
  }
}

// ====================================
// RENDERER TYPES
// ====================================

export interface RendererOptions {
  container: HTMLElement
  columns?: Column<any>[]
  // Dimension manager removed - use coordinateMapping instead
  // Row dimension manager removed - use coordinateMapping instead
  coordinateManager?: any // Will be typed as VibeGridXCoordinateManager
  relationshipData?: RelationshipDataProvider
  enableSelectionColumn?: boolean
  onCellClick?: (rowId: string, columnId: string, event: MouseEvent) => void
  onCellDoubleClick?: (rowId: string, columnId: string, event: MouseEvent) => void
  onColumnClick?: (columnId: string, event: MouseEvent) => void
  onColumnDragStart?: (columnId: string, x: number, y: number) => void
  onColumnDragMove?: (x: number, y: number) => void
  onColumnDragEnd?: (targetIndex: number) => void
  onColumnResizeStart?: (columnId: string, x: number, width: number) => void
  onColumnResizeMove?: (x: number) => void
  onColumnResizeEnd?: () => void
  onStateChange?: (state: any) => void
  onScroll?: (viewport: ViewportInfo) => void
  onKeyDown?: (event: KeyboardEvent) => void
  onSelectionChange?: (selectedCells: Set<string>) => void
  onFillComplete?: (originalCells: Set<string>, fillCells: Set<string>) => void
  // onCanvasContainerReady removed - now using event-driven pattern
  debug?: boolean

  // Relationship context for editing system
  relationshipContext?: {
    relationshipResolvers?: Record<string, (id: string | string[]) => string>
    relationshipAtoms?: Record<string, any>
  }

  // Edit callbacks for editing system
  onEditUpdate?: (value: any) => void
  onEditCommit?: (value: any) => void
  onEditCancel?: () => void

  // Canvas overlay configuration
  cellHeight?: number
  cellWidth?: number
  selectionColor?: string
  selectionBorderColor?: string
  editingColor?: string
  editingBorderColor?: string
  enableAnimations?: boolean
  animationDuration?: number
  borderWidth?: number

  // Performance: Initial viewport for virtual scrolling
  initialViewport?: ViewportInfo
}

export interface RenderState {
  rows: TableRow[] // All rows in the table (renamed from visibleRows for clarity)
  virtualRows?: VirtualRow[] // Mixed row types for grouped rendering (optional - fallback to rows)
  columns?: Column<any>[]
  selectedCells: Set<string>
  editingCell: CellRef | null
  groupedData: GroupNode[]
  groupConfig?: GroupConfig // Current group configuration
  optimisticOperations: Map<string, OptimisticOperation>
  version: number
  sortBy?: SortConfig[] // Current sort configuration
  columnVisibility?: Record<string, boolean> // Column visibility state
  columnOrder?: string[] // Column order array

  // AUTHORITATIVE coordinate mapping from state machine (updated for variable heights)
  coordinateMapping?: {
    rows: Array<{
      rowId: string
      originalIndex: number
      sortedIndex: number
      offset: number
      height?: number // Variable height support
      type?: VirtualRowType // Row type for mixed rendering
    }>
    columns: Array<{
      columnId: string
      index: number
      offset: number
      width: number
    }>
    totalHeight?: number // Total content height for virtual scrolling
    version: number
  }
}

// ====================================
// CHANGE DETECTION TYPES
// ====================================

export interface EntityChange {
  id: string
  operation: 'insert' | 'update' | 'delete'
  data: Record<string, any>
  previousData?: Record<string, any>
  changedFields?: string[]
}

export interface DataChangesEvent {
  type: 'DATA_CHANGES'
  table: string
  changes: EntityChange[]
}

// ====================================
// CLIPBOARD TYPES
// ====================================

export * from './types/clipboard-types'
