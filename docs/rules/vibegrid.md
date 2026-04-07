---
paths: apps/web/src/systems/vibegrid/**/*
relatedPrimitive: vibegrid
---

# VibeGrid

> Concept, wireframes, and decision model: [`docs/primitives/vibegrid.md`](../../docs/primitives/vibegrid.md)

**Location:** `apps/web/src/systems/vibegrid/`

## Where Code Lives

| Code Type | Location |
|-----------|----------|
| View mode modules | `systems/vibegrid/modules/{mode}/` |
| Cell renderers (all) | `systems/vibegrid/slots/slot-initialization.ts` |
| Cell renderer types | `systems/vibegrid/field-types/types.ts` |
| Cell renderers (domain) | `features/{domain}/schemas/` |
| SlotRegistry | `systems/vibegrid/slots/SlotRegistry.ts` |
| Row interactions | `systems/vibegrid/processors/` |
| Cell action dispatch | `systems/vibegrid/routing/` |
| Interaction coordination | `systems/vibegrid/coordination/` |
| Inline edit overlays | `systems/vibegrid/overlays/` |
| Column schemas | `features/{domain}/schemas/` |

## Instance Scoping

All stores and SlotRegistry are **instance-scoped** per `<VibeGrid>` component (created fresh via React Context, not global singletons). Access stores via `useVibeGridStores()` hook. The only global singleton is `viewModeRegistry`.

## SlotRegistry Lifecycle

```
1. register()              — Register slots at startup (registerDefaultSlots + module.registerSlots)
2. preloadForColumns()     — Async: resolve + cache renderers for current columns (called by InitStore)
3. resolve()               — Sync: return cached renderer during render (throws if preload incomplete)
```

`preloadForColumns()` is called on mount, view mode change, and column change. `preloadReady` (MobX observable) gates cell rendering.

## Stores

All stores are instance-scoped per grid. Key stores:

| Store | Responsibility |
|-------|---------------|
| `TableCoreStore` | Data loading, sorting, filtering, grouping, processedRows |
| `VisualStateStore` | Column dimensions, layout geometry, sort/filter/group config |
| `InteractionStore` | Selection, hover, drag, menus, clipboard, expanded rows |
| `EditingStore` | Edit session lifecycle (start/commit/cancel), validation, blur policy |
| `ViewportStore` | Scroll position, viewport dimensions, visible row/column ranges |
| `InitStore` | Initialization coordinator, hydration progress, lifecycle |
| `PersistenceStore` | localStorage save/load (debounced, org-scoped keys) |
| `ViewModeStore` | Current view mode toggle (table/gantt/kanban) |
| `GanttViewStore` | Gantt zoom, bar positions, date field mapping |
| `KanbanViewStore` | Kanban grouping field, column ordering, card drag |
| `InlineCreationStore` | Ghost row inline creation within groups |
| `HierarchyStore` | Tree/master-detail hierarchy state |
| `FilterBuilderStore` | Advanced filter builder UI state |
| `MenuStateStore` | Context menu and header menu state |
| `DebugStore` | Performance metrics (enable via `localStorage.vibegrid_debug=true`) |

Bundle type: `VibeGridStores` in `stores/context.tsx`.

## Implementation Rules

1. **All mutations via CommandBus** — no direct API calls from view modules
2. **Real-time via EventBus** — no polling; use event-driven invalidation
3. **New view modes** — implement `GridModule`, register with `viewModeRegistry.register()`
4. **Cell renderers** — register via `SlotRegistry` only (FieldTypeRegistry has been removed)
5. **Row actions** — set `enableSelectionColumn={true}`, bulk handlers receive `(rowIds[], rowsData[])`
6. **Non-DataForge sources** — use `collectionOverride` + `skipDataFetching={true}`

## Touch & Pointer Events

