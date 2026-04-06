# VibeGrid Migration Catalog

**Date**: 2025-10-22
**Source**: `/archive/vibegrid/` → `/src/components/vibegrid/`
**Files Copied**: 121 files
**Migration Type**: Legend State → MobX + TanStack DB

---

## Legend State Usage Statistics

### Files with Legend State Dependencies
- **Total Legend State imports**: 33 across 20+ files
- **Files accessing entity atoms**: 3 files
- **observable() calls in stores**: 5
- **computed() calls in stores**: 13
- **.get() calls in stores**: 198
- **.set() calls in stores**: 234

### Key Files Using Legend State

#### State Management (Core - Must Migrate)
1. `stores/data-state.ts` (25KB) - **CRITICAL**
   - Entity data processing
   - Filtering, sorting, grouping logic
   - Accesses entity atoms

2. `stores/visual-state.ts` (51KB) - **CRITICAL**
   - Largest store file
   - Column layouts and positioning
   - Viewport geometry computations

3. `stores/interaction-state.ts` (38KB) - **CRITICAL**
   - Selection logic (20+ selection modes)
   - Editing state
   - Keyboard navigation

4. `stores/simple-persistence.ts` (33KB) - **IMPORTANT**
   - LocalStorage synchronization
   - User preferences persistence

5. `stores/init-state.ts` (14KB) - **IMPORTANT**
   - Store initialization
   - Lifecycle management

6. `stores/data-loading-stages.ts` (16KB) - **MEDIUM**
   - Loading state management

7. `stores/dom-position-state.ts` (20KB) - **MEDIUM**
   - DOM positioning calculations

8. `stores/column-generation.ts` (12KB) - **LOW**
   - Column configuration

9. `stores/pure-observables.ts` (1.9KB) - **LOW**
   - Pure observable utilities

#### Main Component (Must Update)
10. `VibeGrid.tsx` - **CRITICAL**
    - Main component entry point
    - Needs MobX provider
    - Needs TanStack DB integration

#### React Components (Need Observer Wrappers)
11. `components/VibeGridXHeaderPure.tsx`
12. `components/VibeGridXColumnVisibilityPure.tsx`
13. `components/GroupConfigDropdownPure.tsx`
14. `components/VibeGridEntityAdd.tsx`
15. `components/VibeGridLoadingOverlay.tsx`

#### Hooks (Need Updates)
16. `hooks/use-entity-row-changes.ts`
17. `hooks/use-cell-position.ts`
18. `hooks/use-position-utils.ts`

#### Editors (Minimal Changes)
19. `overlays/editors/RelationshipEditor.tsx`
20. `overlays/editors/ComboboxEditor.tsx`

#### Renderers (Minor Changes)
21. `renderers/core/SimplePassiveRenderer.ts`
22. `renderers/components/HeaderRenderer.ts`
23. `renderers/modules/SelectionController.ts`
24. `renderers/modules/OverlayManager.ts`
25. `virtualization/VirtualScrollManager.ts`

---

## Entity Atom Access (TanStack DB Migration)

### Files Accessing Entity Atoms (3 files)
1. **`stores/data-state.ts`** - Main entity data access
   - `getEntity$()` calls
   - Processes entity map into rows

2. **`components/VibeGridEntityAdd.tsx`** - Entity creation
   - `entityOperations.create()`

3. **`utils/entity-update-helpers.ts`** - Entity mutations
   - `entityOperations.update()`
   - `entityOperations.delete()`

**Migration strategy**: Replace with TanStack DB `useEntityCollection()` + `useLiveQuery()`

---

## Directory Structure

