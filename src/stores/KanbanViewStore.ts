/**
 * KanbanViewStore - Manages Kanban board state
 *
 * Handles:
 * - Grouping field (which column to group cards by, default 'status')
 * - Column ordering and visibility
 * - Card drag state between columns
 * - Status color mapping
 */

import { action, computed, makeObservable, observable, runInAction } from 'mobx'
import type { IStore } from '@/app/stores/types'
import { getLogger } from '@/shared/lib/logging'
import type { TableCoreStore } from './TableCoreStore'

const logger = getLogger(['vibegrid', 'stores', 'KanbanViewStore'])

// ====================================
// TYPES
// ====================================

/** Status option with color metadata from schema */
export interface StatusColorOption {
  value: string
  label: string
  color: string
  backgroundColor: string
}

/** A column in the Kanban board */
export interface KanbanColumn {
  id: string
  label: string
  color: string
  backgroundColor: string
  cardIds: string[]
}

/** Card data for rendering */
export interface KanbanCard {
  id: string
  title: string
  status: string | null
  columnId: string
  data: Record<string, unknown>
}

/** Drag state for card interactions */
export interface CardDragState {
  /** ID of the card being dragged */
  cardId: string | null
  /** Original column the card was in */
  sourceColumnId: string | null
  /** Target column being hovered over */
  targetColumnId: string | null
  /** Is drag currently active */
  isDragging: boolean
}

// ====================================
// STORE
// ====================================

export class KanbanViewStore implements IStore {
  // Dependencies
  private tableCoreStore: TableCoreStore | null = null
  private collection: any = null // TanStack DB collection for entity updates

  // ====================================
  // OBSERVABLE STATE
  // ====================================

  /** Field to group cards by (default: 'status') */
  @observable groupByField: string = 'status'

  /** Field to display as card title (default: 'name') */
  @observable titleField: string = 'name'

  /** Status color options from schema (value -> color mapping) */
  @observable statusColorMap: Map<string, StatusColorOption> = new Map()

  /** Drag state for card interactions */
  @observable dragState: CardDragState = {
    cardId: null,
    sourceColumnId: null,
    targetColumnId: null,
    isDragging: false,
  }

  /** Column order (status values in display order) */
  @observable columnOrder: string[] = []

  constructor() {
    makeObservable(this)
    logger.info('KanbanViewStore initialized')
  }

  // ====================================
  // DEPENDENCY INJECTION
  // ====================================

  setTableCoreStore(store: TableCoreStore): void {
    this.tableCoreStore = store
    logger.info('TableCoreStore injected into KanbanViewStore')
  }

  /**
   * Set TanStack DB collection for entity updates during drag
   */
  setCollection(collection: any): void {
    this.collection = collection
    logger.info('Collection set on KanbanViewStore')
  }

  // ====================================
  // COMPUTED: COLUMNS
  // ====================================

  /**
   * Get available grouping fields (status-like fields from schema)
   */
  @computed
  get availableGroupFields(): Array<{ id: string; name: string }> {
    if (!this.tableCoreStore) return []

    const columns = this.tableCoreStore.columns
    const statusTypes = ['status', 'status_set', 'select', 'enum']

    return columns
      .filter((col) => {
        const colType = (col.type || col.cellType || '').toLowerCase()
        const id = col.id?.toLowerCase() || ''
        return statusTypes.includes(colType) || id === 'status'
      })
      .map((col) => ({
        id: col.id,
        name: col.name || col.id,
      }))
  }

  /**
   * Compute Kanban columns from status options
   */
  /**
   * Normalize a status value to handle null, undefined, and empty strings consistently
   */
  private normalizeStatusValue(value: unknown): string | null {
    if (value == null) return null
    const strValue = String(value).trim().toLowerCase()
    return strValue === '' ? null : strValue
  }

  @computed
  get columns(): KanbanColumn[] {
    if (!this.tableCoreStore) return []

    // Get unique values for the group field from data
    const rows = this.tableCoreStore.processedRows
    const uniqueValues = new Set<string>()

    for (const row of rows) {
      const rowData = row.data || row
      const value = rowData[this.groupByField]
      const normalized = this.normalizeStatusValue(value)
      // Only add non-null values to the set (null goes to "No Status")
      if (normalized !== null) {
        uniqueValues.add(normalized)
      }
    }

    // Build columns from status color map or unique values
    const columnsFromMap: KanbanColumn[] = []

    // First, add columns from the status color map (preserves order)
    for (const [value, option] of this.statusColorMap) {
      columnsFromMap.push({
        id: value,
        label: option.label,
        color: option.color,
        backgroundColor: option.backgroundColor,
        cardIds: this.getCardIdsForColumn(value),
      })
    }

    // Add any values not in the color map
    for (const value of uniqueValues) {
      if (!this.statusColorMap.has(value)) {
        columnsFromMap.push({
          id: value,
          label: value,
          color: '#666666',
          backgroundColor: '#f0f0f0',
          cardIds: this.getCardIdsForColumn(value),
        })
      }
    }

    // Add "No Status" column for items without a status
    const noStatusCards = this.getCardIdsForColumn(null)
    if (noStatusCards.length > 0) {
      columnsFromMap.unshift({
        id: '__no_status__',
        label: 'No Status',
        color: '#999999',
        backgroundColor: '#e0e0e0',
        cardIds: noStatusCards,
      })
    }

    return columnsFromMap
  }

