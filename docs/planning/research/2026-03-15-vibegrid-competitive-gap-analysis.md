---
date: 2026-03-15
topic: VIbeGrid competitive gap analysis vs Notion, Airtable, AG Grid
status: complete
github_issue: null
---

# Research: VIbeGrid Competitive Gap Analysis

## Context

Comparison of VIbeGrid's current capabilities against Notion, Airtable, and AG Grid to identify feature gaps and competitive positioning. Based on code audit of `apps/web/src/systems/vibegrid/`.

## Questions Explored

1. What does VIbeGrid have that competitors have?
2. What gaps exist relative to Notion, Airtable, and AG Grid?
3. Where does VIbeGrid exceed competitors?

## Built Features (Verified Against Code)

### Core Table Engine
- Virtual scrolling with DOM recycling (30-50 rows, 60fps on 10k+)
- Dual-layer cell rendering (shell cells ~0.05ms, rich upgrade during idle via RenderScheduler)
- Canvas grid lines (visible immediately during scroll jumps)
- Delta-based selection updates (O(delta) not O(n))
- Incremental column virtualization (binary search for visible range)

### View Modes (3 via ViewModeRegistry)
- **Table** — default tabular grid with all features below
- **Kanban** — cards in columns by status field, drag-and-drop between columns (KanbanModule + KanbanViewStore)
- **Gantt** — timeline view with 4 dependency types (FS/SS/FF/SF), critical path highlighting, drag-to-move/resize (GanttModule + GanttViewStore)

### Data Controls
- Multi-level sorting (SortConfig[])
- Multi-level filtering with nested AND/OR logic (FilterGroup, applyFilterGroup)
- Multi-level hierarchical grouping with aggregations (sum, avg, min, max, count, unique) via GroupProcessor
- Smart text search with 300ms debounce (SmartSearchInput)
- Relationship field grouping with human-readable name resolution
- Saved views — snapshots of filter/column/sort state, personal or shared, with live counts (SaveViewDialog + ViewPicker)
- Filter presets via localStorage (filter-storage.ts)

### Cell Rendering & Editing
- 28+ built-in field type renderers via SlotRegistry (text, number, date, select, multi-select, boolean, currency, email, phone, URL, rich text, entity_reference, relationships, badge, computed, rollup, etc.)
- Priority-based slot resolution (view mode 100 > domain 50 > default 0)
- 13+ inline editor types (TextEditor, NumberEditor, DateEditor, SelectEditor, MultiSelectEditor, BooleanEditor, RichTextEditor, LongTextEditor, RelationshipEditor, SingleRelationshipEditor, MultiRelationshipEditor, ReferenceSelectEditor, ComboboxEditor)
- Outside-click blur handling with commit/cancel/keep-open policies (EditingStore)
- Ghost row inline creation within groups (InlineCreationStore)
- Type-aware validation per field

### Column & Row Features
- Column resize with drag overlay (ColumnResizeOverlayDOM)
- Column reorder with drag-and-drop (ColumnDragOverlayDOM + DragPreviewOverlayDOM)
- Column visibility toggle with persistence
- Row numbers (system column type)
- Variable row heights (configurable in VisualStateStore)
- Row expansion with detail panels (RowExpansionProcessor + ExpandedContentPortals)

### Selection & Interaction
- Row selection (single, multi, Shift+range)
- Cell range selection with drag-to-select (SelectionOverlayController, CanvasOverlayDOM)
- Fill handle / drag-to-fill (FillHandleLayerDOM)
- Context menus (ContextMenu.tsx, FloatingActionsMenu.tsx)
- Keyboard navigation (arrows, Tab, Enter, Escape via KeyboardNavigationController + InteractionCoordinator)
- Clipboard with type-aware paste validation (format conversion for dates, numbers, selects; cell-by-cell error tracking)

### Advanced Data Features
- Relationship fields (single/multi, entity_reference, user_reference)
- Rollup fields (count, sum, avg, min, max, concat) with change-driven re-evaluation
- Computed fields (expression, formula, decision_table)
- Date cascading (cascade-scheduler.ts for dependent date fields)
- Hierarchical/tree data (HierarchyStore for parent-child relationships)

### Other
- Undo/redo (FocusAwareUndoRouter, grid commands auto-tracked via CommandBus)
- CSV export (client-side, type-aware formatting, UTF-8 BOM, toolbar + bulk action entry points)
- Bulk action toolbar (ActionsBar.tsx with selection count, universal + module-specific actions)
- ARIA accessibility (aria-rowindex, aria-colindex, aria-label, data-testid, data-affordance)
- Dark mode support (canvas grid lines theme-aware)

## Competitive Comparison

### Parity Table

