---
initiative: GH#2139-vibegrid-view-switching-kanban-gantt
type: project
issue_type: feature
status: approved
priority: high
github_issue: 2139
created: 2026-03-24
updated: 2026-03-24

phases:
  - id: p1
    name: "Smart Gating — canHandle Predicates"
    tasks:
      - "Extend GridModuleRenderProps to carry schemaFields (SchemaFieldDescriptor[])"
      - "Update kanban canHandle() in modules/index.ts — check for groupable fields"
      - "Update gantt canHandle() in modules/index.ts — always true (nudge inside view)"
      - "Derive schemaFields in EntityListView and pass to VibeGrid"
      - "Forward childSchema as schemaFields in ChildEntitySection to VibeGrid"
      - "Filter view mode buttons in VibeGridXHeaderPure using getAvailableModules()"
  - id: p2
    name: "Kanban Card Smart Defaults"
    tasks:
      - "Add SchemaFieldDescriptor[] awareness to KanbanViewStore"
      - "Add detectSmartFields() method — extracts assignee, dueDate, priority from row data"
      - "Extend KanbanCard type with smartFields?: KanbanCardSmartFields"
      - "Call detectSmartFields in cards computed property"
      - "Update KanbanCard component to render assignee avatar, date chip, priority badge"
  - id: p3
    name: "GroupBy Field Picker"
    tasks:
      - "Add groupByOptions computed in KanbanViewStore (all groupable fields from schema)"
      - "Add setGroupByField() action in KanbanViewStore"
      - "Create GroupByDropdown component in systems/vibegrid/modules/kanban/"
      - "Add GroupByDropdown to KanbanModule toolbar area"
      - "Persist kanbanGroupByField in entity_views view config via useViewUrlSync"
      - "Restore kanbanGroupByField from saved view config on load"
  - id: p4
    name: "Gantt Empty State Nudge"
    tasks:
      - "Add hasDateFields computed in GanttViewStore (inspects schemaFields prop)"
      - "Create GanttEmptyState component in systems/vibegrid/modules/gantt/"
      - "Add render branch in GanttModule.render() — show GanttEmptyState when !hasDateFields"
      - "Wire schema editor link in GanttEmptyState (if user has schema edit permission)"
  - id: p5
    name: "Child Entity Tab Integration"
    tasks:
      - "Verify ChildEntitySection forwards childSchema as schemaFields to VibeGrid"
      - "Verify view mode store is instance-scoped in child tab context (not shared with parent)"
      - "Verify view mode buttons render in ChildEntitySection VibeGrid toolbar"
      - "Test Kanban view in child tab: parent=Project, child=Task"
      - "Test Gantt view in child tab: parent=Project, child=Task with date fields"
  - id: p6
    name: "Testing and Verification"
    tasks:
      - "Browser smoke test: table -> kanban -> gantt -> table on entity list"
      - "Verify viewMode persists in URL and saved view config"
      - "Verify Kanban drag-drop persists status change via TanStack DB"
      - "Verify Gantt bar drag persists date change"
      - "Verify smart gating hides Kanban when no groupable fields"
      - "Verify Gantt empty state nudge when no date fields"
      - "Verify view switching works in child entity tabs"
      - "Run pnpm typecheck and pnpm lint — must pass clean"
---

# VIbeGrid View Switching: Ship Kanban & Gantt on Entity Listings

> **Full-Stack Feature**: Surfacing existing Kanban and Gantt view modes to users on entity listing pages and child entity tabs, with smart schema-aware gating and Kanban card enhancements.

## Problem Statement

**What problem are we solving?**

Baseplane already has complete, production-quality Kanban and Gantt view implementations inside VIbeGrid. Both are fully built — including drag-and-drop persistence, dependency arrows, zoom levels, and slot registration. However, they are inaccessible in practice because:

1. `canHandle()` always returns `true` regardless of whether the entity schema supports the view (Kanban offered on schemas with no status field; Gantt shows an empty timeline instead of a helpful nudge when no date fields exist).
2. Kanban cards only show title + status — no assignee, dates, or priority even when those fields exist in the schema.
3. The GroupBy field is hardcoded to `'status'` with no UI to change it.
4. Child entity tabs (e.g., Tasks inside a Project) do not surface view mode switching.

**Why now?**

The architecture is complete and stable. This is the last mile: smart gating, one configuration UI piece (GroupBy picker), and child tab integration. Estimated 2.5–3 days of work unlocks a Kanban/Gantt product capability that is already 90% built.

---

## User Story

As a **Baseplane user working with task-heavy or timeline-driven entities**,
I want **to switch between Table, Kanban, and Gantt views directly from the entity listing toolbar and child entity tabs**,
so that **I can manage work visually without leaving the platform or resorting to external tools**.

---

## Goals & Non-Goals

### Goals

- Surface Kanban and Gantt view buttons on entity listing pages with smart schema-aware gating.
- Show Kanban cards with auto-detected smart fields (assignee, due date, priority) beyond title + status.
- Add a GroupBy field picker to the Kanban toolbar so users can choose which field defines columns.
- Show a helpful Gantt empty state nudge when the entity schema has no date fields.
- Enable view mode switching in child entity tabs (e.g., Tasks tab on a Project detail page).
- Persist selected view mode in URL and in saved view config (already wired — verify and ship).

### Non-Goals (Out of Scope)

- WIP limits per Kanban column — deferred to future enhancement.
- Inline card creation from Kanban column ("+" per column) — deferred.
- Swimlane / secondary grouping in Kanban — deferred.
- Replacing HTML5 DnD with dnd-kit for smoother animations — deferred.
- Resource assignment / overload view in Gantt — deferred.
- Milestone marker rendering in Gantt — deferred.
- Gantt print/export — deferred.
- Configurable card field selection UI — v2; v1 uses smart auto-detection only.
- Feature flag gating — direct rollout per decisions made in requirements gathering.

---

## Success Metrics

| Metric | Current | Target | How to Measure |
|--------|---------|--------|----------------|
| Kanban/Gantt reachable on eligible schemas | 0 (canHandle always true but no gating feedback) | 100% on schemas with correct fields | canHandle predicate verification + UI smoke test |
| Kanban cards showing 2+ fields | 0 (title + status only) | 100% when assignee/date/priority fields exist | Visual inspection |
| GroupBy picker present in Kanban toolbar | Not present | Present when 2+ groupable fields exist | UI inspection |
| Gantt empty state nudge | Not present (empty timeline) | Present when no date/datetime fields | UI inspection |
| View mode available in child entity tabs | Not available | Available in ChildEntitySection toolbar | Browser test |

---

## Feature Behaviors

> All 4 layers present per behavior. "N/A" where non-applicable.

---

### B1: Kanban View Gating — Show Only When Schema Has Groupable Fields

**Core:**
- **ID:** kanban-smart-gating
- **Trigger:** User opens an entity listing page; VIbeGrid header renders the view mode button group.
- **Expected:** The Kanban button appears only when the entity schema contains at least one field of type `status_set`, `select`, or `relationship_link` that can serve as the grouping axis. On schemas with no such fields (e.g., a pure lookup record with only text and number fields), the Kanban button is not rendered. **Implementation note:** The existing `enableKanban` prop on `VibeGridXHeaderPure` is replaced by registry-driven gating via `getAvailableModules()` — the prop is removed.
- **Verify:** Open an entity type with no select/status fields → Kanban button (`data-testid="view-mode-kanban"`) absent in toolbar. Open Tasks (has `status`) → Kanban button present. Manually append `?viewMode=kanban` to URL on incompatible entity → grid loads in table mode.
- **Source:** `apps/web/src/systems/vibegrid/modules/index.ts` → `canHandle()` for `'kanban'`; `apps/web/src/systems/vibegrid/modules/ViewModeRegistry.ts` → `getAvailableModules()`; `apps/web/src/systems/vibegrid/components/VibeGridXHeaderPure.tsx` → button rendering.

