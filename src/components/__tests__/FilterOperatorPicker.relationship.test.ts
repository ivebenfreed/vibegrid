/**
 * Operator sets for relationship columns.
 *
 * `RELATIONSHIP_OPERATORS` existed since GH#216 but no cellType ever reached
 * it, so relationship columns silently fell through to TEXT_OPERATORS —
 * offering starts_with / regex / not_contains over an opaque UUID.
 */

import { describe, expect, it } from 'vitest'
import { getOperatorLabel, getOperatorsForFieldType } from '../FilterOperatorPicker'

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

describe('getOperatorLabel', () => {
  it('gives the set operators the same words the dropdown rows use', () => {
    // The trigger rendered the raw value ("in") while the row that set it read
    // "is any of" — `Select.Value` falls back to the item value with no
    // formatter. One helper now feeds both.
    expect(getOperatorLabel('in')).toBe('is any of')
    expect(getOperatorLabel('not_in')).toBe('is none of')
  })

  it('labels the remaining operators', () => {
    expect(getOperatorLabel('is_empty')).toBe('is empty')
    expect(getOperatorLabel('is_not_empty')).toBe('is not empty')
    expect(getOperatorLabel('equals')).toBe('equals')
    expect(getOperatorLabel('not_contains')).toBe('not contains')
  })

  it('falls back to the raw operator when unlabelled', () => {
    expect(getOperatorLabel('some_future_op')).toBe('some_future_op')
  })

  it('returns empty for no selection so the trigger can show its placeholder', () => {
    expect(getOperatorLabel(null)).toBe('')
    expect(getOperatorLabel(undefined)).toBe('')
    expect(getOperatorLabel('')).toBe('')
  })

  it('covers every operator the relationship set offers', () => {
    for (const op of getOperatorsForFieldType('badge-list')) {
      expect(getOperatorLabel(op)).not.toBe(op === 'equals' ? '' : op)
    }
  })
})
