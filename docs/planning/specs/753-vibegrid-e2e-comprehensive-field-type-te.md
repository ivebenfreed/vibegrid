---
issue: 753
type: feature
title: VibeGrid E2E Comprehensive Field Type Test Coverage
status: draft
created: 2026-01-03
updated: 2026-01-03
template: full-stack
---

# Feature Planning: VibeGrid E2E Comprehensive Field Type Test Coverage

> **Instructions for Agent:**
> Fill this template during PLANNING session by exploring the codebase.
> Every field must contain ACTUAL file paths and patterns, not placeholders.
> Run searches, read files, understand conventions before filling.
> Mark sections N/A if not applicable to this feature.

---

## Research Context (Optional)

> Fill this section if prior research informs this feature.
> Link research issues and summarize key findings relevant to this spec.

### Related Research

| Research Issue | Title | How It Informs This Feature |
|----------------|-------|----------------------------|
| #729 | VibeGrid E2E Test Validation | Established patterns for 6 field types (boolean, select, date, rating, slider, color) - 49 tests total |
| #572 | Playwright to Puppeteer Migration | Defined Puppeteer test infrastructure (CDP, helpers, auth) |
| #488 | VibeGrid Field Type Analysis | Created test schema and fixture generators |

### Key Findings Applied

1. **Finding:** Silent skip anti-pattern (`console.log('SKIP')` + `return`) hid 307 test failures across 21 files
   **Impact on spec:** All tests MUST use `throw new Error('TEST FAILURE:...')` - never silent skip

2. **Finding:** Affordance-based selectors (`data-affordance`, `data-field-type`, `data-column-id`) are more stable than CSS classes
   **Impact on spec:** All 17 new field types must add data attributes before writing tests

3. **Finding:** 1500ms render delay required after page load for VibeGrid to fully render
   **Impact on spec:** All test beforeEach hooks include `await new Promise(r => setTimeout(r, 1500))`

### Unresolved Questions from Research

| Question | How Addressed in Spec |
|----------|----------------------|
| How to test file/image uploads in E2E? | Deferred - readonly display testing only, upload is separate feature |
| How to test computed fields with real calculations? | Test display only - calculation logic tested in unit tests |

---

## 0. Feature Context

**GitHub Issue:** #753
**Acceptance Criteria:**
1. E2E tests for all 17 remaining field types (text, entity-name, number, email, url, phone, currency, file, image, markdown, user-reference, entity-reference, rollup-count, rollup-sum, rollup-average, rollup-concat, computed-expression, computed-formula)
2. Each field type has ~8 tests following established patterns from GH#729
3. Total of ~136 new tests (17 types x 8 tests average)
4. All tests use `throw new Error()` instead of silent skip
5. Data attributes added to field type implementations before tests written
6. Tests organized by affordance category (editable-content, link-only, readonly-badge, readonly-display)

**Related Features:**
- **GH#729 (CLOSED):** Established test patterns for 6 field types (boolean, select, date, rating, slider, color)
- **GH#572:** Puppeteer E2E test infrastructure
- **GH#488:** Field type test schema and fixture generators

---

## 0.5 BASELINE VERIFICATION (BLOCKING)

> **CRITICAL:** Before ANY implementation, manually verify existing related features work.
> If baseline is broken → STOP → File bug → Fix baseline first.
> See `.claude/rules/incremental-verification.md` for full protocol.

### Pre-Implementation Checks

| Check | How to Verify | Expected Result | Status |
|-------|---------------|-----------------|--------|
| Existing E2E tests pass | `pnpm vitest run e2e/vibegrid/field-types/ --config vitest.e2e.config.ts` | All 49 tests pass | [ ] |
| Dev server running | `./scripts/dev/setup.sh` | Server on $DEV_PORT | [ ] |
| Chrome debug port active | `curl http://localhost:$CHROME_DEBUG_PORT/json/version` | Returns Chrome info | [ ] |
| Field types debug page loads | Navigate to `/debug/vibegrid-test/field-types` | Grid renders with all columns | [ ] |
| Test fixtures load | Click "Load Test Fixtures" button | 6 deterministic rows appear | [ ] |
| No console errors | Open DevTools Console on debug page | No errors | [ ] |

**If ANY check fails:**
1. STOP planning
2. File a bug issue for the broken baseline
3. Fix baseline before extending

### Baseline Verification Task (auto-created in Beads)
```bash
# This task MUST be first and MUST block all implementation
BASELINE=$(bd create --title="GH#753: VERIFY baseline - existing 6 field type tests pass" --type=task --priority=0 --labels=testing --silent)
```

---

## 1. Backend / API

**N/A** - This feature is E2E test coverage only. No backend changes required.

The field type implementations already exist at:
- `apps/web/src/systems/vibegrid/field-types/implementations/basic/` (10 types)
- `apps/web/src/systems/vibegrid/field-types/implementations/relationship/` (2 types)
- `apps/web/src/systems/vibegrid/field-types/implementations/rollup/` (4 types)
- `apps/web/src/systems/vibegrid/field-types/implementations/computed/` (2 types)

---

## 2. Frontend / UI

### 2.1 Field Type Implementations to Add Data Attributes

Each field type implementation needs data attributes added for E2E testing. The pattern established in GH#729:

```typescript
// Pattern for all field type renderers
container.dataset.affordance = isEditable ? 'edit' : 'none'
container.dataset.affordanceRole = 'content'
container.dataset.fieldType = 'text'  // Add field type identifier
```

### 2.2 Files to Modify (Add Data Attributes)

