import { describe, it, expect } from 'vitest'
import { hashValue, createRowSnapshot, METADATA_COLUMNS } from '../hashing'

describe('hashValue', () => {
  it('uses inline hash for primitives', () => {
    expect(hashValue('test')).toBe('str:test')
    expect(hashValue(123)).toBe('num:123')
    expect(hashValue(true)).toBe('bool:true')
    expect(hashValue(null)).toBe('null')
  })

  it('uses ohash for objects', () => {
    const hash1 = hashValue({ a: 1, b: 2 })
    const hash2 = hashValue({ a: 1, b: 2 })
    expect(hash1).toBe(hash2)  // Consistent
    expect(typeof hash1).toBe('string')
  })

  it('produces different hashes for different values', () => {
    const hash1 = hashValue({ a: 1 })
    const hash2 = hashValue({ a: 2 })
    expect(hash1).not.toBe(hash2)
  })
})

describe('createRowSnapshot', () => {
  it('creates snapshot with dataHash excluding metadata', () => {
    const row = {
      id: '1',
      name: 'Alice',
      updatedAt: '2025-01-01'
    }
    const columns = [
      { id: 'name', type: 'text' },
      { id: 'updatedAt', type: 'text' }
    ] as any[]

    const snapshot = createRowSnapshot(row, columns)

    expect(snapshot.id).toBe('1')
    expect(snapshot.dataHash).toBeDefined()
    expect(snapshot.columnHashes.size).toBe(2)
    // dataHash should only include 'name', not 'updatedAt'
  })

  it('loop-back protection: updatedAt-only change same dataHash', () => {
    const columns = [
      { id: 'name', type: 'text' },
      { id: 'updatedAt', type: 'text' }
    ] as any[]

    const snap1 = createRowSnapshot(
      { id: '1', name: 'Alice', updatedAt: '2025-01-01' },
      columns
    )

    const snap2 = createRowSnapshot(
      { id: '1', name: 'Alice', updatedAt: '2025-01-02' },
      columns
    )

    // dataHash unchanged (only metadata changed)
    expect(snap1.dataHash).toBe(snap2.dataHash)
    // But columnHashes differ
    expect(snap1.columnHashes.get('updatedAt')).not.toBe(snap2.columnHashes.get('updatedAt'))
  })

  it('detects data changes', () => {
    const columns = [
      { id: 'name', type: 'text' },
      { id: 'updatedAt', type: 'text' }
    ] as any[]

    const snap1 = createRowSnapshot(
      { id: '1', name: 'Alice', updatedAt: '2025-01-01' },
      columns
    )

    const snap2 = createRowSnapshot(
      { id: '1', name: 'Bob', updatedAt: '2025-01-01' },
      columns
    )

    // dataHash changed (name changed)
    expect(snap1.dataHash).not.toBe(snap2.dataHash)
    // columnHashes for name differ
    expect(snap1.columnHashes.get('name')).not.toBe(snap2.columnHashes.get('name'))
  })
})
