import { observable, syncState, when } from '@legendapp/state'
import { useSelector } from '@legendapp/state/react'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { universeOrgId$, universeUserId$ } from '@/legend-state/observables'
import { log } from '@/logger'
import {
  useVibeGridLoadingState,
  VibeGridLoadingOverlay,
} from './components/VibeGridLoadingOverlay'
import { VibeGridXHeaderPure } from './components/VibeGridXHeaderPure'
import { SimplePassiveRenderer } from './renderers/core/SimplePassiveRenderer'
import { createTableCore$, createTableCoreSync$ } from './stores/data-state'
import { createHydrationManager, type VibeGridHydrationManager } from './stores/init-state'
import { createTableInteraction$ } from './stores/interaction-state'
import { createVibeGridPreferences } from './stores/simple-persistence'
import { createVibeGridVisualState } from './stores/visual-state'
import type { Column, GroupConfig } from './types'

// Import VibeGrid CSS styles
import './vibegridx.css'

// ====================================
const fileLog = log('components/VibeGrid')

// ====================================
// COMPONENT PROPS
// ====================================

interface VibeGridProps<T = any> {
  tableId: string // Unique identifier for this table instance (required for persistence)
  entityType: string // Entity type (required - determines data source and generates columns internally)

  // Common options
  className?: string
  height?: number | string
  width?: number | string

  // Event handlers (all optional)
  onCellClick?: (rowId: string, columnId: string) => void
  onCellDoubleClick?: (rowId: string, columnId: string) => void
  onSelectionChange?: (selectedCells: Set<string>) => void
  onEditingChange?: (editingCell: { rowId: string; columnId: string } | null) => void
  onPerformanceUpdate?: (metrics: any) => void
  onEntityUpdate?: (rowId: string, updates: Record<string, any>) => Promise<void> | void
  onBatchEntityUpdate?: (
    updates: Array<{ id: string; updates: Record<string, any> }>,
  ) => Promise<void> | void

  // Performance options
  enableVirtualScrolling?: boolean
  bufferSize?: number

  // Feature flags
  enableGrouping?: boolean
  enableFiltering?: boolean
  enableSorting?: boolean
  enableDragAndDrop?: boolean
  enableSelectionColumn?: boolean
}

// ====================================
// MAIN COMPONENT
// ====================================

