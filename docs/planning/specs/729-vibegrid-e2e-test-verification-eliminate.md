---
issue: 729
type: feature
title: VibeGrid E2E Test Verification - Eliminate Silent Skips
status: draft
created: 2026-01-03
updated: 2026-01-03
template: full-stack
---

# Feature Planning: VibeGrid E2E Test Verification - Eliminate Silent Skips

> **Instructions for Agent:**
> Fill this template during PLANNING session by exploring the codebase.
> Every field must contain ACTUAL file paths and patterns, not placeholders.
> Run searches, read files, understand conventions before filling.
> Mark sections N/A if not applicable to this feature.

---

## Research Context

### Related Research

| Research Issue | Title | How It Informs This Feature |
|----------------|-------|----------------------------|
| #488 | VibeGrid E2E Comprehensive Field Types | Original test suite implementation, identifies all field types |
| #572 | Playwright to Puppeteer Migration | Current E2E infrastructure uses Puppeteer+Vitest |

### Key Findings Applied

1. **Finding:** Tests use `console.log('SKIP: ...'); return` pattern that silently passes
   **Impact on spec:** Replace all skip patterns with `throw new Error('Element not found: ...')` for immediate failure

2. **Finding:** UI components use CSS class selectors (e.g., `.vibegridx-boolean-editor`) but lack data attributes
   **Impact on spec:** Add `data-testid`, `data-field-type`, `data-column-id`, `data-editable` to all 6 field type editors

3. **Finding:** Chrome DevTools infrastructure exists at `.claude/skills/chrome-devtools/` for screenshots
   **Impact on spec:** Use for manual verification phase, store evidence in `/tmp/e2e-evidence/`

### Unresolved Questions from Research

| Question | How Addressed in Spec |
|----------|----------------------|
| How to handle tests where element genuinely doesn't exist vs rendering failure? | If element not found after page load, that's a TEST FAILURE - the test data should guarantee elements exist |

---

## 0. Feature Context

**GitHub Issue:** #729
**Acceptance Criteria:**

1. **No Silent Skips**: All tests in `apps/web/e2e/vibegrid/field-types/*.spec.ts` must FAIL when expected elements are not found (no `console.log('SKIP:...')` patterns)
2. **UI Test-Friendly Attributes**: All 6 field type editors have full attribute set: `data-testid`, `data-field-type`, `data-column-id`, `data-editable`
3. **Evidence-Based Verification**: Manual walkthrough with Chrome DevTools captures screenshots to `/tmp/e2e-evidence/` for each test case
4. **100% Test Execution**: When tests run, ALL assertions execute - no early returns that skip verification logic
5. **Pass/Fail Clarity**: Running `pnpm test:e2e apps/web/e2e/vibegrid/field-types/` shows accurate pass/fail status

**Related Features:**

- GH#488: Original VibeGrid E2E test suite (defines test structure)
- GH#572: Playwright to Puppeteer migration (defines current infrastructure)
- `apps/web/src/systems/vibegrid/field-types/`: Field type implementations with editor classes

---

## 0.5 BASELINE VERIFICATION (BLOCKING)

> **CRITICAL:** Before ANY implementation, manually verify existing related features work.
> If baseline is broken → STOP → File bug → Fix baseline first.
> See `.claude/rules/incremental-verification.md` for full protocol.

### Pre-Implementation Checks

| Check | How to Verify | Expected Result | Status |
|-------|---------------|-----------------|--------|
| Dev server running | `./scripts/dev/list-dev-servers.sh` | Server on expected port | [ ] |
| VibeGrid test page loads | Navigate to `/debug/vibegrid-test/field-types` | Page renders with grid | [ ] |
| Boolean field visible | Find cell with `data-column-id="is_active"` | Boolean badges render | [ ] |
| Select field visible | Find cell with `data-column-id="status"` | Status badges render | [ ] |
| E2E tests run | `pnpm test:e2e apps/web/e2e/vibegrid/field-types/boolean.spec.ts` | Tests execute (even with skips) | [ ] |
| Chrome DevTools work | `node .claude/skills/chrome-devtools/scripts/run.js "screenshot /tmp/baseline.png"` | Screenshot saved | [ ] |

