---
initiative: GH#2687-vibegrid-eliminate-relationship-cell-loa
type: feature
issue_type: feature
status: approved
priority: medium
roadmap: null
owner: null
github_issue: 2687
github_milestone: null
created: 2026-04-25
updated: 2026-04-25
phases:
  - id: p1
    name: "Preload + shimmer + delete dead bridges"
    tasks:
      - "In apps/web/src/systems/vibegrid/stores/column-generation.ts inside generateColumnsFromEntity, after the .map → .filter pipeline produces allColumns (around line 497) and BEFORE the systemTimestampColumns append (line 528), iterate the produced columns and collect a Set<string> of unique values from column.relationshipConfig.targetEntityType AND column.relationshipConfig.relationshipEntity (only the latter is set on source:'relationship' injected columns; line 478-481). For each name in the Set, call getOrCreateEntityCollection(name, orgId, createEntityCollection) imported from @/shared/data/db/collections/registry. Get orgId via getActiveOrganizationId() imported from @/app/stores/global/OrganizationStore — the canonical non-React org accessor (works inside column-generation which is async/non-React). Skip preload entirely if orgId is undefined and log a debug line ('Skipped relationship preload — no active org')"
      - "In apps/web/src/systems/vibegrid/slots/renderers/badge-list-live.ts at lines 76-82 (the cache-miss + bridge-not-ready branch), replace the badge-wrapped '\\u2026' (ellipsis) placeholder construction with a single shimmer span: container.appendChild(<span class=\"vg-cell-shimmer\" data-affordance-role=\"loading\" aria-label=\"Loading\\u2026\"></span>). Keep the cache-miss + bridge-ready branch (lines 70-74) returning '\\u2014' unchanged — that is the genuine empty state. Keep the cache-hit + zero-badges branch (lines 85-89) unchanged"
      - "Delete apps/web/src/systems/vibegrid/slots/renderers/entity-reference.ts (deprecated since GH#2552, slot id never registered in slot-initialization.ts)"
      - "Delete apps/web/src/systems/vibegrid/slots/renderers/user-reference.ts (deprecated since GH#2552, slot id never registered in slot-initialization.ts)"
      - "Delete apps/web/src/systems/vibegrid/hooks/useEntityReferenceData.tsx (orphan bridge — its only consumers were the two deleted renderers via tableCoreStore.entityReferenceData; no other code reads from that map)"
      - "In apps/web/src/systems/vibegrid/VibeGrid.tsx remove the import of useEntityReferenceData (line 35), the call site (line 522: const entityRefBridges = useEntityReferenceData(tableCoreStore)), and the {entityRefBridges} render expression in the JSX"
      - "In apps/web/src/systems/vibegrid/stores/TableCoreStore.ts delete the entityReferenceData ObservableMap field (line 278), remove the methods getEntityReferenceRecord / setEntityReferenceRecord / ensureEntityReferenceRecord, AND remove the this.entityReferenceData.clear() call at line 2006 (in the reset/dispose method — exact line may shift after the field removal; grep for entityReferenceData.clear inside the file). Verify no remaining callers via: grep -rn 'entityReferenceData\\|getEntityReferenceRecord\\|setEntityReferenceRecord\\|ensureEntityReferenceRecord' apps/web/src — expect zero hits"
      - "Remove BOTH the entityReferenceCellRenderer (line 32) and userReferenceCellRenderer (line 33) exports from apps/web/src/systems/vibegrid/slots/renderers/index.ts"
      - "Add the .vg-cell-shimmer CSS rule. Investigate the right home: grep -rn 'badge-list\\|vg-badge\\|vibegridx-badge' apps/web/src/systems/vibegrid/styles/ apps/web/src/styles/ — place the rule in whichever stylesheet already styles badge-list cells. Spec: display:inline-block; width:70%; height:1em; vertical-align:middle; border-radius:4px; background:linear-gradient(90deg, rgba(0,0,0,0.04) 0%, rgba(0,0,0,0.08) 50%, rgba(0,0,0,0.04) 100%); background-size:200% 100%; animation:vg-shimmer 1.4s ease-in-out infinite. Plus @keyframes vg-shimmer { 0% { background-position:200% 0 } 100% { background-position:-200% 0 } }. Plus @media (prefers-reduced-motion: reduce) { .vg-cell-shimmer { animation:none; opacity:0.6 } }"
      - "Create follow-up GitHub issue for the renderer consolidation deferred from this spec: 'VibeGrid: consolidate badge-list + badge-list-live + reference-select cellTypes into one renderer (post-GH#2651-P4)'. Reference this spec, note that the cellType-collapse touches GroupProcessor:592, field-type-categories:75, column-defaults:64, csv-export:155, GroupConfigPanel:49, GroupConfigDropdownPure:171/316, SchemaAdapter:101, overlays/editors/index.tsx:176 — and that legacy reference-* fields lack the relationshipEntity/direction config that badge-list-live requires, so they need either field-injection or a separate renderer. Should be tackled after GH#2651 P4 ships (badge-list itself becomes dead code at that point). Track via: pnpm bgh create --type=feature --title='VibeGrid: consolidate relationship cellTypes into one renderer (post-GH#2651-P4)'"
    test_cases:
      - "DEB admin loads /entities/Project on preview: every visible badge-list-live relationship cell shows a shimmer block on first paint, NOT '\\u2026'"
      - "Within ~500ms (singleton fetch round-trip) shimmer cells resolve to badges with no layout shift"
      - "Detail view (data.get path) for a Project unaffected: linked child entities still render without shimmer"
      - "prefers-reduced-motion: reduce → cells show static 0.6-opacity block instead of animated gradient"
      - "Network tab shows relationship target collection fetches firing concurrently with the main entity query, NOT after"
      - "pnpm typecheck and pnpm lint pass cleanly post-deletion (no dangling imports of the deleted renderer/hook/map)"
      - "grep -rn 'entityReferenceData\\|useEntityReferenceData\\|entityReferenceCellRenderer\\|userReferenceCellRenderer\\|getEntityReferenceRecord\\|setEntityReferenceRecord' apps/web/src returns zero hits"
      - "Existing reference-select / reference-multi cellType behavior unchanged — no renderer registered for these cellTypes today, so cells continue to fall through to __text_fallback__ (consolidation deferred to follow-up issue). Editors, grouping, filtering, CSV export, column-width defaults all unaffected"
  - id: p2
    name: "Tests + verification"
    tasks:
      - "Add Vitest unit test apps/web/src/systems/vibegrid/stores/__tests__/column-generation.preload.test.ts: build columns from a fixture schema with three source:'relationship' fields — two pointing at targetEntityType 'User' (sharing relationshipEntity 'Rel_User_Project_owns'), one pointing at targetEntityType 'Document' (relationshipEntity 'Rel_Document_Project_attached'). Mock getActiveOrganizationId via vi.mock('@/app/stores/global/OrganizationStore', () => ({ getActiveOrganizationId: vi.fn(() => 'org-test') })). Spy on getOrCreateEntityCollection. Assert it is called exactly with the unique union: {'User','Document','Rel_User_Project_owns','Rel_Document_Project_attached'} (4 unique names). Assert call count === 4 — NOT 6 (3 columns × 2 names each)"
      - "Add Vitest unit test apps/web/src/systems/vibegrid/slots/renderers/__tests__/badge-list-live.shimmer.test.ts: render badgeListLiveCellRenderer with a context whose tableCoreStore.getRelationshipBadges returns undefined and isRelationshipBadgesReady returns false; assert the returned container's outerHTML contains 'class=\"vg-cell-shimmer\"' and 'aria-label=\"Loading\\u2026\"'. Then re-render with isRelationshipBadgesReady=true and getRelationshipBadges returning ['Alice','Bob']; assert no shimmer span and badge text 'Alice' and 'Bob' present. Then re-render with isRelationshipBadgesReady=true and getRelationshipBadges returning undefined; assert empty-dash '\\u2014' (genuine empty)"
      - "Add Vitest unit test asserting preload is a no-op when getActiveOrganizationId() returns undefined: vi.mock returns undefined, spy on getOrCreateEntityCollection, run column generation over a schema with relationship columns, assert call count === 0 and a debug log was emitted with message containing 'Skipped relationship preload'"
      - "Add Playwright smoke apps/web/e2e/specs/vibegrid-relationship-loading.spec.ts: login as preview-deb-admin, open /entities/Project, wait for [role=grid] to be visible. Within 5s assert page.locator('.vg-cell-shimmer').count() === 0 (everything resolved). Also assert that no [role=gridcell] inside [role=grid] has trimmed textContent === '\\u2026' (run via page.evaluate). Snapshot the grid for visual regression"
      - "Push to staging, run pnpm at deploy watch --until-done, then re-run the Playwright smoke against staging-deb-admin to confirm production-shape data behaves the same"
    test_cases:
      - "All three Vitest specs pass locally and in CI"
      - "Playwright smoke passes on preview and staging"
      - "Visual regression: grid first-paint snapshot diff shows shimmer blocks where relationship columns appeared as '\\u2026' previously"
