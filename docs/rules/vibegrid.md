---
paths: apps/web/src/systems/vibegrid/**/*
relatedFeatures:
  - vibegrid/core
  - vibegrid/data-controls
  - vibegrid/export-services
  - vibegrid/gantt
---

# VibeGrid Core

High-performance data grid with MobX state, virtual scrolling, and Gantt support.

**Location:** `apps/web/src/systems/vibegrid/`

## Key Principle: Extend the Primitive

**Before implementing ANY grid functionality in `features/`, check if it should be a VibeGrid primitive.**

| Question | If YES | If NO |
|----------|--------|-------|
| Could other entities use this? | Build in `systems/vibegrid/` | OK for `features/` |
| Does it involve cell rendering? | Check `fieldTypeRegistry` first | May be domain-specific |
| Does it involve row interaction? | Check existing processors first | May be domain-specific |

## Where Code Should Live

| Code Type | Location |
|-----------|----------|
| Cell renderers (generic) | `systems/vibegrid/field-types/` |
| Cell renderers (domain-specific) | `features/{domain}/schemas/` |
| Row interactions (generic) | `systems/vibegrid/processors/` |
| Column schemas | `features/{domain}/schemas/` |

## Critical Rules

1. **Row actions need selection column** - Set `enableSelectionColumn={true}`
2. **Bulk handlers receive arrays** - `(rowIds[], rowsData[])`
3. **Use `depends_on` relationship** - Via UnifiedRelationshipService
4. **Cascade on date changes** - `calculateCascadeUpdates()` propagates changes
5. **Cycle detection** - GraphService.detectCycles() prevents circular deps

## Dependency Types (Gantt)

| Type | Abbr | Meaning |
|------|------|---------|
| `finish_to_start` | FS | Predecessor finishes before successor starts (default) |
| `start_to_start` | SS | Predecessor starts before successor starts |
| `finish_to_finish` | FF | Predecessor finishes before successor finishes |
| `start_to_finish` | SF | Predecessor starts before successor finishes |

**Supported archetypes:** `project`, `task`, `activity`

## Non-DataForge Data Sources

Use `collectionOverride` for MobX stores or external APIs:
- Must implement: `{ items, count, insert?, update?, delete? }`
- Use `skipDataFetching={true}` to prevent DataForge API fetch
- Store `_originalData` for row actions

## Common Mistakes

- Expansion/collapse logic in `features/` (should be grid primitive)
- Row interaction handlers in domain stores (grid should handle)
- Custom `Set<string>` for tracking row state in domain (use VibeGrid config)
- Using `.vibegridx-cell` selector in tests (catches internal columns)

## Key Files

| File | Purpose |
|------|---------|
| `VibeGrid.tsx` | Main component, props interface |
| `components/ActionsBar.tsx` | Row actions UI |
| `stores/InteractionStore.ts` | UI state (selection, menus) |
| `stores/GanttViewStore.ts` | Gantt state |
| `utils/cascade-scheduler.ts` | Date cascading |
| `processors/DependencyProcessor.ts` | Dependency CRUD |
