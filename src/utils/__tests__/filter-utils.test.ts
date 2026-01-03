/**
 * Filter Utils Tests
 *
 * GH#216: Multi-Level Advanced Filtering for VibeGrid
 *
 * Tests for filter evaluation functions:
 * - evaluateCondition: single condition evaluation
 * - evaluateFilterGroup: nested AND/OR group evaluation
 * - applyNestedFilters: apply filter group to row array
 */

import { describe, expect, it } from 'vitest'
import { evaluateCondition, evaluateFilterGroup, applyNestedFilters } from '../filter-utils'
import type { FilterCondition, FilterGroup } from '../../types/filter-types'

// ====================================
// EVALUATE CONDITION TESTS
// ====================================

describe('evaluateCondition', () => {
  describe('equals operator', () => {
    it('should match equal values', () => {
      const row = { status: 'active' }
      const condition: FilterCondition = {
        id: '1',
        field: 'status',
        operator: 'equals',
        value: 'active',
      }
      expect(evaluateCondition(row, condition)).toBe(true)
    })

    it('should not match different values', () => {
      const row = { status: 'inactive' }
      const condition: FilterCondition = {
        id: '1',
        field: 'status',
        operator: 'equals',
        value: 'active',
      }
      expect(evaluateCondition(row, condition)).toBe(false)
    })

    it('should handle null values', () => {
      const row = { status: null }
      const condition: FilterCondition = {
        id: '1',
        field: 'status',
        operator: 'equals',
        value: null,
      }
      expect(evaluateCondition(row, condition)).toBe(true)
    })
  })

  describe('not_equals operator', () => {
    it('should match different values', () => {
      const row = { status: 'inactive' }
      const condition: FilterCondition = {
        id: '1',
        field: 'status',
        operator: 'not_equals',
        value: 'active',
      }
      expect(evaluateCondition(row, condition)).toBe(true)
    })

    it('should not match equal values', () => {
      const row = { status: 'active' }
      const condition: FilterCondition = {
        id: '1',
        field: 'status',
        operator: 'not_equals',
        value: 'active',
      }
      expect(evaluateCondition(row, condition)).toBe(false)
    })
  })

  describe('contains operator', () => {
    it('should match substring (case-insensitive)', () => {
      const row = { name: 'Hello World' }
      const condition: FilterCondition = {
        id: '1',
        field: 'name',
        operator: 'contains',
        value: 'WORLD',
      }
      expect(evaluateCondition(row, condition)).toBe(true)
    })

    it('should not match if substring not found', () => {
      const row = { name: 'Hello World' }
      const condition: FilterCondition = {
        id: '1',
        field: 'name',
        operator: 'contains',
        value: 'foo',
      }
      expect(evaluateCondition(row, condition)).toBe(false)
    })

    it('should be case-sensitive when option set', () => {
      const row = { name: 'Hello World' }
      const condition: FilterCondition = {
        id: '1',
        field: 'name',
        operator: 'contains',
        value: 'WORLD',
        caseSensitive: true,
      }
      expect(evaluateCondition(row, condition)).toBe(false)
    })

    it('should handle null value gracefully', () => {
      const row = { name: null }
      const condition: FilterCondition = {
        id: '1',
        field: 'name',
        operator: 'contains',
        value: 'test',
      }
      expect(evaluateCondition(row, condition)).toBe(false)
    })
  })

  describe('not_contains operator', () => {
    it('should not match if substring found', () => {
      const row = { name: 'Hello World' }
      const condition: FilterCondition = {
        id: '1',
        field: 'name',
        operator: 'not_contains',
        value: 'World',
      }
      expect(evaluateCondition(row, condition)).toBe(false)
    })

    it('should match if substring not found', () => {
      const row = { name: 'Hello World' }
      const condition: FilterCondition = {
        id: '1',
        field: 'name',
        operator: 'not_contains',
        value: 'foo',
      }
      expect(evaluateCondition(row, condition)).toBe(true)
    })
  })

  describe('starts_with operator', () => {
    it('should match if value starts with prefix', () => {
      const row = { name: 'Hello World' }
      const condition: FilterCondition = {
        id: '1',
        field: 'name',
        operator: 'starts_with',
        value: 'hello',
      }
      expect(evaluateCondition(row, condition)).toBe(true)
    })

    it('should not match if value does not start with prefix', () => {
      const row = { name: 'Hello World' }
      const condition: FilterCondition = {
        id: '1',
        field: 'name',
        operator: 'starts_with',
        value: 'world',
      }
      expect(evaluateCondition(row, condition)).toBe(false)
    })
  })

  describe('ends_with operator', () => {
    it('should match if value ends with suffix', () => {
      const row = { name: 'Hello World' }
      const condition: FilterCondition = {
        id: '1',
        field: 'name',
        operator: 'ends_with',
        value: 'WORLD',
      }
      expect(evaluateCondition(row, condition)).toBe(true)
    })

    it('should not match if value does not end with suffix', () => {
      const row = { name: 'Hello World' }
      const condition: FilterCondition = {
        id: '1',
        field: 'name',
        operator: 'ends_with',
        value: 'hello',
      }
      expect(evaluateCondition(row, condition)).toBe(false)
    })
  })

  describe('greater_than operator', () => {
    it('should match if value is greater', () => {
      const row = { count: 10 }
      const condition: FilterCondition = {
        id: '1',
        field: 'count',
        operator: 'greater_than',
        value: 5,
      }
      expect(evaluateCondition(row, condition)).toBe(true)
    })

    it('should not match if value is equal', () => {
      const row = { count: 5 }
      const condition: FilterCondition = {
        id: '1',
        field: 'count',
        operator: 'greater_than',
        value: 5,
      }
      expect(evaluateCondition(row, condition)).toBe(false)
    })

    it('should not match if value is less', () => {
      const row = { count: 3 }
      const condition: FilterCondition = {
        id: '1',
        field: 'count',
        operator: 'greater_than',
        value: 5,
      }
      expect(evaluateCondition(row, condition)).toBe(false)
    })
  })

  describe('less_than operator', () => {
    it('should match if value is less', () => {
      const row = { count: 3 }
      const condition: FilterCondition = {
        id: '1',
        field: 'count',
        operator: 'less_than',
        value: 5,
      }
      expect(evaluateCondition(row, condition)).toBe(true)
    })

    it('should not match if value is equal', () => {
      const row = { count: 5 }
      const condition: FilterCondition = {
        id: '1',
        field: 'count',
        operator: 'less_than',
        value: 5,
      }
      expect(evaluateCondition(row, condition)).toBe(false)
    })

    it('should not match if value is greater', () => {
      const row = { count: 10 }
      const condition: FilterCondition = {
        id: '1',
        field: 'count',
        operator: 'less_than',
        value: 5,
      }
      expect(evaluateCondition(row, condition)).toBe(false)
    })
  })

  describe('is_empty operator', () => {
    it('should match null', () => {
      const row = { name: null }
      const condition: FilterCondition = {
        id: '1',
        field: 'name',
        operator: 'is_empty',
        value: null,
      }
      expect(evaluateCondition(row, condition)).toBe(true)
    })

    it('should match undefined', () => {
      const row = { name: undefined }
      const condition: FilterCondition = {
        id: '1',
        field: 'name',
        operator: 'is_empty',
        value: null,
      }
      expect(evaluateCondition(row, condition)).toBe(true)
    })

    it('should match empty string', () => {
      const row = { name: '' }
      const condition: FilterCondition = {
        id: '1',
        field: 'name',
        operator: 'is_empty',
        value: null,
      }
      expect(evaluateCondition(row, condition)).toBe(true)
    })

    it('should not match non-empty value', () => {
      const row = { name: 'test' }
      const condition: FilterCondition = {
        id: '1',
        field: 'name',
        operator: 'is_empty',
        value: null,
      }
      expect(evaluateCondition(row, condition)).toBe(false)
    })
  })

  describe('is_not_empty operator', () => {
    it('should match non-empty value', () => {
      const row = { name: 'test' }
      const condition: FilterCondition = {
        id: '1',
        field: 'name',
        operator: 'is_not_empty',
        value: null,
      }
      expect(evaluateCondition(row, condition)).toBe(true)
    })

    it('should not match null', () => {
      const row = { name: null }
      const condition: FilterCondition = {
        id: '1',
        field: 'name',
        operator: 'is_not_empty',
        value: null,
      }
      expect(evaluateCondition(row, condition)).toBe(false)
    })
  })

  describe('in operator', () => {
    it('should match if value is in array', () => {
      const row = { status: 'active' }
      const condition: FilterCondition = {
        id: '1',
        field: 'status',
        operator: 'in',
        value: ['active', 'pending'],
      }
      expect(evaluateCondition(row, condition)).toBe(true)
    })

    it('should not match if value is not in array', () => {
      const row = { status: 'inactive' }
      const condition: FilterCondition = {
        id: '1',
        field: 'status',
        operator: 'in',
        value: ['active', 'pending'],
      }
      expect(evaluateCondition(row, condition)).toBe(false)
    })
  })

  describe('not_in operator', () => {
    it('should match if value is not in array', () => {
      const row = { status: 'inactive' }
      const condition: FilterCondition = {
        id: '1',
        field: 'status',
        operator: 'not_in',
        value: ['active', 'pending'],
      }
      expect(evaluateCondition(row, condition)).toBe(true)
    })

    it('should not match if value is in array', () => {
      const row = { status: 'active' }
      const condition: FilterCondition = {
        id: '1',
        field: 'status',
        operator: 'not_in',
        value: ['active', 'pending'],
      }
      expect(evaluateCondition(row, condition)).toBe(false)
    })
  })

  describe('regex operator', () => {
    it('should match valid regex pattern', () => {
      const row = { email: 'test@example.com' }
      const condition: FilterCondition = {
        id: '1',
        field: 'email',
        operator: 'regex',
        value: '.*@example\\.com',
      }
      expect(evaluateCondition(row, condition)).toBe(true)
    })

    it('should not match if regex does not match', () => {
      const row = { email: 'test@other.com' }
      const condition: FilterCondition = {
        id: '1',
        field: 'email',
        operator: 'regex',
        value: '.*@example\\.com',
      }
      expect(evaluateCondition(row, condition)).toBe(false)
    })

    it('should return false for invalid regex', () => {
      const row = { name: 'test' }
      const condition: FilterCondition = {
        id: '1',
        field: 'name',
        operator: 'regex',
        value: '[invalid',
      }
      expect(evaluateCondition(row, condition)).toBe(false)
    })
  })

  describe('nested data structure', () => {
    it('should access data property if present', () => {
      const row = { id: '1', data: { status: 'active' } }
      const condition: FilterCondition = {
        id: '1',
        field: 'status',
        operator: 'equals',
        value: 'active',
      }
      expect(evaluateCondition(row, condition)).toBe(true)
    })
  })
})

