---
initiative: GH#1435-vibegrid-incremental-column-virtualizati
type: feature
issue_type: feature
status: draft
priority: high
roadmap: null
owner: null
github_issue: 1435
github_milestone: null
created: 2026-01-31
updated: 2026-01-31
epic: 187
template: frontend-only
phases:
  - id: P1
    title: "Incremental Column DOM Updates"
    risk: high
    tasks:
      - "Create updateVirtualColumns() method in SimplePassiveRenderer analogous to updateVirtualRows()"
      - "Track active cells per column in each row element (Map<columnId, HTMLElement> per row)"
      - "On column range change: add cells for entering columns, remove cells for leaving columns"
      - "Replace renderBody() call in horizontal scroll observer with updateVirtualColumns()"
      - "Keep renderBody() as fallback for structure changes (visibility toggle, reorder, data change)"
      - "Verify: horizontal scroll smoothness matches vertical, no visual artifacts"
    files:
      - apps/web/src/systems/vibegrid/renderers/core/SimplePassiveRenderer.ts
      - apps/web/src/systems/vibegrid/renderers/components/BodyRenderer.ts
  - id: P2
    title: "Binary Search for Visible Column Range"
    risk: low
    tasks:
      - "Replace linear scan in visibleColumnRange with binary search on sorted xOffset array"
      - "Add findColumnAtOffset() helper method using bisect approach"
      - "Verify: column range calculation correct at all scroll positions"
    files:
      - apps/web/src/systems/vibegrid/stores/VisualStateStore.ts
  - id: P3
    title: "Map-based Column Lookups in Coordinate Manager"
    risk: low
    tasks:
      - "Add Map<string, ColumnMapping> index to VibeGridXCoordinateManager"
      - "Populate map in updateColumns(), clear in reset"
      - "Replace .find() calls with .get() in getColumnOffset(), getColumnWidth(), getColumn(), cellRefToPosition()"
      - "Verify: overlay positioning, cell navigation still correct"
    files:
      - apps/web/src/systems/vibegrid/coordinates/VibeGridXCoordinateManager.ts
  - id: P4
    title: "Column Map in columnLayouts Computed"
    risk: low
    tasks:
      - "Add private columnMap: Map<string, Column> rebuilt when columns array changes"
      - "Replace .find() in columnLayouts computed with .get() lookup"
      - "Verify: column layouts still correct after column add/remove/reorder"
    files:
      - apps/web/src/systems/vibegrid/stores/VisualStateStore.ts
  - id: P5
    title: "Increase Column Buffer"
    risk: low
    tasks:
      - "Increase BUFFER_COLUMNS from 2 to 4"
      - "Verify: reduced frequency of column range changes during scroll"
    files:
      - apps/web/src/systems/vibegrid/constants/grid-dimensions.ts
---

# Spec: VibeGrid Incremental Column Virtualization