#### UI Layer
**Component:** `VibeGridXHeaderPure` — view mode button group area.
**States:**
- `canHandle` returns true: Kanban button visible and enabled, with `aria-pressed` reflecting active state. Active: `variant="default"` (filled). Inactive: `variant="outline"`.
- `canHandle` returns false: Kanban button not rendered — removed from DOM, not disabled.
- Stale URL param on incompatible schema: Grid initializes in table mode, URL param silently removed.

#### API Layer
N/A — Pure frontend predicate. No API call is made to check eligibility.

#### Data Layer
N/A — No database reads or writes. Schema is already loaded in component context; `canHandle` reads from it synchronously.

---

### B2: Gantt View Gating — Always Show Button, Nudge Inside When No Date Fields

**Core:**
- **ID:** gantt-smart-gating
- **Trigger:** User activates the Gantt view button on an entity listing; `GanttModule.render()` is called.
- **Expected:** The Gantt button is always shown in the toolbar (`canHandle` returns true for Gantt). When the entity schema has no `date` or `datetime` fields, the Gantt pane shows an instructional empty state instead of an empty timeline. When date fields exist, the Gantt timeline renders normally.
- **Verify:** Entity with no date fields → activate Gantt → see empty state nudge. Entity with `start_date` + `end_date` → Gantt bars render.
- **Source:** `apps/web/src/systems/vibegrid/modules/gantt/GanttModule.tsx` → `render()` method; new `GanttEmptyState` component at `apps/web/src/systems/vibegrid/modules/gantt/GanttEmptyState.tsx`.

#### UI Layer
**Component:** `GanttEmptyState` (new, `systems/vibegrid/modules/gantt/GanttEmptyState.tsx`).
**States:**
- No date fields: Centered empty state — calendar icon, message, optional schema editor link.
- Date fields present: Normal `GanttTimeline` renders.
**Wireframe (no-date-fields state):**
```
┌─────────────────────────────────────────────────────────────────┐
│  [Gantt Toolbar]                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│                            📅                                    │
│                                                                  │
│               Timeline view requires date fields                 │
│                                                                  │
│    Add start_date and end_date fields to your entity schema      │
│    to see records plotted on a timeline.                         │
│                                                                  │
│                  [ Open Schema Editor → ]                        │
│              (hidden if no schema edit permission)               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```
**Theme tokens:** `text-foreground` for heading, `text-muted-foreground` for body, `text-primary` for link.

#### API Layer
N/A — Field detection is synchronous from already-loaded schema data passed as `schemaFields` prop.

#### Data Layer
N/A — No database state change.

---

### B3: Kanban Card Smart Field Display

**Core:**
- **ID:** kanban-card-smart-fields
- **Trigger:** Kanban view is active; `KanbanCard` renders a card for an entity record.
- **Expected:** Beyond title + status, the card auto-displays additional fields based on schema inspection: (1) Assignee avatar + name when a `user_reference` field exists and has a value; (2) Due date chip in `MMM D` format when a `date` or `datetime` field with slug `due_date`, `end_date`, or `deadline` exists and has a value; (3) Priority badge when a `select` or `status_set` field with slug `priority` or `priority_level` exists and has a value. Fields with null/undefined values are omitted — no empty placeholders.
- **Verify:** Create a Task with assignee, due_date, and priority set → switch to Kanban → card shows all three fields. Create a Task with only title and status → card shows only title + status. Drag card with extra fields → fields preserved after drop.
- **Source:** `apps/web/src/systems/vibegrid/stores/KanbanViewStore.ts` → `detectSmartFields()` method; `apps/web/src/systems/vibegrid/components/kanban/KanbanCard.tsx` → rendering.

#### UI Layer
**Component:** `KanbanCard` (extended, `systems/vibegrid/components/kanban/KanbanCard.tsx`).
**Card layout (when all smart fields present):**
```
┌─────────────────────────────────────┐
│ ⣿  Fix authentication bug           │  ← title (existing)
│    👤 Alice Chen                    │  ← assignee: Avatar(16px) + name
│    📅 Mar 28                        │  ← dueDate: calendar icon + MMM D
│    [High]                           │  ← priority: Badge (color from schema)
└─────────────────────────────────────┘
```
**States:** Only fields with values render. Card retains `opacity-50 rotate-2 scale-105` during drag (existing).
**Theme tokens:** `text-muted-foreground` for secondary values, `bg-card` for background, `border-border`. Badge colors from schema option color definitions — never hardcoded.

#### API Layer
N/A — Card data comes from `KanbanViewStore.cards` computed property reading `card.data` (full row data already in TanStack DB).

#### Data Layer
N/A — No writes triggered by card rendering.

---

### B4: Kanban GroupBy Field Picker

**Core:**
- **ID:** kanban-groupby-picker
- **Trigger:** User clicks the "Group by" dropdown in the Kanban toolbar.
- **Expected:** A dropdown lists all groupable fields from the entity schema (status_set, select, enum fields; single/many-to-one relationship fields). Selecting a field re-groups the board immediately — columns reorganize to reflect the selected field's distinct values. The selection persists in the saved view config and survives page reload. Dropdown is hidden when only one groupable field exists. Default is `status` (or the first eligible field if no `status` field exists).
- **Verify:** Switch GroupBy from `status` to a second select field → board redraws with new column layout. Save view → reload → load saved view → correct GroupBy restored. Entity with only one groupable field → picker hidden.
- **Source:** `apps/web/src/systems/vibegrid/stores/KanbanViewStore.ts` → `groupByOptions` computed + `setGroupByField()` action; new `GroupByDropdown.tsx` in `systems/vibegrid/modules/kanban/`; `apps/web/src/features/entities/hooks/useViewUrlSync.ts` → view config persistence.

#### UI Layer
**Component:** `GroupByDropdown` (new, `systems/vibegrid/modules/kanban/GroupByDropdown.tsx`).
**Wireframe (Kanban toolbar with picker):**
```
┌──────────────────────────────────────────────────────────────────┐
│ [ViewPicker ▼]   Group by: Status ▼   [Filter ▼]  [Search...]   │
└──────────────────────────────────────────────────────────────────┘
```
**States:**
- Closed: Button showing current group-by field label + chevron down icon.
- Open: `DropdownMenu` with list of eligible fields; current field has checkmark.
- Single eligible field: Component not rendered.

#### API Layer
N/A — GroupBy selection is a local view config change persisted via the existing ViewPicker save mechanism.

#### Data Layer
**Tables:** `entity_views` (existing).
**Operation:** UPDATE — view config JSON updated to include `kanbanGroupByField: string`. Additive, non-breaking.

---

### B5: View Mode Persistence — URL and Saved View Config

**Core:**
- **ID:** viewmode-persistence
- **Trigger:** User switches view mode; navigates away and returns; saves a named view.
- **Expected:** (1) URL updates immediately to `?viewMode=kanban` (or gantt; table has no param). (2) Page reload in each mode restores the correct view. (3) Named saved views store the current mode in their config; loading a saved view restores the mode. (4) ViewPicker badge shows the correct mode icon (LayoutList/Kanban/GanttChart) per saved view.
- **Verify:** Switch to Kanban → copy URL → open in new tab → arrives in Kanban. Save view in Gantt mode → reload → load saved view → Gantt active. ViewPicker shows Kanban icon badge on Kanban-mode saved views.
- **Source:** `apps/web/src/features/entities/hooks/useViewUrlSync.ts`; `apps/web/src/systems/vibegrid/components/ViewPicker.tsx` → `deriveViewMode()` + `ViewModeBadge`.

