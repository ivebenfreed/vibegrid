---
issue: 1413
type: chore
title: "VibGrid: Architecture Consolidation - Geometry, Events, Init, Dead Code"
status: approved
created: 2026-01-30
updated: 2026-01-30
template: frontend-only
epic: 187
phases:
  - id: P1
    title: "Remove Legacy Dead Code"
    risk: low
    tasks:
      - "Delete 8 .backup files from renderers/"
      - "Delete stores/pure-observables.ts"
      - "Delete 6 stale analysis/plan markdown docs"
      - "Clean up index.ts: remove createPureObservables export, LEGEND_STATE flag, stale comments, unused createVibeGrid factory"
      - "Verify: typecheck, lint, grep for stale references (pure-observables, createPureObservables, .backup)"
    files:
      - apps/web/src/systems/vibegrid/renderers/components/HeaderRenderer.ts.backup
      - apps/web/src/systems/vibegrid/renderers/core/SimplePassiveRenderer.ts.backup
      - apps/web/src/systems/vibegrid/renderers/factories/DOMElementFactory.ts.backup
      - apps/web/src/systems/vibegrid/renderers/modules/KeyboardNavigationController.ts.backup
      - apps/web/src/systems/vibegrid/renderers/modules/MouseController.ts.backup
      - apps/web/src/systems/vibegrid/renderers/modules/SelectionController.ts.backup
      - apps/web/src/systems/vibegrid/renderers/modules/OverlayManager.ts.backup
      - apps/web/src/systems/vibegrid/renderers/modules/ScrollController.ts.backup
      - apps/web/src/systems/vibegrid/stores/pure-observables.ts
      - apps/web/src/systems/vibegrid/index.ts
      - apps/web/src/systems/vibegrid/VIBEGRID_OVERHAUL_ANALYSIS.md
      - apps/web/src/systems/vibegrid/VIBEGRID_STATE_ANALYSIS.md
      - apps/web/src/systems/vibegrid/MANAGER_CONSOLIDATION.md
      - apps/web/src/systems/vibegrid/RENDERER_CONSOLIDATION_PLAN.md
      - apps/web/src/systems/vibegrid/PURE_OBSERVABLES_SPLIT_PLAN.md
      - apps/web/src/systems/vibegrid/VIBEGRID_SYNC_FIX_SUMMARY.md
  - id: P2
    title: "Consolidate Geometry to ViewportStore"
    risk: high
    tasks:
      - "Create stores/ViewportStore.ts with scroll, viewport, content, row virtualization state and computed ranges"
      - "Strip viewport/scroll state from VisualStateStore (viewportWidth/Height, scrollLeft/Top, rowCount)"
      - "Delete VirtualViewportStore (absorbed by ViewportStore)"
      - "Delete or gut VirtualScrollManager to thin adapter, remove global state"
      - "Simplify dom-position-state.ts: remove viewportCache, use ViewportStore + ObservableCoordinateManager"
      - "Update stores/context.tsx: add ViewportStore to store context and creation"
      - "Update all consumers: redirect imports from VirtualViewportStore/VirtualScrollManager/VisualStateStore viewport fields to ViewportStore"
      - "Write ViewportStore unit tests (scroll, viewport size, visibleRowRange fixed/variable, binary search)"
      - "Verify: typecheck, lint, browser test overlay sync during scroll/resize"
    files:
      - apps/web/src/systems/vibegrid/stores/ViewportStore.ts
      - apps/web/src/systems/vibegrid/stores/VisualStateStore.ts
      - apps/web/src/systems/vibegrid/stores/VirtualViewportStore.ts
      - apps/web/src/systems/vibegrid/stores/dom-position-state.ts
      - apps/web/src/systems/vibegrid/virtualization/VirtualScrollManager.ts
      - apps/web/src/systems/vibegrid/coordinates/ObservableCoordinateManager.ts
      - apps/web/src/systems/vibegrid/renderers/core/SimplePassiveRenderer.ts
      - apps/web/src/systems/vibegrid/stores/context.tsx
  - id: P3
    title: "Deduplicate Event Handlers"
    risk: medium
    tasks:
      - "Consolidate column resize to single path: HeaderRenderer → InteractionStore.startColumnResize → ResizePreviewController observes via MobX"
      - "Consolidate column drag to single path: MouseController → InteractionStore.startColumnDrag → ColumnDragOverlayDOM observes via MobX"
      - "Consolidate window resize to single ResizeObserver → ViewportStore.updateViewportSize, remove duplicate from dom-position-state"
      - "Remove duplicate resize/drag handling from interaction-handlers.ts utility"
      - "Verify: typecheck, lint, browser test column resize/drag/reorder, grep addEventListener.*resize returns 1 result"
    files:
      - apps/web/src/systems/vibegrid/renderers/components/HeaderRenderer.ts
      - apps/web/src/systems/vibegrid/renderers/modules/MouseController.ts
      - apps/web/src/systems/vibegrid/renderers/modules/OverlayManager.ts
      - apps/web/src/systems/vibegrid/renderers/modules/controllers/ResizePreviewController.ts
      - apps/web/src/systems/vibegrid/overlays/ColumnDragOverlayDOM.ts
      - apps/web/src/systems/vibegrid/renderers/utils/interaction-handlers.ts
  - id: P4
    title: "Deterministic Initialization"
    risk: medium
    tasks:
      - "Add initializeRenderer(container, stores) to InitStore with MobX reaction on columns.length > 0"
      - "Update VibeGrid.tsx: remove autorun/useEffect renderer creation, pass containerRef to InitStore, read isFullyReady"
      - "Update SimplePassiveRenderer: remove deprecated updateVirtualBounds/updateVirtualViewport calls, ensure synchronous constructor"
      - "Verify: typecheck, lint, browser test 10 consecutive refreshes for consistent render, route navigation mount/unmount"
    files:
      - apps/web/src/systems/vibegrid/stores/InitStore.ts
      - apps/web/src/systems/vibegrid/VibeGrid.tsx
      - apps/web/src/systems/vibegrid/renderers/core/SimplePassiveRenderer.ts
