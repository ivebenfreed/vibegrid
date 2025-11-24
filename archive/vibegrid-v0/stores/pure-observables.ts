/**
 * Pure Observable Architecture - Three Layer Separation
 *
 * This implements the pure observable design from PURE_OBSERVABLE_ARCHITECTURE.md
 * separating concerns into three distinct observable layers:
 * 1. tableCore$ - Data & Configuration
 * 2. tableInteraction$ - UI State (selection, editing)
 * 3. tableViewport$ - Scroll State
 */

import { batch, computed, observable } from '@legendapp/state'
import { ObservablePersistLocalStorage } from '@legendapp/state/persist-plugins/local-storage'
import { syncObservable } from '@legendapp/state/sync'
import {
  entityOperations,
  getEntity$,
  universeLoading$,
  universeOrgId$,
  universeSchema$,
  universeUserId$,
} from '@/legend-state/observables'
import { log } from '@/logger'
import type { Column, FilterConfig, GroupConfig, SortConfig } from '../types'

const fileLog = log('components/custom/vibegrid/stores/pure-observables.ts')

// ====================================
// TYPES
// ====================================

/**
 * Persistent table state interface - only configuration data that should be saved
 * Excludes transient UI state like selection, editing, hover, etc.
 */
export interface PersistedTableState {
  // Column configuration (persisted)
  columnWidths: Record<string, number>
  columnVisibility: Record<string, boolean>
  columnOrder: string[]

  // Data transformation configuration (persisted)
  sortBy: SortConfig[]
  filters: FilterConfig[]
  groupConfig: GroupConfig | null

  // Metadata
  version: string
  lastUpdated: string
  entityType: string
  orgId: string
  userId: string
}

export interface TableCoreState {
  entityType: string
  columns: Column[]
  columnOrder: string[]
  columnWidths: Record<string, number>
  columnVisibility: Record<string, boolean>
  sortBy: SortConfig[]
  filters: FilterConfig[]
  groupConfig: GroupConfig | null
}

export interface TableInteractionState {
  // Selection state
  selectedCells: Set<string>
  selectedRows: Set<string>
  anchorCell: string | null
  selectionMode: 'cell' | 'row' | 'range' | 'multi'
  isSelecting: boolean

  // Select all checkbox state
  selectAllCheckboxState: {
    checked: boolean
    indeterminate: boolean
  }

  // Editing state
  editingCell: string | null
  editValue: any
  isEditing: boolean
  editValidation: { isValid: boolean; message?: string } | null

  // Hover state
  hoveredCell: string | null
  hoveredRow: string | null

  // Drag state
  isDragging: boolean
  dragSource: string | null
  dragTarget: string | null

  // Resize state
  resizingColumn: string | null
  resizeStartX: number
  resizeStartWidth: number

  // UI Menu/Dropdown State
  headerMenuState: {
    openMenu: string | null // columnId of open menu
    position: { x: number; y: number }
    menuType: 'filter' | 'sort' | 'settings' | null
  }

  contextMenuState: {
    isOpen: boolean
    position: { x: number; y: number }
    context: 'cell' | 'row' | 'column' | 'header' | null
    targetId: string | null // cellId, rowId, or columnId
  }

  columnVisibilityMenuState: {
    isOpen: boolean
    searchValue: string
  }

  groupConfigMenuState: {
    isOpen: boolean
  }
}

