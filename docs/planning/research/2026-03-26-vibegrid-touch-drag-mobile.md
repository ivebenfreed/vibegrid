---
date: 2026-03-26
topic: VIbeGrid Touch & Drag for Mobile
status: complete
github_issue: null
---

# Research: VIbeGrid Touch & Drag for Full Mobile Use

## Context

VIbeGrid is the core data grid system in Baseplane. Recent work (GH#2187) added mobile bottom navigation and thumb-zone layout, and the Capacitor native shell (GH#2128) is in progress. The missing piece: **VIbeGrid itself has virtually no touch interaction support**. This research identifies the gaps and evaluates options for full mobile usability.

## Questions Explored

1. What touch/drag patterns does VIbeGrid currently support?
2. What gaps exist for full mobile usability?
3. How do other grids (AG Grid) and libraries (dnd-kit, use-gesture) handle touch?
4. What's the recommended approach for Baseplane?

---

## Findings

### Current State — VIbeGrid Touch Support

| Interaction | Implementation | Touch Support | File |
|---|---|---|---|
| Cell click/select | `MouseController` (mouse events) | None | `vibegrid/renderers/modules/MouseController.ts` |
| Drag-to-select cells | `DragSelectionController` (mouse) | None | `vibegrid/renderers/modules/DragSelectionController.ts` |
| Fill handle drag | `FillDragController` (mouse) | None | `vibegrid/renderers/modules/FillDragController.ts` |
| Column resize | `ColumnResizeOverlayDOM` (mouse) | None | `vibegrid/overlays/ColumnResizeOverlayDOM.ts` |
| Column reorder | `ColumnDragOverlayDOM` (mouse) | None | `vibegrid/overlays/ColumnDragOverlayDOM.ts` |
| Kanban card drag | HTML5 Drag API | **Broken** — HTML5 DnD has no native touch support | `vibegrid/components/kanban/KanbanCard.tsx` |
| Gantt bar drag | **Pointer Events** | **Partial** — pointer events work on touch, but hover affordances break | `vibegrid/components/GanttBar.tsx` |
| Row hover | `HoverTracker` (mouse) | None — no hover concept on touch | `vibegrid/renderers/modules/HoverTracker.ts` |
| Cell affordances | CSS `:hover` selectors | **Invisible** on touch | `vibegrid/styles/affordances.css` |

**Central Problem:** `MouseController` (41KB, the interaction coordinator) uses `mousedown/mousemove/mouseup` globally. No `touch*` or `pointer*` events. This is the single biggest blocker.

### CSS Gaps

- **No `touch-action` CSS** anywhere in VIbeGrid — browser will intercept all touch gestures for scrolling, preventing any drag interactions
- **No `-webkit-overflow-scrolling: touch`** for momentum scrolling
- **No mobile media queries** in grid styles (except GhostRowPortal width check)
- **No touch target sizing** — cells and handles lack 44px minimum recommended by Apple / 48px by Google
- **Hover-dependent affordances** (link underlines, fill handles, dependency nodes, badge scale) are invisible on touch devices

### Libraries Already Installed

| Library | Version | Status |
|---|---|---|
| `@dnd-kit/core` | ^6.3.1 | **Installed but unused** — zero imports in codebase |
| `@dnd-kit/sortable` | ^10.0.0 | Installed but unused |
| `@dnd-kit/utilities` | ^3.2.2 | Installed but unused |
| `framer-motion` | ^12.7.4 | Used for animation only, not drag |
| `embla-carousel-react` | ^8.6.0 | Carousel only |

### Bright Spot: Gantt View

`GanttBar.tsx` already uses `React.PointerEvent` for bar move, resize-start, resize-end, and dependency drag. Pointer events are the **correct cross-platform approach** (work on mouse, touch, and stylus). This pattern should be the template for all other interactions.

---

## External Research

### AG Grid's Touch Approach

- Custom drag implementation (not native HTML5 DnD) for finer control
- **Long-press (500ms)** to open column menus on touch
- Column resize via tap-and-drag on resize handles
- Recommends `<meta name="viewport" content="width=device-width, initial-scale=1" />` to prevent double-tap zoom
- `suppressTouch` option to disable all touch handling
- Does NOT document scroll-vs-drag disambiguation

### dnd-kit (Already Installed)

- Built-in **Pointer, Mouse, Touch, and Keyboard sensors**
- Touch sensor uses configurable activation delay (long-press threshold)
- ~10KB core, no external dependencies
- Supports grids, lists, multiple containers, virtualized lists
- **Recommended for Kanban card drag** — replaces broken HTML5 DnD API
- Handles `touch-action` automatically on draggable elements

### @use-gesture

- Unified hook for drag, swipe, pinch, long-press, scroll gestures
- `touchAction` option built-in to prevent scroll interference
- `swipe.duration` threshold for swipe vs drag disambiguation
- Good for **cell-level gesture detection** (swipe-to-action, long-press-to-select)
- Not a full DnD solution — complements dnd-kit

### Pragmatic Drag and Drop (Atlassian)

- Built on native browser DnD — **same touch problems as HTML5 API**
- Community reports: touch is unreliable, long-press delay feels too long
- Not recommended for VIbeGrid mobile

### Mobile UX Patterns (Industry)

| Gesture | Use Case | Disambiguation |
|---|---|---|
| Tap | Cell click, navigation | Default — no conflict |
| Long-press (300-500ms) | Selection mode, context menu | Delay distinguishes from tap |
| Horizontal swipe | Swipe-to-action (delete, archive) | `touch-action: pan-y` on swipeable rows |
| Vertical scroll | List scrolling | Default browser behavior |
| Drag (via handle) | Row reorder, card move | `touch-action: none` on handle ONLY |
| Pinch | Column zoom (optional) | `touch-action: pinch-zoom` |

**Key principle:** Only apply `touch-action: none` to drag handles, not to the entire grid. Otherwise users can't scroll.

---

## Recommendations

### Option A: Pointer Event Migration (Recommended)

**Migrate MouseController from mouse events to pointer events.** This is the highest-impact, lowest-risk change.

| Aspect | Details |
|---|---|
| **Effort** | Medium — MouseController is 41KB but the event API is nearly identical |
| **Risk** | Low — pointer events are a superset of mouse events |
| **Coverage** | All table interactions: click, drag-select, fill handle, hover proxy |
| **Touch benefit** | Immediate touch support for all core table interactions |

**Steps:**
1. Replace `mousedown → pointerdown`, `mousemove → pointermove`, `mouseup → pointerup`
2. Add `touch-action: none` to drag handle elements only
3. Replace HoverTracker with pointer-based approach (or disable hover affordances on touch)
4. Add `setPointerCapture()` for reliable drag tracking across element boundaries
5. Add 44px minimum touch targets for resize handles and fill handles

### Option B: dnd-kit for Kanban (Recommended — Do in Parallel)

**Replace HTML5 DnD in Kanban with @dnd-kit** (already installed, zero migration cost for deps).

| Aspect | Details |
|---|---|
| **Effort** | Low-Medium — KanbanCard + KanbanColumn + KanbanBoard |
| **Risk** | Low — dnd-kit is well-tested, already a dependency |
| **Coverage** | Kanban card drag between columns |
| **Touch benefit** | Full touch support via dnd-kit's touch sensor |

### Option C: @use-gesture for Swipe Actions (Future)

**Add swipe-to-action on table rows** for mobile-first quick actions (archive, delete, status change).

| Aspect | Details |
|---|---|
| **Effort** | Medium — new gesture layer, new UI components |
| **Risk** | Medium — gesture conflicts with horizontal scroll |
| **Coverage** | Row-level quick actions on mobile |
| **Touch benefit** | iOS/Android native feel |

**Defer until Options A+B are complete.** Requires `@use-gesture/react` (new dependency).

### Option D: Column Resize/Reorder Touch (Part of Option A)

`ColumnResizeOverlayDOM` and `ColumnDragOverlayDOM` use raw DOM mouse events. Migrate to pointer events as part of Option A.

**Special consideration:** Column resize handles need **enlarged touch targets** (invisible hit areas extending 20px beyond the visible 2px border).

---

## Priority Order

1. **Option A** — Pointer event migration in MouseController (unlocks 80% of touch interactions)
2. **Option B** — dnd-kit for Kanban (fixes the most broken touch experience)
3. **Option D** — Column resize/reorder touch targets (part of A, but may need extra sizing work)
4. **Option C** — Swipe actions (future enhancement, not a blocker)

## Additional CSS Changes Needed

```css
/* Grid container — allow vertical scroll, capture horizontal drag */
.vibegrid-container {
  touch-action: pan-y;
  -webkit-overflow-scrolling: touch;
}

/* Drag handles — prevent all browser gestures */
[data-affordance="drag-handle"] {
  touch-action: none;
}

/* Resize handles — enlarged touch target */
.column-resize-handle {
  min-width: 44px;
  /* Visual width stays 2px, touch area extends via padding/margin */
}

/* Replace hover with active/focus-visible for touch */
@media (hover: none) {
  [data-affordance="navigate"]:active {
    text-decoration: underline;
  }
  .fill-handle {
    /* Always visible on touch — no hover to reveal */
    opacity: 1;
  }
}
```

## Reference Implementation: tldraw

tldraw is the gold standard for touch + pointer event handling in a React canvas. Their patterns are directly applicable to VIbeGrid.

### Architecture: Hierarchical State Machine

tldraw uses a **StateNode** state machine for all interactions:

```
Idle → (pointerdown) → Pointing → (pointermove > threshold) → Dragging → (pointerup) → Idle
```

- **Idle**: Waiting for input
- **Pointing**: Pointer is down but hasn't moved past drag threshold — distinguishes tap from drag
- **Dragging**: Active drag operation

Each state has handlers: `onPointerDown()`, `onPointerMove()`, `onPointerUp()`. Events flow from root → active children, each can handle or propagate.

**VIbeGrid parallel:** MouseController's sub-controllers (DragSelectionController, FillDragController) already follow this pattern implicitly, but with mouse events. Migration to pointer events would formalize this.

### Key Pattern: Pointer Capture

```typescript
// On pointerdown — capture ALL future pointer events to this element
element.setPointerCapture(e.pointerId)

// On pointerup — release capture
element.releasePointerCapture(e.pointerId)
```

**Why this matters:** Without pointer capture, if a user drags fast and the pointer leaves the element, events stop. With capture, the element receives ALL pointer events until release — critical for reliable touch drag on small grid cells.

tldraw attaches `pointermove` to `document.body` (not the canvas) as a belt-and-suspenders approach. They also deduplicate: `if (e.clientX === lastX && e.clientY === lastY) return`.

### Key Pattern: Touch Event Prevention

```typescript
// On touchstart — prevent browser zoom/scroll
onTouchStart(e) {
  e.preventDefault()  // Block browser gestures
}

// On touchend — selective prevention
onTouchEnd(e) {
  // Allow default for: editing inputs, anchor tags, keyboard-capturable elements
  // Prevent default for everything else
  if (!isEditingShape && !isAnchor && !isInput) {
    e.preventDefault()
  }
}
```

**VIbeGrid application:** Grid cells that are in edit mode should allow default touch behavior (keyboard, text selection). Non-editing cells should prevent default to avoid browser scroll/zoom interference.

### Key Pattern: Pinch Gesture Disambiguation

tldraw's `useGestureEvents` tracks a `pinchState` with three values:

| State | Condition | Action |
|---|---|---|
| `"not sure"` | Initial two-finger contact | Wait for movement |
| `"zooming"` | Finger distance > 24px | Trigger zoom (distance-based) |
| `"panning"` | Midpoint displacement > 16px | Trigger pan (position-based) |

Transition from "panning" → "zooming" requires 64px (higher threshold prevents accidental zoom during pan).

They track: `initPointBetweenFingers`, `prevPointBetweenFingers`, `initDistanceBetweenFingers`, `currDistanceBetweenFingers`.

**VIbeGrid application:** For horizontal scroll vs column resize disambiguation — similar threshold-based state machine. Single finger horizontal = scroll. Two fingers = zoom/pinch. Single finger on resize handle = column resize.

### Key Pattern: Safari/iOS Workarounds

- **Double-tap zoom prevention:** Dedicated `useFixSafariDoubleTapZoomPencilEvents` hook
- **Coalesced events:** `e.getCoalescedEvents()` for smoother pen input, but **disabled on iOS** where support is inconsistent
- **Edge touch prevention:** 10px threshold on screen edges to block iOS back-swipe navigation
- **Gesture events:** Document-level `gesturestart/gesturechange/gestureend` handlers with `preventDefault()` to block Safari's built-in pinch zoom

### Key Pattern: Pen Mode

```typescript
if (editor.getInstanceState().isPenMode && e.pointerType !== 'pen') return
```

When a pen is detected, touch events are ignored — prevents palm rejection issues. VIbeGrid could use a simpler version: detect `e.pointerType` to adjust behavior (pen = precise, touch = larger hit areas).

### What tldraw Does NOT Do (and VIbeGrid doesn't need)

- No `touch-action` CSS (they preventDefault everything instead — full canvas takeover)
- No native scroll (canvas handles all panning)
- No long-press detection (tools are toolbar-selected, not gesture-activated)

**VIbeGrid differs here:** The grid MUST preserve native vertical scroll. So we can't do `preventDefault` on all touch events like tldraw does. We need `touch-action: pan-y` on the grid container to let the browser handle vertical scroll while we handle horizontal interactions.

### Summary: Patterns to Adopt from tldraw

| Pattern | tldraw | VIbeGrid Adaptation |
|---|---|---|
| Pointer events (not mouse) | All interactions via `onPointerDown/Move/Up` | Migrate MouseController |
| Pointer capture | `setPointerCapture` on drag start | Add to all drag controllers |
| pointermove on body | Attached to `document.body` | Same — prevents lost drags |
| Move deduplication | Skip if `clientX === lastX` | Add to MouseController |
| State machine | Idle → Pointing → Dragging | Formalize existing sub-controllers |
| Pinch disambiguation | Threshold-based state: not-sure/zooming/panning | Adapt for scroll/resize/drag |
| Selective preventDefault | Block on canvas, allow on inputs | Block on grid cells, allow on edit mode |
| Pen detection | `e.pointerType === 'pen'` filter | Use for precision vs touch target sizing |
| Safari workarounds | Edge touch, double-tap, gesture events | Same — especially for Capacitor iOS |

## Open Questions

- Should long-press trigger cell editing or selection mode on mobile? (AG Grid uses long-press for column menu)
- Should horizontal swipe on a row trigger actions, or should it scroll the grid horizontally?
- Does the Capacitor WebView (GH#2128) handle pointer events differently than mobile Safari/Chrome?
- Should we add a `@media (hover: none)` global mode that switches all hover affordances to tap/active?

## Sources

- [tldraw GitHub](https://github.com/tldraw/tldraw) — Gold standard for touch/pointer event handling in React
- [tldraw Tools Docs](https://tldraw.dev/docs/tools) — State machine pattern (Idle → Pointing → Dragging)
- [tldraw Event Handling (DeepWiki)](https://deepwiki.com/tldraw/tldraw/3.3-asset-management) — Architecture overview
- [tldraw useCanvasEvents](https://github.com/tldraw/tldraw/blob/main/packages/editor/src/lib/hooks/useCanvasEvents.ts) — Pointer capture, touch prevention
- [tldraw useGestureEvents](https://github.com/tldraw/tldraw/blob/main/packages/editor/src/lib/hooks/useGestureEvents.ts) — Pinch disambiguation
- [AG Grid Touch Documentation](https://www.ag-grid.com/javascript-data-grid/touch/)
- [dnd-kit Documentation](https://docs.dndkit.com/)
- [@use-gesture Documentation](https://use-gesture.netlify.app/docs/extras/)
- [MDN touch-action CSS](https://developer.mozilla.org/en-US/docs/Web/CSS/touch-action)
- [MDN setPointerCapture](https://developer.mozilla.org/en-US/docs/Web/API/Element/setPointerCapture)
- [Pragmatic DnD Touch Discussion](https://github.com/atlassian/pragmatic-drag-and-drop/discussions/93)
