---
date: 2026-03-23
topic: VIbeGrid Grouping System Analysis
status: complete
github_issue: null
---

# Research: VIbeGrid Grouping System Analysis

## Context

The VIbeGrid grouping system needs analysis and likely an overhaul — both visually and architecturally. This research catalogs all issues found through code review and staging visual testing.

## Architecture Overview

The grouping system spans 7 files across processors, renderers, stores, and config UIs:

| Component | File | Lines | Role |
|-----------|------|-------|------|
| GroupProcessor | `systems/vibegrid/processors/GroupProcessor.ts` | 795 | Static class — builds group tree, aggregations, flattens to virtual rows |
| GroupRenderer | `systems/vibegrid/renderers/components/GroupRenderer.ts` | 178 | DOM-based group header rendering (expand/collapse, labels) |
| group-behaviors.ts | `systems/vibegrid/renderers/utils/group-behaviors.ts` | 220 | **Duplicate** utility functions for group rendering |
| GroupConfigPanel | `systems/vibegrid/components/GroupConfigPanel.tsx` | 457 | Full panel UI for group configuration |
| GroupConfigDropdownPure | `systems/vibegrid/components/GroupConfigDropdownPure.tsx` | 380 | Dropdown UI — **overlapping** with Panel |
| VisualStateStore | `systems/vibegrid/stores/VisualStateStore.ts` | — | Holds `groupConfig`, expand/collapse state |
| TableCoreStore | `systems/vibegrid/stores/TableCoreStore.ts` | — | Pipeline stage 3: `groupedOrOrderedRows` computed |
| KanbanViewStore | `systems/vibegrid/stores/KanbanViewStore.ts` | — | Separate `groupByField` — **independent** grouping concept |

**Data pipeline:** `baseRows → searchFilteredRows → filteredRows → sortedRows → groupedOrOrderedRows → processedRows`

## Questions Explored

1. What is the current grouping architecture?
2. What visual/UX issues exist?
3. What long-list/performance issues exist?
4. What code architecture issues exist?

## Findings

### Visual / UX Issues

#### V1: Raw snake_case values displayed as group labels
- **Observed:** `status: active (2 items)`, `status: not_started (2 items)`
- **Expected:** `Status: Active`, `Status: Not Started`
- **Root cause:** `GroupProcessor.formatGroupValue()` falls through to `String(value)` for option values that don't match `column.enumOptions` — the raw DB value (e.g. `"active"`) is displayed instead of the option label
- **File:** `GroupProcessor.ts:626-689`

#### V2: Raw DB field names in group headers
- **Observed:** `status: active` (lowercase field name)
- **Expected:** `Status: Active` (human-readable display name)
- **Root cause:** `GroupRenderer.ts:104` uses `groupData.field` (raw DB column name) instead of `GroupField.displayName`
- **File:** `GroupRenderer.ts:102-104`

#### V3: Group header styling is plain/flat
- No color coding for status groups (Active = no visual cue, Completed = no visual cue)
- No status dot/badge like the column cell renderer shows
- Hardcoded `#f8f9fa` background — doesn't match design system, breaks dark mode
- **File:** `GroupRenderer.ts:48-52` (hardcoded hex colors)

#### V4: Empty groups clutter the view
- Shows `archived (0 items)`, `on_hold (0 items)`, `planning (0 items)` — 3 empty groups out of 6
- With many option values this dominates the screen — 50%+ empty groups
- No toggle to hide empty groups
- **File:** `GroupProcessor.ts:133-156` (pre-creates empty groups for all predefined options)

#### V5: Field names in dropdown show raw DB names
- "Owner id", "Project manager id", "General contractor id" instead of "Owner", "Project Manager", "General Contractor"
- `formatFieldName()` doesn't strip `_id` suffixes for reference fields
- **File:** `GroupConfigDropdownPure.tsx:202`

#### V6: Pluralization bug
- `(1 items)` — should be `(1 item)`
- **File:** `GroupRenderer.ts:104`

#### V7: No date range grouping
- Date fields (Start Date, End Date) aren't available for grouping
- Only select/enum/reference types are groupable
- Competing products group by month/quarter/year

### Long List / Performance Issues

#### P1: Incremental processing disabled when grouping is active
- `TableCoreStore.ts:1097` — forces synchronous processing for grouped mode
- Large datasets with grouping = UI freeze during recomputation
- **Impact:** Noticeable on datasets >500 rows

#### P2: No lazy group expansion
- Expanding a group immediately adds all child rows to the virtual row array
- With 1000 rows in a single group, expand = instant recompute of entire virtual array
- Should only compute visible rows within the expanded group

#### P3: `processedRows` recomputes on any group state change
- Toggling expand/collapse on a single group triggers full `processData()` — rebuilds ALL group nodes, ALL aggregations, ALL virtual rows
- Should be incremental: just insert/remove rows from the flattened array
- **File:** `TableCoreStore.ts:1039-1059` (computed property chains)

#### P4: Group config changes don't debounce
- Adding/removing grouping fields triggers immediate full reprocessing
- Multi-level grouping configuration (add field 1, then field 2) = 2 full recomputes

