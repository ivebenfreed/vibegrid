/**
 * HeaderRenderer - Specialized renderer for VibeGrid table headers
 * Handles column headers, sorting, resizing, and select-all functionality
 */

import { reaction, runInAction } from 'mobx'
import { getLogger } from '@/shared/lib/logging'
import type { InteractionStore } from '../../stores/InteractionStore'
import type { TableCoreStore } from '../../stores/TableCoreStore'
import type { VisualStateStore } from '../../stores/VisualStateStore'
import type { DOMElementFactory } from '../factories/DOMElementFactory'
import type { CoordinateMapping } from '../modules/OverlayManager'
import type { SelectionController } from '../modules/SelectionController'

const fileLog = getLogger(['custom', 'vibegrid', 'renderers', 'components', 'HeaderRenderer.ts'])

const ROW_HEIGHT = 40
const HEADER_HEIGHT = 48

export interface HeaderRendererOptions {
  headerContainer: HTMLElement
  tableCoreStore: TableCoreStore
  interactionStore: InteractionStore
  visualStateStore: VisualStateStore
  domFactory: DOMElementFactory
  selectionController?: SelectionController
  coordinateMapping: CoordinateMapping
  enableSelectionColumn?: boolean

  // Callbacks for coordinate updates
  updateCoordinateMapping: (mapping: CoordinateMapping) => void
}

export class HeaderRenderer {
  private headerContainer: HTMLElement
  private tableCoreStore: TableCoreStore
  private interactionStore: InteractionStore
  private visualStateStore: VisualStateStore
  private domFactory: DOMElementFactory
  private selectionController?: SelectionController
  private coordinateMapping: CoordinateMapping
  private enableSelectionColumn: boolean
  private updateCoordinateMapping: (mapping: CoordinateMapping) => void

  // Legend State performance optimization: track last render state to prevent redundant renders
  private lastRenderState: {
    columnCount: number
    scrollLeft: number
    visibleColumnsLength: number
    visibleRangeStart: number
    visibleRangeEnd: number
    columnOrderString: string // Track column order for drag operations
  } | null = null

  // Header state
  private selectAllCheckbox: HTMLInputElement | null = null

  // Reactive sort indicator observer
  private sortIndicatorObserver?: () => void

  constructor(options: HeaderRendererOptions) {
    this.headerContainer = options.headerContainer
    this.tableCoreStore = options.tableCoreStore
    this.interactionStore = options.interactionStore
    this.visualStateStore = options.visualStateStore
    this.domFactory = options.domFactory
    this.selectionController = options.selectionController
    this.coordinateMapping = options.coordinateMapping
    this.enableSelectionColumn = options.enableSelectionColumn ?? false
    this.updateCoordinateMapping = options.updateCoordinateMapping

    this.initializeReactiveSortIndicators()
  }

