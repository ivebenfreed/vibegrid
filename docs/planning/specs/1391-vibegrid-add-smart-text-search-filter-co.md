---
initiative: GH#1391-vibegrid-add-smart-text-search-filter-co
type: feature
issue_type: feature
status: draft
priority: medium
roadmap: null
owner: null
github_issue: 1391
github_milestone: null
created: 2026-01-27
updated: 2026-01-27
phases: []
---

# VibeGrid: Add smart text search filter component

> GitHub Issue: [#1391](https://github.com/baseplane-ai/baseplane/issues/1391)

## Overview

Add a smart text search input to VibeGrid's toolbar that filters rows across all text columns simultaneously. Currently VibeGrid only has the advanced FilterBuilder for column-specific filtering - there's no quick search capability.

## Research Findings

**Current state:**
- VibeGrid has `FilterBuilder` for Notion-style advanced filtering (AND/OR logic, per-column)
- No global text search exists
- `searchValue` in InteractionStore is only for filtering the column picker dropdown, not row data
- The separate `data-table` component (TanStack Table) has globalFilter but VibeGrid doesn't

**Reference implementation:** `shared/components/data-table/toolbar.tsx` lines 42-46

## Feature Behaviors

| ID | Trigger | Expected | Verify | Severity |
|----|---------|----------|--------|----------|
| B1 | User types in search input | Rows filter instantly across all text columns | Type "test", only rows with "test" in any text field visible | P0 |
| B2 | User clears search | All rows visible again | Clear input, full dataset shown | P0 |
| B3 | Search with FilterBuilder | Both filters apply (AND logic) | Search + column filter both active | P1 |
| B4 | Case sensitivity | Search is case-insensitive by default | "TEST" matches "test" | P1 |

## Implementation Phases

### Phase 1: Store + Basic UI
- Add `globalSearchText` observable to VisualStateStore
- Add `SmartSearchInput` component to VibeGridXHeaderPure
- Wire up search state

### Phase 2: Row Filtering
- Implement row filtering logic in TableCoreStore
- Filter across all columns with `cellType: 'text'`
- Debounce search input (300ms)

### Phase 3: Polish
- Add clear button (X icon)
- Keyboard shortcut (Cmd/Ctrl+F)
- Highlight matching text in cells (optional)
