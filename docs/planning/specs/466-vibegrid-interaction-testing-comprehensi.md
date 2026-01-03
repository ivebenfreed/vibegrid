---
issue: 466
type: feature
title: VibeGrid Interaction Testing - Comprehensive E2E Test Suite
status: draft
created: 2025-12-31
updated: 2025-12-31
template: full-stack
---

# Feature Planning: VibeGrid Interaction Testing - Comprehensive E2E Test Suite

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
| #415 | Mock Framework Implementation | Provides test data scenarios and debug routes for testing |
| #465 | VibeGrid Interactions Research | Documents all 12 interaction categories and testing patterns |

### Key Findings Applied

1. **Finding:** VibeGrid has 12 distinct interaction categories requiring different test approaches
   **Impact on spec:** Organized tests into separate spec files per category with specialized scenarios

2. **Finding:** Mock framework provides 9 scenarios including gantt-simple, gantt-deps, gantt-critical
   **Impact on spec:** Extend existing scenarios.ts rather than creating new mock infrastructure

3. **Finding:** Cell affordances (navigate/edit/toggle/none) determine click behavior based on cell content location
   **Impact on spec:** Tests must differentiate padding clicks (selection) vs content clicks (affordance)

### Unresolved Questions from Research

| Question | How Addressed in Spec |
|----------|----------------------|
| Should tests verify UI state only or data state too? | Decided: Both - UI state AND data state verification per user requirement |
| How to handle drag & drop E2E tests? | Use Playwright's dragTo() with specific source/target locators |

---

## 0. Feature Context

**GitHub Issue:** #466
**Acceptance Criteria:**
1. All 12 VibeGrid interaction categories have comprehensive E2E test coverage
2. Tests organized into separate spec files per category (e.g., `e2e/vibegrid/selection.spec.ts`)
3. Keyboard navigation tests include arrow keys, Tab, Enter, Escape
4. Tests focus on happy paths (edge cases deferred to future iteration)
5. Gantt tests cover bar drag, dependency creation, and critical path toggle
6. Tests use existing 4 debug routes + new routes as needed
7. Verification includes both UI state (DOM) AND data state (store/API)
8. New test scenarios added to `apps/web/src/shared/data/mock/scenarios.ts`

**Related Features:**
- `apps/web/e2e/vibegrid-mock.spec.ts` - 10 existing VibeGrid E2E tests to learn from
- `apps/web/src/systems/vibegrid/` - Full VibeGrid system implementation
- `apps/web/src/shared/data/mock/scenarios.ts` - Mock data scenarios framework

---

## 0.5 BASELINE VERIFICATION (BLOCKING)

> **CRITICAL:** Before ANY implementation, manually verify existing related features work.
> If baseline is broken → STOP → File bug → Fix baseline first.
> See `.claude/rules/incremental-verification.md` for full protocol.

### Pre-Implementation Checks

| Check | How to Verify | Expected Result | Status |
|-------|---------------|-----------------|--------|
| Debug routes work | Navigate to `/debug/vibegrid-test/basic` | Grid renders with mock data | [ ] |
| Mock scenario loads | Select "small" scenario in MockDataControls | 5 rows appear | [ ] |
| Gantt debug route works | Navigate to `/debug/vibegrid-test/gantt` | Gantt bars render | [ ] |
| Existing E2E tests pass | Run `pnpm --filter=@baseplane/web e2e -- --grep "VibeGrid"` | All 10 tests pass | [ ] |
| No console errors | Open DevTools Console on debug routes | No errors | [ ] |

**If ANY check fails:**
1. STOP planning
2. File a bug issue for the broken baseline
3. Fix baseline before extending

### Baseline Verification Task (auto-created in Beads)
```bash
# This task MUST be first and MUST block all implementation
BASELINE=$(bd create --title="GH#466: VERIFY baseline - debug routes and existing tests work" --type=task --priority=0 --labels=testing --silent)
```

---

## 1. Backend / API

**N/A** - This feature is testing-only. No new backend APIs, routes, or services required.

The tests will interact with existing VibeGrid components and stores through the browser UI.
Mock data is provided by the existing mock framework (`apps/web/src/shared/data/mock/scenarios.ts`).

---

## 2. Frontend / UI

### 2.1 Similar Feature Analysis

**Most similar existing feature:**
Path: `apps/web/e2e/vibegrid-mock.spec.ts`
Why similar: Existing E2E tests for VibeGrid - follow same patterns and fixtures

**Component patterns to follow:**
- Test fixture: `apps/web/e2e/fixtures/auth.fixture.ts` - Use `authenticatedPage` fixture
- Mock controls: `apps/web/src/systems/vibegrid/components/MockDataControls.tsx` - Scenario selection
- Test patterns: `apps/web/e2e/vibegrid-mock.spec.ts` - Locator patterns, assertions

### 2.2 New Files

