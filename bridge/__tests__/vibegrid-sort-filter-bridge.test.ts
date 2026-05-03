/**
 * GH#2804 p5 (B11) — VibeGrid sort/filter → QueryShape bridge tests.
 *
 * Verifies the operator-name translation from VibeGrid's UI-level
 * FilterOperator (`'equals'`, `'greater_than'`, ...) onto QueryShape's
 * short-form FilterOperator (`'eq'`, `'gt'`, ...). Unsupported operators
 * are dropped on the SQL path; the JS-side fallback handles those.
 */

import { describe, expect, it } from 'vitest'
import {
  convertVibeGridFilterToFilterExpression,
  convertVibeGridSortToQueryShape,
  type VibeGridFilterCondition,
  type VibeGridFilterGroup,
  type VibeGridSortConfig,
} from '../vibegrid-sort-filter-bridge'

// -------------------------------------------------------------------
// Sort
// -------------------------------------------------------------------

describe('convertVibeGridSortToQueryShape', () => {
  it('returns [] for null', () => {
    expect(convertVibeGridSortToQueryShape(null)).toEqual([])
  })

  it('returns [] for undefined', () => {
    expect(convertVibeGridSortToQueryShape(undefined)).toEqual([])
  })

  it('returns [] for empty array', () => {
    expect(convertVibeGridSortToQueryShape([])).toEqual([])
  })

  it('preserves single sort field', () => {
    const sort: VibeGridSortConfig[] = [{ field: 'status', direction: 'asc' }]
    expect(convertVibeGridSortToQueryShape(sort)).toEqual([
      { field: 'status', direction: 'asc' },
    ])
  })

  it('preserves order and direction across multiple fields', () => {
    const sort: VibeGridSortConfig[] = [
      { field: 'priority', direction: 'desc' },
      { field: 'status', direction: 'asc' },
    ]
    expect(convertVibeGridSortToQueryShape(sort)).toEqual([
      { field: 'priority', direction: 'desc' },
      { field: 'status', direction: 'asc' },
    ])
  })
})

// -------------------------------------------------------------------
// Filter — flat conditions array
// -------------------------------------------------------------------

describe('convertVibeGridFilterToFilterExpression — flat array', () => {
  it('returns undefined for null', () => {
    expect(convertVibeGridFilterToFilterExpression(null)).toBeUndefined()
  })

  it('returns undefined for undefined', () => {
    expect(convertVibeGridFilterToFilterExpression(undefined)).toBeUndefined()
  })

  it('returns undefined for empty array', () => {
    expect(convertVibeGridFilterToFilterExpression([])).toBeUndefined()
  })

  it('returns single leaf for one condition', () => {
    const filters: VibeGridFilterCondition[] = [
      { field: 'status', operator: 'equals', value: 'open' },
    ]
    expect(convertVibeGridFilterToFilterExpression(filters)).toEqual({
      op: 'eq',
      field: 'status',
      value: 'open',
    })
  })

  it('joins multiple conditions with AND', () => {
    const filters: VibeGridFilterCondition[] = [
      { field: 'status', operator: 'equals', value: 'open' },
      { field: 'priority', operator: 'greater_than', value: 3 },
    ]
    expect(convertVibeGridFilterToFilterExpression(filters)).toEqual({
      op: 'and',
      filters: [
        { op: 'eq', field: 'status', value: 'open' },
        { op: 'gt', field: 'priority', value: 3 },
      ],
    })
  })

  it('drops unsupported operators (regex)', () => {
    const filters: VibeGridFilterCondition[] = [
      { field: 'status', operator: 'equals', value: 'open' },
      { field: 'desc', operator: 'regex', value: '.*' },
    ]
    expect(convertVibeGridFilterToFilterExpression(filters)).toEqual({
      op: 'eq',
      field: 'status',
      value: 'open',
    })
  })

  it('returns undefined when ALL conditions are unsupported', () => {
    const filters: VibeGridFilterCondition[] = [
      { field: 'desc', operator: 'regex', value: '.*' },
      { field: 'desc', operator: 'not_contains', value: 'x' },
    ]
    expect(convertVibeGridFilterToFilterExpression(filters)).toBeUndefined()
  })
})

// -------------------------------------------------------------------
// Filter — operator translation
// -------------------------------------------------------------------

