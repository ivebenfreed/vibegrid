---
date: 2026-03-15
topic: VIbeGrid documentation layer audit — bleed, sprawl, source of truth
status: complete
github_issue: null
---

# Research: VIbeGrid Doc Layer Audit

## Context

VIbeGrid documentation has sprawled across all 5 doc layers (theory, primitives, modules, specs, rules) plus CLAUDE.md. This audit maps where content lives, identifies layer bleed (content in the wrong layer), and pinpoints source-of-truth conflicts.

## Questions Explored

1. Where does VIbeGrid content live across the 5 doc layers?
2. What content is duplicated or bleeds across layers?
3. Where is the source of truth for each VIbeGrid concept?
4. What should be consolidated or deleted?

## Findings

### Inventory

| Layer | Files | Lines (approx) | Purpose (per layer test) |
|-------|-------|-----------------|--------------------------|
| **Theory** | 1 passing ref in `RESEARCH-validation-system.md` | ~2 | Survives stack rewrite — OK |
| **Primitives** | `docs/primitives/vibegrid.md` | ~240 | Concept, wireframes, behavior — mostly clean |
| **Modules** | 4 modules (core, data-controls, gantt, export-services), 8 files | ~630 | Behaviors, UI states, API reference — **heavily stale** |
| **Rules** | `vibegrid.md` + `vibegrid-interactions.md` + 3 ARIA dupes | ~280 | File paths, anti-patterns — **bleeds into module territory** |
| **Specs** | 128 files reference vibegrid | thousands | Per-feature snapshots — expected |
| **CLAUDE.md** | VIbeGrid ARIA section in browser testing context | ~60 | Duplication of rules content |

**Total: ~1,200+ lines across ~140 files.**

### Critical Issues

#### Issue 1: Row Expansion — 3 sources disagree on status

| Source | Claims |
|--------|--------|
| `docs/primitives/vibegrid.md` frontmatter | `built: Row expansion with detail panels` |
| `.claude/rules/vibegrid-interactions.md` | Fully implemented: `RowExpansionProcessor`, `ExpandedContentPortals`, `MutationObserver` bridge, with working TypeScript examples |
| `docs/modules/vibegrid/core/row-expansion.md` | All 11 behaviors marked `[ ] Planned`, references non-existent components (`VibegridBodyRenderer.tsx`, `RowExpansionContent.tsx`) |

**Root cause:** Module doc was written as a design spec, never updated post-implementation. The rules file became the de facto implementation reference.

#### Issue 2: Module docs reference deleted code

| Module Doc | References | Actually Removed Per Rules |
|-----------|------------|---------------------------|
| `core.md` B10 | `ModularCellBridge.ts:253` | "ModularCellBridge... have been removed" |
| `export-services.md` B2 | `FieldTypeRegistry.ts` | "FieldTypeRegistry has been removed" |
| `row-expansion.md` | `VibegridBodyRenderer.tsx`, `RowExpansionContent.tsx` | Not found in codebase |

