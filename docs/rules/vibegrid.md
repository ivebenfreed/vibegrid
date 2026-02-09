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
| Cell renderers (generic) | `systems/vibegrid/field-types/` |
| Cell renderers (domain) | `features/{domain}/schemas/` |
| Slot registrations | `systems/vibegrid/slots/` |
| Row interactions | `systems/vibegrid/processors/` |
| Column schemas | `features/{domain}/schemas/` |

## Implementation Rules

1. **All mutations via CommandBus** — no direct API calls from view modules
2. **Real-time via EventBus** — no polling; use event-driven invalidation
3. **New view modes** — implement `GridModule`, register with `viewModeRegistry.register()`
4. **Cell renderers** — register via `SlotRegistry` only (not FieldTypeRegistry)
5. **Row actions** — set `enableSelectionColumn={true}`, bulk handlers receive `(rowIds[], rowsData[])`
6. **Non-DataForge sources** — use `collectionOverride` + `skipDataFetching={true}`

## Anti-Patterns

- Adding view modes by editing VibeGrid.tsx switch → use ViewModeRegistry
- Registering cell renderers in 3 places → use SlotRegistry only
- Expansion/collapse logic in `features/` → should be grid primitive
- Direct API calls from view modules → use CommandBus
- Polling for data updates → use EventBus

## Key Files

| File | Purpose |
|------|---------|
| `VibeGrid.tsx` | Main component, module activation |
| `modules/ViewModeRegistry.ts` | View mode registration + lazy loading |
| `slots/SlotRegistry.ts` | Unified cell renderer resolution |
| `stores/InteractionStore.ts` | UI state (selection, menus) |
| `stores/GanttViewStore.ts` | Gantt state |
| `utils/cascade-scheduler.ts` | Date cascading |
| `processors/DependencyProcessor.ts` | Dependency CRUD |
