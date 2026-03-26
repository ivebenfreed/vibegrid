/**
 * KanbanColumn - A column in the Kanban board
 *
 * Renders a vertical list of cards with header showing status name and count.
 * Handles drop zone for drag-and-drop reordering.
 */

import { useVirtualizer } from '@tanstack/react-virtual'
import { observer } from 'mobx-react-lite'
import { memo, useRef, useState } from 'react'
import type React from 'react'
import { cn } from '@/shared/lib/utils'
import type { KanbanCard as KanbanCardType, KanbanColumn as KanbanColumnType } from '../../stores/KanbanViewStore'
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

const KanbanColumnInner = observer(function KanbanColumn({
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

  // Cards are already pre-filtered by KanbanBoard (O(n) pre-split)
  const columnCards = cards

  // Virtualize card list for large columns
  const parentRef = useRef<HTMLDivElement>(null)
  const rowVirtualizer = useVirtualizer({
    count: columnCards.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 80,
    overscan: 5,
    gap: 8,
  })

  return (
    <article
      className={cn(
        'vibegridx-kanban-column flex flex-col h-full min-w-[280px] max-w-[320px] flex-shrink-0',
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

      {/* Cards Container — virtualized for large columns */}
      <div ref={parentRef} className="flex-1 overflow-y-auto p-2 min-h-[100px]">
        {columnCards.length === 0 ? (
          <div className="flex items-center justify-center h-20 text-sm text-muted-foreground/50 border-2 border-dashed border-muted-foreground/20 rounded-lg">
            No items
          </div>
        ) : (
          <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}>
            {rowVirtualizer.getVirtualItems().map((virtualItem) => {
              const card = columnCards[virtualItem.index]
              return (
                <div
                  key={card.id}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                >
                  <KanbanCard
                    card={card}
                    isDragging={draggingCardId === card.id}
                    enableDragAndDrop={enableDragAndDrop}
                    onDragStart={onCardDragStart}
                    onDragEnd={onCardDragEnd}
                    onClick={onCardClick}
                  />
                </div>
              )
            })}
          </div>
        )}
      </div>
    </article>
  )
})

export const KanbanColumn = memo(KanbanColumnInner)
