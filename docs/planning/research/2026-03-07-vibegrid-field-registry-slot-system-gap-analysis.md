---
date: 2026-03-07
topic: VibeGrid Field Registry vs Slot System Gap Analysis
status: complete
github_issue: 1416
---

# Research: VibeGrid Field Registry vs Slot System

## Context

VibeGrid has two parallel cell rendering systems. The rules files (.claude/rules/vibegrid.md) declare SlotRegistry as canonical, but all actual cell rendering goes through the legacy FieldTypeRegistry. This research documents the full gap between intent and reality, and evaluates options forward.

## Questions Explored

1. What are the two systems and how do they differ architecturally?
2. Which one actually renders cells today?
3. What is the migration status from Issue #1416 (D2 spec)?
4. Where does the documentation diverge from reality?
5. What are the viable paths forward?

---

## Findings

### System 1: FieldTypeRegistry + ModularCellBridge + CellFactory (Legacy - ACTIVE)

This is the system that **renders every cell in VibeGrid today**.

**Rendering pipeline:**
```
column-generation.ts                    FieldTypeRegistry
  enrichColumnsWithFieldTypes()              .ensureInitialized() [lazy loads ~25 impl files]
       |                                          |
       v                                          v
  column.formatter = ...                    fieldTypeRegistry.register('text', TextFieldType)
  column.fieldType = ...                    fieldTypeRegistry.register('select', SelectFieldType)
       |                                    fieldTypeRegistry.register('entity-name', ...)
       v                                          |
  BodyRenderer.createCellElement()                |
       |                                          v
       v                                    fieldTypeRegistry.getFieldType(column)
  modularCellBridge.createCell()                  |
       |                                          v
       +---> Fast Path: column.formatter    VibeGridFieldType
       |     exists -> direct DOM creation  .renderer.render()
       +---> Legacy Path: CellFactory
             -> FieldTypeRegistry
             -> renderer.render()
```

**Components:**

| Component | File | Role |
|-----------|------|------|
| FieldTypeRegistry | `field-types/FieldTypeRegistry.ts` | Maps type strings -> `VibeGridFieldType` objects. Global singleton. |
| ModularCellBridge | `field-types/ModularCellBridge.ts` | Bridge between BodyRenderer and registry. Affordance caching, column enhancement, relationship data, rollup calculations. |
| CellFactory | `factories/CellFactory.ts` | Creates DOM elements. Dispatches by category (basic/relationship/rollup/computed). |
| SchemaAdapter | `schema/SchemaAdapter.ts` | Enhances raw columns with backend metadata. |
| AffordanceResolver | `affordances/AffordanceResolver.ts` | Resolves CSS cursor/hover behavior per field type. |

**Registration pattern:** Each field type self-registers as a side effect of import:
```typescript
// Bottom of TextFieldType.ts
fieldTypeRegistry.register('text', TextFieldType)
```

Lazy-loaded via `FieldTypeRegistry.ensureInitialized()` which dynamically imports all implementation files.

**Registered field types (40 registrations across 26 files):**

| Category | Types | Count |
|----------|-------|-------|
| Basic | text, entity-name, number, date, boolean, select, email, url, phone, color, currency, file, rating, slider, image, markdown, rich-text, richtext, html, textarea, longtext, row-expand | 22 |
| Relationship | custom_user_reference, user_reference, custom_entity_reference, entity_reference | 4 |
| Rollup | rollup_count, rollup_sum, rollup_average, rollup_concat | 4 |
| Computed | computed_expression, computed_formula, computed_decision_table | 3 |
| Domain (features/) | badge-list (admin) | 1 |

**VibeGridFieldType interface (heavy):**
```typescript
interface VibeGridFieldType {
  type: string
  category: 'basic' | 'relationship' | 'rollup' | 'computed'
  renderer: CellRenderer           // render(), update(), canHandle()
  editor: CellEditor               // create(), getValue(), validate(), destroy()
  formatter: CellFormatter          // format(), parse(), formatForDisplay(), formatForExport()
  validator?: CellValidator
  metadata: FieldMetadata           // supportsSorting, supportsFiltering, hasRichDisplay...
  getFormatter?(): (value, rowData?, column?) => string
  getEditor?(): any
  getStyles?(value, column): Record<string, string>
  interactionPolicy?: FieldInteractionPolicy
  handleClick?(context): void
  affordance?: FieldTypeAffordance
  relationshipConfig?: RelationshipConfig
  rollupConfig?: RollupConfig
  asyncDataLoader?: AsyncDataLoader
  rollupCalculator?: RollupCalculator
}
```

