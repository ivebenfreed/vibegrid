/**
 * Visual State - Central Computed Place for All Table Visual State
 *
 * Factory Pattern Implementation - Each grid instance creates isolated state
 *
 * This is the SINGLE SOURCE OF TRUTH for all visual aspects of the table:
 * - Column dimensions (widths, positions, visibility)
 * - Scroll state and viewport calculations
 * - Layout geometry (total dimensions, visible ranges)
 * - Visual synchronization between header and body
 *
 * All renderers, managers, and components should read from this computed state ONLY.
 */

// TODO: Remove Legend State - migrating to MobX
// import { computed, observable, batch, when } from '@legendapp/state';
import { createLogger } from '@/lib/logging';
import type { Column, GroupConfig, SortConfig, FilterConfig, VirtualRow } from '../types';
import { GroupProcessor } from '../processors/GroupProcessor';

// ====================================
// UTILITY FUNCTIONS
// ====================================

/**
 * Apply sorting to raw processed rows
 * This is where visual state transforms raw data into presentation-ready data
 */
function applySorting(rawRows: any[], sortBy: SortConfig[]): any[] {
  fileLog.debug('🔄 applySorting called', {
    rawRowsCount: rawRows.length,
    sortByCount: sortBy.length,
    sortBy: sortBy.map(s => `${s.field}:${s.direction}`),
    firstRowBefore: rawRows[0]?.title
  });

  if (!sortBy.length) {
    fileLog.debug('🔄 applySorting: No sorting, returning original');
    return rawRows;
  }

  const sortedRows = [...rawRows].sort((a, b) => {
    for (const sort of sortBy) {
      const aVal = a[sort.field];
      const bVal = b[sort.field];

      // Handle null/undefined values
      if (aVal == null && bVal == null) continue;
      if (aVal == null) return sort.direction === 'asc' ? -1 : 1;
      if (bVal == null) return sort.direction === 'asc' ? 1 : -1;

      // Compare values
      let result = 0;
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        result = aVal.localeCompare(bVal);
      } else if (typeof aVal === 'number' && typeof bVal === 'number') {
        result = aVal - bVal;
      } else {
        // Convert to strings for comparison
        result = String(aVal).localeCompare(String(bVal));
      }

      if (result !== 0) {
        return sort.direction === 'asc' ? result : -result;
      }
    }
    return 0;
  });

  fileLog.debug('🔄 applySorting result', {
    firstRowAfter: sortedRows[0]?.title,
    lastRowAfter: sortedRows[sortedRows.length - 1]?.title,
    sortedRowsCount: sortedRows.length
  });

  return sortedRows;
}

const fileLog = createLogger('components/custom/vibegrid/stores/visual-state.ts');

// ====================================
// CORE VISUAL STATE TYPES
// ====================================

// Column state types (merged from columns-observable)
export interface ColumnState {
  // Core column data (from schema)
  columns: Column[];

  // User preferences (persisted)
  columnWidths: Record<string, number>;
  columnVisibility: Record<string, boolean>;
  columnOrder: string[];

  // Data display preferences (moved from data-state)
  sortBy: SortConfig[];
  filters: FilterConfig[];

  // Metadata
  entityType: string;
  orgId: string;
  userId: string;
}

export interface ColumnLayout {
  id: string;
  width: number;
  xOffset: number;
  visible: boolean;
  order: number;
}

export interface ViewportGeometry {
  // Viewport dimensions
  viewportWidth: number;
  viewportHeight: number;

  // Scroll positions
  scrollLeft: number;
  scrollTop: number;

  // Content dimensions
  totalWidth: number;
  totalHeight: number;

  // Visible ranges
  visibleColumnRange: { start: number; end: number };
  visibleRowRange: { start: number; end: number };
}

export interface VisualState {
  // Column layout (SINGLE SOURCE OF TRUTH)
  columnLayouts: ColumnLayout[];
  visibleColumns: ColumnLayout[];
  totalColumnsWidth: number;

  // Viewport geometry (COMPUTED)
  geometry: ViewportGeometry;

  // Synchronization state
  headerScrollLeft: number;
  bodyScrollLeft: number;
  scrollSynchronized: boolean;

  // Virtual rows (with grouping applied) - merged from visual-rows-state
  visualRows: VirtualRow[];
  totalRowsHeight: number;

  // Column management state (merged from columns-observable)
  columnState: ColumnState;
}

// ====================================
// VISUAL STATE FACTORY - Creates isolated instance
// ====================================

/**
 * Create a complete visual state system for a VibeGrid instance
 * This replaces the singleton pattern with per-instance isolation
 */
export function createVibeGridVisualState(entityType?: string) {
  const visualInputs$ = createVisualInputs$();
  const visualState$ = createVisualState$(visualInputs$);
  const visibleColumns$ = createVisibleColumns$(visualInputs$);
  const totalColumnsWidth$ = createTotalColumnsWidth$(visualInputs$, visibleColumns$);
  const visualOperations = createVisualOperations(visualInputs$, visualState$);


  return {
    visualInputs$,
    visualState$,
    visibleColumns$,
    totalColumnsWidth$,
    visualOperations,
    visualSyncStatus$: null as any, // Will be set during initialization
    // Add computed that provides sorted processedRows by combining data state + visual state
    createSortedProcessedRows$: (tableCore$: any) => {
      // Create computed observable that uses the correct visualInputs$ instance from this scope
      const thisVisualInputs$ = visualInputs$; // Capture the correct reference
      return computed(() => {
        const rawProcessedRows = tableCore$.processedRows.get(true);
        // Access sortBy from the captured visual inputs instance
        const sortBy = thisVisualInputs$.sortBy.get();
        fileLog.info('🔄 createSortedProcessedRows$ computed triggered', {
          rawRowsCount: rawProcessedRows.length,
          sortByCount: sortBy.length,
          sortByFirst: sortBy[0]?.field,
          sortByDirection: sortBy[0]?.direction,
          visualInputsExists: !!thisVisualInputs$,
          sortByExists: !!thisVisualInputs$.sortBy
        });
        return applySorting(rawProcessedRows, sortBy);
      });
    }
  };
}

// ====================================
// CORE OBSERVABLES (Input)
// ====================================

