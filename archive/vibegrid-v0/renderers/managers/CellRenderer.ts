/**
 * CellRenderer - Specialized cell creation and interaction management
 *
 * Handles individual cell creation, content formatting, and interaction logic.
 * Extracted from SimplePassiveRenderer for better modularity and maintainability.
 */

import { log } from '@/logger'
import type { TableCore$, TableInteraction$, TableViewport$ } from '../../stores/pure-observables'
import type { DOMElementFactory } from '../factories/DOMElementFactory'
import { BadgeRenderer } from '../modules/BadgeRenderer'
import { CellFormatter } from '../modules/CellFormatter'
import { KeyboardNavigationController } from '../modules/KeyboardNavigationController'

const fileLog = log('components/custom/vibegrid/renderers/managers/CellRenderer.ts')

const ROW_HEIGHT = 40

export interface CellRendererOptions {
  tableCore$: TableCore$
  tableInteraction$: TableInteraction$
  tableViewport$: TableViewport$
  domFactory: DOMElementFactory
  keyboardNavController?: KeyboardNavigationController
  container: HTMLElement

  // Cell creation callbacks
  onEntityUpdate?: (rowId: string, updates: Record<string, any>) => Promise<void> | void
}

export class CellRenderer {
  private tableCore$: TableCore$
  private tableInteraction$: TableInteraction$
  private tableViewport$: TableViewport$
  private domFactory: DOMElementFactory
  private keyboardNavController?: KeyboardNavigationController
  private container: HTMLElement
  private onEntityUpdate?: (rowId: string, updates: Record<string, any>) => Promise<void> | void

  constructor(options: CellRendererOptions) {
    this.tableCore$ = options.tableCore$
    this.tableInteraction$ = options.tableInteraction$
    this.tableViewport$ = options.tableViewport$
    this.domFactory = options.domFactory
    this.keyboardNavController = options.keyboardNavController
    this.container = options.container
    this.onEntityUpdate = options.onEntityUpdate
  }