  /**
   * Render complete table header
   */
  render(): void {
    if (!this.headerContainer) return

    // Get current state from MobX stores
    const geometry = this.visualStateStore.geometry
    const visibleColumns = this.visualStateStore.visibleColumns
    const columns = this.tableCoreStore.columns
    const columnVisibility = this.visualStateStore.columnVisibility
    const columnOrder = this.visualStateStore.columnOrder

    // MobX: Change detection pattern - check if render is actually needed
    const currentRenderState = {
      columnCount: columns.length,
      scrollLeft: geometry.scrollLeft,
      visibleColumnsLength: visibleColumns.length,
      visibleRangeStart: geometry.visibleColumnRange.start,
      visibleRangeEnd: geometry.visibleColumnRange.end,
      columnOrderString: (columnOrder || []).join(','), // Track column order for drag operations
      // CRITICAL: Track column widths to detect resize changes
      columnWidthsString: visibleColumns.map((col) => `${col.id}:${col.width}`).join(','),
    }

    fileLog.debug('🔄 HEADER RENDER STATE CHECK', {
      currentOrderString: currentRenderState.columnOrderString,
      lastOrderString: this.lastRenderState?.columnOrderString,
      orderChanged:
        this.lastRenderState?.columnOrderString !== currentRenderState.columnOrderString,
      columnOrder: columnOrder,
    })

    // Skip render if nothing actually changed (Legend State optimization pattern)
    if (
      this.lastRenderState &&
      this.lastRenderState.columnCount === currentRenderState.columnCount &&
      this.lastRenderState.scrollLeft === currentRenderState.scrollLeft &&
      this.lastRenderState.visibleColumnsLength === currentRenderState.visibleColumnsLength &&
      this.lastRenderState.visibleRangeStart === currentRenderState.visibleRangeStart &&
      this.lastRenderState.visibleRangeEnd === currentRenderState.visibleRangeEnd &&
      this.lastRenderState.columnOrderString === currentRenderState.columnOrderString
    ) {
      fileLog.debug('🔄 HEADER RENDER SKIPPED - no changes detected', currentRenderState)
      return
    }

    // Update last render state
    this.lastRenderState = currentRenderState

    fileLog.debug('🔄 HEADER RENDER TRIGGERED', {
      columnCount: columns.length,
      scrollLeft: geometry.scrollLeft,
      visibleRange: `${geometry.visibleColumnRange.start}-${geometry.visibleColumnRange.end}`,
      totalColumns: visibleColumns.length,
      virtualRangeCount: geometry.visibleColumnRange.end - geometry.visibleColumnRange.start,
    })

    this.headerContainer.innerHTML = ''

    const headerRow = this.domFactory.createElement('div', 'vibegridx-header-row')
    headerRow.style.cssText = `
      position: relative;
      height: ${HEADER_HEIGHT}px;
    `

    // Add drag column header (for grouped mode) - always present for consistent layout
    const dragColumnHeader = this.createDragColumnHeader()
    dragColumnHeader.style.position = 'absolute'
    dragColumnHeader.style.left = '0'
    dragColumnHeader.style.top = '0'
    dragColumnHeader.style.zIndex = '1'
    headerRow.appendChild(dragColumnHeader)

    // Add corner header cell (aligns with row headers) - positioned after drag column
    const { cornerCell, selectAllCheckbox } = this.domFactory.createCornerHeaderCell()
    this.selectAllCheckbox = selectAllCheckbox || null

    // Position corner cell absolutely after drag column
    cornerCell.style.position = 'absolute'
    cornerCell.style.left = '30px' // After 30px drag column
    cornerCell.style.top = '0'
    cornerCell.style.zIndex = '1'

    // Add select all checkbox handler
    if (this.selectAllCheckbox) {
      this.setupSelectAllHandler()
    }

    headerRow.appendChild(cornerCell)

    // Get visible columns from unified visual state (same as DOM rendering)
    // This ensures coordinate mapping matches exactly what's rendered in DOM
    const allColumnLayouts = visibleColumns
    const allVisibleColumns = allColumnLayouts
      .map((layout) => columns.find((col) => col.id === layout.id))
      .filter(Boolean)

    fileLog.debug('🎨 Header rendering ALL columns (no virtualization)', {
      totalColumns: columns.length,
      visibleColumns: allColumnLayouts.length,
      scrollLeft: geometry.scrollLeft,
      columnIds: allColumnLayouts.slice(0, 5).map((col) => col.id),
    })

    // Update column coordinate mapping only if columns have changed
    // Now uses the SAME column source as DOM rendering (visibleColumns)
    const needsCoordinateUpdate = this.updateColumnCoordinateMapping(allVisibleColumns)

    // Render ALL columns at their absolute positions
    // The header viewport transform will handle the scrolling
    allColumnLayouts.forEach((columnLayout, columnIndex) => {
      const column = columns.find((c) => c.id === columnLayout.id)
      if (!column) return

      const headerCell = this.createColumnHeader(column, columnIndex, 0)

      // CRITICAL FIX: Use column layout's width and offset for consistency
      // This ensures header cells match body cells exactly
      headerCell.style.position = 'absolute'
      headerCell.style.left = `${columnLayout.xOffset}px`
      headerCell.style.top = '0'
      headerCell.style.width = `${columnLayout.width}px`
      headerCell.style.height = `${HEADER_HEIGHT}px`

      headerRow.appendChild(headerCell)
    })

    // End drop zone removed - users can drop between columns instead

    // Set total width for proper overflow handling (include end drop zone)
    // Use UNIFIED visual state's totalWidth - no duplicate calculation
    const totalHeaderWidth = geometry.totalWidth
    headerRow.style.width = `${totalHeaderWidth}px`
    headerRow.style.minWidth = `${totalHeaderWidth}px`

    this.headerContainer.appendChild(headerRow)

    // Update header container width
    this.headerContainer.style.width = `${totalHeaderWidth}px`
    this.headerContainer.style.minWidth = `${totalHeaderWidth}px`

    // Only update coordinate mapping if columns actually changed
    if (needsCoordinateUpdate) {
      this.coordinateMapping.version++
      this.updateCoordinateMapping(this.coordinateMapping)
    }

    fileLog.debug('✅ Header rendered with total width', { totalHeaderWidth })
  }

