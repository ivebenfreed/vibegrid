---
date: 2026-03-27
topic: tldraw touch/pointer architecture — patterns for VIbeGrid #2219
status: complete
github_issue: 2219
---

# Research: tldraw's Touch Architecture & What VIbeGrid Should Steal

## Context

VIbeGrid's touch support was reverted in `1d3a86739` after 6 incremental hotfixes broke mouse selection while trying to add touch. The user specifically asked to study tldraw because "their touch drawing works perfectly and seems to match 1:1 with drawing selection and drag handler fills."

This research dissects tldraw's actual implementation to extract patterns for #2219.

## Questions Explored

1. How does tldraw's state machine disambiguate touch gestures?
2. What's the CSS `touch-action` strategy?
3. How does tldraw's "drawing" mode map to VIbeGrid's selection fill / drag?
4. Why did our hotfixes fail, and what would tldraw's approach solve?

---

## Findings

### 1. tldraw's Core Architecture: Hierarchical State Machine

tldraw routes ALL input through a **hierarchical state machine** where tools are top-level states:

```
DOM Events → useCanvasEvents (normalize) → editor.dispatch() → Root StateNode → Active Tool → Active Child State
```

The `StateNode` class is the foundation:
- **`type`**: `'root' | 'branch' | 'leaf'`
- **`children`**: optional map of child StateNodes
- **`transition(id)`**: move to a new active child state

Every tool (draw, select, hand, eraser) is a StateNode with child states. Events flow from root down through active children. Each state can handle or pass events.

### 2. The Idle → Pointing → Active Pattern (THE KEY INSIGHT)

Every tldraw tool uses the same three-state pattern:

```
┌──────┐  pointerdown  ┌──────────┐  move > threshold  ┌──────────┐
│ Idle │ ────────────→ │ Pointing │ ──────────────────→ │ Dragging │
└──────┘               └──────────┘                     └──────────┘
                            │                                │
                        pointerup                        pointerup
                        (= click)                        (= complete)
                            │                                │
                            ▼                                ▼
                       ┌──────┐                         ┌──────┐
                       │ Idle │                         │ Idle │
                       └──────┘                         └──────┘
```

**Pointing is the disambiguation state.** It's the dead zone before committing to any gesture. The key:
- **On pointerdown** → always transition to Pointing (store target, coordinates)
- **On pointermove in Pointing** → if distance > threshold → transition to the active state (Drawing, DragSelecting, Translating, etc.)
- **On pointerup in Pointing** → it was a click, not a drag → handle as click, return to Idle

**Critical: Pointing provides IMMEDIATE visual feedback.** The select tool feels just as instant as the draw tool because entering the Pointing state immediately shows selection highlights, handles, etc. The dead zone only gates the *drag commitment* (translating, brushing), not the visual response. The user sees "I touched this shape, it's selected" while the engine quietly waits to determine click vs drag. This separation of feedback from commitment is what makes everything feel instant despite the dead zone.

**Threshold is input-aware:**
- Mouse: 4px (`dragDistanceSquared: 16`)
- Touch (coarse pointer): 6px (`coarseDragDistanceSquared: 36`)
- UI toolbar on touch: 25px (`uiCoarseDragDistanceSquared: 625`) — "really easy to accidentally drag from the toolbar on mobile"
- Pen: different behavior (can skip Pointing in some tools)

**This is exactly what VIbeGrid needs.** The failed hotfixes tried to implement this ad-hoc with boolean flags — and worse, they *deferred the selection itself* (`deferredCellInfo`) to avoid committing to the wrong gesture. tldraw shows the right approach: commit visual feedback immediately, only defer the drag action. If the gesture turns out to be a scroll, undo the highlight — but that almost never happens because the threshold is so small.

### 3. CSS `touch-action: none` — The Nuclear Option That Works

tldraw's CSS strategy is brutal and effective:

```css
.tl-canvas {
  touch-action: none;    /* Browser handles NOTHING */
  contain: strict;
  overflow: clip;
}

.tl-container,
.tl-container * {
  -webkit-touch-callout: none;
  -webkit-tap-highlight-color: transparent;
  user-select: none;
}
```

