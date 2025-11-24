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

import { action, computed, makeObservable, type ObservableMap, observable, runInAction } from 'mobx'
import { getActiveOrganizationId } from '@/app/stores/global/OrganizationStore'
import type { IStore } from '@/app/stores/types'
import { DisposerManager } from '@/app/stores/utils/disposer'
import { createEntityCollection } from '@/shared/data/db/collections/entity-collections'
import { getOrCreateEntityCollection } from '@/shared/data/db/collections/registry'
import { createLogger } from '@/shared/lib/logging'
import type { VibeGridXCoordinateManager } from '../coordinates/VibeGridXCoordinateManager'
import { GroupProcessor } from '../processors/GroupProcessor'
import type { Column, FilterConfig, GroupConfig, SortConfig } from '../types'
import { type ChangeMetadata, ChangeType, classifyChanges } from '../utils/change-classification'
import { createRowSnapshot, METADATA_COLUMNS, type RowSnapshot } from '../utils/hashing'
import { generateColumnsFromEntitySchema } from './column-generation'
import type { VisualStateStore } from './VisualStateStore'

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

export interface PendingReorderOperation {
  fromIndex: number
  toIndex: number
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

  return rows.filter((row) => {
    return filters.every((filter) => {
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

  // Pending reorder confirmation (when sorting is active)
  @observable pendingReorder: PendingReorderOperation | null = null

  // Raw entity data (from TanStack DB)
  @observable private rawRows: any[] = []
  @observable private hasLoadedRows: boolean = false

  // Members data for UserReference fields (from TanStack DB membersCollection)
  @observable membersData: ObservableMap<string, any> = observable.map<string, any>()

  // Cached entity reference data keyed by target entity → entity id
  @observable entityReferenceData: ObservableMap<string, ObservableMap<string, any>> =
    observable.map<string, ObservableMap<string, any>>()

  // Track in-flight entity reference loads to avoid duplicate network calls
  private pendingEntityReferenceLoads = new Map<string, Promise<void>>()

  // ====================================
  // CHANGE DETECTION (Cell-level updates)
  // ====================================

  // Previous snapshot of raw rows for change detection
  // Maps rowId → row snapshot with per-column hashes
  private previousRowsSnapshot: Map<string, RowSnapshot> = new Map()

  // Track last changed cells for granular updates
  // Maps rowId → Set of changed column IDs
  @observable lastChangedCells: Map<string, Set<string>> = new Map()

  // Track last change detection stats for optimization
  @observable lastChangeStats = { rowsChanged: 0, totalCellsChanged: 0 }

  // Version tracking for change classification
  @observable dataVersion: number = 0 // Increments on cell value changes
  @observable configVersion: number = 0 // Increments on sort/filter/group changes
  @observable structureVersion: number = 0 // Increments on add/remove/reorder rows

  // Change metadata for renderer routing
  @observable lastChangeMetadata: ChangeMetadata | null = null

  // ====================================
  // DEPENDENCIES (injected)
  // ====================================

  private visualStateInputs: VisualStateInputs | null = null
  private visualStateStore: VisualStateStore | null = null
  private entityDataProvider: EntityDataProvider | null = null
  private collection: any = null // TanStack DB collection for entity mutations
  private schemaRegistry:
    | import('@/app/stores/domain/SchemaRegistryStore').SchemaRegistryStore
    | null = null
  private coordinateManager: VibeGridXCoordinateManager | null = null
  private interactionStore: import('./InteractionStore').InteractionStore | null = null
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
      hasCollection: !!collection,
    })
  }

  /**
   * Set schema registry (for column generation)
   * Called by parent component after store creation
   */
  @action
  setSchemaRegistry(
    registry: import('@/app/stores/domain/SchemaRegistryStore').SchemaRegistryStore,
  ): void {
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
   * Set interaction store (for clearing selections on row operations)
   */
  @action
  setInteractionStore(store: import('./InteractionStore').InteractionStore): void {
    this.interactionStore = store
    log.info('Interaction store set on TableCoreStore')
  }

  /**
   * Set raw entity rows directly (simplified interface for Day 7)
   * TODO (Day 10): Migrate to full entity data provider pattern
   */
  @action
  setRows(rows: any[]): void {
    // Step 1: Detect changes with loop-back protection
    const changedCells = this.detectChangedCells(rows)

    // Step 2: Check structural changes
    const newRowCount = rows.length
    const prevRowCount = this.rawRows.length
    const structuralChange =
      newRowCount !== prevRowCount || !rows.every((r, i) => r.id === this.rawRows[i]?.id)

    // Step 3: Check sorting sensitivity
    const sortingSensitive = this.checkSortingFields(changedCells)

    // Step 4: Classify changes
    const metadata = classifyChanges(changedCells, sortingSensitive, structuralChange)

    // Step 5: Route based on classification
    if (metadata.type === ChangeType.NONE) {
      log.debug('⏭️ Guard 1: No-op detected', {
        reason: 'no_data_changes',
        loopBackProtected: true,
      })
      // Clear stale metadata
      this.lastChangedCells.clear()
      this.lastChangeMetadata = null
      return // EXIT - No version bumps, no rawRows assignment
    }

    if (metadata.structuralChange) {
      this.structureVersion++
      this.rawRows = rows
      this.hasLoadedRows = true
      // Clear metadata (not applicable)
      this.lastChangedCells.clear()
      this.lastChangeMetadata = null
      log.info('📊 Structural change', { structureVersion: this.structureVersion })
      return
    }

    if (metadata.sortingSensitive) {
      this.configVersion++
      this.rawRows = rows
      this.hasLoadedRows = true
      // Clear metadata (will trigger full render)
      this.lastChangedCells.clear()
      this.lastChangeMetadata = null
      log.info('🔄 Sorting-sensitive change', { configVersion: this.configVersion })
      return
    }

    // Cell-only change
    this.dataVersion++
    this.rawRows = rows
    this.hasLoadedRows = true
    this.lastChangedCells = changedCells
    this.lastChangeMetadata = metadata // Keep for renderer
    log.info('📝 Cell-only change', {
      dataVersion: this.dataVersion,
      cellsChanged: metadata.estimatedCellCount,
    })
  }

  /**
   * Increment config version to trigger renderer re-render
   * Called when visual configuration changes (grouping, sorting, filtering)
   */
  @action
  incrementConfigVersion(): void {
    this.configVersion++
    log.info('📋 Config version incremented (external trigger)', {
      configVersion: this.configVersion,
    })
  }

  /**
   * Set members data for UserReference fields
   * Called from React hook with useLiveQuery results
   */
  @action
  setMembersData(members: any[]): void {
    this.membersData.clear()
    members.forEach((member) => {
      if (member.user_id && member.user) {
        this.membersData.set(member.user_id, member.user)
      }
    })
    log.debug('👥 Members data updated', {
      memberCount: this.membersData.size,
    })
  }

  /**
   * Initialize baseline snapshot when both schema and data are ready
   * Called by VibeGrid after InitStore marks both dependencies as loaded
   *
   * CRITICAL: This must be called AFTER both columns and rows are loaded
   * to ensure the baseline snapshot is created at the right time. Without
   * this, the first edit will create the baseline (too late), causing
   * detectChangedCells() to return empty and versions to not increment.
   */
  @action
  initializeBaselineSnapshot(): void {
    log.debug('🎯 [BASELINE] Initializing baseline snapshot', {
      hasColumns: this.columns.length > 0,
      hasRows: this.rawRows.length > 0,
      previousSnapshotSize: this.previousRowsSnapshot.size,
    })

    if (
      this.columns.length > 0 &&
      this.rawRows.length > 0 &&
      this.previousRowsSnapshot.size === 0
    ) {
      // Force baseline creation by calling setRows with current data
      // This will trigger detectChangedCells which will create the baseline
      const currentRows = this.rawRows.slice()
      this.setRows(currentRows)
      log.info('✅ [BASELINE] Baseline snapshot created', {
        snapshotSize: this.previousRowsSnapshot.size,
      })
    } else {
      log.debug('⏭️ [BASELINE] Skipping - preconditions not met or baseline already exists', {
        hasColumns: this.columns.length > 0,
        hasRows: this.rawRows.length > 0,
        hasSnapshot: this.previousRowsSnapshot.size > 0,
      })
    }
  }

  // ====================================
  // CHANGE DETECTION METHODS
  // ====================================

  /**
   * Detect changed cells between current and previous data
   * Returns: Map<rowId, Set<columnId>> of changed cells
   *
   * ENHANCED with per-column hashing and loop-back protection:
   * - Local optimistic updates (instant user feedback)
   * - Remote collaborative updates (other users' edits)
   * - Background sync reconciliation
   * - Loop-back protection: Metadata-only changes treated as no-op
   */
  private detectChangedCells(newRows: any[]): Map<string, Set<string>> {
    const changedCells = new Map<string, Set<string>>()

    log.debug('🔍 DEBUG: detectChangedCells START', {
      newRowsCount: newRows.length,
      prevSnapshotSize: this.previousRowsSnapshot.size,
      columnsCount: this.columns.length,
    })

    // Skip change detection if columns not loaded yet
    // This prevents creating invalid snapshots with empty columnHashes
    if (this.columns.length === 0) {
      log.debug('⏭️ Skipping change detection - columns not loaded yet')
      return changedCells
    }

    // Build new snapshot with per-column hashing
    const newSnapshot = new Map(
      newRows.map((row) => [row.id, createRowSnapshot(row, this.columns)]),
    )

    // Initialize baseline snapshot if empty (columns loaded but no previous snapshot)
    if (this.previousRowsSnapshot.size === 0 && newSnapshot.size > 0) {
      log.info('🔄 Creating initial baseline snapshot', {
        rowCount: newSnapshot.size,
        columnCount: this.columns.length,
      })
      this.previousRowsSnapshot = newSnapshot
      // Return empty changedCells - this is the baseline, nothing to compare yet
      return changedCells
    }

    for (const [rowId, newSnap] of newSnapshot.entries()) {
      const oldSnap = this.previousRowsSnapshot.get(rowId)

      if (!oldSnap) {
        // New row - handled by structural change detection
        continue
      }

      // LOOP-BACK PROTECTION: Check data-only hash first
      if (newSnap.dataHash === oldSnap.dataHash) {
        // Only metadata changed (e.g., updatedAt from backend)
        log.debug('🔄 Loop-back protection activated', {
          rowId,
          note: 'Only metadata changed - treating as no-op',
        })
        continue
      }

      // Data changed - find which columns
      const changedColumns = new Set<string>()

      for (const [columnId, newHash] of newSnap.columnHashes.entries()) {
        // Skip metadata columns in change reporting
        if (METADATA_COLUMNS.has(columnId)) {
          continue
        }

        const oldHash = oldSnap.columnHashes.get(columnId)
        if (newHash !== oldHash) {
          changedColumns.add(columnId)

          // DEBUG: Log first 3 changes with actual values
          if (changedColumns.size <= 3) {
            const column = this.columns.find((c) => c.id === columnId)
            log.debug('🔍 DEBUG: Cell change detected', {
              rowId: rowId.substring(0, 8),
              columnId,
              fieldType: column?.fieldType?.type,
              oldHash,
              newHash,
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

    log.debug('🔍 DEBUG: Updated previousRowsSnapshot', {
      snapshotSize: this.previousRowsSnapshot.size,
      firstRowId: Array.from(this.previousRowsSnapshot.keys())[0]?.substring(0, 8),
    })

    // Store stats for optimization checks
    const totalCellsChanged = Array.from(changedCells.values()).reduce(
      (sum, cols) => sum + cols.size,
      0,
    )

    this.lastChangeStats = {
      rowsChanged: changedCells.size,
      totalCellsChanged,
    }

    log.info('📊 Change detection complete', {
      totalRows: newRows.length,
      rowsChanged: changedCells.size,
      totalCellsChanged,
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
    loader?: () => Promise<any>,
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
      hasRecord: !!result,
    })
    return result
  }

  @action
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
    loader?: () => Promise<any>,
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
          entityId,
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
            entityId,
          })
          return
        }
      }

      log.debug('Entity reference record could not be loaded', {
        targetEntity,
        entityId,
      })
    } catch (error) {
      log.error('Failed to load entity reference record', {
        targetEntity,
        entityId,
        error,
      })
    } finally {
      this.pendingEntityReferenceLoads.delete(loadKey)
    }
  }

  private async loadFromEntityCollection(
    targetEntity: string,
    entityId: string,
  ): Promise<any | null> {
    try {
      const orgId = this.visualStateStore?.orgId || getActiveOrganizationId()
      if (!orgId) {
        log.debug('Entity reference collection load skipped - no orgId', {
          targetEntity,
          entityId,
        })
        return null
      }

      if (!targetEntity) {
        log.debug('Entity reference collection load skipped - unknown target entity', {
          entityId,
        })
        return null
      }

      const normalizedEntity = targetEntity

      const collection = getOrCreateEntityCollection(
        normalizedEntity,
        orgId,
        createEntityCollection,
      )

      await collection.preload()
      const record = collection.get(entityId)
      if (record) {
        log.debug('Entity reference record found in TanStack collection', {
          targetEntity: normalizedEntity,
          entityId,
        })
        return record
      }

      return null
    } catch (error) {
      log.debug('Entity reference collection load failed, will fall back to loader', {
        targetEntity,
        entityId,
        error,
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
        entityType: this.entityType,
      })
      return []
    }

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
          keyValues: Object.keys(firstRow || {}).reduce(
            (acc, key) => {
              acc[key] = typeof firstRow[key]
              return acc
            },
            {} as Record<string, string>,
          ),
          pathValue: firstRow?.path,
          typeValue: firstRow?.type,
          rawRowsLength: rows.length,
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
      recordCount: rows.length,
    })

    // Get visual state (filters, sorting, grouping)
    // CRITICAL: Use visualStateStore (not visualStateInputs) for reactive MobX properties
    const sortBy = this.visualStateStore?.sortBy || []
    const filters = this.visualStateStore?.filters || []
    const groupConfig = this.visualStateStore?.groupConfig || null

    log.info('🔍 [SORT-DEBUG] Reading sortBy from visualStateStore', {
      hasVisualStateStore: !!this.visualStateStore,
      sortByLength: sortBy.length,
      sortByValue: JSON.stringify(sortBy),
      visualStateStoreSortBy: this.visualStateStore?.sortBy,
      visualStateStoreSortByLength: this.visualStateStore?.sortBy?.length,
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
          name: firstRow.name,
        },
      })
    }

    // Apply filters and sorting first
    rows = applyFilters(rows, filters)
    rows = applySorting(rows, sortBy)

    // Apply grouping if configured
    if (groupConfig && groupConfig.fields && groupConfig.fields.length > 0) {
      log.info('🔄 processedRows: Applying grouping', {
        groupFields: groupConfig.fields.map((f) => f.field),
        groupRowOrdersCount: Object.keys(this.groupRowOrders).length,
      })

      const groupResult = GroupProcessor.processData(
        rows,
        this.columns,
        groupConfig,
        this.groupRowOrders,
      )

      log.info('✅ Processed rows with grouping', {
        inputCount: rows.length,
        filteredAndSortedRows: rows.length,
        virtualRowsAfterGrouping: groupResult.virtualRows.length,
        groupCount: groupResult.groupCount,
        hasFilters: filters.length > 0,
        hasSorting: sortBy.length > 0,
      })

      return groupResult.virtualRows
    }

    log.info('✅ Processed rows (no grouping)', {
      inputCount: rows.length,
      outputCount: rows.length,
      hasFilters: filters.length > 0,
      hasSorting: sortBy.length > 0,
    })

    // Apply flat row ordering if no grouping and no sorting
    const hasSorting = sortBy.length > 0
    if (!hasSorting && this.flatRowOrder.length > 0) {
      rows = applyFlatRowOrdering(rows, this.flatRowOrder)
      log.debug('✅ Applied flat row ordering', {
        flatOrderCount: this.flatRowOrder.length,
        totalRows: rows.length,
      })
    }

    // CRITICAL FIX: Wrap flat rows in VirtualRow structure for consistency with grouped rows
    // BodyRenderer.createCellElement expects rows with { type, id, data } structure
    const virtualRows = rows.map((row, index) => ({
      type: 'data' as const,
      id: row.id,
      index,
      height: 40, // DATA_ROW_HEIGHT constant from GroupProcessor
      data: row,
    }))

    log.debug('✅ Wrapped flat rows in VirtualRow structure', {
      inputRows: rows.length,
      virtualRows: virtualRows.length,
    })

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

  /**
   * Get fields used in sorting
   */
  @computed
  get sortFields(): Set<string> {
    return new Set(this.visualStateStore?.sortBy?.map((s) => s.field) || [])
  }

  /**
   * Get fields used in filtering
   */
  @computed
  get filterFields(): Set<string> {
    return new Set(this.visualStateStore?.filters?.map((f) => f.field) || [])
  }

  /**
   * Get fields used in grouping
   */
  @computed
  get groupFields(): Set<string> {
    const config = this.visualStateStore?.groupConfig
    return new Set(config?.fields?.map((f) => f.field) || [])
  }

  /**
   * Check if any changed column affects sorting/filtering/grouping
   */
  checkSortingFields(changedCells: Map<string, Set<string>>): boolean {
    const sensitiveFields = new Set([...this.sortFields, ...this.filterFields, ...this.groupFields])

    for (const columnIds of changedCells.values()) {
      for (const columnId of columnIds) {
        if (sensitiveFields.has(columnId)) {
          log.info('🔄 Sorting-sensitive field changed', {
            columnId,
            requiresFullRecompute: true,
          })
          return true
        }
      }
    }

    return false
  }

  /**
   * Row offset map for variable-height virtual scrolling
   * Returns array where index i = cumulative Y offset of row i
   */
  @computed
  get rowOffsets(): number[] {
    const rows = this.processedRows
    const offsets: number[] = [0]

    for (let i = 0; i < rows.length; i++) {
      const prevOffset = offsets[i]
      const rowHeight = rows[i]?.height || 40
      offsets.push(prevOffset + rowHeight)
    }

    return offsets
  }

  /**
   * Find row index at given scroll position using binary search
   */
  findRowAtScrollPosition(scrollTop: number): number {
    const offsets = this.rowOffsets
    if (offsets.length === 0) return 0

    let left = 0
    let right = offsets.length - 1

    while (left < right) {
      const mid = Math.floor((left + right) / 2)
      if (offsets[mid] < scrollTop) {
        left = mid + 1
      } else {
        right = mid
      }
    }

    return Math.max(0, left - 1)
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
      lastModified: new Date().toISOString(),
    }

    log.info('🔄 Group row order set', {
      groupId,
      rowCount: rowIds.length,
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
      lastModified: new Date().toISOString(),
    }

    log.info('🔄 Row moved within group', {
      groupId,
      fromIndex,
      toIndex,
      movedRowId,
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
    newIndex: number,
  ): Promise<boolean> {
    log.info('🔧 moveRowInGroup called', {
      sourceGroupId,
      targetGroupId,
      draggedRowId,
      newIndex,
      isCrossGroup: sourceGroupId !== targetGroupId,
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
          sourceGroupId,
        })
        return false
      }

      const groupRows = processedRows.filter(
        (row) =>
          row &&
          row.type === 'data' &&
          (row.groupId === sourceGroupId || row.parentGroupId === sourceGroupId),
      )
      const initialOrder = groupRows.map((row) => row?.id).filter(Boolean)

      log.info('🔍 Creating group order', {
        sourceGroupId,
        processedRowsCount: processedRows.length,
        groupRowsCount: groupRows.length,
        initialOrderCount: initialOrder.length,
      })

      groupOrder = {
        groupId: sourceGroupId,
        rowIds: initialOrder,
        lastModified: new Date().toISOString(),
      }

      this.groupRowOrders[sourceGroupId] = groupOrder

      log.info('🆕 Created initial group row order', {
        sourceGroupId,
        rowCount: initialOrder.length,
      })
    }

    // Find current position of the dragged row
    if (!groupOrder.rowIds || !Array.isArray(groupOrder.rowIds)) {
      log.error('❌ Invalid groupOrder.rowIds', {
        sourceGroupId,
        groupOrder,
        rowIdsType: typeof groupOrder.rowIds,
      })
      return false
    }

    const currentIndex = groupOrder.rowIds.indexOf(draggedRowId)
    if (currentIndex === -1) {
      log.warn('⚠️ Dragged row not found in group order', {
        draggedRowId,
        sourceGroupId,
        currentOrder: groupOrder.rowIds,
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
        validRange: `0 to ${groupOrder.rowIds.length}`,
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
        lastModified: new Date().toISOString(),
      }

      // Update coordinator with new row order
      this.updateCoordinatorWithCurrentRows()

      log.info('🔄 Row moved within group by ID', {
        sourceGroupId,
        draggedRowId,
        from: currentIndex,
        to: newIndex,
        newOrderLength: newRowIds.length,
      })

      return true
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      log.error('❌ Error during array manipulation', {
        error: errorMessage,
        currentIndex,
        newIndex,
        rowIdsLength: groupOrder.rowIds.length,
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
    newIndex: number,
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
        hint: 'Call setCollection() before performing cross-group moves',
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
        note: 'Row will appear in new group automatically via reactive system',
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
        error: errorMessage,
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

    // Update coordinator with new row order
    this.updateCoordinatorWithCurrentRows()

    log.info('🔄 Flat row order set', {
      rowCount: rowIds.length,
    })
  }

  /**
   * Move row in flat mode by index
   */
  @action
  moveRowInFlat(fromIndex: number, toIndex: number): boolean {
    try {
      // Check if sorting is active
      const sortBy = this.visualStateStore?.sortBy || []
      const hasSorting = sortBy.length > 0

      if (hasSorting) {
        // Store pending operation and show confirmation dialog
        this.pendingReorder = { fromIndex, toIndex }
        log.info('⏸️ Reorder pending confirmation (sorting active)', {
          fromIndex,
          toIndex,
          activeSort: sortBy.map((s) => `${s.field} ${s.direction}`),
        })
        return false // Operation pending user confirmation
      }

      // No sorting active, proceed with reorder
      return this.executeReorder(fromIndex, toIndex)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      log.error('Error moving row in flat data:', errorMessage)
      return false
    }
  }

  /**
   * Execute the reorder operation (called after confirmation or when no sorting is active)
   */
  @action
  private executeReorder(fromIndex: number, toIndex: number): boolean {
    const processedRows = this.processedRows
    if (
      fromIndex < 0 ||
      fromIndex >= processedRows.length ||
      toIndex < 0 ||
      toIndex >= processedRows.length
    ) {
      return false
    }

    // Get the row IDs from processed rows
    const rowIds = processedRows.map((row) => row.id || row.data?.id).filter(Boolean)

    if (fromIndex >= rowIds.length || toIndex >= rowIds.length) {
      return false
    }

    // Create new order by moving the row
    const newRowIds = [...rowIds]
    const [movedRowId] = newRowIds.splice(fromIndex, 1)
    newRowIds.splice(toIndex, 0, movedRowId)

    // Update the flat row order
    this.flatRowOrder = newRowIds

    // Update coordinator with new row order
    this.updateCoordinatorWithCurrentRows()

    log.info('🔄 Flat row order updated', {
      from: fromIndex,
      to: toIndex,
      movedRowId,
      newOrderLength: newRowIds.length,
      flatRowOrder: this.flatRowOrder,
    })

    return true
  }

  /**
   * Confirm pending reorder operation (clear sort and execute reorder)
   */
  @action
  confirmPendingReorder(): boolean {
    if (!this.pendingReorder) {
      return false
    }

    const { fromIndex, toIndex } = this.pendingReorder

    // Clear sort first
    const sortBy = this.visualStateStore?.sortBy || []
    if (sortBy.length > 0 && this.visualStateStore) {
      this.visualStateStore.setSortBy([])
      log.info('✅ Sort cleared for manual reorder', {
        previousSort: sortBy.map((s) => `${s.field} ${s.direction}`),
      })
    }

    // Execute the reorder
    const success = this.executeReorder(fromIndex, toIndex)

    // Clear pending state
    this.pendingReorder = null

    return success
  }

  /**
   * Cancel pending reorder operation
   */
  @action
  cancelPendingReorder(): void {
    this.pendingReorder = null
    log.info('❌ Reorder cancelled by user')
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
      const generatedColumns = await generateColumnsFromEntitySchema(
        this.entityType,
        this.schemaRegistry,
      )

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
        this.visualStateStore.initializeColumns(generatedColumns, this.entityType, orgId, userId)
        log.info('✅ Columns initialized in VisualStateStore', {
          entityType: this.entityType,
          columnCount: generatedColumns.length,
        })
      } else {
        log.warn('⚠️ VisualStateStore not available for column initialization', {
          entityType: this.entityType,
        })
      }

      log.info('✅ Schema loaded successfully', {
        entityType: this.entityType,
        columnCount: generatedColumns.length,
        hasCustomOptionReference: generatedColumns.some(
          (col) => col.type === 'custom_option_reference',
        ),
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'

      runInAction(() => {
        this.schemaError = `Schema loading failed: ${errorMessage}`
        this.isSchemaLoaded = false
      })

      log.error('💥 Schema loading failed', {
        entityType: this.entityType,
        error: errorMessage,
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

    // Reset version tracking
    this.dataVersion = 0
    this.configVersion = 0
    this.structureVersion = 0
    this.lastChangeMetadata = null

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
   * Update coordinator with current row order and clear selections
   */
  private updateCoordinatorWithCurrentRows(): void {
    if (!this.coordinateManager) return

    // Clear selections on row reorder (simpler UX, consistent with column ops)
    if (this.interactionStore) {
      this.interactionStore.clearSelection()
    }

    const rows = this.processedRows.map((row: any) => ({
      id: row.id || row.data?.id,
      data: row.data || row,
    }))

    this.coordinateManager.updateRows(rows as any, this.visualStateStore?.sortBy || [])

    log.info('🔄 Coordinator updated with row order (selection cleared)', {
      rowCount: rows.length,
    })
  }

  /**
   * @observable Grouping configuration
   */
  @observable grouping: any = null
}
