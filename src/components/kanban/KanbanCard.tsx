/**
 * KanbanCard - Individual card in a Kanban column
 *
 * Renders a draggable card with title and status.
 * Uses native HTML5 drag API for drag-and-drop interactions.
 */

import { GripVertical } from 'lucide-react'
import { observer } from 'mobx-react-lite'
import { memo } from 'react'
import type React from 'react'
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
        {card.status && (
          <CardContent className="p-3 pt-1">
            <span className="text-xs text-muted-foreground capitalize">{card.status}</span>
          </CardContent>
        )}
      </Card>
    </div>
  )
})

export const KanbanCard = memo(KanbanCardInner)
