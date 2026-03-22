---
date: 2026-03-22
topic: VIbeGrid Smart Filter Improvements
status: complete
github_issue: 1391
---

# Research: VIbeGrid Smart Filter — Analysis & Improvement Recommendations

## Context

The smart text search filter was implemented in GH#1391 (merged Jan 27, 2026). This research analyzes the current implementation and recommends improvements: text highlighting, field type exclusion, search scope expansion, and UX polish.

## Current Implementation

### Core Files
- `SmartSearchInput.tsx` — React component, 300ms debounce, MobX observer
- `VisualStateStore.ts` — `globalSearchText` observable (ephemeral, not persisted)
- `filter-utils.ts:applyTextSearch()` — Case-insensitive substring matching
- `TableCoreStore.ts` — Pipeline: `rawRows → searchFilteredRows → filteredRows → sortedRows → processedRows`
- `column-types.ts` — `TEXT_CELL_TYPES` Set determines default searchable columns

### Searchable Field Types (Current)
Only `TEXT_CELL_TYPES`: `text`, `longtext`, `rich-text`, `email`, `url`, `phone`

### Not Searchable (Current)
- `boolean`, `checkbox` — binary, text search meaningless
- `number`, `integer`, `decimal`, `currency`, `percentage` — excluded
- `select`, `single-select`, `multi-select` — searches raw option ID, not label
- `entity_reference`, `user_reference` — searches UUID, not entity name
- `date`, `datetime` — excluded
- `rollup_*`, `computed_*` — derived/read-only
- `file`, `image`, `color`, `rating`, `slider` — non-textual

### Key Behaviors
- Case-insensitive substring matching via `String.includes()`
- Searches raw stored values, not rendered/formatted values
- AND logic with FilterBuilder advanced filters (search applied FIRST)
- Hidden columns ARE searchable
- No text highlighting in matched cells
- No result count indicator

## Problems Identified

| # | Problem | Severity |
|---|---------|----------|
| 1 | **No match highlighting** — users can't see WHY a row matched | High |
| 2 | **Select fields search raw IDs** — "High" won't find priority "High" | High |
| 3 | **No result count** — no "X of Y rows" when filtering | Medium |
| 4 | **Number/currency not searchable** — can't find "42000" | Medium |
| 5 | **Rich-text searches raw JSON** — brittle, matches markup | Low |
| 6 | **Entity references not searchable by name** — only UUID | Medium |

## Recommendations

### P1: Result Count Badge (30 min)

Show filtered count next to search input when active.

```tsx
// In SmartSearchInput.tsx — add after input
{visualStateStore.hasActiveSearch && (
  <span className="text-xs text-muted-foreground ml-1">
    {tableCoreStore.processedRows.filter(r => r.type === 'data').length} results
  </span>
)}
```

Requires passing `tableCoreStore` to SmartSearchInput (currently only gets `stores`  which includes it).

### P2: Text Highlight in Matching Cells (2-3h)

When `globalSearchText` is active, wrap matching substrings in `<mark>` within text cell renderers.

**Implementation approach:**
1. Add `highlightText(value: string, searchText: string): React.ReactNode` utility
2. Thread `globalSearchText` into cell renderer context (already available via stores)
3. Text-type renderers call `highlightText()` when search is active
4. Only apply to `TEXT_CELL_TYPES` renderers (same set used for matching)

```tsx
// utils/highlight-text.tsx
export function highlightText(text: string, search: string): React.ReactNode {
  if (!search) return text
  const lower = text.toLowerCase()
  const searchLower = search.toLowerCase()
  const idx = lower.indexOf(searchLower)
  if (idx === -1) return text
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-200/70 rounded-sm">{text.slice(idx, idx + search.length)}</mark>
      {text.slice(idx + search.length)}
    </>
  )
}
```

**DOM integration:** Cell renderers already have access to `VibeGridStores` via context. The text cell renderer (`TextFieldType` in `slot-initialization.ts`) creates DOM directly — would need to use `innerHTML` with sanitized `<mark>` tags, or switch to React-based rendering for text cells.

