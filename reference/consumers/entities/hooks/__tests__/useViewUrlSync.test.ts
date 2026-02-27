/**
 * Tests for useViewUrlSync serialization helpers (GH#1570)
 *
 * Tests the pure serialization/deserialization functions that convert
 * between URL search params and VibeGrid store state.
 */

import { describe, expect, it } from 'vitest'
import {
  serializeSort,
  deserializeSort,
  serializeFilters,
  deserializeFilters,
  serializeGroup,
} from '../useViewUrlSync'

// ====================================
// serializeSort
// ====================================

describe('serializeSort', () => {
  it('returns undefined for empty array', () => {
    expect(serializeSort([])).toBeUndefined()
  })

  it('returns undefined for null/undefined input', () => {
    expect(serializeSort(null as any)).toBeUndefined()
    expect(serializeSort(undefined as any)).toBeUndefined()
  })

  it('serializes single sort config to "field:direction"', () => {
    expect(serializeSort([{ field: 'due_date', direction: 'desc' }])).toBe('due_date:desc')
    expect(serializeSort([{ field: 'name', direction: 'asc' }])).toBe('name:asc')
  })

  it('only serializes first sort config (multi-sort not supported in URL)', () => {
    const result = serializeSort([
      { field: 'status', direction: 'asc' },
      { field: 'name', direction: 'desc' },
    ])
    expect(result).toBe('status:asc')
  })
})

// ====================================
// deserializeSort
// ====================================

describe('deserializeSort', () => {
  it('returns null for undefined input', () => {
    expect(deserializeSort(undefined)).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(deserializeSort('')).toBeNull()
  })

  it('returns null for invalid format (no colon)', () => {
    expect(deserializeSort('nameonly')).toBeNull()
  })

  it('returns null for invalid direction', () => {
    expect(deserializeSort('name:invalid')).toBeNull()
    expect(deserializeSort('name:ASC')).toBeNull()
  })

  it('deserializes valid sort param', () => {
    expect(deserializeSort('due_date:desc')).toEqual([{ field: 'due_date', direction: 'desc' }])
    expect(deserializeSort('name:asc')).toEqual([{ field: 'name', direction: 'asc' }])
  })

  it('returns null for too many colons', () => {
    expect(deserializeSort('a:b:c')).toBeNull()
  })
})

// ====================================
// serializeSort <-> deserializeSort roundtrip
// ====================================

describe('sort roundtrip', () => {
  it('roundtrips single sort config', () => {
    const original = [{ field: 'created_at', direction: 'desc' as const }]
    const serialized = serializeSort(original)
    const deserialized = deserializeSort(serialized)
    expect(deserialized).toEqual(original)
  })
})

// ====================================
// serializeFilters
// ====================================

describe('serializeFilters', () => {
  it('returns undefined for empty array', () => {
    expect(serializeFilters([])).toBeUndefined()
  })

  it('returns undefined for null/undefined input', () => {
    expect(serializeFilters(null as any)).toBeUndefined()
    expect(serializeFilters(undefined as any)).toBeUndefined()
  })

  it('serializes filters to JSON string', () => {
    const filters = [{ field: 'status', operator: 'equals' as const, value: 'active' }]
    const result = serializeFilters(filters)
    expect(result).toBe(JSON.stringify(filters))
  })

  it('handles complex filter arrays', () => {
    const filters = [
      { field: 'status', operator: 'equals' as const, value: 'active' },
      { field: 'priority', operator: 'greater_than' as const, value: 5 },
    ]
    const result = serializeFilters(filters)
    expect(result).toBeDefined()
    expect(JSON.parse(result!)).toEqual(filters)
  })
})

// ====================================
// deserializeFilters
// ====================================

describe('deserializeFilters', () => {
  it('returns null for undefined input', () => {
    expect(deserializeFilters(undefined)).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(deserializeFilters('')).toBeNull()
  })

  it('returns null for invalid JSON', () => {
    expect(deserializeFilters('not-json')).toBeNull()
  })

  it('returns null for non-array JSON', () => {
    expect(deserializeFilters('{"key": "value"}')).toBeNull()
    expect(deserializeFilters('"string"')).toBeNull()
    expect(deserializeFilters('42')).toBeNull()
  })

  it('deserializes valid filter JSON array', () => {
    const filters = [{ field: 'status', operator: 'equals', value: 'active' }]
    const result = deserializeFilters(JSON.stringify(filters))
    expect(result).toEqual(filters)
  })
})

// ====================================
// filters roundtrip
// ====================================

describe('filters roundtrip', () => {
  it('roundtrips filter configs', () => {
    const original = [
      { field: 'status', operator: 'equals' as const, value: 'active' },
      { field: 'name', operator: 'contains' as const, value: 'test' },
    ]
    const serialized = serializeFilters(original)
    const deserialized = deserializeFilters(serialized)
    expect(deserialized).toEqual(original)
  })
})

// ====================================
// serializeGroup
// ====================================

describe('serializeGroup', () => {
  it('returns undefined for null config', () => {
    expect(serializeGroup(null)).toBeUndefined()
  })

  it('returns undefined for config with empty fields', () => {
    expect(serializeGroup({ fields: [] })).toBeUndefined()
  })

  it('returns field name of first group field', () => {
    expect(serializeGroup({ fields: [{ field: 'status' }] })).toBe('status')
  })

  it('only returns first field name (multi-group not supported in URL)', () => {
    const result = serializeGroup({
      fields: [{ field: 'status' }, { field: 'priority' }],
    })
    expect(result).toBe('status')
  })

  it('returns undefined when fields property is missing', () => {
    expect(serializeGroup({ fields: undefined as any })).toBeUndefined()
  })
})
