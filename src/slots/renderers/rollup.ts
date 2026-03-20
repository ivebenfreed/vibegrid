/**
 * Rollup cell renderers: Count, Sum, Average, Concat
 */

import type { Column } from '../../types'
import type { CellRenderer, CellRendererContext } from '../SlotRegistry'
import { applyAffordanceAttrs } from '../applyAffordanceAttrs'

// ============================================================
// ROLLUP COUNT
// ============================================================

class RollupCountCellRenderer implements CellRenderer {
  render(value: unknown, _column: Column, _context: CellRendererContext): HTMLElement {
    const container = document.createElement('div')

    container.className = 'vibegridx-rollup-count'
    container.style.cssText = `
      display: flex;
      align-items: center;
      gap: 6px;
      font-variant-numeric: tabular-nums;
      color: #374151;
    `

    const valueSpan = document.createElement('span')
    valueSpan.className = 'vibegridx-rollup-value'
    valueSpan.textContent = String(value || 0)
    valueSpan.style.cssText = `
      font-weight: 500;
      text-align: right;
    `

    const indicator = document.createElement('span')
    indicator.className = 'vibegridx-rollup-indicator'
    indicator.textContent = '\uD83D\uDCCA'
    indicator.title = 'Rollup count field'
    indicator.style.cssText = `
      font-size: 10px;
      opacity: 0.7;
    `

    container.appendChild(valueSpan)
    container.appendChild(indicator)

    applyAffordanceAttrs(container, this, false)
    return container
  }

  format(value: unknown, _column: Column, _context: CellRendererContext): string {
    return String(value || 0)
  }

  validate(_value: unknown, _column: Column, _context: CellRendererContext): string | null {
    return null
  }

  affordances = {
    sortable: true,
    filterable: true,
    editable: false,
    resizable: true,
    reorderable: true,
    groupable: true,
  }

  interactionPolicy = {
    defaultAction: 'none' as const,
    editTrigger: 'none' as const,
    blurPolicy: 'commit' as const,
  }

  affordanceGroup = {
    group: 'readonly-display',
    whenNotEditable: 'readonly-display',
  }

  metadata = { category: 'rollup' as const, description: 'Rollup count renderer' }
}

// ============================================================
// ROLLUP SUM
// ============================================================

class RollupSumCellRenderer implements CellRenderer {
  render(value: unknown, _column: Column, _context: CellRendererContext): HTMLElement {
    const container = document.createElement('div')

    container.className = 'vibegridx-rollup-sum'
    container.style.cssText = `
      display: flex;
      align-items: center;
      gap: 6px;
      font-variant-numeric: tabular-nums;
      color: #374151;
    `

    const valueSpan = document.createElement('span')
    valueSpan.className = 'vibegridx-rollup-value'
    valueSpan.textContent = this.formatLocaleNumber(value)
    valueSpan.style.cssText = `
      font-weight: 500;
      text-align: right;
    `

    const indicator = document.createElement('span')
    indicator.className = 'vibegridx-rollup-indicator'
    indicator.textContent = '\u03A3'
    indicator.title = 'Rollup sum field'
    indicator.style.cssText = `
      font-size: 10px;
      opacity: 0.7;
    `

    container.appendChild(valueSpan)
    container.appendChild(indicator)

    applyAffordanceAttrs(container, this, false)
    return container
  }

  format(value: unknown, _column: Column, _context: CellRendererContext): string {
    return this.formatLocaleNumber(value)
  }

  validate(_value: unknown, _column: Column, _context: CellRendererContext): string | null {
    return null
  }

  private formatLocaleNumber(value: unknown): string {
    if (value == null) return '0'
    const num = Number(value)
    if (Number.isNaN(num)) return '0'
    return num.toLocaleString()
  }

  affordances = {
    sortable: true,
    filterable: true,
    editable: false,
    resizable: true,
    reorderable: true,
    groupable: true,
  }

  interactionPolicy = {
    defaultAction: 'none' as const,
    editTrigger: 'none' as const,
    blurPolicy: 'commit' as const,
  }

  affordanceGroup = {
    group: 'readonly-display',
    whenNotEditable: 'readonly-display',
  }

  metadata = { category: 'rollup' as const, description: 'Rollup sum renderer' }
}

// ============================================================
// ROLLUP AVERAGE
// ============================================================

