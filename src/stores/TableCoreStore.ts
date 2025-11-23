/**
 * TableCoreStore - Data State Management (MobX)
 *
 * Migrated from data-state.ts (Legend State → MobX)
 *
 * This store handles:
 * - Data loading and transformation
 * - Sorting, filtering, and grouping operations
 * - Row ordering (flat and grouped modes)
 * - Drag and drop row reordering
 *
 * Integration:
 * - Receives entity data from TanStack DB (via dependency injection)
 * - Reads visual configuration from VisualStateStore (filters, sort, groupConfig)
 * - Updates entity data via TanStack DB mutations
 */

import { makeObservable, observable, action, computed, runInAction, ObservableMap } from 'mobx'
import { createLogger } from '@/shared/lib/logging'
import { DisposerManager } from '@/app/stores/utils/disposer'
import { getOrCreateEntityCollection } from '@/shared/data/db/collections/registry'
import { createEntityCollection } from '@/shared/data/db/collections/entity-collections'
import { getActiveOrganizationId } from '@/app/stores/global/OrganizationStore'
import type { IStore } from '@/app/stores/types'
import type { Column, SortConfig, FilterConfig, GroupConfig } from '../types'
import { GroupProcessor } from '../processors/GroupProcessor'
import { generateColumnsFromEntitySchema } from './column-generation'
import type { VisualStateStore } from './VisualStateStore'
import type { VibeGridXCoordinateManager } from '../coordinates/VibeGridXCoordinateManager'

const log = createLogger('components/vibegrid/stores/TableCoreStore')

// ====================================
// TYPES
// ====================================

/**
 * Row ordering configuration for grouped mode drag and drop
 */
export interface GroupRowOrderConfig {
  groupId: string
  rowIds: string[]
  lastModified: string
}

/**
 * Persistent table state interface - only configuration data that should be saved
 * Excludes transient UI state like selection, editing, hover, etc.
 */
export interface PersistedTableState {
  // Row ordering in grouped mode (persisted)
  groupRowOrders: Record<string, GroupRowOrderConfig>

  // Row ordering in ungrouped/flat mode (persisted)
  flatRowOrder: string[]

  // Metadata
  version: string
  lastUpdated: string
  entityType: string
  orgId: string
  userId: string
}

export interface TableCoreState {
  entityType: string
  columns: Column[] // Schema definition only
  groupRowOrders: Record<string, GroupRowOrderConfig>
  flatRowOrder: string[] // Row IDs in custom order for ungrouped mode
}

// ====================================
// PURE TRANSFORMATION FUNCTIONS
// ====================================

function applyFilters(rows: any[], filters: FilterConfig[]): any[] {
  if (!filters || filters.length === 0) return rows

  return rows.filter(row => {
    return filters.every(filter => {
      const value = row.data ? row.data[filter.field] : row[filter.field]

      switch (filter.operator) {
        case 'equals':
          return value === filter.value
        case 'not_equals':
          return value !== filter.value
        case 'contains':
          return String(value).toLowerCase().includes(String(filter.value).toLowerCase())
        case 'not_contains':
          return !String(value).toLowerCase().includes(String(filter.value).toLowerCase())
        case 'starts_with':
          return String(value).toLowerCase().startsWith(String(filter.value).toLowerCase())
        case 'ends_with':
          return String(value).toLowerCase().endsWith(String(filter.value).toLowerCase())
        case 'greater_than':
          return Number(value) > Number(filter.value)
        case 'less_than':
          return Number(value) < Number(filter.value)
        case 'is_empty':
          return value === null || value === undefined || value === ''
        case 'is_not_empty':
          return value !== null && value !== undefined && value !== ''
        case 'in':
          return Array.isArray(filter.value) && filter.value.includes(value)
        case 'not_in':
          return Array.isArray(filter.value) && !filter.value.includes(value)
        case 'regex':
          try {
            const regex = new RegExp(String(filter.value))
            return regex.test(String(value))
          } catch {
            return false
          }
        default:
          return true
      }
    })
  })
}

function applySorting(rows: any[], sortBy: SortConfig[]): any[] {
  if (!sortBy || sortBy.length === 0) return rows

  return [...rows].sort((a, b) => {
    for (const sort of sortBy) {
      const aVal = a.data ? a.data[sort.field] : a[sort.field]
      const bVal = b.data ? b.data[sort.field] : b[sort.field]

      if (aVal === bVal) continue

      const comparison = aVal < bVal ? -1 : 1
      return sort.direction === 'asc' ? comparison : -comparison
    }
    return 0
  })
}

/**
 * Apply custom flat row ordering for ungrouped state
 */
