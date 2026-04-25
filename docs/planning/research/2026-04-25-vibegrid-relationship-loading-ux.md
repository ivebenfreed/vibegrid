# VibeGrid Relationship Loading UX — "..." Is Bad, Here's Why and What To Do

**Date:** 2026-04-25 (corrected)
**Trigger:** User feedback — "the ... loading is terrible UX" on relationship cells in VibeGrid. Follow-up: "entity-reference is already deprecated. Why are we doing those fetches???? The data is in the TanStack DB already which loads instantly for the main entity."
**Companion:** [`2026-04-23-relationship-rendering-at-scale.md`](2026-04-23-relationship-rendering-at-scale.md) — architectural plan (GH#2651, Phases 1–5).

---

## TL;DR

**Two facts that change the framing:**

1. **`entity-reference` and `user-reference` cell renderers are deprecated dead code.** They were removed from `slot-initialization.ts` registrations in GH#2552. The files exist and export, but no column ever resolves to them. The actual relationship cell types are `reference-select`, `reference-multi`, and `badge-list-live`.

2. **The fetches the bridges do are unnecessary in the steady state.** TanStack DB collections are singletons keyed by `(entityName, orgId)`. If the Submittal collection was loaded by *any* prior view in the session, `useEntityCollection('Submittal')` returns it instantly with a hot SQLite cache. The "..." appears not because the data is hard to get, but because **the bridges run lazily at first cell paint instead of eagerly at grid mount**, and because **`Rel_*` collections aren't first-class** (no event-bus sync by default, no SQLite preload, no warmup).

The fix is upstream of the renderer. Stop showing "..." by stopping the wait, not by prettifying the placeholder.

---

## What's actually rendering

Pulled from `slots/slot-initialization.ts`:

| Cell type | Registered? | Renderer | How it gets its display value |
|---|---|---|---|
| `text`, `number`, `date`, etc. | ✅ | basic renderers | Reads `value` directly from row record |
| `reference-select` (single FK) | ✅ (via `EntityReferenceCellRenderer` no longer; resolved by `useEntityReferenceData` bridge into `tableCoreStore.entityReferenceData`) | reference-select renderer | Cache lookup against MobX map populated by `useEntityReferenceData` bridge from `useEntityCollection(targetEntityType)` |
| `reference-multi` (multi FK) | ✅ | same path as reference-select | Same bridge |
| `badge-list` (server-enriched) | ✅ | `badgeListCellRenderer` | Reads pre-baked `["Name A", "Name B"]` array from row record (server enrichment — being removed by GH#2651) |
| `badge-list-live` (client-joined) | ✅ | `badgeListLiveCellRenderer` | Cache lookup against MobX map populated by `useBadgeListEnrichment` bridge from `useEntityCollection(Rel_*)` + `useEntityCollection(target)` |
| `entity-reference` | ❌ removed | (file orphaned) | n/a |
| `user-reference` | ❌ removed | (file orphaned) | n/a |

`apps/web/src/systems/vibegrid/slots/__tests__/relationship-navigation.test.ts:6-13`:

> "entity_reference and user_reference field types were removed in GH#2552. Relationships are now managed through URS (UnifiedRelationshipService), not field-level references. The reference-select and reference-multi types handle relationship display in the grid. The original EntityReferenceCellRenderer and UserReferenceCellRenderer slot registrations have been removed from slot-initialization.ts."

The `entity-reference.ts` file is still exported from `renderers/index.ts:32` and its `Loading...` text is still in source, but nothing routes to it. **Ignore it.** The previous version of this doc spent a third of its words on dead code.

---

## The real loading paths (only two)

### Path A — `reference-select` / `reference-multi` (single + multi FK columns)

1. `useEntityReferenceData` bridge mounts inside VibeGrid (file `hooks/useEntityReferenceData.tsx`).
2. Scans columns; extracts unique `targetEntityType`s from `reference-select` / `reference-multi` columns.
3. For each target type, mounts an `EntityReferenceDataBridge` that:
   - `useEntityCollection(targetEntityType)` — singleton; returns hot collection if previously loaded
   - `useLiveQuery` reads all records reactively
   - Pushes each record into `tableCoreStore.entityReferenceData` (MobX map)
4. The cell renderer reads from the MobX map at paint time.

### Path B — `badge-list-live` (relationship columns)

1. `useBadgeListEnrichment` bridge mounts inside VibeGrid (`hooks/useBadgeListEnrichment.tsx`).
2. Scans columns; extracts unique `(relationshipEntity, direction, targetEntityType)` triples.
3. For each triple, mounts a `RelationshipBadgeBridge` that:
   - `useEntityCollection(relationshipEntity)` — the `Rel_*` edge collection
   - `useEntityCollection(targetEntityType)` — the target entity collection (for name resolution)
   - `useLiveQuery` joins them; writes per-anchor name arrays into `tableCoreStore.relationshipBadgeData`
   - Calls `markRelationshipBadgesReady(...)` to flip the `…` placeholder to `—` for empty anchors.
4. The cell renderer reads from the MobX map at paint time.

Both paths use the **same machinery** the main grid uses to load itself: `useEntityCollection` → singleton registry → SQLite race-read → optional network refresh.

---

## Why "..." appears at all

The user's instinct is exactly right: this should be instant. It isn't, for **four specific reasons**:

### 1. Bridges run lazily — at first cell paint, not at grid mount

Both bridges are React components rendered inside `VibeGrid.tsx`. They mount when VibeGrid mounts, but their `useEffect`s and `useEntityCollection()` calls don't fire until React has at least committed once. There's a frame or two between "first cell painted" and "bridge subscribed and SQLite read returned." On a warm cache that window is ~16ms; on a cold cache it's however long the network takes. Either way, every cell in every relationship column flashes a placeholder during that window — even when the data is already in SQLite.

### 2. `Rel_*` collections aren't synced via event bus by default

From the 2026-04-23 doc, line 196, and confirmed at `event-handlers-tanstack-db.ts:200-207`:

```ts
// GH#2651 B2: forward Rel_* entries only when a collection is registered
// for that type+org — dropped otherwise, preserving the previous "skip
// Rel_*" behavior until a subscriber exists.
const tables = event.tables ?? []
for (const t of tables) {
  if (t.startsWith('Rel_') && !isCollectionRegistered(t, event.organizationId)) continue
  affectedEntityTypes.add(t)
}
```

The check `isCollectionRegistered` only passes after a `useEntityCollection('Rel_*')` call has registered the collection synchronously. Until then, `table_change` events for that `Rel_*` type are dropped. Net effect: the first time a user visits a grid with relationship columns, the `Rel_*` collection has no SQLite cache and no event-bus sync — both have to be cold-started by the bridge.

### 3. Target collections are loaded on demand, not preloaded

When the schema for `Project` declares 52 relationship fields targeting `Submittal`, `RFI`, `User`, `Vendor`, etc., we know at column-generation time which collections we'll need. But nothing preloads them. `useEntityCollection(targetType)` is only called once the bridge mounts inside VibeGrid — by which point the grid is already painting its first frame.

### 4. The "..." is the same shape regardless of cache temperature

`badge-list-live.ts:65-82`: cache miss + bridge not ready → `…` placeholder. There's no distinction between "warm cache, bridge will resolve in 16ms" (no placeholder needed) and "cold cache, bridge needs 2 seconds" (real placeholder needed). Even on warm cache, the user sees a flash.

---

## What the user is right about

> "The data is in the TanStack DB already which loads instantly for the main entity."

True for the main grid entity. The grid mounts, calls `useEntityCollection('Project')`, the singleton registry returns the hot collection, SQLite returns rows synchronously, the grid paints with data on the first frame.

For relationship targets, the same machinery would produce the same result **if we asked for them first**. Specifically:

- If the user visited `/entities/Submittal` earlier in the session, the `Submittal` collection is hot. The badge-list-live bridge for `Rel_Project_Submittal` could resolve names in zero network calls. But the bridge still mounts late and React still flashes a placeholder for one frame.
- If the user navigated straight to `/entities/Project`, the `Submittal` collection is cold. Even after the bridge fires, we wait for the network. But we could have started that fetch the moment we knew the column set, not after the cells painted.
- For `Rel_*` collections, every visit is effectively a cold start because event-bus sync is gated.

---

## Reframed fix list

The previous version of this doc proposed renderer-layer cosmetics (skeleton, fade-in, width reservation). Those still help, but they're treating the symptom. The real fixes are upstream.

Ordered by impact:

### 1. Preload relationship target collections at column-generation time

When `column-generation.ts` builds the column list and identifies relationship columns, kick off `getOrCreateEntityCollection(targetEntityType, orgId, ...)` for each unique target **before** the bridges mount. The collection registry is a global singleton — registering early warms it, including its SQLite read. By the time the bridges mount, hot collections return synchronously.

- **Where:** `stores/InitStore.initialize()` or `column-generation.ts` after column build
- **What:** Call `getOrCreateEntityCollection()` for every unique `targetEntityType` and every unique `relationshipEntity` (`Rel_*`) referenced in the column set
- **Cost:** ~20 lines; no new types
- **Effect:** On warm cache, eliminates the placeholder entirely. On cold cache, starts the fetch ~1 frame earlier and overlaps with the grid's own data fetch.

### 2. Lift the `Rel_*` event-bus filter for currently-mounted grids

`event-handlers-tanstack-db.ts:205` drops `Rel_*` events unless a collection is registered. Combined with the lazy bridge mount, this means: first visit → no events; events only flow once a bridge has subscribed. After bridge unmount (user navigates away), the collection may stay in the registry — but that needs verification.

The 2026-04-23 doc has this as Phase 2 work. The piece relevant to UX is: **once the preload from #1 happens, the collection is registered, events flow, and the next time we visit the grid the cache is correct, not stale.**

### 3. Debounced first-paint suppression in the renderers

If the bridge resolves within ~50ms of mount (warm-cache case), the user should never see a placeholder. Implementation: in `badge-list-live.ts`, when `cached === undefined` and `isReady === false`, render an empty container instead of the `…` badge for the first 50ms; only swap in the placeholder if the cache miss persists past the threshold. After #1 above, almost all warm-cache renders complete in that window.

- **Where:** `slots/renderers/badge-list-live.ts:65-82` (and the equivalent path inside the `reference-select` renderer chain)
- **Cost:** ~10 lines per renderer; uses a per-cell `setTimeout` cleared on resolve
- **Effect:** No placeholder flash on warm cache. Genuine cold-cache loads still get a clear loading indicator.

### 4. Single grid-level loading indicator for genuine cold loads

When #1 + #3 land, the only time a user sees loading state is when the cache is genuinely cold (first session, new org, etc.). For that case, replace 52 cell-level placeholders with one chip in the grid header: `Loading 3 of 52 relationship sources…`, driven by `tableCoreStore.relationshipBridgesProgress` aggregating bridge readiness.

- **Where:** new computed in `TableCoreStore`; new chip in `VibeGridXHeaderPure.tsx`
- **Cost:** ~30 lines
- **Effect:** Even cold-cache loads stop looking broken. One clear signal vs hundreds of dancing dots.

### 5. (Cosmetic, optional) skeleton instead of `…`

If for some reason a placeholder still has to show, use a CSS-animated shimmer block sized to the column's content width. This is the previous doc's "fix #1" — still useful, but lower priority once #1–#3 eliminate most placeholder occurrences.

### 6. Drop deprecated renderer files

`entity-reference.ts` and `user-reference.ts` are dead code that I (and the next person grepping for "Loading...") will trip over. Remove the exports from `renderers/index.ts:32` and delete the files. Zero runtime impact; one cleanup commit.

---

## Why this is better than the previous fix list

| Old approach | New approach |
|---|---|
| Skeleton instead of `…` | **Don't show a placeholder at all when cache is warm** — eliminate the flash entirely |
| Width reservation to prevent layout shift | Same cell paths, but real data lands in <50ms when preloaded — layout shift becomes invisible |
| Fade-in animation on first paint | Not needed when there's no placeholder→data transition to soften |
| Grid-level chip for "loading 12/52" | Still useful, but only for the genuinely cold case |
| Two-pass bridge write (count first, names second) | Not needed when target collections are preloaded; resolution is single-pass |
| Spent words on `entity-reference.ts` placeholder | Deprecated; not in the render path |

**The user's mental model is correct:** if `useEntityCollection` is the same primitive that loads the main entity instantly, it should load relationship targets instantly too. The reasons it doesn't are all upstream of the renderer:

1. We don't ask for them at the right time
2. We drop their event-bus updates
3. We render a placeholder in the gap between "asked" and "got it"

Fix those three things and the placeholder problem dissolves.

---

## Files this would touch

| File | Change |
|---|---|
| `apps/web/src/systems/vibegrid/stores/InitStore.ts` (or `column-generation.ts`) | After column generation, iterate column set; for every unique `targetEntityType` and `relationshipEntity`, call `getOrCreateEntityCollection()` to warm |
| `apps/web/src/shared/data/orpc/event-handlers-tanstack-db.ts:200-207` | (Already in place via GH#2651 B2) Verify behavior matches expectation: once bridges register `Rel_*` collections via `useEntityCollection`, events flow |
| `apps/web/src/systems/vibegrid/slots/renderers/badge-list-live.ts:65-82` | Add 50ms debounced first-paint suppression — render empty container instead of `…` until threshold |
| (reference-select renderer in slot-initialization or wherever it lives) | Same debounce |
| `apps/web/src/systems/vibegrid/stores/TableCoreStore.ts` | New computed `relationshipBridgesProgress: { ready, total }` aggregating bridge readiness flags |
| `apps/web/src/systems/vibegrid/components/VibeGridXHeaderPure.tsx` | Optional cold-load chip wired to the new computed |
| `apps/web/src/systems/vibegrid/slots/renderers/{entity,user}-reference.ts` | **Delete** — deprecated, not registered |
| `apps/web/src/systems/vibegrid/slots/renderers/index.ts:32` | Remove the deprecated exports |

---

## What I want to confirm with the user before turning this into a spec

1. **Is preload-on-mount acceptable bandwidth?** If a user opens `/entities/Project` with 52 relationship columns, we'd kick off ~52 collection registrations. Most are warm SQLite reads with no network cost. But on a cold session that's 52 parallel network fetches. Acceptable, or should we cap parallelism?
2. **Should the `…` ever appear?** With #1 + #3 in place, the only case is genuine cold cache + slow network. Is "show nothing until done, then everything appears" preferable to "show a placeholder for slow loads"?
3. **Drop deprecated renderers in this PR or separate cleanup?** The files are harmless but misleading; removing them in the same PR keeps the diff focused.
4. **Is the GH#2651 Phase 2 work (lift `Rel_*` filter, add SQLite expression indexes) a prerequisite, or can the preload approach ship first?** If preload registers the `Rel_*` collection via `useEntityCollection`, the existing GH#2651 B2 fix may already make events flow correctly — needs verification.

---

## Out of scope

- The architectural plan in 2026-04-23 doc (Phases 1–5) — orthogonal; this work makes the placeholder problem go away regardless of when those phases land.
- Server-side enrichment removal (covered there).
- Reorganizing the bridge architecture itself — current shape is fine; the issue is timing, not design.
