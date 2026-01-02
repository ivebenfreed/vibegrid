/**
 * OverlayManager - Centralized management of all overlay components for VibeGrid
 * Handles canvas overlay, selection manager, editing overlay, and context menu
 */

import { log } from '@/logger'
import { ContextMenuManager } from '../../components/ContextMenu'
import { CanvasOverlayDOM } from '../../overlays/CanvasOverlayDOM'
import { EditingOverlay } from '../../overlays/EditingOverlay'
import type { VisualCellPosition } from '../../overlays/OverlayTypes'
import type { TableCore$, TableInteraction$ } from '../../stores/pure-observables'
import type { ViewportInfo } from '../../types'
import { SelectionManager } from '../managers/SelectionManager'

const fileLog = log('components/custom/vibegrid/renderers/modules/OverlayManager.ts')

const ROW_HEIGHT = 40
const HEADER_HEIGHT = 48

export interface OverlayManagerOptions {
  container: HTMLElement
  tableCore$: TableCore$
  tableInteraction$: TableInteraction$
  enableSelectionColumn?: boolean
  headerContainer?: HTMLElement | null
  bodyContainer?: HTMLElement | null
  getProcessedRows: () => any[]
}

export interface CoordinateMapping {
  rows: Array<{ rowId: string; y: number; height: number; index: number }>
  columns: Array<{ columnId: string; x: number; width: number; index: number; offset: number }>
  version: number
}

export class OverlayManager {
  private container: HTMLElement
  private tableCore$: TableCore$
  private tableInteraction$: TableInteraction$
  private enableSelectionColumn: boolean
  private headerContainer: HTMLElement | null
  private bodyContainer: HTMLElement | null
  private getProcessedRows: () => any[]

  // Overlay instances
  private canvasOverlay: CanvasOverlayDOM | null = null
  private selectionManager: SelectionManager | null = null
  private editingOverlay: EditingOverlay | null = null
  private contextMenu: ContextMenuManager | null = null

  // Coordinate mapping for overlays
  private coordinateMapping: CoordinateMapping = {
    rows: [],
    columns: [],
    version: 0,
  }

  // Performance optimization caches
  private lastSelectedCells: Set<string> | null = null
  private lastCoordinateMappingVersion: number = -1
  private updateSelectionRAF: number | null = null

  constructor(options: OverlayManagerOptions) {
    this.container = options.container
    this.tableCore$ = options.tableCore$
    this.tableInteraction$ = options.tableInteraction$
    this.enableSelectionColumn = options.enableSelectionColumn ?? false
    this.headerContainer = options.headerContainer || null
    this.bodyContainer = options.bodyContainer || null
    this.getProcessedRows = options.getProcessedRows

    this.initOverlays()
  }

  /**
   * Initialize all overlay components
   */
  private initOverlays(): void {
    fileLog.info('🎨 Initializing overlay system')

    // Create canvas overlay
    this.canvasOverlay = new CanvasOverlayDOM(
      {
        selectionColor: 'rgba(59, 130, 246, 0.1)',
        selectionBorderColor: 'rgb(59, 130, 246)',
        selectionBorderWidth: 2,
        cellHeight: ROW_HEIGHT,
        cellWidth: 150, // Default width, updated by coordinate mapping
      },
      (event) => {
        fileLog.info('📋 Canvas overlay event:', event)
        // Handle fill events from the overlay system
      },
    )

    // Canvas overlay will be initialized in initializeOverlay() method
    // after DOM is ready

    // Create selection manager
    this.selectionManager = new SelectionManager({
      getCellElement: (rowId: string, columnId: string) => {
        const cellElement = this.container.querySelector(
          `[data-cell-id="${rowId}:${columnId}"]`,
        ) as HTMLElement
        return cellElement
      },
      forEachRowElement: (callback: (element: HTMLElement, rowId: string) => void) => {
        const rowElements = this.container.querySelectorAll('[data-row-id]')
        rowElements.forEach((element) => {
          const rowId = element.getAttribute('data-row-id')
          if (rowId) callback(element as HTMLElement, rowId)
        })
      },
      getHeaderElement: () => this.headerContainer!,
      isSelectionColumnEnabled: () => this.enableSelectionColumn,
    })

    // Create editing overlay
    this.editingOverlay = new EditingOverlay(this.container, {
      tableInteraction$: this.tableInteraction$,
      onCommit: async (value) => {
        await this.tableInteraction$.saveEdit(value)
      },
      onCancel: () => {
        this.tableInteraction$.cancelEdit()
      },
      relationshipContext: {
        relationshipResolvers: {},
      },
      getRowData: (rowId: string) => {
        const processedRows = this.getProcessedRows()
        return processedRows.find((row: any) => row.id === rowId) || null
      },
    })

    // Create context menu
    this.contextMenu = new ContextMenuManager(this.container)

    fileLog.info('✅ Overlay system initialized')
  }

