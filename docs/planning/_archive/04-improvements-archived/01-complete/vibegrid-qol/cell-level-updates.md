# VibeGrid Cell-Level Updates - Performance Optimization

**Status:** Planning
**Priority:** High
**Goal:** Eliminate unnecessary full-table re-renders, achieve 100-1000x performance improvement for cell updates
**Target:** Collaborative editing support with <1ms cell update latency

---

## Problem Statement

### Current Behavior (Inefficient)
Single cell updates trigger full table re-renders, destroying and recreating all DOM nodes:

```
User edits 1 cell → TanStack DB update → MobX processedRows recomputes
→ Reaction fires → renderBody() → 1,000+ DOM nodes destroyed/recreated
```

**Performance Impact (100-row × 10-column table):**
- Edit 1 cell: ~1,000 DOM operations (~50-100ms latency)
- Resize column: ~1,000 DOM operations
- User experiences visible lag

### Root Causes Identified

1. **Coarse-grained MobX reactions** (`SimplePassiveRenderer.ts:411-441`)
   - `tableCoreStore.processedRows` computed invalidates on ANY data change
   - Reaction calls `renderBody()` which clears and rebuilds entire table

2. **No granular update path** (`BodyRenderer.ts:199-355`)
   - Only `createRowElement()` exists (full row creation)
   - Missing: `updateCellValue()`, `updateRowElement()`
   - No diffing algorithm to detect what actually changed

3. **Column change cascade** (`SimplePassiveRenderer.ts:444-543`)
   - Three separate observers (visibility, order, widths)
   - All trigger full `renderBody()` even for single column resize
   - Should use direct style updates instead

4. **TanStack DB returns full result sets**
   - `useLiveQuery` returns complete array, not deltas
   - Need client-side diffing to identify changes

---

## Architecture Analysis

### Current Data Flow

```
TanStack DB Collection
  ↓ (useLiveQuery)
useVibeGridData hook
  ↓ (rows array)
VibeGrid.tsx (React + observer)
  ↓ (useEffect)
TableCoreStore.setRows(rows)
  ↓ (observable change)
TableCoreStore.processedRows (computed)
  ↓ (MobX reaction)
SimplePassiveRenderer.dataObserverDisposer
  ↓
renderBody() - FULL TABLE RE-RENDER
```

### Existing Infrastructure (✅ Ready for Optimization)

**Change Tracking:**
- ✅ All entities have `updatedAt` timestamp (auto-updated on mutations)
- ✅ All entities have `id` unique identifier
- ✅ TanStack DB handles optimistic updates

**Reference Data:**
- ✅ `membersData`: ObservableMap for user references
- ✅ `entityReferenceData`: ObservableMap for entity references
- ✅ Automatic reference resolution in `ensureEntityReferenceRecord()`

**DOM Structure:**
- ✅ Cells have `data-row-id` and `data-column-id` attributes
- ✅ Cell content wrapped in `.vibegridx-cell-content` element
- ✅ Modular cell bridge for type-specific rendering

---

## Solution: Cell-Level Granular Updates

### Implementation Strategy

**Three-tier update system:**

1. **Cell-level updates** - Single cell value changed
   - Detect: Compare previous/current row data
   - Action: Update `.vibegridx-cell-content` innerHTML only
   - Performance: 1 DOM operation per changed cell

2. **Row-level updates** - Multiple cells in same row changed
   - Detect: >3 cells changed in same row
   - Action: Replace entire row element
   - Performance: 10 DOM operations (create new row)

3. **Full table re-render** - Structure changed (sort/filter/new rows)
   - Detect: Row count changed, row order changed
   - Action: Current `renderBody()` behavior
   - Performance: Acceptable for structural changes

### Phase 1: Core Change Detection

**File:** `src/systems/vibegrid/stores/TableCoreStore.ts`

Add:
```typescript
// Track previous snapshot for diffing
private previousRowsSnapshot: Map<string, any> = new Map();

// Track last detected changes
@observable lastChangedCells: Map<string, Set<string>> = new Map();

// Detect changed cells
@action detectChangedCells(newRows: any[]): Map<string, Set<string>>

// Modified setRows() to call detectChangedCells()
@action setRows(rows: any[]): void
```

**Key Features:**
- Deep equality check for objects/arrays (`JSON.stringify` comparison)
- Special handling for reference fields (user_reference, entity_reference)
- Logging for debugging collaborative editing conflicts

**Estimated Lines:** ~100 lines

---

### Phase 2: Cell-Level Renderer Updates

**File:** `src/systems/vibegrid/renderers/components/BodyRenderer.ts`

Add:
```typescript
// Update single cell
updateCellValue(
  rowId: string,
  columnId: string,
  newValue: any,
  column: any
): boolean

// Batch update multiple cells
updateCells(changedCells: Map<string, Set<string>>): void

// Update entire row (fallback for multi-cell changes)
updateRowElement(rowId: string, rowIndex: number): boolean
```

**Implementation Details:**
- Use `modularCellBridge.createCell()` for proper formatting
- Extract innerHTML from temporary cell
- Update existing DOM without destroying/recreating
- Performance logging (cells updated, duration, avg per cell)

