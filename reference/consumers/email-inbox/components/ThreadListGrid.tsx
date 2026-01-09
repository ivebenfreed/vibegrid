/**
 * Thread List Grid
 *
 * Displays email threads in a table/list format with columns:
 * Unread, From, Subject, Date, Assigned To, Snippet, Attachments, Message Count, Folders, Starred
 */

import { observer } from 'mobx-react-lite'
import { useNavigate } from '@tanstack/react-router'
import {
  Mail,
  Paperclip,
  Star,
  User,
  Folder,
  MoreHorizontal,
  MailOpen,
  UserPlus,
  Archive,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { Button } from '@/shared/components/ui/button'
import { Checkbox } from '@/shared/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/shared/components/ui/tooltip'
import { cn } from '@/shared/lib/utils'
import type { InboxThread } from '@/shared/data/queries/email-threads.queries'
import { useEmailInbox } from '../stores'

interface ThreadListGridProps {
  threads: InboxThread[]
  isSelectMode: boolean
  selectedIds: Set<string>
  onToggleSelect: (threadId: string) => void
  onMarkRead: (threadId: string, unread: boolean) => void
  onAssign: (threadId: string) => void
  onStar: (threadId: string, starred: boolean) => void
}

function getParticipantDisplay(participants: Array<{ name?: string; email: string }>): string {
  if (!participants || participants.length === 0) return '(Unknown)'
  const first = participants[0]
  return first.name || first.email
}

function formatRelativeDate(dateStr: string): string {
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true })
  } catch {
    return dateStr
  }
}

interface ThreadRowProps {
  thread: InboxThread
  isSelected: boolean
  isActive: boolean
  isSelectMode: boolean
  onSelect: () => void
  onClick: () => void
  onMarkRead: (unread: boolean) => void
  onAssign: () => void
  onStar: (starred: boolean) => void
}

function ThreadRow({
  thread,
  isSelected,
  isActive,
  isSelectMode,
  onSelect,
  onClick,
  onMarkRead,
  onAssign,
  onStar,
}: ThreadRowProps) {
  const isUnread = thread.unread

  return (
    <button
      type="button"
      className={cn(
        'group flex items-center gap-3 px-4 py-3 border-b transition-colors cursor-pointer w-full text-left',
        'hover:bg-muted/50',
        isActive && 'bg-muted',
        isUnread && 'bg-primary/5',
        isSelected && 'bg-primary/10',
      )}
      onClick={() => {
        if (isSelectMode) {
          onSelect()
        } else {
          onClick()
        }
      }}
    >
      {/* Selection checkbox */}
      {isSelectMode && (
        <Checkbox
          checked={isSelected}
          onCheckedChange={onSelect}
          onClick={(e) => e.stopPropagation()}
          className="flex-shrink-0"
        />
      )}

      {/* Unread indicator */}
      <div className="flex-shrink-0 w-2">
        {isUnread ? (
          <div className="w-2 h-2 rounded-full bg-primary" />
        ) : (
          <div className="w-2 h-2" />
        )}
      </div>

      {/* From */}
      <div className="flex-shrink-0 w-40 truncate">
        <span
          className={cn(
            'text-sm',
            isUnread ? 'font-semibold text-foreground' : 'text-muted-foreground',
          )}
        >
          {getParticipantDisplay(thread.participants)}
        </span>
      </div>

      {/* Subject + Snippet */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={cn('text-sm truncate', isUnread && 'font-medium')}>
            {thread.subject || '(No subject)'}
          </span>
          <span className="text-xs text-muted-foreground truncate hidden sm:inline">
            — {thread.snippet || '(No preview)'}
          </span>
        </div>
      </div>

      {/* Assigned To */}
      <div className="flex-shrink-0 w-28 truncate hidden lg:block">
        {thread.assignedToUserName ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <User className="h-3 w-3" />
                  {thread.assignedToUserName.split(' ')[0]}
                </span>
              </TooltipTrigger>
              <TooltipContent>Assigned to {thread.assignedToUserName}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <span className="text-xs text-muted-foreground/50">Unassigned</span>
        )}
      </div>

      {/* Indicators: Attachments, Message Count, Folders */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {/* Attachments */}
        {thread.hasAttachments && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent>Has attachments</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        {/* Message count */}
        {thread.messageCount > 1 && (
          <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
            {thread.messageCount}
          </span>
        )}

        {/* Folders */}
        {thread.folders && thread.folders.length > 0 && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <Folder className="h-3.5 w-3.5 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent>{thread.folders.join(', ')}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        {/* Starred */}
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => {
            e.stopPropagation()
            onStar(!thread.starred)
          }}
        >
          <Star
            className={cn(
              'h-3.5 w-3.5',
              thread.starred ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground',
            )}
          />
        </Button>
      </div>

      {/* Date */}
      <div className="flex-shrink-0 w-24 text-right">
        <span className="text-xs text-muted-foreground">
          {formatRelativeDate(thread.latestMessageDate)}
        </span>
      </div>

      {/* Actions menu */}
      <div className="flex-shrink-0">
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onMarkRead(!isUnread)}>
              {isUnread ? (
                <>
                  <MailOpen className="h-4 w-4 mr-2" />
                  Mark as Read
                </>
              ) : (
                <>
                  <Mail className="h-4 w-4 mr-2" />
                  Mark as Unread
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onAssign}>
              <UserPlus className="h-4 w-4 mr-2" />
              Assign
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onStar(!thread.starred)}>
              <Star className="h-4 w-4 mr-2" />
              {thread.starred ? 'Unstar' : 'Star'}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <Archive className="h-4 w-4 mr-2" />
              Archive
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </button>
  )
}

export const ThreadListGrid = observer(function ThreadListGrid({
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

  const handleThreadClick = (threadId: string) => {
    store.setSelectedThread(threadId)
    // Navigate to thread detail page
    navigate({ to: '/inbox/thread/$threadId', params: { threadId } })
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {threads.map((thread) => (
        <ThreadRow
          key={thread.id}
          thread={thread}
          isSelected={selectedIds.has(thread.id)}
          isActive={store.selectedThreadId === thread.id}
          isSelectMode={isSelectMode}
          onSelect={() => onToggleSelect(thread.id)}
          onClick={() => handleThreadClick(thread.id)}
          onMarkRead={(unread) => onMarkRead(thread.id, unread)}
          onAssign={() => onAssign(thread.id)}
          onStar={(starred) => onStar(thread.id, starred)}
        />
      ))}
    </div>
  )
})
