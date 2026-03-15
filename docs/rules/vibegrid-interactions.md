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
├── slots/SlotRegistry.ts   # Unified cell renderer resolution
├── slots/slot-initialization.ts  # All built-in CellRenderer classes
├── field-types/types.ts    # Type definitions (EnhancedColumn, etc.)
├── processors/             # Row interaction processors
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
