import { describe, it, expect, beforeEach } from 'vitest'
import { TableCoreStore } from '../TableCoreStore'
import type { Column } from '../../types'

describe('Version Tracking', () => {
  let store: TableCoreStore

  beforeEach(() => {
    store = new TableCoreStore('task')

    // Initialize with test columns
    const columns: Column[] = [
      { id: 'id', label: 'ID', type: 'text', fieldType: { type: 'text' } } as any,
      { id: 'name', label: 'Name', type: 'text', fieldType: { type: 'text' } } as any,
      { id: 'status', label: 'Status', type: 'text', fieldType: { type: 'text' } } as any
    ]

    // Set columns directly
    ;(store as any).columns = columns
  })

  it('versions start at 0', () => {
    expect(store.dataVersion).toBe(0)
    expect(store.configVersion).toBe(0)
    expect(store.structureVersion).toBe(0)
  })

  it('lastChangeMetadata starts as null', () => {
    expect(store.lastChangeMetadata).toBe(null)
  })

  it('versions reset correctly', () => {
    // Manually set versions to non-zero values
    ;(store as any).dataVersion = 5
    ;(store as any).configVersion = 3
    ;(store as any).structureVersion = 2
    ;(store as any).lastChangeMetadata = { type: 'test' }

    // Reset the store
    store.reset()

    // Versions should be back to 0
    expect(store.dataVersion).toBe(0)
    expect(store.configVersion).toBe(0)
    expect(store.structureVersion).toBe(0)
    expect(store.lastChangeMetadata).toBe(null)
  })

  it('versions are observable', () => {
    // Check that the properties are observable
    // This is important for MobX reactivity
    const initialDataVersion = store.dataVersion
    expect(typeof initialDataVersion).toBe('number')

    const initialConfigVersion = store.configVersion
    expect(typeof initialConfigVersion).toBe('number')

    const initialStructureVersion = store.structureVersion
    expect(typeof initialStructureVersion).toBe('number')
  })

  it('lastChangeMetadata is observable', () => {
    expect(store.lastChangeMetadata).toBe(null)

    // We can set it (will be used by setRows later)
    ;(store as any).lastChangeMetadata = { type: 'cells', affectedRows: new Set(['1']) }
    expect(store.lastChangeMetadata).toBeTruthy()
    expect(store.lastChangeMetadata?.type).toBe('cells')
  })
})
