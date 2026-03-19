---
paths: apps/web/src/systems/vibegrid/**/*
relatedPrimitive: vibegrid
---

# VibeGrid Interactions

Conventions for cell renderers, row expansion, and view module slots.

> For detailed behavior docs and TypeScript examples, see primitive behaviors: `docs/primitives/vibegrid/`

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
│   ├── context.tsx         # VibeGridStores bundle + useVibeGridStores() hook
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

## Behavior Documentation

| Feature | Doc | Key Behaviors |
|---------|-----|---------------|
| Cell editing | `docs/primitives/vibegrid/editing.md` | Start/commit/cancel, blur policy, 17 editor types, undo/redo |
| Column interactions | `docs/primitives/vibegrid/column-interactions.md` | Resize, reorder, context menu, row drag, bulk actions |
| Clipboard & fill | `docs/primitives/vibegrid/clipboard.md` | Copy/paste with type validation, fill handle |
| Core grid | `docs/primitives/vibegrid/core.md` | Render, sort, select, keyboard nav, inline creation |
| Data controls | `docs/primitives/vibegrid/data-controls.md` | Search, filtering, grouping, presets |
| Row expansion | `docs/primitives/vibegrid/row-expansion.md` | Expand/collapse, lazy loading, portal bridge |
| Gantt | `docs/primitives/vibegrid/gantt.md` | Timeline, zoom, task bars, dependencies |
| Export | `docs/primitives/vibegrid/export-services.md` | CSV, PDF, ZIP export |

## Cell Renderer DOM Contract

Two-attribute system for cell interaction:

| Attribute | Purpose | Placement | Read By |
|-----------|---------|-----------|---------|
| `data-affordance` | CSS cursor (pointer/default) | Container element | `affordances.css` cursor rules |
| `data-action` | Click routing + CSS hover effects | Interactive child elements | `CellActionRouter` + `affordances.css` hover selectors |

**Rules for new renderers:**

1. **Container** gets `data-affordance` via `applyAffordanceAttrs()` — never set `data-action` on containers
2. **Interactive children** (text spans, badges, icons) get `data-action="edit"`, `data-action="navigate"`, or `data-action="toggle"`
3. **Content-click renderers** (`editTrigger: 'content-click'`) MUST have at least one descendant with `data-action` when editable — dev-mode warning fires otherwise
4. `applyAffordanceAttrs()` auto-wraps bare textContent in a `<span data-action="edit">` for content-click renderers
5. `renderEmpty()` produces `<span data-action="edit" data-affordance-role="content">Edit ✏️</span>`

**Example DOM (content-click Text cell):**
```html
<td data-affordance="edit" data-affordance-group="editable-content" data-editable="true">
  <span data-action="edit" data-affordance-role="content">Cell value</span>
</td>
```

**Example DOM (EntityName with navigate + edit):**
```html
<div data-affordance="navigate" data-affordance-group="link-with-edit-icon" data-editable="true">
  <span data-action="navigate" data-affordance-role="link">Project Name</span>
  <span data-action="edit" data-affordance-role="icon">✏️</span>
</div>
```

## Anti-Patterns

- Inline rendering logic in column definitions → register via SlotRegistry
- Registering renderers in multiple places → all through SlotRegistry
- Global slot overrides without contextFilter → scope by entityType or schemaId
- Using FieldTypeRegistry, ModularCellBridge, or CellFactory → these are removed
- Using `data-affordance` on child elements for routing → use `data-action` (GH#2008)
- Setting `data-action` on container elements → `data-action` is for children only