**If ANY check fails:**
1. STOP planning
2. File a bug issue for the broken baseline
3. Fix baseline before extending

### Baseline Verification Task (auto-created in Beads)
```bash
# This task MUST be first and MUST block all implementation
BASELINE=$(bd create --title="GH#729: VERIFY baseline - VibeGrid test page renders all field types" --type=task --priority=0 --labels=testing --silent)
```

---

## 1. Backend / API

**N/A** - This feature is purely frontend/testing focused. No backend changes required.

- No new API endpoints
- No database changes
- No server-side business logic

---

## 2. Frontend / UI

### 2.1 Files to Modify

This feature modifies 6 existing field type implementations to add test-friendly attributes:

| File Path | Current State | Changes Required |
|-----------|---------------|------------------|
| `apps/web/src/systems/vibegrid/field-types/implementations/basic/BooleanFieldType.ts` | Has `.vibegridx-boolean-editor` class | Add `data-testid`, `data-field-type`, `data-column-id`, `data-editable` |
| `apps/web/src/systems/vibegrid/field-types/implementations/basic/SelectFieldType.ts` | Has `.vibegridx-select-editor` class | Add `data-testid`, `data-field-type`, `data-column-id`, `data-editable` |
| `apps/web/src/systems/vibegrid/field-types/implementations/basic/DateFieldType.ts` | Has editor class | Add `data-testid`, `data-field-type`, `data-column-id`, `data-editable` |
| `apps/web/src/systems/vibegrid/field-types/implementations/basic/RatingFieldType.ts` | Has editor class | Add `data-testid`, `data-field-type`, `data-column-id`, `data-editable` |
| `apps/web/src/systems/vibegrid/field-types/implementations/basic/SliderFieldType.ts` | Has editor class | Add `data-testid`, `data-field-type`, `data-column-id`, `data-editable` |
| `apps/web/src/systems/vibegrid/field-types/implementations/basic/ColorFieldType.ts` | Has editor class | Add `data-testid`, `data-field-type`, `data-column-id`, `data-editable` |

### 2.2 Data Attribute Specification

**All editor elements must have:**

```html
<!-- Example: Boolean editor -->
<select
  class="vibegridx-boolean-editor"
  data-testid="boolean-editor"
  data-field-type="boolean"
  data-column-id="{column.id}"
  data-editable="true"
>
```

| Attribute | Purpose | Value |
|-----------|---------|-------|
| `data-testid` | E2E test identification | `{fieldType}-editor` (e.g., `boolean-editor`, `select-editor`) |
| `data-field-type` | Field type identification | `boolean`, `select`, `date`, `rating`, `slider`, `color` |
| `data-column-id` | Column being edited | Dynamic from `column.id` |
| `data-editable` | Editable state | `"true"` or `"false"` |

### 2.3 Implementation Pattern (BooleanFieldType.ts Example)

**Current code (line ~212-224):**
```typescript
select.className = 'vibegridx-boolean-editor'
select.style.cssText = `...`
```

**Updated code:**
```typescript
select.className = 'vibegridx-boolean-editor'
select.setAttribute('data-testid', 'boolean-editor')
select.setAttribute('data-field-type', 'boolean')
select.setAttribute('data-column-id', column.id)
select.setAttribute('data-editable', 'true')
select.style.cssText = `...`
```

### 2.4 No New Files

**No new files** - Only modifying existing field type implementations.

### 2.5 No Store/Route Changes

**No MobX store changes** - Test infrastructure only
**No routing changes** - Existing `/debug/vibegrid-test/field-types` route

---

## 3. Database / DataForge

**N/A** - This feature is purely frontend/testing focused. No database changes required.

- No new entities or archetypes
- No schema migrations
- No relationship changes

---

## 4. Security

**N/A** - This feature only adds data attributes to UI elements for testing purposes.

- No new API endpoints to secure
- No data access pattern changes
- Test infrastructure only runs in development/CI environments

---

## 5. Test Strategy

> **CRITICAL:** This feature is about FIXING the test infrastructure itself.
> The verification approach is manual walkthrough with screenshot evidence.