export function VibeGrid<T extends Record<string, any> = any>(
  props: VibeGridProps<T>,
): React.ReactElement {
  const {
    tableId,
    entityType,
    className = '',
    height = 600,
    width = '100%',
    enableSelectionColumn = false,
    onCellClick,
    onCellDoubleClick,
    onSelectionChange,
    onEditingChange,
    onPerformanceUpdate,
    onEntityUpdate,
    onBatchEntityUpdate,
    enableVirtualScrolling = true,
    bufferSize = 10,
    enableGrouping = true,
    enableFiltering = true,
    enableSorting = true,
    enableDragAndDrop = true,
  } = props

  // ====================================
  // REFS AND STATE
  // ====================================

  const containerRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<SimplePassiveRenderer | null>(null)
  const observablesRef = useRef<{
    tableCore$: any
    tableCoreSync$: any
    tableInteraction$: any
    tableViewport$: any
  } | null>(null)

  // Create init manager instance
  const initManagerRef = useRef<VibeGridHydrationManager | null>(null)
  if (!initManagerRef.current) {
    initManagerRef.current = createHydrationManager(tableId, entityType)
  }
  const initManager = initManagerRef.current

  // Create visual state instance (isolated per VibeGrid)
  const visualStateRef = useRef<ReturnType<typeof createVibeGridVisualState> | null>(null)
  if (!visualStateRef.current) {
    visualStateRef.current = createVibeGridVisualState(entityType)
  }
  const visualState = visualStateRef.current

  // Create simple persistence instance (isolated per VibeGrid)
  const simplePersistenceRef = useRef<ReturnType<typeof createVibeGridPreferences> | null>(null)
  if (!simplePersistenceRef.current) {
    const orgId = universeOrgId$.get()
    simplePersistenceRef.current = createVibeGridPreferences(entityType, orgId || undefined)
  }
  const simplePersistence = simplePersistenceRef.current

  // Use init manager hook for loading state
  const { isLoading, isReady, hasErrors, retry } = useVibeGridLoadingState(initManager)

  // Track when actual DOM rendering is complete
  const isRendered = useSelector(initManager.hydrationState$.rendererInitialized)

  // Log skeleton visibility changes
  useEffect(() => {
    const skeletonVisible = !isReady || !isRendered
    fileLog.debug('💀 SKELETON VISIBILITY', {
      event: 'skeleton_visibility_change',
      visible: skeletonVisible,
      isReady,
      isRendered,
      timestamp: performance.now(),
    })
  }, [isReady, isRendered])

  // ====================================
  // INITIALIZATION
  // ====================================

  useEffect(() => {
    // Initialize observables and setup persistence checking
    const initializeVibeGrid = () => {
      try {
        fileLog.info('🚀 Initializing VibeGrid', {
          tableId,
          entityType,
          columnCount: 'unknown (will be available after tableCore$ creation)',
        })

        // Mark CSS and basic dependencies as ready immediately
        initManager.markReady('cssStylesLoaded')
        initManager.markReady('entityDataLoaded')
        initManager.markReady('entityObservableReady')

        // Create the three-layer observables directly with visual state connection
        const { tableCore$, tableCoreSync$, loadSchemaAndColumns } = createTableCore$(
          entityType,
          visualState.visualInputs$,
          initManager,
        )

        const tableInteraction$ = createTableInteraction$(tableCore$)

        // Create a proper viewport observable with Legend State observables for each property
        const tableViewport$ = {
          scrollTop: observable(0),
          scrollLeft: observable(0),
          viewportWidth: observable(0),
          viewportHeight: observable(0),
          updateViewport(width: number, height: number) {
            tableViewport$.viewportWidth.set(width)
            tableViewport$.viewportHeight.set(height)
          },
          updateScroll(scrollTop: number, scrollLeft: number) {
            tableViewport$.scrollTop.set(scrollTop)
            tableViewport$.scrollLeft.set(scrollLeft)
          },
        }

        const observables = {
          tableCore$,
          tableCoreSync$,
          tableInteraction$,
          tableViewport$,
        }
        observablesRef.current = observables

        fileLog.debug('✅ Created pure observables', {
          entityType,
          columnCount: 'available after generatedColumns extraction',
        })

        // Mark data state dependencies as ready
        initManager.markReady('dataStateReady')
        initManager.markReady('interactionStateReady')

        // Mark persistence as loaded (Legend State handles this automatically)
        initManager.markReady('dataPersistenceLoaded')
        initManager.markReady('visualPersistenceLoaded')

        // Trigger schema loading (async)
        loadSchemaAndColumns().catch((error) => {
          fileLog.error('💥 Critical: Schema loading failed in VibeGrid initialization', {
            entityType,
            error,
          })
          initManager.markError('schemaLoaded', `Schema loading failed: ${error.message}`, true)
        })

        // Use init manager dependency system to initialize visual state when schema is ready
        when(
          () => initManager.hydrationState$.schemaLoaded.get(),
          () => {
            // Initialize isolated visual state for this VibeGrid instance AFTER columns are loaded
            const orgId = universeOrgId$.get()
            const userId = universeUserId$.get()
            if (orgId && userId) {
              // Initialize visual state columns using generated columns from tableCore$ (now available)
              const generatedColumns = tableCore$.columns.get()
              const defaultState = visualState.visualOperations.initializeColumns(
                generatedColumns,
                entityType,
                orgId,
                userId,
              )

              // Apply loaded preferences to visual inputs (this is where sortBy gets applied!)
              visualState.visualOperations.applyLoadedPreferencesToVisualInputs(
                visualState.visualInputs$,
                defaultState,
              )

              // Set columns in visual state - preferences are already loaded and applied above
              visualState.visualInputs$.columns.set(generatedColumns)

              fileLog.info('🎯 Visual state initialized with loaded columns', {
                entityType,
                orgId,
                userId,
                columnsCount: generatedColumns.length,
              })
              initManager.markReady('visualStateReady')
            } else {
              fileLog.warn('⚠️ Missing orgId or userId for visual state initialization', {
                orgId,
                userId,
              })
              initManager.markError('visualStateReady', 'Missing orgId or userId', true)
            }
          },
        )

        // Note: Emergency clear was successful, removing for normal operation

        // Set up reactive sync from visual state to simple persistence
        visualState.visualInputs$.columnWidths.onChange((newWidths) => {
          try {
            // GUARD: Don't save during initialization - only save user changes
            const isInitialized = initManager.isFullyHydrated$.get()
            if (!isInitialized) {
              fileLog.info('[PERSIST] ⏸️ columnWidths onChange SKIPPED - still initializing')
              return
            }

            fileLog.info('[PERSIST] 🔔 columnWidths onChange triggered', { newWidths })
            const actualWidths = newWidths?.value || newWidths
            fileLog.info('[PERSIST] 🔍 Extracted columnWidths data', { actualWidths })

            // Only save if it looks like actual column widths (not entity data)
            const isValidWidths =
              actualWidths &&
              typeof actualWidths === 'object' &&
              Object.values(actualWidths).every((v) => typeof v === 'number' && v > 0 && v < 2000)

            if (isValidWidths) {
              simplePersistence.operations.setAllColumnWidths(actualWidths)
              fileLog.info('[PERSIST] 💾 SAVED columnWidths to localStorage', { actualWidths })
            } else {
              fileLog.warn('[PERSIST] 🚨 Rejecting invalid columnWidths data', { actualWidths })
            }
          } catch (error) {
            fileLog.error('❌ Error in columnWidths onChange callback', { error })
          }
        })

        visualState.visualInputs$.columnVisibility.onChange((newVisibility) => {
          try {
            // GUARD: Don't save during initialization - only save user changes
            const isInitialized = initManager.isFullyHydrated$.get()
            if (!isInitialized) {
              fileLog.info('[PERSIST] ⏸️ columnVisibility onChange SKIPPED - still initializing')
              return
            }

            fileLog.info('[PERSIST] 🔔 columnVisibility onChange triggered', { newVisibility })
            // Extract the actual value from Legend State wrapper
            const actualVisibility = newVisibility?.value || newVisibility
            fileLog.info('[PERSIST] 🔍 Extracted visibility data', { actualVisibility })

            // Only save if it looks like actual visibility data (not entity data)
            const isValidVisibility =
              actualVisibility &&
              typeof actualVisibility === 'object' &&
              Object.values(actualVisibility).every((v) => typeof v === 'boolean')

            fileLog.info('[PERSIST] ✅ Validation result', {
              isValidVisibility,
              keys: Object.keys(actualVisibility || {}).length,
            })

            if (isValidVisibility) {
              simplePersistence.operations.setAllColumnVisibility(actualVisibility)
              fileLog.info('[PERSIST] 💾 SAVED column visibility to localStorage', {
                columnCount: Object.keys(actualVisibility).length,
              })
            } else {
              fileLog.warn('[PERSIST] 🚨 Rejecting invalid column visibility data', {
                actualVisibility,
              })
            }
          } catch (error) {
            fileLog.error('❌ Error in columnVisibility onChange callback', { error })
          }
        })

        visualState.visualInputs$.columnOrder.onChange((newOrder) => {
          try {
            fileLog.info('[PERSIST] 🔔 columnOrder onChange triggered', { newOrder })
            // Extract the actual value from Legend State wrapper
            const actualOrder = newOrder?.value || newOrder
            fileLog.info('[PERSIST] 🔍 Extracted order data', { actualOrder })

            // Only save if it looks like actual column order data (array of strings)
            const isValidOrder =
              Array.isArray(actualOrder) &&
              actualOrder.every((item) => typeof item === 'string' && item.length > 0)

            fileLog.info('[PERSIST] ✅ Validation result', {
              isValidOrder,
              length: actualOrder?.length || 0,
            })

            if (isValidOrder) {
              simplePersistence.operations.setColumnOrder(actualOrder)
              fileLog.info('[PERSIST] 💾 SAVED column order to localStorage', {
                columnCount: actualOrder.length,
                columnOrder: actualOrder,
              })
            } else {
              fileLog.warn('[PERSIST] 🚨 Rejecting invalid column order data', { actualOrder })
            }
          } catch (error) {
            fileLog.error('❌ Error in columnOrder onChange callback', { error })
          }
        })

        visualState.visualInputs$.sortBy.onChange((newSortBy) => {
          try {
            fileLog.info('[PERSIST] 🔔 sortBy onChange triggered', { newSortBy })
            // Extract the actual value from Legend State wrapper (consistent with other handlers)
            const actualSortBy = newSortBy?.value || newSortBy
            fileLog.info('[PERSIST] 🔍 Extracted sortBy data', { actualSortBy })

            // Only save if it looks like actual sort configuration (array)
            const isValidSortBy = Array.isArray(actualSortBy)

            fileLog.info('[PERSIST] ✅ Validation result', {
              isValidSortBy,
              length: actualSortBy?.length || 0,
            })

            if (isValidSortBy) {
              simplePersistence.operations.setSortBy(actualSortBy)
              fileLog.info('[PERSIST] 💾 SAVED sortBy to localStorage', {
                sortCount: actualSortBy.length,
                sortBy: actualSortBy,
              })
            } else {
              fileLog.warn('[PERSIST] 🚨 Rejecting invalid sortBy data', { actualSortBy })
            }
          } catch (error) {
            fileLog.error('❌ Error in sortBy onChange callback', { error })
          }
        })

        // Use a debounced approach to prevent partial saves from rapid updates
        let groupConfigSaveTimeout: NodeJS.Timeout | null = null

        visualState.visualInputs$.groupConfig.onChange((newGroupConfig) => {
          try {
            fileLog.info('[PERSIST] 🔔 groupConfig onChange triggered', { newGroupConfig })
            // Extract the actual value from Legend State wrapper (consistent with other handlers)
            const actualGroupConfig = newGroupConfig?.value || newGroupConfig
            fileLog.info('[PERSIST] 🔍 Extracted groupConfig data', { actualGroupConfig })

            // Clear any pending save
            if (groupConfigSaveTimeout) {
              clearTimeout(groupConfigSaveTimeout)
            }

            // Debounce the save to prevent partial updates from interfering
            groupConfigSaveTimeout = setTimeout(() => {
              // Only save if we have a complete group config or null (to clear)
              // Accept valid group configs with fields, or any object that represents clearing
              const isValidGroupConfig =
                actualGroupConfig === null ||
                (actualGroupConfig && typeof actualGroupConfig === 'object')

              fileLog.info('[PERSIST] ✅ Validation result', {
                isValidGroupConfig,
                isNull: actualGroupConfig === null,
                hasFields: !!actualGroupConfig?.fields,
                fieldsLength: actualGroupConfig?.fields?.length || 0,
                configType: typeof actualGroupConfig,
                configKeys: actualGroupConfig ? Object.keys(actualGroupConfig) : [],
                fullConfig: actualGroupConfig,
              })

              if (isValidGroupConfig) {
                simplePersistence.operations.setGroupConfig(actualGroupConfig)
                fileLog.info('[PERSIST] 💾 SAVED groupConfig to localStorage', {
                  groupConfig: actualGroupConfig,
                  fieldsCount: actualGroupConfig?.fields?.length || 0,
                })
              } else {
                fileLog.warn('[PERSIST] 🚨 Rejecting invalid groupConfig data', {
                  actualGroupConfig,
                })
              }
            }, 100) // Small delay to let any rapid updates settle
          } catch (error) {
            fileLog.error('❌ Error in groupConfig onChange callback', { error })
          }
        })

        visualState.visualInputs$.filters.onChange((newFilters) => {
          try {
            fileLog.info('[PERSIST] 🔔 filters onChange triggered', { newFilters })
            const actualFilters = newFilters?.value || newFilters
            fileLog.info('[PERSIST] 🔍 Extracted filters data', { actualFilters })

            const isValidFilters =
              Array.isArray(actualFilters) &&
              actualFilters.every(
                (filter) =>
                  filter &&
                  typeof filter === 'object' &&
                  typeof filter.field === 'string' &&
                  filter.field.length > 0 &&
                  typeof filter.operator === 'string' &&
                  filter.value !== undefined,
              )

            if (isValidFilters) {
              simplePersistence.operations.setFilters(actualFilters)
              fileLog.info('[PERSIST] 💾 SAVED filters to localStorage', { actualFilters })
            } else {
              fileLog.warn('[PERSIST] 🚨 Rejecting invalid filters data', { actualFilters })
            }
          } catch (error) {
            fileLog.error('❌ Error in filters onChange callback', { error })
          }
        })

        // Row order persistence - flat mode (ungrouped)
        tableCore$.flatRowOrder.onChange((newFlatRowOrder) => {
          try {
            simplePersistence.operations.setFlatRowOrder(newFlatRowOrder)
            fileLog.debug('📋 Saved flat row order to simple persistence', {
              rowCount: newFlatRowOrder.length,
              firstFew: newFlatRowOrder.slice(0, 3),
            })
          } catch (error) {
            if (error instanceof Error && error.name === 'QuotaExceededError') {
              fileLog.error('🚨 localStorage quota exceeded, running emergency cleanup', { error })
              simplePersistence.operations.emergencyCleanup()
              // Try again after cleanup
              try {
                simplePersistence.operations.setFlatRowOrder(newFlatRowOrder.slice(0, 100)) // Save only first 100 items
              } catch (retryError) {
                fileLog.error('❌ Retry failed after emergency cleanup', { retryError })
              }
            } else {
              fileLog.error('❌ Failed to save flat row order', { error })
            }
          }
        })

        // Row order persistence - grouped mode
        tableCore$.groupRowOrders.onChange((newGroupRowOrders) => {
          fileLog.debug('🔍 DEBUG: groupRowOrders.onChange fired', {
            newGroupRowOrders,
            type: typeof newGroupRowOrders,
            keys: Object.keys(newGroupRowOrders || {}),
            entries: Object.entries(newGroupRowOrders || {}),
          })

          // Save each group row order separately
          Object.entries(newGroupRowOrders).forEach(([groupId, rowOrder]) => {
            fileLog.debug('🔍 DEBUG: Processing group row order entry', {
              groupId,
              rowOrder,
              groupIdType: typeof groupId,
              rowOrderType: typeof rowOrder,
            })

            try {
              simplePersistence.operations.setGroupRowOrder(groupId, rowOrder)
            } catch (error) {
              if (error instanceof Error && error.name === 'QuotaExceededError') {
                fileLog.error(
                  '🚨 localStorage quota exceeded on group row order, running emergency cleanup',
                  {
                    groupId,
                    error,
                  },
                )
                simplePersistence.operations.emergencyCleanup()
                // Try again with limited data after cleanup
                try {
                  const limitedRowOrder = {
                    ...rowOrder,
                    rowIds: rowOrder.rowIds ? rowOrder.rowIds.slice(0, 50) : [], // Save only first 50 items
                  }
                  simplePersistence.operations.setGroupRowOrder(groupId, limitedRowOrder)
                } catch (retryError) {
                  fileLog.error('❌ Retry failed after emergency cleanup', { groupId, retryError })
                }
              } else {
                fileLog.error('❌ Failed to save group row order', { groupId, error })
              }
            }
          })
          fileLog.debug('📋 Saved group row orders to simple persistence', {
            groupCount: Object.keys(newGroupRowOrders).length,
            groups: Object.keys(newGroupRowOrders),
          })
        })

        // Group config persistence is now handled by reactive persistence wrapper

        // PERFORMANCE FIX: Remove unnecessary container ref polling
        // With proper initialization flow, container ref should be available immediately
        const containerElement = containerRef.current

        if (!containerElement) {
          fileLog.warn(
            '⚠️ Container ref not available during initialization - this indicates a timing issue',
          )
          initManager.markError(
            'containerReady',
            'Container element not available for VibeGrid initialization',
            true,
          )
          return
        }
        fileLog.debug('🔄 Container ref ready, proceeding with initialization', {
          hasContainer: !!containerElement,
          className: containerElement.className,
        })

        // Mark container as ready
        initManager.markReady('containerReady')

        // Initialize renderer directly (persistence is automatic with Legend State)
        fileLog.info('✅ Container ready, initializing renderer', { entityType })

        // Create the SimplePassiveRenderer with enhanced selection
        const renderer = new SimplePassiveRenderer({
          container: containerRef.current,
          tableCore$: observables.tableCore$,
          tableInteraction$: observables.tableInteraction$,
          tableViewport$: observables.tableViewport$,
          visualState,
          initManager: initManager,
          enableSelectionColumn,
          bufferSize,
          onEntityUpdate,
          onBatchEntityUpdate,
          // sortedProcessedRows$ now created internally by renderer
        })

        rendererRef.current = renderer
        // Don't mark as ready yet - renderer will do this after postInitialize

        fileLog.info('✅ SimplePassiveRenderer created successfully')

        // Set up event handlers after renderer is created
        if (onSelectionChange) {
          // Subscribe to selection changes
          const unsubscribe = observables.tableInteraction$.selectedCells.onChange(() => {
            const selectedCells = observables.tableInteraction$.selectedCells.get()
            onSelectionChange(selectedCells)
          })

          // Store unsubscribe function
          ;(renderer as any).selectionUnsubscribe = unsubscribe
        }

        if (onEditingChange) {
          // Subscribe to editing changes
          const unsubscribe = observables.tableInteraction$.editingCell.onChange(() => {
            const editingCell = observables.tableInteraction$.editingCell.get()
            if (editingCell) {
              const [rowId, columnId] = editingCell.split(':')
              onEditingChange({ rowId, columnId })
            } else {
              onEditingChange(null)
            }
          })

          // Store unsubscribe function
          ;(renderer as any).editingUnsubscribe = unsubscribe
        }

        // Update viewport when container size changes
        const resizeObserver = new ResizeObserver(() => {
          if (containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect()
            observables.tableViewport$.updateViewport(rect.width, rect.height)
          }
        })

        resizeObserver.observe(containerRef.current)
        ;(renderer as any).resizeObserver = resizeObserver

        // Initial viewport update
        const initialRect = containerRef.current.getBoundingClientRect()
        observables.tableViewport$.updateViewport(initialRect.width, initialRect.height)

        // Don't mark dependencies here - renderer will mark them when ready
        // This prevents premature initialization signals

        // Coordinate state initialization with overall VibeGrid initialization
        initManager.isFullyHydrated$.onChange((isFullyInitialized) => {
          if (isFullyInitialized) {
            fileLog.info('🎯 VibeGrid fully ready', {
              entityType,
              tableId,
            })
          }
        })

        // PERFORMANCE FIX: Direct initialization without RAF polling - renderer already created above
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error'
        fileLog.error('❌ Failed to initialize VibeGrid', err)
        initManager.markError('rendererInitialized', errorMsg, true)
      }
    }

    // Call the initialization function
    initializeVibeGrid()

    // Cleanup
    return () => {
      if (rendererRef.current) {
        fileLog.debug('🧹 Cleaning up VibeGrid')

        // Cleanup event subscriptions
        if ((rendererRef.current as any).selectionUnsubscribe) {
          ;(rendererRef.current as any).selectionUnsubscribe()
        }
        if ((rendererRef.current as any).editingUnsubscribe) {
          ;(rendererRef.current as any).editingUnsubscribe()
        }
        if ((rendererRef.current as any).resizeObserver) {
          ;(rendererRef.current as any).resizeObserver.disconnect()
        }

        rendererRef.current.destroy()
        rendererRef.current = null
      }

      observablesRef.current = null
      initManager.cleanup()
    }
  }, []) // Only initialize once - table identity should not change during component lifecycle

  // ====================================
  // PUBLIC API METHODS
  // ====================================

  const api = useMemo(() => {
    if (!observablesRef.current || !isReady) return null

    const { tableCore$, tableInteraction$, tableViewport$ } = observablesRef.current

    // Ensure all observables exist before creating API
    if (!tableCore$ || !tableInteraction$ || !tableViewport$) return null

    return {
      // Data manipulation
      toggleSort: (field: string) => tableCore$.toggleSort(field),
      setFilter: (field: string, value: any, operator: string) =>
        tableCore$.setFilter(field, value, operator),
      clearFilters: () => tableCore$.clearFilters(),
      toggleColumn: (columnId: string) => tableCore$.toggleColumn(columnId),
      showAllColumns: () => tableCore$.showAllColumns(),
      hideAllColumns: () => tableCore$.hideAllColumns(),

      // Selection
      selectCell: (cellId: string, isMulti?: boolean) =>
        tableInteraction$.selectCell(cellId, isMulti),
      selectRow: (rowId: string, isMulti?: boolean) => tableInteraction$.selectRow(rowId, isMulti),
      clearSelection: () => tableInteraction$.clearSelection(),
      getSelectedCells: () => tableInteraction$.selectedCells.get(),
      getSelectedRows: () => tableInteraction$.selectedRows.get(),

      // Editing
      startEdit: (cellId: string, initialValue: any) =>
        tableInteraction$.startEdit(cellId, initialValue),
      saveEdit: async () => await tableInteraction$.saveEdit(),
      cancelEdit: () => tableInteraction$.cancelEdit(),

      // Viewport
      scrollTo: (top: number, left?: number) => {
        if (containerRef.current) {
          const scrollContainer = containerRef.current.querySelector('.vibegrid-viewport')
          if (scrollContainer) {
            scrollContainer.scrollTop = top
            if (left !== undefined) {
              scrollContainer.scrollLeft = left
            }
          }
        }
      },

      // Data access
      getProcessedRows: () => tableCore$.processedRows.get(),
      getVisibleRange: () => {
        try {
          return tableViewport$.visibleRange?.get() || { start: 0, end: 10 }
        } catch (error) {
          fileLog.error('Error getting visible range', error)
          return { start: 0, end: 10 }
        }
      },
    }
  }, [isReady])

  // ====================================
  // RENDER
  // ====================================

  // Always render the main structure to ensure containerRef is available
  // Loading state will be handled by the loading overlay within the main structure
  const isDataReady =
    observablesRef.current &&
    visualState.visualInputs$.columns.get() &&
    visualState.visualInputs$.columns.get().length > 0

  return (
    <div
      className={`vibegridx-container ${className}`}
      data-testid={`vibegrid-pure-${tableId}`}
      data-entity-type={entityType}
      style={{
        width,
        height,
        position: 'relative',
        outline: 'none',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Show loading overlay until both init and rendering are complete */}
      {(!isReady || !isRendered) && (
        <div className="absolute inset-0 z-10">
          <VibeGridLoadingOverlay
            initManager={initManager}
            height={height}
            width={width}
            showDetailedProgress={false}
          />
        </div>
      )}

      {/* Status indicator */}
      {!isLoading && hasErrors && (
        <div className="p-2 mb-2 bg-red-100 text-red-700 rounded text-sm">
          Initialization issues detected.{' '}
          <button onClick={retry} className="underline">
            Retry
          </button>
        </div>
      )}

      {/* Header with menu components - wait for complete rendering */}
      {isReady && !hasErrors && observablesRef.current && isRendered && (
        <VibeGridXHeaderPure
          tableCore$={observablesRef.current.tableCore$}
          tableInteraction$={observablesRef.current.tableInteraction$}
          enableGrouping={enableGrouping}
          visualState={visualState}
          entityName={entityType}
          orgId={universeOrgId$.get()}
        />
      )}

      {/* Main table container - Always render for initialization */}
      <div className="flex-1" style={{ minHeight: 0 }}>
        <div
          ref={containerRef}
          className="vibegrid-pure-renderer h-full w-full"
          data-testid={`vibegrid-pure-renderer-${tableId}`}
          data-vibegrid-container="true"
          style={{
            width: '100%',
            height: '100%',
            position: 'relative',
          }}
        />
      </div>

      {/* Debug info in development */}
      {process.env.NODE_ENV === 'development' && isReady && (
        <div className="p-2 border-t bg-muted/50 text-xs space-y-1">
          <p>
            <strong>Architecture:</strong> Pure Observables (Legend State)
          </p>
          <p>
            <strong>Renderer:</strong> SimplePassiveRenderer with init state management
          </p>
          <p>
            <strong>Init Manager:</strong> ✅ All dependencies initialized
          </p>
          <p>
            <strong>Event Binding:</strong> Direct DOM → Observable methods
          </p>
        </div>
      )}
    </div>
  )
}

export default VibeGrid
export type { VibeGridProps }
