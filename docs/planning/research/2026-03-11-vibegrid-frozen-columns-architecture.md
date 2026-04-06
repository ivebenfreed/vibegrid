# VibGrid Frozen Columns — Architecture Research

**Date:** 2026-03-11
**Status:** Research complete, needs spec before implementation
**Reverted in:** `8594e31a2` (removed all 12 frozen column commits)

## Problem Statement

Users need to pin/freeze columns in VibGrid so they remain visible during horizontal scrolling. Three implementation attempts were made and all failed with cascading regressions. This document records what was tried, why each approach failed, and the recommended architecture.

---

## VibGrid's Current Architecture

Understanding the existing layout is critical to understanding why naive approaches fail.

### DOM Hierarchy

```
.vibegridx-container (position: relative, flex column)
└── .vibegridx-table-wrapper (contain: layout style)
    ├── .vibegridx-header-viewport (overflow: hidden, z-index: 1)
    │   └── .vibegridx-header (position: relative, min-width: max-content)
    │       └── .vibegridx-header-cell[] (flex items, NOT absolute)
    │
    └── .vibegridx-viewport (overflow: auto, contain: layout style paint)  ← SINGLE SCROLL CONTAINER
        └── .vibegridx-body (position: relative)
            ├── .vibegridx-row[] (position: absolute, transform: translateY)
            │   ├── .vibegridx-drag-column (30px, flex-shrink: 0)
            │   ├── .vibegridx-row-header-cell (40px, flex-shrink: 0)
            │   └── .vibegridx-cell[] (position: absolute, left: Xpx, width: Wpx)
            │
            └── [overlay containers — z-index 100-106]
```

### Key Properties

| Property | Value | Implication |
|----------|-------|-------------|
| Body cells | `position: absolute` with `left` + `width` inline | Not in document flow, no CSS Grid/sticky |
| Row positioning | `transform: translateY(offset)` | GPU-accelerated vertical placement |
| Scroll container | Single `.vibegridx-viewport` with `overflow: auto` | Both H+V scroll in one element |
| Header sync | `translateX(-scrollLeft)` on header viewport | JS-driven, runs on scroll event |
| Column virtualization | Binary search for visible range + 4-col buffer | Only renders visible columns |
| Deferred rendering | First 6 columns immediate, rest via `requestIdleCallback` | Frozen columns must be "essential" |
| CSS containment | `contain: layout style paint` on viewport and rows | Prevents layout cascading |

### Z-Index Hierarchy (`grid-dimensions.ts`)

```
TABLE_CONTENT:   1
OVERLAYS:        100
CLIPBOARD:       100
SELECTION:       101
FILL_PREVIEW:    102
FILL_HANDLE:     103
EDITING:         104
DRAG_PREVIEW:    105
CONTEXT_MENU:    106
```

### System Column Widths

- Drag handle: 30px (`DRAG_COLUMN_WIDTH`)
- Row header: 40px (`ROW_HEADER_WIDTH`)
- Content offset: 70px (`CONTENT_OFFSET_X`)

---

## Approach 1: CSS Transitions + Transform Counter-Scroll

**Commits:** `c74ec397b`, `35340e1fa`, `6b688c90d`, `3d5780bf7`, `5dd734b2a`

### What We Did

1. Added `frozenColumnCount`, `frozenColumnsWidth`, `freezeUpTo()`, `unfreezeAll()` to `VisualStateStore`
2. Added `.vibegridx-cell--frozen` CSS class to frozen cells in `BodyRenderer`
3. Applied `transform: translateX(var(--vg-scroll-left))` on frozen cells via CSS
4. Added `transition: none` to prevent slide-snap animation
5. Added MobX reaction to re-render when frozen column count changes

### Why It Failed

**Root cause: GPU compositor timing.**

When the user scrolls horizontally, the browser's GPU compositor moves the entire viewport content BEFORE the main thread JS receives the scroll event. The sequence is:

```
Frame N:   Compositor scrolls viewport → frozen cells move with content (WRONG)
Frame N+1: JS scroll handler fires → sets --vg-scroll-left → CSS transform applied → frozen cells snap back
```

This creates a **1-frame visual bounce** on every scroll tick. The frozen cells visibly jitter left then snap back. `transition: none` doesn't help because the bounce isn't from CSS transitions — it's from the compositor moving content before JS can react.

**This is a fundamental browser architecture limitation, not a bug we can fix.**

### Symptoms