> GitHub Issue: [#1435](https://github.com/baseplane-ai/baseplane/issues/1435)
> Epic: [#187](https://github.com/baseplane-ai/baseplane/issues/187) (VibeGrid)
> Research: Session 1a2b8706 - horizontal scroll performance investigation

## 0. Problem Statement

Horizontal scrolling in VibeGrid is noticeably laggier than vertical scrolling. Root cause analysis identified 4 compounding architectural asymmetries between the two axes:

1. **Full DOM rebuild on column range change** — Horizontal scroll calls `renderBody()` (destroys/recreates ALL rows+cells) while vertical scroll calls `updateVirtualRows()` (incremental add/remove of delta rows only). For 20 visible rows x 15 columns, this is ~300 DOM ops vs ~30.
2. **Linear search for visible columns** — `visibleColumnRange` does O(n) scan vs row virtualization's O(1) math or binary search.
3. **O(n) `.find()` lookups in coordinate manager** — `VibeGridXCoordinateManager` uses linear array search instead of Map for column lookups in hot paths.
4. **Small column buffer** — `BUFFER_COLUMNS: 2` provides less scroll headroom than `BUFFER_ROWS: 10`, causing more frequent re-renders.

## 1. Acceptance Criteria

| ID | Criterion | Phase |
|----|-----------|-------|
| AC1 | Column range change triggers incremental cell add/remove, NOT full body re-render | P1 |
| AC2 | Horizontal scroll smoothness subjectively matches vertical scroll | P1 |
| AC3 | No visual artifacts (missing cells, misaligned columns) during fast horizontal scroll | P1 |
| AC4 | `visibleColumnRange` uses binary search, not linear scan | P2 |
| AC5 | `VibeGridXCoordinateManager` column lookups are O(1) via Map | P3 |
| AC6 | `columnLayouts` computed uses Map for column lookup, not `.find()` | P4 |
| AC7 | Column buffer increased from 2 to 4 | P5 |

## 2. Metrics

| Metric | Current | Target |
|--------|---------|--------|
| DOM ops per column range change | ~300 (20 rows x 15 cols full rebuild) | ~40 (20 rows x 2 delta cols) |
| `visibleColumnRange` complexity | O(n) linear scan | O(log n) binary search |
| Column coordinate lookup | O(n) `.find()` | O(1) `.get()` |
| `columnLayouts` inner loop | O(n) `.find()` per column | O(1) `.get()` per column |
| Column buffer | 2 columns | 4 columns |

---

## Phase P1: Incremental Column DOM Updates

**Risk:** High | **Impact:** Highest — this is the dominant performance fix

### Architecture

**Before:**
```
scrollLeft changes → visibleColumnRange changes → renderBody()
  → clear ALL body children
  → recreate ALL visible rows × visible columns
  → O(rows × cols) DOM operations
```

**After:**
```
scrollLeft changes → visibleColumnRange changes → updateVirtualColumns(prev, current)
  → for each active row element:
    → add cells for columns entering range (right or left edge)
    → remove cells for columns leaving range
  → O(rows × deltaCols) DOM operations
```

### Implementation

1. **Track cells per row** — Each row element in `activeRows` Map needs a sub-map: `Map<string, HTMLElement>` mapping columnId → cell element. This allows targeted add/remove.

2. **Create `updateVirtualColumns()`** method:
   ```
   - Compare previousColumnRange with currentColumnRange
   - Determine entering columns (in current but not previous)
   - Determine leaving columns (in previous but not current)
   - For each active row: remove leaving cells, add entering cells at correct xOffset
   ```

3. **Replace `renderBody()` in horizontal observer** (`SimplePassiveRenderer.ts:986`) with `updateVirtualColumns()`.

4. **Keep `renderBody()` for structural changes** — visibility toggle, column reorder, data changes still need full re-render.

### Verification

- Horizontal scroll at 60fps on grid with 50+ columns and 1000+ rows
- Column cells appear/disappear smoothly at viewport edges
- Cell xOffset positioning matches header at all scroll positions
- Selection overlay tracks correctly during horizontal scroll

---

## Phase P2: Binary Search for Visible Column Range

**Risk:** Low

Replace the linear scan in `VisualStateStore.visibleColumnRange` (lines 358-373) with binary search. Columns in `visibleColumns` are sorted by `xOffset`, making binary search valid.

```typescript
// Before: O(n)
for (let i = 0; i < columns.length; i++) {
  if (col.xOffset + col.width > scrollLeft) { start = i; break }
}

// After: O(log n)
start = binarySearchFirstVisible(columns, scrollLeft)
```

---

## Phase P3: Map-based Column Lookups

**Risk:** Low

Add `private columnMap: Map<string, ColumnMapping>` to `VibeGridXCoordinateManager`. Populate in `updateColumns()`. Replace all `.find()` calls:

- `getColumnOffset()` — `.find()` → `.get()`
- `getColumnWidth()` — `.find()` → `.get()`
- `getColumn()` — `.find()` → `.get()`
- `cellRefToPosition()` — `.find()` → `.get()`

---

## Phase P4: Column Map in columnLayouts

**Risk:** Low

The `columnLayouts` computed does `this.columns.find(c => c.id === columnId)` for each column in `columnOrder`. With a pre-built Map, this becomes O(1):

```typescript
// Rebuild when columns array changes (not on scroll)
private get columnMap(): Map<string, Column> {
  return new Map(this.columns.map(c => [c.id, c]))
}

// In columnLayouts:
const column = this.columnMap.get(columnId)  // O(1) instead of O(n)
```

---

## Phase P5: Increase Column Buffer

**Risk:** Low | Trivial change

Increase `BUFFER_COLUMNS` from 2 to 4 in `grid-dimensions.ts:37`. This roughly doubles the scroll distance before a column range change fires, reducing the frequency of DOM updates during horizontal scroll.

---

## Testing Strategy

| Phase | Test Type | What to verify |
|-------|-----------|----------------|
| P1 | Manual | Smooth horizontal scroll on 50-column grid |
| P1 | Manual | Fast horizontal scroll shows no blank columns |
| P1 | Manual | Column resize, reorder, visibility toggle still work |
| P1 | Manual | Selection overlay tracks during horizontal scroll |
| P2 | Unit test | Binary search returns same results as linear scan |
| P3 | Unit test | Map lookups return same results as .find() |
| P4 | Unit test | columnLayouts computed returns correct layouts |
| P5 | Manual | Fewer column range change log entries during scroll |

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| P1: Incremental updates miss edge cases | Keep `renderBody()` as fallback, add `forceFullRender()` escape hatch |
| P1: Cell ordering in DOM doesn't match visual order | Use `insertBefore` with reference to next column's cell |
| P1: Deferred column rendering (`requestIdleCallback`) conflicts | Skip deferred rendering for incrementally-added cells |
| P2: Off-by-one in binary search | Compare against linear scan results in unit test |

## Related

- **Epic:** #187 (VibeGrid)
- **Predecessor:** #1413 (Architecture Consolidation — P1+P2 completed, established ViewportStore)
- **Research session:** 1a2b8706 — identified all 4 root causes
- **Industry reference:** AG Grid uses zero column buffer + incremental DOM element reuse
