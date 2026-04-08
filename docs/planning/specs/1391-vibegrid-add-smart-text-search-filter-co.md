---
initiative: GH#1391-vibegrid-add-smart-text-search-filter-co
type: feature
issue_type: feature
status: approved
priority: medium
roadmap: null
owner: codevibesmatter
github_issue: 1391
github_milestone: null
created: 2026-01-27
updated: 2026-01-27
phases:
  - id: phase-1
    name: "Store & State"
    status: pending
    tasks:
      - "Add globalSearchText observable and actions to VisualStateStore"
      - "Add searchableColumns, searchPlaceholder, disableSearch props to VibeGridProps"
      - "Wire search config from VibeGrid to header and TableCoreStore"
  - id: phase-2
    name: "Search Component"
    status: pending
    tasks:
      - "Create SmartSearchInput component with debounced input and clear button"
      - "Integrate SmartSearchInput into VibeGridXHeaderPure toolbar"
  - id: phase-3
    name: "Filter Pipeline"
    status: pending
    tasks:
      - "Add applyTextSearch function to filter-utils.ts"
      - "Add searchFilteredRows computed to TableCoreStore"
      - "Modify filteredRows pipeline to apply search before FilterGroup"
  - id: phase-4
    name: "Polish & Testing"
    status: pending
    tasks:
      - "Add empty state when no search results"
      - "Ensure clearAllFilters also clears search"
      - "Write unit tests for applyTextSearch"
---

# VibeGrid: Smart Text Search Filter Component

