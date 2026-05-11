---
initiative: GH#2925-vibegrid-render-system-simplification
type: feature
issue_type: feature
status: approved
priority: medium
roadmap: null
owner: null
github_issue: 2925
github_milestone: null
created: 2026-05-11
updated: 2026-05-11

phases:
  - id: p0
    name: "Foundation — debug exposure (F) + state-machine scaffold"
    tasks:
      - "Add `initStore` to the `__vibegrid_debug` object in `apps/web/src/systems/vibegrid/VibeGrid.tsx:301-310` so it is reachable in browser console without a React Fiber walk. Confirm the surface appears at `window.__vibegrid_debug.initStore` when `?debug=vibegrid` is set."
      - "Introduce the 4-state phase enum on InitStore as a parallel field (not yet load-bearing): `phase: 'init' | 'schema' | 'controllers' | 'painted'` defaulting to `'init'`. Define a single `transitionPhase(next)` action with an invariant check that asserts forward progress (init→schema→controllers→painted). The existing 10-flag `hydrationState` continues to drive `isFullyHydrated` in p0 — the new field is set in parallel so p1–p4 can begin using it without breaking callers. Reset paths must reset `phase` to `'init'` alongside the existing reset of `hydrationState`."
      - "Add `entityDataKnownComplete` to InitStore as a parallel field for `entityDataLoaded` (same setter sites: `useVibeGridData.ts:156, 179, 200`). p0 sets both in lockstep; p4 removes the old name."
      - "Add `setContainer(el: HTMLElement | null)` action method to InitStore that records the container ref. p0 wires the call from `VibeGrid.tsx:1006` (alongside the existing `markReady('containerReady')` call — both fire in lockstep). The container field is non-load-bearing in p0; the `transitionPhase('schema')` assertion that reads it lands in p4."
      - "Acceptance: `window.__vibegrid_debug.initStore.phase` is `'init'` on first mount and observable from the console. Vitest InitStore tests updated to cover `transitionPhase()` invariants. No behavioral change to overlay or renderer."
    test_cases:
      - "Unit: `transitionPhase` rejects backward transitions and skipped transitions (init→controllers, painted→schema)."
      - "Unit: reset() returns phase to 'init' and clears entityDataKnownComplete."
      - "Manual: open any VIbeGrid in dev with `?debug=vibegrid`, run `window.__vibegrid_debug.initStore` in console, see `phase` and `entityDataKnownComplete` accessible."

  - id: p1
    name: "Collapse SimplePassiveRenderer.postInitialization (A)"
    tasks:
      - "Flatten `SimplePassiveRenderer.postInitialization()` at `apps/web/src/shared/systems/vibegrid/renderers/core/SimplePassiveRenderer.ts:693-946` to two stages: (1) synchronous DOM-ready stage and (2) single `scheduleAfterPaint` for body render + paint observation."
      - "Sync DOM-ready stage runs entirely synchronously after `initDOM()` returns: call `initializePositionTracking()` (current Phase 1), then create ScrollController, SelectionService, CellActionRouter, InteractionCoordinator, MouseController, ColumnWidthManager (current Phase 2), then OverlayManager.initializeOverlay() + EventManager.setupEventHandling() + InteractionCoordinator.setOverlayManager() (current Phase 3), then renderHeader() (current Phase 4). At end of this stage call `initStore.transitionPhase('controllers')`."
      - "Preserve the strict ordering invariants surfaced by research. **Two are inside `postInitialization` and in-scope for p1's flattening:** ScrollController must be constructed before MouseController (Mouse holds Scroll ref); InteractionCoordinator must exist before `OverlayManager.initializeOverlay()` (Overlay references InteractionCoordinator). **One lives in `initPhase2Managers()` (separate method, NOT in postInitialization) and stays where it is — don't move it:** `EventManager` must be created before `KeyboardController` in initPhase2Managers (Keyboard's constructor calls eventManager methods; see `SimplePassiveRenderer.ts:567-586`). Add a code comment block in the flattened `postInitialization` listing the two in-scope dependencies. Verify p1 does NOT alter the construction site of EventManager or KeyboardController."
      - "Single `scheduleAfterPaint` wraps `renderBody()` and the paint observation. Inside the callback: call `renderBody()`, then call `initStore.transitionPhase('painted')`. Remove the nested Phase 5a→5b structure (no need to wait another frame; the paint-after-renderBody observation collapses into the same callback because `scheduleAfterPaint`'s RAF resolves AFTER paint by definition)."
      - "Keep `scheduleAfterPaint` helper at lines 72-81 as-is (RAF + 200ms setTimeout race, fired-once guard). The 200ms fallback remains the unfocused-tab safety net."
      - "Update all `markReady()` call sites that wrote to `viewportReady`, `eventHandlersReady`, `rendererInitialized`: in p1 they continue to call markReady for the 10-flag tracking but ALSO call transitionPhase at the appropriate boundary. Specifically: existing `markReady('viewportReady')` at line 830 and `markReady('eventHandlersReady')` at line 864 both still fire (sync now); existing `markReady('rendererInitialized')` at line 926 still fires. transitionPhase('controllers') is called after `eventHandlersReady` markReady; transitionPhase('painted') is called after `rendererInitialized` markReady."
      - "Also wire `transitionPhase('schema')` inside `InitStore.initializeStores()` immediately after the last sequential `await` (after `interactionStore.init()` completes and its `markReady('interactionStoreReady')` fires). p1 only adds the call; the assertion that reads `this.container` lands in p4. Without this in p1, the debug surface (B1) shows `phase` stuck at `'init'` for the entire async store-init window, reducing its diagnostic value during p2/p3 development."
      - "Update the `renderBody` relaxed gate (the GH#2920 'isFullyHydrated short-circuit when rows present' block at `SimplePassiveRenderer.ts:1901-1912` — this is the post-PR#2924 shape, which relaxes the gate when `processedRows.length > 0` so a mid-init dataVersion bump can still render). Leave the gate intact in p1 to avoid coupling p1 and p2; p2 will remove the bail entirely."
      - "Acceptance: `pnpm --filter @baseplane/web typecheck` clean. Existing Vitest renderer tests pass. Manual check on preview: warm refresh of `/entities/CertificateOfInsurance` shows cells within ~16ms on focused tab and within ~200ms on blurred tab. `__vibegrid_debug.initStore.phase` advances through 'init'→'schema'→'controllers'→'painted'."
    test_cases:
      - "Unit: renderer test verifying `postInitialization` calls `initStore.transitionPhase('controllers')` synchronously and `transitionPhase('painted')` inside a single `scheduleAfterPaint` callback."
      - "Unit: controller-ordering invariant test — mock the 4 controller constructors, verify Scroll→Mouse, EventManager→Keyboard, InteractionCoordinator→OverlayManager construction order."
      - "Unit: `scheduleAfterPaint` race — fake RAF (never fires) + advance timers 200ms; verify callback fired exactly once."

  - id: p2
    name: "ObserverManager created post-paint (D)"
    tasks:
      - "Move `observerManager.init()` out of `SimplePassiveRenderer.initObservers()` (currently called at `SimplePassiveRenderer.ts:331`) into a new method `enableObserversPostPaint()` that runs inside the `scheduleAfterPaint` callback added in p1, immediately AFTER `transitionPhase('painted')` and BEFORE renderBody returns. ObserverManager instance is still created early (constructor is cheap); only `.init()` (which creates the 12 reactions) is deferred."
      - "Replace `createHydrationObserver` at `ObserverManager.ts:793-811` with `fireImmediately: true` on each of the 12 individual reactions. Delete `createHydrationObserver` and remove the `hydrationDisposer` disposer entry. The reactions that today bail on `!isFullyHydrated` will instead run their bodies on creation, reading the post-paint state of the stores."
      - "Remove the `!isFullyHydrated` bail check from these 6 reactions: createDataObserver (`ObserverManager.ts:254`), createColumnVisibilityObserver (`:372`), createSearchFilterObserver (`:407`), createRowExpansionObserver (`:447`), createIncrementalProcessingObserver (`:533`), createColumnOrderObserver (`:595`). Keep the `!observersEnabled` bail in place as a defensive killswitch (useful for explicit teardown during unmount-races; never disabled in production but cheap to keep)."
      - "Verify that the 4 reactions flagged as risky in research (Data, Incremental Processing, Virtual Scroll, Grid Line Canvas) handle the fireImmediately case without crashing on first invocation: each must tolerate `tableCoreStore.processedRows.length === 0`, missing `rowOffsets`, or a viewport whose dimensions are still defaults. Add explicit guards where research found gaps; do NOT reintroduce the `isFullyHydrated` bail."
      - "Update the relaxed `renderBody` gate at SimplePassiveRenderer.ts:1901-1912: the bail was added to guard against premature reaction fire; with post-paint observer creation it cannot happen, so the relaxation is no longer needed. Simplify renderBody's entry to a single phase check (`phase === 'painted' || phase === 'controllers'` — controllers is needed because renderBody is called once during postInitialization itself, before transitionPhase('painted'))."
      - "Acceptance: ObserverManager has 11 reactions (was 12 — hydration observer removed); none bail on `isFullyHydrated`; existing Vitest tests for ObserverManager pass after updating expectations. Live: GH#2923 reproduction (warm refresh) still hides overlay within 200ms."
    test_cases:
      - "Unit: observerManager.init() called from the post-paint callback creates 11 reactions, each with fireImmediately: true."
      - "Unit: data observer fires once on creation when processedRows has rows already present, dispatching to the correct update strategy."
      - "Unit: data observer fires once on creation with empty processedRows without throwing."
      - "Unit: removing `createHydrationObserver` does not leave dangling references — search the codebase for `createHydrationObserver`, `hydrationDisposer`, ensure all are removed."

  - id: p3
    name: "Loading overlay as pure function + empty-state component (C)"
    tasks:
      - "Rewrite the overlay predicate at `apps/web/src/systems/vibegrid/VibeGrid.tsx:1241-1296`. New computed: `const showLoadingOverlay = initStore.phase !== 'painted' || (!initStore.entityDataKnownComplete && tableCoreStore.processedRows.length === 0)`. Replace the existing `(!isReady || !isRendered) && initStore` predicate with `showLoadingOverlay && initStore`. Delete the local `isReady` (line 1242) and `isRendered` (line 1243) computations."
      - "Stop threading `isDataLoading` from `useVibeGridData` into VibeGrid's overlay decision. The hook may continue returning `isLoading` for other consumers (audit them: search `isDataLoading` across the web app) but the overlay no longer reads it. If no consumer remains, remove from the hook signature in p4."
      - "Add a new empty-state component `VibeGridEmptyState.tsx` in `apps/web/src/systems/vibegrid/components/`. Renders when `phase === 'painted' && processedRows.length === 0 && entityDataKnownComplete && !globalSearchText && !filterGroup`. Use the same visual idiom as the existing search/filter empty-state inline at VibeGrid.tsx:1370-1405 (centered text 'No records yet', muted-foreground color, optional secondary call-to-action like 'Create one to get started') but the entity-noun comes from the `entityDisplayName` prop (declared on the VibeGrid component at `VibeGrid.tsx:80` and destructured at `:208` — pass it down to the empty-state via the same threading as the existing search/filter block, line `:1415`). Wire it in VibeGrid.tsx as a peer to the existing search/filter empty-state block. Adhere to agent-testability rules: `<div data-testid='vibegrid-empty-state'>` on the container, semantic `<p>` for body text, `aria-label='Empty state for {entityDisplayName}'`."
      - "Confirm the existing search/filter empty-state at VibeGrid.tsx:1370-1405 continues to render under its existing condition (active search/filter, zero results). New empty-state and search/filter empty-state are mutually exclusive predicates; both should never render simultaneously."
      - "Update VibeGridLoadingOverlay at `apps/web/src/systems/vibegrid/components/VibeGridLoadingOverlay.tsx` (confirmed path) to remove the self-aware 'always render, let parent control' comment at lines 40-43. Parent now controls visibility exclusively."
      - "Acceptance: warm refresh of a populated grid hides the overlay within ~200ms (no skeleton over real cells). Cold load of a genuinely empty collection (e.g., a new entity type with zero rows) shows the new VibeGridEmptyState component, not a stuck skeleton. Search/filter empty-state path unchanged."
    test_cases:
      - "Unit: overlay predicate truth table covering (phase='painted', rows>0)→hidden, (phase='painted', rows=0, entityDataKnownComplete=true)→hidden, (phase='painted', rows=0, entityDataKnownComplete=false)→shown, (phase='controllers', any)→shown."
      - "Unit: VibeGridEmptyState renders entityDisplayName in body text; has data-testid='vibegrid-empty-state'."
      - "Unit: VibeGridEmptyState predicate does not fire when globalSearchText is set (the search/filter empty-state is responsible for that case)."

  - id: p4
    name: "Hard-cut hydrationState → phase machine + 15s timeout re-arm (B)"
    tasks:
      - "Remove the 10-flag `hydrationState` object from `apps/web/src/shared/systems/vibegrid/stores/InitStore.ts` (declared around lines 41-59). Remove the `markReady(depName)` setter (lines 279-305). Remove the `isFullyHydrated` computed getter (lines 234-242). Remove the `hydrationState` field references in `reset()` and any debug logging."
      - "Phase transitions now drive all hydration semantics. `InitStore.initializeStores()` is **async** and awaits each store's `.init()` sequentially (`InitStore.ts:333-368` — `await persistenceStore.init()` → `await tableCoreStore.init()` → `await visualStateStore.init()` → `await interactionStore.init()` → slot preload). The correct call site for `transitionPhase('schema')` is **immediately after the last sequential await completes** inside `initializeStores()`, before its caller proceeds. Wire transitionPhase('controllers') as already done in p1 (end of sync stage in postInitialization). Wire transitionPhase('painted') as already done in p1 (inside the single `scheduleAfterPaint`). Verify: any consumer of `initStore` that runs before `initializeStores()` resolves must tolerate `phase === 'init'`; spec implementer should grep for `phase` reads to confirm none assume `'schema'` before the await completes."
      - "`schemaLoaded` and `containerReady` were called out as semantically distinct in p0. With the phase machine: schema enters the 'schema' phase boundary (no separate flag); container readiness becomes a precondition for moving from 'init' to 'schema' — assert `this.container != null` inside transitionPhase('schema'). The previous `containerReady` mark at VibeGrid.tsx:1006 is replaced with an `initStore.setContainer(el)` call that records the element; transitionPhase('schema') reads `this.container`."
      - "Rename `entityDataLoaded` → `entityDataKnownComplete` everywhere. Setter sites in `useVibeGridData.ts:156, 179, 200, 205` (the 5s fallback). Delete the parallel field added in p0; this rename is the single source of truth now."
      - "Update every consumer of `isFullyHydrated` across the codebase. Use `grep -rn 'isFullyHydrated'` to find them all (research called out: `SimplePassiveRenderer.ts:1899-1900, 616`, `ObserverManager.ts:356`, `RenderScheduler.ts:124`, `VibeGrid.tsx` — confirm via grep). Replace each read with `initStore.phase === 'painted'` (or, where the consumer also wants data-known semantics, `phase === 'painted' && entityDataKnownComplete`). NO `isFullyHydrated` getter is left behind as an alias."
      - "Re-arm the dormant 15-second InitStore timeout (`InitStore.ts:154-156, 512-513, 809-824`). Add `private generationId = 0` to InitStore. Increment in `reset()`. Inside `init()`, capture the current generation, then schedule `setTimeout(() => { if (this.generationId !== capturedGen) return; if (this.phase !== 'painted') this.recordHydrationStall(); }, 15000)`. `recordHydrationStall` logs an error including the current `phase` and `entityDataKnownComplete`, but does NOT fail the user-visible flow — the 200ms scheduleAfterPaint fallback in renderer init is the actual stall escape."
      - "Update Vitest test fixtures that referenced `hydrationState[...]` or `markReady(...)` to use `transitionPhase(...)` and direct phase checks. Cover the generationId path with a test that resets InitStore before the 15s timer fires and verifies the timer no-ops."
      - "Acceptance: `pnpm --filter @baseplane/web typecheck` clean. `grep -rn 'isFullyHydrated\\|hydrationState\\|markReady\\|createHydrationObserver' apps/web/src` returns ZERO matches. All Vitest tests pass."
    test_cases:
      - "Unit: typecheck — `pnpm --filter @baseplane/web typecheck` reports 0 errors."
      - "Unit: grep — `rg 'isFullyHydrated|hydrationState|markReady|createHydrationObserver' apps/web/src` returns 0 matches in production code (test files may reference history-only in comments)."
      - "Unit: InitStore.transitionPhase('schema') asserts container is non-null."
      - "Unit: 15s timeout no-ops if generationId moved (simulate reset before timer fires)."
      - "Unit: 15s timeout fires recordHydrationStall if phase still not 'painted' after 15s, generationId unchanged."

  - id: p5
    name: "Verification — unit + chrome-devtools smoke"
    tasks:
      - "Run the full vibegrid Vitest suite (`pnpm --filter @baseplane/web test -- --run vibegrid`). Confirm: all renderer tests, all InitStore tests, all ObserverManager tests, all use-substrate-grid-rows tests pass. No skipped tests for behaviors covered by this spec."
      - "Smoke scenario 1 (warm refresh, focused): seed `https://pr-N.dev.baseplane.ai/entities/CertificateOfInsurance?debug=vibegrid` as `preview-deb-admin`. Cold load once to populate OPFS, then reload. Within 200ms of reload, verify `document.querySelectorAll('.vibegridx-cell').length > 0` and `document.querySelector('.vibegridx-container > .absolute.inset-0.z-10') === null`. Capture screenshot proof."
      - "Smoke scenario 2 (warm refresh, blurred during init): same URL. After triggering reload, immediately switch to a different browser tab (lose focus) for 1 second, then refocus. Within 200ms of refocus, cells visible (or already visible from background completion via the 200ms scheduleAfterPaint fallback). `window.__vibegrid_debug.initStore.phase === 'painted'`."
      - "Smoke scenario 3 (cold start, genuinely empty): create a fresh entity type with zero rows (or pick one known empty for a test org). Load `https://pr-N.dev.baseplane.ai/entities/<EmptyType>` as `preview-ceo`. Within 1s, verify `document.querySelector('[data-testid=\"vibegrid-empty-state\"]')` is present and the skeleton overlay is NOT present. `window.__vibegrid_debug.initStore.phase === 'painted'` and `entityDataKnownComplete === true`."
      - "Trace + console capture per scenario: `pnpm ab errors` reports no new console errors; `pnpm ab trace 'open <url>'` produces no perf-regression flags vs the baseline measured pre-implementation (capture baseline at start of p5 from the latest staging without this PR's changes)."
      - "Acceptance: 3 chrome-devtools smoke scenarios pass against the preview deploy of this PR; all Vitest tests pass; PR can move to review."
    test_cases:
      - "Smoke 1 evidence: screenshot, console state of `__vibegrid_debug.initStore.phase` saved to PR description."
      - "Smoke 2 evidence: timing log + final phase state saved to PR description."
      - "Smoke 3 evidence: empty-state screenshot + `data-testid` confirmation saved to PR description."
      - "No new `pnpm ab errors` regressions vs baseline."
