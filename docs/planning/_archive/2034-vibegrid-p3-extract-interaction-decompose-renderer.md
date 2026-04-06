---
initiative: GH#2034-vibegrid-p3-refactors
type: chore
issue_type: chore
status: approved
priority: medium
roadmap: null
owner: null
github_issue: 2034
github_milestone: null
created: 2026-03-20
updated: 2026-03-20
phases:
  - id: p1
    name: "Extract FilterBuilderStore + MenuStateStore from InteractionStore"
    tasks:
      - "Create stores/FilterBuilderStore.ts with state (lines 250-262), methods (lines 1402-1457), and computeds (lines 452-473)"
      - "Create stores/MenuStateStore.ts with state (lines 218-249) and 11 open/close methods (lines 1245-1400)"
      - "Remove extracted state/methods/computeds from InteractionStore.ts"
      - "Update context.tsx: instantiate new stores, add to VibeGridStores bundle, wire useFilterBuilderStore()/useMenuStateStore() hooks"
      - "Update UI consumers: FilterBuilder.tsx, FilterBuilder.test.tsx → import from FilterBuilderStore"
      - "Update UI consumers: VibeGridXColumnVisibilityPure.tsx, GroupConfigDropdownPure.tsx, FloatingActionsMenu.tsx → import from MenuStateStore"
      - "Verify filter-builder.test.ts, readableState.test.ts, and FilterBuilder.test.tsx pass"
  - id: p2
    name: "Type store dependency injection"
    tasks:
      - "Define VibeGridCollection<T> type alias for Collection generic from TanStack DB"
      - "Define FilterValue discriminated union for filter value any-types"
      - "Replace any in TableCoreStore: setCollection, setRows, setMembersData, setEntityReferenceRecord"
      - "Replace any in VisualStateStore: setTableCoreStore, setFilter"
      - "Replace any in ViewportStore: setTableCoreStore"
      - "Replace any in InteractionStore: setCollection"
      - "Replace any in EditingStore: setCollection"
      - "Replace any in KanbanViewStore: setCollection"
      - "Replace any in GanttViewStore: setCollection, setDependencyCollection"
      - "Replace any in InteractionCoordinator: setOverlayManager → OverlayManager type"
      - "Fix 2 as any casts in context.tsx for SchemaRegistry"
      - "Verify pnpm typecheck passes with zero new suppressions"
  - id: p3
    name: "Split MouseController into sub-controllers"
    tasks:
      - "Create renderers/modules/ClickRouter.ts (~200 lines) for click interpretation and dispatch"
      - "Create renderers/modules/DragSelectionController.ts (~150 lines) for drag-to-select rectangle"
      - "Create renderers/modules/FillDragController.ts (~150 lines) for fill handle drag"
      - "Create renderers/modules/HoverTracker.ts (~100 lines) for hover state management"
      - "Slim MouseController.ts to coordinator role (~300 lines): event listener setup + routing"
      - "Keep column drag, column resize, row drag in MouseController (tightly coupled to header)"
      - "Verify all existing interaction tests pass"
  - id: p4
    name: "Decompose SimplePassiveRenderer (ObserverManager + init builder)"
    tasks:
      - "Create renderers/core/ObserverManager.ts (~400 lines): wrap ~12 active MobX reactions from initFocusedObservers() (lines 541-1202) + setupSelectionDeltaReaction() + initGridLineCanvasReactions()"
      - "Expose named methods per reaction: createDataObserver(), createScrollObserver(), etc."
      - "Migrate observersEnabled guard flag and all reaction disposers (14 fields declared at lines 135-169, ~12 active) into ObserverManager"
      - "Create renderers/core/GridInitBuilder.ts (~200 lines): builder pattern encoding the 10-step init sequence"
      - "Each builder step returns a more specific type, enforcing ordering at compile time"
      - "Update SimplePassiveRenderer to delegate to ObserverManager and GridInitBuilder"
      - "Verify pnpm typecheck + all existing tests pass"
---

# VIbeGrid P3: Extract InteractionStore, Decompose SimplePassiveRenderer, Type DI, Split MouseController