  /**
   * Create column header element
   */
  private createColumnHeader(column: any, actualIndex: number, xOffset: number): HTMLElement {
    // Use single source of truth for column width
    const actualWidth = this.visualStateStore.columnWidths[column.id] || 150
    const headerCell = this.domFactory.createHeaderCell(column, actualWidth)

    // Create header content with text and sort icon
    const textGroup = this.domFactory.createHeaderTextGroup(column)
    headerCell.appendChild(textGroup)

    // Update sort indicator if column is sorted
    this.updateSortIndicator(headerCell, column)

    // Add resize handle with event handlers
    const resizeHandle = this.domFactory.createResizeHandle()
    this.setupResizeHandler(resizeHandle, column)
    headerCell.appendChild(resizeHandle)

    // Set up passive interaction attributes for MouseController
    this.setupHeaderClickHandler(headerCell, column)

    // Add drag handling for column reordering - MOVED TO MOUSECONTROLLER
    // this.setupColumnDragHandlers(headerCell, column);

    // Disable HTML5 drag on header cells - MouseController will handle all dragging
    headerCell.draggable = false

    return headerCell
  }

  /**
   * Create end drop zone for placing columns at the end
   */
  private createEndDropZone(): HTMLElement {
    const endDropZone = document.createElement('div')
    endDropZone.className = 'vibegridx-end-drop-zone'
    endDropZone.style.cssText = `
      position: relative;
      width: 20px;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: default;
      border-left: 1px dashed transparent;
      transition: border-color 0.15s ease;
    `

    // Add drop handlers for inserting at the end
    endDropZone.addEventListener('dragover', (e: DragEvent) => {
      e.preventDefault()
      e.dataTransfer!.dropEffect = 'move'

      // Remove any existing insertion lines from column headers
      document.querySelectorAll('.column-drop-line').forEach((line) => line.remove())

      // Show visual feedback for end insertion
      endDropZone.style.borderLeftColor = '#3b82f6'
      endDropZone.style.backgroundColor = 'rgba(59, 130, 246, 0.1)'
    })

    endDropZone.addEventListener('dragleave', (e: DragEvent) => {
      // Only remove if actually leaving (not moving to child elements)
      if (!endDropZone.contains(e.relatedTarget as Node)) {
        endDropZone.style.borderLeftColor = 'transparent'
        endDropZone.style.backgroundColor = 'transparent'
      }
    })

    endDropZone.addEventListener('drop', (e: DragEvent) => {
      e.preventDefault()

      // Clear visual feedback
      endDropZone.style.borderLeftColor = 'transparent'
      endDropZone.style.backgroundColor = 'transparent'

      const draggedColumnId = e.dataTransfer!.getData('text/plain')
      if (draggedColumnId) {
        fileLog.debug('🎯 Column dropped at end position', { draggedColumnId })

        // Move column to the end by using the last column as target with insertBefore=false
        const columns = this.tableCoreStore.columns
        if (columns.length > 0) {
          const lastColumn = columns[columns.length - 1]
          if (lastColumn.id !== draggedColumnId) {
            // Insert after the last column - reorderColumn not yet implemented
            fileLog.warn('Column reordering not yet implemented')
          }
        }
      }
    })

    return endDropZone
  }