#### UI Layer
**States:**
- Active view button: `variant="default"` (filled), `aria-pressed="true"`.
- URL: `?viewMode=kanban` | `?viewMode=gantt` | no param for table.
- ViewPicker badge: LayoutList / Kanban / GanttChart icon per view's saved mode.

#### API Layer
N/A — View config persisted via the existing `entity_views` upsert triggered by ViewPicker.

#### Data Layer
**Tables:** `entity_views` (existing).
**Operation:** UPDATE — `config.viewMode` and `config.kanbanGroupByField` fields in JSON view config.

---

### B6: View Mode Switching in Child Entity Tabs

**Core:**
- **ID:** child-tab-view-switching
- **Trigger:** User is on an entity detail page (e.g., a Project) and clicks a child entity tab (e.g., "Tasks"). They then click the Kanban or Gantt button in the child grid toolbar.
- **Expected:** The child entity grid supports full view mode switching with the same smart gating as entity list pages. Kanban/Gantt buttons appear when the child entity schema has the required fields. Switching view mode in the child tab does not affect the parent entity's view mode or other child tabs. The child tab VibeGrid is a fully independent grid instance with its own `ViewModeStore`.
- **Verify:** Open Project detail → Tasks tab → Kanban button visible (Tasks has `status`). Click Kanban → Tasks board renders within child tab panel. Switch parent entity to Gantt → Tasks tab still shows Kanban (independently scoped). Close and reopen Tasks tab → view mode resets to table (child tab view mode is NOT persisted in v1 — this is intentional to avoid config complexity).
- **Source:** `apps/web/src/features/entities/components/ChildEntitySection.tsx` → forwards `childSchema` to `VibeGrid`; `apps/web/src/systems/vibegrid/stores/context.tsx` → `VibeGridStoreProvider` creates instance-scoped stores.

#### UI Layer
**Component:** `ChildEntitySection` toolbar — view mode buttons render identically to entity list page.
**States:**
- View buttons visible and functional within child tab panel.
- Scoped per child tab instance — independent of parent and sibling tabs.

#### API Layer
N/A — View mode is local per grid instance (`ViewModeStore` is instance-scoped via `VibeGridStoreProvider`).

#### Data Layer
N/A for view switching. Drag-drop status updates in child tab use same TanStack DB path.

---

### B7: Kanban Drag-Drop Persists Status Change

**Core:**
- **ID:** kanban-drag-persist
- **Trigger:** User drags a Kanban card from one column to another.
- **Expected:** The card moves to the new column immediately (optimistic update). The entity's groupByField value is updated persistently. On page reload, the card appears in the new column. The entity's activity log reflects the field change.
- **Verify:** Drag Task from "In Progress" to "Done" → reload → card in "Done" column. Check activity log on that task → shows status change.
- **Source:** `apps/web/src/systems/vibegrid/stores/KanbanViewStore.ts` → `endDrag()` → TanStack DB collection update (already implemented).

#### UI Layer
**States:**
- During drag: Source card `opacity-50 rotate-2 scale-105`; target column highlighted with drop zone border.
- After drop: Card in new column, highlight removed.

#### API Layer
N/A — KanbanViewStore uses TanStack DB collection update (not a raw API call).

#### Data Layer
**Tables:** Entity records table.
**Operation:** UPDATE — groupByField value updated on dragged entity record to the target column's value.

---

### B8: No Groupable Fields — Kanban Gracefully Absent

**Core:**
- **ID:** kanban-no-groupable-fields
- **Trigger:** User views an entity listing for an entity type with no `status_set`, `select`, `enum`, or many-to-one relationship fields.
- **Expected:** Kanban button is not rendered. URL param `?viewMode=kanban` on such a listing is ignored — grid initializes in table mode and removes the stale param.
- **Verify:** Create entity type with only `text` and `number` fields → open listing → Kanban button absent. Manually append `?viewMode=kanban` to URL → grid loads in table mode.
- **Source:** `apps/web/src/systems/vibegrid/modules/index.ts` → `canHandle()` for kanban; `apps/web/src/systems/vibegrid/modules/ViewModeRegistry.ts` → `getAvailableModules()`.

#### UI Layer
**States:** No Kanban button in toolbar. ViewPicker has no Kanban option. URL param silently ignored.

#### API Layer
N/A

#### Data Layer
N/A

---

## User Journey

| Step | Action | UI State | Notes |
|------|--------|----------|-------|
| **1. Entry** | User navigates to entity listing (e.g., `/entities/tasks`) | Table view; toolbar shows Table (active) + Kanban + Gantt buttons | Kanban shown because Tasks schema has `status` field |
| **2. Activate Kanban** | User clicks Kanban button | Board renders: columns per status value; cards show title + auto-detected fields | URL updates to `?viewMode=kanban` |
| **3. View Card Fields** | User reads a card | Card shows: title, assignee avatar + name, due date chip, priority badge (where present) | Null fields omitted — no empty slots |
| **4. Drag Card** | User drags card from "In Progress" to "Done" | Card moves immediately (optimistic); target column highlighted during drag | Status field on entity updated via TanStack DB |
| **5. Change GroupBy** | User opens "Group by: Status" dropdown → selects second field | Board re-groups into columns for the selected field | Picker only visible when 2+ groupable fields exist |
| **6. Save View** | User opens ViewPicker → "Save as new view" → names it "My Kanban" | View saved with `viewMode: 'kanban'` + `kanbanGroupByField` | ViewPicker badge shows Kanban icon |
| **7. Switch to Gantt** | User clicks Gantt button (schema has `start_date` + `end_date`) | Gantt timeline renders with bars; today line visible; zoom controls in toolbar | URL updates to `?viewMode=gantt` |
| **8. Gantt Nudge** | User opens a different entity type (e.g., Contacts) and clicks Gantt | Gantt pane shows instructional empty state: "Add date fields to enable timeline view" | Contacts schema has no date fields |
| **9. Child Tab** | User opens Project detail → clicks "Tasks" child entity tab | Tasks child grid in table mode; view mode buttons in child toolbar | View mode scoped to child tab instance |
| **10. Kanban in Child Tab** | User clicks Kanban in Tasks child tab | Tasks board renders within the tab panel | Independent from parent entity view mode |

**Alternative Flows:**
- Entity with no groupable fields: Kanban button hidden; user sees only Table (+ Gantt if applicable).
- Stale `?viewMode=kanban` on incompatible entity: Grid loads in table, URL param removed silently.
- Gantt activated but no date fields: Instructional nudge — not an error state.

---

## UI Layout

### Design System Foundation

| Aspect | Decision | Location |
|--------|----------|----------|
| **Reference Page** | `features/entities/components/EntityListView.tsx` | Copy store setup and toolbar pattern |
| **Layout Component** | Existing `VibeGrid` + `VibeGridXHeaderPure` | `systems/vibegrid/components/` |
| **Data Display** | Existing `KanbanBoard`/`GanttTimeline` | `systems/vibegrid/components/kanban/`, `GanttTimeline.tsx` |

### Reused Components

| Component | From | Usage |
|-----------|------|-------|
| `KanbanBoard`, `KanbanColumn`, `KanbanCard` | `systems/vibegrid/components/kanban/` | Board rendering (KanbanCard extended for smart fields) |
| `GanttTimeline`, `GanttBar`, `GanttToolbar` | `systems/vibegrid/components/` | Gantt rendering (unchanged) |
| `VibeGridXHeaderPure` | `systems/vibegrid/components/` | Toolbar with view mode buttons |
| `ViewPicker` | `systems/vibegrid/components/` | Saved view dropdown with mode badge |
| `Button`, `ButtonGroup` | `shared/components/ui/` | View mode toggle buttons |
| `DropdownMenu` | `shared/components/ui/` | GroupBy field picker |
| `Avatar` | `shared/components/ui/` | Assignee display on Kanban card |
| `Badge` | `shared/components/ui/` | Priority display on Kanban card |

