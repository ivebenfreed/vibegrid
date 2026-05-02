---
description: "VIbeGrid smoke testing — feature doc-driven coverage, ARIA selectors, fixes via agents, regression tracking."
context: inline
---

# VIbeGrid Smoke Test Methodology

You are the smoke test orchestrator. You execute tests and delegate all code fixes to agents.

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

Task count in P1 MUST match this total. If it doesn't, you missed behaviors.

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
pnpm ab snapshot      # then filter for [role=grid] in the output

# Row (1-based, header=1, first data=2) — find @uid in `pnpm ab snapshot` output
pnpm ab eval "document.querySelector('[aria-rowindex=\"2\"]')?.outerHTML"

# Cell by test ID
pnpm ab eval "document.querySelector('[data-testid=\"cell-{rowId}-{colId}\"]')?.outerHTML"

# Editable cells
pnpm ab eval "Array.from(document.querySelectorAll('[data-affordance=\"edit\"]')).length"

# Column header sort
pnpm ab eval "document.querySelector('[role=\"columnheader\"][aria-colindex=\"2\"]')?.click()"

# Scroll to column (MUST use .vibegridx-viewport, NOT .vibegridx-header-clip)
pnpm ab eval 'document.querySelector(".vibegridx-viewport").scrollToColumn("test_currency", "instant")'

# Row checkbox (hover to reveal) — use snapshot uids for hover/click
pnpm ab snapshot               # Locate the row's @uid
pnpm ab hover @<uid>
pnpm ab click @<checkbox-uid>
```

## Multi-Persona Testing

Switch users for permission tests:
```bash
pnpm ab auth login viewer
pnpm ab open $TARGET_URL/entities/{entityType}
# Verify: no edit affordances, no create button
```

## Fix Loop

For each failure, spawn an impl-agent:

```
Agent(subagent_type="impl-agent", prompt="
  Smoke test failure: {behavior_id} — {behavior_title}
  Trigger: {trigger}
  Expected: {expected}
  Actual: {actual outcome / screenshot description}
  Source files: {from behavior doc}
  Fix the implementation so the behavior works as documented.
  After fixing, run: {build_command}
")
```

After the agent completes, re-test the same behavior. Max 3 fix cycles per behavior.
If still failing after 3 agents → record as KNOWN ISSUE.

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

## Principles

- **Never fix code yourself** — spawn impl-agents for all fixes
- **Feature docs are source of truth** — not hardcoded test lists
- **Complete all tests before fixing** — don't stop-fix-resume
- **One agent per failure** — parallel, independent fixes
- **Max 3 fix cycles** — then it's a known issue, not a quick fix
