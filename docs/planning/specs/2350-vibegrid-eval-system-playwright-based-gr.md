---
initiative: GH#2350-vibegrid-eval-system-playwright-based-gr
type: feature
issue_type: feature
status: draft
priority: medium
roadmap: null
owner: null
github_issue: 2350
github_milestone: null
created: 2026-04-04
updated: 2026-04-04
phases:
  - id: p1
    name: "Infrastructure — Helpers, Fixtures, Suite 1"
    tasks:
      - "Create apps/web/e2e/helpers/grid-state.ts with extractGridState, waitForGridReady, getCell, getCellAffordance, extractColumnValues"
      - "Create widecorp-projects-default.json ground truth fixture"
      - "Create apps/web/e2e/smoke/vibegrid.spec.ts with Suite 1 (INF-1, INF-2, INF-3) and eval self-tests"
      - "Run Suite 1 against staging and verify green"
  - id: p2
    name: "Cell Renderer Coverage (27 types) — Suite 3 CR block"
    tasks:
      - "Create widecorp-all-renderers.json ground truth fixture"
      - "Add Suite 3 CR test block with parameterized tests for all 27 renderer types"
      - "Verify all 27 renderers display non-empty aria-label"
  - id: p3
    name: "Core + Editing + Selection — Suites 2 and 3 SEL"
    tasks:
      - "Create widecorp-projects-sorted-name.json fixture"
      - "Add Suite 2 CORE-B1 through B14 and EDIT-B1 through B14 tests"
      - "Add Suite 3 SEL-B1 through B16 selection tests"
  - id: p4
    name: "Data Controls + Column Interactions — Suite 4"
    tasks:
      - "Create widecorp-projects-filtered-active.json and widecorp-projects-grouped-status.json fixtures"
      - "Add Suite 4 DC-B0 through B10 and CI-B1 through B8 tests"
  - id: p5
    name: "Clipboard + Row Expansion + Gantt + Export — Suite 5"
    tasks:
      - "Add Suite 5 CB, RE, GN, EX test blocks"
  - id: p6
    name: "Cross-Cutting — Permissions, Org Isolation, Edge Cases — Suite 6"
    tasks:
      - "Add Suite 6 CC-1 through CC-5 tests (viewer, admin, DEB, empty state, large dataset)"
---

# VIbeGrid Eval System — Playwright-based ground truth tests (151 behaviors)

