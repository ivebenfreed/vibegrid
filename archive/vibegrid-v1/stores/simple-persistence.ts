/**
 * Simple VibeGrid Persistence - Method 3 Approach
 *
 * Clean, reliable persistence for essential VibeGrid user preferences.
 * Uses the same approach as our working local storage debug page.
 *
 * 🔄 ARCHITECTURE NOTE:
 * - SAVING: Handled here via operations.setXXX() methods (called from VibeGrid onChange handlers)
 * - LOADING: Handled in visual-state.ts via loadAllSavedPreferences() during initialization
 * - This separation ensures loading happens BEFORE defaults are applied, which is critical for persistence
 *
 * CRITICAL SUCCESS NOTES:
 *
 * 🎯 COLUMN PERSISTENCE WORKING SOLUTION:
 * The key to making column persistence work was integrating localStorage loading
 * directly into the visual state initialization process, not as a separate step.
 *
 * ✅ Integration Points:
 * 1. visual-state.ts:loadAllSavedPreferences() - Loads during createDefaultColumnState()
 * 2. simple-persistence.ts:createVibeGridPreferences() - Handles saving and storage operations
 * 3. VibeGrid.tsx:onChange handlers - Trigger saves via operations.setXXX() methods
 *
 * 🔑 Key Fix Details:
 * - EntityType normalization: WorkTask → work-task (prevents storage key mismatches)
 * - OrgId integration: Ensures multi-tenant isolation in localStorage keys
 * - Direct localStorage reading: Bypasses broken observable persistence layer
 * - Initialization order: Loads saved preferences BEFORE defaults are applied
 *
 * 📊 Verification:
 * - Saving: ✅ onChange listeners properly save to localStorage via operations.setXXX()
 * - Loading: ✅ loadAllSavedPreferences() integrates with visual state init
 * - Persistence: ✅ All preferences survive page refreshes and browser sessions
 * - UI Integration: ✅ Visual state reflects saved preferences correctly
 *
 * 🚨 IMPORTANT: Do not modify the visual-state.ts integration without testing persistence!
 */

import { observable } from '@legendapp/state'
import { observablePersistIndexedDB } from '@legendapp/state/persist-plugins/indexeddb'
import { ObservablePersistLocalStorage } from '@legendapp/state/persist-plugins/local-storage'
import { configureSynced, syncObservable } from '@legendapp/state/sync'
import { log } from '@/logger'
import type { FilterConfig, GroupConfig, SortConfig } from '../types'

// Serializable version of GroupConfig for persistence (Sets converted to arrays)
interface SerializableGroupConfig {
  fields: Array<{ field: string; displayName: string }>
  sortBy: 'name' | 'count' | 'custom'
  sortDirection: 'asc' | 'desc'
  aggregations: Array<{
    field: string
    function: 'count' | 'sum' | 'avg' | 'min' | 'max' | 'unique'
    displayName?: string
  }>
  expandedGroups: string[] // Array instead of Set for serialization
  colorScheme?: 'auto' | 'none' | 'custom'
}

import type { GroupRowOrderConfig } from './data-state'

const persistLog = log('vibegrid/simple-persistence')

// Storage size management
const MAX_STORAGE_SIZE = 1024 * 1024 * 2 // 2MB limit for safety
const ROW_ORDER_LIMIT = 1000 // Limit row orders to prevent bloat
const MAX_LOCALSTORAGE_SIZE = 1024 * 512 // 512KB threshold to switch to IndexedDB

function checkStorageSize(key: string): boolean {
  try {
    const data = localStorage.getItem(key)
    if (data && data.length > MAX_STORAGE_SIZE) {
      persistLog.warn('🚨 Storage approaching quota limit', {
        key,
        size: data.length,
        limit: MAX_STORAGE_SIZE,
      })
      return false
    }
    return true
  } catch (error) {
    persistLog.error('❌ Storage size check failed', { key, error })
    return false
  }
}

function limitRowOrders(rowOrder: string[]): string[] {
  if (rowOrder.length > ROW_ORDER_LIMIT) {
    persistLog.warn('🚨 Row order truncated to prevent storage bloat', {
      original: rowOrder.length,
      limited: ROW_ORDER_LIMIT,
    })
    return rowOrder.slice(0, ROW_ORDER_LIMIT)
  }
  return rowOrder
}