| File Path | Purpose | Based On |
|-----------|---------|----------|
| `apps/web/e2e/vibegrid/selection.spec.ts` | Selection interaction tests | `e2e/vibegrid-mock.spec.ts` |
| `apps/web/e2e/vibegrid/editing.spec.ts` | Cell editing tests | `e2e/vibegrid-mock.spec.ts` |
| `apps/web/e2e/vibegrid/keyboard.spec.ts` | Keyboard navigation tests | `e2e/vibegrid-mock.spec.ts` |
| `apps/web/e2e/vibegrid/drag-drop.spec.ts` | Drag & drop tests | `e2e/vibegrid-mock.spec.ts` |
| `apps/web/e2e/vibegrid/sorting-filtering.spec.ts` | Sort/filter tests | `e2e/vibegrid-mock.spec.ts` |
| `apps/web/e2e/vibegrid/column-ops.spec.ts` | Column operations tests | `e2e/vibegrid-mock.spec.ts` |
| `apps/web/e2e/vibegrid/context-menu.spec.ts` | Context menu tests | `e2e/vibegrid-mock.spec.ts` |
| `apps/web/e2e/vibegrid/gantt.spec.ts` | Gantt view tests | `e2e/vibegrid-mock.spec.ts` |
| `apps/web/e2e/vibegrid/row-actions.spec.ts` | Row action tests | `e2e/vibegrid-mock.spec.ts` |
| `apps/web/e2e/vibegrid/clipboard.spec.ts` | Clipboard tests | `e2e/vibegrid-mock.spec.ts` |
| `apps/web/e2e/vibegrid/grouping.spec.ts` | Grouping tests | `e2e/vibegrid-mock.spec.ts` |
| `apps/web/e2e/vibegrid/cell-affordances.spec.ts` | Cell affordance tests | `e2e/vibegrid-mock.spec.ts` |

### 2.3 Key Files to Understand

**Interaction Handlers:**
| File | Interactions Handled |
|------|---------------------|
| `apps/web/src/systems/vibegrid/renderers/modules/MouseController.ts` | Click, drag, resize, reorder |
| `apps/web/src/systems/vibegrid/renderers/modules/KeyboardController.ts` | Key events, editing triggers, arrow keys, Tab navigation |
| `apps/web/src/systems/vibegrid/services/SelectionService.ts` | Cell/row selection logic |
| `apps/web/src/systems/vibegrid/managers/ClipboardManager.ts` | Copy/paste/undo/redo |

**Stores:**
| File | State Managed |
|------|---------------|
| `apps/web/src/systems/vibegrid/stores/InteractionStore.ts` | Selection, hover, focus |
| `apps/web/src/systems/vibegrid/stores/EditingStore.ts` | Cell editing state |
| `apps/web/src/systems/vibegrid/stores/VisualStateStore.ts` | Sort, filter, grouping, columns |
| `apps/web/src/systems/vibegrid/stores/GanttViewStore.ts` | Gantt-specific state |

**Components:**
| File | UI Element |
|------|------------|
| `apps/web/src/systems/vibegrid/overlays/EditingOverlay.tsx` | Cell edit input |
| `apps/web/src/systems/vibegrid/components/ContextMenu.tsx` | Right-click menu |
| `apps/web/src/systems/vibegrid/components/ActionsBar.tsx` | Bulk row actions |
| `apps/web/src/systems/vibegrid/components/GanttBar.tsx` | Gantt timeline bars |
| `apps/web/src/systems/vibegrid/components/DependencyArrowLayer.tsx` | Gantt dependencies |

### 2.4 Mock Framework Extension

**Existing scenarios file:** `apps/web/src/shared/data/mock/scenarios.ts`

**Phase 1 Prerequisite:** MockDataControls currently uses local SCENARIOS object. Refactoring task needed to wire MockDataControls to use `generateScenarioData()` from scenarios.ts for consistent scenario generation.

**Data State Verification Pattern:**

Tests need to verify both UI state (DOM) AND data state (store). Debug routes expose store state via a global variable:

```typescript
// In debug route component (e.g., basic.tsx, gantt.tsx):
useEffect(() => {
  if (import.meta.env.DEV) {
    (window as any).__VIBEGRID_TEST_STATE__ = {
      mockData,
      dependencies,
      selectedRows: interactionStore.selectedRows,
      editingCell: editingStore.editingCell,
      sortState: visualStateStore.sortState,
    }
  }
}, [mockData, dependencies, interactionStore.selectedRows, editingStore.editingCell, visualStateStore.sortState])
```

Playwright tests access this state:
```typescript
// In test file:
const testState = await page.evaluate(() => (window as any).__VIBEGRID_TEST_STATE__)
expect(testState.selectedRows).toContain(rowId)
expect(testState.editingCell).toEqual({ rowId, columnId })
```

**New scenarios to add:**
| Scenario | Purpose | Data Requirements |
|----------|---------|-------------------|
| `selection-multi` | Multi-selection tests | 10+ rows, varied content |
| `keyboard-nav` | Keyboard navigation | 5x5 grid minimum |
| `clipboard-test` | Clipboard operations | Editable cells, varied types |
| `context-menu-test` | Context menu tests | Rows with different states |
| `column-ops-test` | Column operations | 8+ columns, varied widths |