**Usage scope:** 45 files across vibegrid. Key consumers:
- `renderers/components/BodyRenderer.ts` - Cell creation in render loop
- `renderers/core/SimplePassiveRenderer.ts` - Passes bridge to BodyRenderer
- `stores/column-generation.ts` - Pre-computes formatters onto columns
- `routing/CellActionRouter.ts` - Reads interaction policies
- `coordination/InteractionCoordinator.ts` - Editing coordination
- `components/VibeForm.tsx` / `VibeFormField.tsx` - Form-mode rendering
- `stores/InitStore.ts` - Grid initialization

---

### System 2: SlotRegistry (New - DESIGNED BUT UNUSED)

Designed as the replacement system per Issue #1416 Section 3 (D2 spec). Priority-based cell renderer resolution with context filtering.

**Intended pipeline:**
```
GridModule.registerSlots(slotRegistry)
     |
     v
slotRegistry.register({ id, priority, contextFilter, renderer })
     |
     v
slotRegistry.preloadForColumns(columns, context)   [async, before render]
     |
     v
slotRegistry.resolve(column, context)              [sync, cache-only, hot path]
     |
     v
CellRenderer.render(value, column, context)
```

**Resolution algorithm:**
1. Filter slots by `contextFilter(context)` - scopes by viewMode, entityType, schemaId
2. Filter by `canHandle(column, context)` predicate OR exact `slot.id === column.fieldType`
3. Sort by priority descending (higher wins: view=100, domain=50, default=0)
4. Return highest priority match, or fallback to 'text' renderer

**CellRenderer interface (simpler, unified):**
```typescript
interface CellRenderer {
  render(value, column, context): HTMLElement
  update?(value, newValue, column, context): Promise<void>
  renderEditor?(value, column, context): HTMLElement
  validate?(value, column, context): string | null
  format?(value, column, context): string
  asyncDataLoader?(value, column, context): Promise<void>
  rollupCalculator?(relatedData[], column, context): unknown
  affordances?: { sortable?, filterable?, editable?, resizable?, reorderable?, groupable? }
  interactionPolicy?: { clickable?, hoverable?, draggable?, selectable? }
  metadata?: { category?, description? }
  dispose?(): void
}
```

**Current usage (5 files only):**
1. `slots/SlotRegistry.ts` - Implementation
2. `slots/__tests__/SlotRegistry.test.ts` - Tests
3. `modules/GridModule.ts` - Interface definition (`registerSlots` parameter type)
4. `modules/gantt/GanttModule.tsx` - Stub: `registerSlots: (_slotRegistry) => { /* D2 integration point */ }`
5. `modules/__tests__/integration.test.ts` - Integration tests

**Zero feature domains** register slots. **Zero rendering paths** use SlotRegistry.

---

### Architectural Comparison

| Feature | FieldTypeRegistry (Legacy) | SlotRegistry (New) |
|---------|---------------------------|-------------------|
| Context scoping | None (global) | viewMode, entityType, schemaId, orgId |
| Priority resolution | Fixed order (specific before generic canHandle) | Numeric priority (100 > 50 > 0) |
| View mode overrides | Not supported | Built-in via contextFilter |
| Domain overrides | Must register globally | contextFilter scoping |
| Multi-tenant | Not supported | organizationId in context |
| Cache invalidation | None (manual) | Partial invalidation by context dimension |
| Async preload | `ensureInitialized()` loads all types | `preloadForColumns()` loads per-grid |
| Sync render path | `getFieldType()` does resolution + return | `resolve()` is pure cache lookup |
| Interface weight | Heavy (renderer + editor + formatter + validator + metadata) | Light (single CellRenderer with optional methods) |

