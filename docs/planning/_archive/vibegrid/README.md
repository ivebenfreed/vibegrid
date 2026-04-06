# VibeGrid: MobX + TanStack DB Implementation

**Status:** Planning Phase
**Created:** 2025-10-22
**Target Completion:** TBD

## Overview

This planning document set covers the implementation of VibeGrid using MobX state management and TanStack DB for data fetching. VibeGrid is a sophisticated Google Sheets-level data grid supporting advanced features like multi-level grouping, complex selection, inline editing, and real-time synchronization.

**Stack:**
- **MobX**: State management with observables, computed values, and actions
- **TanStack DB**: Client-side reactive collections with joins (eliminates N+1 queries)
- **Direct DOM**: Hybrid rendering for performance (React for controls, direct DOM for table body)

**Reference**: `archive/vibegrid/` contains original implementation with Legend State (20,000 lines) to adapt from

**Note**: See `planning/active/tanstack-db/` for TanStack DB infrastructure (prerequisite)

## What is VibeGrid?

VibeGrid is a high-performance hybrid data grid component that combines:
- **React declarative UI** for controls and headers
- **Direct DOM manipulation** for table body (performance)
- **Canvas overlays** for selection and editing
- **Virtual scrolling** for handling 100,000+ rows at 60fps

### Key Features
- **Real-time Entity Sync**: Direct connection to entity atoms
- **Multi-level Grouping**: Hierarchical organization with aggregations
- **Advanced Filtering**: 12+ operators with type-specific UIs
- **Excel-like Selection**: Cell, row, range, and multi-selection
- **Inline Editing**: Single-click editing with 12+ editor types
- **Drag & Drop**: Row reordering within/between groups
- **Column Management**: Dynamic visibility, resizing, reordering

### Current Architecture Stats
- **Total Code**: ~20,000 lines across 60+ files
- **Legend State Observables**: 3 main state layers
- **Direct DOM Manipulation**: Custom rendering system
- **React Components**: Header, overlays, editors
- **Test Coverage**: Comprehensive Playwright tests

## Current Legend State Architecture

### Target Three-Layer State System (MobX)

```typescript
// 1. TableCoreStore - Filters, sorting, grouping configuration
class TableCoreStore {
  @observable filters: FilterConfig[] = [];
  @observable sortBy: SortConfig[] = [];
  @observable groupConfig: GroupConfig | null = null;

  @action setFilters(filters: FilterConfig[]) { ... }
  @action toggleSort(field: string) { ... }
}

// 2. VisualStateStore - Column layouts and viewport geometry (computed)
class VisualStateStore {
  @observable columnWidths: Record<string, number> = {};
  @observable scrollLeft = 0;
  @observable scrollTop = 0;

  @computed get columnLayouts(): ColumnLayout[] { ... }
  @computed get geometry(): ViewportGeometry { ... }
}

// 3. InteractionStore - Selection and editing
class InteractionStore {
  @observable selectedCells = new Set<string>();
  @observable editingCell: string | null = null;

  @action toggleCellSelection(rowId, colId, ctrlKey, shiftKey) { ... }
  @action startEdit(rowId, colId) { ... }
}

// TanStack DB provides the actual data (replaces Legend State entity atoms)
const entityCollection = useEntityCollection('WorkTask');
const { data: rows } = useLiveQuery((q) => {
  // Reactive query with filters/sorting from stores
}, [stores.tableCoreStore.filters, stores.tableCoreStore.sortBy]);
```

## Implementation Goals

### Primary Objectives
1. **Build with MobX**: Clean observables, computed values, and actions
2. **Integrate TanStack DB**: Reactive collections with client-side joins
3. **Feature Complete**: All capabilities from archive version
4. **High Performance**: Virtual scrolling at 60fps with 100,000+ rows
5. **Type Safe**: Full TypeScript throughout
6. **Eliminate N+1 Queries**: Client-side joins for relationships
7. **Optimistic Updates**: Built-in via TanStack DB collections

### Success Criteria
- [ ] All features implemented and working
- [ ] All Playwright tests pass
- [ ] Type safety throughout
- [ ] N+1 queries eliminated with client-side joins
- [ ] Optimistic updates working
- [ ] Virtual scrolling at 60fps

