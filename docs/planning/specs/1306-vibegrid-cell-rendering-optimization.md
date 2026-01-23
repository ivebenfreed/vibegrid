---
initiative: GH#1306-vibegrid-cell-rendering-optimization
issue_type: improvement
status: draft
priority: high
roadmap: performance
owner: platform-engineering
github_issue: 1306
github_milestone: null
parent_epic: null
created: 2026-01-23
updated: 2026-01-23

# Implementation phases (used by `wm enter implementation`)
phases:
  - id: p1
    name: "Selection Delta Tracking"
    tasks:
      - "Add delta tracking to InteractionStore.selectedCells (track added/removed)"
      - "Add centralized applySelection() method that preserves invariants (selectionVersion, anchorCell, selectedRows, mode)"
      - "Audit SelectionController for direct selectedCells mutations and route through applySelection()"
      - "Add guard to prevent direct selectedCells assignments (TypeScript private + runtime check)"
      - "Refactor BodyRenderer selection reaction to observe selectionDelta + displayRows + visibleColumns"
      - "Add intersectWithViewport() to scope deltas to activeRows + visible columns (prevent O(n) on large selections)"
      - "Replace updateAllCellSelectionClasses() with updateCellSelectionByDelta(scoped)"
      - "Replace updateAllRowCheckboxes() with updateRowCheckboxesByDelta(scoped)"
      - "Add viewport scroll handler for selection class application on new rows"
      - "Ensure cell creation applies selection/checkbox state deterministically for any rerender path"
  - id: p2
    name: "Affordance Pre-computation"
    tasks:
      - "Add computeConfigHash() method using normalized config subset (not JSON.stringify)"
      - "Store configHash as explicit property on Column during init"
      - "Update cache key to ${cellType}-${column.configHash}"
      - "Move precomputeAffordances() call to VisualStateStore.initializeColumns()"
      - "Document cache lifecycle: created (init), invalidated (config change), recomputed (next access)"
      - "Document which config changes invalidate: resize, options update, cellType change"
      - "Add cache invalidation hook on column config changes (clear configHash + cache entry)"
      - "Add cache hit/miss metrics using getLogger (not console.log)"
  - id: p3
    name: "Granular MobX Reactions"
    tasks:
      - "Audit all reactions in BodyRenderer and ModularCellBridge"
      - "Split coarse-grained reactions into specific observers"
      - "Add performance logging for reaction execution times (dev-only)"
---

# VibeGrid Cell Rendering Optimization

> **Performance Improvement**: Optimize cell selection and initial render performance for VibeGrid table view

## Problem Statement

**What problem are we solving?**
VibeGrid table view has two performance bottlenecks:
1. **Selection interactions** - Selecting a single cell triggers O(n) updates for ALL visible cells due to `updateAllCellSelectionClasses()` in BodyRenderer.ts:132-144
2. **Initial render** - Large datasets (10K rows) render slowly due to suboptimal affordance pre-computation timing and coarse-grained MobX reactions

**Why now?**
- User feedback: "Grid feels sluggish when selecting cells"
- Strategic priority: Table view is core to platform, affects all verticals
- Technical debt: Known hot paths identified, low-hanging fruit for measurable gains

---

## User Story

As a **power user working with large datasets**,
I want **instant cell selection feedback and fast initial grid render**,
so that **I can navigate and interact with data without lag**.

---

## Goals & Non-Goals

### Goals
- Reduce cell selection update time from O(n) to O(delta) where delta = cells changed
- Improve initial render performance for 10K row grids
- Maintain 30fps minimum (33ms frame budget) during interactions
- Add dev-only performance logging to monitor hot paths