### 5.1 Test Environment

| Requirement | Value | Notes |
|-------------|-------|-------|
| Organization | Wide Corp Solutions | Uses test fixtures |
| User/Role | `ceo@widecorp.com` (owner) | Any authenticated user works |
| External Services | None | Local testing only |
| Test Data | Fixtures from `/debug/vibegrid-test/field-types` | Load fixtures button on test page |
| Dev Server | `$DEV_PORT` from `.env.local` | Use `./scripts/dev/setup.sh` |
| Chrome | Remote debugging enabled | Port `$DEV_PORT + 11000` |

**Environment Readiness Check:**
```bash
# 1. Start dev server with Chrome
./scripts/dev/setup.sh

# 2. Verify server running
./scripts/dev/list-dev-servers.sh

# 3. Login as test user
./scripts/auth/login-test-user.sh "ceo@widecorp.com" "WideCorp2024!CEO"

# 4. Verify Chrome DevTools work
node .claude/skills/chrome-devtools/scripts/run.js "goto http://localhost:$DEV_PORT/debug/vibegrid-test/field-types | screenshot /tmp/e2e-evidence/env-ready.png"
```

### 5.2 Test Cases by Category

#### Category 1: Silent Skip Elimination (6 test files)

| # | Test File | Skip Patterns to Fix | Expected After Fix |
|---|-----------|---------------------|-------------------|
| 1.1 | `boolean.spec.ts` | Lines 93, 103, 148, 212, 248, 296, 309, 353, 411, 433 | Tests FAIL if elements not found |
| 1.2 | `select.spec.ts` | Lines with `console.log('SKIP:...'); return` | Tests FAIL if elements not found |
| 1.3 | `date.spec.ts` | Lines with `console.log('SKIP:...'); return` | Tests FAIL if elements not found |
| 1.4 | `rating.spec.ts` | Lines with `console.log('SKIP:...'); return` | Tests FAIL if elements not found |
| 1.5 | `slider.spec.ts` | Lines with `console.log('SKIP:...'); return` | Tests FAIL if elements not found |
| 1.6 | `color.spec.ts` | Lines with `console.log('SKIP:...'); return` | Tests FAIL if elements not found |

#### Category 2: Data Attribute Addition (6 field types)

| # | Field Type | Editor Element | Attributes to Add |
|---|------------|----------------|-------------------|
| 2.1 | Boolean | `<select class="vibegridx-boolean-editor">` | `data-testid="boolean-editor"`, `data-field-type="boolean"`, `data-column-id`, `data-editable` |
| 2.2 | Select | `<select class="vibegridx-select-editor">` | `data-testid="select-editor"`, `data-field-type="select"`, `data-column-id`, `data-editable` |
| 2.3 | Date | Date picker element | `data-testid="date-editor"`, `data-field-type="date"`, `data-column-id`, `data-editable` |
| 2.4 | Rating | Rating control element | `data-testid="rating-editor"`, `data-field-type="rating"`, `data-column-id`, `data-editable` |
| 2.5 | Slider | Slider control element | `data-testid="slider-editor"`, `data-field-type="slider"`, `data-column-id`, `data-editable` |
| 2.6 | Color | Color picker element | `data-testid="color-editor"`, `data-field-type="color"`, `data-column-id`, `data-editable` |

#### Category 3: Manual Verification Screenshots

| # | Test Case | Screenshot Path | What to Verify |
|---|-----------|-----------------|----------------|
| 3.1 | Boolean badge renders | `/tmp/e2e-evidence/boolean-badge.png` | Green/red badge with Yes/No |
| 3.2 | Boolean editor opens | `/tmp/e2e-evidence/boolean-editor.png` | Dropdown with True/False options |
| 3.3 | Select badge renders | `/tmp/e2e-evidence/select-badge.png` | Status badge with color |
| 3.4 | Select editor opens | `/tmp/e2e-evidence/select-editor.png` | Dropdown with all options |
| 3.5 | Date editor opens | `/tmp/e2e-evidence/date-editor.png` | Date picker visible |
| 3.6 | Rating editor works | `/tmp/e2e-evidence/rating-editor.png` | Star rating visible |