function applyFlatRowOrdering(rows: any[], flatRowOrder: string[]): any[] {
  if (!flatRowOrder || flatRowOrder.length === 0) return rows

  // Create a map for quick lookup of row order
  const orderMap = new Map<string, number>()
  flatRowOrder.forEach((id, index) => {
    orderMap.set(id, index)
  })

  // Sort rows based on the custom order, with unordered rows at the end
  return [...rows].sort((a, b) => {
    const aId = a.id || a.data?.id
    const bId = b.id || b.data?.id

    const aOrder = orderMap.get(aId)
    const bOrder = orderMap.get(bId)

    // If both have order, use that
    if (aOrder !== undefined && bOrder !== undefined) {
      return aOrder - bOrder
    }

    // If only one has order, ordered item comes first
    if (aOrder !== undefined) return -1
    if (bOrder !== undefined) return 1

    // Neither has order, maintain original order
    return 0
  })
}

// ====================================
// TABLE CORE STORE
// ====================================

/**
 * Dependency injection interface for visual state
 * The TableCoreStore reads from VisualStateStore to get filters, sorting, and grouping config
 */
export interface VisualStateInputs {
  sortBy: SortConfig[]
  filters: FilterConfig[]
  groupConfig: GroupConfig | null
}

/**
 * Entity data provider interface
 * The TableCoreStore receives entity data from TanStack DB
 */
export interface EntityDataProvider {
  getEntityData(): Record<string, any>
  updateEntity(id: string, updates: Record<string, any>): Promise<void>
}

export class TableCoreStore implements IStore {
  // ====================================
  // OBSERVABLE STATE
  // ====================================

  @observable entityType: string
  @observable columns: Column[] = []
  @observable groupRowOrders: Record<string, GroupRowOrderConfig> = {}
  @observable flatRowOrder: string[] = []
  @observable isSchemaLoaded: boolean = false
  @observable schemaError: string | null = null

  // Raw entity data (from TanStack DB)
  @observable private rawRows: any[] = []
  @observable private hasLoadedRows: boolean = false

  // Members data for UserReference fields (from TanStack DB membersCollection)
  @observable membersData: ObservableMap<string, any> = observable.map<string, any>()

  // Cached entity reference data keyed by target entity → entity id
  @observable entityReferenceData: ObservableMap<string, ObservableMap<string, any>> = observable.map<string, ObservableMap<string, any>>()

  // Track in-flight entity reference loads to avoid duplicate network calls
  private pendingEntityReferenceLoads = new Map<string, Promise<void>>()

  // Cache for processedRows to avoid unnecessary recomputation
  private cachedProcessedRows: any[] | null = null
  private lastConfigHash: string | null = null
  private lastDataChangeCount: number = 0

  // Granular update trigger (observed by renderer without triggering processedRows)
  @observable private granularUpdateTrigger: number = 0

  // ====================================
  // CHANGE DETECTION (Cell-level updates)
  // ====================================

  // Previous snapshot of raw rows for change detection
  // Maps rowId → row data snapshot
  private previousRowsSnapshot: Map<string, any> = new Map()

  // Track last changed cells for granular updates
  // Maps rowId → Set of changed column IDs
  @observable lastChangedCells: Map<string, Set<string>> = new Map()

  // Track last change detection stats for optimization
  @observable lastChangeStats = { rowsChanged: 0, totalCellsChanged: 0 }

  /**
   * Computed getter for granular updates (observable without triggering processedRows)
   * Renderer observes this to handle cell-level updates
   */
  @computed
  get hasGranularUpdates(): { trigger: number; changedCells: Map<string, Set<string>> } | null {
    if (this.lastChangedCells.size > 0 && this.granularUpdateTrigger > 0) {
      return {
        trigger: this.granularUpdateTrigger,
        changedCells: this.lastChangedCells
      };
    }
    return null;
  }

  // ====================================
  // DEPENDENCIES (injected)
  // ====================================

  private visualStateInputs: VisualStateInputs | null = null
  private visualStateStore: VisualStateStore | null = null
  private entityDataProvider: EntityDataProvider | null = null
  private collection: any = null // TanStack DB collection for entity mutations
  private schemaRegistry: import('@/app/stores/domain/SchemaRegistryStore').SchemaRegistryStore | null = null
  private coordinateManager: VibeGridXCoordinateManager | null = null
  private disposers = new DisposerManager()

  // ====================================
  // CONSTRUCTOR
  // ====================================

  constructor(entityType: string) {
    this.entityType = entityType
    makeObservable(this)
  }

  // ====================================
  // DEPENDENCY INJECTION
  // ====================================

  /**
   * Set visual state inputs (filters, sorting, grouping)
   * Called by parent component after store creation
   */
  @action
  setVisualStateInputs(inputs: VisualStateInputs): void {
    this.visualStateInputs = inputs
    // Also store the full VisualStateStore reference for column initialization
    if ('columns' in inputs && 'initializeColumns' in inputs) {
      this.visualStateStore = inputs as VisualStateStore
    }
  }

  /**
   * Set entity data provider (TanStack DB integration)
   * Called by parent component after store creation
   * @deprecated Use setCollection instead for TanStack DB integration
   */
  @action
  setEntityDataProvider(provider: EntityDataProvider): void {
    this.entityDataProvider = provider
  }