---

## Gap Analysis

### Gap 1: Documentation-Reality Mismatch

**Rules say:**
- `.claude/rules/vibegrid.md`: "Cell renderers - register via SlotRegistry only (not FieldTypeRegistry)"
- `.claude/rules/vibegrid.md` anti-pattern: "Registering cell renderers in 3 places -> use SlotRegistry only"
- `.claude/rules/vibegrid-interactions.md`: "SlotRegistry replaces the old FieldTypeRegistry + ModularCellBridge + CellFactory layers"

**Reality:** All 40 field type registrations use `fieldTypeRegistry.register()`. Zero use `slotRegistry.register()`. The BodyRenderer exclusively calls `modularCellBridge.createCell()`.

**Impact:** New code following the rules would register slots that never render. The rules actively mislead development.

### Gap 2: No Rendering Pipeline Integration

The SlotRegistry has no connection to the actual rendering pipeline:

```
BodyRenderer -> modularCellBridge -> CellFactory -> FieldTypeRegistry  (ACTUAL)
                                                     ^
                                                     | SlotRegistry is NOT here
```

To integrate, someone would need to:
1. Replace `modularCellBridge.createCell()` in BodyRenderer with `slotRegistry.resolve()`
2. Or have ModularCellBridge delegate to SlotRegistry before falling back to FieldTypeRegistry
3. Port all 40 registrations from FieldTypeRegistry to SlotRegistry format
4. Handle the interface mismatch

### Gap 3: Interface Incompatibility

| Aspect | FieldTypeRegistry CellRenderer | SlotRegistry CellRenderer |
|--------|-------------------------------|--------------------------|
| render() | `(value, column: EnhancedColumn, rowData)` | `(value, column: Column, context: CellRendererContext)` |
| update() | `(element, value, column)` | `(value, newValue, column, context): Promise<void>` |
| canHandle() | On renderer: `(column) => boolean` | On slot: `(column, context) => boolean` |
| Context | Not passed (global state) | Explicit `CellRendererContext` parameter |
| Editor | Separate `CellEditor` interface | Optional `renderEditor()` on same interface |
| Formatter | Separate `CellFormatter` interface | Optional `format()` on same interface |

A direct port requires rewriting every field type implementation.

### Gap 4: Orphaned D2 Infrastructure

GanttModule has a stub `registerSlots` for timeline bars, milestones, dependency arrows. Never implemented. The D2 spec anticipated view modes extending cell rendering via slots, but no view mode actually does so.

### Gap 5: CellType Union Drift

`column-types.ts` CellType union lists 45+ type strings. FieldTypeRegistry handles ~30 via direct registration + canHandle aliases. Several types have no dedicated handler and fall through:
- `integer`, `decimal`, `percentage` -> number via canHandle
- `datetime`, `datetime-local`, `time`, `timestamp`, `timestamptz` -> date via canHandle
- `status`, `status_option`, `priority_option`, etc. -> select via canHandle
- `json` -> falls back to text
- `currency-abbreviated`, `additional-insured`, `expiration-date` -> COI-specific, listed in CellType but no implementations found in current tree

### Gap 6: No Domain Slot Registration Pattern

Rules describe domain slot registration at `features/{domain}/schemas/{entity}-field-types.ts`. Only `features/admin/schemas/admin-field-types.ts` exists, and it registers with `fieldTypeRegistry`, not `slotRegistry`.

---

## Options

### Option A: Complete D2 Migration (SlotRegistry replaces FieldTypeRegistry)

**Scope:** Large (~40+ files)

1. Create adapter: wrap each `VibeGridFieldType` as a `Slot` with `CellRenderer` interface
2. Register all existing field types as default-priority (0) slots
3. Replace `modularCellBridge.createCell()` in BodyRenderer with `slotRegistry.resolve()`
4. Port `enrichColumnsWithFieldTypes()` to `slotRegistry.preloadForColumns()`
5. Migrate domain registrations to slot format
6. Deprecate FieldTypeRegistry, ModularCellBridge, CellFactory
7. Implement GanttModule slot registrations

