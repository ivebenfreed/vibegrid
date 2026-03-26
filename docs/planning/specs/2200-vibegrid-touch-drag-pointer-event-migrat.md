---
initiative: GH#2200-vibegrid-touch-drag-pointer-event-migration
type: feature
issue_type: feature
status: approved
priority: high
github_issue: 2200
created: 2026-03-26
updated: 2026-03-26

phases:
  - id: p1
    name: "MouseController pointer event migration"
    tasks:
      - "Rename setupGlobalMouseHandling() to setupGlobalPointerHandling() in MouseController.ts"
      - "Replace document mousedown/mousemove/mouseup/click listeners with pointerdown/pointermove/pointerup/click"
      - "Replace MouseEvent type annotations with PointerEvent throughout onMouseDown/onMouseMove/onMouseUp and all private methods"
      - "Move pointermove listener from document to document.body (belt-and-suspenders after pointer capture)"
      - "Add private lastPointerX = 0 and lastPointerY = 0 fields; add dedup guard in onPointerMove"
      - "Add setPointerCapture(e.pointerId) on container in onPointerDown when isTracking = true"
      - "Add releasePointerCapture(e.pointerId) in onPointerUp"
      - "Preserve existing edit-mode passthrough guard (already at ~line 296-341) — verify it works with PointerEvent"
      - "Update ClickRouter.ts: replace MouseEvent with PointerEvent in routeClick() signature"
      - "Add e.pointerType !== 'mouse' guard in MouseController's hover tracking path (before calling hoverTracker.updateMousePosition) — touch devices use :active CSS instead"
      - "Verify column resize path in MouseController (lines ~200-222, ~563-730) works with pointer events — overlays are visual-only, all listeners are in MouseController"
      - "Verify column drag/reorder path in MouseController (lines ~243-268) works with pointer events"
      - "Run pnpm typecheck — must pass cleanly"
  - id: p2
    name: "CSS touch targets and affordances"
    tasks:
      - "Add touch-action: pan-y and -webkit-overflow-scrolling: touch to .vibegridx-container in vibegridx.css"
      - "Add touch-action: none to .vibegridx-fill-handle in vibegridx-cells.css"
      - "Add 44px touch target to .vibegridx-fill-handle via ::after pseudo-element (content: ''; position: absolute; top/bottom/left/right: -10px; -20px)"
      - "Add touch-action: none to .vibegridx-resize-handle with 44px hit area via ::after (20px each side)"
      - "Add touch-action: none to [data-affordance='drag-handle'] in affordances.css"
      - "Add @media (hover: none) block in affordances.css: fill handle opacity: 1, edit icons opacity: 1, :active replaces :hover for link affordances"
      - "Test vertical scroll still works on touch with pan-y via Chrome DevTools device emulation"
  - id: p3
    name: "Kanban dnd-kit migration"
    tasks:
      - "Import DndContext, PointerSensor, TouchSensor, useSensor, useSensors, DragEndEvent, DragOverEvent, DragStartEvent from @dnd-kit/core in KanbanBoard.tsx"
      - "Create sensors with PointerSensor activationConstraint distance 8px and TouchSensor activationConstraint delay 250ms tolerance 5px"
      - "Wrap KanbanBoard return JSX in DndContext with sensors and onDragStart/onDragOver/onDragEnd handlers"
      - "Map onDragStart to kanbanStore.startDrag(active.id, active.data.current.columnId)"
      - "Map onDragOver to kanbanStore.updateDragTarget(over?.id ?? null)"
      - "Map onDragEnd to kanbanStore.endDrag() with prior updateDragTarget; handle null over as cancelDrag"
      - "Remove HTML5 handlers from KanbanBoard: handleCardDragStart, handleCardDragEnd, handleDragOver, handleDragLeave, handleDrop"
      - "Add useDraggable({ id: card.id, data: { columnId: card.columnId }, disabled: !enableDragAndDrop }) to KanbanCard.tsx"
      - "Apply ref={setNodeRef} {...listeners} {...attributes} to Card element in KanbanCard"
      - "Use dnd-kit isDragging for opacity/rotate visual in KanbanCard (replaces isDragging prop)"
      - "Remove draggable, onDragStart, onDragEnd HTML5 props from KanbanCard and KanbanCardProps interface"
      - "Add useDroppable({ id: column.id }) to KanbanColumn.tsx, apply ref={setNodeRef} to article element"
      - "Use dnd-kit isOver for drag-over highlight in KanbanColumn (replaces isDragOver prop)"
      - "Remove onDragOver, onDragLeave, onDrop HTML5 props from KanbanColumn and KanbanColumnProps interface"
      - "Remove isLocalDragOver useState from KanbanColumn"
      - "KanbanViewStore.ts — no changes"
  - id: p4
    name: "Integration testing and Safari/iOS workarounds"
    tasks:
      - "Desktop regression: cell click, shift-click range, ctrl-click multi, drag-to-select, fill handle drag, column resize, column reorder"
      - "Touch simulation Chrome DevTools iPhone 12 Pro: tap cell, drag-to-select, fill handle drag, column resize, column reorder"
      - "Kanban touch drag: hold 250ms, drag to column, release — card moves"
      - "Kanban quick tap: no delay — card detail opens"
      - "Affordances on touch: fill handle and edit icons visible without hover in hover:none media"
      - "Vertical scroll: cell area scrolls vertically on touch (pan-y working)"
      - "Add gesturestart/gesturechange/gestureend preventDefault handlers for Safari pinch-zoom blocking — useEffect with cleanup to avoid duplicate listeners on re-mount"
      - "Verify apps/web/index.html has viewport meta width=device-width initial-scale=1"
      - "agent-browser screenshot Kanban view at 375px width"
---

# VIbeGrid Touch & Drag — Pointer Event Migration + Kanban dnd-kit