```
src/components/vibegrid/
├── VibeGrid.tsx                    # Main component - NEEDS UPDATE
├── column-types.ts                 # Type definitions - NO CHANGE
├── column-defaults.ts              # Defaults - NO CHANGE
├── index.ts                        # Exports - MINOR UPDATE
│
├── stores/                         # STATE MANAGEMENT - CRITICAL CHANGES
│   ├── data-state.ts              # ⚠️ MUST MIGRATE (25KB)
│   ├── visual-state.ts            # ⚠️ MUST MIGRATE (51KB)
│   ├── interaction-state.ts       # ⚠️ MUST MIGRATE (38KB)
│   ├── simple-persistence.ts      # ⚠️ MUST MIGRATE (33KB)
│   ├── init-state.ts              # ⚠️ MUST MIGRATE (14KB)
│   ├── data-loading-stages.ts     # ⚠️ SHOULD MIGRATE (16KB)
│   ├── dom-position-state.ts      # ⚠️ SHOULD MIGRATE (20KB)
│   ├── column-generation.ts       # ⚠️ MINOR UPDATE (12KB)
│   └── pure-observables.ts        # ⚠️ MINOR UPDATE (1.9KB)
│
├── components/                     # REACT COMPONENTS - ADD OBSERVERS
│   ├── VibeGridXHeaderPure.tsx    # ✅ Add observer()
│   ├── VibeGridXColumnVisibilityPure.tsx  # ✅ Add observer()
│   ├── GroupConfigDropdownPure.tsx  # ✅ Add observer()
│   ├── GroupConfigPanel.tsx         # ✅ Add observer()
│   ├── VibeGridEntityAdd.tsx        # ✅ Add observer() + TanStack DB
│   ├── VibeGridLoadingOverlay.tsx   # ✅ Add observer()
│   └── TableSkeleton.tsx            # ✅ Fix @/logger import
│
├── hooks/                          # CUSTOM HOOKS - UPDATES NEEDED
│   ├── use-entity-row-changes.ts  # ✅ Update for MobX
│   ├── use-cell-position.ts       # ✅ Update for MobX
│   └── use-position-utils.ts      # ✅ Update for MobX
│
├── overlays/                       # OVERLAYS - MINIMAL CHANGES
│   ├── editors/
│   │   ├── RelationshipEditor.tsx # ✅ Update state access
│   │   └── ComboboxEditor.tsx     # ✅ Update state access
│   └── ... (other editors)         # ⬜ NO CHANGE
│
├── renderers/                      # DOM RENDERERS - MINIMAL CHANGES
│   ├── core/
│   │   └── SimplePassiveRenderer.ts  # ✅ Update state access
│   ├── components/
│   │   └── HeaderRenderer.ts         # ✅ Update state access
│   ├── modules/
│   │   ├── SelectionController.ts    # ✅ Update state access
│   │   └── OverlayManager.ts         # ✅ Update state access
│   └── ... (other modules)           # ⬜ NO CHANGE
│
├── virtualization/                 # VIRTUAL SCROLLING - MINIMAL CHANGES
│   └── VirtualScrollManager.ts    # ✅ Update state access
│
├── utils/                          # UTILITIES - MINOR UPDATES
│   └── entity-update-helpers.ts   # ✅ TanStack DB mutations
│
├── field-types/                    # FIELD TYPES - NO CHANGE
│   └── implementations/           # ⬜ NO CHANGE (25+ field types)
│
├── managers/                       # MANAGERS - NO CHANGE
│   ├── ClipboardManager.ts        # ⬜ NO CHANGE
│   ├── RollupCalculationManager.ts  # ⬜ NO CHANGE
│   └── RelationshipDataManager.ts   # ⬜ NO CHANGE
│
├── processors/                     # DATA PROCESSORS - NO CHANGE
│   └── GroupProcessor.ts          # ⬜ NO CHANGE (grouping logic)
│
├── factories/                      # DOM FACTORIES - NO CHANGE
│   └── ...                        # ⬜ NO CHANGE
│
├── coordinates/                    # COORDINATE SYSTEM - NO CHANGE
│   └── VibeGridXCoordinateManager.ts  # ⬜ NO CHANGE
│
├── constants/                      # CONSTANTS - NO CHANGE
│   └── ...                        # ⬜ NO CHANGE
│
└── schema/                         # SCHEMA DEFINITIONS - NO CHANGE
    └── ...                        # ⬜ NO CHANGE
```

---

## Migration Priorities

### Phase 1: Critical Store Migration (Days 3-6)
**Priority**: 🔴 CRITICAL
**Effort**: LARGE

1. **data-state.ts** (Day 3)
   - Create `TableCoreStore` class
   - Convert observables to MobX
   - Move entity access to integration layer
   - Estimated: 6-8 hours

2. **visual-state.ts** (Day 4)
   - Create `VisualStateStore` class
   - Convert computed layouts
   - Keep all geometry calculations
   - Estimated: 8-10 hours (largest file)

3. **interaction-state.ts** (Day 5)
   - Create `InteractionStore` class
   - Copy all 20+ selection methods
   - Convert to MobX actions
   - Estimated: 6-8 hours

4. **simple-persistence.ts** (Day 6)
   - Convert to MobX reactions
   - Keep LocalStorage logic
   - Estimated: 4-6 hours

5. **init-state.ts** (Day 6)
   - Convert to store lifecycle methods
   - Implement IStore interface
   - Estimated: 2-3 hours

### Phase 2: Integration Layer (Days 5-7)
**Priority**: 🔴 CRITICAL
**Effort**: MEDIUM