  /**
   * Update column coordinate mapping
   * @returns true if mapping changed, false if unchanged
   */
  private updateColumnCoordinateMapping(allVisibleColumns: any[]): boolean {
    const newColumns: any[] = []
    let xOffset = 70 // Start after drag column (30px) + row header (40px)

    // Build new coordinate mapping for all visible columns
    // Get reactive column widths
    const columnWidths = this.visualStateStore.columnWidths

    allVisibleColumns.forEach((column, index) => {
      const actualWidth = this.visualStateStore.columnWidths[column.id] || 150
      newColumns.push({
        columnId: column.id,
        x: xOffset,
        width: actualWidth,
        index: index,
        offset: xOffset,
      })
      xOffset += actualWidth
    })

    // Check if coordinate mapping has changed (including position)
    const hasChanged =
      !this.coordinateMapping.columns ||
      this.coordinateMapping.columns.length !== newColumns.length ||
      newColumns.some((newCol, index) => {
        const oldCol = this.coordinateMapping.columns?.[index]
        return (
          !oldCol ||
          oldCol.columnId !== newCol.columnId ||
          oldCol.width !== newCol.width ||
          oldCol.x !== newCol.x
        )
      })

    if (hasChanged) {
      this.coordinateMapping.columns = newColumns

      fileLog.debug('🔄 Column coordinate mapping updated', {
        newColumnCount: newColumns.length,
        firstColumnId: newColumns[0]?.columnId,
        mappingVersion: this.coordinateMapping.version,
        sampleColumns: newColumns
          .slice(0, 3)
          .map((c) => ({ id: c.columnId, x: c.x, width: c.width })),
      })

      return true
    }

    return false
  }

  /**
   * Set up select all checkbox handler
   */
  private setupSelectAllHandler(): void {
    if (!this.selectAllCheckbox || !this.selectionController) return

    this.selectAllCheckbox.addEventListener('click', (e) => {
      e.stopPropagation()

      // Delegate to SelectionController for consistent architecture
      this.selectionController!.handleSelectAllToggle()
    })
  }

  /**
   * Set up header for passive interaction (data attributes only)
   */
  private setupHeaderClickHandler(headerCell: HTMLElement, column: any): void {
    headerCell.style.cursor = 'pointer'

    // HeaderRenderer should be passive - just add data attributes for MouseController
    headerCell.setAttribute('data-column-id', column.id)
    headerCell.setAttribute('data-field', column.field || column.id)
    headerCell.setAttribute('data-interaction-type', 'column-header')

    fileLog.debug('🎯 Header cell setup for passive interaction', {
      columnId: column.id,
      field: column.field || column.id,
    })
  }