**Estimated Lines:** ~150 lines

---

### Phase 3: Smart Observer Logic

**File:** `src/systems/vibegrid/renderers/core/SimplePassiveRenderer.ts`

Modify `dataObserverDisposer` (lines 411-441):

```typescript
this.dataObserverDisposer = reaction(
  () => this.tableCoreStore.processedRows,
  (processedRows) => {
    // Guard: initialization check
    if (!this.observersEnabled || !this.initStore.isFullyHydrated) return;

    // Get detected changes
    const changedCells = this.tableCoreStore.lastChangedCells;

    if (changedCells?.size > 0) {
      // CELL-LEVEL PATH (new!)
      this.bodyRenderer.updateCells(changedCells);
      runInAction(() => {
        this.tableCoreStore.lastChangedCells.clear();
      });
      return; // ✅ No full re-render
    }

    // FULL RE-RENDER PATH (existing)
    // Triggered when: row count changed, sort/filter applied
    this.renderBody();
  }
);
```

**Estimated Lines:** ~30 lines modified

---

### Phase 4: Column Width Optimization

**File:** `src/systems/vibegrid/renderers/core/SimplePassiveRenderer.ts`

Replace column width observer (lines 510-543):

```typescript
this.columnWidthsObserverDisposer = reaction(
  () => this.visualStateStore.columnWidths,
  (columnWidths, prevWidths) => {
    // Guard checks...

    // Direct style updates - NO re-render
    Object.keys(columnWidths).forEach(columnId => {
      if (columnWidths[columnId] !== prevWidths?.[columnId]) {
        this.updateColumnWidth(columnId, columnWidths[columnId]);
      }
    });
  }
);

// New method:
private updateColumnWidth(columnId: string, newWidth: number): void {
  // Update header cell
  const headerCell = this.headerContainer.querySelector(
    `[data-column-id="${columnId}"]`
  );
  if (headerCell) headerCell.style.width = `${newWidth}px`;

  // Update all body cells
  const bodyCells = this.bodyContainer.querySelectorAll(
    `[data-column-id="${columnId}"]`
  );
  bodyCells.forEach(cell => cell.style.width = `${newWidth}px`);
}
```

**Estimated Lines:** ~40 lines

---

## Testing Strategy

### Unit Tests

**File:** `src/systems/vibegrid/stores/__tests__/TableCoreStore.test.ts`

Test cases:
```typescript
describe('detectChangedCells', () => {
  it('detects single cell change')
  it('detects multiple cell changes in one row')
  it('detects changes across multiple rows')
  it('handles new rows correctly')
  it('handles deleted rows correctly')
  it('detects user reference changes')
  it('detects entity reference changes')
  it('ignores unchanged data')
  it('handles empty arrays')
})
```

### Integration Tests

**File:** `src/systems/vibegrid/__tests__/cell-updates.integration.test.ts`

Test scenarios:
- Single user edits cell → verify only 1 DOM update
- Multiple users edit different cells → verify granular updates
- Bulk paste operation → verify batch update
- Column resize → verify style updates only
- Sort/filter → verify full re-render

### Performance Tests

**File:** `src/systems/vibegrid/__tests__/performance.test.ts`

Benchmark:
```typescript
describe('Cell update performance', () => {
  it('updates 1 cell in <1ms')
  it('updates 10 cells in <5ms')
  it('updates 100 cells in <20ms')
  it('column resize in <10ms')
})
```

### Manual Testing Checklist

- [ ] Edit single cell - verify instant update
- [ ] Edit multiple cells rapidly - verify smooth updates
- [ ] Paste data from clipboard - verify batch update
- [ ] Resize column - verify no table re-render
- [ ] Sort table - verify full re-render (expected)
- [ ] Filter table - verify full re-render (expected)
- [ ] Edit user reference field - verify reference loads
- [ ] Edit entity reference field - verify reference loads
- [ ] Open DevTools Performance tab - verify <1ms cell updates

---

## Implementation Phases

### Phase 1: Core Infrastructure (2-3 hours)
- [ ] Add `detectChangedCells()` to TableCoreStore
- [ ] Add `previousRowsSnapshot` tracking
- [ ] Modify `setRows()` to detect changes
- [ ] Add `lastChangedCells` observable
- [ ] Write unit tests for change detection
- [ ] Test: Verify change detection logs appear

**Success Criteria:**
- Change detection logs show correct cell changes
- Unit tests pass for all scenarios
- No regressions in existing functionality

### Phase 2: Cell-Level Renderer (2-3 hours)
- [ ] Add `updateCellValue()` to BodyRenderer
- [ ] Add `updateCells()` batch method
- [ ] Add `updateRowElement()` fallback
- [ ] Handle reference fields properly
- [ ] Add performance logging
- [ ] Write integration tests
- [ ] Test: Verify cells update without full re-render

**Success Criteria:**
- Cell updates visible in DOM without flicker
- Performance logs show <1ms per cell
- All cell types render correctly

