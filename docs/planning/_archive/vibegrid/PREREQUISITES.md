# VibeGrid Implementation Prerequisites

**Before starting VibeGrid implementation, ensure these are complete:**

---

## 1. TanStack DB Infrastructure

### Required

- [ ] `@tanstack/query-db-collection` package installed
- [ ] `useEntityCollection()` hook exists at `src/data/db/hooks/useEntityCollection.ts`
- [ ] WorkTask collection working (verify at `/tanstack-db-demo`)

### Fetch Limit Fix

⚠️ **CRITICAL**: Lift the 1k fetch cap to support large datasets

**File**: `src/data/db/collections/entity-collections.ts:82`

```typescript
// Change from:
limit: 1000

// To:
limit: 100000 // Support large datasets for VibeGrid performance testing
```

**Why**: VibeGrid needs to test with 100k+ rows for virtual scrolling validation

**Alternative**: If server can't handle 100k in one request:
- Keep reasonable limit (e.g., 10k)
- Add pagination/streaming to roadmap
- Test VibeGrid with available dataset size

---

## 2. Type Definitions

### Files to Copy from Archive

All type files must be copied to maintain dependencies:

1. **`archive/vibegrid/column-types.ts`** → `src/components/vibegrid/types/column-types.ts`
   - Column<T> interface
   - CellType union (25+ types)
   - Type helper functions

2. **`archive/vibegrid/types.ts`** → `src/components/vibegrid/types/index.ts`
   - Update line 17: `import type { Column as BaseColumn, CellType } from './column-types';`
   - Remove Legend State specific types
   - Keep all other types (739 lines)

3. **`archive/vibegrid/types/clipboard-types.ts`** → `src/components/vibegrid/types/clipboard-types.ts`
   - If exists in archive

4. **Any other type dependencies** discovered during implementation

### Verification

```bash
# After copying types, verify no TypeScript errors
cd src/components/vibegrid/types
pnpm typecheck
```

---

## 3. MobX Store Architecture Principles

### Stores Must Be Framework-Agnostic

**CRITICAL RULE**: MobX stores should NOT import TanStack DB or any data fetching libraries

✅ **Good** - Stores only contain UI state:
```typescript
// stores/TableCoreStore.ts
import { makeObservable, observable, action } from 'mobx';
// NO TanStack DB imports!

export class TableCoreStore {
  @observable filters: FilterConfig[] = [];

  @computed
  get filterSnapshot(): FilterConfig[] {
    return toJS(this.filters); // Read-only snapshot
  }
}
```

❌ **Bad** - Stores directly using TanStack DB:
```typescript
// DON'T DO THIS
import { useLiveQuery } from '@tanstack/react-db'; // ❌ NO!
import { useEntityCollection } from '@/data/db/hooks/useEntityCollection'; // ❌ NO!
```

### Integration Layer Pattern

**Integration happens in hooks/components**, not stores:

```typescript
// hooks/useMobxSnapshot.ts - Bridge MobX → React
export function useMobxSnapshot<T>(selector: () => T): T {
  const [snapshot, setSnapshot] = useState(() => selector());
  useEffect(() => autorun(() => setSnapshot(selector())), [selector]);
  return snapshot;
}

// hooks/useVibeGridData.ts - THIS is where TanStack DB lives
export function useVibeGridData(entityType: string, stores: VibeGridStores) {
  const collection = useEntityCollection(entityType);

  // Bridge MobX computed → React (only updates when computed changes)
  const querySnapshot = useMobxSnapshot(() => stores.tableCoreStore.querySnapshot);
  const queryKey = useMobxSnapshot(() => stores.tableCoreStore.queryKey);

  const { data } = useLiveQuery(
    useCallback((q) => {
      if (!collection) return undefined;

      let query = q.from({ entity: collection });

      // Use stable snapshot - doesn't churn
      querySnapshot.filters.forEach(f => query = query.where(...));
      querySnapshot.sortBy.forEach(s => query = query.orderBy(...));

      return query.select(({ entity }) => entity);
    }, [collection, querySnapshot]),  // Stable - MobX computed caches
    [collection, queryKey]  // Efficient string change detection
  );

  return { rows: data, ... };
}
```

**Why**:
- ✅ Keeps stores testable, framework-agnostic, and reusable
- ✅ MobX `computed` caches snapshots - only new object when data changes
- ✅ Efficient `queryKey` string for change detection
- ✅ TanStack DB incremental updates preserved (no unnecessary re-queries)
- ✅ No dependency array churn

### Critical Performance Note: Stable Snapshots

⚠️ **IMPORTANT**: Computed snapshots must return cached references to prevent `useLiveQuery` dependency churn

**The Problem**:
- If you create fresh objects on every render, `useLiveQuery` dependency array churns
- This causes unnecessary re-queries even though the actual filter/sort data didn't change
- TanStack DB incremental updates still work, but you lose the efficiency

**The Solution**: MobX computed + stable snapshots

```typescript
class TableCoreStore {
  @observable.shallow filters: FilterConfig[] = [];
  @observable.shallow sortBy: SortConfig[] = [];

  constructor() {
    makeObservable(this, {
      filters: observable.shallow,
      sortBy: observable.shallow,
      querySnapshot: computed,
      queryKey: computed
    });
  }

  // ✅ GOOD - MobX computed caches this, only allocates new object when filters/sort change
  @computed
  get querySnapshot() {
    return {
      filters: this.filters.map(f => ({ ...f })),  // Plain data
      sortBy: this.sortBy.map(s => ({ ...s }))
    };
  }

  // ✅ GOOD - Efficient change detection key (tiny string)
  @computed
  get queryKey(): string {
    return `${this.filters.map(f => `${f.field}:${f.operator}:${f.value}`).join('|')}::${this.sortBy.map(s => `${s.field}:${s.direction}`).join('|')}`;
  }
}
```

