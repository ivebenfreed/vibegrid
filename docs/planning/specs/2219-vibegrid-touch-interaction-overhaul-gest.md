---
initiative: GH#2219-vibegrid-touch-interaction-overhaul-gest
type: feature
issue_type: feature
status: approved
priority: medium
roadmap: null
owner: null
github_issue: 2219
github_milestone: null
created: 2026-03-26
updated: 2026-03-27
phases: [p1, p2, p3, p4]
---

# VIbeGrid touch interaction overhaul — gesture engine + mobile scroll

> GitHub Issue: [#2219](https://github.com/baseplane-ai/baseplane/issues/2219)

## Overview

VIbeGrid's touch support was reverted in commit `1d3a86739` after six incremental hotfixes broke mouse selection while attempting to add touch. The root cause was structural: `touch-action: pan-y` on the viewport container invites the browser to fire `pointercancel` at 2-3px movement — before any JS threshold can disambiguate intent. Every hotfix patched symptoms while the cause remained.

This spec replaces the boolean-flag approach with a **tldraw-inspired GestureEngine state machine**: `touch-action: none` on the viewport, JS-managed vertical scroll with momentum physics, and proper `Idle → Pointing → Active` state transitions. The result is a unified code path for mouse, touch, and stylus that eliminates `pointercancel` entirely and gives touch users the same interaction set as mouse users.

### Problem

**Current behavior:** VIbeGrid has `touch-action: pan-y` on `.vibegridx-viewport`. The browser monitors for vertical movement and fires `pointercancel` the moment any is detected (at 2-3px, before our 8px threshold). JS never gets enough `pointermove` events to commit to drag-to-select. Touch users cannot drag-select, drag rows, or use the fill handle without triggering a browser scroll takeover.

**Root cause:** `touch-action` is evaluated at `pointerdown` time on the touched element AND all its ancestors. It cannot be changed mid-gesture. All hotfixes (dynamic class toggling, deferred selection via `deferredCellInfo`, `isTouchPointer` flag branching) arrived too late in the event lifecycle to prevent `pointercancel`.

**Why `deferredCellInfo` made things worse:** The reverted hotfixes deferred the *selection* itself to avoid committing to the wrong gesture. tldraw's pattern shows the opposite is correct: commit visual feedback immediately (enter Pointing, show highlight), only defer the drag *commitment*. If the gesture resolves to scroll, undo the highlight — but since the threshold is 8px this almost never happens. Deferring selection broke mouse behavior because the flags leaked across input types.

**Desired behavior:** All VIbeGrid interactions (cell tap, drag-select, fill drag, column resize, column reorder, row drag, vertical scroll) work on touch without regressing mouse. Vertical scroll has momentum/inertia feel. Zero `pointercancel` events.

### Architecture Decision: tldraw-inspired GestureEngine

**Chosen option: Custom GestureEngine (Option B from research — "Option A" in the research doc)**

| Aspect | Before | After |
|--------|--------|-------|
| Vertical scroll (touch) | Browser-native (`touch-action: pan-y`) | JS-managed (scrollTop + momentum RAF) |
| Vertical scroll (mouse wheel) | Browser-native | Browser-native (unchanged — `wheel` events are not pointer events) |
| Horizontal scroll | JS-managed | JS-managed (no change) |
| `touch-action` on viewport | `pan-y` | `none` |
| Gesture disambiguation | Boolean flags in MouseController | State machine in GestureEngine |
| Pointer event layer | `mousedown`/`mousemove`/`mouseup` | `pointerdown`/`pointermove`/`pointerup` |
| Drag thresholds | 8px fixed | 4px mouse, 8px touch |
| Pointer capture | None | `setPointerCapture()` on pointerdown |

---

## User Story

As a VIbeGrid user on a touch device (iPad, Android tablet, phone, Capacitor WebView), I can interact with the grid — tapping cells, scrolling vertically, drag-selecting ranges, dragging fill handles, resizing and reordering columns, and reordering rows — with the same capabilities as a mouse user, without accidental scroll triggering selection or accidental selection triggering scroll.

---

## Feature Behaviors

### B1: Cell Tap Selects on Touch

**Core:**
- **ID:** touch-cell-tap-select
- **Trigger:** User touches a cell and lifts finger without moving more than 8px
- **Expected:** Cell becomes selected (same as mouse click). No false selection fires during a scroll gesture.
- **Verify:** Tap a cell on a touch device; verify cell is selected. Begin a scroll gesture (lift after moving >8px vertically) and verify no cell is selected.
- **Source:** `GestureEngine.PointingState.onPointerUp` → delegates to `ClickRouter`

#### UI Layer
- Visual feedback (cell highlight) appears immediately on `pointerdown` — not deferred to `pointerup`
- If gesture resolves to scroll (>8px vertical movement), the highlight is removed before scroll begins

#### API Layer
N/A

#### Data Layer
N/A

---

### B2: Vertical Scroll on Touch with Momentum

**Core:**
- **ID:** touch-vertical-scroll
- **Trigger:** User swipes vertically on the grid body with touch (`pointerType === 'touch'`, movement is primarily vertical: `Math.abs(dy) > Math.abs(dx) * 1.5`). Mouse vertical drags always go to DragSelect, never Scroll — mouse users scroll via wheel events which are unaffected by `touch-action: none`.
- **Expected:** Grid scrolls vertically via JS (`viewport.scrollTop`). On pointer release, momentum carries scroll forward, decelerating smoothly to a stop. Scroll is clamped to valid bounds (0 to `maxScrollTop`).
- **Verify:** Swipe down on a grid with >20 rows. Confirm scroll occurs. Lift finger and confirm momentum deceleration. Confirm scroll stops at bounds without rubber-band.
- **Source:** `GestureEngine.ScrollState` + `ScrollPhysics.ts`

#### UI Layer
- Velocity tracked from last 5 `pointermove` events
- Deceleration is time-based: `velocity *= Math.pow(0.95, dt / 16.67)` where `dt` is ms since last frame — consistent behavior at 60Hz and 120Hz (iPad Pro)
- Stops when velocity < 0.5 px/frame-equivalent
- Clamps to `[0, maxScrollTop]` — no rubber-band for MVP

#### API Layer
N/A

#### Data Layer
N/A

---

### B3: Drag-to-Select Works on Touch

**Core:**
- **ID:** touch-drag-select
- **Trigger:** User touches a cell and moves finger horizontally or diagonally (movement crosses 8px threshold and is NOT primarily vertical)
- **Expected:** Drag-select rectangle appears and extends as finger moves, matching mouse drag-select behavior. On release, the selected range is committed.
- **Verify:** Touch a cell, drag diagonally across 3x3 cells; verify 9 cells are selected.
- **Source:** `GestureEngine.PointingState.onPointerMove` → `GestureEngine.DragSelectingState` → delegates to existing `DragSelectionController`

#### UI Layer
- Disambiguation direction: if `|dy| > |dx| * 1.5` → Scroll; else → DragSelect (or Fill if on fill handle)
- Selection overlay renders identically to mouse drag-select

#### API Layer
N/A

#### Data Layer
N/A

---

### B4: Fill Handle Drag Works on Touch

**Core:**
- **ID:** touch-fill-drag
- **Trigger:** User touches the fill handle (`.vibegridx-fill-handle`) and drags
- **Expected:** Fill drag activates immediately (fill handle has `touch-action: none` already, preserved). Fill range extends as finger moves. On release, fill is applied.
- **Verify:** Touch fill handle on a cell with a value, drag down 3 rows; verify values are filled.
- **Source:** `GestureEngine.PointingState` detects `isFillHandle` target → transitions directly to `FillDraggingState` → delegates to existing `FillDragController`

#### UI Layer
- Fill handle touch target is already 44px (`affordances.css` `@media (hover: none)`) — no change needed
- Fill preview overlay renders identically to mouse fill drag

#### API Layer
N/A

#### Data Layer
N/A

---

### B5: Column Resize Works on Touch

**Core:**
- **ID:** touch-column-resize
- **Trigger:** User touches a column resize handle (`.vibegridx-resize-handle`) and drags horizontally
- **Expected:** Column resizes as finger moves. Resize handle already has `touch-action: none` — behavior is preserved.
- **Verify:** Touch resize handle, drag right 50px; verify column width increases by ~50px.
- **Source:** `GestureEngine.PointingState` detects resize handle → transitions to `ColumnResizingState` → delegates to existing column resize logic

#### UI Layer
- Resize handle is already `touch-action: none` in `vibegridx.css:412` — no CSS change needed for this element
- Resize ghost and drop indicator render identically to mouse

#### API Layer
N/A

#### Data Layer
N/A

---

### B6: Column Reorder Works on Touch

**Core:**
- **ID:** touch-column-reorder
- **Trigger:** User touches a column header drag handle and drags horizontally past the 8px threshold
- **Expected:** Column reorder drag activates. Drop indicator appears. Column is reordered on release.
- **Verify:** Touch column header drag handle, drag past another column; verify column order changes.
- **Source:** `GestureEngine.PointingState` detects column drag handle → transitions to `ColumnDraggingState` → delegates to existing column drag logic in MouseController (moved to GestureEngine state)

#### UI Layer
- Drop line and drag preview render identically to mouse

#### API Layer
N/A

#### Data Layer
N/A

---

### B7: Row Drag Works on Touch

**Core:**
- **ID:** touch-row-drag
- **Trigger:** User touches a row drag handle and moves past the 8px threshold
- **Expected:** Row drag activates. Drop indicator appears. Row is reordered on release.
- **Verify:** Touch row drag handle, drag up/down two rows; verify row order changes.
- **Source:** `GestureEngine.PointingState` detects row drag handle → transitions to `RowDraggingState` → delegates to existing row drag logic

#### UI Layer
- Drop indicator renders identically to mouse

#### API Layer
N/A

#### Data Layer
N/A

---

### B8: All Mouse Behavior Unchanged — Zero Regression

**Core:**
- **ID:** mouse-zero-regression
- **Trigger:** Any existing mouse interaction (click, double-click, drag-select, fill drag, column resize, column reorder, row drag, hover, right-click context menu)
- **Expected:** All mouse behaviors work identically after the migration. `pointerType === 'mouse'` is treated as before; hover tracking remains mouse-only.
- **Verify:** Run full mouse regression test suite. Manual smoke: click to select, drag-select, fill handle, column resize, column reorder, row drag, context menu.
- **Source:** `GestureEngine` dispatches by `e.pointerType`; hover filtering: `if (e.pointerType !== 'mouse') return` in hover handlers

#### UI Layer
- Mouse cursor behavior unchanged
- Hover affordances (resize handle highlight, fill handle appearance) remain mouse-only

#### API Layer
N/A

#### Data Layer
N/A

---

### B9: Kanban Drag Unaffected

**Core:**
- **ID:** kanban-drag-unaffected
- **Trigger:** Any kanban card drag on touch or mouse
- **Expected:** Kanban drag-and-drop continues to work via `@dnd-kit` as-is. No changes to `KanbanBoard.tsx`.
- **Verify:** Drag a kanban card on touch; verify it moves to a new column.
- **Source:** Kanban uses `@dnd-kit` with its own `TouchSensor` — GestureEngine only applies to table/grid view

#### UI Layer
N/A (no changes to kanban code)

#### API Layer
N/A

#### Data Layer
N/A

---

### B10: `pointercancel` Never Fires During Grid Interactions

**Core:**
- **ID:** no-pointercancel
- **Trigger:** Any touch gesture starting inside the grid body (`.vibegridx-viewport`)
- **Expected:** Browser never fires `pointercancel`. All pointer events flow to JS.
- **Verify:** Add `pointercancel` event logging to the container. Perform all touch gestures (scroll, tap, drag). Confirm zero `pointercancel` events logged.
- **Source:** `touch-action: none` on `.vibegridx-viewport` — browser hands off all touch handling to JS

#### UI Layer
N/A

#### API Layer
N/A

#### Data Layer
N/A

---

## State Machine Specification

### States

```
Idle
  onPointerDown → Pointing

Pointing (stores: origin, target, pointerId, pointerType)
  onPointerMove:
    if distance < threshold (4px mouse, 8px touch) → stay
    if target.isFillHandle → FillDragging
    if target.isDragHandle (row) → RowDragging
    if target.isColumnDragHandle → ColumnDragging
    if target.isResizeHandle → ColumnResizing
    if pointerType === 'touch' AND |dy| > |dx| * 1.5 → Scrolling
    else → DragSelecting (mouse vertical drags are always DragSelect, never Scroll)
  onPointerUp → Idle (was a tap, delegate to ClickRouter)
  onPointerCancel → Idle (should not occur with touch-action: none)

DragSelecting (delegates to DragSelectionController)
  onPointerMove → update selection rect
  onPointerUp → commit selection, Idle

FillDragging (delegates to FillDragController)
  onPointerMove → update fill preview
  onPointerUp → apply fill, Idle

ColumnResizing (delegates to existing resize logic)
  NOTE: Today column resize starts at 0px movement (no threshold). For mouse, preserve
  this: PointingState should transition immediately to ColumnResizing on any movement
  when target is resize handle (bypass threshold check). For touch, 8px threshold is
  acceptable to prevent accidental resize.
  onPointerMove → update column width (throttled ~60fps)
  onPointerUp → commit resize, Idle

ColumnDragging (delegates to existing column drag logic)
  onPointerMove → update drag preview + drop indicator
  onPointerUp → commit reorder, Idle

RowDragging (delegates to existing row drag logic)
  onPointerMove → update drop indicator
  onPointerUp → commit reorder, Idle

Scrolling (owns ScrollPhysics)
  onPointerMove → apply delta to viewport.scrollTop, track velocity
  onPointerUp → start momentum RAF, Idle
```

### Disambiguation Rationale

The Pointing state is a 1-2 frame dead zone (4-8px at typical touch speeds ≈ 250px/s ≈ 16-32ms). It is imperceptible for intentional gestures. Visual feedback (cell highlight) fires immediately on pointerdown — before disambiguation — so the grid always feels instant. Only the drag *commitment* is deferred.

If the user starts on a dedicated handle (fill, row drag, column drag, resize), no direction disambiguation is needed — the handle type determines the state directly.

---

## User Journey

### Touch Scroll Flow

1. User puts finger down on grid body → `pointerdown` fires, `setPointerCapture` locks events to viewport
2. GestureEngine enters `Pointing` state → cell under finger gets highlight
3. User moves finger downward >8px → direction check: `|dy| > |dx| * 1.5` → true
4. GestureEngine transitions to `Scrolling` state → cell highlight removed
5. Each `pointermove` → `viewport.scrollTop -= dy` (direct write, no RAF delay for tracking)
6. User lifts finger → `pointerup` fires
7. `ScrollPhysics.startMomentum(velocity)` → RAF loop decelerates scrollTop
8. Scroll stops when velocity < 0.5px/frame or bounds reached
9. GestureEngine returns to `Idle`

### Touch Cell Tap Flow

1. User taps a cell → `pointerdown`, GestureEngine enters `Pointing`
2. Cell gets immediate visual highlight
3. User lifts finger without moving >8px → `pointerup` fires while still in `Pointing`
4. `ClickRouter.handleTap(target, event)` called — same path as mouse click
5. Cell is selected, GestureEngine returns to `Idle`

### Touch Drag-Select Flow

1. User puts finger on cell A → `pointerdown`, enters `Pointing`, highlight appears on A
2. User moves finger diagonally >8px, `|dx| > |dy|` → transitions to `DragSelecting`
3. `DragSelectionController.startDrag(origin, currentCell)` called
4. Each `pointermove` → `DragSelectionController.updateDrag(currentCell)`
5. Selection rect extends from A to current cell
6. User lifts finger → `DragSelectionController.endDrag()` commits selection
7. GestureEngine returns to `Idle`

### Error Flow: Gesture Starts on Handle

1. User touches column resize handle → `pointerdown`
2. GestureEngine enters `Pointing`, `target.isResizeHandle = true`
3. Any movement past threshold → immediately transitions to `ColumnResizing` (no direction check needed)
4. Resize proceeds as with mouse

---

## Requirements Interview Summary

### Core Functionality

**Q: What must work after this change?**

All of:
1. Cell tap selects on touch — no false selection during scroll
2. Vertical scroll with momentum/inertia (JS-managed)
3. Drag-to-select on touch after 8px threshold
4. Fill handle drag on touch (already has `touch-action: none` + 44px targets)
5. Column resize on touch (already has `touch-action: none`)
6. Column reorder on touch
7. Row drag on touch
8. ALL mouse behavior unchanged — zero regression
9. Kanban card drag — already done via dnd-kit, no changes needed

### Edge Cases

**Q: What edge cases must be handled?**

1. **Pointer capture released on `pointercancel`** — even though `touch-action: none` should prevent it, `releasePointerCapture` must be called in a `pointercancel` handler to prevent stuck state
2. **Multi-touch** — only track the first pointer (by `pointerId`). Subsequent pointers in Pointing/Active states are ignored.
3. **Pointer leaves viewport during drag** — `setPointerCapture` ensures events continue arriving; no special handling needed
4. **Fast scroll then immediate tap** — momentum RAF must be cancelled on `pointerdown` to prevent compounding velocity
5. **Scroll bounds** — clamp to `[0, maxScrollTop]`; `maxScrollTop = viewport.scrollHeight - viewport.clientHeight`
6. **Empty grid** — `scrollHeight <= clientHeight`: scroll gesture becomes a no-op, tap still fires
7. **Mouse hover during touch** — hover tracking is filtered to `pointerType === 'mouse'` only; touch events do not update hover state

### Platform Integration Decisions

| System | Decision | Rationale |
|--------|----------|-----------|
| Notifications | Not needed | Internal grid behavior, no user-facing events |
| Real-time Sync | Not needed | Interaction layer only, no data mutation from gesture engine |
| Access Control | Not needed | No permission-gated behavior |
| Audit Logging | Not needed | Touch input handling is not auditable |
| Workflows | Not needed | Not a workflow-triggering feature |
| Settings | Not needed — MVP | Scroll inertia could be a preference later, not MVP |
| Feature Flags | Not needed | Full rollout; no partial cohorts |

### UX Decisions

**Q: What should feel "native" on touch?**

- Momentum scroll matching iOS feel: deceleration coefficient `0.95` per frame
- Cell tap feels instant: highlight fires on `pointerdown`, never deferred
- Fill handle 44px touch target: already implemented in `affordances.css`
- No rubber-band overscroll for MVP — clamp to bounds
- No haptic feedback for MVP (Capacitor API available but not scoped here)

**Q: What are the non-goals?**

- Swipe-to-action on rows
- Long-press context menu
- Pinch-to-zoom columns
- Two-finger pan (grid only needs single-touch scroll)
- Rubber-band overscroll
- Horizontal scroll rework (already JS-managed, no change needed)

### Frontend Technical

**Q: What is the file plan?**

Files modified:
- `apps/web/src/systems/vibegrid/renderers/modules/MouseController.ts` → migrated to pointer events in Phase 1, then superseded by GestureEngine wiring in Phase 2
- `apps/web/src/systems/vibegrid/vibegridx.css` — change `.vibegridx-viewport` from `touch-action: pan-y` to `touch-action: none`

New files:
- `apps/web/src/systems/vibegrid/renderers/modules/GestureEngine.ts` — state machine (Phase 2)
- `apps/web/src/systems/vibegrid/renderers/modules/ScrollPhysics.ts` — momentum scroll (Phase 3)

Files unchanged:
- `InteractionCoordinator.ts` — still receives same events
- `DragSelectionController.ts` — called from GestureEngine states
- `FillDragController.ts` — called from GestureEngine states
- `ClickRouter.ts` — called from GestureEngine Pointing state on tap
- `HoverTracker.ts` — called from GestureEngine with mouse-only filter
- `ScrollController.ts` — still handles scroll event syncing and programmatic scroll

**Q: How does GestureEngine replace MouseController?**

GestureEngine is the new top-level input coordinator. It replaces the event listener setup in MouseController (`setupGlobalMouseHandling`). Sub-controllers (`DragSelectionController`, `FillDragController`, `ClickRouter`, `HoverTracker`) remain — they are called by GestureEngine states instead of directly by MouseController methods.

The existing `MouseControllerOptions` interface is preserved (or superseded by `GestureEngineOptions` with the same fields) so the call site in the renderer does not need to change significantly.

**Q: Should MouseController be renamed?**

Keep `MouseController.ts` filename through Phase 1 (avoid churn). Rename directly to the wrapper/engine name in Phase 2 when GestureEngine is introduced. One rename, not two.

### Backend Technical

No backend changes. This is a pure frontend interaction layer change.

---

## Blast Radius Analysis

### Code Impact

| File | Impact | Nature |
|------|--------|--------|
| `renderers/modules/MouseController.ts` | Modified Phase 1, superseded Phase 2 | Event handler migration → pointer events |
| `vibegridx.css` | 1-line change Phase 3 | `touch-action: pan-y` → `touch-action: none` on `.vibegridx-viewport` |
| `renderers/modules/GestureEngine.ts` | New file Phase 2 | State machine |
| `renderers/modules/ScrollPhysics.ts` | New file Phase 3 | Momentum physics |
| `ScrollController.ts` | No change | Still owns scroll event sync |
| `DragSelectionController.ts` | No change | Called by GestureEngine state |
| `FillDragController.ts` | No change | Called by GestureEngine state |
| `ClickRouter.ts` | No change | Called by GestureEngine on tap |
| `HoverTracker.ts` | Minor: mouse-only filter | Phase 1 — add `pointerType` check |
| Renderer that instantiates MouseController | Minor: constructor call update | Phase 2 — wire GestureEngine |

### Database Impact

None. This is a pure client-side interaction change.

### API Impact

None.

### Test Impact

| Test Area | Impact |
|-----------|--------|
| New: `GestureEngine.test.ts` | State machine unit tests — all 8 state transitions |
| New: `ScrollPhysics.test.ts` | Momentum math unit tests — velocity, deceleration, bounds clamping |
| Existing: `kanban-dnd-kit.test.ts` lines 78-124 | **Pre-existing broken tests from reverted GH#2200.** The `MouseController pointer event migration` describe block asserts pointer events, `setPointerCapture`, `pointerType` checks etc. that were reverted. These tests are currently failing. Phase 1 implements exactly what these tests expect — fix/update them rather than writing from scratch. Lines 130+ have `touch-action` string assertions that need updating (`pan-y` → `none`). |
| Existing: Mouse interaction tests | Must all pass after Phase 1 pointer event migration |

### Performance Considerations

- Momentum scroll uses `requestAnimationFrame` — capped at 60fps, no busy-wait
- Velocity tracking: ring buffer of last 5 samples — O(1) per frame
- `pointermove` on `document` (like tldraw) ensures reliable drag tracking across overlays — acceptable since GestureEngine filters by `container.contains()` for Idle state
- Phase 1 pointer event migration: functionally identical to mouse events, no perf change

### Security Considerations

None. No new data surfaces, no auth changes.

---

## Auxiliary Systems Integration

| System | Decision | Details |
|--------|----------|---------|
| Notifications | Not needed | No user-facing events |
| Real-time Sync | Not needed | No data mutation from gesture engine |
| Access Control | Not needed | No permission gates |
| Audit Logging | Not needed | Input handling |
| Workflows | Not needed | Not workflow-triggered |
| Settings | Not needed (MVP) | Deceleration coefficient hardcoded |
| Feature Flags | Not needed | Full rollout |

---

## Implementation Phases

### Phase 1: Pointer Event Migration (zero behavior change)

**Objective:** Replace `mousedown`/`mousemove`/`mouseup` with `pointerdown`/`pointermove`/`pointerup` in `MouseController`. Add `setPointerCapture`/`releasePointerCapture`. Filter hover to mouse only. All existing tests pass.

**TEST first:**
- Write test: `MouseController` initialized with pointer event listeners on `document` (not mouse events)
- Write test: `pointerdown` with `pointerType='mouse'` triggers same behavior as current `mousedown`
- Write test: hover tracking ignores `pointerType='touch'` events
- Existing mouse tests still green

**IMPL:**
- In `MouseController.setupGlobalMouseHandling()`:
  - Replace `mousedown` → `pointerdown`
  - Replace `mousemove` → `pointermove`
  - Replace `mouseup` → `pointerup`
- In `onMouseDown` → rename to `onPointerDown(e: PointerEvent)`:
  - Add `(e.currentTarget as Element).setPointerCapture(e.pointerId)` — or set on container element
- In `onMouseUp` → rename to `onPointerUp(e: PointerEvent)`:
  - Add `(e.currentTarget as Element).releasePointerCapture(e.pointerId)` guard
- In `HoverTracker`:
  - Add `if (e.pointerType !== 'mouse') return` guard to all hover handlers
- Keep `onClick` listener unchanged (click events still fire after pointer up for mouse)
- Add `pointercancel` handler → calls `onPointerUp`-equivalent cleanup, transitions to Idle

**VERIFY:**
- All existing mouse interaction tests pass
- No visual/behavioral change for mouse users
- `pnpm typecheck` clean

**Dependencies:** None — this is the foundation for Phase 2.

---

### Phase 2: GestureEngine State Machine

**Objective:** Extract `MouseController`'s boolean-flag gesture logic into a proper `GestureEngine` state machine. Wire sub-controllers through state transitions. Mouse behavior unchanged.

**TEST first:**
- Write `GestureEngine.test.ts`:
  - `Idle → Pointing` on `pointerdown`
  - `Pointing → Idle` (tap) on `pointerup` within threshold
  - `Pointing → DragSelecting` on horizontal movement >4px (mouse)
  - `Pointing → DragSelecting` on horizontal movement >8px (touch)
  - `Pointing → FillDragging` when target is fill handle, any movement >threshold
  - `Pointing → ColumnResizing` when target is resize handle
  - `Pointing → ColumnDragging` when target is column drag handle
  - `Pointing → RowDragging` when target is row drag handle
  - `Pointing → Scrolling` on vertical movement >8px (touch), `|dy| > |dx| * 1.5`
  - `pointercancel` in any active state → back to Idle

**IMPL:**
- Create `apps/web/src/systems/vibegrid/renderers/modules/GestureEngine.ts`:
  ```
  GestureEngineOptions (same shape as MouseControllerOptions)
  GestureState interface: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onEnter, onExit }
  IdleState, PointingState, DragSelectingState, FillDraggingState,
  ColumnResizingState, ColumnDraggingState, RowDraggingState, ScrollingState (stub)
  ```
- `PointingState.onEnter()`: resolve `CellInfo` from event target, store `origin`, `pointerId`, `pointerType`. Call `ClickRouter.previewHover(target)` for immediate visual feedback.
- `PointingState.onPointerUp()`: call `ClickRouter.handleTap(target, event)`, transition to Idle
- All active states delegate to existing sub-controllers on enter/move/exit
- Wire GestureEngine into the renderer in place of `MouseController` — or as a thin wrapper that MouseController delegates to
- Rename `MouseController.ts` → `PointerController.ts`, have it instantiate and delegate to `GestureEngine`

**VERIFY:**
- All Phase 1 tests still pass
- All GestureEngine unit tests pass
- Manual: mouse behavior identical — click, drag-select, fill, resize, column reorder, row drag

**Dependencies:** Phase 1 must be complete.

---

### Phase 3: `touch-action: none` + JS Vertical Scroll

**Objective:** Change the viewport to `touch-action: none`. Implement `ScrollPhysics` with momentum. Wire `ScrollingState` to use it. Touch scroll works with inertia.

**TEST first:**
- Write `ScrollPhysics.test.ts`:
  - `addSample(dy, timestamp)` — velocity computed from last 5 samples
  - `computeMomentum()` — returns initial velocity for RAF
  - `decelerate(v, coefficient)` — returns `v * 0.95`
  - `clamp(scrollTop, 0, maxScrollTop)` — clamps correctly
  - Momentum stops at `velocity < 0.5`
  - Momentum stops at bounds without exceeding them
- Write integration test: `ScrollingState.onPointerMove` updates `viewport.scrollTop`

**IMPL:**
- Create `apps/web/src/systems/vibegrid/renderers/modules/ScrollPhysics.ts`:
  ```typescript
  class ScrollPhysics {
    private samples: Array<{ dy: number; dt: number }> = []
    private rafId: number | null = null
    private readonly DECELERATION = 0.95
    private readonly STOP_THRESHOLD = 0.5

    addSample(dy: number, timestamp: number): void
    computeVelocity(): number  // px/ms from recent samples
    startMomentum(viewport: HTMLElement, initialVelocity: number, maxScrollTop: number): void
    cancel(): void  // Stops in-flight RAF
  }
  ```
- `GestureEngine.ScrollingState`:
  - `onEnter()`: cancel any in-flight momentum (`scrollPhysics.cancel()`)
  - `onPointerMove(e)`: `viewport.scrollTop -= (e.clientY - this.lastY)`, record sample, update `lastY`
  - `onPointerUp()`: `scrollPhysics.startMomentum(viewport, computedVelocity, maxScrollTop)`, transition to Idle
- In `vibegridx.css` line 27: change `.vibegridx-viewport` `touch-action: pan-y` → `touch-action: none`
- Update `kanban-dnd-kit.test.ts` snapshot if needed (kanban board is a separate DOM subtree — verify it is not `.vibegridx-viewport`)

**VERIFY:**
- `ScrollPhysics` unit tests pass
- Manual touch test: vertical scroll works on iPad Safari and Chrome Android
- Manual touch test: momentum carries after lift
- Manual touch test: scroll clamps at top and bottom
- `pointercancel` listener added to container — confirm zero `pointercancel` events during scroll on touch device

**Dependencies:** Phase 2 must be complete.

---

### Phase 4: Touch Polish + Verification

**Objective:** Validate all touch behaviors on real devices, fix any edge cases found in testing, ensure no mouse regression.

**TEST:**
- Write agent-browser smoke tests for mouse regression:
  - Click cell to select
  - Drag-select 3x3 range
  - Fill handle drag down 3 rows
  - Column resize (+50px)
  - Column reorder (swap 2 columns)
- Manual touch test checklist (iPad Safari, Chrome Android, Capacitor WebView):
  - [ ] Tap cell → selects
  - [ ] Scroll vertically → works with momentum
  - [ ] Scroll horizontally → works (existing JS scroll)
  - [ ] Drag-select → range selection
  - [ ] Fill handle drag → fill applied
  - [ ] Column resize → width changes
  - [ ] Column reorder → order changes
  - [ ] Row drag → order changes
  - [ ] Kanban card drag → still works

**IMPL (as needed from testing):**
- Larger touch thresholds validated at 8px — adjust if real-device feel requires tuning
- iOS Safari: `getCoalescedEvents()` may be unreliable — use raw `pointermove` only (consistent with tldraw iOS workaround)
- If `pointer-events` / `touch-callout` leaks cause visual artifacts on iOS: add `-webkit-touch-callout: none` and `-webkit-tap-highlight-color: transparent` to `.vibegridx-viewport`
- Confirm `@media (hover: none)` affordances (44px targets, always-visible edit icons) work as expected after pointer event migration

**VERIFY:**
- Full mouse regression test suite passes
- Touch checklist complete on all target platforms
- Zero `pointercancel` events logged during any touch interaction
- `pnpm typecheck` clean
- `pnpm lint` clean

**Dependencies:** Phases 1, 2, 3 complete.

---

## Decision Log

### Decision 1: Custom GestureEngine over `@use-gesture/react`

**Date:** 2026-03-27
**Chose:** Custom GestureEngine (Option B)
**Over:** `@use-gesture/react` (Option A) and Capacitor-only (Option C)
**Reason:** `@use-gesture/react` adds ~10KB and still requires us to handle `touch-action: none` + JS scroll ourselves. tldraw's pattern shows a custom state machine is 200-300 lines and gives us exact control over the disambiguation logic. Capacitor-only excludes web + Safari users. The custom engine also matches the existing sub-controller architecture perfectly.

### Decision 2: `touch-action: none` on `.vibegridx-viewport`

**Date:** 2026-03-27
**Chose:** `touch-action: none` on the viewport element
**Over:** Selective `touch-action: none` on individual cells
**Reason:** The CSS spec evaluates `touch-action` up the ancestor chain — the most restrictive ancestor wins. Cells with `none` inside a viewport with `pan-y` produce browser-dependent behavior. tldraw uses `none` on the entire canvas for this reason. We follow the same pattern: one nuclear declaration, no ambiguity.

### Decision 3: Pointer events on `document` (not container)

**Date:** 2026-03-27
**Chose:** Attach `pointermove` and `pointerup` to `document`
**Over:** Attaching to the container element only
**Reason:** `setPointerCapture` technically routes events to the capturing element regardless, but attaching to `document` is more robust for edge cases where the element is unmounted mid-drag. tldraw uses `document.body` for `pointermove`. We filter by `pointerId` in active states to avoid processing foreign events.

### Decision 4: Immediate visual feedback, deferred drag commitment

**Date:** 2026-03-27
**Chose:** Show cell highlight immediately on `pointerdown` (enter Pointing state), defer only the drag action
**Over:** Deferring both highlight and drag (the `deferredCellInfo` approach from reverted hotfixes)
**Reason:** The reverted hotfixes deferred selection itself to avoid committing to the wrong gesture. This broke mouse behavior. tldraw shows the correct pattern: visual feedback is instant (the dead zone is imperceptible at 4-8px), only the drag *type* is deferred. If the gesture resolves to scroll, remove the highlight — this is the rare case, not the common one.

### Decision 5: No rubber-band overscroll for MVP

**Date:** 2026-03-27
**Chose:** Hard clamp to `[0, maxScrollTop]`
**Over:** iOS-style rubber-band bounce
**Reason:** Rubber-band requires spring physics and feels wrong if not matching the exact native curve. Hard clamping is correct and consistent. Users will accept this; the priority is functional scrolling, not pixel-perfect physics matching.

---

## Related Work

- `1d3a86739` — Reverted all touch hotfixes (the starting point for this spec)
- `cdc5fdf8c`, `1ed71693b`, `5fe37b42f`, `701fe3e75` — The 4 reverted hotfix commits (see git log for what was tried)
- `.claude/rules/vibegrid.md` — Touch & Pointer Events section documents the current state post-GH#2200
- `apps/web/src/systems/vibegrid/vibegridx.css` — Line 27 is the `touch-action: pan-y` to change
- `apps/web/src/systems/vibegrid/affordances/affordances.css` — Line 212 has existing `touch-action: none` on affordances (keep)
- `apps/web/src/systems/vibegrid/vibegridx-cells.css` — Fill handle `touch-action: none` (keep)
- Research: `/data/projects/baseplane-dev6/planning/research/2026-03-27-tldraw-touch-architecture-for-vibegrid.md`
