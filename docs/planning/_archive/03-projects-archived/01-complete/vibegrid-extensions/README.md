---
initiative: vibegrid-extensions
type: project
status: complete
owner: platform-engineering
updated: 2025-12-07
---

# Vibegrid Gantt View

**Type**: Project (time-boxed)
**Status**: Complete ✅
**Timeline**: 2 weeks (Weeks 5-6 of unified-planning-system)
**Effort**: 1 engineer
**Risk**: Low - Extends proven Vibegrid architecture

## Progress Summary

| Phase | Status | Description |
|-------|--------|-------------|
| Phase 1 | ✅ Complete | Split pane infrastructure, view toggle, cutoff resizer |
| Phase 2 | ✅ Complete | Timeline rendering, bars, time scale header |
| Phase 3 | ✅ Complete | Bar drag to resize, dependency arrows rendering |
| Phase 4 | ✅ Complete | Dependency creation via drag, schema sync, persistence |

## Remaining Work

Remaining polish and enhancements moved to: [gantt-polish](../../04-improvements/gantt-polish/)

updated: 2025-12-07
---

## Executive Summary (1 minute read)

### The Problem

Vibegrid currently only supports table view. Roadmaps and initiatives have date fields but no timeline visualization:

- **No timeline view**: DevPlan entities have startDate/endDate but display as text columns
- **No dependency visualization**: Task relationships exist but aren't visually connected
- **Limited planning insight**: Users can't see schedule conflicts or timeline gaps
- **Manual date management**: No drag-to-resize for adjusting dates

### The Solution

Add Gantt view mode to Vibegrid - same left columns, timeline area on right:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Toggle: [Table] [Gantt]                                                     │
├────────────┬──────────┬│─────────────────────────────────────────────────────┤
│  Name      │  Status  ││  Jan       │    Feb       │    Mar       │    Apr  │
├────────────┼──────────┼│─────────────────────────────────────────────────────┤
│  Epic 1    │ Active   ││  ████████████████████████                           │
│  Feature A │ Planning ││       ████████████                                  │
│  Task 1    │ Done     ││           ████                                      │
│  Task 2    │ Blocked  ││               ████ ─────→ (dependency arrow)        │
└────────────┴──────────┴│─────────────────────────────────────────────────────┘
       FROZEN COLUMNS    │              SCROLLABLE TIMELINE
                         │
                      CUTOFF
```

**Layout concept:**
- **Left side**: Same table columns (Name, Status, etc.) - scrollable within pane
- **Cutoff**: Vertical divider, configurable width
- **Right side**: Timeline area with date bars - scrollable through time
- **Vertical scroll**: Synced between both panes (same rows)

**Key Features:**
- Date bars positioned by startDate/endDate fields
- Drag edges to resize (change dates)
- Dependency arrows between rows
- Time scale zoom (day/week/month/quarter)
- Progress overlay (completion percentage)
- Reuses Vibegrid row selection, virtualization

**V1 Scope:**
- Grouping disabled in Gantt view (flat list only)
- Hierarchy/subtasks deferred to future iteration
- Focus: core timeline rendering + drag interactions

### ROI & Benefits

| Metric | Current | After Implementation |
|--------|---------|---------------------|
| View modes | Table only | Table + Gantt |
| Timeline visualization | None | Full Gantt with dependencies |
| Date editing | Manual text entry | Drag-to-resize |
| Schedule overview | Row-by-row reading | Visual timeline |

### Investment

- **Timeline**: 2 weeks
- **Effort**: 1 engineer
- **Risk**: Low - Extends existing Vibegrid, not new system
- **Costs**: None (uses existing infrastructure)

### Success Criteria

- Gantt view renders 1000+ rows at 60fps
- Date bars correctly positioned from entity fields
- Drag-resize updates entity dates via DataForge
- Dependency arrows render between related rows
- View mode toggle preserves selection and scroll position
- Works with existing grouping and filtering

updated: 2025-12-05
---

## Documentation

### Active Documents (READ THESE)

**1. DESIGN.md** (~8 pages)
- GanttViewStore interface
- Time scale rendering architecture
- Bar positioning and interaction
- Dependency arrow rendering
- Integration with TableCoreStore

**2. IMPLEMENTATION.md** (~6 pages)
- Week 5: Core infrastructure (time scale, virtual columns)
- Week 6: Interactions (drag resize, dependencies)
- Testing strategy
- File structures

**3. AGENT_NOTES.md** (Living doc)
- Vibegrid integration patterns
- Performance considerations
- Implementation gotchas

updated: 2025-12-05
---

## Architecture

### Gantt Layout Structure

```
┌─────────────────────────────────────────────────────────────────────────┐
│  ViewModeStore: mode = 'gantt'                                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────┐ │ ┌─────────────────────────────────────────┐  │
│  │  FROZEN COLUMNS     │ │ │  TIMELINE AREA                          │  │
│  │  (existing render)  │ │ │  (new gantt render)                     │  │
│  │                     │ │ │                                         │  │
│  │  - Uses existing    │ │ │  ┌─────────────────────────────────┐    │  │
│  │    BodyRenderer     │ │ │  │ TimeScaleHeader                 │    │  │
│  │  - Same cells/cols  │ │ │  │ Jan | Feb | Mar | Apr | May     │    │  │
│  │  - Subset of cols   │ │ │  └─────────────────────────────────┘    │  │
│  │    (configurable)   │ │ │  ┌─────────────────────────────────┐    │  │
│  │                     │ │ │  │ GanttBarLayer                   │    │  │
│  │                     │ │ │  │ ████████                        │    │  │
│  │                     │ │ │  │     ████████ ──→                │    │  │
│  │                     │ │ │  │         ████                    │    │  │
│  │                     │ │ │  └─────────────────────────────────┘    │  │
│  └─────────────────────┘ │ └─────────────────────────────────────────┘  │
│                          │                                              │
│                       CUTOFF                                            │
│                       (drag to resize)                                  │
└─────────────────────────────────────────────────────────────────────────┘

