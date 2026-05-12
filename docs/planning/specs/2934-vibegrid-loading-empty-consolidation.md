---
initiative: GH#2934-vibegrid-loading-empty-consolidation
type: feature
issue_type: feature
status: approved
priority: medium
roadmap: null
owner: null
github_issue: 2934
github_milestone: null
created: 2026-05-11
updated: 2026-05-11

phases:
  - id: p1
    name: "Extend VibeGridEmptyState — variants, ARIA, slot, VibeGrid props (additive)"
    tasks:
      - "Restructure `apps/web/src/systems/vibegrid/components/VibeGridEmptyState.tsx` root from `<output role=status aria-label=...>` to `<section aria-labelledby={headingId} data-testid='vibegrid-empty-state' data-empty-state-variant={variant} pointer-events:auto>` containing: `<output id={headingId} role='status'>{headline}</output>`, optional `<p>{body}</p>`, optional `{cta}` slot. `<output>` keeps the live-region announcement for the headline only; CTA sits outside the live region so buttons aren't announced as part of the status update."
      - "Add new props to `VibeGridEmptyState`: `variant: 'empty' | 'search' | 'filter'` (required), `headline?: string`, `body?: string`, `cta?: React.ReactNode`, plus the existing `entityDisplayName?: string` (kept as fallback headline derivation for the `empty` variant when no `headline` is provided). Resolution order for the `empty` variant headline: `props.headline ?? \"No ${entityDisplayName ?? 'records'} yet\"`. Built-in copy for `search` and `filter` variants (NOT consumer-overridable in this spec scope): `search` → headline `'No results found'`, body `'Try different search terms or clear filters'`; `filter` → headline `'No results match these filters'`, body `'Try adjusting or clearing filters'`. The `body` prop is only consulted for the `empty` variant; passing it on `search`/`filter` is a noop (do not throw)."
      - "Add new flat props to `<VibeGrid>` at `apps/web/src/systems/vibegrid/VibeGrid.tsx` (the props interface declared around line 80, with destructuring updated at line 208): `emptyStateCta?: React.ReactNode`, `emptyStateHeadline?: string`, `emptyStateBody?: string`. Existing `entityDisplayName` prop unchanged. Thread the three new props into the empty-state render site at `VibeGrid.tsx:1391-1393` (the existing `<VibeGridEmptyState entityDisplayName={entityDisplayName} />` call site)."
      - "Add `variant` discrimination at the empty-state mount in `VibeGrid.tsx`. Replace the current single mount (line 1391-1393) with a single `<VibeGridEmptyState variant={...} ... />` render whose `variant` is computed from `visualStateStore.globalSearchText`/`filterGroup`. Predicate to mount the empty state (any variant): `initStore.phase === 'painted' && initStore.entityDataKnownComplete && tableCoreStore.processedRows.length === 0 && !tableCoreStore.isIncrementalProcessing && effectiveViewMode !== 'kanban'`. Variant resolution MUST treat a filter group with no rules as 'no filter active': `const filterActive = (visualStateStore.filterGroup?.rules?.length ?? 0) > 0; const searchActive = Boolean(visualStateStore.globalSearchText); const variant = searchActive ? 'search' : filterActive ? 'filter' : 'empty'`. (`filterGroup` is observed to reset to `null` at `VisualStateStore.ts:292, 1210, 1243`, but a consumer could apply an empty `{rules: []}` group via `applyFilterGroup` — guarding on `rules.length` prevents shipping the wrong variant in that edge case.) Only the `empty` variant consumes `emptyStateCta` / `emptyStateHeadline` / `emptyStateBody`."
      - "Do NOT yet delete the inline search/filter empty (`VibeGrid.tsx:1394-1428`). The new variant-aware empty-state mount renders for the `empty` case only in p1; p2 wires it for `search`/`filter` and deletes the inline block. Keeping these in lockstep is what makes p1 additive."
      - "Update unit tests at `apps/web/src/systems/vibegrid/components/__tests__/VibeGridEmptyState.test.tsx`: assert all 3 variants render correct headline + body + `data-empty-state-variant` attribute; assert `cta` slot renders when provided as a `React.ReactNode`; assert ARIA shape (section root, output for headline, CTA as sibling not descendant of output); assert `pointer-events: auto` on the section root; assert `aria-labelledby` matches `<output id>`."
      - "Acceptance: `pnpm --filter @baseplane/web typecheck` clean. Updated Vitest suite green. No visible behavior change in any consumer yet (p1 is additive — empty state still renders only when reachable, which is still rare because consumer short-circuits remain in place)."
    test_cases:
      - "Unit: VibeGridEmptyState renders with variant='empty' + headline + body + cta — all three appear; section has data-empty-state-variant='empty'; pointer-events:auto."
      - "Unit: VibeGridEmptyState renders with variant='search' — uses built-in 'No results found' headline; body prop is ignored if passed."
      - "Unit: VibeGridEmptyState renders with variant='filter' — uses built-in 'No results match these filters' headline."
      - "Unit: ARIA shape — `<section>` root has aria-labelledby pointing to `<output id>`; CTA when present is a sibling of `<output>`, not a descendant."
      - "Unit: VibeGrid `<VibeGrid emptyStateCta={<button/>} />` threads slot into the empty-state component (rendered via mounted predicate; mock InitStore phase='painted', entityDataKnownComplete=true, empty rows)."

  - id: p2
    name: "Replace inline search/filter empty (#4) — route through VibeGridEmptyState"
    tasks:
      - "Delete the inline search/filter empty-state JSX block at `apps/web/src/systems/vibegrid/VibeGrid.tsx:1394-1428` (the `<div>` with 'No results found' and conditional 'Try a different search term' copy). The variant-aware mount added in p1 already handles `search` and `filter` variants — this deletion is the cutover."
      - "Confirm by manual scroll/grep that no other site in the codebase imports or references the inline empty-state markup, and that no test asserts against the string 'No results found' in `VibeGrid.tsx` specifically. If a test asserts on the inline copy, update it to assert on `[data-testid=vibegrid-empty-state][data-empty-state-variant=search]` instead."
      - "Verify mutual exclusivity in the new single mount: only ONE empty-state element renders, never two. Mount predicate computes `variant` once; the render returns one `<VibeGridEmptyState>` or none."
      - "Acceptance: opening a populated grid and typing a non-matching search term shows the `search` variant via the new `vibegrid-empty-state` testid. Applying a filter with no matches shows the `filter` variant. Both replace the previously-inline block with no visual regression beyond the new ARIA structure."
    test_cases:
      - "Unit: in a renderer harness, set `visualStateStore.globalSearchText = 'xyz'` with empty processedRows + phase='painted'; assert `[data-empty-state-variant=search]` rendered."
      - "Unit: same with `filterGroup` set, no search; assert `data-empty-state-variant=filter`."
      - "Grep: `rg \"No results found\" apps/web/src` returns zero hits in `VibeGrid.tsx` after deletion (allowed in test files and in localized future copy)."

  - id: p3
    name: "Migrate EntityListView — delete COUNT short-circuit + dead code"
    tasks:
      - "Delete the server-COUNT short-circuit at `apps/web/src/features/entities/components/EntityListView.tsx:801-835` (the block beginning `if (emptyCount.count === 0 && !emptyCount.isLoading && !emptyCount.error)`). Delete the `useEntityCountFetch()` hook invocation at line 593 and remove the import."
      - "Pass the entity-creation affordance into `<VibeGrid emptyStateCta={...}>`. The slot value is `<CreationModeButton modes={schema.creationModes} onCreateForm={...} onCreateUpload={...} ...>` constructed from the same handlers that `EntityEmptyState` used to receive. Pass `emptyStateHeadline={`No ${entityName} records yet`}` and `emptyStateBody='Get started by creating your first record.'` to match prior copy."
      - "Delete dead code (CONDITIONAL on grep). Grep first: `rg \"useEntityCountFetch\" apps/web` and `rg \"EntityEmptyState\" apps/web`. If `EntityListView.tsx` is the only consumer of each, delete the files `apps/web/src/features/entities/components/EntityEmptyState.tsx` and the `useEntityCountFetch` hook (path to be located by grep — likely under `apps/web/src/features/entities/hooks/`). If grep surfaces another consumer, leave the file in place and only remove the EntityListView usage; document any residual consumers in a comment on the spec PR."
      - "Acceptance: EntityListView for an entity with 0 records mounts VibeGrid; loading skeleton shows briefly (<500ms); then `VibeGridEmptyState` renders with the `CreationModeButton` CTA. The 'Form' button opens `CreateRecordDialog`; the 'Upload' button opens the upload dialog ref. No regression for non-empty entities."
    test_cases:
      - "Manual on preview: navigate to an entity type with 0 records as `preview-deb-admin`. Confirm skeleton → `vibegrid-empty-state[data-empty-state-variant=empty]` with the CreationModeButton CTA. Click the form button → CreateRecordDialog opens."
      - "Grep: `rg \"useEntityCountFetch\" apps/web` returns 0 hits after p3 (or only the deleted file's own definition before its removal commit)."
      - "Grep: `rg \"EntityEmptyState\" apps/web` returns 0 hits after p3 (or documents residual consumers per task above)."

  - id: p4
    name: "Migrate MyWorkPage, EmailInboxPage, GCFileBrowser"
    tasks:
      - "MyWorkPage: delete the inline empty-state JSX at `apps/web/src/features/my-work/components/MyWorkPage.tsx:271-276`. Pass `emptyStateHeadline=\"You're all caught up!\"` and `emptyStateBody=\"No items in your work queue\"` to `<VibeGrid>`. Do NOT pass `emptyStateCta` (read-only by interview decision)."
      - "EmailInboxPage: at `apps/web/src/features/email-inbox/components/EmailInboxPage.tsx`, the existing render flow at lines 252-267 is `(isLoading || connectionsLoading) ? <LoadingState /> : error ? <Alert/> : filteredThreads.length === 0 ? <EmptyState type={...}/> : <ThreadListGrid/>`. Preserve the loading + error gates exactly as-is. Restructure ONLY the `filteredThreads.length === 0` branch and the no-connections case: when `!isLoading && !connectionsLoading && !error && connections.length === 0`, render the existing local `<EmptyState type='no-connections' onConnect={...} />` (page-level guard — VibeGrid does not mount). Otherwise mount VibeGrid for the regular grid render."
      - "EmailInboxPage continued: replace the conditional `<EmptyState type=... />` at lines 263-267 with a normal grid mount. `total` is from `useEmailThreadsCollection()` (`apps/web/src/features/email-inbox/hooks/useEmailThreadsCollection.ts:154` — `total: threadsWithLatestSender.length`, the post-fetch thread count BEFORE the page-level `filteredThreads` reduction at `EmailInboxPage.tsx:60-114`). **Important wiring detail**: EmailInbox filters (assigned-to, unread-only, etc.) live on a page-local store (`store.filters.*`) and narrow `filteredThreads` via `useMemo` — they do NOT flow into `visualStateStore.filterGroup`. Therefore VibeGrid's `filter` variant will NOT fire for client-narrowed-to-zero on EmailInbox; the grid would see 0 rows with no `globalSearchText`/`filterGroup` and resolve to the `empty` variant. To preserve the prior 'No matching emails' hint, the EmailInbox migration overrides explicitly: pass `emptyStateCta = total === 0 ? <Button onClick={handleSync}><RefreshCw/> Sync Now</Button> : undefined`; pass `emptyStateHeadline = total === 0 ? 'No emails yet' : 'No matching emails'`; pass `emptyStateBody = total === 0 ? 'Your connected inbox is empty. New emails will appear here automatically.' : 'No emails match your current filters. Try adjusting your filter or sort settings.'`. Do NOT add anything to `visualStateStore.filterGroup` from EmailInbox — keep the filtering page-level."
      - "EmailInboxPage cleanup: prune the `no-threads` and `no-results` branches of the local `EmptyState` component at `apps/web/src/features/email-inbox/components/EmptyState.tsx` (keep only the `no-connections` branch). Update its `type` prop union to `'no-connections'` only; remove dead conditionals. Add `data-testid='email-no-connections'` to the `<EmptyState>` root for VP5 stable selection."
      - "GCFileBrowser: at `apps/web/src/features/gc-files/components/GCFileBrowser.tsx`, pass the existing upload action into `emptyStateCta`. Construct the slot from the same handler that powers the page-level Upload button (line 620-624 area): `emptyStateCta={<Button onClick={() => setUploadOpen(true)}><Upload/> Upload Files</Button>}`. If GCFileBrowser supports additional upload creation types (per interview), include them in the slot using the same composition pattern as EntityListView's `CreationModeButton`. Pass `emptyStateHeadline='No files yet'` (verify against current FileGrid copy; adjust if a clearer phrasing exists in the codebase)."
      - "Acceptance: each of the four consumers shows the correct empty-state surface end-to-end. EmailInbox with 0 connections shows the page-level connect UI (grid does not mount). EmailInbox with connections + 0 emails shows VibeGridEmptyState + Sync CTA. MyWork with empty queue shows VibeGridEmptyState with 'You're all caught up!'. GCFileBrowser with empty folder shows VibeGridEmptyState + Upload CTA."
    test_cases:
      - "Unit (MyWorkPage): render with empty `gridItems`; assert `<VibeGrid>` mounts (no inline empty); assert `emptyStateHeadline` prop value === \"You're all caught up!\" and no `emptyStateCta` is passed."
      - "Unit (EmailInboxPage no-connections): mock `useEmailConnections` to return `connections: []`, `connectionsLoading: false`; mock `useEmailThreadsCollection` to return `isLoading: false`, `total: 0`; assert the local `EmptyState` with `type='no-connections'` and `data-testid='email-no-connections'` renders, and `<VibeGrid>` does NOT mount."
      - "Unit (EmailInboxPage with connections + 0 emails): mock connections.length=1, total=0; assert `<VibeGrid>` mounts with `emptyStateHeadline='No emails yet'` and `emptyStateCta` truthy (Sync button)."
      - "Unit (EmailInboxPage with connections + filtered-to-zero): mock connections.length=1, total=5, filteredThreads.length=0; assert `<VibeGrid>` mounts with `emptyStateHeadline='No matching emails'` and no `emptyStateCta`."
      - "Unit (EmailInbox local EmptyState narrowed union): asserting `type` accepts only `'no-connections'` (TypeScript-only — would fail to compile if other variants passed; cover with a `// @ts-expect-error` test or remove if Biome forbids that pattern)."
      - "Unit (GCFileBrowser): render with empty `data.items`; assert `<VibeGrid>` receives an `emptyStateCta` prop whose rendered output contains a button with text matching /Upload/i."
      - "Unit (no inline empty leakage): grep test — `apps/web/src/features/my-work/components/MyWorkPage.tsx` source string does not contain 'You're all caught up!' inline JSX after migration (must be passed via prop instead)."
      - "Manual VP: see Verification Plan VP1-VP7 below."

  - id: p5
    name: "Harmonize shimmer CSS — single keyframe across TableSkeleton + sparse cells"
    tasks:
      - "Define a single shimmer keyframe in `apps/web/src/systems/vibegrid/vibegridx-cells.css` (or a sibling vibegrid-owned stylesheet — choose whichever currently owns `sparse-skeleton-pulse` at lines 757-767; reuse the same file). Rename the existing `@keyframes sparse-skeleton-pulse` to `@keyframes vibegrid-skeleton-pulse` and keep its timing curve: 1.5s ease-in-out infinite, opacity 0.6 → 1.0 → 0.6. Also keep the `prefers-reduced-motion` override (lines 769-774)."
      - "Update `SparseSkeletonCellRenderer` (`apps/web/src/systems/vibegrid/slots/renderers/sparse-skeleton.ts` and corresponding CSS class `.sparse-skeleton-bar`) to use the renamed keyframe. The class name `sparse-skeleton-bar` may stay (renderer-internal naming) but its `animation:` declaration references `vibegrid-skeleton-pulse`."
      - "Update `apps/web/src/systems/vibegrid/components/TableSkeleton.tsx`: replace the Tailwind `animate-pulse` class on the shimmer cells with a vibegrid-owned class (e.g. `vibegrid-skeleton-bar`) that uses the unified keyframe. The two skeleton variants (`TableSkeleton` 6×8 grid frame and the single-row `TableRowSkeleton` at line 116) both adopt the unified class. Confirm by viewing both side-by-side in a populated grid (post-paint sparse rows during fast scroll) vs an unpopulated grid (TableSkeleton overlay) that the shimmer treatment is visually identical."
      - "Do NOT change the structural layer: the imperative cell-renderer path in `SimplePassiveRenderer.ts` and the React `TableSkeleton` component stay where they are. This task is CSS-only harmonization."
      - "Acceptance: visual inspection of the loading overlay and a fast-scroll on a populated grid (which renders sparse-row skeletons in the viewport) shows identical shimmer timing and color. Existing `SparseSkeletonCellRenderer` unit tests pass after the class/keyframe rename."
    test_cases:
      - "Unit: `apps/web/src/systems/vibegrid/slots/renderers/__tests__/sparse-skeleton.test.ts` — update any class-name assertions to the new keyframe/class name. Suite green."
      - "Grep: `rg \"sparse-skeleton-pulse\" apps/web/src` returns 0 hits (renamed). `rg \"vibegrid-skeleton-pulse\" apps/web/src` returns hits in exactly one stylesheet (the definition) and the two consumers."
      - "Manual: open `/entities/<populated>` with `?debug=vibegrid`, fast-scroll past loaded window, observe sparse-row shimmer; refresh and observe TableSkeleton overlay shimmer; confirm visually identical pulse timing/opacity."