| Feature | Notion | Airtable | AG Grid | VIbeGrid |
|---------|:------:|:--------:|:-------:|:--------:|
| **Core**
| Table view + virtual scroll | Y | Y | Y | Y |
| Kanban view | Y | Y | Y | Y |
| Gantt/Timeline view | Y | Y | Y | Y |
| Calendar view | Y | Y | Y | **-** |
| Gallery/card view | Y | Y | - | **-** |
| Form view | Y | Y | - | **-** |
| **Data Controls**
| Multi-level sort | Y | Y | Y | Y |
| Multi-level filter (AND/OR) | Y | Y | Y | Y |
| Multi-level grouping + aggregations | Y | Y | Y | Y |
| Saved views | Y | Y | - | Y |
| Smart search | Y | Y | Y | Y |
| **Cell & Editing**
| Inline cell editing (13+ types) | Y | Y | Y | Y |
| Relationships (linked records) | Y | Y | - | Y |
| Rollups/computed fields | Y | Y | - | Y |
| Fill handle (drag-to-fill) | - | Y | Y | Y |
| Clipboard (type-aware paste) | Y | Y | Y | Y |
| Ghost row inline creation | - | Y | - | Y |
| Conditional formatting | Y | Y | Y | **-** |
| Cell comments/annotations | Y | Y | - | **-** |
| **Column & Row**
| Column resize | - | Y | Y | Y |
| Column reorder (drag) | - | Y | Y | Y |
| Column visibility | Y | Y | Y | Y |
| Row expansion / details | Y | Y | Y | Y |
| Row numbers | - | Y | Y | Y |
| Frozen/pinned columns | - | Y | Y | **-** |
| Column header groups | - | - | Y | **-** |
| **Selection & Interaction**
| Range select (drag-to-select) | - | Y | Y | Y |
| Context menus | Y | Y | Y | Y |
| Keyboard navigation | Y | Y | Y | Y |
| Undo/redo | Y | Y | Y | Y |
| Bulk actions toolbar | Y | Y | Y | Y |
| **Export**
| CSV export | Y | Y | Y | Y |
| Excel (.xlsx) export | Y | Y | Y | **-** |
| PDF export | Y | Y | Y | **-** |
| **Collaboration**
| Real-time multiplayer | Y | Y | - | **-** |
| **Performance**
| 60fps on 10k+ rows | - | Y | Y | Y |
| ARIA accessibility | - | - | Y | Y |

### Gap Analysis

#### High Priority (all 3 competitors have these)

| Gap | Impact | Notes |
|-----|--------|-------|
| **Calendar view** | Essential for date-heavy workflows | New ViewModeRegistry module needed |
| **Conditional formatting** | High-value data visualization (row/cell coloring by rules) | SlotRegistry already supports context-aware rendering; needs rule engine |
| **Excel (.xlsx) export** | Enterprise requirement for data sharing | Library needed (e.g., ExcelJS or SheetJS) |
| **PDF export** | Reporting/archival requirement | PdfGenerationService exists for docs; needs grid-specific layout |

#### Medium Priority (2 of 3 competitors)

| Gap | Who Has It | Notes |
|-----|-----------|-------|
| **Gallery/card view** | Notion, Airtable | Visual alternative to table; Kanban is closest but column-grouped |
| **Form view** | Notion, Airtable | Single-record entry/edit; VibeForm exists separately |
| **Frozen/pinned columns** | Airtable, AG Grid | Sticky first/last columns during horizontal scroll |
| **Real-time multiplayer** | Notion, Airtable | Documented as deferred (Yjs CRDT planned) |
| **Cell comments** | Notion, Airtable | Per-cell discussion threads; collab worker exists |
| **Server-side operations** | AG Grid | Currently all client-side; needed for very large datasets |
| **Print/page layout** | AG Grid | Print-friendly grid rendering |

#### Lower Priority (1 competitor only or nice-to-have)

| Gap | Who Has It | Notes |
|-----|-----------|-------|
| Pivot table / cross-tab | AG Grid | Power-user analytics |
| Sparklines / mini charts | AG Grid | In-cell data visualization |
| Column header groups | AG Grid | Multi-level column headers |
| Column/row spanning | AG Grid | Complex layout cells |
| Status bar with statistics | AG Grid | Sum/count in footer |
| Smart fill (pattern detection) | Airtable | "Jan, Feb" → continue series |

## Where VIbeGrid Exceeds Competitors

1. **Dual-layer cell rendering** — shell → rich upgrade during idle; no competitor does this
2. **Canvas grid lines** during scroll jumps — no flash/blank seen in competitors
3. **DataForge-native relationships** — tighter integration than Airtable's linked records (archetype-aware, relationship type resolution)
4. **SlotRegistry priority system** — pluggable domain-specific cell renderers with context filtering; more flexible than AG Grid's cell renderer factory
5. **Ghost row inline creation within groups** — Airtable-style but with group context awareness
6. **Type-aware paste validation** with cell-by-cell error tracking — prevents data corruption
7. **Saved views with live counts** — view presets show real-time row counts from liveQuery
8. **Multi-level grouping with rollup aggregations** — deeper than Notion, competitive with Airtable

## Positioning

VIbeGrid is **closer to Airtable than AG Grid** in product positioning. The core table engine is competitive with all three. The biggest gaps are:

1. **View modes** — calendar, gallery, form (alternative visualizations of the same data)
2. **Export formats** — Excel and PDF
3. **Visual data features** — conditional formatting
4. **Collaboration** — real-time multiplayer editing, cell comments

The missing pieces are not architectural blockers — ViewModeRegistry supports new view modules, SlotRegistry supports conditional rendering, and the collab worker exists for real-time features.

## Next Steps

- Calendar view and conditional formatting would close the most visible gaps
- Excel export is a common enterprise blocker
- Form view may already be partially addressed by VibeForm (separate system)
- Real-time multiplayer is deferred but architecturally planned (Yjs CRDT)
