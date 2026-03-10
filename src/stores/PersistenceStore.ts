/**
 * PersistenceStore - VibeGrid Preferences Persistence (MobX)
 *
 * Migrated from simple-persistence.ts (Legend State → MobX)
 *
 * This store handles:
 * - Loading preferences from localStorage during init
 * - Auto-saving preferences when stores change (using MobX reaction)
 * - Debounced saves to prevent excessive localStorage writes
 * - Multi-tenant isolation (org-specific keys)
 *
 * Architecture:
 * - LOADING: Happens during init() before stores are hydrated
 * - SAVING: Happens via MobX reactions watching other stores
 * - This ensures loading happens BEFORE defaults are applied
 */

import { makeObservable, reaction, runInAction } from 'mobx'
import type { IStore } from '@/app/stores/types'
import { DisposerManager } from '@/app/stores/utils/disposer'
import { getLogger } from '@/shared/lib/logging'
import type { FilterConfig, GroupConfig, SortConfig } from '../types'
import type {
  GanttViewStore,
  ZoomLevel,
  GanttFieldMapping,
  GanttSortField,
  GanttSortDirection,
  GanttQuickFilter,
} from './GanttViewStore'
import type { InteractionStore } from './InteractionStore'
import type { GroupRowOrderConfig, TableCoreStore } from './TableCoreStore'
import type { ViewModeStore, ViewMode } from './ViewModeStore'
import type { VisualStateStore } from './VisualStateStore'

const logger = getLogger(['vibegrid', 'stores', 'PersistenceStore'])

// ====================================
// TYPES
// ====================================

/**
 * Serializable version of GroupConfig for persistence
 * Sets are converted to arrays for JSON serialization
 */
export interface SerializableGroupConfig {
  fields: Array<{ field: string; displayName: string }>
  sortBy: 'name' | 'count' | 'custom'
  sortDirection: 'asc' | 'desc'
  aggregations: Array<{
    field: string
    function: 'count' | 'sum' | 'avg' | 'min' | 'max' | 'unique'
    displayName?: string
  }>
  expandedGroups: string[] // Array instead of Set
  colorScheme?: 'auto' | 'none' | 'custom'
}

/**
 * Serializable date range filter (for JSON persistence)
 */
export interface SerializableDateRangeFilter {
  start: string | null // ISO date string
  end: string | null
}

/**
 * Gantt view preferences
 */
export interface GanttPreferences {
  zoomLevel: ZoomLevel
  cutoffWidth: number
  viewMode: ViewMode
  fieldMapping?: GanttFieldMapping
  // Gantt-specific sort/filter state (separate from table sort)
  ganttSortField?: GanttSortField
  ganttSortDirection?: GanttSortDirection
  activeQuickFilter?: GanttQuickFilter
  dateRangeFilter?: SerializableDateRangeFilter
}

/**
 * Complete persisted preferences structure
 */
export interface VibeGridPreferences {
  // Column layout
  columnWidths: Record<string, number>
  columnOrder: string[]
  columnVisibility: Record<string, boolean>
  frozenColumns: Record<string, boolean>

  // Data display
  sortBy: SortConfig[]
  filters: FilterConfig[]

  // Grouping configuration
  groupConfig: SerializableGroupConfig | null

  // Row ordering state
  groupRowOrders: Record<string, GroupRowOrderConfig>
  flatRowOrder: string[]

  // Gantt preferences
  gantt?: GanttPreferences

  // Metadata
  entityType: string
  lastUpdated: string
}

// ====================================
// PERSISTENCE STORE
// ====================================

export class PersistenceStore implements IStore {
  // ====================================
  // DEPENDENCIES (injected)
  // ====================================

  private tableCoreStore: TableCoreStore | null = null
  private visualStateStore: VisualStateStore | null = null
  // biome-ignore lint/correctness/noUnusedPrivateClassMembers: Assigned via setInteractionStore()
  private interactionStore: InteractionStore | null = null
  private ganttViewStore: GanttViewStore | null = null
  private viewModeStore: ViewModeStore | null = null

  private entityType: string
  // biome-ignore lint/correctness/noUnusedPrivateClassMembers: Assigned in constructor
  private orgId?: string
  private storageKey: string
  private disposers = new DisposerManager()