  /**
   * Update coordinate mapping for overlays (optimized with change detection)
   */
  updateCoordinateMapping(mapping: CoordinateMapping): void {
    // Skip update if coordinate mapping version hasn't changed
    if (this.lastCoordinateMappingVersion === mapping.version) {
      return
    }

    this.lastCoordinateMappingVersion = mapping.version
    this.coordinateMapping = mapping

    if (this.canvasOverlay && this.canvasOverlay.isInitialized) {
      this.canvasOverlay.updateCoordinateMapping(mapping)
    }
  }

  /**
   * Get current coordinate mapping
   */
  getCoordinateMapping(): CoordinateMapping {
    return this.coordinateMapping
  }

  /**
   * Initialize the canvas overlay in the proper container
   * Call this after DOM is ready
   */
  initializeOverlay(): void {
    if (!this.canvasOverlay || this.canvasOverlay.isInitialized) {
      return
    }

    // Use viewport container (the scrolling container) for the overlay
    // This ensures the overlay scrolls with the content
    const targetContainer =
      (this.container.querySelector('.vibegridx-viewport') as HTMLElement) || this.container

    this.canvasOverlay.init(targetContainer)
    fileLog.info('🎨 Canvas overlay initialized in viewport container')
  }

  /**
   * Update selection display (optimized with change detection and throttling)
   */
  updateSelection(selectedCells: Set<string>): void {
    // Quick selection manager update (lightweight)
    if (this.selectionManager) {
      this.selectionManager.setSelectedCells(selectedCells)
    }

    // Skip expensive canvas updates if selection hasn't changed
    if (this.lastSelectedCells && this.areSetsEqual(selectedCells, this.lastSelectedCells)) {
      return
    }

    // Store current selection
    this.lastSelectedCells = new Set(selectedCells)

    // Throttle expensive canvas overlay updates
    if (this.updateSelectionRAF !== null) {
      cancelAnimationFrame(this.updateSelectionRAF)
    }

    this.updateSelectionRAF = requestAnimationFrame(() => {
      this.updateSelectionRAF = null
      this.performCanvasSelectionUpdate(selectedCells)
    })
  }

  /**
   * Perform the actual canvas selection update (separated for throttling)
   */
  private performCanvasSelectionUpdate(selectedCells: Set<string>): void {
    if (this.canvasOverlay && this.canvasOverlay.isInitialized && this.coordinateMapping) {
      // Convert selected cells to visual positions
      const visualCells = this.getVisualCellPositions(selectedCells)

      // Update viewport info
      const viewportInfo = this.getViewportInfo()

      this.canvasOverlay.updateViewport(viewportInfo)
      this.canvasOverlay.updateSelectionWithVisualPositions(visualCells)

      // Show/hide fill handle based on selection
      if (visualCells.length > 0) {
        this.canvasOverlay.renderFillHandle(visualCells, undefined, viewportInfo)
      } else {
        this.canvasOverlay.hideFillHandle()
      }
    }
  }

