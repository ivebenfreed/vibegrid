---
domain: vibegrid
status: active
relatedRules:
  - vibegrid
  - vibegrid-interactions
---
# Core

High-performance virtualized data grid component for rendering and editing large entity collections (10k+ rows) with smooth 60fps scrolling, real-time collaboration, and comprehensive keyboard navigation.

## Overview

- **Domain:** vibegrid
- **Status:** active
- **Related Issues:** GH#187, GH#1413, GH#1435, GH#1437

## Behaviors

### B1: Grid renders rows from data source
- **ID:** grid-render-rows
- **Trigger:** VibeGrid component mounts with entity data source
- **Expected:** Grid displays rows with virtualized scrolling, only visible rows rendered in DOM, row recycling for performance
- **Verify:** Grid visible with data, scroll indicator shows total row count, DOM inspection shows <50 row elements regardless of total count

### B2: Column headers display with sort indicators
- **ID:** column-headers-sort
- **Trigger:** Grid loads with column configuration from entity schema
- **Expected:** Column headers render with field names, sortable columns show up/down arrow indicators on hover
- **Verify:** Headers visible at top of grid, hover shows sort affordance, current sort column shows active arrow icon

### B3: Click column header sorts data
- **ID:** click-header-sort
- **Trigger:** User clicks a column header
- **Expected:** Data sorts by that column (ascending first click, descending second click, unsorted third click cycle), sort indicator updates
- **Verify:** Rows reorder visibly, sort arrow direction changes, data order matches sort direction

### B4: Filter icon opens filter panel
- **ID:** filter-icon-panel
- **Trigger:** User clicks filter icon in toolbar or column header
- **Expected:** Filter panel opens with field selector, operator dropdown, and value input
- **Verify:** Filter panel visible, field options match column types, operator list appropriate for field type (text gets "contains", numbers get ">")

### B5: Pagination controls work
- **ID:** pagination-controls
- **Trigger:** User clicks next/previous page buttons or page number selector
- **Expected:** Grid loads next/previous page of data, page indicator updates, URL query param reflects current page
- **Verify:** New page data displays, pagination footer shows correct page number and total pages, browser back button works

### B6: Row selection (single and multi)
- **ID:** row-selection
- **Trigger:** User clicks row (single) or checkbox (multi-select) or Shift+click (range select)
- **Expected:** Selected rows highlight with distinct background color, selection count updates in toolbar, actions bar enables
- **Verify:** Selected rows visually distinct, selection state persists during scroll, bulk actions available when multiple rows selected

### B7: Keyboard navigation (arrows, tab)
- **ID:** keyboard-navigation
- **Trigger:** User presses arrow keys, Tab, Shift+Tab, Enter, or Escape
- **Expected:** Focus moves between cells (arrows), columns (Tab), rows (Enter), exit edit mode (Escape)
- **Verify:** Visual focus indicator moves with keyboard input, accessible via screen reader, no mouse required for navigation

### B8: Empty state shows placeholder
- **ID:** empty-state-placeholder
- **Trigger:** Grid loads with no data (empty collection)
- **Expected:** Empty state component displays with message like "No items yet" and optional "Create" button
- **Verify:** Placeholder visible instead of empty grid, create action available if user has permissions, no loading spinner

### B9: Incremental column virtualization on horizontal scroll
- **ID:** incremental-column-virtualization
- **Status:** [x] Implemented (GH#1435)
- **Trigger:** User scrolls horizontally in a grid with many columns
- **Expected:** Only delta columns are added/removed from DOM (not full re-render), using binary search for visible range, Map-based O(1) lookups, and deferred render gating
- **Source:** `systems/vibegrid/renderers/core/SimplePassiveRenderer.ts:964` (horizontal scroll observer), `stores/VisualStateStore.ts:355` (binary search), `coordinates/VibeGridXCoordinateManager.ts:81` (columnMap)
- **Verify:** Horizontal scroll maintains 60fps, DOM cell count stays bounded, no duplicate cells appear

### B10: Dual-layer shell cell rendering on scroll
- **ID:** dual-layer-shell-cells
- **Status:** [x] Implemented (GH#1437)
- **Trigger:** User scrolls horizontally or vertically, causing new cells to enter viewport
- **Expected:** New cells render as lightweight shell cells (~0.05ms each, textContent only, no MobX/affordances/handlers), then upgrade to rich cells via hybrid rAF/rIC scheduler during idle. Clicking a shell cell triggers immediate synchronous upgrade before interaction processing.
- **Source:** `systems/vibegrid/renderers/core/CellUpgradeScheduler.ts:1` (scheduler), `systems/vibegrid/renderers/core/SimplePassiveRenderer.ts:1341` (upgrade context), `systems/vibegrid/field-types/ModularCellBridge.ts:253` (createShellCell)
- **Verify:** Horizontal scroll maintains 60fps, shell cells show text immediately, rich upgrade completes within 2 frames for viewport cells

### B11: Delta-based selection updates
- **ID:** selection-delta-updates
- **Status:** [x] Implemented (GH#1437)
- **Trigger:** User selects or deselects cells
- **Expected:** Only cells whose selection state changed get DOM class updates (O(delta) instead of O(n) full-grid scan). Shell cells that become selected are immediately upgraded to rich cells.
- **Source:** `systems/vibegrid/renderers/core/SimplePassiveRenderer.ts:445` (delta reaction), `systems/vibegrid/renderers/components/BodyRenderer.ts:133` (checkbox-only reaction)
- **Verify:** Selecting 1 cell in 1000-row grid updates only that cell, no full-grid flash

## Architecture (GH#1413, GH#1435, GH#1437)

- **ViewportStore** (`stores/ViewportStore.ts`) - Single source of truth for scroll position, viewport dimensions, content dimensions, row offsets, and visible range calculations
- **InitStore** (`stores/InitStore.ts`) - Deterministic renderer lifecycle via MobX reaction: waits for columns > 0 + container + factory before creating renderer; destroys on cleanup
- **Event handling** - Single scroll/resize path through ViewportStore; no duplicate listeners
- **CellUpgradeScheduler** (`renderers/core/CellUpgradeScheduler.ts`) - Hybrid rAF/rIC scheduler for shell-to-rich cell upgrades: viewport cells upgraded via rAF (5ms budget), buffer cells via rIC (8ms budget), backpressure at 200 queue max, synchronous upgradeNow for user interactions (GH#1437)
- **Selection delta reaction** - MobX reaction on selectionVersion computes diff of previous vs current selectedCells, applies O(delta) DOM class updates instead of O(n) full-grid scan (GH#1437)
- Legacy dead code (`.backup` files, unused stores) removed

## Notes

- Dual-layer cell rendering: shell cells (~0.05ms) at scroll time, rich cells (~0.67ms) upgraded during idle via CellUpgradeScheduler (GH#1437)
- Column virtualization uses incremental DOM updates - only visible columns + buffer rendered, delta adds/removes on scroll (GH#1435)
- Virtual scrolling uses DOM recycling - only 30-50 row elements in DOM regardless of total rows
- Performance target: <16ms frame time for 60fps, <5ms per cell update
- MobX strict mode with `enforceActions: 'always'` for all state changes
- Components wrapped with `observer()` for granular reactivity
- Real-time collaboration via Yjs CRDTs (future integration, currently deferred)
- Supports hierarchical data display via grouping and nesting (see GH#394)
- Advanced views: Gantt (timeline), Tree (hierarchical), Table (default)
