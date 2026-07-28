# Research: VibGrid Robustness Improvements for Bedrock Data Display

**Date:** 2026-01-30
**Session:** 797d3821-1c2d-4a1a-acdc-f282ebc75cd3
**Status:** Complete

---

## Context

VibGrid is the singular data display and input system for Baseplane. It needs to become the bedrock primitive - reliable, extensible, and performant enough to back every structured data view in the app. This research identifies robustness gaps, architectural debt, and prioritized improvements to reach that status.

## Questions Explored

1. What is the full architecture and file inventory of VibGrid today?
2. What are the known flakiness sources and architectural debt items?
3. What GitHub issues exist (open and closed) that reveal robustness patterns?
4. What does the existing self-analysis documentation say?
5. What specific improvements, in priority order, would make VibGrid bedrock-quality?

## Findings

### Finding 1: Architecture Inventory

VibGrid spans **120+ files** across **20 subdirectories** in `apps/web/src/systems/vibegrid/`.

| Layer | Key Files | Responsibility |
|-------|-----------|----------------|
| Entry | `VibeGrid.tsx` (33KB) | React shell, prop handling, renderer lifecycle |
| Data | `stores/TableCoreStore.ts` | Entity processing, sort/filter/group, row ordering |
| Visual | `stores/VisualStateStore.ts` | Column layout, viewport geometry, scroll state |
| Interaction | `stores/InteractionStore.ts` | Selection, editing, clipboard, context menus, filters |
| Rendering | `renderers/core/SimplePassiveRenderer.ts` | Direct DOM manipulation, virtual scrolling, cell updates |
| Field Types | `field-types/` (25+ implementations) | Type-specific cell rendering and editing |
| Overlays | `overlays/` (8 files) | Selection, editing, clipboard, resize, drag indicators |
| Processors | `processors/` (3 files) | Grouping, hierarchy, row expansion |
| Adapters | `adapters/` (6 files) | Layout adapters (grid, property sheet, forms, inline) |
| Coordinates | `coordinates/` (2 files) | Geometry management, position tracking |

**State Architecture** follows a 3-store MobX pattern:
- `TableCoreStore` - data, sorting, filtering, grouping, row ordering
- `VisualStateStore` - column layout, viewport geometry, scroll state
- `InteractionStore` - selection, editing, clipboard, menus

**Field Type Registry** has 25+ types: text, number, boolean, date, select, email, phone, url, currency, rating, slider, color, image, file, markdown, entity_reference, user_reference, computed, rollup (sum/avg/count/concat).

**View Modes**: Table, Kanban, Gantt - all sharing the same store infrastructure.

**Source:** `apps/web/src/systems/vibegrid/` directory tree, `index.ts`, `types.ts`, `README.md`

### Finding 2: Four Root Causes of Flakiness

The codebase self-identifies its problems in `VIBEGRID_OVERHAUL_ANALYSIS.md` and `VIBEGRID_STATE_ANALYSIS.md`:

**RC1: Competing Geometry/Virtualization State**
- `VisualStateStore` and `VirtualViewportStore` both track scroll/viewport
- Deprecated `VirtualScrollManager` still used in `SimplePassiveRenderer`
- `dom-position-state.ts` recomputes positions separately from coordinate manager
- Impact: Overlays and selection desync from rendered DOM during scroll/resize

**RC2: Multi-Stage Initialization Race Conditions**
- `InitStore` manages a dense readiness graph
- `VibeGrid.tsx` also uses `autorun` + `useEffect` to create renderer
- Renderers delay observers until after paint
- Impact: Updates race with DOM readiness, causing intermittent missing renders

**RC3: Duplicate Event/State Pipelines**
- Resize events handled in HeaderRenderer AND MouseController AND OverlayManager
- Column drag preview exists in both MouseController and ColumnDragOverlayDOM
- Legacy managers coexist with MobX stores
- Impact: Nondeterministic ordering, hidden coupling

**RC4: Legacy API Surface**
- `index.ts` still exports legacy `createPureObservables` (throws at runtime if used)
- 7+ `.backup` files in renderers directory
- Dead code paths from Legend State era (migrated to MobX)

**Source:** `VIBEGRID_OVERHAUL_ANALYSIS.md`, `VIBEGRID_STATE_ANALYSIS.md`, `MANAGER_CONSOLIDATION.md`

### Finding 3: GitHub Issues Reveal Recurring Patterns

**Open Issues (VibGrid-related):**