// ====================================
// EVALUATE FILTER GROUP TESTS
// ====================================

describe('evaluateFilterGroup', () => {
  describe('empty group', () => {
    it('should return true for empty conditions', () => {
      const row = { status: 'active' }
      const group: FilterGroup = { logic: 'AND', conditions: [] }
      expect(evaluateFilterGroup(row, group)).toBe(true)
    })
  })

  describe('AND logic', () => {
    it('should return true when all conditions match', () => {
      const row = { status: 'active', priority: 'high' }
      const group: FilterGroup = {
        logic: 'AND',
        conditions: [
          { id: '1', field: 'status', operator: 'equals', value: 'active' },
          { id: '2', field: 'priority', operator: 'equals', value: 'high' },
        ],
      }
      expect(evaluateFilterGroup(row, group)).toBe(true)
    })

    it('should return false when one condition does not match', () => {
      const row = { status: 'active', priority: 'low' }
      const group: FilterGroup = {
        logic: 'AND',
        conditions: [
          { id: '1', field: 'status', operator: 'equals', value: 'active' },
          { id: '2', field: 'priority', operator: 'equals', value: 'high' },
        ],
      }
      expect(evaluateFilterGroup(row, group)).toBe(false)
    })
  })

  describe('OR logic', () => {
    it('should return true when at least one condition matches', () => {
      const row = { status: 'inactive', priority: 'high' }
      const group: FilterGroup = {
        logic: 'OR',
        conditions: [
          { id: '1', field: 'status', operator: 'equals', value: 'active' },
          { id: '2', field: 'priority', operator: 'equals', value: 'high' },
        ],
      }
      expect(evaluateFilterGroup(row, group)).toBe(true)
    })

    it('should return false when no conditions match', () => {
      const row = { status: 'inactive', priority: 'low' }
      const group: FilterGroup = {
        logic: 'OR',
        conditions: [
          { id: '1', field: 'status', operator: 'equals', value: 'active' },
          { id: '2', field: 'priority', operator: 'equals', value: 'high' },
        ],
      }
      expect(evaluateFilterGroup(row, group)).toBe(false)
    })
  })

  describe('nested groups', () => {
    it('should evaluate nested groups correctly', () => {
      // status = active AND (priority = high OR priority = critical)
      const row = { status: 'active', priority: 'critical' }
      const group: FilterGroup = {
        logic: 'AND',
        conditions: [
          { id: '1', field: 'status', operator: 'equals', value: 'active' },
          {
            logic: 'OR',
            conditions: [
              { id: '2', field: 'priority', operator: 'equals', value: 'high' },
              { id: '3', field: 'priority', operator: 'equals', value: 'critical' },
            ],
          },
        ],
      }
      expect(evaluateFilterGroup(row, group)).toBe(true)
    })

    it('should handle deeply nested groups', () => {
      // AND
      //   - status = active
      //   - OR
      //       - priority = high
      //       - AND
      //           - type = bug
      //           - severity = major
      const row = { status: 'active', priority: 'low', type: 'bug', severity: 'major' }
      const group: FilterGroup = {
        logic: 'AND',
        conditions: [
          { id: '1', field: 'status', operator: 'equals', value: 'active' },
          {
            logic: 'OR',
            conditions: [
              { id: '2', field: 'priority', operator: 'equals', value: 'high' },
              {
                logic: 'AND',
                conditions: [
                  { id: '3', field: 'type', operator: 'equals', value: 'bug' },
                  { id: '4', field: 'severity', operator: 'equals', value: 'major' },
                ],
              },
            ],
          },
        ],
      }
      expect(evaluateFilterGroup(row, group)).toBe(true)
    })
  })

  describe('incomplete conditions', () => {
    it('should skip conditions without field set', () => {
      const row = { status: 'active' }
      const group: FilterGroup = {
        logic: 'AND',
        conditions: [
          { id: '1', field: '', operator: 'equals', value: 'something' }, // incomplete
          { id: '2', field: 'status', operator: 'equals', value: 'active' },
        ],
      }
      expect(evaluateFilterGroup(row, group)).toBe(true)
    })
  })
})