**Root cause:** Rules files were updated during refactors (GH#1413, GH#1435, GH#1437); module docs were not.

#### Issue 3: Rules files contain module-level content

`.claude/rules/vibegrid-interactions.md` contains:
- 60+ lines of TypeScript code examples (SlotRegistry registration, MutationObserver patterns)
- Directory structure diagrams
- Detailed component interaction descriptions (ExpandedContentPortals, RowExpansionProcessor lifecycle)

Per the layer test: "If it references a specific library or file path → Rules." But TypeScript API examples and component lifecycle descriptions are module-level concerns. Rules should be: file paths, import conventions, anti-patterns.

#### Issue 4: ARIA/browser automation duplicated 4 times

The same VIbeGrid ARIA attributes table appears in:
1. `.claude/rules/vibegrid.md` — **canonical** (scoped to `apps/web/src/systems/vibegrid/**/*`)
2. `.claude/rules/browser-testing-context.md` — copy
3. `.claude/rules/chrome-devtools.md` — copy
4. `CLAUDE.md` browser testing section — copy

Only #1 is the right home. The browser testing rules should reference it, not duplicate it.

#### Issue 5: Primitives has spec-level implementation details

`docs/primitives/vibegrid.md` CSV Export section includes:
- RFC 4180 reference
- UTF-8 BOM for Excel compatibility
- "GH#1551" issue reference
- Client-side implementation detail ("no backend call")

Per the layer test: primitives show "what it looks like and how it behaves." RFC compliance and encoding details are rules-level. Issue references are spec-level.

#### Issue 6: Anti-patterns split across two rules files

- `vibegrid.md`: 6 anti-patterns
- `vibegrid-interactions.md`: 3 anti-patterns
- 2 overlap (SlotRegistry-related)

Should be consolidated in one place.

### Source of Truth Map (Current vs Recommended)

| Content | Current Location(s) | Recommended Single Source |
|---------|---------------------|--------------------------|
| What VibeGrid is, wireframes, view mode concepts | `primitives/vibegrid.md` | `primitives/vibegrid.md` (no change) |
| File paths, imports, anti-patterns | `rules/vibegrid.md` | `rules/vibegrid.md` (consolidate anti-patterns from interactions) |
| SlotRegistry API, TypeScript patterns | `rules/vibegrid-interactions.md` | `modules/vibegrid/core/core.md` |
| Row expansion implementation | `rules/vibegrid-interactions.md` | `modules/vibegrid/core/row-expansion.md` (rewrite from code) |
| MutationObserver DOM-React bridge | `rules/vibegrid-interactions.md` | `modules/vibegrid/core/core.md` (architecture section) |
| ARIA attributes | 4 files | `rules/vibegrid.md` only; browser testing rules reference it |
| CSV export details | `primitives/vibegrid.md` + `rules/vibegrid.md` | Concept in primitives, implementation in rules |
| Gantt behaviors | `modules/vibegrid/gantt/gantt.md` | No change (correctly placed) |
| Data controls behaviors | `modules/vibegrid/data-controls/data-controls.md` | No change (correctly placed) |

## Recommendations

### Priority 1: Fix stale module docs (source of truth conflicts)

1. **Rewrite `row-expansion.md`** — update from code reality, mark implemented behaviors, fix component references
2. **Update `core.md`** — remove references to `ModularCellBridge` (deleted), update architecture section
3. **Update `export-services.md`** — remove `FieldTypeRegistry` reference, update to SlotRegistry

### Priority 2: Fix layer bleed

4. **Slim down `vibegrid-interactions.md`** — move TypeScript patterns and component lifecycle docs to module layer; keep only file paths, registration conventions, anti-patterns
5. **Consider merging `vibegrid-interactions.md` into `vibegrid.md`** — after moving module content out, what remains may not justify a separate file
6. **Remove ARIA duplication** — keep in `vibegrid.md`, add cross-reference from browser testing rules

### Priority 3: Clean up primitives

7. **Move CSV implementation details** from primitives to rules (RFC 4180, BOM, client-side)
8. **Remove GH# references** from primitives (they belong in specs)

### Not Recommended

- Touching the 128 spec files — they're historical snapshots, expected to reference vibegrid
- Creating theory-level vibegrid docs — theory is about domain invariants, not UI primitives

## Open Questions

- Should `vibegrid-interactions.md` be **deleted entirely** after moving content to modules? Or kept as a slim pointer?
- Are the module docs (`docs/modules/vibegrid/`) actively used by any tooling (e.g., `at verify`)? If so, fixing them is urgent.
- Should the `not_built` list in `primitives/vibegrid.md` frontmatter be updated? (Kanban still listed as not built)

## Next Steps

- Create a cleanup issue to track the fixes
- Or: direct implementation if scope is small enough for a task-mode session
