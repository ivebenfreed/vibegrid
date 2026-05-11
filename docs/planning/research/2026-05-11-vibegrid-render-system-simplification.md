---
date: 2026-05-11
topic: VibeGrid render system structural simplification
type: brainstorm
status: complete
github_issue: 2925
items_researched: 5
---

# Research: VibeGrid Render System Structural Simplification (GH#2925)

## Context

GH#2923 surfaced two compounding bugs that left `VibeGridLoadingOverlay` mounted over fully-loaded data on warm refresh:

1. `SimplePassiveRenderer.postInitialization()` schedules 5 phases via 4 chained `requestAnimationFrame`s. Chrome pauses RAF entirely for unfocused/occluded tabs, so the chain stalled forever.
2. `useSubstrateGridRows` mirrors a MobX `Query` into a React `useState` via an `autorun` with a count-only short-circuit. The `isReady: false → true` transition was silently dropped because row count didn't change.

PR #2924 (commit `bd1254249`) fixed both surgically — RAF + 200ms `setTimeout` race, and adding `isReady` to the short-circuit comparison. The fixes are load-bearing and minimal-risk.

This issue is **the structural retrospective**: the debugging exposed accumulated complexity worth simplifying. Not a bug fix.

## Scope

Five parallel deep-dives validated the issue's six observations against current code:

1. The 5-phase RAF chain in `SimplePassiveRenderer.postInitialization()`
2. The 10 hydration flags and `InitStore`
3. The two render layers (React overlay + imperative body) and `isDataLoading` mirror
4. ObserverManager's 12 reactions and their hydration coupling
5. The substrate state mirror (MobX `Query` → `autorun` → React `useState`)

Sources: `apps/web/src/shared/systems/vibegrid/**`, `apps/web/src/shared/data/query/use-substrate-grid-rows.ts`, git history for PRs #2920, #2921, #2923, #2924, #2034.

## Findings

### 1. RAF chain in `SimplePassiveRenderer.postInitialization()`

**File:** `apps/web/src/shared/systems/vibegrid/renderers/core/SimplePassiveRenderer.ts:693–946`

Five phases, of which **only Phase 5a (`renderBody`) is intrinsically paint-bound**. Phases 2/3/4 yield decoratively.

| Phase | Mechanism | Work | `markReady()` flag | Paint-bound? |
|-------|-----------|------|-------------------|--------------|
| 1 | sync (entry) | `initializePositionTracking()` — DOM measurements | none | no |
| 2 | `scheduleAfterPaint` L706 | ScrollController, SelectionService, MouseController, ColumnWidthManager | `viewportReady` (L830) | no — decorative |
| 3 | `scheduleAfterPaint` L835 | OverlayManager.init, EventManager.setupEventHandling, InteractionCoordinator wiring | `eventHandlersReady` (L864) | no — decorative |
| 4 | `scheduleAfterPaint` L869 | `renderHeader()` | none | possibly, lightweight |
| 5a | `scheduleAfterPaint` L884 | `renderBody()` — heavy DOM mutation | none | **yes** |
| 5b | `scheduleAfterPaint` L915 | observe post-renderBody paint | `rendererInitialized` (L926) | yes (one frame wait) |

`scheduleAfterPaint` (L72–81) is a fired-once race between RAF and a 200ms `setTimeout` — PR #2924's fix. Foreground: ~16ms; unfocused worst case: ~800ms (4 × 200ms).

**Critical ordering invariants** (must preserve when flattening):
- ScrollController → MouseController (Mouse references Scroll in ctor)
- EventManager → KeyboardController (Keyboard calls eventManager methods)
- InteractionCoordinator → OverlayManager (OverlayManager init references InteractionCoordinator)

