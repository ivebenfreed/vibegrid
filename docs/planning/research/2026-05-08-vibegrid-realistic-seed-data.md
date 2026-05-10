# VIbeGrid Realistic Seed Data — Research Findings

**Date:** 2026-05-08
**Author:** Ben (research mode RE-185c-0508)
**Type:** Feature research / feasibility study
**Status:** Complete — ready to spec

## Problem statement

VIbeGrid's documented capabilities (substrate-backed 100k+ rows, virtualization, kanban, gantt, grouping, saved view live counts, sort/filter pushdown, computed fields, relationship cells) cannot be smoke-tested today against the WideCorp org because the data is too thin and stale. We need synthetic data at a scale that exercises every documented behavior — including the volume-sensitive ones.

User goal: "100s of thousands of records in WideCorp ... realistic smoke test ... check all the behaviors in the docs."

## Current state — WideCorp is sparse and stale

WideCorp (slug `wide-corp`, id `01920000-1000-7000-8000-000000000001`) has **667 entity records and 440 relationships across 15 entity types**. Snapshot from staging:

| Entity type | Rows | Date span | Notes |
|---|---|---|---|
| Contact | 174 | 2026-01 → 2026-04 | Densest |
| Company | 49 | 2026-01 → 2026-04 | OK |
| WorkTask | 41 | 2025-09 → 2026-03 | Sparse |
| Vendor | 19 | 2026-01 → 2026-03 | Sparse |
| Collection | 12 | 2025-09-11 only | Demo-batch (single day) |
| Document | 12 | mixed | OK shape, low count |
| ProjectMilestone | 3 | 2025-10 → 2025-11 | Empty |
| Invoice | 3 | — | Effectively empty |
| Project | 2 | — | Effectively empty |
| BuildProject, ProjectPortfolio, PaymentLine, Notification, RealTestV2, QuickFieldTest | 1–7 each | mostly demo | Empty / test debris |

**Implications:**
- Virtualization, grouping, kanban, gantt, large-sort, large-filter, saved-view live counts, viewport scroll-jump perf, dual-layer cell upgrade — **none are exercised** today.
- The org's identity drifts toward consultancy/agency (Contact + Company + WorkTask + Vendor + Invoice), not construction. Construction-specific scaffolding (RFIs, COIs, submittals, daily logs, punch list) lives in **DEB Construction**, not WideCorp. The seed plan must respect that — we expand WideCorp along its existing consultancy axis, not shoehorn GC entities in.

## Architectural constraints that shape the plan

### Storage shape: per-org dynamic tables

WideCorp entities are not in a single `entities` table. Each entity type gets a per-org table:
```
org_01920000_1000_7000_8000_000000000001_contact
org_01920000_1000_7000_8000_000000000001_worktask
…
```
Columns: `id (uuid), organization_id, name, <typed fields>, is_deleted, status, created_at, updated_at` — plus JSONB columns for complex/list fields.

Relationships are stored in a single shared `entity_records` table with `entity_type_id = 'Rel_<Source>_<Target>_<semantic>'` and a JSON payload pointing at both endpoints.

This means a generic `INSERT INTO entities` script is wrong. Bulk insert must be **table-per-type, batched per type**.

### VIbeGrid substrate vs. legacy fallback (GH#2804, GH#2806)

The 100k+ row claim depends on the substrate (cursor-bounded SQLite) being on. With substrate off, a 50k row grid takes ~500MB heap and isn't usable. With substrate on:

| Metric | Target |
|---|---|
| Row capacity | 100k+ |
| JS heap @ 100k | <50MB |
| Sort/filter latency (first 100, **promoted column**) | <200ms |
| Sort/filter on **unpromoted text column** | json_extract fallback — slower |
| Scroll frame time | <16ms (60fps) |
| Shell cell creation | <0.1ms |
| Selection delta | O(delta), not O(viewport) |

