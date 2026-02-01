/**
 * KanbanModule - Kanban board view mode for VibeGrid
 *
 * Renders cards in columns based on a groupBy field.
 * Supports drag-and-drop to move cards between columns.
 *
 * @see GridModule for interface definition
 * @see Issue #1416 for architecture overview
 */

import React from 'react'
import type { GridModule, GridModuleRenderProps } from '../GridModule'
import type { VibeGridStores } from '../../stores/context'
import { KanbanBoard } from '../../components/kanban'
import { getLogger } from '@/shared/lib/logging'

const logger = getLogger(['vibegrid', 'modules', 'KanbanModule'])

/**
 * KanbanModuleContent - Wrapper for KanbanBoard with module props
 */
function KanbanModuleContent({
  props,
  stores,
}: {
  props: GridModuleRenderProps
  stores: VibeGridStores
}) {
  const { enableDragAndDrop = true, className = '' } = props

  logger.debug('KanbanModule render', {
    enableDragAndDrop,
    hasKanbanStore: !!stores.kanbanViewStore,
  })

  return (
    <KanbanBoard
      className={className}
      enableDragAndDrop={enableDragAndDrop}
      onCardClick={(cardId) => {
        logger.info('Kanban card clicked', { cardId })
        // Card click could trigger detail view or selection
      }}
    />
  )
}

/**
 * KanbanModule: Board view with drag-drop cards.
 *
 * Displays entities as cards grouped by a status/category field.
 * The groupBy field is auto-detected from columns or can be configured.
 */
export const KanbanModule: GridModule = {
  id: 'kanban',
  displayName: 'Kanban Board',
  icon: 'kanban',

  init: (stores: VibeGridStores) => {
    logger.info('KanbanModule init')

    // KanbanViewStore is already created by context provider
    // Here we ensure it's properly initialized with the current data
    const { kanbanViewStore, tableCoreStore } = stores

    if (!kanbanViewStore) {
      logger.error('KanbanViewStore not found in stores')
      return
    }

    // Auto-detect status field and set up grouping
    // This is also done in VibeGrid.tsx but we ensure it here for module isolation
    const columns = tableCoreStore.columns
    if (columns && columns.length > 0) {
      const statusCol = columns.find((col: any) => {
        const id = col.id?.toLowerCase() || ''
        const name = (col.name || '').toLowerCase()
        const type = (col.type || col.cellType || '').toLowerCase()
        return id === 'status' || name === 'status' || type === 'status' || type === 'status_set'
      })

      if (statusCol && !kanbanViewStore.groupByField) {
        kanbanViewStore.setGroupByField(statusCol.id)
        logger.info('KanbanModule auto-set groupByField', { field: statusCol.id })
      }
    }

    // Return cleanup function
    return () => {
      logger.info('KanbanModule cleanup')
      // Don't dispose the store - it's managed by the context provider
      // Just clean up any module-specific state if needed
    }
  },

  render: (props: GridModuleRenderProps, stores: VibeGridStores) => {
    return <KanbanModuleContent props={props} stores={stores} />
  },

  // No custom slots for kanban view currently
  // Future: Could register KanbanCard slot for custom card rendering
  // registerSlots: undefined,
}

export default KanbanModule
