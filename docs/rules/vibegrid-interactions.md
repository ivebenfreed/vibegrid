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

## Expandable Nested Tables

> ⚠️ **TECH DEBT:** Domain-specific pattern - should be generic primitive (GH#1240)

**Pattern:** Row expansion with lazy-loaded nested table

1. Add `row-expand` column with `cellType: 'row-expand'`
2. Track expansion state in MobX store (`expandedRows: Set<string>`)
3. Lazy load child data on expand (`if (!cached) fetchData()`)
4. Use event delegation for expand/collapse clicks
5. Pass `renderExpandedRow` prop to VibeGrid

**When to use:** One-to-many relationships, detail breakdowns

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

## Key Files

| File | Purpose |
|------|---------|
| `systems/vibegrid/field-types/FieldTypeRegistry.ts` | Field type registration |
| `systems/vibegrid/column-types.ts` | BaseCellType union |
| `features/coi/schemas/coi-field-types.ts` | Example custom types |
