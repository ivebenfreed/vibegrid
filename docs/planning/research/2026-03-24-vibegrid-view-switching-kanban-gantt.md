---
date: 2026-03-24
topic: VIbeGrid View Switching — Kanban & Gantt in Entity Listings
status: complete
github_issue: null
---

# Research: VIbeGrid View Switching — Kanban & Gantt in Entity Listings

## Context

Exploring how to expose VIbeGrid's existing Kanban and Gantt view modes to users on entity listing pages. The infrastructure already exists — this research focuses on completeness, gaps, and what's needed to make it production-ready.

## Questions Explored

1. How does VIbeGrid's current view module system work?
2. How complete are the Kanban and Gantt implementations?
3. What's the best UX pattern for view switching on entity listings?
4. Are external libraries needed, or is the custom implementation sufficient?
5. What data requirements must entities meet for each view mode?

---

## Findings

### 1. Architecture Already Exists (Fully Built)

VIbeGrid has a complete, well-architected view module system:

**ViewModeRegistry** (`systems/vibegrid/modules/ViewModeRegistry.ts`) — Global singleton
- Lazy-loads modules on first use via factory functions
- Module metadata (displayName, icon, canHandle, isEnabled) available without loading
- `getAvailableModules(props, stores)` filters by capability + feature flags
- Already supports table, kanban, gantt

**GridModule Interface** (`systems/vibegrid/modules/GridModule.ts`)
- `id`, `displayName`, `icon` — identity
- `init(stores) → cleanup()` — lifecycle with cleanup
- `render(props, stores) → ReactElement` — view rendering
- `registerSlots(slotRegistry)` — view-specific cell renderers

**ViewModeStore** (`systems/vibegrid/stores/ViewModeStore.ts`) — Instance-scoped per grid
- `mode: 'table' | 'gantt' | 'kanban'` observable
- `setMode(mode)`, `toggleMode()`, computed `isGanttMode`, `isKanbanMode`, `isTableMode`
- Gantt-specific: `cutoffWidth` for split-pane resize

**Module Registration** (`systems/vibegrid/modules/index.ts`) — Auto-registers at import time
- All 3 modules registered with lazy loading
- `canHandle()` returns true for all (no gating yet)
- `isEnabled()` returns true for all (no feature flags yet)

### 2. Kanban Implementation — Functional, Needs Polish

**What's built:**
- `KanbanModule` (`modules/kanban/KanbanModule.tsx`) — Full GridModule implementation
- `KanbanViewStore` (`stores/KanbanViewStore.ts`) — 460 lines, comprehensive
  - Auto-detects status/select/enum fields for grouping
  - Computed columns from status color map + data discovery
  - Card drag state with source/target tracking
  - `endDrag()` persists via TanStack DB collection (optimistic update)
  - O(1) card lookup, O(n) pre-split by column
  - Handles null/"No Status" column
  - Preserves original casing on drag (resolveOriginalGroupValue)
- `KanbanBoard` (`components/kanban/KanbanBoard.tsx`) — MobX observer
  - Pre-splits cards by column in O(n)
  - HTML5 drag-and-drop with drag over/leave/drop handlers
  - Empty state ("No status values found")
- `KanbanColumn` (`components/kanban/KanbanColumn.tsx`) — Virtualized with @tanstack/react-virtual
  - Column header with color dot, label, card count
  - Drop zone highlighting
  - Boundary-aware drag leave (prevents flicker)
- `KanbanCard` (`components/kanban/KanbanCard.tsx`) — memo'd, MobX observer
  - shadcn Card component, GripVertical drag handle
  - Keyboard accessible (Enter/Space to click)
  - `aria-grabbed` support
  - Title + status display

**Gaps identified:**
- Cards only show title + status — no configurable card fields
- No WIP (Work In Progress) limits per column
- No card creation inline (would need "+" button per column)
- No column reordering
- `groupByField` defaults to 'status' — no UI to change it
- No swimlane support (secondary grouping)
- No card preview/detail on hover
- `registerSlots` is undefined — could add KanbanCardSlot for custom card rendering

