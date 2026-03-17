---
id: vibegrid-smoke
name: "VIbeGrid Smoke Test"
description: "Systematic VIbeGrid feature coverage driven by feature docs — renderers, interactions, view modes, regressions"
mode: vibegrid-smoke
workflow_prefix: "VG"

phases:
  - id: p0
    name: Setup
    task_config:
      title: "P0: Setup - auth, dev server, discover test data"
      labels: [setup]
    steps:
      - id: setup-environment
        title: "Setup environment and find coverage entity"
        instruction: |
          1. Confirm dev server:
          ```bash
          curl -sf http://localhost:$DEV_PORT/api/health
          ```

          2. Login primary test user:
          ```bash
          agent-browser auth login ceo
          ```

          3. Discover entity types and find one with diverse field types:
          ```bash
          pnpm bpd 'auth ceo | orpc /dataforge/schema/getAll'
          ```

          Pick the entity type with the most diverse field coverage (text, number,
          currency, date, select, boolean, entity references, computed, etc.).
          If no single entity covers all types, note which entities cover what.

          4. Verify it has data:
          ```bash
          pnpm bpd 'auth ceo | orpc /dataforge/entities/list {"entityType":"{best_entity}"}'
          ```

          Record your primary test entity and any secondary entities needed.
          Then: Mark this task completed via TaskUpdate

  - id: p1
    name: Load Coverage
    task_config:
      title: "P1: Load coverage - read all VIbeGrid feature docs, build test plan"
      labels: [planning, coverage]
      depends_on: [p0]
    steps:
      - id: read-feature-docs
        title: "Read all VIbeGrid feature docs and extract behaviors"
        instruction: |
          Read ALL VIbeGrid feature documentation. These are your source of truth
          for what to test. Read each file IN FULL:

          **Primitive behavior docs (TEVS format — Trigger/Expected/Verify/Source):**
          ```bash
          # Dynamic discovery — read ALL behavior docs under the primitive
          for f in docs/primitives/vibegrid/*.md; do cat "$f"; done
          ```

          **Rules (architecture, slot registry, cell renderers, interactions):**
          ```bash
          cat .claude/rules/vibegrid.md
          cat .claude/rules/vibegrid-interactions.md
          ```

          **Coverage gate:** Count total behaviors discovered:
          ```bash
          grep -c '^### B[0-9]' docs/primitives/vibegrid/*.md
          ```
          The test task count in P2 MUST match this total. If it doesn't,
          you missed behaviors.

          After reading everything, you should have a complete inventory of:
          - Every behavior (B1, B2, ...) across all VIbeGrid behavior docs
          - Every cell renderer type from the slot registry
          - Every interaction pattern from the interaction rules
          - Every view mode and its specific features

          Then: Mark this task completed via TaskUpdate

      - id: generate-test-tasks
        title: "Generate test tasks from feature docs"
        instruction: |
          Create test tasks using TaskCreate for EVERY behavior found in the docs.

          **Group tasks by module — use the doc structure:**

          From `core/core.md` behaviors:
          ```
          TaskCreate(subject="CORE B1: Grid renders rows from data source")
          TaskCreate(subject="CORE B2: Column headers display with sort indicators")
          TaskCreate(subject="CORE B3: Click column header sorts data")
          ... (every behavior from the doc)
          ```

          From `data-controls/data-controls.md`:
          ```
          TaskCreate(subject="DATA B0: Global text search filters rows")
          TaskCreate(subject="DATA B1: Simple column filtering")
          ... (every behavior)
          ```

          From `gantt/gantt.md`:
          ```
          TaskCreate(subject="GANTT B1: Timeline renders with zoom controls")
          ... (every behavior)
          ```

          From `export-services/export-services.md`:
          ```
          TaskCreate(subject="EXPORT B1: Generate PDF from React template")
          ... (every behavior)
          ```

          From `entity-view-customization.md`:
          ```
          TaskCreate(subject="VIEWS B1: URL state persistence")
          ... (every behavior)
          ```

          **Add cell renderer coverage from rules/slot registry:**
          For each cell renderer type listed in vibegrid-interactions.md or
          the slot initialization code:
          ```
          TaskCreate(subject="RENDERER: text cell renders string correctly")
          TaskCreate(subject="RENDERER: currency cell shows $ and decimals")
          TaskCreate(subject="RENDERER: date cell shows formatted date")
          TaskCreate(subject="RENDERER: select cell shows colored badge")
          ... (every renderer type found)
          ```

          **Add cross-cutting tasks:**
          ```
          TaskCreate(subject="PERM: Viewer sees grid but cannot edit")
          TaskCreate(subject="PERM: Admin sees edit affordances")
          TaskCreate(subject="ORG: DEB admin sees only DEB data")
          TaskCreate(subject="EDGE: Empty entity type shows empty state")
          TaskCreate(subject="EDGE: Large dataset virtual scrolling works")
          ```

          **Include the behavior's Trigger/Expected/Verify in each task description**
          so you have the full context when executing:
          ```
          TaskCreate(
            subject="CORE B3: Click column header sorts data",
            description="Trigger: User clicks a column header. Expected: Data sorts ascending first click, descending second, unsorted third. Verify: Rows reorder visibly, sort arrow changes direction."
          )
          ```

          Count total tasks created. This is your coverage number.
          Then: Mark this task completed via TaskUpdate

  - id: p2
    name: Execute
    task_config:
      title: "P2: Execute - test every behavior with agent-browser + bpd"
      labels: [execution, testing]
      depends_on: [p1]
    steps:
      - id: execute-tests
        title: "Execute all test tasks"
        instruction: |
          Work through EVERY test task created in P1. No skipping.

          **For each task, follow the behavior's Trigger → Expected → Verify:**

          1. **Setup** — navigate to the right page, login as right user:
          ```bash
          agent-browser open http://localhost:$DEV_PORT/entities/{entityType}
          agent-browser snapshot -i -s "[role=grid]"
          ```

          2. **Trigger** — perform what the behavior doc says:
          ```bash
          # Examples based on behavior triggers:
          agent-browser click "[role='columnheader'][aria-colindex='2']"  # sort
          agent-browser fill "[data-testid='search-input']" "search term" # search
          agent-browser click "[data-affordance='edit']"                   # edit cell
          agent-browser hover "[aria-rowindex='3']"                        # reveal checkbox
          ```

          3. **Verify** — check what the behavior doc says to verify:
          ```bash
          agent-browser screenshot /tmp/vg-{task-id}.png
          agent-browser snapshot -i -s "[role=grid]"
          # Compare against Expected from the behavior doc
          ```

          4. **Judge** — PASS if the Expected outcome matches, FAIL if not.

          5. **Record** — update the task:
          ```
          TaskUpdate(taskId="N", status="completed",
            description="PASS: Rows reorder on sort click, arrow indicator visible. Evidence: /tmp/vg-sort.png")
          ```
          Or:
          ```
          TaskUpdate(taskId="N", status="completed",
            description="FAIL: Sort click has no effect, rows stay in original order. Evidence: /tmp/vg-sort-fail.png")
          ```

          **Renderer testing:** Use `scrollToColumn` to bring columns into view,
          then verify rendering:
          ```bash
          # Scroll to the column first
          agent-browser eval 'document.querySelector(".vibegridx-viewport").scrollToColumn("test_currency", "instant")'
          agent-browser screenshot /tmp/vg-renderer-currency.png
          # Judge: does it show $ prefix, comma separators, 2 decimal places?
          ```

          **Multi-persona testing:** Switch users for permission tests:
          ```bash
          agent-browser auth login viewer
          agent-browser open http://localhost:$DEV_PORT/entities/{entityType}
          # Verify: no edit affordances, no create button
          ```

          **View mode testing:** Switch between modes:
          ```bash
          agent-browser click "text:Gantt"    # switch to gantt
          agent-browser screenshot /tmp/vg-gantt.png
          ```

          **Don't stop on failure.** Complete ALL tasks, then handle failures in P3.

          After all tasks done: Mark this task completed via TaskUpdate

  - id: p3
    name: Fix Loop
    task_config:
      title: "P3: Fix Loop - diagnose and fix failures (max 3 cycles each)"
      labels: [fix-loop]
      depends_on: [p2]
    steps:
      - id: handle-failures
        title: "Fix failures and re-test"
        instruction: |
          Review all test tasks. List failures.

          If ALL passed: mark this task completed and skip to P4.

          For each failure, up to 3 fix cycles:
          1. **Diagnose** — look at the screenshot, read the relevant source code
             (the behavior doc lists Source files)
          2. **Fix** — make the minimal code change
          3. **Re-test** — re-run the exact same behavior test
          4. **Commit fix:**
          ```bash
          git add {changed files}
          git commit -m "fix(vibegrid): {what was broken} — caught by smoke test"
          ```

          If still failing after 3 cycles: record as KNOWN ISSUE.
          Then: Mark this task completed via TaskUpdate

  - id: p4
    name: Report
    task_config:
      title: "P4: Report - compile coverage matrix, compare to last run, commit"
      labels: [evidence, report]
      depends_on: [p3]
    steps:
      - id: compile-and-compare
        title: "Compile results and regression diff"
        instruction: |
          1. Compile coverage matrix from all test tasks:

          ```json
          {
            "timestamp": "{ISO-8601}",
            "modules": {
              "core": {
                "B1_grid_render_rows": "PASS",
                "B2_column_headers_sort": "PASS",
                "B3_click_header_sort": "FAIL",
                ...
              },
              "data_controls": {
                "B0_global_text_search": "PASS",
                ...
              },
              "gantt": { ... },
              "export": { ... },
              "views": { ... },
              "renderers": {
                "text": "PASS",
                "currency": "PASS",
                ...
              },
              "cross_cutting": {
                "viewer_read_only": "PASS",
                "cross_org_isolation": "PASS",
                ...
              }
            },
            "summary": {
              "total": 0,
              "passed": 0,
              "failed": 0,
              "skipped": 0,
              "known_issues": 0
            }
          }
          ```

          2. Check for previous run:
          ```bash
          ls -t .kata/verification-evidence/vg-smoke-*.json 2>/dev/null | head -1
          ```

          3. If previous run exists, compare:
             - **REGRESSION**: was PASS → now FAIL
             - **FIXED**: was FAIL → now PASS
             - **KNOWN**: was FAIL → still FAIL

          4. Write evidence:
             File: `.kata/verification-evidence/vg-smoke-{YYYY-MM-DD}.json`

          5. Commit and push:
          ```bash
          git add .kata/verification-evidence/vg-smoke-*.json
          git commit -m "chore(vibegrid): smoke test {date} — {passed}/{total} ({regressions} regressions)"
          git push
          ```

          6. Report to user:
             - Coverage: {N} behaviors tested across {M} modules
             - Passed: {N} | Failed: {N} | Known issues: {N}
             - Regressions since last run: {list or "none"}
             - Fixed since last run: {list or "none"}
             - Failures: {list with screenshots}

          Then: Mark this task completed via TaskUpdate