// Visual inputs factory function - creates isolated instance for each VibeGrid
export function createVisualInputs$() {
  return observable({
  // Column configuration
  columns: [] as Column[],
  columnWidths: {} as Record<string, number>,
  columnVisibility: {} as Record<string, boolean>,
  columnOrder: [] as string[],

  // Viewport state
  viewportWidth: 0,
  viewportHeight: 0,
  scrollLeft: 0,
  scrollTop: 0,

  // Data dimensions
  rowCount: 0,
  rowHeight: 40,

  // Grouping configuration
  groupConfig: null as GroupConfig | null,

  // Sorting configuration
  sortBy: [] as SortConfig[],

  // Filtering configuration
  filters: [] as FilterConfig[],

  // Entity context
  entityType: '',
  orgId: '',
  userId: '',


  // Processed data rows (input for visual rows)
  processedRows: [] as any[]
  });
}

// ====================================
// COMPUTED VISUAL STATE (Output)
// ====================================

/**
 * Create visual state computed observable for a specific VibeGrid instance
 */
export function createVisualState$(visualInputs$: any) {
  return computed((): VisualState => {
    // ✅ SELECTIVE TRACKING: Only track layout properties for column calculations
    const columnOrder = visualInputs$.columnOrder.get();
    const columnWidths = visualInputs$.columnWidths.get();
    const columnVisibility = visualInputs$.columnVisibility.get();
    const columns = visualInputs$.columns.get();
    const rowCount = visualInputs$.rowCount.get();
    const rowHeight = visualInputs$.rowHeight.get();

    // ✅ NON-TRACKING ACCESS: Don't track scroll properties in layout computation
    // Layout computation should only react to layout changes, not scroll changes
    const scrollLeft = visualInputs$.scrollLeft.peek();
    const scrollTop = visualInputs$.scrollTop.peek();
    const viewportWidth = visualInputs$.viewportWidth.peek();
    const viewportHeight = visualInputs$.viewportHeight.peek();

  // Calculate column layouts with cumulative positioning
  // This only recalculates when layout properties change, not on scroll!
  let cumulativeX = 70; // Start after drag column (30px) + row header (40px)
  const columnLayouts: ColumnLayout[] = [];

  columnOrder.forEach((columnId, index) => {
    const column = columns.find(c => c.id === columnId);
    if (!column) return;

    const width = columnWidths[columnId] || column.width || 150;
    const visible = columnVisibility[columnId] !== false;

    const layout: ColumnLayout = {
      id: columnId,
      width,
      xOffset: cumulativeX,
      visible,
      order: index
    };

    columnLayouts.push(layout);

    if (visible) {
      cumulativeX += width;
    }
  });

  // Filter visible columns
  const visibleColumns = columnLayouts.filter(col => col.visible);

  // Calculate total dimensions
  const totalColumnsWidth = visibleColumns.reduce((sum, col) => sum + col.width, 0);
  const totalWidth = 70 + totalColumnsWidth; // drag column (30px) + row header (40px) + columns
  const totalHeight = rowCount * rowHeight;

  // DISABLED: Column virtualization to fix header/body sync issues after reordering
  // Always render ALL columns to maintain sync between header and body
  const startColIndex = 0;
  const endColIndex = visibleColumns.length;

  // DEBUG: Log column rendering status (virtualization disabled) - use peeked values
  if (scrollLeft > 0) {
    console.log('🔍 COLUMN RENDERING DEBUG (NO VIRTUALIZATION)', {
      scrollLeft,
      viewportWidth,
      scrollRightEdge: scrollLeft + viewportWidth,
      startColIndex,
      endColIndex,
      visibleColumnsCount: visibleColumns.length,
      renderAllColumns: true,
      firstColXOffset: visibleColumns[0]?.xOffset,
      lastColXOffset: visibleColumns[endColIndex - 1]?.xOffset,
      totalWidth: totalColumnsWidth
    });
  }

  const startRowIndex = Math.floor(scrollTop / rowHeight);
  const endRowIndex = Math.min(rowCount,
    Math.ceil((scrollTop + Math.max(viewportHeight, 400)) / rowHeight) + 1  // Ensure minimum viewport
  );

  // DEBUG: Log visible range calculation to identify initial load issues
  if (scrollTop === 0) {
    console.log('🔍 VISIBLE RANGE DEBUG (initial load)', {
      scrollTop,
      viewportHeight,
      rowHeight,
      rowCount,
      startRowIndex,
      endRowIndex,
      expectedMinimumRows: Math.ceil(400 / rowHeight)
    });
  }

  const geometry: ViewportGeometry = {
    viewportWidth,
    viewportHeight,
    scrollLeft,
    scrollTop,
    totalWidth,
    totalHeight,
    visibleColumnRange: { start: startColIndex, end: endColIndex },
    visibleRowRange: { start: startRowIndex, end: endRowIndex }
  };

  return {
    columnLayouts,
    visibleColumns,
    totalColumnsWidth,
    geometry,
    headerScrollLeft: scrollLeft, // Header should match body
    bodyScrollLeft: scrollLeft,
    scrollSynchronized: true, // Always true when computed properly
    visualRows: computeVisualRows({
      processedRows: visualInputs$.processedRows.peek(), // Don't track processed rows changes here
      groupConfig: visualInputs$.groupConfig.peek()
    }),
    totalRowsHeight: totalHeight,
    columnState: {
      columns,
      columnWidths,
      columnVisibility,
      columnOrder,
      entityType: visualInputs$.entityType.peek(),
      orgId: visualInputs$.orgId.peek(),
      userId: visualInputs$.userId.peek()
    }
  };
  });
}

// ====================================
// VISUAL ROWS COMPUTATION (merged from visual-rows-state)
// ====================================

/**
 * Compute visual rows - data-state handles grouping, but ensure proper VirtualRow format
 */
function computeVisualRows(inputs: any): VirtualRow[] {
  const { processedRows, groupConfig } = inputs;

  // Guard against undefined processedRows
  if (!processedRows) {
    fileLog.debug('🎨 Visual rows computation - processedRows undefined, returning empty array');
    return [];
  }

  fileLog.info('🎨 Visual rows computation', {
    processedRowsCount: processedRows.length,
    hasGroupConfig: !!groupConfig,
    firstRowType: processedRows[0]?.type || 'undefined',
    firstRowData: processedRows[0] || 'undefined'
  });

  // If processedRows are already VirtualRow objects (from grouping), pass them through
  if (processedRows.length > 0 && processedRows[0]?.type) {
    fileLog.debug('🎨 ProcessedRows already in VirtualRow format, passing through');
    return processedRows;
  }

  // If no grouping, convert raw data rows to VirtualRow format for consistency
  // Handle both null configs and empty field configs as "no grouping"
  // Also handle configs with undefined fields (clearing scenarios)
  if (!groupConfig || !groupConfig.fields || groupConfig.fields.length === 0) {
    fileLog.debug('🎨 Converting raw rows to VirtualRow format (no grouping)', {
      rowCount: processedRows.length
    });

    return processedRows.map((row: any, index: number) => ({
      type: 'data' as const,
      id: row.id,
      index,
      height: 40,
      data: row
    }));
  }

  // This can happen during transition states - convert raw rows to VirtualRow format
  // This is a fallback for timing issues between groupConfig and processedRows updates
  fileLog.debug('🔄 Transition state: grouping configured but processedRows in raw format, converting', {
    groupConfig,
    processedRowsLength: processedRows.length,
    firstRowStructure: processedRows[0]
  });

  return processedRows.map((row: any, index: number) => ({
    type: 'data' as const,
    id: row.id,
    index,
    height: 40,
    data: row
  }));
}