#### P5: All groups rendered in DOM simultaneously
- `flattenGroupTree()` creates a VirtualRow for every group header even when off-screen
- Virtual scroll helps for data rows but group headers are always in the flattened array

### Architecture Issues

#### A1: group-behaviors.ts is dead code / duplication
- Contains standalone `groupDataByField()`, `calculateGroupAggregations()`, `createGroupHeaderContent()`, `createGroupToggle()`
- All duplicated by GroupProcessor + GroupRenderer
- Unclear if anything calls the group-behaviors.ts versions
- **File:** `renderers/utils/group-behaviors.ts`

#### A2: GroupNode.children union type is dangerous
- `children: GroupNode[] | TableRow[]` with `'field' in child` discrimination
- If a TableRow ever has a `field` property (which is likely given entity data), grouping breaks silently
- **File:** `types.ts:385`, discrimination at `GroupProcessor.ts:461,512,720,739,759`

#### A3: 6x duplicated row data accessor pattern
- `(row as any).data?.[fieldName]` vs `(row as any)[fieldName]` repeated 6 times across GroupProcessor
- Should be a single `getFieldValue(row, fieldName)` helper
- **File:** `GroupProcessor.ts:164,174-180,214-224,288-300,318-330,391-397`

#### A4: GroupRenderer hardcodes styles, bypasses design system
- Hardcoded hex colors (`#f8f9fa`, `#333`, `#666`, `#e9ecef`)
- Hover handler does string comparison (`style.background !== '#e9ecef'`)
- Meanwhile `group-behaviors.ts` uses CSS variables correctly
- **File:** `GroupRenderer.ts:48-52,130`

#### A5: GroupRenderer coupled to legacy `visualState` API
- `this.visualState.visualOperations.toggleGroupExpansion()` — typed as `any`
- Marked "Legacy visual state" in comments
- **File:** `GroupRenderer.ts:108`

#### A6: Two config UIs with divergent type filtering
- `GroupConfigPanel.tsx` allows `select-multi` (bug) — `GroupConfigDropdownPure.tsx` excludes it (correct)
- `GroupConfigDropdownPure.tsx` includes `priority_option`, `status_option`, etc. — `GroupConfigPanel.tsx` doesn't
- Duplicated filtering logic is a bug factory
- **Files:** `GroupConfigPanel.tsx:51-68`, `GroupConfigDropdownPure.tsx:160-192`

#### A7: Kanban grouping is completely independent
- `KanbanViewStore.groupByField` (string) vs `VisualStateStore.groupConfig` (GroupConfig)
- Switching view modes loses grouping context
- No shared concept of "which field are we grouping by"

#### A8: `expandAll` hack never cleaned up
- `GroupConfigPanel.ts:183`: `expandAll: true` cast as `any`
- Comment says "Temporary cast — the actual implementation would handle this in the state machine"
- **File:** `GroupConfigPanel.tsx:183`

#### A9: No persistence of group config
- `Set<string>` for expandedGroups doesn't serialize to JSON
- Group config lost on page refresh
- `VisualStateStore:651` comment suggests PersistenceStore integration was intended but not completed

## Recommendations

| Priority | ID | What | Effort |
|----------|----|------|--------|
| **P0** | V1 | Fix value formatting — use option labels instead of raw values | S |
| **P0** | V2 | Use `displayName` in group headers instead of raw field name | S |
| **P0** | V6 | Fix `(1 items)` pluralization | XS |
| **P0** | A1 | Delete `group-behaviors.ts` or consolidate into GroupRenderer | S |
| **P1** | V4 | Add "Hide empty groups" toggle (default on) | S |
| **P1** | V5 | Strip `_id` suffix from reference field names in dropdown | S |
| **P1** | V3 | Color-coded group headers matching cell renderer styling | M |
| **P1** | A2 | Fix `GroupNode.children` — add discriminant `type` field | M |
| **P1** | A3 | Extract `getFieldValue(row, fieldName)` helper | S |
| **P1** | A4 | Move GroupRenderer to CSS variables, remove hardcoded hex | M |
| **P1** | A6 | Consolidate config UIs — one component with compact/expanded modes | M |
| **P2** | A5 | Remove legacy `visualState` coupling in GroupRenderer | S |
| **P2** | A8 | Clean up `expandAll` hack | S |
| **P2** | A9 | Persist group config (serialize Set as array) | M |
| **P2** | A7 | Unify table/kanban grouping concept | L |
| **P2** | V7 | Date range grouping (month/quarter/year) | L |
| **P3** | P1 | Investigate incremental processing for grouped mode | L |
| **P3** | P2 | Lazy group expansion (only compute visible rows) | L |
| **P3** | P3 | Incremental expand/collapse (insert/remove vs full recompute) | L |
| **P3** | P4 | Debounce group config changes | S |

**Effort key:** XS = <1hr, S = 1-4hr, M = 4-8hr, L = 1-2 days

## Next Steps

Create GitHub epic to track this work. Quick wins (P0) can be tackled immediately; visual polish (P1) as a sprint; performance (P3) as a future epic.