---

## Overview

VibeGrid currently maintains five distinct "data not ready" / "data empty" surfaces, each with its own predicate and markup. The information they convey is binary (waiting vs. empty), so the spread is accidental complexity. GH#2925 built the deterministic phase machine (`init → schema → controllers → painted`) and the `entityDataKnownComplete` flag — exactly the two predicates needed to drive a unified pair of grid-owned surfaces. This spec collapses the five surfaces to two: a single empty-state component (`VibeGridEmptyState`) with three discriminated variants (`empty` / `search` / `filter`) and a `cta` slot, and visually-harmonized shimmer CSS shared between the existing `TableSkeleton` overlay and the per-cell sparse-row skeleton renderer.

## Feature Behaviors

### B1: VibeGridEmptyState supports three discriminated variants

**Core:**
- **ID:** vibegrid-empty-state-variants
- **Trigger:** Grid reaches a state where `phase === 'painted' && entityDataKnownComplete && processedRows.length === 0 && !isIncrementalProcessing && effectiveViewMode !== 'kanban'`. Variant resolved from `visualStateStore.globalSearchText`/`filterGroup` at mount time.
- **Expected:** Exactly one `<VibeGridEmptyState>` mounts with `data-empty-state-variant` ∈ `{empty, search, filter}`. Headline + body copy follow the variant's contract (empty: consumer-overridable; search/filter: built-in fixed copy).
- **Verify:** Unit test mounts the component with each variant + asserts the headline/body/attr. VP1-VP3 (below) hit each variant in a live page.

