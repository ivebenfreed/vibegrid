# Granular Update System Investigation

**Date:** 2025-11-24
**Status:** ❌ Failed - Needs Rearchitecting
**Related Commits:** 36a3af25, 50c5d050, 334a65d1, 7fe566b1

## Problem Statement

Fill handle and cell editing broke after attempting to optimize cell updates with a granular update system. The system was intended to avoid full table rerenders when only cell values changed, but it introduced critical bugs.

## Root Cause Analysis

### Breaking Commit: 45249680

This commit switched from innerHTML replacement to updateCell() method:

```typescript
// BEFORE (working):
const newCell = this.modularCellBridge.createCell(...)
cellElement.innerHTML = newCell.innerHTML

// AFTER (broken):
this.modularCellBridge.updateCell(cellElement, newValue, columnForRender, rowData)
```

**Why the change was made:**
- EntityName cells use JavaScript event listeners for hover effects (pencil icon, text underline)
- innerHTML replacement destroys these listeners
- Other field types use CSS :hover, so innerHTML works fine for them

**Why it broke:**
- `updateCell()` calls `EntityNameRenderer.update()`
- The update() method had implicit caching behavior
- First update works, subsequent updates silently fail
- Appears to work (returns success) but DOM doesn't update

### Failed Granular Update System: Commit 36a3af25

Attempted to add performance optimization with granular updates:

**Approach:**
1. Detect which specific cells changed (not just rows)
2. Use in-place mutation of rawRows to avoid triggering processedRows recomputation
3. Add computed `hasGranularUpdates` with trigger counter
4. Renderer observes trigger and calls updateCells() for changed cells only

**Why it failed:**
- In-place mutation doesn't trigger MobX observables properly
- Timing issues with computed evaluation (evaluated twice, observer never fired)
- Cache corruption from shared references between snapshot and rawRows
- Conflicts with our innerHTML cell update mechanism

## Working Solution

**Temporary fix (currently on dev1):**

1. Keep updateCell() approach (preserves EntityName hover listeners)
2. Force DOM updates in EntityNameRenderer.update():
   ```typescript
   // Always set properties, no caching checks
   textElement.textContent = newText
   textElement.style.opacity = newOpacity
   textElement.style.fontStyle = newFontStyle
   ```
3. Skip granular update system optimization

**Result:**
- ✅ Fill handle works
- ✅ EntityName hover effects work
- ❌ processedRows recomputes on every edit (performance issue)

## Why Granular Updates Are Hard

### Challenge 1: MobX Reactivity

**Problem:** Need to update data without triggering full recomputation

**Attempted solutions:**
- In-place mutation → MobX doesn't detect changes
- Array reassignment → Triggers processedRows computed
- Caching → Complex invalidation logic, race conditions

### Challenge 2: Cell Update Caching

**Problem:** Renderers have implicit caching/diffing behavior

**Observations:**
- `updateCell()` path doesn't always update DOM
- No explicit caching code visible
- Might be in React reconciliation or DOM diffing
- Forcing property assignment works, but why is it needed?

### Challenge 3: Observer Timing

**Problem:** MobX computed evaluation timing is unpredictable

**Symptoms from debugging:**
- `hasGranularUpdates` computed evaluated twice per change
- `lastChangedCells` Map cleared between evaluations (1-3ms gap)
- Autorun/reaction observers never execute
- No logs from observer callbacks despite trigger increments

## Proposed Rearchitecture

### Option 1: Fix the Caching (Recommended)

**Investigate why EntityNameRenderer.update() has implicit caching:**
1. Add detailed logging to CellFactory.updateCell()
2. Add logging to EntityNameRenderer.update()
3. Check if querySelector is finding the right element
4. Verify textContent is actually being set
5. Check if there's DOM reconciliation happening

**Then implement proper forced updates for ALL field types**

### Option 2: Hybrid Approach

**Use updateCell() for EntityName, innerHTML for others:**
```typescript
if (column.fieldType?.type === 'entity-name') {
  this.modularCellBridge.updateCell(...)
} else {
  cellElement.innerHTML = newCell.innerHTML
}
```

**Pros:** Best of both worlds
**Cons:** More complex, harder to maintain

### Option 3: CSS-Only Hover Effects

**Reimplement EntityName hover effects with CSS:**
```css
.vibegridx-cell-entity-name:hover .edit-icon {
  opacity: 0.6;
}
.vibegridx-entity-name-text:hover {
  text-decoration: underline;
}
```

**Pros:** innerHTML approach works for all cells
**Cons:** Loses programmatic control, might limit future features

### Option 4: Proper Granular Update System

**Requirements:**
1. Array reassignment (MobX-friendly)
2. processedRows caching with smart invalidation
3. Separate data changes from config changes
4. Reliable observer that fires on every trigger increment
5. Deep clone snapshots to prevent corruption

**Complexity:** High - needs careful design and testing

## Recommended Path Forward

1. **Short term:** Keep current forced update solution
   - Monitor for any other field types with caching issues
   - Add forced updates to other renderers if needed

2. **Medium term:** Implement Option 3 (CSS hover)
   - Simplifies cell update logic
   - Enables consistent innerHTML approach
   - Unblocks granular update optimization

3. **Long term:** Implement Option 4 (proper granular updates)
   - After CSS hover migration is complete
   - Use array reassignment + processedRows caching
   - Thorough testing at each step

## Files Involved

**Core rendering:**
- src/systems/vibegrid/renderers/components/BodyRenderer.ts
- src/systems/vibegrid/factories/CellFactory.ts
- src/systems/vibegrid/field-types/ModularCellBridge.ts

**Field types:**
- src/systems/vibegrid/field-types/implementations/basic/EntityNameFieldType.ts
- src/systems/vibegrid/field-types/implementations/basic/TextFieldType.ts
- src/systems/vibegrid/field-types/implementations/basic/SelectFieldType.ts

**State management:**
- src/systems/vibegrid/stores/TableCoreStore.ts
- src/systems/vibegrid/renderers/core/SimplePassiveRenderer.ts

## References

- Session: sessions/2025-11-24/session-2/
- Backup branch: backup-attempted-fixes
- Analysis doc: GRANULAR-UPDATE-BUG-ANALYSIS.md (if exists on backup branch)