- Frozen columns "bounce" or "jitter" during horizontal scroll
- Effect is most visible on high-refresh-rate displays (120Hz+)
- `will-change: transform` doesn't help because the transform is already GPU-accelerated

---

## Approach 2: Direct JS Transforms on ALL Frozen Elements

**Commits:** `7a341b51e`, `1dbd4ea10`, `3ee3a027c`

### What We Did

1. Changed `ScrollController` to query ALL frozen elements (header + body) and set `transform: translateX(scrollLeft)` directly via JS
2. Applied transforms to both `HEADER_FROZEN_SELECTORS` and `BODY_FROZEN_SELECTORS`
3. Added `will-change: transform` for GPU layer promotion
4. Fixed hover event bleed-through by removing `will-change` (was creating stacking contexts)

### Why It Failed

**Same compositor timing problem**, plus new issues:

1. **Still 1-frame bounce** — JS scroll handler runs AFTER compositor paint, same as Approach 1
2. **Z-index conflicts** — Frozen cells with transforms created new stacking contexts, causing z-index to be relative to the cell instead of the viewport. Selection overlays (z-index 101) appeared behind frozen cells
3. **Hover bleed-through** — `will-change: transform` promoted cells to GPU layers, causing pointer events to not propagate correctly to underlying elements
4. **Performance regression** — `querySelectorAll` on every scroll frame to find all frozen cells across all rows

### Symptoms

- Same jitter as Approach 1
- Selection highlight invisible behind frozen cells
- Hover effects not working on cells near frozen boundary
- Scroll performance degraded on large datasets

---

## Approach 3: Compositor-Level Sticky Pane Overlay

**Commits:** `afa243b46`, `e16d49945`, `888499166`

### What We Did

1. Created `FrozenColumnPane.ts` — a new module that inserts a `position: sticky; left: 0` element as the first child of the viewport
2. The sticky pane clones frozen cell content from body rows after each render
3. Original frozen cells in the body get `opacity: 0` (hidden but still receive pointer events)
4. `pointer-events: none` on the pane lets clicks pass through to hidden originals
5. Hover sync via `mouseover`/`mouseout` delegation on the container
6. Added opaque background (`var(--background)`) to mask scrolling content underneath
7. Raised z-index to 2000 to stay above selection overlays

### Why It Failed

**Vertical scroll broke entirely.** The sticky element's interaction with the scroll container created layout issues:

1. **Sticky + absolute children**: The inner container needed explicit `height: totalHeight` to match body height, but the sticky element's height calculation conflicted with the viewport's `contain: layout style paint`
2. **Vertical scroll sync**: The sticky element scrolls vertically with the viewport (correct), but the cloned content used absolute `transform: translateY` positioning copied from originals. When viewport scrolled vertically, the sticky pane's clones were double-offset
3. **Opaque masking**: Required `background: var(--background)` on the inner container, but this masked ALL content behind it — including row hover highlights and selection states
4. **Z-index escalation**: Started at z-index 5, but selection overlays at 100+ showed through. Raised to 2000, which then blocked context menus and editing overlays
5. **Clone staleness**: Cloned DOM elements don't update when MobX-driven cell content changes. Needed full re-clone on every body render, which was expensive

### Symptoms

- Frozen columns stuck in place horizontally (correct)
- Vertical scroll completely broken — frozen pane content static while body scrolled
- Editing overlays hidden behind frozen pane
- Selection rectangles not visible in frozen area
- Cell content in frozen pane could become stale

---

## Root Cause Analysis

All three approaches failed because of one fundamental architectural constraint:

> **VibGrid uses a single scroll container for both horizontal and vertical scrolling. Frozen columns must NOT scroll horizontally but MUST scroll vertically. You cannot selectively disable one scroll axis for elements inside a single overflow: auto container without fighting the browser's GPU compositor.**

The compositor paints the scrolled content as a single GPU texture. Any element inside the scroll container moves with the scroll. Counteracting this with JS transforms or CSS sticky creates timing mismatches, z-index conflicts, or layout model violations.

---

## How Production Grids Solve This

### AG Grid — Split Viewport Architecture

AG Grid uses **three separate DOM containers** for pinned columns:

```
┌──────────────┬──────────────────────┬──────────────┐
│ Left Pinned  │ Center               │ Right Pinned │
│ (V scroll)   │ (H+V scroll)         │ (V scroll)   │
│              │                      │              │
│ overflow-x:  │ overflow: auto       │ overflow-x:  │
│  hidden      │                      │  hidden      │
│ overflow-y:  │                      │ overflow-y:  │
│  hidden      │                      │  hidden      │
└──────────────┴──────────────────────┴──────────────┘
         ↑ scrollTop synced from center ↑
```

