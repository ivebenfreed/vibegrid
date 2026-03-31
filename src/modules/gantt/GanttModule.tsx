/**
 * GanttModule - Timeline view mode for VibeGrid
 *
 * Renders a split-pane view with table on left and timeline on right.
 * Supports dependencies, drag-to-resize bars, and cascade updates.
 *
 * @see GridModule for interface definition
 * @see Issue #1416 for architecture overview
 */

import { useMemo, useCallback } from 'react'
import type { GridModule, GridModuleRenderProps, SchemaFieldDescriptor } from '../GridModule'
import type { VibeGridStores } from '../../stores/context'
import { CutoffResizer } from '../../components/CutoffResizer'
import { GanttTimeline } from '../../components/GanttTimeline'
import { GanttEmptyState } from './GanttEmptyState'
import { getLogger } from '@/shared/lib/logging'
import type { SlotRegistry } from '../../slots/SlotRegistry'

const logger = getLogger(['vibegrid', 'modules', 'GanttModule'])

const DATE_TYPES = ['date', 'datetime', 'datetime-local']

/** Check if schema has any date fields */
function hasDateFields(schemaFields?: SchemaFieldDescriptor[]): boolean {
  if (!schemaFields?.length) return false // no schema fields = show empty state
  return schemaFields.some((f) => DATE_TYPES.includes(f.fieldType))
}

/**
 * GanttModuleContent - Self-contained split-pane: CutoffResizer + GanttTimeline
 *
 * The table pane (left) is always rendered by VibeGrid.tsx's containerRef.
 * This module renders the resizer handle and timeline pane (right).
 * Shows an empty state nudge when entity has no date fields (GH#2139).
 */