describe('operator translation', () => {
  it.each([
    ['equals', 'eq'],
    ['not_equals', 'neq'],
    ['contains', 'contains'],
    ['starts_with', 'starts_with'],
    ['greater_than', 'gt'],
    ['less_than', 'lt'],
  ] as const)('%s → %s preserves field+value', (vgOp, qsOp) => {
    const result = convertVibeGridFilterToFilterExpression([
      { field: 'f', operator: vgOp, value: 'v' },
    ])
    expect(result).toEqual({ op: qsOp, field: 'f', value: 'v' })
  })

  it('is_empty → is_null (no value)', () => {
    const result = convertVibeGridFilterToFilterExpression([
      { field: 'f', operator: 'is_empty', value: null },
    ])
    expect(result).toEqual({ op: 'is_null', field: 'f' })
  })

  it('is_not_empty → is_not_null (no value)', () => {
    const result = convertVibeGridFilterToFilterExpression([
      { field: 'f', operator: 'is_not_empty', value: null },
    ])
    expect(result).toEqual({ op: 'is_not_null', field: 'f' })
  })

  it('in → in with values array', () => {
    const result = convertVibeGridFilterToFilterExpression([
      { field: 'status', operator: 'in', value: ['open', 'pending'] },
    ])
    expect(result).toEqual({
      op: 'in',
      field: 'status',
      values: ['open', 'pending'],
    })
  })

  it('not_in → not_in with values array', () => {
    const result = convertVibeGridFilterToFilterExpression([
      { field: 'status', operator: 'not_in', value: ['void'] },
    ])
    expect(result).toEqual({ op: 'not_in', field: 'status', values: ['void'] })
  })

  it('between → between with range tuple', () => {
    const result = convertVibeGridFilterToFilterExpression([
      { field: 'priority', operator: 'between', value: [1, 5] },
    ])
    expect(result).toEqual({
      op: 'between',
      field: 'priority',
      range: [1, 5],
    })
  })

  it('between with non-array value drops the condition', () => {
    expect(
      convertVibeGridFilterToFilterExpression([
        { field: 'priority', operator: 'between', value: 5 },
      ]),
    ).toBeUndefined()
  })

  it('in with non-array value yields empty values array', () => {
    const result = convertVibeGridFilterToFilterExpression([
      { field: 'status', operator: 'in', value: 'open' },
    ])
    expect(result).toEqual({ op: 'in', field: 'status', values: [] })
  })
})

// -------------------------------------------------------------------
// Filter — FilterGroup (nested)
// -------------------------------------------------------------------

describe('convertVibeGridFilterToFilterExpression — FilterGroup', () => {
  it('AND group with two leaves', () => {
    const group: VibeGridFilterGroup = {
      logic: 'AND',
      conditions: [
        { field: 'status', operator: 'equals', value: 'open' },
        { field: 'priority', operator: 'greater_than', value: 3 },
      ],
    }
    expect(convertVibeGridFilterToFilterExpression(group)).toEqual({
      op: 'and',
      filters: [
        { op: 'eq', field: 'status', value: 'open' },
        { op: 'gt', field: 'priority', value: 3 },
      ],
    })
  })

  it('OR group preserves OR logic', () => {
    const group: VibeGridFilterGroup = {
      logic: 'OR',
      conditions: [
        { field: 'status', operator: 'equals', value: 'open' },
        { field: 'status', operator: 'equals', value: 'pending' },
      ],
    }
    expect(convertVibeGridFilterToFilterExpression(group)).toEqual({
      op: 'or',
      filters: [
        { op: 'eq', field: 'status', value: 'open' },
        { op: 'eq', field: 'status', value: 'pending' },
      ],
    })
  })

  it('nested AND(OR(eq,eq), gt)', () => {
    const group: VibeGridFilterGroup = {
      logic: 'AND',
      conditions: [
        {
          logic: 'OR',
          conditions: [
            { field: 'status', operator: 'equals', value: 'open' },
            { field: 'status', operator: 'equals', value: 'pending' },
          ],
        },
        { field: 'priority', operator: 'greater_than', value: 3 },
      ],
    }
    expect(convertVibeGridFilterToFilterExpression(group)).toEqual({
      op: 'and',
      filters: [
        {
          op: 'or',
          filters: [
            { op: 'eq', field: 'status', value: 'open' },
            { op: 'eq', field: 'status', value: 'pending' },
          ],
        },
        { op: 'gt', field: 'priority', value: 3 },
      ],
    })
  })

  it('empty group returns undefined', () => {
    const group: VibeGridFilterGroup = { logic: 'AND', conditions: [] }
    expect(convertVibeGridFilterToFilterExpression(group)).toBeUndefined()
  })

  it('group with single condition unwraps to leaf', () => {
    const group: VibeGridFilterGroup = {
      logic: 'AND',
      conditions: [{ field: 'status', operator: 'equals', value: 'open' }],
    }
    expect(convertVibeGridFilterToFilterExpression(group)).toEqual({
      op: 'eq',
      field: 'status',
      value: 'open',
    })
  })

  it('group with all unsupported operators returns undefined', () => {
    const group: VibeGridFilterGroup = {
      logic: 'AND',
      conditions: [
        { field: 'desc', operator: 'regex', value: '.*' },
        { field: 'desc', operator: 'ends_with', value: 'x' },
      ],
    }
    expect(convertVibeGridFilterToFilterExpression(group)).toBeUndefined()
  })
})
