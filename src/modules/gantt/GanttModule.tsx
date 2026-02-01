/**
 * GanttModule - Timeline view mode for VibeGrid
 *
 * Renders a split-pane view with table on left and timeline on right.
 * Supports dependencies, drag-to-resize bars, and cascade updates.
 *
 * @see GridModule for interface definition
 * @see Issue #1416 for architecture overview
 */

import React from 'react'
import type { GridModule, GridModuleRenderProps } from '../GridModule'
import type { VibeGridStores } from '../../stores/context'
import { GanttTimeline } from '../../components/GanttTimeline'
import { getLogger } from '@/shared/lib/logging'
import type { SlotRegistry } from '../../slots/SlotRegistry'

const logger = getLogger(['vibegrid', 'modules', 'GanttModule'])

/**
 * GanttModuleContent - Wrapper for GanttTimeline with module props
 *
 * Note: The split-pane layout with table on left is handled by VibeGrid.tsx
 * This module only provides the timeline portion (right pane).
 */
function GanttModuleContent({
  props,
  stores,
}: {
  props: GridModuleRenderProps
  stores: VibeGridStores
}) {
  const { interactionStore } = stores

  logger.debug('GanttModule render', {
    hasGanttStore: !!stores.ganttViewStore,
  })

  return (
    <GanttTimeline
      onBarClick={(rowId: string) => {
        logger.info('Gantt bar clicked', { rowId })
        interactionStore.selectRow(rowId)
      }}
    />
  )
}

/**
 * GanttModule: Timeline view with dependencies.
 *
 * Renders entities on a timeline with:
 * - Horizontal bars showing start/end dates
 * - Dependency arrows between related tasks
 * - Drag-to-resize for date changes
 * - Cascade scheduling (dependent tasks auto-update)
 */
export const GanttModule: GridModule = {
  id: 'gantt',
  displayName: 'Gantt Timeline',
  icon: 'gantt',

  init: (stores: VibeGridStores) => {
    logger.info('GanttModule init')

    // GanttViewStore is already created by context provider
    const { ganttViewStore, viewModeStore, tableCoreStore } = stores

    if (!ganttViewStore) {
      logger.error('GanttViewStore not found in stores')
      return
    }

    // Connect ViewModeStore to GanttViewStore for auto-sort on activation
    viewModeStore.setGanttViewStore(ganttViewStore)

    // Auto-detect date fields for Gantt
    const columns = tableCoreStore.columns
    if (columns && columns.length > 0) {
      const updates: {
        startField?: string
        endField?: string
        statusField?: string
        progressField?: string
      } = {}

      // Find start date field
      const startDateCol = columns.find((col: any) => {
        const id = col.id?.toLowerCase() || ''
        const name = (col.name || '').toLowerCase()
        return id === 'start_date' || id === 'startdate' || name.includes('start date')
      })
      if (startDateCol && !ganttViewStore.fieldMapping.startField) {
        updates.startField = startDateCol.id
      }

      // Find end date field
      const endDateCol = columns.find((col: any) => {
        const id = col.id?.toLowerCase() || ''
        const name = (col.name || '').toLowerCase()
        return (
          id === 'end_date' ||
          id === 'enddate' ||
          id === 'due_date' ||
          name.includes('end date') ||
          name.includes('due date')
        )
      })
      if (endDateCol && !ganttViewStore.fieldMapping.endField) {
        updates.endField = endDateCol.id
      }

      // Find status field for bar coloring
      const statusCol = columns.find((col: any) => {
        const id = col.id?.toLowerCase() || ''
        const name = (col.name || '').toLowerCase()
        const type = (col.type || col.cellType || '').toLowerCase()
        return id === 'status' || name === 'status' || type === 'status' || type === 'status_set'
      })
      if (statusCol && !ganttViewStore.fieldMapping.statusField) {
        updates.statusField = statusCol.id
      }

      // Find progress field for progress bars
      const progressCol = columns.find((col: any) => {
        const id = col.id?.toLowerCase() || ''
        const name = (col.name || '').toLowerCase()
        return (
          id.includes('progress') ||
          id.includes('percent') ||
          id.includes('completion') ||
          name.includes('progress') ||
          name.includes('percent') ||
          name.includes('completion')
        )
      })
      if (progressCol && !ganttViewStore.fieldMapping.progressField) {
        updates.progressField = progressCol.id
      }

      if (Object.keys(updates).length > 0) {
        ganttViewStore.setFieldMapping(updates)
        logger.info('GanttModule auto-detected field mappings', updates)
      }
    }

    // Return cleanup function
    return () => {
      logger.info('GanttModule cleanup')
      // Don't dispose the store - it's managed by the context provider
    }
  },

  render: (props: GridModuleRenderProps, stores: VibeGridStores) => {
    return <GanttModuleContent props={props} stores={stores} />
  },

  /**
   * Register Gantt-specific cell renderers.
   *
   * Future D2 integration: Register timeline bar cells, dependency arrow cells, etc.
   * For now, this is a stub for the D2 implementation.
   */
  registerSlots: (_slotRegistry: SlotRegistry) => {
    logger.debug('GanttModule registerSlots - D2 integration point')
    // D2 implementation will register:
    // - gantt-bar: Timeline bar renderer
    // - gantt-milestone: Milestone diamond renderer
    // - gantt-dependency: Dependency arrow renderer
    // These slots will have contextFilter: (ctx) => ctx.viewMode === 'gantt'
  },
}

export default GanttModule