### 2.5 Existing Debug Routes

| Route | Purpose | Tests That Use It |
|-------|---------|-------------------|
| `/debug/vibegrid-test/basic` | Basic grid interactions | Selection, editing, keyboard |
| `/debug/vibegrid-test/gantt` | Gantt view testing | Bar drag, dependencies, critical path |
| `/debug/vibegrid-test/grouping` | Grouping operations | Group expand/collapse |
| `/debug/vibegrid-test/drag-drop` | Drag & drop testing | Row/column reorder |

**Phase 2 Debug Route Updates:**

For row actions tests (Category 9), the `/debug/vibegrid-test/basic` route needs ActionsBar props:

```tsx
// Update basic.tsx to include:
<VibeGrid
  // ... existing props
  rowActions={[
    { id: 'test-action', label: 'Test Action' },
    { id: 'archive', label: 'Archive' },
  ]}
  enableDelete={true}
  onRowAction={(actionId, rowIds, rowData) => {
    console.log('Row action:', actionId, rowIds)
  }}
  onDelete={(rowIds, rowData) => {
    console.log('Delete:', rowIds)
    // Update mockData to remove deleted rows for test verification
  }}
/>
```

### 2.6 DOM Classes for Testing

| Class | Element | Use In Assertions |
|-------|---------|-------------------|
| `.vibegridx-cell` | Grid cell | Cell locators |
| `.vibegridx-selected` | Selected cell/row | Selection verification |
| `.vibegridx-editing` | Cell in edit mode | Edit mode verification |
| `.vibegridx-header` | Column header | Header interactions |
| `.vibegridx-gantt-bar` | Gantt bar | Gantt interactions |
| `.vibegridx-dependency` | Dependency arrow | Dependency verification |
| `.vibegridx-critical-path` | Critical path highlight | Critical path verification |

---

## 3. Database / DataForge

**N/A** - This feature is testing-only. No database changes, DataForge archetypes, or migrations required.

Tests use the existing mock data framework which generates in-memory test data without database interactions.

---

## 4. Security

**N/A** - This feature is testing-only. Tests run against debug routes with mock data.

Security considerations for the test infrastructure:
- Debug routes (`/debug/*`) are only available in development mode
- Tests use the `authenticatedPage` fixture which handles authentication
- No production data or APIs are affected by these tests

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
| Dev Server | Port 4004 | Standard web app dev port |
| Test User | Any authenticated user | Use `authenticatedPage` fixture |
| Test Data | Mock scenarios from scenarios.ts | No external data needed |
| Browser | Chromium (Playwright default) | Playwright handles this |
| Debug Routes | `/debug/vibegrid-test/*` | 4 existing routes |

**Environment Readiness Check:**
```bash
# Start dev server if not running
cd apps/web && pnpm dev

# Verify debug routes accessible
curl -s http://localhost:4004/debug/vibegrid-test/basic | head -20

# Verify existing tests pass
pnpm --filter=@baseplane/web e2e -- --grep "VibeGrid" --reporter=list
```

### 5.2 Test Cases by Category

> **Agent:** Create test cases for EACH major feature area. These become VERIFY tasks.
> Pattern: Happy path focus (edge cases deferred per user requirement)

#### Category 1: Selection

**Spec file:** `apps/web/e2e/vibegrid/selection.spec.ts`
**Debug route:** `/debug/vibegrid-test/basic`
**Key files:** `SelectionService.ts`, `InteractionStore.ts`

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 1.1 | Single cell selection | Click cell padding | Cell has `.vibegridx-selected` class | P1 |
| 1.2 | Row selection via checkbox | Click row checkbox | Entire row highlighted, checkbox checked | P1 |
| 1.3 | Multi-select with Ctrl | Ctrl+click multiple cells | All clicked cells selected | P1 |
| 1.4 | Range select with Shift | Click cell, Shift+click another | All cells in range selected | P1 |
| 1.5 | Clear selection | Click outside grid | No cells selected | P1 |

#### Category 2: Editing

**Spec file:** `apps/web/e2e/vibegrid/editing.spec.ts`
**Debug route:** `/debug/vibegrid-test/basic`
**Key files:** `EditingOverlay.tsx`, `EditingStore.ts`, `KeyboardController.ts`

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 2.1 | Start edit via double-click | Double-click text cell | Editing overlay appears, cell has `.vibegridx-editing` | P1 |
| 2.2 | Start edit via F2 | Select cell, press F2 | Editing overlay appears | P1 |
| 2.3 | Start edit via Enter | Select cell, press Enter | Editing overlay appears | P1 |
| 2.4 | Commit edit | Type new value, press Enter | Overlay closes, cell shows new value | P1 |
| 2.5 | Cancel edit | Type value, press Escape | Overlay closes, original value restored | P1 |
| 2.6 | Title column edit | Click pencil icon on Title cell | Edit mode for title | P1 |

