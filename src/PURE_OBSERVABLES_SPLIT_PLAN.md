# Pure Observables Split Plan (Corrected)

**Date:** 2025-09-13
**Scope:** Split `pure-observables.ts` (1,649 lines) into focused 3-layer architecture
**Strategy:** Conservative refactor - move code, don't rewrite logic
**Timeline:** 1 week focused effort

## Objective

Split the monolithic `pure-observables.ts` into 3 focused files while keeping all other VibeGrid code completely untouched, **including the excellent `visual-state.ts` system that already fixed the scroll sync issue**. This is a **surgical refactor** - we're organizing existing working code, not changing functionality.

## ✅ Systems Already Working Well (DO NOT TOUCH)

- **`visual-state.ts`** (350 lines) - Sophisticated layout calculations, scroll sync **FIXED and WORKING**
- **`columns-observable.ts`** (320 lines) - Column management operations
- **Selection/Editing systems** - Complex but working perfectly

---

## Current Analysis

### pure-observables.ts Structure (1,649 lines)
```typescript
// Already has 3-layer architecture defined:
1. tableCore$ - Data & Configuration (~400 lines)
2. tableInteraction$ - UI State (~800 lines)
3. tableViewport$ - Scroll State (~200 lines)
// Plus utility functions, types, operations (~249 lines)
```

### Current Exports
```typescript
export function createPureObservables(entityType: string, columns: Column[]) {
  return {
    tableCore$,
    tableCoreSync$,
    tableInteraction$,
    tableViewport$
  };
}

export type { TableCore$, TableInteraction$, TableViewport$ };
```

---

## Target Architecture

### New File Structure (Consistent Naming)
```
stores/
├── visual-state.ts       # ENHANCED - All visual/layout/viewport (~550 lines)
│   ├── Current: Layout calculations, scroll sync (350 lines) ✅
│   └── Merge: tableViewport$ from pure-observables (~200 lines)
│   └── Merge: columns-observable.ts operations (~320 lines)
├── data-state.ts         # tableCore$ + operations (~450 lines) - NEW
├── interaction-state.ts  # tableInteraction$ + operations (~850 lines) - NEW
├── pure-observables.ts   # Factory function only (~50 lines) - UPDATED
└── index.ts             # Re-exports for compatibility (~20 lines)
```

### Consolidated Visual System
```typescript
// visual-state.ts (ENHANCED - all visual concerns in one place)
export const visualInputs$ = observable({
  // Current visual inputs (KEEP)
  scrollLeft: 0,
  scrollTop: 0,
  viewportWidth: 0,
  viewportHeight: 0,

  // Column inputs (MERGE from columns-observable.ts)
  columns: [] as Column[],
  columnWidths: {} as Record<string, number>,
  columnVisibility: {} as Record<string, boolean>,
  columnOrder: [] as string[],

  // Context
  entityType: '',
  orgId: '',
  userId: ''
});

// Keep the excellent computed visual state (ENHANCED)
export const visualState$ = computed(() => {
  const inputs = visualInputs$.get();
  const rowCount = dataState$.processedRows.length; // Read from data layer

  return {
    // Current calculations (KEEP)
    columnLayouts: calculateColumnLayouts(inputs),
    geometry: calculateViewportGeometry(inputs, rowCount),
    totalWidth: calculateTotalWidth(inputs),

    // Additional viewport calculations (MERGE from tableViewport$)
    visibleRange: calculateVisibleRange(inputs),
    virtualRows: calculateVirtualRows(inputs, rowCount)
  };
});
```

### Preserved API
```typescript
// Keep exact same public API - zero breaking changes
export function createPureObservables(entityType: string, columns: Column[]) {
  return {
    tableCore$: createTableCore$(entityType, columns),
    tableCoreSync$: createTableCoreSync$(entityType, columns),
    tableInteraction$: createTableInteraction$(),
    tableViewport$: createTableViewport$()
  };
}

// All existing type exports remain the same
export type { TableCore$, TableInteraction$, TableViewport$ };
```

---

## Implementation Plan

### Day 1: Setup & Analysis

#### Create File Structure
```bash
cd src/components/custom/vibegrid/stores/
touch data-core.ts
touch interaction-core.ts
touch viewport-core.ts
```

