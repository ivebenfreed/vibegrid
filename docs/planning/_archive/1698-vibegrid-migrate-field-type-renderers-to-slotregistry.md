---
github_issue: 1698
initiative: GH#1698-vibegrid-slotregistry-migration
type: chore
issue_type: chore
status: superseded-by-1743
priority: medium
owner: null
created: 2026-03-14
updated: 2026-03-14
phases:
  - id: p1
    name: "Audit and map FieldTypeRegistry → SlotRegistry gaps"
    tasks:
      - "Inventory all FieldTypeRegistry capabilities used by ModularCellBridge and CellFactory"
      - "Map each FieldTypeRegistry feature to its SlotRegistry equivalent in slot-initialization.ts"
      - "Identify gaps where SlotRegistry renderers lack FieldTypeRegistry capabilities (affordances, interaction policies, editors, validators)"
      - "Document which consumers depend on FieldTypeRegistry directly vs through ModularCellBridge"
      - "Measure baseline cell render time with performance.mark() for before/after comparison"
  - id: p2
    name: "Enrich SlotRegistry renderers with missing capabilities"
    tasks:
      - "Add interactionPolicy to all slot-initialization renderers that need it (matching FieldTypeRegistry field types)"
      - "Add affordanceGroup metadata to slot renderers for AffordanceResolver compatibility"
      - "Ensure slot renderers support getFormatter() for the fast-path in column-generation.ts"
      - "Add Slot.canHandle() predicates to slot registrations for entity-name, user-reference, entity-reference (uses existing Slot interface, not an API change)"
      - "Add validate() and format() to slot renderers that need them"
  - id: p3
    name: "Migrate ModularCellBridge to use SlotRegistry"
    tasks:
      - "Refactor ModularCellBridge to resolve renderers via SlotRegistry.resolve() instead of FieldTypeRegistry.getFieldType()"
      - "Update column-generation.ts to attach slot-based formatter/renderer to columns"
      - "Verify InitStore's existing preloadForColumns() call still works after removing FTR dependency (no new call needed — preload already exists)"
      - "Ensure ModularCellBridge.createCellFast() works with slot-resolved renderers"
      - "Remove CellFactory dependency from ModularCellBridge (SlotRegistry replaces it)"
  - id: p4
    name: "Remove FieldTypeRegistry registrations and clean up"
    tasks:
      - "Remove fieldTypeRegistry.register() calls from all 25 field type implementation files"
      - "Remove or deprecate FieldTypeRegistry class and its singleton"
      - "Remove CellFactory (replaced by SlotRegistry resolution)"
      - "Update .claude/rules/vibegrid.md to reflect completed migration"
      - "Update FIELD_TYPE_MODULAR_ARCHITECTURE_PLAN.md status"
      - "Add regression tests verifying SlotRegistry-based resolution produces identical output to previous FTR-based resolution"
      - "Run full test suite and fix any regressions"
---

# Migrate Field Type Renderers from FieldTypeRegistry to SlotRegistry

