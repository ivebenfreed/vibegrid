/**
 * Data State - tableCore$ and tableCoreSync$ observables
 * Extracted from pure-observables.ts lines 484-869
 *
 * This module handles data loading and transformation
 * including sorting, filtering, and grouping operations.
 * No persistence - uses simple data-only state management.
 */

// TODO: Remove Legend State - migrating to MobX
// import { observable, computed, batch } from '@legendapp/state';
// TODO: Remove Legend State - migrating to MobX
// import { getEntity$, entityOperations, universeSchema$, universeLoading$, universeOrgId$, universeUserId$, universeContext$ } from '@/legend-state/observables';
// TODO: Remove Legend State - migrating to MobX
// import { syncNotifications$, syncStatus$ } from '@/legend-state/sync-notifications';
import { createLogger } from '@/lib/logging';
import type { Column, SortConfig, FilterConfig, GroupConfig } from '../types';
// Import moved to visual-state.ts as part of Phase 1 consolidation
import { GroupProcessor } from '../processors/GroupProcessor';
import { generateColumnsFromEntitySchema } from './column-generation';

// Basic columns function for fallback
function getBasicColumns<T>(): Column<T>[] {
  return [
    {
      id: 'id',
      field: 'id' as keyof T & string,
      name: 'ID',
      cellType: 'text',
      width: 120,
      editable: false
    },
    {
      id: 'created_at',
      field: 'created_at' as keyof T & string,
      name: 'Created At',
      cellType: 'date',
      width: 140,
      editable: false
    },
    {
      id: 'updated_at',
      field: 'updated_at' as keyof T & string,
      name: 'Updated At',
      cellType: 'date',
      width: 140,
      editable: false
    }
  ];
}

const fileLog = createLogger('components/custom/vibegrid/stores/data-state.ts');

// ====================================
// TYPES
// ====================================

/**
 * Row ordering configuration for grouped mode drag and drop
 */
export interface GroupRowOrderConfig {
  groupId: string;
  rowIds: string[];
  lastModified: string;
}

/**
 * Persistent table state interface - only configuration data that should be saved
 * Excludes transient UI state like selection, editing, hover, etc.
 */
export interface PersistedTableState {
  // Row ordering in grouped mode (persisted)
  groupRowOrders: Record<string, GroupRowOrderConfig>;

  // Row ordering in ungrouped/flat mode (persisted)
  flatRowOrder: string[];

  // Metadata
  version: string;
  lastUpdated: string;
  entityType: string;
  orgId: string;
  userId: string;
}

export interface TableCoreState {
  entityType: string;
  columns: Column[]; // Schema definition only
  groupRowOrders: Record<string, GroupRowOrderConfig>;
  flatRowOrder: string[]; // Row IDs in custom order for ungrouped mode
}

// Re-export the observable types
export type TableCore$ = ReturnType<typeof createTableCore$>['tableCore$'];
export type TableCoreSync$ = ReturnType<typeof createTableCore$>['tableCoreSync$'];

// ====================================
// PURE TRANSFORMATION FUNCTIONS
// ====================================

function applyFilters(rows: any[], filters: FilterConfig[]): any[] {
  if (!filters || filters.length === 0) return rows;

  return rows.filter(row => {
    return filters.every(filter => {
      const value = row.data ? row.data[filter.field] : row[filter.field];

      switch (filter.operator) {
        case 'equals':
          return value === filter.value;
        case 'contains':
          return String(value).toLowerCase().includes(String(filter.value).toLowerCase());
        case 'starts_with':
          return String(value).toLowerCase().startsWith(String(filter.value).toLowerCase());
        case 'ends_with':
          return String(value).toLowerCase().endsWith(String(filter.value).toLowerCase());
        case 'gt':
          return Number(value) > Number(filter.value);
        case 'gte':
          return Number(value) >= Number(filter.value);
        case 'lt':
          return Number(value) < Number(filter.value);
        case 'lte':
          return Number(value) <= Number(filter.value);
        default:
          return true;
      }
    });
  });
}

