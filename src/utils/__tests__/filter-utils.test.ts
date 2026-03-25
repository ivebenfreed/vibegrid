/**
 * Filter Utils Tests
 *
 * GH#216: Multi-Level Advanced Filtering for VibeGrid
 * GH#1391: Smart Text Search - applyTextSearch function
 *
 * Tests for filter evaluation functions:
 * - evaluateCondition: single condition evaluation
 * - evaluateFilterGroup: nested AND/OR group evaluation
 * - applyNestedFilters: apply filter group to row array
 * - applyTextSearch: global text search across text columns
 */

import { describe, expect, it } from 'vitest'
import { evaluateCondition, evaluateFilterGroup, applyNestedFilters, applyTextSearch } from '../filter-utils'
import type { FilterCondition, FilterGroup } from '../../types/filter-types'
import type { Column } from '../../types'

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

// ====================================
// APPLY TEXT SEARCH TESTS (GH#1391)
// ====================================

describe('applyTextSearch', () => {
  // Columns with various cell types - text types should be searchable by default
  const mockColumns: Column[] = [
    { id: 'name', field: 'name', name: 'Name', cellType: 'text' },
    { id: 'email', field: 'email', name: 'Email', cellType: 'email' },
    { id: 'phone', field: 'phone', name: 'Phone', cellType: 'phone' },
    { id: 'website', field: 'website', name: 'Website', cellType: 'url' },
    { id: 'status', field: 'status', name: 'Status', cellType: 'select' },
    { id: 'count', field: 'count', name: 'Count', cellType: 'number' },
    { id: 'description', field: 'description', name: 'Description', cellType: 'longtext' },
  ]

  const mockRows = [
    {
      name: 'John Doe',
      email: 'john@test.com',
      phone: '555-1234',
      website: 'https://john.dev',
      status: 'active',
      count: 10,
      description: 'A developer',
    },
    {
      name: 'Jane Smith',
      email: 'jane@example.com',
      phone: '555-5678',
      website: 'https://jane.io',
      status: 'inactive',
      count: 20,
      description: 'A designer',
    },
    {
      name: 'Bob Wilson',
      email: 'bob@test.org',
      phone: '555-9999',
      website: 'https://bob.dev',
      status: 'active',
      count: 30,
      description: 'A manager',
    },
  ]

  describe('basic text matching', () => {
    it('should filter rows by search text across text columns', () => {
      const result = applyTextSearch(mockRows, 'john', mockColumns)
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('John Doe')
    })

    it('should match across multiple columns', () => {
      // 'test' appears in john@test.com and bob@test.org
      const result = applyTextSearch(mockRows, 'test', mockColumns)
      expect(result).toHaveLength(2)
      expect(result.map((r) => r.name)).toContain('John Doe')
      expect(result.map((r) => r.name)).toContain('Bob Wilson')
    })

    it('should be case-insensitive', () => {
      expect(applyTextSearch(mockRows, 'JOHN', mockColumns)).toHaveLength(1)
      expect(applyTextSearch(mockRows, 'john', mockColumns)).toHaveLength(1)
      expect(applyTextSearch(mockRows, 'John', mockColumns)).toHaveLength(1)
      expect(applyTextSearch(mockRows, 'jOhN', mockColumns)).toHaveLength(1)
    })

    it('should handle partial word matches', () => {
      const result = applyTextSearch(mockRows, 'wil', mockColumns)
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('Bob Wilson')
    })

    it('should match email addresses', () => {
      const result = applyTextSearch(mockRows, '@example.com', mockColumns)
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('Jane Smith')
    })

    it('should match phone numbers', () => {
      const result = applyTextSearch(mockRows, '555-1234', mockColumns)
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('John Doe')
    })

    it('should match URLs', () => {
      const result = applyTextSearch(mockRows, '.dev', mockColumns)
      expect(result).toHaveLength(2) // john.dev and bob.dev
    })

    it('should match longtext fields', () => {
      const result = applyTextSearch(mockRows, 'developer', mockColumns)
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('John Doe')
    })
  })

  describe('empty and whitespace handling', () => {
    it('should return all rows when search is empty', () => {
      expect(applyTextSearch(mockRows, '', mockColumns)).toHaveLength(3)
    })

    it('should return all rows when search is whitespace only', () => {
      expect(applyTextSearch(mockRows, '   ', mockColumns)).toHaveLength(3)
      expect(applyTextSearch(mockRows, '\t\n', mockColumns)).toHaveLength(3)
    })

    it('should trim search text before matching', () => {
      const result = applyTextSearch(mockRows, '  john  ', mockColumns)
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('John Doe')
    })
  })

  describe('no matches', () => {
    it('should return empty array when no matches found', () => {
      const result = applyTextSearch(mockRows, 'xyz123nonexistent', mockColumns)
      expect(result).toHaveLength(0)
    })
  })

  describe('column type filtering', () => {
    it('should search select columns by raw value (no options array)', () => {
      // 'active' is in status (select type) - matches raw value when no options defined
      // 'active' is substring of 'inactive', so all 3 match
      const result = applyTextSearch(mockRows, 'active', mockColumns)
      expect(result).toHaveLength(3) // John='active', Jane='inactive' (contains 'active'), Bob='active'
    })

    it('should search select columns by option label when options defined', () => {
      const columnsWithOptions: Column[] = [
        {
          id: 'priority',
          field: 'status',
          name: 'Priority',
          cellType: 'select',
          options: [
            { value: 'active', label: 'High Priority' },
            { value: 'inactive', label: 'Low Priority' },
          ],
        },
      ]
      // Searches label not raw value: 'High' matches 'High Priority' (active), not 'Low Priority' (inactive)
      const result = applyTextSearch(mockRows, 'High', columnsWithOptions)
      expect(result).toHaveLength(2) // John and Bob (status 'active' → label 'High Priority')
    })

    it('should search number columns by default', () => {
      // '10' is in count (number type) - now searchable
      const result = applyTextSearch(mockRows, '10', mockColumns)
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('John Doe')
    })

    it('should not include boolean columns as searchable', () => {
      const boolColumns: Column[] = [{ id: 'isActive', field: 'isActive', name: 'Active', cellType: 'boolean' }]
      // Boolean-only columns are not searchable — no searchable columns means all rows returned
      const result = applyTextSearch(mockRows, 'true', boolColumns)
      expect(result).toHaveLength(3) // All rows returned (no searchable columns = no filtering)
    })

    it('should return all rows when no searchable columns exist', () => {
      const nonSearchableColumns: Column[] = [
        { id: 'isActive', field: 'isActive', name: 'Active', cellType: 'boolean' },
        { id: 'created', field: 'created', name: 'Created', cellType: 'date' },
        { id: 'file', field: 'file', name: 'File', cellType: 'file' },
      ]
      // When there are no searchable columns, returns all rows (no filtering applied)
      const result = applyTextSearch(mockRows, 'anything', nonSearchableColumns)
      expect(result).toHaveLength(3)
    })
  })

  describe('searchableColumnIds parameter', () => {
    it('should respect searchableColumnIds when provided', () => {
      // Search only 'name' column - 'test' should not match since it's in email
      const result = applyTextSearch(mockRows, 'test', mockColumns, ['name'])
      expect(result).toHaveLength(0)
    })

    it('should find matches when searchableColumnIds includes matching column', () => {
      const result = applyTextSearch(mockRows, 'John', mockColumns, ['name'])
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('John Doe')
    })

    it('should search multiple specific columns', () => {
      // Search both name and email
      const result = applyTextSearch(mockRows, 'john', mockColumns, ['name', 'email'])
      expect(result).toHaveLength(1) // Only John matches
    })

    it('should allow searching non-text columns when explicitly specified', () => {
      // When searchableColumnIds is provided, it filters columns by ID regardless of cellType
      // We need to verify the column lookup behavior
      const statusColumn = mockColumns.find((c) => c.id === 'status')
      expect(statusColumn).toBeDefined()
      expect(statusColumn?.cellType).toBe('select')

      // Now test the search - it should search only the 'status' column
      const result = applyTextSearch(mockRows, 'active', mockColumns, ['status'])

      // Debug: Check what we got
      // 'active' is in the status column for John and Bob
      // Jane has status='inactive' which should NOT match 'active'
      const matchingStatuses = mockRows.filter((r) => r.status === 'active')
      expect(matchingStatuses).toHaveLength(2) // John and Bob

      // The implementation searches case-insensitively with string.includes()
      // 'active' should match rows where status='active'
      // BUT 'inactive' does NOT contain 'active' as a substring... wait, it DOES!
      // 'inactive' contains 'active' as a substring!
      // So ALL three rows will match because 'inactive'.includes('active') === true
      expect(result).toHaveLength(3) // All three match because 'inactive' contains 'active'
    })
  })

  describe('nested data structure', () => {
    it('should handle rows with nested data property', () => {
      const nestedRows = [
        { id: '1', data: { name: 'Test User', email: 'test@email.com' } },
        { id: '2', data: { name: 'Other User', email: 'other@email.com' } },
      ]
      const result = applyTextSearch(nestedRows, 'test', mockColumns)
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('1')
    })

    it('should prefer flat row fields over nested data', () => {
      const mixedRows = [{ name: 'Direct Name', email: 'direct@email.com', data: { name: 'Nested Name' } }]
      const result = applyTextSearch(mixedRows, 'Direct', mockColumns)
      expect(result).toHaveLength(1)
    })
  })

  describe('null and undefined values', () => {
    it('should handle null values gracefully', () => {
      const rowsWithNulls = [
        { name: null, email: 'test@email.com', phone: null, website: null, description: null },
        { name: 'Test', email: undefined, phone: null, website: null, description: null },
        {
          name: 'John',
          email: 'john@test.com',
          phone: '555',
          website: 'http://x',
          description: 'hi',
        },
      ]
      // 'test' matches email in row 1 ('test@email.com'), name in row 2 ('Test'),
      // and email in row 3 ('john@test.com' contains 'test')
      const result = applyTextSearch(rowsWithNulls, 'test', mockColumns)
      expect(result).toHaveLength(3) // All three match
    })

    it('should handle undefined values gracefully', () => {
      const rowsWithUndefined = [
        { name: undefined, email: 'search@here.com' },
        { name: 'Visible', email: undefined },
      ]
      const result = applyTextSearch(rowsWithUndefined, 'search', mockColumns)
      expect(result).toHaveLength(1)
    })

    it('should not match on null/undefined values', () => {
      const rowsWithNulls = [
        { name: null, email: null },
        { name: undefined, email: undefined },
      ]
      const result = applyTextSearch(rowsWithNulls, 'null', mockColumns)
      expect(result).toHaveLength(0)
    })
  })

  describe('edge cases', () => {
    it('should handle empty rows array', () => {
      const result = applyTextSearch([], 'test', mockColumns)
      expect(result).toHaveLength(0)
    })

    it('should handle empty columns array', () => {
      const result = applyTextSearch(mockRows, 'test', [])
      expect(result).toHaveLength(3) // Returns all rows when no columns to search
    })

    it('should handle special regex characters in search text', () => {
      const rowsWithSpecialChars = [
        { name: 'Test (with) parens', email: 'test@email.com' },
        { name: 'Test [with] brackets', email: 'other@email.com' },
        { name: 'Test $pecial', email: 'special@email.com' },
      ]
      // These should work because we use string.includes(), not regex
      expect(applyTextSearch(rowsWithSpecialChars, '(with)', mockColumns)).toHaveLength(1)
      expect(applyTextSearch(rowsWithSpecialChars, '[with]', mockColumns)).toHaveLength(1)
      expect(applyTextSearch(rowsWithSpecialChars, '$pecial', mockColumns)).toHaveLength(1)
    })

    it('should preserve row order', () => {
      // Search for '.com' - only John and Jane have .com in their emails
      // John: john@test.com (matches)
      // Jane: jane@example.com (matches)
      // Bob: bob@test.org (no .com)
      const result = applyTextSearch(mockRows, '.com', mockColumns)
      expect(result).toHaveLength(2)
      expect(result[0].name).toBe('John Doe')
      expect(result[1].name).toBe('Jane Smith')
    })

    it('should handle columns with field different from id', () => {
      const columnsWithDifferentField: Column[] = [
        { id: 'userName', field: 'name', name: 'User Name', cellType: 'text' },
      ]
      const result = applyTextSearch(mockRows, 'John', columnsWithDifferentField)
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('John Doe')
    })
  })
})