### Phase 3: Observer Integration (1-2 hours)
- [ ] Modify `dataObserverDisposer` in SimplePassiveRenderer
- [ ] Add guards for initialization state
- [ ] Add fallback to full re-render for structural changes
- [ ] Test with real data updates
- [ ] Verify no regression in full re-render path
- [ ] Test: End-to-end cell editing flow

**Success Criteria:**
- Cell edits trigger granular updates
- Sorts/filters trigger full re-render
- No infinite loops or cascading re-renders

### Phase 4: Column Width Optimization (1 hour)
- [ ] Add `updateColumnWidth()` method
- [ ] Modify column widths observer
- [ ] Test column resize performance
- [ ] Verify header/body sync maintained
- [ ] Test: Resize column smoothly

**Success Criteria:**
- Column resize takes <10ms
- No table re-render on resize
- Header and body stay in sync

### Phase 5: Polish & Documentation (1 hour)
- [ ] Add JSDoc comments
- [ ] Update CLAUDE.md with new architecture
- [ ] Add logging presets for debugging
- [ ] Create troubleshooting guide
- [ ] Performance profiling report

**Total Estimated Time:** 7-10 hours

---

## Performance Targets

### Before Optimization (Baseline)

100-row × 10-column table:
- Edit 1 cell: ~50-100ms (1,000 DOM ops)
- Edit 10 cells: ~50-100ms (still full re-render)
- Resize column: ~50-100ms (1,000 DOM ops)
- Sort table: ~50-100ms (acceptable)

### After Optimization (Target)

100-row × 10-column table:
- Edit 1 cell: <1ms (1 DOM op) - **100x faster**
- Edit 10 cells: <5ms (10 DOM ops) - **20x faster**
- Resize column: <10ms (100 style updates) - **10x faster**
- Sort table: ~50-100ms (unchanged - still full re-render)

### Success Metrics

- ✅ Cell update latency <1ms (P50)
- ✅ Cell update latency <2ms (P95)
- ✅ Batch update (10 cells) <5ms
- ✅ Column resize <10ms
- ✅ No user-visible lag during editing
- ✅ Ready for collaborative editing (multiple cursors)

---

## Collaborative Editing Readiness

### Current State
- ✅ TanStack DB supports optimistic updates
- ✅ Entities have `updatedAt` timestamps
- ✅ Change detection can identify conflicts
- ✅ Reference data automatically resolves

### Future Work (Post-Optimization)
- [ ] Add conflict resolution UI
- [ ] Add user cursor indicators
- [ ] Add cell-level locking
- [ ] Add presence awareness (who's editing what)
- [ ] Add conflict merge strategies

### Architecture Notes
Cell-level updates are the foundation for collaborative editing:
- Each user's edit → TanStack DB optimistic update
- TanStack DB broadcasts to other clients
- Other clients receive updated entity
- Change detection identifies changed cells
- Granular update applies changes without disrupting other users

**This optimization is required before building collaborative features.**

---

## Risk Assessment

### Low Risk
- Change detection logic (isolated, well-tested)
- Cell update methods (isolated, can be feature-flagged)
- Column width optimization (independent)

### Medium Risk
- Observer modification (could affect initialization sequence)
- Reference field handling (needs careful testing)
- Edge cases: deleted rows, filtering, sorting

### Mitigation Strategies
1. **Feature flag:** Add `ENABLE_GRANULAR_UPDATES` flag
2. **Gradual rollout:** Test with single table first
3. **Logging:** Comprehensive debug logs for troubleshooting
4. **Fallbacks:** Always fall back to full re-render on errors
5. **Testing:** Extensive integration tests before merge

---

## Open Questions

1. **Should we batch cell updates?**
   - If 10+ cells change in <100ms, batch into single RAF?
   - Tradeoff: Latency vs efficiency

2. **How to handle animated cells?**
   - Highlight changed cells briefly?
   - Conflict indicators for collaborative editing?

3. **Column virtualization compatibility?**
   - Currently disabled (all columns render)
   - Will cell-level updates work with column virtualization?

4. **Memory management for previousRowsSnapshot?**
   - Map size grows with data size
   - Should we limit snapshot history?

---

## References

**Key Files:**
- `src/systems/vibegrid/stores/TableCoreStore.ts` - Data state
- `src/systems/vibegrid/renderers/components/BodyRenderer.ts` - Cell rendering
- `src/systems/vibegrid/renderers/core/SimplePassiveRenderer.ts` - Observer logic
- `src/systems/vibegrid/hooks/useVibeGridData.ts` - TanStack DB integration

**Related Docs:**
- MobX computed observables: https://mobx.js.org/computeds.html
- MobX reactions: https://mobx.js.org/reactions.html
- TanStack DB optimistic updates: (internal docs)

**Logging Presets:**
```javascript
__VIBEGRID_LOGS__.debugUpdates()  // See cell update logs
__VIBEGRID_LOGS__.quiet()         // Errors only
```

---

**Last Updated:** 2025-11-22
**Owner:** Engineering
**Reviewers:** TBD
**Status:** Ready for implementation