1. **Create `hooks/useVibeGridData.ts`** (Day 5)
   - Bridge MobX → TanStack DB
   - Replace entity atom access
   - Estimated: 4-6 hours

2. **Create `hooks/useMobxSnapshot.ts`** (Day 5)
   - MobX computed → React bridge
   - Estimated: 1 hour

3. **Create `stores/context.tsx`** (Day 6)
   - Store provider and context
   - Estimated: 1 hour

4. **Update `VibeGrid.tsx`** (Day 7)
   - Add MobX provider
   - Use TanStack DB integration
   - Keep all rendering logic
   - Estimated: 3-4 hours

### Phase 3: Component Updates (Days 8-10)
**Priority**: 🟡 HIGH
**Effort**: MEDIUM

1. **Add observer() wrappers** (Day 8-9)
   - 5-7 React components
   - Replace `useSelector()` with direct access
   - Estimated: 4-6 hours

2. **Update hooks** (Day 9)
   - 3 custom hooks
   - Update state access patterns
   - Estimated: 2-3 hours

3. **Update editors** (Day 10)
   - 2 editor components
   - Minimal changes
   - Estimated: 1-2 hours

4. **Update renderers** (Day 10)
   - 4-5 renderer files
   - Update state access
   - Estimated: 2-3 hours

### Phase 4: Testing & Validation (Days 11-14)
**Priority**: 🟡 HIGH
**Effort**: MEDIUM

1. **Create test routes** (Day 11)
2. **Manual feature testing** (Day 12-13)
3. **Playwright tests** (Day 14)
4. **Performance validation** (Day 15)

---

## Files NOT Needing Changes (~96 files)

### Completely Unchanged
- **Field types** (25+ files) - Pure logic, no state
- **Managers** (3 files) - Utility managers
- **Processors** (1 file) - Data processing logic
- **Most factories** (10+ files) - DOM creation
- **Coordinate system** (1 file) - Geometry calculations
- **Most renderers** (15+ files) - DOM manipulation
- **Constants** (5+ files) - Configuration
- **Schema** (5+ files) - Type definitions
- **Utilities** (10+ files) - Helper functions
- **Most overlays** (10+ files) - Canvas overlays

---

## Conversion Patterns

### Observable Pattern
```typescript
// BEFORE (Legend State)
const tableCore$ = observable({
  filters: [] as FilterConfig[]
});

// AFTER (MobX)
export class TableCoreStore {
  @observable filters: FilterConfig[] = [];

  constructor() {
    makeObservable(this, {
      filters: observable,
      setFilters: action
    });
  }

  @action setFilters(filters: FilterConfig[]): void {
    this.filters = filters;
  }
}
```

### Computed Pattern
```typescript
// BEFORE (Legend State)
const visualState$ = computed(() => {
  const inputs = visualInputs$.get();
  return computeLayouts(inputs);
});

// AFTER (MobX)
export class VisualStateStore {
  @computed get visualState(): VisualState {
    return computeLayouts(this.inputs);
  }
}
```

### Access Pattern
```typescript
// BEFORE (Legend State)
const value = state$.property.get();
state$.property.set(newValue);

// AFTER (MobX)
const value = store.property;  // Direct access
store.setProperty(newValue);   // Action method
```

### Entity Access Pattern
```typescript
// BEFORE (Legend State)
const entities = getEntity$(entityType).get();
entityOperations.update(entityType, rowId, updates);

// AFTER (TanStack DB)
const collection = useEntityCollection(entityType);
const { data: rows } = useLiveQuery(...);
collection.update(rowId, (draft) => { ... });
```

---

## Next Steps

1. ✅ **Files copied** - Complete
2. ✅ **Type check run** - Complete
3. ✅ **Usage catalog created** - Complete (this document)
4. ⏭️ **Create migration checklist** - Next
5. ⏭️ **Verify prerequisites** - Next
6. ⏭️ **Begin store migration** - Day 3

---

## Risk Assessment

### Low Risk (96 files)
- Field types
- Managers
- Processors
- Factories
- Most utilities
- Most renderers

### Medium Risk (20 files)
- React components (observer wrappers)
- Hooks (state access updates)
- Some renderers

### High Risk (5 files)
- Store migrations (complex state logic)
- Main component (integration point)
- Entity access (TanStack DB)

---

**Total Complexity**:
- 🔴 Must change: ~25 files
- ⬜ No change: ~96 files
- **Change ratio**: 21% of files

**Timeline Estimate**: 2-3 weeks
**Confidence**: High (working implementation to copy from)

---

**Document Version**: 1.0
**Last Updated**: 2025-10-22
