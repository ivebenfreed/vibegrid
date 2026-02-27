/**
 * Thread List Grid - VibeGrid Implementation
 *
 * Displays email threads using VibeGrid with 10 columns:
 * 1. Unread indicator (blue dot)
 * 2. From (sender name/email) - uses latestSender from client-side join
 * 3. Subject (thread subject line) - bold when unread
 * 4. Date (relative or absolute)
 * 5. Assigned To (user avatar/name)
 * 6. Snippet (message preview)
 * 7. Attachments (paperclip icon)
 * 8. Message Count (badge)
 * 9. Folders (label chips)
 * 10. Starred (star toggle)
 *
 * Uses VibeGrid with custom EmailThread columns (not a DataForge entity).
 * Part of GH#948: Email Inbox UI - Pure Communications View
 * Updated for GH#1200: TanStack DB Collections + bold styling for unread
 */

import { useCallback, useEffect, useMemo } from 'react'
import { observer } from 'mobx-react-lite'
import { runInAction } from 'mobx'
import { useNavigate } from '@tanstack/react-router'
import { VibeGrid, type RowAction } from '@/systems/vibegrid'
import { Mail, MailOpen, Star, StarOff, UserPlus } from 'lucide-react'
import {
  VibeGridStoreProvider,
  useTableCoreStore,
  useInitStore,
} from '@/systems/vibegrid/stores/context'
import { useOrganization, useAuth } from '@/app/stores'
import type { ThreadWithLatestSender } from '../hooks'
import { useEmailInbox } from '../stores'

// ====================================
// TYPES
// ====================================

interface ThreadListGridProps {
  threads: ThreadWithLatestSender[]
  isSelectMode: boolean
  selectedIds: Set<string>
  onToggleSelect: (threadId: string) => void
  onMarkRead: (threadId: string, unread: boolean) => void
  onAssign: (threadId: string) => void
  onStar: (threadId: string, starred: boolean) => void
}

// ====================================
// INNER GRID COMPONENT
// ====================================

/**
 * Inner grid component that has access to VibeGrid stores via context
 */