### 5.3 Chrome DevTools Commands for Verification

```bash
# Navigate to test page
node .claude/skills/chrome-devtools/scripts/run.js "goto http://localhost:$DEV_PORT/debug/vibegrid-test/field-types"

# Wait for grid and take screenshot
node .claude/skills/chrome-devtools/scripts/run.js "wait [data-testid=vibegrid-container] | screenshot /tmp/e2e-evidence/grid-loaded.png"

# Click load fixtures button
node .claude/skills/chrome-devtools/scripts/run.js "click [data-testid=load-fixtures-btn] | wait 2000 | screenshot /tmp/e2e-evidence/fixtures-loaded.png"

# Verify boolean cell exists
node .claude/skills/chrome-devtools/scripts/run.js "wait .vibegridx-cell[data-column-id=is_active] | screenshot /tmp/e2e-evidence/boolean-cell.png"

# Click boolean to open editor
node .claude/skills/chrome-devtools/scripts/run.js "click .vibegridx-cell[data-column-id=is_active] [data-affordance=toggle] | wait 500 | screenshot /tmp/e2e-evidence/boolean-editor-open.png"

# Verify data-testid attribute exists (after UI changes)
node .claude/skills/chrome-devtools/scripts/run.js "eval document.querySelector('[data-testid=boolean-editor]') !== null"
```

### 5.4 Per-Phase Verification Gates

**Phase 0 Verification (Baseline):**
| Check | Command/Steps | Expected | Status |
|-------|---------------|----------|--------|
| Test page loads | Navigate to `/debug/vibegrid-test/field-types` | Grid renders | [ ] |
| Boolean cells visible | Find `[data-column-id="is_active"]` | At least 1 cell | [ ] |
| Select cells visible | Find `[data-column-id="status"]` | At least 1 cell | [ ] |
| Screenshot works | Save to `/tmp/e2e-evidence/` | File created | [ ] |

**Phase 1 Verification (UI Attributes):**
| Check | Command/Steps | Expected | Status |
|-------|---------------|----------|--------|
| Boolean editor has data-testid | Click cell, inspect editor | `data-testid="boolean-editor"` | [ ] |
| Select editor has data-testid | Click cell, inspect editor | `data-testid="select-editor"` | [ ] |
| All 6 field types have attributes | Inspect each editor | All 4 attributes present | [ ] |

**Phase 2 Verification (Test Fixes):**
| Check | Command/Steps | Expected | Status |
|-------|---------------|----------|--------|
| No SKIP patterns remain | `grep -r "console.log.*SKIP" apps/web/e2e/vibegrid/field-types/` | 0 matches | [ ] |
| Tests throw on missing elements | Run test with missing element | Test FAILS | [ ] |

**Phase 3 Verification (Full Suite):**
| Check | Command/Steps | Expected | Status |
|-------|---------------|----------|--------|
| Boolean tests pass | `pnpm test:e2e apps/web/e2e/vibegrid/field-types/boolean.spec.ts` | All pass | [ ] |
| Select tests pass | `pnpm test:e2e apps/web/e2e/vibegrid/field-types/select.spec.ts` | All pass | [ ] |
| All 6 field type tests pass | `pnpm test:e2e apps/web/e2e/vibegrid/field-types/` | All pass | [ ] |

### 5.5 Existing Test Files (to be fixed)

| Test File | Tests Count | Known Skip Points |
|-----------|-------------|-------------------|
| `apps/web/e2e/vibegrid/field-types/boolean.spec.ts` | 9 tests | ~10 skip patterns |
| `apps/web/e2e/vibegrid/field-types/select.spec.ts` | 8 tests | ~8 skip patterns |
| `apps/web/e2e/vibegrid/field-types/date.spec.ts` | ~8 tests | ~8 skip patterns |
| `apps/web/e2e/vibegrid/field-types/rating.spec.ts` | ~6 tests | ~6 skip patterns |
| `apps/web/e2e/vibegrid/field-types/slider.spec.ts` | ~6 tests | ~6 skip patterns |
| `apps/web/e2e/vibegrid/field-types/color.spec.ts` | ~6 tests | ~6 skip patterns |

