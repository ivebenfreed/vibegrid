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
    // For content-click fields, do NOT stamp data-affordance on the container.
    // CellActionRouter needs to fall through to the content-click spatial check
    // which distinguishes content clicks (→ edit) from padding clicks (→ select only).
    // Child elements (badges) set their own data-affordance as needed.
    const skipContainerAffordance = policy.editTrigger === 'content-click'

    switch (policy.defaultAction) {
      case 'edit':
        if (!skipContainerAffordance) {
          element.setAttribute('data-affordance', 'edit')
        }
        element.setAttribute('aria-roledescription', 'editable cell')
        break
      case 'navigate':
        if (!skipContainerAffordance) {
          element.setAttribute('data-affordance', 'navigate')
        }
        element.setAttribute('aria-roledescription', 'link')
        break
      case 'none':
        element.setAttribute('data-affordance', 'none')
        break
    }
  }
}
