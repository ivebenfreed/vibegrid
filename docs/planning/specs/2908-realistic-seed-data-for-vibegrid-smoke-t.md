---
initiative: GH#2908-realistic-seed-data-for-vibegrid-smoke-t
type: feature
issue_type: feature
status: draft
priority: medium
roadmap: null
owner: null
github_issue: 2908
github_milestone: null
created: 2026-05-08
updated: 2026-05-08

phases:
  - id: p0
    name: "Schema reconciliation + seeder consolidation audit"
    tasks:
      - "Run a read-only audit script against staging that lists every WideCorp entity_schema (entity_name, table_name, archetype, is_system, is_platform, deleted), every per-org table that exists for WideCorp, the field set per schema (from business_metadata.fields), and current row counts. Output a markdown report at docs/planning/research/2026-05-08-widecorp-schema-audit.md."
      - "For each existing seeder (sophisticated-widecorp-seeder.js, seed-realistic-data.ts, cleanup-and-seed-org.ts, seed-gantt-phases.sh, enhance-and-seed-entities.sh) record: file path, what entity types it writes to, what connection it uses, last commit date, and whether the entity types match active schemas in staging."
      - "Decision: which canonical schema names are the single source of truth. Document in the audit report. Resolve any ambiguities (e.g., 'task' vs 'WorkTask', 'client' vs 'Client', 'project' vs 'BuildProject'). The seeder will write to whatever set the audit declares canonical."
      - "Soft-delete rule: schemas with deleted=true are EXCLUDED from the canonical list. If a soft-deleted schema is the closest match for an intended seed type (e.g., a deleted 'Project' but active 'BuildProject'), the audit picks the active one and notes the deprecation. Do NOT undelete schemas as part of this work."
      - "TimeEntry decision: confirm whether to (a) extend WorkTask volume to 300k for the virtualization wave, or (b) provision a new TimeEntry record schema. Default is (a) — simpler, no new schema. Switch to (b) only if WorkTask's domain semantics conflict with the volume profile."
      - "Promoted-column pre-flight: list any GENERATED VIRTUAL or expression-indexed columns on the per-org tables (or shared entity_records) for canonical schemas. For each, confirm the JSONB-path expression tolerates NULLs and missing fields the seeder will produce. Document any expression that requires a non-NULL field, so P2 can guarantee that field is always populated."
      - "Acceptance: audit report committed; canonical schema list locked; soft-delete rule applied; TimeEntry decision recorded; promoted-column pre-flight notes captured; b1 verified."
  - id: p1
    name: "Schema extension — renderer coverage and rollups"
    tasks:
      - "For each canonical record schema (Client, Company, Contact, Vendor, WorkTask, WorkItem, plus any others surfaced in P0), audit current field set against the renderer matrix: text, number, date, datetime, boolean, single-select, multi-select, email, url, phone, currency, color, rating, slider, markdown, file, image, user-reference, entity-reference. Identify gaps."
      - "Add missing field types to schemas via DataForge's normal SchemaService.addField path (no migrations needed — fields live in entity_schemas.business_metadata.fields). Aim for 8–12 field-type variations per major entity (Client, Company, Contact, WorkTask). Field choices must match the entity's domain semantics (e.g., WorkTask gets priority/due_date/estimated_hours; Contact gets phone/email/title)."
      - "Add 1–2 computed/rollup fields per parent type: WorkTask.subtask_count (count of child WorkTasks), Project.task_count (count of child WorkTasks via Rel_WorkTask_BuildProject_belongs_to), Invoice.amount_paid (sum of PaymentLine.amount via relationship). Use the existing computed-fields infrastructure (.claude/rules/computed-fields.md)."
      - "Create 8–12 saved views per major entity type that exercise filter / sort / group / column-set permutations. Saved views surface live counts in the sidebar — this is the core liveQuery smoke surface. Examples for WorkTask: 'My open tasks', 'High priority due this week', 'By owner', 'Blocked', 'Completed last 30 days', 'Group by project', 'Group by status', 'Sort by due date'."
      - "Acceptance: every renderer type appears in at least one schema's field set; computed fields verified by row spot-check; saved views show non-zero counts in the sidebar after Phase P3 seeding."
  - id: p2
    name: "Canonical seeder — postgres.js batched, idempotent, env-flexible"
    tasks:
      - "Add @faker-js/faker as a dev dependency to apps/web (used only by the seeder script, no runtime impact)."
      - "Write apps/web/scripts/seed-vibegrid-scale.ts as the new canonical WideCorp seeder. Pattern: postgres.js client (port the multi-row INSERT helper from seed-bid-mail-dataforge.ts lines 612–697), batch size 5000, transactions per batch, ON CONFLICT (id) DO NOTHING. Reads DATABASE_URL from .env, swaps :6432 → :5432 for direct connection. Honors --target=staging|preview|local (production target hard-errors)."
      - "RLS context handling: `entity_records` has RLS policy `entity_records_org_isolation` (single policy, applies to all commands). Before each batch, set the org context GUC: `SET LOCAL app.current_organization_id = '01920000-1000-7000-8000-000000000001'`. Use a transaction per batch so SET LOCAL scopes correctly. Do NOT use a service role bypass — keep RLS active so any policy misconfiguration surfaces during seeding rather than later. (Per the P0 audit, per-org tables are deprecated — all inserts go to entity_records.)"
      - "User pool for assignee/owner/reviewer fields: at startup, query `SELECT u.id, u.email, om.role FROM \"user\" u JOIN organization_members om ON u.id = om.user_id WHERE om.organization_id = '<wide-corp-id>'`. Cache the resulting array. Round-robin (with role-aware weighting where it makes sense — e.g., reviewer prefers admin/manager) when picking assignees. The 12 dev1/dev2/intern/etc. WideCorp test users from `.claude/rules/browser-testing-context.md` are the canonical pool. Hard-error if fewer than 4 users found."
      - "Relationship row shape (entity_records insert): port the exact column set and JSON payload from seed-bid-mail-dataforge.ts lines 729–776. Relationship rows have `entity_type_id = 'Rel_<Source>_<Target>_<semantic>'`, plus columns for org_id, name, and a JSON `data` field with at least { source_entity_type, source_entity_id, target_entity_type, target_entity_id, semantic }. The exact column set is non-negotiable — copy from the working bid-mail seeder rather than re-deriving."
      - "Generate idempotent IDs: uuidv5(orgId + ':' + entity_type + ':' + index, NAMESPACE). Re-runs are no-ops via ON CONFLICT DO NOTHING. The seed dataset is fully deterministic given the same --count and --seed."
      - "CLI flags: --count=N (total target rows; sensible defaults from the distribution table below), --types=Client,Company,WorkTask,... (limit to subset), --clean (TRUNCATE per-org tables before insert; requires --confirm; whitelisted to entity tables only — never wipes user, organization_members, organizations), --dry-run (compute counts and print plan without writing), --no-relationships (skip entity_records inserts for relationships), --skip-embeddings (insert with embedding=NULL — default true), --seed=N (faker rng seed for reproducibility), --target=<env>."
      - "Use faker for the long-tail variation (names, emails, addresses, phone numbers, descriptions, company names) but preserve curated business-template structure for domain semantics (project tiers, task priorities, invoice statuses) — port the templates from sophisticated-widecorp-seeder.js."
      - "Insert sequence respects soft-reference ordering (no DB-enforced FKs — all rows are in entity_records — but relationship payloads need live source/target IDs): Companies → Contacts (rel: Contact↔Company) → Clients → Vendors → WorkTasks (rels: WorkTask↔User assignee/owner/reviewer/created_by, WorkTask↔WorkTask hierarchy) → WorkItems → PaymentCycles → PaymentLines. Relationship rows inserted last in their own batches per relationship type."
      - "Spread created_at over a 5-year window with realistic density curve (linear ramp from 5yr ago to today, weekday weighting, business-hours weighting). Avoid the demo-batch single-day anti-pattern from existing seed data."
      - "Promoted-column safety: for any field that the P0 pre-flight identified as required-non-NULL by a GENERATED expression or expression index, the seeder MUST always populate it. Validate via a smoke INSERT of 100 rows in P2 before greenlighting Wave 1."
      - "Pause AI worker embedding queue around the run via existing job-pause flag (or document the manual pause/resume runbook if no flag exists). After seed completes, kick off a one-shot embedding backfill job."
      - "Add seeder smoke check: --dry-run validates schema names against the P0 canonical list before any writes; aborts with a clear error if a canonical name is missing or has drifted in entity_schemas since the audit."
      - "Mark sophisticated-widecorp-seeder.js and seed-realistic-data.ts deprecated: add a banner comment at the top of each pointing to seed-vibegrid-scale.ts and noting they will be removed in a follow-up issue (do not delete in this PR — keep diff small)."
      - "Acceptance: seeder runs end-to-end against staging in --dry-run, prints a row-count plan that matches the distribution table; live run with --count=1000 produces 1000 rows + relationships; re-run is a no-op; b2, b3, b4 verified."
  - id: p3
    name: "Wave-based generation against staging"
    tasks:
      - "Wave 1 — baseline (5k rows total): expand existing scale 5–10×. Confirm no infrastructure surprises (Neon storage, embedding queue, RLS). Smoke each major entity grid for visual regressions vs current state."
      - "Wave 2 — kanban + gantt volume (50k WorkTasks): exercises kanban column rendering with full data, gantt timeline rendering with dependency chains, grouping by status/owner/project. Capture: cold-load TTFP, scroll FPS, kanban drag latency, gantt initial render time."
      - "Wave 3 — virtualization stress (300k WorkTasks or new TimeEntry-like type): the substrate / cursor-bounded test. Capture: heap snapshot at 100k visible, sort latency on promoted-column field, sort latency on unpromoted text field (json_extract path), saved-view live-count update lag."
      - "Wave 4 — full distribution (~1M rows): only after waves 1–3 pass. Targets the full distribution in §6 below."
      - "Each wave: pause embedding queue, run seeder, capture before/after VIbeGrid metrics, write up findings inline in the verification doc, then resume embedding queue and run backfill."
      - "Acceptance: each wave hits its row-count target ±5%; no Neon storage threshold breach; no permanent infrastructure damage; b5, b6 verified."
  - id: p4
    name: "Behavior verification — the smoke checklist"
    tasks:
      - "Translate the ~150-behavior catalog from docs/planning/research/2026-05-08-vibegrid-realistic-seed-data.md into a 30-item must-pass checklist focusing on volume-sensitive behaviors and renderer coverage. Save at docs/planning/verification/2908-vibegrid-smoke-checklist.md."
      - "Run the checklist against post-Wave-4 WideCorp on the preview environment. Use chrome-devtools-axi (`pnpm ab`) for automation: snapshot, screenshot, trace, errors, waterfall. For grid-specific behaviors use `pnpm ab grid` (uids, scroll-to, wait-rows, jumps, tour, warm)."
      - "Capture quantitative metrics for each behavior class: virtualization (cold TTFP, scroll FPS at row 50k+, heap snapshot at 100k), sort/filter (ms-to-first-100-rows on promoted vs unpromoted columns), grouping (works or documented gap on substrate-owned entities — GH#2804 B12), kanban (drag latency, column counts), gantt (initial render, dependency line render correctness), saved views (live count update lag), renderers (every cell renderer type observed at least once)."
      - "Document substrate gaps explicitly: group-by disabled for substrate-owned entities (GH#2804 B12), undo/redo broken on substrate writes. These are not bugs to fix in this issue — they're gaps to record so the smoke report is honest."
      - "Acceptance: verification doc committed; ≥27 of 30 checklist items pass (3 documented exceptions allowed for known-gap behaviors); b7 verified; PR opens to close GH#2908."
