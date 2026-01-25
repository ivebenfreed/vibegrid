/**
 * Expanded Content Portals
 *
 * React component that uses portals to render expanded content
 * into DOM containers created by BodyRenderer.
 *
 * GH#1240: VibeGrid Generic Row Expansion - Phase 4
 */

import type React from 'react'
import { useEffect, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { observer } from 'mobx-react-lite'
import { getLogger } from '@/shared/lib/logging'
import type { RowExpansionConfig, ExpandedContentProps } from '../types/row-expansion'
import type { InteractionStore } from '../stores/InteractionStore'
import type { TableCoreStore } from '../stores/TableCoreStore'

const logger = getLogger(['vibegrid', 'ExpandedContentPortals'])

// ====================================
// TYPES
// ====================================

export interface ExpandedContentPortalsProps {
  /** Container element that holds the VibeGrid */
  containerRef: React.RefObject<HTMLDivElement | null>

  /** Row expansion configuration */
  rowExpansionConfig?: RowExpansionConfig

  /** Interaction store for expansion state */
  interactionStore: InteractionStore

  /** Table core store for row data */
  tableCoreStore: TableCoreStore

  /** Entity type for nested VibeGrid */
  entityType: string

  /** Organization ID */
  orgId?: string
}

interface ExpandedPortalState {
  rowId: string
  parentRowId: string
  container: HTMLElement
  rowData: unknown
  expandedData: unknown[] | null
  isLoading: boolean
  error: Error | null
}

// ====================================
// COMPONENT
// ====================================

/**
 * Renders React content into expanded row DOM containers via portals.
 *
 * This component observes the DOM for expanded content containers
 * (created by BodyRenderer.createExpandedContentRowElement) and uses
 * React portals to render the actual content (nested VibeGrid or custom).
 */
export const ExpandedContentPortals = observer(function ExpandedContentPortals({
  containerRef,
  rowExpansionConfig,
  interactionStore,
  tableCoreStore,
  entityType,
  orgId,
}: ExpandedContentPortalsProps) {
  const [portals, setPortals] = useState<ExpandedPortalState[]>([])

  // ====================================
  // OBSERVE EXPANDED CONTENT CONTAINERS
  // ====================================

  useEffect(() => {
    if (!containerRef.current || !rowExpansionConfig?.enabled) {
      setPortals([])
      return
    }

    const container = containerRef.current

    /**
     * Find all expanded content containers in the DOM and create portal states
     */
    const updatePortals = () => {
      const expandedContainers = container.querySelectorAll(
        '.vibegridx-expanded-content-container[data-has-data="true"]',
      )

      const newPortals: ExpandedPortalState[] = []

      expandedContainers.forEach((element) => {
        const htmlElement = element as HTMLElement
        const parentRowId = htmlElement.dataset.rowId

        if (!parentRowId) return

        // Find the parent row data
        const parentRow = tableCoreStore.processedRows.find((row: any) => row.id === parentRowId)
        if (!parentRow) return

        // Get expanded state from interaction store
        const expandedState = interactionStore.expandedRowStates.get(parentRowId)

        newPortals.push({
          rowId: `${parentRowId}:expanded-portal`,
          parentRowId,
          container: htmlElement,
          rowData: parentRow.data || parentRow,
          expandedData: expandedState?.data ?? null,
          isLoading: expandedState?.isLoading ?? false,
          error: expandedState?.error ?? null,
        })
      })

      setPortals(newPortals)
      logger.debug('Updated expanded content portals', {
        count: newPortals.length,
        rowIds: newPortals.map((p) => p.parentRowId),
      })
    }

    // Initial update
    updatePortals()

    // Observe DOM mutations to detect new expanded content containers
    const mutationObserver = new MutationObserver((mutations) => {
      // Check if any mutations affect expanded content containers
      const hasRelevantMutation = mutations.some((mutation) => {
        if (mutation.type === 'childList') {
          return (
            Array.from(mutation.addedNodes).some(
              (node) =>
                node instanceof HTMLElement &&
                (node.classList.contains('vibegridx-expanded-content-row') ||
                  node.querySelector('.vibegridx-expanded-content-container')),
            ) ||
            Array.from(mutation.removedNodes).some(
              (node) =>
                node instanceof HTMLElement &&
                (node.classList.contains('vibegridx-expanded-content-row') ||
                  node.querySelector('.vibegridx-expanded-content-container')),
            )
          )
        }
        if (mutation.type === 'attributes' && mutation.attributeName === 'data-has-data') {
          return true
        }
        return false
      })

      if (hasRelevantMutation) {
        updatePortals()
      }
    })

    mutationObserver.observe(container, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-has-data'],
    })

    // Also update when expansion version changes (MobX reactive)
    // This is handled by the observer() wrapper

    return () => {
      mutationObserver.disconnect()
    }
  }, [containerRef, rowExpansionConfig?.enabled, interactionStore, tableCoreStore])

  // Also re-render when expansion state changes
  // Access expansionVersion to trigger re-render
  const _expansionVersion = interactionStore.expansionVersion

  // ====================================
  // COLLAPSE HANDLER
  // ====================================

  const handleCollapse = useCallback(
    (rowId: string) => {
      interactionStore.collapseRow(rowId)
    },
    [interactionStore],
  )

  // ====================================
  // RENDER EXPANDED CONTENT
  // ====================================

  const renderExpandedContent = useCallback(
    (portal: ExpandedPortalState) => {
      if (!rowExpansionConfig) return null

      const props: ExpandedContentProps = {
        rowId: portal.parentRowId,
        rowData: portal.rowData,
        expandedData: portal.expandedData,
        isLoading: portal.isLoading,
        error: portal.error,
        onCollapse: () => handleCollapse(portal.parentRowId),
        nestedColumns: rowExpansionConfig.nestedColumns,
        nestedEntityType: rowExpansionConfig.nestedEntityType,
      }

      // Use custom render function if provided
      if (rowExpansionConfig.renderExpandedContent) {
        return rowExpansionConfig.renderExpandedContent(props)
      }

      // Default: render nested VibeGrid
      return (
        <DefaultExpandedContent
          {...props}
          entityType={entityType}
          orgId={orgId}
          rowExpansionConfig={rowExpansionConfig}
        />
      )
    },
    [rowExpansionConfig, entityType, orgId, handleCollapse],
  )

  // ====================================
  // RENDER PORTALS
  // ====================================

  if (!rowExpansionConfig?.enabled || portals.length === 0) {
    return null
  }

  return (
    <>
      {portals.map((portal) =>
        createPortal(
          <div
            key={portal.rowId}
            className="vibegridx-expanded-portal-content"
            style={{ width: '100%', height: '100%' }}
          >
            {renderExpandedContent(portal)}
          </div>,
          portal.container,
        ),
      )}
    </>
  )
})