global_conditions:
  - changes_committed
  - changes_pushed
---

# VIbeGrid Smoke Test Mode

Systematic feature coverage testing for VIbeGrid, driven by feature documentation.

## Source of Truth

Test coverage comes from the feature docs — NOT hardcoded lists:

```
docs/primitives/vibegrid/core.md              — Grid rendering, virtualization, selection
docs/primitives/vibegrid/editing.md           — Inline editing, blur policy, undo/redo
docs/primitives/vibegrid/clipboard.md         — Copy/paste, fill handle
docs/primitives/vibegrid/column-interactions.md — Resize, reorder, context menu, bulk actions
docs/primitives/vibegrid/data-controls.md     — Search, filtering, grouping, presets
docs/primitives/vibegrid/gantt.md             — Timeline, task bars, dependencies
docs/primitives/vibegrid/export-services.md   — CSV, PDF, ZIP export
docs/primitives/vibegrid/row-expansion.md     — Row expansion states
.claude/rules/vibegrid.md                     — Architecture, slot registry
.claude/rules/vibegrid-interactions.md        — Cell renderers, interaction patterns
```

When new behaviors are added to these docs, the smoke test automatically picks them up.
No template changes needed.

## How It Works

1. Read all VIbeGrid feature docs
2. Extract every behavior (B1, B2... with Trigger/Expected/Verify)
3. Create a test task for each behavior
4. Execute each test with agent-browser (ARIA selectors, screenshots)
5. Judge PASS/FAIL against the behavior's Expected outcome
6. Fix failures (max 3 cycles)
7. Compare against previous run → detect regressions