> GitHub Issue: [#2350](https://github.com/baseplane-ai/baseplane/issues/2350)

## Overview

VIbeGrid is Baseplane's high-performance virtualized data grid, covering 119 documented behaviors across 9 modules plus 27 cell renderer types and 5 cross-cutting concerns — 151 test points total. Currently there are zero Playwright e2e tests for this system.

This feature adds a complete eval system modeled after the existing COI and RFI workflow evals. Three new files are created:

1. `apps/web/e2e/helpers/grid-state.ts` — DOM state extraction utilities using VIbeGrid's ARIA selectors
2. `apps/web/e2e/fixtures/vibegrid-ground-truth/*.json` — Expected grid states (cell values, row counts, sort order, selection state)
3. `apps/web/e2e/smoke/vibegrid.spec.ts` — The eval spec, organized into 6 suites mirroring the 4-suite COI/RFI pattern

Tests run against **staging** (`dev.baseplane.ai`) against WideCorp prebuilt entities that exercise all renderer types and capabilities. Auth via `window.__auth.signIn('ceo')` dev helper (available on staging, not production).

**Pattern reference:** See `apps/web/e2e/smoke/coi-workflow.spec.ts` and `apps/web/e2e/smoke/rfi-workflow.spec.ts` for the 4-suite structure, `orpc()` helper pattern, `signInAs()` helper, and ground truth fixture usage.

**ARIA contract reference:** See `.claude/rules/vibegrid.md` — `aria-rowindex`, `aria-colindex`, `aria-label`, `data-testid`, `data-affordance`, `data-action`, `aria-rowcount`, `aria-colcount`, `role="grid"`.

**Renderer source reference:** `apps/web/src/systems/vibegrid/slots/slot-initialization.ts` — all 27 registered cell renderers.

---

## Feature Behaviors (TEVS Format)

Behaviors are grouped by module. Each behavior maps to one or more `test()` blocks in `vibegrid.spec.ts`.

---

### Module: Infrastructure (Suite 1)

#### INF-1: Grid mounts for WideCorp entity type

**Core:**
- **ID:** infra-grid-mounts
- **Trigger:** Test navigates to a WideCorp entity list page (e.g. `/projects`) as `ceo`
- **Expected:** `role="grid"` container appears in DOM, `aria-rowcount` > 0, `aria-colcount` > 0 within 10s
- **Verify:** `page.locator('[role=grid]')` is visible; `getAttribute('aria-rowcount')` parses to integer > 0
- **Source:** `systems/vibegrid/components/`, `apps/web/e2e/smoke/vibegrid.spec.ts` Suite 1

#### UI Layer
- Grid container renders without JS console errors
- `aria-rowcount` reflects total row count **including header** (data rows + 1). Tests must subtract 1 for pure data count.

#### API Layer
- N/A (grid renders from TanStack DB live query, no direct API call in test)

#### Data Layer
- N/A (WideCorp entities preexist in staging DB)

---

#### INF-2: Grid state helper extracts correct cell values

**Core:**
- **ID:** infra-grid-state-helper
- **Trigger:** `extractGridState(page, '[role=grid]')` called after grid has rendered
- **Expected:** Returns typed `GridState` object: `{ rowCount, colCount, headers: string[], rows: GridRow[] }` where each `GridRow` has `rowId` and `cells: Record<colId, string>`
- **Verify:** `gridState.headers` is non-empty array of column names; `gridState.rows[0].cells` keys match column IDs
- **Source:** `apps/web/e2e/helpers/grid-state.ts`

#### UI Layer
- N/A (helper reads existing ARIA, does not render)

#### API Layer
- N/A

#### Data Layer
- N/A

---

#### INF-3: Ground truth fixture loads and compareFields engine works for grid state

**Core:**
- **ID:** infra-ground-truth-grid
- **Trigger:** `loadGroundTruth(fixturePath)` on `vibegrid-ground-truth/widecorp-projects-default.json`
- **Expected:** Returns a `GroundTruth` object; `compareFields()` with identical entity returns `accuracy: 1`; with one wrong field returns `accuracy < 1`
- **Verify:** Unit assertions on `accuracy`, `matchedFields`, `fieldResults` — same pattern as COI Suite 4
- **Source:** `apps/web/e2e/helpers/ground-truth.ts`, `apps/web/e2e/fixtures/vibegrid-ground-truth/`

#### UI Layer
- N/A

#### API Layer
- N/A

#### Data Layer
- `apps/web/e2e/fixtures/vibegrid-ground-truth/widecorp-projects-default.json` — first-row cell values for the WideCorp Projects grid in default sort order

---

### Module: Core (14 behaviors — Suite 2)

#### CORE-B1: Grid renders rows from data source

**Core:**
- **ID:** core-grid-render-rows
- **Trigger:** WideCorp Projects list page loads with `ceo` auth
- **Expected:** `role="grid"` visible, `aria-rowcount` integer > 0, DOM row count < 50 (virtualization active) regardless of total
- **Verify:** `extractGridState` returns rows; `page.locator('[aria-rowindex]').count()` is less than `aria-rowcount` (proves virtualization)
- **Source:** `docs/primitives/vibegrid/core.md#B1`, `systems/vibegrid/renderers/`

#### UI Layer
- Rows have `aria-rowindex` starting at 2 (row 1 is header)
- No loading spinner visible after grid settles

#### API Layer
- N/A

#### Data Layer
- N/A

---

#### CORE-B2: Column headers display with sort indicators

**Core:**
- **ID:** core-column-headers-sort
- **Trigger:** Grid renders with schema-derived column config
- **Expected:** Header row (row index 1) contains cells whose `aria-label` matches column names; sortable columns show sort affordance on hover
- **Verify:** `page.locator('[aria-rowindex="1"] [aria-label]')` count matches expected column count; hover over sortable column reveals sort icon
- **Source:** `docs/primitives/vibegrid/core.md#B2`

#### UI Layer
- Sort arrows visible on hover, not always-on (reduces visual noise)
- Active sort column shows filled arrow (direction indicator)

#### API Layer
- N/A

#### Data Layer
- N/A

---

#### CORE-B3: Click column header sorts data

**Core:**
- **ID:** core-click-header-sort
- **Trigger:** Test clicks a text column header (e.g. "Name")
- **Expected:** First click sorts ascending; second click sorts descending; third click returns to default sort; `aria-label` values in column reflect new order
- **Verify:** Extract column values before click; click; extract again; compare order using `localeCompare`
- **Source:** `docs/primitives/vibegrid/core.md#B3`

#### UI Layer
- Sort arrow icon flips direction on second click

#### API Layer
- N/A (sort is client-side via `TableCoreStore`)

#### Data Layer
- N/A

---

#### CORE-B4: Filter icon opens filter panel

**Core:**
- **ID:** core-filter-panel-open
- **Trigger:** Test clicks filter toolbar icon
- **Expected:** Filter panel becomes visible with field selector, operator dropdown, and value input; panel is dismissable via Escape or clicking outside
- **Verify:** Filter panel element becomes visible (selector TBD — audit `systems/vibegrid/` for actual DOM during implementation); escape dismisses it
- **Source:** `docs/primitives/vibegrid/core.md#B4`, `docs/primitives/vibegrid/data-controls.md`

#### UI Layer
- Panel opens without page navigation
- Operator options change based on selected field type (text gets "contains", numbers get ">")

#### API Layer
- N/A

#### Data Layer
- N/A

---

#### CORE-B5: Pagination controls work

**Core:**
- **ID:** core-pagination
- **Trigger:** Test clicks "Next page" on a grid with more rows than page size
- **Expected:** Row data changes to next page; page indicator updates; browser back restores previous page
- **Verify:** Extract first-row ID before navigation; click next; extract first-row ID after; IDs differ; `page.goBack()` restores original first-row ID
- **Source:** `docs/primitives/vibegrid/core.md#B5`

#### UI Layer
- Pagination footer visible below grid
- Page N of M text updates

#### API Layer
- N/A

#### Data Layer
- N/A

---

#### CORE-B6: Row selection (single and multi)

**Core:**
- **ID:** core-row-selection
- **Trigger:** Test clicks row checkbox; then Shift+clicks another row
- **Expected:** Single click selects one row (highlighted); Shift+click extends range; selection count badge appears in toolbar
- **Verify:** After single click: 1 row highlighted; after Shift+click on row 5: rows 1-5 highlighted; selection badge shows "5"
- **Source:** `docs/primitives/vibegrid/core.md#B6`, `docs/primitives/vibegrid/selection.md`

#### UI Layer
- Selected rows have distinct background (verify via CSS computed style or `aria-selected`)
- Toolbar bulk actions appear when selection count > 0

#### API Layer
- N/A

#### Data Layer
- N/A

---

#### CORE-B7: Keyboard navigation

**Core:**
- **ID:** core-keyboard-navigation
- **Trigger:** Test focuses first data cell, presses arrow keys, Tab, Enter, Escape, Page Down, Ctrl+Home, Ctrl+End, Delete
- **Expected:** Each key performs documented action: arrows move focus, Tab moves column, Enter starts edit, Escape cancels, Page Down scrolls by viewport height, Ctrl+Home jumps to first row, Ctrl+End jumps to last, Delete clears value
- **Verify:** After each key press, `document.activeElement` or focused cell `aria-label` reflects new position; grid does not navigate away
- **Source:** `docs/primitives/vibegrid/core.md#B7`

#### UI Layer
- Focus indicator (ring/highlight) visible on focused cell
- No browser default behavior overridden unexpectedly (no scroll jump on Space, etc.)

#### API Layer
- N/A

#### Data Layer
- N/A

---

#### CORE-B8: Empty state shows placeholder

**Core:**
- **ID:** core-empty-state
- **Trigger:** Test navigates to an entity type with zero records (empty WideCorp schema)
- **Expected:** Empty state message renders ("No items yet" or equivalent); optional Create button visible for users with write permission; no loading spinner stuck
- **Verify:** ``.vibegridx-cell-empty-state` or "No items" text` or text "No items" visible; create button present for `ceo`; absent for `viewer`
- **Source:** `docs/primitives/vibegrid/core.md#B8`

#### UI Layer
- Placeholder is centered in grid area

#### API Layer
- N/A

#### Data Layer
- Empty entity type preprovisioned for WideCorp on staging

---

#### CORE-B9: Incremental column virtualization on horizontal scroll

**Core:**
- **ID:** core-column-virtualization
- **Trigger:** Test scrolls grid container horizontally to right edge on a wide column schema
- **Expected:** Columns that were off-screen come into DOM; columns that scrolled off-screen are removed from DOM; total visible column count stays bounded
- **Verify:** DOM `[aria-colindex]` count before scroll vs. after scroll; rightmost visible colindex increases
- **Source:** `docs/primitives/vibegrid/core.md#B9`

#### UI Layer
- No visual jump or blank column during horizontal scroll

#### API Layer
- N/A

#### Data Layer
- N/A

---

#### CORE-B10: Dual-layer shell cell rendering on scroll

**Core:**
- **ID:** core-dual-layer-shell
- **Trigger:** Test scrolls grid vertically rapidly (simulate with `page.keyboard.press('End')`)
- **Expected:** Rows outside visible range are recycled (shell cells repopulated with new data); no ghost content from previous rows visible
- **Verify:** Extract cell values from row at index N before scroll; scroll to new position; verify same DOM element shows different data (recycled)
- **Source:** `docs/primitives/vibegrid/core.md#B10`

#### UI Layer
- No content flicker or stale values during fast scroll

#### API Layer
- N/A

#### Data Layer
- N/A

---

#### CORE-B11: Delta-based selection updates

**Core:**
- **ID:** core-delta-selection
- **Trigger:** Test selects 10 rows via Shift+click, then Ctrl+clicks to deselect 2
- **Expected:** Only the 2 explicitly deselected rows lose highlight; 8 remain selected; selection count badge shows 8
- **Verify:** `aria-selected="true"` count matches expected after each operation
- **Source:** `docs/primitives/vibegrid/core.md#B11`

#### UI Layer
- N/A

#### API Layer
- N/A

#### Data Layer
- N/A

---

#### CORE-B12: Canvas grid lines visible during scroll jumps

**Core:**
- **ID:** core-canvas-grid-lines
- **Trigger:** Test triggers a large scroll jump (Ctrl+End, then Ctrl+Home) on a grid with many rows
- **Expected:** Grid lines (row separators) remain visible and correctly positioned throughout scroll jump; no blank stripe artifacts
- **Verify:** Screenshot comparison at scroll start, mid-jump, and final position; grid lines visible in all 3 screenshots
- **Source:** `docs/primitives/vibegrid/core.md#B12`

#### UI Layer
- Grid lines rendered at pixel-correct row boundaries
- No horizontal offset of grid lines vs. cell content

#### API Layer
- N/A

#### Data Layer
- N/A

---

#### CORE-B13: Inline row creation (ghost rows)

**Core:**
- **ID:** core-inline-row-creation
- **Trigger:** Test clicks "Add row" button or presses Enter on last row in a group
- **Expected:** Ghost row appears at bottom of list with empty editable cells; typing fills first cell; Tab moves to next; Escape cancels and ghost row disappears; Enter commits and real row created
- **Verify:** Ghost row `.vibegridx-ghost-row` visible; after commit, oRPC `/dataforge/data/list` returns one more record; after escape, count unchanged
- **Source:** `docs/primitives/vibegrid/core.md#B13`, `systems/vibegrid/stores/InlineCreationStore.ts`

#### UI Layer
- Ghost row visually distinct (lighter background or dashed border)
- Commit creates real entity immediately without page reload

#### API Layer
- `/dataforge/data/create` called on commit

#### Data Layer
- New entity appears in grid without full reload (live query update)

---

#### CORE-B14: Programmatic scroll to column

**Core:**
- **ID:** core-scroll-to-column
- **Trigger:** Test calls `document.querySelector(".vibegridx-viewport").scrollToColumn("column_id", "instant")` via `page.evaluate` with a column ID that is currently off-screen
- **Expected:** Grid scrolls horizontally until target column is centered in viewport; column header and data cells for that column are visible
- **Verify:** Before: column not in DOM viewport; after command: column `aria-colindex` visible in `[data-testid^="cell-"]` set
- **Source:** `docs/primitives/vibegrid/core.md#B14`, `.claude/rules/vibegrid.md#programmatic-column-scroll`

#### UI Layer
- Scroll is smooth (no jump) when `behavior: 'smooth'` passed
- Column centers in viewport (not edge-aligned)

#### API Layer
- N/A

#### Data Layer
- N/A

---

### Module: Editing (14 behaviors — Suite 2)

#### EDIT-B1: Single-click starts cell editing

**Core:**
- **ID:** edit-single-click-start
- **Trigger:** Test clicks a text cell with `data-affordance="edit"`
- **Expected:** Cell enters edit mode; input element appears inside cell; original value pre-filled
- **Verify:** After click, `[data-testid^="cell-"] input` or `textarea` is visible and focused; value matches original cell `aria-label`
- **Source:** `docs/primitives/vibegrid/editing.md#B1`

#### UI Layer
- Edit input overlays cell exactly (no size mismatch)
- Cursor positioned at end of pre-filled value

#### API Layer
- N/A (edit is in-memory until commit)

#### Data Layer
- N/A

---

#### EDIT-B2: Commit edit on Enter or blur

**Core:**
- **ID:** edit-commit-enter-blur
- **Trigger:** Test types new value into editing cell, presses Enter (or clicks outside)
- **Expected:** Edit session ends; new value persisted via API; cell displays new value; no validation error
- **Verify:** After Enter: cell `aria-label` contains new value; oRPC call to `/dataforge/data/update` observed in network; value survives page refresh
- **Source:** `docs/primitives/vibegrid/editing.md#B2`

#### UI Layer
- Cell transitions from edit mode to display mode without flicker
- New value immediately visible (optimistic update)

#### API Layer
- `POST /api/orpc/dataforge/data/update` fires with correct entity ID and field

#### Data Layer
- Updated value readable via `orpc(page, '/dataforge/data/get', { id })` after commit

---

#### EDIT-B3: Cancel edit on Escape

**Core:**
- **ID:** edit-cancel-escape
- **Trigger:** Test starts cell edit, types new value, presses Escape
- **Expected:** Edit session ends; original value restored; no API call made; no value change in DB
- **Verify:** After Escape: cell `aria-label` matches pre-edit value; no `/dataforge/data/update` network request fired
- **Source:** `docs/primitives/vibegrid/editing.md#B3`

#### UI Layer
- Cell returns to display mode immediately on Escape

#### API Layer
- No update call emitted

#### Data Layer
- Value unchanged in DB (verify via `orpc` get)

---

#### EDIT-B4: Tab moves to next editable cell

**Core:**
- **ID:** edit-tab-next-cell
- **Trigger:** While editing cell in column N, test presses Tab
- **Expected:** Current cell commits; focus moves to column N+1 on same row; that cell enters edit mode
- **Verify:** After Tab: `document.activeElement` is inside column N+1 cell; edit input visible in N+1
- **Source:** `docs/primitives/vibegrid/editing.md#B4`

#### UI Layer
- Tab wraps to first column of next row when on last editable column
- Shift+Tab moves to previous editable cell

#### API Layer
- Commit API call fires for cell N value before Tab completes

#### Data Layer
- N/A

---

#### EDIT-B5: Validation errors display inline

**Core:**
- **ID:** edit-validation-inline
- **Trigger:** Test types an invalid value into a field with a constraint (e.g. required text field cleared, or number field given text)
- **Expected:** Error message appears inline below cell; cell border turns red; commit (Enter) blocked until valid value entered; Escape still works
- **Verify:** Error text element visible under cell; Enter key press does not fire update API; Escape dismisses edit without error
- **Source:** `docs/primitives/vibegrid/editing.md#B5`, `systems/vibegrid/stores/EditingStore.ts`

#### UI Layer
- Error message is readable (contrast, not truncated)
- Red border or error indicator on cell

#### API Layer
- No update call when validation fails

#### Data Layer
- N/A

---

#### EDIT-B6 through EDIT-B14: Editor type coverage (text, select, date, boolean, currency, markdown, blur policy, undo, redo)

These 9 behaviors test specific editor types and editing lifecycle events. They are grouped as a parameterized sub-suite.

**Core (group):**
- **ID:** edit-type-coverage
- **Trigger:** For each field type, navigate to a WideCorp entity with that field, click cell, interact with editor
- **Expected per type:**
  - B6 Text: plain text input appears; accepts any string
  - B7 Select: dropdown opens with option list; click selects option; closes on selection
  - B8 Date: date picker calendar appears; clicking date commits in ISO format
  - B9 Boolean: click toggles true/false without opening modal; no extra click needed
  - B10 Currency: input shows `$` prefix; numeric input only; formatted on commit
  - B11 Markdown: long-text modal opens; markdown preview available; commit on modal save
  - B12 Blur policy: clicking outside commits for `commit-on-blur` fields; leaves open for `keep-open` fields
  - B13 Undo (Ctrl+Z): last committed cell edit reverts; re-commit possible
  - B14 Redo (Ctrl+Shift+Z): undone edit re-applied
- **Verify:** Each editor type shows its characteristic UI element; value persists after commit; undo/redo verified via `aria-label` before/after
- **Source:** `docs/primitives/vibegrid/editing.md#B6–B14`

#### UI Layer
- Each editor matches its field type visually (date picker for dates, dropdown for selects, etc.)

#### API Layer
- Update API fires on commit for each type

#### Data Layer
- N/A

---

### Module: Cell Renderers (27 types — Suite 3)

Each of the 27 registered renderer types must render correctly in display mode. This is verified by navigating to a WideCorp entity that has each field type in its schema, reading cell values via ARIA, and comparing against the ground truth fixture.

#### CR: All 27 renderer types display correctly

**Core:**
- **ID:** cell-renderer-display-coverage
- **Trigger:** Test loads WideCorp entities that cover all 27 field types; calls `extractGridState`
- **Expected:** Each cell with a known field type renders a non-empty `aria-label` appropriate for its type:
  - `text` — string value
  - `number` — numeric string
  - `date` — ISO date string or localized date
  - `boolean` — "true" or "false" or checkbox emoji equivalent
  - `select` — one of the option set values
  - `email` — email address string
  - `url` — URL string
  - `phone` — phone number string
  - `color` — hex color string or color name
  - `currency` — formatted currency string (e.g. "$1,000.00")
  - `file` — filename string
  - `image` — alt text or filename
  - `rating` — numeric or star-count string
  - `slider` — numeric value string
  - `markdown` — plain text preview (first N chars)
  - `entityName` — entity name string with navigate affordance
  - `rowExpand` — expand button present
  - `entityReference` — referenced entity name
  - `userReference` — user display name
  - `computedExpression` — computed value string
  - `computedFormula` — formula result string
  - `computedDecisionTable` — decision output value
  - `rollupCount` — integer count
  - `rollupSum` — sum value
  - `rollupAverage` — average value
  - `rollupConcat` — concatenated string
  - `badgeList` — comma-separated badge labels or badge elements
- **Verify:** `compareFields()` run against `vibegrid-ground-truth/widecorp-all-renderers.json`; accuracy >= 0.90 (10% tolerance for date formatting variance)
- **Source:** `apps/web/src/systems/vibegrid/slots/slot-initialization.ts` (all 27 classes)

#### UI Layer
- No renderer shows "undefined", "[object Object]", or raw JSON blob
- `entityName` cells have `data-affordance="navigate"` and a child `data-action="navigate"` span
- `boolean` cells have `data-affordance="none"` (toggle handled separately)
- `rowExpand` cells have `data-affordance="navigate"` expand button

#### API Layer
- N/A (display only)

#### Data Layer
- `apps/web/e2e/fixtures/vibegrid-ground-truth/widecorp-all-renderers.json` fixture with expected values per field type

---

### Module: Selection (16 behaviors — Suite 3)

#### SEL-B1–B4: Click selection modes (single, toggle, range, extend)

**Core:**
- **ID:** selection-click-modes
- **Trigger:** Single click row checkbox; Ctrl+click another; Shift+click a third; Shift+Arrow to extend range
- **Expected:**
  - Single click: 1 row selected
  - Ctrl+click: 2 rows selected (non-contiguous)
  - Shift+click row 5 (from row 1): rows 1-5 selected
  - Shift+Arrow extends selection by one row
- **Verify:** `aria-selected="true"` count matches expected after each operation; selection toolbar badge updates
- **Source:** `docs/primitives/vibegrid/selection.md#B1–B4`

#### UI Layer
- Contiguous selection shows merged overlay
- Non-contiguous selections show separate overlays

#### API Layer
- N/A

#### Data Layer
- N/A

---

#### SEL-B5–B16: Ctrl+A, Escape, checkboxes, header toggle, overlays, arrow boundary, hidden column skip, selection column exclusion, focus recovery

**Core (group):**
- **ID:** selection-advanced
- **Trigger:** Series of keyboard and mouse interactions targeting advanced selection behaviors
- **Expected:**
  - B5 Ctrl+A: all rows selected
  - B6 Escape: selection cleared
  - B7 Row checkbox: single row toggled
  - B8 Header checkbox: all rows toggled (select all / deselect all)
  - B9 Contiguous overlay: merged blue highlight covers contiguous range
  - B10 Non-contiguous overlay: separate highlight per disconnected range
  - B11 Arrow boundary: arrow keys stop at first/last row (no wrap)
  - B12 Hidden column skip: Tab skips hidden columns
  - B13 Selection column exclusion: selection column never included in copy payload
  - B14 Focus recovery: after filter clears, focus returns to previously focused cell (if still visible)
- **Verify:** Each behavior tested with specific assertion; `aria-selected` state, overlay presence, focus element after each action
- **Source:** `docs/primitives/vibegrid/selection.md#B5–B16`

#### UI Layer
- Ctrl+A shows "All N selected" in toolbar

#### API Layer
- N/A

#### Data Layer
- N/A

---

### Module: Data Controls (11 behaviors — Suite 4)

#### DC-B0: Global Text Search (Smart Search)

**Core:**
- **ID:** dc-smart-search
- **Trigger:** Test types text into the global search input; text matches 3 of 10 visible rows
- **Expected:** Grid filters to show only matching rows immediately; `aria-rowcount` updates to 3; cleared search restores all rows
- **Verify:** Before: `aria-rowcount` = 10; type search term; `aria-rowcount` = 3; clear search; `aria-rowcount` = 10
- **Source:** `docs/primitives/vibegrid/data-controls.md#B0`

#### UI Layer
- Search input debounces (no row flicker on every keystroke)
- "3 results" or row count indicator updates

#### API Layer
- N/A (client-side filter via `TableCoreStore`)

#### Data Layer
- N/A

---

#### DC-B1: Simple Column Filtering

**Core:**
- **ID:** dc-column-filter
- **Trigger:** Test opens filter panel, selects "Name" column, operator "contains", value "Acme", applies
- **Expected:** Only rows where Name contains "Acme" display; filter chip appears in toolbar; remove chip restores all rows
- **Verify:** Row `aria-label` values in Name column all contain "Acme" (case-insensitive); chip element visible; click remove chip → rows restored
- **Source:** `docs/primitives/vibegrid/data-controls.md#B1`

#### UI Layer
- Active filter chip shows field + operator + value summary

#### API Layer
- N/A

#### Data Layer
- N/A

---

#### DC-B2: Advanced Multi-Level Filtering (Filter Builder)

**Core:**
- **ID:** dc-filter-builder
- **Trigger:** Test opens Filter Builder, adds 2 rules (Name contains "A" AND Status = "active"), applies
- **Expected:** Only rows matching both conditions display; AND logic correctly applied; rules visually stacked with connector label
- **Verify:** Row values satisfy both predicates (verified by extracting column values and checking both conditions)
- **Source:** `docs/primitives/vibegrid/data-controls.md#B2`

#### UI Layer
- Filter Builder modal shows rule list with field/operator/value per row
- AND/OR connector between rules is configurable

#### API Layer
- N/A

#### Data Layer
- N/A

---

#### DC-B3–B5: Single, Multi-Level, and Relationship Field Grouping

**Core:**
- **ID:** dc-grouping
- **Trigger:** Test enables group-by on "Status" field; then adds second group-by "Owner"; then tests a relationship field group-by
- **Expected:**
  - B3 Single: rows collapsed under group header cells by Status value; group row shows count
  - B4 Multi-level: secondary groups nested under primary; indent level visible
  - B5 Relationship: groups by related entity name (e.g. "Project: Acme Office Build")
- **Verify:** Group header rows present with `.vibegridx-group-header` or equivalent; indentation increases per level; relationship group header shows entity name
- **Source:** `docs/primitives/vibegrid/data-controls.md#B3–B5`

#### UI Layer
- Group header rows visually distinct (heavier font or background)
- Collapse arrow on group header rows

#### API Layer
- N/A

#### Data Layer
- N/A

---

#### DC-B6–B8: Group Expansion/Collapse, Global Control, Aggregations

**Core (group):**
- **ID:** dc-group-controls
- **Trigger:**
  - B6: Click expand/collapse arrow on a single group header
  - B7: Click "Collapse All" / "Expand All" global control
  - B8: Enable rollup aggregation on numeric column; verify group totals
- **Expected:**
  - B6: Group rows show/hide; arrow icon flips direction
  - B7: All groups expand/collapse simultaneously
  - B8: Group footer row shows sum/count/average matching extracted data
- **Verify:** After collapse, child rows absent from DOM; after expand, present; B8: extract numeric values per group, sum manually, compare to displayed aggregate
- **Source:** `docs/primitives/vibegrid/data-controls.md#B6–B8`

#### UI Layer
- Expand/collapse is animated (brief transition acceptable)
- Aggregate row is visually distinct (bottom of group, lighter text)

#### API Layer
- N/A

#### Data Layer
- N/A

---

#### DC-B9–B10: Filter Presets (Save and Load)

**Core:**
- **ID:** dc-filter-presets
- **Trigger:** B9: Configure filter, click "Save preset", name it "Active Only"; B10: Clear filter, open preset menu, apply "Active Only"
- **Expected:**
  - B9: Preset saved and appears in preset list
  - B10: Applying preset restores identical filter state; rows match original filtered set
- **Verify:** B9: preset name visible in dropdown; B10: row count and first-row value match original filtered state
- **Source:** `docs/primitives/vibegrid/data-controls.md#B9–B10`

#### UI Layer
- Preset save dialog has name input field
- Preset list shows all saved presets with apply button

#### API Layer
- Preset saved to `localStorage` or user preferences API (verify persistence across page reload)

#### Data Layer
- N/A (preset config is filter/sort config, not entity data)

---

### Module: Column Interactions (8 behaviors — Suite 4)

#### CI-B1–B8: Resize, Auto-Size, Reorder, Context Menu, Header Menu, Row Drag, Action Bar, Bulk Delete

**Core (group):**
- **ID:** column-interaction-coverage
- **Trigger:** Series of drag, double-click, right-click, and keyboard interactions
- **Expected:**
  - B1 Drag resize: drag column divider right → column widens; left → narrows; width persists in `localStorage`
  - B2 Auto-size: double-click column divider → column width snaps to widest content
  - B3 Reorder: drag column header to new position → columns reorder; persists across reload
  - B4 Right-click context menu: right-click cell shows menu with Sort, Filter, Hide options
  - B5 Header menu: click header menu icon (⋯) shows column-specific options
  - B6 Row drag handle: drag `[data-affordance="drag"]` to reorder rows (when supported)
  - B7 Action bar: select 3 rows; action bar appears with "Delete", "Edit", "Export" options
  - B8 Bulk delete: click Delete in action bar; confirmation shown; rows removed on confirm
- **Verify:** Each interaction's DOM outcome verified (column width CSS, column order in header row, menu visibility, row order, action bar presence, row count after delete)
- **Source:** `docs/primitives/vibegrid/column-interactions.md#B1–B8`

#### UI Layer
- Column resize shows drag handle cursor on hover
- Context menu dismisses on Escape or outside click
- Bulk delete requires confirmation dialog

#### API Layer
- B8: `/dataforge/data/delete` called for each selected row ID on confirm

#### Data Layer
- Deleted rows absent from subsequent `orpc` list calls

---

### Module: Clipboard (32 behaviors — Suite 5)

#### CB: Copy/paste/cut with type validation, fill handle, visual overlays

**Core (group):**
- **ID:** clipboard-coverage
- **Trigger:** Series of Ctrl+C, Ctrl+V, Ctrl+X operations; drag fill handle; verify overlays
- **Expected (key behaviors):**
  - Copy single cell: Ctrl+C → green dashed copy overlay appears on source cell; Ctrl+V on target → value pasted
  - Copy range: Ctrl+C on 3-cell selection → green dashed overlay covers range; paste on compatible range
  - Cut: Ctrl+X → red dashed cut overlay; paste removes from source and populates target
  - Type validation on paste: pasting text into number field → validation error, no commit
  - Fill handle: drag fill handle down 3 rows → source value fills all 3 rows
  - Marching ants: after Ctrl+C, selection border animates (marching ants CSS)
  - Escape clears clipboard: Ctrl+C then Escape → overlay disappears
- **Verify:** Overlay CSS class or `data-clipboard-state` attribute changes; pasted values visible in target cells via ARIA; invalid paste shows error message; fill handle rows all contain source value
- **Source:** `docs/primitives/vibegrid/clipboard.md#B1–B32`

#### UI Layer
- Green dashed border: `[clipboard overlay selector (TBD — audit `systems/vibegrid/overlays/ClipboardOverlayDOM.ts` during implementation)]`
- Red dashed border: `[cut overlay selector (TBD — same audit as copy overlay)]`
- Fill handle: `fill handle element (selector TBD — verify in `systems/vibegrid/` source)` draggable element

#### API Layer
- Paste triggers `/dataforge/data/update` for each affected cell

#### Data Layer
- Pasted values persist (verify via `orpc` get after paste)

---

### Module: Row Expansion (11 behaviors — Suite 5)

#### RE-B1–B11: Expand, Multi-Expand, Persist, Lazy Load, Auto-Collapse, Nested Grid, Different Type, Self-Referential, Drag-Drop, Bulk, Error

**Core (group):**
- **ID:** row-expansion-coverage
- **Trigger:** Click expand button on rows; verify expanded content via `ExpandedContentPortals`
- **Expected (key behaviors):**
  - B1: Click row expand → child entity list renders inside expanded region; collapse re-hides
  - B2: Multiple rows expandable simultaneously without interfering
  - B3: Expand state persists across page navigation (stored in `PersistenceStore`)
  - B4: Children load lazily on expand; spinner visible during load
  - B5: Empty children auto-collapse after load (no empty expanded region)
  - B6: Nested VibeGrid renders inside expanded region (full grid with own scroll)
  - B7: Different entity type children render with their own column schema
  - B8: Self-referential children (same entity type) work without infinite loop
  - B9: Drag-drop between parent rows (if supported by entity type)
  - B10: Bulk expand/collapse all via keyboard shortcut or toolbar button
  - B11: Error in child load shows inline error message; parent row not affected
- **Verify:** Expanded region DOM visible with child rows; portal container present; `InteractionStore.expandedRowIds` reflects state; persistence verified via reload
- **Source:** `docs/primitives/vibegrid/row-expansion.md#B1–B11`, `systems/vibegrid/processors/RowExpansionProcessor.ts`

#### UI Layer
- Expand button arrow rotates on expand
- Expanded region has visual left-indent to show hierarchy

#### API Layer
- Child entity load calls `/dataforge/data/list` with parent ID filter

#### Data Layer
- Child entities preexist in staging for WideCorp test entity type

---

### Module: Gantt (6 behaviors — Suite 5)

#### GN-B1–B6: Timeline, Task Bars, Drag-Move, Drag-Resize, Dependencies, Critical Path

**Core (group):**
- **ID:** gantt-coverage
- **Trigger:** Switch grid to Gantt view mode; verify timeline renders; interact with task bars
- **Expected:**
  - B1: Timeline header shows date scale matching zoom level; task bars positioned proportionally to date fields
  - B2: Task bar positions match `start_date`/`end_date` field values from entity data
  - B3: Drag task bar horizontally → start/end dates update by drag delta; save to entity
  - B4: Drag task bar right edge → duration extends; start date unchanged
  - B5: Dependency arrows drawn between linked tasks (arrow from predecessor end to successor start)
  - B6: Critical path tasks highlighted (e.g. red bar color) when CP calculation enabled
- **Verify:** Task bar `style.left` / `style.width` computed values correspond to date range proportions; drag triggers `/dataforge/data/update` with new dates; arrow SVG elements present for dependencies
- **Source:** `docs/primitives/vibegrid/gantt.md#B1–B6`, `systems/vibegrid/stores/GanttViewStore.ts`

#### UI Layer
- View mode switcher shows "Gantt" tab
- Timeline zooms (day/week/month) change header labels

#### API Layer
- Drag-save triggers `/dataforge/data/update` with `start_date` and `end_date`

#### Data Layer
- WideCorp project entities have `start_date` and `end_date` fields on staging

---

### Module: Export Services (7 behaviors — Suite 5)

#### EX-B1–B7: PDF, Format, ZIP, CSV, Audit, Preview, Streaming

**Core (group):**
- **ID:** export-coverage
- **Trigger:** Click export button in toolbar; select format; download begins
- **Expected:**
  - B1: PDF export from React template → PDF file downloads; file is valid PDF (check magic bytes `%PDF`)
  - B2: Format field data: dates formatted as `MM/DD/YYYY` in export, currency as `$N,NNN.NN`
  - B3: ZIP export for bulk: multiple files bundled into `.zip`; each entity has its own file
  - B4: CSV export: comma-separated file with header row; values match grid display values
  - B5: Audit history export: includes change log columns (`changed_by`, `changed_at`, `old_value`, `new_value`)
  - B6: PDF preview in-browser before download
  - B7: Streaming for large files: response is streamed (Content-Type: `application/octet-stream`; no timeout for 500+ rows)
- **Verify:** Download intercepted via `page.waitForEvent('download')`; file size > 0; magic bytes or CSV header checked; for streaming, response arrives within 30s
- **Source:** `docs/primitives/vibegrid/export-services.md#B1–B7`

#### UI Layer
- Export dropdown lists all format options
- Progress indicator during ZIP generation for large exports

#### API Layer
- Export endpoint: `/api/orpc/dataforge/export` or similar

#### Data Layer
- N/A (reads from existing entity data)

---

### Module: Cross-Cutting Concerns (5 behaviors — Suite 6)

#### CC-1: Viewer role sees grid but no edit affordances

**Core:**
- **ID:** cc-viewer-no-edit
- **Trigger:** Sign in as `viewer` (`viewer@widecorp.com`); navigate to entity list
- **Expected:** Grid renders with all data visible; no cells have `data-affordance="edit"`; no "Add row" button visible; clicking cells does not start edit mode
- **Verify:** `page.locator('[data-affordance="edit"]').count()` === 0; click on cell does not produce input element; ``[data-testid="add-row-button"]`` absent
- **Source:** `.claude/rules/access-control.md`, cross-cutting concern

#### UI Layer
- Read-only cells may have `data-affordance="none"` or no affordance attribute

#### API Layer
- N/A (permissions enforced at render layer, not just API)

#### Data Layer
- N/A

---

#### CC-2: Admin role sees edit affordances

**Core:**
- **ID:** cc-admin-edit-affordances
- **Trigger:** Sign in as `admin` (`admin@widecorp.com`); navigate to same entity list
- **Expected:** Text/select/date cells have `data-affordance="edit"`; "Add row" button present; clicking cell starts edit
- **Verify:** `page.locator('[data-affordance="edit"]').count()` > 0; input appears after click; ``[data-testid="add-row-button"]`` present
- **Source:** Cross-cutting, `.claude/rules/access-control.md`

#### UI Layer
- Edit icon visible on entityName cells on hover (admin only)

#### API Layer
- N/A

#### Data Layer
- N/A

---

#### CC-3: DEB admin sees only DEB org data

**Core:**
- **ID:** cc-org-isolation
- **Trigger:** Sign in as `deb.admin` via `window.__auth.signIn('deb.admin')`; navigate to entity list
- **Expected:** All visible rows belong to DEB organization; no WideCorp entity names visible; row count reflects DEB-only data
- **Verify:** Extract all `aria-label` values from "Organization" column (if present); none contain "WideCorp"; compare row count to `ceo` row count (should differ)
- **Source:** Cross-cutting, multi-tenant architecture

#### UI Layer
- Org name in sidebar/header confirms active org

#### API Layer
- Row-level security enforced on DataForge queries (DB-level RLS)

#### Data Layer
- DEB entities preexist in staging

---

#### CC-4: Empty entity type shows empty state

**Core:**
- **ID:** cc-empty-entity-type
- **Trigger:** Navigate to a WideCorp entity type with zero records
- **Expected:** Empty state message renders; no grid rows visible; no loading spinner stuck; `aria-rowcount="0"` or grid absent
- **Verify:** ``.vibegridx-cell-empty-state` or "No items" text` visible; `page.locator('[aria-rowindex="2"]').count()` === 0
- **Source:** `docs/primitives/vibegrid/core.md#B8`, cross-cutting

#### UI Layer
- Empty state includes a "Create" CTA for users with write permission

#### API Layer
- N/A

#### Data Layer
- Empty test entity type exists on staging for WideCorp

---

#### CC-5: Large dataset — virtual scrolling active at 500+ rows

**Core:**
- **ID:** cc-virtual-scrolling-large-dataset
- **Trigger:** Navigate to an entity type with 500+ rows on staging
- **Expected:** Grid renders within 3s; DOM row element count < 100 (virtualization active); scroll to bottom then top completes without error or blank rows
- **Verify:** `page.locator('[aria-rowindex]').count()` < 100 while `aria-rowcount` > 500; Ctrl+End then Ctrl+Home executes without JS error; screenshot shows populated rows at both extremes
- **Source:** `docs/primitives/vibegrid/core.md#B1`, performance cross-cutting

#### UI Layer
- No layout thrash or reflow during rapid scroll
- Frame rate stays > 30fps (not testable directly; absence of visual artifacts is proxy)

#### API Layer
- N/A

#### Data Layer
- 500+ row entity type exists on staging (or test can check `aria-rowcount` and skip if < 500)

---

## Files to Create

### 1. `apps/web/e2e/helpers/grid-state.ts`

Grid DOM state extraction via ARIA selectors. Exports:

- `GridCell`: `{ colId: string; colIndex: number; label: string; affordance?: string }`
- `GridRow`: `{ rowId: string; rowIndex: number; cells: Record<string, GridCell> }`
- `GridState`: `{ rowCount: number; colCount: number; headers: string[]; rows: GridRow[] }`
- `extractGridState(page, selector?)`: reads `[role=grid]`, parses `aria-rowcount` (subtracts 1 for header to get data row count), `aria-colcount`, all `[aria-rowindex]` rows, all `[aria-colindex]` cells, returns `GridState`
- `extractColumnValues(page, columnLabel)`: returns ordered array of `aria-label` values for named column across visible rows
- `waitForGridReady(page, selector?, timeout?)`: polls until `[role=grid]` has `aria-rowcount` > 0 and no loading spinner
- `getCell(page, rowId, colId)`: returns `Locator` for `[data-testid="cell-{rowId}-{colId}"]`
- `getCellAffordance(page, rowId, colId)`: returns `data-affordance` attribute value

**Pattern reference:** Same module structure as `apps/web/e2e/helpers/ground-truth.ts` (named exports, TypeScript interfaces, pure functions).

### 2. `apps/web/e2e/fixtures/vibegrid-ground-truth/*.json`

Five fixture files:

| File | Scenario | Purpose |
|------|----------|---------|
| `widecorp-projects-default.json` | Projects list, default sort | First-row cell values; tests CORE-B1, INF-3 |
| `widecorp-all-renderers.json` | Entity with all 27 field types | Cell values per renderer type; tests CR suite |
| `widecorp-projects-sorted-name.json` | Projects sorted by Name ascending | Row order after sort; tests CORE-B3 |
| `widecorp-projects-filtered-active.json` | Projects filtered to Status=active | Row count and values after filter; tests DC-B1 |
| `widecorp-projects-grouped-status.json` | Projects grouped by Status | Group header labels and child row counts; tests DC-B3 |

Each file follows the existing `GroundTruth` interface from `ground-truth.ts`:
```json
{
  "source_pdf": "n/a",
  "local_path": "n/a",
  "expected_fields": { ... },
  "field_matchers": { ... }
}
```

For grid state fixtures, `expected_fields` contains grid-level properties:
```json
{
  "row_count": 12,
  "col_count": 8,
  "first_row_name": "Acme Office Build",
  "has_edit_affordances": true
}
```

### 3. `apps/web/e2e/smoke/vibegrid.spec.ts`

Six test suites following the 4-suite COI/RFI pattern:

| Suite | Name | Behavior IDs | Runtime |
|-------|------|--------------|---------|
| Suite 1 | VIbeGrid — Infrastructure | INF-1, INF-2, INF-3 | < 30s |
| Suite 2 | VIbeGrid — Core + Editing | CORE-B1–B14, EDIT-B1–B14 | < 60s |
| Suite 3 | VIbeGrid — Cell Renderers + Selection | CR all 27, SEL-B1–B16 | < 90s |
| Suite 4 | VIbeGrid — Data Controls + Column Interactions | DC-B0–B10, CI-B1–B8 | < 90s |
| Suite 5 | VIbeGrid — Clipboard + Row Expansion + Gantt + Export | CB-B1–B32, RE-B1–B11, GN-B1–B6, EX-B1–B7 | < 120s |
| Suite 6 | VIbeGrid — Cross-Cutting (Permissions, Org, Edge Cases) | CC-1–CC-5 | < 60s |

Total suite runtime target: < 8 min on staging.

**Auth:** All suites use `signInAs(page, 'ceo')` by default; Suite 6 also uses `viewer`, `admin`, `deb.admin`.

**Re-used helpers from existing eval system:**
- `signInAs()` — identical to COI/RFI pattern
- `orpc()` — identical to COI/RFI pattern
- `tryOrpc()` — identical to COI/RFI pattern
- `loadGroundTruth()` + `compareFields()` — from `apps/web/e2e/helpers/ground-truth.ts`
- `extractGridState()` — new, from `apps/web/e2e/helpers/grid-state.ts`

---

## Implementation Phases

### P1: Infrastructure — Helpers, Fixtures, Basic Mount Tests

**Goal:** Eval system exists and can be run; ground truth engine works for grid state.

**Files:**
- `apps/web/e2e/helpers/grid-state.ts` — `extractGridState`, `waitForGridReady`, `getCell`, `getCellAffordance`, `extractColumnValues`
- `apps/web/e2e/fixtures/vibegrid-ground-truth/widecorp-projects-default.json`
- `apps/web/e2e/smoke/vibegrid.spec.ts` — Suite 1 only (INF-1, INF-2, INF-3)

**TEST phase:**
1. Write `grid-state.ts` with TypeScript interfaces and stub implementations
2. Write Suite 1 test assertions against the stubs (they will fail)
3. Write `widecorp-projects-default.json` with placeholder values (row_count: 1)

**IMPL phase:**
1. Implement `extractGridState` using `page.locator('[role=grid]')` and ARIA attribute parsing
2. Implement `waitForGridReady` with polling
3. Implement `getCell` and `getCellAffordance`
4. Populate `widecorp-projects-default.json` by running `extractGridState` against staging and recording actual values
5. Verify Suite 1 tests pass on staging

**VERIFY:**
- `pnpm test:e2e --grep "VIbeGrid — Infrastructure"` passes on staging
- All 3 INF behaviors verified green

**Acceptance criteria:**
- `extractGridState` returns correct `rowCount` matching `aria-rowcount`
- `compareFields` with perfect match returns `accuracy: 1`
- Suite 1 completes in < 30s

---

### P2: Cell Renderer Coverage (27 types)

**Goal:** All 27 renderer types verified to display correctly.

**Files:**
- `apps/web/e2e/fixtures/vibegrid-ground-truth/widecorp-all-renderers.json`
- `apps/web/e2e/smoke/vibegrid.spec.ts` — Suite 3 (CR block)

**Prerequisite:** P1 complete; `extractGridState` functional.

**TEST phase:**
1. Write Suite 3 CR test block with parameterized tests for each renderer type
2. Write assertions: for each type, verify `aria-label` is non-empty and type-appropriate; use `field_matchers` with `string_similarity` threshold 0.8

**IMPL phase:**
1. Identify or create WideCorp entity schema with all 27 field types on staging
2. Run `extractGridState` against that entity list; record actual values into `widecorp-all-renderers.json`
3. Set `field_matchers` per field type:
   - Dates: `date_tolerance` with tolerance 1
   - Numbers/currency: `numeric_tolerance` with tolerance 0
   - All others: `string_similarity` with threshold 0.8

**VERIFY:**
- `pnpm test:e2e --grep "cell-renderer-display-coverage"` passes
- `compareFields` accuracy >= 0.90

**Acceptance criteria:**
- All 27 types render non-empty `aria-label`
- No renderer shows raw JSON or "[object Object]"
- `entityName` cells have `data-affordance="navigate"`

---

### P3: Core + Selection + Editing Behaviors (28 behaviors)

**Goal:** Core grid mechanics and cell editing fully tested.

**Files:**
- `apps/web/e2e/fixtures/vibegrid-ground-truth/widecorp-projects-sorted-name.json`
- `apps/web/e2e/smoke/vibegrid.spec.ts` — Suite 2 (CORE-B1–B14, EDIT-B1–B14), Suite 3 (SEL-B1–B16)

**Prerequisite:** P1 complete.

**TEST phase:**
1. Write Suite 2 test blocks for CORE and EDIT behaviors
2. Write Suite 3 SEL test block
3. Each behavior gets its own `test()` block with a descriptive name matching the behavior ID

**IMPL phase:**
1. Populate `widecorp-projects-sorted-name.json` with expected row order
2. Implement `extractColumnValues` helper and use in sort verification tests
3. Stub any missing test interactions (drag, complex keyboard sequences)

**VERIFY:**
- All 28 CORE + SEL + EDIT behaviors pass
- Inline row creation cleans up after itself (delete created entity)

**Acceptance criteria:**
- Sort order verification uses `localeCompare` not hardcoded string comparison
- Edit commit verified at API level (not just DOM)
- Undo/redo verified with pre/post `aria-label` comparison

---

### P4: Data Controls + Column Interactions (19 behaviors)

**Goal:** Filtering, grouping, search, presets, and column manipulation tested.

**Files:**
- `apps/web/e2e/fixtures/vibegrid-ground-truth/widecorp-projects-filtered-active.json`
- `apps/web/e2e/fixtures/vibegrid-ground-truth/widecorp-projects-grouped-status.json`
- `apps/web/e2e/smoke/vibegrid.spec.ts` — Suite 4 (DC-B0–B10, CI-B1–B8)

**Prerequisite:** P1 complete.

**TEST phase:**
1. Write Suite 4 DC test block: search, single filter, filter builder, grouping (single + multi + relationship), expansion/collapse, aggregations, presets
2. Write CI test block: resize, auto-size, reorder, context menu, header menu, row drag, action bar, bulk delete

**IMPL phase:**
1. Populate filter/group fixtures from staging
2. Implement column resize verification via computed CSS `width` before/after drag
3. Bulk delete test creates 2 test entities, selects them, deletes, verifies count decrease

**VERIFY:**
- Preset save/load round-trip verified across page reload
- Bulk delete test cleans up regardless of test outcome (use `test.afterEach` guard)

**Acceptance criteria:**
- Filter reduces `aria-rowcount` correctly
- Group headers present with `.vibegridx-group-header` or equivalent
- Bulk delete issues N `/dataforge/data/delete` calls for N selected rows

---

### P5: Clipboard + Row Expansion + Gantt + Export (56 behaviors)

**Goal:** All advanced system behaviors covered.

**Files:**
- `apps/web/e2e/smoke/vibegrid.spec.ts` — Suite 5 (CB-B1–B32, RE-B1–B11, GN-B1–B6, EX-B1–B7)

**Prerequisite:** P1–P4 complete.

**TEST phase:**
1. Write clipboard test block with key scenarios (copy, paste, cut, fill handle, type validation, marching ants)
2. Write row expansion test block; identify WideCorp entity type with children configured
3. Write Gantt test block; identify WideCorp entity with `start_date`/`end_date` fields
4. Write export test block using `page.waitForEvent('download')` pattern

**IMPL phase:**
1. Clipboard: use `page.keyboard.press('Control+c')` and `page.keyboard.press('Control+v')`; verify overlay CSS
2. Row expansion: use `[data-affordance="navigate"]` on expand button
3. Gantt: switch view via toolbar tab; verify `GanttViewStore` reflected in task bar CSS
4. Export: intercept download, check file size and magic bytes

**VERIFY:**
- Clipboard overlay attributes verified (selector TBD — audit `ClipboardOverlayDOM.ts` during implementation)
- Export download produces file > 100 bytes

**Acceptance criteria:**
- Fill handle drag fills 3 rows with source value
- PDF export contains `%PDF` magic bytes
- CSV export has comma-separated header row

---

### P6: Cross-Cutting — Permissions, Org Isolation, Edge Cases (5 behaviors)

**Goal:** Auth-sensitive and edge case behaviors verified.

**Files:**
- `apps/web/e2e/smoke/vibegrid.spec.ts` — Suite 6 (CC-1–CC-5)

**Prerequisite:** P1 complete (auth helper pattern reusable).

**TEST phase:**
1. Write Suite 6 test blocks for viewer, admin, DEB, empty state, and large dataset
2. Large dataset test includes `test.skip` if `aria-rowcount < 500` (graceful degradation)

**IMPL phase:**
1. Use `signInAs(page, 'viewer')` and `signInAs(page, 'deb.admin')` from existing pattern
2. Verify `[data-affordance="edit"].count() === 0` for viewer
3. Verify `[data-affordance="edit"].count() > 0` for admin
4. Empty entity type: confirm with team which WideCorp schema has zero records on staging (or create a dedicated one)

**VERIFY:**
- viewer test cannot edit any cell (no input appears after click)
- DEB admin row count differs from CEO row count on same entity path
- Large dataset test either passes or skips gracefully

**Acceptance criteria:**
- CC-3 org isolation verified by comparing first-row org-related field value between `ceo` and `deb.admin` sessions
- CC-4 empty state verified against a real empty entity schema, not a mocked one

---

## Testing Strategy (Suite 4 Self-Test Pattern)

Following the COI/RFI pattern, Suite 1 (Infrastructure) of `vibegrid.spec.ts` includes **eval helper self-tests** that verify the eval system itself works correctly before trusting the behavioral results. This is the "Suite 4 equivalent" for VIbeGrid.

### Self-tests included in Suite 1:

1. **`ground truth fixture loads`** — `loadGroundTruth('widecorp-projects-default.json')` returns valid `GroundTruth`; `expected_fields` has at least 3 keys

2. **`compareFields perfect match returns accuracy 1`** — call `compareFields(fixture.expected_fields, gt)` with exact match; assert `accuracy === 1` and `matchedFields === totalFields`

3. **`compareFields partial match returns accuracy < 1`** — mutate one field value; assert `accuracy < 1`; assert the mutated field's `FieldResult.match === false`

4. **`extractGridState returns correct structure`** — navigate to `/projects` as `ceo`; call `extractGridState`; assert `rowCount > 0`, `colCount > 0`, `headers.length === colCount`, `rows.length > 0`, `rows[0].cells` has at least one entry

5. **`waitForGridReady resolves within timeout`** — navigate; call `waitForGridReady`; assert resolves without throwing; timing should be < 10s

**Why this matters:** If `extractGridState` has a bug, all behavioral assertions built on it will produce false positives. These self-tests catch that before behavioral suites run. This mirrors how the COI eval's Suite 4 catches bugs in `compareFields` itself.

---

## Blast Radius Analysis

### Code Impact

**New files (no existing code modified):**
- `apps/web/e2e/helpers/grid-state.ts` — new helper, no imports by existing files
- `apps/web/e2e/fixtures/vibegrid-ground-truth/*.json` — new fixtures
- `apps/web/e2e/smoke/vibegrid.spec.ts` — new test file

**Existing files that may need minor updates:**
- `apps/web/playwright.config.ts` — may need `timeout` increase for Suite 5 (Gantt/export); check current `test.setTimeout` defaults
- `apps/web/e2e/helpers/ground-truth.ts` — no changes required; reused as-is
- Playwright global setup (`apps/web/e2e/global-setup.ts` if it exists) — may need auth token for staging run

### Database Impact

- Inline row creation tests (CORE-B13) create and delete real entities on staging — scoped to WideCorp test data; cleaned up in `test.afterEach`
- Bulk delete tests (CI-B8) create and delete test entities — same cleanup pattern as COI workflow tests
- No schema changes required

### API Impact

- No new API endpoints; all reads use existing oRPC `/dataforge/data/list`, `/dataforge/data/get`; writes use `/dataforge/data/update` and `/dataforge/data/delete`
- No breaking changes

### Test Impact

- Existing COI and RFI smoke tests: zero impact (no shared state)
- Playwright config: may need `projects` entry for staging-only suite or increased timeout
- CI pipeline: new tests add 8 min to staging eval run

### Performance Considerations

- Suite 5 (Clipboard + Row Expansion + Gantt + Export) has 56 behaviors and may need `test.setTimeout(120_000)` to prevent flakiness on slow staging environments
- Large dataset test (CC-5) should use `test.skip` guard rather than a hard 500-row requirement
- Gantt drag-move tests may need `page.waitForTimeout(500)` after drag for animation to settle

### Security Considerations

- No secrets required for grid eval (auth via `window.__auth` dev helper, not API keys)
- Org isolation test (CC-3) verifies data leakage prevention at the UI layer; underlying RLS enforcement is tested separately at the worker level

---

## Auxiliary Systems Integration

| System | Decision | Rationale |
|--------|----------|-----------|
| Notifications | Not needed | Grid eval tests have no notification-triggering actions |
| Real-time Sync | Not needed | Tests run sequentially; no concurrent update scenarios |
| Access Control | Tested by CC-1/CC-2/CC-3 | Viewer/Admin/Org isolation are test subjects, not dependencies |
| Audit Logging | Tested in EX-B5 | Audit history export behavior is a test subject |
| Workflows | Not needed | Grid is a display/edit primitive; no workflow triggers in eval |
| Settings | Not needed | Preset save/load uses `localStorage`, not settings API |
| Feature Flags | Not needed | VIbeGrid is fully enabled on staging; no flag gating |

---

## Requirements Interview Summary

### A. Core Functionality
- Cover all 151 test points: 119 documented behaviors (9 modules) + 27 cell renderer types + 5 cross-cutting
- Test against WideCorp prebuilt entities on staging (no synthetic/mocked data)
- Both rendering correctness (ARIA values match fixtures) and interaction correctness (edits persist, sorts reorder, etc.)

### B. Edge Cases
- Viewer role: zero edit affordances in DOM
- Empty entity type: empty state renders, no stuck spinner
- Large dataset (500+ rows): virtualization verified by DOM row count < `aria-rowcount`
- DEB org: row isolation verified by comparing row count and name values between `ceo` and `deb.admin` sessions

### C. Platform Integration Decisions
- Run target: staging (`dev.baseplane.ai`) — not local, not production
- Auth: `window.__auth.signIn(shorthand)` dev helper (same pattern as COI/RFI)
- No email, no Resend, no external API dependencies (grid eval is fully internal)
- Export tests intercept Playwright download events (no real file system delivery needed)

### D. UX Decisions
- Test naming: `VIbeGrid — {Module} — {BehaviorID}: {description}` for grep-ability
- Fixture file naming: `widecorp-{entity}-{scenario}.json` for clarity
- All test cleanup (created entities) in `test.afterEach` with `tryOrpc` (does not fail test if cleanup errors)

### E. Frontend Technical
- ARIA selectors are the primary DOM interface: `[role=grid]`, `[aria-rowindex]`, `[aria-colindex]`, `[aria-label]`, `[data-testid="cell-{rowId}-{colId}"]`, `[data-affordance]`
- `extractGridState` must handle grids where not all rows are in DOM (virtualization) — reads `aria-rowcount` for total (subtract 1 for header), reads only visible DOM rows
- `waitForGridReady` must distinguish "loading" from "empty" — both have 0 visible rows

### F. Backend Technical
- `orpc()` helper reused from COI/RFI for post-edit verification
- `tryOrpc()` used in test cleanup (non-fatal)
- No polling loops needed (unlike workflow evals); grid state is synchronous DOM inspection

### G. Scope
- Gantt included in scope (6 behaviors) — switching view mode is a low-risk operation
- All 32 clipboard behaviors included — high-value coverage, exercised via keyboard shortcuts
- No phasing or subsetting of the 151 behaviors — all in scope per requirements

### H. Implementation Sequencing
- P1 first (infrastructure): enables all later suites
- P2 before P3: cell renderer fixture needed before selection/editing assertions reference field types
- P5 last: most complex interactions; safe to defer until P1–P4 stable
- P6 independent: can be authored in parallel with P2–P5

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `apps/web/e2e/helpers/ground-truth.ts` | Existing `compareFields` engine — reuse as-is |
| `apps/web/e2e/helpers/grid-state.ts` | New: ARIA-based grid state extraction |
| `apps/web/e2e/smoke/coi-workflow.spec.ts` | Pattern reference: 4-suite structure, `signInAs`, `orpc` |
| `apps/web/e2e/smoke/rfi-workflow.spec.ts` | Pattern reference: copilot path, ground truth self-tests |
| `apps/web/e2e/smoke/vibegrid.spec.ts` | New: 6-suite VIbeGrid eval |
| `apps/web/e2e/fixtures/coi-ground-truth/knoble-250056.json` | Fixture format reference |
| `apps/web/e2e/fixtures/vibegrid-ground-truth/*.json` | New: 5 grid state fixtures |
| `apps/web/src/systems/vibegrid/slots/slot-initialization.ts` | 27 registered renderer types |
| `.claude/rules/vibegrid.md` | ARIA contract, store map, interaction rules |
| `.claude/rules/vibegrid-interactions.md` | Cell renderer DOM contract, `data-affordance`/`data-action` |
| `docs/primitives/vibegrid/core.md` | B1–B14 behavior definitions |
| `docs/primitives/vibegrid/editing.md` | B1–B14 editing behavior definitions |
| `docs/primitives/vibegrid/clipboard.md` | B1–B32 clipboard behavior definitions |
| `docs/primitives/vibegrid/selection.md` | B1–B16 selection behavior definitions |
| `docs/primitives/vibegrid/data-controls.md` | B0–B10 data controls behavior definitions |
| `docs/primitives/vibegrid/column-interactions.md` | B1–B8 column interaction behavior definitions |
| `docs/primitives/vibegrid/row-expansion.md` | B1–B11 row expansion behavior definitions |
| `docs/primitives/vibegrid/gantt.md` | B1–B6 gantt behavior definitions |
| `docs/primitives/vibegrid/export-services.md` | B1–B7 export behavior definitions |
