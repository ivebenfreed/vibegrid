---
initiative: vibegrid-complexity-refactor
type: improvement
status: complete
owner: platform-engineering
updated: 2025-11-29
---

# VibegGrid Complexity Analysis and Refactoring Suggestions

## Overview

Analyzed recent fix commits and core state/render files to identify overly complex patterns. The VibegGrid system has accumulated significant complexity that makes it prone to subtle bugs related to state synchronization, MobX reactivity, and RAF coordination.

## Recent Fix Commits Analyzed

### 1. `6f256d39` - Fix excessive processedRows recomputation on scroll after edit

**Root Cause:** In MobX 6, computed values without permanent observers are "suspended" and don't cache. `processedRows` and `rowOffsets` were only accessed from reaction effect functions, so they had no permanent observers and recomputed on every scroll frame.

**Fix Applied:**
- Added `keepAlive` autorun observers for `processedRows` and `rowOffsets` in `TableCoreStore.init()`
- Added `untracked()` wrappers to prevent cascade recomputation
- **Files:** `TableCoreStore.ts`, `InteractionCoordinator.ts`, `EditSessionManager.ts`

**Complexity Indicator:** Need for keepAlive patterns shows MobX computed architecture isn't naturally maintained by component subscriptions.

**Better Fix:** The keepAlive autoruns (`TableCoreStore.ts:1530-1542`) mask the underlying problem that no component observes those computeds. A small `useProcessedRows`/`useRowOffsets` hook consumed by the render layer (wrapped in `observer`) would keep the cache warm without hidden autoruns and makes the dependency explicit.

---

### 2. `5804f394` - Fix poisoned cell bug after edit cancel

**Root Cause:** When canceling an edit on cell 1 and clicking cell 2, RAF cancellation lost accumulated changes. The reaction-triggered RAF would get cancelled by subsequent changes, losing the selection update in its closure.

**Fix Applied:**
- Introduced `pendingUpdate` flags (`pendingSelectionUpdate`, `pendingEditingUpdate`, etc.) that ACCUMULATE across RAF cancellations
- Capture and reset flags at RAF execution time
- **Files:** `OverlayManager.ts`

**Complexity Indicator:** 600+ line `linkToInteractionsObservable()` method with intricate state tracking shows the overlay synchronization logic is too monolithic.

**Regression Prevention:** This fix needs a deterministic MobX+jsdom test that toggles editing/selection rapidly with fake timers to guard against regressions, plus a resize test that asserts selection overlay visibility toggles correctly when `columnResize.isResizing` flips. Tests can live under `src/systems/vibegrid/renderers/modules/__tests__/`.

---

### 3. `2f170722` - Fix cell position coordination and grouping rendering

**Root Cause:** Hidden columns were still in the coordinate system, causing index mismatches between DOM rendering and coordinate mapping.

**Fix Applied:**
- `VisualStateStore.updateCoordinatorWithCurrentLayout()` filters to visible columns only
- `SelectionService.toggleRow()` now selects only visible columns
- Added `TableCoreStore.incrementConfigVersion()` for grouping change notifications
- **Files:** `SelectionService.ts`, `TableCoreStore.ts`, `VisualStateStore.ts`

**Complexity Indicator:** Multiple places need to maintain "visible columns only" invariant - easy to miss one.

---

## Identified Complexity Patterns

### 1. Multi-Store Circular Dependencies (HIGH PRIORITY)

**Current State:**
```
TableCoreStore (1657 lines)
  ├── visualStateInputs / visualStateStore reference
  ├── coordinateManager reference
  ├── interactionStore reference
  └── schemaRegistry reference

VisualStateStore (1118 lines)
  ├── coordinateManager reference
  ├── interactionStore reference
  └── tableCoreStore reference

InteractionStore (1394 lines)
  ├── tableCoreStore reference
  └── visualStateStore reference
```

**Problems:**
- Fragile initialization order (must call `set*` methods in right sequence)
- Circular dependency chains cause confusion about data flow
- 4200+ lines across three core stores
- **Loose typing:** InteractionStore takes `any` for `tableCore$`, `tableCoreStore`, and `visualStateStore` and only logs when they're missing (`InteractionStore.ts:205-236`)

**Suggested Refactor:**
- Extract read-only computed derivations into separate "selectors" module
- Use unidirectional data flow: TableCoreStore → VisualStateStore → InteractionStore
- Replace bi-directional store references with event bus or command pattern
- **Strongly type those dependencies and assert presence in high-traffic actions (selection/edit/resize) so initialization-order bugs fail fast instead of producing subtle UI drift**

