import { describe, expect, it } from 'vitest'
import { compareValues, isEmpty } from '../../utils/sort-compare'

type SortConfig = { field: string; direction: 'asc' | 'desc' }

function applySorting(rows: any[], sortBy: SortConfig[]): any[] {
  if (!sortBy || sortBy.length === 0) return rows
  return [...rows].sort((a, b) => {
    for (const sort of sortBy) {
      const aVal = a[sort.field]
      const bVal = b[sort.field]
      const comparison = compareValues(aVal, bVal)
      if (comparison === 0) continue
      const aEmpty = isEmpty(aVal)
      const bEmpty = isEmpty(bVal)
      if (aEmpty || bEmpty) return comparison
      return sort.direction === 'asc' ? comparison : -comparison
    }
    return 0
  })
}

describe('VIbeGrid sorting', () => {
  describe('null/empty handling', () => {
    it('sorts nulls last in ascending order', () => {
      const rows = [{ name: null }, { name: 'Beta' }, { name: 'Alpha' }, { name: undefined }, { name: '' }]
      const sorted = applySorting(rows, [{ field: 'name', direction: 'asc' }])
      expect(sorted.map((r) => r.name)).toEqual(['Alpha', 'Beta', null, undefined, ''])
    })

    it('sorts nulls last in descending order', () => {
      const rows = [{ name: null }, { name: 'Beta' }, { name: 'Alpha' }, { name: undefined }]
      const sorted = applySorting(rows, [{ field: 'name', direction: 'desc' }])
      expect(sorted.map((r) => r.name)).toEqual(['Beta', 'Alpha', null, undefined])
    })
  })

  describe('case-insensitive sorting', () => {
    it('sorts strings case-insensitively', () => {
      const rows = [{ name: 'banana' }, { name: 'Apple' }, { name: 'cherry' }, { name: 'AVOCADO' }]
      const sorted = applySorting(rows, [{ field: 'name', direction: 'asc' }])
      const names = sorted.map((r) => r.name)
      expect(names).toEqual(['Apple', 'AVOCADO', 'banana', 'cherry'])
    })
  })

  describe('natural number sorting', () => {
    it('sorts numeric strings naturally (not lexicographically)', () => {
      const rows = [{ code: '9' }, { code: '10' }, { code: '2' }, { code: '100' }, { code: '1' }]
      const sorted = applySorting(rows, [{ field: 'code', direction: 'asc' }])
      expect(sorted.map((r) => r.code)).toEqual(['1', '2', '9', '10', '100'])
    })

    it('sorts mixed alpha-numeric strings naturally', () => {
      const rows = [{ name: 'Item 10' }, { name: 'Item 2' }, { name: 'Item 1' }, { name: 'Item 20' }]
      const sorted = applySorting(rows, [{ field: 'name', direction: 'asc' }])
      expect(sorted.map((r) => r.name)).toEqual(['Item 1', 'Item 2', 'Item 10', 'Item 20'])
    })

    it('sorts numbers starting names before letters', () => {
      const rows = [{ name: 'Zebra' }, { name: '2020 Work Orders' }, { name: 'Alpha' }, { name: '100 Main St' }]
      const sorted = applySorting(rows, [{ field: 'name', direction: 'asc' }])
      expect(sorted.map((r) => r.name)).toEqual(['100 Main St', '2020 Work Orders', 'Alpha', 'Zebra'])
    })
  })

  describe('numeric values', () => {
    it('sorts numbers correctly', () => {
      const rows = [{ budget: 500 }, { budget: 1000 }, { budget: 50 }, { budget: 200 }]
      const sorted = applySorting(rows, [{ field: 'budget', direction: 'asc' }])
      expect(sorted.map((r) => r.budget)).toEqual([50, 200, 500, 1000])
    })

    it('sorts numbers with nulls last', () => {
      const rows = [{ budget: null }, { budget: 500 }, { budget: null }, { budget: 100 }]
      const sorted = applySorting(rows, [{ field: 'budget', direction: 'asc' }])
      expect(sorted.map((r) => r.budget)).toEqual([100, 500, null, null])
    })
  })

  describe('zip code sorting (real-world)', () => {
    it('sorts zip codes with nulls last', () => {
      const rows = [{ zip: null }, { zip: '93921' }, { zip: null }, { zip: '85281' }, { zip: '90002' }, { zip: '' }]
      const sorted = applySorting(rows, [{ field: 'zip', direction: 'asc' }])
      expect(sorted.map((r) => r.zip)).toEqual(['85281', '90002', '93921', null, null, ''])
    })
  })
})
