/**
 * KanbanBoard - Main Kanban board container
 *
 * Renders columns horizontally with drag-and-drop support via @dnd-kit.
 * Integrates with KanbanViewStore for state management.
 *
 * GH#2200: Migrated from HTML5 DnD to dnd-kit for touch support
 */

import {
  DndContext,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { observer } from 'mobx-react-lite'
import { useMemo } from 'react'
import { getLogger } from '@/shared/lib/logging'
import type { KanbanCard as KanbanCardType } from '../../stores/KanbanViewStore'
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
  const { columns, cards } = kanbanStore

  // Sensors: PointerSensor for mouse (8px distance threshold), TouchSensor for touch (250ms hold)
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 5 },
    }),
  )

  // Pre-split cards by column in O(n) — eliminates O(n^2) per-column filtering
  const cardsByColumnId = useMemo(() => {
    const map = new Map<string, KanbanCardType[]>()
    for (const card of cards) {
      let bucket = map.get(card.columnId)
      if (!bucket) {
        bucket = []
        map.set(card.columnId, bucket)
      }
      bucket.push(card)
    }
    return map
  }, [cards])

  // dnd-kit event handlers
  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event
    const columnId = active.data.current?.columnId as string
    logger.debug('Card drag started', { cardId: active.id, columnId })
    kanbanStore.startDrag(active.id as string, columnId)
  }

  const handleDragOver = (event: DragOverEvent) => {
    const { over } = event
    const targetColumnId = over?.id as string | null
    if (kanbanStore.dragState.targetColumnId !== targetColumnId) {
      logger.debug('Drag over column', { columnId: targetColumnId })
      kanbanStore.updateDragTarget(targetColumnId ?? null)
    }
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { over } = event
    if (over) {
      const targetColumnId = over.id as string
      logger.info('Card dropped', {
        cardId: kanbanStore.dragState.cardId,
        from: kanbanStore.dragState.sourceColumnId,
        to: targetColumnId,
      })
      kanbanStore.updateDragTarget(targetColumnId)
      await kanbanStore.endDrag()
    } else {
      // Dropped outside any column — cancel
      logger.debug('Card drag cancelled — dropped outside columns')
      kanbanStore.cancelDrag()
    }
  }

  const handleDragCancel = () => {
    logger.debug('Card drag cancelled (Escape or interrupt)')
    kanbanStore.cancelDrag()
  }

  if (columns.length === 0) {
    return (
      <div
        className={`vibegridx-kanban-board flex items-center justify-center h-full text-muted-foreground ${className}`}
      >
        <div className="text-center">
          <p className="text-lg font-medium">No status values found</p>
          <p className="text-sm">Add items with status values to see them in the Kanban board</p>
        </div>
      </div>
    )
  }

  const boardContent = (
    <section
      className={`vibegridx-kanban-board flex gap-4 p-4 overflow-x-auto h-full ${className}`}
      aria-label="Kanban board"
    >
      {columns.map((column) => (
        <KanbanColumn
          key={column.id}
          column={column}
          cards={cardsByColumnId.get(column.id) ?? []}
          enableDragAndDrop={enableDragAndDrop}
          onCardClick={onCardClick}
        />
      ))}
    </section>
  )

  if (!enableDragAndDrop) {
    return boardContent
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      {boardContent}
    </DndContext>
  )
})