**Source:** `apps/web/src/systems/vibegrid/components/VibeGridEmptyState.tsx`

#### UI Layer
Component props: `variant: 'empty' | 'search' | 'filter'` (required), `headline?: string`, `body?: string`, `cta?: React.ReactNode`, `entityDisplayName?: string`. Built-in copy:
- `empty`: `headline = props.headline ?? "No ${entityDisplayName ?? 'records'} yet"`; `body = props.body` (omitted if undefined); `cta` rendered if provided.
- `search`: `headline = 'No results found'`; `body = 'Try different search terms or clear filters'`; `cta` NOT rendered (consumer slot is only meaningful for the genuinely-empty case).
- `filter`: `headline = 'No results match these filters'`; `body = 'Try adjusting or clearing filters'`; `cta` NOT rendered.

### B2: ARIA shape — section + output, CTA outside live region

**Core:**
- **ID:** vibegrid-empty-state-aria
- **Trigger:** Any `VibeGridEmptyState` render.
- **Expected:** Root is `<section data-testid='vibegrid-empty-state' data-empty-state-variant={variant} aria-labelledby={headingId} style='pointer-events: auto'>`. Headline lives in `<output id={headingId} role='status'>{headline}</output>` (live-region announces on appearance). Body lives in `<p>{body}</p>` if present. CTA lives in `<div>{cta}</div>` as a SIBLING of `<output>`, NOT a descendant — buttons are not announced as part of the status update.
- **Verify:** Unit test asserts (a) `<output>` is direct child of `<section>`, (b) `cta` slot is direct child of `<section>` (not nested inside `<output>`), (c) `aria-labelledby` matches `<output id>`, (d) `pointer-events: auto` on root.