// ====================================
// VISUAL ROWS OPERATIONS (merged from visual-rows-state)
// ====================================

export const visualRowsOperations = {
  /**
   * Check if a row is a group header
   */
  isGroupRow(row: VirtualRow): boolean {
    return row.type === 'group';
  },

  /**
   * Check if a row is a data row
   */
  isDataRow(row: VirtualRow): boolean {
    return row.type === 'data';
  },

  /**
   * Get the actual data from a visual row
   */
  getRowData(row: VirtualRow): any {
    return row.data;
  },

  /**
   * Get the nesting level of a row (for indentation)
   */
  getRowLevel(row: VirtualRow): number {
    return row.level || 0;
  },

  /**
   * Calculate total height of all visual rows
   */
  calculateTotalHeight(rows: VirtualRow[]): number {
    return rows.reduce((sum, row) => sum + row.height, 0);
  }
};

// ====================================
// CREATE VISUAL ROWS COMPUTED (exported function from visual-rows-state)
// ====================================

/**
 * Create a computed observable for visual rows that applies grouping
 * to the processed data rows from data-state
 */
export function createVisualRows$(
  processedRows$: { get: () => any[] },
  columns$: { get: () => any[] },
  visualInputs$: any
) {
  return computed(() => {
    const processedRows = processedRows$.get();
    const columns = columns$.get();
    const groupConfig = visualInputs$.groupConfig.get();

    // REMOVED: This was causing circular dependency - data observer fired on scroll
    // because scroll changes visual inputs, which triggers this computed, which sets
    // processedRows, which triggers data observer
    // visualInputs$.processedRows.set(processedRows);

    return computeVisualRows({ processedRows, columns, groupConfig });
  });
}

// ====================================
// VISUAL STATE SYNC STATUS (exported for persistence checking)
// ====================================

export let visualSyncStatus$: any = null;

// ====================================
// VISUAL STATE OPERATIONS
// ====================================

/**
 * Create visual operations for a specific VibeGrid instance
 */
