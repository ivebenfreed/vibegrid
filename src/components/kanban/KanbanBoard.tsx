/**
 * KanbanBoard - Main Kanban board container
 *
 * Renders columns horizontally with drag-and-drop support.
 * Integrates with KanbanViewStore for state management.
 */

import { observer } from 'mobx-react-lite'
import React from 'react'
import { getLogger } from '@/shared/lib/logging'
import { useKanbanViewStore } from '../../stores/context'
import { KanbanColumn } from './KanbanColumn'

const logger = getLogger(['vibegrid', 'components', 'KanbanBoard'])

interface KanbanBoardProps {
  onCardClick?: (cardId: string) => void
  className?: string
  enableDragAndDrop?: boolean
}

export const KanbanBoard = observer(function KanbanBoard({
  onCardClick,
  className = '',
  enableDragAndDrop = true,
}: KanbanBoardProps) {
  const kanbanStore = useKanbanViewStore()
  const { columns, cards, dragState } = kanbanStore

  // Drag handlers
  const handleCardDragStart = (cardId: string, columnId: string) => {
    logger.debug('Card drag started', { cardId, columnId })
    kanbanStore.startDrag(cardId, columnId)
  }

  const handleCardDragEnd = () => {
    logger.debug('Card drag ended')
    // If drag ended without a valid drop (no target column), cancel it
    // This handles drops outside of any column
    if (dragState.isDragging && !dragState.targetColumnId) {
      kanbanStore.cancelDrag()
    }
  }

  const handleDragOver = (columnId: string) => {
    if (dragState.targetColumnId !== columnId) {
      logger.debug('Drag over column', { columnId })
      kanbanStore.updateDragTarget(columnId)
    }
  }

  const handleDragLeave = () => {
    // Only clear if not over another column
    kanbanStore.updateDragTarget(null)
  }

  const handleDrop = async (targetColumnId: string) => {
    logger.info('Card dropped', {
      cardId: dragState.cardId,
      from: dragState.sourceColumnId,
      to: targetColumnId,
    })

    // Update target before ending drag
    kanbanStore.updateDragTarget(targetColumnId)

    // End drag and persist
    await kanbanStore.endDrag()
  }

  if (columns.length === 0) {
    return (
      <div className={`vibegridx-kanban-board flex items-center justify-center h-full text-muted-foreground ${className}`}>
        <div className="text-center">
          <p className="text-lg font-medium">No status values found</p>
          <p className="text-sm">Add items with status values to see them in the Kanban board</p>
        </div>
      </div>
    )
  }

  return (
    <section
      className={`vibegridx-kanban-board flex gap-4 p-4 overflow-x-auto h-full ${className}`}
      aria-label="Kanban board"
    >
      {columns.map((column) => (
        <KanbanColumn
          key={column.id}
          column={column}
          cards={cards}
          isDragOver={dragState.targetColumnId === column.id}
          draggingCardId={dragState.cardId}
          enableDragAndDrop={enableDragAndDrop}
          onDragOver={enableDragAndDrop ? handleDragOver : undefined}
          onDragLeave={enableDragAndDrop ? handleDragLeave : undefined}
          onDrop={enableDragAndDrop ? handleDrop : undefined}
          onCardDragStart={enableDragAndDrop ? handleCardDragStart : undefined}
          onCardDragEnd={enableDragAndDrop ? handleCardDragEnd : undefined}
          onCardClick={onCardClick}
        />
      ))}
    </section>
  )
})
