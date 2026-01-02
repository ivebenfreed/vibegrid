// ====================================
// HEADER RENDERER
// ====================================

import { log } from '@/logger'
import type { Column, RenderState, SortConfig } from '../../types'
import type { ColumnManager } from '../managers/ColumnManager'
import type { SelectionManager } from '../managers/SelectionManager'
import type { DOMSystem } from '../systems/DOMSystem'

const fileLog = log('components/custom/vibegrid/renderers/engines/HeaderEngine.ts')

// ====================================
// TYPES
// ====================================

export interface HeaderEngineConfig {
  domManager: DOMSystem
  selectionManager: SelectionManager
  enableSelectionColumn: boolean
  getTotalColumnsWidth: () => number
}

export interface HeaderRenderMetrics {
  columnCount: number
  renderTime: number
  phases: {
    columnPrep: number
    widthCalc: number
    sortLookup: number
    columnFilter: number
    clearHeader: number
    selectionHeader: number
    dataColumns: number
    domInsert: number
  }
}

// ====================================
// HEADER RENDERER
// ====================================

export class HeaderEngine {
  private config: HeaderEngineConfig

  constructor(config: HeaderEngineConfig) {
    this.config = config
  }

  // ====================================
  // PUBLIC API
  // ====================================

  /**
   * Render the table header
   */
  renderHeader(state: RenderState): HeaderRenderMetrics {
    const headerStartTime = performance.now()
    const metrics: HeaderRenderMetrics = {
      columnCount: 0,
      renderTime: 0,
      phases: {
        columnPrep: 0,
        widthCalc: 0,
        sortLookup: 0,
        columnFilter: 0,
        clearHeader: 0,
        selectionHeader: 0,
        dataColumns: 0,
        domInsert: 0,
      },
    }

    if (!state.rows.length) {
      return metrics
    }

    // STEP 1: Column preparation
    const step1Start = performance.now()
    const columnsToRender = this.getColumnsToRender(state)
    metrics.phases.columnPrep = performance.now() - step1Start

    // STEP 2: Width calculation
    const step2Start = performance.now()
    const totalWidth = this.config.getTotalColumnsWidth()
    this.config.domManager.getElement('header').style.width = `${totalWidth}px`
    metrics.phases.widthCalc = performance.now() - step2Start

    // STEP 3: Sort lookup creation
    const step3Start = performance.now()
    const sortLookup = this.createSortLookup(state)
    metrics.phases.sortLookup = performance.now() - step3Start

    // STEP 4: Column filtering and offset calculation
    const step4Start = performance.now()
    const dataColumns = columnsToRender.filter((col) => col.id !== '__selection')
    metrics.columnCount = dataColumns.length + 1 // +1 for selection column (always enabled)
    metrics.phases.columnFilter = performance.now() - step4Start

    // STEP 5: Clear existing header
    const step5Start = performance.now()
    this.config.domManager.getElement('header').innerHTML = ''
    metrics.phases.clearHeader = performance.now() - step5Start

    // STEP 6: Create selection header
    const step6Start = performance.now()
    // Always create selection header (selection column is always enabled)
    this.createSelectionHeader(state)
    metrics.phases.selectionHeader = performance.now() - step6Start

    // STEP 7: Create data column headers
    const step7Start = performance.now()
    const fragment = this.createDataColumnHeaders(dataColumns, sortLookup, state.coordinateMapping)
    metrics.phases.dataColumns = performance.now() - step7Start

    // STEP 8: Append fragment to header
    const step8Start = performance.now()
    const header = this.config.domManager.getElement('header')
    header.appendChild(fragment)

    // Add drop indicator element if it doesn't exist
    if (!header.querySelector('.vibegridx-column-drop-indicator')) {
      const dropIndicator = document.createElement('div')
      dropIndicator.className = 'vibegridx-column-drop-indicator'
      header.appendChild(dropIndicator)
    }

    metrics.phases.domInsert = performance.now() - step8Start

    metrics.renderTime = performance.now() - headerStartTime

    return metrics
  }

