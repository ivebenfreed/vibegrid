---
paths: apps/web/src/systems/vibegrid/**/*
alwaysApply: false
relatedFeatures:
  - vibegrid/core
  - vibegrid/data-controls
  - vibegrid/export-services
  - vibegrid/gantt
---

# VibeGrid Interactions

Patterns for interactive VibeGrid features including expandable rows, custom field types, and event handling.

## Overview

VibeGrid supports rich interactions beyond basic table display. This document covers patterns for expandable nested tables, custom cell renderers, and domain-specific field type implementations.

## Key Concepts

| Concept | Description |
|---------|-------------|
| Custom Field Type | Domain-specific cell renderer registered with fieldTypeRegistry |
| Expandable Row | Parent row that expands to show child entity details in nested table |
| Cell Type Override | Column-level override to use custom renderer for specific field |
| Event Delegation | Parent table handles click events for child cells (expand/collapse) |
| Lazy Loading | Child data loaded on-demand when parent row expands |

## Patterns

### Pattern 1: Expandable Nested Tables (Added 2026-01-15)

> ⚠️ **TECHNICAL DEBT WARNING:** This pattern documents a domain-specific implementation that should have been a generic VibeGrid primitive. See GH#1240 for the refactor to move this to `systems/vibegrid/`. When GH#1240 is complete, use the generic approach instead.
>
> **Before implementing row expansion:** Check `.claude/rules/vibegrid.md` → "Decision Checklist" to determine if your use case should be generic.

**Context:** Display one-to-many relationships in-line without navigating away (e.g., COI → Coverages)

**Pattern:** Row expansion with lazy-loaded nested table component

**Implementation:**

**Step 1: Add row-expand column to parent entity**

```typescript
// apps/web/src/features/coi/schemas/coi-schema.ts
export const coiColumns: EnhancedColumn[] = [
  {
    id: 'expand',
    field: 'expand',
    name: '',
    cellType: 'row-expand', // Custom cell type
    width: 40,
    frozen: true,
    sortable: false,
  },
  // ... other columns
]
```

**Step 2: Track expansion state in store**

```typescript
// apps/web/src/features/coi/stores/COIStore.ts
export class COIStore {
  @observable expandedCOIs = new Set<string>() // Track which rows are expanded
  @observable coverageData = new Map<string, COICoverage[]>() // Cache child data
  @observable loadingCoverages = new Set<string>() // Track loading states

  @action
  async toggleExpanded(coiId: string) {
    if (this.expandedCOIs.has(coiId)) {
      this.expandedCOIs.delete(coiId)
    } else {
      this.expandedCOIs.add(coiId)

      // Lazy load child data if not cached
      if (!this.coverageData.has(coiId)) {
        this.loadingCoverages.add(coiId)
        const coverages = await this.fetchCoverages(coiId)
        this.coverageData.set(coiId, coverages)
        this.loadingCoverages.delete(coiId)
      }
    }
  }
}
```

**Step 3: Create custom field type for expand button**

```typescript
// apps/web/src/features/coi/schemas/coi-field-types.ts
class RowExpandRenderer implements CellRenderer {
  render(value: any, column: EnhancedColumn, rowData: any): HTMLElement {
    const button = document.createElement('button')
    button.className = 'coi-expand-button'
    button.dataset.action = 'expand-toggle' // For event delegation
    button.dataset.coiId = rowData.id

    const isExpanded = store.expandedCOIs.has(rowData.id)
    button.innerHTML = isExpanded
      ? '<svg>...</svg>' // Down chevron
      : '<svg>...</svg>' // Right chevron

    return button
  }
}

// Register field type
fieldTypeRegistry.registerFieldType({
  typeName: 'row-expand',
  baseCellType: 'row-expand',
  renderer: new RowExpandRenderer(),
  // ... other config
})
```

**Step 4: Create nested table component**