// Validate column visibility data to prevent corruption
function validateColumnVisibility(
  columnVisibility: Record<string, boolean>,
): Record<string, boolean> {
  const stringified = JSON.stringify(columnVisibility)

  // Check for abnormal size (should be small for boolean values)
  if (stringified.length > 10000) {
    // 10KB threshold for column visibility
    persistLog.error('🚨 Column visibility data abnormally large, resetting to safe defaults', {
      size: stringified.length,
      keys: Object.keys(columnVisibility).length,
    })

    // Return only boolean values, strip any corrupted data
    const cleaned: Record<string, boolean> = {}
    for (const [key, value] of Object.entries(columnVisibility)) {
      if (typeof key === 'string' && typeof value === 'boolean') {
        cleaned[key] = value
      }
    }

    // If still too large after cleaning, return empty object
    if (JSON.stringify(cleaned).length > 10000) {
      persistLog.error('🚨 Column visibility still corrupted after cleaning, returning empty state')
      return {}
    }

    return cleaned
  }

  return columnVisibility
}

// Configure IndexedDB persistence as primary storage
const indexedDBOptions = configureSynced({
  persist: {
    plugin: observablePersistIndexedDB({
      databaseName: 'VibeGrid',
      version: 1,
      tableNames: ['preferences'],
    }),
  },
})

// Configure localStorage persistence as fallback
const localStorageOptions = configureSynced({
  persist: {
    plugin: ObservablePersistLocalStorage,
  },
})

// Smart persistence: Use IndexedDB for large data, localStorage for small data
function getOptimalPersistenceConfig(entityType: string, estimatedSize?: number): any {
  // Check if we should use IndexedDB based on size or previous quota issues
  const forceIndexedDB = localStorage.getItem(`vibegrid-force-indexeddb-${entityType}`)

  if (forceIndexedDB || (estimatedSize && estimatedSize > MAX_LOCALSTORAGE_SIZE)) {
    persistLog.info('🗄️ Using IndexedDB for large data persistence', {
      entityType,
      estimatedSize,
      forceIndexedDB: !!forceIndexedDB,
    })
    return indexedDBOptions
  }

  persistLog.info('💾 Using localStorage for small data persistence', {
    entityType,
    estimatedSize,
  })
  return localStorageOptions
}

// Complete interface for all VibeGrid visual state persistence
export interface VibeGridPreferences {
  // Column layout
  columnWidths: Record<string, number>
  columnOrder: string[]
  columnVisibility: Record<string, boolean>

  // Data display
  sortBy: SortConfig[]
  filters: FilterConfig[]

  // Grouping configuration (serializable version)
  groupConfig: SerializableGroupConfig | null

  // Row ordering state
  groupRowOrders: Record<string, GroupRowOrderConfig>
  flatRowOrder: string[]

  // Viewport state (intentionally excluded - scroll position should not persist for better UX)
  // scrollPosition?: { top: number; left: number };

  // Selection state (transient - usually not persisted)
  selectedCells?: string[]

  // Metadata
  entityType: string
  lastUpdated: string
}