> GitHub Issue: [#2200](https://github.com/baseplane-ai/baseplane/issues/2200)
> Research: [planning/research/2026-03-26-vibegrid-touch-drag-mobile.md](../research/2026-03-26-vibegrid-touch-drag-mobile.md)

## Problem Statement

VIbeGrid has no touch interaction support. All interaction controllers (`MouseController`, `DragSelectionController`, `FillDragController`, `ColumnResizeOverlayDOM`, `ColumnDragOverlayDOM`) use `mousedown/mousemove/mouseup` events exclusively. On touch devices:

- Cell tap, drag-to-select, fill handle drag, column resize, and column reorder are completely non-functional
- Kanban card drag is broken because it uses the HTML5 Drag API which has no native touch support
- Cell affordances (fill handles, edit icons, link underlines) are invisible because they depend on CSS `:hover` which does not fire on touch
- No `touch-action` CSS means the browser intercepts all touch gestures for its own scroll/zoom, preventing any drag interactions

The Capacitor native app (GH#2128) is in progress, making this gap increasingly urgent. GH#2187 added mobile bottom navigation — the layout layer is mobile-ready, but the data grid itself remains desktop-only.

**Scope:** Part A (pointer event migration of all mouse controllers) + Part B (Kanban dnd-kit migration). Swipe-to-action (Option C from research) is deferred as a future enhancement requiring a new dependency.

---

## User Story

As a **mobile user or tablet user accessing Baseplane via the Capacitor app or a touch browser**,
I want **VIbeGrid interactions (tap, drag-select, fill handle, column resize/reorder, Kanban card drag) to respond to touch input**,
so that **I can work with entity data on a phone or iPad without needing a mouse or keyboard**.

---

## Goals & Non-Goals

### Goals

- Migrate all mouse event listeners in VIbeGrid's interaction controllers to pointer events (mouse, touch, and stylus unified)
- Add `setPointerCapture` to all drag operations for reliable tracking across element boundaries
- Add `touch-action: pan-y` on the grid container to preserve native vertical scroll while enabling horizontal drag
- Add `touch-action: none` on drag handles only (fill handle, resize handle, column drag handle)
- Add `@media (hover: none)` block to make hover-dependent affordances permanently visible on touch
- Add 44px minimum touch targets on resize handles and fill handles (invisible enlarged hit areas)
- Replace Kanban HTML5 DnD with @dnd-kit (already installed at `^6.3.1`, zero new dependencies)
- Keep all existing desktop mouse behavior identical — pointer events are a strict superset of mouse events

### Non-Goals (Out of Scope)

- Swipe-to-action on table rows (Option C from research — requires `@use-gesture/react`, future issue)
- Long-press for context menu on mobile (future)
- Pinch-to-zoom columns (future)
- Row reorder by touch (separate issue)
- Any backend / API / database changes — this is frontend-only
- New npm dependencies — @dnd-kit is already in package.json

---

## Reference Implementations

**GanttBar.tsx** (`apps/web/src/systems/vibegrid/components/GanttBar.tsx`) already uses `React.PointerEvent` for all drag interactions (`handleBodyPointerDown`, `handleLeftHandlePointerDown`, `handleRightHandlePointerDown`). This is the established pattern: `React.PointerEvent` type, `if (e.button !== 0) return` guard for left-click-only, `e.preventDefault()` + `e.stopPropagation()`. All new code follows the same pattern.

**tldraw architecture patterns adopted:**
- `setPointerCapture(e.pointerId)` on drag start — routes all future pointer events to the capturing element even if the pointer leaves
- `pointermove` attached to `document.body` (not just the container) — belt-and-suspenders alongside pointer capture
- Move deduplication: `if (e.clientX === lastX && e.clientY === lastY) return`
- Selective `e.preventDefault()`: block on grid cells, allow on inputs and elements in edit mode

**Key divergence from tldraw:** tldraw prevents all touch events and owns all panning. VIbeGrid must preserve native vertical scroll. Therefore: `touch-action: pan-y` on `.vibegridx-container` (not `touch-action: none`), and `touch-action: none` only on explicit drag handles.

---

## Feature Behaviors

> TEVS format. All 4 layers present. API Layer and Data Layer are N/A for all behaviors (frontend-only).

---

### B1: Cell tap works on touch (pointer down migration)

**Core:**
- **ID:** cell-tap-touch
- **Trigger:** User touches a grid cell on a touch device (iOS Safari, Chrome Android, or Capacitor WebView).
- **Expected:** `MouseController.onPointerDown()` fires for the touch event. Cell selection updates. If the contact is short (< 8px movement), `ClickRouter` fires the cell click action (navigate, edit trigger, or toggle). Desktop mouse behavior unchanged — `e.pointerType === 'mouse'` for all existing mouse events.
- **Verify:** Open a VibeGrid in Chrome DevTools touch emulation (iPhone 12 Pro, 390px viewport). Tap a cell — cell becomes selected (blue highlight). Tap a link cell — navigate affordance fires. Tap an editable cell — edit session opens. Switch off emulation — all mouse behaviors identical to before.
- **Source:** `apps/web/src/systems/vibegrid/renderers/modules/MouseController.ts` — `setupGlobalMouseHandling()` renamed to `setupGlobalPointerHandling()`, `mousedown` → `pointerdown`, `mousemove` → `pointermove` on `document.body`, `mouseup` → `pointerup`, `MouseEvent` → `PointerEvent` throughout

#### UI Layer
No visual change on desktop. On touch: cells respond to tap with selection highlight. Touch ripple is browser-native.

#### API Layer
N/A

#### Data Layer
N/A

---

### B2: Pointer capture prevents lost drags

**Core:**
- **ID:** pointer-capture-drag-reliability
- **Trigger:** User starts a drag operation (drag-to-select, fill drag, column resize, or column reorder) and moves quickly, causing the pointer to exit the originating element.
- **Expected:** `element.setPointerCapture(e.pointerId)` is called at drag start. All subsequent `pointermove` events route to the capturing element regardless of where the pointer/touch moves. Drag completes correctly even if the pointer exits the grid container entirely. `releasePointerCapture(e.pointerId)` is called in `pointerup` or on `lostpointercapture`.
- **Verify:** Start a drag-to-select rectangle. Move the pointer quickly out of the grid container before releasing. Selection rectangle continues to track the pointer and completes correctly on release. Without capture, the selection would freeze at the container boundary.
- **Source:** `MouseController.ts` onPointerDown (when `isTracking` becomes true); also `DragSelectionController.ts`, `FillDragController.ts`, `ColumnResizeOverlayDOM.ts`, `ColumnDragOverlayDOM.ts`

#### UI Layer
No visual change. Behavioral reliability improvement, especially on fast mouse movements and touch.

#### API Layer
N/A

#### Data Layer
N/A

---

### B3: pointermove deduplication prevents redundant processing

**Core:**
- **ID:** pointermove-deduplication
- **Trigger:** Browser fires `pointermove` events as the user moves pointer/touch across the grid.
- **Expected:** `MouseController` stores `lastPointerX` and `lastPointerY`. At the top of `onPointerMove`, if `e.clientX === this.lastPointerX && e.clientY === this.lastPointerY`, the handler returns immediately. No state changes, no re-renders. Reduces redundant processing during high-frequency drag operations.
- **Verify:** Add a counter to `onPointerMove`. Move the mouse slowly across the grid. Counter increments only for unique pixel positions. (Coalesced events from the browser can deliver duplicate positions — deduplication filters these.)
- **Source:** `MouseController.ts` — add `private lastPointerX = 0; private lastPointerY = 0;` fields; add guard at top of `onPointerMove`

#### UI Layer
No visual change. Performance improvement during drag.

#### API Layer
N/A

#### Data Layer
N/A

---

### B4: Vertical scroll preserved on touch (touch-action: pan-y)

**Core:**
- **ID:** touch-action-pan-y-container
- **Trigger:** User touches the grid cell area and scrolls vertically (not on a drag handle).
- **Expected:** The page/container scrolls vertically via native browser scroll. The grid does not intercept the touch. `touch-action: pan-y` on `.vibegridx-container` signals the browser to handle vertical pan gestures natively while JavaScript handles horizontal interactions. Elements with `touch-action: none` (drag handles) still initiate pointer drag correctly.
- **Verify:** Chrome DevTools iPhone 12 Pro emulation. Open a grid with 20+ rows. Touch the cell area and drag vertically — page scrolls. Touch a fill handle and drag — fill drag initiates (no scroll). Touch a column resize handle and drag horizontally — resize initiates (no scroll).
- **Source:** `apps/web/src/systems/vibegrid/vibegridx.css` — add `touch-action: pan-y; -webkit-overflow-scrolling: touch;` to `.vibegridx-container`

#### UI Layer
CSS-only change. No visual difference. Scroll is smooth (compositor-driven via pan-y).

#### API Layer
N/A

#### Data Layer
N/A

---

### B5: Drag handles have touch-action: none and 44px hit areas

**Core:**
- **ID:** drag-handle-touch-action-targets
- **Trigger:** User attempts to interact with the fill handle, column resize handle, or column drag handle on a touch device.
- **Expected:** Each handle element has `touch-action: none` to prevent the browser from intercepting the touch for scroll/zoom. Fill handle and resize handles have a minimum 44px touch target (Apple HIG recommendation) via invisible `::after` pseudo-element extending the hit area. Visual size of handles is unchanged.
- **Verify:** Chrome DevTools touch emulation. Touch the 2px-wide column resize border — resize initiates reliably without needing precise 2px accuracy. Touch the fill handle dot — drag initiates, does not scroll. The hit area is visually 2px wide but touchably 44px wide.
- **Source:**
  - `vibegridx-cells.css` — `.vibegridx-fill-handle`: `touch-action: none; position: relative;` + `::after { content: ''; position: absolute; top: -10px; bottom: -10px; left: -20px; right: -20px; }`
  - `affordances.css` — `[data-affordance="drag-handle"]`: `touch-action: none;`
  - `vibegridx.css` — `.vibegridx-resize-handle`: `touch-action: none; position: relative;` + `::after` 44px hit area

#### UI Layer
Visual appearance of handles unchanged. Hit area enlarged invisibly.

#### API Layer
N/A

#### Data Layer
N/A

---

### B6: Hover-dependent affordances visible on touch

**Core:**
- **ID:** touch-affordances-hover-none
- **Trigger:** User views VIbeGrid on a touch-only device (no hardware mouse, `@media (hover: none)` matches).
- **Expected:** Affordances that are normally only visible on CSS `:hover` are permanently visible on touch: fill handle dot (opacity 1), edit icons on EntityName cells, link underlines on navigate cells. `:active` replaces `:hover` for interaction feedback. On desktop (hover capable), existing behavior is unchanged.
- **Verify:** Chrome DevTools device emulation set to iPhone 12 Pro (hover: none). Navigate to a grid. Fill handle dot is visible without hovering over the cell. Edit icons visible on cells. On desktop (disable emulation): hover-reveal behavior unchanged.
- **Source:** `apps/web/src/systems/vibegrid/affordances/affordances.css` — add `@media (hover: none)` block at end of file. Per vibegrid.md rules: use `opacity: 1` (NOT `display: none`) to keep elements in the ARIA tree.

#### UI Layer

```css
/* New block at end of affordances.css */
@media (hover: none) {
  /* Fill handle: always visible on touch */
  .vibegridx-fill-handle {
    opacity: 1;
    pointer-events: auto;
  }

  /* Edit icons: always visible on touch */
  [data-affordance-role="icon"] {
    opacity: 1;
    pointer-events: auto;
  }

  /* Navigate cells: underline on tap (active) instead of hover */
  [data-action="navigate"]:active {
    text-decoration: underline;
  }
}
```

#### API Layer
N/A

#### Data Layer
N/A

---

### B7: Column resize works on touch

**Core:**
- **ID:** column-resize-touch
- **Trigger:** User touches the column resize handle (2px border between column headers, 44px touch target) on a touch device.
- **Expected:** `ColumnResizeOverlayDOM` fires `pointerdown`. `setPointerCapture` is called. User drags horizontally — column width updates in real time at ~60fps (throttled at RESIZE_THROTTLE_MS = 16). `pointerup` finalizes the width. Behavior identical to mouse resize.
- **Verify:** Chrome DevTools iPhone emulation. Touch the column resize area (within 22px of the header border). Drag right — column widens. Drag left — column narrows. Release — width persists.
- **Source:** `apps/web/src/systems/vibegrid/overlays/ColumnResizeOverlayDOM.ts` — replace `mousedown/mousemove/mouseup` with `pointerdown/pointermove/pointerup`, add `setPointerCapture`/`releasePointerCapture`

#### UI Layer
No visual change. Resize behavior identical to mouse.

#### API Layer
N/A

#### Data Layer
N/A

---

### B8: Column reorder works on touch

**Core:**
- **ID:** column-reorder-touch
- **Trigger:** User touches a column header and drags horizontally on a touch device.
- **Expected:** `ColumnDragOverlayDOM` fires `pointerdown`. `setPointerCapture` is called. Column drag preview appears and follows the touch. Drop indicator line shows target position between columns. `pointerup` commits the reorder. Behavior identical to mouse drag.
- **Verify:** Chrome DevTools iPhone emulation. Touch a column header. Drag horizontally — drag preview appears, drop indicator follows. Drop between two other columns — column reorders.
- **Source:** `apps/web/src/systems/vibegrid/overlays/ColumnDragOverlayDOM.ts` — replace mouse events with pointer events, add `setPointerCapture`/`releasePointerCapture`

#### UI Layer
No visual change. Reorder behavior identical to mouse.

#### API Layer
N/A

#### Data Layer
N/A

---

### B9: Fill handle drag works on touch

**Core:**
- **ID:** fill-drag-touch
- **Trigger:** User touches and drags the fill handle (small dot in bottom-right corner of a selected cell, 44px touch target) on a touch device.
- **Expected:** `FillDragController` fires `pointerdown`. `setPointerCapture` is called. User drags down or across — fill range highlights the target cells. `pointerup` commits the fill operation. Behavior identical to mouse fill drag.
- **Verify:** Chrome DevTools iPhone emulation. Select cell A1. Touch the fill handle (44px area). Drag down over cells A2-A4. Release — fill operation applies the value to A2-A4.
- **Source:** `apps/web/src/systems/vibegrid/renderers/modules/FillDragController.ts` — replace `MouseEvent` with `PointerEvent`, add `setPointerCapture`/`releasePointerCapture`

#### UI Layer
Fill handle has 44px touch target. Behavior identical to mouse.

#### API Layer
N/A

#### Data Layer
N/A

---

### B10: Drag-to-select cells works on touch

**Core:**
- **ID:** drag-select-touch
- **Trigger:** User touches a cell and drags horizontally across multiple cells on a touch device.
- **Expected:** After exceeding the drag threshold (8px), `DragSelectionController` activates. Selection rectangle follows the touch. `setPointerCapture` prevents the selection from breaking when dragging across cell boundaries. `pointerup` commits the final selection.
- **Note:** `touch-action: pan-y` on the container gives vertical scroll priority over vertical drag. Horizontal drag-select works correctly. Diagonal drag: browser honors `pan-y` (vertical scroll wins). This is an acceptable trade-off — exact diagonal disambiguation requires a more complex gesture disambiguation layer and is deferred.
- **Verify:** Chrome DevTools iPhone emulation. Touch cell A1. Drag right to C1 — cells A1-C1 selected. Drag vertically from A1 — vertical scroll fires (expected behavior with pan-y).
- **Source:** `apps/web/src/systems/vibegrid/renderers/modules/DragSelectionController.ts` — replace `MouseEvent` with `PointerEvent`, add `setPointerCapture`

#### UI Layer
Selection rectangle visual unchanged. Horizontal drag-select works on touch.

#### API Layer
N/A

#### Data Layer
N/A

---

### B11: Edit mode inputs not blocked by pointer event prevention

**Core:**
- **ID:** edit-mode-input-passthrough
- **Trigger:** User double-clicks or taps a cell to enter inline edit mode. The edit overlay renders an `<input>` or `<textarea>`.
- **Expected:** `e.preventDefault()` is NOT called when the pointer event target is an INPUT, TEXTAREA, SELECT, or element with `contenteditable`. These elements need default browser behavior for text selection, cursor positioning, and virtual keyboard display on touch. The guard applies in `onPointerDown` before any `preventDefault` call.
- **Verify:** Desktop: double-click a text cell to open inline edit. Type text — works. Touch emulation: tap an editable text cell. Virtual keyboard appears. Text can be typed and cursor positioned correctly.
- **Source:** `MouseController.ts` onPointerDown — add guard before `e.preventDefault()`:
  ```typescript
  const tag = (e.target as HTMLElement).tagName
  const isEditableTarget = tag === 'INPUT' || tag === 'TEXTAREA'
    || tag === 'SELECT' || (e.target as HTMLElement).isContentEditable
  if (!isEditableTarget) {
    e.preventDefault()
  }
  ```

#### UI Layer
No change. Inline edit behavior preserved.

#### API Layer
N/A

#### Data Layer
N/A

---

### B12: Kanban card drag works on touch (dnd-kit migration)

**Core:**
- **ID:** kanban-dnd-kit-touch
- **Trigger:** User touches and holds a Kanban card for 250ms on a touch device, then drags to another column.
- **Expected:** dnd-kit's `TouchSensor` activates after a 250ms hold (distinguishes tap from drag). Card follows the touch position. Target column highlights with `isOver` visual. On release over a column, `KanbanViewStore.updateDragTarget(columnId)` then `KanbanViewStore.endDrag()` are called. Card moves to the target column. Quick tap (< 250ms hold) fires `onClick` — no drag.
- **Verify:** Chrome DevTools iPhone emulation. Open Kanban view. Touch-hold a card 250ms → drag to another column → release. Card appears in new column. Quick tap a card (no hold) → card detail view opens.
- **Source:**
  - `KanbanCard.tsx` — HTML5 `draggable` prop removed; `useDraggable({ id: card.id, data: { columnId: card.columnId } })` from `@dnd-kit/core`
  - `KanbanColumn.tsx` — HTML5 `onDragOver/onDragLeave/onDrop` removed; `useDroppable({ id: column.id })` from `@dnd-kit/core`
  - `KanbanBoard.tsx` — wrapped in `<DndContext sensors={sensors}>`, handlers map to `KanbanViewStore`

#### UI Layer

**KanbanBoard sensor configuration:**
```tsx
const sensors = useSensors(
  useSensor(PointerSensor, {
    activationConstraint: { distance: 8 }, // matches existing dragThreshold
  }),
  useSensor(TouchSensor, {
    activationConstraint: { delay: 250, tolerance: 5 }, // hold to distinguish tap from drag
  }),
)
```

**KanbanCard (after migration):**
```tsx
const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
  id: card.id,
  data: { columnId: card.columnId },
  disabled: !enableDragAndDrop,
})
// Card renders: ref={setNodeRef} {...listeners} {...attributes}
// onClick and onKeyDown unchanged — not affected by dnd-kit
```

**KanbanColumn (after migration):**
```tsx
const { isOver, setNodeRef } = useDroppable({ id: column.id })
// <article ref={setNodeRef} className={cn(..., isOver && 'border-primary/50 bg-primary/5 ring-2 ring-primary/20')}>
```

#### API Layer
N/A

#### Data Layer
N/A

---

### B13: Kanban card drag works on mouse (dnd-kit desktop parity)

**Core:**
- **ID:** kanban-dnd-kit-desktop-parity
- **Trigger:** User clicks and drags a Kanban card with a mouse after the dnd-kit migration.
- **Expected:** Mouse drag behavior is visually and functionally identical to before. Card follows cursor. Target column highlights. Card moves on release. `KanbanViewStore` methods (`startDrag`, `updateDragTarget`, `endDrag`) are called in the same sequence as before. `enableDragAndDrop={false}` prop disables all drag on both mouse and touch (dnd-kit `disabled` flag).
- **Verify:** Desktop Chrome (no emulation). Drag a Kanban card from one column to another — card moves. Pass `enableDragAndDrop={false}` — no drag on mouse or touch.
- **Source:** `KanbanBoard.tsx` — `PointerSensor` covers mouse with `distance: 8` constraint (moves must exceed 8px before drag activates, preventing accidental drags on click)

#### UI Layer
Desktop behavior visually identical to HTML5 DnD version.

#### API Layer
N/A

#### Data Layer
N/A

---

### B14: Desktop mouse interactions are unchanged (regression guard)

**Core:**
- **ID:** desktop-regression-guard
- **Trigger:** User uses VIbeGrid with a mouse after the P1-P4 pointer event migrations.
- **Expected:** All existing mouse behaviors work identically: cell click, multi-select (Shift+click, Ctrl+click), drag-to-select rectangle, fill handle drag, column resize, column reorder, row drag. Pointer events fire with `e.pointerType === 'mouse'` for all mouse interactions. `if (e.button !== 0) return` guard (same as GanttBar.tsx) filters right-click and middle-click as before.
- **Verify:** Desktop Chrome, no touch emulation. Run full interaction checklist: single cell click → selected. Shift+click another cell → range selected. Ctrl+click → multi-select. Drag from A1 to C3 → rectangle selected. Fill handle drag → fill completes. Column border drag → resize. Column header drag → reorder. All must pass unchanged.
- **Source:** All migrated controllers. Key safety: `PointerEvent extends MouseEvent` — no existing property accesses break.

#### UI Layer
No change on desktop.

#### API Layer
N/A

#### Data Layer
N/A

---

## File Change Summary

| File | Change | Phase |
|------|--------|-------|
| `systems/vibegrid/renderers/modules/MouseController.ts` | Replace mouse events with pointer events, add pointer capture, body-level pointermove, move dedup, edit-mode passthrough | P1 |
| `systems/vibegrid/renderers/modules/ClickRouter.ts` | Replace `MouseEvent` with `PointerEvent` in `routeClick()` signature | P1 |
| `systems/vibegrid/vibegridx.css` | Add `touch-action: pan-y` to `.vibegridx-container` | P2 |
| `systems/vibegrid/vibegridx-cells.css` | Add `touch-action: none` + 44px `::after` hit area to `.vibegridx-fill-handle` | P2 |
| `systems/vibegrid/affordances/affordances.css` | Add `touch-action: none` to drag handles; add `@media (hover: none)` affordances block | P2 |
| `systems/vibegrid/components/kanban/KanbanCard.tsx` | Replace HTML5 DnD props with `useDraggable` from `@dnd-kit/core` | P3 |
| `systems/vibegrid/components/kanban/KanbanColumn.tsx` | Replace HTML5 drop handlers with `useDroppable` from `@dnd-kit/core` | P3 |
| `systems/vibegrid/components/kanban/KanbanBoard.tsx` | Add `DndContext` + sensors, map dnd-kit events to `KanbanViewStore`, remove HTML5 handlers | P3 |

All files under `apps/web/src/`. **Not modified:** `KanbanViewStore.ts` (store API unchanged), `DragSelectionController.ts` (pure logic class — receives calls from MouseController, registers no listeners), `FillDragController.ts` (same — pure logic, no event types), `HoverTracker.ts` (same — called by MouseController), `ColumnResizeOverlayDOM.ts` (visual renderer only — all listeners are in MouseController), `ColumnDragOverlayDOM.ts` (same).

---

## Requirements Interview Summary

### Core Functionality

**Q: What touch interactions must work after this feature?**
A: Cell tap (select), drag-to-select (horizontal), fill handle drag, column resize, column reorder, Kanban card drag between columns. All via pointer events. Desktop mouse behavior must remain identical — pointer events are a superset of mouse events.

**Q: What is the single biggest change?**
A: MouseController pointer event migration (P1). At 41KB, this is the central coordinator for all cell-level interactions. Everything else builds on top of it.

**Q: Should vertical scroll be preserved on touch?**
A: Yes. `touch-action: pan-y` on `.vibegridx-container` preserves native vertical scroll. `touch-action: none` only on explicit drag handles (fill, resize, column reorder). This is the key divergence from tldraw (which owns all scroll).

### Edge Cases

**Q: What happens when pointer exits the grid during drag?**
A: `setPointerCapture(e.pointerId)` routes all subsequent pointer events to the capturing element. Drag completes correctly regardless of pointer position.

**Q: What about inputs in edit mode?**
A: `e.preventDefault()` is conditionally skipped when target is INPUT, TEXTAREA, SELECT, or `contenteditable`. Virtual keyboards and text selection work correctly in edit mode.

**Q: Kanban: how do you distinguish tap from drag on touch?**
A: dnd-kit `TouchSensor` with 250ms activation delay. Quick tap (< 250ms) fires `onClick`. Hold + move (> 250ms or > 5px tolerance) = drag intent.

**Q: What about diagonal drag-to-select on touch?**
A: `touch-action: pan-y` gives vertical scroll priority. Horizontal drag-select works correctly. Diagonal drag: browser honors `pan-y` (vertical scroll wins). Documented trade-off — exact diagonal disambiguation is a future enhancement.

### Platform Integration Decisions

| System | Decision | Rationale |
|--------|----------|-----------|
| Notifications | Not needed | No user-facing events require notification |
| Real-time Sync (EventBus) | Not needed | Touch input is purely view-layer; no new mutations |
| Access Control | Not needed | No permission changes |
| Audit Logging | Not needed | No new action types |
| Workflows | Not needed | N/A |
| Settings | Not needed | No user preference for touch behavior in MVP |
| Feature Flags | Not needed | Pointer events are backward-compatible; no risk of breaking existing mouse behavior |
| New npm dependencies | None | `@dnd-kit/core ^6.3.1`, `@dnd-kit/sortable ^10.0.0`, `@dnd-kit/utilities ^3.2.2` already in package.json, confirmed unused in research |

### UX Decisions

**Q: Kanban card click after dnd-kit migration?**
A: Yes, `onClick` prop on KanbanCard is preserved. dnd-kit's `TouchSensor` 250ms delay ensures quick taps (< 250ms) fire `onClick`, not drag.

**Q: Should affordances on touch be permanent or tap-to-reveal?**
A: Permanently visible on `@media (hover: none)`. Touch devices have no hover state — hiding affordances until hover makes them undiscoverable. Per vibegrid.md rule: use `opacity: 0 → opacity: 1` (never `display: none`) to preserve ARIA tree.

**Q: Minimum touch target size?**
A: 44px (Apple HIG). Implemented as invisible extended hit areas via `::after` pseudo-element. Visual size of handles unchanged.

### Frontend Technical

**Q: Why pointer events instead of adding parallel touch event handlers?**
A: Pointer events unify mouse, touch, and stylus into one event model. `PointerEvent extends MouseEvent` — all existing property accesses (`clientX`, `clientY`, `button`, `shiftKey`, etc.) work unchanged. One code path instead of two. GanttBar.tsx is the established precedent.

**Q: Why body-level pointermove?**
A: Belt-and-suspenders alongside pointer capture. Pointer capture routes events to the element, but `document.body` attachment ensures events are received in edge cases (e.g., capture released unexpectedly). tldraw uses the same pattern.

**Q: Why @dnd-kit instead of custom pointer events for Kanban?**
A: @dnd-kit is already installed and provides tested touch/mouse/keyboard drag out of the box. The `KanbanViewStore` API (`startDrag`, `updateDragTarget`, `endDrag`) maps directly to dnd-kit's event model without any store changes. Zero new dependencies, minimal migration risk.

**Q: Does dnd-kit conflict with MouseController's pointer event migration?**
A: No. dnd-kit operates on Kanban components which are outside MouseController's jurisdiction (MouseController listens on the grid container; `KanbanBoard` is a separate component tree). No event conflicts.

### Backend Technical

N/A — frontend-only. No API endpoints, database schemas, migrations, or server-side logic are affected.

---

## Blast Radius Analysis

### Code Impact

**Direct changes (13 files, all `apps/web/src/systems/vibegrid/`):**
- `renderers/modules/MouseController.ts` — largest single change; central event coordinator
- `renderers/modules/DragSelectionController.ts` — event type only (`MouseEvent` → `PointerEvent`)
- `renderers/modules/FillDragController.ts` — event type + `setPointerCapture`
- `renderers/modules/ClickRouter.ts` — event type only
- `renderers/modules/HoverTracker.ts` — `mouseenter/mouseleave` → `pointerenter/pointerleave` + pointer type filter
- `overlays/ColumnResizeOverlayDOM.ts` — event type + `setPointerCapture`
- `overlays/ColumnDragOverlayDOM.ts` — event type + `setPointerCapture`
- `components/kanban/KanbanCard.tsx` — full DnD API replacement
- `components/kanban/KanbanColumn.tsx` — full drop handler replacement
- `components/kanban/KanbanBoard.tsx` — `DndContext` wrapper + sensor config + event remapping
- `vibegridx.css` — CSS additions only
- `vibegridx-cells.css` — CSS additions only
- `affordances/affordances.css` — CSS additions only

**Not modified:**
- `KanbanViewStore.ts` — store API is the stable interface; dnd-kit is purely view-layer
- `VibeGrid.tsx` — no changes to main component
- `GanttBar.tsx` — already uses pointer events correctly; no changes needed
- `stores/InteractionStore.ts`, `EditingStore.ts`, `TableCoreStore.ts`, etc. — zero impact
- All `features/` domain code — zero impact
- All `packages/` — zero impact

### Database Impact
None. Frontend-only.

### API Impact
None. No new endpoints. No breaking changes to any API contract.

### Test Impact

**Existing tests to verify still pass:**
- Any vitest tests in `systems/vibegrid/**/__tests__/` — run with `pnpm test --filter=@baseplane/web`
- CSV export tests (`utils/__tests__/csv-export.test.ts`) — unaffected but run as smoke test

**Tests to add (P5):**
- Desktop interaction regression checklist (manual or agent-browser)
- Kanban touch drag simulation test (Chrome DevTools emulation via agent-browser)
- agent-browser screenshot at 375px Kanban view

### Performance Considerations

- `pointermove` deduplication reduces processing on high-frequency events (60+ events/second during drag on high-DPI displays)
- `touch-action: pan-y` hands vertical scroll to browser compositor — actually improves scroll performance vs JavaScript-intercepted scroll
- `setPointerCapture` is a browser primitive — zero JS overhead
- dnd-kit's pointer sensor state updates are external to MobX — no additional MobX reaction cycles

### Security Considerations

None. Touch events carry no additional trust surface. No new API calls, no new data access.

---

## Auxiliary Systems Integration

| System | Decision | Rationale |
|--------|----------|-----------|
| Notifications | Not needed | Touch input is purely local; no user-facing events |
| Real-time Sync (EventBus) | Not needed | No new mutations; existing mutation paths unchanged |
| Access Control | Not needed | No new permissions required |
| Audit Logging | Not needed | No new action types created |
| Workflows | Not needed | N/A |
| Settings | Not needed | No user-configurable touch behavior for MVP |
| Feature Flags | Not needed | Pointer events are backward-compatible; safe to ship directly |
| @dnd-kit/core | Already installed | Confirmed in `package.json`: `@dnd-kit/core ^6.3.1`. Zero install impact. |

---

## Implementation Phases

### P1: MouseController pointer event migration

**Goal:** Migrate the core interaction coordinator from mouse to pointer events. Unlocks 80% of touch interactions (all cell-level: click, drag-select, fill drag, hover tracking).

**TEST first (desktop regression baseline):**
- Single cell click → selected
- Shift+click → range selected
- Ctrl+click → multi-select
- Drag from A1 to C3 → rectangle selected
- Fill handle drag → fill completes

**IMPL:**
1. Rename `setupGlobalMouseHandling()` → `setupGlobalPointerHandling()` in `MouseController.ts`
2. Change `document.addEventListener('mousedown', ...)` → `document.addEventListener('pointerdown', ...)`
3. Change `document.addEventListener('mousemove', ...)` → `document.body.addEventListener('pointermove', ...)` (body-level)
4. Change `document.addEventListener('mouseup', ...)` → `document.addEventListener('pointerup', ...)`
5. Change all `MouseEvent` type annotations → `PointerEvent`
6. Add `private lastPointerX = 0; private lastPointerY = 0;` fields
7. Add dedup guard at top of `onPointerMove`: `if (e.clientX === this.lastPointerX && e.clientY === this.lastPointerY) return`; update `lastPointerX`/`lastPointerY` after passing the guard
8. Add `this.container.setPointerCapture(e.pointerId)` in `onPointerDown` when `this.isTracking = true` is set
9. Add `this.container.releasePointerCapture(e.pointerId)` in `onPointerUp`
10. Add edit-mode passthrough guard in `onPointerDown` (see B11)
11. Update `ClickRouter.ts`: `MouseEvent` → `PointerEvent` in `routeClick()` signature (~line 69)
12. Add `if (e.pointerType !== 'mouse') return` guard in MouseController's hover tracking path (before calling `hoverTracker.updateMousePosition()`) — touch devices use `:active` CSS affordances instead
13. Verify column resize path in MouseController (lines ~200-222, ~563-730) works correctly with pointer events — `ColumnResizeOverlayDOM` and `ColumnDragOverlayDOM` are visual-only renderers that register no listeners
14. Preserve existing edit-mode passthrough guard (~lines 296-341) — verify it works with `PointerEvent` (existing code already checks `target.matches('input, textarea, select')`)
**Note:** `DragSelectionController`, `FillDragController`, and `HoverTracker` are pure logic classes called by MouseController — they register no event listeners and don't reference `MouseEvent`. No changes needed in those files.

**VERIFY:**
- `pnpm typecheck` passes cleanly
- Desktop regression checklist: all 5 items above pass unchanged
- Chrome DevTools touch emulation (iPhone 12 Pro): tap cell → selected; drag right across cells → drag-select

**Dependencies:** None (first phase)

---

### P2: CSS touch targets and affordances

**Goal:** Add `touch-action` CSS to allow touch drag while preserving native vertical scroll. Add 44px touch targets. Make hover affordances permanently visible on touch.

**TEST first:**
- Chrome DevTools touch emulation: confirm vertical scroll is currently blocked on the grid (no `touch-action` — browser intercepts)
- Confirm fill handle is invisible without mouse hover

**IMPL:**
1. `vibegridx.css` — `.vibegridx-container`: append `touch-action: pan-y; -webkit-overflow-scrolling: touch;`
2. `vibegridx-cells.css` — `.vibegridx-fill-handle`:
   ```css
   touch-action: none;
   position: relative;
   ```
   And add `::after` pseudo-element:
   ```css
   .vibegridx-fill-handle::after {
     content: '';
     position: absolute;
     top: -10px;
     bottom: -10px;
     left: -20px;
     right: -20px;
   }
   ```
3. `vibegridx.css` (or wherever `.vibegridx-resize-handle` is defined) — add `touch-action: none` and same `::after` 44px hit area pattern
4. `affordances.css` — `[data-affordance="drag-handle"]`: append `touch-action: none;`
5. `affordances.css` — add `@media (hover: none)` block (see B6 for full CSS)

**VERIFY:**
- Touch emulation: vertical scroll works on cell area (pan-y)
- Touch emulation: fill handle dot is visible without hover (hover: none media)
- Touch emulation: fill handle drag initiates, does not scroll
- Desktop: all hover affordance behavior unchanged (hover: none does not apply)

**Dependencies:** P1 (pointer event handlers must be wired to receive the touch events that CSS now permits)

---

### P3: Kanban dnd-kit migration

**Goal:** Replace HTML5 Drag API with @dnd-kit. Fixes Kanban touch drag (currently completely broken on mobile).

**TEST first (desktop baseline):**
- Drag a Kanban card from column A to column B with mouse — card moves
- Click (no drag) a Kanban card — detail opens
- Document the exact sequence of `KanbanViewStore` calls during a full drag

**IMPL:**

`KanbanBoard.tsx`:
1. Add imports: `DndContext, DragEndEvent, DragOverEvent, DragStartEvent, PointerSensor, TouchSensor, useSensor, useSensors` from `@dnd-kit/core`
2. Create sensors:
   ```tsx
   const sensors = useSensors(
     useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
     useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
   )
   ```
3. Add handlers:
   ```tsx
   const handleDndStart = (event: DragStartEvent) => {
     const cardId = event.active.id as string
     const columnId = event.active.data.current?.columnId as string
     kanbanStore.startDrag(cardId, columnId)
   }
   const handleDndOver = (event: DragOverEvent) => {
     kanbanStore.updateDragTarget(event.over?.id as string ?? null)
   }
   const handleDndEnd = async (event: DragEndEvent) => {
     if (event.over) {
       kanbanStore.updateDragTarget(event.over.id as string)
       await kanbanStore.endDrag()
     } else {
       kanbanStore.cancelDrag()
     }
   }
   ```
4. Wrap return JSX: `<DndContext sensors={sensors} onDragStart={handleDndStart} onDragOver={handleDndOver} onDragEnd={handleDndEnd}>`
5. Remove: `handleCardDragStart`, `handleCardDragEnd`, `handleDragOver`, `handleDragLeave`, `handleDrop`
6. Remove HTML5 drag props from `<KanbanColumn>` calls

`KanbanCard.tsx`:
1. Import `useDraggable` from `@dnd-kit/core`
2. Add inside component:
   ```tsx
   const { attributes, listeners, setNodeRef, isDragging: dndIsDragging } = useDraggable({
     id: card.id,
     data: { columnId: card.columnId },
     disabled: !enableDragAndDrop,
   })
   ```
3. Replace `draggable`, `onDragStart`, `onDragEnd` HTML5 attributes on `<Card>` with `ref={setNodeRef} {...listeners} {...attributes}`
4. Use `dndIsDragging` for the existing `opacity-50 shadow-lg rotate-2 scale-105` visual
5. Remove `onDragStart`, `onDragEnd` from `KanbanCardProps` interface
6. Keep `onClick` and `onKeyDown` unchanged

`KanbanColumn.tsx`:
1. Import `useDroppable` from `@dnd-kit/core`
2. Add inside component: `const { isOver, setNodeRef: setDropRef } = useDroppable({ id: column.id })`
3. Apply `ref={setDropRef}` to the `<article>` element
4. Use `isOver` for the drag-over highlight: `(isDragOver || isOver) && 'border-primary/50 bg-primary/5 ring-2 ring-primary/20'`
5. Remove `onDragOver`, `onDragLeave`, `onDrop` from props interface and from `<article>` event handlers
6. Remove `isLocalDragOver` useState and `setIsLocalDragOver` calls

**VERIFY:**
- Desktop: drag card with mouse to another column → card moves (PointerSensor)
- Desktop: click card quickly → detail opens (onClick fires, not drag)
- Touch emulation: touch-hold card 250ms → drag to column → release → card moves (TouchSensor)
- Touch emulation: quick tap card → detail opens
- `enableDragAndDrop={false}`: no drag on mouse or touch (dnd-kit `disabled: true`)

**Dependencies:** P1 (pointer events active), P2 (touch-action CSS allows touch drag on KanbanBoard)

---

### P4: Integration testing and Safari/iOS workarounds

**Goal:** Full integration verification across all phases. Add Safari-specific workarounds for Capacitor deployment.

**IMPL (Safari/iOS workarounds only — rest is verification):**
1. In grid initialization (or a `useEffect` in `VibeGrid.tsx` mounted only once):
   ```typescript
   // Block Safari built-in pinch-zoom gesture events that conflict with column interactions
   // Applies to Capacitor WKWebView and desktop Safari
   document.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false })
   document.addEventListener('gesturechange', (e) => e.preventDefault(), { passive: false })
   document.addEventListener('gestureend', (e) => e.preventDefault(), { passive: false })
   ```
2. Verify `apps/web/index.html` has: `<meta name="viewport" content="width=device-width, initial-scale=1">` — prevents double-tap zoom interference with touch interactions

**VERIFY (full regression):**

Desktop (Chrome, no emulation):
- [ ] Cell click → selected
- [ ] Shift+click → range selected
- [ ] Drag-to-select rectangle
- [ ] Fill handle drag → fill completes
- [ ] Column resize → width changes
- [ ] Column reorder → column reorders
- [ ] Kanban card drag (mouse)
- [ ] Kanban card click → detail opens

Touch emulation (Chrome DevTools iPhone 12 Pro 390px):
- [ ] Cell tap → selected
- [ ] Drag-to-select (horizontal) → cells selected
- [ ] Fill handle tap-drag → fill completes
- [ ] Column resize drag → width changes
- [ ] Column reorder drag → column reorders
- [ ] Fill handle visible without hover
- [ ] Edit icons visible without hover
- [ ] Vertical scroll works on cell area
- [ ] Kanban card hold 250ms drag → card moves
- [ ] Kanban card quick tap → detail opens

Agent-browser screenshot:
```bash
agent-browser eval "window.__auth.signIn('ceo').then(r => JSON.stringify(r))"
agent-browser open http://localhost:$DEV_PORT/projects  # navigate to a Kanban view
# Set viewport to 375px via DevTools emulation
agent-browser screenshot /tmp/kanban-375px.png
```

**Dependencies:** P1 + P2 + P3 all complete

---

## Technical Design Notes

### Pointer Capture Pattern (applies to all drag controllers)

```typescript
private onPointerDown(e: PointerEvent): void {
  if (e.button !== 0) return // Left button / primary touch only

  this.isTracking = true
  this.startPosition = { x: e.clientX, y: e.clientY }

  // Capture ALL future pointer events to this element.
  // Critical for touch drag on small targets — without this, moving past the
  // element boundary stops receiving events.
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)

  // ... rest of existing logic unchanged (all MouseEvent properties available on PointerEvent)
}

private onPointerUp(e: PointerEvent): void {
  const el = e.currentTarget as HTMLElement
  if (el.hasPointerCapture(e.pointerId)) {
    el.releasePointerCapture(e.pointerId)
  }
  this.isTracking = false
  // ... rest of existing cleanup unchanged
}
```

### dnd-kit to KanbanViewStore Event Mapping

The `KanbanViewStore` API maps cleanly to dnd-kit events with no store changes needed:

| dnd-kit Event | KanbanViewStore Call | Data Source |
|---------------|---------------------|-------------|
| `onDragStart` | `startDrag(cardId, sourceColumnId)` | `active.id` / `active.data.current.columnId` |
| `onDragOver` | `updateDragTarget(columnId \| null)` | `over?.id ?? null` |
| `onDragEnd` (with over) | `updateDragTarget(columnId)` + `endDrag()` | `over.id` |
| `onDragEnd` (no over) | `cancelDrag()` | `over === null` |

### touch-action Strategy

```
.vibegridx-container: touch-action: pan-y
  ├── Cell body: inherits pan-y → vertical scroll native (compositor-driven)
  ├── .vibegridx-fill-handle: touch-action: none → drag captures this touch
  ├── .vibegridx-resize-handle: touch-action: none → resize captures this touch
  └── [data-affordance="drag-handle"]: touch-action: none → column reorder captures this touch
```

This strategy lets the browser handle vertical scrolling natively (smooth, momentum, rubber-band on iOS) while pointer events handle drag interactions only on designated handles.

---

## Dependencies

| Dependency | Status | Impact |
|------------|--------|--------|
| `@dnd-kit/core ^6.3.1` | Installed, currently unused | Used in P4 — zero install/bundle cost beyond what was already paid |
| `@dnd-kit/sortable ^10.0.0` | Installed, currently unused | Available for within-column card ordering (future enhancement) |
| GH#2187 Mobile Bottom Nav | Shipped | Layout layer mobile-ready; this issue completes the grid layer |
| GH#2128 Capacitor Shell | In progress | Pointer events + touch-action work in WKWebView; Safari workarounds in P5 cover edge cases |

No blocking dependencies. P1 can begin immediately on current codebase.

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| MouseController desktop regression | High — breaks all grid interactions for all users | Full desktop regression checklist in P1 VERIFY. `PointerEvent extends MouseEvent` so all property accesses are unchanged; primary risk is listener registration. |
| Kanban card click fires drag on mobile | Medium — card details unreachable | dnd-kit `TouchSensor` 250ms delay; test explicitly with quick-tap vs hold-drag |
| `touch-action: pan-y` blocks diagonal drag-to-select | Low-Medium — touch drag-select ambiguous | Documented known limitation; horizontal drag-select (most common) works. Vertical drag fires scroll (expected). |
| `setPointerCapture` on wrong element | Medium — drag tracking broken | Follow GanttBar.tsx pattern exactly: capture on `e.currentTarget`, not `e.target` |
| iOS back-swipe (10px edge) triggers column interactions | Low | Column headers and resize handles are not at the leftmost 10px of screen edge; Capacitor may handle edge swipes at the native layer |
| dnd-kit `TouchSensor` 250ms feels too slow | Low UX | 250ms is iOS HIG standard; configurable at call site if user feedback requests shorter |
| Kanban cards are virtualized (`@tanstack/react-virtual`) | Low-Medium | dnd-kit `useDraggable` refs re-register on remount when cards scroll in/out of virtual window. Verify `overscan` is sufficient for drag interactions. If a card being dragged gets virtualized away, the drag should cancel gracefully. |
| HoverTracker receiving touch pointerenter/pointerleave | Low — incorrect hover state on touch | `if (e.pointerType !== 'mouse') return` guard in HoverTracker handlers; touch uses `:active` affordances via CSS |
| Safari `gesturestart` event conflicts with column interactions | Low-Medium (Capacitor only) | P5 adds `gesturestart/change/end` preventDefault handlers; same pattern used by tldraw |
