---
id: vibegrid-smoke
name: "VIbeGrid Smoke Test"
description: "Systematic VIbeGrid feature coverage — renderers, interactions, view modes, regressions"
mode: vibegrid-smoke
workflow_prefix: "VG"

phases:
  - id: p0
    name: Setup
    task_config:
      title: "P0: Setup - auth, discover schemas, find coverage entity"
      labels: [setup]
    steps:
      - id: setup-environment
        title: "Setup environment and discover entity types"
        instruction: |
          1. Confirm dev server:
          ```bash
          curl -sf http://localhost:$DEV_PORT/api/health
          ```

          2. Login primary test user:
          ```bash
          agent-browser auth login ceo
          ```

          3. Discover what entity types exist and what field types they have:
          ```bash
          pnpm bpd 'auth ceo | orpc /dataforge/schemas/list'
          ```

          4. Find the entity type with the MOST diverse field types — this is your
             primary coverage target. You want an entity that has text, number,
             currency, date, select, multi-select, boolean, URL, email, phone,
             computed, rollup, entity reference, etc.

             If no single entity covers everything, note which entities cover which
             field types. You may need to test across 2-3 entity types.

          5. Check that the coverage entity has data:
          ```bash
          pnpm bpd 'auth ceo | orpc /dataforge/entities/list {"entityType":"{best_entity}"}'
          ```

          6. If data is sparse, note which field types lack test data.

          Record:
          - Primary entity type for testing
          - Field type coverage map (which field types are on which entities)
          - Any gaps in test data

          Then: Mark this task completed via TaskUpdate

  - id: p1
    name: Renderers
    task_config:
      title: "P1: Renderers - verify every cell renderer type renders correctly"
      labels: [renderers, coverage]
      depends_on: [p0]
    steps:
      - id: test-renderers
        title: "Test all cell renderer types"
        instruction: |
          Navigate to the primary coverage entity's grid view:
          ```bash
          agent-browser open http://localhost:$DEV_PORT/entities/{entityType}
          ```

          Wait for grid to load, then get the grid overview:
          ```bash
          agent-browser snapshot -i -s "[role=grid]"
          ```

          **For EACH field type present in the grid, create a test task:**
          ```
          TaskCreate(subject="RENDERER: {field_type} — {column_name}")
          ```

          Then work through each task. For each renderer:

          1. Find the column via ARIA:
          ```bash
          agent-browser snapshot -i -s "[aria-label*='{column_name}']"
          ```

          2. Screenshot the cell with data:
          ```bash
          agent-browser screenshot /tmp/vg-renderer-{field_type}.png
          ```

          3. Judge: Does this render correctly for its type?
             - **text**: Shows string value, truncates with ellipsis if long
             - **number**: Shows numeric value, right-aligned
             - **currency**: Shows $ prefix, comma separators, 2 decimal places
             - **date**: Shows formatted date (not raw ISO string)
             - **boolean**: Shows checkbox or toggle icon
             - **select**: Shows badge/chip with option label and color
             - **multi_select**: Shows multiple badges
             - **email**: Shows email with mailto affordance
             - **phone**: Shows formatted phone number
             - **url**: Shows link with navigate affordance
             - **rating**: Shows star/dot rating visualization
             - **color**: Shows color swatch
             - **image**: Shows thumbnail or placeholder
             - **file**: Shows filename with icon
             - **markdown**: Shows rendered rich text (not raw markdown)
             - **computed_expression**: Shows calculated value, read-only styling
             - **computed_formula**: Shows formula result
             - **computed_decision_table**: Shows decision result
             - **rollup_count/sum/avg/concat**: Shows aggregated value
             - **entity_reference**: Shows linked entity name with navigate affordance
             - **user_reference**: Shows user name/avatar

          4. Record PASS/FAIL on the task with evidence screenshot.

          If an entity type doesn't have a field type you need to test,
          navigate to a different entity type that does:
          ```bash
          agent-browser open http://localhost:$DEV_PORT/entities/{other_entity}
          ```

          **Target: every cell renderer type that exists in any schema gets tested.**

          After all renderer tasks are done: Mark this task completed via TaskUpdate

  - id: p2
    name: Interactions
    task_config:
      title: "P2: Interactions - column ops, cell editing, row ops, filtering"
      labels: [interactions, coverage]
      depends_on: [p1]
    steps:
      - id: test-interactions
        title: "Test grid interaction patterns"
        instruction: |
          Create a test task for each interaction category, then work through them.

          **Column Operations:**
          ```
          TaskCreate(subject="INTERACT: Column sort — click header, verify asc/desc")
          TaskCreate(subject="INTERACT: Column resize — drag column border")
          TaskCreate(subject="INTERACT: Column reorder — drag column header to new position")
          TaskCreate(subject="INTERACT: Column hide/show — toggle column visibility")
          ```

          **Cell Editing:**
          ```
          TaskCreate(subject="INTERACT: Inline edit text — click cell, type, Enter to commit")
          TaskCreate(subject="INTERACT: Inline edit select — click cell, pick option from dropdown")
          TaskCreate(subject="INTERACT: Inline edit date — click cell, use date picker")
          TaskCreate(subject="INTERACT: Edit undo/redo — Ctrl+Z undoes, Ctrl+Shift+Z redoes")
          ```

          **Row Operations:**
          ```
          TaskCreate(subject="INTERACT: Row selection — hover reveals checkbox, click selects")
          TaskCreate(subject="INTERACT: Multi-select — select multiple rows, bulk action bar appears")
          TaskCreate(subject="INTERACT: Row expansion — click expand icon, nested content loads")
          TaskCreate(subject="INTERACT: Row navigate — click navigate affordance, opens detail view")
          ```

          **Data Controls:**
          ```
          TaskCreate(subject="INTERACT: Filter — apply text filter, grid narrows results")
          TaskCreate(subject="INTERACT: Group — group by status/select field, groups render")
          TaskCreate(subject="INTERACT: Search — global search filters across columns")
          ```

          **Export:**
          ```
          TaskCreate(subject="INTERACT: CSV export — export button downloads CSV with correct data")
          ```

          For each test, use agent-browser to perform the interaction:
          ```bash
          # Example: column sort
          agent-browser click "[aria-colindex='2'] [role='columnheader']"
          agent-browser screenshot /tmp/vg-interact-sort.png
          # Verify: first row changed, sort indicator visible
          ```

          For editing, use the affordance selectors:
          ```bash
          agent-browser click "[data-testid='cell-{rowId}-{colId}'] [data-affordance='edit']"
          agent-browser fill "[data-testid='cell-{rowId}-{colId}'] input" "new value"
          agent-browser keyboard Enter
          ```

          Record PASS/FAIL per interaction with screenshot evidence.

          Then: Mark this task completed via TaskUpdate

  - id: p3
    name: View Modes
    task_config:
      title: "P3: View Modes - table, gantt, kanban rendering and interactions"
      labels: [view-modes, coverage]
      depends_on: [p2]
    steps:
      - id: test-view-modes
        title: "Test view mode switching and mode-specific features"
        instruction: |
          Find an entity type that supports multiple view modes (needs date fields
          for gantt, status-set field for kanban).

          **Table Mode** (already tested in P1/P2 — just confirm it's baseline):
          ```
          TaskCreate(subject="VIEW: Table mode — grid renders with all columns")
          ```

          **Gantt Mode** (if entity has start_date/end_date or date fields):
          ```
          TaskCreate(subject="VIEW: Gantt switch — click Gantt, timeline renders")
          TaskCreate(subject="VIEW: Gantt bars — date ranges show as horizontal bars")
          TaskCreate(subject="VIEW: Gantt split pane — table left, timeline right, resizer works")
          ```

          **Kanban Mode** (if entity has a status-set/select field):
          ```
          TaskCreate(subject="VIEW: Kanban switch — click Kanban, cards render in columns")
          TaskCreate(subject="VIEW: Kanban grouping — cards grouped by status field")
          ```

          **View Management:**
          ```
          TaskCreate(subject="VIEW: Save view — save current config as named view")
          TaskCreate(subject="VIEW: Load view — select saved view, config restores")
          TaskCreate(subject="VIEW: View picker — shows pinned, my views, shared views")
          ```

          For mode switching:
          ```bash
          agent-browser click "text:Gantt"       # or whatever the mode switcher shows
          agent-browser screenshot /tmp/vg-gantt.png
          agent-browser snapshot -i -s "[role=grid]"
          ```

          Judge each mode: Does it render? Is the data visible? Are mode-specific
          features working (bars for gantt, columns for kanban)?

          Then: Mark this task completed via TaskUpdate

  - id: p4
    name: Cross-cutting
    task_config:
      title: "P4: Cross-cutting - permissions, multi-org, empty states, load"
      labels: [cross-cutting, coverage]
      depends_on: [p3]
    steps:
      - id: test-cross-cutting
        title: "Test permission boundaries, orgs, and edge cases"
        instruction: |
          **Permission Tests:**
          ```
          TaskCreate(subject="PERM: Viewer can see grid but not edit — login as viewer, verify read-only")
          TaskCreate(subject="PERM: Admin can edit — login as admin, verify edit affordances present")
          ```

          ```bash
          agent-browser auth login viewer
          agent-browser open http://localhost:$DEV_PORT/entities/{entityType}
          agent-browser snapshot -i -s "[role=grid]"
          # Check: no edit affordances, no bulk action bar, no create button
          ```

          **Cross-org Isolation:**
          ```
          TaskCreate(subject="ORG: DEB admin sees only DEB data — login as deb.admin, verify")
          ```

          ```bash
          agent-browser auth login deb.admin
          agent-browser open http://localhost:$DEV_PORT/entities/{entityType}
          # Verify: only DEB Construction data visible, no WideCorp bleed
          ```

          **Empty States:**
          ```
          TaskCreate(subject="EDGE: Empty entity type — grid shows empty state, not error")
          ```

          Navigate to an entity type with no records. Verify graceful empty state.

          **Load Performance (basic):**
          ```
          TaskCreate(subject="EDGE: Large dataset — grid with 100+ rows scrolls smoothly")
          ```

          If an entity has enough rows, scroll and verify virtual scrolling works
          (rows render as you scroll, no blank gaps).

          Then: Mark this task completed via TaskUpdate

  - id: p5
    name: Report
    task_config:
      title: "P5: Report - compile results, compare to last run, commit evidence"
      labels: [evidence, report]
      depends_on: [p4]
    steps:
      - id: compile-results
        title: "Compile regression report"
        instruction: |
          1. Review all test tasks created during this session.
             Compile a coverage matrix:

          ```json
          {
            "timestamp": "{ISO-8601}",
            "renderers": {
              "text": "PASS",
              "number": "PASS",
              "currency": "FAIL",
              "date": "PASS",
              ...
            },
            "interactions": {
              "column_sort": "PASS",
              "column_resize": "PASS",
              "cell_edit_text": "PASS",
              ...
            },
            "view_modes": {
              "table": "PASS",
              "gantt": "PASS",
              "kanban": "SKIP"
            },
            "cross_cutting": {
              "viewer_read_only": "PASS",
              "cross_org_isolation": "PASS",
              "empty_state": "PASS"
            },
            "summary": {
              "total": 45,
              "passed": 43,
              "failed": 1,
              "skipped": 1
            }
          }
          ```

          2. Check for previous run:
          ```bash
          ls -la .kata/verification-evidence/vg-smoke-*.json 2>/dev/null | tail -1
          ```

          3. If previous run exists, diff the results:
             - New failures (was PASS, now FAIL) = **REGRESSION**
             - New passes (was FAIL, now PASS) = **FIXED**
             - Stable failures = **KNOWN ISSUE**

          4. Write evidence:
          ```bash
          # Write to .kata/verification-evidence/vg-smoke-{date}.json
          ```

          5. Commit and push:
          ```bash
          git add .kata/verification-evidence/vg-smoke-*.json
          git commit -m "chore(vibegrid): smoke test results — {PASS|FAIL} ({passed}/{total})"
          git push
          ```

          6. Report to user:
             - Total coverage: {N} checks
             - Passed: {N}
             - Failed: {N} (list each with screenshot)
             - Regressions since last run: {list}
             - Fixed since last run: {list}

          Then: Mark this task completed via TaskUpdate

global_conditions:
  - changes_committed
  - changes_pushed
---

# VIbeGrid Smoke Test Mode

Systematic feature coverage testing for VIbeGrid — the platform's primary data grid.

## Why This Mode Exists

VIbeGrid has massive surface area: 28+ cell renderers, 3 view modes, dozens of
interaction patterns, permission-aware rendering, virtual scrolling, real-time sync.
A change to any renderer, the slot registry, column processing, or interaction store
can silently break features. This mode catches regressions by systematically walking
through every feature.

## How It Works

You don't write Playwright scripts. You use agent-browser to navigate the real app,
read the ARIA tree to find elements, screenshot cells, and judge whether each feature
renders and behaves correctly. ARIA attributes are stable across layout changes:

- `aria-label="Name: Acme Corp"` — semantic, not positional
- `data-testid="cell-{rowId}-{colId}"` — stable identifiers
- `data-affordance="edit"` — interaction capability markers
- `aria-rowindex`, `aria-colindex` — structural position

## Phase Flow

```
P0: Setup
    ├── Confirm dev server + auth
    ├── Discover entity schemas via API
    └── Find coverage entity (most diverse field types)

P1: Renderers (TaskCreate per field type)
    ├── Navigate to grid, read ARIA tree
    ├── Screenshot each cell renderer type
    └── Judge: renders correctly for its type?

P2: Interactions (TaskCreate per interaction)
    ├── Column ops: sort, resize, reorder, hide/show
    ├── Cell editing: text, select, date, undo/redo
    ├── Row ops: select, multi-select, expand, navigate
    └── Data controls: filter, group, search, export

P3: View Modes
    ├── Table → Gantt → Kanban switching
    ├── Mode-specific features (bars, cards, split pane)
    └── View save/load/share

P4: Cross-cutting
    ├── Permission boundaries (viewer vs admin)
    ├── Cross-org isolation (widecorp vs deb)
    └── Edge cases (empty state, large dataset)

P5: Report
    ├── Compile coverage matrix
    ├── Diff against previous run → regressions
    └── Commit evidence
```

## Renderer Reference

When judging renderers, here's what "correct" looks like:

| Type | Correct Rendering |
|------|-------------------|
| text | String value, ellipsis on overflow |
| number | Numeric, right-aligned |
| currency | $ prefix, commas, 2 decimals |
| date | Formatted date (not ISO string) |
| boolean | Checkbox or toggle icon |
| select | Colored badge/chip with label |
| multi_select | Multiple badges |
| email | Email text with mailto link |
| phone | Formatted number |
| url | Link text with navigate affordance |
| rating | Star/dot visualization |
| color | Color swatch |
| image | Thumbnail or placeholder |
| file | Filename with type icon |
| markdown | Rendered HTML (not raw) |
| computed | Calculated value, read-only style |
| rollup | Aggregated value |
| entity_ref | Entity name with navigate link |
| user_ref | User name or avatar |

## ARIA Selectors Quick Reference

```bash
# Grid overview
agent-browser snapshot -i -s "[role=grid]"

# Specific row
agent-browser snapshot -i -s "[aria-rowindex='2']"

# Cell by test ID
agent-browser snapshot -i -s "[data-testid='cell-{rowId}-{colId}']"

# Find editable cells
agent-browser snapshot -i -s "[data-affordance='edit']"

# Find navigable cells
agent-browser snapshot -i -s "[data-affordance='navigate']"

# Row checkbox (hover first)
agent-browser hover "[aria-rowindex='3']"
agent-browser click "[aria-rowindex='3'] .vibegridx-row-checkbox"
```

## Regression Tracking

Each run produces `.kata/verification-evidence/vg-smoke-{date}.json`.
Compare against the most recent previous run to detect:
- **REGRESSION**: was PASS → now FAIL (something broke)
- **FIXED**: was FAIL → now PASS (something got fixed)
- **KNOWN**: was FAIL → still FAIL (pre-existing issue)

Over time, this builds a regression history for VIbeGrid health.