// ====================================
// DEFAULT EXPANDED CONTENT
// ====================================

interface DefaultExpandedContentProps extends ExpandedContentProps {
  entityType: string
  orgId?: string
  rowExpansionConfig: RowExpansionConfig
}

/**
 * Default expanded content renderer that shows nested data in a table format.
 * For full nested VibeGrid support, use the renderExpandedContent callback.
 */
function DefaultExpandedContent({
  rowId: _rowId,
  rowData: _rowData,
  expandedData,
  isLoading,
  error,
  onCollapse,
  nestedColumns,
  nestedEntityType,
  entityType: _entityType,
  orgId: _orgId,
  rowExpansionConfig: _rowExpansionConfig,
}: DefaultExpandedContentProps) {
  // For now, render a simple table view of expanded data
  // Full nested VibeGrid support can be added via renderExpandedContent

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-4 text-muted-foreground">
        <div className="vibegridx-expand-spinner" />
        <span>Loading...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 p-4 text-destructive">
        <span className="text-lg">⚠️</span>
        <span>{error.message || 'Failed to load data'}</span>
        <button
          type="button"
          className="ml-2 px-2 py-1 text-sm bg-muted hover:bg-muted/80 rounded"
          onClick={() => {
            // Trigger reload by collapsing and re-expanding
            onCollapse()
          }}
        >
          Retry
        </button>
      </div>
    )
  }

  if (!expandedData || expandedData.length === 0) {
    return <div className="p-4 text-muted-foreground">No items</div>
  }

  // Simple table rendering for expanded data
  // Features can provide custom renderExpandedContent for full VibeGrid
  const columns =
    nestedColumns ||
    Object.keys(expandedData[0] || {})
      .filter((key) => !key.startsWith('_') && key !== 'id')
      .slice(0, 5) // Limit to first 5 columns for default view

  return (
    <div className="vibegridx-nested-table">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-muted-foreground">
          {nestedEntityType || 'Items'} ({expandedData.length})
        </span>
        <button
          type="button"
          className="text-xs text-muted-foreground hover:text-foreground"
          onClick={onCollapse}
        >
          Collapse
        </button>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            {(Array.isArray(columns) ? columns : []).map((col: any) => (
              <th
                key={typeof col === 'string' ? col : col.id}
                className="text-left py-1 px-2 font-medium text-muted-foreground"
              >
                {typeof col === 'string' ? col : col.name || col.id}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {expandedData.map((item: any, index: number) => (
            <tr key={item.id || index} className="border-b border-border/50">
              {(Array.isArray(columns) ? columns : []).map((col: any) => {
                const colId = typeof col === 'string' ? col : col.id
                const value = item[colId]
                return (
                  <td key={colId} className="py-1 px-2">
                    {formatCellValue(value)}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * Simple cell value formatter for default table view
 */
function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'number') return value.toLocaleString()
  if (value instanceof Date) return value.toLocaleDateString()
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

export default ExpandedContentPortals