#### Category 3: Keyboard Navigation

**Spec file:** `apps/web/e2e/vibegrid/keyboard.spec.ts`
**Debug route:** `/debug/vibegrid-test/basic`
**Key files:** `KeyboardNavigationController.ts`, `KeyboardController.ts`

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 3.1 | Arrow key navigation | Select cell, press Arrow keys | Focus moves to adjacent cells | P1 |
| 3.2 | Tab navigation | Select cell, press Tab | Focus moves to next cell in row | P1 |
| 3.3 | Shift+Tab navigation | Select cell, press Shift+Tab | Focus moves to previous cell | P1 |
| 3.4 | Enter moves down | Edit cell, press Enter | Focus moves to cell below | P1 |
| 3.5 | Escape cancels and stays | Edit cell, press Escape | Edit cancelled, focus stays on cell | P1 |
| 3.6 | Home/End navigation | Press Home/End | Focus moves to first/last cell in row | P2 |

#### Category 4: Drag & Drop

**Spec file:** `apps/web/e2e/vibegrid/drag-drop.spec.ts`
**Debug route:** `/debug/vibegrid-test/drag-drop`
**Key files:** `MouseController.ts`, `interaction-handlers.ts`

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 4.1 | Column reorder | Drag column header to new position | Column moves, other columns shift | P1 |
| 4.2 | Row reorder | Drag row handle to new position | Row moves, other rows shift | P1 |
| 4.3 | Fill handle drag | Select cell, drag fill handle down | Values copied to dragged cells | P2 |

#### Category 5: Sorting & Filtering

**Spec file:** `apps/web/e2e/vibegrid/sorting-filtering.spec.ts`
**Debug route:** `/debug/vibegrid-test/basic`
**Key files:** `VisualStateStore.ts`, `MouseController.ts`

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 5.1 | Single column sort | Click column header | Rows reorder, sort indicator appears | P1 |
| 5.2 | Toggle sort direction | Click sorted column again | Sort reverses (asc → desc → none) | P1 |
| 5.3 | Multi-column sort | Shift+click second column | Multi-level sort applied | P2 |

#### Category 6: Column Operations

**Spec file:** `apps/web/e2e/vibegrid/column-ops.spec.ts`
**Debug route:** `/debug/vibegrid-test/basic`
**Key files:** `MouseController.ts`, `VisualStateStore.ts`

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 6.1 | Column resize | Drag column border | Column width changes | P1 |
| 6.2 | Column hide | Right-click header, click Hide | Column hidden from view | P2 |
| 6.3 | Column show | Open column menu, show hidden column | Column reappears | P2 |

#### Category 7: Context Menus

**Spec file:** `apps/web/e2e/vibegrid/context-menu.spec.ts`
**Debug route:** `/debug/vibegrid-test/basic`
**Key files:** `ContextMenu.tsx`

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 7.1 | Cell context menu | Right-click on cell | Context menu appears with options | P1 |
| 7.2 | Header context menu | Right-click on header | Header-specific menu appears | P1 |
| 7.3 | Menu action execution | Click menu option | Action executes, menu closes | P1 |
| 7.4 | Menu dismiss | Click outside menu | Menu closes | P1 |

#### Category 8: Gantt View

**Spec file:** `apps/web/e2e/vibegrid/gantt.spec.ts`
**Debug route:** `/debug/vibegrid-test/gantt`
**Key files:** `GanttViewStore.ts`, `GanttBar.tsx`, `DependencyArrowLayer.tsx`

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 8.1 | Gantt bar drag (move) | Drag bar horizontally | Start/end dates change, bar moves | P1 |
| 8.2 | Gantt bar resize | Drag bar edge | Duration changes | P1 |
| 8.3 | Dependency creation | Drag from bar end to another bar | Dependency arrow appears | P1 |
| 8.4 | Dependency deletion | Right-click arrow, delete | Arrow removed | P2 |
| 8.5 | Critical path toggle | Click critical path button | Critical path bars highlighted | P1 |
| 8.6 | Critical path highlight | Enable critical path | `.vibegridx-critical-path` class on path bars | P1 |

#### Category 9: Row Actions

**Spec file:** `apps/web/e2e/vibegrid/row-actions.spec.ts`
**Debug route:** `/debug/vibegrid-test/basic`
**Key files:** `ActionsBar.tsx`, `InteractionStore.ts`

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 9.1 | Select rows for bulk action | Select multiple rows | ActionsBar appears with count | P1 |
| 9.2 | Bulk delete | Select rows, click Delete in ActionsBar | Selected rows removed | P1 |
| 9.3 | Bulk status change | Select rows, change status | All selected rows updated | P2 |

#### Category 10: Clipboard