| # | Title | Type | Priority |
|---|-------|------|----------|
| #187 | VibeGrid Epic | Epic | P1 |
| #242 | Y.js Real-time Sync Integration | Feature | P2 |
| #802 | AI Copilot Grid Control | Feature | P2 |
| #1240 | Row Expansion (implemented) | Feature | -- |
| #1305 | Selection & Rendering Performance | Performance | -- |
| #1307 | Gantt View Optimization | Performance | -- |
| #1391 | Smart Search Input | Feature | -- |
| #1404 | Migrate COI to entity collection | Chore | -- |

**Closed Issues (Bug patterns):**

| # | Title | Root Cause Pattern |
|---|-------|--------------------|
| #139 | Performance & UX Improvements | Race condition in `createRowElementByType` (undefined row) |
| #173 | Silent edit failures - optimistic updates revert | WebSocket `table_change` event overwrites optimistic state |
| #805 | Loading spinner empty state | Missing loading/empty state handling |

**Key insight:** GH#1305 has an **approved spec** for selection delta tracking, affordance pre-computation, and granular MobX reactions. This is ready for implementation.

**Source:** GitHub issue searches via `gh issue list` and `pnpm bgh view`

### Finding 4: Existing Self-Analysis Documents (8 Files)

The codebase contains 8 markdown analysis documents inside `systems/vibegrid/`:

| Document | Content | Status |
|----------|---------|--------|
| `VIBEGRID_OVERHAUL_ANALYSIS.md` | Root cause analysis, AG Grid patterns, big-bang proposal | Partially stale (references current MobX arch) |
| `VIBEGRID_STATE_ANALYSIS.md` | State system deep analysis, consolidation recommendations | Partially stale (some consolidations completed) |
| `MANAGER_CONSOLIDATION.md` | Manager → store consolidation tracking | Partially done (2/5 completed) |
| `RENDERER_CONSOLIDATION_PLAN.md` | 51→25 file consolidation plan | Phase 1+2.1 completed, Phase 2.2+ pending |
| `PURE_OBSERVABLES_SPLIT_PLAN.md` | Legend State → MobX split plan | Completed (architecture migrated) |
| `VIBEGRID_SYNC_FIX_SUMMARY.md` | Horizontal scroll sync fix | Completed |
| `UX_SPEC.md` | Interaction patterns and testing guide | Active |
| `FIELD_TYPE_MODULAR_ARCHITECTURE_PLAN.md` | Field type modular architecture | Active |
| `stores/PERSISTENCE-README.md` | Persistence store documentation | Active |
| `stores/reactive-patterns.md` | Reactive pattern guide | Active |

**Key insight:** Several docs reference completed or abandoned work. They create confusion about current architecture state.

**Source:** `apps/web/src/systems/vibegrid/*.md`

### Finding 5: Test Coverage Gaps

18 test files exist, but critical paths are untested:

**Tested:**
- Adapters: GridAdapter, PropertySheetAdapter
- Components: FilterBuilder, FilterCondition, PropertySheet, VibeForm, VibeFormField, SmartSearchInput
- Processors: GroupProcessor, HierarchyProcessor
- Stores: TableCoreStore (change detection, version tracking), filter-builder, readableState
- Utils: critical-path, hashing, update-router, filter-utils

**Not tested (critical gaps):**
- `SimplePassiveRenderer` (core rendering engine)
- `MouseController`, `KeyboardController` (interaction controllers)
- `SelectionController` (selection logic)
- All overlay controllers (selection, editing, clipboard, resize)
- `ObservableCoordinateManager` (geometry)
- `InteractionCoordinator`
- `CellActionRouter`
- `ModularCellBridge` and `CellFactory`

**Source:** `apps/web/src/systems/vibegrid/**/__tests__/`

### Finding 6: Type Safety Weaknesses

The `Column` type in `types.ts` is a 250-line interface with significant `any` usage:

- `options?: string[] | EnumOption[] | Array<{value,label,...}>` - 3 shapes for same concept
- `TableRow.data: Record<string, any>` with `[key: string]: any` escape hatch
- `editor?: any`, `validation?: any`, `meta?: any`, `fieldType?: any`
- `rollupConditions?: any`, `statusSet?: any`
- `storeActor?: any`, `store?: any`

This makes it easy to pass wrong data shapes without compiler help.

**Source:** `apps/web/src/systems/vibegrid/types.ts:90-251`

## Robustness Improvement Roadmap

### Tier 1 - Foundation (Must-Do for Reliability)

