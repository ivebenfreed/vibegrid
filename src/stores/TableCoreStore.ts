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

import {
  action,
  computed,
  makeObservable,
  type ObservableMap,
  observable,
  reaction,
  runInAction,
  untracked,
} from 'mobx'
import { getActiveOrganizationId } from '@/app/stores/global/OrganizationStore'
import type { IStore } from '@/app/stores/types'
import { DisposerManager } from '@/app/stores/utils/disposer'
import { createEntityCollection } from '@/shared/data/db/collections/entity-collections'
import { getOrCreateEntityCollection } from '@/shared/data/db/collections/registry'
import { getLogger } from '@/shared/lib/logging'
import type { ObservableCoordinateManager } from '../coordinates/ObservableCoordinateManager'
import { GroupProcessor } from '../processors/GroupProcessor'
import { IncrementalRowProcessor, DEFAULT_CONFIG as INCREMENTAL_CONFIG } from '../processors/IncrementalRowProcessor'
import { processExpandedRows } from '../processors/RowExpansionProcessor'
import type { RowExpansionConfig } from '../types/row-expansion'
import type { Collection } from '@tanstack/db'
import type { Column, EntityRow, FilterConfig, GroupConfig, SchemaRegistryLike, SortConfig, VirtualRow } from '../types'
import type { HierarchyStore } from './HierarchyStore'
import { applyNestedFilters, applyTextSearch } from '../utils/filter-utils'
import { type ChangeMetadata, ChangeType, classifyChanges } from '../utils/change-classification'
import { createRowSnapshot, METADATA_COLUMNS, type RowSnapshot } from '../utils/hashing'
import { generateColumnsFromEntitySchema } from './column-generation'
import type { VisualStateStore } from './VisualStateStore'
import { GRID_DIMENSIONS } from '../constants/grid-dimensions'

const logger = getLogger(['vibegrid', 'stores', 'TableCoreStore'])

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
          return Array.isArray(filter.value) && (filter.value as unknown[]).includes(value)
        case 'not_in':
          return Array.isArray(filter.value) && !(filter.value as unknown[]).includes(value)
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

/**
 * Extract a sortable numeric value from a computed_decision_table object.
 * Sort order: fail (0-99) < pending (100) < pass (101-200), using score as sub-sort.
 */
function decisionTableSortValue(val: unknown): number {
  if (val == null || typeof val !== 'object') return 100 // pending
  const obj = val as Record<string, unknown>
  const score = typeof obj.score === 'number' ? obj.score : 0
  if (obj.status === 'pass' || obj.passed === true) return 101 + score
  if (obj.status === 'fail' || obj.passed === false) return score
  return 100 // pending
}

/**
 * Normalize a cell value for sorting. Objects with status/passed (decision tables)
 * are converted to a sortable number.
 */
function sortableValue(val: any): any {
  if (val != null && typeof val === 'object' && ('status' in val || 'passed' in val)) {
    return decisionTableSortValue(val)
  }
  return val
}

import { compareValues, isEmpty } from '../utils/sort-compare'