Scroll behavior:
- Left pane: horizontal scroll through columns (existing behavior)
- Right pane: horizontal scroll through time
- Both panes: vertical scroll synced (same rows visible)
```

### Shared Infrastructure (Reused from Vibegrid)

- **TableCoreStore**: Row data, selection, grouping - unchanged
- **VirtualScrollManager**: Vertical virtualization - shared between both panes
- **BodyRenderer**: Renders left pane columns (same code, just subset)
- **SelectionController**: Row selection synced across both panes
- **KeyboardController**: Navigation

### New Components (Gantt-specific)

- **GanttViewStore**: Time scale state (zoom level, visible range, bar positions)
- **TimeScaleHeader**: Day/week/month/quarter column headers
- **GanttBarLayer**: Renders date bars positioned by row + time
- **DependencyArrowLayer**: SVG overlay for dependency arrows
- **CutoffResizer**: Draggable divider between frozen cols and timeline

updated: 2025-12-05
---

## Decision Log

### Why View Mode (Not Separate Component)?

**Chose**: Extend Vibegrid with view mode toggle
**Over**: Separate GanttChart component
**Reason**: Gantt shares 70% of Vibegrid functionality:
- Same row data model
- Same selection behavior
- Same grouping/filtering
- Same virtual scroll
- Same keyboard navigation

Only the cell rendering changes (columns → time bars).

### Why DOM Bars (Not Canvas)?

**Chose**: DOM elements for Gantt bars
**Over**: Canvas rendering
**Reason**:
- Easier interaction (native drag events)
- Consistent with Vibegrid overlay pattern
- Virtualization handles performance
- Can use CSS for styling/animations

### Why Split Pane (Not Full Replacement)?

**Chose**: Two scrollable panes with synced vertical scroll
**Over**: Completely separate Gantt renderer
**Reason**:
- Left side is literally the same table view - reuse existing BodyRenderer
- Both panes scroll horizontally independently
- Vertical scroll is synced (same row visible in both)
- Row heights, virtualization, selection all stay in sync
- Cutoff width is draggable - user controls how much table vs timeline
- Matches modern tools (Notion, Airtable, Linear) pattern

updated: 2025-12-05
---

## Related Work

- **Parent**: [unified-planning-system](../unified-planning-system/) - Uses Gantt for DevPlan visualization
- **Sibling**: [nodestudio](../nodestudio/) - Graph editor (split from this initiative)
- **Sibling**: [tree-viewer](../tree-viewer/) - Hierarchical navigation (split from this initiative)
- **Foundation**: `src/systems/vibegrid/` - Existing table system

updated: 2025-12-05
---

## Key Files

### Existing (to extend)

- `src/systems/vibegrid/stores/TableCoreStore.ts` - Row data management
- `src/systems/vibegrid/renderers/core/SimplePassiveRenderer.ts` - Main renderer
- `src/systems/vibegrid/virtualization/VirtualScrollManager.ts` - Scroll virtualization
- `src/systems/vibegrid/overlays/` - DOM overlay system

### New (created in Phase 1-2)

- `src/systems/vibegrid/stores/ViewModeStore.ts` - View mode toggle state ✅
- `src/systems/vibegrid/stores/GanttViewStore.ts` - Time scale and bar state ✅
- `src/systems/vibegrid/components/CutoffResizer.tsx` - Draggable divider ✅
- `src/systems/vibegrid/components/GanttTimeline.tsx` - Timeline with bars ✅

### Pending (Phase 3-4)

- `src/systems/vibegrid/interactions/GanttBarDragController.ts` - Drag resize
- `src/systems/vibegrid/renderers/gantt/DependencyArrowLayer.ts` - Arrow SVG

updated: 2025-12-06
---

## Deferred to V2

- **Grouping**: Field-based grouping in Gantt view
- **Hierarchy**: Parent/child nesting with summary bars
- **Date inheritance**: Auto-derive dates from children
- **Subtasks**: Indented task relationships

updated: 2025-12-05
---

**Template Version**: 2.0
