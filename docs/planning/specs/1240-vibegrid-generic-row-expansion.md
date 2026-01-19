---
initiative: GH#1240-vibegrid-generic-row-expansion
issue_type: improvement
status: draft
priority: high
roadmap: null
owner: platform-engineering
github_issue: 1240
github_milestone: null
parent_epic: null
created: 2026-01-19
updated: 2026-01-19

# Implementation phases (used by `wm enter implementation`)
phases:
  - id: p1
    name: "Core Expansion State & Processor"
    tasks:
      - "Create RowExpansionProcessor with expand/collapse logic"
      - "Add expandedRowIds state to InteractionStore"
      - "Add expansion persistence to PersistenceStore"
      - "Create RowExpansionConfig TypeScript interface"
  - id: p2
    name: "Virtual Row System & Rendering"
    tasks:
      - "Add 'expanded-content' VirtualRow type"
      - "Update BodyRenderer to render inline expanded content"
      - "Create expand column next to select/drag columns"
      - "Add chevron icon with rotation animation"
  - id: p3
    name: "Data Loading & Caching"
    tasks:
      - "Create useRowExpansion hook for TanStack DB integration"
      - "Implement lazy loading pattern with loadChildren"
      - "Auto-collapse on empty children array"
      - "Handle loading and error states"
  - id: p4
    name: "Nested VibeGrid & Drag-Drop"
    tasks:
      - "Render nested VibeGrid for expanded content"
      - "Support childEntityType prop for different entities"
      - "Support same-entity self-referential hierarchies"
      - "Enable drag-drop to move children between parents"
  - id: p5
    name: "Bulk Actions & Field Type Migration"
    tasks:
      - "Add expand all / collapse all toolbar actions"
      - "Move RowExpandFieldType from features/coi/ to systems/vibegrid/"
      - "Refactor COIList to use generic rowExpansion prop"
      - "Remove COI-specific expansion state from COIStore"
---

# VibeGrid: Generic Row Expansion for One-to-Many Relationships

> **Primitive Extension**: This extends the VibeGrid primitive to support inline row expansion for any one-to-many relationship, making the pattern established in GH#1236 (COI → Coverages) generic and reusable across the platform.

## Problem Statement

**What problem are we solving?**

GH#1236 implemented row expansion for COI → Coverages as a **domain-specific** pattern in `features/coi/`. This creates several issues:

1. **Primitive bypass**: The pattern doesn't live in VibeGrid where it belongs
2. **Code duplication**: Every feature needing row expansion must reimplement the pattern
3. **Inconsistency**: Different features may implement expansion differently
4. **Platform debt**: Custom code that should have been a primitive extension

Every DataForge one-to-many relationship could benefit from row expansion (Invoice → Line Items, Order → Order Items, Project → Milestones), but without a generic primitive, each feature team builds their own.

**Why now?**

- GH#1236 proves the pattern works and is valuable to users
- COI implementation shows the expansion logic is generic (expand/collapse state, lazy loading, inline rendering)
- Multiple features on the roadmap need similar expansion (Invoices, Orders, Projects)
- Refactoring now prevents 3-5 more domain-specific implementations

---

## User Story

As a **platform engineer**,
I want **VibeGrid to support generic row expansion for one-to-many relationships**,
so that **any feature can show child records inline without reimplementing the pattern**.

---

## Goals & Non-Goals

### Goals
- VibeGrid can expand rows to show children inline (within the grid, not offcanvas)
- Works with TanStack DB collections (joins for related entities)
- Supports both same-entity hierarchies (Task → Subtask) and different-entity relationships (COI → Coverage)
- State persists across sessions (MobX PersistenceStore)
- Drag-drop enabled (move children between parents)
- Bulk actions work (expand all / collapse all)
- COI feature migrated from domain-specific to generic implementation

### Non-Goals (Out of Scope)
- **Deep nesting** - only 1 level of expansion (no grandchildren)
- **Tree mode** - this is inline expansion, not hierarchical tree view
- **Accordion mode** - multiple rows can be expanded simultaneously (not exclusive)

---

## Success Metrics

| Metric | Current | Target | How to Measure |
|--------|---------|--------|----------------|
| Expansion pattern reuse | 1 feature (COI) | 3+ features | Count features using rowExpansion prop |
| Code duplication | Custom per feature | 0 custom implementations | Audit feature directories for expansion logic |
| User satisfaction | N/A (new metric) | 80%+ | Survey users after Invoice/Order launches |

---

## Feature Behaviors

> **Format**: TEVS structure for direct sync to `docs/features/vibegrid/row-expansion.md`

### B1: User Expands Row to View Children

**Core:**
- **ID:** expand-row-inline
- **Trigger:** User clicks expand chevron in first column of row
- **Expected:** Row expands inline, showing nested VibeGrid with child records. Chevron rotates 90° to indicate expanded state.
- **Verify:** Expanded content appears directly below parent row. Child VibeGrid renders with correct data.
- **Source:** TBD

#### UI Layer
**Fluxwing Component:** `fluxwing/components/vibegrid-row-expansion.md`
**States:**
- default (chevron pointing right, no expanded content)
- expanded (chevron pointing down, child grid visible below)
- loading (chevron disabled, skeleton in expanded area)
- empty (chevron hidden if children array is empty)

#### API Layer
N/A - This is client-side state management

#### Data Layer
**Tables:** N/A
**Operation:** N/A (reads from existing TanStack DB collections)

---

### B2: Multiple Rows Expand Simultaneously

**Core:**
- **ID:** multi-expand
- **Trigger:** User expands Row A, then expands Row B without collapsing Row A
- **Expected:** Both rows remain expanded. No exclusive accordion behavior.
- **Verify:** expandedRowIds Set contains both row IDs. Both child grids render.
- **Source:** TBD