function applySorting(rows: any[], sortBy: SortConfig[]): any[] {
  if (!sortBy || sortBy.length === 0) return rows

  return [...rows].sort((a, b) => {
    for (const sort of sortBy) {
      const aVal = sortableValue(a.data ? a.data[sort.field] : a[sort.field])
      const bVal = sortableValue(b.data ? b.data[sort.field] : b[sort.field])

      const comparison = compareValues(aVal, bVal)
      if (comparison === 0) continue

      // Nulls always last: don't invert null-vs-value comparisons
      const aEmpty = isEmpty(aVal)
      const bEmpty = isEmpty(bVal)
      if (aEmpty || bEmpty) return comparison

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
  // GH#2361: Grid-level read-only override (viewer role → all columns non-editable)
  @observable readOnly: boolean = false
  @observable groupRowOrders: Record<string, GroupRowOrderConfig> = {}
  @observable flatRowOrder: string[] = []
  @observable isSchemaLoaded: boolean = false
  @observable schemaError: string | null = null

  // GH#1391: Configurable searchable columns for text search
  @observable.ref searchableColumns: string[] | undefined = undefined

  // Pending reorder confirmation (when sorting is active)
  @observable pendingReorder: PendingReorderOperation | null = null

  // Raw entity data (from TanStack DB)
  @observable private rawRows: EntityRow[] = []
  @observable private hasLoadedRows: boolean = false

  // Members data for UserReference fields (from TanStack DB membersCollection)
  @observable membersData: ObservableMap<string, any> = observable.map<string, any>()

  // Cached entity reference data keyed by target entity → entity id
  @observable entityReferenceData: ObservableMap<string, ObservableMap<string, any>> = observable.map<
    string,
    ObservableMap<string, any>
  >()

  // Track in-flight entity reference loads to avoid duplicate network calls
  private pendingEntityReferenceLoads = new Map<string, Promise<void>>()

  // GH#2651 P1.3: Cached relationship badge names keyed by
  // `${relationshipEntity}:${direction}:${anchorId}` → string[]
  // Populated by useBadgeListEnrichment React bridge; read synchronously by
  // badge-list-live DOM renderer.
  @observable relationshipBadgeData: ObservableMap<string, string[]> = observable.map<string, string[]>()

  // GH#2651: Tracks which (relationshipEntity:direction) pairs have completed
  // their first bridge pass. Allows the renderer to distinguish "not loaded yet"
  // (show '…') from "loaded but no edges for this anchor" (show '—').
  @observable relationshipBadgeReady: Set<string> = observable.set<string>()

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
  @observable badgeDataVersion: number = 0 // Increments on relationship badge data changes (GH#2651)

  // Change metadata for renderer routing
  @observable lastChangeMetadata: ChangeMetadata | null = null

  // ====================================
  // INCREMENTAL PROCESSING STATE (GH#1422)
  // ====================================

  /**
   * Incremental processing cache for large datasets
   * Contains progressively computed rows during background processing
   */
  @observable.shallow private incrementalCache: {
    rows: VirtualRow[]
    version: number
    isComplete: boolean
  } = {
    rows: [],
    version: 0,
    isComplete: true,
  }

  /** Processing progress (0-100%) for UI feedback */
  @observable processingProgress: number = 100

  /** Whether incremental processing is currently active */
  @observable isIncrementalProcessing: boolean = false

  /** Incremental row processor instance */
  private incrementalProcessor: IncrementalRowProcessor | null = null

  // ====================================
  // DEPENDENCIES (injected)
  // ====================================

  // biome-ignore lint/correctness/noUnusedPrivateClassMembers: Assigned via setVisualStateInputs()
  private visualStateInputs: VisualStateInputs | null = null
  private visualStateStore: VisualStateStore | null = null
  private hierarchyStore: HierarchyStore | null = null
  private entityDataProvider: EntityDataProvider | null = null
  private collection: Collection<any, any, any, any, any> | null = null // TanStack DB collection for entity mutations
  private schemaRegistry: SchemaRegistryLike | null = null
  private coordinateManager: ObservableCoordinateManager | null = null
  private interactionStore: import('./InteractionStore').InteractionStore | null = null

  /** GH#1240: Row expansion configuration */
  private rowExpansionConfig: RowExpansionConfig | null = null

  /** GH#1861: Additional columns to append after schema generation */
  private pendingAppendColumns: Column[] | null = null
  private disposers = new DisposerManager()
  private visualConfigDisposer: (() => void) | null = null

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
   * GH#1861: Set additional columns to merge after schema generation.
   * Must be called before init() so they're included in the initial column set,
   * preloadForColumns(), and VisualStateStore initialization.
   */
  setAppendColumns(columns: Column[]): void {
    this.pendingAppendColumns = columns
  }

  /**
   * GH#2361: Set grid-level read-only mode (e.g., viewer role).
   * Overrides column.editable to false for all columns.
   */
  @action
  setReadOnly(value: boolean): void {
    this.readOnly = value
    if (value && this.columns.length > 0) {
      for (const col of this.columns) {
        col.editable = false
      }
    }
  }

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
      this.setupVisualConfigReaction()
    }
  }

  private buildVisualConfigSnapshot(): string {
    if (!this.visualStateStore) return ''
    return JSON.stringify(
      {
        sortBy: this.visualStateStore.sortBy,
        filters: this.visualStateStore.filters,
        filterGroup: this.visualStateStore.filterGroup,
        groupConfig: this.visualStateStore.groupConfig,
      },
      (_key, value) => (value instanceof Set ? Array.from(value) : value),
    )
  }

  private setupVisualConfigReaction(): void {
    if (!this.visualStateStore) return

    if (this.visualConfigDisposer) {
      this.disposers.remove(this.visualConfigDisposer)
      this.visualConfigDisposer()
      this.visualConfigDisposer = null
    }

    this.visualConfigDisposer = reaction(
      () => this.buildVisualConfigSnapshot(),
      (snapshot) => {
        if (!snapshot) return

        this.incrementConfigVersion()
        logger.info('Visual config changed, configVersion bumped', {
          configVersion: this.configVersion,
          sortCount: this.visualStateStore?.sortBy.length ?? 0,
          filterCount: this.visualStateStore?.filters.length ?? 0,
          hasFilterGroup: !!this.visualStateStore?.filterGroup,
          groupFieldCount: this.visualStateStore?.groupConfig?.fields?.length ?? 0,
        })

        // GH#1422: Trigger incremental processing for large datasets
        // when visual config (sort/filter) changes
        if (this.rawRows.length >= INCREMENTAL_CONFIG.SYNC_THRESHOLD) {
          this.startIncrementalProcessing()
        }
      },
      { fireImmediately: false },
    )

    this.disposers.add(this.visualConfigDisposer)
  }

  /**
   * Set hierarchy store for hierarchical data display.
   * Called by parent component after store creation.
   */
  @action
  setHierarchyStore(store: HierarchyStore): void {
    this.hierarchyStore = store
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
  setCollection(collection: Collection<any, any, any, any, any>): void {
    this.collection = collection
    logger.info('TanStack DB collection set on TableCoreStore', {
      hasCollection: !!collection,
    })
  }

  /**
   * Set schema registry (for column generation)
   * Called by parent component after store creation
   */
  @action
  setSchemaRegistry(registry: SchemaRegistryLike): void {
    this.schemaRegistry = registry
  }

  /**
   * Set coordinate manager (for row position tracking)
   * Called by parent component after store creation
   */
  @action
  setCoordinateManager(manager: ObservableCoordinateManager): void {
    this.coordinateManager = manager
    logger.info('ObservableCoordinateManager set on TableCoreStore')
  }

  /**
   * Set interaction store (for clearing selections on row operations)
   */
  @action
  setInteractionStore(store: import('./InteractionStore').InteractionStore): void {
    this.interactionStore = store
    logger.info('Interaction store set on TableCoreStore')
  }

  /**
   * Set row expansion config (GH#1240)
   */
  @action
  setRowExpansionConfig(config: RowExpansionConfig | null): void {
    this.rowExpansionConfig = config
    logger.info('Row expansion config set on TableCoreStore', { enabled: config?.enabled })
  }

  /**
   * Get row expansion config (GH#1240)
   */
  getRowExpansionConfig(): RowExpansionConfig | null {
    return this.rowExpansionConfig
  }

  /**
   * Set searchable columns for text search (GH#1391)
   * When undefined, applyTextSearch will use isTextType() to determine searchable columns
   */
  @action
  setSearchableColumns(columns: string[] | undefined): void {
    this.searchableColumns = columns
    logger.info('Searchable columns set on TableCoreStore', {
      columns,
      hasCustomColumns: columns !== undefined,
    })
  }

  /**
   * Set raw entity rows directly (simplified interface for Day 7)
   * TODO (Day 10): Migrate to full entity data provider pattern
   */
  @action
  setRows<T extends EntityRow>(rows: T[]): void {
    // Step 1: Detect changes with loop-back protection
    const changedCells = this.detectChangedCells(rows)

    // Step 2: Check structural changes
    const newRowCount = rows.length
    const prevRowCount = this.rawRows.length
    const countChanged = newRowCount !== prevRowCount
    const firstMismatchIdx = countChanged ? -1 : rows.findIndex((r, i) => r.id !== this.rawRows[i]?.id)
    const structuralChange = countChanged || firstMismatchIdx !== -1

    // Step 3: Check sorting sensitivity
    const sortingSensitive = this.checkSortingFields(changedCells)

    // Step 4: Classify changes
    const metadata = classifyChanges(changedCells, sortingSensitive, structuralChange)

    // Step 5: Route based on classification
    if (metadata.type === ChangeType.NONE) {
      logger.debug('⏭️ Guard 1: No-op detected', {
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
      logger.info('📊 Structural change', { structureVersion: this.structureVersion })
      return
    }

    if (metadata.sortingSensitive) {
      this.configVersion++
      this.rawRows = rows
      this.hasLoadedRows = true
      // Clear metadata (will trigger full render)
      this.lastChangedCells.clear()
      this.lastChangeMetadata = null
      logger.info('🔄 Sorting-sensitive change', { configVersion: this.configVersion })
      return
    }

    // Cell-only change
    this.dataVersion++
    this.rawRows = rows
    this.hasLoadedRows = true
    this.lastChangedCells = changedCells
    this.lastChangeMetadata = metadata // Keep for renderer
    logger.info('📝 Cell-only change', {
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
    logger.info('📋 Config version incremented (external trigger)', {
      configVersion: this.configVersion,
    })
  }

  /**
   * Set members data for UserReference fields
   * Called from React hook with useLiveQuery results
   */
  @action
  setMembersData(members: Array<{ user_id?: string; user?: Record<string, unknown>; [key: string]: unknown }>): void {
    this.membersData.clear()
    members.forEach((member) => {
      if (member.user_id && member.user) {
        this.membersData.set(member.user_id, member.user)
      }
    })
    logger.debug('👥 Members data updated', {
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
    logger.debug('🎯 [BASELINE] Initializing baseline snapshot', {
      hasColumns: this.columns.length > 0,
      hasRows: this.rawRows.length > 0,
      previousSnapshotSize: this.previousRowsSnapshot.size,
    })

    if (this.columns.length > 0 && this.rawRows.length > 0 && this.previousRowsSnapshot.size === 0) {
      // Force baseline creation by calling setRows with current data
      // This will trigger detectChangedCells which will create the baseline
      const currentRows = this.rawRows.slice()
      this.setRows(currentRows)
      logger.info('✅ [BASELINE] Baseline snapshot created', {
        snapshotSize: this.previousRowsSnapshot.size,
      })
    } else {
      logger.debug('⏭️ [BASELINE] Skipping - preconditions not met or baseline already exists', {
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

    logger.debug('🔍 DEBUG: detectChangedCells START', {
      newRowsCount: newRows.length,
      prevSnapshotSize: this.previousRowsSnapshot.size,
      columnsCount: this.columns.length,
    })

    // Skip change detection if columns not loaded yet
    // This prevents creating invalid snapshots with empty columnHashes
    if (this.columns.length === 0) {
      logger.debug('⏭️ Skipping change detection - columns not loaded yet')
      return changedCells
    }

    // Build new snapshot with per-column hashing
    const newSnapshot = new Map(newRows.map((row) => [row.id, createRowSnapshot(row, this.columns)]))

    // Initialize baseline snapshot if empty (columns loaded but no previous snapshot)
    if (this.previousRowsSnapshot.size === 0 && newSnapshot.size > 0) {
      logger.info('🔄 Creating initial baseline snapshot', {
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
      // Server echo returns same data with only metadata (updatedAt) changed
      // By comparing dataHash (excludes metadata), we skip redundant updates
      if (newSnap.dataHash === oldSnap.dataHash) {
        // Only metadata changed - skip this row entirely
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
            logger.debug('🔍 DEBUG: Cell change detected', {
              rowId: rowId.substring(0, 8),
              columnId,
              cellType: column?.cellType,
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

    logger.debug('🔍 DEBUG: Updated previousRowsSnapshot', {
      snapshotSize: this.previousRowsSnapshot.size,
      firstRowId: Array.from(this.previousRowsSnapshot.keys())[0]?.substring(0, 8),
    })

    // Store stats for optimization checks
    const totalCellsChanged = Array.from(changedCells.values()).reduce((sum, cols) => sum + cols.size, 0)

    this.lastChangeStats = {
      rowsChanged: changedCells.size,
      totalCellsChanged,
    }

    logger.info('📊 Change detection complete', {
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
  setEntityReferenceRecord(targetEntity: string, entityId: string, data: Record<string, unknown>): void {
    const map = this.getOrCreateEntityReferenceMap(targetEntity)
    map.set(entityId, data)
  }

  /**
   * GH#2651 P1.3: Read cached relationship badge names for a given anchor.
   * Returns `undefined` on cache miss (renderer shows loading placeholder).
   */
  getRelationshipBadges(
    relationshipEntity: string,
    direction: 'source' | 'target',
    anchorId: string,
  ): string[] | undefined {
    const key = `${(relationshipEntity || '').toLowerCase()}:${direction}:${anchorId}`
    return this.relationshipBadgeData.get(key)
  }

  /**
   * GH#2651 P1.3: Write relationship badge names from the React bridge.
   * MobX observable update triggers DOM renderer re-render via reaction.
   *
   * NOTE: Prefer setRelationshipBadgesBulk for multi-anchor writes (GH#2758).
   * Each call here bumps badgeDataVersion, which triggers a full grid repaint
   * via ObserverManager.createDataObserver — calling this in a loop produces N
   * full repaints. Single-key callers (real-time edits) can use this safely;
   * bridge fan-out must batch.
   */
  @action
  setRelationshipBadges(
    relationshipEntity: string,
    direction: 'source' | 'target',
    anchorId: string,
    names: string[],
  ): void {
    const key = `${(relationshipEntity || '').toLowerCase()}:${direction}:${anchorId}`
    this.relationshipBadgeData.set(key, names)
    this.badgeDataVersion++
  }

  /**
   * GH#2758: Batched relationship badge writes — one MobX transaction, one
   * badgeDataVersion bump regardless of how many anchors are written.
   *
   * Use this from the bridge effect when populating dozens-to-thousands of
   * anchors per pass. Without batching, each per-anchor write triggers a full
   * grid repaint reaction (ObserverManager.createDataObserver observes
   * badgeDataVersion), producing main-thread saturation that surfaces as the
   * Chrome "Page Unresponsive" dialog on wide DEB Project grids.
   *
   * @param entries Iterable of { relationshipEntity, direction, anchorId, names }
   */
  @action
  setRelationshipBadgesBulk(
    entries: Iterable<{
      relationshipEntity: string
      direction: 'source' | 'target'
      anchorId: string
      names: string[]
    }>,
  ): void {
    let touched = 0
    for (const { relationshipEntity, direction, anchorId, names } of entries) {
      const key = `${(relationshipEntity || '').toLowerCase()}:${direction}:${anchorId}`
      this.relationshipBadgeData.set(key, names)
      touched++
    }
    if (touched > 0) {
      this.badgeDataVersion++
    }
  }

  /**
   * GH#2651: Mark a (relationshipEntity, direction) pair as ready — the bridge
   * has completed at least one pass. Anchors not in relationshipBadgeData after
   * this point genuinely have zero edges (render '—') rather than being
   * "still loading" (render '…').
   */
  @action
  markRelationshipBadgesReady(relationshipEntity: string, direction: 'source' | 'target'): void {
    const key = `${(relationshipEntity || '').toLowerCase()}:${direction}`
    this.relationshipBadgeReady.add(key)
    this.badgeDataVersion++
  }

  /**
   * GH#2651: Check if a (relationshipEntity, direction) pair has completed
   * its initial bridge pass.
   */
  isRelationshipBadgesReady(relationshipEntity: string, direction: 'source' | 'target'): boolean {
    const key = `${(relationshipEntity || '').toLowerCase()}:${direction}`
    return this.relationshipBadgeReady.has(key)
  }

  async ensureEntityReferenceRecord(targetEntity: string, entityId: string, loader?: () => Promise<any>): Promise<any> {
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
    logger.debug('Entity reference ensure completed', {
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
        logger.debug('Entity reference record loaded from collection', {
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
          logger.debug('Entity reference record loaded via fallback loader', {
            targetEntity,
            entityId,
          })
          return
        }
      }

      logger.debug('Entity reference record could not be loaded', {
        targetEntity,
        entityId,
      })
    } catch (error) {
      logger.error('Failed to load entity reference record', {
        targetEntity,
        entityId,
        error,
      })
    } finally {
      this.pendingEntityReferenceLoads.delete(loadKey)
    }
  }

  private async loadFromEntityCollection(targetEntity: string, entityId: string): Promise<any | null> {
    try {
      const orgId = this.visualStateStore?.orgId || getActiveOrganizationId()
      if (!orgId) {
        logger.debug('Entity reference collection load skipped - no orgId', {
          targetEntity,
          entityId,
        })
        return null
      }

      if (!targetEntity) {
        logger.debug('Entity reference collection load skipped - unknown target entity', {
          entityId,
        })
        return null
      }

      const normalizedEntity = targetEntity

      const collection = getOrCreateEntityCollection(normalizedEntity, orgId, createEntityCollection)

      await collection.preload()
      const record = collection.get(entityId)
      if (record) {
        logger.debug('Entity reference record found in TanStack collection', {
          targetEntity: normalizedEntity,
          entityId,
        })
        return record
      }

      return null
    } catch (error) {
      logger.debug('Entity reference collection load failed, will fall back to loader', {
        targetEntity,
        entityId,
        error,
      })
      return null
    }
  }

  // ====================================
  // COMPUTED VALUES - DATA PROCESSING PIPELINE
  // ====================================

  /**
   * Get base rows for the pipeline (handles rawRows vs entityDataProvider fallback)
   * This is the source for searchFilteredRows
   */
  private get baseRows(): any[] {
    if (!this.isSchemaLoaded || !this.hasLoadedRows) {
      return []
    }

    // Use raw rows if available (simplified Day 7 approach)
    if (this.rawRows.length > 0) {
      return this.rawRows
    }

    // Fallback to entity data provider (future full implementation)
    if (this.entityDataProvider) {
      const data = this.entityDataProvider.getEntityData() || {}
      return Object.values(data)
    }

    return []
  }

  /**
   * Stage 0.5: Search-filtered rows (GH#1391: Smart Text Search)
   * Applies global search text BEFORE FilterGroup filtering
   *
   * Pipeline: baseRows → searchFilteredRows → filteredRows (FilterGroup) → sortedRows
   */
  @computed
  get searchFilteredRows(): any[] {
    const rows = this.baseRows
    if (rows.length === 0) return rows

    const searchText = this.visualStateStore?.globalSearchText || ''
    if (!searchText.trim()) return rows

    return applyTextSearch(rows, searchText, this.columns, this.searchableColumns)
  }

  /**
   * Stage 1: Filtered rows
   * Applies filter configuration to search-filtered rows
   * Supports both legacy FilterConfig[] and new FilterGroup
   *
   * Pipeline: baseRows → searchFilteredRows → filteredRows (FilterGroup) → sortedRows
   */
  @computed
  get filteredRows(): any[] {
    // Start from search-filtered rows (GH#1391)
    let rows = this.searchFilteredRows
    if (rows.length === 0) return rows

    // Apply legacy filters first (for backward compatibility)
    const filters = this.visualStateStore?.filters || []
    if (filters.length > 0) {
      rows = applyFilters(rows, filters)
    }

    // Then apply nested filterGroup (GH#216: Multi-Level Advanced Filtering)
    const filterGroup = this.visualStateStore?.filterGroup || null
    rows = applyNestedFilters(rows, filterGroup)

    return rows
  }

  /**
   * Stage 2: Sorted rows
   * Applies sorting configuration to filtered rows
   */
  @computed
  get sortedRows(): any[] {
    const sortBy = this.visualStateStore?.sortBy || []
    if (sortBy.length === 0) {
      return this.filteredRows
    }

    return applySorting(this.filteredRows, sortBy)
  }

  /**
   * Stage 3: Grouped or ordered rows
   * Applies grouping or flat row ordering to sorted rows
   */
  @computed
  get groupedOrOrderedRows(): any[] {
    // Apply hierarchy if active (takes precedence over grouping)
    if (this.hierarchyStore?.isHierarchyActive) {
      const hierarchyRows = this.hierarchyStore.flattenedHierarchy
      if (hierarchyRows.length > 0) {
        logger.debug('Using hierarchical rows', { count: hierarchyRows.length })
        return hierarchyRows
      }
    }

    const groupConfig = this.visualStateStore?.groupConfig || null

    // Apply grouping if configured
    if (groupConfig && groupConfig.fields && groupConfig.fields.length > 0) {
      const groupResult = GroupProcessor.processData(this.sortedRows, this.columns, groupConfig, this.groupRowOrders)
      return groupResult.virtualRows
    }

    // Apply flat row ordering if no grouping and no sorting
    const hasSorting = (this.visualStateStore?.sortBy || []).length > 0
    if (!hasSorting && this.flatRowOrder.length > 0) {
      return applyFlatRowOrdering(this.sortedRows, this.flatRowOrder)
    }

    return this.sortedRows
  }

  /**
   * Stage 4: Processed rows (final output)
   * Wraps rows in VirtualRow structure for renderer consumption
   * This is the main data processing pipeline output
   *
   * GH#1422: For large datasets (>1000 rows), uses incremental processing
   * to avoid blocking the main thread during sort/filter operations.
   *
   * keepAlive: true ensures this computed stays cached even when not observed by reactions.
   * This prevents suspension and recomputation on every access from other computeds (e.g., rowOffsets).
   */
  @computed({ keepAlive: true })
  get processedRows(): any[] {
    if (!this.isSchemaLoaded) {
      return []
    }

    if (!this.hasLoadedRows) {
      return []
    }

    // GH#1422: Check if we should use incremental cache for large datasets
    // When incremental processing is active, return the cached rows
    // (which may be partial during processing)
    const rawRowCount = this.rawRows.length
    const useIncremental = rawRowCount >= INCREMENTAL_CONFIG.SYNC_THRESHOLD && !this.hasGrouping && !this.hasHierarchy

    if (useIncremental && this.isIncrementalProcessing) {
      // Return incremental cache while processing is in progress
      // The cache is progressively updated by the background processor
      logger.debug('📊 processedRows: Using incremental cache', {
        cacheRowCount: this.incrementalCache.rows.length,
        isComplete: this.incrementalCache.isComplete,
        progress: this.processingProgress,
      })
      return this.applyRowExpansion(this.incrementalCache.rows)
    }

    // Standard synchronous path for small datasets or when grouping/hierarchy is active
    const rows = this.groupedOrOrderedRows

    // If rows are already VirtualRows (from grouping), use as-is
    let virtualRows: any[]
    if (rows.length > 0 && 'type' in rows[0]) {
      virtualRows = rows
    } else {
      // Wrap flat rows in VirtualRow structure for consistency
      // BodyRenderer.createCellElement expects rows with { type, id, index, height, data } structure
      virtualRows = rows.map((row, index) => ({
        type: 'data' as const,
        id: row.id,
        index,
        dataIndex: index, // For data-only rows, dataIndex === index (no expanded-content rows yet)
        height: row.height || GRID_DIMENSIONS.ROW_HEIGHT, // Preserve variable row heights, default to 40
        data: row,
      }))
    }

    return this.applyRowExpansion(virtualRows)
  }

  /**
   * GH#1422: Check if grouping is currently active
   */
  @computed
  private get hasGrouping(): boolean {
    const groupConfig = this.visualStateStore?.groupConfig
    return !!(groupConfig && groupConfig.fields && groupConfig.fields.length > 0)
  }

  /**
   * GH#1422: Check if hierarchy is currently active
   */
  @computed
  private get hasHierarchy(): boolean {
    return !!this.hierarchyStore?.isHierarchyActive
  }

  /**
   * GH#1422: Apply row expansion processing (extracted for reuse)
   */
  private applyRowExpansion(virtualRows: any[]): any[] {
    // GH#1240: Process row expansion if enabled
    // CRITICAL: Access expansionVersion FIRST to ensure MobX tracks it as a dependency
    // This forces processedRows to recompute when expansion state changes
    const interactionStore = this.interactionStore
    const expansionVersion = interactionStore?.expansionVersion ?? 0
    const expansionConfig = this.rowExpansionConfig
    const expandedRowIds = interactionStore?.expandedRowIds ?? new Set<string>()
    const expandedRowStates = interactionStore?.expandedRowStates ?? new Map()

    logger.debug('📊 processedRows expansion check', {
      hasInteractionStore: !!interactionStore,
      hasExpansionConfig: !!expansionConfig,
      expansionEnabled: expansionConfig?.enabled,
      expansionVersion, // Track version to ensure MobX dependency
      expandedCount: expandedRowIds.size,
    })

    if (expansionConfig?.enabled && expandedRowIds.size > 0) {
      logger.debug('🔄 Processing expanded rows', {
        expandedCount: expandedRowIds.size,
        rowCount: virtualRows.length,
      })
      virtualRows = processExpandedRows(virtualRows, expandedRowIds, expandedRowStates, expansionConfig)
    }

    return virtualRows
  }

  // ====================================
  // COMPUTED HELPERS
  // ====================================

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
          logger.info('🔄 Sorting-sensitive field changed', {
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
   *
   * keepAlive: true ensures this computed stays cached for efficient virtual scrolling.
   * Prevents recomputation on every scroll frame.
   */
  @computed({ keepAlive: true })
  get rowOffsets(): number[] {
    const rows = this.processedRows
    const offsets: number[] = [0]

    for (let i = 0; i < rows.length; i++) {
      const prevOffset = offsets[i]
      const rowHeight = rows[i]?.height || GRID_DIMENSIONS.ROW_HEIGHT
      offsets.push(prevOffset + rowHeight)
    }

    return offsets
  }

  /**
   * Find row index at given scroll position using binary search
   *
   * NOTE: Uses untracked() to prevent MobX from tracking rowOffsets access.
   * Without this, visibleRowRange → findRowAtScrollPosition → rowOffsets → processedRows
   * creates a dependency chain that causes processedRows to recompute on every scroll.
   *
   * The trade-off: If row heights change, visibleRowRange won't automatically update.
   * This is acceptable because:
   * 1. Row height changes trigger the data observer which calls renderBody()
   * 2. renderBody() directly accesses visibleRowRange, ensuring correct rendering
   */
  findRowAtScrollPosition(scrollTop: number): number {
    // Use untracked to prevent cascade recomputation of processedRows on scroll
    const offsets = untracked(() => this.rowOffsets)
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

    // Increment config version to trigger renderer update
    this.configVersion++

    logger.info('🔄 Group row order set', {
      groupId,
      rowCount: rowIds.length,
      configVersion: this.configVersion,
    })
  }

  /**
   * Move row within a group by index
   */
  @action
  moveRowInGroupByIndex(groupId: string, fromIndex: number, toIndex: number): boolean {
    const groupOrder = this.groupRowOrders[groupId]

    if (!groupOrder) {
      logger.warn('⚠️ No group order found for drag operation', { groupId })
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

    // Increment config version to trigger renderer update
    this.configVersion++

    logger.info('🔄 Row moved within group', {
      groupId,
      fromIndex,
      toIndex,
      movedRowId,
      configVersion: this.configVersion,
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
    logger.info('🗑️ All group row orders cleared')
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
    logger.info('🔧 moveRowInGroup called', {
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
        logger.error('❌ Invalid processedRows when creating group order', {
          processedRows: typeof processedRows,
          sourceGroupId,
        })
        return false
      }

      const groupRows = processedRows.filter(
        (row) => row && row.type === 'data' && (row.groupId === sourceGroupId || row.parentGroupId === sourceGroupId),
      )
      const initialOrder = groupRows.map((row) => row?.id).filter(Boolean)

      logger.info('🔍 Creating group order', {
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

      logger.info('🆕 Created initial group row order', {
        sourceGroupId,
        rowCount: initialOrder.length,
      })
    }

    // Find current position of the dragged row
    if (!groupOrder.rowIds || !Array.isArray(groupOrder.rowIds)) {
      logger.error('❌ Invalid groupOrder.rowIds', {
        sourceGroupId,
        groupOrder,
        rowIdsType: typeof groupOrder.rowIds,
      })
      return false
    }

    const currentIndex = groupOrder.rowIds.indexOf(draggedRowId)
    if (currentIndex === -1) {
      logger.warn('⚠️ Dragged row not found in group order', {
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
      logger.error('❌ Invalid newIndex for row move', {
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

      // Increment config version to trigger renderer update
      this.configVersion++

      // Update coordinator with new row order
      this.updateCoordinatorWithCurrentRows()

      logger.info('🔄 Row moved within group by ID', {
        sourceGroupId,
        draggedRowId,
        from: currentIndex,
        to: newIndex,
        newOrderLength: newRowIds.length,
        configVersion: this.configVersion,
      })

      return true
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      logger.error('❌ Error during array manipulation', {
        error: errorMessage,
        currentIndex,
        newIndex,
        rowIdsLength: groupOrder.rowIds.length,
      })
      return false
    }
  }

  private decodeGroupKey(groupKey: string): any {
    if (groupKey === '__null__') {
      return null
    }

    if (groupKey.startsWith('{') || groupKey.startsWith('[')) {
      try {
        return JSON.parse(groupKey)
      } catch {
        return groupKey
      }
    }

    return groupKey
  }

  private splitGroupId(groupId: string): { baseId: string; parentGroupId: string | null } {
    const parentMarker = groupId.lastIndexOf('_group_')
    if (parentMarker === -1) {
      return { baseId: groupId, parentGroupId: null }
    }

    return {
      baseId: groupId.slice(0, parentMarker),
      parentGroupId: groupId.slice(parentMarker + 1),
    }
  }

  private parseGroupIdForMove(
    groupId: string,
  ): { field: string; value: any; groupKey: string; parentGroupId: string | null } | null {
    if (!groupId.startsWith('group_')) {
      logger.warn('🔍 Could not parse group ID (missing prefix)', { groupId })
      return null
    }

    const { baseId, parentGroupId } = this.splitGroupId(groupId)
    const groupFields = this.visualStateStore?.groupConfig?.fields?.map((field) => field.field).filter(Boolean) ?? []
    const orderedFields = groupFields.sort((a, b) => b.length - a.length)

    for (const fieldName of orderedFields) {
      const prefix = `group_${fieldName}_`
      if (!baseId.startsWith(prefix)) continue
      const groupKey = baseId.slice(prefix.length)
      return {
        field: fieldName,
        value: this.decodeGroupKey(groupKey),
        groupKey,
        parentGroupId,
      }
    }

    const fallbackMatch = baseId.match(/^group_([^_]+)_(.+)$/)
    if (!fallbackMatch) {
      logger.warn('🔍 Could not parse group ID', { groupId, baseId })
      return null
    }

    const groupKey = fallbackMatch[2]
    return {
      field: fallbackMatch[1],
      value: this.decodeGroupKey(groupKey),
      groupKey,
      parentGroupId,
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
    _newIndex: number,
  ): Promise<boolean> {
    const targetGroupInfo = this.parseGroupIdForMove(targetGroupId)
    const sourceGroupInfo = this.parseGroupIdForMove(sourceGroupId)

    if (!targetGroupInfo) {
      logger.error('❌ Invalid target group ID format', { targetGroupId })
      return false
    }

    const { field: fieldName, value: newValue } = targetGroupInfo

    if (!this.collection) {
      logger.error('❌ TanStack DB collection not available for cross-group move', {
        hint: 'Call setCollection() before performing cross-group moves',
      })
      return false
    }

    // Update the actual row data using TanStack DB collection
    try {
      const recordKey = String(draggedRowId)
      let collectionReady = false
      let recordSnapshot: any = null

      try {
        collectionReady = this.collection.isReady?.() ?? false
        if (!collectionReady && this.collection.stateWhenReady) {
          await this.collection.stateWhenReady()
          collectionReady = this.collection.isReady?.() ?? collectionReady
        }
        recordSnapshot = this.collection.state?.get(recordKey) ?? null
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        logger.warn('⚠️ Failed to read collection state before cross-group move', {
          draggedRowId,
          recordKey,
          fieldName,
          targetGroupId,
          sourceGroupId,
          error: errorMessage,
        })
      }

      const updateData = { [fieldName]: newValue }
      logger.debug('🧭 Cross-group move update prepared', {
        draggedRowId,
        recordKey,
        fieldName,
        oldValue: sourceGroupInfo?.value,
        newValue,
        sourceGroupId,
        targetGroupId,
        sourceGroupInfo,
        targetGroupInfo,
        targetGroupKey: targetGroupInfo.groupKey,
        targetParentGroupId: targetGroupInfo.parentGroupId,
        collectionReady,
        collectionSize: this.collection.state?.size ?? null,
        hasRecord: !!recordSnapshot,
        currentValue: recordSnapshot?.[fieldName],
      })

      // Use TanStack DB collection's update method with optimistic updates
      const tx = this.collection.update(recordKey, (draft: any) => {
        if (!draft) {
          throw new Error('Record not found in collection state')
        }
        draft[fieldName] = newValue
        draft.updatedAt = new Date().toISOString()
      })

      const persisted = tx?.isPersisted?.promise
      await (persisted && typeof persisted.then === 'function' ? persisted : Promise.resolve(tx))

      logger.info('🔄 Cross-group move completed via field update', {
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
      const recordKey = String(draggedRowId)
      const recordSnapshot = this.collection?.state?.get(recordKey) ?? null

      logger.error('❌ Failed to update row field for cross-group move', {
        draggedRowId,
        recordKey,
        fieldName,
        newValue,
        entityType: this.entityType,
        updateData: { [fieldName]: newValue },
        sourceGroupId,
        targetGroupId,
        sourceGroupInfo,
        targetGroupInfo,
        collectionReady: this.collection?.isReady?.() ?? null,
        collectionSize: this.collection?.state?.size ?? null,
        hasRecord: !!recordSnapshot,
        currentValue: recordSnapshot?.[fieldName],
        error: errorMessage,
        errorStack: error instanceof Error ? error.stack : undefined,
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

    // Increment config version to trigger renderer update
    this.configVersion++

    // Update coordinator with new row order
    this.updateCoordinatorWithCurrentRows()

    logger.info('🔄 Flat row order set', {
      rowCount: rowIds.length,
      configVersion: this.configVersion,
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
        logger.info('⏸️ Reorder pending confirmation (sorting active)', {
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
      logger.error('Error moving row in flat data:', { errorMessage })
      return false
    }
  }

  /**
   * Execute the reorder operation (called after confirmation or when no sorting is active)
   */
  @action
  private executeReorder(fromIndex: number, toIndex: number): boolean {
    const processedRows = this.processedRows
    if (fromIndex < 0 || fromIndex >= processedRows.length || toIndex < 0 || toIndex >= processedRows.length) {
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

    // Increment config version to trigger renderer update
    this.configVersion++

    // Update coordinator with new row order
    this.updateCoordinatorWithCurrentRows()

    logger.info('🔄 Flat row order updated', {
      from: fromIndex,
      to: toIndex,
      movedRowId,
      newOrderLength: newRowIds.length,
      configVersion: this.configVersion,
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
      logger.info('✅ Sort cleared for manual reorder', {
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
    logger.info('❌ Reorder cancelled by user')
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
    logger.info('🗑️ Flat row order cleared')
  }

  /**
   * Toggle group expansion state
   * Delegates to visual state store
   */
  toggleGroupExpansion(groupId: string): void {
    logger.info('🎯 Group expansion toggle - should be handled by visual state', { groupId })
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
    logger.debug('Initializing TableCoreStore...', { entityType: this.entityType })

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

      // GH#1861: Merge appended columns (e.g., linked entity fields) into the
      // initial column set so they're available for preloadForColumns() and
      // VisualStateStore initialization — no post-init useEffect needed.
      let allColumns = generatedColumns
      if (this.pendingAppendColumns?.length) {
        const existingIds = new Set(generatedColumns.map((c) => c.id))
        const newColumns = this.pendingAppendColumns.filter((c) => !existingIds.has(c.id))
        if (newColumns.length > 0) {
          allColumns = [...generatedColumns, ...newColumns]
        }
        this.pendingAppendColumns = null
      }

      runInAction(() => {
        this.columns = allColumns
        // GH#2361: Apply read-only override after columns are set
        if (this.readOnly) {
          for (const col of allColumns) {
            col.editable = false
          }
        }
        this.isSchemaLoaded = true
        this.schemaError = null
      })

      // 🚀 Initialize columns in VisualStateStore
      if (this.visualStateStore) {
        const orgId = this.visualStateStore.orgId || getActiveOrganizationId() || ''
        const userId = this.visualStateStore.userId || ''
        this.visualStateStore.initializeColumns(allColumns, this.entityType, orgId, userId)
        logger.info('✅ Columns initialized in VisualStateStore', {
          entityType: this.entityType,
          columnCount: allColumns.length,
        })
      } else {
        logger.warn('⚠️ VisualStateStore not available for column initialization', {
          entityType: this.entityType,
        })
      }

      logger.info('✅ Schema loaded successfully', {
        entityType: this.entityType,
        columnCount: generatedColumns.length,
        hasCustomOptionReference: generatedColumns.some((col) => col.type === 'custom_option_reference'),
      })

      // Phase 3: Removed manual keepAlive autoruns
      // processedRows and rowOffsets now use @computed({ keepAlive: true })
      // This is a cleaner, declarative approach that prevents suspension without manual observers
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'

      runInAction(() => {
        this.schemaError = `Schema loading failed: ${errorMessage}`
        this.isSchemaLoaded = false
      })

      logger.error('💥 Schema loading failed', {
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
    // GH#1422: Dispose incremental processor
    if (this.incrementalProcessor) {
      this.incrementalProcessor.dispose()
      this.incrementalProcessor = null
    }
    this.disposers.dispose()
    logger.debug('TableCoreStore disposed', { entityType: this.entityType })
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
    this.relationshipBadgeData.clear()
    this.relationshipBadgeReady.clear()

    // Clear change detection state
    this.previousRowsSnapshot.clear()
    this.lastChangedCells.clear()

    // Reset version tracking
    this.dataVersion = 0
    this.configVersion = 0
    this.structureVersion = 0
    this.badgeDataVersion = 0
    this.lastChangeMetadata = null

    // Reset searchable columns (GH#1391)
    this.searchableColumns = undefined

    // GH#1422: Reset incremental processing state
    if (this.incrementalProcessor) {
      this.incrementalProcessor.cancel()
    }
    this.incrementalCache = { rows: [], version: 0, isComplete: true }
    this.processingProgress = 100
    this.isIncrementalProcessing = false

    logger.info('🔄 TableCoreStore reset', { entityType: this.entityType })
  }

  // ====================================
  // INCREMENTAL PROCESSING (GH#1422)
  // ====================================

  /**
   * GH#1422: Start incremental processing for large datasets
   *
   * Called when:
   * 1. Raw rows are set and count >= SYNC_THRESHOLD
   * 2. Config version changes (sort/filter/group changes)
   *
   * @param viewportRange Optional viewport range for viewport-first processing
   */
  @action
  startIncrementalProcessing(viewportRange?: { start: number; end: number }): void {
    const rowCount = this.rawRows.length

    // Skip if not enough rows for incremental processing
    if (rowCount < INCREMENTAL_CONFIG.SYNC_THRESHOLD) {
      logger.debug('Skipping incremental processing - below threshold', {
        rowCount,
        threshold: INCREMENTAL_CONFIG.SYNC_THRESHOLD,
      })
      return
    }

    // Skip if grouping or hierarchy is active (not yet supported)
    if (this.hasGrouping || this.hasHierarchy) {
      logger.debug('Skipping incremental processing - grouping/hierarchy active')
      return
    }

    logger.info('🚀 Starting incremental processing', {
      rowCount,
      hasViewportRange: !!viewportRange,
    })

    // Initialize processor if needed
    if (!this.incrementalProcessor) {
      this.incrementalProcessor = new IncrementalRowProcessor({
        onViewportReady: (rows) => {
          runInAction(() => {
            this.incrementalCache = {
              rows,
              version: this.incrementalProcessor?.getVersion() ?? 0,
              isComplete: false,
            }
            this.processingProgress = this.incrementalProcessor?.getProgress() ?? 0
            logger.info('📊 Viewport ready (incremental)', { rowCount: rows.length })
          })
        },
        onBatchComplete: (rows, _startIndex, progress) => {
          runInAction(() => {
            this.incrementalCache = {
              rows,
              version: this.incrementalProcessor?.getVersion() ?? 0,
              isComplete: false,
            }
            this.processingProgress = progress
            logger.debug('📊 Batch complete (incremental)', {
              rowCount: rows.length,
              progress,
            })
          })
        },
        onComplete: (rows) => {
          runInAction(() => {
            this.incrementalCache = {
              rows,
              version: this.incrementalProcessor?.getVersion() ?? 0,
              isComplete: true,
            }
            this.processingProgress = 100
            this.isIncrementalProcessing = false
            logger.info('✅ Incremental processing complete', { rowCount: rows.length })
          })
        },
      })
    }

    // Mark as processing
    this.isIncrementalProcessing = true
    this.processingProgress = 0

    // Build pipeline config from current visual state
    const pipelineConfig = {
      searchText: this.visualStateStore?.globalSearchText || '',
      filters: this.visualStateStore?.filters || [],
      sortBy: this.visualStateStore?.sortBy || [],
      groupConfig: null, // Grouping not supported in incremental mode
      columns: this.columns,
      viewportRange,
      searchableColumns: this.searchableColumns,
    }

    // Start processing
    this.incrementalProcessor.start(this.rawRows, pipelineConfig)
  }

  /**
   * GH#1422: Cancel any active incremental processing
   */
  @action
  cancelIncrementalProcessing(): void {
    if (this.incrementalProcessor) {
      this.incrementalProcessor.cancel()
    }
    this.isIncrementalProcessing = false
    logger.debug('Incremental processing cancelled')
  }

  /**
   * GH#1422: Get incremental processing statistics
   */
  getIncrementalStats(): {
    isProcessing: boolean
    progress: number
    rowCount: number
    isComplete: boolean
  } {
    return {
      isProcessing: this.isIncrementalProcessing,
      progress: this.processingProgress,
      rowCount: this.incrementalCache.rows.length,
      isComplete: this.incrementalCache.isComplete,
    }
  }

  // ====================================
  // LEGACY/STUB METHODS (for type compatibility)
  // ====================================

  /**
   * @deprecated Stub method for type compatibility
   */
  insertRow(): void {
    logger.warn('insertRow() not implemented - legacy method stub')
  }

  /**
   * @deprecated Stub method for type compatibility
   */
  deleteRow(): void {
    logger.warn('deleteRow() not implemented - legacy method stub')
  }

  // GH#1827 P2: undo()/redo() stubs removed — handled by FocusAwareUndoRouter via CommandBus

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

    this.coordinateManager.updateRows(rows as any, this.visualStateStore?.sortBy || [], this.rowOffsets)

    logger.info('🔄 Coordinator updated with row order (selection cleared)', {
      rowCount: rows.length,
    })
  }

  /**
   * @observable Grouping configuration
   */
  @observable grouping: any = null

  /**
   * Readable state for agent context
   * JSON-serializable snapshot of current grid data state
   */
  @computed get readableState(): TableCoreReadableState {
    return {
      entityType: this.entityType,
      rowCount: this.processedRows.length,
      visibleRows: this.processedRows.slice(0, 50).map((row) => ({
        id: row.id,
        data: row.data,
      })),
      columns: this.columns.map((c) => ({
        fieldName: c.field ?? c.id,
        fieldType: c.cellType ?? 'text',
        displayName: c.name ?? c.label ?? c.title ?? c.id,
      })),
    }
  }
}

/**
 * Readable state interface for TableCoreStore
 */
export interface TableCoreReadableState {
  entityType: string
  rowCount: number
  visibleRows: Array<{ id: string; data: Record<string, unknown> }>
  columns: Array<{ fieldName: string; fieldType: string; displayName: string }>
}