export function createVisualOperations(visualInputs$: any, visualState$: any) {
  // CRITICAL: Use the instance-specific visualInputs$ passed as parameter
  // NOT a global one!

  return {

    /**
     * Initialize visual state with columns and context
     */
    initialize(columns: Column[], entityType: string, orgId: string, userId: string) {
    const defaultWidths = Object.fromEntries(
      columns.map(col => [col.id, col.width || 150])
    );
    const defaultVisibility = Object.fromEntries(
      columns.map(col => [col.id, true])
    );
    const defaultOrder = columns.map(col => col.id);

    // Get current state to preserve any loaded persistence values
    const currentState = visualInputs$.get();

    visualInputs$.set({
      columns,
      columnWidths: defaultWidths,
      columnVisibility: defaultVisibility,
      columnOrder: defaultOrder,
      viewportWidth: 0,
      viewportHeight: 0,
      scrollLeft: 0,
      scrollTop: 0,
      rowCount: 0,
      rowHeight: 40,
      groupConfig: null,
      // Preserve existing sortBy and filters from persistence
      sortBy: currentState.sortBy || [],
      filters: currentState.filters || [],
      entityType,
      orgId,
      userId,
      processedRows: []
    });

    fileLog.info('🎯 Visual state initialized', { entityType, columnCount: columns.length });
  },

  /**
   * Update column width - SINGLE MUTATION POINT
   */
  setColumnWidth(columnId: string, width: number) {
    // CRITICAL: Use the instance-specific visualInputs$ from closure
    const currentWidths = visualInputs$.columnWidths.get();
    fileLog.info('[RESIZE] 📏 setColumnWidth called - persisting width', {
      columnId,
      width,
      currentWidths,
      newWidths: {...currentWidths, [columnId]: width},
      visualInputsId: visualInputs$._id || 'no-id' // Debug: check instance
    });

    // Direct set without batch() to match reorderColumns pattern
    // This ensures the visual observer triggers immediately
    visualInputs$.columnWidths.set({
      ...currentWidths,
      [columnId]: width
    });

    fileLog.info('[RESIZE] 📏 Column width updated in visualInputs$ - should trigger visual observer', {
      columnId,
      width,
      updatedWidths: visualInputs$.columnWidths.get(),
      visualInputsId: visualInputs$._id || 'no-id' // Debug: check instance
    });
  },

  /**
   * Update viewport dimensions
   */
  setViewportSize(width: number, height: number) {
    visualInputs$.viewportWidth.set(width);
    visualInputs$.viewportHeight.set(height);

    fileLog.debug('📐 Viewport size updated', { width, height });
  },

  /**
   * Update scroll position - SINGLE MUTATION POINT
   */
  setScrollPosition(scrollLeft: number, scrollTop: number) {
    // Batch scroll updates to prevent observer from firing twice
    batch(() => {
      visualInputs$.scrollLeft.set(scrollLeft);
      visualInputs$.scrollTop.set(scrollTop);
    });

    fileLog.debug('📜 Scroll position updated', { scrollLeft, scrollTop });
  },

  /**
   * Update row count (from data changes)
   */
  setRowCount(count: number) {
    visualInputs$.rowCount.set(count);

    fileLog.debug('📊 Row count updated', { count });
  },


  // ====================================
  // VIEWPORT OPERATIONS (Consolidated from ViewportManager)
  // ====================================

  /**
   * Handle viewport scroll with proper sync between header and body
   */
  handleViewportScroll(scrollLeft: number, scrollTop: number, source: 'header' | 'body' = 'body') {
    // Debug: Check current values to see if this is actually a change
    const currentScrollLeft = visualInputs$.scrollLeft.get(true);
    const currentScrollTop = visualInputs$.scrollTop.get(true);

    if (currentScrollLeft === scrollLeft && currentScrollTop === scrollTop) {
      fileLog.debug('📜 Scroll event with same values - skipping update', { scrollLeft, scrollTop, source });
      return; // Skip update if values haven't changed
    }

    // Batch scroll updates to prevent observer from firing twice
    batch(() => {
      visualInputs$.scrollLeft.set(scrollLeft);
      visualInputs$.scrollTop.set(scrollTop);
    });

    fileLog.debug('📜 Viewport scrolled', { scrollLeft, scrollTop, source, changed: true });
  },

  /**
   * Update viewport size and trigger recalculation
   */
  updateViewportDimensions(width: number, height: number) {
    visualInputs$.viewportWidth.set(width);
    visualInputs$.viewportHeight.set(height);

    fileLog.debug('📐 Viewport dimensions updated', { width, height });
  },

  /**
   * Get current visible column range based on scroll position
   */
  getVisibleColumnRange(): { start: number; end: number } {
    const state = visualState$.get();
    return state.geometry.visibleColumnRange;
  },

  /**
   * Get current visible row range based on scroll position
   */
  getVisibleRowRange(): { start: number; end: number } {
    const state = visualState$.get();
    return state.geometry.visibleRowRange;
  },

  /**
   * Check if a specific column is in the visible viewport
   */
  isColumnInViewport(columnId: string): boolean {
    const state = visualState$.get();
    const column = state.columnLayouts.find(c => c.id === columnId);
    if (!column || !column.visible) return false;

    const scrollLeft = state.geometry.scrollLeft;
    const viewportWidth = state.geometry.viewportWidth;

    return column.xOffset < scrollLeft + viewportWidth &&
           column.xOffset + column.width > scrollLeft;
  },

  /**
   * Scroll to make a specific column visible
   */
  scrollToColumn(columnId: string) {
    const state = visualState$.get();
    const column = state.columnLayouts.find(c => c.id === columnId);
    if (!column || !column.visible) return;

    const scrollLeft = state.geometry.scrollLeft;
    const viewportWidth = state.geometry.viewportWidth;

    // Check if column is already visible
    if (column.xOffset >= scrollLeft &&
        column.xOffset + column.width <= scrollLeft + viewportWidth) {
      return; // Already visible
    }

    // Scroll to make column visible
    let newScrollLeft = scrollLeft;
    if (column.xOffset < scrollLeft) {
      // Column is to the left of viewport
      newScrollLeft = column.xOffset;
    } else if (column.xOffset + column.width > scrollLeft + viewportWidth) {
      // Column is to the right of viewport
      newScrollLeft = column.xOffset + column.width - viewportWidth;
    }

    visualInputs$.scrollLeft.set(newScrollLeft);
    fileLog.debug('📜 Scrolled to column', { columnId, newScrollLeft });
  },

  /**
   * Scroll to make a specific row visible
   */
  scrollToRow(rowIndex: number) {
    const rowHeight = visualInputs$.rowHeight.get();
    const scrollTop = visualInputs$.scrollTop.get();
    const viewportHeight = visualInputs$.viewportHeight.get();

    const rowTop = rowIndex * rowHeight;
    const rowBottom = rowTop + rowHeight;

    // Check if row is already visible
    if (rowTop >= scrollTop && rowBottom <= scrollTop + viewportHeight) {
      return; // Already visible
    }

    // Scroll to make row visible
    let newScrollTop = scrollTop;
    if (rowTop < scrollTop) {
      // Row is above viewport
      newScrollTop = rowTop;
    } else if (rowBottom > scrollTop + viewportHeight) {
      // Row is below viewport
      newScrollTop = rowBottom - viewportHeight;
    }

    visualInputs$.scrollTop.set(newScrollTop);
    fileLog.debug('📜 Scrolled to row', { rowIndex, newScrollTop });
  },

  // ====================================
  // GROUPING OPERATIONS
  // ====================================

  /**
   * Set grouping configuration
   */
  setGroupConfig(config: GroupConfig | null) {
    fileLog.info('🎯 Setting group config in visual state', {
      config,
      hasFields: !!config?.fields,
      fieldsLength: config?.fields?.length,
      fields: config?.fields
    });
    visualInputs$.groupConfig.set(config);
    fileLog.info('🎯 Group config updated', { config });
  },

  /**
   * Get current grouping configuration
   */
  getGroupConfig(): GroupConfig | null {
    return visualInputs$.groupConfig.get();
  },

  /**
   * Toggle group expansion/collapse
   */
  toggleGroupExpansion(groupId: string) {
    const groupConfig = visualInputs$.groupConfig.get();
    fileLog.info('🔍 toggleGroupExpansion called', {
      groupId,
      hasGroupConfig: !!groupConfig,
      currentExpandedGroups: groupConfig?.expandedGroups ? Array.from(groupConfig.expandedGroups) : 'none'
    });

    if (!groupConfig) {
      fileLog.warn('⚠️ No groupConfig found, cannot toggle expansion');
      return;
    }

    const expandedGroups = new Set(groupConfig.expandedGroups);
    const wasExpanded = expandedGroups.has(groupId);

    if (wasExpanded) {
      expandedGroups.delete(groupId);
      fileLog.info('🎯 Group collapsed', { groupId, newExpandedGroups: Array.from(expandedGroups) });
    } else {
      expandedGroups.add(groupId);
      fileLog.info('🎯 Group expanded', { groupId, newExpandedGroups: Array.from(expandedGroups) });
    }

    const newGroupConfig = {
      ...groupConfig,
      expandedGroups
    } as GroupConfig;

    visualInputs$.groupConfig.set(newGroupConfig);

    // Verify the state was updated
    const updatedConfig = visualInputs$.groupConfig.get();
    fileLog.info('✅ Group config updated', {
      groupId,
      wasExpanded,
      nowExpanded: updatedConfig?.expandedGroups?.has(groupId),
      finalExpandedGroups: updatedConfig?.expandedGroups ? Array.from(updatedConfig.expandedGroups) : 'none'
    });
  },

  /**
   * Expand all groups
   */
  expandAllGroups() {
    const groupConfig = visualInputs$.groupConfig.get();
    if (!groupConfig) return;

    // Get all group IDs from the visual rows
    const visualRows = visualState$.get().visualRows;
    const allGroupIds = new Set<string>();

    visualRows.forEach(row => {
      if (row.type === 'group') {
        allGroupIds.add(row.id);
      }
    });

    // Explicitly create a new GroupConfig to ensure all properties are preserved
    const newConfig: GroupConfig = {
      fields: groupConfig.fields,
      sortBy: groupConfig.sortBy,
      sortDirection: groupConfig.sortDirection,
      aggregations: groupConfig.aggregations,
      expandedGroups: allGroupIds,
      colorScheme: groupConfig.colorScheme
    };
    visualInputs$.groupConfig.set(newConfig);

    fileLog.info('🎯 All groups expanded', { count: allGroupIds.size });
  },

  /**
   * Collapse all groups
   */
  collapseAllGroups() {
    const groupConfig = visualInputs$.groupConfig.get();
    if (!groupConfig) return;

    // Explicitly create a new GroupConfig to ensure all properties are preserved
    const newConfig: GroupConfig = {
      fields: groupConfig.fields,
      sortBy: groupConfig.sortBy,
      sortDirection: groupConfig.sortDirection,
      aggregations: groupConfig.aggregations,
      expandedGroups: new Set(),
      colorScheme: groupConfig.colorScheme
    };
    visualInputs$.groupConfig.set(newConfig);

    fileLog.info('🎯 All groups collapsed');
  },

  // ====================================
  // COLUMN OPERATIONS (merged from columns-observable)
  // ====================================


  /**
   * Initialize columns with data and user/org context
   */
  initializeColumns(
    columns: Column[],
    entityType: string,
    orgId: string,
    userId: string
  ) {
    const defaultState = this.createDefaultColumnState(columns, entityType, orgId, userId);

    // Initialize with default state
    visualInputs$.set({
      ...visualInputs$.get(),
      ...defaultState
    });

    fileLog.info('🎯 Columns initialized', {
      entityType,
      orgId,
      userId,
      columnsCount: columns.length
    });

    // Return defaultState so caller can access _savedPrefs for applyLoadedPreferencesToVisualInputs
    return defaultState;
  },

  /**
   * Load ALL saved preferences from localStorage during initialization
   *
   * CRITICAL FOR PERSISTENCE: This method is called during createDefaultColumnState()
   * to ensure ALL saved preferences are loaded BEFORE default values are applied.
   * This is the single source for loading all persisted visual state.
   *
   * 🎯 SUCCESS PATTERN: Load all saved preferences during initialization, not after.
   */
  loadAllSavedPreferences(columns: Column[], entityType: string, orgId: string): {
    columnVisibility: Record<string, boolean> | null;
    columnWidths: Record<string, number> | null;
    columnOrder: string[] | null;
    sortBy: SortConfig[] | null;
    filters: FilterConfig[] | null;
    groupConfig: GroupConfig | null;
  } {
    try {
      // CRITICAL FIX: Extract base entity name if entityType already has org prefix
      // This prevents double orgId in storage keys like "vibegrid-simple-org1_org1_entity"
      let baseEntityType = entityType;

      // Check if entityType already contains an org prefix (from EntityNameUtils.ensureOrgPrefix)
      if (entityType.includes('_') && entityType.length > 36) {
        const parts = entityType.split('_');
        const firstPart = parts[0];

        // If first part looks like a UUID (36 chars with dashes), extract just the entity name
        if (firstPart.length === 36 && firstPart.includes('-')) {
          baseEntityType = parts.slice(1).join('_');
          fileLog.info('🔧 Extracted base entity type from prefixed entityType during loading', {
            originalEntityType: entityType,
            extractedOrgId: firstPart,
            baseEntityType,
            providedOrgId: orgId
          });
        }
      }

      // Normalize entityType to match localStorage keys
      const normalizedEntityType = baseEntityType
        .replace(/([A-Z])/g, '-$1')
        .toLowerCase()
        .replace(/^-/, '');

      const storageKey = orgId ? `vibegrid-simple-${orgId}_${normalizedEntityType}` : `vibegrid-simple-${normalizedEntityType}`;
      const stored = localStorage.getItem(storageKey);

      if (stored) {
        const parsed = JSON.parse(stored);
        fileLog.info('[PERSIST] ✅ LOADING ALL saved preferences from localStorage', {
          storageKey,
          hasColumnVisibility: !!parsed.columnVisibility,
          hasColumnWidths: !!parsed.columnWidths,
          hasColumnOrder: !!parsed.columnOrder,
          hasSortBy: !!parsed.sortBy,
          hasFilters: !!parsed.filters,
          hasGroupConfig: !!parsed.groupConfig
        });

        // Parse and validate column order with detailed logging
        const parsedColumnOrder = Array.isArray(parsed.columnOrder) ? parsed.columnOrder : null;

        fileLog.info('[PERSIST] 📋 DETAILED PARSING column order from localStorage', {
          rawParsedColumnOrder: parsed.columnOrder,
          parsedColumnOrderType: typeof parsed.columnOrder,
          parsedColumnOrderIsArray: Array.isArray(parsed.columnOrder),
          parsedColumnOrderLength: parsed.columnOrder?.length || 0,
          finalParsedColumnOrder: parsedColumnOrder,
          finalParsedLength: parsedColumnOrder?.length || 0,
          firstFewColumns: parsedColumnOrder?.slice(0, 5) || 'none',
          fullParsedData: parsed
        });

        return {
          columnVisibility: parsed.columnVisibility && typeof parsed.columnVisibility === 'object' ? parsed.columnVisibility : null,
          columnWidths: parsed.columnWidths && typeof parsed.columnWidths === 'object' ? parsed.columnWidths : null,
          columnOrder: parsedColumnOrder,
          sortBy: Array.isArray(parsed.sortBy) ? parsed.sortBy : null,
          filters: Array.isArray(parsed.filters) ? parsed.filters : null,
          groupConfig: parsed.groupConfig && parsed.groupConfig.fields && Array.isArray(parsed.groupConfig.fields) ? {
            ...parsed.groupConfig,
            expandedGroups: new Set(parsed.groupConfig.expandedGroups || []) // Convert array back to Set
          } : null
        };
      }
    } catch (error) {
      fileLog.warn('⚠️ Failed to load preferences during init', { error });
    }

    return {
      columnVisibility: null,
      columnWidths: null,
      columnOrder: null,
      sortBy: null,
      filters: null,
      groupConfig: null
    };
  },

  /**
   * Create default column state
   */
  createDefaultColumnState(
    columns: Column[],
    entityType: string,
    orgId: string,
    userId: string
  ) {
    // Load ALL saved preferences during initialization
    const savedPrefs = this.loadAllSavedPreferences(columns, entityType, orgId);

    // Calculate final values with detailed logging
    // CRITICAL FIX: If savedPrefs.columnOrder exists but is empty, use default columns order
    const finalColumnOrder = (savedPrefs.columnOrder && savedPrefs.columnOrder.length > 0)
      ? savedPrefs.columnOrder
      : columns.map(col => col.id);
    const defaultColumnOrder = columns.map(col => col.id);

    fileLog.info('[PERSIST] 📋 DETAILED COLUMN ORDER LOADING', {
      entityType,
      savedColumnOrderExists: !!savedPrefs.columnOrder,
      savedColumnOrder: savedPrefs.columnOrder,
      savedColumnOrderLength: savedPrefs.columnOrder?.length || 0,
      defaultColumnOrder,
      defaultColumnOrderLength: defaultColumnOrder.length,
      finalColumnOrder,
      finalColumnOrderLength: finalColumnOrder.length,
      isUsingSavedOrder: !!savedPrefs.columnOrder,
      savedPrefsKeys: Object.keys(savedPrefs),
      columnsPassedIn: columns.map(c => c.id)
    });

    return {
      columns,
      columnWidths: savedPrefs.columnWidths || Object.fromEntries(columns.map(col => [col.id, col.width || 150])),
      columnVisibility: savedPrefs.columnVisibility || Object.fromEntries(columns.map(col => [col.id, true])),
      columnOrder: finalColumnOrder,
      groupConfig: savedPrefs.groupConfig || null,
      sortBy: savedPrefs.sortBy || [],
      filters: savedPrefs.filters || [],
      entityType,
      orgId,
      userId,
      // Include saved preferences for later application to visual inputs
      _savedPrefs: savedPrefs
    };
  },

  /**
   * Apply loaded preferences to visual inputs
   * This method should be called after createDefaultColumnState to apply saved data to reactive observables
   */
  applyLoadedPreferencesToVisualInputs(visualInputs$: any, defaultState: any) {
    const savedPrefs = defaultState._savedPrefs;
    if (!savedPrefs) return;

    // Apply saved sortBy to visual inputs
    if (savedPrefs.sortBy && savedPrefs.sortBy.length > 0) {
      visualInputs$.sortBy?.set(savedPrefs.sortBy);
      fileLog.info('✅ INIT: Applied saved sortBy to visual inputs', {
        sortBy: savedPrefs.sortBy
      });
    }

    // Apply saved filters to visual inputs
    if (savedPrefs.filters && savedPrefs.filters.length > 0) {
      visualInputs$.filters?.set(savedPrefs.filters);
      fileLog.info('✅ INIT: Applied saved filters to visual inputs', {
        filters: savedPrefs.filters
      });
    }

    // Apply saved groupConfig to visual inputs
    if (savedPrefs.groupConfig) {
      visualInputs$.groupConfig?.set(savedPrefs.groupConfig);
      fileLog.info('✅ INIT: Applied saved groupConfig to visual inputs', {
        groupConfig: savedPrefs.groupConfig
      });
    }
  },

  /**
   * Get effective width for a column - SINGLE SOURCE OF TRUTH
   */
  getColumnWidth(columnId: string): number {
    const { columnWidths, columns } = visualInputs$.get();

    // 1. Try persisted user preference
    if (columnWidths[columnId] != null) {
      return columnWidths[columnId];
    }

    // 2. Fall back to column schema default
    const column = columns.find(c => c.id === columnId);
    if (column?.width != null) {
      return column.width;
    }

    // 3. Final fallback
    return 150;
  },

  /**
   * Update column width during resize (with batching)
   */
  updateColumnWidth(columnId: string, width: number) {
    batch(() => {
      const currentWidths = visualInputs$.columnWidths.get();
      visualInputs$.columnWidths.set({
        ...currentWidths,
        [columnId]: width
      });
    });

    fileLog.debug('📏 Column width updated', { columnId, width });
  },

  /**
   * Toggle column visibility
   */
  toggleColumnVisibility(columnId: string) {
    const currentVisibility = visualInputs$.columnVisibility.get();
    const newVisibility = !currentVisibility[columnId];

    visualInputs$.columnVisibility.set({
      ...currentVisibility,
      [columnId]: newVisibility
    });

    fileLog.info('👁️ Column visibility toggled', { columnId, visible: newVisibility });
  },

  /**
   * Reorder columns
   */
  reorderColumns(sourceColumnId: string, targetColumnId: string, insertBefore: boolean = true) {
    const currentOrder = [...visualInputs$.columnOrder.get()];
    const sourceIndex = currentOrder.indexOf(sourceColumnId);
    const targetIndex = currentOrder.indexOf(targetColumnId);

    if (sourceIndex === -1 || targetIndex === -1) {
      fileLog.warn('⚠️ Column reorder failed: column not found', {
        sourceColumnId,
        targetColumnId,
        sourceIndex,
        targetIndex
      });
      return;
    }

    // Remove source column
    const [sourceColumn] = currentOrder.splice(sourceIndex, 1);

    // Recalculate target index after removal
    const adjustedTargetIndex = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;

    // Insert at appropriate position
    const insertIndex = insertBefore ? adjustedTargetIndex : adjustedTargetIndex + 1;
    currentOrder.splice(insertIndex, 0, sourceColumn);

    // Direct set without batch() to match toggleSort pattern
    visualInputs$.columnOrder.set(currentOrder);

    fileLog.info('🔄 Column reordered', {
      sourceColumnId,
      targetColumnId,
      insertBefore,
      newOrder: currentOrder,
      beforeOrder: [...visualInputs$.columnOrder.get()],
      visualInputsState: visualInputs$.get()
    });
  },

  /**
   * Reset all column preferences to defaults
   */
  resetColumns() {
    const { columns, entityType, orgId, userId } = visualInputs$.get();
    const defaultState = this.createDefaultColumnState(columns, entityType, orgId, userId);

    batch(() => {
      visualInputs$.columnWidths.set(defaultState.columnWidths);
      visualInputs$.columnVisibility.set(defaultState.columnVisibility);
      visualInputs$.columnOrder.set(defaultState.columnOrder);
    });

    fileLog.info('🔄 Columns reset to defaults', {
      columnsCount: columns.length
    });
  },

  /**
   * Show all columns - set all to visible
   */
  showAllColumns() {
    const columns = visualInputs$.columns.get();
    const allVisible = Object.fromEntries(
      columns.map(col => [col.id, true])
    );

    visualInputs$.columnVisibility.set(allVisible);
    fileLog.info('👁️ All columns shown', { columnCount: columns.length });
  },

  /**
   * Hide all columns except system columns
   */
  hideAllColumns() {
    const columns = visualInputs$.columns.get();
    const allHidden = Object.fromEntries(
      columns.map(col => [col.id, col.id === 'id' || col.id === '__selection']) // Keep ID and selection columns visible
    );

    visualInputs$.columnVisibility.set(allHidden);
    fileLog.info('🫥 All columns hidden (except system)', { columnCount: columns.length });
  },

  /**
   * Set filter for a field
   */
  setFilter(field: string, value: any, operator: string = 'equals') {
    const currentFilters = visualInputs$.filters?.get() || [];
    const existingIndex = currentFilters.findIndex(f => f.field === field);

    const newFilter: FilterConfig = { field, value, operator };

    if (existingIndex >= 0) {
      // Update existing filter
      const updatedFilters = [...currentFilters];
      updatedFilters[existingIndex] = newFilter;
      visualInputs$.filters?.set(updatedFilters);
    } else {
      // Add new filter
      visualInputs$.filters?.set([...currentFilters, newFilter]);
    }

    fileLog.debug('🔍 Filter updated', { field, value, operator });
  },

  /**
   * Remove filter for a field
   */
  removeFilter(field: string) {
    const currentFilters = visualInputs$.filters?.get() || [];
    const updatedFilters = currentFilters.filter(f => f.field !== field);
    visualInputs$.filters?.set(updatedFilters);
    fileLog.debug('🗑️ Filter removed', { field });
  },

  /**
   * Clear all filters
   */
  clearFilters() {
    visualInputs$.filters?.set([]);
    fileLog.debug('🧹 All filters cleared');
  },

  /**
   * Toggle sort for a field
   */
  toggleSort(field: string, isMultiSort: boolean = false) {
    try {
      fileLog.info('🔄 toggleSort ENTRY', { field, isMultiSort, timestamp: Date.now() });

      fileLog.debug("🔍 DEBUGGING visualInputs$ in toggleSort", { 
        visualInputsType: typeof visualInputs$, 
        visualInputsExists: !!visualInputs$, 
        visualInputsValue: visualInputs$, 
        hasClosureAccess: "visualInputs$" in this || typeof visualInputs$ !== "undefined" 
      });
      const currentSortBy = visualInputs$.sortBy?.get() || [];
      const existingIndex = currentSortBy.findIndex(s => s.field === field);

      fileLog.info('🔄 toggleSort called', {
        field,
        isMultiSort,
        currentSortBy,
        existingIndex,
        hasVisualInputs: !!visualInputs$,
        hasSortBy: !!visualInputs$.sortBy
      });

      if (existingIndex >= 0) {
        const currentSort = currentSortBy[existingIndex];
        if (currentSort.direction === 'asc') {
          // Switch to desc
          const updatedSort = [...currentSortBy];
          updatedSort[existingIndex] = { field, direction: 'desc' };
          visualInputs$.sortBy?.set(updatedSort);
        } else {
          // Remove sort
          const updatedSort = currentSortBy.filter(s => s.field !== field);
          visualInputs$.sortBy?.set(updatedSort);
        }
      } else {
        // Add new sort (asc)
        const newSort: SortConfig = { field, direction: 'asc' };

        if (isMultiSort) {
          // Multi-sort: add to existing sorts
          visualInputs$.sortBy?.set([...currentSortBy, newSort]);
        } else {
          // Single sort: replace existing sorts
          visualInputs$.sortBy?.set([newSort]);
        }
      }

      // DEBUG: Enhanced logging after sort toggle
      const currentSortAfterToggle = visualInputs$.sortBy?.get();
      fileLog.info('🔄 Sort toggled - ENHANCED DEBUG', {
        field,
        isMultiSort,
        sortBy: currentSortAfterToggle,
        sortByLength: Array.isArray(currentSortAfterToggle) ? currentSortAfterToggle.length : 'not-array',
        entireVisualInputs: visualInputs$.get()
      });
    } catch (error) {
      fileLog.error('🔄 toggleSort ERROR', { field, error });
      throw error;
    }
  },

  /**
   * Set sort configuration
   */
  setSortBy(sortBy: SortConfig[]) {
    visualInputs$.sortBy?.set(sortBy);
    fileLog.debug('📊 Sort configuration set', { sortBy });
  },

  /**
   * Clear all sorting
   */
  clearSort() {
    visualInputs$.sortBy?.set([]);
    fileLog.debug('🧹 All sorting cleared');
  }
  };
}