### 5.6 Success Criteria

> **All must pass for feature to be complete.** Map to acceptance criteria from issue.

| Criterion | Test Cases | Verified By | Status |
|-----------|------------|-------------|--------|
| No silent skips in boolean.spec.ts | 1.1 | `grep -c 'console.log.*SKIP'` = 0 | [ ] |
| No silent skips in all 6 files | 1.1-1.6 | grep returns 0 for all files | [ ] |
| Boolean editor has data attributes | 2.1 | Chrome DevTools inspect | [ ] |
| All 6 editors have data attributes | 2.1-2.6 | Chrome DevTools inspect | [ ] |
| Screenshot evidence captured | 3.1-3.6 | Files exist in /tmp/e2e-evidence/ | [ ] |
| Full test suite passes | 5.4 Phase 3 | `pnpm test:e2e` all green | [ ] |

### 5.7 Final Demo Checklist

- [ ] **Show grep output** proving no SKIP patterns remain
- [ ] **Demo boolean editor** with data-testid visible in DevTools
- [ ] **Demo select editor** with data-testid visible in DevTools
- [ ] **Run full test suite** showing all tests pass or fail (no silent skips)
- [ ] **Show screenshot evidence** folder with captured PNGs

---

## 6. Task Breakdown

> **Note:** This is a testing infrastructure fix, not a typical feature.
> Phases follow: BASELINE → UI ATTRIBUTES → FIX TESTS → VERIFY
> See `.claude/rules/incremental-verification.md` for protocol.

### Beads Epic

```bash
EPIC=$(bd create --title="GH#729: VibeGrid E2E Test Verification - Eliminate Silent Skips" --type=epic --external-ref="gh-729" --silent)
```

### Phase 0: Baseline Verification (BLOCKS ALL)

```bash
# ============================================
# PHASE 0: BASELINE - Must pass before ANY work
# ============================================
BASELINE=$(bd create --title="GH#729: VERIFY baseline - test page renders all field types" --type=task --priority=0 --labels=testing --silent)
# 1. Start dev server: ./scripts/dev/setup.sh
# 2. Navigate to /debug/vibegrid-test/field-types
# 3. Verify boolean cells visible (data-column-id="is_active")
# 4. Verify select cells visible (data-column-id="status")
# 5. Take baseline screenshot: /tmp/e2e-evidence/baseline.png
# If ANY check fails → STOP → File bug → Fix baseline first
```

### Phase 1: Add Data Attributes to UI (6 field types)

```bash
# ============================================
# PHASE 1: ADD DATA ATTRIBUTES TO FIELD TYPE EDITORS
# ============================================

# Boolean Field Type
IMPL_BOOLEAN=$(bd create --title="GH#729: Add data attributes to BooleanFieldType.ts" --type=task --priority=1 --silent)
bd dep add $IMPL_BOOLEAN $BASELINE
# File: apps/web/src/systems/vibegrid/field-types/implementations/basic/BooleanFieldType.ts
# Add: data-testid="boolean-editor", data-field-type="boolean", data-column-id, data-editable

# Select Field Type
IMPL_SELECT=$(bd create --title="GH#729: Add data attributes to SelectFieldType.ts" --type=task --priority=1 --silent)
bd dep add $IMPL_SELECT $BASELINE

# Date Field Type
IMPL_DATE=$(bd create --title="GH#729: Add data attributes to DateFieldType.ts" --type=task --priority=1 --silent)
bd dep add $IMPL_DATE $BASELINE

# Rating Field Type
IMPL_RATING=$(bd create --title="GH#729: Add data attributes to RatingFieldType.ts" --type=task --priority=1 --silent)
bd dep add $IMPL_RATING $BASELINE

# Slider Field Type
IMPL_SLIDER=$(bd create --title="GH#729: Add data attributes to SliderFieldType.ts" --type=task --priority=1 --silent)
bd dep add $IMPL_SLIDER $BASELINE

# Color Field Type
IMPL_COLOR=$(bd create --title="GH#729: Add data attributes to ColorFieldType.ts" --type=task --priority=1 --silent)
bd dep add $IMPL_COLOR $BASELINE

# Verify all 6 have attributes
VERIFY_P1=$(bd create --title="GH#729: VERIFY all 6 editors have data attributes" --type=task --labels=testing --silent)
bd dep add $VERIFY_P1 $IMPL_BOOLEAN
bd dep add $VERIFY_P1 $IMPL_SELECT
bd dep add $VERIFY_P1 $IMPL_DATE
bd dep add $VERIFY_P1 $IMPL_RATING
bd dep add $VERIFY_P1 $IMPL_SLIDER
bd dep add $VERIFY_P1 $IMPL_COLOR
# Use Chrome DevTools to verify data-testid on each editor
# Screenshots: /tmp/e2e-evidence/boolean-editor.png, etc.
```