---

# Realistic seed data for VIbeGrid smoke testing (~1M rows in WideCorp)

> **GitHub Issue:** [#2908](https://github.com/baseplane-ai/baseplane/issues/2908)
> **Type:** Tooling + data infrastructure (no production code paths)
> **Scope:** apps/web/scripts (new canonical seeder), entity_schemas (additive field extensions only), docs/planning/{research,verification}/ (audit + smoke report)
> **Companion research:** `docs/planning/research/2026-05-08-vibegrid-realistic-seed-data.md`

---

## Problem Statement

VIbeGrid documents ~150 behaviors across rendering, interaction, performance, virtualization, kanban, gantt, grouping, computed fields, relationships, real-time sync, permissions, accessibility, and view-mode persistence. The substrate work in GH#2804 / GH#2806 / GH#2832 makes specific volume claims (100k+ rows, <50MB heap, <200ms sort/filter on promoted columns, 60fps scroll). None of these are smoke-testable today against the WideCorp test org because the data is too thin and stale.

Live staging snapshot of WideCorp (org `wide-corp`, id `01920000-1000-7000-8000-000000000001`) at the time of this spec:

| Schema | Rows | Newest record |
|---|---|---|
| Contact | 174 | 2026-04-27 |
| Company | 49 | 2026-04-27 |
| WorkTask | 41 | 2026-03-15 |
| Vendor | 19 | 2026-03-26 |
| Document | 12 | 2026-03-15 |
| Collection | 12 | 2025-09-11 (single demo-batch day) |
| Invoice | 3 | — |
| Project / PaymentLine | 1–3 | — |
| All others | 1–7 each | mixed |
| **Total** | **667 entity records, 440 relationships** | |

At this scale, virtualization is never exercised, kanban shows mostly-empty columns, gantt has no dependency chains, grouping has nothing to group, saved views have no counts to live-update, sort/filter latency is unmeasurable, dual-layer cell upgrade never fires, and no renderer type has more than a handful of instances.

Two existing seeders exist but neither runs in current shape:
- `apps/web/scripts/sophisticated-widecorp-seeder.js` (870 lines, hardcoded `localhost:5432/elevra_dev` — won't run against staging or preview)
- `apps/web/scripts/seed-realistic-data.ts` (639 lines, runs against DATABASE_URL but writes one row at a time via Kysely → ~50 rows/sec, not viable for 100k+)

Both target an outdated mix of schema names; some still match canonical (`Client`, `Company`, `Vendor`, `WorkTask`) and some don't (`task`, `expense`, `meeting`, `contract`, `discussion`). The schema reconciliation in P0 settles which names are canonical.

---

## Goals & Non-Goals

### Goals

- Produce ~1M total entity records in WideCorp, distributed realistically across canonical schemas to model a 5-year-operating professional services firm
- Exercise every documented VIbeGrid behavior at the data-volume threshold where it actually starts working: virtualization (≥10k single-grid rows), kanban (≥200 cards, all status columns populated), gantt (≥200 tasks with mixed dependency types), grouping (≥500 rows with 5–10 categorical buckets — *with documented substrate-gap caveat*), saved-view live counts (≥10 views per major type), sort/filter (promoted + unpromoted column paths)
- Cover every renderer cell type at least once across the schema set: text, number, date, datetime, boolean, single-select, multi-select, email, url, phone, currency, color, rating, slider, markdown, file, image, user-reference, entity-reference
- Replace the two existing stale seeders with one canonical, modern, batched, idempotent, env-flexible seeder
- Add the rollup / computed fields and saved views needed to surface VIbeGrid's derived-data behaviors
- Produce a written smoke-test report with quantitative perf measurements against the GH#2804 perf targets

### Non-Goals

- **Not adding new VIbeGrid features.** This spec is data + tooling only. Substrate gaps (group-by disabled on substrate-owned entities, undo/redo broken on substrate writes) get *documented* in the smoke report, not fixed.
- **Not seeding DEB or Baseplane orgs.** Other orgs may benefit later but are out of scope.
- **Not seeding GC-vertical entities (RFI, COI, Submittal, DailyLog, PunchListItem) into WideCorp.** WideCorp's identity is consultancy / professional services. GC entities live in DEB Construction. Inserting them into WideCorp would muddy the test surface.
- **Not running against production.** The seeder hard-errors on `--target=production`. WideCorp does not exist in production anyway.
- **Not creating real R2 file blobs.** File and image cells will reference fake R2 keys. Cell rendering does not require a real blob fetch (the URL is enough); only download interactions do, and those are out of scope.
- **Not migrating the database schema.** Field additions in P1 use the existing `SchemaService.addField` path, which writes to `entity_schemas.business_metadata.fields` — no DDL.
- **Not changing VIbeGrid code.** No worker, no React, no ORM changes. Pure data-layer + scripts.

---

## Key Design Decisions

### Idempotency via deterministic UUIDs

The seeder generates IDs as `uuidv5(orgId + ":" + entity_type + ":" + index, BASEPLANE_NAMESPACE)`. Combined with `INSERT ... ON CONFLICT (id) DO NOTHING`, re-runs are no-ops. The seeder ships with the namespace constant baked in. To regenerate from scratch, callers pass `--clean --confirm`, which `TRUNCATE`s per-org tables first.

**Rationale:** the existing `seed-realistic-data.ts` is destructive (deletes 8 tables before reseeding) with no idempotent option. Idempotent re-runs let us re-seed staging incrementally without wiping in-flight test data unrelated to this seed.

### postgres.js batched INSERT, not Kysely one-at-a-time

The existing seeders insert one row per network round-trip (~50 rows/sec). The seed-bid-mail-dataforge.ts pattern uses `postgres.js` with multi-row VALUES INSERT (5000 rows/batch ≈ 10k rows/sec). At 1M total rows, the difference is ~5 hours vs ~100 seconds.

We deliberately do **not** use `COPY FROM` (would be ~50k rows/sec). The throughput gain is real but it bypasses pg triggers, RLS-context handling, and ON CONFLICT, which our idempotency story relies on. We can revisit if Wave 4 is uncomfortably slow with batched INSERT.

### faker for variation, curated templates for structure

Faker handles names, emails, addresses, phone numbers, free-text descriptions — the long tail. Curated business templates from `sophisticated-widecorp-seeder.js` (client tiers, project types, complexity bands, role-weighted billing rates) handle the structural realism that makes the data feel like a 5-year-operating consultancy and not random noise. Both layers stay deterministic via `--seed=N`.

### Single canonical seeder, retire the others

`seed-realistic-data.ts` and `sophisticated-widecorp-seeder.js` get marked deprecated (banner comment + git rm in a follow-up). One canonical script: `apps/web/scripts/seed-vibegrid-scale.ts`. The bid-mail seeders stay (different domain).

### Wave-based generation, not all-at-once

Going straight to 1M rows is reckless. P3 runs four waves (5k → 50k → 300k → 1M) with measurement at each gate. If Wave 2 surfaces an infrastructure issue (Neon storage, embedding-queue saturation, RLS perf), Waves 3–4 don't run.

### Verification report is a deliverable

The behavior catalog (~150 items) compresses to a 30-item must-pass checklist. The smoke report records pass/fail with evidence (screenshots, ms numbers, heap-snapshot deltas) for each. ≥27/30 passing is acceptance; the 3 allowed failures correspond to documented substrate gaps.

---

## Decisions to confirm with reviewer

These are explicit defaults; flag any you want changed before P2 starts:

| # | Decision | Default |
|---|---|---|
| 1 | Target environment for the smoke run | Staging (Neon paid tier confirmed accommodating ~3GB) |
| 2 | Total row count target | ~1M (Wave 4); minimum-viable smoke is ~350k (skip Wave 4) |
| 3 | WideCorp identity | Professional services consultancy — preserve existing schema personality |
| 4 | Add @faker-js/faker dev dependency | Yes |
| 5 | Idempotent re-runs vs wipe-and-reseed | Idempotent default; wipe via explicit `--clean --confirm` |
| 6 | Embedding queue handling during seed | Pause via existing flag if available; otherwise insert `embedding=NULL` and run a one-shot backfill after |
| 7 | Retire `sophisticated-widecorp-seeder.js` and `seed-realistic-data.ts` | Yes (mark deprecated in this spec; delete in a follow-up) |
| 8 | Document substrate gaps rather than fix them | Yes — substrate group-by + undo/redo are out of scope |

---

## Target distribution (Wave 4) — revised post P0 audit

P0 audit narrowed the canonical schema set to 7 active entity types (Client, Company, Contact, Vendor, WorkTask, WorkItem, PaymentCycle, PaymentLine). BuildProject, ProjectMilestone, ProjectPortfolio, Invoice, Document, Collection, Project were excluded per the soft-delete rule (their schemas are deleted; legacy rows in entity_records exist but won't be expanded). All inserts go to the shared `entity_records` table keyed by `entity_type_id`.

```
Companies:                  2,000
Contacts:                  20,000
Clients:                    2,000
Vendors:                      800
WorkTasks:                350,000   (richest schema with 48 fields — kanban + gantt + virtualization host)
WorkItems:                 40,000   (sub-tasks)
PaymentCycles:              5,000
PaymentLines:              80,000

Relationships (Rel_*):   ~400,000   (Contact↔Company belongs_to;
                                     Client/Company/Vendor↔User created_by;
                                     WorkTask↔User assigned/owned/reviewed/created/relates/approval (×6 rel types);
                                     WorkTask↔WorkTask child_of/depends_on/relates_to (×3 rel types))

GRAND TOTAL:             ~900,000   rows in entity_records
```

Minimum-viable smoke (~350k) trims WorkTasks to 50k and skips PaymentCycle/PaymentLine. WorkTasks at 50k still demonstrates virtualization, kanban, gantt, grouping.

---

## Feature Behaviors

[TEVS — Trigger / Effect / Verification / Surface]

### B1 — WideCorp schema audit produces canonical entity-name list

- **Trigger:** Engineer runs the audit script in P0
- **Effect:** Produces `docs/planning/research/2026-05-08-widecorp-schema-audit.md` with per-schema metadata (entity_name, table_name, archetype, is_system, is_platform, deleted, row count, field set) and a declared canonical list
- **Verification:** Audit report committed; canonical list referenced by P1, P2 specs; no schema name in the seeder is unmatched in the audit
- **Surface:** Documentation only

### B2 — Canonical seeder runs against staging without writes (`--dry-run`)

- **Trigger:** Engineer runs `pnpm tsx apps/web/scripts/seed-vibegrid-scale.ts --dry-run --count=1000000`
- **Effect:** Validates every schema name against `entity_schemas`, computes the row-count plan per type, prints it, exits 0; no rows inserted
- **Verification:** `SELECT COUNT(*) FROM org_<id>_worktask` (and every other table) is unchanged before/after; output includes a per-type row-count breakdown summing to ~1M
- **Surface:** CLI

### B3 — Canonical seeder is idempotent

- **Trigger:** Engineer runs the seeder twice with the same `--count` and `--seed`
- **Effect:** First run inserts N rows. Second run inserts 0 new rows (ON CONFLICT DO NOTHING). Row count after run #2 equals row count after run #1
- **Verification:** Spot-check `SELECT COUNT(*) FROM org_<id>_<type>` before run #1, after run #1, after run #2; counts stable across runs #1→#2
- **Surface:** CLI

### B4 — Canonical seeder hits ≥8,000 rows/sec batched

- **Trigger:** Wave 2 generation (50k WorkTasks)
- **Effect:** Total wall-clock time to insert 50k WorkTasks + their relationship rows is ≤20s (entity rows + relationship rows combined). Aggregate throughput on entity-only inserts is ≥8,000/sec, matching the research baseline (~10k/sec at 5k batch size, with 20% margin for index maintenance and RLS GUC overhead).
- **Verification:** Seeder logs per-batch timing; aggregate throughput report shows ≥8,000 inserts/sec on entity rows. If throughput falls below 5,000/sec, file a follow-up to investigate before Wave 3.
- **Surface:** CLI logs

### B5 — Schema field-type coverage spans every renderer

- **Trigger:** P1 schema extension complete
- **Effect:** Across the canonical schema set, each VIbeGrid cell renderer has at least one field configured: text, number, date, datetime, boolean, single-select, multi-select, email, url, phone, currency, color, rating, slider, markdown, file, image, user-reference, entity-reference
- **Verification:** Coverage matrix in `docs/planning/verification/2908-vibegrid-smoke-checklist.md` lists field path per renderer; chrome-devtools-axi snapshot of one grid per major entity confirms each cell type renders
- **Surface:** entity_schemas.business_metadata.fields

### B6 — Saved views show non-zero live counts that update on edit

- **Trigger:** P3 Wave 2 complete (50k WorkTasks present); user navigates to WorkTask grid
- **Effect:** Sidebar lists ≥8 saved views for WorkTask, each with a non-zero count. After a manual edit that should change a view's count (e.g., flipping a WorkTask's status from `open` to `done` on a view filtered to `status=open`), the displayed count updates without a page refresh.
- **Verification:** `pnpm ab snapshot` captures the sidebar view list with counts; perform the edit via grid UI; a follow-up `pnpm ab snapshot` shows the count delta. Screenshot evidence captured for both states. (No latency assertion — liveQuery propagation timing is not the focus of this spec.)
- **Surface:** WorkTask sidebar

### B7 — Smoke report passes ≥27/30 must-pass behaviors

- **Trigger:** P4 verification run on Wave 4 data
- **Effect:** `docs/planning/verification/2908-vibegrid-smoke-checklist.md` records pass/fail with evidence for each of 30 must-pass items; ≤3 documented failures, all corresponding to known substrate gaps (group-by-on-substrate-owned, undo/redo-on-substrate-writes, or one other documented gap)
- **Verification:** Verification doc committed; passing items have screenshot or `pnpm ab` capture as evidence; failing items reference a tracking issue
- **Surface:** Documentation

---

## Implementation Phases

See frontmatter `phases` array for the detailed task list. Summary:

- **P0 — Reconcile schemas + audit existing seeders.** Lookup-only, ~1 day. Output: audit doc, canonical schema list, soft-delete rule, TimeEntry decision, promoted-column pre-flight. Gates the rest.
- **P1 — Schema extension + saved views.** ~1 day. Add missing field types so every renderer is covered; add rollups; create saved views (counts will read 0 until P3 populates data — non-zero counts are verified in B6 post-Wave 2, not in P1 itself).
- **P2 — Canonical seeder.** ~2 days. Modern, batched, idempotent, env-flexible, RLS-aware. Replaces two stale seeders.
- **P3 — Wave-based generation.** ~2 days (most of the time is measurement and embedding backfill, not the inserts themselves which run in seconds). Each wave gates the next.
- **P4 — Behavior verification + smoke report.** ~1–2 days. Translate the catalog to a 30-item checklist; run; capture evidence; document gaps; close the issue.

**Total estimate:** 7–8 working days. Sequencing: P0 gates everything; **P1 and P2 may overlap** (P1 modifies schemas, P2 writes the seeder against the P0 canonical list — both depend on P0 not on each other); P3 requires both P1 and P2 done; P4 requires P3. Wave failures in P3 may extend the estimate.

---

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Neon staging storage runs over (1M rows × ~1KB ≈ 2–3GB plus indexes) | Confirm paid-tier quota in P0; if tight, drop TimeEntries from Wave 4 to land at ~700k rows |
| Embedding queue saturates with 1M jobs | Insert `embedding=NULL`, pause AI worker queue around the run, run one-shot backfill after; if no pause flag, document a manual stop-the-worker runbook step |
| GENERATED column / promoted-column INSERT failure on synthetic shapes | P0 pre-flight enumerates expression-indexed columns and their NULL tolerance; P2 task explicitly enforces non-NULL on any field flagged by P0; smoke INSERT of 100 rows runs before any wave kicks off |
| Index maintenance dominates insert time at 1M scale | Drop and recreate the index after bulk insert; measure in Wave 2 to decide whether Wave 4 needs the drop-recreate dance |
| Schema name drift between P0 audit and P2/P3 execution | The P0 canonical list is committed and referenced as the single source of truth. P2 `--dry-run` validates schema names against entity_schemas at every run and aborts on drift. If the canonical list needs to change mid-implementation, update P0 doc + re-run P2 dry-run before proceeding. |
| Substrate group-by gap (GH#2804 B12) makes some smoke items un-passable | Listed as one of the 3 allowed documented failures in B7. Verify GH#2804 B12 still describes this gap when P4 runs — if the gap has been closed, expectations tighten accordingly |
| WideCorp test users get clobbered by aggressive `--clean` | `--clean` requires `--confirm`; whitelisted to per-org entity tables only — never wipes `user`, `organization_members`, `organizations` |
| Re-running a partial seed double-inserts | Deterministic UUIDs + ON CONFLICT DO NOTHING; verified in B3 |
| Seeder accidentally targets production | Hard-error on `--target=production`; production has no WideCorp anyway |
| Reproducible bug in seed data trips up unrelated test users | Seed lives in test orgs only (WideCorp); production orgs unaffected; Baseplane staging shared with DEB but per-org-table architecture isolates writes |
| Wave gating fails (Wave 2 measurement reveals infrastructure issue) | Stop after the failing wave; file a follow-up issue for the root cause; do not proceed to subsequent waves until the underlying issue is resolved. The 7–8 day estimate becomes a soft estimate at this point. |
| RLS GUC misconfiguration causes batch insert to error halfway through | Insert smoke of 100 rows in P2 catches this before any wave runs; transaction-per-batch ensures partial failures roll back cleanly |

---

## Sources

- `docs/planning/research/2026-05-08-vibegrid-realistic-seed-data.md` — companion research
- `.claude/rules/vibegrid.md`, `.claude/rules/vibegrid-interactions.md` — behavior catalog inputs
- `docs/primitives/vibegrid/{core,editing,clipboard,data-controls,column-interactions,selection,cross-cutting}.md`
- `docs/planning/specs/2804-smart-100k-row-system.md` — perf targets (100k+ rows, <50MB heap, <200ms sort/filter)
- `docs/planning/specs/1437-perf-vibegrid-dual-layer-cell-rendering-.md` — frame-time budgets
- `docs/planning/specs/2806-substrate-full-cutover.md` — substrate cutover context
- `apps/web/scripts/seed-bid-mail-dataforge.ts` — canonical batched-insert pattern to port
- `apps/web/scripts/sophisticated-widecorp-seeder.js`, `apps/web/scripts/seed-realistic-data.ts` — existing seeders being retired
- `apps/web/src/server/domain/shared/dataforge-provisioner.ts` — `SchemaService.addField` path used in P1
- Live staging DB query against `wide-corp` org (snapshot in Problem Statement)