| File Path | Field Type | Affordance Group | Priority |
|-----------|-----------|------------------|----------|
| `apps/web/src/systems/vibegrid/field-types/implementations/basic/TextFieldType.ts` | text | editable-content | P1 |
| `apps/web/src/systems/vibegrid/field-types/implementations/basic/EntityNameFieldType.ts` | entity-name | editable-content | P1 |
| `apps/web/src/systems/vibegrid/field-types/implementations/basic/NumberFieldType.ts` | number | editable-content | P1 |
| `apps/web/src/systems/vibegrid/field-types/implementations/basic/EmailFieldType.ts` | email | link-only | P2 |
| `apps/web/src/systems/vibegrid/field-types/implementations/basic/UrlFieldType.ts` | url | link-only | P2 |
| `apps/web/src/systems/vibegrid/field-types/implementations/basic/PhoneFieldType.ts` | phone | link-only | P2 |
| `apps/web/src/systems/vibegrid/field-types/implementations/basic/CurrencyFieldType.ts` | currency | readonly-badge | P2 |
| `apps/web/src/systems/vibegrid/field-types/implementations/basic/FileFieldType.ts` | file | readonly-badge | P3 |
| `apps/web/src/systems/vibegrid/field-types/implementations/basic/ImageFieldType.ts` | image | readonly-badge | P3 |
| `apps/web/src/systems/vibegrid/field-types/implementations/basic/MarkdownFieldType.ts` | markdown | readonly-display | P3 |
| `apps/web/src/systems/vibegrid/field-types/implementations/relationship/UserReferenceFieldType.ts` | user-reference | editable-badge | P2 |
| `apps/web/src/systems/vibegrid/field-types/implementations/relationship/EntityReferenceFieldType.ts` | entity-reference | editable-badge | P2 |
| `apps/web/src/systems/vibegrid/field-types/implementations/rollup/RollupCountFieldType.ts` | rollup-count | readonly-display | P3 |
| `apps/web/src/systems/vibegrid/field-types/implementations/rollup/RollupSumFieldType.ts` | rollup-sum | readonly-display | P3 |
| `apps/web/src/systems/vibegrid/field-types/implementations/rollup/RollupAverageFieldType.ts` | rollup-average | readonly-display | P3 |
| `apps/web/src/systems/vibegrid/field-types/implementations/rollup/RollupConcatFieldType.ts` | rollup-concat | readonly-display | P3 |
| `apps/web/src/systems/vibegrid/field-types/implementations/computed/ComputedFieldTypes.ts` | computed-expression, computed-formula | readonly-display | P3 |

### 2.3 New E2E Test Files

| File Path | Field Type(s) | Tests | Based On |
|-----------|--------------|-------|----------|
| `apps/web/e2e/vibegrid/field-types/text.spec.ts` | text | ~8 | boolean.spec.ts |
| `apps/web/e2e/vibegrid/field-types/entity-name.spec.ts` | entity-name | ~8 | text.spec.ts |
| `apps/web/e2e/vibegrid/field-types/number.spec.ts` | number | ~8 | text.spec.ts |
| `apps/web/e2e/vibegrid/field-types/email.spec.ts` | email | ~8 | select.spec.ts |
| `apps/web/e2e/vibegrid/field-types/url.spec.ts` | url | ~8 | email.spec.ts |
| `apps/web/e2e/vibegrid/field-types/phone.spec.ts` | phone | ~8 | email.spec.ts |
| `apps/web/e2e/vibegrid/field-types/currency.spec.ts` | currency | ~6 | rating.spec.ts |
| `apps/web/e2e/vibegrid/field-types/file.spec.ts` | file | ~6 | currency.spec.ts |
| `apps/web/e2e/vibegrid/field-types/image.spec.ts` | image | ~6 | file.spec.ts |
| `apps/web/e2e/vibegrid/field-types/markdown.spec.ts` | markdown | ~6 | slider.spec.ts |
| `apps/web/e2e/vibegrid/field-types/user-reference.spec.ts` | user-reference | ~8 | select.spec.ts |
| `apps/web/e2e/vibegrid/field-types/entity-reference.spec.ts` | entity-reference | ~8 | user-reference.spec.ts |
| `apps/web/e2e/vibegrid/field-types/rollup-count.spec.ts` | rollup-count | ~6 | currency.spec.ts |
| `apps/web/e2e/vibegrid/field-types/rollup-sum.spec.ts` | rollup-sum | ~6 | rollup-count.spec.ts |
| `apps/web/e2e/vibegrid/field-types/rollup-average.spec.ts` | rollup-average | ~6 | rollup-count.spec.ts |
| `apps/web/e2e/vibegrid/field-types/rollup-concat.spec.ts` | rollup-concat | ~6 | rollup-count.spec.ts |
| `apps/web/e2e/vibegrid/field-types/computed.spec.ts` | computed-expression, computed-formula | ~8 | rollup-count.spec.ts |

### 2.4 Affordance Group Patterns