  /**
   * Compare two Sets for equality (optimized for performance)
   */
  private areSetsEqual(set1: Set<string>, set2: Set<string>): boolean {
    if (set1.size !== set2.size) return false
    for (const item of set1) {
      if (!set2.has(item)) return false
    }
    return true
  }

  /**
   * Update editing overlay
   */
  updateEditingOverlay(editingCell: string | null, editValue?: string): void {
    if (editingCell && this.editingOverlay) {
      const [rowId, columnId] = editingCell.split(':')
      const columns = this.tableCore$.columns.get()
      const column = columns.find((c: any) => c.id === columnId)

      if (column) {
        const position = this.getCellPosition(rowId, columnId)
        if (position) {
          const cell = { rowId, columnId }
          this.editingOverlay.showAt(position, cell, column, editValue || '')
        }
      }
    } else if (this.editingOverlay) {
      this.editingOverlay.hide()
    }
  }

  /**
   * Update column resize preview
   */
  updateColumnResizePreview(resizeState: any): void {
    // Ensure overlay is initialized
    if (!this.canvasOverlay?.isInitialized) {
      this.initializeOverlay()
    }

    if (this.canvasOverlay && this.canvasOverlay.isInitialized) {
      this.canvasOverlay.updateColumnResizePreview(resizeState)
    }
  }

  /**
   * Update column drag preview
   */
  updateColumnDragPreview(dragState: any): void {
    if (this.canvasOverlay) {
      const viewportInfo = this.getViewportInfo()
      if (dragState) {
        this.canvasOverlay.updateDragPreview(dragState, viewportInfo)
      } else {
        this.canvasOverlay.updateDragPreview(null, null)
      }
    }
  }

  /**
   * Show context menu
   */
  showContextMenu(options: {
    x: number
    y: number
    rowId: string
    columnId: string
    items: Array<{
      label: string
      icon?: string
      action: () => void
    }>
  }): void {
    if (this.contextMenu) {
      this.contextMenu.show(options)
    }
  }

  /**
   * Hide context menu
   */
  hideContextMenu(): void {
    if (this.contextMenu) {
      this.contextMenu.hide()
    }
  }

  /**
   * Get visual cell positions from selected cells
   */
  private getVisualCellPositions(selectedCells: Set<string>): VisualCellPosition[] {
    const visualPositions: VisualCellPosition[] = []

    fileLog.info('🎨 Getting visual cell positions', {
      selectedCount: selectedCells.size,
      coordinateMappingRows: this.coordinateMapping.rows.length,
      coordinateMappingColumns: this.coordinateMapping.columns.length,
    })

    selectedCells.forEach((cellId) => {
      const [rowId, columnId] = cellId.split(':')
      const rowInfo = this.coordinateMapping.rows.find((r) => r.rowId === rowId)
      const colInfo = this.coordinateMapping.columns.find((c) => c.columnId === columnId)

      if (rowInfo && colInfo) {
        visualPositions.push({
          cellKey: cellId, // Changed from cellId to cellKey to match VisualCellPosition interface
          x: colInfo.x,
          y: rowInfo.y, // No need to add header height since overlay is inside viewport
          width: colInfo.width,
          height: rowInfo.height,
        })
      } else {
        if (!rowInfo) {
          fileLog.debug('🔍 Row not found in coordinate mapping', { rowId })
        }
        if (!colInfo) {
          fileLog.debug('🔍 Column not found in coordinate mapping', { columnId })
        }
      }
    })

    fileLog.info('✅ Visual positions calculated', {
      inputCells: selectedCells.size,
      outputPositions: visualPositions.length,
    })

    return visualPositions
  }