> GitHub Issue: [#2034](https://github.com/baseplane-ai/baseplane/issues/2034)

## Overview

Four structural refactors to VIbeGrid's largest files. No behavior changes, no new features, no public API surface changes. All existing tests must continue to pass.

**Research basis:** `planning/research/2026-03-19-vibegrid-rendering-refactor-targets.md` — findings 8, 4, 10, 1.

**Total files affected:** ~30 files across stores, renderers, components, and context.

**Constraint:** Performance must not degrade. The DOM recycling and RAF-throttled rendering in `SimplePassiveRenderer` must be preserved as-is.

---

## Problem

Four files in VIbeGrid have grown into maintenance burdens:

| File | Lines | Problem |
|------|-------|---------|
| `renderers/core/SimplePassiveRenderer.ts` | 3,108 | God object: DOM setup, 11 reactions, 10-step fragile init, scroll, overlay |
| `stores/InteractionStore.ts` | 1,785 | Mixes selection/hover/drag with filter builder state and 5 menu states |
| `renderers/modules/MouseController.ts` | 1,703 | All mouse interactions (click routing, drag select, fill drag, hover, column/row drag) |
| `context.tsx` | 430 | 25+ `set*()` calls wiring 14 stores — 13 stores use `any`-typed setters + 2 `as any` casts |

The `any`-typed store dependency injection in `context.tsx` hides type errors at wiring boundaries. The fragile 10-step init sequence in `SimplePassiveRenderer` has no compiler enforcement of ordering. Filter builder state has no business living alongside mouse coordinate tracking.

---

## Solution

### Phase 1: Extract FilterBuilderStore + MenuStateStore from InteractionStore

**FilterBuilderStore** (~85 lines extracted from `InteractionStore`) owns:
- State: `filterBuilderState` (isOpen, searchValue, draftFilterGroup, presets, validationErrors, showComplexityWarning)
- Methods: `openFilterBuilder()`, `closeFilterBuilder()`, `setDraftFilter()`, `loadPresets()`, `savePreset()`, `loadPreset()`, `deletePreset()`
- Computeds: `validationErrors`, `hasValidationErrors`, `showComplexityWarning`
- Dependencies: `filter-types.ts`, `filter-utils.ts`, `filter-storage.ts`

**MenuStateStore** (~157 lines extracted from `InteractionStore`) owns:
- State: `headerMenuState`, `contextMenuState`, `columnVisibilityMenuState`, `groupConfigMenuState`, `rowActionMenuState`
- Methods: 11 open/close methods for 5 menus
- Exported interfaces: `HeaderMenuState`, `ContextMenuState`, `ColumnVisibilityMenuState`, `GroupConfigMenuState`, `RowActionMenuState`

**Post-extraction InteractionStore:** ~1,506 lines focused on selection, hover, drag, resize, clipboard, row expansion.

**Wiring in context.tsx:**
- Create `FilterBuilderStore` and `MenuStateStore` instances alongside existing stores
- Add both to `VibeGridStores` bundle
- Expose `useFilterBuilderStore()` and `useMenuStateStore()` context hooks
- Update `PersistenceStore` reference for filter preset persistence
- Update `readableState` computed to snapshot from `MenuStateStore`

**Consumer impact:** 21 files import `InteractionStore` — most use selection/drag/hover which stays. 5 UI files need import updates:
- `FilterBuilder.tsx` and `FilterBuilder.test.tsx` — use `filterBuilderState` and filter methods → import from `FilterBuilderStore`
- `VibeGridXColumnVisibilityPure.tsx` — reads `columnVisibilityMenuState` → import from `MenuStateStore`
- `GroupConfigDropdownPure.tsx` — reads `groupConfigMenuState` → import from `MenuStateStore`
- `FloatingActionsMenu.tsx` — reads menu state properties → import from `MenuStateStore`

### Phase 2: Type Store Dependency Injection

Replace `any`-typed setter parameters with concrete types across 13 stores and `context.tsx`.

**New shared types to define:**
- `VibeGridCollection<T>` — type alias for `Collection<T>` from TanStack DB, used by 6 stores
- `FilterValue` — discriminated union type for `setFilter(field: string, value: any)` in `VisualStateStore`

**Full replacement table:**

| Store | Method | Replace `any` With |
|-------|--------|--------------------|
| `TableCoreStore` | `setCollection(collection: any)` | `VibeGridCollection<T>` |
| `TableCoreStore` | `setRows(rows: any[])` | Typed row interface |
| `TableCoreStore` | `setMembersData(members: any[])` | Member type |
| `TableCoreStore` | `setEntityReferenceRecord(...data: any)` | `Record<string, unknown>` |
| `VisualStateStore` | `setTableCoreStore(store: any)` | `TableCoreStore` |
| `VisualStateStore` | `setFilter(field: string, value: any)` | `FilterValue` discriminated union |
| `ViewportStore` | `setTableCoreStore(store: any)` | `TableCoreStore` |
| `InteractionStore` | `setCollection(collection: any)` | `VibeGridCollection<T>` |
| `EditingStore` | `setCollection(collection: any)` | `VibeGridCollection<T>` |
| `KanbanViewStore` | `setCollection(collection: any)` | `VibeGridCollection<T>` |
| `GanttViewStore` | `setCollection(collection: any)` | `VibeGridCollection<T>` |
| `GanttViewStore` | `setDependencyCollection(...)` | `VibeGridCollection<T>` |
| `InteractionCoordinator` | `setOverlayManager(overlayManager: any)` | `OverlayManager` |
| `context.tsx` | 2× `as any` for SchemaRegistry | `SchemaRegistry` |

**Constraint:** Zero new `// @ts-ignore` or `as any` suppressions introduced. Circular import risk: `TableCoreStore` and `VisualStateStore` have a bidirectional dependency — type imports (not value imports) are safe.

### Phase 3: Split MouseController

`MouseController.ts` (1,703 lines) extracted into 4 focused sub-controllers plus a slimmed coordinator.

**New files:**

| File | Lines | Responsibility |
|------|-------|----------------|
| `renderers/modules/ClickRouter.ts` | ~200 | Single/double click detection, content vs affordance routing, right-click context menu trigger |
| `renderers/modules/DragSelectionController.ts` | ~150 | `startDragSelect()`, `updateDragSelect()`, `endDragSelect()`, 8px threshold, selection range calc |
| `renderers/modules/FillDragController.ts` | ~150 | Fill handle detection, `handleFillStart()` delegation, fill drag state tracking |
| `renderers/modules/HoverTracker.ts` | ~100 | Mouse position tracking, hovered cell/row computation, `setHover()`/`clearHover()` delegation |

**MouseController becomes coordinator (~300 lines):**
- Sets up global mouse event listeners
- Routes events to appropriate sub-controller
- Manages shared state: `isTracking`, `startPosition`, `justEndedDrag`
- Retains column drag, column resize, row drag (tightly coupled to header structure)
- Instantiates sub-controllers with shared dependencies via options object: `{ interactionStore, interactionCoordinator, cellActionRouter, selectionController, visualStateStore }`

**No external interface changes.** `SimplePassiveRenderer` instantiates `MouseController` — that call site is unchanged.

### Phase 4: Decompose SimplePassiveRenderer (ObserverManager + Init Builder)

Two focused extractions from `SimplePassiveRenderer.ts` (3,108 lines). Not a full decomposition — the goal is to make the two riskiest areas explicit and testable.

**ObserverManager (~400 lines) — new file: `renderers/core/ObserverManager.ts`:**
- Wraps the ~12 active MobX reactions from `initFocusedObservers()` (lines 541-1202)
- Each reaction becomes a named method: `createDataObserver()`, `createScrollObserver()`, `createSelectionObserver()`, etc.
- Owns the `observersEnabled` guard flag
- Manages all all reaction disposer functions (~12 active, 14 fields total)
- `dispose()` method tears down all reactions cleanly
- SPR delegates: `this._observerManager = new ObserverManager(stores); this._observerManager.init()`

**GridInitBuilder (~200 lines) — new file: `renderers/core/GridInitBuilder.ts`:**
- Encodes the 10-step init sequence with explicit dependency chain
- Builder pattern where each step returns a more specific builder type, enforcing ordering at compile time:
  ```
  new GridInitBuilder(stores)
    .initDOM()              // returns DOMReadyBuilder
    .initControllers()      // returns ControllersReadyBuilder
    .initDOMFactory()       // returns DOMFactoryReadyBuilder
    ...
    .build()                // returns void, enforces all steps present
  ```
- Makes the fragile ordering explicit — missing a step is a compile error, not a runtime bug

**DOMElementFactory** (`renderers/factories/DOMElementFactory.ts`, 424 lines) is already extracted. Leave `initDOM()` method (~105 lines, 2278-2383) in SPR or reference it from the builder — no new extraction needed.

**ScrollController** is already partially extracted (370 lines). Leave as-is — tight coupling to header sync is acceptable.

**Post-decomposition SimplePassiveRenderer:** ~2,500 lines — still large, but delegates two of its hardest-to-reason-about sections.

---

## Key Constraints

- **No behavior changes.** All interactions, rendering, and store semantics must be identical before and after.
- **No public API surface changes.** VIbeGrid component props, exported hooks, and store interfaces must not change.
- **No new unit tests required.** Existing tests (`filter-builder.test.ts`, `readableState.test.ts`, `InitStore.test.ts`) must continue to pass.
- **No performance regression.** The DOM recycling pool, RAF-throttled rendering, and virtual scroll calculations must not be touched.
- **Zero new `any` suppressions in Phase 2.** Every replacement must use a real type.

---

## File Map

### New files created

| File | Phase | Purpose |
|------|-------|---------|
| `apps/web/src/systems/vibegrid/stores/FilterBuilderStore.ts` | P1 | Filter builder state extracted from InteractionStore |
| `apps/web/src/systems/vibegrid/stores/MenuStateStore.ts` | P1 | Menu state extracted from InteractionStore |
| `apps/web/src/systems/vibegrid/renderers/modules/ClickRouter.ts` | P3 | Click event routing sub-controller |
| `apps/web/src/systems/vibegrid/renderers/modules/DragSelectionController.ts` | P3 | Drag-to-select sub-controller |
| `apps/web/src/systems/vibegrid/renderers/modules/FillDragController.ts` | P3 | Fill handle drag sub-controller |
| `apps/web/src/systems/vibegrid/renderers/modules/HoverTracker.ts` | P3 | Hover state sub-controller |
| `apps/web/src/systems/vibegrid/renderers/core/ObserverManager.ts` | P4 | Wraps ~12 active MobX reactions from SPR.initFocusedObservers() |
| `apps/web/src/systems/vibegrid/renderers/core/GridInitBuilder.ts` | P4 | Type-enforced 10-step init sequence builder |

### Files modified

| File | Phase | Change |
|------|-------|--------|
| `apps/web/src/systems/vibegrid/stores/InteractionStore.ts` | P1 | Remove ~279 lines (FilterBuilderStore + MenuStateStore extraction) |
| `apps/web/src/systems/vibegrid/stores/context.tsx` | P1, P2 | Wire new stores; fix SchemaRegistry any casts |
| `apps/web/src/systems/vibegrid/components/FilterBuilder.tsx` | P1 | Update imports to FilterBuilderStore |
| `apps/web/src/systems/vibegrid/components/__tests__/FilterBuilder.test.tsx` | P1 | Update imports to FilterBuilderStore |
| `apps/web/src/systems/vibegrid/components/VibeGridXColumnVisibilityPure.tsx` | P1 | Update imports to MenuStateStore |
| `apps/web/src/systems/vibegrid/components/GroupConfigDropdownPure.tsx` | P1 | Update imports to MenuStateStore |
| `apps/web/src/systems/vibegrid/components/FloatingActionsMenu.tsx` | P1 | Update imports to MenuStateStore |
| `apps/web/src/systems/vibegrid/stores/TableCoreStore.ts` | P2 | Type 4 any setters |
| `apps/web/src/systems/vibegrid/stores/VisualStateStore.ts` | P2 | Type 2 any setters |
| `apps/web/src/systems/vibegrid/stores/ViewportStore.ts` | P2 | Type 1 any setter |
| `apps/web/src/systems/vibegrid/stores/EditingStore.ts` | P2 | Type 1 any setter |
| `apps/web/src/systems/vibegrid/stores/KanbanViewStore.ts` | P2 | Type 1 any setter |
| `apps/web/src/systems/vibegrid/stores/GanttViewStore.ts` | P2 | Type 2 any setters |
| `apps/web/src/systems/vibegrid/coordinators/InteractionCoordinator.ts` | P2 | Type OverlayManager setter |
| `apps/web/src/systems/vibegrid/renderers/modules/MouseController.ts` | P3 | Slim to coordinator ~300 lines, extract 4 sub-controllers |
| `apps/web/src/systems/vibegrid/renderers/core/SimplePassiveRenderer.ts` | P4 | Delegate to ObserverManager and GridInitBuilder |

---

## Blast Radius Analysis

### Phase 1 (InteractionStore split)

- **21 files import InteractionStore.** Most use selection/hover/drag which stays — no changes needed. 5 UI files need import updates for filter/menu state (listed in Solution Phase 1).
- **`context.tsx`** requires the most changes: new store instantiation, bundle update, new hooks.
- **Test files:** `filter-builder.test.ts` imports InteractionStore directly for filter testing — update to use FilterBuilderStore. `readableState.test.ts` tests the snapshot — no menu state in readableState, so no changes needed. `FilterBuilder.test.tsx` — update imports.

### Phase 2 (Type DI)

- **Circular import risk:** `TableCoreStore` ↔ `VisualStateStore` bidirectional dependency. Type-only imports (`import type`) avoid runtime circular dependency issues — use them.
- **No downstream consumer changes.** Setter method signatures tighten from `any` to concrete types; call sites in `context.tsx` already pass the correct values — this will confirm correctness, not break anything.
- **`pnpm typecheck` is the exit gate.** If it passes with zero suppressions, Phase 2 is complete.

### Phase 3 (MouseController split)

- **Single call site:** `SimplePassiveRenderer` instantiates `MouseController`. That call site is unchanged.
- **No external exports.** `MouseController` is an internal renderer module — not exported from the vibegrid public index.
- **Interaction coordinator calls:** `ClickRouter` and `DragSelectionController` will call `InteractionCoordinator` methods — same methods as before, just from a new file.

### Phase 4 (SPR decomposition)

- **`SimplePassiveRenderer` is the single consumer of its own private methods.** No external callers of `initFocusedObservers()` or the init sequence steps.
- **`ObserverManager.dispose()`** must be called in `SimplePassiveRenderer.destroy()` — ensure this is wired.
- **Performance-critical path.** The ~12 active MobX reactions are on the hot path. The ObserverManager extraction must not introduce additional closures or re-renders. Profile before merging.
- **`InitStore.test.ts`** tests initialization sequencing — must pass without modification.

---

## Behaviors

### B1: FilterBuilderStore isolates filter builder state

- **Trigger:** `openFilterBuilder()` is called
- **Expected:** `filterBuilderState.isOpen` becomes `true`; `InteractionStore` has no knowledge of this state
- **Verify:** `filter-builder.test.ts` passes; InteractionStore has no `filterBuilderState` property
- **Source:** `apps/web/src/systems/vibegrid/stores/InteractionStore.ts` lines 250-262, 1402-1457

### B2: MenuStateStore isolates menu open/close

- **Trigger:** Any of the 11 menu open/close methods is called
- **Expected:** Correct menu state updates in MenuStateStore; InteractionStore is unaffected
- **Verify:** Menu state reads from MenuStateStore; `readableState.test.ts` snapshot passes
- **Source:** `apps/web/src/systems/vibegrid/stores/InteractionStore.ts` lines 218-249, 1245-1400

### B3: InteractionStore retains selection, hover, drag, clipboard

- **Trigger:** Cell click, drag-to-select, clipboard copy — any standard interaction
- **Expected:** Identical behavior to pre-refactor
- **Verify:** All interaction tests pass; no consumer import changes needed for selection/hover users
- **Source:** `apps/web/src/systems/vibegrid/stores/InteractionStore.ts` (remaining ~1,543 lines)

### B4: Store DI setters reject wrong types at compile time

- **Trigger:** `pnpm typecheck` run after Phase 2
- **Expected:** Zero type errors, zero new `any` suppressions
- **Verify:** `pnpm typecheck` exits 0
- **Source:** All 13 stores listed in Phase 2 file map

### B5: MouseController sub-controllers handle correct event subsets

- **Trigger:** Single click, double click, drag start, fill handle drag, mouse move
- **Expected:** Each event is handled by exactly one sub-controller; no duplicate handling
- **Verify:** Existing click, drag, and hover interaction tests pass
- **Source:** `apps/web/src/systems/vibegrid/renderers/modules/MouseController.ts`

### B6: ObserverManager disposes all reactions on destroy

- **Trigger:** `SimplePassiveRenderer.destroy()` is called
- **Expected:** All ~12 active MobX reaction disposers are called; no memory leaks
- **Verify:** `InitStore.test.ts` passes; after `destroy()`, all disposer fields are `null`
- **Source:** `apps/web/src/systems/vibegrid/renderers/core/SimplePassiveRenderer.ts` lines 135-169 (disposer declarations), 2877-2995 (destroy)

### B7: GridInitBuilder enforces init step ordering at compile time

- **Trigger:** A developer attempts to call `initControllers()` before `initDOM()`
- **Expected:** TypeScript compile error — `initControllers()` is not available on the initial builder type
- **Verify:** `pnpm typecheck` catches the ordering violation; correct sequence compiles cleanly
- **Source:** `apps/web/src/systems/vibegrid/renderers/core/GridInitBuilder.ts` (new)

---

## Implementation Phases

### Phase 1: Extract FilterBuilderStore + MenuStateStore

**Approach:** Extract first, delete from InteractionStore second, wire context third.

1. **Create `FilterBuilderStore.ts`** — copy state (lines 250-262), methods (lines 1402-1457), computeds (lines 452-473) from InteractionStore. Add MobX `makeAutoObservable`. Import `filter-types.ts`, `filter-utils.ts`, `filter-storage.ts`.

2. **Create `MenuStateStore.ts`** — copy state (lines 218-249) and 11 open/close methods (lines 1245-1400). Export all 5 state interfaces. Add `makeAutoObservable`.

3. **Delete from `InteractionStore.ts`** — remove the extracted state blocks, methods, and computeds. Confirm ~242 lines removed. No interface changes to remaining methods.

4. **Update `context.tsx`** — instantiate `new FilterBuilderStore()` and `new MenuStateStore()`, add to `VibeGridStores` type and bundle, add `useFilterBuilderStore()` and `useMenuStateStore()` hooks following the pattern of existing hooks.

5. **Update UI consumers** — update imports in 5 files:
   - `FilterBuilder.tsx` and `FilterBuilder.test.tsx` → import from `FilterBuilderStore`
   - `VibeGridXColumnVisibilityPure.tsx`, `GroupConfigDropdownPure.tsx`, `FloatingActionsMenu.tsx` → import from `MenuStateStore`

**Exit criteria:** `filter-builder.test.ts` passes, `FilterBuilder.test.tsx` passes, `readableState.test.ts` passes, `pnpm typecheck` passes.

---

### Phase 2: Type Store Dependency Injection

**Approach:** Define shared types first, then apply to each store in order from simplest to most complex.

1. **Define `VibeGridCollection<T>`** in a new `stores/types.ts` or inline in the collection-accepting stores. Alias for `Collection<T>` from `@tanstack/db`.

2. **Define `FilterValue`** discriminated union in `stores/types.ts`. Cover at minimum: `string`, `number`, `boolean`, `string[]`, `null`.

3. **Apply to each store** per the table in Phase 2 above. Use `import type` for cross-store references to avoid runtime circular dependencies.

4. **Fix `context.tsx`** SchemaRegistry casts — import `SchemaRegistry` type and replace `as any` with explicit type.

**Exit criteria:** `pnpm typecheck` exits 0 with zero new suppressions. `pnpm lint` passes.

---

### Phase 3: Split MouseController

**Approach:** Extract sub-controllers as new files first, then slim MouseController to coordinator.

1. **Create `HoverTracker.ts`** (~100 lines) — simplest, no dependencies on other sub-controllers. Move `setHover()`, `clearHover()`, mouse position tracking logic.

2. **Create `DragSelectionController.ts`** (~150 lines) — `startDragSelect()`, `updateDragSelect()`, `endDragSelect()`, 8px threshold, selection range calculation. Calls `InteractionCoordinator` for selection updates.

3. **Create `FillDragController.ts`** (~150 lines) — fill handle detection and `handleFillStart()` delegation. References `InteractionCoordinator`.

4. **Create `ClickRouter.ts`** (~200 lines) — single/double click detection, content vs affordance routing, right-click context menu trigger. Calls `CellActionRouter` and `InteractionCoordinator`.

5. **Slim `MouseController.ts`** to coordinator (~300 lines) — retain: event listener setup, global event binding, shared state (`isTracking`, `startPosition`, `justEndedDrag`), column drag, column resize, row drag. Instantiate and hold references to the 4 new sub-controllers.

**Exit criteria:** All existing interaction tests pass. `pnpm typecheck` passes.

---

### Phase 4: Decompose SimplePassiveRenderer

**Approach:** Extract ObserverManager first (isolated concern), then add GridInitBuilder (higher risk — touches init path).

1. **Create `ObserverManager.ts`** — create class, move ~12 active reaction factory methods into named methods. This includes: 10 reactions from `initFocusedObservers()` body, plus `setupSelectionDeltaReaction()` (called at line 1197), plus `initGridLineCanvasReactions()` (called at line 1200, which creates 3 sub-reactions wrapped in a single disposer). The constructor receives `stores`. `init()` creates all reactions. `dispose()` calls all disposers (14 fields declared at lines 135-169, 2 commented out). Keep `observersEnabled` guard inside.

2. **Update `SimplePassiveRenderer.initFocusedObservers()`** — replace the 11 inline reaction setups with `this._observerManager = new ObserverManager(this._stores); this._observerManager.init()`. Ensure `this._observerManager.dispose()` is called in `destroy()`.

3. **Create `GridInitBuilder.ts`** — implement the builder with discriminated return types enforcing step order. Steps map to the existing 10 init methods in SPR. The builder holds a reference to the SPR instance and calls its methods in sequence.

4. **Update `SimplePassiveRenderer.init()`** — replace the imperative sequence with `new GridInitBuilder(this).initDOM().initControllers()...build()`.

**Exit criteria:** `InitStore.test.ts` passes. `pnpm typecheck` passes. No performance regression observed (manual spot-check: grid renders, scroll is smooth, reactions fire correctly).

---

## Out of Scope

- Splitting `slot-initialization.ts` (28 renderers) into per-file renderers — tracked separately as P1/P2 work
- Removing `VisualStateStore` → `ViewportStore` delegation facade — tracked separately
- Full decomposition of `SimplePassiveRenderer` (BodyRenderer separation, ScrollController full extraction)
- `BodyRenderer` + `HeaderRenderer` shared `CellFactory` extraction
- Any UI changes or new features
- New unit tests (beyond ensuring existing tests pass)
- Performance optimization (neutral is the bar)
- Store container / automatic DI wiring (P4 in research rankings — deferred)

---

## References

- Issue: [#2034](https://github.com/baseplane-ai/baseplane/issues/2034)
- Research: `planning/research/2026-03-19-vibegrid-rendering-refactor-targets.md` — findings 1, 4, 8, 10
- Related P1/P2 work: Split slot-initialization.ts, remove VisualStateStore viewport delegation
- Rules: `.claude/rules/vibegrid.md`, `.claude/rules/mobx-state.md`