  /**
   * Create a cell element with full interaction and content handling
   */
  createCellElement(row: any, column: any, colIndex: number, xPosition?: number): HTMLElement {
    // Single path for ALL cells - no smart vs regular distinction
    const cellType = column.cellType || column.type || 'text'
    const cellElement = this.domFactory.createElement('div', 'vibegridx-cell')
    cellElement.dataset.rowId = row.id
    cellElement.dataset.columnId = column.id

    // Check if this cell is selected
    const cellId = `${row.id}:${column.id}`
    const isSelected = this.tableInteraction$.selectedCells.get().has(cellId)

    // Use absolute positioning if xPosition is provided
    if (xPosition !== undefined) {
      cellElement.style.cssText = `
        position: absolute;
        left: ${xPosition}px;
        top: 0;
        width: ${column.width}px;
        height: 100%;
        padding: 0 12px;
        display: flex;
        align-items: center;
        font-size: 14px;
        border-right: 1px solid #f1f3f5;
        overflow: hidden;
        cursor: default;
      `
    } else {
      // Fallback to flex layout for compatibility
      cellElement.style.cssText = `
        flex: 0 0 ${column.width}px;
        height: 100%;
        padding: 0 12px;
        display: flex;
        align-items: center;
        font-size: 14px;
        border-right: 1px solid #f1f3f5;
        overflow: hidden;
        position: relative;
        cursor: default;
      `
    }

    // Apply selection class if selected
    if (isSelected) {
      cellElement.classList.add('vibegridx-selected')
    }

    // Get cell value and determine content type for proper CSS classes
    const value = row[column.id]

    // Create content element with proper CSS classes based on type
    // The content element should only take up the space it needs, not flex: 1
    let contentElement: HTMLElement

    if (cellType === 'enum' || cellType === 'select' || cellType === 'tags') {
      // Badge/enum content - use centralized formatter for schema-based styling
      contentElement = this.domFactory.createElement(
        'span',
        'vibegridx-enum-badge vibegridx-cell-badge-editable',
      )
      const displayValue = this.formatCellValue(value, cellType, column)

      // Check if the formatter returned HTML (with styling)
      if (displayValue.includes('<span')) {
        contentElement.innerHTML = displayValue
      } else {
        contentElement.textContent = displayValue

        // Apply default styling if no schema-based styling was applied
        contentElement.style.cssText = `
          background-color: rgb(243, 244, 246);
          color: rgb(75, 85, 99);
          border: 1px solid rgb(209, 213, 219);
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 8px;
          border-radius: 6px;
          font-size: 0.75rem;
          font-weight: 500;
          white-space: nowrap;
        `
      }
    } else if (this.isTagsField(column.id, value)) {
      // Tags field with comma-separated values - create multiple badges
      contentElement = this.createTagsElement(value, row, column)
    } else if (['number', 'integer', 'float'].includes(cellType)) {
      // Number content - only use specific classes, NOT vibegridx-cell-content
      contentElement = this.domFactory.createElement(
        'span',
        'vibegridx-number-content vibegridx-cell-number-editable',
      )
      contentElement.textContent = this.formatCellValue(value, cellType, column)
    } else if (cellType === 'boolean') {
      // Boolean content - only use specific classes, NOT vibegridx-cell-content
      contentElement = this.domFactory.createElement(
        'span',
        'vibegridx-boolean-text vibegridx-cell-boolean-editable',
      )
      contentElement.textContent = this.formatCellValue(value, cellType, column)
    } else if (value == null || value === '') {
      // Empty content - only use specific classes, NOT vibegridx-cell-content
      contentElement = this.domFactory.createElement('span', 'vibegridx-cell-empty-editable')
      contentElement.textContent = 'Click to edit'
      contentElement.style.fontSize = '12px'
      contentElement.style.opacity = '0.6'
    } else {
      // Text content (default) - only use specific classes, NOT vibegridx-cell-content
      contentElement = this.domFactory.createElement('span', 'vibegridx-cell-text-editable')
      contentElement.textContent = this.formatCellValue(value, cellType, column)

      // Add proper text overflow handling for long text
      contentElement.style.maxWidth = '100%'
      contentElement.style.overflow = 'hidden'
      contentElement.style.textOverflow = 'ellipsis'
      contentElement.style.whiteSpace = 'nowrap'
      contentElement.style.display = 'block'
    }

    // Ensure all content elements have proper overflow handling
    if (contentElement && !contentElement.style.overflow) {
      contentElement.style.overflow = 'hidden'
      contentElement.style.textOverflow = 'ellipsis'
      contentElement.style.whiteSpace = 'nowrap'
    }

    // Add click handler for content area - immediate edit mode
    contentElement.addEventListener('click', (e) => {
      e.stopPropagation()
      const cellId = `${row.id}:${column.id}`

      fileLog.info('📝 Content clicked - entering edit mode', {
        rowId: row.id,
        columnId: column.id,
        value,
        cellType,
      })

      // Start edit immediately
      this.tableInteraction$.startEdit(cellId, value ? String(value) : '')
    })

    cellElement.appendChild(contentElement)

    // Mouse down handler for cell selection (only on cell background, not content)
    cellElement.addEventListener('mousedown', (e) => {
      const target = e.target as Element

      // If click is on content element with editable class, ignore for selection
      if (
        target &&
        target.classList &&
        (target.classList.contains('vibegridx-cell-text-editable') ||
          target.classList.contains('vibegridx-cell-badge-editable') ||
          target.classList.contains('vibegridx-cell-number-editable') ||
          target.classList.contains('vibegridx-cell-boolean-editable') ||
          target.classList.contains('vibegridx-cell-empty-editable'))
      ) {
        fileLog.info('📝 Content element clicked, ignoring for selection')
        return // Content clicks are handled separately for editing
      }

      // Only proceed for cell background clicks (whitespace)
      if (target !== cellElement) {
        fileLog.info('🖱️ Click not on cell element, ignoring', {
          targetElement: (target as HTMLElement)?.tagName,
          targetClass: (target as HTMLElement)?.className,
        })
        return
      }

      const isCtrlKey = e.ctrlKey || e.metaKey
      const isShiftKey = e.shiftKey
      const cellId = `${row.id}:${column.id}`

      fileLog.info('🖱️ Cell whitespace clicked - selection mode', {
        rowId: row.id,
        columnId: column.id,
        ctrl: isCtrlKey,
        shift: isShiftKey,
        target: (e.target as HTMLElement).className,
      })

      // Update keyboard navigation focus
      this.keyboardNavController?.setFocusedCell(cellId)
      if (!isCtrlKey && !isShiftKey) {
        // For single clicks, update the anchor
        this.keyboardNavController?.setSelectionAnchor(cellId)
      }

      // Focus the container so it can receive keyboard events
      this.container.focus()

      // Prevent text selection during drag
      e.preventDefault()

      if (isShiftKey && this.tableInteraction$.anchorCell.get()) {
        // Shift+click for range selection
        this.tableInteraction$.selectRange(this.tableInteraction$.anchorCell.get()!, cellId)
      } else if (isCtrlKey) {
        // Ctrl/Cmd+click for multi-selection toggle
        this.tableInteraction$.toggleCellSelection(row.id, column.id, isCtrlKey, isShiftKey)
      } else {
        // Regular click - use toggleCellSelection to properly set anchor, then start potential drag selection
        this.tableInteraction$.toggleCellSelection(row.id, column.id, isCtrlKey, isShiftKey)
        this.tableInteraction$.startDragSelection(cellId)
      }

      // Set up document-level mouse move and up handlers for drag selection
      const handleMouseMove = (e: MouseEvent) => {
        // Find the cell element under the mouse
        const elementUnderMouse = document.elementFromPoint(e.clientX, e.clientY)
        const cellUnderMouse = elementUnderMouse?.closest(
          '[data-row-id][data-column-id]',
        ) as HTMLElement

        if (cellUnderMouse) {
          const rowId = cellUnderMouse.dataset.rowId
          const columnId = cellUnderMouse.dataset.columnId
          if (rowId && columnId) {
            const currentCellId = `${rowId}:${columnId}`
            this.tableInteraction$.updateDragSelection(currentCellId)
          }
        }
      }

      const handleMouseUp = (e: MouseEvent) => {
        fileLog.info('🖱️ Mouse up - ending drag selection')
        this.tableInteraction$.endDragSelection()

        // Clean up listeners
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }

      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    })

    // Click handler removed - all logic handled by mousedown and content click handlers

    // Double-click handler removed - immediate edit mode via content click

    // Drag functionality will be reserved for:
    // 1. Column headers (for reordering columns)
    // 2. Fill handle (for filling data ranges)
    // Regular cells should only support selection, not dragging

    return cellElement
  }

  /**
   * Format cell value using centralized display formatters
   */
  private formatCellValue(value: any, type?: string, column?: any): string {
    // Delegate to the modular CellFormatter
    return CellFormatter.formatCellValue(value, type, column)
  }

  /**
   * Check if a column should use tags field rendering
   */
  private isTagsField(columnId: string, value: any): boolean {
    return BadgeRenderer.isTagsField(columnId, value)
  }

  /**
   * Create tags element with multiple badges
   */
  private createTagsElement(value: string, row: any, column: any): HTMLElement {
    return BadgeRenderer.createTagsElement(value, row, column, this.onEntityUpdate)
  }
}