  /**
   * Get card IDs for a specific column
   */
  private getCardIdsForColumn(columnValue: string | null): string[] {
    if (!this.tableCoreStore) return []

    const rows = this.tableCoreStore.processedRows
    const cardIds: string[] = []

    for (const row of rows) {
      const rowData = row.data || row
      const value = rowData[this.groupByField]
      const normalizedValue = this.normalizeStatusValue(value)

      if (columnValue === null) {
        // "No Status" column - match rows without a status value (null, undefined, empty string)
        if (normalizedValue === null) {
          cardIds.push(row.id)
        }
      } else if (normalizedValue === columnValue) {
        cardIds.push(row.id)
      }
    }

    return cardIds
  }

  /**
   * Compute all cards for rendering
   */
  @computed
  get cards(): KanbanCard[] {
    if (!this.tableCoreStore) return []

    const rows = this.tableCoreStore.processedRows
    return rows.map((row) => {
      const rowData = row.data || row
      const statusValue = rowData[this.groupByField]
      const normalizedStatus = this.normalizeStatusValue(statusValue)

      return {
        id: row.id,
        title: String(rowData[this.titleField] || rowData.name || row.id),
        status: normalizedStatus,
        columnId: normalizedStatus || '__no_status__',
        data: rowData,
      }
    })
  }

  /**
   * Get a specific card by ID
   */
  getCard(cardId: string): KanbanCard | undefined {
    return this.cards.find((card) => card.id === cardId)
  }

  // ====================================
  // ACTIONS
  // ====================================

  @action
  setGroupByField(field: string): void {
    if (this.groupByField === field) return
    logger.info('Group by field changed', { from: this.groupByField, to: field })
    this.groupByField = field
  }

  @action
  setTitleField(field: string): void {
    if (this.titleField === field) return
    logger.info('Title field changed', { from: this.titleField, to: field })
    this.titleField = field
  }

  @action
  setStatusColorMap(options: StatusColorOption[]): void {
    this.statusColorMap.clear()
    for (const opt of options) {
      // Safely convert value to string and lowercase
      const key = opt.value != null ? String(opt.value).toLowerCase() : null
      if (key) {
        this.statusColorMap.set(key, opt)
      }
    }
    logger.info('Status color map updated', { count: this.statusColorMap.size })
  }

  // ====================================
  // DRAG ACTIONS
  // ====================================

  /**
   * Start dragging a card
   */
  @action
  startDrag(cardId: string, sourceColumnId: string): void {
    this.dragState = {
      cardId,
      sourceColumnId,
      targetColumnId: null,
      isDragging: true,
    }
    logger.debug('Card drag started', { cardId, sourceColumnId })
  }

  /**
   * Update the target column during drag
   */
  @action
  updateDragTarget(targetColumnId: string | null): void {
    if (!this.dragState.isDragging) return
    this.dragState.targetColumnId = targetColumnId
  }

  /**
   * End drag and persist the status change
   */
  @action
  async endDrag(): Promise<void> {
    const { cardId, sourceColumnId, targetColumnId } = this.dragState

    // Validate we have a valid drop
    if (!cardId || !targetColumnId || sourceColumnId === targetColumnId) {
      logger.debug('Drag ended without valid move', { cardId, sourceColumnId, targetColumnId })
      this.cancelDrag()
      return
    }

    // Get the original status value with proper casing from the color map
    // If not in color map, use the column ID as-is (for dynamically discovered values)
    let newStatus: string | null = null
    if (targetColumnId !== '__no_status__') {
      const colorOption = this.statusColorMap.get(targetColumnId)
      // Use the original value from the schema if available, otherwise use column ID
      newStatus = colorOption?.value ?? targetColumnId
    }

    logger.info('Moving card to new column', {
      cardId,
      from: sourceColumnId,
      to: targetColumnId,
      newStatus,
    })

    // Clear drag state before async operation
    this.cancelDrag()

    // Persist to database
    if (this.collection) {
      try {
        const tx = this.collection.update(cardId, (draft: any) => {
          draft[this.groupByField] = newStatus
          draft.updated_at = new Date().toISOString()
        })

        await tx.isPersisted.promise
        logger.info('Card status updated successfully', { cardId, newStatus })
      } catch (error) {
        logger.error('Failed to update card status', {
          cardId,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    } else {
      logger.warn('Cannot persist: no collection set', { cardId })
    }
  }

  /**
   * Cancel drag without persisting changes
   */
  @action
  cancelDrag(): void {
    this.dragState = {
      cardId: null,
      sourceColumnId: null,
      targetColumnId: null,
      isDragging: false,
    }
    logger.debug('Card drag cancelled/ended')
  }

  // ====================================
  // IStore INTERFACE
  // ====================================

  init(): void {
    logger.info('KanbanViewStore init called')
  }

  reset(): void {
    logger.info('KanbanViewStore reset')
    this.groupByField = 'status'
    this.titleField = 'name'
    this.cancelDrag()
  }

  dispose(): void {
    logger.info('KanbanViewStore disposed')
  }
}
