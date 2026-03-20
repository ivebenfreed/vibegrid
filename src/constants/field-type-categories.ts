/**
 * Single source of truth for field type classification.
 * Used by: createEditor, EditingOverlay positioning, EditingStore modal detection.
 */

export type FieldTypeCategory = 'text' | 'number' | 'dropdown' | 'modal-text' | 'boolean'

// Types intentionally excluded from the map (non-editable or display-only):
// - Read-only computed/rollup: rollup_count, rollup_sum, rollup_average, rollup_concat,
//   computed_expression, computed_formula, computed_decision_table
// - Display-only: file, image, color, rating, slider, percentage,
//   currency-abbreviated, additional-insured, expiration-date, badge-list
// - Special renderers: row-expand, entity-name, status,
//   discussion_type_option
// - Unmapped types fall through to 'text' positioning (inline overlay on cell)

/**
 * Maps every CellType string to its editor category.
 * This determines:
 * - Editor positioning (text = overlay on cell, dropdown = below cell, modal-text = modal)
 * - Keyboard handling (modal-text types keep multiline key handling)
 * - Editor component selection (via createEditor)
 */
export const FIELD_TYPE_CATEGORIES: Record<string, FieldTypeCategory> = {
  // Text (inline overlay on cell)
  text: 'text',
  string: 'text',
  email: 'text',
  url: 'text',
  phone: 'text',

  // Number (inline overlay on cell)
  number: 'number',
  integer: 'number',
  float: 'number',
  decimal: 'number',
  currency: 'number',

  // Modal text (opens in modal, keeps multiline keyboard handling)
  textarea: 'modal-text',
  longtext: 'modal-text',
  richtext: 'modal-text',
  'rich-text': 'modal-text',
  rich_text: 'modal-text', // DataForge underscore variant
  html: 'modal-text',
  markdown: 'modal-text',

  // Boolean (dropdown below cell)
  boolean: 'boolean',
  checkbox: 'boolean',
  switch: 'boolean',

  // Dropdown (below cell with popover styling)
  date: 'dropdown',
  'datetime-local': 'dropdown',
  datetime: 'dropdown',
  timestamp: 'dropdown',
  time: 'dropdown',
  timestamptz: 'dropdown',
  select: 'dropdown',
  'single-select': 'dropdown',
  enum: 'dropdown',
  'select-multi': 'dropdown',
  'multi-select': 'dropdown',
  multiselect: 'dropdown',
  tags: 'dropdown',

  // json/jsonb: Excluded from the map. createEditor() conditionally routes
  // tags-like JSON to MultiSelectEditor (dropdown) and plain JSON to TextEditor (text).
  // The positioning must match the editor chosen, so EditingOverlay handles json/jsonb
  // as a special case using the same isTagsLikeField() check from createEditor.

  // Relationship dropdowns
  entity_reference: 'dropdown',
  user_reference: 'dropdown',
  'reference-select': 'dropdown',
  'reference-multi': 'dropdown',

  // System option dropdowns
  priority_option: 'dropdown',
  status_option: 'dropdown',
  category_option: 'dropdown',
  task_type_option: 'dropdown',
}

/** Check if a type is positioned as inline text overlay */
export function isTextPositioned(cellType: string): boolean {
  const cat = FIELD_TYPE_CATEGORIES[cellType]
  return cat === 'text' || cat === 'number'
}

/** Check if a type is positioned as a dropdown below the cell */
export function isDropdownPositioned(cellType: string): boolean {
  const cat = FIELD_TYPE_CATEGORIES[cellType]
  return cat === 'dropdown' || cat === 'boolean'
}

/** Check if a type uses a modal text editor (keeps multiline keyboard handling) */
export function isModalTextType(cellType: string): boolean {
  return FIELD_TYPE_CATEGORIES[cellType] === 'modal-text'
}

/** Check if a type is a date picker (needs larger dropdown) */
export function isDateType(cellType: string): boolean {
  return ['date', 'datetime', 'datetime-local', 'timestamp', 'timestamptz'].includes(cellType)
}