**In the integration hook**:

```typescript
// Bridge helper - MobX computed → React state
function useMobxSnapshot<T>(selector: () => T): T {
  const [snapshot, setSnapshot] = useState(() => selector());
  useEffect(() => autorun(() => setSnapshot(selector())), [selector]);
  return snapshot;
}

// ✅ GOOD - Stable references, only updates when MobX computed changes
const querySnapshot = useMobxSnapshot(() => stores.tableCoreStore.querySnapshot);
const queryKey = useMobxSnapshot(() => stores.tableCoreStore.queryKey);

const { data } = useLiveQuery(
  useCallback((q) => {
    if (!collection) return undefined;

    let query = q.from({ entity: collection });

    // Use querySnapshot directly - it's stable from MobX computed
    querySnapshot.filters.forEach(filter => {
      query = query.where(({ entity }) => applyFilter(entity, filter));
    });

    querySnapshot.sortBy.forEach(({ field, direction }) => {
      query = query.orderBy(({ entity }) => entity[field], direction);
    });

    return query.select(({ entity }) => entity);
  }, [collection, querySnapshot]),  // Won't churn - MobX computed caches!
  [collection, queryKey]  // Efficient string for TanStack change detection
);

// ❌ BAD - Fresh object every render, constant churn!
const { data } = useLiveQuery(
  (q) => {
    const filters = toJS(stores.tableCoreStore.filters);  // New array EVERY render!
    filters.forEach(f => { ... });
  },
  [toJS(stores.tableCoreStore.filters)]  // New array every time - useLiveQuery re-runs!
);
```

**Why This Works**:
- ✅ MobX `computed` caches the snapshot - only creates new object when actual data changes
- ✅ `useMobxSnapshot` bridges MobX → React once per change
- ✅ `querySnapshot` is stable between renders (unless filters/sort change)
- ✅ `queryKey` string is tiny and efficient for dependency checking
- ✅ **TanStack DB incremental row streaming still works** - you still get row diffs pushed from collection
- ✅ Query only re-runs when filter/sort actually changes, not on every render

**Critical**: Don't rewrap snapshots in fresh objects in the hook - use them directly!

---

## 4. Store Lifecycle Management

### Stores Must Implement IStore

```typescript
interface IStore {
  init(): Promise<void> | void;
  dispose(): void;
  reset(): void;
}
```

### Component Must Call Lifecycle Methods

```typescript
export const VibeGrid = observer(({ entityType }: VibeGridProps) => {
  const stores = useMemo(() => ({
    tableCoreStore: new TableCoreStore(),
    visualStateStore: new VisualStateStore(),
    interactionStore: new InteractionStore()
  }), []);

  // ✅ Call init on mount
  useEffect(() => {
    const initStores = async () => {
      await stores.tableCoreStore.init();
      await stores.visualStateStore.init();
      await stores.interactionStore.init();
    };

    initStores();

    // ✅ Call dispose on unmount
    return () => {
      stores.tableCoreStore.dispose();
      stores.visualStateStore.dispose();
      stores.interactionStore.dispose();
    };
  }, [stores]);

  // ... rest of component
});
```

**Why**: Without dispose(), reactions and event listeners will leak memory

---

## 5. Development Environment

### Required Tools

- [ ] MobX DevTools browser extension installed
- [ ] React DevTools for profiling
- [ ] PostgreSQL running (for backend data)
- [ ] Dev server running (`pnpm dev`)

### Verification

```bash
# Verify TanStack DB working
curl http://localhost:4000/tanstack-db-demo

# Verify WorkTask data exists
# Login at /sign-in, then check /tanstack-db-demo
```

---

## Checklist Before Starting

- [ ] TanStack DB Phase 1 complete
- [ ] Fetch limit lifted or pagination plan in place
- [ ] All type files copied from archive
- [ ] Type dependencies verified (no TS errors)
- [ ] Store architecture principles understood
- [ ] Integration layer pattern clear
- [ ] Store lifecycle pattern clear
- [ ] MobX DevTools installed
- [ ] Development environment ready

**Once all items checked**: Proceed to IMPLEMENTATION_PLAN.md Week 1

---

**Document Version**: 1.0
**Last Updated**: 2025-10-22
**Status**: Ready for Review

## 6. useMobxSnapshot Bridge Utility

### Create Utility File

Before Week 2, create the MobX → React bridge:

```bash
mkdir -p src/components/vibegrid/hooks
```

**File**: `src/components/vibegrid/hooks/useMobxSnapshot.ts`

```typescript
import { useState, useEffect } from 'react';
import { autorun } from 'mobx';

/**
 * Bridge MobX computed values to React state
 * Only updates when the MobX computed actually changes
 * 
 * Used to create stable references for useLiveQuery dependencies
 * without causing constant re-queries on every render
 */
export function useMobxSnapshot<T>(selector: () => T): T {
  const [snapshot, setSnapshot] = useState(() => selector());

  useEffect(() => {
    const dispose = autorun(() => setSnapshot(selector()));
    return dispose;
  }, [selector]);

  return snapshot;
}
```

**Usage in integration hook**:
```typescript
const querySnapshot = useMobxSnapshot(() => stores.tableCoreStore.querySnapshot);
const queryKey = useMobxSnapshot(() => stores.tableCoreStore.queryKey);
```

**Why**: Prevents useLiveQuery dependency churn while preserving TanStack DB incremental updates

---
