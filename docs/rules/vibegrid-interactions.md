---
paths: apps/web/src/systems/vibegrid/**/*
relatedFeatures:
  - vibegrid/core
  - vibegrid/gantt
---

# VibeGrid Interactions

Patterns for expandable rows, custom field types, and event handling.

## Key Concepts

| Concept | Description |
|---------|-------------|
| Custom Field Type | Domain-specific cell renderer via fieldTypeRegistry |
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

## Custom Field Types

**Pattern:** Register with fieldTypeRegistry for domain-specific rendering

```typescript
fieldTypeRegistry.registerFieldType({
  typeName: 'currency-abbreviated',
  renderer: new CurrencyAbbreviatedRenderer(),
  affordances: ['sortable', 'filterable'],
})
```

**Directory structure:**
```
features/{domain}/
├── schemas/{entity}-field-types.ts  # Custom renderers
├── schemas/{entity}-schema.ts       # Column definitions
└── styles/{entity}-grid.css         # Grid styles
```

**Anti-pattern:** Inline rendering logic in column definitions

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
| `systems/vibegrid/field-types/FieldTypeRegistry.ts` | Field type registration |
| `systems/vibegrid/column-types.ts` | BaseCellType union |
| `systems/vibegrid/components/ExpandedContentPortals.tsx` | React portal bridge for row expansion |
| `systems/vibegrid/processors/RowExpansionProcessor.ts` | Expansion state and data loading |
| `features/coi/components/COIList.tsx` | Example: Custom expanded content rendering |