class RollupAverageCellRenderer implements CellRenderer {
  render(value: unknown, _column: Column, _context: CellRendererContext): HTMLElement {
    const container = document.createElement('div')

    container.className = 'vibegridx-rollup-average'
    container.style.cssText = `
      display: flex;
      align-items: center;
      gap: 6px;
      font-variant-numeric: tabular-nums;
      color: #374151;
    `

    const valueSpan = document.createElement('span')
    valueSpan.className = 'vibegridx-rollup-value'
    valueSpan.textContent = this.formatDecimal(value)
    valueSpan.style.cssText = `
      font-weight: 500;
      text-align: right;
    `

    const indicator = document.createElement('span')
    indicator.className = 'vibegridx-rollup-indicator'
    indicator.textContent = 'x\u0304'
    indicator.title = 'Rollup average field'
    indicator.style.cssText = `
      font-size: 10px;
      opacity: 0.7;
    `

    container.appendChild(valueSpan)
    container.appendChild(indicator)

    applyAffordanceAttrs(container, this, false)
    return container
  }

  format(value: unknown, _column: Column, _context: CellRendererContext): string {
    return this.formatDecimal(value)
  }

  validate(_value: unknown, _column: Column, _context: CellRendererContext): string | null {
    return null
  }

  private formatDecimal(value: unknown): string {
    if (value == null) return '0.00'
    const num = Number(value)
    if (Number.isNaN(num)) return '0.00'
    return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  affordances = {
    sortable: true,
    filterable: true,
    editable: false,
    resizable: true,
    reorderable: true,
    groupable: true,
  }

  interactionPolicy = {
    defaultAction: 'none' as const,
    editTrigger: 'none' as const,
    blurPolicy: 'commit' as const,
  }

  affordanceGroup = {
    group: 'readonly-display',
    whenNotEditable: 'readonly-display',
  }

  metadata = { category: 'rollup' as const, description: 'Rollup average renderer' }
}

// ============================================================
// ROLLUP CONCAT
// ============================================================

class RollupConcatCellRenderer implements CellRenderer {
  render(value: unknown, _column: Column, _context: CellRendererContext): HTMLElement {
    const container = document.createElement('div')

    container.className = 'vibegridx-rollup-concat'
    container.style.cssText = `
      display: flex;
      align-items: center;
      gap: 6px;
      max-width: 100%;
      color: #374151;
    `

    const valueSpan = document.createElement('span')
    valueSpan.className = 'vibegridx-rollup-value'
    valueSpan.textContent = this.formatConcat(value)
    valueSpan.title = this.formatConcat(value)
    valueSpan.style.cssText = `
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      flex: 1;
      font-size: 12px;
    `

    const indicator = document.createElement('span')
    indicator.className = 'vibegridx-rollup-indicator'
    indicator.textContent = '\uD83D\uDCDD'
    indicator.title = 'Rollup concat field'
    indicator.style.cssText = `
      font-size: 10px;
      opacity: 0.7;
      flex-shrink: 0;
    `

    container.appendChild(valueSpan)
    container.appendChild(indicator)

    applyAffordanceAttrs(container, this, false)
    return container
  }

  format(value: unknown, _column: Column, _context: CellRendererContext): string {
    return this.formatConcat(value)
  }

  validate(_value: unknown, _column: Column, _context: CellRendererContext): string | null {
    return null
  }

  private formatConcat(value: unknown): string {
    if (value == null) return ''
    if (Array.isArray(value)) return value.join(', ')
    return String(value)
  }

  affordances = {
    sortable: true,
    filterable: true,
    editable: false,
    resizable: true,
    reorderable: true,
    groupable: false,
  }

  interactionPolicy = {
    defaultAction: 'none' as const,
    editTrigger: 'none' as const,
    blurPolicy: 'commit' as const,
  }

  affordanceGroup = {
    group: 'readonly-display',
    whenNotEditable: 'readonly-display',
  }

  metadata = { category: 'rollup' as const, description: 'Rollup concat renderer' }
}

export const rollupCountCellRenderer = new RollupCountCellRenderer()
export const rollupSumCellRenderer = new RollupSumCellRenderer()
export const rollupAverageCellRenderer = new RollupAverageCellRenderer()
export const rollupConcatCellRenderer = new RollupConcatCellRenderer()