  /**
   * Get cell position for editing overlay
   */
  private getCellPosition(
    rowId: string,
    columnId: string,
  ): { x: number; y: number; width: number; height: number } | null {
    const rowInfo = this.coordinateMapping.rows.find((r) => r.rowId === rowId)
    const colInfo = this.coordinateMapping.columns.find((c) => c.columnId === columnId)

    if (rowInfo && colInfo) {
      // EditingOverlay is attached to main container, so we need to add header height
      const HEADER_HEIGHT = 48
      const adjustedY = rowInfo.y + HEADER_HEIGHT

      console.log('🔍 getCellPosition debug:')
      console.log('  rowId:', rowId, 'columnId:', columnId)
      console.log('  rowInfo:', `y=${rowInfo.y}, height=${rowInfo.height}, index=${rowInfo.index}`)
      console.log('  colInfo:', `x=${colInfo.x}, width=${colInfo.width}, index=${colInfo.index}`)
      console.log('  HEADER_HEIGHT:', HEADER_HEIGHT)
      console.log(
        '  ADJUSTED POSITION: x=' +
          colInfo.x +
          ', y=' +
          adjustedY +
          ' (was ' +
          rowInfo.y +
          '), width=' +
          colInfo.width +
          ', height=' +
          rowInfo.height,
      )

      return {
        x: colInfo.x,
        y: adjustedY,
        width: colInfo.width,
        height: rowInfo.height,
      }
    }

    console.log('🔍 getCellPosition debug: FAILED')
    console.log('  rowId:', rowId, 'columnId:', columnId)
    console.log('  rowInfo:', rowInfo ? 'FOUND' : 'NOT_FOUND')
    console.log('  colInfo:', colInfo ? 'FOUND' : 'NOT_FOUND')
    return null
  }

  /**
   * Get viewport info
   */
  private getViewportInfo(): ViewportInfo {
    // Use the body container if available, as that's where scrolling happens
    const scrollContainer =
      this.bodyContainer ||
      (this.container.querySelector('.vibegridx-body-container') as HTMLElement) ||
      this.container

    return {
      scrollTop: scrollContainer.scrollTop || 0,
      scrollLeft: scrollContainer.scrollLeft || 0,
      viewportWidth: scrollContainer.clientWidth || 0,
      viewportHeight: scrollContainer.clientHeight || 0,
    }
  }

  /**
   * Set header container reference
   */
  setHeaderContainer(headerContainer: HTMLElement | null): void {
    this.headerContainer = headerContainer
  }

  /**
   * Set body container reference
   */
  setBodyContainer(bodyContainer: HTMLElement | null): void {
    this.bodyContainer = bodyContainer
  }

  /**
   * Clean up all overlays
   */
  destroy(): void {
    fileLog.info('🧹 Destroying overlay system')

    // Clean up RAF to prevent memory leaks
    if (this.updateSelectionRAF !== null) {
      cancelAnimationFrame(this.updateSelectionRAF)
      this.updateSelectionRAF = null
    }

    // Clear caches
    this.lastSelectedCells = null
    this.lastCoordinateMappingVersion = -1

    if (this.selectionManager) {
      this.selectionManager.clearAllSelections()
    }

    if (this.canvasOverlay) {
      this.canvasOverlay.destroy()
      this.canvasOverlay = null
    }

    if (this.editingOverlay) {
      this.editingOverlay.hide()
      this.editingOverlay = null
    }

    if (this.contextMenu) {
      this.contextMenu.destroy()
      this.contextMenu = null
    }

    this.selectionManager = null

    fileLog.info('✅ Overlay system destroyed')
  }

  /**
   * Get canvas overlay instance (for direct access when needed)
   */
  getCanvasOverlay(): CanvasOverlayDOM | null {
    return this.canvasOverlay
  }

  /**
   * Get selection manager instance
   */
  getSelectionManager(): SelectionManager | null {
    return this.selectionManager
  }

  /**
   * Get editing overlay instance
   */
  getEditingOverlay(): EditingOverlay | null {
    return this.editingOverlay
  }

  /**
   * Get context menu instance
   */
  getContextMenu(): ContextMenuManager | null {
    return this.contextMenu
  }
}