**Custom Components (with justification):**
- `GroupByDropdown` (`systems/vibegrid/modules/kanban/GroupByDropdown.tsx`) — Kanban-specific. Too specialized for shared component but self-contained in kanban module directory.
- `GanttEmptyState` (`systems/vibegrid/modules/gantt/GanttEmptyState.tsx`) — View-specific instructional state. Generic `EmptyState` cannot convey field requirement context.

### Theme Tokens (Mandatory)

| Use | Token | NOT |
|-----|-------|-----|
| Card backgrounds | `bg-card` | ~~`bg-white`~~ |
| Muted field values | `text-muted-foreground` | ~~`text-gray-500`~~ |
| Borders | `border-border` | ~~`border-gray-200`~~ |
| Active view button | `bg-primary text-primary-foreground` | ~~`bg-blue-500`~~ |
| Empty state text | `text-foreground`, `text-muted-foreground` | ~~`text-black`~~ |

### Kanban View (Smart Card Fields)

```
┌─────────────────────────────────────────────────────────────────────┐
│ [ViewPicker ▼]  Group by: Status ▼  [Filter ▼]  [Search...]        │
│                                          [Table] [Kanban*] [Gantt]  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─── Todo (3) ──────┐  ┌─── In Progress (2) ──┐  ┌─── Done (5) ──┐│
│  │                    │  │                      │  │               ││
│  │ ┌────────────────┐ │  │ ┌────────────────┐   │  │ ┌───────────┐ ││
│  │ │⣿ Fix bug #123  │ │  │ │⣿ Design review │   │  │ │⣿ Deploy   │ ││
│  │ │👤 Alice         │ │  │ │👤 Bob           │   │  │ │           │ ││
│  │ │📅 Mar 28        │ │  │ │📅 Mar 30        │   │  │ │[High]     │ ││
│  │ │[High]           │ │  │ └────────────────┘   │  │ └───────────┘ ││
│  │ └────────────────┘ │  │                      │  │               ││
│  │ ┌────────────────┐ │  │ ┌────────────────┐   │  │               ││
│  │ │⣿ Write tests   │ │  │ │⣿ Code review   │   │  │               ││
│  │ │📅 Apr 1         │ │  │ └────────────────┘   │  │               ││
│  │ └────────────────┘ │  └──────────────────────┘  └───────────────┘│
│  └────────────────────┘                                              │
└─────────────────────────────────────────────────────────────────────┘
```

### Gantt Empty State (No Date Fields)