---

# Spec: VibGrid Architecture Consolidation

> GitHub Issue: [#1413](https://github.com/baseplane-ai/baseplane/issues/1413)
> Epic: [#187](https://github.com/baseplane-ai/baseplane/issues/187) (VibeGrid)
> Research: `planning/designs/vibegrid-robustness-research.md`

## 0. Problem Statement

VibGrid has 4 root causes of flakiness that must be fixed to make it bedrock-quality:

1. **4 competing geometry state sources** cause overlay/selection desync during scroll/resize
2. **Duplicate event handlers** cause nondeterministic behavior (3 resize paths, 2 drag paths)
3. **Racing initialization paths** cause intermittent missing renders on load
4. **Legacy dead code** causes confusion and accidental use of throwing stubs

This spec addresses all 4 root causes in a single issue with 4 sequential phases.

## 1. Acceptance Criteria

| ID | Criterion | Phase |
|----|-----------|-------|
| AC1 | 0 `.backup` files in `renderers/` | P1 |
| AC2 | `createPureObservables` export removed from `index.ts` | P1 |
| AC3 | No dead Legend State code paths remain | P1 |
| AC4 | All stale analysis docs deleted (6 files) | P1 |
| AC5 | Single geometry state source: new `ViewportStore` | P2 |
| AC6 | `VirtualViewportStore` removed | P2 |
| AC7 | `VirtualScrollManager` removed from runtime path | P2 |
| AC8 | `dom-position-state.ts` derives positions from `ObservableCoordinateManager` only | P2 |
| AC9 | No overlay/selection desync during scroll/resize | P2 |
| AC10 | 1 resize handler path (not 3) | P3 |
| AC11 | 1 drag handler path (not 2) | P3 |
| AC12 | No legacy manager event handlers duplicating store logic | P3 |
| AC13 | Single initialization sequence (no racing paths) | P4 |
| AC14 | Renderer creation deterministic (not dependent on autorun timing) | P4 |
| AC15 | No intermittent missing renders on initial load | P4 |

## 2. Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Geometry state sources | 4 | 1 (`ViewportStore`) |
| Event handler duplication | 3 resize, 2 drag | 1 each |
| Backup/dead files | 8 `.backup` + stubs | 0 |
| Legacy exports | 5 throw-at-runtime stubs | 0 |
| Init paths that can race | 2 (InitStore + autorun) | 1 |
| Stale analysis docs | 6 | 0 |

---

## Phase P1: Remove Legacy Dead Code

**Risk:** Low | **Estimated scope:** ~15 files deleted/modified

### What to delete

**8 backup files** (delete entirely):
```
renderers/components/HeaderRenderer.ts.backup
renderers/core/SimplePassiveRenderer.ts.backup
renderers/factories/DOMElementFactory.ts.backup
renderers/modules/KeyboardNavigationController.ts.backup
renderers/modules/MouseController.ts.backup
renderers/modules/SelectionController.ts.backup
renderers/modules/OverlayManager.ts.backup
renderers/modules/ScrollController.ts.backup
```

**Legacy stubs** (delete file):
```
stores/pure-observables.ts
```

**Stale analysis docs** (delete - completed/abandoned migrations):
```
VIBEGRID_OVERHAUL_ANALYSIS.md
VIBEGRID_STATE_ANALYSIS.md
MANAGER_CONSOLIDATION.md
RENDERER_CONSOLIDATION_PLAN.md
PURE_OBSERVABLES_SPLIT_PLAN.md
VIBEGRID_SYNC_FIX_SUMMARY.md
```

Keep active docs: `UX_SPEC.md`, `FIELD_TYPE_MODULAR_ARCHITECTURE_PLAN.md`, `stores/PERSISTENCE-README.md`, `stores/reactive-patterns.md`

### What to modify

**`index.ts`:**
- Remove `export { createPureObservables } from './stores/pure-observables'` (line 90)
- Remove `LEGEND_STATE: true` from `VIBEGRID_FEATURES` (line 126)
- Remove stale comments referencing Legend State architecture (lines 157-194)
- Remove `createVibeGrid` factory if unused (lines 141-154)

### Verification

- `pnpm typecheck` passes (no broken imports)
- `pnpm lint` passes
- Grep for `pure-observables`, `createPureObservables`, `.backup` returns 0 results
- Grid renders normally in browser

---

## Phase P2: Consolidate Geometry to ViewportStore

**Risk:** High | **Estimated scope:** ~8 files modified, 2 files deleted

### Architecture: Before vs After

**Before (4 sources):**
```
VisualStateStore          → viewportWidth/Height, scrollLeft/Top
VirtualViewportStore      → scrollTop/Left, viewportWidth/Height, totalContent, rowOffsets
VirtualScrollManager      → global virtualBounds, virtualViewport (deprecated)
DOMPositionStore          → viewportCache (scrollLeft/Top, clientWidth/Height)
ObservableCoordinateManager → version counter, wraps VibeGridXCoordinateManager
```

**After (1 source):**
```
ViewportStore (NEW)
├── Scroll: scrollTop, scrollLeft
├── Viewport: viewportWidth, viewportHeight
├── Content: totalContentWidth, totalContentHeight
├── Row virtualization: rowOffsets (variable height), visibleRowRange (computed)
├── Column virtualization: visibleColumnRange (computed)
└── Coordinate integration: coordinateManager reference

VisualStateStore (TRIMMED)
├── Column state: columns, columnWidths, columnVisibility, columnOrder
├── Layout: columnLayouts (computed), totalWidth (computed)
├── Config: sortConfig, filterConfig, groupConfig
└── NO viewport/scroll state (moved to ViewportStore)
```

### Step-by-step

1. **Create `stores/ViewportStore.ts`** - New MobX store combining:
   - All scroll/viewport state from `VisualStateStore` (viewportWidth/Height, scrollLeft/Top)
   - All virtualization from `VirtualViewportStore` (totalContent, rowOffsets, visibleRowRange, visibleColumnRange)
   - Binary search from `VirtualViewportStore.findRowIndexAtOffset`
   - Reference to `ObservableCoordinateManager` for position queries

2. **Strip viewport state from `VisualStateStore`** - Remove:
   - `viewportWidth`, `viewportHeight`, `scrollLeft`, `scrollTop` observables
   - `rowCount` observable (derived from ViewportStore)
   - Any viewport-related computed values
   - Keep all column layout, sort/filter/group config

3. **Delete `VirtualViewportStore`** - All functionality absorbed by ViewportStore

4. **Delete `VirtualScrollManager`** (or gut to thin adapter) - Remove global state. Update `SimplePassiveRenderer` to use `ViewportStore` actions instead of `updateVirtualBounds`/`updateVirtualViewport`

5. **Simplify `dom-position-state.ts`**:
   - Remove `viewportCache` (use ViewportStore directly)
   - Remove `computedCellPositions` computed (use `ObservableCoordinateManager.getCellPosition()`)
   - Remove `domPositions$` legacy compat wrapper
   - Reduce to: position tracker that calls `ObservableCoordinateManager` for math, ViewportStore for viewport data
   - OR delete entirely if all consumers can use ObservableCoordinateManager directly

6. **Update `stores/context.tsx`** - Add ViewportStore to the store context. Update store creation to instantiate ViewportStore.

7. **Update all consumers** - Find all imports of `VirtualViewportStore`, `VirtualScrollManager`, `domPositionStore`/`domPositions$`, and `VisualStateStore.scrollLeft/Top/viewportWidth/Height`. Redirect to `ViewportStore`.

### ViewportStore API sketch

```typescript
class ViewportStore implements IStore {
  // Observable state
  @observable scrollTop: number = 0
  @observable scrollLeft: number = 0
  @observable viewportWidth: number = 0
  @observable viewportHeight: number = 0
  @observable totalContentWidth: number = 0
  @observable totalContentHeight: number = 0
  @observable rowOffsets: number[] | null = null

  // Coordinate manager reference
  private coordinateManager: ObservableCoordinateManager

  // Actions
  @action updateScroll(scrollTop: number, scrollLeft: number): void
  @action updateViewportSize(width: number, height: number): void
  @action updateContentSize(width: number, height: number): void
  @action setRowOffsets(offsets: number[]): void

  // Computed
  @computed get visibleRowRange(): { start: number; end: number }
  @computed get visibleColumnRange(): { start: number; end: number }
  @computed get totalRows(): number

  // Coordinate queries (delegate to coordinateManager)
  getCellPosition(rowId: string, columnId: string): CoordinatePosition | null
  getViewportAwarePosition(rowId: string, columnId: string): ViewportAwarePosition | null
}
```

### Verification

- `pnpm typecheck` passes
- No imports of `VirtualViewportStore` or `VirtualScrollManager` remain (except deletion)
- Grid scrolls smoothly with overlays in sync
- Selection overlay tracks correctly during fast scroll
- Resize overlay follows column during drag

---

## Phase P3: Deduplicate Event Handlers

**Risk:** Medium | **Estimated scope:** ~6 files modified

### Current duplication

| Event | Handlers | Target |
|-------|----------|--------|
| Column resize | HeaderRenderer (mouse events) + interaction-handlers.ts (utility) + ResizePreviewController (preview) | 1 handler → MobX action → reactions |
| Column drag | MouseController (drag logic) + ColumnDragOverlayDOM (preview) | 1 handler → MobX action → reactions |
| Window resize | dom-position-state.ts (resize listener) + implicit viewport updates | 1 handler → ViewportStore.updateViewportSize |

### Fix approach

For each event type, establish one ownership path:

1. **Column resize**: `HeaderRenderer` owns the mouse events (mousedown on resize handle). It calls `InteractionStore.startColumnResize(columnId, startX, startWidth)`. `ResizePreviewController` observes `InteractionStore.columnResize` via MobX reaction and renders the preview. `VisualStateStore.setColumnWidth()` is called on mouseup. Remove duplicate resize handling from `interaction-handlers.ts` utility (or make it the sole utility called by HeaderRenderer only).

2. **Column drag**: `MouseController` owns drag detection. It calls `InteractionStore.startColumnDrag(...)`. `ColumnDragOverlayDOM` observes `InteractionStore.columnDrag` via MobX reaction and renders the preview. Remove any duplicate drag state tracking in `ColumnDragOverlayDOM` that doesn't go through InteractionStore.

3. **Window resize**: Single `ResizeObserver` on the grid container calls `ViewportStore.updateViewportSize()`. Remove the resize listener from `dom-position-state.ts` (after P2 simplification). All downstream effects flow through MobX reactions on ViewportStore.

### Verification

- Grep for `addEventListener.*resize` in vibegrid returns exactly 1 result (or ResizeObserver)
- Column resize works: drag handle → preview → final width
- Column drag works: reorder columns via drag
- No console errors during resize/drag operations

---

## Phase P4: Deterministic Initialization

**Risk:** Medium | **Estimated scope:** ~3 files modified

### Current race

```
Path A: InitStore.initializeStores() → sets hydrationState flags → marks ready
Path B: VibeGrid.tsx useEffect → autorun(() => { if columns.length > 0 && !rendererRef.current → initializeRenderer() })
```

These two paths can race. InitStore might mark `rendererInitialized: true` while the autorun hasn't fired yet, or the autorun fires before InitStore is ready.

### Fix: Linear boot sequence

Replace the parallel paths with a single linear sequence driven by InitStore:

```
1. InitStore.initializeStores() → init TableCoreStore, VisualStateStore, ViewportStore, InteractionStore
2. InitStore watches columns.length > 0 (MobX reaction)
3. When columns ready → InitStore calls initializeRenderer(container)
4. Renderer creation is synchronous, deterministic
5. InitStore sets rendererInitialized: true
6. VibeGrid.tsx only provides containerRef and reads InitStore.isFullyReady
```

### Changes

1. **`InitStore`**: Add `initializeRenderer(container: HTMLElement, stores: StoreBundle)` method that creates the `SimplePassiveRenderer`. Add MobX reaction watching `visualStateStore.columns.length > 0` to trigger renderer init.

2. **`VibeGrid.tsx`**: Remove the `autorun` + `useEffect` that creates the renderer. Replace with: pass `containerRef` to InitStore, let InitStore own renderer lifecycle. VibeGrid.tsx reads `initStore.isFullyReady` to show loading/ready state.

3. **`SimplePassiveRenderer`**: Remove calls to deprecated `updateVirtualBounds`/`updateVirtualViewport` (already done in P2). Ensure constructor is synchronous and deterministic.

### Verification

- Grid renders consistently on first load (no intermittent blank)
- Grid renders after route navigation (unmount/remount)
- No console warnings about missing container or racing initialization
- `initStore.isFullyReady` transitions false → true exactly once per mount

---

## Testing Strategy

**Approach:** Regression tests only - verify consolidation doesn't break existing behavior.

### Per-phase tests

| Phase | Test Type | What to verify |
|-------|-----------|----------------|
| P1 | Typecheck + lint | No broken imports after deletions |
| P1 | Manual | Grid renders, scroll, select, edit work |
| P2 | Unit test | `ViewportStore` scroll/viewport/range calculations |
| P2 | Unit test | `ViewportStore.visibleRowRange` with fixed and variable heights |
| P2 | Manual | Overlay sync during fast scroll, selection during resize |
| P3 | Manual | Column resize, column drag/reorder work |
| P3 | Manual | No duplicate event firing (check console logs) |
| P4 | Manual | Grid renders on first load consistently (10 refreshes) |
| P4 | Manual | Grid renders after route navigation |

### New test files

- `stores/__tests__/ViewportStore.test.ts` - Unit tests for the new ViewportStore
  - Scroll position updates
  - Viewport size updates
  - `visibleRowRange` computation (fixed height)
  - `visibleRowRange` computation (variable height with rowOffsets)
  - Binary search correctness
  - Content size tracking

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| P2 breaks scroll/overlay sync | Keep `VirtualScrollManager` as thin adapter initially, remove after verification |
| P2 breaks consumers that import old stores | Grep all imports before deletion, update systematically |
| P3 breaks resize/drag | Test column resize and drag-reorder after each handler removal |
| P4 breaks initial load | Test 10 consecutive page refreshes before/after |
| Regression in grid features | Browser test: login, navigate to entity list, scroll, select, edit cell |

## Related

- **Epic:** #187 (VibeGrid)
- **Research:** `planning/designs/vibegrid-robustness-research.md`
- **Related spec:** #1255 (VibeGrid Core Runtime Overhaul - broader scope, this is focused subset)
- **Closed issues:** #139 (race condition), #173 (state reversion)
- **Manager consolidation:** 2/5 completed prior to this work, this completes VirtualScrollManager
