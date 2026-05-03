import { beforeEach, describe, expect, it } from 'vitest'
import { GroupProcessor } from '../GroupProcessor'
import type { Column, GroupConfig, TableRow } from '../../types'

/**
 * GH#2804 B12: GroupProcessor.processData early-returns on substrate-owned
 * entities. RFI is currently the only substrate-owned entity. The guard
 * lives at the processor itself (5th optional param) AND at the caller
 * (TableCoreStore.groupedOrOrderedRows passes entityType through).
 */

function createRow(id: string, data: Record<string, any>): TableRow {
  return {
    id,
    data,
    metadata: {
      createdAt: new Date(),
      updatedAt: new Date(),
      version: 1,
    },
  }
}

const columns: Column[] = [
  {
    id: 'status',
    field: 'status',
    name: 'Status',
    cellType: 'select' as any,
    options: [
      { value: 'open', label: 'Open' },
      { value: 'closed', label: 'Closed' },
    ],
  },
]

const baseConfig: GroupConfig = {
  fields: [{ field: 'status', displayName: 'Status' }],
  sortBy: 'name',
  sortDirection: 'asc',
  aggregations: [],
  expandedGroups: new Set(),
}

describe('GroupProcessor substrate-owned entity guard (GH#2804 B12)', () => {
  let rows: TableRow[]

  beforeEach(() => {
    rows = [
      createRow('1', { status: 'open' }),
      createRow('2', { status: 'closed' }),
      createRow('3', { status: 'open' }),
    ]
  })

  it('returns rows ungrouped when entity is RFI (substrate-owned)', () => {
    const result = GroupProcessor.processData(rows, columns, baseConfig, undefined, 'RFI')

    // No groups produced — all rows arrive as flat data rows.
    expect(result.groups).toHaveLength(0)
    expect(result.virtualRows).toHaveLength(3)
    for (const vr of result.virtualRows) {
      expect(vr.type).toBe('data')
    }
  })

  it('groups normally when entity is Document (non-substrate)', () => {
    const result = GroupProcessor.processData(rows, columns, baseConfig, undefined, 'Document')

    // Status has 2 distinct values → 2 groups (open, closed).
    expect(result.groups.length).toBeGreaterThanOrEqual(2)
    const groupValues = result.groups.map((g) => g.value)
    expect(groupValues).toContain('open')
    expect(groupValues).toContain('closed')
  })

  it('groups normally when entityName is undefined (legacy path)', () => {
    const result = GroupProcessor.processData(rows, columns, baseConfig)
    expect(result.groups.length).toBeGreaterThanOrEqual(2)
  })

  it('groups normally when entityName is empty string', () => {
    const result = GroupProcessor.processData(rows, columns, baseConfig, undefined, '')
    expect(result.groups.length).toBeGreaterThanOrEqual(2)
  })
})
