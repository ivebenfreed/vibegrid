---
date: 2026-03-19
topic: VIbeGrid Rendering & Virtual Scroll — Refactor Targets
status: complete
github_issue: null
---

# Research: VIbeGrid Rendering & Virtual Scroll — Refactor Targets

## Context

Deep dive into VIbeGrid's rendering pipeline, virtual scroll system, cell renderers, and state architecture to identify refactoring opportunities for simplification, maintainability, and extensibility.

## System Overview

**Total codebase:** ~61,700 lines across ~150 non-test files in `apps/web/src/systems/vibegrid/`.

### Top 10 Largest Files

| File | Lines | Purpose |
|------|-------|---------|
| `renderers/core/SimplePassiveRenderer.ts` | 3,110 | Core DOM rendering engine |
| `slots/slot-initialization.ts` | 3,058 | All 28 built-in cell renderers |
| `stores/TableCoreStore.ts` | 2,234 | Data state, sorting, filtering, grouping |
| `renderers/components/BodyRenderer.ts` | 1,892 | Row + cell DOM creation |
| `stores/InteractionStore.ts` | 1,785 | Selection, hover, drag, menus, clipboard |
| `renderers/modules/MouseController.ts` | 1,703 | Mouse event handling |
| `stores/GanttViewStore.ts` | 1,614 | Gantt-specific state |
| `stores/VisualStateStore.ts` | 1,512 | Column layout, visual config |
| `managers/ClipboardManager.ts` | 1,459 | Clipboard operations |
| `stores/EditingStore.ts` | 833 | Cell edit lifecycle |

### Architecture Summary

- **14 MobX stores** — all instance-scoped per `<VibeGrid>` component (not global)
- **28 built-in cell renderers** — registered via SlotRegistry with priority-based resolution
- **Custom DOM rendering** — `SimplePassiveRenderer` bypasses React for grid body, using direct DOM manipulation
- **Row recycling pool** — reuses DOM elements (MAX_POOL_SIZE=50) instead of create/destroy
- **Virtual scrolling** — fixed-height (34px) with buffer rows (10 above/below), variable-height support via `rowOffsets`
- **View modules** — table, gantt, kanban via `ViewModeRegistry` (global singleton)

---

## Findings & Refactor Targets

### Finding 1: `SimplePassiveRenderer` is a God Object (3,110 lines)

**Impact: HIGH** | **Effort: MEDIUM**

`SimplePassiveRenderer.ts` is the central orchestrator for the entire grid. It:
- Creates all DOM containers (viewport, header, body)
- Initializes 6+ controllers (Selection, Keyboard, Mouse, Scroll, Clipboard, Drag)
- Manages row recycling pool
- Handles scroll events
- Sets up MobX reactions (focused observers)
- Coordinates header rendering
- Manages overlay system

**Problem:** It's the single hardest file to understand and modify. Any new feature that touches rendering must navigate this file. The 10-step initialization sequence (`initDOM → initControllers → initDOMFactory → initOverlayManager → initPhase2Managers → initGridLineCanvas → initHeaderRenderer → postInitialization → initFocusedObservers`) is fragile — order matters and isn't enforced by types.

**Refactor opportunity:**
- Extract `initDOM()` into a `DOMFactory` class
- Extract scroll handling into a `ScrollController` (partially done but tightly coupled)
- Extract the focused observer setup into an `ObserverManager`
- Consider a builder pattern for initialization to make the dependency chain explicit

**Risk:** This is the performance-critical path. Any refactor must preserve the current DOM recycling and RAF-throttled rendering. Measure before/after.

---

### Finding 2: `slot-initialization.ts` — 28 Renderers in One File (3,058 lines)

**Impact: HIGH** | **Effort: LOW**

All 28 built-in cell renderers are defined in a single file. Each renderer follows the same pattern (class implementing `CellRenderer` with `render()`, `update()`, `canHandle()`, `format()`, `validate()` methods), but they're all concatenated together.

**Current renderers by category:**
- **Basic (17):** Text, Number, Date, Boolean, Select, Email, URL, Phone, Color, Currency, File, Image, Rating, Slider, Markdown, EntityName, RowExpand
- **Relationship (2):** EntityReference, UserReference
- **Computed (3):** ComputedExpression, ComputedFormula, ComputedDecisionTable
- **Special (6):** Progress, Duration, JSON, UnreadIndicator, RowNumber, GeoLocation

**Problem:** Adding a new renderer means editing a 3,058-line file. Renderers can't be tested independently. Code review is painful — a change to `DateCellRenderer` requires scrolling past 20 other renderers.

**Refactor opportunity:** Split into individual files per renderer (or at least per category):
```
slots/renderers/
├── text.ts
├── number.ts
├── date.ts
├── boolean.ts
├── select.ts
├── entity-reference.ts
├── ...
└── index.ts  (re-exports + registration)
```

**Risk:** Low — this is purely organizational. Registration still happens in one place via `registerDefaultSlots()`.

---

### Finding 3: `VisualStateStore` — Facade/Delegate Pattern Smell (1,512 lines)