// ====================================
// COMPUTED VALUES FROM COLUMNS (merged from columns-observable)
// ====================================

/**
 * Create visible columns computed observable for a specific VibeGrid instance
 */
export function createVisibleColumns$(visualInputs$: any) {
  return computed(() => {
    const { columns, columnVisibility, columnOrder } = visualInputs$.get();

    // Safety check: If columnOrder is empty but columns exist, use columns order
    const orderToUse = columnOrder.length > 0 ? columnOrder : columns.map(col => col.id);

    return orderToUse
      .map(id => columns.find(col => col.id === id))
      .filter((col): col is Column => col !== undefined && columnVisibility[col.id] !== false);
  });
}

/**
 * Create total columns width computed observable for a specific VibeGrid instance
 */
export function createTotalColumnsWidth$(visualInputs$: any, visibleColumns$: any) {
  return computed(() => {
    const visibleCols = visibleColumns$.get();
    const columnWidths = visualInputs$.columnWidths.get();

    return visibleCols.reduce((total, col) => {
      const width = columnWidths[col.id] || col.width || 150;
      return total + width;
    }, 0);
  });
}



// ====================================
// COMPLETE GRID STATE OBSERVABLE
// ====================================

/**
 * Complete grid state interface - combines all state sources
 * This is the TRUE SINGLE SOURCE OF TRUTH for the entire grid
 */