### Phase 2: Fix Test Skip Logic (6 test files)

```bash
# ============================================
# PHASE 2: REPLACE SKIP PATTERNS WITH FAILURES
# ============================================

# Boolean tests
FIX_BOOLEAN=$(bd create --title="GH#729: Fix boolean.spec.ts - replace skips with failures" --type=task --priority=1 --silent)
bd dep add $FIX_BOOLEAN $VERIFY_P1
# Replace: console.log('SKIP: ...'); return
# With: throw new Error('Element not found: ...')

# Select tests
FIX_SELECT=$(bd create --title="GH#729: Fix select.spec.ts - replace skips with failures" --type=task --priority=1 --silent)
bd dep add $FIX_SELECT $VERIFY_P1

# Date tests
FIX_DATE=$(bd create --title="GH#729: Fix date.spec.ts - replace skips with failures" --type=task --priority=1 --silent)
bd dep add $FIX_DATE $VERIFY_P1

# Rating tests
FIX_RATING=$(bd create --title="GH#729: Fix rating.spec.ts - replace skips with failures" --type=task --priority=1 --silent)
bd dep add $FIX_RATING $VERIFY_P1

# Slider tests
FIX_SLIDER=$(bd create --title="GH#729: Fix slider.spec.ts - replace skips with failures" --type=task --priority=1 --silent)
bd dep add $FIX_SLIDER $VERIFY_P1

# Color tests
FIX_COLOR=$(bd create --title="GH#729: Fix color.spec.ts - replace skips with failures" --type=task --priority=1 --silent)
bd dep add $FIX_COLOR $VERIFY_P1

# Verify no skip patterns remain
VERIFY_P2=$(bd create --title="GH#729: VERIFY no SKIP patterns remain in any test file" --type=task --labels=testing --silent)
bd dep add $VERIFY_P2 $FIX_BOOLEAN
bd dep add $VERIFY_P2 $FIX_SELECT
bd dep add $VERIFY_P2 $FIX_DATE
bd dep add $VERIFY_P2 $FIX_RATING
bd dep add $VERIFY_P2 $FIX_SLIDER
bd dep add $VERIFY_P2 $FIX_COLOR
# Run: grep -r "console.log.*SKIP" apps/web/e2e/vibegrid/field-types/
# Expected: 0 matches
```

### Phase 3: Manual Verification with Screenshots

```bash
# ============================================
# PHASE 3: MANUAL WALKTHROUGH WITH EVIDENCE
# ============================================

MANUAL_VERIFY=$(bd create --title="GH#729: Manual verification with Chrome DevTools" --type=task --priority=1 --labels=testing --silent)
bd dep add $MANUAL_VERIFY $VERIFY_P2
# 1. Navigate to /debug/vibegrid-test/field-types
# 2. Load fixtures
# 3. For each field type:
#    - Click cell to open editor
#    - Screenshot editor showing data attributes
#    - Store in /tmp/e2e-evidence/
# Evidence files:
#   /tmp/e2e-evidence/boolean-editor.png
#   /tmp/e2e-evidence/select-editor.png
#   /tmp/e2e-evidence/date-editor.png
#   /tmp/e2e-evidence/rating-editor.png
#   /tmp/e2e-evidence/slider-editor.png
#   /tmp/e2e-evidence/color-editor.png
```