---

### 2. Version Tracking Sprawl (MEDIUM PRIORITY)

**Current State:**
```typescript
// TableCoreStore
@observable dataVersion: number = 0       // Cell value changes
@observable configVersion: number = 0     // Sort/filter/group changes
@observable structureVersion: number = 0  // Add/remove/reorder rows

// OverlayManager
private lastCoordinateMappingVersion: number = -1
private lastSelectionString: string = ''
private lastClipboardString: string = ''
```

**Problems:**
- Easy to forget to increment versions when making changes
- Version checking duplicated in multiple places
- No centralized "change event" system
- **Dedupe logic builds sorted comma-joined strings on every trigger** (`OverlayManager.ts:300-311`) - O(n log n) on selection size, allocates new strings each time

**Suggested Refactor:**
- Create `ChangeTracker` class that centralizes all version/change detection
- **Track version numbers on selection/clipboard/resize in the stores and use those scalars in reactions** - trims allocations and lets you use equals comparers instead of manual string diffing
- Use MobX `reaction` with `structuralEquality` comparer instead of manual string comparison

---

### 3. OverlayManager Monolith (HIGH PRIORITY)

**Current State:** `OverlayManager.ts` is 1304 lines with:
- Single `linkToInteractionsObservable()` reaction handling EVERYTHING (selection, editing, clipboard, resize)
- Manual deduplication with string comparisons
- Complex RAF batching with accumulated pending flags
- Inline position calculation logic

**Problems:**
- Single reaction handles 4+ different concerns
- Debugging requires understanding entire 300+ line function
- State tracking variables scattered throughout method
- Easy to introduce bugs when adding new overlay features
- **Shared RAF scheduling across all concerns** (`OverlayManager.ts:225-418`) means one concern's rapid updates can starve another

**Suggested Refactor:**
```typescript
// Split into focused controllers with isolated RAF queues per concern
class SelectionOverlayController {
  // Own reaction with equals/comparer.structural
  // Own RAF queue
}

class EditingOverlayController {
  // Own reaction
  // Own RAF queue
}

class ClipboardOverlayController {
  // Own reaction
  // Own RAF queue
}

class ResizePreviewController {
  // Own reaction
  // Own RAF queue
}

// OverlayManager becomes thin coordinator
class OverlayManager {
  private controllers = [
    new SelectionOverlayController(...),
    new EditingOverlayController(...),
    // ...
  ]
}
```

**Key insight:** Splitting into targeted reactions with `equals`/`comparer.structural` and isolated RAF queues per concern will remove the need for `pending*` flags and make future fixes safer.

---

### 4. MobX Anti-Patterns (MEDIUM PRIORITY)

**Current Issues:**
1. **keepAlive autoruns** - Indicates computed values aren't naturally observed
2. **untracked() everywhere** - Indicates reactive boundaries aren't clear
3. **Manual batching** - `runInAction()` scattered throughout

**Root Cause:** Components access stores in non-reactive contexts (event handlers, RAF callbacks).

**Suggested Refactor:**
- **Replace keepAlive autoruns with explicit hooks** - `useProcessedRows`/`useRowOffsets` consumed by render layer keeps cache warm explicitly
- Use `observer()` wrappers more aggressively in React components
- Create explicit "command" methods that handle all store updates atomically
- Consider `mobx-react-lite`'s `useLocalObservable` for local UI state
- Document reactive vs non-reactive boundaries clearly

---

### 5. Coordinate System Complexity (MEDIUM PRIORITY)

**Current State:**
- `VibeGridXCoordinateManager` - main coordinate mapping
- `dom-position-state.ts` - DOM position tracking
- `VirtualScrollManager` - virtual cell positions
- `OverlayManager.getCellPosition()` - inline position calculation
- `OverlayManager.getVisualCellPositions()` - batch position lookup

**Problems:**
- Multiple sources of truth for cell positions
- DOM position cache, coordinator positions, and inline calculations can diverge
- Fix in commit `2f170722` shows how easy it is to have coordinator/DOM mismatch

**Suggested Refactor:**
- Single `CellPositionService` that owns ALL position logic
- Clear hierarchy: DOM measurement → Coordinator → Consumers
- Remove inline position calculations from OverlayManager

---

### 6. processedRows Pipeline Complexity (MEDIUM PRIORITY)

