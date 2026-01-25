/**
 * Row Expand Field Type
 *
 * Generic field type for row expansion toggle button.
 * Renders a chevron that rotates when expanded.
 *
 * GH#1240: VibeGrid Generic Row Expansion
 *
 * Migrated from features/coi/schemas/coi-field-types.ts
 */

import { getLogger } from '@/shared/lib/logging'
import { type VibeGridFieldType, fieldTypeRegistry } from '../../FieldTypeRegistry'
import type {
  CellRenderer,
  CellFormatter,
  CellEditor,
  FieldMetadata,
  ValidationResult,
} from '../../FieldTypeRegistry'

const fileLog = getLogger(['vibegrid', 'field-types', 'RowExpandFieldType'])

// ====================================
// ROW EXPAND RENDERER
// ====================================

/**
 * Creates a chevron button for row expansion.
 * Uses CSS rotation for expanded state.
 */
class RowExpandRenderer implements CellRenderer {
  render(_value: unknown, _column: any, rowData: any, _relationships?: any): HTMLElement {
    const container = document.createElement('div')
    container.className = 'vibegridx-expand-cell'

    // Only render expand button for rows with expansion capability
    // Check if row can be expanded (has _canExpand flag or by default)
    const canExpand = rowData._canExpand !== false
    if (!canExpand) {
      return container
    }

    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'vibegridx-expand-button'
    button.setAttribute('data-action', 'expand-row')
    button.setAttribute('data-row-id', rowData.id)
    button.setAttribute('aria-label', rowData._isExpanded ? 'Collapse row' : 'Expand row')
    button.setAttribute('aria-expanded', String(!!rowData._isExpanded))

    // Create chevron icon (chevron-right that rotates 90deg when expanded)
    const chevron = document.createElement('span')
    chevron.className = 'vibegridx-expand-chevron'
    if (rowData._isExpanded) {
      chevron.classList.add('vibegridx-expand-chevron--expanded')
    }
    // Use Unicode chevron character
    chevron.textContent = '\u203A' // Single right-pointing angle quotation mark

    button.appendChild(chevron)
    container.appendChild(button)

    return container
  }

  update(element: HTMLElement, _value: unknown, column: any): void {
    // Re-render the button with updated state
    const button = element.querySelector('.vibegridx-expand-button')
    const chevron = element.querySelector('.vibegridx-expand-chevron')
    const rowData = (column as any)._rowData

    if (button && chevron && rowData) {
      button.setAttribute('aria-expanded', String(!!rowData._isExpanded))
      button.setAttribute('aria-label', rowData._isExpanded ? 'Collapse row' : 'Expand row')

      if (rowData._isExpanded) {
        chevron.classList.add('vibegridx-expand-chevron--expanded')
      } else {
        chevron.classList.remove('vibegridx-expand-chevron--expanded')
      }
    }
  }

  canHandle(column: any): boolean {
    return column.cellType === 'row-expand'
  }
}

// ====================================
// ROW EXPAND FORMATTER
// ====================================

/**
 * Formatter for text fallback (unused for this field type)
 */
class RowExpandFormatter implements CellFormatter {
  format(value: unknown, _column: any, _context?: any): string {
    // Return a simple indicator for non-DOM contexts
    return value ? '▼' : '▶'
  }

  parse(_text: string, _column: any): any {
    // Row expand state is not parseable from text
    return false
  }
}

// ====================================
// ROW EXPAND EDITOR (NO-OP)
// ====================================

/**
 * No-op editor for row expand field (not editable)
 */
class RowExpandEditor implements CellEditor {
  create(_value: any, _column: any, _onSave: (value: any) => void): HTMLElement {
    // This field type is not editable
    return document.createElement('div')
  }

  getValue(_element: HTMLElement): any {
    return false
  }

  setValue(_element: HTMLElement, _value: any): void {
    // No-op
  }

  validate(_value: any, _column: any): ValidationResult {
    return { valid: true, errors: [] }
  }

  destroy(_element: HTMLElement): void {
    // No-op
  }
}

// ====================================
// FIELD TYPE DEFINITION
// ====================================

const rowExpandMetadata: FieldMetadata = {
  supportsSorting: false,
  supportsFiltering: false,
  supportsGrouping: false,
  supportsAggregation: false,
  requiresSpecialEditor: false,
  hasRichDisplay: true,
  supportsValidation: false,
  supportsFormatting: false,
  isReadOnly: true,
}

const RowExpandFieldType: VibeGridFieldType = {
  type: 'row-expand',
  category: 'basic',
  metadata: rowExpandMetadata,
  renderer: new RowExpandRenderer(),
  editor: new RowExpandEditor(),
  formatter: new RowExpandFormatter(),
  interactionPolicy: {
    defaultAction: 'custom', // Custom handling via data-action="expand-row"
    editTrigger: 'none', // Not editable
    blurPolicy: 'cancel', // Not applicable for non-editable
  },
}

// ====================================
// REGISTER FIELD TYPE
// ====================================

fieldTypeRegistry.register('row-expand', RowExpandFieldType)

fileLog.debug('RowExpandFieldType registered')

export { RowExpandFieldType, RowExpandRenderer, RowExpandEditor, RowExpandFormatter }