**Spec file:** `apps/web/e2e/vibegrid/clipboard.spec.ts`
**Debug route:** `/debug/vibegrid-test/basic`
**Key files:** `ClipboardManager.ts`, `KeyboardController.ts`

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 10.1 | Copy cell (Ctrl+C) | Select cell, press Ctrl+C | Cell value copied to clipboard | P1 |
| 10.2 | Cut cell (Ctrl+X) | Select cell, press Ctrl+X | Cell value cut, cell cleared | P1 |
| 10.3 | Paste cell (Ctrl+V) | Copy cell, select another, Ctrl+V | Value pasted to target cell | P1 |
| 10.4 | Undo (Ctrl+Z) | Edit cell, press Ctrl+Z | Edit reverted | P1 |
| 10.5 | Redo (Ctrl+Y) | Undo edit, press Ctrl+Y | Edit reapplied | P1 |

#### Category 11: Grouping

**Spec file:** `apps/web/e2e/vibegrid/grouping.spec.ts`
**Debug route:** `/debug/vibegrid-test/grouping`
**Key files:** `VisualStateStore.ts`, `MouseController.ts`

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 11.1 | Expand group | Click group expand arrow | Group rows become visible | P1 |
| 11.2 | Collapse group | Click expanded group arrow | Group rows hidden | P1 |
| 11.3 | Expand all groups | Click Expand All button | All groups expanded | P2 |
| 11.4 | Collapse all groups | Click Collapse All button | All groups collapsed | P2 |

#### Category 12: Cell Affordances

**Spec file:** `apps/web/e2e/vibegrid/cell-affordances.spec.ts`
**Debug route:** `/debug/vibegrid-test/basic`
**Key files:** `CellActionRouter.ts`, `InteractionCoordinator.ts`

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 12.1 | Click padding = select | Click cell padding area | Cell selected (not edited) | P1 |
| 12.2 | Click content = affordance | Click cell content area | Affordance action triggered | P1 |
| 12.3 | Navigate affordance | Click cell with navigate affordance | Navigation occurs | P1 |
| 12.4 | Toggle affordance | Click checkbox cell | Checkbox toggles | P1 |
| 12.5 | Edit affordance | Click editable cell content | Edit mode starts | P1 |

### 5.3 Playwright Test Commands

> **Agent:** Commands to run E2E tests during development.

```bash
# Run all VibeGrid tests
pnpm --filter=@baseplane/web e2e -- --grep "VibeGrid"

# Run specific category
pnpm --filter=@baseplane/web e2e -- apps/web/e2e/vibegrid/selection.spec.ts
pnpm --filter=@baseplane/web e2e -- apps/web/e2e/vibegrid/editing.spec.ts
pnpm --filter=@baseplane/web e2e -- apps/web/e2e/vibegrid/keyboard.spec.ts
pnpm --filter=@baseplane/web e2e -- apps/web/e2e/vibegrid/gantt.spec.ts

# Run with UI mode for debugging
pnpm --filter=@baseplane/web e2e -- --ui apps/web/e2e/vibegrid/selection.spec.ts

# Run with headed browser
pnpm --filter=@baseplane/web e2e -- --headed apps/web/e2e/vibegrid/gantt.spec.ts

# Run single test by name
pnpm --filter=@baseplane/web e2e -- --grep "Single cell selection"

# Generate report after run
pnpm --filter=@baseplane/web exec playwright show-report
```

### 5.4 Per-Phase Verification Gates

> Each phase has a verification gate that MUST pass before proceeding.

**Phase 0 Verification (Baseline):**
| Check | Command/Steps | Expected | Status |
|-------|---------------|----------|--------|
| Debug routes load | Navigate to `/debug/vibegrid-test/basic` | Grid renders | [ ] |
| Mock scenarios work | Select "small" in MockDataControls | 5 rows appear | [ ] |
| Existing tests pass | `pnpm --filter=@baseplane/web e2e -- --grep "VibeGrid"` | All 10 pass | [ ] |

**Phase 1 Verification (New Scenarios):**
| Check | Command/Steps | Expected | Status |
|-------|---------------|----------|--------|
| New scenarios defined | Check `scenarios.ts` has new entries | 5 new scenarios exist | [ ] |
| Scenarios load | Select new scenario in MockDataControls | Data appears correctly | [ ] |

**Phase 2 Verification (Selection Tests):**
| Check | Command/Steps | Expected | Status |
|-------|---------------|----------|--------|
| Selection spec exists | Check `e2e/vibegrid/selection.spec.ts` | File exists | [ ] |
| Tests pass | Run selection spec | All tests pass | [ ] |
| UI verification | Tests check `.vibegridx-selected` class | DOM assertions work | [ ] |

**Phase 3-14 Verification (Per Category):**
| Check | Command/Steps | Expected | Status |
|-------|---------------|----------|--------|
| Spec file exists | Check `e2e/vibegrid/<category>.spec.ts` | File exists | [ ] |
| Tests pass | Run category spec | All tests pass | [ ] |
| Both UI and data verified | Tests check DOM and store state | Dual verification | [ ] |

**Final Verification (All Categories):**
| Check | Command/Steps | Expected | Status |
|-------|---------------|----------|--------|
| All 12 spec files exist | `ls apps/web/e2e/vibegrid/*.spec.ts` | 12 files | [ ] |
| All tests pass | `pnpm --filter=@baseplane/web e2e -- apps/web/e2e/vibegrid/` | 100% pass | [ ] |
| Test count meets target | Count test cases | 50+ tests (approx 4/category) | [ ] |

