---
date: 2026-03-19
topic: VIbeGrid Affordance System — Content-Click Regression Fix
status: complete
github_issue: null
---

# Research: VIbeGrid Affordance System Fix

## Context

After fixing the original bug (empty relationship cells navigating instead of opening picker — commit 966121b97), subsequent attempts to fix "click padding = select only" for content-click fields created a cascade of regressions across 6 commits. This research analyzes the current state and identifies the minimal fix.

## Questions Explored

1. Which architectural option (A: consistent DOM, B: separate attributes, C: remove content-click) is best?
2. Is the click routing actually broken, or is it only a CSS issue?
3. What is the exact DOM structure for each content-click renderer in both populated and empty states?
4. Can `renderEmpty` be fixed without breaking anything else?

## Findings

### The Problem Is Smaller Than It Looks

The CellActionRouter's content-click branch (lines 181-210) **already works correctly** for all click routing scenarios. The spatial check runs BEFORE the affordance attribute lookup, which means:
- Clicks on child elements with `data-affordance` → use that affordance (edit/navigate)
- Clicks on the cellContainer (padding) → spatial check fails → returns 'none' (select only)

The **only remaining issue** is CSS hover visual inconsistency: empty cells get full-width hover because `renderEmpty`'s inner `<span>` lacks `data-affordance`, so the CSS descendant selector doesn't match it.

### DOM Structure Analysis

**Cell container** (BodyRenderer, line ~768):
```html
<div class="vibegridx-cell" role="gridcell"
     data-row-id data-column-id data-field-type
     style="display:flex; align-items:center; padding:0 12px;">
  <!-- renderer output appended here -->
</div>
```
Cell container gets NO `data-affordance`. It's a flex container; inline `<span>` children do NOT stretch to fill width.

**9 content-click renderers:**

| Renderer | Populated | Empty | Child Affordances? | Group |
|----------|-----------|-------|-------------------|-------|
| TextFallback | textContent → auto-wrapped | renderEmpty | Yes (auto-wrap) | editable-content |
| Text | textContent → auto-wrapped | renderEmpty | Yes (auto-wrap) | editable-content |
| Number | textContent → auto-wrapped | renderEmpty | Yes (auto-wrap) | editable-content |
| Date | innerHTML badge | renderEmpty | Yes (inner div) | editable-badge |
| Select | appendChild badges | renderEmpty | Yes (badge spans) | editable-badge |
| Email | textContent → auto-wrapped | renderEmpty | Yes (auto-wrap) | (none) |
| Phone | textContent → auto-wrapped | renderEmpty | Yes (auto-wrap) | (none) |
| Currency | textContent → auto-wrapped | renderEmpty | Yes (auto-wrap) | (none) |
| Markdown | innerHTML html | custom innerHTML | No | (none) |

**Key pattern:** 6 of 9 renderers use bare `textContent` for populated cells → `applyAffordanceAttrs` auto-wraps these into `<span data-affordance="edit" data-affordance-role="content">`. But `renderEmpty` creates its own `<span>` via innerHTML → auto-wrap is skipped (firstElementChild exists) → inner span lacks `data-affordance`.

### renderEmpty — The Root Cause

```js
function renderEmpty(element, isEditable) {
  element.className = 'vibegridx-cell-empty'
  if (isEditable) {
    element.innerHTML = '<span style="opacity: 0.6;">Edit ✏️</span>'  // ← missing data-affordance
  }
}
```

The inner span should have `data-affordance="edit" data-affordance-role="content"` to match the auto-wrap contract.

### Click Routing Verification (Current State)

| Scenario | target | Router Path | Result |
|----------|--------|-------------|--------|
| Populated text → click text | auto-wrapped span | childAffordance ≠ cellContainer → edit | ✅ |
| Populated text → click padding | cellContainer div | childAffordance=null → spatial miss → none | ✅ |
| Empty cell → click "Edit ✏️" | inner span | childAffordance=renderer span ≠ cellContainer → edit | ✅ |
| Empty cell → click padding | cellContainer div | childAffordance=null → spatial miss → none | ✅ |
| Date badge → click badge | badge div w/ affordance | childAffordance ≠ cellContainer → edit | ✅ |
| Select badge → click badge | badge span w/ affordance | childAffordance ≠ cellContainer → edit | ✅ |
| Entity-ref empty → click | container override to edit | edit | ✅ |

All routing is correct. Only CSS hover is inconsistent.

### CSS Hover Issue

```css
/* Descendant selector — tight hover on child with affordance */
[data-affordance-group="editable-content"] [data-affordance="edit"]:hover { ... }

/* Same-element selector — hover on container itself */
[data-affordance-group="editable-content"][data-affordance="edit"]:hover { ... }
```

- Populated cells: descendant selector matches auto-wrapped inner span → tight hover ✓
- Empty cells: inner span has no `data-affordance` → only same-element selector fires → full-width hover ✗

## Recommendation

**Option A: Fix `renderEmpty` — 1 line change.**

```js
// Before:
element.innerHTML = '<span style="opacity: 0.6;">Edit ✏️</span>'

// After:
element.innerHTML = '<span data-affordance="edit" data-affordance-role="content" style="opacity: 0.6;">Edit ✏️</span>'
```

### Why This Works
1. CSS descendant selector now matches the inner span → tight hover like populated cells
2. Click routing continues to work — `closest('[data-affordance]')` finds the inner span, which ≠ cellContainer → returns 'edit' (correct for empty editable cells)
3. Padding clicks still return 'none' — clicks on the cellContainer find no `data-affordance` → spatial check fails → select only
4. No changes needed to CellActionRouter, applyAffordanceAttrs, affordances.css, or any renderer

### Why Options B and C Are Unnecessary
- **Option B (separate attributes):** The conflict between CSS and routing is already resolved by running content-click spatial check before affordance lookup. Separate attributes would require changing all CSS selectors, all renderers, and the router — massive blast radius for a solved problem.
- **Option C (remove content-click):** Loses spreadsheet-like UX. The system works; it just needs renderEmpty to follow the same DOM contract.

### Files Changed
- `apps/web/src/systems/vibegrid/slots/slot-initialization.ts` — line 29 (renderEmpty function)

### Commits to Keep
- `966121b97` — Remove duplicate applyAffordanceAttrs in BodyRenderer ✓
- `972292dc4` — Auto-wrap in applyAffordanceAttrs ✓ (this works correctly for populated cells)
- Content-click spatial check commits in CellActionRouter ✓ (the ordering is correct)

### Commits to Evaluate
- The CSS same-element selectors in affordances.css — these are fine and should be kept as a fallback for edge cases where the descendant selector doesn't apply.

## Open Questions

None — the fix is straightforward and all scenarios have been verified.

## Next Steps

1. Apply the 1-line fix to `renderEmpty`
2. Run typecheck + lint
3. Browser-verify: empty text cell hover, empty date cell hover, empty select cell hover
4. Verify populated cell behavior unchanged
5. Commit as `fix(vibegrid): add data-affordance to renderEmpty for consistent hover`
