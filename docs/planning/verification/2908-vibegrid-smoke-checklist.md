# GH#2908 — VIbeGrid Smoke Checklist (30 must-pass items)

**Goal:** Translate the ~150-behavior catalog from `docs/planning/research/2026-05-08-vibegrid-realistic-seed-data.md` into a concise, runnable, evidence-bearing 30-item smoke checklist.

**Run after:** Wave 4 seed (~900k rows). For Waves 1–3, only items in scope at that data scale apply.

**Acceptance for B7:** ≥27 of 30 pass. Up to 3 documented failures allowed for known substrate gaps. Failures attached to the issue with screenshot/log evidence.

**Tooling:** All items use `pnpm ab` (chrome-devtools-axi) for browser automation. See `.claude/rules/chrome-devtools.md` and `browser-testing-context.md`.

**Auth:**
```bash
pnpm ab auth login preview-ceo   # WideCorp CEO on pr-N.dev.baseplane.ai
```

**Target URL:**
```bash
echo $TARGET_URL   # auto-derived from worktree
```

---

## Setup steps (run before checklist)

```bash
# 1. Verify seed completed and counts are at target
pnpm bpd 'db SELECT entity_type_id, COUNT(*) FROM entity_records WHERE organization_id = '"'"'01920000-1000-7000-8000-000000000001'"'"' AND is_deleted = false GROUP BY entity_type_id ORDER BY COUNT(*) DESC LIMIT 20'

# 2. Auth into preview as CEO (full org access)
pnpm ab auth login preview-ceo

# 3. Verify 62+ saved views are present
pnpm bpd 'db SELECT entity_type, COUNT(*) FROM entity_views WHERE organization_id = '"'"'01920000-1000-7000-8000-000000000001'"'"' GROUP BY entity_type ORDER BY COUNT(*) DESC'

# 4. Open the WorkTask grid (highest-volume entity)
pnpm ab open $TARGET_URL/entities/WorkTask
pnpm ab snapshot
```

---

## Renderer coverage (5 items)

Each renderer must render at least once without console errors. Use `pnpm ab grid uids` to enumerate visible cells, then `pnpm ab eval "document.querySelector('[data-renderer=\"<type>\"]')?.outerHTML"`.

| # | Behavior | How to verify | Pass criteria |
|---|---|---|---|
| 1 | text + email + url + phone renderers | Open Contact grid; snapshot; check at least one `[data-renderer="text"]`, one `[data-renderer="email"]`, one `[data-renderer="url"]`, one `[data-renderer="phone"]` cell present | All four present, no console errors |
| 2 | number + currency + boolean + date + datetime renderers | Open WorkTask grid; same approach for those renderers | All five present |
| 3 | single-select + multi-select renderers | Open WorkTask grid; verify badges visible for `priority`, `test_multi_select` | Both present, distinct colors |
| 4 | color + rating + slider + markdown renderers | Open WorkTask grid; scroll horizontally to test_color/test_rating/test_slider/test_markdown columns | All four render distinct visual treatment |
| 5 | file + image + user-reference + entity-reference renderers | Open Client grid (file via `contract`), WorkItem grid (image), WorkTask grid (assignee → user-ref via Rel_WorkTask_User_assigned_to). Verify entity-ref via Rel_Contact_Company_belongs_to on Contact | All four render distinct affordances |

---

## Virtualization & dual-layer (5 items)

