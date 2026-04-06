---
initiative: vibegrid-granular-update-optimization
type: improvement
status: draft
owner: platform-engineering
updated: 2025-11-30
---

# vibegrid granular update optimization: IMPLEMENTATION (Part 2/2)

**📚 Navigation:** [Part 1](./IMPLEMENTATION-01.md) [Part 2](#) 

---

            columnId,
            requiresFullRecompute: true
          })
          return true
        }
      }
    }

    return false
  }
}
```

**Tests**:
```typescript
describe('Sorting Field Detection', () => {
  it('detects sort field change', () => {
    store.visualStateStore.setSortBy([{ field: 'name', direction: 'asc' }])
    const changedCells = new Map([['row1', new Set(['name'])]])

    expect(store.checkSortingFields(changedCells)).toBe(true)
  })

  it('returns false for non-sensitive field', () => {
    store.visualStateStore.setSortBy([{ field: 'name', direction: 'asc' }])
    const changedCells = new Map([['row1', new Set(['email'])]])

    expect(store.checkSortingFields(changedCells)).toBe(false)
  })
})
```

**Acceptance Criteria**:
- ✅ Detects sort field changes
- ✅ Detects filter field changes
- ✅ Detects group field changes
- ✅ All tests pass

**Estimated Effort**: 1 day

---

### Component 6: Updated setRows with Versions

**Modify**: `src/systems/vibegrid/stores/TableCoreStore.ts`

```typescript
import { classifyChanges, ChangeType } from '../utils/change-classification'