## Phase Flow

```
P0: Setup
    ├── Confirm dev server + auth
    └── Find entity type with diverse field coverage

P1: Load Coverage
    ├── Read ALL vibegrid feature docs + rules
    ├── Extract every behavior + renderer + interaction
    └── Create test tasks via TaskCreate (one per behavior)

P2: Execute
    ├── For each task: Trigger → Verify → Judge → Record
    ├── Use agent-browser with ARIA selectors
    ├── Screenshot every test for evidence
    └── Don't stop on failure — complete all tasks

P3: Fix Loop
    ├── Diagnose failures using source file references from docs
    ├── Fix code, re-test (max 3 cycles)
    └── Record unfixed as KNOWN ISSUE

P4: Report
    ├── Compile coverage matrix (per-module, per-behavior)
    ├── Diff against previous run → REGRESSION / FIXED / KNOWN
    └── Commit evidence + report
```

## ARIA Selectors Reference

VIbeGrid emits stable ARIA attributes for agent-browser:

```bash
# Grid overview (row count, column count)
agent-browser snapshot -i -s "[role=grid]"

# Specific row (1-based, header=1, first data row=2)
agent-browser snapshot -i -s "[aria-rowindex='2']"

# Cell by test ID
agent-browser snapshot -i -s "[data-testid='cell-{rowId}-{colId}']"

# Find editable cells
agent-browser snapshot -i -s "[data-affordance='edit']"

# Find navigable cells (links)
agent-browser snapshot -i -s "[data-affordance='navigate']"

# Cell label (semantic)
agent-browser snapshot -i -s "[aria-label*='Currency']"

# Row checkbox (hover to reveal, then click)
agent-browser hover "[aria-rowindex='3']"
agent-browser click "[aria-rowindex='3'] .vibegridx-row-checkbox"

# Column header
agent-browser click "[role='columnheader'][aria-colindex='2']"

# Scroll to a column by ID (centers it in viewport, syncs header)
agent-browser eval 'document.querySelector(".vibegridx-viewport").scrollToColumn("test_email")'

# Scroll to column with instant jump (no smooth animation)
agent-browser eval 'document.querySelector(".vibegridx-viewport").scrollToColumn("test_currency", "instant")'

# IMPORTANT: Always scroll via .vibegridx-viewport (NOT .vibegridx-header-clip)
# The header syncs automatically via CSS transform
```

## Regression Tracking

Each run writes `.kata/verification-evidence/vg-smoke-{date}.json`.
Diff against previous run:

| Transition | Meaning | Action |
|------------|---------|--------|
| PASS → FAIL | **REGRESSION** | Something broke — investigate |
| FAIL → PASS | **FIXED** | Something got fixed — celebrate |
| FAIL → FAIL | **KNOWN ISSUE** | Pre-existing problem |
| PASS → PASS | **STABLE** | Still working |

Run regularly after VIbeGrid changes to catch regressions early.
