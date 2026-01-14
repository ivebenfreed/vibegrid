/**
 * Thread List Grid - VibeGrid Implementation
 *
 * Displays email threads using VibeGrid with 10 columns:
 * 1. Unread indicator (blue dot)
 * 2. From (sender name/email)
 * 3. Subject (thread subject line)
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
 */

import { useCallback, useEffect, useMemo } from 'react'
import { observer } from 'mobx-react-lite'
import { runInAction } from 'mobx'
import { useNavigate } from '@tanstack/react-router'
import { VibeGrid } from '@/systems/vibegrid'
import {
  VibeGridStoreProvider,
  useTableCoreStore,
  useInitStore,
} from '@/systems/vibegrid/stores/context'
import { useOrganization, useAuth } from '@/app/stores'
import type { InboxThread } from '@/shared/data/queries/email-threads.queries'
import { useEmailInbox } from '../stores'

// ====================================
// TYPES
// ====================================

interface ThreadListGridProps {
  threads: InboxThread[]
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
  onMarkRead: _onMarkRead,
  onAssign: _onAssign,
  onStar: _onStar,
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
    // Pre-format participants array since VibeGrid doesn't use custom column formatters
    const rows = threads.map((thread) => {
      // Format participants to display first sender name/email
      const firstParticipant = thread.participants?.[0]
      const fromDisplay = firstParticipant
        ? firstParticipant.name || firstParticipant.email
        : '(Unknown)'

      // Format folders array to comma-separated string
      const foldersDisplay = thread.folders?.join(', ') || ''

      return {
        id: thread.id,
        unread: thread.unread,
        // Pre-formatted string for display (VibeGrid doesn't use custom formatters)
        participants: fromDisplay,
        subject: thread.subject || '(No subject)',
        latestMessageDate: thread.latestMessageDate,
        assignedToUserName: thread.assignedToUserName || '',
        snippet: thread.snippet || '',
        hasAttachments: thread.hasAttachments,
        messageCount: thread.messageCount,
        // Pre-formatted string for display
        folders: foldersDisplay,
        starred: thread.starred,
        // Keep original fields for reference
        connectionId: thread.connectionId,
        nylasThreadId: thread.nylasThreadId,
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

  // Handle row click - navigate to thread detail
  const handleCellClick = useCallback(
    (rowId: string, _columnId: string) => {
      if (isSelectMode) {
        onToggleSelect(rowId)
      } else {
        store.setSelectedThread(rowId)
        navigate({ to: '/inbox/thread/$threadId', params: { threadId: rowId } })
      }
    },
    [isSelectMode, onToggleSelect, store, navigate],
  )

  // Handle row selection for bulk actions (TODO: wire up when selection is implemented)
  const _handleSelectionChange = useCallback(
    (selectedRowIds: Set<string>) => {
      // Sync selection state
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
    [selectedIds, onToggleSelect],
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