  // Debounce timer for saves
  private saveTimer: NodeJS.Timeout | null = null
  private readonly SAVE_DEBOUNCE_MS = 1000 // 1 second debounce

  // ====================================
  // CONSTRUCTOR
  // ====================================

  constructor(entityType: string, orgId?: string) {
    this.entityType = entityType
    this.orgId = orgId

    // Normalize entityType to URL format for consistent localStorage keys
    const normalizedEntityType = this.normalizeEntityType(entityType)
    this.storageKey = orgId
      ? `vibegrid-simple-${orgId}_${normalizedEntityType}`
      : `vibegrid-simple-${normalizedEntityType}`

    makeObservable(this)

    logger.info('🎯 PersistenceStore created', {
      entityType,
      normalizedEntityType,
      orgId,
      storageKey: this.storageKey,
    })
  }

  // ====================================
  // DEPENDENCY INJECTION
  // ====================================

  setTableCoreStore(store: TableCoreStore): void {
    this.tableCoreStore = store
  }

  setVisualStateStore(store: VisualStateStore): void {
    this.visualStateStore = store
  }

  setInteractionStore(store: InteractionStore): void {
    this.interactionStore = store
  }

  setGanttViewStore(store: GanttViewStore): void {
    this.ganttViewStore = store
  }

  setViewModeStore(store: ViewModeStore): void {
    this.viewModeStore = store
  }

  // ====================================
  // ISTORE LIFECYCLE
  // ====================================

  /**
   * Initialize - Load saved preferences from localStorage
   * CRITICAL: This must happen BEFORE defaults are applied in other stores
   */
  async init(): Promise<void> {
    logger.info('🔄 Initializing PersistenceStore...', {
      entityType: this.entityType,
      storageKey: this.storageKey,
    })

    // Load preferences from localStorage
    const saved = this.loadFromStorage()

    if (saved) {
      logger.info('✅ Loaded saved preferences', {
        entityType: this.entityType,
        hasColumnWidths: Object.keys(saved.columnWidths || {}).length > 0,
        hasColumnOrder: (saved.columnOrder || []).length > 0,
        hasColumnVisibility: Object.keys(saved.columnVisibility || {}).length > 0,
        hasSortBy: (saved.sortBy || []).length > 0,
        hasFilters: (saved.filters || []).length > 0,
        hasGroupConfig: !!saved.groupConfig,
        hasGroupRowOrders: Object.keys(saved.groupRowOrders || {}).length > 0,
        hasFlatRowOrder: (saved.flatRowOrder || []).length > 0,
      })

      // Apply loaded preferences to stores
      this.applyLoadedPreferences(saved)
    } else {
      logger.info('ℹ️ No saved preferences found', {
        entityType: this.entityType,
        storageKey: this.storageKey,
      })
    }

    // Set up auto-save reactions
    this.setupAutoSave()

    logger.info('✅ PersistenceStore initialized', {
      entityType: this.entityType,
    })
  }

  /**
   * Cleanup - Clear reactions and timers
   */
  dispose(): void {
    // Cancel pending saves
    if (this.saveTimer) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
    }

    // Dispose all reactions
    this.disposers.dispose()