**Pros:** Fulfills architectural vision. Enables context-scoped overrides. Fixes doc-reality gap.
**Cons:** Large blast radius. High regression risk for a working system.

### Option B: Adapter Bridge (SlotRegistry delegates to FieldTypeRegistry)

**Scope:** Medium (~10 files)

1. In `slotRegistry.preloadForColumns()`, auto-register FieldTypeRegistry types as fallback slots (priority 0)
2. Wire BodyRenderer to call `slotRegistry.resolve()` first, fall back to `modularCellBridge`
3. New domain/view-mode renderers use SlotRegistry (higher priority wins)
4. Existing field types continue working unchanged

**Pros:** Incremental. No rewrite. New code uses the right system.
**Cons:** Two systems coexist permanently. Resolution logic split.

### Option C: Accept FieldTypeRegistry as Canonical, Retire SlotRegistry

**Scope:** Small (~5 files + docs)

1. Update rules to match reality: FieldTypeRegistry is the system
2. Remove or archive SlotRegistry
3. If context-scoped rendering needed later, add context to FieldTypeRegistry
4. Remove registerSlots from GridModule interface

**Pros:** Smallest change. Eliminates confusion. Docs match code.
**Cons:** Loses architectural benefits of context-scoped resolution and priority overrides.

### Option D: Freeze Both, Decide Later

**Scope:** Minimal (docs only)

1. Update rules to say "FieldTypeRegistry is current, SlotRegistry is future"
2. Add migration tracking issue
3. No code changes

**Pros:** Zero risk. Acknowledges reality.
**Cons:** Confusion persists. Neither system evolves cleanly.

---

## Recommendations

**Option B (Adapter Bridge)** is the pragmatic path:

- Eliminates the documentation-reality mismatch immediately
- Allows new domain and view-mode renderers to use SlotRegistry
- Doesn't require rewriting 40 field type implementations
- Creates a gradual migration path (individual field types ported to pure slots over time)
- Unblocks GanttModule D2 integration (timeline bars as slots)

**Regardless of option chosen**, the first step is: update `.claude/rules/vibegrid.md` and `vibegrid-interactions.md` to accurately describe the current state and migration plan.

---

## Open Questions

- Is the GanttModule D2 integration (Gantt-specific cell renderers) still on the roadmap?
- Are there other planned view modes that would benefit from slot-based cell overrides?
- Should the CellType union in column-types.ts be pruned of types with no handler?
- What is the status of the COI-specific field types (currency-abbreviated, additional-insured, expiration-date) listed in CellType?

---

## File Inventory

### FieldTypeRegistry Consumers (45 files)

| Category | Files |
|----------|-------|
| Core | FieldTypeRegistry.ts, ModularCellBridge.ts, field-types/index.ts |
| Factories | CellFactory.ts |
| Schema | SchemaAdapter.ts |
| Stores | column-generation.ts, InitStore.ts |
| Renderers | BodyRenderer.ts, SimplePassiveRenderer.ts |
| Routing | CellActionRouter.ts |
| Coordination | InteractionCoordinator.ts |
| Affordances | AffordanceResolver.ts |
| Components | VibeForm.tsx, VibeFormField.tsx |
| Implementations | 16 basic + 2 relationship + 4 rollup + 3 computed type files |
| Domain | features/admin/schemas/admin-field-types.ts |

### SlotRegistry Consumers (5 files)

| File | Usage |
|------|-------|
| slots/SlotRegistry.ts | Implementation |
| slots/__tests__/SlotRegistry.test.ts | Tests |
| modules/GridModule.ts | Interface definition |
| modules/gantt/GanttModule.tsx | Stub |
| modules/__tests__/integration.test.ts | Integration tests |

---

## Next Steps

Decision needed from user on which option to pursue. If Option B, the implementation would be:

1. Update rules files (immediate, low risk)
2. Create FieldTypeRegistry-to-Slot adapter in SlotRegistry
3. Wire SlotRegistry into BodyRenderer's cell creation path
4. Validate with existing field types rendering correctly
5. Add first real slot registration (e.g., Gantt timeline bar)
