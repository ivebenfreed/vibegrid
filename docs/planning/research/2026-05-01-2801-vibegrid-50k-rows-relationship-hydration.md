# Local-first VIbeGrid at 50k rows: where we've been, where we are, how we get there

**Issue:** GH#2801 — but the issue is just a window into the bigger thing.
**Date:** 2026-05-01
**Author:** research session
**Status:** Synthesis / strategy, not a spec

---

## The thesis in one paragraph

We are 80% of the way to a local-first grid that can render 50k rows of an entity with thousands of populated relationship cells, instant scroll, and the DX of `useLiveQuery` — and we know exactly which 20% remains. The hard infrastructure is built (OPFS SQLite via SharedWorker, per-entity priority lanes, dual-write inline IDs, by-id bulk fetch, virtualized renderer with row pooling). What we're missing is **a single coherent sync axis**: today the SharedWorker writes the durable truth into SQLite while a parallel main-thread `queryFn` paginator races to populate the in-memory map that `useLiveQuery` and badge cells actually read from. GH#2801 is the smoking gun. The path forward is three-phased: **(1) collapse the dual-write into one sync axis** (SharedWorker emits, collection consumes — no more main-thread paginator), **(2) make the SharedWorker viewport-aware** (the grid tells the worker which IDs are on screen; the worker hydrates them with priority), **(3) move from collection-as-set to collection-as-window** so memory is bounded by viewport not by entity cardinality. That's the local-first enterprise-grid endgame, and we have most of the parts.

---

## Where we've been: a six-week archaeology

Reconstructing the arc from `git log` + spec docs, four named eras shaped today's architecture.

### GH#2651 — client-side relationship rendering (late April)

The pre-2651 world: every `data.query` call ran a server-side `enrichRelationshipProjections` that returned per-row `rel__*` projections. DEB Construction's Project page hung the Cloudflare Worker — 52 unindexed JSONB projections per row × thousands of rows blew the CPU budget.

**What landed:** Server flipped enrichment default to false on the hot path; client received raw entity records and resolved relationship names in the browser. `Rel_*` edge tables became first-class TanStack DB collections; expression indexes on `json_extract(data, '$.source_entity_id')` were added; the badge-list-live renderer used `useBadgeListEnrichment()` to look up target names from already-synced collections.

