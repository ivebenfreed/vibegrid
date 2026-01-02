import { beforeEach, describe, expect, it } from 'vitest'
import type { Column } from '../../types'
import { TableCoreStore } from '../TableCoreStore'

describe('Enhanced detectChangedCells', () => {
  let store: TableCoreStore

  beforeEach(() => {
    store = new TableCoreStore('task')

    // Initialize with test columns
    const columns: Column[] = [
      { id: 'id', label: 'ID', type: 'text', fieldType: { type: 'text' } } as any,
      { id: 'name', label: 'Name', type: 'text', fieldType: { type: 'text' } } as any,
      { id: 'status', label: 'Status', type: 'text', fieldType: { type: 'text' } } as any,
      { id: 'updatedAt', label: 'Updated At', type: 'text', fieldType: { type: 'text' } } as any,
    ]

    // Set columns directly
    ;(store as any).columns = columns
  })

  it('detects cell changes via hashing', () => {
    // Set initial data
    store.setRows([{ id: '1', name: 'Alice', status: 'active', updatedAt: '2025-01-01' }])

    // Change name
    store.setRows([{ id: '1', name: 'Bob', status: 'active', updatedAt: '2025-01-01' }])

    expect(store.lastChangedCells.size).toBe(1)
    expect(store.lastChangedCells.get('1')).toContain('name')
    expect(store.lastChangedCells.get('1')).not.toContain('status')
  })

  it('loop-back protection: metadata-only change is no-op', () => {
    // Set initial data
    store.setRows([{ id: '1', name: 'Alice', status: 'active', updatedAt: '2025-01-01' }])

    // Clear changed cells from first call
    store.lastChangedCells.clear()

    // Only change updatedAt (metadata column)
    store.setRows([{ id: '1', name: 'Alice', status: 'active', updatedAt: '2025-01-02' }])

    // No changes should be reported (loop-back protection)
    expect(store.lastChangedCells.size).toBe(0)
  })

  it('handles TanStack object reuse correctly', () => {
    const row = { id: '1', name: 'Alice', status: 'active', updatedAt: '2025-01-01' }
    store.setRows([row])

    // Clear changed cells from first call
    store.lastChangedCells.clear()

    // Mutate same object (TanStack pattern)
    row.name = 'Bob'
    store.setRows([row])

    // Change should be detected despite same reference
    expect(store.lastChangedCells.size).toBe(1)
    expect(store.lastChangedCells.get('1')).toContain('name')
  })

  it('detects multiple column changes in single row', () => {
    store.setRows([{ id: '1', name: 'Alice', status: 'active', updatedAt: '2025-01-01' }])

    // Change both name and status
    store.setRows([{ id: '1', name: 'Bob', status: 'inactive', updatedAt: '2025-01-01' }])

    expect(store.lastChangedCells.size).toBe(1)
    const changedColumns = store.lastChangedCells.get('1')
    expect(changedColumns).toContain('name')
    expect(changedColumns).toContain('status')
    expect(changedColumns?.size).toBe(2)
  })

  it('detects changes across multiple rows', () => {
    store.setRows([
      { id: '1', name: 'Alice', status: 'active', updatedAt: '2025-01-01' },
      { id: '2', name: 'Bob', status: 'active', updatedAt: '2025-01-01' },
    ])

    // Change different columns in different rows
    store.setRows([
      { id: '1', name: 'Alice Updated', status: 'active', updatedAt: '2025-01-01' },
      { id: '2', name: 'Bob', status: 'inactive', updatedAt: '2025-01-01' },
    ])

    expect(store.lastChangedCells.size).toBe(2)
    expect(store.lastChangedCells.get('1')).toContain('name')
    expect(store.lastChangedCells.get('2')).toContain('status')
  })

  it('handles no changes (data identical)', () => {
    store.setRows([{ id: '1', name: 'Alice', status: 'active', updatedAt: '2025-01-01' }])

    // Clear changed cells from first call
    store.lastChangedCells.clear()

    // Set same data
    store.setRows([{ id: '1', name: 'Alice', status: 'active', updatedAt: '2025-01-01' }])

    expect(store.lastChangedCells.size).toBe(0)
  })

  it('handles new rows (no previous snapshot)', () => {
    // Set initial data
    store.setRows([{ id: '1', name: 'Alice', status: 'active', updatedAt: '2025-01-01' }])

    // Add new row
    store.setRows([
      { id: '1', name: 'Alice', status: 'active', updatedAt: '2025-01-01' },
      { id: '2', name: 'Bob', status: 'active', updatedAt: '2025-01-01' },
    ])

    // New row should not be in lastChangedCells (handled by structural change)
    expect(store.lastChangedCells.has('2')).toBe(false)
  })

  it('mixed changes: data + metadata', () => {
    store.setRows([{ id: '1', name: 'Alice', status: 'active', updatedAt: '2025-01-01' }])

    // Change both name (data) and updatedAt (metadata)
    store.setRows([{ id: '1', name: 'Bob', status: 'active', updatedAt: '2025-01-02' }])

    // Should detect name change, ignore updatedAt
    expect(store.lastChangedCells.size).toBe(1)
    const changedColumns = store.lastChangedCells.get('1')
    expect(changedColumns).toContain('name')
    expect(changedColumns).not.toContain('updatedAt')
  })
})