  /**
   * Update sort indicators in the header
   */
  updateSortIndicators(sortBy: SortConfig[]): void {
    const sortLookup = new Map<string, { direction: 'asc' | 'desc'; index: number }>()
    sortBy.forEach((sort, index) => {
      sortLookup.set(sort.field, { direction: sort.direction, index })
    })

    // Update all header cells
    this.config.domManager
      .getElement('header')
      .querySelectorAll('.vibegridx-header-cell')
      .forEach((cell) => {
        const field = (cell as HTMLElement).dataset.field
        if (!field) return

        const sortInfo = sortLookup.get(field)

        // Update classes
        cell.classList.remove('sort-asc', 'sort-desc')
        if (sortInfo) {
          cell.classList.add(sortInfo.direction === 'asc' ? 'sort-asc' : 'sort-desc')
        }

        // Update sort icon
        const sortIcon = cell.querySelector('.vibegridx-sort-icon svg')
        if (sortIcon) {
          const ascPath = sortIcon.querySelector('path:first-child')
          const descPath = sortIcon.querySelector('path:last-child')

          if (ascPath) {
            ascPath.setAttribute('opacity', sortInfo?.direction === 'asc' ? '1' : '0.3')
          }
          if (descPath) {
            descPath.setAttribute('opacity', sortInfo?.direction === 'desc' ? '1' : '0.3')
          }
        }
      })
  }

  /**
   * Update header checkbox state
   */
  updateHeaderCheckbox(allRows: number, selectedRows: number): void {
    // Selection column is always enabled, so no need to check

    const checkbox = this.config.domManager
      .getElement('header')
      .querySelector('.vibegridx-header-checkbox') as HTMLInputElement
    if (!checkbox) return

    const allSelected = selectedRows === allRows && allRows > 0
    const someSelected = selectedRows > 0 && selectedRows < allRows

    checkbox.checked = allSelected
    checkbox.indeterminate = someSelected
  }

  // ====================================
  // PRIVATE METHODS
  // ====================================

  private getColumnsToRender(state: RenderState): Column[] {
    // IMPORTANT: Always use the columns from the render state as they come from the table machine
    // which has already applied column ordering and visibility logic
    if (state.columns && state.columns.length > 0) {
      fileLog.info('🔍 HeaderEngine: Using columns from render state (table machine ordered)', {
        columnCount: state.columns.length,
        columnIds: state.columns.map((c) => c.id),
        hasColumnOrder: !!(state as any).columnOrder,
      })
      return state.columns
    }

    // Fallback: Get visible columns using coordinate mapping (state machine authority)
    if (state.coordinateMapping?.columns) {
      fileLog.info('🔍 HeaderEngine: Fallback to coordinate mapping columns')
      const coordinateColumns = state.coordinateMapping.columns
      // Convert coordinate mapping to columns
      return coordinateColumns.map((coord: any) => ({
        id: coord.columnId,
        name: coord.columnId,
        field: coord.columnId,
        type: 'text' as const,
        width: coord.width,
        sortable: true,
      }))
    }

    // Final fallback: create columns from first row data
    fileLog.info('🔍 HeaderEngine: Final fallback to row data columns')
    return Object.keys(state.rows[0].data).map((key) => ({
      id: key,
      name: key,
      field: key,
      type: 'text' as const,
      width: 120,
      sortable: true,
    }))
  }

  private createSortLookup(
    state: RenderState,
  ): Map<string, { direction: 'asc' | 'desc'; index: number }> {
    const sortState = (state as any).sortBy
    if (!sortState) {
      throw new Error('HeaderEngine: Missing sortBy state for header rendering')
    }

    const sortLookup = new Map<string, { direction: 'asc' | 'desc'; index: number }>()

    sortState.forEach((sort: SortConfig, index: number) => {
      sortLookup.set(sort.field, { direction: sort.direction, index })
    })

    return sortLookup
  }

