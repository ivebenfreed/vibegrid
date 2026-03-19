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
        element.setAttribute('aria-roledescription', 'editable cell')
        break
      case 'navigate':
        element.setAttribute('data-affordance', 'navigate')
        element.setAttribute('aria-roledescription', 'link')
        break
      case 'none':
        element.setAttribute('data-affordance', 'none')
        break
    }

    // For content-click fields, CellActionRouter uses firstElementChild to
    // distinguish content clicks (edit) from padding clicks (select only).
    // When the renderer used textContent (no child elements), auto-wrap the
    // text in a content span so the spatial check works. Renderers stay simple.
    if (policy.editTrigger === 'content-click' && isEditable && !element.firstElementChild) {
      const text = element.textContent
      if (text) {
        element.textContent = ''
        const content = document.createElement('span')
        content.textContent = text
        content.dataset.affordance = 'edit'
        content.dataset.affordanceRole = 'content'
        content.style.cssText =
          'overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%;'
        element.appendChild(content)
      }
    }
  }
}
