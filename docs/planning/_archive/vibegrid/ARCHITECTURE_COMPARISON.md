# Architecture Comparison: Legend State → MobX + TanStack DB

**Document Purpose**: Provide side-by-side comparison of patterns and implementation approaches for migrating VibeGrid from Legend State to MobX and TanStack DB (with TanStack Query).

**Note**: TanStack DB provides client-side reactive collections with joins, eliminating N+1 queries and providing sub-millisecond reactive queries. See `planning/active/tanstack-db/` for full integration plan.

## Table of Contents

1. [Observable State Patterns](#observable-state-patterns)
2. [Computed Values](#computed-values)
3. [Actions and State Updates](#actions-and-state-updates)
4. [Entity Data Fetching](#entity-data-fetching)
5. [React Integration](#react-integration)
6. [Performance Optimization](#performance-optimization)
7. [Persistence Patterns](#persistence-patterns)

---

## Observable State Patterns

### Legend State (Current)

```typescript
import { observable, computed } from '@legendapp/state';

// Create observable state
const tableInteraction$ = observable({
  // Simple observable properties
  selectedCells: new Set<string>(),
  editingCell: null as string | null,
  isEditing: false,

  // Nested observable objects
  contextMenuState: {
    isOpen: false,
    position: { x: 0, y: 0 },
    context: null as 'cell' | 'row' | null
  }
});

// Access values
const cells = tableInteraction$.selectedCells.get();

// Update values
tableInteraction$.editingCell.set('row1:col1');
tableInteraction$.contextMenuState.isOpen.set(true);
```

### MobX (Target)

```typescript
import { makeObservable, observable, action } from 'mobx';

class TableInteractionStore {
  // Observable properties with TypeScript decorators
  selectedCells = new Set<string>();
  editingCell: string | null = null;
  isEditing = false;

  // Nested observable objects
  contextMenuState = {
    isOpen: false,
    position: { x: 0, y: 0 },
    context: null as 'cell' | 'row' | null
  };

  constructor() {
    makeObservable(this, {
      selectedCells: observable,
      editingCell: observable,
      isEditing: observable,
      contextMenuState: observable,
      setEditingCell: action,
      setContextMenu: action
    });
  }

  // Actions for state updates
  @action
  setEditingCell(cellId: string | null): void {
    this.editingCell = cellId;
  }

  @action
  setContextMenu(isOpen: boolean, position?: { x: number; y: number }): void {
    this.contextMenuState.isOpen = isOpen;
    if (position) {
      this.contextMenuState.position = position;
    }
  }
}

// Create instance
const tableInteractionStore = new TableInteractionStore();

// Access values (direct property access)
const cells = tableInteractionStore.selectedCells;

// Update values (through actions)
tableInteractionStore.setEditingCell('row1:col1');
tableInteractionStore.setContextMenu(true, { x: 100, y: 200 });
```

**Key Differences:**
- ✅ Legend State: Functional, uses `.get()` and `.set()` methods
- ✅ MobX: Object-oriented, direct property access
- ⚠️ MobX requires `makeObservable()` in constructor
- ⚠️ MobX enforces actions in strict mode (like Baseplane's config)

---

## Computed Values

### Legend State (Current)

```typescript
import { observable, computed } from '@legendapp/state';

// Visual state with computed properties
const visualState$ = computed((): VisualState => {
  const inputs = visualInputs$.get();
  const rows = tableCore$.processedRows.get(); // Reactive dependency

  // Calculate column layouts
  let cumulativeX = 40;
  const columnLayouts: ColumnLayout[] = inputs.columns.map(col => {
    const width = inputs.columnWidths[col.id] || col.width || 150;
    const layout = {
      columnId: col.id,
      width,
      x: cumulativeX,
      visible: inputs.columnVisibility[col.id] !== false
    };
    cumulativeX += width;
    return layout;
  });

  return {
    columnLayouts,
    totalWidth: cumulativeX,
    totalHeight: rows.length * ROW_HEIGHT,
    visibleColumns: columnLayouts.filter(c => c.visible)
  };
});

// Use computed value
const layout = visualState$.get();
```

### MobX (Target)

```typescript
import { makeObservable, observable, computed, action } from 'mobx';

class VisualStateStore {
  // Input observables
  columns: Column[] = [];
  columnWidths: Record<string, number> = {};
  columnVisibility: Record<string, boolean> = {};

  constructor(private tableCoreStore: TableCoreStore) {
    makeObservable(this, {
      columns: observable,
      columnWidths: observable,
      columnVisibility: observable,
      columnLayouts: computed,
      visualState: computed,
      setColumnWidth: action
    });
  }

  // Computed getter - automatically reactive
  @computed
  get columnLayouts(): ColumnLayout[] {
    let cumulativeX = 40;
    return this.columns.map(col => {
      const width = this.columnWidths[col.id] || col.width || 150;
      const layout = {
        columnId: col.id,
        width,
        x: cumulativeX,
        visible: this.columnVisibility[col.id] !== false
      };
      cumulativeX += width;
      return layout;
    });
  }

  // Computed that depends on another store
  @computed
  get visualState(): VisualState {
    const rows = this.tableCoreStore.processedRows; // Reactive dependency

    return {
      columnLayouts: this.columnLayouts,
      totalWidth: this.columnLayouts.reduce((sum, c) => sum + c.width, 40),
      totalHeight: rows.length * ROW_HEIGHT,
      visibleColumns: this.columnLayouts.filter(c => c.visible)
    };
  }

  @action
  setColumnWidth(columnId: string, width: number): void {
    this.columnWidths[columnId] = width;
  }
}

// Use computed value (direct property access)
const layout = visualStateStore.visualState;
```

**Key Differences:**
- ✅ Legend State: `computed(() => ...)` function returns computed observable
- ✅ MobX: `@computed get property()` getter with automatic reactivity
- ✅ Both automatically track dependencies
- ⚠️ MobX computed are cached and only recompute when dependencies change
- ⚠️ MobX allows computed values to depend on other stores

---

## Actions and State Updates

### Legend State (Current)

```typescript
// Legend State pattern: Direct observable updates
const visualOperations = {
  setColumnWidth(columnId: string, width: number) {
    // Direct mutation via .set()
    visualInputs$.columnWidths[columnId].set(width);
  },

  toggleSort(field: string) {
    const currentSort = visualInputs$.sortBy.get();
    const existing = currentSort.find(s => s.field === field);

    if (!existing) {
      visualInputs$.sortBy.set([...currentSort, { field, direction: 'asc' }]);
    } else if (existing.direction === 'asc') {
      visualInputs$.sortBy.set(
        currentSort.map(s => s.field === field ? { ...s, direction: 'desc' } : s)
      );
    } else {
      visualInputs$.sortBy.set(currentSort.filter(s => s.field !== field));
    }
  },

  // Batch updates
  batchUpdate(updates: Partial<VisualInputs>) {
    batch(() => {
      Object.entries(updates).forEach(([key, value]) => {
        visualInputs$[key].set(value);
      });
    });
  }
};
```

### MobX (Target)

```typescript
import { action, runInAction } from 'mobx';

class VisualStateStore {
  columnWidths: Record<string, number> = {};
  sortBy: SortConfig[] = [];

  constructor() {
    makeObservable(this, {
      columnWidths: observable,
      sortBy: observable,
      setColumnWidth: action,
      toggleSort: action,
      batchUpdate: action
    });
  }

  // Simple action
  @action
  setColumnWidth(columnId: string, width: number): void {
    // Direct mutation (MobX tracks this)
    this.columnWidths[columnId] = width;
  }

  // Complex action with conditional logic
  @action
  toggleSort(field: string): void {
    const existing = this.sortBy.find(s => s.field === field);

    if (!existing) {
      this.sortBy.push({ field, direction: 'asc' });
    } else if (existing.direction === 'asc') {
      existing.direction = 'desc';
    } else {
      this.sortBy = this.sortBy.filter(s => s.field !== field);
    }
  }

  // Batch updates (MobX automatically batches within actions)
  @action
  batchUpdate(updates: Partial<VisualInputs>): void {
    Object.assign(this, updates);
  }

  // Async action pattern
  @action
  async savePreferences(): Promise<void> {
    const preferences = { columnWidths: this.columnWidths };
    const result = await api.savePreferences(preferences);

    // Use runInAction for state updates after await
    runInAction(() => {
      this.lastSaved = new Date();
    });
  }
}
```

**Key Differences:**
- ✅ Legend State: Explicit `.set()` calls, optional `batch()`
- ✅ MobX: Direct mutations in `@action` methods, automatic batching
- ✅ MobX enforces all mutations happen in actions (strict mode)
- ⚠️ MobX async actions need `runInAction()` for post-await updates

---

## Entity Data Fetching

### Legend State (Current)

```typescript
import { getEntity$, entityOperations } from '@/legend-state/observables';

// Direct entity observable access
const tableCore$ = observable({
  entityType: 'task',

  // Computed rows from entity observable
  processedRows: computed(() => {
    const entityObs = getEntity$(tableCore$.entityType.get());
    const entityMap = entityObs?.get() || {};
    let rows = Object.values(entityMap);

    // Apply transformations
    const filters = visualInputs$.filters.get();
    const sortBy = visualInputs$.sortBy.get();

    rows = applyFilters(rows, filters);
    rows = applySorting(rows, sortBy);

    return rows;
  })
});

// Update entity
async function updateTask(taskId: string, updates: Partial<Task>) {
  await entityOperations.update('task', taskId, updates);
  // Entity observable automatically updates
}
```

### TanStack DB + MobX (Target)

```typescript
import { useLiveQuery } from '@tanstack/react-db';
import { eq } from '@tanstack/db';
import { useEntityCollection } from '@/data/db/hooks/useEntityCollection';
import { makeObservable, observable, action } from 'mobx';

// MobX store for UI state (filters, sorting, grouping)
class TableCoreStore {
  entityType = 'WorkTask';
  filters: FilterConfig[] = [];
  sortBy: SortConfig[] = [];

  constructor() {
    makeObservable(this, {
      entityType: observable,
      filters: observable,
      sortBy: observable,
      setFilters: action,
      setSortBy: action
    });
  }

  @action
  setFilters(filters: FilterConfig[]): void {
    this.filters = filters;
  }

  @action
  setSortBy(sortBy: SortConfig[]): void {
    this.sortBy = sortBy;
  }
}

// React component using TanStack DB reactive queries
// Pattern from src/components/tanstack-db-pilot/TanStackDBFullDemo.tsx
const VibeGrid = observer(function VibeGrid({ entityType }: VibeGridProps) {
  const { tableCoreStore } = useStores();

  // Get collections (shared singletons - no custom hooks needed!)
  const tasksCollection = useEntityCollection('WorkTask');
  const projectsCollection = useEntityCollection('Project');

  // Reactive query with client-side join (no N+1 queries!)
  const { data: rows } = useLiveQuery((q) => {
    if (!tasksCollection || !projectsCollection) return undefined;

    let query = q.from({ task: tasksCollection })
      .join({ project: projectsCollection }, ({ task, project }) =>
        eq(task.project_id, project?.id)
      );

    // Apply MobX store filters
    tableCoreStore.filters.forEach(filter => {
      query = query.where(({ task }) =>
        eq(task[filter.field], filter.value) // Simplified filter example
      );
    });

    // Apply sorting from MobX store
    if (tableCoreStore.sortBy.length > 0) {
      const { field, direction } = tableCoreStore.sortBy[0];
      query = query.orderBy(({ task }) => task[field], direction);
    }

    return query.select(({ task, project }) => ({
      ...task,
      project: project // Joined data - no N+1!
    }));
  }, [tableCoreStore.filters, tableCoreStore.sortBy]); // Re-query when filters/sort change

  // CRUD mutations using collection APIs directly
  const handleCreate = (data: Partial<Task>) => {
    if (!tasksCollection) return;

    const tx = tasksCollection.insert({
      id: `temp-${Date.now()}`,
      ...data,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Wait for server confirmation
    tx.isPersisted.promise.then(() => {
      toast.success('Task created!');
    }).catch(() => {
      toast.error('Failed to create task');
    });
  };

  const handleUpdate = (taskId: string, updates: Partial<Task>) => {
    if (!tasksCollection) return;

    const tx = tasksCollection.update(taskId, (draft) => {
      Object.assign(draft, updates);
      draft.updatedAt = new Date().toISOString();
    });

    // Optimistic update + server sync + rollback on error - all automatic!
    tx.isPersisted.promise.then(() => {
      toast.success('Task updated!');
    });
  };

  const handleDelete = (taskId: string) => {
    if (!tasksCollection) return;

    const tx = tasksCollection.delete(taskId);

    tx.isPersisted.promise.then(() => {
      toast.success('Task deleted!');
    });
  };

  if (!rows) return <Spinner />;

  return (
    <TableRenderer
      rows={rows}
      onCreate={handleCreate}
      onUpdate={handleUpdate}
      onDelete={handleDelete}
    />
  );
});
```

**Key Differences:**
- ✅ Legend State: Direct observable connection to entity atoms
- ✅ **TanStack DB: Reactive collections with client-side joins** (eliminates N+1 queries!)
- ✅ **No custom hooks needed** - just `useEntityCollection('Task')` + `useLiveQuery`!
- ✅ **Incremental sync** - only fetch changed records (99% bandwidth reduction)
- ✅ **Built-in optimistic updates and rollback** (no manual cache management!)
- ✅ **Sub-millisecond reactive queries** with differential dataflow
- ✅ **useLiveQuery** automatically re-runs when dependencies change
- ✅ **Direct collection mutations** - `.insert()`, `.update()`, `.delete()` with promises
- ⚠️ MobX stores handle UI state (filters, sorting), TanStack DB handles data
- ⚠️ Collection setup requires `@tanstack/query-db-collection` package (already planned!)

**Pattern Simplicity**: Much simpler than originally thought! No need for wrapper hooks - just use `useEntityCollection()` to get the collection, then `useLiveQuery()` and direct collection mutations. See `src/components/tanstack-db-pilot/TanStackDBFullDemo.tsx` for working example.

---

## React Integration

### Legend State (Current)

```typescript
import { useSelector } from '@legendapp/state/react';
import { observer } from '@legendapp/state/react';

// Component with selector hook
function TableHeader() {
  // Subscribe to specific observable values
  const selectedCount = useSelector(tableInteraction$.selectedCells.size);
  const isEditing = useSelector(tableInteraction$.isEditing);

  return (
    <div>
      Selected: {selectedCount} | Editing: {isEditing}
    </div>
  );
}

// Observer component (auto-tracks all observable access)
const TableRow = observer(function TableRow({ rowId }: { rowId: string }) {
  const isSelected = tableInteraction$.selectedCells.get().has(rowId);
  const isEditing = tableInteraction$.editingCell.get() === rowId;

  return (
    <tr className={isSelected ? 'selected' : ''}>
      {/* row content */}
    </tr>
  );
});
```

### MobX (Target)

```typescript
import { observer } from 'mobx-react-lite';
import { useStores } from '@/stores/context';

// Observer component (required for reactivity)
const TableHeader = observer(function TableHeader() {
  const { tableInteractionStore } = useStores();

  // Direct property access - automatically tracked
  const selectedCount = tableInteractionStore.selectedCells.size;
  const isEditing = tableInteractionStore.isEditing;

  return (
    <div>
      Selected: {selectedCount} | Editing: {isEditing}
    </div>
  );
});

// Observer component with actions
const TableRow = observer(function TableRow({ rowId }: { rowId: string }) {
  const { tableInteractionStore } = useStores();

  // Computed values are automatically tracked
  const isSelected = tableInteractionStore.selectedCells.has(rowId);
  const isEditing = tableInteractionStore.editingCell === rowId;

  const handleClick = () => {
    // Call action
    tableInteractionStore.toggleCellSelection(rowId);
  };

  return (
    <tr className={isSelected ? 'selected' : ''} onClick={handleClick}>
      {/* row content */}
    </tr>
  );
});
```

**Key Differences:**
- ✅ Both require wrapping components in `observer()`
- ✅ Legend State: `useSelector()` for granular subscriptions
- ✅ MobX: Direct property access with automatic tracking
- ⚠️ MobX components must be wrapped in `observer()` for reactivity
- ⚠️ Baseplane uses `useStores()` hook from context

---

## Performance Optimization

### Legend State (Current)

```typescript
import { observe, when, batch } from '@legendapp/state';

// Manual observation with disposal
const dispose = observe(() => {
  const rows = tableCore$.processedRows.get();
  const geometry = visualState$.geometry.get();

  // Update DOM when rows or geometry change
  renderer.updateVisibleRows(rows, geometry);
});

// Cleanup
dispose();

// Wait for condition
when(
  () => tableCore$.processedRows.length > 0,
  () => {
    console.log('Rows loaded!');
  }
);

// Batch updates to prevent intermediate renders
batch(() => {
  visualInputs$.scrollTop.set(100);
  visualInputs$.scrollLeft.set(50);
  visualInputs$.viewportHeight.set(600);
});
```

### MobX (Target)

```typescript
import { reaction, when, runInAction, action } from 'mobx';

// Reaction for side effects (similar to observe)
const dispose = reaction(
  // Data function - what to observe
  () => ({
    rows: tableCoreStore.processedRows,
    geometry: visualStateStore.geometry
  }),
  // Effect function - what to do when data changes
  ({ rows, geometry }) => {
    renderer.updateVisibleRows(rows, geometry);
  },
  {
    // Options
    delay: 100, // Debounce updates
    fireImmediately: false
  }
);

// Cleanup
dispose();

// Wait for condition (same API as Legend State!)
when(
  () => tableCoreStore.processedRows.length > 0,
  () => {
    console.log('Rows loaded!');
  }
);

// Batch updates (automatic within actions)
@action
updateViewport(scrollTop: number, scrollLeft: number, height: number): void {
  // All updates batched automatically
  this.scrollTop = scrollTop;
  this.scrollLeft = scrollLeft;
  this.viewportHeight = height;
}

// Or use runInAction for inline batching
runInAction(() => {
  store.scrollTop = 100;
  store.scrollLeft = 50;
  store.viewportHeight = 600;
});
```

**Key Differences:**
- ✅ Both have `when()` utility for conditional waiting
- ✅ MobX `reaction()` similar to Legend State `observe()`
- ✅ MobX automatically batches updates within actions
- ⚠️ MobX reactions have more configuration options (delay, etc.)
- ⚠️ Need explicit cleanup for both (dispose functions)

---

## Persistence Patterns

### Legend State (Current)

```typescript
import { syncState } from '@legendapp/state';

// Automatic persistence to localStorage
const visualPreferences$ = observable({
  columnWidths: {} as Record<string, number>,
  columnVisibility: {} as Record<string, boolean>,
  sortBy: [] as SortConfig[]
});

// Sync with localStorage
syncState(visualPreferences$, {
  persist: {
    name: `vibegrid-${entityType}-${orgId}`,
    plugin: localStorage
  }
});

// Updates automatically persisted
visualPreferences$.columnWidths['task_title'].set(250);
```

### MobX (Target)

```typescript
import { reaction } from 'mobx';

class VisualStateStore {
  columnWidths: Record<string, number> = {};
  columnVisibility: Record<string, boolean> = {};
  sortBy: SortConfig[] = [];

  private entityType: string;
  private orgId: string;

  constructor(entityType: string, orgId: string) {
    this.entityType = entityType;
    this.orgId = orgId;

    makeObservable(this, {
      columnWidths: observable,
      columnVisibility: observable,
      sortBy: observable,
      loadPreferences: action,
      setColumnWidth: action
    });

    // Load initial preferences
    this.loadPreferences();

    // Auto-save on changes (debounced)
    reaction(
      () => ({
        columnWidths: toJS(this.columnWidths),
        columnVisibility: toJS(this.columnVisibility),
        sortBy: toJS(this.sortBy)
      }),
      (preferences) => {
        const key = `vibegrid-${this.entityType}-${this.orgId}`;
        localStorage.setItem(key, JSON.stringify(preferences));
      },
      { delay: 1000 } // Debounce saves by 1 second
    );
  }

  @action
  loadPreferences(): void {
    const key = `vibegrid-${this.entityType}-${this.orgId}`;
    const saved = localStorage.getItem(key);

    if (saved) {
      const preferences = JSON.parse(saved);
      Object.assign(this, preferences);
    }
  }

  @action
  setColumnWidth(columnId: string, width: number): void {
    this.columnWidths[columnId] = width;
    // Auto-save triggered by reaction
  }
}
```

**Key Differences:**
- ✅ Legend State: Built-in `syncState()` utility
- ✅ MobX: Manual `reaction()` for persistence
- ✅ MobX allows more control over when/how to save
- ⚠️ MobX requires manual loading in constructor
- ⚠️ Use `toJS()` to convert observables before saving

---

## Summary Table

| Feature | Legend State | MobX + TanStack DB | Migration Effort |
|---------|-------------|-------------------|------------------|
| **State Definition** | `observable()` | `@observable` decorator | Easy |
| **Computed Values** | `computed()` | `@computed` getter | Easy |
| **Actions** | Direct `.set()` | `@action` methods | Medium |
| **Entity Data** | Built-in atoms | TanStack DB collections | Medium |
| **Client-side Joins** | Manual N+1 queries | `useLiveQuery` with joins | **Easy!** ✅ |
| **Optimistic Updates** | Manual | Built-in collection mutations | **Easy!** ✅ |
| **Incremental Sync** | Not available | Built-in (99% bandwidth reduction) | **Bonus!** ⭐ |
| **React Integration** | `useSelector()` | `observer()` + `useLiveQuery()` | Easy |
| **Performance** | `observe()`, `batch()` | `reaction()`, differential dataflow | Better |
| **Persistence** | `syncState()` | Manual `reaction()` | Medium |
| **Type Safety** | Good | Excellent | N/A |
| **DevTools** | Legend State DevTools | MobX + TanStack Query DevTools | N/A |

**Overall Migration Complexity: Medium**
- Most patterns have direct equivalents
- **TanStack DB makes entity data EASIER** than Legend State atoms
- **Client-side joins eliminate N+1 queries** (huge win for VibeGrid!)
- **Built-in optimistic updates** reduce mutation code by 50-80%
- Performance optimization is largely automatic with differential dataflow
- Persistence requires manual implementation (similar effort)

---

**Next Steps:**
1. Review patterns with team
2. Create proof-of-concept for one store
3. Establish coding standards for MobX stores
4. Begin Phase 1 migration

**Document Version**: 1.0
**Last Updated**: 2025-10-22