> GitHub Issue: [#1391](https://github.com/baseplane-ai/baseplane/issues/1391)

## Overview

Add a smart text search input to VibeGrid's toolbar that filters rows across configurable columns simultaneously. Currently VibeGrid only has the advanced FilterBuilder for column-specific filtering - there's no quick search capability for users who want to find rows by typing a simple query.

### User Story

> As a VibeGrid user, I want to type a search term and instantly see matching rows filtered across multiple text columns, so I can quickly find the data I need without setting up complex filters.

## Requirements Summary

| Requirement | Decision |
|-------------|----------|
| UI Placement | Right side of toolbar, before FilterBuilder |
| Filter Logic | AND with existing FilterBuilder filters |
| Search Scope | Configurable via `searchableColumns` prop |
| Default Scope | All text columns if prop not specified |
| Keyboard Shortcut | None (avoid browser conflicts) |
| Debouncing | 300ms |

## Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| State Location | VisualStateStore | Alongside filterGroup; but NOT persisted (ephemeral) |
| Persistence | Ephemeral only | Search is session-specific; cleared on page reload |
| Pipeline Position | Before FilterBuilder | `rawRows → searchFiltered → filterGroupFiltered`; search is coarse, filters refine |
| Debouncing | 300ms | Standard UX; prevents excessive filtering during typing |
| Hidden Columns | Searchable | All columns matching criteria, regardless of visibility |
| Value Extraction | Raw values only | Uses `row[col.id]` directly; formatted/rendered values not searched |
| Remote Data | Search loaded rows only | Client-side filtering; server-side search out of scope |

## Research Findings

### Current VibeGrid Architecture

**Location:** `apps/web/src/systems/vibegrid/` (NOT `shared/components/`)

**5 Core Stores:**
| Store | Purpose |
|-------|---------|
| TableCoreStore | Data pipeline: rawRows → filteredRows → sortedRows → processedRows |
| VisualStateStore | Filter state (filterGroup), sort, group, column visibility |
| InteractionStore | UI state: selections, menus, filter builder draft |
| EditingStore | Cell editing state |
| ViewModeStore | Table/Gantt/Kanban toggle |

**Current Data Pipeline** (`TableCoreStore`):
```
rawRows
  → filteredRows (apply FilterGroup via applyNestedFilters)
  → sortedRows (apply SortConfig[])
  → groupedOrOrderedRows (apply GroupConfig)
  → processedRows (wrap in VirtualRow)
```

**Filter System:**
- `FilterGroup` with AND/OR logic, supports 3 levels of nesting
- 14 filter operators in `evaluateCondition()`
- Applied via `applyNestedFilters()` in `filter-utils.ts`

**Existing Text Type Detection:**
```typescript
// apps/web/src/systems/vibegrid/column-types.ts
// Note: File has deprecated Column types but utility functions are still valid and used
export const TEXT_CELL_TYPES = new Set<CellType>([
  'text', 'longtext', 'rich-text', 'email', 'url', 'phone'
])
export const isTextType = (cellType: string): boolean =>
  TEXT_CELL_TYPES.has(cellType as CellType)
```

**Implementation Note:** Consider extending `TEXT_CELL_TYPES` to include `textarea` and other text-like types if needed during implementation.

### Key Files

| File | Purpose |
|------|---------|
| `apps/web/src/systems/vibegrid/stores/VisualStateStore.ts` | Will add `globalSearchText` observable |
| `apps/web/src/systems/vibegrid/stores/TableCoreStore.ts` | Will add search filtering to pipeline |
| `apps/web/src/systems/vibegrid/components/VibeGridXHeaderPure.tsx` | Will add SmartSearchInput component |
| `apps/web/src/systems/vibegrid/utils/filter-utils.ts` | Will add `applyTextSearch()` function |
| `apps/web/src/systems/vibegrid/VibeGrid.tsx` | Will add `searchableColumns` prop |
| `apps/web/src/systems/vibegrid/column-types.ts` | Has existing `isTextType()` to reuse |

### Persistence Decision

**Search state is EPHEMERAL** - not persisted to localStorage via PersistenceStore. Rationale:
- Search is typically session-specific, not a saved preference
- Persisting search would cause confusion when returning to grid
- Aligns with how DataTable globalFilter works (not persisted)

**Implementation requirements:**
- Exclude `globalSearchText` from `PersistenceStore.serializeState()`
- Clear search in `VisualStateStore.reset()` and `clearAllFilters()`
- Ensure "Reset filters" UI button clears search along with FilterBuilder

### Full Filtering Stack

The complete filtering pipeline with search inserted:

```
rawRows
  → legacyFilteredRows (if legacy FilterConfig[] present)
  → searchFilteredRows (NEW: apply globalSearchText)
  → filterGroupFilteredRows (apply FilterBuilder's filterGroup)
  → sortedRows
  → groupedOrOrderedRows
  → processedRows (VirtualRow wrapping)
```

**View mode support:**
- Table: Full search support
- Gantt: Search filters timeline items (same pipeline)
- Kanban: Search filters cards (same pipeline)
- Hierarchy: Search applies to all hierarchy levels

## Feature Behaviors

| ID | Trigger | Expected | Verify | Severity |
|----|---------|----------|--------|----------|
| B1 | User types in search input | Rows filter across searchable columns after 300ms debounce | Type "test", wait 300ms, only matching rows visible | P0 |
| B2 | User clears search (backspace or X button) | All rows visible (subject to FilterBuilder filters) | Clear input, full dataset shown | P0 |
| B3 | Search with active FilterBuilder filters | Both filters apply as AND | Search "john" + FilterBuilder status=active → only active Johns | P0 |
| B4 | Case insensitivity | Search is case-insensitive | "TEST" matches "test", "Test", "TEST" | P0 |
| B5 | Empty search input on load | No filtering applied, search input shows placeholder | Load grid, see "Search..." placeholder, all rows visible | P1 |
| B6 | No matches found | Empty state with message | Search "xyz123nonexistent", see "No results" state | P1 |
| B7 | Partial word match | Matches substrings | "con" matches "construction", "concrete" | P1 |
| B8 | Search across configured columns only | Only specified columns searched | Configure name+email, search "john", ignores notes field | P1 |
| B9 | Default to all text columns | When searchableColumns not specified, search all text columns | No prop, search works on all text cellType columns | P2 |
| B10 | Clear button appears when searching | X icon visible only when input has text | Type text, X appears; clear, X disappears | P2 |
| B11 | Hidden columns are searchable | Search includes columns not visible in grid | Hide column, search still matches its data | P2 |
| B12 | Search only raw values | Searches stored values, not rendered/formatted values | Search "option_id" not "Option Label" for select columns | P2 |
| B13 | Clear filters clears search | "Reset filters" also clears search input | Click reset, search cleared with other filters | P1 |
| B14 | Search badge shows active state | Active filter count includes search | Search active, filter badge shows +1 | P2 |
| B15 | Gantt/Kanban views support search | Search works in all view modes | Switch to Gantt, search still filters | P1 |

## Implementation Phases

### Phase 1: Store & State (~1 hour)

**Files to modify:**
- `apps/web/src/systems/vibegrid/stores/VisualStateStore.ts`
- `apps/web/src/systems/vibegrid/VibeGrid.tsx`

**Changes:**

1. **Add to VisualStateStore:**
```typescript
// New observable
@observable globalSearchText: string = ''

// Action to update
@action setGlobalSearchText(text: string): void {
  this.globalSearchText = text
}

// Computed for UI
@computed get hasActiveSearch(): boolean {
  return this.globalSearchText.trim().length > 0
}

// Action to clear (for reset functionality)
@action clearGlobalSearch(): void {
  this.globalSearchText = ''
}
```

2. **Add to VibeGridProps in VibeGrid.tsx:**
```typescript
interface VibeGridProps {
  // ... existing props

  /** Columns to search. Defaults to all columns with isTextType() */
  searchableColumns?: string[]

  /** Placeholder text for search input. Defaults to "Search..." */
  searchPlaceholder?: string

  /** Disable smart search entirely. Defaults to false */
  disableSearch?: boolean
}
```

3. **Props wiring in VibeGrid.tsx:**
```typescript
// In VibeGrid component, pass search config to header and TableCoreStore
const searchConfig = {
  searchableColumns: props.searchableColumns,
  searchPlaceholder: props.searchPlaceholder,
  disableSearch: props.disableSearch,
}

// Pass to VibeGridXHeaderPure
<VibeGridXHeaderPure
  stores={stores}
  searchConfig={searchConfig}
  // ... other props
/>

// Pass to TableCoreStore initialization
tableCoreStore.setSearchConfig(searchConfig)
```

### Phase 2: Search Component (~1.5 hours)

**Files to create/modify:**
- `apps/web/src/systems/vibegrid/components/SmartSearchInput.tsx` (new)
- `apps/web/src/systems/vibegrid/components/VibeGridXHeaderPure.tsx`

**SmartSearchInput Component:**
```typescript
import { observer } from 'mobx-react-lite'
import { useState, useEffect, useRef } from 'react'
import { useDebouncedCallback } from 'use-debounce'
import { Search, X } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { Input } from '@/shared/components/ui/input'
import { Button } from '@/shared/components/ui/button'
import type { VibeGridStores } from '../types/store-types'

interface SmartSearchInputProps {
  stores: VibeGridStores
  placeholder?: string
  className?: string
  /** Collapse to icon-only on narrow widths */
  collapsible?: boolean
}

export const SmartSearchInput = observer(function SmartSearchInput({
  stores,
  placeholder = 'Search...',
  className,
}: SmartSearchInputProps) {
  const { visualStateStore } = stores
  const [localValue, setLocalValue] = useState(visualStateStore.globalSearchText)
  const debouncedUpdateRef = useRef<ReturnType<typeof useDebouncedCallback>>()

  // Create debounced update
  const debouncedUpdate = useDebouncedCallback(
    (value: string) => visualStateStore.setGlobalSearchText(value),
    300
  )
  debouncedUpdateRef.current = debouncedUpdate

  // CRITICAL: Sync local state when store changes externally
  // (e.g., reset filters, persistence load, programmatic clear)
  useEffect(() => {
    setLocalValue(visualStateStore.globalSearchText)
  }, [visualStateStore.globalSearchText])

  // Cancel pending debounce on unmount
  useEffect(() => {
    return () => {
      debouncedUpdateRef.current?.cancel()
    }
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setLocalValue(value)
    debouncedUpdate(value)
  }

  const handleClear = () => {
    setLocalValue('')
    debouncedUpdate.cancel() // Cancel any pending debounce
    visualStateStore.setGlobalSearchText('')
  }

  return (
    <div className={cn('relative', className)} role="search">
      <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={localValue}
        onChange={handleChange}
        placeholder={placeholder}
        className="h-8 w-[200px] pl-8 pr-8"
        data-testid="vibegrid-smart-search"
        aria-label="Search grid"
      />
      {localValue && (
        <Button
          variant="ghost"
          size="sm"
          className="absolute right-1 top-1/2 h-5 w-5 -translate-y-1/2 p-0"
          onClick={handleClear}
          data-testid="vibegrid-smart-search-clear"
          aria-label="Clear search"
        >
          <X className="h-3 w-3" />
        </Button>
      )}
    </div>
  )
})
```

**Header Integration:**
```typescript
// In VibeGridXHeaderPure.tsx

interface VibeGridXHeaderPureProps {
  stores: VibeGridStores
  searchConfig?: {
    searchableColumns?: string[]
    searchPlaceholder?: string
    disableSearch?: boolean
  }
  // ... other existing props
}

// In the render, right side toolbar
<div className="flex items-center gap-2">
  {/* ... existing buttons ... */}

  {!searchConfig?.disableSearch && (
    <SmartSearchInput
      stores={stores}
      placeholder={searchConfig?.searchPlaceholder}
    />
  )}

  <FilterBuilder stores={stores} />
  {/* ... column visibility ... */}
</div>
```

### Phase 3: Filter Pipeline (~1.5 hours)

**Files to modify:**
- `apps/web/src/systems/vibegrid/utils/filter-utils.ts`
- `apps/web/src/systems/vibegrid/stores/TableCoreStore.ts`

**Add to filter-utils.ts:**
```typescript
import { isTextType } from '../column-types'
import type { ColumnDef } from '../types/column-types'

/**
 * Apply text search across specified columns.
 * Returns rows where any searchable column contains the search text (case-insensitive).
 *
 * Uses existing isTextType() to determine default searchable columns:
 * - text, longtext, rich-text, email, url, phone
 */
export function applyTextSearch(
  rows: any[],
  searchText: string,
  columns: ColumnDef[],
  searchableColumnIds?: string[]
): any[] {
  const trimmed = searchText.trim().toLowerCase()
  if (!trimmed) return rows

  // Determine which columns to search
  // Uses existing isTextType() from column-types.ts for consistency
  const columnsToSearch = searchableColumnIds
    ? columns.filter(c => searchableColumnIds.includes(c.id))
    : columns.filter(c => isTextType(c.cellType))

  if (columnsToSearch.length === 0) return rows

  return rows.filter(row => {
    return columnsToSearch.some(col => {
      // Support both row[col.id] and row.data[col.id] patterns
      // (VibeGrid uses both depending on data source)
      const value = row[col.id] ?? row.data?.[col.id]
      if (value == null) return false
      return String(value).toLowerCase().includes(trimmed)
    })
  })
}
```

**Modify TableCoreStore pipeline:**
```typescript
// In TableCoreStore.ts

// Add search config storage (observable for reactivity when props change)
@observable.ref searchableColumns: string[] | undefined = undefined

@action setSearchableColumns(columns: string[] | undefined): void {
  this.searchableColumns = columns
}

@computed get searchFilteredRows(): any[] {
  const searchText = this.visualStateStore.globalSearchText
  if (!searchText.trim()) return this.rawRows

  return applyTextSearch(
    this.rawRows,
    searchText,
    this.columns,
    this.searchableColumns
  )
}

@computed get filteredRows(): any[] {
  // Now apply FilterGroup to search-filtered rows
  // Pipeline: rawRows → searchFilteredRows → filterGroupFiltered
  return applyNestedFilters(
    this.searchFilteredRows,  // Changed from this.rawRows
    this.visualStateStore.filterGroup
  )
}
```

**In VibeGrid.tsx - reactive config updates:**
```typescript
// Use effect to update searchableColumns when prop changes
useEffect(() => {
  tableCoreStore.setSearchableColumns(searchableColumns)
}, [searchableColumns, tableCoreStore])
```

### Phase 4: Polish & Testing (~1 hour)

**Tasks:**
1. Add empty state when no search results
2. Add loading indicator during debounce (optional)
3. Write unit tests for `applyTextSearch()`
4. Write component tests for SmartSearchInput
5. Add to Storybook

**Test Cases:**
```typescript
// filter-utils.test.ts
describe('applyTextSearch', () => {
  it('filters rows by search text across text columns', () => {
    const rows = [
      { id: 1, name: 'John Doe', email: 'john@test.com' },
      { id: 2, name: 'Jane Smith', email: 'jane@test.com' },
    ]
    const columns = [
      { id: 'name', cellType: 'text' },
      { id: 'email', cellType: 'text' },
    ]

    expect(applyTextSearch(rows, 'john', columns)).toHaveLength(1)
    expect(applyTextSearch(rows, 'test.com', columns)).toHaveLength(2)
    expect(applyTextSearch(rows, 'xyz', columns)).toHaveLength(0)
  })

  it('is case-insensitive', () => {
    const rows = [{ id: 1, name: 'John Doe' }]
    const columns = [{ id: 'name', cellType: 'text' }]

    expect(applyTextSearch(rows, 'JOHN', columns)).toHaveLength(1)
    expect(applyTextSearch(rows, 'john', columns)).toHaveLength(1)
  })

  it('respects searchableColumnIds', () => {
    const rows = [
      { id: 1, name: 'John', notes: 'Important note about John' },
    ]
    const columns = [
      { id: 'name', cellType: 'text' },
      { id: 'notes', cellType: 'text' },
    ]

    // Search only 'name' column
    expect(applyTextSearch(rows, 'note', columns, ['name'])).toHaveLength(0)
    expect(applyTextSearch(rows, 'John', columns, ['name'])).toHaveLength(1)
  })

  it('returns all rows when search is empty', () => {
    const rows = [{ id: 1 }, { id: 2 }]
    expect(applyTextSearch(rows, '', [])).toHaveLength(2)
    expect(applyTextSearch(rows, '   ', [])).toHaveLength(2)
  })
})
```

## API Changes

### New Props on VibeGrid

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `searchableColumns` | `string[]` | All text columns | Column IDs to include in search |
| `searchPlaceholder` | `string` | `"Search..."` | Placeholder text for input |
| `disableSearch` | `boolean` | `false` | Hide search input entirely |

### Usage Example

```tsx
<VibeGrid
  columns={columns}
  rows={rows}
  // Search enabled by default, searches all text columns
/>

<VibeGrid
  columns={columns}
  rows={rows}
  searchableColumns={['name', 'email', 'company']}
  searchPlaceholder="Search contacts..."
/>

<VibeGrid
  columns={columns}
  rows={rows}
  disableSearch  // For grids where search doesn't make sense
/>
```

## Out of Scope

- Keyboard shortcut (Cmd/Ctrl+F) - avoided to prevent browser conflicts
- Search result highlighting in cells - could be a follow-up feature
- Search history/suggestions - not needed for MVP
- Fuzzy matching - exact substring match is sufficient
- Server-side search - this is client-side filtering only
- Formatted value search (select labels, reference names) - searches raw stored values only

## Constraints & Limitations

| Constraint | Behavior | Rationale |
|------------|----------|-----------|
| **Remote/paginated data** | Searches only loaded rows | Client-side filter; server-side search is out of scope |
| **Select columns** | Matches option ID, not label | Searching labels requires lookup; keep search simple |
| **Reference columns** | Matches UUID, not entity name | Same rationale as select columns |
| **Rich-text columns** | Matches raw JSON/HTML | Searching rendered text adds complexity |
| **Persistence** | Cleared on page reload | Search is ephemeral, not a saved preference |

**Note:** For users with `collectionOverride` (remote data sources), search will only filter the currently loaded rows. This matches how FilterBuilder behaves today.

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Performance with large datasets | Slow filtering | 300ms debounce; filter before other computations; consider virtual scrolling already handles display |
| Conflict with existing FilterBuilder | Confusing UX | Clear AND relationship; search is "quick filter", FilterBuilder is "advanced" |
| Breaking existing VibeGrid consumers | Upgrade issues | New props are optional; search enabled by default but unobtrusive |

## Implementation Notes (from Codex Review)

**Address during implementation:**

1. **Row sourcing alignment**: Ensure `searchFilteredRows` derives from the same `rows` variable used by existing filters, not directly from `rawRows`. This preserves `entityDataProvider` fallback and legacy filter behavior.

2. **Column key consistency**: Use `column.field` (not `column.id`) for row data lookup, matching the pattern used by existing filters: `row.data?.[field] ?? row[field]`.

3. **disableSearch handling**: When `disableSearch` is true, skip `applyTextSearch()` in TableCoreStore regardless of `globalSearchText` value.

4. **Filter badge integration**: Update `activeFilterCount` computed to include `hasActiveSearch`, or add separate search indicator in the toolbar.

5. **Clear/reset integration**: Ensure `VisualStateStore.clearAllFilters()` and any "Reset filters" UI actions also call `clearGlobalSearch()`.

## Success Criteria

1. Users can type in search input and see filtered results within 500ms
2. Search combines with FilterBuilder filters (AND logic)
3. Clear button works to reset search
4. All existing VibeGrid functionality unchanged
5. No performance regression on datasets < 10,000 rows

## Appendix: File Changes Summary

All files in `apps/web/src/systems/vibegrid/`:

| File | Change Type | Lines Est. |
|------|-------------|------------|
| `stores/VisualStateStore.ts` | Modify | +15 |
| `stores/TableCoreStore.ts` | Modify | +15 |
| `VibeGrid.tsx` | Modify | +15 |
| `components/SmartSearchInput.tsx` | New | ~70 |
| `components/VibeGridXHeaderPure.tsx` | Modify | +10 |
| `utils/filter-utils.ts` | Modify | +35 |
| `utils/filter-utils.test.ts` | Modify | +50 |

**Total estimated: ~210 lines of new/modified code**