**Simpler approach:** Use CSS `::highlight()` API (Chrome 105+) for zero-DOM-change highlighting:
```ts
// Register highlight range when search changes
CSS.highlights.set('search-match', new Highlight(...matchRanges))
```
This avoids modifying cell renderers entirely but requires building text node ranges.

### P3: Search Option Labels Instead of IDs (2h)

Extend `applyTextSearch()` to resolve select/option values to labels before matching.

```ts
export function applyTextSearch(
  rows: any[],
  searchText: string,
  columns: Column[],
  searchableColumnIds?: string[],
  valueResolver?: (col: Column, rawValue: any) => string | null,
): any[]
```

- For `select`/`single-select`: look up `col.options.find(o => o.value === rawValue)?.label`
- For system options (`status_option`, `priority_option`): use archetype option registry
- Expand default searchable types to include select types when resolver is available

### P4: Number/Currency Search (1h)

Add `number`, `integer`, `decimal`, `currency`, `percentage` to searchable types.

Current `String(value).toLowerCase().includes(trimmed)` already works for raw numbers. For formatted display (e.g., "$42,000"), add a `formatForSearch()` helper that formats the value the same way the cell renderer does.

### P5: Entity Reference Name Search (4h)

Search entity_reference columns by referenced entity's display name, not UUID.

The `relationshipNameResolver` already exists for group headers — reuse it as a `valueResolver` callback. Challenge: resolution may be async (needs entity name lookup), so may require pre-computing a search index.

### P6: Rich-Text Plain Text Extraction (1h)

For `rich-text` / `longtext` columns, extract plain text from JSON/HTML before searching instead of matching raw markup.

```ts
function extractPlainText(richTextValue: any): string {
  if (typeof richTextValue === 'string') {
    return richTextValue.replace(/<[^>]*>/g, '') // strip HTML tags
  }
  // Handle ProseMirror/TipTap JSON format
  if (richTextValue?.content) {
    return extractTextFromNodes(richTextValue.content)
  }
  return String(richTextValue)
}
```

## Field Type Exclusion Summary

| Category | Types | Search? | Rationale |
|----------|-------|---------|-----------|
| **Text** | text, email, url, phone | Yes (current) | Primary search targets |
| **Modal Text** | longtext, rich-text, markdown | Yes (current) | Searchable but needs plain text extraction |
| **Select/Option** | select, single-select, multi-select, status_option, priority_option | **Should search labels** | Currently searches IDs — useless |
| **Number** | number, integer, decimal, currency, percentage | **Should add** | Useful for finding specific values |
| **Boolean** | boolean, checkbox | **Exclude** | "true"/"false" text search is noise |
| **Date** | date, datetime, timestamp | **Exclude** | Better served by date-range filters |
| **Reference** | entity_reference, user_reference | **Should search names** | Currently searches UUIDs — useless |
| **Computed** | rollup_*, computed_* | **Exclude** | Derived values, often non-textual |
| **Display** | file, image, color, rating, slider | **Exclude** | Non-textual content |
| **System** | row-expand, badge-list, entity-name | **Exclude** | UI-only types |

## Open Questions

1. **CSS Highlight API vs DOM modification** — CSS `::highlight()` is cleaner but less browser support. DOM `<mark>` works everywhere but requires renderer changes.
2. **Option label search performance** — pre-compute option label map per column, or resolve on each search?
3. **Should search persist?** — Currently ephemeral. Users may want saved searches as "views."

## Next Steps

- Create GitHub issue for smart filter improvements umbrella
- P1 (result count) and P2 (highlighting) can be done as a single PR
- P3 (option label search) is a separate PR with API changes to `applyTextSearch`

## Sources

- [AG Grid search highlight discussion](https://github.com/ag-grid/ag-grid/issues/839)
- [TanStack Table Global Filtering Guide](https://tanstack.com/table/v8/docs/guide/global-filtering)
- [Data Table UX Best Practices — Pencil & Paper](https://www.pencilandpaper.io/articles/ux-pattern-analysis-enterprise-data-tables)
- [Search UX Best Practices 2026](https://www.designmonks.co/blog/search-ux-best-practices)