export class TableCoreStore {
  @action
  setRows(rows: any[]): void {
    // Step 1: Detect changes with loop-back protection
    const changedCells = this.detectChangedCells(rows)

    // Step 2: Check structural changes
    const newRowCount = rows.length
    const prevRowCount = this.rawRows.length
    const structuralChange = newRowCount !== prevRowCount ||
      !rows.every((r, i) => r.id === this.rawRows[i]?.id)

    // Step 3: Check sorting sensitivity
    const sortingSensitive = this.checkSortingFields(changedCells)

    // Step 4: Classify changes
    const metadata = classifyChanges(changedCells, sortingSensitive, structuralChange)

    // Step 5: Route based on classification
    if (metadata.type === ChangeType.NONE) {
      log.debug('⏭️ Guard 1: No-op detected', {
        reason: 'no_data_changes',
        loopBackProtected: true
      })
      // Clear stale metadata
      this.lastChangedCells.clear()
      this.lastChangeMetadata = null
      return  // EXIT - No version bumps, no rawRows assignment
    }

    if (metadata.structuralChange) {
      this.structureVersion++
      this.rawRows = rows
      // Clear metadata (not applicable)
      this.lastChangedCells.clear()
      this.lastChangeMetadata = null
      log.info('📊 Structural change', { structureVersion: this.structureVersion })
      return
    }

    if (metadata.sortingSensitive) {
      this.configVersion++
      this.rawRows = rows
      // Clear metadata (will trigger full render)
      this.lastChangedCells.clear()
      this.lastChangeMetadata = null
      log.info('🔄 Sorting-sensitive change', { configVersion: this.configVersion })
      return
    }

    // Cell-only change
    this.dataVersion++
    this.rawRows = rows
    this.lastChangedCells = changedCells
    this.lastChangeMetadata = metadata  // Keep for renderer
    log.info('📝 Cell-only change', {
      dataVersion: this.dataVersion,
      cellsChanged: metadata.estimatedCellCount
    })
  }
}
```

**Tests**:
```typescript
describe('setRows with Version Tracking', () => {
  it('no-op: no version bump', () => {
    store.setRows([{ id: '1', name: 'Alice' }])
    const v1 = store.dataVersion

    store.setRows([{ id: '1', name: 'Alice' }])
    expect(store.dataVersion).toBe(v1)
  })

  it('cell change: dataVersion increments', () => {
    store.setRows([{ id: '1', name: 'Alice' }])
    const v1 = store.dataVersion

    store.setRows([{ id: '1', name: 'Bob' }])
    expect(store.dataVersion).toBe(v1 + 1)
  })

  it('add row: structureVersion increments', () => {
    store.setRows([{ id: '1', name: 'Alice' }])
    const v1 = store.structureVersion

    store.setRows([{ id: '1', name: 'Alice' }, { id: '2', name: 'Bob' }])
    expect(store.structureVersion).toBe(v1 + 1)
  })

  it('sort field change: configVersion increments', () => {
    store.visualStateStore.setSortBy([{ field: 'name', direction: 'asc' }])
    store.setRows([{ id: '1', name: 'Alice' }])
    const v1 = store.configVersion

    store.setRows([{ id: '1', name: 'Zara' }])  // Sort field changed
    expect(store.configVersion).toBe(v1 + 1)
  })
})
```

**Acceptance Criteria**:
- ✅ Version routing logic correct
- ✅ Metadata cleared on all paths
- ✅ All tests pass

**Estimated Effort**: 1 day

---

## Week 3: Capability Routing & Renderer Integration

### Component 7: Field Type Capability Metadata

**Modify**: All field type files in `src/systems/vibegrid/field-types/implementations/`

```typescript
// Example: TextFieldType.ts
export const TextFieldType: VibeGridFieldType = {
  type: 'text',
  category: 'basic',
  renderer: new TextRenderer(),
  editor: new TextEditor(),
  formatter: new TextFormatter(),
  validator: new TextValidator(),
  metadata: {
    // Existing metadata...
    supportsSorting: true,
    supportsFiltering: true,

    // NEW: Update capabilities
    supportsUpdate: true,
    updateTarget: 'content',
    requiresAsync: false
  }
}
```

**Migration checklist**:
- [ ] BasicFieldTypes (8 types): Text, Number, EntityName, Date, Checkbox, URL, Email, Phone
- [ ] RelationshipFieldTypes (5 types): Select, UserReference, EntityReference, MultiSelect, Tags
- [ ] RollupFieldTypes (3 types): Count, Sum, Average

**Default values**:
- Basic types → `supportsUpdate: true, updateTarget: 'content', requiresAsync: false`
- Complex types → `supportsUpdate: false, updateTarget: 'row', requiresAsync: varies`

**Acceptance Criteria**:
- ✅ All 16+ field types have metadata
- ✅ No missing metadata in production
- ✅ Safe defaults for new types

**Estimated Effort**: 1 day

---

### Component 8: Capability Router

**Create**: `src/systems/vibegrid/utils/update-router.ts`

```typescript
import type { ChangeMetadata } from './change-classification'
import type { Column } from '../types'
import { createLogger } from '@/shared/lib/logging'

const log = createLogger('vibegrid/utils/update-router')

export type UpdateStrategy = 'cell-level' | 'row-level' | 'full-render'

