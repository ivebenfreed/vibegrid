# VibeGrid

A high-performance, MobX-driven data grid with direct-DOM rendering, extracted from
the Baseplane monorepo (`baseplane-ai/baseplane`) as that project wound down.

Notion/ClickUp-class grid: virtualized to 200k+ rows, slot-pooled DOM rendering,
range selection, fill-handle, clipboard with type coercion, inline editors per field
type, nested filter builder, saved views, grouping, and Table / Kanban / Gantt view
modes.

> **Status: extracted, not yet standalone.** This is a faithful lift of the code as it
> stood in Baseplane on 2026-09-07, with full git history preserved. It does **not build
> on its own** — 20 of its 205 source files still import Baseplane host modules.
> **[DECOUPLING.md](DECOUPLING.md) is the map for making it standalone**, with the exact
> file list, the symbol-level import inventory, and a phased plan.

## What's here

| Path | What |
|---|---|
| `src/` | The grid itself — 205 source files / ~66k LOC (286 tracked files / 89k LOC incl. tests + CSS) |
| `bridge/` | Grid-specific server data-spine code that lived in Baseplane's `shared/data/query/` — the windowed-refetch adapter and the sort/filter → server-predicate bridge |
| `harness/` | Debug routes (`/debug/vibegrid`, field-type/grouping/drag-drop/gantt pages) and scale-seed scripts |
| `e2e/` | Playwright smoke suite — 25 specs covering field types, clipboard, selection, keyboard, gantt, stress |
| `docs/` | Primitives docs, 12 research documents, ~35 specs, and the agent rules files |
| `reference/consumers/` | Read-only copies of the 7 production surfaces that embedded the grid — the real-world shape of the props API |
| `reference/host/` | The Baseplane host modules the grid leans on (`IStore`, `DisposerManager`, logging, `cn`) |
| `archive/` | Two prior VibeGrid incarnations (`vibegrid-v0`, `vibegrid-v1`) kept for lineage |

## History

`git log` reaches back to 2025-10-22. The three historical roots
(`src/components/vibegrid/` → `src/systems/vibegrid/` → `apps/web/src/systems/vibegrid/`)
were collapsed into `src/` during extraction, so `git blame` and `git log` work
directly on today's paths with no `--follow` needed. 1,065 commits survived the filter
out of 9,535 in the source repo.

## Architecture in one paragraph

React owns business logic and mounts the grid; **MobX stores own all state**; a
`SimplePassiveRenderer` writes to the DOM directly, bypassing React reconciliation for
cells. Stores signal the renderer through version counters (`dataVersion`,
`configVersion`, `structureVersion`) plus MobX reactions, and the renderer reaches back
into stores to read. That bidirectional coupling is the grid's central architectural
debt — see the "instruction boundary" section of DECOUPLING.md.

Targets it was built to: <70ms initial render, <0.5ms cell update, 60fps scroll.

## License

Unlicensed / all rights reserved pending a decision. Originally authored inside
`baseplane-ai/baseplane`; confirm the provenance story before publishing this
repo or any part of it.
