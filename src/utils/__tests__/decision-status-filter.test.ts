/**
 * Decision Status Filter Tests
 *
 * GH#1693: computed_decision_table field type
 *
 * Tests for the decision_status filter operator in evaluateCondition.
 * The decision_status operator filters computed_decision_table fields
 * by their pass/fail/pending status.
 */

import { describe, expect, it } from 'vitest'
import { evaluateCondition, evaluateFilterGroup, applyNestedFilters } from '../filter-utils'
import type { FilterCondition, FilterGroup } from '../../types/filter-types'

// ============================================================================
// Test helpers
// ============================================================================

function makeCondition(field: string, value: string): FilterCondition {
  return {
    id: '1',
    field,
    operator: 'decision_status',
    value,
  }
}

function makePassRecord(score = 94) {
  return {
    id: 'rec-1',
    compliance_check: {
      status: 'pass',
      score,
      violations: [],
    },
  }
}

function makeFailRecord(score = 48) {
  return {
    id: 'rec-2',
    compliance_check: {
      status: 'fail',
      score,
      violations: ['Below minimum'],
    },
  }
}

function makePendingRecord() {
  return {
    id: 'rec-3',
    compliance_check: {
      status: 'pending',
      score: 0,
      violations: [],
    },
  }
}

function makeNullRecord() {
  return {
    id: 'rec-4',
    compliance_check: null,
  }
}

function makeMissingFieldRecord() {
  return {
    id: 'rec-5',
    // no compliance_check field at all
  }
}

// ============================================================================
// decision_status operator tests
// ============================================================================

describe('evaluateCondition - decision_status operator', () => {
  describe('value = "pass"', () => {
    it('should match records where status === pass', () => {
      const row = makePassRecord()
      const condition = makeCondition('compliance_check', 'pass')
      expect(evaluateCondition(row, condition)).toBe(true)
    })

    it('should not match records where status === fail', () => {
      const row = makeFailRecord()
      const condition = makeCondition('compliance_check', 'pass')
      expect(evaluateCondition(row, condition)).toBe(false)
    })

    it('should not match records where status === pending', () => {
      const row = makePendingRecord()
      const condition = makeCondition('compliance_check', 'pass')
      expect(evaluateCondition(row, condition)).toBe(false)
    })

    it('should not match records where field is null', () => {
      const row = makeNullRecord()
      const condition = makeCondition('compliance_check', 'pass')
      expect(evaluateCondition(row, condition)).toBe(false)
    })

    it('should not match records where field is missing', () => {
      const row = makeMissingFieldRecord()
      const condition = makeCondition('compliance_check', 'pass')
      expect(evaluateCondition(row, condition)).toBe(false)
    })
  })

  describe('value = "fail"', () => {
    it('should match records where status === fail', () => {
      const row = makeFailRecord()
      const condition = makeCondition('compliance_check', 'fail')
      expect(evaluateCondition(row, condition)).toBe(true)
    })

    it('should not match records where status === pass', () => {
      const row = makePassRecord()
      const condition = makeCondition('compliance_check', 'fail')
      expect(evaluateCondition(row, condition)).toBe(false)
    })

    it('should not match records where status === pending', () => {
      const row = makePendingRecord()
      const condition = makeCondition('compliance_check', 'fail')
      expect(evaluateCondition(row, condition)).toBe(false)
    })

    it('should not match records where field is null', () => {
      const row = makeNullRecord()
      const condition = makeCondition('compliance_check', 'fail')
      expect(evaluateCondition(row, condition)).toBe(false)
    })
  })

  describe('value = "pending"', () => {
    it('should match records where status === pending', () => {
      const row = makePendingRecord()
      const condition = makeCondition('compliance_check', 'pending')
      expect(evaluateCondition(row, condition)).toBe(true)
    })

    it('should match records where field is null', () => {
      const row = makeNullRecord()
      const condition = makeCondition('compliance_check', 'pending')
      expect(evaluateCondition(row, condition)).toBe(true)
    })

    it('should match records where field is missing (undefined)', () => {
      const row = makeMissingFieldRecord()
      const condition = makeCondition('compliance_check', 'pending')
      expect(evaluateCondition(row, condition)).toBe(true)
    })

    it('should not match records where status === pass', () => {
      const row = makePassRecord()
      const condition = makeCondition('compliance_check', 'pending')
      expect(evaluateCondition(row, condition)).toBe(false)
    })

    it('should not match records where status === fail', () => {
      const row = makeFailRecord()
      const condition = makeCondition('compliance_check', 'pending')
      expect(evaluateCondition(row, condition)).toBe(false)
    })
  })

  describe('invalid value', () => {
    it('should return false for an unknown status value', () => {
      const row = makePassRecord()
      const condition = makeCondition('compliance_check', 'unknown')
      expect(evaluateCondition(row, condition)).toBe(false)
    })
  })

  describe('nested data (row.data)', () => {
    it('should read from row.data when present', () => {
      const row = {
        data: {
          compliance_check: {
            status: 'fail',
            score: 30,
            violations: [],
          },
        },
      }
      const condition = makeCondition('compliance_check', 'fail')
      expect(evaluateCondition(row, condition)).toBe(true)
    })
  })
})

// ============================================================================
// Integration with filter groups
// ============================================================================

describe('decision_status in filter groups', () => {
  it('should work in an AND group with other conditions', () => {
    const rows = [makePassRecord(), makeFailRecord(), makePendingRecord()]

    const group: FilterGroup = {
      logic: 'AND',
      conditions: [
        makeCondition('compliance_check', 'fail'),
        {
          id: '2',
          field: 'id',
          operator: 'equals',
          value: 'rec-2',
        },
      ],
    }

    const result = applyNestedFilters(rows, group)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('rec-2')
  })

  it('should work in an OR group to match pass or pending', () => {
    const rows = [makePassRecord(), makeFailRecord(), makePendingRecord()]

    const group: FilterGroup = {
      logic: 'OR',
      conditions: [
        makeCondition('compliance_check', 'pass'),
        makeCondition('compliance_check', 'pending'),
      ],
    }

    const result = applyNestedFilters(rows, group)
    expect(result).toHaveLength(2)
    expect(result.map((r: any) => r.id)).toEqual(['rec-1', 'rec-3'])
  })

  it('should filter only failing records (saved view pattern)', () => {
    const rows = [
      makePassRecord(),
      makeFailRecord(),
      makePendingRecord(),
      makeNullRecord(),
      makeMissingFieldRecord(),
    ]

    const group: FilterGroup = {
      logic: 'AND',
      conditions: [makeCondition('compliance_check', 'fail')],
    }

    const result = applyNestedFilters(rows, group)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('rec-2')
  })
})