  /**
   * Set up resize handler for column (MobX version)
   */
  private setupResizeHandler(resizeHandle: HTMLElement, column: any): void {
    let isResizing = false
    let startX = 0
    let startWidth = this.visualStateStore.columnWidths[column.id] ?? column.width ?? 150

    resizeHandle.addEventListener('mousedown', (e: MouseEvent) => {
      e.stopPropagation()
      isResizing = true
      startX = e.pageX
      startWidth = this.visualStateStore.columnWidths[column.id] ?? column.width ?? 150

      fileLog.debug('🔧 Started column resize', {
        columnId: column.id,
        startWidth,
        startX,
      })

      // Update interaction state (MobX)
      runInAction(() => {
        this.interactionStore.columnResize = {
          isResizing: true,
          columnId: column.id,
          startWidth: startWidth,
          newWidth: startWidth,
        }
      })

      // Add document-level listeners for resize
      let resizeRAF: number | null = null

      const handleMouseMove = (e: MouseEvent) => {
        if (!isResizing) return

        // Throttle resize updates with requestAnimationFrame
        if (!resizeRAF) {
          resizeRAF = requestAnimationFrame(() => {
            const deltaX = e.pageX - startX
            const newWidth = Math.max(50, startWidth + deltaX) // Min width 50px

            fileLog.debug('[RESIZE-PREVIEW] 📏 Updating resize state', {
              columnId: column.id,
              startWidth,
              deltaX,
              newWidth,
              pageX: e.pageX,
            })

            // Update resize state (MobX)
            runInAction(() => {
              this.interactionStore.columnResize = {
                isResizing: true,
                columnId: column.id,
                startWidth: startWidth,
                newWidth: newWidth,
              }
            })

            fileLog.debug('[RESIZE-PREVIEW] ✅ columnResize state set', {
              state: this.interactionStore.columnResize,
            })

            resizeRAF = null
          })
        }
      }

      const handleMouseUp = (e: MouseEvent) => {
        if (!isResizing) return
        isResizing = false

        // FIX: Stop propagation to prevent sort trigger after resize
        e.stopPropagation()
        e.preventDefault()

        // Cancel any pending resize RAF
        if (resizeRAF) {
          cancelAnimationFrame(resizeRAF)
          resizeRAF = null
        }

        const resizeState = this.interactionStore.columnResize
        if (resizeState && resizeState.newWidth) {
          // Apply the new width (MobX action)
          this.visualStateStore.updateColumnWidth(column.id, resizeState.newWidth)

          fileLog.debug('✅ Column resize complete', {
            columnId: column.id,
            oldWidth: startWidth,
            newWidth: resizeState.newWidth,
          })
        }

        // Clear resize state and track end time to prevent sort trigger (MobX)
        fileLog.debug('[RESIZE-PREVIEW] 🧹 Clearing columnResize state (mouseup)')
        runInAction(() => {
          this.interactionStore.columnResize = null
          this.interactionStore.lastResizeEndTime = Date.now()
        })
        fileLog.debug('[RESIZE-PREVIEW] ✅ columnResize set to null, lastResizeEndTime set')

        // Clean up listeners
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }

      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    })
  }

  /**
   * Update sort indicator for a column
   */
  private updateSortIndicator(headerCell: HTMLElement, column: any): void {
    const sortState = this.visualStateStore.sortBy
    const columnSort = sortState.find((s: any) => s.field === (column.field || column.id))

    if (columnSort) {
      this.domFactory.updateSortIcon(headerCell, columnSort.direction)
    } else {
      this.domFactory.updateSortIcon(headerCell, null)
    }
  }

  /**
   * Update all sort indicators (legacy method - now uses reactive pattern)
   */
  updateSortIndicators(): void {
    // Get current sort state and trigger reactive update
    try {
      const sortState = this.visualStateStore.sortBy
      this.updateSortIndicatorsReactive(sortState)
    } catch (error) {
      // Fallback to manual update if reactive state is not available
      fileLog.warn('⚠️ Falling back to manual sort indicator update', { error })

      const headerCells = this.headerContainer.querySelectorAll('.vibegridx-header-cell')
      const columns = this.tableCoreStore.columns

      headerCells.forEach((headerCell, index) => {
        const fieldId = headerCell.getAttribute('data-field')
        const column = columns.find((c) => c.id === fieldId)

        if (column) {
          this.updateSortIndicator(headerCell as HTMLElement, column)
        }
      })
    }
  }

  /**
   * Update select all checkbox visual state
   */
  updateSelectAllCheckboxVisual(state: { checked: boolean; indeterminate: boolean }): void {
    if (this.selectAllCheckbox) {
      this.selectAllCheckbox.checked = state.checked
      this.selectAllCheckbox.indeterminate = state.indeterminate

      fileLog.debug('☑️ Select all checkbox updated', {
        checked: state.checked,
        indeterminate: state.indeterminate,
      })
    }
  }

  /**
   * Update header cell width during resize
   */
  updateHeaderCellWidth(columnId: string, newWidth: number): void {
    const headerCell = this.headerContainer.querySelector(
      `[data-field="${columnId}"]`,
    ) as HTMLElement
    if (headerCell) {
      headerCell.style.flex = `0 0 ${newWidth}px`

      fileLog.debug('📏 Header cell width updated', {
        columnId,
        newWidth,
      })
    }
  }

  /**
   * Get header container reference
   */
  getHeaderContainer(): HTMLElement {
    return this.headerContainer
  }

  /**
   * Get select all checkbox reference
   */
  getSelectAllCheckbox(): HTMLInputElement | null {
    return this.selectAllCheckbox
  }

