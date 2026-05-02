# Part II: this isn't a grid problem — it's a distributed materialized view problem, and that frames the right primitive

**Companion to:** `2026-05-01-2801-vibegrid-50k-rows-relationship-hydration.md`
**Date:** 2026-05-01
**Status:** Strategic frame, not a roadmap

---

## Why a Part II

Part I was correct and shippable. Phase 1 closes GH#2801 cleanly; Phase 2 adds viewport intent; Phase 3 picks an on-demand collection mode. If we executed it tomorrow we'd have a working 50k-row grid in six weeks.

But I stayed inside the existing vocabulary — `useLiveQuery`, `Collection`, `entityBatch`, `syncedData` — and treated those primitives as fixed. That's the competent tactical answer. It is not the strategic frame.

The strategic frame:

> **A local-first enterprise grid is not a frontend rendering problem. It is a distributed materialized view problem. Every cliff in Part I — eager-mode collections, viewport unawareness, JSON parsing under mutation, the dual sync paths — is a special case of "we don't have a real view-maintenance system."**

If that's true, the right primitive isn't a faster collection. It's an **incremental query as a first-class durable artifact** — owned by SQLite, maintained by the SharedWorker, bound symmetrically by React components and AI agents. That's a different bet, with bigger upside and longer time horizon. This document makes the case.

---

## The vocabulary trap I fell into

Part I's mental model:

```
SharedWorker writes SQLite → emits entityBatch
Collection has in-memory Map<id, row>
useLiveQuery filters the Map reactively
Cell renderer calls coll.get(id)
```

Every fix in Part I tweaks where data flows in this model. Phase 1 unifies the writers; Phase 2 prioritizes the IDs; Phase 3 bounds the Map. The Map persists.

The trap: **the Map is itself an artifact of an in-memory frontend cache library that didn't expect SQLite under it.** If SQLite is the source of truth and is fast (which OPFS makes it), the Map is a copy of a copy. We're routing reactivity through the most fragile of the three layers (the JS object graph) instead of the most durable (the database).

Look at what each layer actually offers:

