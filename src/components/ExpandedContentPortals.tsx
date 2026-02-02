/**
 * Expanded Content Portals
 *
 * React component that uses portals to render expanded content
 * into DOM containers created by BodyRenderer.
 *
 * GH#1240: VibeGrid Generic Row Expansion - Phase 4
 *
 * Uses a real nested VibeGrid instance for full cell styling and column utils.
 */

import type React from 'react'
import { useEffect, useState, useCallback, useMemo, Suspense, lazy } from 'react'
import { createPortal } from 'react-dom'
import { observer } from 'mobx-react-lite'
import { getLogger } from '@/shared/lib/logging'
import type { RowExpansionConfig, ExpandedContentProps } from '../types/row-expansion'
import type { InteractionStore } from '../stores/InteractionStore'
import type { TableCoreStore } from '../stores/TableCoreStore'

// Lazy imports to avoid circular dependency (VibeGrid imports ExpandedContentPortals)
const VibeGrid = lazy(() => import('../VibeGrid').then((m) => ({ default: m.VibeGrid })))
const VibeGridStoreProvider = lazy(() =>
  import('../stores/context').then((m) => ({ default: m.VibeGridStoreProvider })),
)

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

    // GH#1429 ML6: Debounce MutationObserver to prevent cascade of updates during rapid DOM changes
    let debounceTimer: ReturnType<typeof setTimeout> | null = null

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
        // GH#1429 ML6: Debounce by 16ms (one frame) to coalesce rapid mutations
        if (debounceTimer) {
          clearTimeout(debounceTimer)
        }
        debounceTimer = setTimeout(() => {
          updatePortals()
          debounceTimer = null
        }, 16)
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
      // GH#1429 ML6: Clear debounce timer on cleanup
      if (debounceTimer) {
        clearTimeout(debounceTimer)
      }
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
// DEFAULT EXPANDED CONTENT (Nested VibeGrid)
// ====================================

interface DefaultExpandedContentProps extends ExpandedContentProps {
  entityType: string
  orgId?: string
  rowExpansionConfig: RowExpansionConfig
}

/**
 * Default expanded content renderer using a real nested VibeGrid.
 * This provides full cell styling, field type rendering, and column utilities.
 */
const DefaultExpandedContent = observer(function DefaultExpandedContent({
  rowId,
  expandedData,
  isLoading,
  error,
  onCollapse,
  nestedEntityType,
  orgId,
}: DefaultExpandedContentProps) {
  // Create collection override for nested VibeGrid
  const collectionOverride = useMemo(() => {
    if (!expandedData) return undefined

    return {
      items: expandedData.map((item: any, index: number) => ({
        ...item,
        id: item.id || `${rowId}-item-${index}`,
      })),
      count: expandedData.length,
    }
  }, [expandedData, rowId])

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-4 text-muted-foreground">
        <div className="vibegridx-expand-spinner" />
        <span>Loading...</span>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="flex items-center gap-2 p-4 text-destructive">
        <span className="text-lg">⚠️</span>
        <span>{error.message || 'Failed to load data'}</span>
        <button
          type="button"
          className="ml-2 px-2 py-1 text-sm bg-muted hover:bg-muted/80 rounded"
          onClick={onCollapse}
        >
          Retry
        </button>
      </div>
    )
  }

  // Empty state
  if (!expandedData || expandedData.length === 0) {
    return <div className="p-4 text-muted-foreground">No items</div>
  }

  // Render nested VibeGrid with full cell styling
  // Wrap in VibeGridStoreProvider with collectionOverride for data
  return (
    <div className="vibegridx-nested-grid" style={{ height: '100%', minHeight: 80 }}>
      <Suspense
        fallback={
          <div className="flex items-center gap-2 p-4 text-muted-foreground">
            <div className="vibegridx-expand-spinner" />
            <span>Loading grid...</span>
          </div>
        }
      >
        <VibeGridStoreProvider
          tableId={`nested-${rowId}`}
          entityType={nestedEntityType || 'nested'}
          orgId={orgId}
          collectionOverride={collectionOverride}
        >
          <VibeGrid
            tableId={`nested-${rowId}`}
            entityType={nestedEntityType || 'nested'}
            orgId={orgId}
            skipDataFetching={true}
            enableSelectionColumn={false}
            enableVirtualScrolling={false}
            enableGrouping={false}
            enableFiltering={false}
            enableSorting={false}
            enableDragAndDrop={false}
            // GH#1240: No header/toolbar for nested grids - just the data rows
            showHeader={false}
            showToolbar={false}
            height={(expandedData?.length || 0) * 32 + 8}
          />
        </VibeGridStoreProvider>
      </Suspense>
    </div>
  )
})

// GH#1240: Column generation and formatting moved to VibeGrid's internal column-generation system
// The nested VibeGrid auto-generates columns from the entity schema

export default ExpandedContentPortals