function GanttModuleContent({ props, stores }: { props: GridModuleRenderProps; stores: VibeGridStores }) {
  const { interactionStore, viewModeStore } = stores
  const schemaFields = props.schemaFields as SchemaFieldDescriptor[] | undefined

  const showEmptyState = useMemo(() => !hasDateFields(schemaFields), [schemaFields])

  const handleCutoffResize = useCallback(
    (newWidth: number) => {
      viewModeStore.setCutoffWidth(newWidth)
    },
    [viewModeStore],
  )

  const handleResizeEnd = useCallback(() => {
    logger.debug('Cutoff resize ended', { width: viewModeStore.cutoffWidth })
  }, [viewModeStore.cutoffWidth])

  const handleCutoffReset = useCallback(() => {
    viewModeStore.resetCutoffWidth()
  }, [viewModeStore])

  logger.debug('GanttModule render', {
    hasGanttStore: !!stores.ganttViewStore,
    showEmptyState,
  })

  // GH#2139: Show empty state when no date fields
  if (showEmptyState) {
    return (
      <div className="flex-1 h-full min-w-0">
        <GanttEmptyState entityType={props.entityType} />
      </div>
    )
  }

  return (
    <>
      <CutoffResizer
        onResize={(deltaX) => handleCutoffResize(viewModeStore.cutoffWidth + deltaX)}
        onResizeEnd={handleResizeEnd}
        onReset={handleCutoffReset}
      />
      <div className="flex-1 h-full min-w-0 overflow-auto">
        <GanttTimeline
          onBarClick={(rowId: string) => {
            logger.info('Gantt bar clicked', { rowId })
            interactionStore.selectRow(rowId)
          }}
        />
      </div>
    </>
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
   * Register Gantt-specific cell renderers for the left table pane.
   *
   * These override default renderers at priority 100 when viewMode is 'gantt':
   * - GanttDateSummaryRenderer: compact date range for date/datetime columns
   * - GanttStatusChipRenderer: progress chip for status columns
   */
  registerSlots: (slotRegistry: SlotRegistry) => {
    logger.debug('GanttModule registerSlots')

    // Compact date display for left-pane date columns in Gantt view
    slotRegistry.register({
      id: 'gantt-date-summary',
      priority: 100,
      contextFilter: (ctx) => ctx.viewMode === 'gantt',
      renderer: () => ({
        render(
          value: unknown,
          _column: import('../../types').Column,
          _context: import('../../slots/SlotRegistry').CellRendererContext,
        ): HTMLElement {
          const container = document.createElement('div')
          container.className = 'vibegridx-cell-gantt-date'
          container.style.cssText = 'display: flex; align-items: center; gap: 4px; font-size: 12px; color: #6b7280;'

          if (!value) {
            container.textContent = '—'
            return container
          }

          try {
            const date = new Date(String(value))
            const month = date.toLocaleString('default', { month: 'short' })
            const day = date.getDate()
            container.textContent = `${month} ${day}`
          } catch {
            container.textContent = String(value)
          }

          return container
        },
        format(value: unknown): string {
          if (!value) return ''
          try {
            const date = new Date(String(value))
            return date.toLocaleDateString()
          } catch {
            return String(value)
          }
        },
        validate(): string | null {
          return null
        },
        affordances: {
          sortable: true,
          filterable: true,
          editable: true,
          resizable: true,
          reorderable: true,
          groupable: false,
        },
        interactionPolicy: {
          defaultAction: 'edit' as const,
          editTrigger: 'click' as const,
          blurPolicy: 'commit' as const,
        },
        metadata: { category: 'gantt' as const, description: 'Compact date for Gantt left pane' },
      }),
    })

    // Override for date aliases in gantt view
    for (const alias of ['date', 'datetime', 'datetime-local', 'time', 'timestamp', 'timestamptz']) {
      slotRegistry.register({
        id: `gantt-${alias}`,
        priority: 100,
        contextFilter: (ctx) => ctx.viewMode === 'gantt',
        renderer: () => slotRegistry.resolve({ cellType: 'gantt-date-summary' } as any, { viewMode: 'gantt' })!,
      })
    }

    // Status chip renderer for Gantt left pane
    slotRegistry.register({
      id: 'gantt-status-chip',
      priority: 100,
      contextFilter: (ctx) => ctx.viewMode === 'gantt',
      renderer: () => ({
        render(
          value: unknown,
          _column: import('../../types').Column,
          _context: import('../../slots/SlotRegistry').CellRendererContext,
        ): HTMLElement {
          const container = document.createElement('div')
          container.className = 'vibegridx-cell-gantt-status'
          container.style.cssText = 'display: flex; align-items: center;'

          const chip = document.createElement('span')
          chip.style.cssText =
            'display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 9999px; font-size: 11px; font-weight: 500; background: #f3f4f6; color: #374151;'

          const label = String(value ?? '')
          chip.textContent = label || '—'

          // Color-code common statuses
          const lower = label.toLowerCase()
          if (lower.includes('done') || lower.includes('complete')) {
            chip.style.background = '#dcfce7'
            chip.style.color = '#166534'
          } else if (lower.includes('progress') || lower.includes('active')) {
            chip.style.background = '#dbeafe'
            chip.style.color = '#1e40af'
          } else if (lower.includes('block') || lower.includes('stuck')) {
            chip.style.background = '#fee2e2'
            chip.style.color = '#991b1b'
          }

          container.appendChild(chip)
          return container
        },
        format(value: unknown): string {
          return String(value ?? '')
        },
        validate(): string | null {
          return null
        },
        affordances: {
          sortable: true,
          filterable: true,
          editable: true,
          resizable: true,
          reorderable: true,
          groupable: true,
        },
        interactionPolicy: {
          defaultAction: 'edit' as const,
          editTrigger: 'click' as const,
          blurPolicy: 'commit' as const,
        },
        metadata: { category: 'gantt' as const, description: 'Status chip for Gantt left pane' },
      }),
    })

    // Override status in gantt view
    slotRegistry.register({
      id: 'gantt-status',
      priority: 100,
      contextFilter: (ctx) => ctx.viewMode === 'gantt',
      renderer: () => slotRegistry.resolve({ cellType: 'gantt-status-chip' } as any, { viewMode: 'gantt' })!,
    })
  },
}

export default GanttModule