#### UI Layer
**States:**
- multiple-expanded (2+ rows showing expanded content)

#### API Layer
N/A

#### Data Layer
N/A

---

### B3: Expanded State Persists Across Sessions

**Core:**
- **ID:** persist-expansion
- **Trigger:** User expands Row A, refreshes page
- **Expected:** On page reload, Row A is still expanded with child data loaded
- **Verify:** PersistenceStore has savedState.expandedRowIds. On mount, rows expand automatically.
- **Source:** TBD

#### UI Layer
**States:**
- restoring (loading indicator during rehydration)

#### API Layer
N/A

#### Data Layer
**Tables:** localStorage (via PersistenceStore)
**Operation:** READ/WRITE expandedRowIds

---

### B4: Child Data Loads Lazily

**Core:**
- **ID:** lazy-load-children
- **Trigger:** User expands row for first time
- **Expected:** Chevron shows loading spinner. loadChildren() async function called. Child grid populates when data arrives.
- **Verify:** Network request fires on expand (not on page load). Child VibeGrid displays loading skeleton, then data.
- **Source:** TBD

#### UI Layer
**States:**
- loading (spinner on chevron, skeleton in expanded area)
- loaded (child grid shows data)
- error (error message in expanded area)

#### API Layer
**Endpoint:** Depends on feature (e.g., `GET /api/orpc/dataforge.entities.list` with filters)

#### Data Layer
**Tables:** N/A - uses DataForge Relationships
**Operation:** Query via DataForge `child_of` or `belongs_to` relationship (e.g., Coverage `belongs_to` COI)

---

### B5: Empty Children Auto-Collapse

**Core:**
- **ID:** auto-collapse-empty
- **Trigger:** loadChildren() returns empty array
- **Expected:** Row collapses automatically. Chevron hidden (no expand option for rows without children).
- **Verify:** expandedRowIds removes this row ID. Chevron column renders null for this row.
- **Source:** TBD

#### UI Layer
**States:**
- no-children (chevron hidden, row cannot expand)

#### API Layer
N/A

#### Data Layer
N/A

---

### B6: Nested VibeGrid for Children

**Core:**
- **ID:** nested-vibegrid
- **Trigger:** Row expansion renders expanded content
- **Expected:** Expanded area contains another VibeGrid component with columns defined for child entity type
- **Verify:** Child VibeGrid has own sort, filter, selection state. Scrolling child grid doesn't affect parent.
- **Source:** TBD

#### UI Layer
**Fluxwing Component:** `fluxwing/components/vibegrid-nested.md`
**States:**
- nested-grid-default (normal VibeGrid rendering)

#### API Layer
N/A

#### Data Layer
N/A

---

### B7: Different Entity Type Children (COI → Coverage)

**Core:**
- **ID:** different-entity-children
- **Trigger:** rowExpansion config has `childEntityType: 'Coverage'`
- **Expected:** Nested VibeGrid uses Coverage columns. Data fetched from coverages collection.
- **Verify:** Columns match Coverage schema (type, limit, deductible). Data correct for parent COI.
- **Source:** TBD

#### UI Layer
N/A

#### API Layer
**Endpoint:** Feature-specific (e.g., TanStack DB collection with join)

#### Data Layer
**Tables:** N/A - uses DataForge Relationships
**Operation:** Query via DataForge `belongs_to` relationship (Coverage `belongs_to` COI)

---

### B8: Same Entity Self-Referential Children (Task → Subtask)

**Core:**
- **ID:** self-referential-children
- **Trigger:** rowExpansion config has NO childEntityType (same entity)
- **Expected:** Nested VibeGrid uses parent's columns. Data fetched via DataForge `child_of` relationship.
- **Verify:** Columns identical to parent. Data shows Subtasks related to parent Task via `child_of` relationship.
- **Source:** TBD

#### UI Layer
N/A

#### API Layer
**Endpoint:** TanStack DB collection with DataForge relationship join

#### Data Layer
**Tables:** N/A - uses DataForge Relationships
**Operation:** Query via DataForge `child_of` relationship (Subtask `child_of` Task)

---

### B9: Drag-Drop to Move Children Between Parents

**Core:**
- **ID:** drag-child-to-new-parent
- **Trigger:** User drags child row from Parent A's expanded area to Parent B's expanded area
- **Expected:** Child's parent relationship updates to Parent B. Child disappears from Parent A's children, appears in Parent B's children.
- **Verify:** Database shows updated relationship. EventBus emits `table_change` for real-time sync of both parents' expanded areas.
- **Source:** TBD

#### UI Layer
**Fluxwing Component:** `fluxwing/components/vibegrid-drag-drop.md`
**States:**
- dragging-child (child row visual feedback during drag)
- drop-target (parent row highlights as valid drop target)

#### API Layer
**Endpoint:** CommandBus `entity.reassign-parent` command

#### Data Layer
**Tables:** N/A - uses DataForge Relationships
**Operation:** CommandBus updates relationship via DataForge (emits EventBus for real-time sync)

---

### B10: Bulk Expand All / Collapse All

**Core:**
- **ID:** bulk-expand-collapse
- **Trigger:** User clicks "Expand All" button in toolbar
- **Expected:** All rows with children expand simultaneously. Loading indicators show while data fetches. Collapse All collapses all.
- **Verify:** expandedRowIds Set contains all row IDs with children. All loadChildren() calls fire in parallel.
- **Source:** TBD

#### UI Layer
**Fluxwing Component:** `fluxwing/components/vibegrid-toolbar.md`
**States:**
- bulk-loading (progress indicator during batch expansion)

#### API Layer
N/A (multiple parallel loadChildren calls)

