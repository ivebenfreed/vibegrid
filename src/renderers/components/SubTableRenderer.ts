/**
 * SubTableRenderer - Lightweight table renderer for expanded content
 *
 * Uses the same DOM-based rendering approach as VibeGrid's main BodyRenderer
 * but optimized for rendering nested tables in expanded rows.
 *
 * GH#1240: VibeGrid Generic Row Expansion
 */

import { getLogger } from '@/shared/lib/logging'

const logger = getLogger(['vibegrid', 'SubTableRenderer'])

// ====================================
// CONSTANTS
// ====================================

const SUB_ROW_HEIGHT = 32
const DEFAULT_COLUMN_WIDTH = 120

// ====================================
// TYPES
// ====================================

export interface SubTableColumn {
  id: string
  name: string
  width?: number
}

export interface SubTableConfig {
  columns: SubTableColumn[]
  data: Record<string, unknown>[]
  entityType?: string
  onRowClick?: (rowId: string, rowData: Record<string, unknown>) => void
}

// ====================================
// SUBTABLE RENDERER
// ====================================

/**
 * Renders a lightweight sub-table into a container element.
 * Uses pure DOM manipulation like the main VibeGrid renderer.
 */
export class SubTableRenderer {
  private container: HTMLElement
  private config: SubTableConfig

  constructor(container: HTMLElement, config: SubTableConfig) {
    this.container = container
    this.config = config
  }

  /**
   * Render the sub-table into the container
   */
  render(): void {
    const { columns, data, entityType } = this.config

    logger.debug('Rendering sub-table', {
      columnCount: columns.length,
      rowCount: data.length,
      entityType,
    })

    // Clear container
    this.container.innerHTML = ''

    // Create table wrapper
    const tableWrapper = this.createElement('div', 'vibegridx-subtable-wrapper')
    tableWrapper.style.cssText = `
      width: 100%;
      overflow-x: auto;
    `

    // Create table element
    const table = this.createElement('div', 'vibegridx-subtable')
    table.style.cssText = `
      display: table;
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    `

    // Render header
    const header = this.renderHeader(columns)
    table.appendChild(header)

    // Render body
    const body = this.renderBody(columns, data)
    table.appendChild(body)

    tableWrapper.appendChild(table)
    this.container.appendChild(tableWrapper)

    logger.debug('Sub-table rendered', {
      rowCount: data.length,
    })
  }

  /**
   * Render table header row
   */
  private renderHeader(columns: SubTableColumn[]): HTMLElement {
    const headerRow = this.createElement('div', 'vibegridx-subtable-header')
    headerRow.style.cssText = `
      display: table-row;
      background: hsl(var(--muted) / 0.5);
      font-weight: 500;
      color: hsl(var(--muted-foreground));
    `

    for (const column of columns) {
      const headerCell = this.createElement('div', 'vibegridx-subtable-header-cell')
      headerCell.style.cssText = `
        display: table-cell;
        padding: 6px 12px;
        border-bottom: 1px solid hsl(var(--border));
        white-space: nowrap;
        width: ${column.width || DEFAULT_COLUMN_WIDTH}px;
      `
      headerCell.textContent = column.name
      headerRow.appendChild(headerCell)
    }

    return headerRow
  }

  /**
   * Render table body with data rows
   */
  private renderBody(columns: SubTableColumn[], data: Record<string, unknown>[]): HTMLElement {
    const body = this.createElement('div', 'vibegridx-subtable-body')
    body.style.cssText = `
      display: table-row-group;
    `

    for (let i = 0; i < data.length; i++) {
      const rowData = data[i]
      const row = this.renderRow(columns, rowData, i)
      body.appendChild(row)
    }

    return body
  }

  /**
   * Render a single data row
   */
  private renderRow(
    columns: SubTableColumn[],
    rowData: Record<string, unknown>,
    rowIndex: number,
  ): HTMLElement {
    const row = this.createElement('div', 'vibegridx-subtable-row')
    row.style.cssText = `
      display: table-row;
      height: ${SUB_ROW_HEIGHT}px;
      background: ${rowIndex % 2 === 0 ? 'transparent' : 'hsl(var(--muted) / 0.3)'};
    `
    row.dataset.rowIndex = String(rowIndex)

    // Add hover effect
    row.addEventListener('mouseenter', () => {
      row.style.background = 'hsl(var(--accent) / 0.5)'
    })
    row.addEventListener('mouseleave', () => {
      row.style.background = rowIndex % 2 === 0 ? 'transparent' : 'hsl(var(--muted) / 0.3)'
    })

    // Add click handler if provided
    if (this.config.onRowClick) {
      row.style.cursor = 'pointer'
      row.addEventListener('click', () => {
        const rowId = (rowData.id as string) || String(rowIndex)
        this.config.onRowClick?.(rowId, rowData)
      })
    }

    for (const column of columns) {
      const cell = this.renderCell(column, rowData)
      row.appendChild(cell)
    }

    return row
  }

  /**
   * Render a single cell
   */
  private renderCell(column: SubTableColumn, rowData: Record<string, unknown>): HTMLElement {
    const cell = this.createElement('div', 'vibegridx-subtable-cell')
    cell.style.cssText = `
      display: table-cell;
      padding: 6px 12px;
      border-bottom: 1px solid hsl(var(--border) / 0.5);
      vertical-align: middle;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: ${column.width || DEFAULT_COLUMN_WIDTH}px;
    `

    const value = rowData[column.id]
    cell.textContent = this.formatValue(value)
    cell.title = this.formatValue(value) // Tooltip for truncated content

    return cell
  }

  /**
   * Format a cell value for display
   */
  private formatValue(value: unknown): string {
    if (value === null || value === undefined) return '—'
    if (typeof value === 'boolean') return value ? 'Yes' : 'No'
    if (typeof value === 'number') return value.toLocaleString()
    if (value instanceof Date) return value.toLocaleDateString()
    if (Array.isArray(value)) return value.join(', ')
    if (typeof value === 'object') return JSON.stringify(value)
    return String(value)
  }

  /**
   * Create a DOM element with optional class name
   */
  private createElement(tag: string, className?: string): HTMLElement {
    const element = document.createElement(tag)
    if (className) {
      element.className = className
    }
    return element
  }

  /**
   * Dispose and clean up
   */
  dispose(): void {
    this.container.innerHTML = ''
  }
}

/**
 * Factory function to render a sub-table
 */
export function renderSubTable(container: HTMLElement, config: SubTableConfig): SubTableRenderer {
  const renderer = new SubTableRenderer(container, config)
  renderer.render()
  return renderer
}