export function determineUpdateStrategy(
  metadata: ChangeMetadata,
  columns: Column[]
): UpdateStrategy {
  // Collect all affected columns
  const affectedColumns = new Set<string>()
  for (const columnSet of metadata.affectedCells.values()) {
    columnSet.forEach(col => affectedColumns.add(col))
  }

  // Check if all support cell-level updates
  const allSupportsUpdate = Array.from(affectedColumns).every(colId => {
    const column = columns.find(c => c.id === colId)
    return column?.fieldType?.metadata?.supportsUpdate === true
  })

  // Capability fallback
  if (!allSupportsUpdate && metadata.type === ChangeType.CELLS) {
    const nonSupporting = Array.from(affectedColumns).filter(colId => {
      const column = columns.find(c => c.id === colId)
      return column?.fieldType?.metadata?.supportsUpdate !== true
    })

    log.info('⚠️ Capability fallback to row-level', {
      reason: 'not_all_columns_support_update',
      nonSupportingColumns: nonSupporting
    })

    return 'row-level'
  }

  // Use classification result
  switch (metadata.type) {
    case ChangeType.CELLS:
      return 'cell-level'
    case ChangeType.ROWS:
      return 'row-level'
    case ChangeType.STRUCTURAL:
      return 'full-render'
    default:
      return 'full-render'
  }
}
```

**Tests**:
```typescript
describe('determineUpdateStrategy', () => {
  it('routes to cell-level for supporting columns', () => {
    const metadata = { type: ChangeType.CELLS, affectedCells: ... }
    const columns = [{ id: 'name', fieldType: { metadata: { supportsUpdate: true } } }]

    expect(determineUpdateStrategy(metadata, columns)).toBe('cell-level')
  })

  it('falls back to row-level for non-supporting columns', () => {
    const metadata = { type: ChangeType.CELLS, affectedCells: ... }
    const columns = [{ id: 'status', fieldType: { metadata: { supportsUpdate: false } } }]

    expect(determineUpdateStrategy(metadata, columns)).toBe('row-level')
  })
})
```

**Acceptance Criteria**:
- ✅ Capability checking works
- ✅ Fallback logic correct
- ✅ All tests pass

**Estimated Effort**: 1 day

---

### Component 9: Renderer Version-Based Routing

**Modify**: `src/systems/vibegrid/renderers/core/SimplePassiveRenderer.ts`

```typescript
import { determineUpdateStrategy } from '../../utils/update-router'
import { ChangeType } from '../../utils/change-classification'

export class SimplePassiveRenderer {
  // Add version tracking
  private lastDataVersion: number = 0
  private lastConfigVersion: number = 0
  private lastStructureVersion: number = 0