## Implementation Phases

### Phase 1: Foundation (Week 1-2)
- Week 1: Create all three MobX stores (TableCoreStore, VisualStateStore, InteractionStore)
- Week 2: Build main component structure + TanStack DB integration

### Phase 2: Core Implementation (Week 3-5)
- Week 3: DOM renderer with virtual scrolling
- Week 4: Header and column operations
- Week 5: Selection system (all 20+ modes)

### Phase 3: Advanced Features (Week 6-7)
- Week 6: Editing system with 12+ editor types
- Week 7: Grouping and filtering

### Phase 4: Polish (Week 8)
- Context menus, clipboard, keyboard shortcuts
- Performance optimization
- Testing and bug fixes

**Test Route**: `/debug/vibegrid` available from Week 2 onwards

**Total**: 8 weeks for full implementation

## Key Technical Challenges

### 1. Computed State Migration
**Challenge**: Legend State's `computed()` is core to VibeGrid's reactive architecture
**Solution**: MobX `@computed` getters with similar reactive behavior

### 2. Direct DOM Manipulation
**Challenge**: VibeGrid bypasses React for table body rendering
**Solution**: MobX reactions to trigger DOM updates when observables change

### 3. Real-time Entity Sync
**Challenge**: Current direct connection to Legend State entity atoms
**Solution**: TanStack DB collections with incremental sync (WebSocket push or polling)

### 4. Selection Complexity
**Challenge**: Google Sheets-level selection with 20+ selection modes
**Solution**: MobX store with actions for all selection operations

### 5. Performance Requirements
**Challenge**: Must maintain 60fps with virtual scrolling
**Solution**: MobX `reaction()` with proper batching and computed optimization

## Document Structure

### Planning Documents

1. **[README.md](README.md)** (this file)
   - Overview and executive summary
   - Architecture summary
   - Implementation goals and timeline

2. **[PREREQUISITES.md](PREREQUISITES.md)** ⚠️ **READ FIRST!**
   - Critical prerequisites before starting
   - TanStack DB fetch limit fix
   - Type dependencies to copy
   - Store architecture principles
   - Integration layer pattern
   - Store lifecycle management

3. **[IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md)** ⭐ **START HERE!**
   - Concrete week-by-week implementation plan
   - Build full VibeGrid at `/debug/vibegrid` route
   - Test with WorkTask entity
   - All features from archive
   - Complete file structure
   - Proper store lifecycle

4. **[ARCHITECTURE_COMPARISON.md](ARCHITECTURE_COMPARISON.md)**
   - Legend State vs MobX patterns
   - TanStack DB collection patterns
   - Client-side joins and reactive queries
   - Code examples and equivalents

5. **[TESTING_STRATEGY.md](TESTING_STRATEGY.md)**
   - Unit testing approach
   - Playwright E2E tests
   - Feature validation checklist

## Implementation Complexity

### Straightforward ✅
- TanStack DB integration (infrastructure already exists)
- MobX stores (well-documented patterns)
- Basic CRUD operations

### Moderate 🟡
- Visual state computations (column layouts, geometry)
- Filtering and sorting logic
- Component integration

### Complex 🔴
- Selection system (Google Sheets-level complexity)
- Editing overlay (React portals, 12+ editor types)
- DOM renderer (hybrid rendering, virtual scrolling)
- Multi-level grouping with aggregations

## Resources Required

### Development
- **Lead Engineer**: Full-time for 8 weeks
- **Code Reviewer**: Available for PR reviews

### Infrastructure
- **Development Environment**: Local PostgreSQL + dev server
- **Testing**: Playwright with browser profiles
- **TanStack DB**: Phase 1 complete (prerequisite)

### Documentation
- Component API documentation
- Usage examples
- Architecture notes

## Getting Started

### Implementation Approach

👉 **See [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md)** for complete week-by-week plan

The implementation:
- Creates full VibeGrid at `src/components/vibegrid/`
- Tests at debug route `/debug/vibegrid`
- Uses WorkTask entity (TanStack DB already supports it)
- Implements all features from archive
- 8 week timeline broken into clear phases

### Quick Start