### 3. Gantt Implementation — Feature-Rich

**What's built:**
- `GanttModule` (`modules/gantt/GanttModule.tsx`) — Full GridModule with registerSlots
  - Split-pane: CutoffResizer + GanttTimeline
  - Auto-detects start_date, end_date, status, progress fields
  - Registers custom slots: gantt-date-summary, gantt-status-chip (priority 100, contextFilter viewMode='gantt')
- `GanttViewStore` (`stores/GanttViewStore.ts`) — Manages timeline state
  - Zoom levels: day/week/month/quarter
  - Bar positions computed from date fields
  - Dependency management (FS/SS/FF/SF types)
  - Critical path calculation
  - Drag state for bar move/resize
  - Dependency drag (create arrows between bars)
  - Field mapping (startField, endField, statusField, progressField)
  - Cascade scheduling (auto-update dependent tasks)
- `GanttTimeline` (`components/GanttTimeline.tsx`) — Full implementation
  - TimeScaleHeader with zoom-level-aware markers
  - Today line indicator
  - GanttBar per row with drag-to-move/resize
  - DependencyArrowLayer for FS/SS/FF/SF arrows
  - Dependency drag line (drag from bar edge to create dependency)
  - Preview bar during drag
  - Zebra striping matching table view
  - Scroll sync with MobX store
- `GanttBar`, `GanttFilters`, `GanttToolbar` — Supporting components
- `DependencyArrowLayer` — SVG arrow rendering