**Source:** Replaces the current `<output role=status aria-label=...>` root at `apps/web/src/systems/vibegrid/components/VibeGridEmptyState.tsx:18-36` (GH#2925 commit `09c5acc7b`).

#### UI Layer
Markup tree:
```
<section data-testid="vibegrid-empty-state"
         data-empty-state-variant={variant}
         aria-labelledby={headingId}
         style={{ pointerEvents: 'auto', ... }}>
  <output id={headingId} role="status">{headline}</output>
  {body && <p>{body}</p>}
  {cta && <div>{cta}</div>}
</section>
```

### B3: `<VibeGrid>` accepts emptyStateCta / emptyStateHeadline / emptyStateBody props

**Core:**
- **ID:** vibegrid-empty-state-props
- **Trigger:** A consumer passes any of `emptyStateCta`, `emptyStateHeadline`, `emptyStateBody` to `<VibeGrid>`.
- **Expected:** Props thread through to `VibeGridEmptyState` ONLY for the `empty` variant. `search` and `filter` variants use built-in copy and ignore these props (silently — no warning, no throw). `emptyStateCta` accepts any `React.ReactNode`; consumers compose their own buttons.
- **Verify:** Unit test asserts each prop reaches the mounted `VibeGridEmptyState` when variant === 'empty', and is omitted when variant === 'search' or 'filter'.

**Source:** New props on `<VibeGrid>` props interface (`apps/web/src/systems/vibegrid/VibeGrid.tsx` around line 80, destructured at line 208). Threaded to empty-state mount at line 1391-1393.

#### UI Layer
Consumer composition examples (real values used in p3/p4):
```tsx
// EntityListView (p3)
<VibeGrid emptyStateCta={<CreationModeButton modes={schema.creationModes} ... />}
          emptyStateHeadline={`No ${entityName} records yet`}
          emptyStateBody="Get started by creating your first record." ... />

// MyWorkPage (p4) — read-only
<VibeGrid emptyStateHeadline="You're all caught up!"
          emptyStateBody="No items in your work queue" ... />

// EmailInboxPage with connections + 0 emails (p4)
<VibeGrid emptyStateCta={<Button onClick={handleSync}><RefreshCw/> Sync Now</Button>}
          emptyStateHeadline="No emails yet"
          emptyStateBody="Your connected inbox is empty..." ... />

// GCFileBrowser (p4)
<VibeGrid emptyStateCta={<Button onClick={() => setUploadOpen(true)}><Upload/> Upload Files</Button>}
          emptyStateHeadline="No files yet" ... />
```

### B4: Inline search/filter empty (#4) removed; flows through VibeGridEmptyState

**Core:**
- **ID:** vibegrid-inline-empty-removed
- **Trigger:** Grid has zero rows + active search OR filter.
- **Expected:** A `VibeGridEmptyState` with `data-empty-state-variant={search|filter}` renders. The inline `<div>` block formerly at `VibeGrid.tsx:1394-1428` no longer exists; no plain `<div>No results found</div>` is reachable in the runtime DOM.
- **Verify:** Grep returns zero hits for the inline copy in `VibeGrid.tsx`. Unit test sets `visualStateStore.globalSearchText = 'xyz'` in a renderer harness and asserts the new testid renders. VP2 (filter) and VP-extra (search) confirm in browser.

**Source:** Delete `apps/web/src/systems/vibegrid/VibeGrid.tsx:1394-1428` (the inline JSX block).

### B5: EntityListView server-COUNT short-circuit removed; dead code deleted

**Core:**
- **ID:** entity-list-view-short-circuit-removed
- **Trigger:** EntityListView mounts for an entity type.
- **Expected:** `useEntityCountFetch` is no longer called from EntityListView. VibeGrid always mounts. For an entity with zero records, the user sees: loading skeleton (<500ms) → `VibeGridEmptyState` (`empty` variant) with the entity's `CreationModeButton` as `emptyStateCta`. Files `EntityEmptyState.tsx` and `useEntityCountFetch` are deleted IFF they have no other consumers (grep gate).
- **Verify:** Manual navigation on preview (VP1). Grep gates documented in p3 test_cases.

**Source:** Delete `apps/web/src/features/entities/components/EntityListView.tsx:801-835` + the `useEntityCountFetch()` invocation at line 593 + the import. Conditionally delete the hook file + `EntityEmptyState.tsx` based on grep.

#### UI Layer
Replacement render at EntityListView for the (now-non-existent) short-circuit branch: nothing — the unconditional `<VibeGrid emptyStateCta={...} emptyStateHeadline={...} ... />` mount handles all states (loading, populated, empty).

### B6: MyWork/EmailInbox/GCFiles migrated to slot pattern; EmailInbox no-connections becomes page-level guard

**Core:**
- **ID:** consumer-wrappers-migrated
- **Trigger:** Each of the three remaining wrappers mounts.
- **Expected:**
  - `MyWorkPage`: inline empty deleted; passes `emptyStateHeadline="You're all caught up!"` + body, no CTA. Grid renders empty-state for empty queue.
  - `EmailInboxPage`: when `connections.length === 0`, early return with the existing local `EmptyState` component (variant `no-connections`) BEFORE VibeGrid mounts. Otherwise mount VibeGrid; pass Sync CTA when `total === 0`. The local `EmptyState` component's `no-threads` and `no-results` branches are deleted (component's `type` union narrows to `'no-connections'` only).
  - `GCFileBrowser`: passes the existing Upload action into `emptyStateCta`. If upload supports multiple creation types, slot composes them analogously to `CreationModeButton`.