⚠️ **Read [PREREQUISITES.md](PREREQUISITES.md) first!** Critical setup required.

1. **Complete prerequisites**: TanStack DB setup, fetch limit fix, type files
2. **Follow IMPLEMENTATION_PLAN.md**: Week 1 starts with MobX stores
3. **Build incrementally**: Each week adds major functionality
4. **Test continuously**: Debug route available from Week 2

### Critical Architecture Principles

🎯 **Store Separation**:
- **MobX stores**: UI state only (filters, sorting, selection) - NO TanStack DB imports!
- **Integration layer**: `useVibeGridData()` hook bridges stores ↔ TanStack DB
- **Stores expose snapshots**: Stable `computed` getters (`querySnapshot`, `queryKey`)
- **useMobxSnapshot**: Bridges MobX computed → React state efficiently
- **Incremental updates preserved**: TanStack DB still streams row diffs efficiently

🎯 **Store Lifecycle**:
- Stores implement `IStore` interface (init, dispose, reset)
- Component calls `init()` on mount
- Component calls `dispose()` on unmount
- Prevents memory leaks from reactions

See [PREREQUISITES.md](PREREQUISITES.md) for complete details.

## Key Migration Patterns

### Simple TanStack DB Integration

The migration is simpler than originally planned thanks to existing TanStack DB infrastructure:

```typescript
// ✅ Get collection (shared singleton)
const tasksCollection = useEntityCollection('WorkTask');

// ✅ Reactive query with MobX store integration
const { data: rows } = useLiveQuery((q) => {
  if (!tasksCollection) return undefined;

  let query = q.from({ task: tasksCollection });

  // Apply filters from MobX store
  tableCoreStore.filters.forEach(filter => {
    query = query.where(({ task }) =>
      eq(task[filter.field], filter.value)
    );
  });

  return query.select(({ task }) => task);
}, [tableCoreStore.filters]); // Re-run when filters change

// ✅ Direct mutations with optimistic updates
const handleUpdate = (taskId: string, updates: any) => {
  if (!tasksCollection) return;

  const tx = tasksCollection.update(taskId, (draft) => {
    Object.assign(draft, updates);
  });

  tx.isPersisted.promise.then(() => {
    toast.success('Updated!');
  });
};
```

**No custom hooks needed!** Just use `useEntityCollection()` + `useLiveQuery()` + direct collection mutations.

See working example: `src/components/tanstack-db-pilot/TanStackDBFullDemo.tsx`

## References

### External Documentation
- [MobX 6 Documentation](https://mobx.js.org/)
- [TanStack Query Documentation](https://tanstack.com/query/latest)
- [Legend State Migration Guide](https://legendapp.com/open-source/state/)

### Internal Documentation
- [VibeGrid README](../../../archive/vibegrid/README.md)
- [State Analysis](../../../archive/vibegrid/VIBEGRID_STATE_ANALYSIS.md)
- [Pure Observables Split Plan](../../../archive/vibegrid/PURE_OBSERVABLES_SPLIT_PLAN.md)

### Related Planning
- **[TanStack DB Integration](../tanstack-db/)** - ⭐ **CRITICAL DEPENDENCY** - Must complete Phase 1 of TanStack DB integration first!
- [Rename to Baseplane](../rename-to-baseplane/)
- Session planning: `/home/benfreed/dev/baseplane-staging/sessions/`

### Dependencies & Prerequisites

⚠️ **CRITICAL**: Read [PREREQUISITES.md](PREREQUISITES.md) before starting!

**Must Complete First**:
1. TanStack DB Phase 1 (`planning/active/tanstack-db/`)
2. `@tanstack/query-db-collection` package installed
3. `useEntityCollection()` hook working
4. **Fetch limit lifted** in `entity-collections.ts` (1k → 100k)
5. **All type files copied** from archive (column-types.ts, types.ts, etc.)

**Architecture Requirements**:
- MobX stores must be framework-agnostic (no TanStack DB imports)
- Integration layer via `useVibeGridData()` hook
- Stores expose read-only computed snapshots
- Proper init/dispose lifecycle throughout

---

**Document Version**: 1.0
**Last Updated**: 2025-10-22
**Status**: Draft - Awaiting Review
