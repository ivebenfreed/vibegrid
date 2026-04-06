---
initiative: vibegrid-granular-update-optimization
type: improvement
status: draft
owner: platform-engineering
updated: 2025-11-30
---

# vibegrid granular update optimization: IMPLEMENTATION (Part 1/2)

**📚 Navigation:** [Part 1](#) [Part 2](./IMPLEMENTATION-02.md) 

---

---
initiative: vibegrid-granular-update-optimization
type: improvement
status: draft
owner: platform-engineering
updated: 2025-11-29
---

# VibeGrid Granular Update Optimization: Implementation Guide

**Timeline**: 4 weeks
**Approach**: Incremental, testable phases with feature flag safety net
**Risk**: Medium-High - Previous attempt failed, requires careful validation at each step

---

## Week 1: Enhanced Snapshot System

### Component 1: Hash Utilities

**Create**: `src/systems/vibegrid/utils/hashing.ts`

```typescript
import { hash } from 'ohash'
import { createLogger } from '@/shared/lib/logging'

const log = createLogger('vibegrid/utils/hashing')

// Metadata columns excluded from change detection
export const METADATA_COLUMNS = new Set([
  'updatedAt',
  'createdAt',
  'version',
  'lastModifiedBy',
  'lastModifiedAt'
])

/**
 * Clone value for hashing - cheap and deterministic
 * Fast path for primitives (no allocation)
 */
export function cloneForHash(value: any): any {
  if (value === null || value === undefined) return value
  const type = typeof value

  // Fast path: primitives don't need cloning
  if (type === 'string' || type === 'number' || type === 'boolean') {
    return value
  }

  // Shallow clone for objects/arrays
  if (Array.isArray(value)) return [...value]
  if (type === 'object') return { ...value }

  return value
}

/**
 * Hash value - fast path for primitives
 * Uses inline hash for primitives, ohash for objects/arrays
 */
export function hashValue(value: any): string {
  if (value === null || value === undefined) return 'null'
  const type = typeof value

  // Fast path: inline hash for primitives (no ohash overhead)
  if (type === 'string') return `str:${value}`
  if (type === 'number') return `num:${value}`
  if (type === 'boolean') return `bool:${value}`

  // Slow path: ohash for objects/arrays
  return hash(value)
}

/**
 * Row snapshot for change detection
 */
export interface RowSnapshot {
  id: string
  orderIndex: number
  dataHash: string  // Hash of non-metadata columns only
  columnHashes: Map<string, string>  // Per-column hashes
}

/**
 * Create row snapshot with per-column hashing and loop-back protection
 */
export function createRowSnapshot(
  row: any,
  columns: import('../types').Column[]
): RowSnapshot {
  const columnHashes = new Map<string, string>()
  const dataColumnHashes: string[] = []

  for (const col of columns) {
    const value = row[col.id]
    const colHash = hashValue(value)
    columnHashes.set(col.id, colHash)

    // Exclude metadata from dataHash (loop-back protection)
    if (!METADATA_COLUMNS.has(col.id)) {
      dataColumnHashes.push(colHash)
    }
  }

  // Combined hash of data columns only
  const dataHash = hash(dataColumnHashes.join('|'))

  return {
    id: row.id,
    orderIndex: row.orderIndex || 0,
    dataHash,
    columnHashes
  }
}
```

**Tests**: `src/systems/vibegrid/utils/__tests__/hashing.test.ts`

```typescript
import { describe, it, expect } from 'vitest'
import { cloneForHash, hashValue, createRowSnapshot, METADATA_COLUMNS } from '../hashing'

describe('cloneForHash', () => {
  it('returns primitives as-is (no allocation)', () => {
    expect(cloneForHash('test')).toBe('test')
    expect(cloneForHash(123)).toBe(123)
    expect(cloneForHash(true)).toBe(true)
    expect(cloneForHash(null)).toBe(null)
  })

  it('shallow clones arrays', () => {
    const arr = [1, 2, 3]
    const cloned = cloneForHash(arr)
    expect(cloned).toEqual(arr)
    expect(cloned).not.toBe(arr)  // Different reference
  })

  it('shallow clones objects', () => {
    const obj = { a: 1, b: 2 }
    const cloned = cloneForHash(obj)
    expect(cloned).toEqual(obj)
    expect(cloned).not.toBe(obj)  // Different reference
  })
})

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
    ]

    const snapshot = createRowSnapshot(row, columns)

    expect(snapshot.id).toBe('1')
    expect(snapshot.dataHash).toBeDefined()
    expect(snapshot.columnHashes.size).toBe(2)
    // dataHash should only include 'name', not 'updatedAt'
  })

  it('loop-back protection: updatedAt-only change same dataHash', () => {
    const columns = [{ id: 'name', type: 'text' }, { id: 'updatedAt', type: 'text' }]

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
})
```

**Acceptance Criteria**:
- ✅ All hash utility tests pass
- ✅ Primitives use fast path (inline hash)
- ✅ Objects/arrays use ohash
- ✅ Loop-back protection works (metadata-only changes)
- ✅ No shared references in snapshots

**Estimated Effort**: 2 days

---

### Component 2: Enhanced detectChangedCells

**Modify**: `src/systems/vibegrid/stores/TableCoreStore.ts`

```typescript
import { createRowSnapshot, METADATA_COLUMNS, type RowSnapshot } from '../utils/hashing'

export class TableCoreStore {
  // Update snapshot type
  private previousRowsSnapshot: Map<string, RowSnapshot> = new Map()

  /**
   * Detect changed cells with per-column hashing and loop-back protection
   */
  private detectChangedCells(newRows: any[]): Map<string, Set<string>> {
    const changedCells = new Map<string, Set<string>>()

    // Build new snapshot with per-column hashing
    const newSnapshot = new Map(
      newRows.map(row => [row.id, createRowSnapshot(row, this.columns)])
    )

    for (const [rowId, newSnap] of newSnapshot.entries()) {
      const oldSnap = this.previousRowsSnapshot.get(rowId)

      if (!oldSnap) {
        // New row - handled by structural change detection
        continue
      }

      // LOOP-BACK PROTECTION: Check data-only hash first
      if (newSnap.dataHash === oldSnap.dataHash) {
        // Only metadata changed (e.g., updatedAt from backend)
        log.debug('🔄 Loop-back protection activated', {
          rowId,
          note: 'Only metadata changed - treating as no-op'
        })
        continue
      }

      // Data changed - find which columns
      const changedColumns = new Set<string>()

      for (const [columnId, newHash] of newSnap.columnHashes.entries()) {
        // Skip metadata columns in change reporting
        if (METADATA_COLUMNS.has(columnId)) {
          continue
        }

        const oldHash = oldSnap.columnHashes.get(columnId)
        if (newHash !== oldHash) {
          changedColumns.add(columnId)

          log.debug('🔍 Cell change detected', {
            rowId,
            columnId,
            oldHash: oldHash?.substring(0, 8),
            newHash: newHash.substring(0, 8)
          })
        }
      }

      if (changedColumns.size > 0) {
        changedCells.set(rowId, changedColumns)
      }
    }

    // Update snapshot for next comparison
    this.previousRowsSnapshot = newSnapshot

    log.info('📊 Change detection complete', {
      totalRows: newRows.length,
      rowsChanged: changedCells.size,
      totalCellsChanged: Array.from(changedCells.values())
        .reduce((sum, cols) => sum + cols.size, 0)
    })

    return changedCells
  }
}
```

**Tests**: Add to `src/systems/vibegrid/stores/__tests__/TableCoreStore.test.ts`

```typescript
describe('Enhanced detectChangedCells', () => {
  it('detects cell changes via hashing', () => {
    store.setRows([{ id: '1', name: 'Alice' }])
    store.setRows([{ id: '1', name: 'Bob' }])

    expect(store.lastChangedCells.size).toBe(1)
    expect(store.lastChangedCells.get('1')).toContain('name')
  })

  it('loop-back protection: metadata-only change is no-op', () => {
    store.setRows([{ id: '1', name: 'Alice', updatedAt: '2025-01-01' }])
    store.setRows([{ id: '1', name: 'Alice', updatedAt: '2025-01-02' }])

    expect(store.lastChangedCells.size).toBe(0)  // No changes reported
  })

  it('handles TanStack object reuse correctly', () => {
    const row = { id: '1', name: 'Alice' }
    store.setRows([row])

    // Mutate same object (TanStack pattern)
    row.name = 'Bob'
    store.setRows([row])

    expect(store.lastChangedCells.size).toBe(1)  // Change detected despite same ref
  })
})
```

**Acceptance Criteria**:
- ✅ Uses per-column hashing
- ✅ Loop-back protection works
- ✅ TanStack object reuse handled
- ✅ All tests pass
- ✅ Benchmark: Hash overhead <2ms for 1000 rows

**Estimated Effort**: 2 days

---

### Component 3: Version Tracking

**Modify**: `src/systems/vibegrid/stores/TableCoreStore.ts`

```typescript
export class TableCoreStore {
  // Add version counters
  @observable dataVersion: number = 0
  @observable configVersion: number = 0
  @observable structureVersion: number = 0

  // Add change metadata storage
  @observable lastChangeMetadata: ChangeMetadata | null = null

  @action
  reset(): void {
    // ... existing reset logic

    // Reset versions
    this.dataVersion = 0
    this.configVersion = 0
    this.structureVersion = 0
    this.lastChangeMetadata = null
  }
}
```

**Tests**: `src/systems/vibegrid/stores/__tests__/version-tracking.test.ts`

```typescript
describe('Version Tracking', () => {
  it('versions start at 0', () => {
    const store = new TableCoreStore('task')
    expect(store.dataVersion).toBe(0)
    expect(store.configVersion).toBe(0)
    expect(store.structureVersion).toBe(0)
  })

  it('versions reset correctly', () => {
    store.dataVersion = 5
    store.configVersion = 3
    store.reset()

    expect(store.dataVersion).toBe(0)
    expect(store.configVersion).toBe(0)
  })
})
```

**Acceptance Criteria**:
- ✅ Version observables added
- ✅ Versions reset correctly
- ✅ Tests pass

**Estimated Effort**: 0.5 days

---

### Benchmarking

**Create**: `scripts/benchmarks/vibegrid-hash-performance.ts`

```typescript
import Benchmark from 'benchmark'
import { hashValue, createRowSnapshot } from '../src/systems/vibegrid/utils/hashing'

const suite = new Benchmark.Suite()

// Generate test data
const testRows = Array.from({ length: 1000 }, (_, i) => ({
  id: `row-${i}`,
  name: `Name ${i}`,
  status: 'active',
  count: i,
  metadata: { nested: 'value' },
  updatedAt: new Date().toISOString()
}))

const testColumns = [
  { id: 'id', type: 'text' },
  { id: 'name', type: 'text' },
  { id: 'status', type: 'select' },
  { id: 'count', type: 'number' },
  { id: 'metadata', type: 'object' },
  { id: 'updatedAt', type: 'text' }
]

// Baseline: Current JSON.stringify
suite.add('Baseline: JSON.stringify comparison', () => {
  for (const row of testRows) {
    for (const col of testColumns) {
      const _ = JSON.stringify(row[col.id])
    }
  }
})

// Optimized: Per-column hashing
suite.add('Optimized: Per-column hashing', () => {
  for (const row of testRows) {
    createRowSnapshot(row, testColumns)
  }
})

suite.on('complete', function() {
  console.log('Results:')
  this.forEach((bench: any) => {
    console.log(`  ${bench.name}: ${bench.hz.toFixed(2)} ops/sec`)
  })
  console.log(`Fastest: ${this.filter('fastest').map('name')}`)
})

suite.run()
```

**Run**:
```bash
pnpm tsx scripts/benchmarks/vibegrid-hash-performance.ts
```

**Acceptance**: Hash overhead <2ms for 1000 rows x 10 columns

---

## Week 2: Change Classification & Version Routing

### Component 4: Change Classification

**Create**: `src/systems/vibegrid/utils/change-classification.ts`

```typescript
import type { Column } from '../types'

export enum ChangeType {
  NONE = 'none',
  CELLS = 'cells',
  ROWS = 'rows',
  STRUCTURAL = 'structural'
}

export interface ChangeMetadata {
  type: ChangeType
  affectedRows: Set<string>
  affectedCells: Map<string, Set<string>>
  sortingSensitive: boolean
  structuralChange: boolean
  estimatedCellCount: number
}

export const CHANGE_THRESHOLDS = {
  MAX_CELL_GRANULAR: 20,
  MAX_CELLS_PER_ROW: 3
}

export function classifyChanges(
  changedCells: Map<string, Set<string>>,
  sortingSensitive: boolean,
  structuralChange: boolean
): ChangeMetadata {
  const totalCells = Array.from(changedCells.values())
    .reduce((sum, cols) => sum + cols.size, 0)

  const affectedRows = new Set(changedCells.keys())

  // Priority 1: No changes
  if (totalCells === 0) {
    return {
      type: ChangeType.NONE,
      affectedRows: new Set(),
      affectedCells: new Map(),
      sortingSensitive: false,
      structuralChange: false,
      estimatedCellCount: 0
    }
  }

  // Priority 2: Structural or sorting-sensitive
  if (structuralChange || sortingSensitive) {
    return {
      type: ChangeType.STRUCTURAL,
      affectedRows,
      affectedCells: changedCells,
      sortingSensitive,
      structuralChange,
      estimatedCellCount: totalCells
    }
  }

  // Priority 3: Check thresholds for granular vs batch
  if (totalCells <= CHANGE_THRESHOLDS.MAX_CELL_GRANULAR) {
    const maxCellsPerRow = Math.max(
      ...Array.from(changedCells.values()).map(cols => cols.size)
    )

    if (maxCellsPerRow <= CHANGE_THRESHOLDS.MAX_CELLS_PER_ROW) {
      return {
        type: ChangeType.CELLS,
        affectedRows,
        affectedCells: changedCells,
        sortingSensitive: false,
        structuralChange: false,
        estimatedCellCount: totalCells
      }
    }

    return {
      type: ChangeType.ROWS,
      affectedRows,
      affectedCells: changedCells,
      sortingSensitive: false,
      structuralChange: false,
      estimatedCellCount: totalCells
    }
  }

  // Priority 4: Large batch - full render
  return {
    type: ChangeType.STRUCTURAL,
    affectedRows,
    affectedCells: changedCells,
    sortingSensitive: false,
    structuralChange: false,
    estimatedCellCount: totalCells
  }
}
```

**Tests**: `src/systems/vibegrid/utils/__tests__/change-classification.test.ts`

```typescript
import { classifyChanges, ChangeType } from '../change-classification'

describe('classifyChanges', () => {
  it('classifies empty changes as NONE', () => {
    const result = classifyChanges(new Map(), false, false)
    expect(result.type).toBe(ChangeType.NONE)
  })

  it('classifies single cell as CELLS', () => {
    const changedCells = new Map([['row1', new Set(['col1'])]])
    const result = classifyChanges(changedCells, false, false)
    expect(result.type).toBe(ChangeType.CELLS)
  })

  it('classifies many cells per row as ROWS', () => {
    const changedCells = new Map([
      ['row1', new Set(['col1', 'col2', 'col3', 'col4'])]
    ])
    const result = classifyChanges(changedCells, false, false)
    expect(result.type).toBe(ChangeType.ROWS)
  })

  it('classifies large batch as STRUCTURAL', () => {
    const changedCells = new Map(
      Array.from({ length: 100 }, (_, i) => [`row${i}`, new Set(['col1'])])
    )
    const result = classifyChanges(changedCells, false, false)
    expect(result.type).toBe(ChangeType.STRUCTURAL)
  })

  it('classifies sorting-sensitive as STRUCTURAL', () => {
    const changedCells = new Map([['row1', new Set(['col1'])]])
    const result = classifyChanges(changedCells, true, false)  // sortingSensitive: true
    expect(result.type).toBe(ChangeType.STRUCTURAL)
  })
})
```

**Acceptance Criteria**:
- ✅ Classification logic correct for all types
- ✅ Thresholds tunable via constants
- ✅ All tests pass

**Estimated Effort**: 2 days

---

### Component 5: Sorting Field Tracking

**Modify**: `src/systems/vibegrid/stores/TableCoreStore.ts`

```typescript
export class TableCoreStore {
  // Add computed for sensitive fields
  @computed
  get sortFields(): Set<string> {
    return new Set(this.visualStateStore?.sortBy?.map(s => s.field) || [])
  }

  @computed
  get filterFields(): Set<string> {
    return new Set(this.visualStateStore?.filters?.map(f => f.field) || [])
  }

  @computed
  get groupFields(): Set<string> {
    const config = this.visualStateStore?.groupConfig
    return new Set(config?.fields?.map(f => f.field) || [])
  }

  /**
   * Check if any changed column affects sorting/filtering/grouping
   */
  checkSortingFields(changedCells: Map<string, Set<string>>): boolean {
    const sensitiveFields = new Set([
      ...this.sortFields,
      ...this.filterFields,
      ...this.groupFields
    ])

    for (const columnIds of changedCells.values()) {
      for (const columnId of columnIds) {
        if (sensitiveFields.has(columnId)) {
          log.info('🔄 Sorting-sensitive field changed', {