---

# VibeGrid render system: structural simplification (post-#2923 retrospective)

> **GitHub Issue:** [#2925](https://github.com/baseplane-ai/baseplane/issues/2925)
> **Type:** Structural refactor (no new product surface; user-visible behavior unchanged except: better debugging, faster unfocused-tab recovery, dedicated empty-state for zero-row collections)
> **Companion research:** `docs/planning/research/2026-05-11-vibegrid-render-system-simplification.md`
> **Related fixes (already merged):** PR #2924 (RAF + 200ms setTimeout race), commit `bd1254249` (count-only short-circuit `isReady` fix)

---

> **Line-number anchors:** File:line references in this spec point to the pre-refactor state of `staging` as of 2026-05-11. Line numbers will shift as the refactor progresses; the **symbol names** (function, class, method, identifier) are the durable anchors and should be the primary navigation aid for the implementer.

## Overview

GH#2923 exposed two compounding bugs in VIbeGrid's warm-refresh path — both fixed surgically by PR #2924 / commit `bd1254249`. The debugging revealed that the renderer's initialization is sequenced through a 5-phase RAF chain, gated by a 10-flag boolean AND, coordinated against an imperative DOM renderer via 12 MobX reactions each with defensive bail conditions, and mirrored from MobX into React via an `autorun` + `useState` boundary. This spec collapses the first four of those into a smaller, observable shape so the next race that emerges can be diagnosed without a React Fiber walk.

This is structural cleanup, not a bug fix. The user-visible improvements are (a) dedicated empty-state component for zero-row collections, (b) faster recovery on unfocused tabs (200ms worst case instead of ~800ms), and (c) debug surface that exposes the lifecycle state directly. Internally: 10 flags → 4 phases; 12 reactions with defensive bails → 11 reactions created post-paint with no bails; two render layers with split-state risk → single source of truth driven by phase + processedRows length.

---

## Feature Behaviors

### B1: Debug surface exposes hydration state directly

**Core:**
- **ID:** `b1-debug-surface-exposes-init-store`
- **Trigger:** Developer opens browser console on any `/entities/<Type>?debug=vibegrid` URL and reads `window.__vibegrid_debug.initStore`.
- **Expected:** Returns the live `InitStore` instance with `phase: 'init' | 'schema' | 'controllers' | 'painted'` and `entityDataKnownComplete: boolean` observable as MobX getters. No React Fiber walk required.
- **Verify:** Open `?debug=vibegrid`, run `window.__vibegrid_debug.initStore.phase` and `.entityDataKnownComplete` in console. Both return truthy/typed values reflecting current state.
- **Source:** `apps/web/src/systems/vibegrid/VibeGrid.tsx:289-457` (debug API construction), `apps/web/src/shared/systems/vibegrid/stores/InitStore.ts` (new `phase` + `entityDataKnownComplete` fields).

#### UI Layer
No user-facing UI. Pure developer surface.

#### Data Layer
No persistence. InitStore is instance-scoped MobX, lives in memory.

---

### B2: Renderer init phases collapsed to sync DOM-ready + one paint-observed callback

**Core:**
- **ID:** `b2-collapse-renderer-init-phases`
- **Trigger:** `SimplePassiveRenderer.postInitialization()` is invoked by `GridInitBuilder` after `initDOM()` returns.
- **Expected:** Two stages, not five. Stage 1 (sync): position tracking + all controllers + event handlers + header render + `transitionPhase('controllers')`. Stage 2 (one `scheduleAfterPaint`): `renderBody()` + `transitionPhase('painted')`. Total RAF/setTimeout races: 1, not 4.
- **Verify:** Add a Vitest renderer test that instruments `scheduleAfterPaint` invocations during `postInitialization` and asserts the count is exactly 1. Confirm phase advances from `'controllers'` synchronously, then `'painted'` inside the single callback. Manual: on unfocused tab, GH#2923 reproduction now resolves within 200ms (was ~800ms cumulative with 4 chained scheduleAfterPaint).
- **Source:** `apps/web/src/shared/systems/vibegrid/renderers/core/SimplePassiveRenderer.ts:693-946`.

#### Code Layer
- Preserved invariants (must hold after flattening): ScrollController → MouseController; EventManager → KeyboardController; InteractionCoordinator → OverlayManager.
- `scheduleAfterPaint` helper at lines 72-81 remains as-is (RAF + 200ms setTimeout race, fired-once guard).

---

### B3: ObserverManager reactions created post-paint, no hydration bails

**Core:**
- **ID:** `b3-observers-post-paint`
- **Trigger:** Renderer's paint-observed callback completes (B2 stage 2). `observerManager.init()` runs at that moment.
- **Expected:** ObserverManager creates exactly 11 MobX reactions (was 12 — `createHydrationObserver` deleted). Each reaction has `fireImmediately: true`, allowing it to reconcile current store state with rendered DOM on first activation. None of the 11 contains an `isFullyHydrated` bail; the `observersEnabled` killswitch is retained for explicit teardown.
- **Verify:** Vitest test: spy on `reaction()` calls during `observerManager.init()`; assert count === 11; assert each receives `{ fireImmediately: true }`. Search apps/web/src for `createHydrationObserver` and `isFullyHydrated` — must return zero matches.
- **Source:** `apps/web/src/shared/systems/vibegrid/observers/ObserverManager.ts:119-811`, `apps/web/src/shared/systems/vibegrid/renderers/core/SimplePassiveRenderer.ts:331` (call site moves to post-paint).

#### Code Layer
- Removed reactions: `createHydrationObserver` (recovery patch is no longer needed; `fireImmediately` on each reaction subsumes its function).
- Removed bails: `if (!this.deps.initStore.isFullyHydrated) return` from 6 reactions (Data, ColumnVisibility, SearchFilter, RowExpansion, IncrementalProcessing, ColumnOrder).
- Retained: `observersEnabled` check at the top of every reaction (cheap, defensive killswitch for explicit teardown).
- Data, Incremental Processing, Virtual Scroll, Grid Line Canvas reaction bodies must tolerate zero-row state on first invocation (no `processedRows[0]` reads without length check; no `rowOffsets[0]` reads without rowOffsets-defined check; no viewport queries that assume non-zero dimensions).

---

### B4: Loading overlay is a pure function of phase + processedRows

**Core:**
- **ID:** `b4-overlay-pure-function`
- **Trigger:** React renders VibeGrid.
- **Expected:** Overlay visibility predicate is `initStore.phase !== 'painted' || (!initStore.entityDataKnownComplete && tableCoreStore.processedRows.length === 0)`. No reads of `isDataLoading`, no derived `isReady`/`isRendered` locals.
- **Verify:** Unit truth table covering 4 cases (see p3 test_cases). Manual: warm refresh of populated grid hides overlay within 200ms; the GH#2923 split-state class of bugs (overlay-mounted-while-body-painted) is structurally impossible because the same `phase === 'painted'` boolean drives both the renderer-stops-painting-skeleton signal and the overlay-hides decision.
- **Source:** `apps/web/src/systems/vibegrid/VibeGrid.tsx:1241-1296`.

#### UI Layer
- `VibeGridLoadingOverlay` self-render comment at lines 40-43 removed; parent is sole authority.
- No change to the overlay's internal markup or styling.

---

### B5: Dedicated empty-state for genuinely empty collections

**Core:**
- **ID:** `b5-empty-state-component`
- **Trigger:** Grid mounts, paints, receives a substrate delivery (or 5s fallback) confirming the collection has zero rows AND no active search/filter is set.
- **Expected:** `VibeGridEmptyState.tsx` renders centered inside the grid container with the entity noun pulled from `entityDisplayName`. The skeleton-pulse loading overlay is NOT rendered simultaneously.
- **Verify:** Cold-load a known-empty entity type as `preview-ceo`. Verify `document.querySelector('[data-testid="vibegrid-empty-state"]')` is present, `.absolute.inset-0.z-10` overlay is absent. Verify `initStore.phase === 'painted' && initStore.entityDataKnownComplete === true && tableCoreStore.processedRows.length === 0` simultaneously.
- **Source:** `apps/web/src/systems/vibegrid/components/VibeGridEmptyState.tsx` (NEW FILE), wired in `apps/web/src/systems/vibegrid/VibeGrid.tsx` as a peer to the existing search/filter empty-state at lines 1370-1405.

#### UI Layer
- New component `VibeGridEmptyState` — centered text "No records yet" plus the entity noun, muted-foreground color, optional secondary line.
- Accessibility: `data-testid="vibegrid-empty-state"`, `aria-label="Empty state for {entityDisplayName}"`, semantic `<p>` body, `opacity: 0` rules NOT used (always shown when predicate holds).
- Mutually exclusive with the search/filter empty-state — predicates checked simultaneously.

---

### B6: InitStore lifecycle is a 4-state machine

**Core:**
- **ID:** `b6-state-machine`
- **Trigger:** InitStore lifecycle events fire as the grid initializes.
- **Expected:** `InitStore.phase` enum walks deterministically: `'init' → 'schema' → 'controllers' → 'painted'`. `transitionPhase(next)` asserts forward progress (no skipping, no regression). The 10-flag `hydrationState` object, the `markReady(depName)` setter, and the `isFullyHydrated` getter are all removed in a hard cut. Every former consumer of `isFullyHydrated` reads `phase === 'painted'` (and, where data semantics matter, also `entityDataKnownComplete`).
- **Verify:** `rg 'isFullyHydrated|hydrationState|markReady|createHydrationObserver' apps/web/src` returns zero matches. Unit: `transitionPhase` rejects `init→controllers` (skipped), `painted→schema` (backward). Manual: walk through `__vibegrid_debug.initStore.phase` on a slow cold start, observe it advance through all four states.
- **Source:** `apps/web/src/shared/systems/vibegrid/stores/InitStore.ts` (replaces lines 41-242 + 279-305).

#### Data Layer
- `entityDataLoaded` field renamed to `entityDataKnownComplete`. Setter sites at `useVibeGridData.ts:156, 179, 200, 205` updated.
- No persistence; MobX instance state only.

---

### B7: Hydration stall detection re-armed with generation IDs

**Core:**
- **ID:** `b7-stall-detection`
- **Trigger:** 15 seconds elapse after `InitStore.init()` was called and `phase` is still not `'painted'`.
- **Expected:** A diagnostic log fires (`recordHydrationStall`) including current `phase`, `entityDataKnownComplete`, and the captured `generationId`. The user-visible flow is unaffected (the 200ms `scheduleAfterPaint` fallback is the actual stall escape; this timer is for telemetry). If `InitStore.reset()` is called before 15s elapses, the increment to `generationId` causes the timeout callback to no-op when it eventually fires.
- **Verify:** Unit: simulate a stuck phase + 15s timer advance → `recordHydrationStall` fires. Unit: reset before 15s + advance 15s → callback no-ops (generationId mismatch). No console errors during normal cold-start.
- **Source:** `apps/web/src/shared/systems/vibegrid/stores/InitStore.ts` (revives dormant timeout infrastructure at lines 154-156, 512-513, 809-824 of the pre-refactor file; in the new shape this lives next to `transitionPhase`).

#### Observability Layer
- Logs use the existing `vibegrid` logger namespace at `error` level when stall detected. No telemetry pipe changes required; the existing log surface picks them up.

---

### B8: GH#2923 warm-refresh regression is structurally prevented

**Core:**
- **ID:** `b8-gh2923-regression-prevention`
- **Trigger:** User refreshes a substrate-owned grid on an unfocused or occluded tab with a warm OPFS cache populated.
- **Expected:** Within 200ms of substrate delivery, `phase === 'painted'`, the overlay is unmounted, and cells are visible. The two compounding bugs from GH#2923 (RAF stall + count-only short-circuit) are both eliminated structurally: the flattened init chain has only ONE `scheduleAfterPaint` so there is no chain to stall; observers fire-immediately on post-paint creation so any data delivered during init is reconciled on first activation.
- **Verify:** Smoke scenario 2 in p5 (warm refresh, blur tab during init, refocus) — cells must be visible within 200ms of refocus and `phase === 'painted'`. Cells query `document.querySelectorAll('.vibegridx-cell').length > 0`; overlay query `document.querySelector('.vibegridx-container > .absolute.inset-0.z-10') === null`.
- **Source:** Composition of B2 + B3 + B4 + B6 above. No new code; this behavior is a property of the combined refactor.

---

## Non-Goals

- **Replacing `SimplePassiveRenderer` with a React-virtualized renderer (TanStack Table, AG Grid, react-window).** This is the issue's largest architectural bet and is explicitly out of scope per the original retrospective.
- **Direction E — dropping the substrate `useState` mirror.** The bd1254249 fix (commit) eliminates the bug class the issue called out; the mirror itself is intentional MobX↔React boundary architecture introduced for 100k-row support (GH#2804), not accidental complexity. Defer to a separate issue if observer-pattern troubles emerge elsewhere.
- **Solving the substrate-side cold-start worker queue starvation** (large entities like RFI blocking small ones for ~30s). Worth its own issue; not in scope here.
- **Adding a "loading" state to `VibeGridEmptyState`.** The empty-state component renders only when we know the collection is genuinely empty (`entityDataKnownComplete && processedRows.length === 0`). The loading skeleton remains responsible for the pre-paint state.
- **Migrating other VIbeGrid stores to the phase-machine pattern** (TableCoreStore, VisualStateStore, etc. all have their own lifecycle). Only InitStore is in scope.
- **Telemetry / metrics changes** beyond re-arming the 15s stall log. The existing `recordHydrationComplete` metric can continue to fire on `transitionPhase('painted')`.
- **`isDataLoading` removal from `useVibeGridData`'s public return type.** If callers other than the overlay still read it, leave it in place; if not, remove it as a tidy. Either is acceptable.

---

## Verification Plan

Run from a clean checkout on a feature branch with the full mega-PR applied. Preview deploy URL takes the form `https://pr-<N>.dev.baseplane.ai`.

### Step 1 — Typecheck and unit tests

```bash
pnpm --filter @baseplane/web typecheck
pnpm --filter @baseplane/web test -- --run vibegrid
```

**Expected:** Both commands exit 0. No skipped tests for behaviors covered by this spec.

### Step 2 — Grep cleanliness

```bash
rg 'isFullyHydrated|hydrationState|markReady|createHydrationObserver' apps/web/src
rg "isDataLoading" apps/web/src/systems/vibegrid/VibeGrid.tsx
```

**Expected:** First command — zero matches in production code paths. Second command — `isDataLoading` no longer appears in `VibeGrid.tsx`'s overlay-decision code path (any remaining matches in this file must be unrelated to overlay visibility; visually inspect to confirm). Zero matches preferred. Matches in `_archive/`, git history comments inside tests, or markdown docs are acceptable.

### Step 3 — Smoke scenario 1 (warm refresh, focused)

```bash
pnpm ab auth login preview-deb-admin
pnpm ab open https://pr-N.dev.baseplane.ai/entities/CertificateOfInsurance?debug=vibegrid
# Cold load completes, OPFS populates. Then:
pnpm ab eval "location.reload()"
sleep 1
pnpm ab eval "({ cells: document.querySelectorAll('.vibegridx-cell').length, overlay: !!document.querySelector('.vibegridx-container > .absolute.inset-0.z-10'), phase: window.__vibegrid_debug?.initStore?.phase })"
```

**Expected:** `{ cells: > 0, overlay: false, phase: 'painted' }`.

### Step 4 — Smoke scenario 2 (warm refresh, RAF paused during init)

Goal: exercise the 200ms `scheduleAfterPaint` setTimeout-fallback path that prevents the GH#2923 regression. `location.reload()` destroys any `Object.defineProperty` overrides set in the previous document context, so the override must land in the *new* document via CDP `Page.addScriptToEvaluateOnNewDocument` BEFORE the navigation.

There are two execution paths — use the **primary** if your `ab` setup exposes the raw CDP grid path described in `.claude/rules/chrome-devtools.md`; use the **fallback** otherwise.

**Primary (raw CDP injection — preferred):**

```bash
# Pre-condition: warm OPFS cache from a prior cold load on the URL below.
pnpm ab grid nav https://pr-N.dev.baseplane.ai/entities/CertificateOfInsurance?debug=vibegrid

# Inject a stub via CDP that persists across the next navigation. The stub
# replaces requestAnimationFrame with a no-op for 500ms, forcing the
# scheduleAfterPaint helper to fall through to its 200ms setTimeout.
pnpm ab grid eval "(async () => { \
  const ws = window.__cdp_send;  /* helper from ab grid */ \
  await ws('Page.addScriptToEvaluateOnNewDocument', { source: \
    'window.__originalRAF = window.requestAnimationFrame;' + \
    'window.requestAnimationFrame = () => 0;' + \
    'setTimeout(() => { window.requestAnimationFrame = window.__originalRAF }, 500);' \
  }); \
})()"

pnpm ab grid reload
sleep 1

pnpm ab grid eval "({ cells: document.querySelectorAll('.vibegridx-cell').length, phase: window.__vibegrid_debug?.initStore?.phase })"
```

**Fallback (manual via real Chrome, no automation):**

1. Open `https://pr-N.dev.baseplane.ai/entities/CertificateOfInsurance?debug=vibegrid` in a real Chrome window.
2. Cold-load once to warm OPFS.
3. Open DevTools → Performance → throttling, set "CPU: 6x slowdown" to lengthen the init window.
4. Reload the tab AND immediately switch focus to a different application window (cmd+tab on macOS, alt+tab on Linux).
5. After 1 second, switch focus back.
6. In DevTools console, run: `({ cells: document.querySelectorAll('.vibegridx-cell').length, phase: window.__vibegrid_debug?.initStore?.phase })`

**Expected (both paths):** `{ cells: > 0, phase: 'painted' }` after the 200ms `scheduleAfterPaint` fallback fires. If `phase !== 'painted'` after 1 second of elapsed time, the structural prevention of GH#2923 has failed — investigate `SimplePassiveRenderer.postInitialization`'s scheduleAfterPaint callback and confirm it ran via the setTimeout path (the fired-once guard's RAF branch was correctly blocked).

**Acceptance for scenario 2:** Primary path passes; if primary path is unavailable, fallback passes with PR-description evidence (screenshot of console output) attached.

### Step 5 — Smoke scenario 3 (cold start, genuinely empty)

Pre-condition: identify or create an entity type with zero rows in a test org. For example, in DEB construction, an entity type recently added but never populated.

```bash
pnpm ab auth login preview-ceo
pnpm ab open https://pr-N.dev.baseplane.ai/entities/<EmptyEntityType>
sleep 2
pnpm ab eval "({ emptyState: !!document.querySelector('[data-testid=\"vibegrid-empty-state\"]'), overlay: !!document.querySelector('.vibegridx-container > .absolute.inset-0.z-10'), phase: window.__vibegrid_debug?.initStore?.phase, dataKnownComplete: window.__vibegrid_debug?.initStore?.entityDataKnownComplete })"
```

**Expected:** `{ emptyState: true, overlay: false, phase: 'painted', dataKnownComplete: true }`.

### Step 6 — Console + network regression check

```bash
pnpm ab errors
```

**Expected:** Zero new errors vs the baseline captured at the start of p5 (baseline = same flow on staging without this PR).

### Step 7 — Behavior coverage map

Confirm every behavior B1–B8 has at least one corresponding test or verification step:

| Behavior | Coverage |
|----------|----------|
| B1 (debug surface) | Step 3/4/5 read `__vibegrid_debug.initStore` directly |
| B2 (collapse phases) | Unit (p1 test_cases) + Step 3 timing |
| B3 (post-paint observers) | Unit (p2 test_cases) + grep in Step 2 |
| B4 (overlay pure function) | Unit (p3 test_cases) + Step 3 / Step 4 |
| B5 (empty-state component) | Unit (p3 test_cases) + Step 5 |
| B6 (state machine) | Unit (p4 test_cases) + grep in Step 2 |
| B7 (stall detection) | Unit (p4 test_cases) |
| B8 (GH#2923 prevention) | Step 4 |

---

## Implementation Hints

### Key Imports

```ts
// New state-machine API in InitStore (see B6)
import { InitStore } from '@/shared/systems/vibegrid/stores/InitStore'
const phase: 'init' | 'schema' | 'controllers' | 'painted' = initStore.phase
initStore.transitionPhase('schema')                  // forward only; asserts
initStore.entityDataKnownComplete                    // boolean

// Renderer paint helper (unchanged; lives in SimplePassiveRenderer)
function scheduleAfterPaint(cb: () => void): void  // RAF + 200ms setTimeout race
```

### Code Patterns

**Flattened postInitialization shape (p1):**
```ts
postInitialization(): void {
  if (this.isDestroyed) return

  // Stage 1 — synchronous DOM-ready work
  this.initializePositionTracking()

  // Controller construction order is load-bearing (preserve invariants):
  //   ScrollController → MouseController (Mouse holds Scroll ref)
  //   InteractionCoordinator → OverlayManager (Overlay references InteractionCoord)
  // NOTE: EventManager and KeyboardController are constructed in initPhase2Managers()
  // (not here). The EventManager → KeyboardController invariant lives there.
  this.scrollController = new ScrollController(/* ... */)
  this.selectionService = new SelectionService(/* ... */)
  this.interactionCoordinator = new InteractionCoordinator(/* ... */)
  this.mouseController = new MouseController(this.scrollController, /* ... */)
  this.columnWidthManager = new ColumnWidthManager(/* ... */)
  this.overlayManager.initializeOverlay()
  this.eventManager.setupEventHandling()
  this.interactionCoordinator.setOverlayManager(this.overlayManager)
  this.renderHeader()
  this.initStore.transitionPhase('controllers')

  // Stage 2 — one scheduleAfterPaint observes the body paint
  scheduleAfterPaint(() => {
    if (this.isDestroyed) return
    this.renderBody()
    this.initStore.transitionPhase('painted')
    this.observerManager.init()    // p2: observers created post-paint
  })
}
```

**Reaction post-paint creation pattern (p2):**
```ts
// Before (p1 still has this):
this.dataObserverDisposer = reaction(
  () => /* ... */,
  () => {
    if (!this.observersEnabled) return
    if (!this.deps.initStore.isFullyHydrated) return     // remove this line
    /* body */
  },
)

// After (p2):
this.dataObserverDisposer = reaction(
  () => /* ... */,
  () => {
    if (!this.observersEnabled) return                   // killswitch retained
    /* body — must tolerate zero processedRows on first fire */
  },
  { fireImmediately: true },                             // reconciles on creation
)
```

**Overlay predicate (p3):**
```tsx
// In VibeGrid.tsx, replace the existing isReady/isRendered locals + overlay JSX:
const showLoadingOverlay =
  initStore.phase !== 'painted' ||
  (!initStore.entityDataKnownComplete && tableCoreStore.processedRows.length === 0)

const showEmptyState =
  initStore.phase === 'painted' &&
  initStore.entityDataKnownComplete &&
  tableCoreStore.processedRows.length === 0 &&
  !visualStateStore.globalSearchText &&
  !visualStateStore.filterGroup

// ... in JSX:
{showLoadingOverlay && initStore && (
  <div className="absolute inset-0 z-10">
    <VibeGridLoadingOverlay initStore={initStore} height={height} width={width} />
  </div>
)}
{showEmptyState && <VibeGridEmptyState entityDisplayName={entityDisplayName} />}
```

**Generation-ID timeout pattern (p4 / B7):**
```ts
class InitStore {
  private generationId = 0

  reset(): void {
    this.generationId += 1
    this.phase = 'init'
    this.entityDataKnownComplete = false
    /* ... */
  }

  init(): void {
    const capturedGen = this.generationId
    setTimeout(() => {
      if (this.generationId !== capturedGen) return     // stale timer; no-op
      if (this.phase === 'painted') return              // succeeded; no-op
      this.recordHydrationStall()
    }, 15_000)
    /* ... */
  }

  private recordHydrationStall(): void {
    logger.error('VIbeGrid hydration stalled', {
      phase: this.phase,
      entityDataKnownComplete: this.entityDataKnownComplete,
      generationId: this.generationId,
    })
  }
}
```

### Gotchas

- **`scheduleAfterPaint` already exists** at `SimplePassiveRenderer.ts:72-81`. Reuse it — do not introduce a second helper.
- **`__vibegrid_debug` is gated on `?debug=vibegrid`** (see `VibeGrid.tsx:289-457`). The B1 exposure does not change this gate.
- **`useSubstrateGridRows` count-only short-circuit fix is already merged** (commit `bd1254249` at `apps/web/src/shared/data/query/use-substrate-grid-rows.ts:499-503`). Do not touch this file unless a real regression demands it.
- **VibeGrid components must be `observer()`-wrapped** to react to MobX changes in `phase` and `entityDataKnownComplete`. `VibeGridInnerBase` is already wrapped — verify the empty-state component is wrapped if it reads MobX state.
- **React StrictMode double-mount** in dev runs `init()` twice per mount cycle. The `generationId` guard makes this safe: first init's 15s timer captures gen=0, second init bumps to gen=1, first timer no-ops when it fires. Verify in dev.
- **`opacity: 0` not `display: none`** for any hover-revealed elements inside `VibeGridEmptyState` (per `.claude/rules/agent-testability.md` rule 4). The new component has no hover state today, but call this out so future edits don't regress accessibility.
- **Reaction fire-immediately fires synchronously inside `reaction()` constructor.** If a reaction body reads `this.viewportStore.scrollTop` it must tolerate `0`; if it reads `processedRows[0]` it must guard for empty arrays. Test the 4 risky reactions (Data, IncrementalProcessing, VirtualScroll, GridLineCanvas) explicitly in p2 unit tests.
- **Mega-PR contingency.** If review surfaces issues localized to B (state machine + 15s timeout), the contingency is: cherry-pick p0–p3 commits onto a new branch as a partial ship; B becomes a follow-up PR. Spec authoring assumes the mega-PR ships intact; this is a fallback.

### Reference Docs

- `docs/planning/research/2026-05-11-vibegrid-render-system-simplification.md` — the companion research doc; cross-cuts all 5 directions with file:line citations.
- `.claude/rules/vibegrid.md` — VIbeGrid store inventory, SlotRegistry lifecycle, instance-scoping rules.
- `.claude/rules/vibegrid-interactions.md` — cell renderer / row expansion / view module slots.
- `.claude/rules/agent-testability.md` — semantic HTML + ARIA rules for the new `VibeGridEmptyState` component.
- `.claude/rules/chrome-devtools.md` — `pnpm ab` smoke testing surface used in p5 verification.
- GH#2923 (the bug that prompted this), GH#2920 + GH#2921 (prior cohort of warm-refresh race fixes), GH#2034 (P3 structural refactor introducing the current shape), PR #2924 (the minimal-risk bug fix complementary to this work).
