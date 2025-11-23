/**
 * Entity Name Field Type Implementation
 *
 * Special field type for entity name/title fields with modern UX:
 * - Renders as a clickable link
 * - Shows pencil icon on hover for inline editing
 * - Aligns with Notion/Linear/Airtable patterns
 */

import type {
  VibeGridFieldType,
  CellRenderer,
  CellEditor,
  EnhancedColumn,
} from '../../FieldTypeRegistry'
import { fieldTypeRegistry } from '../../FieldTypeRegistry'
import { createLogger } from '@/shared/lib/logging'
import { TextRenderer, TextEditor, TextFormatter, TextValidator } from './TextFieldType'

const fieldLog = createLogger('components/vibegrid/field-types/implementations/basic/EntityNameFieldType')

/**
 * Entity Name Cell Renderer
 * Renders name/title fields as clickable links with hover states
 */
export class EntityNameRenderer implements CellRenderer {
  private textRenderer = new TextRenderer()

  render(value: any, column: EnhancedColumn, rowData: any): HTMLElement {
    fieldLog.debug('📝 [FIELD-ENTITY-NAME] Rendering entity name field', {
      columnId: column.id,
      value: value,
      rowId: rowData?.id,
    })

    // Create container
    const container = document.createElement('div')
    container.className = 'vibegridx-cell-entity-name'
    container.style.display = 'flex'
    container.style.alignItems = 'center'
    container.style.gap = '8px'
    container.style.width = '100%'
    container.style.height = '100%'

    // Create text element (styled as a link)
    const textElement = document.createElement('span')
    textElement.className = 'vibegridx-entity-name-text'
    textElement.style.display = 'inline-block'
    textElement.style.overflow = 'hidden'
    textElement.style.textOverflow = 'ellipsis'
    textElement.style.whiteSpace = 'nowrap'
    textElement.style.maxWidth = '100%'
    textElement.style.color = 'var(--primary)'
    textElement.style.textDecoration = 'none'
    textElement.style.transition = 'text-decoration 0.2s'
    textElement.style.cursor = 'pointer'

    // ✅ Explicit action: clicking text navigates
    textElement.dataset.action = 'navigate'

    // Handle empty values
    if (value == null || value === '') {
      textElement.textContent = 'Untitled'
      textElement.style.opacity = '0.5'
      textElement.style.fontStyle = 'italic'
    } else {
      textElement.textContent = String(value)
    }

    // Add underline only when hovering over the text element itself
    textElement.addEventListener('mouseenter', () => {
      textElement.style.textDecoration = 'underline'
    })
    textElement.addEventListener('mouseleave', () => {
      textElement.style.textDecoration = 'none'
    })

    // Create pencil icon (hidden by default, shown on hover)
    const pencilIcon = document.createElement('span')
    pencilIcon.className = 'vibegridx-entity-name-edit-icon'
    pencilIcon.innerHTML = '✏️'
    pencilIcon.style.opacity = '0'
    pencilIcon.style.transition = 'opacity 0.2s'
    pencilIcon.style.fontSize = '14px'
    pencilIcon.style.flexShrink = '0'
    pencilIcon.style.cursor = 'pointer'
    pencilIcon.title = 'Click to edit inline'

    // ✅ Add data attribute for CellActionRouter detection
    pencilIcon.dataset.editTrigger = 'true'

    // Show pencil icon on hover
    container.addEventListener('mouseenter', () => {
      pencilIcon.style.opacity = '0.6'
    })
    container.addEventListener('mouseleave', () => {
      pencilIcon.style.opacity = '0'
    })

    // ✅ NO stopPropagation - let event bubble up to MouseController
    // CellActionRouter will detect data-edit-trigger="true" and route to edit
    // (while text clicks will route to navigate via defaultAction policy)

    container.appendChild(textElement)
    container.appendChild(pencilIcon)

    return container
  }

  update(element: HTMLElement, value: any, column: EnhancedColumn): void {
    const textElement = element.querySelector('.vibegridx-entity-name-text') as HTMLSpanElement
    if (textElement) {
      if (value == null || value === '') {
        textElement.textContent = 'Untitled'
        textElement.style.opacity = '0.5'
        textElement.style.fontStyle = 'italic'
      } else {
        textElement.textContent = String(value)
        textElement.style.opacity = '1'
        textElement.style.fontStyle = 'normal'
      }
    }
  }

  canHandle(column: EnhancedColumn): boolean {
    // Handle columns named 'name' or 'title'
    const columnId = column.id?.toLowerCase() || ''
    return columnId === 'name' || columnId === 'title'
  }
}

/**
 * Entity Name Field Type
 * Uses the special EntityNameRenderer with standard text editing
 */
export const EntityNameFieldType: VibeGridFieldType = {
  type: 'entity-name',
  category: 'basic',
  renderer: new EntityNameRenderer(),
  editor: new TextEditor(),
  formatter: new TextFormatter(),
  validator: new TextValidator(),
  metadata: {
    supportsSorting: true,
    supportsFiltering: true,
    supportsGrouping: true,
    supportsAggregation: false,
    requiresSpecialEditor: false,
    hasRichDisplay: true,
    supportsValidation: true,
    supportsFormatting: true,
    isCalculatedField: false,
    isReadOnly: false,
    requiresAsyncData: false,
  },

  // 🚀 NEW: Interaction policy
  interactionPolicy: {
    defaultAction: 'navigate',  // Clicking navigates to entity detail
    editTrigger: 'icon',        // Only edit via pencil icon (future implementation)
    blurPolicy: 'commit'        // Save on blur when editing
  },
}

// Register the field type
fieldTypeRegistry.register('entity-name', EntityNameFieldType)

fieldLog.info('✅ Entity Name field type registered')
