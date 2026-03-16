---
primitive: vibegrid
status: draft
relatedRules:
  - vibegrid
  - vibegrid-interactions
---

# Row Expansion

Generic row expansion for VibeGrid, enabling inline display of one-to-many relationships (e.g., COI → Coverages, Task → Subtasks, Invoice → Line Items).

## Overview

- **Domain:** vibegrid
- **Status:** draft
- **Related Issues:** GH#1240

> **Note:** YAML frontmatter is auto-managed by `scripts/docs/sync-rule-links.sh`.

---

## UI States

### S1: Default (Collapsed)

```
┌─────────────────────────────────────────────────────────────────┐
│ ▶ ☐  Acme Construction    │ 2026-01-01 │ 2026-12-31 │ ● Active │
│ ▶ ☐  BuildCo LLC          │ 2025-06-15 │ 2026-06-14 │ ● Active │
│   ☐  Old Vendor Inc       │ 2024-01-01 │ 2025-01-01 │ ○ Expired│
└─────────────────────────────────────────────────────────────────┘
```

**Components:** `BodyRenderer`, `RowExpandFieldType` (in `slot-initialization.ts`)
**Conditions:** Rows not in expandedRowIds set

### S2: Expanded

```
┌─────────────────────────────────────────────────────────────────┐
│ ▼ ☐  Acme Construction    │ 2026-01-01 │ 2026-12-31 │ ● Active │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Coverage Type    │ Limit      │ Deductible │ Expires     │ │
│  │ General Liability│ $1,000,000 │ $5,000     │ 2026-12-31  │ │
│  │ Workers Comp     │ $500,000   │ $1,000     │ 2026-06-30  │ │
│  └────────────────────────────────────────────────────────────┘ │
│ ▶ ☐  BuildCo LLC          │ 2025-06-15 │ 2026-06-14 │ ● Active │
└─────────────────────────────────────────────────────────────────┘
```

**Components:** `BodyRenderer`, `ExpandedContentPortals.tsx` (React portal bridge)
**Conditions:** Row ID in expandedRowIds set, children loaded

### S3: Loading

```
┌─────────────────────────────────────────────────────────────────┐
│ ◐ ☐  Acme Construction    │ 2026-01-01 │ 2026-12-31 │ ● Active │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │ │
│  │ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

**Components:** `RowExpandFieldType` (spinner), `ExpandedContentPortals.tsx` (skeleton)
**Conditions:** loadChildren() in progress

### S4: Error

```
┌─────────────────────────────────────────────────────────────────┐
│ ▼ ☐  Acme Construction    │ 2026-01-01 │ 2026-12-31 │ ● Active │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ ✗ Failed to load coverages.  [Retry]                       │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

**Components:** `ExpandedContentPortals.tsx`
**Conditions:** loadChildren() threw error

### S5: No Children

```
┌─────────────────────────────────────────────────────────────────┐
│ ▶ ☐  Acme Construction    │ 2026-01-01 │ 2026-12-31 │ ● Active │
│   ☐  Old Vendor Inc       │ 2024-01-01 │ 2025-01-01 │ ○ Expired│
└─────────────────────────────────────────────────────────────────┘
       ▲
       └─ No chevron (canExpand returns false or empty children)
```

**Components:** `RowExpandFieldType`
**Conditions:** canExpand returns false OR loadChildren returned empty array

---

## API Reference

### RowExpansionConfig Interface

```typescript
interface RowExpansionConfig {
  enabled: boolean
  allowMultiple: boolean
  expandedContentHeight: number
  loadExpandedData: (rowId: string, rowData: unknown) => Promise<unknown>
  renderExpandedContent: (props: ExpandedContentProps) => React.ReactNode
}
```

**Key components:**
- `RowExpansionProcessor` — manages expansion state and data loading
- `ExpandedContentPortals` — bridges DOM containers to React rendering via `MutationObserver`
- `RowExpandFieldType` — renders expand/collapse buttons in cells
- State stored in `InteractionStore` (expandedRowIds, expandedRowStates)

### CommandBus: entity.reassign-parent

**Purpose:** Move child to different parent via drag-drop

**Request:**
```typescript
{
  command: 'entity.reassign-parent'
  entityType: string
  entityId: string
  relationshipType: string
  oldParentId: string
  newParentId: string
}
```

**Handler:** `apps/dataforge/src/orpc/routers/commands/reassign-parent.ts` (TBD)

---

## Data Model

### State Storage

| Location | Purpose | Key Fields |
|----------|---------|------------|
| `InteractionStore.expandedRowIds` | Current session expanded rows | `Set<string>` |
| `PersistenceStore.savedState` | Cross-session persistence | `expandedRowIds: string[]` |

### Nested Grid tableId Scheme

```typescript
// Nested grid gets scoped tableId for isolated state
const nestedTableId = `${parentTableId}:child:${childEntityType || 'self'}:${parentRowId}`
```

---

## Behaviors

### B1: User Expands Row to View Children

- **ID:** expand-row-inline
- **Status:** [x] Implemented
- **Trigger:** User clicks expand chevron in first column of row
- **Expected:** Row expands inline, showing custom content via `renderExpandedContent`. Chevron rotates to indicate expanded state.
- **Verify:** Expanded content appears directly below parent row via React portal.
- **Source:** `systems/vibegrid/processors/RowExpansionProcessor.ts`, `systems/vibegrid/components/ExpandedContentPortals.tsx`
- **UI:** S1 → S3 → S2
- **API:** N/A (client-side state)
- **Data:** N/A

### B2: Multiple Rows Expand Simultaneously

