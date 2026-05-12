---
date: 2026-05-11
status: research
type: bug-investigation
area: vibegrid
related: GH#2848 (sparse substrate / GridLineCanvas)
observed_on: https://dev.baseplane.ai/my-work (and every other VibeGrid page in dark mode)
---

# VibeGrid: alt-row stripes extend past last column

## Symptom

On `/my-work` (and any VibeGrid where total column width < viewport width),
every **odd-numbered row** renders a dark `--muted` stripe that extends from
the right edge of the last column all the way to the right edge of the
viewport. Even rows do not show the overflow.

The screenshot shows the alternating pattern clearly: rows are striped
columns-only ⇄ columns + trailing-band. There is also a horizontal scrollbar
at the bottom because the body container can be sized wider than the visible
columns in some layouts (independent of the stripe bug).

## Root cause

`GridLineCanvas` paints alternating-row backgrounds to a canvas that is sized
to the **viewport** width, not the **column-area** (totalWidth) width. The
DOM `.vibegridx-row` elements that overlay the canvas are sized to
`fit-content` (≈ column-area width), so for the portion of the row past the
last column, only the canvas is visible — and on odd rows the canvas there
is filled with `--muted`.

### The painter (canvas, viewport-wide)

`apps/web/src/systems/vibegrid/renderers/core/GridLineCanvas.ts`

- `drawInternal()` (line 188) reads `viewportWidth` from `ViewportStore` and
  passes it as `canvasWidth` to `drawRowBackgrounds()` (line 205).
- `drawRowBackgrounds(canvasWidth, …)` (line 215) loops visible rows, skips
  even indexes (line 241), and fills `--muted` from `x = 0` to
  `x = canvasWidth` — i.e. the full viewport. There is no clamp to
  `geometry.totalWidth`.
- Per the comment at lines 201–204, this was intentional: the canvas paints
  the correct row backgrounds + grid lines during fast scroll so cells
  fading in land on an already-correct surface. Bounding the fill to
  totalWidth was overlooked.

### The DOM overlay (column-width)

`apps/web/src/systems/vibegrid/renderers/utils/row-rendering.ts:124–147`

Row elements are created with inline styles:

```ts
Object.assign(element.style, {
  position: 'absolute',
  top: `${offset}px`,
  left: '0',
  right: '0',          // overconstrained — browser drops `right`
  height: `${row.height}px`,
  display: 'flex',
  width: 'fit-content',  // ← effective width = sum of cell widths
})
```

Combined with the CSS rules in `apps/web/src/systems/vibegrid/vibegridx.css`:

- `.vibegridx-row { background: var(--background) !important }` (line 1307)
- `.vibegridx-row-alt { background: var(--muted) !important }` (line 1311)

So odd rows have a `--muted` DOM background, but **only over the column
area**. Past the column area, the canvas's `--muted` paint shows through —
forming the trailing band.

### Why only odd rows show overflow

`drawRowBackgrounds()` only paints odd rows (`if (i % 2 === 0) continue` on
line 241). Even rows leave the canvas transparent (cleared to nothing),
so past the column area an even row reveals `.vibegridx-viewport`'s
background (`hsl(var(--background))`, line 495) — which matches the DOM
row's own `--background`, making even rows look uniform.

### Body width (separate concern, not the stripe bug)

`SimplePassiveRenderer.ts:1898–1899` sets the body container to
`geometry.totalWidth` so horizontal scrolling matches the column area.
That is correct. The stripe overflow is purely a canvas-paint issue —
fixing canvas width won't change body sizing.

## Suspect code paths (ranked)

| # | File | Line(s) | Issue |
|---|------|---------|-------|
| 1 | `systems/vibegrid/renderers/core/GridLineCanvas.ts` | 205, 215, 251 | Alt-row fill uses `viewportWidth`, not `min(viewportWidth, totalWidth - scrollLeft)` |
| 2 | `systems/vibegrid/renderers/utils/row-rendering.ts` | 134–142 | Row inline styles set both `right: '0'` and `width: 'fit-content'` (contradictory; width wins). Worth a follow-up cleanup but **not** the stripe bug |
| 3 | `systems/vibegrid/vibegridx.css` | 1307, 1311 | Row bg via `!important` on the DOM element. Could be moved to a wrapper that is viewport-wide; or canvas could be the sole source of alt-row bg. Either approach also fixes the issue |

## What's NOT involved

- **My Work page config** — `apps/web/src/features/my-work/components/MyWorkPage.tsx`
  and `MyWorkGrid.tsx` pass no unusual props. No `stretchRows`,
  `fillViewport`, spacer column, etc. The bug is grid-wide, observable on
  any page where column total < viewport.
- **PR #2948** ("consolidate empty-state surfaces") — open, not merged to
  staging; unrelated to row width.
- **Hover styling** — the trailing band is visible without hover.

## Recent history

`GridLineCanvas` and the substrate/sparse-row path are part of the active
GH#2848 work (commits in the last ~3 weeks: `cf9a58d97`, `fe7f97738`,
`9edf79d47`, `6a14e48bb`, etc.). The canvas painter for alt-rows was added
to keep visuals stable during fast scroll on sparse substrates. The fix
should clamp the canvas fill to the column-area width without removing the
fast-scroll benefit.

## Fix sketch (for a follow-up task — not part of this research)

In `GridLineCanvas.drawRowBackgrounds`, read `geometry.totalWidth` from
`VisualStateStore` and bound the fill:

```ts
const totalWidth = this.visualStateStore.geometry.totalWidth
const fillWidth = Math.min(canvasWidth, Math.max(0, totalWidth - scrollLeft))
// then: ctx.fillRect(0, y, fillWidth, h)
```

This keeps the fast-scroll surface (canvas remains the bg source) while
bounding it to the visible column area — matching the DOM rows.

Apply the same clamp to `drawHorizontalLines` if those also overrun
(spot-check on a wide page after the fix).

## Verification plan (when fix lands)

1. `/my-work` in dark mode — odd rows match column edge, no trailing band.
2. Horizontal scroll on a wide grid — bg follows scrolled column area.
3. Fast scroll — canvas bg still visible during cell-fade-in (don't regress
   the GH#2848 win).
4. Light mode — confirm canvas was already painting `--muted` there too
   (likely yes, but less visually obvious vs. white viewport).