---

# VibeGrid: eliminate relationship cell loading flash via target-collection preload

> GitHub Issue: [#2687](https://github.com/baseplane-ai/issues/issues/2687)

## Overview

Today, when a VibeGrid loads, every relationship cell flashes `…` for the moment between row arrival and target-entity-collection resolution. The flash is loud (50+ cells on a wide DEB Project grid) and looks broken — the main entity collection loads instantly from TanStack DB, so users perceive the grid as "almost done, why is half of it still spinning?"

The root cause is a timing gap, not a missing fetch. The bridges that join target collections (`useBadgeListEnrichment`) mount at the same React level as `useVibeGridData` — but they read `tableCoreStore.columns` to discover *which* `useEntityCollection` calls to make. Columns populate via MobX after schema load, so bridges only fire their `useEntityCollection` calls on a re-render *after* the main entity is already on screen. That gap is the flash.

The fix is upstream: at the moment we generate columns (which is the moment we first know every relationship target type), call `getOrCreateEntityCollection()` directly — same singleton primitive `useVibeGridData` uses for the main entity, no React hook indirection. Target collections then start loading in parallel with the main entity, hit cache before the row paints, and the flash disappears. For the rare cold-cache case where a target genuinely has not loaded by paint time, replace the `…` text with a faint shimmer block sized to the column. Visually quiet, accessibility-tree visible, no layout shift.

While we're in these files, one cleanup win:

- **Delete the orphan `useEntityReferenceData` bridge.** It still mounts in `VibeGrid.tsx` and writes to `tableCoreStore.entityReferenceData` — but the only consumers of that map were `entity-reference.ts` and `user-reference.ts`, which GH#2552 already removed from the slot registry. Pure dead code path: bridge fires, writes to a MobX map, nothing reads it. Removing it (plus the two orphan renderer files and the MobX map) takes ~80 lines off the surface area.

**Deferred to a follow-up issue:** Collapsing the legacy `reference-select` / `reference-multi` cellTypes into `badge-list-live` looked attractive at first pass — both legacy strings have no renderer registered (silent fall-through to `__text_fallback__`), and one relationship renderer would be cleaner than two. But `badge-list-live` hard-requires `relationshipConfig.relationshipEntity` and `direction`, which the legacy reference-* fields don't carry, so the consolidation needs either field-injection or a separate renderer. It also touches 8+ downstream consumers (group processor, field-type categories, column defaults, CSV export, filter panel, schema adapter, edit overlays) that key off the cellType string. That work belongs to its own spec — best tackled after GH#2651 P4 ships and `badge-list` itself becomes dead code.

Research: [docs/planning/research/2026-04-25-vibegrid-relationship-loading-ux.md](../research/2026-04-25-vibegrid-relationship-loading-ux.md)

Related: GH#2651 (client-side relationship rendering, in progress) lays the data layer this spec depends on. P1.3 of that effort already established `badge-list-live` as the renderer for `source: 'relationship'` fields; this spec adds the missing preload step and replaces the cold-cache placeholder.

## Feature Behaviors

### B1: Relationship target collections preload at column generation

**Core:**
- **ID:** preload-target-collections-at-column-gen
- **Trigger:** `generateColumnsFromEntity` (in `column-generation.ts`) finishes building the column set for a schema that contains one or more columns with `relationshipConfig.targetEntityType` populated
- **Expected:** For each unique value across `column.relationshipConfig.targetEntityType` ∪ `column.relationshipConfig.relationshipEntity` (only the latter is set on `source: 'relationship'`-injected columns), `getOrCreateEntityCollection(name, orgId, createEntityCollection)` is called exactly once. Calls fire as side effects of column generation, before the function returns. Org id sourced via `getActiveOrganizationId()`. If org id is unresolved, preload is a no-op (logged at debug).
- **Verify:** Vitest spy on `getOrCreateEntityCollection`; render column generation over a fixture schema with three relationship columns sharing one `relationshipEntity` and pointing at two distinct target types; assert call count === 4 (2 target types + 2 distinct rel-entities, deduped via Set). Plus E2E: open DEB `/entities/Project`, observe network tab — relationship target collection fetches fire concurrently with the main `Project` query, not after.
- **Source:** `apps/web/src/systems/vibegrid/stores/column-generation.ts` (around line 497, after column array is finalized), `apps/web/src/shared/data/db/collections/registry.ts` (`getOrCreateEntityCollection`), `apps/web/src/app/stores/global/OrganizationStore.ts:39` (`getActiveOrganizationId`)

#### Data Layer

- Calls the *registry* function `getOrCreateEntityCollection`, NOT the React hook `useEntityCollection` — column-generation is async/non-React
- Singleton semantics in `registry.ts` already protect against duplicate registration; explicit dedupe in column-gen via `Set<string>` avoids redundant work and clarifies intent
- `orgId` sourced via `getActiveOrganizationId()` — the canonical non-React accessor documented at `OrganizationStore.ts:33`. Same accessor used by other non-React contexts (oRPC client, utilities)
- Walks `column.relationshipConfig` (the actual struct attached at line 469-483), NOT `column.fieldDef` — the latter is not preserved on the produced Column object

### B2: badge-list-live renders shimmer instead of '…' on cold cache

**Core:**
- **ID:** badge-list-live-shimmer
- **Trigger:** `badgeListLiveCellRenderer` runs and `isRelationshipBadgesReady(rowId, columnId)` returns `false`
- **Expected:** Cell DOM contains a single `<span class="vg-cell-shimmer" data-affordance-role="loading" aria-label="Loading…"></span>` instead of the previous `…` text. When `isRelationshipBadgesReady` flips to `true`, the shimmer is replaced by the resolved badges. Empty state (no edges, ready true) still renders `—` unchanged.
- **Verify:** Vitest unit test renders the cell in both states and asserts DOM shape. Visual: DEB `/entities/Project` first paint shows shimmer blocks instead of ellipsis text; resolves to badges within ~500ms.
- **Source:** `apps/web/src/systems/vibegrid/slots/renderers/badge-list-live.ts:65-82`

#### UI Layer

- Loading distinguished from empty by `isRelationshipBadgesReady` — same boolean already used today
- Shimmer node is keyboard- and screen-reader-discoverable via `aria-label="Loading…"` (NOT removed from accessibility tree — see `vibegrid.md` rules on `display: none` anti-pattern)
- Width 70% of column content width, height 1em — single rounded rectangle per cell, not multiple chips
- Honors `prefers-reduced-motion: reduce` → static 0.6-opacity block, no animation

### B3: Delete dead renderers, hook, and MobX map

**Core:**
- **ID:** delete-dead-relationship-bridges
- **Trigger:** This PR
- **Expected:** Deleted: `apps/web/src/systems/vibegrid/slots/renderers/entity-reference.ts`, `user-reference.ts`, `apps/web/src/systems/vibegrid/hooks/useEntityReferenceData.tsx`. Removed: import + call site in `VibeGrid.tsx` (lines 35 + 522), exports in `slots/renderers/index.ts` (lines 32 + 33), `entityReferenceData` ObservableMap field + `getEntityReferenceRecord` / `setEntityReferenceRecord` / `ensureEntityReferenceRecord` methods on `TableCoreStore.ts`. No callers of any deleted symbol remain.
- **Verify:** `grep -rn "entity-reference\\|user-reference\\|useEntityReferenceData\\|entityReferenceData\\|getEntityReferenceRecord\\|setEntityReferenceRecord\\|ensureEntityReferenceRecord" apps/web/src` returns zero hits. `pnpm typecheck` and `pnpm lint` pass cleanly.
- **Source:** `apps/web/src/systems/vibegrid/slots/renderers/entity-reference.ts`, `user-reference.ts`, `index.ts:32-33`, `apps/web/src/systems/vibegrid/hooks/useEntityReferenceData.tsx`, `apps/web/src/systems/vibegrid/VibeGrid.tsx:35,522`, `apps/web/src/systems/vibegrid/stores/TableCoreStore.ts:278` (and the related methods around the entityReferenceData field)

#### Cleanup Layer

- All four artifacts (two renderer files, one hook file, one MobX map + accessor methods) form a single dead bridge: their only consumers were the two slot-registry entries removed in GH#2552
- Removal in this PR (not deferred) — the bridge has no live consumers, keeping it costs every reader a "what is this for?" detour

### B4: No '…' or shimmer-stuck cells appear on grid first paint

**Core:**
- **ID:** no-loading-text-on-first-paint
- **Trigger:** A user opens any VibeGrid page (verified on DEB `/entities/Project`)
- **Expected:** Within 5s of the grid `[role=grid]` element appearing, `document.querySelectorAll('.vg-cell-shimmer').length === 0` (everything resolved) AND no `[role=gridcell]` contains literal `…` text (scoped to grid cells to avoid false positives from CSS truncation ellipses elsewhere on the page).
- **Verify:** Playwright smoke `apps/web/e2e/specs/vibegrid-relationship-loading.spec.ts` runs on preview and staging.
- **Source:** end-to-end behavior — verifies B1+B2+B3 compose correctly

#### UI Layer

- This is the user-visible acceptance gate for the whole feature
- Visual regression snapshot of the grid on first paint is recorded so future regressions are caught

## Non-Goals

- **Skeleton row ghosts for the entire grid.** Out of scope — the main entity loads instantly from TanStack DB, only relationship cells need a placeholder.
- **Grid-level loading chip in the header.** Decided against per-cell shimmer-only UX — adding a header chip on top of cell shimmer is double-noise.
- **Prefetching across grid views.** Each grid mount preloads its own targets via `getOrCreateEntityCollection` (singleton, so cross-view navigation already gets cache hits for free); we do not add a separate cross-grid prefetcher.
- **Debounce window before showing shimmer.** Decided to render shimmer immediately on first paint — a debounce hides the shimmer in the common cold-cache case where it's most useful.
- **Refactor of `useBadgeListEnrichment` bridge.** Continues to work as-is; preload at column-gen front-runs it but does not replace it. The bridge still owns MobX-map population once collections resolve.
- **Feature flag for the renderer changes.** Direct cutover. Rollback is `git revert`.
- **Animations or fade transitions for shimmer → resolved.** Native swap. The shimmer-to-content transition is a CSS replacement, not an animated crossfade.
- **Fixing the underlying server projection performance** — that is GH#2651's scope.
- **Collapsing legacy `reference-select` / `reference-multi` cellTypes into `badge-list-live`.** Deferred to a follow-up issue (created in Phase 1). Reasons: (a) `badge-list-live` requires `relationshipConfig.relationshipEntity` and `direction` which legacy reference-* fields don't carry; (b) the cellType string is keyed off in 8+ downstream consumers (group processor, filter panel, edit overlays, CSV export, etc.); (c) the cleaner consolidation point is after GH#2651 P4 ships, when `badge-list` itself becomes dead code and a single relationship renderer can absorb all three. This spec leaves the legacy cellTypes alone — they continue to fall through to `__text_fallback__` as today (no regression, no improvement).

## Implementation Phases

See frontmatter `phases:` for the authoritative task and test-case breakdown. Summary:

- **Phase 1** — Preload at `column-generation` (B1), shimmer in `badge-list-live` (B2), delete dead bridges (B3). Plus filing the follow-up issue for the deferred cellType consolidation. Single PR, direct cutover.
- **Phase 2** — Vitest unit tests (preload, shimmer renderer, no-org no-op), plus Playwright E2E smoke (B4).

## Verification Plan

Executable by a fresh agent with no context.

### After Phase 1

```bash
# 1. Build + typecheck pass with deprecated files deleted
pnpm typecheck
pnpm lint
# Expected: zero errors

# 2. No callers of any deleted symbol remain
grep -rn "entity-reference\|user-reference\|useEntityReferenceData\|entityReferenceData\|getEntityReferenceRecord\|setEntityReferenceRecord\|ensureEntityReferenceRecord" apps/web/src
# Expected: zero hits

# 3. Deploy to preview
git push origin <branch>
pnpm at deploy watch --until-done

# 4. Visual smoke on preview
agent-browser auth login preview-deb-admin
agent-browser open $TARGET_URL/entities/Project

# 5. Confirm no '…' text inside grid cells
agent-browser eval "Array.from(document.querySelectorAll('[role=grid] [role=gridcell]')).filter(c => c.textContent.trim() === '…').length"
# Expected: 0

# 6. Confirm shimmer nodes appear momentarily on cold load and clear quickly
agent-browser eval "document.querySelectorAll('.vg-cell-shimmer').length"
# Expected: > 0 immediately after navigation, → 0 within ~500ms

# 7. Detail view unaffected
agent-browser click "[role=row][aria-rowindex='2'] [data-affordance='navigate']"
agent-browser snapshot -i -s "[data-testid='entity-detail']"
# Expected: linked child tabs populate without shimmer (data.get path unchanged)

# 8. Follow-up issue exists for the deferred cellType consolidation
pnpm bgh list --search 'consolidate relationship cellTypes'
# Expected: one open issue referencing this spec
```

### After Phase 2

```bash
# 1. Unit tests pass
pnpm --filter @baseplane/web test -- column-generation.preload badge-list-live.shimmer
# Expected: all green

# 2. Playwright smoke passes on preview
pnpm --filter @baseplane/web exec playwright test specs/vibegrid-relationship-loading.spec.ts --project=preview
# Expected: pass

# 3. Playwright smoke on staging after merge
git push origin staging
pnpm at deploy watch --until-done
pnpm --filter @baseplane/web exec playwright test specs/vibegrid-relationship-loading.spec.ts --project=staging
# Expected: pass

# 4. Visual regression baseline captured
ls apps/web/e2e/snapshots/vibegrid-relationship-loading/
# Expected: baseline snapshot recorded; future runs diff against it
```

## Implementation Hints

### Key Imports

```ts
// Phase 1 — column-generation preload
import {
  getOrCreateEntityCollection,
  createEntityCollection,
} from '@/shared/data/db/collections/registry'
import { getActiveOrganizationId } from '@/app/stores/global/OrganizationStore'

// Phase 2 — tests
import { describe, it, expect, vi } from 'vitest'
```

### Code Patterns

**Preload at column-generation (Phase 1, B1):**

```ts
// apps/web/src/systems/vibegrid/stores/column-generation.ts
// In generateColumnsFromEntity, AFTER allColumns is finalized (around line 497) and BEFORE finalColumns return:

const orgId = getActiveOrganizationId()
if (orgId) {
  const toPreload = new Set<string>()
  for (const col of allColumns) {
    const rc = (col as any).relationshipConfig
    if (rc?.targetEntityType) toPreload.add(rc.targetEntityType)
    if (rc?.relationshipEntity) toPreload.add(rc.relationshipEntity)
  }
  for (const name of toPreload) {
    getOrCreateEntityCollection(name, orgId, createEntityCollection)
  }
  fileLog.debug('🚀 Preloaded relationship collections', {
    entityType,
    preloadCount: toPreload.size,
    targets: Array.from(toPreload),
  })
} else {
  fileLog.debug('⏭️ Skipped relationship preload — no active org', { entityType })
}
```

**Shimmer in badge-list-live (Phase 1, B2):**

```ts
// apps/web/src/systems/vibegrid/slots/renderers/badge-list-live.ts
const SHIMMER_HTML = '<span class="vg-cell-shimmer" data-affordance-role="loading" aria-label="Loading…"></span>'

// Replace the '…' return at line ~76 with SHIMMER_HTML
if (!tableCoreStore.isRelationshipBadgesReady(rowId, columnId)) {
  return SHIMMER_HTML   // was: '…'
}
```

**Shared CSS rule (Phase 1, B2):**

```css
/* Add to whichever stylesheet already styles badge-list cells —
   confirm via: grep -rn 'badge-list\|vg-badge\|vibegridx-badge' apps/web/src/systems/vibegrid/styles/ */
.vg-cell-shimmer {
  display: inline-block;
  width: 70%;
  height: 1em;
  vertical-align: middle;
  border-radius: 4px;
  background: linear-gradient(
    90deg,
    rgba(0, 0, 0, 0.04) 0%,
    rgba(0, 0, 0, 0.08) 50%,
    rgba(0, 0, 0, 0.04) 100%
  );
  background-size: 200% 100%;
  animation: vg-shimmer 1.4s ease-in-out infinite;
}

@keyframes vg-shimmer {
  0%   { background-position:  200% 0 }
  100% { background-position: -200% 0 }
}

@media (prefers-reduced-motion: reduce) {
  .vg-cell-shimmer {
    animation: none;
    opacity: 0.6;
  }
}
```

**Delete the orphan bridge (Phase 1, B3):**

```bash
# Files to delete (whole-file removals):
rm apps/web/src/systems/vibegrid/slots/renderers/entity-reference.ts
rm apps/web/src/systems/vibegrid/slots/renderers/user-reference.ts
rm apps/web/src/systems/vibegrid/hooks/useEntityReferenceData.tsx
```

```ts
// apps/web/src/systems/vibegrid/VibeGrid.tsx
// Remove line 35: import { useEntityReferenceData } from './hooks/useEntityReferenceData'
// Remove line 522: const entityRefBridges = useEntityReferenceData(tableCoreStore)
// Remove the {entityRefBridges} render usage in the JSX

// apps/web/src/systems/vibegrid/slots/renderers/index.ts
// Remove lines 32-33:
//   export { entityReferenceCellRenderer } from './entity-reference'
//   export { userReferenceCellRenderer } from './user-reference'

// apps/web/src/systems/vibegrid/stores/TableCoreStore.ts
// Remove the entityReferenceData ObservableMap field at line 278
// Remove getEntityReferenceRecord, setEntityReferenceRecord, ensureEntityReferenceRecord methods
```

### Gotchas

- **Use the registry function, NOT the React hook.** Column-generation is async/non-React. `useEntityCollection` is the hook (calls `getOrCreateEntityCollection` via `useMemo`). Calling the registry function directly is the same primitive without the hook indirection.
- **`getActiveOrganizationId()` is the canonical non-React accessor.** Documented at `OrganizationStore.ts:33`. Falls back to localStorage during early init. Do NOT add new ad-hoc org context here.
- **Walk `column.relationshipConfig`, not `column.fieldDef`.** `fieldDef` is the input to column generation — it is NOT preserved on the produced Column object. The relationship metadata is attached to `column.relationshipConfig` at line 469-483 of `column-generation.ts`. `relationshipEntity` and `direction` are only set on this struct when the source field had `source: 'relationship'`.
- **Dedupe before calling.** Many schemas have multiple columns pointing to the same target type. The registry is idempotent but explicit `Set<string>` dedupe keeps logs clean and makes intent obvious.
- **`isRelationshipBadgesReady` semantics intact.** B2 only changes the *rendered DOM* in the false branch; the boolean and its callers stay the same. This is a renderer-layer change, not a store-layer change.
- **Removed `entityReferenceData` from `TableCoreStore`.** This is an ObservableMap field — removing it requires confirming no MobX `@observable` decorator orphaning. The whole field block (declaration + accessor methods) goes together.
- **CSS scoping.** `.vg-cell-shimmer` is global by name. Project uses plain CSS in vibegrid. If `vibegridx-` prefix is the local convention in the chosen stylesheet, follow it (`.vibegridx-cell-shimmer`) — the task includes a grep to find the right home.
- **Do NOT use `display: none` for the shimmer when content arrives.** Per `vibegrid.md` rules, swap the entire DOM node (replace shimmer span with content) instead of toggling visibility — keeps accessibility tree clean.
- **The `useBadgeListEnrichment` bridge still needs to mount.** Preload only ensures the *target collection* is loading early; the bridge marshals resolved data into `tableCoreStore` MobX maps that the renderer reads. Both must land for the shimmer-to-content transition to work.

### Reference Docs

- `docs/planning/research/2026-04-25-vibegrid-relationship-loading-ux.md` — Research, root cause analysis, options considered
- `docs/planning/specs/2651-client-side-relationship-rendering-kill-.md` — Sibling effort: client-side relationship rendering (data layer this spec depends on)
- `.claude/rules/tanstack-db.md` — Singleton collection semantics, `getOrCreateEntityCollection` registry pattern
- `.claude/rules/vibegrid.md` — VibeGrid stores, slot registry, ARIA / accessibility-tree rules
- `.claude/rules/vibegrid-interactions.md` — Cell renderer DOM contract
- `.claude/rules/mobx-state.md` — MobX field removal patterns (decorator orphaning)
- `apps/web/src/systems/vibegrid/hooks/useBadgeListEnrichment.tsx` — Bridge that preload front-runs (kept as-is)
- `apps/web/src/shared/data/db/collections/registry.ts` — Singleton registry; `getOrCreateEntityCollection` signature
- `apps/web/src/app/stores/global/OrganizationStore.ts:39` — `getActiveOrganizationId()` definition
- `apps/web/src/systems/vibegrid/slots/__tests__/relationship-navigation.test.ts` — Existing test that confirms GH#2552 deprecation; this spec extends the comment block