- **Verify:** VP1-VP4 below cover all three wrappers.

**Source:**
- `apps/web/src/features/my-work/components/MyWorkPage.tsx:271-276` (delete)
- `apps/web/src/features/email-inbox/components/EmailInboxPage.tsx:263-267` (restructure + early return) and `apps/web/src/features/email-inbox/components/EmptyState.tsx` (narrow union)
- `apps/web/src/features/gc-files/components/GCFileBrowser.tsx` (add `emptyStateCta` prop)

### B7: Shimmer CSS harmonized — single keyframe across TableSkeleton + sparse cells

**Core:**
- **ID:** shimmer-css-harmonized
- **Trigger:** Either skeleton path (`TableSkeleton` overlay or `SparseSkeletonCellRenderer` per-cell) renders.
- **Expected:** Both consume the same `@keyframes vibegrid-skeleton-pulse` (1.5s ease-in-out infinite; opacity 0.6 → 1.0 → 0.6; `prefers-reduced-motion` disables). Visually identical timing and color. No code-path merge — `TableSkeleton` remains a React component; sparse cells remain an imperative cell renderer.
- **Verify:** Grep + manual visual inspection per p5 test_cases.

**Source:**
- Rename keyframe in the vibegrid stylesheet that owns `sparse-skeleton-pulse` (`apps/web/src/systems/vibegrid/vibegridx-cells.css:757-767` per research).
- Update `apps/web/src/systems/vibegrid/slots/renderers/sparse-skeleton.ts` class reference.
- Update `apps/web/src/systems/vibegrid/components/TableSkeleton.tsx` shimmer class (replace Tailwind `animate-pulse`).

## Non-Goals