| ID | Improvement | Risk | Rationale |
|----|-------------|------|-----------|
| A4 | Remove legacy dead code (7+ backup files, dead exports, stale types) | Low | Reduces confusion, prevents accidental use of throwing code |
| A1 | Consolidate geometry/virtualization to single source of truth | High | Root cause of overlay/selection desync (RC1) |
| B3 | Per-cell error boundaries for field type renderers | Low | Prevents single broken field from crashing entire grid |
| C4 | Wire drag-drop callbacks to TableCoreStore (existing TODO) | Medium | Completes incomplete feature |
| E1 | Unit tests for SimplePassiveRenderer, controllers, coordinators | Medium | Tests the untested critical path |

### Tier 2 - Robustness (Needed for Scale)

| ID | Improvement | Risk | Rationale |
|----|-------------|------|-----------|
| C1 | Delta-based selection updates (GH#1305 approved spec) | Medium | O(n) → O(delta) DOM updates for selection |
| A2 | Single event pipeline (eliminate duplicate resize/drag handlers) | Medium | Root cause of nondeterministic behavior (RC3) |
| B1 | Explicit optimistic update lifecycle with server confirmation | Medium | Prevent state reversion (GH#173 pattern) |
| A3 | Deterministic initialization sequence | Medium | Eliminate race conditions (RC2) |
| B2 | Normalize Column.options to single shape at adapter boundary | Medium | Type safety improvement |

### Tier 3 - Extensibility (Needed for Bedrock Primitive)

| ID | Improvement | Risk | Rationale |
|----|-------------|------|-----------|
| D3 | Abstract RowModel interface for multiple data sources | High | Enable non-DataForge data without ad-hoc overrides |
| D1 | Module registry (Gantt/Kanban as plugins, AG Grid pattern) | High | Decouple view modes from core |
| D2 | Slot registry for cell component resolution | Medium | Formalize FieldTypeRegistry + ModularCellBridge |
| B4 | Standardize data provider interface (replace skipDataFetching) | Medium | Consistent pattern for all data sources (GH#1404) |

### Tier 4 - Polish

| ID | Improvement | Risk | Rationale |
|----|-------------|------|-----------|
| E2 | Integration tests (store → renderer → DOM pipeline) | Low | End-to-end data flow verification |
| E3 | Visual regression tests (Playwright screenshots) | Low | Automated visual correctness |
| F1 | Archive/update 8 stale analysis docs | Low | Reduce developer confusion |
| C2 | Keyboard navigation edge case matrix | Low | Systematic coverage of 20+ key combos |
| C3 | Cross-browser clipboard testing | Low | Firefox clipboard API differences |

## Metrics for "Bedrock" Status

| Metric | Current | Target |
|--------|---------|--------|
| Geometry state sources | 3-4 | 1 |
| Event handler duplication | 3 resize paths, 2 drag paths | 1 each |
| Backup/dead files | 7+ .backup files | 0 |
| Per-cell error handling | None | All cells wrapped |
| Selection perf (10K rows) | O(n) DOM scan | O(delta) viewport-scoped |
| Unit test coverage (renderers) | 0 test files | Core paths tested |
| Data provider interface | Ad-hoc (skipDataFetching + collectionOverride) | Formal interface |
| Legacy exports | Throws at runtime | Removed |
| Analysis docs in source | 8 stale docs | Archived or updated |
| `any` types in Column interface | 10+ | <3 |

## Open Questions

- Should the module registry (D1) be pursued before or after the geometry consolidation (A1)?
- Is the AG Grid-style module pattern the right fit, or should we design something lighter?
- Should stale analysis docs be archived or updated to reflect current architecture?
- How much of the RENDERER_CONSOLIDATION_PLAN (Phase 2.2+) should be completed before new features?

## Next Steps

- [ ] Create GitHub issues for Tier 1 items (A4, A1, B3, C4, E1)
- [ ] Implement GH#1305 (approved spec for selection delta optimization)
- [ ] Clean dead code (A4) as quick-win first PR
- [ ] Plan spec for geometry consolidation (A1) - highest-impact architectural fix
- [ ] Evaluate whether RENDERER_CONSOLIDATION_PLAN Phase 2.2+ should resume

## References

- Related issues: #187 (Epic), #139, #173, #242, #802, #1240, #1305, #1307, #1391, #1404
- Existing analysis: `VIBEGRID_OVERHAUL_ANALYSIS.md`, `VIBEGRID_STATE_ANALYSIS.md`, `MANAGER_CONSOLIDATION.md`, `RENDERER_CONSOLIDATION_PLAN.md`
- Rules: `.claude/rules/vibegrid.md`, `.claude/rules/vibegrid-interactions.md`
- AG Grid patterns: Module registry, grid bootstrap, component registry, row model interface
