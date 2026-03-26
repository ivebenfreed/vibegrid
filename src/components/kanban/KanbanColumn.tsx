/**
 * KanbanColumn - A column in the Kanban board
 *
 * Renders a vertical list of cards with header showing status name and count.
 * Uses @dnd-kit useDroppable for cross-platform drop zone (mouse + touch).
 *
 * GH#2200: Migrated from HTML5 DnD to dnd-kit for touch support
 */

import { useDroppable } from '@dnd-kit/core'
import { useVirtualizer } from '@tanstack/react-virtual'
import { observer } from 'mobx-react-lite'
import { memo, useRef } from 'react'
import { cn } from '@/shared/lib/utils'
import type { KanbanCard as KanbanCardType, KanbanColumn as KanbanColumnType } from '../../stores/KanbanViewStore'
import { KanbanCard } from './KanbanCard'

interface KanbanColumnProps {
  column: KanbanColumnType
  cards: KanbanCardType[]
  enableDragAndDrop?: boolean
  onCardClick?: (cardId: string) => void
}

const KanbanColumnInner = observer(function KanbanColumn({
  column,
  cards,
  enableDragAndDrop = true,
  onCardClick,
}: KanbanColumnProps) {
  const { isOver, setNodeRef: setDropRef } = useDroppable({ id: column.id })

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
      ref={setDropRef}
      className={cn(
        'vibegridx-kanban-column flex flex-col h-full min-w-[280px] max-w-[320px] flex-shrink-0',
        'bg-muted/30 rounded-lg border border-border/50',
        'transition-all duration-200',
        isOver && 'border-primary/50 bg-primary/5 ring-2 ring-primary/20',
      )}
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
                  <KanbanCard card={card} enableDragAndDrop={enableDragAndDrop} onClick={onCardClick} />
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
