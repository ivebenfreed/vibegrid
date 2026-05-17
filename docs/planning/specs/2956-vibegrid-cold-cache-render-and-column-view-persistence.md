---
initiative: vibegrid-resilience
type: project
issue_type: bug
status: approved
priority: high
github_issue: 2956
created: 2026-05-17
updated: 2026-05-17
phases:
  - id: p1
    name: "Graceful-degradation skeleton dismiss"
    tasks:
      - "Add `serverDataRendered` observable to `InitStore` (apps/web/src/systems/vibegrid/stores/InitStore.ts)"
      - "Add 8s timer in useVibeGridData that, on fire, checks server-adapter rows present + isComplete still false, then flips `serverDataRendered` and emits a structured warn log"
      - "Widen skeleton gate predicate in VibeGrid.tsx from `entityDataKnownComplete` to `entityDataKnownComplete || serverDataRendered`"
      - "Verify wedge_watchdog and circuit-breaker behavior unchanged — no preemption from the timeout"
    test_cases:
      - "Cache-clear repro on /entities/CertificateOfInsurance dismisses skeleton ≤10s"
      - "Same repro on /entities/Project"
      - "Two-tab manual: A loaded, B opened, both render"
      - "Loki `pnpm at logs -q '{service_name=\"web\"} |= \"substrate completion timeout\"' --since 24h` returns structured entries when fallback fires"
  - id: p2
    name: "Persist column widths + order in entity_views.config"
    tasks:
      - "Extend EntityViewConfig Zod schema in packages/shared-types with `columnWidths?: Record<string, number>` and `columnOrder?: string[]`"
      - "Update viewsRouter.update in apps/dataforge/src/orpc/routers/views.ts to use EntityViewConfigSchema in place of the existing z.record(z.string(), z.any()) so server enforces the new fields"
      - "Add validation in views.update — widths > 0, columnOrder items are strings (covered by Zod schema, but verify error path returns 422 cleanly)"
      - "Wire VisualStateStore resize/reorder writes through views.update (debounced ~500ms), replacing localStorage-only path"
      - "Read columnWidths + columnOrder from server config and seed VisualStateStore on view-apply (useViewUrlSync.ts)"
      - "One-shot localStorage → server backfill on mount: if config.columnWidths absent/empty and localStorage has values for active view, write up once via views.update (idempotency guarded by module-level Set OR detection that loaded viewConfig now has the field)"
    test_cases:
      - "Resize a column, sign out, clear localStorage, sign back in — width is restored from server"
      - "Reorder columns, repeat — order is restored"
      - "Existing user with localStorage-only widths: first load post-deploy writes localStorage values up to server"
      - "Multi-device LWW: resize on tab A, resize same column on tab B, server reflects tab B's value (entity_views.updated_at advances)"
---

## Overview