**Existing escape hatch:** `renderBody` already has a "relaxed gate" (L1901–1912, GH#2920) that bypasses `isFullyHydrated` when rows are present. Evidence that the gate is too tight.

### 2. Hydration flags and InitStore

**File:** `apps/web/src/shared/systems/vibegrid/stores/InitStore.ts`

Ten boolean flags, all AND-combined in `isFullyHydrated` (L234–242):

```ts
@computed
get isFullyHydrated(): boolean {
  return Object.values(this.hydrationState).every((ready) => ready === true)
}
```

| Flag | Setter | Fallback timer | Race guarded |
|------|--------|----------------|--------------|
| `tableCoreStoreReady` | InitStore.ts:355 | none | late schema load |
| `visualStateStoreReady` | InitStore.ts:362 | none | columns not ready before reaction |
| `interactionStoreReady` | InitStore.ts:368 | none | selection/menu init |
| `persistenceStoreReady` | InitStore.ts:349 | none | persisted UI state lost |
| `schemaLoaded` | InitStore.ts:356 (paired w/ tableCoreStoreReady) | none | late schema blocks schema-dependent renderers |
| `entityDataLoaded` | useVibeGridData.ts:156/179/200 | **5000ms** (useVibeGridData.ts:205) | empty-collection cold-start |
| `containerReady` | VibeGrid.tsx:1006 | none | container set late blocks renderer factory |
| `viewportReady` | SimplePassiveRenderer.ts:830 | 200ms (PR #2924) | RAF paused on unfocused tab |
| `eventHandlersReady` | SimplePassiveRenderer.ts:864 | 200ms (PR #2924) | RAF paused on unfocused tab |
| `rendererInitialized` | SimplePassiveRenderer.ts:926 | 200ms (PR #2924) | RAF paused on unfocused tab |

**Dead code:** A 15-second InitStore-level timeout exists (`InitStore.ts:154–156, 512–513, 809–824`) but is never armed. Comment: "Timeouts disabled — dependencies are marked ready by components during initialization. The timeout system was causing false positives when stores were recreated." Re-armable cleanly with per-instance generation IDs.

**`__vibegrid_debug` surface** (`VibeGrid.tsx:289–457`, gated on `?debug=vibegrid`): exposes `viewportStore`, `tableCoreStore`, `interactionStore`, `editingStore`, `visualStateStore`, `sqliteClient`, `lastCursor`, `lastQuery`, `boot.legacyMigration`, `selection`, `memoryReport()`. **Missing: `initStore` itself.** During GH#2923 debugging, engineers walked the React Fiber tree to inspect `hydrationState`.

### 3. Two render layers (React overlay + imperative body)

**Files:** `VibeGrid.tsx:1241–1296`, `useVibeGridData.ts:292`, `VibeGridLoadingOverlay.tsx`

Current overlay predicate at `VibeGrid.tsx:1296`:
```ts
{(!isReady || !isRendered) && initStore && (
  <div className="absolute inset-0 z-10">
    <VibeGridLoadingOverlay … />
  </div>
)}
```
where `isReady = stores && !isDataLoading` (L1242) and `isRendered = initStore?.isFullyHydrated ?? false` (L1243).

**`isDataLoading` derivation:**
```
Query.isReady (MobX) → autorun → setState(isReady) → useSubstrateGridRows.isReady (React)
  → useVibeGridData.isLoading (React derived) → VibeGrid (observer) → conditional render
```

**No `rendererPainted` signal exists.** The closest proxy is `rendererInitialized`, set in Phase 5b *after* paint observation, but it is one of the 10 `isFullyHydrated` ANDs — meaning the overlay can't depend on it cleanly without also dragging in the other 9 flags.

`VibeGridLoadingOverlay` (L40–43) has a self-aware comment: "Always render — let parent control visibility to prevent flash" — acknowledging the split-state risk.

**GH#2923 second-bug race in code:** overlay-mounted-while-body-painted reproduced at `use-substrate-grid-rows.ts:500–501` (now fixed). Without the fix, `Query.isReady` flipped true without count change → `prev` returned → React stayed at `isLoading: true` → overlay stayed mounted indefinitely while cells were already in the DOM.

### 4. ObserverManager reactions

**File:** `apps/web/src/shared/systems/vibegrid/observers/ObserverManager.ts:119–130`

Twelve reactions, three bail-condition groups:

| # | Reaction | `observersEnabled` bail | `isFullyHydrated` bail | Recovery |
|---|----------|------------------------|------------------------|----------|
| 1 | Data | yes (L248) | yes (L254) | hydrationObserver |
| 2 | Column visibility | yes (L365) | yes (L372) | hydrationObserver |
| 3 | Search filter | yes (L401) | yes (L407) | hydrationObserver |
| 4 | Row expansion | yes (L441) | yes (L447) | hydrationObserver |
| 5 | Incremental processing | yes (L527) | yes (L533) | hydrationObserver |
| 6 | Column order | yes (L589) | yes (L595) | hydrationObserver |
| 7 | Column widths | yes (L632) | **no** | — |
| 8 | Virtual scroll (rows) | yes (L686) | **no** | — |
| 9 | Horizontal scroll (cols) | yes (L760) | **no** | — |
| 10 | Hydration | no | inverted (fires on transition) | self |
| 11 | Selection delta | none | none | — |
| 12 | Grid line canvas | none | none | — |

`createHydrationObserver` (L793–811) is the recovery patch — fires `renderBody()` on the `isFullyHydrated: false→true` transition with `fireImmediately: true`. Direct call, doesn't re-trigger other reactions.

**Risky for post-paint creation** (need DOM/rowOffsets/processedRows stable on creation): Data, Incremental Processing, Virtual Scroll, Grid Line Canvas. The remaining 8 are safe.

`observersEnabled` is separate from `isFullyHydrated` so the reaction set can be paused/resumed without touching InitStore. `disable()` is never called in production code today.

### 5. Substrate state mirror

**File:** `apps/web/src/shared/data/query/use-substrate-grid-rows.ts:232–610`

The hook returns React `useState<SubstrateGridRowsResult>` populated by an `autorun` over the MobX `Query`. The count-only short-circuit at L457–505 was the bug location; **fixed in `bd1254249`** by adding `isReady` to the comparison:

```ts
setState((prev) =>
  prev.count === q.count && prev.isReady === q.isReady
    ? prev
    : { ...prev, count: q.count, isReady: q.isReady },
)
```

**Why the mirror exists** (git blame → commit `f5c72bdfb`, GH#2804): the autorun runs in MobX context but consumers want a stable React state object. The mirror is a deliberate MobX↔React boundary — React Fiber gets batched, stable references; MobX gets fine-grained observability. Not accidental.

**Direction E feasibility:** Moderate value, moderate risk. Hooks can't be `observer()`-wrapped, so dropping the mirror forces every consumer to wrap. Consumers today (9 files) are largely already observer-wrapped at the component level, but `useVibeGridData` would need restructuring — it computes `isLoading` derivedly and that derivation would need to move into the component. Over-rendering risk: count-only deltas would re-render observer-wrapped consumers (the short-circuit silences them today).

## Comparison matrix

| Dir | What | Value | Risk | Blast radius |
|-----|------|-------|------|-------------|
| A | Collapse 5-phase RAF chain → 2 phases | Moderate-high | Low | SimplePassiveRenderer.ts |
| B | 10-flag AND → state machine (init/schema/controllers/painted) | High | High | InitStore + all `markReady` callers (6+ files) |
| C | Overlay = pure function of `processedRows.length === 0 \|\| !rendererPainted` | High | Moderate | VibeGrid.tsx, VibeGridLoadingOverlay, hooks |
| D | Move observers post-first-paint, drop bail conditions | High | Moderate | ObserverManager.ts, SimplePassiveRenderer.initObservers |
| E | Drop substrate useState mirror, use `observer()` reads | Moderate-low | Moderate | use-substrate-grid-rows.ts + 9 consumers |
| F | Expose `initStore` on `__vibegrid_debug` | High (debugging) | None | VibeGrid.tsx:301-310, 1 line |

## Recommendations

**Accept: F (P0), A + D (P1 parallel), C (P2), B (P3). Defer: E.**

### Phasing rationale

- **F first** — 1-line, zero risk, dividend on every future stall debug.
- **A and D in parallel** — independent surfaces (RAF chain vs reaction lifecycle), both unblock C.
- **C after A + D** — needs the `rendererPainted` signal that A creates and the simplified ObserverManager that D leaves behind.
- **B last** — biggest scope, but shrinks naturally once A and D have refactored out 3 of the 10 flags (`viewportReady`, `eventHandlersReady`, `rendererInitialized`) and the `isFullyHydrated` consumers.
- **E deferred** — bd1254249 already fixed the bug; the useState mirror is intentional architecture, not accidental complexity. The cost of breaking it (forced consumer-side observer wrapping, count-only delta over-renders) doesn't justify it right now.

### Empty-state semantics (Direction C dependency)

The overlay-as-pure-function predicate `processedRows.length === 0 || !rendererPainted` would persist for genuinely empty collections. Solution: hide skeleton + render a dedicated empty-state component once `entityDataKnownComplete` is true (ground truth = substrate `isReady` plus the existing 5s fallback).

### Direction D scope

Gate **all 12** ObserverManager reactions on post-paint creation, not just the 6 that have explicit bails today. Consistent model; the free-firing 3 (column widths, virtual scroll, horizontal scroll) fire on user-driven events that are post-paint by construction, so no regression. Eliminates the entire `isFullyHydrated` reaction-coupling layer.

## Open questions (resolved during research)

- Q: Does `rendererPainted` exist? → A: No. Closest proxy is `rendererInitialized`, but it's one of the 10 `isFullyHydrated` ANDs. New signal needed for Direction C, which Direction A will introduce as part of the paint-observed phase.
- Q: Is the count-only short-circuit still in the code? → A: Yes, but bd1254249 made it safe by comparing `isReady` too. The structural cleanup is for clarity, not for fixing an active bug.
- Q: Why is the 15s InitStore timeout disabled? → A: Store-recreation false positives — old timeouts fired against fresh stores. Solvable with per-instance generation IDs as part of Direction B.
- Q: Why does the useState mirror exist? → A: Intentional MobX↔React boundary, introduced in GH#2804 for 100k-row support. Not accidental complexity.

## Next steps

Write spec `docs/planning/specs/2925-vibegrid-render-system-simplification.md` with behaviors and phases for F → A + D → C → B. Defer E to a separate issue if needed later.

## Source attribution

All claims sourced via file:line; full details in five companion agent reports captured in research transcripts. Key files:
- `apps/web/src/shared/systems/vibegrid/renderers/core/SimplePassiveRenderer.ts`
- `apps/web/src/shared/systems/vibegrid/stores/InitStore.ts`
- `apps/web/src/shared/systems/vibegrid/observers/ObserverManager.ts`
- `apps/web/src/systems/vibegrid/VibeGrid.tsx`
- `apps/web/src/shared/data/query/use-substrate-grid-rows.ts`
- `apps/web/src/shared/systems/vibegrid/hooks/useVibeGridData.ts`

Recent fixes:
- PR #2924 / commit `bd1254249` — RAF + 200ms setTimeout race; count-only short-circuit `isReady` fix.
- Related: PR #2921 (warm-refresh metric reduction), PR #2920 (cursor dedup + render-init race fixes), PR #2034 (P3 structural refactor introducing current shape).