    logger.info('🧹 PersistenceStore disposed', {
      entityType: this.entityType,
    })
  }

  /**
   * Reset - Clear all persisted data
   */
  reset(): void {
    try {
      localStorage.removeItem(this.storageKey)
      logger.info('🔄 Persistence reset', {
        entityType: this.entityType,
        storageKey: this.storageKey,
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      logger.error('❌ Failed to reset persistence', {
        entityType: this.entityType,
        error: errorMessage,
      })
    }
  }

  // ====================================
  // LOADING LOGIC
  // ====================================

  /**
   * Load preferences from localStorage
   */
  private loadFromStorage(): VibeGridPreferences | null {
    try {
      const stored = localStorage.getItem(this.storageKey)
      if (!stored) {
        return null
      }

      const parsed = JSON.parse(stored) as VibeGridPreferences
      return this.validatePreferences(parsed)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      logger.error('❌ Failed to load preferences from localStorage', {
        entityType: this.entityType,
        storageKey: this.storageKey,
        error: errorMessage,
      })
      return null
    }
  }

  /**
   * Validate and sanitize loaded preferences
   */
  private validatePreferences(prefs: any): VibeGridPreferences | null {
    if (!prefs || typeof prefs !== 'object') {
      return null
    }

    // Validate Gantt preferences if present
    let gantt: GanttPreferences | undefined
    if (prefs.gantt && typeof prefs.gantt === 'object') {
      const validZoomLevels = ['day', 'week', 'month', 'quarter']
      const validViewModes = ['table', 'gantt']
      const validSortFields = ['start_date', 'end_date', 'duration', 'name']
      const validSortDirections = ['asc', 'desc']
      const validQuickFilters = ['all', 'today', 'overdue', 'this_week', 'has_dependencies']

      // Validate field mapping if present
      let fieldMapping: GanttFieldMapping | undefined
      if (prefs.gantt.fieldMapping && typeof prefs.gantt.fieldMapping === 'object') {
        fieldMapping = {
          startField:
            typeof prefs.gantt.fieldMapping.startField === 'string'
              ? prefs.gantt.fieldMapping.startField
              : 'start_date',
          endField:
            typeof prefs.gantt.fieldMapping.endField === 'string'
              ? prefs.gantt.fieldMapping.endField
              : 'end_date',
          labelField:
            typeof prefs.gantt.fieldMapping.labelField === 'string'
              ? prefs.gantt.fieldMapping.labelField
              : 'name',
        }
      }

      // Validate date range filter if present
      let dateRangeFilter: SerializableDateRangeFilter | undefined
      if (prefs.gantt.dateRangeFilter && typeof prefs.gantt.dateRangeFilter === 'object') {
        dateRangeFilter = {
          start:
            typeof prefs.gantt.dateRangeFilter.start === 'string'
              ? prefs.gantt.dateRangeFilter.start
              : null,
          end:
            typeof prefs.gantt.dateRangeFilter.end === 'string'
              ? prefs.gantt.dateRangeFilter.end
              : null,
        }
      }

      gantt = {
        zoomLevel: validZoomLevels.includes(prefs.gantt.zoomLevel) ? prefs.gantt.zoomLevel : 'week',
        cutoffWidth:
          typeof prefs.gantt.cutoffWidth === 'number' && prefs.gantt.cutoffWidth >= 200
            ? prefs.gantt.cutoffWidth
            : 400,
        viewMode: validViewModes.includes(prefs.gantt.viewMode) ? prefs.gantt.viewMode : 'table',
        fieldMapping,
        // Gantt sort/filter state
        ganttSortField: validSortFields.includes(prefs.gantt.ganttSortField)
          ? prefs.gantt.ganttSortField
          : undefined,
        ganttSortDirection: validSortDirections.includes(prefs.gantt.ganttSortDirection)
          ? prefs.gantt.ganttSortDirection
          : undefined,
        activeQuickFilter: validQuickFilters.includes(prefs.gantt.activeQuickFilter)
          ? prefs.gantt.activeQuickFilter
          : undefined,
        dateRangeFilter,
      }
    }

    return {
      columnWidths: this.validateRecord(prefs.columnWidths, 'number'),
      columnOrder: this.validateArray(prefs.columnOrder, 'string'),
      columnVisibility: this.validateRecord(prefs.columnVisibility, 'boolean'),
      frozenColumns: this.validateRecord(prefs.frozenColumns, 'boolean'),
      sortBy: this.validateArray(prefs.sortBy, 'object'),
      filters: this.validateArray(prefs.filters, 'object'),
      groupConfig: prefs.groupConfig || null,
      groupRowOrders: this.validateRecord(prefs.groupRowOrders, 'object'),
      flatRowOrder: this.validateArray(prefs.flatRowOrder, 'string'),
      gantt,
      entityType: this.entityType,
      lastUpdated: prefs.lastUpdated || new Date().toISOString(),
    }
  }

  /**
   * Apply loaded preferences to stores
   * Uses runInAction() to comply with MobX strict mode
   */
  private applyLoadedPreferences(prefs: VibeGridPreferences): void {
    // Apply to TableCoreStore (wrapped in runInAction for MobX strict mode)
    if (this.tableCoreStore) {
      runInAction(() => {
        if (Object.keys(prefs.groupRowOrders).length > 0) {
          this.tableCoreStore!.groupRowOrders = prefs.groupRowOrders
        }
        if (prefs.flatRowOrder.length > 0) {
          this.tableCoreStore!.flatRowOrder = prefs.flatRowOrder
        }
      })
    }

    // Apply to VisualStateStore (wrapped in runInAction for MobX strict mode)
    if (this.visualStateStore) {
      runInAction(() => {
        if (Object.keys(prefs.columnWidths).length > 0) {
          this.visualStateStore!.columnWidths = prefs.columnWidths
        }
        if (prefs.columnOrder.length > 0) {
          this.visualStateStore!.columnOrder = prefs.columnOrder
        }
        if (Object.keys(prefs.columnVisibility).length > 0) {
          this.visualStateStore!.columnVisibility = prefs.columnVisibility
        }
        if (Object.keys(prefs.frozenColumns).length > 0) {
          this.visualStateStore!.frozenColumns = prefs.frozenColumns
        }
        if (prefs.sortBy.length > 0) {
          this.visualStateStore!.sortBy = prefs.sortBy
        }
        if (prefs.filters.length > 0) {
          this.visualStateStore!.filters = prefs.filters
        }
        if (prefs.groupConfig) {
          // Convert serializable config back to runtime GroupConfig (with Set)
          const runtimeGroupConfig: GroupConfig = {
            ...prefs.groupConfig,
            expandedGroups: new Set(prefs.groupConfig.expandedGroups || []),
          }
          this.visualStateStore!.groupConfig = runtimeGroupConfig
        }
      })
    }

    // Apply Gantt preferences
    if (prefs.gantt) {
      if (this.ganttViewStore) {
        this.ganttViewStore.setZoomLevel(prefs.gantt.zoomLevel)
        // Apply field mapping if present
        if (prefs.gantt.fieldMapping) {
          this.ganttViewStore.setFieldMapping(prefs.gantt.fieldMapping)
        }
        // Apply Gantt sort/filter state if present
        if (prefs.gantt.ganttSortField) {
          this.ganttViewStore.setGanttSort(
            prefs.gantt.ganttSortField,
            prefs.gantt.ganttSortDirection,
          )
        }
        if (prefs.gantt.activeQuickFilter) {
          this.ganttViewStore.setQuickFilter(prefs.gantt.activeQuickFilter)
        }
        if (prefs.gantt.dateRangeFilter) {
          this.ganttViewStore.setDateRangeFilter(
            prefs.gantt.dateRangeFilter.start ? new Date(prefs.gantt.dateRangeFilter.start) : null,
            prefs.gantt.dateRangeFilter.end ? new Date(prefs.gantt.dateRangeFilter.end) : null,
          )
        }
        logger.info('Applied Gantt preferences', {
          zoomLevel: prefs.gantt.zoomLevel,
          fieldMapping: prefs.gantt.fieldMapping,
          ganttSortField: prefs.gantt.ganttSortField,
          ganttSortDirection: prefs.gantt.ganttSortDirection,
          activeQuickFilter: prefs.gantt.activeQuickFilter,
          dateRangeFilter: prefs.gantt.dateRangeFilter,
        })
      }
      if (this.viewModeStore) {
        this.viewModeStore.setCutoffWidth(prefs.gantt.cutoffWidth)
        // Only restore view mode if it was gantt (don't force gantt mode)
        if (prefs.gantt.viewMode === 'gantt') {
          this.viewModeStore.setMode('gantt')
        }
        logger.info('Applied Gantt view preferences', {
          cutoffWidth: prefs.gantt.cutoffWidth,
          viewMode: prefs.gantt.viewMode,
        })
      }
    }

    logger.info('✅ Applied loaded preferences to stores', {
      entityType: this.entityType,
      hasGanttPrefs: !!prefs.gantt,
    })
  }

  // ====================================
  // SAVING LOGIC
  // ====================================

  /**
   * Set up MobX reactions for auto-saving
   */
  private setupAutoSave(): void {
    if (!this.tableCoreStore || !this.visualStateStore) {
      logger.warn('⚠️ Cannot setup auto-save - stores not injected', {
        hasTableCore: !!this.tableCoreStore,
        hasVisualState: !!this.visualStateStore,
      })
      return
    }

    // Watch TableCoreStore changes
    this.disposers.add(
      reaction(
        () => ({
          groupRowOrders: this.tableCoreStore!.groupRowOrders,
          flatRowOrder: this.tableCoreStore!.flatRowOrder,
        }),
        () => {
          this.debouncedSave()
        },
        {
          name: 'PersistenceStore.watchTableCore',
          delay: 100, // Small delay to batch rapid changes
        },
      ),
    )

    // Watch VisualStateStore changes
    this.disposers.add(
      reaction(
        () => ({
          columnWidths: this.visualStateStore!.columnWidths,
          columnOrder: this.visualStateStore!.columnOrder,
          columnVisibility: this.visualStateStore!.columnVisibility,
          frozenColumns: this.visualStateStore!.frozenColumns,
          sortBy: this.visualStateStore!.sortBy,
          filters: this.visualStateStore!.filters,
          groupConfig: this.visualStateStore!.groupConfig,
        }),
        (data) => {
          logger.debug('[PERSIST] 🔥 Reaction fired - changes detected', {
            hasColumnWidths: Object.keys(data.columnWidths || {}).length > 0,
            hasColumnOrder: (data.columnOrder || []).length > 0,
            hasColumnVisibility: Object.keys(data.columnVisibility || {}).length > 0,
            hasSortBy: (data.sortBy || []).length > 0,
            hasFilters: (data.filters || []).length > 0,
            hasGroupConfig: !!data.groupConfig,
            groupConfigFields: data.groupConfig?.fields?.length || 0,
          })
          this.debouncedSave()
        },
        {
          name: 'PersistenceStore.watchVisualState',
          delay: 100, // Small delay to batch rapid changes
        },
      ),
    )

    // Watch Gantt stores if available
    if (this.ganttViewStore && this.viewModeStore) {
      this.disposers.add(
        reaction(
          () => ({
            zoomLevel: this.ganttViewStore!.zoomLevel,
            cutoffWidth: this.viewModeStore!.cutoffWidth,
            viewMode: this.viewModeStore!.mode,
            fieldMapping: this.ganttViewStore!.fieldMapping,
            // Gantt-specific sort/filter state
            ganttSortField: this.ganttViewStore!.ganttSortField,
            ganttSortDirection: this.ganttViewStore!.ganttSortDirection,
            activeQuickFilter: this.ganttViewStore!.activeQuickFilter,
            dateRangeFilter: this.ganttViewStore!.dateRangeFilter,
          }),
          (data) => {
            logger.debug('[PERSIST] 🔥 Gantt reaction fired - changes detected', {
              zoomLevel: data.zoomLevel,
              cutoffWidth: data.cutoffWidth,
              viewMode: data.viewMode,
              fieldMapping: data.fieldMapping,
              ganttSortField: data.ganttSortField,
              ganttSortDirection: data.ganttSortDirection,
              activeQuickFilter: data.activeQuickFilter,
              dateRangeFilter: data.dateRangeFilter,
            })
            this.debouncedSave()
          },
          {
            name: 'PersistenceStore.watchGantt',
            delay: 100,
          },
        ),
      )
      logger.info('✅ Gantt auto-save reaction set up')
    }

    logger.info('✅ Auto-save reactions set up', {
      entityType: this.entityType,
      hasGanttWatcher: !!this.ganttViewStore && !!this.viewModeStore,
    })
  }

  /**
   * Debounced save - prevents excessive localStorage writes
   */
  private debouncedSave(): void {
    if (this.saveTimer) {
      logger.debug('[PERSIST] ⏱️ Debounce timer reset - clearing previous timer')
      clearTimeout(this.saveTimer)
    }

    logger.debug('[PERSIST] ⏱️ Debounce timer started', {
      delayMs: this.SAVE_DEBOUNCE_MS,
      willSaveIn: `${this.SAVE_DEBOUNCE_MS}ms`,
    })

    this.saveTimer = setTimeout(() => {
      logger.debug('[PERSIST] ⏱️ Debounce timer expired - saving now')
      this.saveToStorage()
      this.saveTimer = null
    }, this.SAVE_DEBOUNCE_MS)
  }

  /**
   * Save current state to localStorage
   */
  private saveToStorage(): void {
    if (!this.tableCoreStore || !this.visualStateStore) {
      logger.warn('⚠️ Cannot save - stores not injected')
      return
    }

    try {
      // Build Gantt preferences if stores are available
      let gantt: GanttPreferences | undefined
      if (this.ganttViewStore && this.viewModeStore) {
        // Serialize date range filter (Date -> ISO string)
        const dateRangeFilter = this.ganttViewStore.dateRangeFilter
        const serializedDateRangeFilter: SerializableDateRangeFilter | undefined =
          dateRangeFilter.start || dateRangeFilter.end
            ? {
                start: dateRangeFilter.start?.toISOString() ?? null,
                end: dateRangeFilter.end?.toISOString() ?? null,
              }
            : undefined

        gantt = {
          zoomLevel: this.ganttViewStore.zoomLevel,
          cutoffWidth: this.viewModeStore.cutoffWidth,
          viewMode: this.viewModeStore.mode,
          fieldMapping: this.ganttViewStore.fieldMapping,
          // Gantt-specific sort/filter state
          ganttSortField: this.ganttViewStore.ganttSortField,
          ganttSortDirection: this.ganttViewStore.ganttSortDirection,
          activeQuickFilter: this.ganttViewStore.activeQuickFilter,
          dateRangeFilter: serializedDateRangeFilter,
        }
      }

      const prefs: VibeGridPreferences = {
        // From TableCoreStore
        groupRowOrders: this.tableCoreStore.groupRowOrders,
        flatRowOrder: this.tableCoreStore.flatRowOrder,

        // From VisualStateStore
        columnWidths: this.visualStateStore.columnWidths,
        columnOrder: this.visualStateStore.columnOrder,
        columnVisibility: this.visualStateStore.columnVisibility,
        frozenColumns: this.visualStateStore.frozenColumns,
        sortBy: this.visualStateStore.sortBy,
        filters: this.visualStateStore.filters,

        // Convert GroupConfig (with Set) to serializable version (with Array)
        groupConfig: this.serializeGroupConfig(this.visualStateStore.groupConfig),

        // Gantt preferences
        gantt,

        // Metadata
        entityType: this.entityType,
        lastUpdated: new Date().toISOString(),
      }

      const serialized = JSON.stringify(prefs)

      // Check size before saving
      if (serialized.length > 100000) {
        // 100KB warning
        logger.warn('🚨 Preferences unusually large', {
          entityType: this.entityType,
          size: serialized.length,
        })
        // Could implement fallback to IndexedDB here if needed
      }

      localStorage.setItem(this.storageKey, serialized)

      logger.info('[PERSIST] 💾 Saved to localStorage', {
        entityType: this.entityType,
        size: serialized.length,
        storageKey: this.storageKey,
        hasColumnWidths: Object.keys(prefs.columnWidths || {}).length > 0,
        hasColumnVisibility: Object.keys(prefs.columnVisibility || {}).length > 0,
        hasGroupConfig: !!prefs.groupConfig,
        groupConfigFields: prefs.groupConfig?.fields?.length || 0,
        hasGantt: !!prefs.gantt,
        ganttZoom: prefs.gantt?.zoomLevel,
        timestamp: prefs.lastUpdated,
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      logger.error('❌ Failed to save preferences', {
        entityType: this.entityType,
        error: errorMessage,
      })

      // Handle quota exceeded errors
      if (error instanceof Error && error.name === 'QuotaExceededError') {
        logger.error('🚨 QuotaExceededError - localStorage quota exceeded', {
          entityType: this.entityType,
          storageKey: this.storageKey,
        })
        // Could implement emergency cleanup or IndexedDB fallback here
      }
    }
  }

  // ====================================
  // UTILITY METHODS
  // ====================================

  /**
   * Normalize entityType to URL format
   */
  private normalizeEntityType(entityType: string): string {
    // Guard against undefined/null
    if (!entityType) {
      logger.warn('normalizeEntityType called with undefined/null entityType, returning "unknown"')
      return 'unknown'
    }

    // Extract base entity name if already prefixed
    let baseEntityType = entityType
    if (entityType.includes('_') && entityType.length > 36) {
      const parts = entityType.split('_')
      const firstPart = parts[0]
      if (firstPart.length === 36 && firstPart.includes('-')) {
        baseEntityType = parts.slice(1).join('_')
      }
    }

    // Convert PascalCase to kebab-case
    return baseEntityType
      .replace(/([A-Z])/g, '-$1')
      .toLowerCase()
      .replace(/^-/, '')
  }

  /**
   * Convert GroupConfig with Set to serializable version with Array
   */
  private serializeGroupConfig(groupConfig: GroupConfig | null): SerializableGroupConfig | null {
    if (!groupConfig) {
      return null
    }

    return {
      fields: groupConfig.fields,
      sortBy: groupConfig.sortBy,
      sortDirection: groupConfig.sortDirection,
      aggregations: groupConfig.aggregations,
      expandedGroups: Array.from(groupConfig.expandedGroups || new Set()),
      colorScheme: groupConfig.colorScheme,
    }
  }

  /**
   * Validate record (object with specific value type)
   */
  private validateRecord<T extends string | number | boolean | object>(
    value: any,
    valueType: 'string' | 'number' | 'boolean' | 'object',
  ): Record<string, T> {
    if (!value || typeof value !== 'object') {
      return {}
    }

    const result: Record<string, T> = {}
    for (const [key, val] of Object.entries(value)) {
      if (typeof val === valueType) {
        result[key] = val as T
      }
    }
    return result
  }

  /**
   * Validate array of specific type
   */
  private validateArray<T>(value: any, itemType: 'string' | 'number' | 'boolean' | 'object'): T[] {
    if (!Array.isArray(value)) {
      return []
    }

    return value.filter((item) => typeof item === itemType) as T[]
  }

  /**
   * Get current preferences snapshot (for debugging)
   */
  getSnapshot(): VibeGridPreferences | null {
    if (!this.tableCoreStore || !this.visualStateStore) {
      return null
    }

    // Build Gantt preferences if stores are available
    let gantt: GanttPreferences | undefined
    if (this.ganttViewStore && this.viewModeStore) {
      // Serialize date range filter (Date -> ISO string)
      const dateRangeFilter = this.ganttViewStore.dateRangeFilter
      const serializedDateRangeFilter: SerializableDateRangeFilter | undefined =
        dateRangeFilter.start || dateRangeFilter.end
          ? {
              start: dateRangeFilter.start?.toISOString() ?? null,
              end: dateRangeFilter.end?.toISOString() ?? null,
            }
          : undefined

      gantt = {
        zoomLevel: this.ganttViewStore.zoomLevel,
        cutoffWidth: this.viewModeStore.cutoffWidth,
        viewMode: this.viewModeStore.mode,
        fieldMapping: this.ganttViewStore.fieldMapping,
        // Gantt-specific sort/filter state
        ganttSortField: this.ganttViewStore.ganttSortField,
        ganttSortDirection: this.ganttViewStore.ganttSortDirection,
        activeQuickFilter: this.ganttViewStore.activeQuickFilter,
        dateRangeFilter: serializedDateRangeFilter,
      }
    }

    return {
      groupRowOrders: this.tableCoreStore.groupRowOrders,
      flatRowOrder: this.tableCoreStore.flatRowOrder,
      columnWidths: this.visualStateStore.columnWidths,
      columnOrder: this.visualStateStore.columnOrder,
      columnVisibility: this.visualStateStore.columnVisibility,
      frozenColumns: this.visualStateStore.frozenColumns,
      sortBy: this.visualStateStore.sortBy,
      filters: this.visualStateStore.filters,
      groupConfig: this.serializeGroupConfig(this.visualStateStore.groupConfig),
      gantt,
      entityType: this.entityType,
      lastUpdated: new Date().toISOString(),
    }
  }
}