function applySorting(rows: any[], sortBy: SortConfig[]): any[] {
  if (!sortBy || sortBy.length === 0) return rows;

  return [...rows].sort((a, b) => {
    for (const sort of sortBy) {
      const aVal = a.data ? a.data[sort.field] : a[sort.field];
      const bVal = b.data ? b.data[sort.field] : b[sort.field];

      if (aVal === bVal) continue;

      const comparison = aVal < bVal ? -1 : 1;
      return sort.direction === 'asc' ? comparison : -comparison;
    }
    return 0;
  });
}

/**
 * Apply custom flat row ordering for ungrouped state
 */
function applyFlatRowOrdering(rows: any[], flatRowOrder: string[]): any[] {
  if (!flatRowOrder || flatRowOrder.length === 0) return rows;

  // Create a map for quick lookup of row order
  const orderMap = new Map<string, number>();
  flatRowOrder.forEach((id, index) => {
    orderMap.set(id, index);
  });

  // Sort rows based on the custom order, with unordered rows at the end
  return [...rows].sort((a, b) => {
    const aId = a.id || a.data?.id;
    const bId = b.id || b.data?.id;

    const aOrder = orderMap.get(aId);
    const bOrder = orderMap.get(bId);

    // If both have order, use that
    if (aOrder !== undefined && bOrder !== undefined) {
      return aOrder - bOrder;
    }

    // If only one has order, ordered item comes first
    if (aOrder !== undefined) return -1;
    if (bOrder !== undefined) return 1;

    // Neither has order, maintain original order
    return 0;
  });
}

// ====================================
// DATA STATE CORE OBSERVABLE FACTORY
// ====================================