**Impact: MEDIUM** | **Effort: LOW**

`VisualStateStore` delegates viewport state to `ViewportStore` via getter/setter properties (lines 167-200):

```typescript
get viewportWidth(): number {
  return this._viewportStore?.viewportWidth ?? 0
}
set viewportWidth(value: number) {
  if (this._viewportStore) {
    this._viewportStore.updateViewportSize(value, this._viewportStore.viewportHeight)
  }
}
// ... same for viewportHeight, scrollLeft, scrollTop
```

This is a remnant of the P2 consolidation (spec 1413) where `ViewportStore` was extracted. The delegation properties exist for backward compatibility — old consumers still read `visualStateStore.scrollTop` instead of `viewportStore.scrollTop`.

**Problem:** Two stores for viewport state creates confusion about which is the source of truth. The delegation layer adds indirection without value. New code might use either store, and the delegation could mask bugs.

**Refactor opportunity:**
1. Grep for all `visualStateStore.scrollTop`, `visualStateStore.scrollLeft`, `visualStateStore.viewportWidth`, `visualStateStore.viewportHeight` usages
2. Migrate them to use `viewportStore` directly
3. Remove the delegation properties from `VisualStateStore`

**Risk:** Low — purely mechanical find-and-replace. All stores are accessible via `useVibeGridStores()`.

---

### Finding 4: Store Dependency Injection — Manual Wiring (40+ `set*()` calls)

**Impact: MEDIUM** | **Effort: MEDIUM-HIGH**

The store context (`context.tsx`, lines 128-268) manually wires 14 stores together with 25+ `set*()` calls. This creates:
- A hidden dependency graph (no type enforcement of wiring order)
- Bidirectional dependencies (TableCoreStore ↔ VisualStateStore, InteractionStore ↔ TableCoreStore)
- `any` typed store references (e.g., `private tableCoreStore: any = null`)
- Easy to add a store but forget to wire it

**Example bidirectional dependency:**
```typescript
tableCoreStore.setVisualStateInputs(visualStateStore)  // TableCore reads from Visual
visualStateStore.setTableCoreStore(tableCoreStore)     // Visual reads from TableCore
```

**Problem:** Adding a new store requires editing both the store class AND `context.tsx`. The `any` types hide type errors at the wiring boundary. The bidirectional dependencies make it hard to reason about data flow.

**Refactor opportunities:**
1. **Type the dependency injection** — Replace `any` with proper store types in `set*()` methods
2. **Consider a store registry** — A `StoreContainer` that resolves dependencies automatically
3. **Reduce bidirectional dependencies** — Extract shared state into a separate store that both read from

**Risk:** Medium — the current wiring works and is stable. The risk is in the migration, not the end state.

---

### Finding 5: Virtual Scroll — Three Redundant Row Range Calculations

**Impact: LOW-MEDIUM** | **Effort: LOW**

`visibleRowRange` is calculated in three places:

1. **`ViewportStore.visibleRowRange`** (computed, lines 194-232) — The authoritative source with three code paths:
   - `tableCoreStore.findRowAtScrollPosition()` — variable height
   - Binary search on `rowOffsets` — fallback variable height
   - `Math.floor(scrollTop / ROW_HEIGHT)` — fixed height fallback

2. **`GridCalculations.getVisibleRowRange()`** (`constants/grid-dimensions.ts`, lines 111-123) — Standalone utility that duplicates the fixed-height calculation

3. **`GridCalculations.getVisibleColumnRange()`** — Column range calculation that lives alongside row range

**Problem:** `GridCalculations.getVisibleRowRange()` duplicates `ViewportStore.visibleRowRange` for the fixed-height case. New code might call the wrong one.

**Refactor opportunity:**
- Check if `GridCalculations.getVisibleRowRange()` has any callers. If not, remove it.
- If it does have callers, redirect them to `ViewportStore.visibleRowRange`.

**Risk:** Very low.

---

### Finding 6: `BodyRenderer` + `HeaderRenderer` — Duplicated DOM Patterns (2,477 lines combined)

**Impact: MEDIUM** | **Effort: MEDIUM**

`BodyRenderer.ts` (1,892 lines) and `HeaderRenderer.ts` (585 lines) both create grid cells with similar patterns:
- Both create `<div>` elements with flex layout
- Both handle column width styling
- Both apply CSS classes for cell types
- Both handle border/padding calculations

**Problem:** Changes to cell layout (e.g., padding, border model, height) need to be applied in both files. The header and body share the same grid column structure but implement it independently.

**Refactor opportunity:**
- Extract a `CellFactory` that handles common cell DOM creation
- Both renderers call the factory, then customize for header vs body behavior
- This would also simplify the row recycling logic in `BodyRenderer`

**Risk:** Medium — DOM structure is performance-sensitive. The current approach avoids abstraction overhead during rendering hot paths.

---

### Finding 7: Domain-Specific Renderers Are Well-Architected (No Action Needed)

