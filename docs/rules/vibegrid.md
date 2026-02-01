---
paths: apps/web/src/systems/vibegrid/**/*
relatedFeatures:
  - vibegrid/data-controls
  - vibegrid/export-services
  - vibegrid/row-expansion
  - vibegrid/gantt
  - vibegrid/core
  - vibegrid/modules
  - vibegrid/slots
---

# VibeGrid Core

High-performance data grid with MobX state, virtual scrolling, and modular view mode architecture.

**Location:** `apps/web/src/systems/vibegrid/`

## Architecture: Module Registry + Slot Registry (GH#1416)

VibeGrid uses two registries for extensibility:

1. **ViewModeRegistry** (`modules/ViewModeRegistry.ts`) — Pluggable view modes (Table, Kanban, Gantt, custom)
2. **SlotRegistry** (`slots/SlotRegistry.ts`) — Unified cell renderer resolution with priority-based overrides

View modes are `GridModule` implementations registered with the ViewModeRegistry. Cell renderers are `Slot` registrations resolved by the SlotRegistry. Both support lazy loading.

## Key Principle: Extend the Primitive

**Before implementing ANY grid functionality in `features/`, check if it should be a VibeGrid primitive.**

| Question | If YES | If NO |
|----------|--------|-------|
| Could other entities use this? | Build in `systems/vibegrid/` | OK for `features/` |
| Does it involve cell rendering? | Register via `SlotRegistry` | May be domain-specific |
| Does it involve a new view mode? | Implement `GridModule` interface | May not need VibeGrid |
| Does it involve row interaction? | Check existing processors first | May be domain-specific |

## Where Code Should Live

| Code Type | Location |
|-----------|----------|
| View mode modules | `systems/vibegrid/modules/{mode}/` |
| Cell renderers (generic) | `systems/vibegrid/field-types/` |
| Cell renderers (domain-specific) | `features/{domain}/schemas/` |
| Slot registrations | `systems/vibegrid/slots/` |
| Row interactions (generic) | `systems/vibegrid/processors/` |
| Column schemas | `features/{domain}/schemas/` |

## View Mode Modules (GridModule)

Each view mode implements the `GridModule` interface:

```typescript
interface GridModule {
  readonly id: string           // e.g., 'table', 'kanban', 'gantt'
  readonly displayName: string  // e.g., 'Table View'
  readonly icon?: string
  init?: (context: GridStoreContext) => void | (() => void)
  render: (props: VibeGridProps, context: GridStoreContext) => React.ReactElement
  registerSlots?: (slotRegistry: SlotRegistry) => void
}
```

**Registration:** Built-in modules register at import time in `modules/index.ts` (not App.tsx).

```typescript
// Register with lazy loading
viewModeRegistry.register('kanban',
  async () => (await import('./kanban/KanbanModule')).KanbanModule,
  { displayName: 'Kanban Board', icon: 'kanban' }
)
```

**Adding a custom view mode:** Implement `GridModule`, register with `viewModeRegistry.register()`.

## Slot Registry (Cell Rendering)

SlotRegistry replaces the old FieldTypeRegistry + ModularCellBridge + CellFactory layers.

**Resolution order:** context filter → exact fieldType match or canHandle() → priority (higher wins) → fallback to 'text'

**Priority levels:**

| Level | Priority | Use For |
|-------|----------|---------|
| View mode slots | 100 | Gantt bar renderer, Kanban card renderer |
| Domain slots | 50 | COI currency, project-specific renderers |
| Default slots | 0 | Built-in field types (text, number, date) |

**Domain slot registration:**
```typescript
slotRegistry.register({
  id: 'currency-abbreviated',
  priority: 50,
  contextFilter: (ctx) => ctx.entityType === 'Budget',
  renderer: () => new CurrencyAbbreviatedRenderer(),
})
```

## Critical Rules

1. **Row actions need selection column** - Set `enableSelectionColumn={true}`
2. **Bulk handlers receive arrays** - `(rowIds[], rowsData[])`
3. **Use `depends_on` relationship** - Via UnifiedRelationshipService
4. **Cascade on date changes** - `calculateCascadeUpdates()` propagates changes
5. **Cycle detection** - GraphService.detectCycles() prevents circular deps
6. **All mutations via CommandBus** - No direct API calls from view modules
7. **Real-time via EventBus** - No polling; use event-driven invalidation

## Dependency Types (Gantt)

| Type | Abbr | Meaning |
|------|------|---------|
| `finish_to_start` | FS | Predecessor finishes before successor starts (default) |
| `start_to_start` | SS | Predecessor starts before successor starts |
| `finish_to_finish` | FF | Predecessor finishes before successor finishes |
| `start_to_finish` | SF | Predecessor starts before successor finishes |

**Supported archetypes:** `project`, `task`, `activity`

## Non-DataForge Data Sources

Use `collectionOverride` for MobX stores or external APIs:
- Must implement: `{ items, count, insert?, update?, delete? }`
- Use `skipDataFetching={true}` to prevent DataForge API fetch
- Store `_originalData` for row actions

## Common Mistakes

- Adding view modes by editing VibeGrid.tsx switch (use ViewModeRegistry)
- Registering cell renderers in 3 places (use SlotRegistry only)
- Expansion/collapse logic in `features/` (should be grid primitive)
- Row interaction handlers in domain stores (grid should handle)
- Custom `Set<string>` for tracking row state in domain (use VibeGrid config)
- Direct API calls from view modules (use CommandBus)
- Polling for data updates (use EventBus)

## Key Files

| File | Purpose |
|------|---------|
| `VibeGrid.tsx` | Main component, module activation |
| `modules/GridModule.ts` | GridModule interface definition |
| `modules/ViewModeRegistry.ts` | View mode registration + lazy loading |
| `modules/table/TableModule.ts` | Table view module |
| `modules/kanban/KanbanModule.ts` | Kanban view module |
| `modules/gantt/GanttModule.ts` | Gantt view module |
| `slots/SlotRegistry.ts` | Unified cell renderer resolution |
| `components/ActionsBar.tsx` | Row actions UI |
| `stores/InteractionStore.ts` | UI state (selection, menus) |
| `stores/GanttViewStore.ts` | Gantt state |
| `utils/cascade-scheduler.ts` | Date cascading |
| `processors/DependencyProcessor.ts` | Dependency CRUD |