  /**
   * Set TanStack DB collection for entity mutations
   * Called by parent component after store creation
   */
  @action
  setCollection(collection: any): void {
    this.collection = collection
    log.info('TanStack DB collection set on TableCoreStore', {
      hasCollection: !!collection
    })
  }

  /**
   * Set schema registry (for column generation)
   * Called by parent component after store creation
   */
  @action
  setSchemaRegistry(registry: import('@/app/stores/domain/SchemaRegistryStore').SchemaRegistryStore): void {
    this.schemaRegistry = registry
  }

  /**
   * Set coordinate manager (for row position tracking)
   * Called by parent component after store creation
   */
  @action
  setCoordinateManager(manager: VibeGridXCoordinateManager): void {
    this.coordinateManager = manager
    log.info('Coordinate manager set on TableCoreStore')
  }

  /**
   * Set raw entity rows directly (simplified interface for Day 7)
   * TODO (Day 10): Migrate to full entity data provider pattern
   */
  @action
  setRows(rows: any[]): void {
    // Detect changes before updating (for granular cell updates)
    const changedCells = this.detectChangedCells(rows)

    // Store changed cells for renderer to consume
    this.lastChangedCells = changedCells

    // Track change count for cache invalidation
    const totalChangedCells = Array.from(changedCells.values())
      .reduce((sum, cols) => sum + cols.size, 0)
    this.lastDataChangeCount = totalChangedCells

    // Check if this is a granular update (cell values changed but structure intact)
    // Structure = same rows in same order (no adds/deletes/reordering)
    const isSameStructure = rows.length === this.rawRows.length &&
                            rows.every((row, idx) => row.id === this.rawRows[idx]?.id);

    const isGranularUpdate = totalChangedCells > 0 && isSameStructure;

    if (isGranularUpdate && this.rawRows.length > 0) {
      // GRANULAR UPDATE PATH: Update in-place without reassigning array
      // This avoids triggering processedRows recomputation
      changedCells.forEach((columnSet, rowId) => {
        const existingRow = this.rawRows.find(r => r.id === rowId);
        const newRow = rows.find(r => r.id === rowId);

        if (existingRow && newRow) {
          // Update only the changed columns in the existing row object
          columnSet.forEach(columnId => {
            existingRow[columnId] = newRow[columnId];
          });
        }
      });

      // Increment granular trigger to notify renderer
      this.granularUpdateTrigger++;
      this.hasLoadedRows = true;

      log.info('🎯 Granular update applied (in-place)', {
        entityType: this.entityType,
        rowCount: rows.length,
        rowsChanged: changedCells.size,
        totalCellsChanged: totalChangedCells,
        skippedProcessedRowsRecomputation: true
      });
    } else {
      // FULL UPDATE PATH: Reassign array (triggers processedRows recomputation)
      this.rawRows = rows;
      this.hasLoadedRows = true;

      log.debug('📊 Full update applied (array reassignment)', {
        entityType: this.entityType,
        rowCount: rows.length,
        rowsChanged: changedCells.size,
        totalCellsChanged: totalChangedCells,
        isStructuralChange: rows.length !== this.rawRows.length || !isGranularUpdate
      });
    }
  }

  /**
   * Set members data for UserReference fields
   * Called from React hook with useLiveQuery results
   */
  @action
  setMembersData(members: any[]): void {
    this.membersData.clear()
    members.forEach(member => {
      if (member.user_id && member.user) {
        this.membersData.set(member.user_id, member.user)
      }
    })
    log.debug('👥 Members data updated', {
      memberCount: this.membersData.size
    })
  }

  // ====================================
  // CHANGE DETECTION METHODS
  // ====================================

  /**
   * Detect changed cells between current and previous data
   * Returns: Map<rowId, Set<columnId>> of changed cells
   *
   * This enables granular cell-level updates for:
   * - Local optimistic updates (instant user feedback)
   * - Remote collaborative updates (other users' edits)
   * - Background sync reconciliation
   */
  private detectChangedCells(newRows: any[]): Map<string, Set<string>> {
    const changedCells = new Map<string, Set<string>>()

    // Build new snapshot
    const newSnapshot = new Map(newRows.map(row => [row.id, row]))

    // Compare with previous snapshot
    for (const [rowId, newRow] of newSnapshot.entries()) {
      const oldRow = this.previousRowsSnapshot.get(rowId)

      if (!oldRow) {
        // New row - will be handled by full render, skip cell-level tracking
        continue
      }

      // Compare cell by cell
      const changedColumns = new Set<string>()

      for (const column of this.columns) {
        const columnId = column.id
        const oldValue = oldRow[columnId]
        const newValue = newRow[columnId]

        // Handle reference fields specially
        if (column.fieldType?.type === 'user_reference') {
          // For user references, compare the user ID (not the resolved user object)
          if (oldValue !== newValue) {
            changedColumns.add(columnId)

            log.debug('🔍 User reference change detected', {
              rowId,
              columnId,
              oldUserId: oldValue,
              newUserId: newValue
            })
          }
        } else if (column.fieldType?.type === 'entity_reference') {
          // For entity references, compare the entity ID
          if (oldValue !== newValue) {
            changedColumns.add(columnId)

            log.debug('🔍 Entity reference change detected', {
              rowId,
              columnId,
              oldRefId: oldValue,
              newRefId: newValue,
              targetEntity: column.fieldType.targetEntity
            })
          }
        } else {
          // Regular field - deep equality check for objects/arrays
          if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
            changedColumns.add(columnId)

            log.debug('🔍 Cell change detected', {
              rowId,
              columnId,
              oldValue,
              newValue,
              timestamp: newRow.updatedAt
            })
          }
        }
      }

      if (changedColumns.size > 0) {
        changedCells.set(rowId, changedColumns)
      }
    }