| # | Behavior | How to verify | Pass criteria |
|---|---|---|---|
| 6 | Cold-load TTFP under 2s on 350k WorkTask grid | `pnpm ab trace "open $TARGET_URL/entities/WorkTask"` followed by `pnpm ab perf-insight LCPBreakdown LCP` | LCP ≤ 2000ms |
| 7 | Scroll FPS ≥ 50fps at row 50k+ | `pnpm ab grid scroll-rows 50000`; `pnpm ab trace "scroll"` then perf-insight | FrameRate insight ≥ 50fps |
| 8 | Heap snapshot at 100k visible rows under 80MB | `pnpm ab heap /tmp/wt-100k.heapsnapshot` after scrolling to row 100k; verify file size + GC roots | Total heap ≤ 80MB (revised from spec's 50MB target — acceptable per substrate cutover trajectory) |
| 9 | DOM contains ≤80 row elements at any time during scroll | `pnpm ab eval "document.querySelectorAll('[role=row]').length"` repeatedly during scroll | Always ≤ 80 |
| 10 | Shell cell + lazy upgrade visible during fast scroll | `pnpm ab grid jumps 30 99` then `pnpm ab grid console` to capture render timing logs | Logs show shell→full cell upgrade transitions; no flickering / no blank cells persisting |

---

## Sort, filter, search (4 items)

| # | Behavior | How to verify | Pass criteria |
|---|---|---|---|
| 11 | Sort by date column completes in <500ms | Click `due_date` header; measure via `pnpm ab perf-start` / scroll / `perf-stop`; perf-insight | First 100 sorted rows visible within 500ms |
| 12 | Sort by JSONB-path text column (unpromoted) completes in <2s | Click any non-status text column header | First 100 visible within 2000ms (slower path acceptable per spec) |
| 13 | Global search debounces (~300ms) and matches expected count | Use search box; type "high"; wait; verify result count matches `SELECT COUNT(*) FROM entity_records WHERE … AND data->>'priority' = 'high'` | Count matches DB count ±5 |
| 14 | Column filter dropdown applies and updates count | Open WorkTask; filter `status = blocked`; verify row count matches DB query | Counts match |

---

## Grouping (2 items — substrate gap allowed)

| # | Behavior | How to verify | Pass criteria |
|---|---|---|---|
| 15 | Group by `priority` works on a sub-1k grid (e.g. Vendor) | Open Vendor grid; group by `category`; verify expand/collapse works | Groups render with counts |
| 16 | Group by on substrate-owned WorkTask: documented gap (GH#2804 B12) | Try to group by `status` on WorkTask | EXPECTED FAIL — documented as one of the 3 allowed exceptions in B7 |

---

## Saved views & live counts (3 items)

| # | Behavior | How to verify | Pass criteria |
|---|---|---|---|
| 17 | Sidebar lists ≥10 views per WorkTask, all with non-zero counts | `pnpm ab snapshot` of sidebar after opening WorkTask grid; count views and read counts | Count matches `SELECT COUNT(*) FROM entity_views WHERE entity_type = 'WorkTask'` (=12); each view shows >0 rows |
| 18 | Edit a WorkTask flips a view's count in real-time (B6 acceptance) | Pick a view filtered to `status=open`; note count; edit one matching task to `status=done`; verify count decremented | Count delta visible without refresh |
| 19 | Default view loads on entity list navigation | Navigate to `$TARGET_URL/entities/WorkTask`; check the active view indicator | "All Tasks" (the is_default=true view) is the loaded view |

---

## Kanban view (3 items)

| # | Behavior | How to verify | Pass criteria |
|---|---|---|---|
| 20 | Switch to Kanban view; all 6 status columns populated | Open WorkTask; click "Kanban" view; snapshot | 6 columns: todo, in_progress, in_review, blocked, done, cancelled — each has ≥1 card |
| 21 | Drag a card from one status column to another updates `status` field | Drag a `todo` card to `in_progress`; verify DB row updated via `pnpm bpd 'db SELECT data->>'\''status'\''  FROM entity_records WHERE id = '\''<id>'\'' '` | DB status matches new column |
| 22 | Kanban scroll within column virtualizes (≥1000 cards in busiest column) | Scroll the busiest column; verify smooth scroll | 60fps during scroll |

---

## Gantt view (2 items)

| # | Behavior | How to verify | Pass criteria |
|---|---|---|---|
| 23 | Switch to Gantt; tasks render with start/end dates | Open WorkTask; click "Timeline" view | Task bars visible across timeline |
| 24 | Dependency lines render for `Rel_WorkTask_WorkTask_depends_on` | Look for arrows/lines between dependent tasks | Lines rendered correctly between source and target tasks |

---

## Selection & bulk action (2 items)

| # | Behavior | How to verify | Pass criteria |
|---|---|---|---|
| 25 | Select 10 rows via checkbox; bulk-action toolbar appears with count | Click 10 row checkboxes; check toolbar | "10 selected" displayed; bulk-action menu present |
| 26 | Ctrl+A selects all visible rows | Focus grid; press Ctrl+A | All visible rows selected |

---

## Editing (2 items)

| # | Behavior | How to verify | Pass criteria |
|---|---|---|---|
| 27 | Edit a text cell, Tab commits, value persists after refresh | `pnpm ab grid type-into-cell <rowId> title "edited"`; refresh page; verify `data->>'title' = 'edited'` | Value persists |
| 28 | Edit a select cell to invalid option (not in option set) is blocked or rolled back | Try to set status to "garbage"; verify error or rollback | Cell does not change to invalid value |

---

## Permissions (1 item)

| # | Behavior | How to verify | Pass criteria |
|---|---|---|---|
| 29 | Viewer role sees grid read-only (no `data-affordance="edit"` cells) | `pnpm ab auth login preview-viewer`; open grid; `pnpm ab eval "document.querySelectorAll('[data-affordance=\"edit\"]').length"` | Returns 0 — viewer has no edit affordances |

---

## Performance baseline (1 item)

| # | Behavior | How to verify | Pass criteria |
|---|---|---|---|
| 30 | No console errors on full grid open (entire 350k WorkTask) | `pnpm ab open $TARGET_URL/entities/WorkTask`; `pnpm ab errors` | Zero errors. Warnings allowed. |

---

## Documented allowed failures (3 of 30 budget)

These are pre-known gaps; failing them does NOT count against the 27/30 acceptance:

1. **#16 grouping on substrate-owned entities** — GH#2804 B12. Tracked separately.
2. **Possible: undo/redo on substrate writes** — substrate cutover left undo broken; if any item triggers undo (#28 might), it's expected to fail.
3. **Possible: kanban drag at extreme scale** — column with >10k cards may stutter during drag; acceptable if root cause is documented.

If more than 3 fail, the smoke run does not pass. Open follow-up issues for each unexpected failure with reproduction steps + evidence.

---

## How to run

This checklist is **manual + assisted**. Run each item, capture evidence (screenshot for visual items, console output / DB query result for data items), record pass/fail in a result table at the bottom of this doc, then commit.

```bash
# Set up tracking
mkdir -p docs/planning/verification/2908-evidence/
# Run items in batches; for each item that passes, capture:
#   pnpm ab screenshot docs/planning/verification/2908-evidence/<item-N>.png
# For failed items, capture errors + console:
#   pnpm ab errors > docs/planning/verification/2908-evidence/<item-N>-errors.log
```

---

## Result tracking

Append a row per item as you run it. Sample format:

```
| Item | Status | Evidence | Notes |
|---|---|---|---|
| #1 | PASS | docs/.../2908-evidence/1-renderers.png | All 4 renderers visible on Contact grid |
| #16 | EXPECTED FAIL | docs/.../2908-evidence/16-grouping-fail.png | Substrate gap, GH#2804 B12 |
```

---

## Out-of-scope (for clarity)

These are documented behaviors that this checklist does NOT verify:
- Real-time WebSocket sync from another browser tab (requires multi-session setup; orthogonal to seed data work)
- Touch / mobile interactions (separate device matrix)
- File download interactions (seed populates fake R2 keys; no actual blobs in R2)
- Computed/rollup field display (deferred per P1.2 audit — saved-view counts substitute)
- Advanced filter builder with nested AND/OR (covered indirectly by sort+filter items 11–14)
- Column reorder / resize / visibility persistence to localStorage (lower priority; not data-volume sensitive)

These can be added to a follow-up checklist if needed.

---

## Owner & sign-off

**Run by:** _engineer assigned to GH#2908_
**Reviewed by:** _Ben_
**Date:** _to be filled in when run_
**Result summary:** _N/30 passing, M expected failures, K unexpected failures_
