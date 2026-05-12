/**
 * My Work Grid - VibeGrid Implementation
 *
 * Displays work queue items using VibeGrid with columns:
 * 1. Unread indicator
 * 2. Type (relationship type: assigned_to, watching, etc.)
 * 3. Category (action_required, watching)
 * 4. Title (entity name)
 * 5. Entity Type
 * 6. Created (date)
 *
 * Uses relationship-driven WorkQueueItem data from DataForge (GH#1780).
 * Renamed from CommandCenterGrid (GH#2262).
 */

import { useCallback, useEffect, useMemo } from 'react'
import { observer } from 'mobx-react-lite'
import { runInAction } from 'mobx'
import { Mail, Archive } from 'lucide-react'
import { executeAction } from '../actions/dispatch'
import { VibeGrid } from '@/systems/vibegrid'
import type { RowAction } from '@/systems/vibegrid/VibeGrid'
import { VibeGridStoreProvider, useTableCoreStore, useInitStore } from '@/systems/vibegrid/stores/context'
import { useOrganization } from '@/app/stores'
import type { WorkQueueItem } from '../types'

/** Grid items include `id` from the work_queue_items collection */
type MyWorkGridItem = WorkQueueItem & { id: string }
import { myWorkStore } from '../stores'

// ====================================
// TYPES
// ====================================

interface MyWorkGridProps {
  items: MyWorkGridItem[]
  isSelectMode: boolean
  onItemClick?: (item: MyWorkGridItem) => void
  onLoadMore?: () => void
  hasMore?: boolean
  toolbarLeading?: React.ReactNode
  toolbarTrailing?: React.ReactNode
  emptyStateHeadline?: string
  emptyStateBody?: string
}

// ====================================
// ROW ACTIONS
// ====================================

/**
 * Row actions for work queue items
 * Note: Snooze action removed until snooze dialog is implemented (GH#1198)
 */
const rowActions: RowAction[] = [
  {
    id: 'markUnread',
    label: 'Mark as Unread',
    icon: Mail,
  },
  {
    id: 'archive',
    label: 'Archive',
    icon: Archive,
  },
]

// ====================================
// INNER GRID COMPONENT
// ====================================

/**
 * Inner grid component that has access to VibeGrid stores via context
 */