export interface CompleteGridState {
  // Visual layout state (from visualState$)
  visual: VisualState;

  // Interaction state
  interaction: {
    selectedCells: Set<string>;
    selectAllCheckboxState: { checked: boolean; indeterminate: boolean };
    editingCell: string | null;
    editValue: string;
    isDragging: boolean;
    dragSource: string | null;
    dragTarget: string | null;
  };

  // Data state
  data: {
    processedRows: any[];
    sortBy: any[];
  };

  // Column resize state
  columnResize: {
    isResizing: boolean;
    columnId: string | null;
    newWidth: number | null;
  } | null;

  // Derived state for rendering decisions
  renderState: {
    shouldRenderHeader: boolean;
    shouldRenderBody: boolean;
    shouldUpdateSelection: boolean;
    shouldUpdateOverlays: boolean;
    hasDataChanges: boolean;
    hasLayoutChanges: boolean;
    hasInteractionChanges: boolean;
  };
}

/**
 * Create complete grid state observable - Legend State best practice
 * Combines all state sources into a single computed observable
 */
export function createCompleteGridState$(
  tableCore$: any,
  tableInteraction$: any,
  tableViewport$: any
) {
  fileLog.info('🎯 Creating complete grid state observable');

  // Previous state tracking for change detection
  let previousState: CompleteGridState | null = null;

  return computed((): CompleteGridState => {
    try {
      // Get all state in one computed - this creates the dependency tracking
      const visual = visualState$.get();
      const selectedCells = tableInteraction$.selectedCells.get();
      const selectAllCheckboxState = tableInteraction$.selectAllCheckboxState.get();
      const focusedCell = tableInteraction$.focusedCell.get();
      const editingCell = tableInteraction$.editingCell.get();
      const editValue = tableInteraction$.editValue.get();
      const isDragging = tableInteraction$.isDragging.get();
      const dragSource = tableInteraction$.dragSource.get();
      const dragTarget = tableInteraction$.dragTarget.get();
      const rawProcessedRows = tableCore$.processedRows.get(true); // shallow for performance
      const sortBy = visualState$.sortBy.get(true); // shallow for performance

      // Apply sorting to raw data - this is where visual state takes raw data and makes it presentation-ready
      const processedRows = applySorting(rawProcessedRows, sortBy);
      const columnResize = tableInteraction$.columnResize.get();

    // Smart change detection - compare with previous state
    let hasLayoutChanges = true;
    let hasDataChanges = true;
    let hasInteractionChanges = true;

    if (previousState) {
      // Check layout changes (visual state)
      hasLayoutChanges =
        visual.columnLayouts.length !== previousState.visual.columnLayouts.length ||
        visual.geometry.totalWidth !== previousState.visual.geometry.totalWidth ||
        visual.geometry.scrollLeft !== previousState.visual.geometry.scrollLeft ||
        visual.geometry.scrollTop !== previousState.visual.geometry.scrollTop ||
        visual.geometry.viewportWidth !== previousState.visual.geometry.viewportWidth ||
        visual.geometry.viewportHeight !== previousState.visual.geometry.viewportHeight;

      // Check data changes (rows, sorting)
      hasDataChanges =
        processedRows.length !== previousState.data.processedRows.length ||
        sortBy.length !== previousState.data.sortBy.length ||
        JSON.stringify(sortBy.map(s => s.id)) !== JSON.stringify(previousState.data.sortBy.map(s => s.id));

      // Check interaction changes (selection, editing, drag, focus)
      hasInteractionChanges =
        selectedCells.size !== previousState.interaction.selectedCells.size ||
        focusedCell !== previousState.interaction.focusedCell ||
        editingCell !== previousState.interaction.editingCell ||
        isDragging !== previousState.interaction.isDragging ||
        dragSource !== previousState.interaction.dragSource;
    }

    // Calculate smart render state based on actual changes
    const renderState = {
      shouldRenderHeader: hasLayoutChanges, // Only render header when layout changes
      shouldRenderBody: hasLayoutChanges || hasDataChanges, // Render body for layout or data changes
      shouldUpdateSelection: hasInteractionChanges && selectedCells.size > 0,
      shouldUpdateOverlays: hasInteractionChanges || isDragging || editingCell !== null || columnResize !== null,
      hasDataChanges,
      hasLayoutChanges,
      hasInteractionChanges
    };

    const completeState: CompleteGridState = {
      visual,
      interaction: {
        selectedCells,
        selectAllCheckboxState,
        focusedCell,
        editingCell,
        editValue,
        isDragging,
        dragSource,
        dragTarget
      },
      data: {
        processedRows,
        sortBy
      },
      columnResize,
      renderState
    };

    fileLog.debug('🎯 Complete grid state computed', {
      visualColumns: visual.columnLayouts.length,
      dataRows: processedRows.length,
      selectedCells: selectedCells.size,
      isEditing: !!editingCell,
      isDragging,
      hasColumnResize: !!columnResize,
      changeDetection: {
        hasLayoutChanges,
        hasDataChanges,
        hasInteractionChanges,
        shouldRenderHeader: renderState.shouldRenderHeader,
        shouldRenderBody: renderState.shouldRenderBody,
        shouldUpdateOverlays: renderState.shouldUpdateOverlays
      }
    });

    // Update previous state for next change detection cycle
    previousState = completeState;

    return completeState;
    } catch (error) {
      fileLog.error('🚨 Error in createCompleteGridState$ computed', error);
      console.error('🚨 CRITICAL: VibeGrid createCompleteGridState$ error:', error);

      // Return minimal fallback state to prevent complete failure
      return {
        visual: {
          columnLayouts: [],
          visibleColumns: [],
          totalColumnsWidth: 0,
          geometry: {
            viewportWidth: 0,
            viewportHeight: 0,
            scrollLeft: 0,
            scrollTop: 0,
            totalWidth: 0,
            totalHeight: 0,
            visibleColumnRange: { start: 0, end: 0 },
            visibleRowRange: { start: 0, end: 0 }
          },
          headerScrollLeft: 0,
          bodyScrollLeft: 0,
          scrollSynchronized: false,
          visualRows: [],
          totalRowsHeight: 0,
          columnState: {
            columns: [],
            columnWidths: {},
            columnVisibility: {},
            columnOrder: [],
            entityType: '',
            orgId: '',
            userId: ''
          }
        },
        data: {
          processedRows: [],
          sortBy: []
        },
        interaction: {
          selectedCells: new Set(),
          selectAllCheckboxState: { checked: false, indeterminate: false },
          focusedCell: null,
          editingCell: null,
          editValue: '',
          isDragging: false,
          dragSource: null,
          dragTarget: null
        },
        columnResize: null,
        renderState: {
          hasLayoutChanges: false,
          hasDataChanges: false,
          hasInteractionChanges: false,
          shouldRenderHeader: false,
          shouldRenderBody: false,
          shouldUpdateOverlays: false
        }
      };
    }
  });
}