Two known regressions to design around:
- **Group-by is disabled for substrate-owned entities** (GH#2804 B12). If we want to demonstrate the grouping behaviors documented in `docs/primitives/vibegrid/data-controls.md`, we need either (a) substrate-off entity types in the seed, or (b) acceptance that grouping demos run against smaller fallback datasets.
- **Undo/redo broken on substrate writes** — minor but worth noting in the smoke checklist.

### Side effects on bulk insert

| Side effect | Behavior on bulk insert | Mitigation |
|---|---|---|
| Embedding generation (`populate-entity-embeddings.ts`) | Async; queues AI calls | Insert with `embedding: null`, let backfill catch up offline. Optionally pause the job during seed. |
| Workflow triggers | None observed on the consultancy entity types | Verify `dataforge_relationship_fields` has no INSERT-trigger configs for the targeted types |
| Notifications / event bus | No references in existing seed scripts | Likely safe; spot-check after a small batch |
| Computed fields | Stored or derived per `.claude/rules/computed-fields.md` | For stored values, write `null` and let recomputation pass run after seed. For derived, no action. |
| RLS policies | Active on every per-org table | Set `app.current_organization_id` GUC before bulk insert, or use direct connection that bypasses RLS via service role |

### Throughput

| Method | Rate |
|---|---|
| Current Kysely one-row-at-a-time | ~50 rows/sec |
| `postgres.js` multi-row INSERT (1k/batch) | ~5,000 rows/sec |
| `postgres.js` (5k/batch) | ~10,000 rows/sec |
| `COPY FROM` (CSV) | 50k+ rows/sec |

**500k entities → ~100s with batched INSERT, ~10s with COPY.** Not the bottleneck. Index maintenance and any GENERATED column recomputation will dominate at the upper end.

## Realistic distribution — 5-year consultancy at WideCorp scale

WideCorp's existing schemas read as a 50–200 person consulting / professional services firm. A 5-year history with steady growth and ~30 active clients gives this realistic shape:

```
Companies (clients + prospects):       2,000   (40 active, 1,960 prospects/historical)
Contacts:                             20,000   (10 contacts/company avg)
Vendors:                                 800   (subcontractors, suppliers)
Projects (engagements):                3,000   (~600/yr × 5yr; mix of active/closed)
ProjectMilestones:                    25,000   (8/project avg)
WorkTasks:                            80,000   (active work, with status/priority/owner)
Documents:                            40,000   (proposals, deliverables, contracts)
Collections (folders):                 1,500
Invoices:                             15,000   (5/project avg, monthly + final)
PaymentLines:                         60,000   (4 lines/invoice avg)
TimeEntries (NEW or use WorkTask)    300,000   (200/employee × 50 employees × 30 days proxy)
ProjectPortfolio:                         50

Relationships:                       ~500,000   (Contact↔Company, Project↔Client, Task↔Project, Task↔Owner, Invoice↔Project, etc.)

GRAND TOTAL:                       ~1,050,000 rows across the org
```

**Volume hot spots** (where the perf claims actually get tested):
- TimeEntries / WorkTasks at 80k–300k → virtualization, dual-layer rendering, sort on date/amount
- WorkTasks → kanban (status field), gantt (start_date/end_date), grouping (by Project, by Owner)
- Invoices → currency rendering, computed totals (PaymentLines rollup), saved-view live counts
- Contacts → search debounce, large filter, multi-select, email/phone/url cell types

If 1M is too aggressive for first cut, a "minimum viable smoke" is **350k entities** (drop time entries and trim work tasks) — still hits every volume-sensitive behavior.

## Behavior coverage matrix (condensed)

The full catalog is ~150 behaviors across 11 categories. The seed must cover these volume-sensitive ones explicitly:

| Behavior class | Required seed shape |
|---|---|
| Virtual scroll, dual-layer cells | ≥10k rows in a single grid (use WorkTasks or TimeEntries) |
| Sort/filter on promoted column | Numeric or date column with high cardinality, ≥10k rows |
| Global search debounce | Searchable name/description with 5–30% match ratio at scale |
| Grouping (single + multi-level) | Categorical fields with 5–10 distinct values; ≥500 rows; **note substrate disables this** |
| Kanban view | `status` field with 4–8 enum values, balanced distribution, ≥200 cards |
| Gantt view | `start_date` + `end_date` + `predecessor` ref; 200–500 tasks; mixed dependency types |
| Saved view live counts | ≥10 saved views per entity type, counts updated by liveQuery |
| Computed/rollup fields | At least one rollup per parent (Invoice→PaymentLines sum, Project→WorkTask count) |
| Relationship cell | 30% of cells have null relationships, 70% point to varied entities |
| File/image cells | 5–10% of records have file refs; can be fake R2 keys (don't need real blobs for grid render) |
| Permissions per role | Mix of records owned by different users so member role sees mixed `data-affordance` |
| ARIA / a11y | Free — tested by virtue of having data |
| Real-time updates | Smoke-tested by editing a cell with second tab open; not a seed concern |

For renderer coverage (text/number/date/boolean/select/multi-select/email/url/phone/currency/color/rating/markdown/file/image/user-ref/entity-ref), each entity type must use at least 8–12 different field types. Existing schemas already cover most of this — add what's missing as part of the seed.

## Existing tooling we can extend

- `apps/web/scripts/seed-bid-mail-dataforge.ts` (800 lines) — canonical pattern. Uses `postgres.js`, direct SQL INSERT, handles per-org tables, creates `entity_records` rows for relationships. **Reuse the helpers; replace the data shaping.**
- `apps/web/scripts/seed-realistic-data.ts` (640 lines) — has hand-coded business templates for WideCorp. Good source of name pools and structural patterns.
- `apps/web/scripts/sophisticated-widecorp-seeder.js` — full consultancy simulator with timesheets, projects, skills. Closest existing model to what we want.
- `apps/web/src/server/domain/shared/dataforge-provisioner.ts` — `createEntitySchema`, `getEntityDetails`. Use to ensure schemas have all field types we need before seeding.

No `@faker-js/faker` in the repo. We can add it (~1.5KB gzipped) for richer synthetic content, or stay with parameterized templates. **Recommendation:** add faker — names/emails/companies/addresses are the long tail and faker pays for itself fast.

## Risks and open questions

1. **Neon storage.** 1M rows × ~1KB per row + indexes ≈ 2–3 GB. Free tier is 256 MB. Already on a paid Neon project, but worth confirming the staging branch doesn't run into quota.
2. **Index maintenance during seed.** With promoted-column GENERATED indexes (GH#2832 spike result pending), inserts pay an index-update cost. Drop+recreate the index after bulk insert if measurements show a significant penalty.
3. **L0 semantic generation queue.** A bulk insert of 1M will queue 1M embedding jobs. We should pause the AI worker queue before seeding, or seed with `embedding: null` and run a one-shot backfill afterwards (or accept the queue lag).
4. **Substrate group-by gap.** Grouping demos against substrate-owned entities won't work today (GH#2804 B12). The smoke plan must call this out — it's a "documented capability that current data + current code cannot demonstrate together."
5. **Production safety.** WideCorp is a *test* org but shares the staging DB with DEB and Baseplane. The seed must scope cleanly to WideCorp's per-org tables — no `entities`-table writes that could leak across orgs. The existing per-org-table architecture makes this almost automatic, but worth verifying the relationship rows in `entity_records` carry the `organization_id` filter.
6. **Idempotency.** Re-running the seeder should not double-insert. Either (a) use deterministic UUIDs derived from `(orgId, entity_type, sequence)` so re-runs are no-ops via `ON CONFLICT DO NOTHING`, or (b) wrap the seeder in a "wipe-then-seed" mode with explicit confirmation.

## Recommendation

Move into a planning issue with three phases of scope:

**Phase A — Seeder infrastructure (small, foundational)**
- Add `@faker-js/faker` dev dependency
- Create `apps/web/scripts/seed-vibegrid-scale-test.ts` reusing `seed-bid-mail-dataforge.ts` helpers
- Implement: per-org-table batched INSERT (5k/batch), entity_records relationship batch insert, RLS GUC setup, idempotent UUIDs
- Add `--count`, `--types`, `--clean` flags

**Phase B — Schema audit + extension**
- For each WideCorp entity type, audit field coverage against the renderer catalog
- Add missing field types where the existing schema is thin (e.g. add a `priority` enum, `due_date` datetime, `cost` currency, `attachments` files field)
- Add 1–2 computed/rollup fields per parent type (e.g. Project.task_count, Invoice.amount_paid)
- Create 8–12 saved views per major entity type to exercise the live-count behavior

**Phase C — Generate the data**
- Run the seeder in dry-run mode first (validate row counts, no inserts)
- Run against staging in a 350k baseline pass, measure VIbeGrid perf, capture before/after screenshots
- If baseline passes, run the full 1M expansion
- Pause the embedding queue around the run; backfill embeddings after

**Phase D — Smoke verification**
- Behavior checklist (~150 items, but smoke-test boils down to ~30 must-pass scenarios)
- Capture: cold-load TTFP, scroll FPS, sort latency on each promoted column, kanban drag, gantt render, group-by attempts (document the substrate gap), saved-view live count update
- Result is a markdown report with screenshots/numbers in `docs/planning/verification/`

**Issue type:** Feature (or Epic if the user wants Phase A/B/C/D as separate features).

## Sources

- `.claude/rules/vibegrid.md`, `.claude/rules/vibegrid-interactions.md`
- `docs/primitives/vibegrid.md`, `docs/primitives/vibegrid/{core,editing,clipboard,data-controls,column-interactions,selection,cross-cutting}.md`
- `apps/web/src/systems/vibegrid/README.md`
- `docs/planning/specs/2804-smart-100k-row-system.md` (perf targets)
- `docs/planning/specs/1437-perf-vibegrid-dual-layer-cell-rendering-.md` (frame-time budgets)
- `docs/planning/research/2026-05-03-2806-substrate-full-cutover.md` (substrate cutover)
- `docs/verticals/construction/personas.md` (volume realism baseline — DEB-flavored)
- `apps/web/scripts/seed-bid-mail-dataforge.ts` (canonical bulk-insert pattern)
- `apps/web/src/server/domain/shared/dataforge-provisioner.ts` (schema provisioning)
- Live staging DB query against `wide-corp` org for current inventory
