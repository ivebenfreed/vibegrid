---
initiative: vibegrid-granular-update-optimization
type: improvement
status: draft
owner: platform-engineering
updated: 2025-11-30
---

# vibegrid granular update optimization: DESIGN (Part 2/2)

**📚 Navigation:** [Part 1](./DESIGN-01.md) [Part 2](#) 

---


| Operation | Current | Target | Strategy |
|-----------|---------|--------|----------|
| Hash overhead | N/A | <2ms | Fast path for primitives, ohash for objects |
| Single cell edit | ~50ms | <5ms | Cell-level update (10x improvement) |
| Fill handle (10 cells) | ~200ms | <50ms | Batch cell update (4x improvement) |
| Sort/filter change | ~100ms | ~100ms | Full recompute (unchanged) |
| Add/remove row | ~150ms | ~150ms | Structural change (unchanged) |
| processedRows churn | 100% | <10% | No-op guard catches identical data |

**Validation**: Benchmark at each phase. If hash overhead >2ms, investigate faster alternatives (xxhash, murmur3).

---

## Security Considerations

### Authentication
No authentication changes - frontend-only optimization.

### Authorization
No authorization changes - operates on already-authorized data.

### Data Protection
- **No stored values**: Snapshots contain only hashes (no sensitive data at rest)
- **Memory safety**: Hash-only approach prevents accidental data leaks
- **No network impact**: Client-side optimization only

---

## Current State Analysis

### What EXISTS in Code

**Basic Guard 1** (`TableCoreStore.ts:355-389`):
```typescript
// ✅ EXISTS: Basic no-op detection
if (changedCells.size === 0 && newRowCount === prevRowCount) {
  const idsMatch = prevRowIds.every((id, idx) => id === newRowIds[idx])
  if (idsMatch) {
    return  // Skip rawRows assignment
  }
}
```

**Basic Change Detection** (`TableCoreStore.ts:459-548`):
```typescript
// ✅ EXISTS: detectChangedCells with JSON.stringify
for (const column of this.columns) {
  if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
    changedColumns.add(columnId)
  }
}
```

**Basic Renderer Routing** (`SimplePassiveRenderer.ts:441-480`):
```typescript
// ✅ EXISTS: Granular path check
if (changedCells && changedCells.size > 0) {
  this.bodyRenderer.updateCells(changedCells)
  runInAction(() => {
    this.tableCoreStore.lastChangedCells.clear()
  })
  return
}
this.renderBody()  // Falls through
```

**Cell Update Methods** (`BodyRenderer.ts:1050-1157`):
```typescript
// ✅ EXISTS: updateCellValue and updateCells
updateCellValue(rowId, columnId, newValue, column): boolean
updateCells(changedCells: Map<string, Set<string>>): void
```

**Unused Helper** (`TableCoreStore.ts:413-427`):
```typescript
// ⚠️ EXISTS BUT NEVER CALLED
private computeShallowRowHash(rows: any[]): string {
  // TODO: Remove (dead code)
}
```

### What's MISSING (New Work Required)

- ❌ Per-column hashing with fast paths
- ❌ Loop-back protection (metadata exclusion)
- ❌ cloneForHash / hashValue utilities
- ❌ Enhanced RowSnapshot structure
- ❌ Version counters (dataVersion, configVersion, structureVersion)
- ❌ ChangeType enum and ChangeMetadata interface
- ❌ classifyChanges function with thresholds
- ❌ Sorting-sensitivity detection (sortFields, filterFields, groupFields)
- ❌ Field type capability metadata (supportsUpdate, updateTarget, requiresAsync)
- ❌ Capability checking in router (determineUpdateStrategy)
- ❌ Version-based routing in renderer
- ❌ Metadata clearing on config/structure paths
- ❌ Cached computed chain (cachedFilteredRows, cachedSortedRows) - optional

---

## Technical Specifications

### Enhanced Snapshot System

**Hash Utilities**:
```typescript
/**
 * Clone value for hashing - cheap and deterministic
 * - Primitives: No cloning (return as-is)
 * - Objects/Arrays: Shallow clone (sufficient for hash stability)
 * - Avoid structuredClone: Not universal, expensive
 */
function cloneForHash(value: any): any {
  if (value === null || value === undefined) return value
  const type = typeof value
  if (type === 'string' || type === 'number' || type === 'boolean') {
    return value  // Fast path: no allocation
  }
  if (Array.isArray(value)) return [...value]  // Shallow spread
  if (type === 'object') return { ...value }   // Shallow spread
  return value
}

/**
 * Hash value - fast path for primitives
 */
function hashValue(value: any): string {
  if (value === null || value === undefined) return 'null'
  const type = typeof value
  if (type === 'string' || type === 'number' || type === 'boolean') {
    return `${type}:${value}`  // Inline hash, no ohash
  }
  return hash(value)  // ohash for objects/arrays
}

/**
 * Create row snapshot with per-column hashing
 */
function createRowSnapshot(row: any, columns: Column[]): RowSnapshot {
  const columnHashes = new Map<string, string>()
  const dataColumnHashes: string[] = []

  for (const col of columns) {
    const value = row[col.id]
    const colHash = hashValue(value)
    columnHashes.set(col.id, colHash)

    // Exclude metadata from dataHash
    if (!METADATA_COLUMNS.has(col.id)) {
      dataColumnHashes.push(colHash)
    }
  }

  const dataHash = hash(dataColumnHashes.join('|'))

  return {
    id: row.id,
    orderIndex: row.orderIndex || 0,
    dataHash,
    columnHashes
  }
}
```

**Loop-Back Protection**:
```typescript
function detectChangedCells(newRows: any[]): Map<string, Set<string>> {
  const changedCells = new Map()
  const newSnapshot = new Map(
    newRows.map(row => [row.id, createRowSnapshot(row, this.columns)])
  )

  for (const [rowId, newSnap] of newSnapshot.entries()) {
    const oldSnap = this.previousRowsSnapshot.get(rowId)
    if (!oldSnap) continue

    // Loop-back protection: check data-only hash
    if (newSnap.dataHash === oldSnap.dataHash) {
      continue  // Only metadata changed (e.g., updatedAt)
    }

    // Find changed columns
    const changedColumns = new Set<string>()
    for (const [columnId, newHash] of newSnap.columnHashes.entries()) {
      if (METADATA_COLUMNS.has(columnId)) continue  // Skip metadata

      const oldHash = oldSnap.columnHashes.get(columnId)
      if (newHash !== oldHash) {
        changedColumns.add(columnId)
      }
    }

    if (changedColumns.size > 0) {
      changedCells.set(rowId, changedColumns)
    }
  }

  this.previousRowsSnapshot = newSnapshot
  return changedCells
}
```

### Version Lifecycle

**setRows Flow**:
```
Input: newRows[]
  ↓
1. detectChangedCells(newRows) → Map<rowId, Set<columnId>>
  ↓
2. analyzeStructuralChanges(newRows, changedCells) → ChangeMetadata
  ↓
3. Route based on ChangeMetadata.type:

   NONE:
     - Clear metadata
     - No version bumps
     - Return early (no rawRows assignment)

   STRUCTURAL:
     - structureVersion++
     - rawRows = newRows
     - Clear metadata
     - Return

   SORTING_SENSITIVE:
     - configVersion++
     - rawRows = newRows
     - Clear metadata
     - Return

   CELLS (cell-only):
     - dataVersion++
     - rawRows = newRows
     - Keep metadata (for renderer routing)
     - Return
```

**Config Changes Flow**:
```
setSortBy / setFilters / setGroupConfig:
  ↓
1. configVersion++
  ↓
2. Clear metadata (lastChangedCells, lastChangeMetadata)
  ↓
3. Update config observable
  ↓
4. processedRows recomputes (MobX reaction)
  ↓
5. Renderer sees configVersion changed → full render
```

### Renderer Routing

**Version-Based Decision Tree**:
```
Reaction fires:
  ↓
1. Compare versions (data, config, structure)
  ↓
2. If no versions changed:
     → Return (spurious reaction)
  ↓
3. If configVersion or structureVersion changed:
     → renderBody() (full render)
  ↓
4. If ONLY dataVersion changed:
     ↓
   4a. Check changeMetadata.type:

       NONE:
         → Return (safety check)

       CELLS:
         → Check capabilities
         → updateCells() or fallback to row-level
         → Clear metadata
         → Return (no full render)

       ROWS:
         → updateRowElement() for each row
         → Clear metadata
         → Return (no full render)

       STRUCTURAL:
         → Fall through to renderBody()
  ↓
5. renderBody() (full render)
  ↓
6. Update last versions
```

---

## Migration Strategy

### Phase 1: Enhanced Snapshot System (Week 1)
**Goal**: Replace JSON.stringify with per-column hashing
**Changes**:
- New utilities: cloneForHash, hashValue, createRowSnapshot
- Enhanced detectChangedCells
- Loop-back protection
**Rollback**: Remove hash utilities, revert to JSON.stringify

### Phase 2: Version & Classification (Week 2)
**Goal**: Add version tracking and change classification
**Changes**:
- Version observables
- ChangeType enum, ChangeMetadata interface
- classifyChanges, checkSortingFields
**Rollback**: Remove version checks, use old routing

### Phase 3: Capability Routing (Week 2)
**Goal**: Add field type metadata and routing
**Changes**:
- FieldTypeMetadata interface
- Add metadata to all field types
- determineUpdateStrategy
**Rollback**: Ignore metadata, always use cell-level

### Phase 4: Renderer Integration (Week 3)
**Goal**: Wire up version-based routing
**Changes**:
- Version tracking in renderer
- Updated reaction with version checks
- Metadata clearing logic
**Rollback**: Use old reaction (check changedCells only)

### Phase 5: Rollout (Week 4)
**Goal**: Feature flag and gradual deployment
**Changes**:
- ENABLE_GRANULAR_UPDATES_V2 flag
- Monitoring and metrics
**Rollback**: Toggle flag off (instant)

---

## Open Questions

### 1. Should we keep computeShallowRowHash?
- **Options**: A) Remove (dead code), B) Integrate into new system
- **Recommendation**: Remove (new system is better)
- **Needs**: Team confirmation on removal