### 5.5 Automated Tests

| Test File | What It Tests | Test Cases Covered |
|-----------|---------------|-------------------|
| `e2e/vibegrid/selection.spec.ts` | Cell and row selection | 1.1-1.5 |
| `e2e/vibegrid/editing.spec.ts` | Cell editing flow | 2.1-2.6 |
| `e2e/vibegrid/keyboard.spec.ts` | Keyboard navigation | 3.1-3.6 |
| `e2e/vibegrid/drag-drop.spec.ts` | Drag and drop operations | 4.1-4.3 |
| `e2e/vibegrid/sorting-filtering.spec.ts` | Sort and filter | 5.1-5.3 |
| `e2e/vibegrid/column-ops.spec.ts` | Column operations | 6.1-6.3 |
| `e2e/vibegrid/context-menu.spec.ts` | Context menus | 7.1-7.4 |
| `e2e/vibegrid/gantt.spec.ts` | Gantt view interactions | 8.1-8.6 |
| `e2e/vibegrid/row-actions.spec.ts` | Bulk row actions | 9.1-9.3 |
| `e2e/vibegrid/clipboard.spec.ts` | Clipboard operations | 10.1-10.5 |
| `e2e/vibegrid/grouping.spec.ts` | Row grouping | 11.1-11.4 |
| `e2e/vibegrid/cell-affordances.spec.ts` | Cell click behavior | 12.1-12.5 |

### 5.6 Success Criteria

> **All must pass for feature to be complete.** Map to acceptance criteria from issue.

| Criterion | Test Cases | Verified By | Status |
|-----------|------------|-------------|--------|
| All 12 interaction categories have test coverage | All categories | Spec files exist | [ ] |
| Tests organized by category | - | 12 separate spec files | [ ] |
| Keyboard navigation tested | 3.1-3.6 | keyboard.spec.ts | [ ] |
| Happy paths covered | All P1 tests | E2E tests pass | [ ] |
| Gantt bar drag works | 8.1-8.2 | gantt.spec.ts | [ ] |
| Gantt dependencies work | 8.3-8.4 | gantt.spec.ts | [ ] |
| Gantt critical path works | 8.5-8.6 | gantt.spec.ts | [ ] |
| Tests use existing debug routes | - | Routes referenced in specs | [ ] |
| UI and data state verified | All tests | Both DOM and store checks | [ ] |
| New scenarios added | - | scenarios.ts extended | [ ] |

### 5.7 Final Demo Checklist

- [ ] **Run full test suite** - `pnpm --filter=@baseplane/web e2e -- apps/web/e2e/vibegrid/`
- [ ] **Show test report** - All 12 spec files, 50+ tests passing
- [ ] **Demo selection tests** - Show cell/row selection working
- [ ] **Demo editing tests** - Show edit start/commit/cancel
- [ ] **Demo keyboard tests** - Show arrow/Tab/Enter navigation
- [ ] **Demo Gantt tests** - Show bar drag, dependencies, critical path
- [ ] **Verify scenarios.ts extended** - Show new scenarios load correctly
- [ ] **Take screenshot of test report** as evidence

---

## 6. Task Breakdown (Verification-Gated)

> **CRITICAL:** Every implementation phase has a paired VERIFY task.
> Phase N+1 implementation depends on Phase N verification passing.
> See `.claude/rules/incremental-verification.md` for protocol.

### Beads Epic

```bash
bd create --title="GH#466: VibeGrid Interaction Testing - Comprehensive E2E Test Suite" --type=epic --external-ref="gh-466"
```

### Tasks (with verification gates)

> **IMPORTANT:** VERIFY tasks below reference test cases from Section 5.2.
> During implementation, execute the test cases listed and check them off.