- **Visual redesign of the skeleton or empty-state.** Copy and layout match existing patterns; this is a structural consolidation, not a design refresh.
- **Empty-state illustrations or branded copy.** Out of scope per the issue.
- **Other VibeGrid render-system changes.** Phase machine, observer manager, post-paint scheduling are owned by GH#2925.
- **Code merge of the cell-renderer sparse-skeleton path into a React component.** Visual harmonization only; the renderer keeps its imperative DOM.
- **Per-variant `cta` rendering for `search`/`filter`.** Only the `empty` variant exposes the slot. Search and filter empties stay read-only with built-in copy.
- **Echoing the search term back into copy** (e.g., `No results for "{term}"`). Avoided to sidestep sanitization/layout/RTL concerns.
- **Generalizing `emptyStateHeadline`/`emptyStateBody` overrides to the `search` and `filter` variants.** Built-in copy only for those variants in this spec.
- **A unified pre-data-source empty surface.** EmailInbox `no-connections` stays page-level. If future features need this pattern, it's a separate spec.
- **Performance tuning for the EntityListView skeleton-flash.** The brief skeleton (<500ms) before `VibeGridEmptyState` paints in zero-row entities is accepted as a known trade-off.

## Implementation Phases

Single PR; five internal phases (see frontmatter for full task lists):

1. **p1** — Extend `VibeGridEmptyState` (additive: variants, ARIA, slot, `<VibeGrid>` props). No consumer changes; no visible behavior change.
2. **p2** — Replace inline #4. Cuts over search/filter empties to the new component. Deletes ~35 lines from `VibeGrid.tsx`.
3. **p3** — Migrate EntityListView. Deletes short-circuit + dead code (`useEntityCountFetch`, `EntityEmptyState`) gated on grep.
4. **p4** — Migrate MyWorkPage, EmailInboxPage (with page-level guard for `no-connections`), GCFileBrowser.
5. **p5** — Harmonize shimmer CSS.

## Verification Plan

Run each step literally on the preview slot for this worktree (`pr-N.dev.baseplane.ai`, where N matches the worktree number — set in `.env.local`). Auth via `pnpm ab auth login preview-<role>`. All `[data-testid]` selectors must be present on the consolidated empty-state component (B1, B2).

### VP1: EntityListView empty entity → `vibegrid-empty-state[data-empty-state-variant=empty]` with CTA

```bash
pnpm ab auth login preview-deb-admin
pnpm ab open $TARGET_URL/entities/<entity-type-with-zero-records>
# Replace <entity-type-with-zero-records> with a DEB-org entity that genuinely has 0 records.
# If none exists, create a new entity type via the schema UI first.
pnpm ab wait "[data-testid='vibegrid-empty-state']" --timeout 10
pnpm ab eval "document.querySelector('[data-testid=vibegrid-empty-state]').getAttribute('data-empty-state-variant')"
# Expected: "empty"
pnpm ab eval "Boolean(document.querySelector('[data-testid=vibegrid-empty-state] button'))"
# Expected: true   (the CreationModeButton CTA)
```

Expected visible UI: section with headline `No {entityName} records yet`, body `Get started by creating your first record.`, and a `CreationModeButton` CTA. Click the form button → `CreateRecordDialog` opens (verify via DOM presence of a modal).

### VP2: Filter-to-zero on populated grid → `data-empty-state-variant=filter`

The `__vibegrid_debug` surface is gated on `?debug=vibegrid` (see `VibeGrid.tsx:290-300`). It exposes stores as top-level keys (NOT under `.stores`): `__vibegrid_debug.visualStateStore`, `__vibegrid_debug.tableCoreStore`, etc.

```bash
pnpm ab auth login preview-deb-admin
pnpm ab open "$TARGET_URL/entities/<populated-entity-type>?debug=vibegrid"
pnpm ab wait "[data-testid='vibegridx-cell']" --timeout 10
pnpm ab eval "window.__vibegrid_debug?.visualStateStore?.applyFilterGroup({rules:[{field:'name',op:'eq',value:'__nonexistent_value_xyz__'}],combinator:'and'})"
pnpm ab wait "[data-empty-state-variant='filter']" --timeout 5
# Expected: element present, no CTA rendered (cta slot ignored on filter variant)
pnpm ab eval "Boolean(document.querySelector('[data-empty-state-variant=filter] button'))"
# Expected: false
```

UI-driven fallback (if `__vibegrid_debug` is unavailable for the entity): open the filter builder via the toolbar, add a single rule (any field equals a known-missing value), apply. Then `pnpm ab wait "[data-empty-state-variant='filter']"`.

### VP3: Search-to-zero on populated grid → `data-empty-state-variant=search`

```bash
pnpm ab auth login preview-deb-admin
pnpm ab open "$TARGET_URL/entities/<populated-entity-type>?debug=vibegrid"
pnpm ab wait "[data-testid='vibegridx-cell']" --timeout 10
pnpm ab eval "window.__vibegrid_debug?.visualStateStore?.setGlobalSearchText('__nonexistent_term_xyz__')"
pnpm ab wait "[data-empty-state-variant='search']" --timeout 5
# Expected: element present, no CTA rendered
```

UI-driven fallback: focus the grid's search input (look for `data-testid="grid-search"` or similar in toolbar), type `__nonexistent_term_xyz__`, wait on the variant.

### VP4: MyWorkPage empty → headline override

```bash
pnpm ab auth login preview-ceo
pnpm ab open $TARGET_URL/my-work
# Pre-condition: account with no items in queue (clear queue via admin if needed)
pnpm ab wait "[data-testid='vibegrid-empty-state']" --timeout 10
pnpm ab eval "document.querySelector('[data-testid=vibegrid-empty-state] output')?.textContent"
# Expected: "You're all caught up!"
pnpm ab eval "Boolean(document.querySelector('[data-testid=vibegrid-empty-state] button'))"
# Expected: false   (no CTA for MyWork)
```

### VP5: EmailInboxPage no-connections → page-level guard (VibeGrid does NOT mount)

