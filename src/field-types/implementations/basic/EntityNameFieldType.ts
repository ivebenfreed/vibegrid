/**
 * Entity Name Field Type Implementation
 *
 * Special field type for entity name/title fields with modern UX:
 * - Renders as a clickable link
 * - Shows pencil icon on hover for inline editing
 * - Aligns with Notion/Linear/Airtable patterns
 */

import { getLogger } from '@/shared/lib/logging'
import type { FieldTypeAffordance } from '../../../affordances/types'
import type {
  CellEditor,
  CellRenderer,
  EnhancedColumn,
  VibeGridFieldType,
} from '../../FieldTypeRegistry'
import { fieldTypeRegistry } from '../../FieldTypeRegistry'
import { TextEditor, TextFormatter, TextRenderer, TextValidator } from './TextFieldType'

const logger = getLogger(
  'components/vibegrid/field-types/implementations/basic/EntityNameFieldType',
)

/**
 * Entity Name Cell Renderer
 * Renders name/title fields as clickable links with hover states
 */
export class EntityNameRenderer implements CellRenderer {
  private textRenderer = new TextRenderer()

  render(value: any, column: EnhancedColumn, rowData: any): HTMLElement {
    logger.debug('📝 [FIELD-ENTITY-NAME] Rendering entity name field', {
      columnId: column.id,
      value: value,
      rowId: rowData?.id,
    })

    // Create container
    const container = document.createElement('div')
    container.className = 'vibegridx-cell-entity-name'
    container.dataset.fieldType = 'entity-name'
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
    // cursor is now controlled by CSS via data-affordance attribute

    // ✅ Affordance data attributes for cursor/hover behavior
    textElement.dataset.affordance = 'navigate'
    textElement.dataset.affordanceRole = 'link'
    textElement.dataset.fieldType = 'entity-name'

    // Handle empty values
    if (value == null || value === '') {
      textElement.textContent = 'Untitled'
      textElement.style.opacity = '0.5'
      textElement.style.fontStyle = 'italic'
    } else {
      textElement.textContent = String(value)
    }

    // Add underline only when hovering over the text element itself
    // NOTE: Replaced with CSS :hover for performance (allows innerHTML cell updates)
    // textElement.addEventListener('mouseenter', () => {
    //   textElement.style.textDecoration = 'underline'
    // })
    // textElement.addEventListener('mouseleave', () => {
    //   textElement.style.textDecoration = 'none'
    // })

    // Create pencil icon (hidden by default, shown on hover via CSS)
    const pencilIcon = document.createElement('span')
    pencilIcon.className = 'vibegridx-entity-name-edit-icon'
    pencilIcon.innerHTML = '✏️'
    pencilIcon.style.opacity = '0'
    pencilIcon.style.transition = 'opacity 0.2s'
    pencilIcon.style.fontSize = '14px'
    pencilIcon.style.flexShrink = '0'
    // cursor is now controlled by CSS via data-affordance attribute
    pencilIcon.title = 'Click to edit inline'

    // ✅ Affordance data attributes for cursor/hover behavior
    pencilIcon.dataset.affordance = column.editable !== false ? 'edit' : 'none'
    pencilIcon.dataset.affordanceRole = 'icon'

    // Show pencil icon on hover
    // NOTE: Replaced with CSS :hover for performance (allows innerHTML cell updates)
    // container.addEventListener('mouseenter', () => {
    //   pencilIcon.style.opacity = '0.6'
    // })
    // container.addEventListener('mouseleave', () => {
    //   pencilIcon.style.opacity = '0'
    // })

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
      // Force update by always setting textContent (no caching/diffing)
      const newText = value == null || value === '' ? 'Untitled' : String(value)
      const newOpacity = value == null || value === '' ? '0.5' : '1'
      const newFontStyle = value == null || value === '' ? 'italic' : 'normal'

      // Always update, even if values appear the same
      textElement.textContent = newText
      textElement.style.opacity = newOpacity
      textElement.style.fontStyle = newFontStyle
    }
  }

  canHandle(column: EnhancedColumn): boolean {
    // Priority 1: If isPrimaryField is explicitly set, respect that
    const isPrimary = (column as any).isPrimaryField
    if (isPrimary !== undefined) {
      return isPrimary === true
    }

    // Priority 2: Auto-detect columns named 'name' or 'title' (legacy behavior)
    const columnId = column.id?.toLowerCase() || ''
    return columnId === 'name' || columnId === 'title'
  }
}

/**
 * Entity Name Field Type
 * Uses the special EntityNameRenderer with standard text editing
 */
export const EntityNameFieldType: VibeGridFieldType & { affordance: FieldTypeAffordance } = {
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

  // 🎯 Affordance declaration - link with edit icon on hover
  // This is the most complex pattern: text navigates, icon edits
  affordance: {
    group: 'link-with-edit-icon', // Text underlines on hover (navigate), pencil appears (edit)
    whenNotEditable: 'link-only', // Text still navigates, no edit icon
  },

  // 🚀 Interaction policy (legacy - being replaced by affordance system)
  interactionPolicy: {
    defaultAction: 'navigate', // Clicking navigates to entity detail
    editTrigger: 'icon', // Only edit via pencil icon
    blurPolicy: 'commit', // Save on blur when editing
  },
}

// Register the field type
fieldTypeRegistry.register('entity-name', EntityNameFieldType)

logger.info('✅ Entity Name field type registered')