const ThreadListGridInner = observer(function ThreadListGridInner({
  threads,
  isSelectMode,
  selectedIds,
  onToggleSelect,
  onMarkRead,
  onAssign,
  onStar,
}: ThreadListGridProps) {
  const store = useEmailInbox()
  const navigate = useNavigate()
  const tableCoreStore = useTableCoreStore()
  const initStore = useInitStore()

  // Push thread data to VibeGrid store when threads change
  useEffect(() => {
    // Wait for tableCoreStore but NOT isFullyHydrated (we need to mark entityDataLoaded ourselves)
    if (!tableCoreStore) return

    // Transform threads to rows format expected by VibeGrid (flat objects)
    // GH#1200: Use latestSender (from client-side join) instead of participants[0]
    const rows = threads.map((thread) => {
      // Use latestSender from the client-side join with latest messages
      // Falls back to first participant if no latest message (defensive)
      // GH#1199: Parse participants if it's a JSON string (API returns string, not array)
      let fallbackParticipant = null
      if (!thread.latestSender && thread.participants) {
        try {
          const parsed =
            typeof thread.participants === 'string'
              ? JSON.parse(thread.participants)
              : thread.participants
          fallbackParticipant = Array.isArray(parsed) ? parsed[0] : null
        } catch {
          fallbackParticipant = null
        }
      }
      const sender = thread.latestSender || fallbackParticipant
      const fromDisplay = sender ? sender.name || sender.email : '(Unknown)'

      // Format folders array to comma-separated string
      const foldersDisplay = thread.folders?.join(', ') || ''

      // GH#1200: Add bold styling class for unread threads
      // The _rowClassName is used by VibeGrid for row-level styling
      const rowClassName = thread.unread ? 'email-thread-unread' : ''

      return {
        id: thread.id,
        unread: thread.unread,
        // Pre-formatted string for display (VibeGrid uses column.id to access data)
        // GH#1200: Now shows latest sender, not first participant
        from: fromDisplay,
        subject: thread.subject || '(No subject)',
        date: thread.latestMessageDate,
        assigned_to: thread.assignedToUserName || '',
        snippet: thread.snippet || '',
        attachments: thread.hasAttachments,
        message_count: thread.messageCount,
        // Pre-formatted string for display
        folders: foldersDisplay,
        starred: thread.starred,
        // Keep original fields for reference
        connectionId: thread.connectionId,
        nylasThreadId: thread.nylasThreadId,
        // Row styling for unread
        _rowClassName: rowClassName,
      }
    })

    // Update rows in the store
    runInAction(() => {
      tableCoreStore.setRows(rows)
    })

    // Mark entity data as loaded to complete hydration
    if (!initStore.hydrationState.entityDataLoaded) {
      initStore.markReady('entityDataLoaded')
    }
  }, [threads, tableCoreStore, initStore])

  // Handle row click - navigate to thread detail (subject column only)
  const handleCellClick = useCallback(
    (rowId: string, columnId: string) => {
      if (isSelectMode) {
        // In select mode, grid selection drives local state via onSelectionChange.
        return
      }

      // Only navigate when clicking the subject column (primary name affordance)
      if (columnId === 'subject') {
        store.setSelectedThread(rowId)
        navigate({ to: '/inbox/thread/$threadId', params: { threadId: rowId } })
      }
    },
    [isSelectMode, store, navigate],
  )

  // Handle VibeGrid selection changes for bulk actions.
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

      // Sync local selection state from grid selection state.
      for (const id of selectedRowIds) {
        if (!selectedIds.has(id)) {
          onToggleSelect(id)
        }
      }
      for (const id of selectedIds) {
        if (!selectedRowIds.has(id)) {
          onToggleSelect(id)
        }
      }
    },
    [isSelectMode, selectedIds, onToggleSelect],
  )

  // Row actions for the floating 3-dots menu
  const rowActions: RowAction[] = useMemo(
    () => [
      {
        id: 'toggle-read',
        label: 'Mark as read',
        icon: MailOpen,
        hidden: (rowData) => !rowData.unread,
      },
      {
        id: 'toggle-unread',
        label: 'Mark as unread',
        icon: Mail,
        hidden: (rowData) => rowData.unread,
      },
      {
        id: 'toggle-star',
        label: 'Star',
        icon: Star,
        hidden: (rowData) => rowData.starred,
      },
      {
        id: 'toggle-unstar',
        label: 'Unstar',
        icon: StarOff,
        hidden: (rowData) => !rowData.starred,
      },
      {
        id: 'assign',
        label: 'Assign to...',
        icon: UserPlus,
      },
    ],
    [],
  )

  // Handle row action clicks
  const handleRowAction = useCallback(
    (actionId: string, rowIds: string[], rowsData: any[]) => {
      const rowId = rowIds[0]
      const rowData = rowsData[0]
      if (!rowId || !rowData) return

      switch (actionId) {
        case 'toggle-read':
          onMarkRead(rowId, false) // Mark as read (unread = false)
          break
        case 'toggle-unread':
          onMarkRead(rowId, true) // Mark as unread (unread = true)
          break
        case 'toggle-star':
          onStar(rowId, true) // Star
          break
        case 'toggle-unstar':
          onStar(rowId, false) // Unstar
          break
        case 'assign':
          onAssign(rowId)
          break
      }
    },
    [onMarkRead, onStar, onAssign],
  )

  return (
    <div className="h-full w-full min-h-0 overflow-x-auto">
      <VibeGrid
        tableId="email-inbox-threads"
        entityType="EmailThread"
        height="100%"
        skipDataFetching={true}
        enableSelectionColumn={isSelectMode}
        enableGrouping={false}
        enableFiltering={false}
        enableSorting={true}
        enableDragAndDrop={false}
        onCellClick={handleCellClick}
        onSelectionChange={handleSelectionChange}
        rowActions={rowActions}
        onRowAction={handleRowAction}
      />
    </div>
  )
})

// ====================================
// MAIN COMPONENT WITH PROVIDER
// ====================================

/**
 * Thread List Grid - VibeGrid wrapper with 10 columns
 * Uses VibeGridStoreProvider to set up the grid context
 */
export const ThreadListGrid = observer(function ThreadListGrid(props: ThreadListGridProps) {
  const org = useOrganization()
  const auth = useAuth()

  // Memoize org/user IDs to prevent unnecessary re-renders
  const orgId = useMemo(() => org.activeOrganizationId || '', [org.activeOrganizationId])
  const _userId = useMemo(() => auth.user?.id || '', [auth.user?.id])

  if (!orgId) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        No organization selected
      </div>
    )
  }

  return (
    <VibeGridStoreProvider tableId="email-inbox-threads" entityType="EmailThread" orgId={orgId}>
      <ThreadListGridInner {...props} />
    </VibeGridStoreProvider>
  )
})
