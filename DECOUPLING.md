# Decoupling VibeGrid from Baseplane

**Status as extracted (2026-09-07, from `baseplane-ai/baseplane@8e12085d5`).**

This repo is a faithful lift. No code was modified during extraction — only moved — so
every file still diffs cleanly against its Baseplane original. This document is the map
from "lifted" to "builds and runs on its own."

Upstream analysis this builds on: **GH#3293** (engine decomposition / target
architecture) and **GH#3291** (gp-grid parity matrix and port plan). Their full bodies
are reproduced in [`docs/upstream/`](docs/upstream/) because the issues live in a repo
that is shutting down.

---

## 1. The headline: the coupling is smaller than it looks

Measured over the 205 non-test source files in `src/` (65,770 LOC):

| Tier | Files | LOC | What it couples to | Cost to break |
|---|---:|---:|---|---|
| **Clean** | 174 | 46,089 | Nothing but the UI kit, `getLogger`, and `cn` | **Zero.** Swap 3 shims (§3) |
| **A — nominal** | 11 | 7,040 | *Only* `IStore` (a 2-method interface) and `DisposerManager` | **~1 hour.** Both files are already in `reference/host/`; 97 LOC combined |
| **B — real** | 20 | 12,641 | Baseplane's data layer, CommandBus, root store, entity schemas | **The actual work.** §4 |

**85% of the grid by file count, 70% by LOC, has no Baseplane runtime coupling at all.**
The genuine blocker is 20 files. Do not scope this as an 89k-LOC extraction; scope it as
a 12.6k-LOC seam-cutting job around a grid that is already mostly portable.

---

## 2. Known-broken on arrival

Fix these first — they are pre-existing, not extraction damage:

- **`e2e/` does not resolve.** Every spec imports `../setup/helpers` / `../../setup/helpers`,
  which never existed. The suite was untracked in Baseplane's working tree and was
  mid-rewrite when the project stopped. `e2e/helpers/` (the real helper barrel) was copied
  in alongside it — most likely the imports should point there. Nothing has run this suite
  recently; treat green as unproven.
- **`src/index.ts` is stale.** Several export blocks are commented out with notes like
  "files don't exist" and "Hook exports removed." The real public surface is whatever
  `reference/consumers/` actually imports — that is the API worth preserving, and it is
  roughly one third of what `VibeGridProps` declares. GH#3291 found the other two thirds
  have zero production users.
- **`src/overlays/EditingOverlay.tsx:3` imports `@tanstack/react-query` directly**, which
  violated Baseplane's own hard rule. It only wants `QueryClientProvider` to re-parent a
  portal. When the data layer is replaced (§4.1) this import should disappear entirely.