**Gaps identified:**
- Resource assignment view (who's overloaded) not present
- No milestone markers (mentioned in primitive doc as "diamonds for milestones" — may not be implemented)
- No baseline comparison (planned vs actual dates)
- Print/export of Gantt view

### 4. View Switching UX — Already Wired

**ViewPicker** (`components/ViewPicker.tsx`) — Saved view dropdown with mode awareness
- Shows ViewModeIcon (LayoutList/Kanban/GanttChart from lucide-react) per saved view
- `deriveViewMode(config)` reads viewMode from saved view config
- ViewModeBadge shows "table"/"kanban"/"gantt" badge per view

**VibeGridXHeaderPure** — Toolbar already has view mode toggle buttons
- Three buttons: Table, Gantt, Kanban
- `variant={viewMode === X ? 'default' : 'outline'}` for active state
- `aria-pressed` for accessibility
- Calls `onViewModeChange(mode)` prop

**EntityListView** integration:
- `VibeGridStoreProvider` wraps grid with all stores
- `useViewUrlSync` reads/writes `viewMode` to URL and saved views
- View config saves `viewMode: viewModeStore.mode`
- URL sync restores viewMode on page load

**VibeGrid.tsx** module activation:
- Reacts to `viewMode` prop changes
- Loads module via `viewModeRegistry.get(viewMode)`
- Calls `module.registerSlots(slotRegistry)` once
- Calls `module.init(stores)` → cleanup on deactivation
- Renders module via `module.render(props, stores)`
- Layout changes: kanban gets hidden table container (data still loads), gantt gets split-pane

### 5. Data Requirements

**Kanban requires:**
- At least one status/select/enum field (auto-detected)
- Optional: status color options from schema (StatusColorOption)
- Name field for card title (falls back to 'name' or row ID)

**Gantt requires:**
- Start date field (auto-detects: start_date, startdate, "start date")
- End date field (auto-detects: end_date, enddate, due_date, "end date", "due date")
- Optional: status field for bar coloring
- Optional: progress field for progress bars
- Optional: dependency relationships between entities

**No additional schema changes needed** — both modules auto-detect fields from existing entity schemas.

### 6. External Library Assessment

| Area | Current | External Alternative | Recommendation |
|------|---------|---------------------|----------------|
| **Kanban DnD** | HTML5 native drag API | dnd-kit (active, performant) | Keep native for now — works, virtualized columns handle scale. Consider dnd-kit if UX polish needed (smooth animations, collision detection) |
| **Kanban Board** | Custom (KanbanBoard/Column/Card) | react-kanban-kit, react-trello | Keep custom — already integrated with MobX stores, TanStack DB, SlotRegistry. External libs would require adapter layers |
| **Gantt Timeline** | Custom (GanttTimeline/Bar/Arrows) | SVAR React Gantt (MIT, 60fps@1k), Frappe Gantt | Keep custom — deep integration with VIbeGrid stores, dependency system, slot registry. External would mean rewriting half the grid system |
| **Gantt Scheduling** | Custom cascade scheduler | DHTMLX Gantt, Bryntum | Only consider if auto-scheduling logic (resource leveling, constraint-based) becomes required |

**Verdict: No external libraries needed.** The custom implementation is well-integrated and feature-rich. External libs would introduce dependency risk and adapter complexity without significant benefit.

---

## Recommendations

### Option A: Polish & Ship (Recommended) — Low effort, high value

The infrastructure is already built and working. Focus on:

1. **Feature flag gating** — Wire `isEnabled()` on kanban/gantt to feature flags so they can be progressively rolled out
2. **Kanban card configurability** — Allow configuring which fields show on cards (beyond just title + status)
3. **GroupBy field picker UI** — Add dropdown in Kanban toolbar to switch groupBy field
4. **Field requirement hints** — Show helpful message when Gantt can't find date fields ("Add start_date and end_date fields to enable timeline view")
5. **Persistence** — Ensure viewMode saves to entity_views config and restores correctly (already wired via useViewUrlSync)

**Effort:** ~2-3 days for a polished v1

### Option B: Enhanced Kanban — Medium effort

All of Option A plus:
1. WIP limits per column (configurable, visual warning when exceeded)
2. Inline card creation ("+" button per column)
3. Swimlanes (secondary grouping dimension)
4. Card template customization via entity view config
5. Column collapse/expand

**Effort:** ~5-7 days

### Option C: Replace DnD with dnd-kit — Low-medium effort

Replace HTML5 drag API with dnd-kit for smoother interactions:
- Animated drag previews
- Better touch support
- Collision detection for precise card positioning within columns
- Keyboard-based drag and drop

**Effort:** ~2-3 days (contained to Kanban components)

---

## Open Questions

1. **Should view switching be per-entity-type or global?** Currently per-entity via saved views. Some entities (e.g., pure records without status fields) shouldn't show Kanban.
2. **Should `canHandle()` actually check for required fields?** Currently always returns true. Could check for status field presence (Kanban) or date fields (Gantt).
3. **Mobile/touch support** — HTML5 drag API has limited mobile support. dnd-kit would help here.
4. **Default view per archetype** — Should Work entities (tasks) default to Kanban? Should entities with dates default to Gantt?

## Next Steps

Recommend **Option A (Polish & Ship)** as a first pass. The architecture is solid, the implementations are functional, and the main gap is configuration UX rather than core functionality.

---

## Key Files Reference

| Component | Path |
|-----------|------|
| ViewModeRegistry | `systems/vibegrid/modules/ViewModeRegistry.ts` |
| GridModule interface | `systems/vibegrid/modules/GridModule.ts` |
| Module registration | `systems/vibegrid/modules/index.ts` |
| ViewModeStore | `systems/vibegrid/stores/ViewModeStore.ts` |
| KanbanModule | `systems/vibegrid/modules/kanban/KanbanModule.tsx` |
| KanbanViewStore | `systems/vibegrid/stores/KanbanViewStore.ts` |
| KanbanBoard/Column/Card | `systems/vibegrid/components/kanban/` |
| GanttModule | `systems/vibegrid/modules/gantt/GanttModule.tsx` |
| GanttViewStore | `systems/vibegrid/stores/GanttViewStore.ts` |
| GanttTimeline | `systems/vibegrid/components/GanttTimeline.tsx` |
| ViewPicker | `systems/vibegrid/components/ViewPicker.tsx` |
| Header (toggle buttons) | `systems/vibegrid/components/VibeGridXHeaderPure.tsx` |
| EntityListView | `features/entities/components/EntityListView.tsx` |
| URL sync | `features/entities/hooks/useViewUrlSync.ts` |
| Gantt primitive doc | `docs/primitives/vibegrid/gantt.md` |