- Left/right pinned viewports have `overflow: hidden` (no scrollbars)
- Center viewport has `overflow: auto` (sole scroll source)
- Vertical scroll synced: `pinnedViewport.scrollTop = centerViewport.scrollTop`
- No compositor fight — pinned columns are literally outside the horizontal scroll container
- Each viewport renders its own subset of cells independently

### MUI X DataGrid / TanStack Table

Use `position: sticky` on individual cells, but these grids use **CSS Grid or `<table>` layout** where cells are in document flow. Sticky works naturally because cells participate in the layout model.

VibGrid uses absolute positioning for cells, so per-cell sticky doesn't work without rewriting the entire positioning model.

### Handsontable

Similar split-container approach to AG Grid. Separate `<table>` elements for frozen and scrollable areas, with scroll sync.

---

## Recommended Architecture: Split Viewport

**The only approach that eliminates the compositor timing problem.**

### Proposed DOM Structure

```
.vibegridx-container
└── .vibegridx-table-wrapper
    ├── .vibegridx-header-row (flex row)
    │   ├── .vibegridx-header-frozen (fixed width = system cols + frozen cols)
    │   │   └── [drag col header] [row header] [frozen col headers...]
    │   └── .vibegridx-header-viewport (overflow: hidden, flex: 1)
    │       └── .vibegridx-header (translateX for scroll sync)
    │           └── [scrollable col headers...]
    │
    └── .vibegridx-body-row (flex row)
        ├── .vibegridx-frozen-viewport (overflow: hidden, fixed width)
        │   └── .vibegridx-frozen-body (position: relative)
        │       └── .vibegridx-row[] (position: absolute, transform: translateY)
        │           ├── .vibegridx-drag-column
        │           ├── .vibegridx-row-header-cell
        │           └── .vibegridx-cell[] (frozen data cells)
        │
        └── .vibegridx-scroll-viewport (overflow: auto, flex: 1)
            └── .vibegridx-body (position: relative)
                └── .vibegridx-row[] (position: absolute, transform: translateY)
                    └── .vibegridx-cell[] (scrollable data cells)
```

### Implementation Changes Required

| Component | Change |
|-----------|--------|
| `SimplePassiveRenderer` | Create split viewport DOM structure instead of single viewport |
| `BodyRenderer` | Render each row into two containers (frozen cells + scrollable cells) |
| `HeaderRenderer` | Split header into frozen section + scrollable section |
| `ScrollController` | Sync vertical scroll from center to frozen viewport. Header sync unchanged |
| `VisualStateStore` | Add `frozenColumnRange`, `frozenColumnsWidth` computed properties |
| `OverlayManager` | Selection/editing overlays must account for split coordinates |
| `CoordinateManager` | Track cell positions across both viewports |
| Row interactions | Hover/selection must visually span both viewports |

### Vertical Scroll Sync

```typescript
// In ScrollController
scrollViewport.addEventListener('scroll', () => {
  frozenViewport.scrollTop = scrollViewport.scrollTop
  // ... existing header sync and viewport store update
}, { passive: true })
```

This runs on the same frame as the scroll event. Since we're only syncing `scrollTop` (not fighting horizontal scroll), there's no compositor conflict. The frozen viewport has `overflow: hidden` so the browser doesn't try to scroll it — we just set `scrollTop` directly.

### Key Considerations

1. **Row hover**: Need `mouseenter`/`mouseleave` on both viewports, syncing a `hoveredRowId` that applies `.row-hovered` class on both sides
2. **Selection overlay**: Selection spans across frozen/unfrozen seamlessly (AG Grid, Excel, Google Sheets all work this way — "flatten the grid in your head, only full rectangles are selectable"). The selection **model** stays logical (`{startCol, endCol, startRow, endRow}`) and is unaware of viewports. Only the **rendering** splits: `SelectionOverlayDOM` renders two visual rectangles — one clipped to the frozen viewport, one in the scrollable viewport — from the same logical selection using different coordinate spaces. No special boundary logic needed in the selection model
3. **Column drag-to-reorder**: If a column is dragged from scrollable to frozen area (or vice versa), need to handle cross-viewport drop
4. **Resize handle**: Column resize on frozen columns affects frozen viewport width; on scrollable columns affects only cell layout
5. **Context menu**: Must appear above both viewports (rendered in container, not viewport)
6. **Row expansion**: Expanded content needs to span both viewports or render only in the scrollable one
7. **Column virtualization**: Only applies to scrollable viewport; frozen columns always rendered