```typescript
// apps/web/src/features/coi/components/COICoverageTable.tsx
export const COICoverageTable = observer(function COICoverageTable({
  coverages,
  isLoading
}: COICoverageTableProps) {
  if (isLoading) {
    return <div>Loading coverage details...</div>
  }

  return (
    <div className="coi-coverage-row">
      <table className="coi-coverage-table">
        <thead>
          <tr>
            <th>Coverage Type</th>
            <th>Insurer</th>
            <th>Policy #</th>
            <th>Effective</th>
            <th>Expiration</th>
            <th>Primary Limit</th>
            <th>Aggregate</th>
          </tr>
        </thead>
        <tbody>
          {coverages.map(coverage => (
            <tr key={coverage.id}>
              <td>{coverage.coverage_type}</td>
              {/* ... other cells */}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
})
```

**Step 5: Handle expand/collapse via event delegation**

```typescript
// apps/web/src/features/coi/components/COIList.tsx
export const COIList = observer(function COIList() {
  const handleGridClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement

    // Event delegation pattern - check for expand button click
    const expandButton = target.closest('[data-action="expand-toggle"]')
    if (expandButton) {
      const coiId = expandButton.getAttribute('data-coi-id')
      if (coiId) {
        coiStore.toggleExpanded(coiId)
      }
    }
  }, [])

  return (
    <div onClick={handleGridClick}>
      <VibeGrid
        columns={coiColumns}
        data={coiStore.cois}
        expandedRows={coiStore.expandedCOIs}
        renderExpandedRow={(rowData) => {
          const coverages = coiStore.coverageData.get(rowData.id) || []
          const isLoading = coiStore.loadingCoverages.has(rowData.id)
          return <COICoverageTable coverages={coverages} isLoading={isLoading} />
        }}
      />
    </div>
  )
})
```

**Step 6: Add cell type to VibeGrid type system**

```typescript
// apps/web/src/systems/vibegrid/column-types.ts
export type BaseCellType =
  | 'text'
  | 'number'
  | 'boolean'
  // ... other types
  | 'row-expand' // New type for expandable rows
```

**Why this works:**
- **Lazy loading** - Child data only fetched when row expands (performance)
- **Event delegation** - Parent handles clicks, no per-row listeners (memory efficient)
- **State management** - MobX tracking ensures UI updates on expand/collapse
- **Reusable** - Pattern works for any one-to-many relationship

**When to use:**
- One-to-many relationships where child records are important but not always needed
- Displaying detailed breakdowns (e.g., invoice line items, coverage details, task subtasks)
- Avoiding separate detail pages for simple child data

**Learned from:** GH#1236 COI List View implementation (2026-01-15)

---

### Pattern 2: Domain-Specific Custom Field Types (Added 2026-01-15)

**Context:** Need specialized rendering for domain-specific data (currency abbreviation, compliance badges, etc.)

**Pattern:** Register custom field types with fieldTypeRegistry for reuse across grids

**Directory Structure:**

```
apps/web/src/features/{domain}/
├── schemas/
│   ├── {entity}-schema.ts        # Column definitions using custom field types
│   └── {entity}-field-types.ts   # Custom field type implementations
└── styles/
    └── {entity}-grid.css          # Grid-specific styles
```

**Implementation:**

**Step 1: Create field type implementations**