#### Data Layer
N/A

---

### B11: Error Handling for Failed Child Load

**Core:**
- **ID:** handle-load-error
- **Trigger:** loadChildren() throws error (network failure, 403, etc.)
- **Expected:** Expanded area shows error message with "Retry" button. Row stays expanded (doesn't auto-collapse).
- **Verify:** Error message visible. Clicking Retry re-calls loadChildren(). Success clears error and shows data.
- **Source:** TBD

#### UI Layer
**States:**
- error (error message + retry button in expanded area)

#### API Layer
N/A (error comes from feature-specific endpoint)

#### Data Layer
N/A

---

## User Journey

| Step | Action | UI State | Notes |
|------|--------|----------|-------|
| **1. Entry Point** | User views VibeGrid with rows | Grid with expand chevrons in first column | Chevrons visible for rows with children |
| **2. First Expand** | User clicks chevron on Row A | Chevron rotates down, loading skeleton appears | Lazy load fires |
| **3. Children Load** | loadChildren() resolves | Nested VibeGrid appears below Row A | Data from TanStack DB |
| **4. Explore Children** | User scrolls child grid, sorts, filters | Child VibeGrid independent state | Parent grid unaffected |
| **5. Expand Another** | User clicks chevron on Row B | Both Row A and Row B expanded | Multi-expand enabled |
| **6. Collapse** | User clicks Row A chevron | Row A collapses, child grid hidden | State remains in expandedRowIds cache |
| **7. Re-Expand** | User clicks Row A chevron again | Child grid appears immediately | Data cached by TanStack DB |

**Alternative Flows:**
- If loadChildren() returns empty array → row auto-collapses, chevron hidden
- If loadChildren() throws error → error message shown, retry available
- If user refreshes page → expanded state restored from PersistenceStore

---

## UI Layout (ASCII Wireframe)

### Default State (Collapsed)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ COI List                                               [Filter] [+New] [⋮]  │
├─────────────────────────────────────────────────────────────────────────────┤
│ ▶ ☐  Company              │ Effective Date │ Expiration  │ Status      │   │
│──────────────────────────────────────────────────────────────────────────────│
│ ▶ ☐  Acme Construction    │ 2026-01-01     │ 2026-12-31  │ ● Active    │   │
│ ▶ ☐  BuildCo LLC          │ 2025-06-15     │ 2026-06-14  │ ● Active    │   │
│   ☐  Old Vendor Inc       │ 2024-01-01     │ 2025-01-01  │ ○ Expired   │   │
└─────────────────────────────────────────────────────────────────────────────┘
                 ▲
                 └─ Chevron visible for rows with children
                    Hidden for "Old Vendor Inc" (no coverages)
```

### Expanded State (Single Row)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ COI List                                               [Filter] [+New] [⋮]  │
├─────────────────────────────────────────────────────────────────────────────┤
│ ▼ ☑  Acme Construction    │ 2026-01-01     │ 2026-12-31  │ ● Active    │   │
│ ├────────────────────────────────────────────────────────────────────────────┤
│ │ Coverages (3)                                    [Expand All] [Sort ▼]    │
│ │─────────────────────────────────────────────────────────────────────────│ │
│ │  Coverage Type      │ Limit         │ Deductible  │ Carrier            │ │
│ │─────────────────────────────────────────────────────────────────────────│ │
│ │  General Liability  │ $2,000,000    │ $5,000      │ State Farm         │ │
│ │  Workers Comp       │ $1,000,000    │ $1,000      │ Liberty Mutual     │ │
│ │  Auto Liability     │ $1,000,000    │ $2,500      │ Geico              │ │
│ └────────────────────────────────────────────────────────────────────────────┘
│ ▶ ☐  BuildCo LLC          │ 2025-06-15     │ 2026-06-14  │ ● Active    │   │
│   ☐  Old Vendor Inc       │ 2024-01-01     │ 2025-01-01  │ ○ Expired   │   │
└─────────────────────────────────────────────────────────────────────────────┘
          ▲                                         ▲
          └─ Chevron rotated down                   └─ Nested VibeGrid
             Parent row highlighted (selected)
```

### Loading State (Expansion in Progress)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ ▼ ☑  Acme Construction    │ 2026-01-01     │ 2026-12-31  │ ● Active    │   │
│ ├────────────────────────────────────────────────────────────────────────────┤
│ │ ◐ Loading coverages...                                                   │ │
│ │─────────────────────────────────────────────────────────────────────────│ │
│ │  ░░░░░░░░░░░░░░░░░   │ ░░░░░░░░░░░  │ ░░░░░░░░░  │ ░░░░░░░░░░░░░░░   │ │
│ │  ░░░░░░░░░░░░░░░░░   │ ░░░░░░░░░░░  │ ░░░░░░░░░  │ ░░░░░░░░░░░░░░░   │ │
│ └────────────────────────────────────────────────────────────────────────────┘
```

### Error State

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ ▼ ☑  Acme Construction    │ 2026-01-01     │ 2026-12-31  │ ● Active    │   │
│ ├────────────────────────────────────────────────────────────────────────────┤
│ │  ⚠️ Failed to load coverages                                            │ │
│ │                                                                         │ │
│ │  [Try again]                                                            │ │
│ └────────────────────────────────────────────────────────────────────────────┘
```

### Multi-Expand State

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ ▼ ☑  Acme Construction    │ 2026-01-01     │ 2026-12-31  │ ● Active    │   │
│ ├────────────────────────────────────────────────────────────────────────────┤
│ │ Coverages (3)                                                            │ │
│ │  General Liability  │ $2,000,000    │ $5,000      │ State Farm         │ │
│ │  Workers Comp       │ $1,000,000    │ $1,000      │ Liberty Mutual     │ │
│ └────────────────────────────────────────────────────────────────────────────┘
│ ▼ ☑  BuildCo LLC          │ 2025-06-15     │ 2026-06-14  │ ● Active    │   │
│ ├────────────────────────────────────────────────────────────────────────────┤
│ │ Coverages (2)                                                            │ │
│ │  General Liability  │ $1,000,000    │ $2,500      │ Allstate           │ │
│ │  Auto Liability     │ $500,000      │ $1,000      │ Progressive        │ │
│ └────────────────────────────────────────────────────────────────────────────┘
```

---

## Requirements Interview Summary

### Core Functionality

| Question | Answer | Rationale |
|----------|--------|-----------|
| Inline or offcanvas expansion? | Inline - content appears directly below row within grid | Matches user expectation, reduces navigation |
| Single or multi-expand? | Multi-expand - multiple rows can be expanded simultaneously | No exclusive accordion behavior needed |
| Controlled or uncontrolled state? | Uncontrolled - VibeGrid manages expandedRowIds | Simplifies feature usage, persistence built-in |
| Persistent expand column? | Yes - permanent column next to select/drag | Always visible for discoverability |

### Edge Cases

| Scenario | Handling | Rationale |
|----------|----------|-----------|
| Empty children array | Auto-collapse, hide chevron | No point expanding rows without children |
| Load failure | Show error message + retry button | User can recover without collapsing |
| Slow loadChildren() | Show loading spinner on chevron + skeleton in expanded area | Clear feedback during async operation |
| 1000+ children | Child VibeGrid has own virtualization | Performance handled by nested grid |
| Concurrent edits | TanStack DB + real-time sync handle | No special expansion logic needed |

### Platform Integration Decisions

| System | Decision | Rationale |
|--------|----------|-----------|
| Notifications | Not needed | Expansion is UI state, no user-facing events |
| Real-time Sync | Yes - child grid updates on mutations | Existing VibeGrid real-time sync works |
| Access Control | Use existing VibeGrid auth | Children inherit parent's permissions |
| Audit Logging | Not needed | Expansion is UI interaction, not data change |
| Workflows | Not applicable | No multi-step process |
| Settings | Not needed | No user preferences for expansion behavior |
| Feature Flags | Not needed | Generic primitive, always available |

### UX Decisions

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| Loading state | Spinner on chevron + skeleton in expanded area | Clear async feedback |
| Error recovery | Error message + retry button | User can fix transient failures |
| Mobile vs desktop | Desktop only (for now) | Mobile VibeGrid needs separate design |
| Keyboard shortcuts | Spacebar on focused row toggles expansion | Accessibility |
| Accessibility | Chevron is button, ARIA expanded attribute | Screen reader support |

### Frontend Technical

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| Component location | `apps/web/src/systems/vibegrid/` | This is a VibeGrid primitive extension |
| Route | N/A - used within existing VibeGrid routes | Not a standalone feature |
| Store type | Extend InteractionStore + PersistenceStore | Expansion is interaction state |
| State observable | expandedRowIds: Set<string> | Efficient lookup, reactive |
| Query cache strategy | TanStack DB handles caching | No custom cache needed |
| Form handling | N/A - read-only expansion | No form needed |

### Backend Technical

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| Worker | N/A - uses existing DataForge APIs | No new backend code |
| Router | N/A - features provide loadChildren function | Generic, feature-agnostic |
| Schema | N/A - works with existing relationships | DataForge relationships |
| Service | N/A - TanStack DB collections | Client-side only |
| Transaction scope | N/A - read operations | No mutations |
| Middleware | N/A - existing VibeGrid auth | No special auth needed |

### Scope Boundaries

| Excluded | Reason |
|----------|--------|
| Deep nesting (grandchildren) | Phase 2 - adds complexity |
| Tree mode (hierarchical view) | Different UX pattern - separate feature |
| Accordion mode (exclusive expand) | Not needed, multi-expand is more flexible |
| Custom expand animations | Phase 2 - default rotation is sufficient |

---

## Blast Radius Analysis

### Code Impact

- **Direct dependencies**:
  - `apps/web/src/systems/vibegrid/VibeGrid.tsx` - add rowExpansion prop
  - `apps/web/src/systems/vibegrid/stores/InteractionStore.ts` - add expandedRowIds state
  - `apps/web/src/systems/vibegrid/stores/PersistenceStore.ts` - persist expansion
  - `apps/web/src/systems/vibegrid/renderers/BodyRenderer.ts` - render expanded rows

- **Indirect dependencies**:
  - All features using VibeGrid (no breaking changes - opt-in via rowExpansion prop)

- **Workers affected**: None - client-side only

### Database Impact

| Change | Type | Migration | Existing Data |
|--------|------|-----------|---------------|
| None | N/A | N/A | N/A - uses existing relationships |

### API Impact

- **Breaking changes**: None
- **New endpoints**: None - uses existing DataForge entity APIs
- **Modified contracts**: None

### Test Impact

- **Tests to update**: VibeGrid unit tests (InteractionStore, BodyRenderer)
- **New test categories**:
  - Unit: RowExpansionProcessor, useRowExpansion hook
  - Integration: Expansion state + persistence
  - E2E: Expand → verify children → collapse → expand again

- **Test data requirements**: COI + Coverages seed data (reuse GH#1236)

### Performance Considerations

- **Query complexity**: Simple - SELECT with parent_id filter per expanded row
- **N+1 risks**: None - TanStack DB batches queries
- **Caching implications**: TanStack DB handles cache, expansion state in memory

### Security Review

- **Permission checks**: Children use same auth as parent VibeGrid
- **Data sensitivity**: No new data exposure - children already accessible via API
- **Input validation**: rowExpansion.loadChildren validated by TypeScript

---

## Auxiliary Systems Integration

### Notifications

- [ ] **Needed?** No
- Row expansion is UI state, no user-facing events to notify about

### Real-time Sync

- [x] **Needed?** Yes
- **Events to emit**: None - existing VibeGrid real-time sync handles child mutations
- **Sync scope**: Child VibeGrid subscribes to table_change events for child entity type
- **Optimistic updates**: Child VibeGrid handles optimistic updates

**Integration:**
```typescript
// No new integration needed - child VibeGrid uses existing real-time sync
<VibeGrid data={childRows} /> // Automatically subscribes to events
```

### Access Control

- [ ] **New permissions needed?** No
- **Permission handling**: Children inherit parent VibeGrid's auth context
- **UI guards**: If parent grid requires `entities:read`, children use same permission

### Audit Logging

- [ ] **Needed?** No
- Row expansion is UI interaction, not data mutation

### Workflows Integration

- [ ] **Needed?** No

### Settings/Preferences

- [ ] **Needed?** No
- Expansion state persists via PersistenceStore (per-grid, not global setting)

### Feature Flags

- [ ] **Needed?** No
- Generic primitive, always available when VibeGrid used

### Analytics/Metrics

- [ ] **Needed?** Optional (Phase 2)
- **Events to track**: expansion_toggled, bulk_expand_used
- **Metrics to measure**: % of users using expansion, avg children per parent

---

## Primitives Design

### Primitives Capability Audit

| Primitive | Applicable? | Usage | Gap? |
|-----------|-------------|-------|------|
| **DataForge** | Yes | Relationships define parent-child structure | None - existing relationships sufficient |
| **Relationships** | Yes | `belongs_to`, `child_of` relationships drive expansion | None - already supports one-to-many |
| **Workflows** | No | N/A | N/A |
| **Templates** | No | N/A | N/A |
| **CommandBus** | Yes | `entity.reassign-parent` for drag-drop between parents | None - extend with new command |
| **EventBus** | Yes | Child grid mutations emit events | None - existing real-time sync works |

### Using Existing Primitives

| Primitive | Specific Usage |
|-----------|----------------|
| DataForge | Relationships define parent → child structure (e.g., Coverage `belongs_to` COI, or Subtask `child_of` Task) |
| VibeGrid | Nested VibeGrid renders child records with full grid capabilities |
| PersistenceStore | Persist expandedRowIds per grid instance |
| InteractionStore | Manage expand/collapse state reactively |

### Extending Primitives

| Primitive | Extension | Benefit to Platform |
|-----------|-----------|---------------------|
| VibeGrid | Add `rowExpansion` prop with `loadChildren`, `childEntityType`, `renderExpanded` | All features with one-to-many relationships can use inline expansion |
| InteractionStore | Add `expandedRowIds: Set<string>` observable | Centralized expansion state for any VibeGrid |
| PersistenceStore | Add `expandedRowIds` to saved state schema | Expansion persists across sessions for any feature |

### Custom Code Decisions

| Component | Why Custom? | Why Not Extend Primitive? |
|-----------|-------------|---------------------------|
| (none) | N/A | This IS the primitive extension - no custom code needed |

**This table is empty**: Good! Design extends VibeGrid primitive only.

---

## Risks & Open Questions

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Performance with 100+ expanded rows | Low | Medium | Virtual scrolling handles it, lazy load means only visible children render |
| Deep nesting attempts | Low | Low | Out of scope (1 level only), documentation makes this clear |
| TanStack DB cache conflicts | Low | Medium | Separate collections for parent vs children, no conflict |

### Open Questions

- [ ] Should expand column be configurable (position, hide/show)? → Start with fixed position, make configurable if needed
- [ ] Should expansion trigger analytics events? → Optional, Phase 2

### Dependencies

| Dependency | Owner | Status | Blocker? |
|------------|-------|--------|----------|
| TanStack DB collections | Platform | Ready | No |
| VibeGrid virtual scrolling | Platform | Ready | No |
| MobX PersistenceStore | Platform | Ready | No |

---

## Design

### Overview

This extends VibeGrid to support inline row expansion for one-to-many relationships. The design follows the three-tier VibeGrid store pattern:

1. **TableCoreStore**: No changes - expansion doesn't affect data transformation
2. **InteractionStore**: Add `expandedRowIds: Set<string>` for tracking expanded state
3. **VisualStateStore**: Add `showExpandColumn: boolean` for expand column visibility

A new `RowExpansionProcessor` generates "expanded-content" VirtualRow entries that BodyRenderer inserts inline. The `useRowExpansion` hook handles lazy loading via TanStack DB collections.

**Key insight**: GH#1236 proved this pattern works. The refactor makes it generic by:
- Moving expansion state from COIStore to InteractionStore (generic)
- Moving RowExpandFieldType from features/coi/ to systems/vibegrid/ (reusable)
- Adding rowExpansion prop to VibeGrid (declarative API)
- Using TanStack DB directly instead of custom caching (simpler)

### Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          VibeGrid Component                         │
│                                                                     │
│  rowExpansion prop: {                                               │
│    enabled: true,                                                   │
│    childEntityType?: 'Coverage',                                    │
│    loadChildren: async (row) => fetchChildRecords(row.id),         │
│    renderExpanded?: (row, children, isLoading) => ReactNode        │
│  }                                                                  │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│                      RowExpansionProcessor                          │
│                                                                     │
│  Intercepts virtualRows array                                       │
│  For each expanded row ID:                                          │
│    1. Insert 'expanded-content' VirtualRow below parent             │
│    2. Set height based on child count                               │
│    3. Pass loadChildren function to hook                            │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│                       InteractionStore                              │
│                                                                     │
│  expandedRowIds: Set<string> (observable)                           │
│  toggleExpansion(rowId: string): void                               │
│  expandAll(): void                                                  │
│  collapseAll(): void                                                │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│                      useRowExpansion Hook                           │
│                                                                     │
│  const { children, isLoading, error, retry } =                      │
│    useRowExpansion(row, loadChildren, isExpanded)                   │
│                                                                     │
│  Calls loadChildren() when isExpanded = true                        │
│  Returns TanStack Query result                                      │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│                         BodyRenderer                                │
│                                                                     │
│  Renders virtualRows array:                                         │
│    - 'data' row → normal row rendering                              │
│    - 'expanded-content' row → render nested VibeGrid                │
│                                                                     │
│  <NestedVibeGrid                                                    │
│    data={children}                                                  │
│    columns={childColumns}                                           │
│    entityType={childEntityType}                                     │
│  />                                                                 │
└─────────────────────────────────────────────────────────────────────┘
```

### Key Interfaces

```typescript
// Core configuration interface
interface RowExpansionConfig<TRow = any> {
  /** Enable row expansion */
  enabled: boolean

  /** Optional child entity type (for different entity relationships) */
  childEntityType?: string

  /** Check if row can be expanded (has children) - used for chevron visibility */
  canExpand?: (row: TRow) => boolean

  /** Async function to load children for a row */
  loadChildren: (row: TRow) => Promise<any[]>

  /** Optional custom rendering for expanded content */
  renderExpanded?: (
    row: TRow,
    children: any[],
    isLoading: boolean,
    error?: Error
  ) => React.ReactNode

  /** Cache key for identifying unique rows (defaults to row.id) */
  cacheKey?: (row: TRow) => string

  /** Fixed height for expanded content area (default: 200px, internal scroll) */
  expandedHeight?: number
}

// Virtual row types (add new type)
type VirtualRowType =
  | 'data'
  | 'group-header'
  | 'group-footer'
  | 'summary'
  | 'expanded-content' // NEW

// VirtualRow with expanded content
interface VirtualRow {
  type: VirtualRowType
  id: string
  top: number
  height: number
  row?: any // Actual data row
  parentRowId?: string // For expanded-content rows
  children?: any[] // Child data for expanded-content rows
  isLoading?: boolean // Loading state for expanded-content rows
  error?: Error // Error state for expanded-content rows
}

// InteractionStore additions
class InteractionStore {
  expandedRowIds = new Set<string>()

  toggleExpansion(rowId: string) {
    if (this.expandedRowIds.has(rowId)) {
      this.expandedRowIds.delete(rowId)
    } else {
      this.expandedRowIds.add(rowId)
    }
  }

  expandAll(rowIds: string[]) {
    rowIds.forEach(id => this.expandedRowIds.add(id))
  }

  collapseAll() {
    this.expandedRowIds.clear()
  }
}

// PersistenceStore additions
interface SavedState {
  // ... existing fields
  expandedRowIds?: string[] // Persisted expansion state (scoped to tableId)
}

// Persistence key includes tableId for isolation
// Format: `vibegrid:${orgId}:${entityType}:${tableId}:expansion`
// On hydration: prune persisted IDs to rows in current dataset

// Nested grid tableId scheme (deterministic, collision-free):
// Nested tableId = `${parentTableId}:child:${childEntityType || 'self'}:${parentRowId}`
// Example: "coi-list:child:coverage:abc123"
// This ensures each nested VibeGrid has its own store context

// useRowExpansion hook
// Query key includes orgId and entityType per tanstack-query.md rules
function useRowExpansion<TRow, TChild>(
  row: TRow,
  loadChildren: (row: TRow) => Promise<TChild[]>,
  isExpanded: boolean,
  orgId: string,
  entityType: string,
  cacheKey: (row: TRow) => string = (r) => r.id
) {
  return useQuery({
    queryKey: ['vibegrid', 'row-expansion', orgId, entityType, cacheKey(row)],
    queryFn: () => loadChildren(row),
    enabled: isExpanded,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}
```

### CommandBus Command Contract: entity.reassign-parent

```typescript
// Command for drag-drop parent reassignment
interface ReassignParentCommand {
  command: 'entity.reassign-parent'

  // Inputs
  entityType: string       // Child entity type (e.g., 'Coverage', 'Task')
  entityId: string         // Child entity ID being moved
  relationshipType: string // Relationship type (e.g., 'belongs_to', 'child_of')
  oldParentId: string      // Current parent ID
  newParentId: string      // New parent ID

  // Access Control: requires 'update' permission on child entity
  // Validates user can write to both old and new parent scopes
}

// Implementation uses UnifiedRelationshipService
// Emits EventBus 'table_change' for:
// - Child entity (the moved record)
// - Old parent entity (children changed)
// - New parent entity (children changed)

// Handler location: apps/dataforge/src/orpc/routers/commands/reassign-parent.ts
// Auth check: AuthorizationService.requirePermission('entities:update', entityType, entityId)
// EventBus: emitTableChange(env, orgId, entityType, 'update', userId, { entityId })
//           emitTableChange(env, orgId, parentEntityType, 'update', userId, { parentId: oldParentId })
//           emitTableChange(env, orgId, parentEntityType, 'update', userId, { parentId: newParentId })
```

### Query Invalidation on Mutations

```typescript
// row-expansion queries are invalidated when EventBus 'table_change' fires
// Standard tanstack-query.md realtime handler pattern:

// In VibeGrid realtime subscription
useEffect(() => {
  const unsubscribe = subscribeToTableChanges(orgId, entityType, (event) => {
    // Invalidate row-expansion queries for affected entity
    queryClient.invalidateQueries({
      queryKey: ['vibegrid', 'row-expansion', orgId, entityType]
    })
  })
  return unsubscribe
}, [orgId, entityType])

// Same pattern for child entity type when childEntityType is set
```

### Expanded Content Height Strategy

```typescript
// Fixed height with internal scroll (default strategy)
// Prevents layout thrash, works with virtualization

const DEFAULT_EXPANDED_HEIGHT = 200 // pixels

// If expandedHeight prop provided, use that
// Otherwise, use DEFAULT_EXPANDED_HEIGHT with internal scroll

// Nested VibeGrid has its own virtual scrolling
// Max visible child rows = expandedHeight / ROW_HEIGHT
```

### Bulk Expand Concurrency Limits

```typescript
// Bulk expansion orchestration lives in RowExpansionController (not InteractionStore)
// InteractionStore is pure state (expandedRowIds), controller handles loading

const BULK_EXPAND_CONCURRENCY = 5 // Max parallel loadChildren calls

class RowExpansionController {
  constructor(
    private interactionStore: InteractionStore,
    private rowExpansionConfig: RowExpansionConfig,
    private rows: any[]
  ) {}

  async expandAll() {
    // Only expand rows where canExpand returns true
    const expandable = this.rows.filter(row =>
      this.rowExpansionConfig.canExpand?.(row) ?? true
    )

    // Add IDs to InteractionStore (pure state update)
    this.interactionStore.setExpandedRowIds(expandable.map(r => r.id))

    // Batch load children with concurrency limit
    for (let i = 0; i < expandable.length; i += BULK_EXPAND_CONCURRENCY) {
      const batch = expandable.slice(i, i + BULK_EXPAND_CONCURRENCY)
      await Promise.all(batch.map(row =>
        this.rowExpansionConfig.loadChildren(row)
      ))
    }
  }
}

// InteractionStore remains pure state (no async, no config access)
class InteractionStore {
  expandedRowIds = new Set<string>()

  setExpandedRowIds(ids: string[]) {
    this.expandedRowIds = new Set(ids)
  }

  toggleExpansion(rowId: string) { /* ... */ }
  collapseAll() { /* ... */ }
}
```

### Data Flow Ownership Clarification

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Ownership Boundaries                                                     │
├─────────────────────────────────────────────────────────────────────────┤
│ InteractionStore    → expandedRowIds (pure state, no async)              │
│ RowExpansionController → bulk expand orchestration (has config access)   │
│ RowExpansionProcessor  → virtual row insertion (reads expandedRowIds)    │
│ useRowExpansion hook   → children/isLoading/error per row (async data)   │
│ BodyRenderer          → renders expanded-content rows (calls hook)       │
└─────────────────────────────────────────────────────────────────────────┘

// Processor sets fixed height from config (expandedHeight prop)
// Hook/renderer handle async children data (not processor)
```

### Data Model Changes

| Table/Entity | Change | Notes |
|--------------|--------|-------|
| None | N/A | Uses existing DataForge relationships |

---

## Implementation

### Phase 0: Baseline Verification (BLOCKING)

Before starting implementation, verify existing functionality works:

| Check | How to Verify |
|-------|---------------|
| VibeGrid renders correctly | Navigate to any VibeGrid page (e.g., /projects), observe grid loads |
| Existing columns work | Select rows, sort, filter, group - all should work |
| No console errors | Open DevTools, check for errors |
| COI expansion works | Navigate to /coi, expand a row, observe coverages load |

**If any check fails**: STOP. File a bug. Fix baseline first.

---

### Phase 1: Core Expansion State & Processor

Tasks:
- Create `apps/web/src/systems/vibegrid/processors/RowExpansionProcessor.ts`
- Add `expandedRowIds: Set<string>` observable to `InteractionStore.ts`
- Add `toggleExpansion`, `expandAll`, `collapseAll` actions to `InteractionStore.ts`
- Add `expandedRowIds: string[]` to PersistenceStore saved state
- Create `apps/web/src/systems/vibegrid/types/row-expansion.ts` with `RowExpansionConfig` interface

Verification:
- Types compile (`pnpm typecheck`)
- Unit test: InteractionStore.toggleExpansion adds/removes IDs correctly
- Unit test: PersistenceStore saves/restores expandedRowIds

---

### Phase 2: Virtual Row System & Rendering

Tasks:
- Add `'expanded-content'` to `VirtualRowType` enum in `types/virtual-row.ts`
- Update `processors/RowExpansionProcessor.ts` to insert expanded-content rows
- Modify `renderers/BodyRenderer.ts` to render expanded-content rows
- Create expand column in column definitions (next to select/drag)
- Add chevron icon with rotation animation (CSS transition)

Verification:
- Expanded rows render inline (visual check)
- Chevron rotates 90° when row expands
- Multiple rows can be expanded simultaneously
- No layout shift when expanding/collapsing

Browser smoke test:
- Navigate to test page with VibeGrid
- Click chevron on Row A → observe inline expansion
- Click chevron on Row B → observe both expanded
- Click Row A chevron → observe Row A collapses

---

### Phase 3: Data Loading & Caching

Tasks:
- Create `apps/web/src/systems/vibegrid/hooks/useRowExpansion.ts`
- Implement lazy loading with TanStack Query
- Handle loading state (show spinner)
- Handle error state (show error message + retry)
- Auto-collapse when loadChildren returns empty array

Verification:
- Unit test: useRowExpansion hook calls loadChildren when expanded
- Unit test: Hook returns cached data on second expand
- Integration test: Expansion triggers network request (DevTools Network tab)
- Integration test: Empty children array auto-collapses row

Browser smoke test:
- Expand row → observe loading spinner
- Data loads → observe child grid appears
- Collapse → Re-expand → observe instant load (cached)

---

### Phase 4: Nested VibeGrid & Drag-Drop

Tasks:
- Render nested VibeGrid component in expanded content
- Support `childEntityType` prop for different entities
- Support same-entity self-referential hierarchies
- Enable drag-drop to move children between parents
- Update drag handler to recognize expanded area as drop target

Verification:
- Nested VibeGrid has independent sort/filter/selection
- COI → Coverage shows Coverage columns
- Task → Subtask shows Task columns (self-referential)
- Drag child from Parent A to Parent B updates parent_id
- Real-time sync updates both parents' expanded areas

Browser smoke test:
- Expand COI → observe Coverage columns (different entity)
- Expand Task → observe Task columns (same entity)
- Drag coverage from COI A to COI B → observe parent updates

---

### Phase 5: Bulk Actions & Field Type Migration

Tasks:
- Add "Expand All" and "Collapse All" toolbar buttons
- Move `RowExpandFieldType` from `features/coi/coi-field-types.ts` to `systems/vibegrid/field-types/implementations/`
- Update global field type registry to use new location
- Refactor `features/coi/COIList.tsx` to use generic `rowExpansion` prop
- Remove `expandedCOIs`, `coverageData`, `loadingCoverages` from `COIStore.ts`
- Remove `toggleExpansion`, `loadCoverages` actions from `COIStore.ts`

Verification:
- Expand All button expands all rows with children
- Collapse All button collapses all expanded rows
- COI feature works identically after refactor (no regression)
- COIStore no longer has expansion state
- RowExpandFieldType works from new location

Browser smoke test:
- Click "Expand All" → observe all rows expand
- Click "Collapse All" → observe all rows collapse
- Navigate to /coi → observe COI expansion works (uses generic now)

---

### Implementation Summary

| Phase | Focus | Key Verification |
|-------|-------|------------------|
| P0 | Baseline | Existing VibeGrid works, COI expansion works |
| P1 | Core State | InteractionStore manages expandedRowIds, PersistenceStore persists |
| P2 | Rendering | Inline expansion renders, chevron rotates, multi-expand works |
| P3 | Data Loading | TanStack Query loads children lazily, caches results |
| P4 | Nested Grid | Child VibeGrid renders, drag-drop moves children |
| P5 | Bulk + Migration | COI migrated to generic, no custom expansion code remains |

---

## Testing

### Unit Tests

- [ ] `RowExpansionProcessor.test.ts` - generates expanded-content VirtualRows
- [ ] `InteractionStore.test.ts` - toggleExpansion, expandAll, collapseAll
- [ ] `PersistenceStore.test.ts` - saves/restores expandedRowIds
- [ ] `useRowExpansion.test.ts` - loads children on expand, caches results

### Integration Tests

- [ ] Expansion triggers loadChildren call
- [ ] Empty children array auto-collapses
- [ ] Error state shows retry button
- [ ] Drag-drop updates parent_id

### E2E Tests

- [ ] Expand row → verify children load
- [ ] Collapse → re-expand → verify cached (instant load)
- [ ] Expand All → verify all rows expand
- [ ] Refresh page → verify expanded state restored

### Manual Testing

- [ ] Test COI → Coverage expansion (different entity)
- [ ] Test Task → Subtask expansion (same entity)
- [ ] Test with 100+ children (performance check)
- [ ] Test drag-drop between parents
- [ ] Test on mobile (verify responsive behavior)

---

## Rollout

### Feature Flag

- **Flag name**: N/A - generic primitive, no flag needed
- Features opt-in via `rowExpansion` prop

### Rollback

1. Features not using `rowExpansion` prop are unaffected
2. If issues found, features can remove `rowExpansion` prop
3. COI can revert to domain-specific implementation (code preserved in git history)

---

## Decision Log

### Decision 1: Inline vs Offcanvas Expansion
**Date**: 2026-01-19
**Chose**: Inline expansion
**Over**: Offcanvas panel (like GH#1236 initially explored)
**Reason**: Users expect children to appear near parent. Offcanvas requires extra navigation. Inline is more intuitive.

### Decision 2: Multi-Expand vs Accordion
**Date**: 2026-01-19
**Chose**: Multi-expand (multiple rows can be expanded)
**Over**: Accordion (only one row expanded at a time)
**Reason**: No use case for exclusive expansion. Users may want to compare children of multiple parents.

### Decision 3: Uncontrolled vs Controlled State
**Date**: 2026-01-19
**Chose**: Uncontrolled - VibeGrid manages expandedRowIds
**Over**: Controlled - feature provides expandedRowIds prop
**Reason**: Simplifies usage (no state management boilerplate). Persistence built-in. Most features don't need external control.

### Decision 4: TanStack DB vs Custom Cache
**Date**: 2026-01-19
**Chose**: TanStack DB collections for child data
**Over**: Custom Map-based caching (like COI implementation)
**Reason**: TanStack DB already handles caching, invalidation, loading states. No need to reimplement.

### Decision 5: Deep Nesting (Deferred to Phase 2)
**Date**: 2026-01-19
**Chose**: 1 level of expansion only
**Over**: Unlimited depth (grandchildren, great-grandchildren)
**Reason**: Adds complexity (recursive rendering, nested state). No use case yet. Can add later if needed.

---

## Related Work

- [GH#1236: COI → Coverages Row Expansion](https://github.com/baseplane-ai/baseplane/issues/1236) - Original domain-specific implementation
- [VibeGrid Rule](../../.claude/rules/vibegrid.md) - Core VibeGrid primitive documentation
- [VibeGrid Interactions Rule](../../.claude/rules/vibegrid-interactions.md) - Interaction patterns
- [DataForge Relationships Rule](../../.claude/rules/dataforge-relationships.md) - Parent-child relationships