### Non-Goals (Out of Scope)
- Gantt view optimization (separate issue #1307)
- Export/print functionality performance
- Cell editing performance
- Automated regression test suite (manual verification only)

---

## Success Metrics

| Metric | Current | Target | How to Measure |
|--------|---------|--------|----------------|
| Selection update time | O(n) all visible cells | O(delta) changed cells only | Frame profiler, dev logs |
| Single cell selection latency | ~50-80ms (O(n) DOM updates) | <16ms (1 frame at 60fps) | Chrome DevTools Performance: mark selection start/end |
| Range selection latency | ~200-500ms (O(n) DOM updates) | <50ms (3 frames at 60fps) | Chrome DevTools Performance: mark range start/end |
| Initial render (10K rows) | ~800-1200ms (cache misses) | <500ms (cache hit rate >90%) | performance.mark() in component lifecycle |
| Frame budget compliance | Occasional drops <30fps | Consistently >30fps (33ms) | Dev performance logging |

---

## Feature Behaviors

> All behaviors are performance optimizations - no user-facing UI changes.
> Verification is via profiling, logging, and manual testing.

### B1: Selection Delta Update

**Core:**
- **ID:** selection-delta-update
- **Trigger:** User clicks a cell to select/deselect it
- **Expected:** Only the affected cell's DOM class is updated, not all visible cells. Latency <16ms from click to DOM class applied.
- **Verify:** Dev logs show `updateCellSelectionByDelta()` called with 1-2 cells (added/removed), not updateAllCellSelectionClasses(). Chrome DevTools Performance shows <16ms between click event and class mutation.
- **Source:** `apps/web/src/systems/vibegrid/renderers/components/BodyRenderer.ts:132-144` (selection reaction) + `apps/web/src/systems/vibegrid/stores/InteractionStore.ts` (delta tracking + applySelection() method)

#### UI Layer
N/A - No visual change, same selection appearance

#### API Layer
N/A - Frontend-only optimization

#### Data Layer
N/A - No database interaction

---

### B2: Affordance Cache Pre-computation Timing

**Core:**
- **ID:** affordance-cache-timing
- **Trigger:** Grid initializes or columns change
- **Expected:** Affordance cache populated BEFORE first cell render, cache hit rate >90%, initial render <500ms for 10K rows
- **Verify:** Dev logs show `precomputeAffordances()` called early, cache metrics show high hit rate. performance.mark() shows initial render <500ms.
- **Source:** `apps/web/src/systems/vibegrid/field-types/ModularCellBridge.ts:46-69` (cache logic with cellType+config keying) + lifecycle hook in BodyRenderer/GridContainer + cache invalidation on column config changes

#### UI Layer
N/A - No visual change, same cell rendering

#### API Layer
N/A - Frontend-only optimization

#### Data Layer
N/A - No database interaction

---

### B3: Granular MobX Reactions

**Core:**
- **ID:** granular-mobx-reactions
- **Trigger:** State changes in stores (selection, columns, viewport)
- **Expected:** Only affected components re-render, not entire body
- **Verify:** Dev logs show specific reaction names triggered, not generic "body re-render"
- **Source:** `apps/web/src/systems/vibegrid/renderers/components/BodyRenderer.ts` + `apps/web/src/systems/vibegrid/stores/VisualStateStore.ts` (split reactions)

#### UI Layer
N/A - Same visual result, fewer unnecessary renders

#### API Layer
N/A - Frontend-only optimization

#### Data Layer
N/A - No database interaction

---

### B4: Viewport Scroll Selection Classes

**Core:**
- **ID:** viewport-scroll-selection-classes
- **Trigger:** User scrolls viewport, virtual scrolling brings new rows into view
- **Expected:** Newly visible rows have selection classes applied if cells are selected
- **Verify:** Select cells, scroll away, scroll back → selection classes still applied to newly visible cells
- **Source:** `apps/web/src/systems/vibegrid/renderers/components/BodyRenderer.ts` (viewport scroll observer)

#### UI Layer
N/A - Same visual result, selection preserved across viewport changes

#### API Layer
N/A - Frontend-only optimization

#### Data Layer
N/A - No database interaction

---

### B5: Performance Logging (Dev-Only)

**Core:**
- **ID:** performance-logging-dev
- **Trigger:** Selection, render, reaction execution in dev mode
- **Expected:** Console logs show timing for hot paths, cache hit/miss rates
- **Verify:** Open DevTools, see performance metrics in console during interactions. performance.measure() shows latencies match targets (<16ms single cell, <50ms range, <500ms initial render).
- **Source:** Instrumentation added to BodyRenderer, ModularCellBridge, InteractionStore (gated by `process.env.NODE_ENV === 'development'`)

#### UI Layer
N/A - Console output only, no UI change

#### API Layer
N/A - Frontend-only optimization

#### Data Layer
N/A - No database interaction

---

## User Journey

> Performance optimizations don't change user journey - same interactions, faster execution

| Step | Action | UI State | Performance Impact |
|------|--------|----------|-------------------|
| **1. Entry Point** | User navigates to /projects (grid view) | Loading state | B2: Affordance cache populated early |
| **2. Initial Render** | 10K rows render with virtual scrolling | Table with rows visible | B2 + B3: Cache hit, granular reactions, <500ms render |
| **3. Selection** | User clicks cell to select | Cell highlighted | B1: Delta update only (<16ms), row checkbox updated |
| **4. Multi-select** | User shift-clicks to select range | Multiple cells highlighted | B1: Delta update for range cells only (<50ms), row checkboxes updated |
| **5. Scroll** | User scrolls viewport | Rows virtualized, new rows rendered | B2: Cache hit on new cells, B3: specific viewport reaction, B4: selection classes applied to new rows |
| **6. Scroll Back** | User scrolls back to selected cells | Previously selected cells visible | B4: Selection classes preserved on newly visible rows |

**Alternative Flows:**
- If bulk select (select all): Still operates on visible viewport only (virtual scrolling limit)
- If column resize: Debounced after 150ms, then affordance re-computed only for affected columns

---

## Requirements Interview Summary

### Core Functionality

| Question | Answer | Rationale |
|----------|--------|-----------|
| Happy path? | User selects single cell, sees instant feedback | Delta update makes selection responsive |
| On failure? | If delta tracking fails, fall back to updateAllCellSelectionClasses() | Graceful degradation, no breaking changes |
| Minimal viable interaction? | Single cell selection with <33ms update | Meets 30fps target |
| Required vs optional data? | All optimization logging is dev-only | Don't impact production performance with logging |
| Role differences? | No role-based behavior, all users benefit | Performance improvement universal |

### Edge Cases

| Scenario | Handling | Rationale |
|----------|----------|-----------|
| 0 results (empty state) | No optimization needed (no cells to update) | Baseline already fast |
| 10K+ results (scale) | Virtual scrolling limits visible cells to ~50-100 | Optimization applies to visible subset |
| Concurrent edits | Selection delta tracks net change (added - removed) | Handles rapid select/deselect |
| Network interruption | N/A (client-side optimization) | No network dependency |
| Invalid input | N/A (user clicks, no input validation) | Selection always valid |

### Platform Integration Decisions

> No auxiliary systems affected - frontend-only optimization

- Notifications: N/A
- Real-time Sync: N/A
- Access Control: N/A
- Audit Logging: N/A
- Workflows: N/A
- Settings: N/A
- Feature Flags: N/A (direct optimization, no toggle needed)

### UX Decisions

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| Loading state | No change (same skeleton) | Optimization doesn't affect loading UX |
| Error recovery | Fall back to updateAllCellSelectionClasses() if delta tracking fails | Fail-safe behavior |
| Mobile vs desktop | Same optimization applies (mobile uses same grid) | Platform-agnostic |
| Keyboard shortcuts | Shift-click range selection uses delta update | Works for all selection methods |
| Accessibility | No change (same ARIA attributes) | Optimization preserves a11y |

### Frontend Technical

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| Component location | `apps/web/src/systems/vibegrid/` (existing) | No new components, refactor existing |
| Route | N/A (applies to all routes with grids) | System-level optimization |
| Store type | Extend InteractionStore with delta tracking | Minimal API change |
| State observable | Add `selectionDelta: { added: Set<string>, removed: Set<string> }` | Separate from selectedCells, preserves existing API |
| Query cache strategy | N/A (no data fetching changes) | Frontend-only |
| Form handling | N/A (no forms) | Grid interaction only |

### Backend Technical

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| Worker | N/A (frontend-only) | No backend changes |
| Router | N/A | No API changes |
| Schema | N/A | No database changes |
| Service | N/A | No service layer changes |
| Transaction scope | N/A | No transactions |
| Middleware | N/A | No middleware changes |

### Scope Boundaries

| Excluded | Reason |
|----------|--------|
| Gantt view optimization | Separate issue #1307 (different rendering path) |
| Export performance | Low priority, infrequent operation |
| Automated regression tests | Manual verification sufficient for performance work |
| Cell editing performance | Separate concern, not a hot path |

---

## Blast Radius Analysis

### Code Impact

- **Direct dependencies**:
  - `BodyRenderer.ts` - Selection reaction refactor
  - `InteractionStore.ts` - Add delta tracking
  - `ModularCellBridge.ts` - Move affordance cache invocation
  - `VisualStateStore.ts` - Split coarse-grained reactions

- **Indirect dependencies**:
  - All components using InteractionStore (CellRenderer, HeaderRenderer)
  - All field types using ModularCellBridge (TextField, NumberField, etc.)

- **Workers affected**: Web only (frontend optimization)

### Database Impact

N/A - No schema changes, no database interaction

### API Impact

- **Breaking changes**: None
- **New endpoints**: None
- **Modified contracts**: None

### Test Impact

- **Tests to update**:
  - `BodyRenderer.test.ts` - Mock delta tracking
  - `InteractionStore.test.ts` - Test delta computation

- **New test categories**:
  - Manual performance verification (selection timing, initial render)
  - Dev-only logging verification (check console output)

- **Test data requirements**:
  - Large dataset fixture (10K rows) for performance testing

### Performance Considerations

- **Query complexity**: N/A (frontend-only)
- **N+1 risks**: None
- **Caching implications**: Affordance cache optimization improves cache hit rate

### Security Review

- **Permission checks**: N/A (no permission changes)
- **Data sensitivity**: N/A (no data handling changes)
- **Input validation**: N/A (user clicks, no input validation)

---

## Design

### Overview

The optimization targets three hot paths in VibeGrid table view:

1. **Selection Delta Tracking**: Replace O(n) cell updates with O(delta) by tracking only added/removed cells in InteractionStore. ALL selection mutations MUST use centralized `applySelection()` method to ensure delta tracking and preserve selection invariants. This includes auditing SelectionController (which currently sets selectedCells directly) to route through applySelection. The selection reaction in BodyRenderer will call `updateCellSelectionByDelta(added, removed)` for cell classes AND `updateRowCheckboxesByDelta(added, removed)` for row checkboxes. Delta updates are viewport-scoped: intersect deltas with `activeRows` and visible columns before DOM updates to prevent O(n) iteration on large selections (e.g., select-all). Newly visible rows (via virtual scrolling) apply selection/checkbox state during cell creation. Viewport scroll events trigger selection class application on newly visible rows. Reaction dependencies include `selectionDelta`, `displayRows`, and `visibleColumns` to ensure selection state is reapplied when rows re-render (due to sort/filter) or columns change.

   **Selection Invariants Preserved by applySelection():**
   - `selectionVersion`: Incremented on every selection change (used by overlays/interaction logic to detect stale state)
   - `anchorCell`: Preserved across selections (not cleared unless explicit clearSelection); used for shift-click range calculations
   - `selectedRows`: Recomputed from selectedCells (derived state for row-level operations)
   - Selection mode (single/multi/range): NOT changed by applySelection (set explicitly by caller: selectCell/toggleCell/selectRange)

   Tests verify these invariants: selectionVersion increments, anchorCell preserved, selectedRows matches selectedCells, mode unchanged unless explicitly set.

2. **Affordance Cache Timing**: Move `precomputeAffordances()` invocation earlier in the render lifecycle (during column initialization in VisualStateStore.initializeColumns) to ensure cache is populated BEFORE first cell render. Cache keys use a stable deterministic hash (e.g., explicit `configHash` on column or normalized config subset) to avoid JSON.stringify instability/expense. Cache key format: `${cellType}-${configHash}` where configHash is computed once per column config and stored. Cache invalidation triggers on column config changes (documented: column resize, config.options update, cellType change). Lifecycle of cache: created during column init, invalidated on config change, recomputed on next access.

3. **Granular MobX Reactions**: Split coarse-grained reactions (e.g., entire body re-renders on any selection change) into specific observers (e.g., viewport changes → row rendering, selection changes → cell classes only). This reduces unnecessary component re-renders.

All optimizations are backwards-compatible and include fallback logic to prevent breaking changes. Target latency: <16ms for single cell selection, <50ms for range selection, <500ms for initial 10K row render.

### Architecture

```
User Click (Cell Selection)
    ↓
InteractionStore.setSelectedCells(newSet)
    ↓
Compute Delta: { added: Set<string>, removed: Set<string> }
    ↓
Reaction in BodyRenderer observes selectionDelta (not full selectedCells)
    ↓
updateCellSelectionByDelta(added, removed)
    ↓
O(delta) DOM updates instead of O(n)
```

```
Grid Initialization
    ↓
VisualStateStore.initializeColumns()
    ↓
ModularCellBridge.precomputeAffordances(columns)
    ↓
Cache populated BEFORE first cell render
    ↓
First render: Cache hit rate >90%
    ↓
Reduced computation during render
```

```
State Change (e.g., viewport scroll)
    ↓
BEFORE: Generic body reaction → entire body re-renders
    ↓
AFTER: Specific viewport reaction → only affected rows re-render
    ↓
Reduced React reconciliation overhead
```

### Key Interfaces

```typescript
// InteractionStore - Add delta tracking with centralized mutation
interface SelectionDelta {
  added: Set<string>
  removed: Set<string>
}

class InteractionStore {
  @observable selectedCells: Set<string>
  @observable selectionDelta: SelectionDelta = { added: new Set(), removed: new Set() }

  // CENTRALIZED: ALL selection mutations MUST use this method
  // Preserves selection invariants:
  // - selectionVersion incremented on each change
  // - anchorCell preserved unless explicitly cleared
  // - selectedRows recomputed from selectedCells
  // - selection mode (single/multi/range) preserved
  @action
  applySelection(newSelection: Set<string>) {
    // Compute delta
    this.selectionDelta = {
      added: new Set([...newSelection].filter(id => !this.selectedCells.has(id))),
      removed: new Set([...this.selectedCells].filter(id => !newSelection.has(id))),
    }
    this.selectedCells = newSelection

    // Update invariants
    this.selectionVersion++
    this.selectedRows = this.computeSelectedRows(newSelection)
    // anchorCell NOT cleared here - preserved across selections
    // mode NOT changed here - set explicitly by selectRange/toggleCell/etc
  }

  // Public API - all methods delegate to applySelection
  @action selectCell(cellId: string) {
    this.applySelection(new Set([...this.selectedCells, cellId]))
  }

  @action toggleCellSelection(cellId: string) {
    const newSet = new Set(this.selectedCells)
    if (newSet.has(cellId)) newSet.delete(cellId)
    else newSet.add(cellId)
    this.applySelection(newSet)
  }

  @action selectRange(cellIds: string[]) {
    this.applySelection(new Set([...this.selectedCells, ...cellIds]))
  }

  @action clearSelection() {
    this.applySelection(new Set())
  }
}

// BodyRenderer - Use delta update for cells AND row checkboxes
class BodyRenderer {
  private setupSelectionObserver(): void {
    // Reaction depends on: selectionDelta, displayRows, visibleColumns
    // Ensures selection/checkbox state reapplied when:
    // - selectionDelta changes (user selection)
    // - displayRows changes (sort, filter re-renders rows)
    // - visibleColumns changes (column show/hide)
    this.selectionObserverDisposer = reaction(
      () => ({
        delta: this.interactionStore.selectionDelta,
        displayRows: this.visualStateStore.displayRows,
        visibleColumns: this.visualStateStore.visibleColumns,
      }),
      ({ delta }) => {
        // Viewport-scoped: intersect delta with activeRows + visible columns
        const scopedAdded = this.intersectWithViewport(delta.added)
        const scopedRemoved = this.intersectWithViewport(delta.removed)

        this.updateCellSelectionByDelta(scopedAdded, scopedRemoved)
        this.updateRowCheckboxesByDelta(scopedAdded, scopedRemoved)
      },
    )
  }

  private intersectWithViewport(cellIds: Set<string>): Set<string> {
    // Filter cellIds to only those in activeRows + visible columns
    // Prevents O(n) iteration for large selections (e.g., select-all)
    const activeRowIds = new Set(this.visualStateStore.activeRows.map(r => r.id))
    const visibleColIds = new Set(this.visualStateStore.visibleColumns.map(c => c.id))

    return new Set(
      [...cellIds].filter((cellId) => {
        const [rowPart, colPart] = cellId.split('-col-')
        const rowId = rowPart.replace('row-', '')
        const colId = colPart
        return activeRowIds.has(rowId) && visibleColIds.has(colId)
      })
    )
  }

  private updateCellSelectionByDelta(added: Set<string>, removed: Set<string>): void {
    // Only update changed cells, not all visible cells
    for (const cellId of added) {
      const cell = this.getCellElement(cellId)
      cell?.classList.add('selected')
    }
    for (const cellId of removed) {
      const cell = this.getCellElement(cellId)
      cell?.classList.remove('selected')
    }
  }

  private updateRowCheckboxesByDelta(added: Set<string>, removed: Set<string>): void {
    // Extract unique row IDs from cell IDs (format: "row-{rowId}-col-{colId}")
    const affectedRows = new Set<string>()
    for (const cellId of [...added, ...removed]) {
      const rowId = cellId.split('-col-')[0]
      affectedRows.add(rowId)
    }

    // Only update checkboxes for affected rows, not all visible rows
    for (const rowId of affectedRows) {
      const checkbox = this.getRowCheckboxElement(rowId)
      const rowCells = this.getCellIdsForRow(rowId)
      const allSelected = rowCells.every(id => this.interactionStore.selectedCells.has(id))
      const someSelected = rowCells.some(id => this.interactionStore.selectedCells.has(id))

      if (checkbox) {
        checkbox.checked = allSelected
        checkbox.indeterminate = !allSelected && someSelected
      }
    }
  }

  private setupViewportScrollObserver(): void {
    // When virtual scrolling brings new rows into view, apply selection classes
    this.virtualizer.on('scroll', () => {
      const visibleRange = this.virtualizer.getVisibleRange()
      for (let rowIdx = visibleRange.start; rowIdx <= visibleRange.end; rowIdx++) {
        const rowId = `row-${rowIdx}`
        for (const column of this.columns) {
          const cellId = `${rowId}-col-${column.id}`
          const isSelected = this.interactionStore.selectedCells.has(cellId)
          const cell = this.getCellElement(cellId)
          if (cell && isSelected) {
            cell.classList.add('selected')
          }
        }
      }
    })
  }
}

// ModularCellBridge - Cache metrics with proper keying
interface AffordanceCacheMetrics {
  hits: number
  misses: number
  totalRequests: number
  hitRate: number
}

interface AffordanceCacheKey {
  cellType: string
  configHash: string
}

class ModularCellBridge {
  private affordanceCache: Map<string, Record<string, string>> = new Map()
  private cacheMetrics: AffordanceCacheMetrics = { hits: 0, misses: 0, totalRequests: 0, hitRate: 0 }

  private getCacheKey(column: Column): string {
    // Cache key = cellType + stable configHash
    // configHash computed once per column and stored as explicit property
    // Avoids JSON.stringify instability/expense
    const cellType = column.cellType || 'text'
    const configHash = column.configHash || this.computeConfigHash(column)
    return `${cellType}-${configHash}`
  }

  private computeConfigHash(column: Column): string {
    // Stable hash based on normalized config subset (not JSON.stringify)
    // Only includes affordance-relevant fields (not display-only fields)
    const config = column.config || {}
    const relevantFields = ['options', 'format', 'precision', 'minValue', 'maxValue']
    const normalized = relevantFields
      .map(key => `${key}:${config[key] ?? 'null'}`)
      .join('|')
    return btoa(normalized) // Simple deterministic hash
  }

  precomputeAffordances(columns: Column[]): void {
    // Called early in lifecycle
    for (const column of columns) {
      const cacheKey = this.getCacheKey(column)
      if (this.affordanceCache.has(cacheKey)) continue
      // ... compute and cache
      const affordances = this.computeAffordancesForColumn(column)
      this.affordanceCache.set(cacheKey, affordances)
    }
  }

  invalidateCacheForColumn(column: Column): void {
    // Invalidate on config changes:
    // - Column resize (width change affects cellType affordances)
    // - config.options update (dropdown/select options changed)
    // - cellType change (text -> number, etc.)
    // Lifecycle: created during column init, invalidated here, recomputed on next access
    const cacheKey = this.getCacheKey(column)
    this.affordanceCache.delete(cacheKey)
    // Clear configHash so next access recomputes
    delete column.configHash
  }

  getAffordances(column: Column): Record<string, string> {
    const cacheKey = this.getCacheKey(column)
    this.cacheMetrics.totalRequests++

    if (this.affordanceCache.has(cacheKey)) {
      this.cacheMetrics.hits++
      return this.affordanceCache.get(cacheKey)!
    } else {
      this.cacheMetrics.misses++
      // Cache miss - compute and store
      const affordances = this.computeAffordancesForColumn(column)
      this.affordanceCache.set(cacheKey, affordances)
      return affordances
    }
  }

  getCacheMetrics(): AffordanceCacheMetrics {
    this.cacheMetrics.hitRate = this.cacheMetrics.hits / this.cacheMetrics.totalRequests
    return this.cacheMetrics
  }
}

// Dev-only performance logging via existing infrastructure
import { getLogger } from '@/lib/logger'
const logger = getLogger('vibegrid:performance')

function logPerformance(label: string, duration: number): void {
  if (process.env.NODE_ENV === 'development') {
    logger.debug(`${label}: ${duration.toFixed(2)}ms`)
  }
}

// OR use existing VibeGrid PerformanceProfiler
import { PerformanceProfiler } from '@/systems/vibegrid/utils/performance'
const profiler = new PerformanceProfiler('selection-delta')
profiler.start()
// ... work ...
profiler.end() // Logs via getLogger internally
```

---

## Implementation

> **Note**: This section lists tasks per phase. The `phases` array in YAML frontmatter
> defines the beads that will be created when entering implementation mode.

### Phase 0: Baseline Verification (BLOCKING)

Before starting implementation, verify existing functionality works:

| Check | How to Verify |
|-------|---------------|
| Table view renders | Navigate to /projects, see grid with data |
| Cell selection works | Click cell, see highlight |
| Multi-select works | Shift-click range, see multiple cells highlighted |
| Virtual scrolling works | Scroll down, see rows render/unrender |
| No console errors | Open DevTools, check console |

**If any check fails**: STOP. File a bug. Fix baseline first.

---

### Phase 1: Selection Delta Tracking

Tasks:
- Add `selectionDelta: { added: Set<string>, removed: Set<string> }` to InteractionStore
- Add centralized `applySelection()` method that preserves invariants: selectionVersion++, selectedRows recomputed, anchorCell preserved, mode preserved
- Add TypeScript private + runtime guard to prevent direct selectedCells assignments
- Audit SelectionController for direct selectedCells mutations and route ALL through applySelection()
- Refactor ALL selection methods (selectCell, toggleCellSelection, selectRange, clearSelection) to delegate to applySelection()
- Update selection reaction to observe `{ delta, displayRows, visibleColumns }` (not just delta alone)
- Add `intersectWithViewport(cellIds)` to scope deltas to activeRows + visible columns
- Replace `updateAllCellSelectionClasses()` with `updateCellSelectionByDelta(scopedAdded, scopedRemoved)` in BodyRenderer
- Replace `updateAllRowCheckboxes()` with `updateRowCheckboxesByDelta(scopedAdded, scopedRemoved)` in BodyRenderer
- Ensure cell creation (during row render) applies selection/checkbox state from InteractionStore
- Add viewport scroll observer to apply selection classes to newly visible rows
- Add fallback to `updateAllCellSelectionClasses()` if delta logic fails
- Add performance.mark() for single cell selection latency measurement via getLogger

Verification:
- Click single cell → dev logs show viewport-scoped delta with 1 added, 0 removed
- Deselect cell → dev logs show viewport-scoped delta with 0 added, 1 removed
- Shift-click range → dev logs show viewport-scoped delta (only visible cells in range)
- Select-all (10K rows) → dev logs show viewport-scoped delta (only activeRows, not O(n))
- Row checkboxes update only for affected rows (dev logs show delta-based update)
- Scroll viewport → newly visible selected cells have selection classes applied via cell creation
- Sort/filter (displayRows changes) → selection state reapplied to re-rendered rows
- Column show/hide (visibleColumns changes) → selection state reapplied to affected cells
- Verify invariants preserved: selectionVersion incremented, anchorCell preserved, selectedRows correct
- No broken selection (visual confirmation)
- Single cell selection latency <16ms (performance.measure between click and DOM class applied)
- Range selection latency <50ms (performance.measure for shift-click range)

---

### Phase 2: Affordance Pre-computation

Tasks:
- Add `computeConfigHash()` method using normalized config subset (relevantFields only, deterministic)
- Store `configHash` as explicit property on Column during VisualStateStore.initializeColumns()
- Update cache key to `${cellType}-${column.configHash}` (read configHash property, not recompute)
- Move `precomputeAffordances()` call to VisualStateStore.initializeColumns() (BEFORE first cell render)
- Add `invalidateCacheForColumn()` method that clears configHash + cache entry
- Hook column config changes (resize, options update, cellType change) to call invalidateCacheForColumn()
- Document cache lifecycle in code comment: created (init), invalidated (config change), recomputed (next access)
- Add cache metrics tracking (hits, misses, hit rate) using getLogger (not console.log)
- Add performance.mark() for initial render timing measurement via PerformanceProfiler

Verification:
- Grid initializes → dev logs show "Affordance cache populated: X columns" with stable configHash keys
- Column.configHash exists as explicit property after init
- First cell render → dev logs show cache hit rate >90%
- Column resize → dev logs show cache invalidated (configHash cleared) only for affected columns, then recomputed on next access
- Different cell types in same column → different cache keys used (cellType prefix differs)
- Column config.options change → cache invalidated and recomputed (dev logs show miss then hit)
- Cache key stable across multiple accesses (same configHash used, not recomputed)
- Initial render (10K rows) <500ms (performance.measure from mount to first paint)
- No broken cell rendering (visual confirmation)

---

### Phase 3: Granular MobX Reactions

Tasks:
- Audit all reactions in BodyRenderer (selection, viewport, columns)
- Split generic "body re-render" reactions into specific observers:
  - `viewportReaction` → only row virtualization
  - `selectionReaction` → only cell classes (already delta in P1)
  - `columnReaction` → only header/cell width
- Add dev-only logging for reaction execution times
- Use MobX Spy in dev to verify reaction granularity

Verification:
- Scroll viewport → only viewport reaction fires, not selection reaction
- Select cell → only selection reaction fires, not viewport reaction
- Resize column → only column reaction fires
- Dev logs show specific reaction names, not generic "re-render"
- Frame time <33ms during interactions

Browser smoke test:
- Navigate to /projects with 10K rows
- Select single cell (verify instant feedback)
- Shift-click range (verify smooth multi-select)
- Scroll viewport (verify smooth scrolling)
- Take screenshots of DevTools Performance tab showing <33ms frames

---

### Implementation Summary

| Phase | Focus | Key Verification |
|-------|-------|------------------|
| P0 | Baseline | Table view works, no console errors |
| P1 | Delta Tracking | Viewport-scoped deltas (activeRows+visibleColumns), SelectionController audited, invariants preserved (selectionVersion/anchorCell/selectedRows/mode), displayRows/visibleColumns in reaction dependencies, single cell <16ms, range <50ms |
| P2 | Affordance Cache | Stable configHash (not JSON.stringify), cache hit rate >90%, lifecycle documented (init/invalidate/recompute), initial render <500ms, logging via getLogger |
| P3 | MobX Reactions | Specific reactions fire, no coarse re-renders |

---

## Testing

### Unit Tests

- [ ] InteractionStore.setSelectedCells() computes correct delta
- [ ] BodyRenderer.updateCellSelectionByDelta() updates only changed cells
- [ ] ModularCellBridge.getAffordances() tracks cache metrics correctly

### Integration Tests

- [ ] Selection delta integrates with BodyRenderer reaction
- [ ] Affordance cache populated during column initialization
- [ ] Granular reactions fire on correct state changes

### E2E Tests

N/A - Manual verification only (performance work)

### Manual Testing

- [ ] Test as admin with 10K row dataset
- [ ] Test single cell selection (verify instant feedback)
- [ ] Test shift-click range selection (verify smooth)
- [ ] Test viewport scrolling (verify smooth)
- [ ] Verify dev logs show performance metrics
- [ ] Verify Chrome DevTools Performance tab shows <33ms frames
- [ ] Test edge cases:
  - [ ] Empty grid (no cells to select)
  - [ ] Bulk select all (visible viewport only)
  - [ ] Rapid select/deselect (interleaved deltas)
  - [ ] Column resize during selection (affordance re-computed)

---

## Rollout

### Feature Flag

N/A - Direct optimization, no feature flag

### Rollback

1. Git revert to previous commit
2. Deploy immediately if performance regression detected
3. No user notification needed (no user-facing changes)

---

## Decision Log

### Decision 1: Delta Tracking Separate from selectedCells
**Date**: 2026-01-23
**Chose**: Add `selectionDelta` observable separate from `selectedCells`
**Over**: Replacing `selectedCells` with delta-only state
**Reason**: Preserves existing API for components that rely on full selection set, backwards compatible

### Decision 2: Fallback to updateAllCellSelectionClasses()
**Date**: 2026-01-23
**Chose**: Add try-catch fallback to full update if delta logic fails
**Over**: Delta-only with no fallback
**Reason**: Safety net to prevent breaking selection if delta computation has bugs

### Decision 3: Dev-Only Logging
**Date**: 2026-01-23
**Chose**: Gate all performance logs behind `process.env.NODE_ENV === 'development'`
**Over**: Production logging with feature flag
**Reason**: No impact on production performance, dev logs sufficient for monitoring

### Decision 4: Manual Verification Only
**Date**: 2026-01-23
**Chose**: No automated regression tests for performance
**Over**: Automated frame timing tests
**Reason**: Performance tests are flaky, manual verification with Chrome DevTools is more reliable

### Decision 5: Stable configHash Property Over JSON.stringify
**Date**: 2026-01-23 (Codex review #2)
**Chose**: Compute configHash once during column init, store as explicit property, use normalized subset
**Over**: JSON.stringify on every cache access
**Reason**: JSON.stringify is unstable (key order) and expensive (repeated computation). Normalized subset (relevantFields only) is deterministic and cheap.

### Decision 6: Viewport-Scoped Delta Updates
**Date**: 2026-01-23 (Codex review #2)
**Chose**: Intersect deltas with activeRows + visibleColumns before DOM updates
**Over**: Iterate all cells in delta (including offscreen)
**Reason**: Select-all or large range selections produce O(n) deltas. Scoping to viewport keeps updates O(activeRows) regardless of selection size.

### Decision 7: Selection Invariants Preservation
**Date**: 2026-01-23 (Codex review #2)
**Chose**: Document and test that applySelection() preserves selectionVersion, anchorCell, selectedRows, mode
**Over**: Implicit preservation without documentation
**Reason**: Overlays and interaction logic depend on these invariants. Explicit documentation + tests prevent regressions.

---

## Related Work

- [GH#1307 - Gantt View Optimization](../1307-gantt-view-optimization.md) (separate but related)
- [VibeGrid Core](../../docs/features/vibegrid/core.md) (feature doc)
- [VibeGrid Interactions](../../.claude/rules/vibegrid-interactions.md) (rule file)
