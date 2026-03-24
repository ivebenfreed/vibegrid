/**
 * KanbanCard - Individual card in a Kanban column
 *
 * Renders a draggable card with title, status, and auto-detected smart fields
 * (assignee, due date, priority) when present in entity data.
 * Uses native HTML5 drag API for drag-and-drop interactions.
 *
 * GH#2139: Smart field display
 */

import { CalendarDays, GripVertical, User } from 'lucide-react'
import { observer } from 'mobx-react-lite'
import { memo } from 'react'
import type React from 'react'
import { Badge } from '@/shared/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/shared/components/ui/card'
import { cn } from '@/shared/lib/utils'
import type { KanbanCard as KanbanCardType } from '../../stores/KanbanViewStore'

interface KanbanCardProps {
  card: KanbanCardType
  isDragging?: boolean
  enableDragAndDrop?: boolean
  onDragStart?: (cardId: string, columnId: string) => void
  onDragEnd?: () => void
  onClick?: (cardId: string) => void
}

/** Format ISO date string to short display format (e.g., "Mar 28") */
function formatShortDate(isoDate: string): string {
  try {
    const date = new Date(isoDate)
    if (Number.isNaN(date.getTime())) return isoDate
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  } catch {
    return isoDate
  }
}

const KanbanCardInner = observer(function KanbanCard({
  card,
  isDragging = false,
  enableDragAndDrop = true,
  onDragStart,
  onDragEnd,
  onClick,
}: KanbanCardProps) {
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    e.dataTransfer.setData('text/plain', card.id)
    e.dataTransfer.effectAllowed = 'move'
    onDragStart?.(card.id, card.columnId)
  }

  const handleDragEnd = () => {
    onDragEnd?.()
  }

  const handleClick = () => {
    onClick?.(card.id)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onClick?.(card.id)
    }
  }

  const { smartFields } = card
  const hasSmartFields = smartFields?.assignee || smartFields?.dueDate || smartFields?.priority

  return (
    <div>
      <Card
        className={cn(
          'vibegridx-kanban-card transition-all duration-200',
          enableDragAndDrop && 'cursor-grab',
          'hover:shadow-md hover:border-primary/30',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          isDragging && 'opacity-50 shadow-lg rotate-2 scale-105',
        )}
        draggable={enableDragAndDrop}
        onDragStart={enableDragAndDrop ? handleDragStart : undefined}
        onDragEnd={enableDragAndDrop ? handleDragEnd : undefined}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        aria-grabbed={enableDragAndDrop ? isDragging : undefined}
        aria-label={`Card: ${card.title}`}
      >
        <CardHeader className="p-3 pb-1 flex flex-row items-start gap-2">
          {enableDragAndDrop && (
            <GripVertical
              className="size-4 text-muted-foreground/50 mt-0.5 flex-shrink-0 cursor-grab"
              aria-hidden="true"
            />
          )}
          <span className="text-sm font-medium leading-tight line-clamp-2">{card.title}</span>
        </CardHeader>
        <CardContent className="p-3 pt-1 space-y-1">
          {card.status && <span className="text-xs text-muted-foreground capitalize">{card.status}</span>}
          {/* Smart fields (GH#2139) — only fields with values render */}
          {hasSmartFields && (
            <div className="flex flex-col gap-1 pt-0.5">
              {smartFields.assignee && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <User className="size-3 flex-shrink-0" aria-hidden="true" />
                  <span className="truncate">{smartFields.assignee.displayName}</span>
                </div>
              )}
              {smartFields.dueDate && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CalendarDays className="size-3 flex-shrink-0" aria-hidden="true" />
                  <span>{formatShortDate(smartFields.dueDate)}</span>
                </div>
              )}
              {smartFields.priority && (
                <Badge
                  variant="outline"
                  className="w-fit text-[10px] px-1.5 py-0"
                  style={
                    smartFields.priority.color
                      ? { borderColor: smartFields.priority.color, color: smartFields.priority.color }
                      : undefined
                  }
                >
                  {smartFields.priority.label}
                </Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
})

export const KanbanCard = memo(KanbanCardInner)