### Phase 4: Run Full Test Suite

```bash
# ============================================
# PHASE 4: RUN ALL TESTS - VERIFY PASS/FAIL ACCURACY
# ============================================

RUN_TESTS=$(bd create --title="GH#729: Run full field-types test suite" --type=task --priority=1 --labels=testing --silent)
bd dep add $RUN_TESTS $MANUAL_VERIFY
# Run: pnpm test:e2e apps/web/e2e/vibegrid/field-types/
# Expected: All tests either PASS or FAIL (no silent skips)
# Capture test output as evidence

VERIFY_P4=$(bd create --title="GH#729: VERIFY all tests pass (no silent skips)" --type=task --labels=testing --silent)
bd dep add $VERIFY_P4 $RUN_TESTS
# All 6 test files should pass
# If any fail, fix the underlying issue (not the test)
```

### Success Criteria Verification

```bash
# ============================================
# SUCCESS CRITERIA BEADS (from Section 5.6)
# ============================================

SC_1=$(bd create --title="GH#729: SC: No silent skips in boolean.spec.ts" --type=task --labels=testing,success-criteria --silent)
bd dep add $SC_1 $VERIFY_P2

SC_2=$(bd create --title="GH#729: SC: No silent skips in all 6 files" --type=task --labels=testing,success-criteria --silent)
bd dep add $SC_2 $VERIFY_P2

SC_3=$(bd create --title="GH#729: SC: Boolean editor has data attributes" --type=task --labels=testing,success-criteria --silent)
bd dep add $SC_3 $VERIFY_P1

SC_4=$(bd create --title="GH#729: SC: All 6 editors have data attributes" --type=task --labels=testing,success-criteria --silent)
bd dep add $SC_4 $VERIFY_P1

SC_5=$(bd create --title="GH#729: SC: Screenshot evidence captured" --type=task --labels=testing,success-criteria --silent)
bd dep add $SC_5 $MANUAL_VERIFY

SC_6=$(bd create --title="GH#729: SC: Full test suite passes" --type=task --labels=testing,success-criteria --silent)
bd dep add $SC_6 $VERIFY_P4

# All success criteria must pass
VERIFY_CRITERIA=$(bd create --title="GH#729: VERIFY all success criteria passed" --type=task --labels=testing --silent)
bd dep add $VERIFY_CRITERIA $SC_1
bd dep add $VERIFY_CRITERIA $SC_2
bd dep add $VERIFY_CRITERIA $SC_3
bd dep add $VERIFY_CRITERIA $SC_4
bd dep add $VERIFY_CRITERIA $SC_5
bd dep add $VERIFY_CRITERIA $SC_6
```

### Final Demo

```bash
# ============================================
# FINAL: DEMO TO USER
# ============================================
DEMO=$(bd create --title="GH#729: DEMO - show test verification improvements" --type=task --priority=1 --labels=testing --silent)
bd dep add $DEMO $VERIFY_CRITERIA
# Execute: Section 5.7 Final Demo Checklist
# - Show grep output proving no SKIP patterns
# - Demo boolean editor with data-testid visible
# - Demo select editor with data-testid visible
# - Run full test suite showing accurate pass/fail
# - Show screenshot evidence folder
```

### Finalization Phase

```bash
# ============================================
# FINALIZATION: QUALITY + COMMIT
# ============================================

# Typecheck + Lint
QUALITY=$(bd create --title="GH#729: Typecheck and lint pass" --type=task --priority=1 --labels=quality --silent)
bd dep add $QUALITY $DEMO
# Execute: pnpm typecheck && pnpm lint

# Commit & Push
COMMIT=$(bd create --title="GH#729: Commit and push changes" --type=task --priority=1 --labels=git --silent)
bd dep add $COMMIT $QUALITY
# Execute: git add -A && git commit && git push

# Update GitHub Issue
GITHUB=$(bd create --title="GH#729: Update GitHub issue with results" --type=task --priority=1 --labels=session-close --silent)
bd dep add $GITHUB $COMMIT
# Execute: gh issue comment 729 --body "Implementation complete..."

# Sync beads
bd sync
bd dep tree
```