- **`selection/iterateSelectedRowIds.ts` is a no-op** for the "select all + exclusions"
  marker mode (upstream GH#2804). GH#3291 recommends dropping that mode rather than
  finishing it.

---

## 3. The free win: three shims (do this first)

These three imports account for the entire "coupling" of 174 files. Replace them and
85% of the grid compiles standalone.

| Baseplane import | Uses | Replacement |
|---|---:|---|
| `@/shared/lib/logging` → `getLogger` | 106 | Vendored at `reference/host/logging/` (472 LOC, LogTape-based). Either keep it or collapse to a 20-line `getLogger` returning a leveled console wrapper. It is a leaf — it imports nothing from Baseplane. |
| `@/shared/lib/utils` → `cn` | 13 | The standard `clsx` + `tailwind-merge` two-liner. `reference/host/utils.ts` |
| `@/shared/components/ui/*` | ~80 | 20 distinct shadcn/ui components (`button` ×19, `input` ×8, `popover` ×6, `select`, `picker`, `dropdown-menu` ×5 each, …). All MIT, all regenerable via `shadcn add`. **Exception: `ui/picker`** is a Baseplane-specific relationship picker, not stock shadcn — it needs a real port (see §4.4). |

Then Tier A: vendor `reference/host/store-types.ts` (`IStore` — an `init()`/`dispose()`
pair) and `reference/host/disposer.ts` (`DisposerManager`, 58 LOC) into `src/`. That
clears 11 more files and 7,040 LOC, including four of the five god-stores.

**After §3: 185 of 205 files compile.** Elapsed effort: hours, not weeks.

---

## 4. The real work: 20 files, four seams

Full symbol-level inventory, so you can see exactly what each seam owes:

### 4.1 Data seam — the big one

**Files:** `hooks/useVibeGridData.ts` (624), `hooks/useGridRelationshipProjection.ts` (130),
`hooks/useRelationshipTargetCollections.tsx` (333), `slots/renderers/badge-list.ts` (321),
`selection/iterateSelectedRowIds.ts` (122), plus `bridge/*`.

**Imports:** `shared/data/hooks/useEntityGrid` (`useEntityGrid`, `ViewportSpec`,
`RelationshipSearchClause`), `shared/data/hooks/useEntityMutation` (`mutationApi`),
`shared/data/hooks/useEntityList`, `shared/data/hooks/useRelationshipTargetRecords`,
`shared/data/query/*` (`RawRow`, `Query`, `projectRow`, `buildIncludedFromTargets`,
`applyQueryDeltaDedup`, `isWarmSyncDisabled`), `shared/data/db/sqlite/client`
(`getSQLiteClient`), `shared/data/db/collections/registry`, `@baseplane/shared-types`
(`SortClause`, `WherePredicate`).

**What to do:** define one `GridDataSource` interface and put every one of the above
behind it. GH#3291 Cluster 1 already specifies the contract in detail — viewport-cursor
windowed refetch (overscan 50 / 50ms debounce / containment dedup), `serverTotalRows` +
`hasActiveFilter`, `table_change → debounced window refetch`, clobber-then-shimmer. That
spec was written for a gp-grid rebuild but describes exactly the seam a standalone
VibeGrid needs.

`bridge/` holds the reusable half already: `filterExpressionToWherePredicate`,
search-pushdown composition, and the sort/filter conversion functions are pure and carry
over verbatim. `bridge/use-server-grid-rows/` is the Baseplane-specific half.

⚠ **Do not port the substrate branches.** Upstream GH#3283 was retiring the wa-sqlite
substrate; GH#3293 measured that most of `TableCoreStore`'s bulk is substrate/sparse-row
code that was scheduled for deletion. Anything touching `getSQLiteClient`,
`isWarmSyncDisabled`, sparse-row guards, delta reconciliation, or `sparse-skeleton`
should be **deleted, not adapted** — that deletion is the single cheapest LOC win
available and it was already sanctioned upstream.

### 4.2 Mutation seam — CommandBus

**Files:** `VibeGrid.tsx` (1628), `stores/EditingStore.ts` (1354),
`stores/KanbanViewStore.ts` (618), `stores/GanttViewStore.ts` (1664).

**Imports:** `systems/commands/CommandBus`, and three command classes —
`UpdateEntityRecordCommand`, `BatchUpdateEntityRecordsCommand` (+ `FieldUpdate`),
`SubstrateUpdateCommand`.

**What to do:** the grid needs *undoable, batchable cell writes*, not Baseplane's bus.
Narrow to a `GridMutationSink { update(cell, value); updateBatch(FieldUpdate[]); }` plus
an undo hook. `SubstrateUpdateCommand` dies with §4.1. Note the host contract that must
survive: undo registration goes through `[data-surface]` + a `FocusAwareUndoRouter`, so
whatever replaces it must still let the host own undo scope.

### 4.3 Host-context seam — root store

**Files:** `VibeGrid.tsx`, `stores/context.tsx` (440), `overlays/EditingOverlay.tsx` (487),
`components/FilterRelationshipValue.tsx` (360), `hooks/useVibeGridData.ts`,
`overlays/editors/relationship-utils.ts`, `stores/TableCoreStore.ts` (2641).

**Imports:** `StoreProvider`, `rootStore`, `useOrganization`, `useSchemaRegistry`,
`useCommandBus`, `useUndoRouter`, `getActiveOrganizationId`.

**What to do:** this is the smallest seam and the highest leverage. Collapse all seven
into a single `VibeGridHostContext` React provider the embedder supplies:
`{ schemaRegistry, tenantId, mutationSink, undoRouter, dataSource }`. `useOrganization` /
`getActiveOrganizationId` are pure multi-tenancy leakage — the grid only needs an opaque
scope key it passes back to the data source.

### 4.4 Schema / field-type seam

**Files:** `slots/slot-initialization.ts` (243), `field-types/types.ts` (211),
`components/ViewPicker.tsx` (709), `components/VibeGridXColumnVisibilityPure.tsx` (426),
`hooks/useVibeGridHierarchy.ts` (131), `overlays/editors/PickerEntityEditor.tsx` (113),
`stores/GanttViewStore.ts`.

**Imports:** `shared/types/field-metadata`, `shared/types/dataforge` (`DependencyMetadata`),
`shared/data/orpc/client` (`orpcClient`, in 5 files), `shared/data/orpc/domains/views-fetch`,
`shared/data/stores/ViewsStore`, and — a genuine layering violation —
`@/features/entities/schemas/project-field-types` and
`.../subcontractor-assignment-field-types`, i.e. **the grid engine importing two
construction-domain field-type registrations**.

**What to do:**
- Invert `slot-initialization.ts`. Domain field types must *register into* the grid, never
  be imported by it. This is a small change with an outsized payoff: it is the last thing
  tying the engine to a vertical.
- `orpcClient` in 5 files is saved-views + hierarchy + entity-picker RPC. Route it through
  the same host context as §4.3 — the grid should describe *what* it wants, not *how* to
  fetch it.
- `ViewPicker` + `ViewsStore` (saved views CRUD) is arguably not grid at all. Consider
  hoisting it out to the host and leaving the grid a controlled `view` prop.

---

## 5. The deeper architectural item (optional, but it's the real prize)

GH#3293's central finding, and the reason the grid resists decomposition:

> **VibeGrid has no instruction boundary.** Stores and the renderer are coupled
> bidirectionally — stores signal the renderer through version counters
> (`dataVersion`/`configVersion`/`structureVersion` on `TableCoreStore`) and MobX
> reactions, and the renderer reaches back into stores to read.

The reference decomposition (gp-grid's `GridCore`) instead emits a stream of ~24
instruction kinds — slot create/assign/move/destroy, `setContentSize`, `updateHeader`,
`setSelectionRange`, `startEdit`, fill — that a dumb renderer applies. Introducing that
seam is what makes the engine testable without a DOM, swappable, and finally splittable
along the god-store lines (`TableCoreStore` 2641, `GanttViewStore` 1664,
`InteractionStore` 1660, `VisualStateStore` 1491, `EditingStore` 1354).

GH#3293's explicit recommendation, which still holds outside Baseplane:

1. **Do** introduce the instruction boundary and split the god-stores. Low-risk,
   incremental, shippable store-by-store, zero consumer churn.
2. **Do not** rewrite the ~30k-LOC engine for elegance — slot pooling, scroll
   virtualization, input/gesture unification, selection and fill mechanics all work at
   200k rows today. Re-solving them cleanly is maximum effort for zero leverage.

The evidence for that split: the bug stream that motivated the analysis
(GH#3105/#3111/#3112 and the queue wedges) was **substrate/data coupling, not engine**.
Which is the same conclusion §4.1 reaches from a different direction — the data layer is
where both the coupling and the bugs live.

---

## 6. Suggested order

| Phase | Work | Unblocks |
|---|---|---|
| **0** | Repo scaffolding: `package.json`, `tsconfig`, Vite, Tailwind, path aliases | anything building |
| **1** | §3 — three shims + vendor `IStore`/`DisposerManager` | 185/205 files compile |
| **2** | Delete every substrate/sparse-row branch (§4.1 ⚠) | shrinks the problem before solving it |
| **3** | §4.3 host context — the smallest seam, and §4.1/§4.2/§4.4 all land through it | the shape of the whole thing |
| **4** | §4.1 `GridDataSource` + §4.2 `GridMutationSink` | standalone build |
| **5** | §4.4 invert field-type registration; hoist saved views | engine free of any vertical |
| **6** | Fix `e2e/` imports; get the smoke suite green against a local harness | a safety net, finally |
| **7** | §5 instruction boundary + god-store split | the architecture the grid deserves |

Phases 1–2 are mechanical and could be done in a sitting. Phase 3 is the one real design
decision. Phases 4–6 are the bulk. Phase 7 is open-ended and optional — the grid ships
without it.

---

## 7. Things upstream decided to drop — don't port them

From GH#3291's drop list, still sound advice:

- "Select all + exclusions" marker mode (never finished; `iterateSelectedRowIds` no-ops)
- Selection-overlay DOM pooling and marching-ants clipboard visuals (cosmetic)
- Group-boundary fill semantics and group-aware row re-parenting (rework with grouping)
- The row-expansion subsystem (`RowExpansionProcessor`, `ExpandedContentPortals`) — fully
  built, **zero live consumers**
- Sparse-skeleton substrate loading (dies with §4.1)
- Group-by pushdown (never shipped; the pushdown spike was a measured NO-GO at 2.2–2.5s —
  grouping stays client-side)
- The regex markdown "preview" — broken by design, and separately an XSS sink via
  unsanitized `innerHTML` + attacker-controlled `href` (upstream GH#3336, **never fixed**).
  **Delete it or replace it with a real sanitizing renderer before this grid renders any
  untrusted content.**
- Hardcoded hex badge colors across 14 renderer files — dark-mode-blind; redo with tokens

Also never existed, so don't let the docs imply otherwise: column pinning/freeze, density
toggle, per-column filter buttons, aggregation footer, column auto-size, person/avatar
cells, discrete-page pagination.

---

## 8. Contracts to preserve verbatim

Whatever else changes, these are load-bearing for the agent tooling, the smoke suite, and
the consumers:

- `data-affordance` / `data-action` two-tier attribute contract (`src/affordances/`)
- `aria-rowindex` (+2 convention) / `aria-colindex` / label format
- `data-testid="cell-{rowId}-{colId}"`
- `[data-surface]` undo registration
- `.vibegridx-viewport.scrollToColumn(columnId)`
- a `window.__vibegrid_debug` equivalent (the `?debug=vibegrid` hook)
- **Pointer events, not click.** The grid listens on `pointerdown`/`pointerup` with
  `setPointerCapture()`. Synthetic `.click()` does not reach cell affordances — every
  automation harness driving this grid must dispatch the full
  `pointerdown → mousedown → pointerup → mouseup → click` sequence.

The CSS class prefix is `vibegridx-`, not `vibegrid-` — 180 classes across the two
stylesheets, with exactly one stray (`.vibegrid-skeleton-bar`, which dies with the
sparse-skeleton removal in §4.1). Renaming the prefix breaks the e2e suite and the
consumer overrides; leave it alone or do it in one sweep.
