---
paths: apps/web/src/systems/vibegrid/**/*
relatedFeatures:
  - vibegrid/core
  - vibegrid/data-controls
  - vibegrid/export-services
  - vibegrid/gantt
---

# VibeGrid Core

High-performance data grid with MobX state, virtual scrolling, and Gantt support.

**Location:** `apps/web/src/systems/vibegrid/`

## Key Principle: Extend the Primitive

**Before implementing ANY grid functionality in `features/`, check if it should be a VibeGrid primitive.**

### Decision Checklist

Ask these questions before writing domain-specific grid code:

| Question | If YES | If NO |
|----------|--------|-------|
| Could other entities use this? | Build in `systems/vibegrid/` | OK for `features/` |
| Does it involve cell rendering? | Check `fieldTypeRegistry` first | May be domain-specific |
| Does it involve row interaction? | Check existing processors first | May be domain-specific |
| Is it about data display patterns? | Likely belongs in VibeGrid | OK for domain code |

### Where Code Should Live

| Code Type | Location | Examples |
|-----------|----------|----------|
| Cell renderers (generic) | `systems/vibegrid/field-types/` | currency, date, badge |
| Cell renderers (domain-specific display) | `features/{domain}/schemas/` | COI-specific badges |
| Row interactions (generic) | `systems/vibegrid/processors/` | grouping, expansion, selection |
| Row interactions (domain-specific) | **RECONSIDER** - likely generic | - |
| Column schemas | `features/{domain}/schemas/` | coi-schema.ts |
| Grid state | `systems/vibegrid/` or domain store | Depends on scope |

### Red Flags: Code in Wrong Place

Stop and reconsider if you're writing:

1. **Expansion/collapse logic in `features/`** - This is a grid primitive
2. **Row interaction handlers in domain stores** - Grid should handle this
3. **Custom Set<string> for tracking row state in domain** - Use VibeGrid config
4. **Lazy loading triggered by domain code** - Should be grid callback

## Architecture

```
VibeGrid System
├── field-types/           # Cell type registry
│   └── FieldTypeRegistry.ts
├── processors/            # Data transformation
│   ├── GroupProcessor.ts  # Row grouping
│   ├── SortProcessor.ts   # Sorting
│   └── FilterProcessor.ts # Filtering
├── renderers/             # UI rendering
│   ├── GridRenderer.ts    # Main grid
│   └── components/        # Sub-components
└── types.ts               # Type definitions
```

## Extension Points

### 1. Custom Field Types

For domain-specific DISPLAY (not interaction):

```typescript
// features/{domain}/schemas/{entity}-field-types.ts
import { fieldTypeRegistry } from '@/systems/vibegrid/field-types/FieldTypeRegistry'

fieldTypeRegistry.register('my-custom-type', {
  type: 'my-custom-type',
  category: 'basic',
  renderer: new MyCustomRenderer(),
  // ...
})
```

### 2. Column Schemas

Define entity columns in feature:

```typescript
// features/{domain}/schemas/{entity}-schema.ts
export const myEntityColumns: EnhancedColumn[] = [
  { id: 'name', field: 'name', name: 'Name', cellType: 'text' },
  { id: 'status', field: 'status', name: 'Status', cellType: 'my-custom-type' },
]
```

### 3. Grid Configuration (NOT domain stores)

Configure grid behavior through VibeGrid config, not domain state:

```typescript
// GOOD: Grid-level configuration
<VibeGrid
  columns={columns}
  data={data}
  config={{
    expandable: true,
    onRowExpand: (rowId) => loadChildData(rowId),
    renderExpandedContent: (row) => <ChildTable data={row.children} />,
  }}
/>

// BAD: Domain store managing grid state
class MyDomainStore {
  @observable expandedRows = new Set<string>()  // ❌ Should be in grid
}
```

---

## Row Actions (ActionsBar)

Bottom-pinned floating bar appears when rows selected via selection column.

**Props:**
```typescript
interface VibeGridProps {
  rowActions?: RowAction[]
  onRowAction?: (actionId: string, rowIds: string[], rowsData: any[]) => Promise<void>
  enableDelete?: boolean
  onDelete?: (rowIds: string[], rowsData: any[]) => Promise<void>
  deleteConfirmation?: (rowsData: any[]) => string | React.ReactNode
}

interface RowAction {
  id: string
  label: string
  icon?: React.ComponentType<{ className?: string }>
  onClick?: (rowData: any) => Promise<void>
  destructive?: boolean  // Red styling + confirmation dialog
  hidden?: (rowData: any) => boolean
}
```