```bash
pnpm ab auth login preview-deb-admin
pnpm ab open $TARGET_URL/email-inbox
# Pre-condition: account with zero email connections.
pnpm ab wait "[data-testid='email-no-connections']" --timeout 10
# (testid added to the local EmptyState's no-connections root in p4)
pnpm ab eval "Boolean(document.querySelector('[data-testid=vibegridx-cell]') || document.querySelector('[data-testid=vibegrid-empty-state]'))"
# Expected: false   (VibeGrid did not mount)
```

### VP6: EmailInboxPage with connections + 0 emails → Sync CTA

```bash
pnpm ab auth login preview-deb-admin
pnpm ab open $TARGET_URL/email-inbox
# Pre-condition: account WITH connections but inbox empty (or filter to a never-matching label).
pnpm ab wait "[data-empty-state-variant='empty']" --timeout 10
pnpm ab eval "document.querySelector('[data-empty-state-variant=empty] output')?.textContent"
# Expected: "No emails yet"
pnpm ab eval "document.querySelector('[data-empty-state-variant=empty] button')?.textContent?.includes('Sync')"
# Expected: true
```

### VP7: GCFileBrowser empty folder → Upload CTA

`GCFileBrowser` is exported from `apps/web/src/features/gc-files/components/index.ts` but a grep of `apps/web/src` finds no router-side import — the component appears to be mounted via a parent page or a dialog/portal that wasn't surfaced in the spec-writing greps. **Resolve the actual mount path during p4** (search project sub-routes or dialog launchers), then substitute below.

```bash
pnpm ab auth login preview-deb-admin
pnpm ab open "$TARGET_URL/<gc-files-mount-path-resolved-in-p4>"
pnpm ab wait "[data-empty-state-variant='empty']" --timeout 10
pnpm ab eval "document.querySelector('[data-empty-state-variant=empty] button')?.textContent?.includes('Upload')"
# Expected: true
```

If GCFileBrowser is not reachable in any preview environment, the consumer migration (p4 task 5) is still valid — confirmed via unit test that the slot wiring lands; mark VP7 as N/A in the verify evidence with a one-line justification.

### VP8 (shimmer harmonization): visual parity

```bash
# Skeleton overlay (cold load)
pnpm ab open $TARGET_URL/entities/<large-entity-type>?debug=vibegrid
pnpm ab screenshot /tmp/2934-skeleton-overlay.png
# Sparse-row shimmer (fast scroll past loaded window)
pnpm ab grid scroll-rows 5000
pnpm ab screenshot /tmp/2934-sparse-shimmer.png
# Manual side-by-side comparison: identical pulse timing and bar color.
```

## Implementation Hints

### Key imports

```tsx
// New VibeGridEmptyState shape — used internally by VibeGrid and exported for tests
import { VibeGridEmptyState } from '@/systems/vibegrid/components/VibeGridEmptyState'

// Consumer composition: existing entity creation button (do not reimplement)
import { CreationModeButton } from '@/features/entities/components/CreationModeButton'

// MobX observer wrapper for any new components that read store state
import { observer } from 'mobx-react-lite'
import { useVibeGridStores } from '@/systems/vibegrid/stores/context'
```

### Code patterns

**Pattern 1 — Variant resolution at mount site (`VibeGrid.tsx` empty-state render block)**
```tsx
const showEmptyState =
  initStore.phase === 'painted' &&
  initStore.entityDataKnownComplete &&
  tableCoreStore.processedRows.length === 0 &&
  !tableCoreStore.isIncrementalProcessing &&
  effectiveViewMode !== 'kanban'

const searchActive = Boolean(visualStateStore.globalSearchText)
const filterActive = (visualStateStore.filterGroup?.rules?.length ?? 0) > 0
const emptyVariant: 'empty' | 'search' | 'filter' =
  searchActive ? 'search' : filterActive ? 'filter' : 'empty'

{showEmptyState && (
  <VibeGridEmptyState
    variant={emptyVariant}
    entityDisplayName={entityDisplayName}
    headline={emptyVariant === 'empty' ? emptyStateHeadline : undefined}
    body={emptyVariant === 'empty' ? emptyStateBody : undefined}
    cta={emptyVariant === 'empty' ? emptyStateCta : undefined}
  />
)}
```

**Pattern 2 — Component skeleton with discriminated variants and ARIA shape**
```tsx
type Variant = 'empty' | 'search' | 'filter'

interface VibeGridEmptyStateProps {
  variant: Variant
  entityDisplayName?: string
  headline?: string
  body?: string
  cta?: React.ReactNode
}

export function VibeGridEmptyState(props: VibeGridEmptyStateProps) {
  const headingId = useId()
  const noun = props.entityDisplayName ?? 'records'

  const { headline, body } = (() => {
    if (props.variant === 'search') {
      return { headline: 'No results found', body: 'Try different search terms or clear filters' }
    }
    if (props.variant === 'filter') {
      return { headline: 'No results match these filters', body: 'Try adjusting or clearing filters' }
    }
    return {
      headline: props.headline ?? `No ${noun} yet`,
      body: props.body,
    }
  })()

  const showCta = props.variant === 'empty' && Boolean(props.cta)

  return (
    <section
      data-testid="vibegrid-empty-state"
      data-empty-state-variant={props.variant}
      aria-labelledby={headingId}
      style={{ /* keep prior positioning; flip pointer-events to 'auto' */ }}
    >
      <output id={headingId} role="status">{headline}</output>
      {body && <p>{body}</p>}
      {showCta && <div>{props.cta}</div>}
    </section>
  )
}
```

**Pattern 3 — Consumer slot composition (EntityListView, post-migration)**
```tsx
<VibeGrid
  /* ...existing props... */
  emptyStateCta={
    <CreationModeButton
      modes={schema.creationModes}
      onCreateForm={() => setCreateDialogOpen(true)}
      onCreateUpload={() => uploadDialogRef.current?.open()}
    />
  }
  emptyStateHeadline={`No ${entityName} records yet`}
  emptyStateBody="Get started by creating your first record."
/>
```