> GitHub Issue: [#1698](https://github.com/baseplane-ai/baseplane/issues/1698)

## Problem

`.claude/rules/vibegrid.md` rule #4 states:

> Cell renderers — register via `SlotRegistry` only (not FieldTypeRegistry)

But **all ~30 field types use `FieldTypeRegistry`** (25 implementation files calling `fieldTypeRegistry.register()`). SlotRegistry is only used by view-mode modules (GanttModule) and the parallel renderers in `slot-initialization.ts`.

This creates a rules/reality gap and two parallel rendering systems that must be kept in sync.

## Current Architecture

Three layers exist for cell rendering, creating redundancy:

```
FieldTypeRegistry (25 field type files register here)
       ↓
ModularCellBridge (wraps FTR, creates CellFactory)
       ↓
CellFactory (uses FTR.getFieldType() to create cells)

SlotRegistry (slot-initialization.ts registers parallel renderers)
       ↓
SlotRegistry.resolve() (used by BodyRenderer via SimplePassiveRenderer)
```

**Key insight**: `slot-initialization.ts` already has a **complete parallel set** of CellRenderer implementations registered with SlotRegistry at priority 0. The SlotRegistry renderers are the "D2" system designed to replace FTR+MCB+CellFactory.

## Target Architecture

```
SlotRegistry (single source of truth)
  ├── Default renderers (priority 0) — from slot-initialization.ts
  ├── Domain renderers (priority 50) — from features/{domain}/schemas/
  └── View-mode renderers (priority 100) — from modules/{mode}/

ModularCellBridge → resolves via SlotRegistry (not FieldTypeRegistry)
FieldTypeRegistry → REMOVED
CellFactory → REMOVED
```

## Scope

**In scope:**
- Migrate ModularCellBridge from FieldTypeRegistry to SlotRegistry
- Enrich SlotRegistry renderers with missing capabilities (interaction policies, affordances, validators)
- Remove FieldTypeRegistry registrations from all 25 field type files
- Remove CellFactory (replaced by SlotRegistry)
- Update rules and documentation

**Out of scope:**
- Changing how renderers work internally (render logic stays the same)
- Adding new field types
- Changing the SlotRegistry class API (Slot interface, register/resolve signatures)
- Modifying view-mode module registration (GanttModule etc. already use SlotRegistry)
- Migrating RelationshipDataManager or RollupCalculationManager (they remain in ModularCellBridge)

## Key Files

### To Modify

| File | Change |
|------|--------|
| `systems/vibegrid/slots/slot-initialization.ts` | Add missing capabilities (interactionPolicy, affordanceGroup, validators) |
| `systems/vibegrid/field-types/ModularCellBridge.ts` | Switch from FTR to SlotRegistry resolution |
| `systems/vibegrid/stores/column-generation.ts` | Use SlotRegistry for formatter/renderer attachment |
| `systems/vibegrid/stores/InitStore.ts` | Ensure SlotRegistry preload before render |

### To Remove/Deprecate

| File | Action |
|------|--------|
| `systems/vibegrid/field-types/FieldTypeRegistry.ts` | Deprecate or remove class; keep type exports |
| `systems/vibegrid/factories/CellFactory.ts` | Remove (replaced by SlotRegistry) |
| 25 files in `field-types/implementations/` | Remove `fieldTypeRegistry.register()` calls (~50 register() calls across 25 files, since some files register multiple types) |

### Unchanged

| File | Why |
|------|-----|
| `systems/vibegrid/slots/SlotRegistry.ts` | API is stable, no changes needed |
| `systems/vibegrid/modules/gantt/GanttModule.tsx` | Already uses SlotRegistry correctly |

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| SlotRegistry renderers missing capabilities vs FTR | Phase 1 audit identifies all gaps before migration |
| Column-generation fast path breaks | Phase 2 ensures getFormatter() works with slot renderers |
| Affordance system breaks | Phase 2 preserves affordanceGroup on all slot renderers |
| CellActionRouter routing changes | InteractionPolicy preserved on all slot renderers |
| Performance regression | SlotRegistry preload already exists; measure before/after |

## Success Criteria

- [ ] All field types render correctly via SlotRegistry (no FieldTypeRegistry dependency)
- [ ] ModularCellBridge resolves renderers through SlotRegistry
- [ ] CellFactory removed, no consumers remain
- [ ] FieldTypeRegistry class removed or deprecated (type exports preserved)
- [ ] `.claude/rules/vibegrid.md` rule #4 matches reality
- [ ] No visual or behavioral regression in grid rendering
- [ ] All existing tests pass
- [ ] Cell render time stays <16ms

## Behaviors

### B1: Default field type resolution
**Given** a column with `cellType: "text"` and no domain/view overrides
**When** SlotRegistry resolves the renderer
**Then** the priority-0 text renderer from slot-initialization.ts is used
**Verify:** Unit test — register text slot, call `resolve()`, assert returned renderer is the text slot's renderer

### B2: Domain-specific override
**Given** a column with `cellType: "currency"` in a Budget entity context
**When** a domain renderer is registered at priority 50 with `contextFilter: (ctx) => ctx.entityType === 'Budget'`
**Then** the domain renderer wins over the default priority-0 renderer
**Verify:** Unit test — register default (priority 0) + domain (priority 50) slots, resolve with Budget context, assert domain renderer returned

### B3: View-mode override
**Given** a date column in Gantt view mode
**When** GanttModule registers a gantt-bar slot at priority 100
**Then** the gantt-bar renderer wins over default and domain renderers
**Verify:** Existing test in `modules/__tests__/integration.test.ts` covers this. Confirm it still passes.

### B4: Affordance system preserved
**Given** a cell rendered via SlotRegistry
**When** the renderer has `affordanceGroup` metadata
**Then** AffordanceResolver applies correct hover/cursor CSS attributes
**Verify:** Browser test — render a grid, inspect DOM for `data-affordance-*` attributes on cells

### B5: Interaction policy preserved
**Given** an entity-name cell with `defaultAction: 'navigate'`
**When** user clicks the cell content
**Then** CellActionRouter invokes navigation (not editing)
**Verify:** Browser test — click entity-name cell, assert navigation occurs (not edit overlay)

### B6: Fast-path rendering preserved
**Given** a column with a pre-computed `formatter` function
**When** ModularCellBridge.createCellFast() is called
**Then** the slot-resolved renderer's `render()` is used for content, maintaining <16ms frame time
**Verify:** Measure render time with `performance.mark()` before/after migration. Compare against Phase 1 baseline.

### B7: SlotRegistry preload completes before first render
**Given** a grid initializing with columns
**When** InitStore runs initialization
**Then** `SlotRegistry.preloadForColumns()` completes before any cell `resolve()` call
**Verify:** Unit test — mock preloadForColumns, assert it's called before first resolve() in InitStore flow
