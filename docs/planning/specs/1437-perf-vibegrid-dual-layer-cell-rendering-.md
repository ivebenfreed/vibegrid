---
initiative: GH#1437-perf-vibegrid-dual-layer-cell-rendering-
type: feature
issue_type: feature
status: approved
priority: high
roadmap: null
owner: null
github_issue: 1437
github_milestone: null
created: 2026-01-31
updated: 2026-01-31
epic: 187
template: frontend-only
phases:
  - id: P1
    title: "Shell Cell Creation"
    risk: high
    tasks:
      - "Create createShellCell() method in BodyRenderer or ModularCellBridge"
      - "Implement lightweight shell: single div, position+width only, textContent from formatter"
      - "No createElement for inner content, no MobX reads, no affordance attrs, no interaction handlers"
      - "Verify: shell cells render with correct text content and positioning"
    files:
      - apps/web/src/systems/vibegrid/renderers/components/BodyRenderer.ts
      - apps/web/src/systems/vibegrid/field-types/ModularCellBridge.ts
  - id: P2
    title: "Upgrade Scheduler"
    risk: medium
    tasks:
      - "Create CellUpgradeScheduler class with hybrid scheduling (rAF for viewport, rIC for buffer)"
      - "Track shell→rich state per cell (data attribute or WeakMap)"
      - "Implement cancellation: skip upgrade if cell scrolls out before upgrade runs"
      - "Integrate scheduler into SimplePassiveRenderer lifecycle"
      - "Verify: viewport cells upgrade within 1-2 frames, buffer cells upgrade during idle"
    files:
      - apps/web/src/systems/vibegrid/renderers/core/CellUpgradeScheduler.ts
      - apps/web/src/systems/vibegrid/renderers/core/SimplePassiveRenderer.ts
  - id: P3
    title: "All Cell Path Integration"
    risk: medium
    tasks:
      - "updateVirtualColumns(): use shell cells in processRow, queue upgrades"
      - "renderBody(): shell cells for initial render, queue immediate upgrades"
      - "updateVirtualRows(): shell cells for new rows entering, queue upgrades"
      - "recycleRowForNewData(): reset to shell state on recycle, re-queue upgrade"
      - "Verify: all 4 creation paths use shell→rich pattern, no visual flash during transitions"
    files:
      - apps/web/src/systems/vibegrid/renderers/core/SimplePassiveRenderer.ts
      - apps/web/src/systems/vibegrid/renderers/components/BodyRenderer.ts
  - id: P4
    title: "Selection Delta Optimization (from GH#1306)"
    risk: medium
    tasks:
      - "Implement delta-based selection tracking in InteractionStore"
      - "Update only cells that changed selection state (not all cells on selection change)"
      - "Pre-compute affordance attributes at column definition time (cache in fieldTypeRegistry)"
      - "Add granular MobX reactions scoped to viewport-visible rows only"
      - "Close GH#1306 as absorbed by this issue"
      - "Verify: selection changes only trigger updates on delta cells, not entire grid"
    files:
      - apps/web/src/systems/vibegrid/stores/InteractionStore.ts
      - apps/web/src/systems/vibegrid/field-types/ModularCellBridge.ts
      - apps/web/src/systems/vibegrid/field-types/FieldTypeRegistry.ts
  - id: P5
    title: "Validation & Cleanup"
    risk: low
    tasks:
      - "DevTools performance timeline recordings on GC Projects view (15-20+ columns)"
      - "Verify 60fps during horizontal scroll (frame times <16ms)"
      - "Verify 60fps during vertical scroll (no regression)"
      - "Record evidence: before/after timeline screenshots, frame time metrics"
      - "Close GH#1180 (cell rendering perf) and GH#1306 (selection delta)"
      - "Update GH#1437 with evidence and close"
    files: []
---

# Spec: VibeGrid Dual-Layer Cell Rendering for Scroll Performance