| Affordance Group | Click Behavior | Editor Type | Test Pattern |
|------------------|----------------|-------------|--------------|
| `editable-content` | Click content → TextEditor | inline input | Type text, Enter to save |
| `link-only` | Click → navigate (mailto:, tel:, https://) | N/A | Verify link href, no editor |
| `editable-badge` | Click badge → ComboboxEditor | dropdown `[cmdk-item]` | Click option to select |
| `readonly-badge` | Display only | N/A | Verify value renders, no edit |
| `readonly-display` | Display only | N/A | Verify formatting, no edit |

### 2.5 Test Debug Route

**Existing route:** `apps/web/src/app/routes/_authenticated/debug/vibegrid-test/field-types.tsx`

**Test fixtures:** `apps/web/src/app/routes/_authenticated/debug/vibegrid-test/_utils/field-type-generators.ts`

The test route exposes `window.__VIBEGRID_TEST_STATE__` for E2E assertions:
- `mockData` - Current fixture data
- `rowCount` - Number of rows
- `fieldCategories` - Category groupings
- `schema` - Field definitions

---

## 3. Database / DataForge

**N/A** - This feature is E2E test coverage only. No database changes required.

Test fixtures are generated in-memory via `apps/web/src/app/routes/_authenticated/debug/vibegrid-test/_utils/field-type-generators.ts`.

---

## 4. Security

**N/A** - This feature is E2E test coverage only. No security changes required.

Tests run in DEV mode only (gated by `import.meta.env.DEV` check in route).

---

## 5. Test Strategy

> **CRITICAL:** This section defines the complete test plan that will be executed during implementation.
> Each test case becomes a Beads task. Tests are NOT optional - they gate feature completion.
> See `.claude/rules/incremental-verification.md` for the verification protocol.
>
> **TDD Enforcement:** Implementation sessions have hooks that warn when editing production code
> without test changes. Ensure each implementation task has corresponding test cases here.

### 5.1 Test Environment

| Requirement | Value | Notes |
|-------------|-------|-------|
| Organization | N/A | Mock data, no org required |
| User/Role | admin@widecorp.com (admin) | For authenticated session |
| External Services | None | All data is mocked |
| Test Data | generateFieldTypeTestFixtures() | 6 deterministic rows with all field types |
| Dev Server | $DEV_PORT (from .env.local) | Plus Chrome on $CHROME_DEBUG_PORT |

**Environment Readiness Check:**
```bash
# 1. Start dev server with Chrome
./scripts/dev/setup.sh

# 2. Login test user
./scripts/auth/login-test-user.sh "admin@widecorp.com" "WideCorp2024!Admin"

# 3. Verify Chrome debug port
curl -s http://localhost:$CHROME_DEBUG_PORT/json/version | jq .

# 4. Run existing field type tests (baseline)
pnpm vitest run e2e/vibegrid/field-types/ --config vitest.e2e.config.ts
```

### 5.2 Test Cases by Category

> Each field type needs ~8 tests following patterns from GH#729.
> Tests grouped by affordance category for consistent patterns.

#### Category 1: Editable Content Types (text, entity-name, number) - P1

Tests for inline text editing with TextEditor.

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 1.1 | Cell renders with value | Load fixtures, find cell by column-id | Text content visible | P1 |
| 1.2 | Click content enters edit mode | Click cell content | Input appears, text selected | P1 |
| 1.3 | Type and Enter saves | Type new value, press Enter | Value updated in cell | P1 |
| 1.4 | Type and blur saves | Type new value, click outside | Value updated in cell | P1 |
| 1.5 | Escape cancels edit | Enter edit, type, press Escape | Original value restored | P1 |
| 1.6 | Empty cell shows edit placeholder | Find empty cell | "Edit" hint with pencil emoji | P2 |
| 1.7 | Read-only shows no affordance | Find cell with data-editable="false" | data-affordance="none" | P2 |
| 1.8 | Tab moves to next editable cell | Press Tab while editing | Focus moves, value saves | P2 |

#### Category 2: Link Types (email, url, phone) - P2

Tests for link-only fields that navigate without editing.

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 2.1 | Cell renders with formatted value | Load fixtures, find email cell | Email in lowercase, link styled | P2 |
| 2.2 | URL cell has proper href | Check url cell | data-emailHref or similar attribute | P2 |
| 2.3 | Click does NOT open editor | Click cell content | No editor appears (navigate affordance) | P2 |
| 2.4 | Phone displays with formatting | Find phone cell | Phone number visible | P2 |
| 2.5 | Email lowercase transformation | Verify email cell content | All lowercase | P2 |
| 2.6 | Empty cell shows edit placeholder | Find empty email cell | "Edit" hint visible | P2 |
| 2.7 | URL shows link styling | Find url cell | Blue color, underline | P2 |
| 2.8 | Affordance is 'navigate' | Check data-affordance | "navigate" value | P2 |

#### Category 3: Readonly Badge Types (currency, file, image) - P2/P3

Tests for display-only formatted values.

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 3.1 | Currency renders with symbol | Find currency cell | $ symbol and formatted number | P2 |
| 3.2 | File shows filename | Find file cell | Filename displayed | P3 |
| 3.3 | Image shows thumbnail | Find image cell | Thumbnail or placeholder | P3 |
| 3.4 | Click does NOT open editor | Click cell | No editor (readonly) | P2 |
| 3.5 | Affordance is 'none' | Check data-affordance | "none" value | P2 |
| 3.6 | Empty currency shows $0 or empty | Find empty currency | Consistent empty state | P3 |

#### Category 4: Relationship Types (user-reference, entity-reference) - P2

Tests for editable badges with ComboboxEditor.

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 4.1 | User badge renders with name | Load fixtures, find user-ref cell | User name/initials badge | P2 |
| 4.2 | Click opens ComboboxEditor | Click user badge | cmdk-item dropdown appears | P2 |
| 4.3 | Select user updates badge | Click user option | Badge shows new user | P2 |
| 4.4 | Escape cancels selection | Open dropdown, press Escape | Original value, dropdown closes | P2 |
| 4.5 | Empty shows placeholder | Find empty user-ref cell | "Edit" placeholder | P2 |
| 4.6 | Entity-ref shows entity name | Find entity-ref cell | Entity display name | P2 |
| 4.7 | Search filters options | Type in search | Options filtered | P2 |
| 4.8 | Affordance is 'edit' | Check data-affordance | "edit" value | P2 |

#### Category 5: Readonly Display Types (rollups, computed, markdown) - P3

Tests for calculated/readonly display fields.

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 5.1 | Rollup count shows number | Find rollup-count cell | Numeric value with indicator | P3 |
| 5.2 | Rollup sum shows total | Find rollup-sum cell | Formatted sum | P3 |
| 5.3 | Rollup average shows decimal | Find rollup-avg cell | Decimal value | P3 |
| 5.4 | Rollup concat shows text | Find rollup-concat cell | Concatenated values | P3 |
| 5.5 | Computed shows calculated | Find computed cell | Expression result | P3 |
| 5.6 | Click does NOT open editor | Click any rollup cell | No editor (readonly) | P3 |
| 5.7 | Markdown renders formatted | Find markdown cell | HTML rendering visible | P3 |
| 5.8 | Affordance is 'none' | Check data-affordance | "none" value | P3 |

### 5.3 E2E Test Commands

**N/A for API testing** - This is E2E UI testing only. Use these commands to run tests:

```bash
# Run all field type E2E tests
pnpm vitest run e2e/vibegrid/field-types/ --config vitest.e2e.config.ts

# Run single field type test
pnpm vitest run e2e/vibegrid/field-types/text.spec.ts --config vitest.e2e.config.ts

# Run with verbose output
pnpm vitest run e2e/vibegrid/field-types/ --config vitest.e2e.config.ts --reporter=verbose

# Debug mode (pause on failure)
DEBUG=true pnpm vitest run e2e/vibegrid/field-types/text.spec.ts --config vitest.e2e.config.ts

# Watch mode for development
pnpm vitest e2e/vibegrid/field-types/text.spec.ts --config vitest.e2e.config.ts
```

### 5.4 Per-Phase Verification Gates

> Each phase has a verification gate that MUST pass before proceeding.

**Phase 1 Verification (Basic Editable Types):**
| Check | Command/Steps | Expected | Status |
|-------|---------------|----------|--------|
| text.spec.ts passes | Run test file | All 8 tests pass | [ ] |
| entity-name.spec.ts passes | Run test file | All 8 tests pass | [ ] |
| number.spec.ts passes | Run test file | All 8 tests pass | [ ] |

**Phase 2 Verification (Link Types):**
| Check | Command/Steps | Expected | Status |
|-------|---------------|----------|--------|
| email.spec.ts passes | Run test file | All 8 tests pass | [ ] |
| url.spec.ts passes | Run test file | All 8 tests pass | [ ] |
| phone.spec.ts passes | Run test file | All 8 tests pass | [ ] |

**Phase 3 Verification (Display Types):**
| Check | Command/Steps | Expected | Status |
|-------|---------------|----------|--------|
| currency.spec.ts passes | Run test file | All 6 tests pass | [ ] |
| file.spec.ts passes | Run test file | All 6 tests pass | [ ] |
| image.spec.ts passes | Run test file | All 6 tests pass | [ ] |
| markdown.spec.ts passes | Run test file | All 6 tests pass | [ ] |

**Phase 4 Verification (Relationship Types):**
| Check | Command/Steps | Expected | Status |
|-------|---------------|----------|--------|
| user-reference.spec.ts passes | Run test file | All 8 tests pass | [ ] |
| entity-reference.spec.ts passes | Run test file | All 8 tests pass | [ ] |

**Phase 5 Verification (Readonly Types):**
| Check | Command/Steps | Expected | Status |
|-------|---------------|----------|--------|
| rollup-count.spec.ts passes | Run test file | All 6 tests pass | [ ] |
| rollup-sum.spec.ts passes | Run test file | All 6 tests pass | [ ] |
| rollup-average.spec.ts passes | Run test file | All 6 tests pass | [ ] |
| rollup-concat.spec.ts passes | Run test file | All 6 tests pass | [ ] |
| computed.spec.ts passes | Run test file | All 8 tests pass | [ ] |

### 5.5 Automated Tests

| Test File | What It Tests | Test Cases Covered |
|-----------|---------------|-------------------|
| `e2e/vibegrid/field-types/text.spec.ts` | Text field editing | 1.1-1.8 |
| `e2e/vibegrid/field-types/entity-name.spec.ts` | Entity name editing | 1.1-1.8 |
| `e2e/vibegrid/field-types/number.spec.ts` | Number field editing | 1.1-1.8 |
| `e2e/vibegrid/field-types/email.spec.ts` | Email link display | 2.1-2.8 |
| `e2e/vibegrid/field-types/url.spec.ts` | URL link display | 2.1-2.8 |
| `e2e/vibegrid/field-types/phone.spec.ts` | Phone link display | 2.1-2.8 |
| `e2e/vibegrid/field-types/currency.spec.ts` | Currency formatting | 3.1-3.6 |
| `e2e/vibegrid/field-types/file.spec.ts` | File display | 3.1-3.6 |
| `e2e/vibegrid/field-types/image.spec.ts` | Image thumbnail | 3.1-3.6 |
| `e2e/vibegrid/field-types/markdown.spec.ts` | Markdown rendering | 3.1-3.6 |
| `e2e/vibegrid/field-types/user-reference.spec.ts` | User picker | 4.1-4.8 |
| `e2e/vibegrid/field-types/entity-reference.spec.ts` | Entity picker | 4.1-4.8 |
| `e2e/vibegrid/field-types/rollup-count.spec.ts` | Rollup count display | 5.1-5.8 |
| `e2e/vibegrid/field-types/rollup-sum.spec.ts` | Rollup sum display | 5.1-5.8 |
| `e2e/vibegrid/field-types/rollup-average.spec.ts` | Rollup average display | 5.1-5.8 |
| `e2e/vibegrid/field-types/rollup-concat.spec.ts` | Rollup concat display | 5.1-5.8 |
| `e2e/vibegrid/field-types/computed.spec.ts` | Computed field display | 5.1-5.8 |

### 5.6 Success Criteria

> **All must pass for feature to be complete.** Map to acceptance criteria from issue.

| Criterion | Test Cases | Verified By | Status |
|-----------|------------|-------------|--------|
| All 17 field types have E2E tests | All categories | vitest run | [ ] |
| ~136 new tests (17 x 8 avg) | Count test cases | vitest --reporter=verbose | [ ] |
| No silent skips | grep for console.log('SKIP') | Manual code review | [ ] |
| Data attributes on all field types | Check implementations | Manual code review | [ ] |
| Tests use throw Error() | grep for throw new Error | Manual code review | [ ] |
| Existing 49 tests still pass | Run all field-types/*.spec.ts | vitest run | [ ] |

### 5.7 Final Demo Checklist

- [ ] **Run all field type E2E tests** - 185+ tests pass (49 existing + ~136 new)
- [ ] **Demonstrate each affordance category** works (editable-content, link-only, etc.)
- [ ] **Show test failure behavior** - proper error messages, no silent skips
- [ ] **Verify data attributes** - inspect DOM for data-field-type, data-affordance
- [ ] **Confirm acceptance criteria** from GH#753 are met
- [ ] **Take screenshot of test results** as evidence

---

## 6. Task Breakdown (TDD-Enforced)

> **CRITICAL: TRUE TDD - Tests BLOCK Implementation**
>
> Each phase follows: `TEST → IMPL → VERIFY`
> - **TEST**: Write failing tests FIRST (blocks IMPL)
> - **IMPL**: Make tests pass (depends on TEST, blocks VERIFY)
> - **VERIFY**: Manual verification (depends on IMPL)
>
> See `.claude/rules/incremental-verification.md` for protocol.
> Stop conditions require: `test_beads_created` for each success criterion.

### Beads Epic

```bash
EPIC=$(bd create --title="GH#753: VibeGrid E2E Comprehensive Field Type Test Coverage" --type=epic --external-ref="gh-753" --silent)
```

### Phase 0: Baseline Verification (BLOCKS ALL)

```bash
# ============================================
# PHASE 0: BASELINE - Must pass before ANY work
# ============================================
BASELINE=$(bd create --title="GH#753: VERIFY baseline - existing 49 tests pass" --type=task --priority=0 --labels=testing --silent)
# Execute: Section 5.1 Environment Readiness Check
# Run: pnpm vitest run e2e/vibegrid/field-types/ --config vitest.e2e.config.ts
# All 49 existing tests must pass
# If ANY check fails → STOP → File bug → Fix baseline first
```

### Phase 1: Basic Editable Types (text, entity-name, number) - P1

```bash
# ============================================
# PHASE 1: BASIC EDITABLE TYPES (editable-content affordance)
# Pattern: Add data attrs → Write tests → Verify
# ============================================

# 1A: TEXT FIELD
ATTR_TEXT=$(bd create --title="GH#753: Add data attributes to TextFieldType" --type=task --priority=1 --silent)
bd dep add $ATTR_TEXT $BASELINE
# File: apps/web/src/systems/vibegrid/field-types/implementations/basic/TextFieldType.ts
# Add: container.dataset.fieldType = 'text'

TEST_TEXT=$(bd create --title="GH#753: Write text.spec.ts E2E tests (~8 tests)" --type=task --priority=1 --labels=testing --silent)
bd dep add $TEST_TEXT $ATTR_TEXT
# File: apps/web/e2e/vibegrid/field-types/text.spec.ts
# Pattern: Copy from boolean.spec.ts, adapt for text editing

VERIFY_TEXT=$(bd create --title="GH#753: VERIFY text.spec.ts passes" --type=task --labels=testing --silent)
bd dep add $VERIFY_TEXT $TEST_TEXT

# 1B: ENTITY-NAME FIELD
ATTR_ENTNAME=$(bd create --title="GH#753: Add data attributes to EntityNameFieldType" --type=task --priority=1 --silent)
bd dep add $ATTR_ENTNAME $BASELINE

TEST_ENTNAME=$(bd create --title="GH#753: Write entity-name.spec.ts E2E tests (~8 tests)" --type=task --priority=1 --labels=testing --silent)
bd dep add $TEST_ENTNAME $ATTR_ENTNAME

VERIFY_ENTNAME=$(bd create --title="GH#753: VERIFY entity-name.spec.ts passes" --type=task --labels=testing --silent)
bd dep add $VERIFY_ENTNAME $TEST_ENTNAME

# 1C: NUMBER FIELD
ATTR_NUMBER=$(bd create --title="GH#753: Add data attributes to NumberFieldType" --type=task --priority=1 --silent)
bd dep add $ATTR_NUMBER $BASELINE

TEST_NUMBER=$(bd create --title="GH#753: Write number.spec.ts E2E tests (~8 tests)" --type=task --priority=1 --labels=testing --silent)
bd dep add $TEST_NUMBER $ATTR_NUMBER

VERIFY_NUMBER=$(bd create --title="GH#753: VERIFY number.spec.ts passes" --type=task --labels=testing --silent)
bd dep add $VERIFY_NUMBER $TEST_NUMBER

# Phase 1 Gate
VERIFY_P1=$(bd create --title="GH#753: VERIFY Phase 1 - all basic editable tests pass" --type=task --labels=testing --silent)
bd dep add $VERIFY_P1 $VERIFY_TEXT
bd dep add $VERIFY_P1 $VERIFY_ENTNAME
bd dep add $VERIFY_P1 $VERIFY_NUMBER
```

### Phase 2: Link Types (email, url, phone) - P2

```bash
# ============================================
# PHASE 2: LINK TYPES (link-only affordance)
# These navigate instead of edit
# ============================================

# 2A: EMAIL FIELD
ATTR_EMAIL=$(bd create --title="GH#753: Add data attributes to EmailFieldType" --type=task --priority=2 --silent)
bd dep add $ATTR_EMAIL $VERIFY_P1

TEST_EMAIL=$(bd create --title="GH#753: Write email.spec.ts E2E tests (~8 tests)" --type=task --priority=2 --labels=testing --silent)
bd dep add $TEST_EMAIL $ATTR_EMAIL

VERIFY_EMAIL=$(bd create --title="GH#753: VERIFY email.spec.ts passes" --type=task --labels=testing --silent)
bd dep add $VERIFY_EMAIL $TEST_EMAIL

# 2B: URL FIELD
ATTR_URL=$(bd create --title="GH#753: Add data attributes to UrlFieldType" --type=task --priority=2 --silent)
bd dep add $ATTR_URL $VERIFY_P1

TEST_URL=$(bd create --title="GH#753: Write url.spec.ts E2E tests (~8 tests)" --type=task --priority=2 --labels=testing --silent)
bd dep add $TEST_URL $ATTR_URL

VERIFY_URL=$(bd create --title="GH#753: VERIFY url.spec.ts passes" --type=task --labels=testing --silent)
bd dep add $VERIFY_URL $TEST_URL

# 2C: PHONE FIELD
ATTR_PHONE=$(bd create --title="GH#753: Add data attributes to PhoneFieldType" --type=task --priority=2 --silent)
bd dep add $ATTR_PHONE $VERIFY_P1

TEST_PHONE=$(bd create --title="GH#753: Write phone.spec.ts E2E tests (~8 tests)" --type=task --priority=2 --labels=testing --silent)
bd dep add $TEST_PHONE $ATTR_PHONE

VERIFY_PHONE=$(bd create --title="GH#753: VERIFY phone.spec.ts passes" --type=task --labels=testing --silent)
bd dep add $VERIFY_PHONE $TEST_PHONE

# Phase 2 Gate
VERIFY_P2=$(bd create --title="GH#753: VERIFY Phase 2 - all link type tests pass" --type=task --labels=testing --silent)
bd dep add $VERIFY_P2 $VERIFY_EMAIL
bd dep add $VERIFY_P2 $VERIFY_URL
bd dep add $VERIFY_P2 $VERIFY_PHONE
```

### Phase 3: Display Types (currency, file, image, markdown) - P2/P3

```bash
# ============================================
# PHASE 3: DISPLAY TYPES (readonly-badge and readonly-display)
# ============================================

# 3A: CURRENCY FIELD
ATTR_CURRENCY=$(bd create --title="GH#753: Add data attributes to CurrencyFieldType" --type=task --priority=2 --silent)
bd dep add $ATTR_CURRENCY $VERIFY_P2

TEST_CURRENCY=$(bd create --title="GH#753: Write currency.spec.ts E2E tests (~6 tests)" --type=task --priority=2 --labels=testing --silent)
bd dep add $TEST_CURRENCY $ATTR_CURRENCY

VERIFY_CURRENCY=$(bd create --title="GH#753: VERIFY currency.spec.ts passes" --type=task --labels=testing --silent)
bd dep add $VERIFY_CURRENCY $TEST_CURRENCY

# 3B: FILE FIELD
ATTR_FILE=$(bd create --title="GH#753: Add data attributes to FileFieldType" --type=task --priority=3 --silent)
bd dep add $ATTR_FILE $VERIFY_P2

TEST_FILE=$(bd create --title="GH#753: Write file.spec.ts E2E tests (~6 tests)" --type=task --priority=3 --labels=testing --silent)
bd dep add $TEST_FILE $ATTR_FILE

VERIFY_FILE=$(bd create --title="GH#753: VERIFY file.spec.ts passes" --type=task --labels=testing --silent)
bd dep add $VERIFY_FILE $TEST_FILE

# 3C: IMAGE FIELD
ATTR_IMAGE=$(bd create --title="GH#753: Add data attributes to ImageFieldType" --type=task --priority=3 --silent)
bd dep add $ATTR_IMAGE $VERIFY_P2

TEST_IMAGE=$(bd create --title="GH#753: Write image.spec.ts E2E tests (~6 tests)" --type=task --priority=3 --labels=testing --silent)
bd dep add $TEST_IMAGE $ATTR_IMAGE

VERIFY_IMAGE=$(bd create --title="GH#753: VERIFY image.spec.ts passes" --type=task --labels=testing --silent)
bd dep add $VERIFY_IMAGE $TEST_IMAGE

# 3D: MARKDOWN FIELD
ATTR_MARKDOWN=$(bd create --title="GH#753: Add data attributes to MarkdownFieldType" --type=task --priority=3 --silent)
bd dep add $ATTR_MARKDOWN $VERIFY_P2

TEST_MARKDOWN=$(bd create --title="GH#753: Write markdown.spec.ts E2E tests (~6 tests)" --type=task --priority=3 --labels=testing --silent)
bd dep add $TEST_MARKDOWN $ATTR_MARKDOWN

VERIFY_MARKDOWN=$(bd create --title="GH#753: VERIFY markdown.spec.ts passes" --type=task --labels=testing --silent)
bd dep add $VERIFY_MARKDOWN $TEST_MARKDOWN

# Phase 3 Gate
VERIFY_P3=$(bd create --title="GH#753: VERIFY Phase 3 - all display type tests pass" --type=task --labels=testing --silent)
bd dep add $VERIFY_P3 $VERIFY_CURRENCY
bd dep add $VERIFY_P3 $VERIFY_FILE
bd dep add $VERIFY_P3 $VERIFY_IMAGE
bd dep add $VERIFY_P3 $VERIFY_MARKDOWN
```

### Phase 4: Relationship Types (user-reference, entity-reference) - P2

```bash
# ============================================
# PHASE 4: RELATIONSHIP TYPES (editable-badge affordance)
# ComboboxEditor pattern
# ============================================

# 4A: USER-REFERENCE FIELD
ATTR_USERREF=$(bd create --title="GH#753: Add data attributes to UserReferenceFieldType" --type=task --priority=2 --silent)
bd dep add $ATTR_USERREF $VERIFY_P3

TEST_USERREF=$(bd create --title="GH#753: Write user-reference.spec.ts E2E tests (~8 tests)" --type=task --priority=2 --labels=testing --silent)
bd dep add $TEST_USERREF $ATTR_USERREF

VERIFY_USERREF=$(bd create --title="GH#753: VERIFY user-reference.spec.ts passes" --type=task --labels=testing --silent)
bd dep add $VERIFY_USERREF $TEST_USERREF

# 4B: ENTITY-REFERENCE FIELD
ATTR_ENTREF=$(bd create --title="GH#753: Add data attributes to EntityReferenceFieldType" --type=task --priority=2 --silent)
bd dep add $ATTR_ENTREF $VERIFY_P3

TEST_ENTREF=$(bd create --title="GH#753: Write entity-reference.spec.ts E2E tests (~8 tests)" --type=task --priority=2 --labels=testing --silent)
bd dep add $TEST_ENTREF $ATTR_ENTREF

VERIFY_ENTREF=$(bd create --title="GH#753: VERIFY entity-reference.spec.ts passes" --type=task --labels=testing --silent)
bd dep add $VERIFY_ENTREF $TEST_ENTREF

# Phase 4 Gate
VERIFY_P4=$(bd create --title="GH#753: VERIFY Phase 4 - all relationship type tests pass" --type=task --labels=testing --silent)
bd dep add $VERIFY_P4 $VERIFY_USERREF
bd dep add $VERIFY_P4 $VERIFY_ENTREF
```

### Phase 5: Readonly Types (rollups, computed) - P3

```bash
# ============================================
# PHASE 5: READONLY TYPES (readonly-display affordance)
# All calculated/derived fields
# ============================================

# 5A: ROLLUP-COUNT FIELD
ATTR_RCOUNT=$(bd create --title="GH#753: Add data attributes to RollupCountFieldType" --type=task --priority=3 --silent)
bd dep add $ATTR_RCOUNT $VERIFY_P4

TEST_RCOUNT=$(bd create --title="GH#753: Write rollup-count.spec.ts E2E tests (~6 tests)" --type=task --priority=3 --labels=testing --silent)
bd dep add $TEST_RCOUNT $ATTR_RCOUNT

VERIFY_RCOUNT=$(bd create --title="GH#753: VERIFY rollup-count.spec.ts passes" --type=task --labels=testing --silent)
bd dep add $VERIFY_RCOUNT $TEST_RCOUNT

# 5B: ROLLUP-SUM FIELD
ATTR_RSUM=$(bd create --title="GH#753: Add data attributes to RollupSumFieldType" --type=task --priority=3 --silent)
bd dep add $ATTR_RSUM $VERIFY_P4

TEST_RSUM=$(bd create --title="GH#753: Write rollup-sum.spec.ts E2E tests (~6 tests)" --type=task --priority=3 --labels=testing --silent)
bd dep add $TEST_RSUM $ATTR_RSUM

VERIFY_RSUM=$(bd create --title="GH#753: VERIFY rollup-sum.spec.ts passes" --type=task --labels=testing --silent)
bd dep add $VERIFY_RSUM $TEST_RSUM

# 5C: ROLLUP-AVERAGE FIELD
ATTR_RAVG=$(bd create --title="GH#753: Add data attributes to RollupAverageFieldType" --type=task --priority=3 --silent)
bd dep add $ATTR_RAVG $VERIFY_P4

TEST_RAVG=$(bd create --title="GH#753: Write rollup-average.spec.ts E2E tests (~6 tests)" --type=task --priority=3 --labels=testing --silent)
bd dep add $TEST_RAVG $ATTR_RAVG

VERIFY_RAVG=$(bd create --title="GH#753: VERIFY rollup-average.spec.ts passes" --type=task --labels=testing --silent)
bd dep add $VERIFY_RAVG $TEST_RAVG

# 5D: ROLLUP-CONCAT FIELD
ATTR_RCONCAT=$(bd create --title="GH#753: Add data attributes to RollupConcatFieldType" --type=task --priority=3 --silent)
bd dep add $ATTR_RCONCAT $VERIFY_P4

TEST_RCONCAT=$(bd create --title="GH#753: Write rollup-concat.spec.ts E2E tests (~6 tests)" --type=task --priority=3 --labels=testing --silent)
bd dep add $TEST_RCONCAT $ATTR_RCONCAT

VERIFY_RCONCAT=$(bd create --title="GH#753: VERIFY rollup-concat.spec.ts passes" --type=task --labels=testing --silent)
bd dep add $VERIFY_RCONCAT $TEST_RCONCAT

# 5E: COMPUTED FIELDS (expression + formula)
ATTR_COMPUTED=$(bd create --title="GH#753: Add data attributes to ComputedFieldTypes" --type=task --priority=3 --silent)
bd dep add $ATTR_COMPUTED $VERIFY_P4

TEST_COMPUTED=$(bd create --title="GH#753: Write computed.spec.ts E2E tests (~8 tests)" --type=task --priority=3 --labels=testing --silent)
bd dep add $TEST_COMPUTED $ATTR_COMPUTED

VERIFY_COMPUTED=$(bd create --title="GH#753: VERIFY computed.spec.ts passes" --type=task --labels=testing --silent)
bd dep add $VERIFY_COMPUTED $TEST_COMPUTED

# Phase 5 Gate
VERIFY_P5=$(bd create --title="GH#753: VERIFY Phase 5 - all readonly type tests pass" --type=task --labels=testing --silent)
bd dep add $VERIFY_P5 $VERIFY_RCOUNT
bd dep add $VERIFY_P5 $VERIFY_RSUM
bd dep add $VERIFY_P5 $VERIFY_RAVG
bd dep add $VERIFY_P5 $VERIFY_RCONCAT
bd dep add $VERIFY_P5 $VERIFY_COMPUTED
```

### Success Criteria Verification (Stop Condition Required)

> **REQUIRED BY STOP CONDITIONS:** `test_beads_created` for each success criterion.
> Create one VERIFY task per success criterion from Section 5.6.

```bash
# ============================================
# SUCCESS CRITERIA BEADS (from Section 5.6)
# ============================================

SC_1=$(bd create --title="GH#753: SC: All 17 field types have E2E tests" --type=task --labels=testing,success-criteria --silent)
bd dep add $SC_1 $VERIFY_P5

SC_2=$(bd create --title="GH#753: SC: ~136 new tests total" --type=task --labels=testing,success-criteria --silent)
bd dep add $SC_2 $VERIFY_P5

SC_3=$(bd create --title="GH#753: SC: No silent skips in tests" --type=task --labels=testing,success-criteria --silent)
bd dep add $SC_3 $VERIFY_P5

SC_4=$(bd create --title="GH#753: SC: Data attributes on all field types" --type=task --labels=testing,success-criteria --silent)
bd dep add $SC_4 $VERIFY_P5

SC_5=$(bd create --title="GH#753: SC: Tests use throw Error() pattern" --type=task --labels=testing,success-criteria --silent)
bd dep add $SC_5 $VERIFY_P5

SC_6=$(bd create --title="GH#753: SC: Existing 49 tests still pass" --type=task --labels=testing,success-criteria --silent)
bd dep add $SC_6 $VERIFY_P5

# All success criteria must pass for final
VERIFY_CRITERIA=$(bd create --title="GH#753: VERIFY all success criteria passed" --type=task --labels=testing --silent)
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
DEMO=$(bd create --title="GH#753: DEMO to user - run all 185+ tests" --type=task --priority=1 --labels=testing --silent)
bd dep add $DEMO $VERIFY_CRITERIA
# Execute: Section 5.7 Final Demo Checklist
# Run: pnpm vitest run e2e/vibegrid/field-types/ --config vitest.e2e.config.ts --reporter=verbose
# - All 185+ tests pass (49 existing + ~136 new)
# - Take screenshot of test results
```

### Finalization Phase (Required by Stop Conditions)

> **CRITICAL:** Implementation sessions require this finalization phase.
> Stop conditions enforce: `codex_code_review`, `learning_captured`
> See implementation-mode SKILL.md Steps 6-8.

```bash
# ============================================
# FINALIZATION PHASE: CODE REVIEW + LEARNING
# ============================================

# Step 1: Codex Code Review (gate >= 70) - BLOCKING
CODEX_REVIEW=$(bd create --title="GH#753: Codex code review (>= 70)" --type=task --priority=0 --labels=review,blocking --silent)
bd dep add $CODEX_REVIEW $DEMO
# Execute: .claude/skills/codex-bridge/scripts/review-code.sh origin/staging --gate=70
# If fails: Fix violations, re-run until >= 70/100
# BLOCKING: Cannot proceed until Codex review passes

# Step 2: Typecheck + Lint
QUALITY=$(bd create --title="GH#753: Typecheck and lint pass" --type=task --priority=1 --labels=quality --silent)
bd dep add $QUALITY $CODEX_REVIEW
# Execute: pnpm typecheck && pnpm lint
# Required for: typecheck_pass stop condition

# Step 3: Commit & Push
COMMIT=$(bd create --title="GH#753: Commit and push changes" --type=task --priority=1 --labels=git --silent)
bd dep add $COMMIT $QUALITY
# Execute: git add -A && git commit && git push
# Required for: changes_committed, changes_pushed stop conditions

# Step 4: Learning Capture Agent (REQUIRED - stop hook enforced)
LEARNING=$(bd create --title="GH#753: Spawn @learning-capture agent" --type=task --priority=0 --labels=session-close,blocking --silent)
bd dep add $LEARNING $COMMIT
# SPAWN AGENT (not script):
#   Task(subagent_type="learning-capture", prompt="
#     Analyze session for GH#753.
#     1. Read .claude/sessions/issue-753/errors.jsonl
#     2. Find user corrections in session
#     3. Update .claude/rules/*.md with patterns found
#     4. Create GitHub issues for improvements
#     5. Run .claude/workflows/scripts/capture-learning.sh
#   ")
# BLOCKING: Session cannot end until learningCaptured=true in state

# Step 5: Update GitHub Issue
GITHUB=$(bd create --title="GH#753: Update GitHub issue with results" --type=task --priority=1 --labels=session-close --silent)
bd dep add $GITHUB $LEARNING
# Execute: gh issue comment 753 --body "Implementation complete..."
# Required for: github_updated stop condition

# Sync beads
bd sync
bd dep tree  # Verify dependency structure
```

### Pre-Breakdown Gates (Planning Phase)

> **NOTE:** These gates must pass BEFORE creating the beads breakdown above.
> They are part of the planning workflow, not implementation tasks.

| Gate | Command | Threshold | Phase |
|------|---------|-----------|-------|
| Codex Spec Review | `.claude/skills/codex-bridge/scripts/review-spec.sh planning/specs/753-*.md --gate=75` | >= 75/100 | review |
| Thoroughness Check | `.claude/skills/validate-spec/scripts/validate.sh planning/specs/753-*.md` | No MUST_CHANGE | review |
| Human Approval | User says "approve" | explicit | review |

**Only create beads breakdown after all gates pass.**

### Task Dependency Graph

```
                          +----------------+
                          |   BASELINE     |  ← P0: Existing 49 tests pass?
                          +-------+--------+
                                  |
                                  v
    +-----------------------------------------------------------------------------------+
    |                         PHASE 1: Basic Editable Types (P1)                        |
    +-----------------------------------------------------------------------------------+
    |  +----------+    +----------+    +----------+                                     |
    |  |ATTR_TEXT |    |ATTR_ENTNAME|  |ATTR_NUMBER|   ← Add data attributes           |
    |  +----+-----+    +-----+----+    +----+-----+                                     |
    |       |               |              |                                            |
    |       v               v              v                                            |
    |  +----------+    +----------+    +----------+                                     |
    |  |TEST_TEXT |    |TEST_ENTNAME|  |TEST_NUMBER|   ← Write E2E tests               |
    |  +----+-----+    +-----+----+    +----+-----+                                     |
    |       |               |              |                                            |
    |       v               v              v                                            |
    |  +----------+    +----------+    +----------+                                     |
    |  |VERIFY_TEXT|   |VERIFY_ENTNAME||VERIFY_NUMBER| ← Verify tests pass             |
    |  +----+-----+    +-----+----+    +----+-----+                                     |
    |       |               |              |                                            |
    |       +---------------+--------------+                                            |
    |                       v                                                           |
    |                 +-----------+                                                     |
    |                 | VERIFY_P1 |  ← Gate: All basic editable tests pass             |
    |                 +-----+-----+                                                     |
    +-----------------------------------------------------------------------------------+
                                  |
                                  v
    +-----------------------------------------------------------------------------------+
    |                         PHASE 2: Link Types (P2)                                  |
    +-----------------------------------------------------------------------------------+
    |  [ATTR → TEST → VERIFY] for: EMAIL, URL, PHONE                                   |
    |                                                                                   |
    |                 +-----------+                                                     |
    |                 | VERIFY_P2 |  ← Gate: All link type tests pass                  |
    |                 +-----+-----+                                                     |
    +-----------------------------------------------------------------------------------+
                                  |
                                  v
    +-----------------------------------------------------------------------------------+
    |                         PHASE 3: Display Types (P2/P3)                            |
    +-----------------------------------------------------------------------------------+
    |  [ATTR → TEST → VERIFY] for: CURRENCY, FILE, IMAGE, MARKDOWN                     |
    |                                                                                   |
    |                 +-----------+                                                     |
    |                 | VERIFY_P3 |  ← Gate: All display type tests pass               |
    |                 +-----+-----+                                                     |
    +-----------------------------------------------------------------------------------+
                                  |
                                  v
    +-----------------------------------------------------------------------------------+
    |                         PHASE 4: Relationship Types (P2)                          |
    +-----------------------------------------------------------------------------------+
    |  [ATTR → TEST → VERIFY] for: USER-REFERENCE, ENTITY-REFERENCE                    |
    |                                                                                   |
    |                 +-----------+                                                     |
    |                 | VERIFY_P4 |  ← Gate: All relationship type tests pass          |
    |                 +-----+-----+                                                     |
    +-----------------------------------------------------------------------------------+
                                  |
                                  v
    +-----------------------------------------------------------------------------------+
    |                         PHASE 5: Readonly Types (P3)                              |
    +-----------------------------------------------------------------------------------+
    |  [ATTR → TEST → VERIFY] for: ROLLUP-COUNT, ROLLUP-SUM, ROLLUP-AVERAGE,           |
    |                               ROLLUP-CONCAT, COMPUTED                             |
    |                                                                                   |
    |                 +-----------+                                                     |
    |                 | VERIFY_P5 |  ← Gate: All readonly type tests pass              |
    |                 +-----+-----+                                                     |
    +-----------------------------------------------------------------------------------+
                                  |
                                  v
                    +------------------------+
                    | SUCCESS CRITERIA       |
                    | SC_1 ... SC_6          |
                    +------------------------+
                                  |
                                  v
                    +------------------------+
                    | VERIFY ALL CRITERIA    |
                    +------------------------+
                                  |
                                  v
                    +------------------------+
                    | DEMO: Run 185+ tests   |
                    +------------------------+
                                  |
                                  v
                    +------------------------+
                    | FINALIZATION PHASE     |
                    | Codex → Quality → Push |
                    +------------------------+
                                  |
      +----------+----------+
      |          |          |
      v          v          v
  +-------+ +-------+ +---------+
  | CODEX | |QUALITY| | COMMIT  |
  | CODE  | |typecheck| | & PUSH|
  | REVIEW| | lint  | |         |
  +---+---+ +---+---+ +----+----+
      |          |          |
      +-----+----+----------+
            |
            v
     +------------------------+
     |  LEARNING CAPTURE      |  ← BLOCKING (stop hook)
     +------------------------+
                 |
                 v
     +------------------------+
     |  UPDATE GITHUB ISSUE   |
     +------------------------+
```

### Task Tracking Summary

| Phase | ATTR Task | TEST Task | VERIFY Task | Gate |
|-------|-----------|-----------|-------------|------|
| P0 Baseline | - | - | Run existing 49 tests | All pass |
| P1 Basic Editable | Add data-* attrs | Write ~24 E2E tests | Run text/entity-name/number.spec.ts | All pass |
| P2 Link Types | Add data-* attrs | Write ~24 E2E tests | Run email/url/phone.spec.ts | All pass |
| P3 Display Types | Add data-* attrs | Write ~24 E2E tests | Run currency/file/image/markdown.spec.ts | All pass |
| P4 Relationship | Add data-* attrs | Write ~16 E2E tests | Run user-ref/entity-ref.spec.ts | All pass |
| P5 Readonly | Add data-* attrs | Write ~32 E2E tests | Run rollup/computed.spec.ts | All pass |
| SC Verification | - | - | Verify 6 success criteria | All checked |
| Demo | - | - | Run all 185+ tests | All pass |
| Finalize | Codex code review (BLOCKING) | Typecheck + lint | Commit & push | >=70 (BLOCKING), `typecheck_pass` |
| Close | - | @learning-capture agent | Update GitHub | `learning_captured` (BLOCKING), `github_updated` |

---

## 7. Notes

**Discovered during spec writing:**

- **Field count:** Actually 17 remaining field types (not 16 as originally estimated in GH#729)
- **Test fixture enhancement needed:** Current `generateFieldTypeTestFixtures()` may need additional fields for rollup/computed testing
- **Computed fields:** May require mock calculation data since actual calculations depend on backend

**Open questions:**

- Should file/image tests include upload functionality, or just display? (Recommendation: display only for this issue)
- Should computed fields show real calculated values, or placeholder data? (Recommendation: placeholder data, real calculations tested in unit tests)

**Risks:**

- **Chrome CDP stale session:** Long test runs may hit CDP timeout. Mitigation: Restart Chrome between batches if needed.
- **Test fixture data:** Fixtures must have valid test data for each field type. Need to verify generateFieldTypeTestFixtures() covers all 17 types.