```
┌─────────────────────────────────────────────────────────────────────┐
│ [ViewPicker ▼]  [Filter ▼]  [Search...]  [Table] [Kanban] [Gantt*] │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│                              📅                                      │
│                                                                      │
│                 Timeline view requires date fields                   │
│                                                                      │
│        Add start_date and end_date fields to your entity             │
│        schema to see records plotted on a timeline.                  │
│                                                                      │
│                    [ Open Schema Editor → ]                          │
│                (hidden if no schema edit permission)                 │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Requirements Interview Summary

### Core Functionality

| Question | Answer | Rationale |
|----------|--------|-----------|
| Which views to ship? | Kanban + Gantt together | Both complete; shipping together avoids partial state |
| Feature flag? | No — direct rollout | Architecture stable; smart gating (canHandle) is the quality gate |
| Where available? | Entity list pages AND child entity tabs | Full coverage; child tabs are high-value use case |
| Kanban card fields? | Smart defaults — auto-detect from schema | No config UI for v1; detection covers assignee, dates, priority |
| External libraries? | No | Custom implementations well-integrated and sufficient |

### Edge Cases

| Scenario | Handling | Rationale |
|----------|----------|-----------|
| No groupable fields (Kanban) | Hide Kanban button entirely | Prevents confusing empty board |
| No date fields (Gantt) | Show Gantt button; nudge empty state inside view | Gantt is always accessible; nudge is instructional |
| Stale URL param on incompatible schema | Ignore param; fall back to table | URL may be shared across entity types |
| GroupBy field deleted from schema | Fall back to 'status' or first eligible field | KanbanViewStore handles gracefully |
| Entity with 10K+ rows | Columns virtualized (existing `@tanstack/react-virtual`) | Already implemented in KanbanColumn |
| Gantt rows missing start/end dates | Rows without both dates omitted from bar render | GanttViewStore already handles field auto-detect |
| Concurrent drag in multi-tab scenario | Last write wins; TanStack DB optimistic update reconciles | Existing TanStack DB behavior |
| schemaFields absent in canHandle | Graceful fallback: return true (show button) | Defensive — never hide a feature due to missing metadata |

### Platform Integration Decisions

| System | Decision | Rationale |
|--------|----------|-----------|
| Notifications | Not needed | View switching is a local UX preference; no notification warranted |
| Real-time Sync | Not needed for view mode switching | Drag-drop entity updates go through existing entity update path |
| Access Control | No new permissions | View switching uses existing entity read/write permissions |
| Audit Logging | Not needed | View preference changes are not auditable business events |
| Workflows | Not needed | No process automation involved |
| Settings/Preferences | GroupBy stored in entity_views view config | Per-view preference, not global setting |
| Feature Flags | None — direct rollout | Decided in requirements gathering |

### UX Decisions

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| Kanban unavailable state | Hide button (not disable with tooltip) | Hidden is cleaner; disable+tooltip requires extra explanation |
| Gantt unavailable state | Show button + in-view nudge | Gantt nudge is instructional; teaches field requirements |
| GroupBy picker visibility | Only show when 2+ eligible fields exist | Single-field case needs no picker |
| Card fields rendering | Stacked vertically; null values omitted | Clean layout; no empty rows |
| View mode button placement | Same toolbar position (already implemented) | Consistency |
| Child tab view mode scope | Scoped per child tab instance | Each child tab is an independent VibeGrid |

### Frontend Technical

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| canHandle schema access | Extend `GridModuleRenderProps` with `schemaFields?: SchemaFieldDescriptor[]` | canHandle must be lightweight (no module loading) |
| GroupByDropdown location | `systems/vibegrid/modules/kanban/GroupByDropdown.tsx` | Module-scoped; not a shared component |
| GanttEmptyState location | `systems/vibegrid/modules/gantt/GanttEmptyState.tsx` | Module-scoped |
| Smart field detection location | `KanbanViewStore.detectSmartFields()` method | Keeps UI components simple; logic in store |
| GroupBy persistence | Add `kanbanGroupByField` to `entity_views.config` JSON | Additive; existing view config mechanism reused |
| Store type | Extend existing `KanbanViewStore` and `GanttViewStore` | Minimizes surface area change |
| Child tab wiring | Verify ChildEntitySection forwards `childSchema` as `schemaFields` to VibeGrid | VibeGridStoreProvider already creates instance-scoped stores |
| Theme tokens | `bg-card`, `text-muted-foreground`, `border-border`, `bg-primary` | Mandatory per project conventions |

### Backend Technical

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| Worker | Web only | Pure frontend feature; no new worker needed |
| Router | None new | ViewPicker already persists to `entity_views` via existing router |
| Schema | None new | `entity_views.config` JSON already stores viewMode |
| Migrations | None required | All changes are additive to existing JSON config fields |

### Scope Boundaries

| Excluded | Reason |
|----------|--------|
| WIP limits per column | Phase 2 / future enhancement |
| Inline card creation | Phase 2 / requires design work |
| Swimlane / secondary grouping | Phase 2 complexity |
| dnd-kit migration | Optional polish; native DnD works |
| Gantt print/export | Separate feature |
| Configurable card field selection UI | V2 — v1 uses auto-detection |

---

## Blast Radius Analysis

### Code Impact

- **Primary — `systems/vibegrid/modules/index.ts`:** `canHandle()` predicates updated for kanban and gantt. Affects all VIbeGrid instances that call `getAvailableModules()`.
- **Primary — `systems/vibegrid/modules/GridModule.ts`:** `GridModuleRenderProps` extended with `schemaFields?: SchemaFieldDescriptor[]`. Affects: all files that construct `GridModuleRenderProps` (primarily `VibeGrid.tsx` and `EntityListView.tsx`).
- **Primary — `systems/vibegrid/stores/KanbanViewStore.ts`:** New `groupByOptions` computed, `detectSmartFields()` method, extended `KanbanCard` type. Affects `KanbanBoard.tsx` and `KanbanCard.tsx`.
- **Primary — `systems/vibegrid/components/kanban/KanbanCard.tsx`:** Renders additional smart fields. No interface breakage on the props side.
- **Secondary — `systems/vibegrid/modules/kanban/KanbanModule.tsx`:** Adds `GroupByDropdown` to toolbar render.
- **Secondary — `systems/vibegrid/modules/gantt/GanttModule.tsx`:** Adds `GanttEmptyState` render branch; passes `schemaFields` to `GanttViewStore`.
- **Secondary — `systems/vibegrid/components/VibeGridXHeaderPure.tsx`:** View mode buttons filtered by `getAvailableModules()` result.
- **Downstream — `features/entities/components/EntityListView.tsx`:** Derives `SchemaFieldDescriptor[]` from loaded schema and passes to VibeGrid.
- **Downstream — `features/entities/components/ChildEntitySection.tsx`:** Verifies/adds forwarding of `childSchema` as `schemaFields` to VibeGrid.

### Database Impact

| Change | Type | Migration | Existing Data |
|--------|------|-----------|---------------|
| `entity_views.config` gains `kanbanGroupByField` key | Additive (JSON) | None required | Existing views unaffected; absent key treated as default 'status' |

### API Impact

- **Breaking changes:** None.
- **New endpoints:** None.
- **Modified contracts:** `entity_views.config` JSON schema informally extended with `kanbanGroupByField` — additive only.

### Test Impact

- **Tests to update:** Any VIbeGrid unit tests that assert `canHandle` for kanban/gantt returns unconditionally true — these will need schema fixture data.
- **New test categories:** Unit tests for `canHandle` predicates with and without schema fields; unit tests for `detectSmartFields()`; integration test for GroupBy persistence; E2E browser test for full view switching cycle.
- **Test data requirements:** Entity schemas with/without status fields, date fields; entity records with assignee, due_date, priority values set.

### Performance Considerations

- **Query complexity:** None new. `canHandle` is synchronous O(n columns) schema inspection.
- **N+1 risks:** None — card field data is already in `card.data` (full row data in TanStack DB).
- **Caching implications:** `canHandle` result is recomputed from props on render; no caching needed for this fast predicate.
- **Virtualization:** KanbanColumn already uses `@tanstack/react-virtual` — additional card fields add negligible layout cost per card.

### Security Review

- **Permission checks:** View switching uses existing entity read permissions. No new permission boundaries.
- **Data sensitivity:** Assignee, dates, priority are already visible in table view — no new data exposure.
- **Input validation:** GroupBy field name is selected from a schema-derived allowlist (only schema fields are options). No free-text input that could inject arbitrary field names.

---

## Auxiliary Systems Integration

### Notifications

- **Needed?** No.
- **Rationale:** View mode switching and card grouping configuration are local UX preferences. Drag-drop status changes go through the existing entity update path which handles notifications independently.

### Real-time Sync

- **Needed?** No for view mode switching itself.
- **Rationale:** `ViewModeStore` is instance-scoped per grid. Drag-drop entity field updates go through TanStack DB which handles optimistic updates and reconciliation with server state.

### Access Control

- **New permissions needed?** No.
- **Rationale:** Kanban and Gantt views expose the same entity data as Table view. Existing `entities:read` / `entities:write` permissions cover field access and drag-drop updates.
- **One nuance:** The "Open Schema Editor" link in `GanttEmptyState` should be conditionally rendered based on whether the user has schema edit permissions. Check against existing schema edit permission (not a new permission — use existing pattern).

### Audit Logging

- **Needed?** No.
- **Rationale:** View preference changes (mode switching, GroupBy selection) are not auditable business events. Drag-drop entity field changes are logged via the existing entity update audit trail (not this feature's responsibility).

### Workflows Integration

- **Needed?** No.
- **Rationale:** No process automation surface for view switching.

### Settings/Preferences

- **Needed?** No global settings.
- **Details:** GroupBy field selection stored per-view in `entity_views.config.kanbanGroupByField`. Per-view preference — not user-level or org-level setting. No changes to `preferencesSchema` needed.

### Feature Flags

- **Flag name:** None — direct rollout per decisions.
- **Rollback path:** If needed: revert `canHandle()` predicates to `() => true` (removes smart gating) or set `isEnabled()` to `() => false` (hides modules entirely). No database rollback needed.

### Analytics/Metrics

- **Needed?** Not for v1.
- **Future consideration:** Track `viewMode` distribution (what % use kanban vs gantt vs table) to inform investment priority.

---

## Primitives Design

### Primitives Capability Audit

| Primitive | Applicable? | Usage | Gap? |
|-----------|-------------|-------|------|
| **DataForge** | Yes | Entity schema read for `canHandle()` predicates; entity records displayed in Kanban/Gantt | No gap — schema already available in component context |
| **Relationships** | Peripheral | Many-to-one relationship fields may serve as Kanban GroupBy axis | No gap — field type detection suffices |
| **Workflows** | No | N/A | — |
| **Templates** | No | N/A | — |
| **CommandBus** | Yes | Drag-drop entity field updates route through TanStack DB collection (already wired) | Already implemented in `KanbanViewStore.endDrag()` |
| **EventBus** | No | View mode change is local UI state; no platform event needed | — |

### Using Existing Primitives

| Primitive | Specific Usage |
|-----------|----------------|
| DataForge | Read entity schema columns to drive `canHandle()` predicates and `groupByOptions` computed |
| CommandBus | Kanban drag-drop → entity field update → already routes through TanStack DB collection update |

### Custom Code Decisions

| Component | Why Custom? | Why Not Extend Primitive? |
|-----------|-------------|---------------------------|
| `GroupByDropdown` | Kanban-specific field picker | Too specialized for shared component; self-contained in kanban module directory |
| `GanttEmptyState` | View-specific instructional state | Cannot reuse generic EmptyState — message references schema field requirements |

---

## Design

### Overview

All view mode rendering infrastructure is already built and wired. This feature is three things: (1) making `canHandle()` smart enough to hide views the schema cannot support, (2) enriching Kanban cards with auto-detected additional fields from the entity's row data, and (3) adding the one missing UX affordance — the GroupBy field picker.

The `GridModuleRenderProps` interface needs a minor extension to carry schema field descriptors so that `canHandle()` can inspect them without loading the module. The `KanbanViewStore` needs a new `groupByOptions` computed that scans columns for groupable field types, and a `detectSmartFields()` method that extracts assignee/date/priority values from the already-present `card.data` object. `GanttViewStore` needs a `hasDateFields` computed that switches `GanttModule.render()` between the timeline and the nudge empty state.

No new workers, no new API endpoints, no database migrations. The scope is entirely within `apps/web/src/systems/vibegrid/` and `apps/web/src/features/entities/`.

### Architecture

```
EntityListView / ChildEntitySection
  └── VibeGrid (props include schemaFields derived from loaded schema)
        └── VibeGridXHeaderPure
              ├── viewModeRegistry.getAvailableModules(props)
              │     ├── kanban: schemaFields.some(isGroupable) — hides if false
              │     └── gantt:  always true (nudge handled inside module)
              └── view mode button group (only available modes rendered)

