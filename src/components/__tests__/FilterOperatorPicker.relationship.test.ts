/**
 * Operator sets for relationship columns.
 *
 * `RELATIONSHIP_OPERATORS` existed since GH#216 but no cellType ever reached
 * it, so relationship columns silently fell through to TEXT_OPERATORS —
 * offering starts_with / regex / not_contains over an opaque UUID.
 */

import { describe, expect, it } from 'vitest'
import { getOperatorsForFieldType } from '../FilterOperatorPicker'

describe('getOperatorsForFieldType — relationship cell types', () => {
  for (const cellType of ['badge-list', 'badge-list-live', 'relationship', 'entity-reference']) {
    it(`offers set-membership operators for ${cellType}`, () => {
      expect(getOperatorsForFieldType(cellType)).toEqual(['equals', 'in', 'is_empty', 'is_not_empty'])
    })
  }

  it('withholds negated membership, which the server predicate AST cannot express', () => {
    const operators = getOperatorsForFieldType('badge-list')
    expect(operators).not.toContain('not_equals')
    expect(operators).not.toContain('not_in')
  })

  it('no longer offers substring operators over an opaque id', () => {
    const operators = getOperatorsForFieldType('badge-list')
    for (const op of ['contains', 'starts_with', 'ends_with', 'regex']) {
      expect(operators).not.toContain(op)
    }
  })

  it('leaves other field types untouched', () => {
    expect(getOperatorsForFieldType('text')).toContain('regex')
    expect(getOperatorsForFieldType('number')).toContain('greater_than')
    expect(getOperatorsForFieldType('status')).toContain('not_in')
  })
})
