---
paths: apps/web/src/systems/vibegrid/**/*
relatedFeatures:
  - vibegrid/data-controls
  - vibegrid/export-services
  - vibegrid/row-expansion
  - vibegrid/gantt
  - vibegrid/core
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

## Implementation Rules

1. **All mutations via CommandBus** — no direct API calls from view modules
2. **Real-time via EventBus** — no polling; use event-driven invalidation
3. **New view modes** — implement `GridModule`, register with `viewModeRegistry.register()`
4. **Cell renderers** — register via `SlotRegistry` only (FieldTypeRegistry has been removed)
5. **Row actions** — set `enableSelectionColumn={true}`, bulk handlers receive `(rowIds[], rowsData[])`
6. **Non-DataForge sources** — use `collectionOverride` + `skipDataFetching={true}`

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
| `modules/ViewModeRegistry.ts` | View mode registration + lazy loading |
| `slots/SlotRegistry.ts` | Unified cell renderer resolution |
| `stores/InteractionStore.ts` | UI state (selection, menus) |
| `stores/GanttViewStore.ts` | Gantt state |
| `utils/csv-export.ts` | CSV export utilities |
| `utils/cascade-scheduler.ts` | Date cascading |
