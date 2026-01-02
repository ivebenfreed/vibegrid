/**
 * KanbanColumn - A column in the Kanban board
 *
 * Renders a vertical list of cards with header showing status name and count.
 * Handles drop zone for drag-and-drop reordering.
 */

import { observer } from 'mobx-react-lite'
import type React from 'react'
import { useState } from 'react'
import { cn } from '@/shared/lib/utils'
import type {
  KanbanCard as KanbanCardType,
  KanbanColumn as KanbanColumnType,
} from '../../stores/KanbanViewStore'
import { KanbanCard } from './KanbanCard'

interface KanbanColumnProps {
  column: KanbanColumnType
  cards: KanbanCardType[]
  isDragOver?: boolean
  draggingCardId?: string | null
  enableDragAndDrop?: boolean
  onDragOver?: (columnId: string) => void
  onDragLeave?: () => void
  onDrop?: (columnId: string) => void
  onCardDragStart?: (cardId: string, columnId: string) => void
  onCardDragEnd?: () => void
  onCardClick?: (cardId: string) => void
}

export const KanbanColumn = observer(function KanbanColumn({
  column,
  cards,
  isDragOver = false,
  draggingCardId,
  enableDragAndDrop = true,
  onDragOver,
  onDragLeave,
  onDrop,
  onCardDragStart,
  onCardDragEnd,
  onCardClick,
}: KanbanColumnProps) {
  const [isLocalDragOver, setIsLocalDragOver] = useState(false)

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (!enableDragAndDrop) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (!isLocalDragOver) {
      setIsLocalDragOver(true)
      onDragOver?.(column.id)
    }
  }

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    if (!enableDragAndDrop) return
    // Only trigger leave if actually leaving the column, not just moving between cards
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX
    const y = e.clientY
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      setIsLocalDragOver(false)
      onDragLeave?.()
    }
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    if (!enableDragAndDrop) return
    e.preventDefault()
    setIsLocalDragOver(false)
    onDrop?.(column.id)
  }

  // Filter cards that belong to this column
  const columnCards = cards.filter((card) => column.cardIds.includes(card.id))

  return (
    <article
      className={cn(
        'vibegridx-kanban-column flex flex-col h-full min-w-[280px] max-w-[320px]',
        'bg-muted/30 rounded-lg border border-border/50',
        'transition-all duration-200',
        (isDragOver || isLocalDragOver) && 'border-primary/50 bg-primary/5 ring-2 ring-primary/20',
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      aria-label={`${column.label} column, ${columnCards.length} cards`}
    >
      {/* Column Header */}
      <div
        className="flex items-center gap-2 p-3 border-b border-border/50"
        style={{ backgroundColor: column.backgroundColor }}
      >
        <div
          className="w-3 h-3 rounded-full flex-shrink-0"
          style={{ backgroundColor: column.color }}
          aria-hidden="true"
        />
        <span className="font-medium text-sm truncate" style={{ color: column.color }}>
          {column.label}
        </span>
        <span className="ml-auto text-xs text-muted-foreground bg-background/50 px-2 py-0.5 rounded-full">
          {columnCards.length}
        </span>
      </div>

      {/* Cards Container */}
      <ul className="flex-1 overflow-y-auto p-2 space-y-2 min-h-[100px] list-none">
        {columnCards.length === 0 ? (
          <li className="flex items-center justify-center h-20 text-sm text-muted-foreground/50 border-2 border-dashed border-muted-foreground/20 rounded-lg">
            No items
          </li>
        ) : (
          columnCards.map((card) => (
            <KanbanCard
              key={card.id}
              card={card}
              isDragging={draggingCardId === card.id}
              enableDragAndDrop={enableDragAndDrop}
              onDragStart={onCardDragStart}
              onDragEnd={onCardDragEnd}
              onClick={onCardClick}
            />
          ))
        )}
      </ul>
    </article>
  )
})
