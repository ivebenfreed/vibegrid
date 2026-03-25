/**
 * Affordance Group Definitions
 *
 * Reusable interaction patterns for cell types.
 * Each group defines a set of interactive elements with their affordances.
 *
 * @see DESIGN.md in planning/04-improvements/vibegrid-cell-interaction/
 */

import type { AffordanceGroup } from './types'

/**
 * All available affordance groups
 *
 * Groups are designed to be reusable across field types:
 * - link-with-edit-icon: EntityName pattern
 * - editable-badge: Select, Date patterns
 * - editable-content: Text, Number patterns
 * - toggle-control: Boolean pattern
 * - readonly-display: Non-editable pattern
 * - link-only: Navigate-only (non-editable EntityName)
 * - readonly-badge: Non-editable Select/Date
 */
export const AFFORDANCE_GROUPS: Record<string, AffordanceGroup> = {
  /**
   * EntityName pattern: clickable link + edit icon on hover
   * - Text element navigates to entity detail
   * - Pencil icon triggers inline edit
   */
  'link-with-edit-icon': {
    name: 'link-with-edit-icon',
    description: 'Clickable text that navigates, with edit icon on hover',
    elements: [
      { role: 'link', affordance: 'navigate', cursor: 'pointer', hoverEffect: 'underline' },
      { role: 'icon', affordance: 'edit', cursor: 'pointer', hoverEffect: 'none' },
    ],
    container: { affordance: 'select', cursor: 'default' },
  },

  /**
   * Select/Date pattern: badge that opens dropdown/picker
   * - Clicking badge opens dropdown or date picker
   * - Shows scale effect on hover
   */
  'editable-badge': {
    name: 'editable-badge',
    description: 'Badge that opens dropdown/picker on click',
    elements: [{ role: 'badge', affordance: 'edit', cursor: 'pointer', hoverEffect: 'scale' }],
    container: { affordance: 'select', cursor: 'default' },
  },

  /**
   * Text/Number pattern: content area is directly editable
   * - Clicking content starts inline edit
   * - Shows background highlight on hover
   * - Uses text cursor to indicate editability
   */
  'editable-content': {
    name: 'editable-content',
    description: 'Content area that starts inline edit on click',
    elements: [{ role: 'content', affordance: 'edit', cursor: 'text', hoverEffect: 'background' }],
    container: { affordance: 'select', cursor: 'default' },
  },

  /**
   * Boolean pattern: toggle control
   * - Clicking checkbox/toggle changes value immediately
   * - No hover effect (toggle state is visual feedback)
   */
  'toggle-control': {
    name: 'toggle-control',
    description: 'Checkbox or toggle that changes value on click',
    elements: [{ role: 'control', affordance: 'toggle', cursor: 'pointer', hoverEffect: 'none' }],
    container: { affordance: 'select', cursor: 'default' },
  },

  /**
   * Read-only pattern: display only, no interaction
   * - Used for non-editable columns (createdAt, updatedAt, etc.)
   * - Default cursor, no hover effects
   */
  'readonly-display': {
    name: 'readonly-display',
    description: 'Display only, no interactive elements',
    elements: [{ role: 'content', affordance: 'none', cursor: 'default', hoverEffect: 'none' }],
    container: { affordance: 'select', cursor: 'default' },
  },

  /**
   * Link-only pattern: navigates but not editable
   * - For non-editable EntityName fields
   * - Keeps navigation affordance, removes edit icon
   */
  'link-only': {
    name: 'link-only',
    description: 'Clickable text that navigates, no edit capability',
    elements: [
      { role: 'link', affordance: 'navigate', cursor: 'pointer', hoverEffect: 'underline' },
    ],
    container: { affordance: 'select', cursor: 'default' },
  },

  /**
   * Read-only badge: displays badge without interaction
   * - For non-editable Select/Date fields
   * - Shows subtle brightness change on hover for feedback
   */
  'readonly-badge': {
    name: 'readonly-badge',
    description: 'Badge display without dropdown interaction',
    elements: [{ role: 'badge', affordance: 'none', cursor: 'default', hoverEffect: 'brightness' }],
    container: { affordance: 'select', cursor: 'default' },
  },
}

/**
 * Get an affordance group by name
 * @throws Error if group not found
 */
export function getAffordanceGroup(name: string): AffordanceGroup {
  const group = AFFORDANCE_GROUPS[name]
  if (!group) {
    throw new Error(`Unknown affordance group: ${name}`)
  }
  return group
}

/**
 * Check if an affordance group exists
 */
export function hasAffordanceGroup(name: string): boolean {
  return name in AFFORDANCE_GROUPS
}