export interface TableViewportState {
  scrollTop: number
  scrollLeft: number
  viewportWidth: number
  viewportHeight: number
  contentWidth: number
  contentHeight: number
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
        case 'contains':
          return String(value).toLowerCase().includes(String(filter.value).toLowerCase())
        case 'startsWith':
          return String(value).toLowerCase().startsWith(String(filter.value).toLowerCase())
        case 'endsWith':
          return String(value).toLowerCase().endsWith(String(filter.value).toLowerCase())
        case 'gt':
          return Number(value) > Number(filter.value)
        case 'gte':
          return Number(value) >= Number(filter.value)
        case 'lt':
          return Number(value) < Number(filter.value)
        case 'lte':
          return Number(value) <= Number(filter.value)
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

function applyGrouping(rows: any[], groupConfig: GroupConfig): any[] {
  if (!groupConfig || !groupConfig.fields || groupConfig.fields.length === 0) {
    return rows
  }

  fileLog.info('🎯 Applying grouping', {
    rowCount: rows.length,
    groupFields: groupConfig.fields.map((f) => f.field),
  })

  // Create hierarchical groups based on multiple grouping fields
  const groupTree = createGroupTree(rows, groupConfig.fields)

  // Flatten the tree into a virtual row array with group headers and data rows
  const virtualRows = flattenGroupTree(groupTree, groupConfig.expandedGroups)

  fileLog.info('🎯 Grouping applied', {
    originalRows: rows.length,
    virtualRows: virtualRows.length,
    groupCount: countGroups(groupTree),
  })

  return virtualRows
}

function createGroupTree(rows: any[], groupFields: GroupField[]): GroupNode[] {
  if (groupFields.length === 0) {
    return rows // Return raw rows when no grouping
  }

  // Group by the first field
  const firstField = groupFields[0]
  const groups: Map<any, any[]> = new Map()

  for (const row of rows) {
    const groupValue = row[firstField.field] || 'Ungrouped'

    if (!groups.has(groupValue)) {
      groups.set(groupValue, [])
    }
    groups.get(groupValue)!.push(row)
  }

  // Create group nodes
  const groupNodes: GroupNode[] = []

  for (const [groupValue, groupRows] of groups.entries()) {
    const displayValue = formatGroupValue(groupValue, firstField.field)
    const groupId = `group-${firstField.field}-${String(groupValue).replace(/[^a-zA-Z0-9]/g, '_')}`

    // Recursively create subgroups if there are more grouping fields
    const children =
      groupFields.length > 1 ? createGroupTree(groupRows, groupFields.slice(1)) : groupRows

    const groupNode: GroupNode = {
      id: groupId,
      field: firstField.field,
      value: groupValue,
      displayValue: displayValue,
      level: 0, // Will be set during flattening
      rowCount: groupRows.length,
      totalCount: groupRows.length,
      children: children,
      isCollapsed: false,
      summary: {
        count: groupRows.length,
        field: firstField.field,
        value: groupValue,
      },
    }

    groupNodes.push(groupNode)
  }

  // Sort groups if needed
  groupNodes.sort((a, b) => {
    return a.displayValue.localeCompare(b.displayValue)
  })

  return groupNodes
}

function flattenGroupTree(
  groupTree: GroupNode[],
  expandedGroups: Set<string>,
  level: number = 0,
): any[] {
  const result: any[] = []

  for (const node of groupTree) {
    if (node.field && node.displayValue) {
      // This is a GroupNode
      // Add the group header row
      const groupHeaderRow = {
        type: 'group',
        id: node.id,
        level: level,
        data: node,
        isExpandable: true,
        isExpanded: expandedGroups.has(node.id),
      }

      result.push(groupHeaderRow)

      // Add children if group is expanded
      if (expandedGroups.has(node.id)) {
        if (Array.isArray(node.children)) {
          for (const child of node.children) {
            if (child.field && child.displayValue) {
              // Another GroupNode
              // Recursive group
              result.push(...flattenGroupTree([child], expandedGroups, level + 1))
            } else {
              // Data row
              result.push({
                type: 'data',
                id: child.id,
                data: child,
                level: level + 1,
                parentGroupId: node.id,
              })
            }
          }
        }
      }
    } else {
      // Data row at root level (shouldn't happen with proper grouping)
      result.push({
        type: 'data',
        id: node.id,
        data: node,
        level: level,
      })
    }
  }

  return result
}

function formatGroupValue(value: any, field: string): string {
  if (value === null || value === undefined) {
    return 'Ungrouped'
  }

  if (typeof value === 'string' && value.trim() === '') {
    return 'Empty'
  }

  return String(value)
}

function countGroups(groupTree: GroupNode[]): number {
  let count = 0
  for (const node of groupTree) {
    if (node.field && node.displayValue) {
      // This is a GroupNode
      count++
      if (Array.isArray(node.children)) {
        count += countGroups(node.children.filter((child) => child.field && child.displayValue))
      }
    }
  }
  return count
}

// ====================================
// PERSISTENCE HELPERS
// ====================================

/**
 * Generate storage key for table state persistence
 * Format: vibestack_table_state_{orgId}_{entityName}_{userId}
 */
function generateTableStateKey(entityType: string): string | null {
  try {
    const orgId = universeOrgId$.peek()
    const userId = universeUserId$.peek()

    if (!orgId || !userId || orgId === 'universe') {
      fileLog.debug('🔧 Cannot generate storage key - missing context', { orgId, userId })
      return null
    }

    // Extract clean entity name without org prefix
    const cleanEntityName = entityType.includes('_')
      ? entityType.split('_').slice(1).join('_')
      : entityType

    const storageKey = `vibestack_table_state_${orgId}_${cleanEntityName}_${userId}`
    fileLog.debug('🔧 Generated table state storage key', { storageKey, entityType, orgId, userId })

    return storageKey
  } catch (error) {
    fileLog.error('❌ Error generating storage key', { error: error.message, entityType })
    return null
  }
}

/**
 * Create default table state from columns
 */
function createDefaultTableState(
  entityType: string,
  columns: Column[],
): Partial<PersistedTableState> {
  const orgId = universeOrgId$.peek()
  const userId = universeUserId$.peek()

  return {
    columnOrder: columns.map((col) => col.id),
    columnWidths: Object.fromEntries(columns.map((col) => [col.id, col.width || 150])),
    columnVisibility: Object.fromEntries(columns.map((col) => [col.id, true])),
    sortBy: [],
    filters: [],
    groupConfig: null,
    version: '1.0',
    lastUpdated: new Date().toISOString(),
    entityType,
    orgId: orgId || 'unknown',
    userId: userId || 'unknown',
  }
}

/**
 * Transform function to handle data migration between versions
 */
function transformTableState(
  loaded: any,
  defaultState: Partial<PersistedTableState>,
): PersistedTableState {
  if (!loaded || typeof loaded !== 'object') {
    fileLog.info('🔧 No saved state found, using defaults')
    return defaultState as PersistedTableState
  }

  // Handle version migrations
  if (loaded.version !== '1.0') {
    fileLog.info('🔧 Migrating table state from version', loaded.version, 'to 1.0')
    // Add migration logic here for future versions
  }

  // Merge loaded state with defaults to handle missing fields
  const merged = {
    ...defaultState,
    ...loaded,
    version: '1.0',
    lastUpdated: new Date().toISOString(),
  }

  fileLog.info('🔧 Restored table state with', {
    columns: Object.keys(merged.columnWidths || {}).length,
    sorts: merged.sortBy.length,
    filters: merged.filters.length,
    hasGrouping: !!merged.groupConfig,
  })

  return merged as PersistedTableState
}

/**
 * Load display state from localStorage using VibeGrid compatible key format
 * Uses vibegridx_display_{entityName} format for compatibility
 */
function loadDisplayState(entityType: string): Partial<PersistedTableState> | null {
  try {
    // Extract entity name from org-prefixed entityType (e.g., "01920000-1000-7000-8000-000000000001_TaskV2" -> "TaskV2")
    const entityName = entityType.includes('_') ? entityType.split('_').pop() : entityType
    const storageKey = `vibegridx_display_${entityName}`

    fileLog.debug('🔧 Loading display state', { entityType, entityName, storageKey })

    const stored = localStorage.getItem(storageKey)
    if (!stored) {
      fileLog.debug('🔧 No stored display state found', { storageKey })
      return null
    }

    const parsed = JSON.parse(stored)
    fileLog.info('🔧 Loaded display state from localStorage', { storageKey, state: parsed })
    return parsed
  } catch (error) {
    fileLog.error('❌ Error loading display state', { entityType, error: error.message })
    return null
  }
}

/**
 * Save display state to localStorage using VibeGrid compatible key format
 * Uses vibegridx_display_{entityName} format for compatibility
 */
function saveDisplayState(entityType: string, tableState: any): void {
  try {
    // Extract entity name from org-prefixed entityType (e.g., "01920000-1000-7000-8000-000000000001_TaskV2" -> "TaskV2")
    const entityName = entityType.includes('_') ? entityType.split('_').pop() : entityType
    const storageKey = `vibegridx_display_${entityName}`

    // Create state object matching VibeGrid format
    const displayState = {
      columnOrder: tableState.columnOrder,
      columnWidths: tableState.columnWidths,
      columnVisibility: tableState.columnVisibility,
      sortBy: tableState.sortBy,
      filters: tableState.filters,
      groupBy: tableState.groupConfig, // Note: using groupBy for compatibility
      version: '1.0',
      lastUpdated: new Date().toISOString(),
    }

    localStorage.setItem(storageKey, JSON.stringify(displayState))
    fileLog.info('🎯 TableCore: Saved persistent display state', { storageKey, displayState })
  } catch (error) {
    fileLog.error('❌ Error saving display state', { entityType, error: error.message })
  }
}

// ====================================
// LAYER 1: TABLE CORE (Data & Configuration) - WITH PERSISTENCE
// ====================================

export function createTableCore$(entityType: string, columns: Column[]) {
  fileLog.info('🎯 Creating tableCore$ observable with Legend State localStorage persistence', {
    entityType,
    columnCount: columns.length,
  })

  // Create default state structure
  const defaultState = createDefaultTableState(entityType, columns)
  fileLog.info('🎯 Default state created', { entityType, defaultSortBy: defaultState.sortBy })

  // Extract clean entity name for storage key (remove org prefix)
  const cleanEntityName = entityType.includes('_') ? entityType.split('_').pop() : entityType
  const storageKey = `vibegridx_display_${cleanEntityName}`

  // Create the core observable with default values
  const tableCore$ = observable({
    // Entity metadata
    entityType,
    columns,

    // Persistent configuration state (will be synchronized with localStorage)
    columnOrder: defaultState.columnOrder,
    columnWidths: defaultState.columnWidths,
    columnVisibility: defaultState.columnVisibility,
    sortBy: defaultState.sortBy,
    filters: defaultState.filters,
    groupConfig: defaultState.groupConfig,

    // Computed processed data (lazy)
    get processedRows() {
      // Check if universe schema is ready before getting entity
      const loading = universeLoading$.get()
      const schema = universeSchema$.get()

      if (loading || !schema?.entities || !schema.entities[entityType]) {
        fileLog.debug('⏳ Schema not ready for processedRows', { entityType, loading })
        return []
      }

      // Get entity observable directly like atomic bridge does
      const entityObs = getEntity$(entityType)
      const sortBy = tableCore$.sortBy.get()
      const filters = tableCore$.filters.get()
      const groupConfig = tableCore$.groupConfig.get()

      // Get the data from the entity observable
      let data = {}
      if (entityObs) {
        try {
          // Direct .get() call like atomic bridge
          data = entityObs.get() || {}
          fileLog.debug('✅ Got entity data', {
            entityType,
            recordCount: Object.keys(data || {}).length,
          })
        } catch (error) {
          fileLog.error('❌ Failed to get entity data', { entityType, error: error.message })
          data = {}
        }
      } else {
        fileLog.warn('⚠️ Entity observable not available', { entityType })
      }

      let rows = Object.values(data || {})

      rows = applyFilters(rows, filters)
      rows = applySorting(rows, sortBy)

      // Apply grouping if configured
      if (groupConfig) {
        rows = applyGrouping(rows, groupConfig)
      }

      fileLog.info('🎯 Processed rows computed', {
        entityObservable: !!entityObs,
        inputCount: Object.keys(data || {}).length,
        outputCount: rows.length,
        hasFilters: filters.length > 0,
        hasSorting: sortBy.length > 0,
        hasGrouping: !!groupConfig,
      })

      return rows
    },

    // Direct manipulation methods with automatic persistence
    toggleSort(field: string, isMultiSort: boolean = false) {
      const current = tableCore$.sortBy.get()
      const index = current.findIndex((s) => s.field === field)

      fileLog.debug('toggleSort called', {
        field,
        isMultiSort,
        currentSort: current,
        fieldIndex: index,
        beforeSort: JSON.stringify(current),
      })

      batch(() => {
        if (index === -1) {
          // Add new sort - either replace all or add to existing based on multi-sort mode
          if (isMultiSort) {
            const newSort = [...current, { field, direction: 'asc' }]
            fileLog.debug('Adding new sort field to multi-sort', { newSort })
            tableCore$.sortBy.set(newSort)
          } else {
            const newSort = [{ field, direction: 'asc' }]
            fileLog.debug('Setting single sort field', { newSort })
            tableCore$.sortBy.set(newSort)
          }
        } else if (current[index].direction === 'asc') {
          // Change to desc
          const newSort = [...current]
          newSort[index] = { ...current[index], direction: 'desc' }
          fileLog.debug('Changing sort direction to desc', { field, newSort })
          tableCore$.sortBy.set(newSort)
        } else {
          // Third click: remove this sort field entirely (allow unsorted state)
          const newSort = current.filter((_, i) => i !== index)
          fileLog.debug('Removing sort field', { field, newSort })
          tableCore$.sortBy.set(newSort)
        }

        // Save to localStorage using Legend State syncObservable
        // The persistence should happen automatically through syncObservable
      })

      const finalSort = tableCore$.sortBy.get()
      fileLog.info('Sort toggled - checking persistence', {
        field,
        isMultiSort,
        finalSort,
        afterSort: JSON.stringify(finalSort),
        storageKey: `vibestack-table-${entityType}`,
      })

      // Check what's actually in localStorage
      try {
        const stored = localStorage.getItem(`vibestack-table-${entityType}`)
        fileLog.debug('Current localStorage content after sort change', {
          storageKey: `vibestack-table-${entityType}`,
          storedValue: stored,
          parsedValue: stored ? JSON.parse(stored) : null,
        })
      } catch (e) {
        fileLog.error('Failed to read localStorage after sort change', { error: e.message })
      }
    },

    setFilter(field: string, value: any, operator: string = 'contains') {
      batch(() => {
        const filters = tableCore$.filters.get()
        const existingIndex = filters.findIndex((f) => f.field === field)

        if (existingIndex !== -1) {
          filters[existingIndex] = { field, value, operator }
        } else {
          filters.push({ field, value, operator })
        }

        tableCore$.filters.set([...filters])
        // persistObservable will automatically persist changes
      })

      fileLog.info('🎯 Filter set (auto-persistent)', { field, value, operator })
    },

    clearFilter(field: string) {
      const filters = tableCore$.filters.get()
      tableCore$.filters.set(filters.filter((f) => f.field !== field))
      // persistObservable automatically persists changes
      fileLog.info('🎯 Filter cleared (auto-persistent)', { field })
    },

    toggleColumn(columnId: string) {
      const visibility = tableCore$.columnVisibility.get()
      tableCore$.columnVisibility.set({
        ...visibility,
        [columnId]: !visibility[columnId],
      })
      // Note: Selection clearing is handled by the calling component
      // persistObservable automatically persists changes

      fileLog.info('🎯 Column toggled (auto-persistent)', {
        columnId,
        visible: !visibility[columnId],
      })
    },

    setColumnWidth(columnId: string, width: number) {
      const widths = tableCore$.columnWidths.get()
      tableCore$.columnWidths.set({
        ...widths,
        [columnId]: width,
      })
      // persistObservable automatically persists changes

      fileLog.info('🎯 Column width set (auto-persistent)', { columnId, width })
    },

    // Update column width (for resize overlay)
    updateColumnWidth(columnId: string, width: number) {
      batch(() => {
        const widths = { ...tableCore$.columnWidths.get() }
        widths[columnId] = width
        tableCore$.columnWidths.set(widths)

        // Update columns array
        const columns = [...tableCore$.columns.get()]
        const colIndex = columns.findIndex((c) => c.id === columnId)
        if (colIndex >= 0) {
          columns[colIndex] = { ...columns[colIndex], width }
          tableCore$.columns.set(columns)
        }

        // syncObservable automatically persists changes to localStorage
      })

      fileLog.info('🎯 Column width updated (auto-persistent)', { columnId, width })
    },

    // Reorder columns (for column drag and drop)
    reorderColumn(sourceColumnId: string, targetColumnId: string) {
      batch(() => {
        const columns = [...tableCore$.columns.get()]
        const sourceIndex = columns.findIndex((c) => c.id === sourceColumnId)
        const targetIndex = columns.findIndex((c) => c.id === targetColumnId)

        if (sourceIndex === -1 || targetIndex === -1) {
          fileLog.warn('⚠️ Column reorder failed: column not found', {
            sourceColumnId,
            targetColumnId,
            sourceIndex,
            targetIndex,
          })
          return
        }

        // Remove source column and insert at target position
        const [sourceColumn] = columns.splice(sourceIndex, 1)
        columns.splice(targetIndex, 0, sourceColumn)

        tableCore$.columns.set(columns)

        // syncObservable automatically persists changes to localStorage
      })

      fileLog.info('🎯 Column reordered (auto-persistent)', {
        sourceColumnId,
        targetColumnId,
      })
    },

    setGroupConfig(config: GroupConfig | null) {
      tableCore$.groupConfig.set(config)
      // persistObservable automatically persists changes
      fileLog.info('🎯 Group config set (auto-persistent)', { config })
    },

    toggleGroupExpansion(groupId: string) {
      const groupConfig = tableCore$.groupConfig.get()
      if (!groupConfig) return

      const expandedGroups = new Set(groupConfig.expandedGroups)

      if (expandedGroups.has(groupId)) {
        expandedGroups.delete(groupId)
        fileLog.info('🎯 Group collapsed', { groupId })
      } else {
        expandedGroups.add(groupId)
        fileLog.info('🎯 Group expanded', { groupId })
      }

      tableCore$.groupConfig.set({
        ...groupConfig,
        expandedGroups,
      })
      // persistObservable automatically persists changes
    },

    expandAllGroups() {
      const groupConfig = tableCore$.groupConfig.get()
      if (!groupConfig) return

      // This would require getting all group IDs from the processed rows
      // For now, just log the intent
      fileLog.info('🎯 Expand all groups requested')
      // TODO: Implement when we have access to all group IDs
    },

    collapseAllGroups() {
      const groupConfig = tableCore$.groupConfig.get()
      if (!groupConfig) return

      tableCore$.groupConfig.set({
        ...groupConfig,
        expandedGroups: new Set(),
      })
      // persistObservable automatically persists changes

      fileLog.info('🎯 All groups collapsed (auto-persistent)')
    },

    // Column visibility methods
    showAllColumns() {
      const visibility = tableCore$.columnVisibility.get()
      const allVisible = Object.fromEntries(Object.keys(visibility || {}).map((key) => [key, true]))
      tableCore$.columnVisibility.set(allVisible)
      // Note: Selection clearing is handled by the calling component
      // persistObservable automatically persists changes
      fileLog.info('🎯 All columns shown (auto-persistent)')
    },

    hideAllColumns() {
      const columns = tableCore$.columns
      const visibility = tableCore$.columnVisibility.get()

      // Only hide columns that are hideable (not required)
      const newVisibility = Object.fromEntries(
        Object.keys(visibility || {}).map((key) => {
          const column = columns.find((col) => col.id === key)
          const canHide = column?.hideable !== false
          return [key, canHide ? false : visibility[key]]
        }),
      )

      tableCore$.columnVisibility.set(newVisibility)
      // Note: Selection clearing is handled by the calling component
      // persistObservable automatically persists changes
      fileLog.info('🎯 All hideable columns hidden (auto-persistent)')
    },

    // Helper getters
    get hiddenColumnCount() {
      const visibility = tableCore$.columnVisibility.get()
      return Object.values(visibility).filter((visible) => visible === false).length
    },

    get visibleColumnCount() {
      const visibility = tableCore$.columnVisibility.get()
      return Object.values(visibility).filter((visible) => visible !== false).length
    },
  })

  // Configure simplified localStorage persistence using syncObservable without complex transforms
  let tableCoreSync$ = null
  try {
    fileLog.debug('Configuring syncObservable for localStorage persistence', {
      entityType,
      storageKey,
    })

    tableCoreSync$ = syncObservable(tableCore$, {
      persist: {
        name: storageKey,
        plugin: ObservablePersistLocalStorage,
      },
    })

    fileLog.debug('syncObservable configured successfully', {
      entityType,
      storageKey,
      hasSyncObservable: !!tableCoreSync$,
      currentSortByAfterInit: tableCore$.sortBy.get(),
    })

    fileLog.info('🎯 Simplified Legend State localStorage persistence configured', {
      entityType,
      storageKey,
      currentSortByAfterInit: tableCore$.sortBy.get(),
    })
  } catch (error) {
    console.error('🔧 PERSISTENCE DEBUG: Failed to configure syncObservable', { entityType, error })
    fileLog.error('❌ Failed to configure Legend State persistence', {
      entityType,
      error: error.message,
    })
  }

  // Return the observable with sync state
  return {
    tableCore$,
    tableCoreSync$, // syncObservable returns the sync state observable
  }
}

// ====================================
// LAYER 2: TABLE INTERACTION (UI State - Isolated)
// ====================================

export function createTableInteraction$(tableCore$?: any) {
  fileLog.info('🎯 Creating tableInteraction$ observable')

  const tableInteraction$ = observable({
    // Selection state
    selectedCells: new Set<string>(),
    selectedRows: new Set<string>(),
    anchorCell: null as string | null,
    selectionMode: 'cell' as 'cell' | 'row' | 'range' | 'multi',
    isSelecting: false,

    // Select all checkbox state (computed)
    selectAllCheckboxState: computed(() => {
      if (!tableCore$) {
        return { checked: false, indeterminate: false }
      }

      const selectedCells = tableInteraction$.selectedCells.get()
      const processedRows = tableCore$.processedRows.get()
      const columns = tableCore$.columns.get()
      const visibleColumns = columns.filter((col: any) => {
        const visibility = tableCore$.columnVisibility.get()
        return visibility[col.id] !== false
      })

      const totalCells = processedRows.length * visibleColumns.length
      const selectedCount = selectedCells.size

      if (selectedCount === 0) {
        return { checked: false, indeterminate: false }
      } else if (selectedCount === totalCells) {
        return { checked: true, indeterminate: false }
      } else {
        return { checked: false, indeterminate: true }
      }
    }),

    // Editing state
    editingCell: null as string | null,
    editValue: null as any,
    isEditing: false,
    editValidation: null as { isValid: boolean; message?: string } | null,

    // Hover state
    hoveredCell: null as string | null,
    hoveredRow: null as string | null,

    // Drag state
    isDragging: false,
    dragSource: null as { row: string; column: string } | null,
    dragTarget: null as { row: string; column: string } | null,

    // Drag selection state (for drag-to-select ranges)
    isDragSelecting: false,
    dragSelectStart: null as string | null,
    dragSelectCurrent: null as string | null,

    // Resize state
    resizingColumn: null as string | null,
    resizeStartX: 0,
    resizeStartWidth: 0,

    // Column resize state for overlay
    columnResize: null as {
      isResizing: boolean
      columnId: string
      startWidth: number
      newWidth: number
    } | null,

    // UI Menu/Dropdown State
    headerMenuState: {
      openMenu: null as string | null, // columnId of open menu
      position: { x: 0, y: 0 },
      menuType: null as 'filter' | 'sort' | 'settings' | null,
    },

    contextMenuState: {
      isOpen: false,
      position: { x: 0, y: 0 },
      context: null as 'cell' | 'row' | 'column' | 'header' | null,
      targetId: null as string | null, // cellId, rowId, or columnId
    },

    columnVisibilityMenuState: {
      isOpen: false,
      searchValue: '',
    },

    groupConfigMenuState: {
      isOpen: false,
    },

    // Direct manipulation methods
    selectCell(cellId: string, isMulti: boolean = false) {
      batch(() => {
        const cells = new Set(tableInteraction$.selectedCells.get())
        if (!isMulti) cells.clear()
        cells.add(cellId)
        tableInteraction$.selectedCells.set(cells)
        tableInteraction$.selectionMode.set('cell')
        tableInteraction$.anchorCell.set(cellId)
      })

      fileLog.info('🎯 Cell selected', { cellId, isMulti })
    },

    toggleCellSelection(
      rowId: string,
      columnId: string,
      isCtrlKey: boolean = false,
      isShiftKey: boolean = false,
    ) {
      const cellId = `${rowId}:${columnId}`
      batch(() => {
        const cells = new Set(tableInteraction$.selectedCells.get())

        if (isShiftKey && tableInteraction$.anchorCell.get()) {
          // Shift+click for range selection
          tableInteraction$.selectRange(tableInteraction$.anchorCell.get()!, cellId)
        } else if (isCtrlKey) {
          // Ctrl/Cmd+click for multi-selection toggle
          if (cells.has(cellId)) {
            cells.delete(cellId)
          } else {
            cells.add(cellId)
          }
          tableInteraction$.selectedCells.set(cells)
          if (!tableInteraction$.anchorCell.get()) {
            tableInteraction$.anchorCell.set(cellId)
          }
        } else {
          // Single click - clear and select only this cell
          cells.clear()
          cells.add(cellId)
          tableInteraction$.selectedCells.set(cells)
          tableInteraction$.anchorCell.set(cellId)
        }

        tableInteraction$.selectionMode.set('cell')
      })

      fileLog.info('🎯 Cell selection toggled', {
        cellId,
        isCtrlKey,
        isShiftKey,
        selectedCount: tableInteraction$.selectedCells.get().size,
      })
    },

    selectRow(rowId: string, isMulti: boolean = false) {
      batch(() => {
        const rows = new Set(tableInteraction$.selectedRows.get())
        if (!isMulti) rows.clear()
        rows.add(rowId)
        tableInteraction$.selectedRows.set(rows)
        tableInteraction$.selectionMode.set('row')
      })

      fileLog.info('🎯 Row selected', { rowId, isMulti })
    },

    selectRange(startCell: string, endCell: string) {
      batch(() => {
        tableInteraction$.selectionMode.set('range')
        tableInteraction$.anchorCell.set(startCell)

        // Calculate rectangular range selection
        const cells = new Set<string>()

        if (tableCore$) {
          // Parse start and end cell coordinates
          const [startRowId, startColId] = startCell.split(':')
          const [endRowId, endColId] = endCell.split(':')

          // Get current processed rows and columns
          const processedRows = tableCore$.processedRows.get()
          const columns = tableCore$.columns.get()

          // Find indices of start and end positions
          const startRowIndex = processedRows.findIndex((row: any) => row.id === startRowId)
          const endRowIndex = processedRows.findIndex((row: any) => row.id === endRowId)
          const startColIndex = columns.findIndex((col: any) => col.id === startColId)
          const endColIndex = columns.findIndex((col: any) => col.id === endColId)

          // Calculate rectangular bounds
          const minRowIndex = Math.min(startRowIndex, endRowIndex)
          const maxRowIndex = Math.max(startRowIndex, endRowIndex)
          const minColIndex = Math.min(startColIndex, endColIndex)
          const maxColIndex = Math.max(startColIndex, endColIndex)

          // Select all cells in the rectangle
          for (let r = minRowIndex; r <= maxRowIndex; r++) {
            for (let c = minColIndex; c <= maxColIndex; c++) {
              if (r >= 0 && r < processedRows.length && c >= 0 && c < columns.length) {
                const rowId = processedRows[r].id
                const columnId = columns[c].id
                cells.add(`${rowId}:${columnId}`)
              }
            }
          }

          fileLog.info('🎯 Rectangular range selected', {
            startCell,
            endCell,
            bounds: { minRowIndex, maxRowIndex, minColIndex, maxColIndex },
            selectedCount: cells.size,
          })
        } else {
          // Fallback to just start and end cells if no tableCore$ access
          cells.add(startCell)
          cells.add(endCell)
        }

        tableInteraction$.selectedCells.set(cells)
      })

      fileLog.info('🎯 Range selected', {
        startCell,
        endCell,
        selectedCount: tableInteraction$.selectedCells.get().size,
      })
    },

    // Drag selection methods
    startDragSelection(cellId: string) {
      batch(() => {
        tableInteraction$.isDragSelecting.set(true)
        tableInteraction$.dragSelectStart.set(cellId)
        tableInteraction$.dragSelectCurrent.set(cellId)

        // Start with single cell selection
        const cells = new Set<string>()
        cells.add(cellId)
        tableInteraction$.selectedCells.set(cells)
        tableInteraction$.anchorCell.set(cellId)
        tableInteraction$.selectionMode.set('range')
      })

      fileLog.info('🎯 Drag selection started', { cellId })
    },

    updateDragSelection(cellId: string) {
      if (!tableInteraction$.isDragSelecting.get()) return

      const startCell = tableInteraction$.dragSelectStart.get()
      if (!startCell) return

      batch(() => {
        tableInteraction$.dragSelectCurrent.set(cellId)

        // Calculate rectangular range selection
        const cells = new Set<string>()

        if (tableCore$) {
          // Parse start and end cell coordinates
          const [startRowId, startColId] = startCell.split(':')
          const [endRowId, endColId] = cellId.split(':')

          // Get current processed rows and columns
          const processedRows = tableCore$.processedRows.get()
          const columns = tableCore$.columns.get()

          // Find indices of start and end positions
          const startRowIndex = processedRows.findIndex((row: any) => row.id === startRowId)
          const endRowIndex = processedRows.findIndex((row: any) => row.id === endRowId)
          const startColIndex = columns.findIndex((col: any) => col.id === startColId)
          const endColIndex = columns.findIndex((col: any) => col.id === endColId)

          // Calculate rectangular bounds
          const minRowIndex = Math.min(startRowIndex, endRowIndex)
          const maxRowIndex = Math.max(startRowIndex, endRowIndex)
          const minColIndex = Math.min(startColIndex, endColIndex)
          const maxColIndex = Math.max(startColIndex, endColIndex)

          // Select all cells in the rectangle
          for (let r = minRowIndex; r <= maxRowIndex; r++) {
            for (let c = minColIndex; c <= maxColIndex; c++) {
              if (r >= 0 && r < processedRows.length && c >= 0 && c < columns.length) {
                const rowId = processedRows[r].id
                const columnId = columns[c].id
                cells.add(`${rowId}:${columnId}`)
              }
            }
          }

          fileLog.info('🎯 Rectangular range calculated', {
            startCell,
            endCell: cellId,
            bounds: { minRowIndex, maxRowIndex, minColIndex, maxColIndex },
            selectedCount: cells.size,
          })
        } else {
          // Fallback to just start and end cells if no tableCore$ access
          cells.add(startCell)
          cells.add(cellId)
        }

        tableInteraction$.selectedCells.set(cells)
      })

      fileLog.info('🎯 Drag selection updated', {
        startCell,
        currentCell: cellId,
        selectedCount: tableInteraction$.selectedCells.get().size,
      })
    },

    endDragSelection() {
      batch(() => {
        tableInteraction$.isDragSelecting.set(false)
        tableInteraction$.dragSelectStart.set(null)
        tableInteraction$.dragSelectCurrent.set(null)
      })

      fileLog.info('🎯 Drag selection ended')
    },

    clearSelection() {
      batch(() => {
        tableInteraction$.selectedCells.set(new Set())
        tableInteraction$.selectedRows.set(new Set())
        tableInteraction$.anchorCell.set(null)
        tableInteraction$.isSelecting.set(false)
      })

      fileLog.info('🎯 Selection cleared')
    },

    startEdit(cellId: string, initialValue?: any) {
      batch(() => {
        tableInteraction$.editingCell.set(cellId)
        tableInteraction$.editValue.set(initialValue || '')
        tableInteraction$.isEditing.set(true)
        tableInteraction$.editValidation.set(null)
      })

      fileLog.info('🎯 Edit started', { cellId, initialValue })
    },

    updateEditValue(value: any) {
      tableInteraction$.editValue.set(value)
    },

    validateEdit(isValid: boolean, message?: string) {
      tableInteraction$.editValidation.set({ isValid, message })
    },

    async saveEdit(valueOverride?: any) {
      const cellId = tableInteraction$.editingCell.get()
      // If valueOverride is provided, use it; otherwise use the current edit value
      const value = valueOverride !== undefined ? valueOverride : tableInteraction$.editValue.get()

      fileLog.debug('saveEdit called', {
        cellId,
        valueOverride,
        editValueFromObservable: tableInteraction$.editValue.get(),
        finalValue: value,
        usingOverride: valueOverride !== undefined,
      })

      if (cellId) {
        const [rowId, columnId] = cellId.split(':')

        fileLog.info('🎯 Saving edit', { cellId, value, rowId, columnId })

        // Ensure we have a valid tableCore$ reference
        if (!tableCore$) {
          throw new Error('tableCore$ is not available in saveEdit method')
        }

        // Get the entity type from the tableCore$ - make sure to get the actual value, not observable
        const entityType = tableCore$.entityType.get
          ? tableCore$.entityType.get()
          : tableCore$.entityType

        try {
          fileLog.info('🔄 Attempting to save edit', { entityType, rowId, columnId, value })

          // CORRECT LEGEND STATE PATTERN: Use syncedCrud with .get() and .set()
          // Import the correct entity operations
          const { getUniverseEntity$, entityOperations } = await import(
            '@/legend-state/observables'
          )

          // Use the org-prefixed entity name directly
          // Legend State getEntity$() expects org-prefixed names for proper lookup
          const orgPrefixedEntityName = entityType

          fileLog.info('🔄 Using entityOperations.updateEntity for database persistence', {
            originalEntityType: entityType,
            orgPrefixedEntityName: orgPrefixedEntityName,
            rowId,
            columnId,
            value,
          })

          await entityOperations.updateEntity(orgPrefixedEntityName, rowId, {
            [columnId]: value,
          })

          fileLog.info('✅ Edit saved successfully via syncedCrud', {
            entityType,
            rowId,
            columnId,
            value,
          })
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error)
          fileLog.error('❌ Error saving edit', { cellId, value, error: errorMessage })

          // Show user-friendly error
          if (typeof window !== 'undefined') {
            window.dispatchEvent(
              new CustomEvent('vibestack:edit-error', {
                detail: {
                  entityType: entityType,
                  rowId,
                  columnId,
                  value,
                  error: errorMessage,
                },
              }),
            )
          }
        }
      }

      tableInteraction$.cancelEdit()
    },

    cancelEdit() {
      batch(() => {
        tableInteraction$.editingCell.set(null)
        tableInteraction$.editValue.set(null)
        tableInteraction$.isEditing.set(false)
        tableInteraction$.editValidation.set(null)
      })

      fileLog.info('🎯 Edit cancelled')
    },

    setHoveredCell(cellId: string | null) {
      tableInteraction$.hoveredCell.set(cellId)
    },

    setHoveredRow(rowId: string | null) {
      tableInteraction$.hoveredRow.set(rowId)
    },

    startDrag(sourceId: string) {
      batch(() => {
        tableInteraction$.isDragging.set(true)
        tableInteraction$.dragSource.set(sourceId)
      })

      fileLog.info('🎯 Drag started', { sourceId })
    },

    updateDragTarget(targetId: string | null) {
      tableInteraction$.dragTarget.set(targetId)
    },

    endDrag() {
      const source = tableInteraction$.dragSource.get()
      const target = tableInteraction$.dragTarget.get()

      if (source && target && source !== target) {
        fileLog.info('🎯 Drag completed', { source, target })
        // Implement actual drag logic here
      }

      batch(() => {
        tableInteraction$.isDragging.set(false)
        tableInteraction$.dragSource.set(null)
        tableInteraction$.dragTarget.set(null)
      })
    },

    startColumnResize(columnId: string, startX: number, startWidth: number) {
      batch(() => {
        tableInteraction$.resizingColumn.set(columnId)
        tableInteraction$.resizeStartX.set(startX)
        tableInteraction$.resizeStartWidth.set(startWidth)
      })

      fileLog.info('🎯 Column resize started', { columnId, startX, startWidth })
    },

    endColumnResize() {
      tableInteraction$.resizingColumn.set(null)
      fileLog.info('🎯 Column resize ended')
    },

    // Header Menu Methods
    openHeaderMenu(
      columnId: string,
      position: { x: number; y: number },
      menuType: 'filter' | 'sort' | 'settings',
    ) {
      batch(() => {
        tableInteraction$.headerMenuState.set({
          openMenu: columnId,
          position,
          menuType,
        })
      })

      fileLog.info('🎯 Header menu opened', { columnId, position, menuType })
    },

    closeHeaderMenu() {
      tableInteraction$.headerMenuState.set({
        openMenu: null,
        position: { x: 0, y: 0 },
        menuType: null,
      })

      fileLog.info('🎯 Header menu closed')
    },

    // Context Menu Methods
    openContextMenu(
      context: 'cell' | 'row' | 'column' | 'header',
      targetId: string,
      position: { x: number; y: number },
    ) {
      batch(() => {
        tableInteraction$.contextMenuState.set({
          isOpen: true,
          position,
          context,
          targetId,
        })
      })

      fileLog.info('🎯 Context menu opened', { context, targetId, position })
    },

    closeContextMenu() {
      tableInteraction$.contextMenuState.set({
        isOpen: false,
        position: { x: 0, y: 0 },
        context: null,
        targetId: null,
      })

      fileLog.info('🎯 Context menu closed')
    },

    // Column Visibility Menu Methods
    openColumnVisibilityMenu() {
      tableInteraction$.columnVisibilityMenuState.set({
        isOpen: true,
        searchValue: '',
      })

      fileLog.info('🎯 Column visibility menu opened')
    },

    closeColumnVisibilityMenu() {
      tableInteraction$.columnVisibilityMenuState.set({
        isOpen: false,
        searchValue: '',
      })

      fileLog.info('🎯 Column visibility menu closed')
    },

    setColumnVisibilitySearch(searchValue: string) {
      tableInteraction$.columnVisibilityMenuState.searchValue.set(searchValue)
    },

    // Group Config Menu Methods
    openGroupConfigMenu() {
      tableInteraction$.groupConfigMenuState.set({
        isOpen: true,
      })

      fileLog.info('🎯 Group config menu opened')
    },

    closeGroupConfigMenu() {
      tableInteraction$.groupConfigMenuState.set({
        isOpen: false,
      })

      fileLog.info('🎯 Group config menu closed')
    },
  })