**Usage:**
```typescript
<VibeGrid
  tableId="users"
  entityType="PlatformUser"
  enableSelectionColumn={true}
  enableDelete={true}
  onDelete={async (rowIds) => await deleteUsers(rowIds)}
  deleteConfirmation={(rows) => `Delete ${rows.length} user(s)?`}
/>
```

**Key files:** `components/ActionsBar.tsx`, `stores/InteractionStore.ts` (rowActionMenuState)

## Dependencies & Gantt

### 4 Dependency Types (DependencyProcessor.ts:22-26)

| Type | Abbr | Meaning |
|------|------|---------|
| `finish_to_start` | FS | Predecessor finishes before successor starts (default) |
| `start_to_start` | SS | Predecessor starts before successor starts |
| `finish_to_finish` | FF | Predecessor finishes before successor finishes |
| `start_to_finish` | SF | Predecessor starts before successor finishes |

### DependencyProcessor API

```typescript
// CRUD via UnifiedRelationshipService with 'depends_on' type
createDependency(kysely, orgId, userId, { sourceId, targetId, dependencyType, leadLagDays? })
getDependencies(kysely, orgId, entityId)
getPredecessors(kysely, orgId, entityId)   // Tasks that must complete first
getSuccessors(kysely, orgId, entityId)     // Tasks depending on this one
removeDependency(kysely, orgId, dependencyId)
updateDependency(kysely, orgId, dependencyId, updates)
```

### Lead/Lag Time (cascade-scheduler.ts)

```typescript
// leadLagDays: negative = lag (delay), positive = lead (overlap)
FS: successor.start = predecessor.end + lag
SS: successor.start = predecessor.start + lag
FF: successor.end = predecessor.end + lag
SF: successor.end = predecessor.start + lag
```

### Gantt View Store (stores/GanttViewStore.ts)

```typescript
interface TimeScale {
  pixelsPerDay: number    // day: 50, week: 20, month: 6, quarter: 2
  zoomLevel: 'day' | 'week' | 'month' | 'quarter'
  startDate: Date
  endDate: Date
}
```

### Supported Archetypes

Only `project`, `task`, `activity` support dependencies

## Critical Rules

1. **Row actions need selection column** - Set `enableSelectionColumn={true}`
2. **Bulk handlers receive arrays** - `(rowIds[], rowsData[])`
3. **Use `depends_on` relationship** - Via UnifiedRelationshipService
4. **Cascade on date changes** - `calculateCascadeUpdates()` propagates changes
5. **Cycle detection** - GraphService.detectCycles() prevents circular deps

## Testing Patterns (Added 2025-12-31)

### Mock Data Injection

Use `collectionOverride` prop to inject mock data for testing:

```typescript
// In test component
const testData = createMockScenario('drag-drop')

<VibeGrid
  tableId="test-tasks"
  entityType="Task"
  collectionOverride={testData}  // Bypasses API fetch
/>
```

**Why:** Enables isolated E2E testing without database setup or API mocking.

**Implementation:** `useVibeGridData.ts` checks for `collectionOverride` prop before fetching from API.

## Non-DataForge Data Sources (Added 2026-01-11)

### collectionOverride Pattern for MobX Store Data

Use `collectionOverride` to display data from MobX stores or other non-DataForge sources:

```typescript
// Transform MobX store data to VibeGrid format
const gridData = useMemo(() => {
  return storeData.map(item => ({
    id: item.id,
    field1: item.value1,
    field2: item.value2,
    // Store full object for row actions
    _originalData: item,
  }))
}, [storeData])

// Create mock collection interface
const mockCollection = useMemo(() => {
  if (!gridData.length) return null

  return {
    items: gridData,
    count: gridData.length,
    // Mock methods (required by collection interface)
    insert: async () => {},
    update: async () => {},
    delete: async () => {},
  }
}, [gridData])

// Provide to VibeGrid
<VibeGridStoreProvider
  tableId={tableId}
  entityType="CustomType"
  collectionOverride={mockCollection}
>
  <VibeGrid
    tableId={tableId}
    entityType="CustomType"
    skipDataFetching={true}  // Important: prevent API fetch
    onCellClick={(rowId) => {
      const row = gridData.find(r => r.id === rowId)
      handleClick(row._originalData)
    }}
  />
</VibeGridStoreProvider>
```