  private createSelectionHeader(state: RenderState): void {
    const selectedRows = this.config.selectionManager.getSelectedRows()
    const allSelected = selectedRows.size === state.rows.length && state.rows.length > 0
    const someSelected = selectedRows.size > 0 && selectedRows.size < state.rows.length

    const selectionHeader = document.createElement('div')
    selectionHeader.className = 'vibegridx-header-cell vibegridx-selection-header'
    selectionHeader.setAttribute('data-column', '__selection')
    selectionHeader.style.cssText =
      'width: 48px; min-width: 48px; max-width: 48px; position: sticky; left: 0; z-index: 10; background: var(--background);'

    const checkboxWrapper = document.createElement('label')
    checkboxWrapper.className = 'vibegridx-checkbox-wrapper'

    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    checkbox.className = 'vibegridx-header-checkbox'
    checkbox.checked = allSelected
    checkbox.indeterminate = someSelected

    const checkboxCustom = document.createElement('span')
    checkboxCustom.className = 'vibegridx-checkbox-custom'

    checkboxWrapper.appendChild(checkbox)
    checkboxWrapper.appendChild(checkboxCustom)
    selectionHeader.appendChild(checkboxWrapper)

    this.config.domManager.getElement('header').appendChild(selectionHeader)
  }

  private createDataColumnHeaders(
    columns: Column[],
    sortLookup: Map<string, { direction: 'asc' | 'desc'; index: number }>,
    coordinateMapping: any,
  ): DocumentFragment {
    const fragment = document.createDocumentFragment()

    columns.forEach((column) => {
      const headerCell = this.createHeaderCell(column, sortLookup, coordinateMapping)
      fragment.appendChild(headerCell)
    })

    return fragment
  }

  private createHeaderCell(
    column: Column,
    sortLookup: Map<string, { direction: 'asc' | 'desc'; index: number }>,
    coordinateMapping: any,
  ): HTMLElement {
    // Get width from coordinate mapping (state machine authority)
    if (!coordinateMapping?.columns) {
      throw new Error('HeaderEngine: Missing coordinate mapping for header cell creation')
    }

    const coordinateColumn = coordinateMapping.columns.find((c: any) => c.columnId === column.id)
    if (!coordinateColumn) {
      throw new Error(`HeaderEngine: Column ${column.id} not found in coordinate mapping`)
    }

    const width = coordinateColumn.width

    const field = column.field || column.id
    const sortInfo = sortLookup.get(field)

    const headerCell = document.createElement('div')
    headerCell.className = `vibegridx-header-cell${column.sortable !== false ? ' vibegridx-sortable' : ''}${sortInfo ? (sortInfo.direction === 'asc' ? ' sort-asc' : ' sort-desc') : ''}`
    headerCell.setAttribute('data-column', column.id)
    headerCell.setAttribute('data-field', field)
    headerCell.style.cssText = `width: ${width}px; min-width: ${width}px; max-width: ${width}px;`

    // Create a wrapper for text and sort icon to keep them together
    const textGroup = document.createElement('div')
    textGroup.style.cssText = 'display: flex; align-items: center; gap: 4px;'

    // Header text
    const headerText = document.createElement('span')
    headerText.className = 'vibegridx-header-text'
    headerText.textContent = column.name || column.id

    // Sort icon
    const sortIcon = document.createElement('span')
    sortIcon.className = 'vibegridx-sort-icon'
    sortIcon.innerHTML = this.createSortIconSVG(sortInfo)

    // Group text and sort icon together
    textGroup.appendChild(headerText)
    textGroup.appendChild(sortIcon)

    // Resize handle
    const resizeHandle = document.createElement('div')
    resizeHandle.className = 'vibegridx-resize-handle'
    resizeHandle.setAttribute('data-column', column.id)

    headerCell.appendChild(textGroup)
    headerCell.appendChild(resizeHandle)

    return headerCell
  }

  private createSortIconSVG(sortInfo?: { direction: 'asc' | 'desc'; index: number }): string {
    const ascOpacity = sortInfo?.direction === 'asc' ? '1' : '0.3'
    const descOpacity = sortInfo?.direction === 'desc' ? '1' : '0.3'

    return `<svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M3 5L6 2L9 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="${ascOpacity}"/>
      <path d="M3 7L6 10L9 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="${descOpacity}"/>
    </svg>`
  }
}
