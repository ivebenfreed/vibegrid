import { log } from '@/logger'
import type { Column } from '../../types'
import {
  boolean,
  date,
  enumValue,
  number,
  referenceMulti,
  referenceSelect,
  relationshipMulti,
  relationshipSingle,
  text,
} from '../cell-renderers'
import {
  relationshipMultiBadge,
  relationshipMultiBadgeString,
} from '../cell-renderers/relationship/multi-badge'
import { relationshipSingleBadge } from '../cell-renderers/relationship/single'

const fileLog = log('components/custom/vibegrid/renderers/core/CellPipeline.ts')

// ====================================
// CELL RENDERING PIPELINE
// ====================================

/**
 * High-performance cell rendering pipeline
 * Centralizes all cell value rendering logic
 */
export class CellPipeline {
  // Map of renderers for quick lookup
  private static readonly renderers: Record<
    string,
    (value: any, column: Column, relationshipData?: any) => string
  > = {
    text: text,
    number: number,
    date: date,
    datetime: date,
    timestamp: date,
    timestamptz: date,
    boolean: boolean,
    enum: enumValue,
    select: text, // Reuse text renderer for select
    uuid: text, // UUID is text-based
    json: text, // JSON displayed as text (could be enhanced later)
    relationship: relationshipSingle, // Default to single
    'relationship-single': relationshipSingle,
    'relationship-multi': relationshipMultiBadgeString, // Fallback for string rendering
    'relationship-collection': relationshipMultiBadgeString, // Fallback for string rendering
    'reference-select': referenceSelect,
    'reference-multi': referenceMulti,
  }

  /**
   * Fast cell value rendering with type-based formatting
   * @param value - The cell value to render
   * @param column - Column configuration including type and formatting options
   * @param rowData - Full row data for relationship resolution
   * @returns Formatted string for cell content
   */
  static renderValue(value: any, column: Column, rowData?: any): string {
    // Check column cellType first, then fall back to type
    const cellType = column.cellType || column.type
    const renderer = CellPipeline.renderers[cellType] || text

    // For relationship types, pass row data for pre-resolved values
    if (cellType?.startsWith('relationship')) {
      return (renderer as any)(value, column, rowData)
    }

    // For reference types, pass row data for option resolution
    if (cellType?.startsWith('reference')) {
      return (renderer as any)(value, column, rowData)
    }

    return renderer(value, column)
  }

  private static _debugged = false

  /**
   * Creates a cell content element with proper formatting
   * @param value - The cell value
   * @param column - Column configuration
   * @param rowData - Full row data for context
   * @returns DOM element with rendered content
   */
  static createCellContent(value: any, column: Column, rowData: any): HTMLElement {
    const content = document.createElement('div')
    const cellType = column.cellType || column.type

    // Special handling for multi-relationship badges
    if (cellType === 'relationship-multi' || cellType === 'relationship-collection') {
      // Use the badge renderer that returns HTMLElement
      const badgeContent = relationshipMultiBadge(value, column, rowData)

      // Override default styles for badge container
      content.style.padding = '4px 12px' // Different padding for badge container

      content.appendChild(badgeContent)
      return content
    }

    // Special handling for single relationship badges
    if (cellType === 'relationship-single' || cellType === 'relationship') {
      // Use the DOM badge renderer that returns HTMLElement
      const badgeContent = relationshipSingleBadge(value, column, rowData)

      // Override default styles for badge container
      content.style.padding = '4px 12px' // Different padding for badge container

      content.appendChild(badgeContent)
      return content
    }

    // Check if column is editable
    const isEditable = column.editable !== false // Default to true unless explicitly false

    // Default styles for other cell types
    Object.assign(content.style, {
      padding: '0 12px', // Horizontal padding only
      boxSizing: 'border-box',
      width: '100%',
    })

    // Set content efficiently - pass row data for relationship resolution
    const cellContent = this.renderValue(value, column, rowData)

    if (isEditable) {
      // Create wrapper element for editable content
      const wrapper = document.createElement('div')

      // Add appropriate CSS class based on content type
      const isEmpty =
        !cellContent || cellContent === '' || cellContent === 'null' || cellContent === 'undefined'

      if (isEmpty) {
        wrapper.className = 'vibegridx-cell-empty-editable'
        wrapper.textContent = 'Click to edit'
      } else {
        // Add type-specific editable class
        switch (cellType) {
          case 'text':
          case 'string':
            wrapper.className = 'vibegridx-cell-text-editable'
            break
          case 'number':
          case 'integer':
          case 'float':
            wrapper.className = 'vibegridx-cell-number-editable'
            break
          case 'boolean':
            wrapper.className = 'vibegridx-cell-boolean-editable'
            break
          case 'enum':
            wrapper.className = 'vibegridx-cell-badge-editable'
            break
          default:
            wrapper.className = 'vibegridx-cell-content-editable'
        }

        // Set content based on type
        if (cellType === 'enum' || cellType?.startsWith('relationship')) {
          wrapper.innerHTML = cellContent
        } else {
          wrapper.textContent = cellContent
        }
      }

      content.appendChild(wrapper)

      // Add tooltip for truncated editable content
      requestAnimationFrame(() => {
        // Relationships are now handled by their DOM renderers
        if (cellType === 'enum') {
          if (wrapper.scrollWidth > wrapper.clientWidth && !isEmpty) {
            wrapper.title = wrapper.textContent || ''
          }
        } else if (!cellType?.startsWith('relationship')) {
          // Regular text content
          if (wrapper.scrollWidth > wrapper.clientWidth && !isEmpty) {
            wrapper.title = cellContent
          }
        }
      })
    } else {
      // Non-editable content - render normally
      if (cellType === 'enum' || cellType?.startsWith('relationship')) {
        content.innerHTML = cellContent
      } else {
        content.textContent = cellContent
      }
    }

    // Add tooltip for truncated content
    // Use requestAnimationFrame to ensure layout is complete
    requestAnimationFrame(() => {
      // Relationships are handled by their DOM renderers
      if (cellType?.startsWith('relationship')) {
        return
      } else if (cellType === 'enum') {
        // Enum: check if badge is truncated
        if (content.scrollWidth > content.clientWidth) {
          content.title = content.textContent || ''
        }
      } else {
        // Regular text content
        if (content.scrollWidth > content.clientWidth) {
          content.title = cellContent
        }
      }
    })

    return content
  }

  /**
   * Get renderer for a specific column type
   * @param columnType - The column type
   * @returns The renderer function or default text renderer
   */
  static getRenderer(
    columnType: string,
  ): (value: any, column: Column, relationshipData?: any) => string {
    return CellPipeline.renderers[columnType] || text
  }

  /**
   * Register a custom renderer for a column type
   * @param columnType - The column type to register
   * @param renderer - The renderer function
   */
  static registerRenderer(
    columnType: string,
    renderer: (value: any, column: Column, relationshipData?: any) => string,
  ): void {
    CellPipeline.renderers[columnType] = renderer
  }
}