export function createTableCore$(entityType: string, visualInputs$?: any, initManager?: any) {
  fileLog.info('🎯 Creating tableCore$ observable (schema loading managed by init manager)', { entityType });

  // Columns will be loaded by init manager - no fallback allowed
  let columns: Column[] = [];

  // Create the core observable with default values
  const tableCore$ = observable({
    // Sync status monitoring for this entity
    get syncStatus() {
      const status = syncStatus$.get()
      const hasNotifications = syncNotifications$.hasNotificationsFor(entityType).get()

      return {
        isConnected: status.hasNotifications,
        hasEntityNotifications: hasNotifications,
        lastNotification: syncNotifications$.getNotificationFor(entityType).get(),
        totalNotifications: status.totalCount
      }
    },
    // Entity metadata
    entityType,
    columns,

    // Row ordering state (no persistence)
    groupRowOrders: {} as Record<string, GroupRowOrderConfig>,
    flatRowOrder: [] as string[],

    // Computed groupConfig - reads from external visual state
    get groupConfig() {
      return visualInputs$?.groupConfig?.get() || null;
    },

    // Computed processed data (lazy)
    get processedRows() {
      // Check if universe schema is ready before getting entity
      const loading = universeLoading$.get();
      const schema = universeSchema$.get();

      if (loading || !schema?.entities || !schema.entities[entityType]) {
        fileLog.debug('� Schema not ready for processedRows', { entityType, loading });
        return [];
      }

      // Get entity observable directly like atomic bridge does
      const entityObs = getEntity$(entityType);

      // Get sorting and filtering from visual state integration
      const sortBy: SortConfig[] = visualInputs$?.sortBy?.get() || [];
      const filters: FilterConfig[] = visualInputs$?.filters?.get() || [];

      // Get the data from the entity observable
      let data = {};
      if (entityObs) {
        try {
          // Shallow .get(true) to only track structural changes, not individual field changes
          data = entityObs.get(true) || {};
          fileLog.debug(' Got entity data', {
            entityType,
            recordCount: Object.keys(data || {}).length
          });
        } catch (error) {
          fileLog.error('L Failed to get entity data', { entityType, error: error.message });
          data = {};
        }
      } else {
        fileLog.warn('� Entity observable not available', { entityType });
      }

      let rows = Object.values(data || {});

      // Apply filters and sorting first
      rows = applyFilters(rows, filters);
      rows = applySorting(rows, sortBy);

      // Get grouping configuration from visual state only (pure architecture)
      const groupConfig = visualInputs$?.groupConfig?.get();

      fileLog.info('📊 Group config from visual state', {
        hasVisualInputs: !!visualInputs$,
        hasGroupConfig: !!groupConfig,
        expandedGroups: groupConfig?.expandedGroups ? Array.from(groupConfig.expandedGroups) : 'none'
      });

      // Apply grouping if configured
      if (groupConfig && groupConfig.fields && groupConfig.fields.length > 0) {
        const groupRowOrders = tableCore$.groupRowOrders.get();
        fileLog.info('🔄 processedRows: Reading groupRowOrders for grouping', {
          groupRowOrdersKeys: Object.keys(groupRowOrders),
          groupRowOrdersCount: Object.keys(groupRowOrders).length,
          entityType,
          groupFields: groupConfig.fields.map(f => f.field)
        });
        const groupResult = GroupProcessor.processData(rows, columns, groupConfig, groupRowOrders);

        fileLog.info('✅ Processed rows with grouping', {
          entityObservable: !!entityObs,
          inputCount: Object.keys(data || {}).length,
          filteredAndSortedRows: rows.length,
          virtualRowsAfterGrouping: groupResult.virtualRows.length,
          groupCount: groupResult.groupCount,
          hasFilters: filters.length > 0,
          hasSorting: sortBy.length > 0,
          hasGrouping: true
        });

        // Note: Row count will be handled by visual state integration

        // Return virtual rows (mix of group headers and data rows)
        return groupResult.virtualRows;
      }

      fileLog.info('<� Processed rows computed (no grouping)', {
        entityObservable: !!entityObs,
        inputCount: Object.keys(data || {}).length,
        outputCount: rows.length,
        hasFilters: filters.length > 0,
        hasSorting: sortBy.length > 0,
        hasGrouping: false
      });

      // Apply flat row ordering if no grouping and no sorting
      const hasSorting = sortBy.length > 0;
      if (!hasSorting) {
        const flatRowOrder = tableCore$.flatRowOrder.get();
        if (flatRowOrder && flatRowOrder.length > 0) {
          rows = applyFlatRowOrdering(rows, flatRowOrder);
          fileLog.debug('✅ Applied flat row ordering', {
            flatOrderCount: flatRowOrder.length,
            totalRows: rows.length
          });
        }
      }

      // Note: Row count will be handled by visual state integration

      return rows;
    },

    // NOTE: Column manipulation methods moved to visual-state
    // (toggleSort, setFilter, clearFilter, setColumnWidth)

    // NOTE: setGroupConfig removed - grouping now handled purely in visual state

    // Drag and drop row ordering methods for grouped mode
    setGroupRowOrder(groupId: string, rowIds: string[]) {
      const orders = tableCore$.groupRowOrders.get();
      tableCore$.groupRowOrders.set({
        ...orders,
        [groupId]: {
          groupId,
          rowIds,
          lastModified: new Date().toISOString()
        }
      });

      fileLog.info('🔄 Group row order set (no persistence)', {
        groupId,
        rowCount: rowIds.length
      });

      // FORCE: Trigger processedRows recomputation by accessing it
      const currentProcessedRows = tableCore$.processedRows.get();
      fileLog.info('🔄 Force-triggered processedRows recomputation after groupRowOrders change', {
        groupId,
        processedRowsCount: currentProcessedRows.length,
        timestamp: Date.now()
      });
    },

    moveRowInGroupByIndex(groupId: string, fromIndex: number, toIndex: number) {
      const orders = tableCore$.groupRowOrders.get();
      const groupOrder = orders[groupId];

      if (!groupOrder) {
        fileLog.warn('⚠️ No group order found for drag operation', { groupId });
        return false;
      }

      const newRowIds = [...groupOrder.rowIds];
      const [movedRowId] = newRowIds.splice(fromIndex, 1);
      newRowIds.splice(toIndex, 0, movedRowId);

      tableCore$.groupRowOrders.set({
        ...orders,
        [groupId]: {
          ...groupOrder,
          rowIds: newRowIds,
          lastModified: new Date().toISOString()
        }
      });

      fileLog.info('🔄 Row moved within group (no persistence)', {
        groupId,
        fromIndex,
        toIndex,
        movedRowId
      });

      return true;
    },

    getGroupRowOrder(groupId: string): string[] | null {
      const orders = tableCore$.groupRowOrders.get();
      return orders[groupId]?.rowIds || null;
    },

    clearGroupRowOrders() {
      tableCore$.groupRowOrders.set({});
      fileLog.info('🗑️ All group row orders cleared (no persistence)');
    },

    // Higher-level method for drag and drop that handles row movement by ID
    async moveRowInGroup(sourceGroupId: string, targetGroupId: string, draggedRowId: string, newIndex: number): Promise<boolean> {
      fileLog.info('🔧 moveRowInGroup called', {
        sourceGroupId,
        targetGroupId,
        draggedRowId,
        newIndex,
        isCrossGroup: sourceGroupId !== targetGroupId
      });

      // Handle cross-group moves
      if (sourceGroupId !== targetGroupId) {
        return await this.moveRowBetweenGroups(sourceGroupId, targetGroupId, draggedRowId, newIndex);
      }

      const orders = tableCore$.groupRowOrders.get();
      let groupOrder = orders[sourceGroupId];

      // If no order exists yet, create one from current group data
      if (!groupOrder) {
        const processedRows = tableCore$.processedRows.get();
        if (!processedRows || !Array.isArray(processedRows)) {
          fileLog.error('❌ Invalid processedRows when creating group order', {
            processedRows: typeof processedRows,
            sourceGroupId
          });
          return false;
        }

        const groupRows = processedRows.filter(row =>
          row && row.type === 'data' && (row.groupId === sourceGroupId || row.parentGroupId === sourceGroupId)
        );
        const initialOrder = groupRows.map(row => row?.id).filter(Boolean);

        fileLog.info('🔍 Creating group order', {
          sourceGroupId,
          processedRowsCount: processedRows.length,
          groupRowsCount: groupRows.length,
          initialOrderCount: initialOrder.length
        });

        groupOrder = {
          groupId: sourceGroupId,
          rowIds: initialOrder,
          lastModified: new Date().toISOString()
        };

        // Ensure orders is a valid object before spreading
        const safeOrders = orders || {};
        tableCore$.groupRowOrders.set({
          ...safeOrders,
          [sourceGroupId]: groupOrder
        });

        fileLog.info('🆕 Created initial group row order', {
          sourceGroupId,
          rowCount: initialOrder.length
        });
      }

      // Find current position of the dragged row
      if (!groupOrder.rowIds || !Array.isArray(groupOrder.rowIds)) {
        fileLog.error('❌ Invalid groupOrder.rowIds', {
          sourceGroupId,
          groupOrder,
          rowIdsType: typeof groupOrder.rowIds
        });
        return false;
      }

      const currentIndex = groupOrder.rowIds.indexOf(draggedRowId);
      if (currentIndex === -1) {
        fileLog.warn('⚠️ Dragged row not found in group order', {
          draggedRowId,
          sourceGroupId,
          currentOrder: groupOrder.rowIds
        });
        return false;
      }

      // If trying to move to the same position, no change needed
      if (currentIndex === newIndex) {
        return true;
      }

      // Validate newIndex - allow up to length (for appending at end)
      if (typeof newIndex !== 'number' || newIndex < 0 || newIndex > groupOrder.rowIds.length) {
        fileLog.error('❌ Invalid newIndex for row move', {
          newIndex,
          newIndexType: typeof newIndex,
          currentIndex,
          rowIdsLength: groupOrder.rowIds.length,
          sourceGroupId,
          validRange: `0 to ${groupOrder.rowIds.length}`
        });
        return false;
      }

      // Move the row
      let newRowIds;
      try {
        newRowIds = [...groupOrder.rowIds];
        fileLog.debug('🔄 Before splice operations', {
          originalLength: newRowIds.length,
          currentIndex,
          newIndex,
          draggedRowId
        });

        const [movedRowId] = newRowIds.splice(currentIndex, 1);
        newRowIds.splice(newIndex, 0, movedRowId);

        fileLog.debug('🔄 After splice operations', {
          newLength: newRowIds.length,
          movedRowId
        });
      } catch (error) {
        fileLog.error('❌ Error during array manipulation', {
          error: error.message,
          currentIndex,
          newIndex,
          rowIdsLength: groupOrder.rowIds.length
        });
        return false;
      }

      // Ensure orders is a valid object before spreading
      const safeOrders = orders || {};

      fileLog.info('🔄 About to update groupRowOrders with moved row', {
        sourceGroupId,
        draggedRowId,
        currentIndex,
        newIndex,
        oldRowIds: groupOrder.rowIds,
        newRowIds,
        entityType
      });

      tableCore$.groupRowOrders.set({
        ...safeOrders,
        [sourceGroupId]: {
          ...groupOrder,
          rowIds: newRowIds,
          lastModified: new Date().toISOString()
        }
      });

      fileLog.info('🔄 groupRowOrders.set COMPLETED - Row moved within group by ID', {
        sourceGroupId,
        draggedRowId,
        from: currentIndex,
        to: newIndex,
        newOrderLength: newRowIds.length,
        updatedOrdersKeys: Object.keys(tableCore$.groupRowOrders.get()),
        entityType
      });

      return true;
    },

    // Drag and drop row ordering methods for flat/ungrouped mode
    setFlatRowOrder(rowIds: string[]) {
      tableCore$.flatRowOrder.set([...rowIds]);
      fileLog.info('🔄 Flat row order set (no persistence)', {
        rowCount: rowIds.length
      });
    },

    // Move row between different groups - purely reactive approach
    async moveRowBetweenGroups(sourceGroupId: string, targetGroupId: string, draggedRowId: string, newIndex: number): Promise<boolean> {
      // Extract the field name and value from group IDs (e.g., "group_status_done" -> {field: "status", value: "done"})
      const parseGroupId = (groupId: string): { field: string; value: string } | null => {
        const match = groupId.match(/^group_([^_]+)_(.+)$/);
        if (!match) {
          fileLog.warn('🔍 Could not parse group ID', { groupId });
          return null;
        }
        return { field: match[1], value: match[2] };
      };

      const targetGroupInfo = parseGroupId(targetGroupId);
      const sourceGroupInfo = parseGroupId(sourceGroupId);

      if (!targetGroupInfo) {
        fileLog.error('❌ Invalid target group ID format', { targetGroupId });
        return false;
      }

      const { field: fieldName, value: newValue } = targetGroupInfo;
      const entityType = tableCore$.entityType.get();

      // Update the actual row data using the proper entity update system
      // The reactive system will automatically handle visual repositioning
      try {
        // Import the update helper and entity operations
        const { getUpdateFunction } = await import('../utils/entity-update-helpers');

        // Use the full org-prefixed entity type for entity operations
        const fullEntityType = entityType;

        // Get the update function and update the row's field value
        const updateEntity = getUpdateFunction(fullEntityType as any);
        const updateData = { [fieldName]: newValue };
        await updateEntity(draggedRowId, updateData);

        fileLog.info('🔄 Cross-group move completed via reactive field update', {
          draggedRowId,
          fieldName,
          oldValue: sourceGroupInfo?.value,
          newValue,
          sourceGroupId,
          targetGroupId,
          updateData,
          note: 'Row will appear in new group automatically via reactive system'
        });

        return true;
      } catch (error) {
        fileLog.error('❌ Failed to update row field for cross-group move', {
          draggedRowId,
          fieldName,
          newValue,
          entityType,
          fullEntityType: entityType,
          updateData: { [fieldName]: newValue },
          error: error.message
        });
        return false;
      }
    },

    moveRowInFlat(fromIndex: number, toIndex: number): boolean {
      try {
        const processedRows = tableCore$.processedRows.get();
        if (fromIndex < 0 || fromIndex >= processedRows.length || toIndex < 0 || toIndex >= processedRows.length) {
          return false;
        }

        // Get the row IDs from processed rows
        const rowIds = processedRows.map(row => row.id || row.data?.id).filter(Boolean);

        if (fromIndex >= rowIds.length || toIndex >= rowIds.length) {
          return false;
        }

        // Create new order by moving the row
        const newRowIds = [...rowIds];
        const [movedRowId] = newRowIds.splice(fromIndex, 1);
        newRowIds.splice(toIndex, 0, movedRowId);

        // Update the flat row order
        tableCore$.flatRowOrder.set(newRowIds);
        return true;
      } catch (error) {
        fileLog.error('Error moving row in flat data:', error);
        return false;
      }
    },

    getFlatRowOrder(): string[] {
      return tableCore$.flatRowOrder.get() || [];
    },

    clearFlatRowOrder() {
      tableCore$.flatRowOrder.set([]);
      fileLog.info('🗑️ Flat row order cleared (no persistence)');
    },

    // Group expansion toggle - delegates to visual state
    toggleGroupExpansion(groupId: string) {
      fileLog.info('🎯 Group expansion toggle - calling visual state', { groupId });

      // Get the group config from visual state
      const groupConfig = visualInputs$?.groupConfig?.get();
      if (!groupConfig || !groupConfig.expandedGroups) {
        fileLog.warn('🎯 No group config found, cannot toggle expansion', { groupId });
        return;
      }

      // Toggle the expansion state
      const newExpandedGroups = new Set(groupConfig.expandedGroups);
      if (newExpandedGroups.has(groupId)) {
        newExpandedGroups.delete(groupId);
        fileLog.info('🎯 Group collapsed', { groupId });
      } else {
        newExpandedGroups.add(groupId);
        fileLog.info('🎯 Group expanded', { groupId });
      }

      // Update the visual state with new expanded groups
      const newGroupConfig = {
        ...groupConfig,
        expandedGroups: newExpandedGroups
      };

      // Set the new config back to visual state
      visualInputs$?.groupConfig?.set(newGroupConfig);
    }
  });


  // Initialize columns observable with current state
  const orgId = universeOrgId$.get();
  const userId = universeUserId$.get();
  if (orgId && userId) {
    // TODO: Remove circular dependency - column initialization should be handled elsewhere
    // visualOperations.initializeColumns(columns, entityType, orgId, userId);
    fileLog.info(' Columns observable initialized', { entityType, orgId, userId });
  } else {
    fileLog.warn('� Cannot initialize columns observable - missing orgId or userId', { orgId, userId });
  }

  // No persistence - simple data-only state
  // Schema loading method for init manager - NO FALLBACKS
  const loadSchemaAndColumns = async () => {
    if (!initManager) {
      throw new Error('Init manager required for schema loading');
    }

    try {
      fileLog.info('📡 Starting schema loading for entity', { entityType });
      const generatedColumns = await generateColumnsFromEntitySchema(entityType);

      if (generatedColumns.length === 0) {
        throw new Error(`No columns generated for entity: ${entityType}`);
      }

      fileLog.info('✅ Schema loaded successfully', {
        entityType,
        columnCount: generatedColumns.length,
        hasCustomOptionReference: generatedColumns.some(col => col.type === 'custom_option_reference')
      });

      tableCore$.columns.set(generatedColumns);
      columns = generatedColumns;
      initManager.markReady('schemaLoaded');
    } catch (error) {
      fileLog.error('💥 Schema loading failed', { entityType, error });
      initManager.markError('schemaLoaded', `Schema loading failed: ${error.message}`, true);
      throw error;
    }
  };

  fileLog.info('✅ TableCore$ created, waiting for init manager to trigger schema loading', { entityType });

  // Return the observable with schema loading method
  return {
    tableCore$,
    tableCoreSync$: tableCore$, // No sync, just return the same observable for compatibility
    loadSchemaAndColumns // Expose for init manager to trigger
  };
}

export function createTableCoreSync$(entityType: string) {
  // This function is kept for API compatibility - actual sync is handled in createTableCore$
  const { tableCoreSync$ } = createTableCore$(entityType);
  return tableCoreSync$;
}