Grid uses the **Pointer Events API** (not MouseEvent) for unified mouse + touch handling (GH#2200):

- `MouseController` → migrated to `pointerdown`/`pointermove`/`pointerup` with `setPointerCapture()`
- CSS: `touch-action: pan-y` on grid container, `touch-action: none` on drag handles
- `@media (hover: none)` rules in `affordances.css` for touch device affordances (larger targets, always-visible edit icons)

**Kanban view** uses `@dnd-kit` with dual sensors:
- `PointerSensor` — 8px activation distance (mouse)
- `TouchSensor` — 250ms hold activation delay (touch)

## Accessibility & Browser Automation

VIbeGrid emits ARIA attributes that agent-browser's `snapshot` reads natively:

| Attribute | Element | Purpose |
|-----------|---------|---------|
| `aria-rowindex` | rows | Row addressing (1-based, header=1) |
| `aria-colindex` | cells | Column addressing (1-based) |
| `aria-label` | cells | `"{Column}: {value}"` for snapshot readability |
| `aria-roledescription` | affordances | `"link"` (navigate) or `"editable cell"` (edit) |
| `data-testid` | cells | `cell-{rowId}-{colId}` for deterministic selection |
| `data-affordance` | interactive elements | `navigate`, `edit`, `none` |
| `aria-rowcount` / `aria-colcount` | grid | Total dimensions |

**Programmatic column scroll:**
```bash
# Scroll to column by ID (centers in viewport, syncs header)
agent-browser eval 'document.querySelector(".vibegridx-viewport").scrollToColumn("column_id")'
# Instant (no animation): scrollToColumn("column_id", "instant")
```

**Hiding pattern:** Use `opacity: 0` + `pointer-events: none` (NOT `display: none`) for hover-to-reveal elements. `display: none` removes elements from Chrome's accessibility tree entirely, breaking screen readers and agent-browser snapshot. `visibility: hidden` also hides from the a11y tree. Only `opacity: 0` keeps elements discoverable.

```css
/* CORRECT — stays in ARIA tree */
.hidden-until-hover {
  opacity: 0;
  pointer-events: none;
}
.hovered .hidden-until-hover {
  opacity: 1;
  pointer-events: auto;
}

/* WRONG — removed from ARIA tree */
.hidden-until-hover { display: none; }
.hidden-until-hover { visibility: hidden; }
```

## Anti-Patterns

- Adding view modes by editing VibeGrid.tsx switch → use ViewModeRegistry
- Registering cell renderers outside SlotRegistry → all renderers in `slots/slot-initialization.ts`
- Using FieldTypeRegistry, ModularCellBridge, or CellFactory → these are removed; SlotRegistry is sole system
- Inline rendering logic in column definitions → register via SlotRegistry
- Global slot overrides without contextFilter → scope by entityType or schemaId
- Expansion/collapse logic in `features/` → should be grid primitive
- Direct API calls from view modules → use CommandBus
- Polling for data updates → use EventBus
- Using `display: none` for hover-to-reveal elements → use `opacity: 0` (keeps ARIA tree intact)

## CSV Export

Client-side CSV export with two entry points, gated by `enableExport` prop (default `false`).

| Entry Point | Trigger | Rows Exported |
|-------------|---------|---------------|
| Toolbar button | `data-testid="toolbar-export-csv"` in header | All filtered rows (`processedRows`) |
| ActionsBar action | Bulk action on selected rows | Selected rows only |

**Utilities** (`utils/csv-export.ts`):
- `getExportableColumns(columns, visibility)` — excludes system columns (`selection`, `row-expand`, `row-number`, `row-actions`, `drag-handle`) and hidden columns
- `formatCellValue(value, column)` — type-aware formatting for all `CellType` variants
- `rowsToCSV(rows, columns)` — filters to `type==='data'` rows, prepends UTF-8 BOM
- `downloadCSV(csv, filename)` — Blob + hidden anchor click
- Filename pattern: `{entityType}-export-YYYY-MM-DD.csv`

**Integration points:**
- `VibeGrid.tsx` — `enableExport` prop, `handleExportAll`, `handleRowAction` intercepts `export-csv`
- `VibeGridXHeaderPure.tsx` — toolbar export button, disabled during `isIncrementalProcessing`
- `ActionsBar.tsx` — `preserveSelection` on export action keeps selection after export

**Tests:** `utils/__tests__/csv-export.test.ts` (60 tests)

## Undo/Redo Integration

VibeGrid registers as an undo-capable surface via `FocusAwareUndoRouter`. When the grid has focus, Ctrl+Z/Ctrl+Shift+Z routes to grid-specific undo history. Entity mutations through the grid use `CommandBus.execute()` which automatically tracks undo state.

## Key Files

| File | Purpose |
|------|---------|
| `VibeGrid.tsx` | Main component, module activation |
| `modules/ViewModeRegistry.ts` | View mode registration + lazy loading (global singleton) |
| `modules/GridModule.ts` | View module interface (id, render, init, registerSlots) |
| `slots/SlotRegistry.ts` | Unified cell renderer resolution (instance-scoped) |
| `slots/slot-initialization.ts` | All 27+ built-in CellRenderer registrations |
| `stores/context.tsx` | `VibeGridStores` bundle + `useVibeGridStores()` hook |
| `stores/TableCoreStore.ts` | Data state (rows, sort, filter, group, processedRows) |
| `stores/VisualStateStore.ts` | Column layout, geometry, visual config |
| `stores/InteractionStore.ts` | UI state (selection, menus, expansion) |
| `stores/EditingStore.ts` | Cell edit session lifecycle |
| `stores/ViewportStore.ts` | Scroll position, visible ranges |
| `stores/InitStore.ts` | Grid initialization coordinator |
| `utils/csv-export.ts` | CSV export utilities |
| `utils/cascade-scheduler.ts` | Date cascading |
