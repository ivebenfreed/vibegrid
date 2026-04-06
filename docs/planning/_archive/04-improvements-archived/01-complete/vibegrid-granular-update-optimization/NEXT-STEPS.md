# Next Steps: Fix Baseline Snapshot Timing

**Created:** 2025-11-24 Session 7
**Status:** Blocked - Week 3 implementation incomplete
**Blocker:** Baseline snapshot timing issue

---

## The Problem

Version-based observer implemented correctly, but **never fires** because versions don't increment.

### Root Cause:
1. Baseline snapshot created **during first edit** (not initial load)
2. detectChangedCells() returns empty when creating baseline
3. classifyChanges() returns `ChangeType.NONE`
4. setRows() exits early without incrementing versions ❌
5. Version observer never fires ❌

### Why Baseline Created Late:
- Initial load: Rows arrive **before** columns
- detectChangedCells() skips when `columns.length === 0`
- First edit: Columns NOW loaded → baseline gets created → returns empty

---

## The Solution

### Use InitStore to Create Baseline at Right Time

**Step 1:** Add method to `TableCoreStore.ts`:

```typescript
/**
 * Initialize baseline snapshot when both schema and data are ready
 * Called by VibeGrid after InitStore marks both dependencies as loaded
 */
@action
initializeBaselineSnapshot(): void {
  console.log('🎯 [BASELINE] Initializing baseline snapshot', {
    hasColumns: this.columns.length > 0,
    hasRows: this.rawRows.length > 0,
    previousSnapshotSize: this.previousRowsSnapshot.size
  })

  if (this.columns.length > 0 && this.rawRows.length > 0 && this.previousRowsSnapshot.size === 0) {
    // Force baseline creation by calling setRows with current data
    // This will trigger detectChangedCells which will create the baseline
    const currentRows = this.rawRows.slice()
    this.setRows(currentRows)
    console.log('✅ [BASELINE] Baseline snapshot created', {
      snapshotSize: this.previousRowsSnapshot.size
    })
  }
}
```

**Step 2:** Call from `VibeGrid.tsx` when both ready:

Find where both `schemaLoaded` and `entityDataLoaded` are marked ready, then add:

```typescript
// After InitStore marks BOTH dependencies ready
useEffect(() => {
  if (initStore.schemaLoaded && initStore.entityDataLoaded) {
    tableCoreStore.initializeBaselineSnapshot()
  }
}, [initStore.schemaLoaded, initStore.entityDataLoaded])
```

Or use MobX autorun/reaction for cleaner integration.

**Step 3:** Test the fix:

1. Reload page
2. Check console: Should see "✅ [BASELINE] Baseline snapshot created" on initial load
3. Edit a cell
4. Check console: Should see:
   - `🔥 [SETROWS] Called!` with versions > 0
   - `🔍 [SETROWS] Change classification {changeType: 'cells', ...}`
   - `🔍 [VERSION OBSERVER] Selector running`
   - `🎯 [VERSION OBSERVER] Reaction fired!`
   - `🎯 Cell-level update (fast path)`

---

## Files to Modify

### 1. TableCoreStore.ts
- Add `initializeBaselineSnapshot()` method
- Location: After setRows() method (around line 415)

### 2. VibeGrid.tsx
- Find where InitStore dependencies are checked
- Add call to `initializeBaselineSnapshot()` when both ready
- Use autorun or useEffect

---

## Files to Clean Up (After Fix Works)

### Remove Debug Logging:
1. `SimplePassiveRenderer.ts`:
   - Line 418: `console.log('🎯 [RENDERER] Initializing...')`
   - Line 424: `console.log('🎯 [RENDERER] Creating version-based...')`
   - Line 435: `console.log('🔍 [VERSION OBSERVER] Selector running')`
   - Line 439: `console.log('🎯 [VERSION OBSERVER] Reaction fired!')`

2. `TableCoreStore.ts`:
   - Line 349: `console.log('🔥 [SETROWS] Called!')`
   - Line 369: `console.log('🔍 [SETROWS] Change classification')`

Convert useful ones to `fileLog.debug()` for permanent debugging.

---

## Expected Timeline

**Next Session:**
1. Baseline fix: 30 minutes
2. Testing: 30 minutes
3. Clean up: 20 minutes
4. Documentation: 10 minutes
5. Commit: 10 minutes

**Total:** ~2 hours to complete Week 3

---

## Success Criteria

### Baseline Timing Fixed:
- ✅ Baseline created on initial load (not first edit)
- ✅ `previousRowsSnapshot.size > 0` before first edit
- ✅ detectChangedCells() finds actual changes on first edit

### Version Observer Working:
- ✅ Selector logs show observer tracking versions
- ✅ Reaction fires when versions change
- ✅ Routes to correct strategy (cell-level for small edits)

### Performance Gains Realized:
- ✅ Single cell edit: <5ms (no processedRows log)
- ✅ Fill handle: <50ms for 10 cells
- ✅ Sort/filter: Still triggers full render (correct)

### Code Clean:
- ✅ All debug console.logs removed
- ✅ TypeScript passes
- ✅ No regressions in existing functionality

---

**Priority:** 🔴 HIGH - Unblocks Week 3 completion
**Complexity:** 🟢 LOW - Solution is clear, just needs implementation
**Risk:** 🟢 LOW - Isolated change, well-tested debugging path