#### Analyze Current Dependencies
```bash
# Find all files that import from pure-observables.ts
grep -r "from.*pure-observables" --include="*.ts" --include="*.tsx" .

# Document the exact import patterns used
grep -r "import.*pure-observables" --include="*.ts" --include="*.tsx" .
```

### Day 2: Extract Data Core

#### Create data-state.ts
```typescript
/**
 * Data Core - tableCore$ and tableCoreSync$ observables
 * Extracted from pure-observables.ts lines 50-450
 */
import { observable, computed, batch } from '@legendapp/state';
import { syncObservable } from '@legendapp/state/sync';
// ... other imports

// Copy tableCore$ observable definition (lines ~50-200)
// Copy tableCoreSync$ definition (lines ~200-300)
// Copy all data operations (lines ~300-450)
// Copy related types and interfaces

export function createTableCore$(entityType: string, columns: Column[]) {
  // Move tableCore$ creation logic here
}

export function createTableCoreSync$(entityType: string, columns: Column[]) {
  // Move tableCoreSync$ creation logic here
}

// Export types that were internal to tableCore$
export type { TableCore$, TableCoreState, /* other related types */ };
```

#### Test Data Core
- Run existing tests to ensure data operations work
- Verify sorting, filtering, grouping still function
- Check persistence works correctly

### Day 3: Extract Interaction Core

#### Create interaction-state.ts
```typescript
/**
 * Interaction Core - tableInteraction$ observable
 * Extracted from pure-observables.ts lines 450-1250
 */
import { observable } from '@legendapp/state';

// Copy tableInteraction$ observable definition (lines ~450-600)
// Copy all selection operations (lines ~600-900)
// Copy all editing operations (lines ~900-1100)
// Copy all UI state operations (lines ~1100-1250)
// Copy related types and interfaces

export function createTableInteraction$() {
  // Move tableInteraction$ creation logic here
  return observable({
    // All the selection state
    selectedCells: new Set<string>(),
    selectedRows: new Set<string>(),
    // ... rest of interaction state

    // All the operations
    selectCell: (cellId: string, isMulti?: boolean) => {
      // Move selection logic here
    },
    // ... rest of operations
  });
}

export type { TableInteraction$, TableInteractionState, /* other types */ };
```

#### Test Interaction Core
- Test cell selection (single, multi, range)
- Test row selection (checkbox, shift-click)
- Test editing operations
- Test hover and drag states

### Day 4: Extract Viewport Core

#### Create viewport-core.ts
```typescript
/**
 * Viewport Core - tableViewport$ observable
 * Extracted from pure-observables.ts lines 1250-1450
 */
import { observable } from '@legendapp/state';

// Copy tableViewport$ observable definition (lines ~1250-1350)
// Copy viewport operations (lines ~1350-1450)
// Copy related types

export function createTableViewport$() {
  // Move tableViewport$ creation logic here
  return observable({
    viewportWidth: 0,
    viewportHeight: 0,
    scrollLeft: 0,
    scrollTop: 0,

    // Move all viewport operations here
    updateScroll: (scrollTop: number, scrollLeft: number) => {
      // Move scroll logic here
    },
    // ... rest of viewport operations
  });
}

export type { TableViewport$, ViewportState, /* other types */ };
```

#### Test Viewport Core
- Test scroll synchronization
- Test virtual scrolling calculations
- Test viewport resize handling

### Day 5: Update Factory & Clean Up

#### Update pure-observables.ts (1,649 → 50 lines)
```typescript
/**
 * Pure Observables Factory - Creates the 3-layer observable architecture
 * This file now serves as a factory that combines the 3 core observables
 */
import { createTableCore$, createTableCoreSync$ } from './data-core';
import { createTableInteraction$ } from './interaction-core';
import { createTableViewport$ } from './viewport-core';

// Re-export types for compatibility
export type { TableCore$, TableCoreState } from './data-core';
export type { TableInteraction$, TableInteractionState } from './interaction-core';
export type { TableViewport$, ViewportState } from './viewport-core';

// Keep the exact same factory function API
export function createPureObservables(entityType: string, columns: Column[]) {
  const tableCore$ = createTableCore$(entityType, columns);
  const tableCoreSync$ = createTableCoreSync$(entityType, columns);
  const tableInteraction$ = createTableInteraction$();
  const tableViewport$ = createTableViewport$();

  return {
    tableCore$,
    tableCoreSync$,
    tableInteraction$,
    tableViewport$
  };
}
```