**`touch-action: none` on the canvas** means:
- Browser never initiates scroll, zoom, or any touch gesture
- Browser never fires `pointercancel` (because it never tries to take over)
- ALL touch events flow to JavaScript as pointer events
- The app handles everything: drawing, panning, zooming

**This is why tldraw's touch "just works"** — there's no disambiguation conflict between browser and app because the browser is completely out of the picture.

### 4. JavaScript Pointer Event Handling

In `useCanvasEvents.ts`:

```typescript
// onTouchStart: unconditionally preventDefault
function onTouchStart(e) {
  preventDefault(e)  // Prevent ALL browser touch behaviors
}

// onPointerDown: capture pointer to lock events to canvas
setPointerCapture(e.currentTarget, e)

// onPointerUp: release capture
releasePointerCapture(e.currentTarget, e)
```

**Key details:**
- `onPointerMove` is attached to `document.body`, not the canvas — ensures tracking even when pointer moves over floating UI
- `setPointerCapture()` on pointerdown ensures all subsequent events go to the canvas
- Coalesced events (`getCoalescedEvents()`) used for drawing fidelity (except iOS where they're buggy)
- Events are batched per tick via `_flushEventsForTick` for performance

### 5. Click Detection: Separate State Machine

tldraw's click detection runs in parallel to the gesture state machine:

```
idle → pendingDouble → pendingTriple → pendingQuadruple → overflow
```

Thresholds:
- First click window: **450ms**
- Subsequent clicks: **200ms**
- Max distance between clicks: **40px screen space**

This separation means clicks and drags are never confused — the click detector observes pointer up/down timing, while the tool state machine handles drag distance.

### 6. Pen Mode: Input Type Discrimination

tldraw explicitly discriminates input types:
- `pointerType === 'pen'`: pressure between 0-0.5 or 0.5-1 (exclusive)
- `pointerType === 'touch'`: exactly 0.5 pressure
- `pointerType === 'mouse'`: exactly 0.5 pressure

When pen mode is active, finger touches can be redirected to panning instead of drawing. This is opt-in, not automatic.

---

## The VIbeGrid Problem: Why Our Hotfixes Failed

### The Root Cause

VIbeGrid's container has `touch-action: pan-y` — telling the browser "you handle vertical scroll, I'll handle horizontal." This creates an irreconcilable conflict:

1. User touches a cell and starts moving (intent: drag-to-select)
2. Browser sees `touch-action: pan-y` and monitors for vertical scroll
3. If any vertical movement detected, browser fires `pointercancel` and takes over scrolling
4. Our JS never gets enough `pointermove` events to reach the 8px drag threshold
5. Drag-to-select fails on touch

**`touch-action` is evaluated at pointerdown time** and cannot be changed mid-gesture. The hotfixes that tried to set `touch-action: none` dynamically were too late.

### Why Boolean Flags Don't Work

The hotfixes added flags (`isTouchPointer`, `deferredCellInfo`, `lastPointerX/Y`) to the MouseController. This created combinatorial complexity:

- `isDragging && isTouchPointer && !isColumnDrag && distance > threshold && dy < dx * 1.5`
- Every new condition multiplied the edge cases
- Mouse behavior broke because the flags leaked across input types

### What tldraw Does Differently

tldraw avoids this entirely:
1. **`touch-action: none`** — browser never interferes, so no `pointercancel`
2. **State machine** — each state has clean, isolated handlers (no boolean soup)
3. **Pointer capture** — events are locked to the target element
4. **Input-type-aware thresholds** — different dead zones for touch vs mouse

---

## Recommendations for VIbeGrid

### Option A: Full tldraw Pattern (Recommended)

**Strategy:** `touch-action: none` on the grid body + JS-managed scrolling

| Aspect | Current | Proposed |
|--------|---------|----------|
| Vertical scroll | Browser-native (`pan-y`) | JS-managed (translateY or scrollTop) |
| Horizontal scroll | JS-managed | JS-managed (no change) |
| Touch-action | `pan-y` on container | `none` on grid body |
| Gesture disambiguation | Boolean flags | State machine |
| Pointer events | mousedown/mousemove/mouseup | pointerdown/pointermove/pointerup |

**Pros:**
- Eliminates `pointercancel` — the root cause of all hotfix failures
- Clean state machine replaces boolean flag soup
- Matches tldraw's proven pattern exactly
- Pointer capture ensures reliable drag tracking
- Unified code path for mouse + touch + pen

**Cons:**
- Must implement JS scrolling (momentum, overscroll, rubber-band)
- Loses native scroll physics (but we can approximate with springs)
- Larger initial implementation scope

**Mapping tldraw → VIbeGrid:**

| tldraw Concept | VIbeGrid Equivalent |
|---------------|---------------------|
| Draw tool → Idle/Pointing/Drawing | Selection fill → Idle/Pointing/Filling |
| Select tool → Idle/Pointing/DragSelect | Drag-to-select → Idle/Pointing/DragSelecting |
| Hand tool → Idle/Panning | Scroll → Idle/Pointing/Scrolling |
| Move tool → Idle/Pointing/Translating | Row/column drag → Idle/Pointing/Dragging |

The **Pointing** state is the key — it's where VIbeGrid would decide:
- Short distance + pointerup → tap (click/select cell)
- Move > threshold, primarily horizontal → drag-select or fill
- Move > threshold, primarily vertical → scroll (programmatic)
- Move on drag handle → row/column reorder

**The Pointing state MUST provide immediate feedback:**
```
pointerdown on cell
  → IMMEDIATELY: highlight cell, show selection feedback (enter Pointing)
  → DEFER: whether this becomes drag-select, fill, or scroll
  → pointerup without exceeding threshold = it was a tap (already looks right)
  → pointermove past threshold = commit to drag/fill/scroll
  → if scroll: undo the highlight (rare — threshold is tiny)
```
This is the opposite of what the reverted hotfixes did (deferring selection via `deferredCellInfo`). Commit visual feedback immediately, only defer the drag commitment.

### Option B: Selective `touch-action: none` (Compromise)

**Strategy:** `touch-action: none` only on cells that need drag interaction, `pan-y` elsewhere

```css
.vibegridx-cell[data-editable] { touch-action: none; }  /* Cells that support fill/drag */
.vibegridx-header { touch-action: none; }                /* Headers for resize/reorder */
.vibegridx-viewport { touch-action: pan-y; }             /* Container keeps native scroll */
```

**Pros:**
- Keeps native scroll physics on the viewport
- Smaller implementation scope

**Cons:**
- `touch-action` is checked up the ancestor chain — **the most restrictive value wins**. If a cell has `none` but its ancestor viewport has `pan-y`, the intersection may not work as expected (browser-dependent).
- Still need the state machine for gesture disambiguation within cells
- Edge case: user starts drag on a `none` cell, moves over a `pan-y` area — what happens?

**Verdict:** Fragile. The CSS spec says `touch-action` is checked at pointer-down time on the touched element AND all its ancestors. Having mixed values in a scrollable container is asking for trouble.

### Option C: Timer-Based Disambiguation (Avoid)

**Strategy:** On touch, start a 100-150ms timer. If user moves before timer fires, it's scroll. If timer fires without movement, lock in as "interaction mode."

**Pros:** Simple concept

**Cons:**
- Adds perceptible latency to ALL touch interactions
- Feels sluggish (tldraw specifically avoids timers for this reason)
- Still doesn't solve pointercancel if user moves before timer

---

## Architectural Sketch: VIbeGrid Gesture Engine (Option A)

```typescript
// GestureEngine replaces MouseController
class GestureEngine {
  private state: GestureState = new IdleState(this)

  transition(newState: GestureState) {
    this.state.onExit()
    this.state = newState
    this.state.onEnter()
  }

  // Attached to container with touch-action: none
  onPointerDown(e: PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId)
    this.state.onPointerDown(e)
  }

  // Attached to document.body for global tracking
  onPointerMove(e: PointerEvent) {
    this.state.onPointerMove(e)
  }

  onPointerUp(e: PointerEvent) {
    e.currentTarget.releasePointerCapture(e.pointerId)
    this.state.onPointerUp(e)
  }
}

// States
class IdleState {
  onPointerDown(e) {
    this.engine.transition(new PointingState(this.engine, e))
  }
}

class PointingState {
  private origin: { x: number; y: number }
  private target: CellInfo | null
  private pointerId: number

  constructor(engine, e: PointerEvent) {
    this.origin = { x: e.clientX, y: e.clientY }
    this.target = resolveCellFromEvent(e)
    this.pointerId = e.pointerId
  }

  onPointerMove(e) {
    const dx = e.clientX - this.origin.x
    const dy = e.clientY - this.origin.y
    const distance = Math.sqrt(dx * dx + dy * dy)
    const threshold = e.pointerType === 'touch' ? 12 : 8

    if (distance < threshold) return  // Dead zone

    // Disambiguate based on movement direction + target
    if (this.target?.isFillHandle) {
      this.engine.transition(new FillDragState(this.engine, this.target, this.origin))
    } else if (this.target?.isDragHandle) {
      this.engine.transition(new RowDragState(this.engine, this.target))
    } else if (Math.abs(dy) > Math.abs(dx) * 1.5) {
      // Primarily vertical → scroll
      this.engine.transition(new ScrollState(this.engine, this.origin))
    } else {
      // Primarily horizontal or diagonal → drag-select
      this.engine.transition(new DragSelectState(this.engine, this.target, this.origin))
    }
  }

  onPointerUp(e) {
    // Distance < threshold → it was a tap
    if (this.target) {
      handleCellTap(this.target, e)
    }
    this.engine.transition(new IdleState(this.engine))
  }
}

class ScrollState {
  onPointerMove(e) {
    // Programmatic scroll — apply velocity
    const dy = e.clientY - this.lastY
    this.viewport.scrollTop -= dy
    this.lastY = e.clientY
  }

  onPointerUp(e) {
    // Apply momentum/deceleration
    this.startMomentumScroll(this.velocity)
    this.engine.transition(new IdleState(this.engine))
  }
}
```

### JS Scroll Implementation Notes

The main cost of Option A is implementing scroll. Fortunately:
- VIbeGrid **already has JS horizontal scroll** — the viewport manages `scrollLeft` programmatically
- Vertical scroll just needs the same treatment for `scrollTop`
- Momentum scrolling: track last N pointermove deltas, compute velocity on pointerup, decelerate with requestAnimationFrame
- Libraries like `impetus` or `kinetic` can handle the physics if needed (<2KB)
- iOS rubber-band effect: optional, can clamp to bounds initially

---

## Open Questions

1. **Two-finger pinch-to-zoom**: Does VIbeGrid need zoom? If not, `touch-action: none` is clean. If yes, need `useGestureEvents` equivalent.
2. **Momentum scroll feel**: How important is matching iOS native scroll physics? A basic linear deceleration may be "good enough."
3. **Accessibility**: Does `touch-action: none` affect any assistive technology? (Research says no — AT uses its own event handling.)

## Next Steps

1. Write spec for #2219 using Option A architecture
2. Phase 0: Migrate MouseController from mouse events → pointer events (no behavior change)
3. Phase 1: Implement GestureEngine state machine (Idle/Pointing/Active)
4. Phase 2: Set `touch-action: none` + implement JS vertical scroll
5. Phase 3: Wire fill-drag, row-drag, column-resize through state machine
6. Phase 4: Touch-specific UX polish (larger hit targets, haptic feedback on iOS)

---

## Sources

- tldraw source: `packages/editor/src/lib/editor/StateNode.ts`, `editor.css`, `useCanvasEvents.ts`
- tldraw docs: https://tldraw.dev/docs/tools, https://tldraw.dev/sdk-features/click-detection
- MDN: https://developer.mozilla.org/en-US/docs/Web/CSS/touch-action
- Patrick H. Lauke: "Getting Touchy" — pointer events best practices
- VIbeGrid source: `apps/web/src/systems/vibegrid/renderers/modules/MouseController.ts`
- Reverted commits: `1d3a86739`, `cdc5fdf8c`, `1ed71693b`, `5fe37b42f`, `701fe3e75`