const MyWorkGridInner = observer(function MyWorkGridInner({
  items,
  isSelectMode,
  onItemClick,
  onLoadMore,
  hasMore,
  toolbarLeading,
  toolbarTrailing,
  emptyStateHeadline,
  emptyStateBody,
}: MyWorkGridProps) {
  const tableCoreStore = useTableCoreStore()
  const initStore = useInitStore()

  // Push item data to VibeGrid store when items change
  useEffect(() => {
    if (!tableCoreStore) return

    // Transform items to rows format expected by VibeGrid (flat objects)
    // IMPORTANT: Row keys MUST match column.id (not column.field) because
    // BodyRenderer accesses values via rowData[column.id]
    const rows = items.map((item) => ({
      id: item.relationshipId,
      unread: !item.userState.readAt, // Unread indicator (no readAt = unread)
      type: item.relationshipType, // Relationship type (assigned_to, watching, etc.)
      category: item.category, // Queue category (action_required, watching)
      title: item.entityName || item.entityType, // Entity name or fallback to type
      entityType: item.entityType,
      entityId: item.entityId,
      created: item.createdAt, // Must match column id 'created'
      isRead: !!item.userState.readAt,
      isArchived: !!item.userState.archivedAt,
      // Keep original item reference for actions
      _originalItem: item,
    }))

    // Update rows in the store
    runInAction(() => {
      tableCoreStore.setRows(rows)
    })

    // Mark entity data as known-complete to drive hydration
    if (!initStore.entityDataKnownComplete) {
      initStore.markEntityDataKnownComplete()
    }
  }, [items, tableCoreStore, initStore])

  // Handle row click
  const handleCellClick = useCallback(
    (rowId: string, _columnId: string) => {
      if (isSelectMode) {
        // In select mode, grid selection drives store selection via onSelectionChange.
        return
      } else {
        // In normal mode, find original item and trigger callback
        const item = items.find((i) => i.relationshipId === rowId)
        if (item) {
          // Mark as read
          if (!item.userState.readAt) {
            myWorkStore.markRead(item)
          }
          // Notify parent for item-specific actions
          onItemClick?.(item)
        }
      }
    },
    [items, isSelectMode, onItemClick],
  )

  // Sync bulk-selection state from VibeGrid selected cells.
  const handleSelectionChange = useCallback(
    (selectedCells: Set<string>) => {
      if (!isSelectMode) return

      const selectedRowIds = new Set<string>()
      for (const cellId of selectedCells) {
        const rowId = cellId.split(':')[0]
        if (rowId) {
          selectedRowIds.add(rowId)
        }
      }

      myWorkStore.setSelectedIds(selectedRowIds)
    },
    [isSelectMode],
  )

  // Handle row actions — routes through unified dispatch or legacy handlers
  const handleRowAction = useCallback(
    async (actionId: string, rowIds: string[], _rowsData: any[]) => {
      const affectedItems = items.filter((item) => rowIds.includes(item.relationshipId))

      switch (actionId) {
        // Legacy row actions (mark unread, archive) — kept for backwards compat
        case 'markUnread':
          for (const item of affectedItems) {
            myWorkStore.markUnread(item)
          }
          break
        case 'archive':
          for (const item of affectedItems) {
            myWorkStore.archive(item)
          }
          break
        // All other actions go through the unified dispatch (GH#1909)
        default:
          for (const item of affectedItems) {
            await executeAction(actionId, item, {
              onNavigate: (_path, _params) => {
                onItemClick?.(item)
              },
            })
          }
          break
      }
    },
    [items, onItemClick],
  )

  return (
    <div className="h-full w-full min-h-0 flex flex-col">
      <div className="flex-1 overflow-x-auto">
        <VibeGrid
          tableId="my-work-items"
          entityType="WorkQueueItem"
          height="100%"
          skipDataFetching={true}
          enableSelectionColumn={isSelectMode}
          enableGrouping={false}
          enableFiltering={true}
          enableSorting={true}
          enableDragAndDrop={false}
          onCellClick={handleCellClick}
          onSelectionChange={handleSelectionChange}
          rowActions={rowActions}
          onRowAction={handleRowAction}
          toolbarLeading={toolbarLeading}
          toolbarTrailing={toolbarTrailing}
          emptyStateHeadline={emptyStateHeadline}
          emptyStateBody={emptyStateBody}
        />
      </div>
      {/* Load More button for pagination */}
      {hasMore && onLoadMore && (
        <div className="flex justify-center p-4 border-t">
          <button
            type="button"
            onClick={onLoadMore}
            className="px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-md transition-colors"
          >
            Load More Items
          </button>
        </div>
      )}
    </div>
  )
})

// ====================================
// MAIN COMPONENT WITH PROVIDER
// ====================================

/**
 * My Work Grid - VibeGrid wrapper
 * Uses VibeGridStoreProvider to set up the grid context
 */
export const MyWorkGrid = observer(function MyWorkGrid(props: MyWorkGridProps) {
  const org = useOrganization()

  // Memoize org ID to prevent unnecessary re-renders
  const orgId = useMemo(() => org.activeOrganizationId || '', [org.activeOrganizationId])

  if (!orgId) {
    return <div className="flex-1 flex items-center justify-center text-muted-foreground">No organization selected</div>
  }

  return (
    <VibeGridStoreProvider tableId="my-work-items" entityType="WorkQueueItem" orgId={orgId}>
      <MyWorkGridInner {...props} />
    </VibeGridStoreProvider>
  )
})
