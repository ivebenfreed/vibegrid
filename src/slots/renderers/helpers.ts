/**
 * Shared helpers for cell renderers
 */

import { formatFieldForDisplay } from '@/shared/lib/display-formatters'

export { formatFieldForDisplay }

/**
 * Render the empty-cell placeholder.
 * If editable, show "Edit" pencil; otherwise show blank.
 */
export function renderEmpty(element: HTMLElement, isEditable: boolean): void {
  element.className = 'vibegridx-cell-empty'
  if (isEditable) {
    element.innerHTML = '<span data-action="edit" data-affordance-role="content" style="opacity: 0.6;">Edit ✏️</span>'
  } else {
    element.textContent = ''
  }
}

export function isEmpty(value: unknown): boolean {
  return value == null || value === ''
}

/**
 * Get backend-resolved display name for an entity reference field.
 * Returns the `{column.id}_name` value ONLY if it's a synthetic resolved field
 * (injected by UnifiedResolver), not a real schema field that happens to match.
 * Prevents collisions like "project" (entity ref) + "project_name" (extracted text).
 */
export function getResolvedDisplayName(
  rowData: Record<string, unknown> | undefined,
  column: { id: string },
  context: Record<string, unknown>,
): string | null {
  if (!rowData) return null
  const nameKey = `${column.id}_name`
  const resolved = rowData[nameKey]
  if (!resolved) return null

  // If the _name key is a real schema field, don't treat it as resolved display data
  const tableCoreStore = context.tableCoreStore as { columns?: Array<{ field?: string; id?: string }> } | undefined
  if (tableCoreStore?.columns?.some((col) => col.field === nameKey || col.id === nameKey)) {
    return null
  }

  return String(resolved)
}
