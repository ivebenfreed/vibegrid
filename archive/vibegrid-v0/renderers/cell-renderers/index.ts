/**
 * Fast cell renderers for high-performance table rendering
 * These functions provide minimal overhead cell formatting
 */

export { boolean } from './boolean'
export { color } from './color'
export { computedExpression, computedFormula } from './computed'
export { currency } from './currency'
export { date } from './date'
// New field type renderers
export { email } from './email'
export { enumValue } from './enum'
export { file } from './file'
export { number } from './number'
export { phone } from './phone'
export { referenceMulti, referenceSelect } from './reference'
export type { RelationshipData } from './relationship'
export { relationship } from './relationship'
export { relationshipMulti } from './relationship/multi'
export { relationshipSingle } from './relationship/single'
export { rollupAverage, rollupConcat, rollupCount, rollupSum } from './rollup'
export { text } from './text'
export { url } from './url'

// Re-export the renderer type for convenience
import type { Column } from '../types'

export type FastRenderer = (value: any, column: Column) => string

/**
 * Map of column types to their fast renderer functions
 * Aligned with DataForge field types
 */
export const fastRenderers = {
  // Basic types
  text: () => import('./text').then((m) => m.text),
  longtext: () => import('./text').then((m) => m.text),
  'rich-text': () => import('./text').then((m) => m.text), // Rich text displayed as plain text in grid
  number: () => import('./number').then((m) => m.number),
  integer: () => import('./number').then((m) => m.number),
  decimal: () => import('./number').then((m) => m.number),
  boolean: () => import('./boolean').then((m) => m.boolean),
  date: () => import('./date').then((m) => m.date),
  datetime: () => import('./date').then((m) => m.date),
  timestamp: () => import('./date').then((m) => m.date),
  timestamptz: () => import('./date').then((m) => m.date),

  // Communication types
  email: () => import('./email').then((m) => m.email),
  url: () => import('./url').then((m) => m.url),
  phone: () => import('./phone').then((m) => m.phone),

  // Rich data types
  currency: () => import('./currency').then((m) => m.currency),
  color: () => import('./color').then((m) => m.color),
  file: () => import('./file').then((m) => m.file),

  // Selection types
  select: () => import('./text').then((m) => m.text), // Reuse text renderer
  'single-select': () => import('./enum').then((m) => m.enumValue),
  'multi-select': () => import('./text').then((m) => m.text), // Display as comma-separated
  enum: () => import('./enum').then((m) => m.enumValue),

  // Reference types
  custom_user_reference: () => import('./relationship').then((m) => m.relationship),
  custom_entity_reference: () => import('./relationship').then((m) => m.relationship),
  user_reference: () => import('./relationship').then((m) => m.relationship),
  entity_reference: () => import('./relationship').then((m) => m.relationship),
  'reference-select': () => import('./reference').then((m) => m.referenceSelect),
  'reference-multi': () => import('./reference').then((m) => m.referenceMulti),

  // Relationship display types (for rendered relationships)
  'relationship-single': () => import('./relationship').then((m) => m.relationship),
  'relationship-multi': () => import('./relationship').then((m) => m.relationship),
  'relationship-collection': () => import('./relationship').then((m) => m.relationship),

  // Rollup types
  rollup_count: () => import('./rollup').then((m) => m.rollupCount),
  rollup_sum: () => import('./rollup').then((m) => m.rollupSum),
  rollup_average: () => import('./rollup').then((m) => m.rollupAverage),
  rollup_concat: () => import('./rollup').then((m) => m.rollupConcat),

  // Computed types
  computed_expression: () => import('./computed').then((m) => m.computedExpression),
  computed_formula: () => import('./computed').then((m) => m.computedFormula),

  // Legacy/compatibility
  uuid: () => import('./text').then((m) => m.text), // UUID is text-based
  json: () => import('./text').then((m) => m.text), // JSON displayed as text
  relationship: () => import('./relationship').then((m) => m.relationship),
  'relationship-single': () => import('./relationship').then((m) => m.relationship),
  'relationship-multi': () => import('./relationship').then((m) => m.relationship),
  'relationship-collection': () => import('./relationship').then((m) => m.relationship),
}
