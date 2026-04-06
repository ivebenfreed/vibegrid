# VibeGrid State Migration Plan (Copy & Migrate Approach)

**Goal**: Migrate existing VibeGrid from Legend State to MobX + TanStack DB

**Approach**: Copy complete working implementation → Migrate state layer → Test

**Timeline**: 2-3 weeks (not 8 weeks - we're migrating, not rewriting!)

**Source**: `archive/vibegrid/` (121 files, ~20,000 lines)

**Test Route**: `/debug/vibegrid` using WorkTask entity

---

## Migration Philosophy

### What We're Doing
✅ **Copy** all 121 files from archive
✅ **Preserve** all DOM manipulation, rendering, algorithms
✅ **Replace** only state management layer (Legend State → MobX)
✅ **Replace** only data access layer (entity atoms → TanStack DB)
✅ **Test** incrementally as we migrate

### What We're NOT Doing
❌ Rewriting from scratch
❌ Changing DOM rendering system
❌ Changing hybrid React + DOM architecture
❌ Rewriting selection/editing/grouping logic
❌ Building new components

---

## Phase 1: Copy & Inventory (Week 1 - Days 1-2)

### Day 1: Copy Files & Initial Assessment

#### Copy Complete Implementation
```bash
# Copy entire archive to src
cp -r archive/vibegrid/ src/components/vibegrid/

# Verify file count
find src/components/vibegrid -type f | wc -l  # Should be 121

# Initial type check (will have errors - expected!)
pnpm typecheck
```

**Expected**: Many type errors due to missing Legend State package

#### Create Catalog of Changes Needed

**Task**: Run automated search to find all state usage:

```bash
# Find all Legend State imports
grep -r "@legendapp/state" src/components/vibegrid/ > /tmp/legend-imports.txt

# Find all observable() calls
grep -r "observable(" src/components/vibegrid/ > /tmp/observable-calls.txt

# Find all computed() calls
grep -r "computed(" src/components/vibegrid/ > /tmp/computed-calls.txt

# Find all entity atom access
grep -r "getEntity\$" src/components/vibegrid/ > /tmp/entity-access.txt

# Find all .get() calls
grep -r "\.get()" src/components/vibegrid/ > /tmp/get-calls.txt

# Find all .set() calls
grep -r "\.set(" src/components/vibegrid/ > /tmp/set-calls.txt
```

**Deliverable**: Catalog document with counts and locations

---

### Day 2: Create Migration Checklist

#### Analyze State Files

**Core state files to migrate**:
- [ ] `stores/data-state.ts` - Entity data processing
- [ ] `stores/visual-state.ts` - Layout computations
- [ ] `stores/interaction-state.ts` - Selection/editing
- [ ] `stores/simple-persistence.ts` - LocalStorage sync
- [ ] `stores/init-state.ts` - Initialization logic

#### Create Conversion Table

Document each file with:
- Current Legend State patterns used
- Target MobX patterns
- Estimated effort (small/medium/large)
- Dependencies on other files

#### Verify Prerequisites

- [ ] TanStack DB infrastructure exists
- [ ] `useEntityCollection()` hook available
- [ ] Fetch limit lifted (or pagination planned)
- [ ] MobX configured in project (strict mode)
- [ ] Dev server running

**Deliverable**: Complete migration checklist with priority order

---

## Phase 2: Store Migration (Week 1-2 - Days 3-7)

### Day 3-4: Convert Core Stores

#### TableCoreStore (Data State)

**Source**: `stores/data-state.ts`

**Changes**:
```typescript
// BEFORE (Legend State)
const tableCore$ = observable({
  filters: [] as FilterConfig[],
  sortBy: [] as SortConfig[],
  groupConfig: null as GroupConfig | null,

  processedRows: computed(() => {
    const entities = getEntity$(entityType).get();
    // ... filtering/sorting logic
  })
});

// AFTER (MobX)
export class TableCoreStore implements IStore {
  @observable filters: FilterConfig[] = [];
  @observable sortBy: SortConfig[] = [];
  @observable groupConfig: GroupConfig | null = null;

  constructor() {
    makeObservable(this, {
      filters: observable,
      sortBy: observable,
      groupConfig: observable,
      filterSnapshot: computed,
      setFilters: action
    });
  }

  @computed get filterSnapshot(): FilterConfig[] {
    return toJS(this.filters);
  }

  @action setFilters(filters: FilterConfig[]): void {
    this.filters = filters;
  }

  async init(): Promise<void> { /* localStorage load */ }
  dispose(): void { /* cleanup */ }
  reset(): void { /* reset state */ }
}
```

**Note**: `processedRows` logic moves to TanStack DB integration layer

---

#### VisualStateStore (Visual State)

**Source**: `stores/visual-state.ts`

**Changes**:
```typescript
// BEFORE (Legend State)
const visualState$ = computed((): VisualState => {
  const inputs = visualInputs$.get();
  // ... compute column layouts, geometry
});

// AFTER (MobX)
export class VisualStateStore implements IStore {
  @observable columnWidths: Record<string, number> = {};
  @observable scrollTop = 0;
  @observable scrollLeft = 0;

  @computed get columnLayouts(): ColumnLayout[] {
    // ... compute from observables
  }

  @computed get geometry(): ViewportGeometry {
    // ... compute viewport geometry
  }

  @action setColumnWidth(columnId: string, width: number): void {
    this.columnWidths[columnId] = width;
  }

  async init(): Promise<void> { /* ... */ }
  dispose(): void { /* ... */ }
  reset(): void { /* ... */ }
}
```

**Copy all computed logic** from original file - no changes needed!

---

#### InteractionStore (Selection/Editing)

**Source**: `stores/interaction-state.ts`

**Changes**:
```typescript
// BEFORE (Legend State)
const tableInteraction$ = observable({
  selectedCells: new Set<string>(),
  editingCell: null as string | null,

  operations: {
    toggleCellSelection: (rowId, colId, ctrl, shift) => {
      // ... complex selection logic
    }
  }
});

// AFTER (MobX)
export class InteractionStore implements IStore {
  @observable selectedCells = new Set<string>();
  @observable editingCell: string | null = null;

  @action toggleCellSelection(
    rowId: string,
    colId: string,
    ctrl: boolean,
    shift: boolean
  ): void {
    // ... COPY exact same logic from archive
  }

  async init(): Promise<void> { /* ... */ }
  dispose(): void { /* ... */ }
  reset(): void { /* ... */ }
}
```

**Copy all 20+ selection methods** - logic stays identical!

---

#### Store Context

**Create**: `stores/context.tsx`

```typescript
import { createContext, useContext, ReactNode } from 'react';
import { TableCoreStore } from './TableCoreStore';
import { VisualStateStore } from './VisualStateStore';
import { InteractionStore } from './InteractionStore';

interface VibeGridStores {
  tableCoreStore: TableCoreStore;
  visualStateStore: VisualStateStore;
  interactionStore: InteractionStore;
}

const VibeGridStoreContext = createContext<VibeGridStores | null>(null);

export function useVibeGridStores(): VibeGridStores {
  const stores = useContext(VibeGridStoreContext);
  if (!stores) throw new Error('useVibeGridStores must be within provider');
  return stores;
}

export const VibeGridStoreProvider = VibeGridStoreContext.Provider;
```

**Deliverable**: All three stores converted, tested in isolation

---

### Day 5-6: TanStack DB Integration

#### Create Integration Hook

**Create**: `hooks/useVibeGridData.ts`

```typescript
import { useLiveQuery } from '@tanstack/react-db';
import { useEntityCollection } from '@/data/db/hooks/useEntityCollection';
import { useMobxSnapshot } from './useMobxSnapshot';
import { useVibeGridStores } from '../stores/context';

export function useVibeGridData(entityType: string) {
  const stores = useVibeGridStores();
  const collection = useEntityCollection(entityType);

  // Bridge MobX computed → React state (stable references)
  const querySnapshot = useMobxSnapshot(
    () => stores.tableCoreStore.querySnapshot
  );
  const queryKey = useMobxSnapshot(
    () => stores.tableCoreStore.queryKey
  );

  // Reactive query with filtering/sorting/grouping
  const { data: rows } = useLiveQuery(
    useCallback((q) => {
      if (!collection) return undefined;

      let query = q.from({ entity: collection });

      // Apply filters from stable snapshot
      querySnapshot.filters.forEach(filter => {
        query = query.where(({ entity }) =>
          // COPY filter logic from archive
          applyFilterOperator(entity, filter)
        );
      });

      // Apply sorting
      querySnapshot.sortBy.forEach(({ field, direction }) => {
        query = query.orderBy(({ entity }) => entity[field], direction);
      });

      return query.select(({ entity }) => entity);
    }, [collection, querySnapshot]),
    [collection, queryKey]
  );

  // CRUD mutations
  const updateEntity = useCallback((rowId: string, updates: any) => {
    if (!collection) return;

    const tx = collection.update(rowId, (draft) => {
      Object.assign(draft, updates);
    });

    return tx.isPersisted.promise;
  }, [collection]);

  return {
    rows: rows || [],
    isLoading: !collection || !rows,
    updateEntity,
    deleteEntity: /* ... */,
    collection
  };
}
```

**Create**: `hooks/useMobxSnapshot.ts`

```typescript
import { useState, useEffect } from 'react';
import { autorun } from 'mobx';

export function useMobxSnapshot<T>(selector: () => T): T {
  const [snapshot, setSnapshot] = useState(() => selector());

  useEffect(() => {
    const dispose = autorun(() => setSnapshot(selector()));
    return dispose;
  }, [selector]);

  return snapshot;
}
```

**Copy filter/sort/grouping logic** from `stores/data-state.ts` - no changes!

---

### Day 7: Update Main Component

#### VibeGrid.tsx

**Changes**:

```typescript
// BEFORE (Legend State)
import { useSelector } from '@legendapp/state/react';

export function VibeGrid<T extends object>({ ... }) {
  const rows = useSelector(tableCore$.processedRows);
  // ...
}

// AFTER (MobX + TanStack DB)
import { observer } from 'mobx-react-lite';
import { useVibeGridData } from './hooks/useVibeGridData';
import { VibeGridStoreProvider } from './stores/context';

export const VibeGrid = observer(function VibeGrid<T>({
  entityType,
  tableId,
  ...props
}) {
  // Create stores (with proper lifecycle)
  const stores = useMemo(() => ({
    tableCoreStore: new TableCoreStore(entityType, tableId),
    visualStateStore: new VisualStateStore(entityType, tableId),
    interactionStore: new InteractionStore(entityType, tableId)
  }), [entityType, tableId]);

  // Initialize on mount
  useEffect(() => {
    Promise.all([
      stores.tableCoreStore.init(),
      stores.visualStateStore.init(),
      stores.interactionStore.init()
    ]);

    return () => {
      stores.tableCoreStore.dispose();
      stores.visualStateStore.dispose();
      stores.interactionStore.dispose();
    };
  }, [stores]);

  // Integration layer - MobX → TanStack DB
  const { rows, isLoading, updateEntity } = useVibeGridData(entityType);

  // Keep all existing rendering logic!
  const containerRef = useRef<HTMLDivElement>(null);

  // ... rest of component identical to archive

  return (
    <VibeGridStoreProvider value={stores}>
      {/* ... same JSX as archive ... */}
    </VibeGridStoreProvider>
  );
});
```

**Keep unchanged**:
- All DOM renderer initialization
- All event handlers
- All refs and effects
- All child components

---

## Phase 3: Component Updates (Week 2 - Days 8-10)

### Day 8-9: Add Observer Wrappers

#### Components That Need Changes

**React components that read state** (~10-15 files):
- `components/VibeGridXHeaderPure.tsx`
- `components/GroupConfigPanel.tsx`
- `components/VibeGridXColumnVisibilityPure.tsx`
- `overlays/ReactiveOverlayManager.tsx`
- `overlays/editors/*` (if they read state)

**Pattern**:
```typescript
// BEFORE
export function HeaderComponent() {
  const sortBy = useSelector(visualInputs$.sortBy);
  // ...
}

// AFTER
import { observer } from 'mobx-react-lite';
import { useVibeGridStores } from '../stores/context';

export const HeaderComponent = observer(function HeaderComponent() {
  const { tableCoreStore } = useVibeGridStores();
  const sortBy = tableCoreStore.sortBy;  // Direct access
  // ... rest identical
});
```

**Files that DON'T need changes** (~100 files):
- All DOM renderers (no state access)
- All utilities
- All types
- All constants
- Pure editor components
- Factories and managers

---

### Day 10: Update Visual Operations

#### Replace .set() with @action calls

**BEFORE**:
```typescript
visualInputs$.columnWidths[columnId].set(newWidth);
```

**AFTER**:
```typescript
visualStateStore.setColumnWidth(columnId, newWidth);
```

**Search and replace** across all files:
- `visualInputs$.*.set()` → `visualStateStore.set*()`
- `tableCore$.*.set()` → `tableCoreStore.set*()`
- `tableInteraction$.*.set()` → `interactionStore.set*()`

**Automated approach**:
```bash
# Find all .set() calls
grep -rn "\.set(" src/components/vibegrid/ > /tmp/set-calls.txt

# Convert systematically
# (might need manual review for each)
```

---

## Phase 4: Testing & Validation (Week 3 - Days 11-14)

### Day 11: Create Test Routes

#### Archive Version Test
```typescript
// src/routes/debug/vibegrid-archive.tsx
// Mount original Legend State version (if possible)
// OR just document current behavior
```

#### MobX Version Test
```typescript
// src/routes/debug/vibegrid.tsx
import { VibeGrid } from '@/components/vibegrid/VibeGrid';

export const Route = createFileRoute('/debug/vibegrid')({
  component: () => (
    <div className="container mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">VibeGrid - MobX + TanStack DB</h1>
      <VibeGrid
        entityType="WorkTask"
        tableId="debug-worktask"
        height={800}
        enableGrouping={true}
        enableSelectionColumn={true}
      />
    </div>
  )
});
```

---

### Day 12-13: Feature Validation

#### Manual Testing Checklist

- [ ] **Basic rendering**
  - [ ] Table loads with data
  - [ ] Correct row/column count
  - [ ] Virtual scrolling works

- [ ] **Column operations**
  - [ ] Sort (single column)
  - [ ] Sort (multi-column)
  - [ ] Resize
  - [ ] Reorder
  - [ ] Visibility toggle

- [ ] **Selection**
  - [ ] Single cell
  - [ ] Range (Shift)
  - [ ] Multi (Ctrl)
  - [ ] Row selection
  - [ ] Keyboard navigation

- [ ] **Editing**
  - [ ] Double-click to edit
  - [ ] Type in cell
  - [ ] Commit (Enter)
  - [ ] Cancel (Escape)
  - [ ] Tab to next cell

- [ ] **Filtering**
  - [ ] Add filter
  - [ ] Multiple filters
  - [ ] All 12+ operators
  - [ ] Clear filters

- [ ] **Grouping**
  - [ ] Group by field
  - [ ] Multi-level grouping
  - [ ] Expand/collapse
  - [ ] Aggregations

- [ ] **TanStack DB integration**
  - [ ] Optimistic updates
  - [ ] Persistence
  - [ ] Rollback on error
  - [ ] Incremental sync

---

### Day 14: Run Playwright Tests

#### Existing Tests (from archive)

If tests exist in archive, run them:
```bash
# Copy tests if they exist
cp -r archive/tests/playwright/vibegrid/ tests/playwright/vibegrid/

# Run tests
./scripts/playwright-test.sh tests/playwright/vibegrid/
```

#### Create New Tests if Needed

Basic smoke tests:
- Load table
- Click cell
- Sort column
- Filter data
- Edit cell
- Group by field

---

## Phase 5: Performance & Polish (Week 3 - Days 15-17)

### Day 15: Performance Validation

#### Measure Baseline
- Initial render time
- Scroll FPS
- Memory usage
- Selection latency
- Editing latency

#### Compare with Archive
- Should be similar or better
- MobX is generally faster than Legend State
- TanStack DB differential dataflow = excellent performance

---

### Day 16: Fix Type Errors

```bash
# Final type check
pnpm typecheck

# Fix any remaining issues
# Should have zero errors
```

---

### Day 17: Documentation Update

- [ ] Update README in vibegrid/
- [ ] Document MobX patterns used
- [ ] Document TanStack DB integration
- [ ] Update CLAUDE.md if needed
- [ ] Close planning docs

---

## Success Criteria

### Functional
- ✅ All features from archive working
- ✅ TanStack DB integration complete
- ✅ Optimistic updates working
- ✅ No console errors
- ✅ Manual testing checklist 100% complete

### Technical
- ✅ Zero TypeScript errors
- ✅ MobX stores properly implemented
- ✅ All components wrapped in observer()
- ✅ Store lifecycle (init/dispose) working
- ✅ Performance ≥ baseline

### Testing
- ✅ All Playwright tests passing (if they exist)
- ✅ Manual testing checklist complete
- ✅ No regressions vs archive

---

## File Change Summary

### Files to Modify (~25 files)

**State stores** (5 files):
- `stores/data-state.ts` → MobX TableCoreStore
- `stores/visual-state.ts` → MobX VisualStateStore
- `stores/interaction-state.ts` → MobX InteractionStore
- `stores/simple-persistence.ts` → MobX reactions
- `stores/init-state.ts` → store lifecycle

**Main component** (1 file):
- `VibeGrid.tsx` → MobX provider + TanStack DB

**React components** (10-15 files):
- Add `observer()` wrappers
- Replace `useSelector()` with direct access
- Replace `.set()` with `@action` calls

**New files to create** (3 files):
- `stores/context.tsx` - Store provider
- `hooks/useVibeGridData.ts` - TanStack DB integration
- `hooks/useMobxSnapshot.ts` - MobX → React bridge

### Files Unchanged (~100 files)

- All DOM renderers
- All utilities
- All types and constants
- All presentational components
- All editors (mostly)
- All managers
- All factories

---

## Risk Assessment

### Low Risk
- ✅ Architecture proven (archive version works)
- ✅ MobX patterns well-documented
- ✅ TanStack DB infrastructure exists
- ✅ Can rollback to archive if needed

### Medium Risk
- ⚠️ State conversions might reveal edge cases
- ⚠️ TanStack DB performance with large datasets
- ⚠️ Observer() wrapper coverage

### Mitigation
- Test incrementally
- Keep archive as reference
- Feature flag for rollback
- Performance monitoring

---

## Timeline Summary

**Week 1**:
- Days 1-2: Copy & inventory ✅
- Days 3-6: Store migration 🔄
- Day 7: Main component update 🔄

**Week 2**:
- Days 8-10: Component updates 🔄
- Days 11-14: Testing & validation 🔄

**Week 3**:
- Days 15-17: Performance & polish 🔄

**Total**: 2-3 weeks vs 8 weeks for rewrite

---

## Next Steps

1. ✅ Copy all files from archive
2. ✅ Run initial type check
3. ✅ Create Legend State usage catalog
4. 🔄 Start store migration
5. 🔄 Create TanStack DB integration
6. 🔄 Update components
7. 🔄 Test and validate

---

**Document Version**: 2.0 (Copy & Migrate Approach)
**Last Updated**: 2025-10-22
**Status**: Ready to Execute
