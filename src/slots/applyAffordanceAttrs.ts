/**
 * Apply affordance DOM attributes to cell elements.
 *
 * Stamps data-affordance, data-affordance-group, data-editable attributes
 * that CellActionRouter reads for interaction routing.
 */

import type { CellRenderer } from './SlotRegistry'

/**
 * Apply affordance attributes from a CellRenderer to a DOM element.
 * Called by each CellRenderer in its render() method.
 */
export function applyAffordanceAttrs(
  element: HTMLElement,
  renderer: CellRenderer,
  isEditable = true,
): void {
  const group = renderer.affordanceGroup

  if (group) {
    element.setAttribute('data-affordance-group', group.group)
  }

  element.setAttribute('data-editable', isEditable ? 'true' : 'false')

  // Set default affordance based on interaction policy
  const policy = renderer.interactionPolicy
  if (policy) {
    switch (policy.defaultAction) {
      case 'edit':
        element.setAttribute('data-affordance', 'edit')
        break
      case 'navigate':
        element.setAttribute('data-affordance', 'navigate')
        break
      case 'none':
        element.setAttribute('data-affordance', 'none')
        break
    }
  }
}