    // Update snapshot for next comparison
    this.previousRowsSnapshot = newSnapshot

    // Store stats for optimization checks
    const totalCellsChanged = Array.from(changedCells.values())
      .reduce((sum, cols) => sum + cols.size, 0)

    this.lastChangeStats = {
      rowsChanged: changedCells.size,
      totalCellsChanged
    }

    log.info('📊 Change detection complete', {
      totalRows: newRows.length,
      rowsChanged: changedCells.size,
      totalCellsChanged
    })

    return changedCells
  }

  getEntityReferenceRecord(targetEntity: string, entityId: string): any {
    const key = (targetEntity || '').toLowerCase()
    const map = this.entityReferenceData.get(key)
    return map?.get(entityId)
  }

  @action
  setEntityReferenceRecord(targetEntity: string, entityId: string, data: any): void {
    const map = this.getOrCreateEntityReferenceMap(targetEntity)
    map.set(entityId, data)
  }

  async ensureEntityReferenceRecord(
    targetEntity: string,
    entityId: string,
    loader?: () => Promise<any>
  ): Promise<any> {
    const map = this.getOrCreateEntityReferenceMap(targetEntity)
    if (map.has(entityId)) {
      return map.get(entityId)
    }

    const loadKey = `${(targetEntity || '').toLowerCase()}:${entityId}`
    if (!this.pendingEntityReferenceLoads.has(loadKey)) {
      const promise = this.loadEntityReferenceRecord(targetEntity, entityId, map, loader)
      this.pendingEntityReferenceLoads.set(loadKey, promise)
    }

    await this.pendingEntityReferenceLoads.get(loadKey)
    const result = map.get(entityId)
    log.debug('Entity reference ensure completed', {
      targetEntity,
      entityId,
      hasRecord: !!result
    })
    return result
  }

  private getOrCreateEntityReferenceMap(targetEntity: string): ObservableMap<string, any> {
    const key = (targetEntity || '').toLowerCase()
    let map = this.entityReferenceData.get(key)
    if (!map) {
      map = observable.map<string, any>()
      this.entityReferenceData.set(key, map)
    }
    return map
  }

  private async loadEntityReferenceRecord(
    targetEntity: string,
    entityId: string,
    map: ObservableMap<string, any>,
    loader?: () => Promise<any>
  ): Promise<void> {
    const loadKey = `${(targetEntity || '').toLowerCase()}:${entityId}`
    try {
      const collectionRecord = await this.loadFromEntityCollection(targetEntity, entityId)
      if (collectionRecord) {
        runInAction(() => {
          map.set(entityId, collectionRecord)
        })
        log.debug('Entity reference record loaded from collection', {
          targetEntity,
          entityId
        })
        return
      }

      if (loader) {
        const record = await loader()
        if (record) {
          runInAction(() => {
            map.set(entityId, record)
          })
          log.debug('Entity reference record loaded via fallback loader', {
            targetEntity,
            entityId
          })
          return
        }
      }

      log.debug('Entity reference record could not be loaded', {
        targetEntity,
        entityId
      })
    } catch (error) {
      log.error('Failed to load entity reference record', {
        targetEntity,
        entityId,
        error
      })
    } finally {
      this.pendingEntityReferenceLoads.delete(loadKey)
    }
  }

  private async loadFromEntityCollection(targetEntity: string, entityId: string): Promise<any | null> {
    try {
      const orgId = this.visualStateStore?.orgId || getActiveOrganizationId()
      if (!orgId) {
        log.debug('Entity reference collection load skipped - no orgId', {
          targetEntity,
          entityId
        })
        return null
      }

      if (!targetEntity) {
        log.debug('Entity reference collection load skipped - unknown target entity', {
          entityId
        })
        return null
      }

      const normalizedEntity = targetEntity

      const collection = getOrCreateEntityCollection(
        normalizedEntity,
        orgId,
        createEntityCollection
      )

      await collection.preload()
      const record = collection.get(entityId)
      if (record) {
        log.debug('Entity reference record found in TanStack collection', {
          targetEntity: normalizedEntity,
          entityId
        })
        return record
      }

      return null
    } catch (error) {
      log.debug('Entity reference collection load failed, will fall back to loader', {
        targetEntity,
        entityId,
        error
      })
      return null
    }
  }

  // ====================================
  // COMPUTED VALUES
  // ====================================

  /**
   * Processed rows with filtering, sorting, and grouping applied
   * This is the main data processing pipeline
   */
  @computed
  get processedRows(): any[] {
    if (!this.isSchemaLoaded) {
      log.debug('⏳ Schema not ready for processedRows', { entityType: this.entityType })
      return []
    }

    if (!this.hasLoadedRows) {
      log.debug('⏳ Entity data not yet loaded for processedRows', {
        entityType: this.entityType
      })
      return []
    }

    // Get visual state early for cache check
    const sortBy = this.visualStateStore?.sortBy || []
    const filters = this.visualStateStore?.filters || []
    const groupConfig = this.visualStateStore?.groupConfig || null

    // Create config hash for cache validation
    // This ensures we recompute when sort/filter/group/ordering changes even if data doesn't
    const configHash = JSON.stringify({
      sortBy: sortBy.map(s => ({ field: s.field, direction: s.direction })),
      filters: filters.map(f => ({ field: f.field, operator: f.operator, value: f.value })),
      groupFields: groupConfig?.fields?.map(f => f.field) || [],
      flatRowOrder: this.flatRowOrder // Include manual row ordering
    })

    // Check cache: return cached result if BOTH data and config are unchanged
    if (this.lastDataChangeCount === 0 &&
        this.lastConfigHash === configHash &&
        this.cachedProcessedRows !== null) {
      log.info('🎯 Cache hit: No data/config changes, returning cached processedRows', {
        cacheSize: this.cachedProcessedRows.length,
        lastDataChangeCount: this.lastDataChangeCount
      })
      return this.cachedProcessedRows
    }

    // Update config hash for next run
    this.lastConfigHash = configHash

    // Use raw rows if available (simplified Day 7 approach)
    let rows: any[]
    if (this.rawRows.length > 0) {
      rows = this.rawRows
      // DEBUG: Log first row structure to understand the data format
      if (rows.length > 0) {
        const firstRow = rows[0]
        log.info('🔍 [PROCESSEDROWS-DEBUG] First raw row structure', {
          hasId: !!firstRow?.id,
          hasData: !!firstRow?.data,
          keys: Object.keys(firstRow || {}),
          keyValues: Object.keys(firstRow || {}).reduce((acc, key) => {
            acc[key] = typeof firstRow[key]
            return acc
          }, {} as Record<string, string>),
          pathValue: firstRow?.path,
          typeValue: firstRow?.type,
          rawRowsLength: rows.length
        })
      }
    } else if (this.entityDataProvider) {
      // Fallback to entity data provider (future full implementation)
      const data = this.entityDataProvider.getEntityData() || {}
      rows = Object.values(data)
    } else {
      log.debug('ℹ️ No entity data available from provider', { entityType: this.entityType })
      return []
    }

    log.debug('📊 Got entity data', {
      entityType: this.entityType,
      recordCount: rows.length
    })

    // Visual state already retrieved above for cache check (sortBy, filters, groupConfig)
    log.info('🔍 [SORT-DEBUG] Reading sortBy from visualStateStore', {
      hasVisualStateStore: !!this.visualStateStore,
      sortByLength: sortBy.length,
      sortByValue: JSON.stringify(sortBy),
      visualStateStoreSortBy: this.visualStateStore?.sortBy,
      visualStateStoreSortByLength: this.visualStateStore?.sortBy?.length
    })

    // DEBUG: Log first row's actual field values for sorting
    if (rows.length > 0 && sortBy.length > 0) {
      const firstRow = rows[0]
      const sortField = sortBy[0].field
      log.info('🔍 [SORT-DEBUG] First row field access', {
        sortField,
        hasDataProperty: !!firstRow.data,
        directFieldValue: firstRow[sortField],
        dataFieldValue: firstRow.data?.[sortField],
        sampleKeys: Object.keys(firstRow).slice(0, 10),
        rowStructure: {
          id: firstRow.id,
          title: firstRow.title,
          name: firstRow.name
        }
      })
    }

    // Apply filters and sorting first
    rows = applyFilters(rows, filters)
    rows = applySorting(rows, sortBy)

    // Apply grouping if configured
    if (groupConfig && groupConfig.fields && groupConfig.fields.length > 0) {
      log.info('🔄 processedRows: Applying grouping', {
        groupFields: groupConfig.fields.map(f => f.field),
        groupRowOrdersCount: Object.keys(this.groupRowOrders).length
      })

      const groupResult = GroupProcessor.processData(
        rows,
        this.columns,
        groupConfig,
        this.groupRowOrders
      )

      log.info('✅ Processed rows with grouping', {
        inputCount: rows.length,
        filteredAndSortedRows: rows.length,
        virtualRowsAfterGrouping: groupResult.virtualRows.length,
        groupCount: groupResult.groupCount,
        hasFilters: filters.length > 0,
        hasSorting: sortBy.length > 0
      })

      // Cache the result before returning
      this.cachedProcessedRows = groupResult.virtualRows
      return groupResult.virtualRows
    }

    log.info('✅ Processed rows (no grouping)', {
      inputCount: rows.length,
      outputCount: rows.length,
      hasFilters: filters.length > 0,
      hasSorting: sortBy.length > 0
    })

    // Apply flat row ordering if no grouping and no sorting
    const hasSorting = sortBy.length > 0
    if (!hasSorting && this.flatRowOrder.length > 0) {
      rows = applyFlatRowOrdering(rows, this.flatRowOrder)
      log.debug('✅ Applied flat row ordering', {
        flatOrderCount: this.flatRowOrder.length,
        totalRows: rows.length
      })
    }

    // CRITICAL FIX: Wrap flat rows in VirtualRow structure for consistency with grouped rows
    // BodyRenderer.createCellElement expects rows with { type, id, data } structure
    const virtualRows = rows.map((row, index) => ({
      type: 'data' as const,
      id: row.id,
      index,
      height: 40, // DATA_ROW_HEIGHT constant from GroupProcessor
      data: row
    }))

    log.debug('✅ Wrapped flat rows in VirtualRow structure', {
      inputRows: rows.length,
      virtualRows: virtualRows.length
    })

    // Cache the result before returning
    this.cachedProcessedRows = virtualRows
    return virtualRows
  }

  // ====================================
  // GROUP ROW ORDERING ACTIONS
  // ====================================

  /**
   * Set custom row order for a specific group
   */
  /**
   * Sorted rows (alias for processedRows for compatibility)
   */
  @computed
  get sortedRows(): any[] {
    return this.processedRows
  }

  // ====================================
  // GROUP ROW ORDERING ACTIONS
  // ====================================

  /**
   * Set custom row order for a specific group
   */
  @action
  setGroupRowOrder(groupId: string, rowIds: string[]): void {
    this.groupRowOrders[groupId] = {
      groupId,
      rowIds,
      lastModified: new Date().toISOString()
    }

    log.info('🔄 Group row order set', {
      groupId,
      rowCount: rowIds.length
    })
  }

  /**
   * Move row within a group by index
   */
  @action
  moveRowInGroupByIndex(groupId: string, fromIndex: number, toIndex: number): boolean {
    const groupOrder = this.groupRowOrders[groupId]

    if (!groupOrder) {
      log.warn('⚠️ No group order found for drag operation', { groupId })
      return false
    }

    const newRowIds = [...groupOrder.rowIds]
    const [movedRowId] = newRowIds.splice(fromIndex, 1)
    newRowIds.splice(toIndex, 0, movedRowId)

    this.groupRowOrders[groupId] = {
      ...groupOrder,
      rowIds: newRowIds,
      lastModified: new Date().toISOString()
    }

    log.info('🔄 Row moved within group', {
      groupId,
      fromIndex,
      toIndex,
      movedRowId
    })

    return true
  }

  /**
   * Get custom row order for a specific group
   */
  getGroupRowOrder(groupId: string): string[] | null {
    return this.groupRowOrders[groupId]?.rowIds || null
  }

  /**
   * Clear all group row orders
   */
  @action
  clearGroupRowOrders(): void {
    this.groupRowOrders = {}
    log.info('🗑️ All group row orders cleared')
  }

  /**
   * Move row within group by ID (drag and drop)
   * Handles creation of initial group order if needed
   */
  @action
  async moveRowInGroup(
    sourceGroupId: string,
    targetGroupId: string,
    draggedRowId: string,
    newIndex: number
  ): Promise<boolean> {
    log.info('🔧 moveRowInGroup called', {
      sourceGroupId,
      targetGroupId,
      draggedRowId,
      newIndex,
      isCrossGroup: sourceGroupId !== targetGroupId
    })

    // Handle cross-group moves
    if (sourceGroupId !== targetGroupId) {
      return await this.moveRowBetweenGroups(sourceGroupId, targetGroupId, draggedRowId, newIndex)
    }

    let groupOrder = this.groupRowOrders[sourceGroupId]

    // If no order exists yet, create one from current group data
    if (!groupOrder) {
      const processedRows = this.processedRows

      if (!processedRows || !Array.isArray(processedRows)) {
        log.error('❌ Invalid processedRows when creating group order', {
          processedRows: typeof processedRows,
          sourceGroupId
        })
        return false
      }

      const groupRows = processedRows.filter(row =>
        row && row.type === 'data' && (row.groupId === sourceGroupId || row.parentGroupId === sourceGroupId)
      )
      const initialOrder = groupRows.map(row => row?.id).filter(Boolean)

      log.info('🔍 Creating group order', {
        sourceGroupId,
        processedRowsCount: processedRows.length,
        groupRowsCount: groupRows.length,
        initialOrderCount: initialOrder.length
      })

      groupOrder = {
        groupId: sourceGroupId,
        rowIds: initialOrder,
        lastModified: new Date().toISOString()
      }

      this.groupRowOrders[sourceGroupId] = groupOrder

      log.info('🆕 Created initial group row order', {
        sourceGroupId,
        rowCount: initialOrder.length
      })
    }

    // Find current position of the dragged row
    if (!groupOrder.rowIds || !Array.isArray(groupOrder.rowIds)) {
      log.error('❌ Invalid groupOrder.rowIds', {
        sourceGroupId,
        groupOrder,
        rowIdsType: typeof groupOrder.rowIds
      })
      return false
    }

    const currentIndex = groupOrder.rowIds.indexOf(draggedRowId)
    if (currentIndex === -1) {
      log.warn('⚠️ Dragged row not found in group order', {
        draggedRowId,
        sourceGroupId,
        currentOrder: groupOrder.rowIds
      })
      return false
    }

    // If trying to move to the same position, no change needed
    if (currentIndex === newIndex) {
      return true
    }

    // Validate newIndex - allow up to length (for appending at end)
    if (typeof newIndex !== 'number' || newIndex < 0 || newIndex > groupOrder.rowIds.length) {
      log.error('❌ Invalid newIndex for row move', {
        newIndex,
        newIndexType: typeof newIndex,
        currentIndex,
        rowIdsLength: groupOrder.rowIds.length,
        sourceGroupId,
        validRange: `0 to ${groupOrder.rowIds.length}`
      })
      return false
    }

    // Move the row
    try {
      const newRowIds = [...groupOrder.rowIds]
      const [movedRowId] = newRowIds.splice(currentIndex, 1)
      newRowIds.splice(newIndex, 0, movedRowId)

      this.groupRowOrders[sourceGroupId] = {
        ...groupOrder,
        rowIds: newRowIds,
        lastModified: new Date().toISOString()
      }

      log.info('🔄 Row moved within group by ID', {
        sourceGroupId,
        draggedRowId,
        from: currentIndex,
        to: newIndex,
        newOrderLength: newRowIds.length
      })

      return true
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      log.error('❌ Error during array manipulation', {
        error: errorMessage,
        currentIndex,
        newIndex,
        rowIdsLength: groupOrder.rowIds.length
      })
      return false
    }
  }

  /**
   * Move row between different groups
   * Updates the actual entity field value, reactive system handles visual repositioning
   */
  @action
  async moveRowBetweenGroups(
    sourceGroupId: string,
    targetGroupId: string,
    draggedRowId: string,
    newIndex: number
  ): Promise<boolean> {
    // Extract the field name and value from group IDs (e.g., "group_status_done" -> {field: "status", value: "done"})
    const parseGroupId = (groupId: string): { field: string; value: string } | null => {
      const match = groupId.match(/^group_([^_]+)_(.+)$/)
      if (!match) {
        log.warn('🔍 Could not parse group ID', { groupId })
        return null
      }
      return { field: match[1], value: match[2] }
    }

    const targetGroupInfo = parseGroupId(targetGroupId)
    const sourceGroupInfo = parseGroupId(sourceGroupId)

    if (!targetGroupInfo) {
      log.error('❌ Invalid target group ID format', { targetGroupId })
      return false
    }

    const { field: fieldName, value: newValue } = targetGroupInfo

    if (!this.collection) {
      log.error('❌ TanStack DB collection not available for cross-group move', {
        hint: 'Call setCollection() before performing cross-group moves'
      })
      return false
    }

    // Update the actual row data using TanStack DB collection
    try {
      const updateData = { [fieldName]: newValue }

      // Use TanStack DB collection's update method with optimistic updates
      const tx = this.collection.update(String(draggedRowId), (draft: any) => {
        draft[fieldName] = newValue
        draft.updatedAt = new Date().toISOString()
      })

      // Wait for the update to complete (handles optimistic state + server sync)
      await tx

      log.info('🔄 Cross-group move completed via field update', {
        draggedRowId,
        fieldName,
        oldValue: sourceGroupInfo?.value,
        newValue,
        sourceGroupId,
        targetGroupId,
        updateData,
        note: 'Row will appear in new group automatically via reactive system'
      })

      return true
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      log.error('❌ Failed to update row field for cross-group move', {
        draggedRowId,
        fieldName,
        newValue,
        entityType: this.entityType,
        updateData: { [fieldName]: newValue },
        error: errorMessage
      })
      return false
    }
  }

  // ====================================
  // FLAT ROW ORDERING ACTIONS
  // ====================================

  /**
   * Set custom row order for flat/ungrouped mode
   */
  @action
  setFlatRowOrder(rowIds: string[]): void {
    this.flatRowOrder = [...rowIds]
    log.info('🔄 Flat row order set', {
      rowCount: rowIds.length
    })
  }

  /**
   * Move row in flat mode by index
   */
  @action
  moveRowInFlat(fromIndex: number, toIndex: number): boolean {
    try {
      const processedRows = this.processedRows
      if (fromIndex < 0 || fromIndex >= processedRows.length || toIndex < 0 || toIndex >= processedRows.length) {
        return false
      }

      // Get the row IDs from processed rows
      const rowIds = processedRows.map(row => row.id || row.data?.id).filter(Boolean)

      if (fromIndex >= rowIds.length || toIndex >= rowIds.length) {
        return false
      }

      // Create new order by moving the row
      const newRowIds = [...rowIds]
      const [movedRowId] = newRowIds.splice(fromIndex, 1)
      newRowIds.splice(toIndex, 0, movedRowId)

      // Update the flat row order
      this.flatRowOrder = newRowIds

      log.info('🔄 Flat row order updated', {
        from: fromIndex,
        to: toIndex,
        movedRowId,
        newOrderLength: newRowIds.length,
        flatRowOrder: this.flatRowOrder
      })

      return true
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      log.error('Error moving row in flat data:', errorMessage)
      return false
    }
  }

  /**
   * Get flat row order
   */
  getFlatRowOrder(): string[] {
    return this.flatRowOrder || []
  }

  /**
   * Clear flat row order
   */
  @action
  clearFlatRowOrder(): void {
    this.flatRowOrder = []
    log.info('🗑️ Flat row order cleared')
  }

  /**
   * Toggle group expansion state
   * Delegates to visual state store
   */
  toggleGroupExpansion(groupId: string): void {
    log.info('🎯 Group expansion toggle - should be handled by visual state', { groupId })
    // NOTE: This will be handled by VisualStateStore in the integrated system
    // For now, this is a placeholder
  }

  // ====================================
  // ISTORE LIFECYCLE METHODS
  // ====================================

  /**
   * Initialize store - load schema and columns
   */
  @action
  async init(): Promise<void> {
    log.debug('Initializing TableCoreStore...', { entityType: this.entityType })

    try {
      // Check if schema registry is available
      if (!this.schemaRegistry) {
        throw new Error('Schema registry not set - call setSchemaRegistry() before init()')
      }

      // Load schema and generate columns (with fallback)
      const generatedColumns = await generateColumnsFromEntitySchema(this.entityType, this.schemaRegistry)

      if (generatedColumns.length === 0) {
        throw new Error(`No columns generated for entity: ${this.entityType}`)
      }

      runInAction(() => {
        this.columns = generatedColumns
        this.isSchemaLoaded = true
        this.schemaError = null
      })

      // 🚀 Initialize columns in VisualStateStore
      if (this.visualStateStore) {
        const orgId = this.visualStateStore.orgId || getActiveOrganizationId() || ''
        const userId = this.visualStateStore.userId || ''
        this.visualStateStore.initializeColumns(
          generatedColumns,
          this.entityType,
          orgId,
          userId
        )
        log.info('✅ Columns initialized in VisualStateStore', {
          entityType: this.entityType,
          columnCount: generatedColumns.length
        })
      } else {
        log.warn('⚠️ VisualStateStore not available for column initialization', {
          entityType: this.entityType
        })
      }

      log.info('✅ Schema loaded successfully', {
        entityType: this.entityType,
        columnCount: generatedColumns.length,
        hasCustomOptionReference: generatedColumns.some(col => col.type === 'custom_option_reference')
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'

      runInAction(() => {
        this.schemaError = `Schema loading failed: ${errorMessage}`
        this.isSchemaLoaded = false
      })

      log.error('💥 Schema loading failed', {
        entityType: this.entityType,
        error: errorMessage
      })

      throw error
    }
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    this.disposers.dispose()
    log.debug('TableCoreStore disposed', { entityType: this.entityType })
  }

  /**
   * Reset store to default state
   */
  @action
  reset(): void {
    this.groupRowOrders = {}
    this.flatRowOrder = []
    this.isSchemaLoaded = false
    this.schemaError = null
    this.columns = []
    this.rawRows = []
    this.hasLoadedRows = false
    this.membersData.clear()
    this.entityReferenceData.clear()
    this.pendingEntityReferenceLoads.clear()

    // Clear change detection state
    this.previousRowsSnapshot.clear()
    this.lastChangedCells.clear()

    log.info('🔄 TableCoreStore reset', { entityType: this.entityType })
  }

  // ====================================
  // LEGACY/STUB METHODS (for type compatibility)
  // ====================================

  /**
   * @deprecated Stub method for type compatibility
   */
  insertRow(): void {
    log.warn('insertRow() not implemented - legacy method stub')
  }

  /**
   * @deprecated Stub method for type compatibility
   */
  deleteRow(): void {
    log.warn('deleteRow() not implemented - legacy method stub')
  }

  /**
   * @deprecated Stub method for type compatibility
   */
  undo(): void {
    log.warn('undo() not implemented - legacy method stub')
  }

  /**
   * @deprecated Stub method for type compatibility
   */
  redo(): void {
    log.warn('redo() not implemented - legacy method stub')
  }

  /**
   * @observable Grouping configuration
   */
  @observable grouping: any = null
}
