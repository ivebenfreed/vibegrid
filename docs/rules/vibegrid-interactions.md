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

# VibeGrid Interactions

Patterns for expandable rows, custom cell renderers, view module slots, and event handling.

## Key Concepts

| Concept | Description |
|---------|-------------|
| Slot Registration | Cell renderer registered via SlotRegistry with priority + context filter |
| View Module Slots | View modes register custom slots via `registerSlots()` hook |
| Expandable Row | Row expansion with lazy-loaded nested data |
| Event Delegation | Parent handles clicks (no per-row listeners) |

## Generic Row Expansion

**Pattern:** VibeGrid's built-in row expansion system with React portal rendering.

Configure via `rowExpansionConfig` prop:

```typescript
const rowExpansionConfig: RowExpansionConfig = {
  enabled: true,
  allowMultiple: true,
  expandedContentHeight: 200,
  loadExpandedData: async (rowId: string, rowData: unknown) => {
    // Async data loading for expanded content
    return await fetchChildData(rowId)
  },
  renderExpandedContent: (props: ExpandedContentProps) => {
    // Custom React rendering for expanded content
    return <YourCustomComponent {...props} />
  },
}
```

**How it works:**

1. **Expansion state** - Managed by `InteractionStore` (expandedRowIds, expandedRowStates)
2. **DOM rendering** - `BodyRenderer` creates `.vibegridx-expanded-content-container` DOM elements
3. **React portals** - `ExpandedContentPortals` component uses `MutationObserver` to detect containers and render React content via portals
4. **Data loading** - `loadExpandedData` called on expand, results cached in `expandedRowStates`

**Key components:**

- `RowExpansionProcessor` - Handles expansion state and data loading
- `ExpandedContentPortals` - Bridges DOM containers to React rendering
- `RowExpandFieldType` - Renders expand/collapse buttons in cells

**When to use:** One-to-many relationships, detail breakdowns, inline editing

## Custom Cell Renderers (via SlotRegistry)

**Pattern:** Register with SlotRegistry for domain-specific or view-specific rendering.

SlotRegistry replaces the old FieldTypeRegistry + ModularCellBridge + CellFactory layers.

**Domain-specific renderer:**
```typescript
slotRegistry.register({
  id: 'currency-abbreviated',
  priority: 50,
  contextFilter: (ctx) => ctx.entityType === 'Budget',
  renderer: () => new CurrencyAbbreviatedRenderer(),
  affordances: { sortable: true, filterable: true },
})
```

**View mode renderer (via GridModule.registerSlots):**
```typescript
// Inside a GridModule implementation
registerSlots: (slotRegistry) => {
  slotRegistry.register({
    id: 'gantt-bar',
    priority: 100,
    contextFilter: (ctx) => ctx.viewMode === 'gantt',
    renderer: () => new GanttBarRenderer(),
  })
}
```

**Priority levels:** view mode (100) > domain (50) > default (0)

**Directory structure:**
```
systems/vibegrid/
├── modules/{mode}/         # View mode implementations (GridModule)
├── slots/SlotRegistry.ts   # Unified cell renderer resolution
├── field-types/            # Built-in field type renderers
└── processors/             # Row interaction processors

features/{domain}/
├── schemas/{entity}-field-types.ts  # Domain slot registrations
├── schemas/{entity}-schema.ts       # Column definitions
└── styles/{entity}-grid.css         # Grid styles
```

**Anti-patterns:**
- Inline rendering logic in column definitions
- Registering renderers in multiple places (use SlotRegistry only)
- Global slot overrides without contextFilter (use entityType or schemaId scoping)

## MutationObserver Pattern for DOM-React Bridge

**Context:** When VibeGrid uses DOM-based rendering but you need to inject React components.

**Pattern:** Use `MutationObserver` to watch for DOM container creation, then use React portals.

```typescript
const mutationObserver = new MutationObserver((mutations) => {
  const hasRelevantMutation = mutations.some((mutation) => {
    if (mutation.type === 'childList') {
      return Array.from(mutation.addedNodes).some(
        (node) => node instanceof HTMLElement &&
                 node.classList.contains('target-container')
      )
    }
    if (mutation.type === 'attributes' && mutation.attributeName === 'data-has-data') {
      return true
    }
    return false
  })

  if (hasRelevantMutation) {
    updatePortals() // Find containers and create portals
  }
})

mutationObserver.observe(container, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ['data-has-data'],
})
```

**Why:** Allows DOM-based rendering for performance while supporting rich React components where needed.

## Key Files

| File | Purpose |
|------|---------|
| `systems/vibegrid/slots/SlotRegistry.ts` | Unified cell renderer resolution |
| `systems/vibegrid/modules/GridModule.ts` | View module interface (includes registerSlots) |
| `systems/vibegrid/column-types.ts` | BaseCellType union |
| `systems/vibegrid/components/ExpandedContentPortals.tsx` | React portal bridge for row expansion |
| `systems/vibegrid/processors/RowExpansionProcessor.ts` | Expansion state and data loading |
| `features/coi/components/COIList.tsx` | Example: Custom expanded content rendering |