  /**
   * Create drag column header (permanently present for consistent layout)
   */
  private createDragColumnHeader(): HTMLElement {
    const dragColumnHeader = this.domFactory.createElement('div', 'vibegridx-drag-column-header')

    // Style to match drag column in body (30px wide)
    dragColumnHeader.classList.add('vibegridx-header-drag-column')
    dragColumnHeader.style.cssText = `
      width: 30px;
      min-width: 30px;
      height: ${HEADER_HEIGHT}px;
      display: flex;
      align-items: center;
      justify-content: center;
      user-select: none;
      font-size: 11px;
      color: #9ca3af;
    `

    // Add visual indicator when in grouped mode
    const isGroupedMode = this.isGroupedMode()
    if (isGroupedMode) {
      // Add a small drag indicator icon
      dragColumnHeader.innerHTML = `
        <svg width="8" height="12" viewBox="0 0 8 12" fill="currentColor" style="opacity: 0.4;">
          <circle cx="2" cy="3" r="1"/>
          <circle cx="6" cy="3" r="1"/>
          <circle cx="2" cy="6" r="1"/>
          <circle cx="6" cy="6" r="1"/>
          <circle cx="2" cy="9" r="1"/>
          <circle cx="6" cy="9" r="1"/>
        </svg>
      `
      dragColumnHeader.title = 'Drag to reorder rows within groups'
    } else {
      // Empty space when not in grouped mode
      dragColumnHeader.innerHTML = ''
    }

    return dragColumnHeader
  }

  /**
   * Check if we're currently in grouped mode
   */
  private isGroupedMode(): boolean {
    try {
      const groupConfig = this.visualStateStore.groupConfig
      return !!(groupConfig && groupConfig.fields && groupConfig.fields.length > 0)
    } catch (error) {
      // If visual operations aren't available, fallback to direct check
      const tableCore = this.tableCoreStore
      return tableCore.grouping && tableCore.grouping.fields && tableCore.grouping.fields.length > 0
    }
  }

  /**
   * Initialize reactive sort indicators that automatically update when sort state changes
   */
  private initializeReactiveSortIndicators(): void {
    if (!this.visualStateStore) {
      fileLog.warn('⚠️ Visual state store not available for reactive sort indicators')
      return
    }

    // Create MobX reaction for sort state changes
    this.sortIndicatorObserver = reaction(
      () => this.visualStateStore.sortBy,
      (sortState) => {
        try {
          fileLog.debug('🔄 Reactive sort indicator update triggered', {
            sortByCount: sortState?.length || 0,
            firstSort: sortState?.[0]?.field,
            firstDirection: sortState?.[0]?.direction,
          })

          // Update all sort indicators immediately
          this.updateSortIndicatorsReactive(sortState)
        } catch (error) {
          fileLog.error('🚨 Error in reactive sort indicator update', { error })
        }
      },
    )

    fileLog.debug('✅ Reactive sort indicators initialized')
  }

  /**
   * Reactive sort indicator update - optimized for Legend State observables
   */
  private updateSortIndicatorsReactive(sortState: any[]): void {
    if (!this.headerContainer) return

    const headerCells = this.headerContainer.querySelectorAll('.vibegridx-header-cell')

    headerCells.forEach((headerCell) => {
      const fieldId = headerCell.getAttribute('data-field')
      if (!fieldId) return

      const columnSort = sortState?.find((s: any) => s.field === fieldId)
      const direction = columnSort?.direction || null

      // Update the sort icon using DOM factory method
      this.domFactory.updateSortIcon(headerCell as HTMLElement, direction)
    })

    fileLog.debug('🎯 Reactive sort indicators updated', {
      updatedCells: headerCells.length,
      activeSorts: sortState?.length || 0,
    })
  }

  /**
   * Cleanup method for disposing reactive observers
   */
  dispose(): void {
    if (this.sortIndicatorObserver) {
      this.sortIndicatorObserver()
      this.sortIndicatorObserver = undefined
      fileLog.info('🧹 Reactive sort indicator observer disposed') // Keep: lifecycle
    }
  }
}
