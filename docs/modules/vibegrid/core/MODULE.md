---
module_id: core
domain: vibegrid
display_name: "Core Grid Engine"
archetype: grid
status: active
features:
  - core
  - row-expansion
---

# Core Grid Engine

> How does the grid render, scroll, select, and edit 10k+ rows at 60fps?

High-performance virtualized data grid with DOM recycling (30-50 rows in DOM), dual-layer cell rendering (shell cells at scroll time, rich cells during idle), and delta-based selection updates. All state managed via MobX stores scoped per grid instance.

## Features

- [core](core.md) — Grid rendering, virtualization, keyboard navigation, selection
- [row-expansion](row-expansion.md) — Inline expansion for one-to-many relationships