```bash
# ============================================
# PHASE 0: BASELINE VERIFICATION (FIRST!)
# ============================================
BASELINE=$(bd create --title="GH#466: VERIFY baseline - debug routes and existing tests work" --type=task --priority=0 --labels=testing --silent)
# Execute: Section 5.4 Phase 0 Verification checks
# All existing VibeGrid tests must pass before adding new ones

# ============================================
# PHASE 1: NEW SCENARIOS IN scenarios.ts
# ============================================
SCENARIOS=$(bd create --title="GH#466: Add new test scenarios to scenarios.ts" --type=task --priority=1 --silent)
bd dep add $SCENARIOS $BASELINE
# Add: selection-multi, keyboard-nav, clipboard-test, context-menu-test, column-ops-test

VERIFY_SCENARIOS=$(bd create --title="GH#466: VERIFY Phase 1 - new scenarios load correctly" --type=task --labels=testing --silent)
bd dep add $VERIFY_SCENARIOS $SCENARIOS

# ============================================
# PHASE 2: NEW DEBUG ROUTES (if needed)
# ============================================
ROUTES=$(bd create --title="GH#466: Add new debug routes if needed for testing" --type=task --priority=2 --silent)
bd dep add $ROUTES $VERIFY_SCENARIOS

VERIFY_ROUTES=$(bd create --title="GH#466: VERIFY Phase 2 - all debug routes accessible" --type=task --labels=testing --silent)
bd dep add $VERIFY_ROUTES $ROUTES

# ============================================
# PHASE 3: SELECTION TESTS
# ============================================
SELECTION=$(bd create --title="GH#466: Create selection.spec.ts (test cases 1.1-1.5)" --type=task --priority=1 --silent)
bd dep add $SELECTION $VERIFY_ROUTES

VERIFY_SELECTION=$(bd create --title="GH#466: VERIFY Phase 3 - selection tests pass" --type=task --labels=testing --silent)
bd dep add $VERIFY_SELECTION $SELECTION

# ============================================
# PHASE 4: EDITING TESTS
# ============================================
EDITING=$(bd create --title="GH#466: Create editing.spec.ts (test cases 2.1-2.6)" --type=task --priority=1 --silent)
bd dep add $EDITING $VERIFY_SELECTION

VERIFY_EDITING=$(bd create --title="GH#466: VERIFY Phase 4 - editing tests pass" --type=task --labels=testing --silent)
bd dep add $VERIFY_EDITING $EDITING

# ============================================
# PHASE 5: KEYBOARD TESTS
# ============================================
KEYBOARD=$(bd create --title="GH#466: Create keyboard.spec.ts (test cases 3.1-3.6)" --type=task --priority=1 --silent)
bd dep add $KEYBOARD $VERIFY_EDITING

VERIFY_KEYBOARD=$(bd create --title="GH#466: VERIFY Phase 5 - keyboard tests pass" --type=task --labels=testing --silent)
bd dep add $VERIFY_KEYBOARD $KEYBOARD

# ============================================
# PHASE 6: DRAG & DROP TESTS
# ============================================
DRAGDROP=$(bd create --title="GH#466: Create drag-drop.spec.ts (test cases 4.1-4.3)" --type=task --priority=2 --silent)
bd dep add $DRAGDROP $VERIFY_KEYBOARD

VERIFY_DRAGDROP=$(bd create --title="GH#466: VERIFY Phase 6 - drag-drop tests pass" --type=task --labels=testing --silent)
bd dep add $VERIFY_DRAGDROP $DRAGDROP

# ============================================
# PHASE 7: SORTING/FILTERING TESTS
# ============================================
SORTING=$(bd create --title="GH#466: Create sorting-filtering.spec.ts (test cases 5.1-5.3)" --type=task --priority=2 --silent)
bd dep add $SORTING $VERIFY_DRAGDROP

VERIFY_SORTING=$(bd create --title="GH#466: VERIFY Phase 7 - sorting tests pass" --type=task --labels=testing --silent)
bd dep add $VERIFY_SORTING $SORTING

# ============================================
# PHASE 8: COLUMN OPERATIONS TESTS
# ============================================
COLUMN_OPS=$(bd create --title="GH#466: Create column-ops.spec.ts (test cases 6.1-6.3)" --type=task --priority=2 --silent)
bd dep add $COLUMN_OPS $VERIFY_SORTING

VERIFY_COLUMN_OPS=$(bd create --title="GH#466: VERIFY Phase 8 - column-ops tests pass" --type=task --labels=testing --silent)
bd dep add $VERIFY_COLUMN_OPS $COLUMN_OPS

# ============================================
# PHASE 9: CONTEXT MENU TESTS
# ============================================
CONTEXT_MENU=$(bd create --title="GH#466: Create context-menu.spec.ts (test cases 7.1-7.4)" --type=task --priority=2 --silent)
bd dep add $CONTEXT_MENU $VERIFY_COLUMN_OPS

VERIFY_CONTEXT_MENU=$(bd create --title="GH#466: VERIFY Phase 9 - context-menu tests pass" --type=task --labels=testing --silent)
bd dep add $VERIFY_CONTEXT_MENU $CONTEXT_MENU

# ============================================
# PHASE 10: GANTT TESTS (bar, deps, critical path)
# ============================================
GANTT=$(bd create --title="GH#466: Create gantt.spec.ts (test cases 8.1-8.6)" --type=task --priority=1 --silent)
bd dep add $GANTT $VERIFY_CONTEXT_MENU

VERIFY_GANTT=$(bd create --title="GH#466: VERIFY Phase 10 - gantt tests pass" --type=task --labels=testing --silent)
bd dep add $VERIFY_GANTT $GANTT

# ============================================
# PHASE 11: ROW ACTIONS TESTS
# ============================================
ROW_ACTIONS=$(bd create --title="GH#466: Create row-actions.spec.ts (test cases 9.1-9.3)" --type=task --priority=2 --silent)
bd dep add $ROW_ACTIONS $VERIFY_GANTT

VERIFY_ROW_ACTIONS=$(bd create --title="GH#466: VERIFY Phase 11 - row-actions tests pass" --type=task --labels=testing --silent)
bd dep add $VERIFY_ROW_ACTIONS $ROW_ACTIONS

# ============================================
# PHASE 12: CLIPBOARD TESTS
# ============================================
CLIPBOARD=$(bd create --title="GH#466: Create clipboard.spec.ts (test cases 10.1-10.5)" --type=task --priority=2 --silent)
bd dep add $CLIPBOARD $VERIFY_ROW_ACTIONS

VERIFY_CLIPBOARD=$(bd create --title="GH#466: VERIFY Phase 12 - clipboard tests pass" --type=task --labels=testing --silent)
bd dep add $VERIFY_CLIPBOARD $CLIPBOARD

# ============================================
# PHASE 13: GROUPING TESTS
# ============================================
GROUPING=$(bd create --title="GH#466: Create grouping.spec.ts (test cases 11.1-11.4)" --type=task --priority=2 --silent)
bd dep add $GROUPING $VERIFY_CLIPBOARD

VERIFY_GROUPING=$(bd create --title="GH#466: VERIFY Phase 13 - grouping tests pass" --type=task --labels=testing --silent)
bd dep add $VERIFY_GROUPING $GROUPING

# ============================================
# PHASE 14: CELL AFFORDANCES TESTS
# ============================================
AFFORDANCES=$(bd create --title="GH#466: Create cell-affordances.spec.ts (test cases 12.1-12.5)" --type=task --priority=2 --silent)
bd dep add $AFFORDANCES $VERIFY_GROUPING

VERIFY_AFFORDANCES=$(bd create --title="GH#466: VERIFY Phase 14 - cell-affordances tests pass" --type=task --labels=testing --silent)
bd dep add $VERIFY_AFFORDANCES $AFFORDANCES

# ============================================
# FINAL: SUCCESS CRITERIA + DEMO
# ============================================
VERIFY_CRITERIA=$(bd create --title="GH#466: VERIFY all success criteria" --type=task --labels=testing --silent)
bd dep add $VERIFY_CRITERIA $VERIFY_AFFORDANCES
# Check off every row in Section 5.6 Success Criteria

FINAL=$(bd create --title="GH#466: VERIFY complete - demo to user" --type=task --priority=1 --labels=testing --silent)
bd dep add $FINAL $VERIFY_CRITERIA
# Execute: Section 5.7 Final Demo Checklist

# Visualize
bd dep tree  # Verify dependency structure
```

