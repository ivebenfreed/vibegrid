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

    // For content-click fields, auto-wrap bare text in a span with data-action
    // so CellActionRouter can distinguish content clicks (edit) from padding clicks (none).
    if (policy.editTrigger === 'content-click' && isEditable && !element.firstElementChild) {
      const text = element.textContent
      if (text) {
        element.textContent = ''
        const content = document.createElement('span')
        content.textContent = text
        content.dataset.action = 'edit'
        content.dataset.affordanceRole = 'content'
        content.style.cssText =
          'overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%;'
        element.appendChild(content)
      }
    }

    // Dev-mode contract enforcement: content-click renderers must have a [data-action] descendant
    if (
      process.env.NODE_ENV !== 'production' &&
      policy.editTrigger === 'content-click' &&
      isEditable &&
      !element.querySelector('[data-action]')
    ) {
      // biome-ignore lint/suspicious/noConsole: intentional dev-mode DOM contract warning
      console.warn(
        `[VIbeGrid] DOM contract violation: renderer "${renderer.constructor.name}" has editTrigger='content-click' and isEditable=true but no descendant has [data-action]. Hover and routing will not work correctly.`,
      )
    }
  }
}