### Why This Won't Have Compositor Issues

The frozen viewport has `overflow: hidden`. The browser's compositor has nothing to scroll — it's a fixed container. Vertical scroll is synced via JS `scrollTop` assignment, which happens synchronously within the scroll event handler (no frame delay for same-element scrollTop assignment). The scrollable viewport behaves exactly as it does today.

---

## Existing Split-Pane Infrastructure (Gantt Mode)

**VibGrid already implements a split viewport for Gantt mode.** This is directly reusable.

### Gantt's Current Split Architecture

```
Container (flex-row, overflow-hidden)
├── Table pane (containerRef, width = cutoffWidth)
│   └── DOM renderer (rows, cells, headers)
├── CutoffResizer (draggable divider)
└── GanttTimeline (React component, independent overflow-auto)
    └── Timeline bars, dependencies, today line
```

### Reusable Components

| Component | File | What It Does | Reusable? |
|-----------|------|--------------|-----------|
| `SplitPaneContainer` | `components/SplitPaneContainer.tsx:85-118` | Bidirectional vertical scroll sync with RAF + `isSyncing` loop prevention | Yes — directly |
| `CutoffResizer` | `components/CutoffResizer.tsx:35-128` | Draggable divider, double-click reset | Yes — for resize handle between frozen/scrollable |
| `ViewModeStore.cutoffWidth` | `stores/ViewModeStore.ts:37-158` | Observable width (default 400, min 200, max 70%), persisted | Extend — add `frozenColumnWidth` |
| Scroll sync reaction | `VibeGrid.tsx:839-886` | MobX-based cross-store scroll coordination with source tracking | Adapt — same pattern for frozen viewport |

### Key Difference from Gantt

In Gantt mode, the right pane is a **React component** (GanttTimeline) with its own rendering. For frozen columns, **both panes use the DOM renderer** — the left pane renders frozen cells, the right pane renders scrollable cells. This means:

1. `BodyRenderer` needs to output to two containers (not one)
2. `HeaderRenderer` similarly splits
3. The scroll sync pattern from `SplitPaneContainer` applies directly
4. `CutoffResizer` can optionally be shown (or frozen width can be auto-calculated from column widths)

### Reduced Scope

Because the split-pane infrastructure exists, the actual new work is:

1. **Generalize `SplitPaneContainer`** to support frozen-column mode (not just Gantt)
2. **Split `BodyRenderer` output** — frozen cells to left pane, data cells to right pane
3. **Split `HeaderRenderer` output** — same split
4. **Add `VisualStateStore` frozen column computeds** — `frozenColumnRange`, `frozenColumnsWidth`
5. **Overlay adjustments** — selection/editing coordinates across split viewports

---

## Complexity Estimate

This is a **medium refactor** with significant existing infrastructure to build on:

- `SimplePassiveRenderer`: ~100 lines changed (DOM structure)
- `BodyRenderer`: ~50 lines changed (split cell rendering)
- `HeaderRenderer`: ~40 lines changed (split header)
- `ScrollController`: ~20 lines changed (add frozen sync)
- `VisualStateStore`: ~30 lines (frozen column computed properties)
- `OverlayManager` + overlays: ~80 lines (split coordinate tracking)
- CSS: ~50 lines (frozen viewport styles)
- Tests: Update `GridLineCanvas.test.ts` + new tests for split viewport

**Estimated scope**: ~400 lines changed across 8-10 files. Should be specced as a proper feature issue.

---

## References

- [AG Grid Column Pinning](https://www.ag-grid.com/javascript-data-grid/column-pinning/)
- [AG Grid: Why Column Pinning Wins](https://blog.ag-grid.com/heres-why-column-pinning-in-react-datagrid-by-ag-grid-wins-over-competition/)
- [AG Grid Scrolling Performance](https://www.ag-grid.com/javascript-data-grid/scrolling-performance/)
- [MUI X DataGrid Column Pinning](https://mui.com/x/react-data-grid/column-pinning/)
- [Handsontable Column Freezing](https://handsontable.com/docs/javascript-data-grid/column-freezing/)
- [Data Table From Scratch: Column Pinning](https://dev.to/morewings/lets-create-data-table-part-4-column-pinning-5eb7)
- [Sticky Rows and Columns](https://www.ofcodeandcolor.com/2021/09/05/styling-tables-sticky-rows-and-columns/)