| Layer | Persists across reload | Reactive natively | Multi-tab consistent | Agent-queryable | Memory-bounded |
|---|---|---|---|---|---|
| SQLite (OPFS) | ✅ | Triggers + change-feed possible | ✅ via SharedWorker leader | ✅ (it's SQL) | ✅ |
| TanStack DB Map | ❌ | ✅ (this is what it does) | Indirectly via SharedWorker writes | ❌ (it's React-shaped) | ❌ (cardinality-bound) |
| React component state | ❌ | ✅ | ❌ | ❌ | Bounded by viewport |

The Map's only real value-add over SQLite is "react components rerender when it changes." That's a thin slice of value, and it's not an indispensable one — SQLite triggers + a SharedWorker delta stream gets us the same reactive surface with all the SQLite advantages. Linear figured this out years ago. Zero is built around it. We're building around the Map because TanStack DB ships with one.

---

## The fundamental theorem

A grid is a materialized view of a query. The query is roughly:

```sql
SELECT id, col_1, col_2, ..., resolved_target_name(rel_col_1), ...
FROM Entity
WHERE filter(...)
ORDER BY sort_key
LIMIT viewport_size OFFSET viewport_start
```

The system's job is to keep this view fresh against three independent change sources:

1. **Server-pushed changes** — realtime sync from authoritative storage
2. **Local writes** — optimistic mutations from this tab or another
3. **Query-shape mutations** — user scrolling, sorting, filtering, opening/closing relationship columns

A "query" in this frame is not a function call — it's a **durable subscription artifact**. It has identity, lifecycle, and intermediate state (its current result set, plus the metadata to maintain it incrementally).

This is the same problem researchers have been working for thirty years under the names: *materialized view maintenance*, *differential dataflow*, *incremental view maintenance (IVM)*. There's literature, formalisms, and shipping systems (Materialize, Noria, Differential Dataflow / Timely Dataflow). What's new is doing it in a browser tab over OPFS SQLite for human + agent co-editing.

Once we adopt this frame, every Part I cliff becomes a special case:

| Part I cliff | What it really is |
|---|---|
| Eager-mode 50k-row collection | Materialized view that doesn't know its viewport bound |
| Cell renderer fallback to UUID | Materialized view's projection is incomplete (didn't include the JOIN) |
| Viewport-unaware bulk fetch | Query maintenance ignoring locality of access |
| Two sync paths into one Map | Two writers updating one materialized view (the textbook IVM consistency violation) |
| JSON parse under mutation | Storing un-projected raw rows instead of projected view rows |
| 5k Rel_* cap | View maintenance that loads rather than streams |

This isn't a coincidence. It's that we built half of an IVM system without naming it.

---

## The primitive that should exist: incremental queries as durable artifacts

What I'd actually build, named:

### 1. `Query` — a first-class durable object

```ts
interface Query<Row> {
  id: string                              // stable, hash of query shape
  shape: QueryShape                       // entity, filters, sort, projection, join expansions
  cursor: { start: number; size: number } // viewport bound, mutable
  state: 'cold' | 'warming' | 'fresh' | 'stale'

  // Subscription surface
  rows(): AsyncIterable<Row[]>            // cursor over current result set
  delta(): AsyncIterable<Delta<Row>>      // incremental change stream
  count(): Promise<number>                // total matching rows (not just viewport)

  // Mutation
  patch(shape: Partial<QueryShape>): void // user scrolls/filters/sorts → mutate in place
  close(): void                           // unregister, GC the materialized state

  // Introspection (the agentic angle)
  schema(): QuerySchema                   // type, joins, projection — agent-readable
  explain(): QueryPlan                    // what will run, what's cached
}
```

A `Query` is owned by the SharedWorker. Its result is a SQL view (logical or materialized) maintained against the local SQLite. The grid binds to one `Query` per active grid view. The agent binds to its own `Query` for the same data. Both consume the same delta stream.

### 2. `Projection` — the JOIN happens in SQL, not in cell renderers

The query's `projection` is part of the shape. For a column that resolves a relationship target name, the projection includes the JOIN:

```ts
{
  shape: {
    entity: 'RFI',
    projection: [
      'id', 'title', 'status',
      { join: 'rel__r_f_i__project_belongs_tos', display: 'name' }, // ← resolved at SQL time
    ],
    filter: ...,
    sort: ...,
  }
}
```

The SharedWorker compiles this to a SQL view that joins through the dual-write inline IDs (F') against the target entity's table, projecting `name` into a column on the result. **The cell renderer never calls `coll.get(id)`. It receives `row.project_belongs_to_name` directly from the result set.**

Memory characteristics shift:

- **Before**: viewport rows in JS + full target collection in JS. O(viewport + target_cardinality).
- **After**: viewport rows with names already projected in JS. SQLite handles the join. O(viewport).

At 50k rows × 8 relationship columns where each target is also 50k rows, that's ~400MB → ~1MB of JS heap. A 400× memory reduction is not a micro-optimization. It's the difference between "scales to enterprise" and "OOMs at three customers."

### 3. `Delta<Row>` — the only reactive primitive React components and agents need

```ts
type Delta<Row> =
  | { kind: 'replace'; rows: Row[] }              // full refresh (initial load, sort change)
  | { kind: 'insert'; rows: Row[]; at: number }   // new rows inserted at index
  | { kind: 'remove'; ids: string[] }             // rows no longer in result set
  | { kind: 'update'; row: Row; index: number }   // value change for an existing row
```

The grid's `useQuery(query)` hook subscribes to `query.delta()` and applies updates incrementally to its render state. No more "the whole collection changed, rerender everything." Real per-row, per-cell granularity, driven by what *actually* changed at the SQL level.

The agent's `agent.subscribe(query)` does the same. Same delta stream, same semantics, same consistency. The agent might apply different presentation logic (text summary instead of grid), but the data substrate is identical.

This is the **agent-uniform reactivity** angle. Right now `useLiveQuery` is React-shaped — an agent can't subscribe to it without writing React. With `Delta<Row>` as the contract, a Claude tool could `await query.delta().next()` as naturally as a React component does.

---

## Why this is the agentic substrate, not just a perf fix

Baseplane's tagline is AI-native enterprise software. That isn't marketing — it's a constraint that should shape every layer of the data plane.

### What an AI agent needs from the local data layer

1. **Read what the user sees.** When the user is staring at a filtered, sorted RFI grid, the agent must be able to ask "what's on screen?" and get the same data the user sees, projected the same way, with the same locale and resolved names. Today it can't — `useLiveQuery` is a React hook and the projected names live in cell renderer closures.

2. **Subscribe like a component does.** When the user makes a change, the agent watching that grid should observe the delta in real time, not poll. Today no such surface exists.

3. **Write under the same conflict model.** When the agent suggests a change to a row, that change must reconcile against concurrent server pushes the same way a user's optimistic write does. Today the agent goes through a separate API path with different semantics.

4. **Reason about schema, not just rows.** "What columns does this view have?" "Which are computed?" "Which are user-editable?" The agent needs to ask these. Today it has to read code or ask the user.

5. **Propose, not commit.** The agent should be able to compute "if I made these 50 changes, what would the grid look like?" and present a diff before committing. This requires the data layer to support speculative materialized views — branch a query, apply tentative writes, render the diff, accept or reject.

`Query` as a first-class artifact gives all five for free. `useLiveQuery` over an in-memory Map gives none of them.

### The strategic kicker

If we get this right, **the local SQLite is not just a cache — it's the agent's working memory.** Every grid the user opens populates SQLite with structured rows the agent can immediately reason over. Every relationship the dual-write encodes is a graph edge the agent can traverse without round-tripping to the server. The local data plane becomes the *agent context window for enterprise data*.

This is what "AI-native" actually means as a system property, not a feature. Not "we have a chat panel." Not "we sprinkled LLM calls into our APIs." It means **the data substrate was designed from day one to be co-readable and co-writable by humans and agents, with shared consistency, shared reactivity, and shared schema awareness.** Linear hasn't built this. Zero hasn't. Notion hasn't. There's no existing local-first stack that has. We could.

---

## What we don't see in Part I that becomes visible here

Part I named five cliffs. The bigger frame surfaces five more, equally real, equally unaddressed:

1. **Write throughput, not read throughput, is the eventual wall.** A 50k row grid with bulk edits, optimistic UI, and server reconciliation generates writes orders of magnitude more than reads. CR-SQLite + sequence numbers (we have the sequence numbers!) is a possible substrate, but we haven't engaged with it.

2. **Multi-tab consistency under speculative writes.** Tab A writes optimistically; Tab B watches the same query; Tab A's write rolls back on server rejection. The Tab B subscriber must see the rollback as a delta. No primitive for this today.

3. **Schema migration as a sync event.** When DataForge schemas change (new fields, removed fields, computed field formulae update), every active query in every tab needs to invalidate. Today this barely works — it relies on full reload. As an IVM problem it's a known one (view definitions are first-class, version-tracked, hot-swappable).

4. **Cross-query result sharing.** Two grids on the same page, both filtering RFI, share 90% of their data. Today they each maintain a separate collection. With `Query` as a durable artifact, the SharedWorker can de-duplicate underlying row maintenance even if their projections differ. Big memory win at a different cardinality dimension.

5. **Query result persistence across reloads.** A user reopens a tab; their last grid state could rehydrate from a persisted `Query` artifact in OPFS in <100ms instead of bootstrapping from scratch. The grid's "what was I looking at" should be a query.id, not a URL parameter.

---

## The honest "is this a 6-12 month bet" assessment

It is.

**Why the time horizon is real:**
- IVM is hard. Differential dataflow took the research community 15 years to make practical. We don't have to invent it, but we have to embed it in a browser SharedWorker thoughtfully.
- The `Query` primitive needs to be designed once and used everywhere. Migrating from `useEntityCollection` + `useLiveQuery` to `useQuery` is a codebase-wide refactor.
- The agent-uniform binding requires Chip's tools to evolve in tandem, with shared schemas.
- We need real benchmarks against real data shapes, not synthetic tests.

**Why it's worth the bet:**
- It's the actual moat. Linear's moat is their sync engine. Notion's moat used to be their data model. Baseplane's moat could be the agentic local-first substrate — and it would be hard to copy because it's an architectural commitment, not a feature.
- It dissolves Part I's cliffs structurally instead of mitigating them tactically. The "5k Rel_* cap" disappears. The "viewport-aware fetch" becomes a property of how queries maintain themselves. The "in-memory map vs SQLite drift" disappears because there's only one truth.
- It compounds. Every new entity, every new relationship, every new cell type benefits from the same primitive. Part I's wins are local; this one's wins are cumulative.

**The order of operations:**

1. **Ship Part I, Phase 1** (collapse to one sync axis) — 1-2 weeks. This is unblocked, closes GH#2801, doesn't preclude Part II.
2. **Spike `Query` over SQLite views** — 1 week. Build a single query end-to-end (RFI grid with one relationship column), measure memory and latency against current architecture. Either the numbers justify the bet or they don't.
3. **If the spike validates, write the spec** — 1 week. Real spec, with phased migration plan, deprecation timeline for `useLiveQuery` per surface, agent-tool integration plan.
4. **Build the primitive** — 2-3 months for a real production version, including agent-uniform binding.
5. **Migrate surfaces** — 2-4 months, surface by surface. Grids first, then detail views, then non-grid lists.

Total: 6-9 months to substantively complete the migration. We can keep shipping Part I-style fixes during that window without conflict.

**What to NOT do:**
- Don't try to do this incrementally inside the TanStack DB collection abstraction. It's the wrong shape; you'd end up with both abstractions in the codebase forever.
- Don't ship a partial `Query` that doesn't include agent binding. The agent uniformity is the strategic differentiator; without it this is just "TanStack DB but better," which is not worth nine months.
- Don't generalize prematurely. Build the primitive against grid use cases first. Detail-view, board-view, list-view migrate later. Premature generalization tanks IVM systems.

---

## The closing thought

Part I asked: how do we make the existing architecture not OOM at 50k rows? Right question, tactical answer.

Part II asks: what is the substrate for human + agent co-editing of enterprise structured data, where the local DB is canonical, where reactivity is incremental, where queries are first-class durable objects, and where the difference between a React component and an AI agent subscribing to data is one line of binding code?

The honest answer to the second question is: **it doesn't exist yet, anywhere.** Linear is closest, but theirs isn't agent-uniform and isn't open. Zero is closest in spirit, but it's an alpha library aimed at general apps, not enterprise schema systems with relationship graphs and computed fields.

We're three years into this codebase and we have all the substrate already — OPFS SQLite, SharedWorker, sequence numbers, dual-write inline IDs, priority lanes, multi-tab leader election, an entity schema system, an agent (Chip), an event bus. The pieces are sitting there. The bet is to compose them into the right primitive instead of into a faster collection.

That's the big-brain frame. It's bigger than the issue, bigger than the grid, bigger than this quarter. It's also the thing that — if we get it right — makes Baseplane the first piece of enterprise software where the local data layer was designed for an AI-native world from the substrate up.

That feels worth six months.