KanbanModule.render(props, stores)
  ├── GroupByDropdown (from kanbanViewStore.groupByOptions — hidden if single field)
  └── KanbanBoard → KanbanColumn → KanbanCard
        └── card.smartFields from KanbanViewStore.detectSmartFields(card.data, columns)

GanttModule.render(props, stores)
  ├── ganttViewStore.hasDateFields computed from props.schemaFields
  ├── hasDateFields === false → <GanttEmptyState entityType={...} />
  └── hasDateFields === true  → <GanttTimeline />
```

### Key Interfaces

```typescript
// Extended GridModuleRenderProps — add schema context for canHandle predicates (P1)
interface GridModuleRenderProps {
  // ... all existing fields ...
  schemaFields?: SchemaFieldDescriptor[]
}

interface SchemaFieldDescriptor {
  fieldId: string
  fieldType: string  // 'status_set' | 'select' | 'enum' | 'date' | 'datetime' | 'user_reference' | etc.
  label: string
  slug: string
  cardinality?: 'one-to-one' | 'many-to-one' | 'one-to-many' | 'many-to-many'
}

// Extended KanbanCard type (P2)
interface KanbanCard {
  id: string
  title: string
  status: string | null
  columnId: string
  data: Record<string, unknown>
  smartFields?: KanbanCardSmartFields   // NEW
}

interface KanbanCardSmartFields {
  assignee?: { userId: string; displayName: string; avatarUrl?: string }
  dueDate?: string   // ISO date string
  priority?: { value: string; label: string; color?: string }
}

// GroupBy option for picker (P3)
interface GroupByOption {
  fieldId: string
  label: string
  fieldType: string
}

// View config extension for GroupBy persistence (P3)
// In entity_views.config JSON — additive, non-breaking:
interface ViewConfig {
  viewMode?: 'table' | 'kanban' | 'gantt'
  kanbanGroupByField?: string   // NEW
  // ... existing fields ...
}
```

### Data Model Changes

| Table/Entity | Change | Notes |
|--------------|--------|-------|
| `entity_views.config` | Add optional `kanbanGroupByField?: string` key | Additive JSON extension. Absent key treated as default `'status'` |

---

## Implementation

### Phase 0: Baseline Verification (BLOCKING)

Before starting, verify existing functionality works end-to-end:

| Check | How to Verify |
|-------|---------------|
| Entity listing loads in table mode | Navigate to `/entities/{any}`, grid renders without console errors |
| Kanban view activates | Click Kanban button, board renders (even if canHandle is currently always-true) |
| Gantt view activates | Click Gantt button, timeline renders (even if empty) |
| Drag-drop in Kanban updates status | Drag card between columns, reload, verify card in new column |
| ViewPicker saves/restores viewMode | Save named view in Kanban mode, reload, load saved view → Kanban active |
| Child entity tab renders | Open entity detail → child entity tab → VibeGrid loads |
| No console errors on any view | DevTools console clean |

**If any check fails:** STOP. File a bug against the existing implementation. Fix baseline first.

---

### Phase 1: Smart Gating — canHandle Predicates (~0.5 day)

**Goal:** Kanban and Gantt buttons only appear when the entity schema supports them.

**File-level changes:**

`apps/web/src/systems/vibegrid/modules/GridModule.ts`
- Add `schemaFields?: SchemaFieldDescriptor[]` field to `GridModuleRenderProps` interface.
- Add `SchemaFieldDescriptor` type export.

`apps/web/src/systems/vibegrid/modules/index.ts`
- Update kanban `canHandle()`:
  ```typescript
  canHandle: (props) => {
    if (!props.schemaFields?.length) return true  // graceful fallback
    const GROUPABLE = ['status_set', 'select']
    return props.schemaFields.some(f =>
      GROUPABLE.includes(f.fieldType) ||
      (f.fieldType === 'relationship_link')
    )
  }
  ```
- Gantt `canHandle` stays `() => true` (nudge handled inside view).

`apps/web/src/features/entities/components/EntityListView.tsx`
- Derive `schemaFields: SchemaFieldDescriptor[]` from the loaded entity schema.
- Pass `schemaFields` prop to `<VibeGrid>`.

`apps/web/src/features/entities/components/ChildEntitySection.tsx`
- Verify `childSchema` is accessible after load.
- Derive `schemaFields` from `childSchema` and pass to `<VibeGrid>`.

`apps/web/src/systems/vibegrid/components/VibeGridXHeaderPure.tsx`
- Replace the existing `enableKanban` prop pattern with registry-driven gating.
- Remove the `enableKanban` prop entirely.
- Use `viewModeRegistry.getAvailableModules(props, stores)` to determine which view mode buttons render.
- Render only available modes (table is always present; kanban/gantt conditional).

**Verification:**
- Entity with `status` field → Kanban button visible.
- Entity with only `text`/`number` fields → Kanban button absent.
- `?viewMode=kanban` on incompatible schema → table loads, URL param removed.
- `pnpm typecheck` clean.

---

### Phase 2: Kanban Card Smart Defaults (~1 day)

**Goal:** Cards auto-display assignee, due date, and priority when present.

**File-level changes:**

`apps/web/src/systems/vibegrid/stores/KanbanViewStore.ts`
- Extend `KanbanCard` interface with `smartFields?: KanbanCardSmartFields`.
- Add `detectSmartFields(data: Record<string, unknown>, columns: ColumnDescriptor[]): KanbanCardSmartFields` method.
  - Assignee: first column with `fieldType === 'user_reference'` that has a value with `display_name`/`name`.
  - Due date: column with slug matching `['due_date', 'end_date', 'deadline']` and `fieldType` in `['date', 'datetime']`.
  - Priority: column with slug matching `['priority', 'priority_level']` and `fieldType` in `['select', 'status_set']`.
- Call `detectSmartFields()` inside the `cards` computed property when building each card.

`apps/web/src/systems/vibegrid/components/kanban/KanbanCard.tsx`
- Import `Avatar`, `Badge` from `shared/components/ui/`.
- Render `card.smartFields?.assignee`: `<Avatar size={16}>` + display name in `text-xs text-muted-foreground`.
- Render `card.smartFields?.dueDate`: calendar icon + `format(parseISO(dueDate), 'MMM d')` in `text-xs text-muted-foreground`.
- Render `card.smartFields?.priority`: `<Badge>` with label, color from schema options (fall back to `bg-muted` if no color).
- All rendered inside `<CardContent>` below the existing status line.
- Null/undefined fields: not rendered (no empty placeholder row).

**Verification:**
- Task with assignee + due_date + priority → Kanban card shows all three fields.
- Task with no assignee → no assignee row.
- Task with null due_date → no date chip.
- Drag card with smart fields → fields preserved after drop.
- `pnpm typecheck` clean.

---

### Phase 3: GroupBy Field Picker (~0.5 day)

**Goal:** Users can switch which field defines Kanban columns.

**File-level changes:**

`apps/web/src/systems/vibegrid/stores/KanbanViewStore.ts`
- Add `groupByOptions: GroupByOption[]` computed — scans available columns (from `tableCoreStore`) for types in `['status_set', 'select', 'enum', 'relationship']`.
- Add `setGroupByField(fieldId: string): void` action.
- Update `groupByField` default logic: use `'status'` if present; otherwise first eligible field.

`apps/web/src/systems/vibegrid/modules/kanban/GroupByDropdown.tsx` (new file)
- `observer` component reading `kanbanViewStore.groupByOptions` + `kanbanViewStore.groupByField`.
- Renders `<DropdownMenu>` with options list.
- Calls `kanbanViewStore.setGroupByField(fieldId)` on select.
- Returns `null` when `groupByOptions.length <= 1`.

`apps/web/src/systems/vibegrid/modules/kanban/KanbanModule.tsx`
- Import and render `<GroupByDropdown>` in the kanban toolbar area (above `<KanbanBoard>`).

`apps/web/src/features/entities/hooks/useViewUrlSync.ts`
- On `kanbanViewStore.groupByField` change: write `kanbanGroupByField` into view config.
- On load: read `kanbanGroupByField` from view config and call `kanbanViewStore.setGroupByField()` if present.

**Verification:**
- Entity with 2+ select fields → GroupBy dropdown visible.
- Entity with 1 select field → GroupBy dropdown absent.
- Switching GroupBy → board re-renders with new columns.
- Save view → reload → GroupBy field restored.
- `pnpm typecheck` clean.

---

### Phase 4: Gantt Empty State Nudge (~0.5 day)

**Goal:** When Gantt is activated on a schema without date fields, show an instructional nudge.

**File-level changes:**

`apps/web/src/systems/vibegrid/stores/GanttViewStore.ts`
- Add `schemaFields: SchemaFieldDescriptor[]` as an injectable field (set during `GanttModule.init()`).
- Add `hasDateFields: boolean` computed: `this.schemaFields.some(f => f.fieldType === 'date' || f.fieldType === 'datetime')`.

`apps/web/src/systems/vibegrid/modules/gantt/GanttEmptyState.tsx` (new file)
- Props: `entityType: string`, `canEditSchema?: boolean`, `schemaEditorHref?: string`.
- Renders: calendar icon (`CalendarDays` from lucide-react), heading "Timeline view requires date fields", body text explaining `start_date` and `end_date`, optional "Open Schema Editor" link.
- All theme tokens — no hardcoded colors.

`apps/web/src/systems/vibegrid/modules/gantt/GanttModule.tsx`
- In `init()`: pass `props.schemaFields` to `ganttViewStore.schemaFields`.
- In `render()`: `if (!ganttViewStore.hasDateFields) return <GanttEmptyState entityType={props.entityType} .../>`.

**Verification:**
- Entity with no date fields → Gantt empty state shown with correct message.
- Entity with `start_date` + `end_date` → Gantt timeline renders.
- "Open Schema Editor" link present if user has schema edit permission; absent otherwise.
- `pnpm typecheck` clean.

---

### Phase 5: Child Entity Tab Integration (~0.5 day)

**Goal:** View mode switching available in child entity tabs on entity detail pages.

**File-level changes:**

`apps/web/src/features/entities/components/ChildEntitySection.tsx`
- After `childSchema` loads: derive `schemaFields: SchemaFieldDescriptor[]` using the same utility as `EntityListView`.
- Pass `schemaFields` to `<VibeGrid>`.
- Verify `VibeGridStoreProvider` is already present (creates per-instance `ViewModeStore`). If not, add it.

No new components required. This phase is primarily verification with minimal wiring additions.

**Verification:**
- Open Project detail → Tasks tab → view mode buttons (Table/Kanban/Gantt as applicable) visible in child tab toolbar.
- Click Kanban in Tasks child tab → board renders within the tab panel.
- Switching view mode in child tab does NOT change parent entity's view mode.
- Switching view mode in one child tab does NOT change another child tab's view mode.
- `pnpm typecheck` clean.

---

### Phase 6: Testing and Verification (~0.5 day)

**Browser smoke test sequence:**

```bash
# Login
agent-browser eval "window.__auth.signIn('ceo').then(r => JSON.stringify(r))"

