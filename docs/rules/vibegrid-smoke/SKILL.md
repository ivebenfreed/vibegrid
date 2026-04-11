---
description: "VIbeGrid smoke testing — feature doc-driven coverage, ARIA selectors, regression tracking."
context: inline
---

# VIbeGrid Smoke Test Methodology

## Source of Truth

Test coverage comes from feature docs — NOT hardcoded lists:

- `docs/primitives/vibegrid/*.md` — behavior docs (TEVS format)
- `.claude/rules/vibegrid.md` — architecture, slot registry
- `.claude/rules/vibegrid-interactions.md` — cell renderers, interaction patterns

## Feature Doc Reading

Read ALL VIbeGrid docs. Extract every behavior with TEVS fields:
- **Trigger:** what causes the behavior
- **Expected:** what should happen
- **Verify:** how to confirm it works
- **Source:** relevant source files

### Coverage Gate

```bash
grep -c '^### B[0-9]' docs/primitives/vibegrid/*.md
```

Task count in P2 MUST match this total. If it doesn't, you missed behaviors.

## Test Task Generation

Create one task per behavior, grouped by module:

| Module | Source |
|--------|--------|
| CORE | core.md |
| DATA | data-controls.md |
| GANTT | gantt.md |
| EXPORT | export-services.md |
| VIEWS | entity-view-customization.md |
| RENDERER | vibegrid-interactions.md (slot registry) |
| Cross-cutting | permissions, multi-org, edge cases |

Include Trigger/Expected/Verify in each task description.

## Execution Protocol

For each behavior:

1. **Setup** — navigate to right page, login as right user
2. **Trigger** — perform what the behavior doc says
3. **Verify** — screenshot + snapshot, compare against Expected
4. **Judge** — PASS if Expected matches, FAIL if not
5. **Record** — update task with verdict and evidence path

**Don't stop on failure.** Complete ALL tasks, then handle failures.

## ARIA Selectors

```bash
# Grid overview
agent-browser snapshot -i -s "[role=grid]"

# Row (1-based, header=1, first data=2)
agent-browser snapshot -i -s "[aria-rowindex='2']"

# Cell by test ID
agent-browser snapshot -i -s "[data-testid='cell-{rowId}-{colId}']"

# Editable cells
agent-browser snapshot -i -s "[data-affordance='edit']"

# Column header sort
agent-browser click "[role='columnheader'][aria-colindex='2']"

# Scroll to column (MUST use .vibegridx-viewport, NOT .vibegridx-header-clip)
agent-browser eval 'document.querySelector(".vibegridx-viewport").scrollToColumn("test_currency", "instant")'

# Row checkbox (hover to reveal)
agent-browser hover "[aria-rowindex='3']"
agent-browser click "[aria-rowindex='3'] .vibegridx-row-checkbox"
```

## Multi-Persona Testing

Switch users for permission tests:
```bash
agent-browser eval "window.__auth.signIn('viewer').then(r => JSON.stringify(r))"
agent-browser open $TARGET_URL/entities/{entityType}
# Verify: no edit affordances, no create button
```

## Fix Loop

For each failure, up to 3 cycles:
1. **Diagnose** — screenshot + source file from behavior doc
2. **Fix** — minimal code change
3. **Re-test** — same behavior test
4. **Commit:** `fix(vibegrid): {what} — caught by smoke test`

If still failing after 3 cycles → record as KNOWN ISSUE.

## Coverage Matrix (Evidence)

Write to `.kata/verification-evidence/vg-smoke-{YYYY-MM-DD}.json`:

```json
{
  "timestamp": "{ISO-8601}",
  "modules": {
    "core": { "B1_name": "PASS", "B2_name": "FAIL" },
    "data_controls": { ... },
    "renderers": { "text": "PASS", "currency": "PASS" },
    "cross_cutting": { "viewer_read_only": "PASS" }
  },
  "summary": {
    "total": 0, "passed": 0, "failed": 0,
    "skipped": 0, "known_issues": 0
  }
}
```

## Regression Tracking

Diff against previous run:

| Transition | Meaning | Action |
|------------|---------|--------|
| PASS → FAIL | **REGRESSION** | Investigate |
| FAIL → PASS | **FIXED** | Celebrate |
| FAIL → FAIL | **KNOWN ISSUE** | Pre-existing |
| PASS → PASS | **STABLE** | Still working |