**What it left open:** Every grid that wanted to show relationship badges had to *materialize the entire Rel_\* edge collection* even if only 50 rows were visible. No viewport awareness. The 5k row cap on Rel_* collections (introduced in GH#2770) is a band-aid for this — it sacrifices completeness to avoid OOM.

### GH#2692 — SharedWorker priority queue (commit `459c51dfb`, late April)

The infrastructure leap. The SharedWorker became a real entity sync engine, not a dumb cache:

- **Per-entity, two-lane queue** (`apps/web/src/shared/data/db/sqlite/worker.ts:59-373`): foreground preempts; background pausable; max 4 concurrent runners; priority score `(hasForeground ? 0 : 1e15) + oldest.registeredAt` ensures fairness.
- **IPC contract extended**: `registerEntityInterest` / `releaseEntityInterest` (refcounted), `fetchEntityById` / `fetchEntityByIds` (targeted reads emitting `source: 'by-id'` batches), `forwardTableChange` (realtime echo with seq-number guard).
- **Sequence numbers** on `entity_records` give us a monotonic ordering primitive — `writeRecordIfNewer()` rejects out-of-order writes (`worker.ts:1323-1356`).
- **Two event channels out** to the main thread: `entityBatch` (rows) and `entitySyncStateUpdate` (state-machine transitions).

This is excellent infrastructure. The catch: **it shipped dormant**. No subscriber consumed `entityBatch` to fill TanStack DB collections. The expectation in the spec was that the SyncConfig adapter (#2686) would do that wiring — it never landed.

### GH#2770 — the OOM saga (late April → May 1)

DEB Project page had 47k DailyLog edges and 541k Photo edges. Loading the page wedged on three independent failures:

1. **Synchronous JSON parse blocking the main thread** for 7+ minutes (47k records × stringify/parse of `data` blob). Fixed by chunking JSON ops at 2000 rows with `await Promise.resolve()` yields between chunks (`schema.ts:98-117, 146-169`, commits `2455fceb9`, `20318c1ca`).
2. **Cache-write timeout cascade**: `DEFAULT_TIMEOUT=30s` couldn't accommodate 50–100MB of writes serialized behind the tx-mutex when 17+ collections warmed in parallel; tail writers timed out, cache stayed incomplete, next reload re-fetched. Fixed by raising to 5min (commit `07b5e5f13`).
3. **Rel_* heap explosion**: 5k cap added (commit per PR #2785). Lossy band-aid.

**What it tells us about scale**: the per-row JSON column is expensive at the boundary; OPFS writes are serialized by tx-mutex; chunking matters; and any "load everything into memory" pattern is fragile past 10k records on a single entity.

### GH#2786 — F': dual-write relationship IDs (May 1, the present)

The architectural shift. Instead of materializing the Rel_* edge collection to render badges, **write the array of target IDs directly into the source row's JSONB in the same Postgres transaction as the URS edge insert**. A row in RFI now carries `data.rel__r_f_i__project_belongs_tos = ['uuid-1', 'uuid-2']` natively. Badge rendering becomes a pure client-side join:

```
record.rel__field           // array of UUIDs from source row
  → coll.get(uuid)          // target collection lookup
  → record.name             // display
```

**P1 of the spec shipped.** P5–P9 (server read-path cutover, full client migration off `useBadgeListEnrichment`, write-path migration, permissions, inverse-read API) are in flight. The follow-up commits `e2514321e..57bb8c03a` were the post-P1 attempt to close the cross-entity name-resolution loop:

- **`e2514321e`** wired `useEntityCollection({priority: 'background'})` and viewport-cell `fetchEntityByIds` into the SharedWorker priority queue — *correct architecture*.
- **`ec947eec2`** added a global `entityBatch → collection.utils.writeBatch` bridge, so SharedWorker writes flowed into the TanStack DB in-memory map without requiring a foreground subscriber.
- **`57bb8c03a`** reverted the bridge because Project page OOM'd: the bridge raced the legacy `sqliteCollectionOptions.queryFn`'s QueryObserver. Both were writing into the same `syncedData` map; duplicate state crossed heap budget.

The revert was the right call short-term. It also exposed the architectural issue this document is about.

---

## Where we are: two sync paths into one map

The clearest way to draw the current state is as two parallel writers fighting over the same in-memory dictionary.

```
                          ┌─────────────────────────────────────────┐
                          │       TanStack DB collection            │
                          │           syncedData: Map<id, row>      │
                          │     (what useLiveQuery + cells read)    │
                          └────────────────▲──────────────▲─────────┘
                                           │              │
                       ┌───────────────────┘              └─────────────────────┐
                       │                                                        │
            ┌──────────┴──────────────────┐                       ┌─────────────┴────────────┐
            │  PATH A — SharedWorker      │                       │  PATH B — collection's   │
            │  worker.ts                  │                       │  own queryFn             │
            │                             │                       │  collection-options.ts   │
            │ • warmEntity (paginate)     │                       │                          │
            │ • fetchEntityByIds          │                       │ • Reads SQLite cache     │
            │ • forwardTableChange        │                       │ • Background-refreshes   │
            │ • create/update/delete echo │                       │   via main-thread oRPC   │
            │                             │                       │   (foreground!)          │
            │ Writes: SQLite + emits      │                       │ Writes: SQLite +         │
            │   entityBatch event         │                       │   collection.utils.      │
            │   (source: by-id, realtime, │                       │   writeBatch             │
            │   incremental)              │                       │                          │
            │                             │                       │                          │
            │ Has priority lanes ✅        │                       │ Bypasses lanes ❌        │
            │ Has by-id ✅                 │                       │ Pure paginator ❌        │
            └─────────────────────────────┘                       └──────────────────────────┘
```

There are three concrete defects this dual-path architecture causes today, all in service of GH#2801 and the broader vision:

### Defect 1: `warmEntity` writes SQLite but never emits `entityBatch`

This is the smoking gun. Read `worker.ts:1015-1129` carefully: `warmEntity()` paginates rows into SQLite via `insertBatch()`, updates `__entity_sync_state` via `updateSyncState()`, and emits `entitySyncStateUpdate` events on each transition. **It does not emit `entityBatch` events for the rows it inserts.** Only `fetchEntityById`, `fetchEntityByIds`, `forwardTableChange`, and the create/update/delete echoes emit them.

Consequence: when `useEntityCollection('Project', { priority: 'background' })` warms 3358 Project records into SQLite, no signal flows to the in-memory map. `coll.get(id)` keeps returning `undefined` until a parallel by-id fetch happens to land that record, or the foreground `sqliteQueryFn` races a foreground oRPC call and pulls it back from the network.

### Defect 2: `sqliteCollectionOptions.sqliteQueryFn` is a foreground oRPC paginator wearing cache-first clothing

Read `collection-options.ts:170-301`. The function does start with a SQLite read — that part is correct. Then it kicks off a **main-thread oRPC `data.query` paginator** as the "background refresh." That paginator runs on the foreground UI thread, ignores the SharedWorker priority queue, and writes back to SQLite + the in-memory map via `collection.utils.writeBatch`.

For background-priority collections, this defeats the entire point of the priority queue. The user marks Project as `{priority: 'background'}` in `useRelationshipTargetCollections` to avoid stealing CPU from the page's primary entity; subscribing via `useLiveQuery` then triggers a foreground oRPC paginator anyway. The bg-lane warmup races the foreground paginator. Memory goes up, requests double.

### Defect 3: in-memory map ≠ SQLite source of truth

`getExistingEntityCollection(target, orgId).get(id)` returns `undefined` if the collection is registered but not subscribed via `useLiveQuery`. The data is in SQLite. The TanStack DB collection's `syncedData` is only populated by the queryFn run, which only happens on subscription. Badge cells in VIbeGrid use `getExistingEntityCollection` (`badge-list.ts:103`), which means they see UUIDs until something — anything — triggers Path B.

This is a real invariant violation. SQLite is meant to be durable canonical local state. The collection's in-memory map is meant to be a reactive view over it. Today they drift.

### Why the bridge OOM'd and why that's actually instructive

The `ec947eec2` bridge flowed `entityBatch → collection.utils.writeBatch` globally, on every event, for every registered collection. On Project, both writers fired:

- The bridge wrote rows from `warmEntity`'s SQLite-write events (would-have-emitted, had Defect 1 been fixed).
- The legacy `sqliteCollectionOptions.queryFn`'s QueryObserver wrote rows from its own foreground paginator.

Same rows arrived twice with different object identities. TanStack DB's collection state machine isn't designed for two concurrent writers on the same key — internal write tracking, query observer caches, and Immer-style state copies multiplied. Project (3358 records × ~5KB serialized + duplicate state copies) crossed the heap budget.

The lesson: **the bridge alone is not enough.** You can't have the bridge AND the legacy paginator. You have to either replace the paginator or guard against it. The right fix is to delete the legacy paginator path entirely for collections that opt into the SharedWorker, not to bolt a bridge on top.

---

## The honest scale assessment for 50k rows

### What works today on modern hardware

- **OPFS SQLite raw query latency**: sub-millisecond for indexed `id` lookups on a 50k-row table; 20–100ms for full table scans (cited: official `sqlite-wasm` speedtest, RxDB benchmarks).
- **Virtualized rendering**: VIbeGrid uses a custom row-pool renderer (no React reconciliation per row), `MAX_POOL_SIZE=50`, `BUFFER_ROWS=10` overscan. Initial render is O(visible+buffer). Scroll cost is O(rows scrolled in/out). Cells re-render via `tableCoreStore.incrementConfigVersion()` → `RenderScheduler` → granular `renderCells()` for <10 affected, full render otherwise (`update-router.ts:25`).
- **By-id bulk fetch**: `fetchEntityByIds` chunks at 500, debounced 100ms in `useRelationshipTargetCollections.tsx:50`. Round-trips ~30–80ms over a healthy connection.
- **SharedWorker priority lanes**: foreground preempts background; background pausable globally; tested under DEB Project bootstrap with 17 concurrent warmups.

### Five cliffs we're a step away from

1. **Eager-mode collections at 50k rows.** TanStack DB's default mode hydrates *all* matching rows into `syncedData` for `useLiveQuery` to filter. Baseplane uses eager mode universally. At 50k rows × ~500 bytes object overhead per record × 5 active relationship-target collections = ~125MB heap before any UI work. GC pauses become user-visible. **Mitigation: TanStack DB 0.5 ships an on-demand mode** — query-driven sync where syncedData boundary is the union of active query filters. Adopting it for cross-entity target collections would cap memory at `unique_target_ids_in_visible_viewport`. Estimated cost: 3–5 days for the spike.

2. **Relationship bulk fetch under scroll.** Today: 500 IDs/call, 100ms debounce, no viewport awareness — `useRelationshipTargetCollections` iterates *all* `processedRows`, not just visible ones (`useRelationshipTargetCollections.tsx:246`). At 50k rows × 5 relationship columns × scroll-jump-to-row-40000, you re-inspect 250k IDs every 100ms. The per-target fetch-key cache (`fetch_key by size`, line 264) prevents a full re-fetch only as long as the ID-set size doesn't change. Any inline create/delete bumps it. Need a viewport-bounded variant.

3. **JSON column parsing under mutation.** The `data` column is a single JSON blob per row. Inline edits round-trip through `JSON.parse → mutate → JSON.stringify`. At 50k × edits-during-bulk-update, V8 spends measurable time in JSON code. The chunked path (GH#2770) helps reads; writes are still synchronous in the worker tx-mutex. **Mitigation: promote frequently-mutated fields to real columns** with expression indexes; keep JSON for sparse/reference fields.

4. **SharedWorker tx-mutex contention.** All transactional writes serialize through `withTransaction()` (`tx-mutex.ts`). Under heavy mutation OR concurrent multi-entity warmup, tail writers wait. Today the 5min `DEFAULT_TIMEOUT` masks this. We should instrument `tx-mutex` queue depth in telemetry.

5. **No viewport intent signal.** The single biggest architectural hole. The grid knows visible rows are 0–100; the SharedWorker doesn't. On a jump-to-row-40000, the worker is mid-warmup of the page's primary entity at row 1000 and has no way to know the user is now staring at row 40000. Spec doesn't exist; primitive doesn't exist.

### What competition has done that we haven't

Not as cargo-cult — as direct evidence the architectural patterns we need are proven:

- **Linear (100k+ issues)**: lazy field hydration on the model object, MobX-driven view re-render. Their grid stays fast because the *model graph itself* is a windowed live object. Talks: Tuomas Artman, "Scaling the Linear Sync Engine."
- **Zero (Rocicorp)**: explicit query-window sync. The client replica is *exactly* the union of active query results. Deregister a query, rows evict. This is the formal version of what TanStack DB 0.5's on-demand mode does.
- **Triplit 1.0**: incremental view maintenance — re-evaluate queries only on affected rows, not full re-scan. Worth tracking.
- **LiveStore**: same SharedWorker + SQLite + leader pattern as us, but reactivity is via Effect-based signals on SQLite triggers, not via an in-memory map. Strong DX, different bet.

The pattern across all four: **collections are windows, not sets.** The window adjusts as queries register/deregister. Memory is bounded by working set, not by entity cardinality. That's the load-bearing bet for 50k+.

---

## Where we get to: a three-phase roadmap

These three phases are independently shippable, each delivers value, and stack into the endgame. The first one closes GH#2801 cleanly without any of the bridge's failure modes.

### Phase 1: Collapse the two sync paths (GH#2801 fix, ~1–2 weeks)

**Goal:** SharedWorker becomes the *only* writer to TanStack DB collections. `sqliteCollectionOptions` becomes a pure SQLite reader subscribed to `entityBatch` for live updates. The legacy main-thread paginator goes away for SharedWorker-backed collections.

**Concrete steps:**

1. **Make `warmEntity` emit `entityBatch` per page** (`worker.ts:1015-1129`). Currently it only updates `sync_state`. Add `emitEntityBatch({source: 'initial', upserts: pageRows, isInitialReady: firstPage})` at the page-commit point. This is a single-call addition, no new schema.
2. **Refactor `sqliteCollectionOptions`** so `sqliteQueryFn` is a *pure* SQLite read (no main-thread oRPC paginator) for collections registered with the SharedWorker. The function returns rows from SQLite + subscribes the collection to the SharedWorker's `entityBatch` stream via `collection.utils.writeBatch`. This is **Option A** from the issue.
3. **Add a guard** in `sqliteCollectionOptions`: if the collection's metadata says `syncSource: 'sharedWorker'` (default for entity collections), the queryFn never makes a network request. Network fetching is exclusively the SharedWorker's responsibility. Behind a feature flag for one staging cycle so the legacy paginator is the fallback.
4. **Delete the legacy bridge code paths** once the flag flips: `ec947eec2`-era bridge file, the QueryObserver-driven write-batch in `collection-options.ts:201-231`.

**Why this works where the bridge didn't:** there is now exactly one writer (the SharedWorker), one event channel (`entityBatch`), and one consumer (the collection's sync registration). No race with QueryObserver because the collection no longer has a network paginator. No double state because there is only one source of writes. The "duplicate rows" OOM is structurally impossible.

**Validates:** GH#2801 acceptance criteria 2 (visible cell IDs resolve within ~10s of `entityBatch` landing without spawning N parallel foreground paginators).

### Phase 2: Viewport intent as a first-class IPC primitive (~1 week, partly speculative)

**Goal:** the SharedWorker knows what's on screen and prioritizes accordingly. Background warmup yields to viewport hydration.

**Concrete steps:**

1. **Add `setViewportIntent({entityName, orgId, ids: string[]})` to the IPC contract** — not row indices, just the IDs the grid currently has visible (or about to be visible from `BUFFER_ROWS` overscan). Cheap signal, fired on scroll-stable.
2. **Per-entity priority queue gains a "visible" sub-lane** above foreground: any pending fetches for IDs in the current viewport-intent set jump the queue. Implementation is small — it's a filter over `pickNextRequest()` (`worker.ts:123-131`).
3. **`useRelationshipTargetCollections` becomes viewport-aware**: instead of iterating all `processedRows` every 100ms, slice `processedRows.slice(visibleRange.start - BUFFER, visibleRange.end + BUFFER)` and fire `fetchEntityByIds` *only* for those rows. Today's all-rows scan is thrown out.
4. **Collection-level interest expiration**: when viewport-intent IDs shrink, deregister entity-level interest if no query covers the deregistered IDs. This sets up Phase 3.

**Why this matters at 50k:** the difference between "warmup all 3358 Projects on grid mount" and "fetch the 100 Projects whose IDs appear in visible row data" is the difference between 3.3MB hydrated and 100KB hydrated. With Phase 1, the hydrated rows reach `syncedData` deterministically; with Phase 2, only the rows that actually need to render do.

### Phase 3: Collection-as-window (~2–4 weeks, real architectural shift)

**Goal:** stop holding 50k rows in JS memory. Hold the visible+buffer working set in `syncedData`; SQLite is the canonical full set; the window slides as the user scrolls.

**Two viable implementations, in order of preference:**

**Option 3A — Adopt TanStack DB 0.5 on-demand mode** for cross-entity target collections. The library already supports it; we don't. Background-priority entity collections opt in. Eager mode stays for primary entities <10k rows. Migration cost: per-collection opt-in flag in `entity-collections.ts` policy table. This is the path of least architectural risk.

**Option 3B — Custom window adapter on top of `sqliteCollectionOptions`.** A wrapper that maintains a sliding window over SQLite. The collection's `syncedData` is always exactly `SELECT * WHERE id IN (visible_ids ∪ buffer_ids)`. Slide the window on viewport change. `useLiveQuery` works unchanged because its substrate (the in-memory map) still exists — it's just smaller. More control; more code; should only do this if 3A doesn't fit.

**The DX preservation question, answered:** `useLiveQuery` semantics are preserved either way. The window collection still has a Map<id, row>; the query language still operates on it; reactivity still fires on writes. What changes is the *identity* of the rows in the map (they're a sliding window, not the full entity). Application code that does `coll.get(id)` for a UUID outside the current window will still get `undefined` — but Phase 2's viewport-intent signal guarantees that visible IDs are always in the window before render.

**The endgame property:** a VIbeGrid showing a Tasks entity with 100k records and 8 relationship columns to other entities of comparable size has a working memory of `O(visible × (1 + relationship_columns))` rows ≈ 800 rows, regardless of total cardinality. JSON parse cost, GC pressure, and rerender cost all decouple from entity cardinality. Scroll feels instant because the worker hydrates the next page before it's visible. That is the local-first enterprise grid.

---

## Open questions and acknowledged uncertainties

These are real "I don't know yet" items. They don't block Phase 1 but need answers before Phase 3.

1. **Does on-demand mode in TanStack DB 0.5 compose with our SharedWorker?** The library was designed assuming queryFn fetches; we want queryFn to be SQLite-pure with SharedWorker pushing updates. Worth a 1-day spike against `node_modules/@tanstack/db` to verify.
2. **What's the actual scroll-stable detection latency in VIbeGrid?** If we fire viewport-intent on every scroll event we'll thrash the queue; if we wait for `scrollend` we miss fast horizontal scans. Need empirical data.
3. **JSON column vs columnar storage trade-off.** The 50k × edits regression is theoretical — needs profiling on real DEB workloads (RFI grid bulk-edit scenarios) before we commit to a schema migration.
4. **Inverse-direction relationship cells (GH#2798).** The dual-write applies to outgoing edges; inverse renders are different. F' P9 is inverse-read API; not yet shipped. Whether Phase 1's `entityBatch` flow handles the inverse case the same way needs verification.
5. **Multi-tab consistency under window collections.** Tab A's window is rows 0–100; Tab B's window is rows 40000–40100. The leader SharedWorker writes both via `BroadcastChannel`. If a row is in both windows, both tabs see it; if it's in neither, neither tab needs it. Should be fine but worth a thought experiment for edge cases (drag-drop reorder across windows, etc.).

---

## What this session is NOT recommending

A few non-actions, deliberately:

- **Don't reinstate the global `entityBatch → collection` bridge.** It will OOM again under any concurrent foreground paginator. The fix is to delete the foreground paginator, not to add a bridge on top of it.
- **Don't bump the 5k Rel_* cap.** That cap exists because the architecture loads all rows into JS memory. Phase 3 dissolves the cap by dissolving the assumption.
- **Don't introduce a third sync path.** GH#2801's Option B (per-collection `syncSource: 'queryFn' | 'sharedWorkerBatch'` flag) leaves both mechanisms in the codebase forever. Codebases age badly when "we'll deprecate the old one later" never happens.
- **Don't optimistically migrate to Linear's MobX-graph pattern.** It's mature and proven, but it requires a different reactivity substrate than `useLiveQuery`. The DX cost would be high and the win is incremental over a working window-collection design.

---

## Summary: the load-bearing bets

| Bet | Confidence | Evidence |
|-----|-----------|----------|
| OPFS SQLite scales to 50k rows on modern laptops | High | Official benchmarks, GH#2770 fixes proved the engine; tx-mutex serialization is the only real wedge |
| SharedWorker priority lanes work | High | GH#2692 shipped, Project bootstrap traversed them under stress |
| Dual-write of inline IDs eliminates Rel_* materialization | High | F' P1 is in production; remaining work is migrating callers |
| Collapsing to one sync axis (Phase 1) closes GH#2801 cleanly | High | Direct architectural reading; no race surface left |
| Viewport intent + window collections (Phase 2+3) hit 50k goal | Medium-high | Linear/Zero/Triplit prove the pattern; we just haven't done the spike |
| TanStack DB 0.5 on-demand mode composes with our SharedWorker | Medium | Library supports it; we haven't tested the integration |
| Chromebook / shared-VM performance under window collections | Low | Untested. Likely needs OPFS write-mutex telemetry first |

The gap between "where we are" and "where we want to be" is real, but it's not a research project — it's a roadmap. Phase 1 is mostly a refactor and closes the immediate user-visible bug. Phase 2 is a small new IPC primitive and a viewport-aware variant of an existing hook. Phase 3 is an architectural choice between adopting the library's on-demand mode or writing a thin window adapter. None of them require throwing away what we've built. All of them stack toward the same endpoint: a grid that scales with viewport, not with entity cardinality, and preserves `useLiveQuery` DX throughout.

That is the local-first enterprise grid we're trying to ship. The pieces are in place. We just need to align them.

---

## References

- GH#2801 — this issue (the immediate window into the gap)
- GH#2786 — F' dual-write spec (`docs/planning/specs/2786-fprime-dual-write-relationship-ids.md`)
- GH#2692 — SharedWorker priority queue (commit `459c51dfb`)
- GH#2770 — OOM saga (commits `2455fceb9..c5af44873`)
- GH#2651 — client-side relationship rendering (commit `28b48433c`)
- `docs/planning/research/2026-04-27-tanstack-db-sqlite-collection-rfc.md` — RFC for upstreaming the SQLite adapter
- `.claude/rules/tanstack-db.md` § "Cross-entity name resolution"
- `.claude/rules/vibegrid.md`
- TanStack DB 0.5 query-driven sync — https://tanstack.com/blog/tanstack-db-0.5-query-driven-sync
- Tuomas Artman, "Scaling the Linear Sync Engine"
- Rocicorp Zero docs — https://zero.rocicorp.dev/docs

Reverted bridge attempt: `e2514321e` (proper SW priority) → `ec947eec2` (global bridge) → `57bb8c03a` (revert).