On the CertificateOfInsurance and Project entity grids, clearing browser site data and returning to the page leaves the VibeGrid skeleton mounted forever — rows never render until a hard refresh. Root cause is a SharedWorker / PGlite-OPFS leader wedge (same condition as open issues #3087 and #3086) that prevents `substrateState.isComplete` from ever flipping true, gating the skeleton overlay. Separately, the issue title's hypothesis — that saved views are client-only — is partly true: column widths and column reorder are the only view fields actually persisted only in localStorage, while all other view config already lives server-side in `entity_views`.

This spec ships two independent, low-risk fixes under #2956:

1. **A graceful-degradation render path** that dismisses the skeleton when server-adapter rows are present, even if substrate has wedged. The wedge subsystem (`wedge_watchdog`, `circuit-breaker`) is untouched and continues recovery in the background. Users see their data instead of a spinning skeleton; #3087/#3086 retain ownership of the actual root-cause fix.
2. **Server-side persistence of `columnWidths` and `columnOrder`** in `entity_views.config` JSONB, closing the documented State Ownership gap (`canonical-patterns.md` row 6 and `docs/theory/experience.md:296`, which both designate column configuration as Authority state that MUST live server-side).

## Feature Behaviors

### B1: Server-data-rendered flag

**Core:**
- **ID:** server-data-rendered-flag
- **Trigger:** Grid mount in `useVibeGridData`
- **Expected:** A new `serverDataRendered: boolean` observable on `InitStore` defaults to `false`, can only be flipped to `true` by the timer-driven fallback path (B2), and is reset on store init like the other lifecycle flags.
- **Verify:** Add a unit test or runtime assertion that `InitStore.serverDataRendered` is `false` after construction and after `reset()`; flipping it from any code path other than the new fallback throws or fails review.

**Source:** `apps/web/src/systems/vibegrid/stores/InitStore.ts` (new observable + setter)

#### State Layer
- Observable: `serverDataRendered: boolean` (mobx `@observable`)
- Setter: `markServerDataRendered()` — idempotent, sets `true` only
- `reset()` resets it back to `false` alongside existing flags

### B2: 8-second timeout-driven fallback

**Core:**
- **ID:** substrate-completion-timeout
- **Trigger:** 8s after `useVibeGridData` effect mounts (one-shot timer per mount).
- **Expected:** When the timer fires, if `substrateState.isComplete === false` AND the server-adapter race in `unified/query.ts` has emitted at least one row batch (i.e. `tableCoreStore.processedRows.length > 0`), call `initStore.markServerDataRendered()` and emit `logger.warn('substrate completion timeout', { entity_type, organization_id, elapsed_ms: 8000, rows_present: true })`. If rows are NOT present yet, do nothing — let the existing 30s `wedge_watchdog` handle the truly-stuck case.
- **Verify:** Simulate a wedge by neutering the leader fallback in `unified/query.ts` (or use `__bp_testWedgeLeader` harness). Within 8±0.5s, skeleton dismisses on staging COI grid; Loki query `pnpm at logs -q '{service_name="web"} |= "substrate completion timeout"' --since 1h` returns a structured entry with the org + entity_type.

**Source:** `apps/web/src/systems/vibegrid/hooks/useVibeGridData.ts:172-189` (new effect alongside existing `isComplete` gate and `armWedgeWatchdog`)

#### State Layer
- Timer is cleared on unmount and on the existing `isComplete === true` path firing first (no double-flip).
- The timeout path does NOT call `markEntityDataKnownComplete()` — that flag's contract is preserved as "substrate authoritatively complete."

#### Observability
- Log shape: `{ event: 'substrate_completion_timeout', entity_type, organization_id, elapsed_ms, rows_present }` for Loki queryability.

### B3: Widened skeleton gate

**Core:**
- **ID:** widened-skeleton-gate
- **Trigger:** VibeGrid render pass.
- **Expected:** The predicate that decides whether `VibeGridLoadingOverlay` mounts changes from `!initStore.entityDataKnownComplete` to `!(initStore.entityDataKnownComplete || initStore.serverDataRendered)`. Once either is true, skeleton is gone for the rest of the page lifecycle (until next mount).
- **Verify:** Component-level smoke: render the grid, manually set `initStore.serverDataRendered = true` (dev tools or test harness), confirm `VibeGridLoadingOverlay` unmounts within one render cycle. Existing path (substrate-driven) still dismisses skeleton when `entityDataKnownComplete` flips.

**Source:** `apps/web/src/systems/vibegrid/VibeGrid.tsx:728-740` (the `phase !== 'init' && entityDataKnownComplete === true` predicate)

#### UI Layer
- No new component. Only the gate predicate changes.
- Empty-state vs rows-present rendering is already driven by `tableCoreStore.processedRows.length`, so once the skeleton lifts, rows render immediately (no separate empty-state regression risk).

### B4: Wedge subsystem untouched

**Core:**
- **ID:** wedge-untouched
- **Trigger:** N/A (negative behavior — verifies no regression).
- **Expected:** `wedge_watchdog` 30s nuclear reset path and `circuit-breaker` 2-resets-in-5-min guard continue to fire under genuine wedges. The new timeout does not pre-empt them, suppress their logs, or alter their state.
- **Verify:** With timeout fallback active, force a sustained wedge (no server adapter rows either). At 30s, `wedge_watchdog` fires its existing logs (`pnpm at logs -q '{service_name="web"} |= "wedge_watchdog"' --since 1h`). After 3 forced wedges within 5 min, `circuit-breaker` refuses further resets per existing behavior.

**Source:** `apps/web/src/systems/vibegrid/.../wedge-watchdog.ts:24-86` and `circuit-breaker.ts` (unchanged in this spec)

### B5: `markEntityDataKnownComplete` contract preserved

**Core:**
- **ID:** ekdc-contract-preserved
- **Trigger:** N/A (negative behavior).
- **Expected:** `InitStore.markEntityDataKnownComplete()` is callable ONLY from the existing `substrateState.isComplete === true && substrateState.source !== null` path in `useVibeGridData`. The new timeout does not call it.
- **Verify:** Code review (single call site) plus grep: `Grep("markEntityDataKnownComplete", glob="**/*.{ts,tsx}")` returns exactly two hits — the method definition in `apps/web/src/systems/vibegrid/stores/InitStore.ts` and the existing call site at `apps/web/src/systems/vibegrid/hooks/useVibeGridData.ts:172-174`. No third hit anywhere.

**Source:** `apps/web/src/systems/vibegrid/hooks/useVibeGridData.ts:172-174` (call site stays single)

### B6: `entity_views.config` schema extended

**Core:**
- **ID:** config-jsonb-extended
- **Trigger:** Schema definition update in shared types + Zod parser used by `views.update`.
- **Expected:** `EntityViewConfig` Zod schema accepts two new optional fields:
  - `columnWidths?: Record<string, number>` (positive numbers, treated as pixels)
  - `columnOrder?: string[]` (column ids in display order)
- Existing fields (sortBy, filters, groupConfig, viewMode, globalSearchText, columnVisibility, nav) unchanged. No DB migration — JSONB is schemaless and additive.
- **Verify:** `pnpm bpd --staging "db SELECT config FROM entity_views WHERE config ? 'columnWidths' LIMIT 5"` returns rows after a user resizes a column on staging. Existing views without the field continue to load (validation treats both as optional).

**Source:** `packages/shared-types/src/` (find `EntityViewConfig` Zod schema; if absent, define alongside views API)

#### Data Layer
- No migration. JSONB column already exists per `apps/web/src/server/migrations/fixed/20260227000000_entity_views.ts:40`.
- Existing rows without `columnWidths` / `columnOrder` are valid (fields are optional).

### B7: `views.update` validates new fields

**Core:**
- **ID:** views-update-validation
- **Trigger:** Call to `orpcClient.dataforge.views.update({ id, config: { columnWidths, columnOrder } })`.
- **Expected:** Server-side Zod validation rejects `columnWidths` containing non-positive numbers, non-numeric values, or unknown column ids (validated against the view's `entity_type`). `columnOrder` must be a string array; duplicates rejected. Validation runs before DB write.
- **Verify:** `pnpm bpd --staging "auth ceo | orpc /dataforge/views/update {\"id\":\"<id>\",\"config\":{\"columnWidths\":{\"a\":-5}}}"` returns a 4xx Zod error. Valid payloads write through.

**Source:** `apps/dataforge/src/orpc/routers/views.ts` (the server-side `views.update` handler; replace its `config: z.record(z.string(), z.any())` field with `config: EntityViewConfigSchema`). Client-side oRPC type import at `apps/web/src/shared/data/orpc/domains/dataforge.ts` (views.update around lines 920-930) picks up the narrowed type automatically.

#### API Layer
- Method: POST `/dataforge/views/update`
- Request shape: existing + new optional `columnWidths` / `columnOrder` in `config`
- Error codes: 422 Zod parse failure on invalid widths/order; 403 if user lacks permission per existing RLS

### B8: `VisualStateStore` writes to server (LWW per view)

**Core:**
- **ID:** vss-server-write
- **Trigger:** User resizes a column or reorders columns. Existing localStorage write debounce stays for short-term responsiveness, but a debounced (~500ms) `views.update` call also fires.
- **Expected:** Final settled state lands in `entity_views.config.columnWidths` / `columnOrder` within ~1s of the last user interaction. Conflict model is last-write-wins per view — each update sends the FULL `columnWidths` map and `columnOrder` array (no partial merge). `entity_views.updated_at` advances.
- **Verify:** Resize a column in tab A, observe `pnpm bpd --staging "db SELECT config->'columnWidths' FROM entity_views WHERE id='<id>'"` reflects the change within ~1s. Resize same column in tab B; updated_at advances and B's value is authoritative.

**Source:** `apps/web/src/systems/vibegrid/stores/VisualStateStore.ts` (new server-write debounce; localStorage path may stay for offline / latency masking)

#### State Layer
- Debounce: ~500ms (matches existing PersistenceStore debounce semantics)
- LWW conflict model — no partial JSONB merge, no per-column CRDT

### B9: One-shot localStorage → server backfill

**Core:**
- **ID:** localstorage-backfill
- **Trigger:** First time a view is applied for a given user+view after deploy. Detection: `entity_views.config.columnWidths` is absent, undefined, OR an empty object `{}` (treat all three as "not yet backfilled") AND `PersistenceStore` localStorage has at least one width entry for that view's storage key.
- **Expected:** Read the localStorage values, normalize against the view's known column ids, and call `views.update` once with the resulting `columnWidths` (and `columnOrder` if present). Idempotent — on subsequent loads, the field is present server-side so no backfill fires. localStorage entry can be left in place (it'll be overwritten by next legit write).
- **Verify:** On a staging org with a known localStorage-resized view (pre-deploy state), first post-deploy load triggers a single `views.update` call (visible in network panel via `pnpm ab network`). Server config reflects the local values. Second load does not re-trigger.

**Source:** `apps/web/src/features/entities/hooks/useViewUrlSync.ts:360-458` (where view config is applied; gate the backfill alongside the apply step)

### B10: Restore column widths + order from server config

**Core:**
- **ID:** restore-from-config
- **Trigger:** View apply step in `useViewUrlSync` (existing path that already applies sortBy, filters, etc.).
- **Expected:** When applying a view config to `VisualStateStore`, if `config.columnWidths` is present, seed `VisualStateStore.columns[i].width` for each column id. If `config.columnOrder` is present, set column display order to match. Missing entries fall back to defaults (same as today).
- **Verify:** Set widths on staging, sign out, "clear all site data" in browser, sign back in (which preserves the server `entity_views` row), navigate to the same entity page — widths and order restored from server. Phase 1's skeleton-dismiss fix means rows render even on the cold cache where this restore happens.

**Source:** `apps/web/src/features/entities/hooks/useViewUrlSync.ts:395-438` (extend the per-dimension apply switch)

## Non-Goals

- **No fix for the substrate / SharedWorker leader wedge root cause.** That remains owned by GH#3087 (cold-paint warmEntity stall without leader fallback) and GH#3086 (`__bp_testUnwedgeLeader` doesn't restore leader). Phase 1 masks the symptom for users while preserving the wedge subsystem so #3087/#3086 can be addressed independently.
- **No changes to `wedge_watchdog`, `circuit-breaker`, or leader election.** Explicitly forbidden by B4.
- **No new e2e test infrastructure.** Multi-tab e2e coverage gap is documented as an Open Risk, not addressed in this spec. Sprint-mode verification is manual.
- **No CRDT / partial merge** for column widths conflicts. Last-write-wins is sufficient (column resize is interactive, conflicts vanishingly rare).
- **No removal of localStorage column-width writes.** They stay for offline latency masking; server is now the source of truth for restoration, but local writes still happen in parallel.
- **No movement of `preferences-collection.defaultView`** server-side. It's dead code; `entity_views.is_default` already provides per-(org, entity_type) default-view resolution.
- **No PR.** Sprint mode: push to staging, verify per Verification Plan, no review gate.
- **No changes to the unified query layer (`unified/query.ts`)**, `useSubstrateGridRows`, or the 3s leader-fallback timeout. Phase 1 is a separate render-gate path, not a query-layer change.
- **No fallback for "wedge with zero server rows" within Phase 1.** If at 8s the timer fires but `tableCoreStore.processedRows.length === 0` (both substrate AND server adapter are silent), the user continues to see the skeleton until the existing 30s `wedge_watchdog` nuclear reset fires. Improving that long-tail UX (e.g., a "still syncing — try again" indicator) is deliberately out of scope and owned by #3087/#3086.

## Implementation Phases

(See frontmatter for task lists and per-phase test cases.)

**P1: Graceful-degradation skeleton dismiss** — InitStore observable + setter, 8s timer in useVibeGridData, widened gate predicate in VibeGrid.tsx, structured log on fallback fire.

**P2: Persist column widths + order in entity_views.config** — Zod schema extension, views.update validation, VisualStateStore server-write debounce, view-apply restore path, one-shot localStorage backfill.

Phases are independent — P1 fixes the user-visible repro; P2 closes the State Ownership gap. Either can ship without the other, but the intended order is P1 first (it's the bug fix the user reported).

## Verification Plan

Run each step on staging (`dev.baseplane.ai`). No PR; staging is the gate.

### V0 — Resolve test fixtures (run first, reuse across V5–V8)

Capture the view id you'll use for the column-config round-trip steps:

```
VIEW_ID=$(pnpm bpd --staging "db SELECT id FROM entity_views WHERE entity_type='CertificateOfInsurance' AND organization_id='01920000-2000-7000-8000-000000000001' AND is_default=true LIMIT 1" | jq -r '.rows[0].id')
echo "$VIEW_ID"
```

Substitute `$VIEW_ID` for `<id>` / `<view-id>` in the steps below. If the query returns null, create a default view via the UI first (this is itself a smoke test of the existing views.setDefault path).

### V1 — Cache-clear repro (P1 user-visible fix)
1. `pnpm ab auth login staging-deb-admin`
2. `pnpm ab open https://dev.baseplane.ai/entities/CertificateOfInsurance`
3. Set "Full" as the active view (or whichever view the user runs).
4. In Chrome DevTools → Application → "Clear site data" (everything: cookies, storage, cache).
5. `pnpm ab auth login staging-deb-admin` (re-login)
6. `pnpm ab open https://dev.baseplane.ai/entities/CertificateOfInsurance`
7. Time how long until rows render. **Expected:** ≤10 seconds (substrate may complete first; if wedged, the 8s timeout fallback fires).
8. Confirm rows are real data, not skeleton placeholders: `pnpm ab grid wait-rows 5 12000` — must return success.

### V2 — Second-grid repro (P1 not entity-specific)
Repeat V1 steps 4–8 on `https://dev.baseplane.ai/entities/Project`. Same expectations.

### V3 — Two-tab manual (P1 doesn't break multi-tab leader)
1. `pnpm ab open https://dev.baseplane.ai/entities/CertificateOfInsurance` in tab A. Wait for rows. Run `pnpm ab grid wait-rows 5 12000` — expected success.
2. In the SAME Chrome profile, open a second tab to the same URL (tab B). Switch focus to tab B.
3. Run `pnpm ab grid wait-rows 5 12000` against tab B.
4. **Pass:** both tabs return success (rows render in both within 12s). **Fail:** either tab times out, OR tab A's rows disappear when tab B takes leader.
5. Refresh tab A (regular reload, not hard refresh). Re-run `pnpm ab grid wait-rows 5 12000` against tab A. Pass if it returns success without tab B stalling.

### V4 — Loki wedge-rate baseline (P1 observability)
After leaving Phase 1 deployed for 24h:
```
pnpm at logs -q '{service_name="web"} |= "substrate completion timeout"' --since 24h -n 200
```
**Expected:** Some count > 0 if real users hit the wedge (informs #3087/#3086 priority). Zero rate means substrate is healthier than the dev-1 report suggests. Structured fields (`entity_type`, `organization_id`, `elapsed_ms`) must be present and parseable.

### V5 — Column width round-trip (P2 server-side persistence)
1. `pnpm ab auth login staging-deb-admin`
2. `pnpm ab open https://dev.baseplane.ai/entities/CertificateOfInsurance`
3. Resize the first column to a noticeably wider value (e.g., 400px).
4. `pnpm bpd --staging "db SELECT config->'columnWidths' FROM entity_views WHERE id='$VIEW_ID'"` (using `$VIEW_ID` from V0)
5. **Expected:** Within ~2s of the resize, the query returns a JSONB object containing the resized column id with width ≈400.
6. In DevTools → Application → "Clear site data" (everything).
7. Re-login and re-navigate to the page.
8. **Expected:** Column is 400px wide on first paint after rows render (restored from server, not from cleared localStorage).

### V6 — Column reorder round-trip (P2)
1. Drag a column to a new position via the grid header UI.
2. `pnpm bpd --staging "db SELECT config->'columnOrder' FROM entity_views WHERE id='$VIEW_ID'"`
3. **Expected:** The string array reflects the new order within ~2s.
4. Clear site data, re-login, re-navigate. Column appears in the new order.

### V7 — One-shot localStorage backfill (P2 migration)
Pre-condition: a staging user has resized columns BEFORE the P2 deploy (so localStorage has values, server `config.columnWidths` is absent).
1. After deploy, that user signs in and loads the page.
2. `pnpm ab network | grep views/update` should show ONE call shortly after page load.
3. `pnpm bpd --staging "db SELECT config->'columnWidths' FROM entity_views WHERE id='$VIEW_ID'"` now returns values matching the user's localStorage state.
4. Reload the page — no additional `views/update` calls from the backfill path. (Subsequent normal resizes still write through B8.)

### V8 — `views.update` validation rejects invalid input (P2)
```
pnpm bpd --staging "auth deb-admin | orpc /dataforge/views/update {\"id\":\"$VIEW_ID\",\"config\":{\"columnWidths\":{\"some_col\":-5}}}"
```
**Expected:** 4xx response with a Zod parse error pointing at `columnWidths.some_col`. Server row unchanged.

### V9 — Wedge subsystem untouched (regression check on B4)
After Phase 1 deploy:
1. `pnpm at logs -q '{service_name="web"} |= "wedge_watchdog"' --since 7d` — confirms the watchdog still fires on genuine wedges.
2. Grep `circuit-breaker.ts` for reset-threshold constants — values unchanged from pre-deploy git HEAD.
3. Grep new code paths for any call to `markEntityDataKnownComplete()` outside the existing single call site: `Grep("markEntityDataKnownComplete", glob="**/*.{ts,tsx}")` must return exactly the InitStore definition and the existing call site at `useVibeGridData.ts:172-174`.

## Implementation Hints

### Key Imports

```ts
// InitStore observable
import { makeObservable, observable, action } from 'mobx'

// Zod schema for views.update
import { z } from 'zod'

// Logger for the timeout warn — use the web-app logger, NOT worker-runtime
// (worker-runtime is for Cloudflare worker context; browser code uses getLogger).
// Pattern matches the existing import in InitStore.ts.
import { getLogger } from '@/shared/lib/logging'
const logger = getLogger('vibegrid:wedge-fallback')

// oRPC client for views.update
import { orpcClient } from '@/shared/data/orpc/client'
```

### Code Patterns

**Pattern 1 — Adding an observable + setter to a MobX store (InitStore.ts):**
```ts
@observable serverDataRendered = false

@action
markServerDataRendered = () => {
  if (this.serverDataRendered) return // idempotent
  this.serverDataRendered = true
}

// In reset():
this.serverDataRendered = false
```

**Pattern 2 — Timer effect alongside an existing one (useVibeGridData.ts):**
```ts
// Dep array MUST be stable scalars only — substrateState/tableCoreStore are MobX
// observables that update on every snapshot and would re-arm the timer endlessly.
// Read them inside the timer callback via refs so the latest values are used at
// fire time without re-creating the timer.
const substrateStateRef = useLatestRef(substrateState)
const tableCoreStoreRef = useLatestRef(tableCoreStore)

useEffect(() => {
  if (initStore.entityDataKnownComplete) return // already complete, no timeout needed
  const id = window.setTimeout(() => {
    const s = substrateStateRef.current
    const t = tableCoreStoreRef.current
    if (
      !s.isComplete &&
      !initStore.entityDataKnownComplete &&
      t.processedRows.length > 0
    ) {
      logger.warn('substrate completion timeout', {
        event: 'substrate_completion_timeout',
        entity_type: entityType,
        organization_id: orgId,
        elapsed_ms: 8000,
        rows_present: true,
      })
      initStore.markServerDataRendered()
    }
  }, 8000)
  return () => window.clearTimeout(id)
}, [initStore, entityType, orgId]) // stable scalars only
```

Verify locally that the timer fires exactly once per mount, not on every substrate snapshot. If `useLatestRef` doesn't exist as a util, inline `const ref = useRef(value); useEffect(() => { ref.current = value })`.

**Pattern 3 — Zod extension on EntityViewConfig:**
```ts
export const EntityViewConfigSchema = z.object({
  // ... existing fields
  columnWidths: z.record(z.string(), z.number().positive()).optional(),
  columnOrder: z
    .array(z.string())
    .refine((arr) => new Set(arr).size === arr.length, {
      message: 'columnOrder must not contain duplicates',
    })
    .optional(),
})
```

**Pattern 4 — Debounced server write from VisualStateStore (mirrors existing PersistenceStore debounce):**
```ts
private writeColumnConfigDebounced = debounce(async () => {
  const config = {
    columnWidths: this.serializeColumnWidths(),
    columnOrder: this.serializeColumnOrder(),
  }
  await orpcClient.dataforge.views.update({ id: this.activeViewId, config })
}, 500)
```

**Pattern 5 — One-shot backfill in view-apply:**
```ts
// Module-level Set survives hook unmount/remount within a session — prevents
// redundant backfill calls when the user navigates away and back. A useRef
// inside the hook resets on unmount and would re-fire backfill.
const backfilledViewIds = new Set<string>()

// In useViewUrlSync, where the view config is applied:
const hasServerWidths =
  viewConfig.columnWidths && Object.keys(viewConfig.columnWidths).length > 0

if (!hasServerWidths && !backfilledViewIds.has(view.id)) {
  const localValues = readLocalStorageWidths(view.id)
  if (localValues && Object.keys(localValues).length > 0) {
    backfilledViewIds.add(view.id)
    orpcClient.dataforge.views.update({
      id: view.id,
      config: { ...viewConfig, columnWidths: localValues },
    }).catch(err => logger.warn('column width backfill failed', { err }))
  }
}
```

### Gotchas

- **`logger` import path** — use `getLogger from '@/shared/lib/logging'` (the web-app browser logger, same as `InitStore.ts`). Do NOT use `@baseplane/worker-runtime/observability` — that's the Cloudflare worker logger and isn't wired for browser context. Mismatched packages produce silent log drops.
- **Effect dep array** — including `substrateState` directly may re-arm the timer on every snapshot. Prefer reading via ref or extracting just the `entityType`/`orgId` strings. Test locally that the timer fires exactly once per mount.
- **Idempotent backfill** — guard with a **module-level** `Set<string>`, NOT a `useRef`. The ref resets on hook unmount; if the user navigates to a different page and back, the ref re-arms backfill even though the server already has values. Module-level scope survives the hook lifecycle for the session. Additionally check `viewConfig.columnWidths` is empty (not just falsy) since the field may load as `{}` once the server-side migration has run.
- **JSONB additive update** — `views.update` likely already does `config = $1` (full replace). Confirm — if so, B8/B9 must send the FULL config, not just `{ columnWidths }`. Read the existing update handler before wiring writes.
- **`is_default` unique partial index** — backfill writes to the user's active view (whatever is selected via `useViewUrlSync`), not necessarily the default view. Verify the right view id is used.
- **No migration needed** for B6 — JSONB is schemaless. Old rows still parse because `columnWidths` and `columnOrder` are optional.
- **`__bp_testWedgeLeader` harness** at `99006c0c6` may be useful for simulating wedge during manual V1 testing — check `apps/web/src/systems/vibegrid/__tests__/` for usage examples.
- **MobX action wrapping** — without `@action`, the `markServerDataRendered` mutation outside an action will warn in dev mode. Decorator OR `action(() => ...)` both work.

### Reference Docs

- `.claude/rules/canonical-patterns.md` — State Ownership table (row 6 documents user prefs as server-owned)
- `.claude/rules/vibegrid.md` and `vibegrid-interactions.md` — grid lifecycle, store boundaries
- `docs/theory/experience.md:296` — explicit doctrine that column configuration is Authority state
- `docs/theory/dynamics.md:448` — actionable error messaging philosophy (informs the Loki log shape in B2)
- `apps/web/src/server/migrations/fixed/20260227000000_entity_views.ts` — view table schema and RLS
- `apps/web/src/features/entities/hooks/useViewUrlSync.ts` — view apply / restore code path
- `apps/web/src/systems/vibegrid/hooks/useVibeGridData.ts:172-189` — current `isComplete` gate and watchdog
- `apps/web/src/systems/vibegrid/VibeGrid.tsx:728-740` — skeleton overlay gate
- GH#3087, GH#3086 — owners of the substrate wedge root-cause fix this spec deliberately does not touch
