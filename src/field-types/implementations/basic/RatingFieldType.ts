/**
 * Rating Field Type Implementation - Star ratings with configurable max
 */

import type { FieldTypeAffordance } from '../../../affordances/types'
import type {
  CellEditor,
  CellFormatter,
  CellRenderer,
  EnhancedColumn,
  ValidationResult,
  VibeGridFieldType,
} from '../../FieldTypeRegistry'

export class RatingRenderer implements CellRenderer {
  render(value: any, column: EnhancedColumn, rowData: any): HTMLElement {
    const container = document.createElement('div')
    const isEditable = column.editable !== false

    // Add affordance data attributes
    container.dataset.affordance = isEditable ? 'toggle' : 'none'
    container.dataset.affordanceRole = 'control'

    container.className = 'vibegridx-cell-rating'
    container.style.cssText = 'display: flex; align-items: center; gap: 2px;'

    const rating = Number(value) || 0
    const maxRating = column.validation?.max || column.editor?.maxRating || 5

    for (let i = 1; i <= maxRating; i++) {
      const star = document.createElement('span')
      star.textContent = i <= rating ? '★' : '☆'
      star.style.cssText = `color: ${i <= rating ? '#fbbf24' : '#d1d5db'}; font-size: 14px;`
      container.appendChild(star)
    }

    if (rating > 0) {
      const text = document.createElement('span')
      text.textContent = ` ${rating}/${maxRating}`
      text.style.cssText = 'font-size: 11px; color: #6b7280; margin-left: 4px;'
      container.appendChild(text)
    }

    return container
  }

  update(element: HTMLElement, value: any, column: EnhancedColumn): void {
    const rating = Number(value) || 0
    const stars = element.querySelectorAll('span')
    const maxRating = column.validation?.max || 5

    stars.forEach((star, i) => {
      if (i < maxRating) {
        star.textContent = i + 1 <= rating ? '★' : '☆'
        star.style.color = i + 1 <= rating ? '#fbbf24' : '#d1d5db'
      }
    })
  }

  canHandle(column: EnhancedColumn): boolean {
    return ((column.cellType || column.type) as string) === 'rating'
  }
}

export class RatingEditor implements CellEditor {
  private currentElement: HTMLElement | null = null
  private onSaveCallback: ((value: any) => void) | null = null

  create(value: any, column: EnhancedColumn, onSave: (value: any) => void): HTMLElement {
    this.onSaveCallback = onSave

    const container = document.createElement('div')
    container.className = 'vibegridx-rating-editor'
    container.setAttribute('data-testid', 'rating-editor')
    container.setAttribute('data-field-type', 'rating')
    container.setAttribute('data-column-id', column.id)
    container.setAttribute('data-editable', 'true')
    container.style.cssText = 'display: flex; align-items: center; gap: 2px; padding: 4px;'

    const rating = Number(value) || 0
    const maxRating = column.validation?.max || 5

    for (let i = 1; i <= maxRating; i++) {
      const star = document.createElement('span')
      star.textContent = '☆'
      star.style.cssText =
        'font-size: 16px; cursor: pointer; color: #d1d5db; transition: color 0.1s;'
      star.dataset.rating = String(i)

      star.addEventListener('click', () => {
        onSave(i)
      })

      star.addEventListener('mouseenter', () => {
        this.highlightStars(container, i)
      })

      if (i <= rating) {
        star.textContent = '★'
        star.style.color = '#fbbf24'
      }

      container.appendChild(star)
    }

    container.addEventListener('mouseleave', () => {
      this.highlightStars(container, rating)
    })

    this.currentElement = container
    return container
  }

  getValue(element: HTMLElement): any {
    const selectedStar = element.querySelector(
      'span[data-rating]:last-of-type[style*="#fbbf24"]',
    ) as HTMLElement
    return selectedStar ? Number(selectedStar.dataset.rating) : 0
  }

  setValue(element: HTMLElement, value: any): void {
    const rating = Number(value) || 0
    this.highlightStars(element, rating)
  }

  validate(value: any, column: EnhancedColumn): ValidationResult {
    const errors: string[] = []
    const rating = Number(value)
    const maxRating = column.validation?.max || 5

    if (isNaN(rating) || rating < 0 || rating > maxRating) {
      errors.push(`${column.name} must be between 0 and ${maxRating}`)
    }

    return { valid: errors.length === 0, errors, transformedValue: rating }
  }

  destroy(): void {
    this.currentElement = null
    this.onSaveCallback = null
  }

  supportsInlineEditing(): boolean {
    return true
  }

  private highlightStars(container: HTMLElement, rating: number): void {
    const stars = container.querySelectorAll('span[data-rating]')
    stars.forEach((star, i) => {
      const starElement = star as HTMLElement
      if (i + 1 <= rating) {
        starElement.textContent = '★'
        starElement.style.color = '#fbbf24'
      } else {
        starElement.textContent = '☆'
        starElement.style.color = '#d1d5db'
      }
    })
  }
}

export const RatingFieldType: VibeGridFieldType = {
  type: 'rating',
  category: 'basic',
  renderer: new RatingRenderer(),
  editor: new RatingEditor(),
  formatter: new (class implements CellFormatter {
    format(value: any): string {
      return value ? `${value} stars` : '0 stars'
    }
    parse(text: string): any {
      return parseFloat(text) || 0
    }
  })(),
  metadata: {
    supportsSorting: true,
    supportsFiltering: true,
    supportsGrouping: true,
    supportsAggregation: true,
    requiresSpecialEditor: true,
    hasRichDisplay: true,
  },
  getFormatter() {
    const fmt = this.formatter
    return (value: any, rowData?: any, column?: any) => fmt.format(value, column)
  },

  // 🎯 Affordance Group System
  affordance: {
    group: 'toggle-control',
    whenNotEditable: 'readonly-display',
  } as FieldTypeAffordance,
}

import { fieldTypeRegistry } from '../../FieldTypeRegistry'

fieldTypeRegistry.register('rating', RatingFieldType)