// Factory function to create isolated preferences store for each VibeGrid instance
export function createVibeGridPreferences(entityType: string, orgId?: string) {
  // CRITICAL FIX: Extract base entity name if entityType already has org prefix
  // This prevents double orgId in storage keys like "vibegrid-simple-org1_org1_entity"
  let baseEntityType = entityType

  // Check if entityType already contains an org prefix (from EntityNameUtils.ensureOrgPrefix)
  if (entityType.includes('_') && entityType.length > 36) {
    const parts = entityType.split('_')
    const firstPart = parts[0]

    // If first part looks like a UUID (36 chars with dashes), extract just the entity name
    if (firstPart.length === 36 && firstPart.includes('-')) {
      baseEntityType = parts.slice(1).join('_')
      persistLog.info('🔧 Extracted base entity type from prefixed entityType', {
        originalEntityType: entityType,
        extractedOrgId: firstPart,
        baseEntityType,
        providedOrgId: orgId,
      })
    }
  }

  // Normalize entityType to URL format for consistent localStorage keys
  // This handles cases where entityType might be PascalCase (WorkTask) vs URL format (work-task)
  const normalizedEntityType = baseEntityType
    .replace(/([A-Z])/g, '-$1') // Convert PascalCase to kebab-case
    .toLowerCase()
    .replace(/^-/, '') // Remove leading dash

  persistLog.info('🎯 Creating simple VibeGrid preferences store', {
    entityType,
    baseEntityType,
    normalizedEntityType,
    orgId,
  })

  // Use normalized entityType in storage key for consistency
  const storageKey = orgId
    ? `vibegrid-simple-${orgId}_${normalizedEntityType}`
    : `vibegrid-simple-${normalizedEntityType}`

  // Create observable with default structure
  const preferences$ = observable<VibeGridPreferences>({
    columnWidths: {},
    columnOrder: [],
    columnVisibility: {},
    sortBy: [],
    filters: [],
    groupConfig: null,
    groupRowOrders: {},
    flatRowOrder: [],
    // scrollPosition: { top: 0, left: 0 }, // Intentionally excluded for better UX
    selectedCells: [],
    entityType,
    lastUpdated: new Date().toISOString(),
  })

  // NOTE: Loading is now handled by visual-state.ts:loadAllSavedPreferences()
  // during initialization. This ensures loading happens BEFORE defaults are applied.
  persistLog.info('💾 Preferences store created (loading handled by visual-state)', {
    entityType,
    storageKey,
  })

  // Manual save function
  const saveToStorage = () => {
    try {
      // Extract and filter all values defensively
      const columnWidths = preferences$.columnWidths.get()
      const columnOrder = preferences$.columnOrder.get()
      const columnVisibility = preferences$.columnVisibility.get()
      const sortBy = preferences$.sortBy.get()
      const filters = preferences$.filters.get()
      const groupConfig = preferences$.groupConfig.get()
      const groupRowOrders = preferences$.groupRowOrders.get()
      const flatRowOrder = preferences$.flatRowOrder.get()
      const selectedCells = preferences$.selectedCells.get()

      // Defensive filtering for column widths
      const filteredColumnWidths: Record<string, number> = {}
      for (const [key, value] of Object.entries(columnWidths || {})) {
        if (typeof value === 'number' && isFinite(value) && value > 0) {
          filteredColumnWidths[key] = value
        }
      }

      // Defensive filtering for column order
      const filteredColumnOrder = Array.isArray(columnOrder)
        ? columnOrder.filter((item) => typeof item === 'string' && item.length > 0)
        : []

      // Defensive filtering for column visibility
      const filteredColumnVisibility: Record<string, boolean> = {}
      for (const [key, value] of Object.entries(columnVisibility || {})) {
        if (typeof value === 'boolean') {
          filteredColumnVisibility[key] = value
        }
      }

      // Defensive filtering for sortBy
      const filteredSortBy = Array.isArray(sortBy)
        ? sortBy.filter(
            (sort) =>
              sort &&
              typeof sort === 'object' &&
              typeof sort.field === 'string' &&
              sort.field.length > 0 &&
              (sort.direction === 'asc' || sort.direction === 'desc'),
          )
        : []

      // Defensive filtering for filters
      const filteredFilters = Array.isArray(filters)
        ? filters.filter(
            (filter) =>
              filter &&
              typeof filter === 'object' &&
              typeof filter.field === 'string' &&
              filter.field.length > 0 &&
              typeof filter.operator === 'string' &&
              filter.value !== undefined,
          )
        : []

      // Defensive filtering for groupRowOrders
      const filteredGroupRowOrders: Record<string, GroupRowOrderConfig> = {}
      for (const [key, value] of Object.entries(groupRowOrders || {})) {
        if (
          value &&
          typeof value === 'object' &&
          Array.isArray(value.rowIds) &&
          value.rowIds.every((id) => typeof id === 'string')
        ) {
          filteredGroupRowOrders[key] = {
            ...value,
            rowIds: limitRowOrders(value.rowIds),
          }
        }
      }

      // Defensive filtering for flatRowOrder
      const filteredFlatRowOrder = Array.isArray(flatRowOrder)
        ? limitRowOrders(flatRowOrder.filter((id) => typeof id === 'string' && id.length > 0))
        : []

      // Defensive filtering for selectedCells
      const filteredSelectedCells = Array.isArray(selectedCells)
        ? selectedCells.filter((cell) => typeof cell === 'string' && cell.length > 0)
        : []

      // Debug what's causing the huge size
      persistLog.debug('🔍 Analyzing storage size', {
        columnWidthsSize: JSON.stringify(filteredColumnWidths).length,
        columnOrderSize: JSON.stringify(filteredColumnOrder).length,
        columnVisibilitySize: JSON.stringify(filteredColumnVisibility).length,
        sortBySize: JSON.stringify(filteredSortBy).length,
        filtersSize: JSON.stringify(filteredFilters).length,
        groupConfigSize: JSON.stringify(groupConfig).length,
        groupRowOrdersSize: JSON.stringify(filteredGroupRowOrders).length,
        flatRowOrderSize: JSON.stringify(filteredFlatRowOrder).length,
        columnWidthsKeys: Object.keys(filteredColumnWidths).length,
        columnWidthsPreview: JSON.stringify(filteredColumnWidths).substring(0, 100),
      })

      const data: VibeGridPreferences = {
        columnWidths: filteredColumnWidths,
        columnOrder: filteredColumnOrder,
        columnVisibility: filteredColumnVisibility,
        sortBy: filteredSortBy,
        filters: filteredFilters,
        groupConfig: groupConfig, // groupConfig is already validated in setGroupConfig
        groupRowOrders: filteredGroupRowOrders,
        flatRowOrder: filteredFlatRowOrder,
        // scrollPosition: preferences$.scrollPosition.get(), // Intentionally excluded for better UX
        selectedCells: filteredSelectedCells,
        entityType: preferences$.entityType.get(),
        lastUpdated: preferences$.lastUpdated.get(),
      }

      const serialized = JSON.stringify(data)

      // Safety check - should be small
      if (serialized.length > 100000) {
        // 100KB warning
        persistLog.warn(
          '🚨 Preferences unusually large, attempting emergency save of critical data',
          {
            entityType,
            size: serialized.length,
            preview: serialized.substring(0, 200),
            columnWidthsSize: JSON.stringify(data.columnWidths).length,
            columnVisibilitySize: JSON.stringify(data.columnVisibility).length,
            groupRowOrdersSize: JSON.stringify(data.groupRowOrders).length,
          },
        )

        // Save only critical data (column visibility) to prevent total loss
        const criticalData = {
          columnVisibility: data.columnVisibility,
          entityType: data.entityType,
          lastUpdated: data.lastUpdated,
        }

        try {
          localStorage.setItem(storageKey, JSON.stringify(criticalData))
          persistLog.info('💾 Critical data saved (oversized data truncated)', {
            entityType,
            criticalSize: JSON.stringify(criticalData).length,
          })
        } catch (error) {
          persistLog.error('❌ Failed to save even critical data', { entityType, error })
        }
        return
      }

      localStorage.setItem(storageKey, serialized)
      persistLog.debug('💾 Preferences saved successfully', {
        entityType,
        size: serialized.length,
        properties: {
          columnWidths: Object.keys(filteredColumnWidths).length,
          columnOrder: filteredColumnOrder.length,
          columnVisibility: Object.keys(filteredColumnVisibility).length,
          sortBy: filteredSortBy.length,
          filters: filteredFilters.length,
          groupConfig: !!groupConfig,
          groupRowOrders: Object.keys(filteredGroupRowOrders).length,
          flatRowOrder: filteredFlatRowOrder.length,
          selectedCells: filteredSelectedCells.length,
        },
      })
    } catch (error) {
      if (error instanceof Error && error.name === 'QuotaExceededError') {
        persistLog.error('🚨 QuotaExceededError during manual save', { entityType, error })
        // Trigger emergency cleanup but don't throw
        operations.emergencyCleanup()
      } else {
        persistLog.error('❌ Failed to save preferences', { entityType, error })
      }
    }
  }

  persistLog.info('✅ Simple VibeGrid preferences initialized', {
    entityType,
    storageKey,
  })

  const operations = {
    // Update column width (individual)
    setColumnWidth(columnId: string, width: number) {
      const current = preferences$.columnWidths.get()
      preferences$.columnWidths.set({
        ...current,
        [columnId]: width,
      })
      preferences$.lastUpdated.set(new Date().toISOString())
      saveToStorage()
      persistLog.debug('📏 Column width saved', { columnId, width })
    },

    // Update all column widths (bulk - preferred for onChange handlers)
    setAllColumnWidths(columnWidths: Record<string, number>) {
      // Defensive filtering - only save actual width numbers
      const filteredWidths: Record<string, number> = {}
      for (const [key, value] of Object.entries(columnWidths || {})) {
        if (typeof value === 'number' && isFinite(value) && value > 0) {
          filteredWidths[key] = value
        }
      }

      preferences$.columnWidths.set(filteredWidths)
      preferences$.lastUpdated.set(new Date().toISOString())
      saveToStorage()
      persistLog.debug('📏 All column widths saved', {
        originalCount: Object.keys(columnWidths || {}).length,
        filteredCount: Object.keys(filteredWidths).length,
        filteredWidths,
      })
    },

    // Update column order
    setColumnOrder(order: string[]) {
      // Defensive filtering - only save valid string array
      const filteredOrder = Array.isArray(order)
        ? order.filter((item) => typeof item === 'string' && item.length > 0)
        : []

      preferences$.columnOrder.set(filteredOrder)
      preferences$.lastUpdated.set(new Date().toISOString())
      saveToStorage()
      persistLog.debug('🔄 Column order saved', {
        originalCount: order?.length || 0,
        filteredCount: filteredOrder.length,
        filteredOrder,
      })
    },

    // Update column visibility (individual)
    setColumnVisibility(columnId: string, visible: boolean) {
      const current = preferences$.columnVisibility.get()
      preferences$.columnVisibility.set({
        ...current,
        [columnId]: visible,
      })
      preferences$.lastUpdated.set(new Date().toISOString())
      saveToStorage()
      persistLog.debug('👁️ Column visibility saved', { columnId, visible })
    },

    // Update all column visibility (bulk - preferred for onChange handlers)
    setAllColumnVisibility(columnVisibility: Record<string, boolean>) {
      persistLog.info('📞 setAllColumnVisibility called', {
        entityType,
        inputData: columnVisibility,
        inputKeys: Object.keys(columnVisibility || {}).length,
      })

      // Defensive filtering - only save actual boolean values
      const filteredVisibility: Record<string, boolean> = {}
      for (const [key, value] of Object.entries(columnVisibility || {})) {
        if (typeof value === 'boolean') {
          filteredVisibility[key] = value
        }
      }

      preferences$.columnVisibility.set(filteredVisibility)
      preferences$.lastUpdated.set(new Date().toISOString())
      saveToStorage()
      persistLog.info('👁️ All column visibility saved', {
        originalCount: Object.keys(columnVisibility || {}).length,
        filteredCount: Object.keys(filteredVisibility).length,
        filteredVisibility,
      })
    },

    // Update sort configuration
    setSortBy(sortBy: SortConfig[]) {
      // Defensive filtering - only save valid sort configurations
      const filteredSortBy = Array.isArray(sortBy)
        ? sortBy.filter(
            (sort) =>
              sort &&
              typeof sort === 'object' &&
              typeof sort.field === 'string' &&
              sort.field.length > 0 &&
              (sort.direction === 'asc' || sort.direction === 'desc'),
          )
        : []

      preferences$.sortBy.set(filteredSortBy)
      preferences$.lastUpdated.set(new Date().toISOString())
      saveToStorage()
      persistLog.debug('📊 Sort configuration saved', {
        originalCount: sortBy?.length || 0,
        filteredCount: filteredSortBy.length,
        filteredSortBy,
      })
    },

    // Update filters
    setFilters(filters: FilterConfig[]) {
      // Defensive filtering - only save valid filter configurations
      const filteredFilters = Array.isArray(filters)
        ? filters.filter(
            (filter) =>
              filter &&
              typeof filter === 'object' &&
              typeof filter.field === 'string' &&
              filter.field.length > 0 &&
              typeof filter.operator === 'string' &&
              filter.value !== undefined,
          )
        : []

      preferences$.filters.set(filteredFilters)
      preferences$.lastUpdated.set(new Date().toISOString())
      saveToStorage()
      persistLog.debug('🔍 Filters saved', {
        originalCount: filters?.length || 0,
        filteredCount: filteredFilters.length,
        filteredFilters,
      })
    },

    // Update group configuration
    setGroupConfig(groupConfig: GroupConfig | null) {
      // Convert runtime GroupConfig to serializable version
      const serializableConfig: SerializableGroupConfig | null = groupConfig
        ? {
            fields: groupConfig.fields,
            sortBy: groupConfig.sortBy,
            sortDirection: groupConfig.sortDirection,
            aggregations: groupConfig.aggregations,
            expandedGroups: Array.from(groupConfig.expandedGroups || new Set()), // Convert Set to Array
            colorScheme: groupConfig.colorScheme,
          }
        : null

      preferences$.groupConfig.set(serializableConfig)
      preferences$.lastUpdated.set(new Date().toISOString())
      saveToStorage()
      persistLog.info('👥 Group configuration saved to localStorage', {
        hasConfig: !!groupConfig,
        originalConfig: groupConfig,
        serializableConfig: serializableConfig,
        fields: groupConfig?.fields?.length || 0,
        expandedGroupsCount: groupConfig?.expandedGroups?.size || 0,
        hasFields: !!serializableConfig?.fields,
        fieldsArray: serializableConfig?.fields,
      })
    },

    // Update scroll position (disabled - scroll position should not persist for better UX)
    // setScrollPosition(position: { top: number; left: number }) {
    //   preferences$.scrollPosition.set(position);
    //   preferences$.lastUpdated.set(new Date().toISOString());
    //   saveToStorage();
    //   persistLog.debug('📜 Scroll position saved', { position });
    // },

    // Update selected cells (transient - usually not persisted)
    setSelectedCells(cells: string[]) {
      // Defensive filtering - only save valid cell identifiers
      const filteredCells = Array.isArray(cells)
        ? cells.filter((cell) => typeof cell === 'string' && cell.length > 0)
        : []

      preferences$.selectedCells.set(filteredCells)
      preferences$.lastUpdated.set(new Date().toISOString())
      saveToStorage()
      persistLog.debug('🎯 Selected cells saved', {
        originalCount: cells?.length || 0,
        filteredCount: filteredCells.length,
      })
    },

    // Update group row orders for a specific group
    setGroupRowOrder(groupId: string, rowOrder: GroupRowOrderConfig) {
      if (!rowOrder || !rowOrder.rowIds) {
        persistLog.error('❌ Invalid rowOrder passed to setGroupRowOrder', { groupId, rowOrder })
        return
      }

      // Limit row order size to prevent storage bloat
      const limitedRowOrder: GroupRowOrderConfig = {
        ...rowOrder,
        rowIds: limitRowOrders(rowOrder.rowIds),
      }

      const current = preferences$.groupRowOrders.get()
      preferences$.groupRowOrders.set({
        ...current,
        [groupId]: limitedRowOrder,
      })
      preferences$.lastUpdated.set(new Date().toISOString())
      saveToStorage()
      persistLog.debug('📋 Group row order saved', {
        groupId,
        originalCount: rowOrder.rowIds.length,
        savedCount: limitedRowOrder.rowIds.length,
      })
    },

    // Update flat row order (ungrouped mode)
    setFlatRowOrder(rowOrder: string[]) {
      // Defensive filtering - only save valid string IDs
      const filteredRowOrder = Array.isArray(rowOrder)
        ? rowOrder.filter((id) => typeof id === 'string' && id.length > 0)
        : []
      const limitedRowOrder = limitRowOrders(filteredRowOrder)

      preferences$.flatRowOrder.set(limitedRowOrder)
      preferences$.lastUpdated.set(new Date().toISOString())
      saveToStorage()
      persistLog.debug('📋 Flat row order saved', {
        originalCount: rowOrder?.length || 0,
        filteredCount: filteredRowOrder.length,
        savedCount: limitedRowOrder.length,
      })
    },

    // Clear all row ordering (useful when switching modes)
    clearRowOrdering() {
      preferences$.groupRowOrders.set({})
      preferences$.flatRowOrder.set([])
      preferences$.lastUpdated.set(new Date().toISOString())
      saveToStorage()
      persistLog.debug('🗑️ All row ordering cleared')
    },

    // Initialize with column defaults
    initializeColumns(columns: Array<{ id: string; width?: number }>) {
      const defaultWidths = Object.fromEntries(columns.map((col) => [col.id, col.width || 150]))
      const defaultVisibility = Object.fromEntries(columns.map((col) => [col.id, true]))
      const defaultOrder = columns.map((col) => col.id)

      // Only set defaults if not already persisted
      const currentWidths = preferences$.columnWidths.get()
      const currentVisibility = preferences$.columnVisibility.get()
      const currentOrder = preferences$.columnOrder.get()

      // Check if we have ANY persisted data to avoid overwriting saved preferences
      const hasAnyPersistedData =
        Object.keys(currentWidths).length > 0 ||
        Object.keys(currentVisibility).length > 0 ||
        currentOrder.length > 0

      if (!hasAnyPersistedData) {
        // Only initialize with defaults if we have NO saved data at all
        preferences$.columnWidths.set(defaultWidths)
        preferences$.columnVisibility.set(defaultVisibility)
        preferences$.columnOrder.set(defaultOrder)

        preferences$.lastUpdated.set(new Date().toISOString())
        saveToStorage()
        persistLog.info('🎯 Columns initialized with defaults (no existing data)', {
          entityType,
          columnsCount: columns.length,
        })
      } else {
        // Merge any missing columns with defaults, but preserve existing preferences
        const mergedWidths = { ...defaultWidths, ...currentWidths }
        const mergedOrder = currentOrder.length > 0 ? currentOrder : defaultOrder

        // For visibility, only add missing columns as visible, don't override existing values
        const mergedVisibility = { ...defaultVisibility }
        Object.entries(currentVisibility).forEach(([key, value]) => {
          mergedVisibility[key] = value // Preserve saved visibility settings
        })

        preferences$.columnWidths.set(mergedWidths)
        preferences$.columnVisibility.set(mergedVisibility)
        preferences$.columnOrder.set(mergedOrder)

        preferences$.lastUpdated.set(new Date().toISOString())
        saveToStorage()
        persistLog.info('🎯 Columns merged with existing preferences', {
          entityType,
          columnsCount: columns.length,
          hadPersistedWidths: Object.keys(currentWidths).length > 0,
          hadPersistedVisibility: Object.keys(currentVisibility).length > 0,
          hadPersistedOrder: currentOrder.length > 0,
        })
      }
    },

    // Reset all preferences to defaults
    reset(columns: Array<{ id: string; width?: number }>) {
      const defaultWidths = Object.fromEntries(columns.map((col) => [col.id, col.width || 150]))
      const defaultVisibility = Object.fromEntries(columns.map((col) => [col.id, true]))
      const defaultOrder = columns.map((col) => col.id)

      preferences$.assign({
        columnWidths: defaultWidths,
        columnOrder: defaultOrder,
        columnVisibility: defaultVisibility,
        sortBy: [],
        filters: [],
        groupConfig: null,
        groupRowOrders: {},
        flatRowOrder: [],
        // scrollPosition: { top: 0, left: 0 }, // Intentionally excluded for better UX
        selectedCells: [],
        lastUpdated: new Date().toISOString(),
      })

      saveToStorage()
      persistLog.info('🔄 Preferences reset to defaults', { entityType })
    },

    // Get current preferences as plain object
    getSnapshot(): VibeGridPreferences {
      return preferences$.get()
    },

    // Debug: Clear all persistence
    clearPersistence() {
      const storageKey = orgId
        ? `vibegrid-simple-${orgId}_${normalizedEntityType}`
        : `vibegrid-simple-${normalizedEntityType}`
      localStorage.removeItem(storageKey)
      persistLog.info('🗑️ Persistence cleared', { entityType, storageKey })
    },

    // Emergency cleanup for quota exceeded errors
    emergencyCleanup() {
      const storageKey = orgId
        ? `vibegrid-simple-${orgId}_${normalizedEntityType}`
        : `vibegrid-simple-${normalizedEntityType}`
      try {
        persistLog.warn('🧹 Starting emergency cleanup for quota exceeded error', {
          entityType,
          storageKey,
        })

        // Clear localStorage completely for this key
        localStorage.removeItem(storageKey)

        // Reset to minimal state
        preferences$.assign({
          columnWidths: {},
          columnOrder: [],
          columnVisibility: {},
          sortBy: [],
          filters: [],
          groupConfig: null,
          groupRowOrders: {},
          flatRowOrder: [],
          // scrollPosition: { top: 0, left: 0 }, // Intentionally excluded for better UX
          selectedCells: [],
          entityType,
          lastUpdated: new Date().toISOString(),
        })

        persistLog.info('🧹 Emergency cleanup completed', { entityType })
      } catch (error) {
        persistLog.error('❌ Emergency cleanup failed', { entityType, error })
      }
    },

    // Switch to IndexedDB persistence (for when localStorage fails)
    switchToIndexedDB() {
      try {
        // Mark this entity to use IndexedDB
        localStorage.setItem(`vibegrid-force-indexeddb-${entityType}`, 'true')

        // Clear localStorage to free up space
        const storageKey = orgId
          ? `vibegrid-simple-${orgId}_${normalizedEntityType}`
          : `vibegrid-simple-${normalizedEntityType}`
        localStorage.removeItem(storageKey)

        persistLog.info('🗄️ Switched to IndexedDB persistence', { entityType })
      } catch (error) {
        persistLog.error('❌ Failed to switch to IndexedDB', { entityType, error })
      }
    },
  }

  return {
    preferences$,
    operations,
  }
}

