---
implementation: partial
rules_file: .claude/rules/vibegrid.md
entry_points:
  - apps/web/src/systems/vibegrid/**/*
built:
  - Table view module with virtual scrolling
  - Kanban view module (KanbanModule + KanbanViewStore)
  - Gantt view module (GanttModule + GanttViewStore)
  - ViewModeRegistry with lazy loading
  - SlotRegistry with priority-based cell renderer resolution
  - Row expansion with detail panels (RowExpansionProcessor + ExpandedContentPortals)
  - Filter bar with field-type-aware controls
  - Saved views (SaveViewDialog + ViewPicker)
  - Selection column and bulk handler plumbing
  - Bulk action toolbar (ActionsBar)
  - Column reordering and persistence (ColumnDragOverlayDOM + PersistenceStore)
  - InteractionStore (selection, menus, context)
  - Non-DataForge data source support (collectionOverride)
  - CSV export (toolbar + bulk action, client-side)
  - Inline row creation (InlineCreationStore + ghost rows)
not_built:
  - PDF export
  - Excel (.xlsx) export
---

# VibeGrid

> High-performance data grid — column types, filters, view modes, row expansion, and bulk actions.

For the theory behind data grids, see [Three-View Model](../theory/experience.md#three-view-model) (Records view) and [Domains: Capabilities](../theory/domains.md#capabilities) (module capabilities).

For implementation details (file paths, imports, API), see [Rules: VibeGrid](../../.claude/rules/vibegrid.md).

---

## Concept

VibeGrid is the data grid primitive that powers every Records view and any other tabular data surface. It provides:

- Virtual scrolling for large datasets
- Pluggable view modes (Table, Kanban, Gantt, custom)
- Unified cell rendering via a slot system
- Row expansion for child/related data
- Bulk selection and action toolbar
- Filter bar with URL-persisted state
- Sortable columns with type-aware ordering

### Extend the Primitive

Before building grid functionality in a module, check if it should be a VibeGrid primitive:

| Question | If YES | If NO |
|----------|--------|-------|
| Could other entities use this? | Build as primitive | OK for module-specific |
| Does it involve cell rendering? | Register via slot system | May be domain-specific |
| Does it involve a new view mode? | Implement as view mode module | May not need VibeGrid |
| Does it involve row interaction? | Check existing processors first | May be domain-specific |

---

## View Modes

VibeGrid supports pluggable view modes through a module registry. Each mode provides a different visualization of the same data.

### Table (Default)

The standard tabular grid with sortable columns, row selection, and inline expansion.

```
┌──────────────────────────────────────────────────────────────────────┐
│ Filters: [dim ▾] [dim ▾] [dim ▾] [search...]             [Create]  │
├──────────────────────────────────────────────────────────────────────┤
│ □ Column A       Column B    Column C     Column D      Column E    │
│ □ Value          Value       [Badge]      Value         Date        │
│   └─ Expansion: child/related data for this row                     │
│ □ Value          Value       [Badge]      Value         Date        │
│ □ Value          Value       [Badge]      Value         Date        │
├──────────────────────────────────────────────────────────────────────┤
│ Bulk: [Action] [Action] [Export]                       N selected   │
└──────────────────────────────────────────────────────────────────────┘
```

### Kanban

Card-based view organized by a status or category column. Cards move between columns via drag-and-drop.

```
┌────────────┬────────────┬────────────┬────────────┐
│ Status A   │ Status B   │ Status C   │ Status D   │
│ (count)    │ (count)    │ (count)    │ (count)    │
├────────────┼────────────┼────────────┼────────────┤
│ ┌────────┐ │ ┌────────┐ │ ┌────────┐ │            │
│ │ Card   │ │ │ Card   │ │ │ Card   │ │            │
│ │ Title  │ │ │ Title  │ │ │ Title  │ │            │
│ │ Detail │ │ │ Detail │ │ │ Detail │ │            │
│ └────────┘ │ └────────┘ │ └────────┘ │            │
│ ┌────────┐ │ ┌────────┐ │            │            │
│ │ Card   │ │ │ Card   │ │            │            │
│ └────────┘ │ └────────┘ │            │            │
└────────────┴────────────┴────────────┴────────────┘
```

### Gantt

Timeline view with dependency arrows between tasks. Supports four dependency types.

```
┌──────────────┬──────────────────────────────────────────┐
│ Task Name    │ Jan     Feb      Mar      Apr      May   │
├──────────────┼──────────────────────────────────────────┤
│ Task 1       │ ████████                                 │
│ Task 2       │         ████████──→                      │
│ Task 3       │                   ██████████             │
│ Task 4       │                        ███████████       │
└──────────────┴──────────────────────────────────────────┘
```

| Dependency Type | Abbr | Meaning |
|-----------------|------|---------|
| `finish_to_start` | FS | Predecessor finishes before successor starts (default) |
| `start_to_start` | SS | Both start together |
| `finish_to_finish` | FF | Both finish together |
| `start_to_finish` | SF | Predecessor starts before successor finishes |

---

## Cell Rendering (Slot System)

Cells render based on a priority-based slot system. Each slot declares what it can render and at what priority. Higher priority wins.

| Level | Priority | Use For |
|-------|----------|---------|
| View mode slots | 100 | Gantt bar renderer, Kanban card renderer |
| Domain slots | 50 | Module-specific renderers (e.g., custom currency format) |
| Default slots | 0 | Built-in field types (text, number, date, badge) |

**Resolution order:** context filter → exact field type match → priority (higher wins) → fallback to text.

This allows modules to override how specific fields render without touching the grid primitive. A domain module can register a custom currency renderer that only activates for financial entities.

---

## Row Expansion

Rows expand inline to reveal child or related data. This is the primary mechanism for showing one-to-many relationships without navigating away.

```
│ □ Vendor A        Project X  ✗ Expired   Provider A     2026-01-15   │
│   └─ Coverage: Type A, Type B, Type C                                │
│ □ Vendor B        Project Y  ✓ OK        Provider B     2026-08-30   │
```

Expansion content is module-provided. The grid provides the expand/collapse mechanism and manages expansion state.

---

## Filter Bar

Filters sit above the grid. All filter state lives in the URL (shareable, bookmarkable).

| Filter Type | Description |
|-------------|-------------|
| Dimension dropdown | Select from a bounded set of values (status, project, assignee) |
| Search field | Free-text filtering across configured columns |
| Date range | From/to date selection |
| Saved views | Named filter/column/sort configurations |

Saved views are snapshots of URL state. Activating a view applies its filters. Personal views are per-user; shared views are team-visible.

---

## Saved Views

The current grid state — view mode, active filters, sort, grouping, visible columns — is always a saveable configuration. There is no separate "create view" wizard. A user configures the grid, then saves what they see.

```
[Records table, filtered: status=open, grouped by category, board view]

                              ┌──────────────────────┐
  [Save as view ▼]         → │ Name:  Morning Board  │
                              │ Share: Just me ▼      │
                              │ [Save]  [Cancel]      │
                              └──────────────────────┘
```

Saved views also appear as sidebar entries under their entity type, with live counts from liveQuery:

```
     Records
     ├─ All                  (41)   ← org default
     └─ Overdue by Category  (23)   ← saved view (shared)
```

| Property | Behavior |
|----------|----------|
| **Created** | Save current grid state, or describe to Copilot ("set up a board of requests grouped by assignee") |
| **Scope** | Personal (just me), shared (named team members), team (role-wide), org default |
| **Org default** | Loads when user has no personal view set; saved personal views layer on top without affecting the default |
| **Sidebar counts** | Each saved view shows a live count via liveQuery using its filter set |
| **Pinned analysis** | Optional analytics result pinned above the grid; re-runs when the view loads |
| **Sharing** | Sharing a view shares a reference, not a copy; edits to a shared view propagate to everyone using it |

---

## Bulk Action Toolbar

Appears when one or more rows are selected. The toolbar provides:

- **Universal actions**: Export CSV, delete (with confirmation)
- **Module-specific actions**: Send reminder, approve, assign — registered by the module
- **Selection count**: Shows how many items are selected

Bulk handlers receive arrays: `(rowIds[], rowsData[])`. All mutations go through the command system for undo/redo capability.

### CSV Export

Two entry points:

| Entry Point | What It Exports | UI Location |
|-------------|-----------------|-------------|
| **Toolbar button** | All filtered/sorted rows | Header bar, after Columns toggle |
| **ActionsBar action** | Selected rows only | Bulk action bar (preserves selection after export) |

Exports visible columns only, with type-aware formatting (dates, booleans, multi-select, rich text). Both buttons disabled during incremental processing.

For implementation details (file paths, format specifics), see [Rules: VibeGrid](../../.claude/rules/vibegrid.md#csv-export).

---

## Relationships

- [View Shell: Records View](view-shell.md#records--show-me-everything) — layout context for the grid
- [Experience: Three-View Model](../theory/experience.md#three-view-model) — theory behind Records as exhaustive view
- [Domains: Capabilities](../theory/domains.md#capabilities) — module declaration of grid capabilities
- [Rules: VibeGrid](../../.claude/rules/vibegrid.md) — code-level implementation details