  private initFocusedObservers(): void {
    // ... existing observers

    // Update data observer with version routing
    this.dataObserverDisposer = reaction(
      () => ({
        dataV: this.tableCoreStore.dataVersion,
        configV: this.tableCoreStore.configVersion,
        structureV: this.tableCoreStore.structureVersion,
        changedCells: this.tableCoreStore.lastChangedCells,
        changeMetadata: this.tableCoreStore.lastChangeMetadata
      }),
      ({ dataV, configV, structureV, changedCells, changeMetadata }) => {
        // Guards
        if (!this.observersEnabled || !this.initStore?.isFullyHydrated) {
          return
        }

        // Check what changed
        const dataChanged = dataV !== this.lastDataVersion
        const configChanged = configV !== this.lastConfigVersion
        const structureChanged = structureV !== this.lastStructureVersion

        if (!dataChanged && !configChanged && !structureChanged) {
          return  // Spurious reaction
        }

        fileLog.info('🔄 Data observer fired', {
          dataChanged,
          configChanged,
          structureChanged,
          changeType: changeMetadata?.type || 'unknown'
        })

        // Route based on what changed
        if (dataChanged && !configChanged && !structureChanged) {
          // Data-only change - check for granular path
          if (!changeMetadata || changeMetadata.type === ChangeType.NONE) {
            return
          }

          const strategy = determineUpdateStrategy(
            changeMetadata,
            this.tableCoreStore.columns
          )

          switch (strategy) {
            case 'cell-level':
              this.bodyRenderer.updateCells(changedCells)
              runInAction(() => {
                this.tableCoreStore.lastChangedCells.clear()
                this.tableCoreStore.lastChangeMetadata = null
              })
              this.lastDataVersion = dataV
              fileLog.info('✅ Cell-level update complete')
              return  // EXIT - no full render

            case 'row-level':
              changeMetadata.affectedRows.forEach(rowId => {
                const rowIndex = this.tableCoreStore.processedRows
                  .findIndex(r => r.id === rowId)
                if (rowIndex >= 0) {
                  this.bodyRenderer.updateRowElement(rowId, rowIndex)
                }
              })
              runInAction(() => {
                this.tableCoreStore.lastChangedCells.clear()
                this.tableCoreStore.lastChangeMetadata = null
              })
              this.lastDataVersion = dataV
              fileLog.info('✅ Row-level update complete')
              return  // EXIT - no full render

            case 'full-render':
              // Fall through
              break
          }
        }

        // Config or structure changed - full render
        // Safety check: metadata should already be cleared
        if (this.tableCoreStore.lastChangedCells.size > 0) {
          fileLog.warn('⚠️ Stale metadata detected before full render')
          runInAction(() => {
            this.tableCoreStore.lastChangedCells.clear()
            this.tableCoreStore.lastChangeMetadata = null
          })
        }

        this.renderBody()

        // Update all version trackers
        this.lastDataVersion = dataV
        this.lastConfigVersion = configV
        this.lastStructureVersion = structureV
      }
    )
  }
}
```

**Acceptance Criteria**:
- ✅ Version-based routing works
- ✅ Granular paths exit early (no full render)
- ✅ Config/structure trigger full render
- ✅ Metadata cleared correctly

**Estimated Effort**: 2 days

---

## Week 4: Testing & Rollout

### Testing Strategy

**Unit Tests (25 tests)**:
- Version tracking (8 tests)
- Hash utilities (4 tests)
- Snapshot system (4 tests)
- Change classification (5 tests)
- Sorting field detection (4 tests)

**Integration Tests (18 tests)**:
- setRows pipeline (3 tests)
- Renderer routing (8 tests)
- Field type compatibility (7 tests)

**E2E Tests (7 tests)**:
- Single cell edit
- Fill handle drag
- EntityName hover after update
- Sort change
- Filter change
- Add/remove row
- Collaborative edit simulation

**Performance Tests**:
- Hash overhead benchmark
- Single cell edit benchmark
- Fill handle benchmark
- Memory profiling

**Target Coverage**: 90%+ for new code

---

### Feature Flag Implementation

**Create**: `src/systems/vibegrid/config/feature-flags.ts`

```typescript
export const VIBEGRID_FEATURES = {
  granularUpdates: import.meta.env.VITE_VIBEGRID_GRANULAR_UPDATES === 'true'
}

// Dev tools toggle
if (import.meta.env.DEV) {
  (window as any).__VIBEGRID_TOGGLE_GRANULAR_UPDATES__ = () => {
    // Toggle implementation
  }
}
```

**Add to `.env.example`**:
```bash
# VibeGrid Granular Updates (default: false)
VITE_VIBEGRID_GRANULAR_UPDATES=false
```

**Wrap optimization code**:
```typescript
// In setRows
if (!VIBEGRID_FEATURES.granularUpdates) {
  // Old code path: always assign rawRows, no classification
  this.rawRows = rows
  this.hasLoadedRows = true
  return
}