  return tableInteraction$
}

// ====================================
// LAYER 3: TABLE VIEWPORT (Scroll State - Completely Independent)
// ====================================

export function createTableViewport$(tableCore$?: any) {
  fileLog.info('🎯 Creating tableViewport$ observable')

  const tableViewport$ = observable({
    // Scroll position
    scrollTop: 0,
    scrollLeft: 0,

    // Viewport dimensions
    viewportWidth: 0,
    viewportHeight: 0,

    // Content dimensions
    contentWidth: 0,
    contentHeight: 0,

    // Visible range (computed from scroll)
    visibleRange: computed(() => {
      const top = tableViewport$.scrollTop.get()
      const height = tableViewport$.viewportHeight.get()
      const rowHeight = 40 // TODO: Make this configurable

      const start = Math.floor(top / rowHeight)
      const end = Math.ceil((top + height) / rowHeight)

      return {
        start: Math.max(0, start - 5), // 5 row buffer
        end: end + 5, // 5 row buffer
      }
    }),

    // Visible columns (computed from horizontal scroll)
    visibleColumns: computed(() => {
      const left = tableViewport$.scrollLeft.get()
      const width = tableViewport$.viewportWidth.get()

      // Safety check - if no tableCore$ available, return default range
      if (!tableCore$) {
        return { start: 0, end: 0 }
      }

      const columns = tableCore$.columns.get()
      const columnVisibility = tableCore$.columnVisibility.get()
      const ROW_HEADER_WIDTH = 40 // Fixed width of row header column

      if (!columns || columns.length === 0 || width === 0) {
        return { start: 0, end: 0 }
      }

      // Get visible columns only (filtered by visibility)
      const visibleColumns = columns.filter((col) => columnVisibility[col.id] !== false)

      if (visibleColumns.length === 0) {
        return { start: 0, end: 0 }
      }

      // Calculate column positions (account for row header width)
      let currentX = ROW_HEADER_WIDTH
      const columnPositions = visibleColumns.map((col, index) => {
        const colX = currentX
        currentX += col.width || 150 // Default column width 150px
        return {
          index,
          x: colX,
          width: col.width || 150,
          right: currentX,
        }
      })

      // Find visible range based on scroll position
      let startIndex = 0
      let endIndex = visibleColumns.length

      // Find start index - first column that intersects with visible area
      for (let i = 0; i < columnPositions.length; i++) {
        if (columnPositions[i].right > left) {
          startIndex = i
          break
        }
      }

      // Find end index - last column that intersects with visible area
      const rightBound = left + width
      for (let i = columnPositions.length - 1; i >= 0; i--) {
        if (columnPositions[i].x < rightBound) {
          endIndex = i + 1
          break
        }
      }

      // Add buffer for smooth scrolling (5 columns on each side for better performance)
      const bufferSize = 5
      const bufferedStart = Math.max(0, startIndex - bufferSize)
      const bufferedEnd = Math.min(visibleColumns.length, endIndex + bufferSize)

      return {
        start: bufferedStart,
        end: bufferedEnd,
      }
    }),

    // Direct manipulation methods
    updateScroll(top: number, left: number) {
      batch(() => {
        tableViewport$.scrollTop.set(top)
        tableViewport$.scrollLeft.set(left)
      })

      fileLog.debug('🎯 Scroll updated', { top, left })
    },

    updateViewport(width: number, height: number) {
      batch(() => {
        tableViewport$.viewportWidth.set(width)
        tableViewport$.viewportHeight.set(height)
      })

      fileLog.info('🎯 Viewport updated', { width, height })
    },

    updateContent(width: number, height: number) {
      batch(() => {
        tableViewport$.contentWidth.set(width)
        tableViewport$.contentHeight.set(height)
      })

      fileLog.info('🎯 Content dimensions updated', { width, height })
    },

    scrollToRow(rowIndex: number) {
      const rowHeight = 40
      const newTop = rowIndex * rowHeight
      tableViewport$.scrollTop.set(newTop)

      fileLog.info('🎯 Scrolled to row', { rowIndex, scrollTop: newTop })
    },

    scrollToColumn(columnIndex: number, columnWidths: number[]) {
      let newLeft = 0
      for (let i = 0; i < columnIndex && i < columnWidths.length; i++) {
        newLeft += columnWidths[i]
      }
      tableViewport$.scrollLeft.set(newLeft)

      fileLog.info('🎯 Scrolled to column', { columnIndex, scrollLeft: newLeft })
    },

    ensureCellVisible(rowIndex: number, columnIndex: number, columnWidths: number[]) {
      const rowHeight = 40
      const rowTop = rowIndex * rowHeight
      const rowBottom = rowTop + rowHeight

      const currentTop = tableViewport$.scrollTop.get()
      const viewportHeight = tableViewport$.viewportHeight.get()
      const currentBottom = currentTop + viewportHeight

      // Adjust vertical scroll if needed
      if (rowTop < currentTop) {
        tableViewport$.scrollTop.set(rowTop)
      } else if (rowBottom > currentBottom) {
        tableViewport$.scrollTop.set(rowBottom - viewportHeight)
      }

      // Adjust horizontal scroll if needed
      let columnLeft = 0
      for (let i = 0; i < columnIndex && i < columnWidths.length; i++) {
        columnLeft += columnWidths[i]
      }
      const columnRight = columnLeft + (columnWidths[columnIndex] || 150)

      const currentLeft = tableViewport$.scrollLeft.get()
      const viewportWidth = tableViewport$.viewportWidth.get()
      const currentRight = currentLeft + viewportWidth

      if (columnLeft < currentLeft) {
        tableViewport$.scrollLeft.set(columnLeft)
      } else if (columnRight > currentRight) {
        tableViewport$.scrollLeft.set(columnRight - viewportWidth)
      }

      fileLog.info('🎯 Ensured cell visible', { rowIndex, columnIndex })
    },
  })

  return tableViewport$
}

// ====================================
// FACTORY FUNCTION
// ====================================

export function createPureObservables(entityType: string, columns: Column[]) {
  fileLog.info('🎯 Creating pure observables for table', { entityType, columns: columns.length })

  const { tableCore$, tableCoreSync$ } = createTableCore$(entityType, columns)

  return {
    tableCore$,
    tableCoreSync$,
    tableInteraction$: createTableInteraction$(tableCore$),
    tableViewport$: createTableViewport$(tableCore$),
  }
}

// Export types for external use
export type TableCore$ = ReturnType<typeof createTableCore$>
export type TableInteraction$ = ReturnType<typeof createTableInteraction$>
export type TableViewport$ = ReturnType<typeof createTableViewport$>