### Dependency Graph (Expected)

```
      +-------------+
      |  BASELINE   |  ← P0: Existing tests pass
      +------+------+
             |
             v
      +-------------+
      |  SCENARIOS  |  ← P1: New mock scenarios
      +------+------+
             |
             v
      +-------------+
      |   ROUTES    |  ← P2: Debug routes ready
      +------+------+
             |
    +--------+--------+--------+--------+
    |        |        |        |        |
    v        v        v        v        v
+-------+ +------+ +------+ +------+ +------+
|SELECT | |EDIT  | |KEYBD | |DRAG  | |SORT  |
+---+---+ +--+---+ +--+---+ +--+---+ +--+---+
    |        |        |        |        |
    +--------+--------+--------+--------+
                      |
    +--------+--------+--------+--------+
    |        |        |        |        |
    v        v        v        v        v
+-------+ +------+ +------+ +------+ +------+
|COL-OP | |CTXMNU| |GANTT | |ROWACT| |CLIPBD|
+---+---+ +--+---+ +--+---+ +--+---+ +--+---+
    |        |        |        |        |
    +--------+--------+--------+--------+
                      |
              +-------+-------+
              |               |
              v               v
         +--------+     +-----------+
         |GROUPING|     |AFFORDANCES|
         +----+---+     +-----+-----+
              |               |
              +-------+-------+
                      |
                      v
              +---------------+
              | VERIFY ALL    |
              +-------+-------+
                      |
                      v
              +---------------+
              |    FINAL      |  ← Demo to user
              +---------------+
```

---

## 7. Notes

**Discovered complexity:**
- Drag & drop tests may require custom Playwright actions for precise coordinate-based dragging
- Clipboard tests may need browser permission grants for clipboard access
- Gantt dependency creation requires precise mouse coordinate calculations for drag start/end points

**Testing patterns discovered:**
- Cell click behavior depends on click location: padding = select, content = affordance
- Title column requires clicking pencil icon (not text) to start edit
- Column positions use nth-child(5) for Title (1-2 hidden, 3 Id, 4 Status, 5 Title)

**Key files for reference:**
- Existing E2E tests: `apps/web/e2e/vibegrid-mock.spec.ts`
- Mock scenarios: `apps/web/src/shared/data/mock/scenarios.ts`
- Authenticated fixture: `apps/web/e2e/fixtures/auth.fixture.ts`

**Risks:**
- Some interactions may be flaky in CI due to timing (mitigate with proper waits and locators)
- Clipboard tests may behave differently in headless vs headed mode