// New optimized path
const metadata = classifyChanges(...)
// ...
```

**Acceptance Criteria**:
- ✅ Flag works in dev and production
- ✅ Defaults to false
- ✅ Can toggle at runtime in dev
- ✅ Old code path works when disabled

**Estimated Effort**: 1 day

---

### Deployment Checklist

#### Pre-Deployment
- [ ] All tests pass (unit + integration + E2E)
- [ ] Performance benchmarks met (hash <2ms, cell edit <5ms)
- [ ] Code review approved
- [ ] Feature flag tested (on/off)
- [ ] Documentation updated (DESIGN.md, IMPLEMENTATION.md)

#### Deployment Steps
1. **Deploy with flag OFF** (default)
   ```bash
   git push origin staging
   # Wait for deployment
   ```

2. **Enable for internal team** (10% rollout)
   ```bash
   # Set in staging environment
   VITE_VIBEGRID_GRANULAR_UPDATES=true
   ```

3. **Monitor for 48 hours**
   - Check logs for errors
   - Verify performance metrics
   - Gather team feedback

4. **Expand to 50% if healthy**
   - A/B test: compare metrics
   - Monitor EntityName regressions

5. **Full rollout (100%)**
   - Enable for all users
   - Monitor for 7 days

6. **Default to true**
   - Update `.env.example`
   - Remove old code paths (cleanup)

#### Post-Deployment
- [ ] Smoke tests pass
- [ ] Performance metrics healthy (<5ms cell edits)
- [ ] No error spikes in logs
- [ ] EntityName hover effects work
- [ ] <1% fallback to full render rate

#### Rollback Plan
**If issues detected**:
1. Toggle feature flag OFF immediately
2. Deploy config change (no code deploy needed)
3. Verify rollback successful (check metrics)
4. Post-mortem: analyze failure
5. Fix and re-deploy

**Rollback time**: <5 minutes via feature flag

---

## Monitoring & Observability

### Key Metrics

```typescript
const VIBEGRID_METRICS = {
  hash_overhead_ms: {
    target: 2,
    p95_threshold: 3,
    alert: 'Hash overhead exceeds target'
  },
  cell_edit_duration_ms: {
    target: 5,
    p95_threshold: 10,
    alert: 'Cell edit slower than target'
  },
  full_render_fallback_rate: {
    target: 0.01,  // <1%
    threshold: 0.05,  // >5%
    alert: 'Unexpected fallback rate'
  },
  mobx_timing_errors: {
    target: 0,
    threshold: 1,
    alert: 'MobX timing issue detected'
  }
}
```

### Logging

```typescript
// In setRows
log.info('📊 Change detection result', {
  changeType: metadata.type,
  cellsChanged: metadata.estimatedCellCount,
  sortingSensitive: metadata.sortingSensitive,
  versionIncremented: 'dataVersion' | 'configVersion' | 'structureVersion' | 'none'
})

// In renderer
log.info('🎯 Update strategy', {
  strategy: 'cell-level' | 'row-level' | 'full-render',
  reason: 'classification' | 'capability-fallback' | 'config-change',
  duration: performance.now() - startTime
})
```

### Dashboards

**Grafana Dashboard**: VibeGrid Granular Updates
- Hash overhead trend (ms)
- Cell edit duration trend (ms)
- Fallback rate (%)
- Update strategy distribution (pie chart)
- Error count

---

## Known Issues / Technical Debt

### Issue 1: Hashing Overhead Not Yet Validated
**Impact**: High
**Description**: Per-column hashing may be too expensive for large datasets
**Mitigation**: Benchmark in Phase 1, have fallback plans (xxhash, reduce frequency)
**Future Work**: If overhead >2ms, investigate WebAssembly hashing (hash-wasm)

### Issue 2: Field Type Migration Burden
**Impact**: Medium
**Description**: Must add metadata to 16+ field types manually
**Mitigation**: Safe defaults (supportsUpdate: false), comprehensive testing
**Future Work**: Auto-detection of update capability via renderer inspection

### Issue 3: No Incremental Hashing
**Impact**: Low
**Description**: Rehashes all rows even if only one changed
**Mitigation**: Acceptable overhead with fast paths
**Future Work**: Only hash rows that might have changed (incremental hashing)

---

## Future Enhancements

### Phase 2 (Post-Rollout)

**Goal**: Further performance improvements

**Enhancements**:
1. **Incremental hashing**: Only hash changed rows
2. **WebAssembly hashing**: Use hash-wasm for objects/arrays
3. **Cached computed chain**: cachedFilteredRows, cachedSortedRows
4. **Adaptive thresholds**: Tune based on dataset size
5. **Parallel hashing**: Web Workers for large datasets

**Effort**: 1-2 weeks
**Prerequisites**: Phase 1-5 complete, performance data collected

---

**Last Updated**: 2025-11-24
**Status**: Ready for implementation
**Next**: Begin Week 1 - Enhanced Snapshot System