```typescript
// apps/web/src/features/coi/schemas/coi-field-types.ts

// Import grid styles
import '../styles/coi-grid.css'

import type {
  CellRenderer,
  EnhancedColumn,
  VibeGridFieldType,
} from '@/systems/vibegrid/field-types/FieldTypeRegistry'
import { fieldTypeRegistry } from '@/systems/vibegrid/field-types/FieldTypeRegistry'

/**
 * Currency Abbreviated Field Type
 * Shows "$1M" with "$1,000,000" tooltip on hover
 */
class CurrencyAbbreviatedRenderer implements CellRenderer {
  render(value: any, column: EnhancedColumn, rowData: any): HTMLElement {
    const container = document.createElement('span')
    const numValue = parseCurrencyValue(value)

    if (numValue == null) {
      container.className = 'vibegridx-cell-empty'
      container.textContent = '—'
      return container
    }

    container.className = 'vibegridx-cell-currency-abbr'
    container.style.textAlign = 'right'
    container.textContent = formatCurrencyAbbreviated(numValue) // "$1M"
    container.title = formatCurrencyFull(numValue) // "$1,000,000"

    return container
  }
}

// Register with fieldTypeRegistry
fieldTypeRegistry.registerFieldType({
  typeName: 'currency-abbreviated',
  baseCellType: 'currency-abbreviated',
  renderer: new CurrencyAbbreviatedRenderer(),
  formatter: (value) => formatCurrencyAbbreviated(parseCurrencyValue(value)),
  parser: (value) => parseCurrencyValue(value),
  affordances: ['sortable', 'filterable'],
  defaultWidth: 100,
  defaultAlignment: 'right',
})
```

**Step 2: Use custom field type in column definitions**

```typescript
// apps/web/src/features/coi/schemas/coi-schema.ts
export const coiColumns: EnhancedColumn[] = [
  {
    id: 'gl_primary_limit',
    field: 'gl_primary_limit',
    name: 'GL Limit',
    cellType: 'currency-abbreviated', // Uses registered custom field type
    width: 100,
  },
  {
    id: 'additional_insured',
    field: 'additional_insured',
    name: 'Add\'l Insured',
    cellType: 'additional-insured', // Another custom type
    width: 110,
  },
]
```

**Step 3: Add custom styles**

```css
/* apps/web/src/features/coi/styles/coi-grid.css */
.vibegridx-cell-currency-abbr {
  font-variant-numeric: tabular-nums;
  font-weight: 500;
}

.coi-badge-additional-insured {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
}

.coi-badge-additional-insured--yes {
  background: #dcfce7;
  color: #166534;
}
```

**Why this works:**
- **Reusable** - Register once, use across all VibeGrid instances
- **Type-safe** - fieldTypeRegistry validates field type configs
- **Auto-discovery** - VibeGrid column generation finds registered types
- **Co-located** - Field types, schemas, and styles live together in feature directory

**When to use:**
- Domain-specific formatting (compliance badges, status indicators, custom dates)
- Specialized interactions (tooltips, color coding, badges)
- Reusable patterns within a domain (all COI grids use same field types)

**Anti-pattern:**
```typescript
// BAD: Inline rendering logic in column definitions
{
  id: 'gl_primary_limit',
  field: 'gl_primary_limit',
  name: 'GL Limit',
  cellType: 'number',
  formatter: (value) => { /* complex currency abbreviation logic */ }
}
```

**Learned from:** GH#1236 COI List View implementation (2026-01-15)

---

## Key Files

**VibeGrid System:**
- `apps/web/src/systems/vibegrid/field-types/FieldTypeRegistry.ts` - Field type registration system
- `apps/web/src/systems/vibegrid/column-types.ts` - BaseCellType union (add new types here)
- `apps/web/src/systems/vibegrid/types.ts` - Column interface with cellType override

**Example Implementations:**
- `apps/web/src/features/coi/schemas/coi-field-types.ts` - Custom field types (currency-abbreviated, additional-insured, expiration-date, row-expand)
- `apps/web/src/features/coi/components/COICoverageTable.tsx` - Nested table component for expanded rows
- `apps/web/src/features/coi/stores/COIStore.ts` - Expansion state management

## Related Rules

- [VibeGrid](vibegrid.md) - Core VibeGrid patterns
- [MobX State](mobx-state.md) - Store patterns for expansion state
- [DataForge Relationships](dataforge-relationships.md) - One-to-many relationships displayed in nested tables

## Learned From

- **GH#1236 implementation session** (2026-01-15) - Expandable nested tables, domain-specific custom field types
- **GH#1236 post-implementation review** (2026-01-15) - Identified that row expansion should be generic VibeGrid primitive, not domain-specific. Created GH#1240 to track refactor. Added Decision Checklist to `vibegrid.md` to prevent this mistake.