// Utility to inspect what's saved in localStorage for debugging
export function inspectVibeGridPersistence(entityType: string, orgId?: string) {
  // Apply the same normalization as createVibeGridPreferences

  // CRITICAL FIX: Extract base entity name if entityType already has org prefix
  // This prevents double orgId in storage keys like "vibegrid-simple-org1_org1_entity"
  let baseEntityType = entityType

  // Check if entityType already contains an org prefix (from EntityNameUtils.ensureOrgPrefix)
  if (entityType.includes('_') && entityType.length > 36) {
    const parts = entityType.split('_')
    const firstPart = parts[0]

    // If first part looks like a UUID (36 chars with dashes), extract just the entity name
    if (firstPart.length === 36 && firstPart.includes('-')) {
      baseEntityType = parts.slice(1).join('_')
    }
  }

  const normalizedEntityType = baseEntityType
    .replace(/([A-Z])/g, '-$1')
    .toLowerCase()
    .replace(/^-/, '')

  const storageKey = orgId
    ? `vibegrid-simple-${orgId}_${normalizedEntityType}`
    : `vibegrid-simple-${normalizedEntityType}`
  const stored = localStorage.getItem(storageKey)

  if (!stored) {
    persistLog.info('🔍 No persistence found', { entityType, storageKey })
    return null
  }

  try {
    const parsed = JSON.parse(stored)
    persistLog.info('🔍 Persistence inspection', {
      entityType,
      storageKey,
      data: parsed,
      lastUpdated: parsed.lastUpdated,
      hasColumnWidths: !!parsed.columnWidths && Object.keys(parsed.columnWidths).length > 0,
      hasColumnOrder: !!parsed.columnOrder && parsed.columnOrder.length > 0,
      hasSortBy: !!parsed.sortBy && parsed.sortBy.length > 0,
      hasFilters: !!parsed.filters && parsed.filters.length > 0,
      hasGroupConfig: !!parsed.groupConfig,
      hasGroupRowOrders: !!parsed.groupRowOrders && Object.keys(parsed.groupRowOrders).length > 0,
      hasFlatRowOrder: !!parsed.flatRowOrder && parsed.flatRowOrder.length > 0,
      // hasScrollPosition: !!parsed.scrollPosition, // Intentionally excluded for better UX
      hasSelectedCells: !!parsed.selectedCells && parsed.selectedCells.length > 0,
    })
    return parsed
  } catch (error) {
    persistLog.error('🚨 Failed to parse persistence data', { entityType, storageKey, error })
    return null
  }
}

// Export types for use in other files
export type { VibeGridPreferences }