**Current State in TableCoreStore:**
```typescript
// Single large computed (~120 lines) at TableCoreStore.ts:771-889
@computed get processedRows(): any[] {
  // Schema check
  // Data loading check
  // Get raw rows
  // Debug logging
  // Get visual state (filters, sorting, grouping)
  // Apply filters
  // Apply sorting
  // Apply grouping (if configured)
  // Apply flat row ordering (if no grouping)
  // Wrap in VirtualRow structure
  // Return
}
```

**Problems:**
- One large computed with logging and helper functions
- Any change to filters/sort/group recomputes everything
- Hard to unit-test individual stages

**Suggested Refactor:**
Break the pipeline into smaller computeds with memoized selectors:
```typescript
@computed get filteredRows(): any[] { ... }
@computed get sortedRows(): any[] { ... }  // depends on filteredRows
@computed get groupedRows(): any[] { ... } // depends on sortedRows
@computed get processedRows(): any[] { ... } // depends on groupedRows
```

This cuts recomputation churn (sort changes don't re-filter) and makes it easier to unit-test each stage. Dovetails with the "selector" module approach.

---

### 7. SimplePassiveRenderer Monolith (HIGH PRIORITY)

**Current State:** `SimplePassiveRenderer.ts` is ~2500 lines and owns:
- DOM creation and wiring
- Overlay initialization
- Controller initialization (7+ controllers)
- Service initialization
- Observer setup
- Version-based update routing
- Header/body rendering

**Location:** `src/systems/vibegrid/renderers/core/SimplePassiveRenderer.ts`

**Problems:**

1. **Update routing embedded in renderer** - Version-based reaction and granular/full render branching live inside `initFocusedObservers()` (`SimplePassiveRenderer.ts:426-574`). This should be a dedicated scheduler module.

2. **Mixed legacy/new APIs** - EventManager is fed `tableCore$` as `any` and null `tableViewport$` (`SimplePassiveRenderer.ts:374-379`):
   ```typescript
   this.eventManager = new EventManager({
     tableCore$: this.tableCoreStore as any,
     tableInteraction$: this.interactionStore as any,
     tableViewport$: null as any, // Legacy parameter, not used
     ...
   })
   ```

3. **Controller churn and duplicate dependencies** - Multiple controllers each pull `processedRows`/visible columns through inline getters (`SimplePassiveRenderer.ts:272-330`):
   ```typescript
   getProcessedRows: () => this.tableCoreStore.processedRows,
   getVisibleColumns: () => {
     const columns = this.visualStateStore.columns
     const columnVisibility = this.visualStateStore.columnVisibility
     return columns.filter((col) => columnVisibility[col.id] !== false)
   },
   ```
   This increases recomputation risk and coupling.

4. **Commented-out observers** - Visual/interaction observers are commented out (`SimplePassiveRenderer.ts:706-898`), suggesting layout/interaction reactions are incomplete. The renderer currently relies only on data/column observers.

5. **Hot-path logging** - Verbose logging inside reactions and render paths hurts scroll/edit performance.

**Suggested Refactor:**

Split into focused modules:
```typescript
// 1. RendererShell - DOM structure and component wiring
class RendererShell {
  // DOM creation
  // Container references
  // Component lifecycle (init/destroy)
}

// 2. RenderScheduler - Update routing based on versions
class RenderScheduler {
  // Watches dataVersion/configVersion/structureVersion
  // Invokes render callbacks
  // Owns granular vs full render decision
}

// 3. ViewModelProvider - Shared memoized selectors
class ViewModelProvider {
  @computed get processedRows() { ... }
  @computed get visibleColumns() { ... }
  // Controllers consume this instead of inline getters
}

// 4. SimplePassiveRenderer - Thin façade
class SimplePassiveRenderer {
  private shell: RendererShell
  private scheduler: RenderScheduler
  private viewModel: ViewModelProvider

  constructor(options) {
    this.viewModel = new ViewModelProvider(options.stores)
    this.shell = new RendererShell(options, this.viewModel)
    this.scheduler = new RenderScheduler(options.stores, this.shell)
  }
}
```

**Additional cleanup:**
- Pull EventManager/KeyboardController onto typed MobX APIs and drop legacy bridge params
- Finish or delete commented observers - let selection/overlay controllers own their reactions
- Guard logging behind log levels

---

### 8. VirtualScrollManager Stub (HIGH PRIORITY)

**Current State:** `virtualization/VirtualScrollManager.ts` is a non-functional stub:
- Global mutable state, no MobX observables (`VirtualScrollManager.ts:1-150`)
- `virtualCellPosition$` returns `null` by design
- `scrollToRow()`, `scrollToColumn()`, `getVirtualCellPosition()` are TODOs
- Overlays/hooks relying on virtual positions cannot work

**Location:** `src/systems/vibegrid/virtualization/VirtualScrollManager.ts`

**Problems:**
- Any code expecting virtual positioning silently fails
- No reactive updates when scroll position changes
- Parallel scroll tracking in renderer, controllers, and this stub

**Suggested Refactor:**
- Option A: **Wire to MobX** with computed ranges and observable positions
- Option B: **Delete the shim** and route everything through CoordinateManager + DOM positions

```typescript
// Option A: MobX-backed VirtualViewportStore
class VirtualViewportStore {
  @observable scrollTop: number = 0
  @observable scrollLeft: number = 0
  @observable viewportWidth: number = 0
  @observable viewportHeight: number = 0

  @computed get visibleRowRange(): { start: number; end: number } { ... }
  @computed get visibleColumnRange(): { start: number; end: number } { ... }
  @computed get virtualBounds(): Bounds { ... }

  getCellPosition(rowId: string, columnId: string): Position | null { ... }
}
```

---

### 9. Disabled Cell-Position Hook (MEDIUM PRIORITY)

**Current State:** `hooks/use-cell-position.ts` throws on import:
```typescript
// use-cell-position.ts:1-40
throw new Error('useCellPosition is disabled - virtual scroll not implemented')
```

**Problems:**
- Any accidental import crashes the app
- Still references the non-functional virtual stub
- No way to get cell positions in React components

**Suggested Refactor:**
- Guard with feature flag instead of throw:
```typescript
export function useCellPosition(cellId: string): Position | null {
  if (!featureFlags.virtualScroll) {
    // Fall back to DOM position lookup
    return positionTracker.getCellPosition(cellId)
  }
  // Virtual implementation when ready
}
```
- Or remove entirely until virtual path is implemented

---

### 10. Dual Coordinate Sources (HIGH PRIORITY)

**Current State:** Two unsynchronized position systems:

1. **VibeGridXCoordinateManager** - Imperative, event-based
   - Manual updates via `updateColumns()`, `updateRows()`
   - Not observable - changes don't trigger MobX reactions

2. **dom-position-state.ts** - Builds full N×M position map in computed
   - Uses `coordinateMapping` from somewhere (`dom-position-state.ts:40-120`)
   - Won't refresh unless someone manually calls `updateCoordinateMapping()`

**Problems:**
- Coordinator changes don't propagate to position computeds
- Overlays may use stale positions after column resize/reorder
- Multiple DOM scans for position information

**Suggested Refactor:**
- **Make CoordinateManager observable** with MobX façade:
```typescript
class ObservableCoordinateManager {
  @observable.ref private coordinator: VibeGridXCoordinateManager

  @observable version: number = 0  // Increment on any update

  @computed get columnPositions(): Map<string, number> { ... }
  @computed get rowPositions(): Map<string, number> { ... }

  updateColumns(...) {
    this.coordinator.updateColumns(...)
    this.version++  // Trigger reactions
  }
}
```
- Or drop `dom-position-state.ts` computed map and rely on coordinator directly

---

### 11. Backup/Archive File Pollution (LOW PRIORITY)

**Current State:** Non-live files sit alongside active code:
- `*.backup` files
- `*.old` files
- Archived implementations not in `archive/` folder

**Problems:**
- Risk of accidental imports
- Confusion about which files are active
- IDE autocomplete suggests dead code

**Suggested Refactor:**
- Move all non-live files to `archive/` subfolder
- Or delete once migrated versions are stable
- Add lint rule to warn on backup file imports

---

### 12. Virtual Scroll Math Duplication (MEDIUM PRIORITY)

**Current State:** Visible range calculation duplicated in:
- `SimplePassiveRenderer` - inline visible row/column calculations
- Various controllers - each computes their own ranges
- `VirtualScrollManager` - tracks `virtualBounds`/`viewport` separately

**Problems:**
- Same math written multiple times
- Risk of inconsistent calculations
- Changes require updates in multiple places

**Suggested Refactor:**
- Consolidate in single `VirtualViewportStore`:
```typescript
class VirtualViewportStore {
  @computed get visibleRowRange() { ... }
  @computed get visibleColumnRange() { ... }

  // All consumers read from here
  isRowVisible(rowIndex: number): boolean { ... }
  isColumnVisible(columnIndex: number): boolean { ... }
}
```
- Feed both renderer and overlays from this single source

---

### 13. Change Detection Complexity (LOW PRIORITY)

**Current State in TableCoreStore:**
```typescript
// ~100 lines of detectChangedCells()
// Per-column hashing for loop-back protection
// previousRowsSnapshot Map<string, RowSnapshot>
// METADATA_COLUMNS exclusion set
// Change classification logic
```

**Problems:**
- Complex to understand the full flow
- Hash collisions could cause missed updates
- Baseline initialization is timing-sensitive

**Suggested Refactor:**
- Consider using `immer` patches for change tracking
- Or leverage TanStack DB's built-in change tracking
- Document the invariants (baseline must exist before edits)

---

## Refactoring Priority

| Priority | Pattern | Impact | Effort | Risk |
|----------|---------|--------|--------|------|
| 1 | OverlayManager split | High - reduces bug surface | Medium | Low |
| 2 | SimplePassiveRenderer split | High - clearer architecture | High | Medium |
| 3 | Dual coordinate sources → single observable | High - fixes stale positions | Medium | Medium |
| 4 | VirtualScrollManager → MobX or delete | High - unblocks virtual features | Medium | Low |
| 5 | Store dependency cleanup + typing | High - fail-fast | Medium | Low |
| 6 | processedRows pipeline split | Medium - perf + testability | Low | Low |
| 7 | Version tracking centralization | Medium - consistency + perf | Low | Low |
| 8 | Virtual scroll math consolidation | Medium - DRY | Medium | Low |
| 9 | MobX pattern improvements (hooks) | Medium - explicit deps | Medium | Low |
| 10 | Disabled hook cleanup | Low - safety | Low | Low |
| 11 | Backup file cleanup | Low - hygiene | Low | Low |
| 12 | Change detection simplification | Low - already working | High | High |

---

## Immediate Low-Risk Improvements

1. **Extract overlay controllers from OverlayManager** - Each controller handles one overlay type with own reaction and RAF queue, removing need for `pending*` flags

2. **Add version numbers to InteractionStore** for selection/clipboard:
   ```typescript
   @observable selectionVersion: number = 0
   @observable clipboardVersion: number = 0
   ```
   Reactions can compare scalars instead of building sorted strings.

3. **Split processedRows into pipeline** - `filteredRows` → `sortedRows` → `groupedRows` → `processedRows`

4. **Replace keepAlive autoruns with hooks** - `useProcessedRows()` consumed by render layer makes dependency explicit

5. **Strongly type store dependencies** - Change `any` to proper types in InteractionStore, add assertions in high-traffic methods

6. **Add regression tests** for RAF/accumulated-flags fix:
   - Test rapid edit/cancel/select toggling with fake timers
   - Test resize overlay visibility toggling
   - Location: `src/systems/vibegrid/renderers/modules/__tests__/`

7. **Add invariant assertions** - At key synchronization points:
   ```typescript
   assertInvariant(
     coordinateManager.columnCount === visibleColumns.length,
     'Coordinator columns must match visible columns'
   )
   ```

8. **Extract RenderScheduler from SimplePassiveRenderer** - Move version-based update routing (`initFocusedObservers` lines 426-574) to dedicated module

9. **Create ViewModelProvider** - Single source for `processedRows`/`visibleColumns` selectors, replacing per-controller inline getters

10. **Clean up legacy bridge params** - Type EventManager/KeyboardController to use MobX stores directly, remove `as any` casts

11. **Delete or finish commented observers** - Either implement visual/interaction observers (`SimplePassiveRenderer.ts:706-898`) or remove and let overlay controllers own those reactions

12. **Fix useCellPosition hook** - Replace throw with feature flag guard or DOM fallback to prevent crash on accidental import

13. **Clean backup files** - Move `*.backup`, `*.old` files to `archive/` folder or delete

14. **Make CoordinateManager observable** - Add version number that increments on updates so MobX reactions can detect changes

15. **Delete or implement VirtualScrollManager** - Either wire to MobX properly or remove the stub and route through CoordinateManager

---

## Goals

- [x] Review this analysis
- [x] Incorporate feedback refinements
- [ ] Prioritize which refactors to pursue
- [ ] Create implementation plan for selected refactors