### Dependency Graph

```
                    +----------------+
                    |    BASELINE    |  ← P0: Test page renders?
                    +-------+--------+
                            |
        +-------------------+-------------------+
        |           |           |       |       |
        v           v           v       v       v
  +----------+ +----------+ +------+ +------+ +-------+
  |IMPL      | |IMPL      | |IMPL  | |IMPL  | |IMPL   |
  |BOOLEAN   | |SELECT    | |DATE  | |RATING| |SLIDER |...
  +----+-----+ +----+-----+ +--+---+ +--+---+ +---+---+
       |            |          |        |         |
       +------------+----------+--------+---------+
                            |
                            v
                    +----------------+
                    |   VERIFY P1    |  ← All editors have attributes?
                    +-------+--------+
                            |
        +-------------------+-------------------+
        |           |           |       |       |
        v           v           v       v       v
  +----------+ +----------+ +------+ +------+ +-------+
  |FIX       | |FIX       | |FIX   | |FIX   | |FIX    |
  |BOOLEAN   | |SELECT    | |DATE  | |RATING| |SLIDER |...
  +----+-----+ +----+-----+ +--+---+ +--+---+ +---+---+
       |            |          |        |         |
       +------------+----------+--------+---------+
                            |
                            v
                    +----------------+
                    |   VERIFY P2    |  ← No SKIP patterns remain?
                    +-------+--------+
                            |
                            v
                    +----------------+
                    | MANUAL VERIFY  |  ← Screenshots captured?
                    +-------+--------+
                            |
                            v
                    +----------------+
                    |  RUN TESTS     |  ← Full suite executes?
                    +-------+--------+
                            |
                            v
                    +----------------+
                    |   VERIFY P4    |  ← All tests pass?
                    +-------+--------+
                            |
                            v
          +-----------------+-----------------+
          |        |        |        |        |
          v        v        v        v        v
       +-----+  +-----+  +-----+  +-----+  +-----+
       | SC1 |  | SC2 |  | SC3 |  | SC4 |  | SC5 |...
       +--+--+  +--+--+  +--+--+  +--+--+  +--+--+
          |        |        |        |        |
          +--------+--------+--------+--------+
                            |
                            v
                    +----------------+
                    |VERIFY CRITERIA |
                    +-------+--------+
                            |
                            v
                    +----------------+
                    |     DEMO       |
                    +-------+--------+
                            |
                            v
                    +----------------+
                    |   FINALIZE     |
                    +----------------+
```

### Phase Summary

| Phase | Tasks | Verification Gate |
|-------|-------|-------------------|
| P0 Baseline | Verify test page renders | Grid visible with all field types |
| P1 UI Attrs | Add data attributes to 6 editors | All editors have data-testid |
| P2 Fix Tests | Replace skip patterns with failures | `grep SKIP` returns 0 matches |
| P3 Manual | Chrome DevTools walkthrough | Screenshots in /tmp/e2e-evidence/ |
| P4 Run Tests | Execute full test suite | All tests pass or explicitly fail |
| Demo | Show improvements to user | Acceptance criteria met |
| Finalize | Typecheck, lint, commit | Code pushed to branch |

---

## 7. Notes

**Discovered during research:**
- Boolean test file has ~10 skip patterns at specific line numbers (93, 103, 148, 212, 248, 296, 309, 353, 411, 433)
- Select test file has similar pattern (~8 skip points)
- All 6 field types in `apps/web/e2e/vibegrid/field-types/` need the same fix
- UI components already have CSS classes (`.vibegridx-boolean-editor`) but lack data-testid attributes

**Pattern for fix:**
```typescript
// BEFORE (silent skip)
if (booleanCells.length === 0) {
  console.log('SKIP: No boolean cells found - field type not in schema')
  return
}

// AFTER (explicit failure)
if (booleanCells.length === 0) {
  throw new Error('TEST FAILURE: No boolean cells found - field type not in schema. Check test fixtures.')
}
```

**Expandable pattern:**
- This fix pattern applies to all 40+ field types
- Start with 6 mentioned types, apply to rest in follow-up issue