**Pattern 4 — EmailInboxPage page-level guard (preserves existing loading + error gates)**
```tsx
// At the same render position as the existing isLoading/error/empty conditional chain
// (currently at EmailInboxPage.tsx:253-267). The loading + error gates are unchanged;
// only the empty branch restructures.
{(isLoading || connectionsLoading) ? (
  <LoadingState />
) : error ? (
  <Alert variant="destructive">...</Alert>
) : connections.length === 0 ? (
  <EmptyState type="no-connections" onConnect={handleConnect} data-testid="email-no-connections" />
) : (
  <VibeGrid
    // Page-level filters live in `store.filters.*` (not visualStateStore.filterGroup),
    // so VibeGrid sees 0 rows with no filter set when filtered-to-zero. Override copy
    // explicitly to preserve the 'No matching emails' hint.
    emptyStateCta={total === 0 ? <Button onClick={handleSync}><RefreshCw/> Sync Now</Button> : undefined}
    emptyStateHeadline={total === 0 ? 'No emails yet' : 'No matching emails'}
    emptyStateBody={
      total === 0
        ? 'Your connected inbox is empty. New emails will appear here automatically.'
        : 'No emails match your current filters. Try adjusting your filter or sort settings.'
    }
    /* ...existing props... */
  />
)}
```

**Pattern 5 — Shared shimmer class (CSS)**
```css
@keyframes vibegrid-skeleton-pulse {
  0%, 100% { opacity: 0.6; }
  50%      { opacity: 1.0; }
}

.vibegrid-skeleton-bar {
  background: color-mix(in oklch, var(--foreground) 12%, transparent);
  border-radius: 4px;
  animation: vibegrid-skeleton-pulse 1.5s ease-in-out infinite;
  will-change: opacity, background-color;
}

@media (prefers-reduced-motion: reduce) {
  .vibegrid-skeleton-bar { animation: none; }
}
```

### Gotchas

- **`<output>` inside `<section>`:** Biome's `useAriaPropsSupportedByRole` was the reason GH#2925 chose `<output>` as root. With `<output>` now nested inside `<section>`, both must be checked — `<section>` accepts `aria-labelledby` by default; `<output>` accepts standard ARIA. No rule conflict expected, but run `pnpm check:write` after the restructure.
- **`pointer-events: auto`:** Current root style is `pointer-events: none` because the component is an overlay. After restructure, the section MUST be `pointer-events: auto` to allow CTA clicks. Existing positioning (`position: absolute; top: 48px; left: 0; right: 0; z-index: 1`) stays.
- **Kanban exclusion:** Current `showEmptyState` predicate excludes `effectiveViewMode === 'kanban'` (line 1391 area). Preserve this in the new variant-aware mount — kanban has its own empty handling.
- **`isIncrementalProcessing` guard:** The inline #4 predicate checks `!tableCoreStore.isIncrementalProcessing` to avoid flashing "empty" mid-stream. The new unified predicate MUST keep this check (otherwise the empty surface flashes during pagination).
- **`useEntityCountFetch` deletion is grep-gated.** Do not delete the file if `rg "useEntityCountFetch" apps/web` returns hits outside the EntityListView import being removed. Same for `EntityEmptyState`. If residual consumers exist, leave files in place and document in PR description.
- **EmailInboxPage `EmptyState` component is local.** Different file from `VibeGridEmptyState`. Narrowing its `type` union to `'no-connections'` only is a breaking change for that component's API — verify no other consumer (grep `from './EmptyState'` inside `apps/web/src/features/email-inbox/`).
- **`window.__vibegrid_debug` access in VPs:** This is gated on `?debug=vibegrid` URL param (per GH#2925). For VP2/VP3, navigate WITH that param OR call the store via the React tree (less reliable). Prefer `?debug=vibegrid` for repeatability.
- **TableSkeleton shimmer color may shift.** Tailwind `animate-pulse` uses opacity 0.5 → 1.0; the sparse keyframe uses 0.6 → 1.0. Adopting the sparse curve is the intent (issue says "same shimmer treatment") — verify with VP8 that the difference is acceptable; if not, tune the keyframe.
- **Skeleton flash on empty entities (EntityListView):** Removing the COUNT short-circuit means the grid mounts, runs schema/controllers, and only then paints the empty state. For an entity with 0 records this is typically <500ms but is a perceptible flicker compared to today's instant short-circuit. Accepted per interview; flag in PR description.

### Reference docs

- `.claude/rules/vibegrid.md` — overall VibeGrid architecture, store instance-scoping, hook patterns.
- `.claude/rules/vibegrid-interactions.md` — slot registry, cell renderers, view module slots (relevant for understanding the sparse-skeleton renderer's place in the slot system).
- `.claude/rules/agent-testability.md` — semantic HTML, ARIA, `data-testid` conventions (directly governs B1/B2 ARIA shape).
- `.claude/rules/chrome-devtools.md` — `pnpm ab` patterns for the VPs (especially `grid scroll-rows`, `wait --js`, `eval`).
- `docs/planning/specs/2925-vibegrid-render-system-simplification.md` — the phase machine and `entityDataKnownComplete` flag this spec consumes; p3 of that spec is the parent of the current `VibeGridEmptyState` component.
- Issue thread: https://github.com/baseplane-ai/baseplane/issues/2934 — original motivation + 5-surface table.
- GH#2925 VP5 comment: https://github.com/baseplane-ai/baseplane/issues/2925#issuecomment-4422366796 — where the unreachability of `VibeGridEmptyState` was first noted.