- **ID:** multi-expand
- **Status:** [x] Implemented
- **Trigger:** User expands Row A, then expands Row B without collapsing Row A
- **Expected:** Both rows remain expanded. No exclusive accordion behavior.
- **Verify:** expandedRowIds Set contains both row IDs. Both expanded contents render.
- **Source:** `stores/InteractionStore.ts` (expandedRowIds Set)
- **UI:** S2 (multiple)
- **API:** N/A
- **Data:** N/A

### B3: Expanded State Persists Across Sessions

- **ID:** persist-expansion
- **Status:** [ ] Planned
- **Trigger:** User expands Row A, refreshes page
- **Expected:** On page reload, Row A is still expanded with child data loaded
- **Verify:** PersistenceStore has savedState.expandedRowIds. On mount, rows expand automatically.
- **Source:** TBD - Not yet implemented
- **UI:** S3 → S2
- **API:** N/A
- **Data:** `PersistenceStore` READ/WRITE

### B4: Child Data Loads Lazily

- **ID:** lazy-load-children
- **Status:** [x] Implemented
- **Trigger:** User expands row for first time
- **Expected:** `loadExpandedData` async function called. Expanded content renders when data arrives. Results cached in `expandedRowStates`.
- **Verify:** Data loading fires on expand (not on page load). Expanded area shows content after load.
- **Source:** `systems/vibegrid/processors/RowExpansionProcessor.ts`
- **UI:** S1 → S3 → S2
- **API:** Feature-specific (e.g., dataforge.entities.list)
- **Data:** DataForge relationship query

### B5: Empty Children Auto-Collapse

- **ID:** auto-collapse-empty
- **Status:** [ ] Planned
- **Trigger:** loadChildren() returns empty array
- **Expected:** Row collapses automatically. Chevron hidden (no expand option for rows without children).
- **Verify:** expandedRowIds removes this row ID. Chevron column renders null for this row.
- **Source:** TBD - Not yet implemented
- **UI:** S3 → S5
- **API:** N/A
- **Data:** N/A

### B6: Nested VibeGrid for Children

- **ID:** nested-vibegrid
- **Status:** [ ] Planned
- **Trigger:** Row expansion renders expanded content
- **Expected:** Expanded area contains another VibeGrid component with columns defined for child entity type
- **Verify:** Child VibeGrid has own sort, filter, selection state. Scrolling child grid doesn't affect parent.
- **Source:** TBD - Not yet implemented
- **UI:** S2
- **API:** N/A
- **Data:** N/A

### B7: Different Entity Type Children (COI → Coverage)

- **ID:** different-entity-children
- **Status:** [ ] Planned
- **Trigger:** rowExpansion config has `childEntityType: 'Coverage'`
- **Expected:** Nested VibeGrid uses Coverage columns. Data fetched from coverages collection.
- **Verify:** Columns match Coverage schema. Data correct for parent COI.
- **Source:** TBD - Not yet implemented
- **UI:** S2
- **API:** TanStack DB collection with join
- **Data:** DataForge `belongs_to` relationship

### B8: Same Entity Self-Referential Children (Task → Subtask)

- **ID:** self-referential-children
- **Status:** [ ] Planned
- **Trigger:** rowExpansion config has NO childEntityType (same entity)
- **Expected:** Nested VibeGrid uses parent's columns. Data fetched via DataForge `child_of` relationship.
- **Verify:** Columns identical to parent. Subtasks related to parent via DataForge relationship.
- **Source:** TBD - Not yet implemented
- **UI:** S2
- **API:** TanStack DB collection with DataForge relationship join
- **Data:** DataForge `child_of` relationship

### B9: Drag-Drop to Move Children Between Parents

- **ID:** drag-child-to-new-parent
- **Status:** [ ] Planned
- **Trigger:** User drags child row from Parent A's expanded area to Parent B's expanded area
- **Expected:** Child's parent relationship updates. Child moves between parents.
- **Verify:** Database shows updated relationship. EventBus emits `table_change` for real-time sync.
- **Source:** TBD - Not yet implemented
- **UI:** Dragging state → Drop target state → S2
- **API:** CommandBus `entity.reassign-parent`
- **Data:** DataForge relationship update + EventBus emission

### B10: Bulk Expand All / Collapse All

- **ID:** bulk-expand-collapse
- **Status:** [ ] Planned
- **Trigger:** User clicks "Expand All" button in toolbar
- **Expected:** All rows with children expand simultaneously. Loading indicators show. Collapse All collapses all.
- **Verify:** expandedRowIds Set contains all row IDs with children. Parallel loadChildren() calls (max 5 concurrent via RowExpansionController).
- **Source:** TBD - Not yet implemented
- **UI:** S1 → S3 (bulk) → S2 (bulk)
- **API:** N/A (multiple parallel loadChildren)
- **Data:** N/A

### B11: Error Handling for Failed Child Load

- **ID:** handle-load-error
- **Status:** [ ] Planned
- **Trigger:** loadChildren() throws error (network failure, 403, etc.)
- **Expected:** Expanded area shows error message with "Retry" button. Row stays expanded.
- **Verify:** Error message visible. Clicking Retry re-calls loadChildren().
- **Source:** TBD - Not yet implemented
- **UI:** S3 → S4
- **API:** N/A (error from feature-specific endpoint)
- **Data:** N/A

---

## Notes

- **Single level only:** No grandchildren support (tree mode out of scope)
- **Not accordion:** Multiple rows can be expanded simultaneously
- **COI migration:** GH#1240 includes migrating COI-specific expansion to use this generic primitive
- **Concurrency limits:** Bulk expand uses RowExpansionController with max 5 parallel loadChildren calls
