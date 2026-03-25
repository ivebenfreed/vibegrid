/**
 * Visual cell renderers: Rating, Slider
 */

import type { Column } from '../../types'
import type { CellRenderer, CellRendererContext } from '../SlotRegistry'
import { applyAffordanceAttrs } from '../applyAffordanceAttrs'

// ============================================================
// RATING
// ============================================================

class RatingCellRenderer implements CellRenderer {
  render(value: unknown, column: Column, _context: CellRendererContext): HTMLElement {
    const el = document.createElement('div')
    const isEditable = column.editable !== false

    el.className = 'vibegridx-cell-rating'
    el.style.cssText = 'display: flex; align-items: center; gap: 2px;'

    const rating = Number(value) || 0
    const maxRating = column.max || 5

    for (let i = 1; i <= maxRating; i++) {
      const star = document.createElement('span')
      star.textContent = i <= rating ? '\u2605' : '\u2606' // ★ or ☆
      star.style.cssText = `color: ${i <= rating ? '#fbbf24' : '#d1d5db'}; font-size: 14px;`
      el.appendChild(star)
    }

    if (rating > 0) {
      const text = document.createElement('span')
      text.textContent = ` ${rating}/${maxRating}`
      text.style.cssText = 'font-size: 11px; color: #6b7280; margin-left: 4px;'
      el.appendChild(text)
    }

    applyAffordanceAttrs(el, this, isEditable)
    return el
  }

  format(value: unknown, _column: Column, _context: CellRendererContext): string {
    return value ? `${value} stars` : '0 stars'
  }

  validate(value: unknown, column: Column, _context: CellRendererContext): string | null {
    const rating = Number(value)
    const maxRating = column.max || 5
    if (Number.isNaN(rating) || rating < 0 || rating > maxRating) {
      return `${column.name || 'Field'} must be between 0 and ${maxRating}`
    }
    return null
  }

  affordances = {
    sortable: true,
    filterable: true,
    editable: true,
    resizable: true,
    reorderable: true,
    groupable: true,
  }

  interactionPolicy = {
    defaultAction: 'edit' as const,
    editTrigger: 'click' as const,
    blurPolicy: 'commit' as const,
  }

  metadata = { category: 'basic' as const, description: 'Rating cell renderer' }
}

// ============================================================
// SLIDER
// ============================================================

class SliderCellRenderer implements CellRenderer {
  render(value: unknown, column: Column, _context: CellRendererContext): HTMLElement {
    const el = document.createElement('div')
    const isEditable = column.editable !== false

    el.className = 'vibegridx-cell-slider'
    el.style.cssText = 'display: flex; align-items: center; gap: 8px; width: 100%;'

    const numValue = Number(value) || 0
    const min = column.min ?? 0
    const max = column.max ?? 100
    const percentage = ((numValue - min) / (max - min)) * 100

    const progressBar = document.createElement('div')
    progressBar.style.cssText = 'flex: 1; height: 6px; background: #e5e7eb; border-radius: 3px; position: relative;'

    const progress = document.createElement('div')
    progress.style.cssText = `height: 100%; background: #3b82f6; border-radius: 3px; width: ${Math.max(0, Math.min(100, percentage))}%;`
    progressBar.appendChild(progress)

    const valueSpan = document.createElement('span')
    valueSpan.textContent = String(numValue)
    valueSpan.style.cssText = 'font-size: 12px; font-weight: 500; min-width: 30px; text-align: right;'

    el.appendChild(progressBar)
    el.appendChild(valueSpan)

    applyAffordanceAttrs(el, this, isEditable)
    return el
  }

  format(value: unknown, _column: Column, _context: CellRendererContext): string {
    return String(Number(value) || 0)
  }

  validate(value: unknown, column: Column, _context: CellRendererContext): string | null {
    const numValue = Number(value)
    if (Number.isNaN(numValue)) return `${column.name || 'Field'} must be a number`
    const min = column.min ?? 0
    const max = column.max ?? 100
    if (numValue < min || numValue > max) {
      return `${column.name || 'Field'} must be between ${min} and ${max}`
    }
    return null
  }

  affordances = {
    sortable: true,
    filterable: true,
    editable: true,
    resizable: true,
    reorderable: true,
    groupable: true,
  }

  interactionPolicy = {
    defaultAction: 'edit' as const,
    editTrigger: 'click' as const,
    blurPolicy: 'commit' as const,
  }

  metadata = { category: 'basic' as const, description: 'Slider cell renderer' }
}

export const ratingCellRenderer = new RatingCellRenderer()
export const sliderCellRenderer = new SliderCellRenderer()