#### Update stores/index.ts
```typescript
// Re-export everything for compatibility
export * from './pure-observables';
export * from './visual-state';
// Note: Don't export individual cores to prevent direct usage
```

### Day 6: Integration Testing

#### Test Current VibeGrid Components
- Test `VibeGrid.tsx` still works (main component)
- Test `VibeGridXHeaderPure.tsx` still works
- Test all editing overlays still work
- Test selection manager still works

#### Verify No Breaking Changes
```bash
# Run type checking
pnpm type-check

# Run any existing tests
pnpm test # (if tests exist)

# Manual testing checklist:
# - Table loads with data ✓
# - Sorting works ✓
# - Filtering works ✓
# - Grouping works ✓
# - Cell selection works ✓
# - Row selection works ✓
# - Editing works ✓
# - Scrolling works ✓
```

#### Performance Validation
- Compare memory usage before/after
- Check for any performance regressions
- Validate virtual scrolling still smooth

### Day 7: Documentation & Cleanup

#### Update Documentation
```typescript
// Add JSDoc to each new file explaining its purpose
// Update any existing documentation references
// Add migration notes for future developers
```

#### Final Verification
- All imports resolve correctly
- No circular dependencies introduced
- TypeScript compilation succeeds
- Original functionality preserved

---

## Safety Measures

### Backup Strategy
```bash
# Before starting, backup the current working state
cp pure-observables.ts pure-observables.ts.backup
git add . && git commit -m "Backup before pure-observables split"
```

### Rollback Plan
```bash
# If anything breaks, immediate rollback:
git checkout HEAD~1 -- stores/
# Restore the backup and continue with current code
```

### Testing Checkpoints
At each day, run this verification:
```bash
# 1. TypeScript compiles
pnpm type-check

# 2. Basic functionality works
# - Open VibeGrid component
# - Test basic selection
# - Test basic editing
# - Test basic scrolling
```

---

## What Stays Completely Untouched

### Zero Changes to These Files ✅
- **`visual-state.ts`** - KEEP AS-IS (350 lines) - **Crown jewel that fixed scroll sync**
- **`columns-observable.ts`** - KEEP AS-IS (320 lines) - Column operations working
- `SelectionManager.ts` - Keep as-is (364 lines) - Complex selection logic
- `EditingOverlay.tsx` - Keep as-is (375 lines) - Complex React portal system
- All 12 editors in `overlays/editors/` - Keep as-is - Sophisticated editor system
- All cell renderers in `renderers/cell-renderers/` - Keep as-is - Performance-critical
- `data-loading-stages.ts` - Keep as-is for now - Over-engineered but working
- All manager classes - Keep as-is for now - Complex but functional
- All React components - Keep as-is - UI components working

### API Compatibility Promise
- All existing imports continue to work
- All existing function signatures unchanged
- All existing type exports available
- Zero breaking changes to consuming components

---

## Expected Outcome

### Before
```
stores/pure-observables.ts    1,649 lines (monolithic)
```

### After
```
stores/
├── data-core.ts             ~450 lines (tableCore$ extracted)
├── interaction-core.ts      ~850 lines (tableInteraction$ extracted)
├── viewport-core.ts         ~250 lines (tableViewport$ extracted)
├── pure-observables.ts      ~50 lines (factory only)
└── index.ts                 ~20 lines (exports)

Total: ~1,620 lines (organized into focused files)
```

### Benefits
1. **Easier to Navigate** - Find selection logic in `interaction-core.ts`
2. **Easier to Test** - Test each layer independently
3. **Easier to Debug** - Smaller files, clearer boundaries
4. **Easier to Maintain** - Work on one concern at a time
5. **Same Functionality** - Zero behavior changes

### Validation Metrics
- ✅ All existing functionality preserved
- ✅ All existing APIs unchanged
- ✅ Performance maintained
- ✅ Memory usage unchanged
- ✅ Type safety preserved

---

## Risk Assessment

### Very Low Risk ✅
- Moving code between files (not changing logic)
- Maintaining exact same public API
- Keeping all complex systems (selection, editing) untouched
- Conservative approach with checkpoints

### Mitigation Strategies
- Daily backup checkpoints
- Immediate rollback plan ready
- Test after each extraction
- Preserve all imports/exports

This focused plan splits the monolithic file while keeping everything else stable and unchanged.