The domain-specific renderer pattern (e.g., `features/admin/schemas/admin-field-types.ts` with `BadgeListRenderer`) is clean:
- Each domain defines its renderers in its own directory
- Renderers implement the `CellRenderer` interface
- Registration uses `VibeGridFieldType` objects with `type`, `category`, `renderer`, `editor`
- SlotRegistry resolves by priority (domain=50 > default=0)

This pattern is the correct extension point and doesn't need refactoring.

---

### Finding 8: InteractionStore — Feature Accumulation (1,785 lines)

**Impact: MEDIUM** | **Effort: MEDIUM**

`InteractionStore` handles too many concerns:
- Cell/row selection (single, multi, range)
- Hover state
- Drag and drop
- Column resize state
- Header menu state
- Context menu state
- Column visibility menu
- Group config menu
- Row action menu
- Clipboard state
- Filter builder state + presets
- Expanded row state

**Problem:** Filter builder state (validation, presets, complexity warnings) has no business living alongside mouse coordinate tracking. The store mixes ephemeral UI state (hover position) with persistent state (filter presets).

**Refactor opportunity:**
- Extract `FilterBuilderStore` (filter groups, presets, validation)
- Extract `MenuStateStore` (header menus, context menus, visibility menu, group menu, row action menu)
- Keep `InteractionStore` focused on: selection, hover, drag, clipboard

**Risk:** Low — these are cleanly separable concerns with clear data boundaries.

---

### Finding 9: CSS Variable / Constant Drift

**Impact: LOW** | **Effort: LOW**

The CSS file `vibegridx.css` declares:
```css
:root {
  --vibegridx-header-height: 40px;
  --vibegridx-cell-height: 34px;
}
```

While `grid-dimensions.ts` declares:
```typescript
HEADER_HEIGHT: 48,  // ← 48 vs CSS 40
ROW_HEIGHT: 34,     // matches
```

The header height values don't match (48 in JS vs 40 in CSS). Recent commit `f9d49d98d` consolidated `ROW_HEIGHT=40` → `34` in renderers, but the CSS variable wasn't part of that cleanup.

**Refactor opportunity:**
- Audit which value is actually rendered (the CSS variable or the JS constant)
- Unify to one source of truth — either CSS variables read by JS, or JS constants injected as CSS custom properties

**Risk:** Very low, but needs testing to confirm which value wins at runtime.

---

### Finding 10: `MouseController` Size (1,703 lines)

**Impact: LOW-MEDIUM** | **Effort: MEDIUM**

The `MouseController` handles every mouse-related interaction:
- Click routing (single click, double click, content click vs. affordance click)
- Drag to select
- Cell drag (fill handle)
- Row drag
- Column drag
- Right-click context menu
- Hover tracking

**Refactor opportunity:** Split by interaction type:
- `ClickRouter.ts` — click event interpretation and dispatch
- `DragSelectionController.ts` — drag-to-select rectangle
- `FillDragController.ts` — fill handle drag
- `HoverTracker.ts` — hover state management

---

## Ranked Recommendations

| # | Target | Impact | Effort | Priority |
|---|--------|--------|--------|----------|
| 1 | Split `slot-initialization.ts` into per-renderer files | HIGH | LOW | **P1** |
| 2 | Remove VisualStateStore → ViewportStore delegation | MEDIUM | LOW | **P1** |
| 3 | Extract `FilterBuilderStore` + `MenuStateStore` from InteractionStore | MEDIUM | MEDIUM | **P2** |
| 4 | Fix CSS/JS header height drift | LOW | LOW | **P2** |
| 5 | Remove duplicate `GridCalculations.getVisibleRowRange()` | LOW | LOW | **P2** |
| 6 | Extract `SimplePassiveRenderer` sub-components | HIGH | MEDIUM | **P3** |
| 7 | Type the store dependency injection (`any` → proper types) | MEDIUM | MEDIUM | **P3** |
| 8 | Split `MouseController` by interaction type | LOW-MEDIUM | MEDIUM | **P3** |
| 9 | Extract shared `CellFactory` for Header/Body renderers | MEDIUM | MEDIUM | **P4** |
| 10 | Store container / automatic DI wiring | MEDIUM | HIGH | **P4** |

**Priority rationale:**
- **P1:** Low effort, high clarity gains, no performance risk
- **P2:** Small improvements, low risk
- **P3:** Significant refactors with clear value but require care
- **P4:** Architectural improvements that need design work first

## Open Questions

- Is `GridCalculations.getVisibleRowRange()` called anywhere? (Quick grep to confirm before removing)
- What's the actual rendered header height at runtime — 40px (CSS) or 48px (JS)?
- Are there plans for variable row height as a user-facing feature, or is it only used for expanded rows? (Affects whether the three-path `visibleRowRange` is justified)
- Would a React Server Component approach for cell rendering ever be viable? (Currently bypassed for perf, but React 19 might change the equation)

## Next Steps

These findings can be implemented as individual chores/features. Recommend starting with P1 items (split slot-initialization, remove viewport delegation) as they're low-risk, high-clarity wins.
