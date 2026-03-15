---
paths: apps/web/src/systems/vibegrid/**/*
relatedFeatures:
  - vibegrid/data-controls
  - vibegrid/export-services
  - vibegrid/row-expansion
  - vibegrid/gantt
  - vibegrid/core
---

# VibeGrid Interactions

Conventions for cell renderers, row expansion, and view module slots.

> For detailed API patterns and TypeScript examples, see module docs: `docs/modules/vibegrid/core/core.md`

## Cell Renderer Registration

| What | Where |
|------|-------|
| Built-in renderers (27 classes) | `systems/vibegrid/slots/slot-initialization.ts` |
| Domain-specific renderers | `features/{domain}/schemas/{entity}-field-types.ts` |
| View mode renderers | `systems/vibegrid/modules/{mode}/` via `GridModule.registerSlots()` |
| SlotRegistry (resolution engine) | `systems/vibegrid/slots/SlotRegistry.ts` |

**Priority:** view mode (100) > domain (50) > default (0)

**SlotRegistry is the sole cell rendering system.** FieldTypeRegistry, ModularCellBridge, and CellFactory have been removed.

**CellRendererContext** fields used for slot resolution:
- `viewMode` — current view mode (table, kanban, gantt)
- `entityType` — entity type being rendered (e.g., 'Project')
- `schemaId` — schema ID for custom entities
- `organizationId` — for multi-tenant renderer isolation

Cache key: `fieldType::columnId::entityType::schemaId::viewMode::organizationId`. `gridId` is NOT included (renderers don't vary per grid instance).

## Row Expansion

| What | Where |
|------|-------|
| Expansion state + data loading | `systems/vibegrid/processors/RowExpansionProcessor.ts` |
| DOM-to-React portal bridge | `systems/vibegrid/components/ExpandedContentPortals.tsx` |
| Expand/collapse button | `RowExpandFieldType` in `slots/slot-initialization.ts` |
| Config prop | `rowExpansionConfig` on `VibeGrid` component |
| Example usage | `features/coi/components/COIList.tsx` |

Configure via `rowExpansionConfig` prop. State managed by `InteractionStore` (expandedRowIds, expandedRowStates). DOM containers created by `BodyRenderer`, React content injected via `MutationObserver` + portals.

## Directory Structure

```
systems/vibegrid/
├── modules/{mode}/         # View mode implementations (GridModule)
├── slots/SlotRegistry.ts   # Unified cell renderer resolution (instance-scoped)
├── slots/slot-initialization.ts  # All 27+ built-in CellRenderer classes
├── stores/                 # 13 MobX stores (all instance-scoped per grid)
│   ├── context.ts          # VibeGridStores bundle + useVibeGridStores() hook
│   ├── TableCoreStore.ts   # Data state (rows, sort, filter, group)
│   ├── VisualStateStore.ts # Column layout, geometry, visual config
│   ├── InteractionStore.ts # Selection, hover, drag, menus, expansion
│   ├── EditingStore.ts     # Cell edit session lifecycle
│   └── ViewportStore.ts    # Scroll position, visible ranges
├── processors/             # Row interaction processors
├── renderers/              # DOM rendering (BodyRenderer, RenderScheduler)
└── components/             # React bridges (ExpandedContentPortals, etc.)

features/{domain}/
├── schemas/{entity}-field-types.ts  # Domain slot registrations
├── schemas/{entity}-schema.ts       # Column definitions
└── styles/{entity}-grid.css         # Grid styles
```

## Anti-Patterns

- Inline rendering logic in column definitions → register via SlotRegistry
- Registering renderers in multiple places → all through SlotRegistry
- Global slot overrides without contextFilter → scope by entityType or schemaId
- Using FieldTypeRegistry, ModularCellBridge, or CellFactory → these are removed