**Key points:**
- `collectionOverride` accepts any data source (MobX store, API response, computed data)
- Must implement collection interface: `{ items, count, insert?, update?, delete? }`
- Use `skipDataFetching={true}` to prevent VibeGrid from calling DataForge API
- Store original data object (e.g., `_originalData`) for row actions and navigation
- Transform data in `useMemo()` to re-compute when source changes

**Real-world examples:**
- GH#1076: Bid Submissions page (vendor response data from `useBidMailBidPackage` query)
- GH#1076: COI List (COI documents from `coiStore.filteredCOIs`)

**When to use:**
- Data comes from non-DataForge sources (external APIs, MobX stores, computed values)
- Need VibeGrid UI/UX but data isn't entity-based
- Testing/mocking scenarios

**Learned from:** GH#1076 - Migrating GC list pages with non-entity data sources (2026-01-11)

### Cell Selection Class Updates (Bug Fix)

**Problem:** Cell selection classes (`is-selected`, `is-range-selected`) weren't updating on click.

**Root Cause:** `BodyRenderer.ts` MobX reaction only listened to `displayRows` changes, not `interactionStore.selectedCells`.

**Fix:** Add `updateAllCellSelectionClasses()` call inside the reaction:

```typescript
reaction(
  () => [
    this.displayRows,
    this.interactionStore.selectedCells,  // Add this!
  ],
  () => {
    this.render()
    this.updateAllCellSelectionClasses()  // Add this!
  }
)
```

**Learned from:** Session #466 - E2E tests failed because cell clicks worked but CSS classes didn't update.

### E2E Test Locators

**Use specific selectors** that avoid internal columns:

```typescript
// BAD: Catches drag handle column
page.locator('.vibegridx-cell')

// GOOD: Only data cells with row/column IDs
page.locator('.vibegridx-cell[data-row-id][data-column-id]')
```

**Why:** VibeGrid has internal columns (drag handle, selection checkbox) that shouldn't be in tests.

### Test State Inspection

Debug routes expose `window.__VIBEGRID_TEST_STATE__` for test assertions:

```typescript
// In component
useEffect(() => {
  window.__VIBEGRID_TEST_STATE__ = {
    selectedCells: Array.from(interactionStore.selectedCells),
    rowCount: collection?.items.length || 0,
    // ...
  }
}, [interactionStore.selectedCells])

// In test
const state = await page.evaluate(() => window.__VIBEGRID_TEST_STATE__)
expect(state.selectedCells).toHaveLength(1)
```

**Learned from:** Session #466 - Need to verify internal state, not just DOM.

## Anti-Patterns

### Anti-Pattern 1: Domain-Specific Row Expansion (GH#1236 Mistake)

**What happened:** COI implementation created domain-specific expansion:
- `COIStore.expandedCOIs: Set<string>` - domain store tracking grid state
- `RowExpandRenderer` in `features/coi/` - generic pattern in domain code
- Event delegation from parent component - should be grid's job

**What should have happened:** Generic row expansion primitive in VibeGrid:
- `VibeGrid.config.expandable` - grid-level setting
- `VibeGrid.config.onRowExpand` - callback for lazy loading
- `VibeGrid.config.renderExpandedContent` - render prop for child content

**Tracking:** GH#1240 - Refactor to generic VibeGrid row expansion

### Anti-Pattern 2: Reimplementing Existing Features

Before implementing, check if VibeGrid already has:
- Grouping with expand/collapse → `GroupProcessor.ts`
- Row selection → Check existing selection system
- Column visibility → Check column config
- Cell editing → Check editable cell types

## Key Files

- `VibeGrid.tsx` - Main component, props interface
- `components/ActionsBar.tsx` - Row actions UI
- `stores/InteractionStore.ts` - UI state (selection, menus)
- `stores/GanttViewStore.ts` - Gantt state
- `utils/cascade-scheduler.ts` - Date cascading
- `components/DependencyArrowLayer.tsx` - SVG arrows
- `renderers/components/BodyRenderer.ts` - Cell rendering, selection classes (LINE 29: MobX reaction)

## Related Rules

- [VibeGrid Interactions](vibegrid-interactions.md) - Interaction patterns (expansion, custom types)
- [Core Philosophy](core-philosophy.md) - "Extend the primitive" principle
- [Component Architecture](component-architecture.md) - Where UI code lives

## Learned From

- **GH#1236** (2026-01-15) - Domain-specific row expansion should have been generic primitive
- **GH#1076** (2026-01-11) - collectionOverride pattern for non-DataForge data
- **Session #466** - Cell selection class updates, E2E test patterns