// ====================================
// APPLY NESTED FILTERS TESTS
// ====================================

describe('applyNestedFilters', () => {
  const testRows = [
    { id: '1', status: 'active', priority: 'high', type: 'task' },
    { id: '2', status: 'active', priority: 'low', type: 'bug' },
    { id: '3', status: 'inactive', priority: 'high', type: 'task' },
    { id: '4', status: 'inactive', priority: 'low', type: 'bug' },
  ]

  it('should return all rows when filterGroup is null', () => {
    const result = applyNestedFilters(testRows, null)
    expect(result).toHaveLength(4)
  })

  it('should return all rows when filterGroup has no conditions', () => {
    const group: FilterGroup = { logic: 'AND', conditions: [] }
    const result = applyNestedFilters(testRows, group)
    expect(result).toHaveLength(4)
  })

  it('should filter rows matching single condition', () => {
    const group: FilterGroup = {
      logic: 'AND',
      conditions: [{ id: '1', field: 'status', operator: 'equals', value: 'active' }],
    }
    const result = applyNestedFilters(testRows, group)
    expect(result).toHaveLength(2)
    expect(result.every((r) => r.status === 'active')).toBe(true)
  })

  it('should filter rows matching AND conditions', () => {
    const group: FilterGroup = {
      logic: 'AND',
      conditions: [
        { id: '1', field: 'status', operator: 'equals', value: 'active' },
        { id: '2', field: 'priority', operator: 'equals', value: 'high' },
      ],
    }
    const result = applyNestedFilters(testRows, group)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('1')
  })

  it('should filter rows matching OR conditions', () => {
    const group: FilterGroup = {
      logic: 'OR',
      conditions: [
        { id: '1', field: 'priority', operator: 'equals', value: 'high' },
        { id: '2', field: 'type', operator: 'equals', value: 'bug' },
      ],
    }
    const result = applyNestedFilters(testRows, group)
    expect(result).toHaveLength(4)
  })

  it('should filter rows with nested groups', () => {
    // status = active AND (priority = high OR type = bug)
    const group: FilterGroup = {
      logic: 'AND',
      conditions: [
        { id: '1', field: 'status', operator: 'equals', value: 'active' },
        {
          logic: 'OR',
          conditions: [
            { id: '2', field: 'priority', operator: 'equals', value: 'high' },
            { id: '3', field: 'type', operator: 'equals', value: 'bug' },
          ],
        },
      ],
    }
    const result = applyNestedFilters(testRows, group)
    expect(result).toHaveLength(2)
    expect(result.map((r) => r.id)).toEqual(['1', '2'])
  })

  it('should preserve row order', () => {
    const group: FilterGroup = {
      logic: 'AND',
      conditions: [{ id: '1', field: 'status', operator: 'equals', value: 'inactive' }],
    }
    const result = applyNestedFilters(testRows, group)
    expect(result[0].id).toBe('3')
    expect(result[1].id).toBe('4')
  })
})