### 2. Cached computed chain priority?
- **Options**: A) Implement in Phase 3, B) Defer to later optimization
- **Recommendation**: Defer (not critical for initial success)
- **Needs**: Performance data from Phase 1-2

### 3. Hash library choice?
- **Options**: A) ohash (simple), B) hash-wasm (fastest)
- **Recommendation**: Start with ohash, benchmark hash-wasm if overhead >2ms
- **Needs**: Phase 1 benchmarking results

---

## Performance Benchmarking Plan

### Baseline Measurements (Before Implementation)

```bash
# Run baseline benchmarks
pnpm benchmark:vibegrid-baseline

# Measure:
# - Single cell edit duration
# - Fill handle (10 cells) duration
# - processedRows computation time
# - Memory usage
```

### Continuous Benchmarking (During Implementation)

**After Phase 1** (Hashing):
```bash
pnpm benchmark:vibegrid-hashing

# Validate:
# - Hash overhead <2ms for 1000 rows x 10 columns
# - No memory regression
# - detectChangedCells faster than JSON.stringify
```

**After Phase 2** (Classification):
```bash
pnpm benchmark:vibegrid-classification

# Validate:
# - Classification overhead <1ms
# - Correct routing for each change type
```

**After Phase 4** (Full Integration):
```bash
pnpm benchmark:vibegrid-optimized

# Validate:
# - Single cell edit <5ms (10x improvement)
# - Fill handle <50ms (4x improvement)
# - No regression in sort/filter performance
```

### Performance Test Cases

```typescript
// Benchmark suite
const suite = new Benchmark.Suite()

suite.add('Baseline: Single cell edit', () => {
  // Current: setRows → detectChangedCells (JSON.stringify) → processedRows → renderBody
})

suite.add('Optimized: Single cell edit', () => {
  // New: setRows → detectChangedCells (hash) → Guard 1 → dataVersion++ → updateCells
})

suite.add('Hash overhead: 1000 rows x 10 columns', () => {
  // createRowSnapshot with fast paths
})

suite.run()
```

---

**Last Updated**: 2025-11-24
**Status**: Ready for technical review
**Next**: Team review → Approval → Implementation