# Navigate to Tasks entity listing
agent-browser open http://localhost:$DEV_PORT/entities/tasks

# Verify toolbar has Kanban button
agent-browser snapshot -i -s "[data-testid='view-mode-kanban']"

# Switch to Kanban
agent-browser click "[data-testid='view-mode-kanban']"
agent-browser screenshot /tmp/kanban-view.png

# Verify cards render
agent-browser snapshot -i -s ".vibegridx-kanban-card"

# Switch to Gantt
agent-browser click "[data-testid='view-mode-gantt']"
agent-browser screenshot /tmp/gantt-view.png

# Return to table
agent-browser click "[data-testid='view-mode-table']"

# Navigate to entity with no select fields (verify Kanban absent)
agent-browser open http://localhost:$DEV_PORT/entities/contacts
agent-browser snapshot -i  # Kanban button should not appear
```

**Full verification checklist:**
- [ ] Table → Kanban → Gantt → Table cycle with no console errors
- [ ] URL updates on each mode switch (`?viewMode=kanban`, `?viewMode=gantt`, no param)
- [ ] Reload in Kanban mode → Kanban restored
- [ ] Reload in Gantt mode → Gantt restored
- [ ] Save named view in Kanban → reload → load saved view → Kanban active
- [ ] Kanban cards show smart fields (assignee, date, priority) when data exists
- [ ] Cards with no smart field data show only title + status
- [ ] GroupBy picker visible on entity with 2+ select fields; hidden on 1
- [ ] GroupBy change re-renders board with new column layout
- [ ] GroupBy selection persists across page reload
- [ ] Kanban drag-drop → status changes → reload → card in new column
- [ ] Gantt empty state appears on entity with no date/datetime fields
- [ ] Gantt timeline renders normally on entity with start_date + end_date
- [ ] Kanban button absent on entity type with only text/number fields
- [ ] Child entity tab shows view mode buttons
- [ ] Kanban in child tab works (parent=Project, child=Task)
- [ ] Gantt in child tab works with date fields
- [ ] Child tab view mode independent from parent view mode
- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes

---

### Implementation Summary

| Phase | Focus | Key Files | Duration |
|-------|-------|-----------|----------|
| P0 | Baseline verification | None | ~0.5h |
| P1 | Smart gating | `modules/index.ts`, `GridModule.ts`, `EntityListView.tsx`, `VibeGridXHeaderPure.tsx` | ~0.5d |
| P2 | Kanban card fields | `KanbanViewStore.ts`, `KanbanCard.tsx` | ~1d |
| P3 | GroupBy picker | `KanbanViewStore.ts`, new `GroupByDropdown.tsx`, `KanbanModule.tsx`, `useViewUrlSync.ts` | ~0.5d |
| P4 | Gantt empty state | `GanttViewStore.ts`, new `GanttEmptyState.tsx`, `GanttModule.tsx` | ~0.5d |
| P5 | Child tab integration | `ChildEntitySection.tsx` | ~0.5d |
| P6 | Testing | Verification only | ~0.5d |
| **Total** | | | **~3.5d** |

---

## Testing

### Unit Tests

- [ ] `canHandle` (kanban): returns false when schemaFields has no groupable fields
- [ ] `canHandle` (kanban): returns true when schemaFields includes a `status_set` field
- [ ] `canHandle` (kanban): returns true when schemaFields absent (graceful fallback)
- [ ] `canHandle` (gantt): always returns true
- [ ] `KanbanViewStore.detectSmartFields()`: correctly extracts assignee, dueDate, priority
- [ ] `KanbanViewStore.detectSmartFields()`: returns empty object when no matching fields
- [ ] `KanbanViewStore.groupByOptions`: only includes groupable field types
- [ ] `GanttViewStore.hasDateFields`: true when date field present; false when absent

### Integration Tests

- [ ] GroupBy field selection persists to view config and restores on reload
- [ ] ViewMode persists in URL and in saved view config
- [ ] `getAvailableModules()` correctly filters kanban from schema with no groupable fields

### E2E Tests (agent-browser)

- [ ] Full view switching cycle: table → kanban → gantt → table
- [ ] Kanban drag-drop persists status change
- [ ] Gantt empty state shown for entity without date fields
- [ ] GroupBy picker changes board grouping
- [ ] View mode switching works in child entity tab

### Manual Testing

- [ ] Test as admin (ceo@widecorp.com) — full CRUD + drag-drop in Kanban
- [ ] Test as viewer — view mode switching works; drag-drop blocked (read-only)
- [ ] Test entity with rich schema — smart field detection correct
- [ ] Test entity with minimal schema (name only) — Kanban and Gantt buttons handle gracefully
- [ ] Test GroupBy field deleted from schema — falls back gracefully to default

---

## Risks & Open Questions

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| `schemaFields` not yet available when `canHandle()` is evaluated | Medium | Medium | Graceful fallback: return `true` if `schemaFields` is absent (show button rather than hide) |
| Smart field detection heuristics miss custom field slugs | Medium | Low | Standard names cover most cases; GroupBy picker lets users work around for grouping |
| `childSchema` not forwarded to VibeGrid in ChildEntitySection | Low | High | P5 is explicitly a verification + wiring phase — fix immediately if gap found |
| Gantt `hasDateFields` computed timing (schema arrives after first render) | Low | Low | Use MobX `reaction` to update `schemaFields` when props change; or recompute as pure derived value |

### Open Questions

- [ ] Should `?viewMode=kanban` on an incompatible schema show a toast explaining why it was ignored, or silently fall back? (Recommendation: silent fallback — URL may be stale from a different entity type or shared link.)
- [ ] Should GroupBy picker include many-to-one relationship fields, or only status_set/select/enum? (Recommendation: include many-to-one relationships — grouping by assignee or owner is a common and valuable use case.)
- [ ] Should the Gantt empty state "Open Schema Editor" link be hidden entirely for non-schema-edit users, or shown in disabled state? (Recommendation: hidden entirely — disabled buttons require tooltips to explain, which adds complexity.)

### Dependencies

| Dependency | Owner | Status | Blocker? |
|------------|-------|--------|----------|
| `KanbanViewStore.endDrag()` TanStack DB persistence | Platform | Already built and functional | No |
| `ViewPicker` view config persistence | Platform | Already built | No |
| `useViewUrlSync` URL persistence | Platform | Already built | No |
| `ChildEntitySection` schema availability | Platform | Needs P5 verification | Potential blocker if childSchema not accessible |

---

## Rollout

### Strategy

Direct rollout — no feature flag. `isEnabled()` on kanban and gantt modules already returns `true`. Smart gating via `canHandle()` is the user-facing quality control. The GroupBy field persists additively in `entity_views.config` — no migration risk.

### Rollback

If post-ship issues are found:
1. Revert `canHandle()` predicates to `() => true` — restores old always-shown behavior.
2. Revert `KanbanCard` smart fields — visual revert, no data impact.
3. Remove `GroupByDropdown` from `KanbanModule` render — no data impact (stored `kanbanGroupByField` in view config is harmlessly ignored).
4. No database rollback needed — all changes are additive to JSON config fields.

---

## Decision Log

### Decision 1: No Feature Flag — Direct Rollout
**Date:** 2026-03-24
**Chose:** Direct rollout to all users
**Over:** Feature-flagged progressive rollout
**Reason:** Architecture is complete and stable. `canHandle()` predicates provide the quality gate — incompatible schemas simply don't show the buttons. No ramp risk.

### Decision 2: Gantt Always Shows Button — Nudge Inside View
**Date:** 2026-03-24
**Chose:** Gantt button always visible; instructional empty state shown when no date fields
**Over:** Hide Gantt button when no date fields (same approach as Kanban)
**Reason:** Gantt is a teachable moment — showing users they can unlock it by adding date fields drives schema adoption. Kanban with no groupable fields is a dead end (empty board, no useful action). Gantt with no dates has a clear resolution path.

### Decision 3: Kanban Card v1 — Smart Auto-Detection Only
**Date:** 2026-03-24
**Chose:** Heuristic auto-detection of assignee, due date, priority based on field slugs/types
**Over:** Configurable card field selection UI
**Reason:** Zero friction for v1. Standard field naming conventions (`due_date`, `priority`, `assignee`) cover the majority of real-world schemas. Config UI is a v2 enhancement.

### Decision 4: No External Libraries
**Date:** 2026-03-24
**Chose:** Keep native HTML5 DnD for Kanban; keep custom Gantt implementation
**Over:** dnd-kit (Kanban), SVAR React Gantt or Frappe Gantt
**Reason:** Custom implementations are fully integrated with MobX stores, TanStack DB, and SlotRegistry. External libraries would require adapter layers without meaningful benefit at current scale.

### Decision 5: Kanban Available On Entity List AND Child Entity Tabs
**Date:** 2026-03-24
**Chose:** Both contexts
**Over:** Entity list only (simpler scope)
**Reason:** Child entity tabs (project → tasks) are the highest-value use case. A project's tasks displayed as a Kanban board within the project detail page is a core workflow.

### Decision 6: TanStack DB for Kanban Drag Persistence (Not CommandBus)
**Date:** 2026-03-24
**Chose:** Keep existing TanStack DB `collection.update()` pattern for Kanban drag-drop status changes
**Over:** Refactoring to use CommandBus
**Reason:** The `.claude/rules/vibegrid.md` rule "All mutations via CommandBus" refers to grid-initiated mutations that need undo/redo tracking. Kanban drag-drop uses `collection.update()` which flows through TanStack DB's optimistic update pipeline — this is the standard mutation path for entity field updates outside the grid's cell editing system. Refactoring to CommandBus is a separate concern and would be a breaking change for the existing working pattern.

### Decision 7: GroupBy Persists in Saved View Config Only (Not URL)
**Date:** 2026-03-24
**Chose:** `kanbanGroupByField` is persisted in `entity_views.config` JSON only
**Over:** Adding `?kanbanGroupByField=X` to URL params
**Reason:** URL params should stay minimal (viewMode is enough). GroupBy is a view configuration detail, not a navigation state. Users who want to share a specific GroupBy configuration should save a named view.

### Decision 8: Replace enableKanban Prop with Registry-Driven Gating
**Date:** 2026-03-24
**Chose:** Remove `enableKanban` prop from `VibeGridXHeaderPure`, use `getAvailableModules()` instead
**Over:** Keeping both prop-based and registry-based gating
**Reason:** Single source of truth. `canHandle()` predicates on the ViewModeRegistry are the canonical gate. Having `enableKanban` as a parallel mechanism creates ambiguity and maintenance burden.

### Decision 9: Child Tab View Mode Does Not Persist in v1
**Date:** 2026-03-24
**Chose:** View mode resets to table when child tab is reopened
**Over:** Persisting child tab view mode in view config or localStorage
**Reason:** Child tab view mode persistence requires config structure changes (per-child-tab viewMode in `entity_views.config`). The value is low relative to the complexity for v1. Can be added in v2.

---

## Related Work

- VIbeGrid Module System Architecture: GH#1416
- ChildEntitySection implementation: GH#1621
- ViewPicker + saved views: GH#1570
- VIbeGrid GroupingConfig: GH#1570 P2.3
- Research doc: `planning/research/2026-03-24-vibegrid-view-switching-kanban-gantt.md`
- Gantt primitive doc: `docs/primitives/vibegrid/gantt.md`
- VIbeGrid rules: `.claude/rules/vibegrid.md`
- VIbeGrid interaction rules: `.claude/rules/vibegrid-interactions.md`
- Entity detail view rules: `.claude/rules/entity-detail-views.md`