> GitHub Issue: [#1437](https://github.com/baseplane-ai/baseplane/issues/1437)
> Epic: [#187](https://github.com/baseplane-ai/baseplane/issues/187) (VibeGrid)
> Predecessor: [#1435](https://github.com/baseplane-ai/baseplane/issues/1435) (Incremental Column Virtualization)
> Absorbs: [#1306](https://github.com/baseplane-ai/baseplane/issues/1306) (Cell Rendering Optimization)
> Closes: [#1180](https://github.com/baseplane-ai/baseplane/issues/1180) (Cell Rendering Performance)

## 0. Problem Statement

**PR #1436 (issue #1435) fixed the DOM rebuild-per-scroll problem** with incremental `updateVirtualColumns()`, eliminating full `renderBody()` calls on horizontal scroll. However, **per-cell creation cost remains the bottleneck** at ~0.67ms per cell.

**Current bottleneck:** During horizontal scroll with 10 viewport rows × 3 entering columns = 30 cells × 0.67ms = **20ms per scroll event** — exceeds the 16ms frame budget for 60fps.

**Root cause analysis** (from `BodyRenderer.createCellElement()` → `ModularCellBridge.createCellFast()`):

1. **2x `document.createElement()`** - Outer container + inner field type content
2. **3x MobX observable reads** - Expansion state, selection state, column width (per cell)
3. **8-12x `setAttribute()`** - Data attributes for columnId, field, rowId, testid, affordances (2-3x)
4. **Field type renderer dispatch** - `fieldType.renderer.render()` creates styled inner element
5. **Affordance resolution** - Cached per column but still involves Map lookup + attribute writes

**Total: ~0.5-0.75ms per cell** on moderately powerful hardware.

**Existing optimizations already in place:**
- Row recycling pool (reuse DOM elements) ✓
- Progressive column rendering (first 6 sync, rest deferred via `requestIdleCallback`) ✓
- Two-pass column updates in `updateVirtualColumns()` (viewport sync, buffer deferred) ✓
- Affordance cache (Map per column) ✓
- Pre-computed layout maps passed to rows ✓
- CSS-based static styles (only dynamic values inline) ✓

**Why more optimization is possible:** The incremental column rendering in #1435 already proved that deferred work is viable. This issue extends that pattern to individual cells — render a "shell" during scroll, upgrade to "rich" during idle.

## 1. Acceptance Criteria

| ID | Criterion | Phase |
|----|-----------|-------|
| AC1 | Shell cells render with <0.1ms creation time (no createElement chains, no MobX reads) | P1 |
| AC2 | Shell cells show meaningful text content (formatted value, no blank cells) | P1 |
| AC3 | Shell→rich upgrade is invisible to user (no layout shift, no flash) | P2 |
| AC4 | Viewport cells upgrade via rAF (highest priority, within 1-2 frames) | P2 |
| AC5 | Buffer cells upgrade via rIC (low priority, when browser idle) | P2 |
| AC6 | All 4 cell creation paths use shell→rich pattern (renderBody, updateVirtualColumns, updateVirtualRows, recycleRowForNewData) | P3 |
| AC7 | Selection changes trigger delta updates only (not full grid re-render) | P4 |
| AC8 | Horizontal scroll maintains 60fps on 15-20+ column grids (frame times <16ms) | P5 |
| AC9 | No regression on vertical scroll performance | P5 |

## 2. Metrics

| Metric | Current (Post-#1435) | Target (This Issue) |
|--------|----------------------|---------------------|
| Cell creation time | ~0.67ms (full rich cell) | ~0.05ms (shell) + deferred upgrade |
| Horizontal scroll frame time | ~20ms (30 cells × 0.67ms) | ~5ms (30 shells × 0.05ms + deferred upgrade) |
| Frame rate during horizontal scroll | ~30-40fps (missed frames) | 60fps (16ms budget) |
| MobX reads per cell (scroll-time) | 3 (expansion, selection, width) | 0 (shell has no reactivity) |
| `setAttribute` calls per cell (scroll-time) | 8-12 | 0 (shell has no attributes) |
| Shell→rich upgrade latency | N/A | <33ms for viewport (2 frames), <100ms for buffer (idle) |

---

## Phase P1: Shell Cell Creation

**Risk:** High | **Impact:** Highest — establishes the foundation for all scroll-time perf gains

### Architecture

**Two cell rendering modes:**

| Mode | When Created | Cost | Content | Attributes | MobX | Handlers |
|------|--------------|------|---------|------------|------|----------|
| **Shell** | Scroll-time (sync) | ~0.05ms | textContent only (formatted value) | None | No reads | None |
| **Rich** | Idle-time (async) | ~0.67ms | Full field type render | 8-12 attrs | 3 reads | Full |

**Shell cell structure:**
```typescript
const shell = document.createElement('div')
shell.className = 'vibegridx-cell vibegridx-cell--shell'  // Marker class for upgrade tracking
shell.style.position = 'absolute'
shell.style.left = `${xPosition}px`
shell.style.width = `${width}px`
shell.textContent = column.formatter(value, rowData, column)  // Formatted text only
// NO: affordance attrs, data-* attrs, inner createElement, MobX reads, handlers
```

**Rich cell structure** (existing `createCellFast()` output):
```typescript
const rich = document.createElement('div')
rich.className = 'vibegridx-cell'
rich.style.left = `${xPosition}px`
rich.style.width = `${width}px`
rich.dataset.columnId = column.id
rich.dataset.field = column.field
// ... 8-12 total attributes
// ... MobX reads (expansion, selection, width)
// ... field type renderer creates inner content
// ... interaction handlers attached
```

### Implementation

1. **New method: `createShellCell()` in BodyRenderer or ModularCellBridge**
   - Single `createElement('div')` only
   - `className = 'vibegridx-cell vibegridx-cell--shell'`
   - Inline styles: `position`, `left`, `width` only
   - `textContent = column.formatter(value, rowData, column)` — formatted display value
   - No MobX reads, no affordance resolution, no data attributes, no handlers
   - Target: <0.1ms creation time

2. **Marker class for upgrade tracking**
   - `.vibegridx-cell--shell` indicates "not yet upgraded"
   - Scheduler queries for shells: `container.querySelectorAll('.vibegridx-cell--shell')`
   - On upgrade: remove `--shell` class, add full attributes/handlers

3. **Formatter requirement — "Fast Formatter" contract**
   - All columns MUST have a `formatter` function (already enforced in column definitions)
   - Formatter returns plain string (no HTML, just text)
   - **Fast formatter contract:** Formatters used for shell cells MUST be:
     - **Pure** — no MobX reads, no side effects
     - **Non-reactive** — does not access observable stores
     - **O(1)** — constant time (no array scans, no expensive string ops)
   - If a formatter violates this contract, pre-compute display strings when row data updates (cache in `row._displayCache[columnId]`)
   - Existing formatters (currency, date, status, text) are already pure and O(1)

### Edge Cases

| Edge Case | Handling |
|-----------|----------|
| Column has no formatter | Fallback to `String(value ?? '')` |
| Value is undefined/null | Display empty string (not "undefined") |
| Field type renderer throws | Shell still shows formatted text (graceful degradation) |
| Cell width changes before upgrade | Shell uses stale width (upgrade will fix) |
| Formatter reads MobX observables | Pre-compute display value at data-update time, cache in `row._displayCache` |
| Status/badge columns (no text representation) | Shell shows status name as text; CSS class `vibegridx-cell--shell` applies matching typography (font-size, line-height, padding) to prevent layout shift on upgrade |

### Verification

- Create shell cells for 100 columns, measure total time (<10ms for 100 cells = <0.1ms each)
- Shell cells show correct formatted text (currency, dates, status names)
- Shell cells positioned correctly (match header column offsets)
- No console errors or warnings during shell creation

---

## Phase P2: Upgrade Scheduler

**Risk:** Medium | **Complexity:** Hybrid scheduling with cancellation logic

### Architecture

**CellUpgradeScheduler** - Manages the shell→rich upgrade lifecycle with hybrid scheduling.

```typescript
class CellUpgradeScheduler {
  private viewportQueue: Set<HTMLElement> = new Set()  // Viewport cells (high priority)
  private bufferQueue: Set<HTMLElement> = new Set()    // Buffer cells (low priority)
  private rafId: number | null = null
  private ricId: number | null = null

  // Mark cell for upgrade
  scheduleUpgrade(cellElement: HTMLElement, isViewport: boolean): void

  // Process viewport queue via rAF
  private processViewportQueue(): void

  // Process buffer queue via rIC
  private processBufferQueue(deadline: IdleDeadline): void

  // Cancel upgrade if cell scrolls out
  cancelUpgrade(cellElement: HTMLElement): void

  // Upgrade single cell from shell to rich
  private upgradeCell(cellElement: HTMLElement): void
}
```

**Scheduling logic:**

1. **Viewport cells** (visible on screen):
   - Queue in `viewportQueue`
   - Schedule via `requestAnimationFrame()`
   - Process immediately after next paint (highest priority)
   - Target: upgrade within 1-2 frames (~16-33ms)

2. **Buffer cells** (off-screen but pre-rendered):
   - Queue in `bufferQueue`
   - Schedule via `requestIdleCallback({ timeout: 100 })`
   - Process during browser idle time (low priority)
   - Target: upgrade within 100ms or when browser idle

3. **Cancellation**:
   - If cell scrolls out of buffer before upgrade → remove from queue
   - Detect via `MutationObserver` on cell removal OR explicit `cancelUpgrade()` call
   - Prevents wasted work on cells that scrolled away

4. **requestIdleCallback fallback**:
   - `requestIdleCallback` is not available in all browsers (Safari support is recent)
   - Fallback: `setTimeout(callback, 1)` behind a scheduler abstraction
   - `const scheduleIdle = window.requestIdleCallback ?? ((cb) => setTimeout(() => cb({ timeRemaining: () => 8, didTimeout: false }), 1))`

### Upgrade Process (Shell → Rich) — In-Place Mutation

**Critical:** Upgrades mutate the existing shell element in-place (NOT replaceChild). This preserves focus, selection, and ARIA state if the user interacts with a shell before upgrade.

```typescript
private upgradeCell(cellElement: HTMLElement): void {
  // 0. Skip if cell is being edited or has focus
  if (cellElement === document.activeElement || cellElement.contains(document.activeElement)) {
    return  // Re-queue for next frame
  }

  // 1. Extract metadata from shell
  const rowId = cellElement.dataset.rowId
  const columnId = cellElement.dataset.columnId

  // 2. Fetch row data and column definition
  const row = this.getRowData(rowId)
  const column = this.getColumn(columnId)

  // 3. IN-PLACE upgrade: mutate existing element
  // Clear shell text content
  cellElement.textContent = ''

  // Add rich attributes
  cellElement.dataset.field = column.field || column.id
  cellElement.setAttribute('data-testid', `cell-${rowId}-${columnId}`)
  if (column.fieldType) {
    cellElement.setAttribute('data-field-type', column.fieldType.type)
  }

  // Add affordance attributes (pre-computed per column)
  const affordanceAttrs = column._precomputedAffordances || this.resolveAffordances(column)
  for (const [key, value] of Object.entries(affordanceAttrs)) {
    cellElement.setAttribute(key, value)
  }

  // Render inner content via field type renderer
  if (column.fieldType?.renderer) {
    const content = column.fieldType.renderer.render(value, column, row)
    cellElement.appendChild(content)
  } else if (column.formatter) {
    cellElement.textContent = column.formatter(value, row, column)
  }

  // Read MobX state and apply
  const isSelected = this.interactionStore.selectedCells.has(`${rowId}:${columnId}`)
  if (isSelected) cellElement.classList.add('vibegridx-selected')

  const isExpanded = this.interactionStore.expandedRowIds.has(rowId)
  // ... apply expansion state if needed

  // 4. Remove shell marker
  cellElement.classList.remove('vibegridx-cell--shell')

  // 5. Remove from queues
  this.viewportQueue.delete(cellElement)
  this.bufferQueue.delete(cellElement)
}
```

**Critical: Shell must have minimal metadata for upgrade**
- `data-row-id` and `data-column-id` attributes on shell (ONLY these two)
- Scheduler uses these to fetch full row/column data for upgrade
- This violates "no attributes" rule for shell, but required for upgrade lookup

**Revised shell structure:**
```typescript
const shell = document.createElement('div')
shell.className = 'vibegridx-cell vibegridx-cell--shell'
shell.style.position = 'absolute'
shell.style.left = `${xPosition}px`
shell.style.width = `${width}px`
shell.dataset.rowId = row.id      // Required for upgrade
shell.dataset.columnId = column.id // Required for upgrade
shell.textContent = column.formatter(value, rowData, column)
```

### Integration Points

1. **SimplePassiveRenderer lifecycle**
   - Instantiate `CellUpgradeScheduler` in constructor
   - Hook into scroll observer: determine viewport vs buffer cells
   - Call `scheduler.scheduleUpgrade(cell, isViewport)` for each shell created
   - Call `scheduler.cancelUpgrade(cell)` when cell removed (leaving, recycling)

2. **Viewport detection**
   - Use `VisualStateStore.visibleColumnRange` and `visibleRowRange` to determine viewport
   - Cells within viewport → `isViewport = true` → rAF queue
   - Cells in buffer (outside viewport but rendered) → `isViewport = false` → rIC queue

### Edge Cases

| Edge Case | Handling |
|-----------|----------|
| User scrolls faster than upgrade can process | Cancel buffer upgrades, prioritize viewport |
| Cell gets selected before upgrade | Upgrade immediately (selection interaction requires rich cell) |
| Cell gets edited before upgrade | Upgrade immediately (edit session requires handlers) |
| Browser never goes idle (heavy load) | `requestIdleCallback({ timeout: 100 })` forces upgrade after 100ms |
| Scheduler queues overflow (>1000 cells) | Process in batches, skip buffer cells if queue too large |

### Verification

- Create 100 shell cells, verify viewport cells upgrade within 33ms (2 frames)
- Create 100 shell cells, verify buffer cells upgrade within 100ms or idle
- Scroll away before upgrade completes, verify cancelled cells don't upgrade
- Monitor `performance.now()` for upgrade timing, log slow upgrades (>50ms per cell)

---

## Phase P3: All Cell Path Integration

**Risk:** Medium | **Scope:** 4 cell creation paths must adopt shell→rich pattern

### Four Cell Creation Paths in VibeGrid

| Path | File | Method | When Triggered | Current Behavior |
|------|------|--------|----------------|------------------|
| 1. Initial render | SimplePassiveRenderer.ts | `renderBody()` | First render, structure changes | Creates all cells as rich (full) |
| 2. Horizontal scroll | SimplePassiveRenderer.ts | `updateVirtualColumns()` | Column range change | Adds delta cells as rich (GH#1435 fix) |
| 3. Vertical scroll | SimplePassiveRenderer.ts | `updateVirtualRows()` | Row range change | Adds delta rows as rich |
| 4. Row recycling | SimplePassiveRenderer.ts | `recycleRowForNewData()` | Scroll reuses DOM row | Updates cells in-place (rich) |

**Target state:** All 4 paths create shell cells during scroll, queue upgrades.

### Implementation per Path

#### 1. renderBody() - Initial Render

**Current:**
```typescript
renderBody(): void {
  for each row:
    for each column:
      cell = bodyRenderer.createCellElement(row, column)  // Rich
      row.appendChild(cell)
}
```

**New:**
```typescript
renderBody(): void {
  for each row:
    for each column:
      cell = bodyRenderer.createShellCell(row, column)  // Shell
      row.appendChild(cell)
      scheduler.scheduleUpgrade(cell, isInViewport(column))
}
```

**Rationale:** Initial render is not scroll-time-sensitive, but still benefits from progressive enhancement. Render shells fast, upgrade to rich during first idle period. Perceived load time improves.

#### 2. updateVirtualColumns() - Horizontal Scroll

**Current** (from GH#1435):
```typescript
updateVirtualColumns(prev, current): void {
  const entering = computeEnteringColumns(prev, current)
  for each active row:
    for each entering column:
      cell = bodyRenderer.createCellElement(row, column)  // Rich
      insertCellAtCorrectPosition(row, cell)
}
```

**New:**
```typescript
updateVirtualColumns(prev, current): void {
  const entering = computeEnteringColumns(prev, current)
  for each active row:
    for each entering column:
      cell = bodyRenderer.createShellCell(row, column)  // Shell
      insertCellAtCorrectPosition(row, cell)
      scheduler.scheduleUpgrade(cell, isInViewport(column))
}
```

**Rationale:** This is the PRIMARY scroll-time bottleneck this issue addresses. Shell cells eliminate 20ms → ~2ms for 30 entering cells.

#### 3. updateVirtualRows() - Vertical Scroll

**Current:**
```typescript
updateVirtualRows(prev, current): void {
  const entering = computeEnteringRows(prev, current)
  for each entering row:
    rowElement = createRowElement(row)  // Creates all cells as rich
    container.appendChild(rowElement)
}
```

**New:**
```typescript
updateVirtualRows(prev, current): void {
  const entering = computeEnteringRows(prev, current)
  for each entering row:
    rowElement = createRowElement(row)  // Creates all cells as shell
    container.appendChild(rowElement)
    for each cell in rowElement:
      scheduler.scheduleUpgrade(cell, isInViewport(cell))
}
```

**Note:** `createRowElement()` internally calls `createCellElement()` for each column. Need to add `useShellCells` parameter or detect context (scroll vs initial render).

#### 4. recycleRowForNewData() - Row Recycling

**Current:**
```typescript
recycleRowForNewData(rowElement, newRowData): void {
  for each cell in row:
    updateCellContent(cell, newRowData[column.id])  // Updates rich cell in-place
}
```

**New:**
```typescript
recycleRowForNewData(rowElement, newRowData): void {
  // Reset all cells to shell state
  for each cell in row:
    resetToShellCell(cell, newRowData[column.id])  // Downgrade to shell
    scheduler.scheduleUpgrade(cell, isInViewport(cell))
}
```

**Rationale:** Recycling happens during scroll. Downgrading to shell + re-upgrading is faster than updating rich cell in-place (fewer DOM writes).

**Helper: `resetToShellCell()`**
```typescript
resetToShellCell(cellElement: HTMLElement, value: any, column: Column): void {
  // Strip all attributes except rowId/columnId
  cellElement.className = 'vibegridx-cell vibegridx-cell--shell'
  cellElement.textContent = column.formatter(value, rowData, column)
  // Remove data-* attrs except rowId/columnId (keep for upgrade)
  for (const attr of Array.from(cellElement.attributes)) {
    if (attr.name !== 'data-row-id' && attr.name !== 'data-column-id') {
      cellElement.removeAttribute(attr.name)
    }
  }
  // Remove inner content elements
  while (cellElement.firstChild) cellElement.removeChild(cellElement.firstChild)
}
```

### Context Detection: When to Use Shell vs Rich

**Problem:** Some cell creation paths are NOT scroll-time-sensitive (e.g., column visibility toggle, manual refresh).

**Solution:** Add context parameter to `createCellElement()`:

```typescript
createCellElement(
  row: any,
  column: any,
  colIndex: number,
  context: 'scroll' | 'initial' | 'manual' = 'scroll'
): HTMLElement {
  if (context === 'scroll') {
    return this.createShellCell(row, column, colIndex)  // Scroll-time optimization
  } else {
    return this.createRichCell(row, column, colIndex)   // Full cell immediately
  }
}
```

**When to use each context:**
- `'scroll'` - `updateVirtualColumns()`, `updateVirtualRows()`, `recycleRowForNewData()`
- `'initial'` - `renderBody()` on first render
- `'manual'` - Column visibility toggle, sort change, filter change (user expects immediate full render)

### Edge Cases

| Edge Case | Handling |
|-----------|----------|
| User triggers column visibility toggle during scroll | Use `'manual'` context, create rich cells immediately (no shell) |
| User triggers sort during scroll | Full `renderBody()` with rich cells (sort is structural change) |
| Rapid scroll reverses direction before upgrade | Cancel pending upgrades for leaving cells, queue new entering cells |
| Selection overlay positioning with shell cells | Overlay uses row/column IDs (not cell attributes), works with shell |

### Verification

- Horizontal scroll: verify `updateVirtualColumns()` creates shells, upgrades within 2 frames
- Vertical scroll: verify `updateVirtualRows()` creates shells, upgrades within 2 frames
- Row recycling: verify shells created, no visual flash during recycle
- Column visibility toggle: verify rich cells created immediately (not shells)
- Manual refresh: verify rich cells created immediately
- No visual artifacts (missing cells, misaligned content) during fast scroll

---

## Phase P4: Selection Delta Optimization (Absorbs GH#1306)

**Risk:** Medium | **Impact:** Eliminates selection-induced full grid re-renders

**Context:** This phase absorbs issue #1306 (Cell Rendering Optimization - Selection Delta + Affordance Pre-computation). The selection delta work was deferred from #1306 and now integrates with the dual-layer architecture.

### Current Problem

**Selection changes trigger full grid updates** due to MobX reactivity:

1. User clicks cell → `interactionStore.selectedCells.add(cellId)`
2. MobX detects `selectedCells` change
3. All components observing `selectedCells` re-render (entire grid body)
4. Each cell re-evaluates `interactionStore.selectedCells.has(cellId)` (O(n) total work)

**Scale:** For a 100-row grid, selecting 1 cell causes 100+ cell updates.

### Solution: Delta-Based Selection Tracking

**New architecture in InteractionStore:**

```typescript
class InteractionStore {
  @observable selectedCells = new Set<string>()  // Existing

  // NEW: Track delta since last render
  @observable private selectionDelta: {
    added: Set<string>
    removed: Set<string>
  } = { added: new Set(), removed: new Set() }

  @action selectCell(cellId: string): void {
    if (!this.selectedCells.has(cellId)) {
      this.selectedCells.add(cellId)
      this.selectionDelta.added.add(cellId)
      this.selectionDelta.removed.delete(cellId)  // Cancel if was in removed
      this.notifySelectionDelta()  // Trigger delta update only
    }
  }

  @action deselectCell(cellId: string): void {
    if (this.selectedCells.has(cellId)) {
      this.selectedCells.delete(cellId)
      this.selectionDelta.removed.add(cellId)
      this.selectionDelta.added.delete(cellId)  // Cancel if was in added
      this.notifySelectionDelta()
    }
  }

  @action clearSelectionDelta(): void {
    this.selectionDelta.added.clear()
    this.selectionDelta.removed.clear()
  }

  @computed get selectionDeltaSnapshot() {
    return {
      added: Array.from(this.selectionDelta.added),
      removed: Array.from(this.selectionDelta.removed),
    }
  }
}
```

**Renderer integration** (in SimplePassiveRenderer or BodyRenderer):

```typescript
// Subscribe to delta updates only (not full selectedCells observable)
reaction(
  () => this.interactionStore.selectionDeltaSnapshot,
  (delta) => {
    // Update only cells that changed selection state
    for (const cellId of delta.added) {
      const cellElement = this.getCellElement(cellId)
      cellElement?.classList.add('vibegridx-selected')
      // If shell cell, upgrade immediately (selection requires rich)
      if (cellElement?.classList.contains('vibegridx-cell--shell')) {
        this.scheduler.upgradeCell(cellElement)
      }
    }

    for (const cellId of delta.removed) {
      const cellElement = this.getCellElement(cellId)
      cellElement?.classList.remove('vibegridx-selected')
    }

    // Clear delta after processing
    this.interactionStore.clearSelectionDelta()
  }
)
```

### Affordance Pre-computation (from GH#1306)

**Current problem:** Affordance resolution happens per cell during `createCellFast()`:

```typescript
// Inside ModularCellBridge.createCellFast() - runs for EVERY cell
let cachedAttrs = this.affordanceCache.get(column.id)
if (!cachedAttrs) {
  const resolved = affordanceResolver.resolve(column.fieldType, column)
  const attrs = affordanceResolver.getDataAttributes(resolved)
  cachedAttrs = attrs.container
  this.affordanceCache.set(column.id, cachedAttrs)
}
```

**This is already optimized** (cache hit on 2nd+ cell in column), but cache miss on first cell is expensive.

**New: Pre-compute at column definition time (per-column, not per-field-type):**

Affordances can vary per column even within the same field type (e.g., a "text" column with sortable vs non-sortable). Pre-compute per column definition:

```typescript
// In ModularCellBridge.initialize() or when columns change
precomputeAffordances(columns: Column[]): void {
  for (const column of columns) {
    if (column.fieldType) {
      const resolved = affordanceResolver.resolve(column.fieldType, column)
      const attrs = affordanceResolver.getDataAttributes(resolved)
      column._precomputedAffordances = attrs.container  // Store on column object
    }
  }
}

// In upgrade path — use pre-computed from column
const affordanceAttrs = column._precomputedAffordances
if (affordanceAttrs) {
  for (const [key, value] of Object.entries(affordanceAttrs)) {
    container.setAttribute(key, value)
  }
}
```

**Impact:** Eliminates affordance resolution from hot path entirely. Attributes are pre-computed once per column definition, not per cell. Respects column-specific affordance differences.

### Granular MobX Reactions — Delta-Only (No Viewport Autorun)

**Current problem:** Grid body observes global `selectedCells` observable, triggering re-render on any selection change.

**Solution:** Use delta-based reaction as the SOLE selection update mechanism. No viewport-scoped autorun (as clarified in R3 above). The delta reaction is O(delta), making it strictly better than any O(viewport) autorun.

**Selection state on initial render / scroll:** When cells enter the viewport (via shell creation + upgrade), the upgrade process reads `interactionStore.selectedCells.has(cellId)` to apply the correct initial selection state. This handles the "catch-up" case — cells that were selected while off-screen get the correct class when upgraded.

**Impact:** Selection changes only update the delta cells. Cells outside viewport are inert until upgraded.

### Edge Cases

| Edge Case | Handling |
|-----------|----------|
| Bulk selection (select all 1000 rows) | Delta has 1000 added entries, still O(delta) not O(n) grid cells |
| Deselect all | Delta has 1000 removed entries, process in batches to avoid jank |
| Selection during scroll | Viewport-scoped reactions only update visible cells, buffer cells ignored |
| Shell cell gets selected | Immediate upgrade to rich cell (selection requires handlers) |

### Verification

- Select 1 cell in 1000-row grid, verify only 1 cell updates (not 1000)
- Bulk select 100 rows, verify delta updates in <16ms (batch processing)
- Monitor MobX reactions: verify only viewport cells have active subscriptions
- Scroll during selection, verify buffer cells don't trigger reactions

### Close GH#1306

**When P4 completes:**
- Add comment to GH#1306: "Absorbed by GH#1437 Phase P4 - Selection delta and affordance pre-computation implemented"
- Close GH#1306 with label `duplicate/absorbed`
- Reference GH#1437 in closing comment

---

## Phase P5: Validation & Cleanup

**Risk:** Low | **Purpose:** Evidence collection and issue closure

### DevTools Performance Timeline Recording

**Target scenario:** GC Projects view (15-20+ columns, 50+ rows)

**Recordings to capture:**

1. **Before (baseline):**
   - Horizontal scroll (left to right, 5 columns worth of scroll distance)
   - Vertical scroll (up and down, 10 rows worth)
   - Selection change (click 1 cell)
   - Bulk selection (select 10 rows)

2. **After (this issue):**
   - Same 4 scenarios
   - Record frame times, long tasks, scripting time

**Metrics to extract:**

| Metric | Baseline (Before) | Target (After) | Evidence Location |
|--------|-------------------|----------------|-------------------|
| Horizontal scroll frame time | ~20-30ms | <16ms (60fps) | Performance timeline "Frames" track |
| Scripting time during scroll | ~25ms | <10ms | Timeline "Scripting" breakdown |
| Cell creation time (per cell) | ~0.67ms | ~0.05ms (shell) | Custom performance.mark() logs |
| Selection update time (1 cell) | ~50ms (full grid) | ~2ms (delta only) | Timeline "Scripting" breakdown |

**Tools:**
- Chrome DevTools > Performance tab
- Record interaction, stop, analyze "Frames" and "Main" tracks
- Look for "Long Tasks" (>50ms) — should be eliminated

### Visual Evidence

**Screenshots to capture:**

1. **Performance timeline comparison:**
   - Before: Horizontal scroll showing frame drops (red bars in Frames track)
   - After: Horizontal scroll showing consistent 60fps (green bars)

2. **Frame time metrics:**
   - Before: Frame time graph showing 20-30ms spikes during scroll
   - After: Frame time graph showing <16ms during scroll

3. **Network tab (for sanity check):**
   - Verify no extra API calls introduced by upgrade scheduler
   - Verify shell cells don't trigger spurious re-fetches

### Manual Testing Checklist

| Test | Expected Behavior | Pass/Fail |
|------|-------------------|-----------|
| Horizontal scroll (slow) | Smooth 60fps, no blank cells, text visible immediately | |
| Horizontal scroll (fast) | Smooth 60fps, shell cells visible, upgrade within 2 frames | |
| Vertical scroll (slow) | No regression, still 60fps | |
| Vertical scroll (fast) | No regression, shell cells visible if implemented | |
| Select 1 cell | No grid flash, only selected cell updates | |
| Select all (1000 rows) | Delta updates complete in <100ms, no freeze | |
| Column visibility toggle | Columns appear immediately (rich cells, not shells) | |
| Sort grid | Full render with rich cells (not shells) | |
| Edit cell before upgrade | Cell upgrades immediately on edit start | |

### Issue Closure

**Issues to close when complete:**

1. **GH#1437** (this issue) - Dual-layer cell rendering
   - Evidence: Performance timeline screenshots, frame time metrics
   - Comment: "Completed all 5 phases. Horizontal scroll now 60fps on 20-column grids. See attached evidence."

2. **GH#1180** - Cell rendering performance
   - Reference GH#1437 as the fix
   - Comment: "Resolved by GH#1437 dual-layer rendering. Cell creation time reduced from 0.67ms to 0.05ms (shell)."

3. **GH#1306** - Cell rendering optimization (selection delta + affordance pre-computation)
   - Reference GH#1437 Phase P4 as the implementation
   - Comment: "Absorbed into GH#1437 Phase P4. Selection delta and affordance pre-computation implemented."

### Rollback Plan (If Issues Found)

**If performance regressions or bugs discovered:**

1. **Feature flag:** Add `ENABLE_DUAL_LAYER_CELLS` flag to disable shell→rich pattern
2. **Fallback:** `createCellElement()` falls back to rich cells if flag disabled
3. **Gradual rollout:** Enable for internal users first, monitor for 1 week, then production

**Rollback indicators:**
- Frame times WORSE than baseline
- Visual flash during shell→rich transition
- Cells not upgrading (stuck as shells)
- Selection/editing broken due to missing handlers on shells

---

## Testing Strategy

| Phase | Test Type | What to Verify |
|-------|-----------|----------------|
| P1 | Unit | `createShellCell()` creates cell in <0.1ms, textContent matches formatter output |
| P1 | Manual | Shell cells render with correct text, no blank cells |
| P2 | Unit | Scheduler queues cells correctly (viewport vs buffer) |
| P2 | Manual | Viewport cells upgrade within 2 frames, buffer cells within 100ms |
| P2 | Manual | Cancellation works (cells removed before upgrade don't process) |
| P3 | Manual | All 4 cell paths use shells, no visual flash |
| P3 | Manual | Column toggle creates rich cells immediately (not shells) |
| P4 | Unit | Selection delta tracks added/removed correctly |
| P4 | Manual | Select 1 cell updates only that cell (not grid) |
| P4 | Manual | Bulk select processes delta in <100ms |
| P5 | E2E | DevTools recording shows 60fps during horizontal scroll |
| P5 | E2E | DevTools recording shows no long tasks (>50ms) during scroll |

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Shell→rich transition causes visual flash | Pre-render shell with exact same text as rich cell, upgrade in-place with no layout shift |
| Scheduler overwhelms browser with upgrades | Batch upgrades (max 10 per frame), prioritize viewport over buffer |
| Shell cells missing interaction handlers | Upgrade immediately on user interaction (click, edit, select) |
| MobX reactions on shell cells cause errors | Shell cells have no MobX reads, zero reactivity during creation |
| Affordance attributes missing on shells | Acceptable — shells are temporary, rich upgrade adds affordances within 2 frames |
| Regression on vertical scroll | Measure vertical scroll perf before/after, use feature flag if regression detected |

---

## Related Issues & History

- **Epic:** [#187](https://github.com/baseplane-ai/baseplane/issues/187) (VibeGrid)
- **Predecessor:** [#1435](https://github.com/baseplane-ai/baseplane/issues/1435) (Incremental Column Virtualization) — PR #1436 completed
- **Absorbs:** [#1306](https://github.com/baseplane-ai/baseplane/issues/1306) (Cell Rendering Optimization - Selection Delta)
- **Closes:** [#1180](https://github.com/baseplane-ai/baseplane/issues/1180) (Cell Rendering Performance)
- **Research session:** TBD — performance profiling session to establish baseline

---

## Architecture Diagrams

### Current Cell Creation Pipeline (Post-#1435)

```
updateVirtualColumns(prev, current)
  ↓
entering columns = [col1, col2, col3]
  ↓
for each row (10 rows):
  for each entering column (3 cols):
    createCellElement() → 0.67ms
      ↓
      createElement('div')                    0.05ms
      className = 'vibegridx-cell'            0.01ms
      MobX read: expandedRowIds               0.10ms
      MobX read: columnWidths                 0.10ms
      MobX read: selectedCells                0.10ms
      dataset.columnId = ...                  0.02ms
      dataset.field = ...                     0.02ms
      style.left = ...                        0.02ms
      style.width = ...                       0.02ms
      affordance resolution (cached)          0.05ms
      setAttribute × 3 (affordances)          0.06ms
      fieldType.renderer.render()             0.10ms  ← createElement + styling
      setAttribute × 2 (rowId, testid)        0.04ms
      addCellInteractionHandlers()            0.03ms
      Total: ~0.67ms per cell

Total for 30 cells: 30 × 0.67ms = 20ms (exceeds 16ms frame budget)
```

### New Dual-Layer Pipeline (This Issue)

```
updateVirtualColumns(prev, current)
  ↓
entering columns = [col1, col2, col3]
  ↓
SCROLL-TIME (sync, <16ms):
  for each row (10 rows):
    for each entering column (3 cols):
      createShellCell() → 0.05ms
        ↓
        createElement('div')                  0.05ms
        className = 'vibegridx-cell vibegridx-cell--shell'
        style.left/width                      0.02ms
        dataset.rowId/columnId (minimal)      0.02ms
        textContent = formatter(value)        0.01ms
        Total: ~0.05ms per cell

      scheduler.scheduleUpgrade(cell, isViewport)

Total for 30 cells: 30 × 0.05ms = 1.5ms (well under 16ms budget)

IDLE-TIME (async, deferred):
  requestAnimationFrame() for viewport cells (10 cells):
    upgradeCell() → 0.67ms per cell
    Total: 10 × 0.67ms = 6.7ms (spread across 2-3 frames)

  requestIdleCallback() for buffer cells (20 cells):
    upgradeCell() → 0.67ms per cell
    Total: 20 × 0.67ms = 13.4ms (when browser idle)
```

**Result:** Scroll-time work reduced from 20ms to 1.5ms → 60fps achieved ✓

---

## Performance Budget

| Operation | Current | Budget | After P1-P3 | After P4 | After P5 |
|-----------|---------|--------|-------------|----------|----------|
| Shell cell creation | N/A | <0.1ms | 0.05ms ✓ | 0.05ms | 0.05ms |
| Rich cell creation | 0.67ms | 0.67ms | 0.67ms | 0.50ms ✓ | 0.50ms |
| Horizontal scroll (30 cells) | 20ms | <16ms | 1.5ms ✓ | 1.5ms | 1.5ms |
| Selection update (1 cell) | 50ms | <5ms | 50ms | 2ms ✓ | 2ms |
| Bulk select (100 cells) | 500ms | <100ms | 500ms | 80ms ✓ | 80ms |
| Viewport upgrade latency | N/A | <33ms | 20ms ✓ | 20ms | 20ms |
| Buffer upgrade latency | N/A | <100ms | 80ms ✓ | 80ms | 80ms |

---

## Codex Review Responses

### R1: Row/Column Identity During Recycling

**Concern:** Shell→rich upgrade could render wrong data after fast scroll if row/column IDs are stale.

**Resolution:** Row/column IDs live on the shell DOM element via `data-row-id` and `data-column-id`. `recycleRowForNewData()` MUST update these IDs on existing cells BEFORE scheduling any upgrades. Sequence:

```typescript
recycleRowForNewData(rowElement, newRow): void {
  // 1. Update row-level identity FIRST
  rowElement.dataset.rowId = newRow.id

  // 2. Update each cell's identity + text content
  for each cell in row:
    cell.dataset.rowId = newRow.id        // Update identity
    cell.textContent = formatter(newRow)   // Update visible text
    cell.className = 'vibegridx-cell vibegridx-cell--shell'  // Reset to shell

  // 3. THEN schedule upgrades (now IDs are correct)
  for each cell in row:
    scheduler.scheduleUpgrade(cell, isInViewport(cell))
}
```

### R2: Minimal Attribute Contract for Event Delegation

**Concern:** Event handlers may rely on `data-field`, `data-column-id`, affordance attrs on cells.

**Resolution:** Audit result — VibeGrid uses event delegation on the body container, resolving targets via `closest('[data-row-id]')` and `closest('[data-column-id]')`. Shell cells MUST have:
- `data-row-id` — required for event delegation (row identification)
- `data-column-id` — required for event delegation (column identification)

All other attributes (`data-field`, `data-testid`, `data-field-type`, affordance attrs) are NOT required for delegation and can safely be deferred to rich upgrade.

**Interaction safety:** If a user clicks a shell cell before upgrade, the event handler resolves row/column via the two required attributes, then triggers an immediate upgrade via `scheduler.upgradeCell()` before processing the interaction. Sequence:
1. Click event → delegation finds `data-row-id` + `data-column-id` ✓
2. Handler checks `vibegridx-cell--shell` class → calls `scheduler.upgradeCell(cell)` synchronously
3. Cell is now rich → interaction proceeds normally

### R3: Single Selection Update Mechanism

**Concern:** Delta reaction and viewport-scoped autorun could double-apply class changes.

**Resolution:** Use delta reaction as the SOLE selection update path. Remove/disable the viewport-scoped autorun from Phase P4. The delta approach is strictly superior:
- Delta reaction: O(delta) — only cells that changed
- Viewport autorun: O(viewport × columns) — scans all visible cells

The viewport autorun is NOT needed if delta tracking is reliable. If delta tracking fails for any reason, the existing full-grid reaction (pre-P4 behavior) remains as the fallback, not the viewport autorun.

### R4: Per-Frame Budgets and Backpressure

**Concern:** rAF/rIC queues can create long tasks under high scroll velocity.

**Resolution:** Add explicit time-slice budgets to CellUpgradeScheduler:

```typescript
class CellUpgradeScheduler {
  private readonly VIEWPORT_BUDGET_MS = 5   // Max 5ms per rAF frame for upgrades
  private readonly BUFFER_BUDGET_MS = 8     // Max 8ms per rIC callback
  private readonly MAX_BUFFER_QUEUE = 200   // Drop oldest buffer entries beyond this

  private processViewportQueue(): void {
    const start = performance.now()
    while (this.viewportQueue.size > 0 && performance.now() - start < this.VIEWPORT_BUDGET_MS) {
      const cell = this.viewportQueue.values().next().value
      this.upgradeCell(cell)
    }
    if (this.viewportQueue.size > 0) {
      this.rafId = requestAnimationFrame(() => this.processViewportQueue())
    }
  }

  private processBufferQueue(deadline: IdleDeadline): void {
    // Skip buffer work if viewport queue is non-empty (viewport priority)
    if (this.viewportQueue.size > 0) {
      this.ricId = requestIdleCallback((d) => this.processBufferQueue(d), { timeout: 100 })
      return
    }
    const budget = Math.min(deadline.timeRemaining(), this.BUFFER_BUDGET_MS)
    const start = performance.now()
    while (this.bufferQueue.size > 0 && performance.now() - start < budget) {
      const cell = this.bufferQueue.values().next().value
      this.upgradeCell(cell)
    }
  }

  scheduleUpgrade(cell: HTMLElement, isViewport: boolean): void {
    if (isViewport) {
      this.viewportQueue.add(cell)
    } else {
      // Backpressure: drop oldest buffer entries if queue too large
      if (this.bufferQueue.size >= this.MAX_BUFFER_QUEUE) {
        const oldest = this.bufferQueue.values().next().value
        this.bufferQueue.delete(oldest)
      }
      this.bufferQueue.add(cell)
    }
  }
}
```

### R5: Feature Flag Integration

**Concern:** Rollback plan needs to use existing FeatureFlagStore to be actually deployable.

**Resolution:** Wire through existing feature flag system:

```typescript
// In FeatureFlagStore or feature flag config
const DUAL_LAYER_CELLS = 'dual_layer_cells'  // Default: false (off)

// In BodyRenderer.createCellElement()
createCellElement(row, column, colIndex, context): HTMLElement {
  const useDualLayer = this.featureFlags.isEnabled(DUAL_LAYER_CELLS)
  if (useDualLayer && context === 'scroll') {
    return this.createShellCell(row, column, colIndex)
  }
  return this.createRichCell(row, column, colIndex)  // Existing behavior
}
```

Rollout plan: Enable for internal org first (`widecorp`), monitor for 1 week, then enable globally.

---

## Open Questions

1. **Should initial render (`renderBody()`) use shell cells?**
   - Pro: Faster perceived load time (text appears immediately, full styling loads progressively)
   - Con: Extra complexity for non-scroll-critical path
   - **Decision:** Yes, use shells for consistency and perceived perf boost

2. **Should we pre-render shell cells for buffer columns (not just viewport)?**
   - Pro: Smoother scroll if user scrolls faster than upgrade can process
   - Con: More shell cells to upgrade (longer idle work)
   - **Decision:** Yes, shell cells for entire virtual range (viewport + buffer), upgrade progressively

3. **Should shell→rich upgrade be cancellable mid-upgrade?**
   - Pro: Prevents wasted work if user scrolls away during expensive renderer
   - Con: Adds complexity to upgrade process (need to abort partial DOM writes)
   - **Decision:** No, upgrade is atomic (once started, completes). Cancellation only before upgrade starts.

4. **Should we track upgrade metrics (latency, success rate) for monitoring?**
   - Pro: Detect perf regressions, slow upgrades in production
   - Con: Adds overhead to hot path
   - **Decision:** Yes, but only in dev mode. Use `performance.mark()` to measure upgrade times, log slow upgrades (>50ms).

---

## Success Criteria Summary

**This issue is successful if:**

1. ✅ Horizontal scroll maintains 60fps on 15-20+ column grids (frame times <16ms)
2. ✅ Shell cells show meaningful text content immediately (no blank cells)
3. ✅ Shell→rich transition is invisible to user (no layout shift, no flash)
4. ✅ Selection changes update only delta cells (not full grid)
5. ✅ No regression on vertical scroll performance
6. ✅ DevTools performance timeline shows no long tasks (>50ms) during scroll
7. ✅ Issues #1180, #1306, #1437 closed with evidence

**Stretch goals:**

- Shell cell creation <0.05ms (target achieved in P1)
- Viewport upgrade latency <20ms (target <33ms)
- Bulk selection (100 cells) <80ms (target <100ms)
- Zero shell cells visible to user (all upgrade before user notices)

---

**END OF SPEC**
