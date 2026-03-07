---
issue: 1743
github_issue: 1743
type: feature
title: "VibeGrid D2: Full SlotRegistry Migration - Replace FieldTypeRegistry"
status: approved
created: 2026-03-07
updated: 2026-03-07
parent: 1416
phases:
  - id: p1-pipeline
    name: "Phase 1: Pipeline Rewiring"
    tasks:
      - "TEST: Write pipeline integration tests (SlotRegistry resolve in render loop)"
      - "IMPL: Update Column type in types.ts: remove fieldType, remove editorInstance"
      - "IMPL: Make SlotRegistry instance-scoped (per VibeGridStoreProvider, not global singleton)"
      - "IMPL: Create registerDefaultSlots() function for shared field type registrations"
      - "IMPL: Wire SlotRegistry.resolve() into BodyRenderer.createCellElement()"
      - "IMPL: Replace fieldTypeRegistry.ensureInitialized() with slotRegistry.preloadForColumns() in InitStore"
      - "IMPL: Update CellActionRouter to read interactionPolicy from resolved CellRenderer"
      - "IMPL: Thread CellRendererContext through InteractionCoordinator"
      - "IMPL: Update EditingStore to resolve renderer from SlotRegistry (validation, blur handling)"
      - "IMPL: Update utils/hashing.ts to use column.cellType instead of column.fieldType"
      - "IMPL: Create applyAffordanceAttrs() helper for CellRenderers to stamp DOM data attributes"
      - "IMPL: Update column-generation.ts to pre-compute via SlotRegistry"
      - "IMPL: Update SimplePassiveRenderer to inject SlotRegistry instead of ModularCellBridge"
      - "IMPL: Wire module.registerSlots(slotRegistry) call in VibeGrid.tsx module activation path"
      - "IMPL: Re-home affordance precompute from ModularCellBridge to VisualStateStore using SlotRegistry"
      - "IMPL: Add slotRegistry.clearCacheForContext() + preloadForColumns() on view-mode/schema/org context changes"
      - "VERIFY: Grid renders with SlotRegistry pipeline (text fallback for all cells)"
      - "VERIFY: Existing SlotRegistry.test.ts passes"
      - "VERIFY: TypeScript compiles cleanly"

  - id: p2a-basic
    name: "Phase 2a: Basic Field Types (16 classes)"
    tasks:
      - "TEST: Write CellRenderer unit tests for text, number, date, boolean, select"
      - "TEST: Write CellRenderer unit tests for email, url, phone, color, currency"
      - "TEST: Write CellRenderer unit tests for file, rating, slider, image, markdown"
      - "TEST: Write CellRenderer unit tests for entity-name, row-expand"
      - "IMPL: Rewrite TextFieldType as text CellRenderer"
      - "IMPL: Rewrite NumberFieldType as number CellRenderer (+ integer, decimal, percentage, currency aliases)"
      - "IMPL: Rewrite DateFieldType as date CellRenderer (+ datetime, time, timestamp aliases)"
      - "IMPL: Rewrite BooleanFieldType as boolean CellRenderer"
      - "IMPL: Rewrite SelectFieldType as select CellRenderer (+ single-select, multi-select, enum, status aliases)"
      - "IMPL: Rewrite EmailFieldType, UrlFieldType, PhoneFieldType as CellRenderers"
      - "IMPL: Rewrite ColorFieldType, CurrencyFieldType as CellRenderers"
      - "IMPL: Rewrite FileFieldType, ImageFieldType as CellRenderers"
      - "IMPL: Rewrite RatingFieldType, SliderFieldType as CellRenderers"
      - "IMPL: Rewrite MarkdownFieldType as markdown CellRenderer (+ rich-text, richtext, html, textarea, longtext aliases)"
      - "IMPL: Rewrite EntityNameFieldType, RowExpandFieldType as CellRenderers"
      - "IMPL: Register all basic slots in SlotRegistry initialization"
      - "IMPL: Port features/admin/schemas/admin-field-types.ts (badge-list) to SlotRegistry format"
      - "VERIFY: All basic field types render identically to before"
      - "VERIFY: All basic type unit tests pass"

  - id: p2b-relationship
    name: "Phase 2b: Relationship Field Types (2 classes)"
    tasks:
      - "TEST: Write CellRenderer tests for entity_reference and user_reference"
      - "TEST: Write async data loading tests (cache hit, cache miss, loading state)"
      - "IMPL: Rewrite EntityReferenceFieldType as CellRenderer with asyncDataLoader"
      - "IMPL: Rewrite UserReferenceFieldType as CellRenderer with asyncDataLoader"
      - "IMPL: Register relationship slots with category metadata"
      - "VERIFY: Relationship cells render with loaded data"
      - "VERIFY: Loading state displays correctly"
      - "VERIFY: Cache behavior matches previous implementation"

  - id: p2c-rollup
    name: "Phase 2c: Rollup Field Types (4 classes)"
    tasks:
      - "TEST: Write CellRenderer tests for rollup_count, rollup_sum, rollup_average, rollup_concat"
      - "TEST: Write rollupCalculator tests with sample related data"
      - "IMPL: Rewrite RollupCountFieldType as CellRenderer with rollupCalculator"
      - "IMPL: Rewrite RollupSumFieldType as CellRenderer with rollupCalculator"
      - "IMPL: Rewrite RollupAverageFieldType as CellRenderer with rollupCalculator"
      - "IMPL: Rewrite RollupConcatFieldType as CellRenderer with rollupCalculator"
      - "IMPL: Register rollup slots with read-only affordances"
      - "VERIFY: Rollup cells calculate and display correctly"

  - id: p2d-computed
    name: "Phase 2d: Computed Field Types (3 classes)"
    tasks:
      - "TEST: Write CellRenderer tests for computed_expression, computed_formula, computed_decision_table"
      - "IMPL: Rewrite ComputedExpressionFieldType as CellRenderer"
      - "IMPL: Rewrite ComputedFormulaFieldType as CellRenderer"
      - "IMPL: Rewrite ComputedDecisionTableFieldType as CellRenderer"
      - "IMPL: Register computed slots with read-only affordances"
      - "VERIFY: Computed cells display correctly"

  - id: p3-forms
    name: "Phase 3: Form Integration"
    tasks:
      - "TEST: Write form-mode slot resolution tests (viewMode='form')"
      - "TEST: Write VibeForm rendering tests via SlotRegistry"
      - "IMPL: Update VibeForm.tsx to resolve metadata via slotRegistry.resolve(column, { viewMode: 'form' })"
      - "IMPL: Update VibeFormField.tsx to read affordanceGroup/interactionPolicy from resolved CellRenderer; keep React overlay editors"
      - "IMPL: Wire CellRenderer.validate() into VibeFormField validation path"
      - "IMPL: Wire CellRenderer.format() into VibeFormField read-only display"
      - "VERIFY: VibeForm renders all field types correctly"
      - "VERIFY: Form editing (create, update) works end-to-end"
      - "VERIFY: Form validation works via CellRenderer.validate()"

  - id: p4-gantt
    name: "Phase 4: Gantt Slot Implementations"
    tasks:
      - "TEST: Write Gantt slot resolution tests (contextFilter viewMode='gantt')"
      - "TEST: Write GanttDateSummaryRenderer unit tests"
      - "IMPL: Create GanttDateSummaryRenderer (compact date range in left table pane)"
      - "IMPL: Create GanttStatusChipRenderer (progress chip in left table pane)"
      - "IMPL: Register Gantt left-pane slots in GanttModule.registerSlots() at priority 100"
      - "VERIFY: Gantt left-pane date columns use compact format"
      - "VERIFY: Priority override works (Gantt renderer wins over default date renderer in left pane)"

  - id: p5-cleanup
    name: "Phase 5: Legacy Cleanup"
    tasks:
      - "VERIFY: All ModularCellBridge responsibilities re-homed (affordance precompute, schema enhancement, fast-path, update plumbing, relationship data)"
      - "IMPL: Delete FieldTypeRegistry.ts"
      - "IMPL: Delete ModularCellBridge.ts"
      - "IMPL: Delete CellFactory.ts"
      - "IMPL: Delete all old field type implementation files (implementations/basic/*, relationship/*, rollup/*, computed/*)"
      - "IMPL: Remove dead imports across all consumer files"
      - "IMPL: Update field-types/index.ts exports"
      - "IMPL: Update .claude/rules/vibegrid.md to reflect SlotRegistry as canonical"
      - "IMPL: Update .claude/rules/vibegrid-interactions.md"
      - "IMPL: Audit CellType union usage (currency-abbreviated, additional-insured, expiration-date, json) across column-types.ts, column-defaults.ts, csv-export.ts; add fallback aliases to text/currency slots or remove if truly unused"
      - "VERIFY: Zero imports of FieldTypeRegistry, ModularCellBridge, CellFactory remain"
      - "VERIFY: TypeScript compiles cleanly"
      - "VERIFY: All tests pass"
      - "VERIFY: Performance benchmarks meet thresholds"

  - id: finalization
    name: "Finalization"
    tasks:
      - "VERIFY: Codex code review passes"
      - "TASK: Commit and push changes"
      - "TASK: Update GitHub issue #1743 with results"
---

# Feature Spec: VibeGrid D2 - Full SlotRegistry Migration

## Context

**GitHub Issue:** #1743 (child of #1416)
**Research:** `planning/research/2026-03-07-vibegrid-field-registry-slot-system-gap-analysis.md`
**Type:** Architecture/Refactoring
**Epic:** VibeGrid Architecture Consolidation
**Decision:** Option A (full migration) chosen over Option B (adapter bridge). The research recommended Option B for lower risk, but the user chose full rewrite for a cleaner end state — no dual-system coexistence.

### Problem

VibeGrid has two parallel cell rendering systems:

1. **FieldTypeRegistry** (active) - Global singleton, 25 field type classes, 52+ type string registrations, 45 consumer files. Heavy `VibeGridFieldType` interface with separate renderer/editor/formatter/validator objects.

2. **SlotRegistry** (designed, unused) - Priority-based, context-scoped resolution. Lighter `CellRenderer` interface. 5 files, zero rendering paths.

The rules files declare SlotRegistry as canonical, but all rendering goes through FieldTypeRegistry. This causes:
- Documentation actively misleads development
- No context-scoped rendering (per viewMode, entityType, org)
- No priority-based overrides (domain > generic)
- GanttModule D2 integration blocked

### Solution

Full migration: replace FieldTypeRegistry with SlotRegistry as the sole cell rendering system. Rewrite all 25 field type classes to implement the `CellRenderer` interface directly. Include form-mode rendering and Gantt-specific slot implementations.

---

## Architecture

### New Rendering Pipeline

```
InitStore
  slotRegistry.preloadForColumns(columns, context)  [async, grid initialization]
       |
       v
SimplePassiveRenderer
  injects slotRegistry into BodyRenderer
       |
       v
BodyRenderer.createCellElement()
  renderer = slotRegistry.resolve(column, context)   [sync, cache lookup]
  element = renderer.render(value, column, context)
       |
       v
CellActionRouter
  reads renderer.interactionPolicy
       |
       v
InteractionCoordinator
  calls renderer.renderEditor() for editing
  calls renderer.validate() for validation
```

### CellRenderer Interface (Target)

All field types implement this interface directly:

```typescript
interface CellRenderer {
  // Required
  render(value: unknown, column: Column, context: CellRendererContext): HTMLElement

  // Optional capabilities
  update?(value: unknown, newValue: unknown, column: Column, context: CellRendererContext): Promise<void>
  renderEditor?(value: unknown, column: Column, context: CellRendererContext): HTMLElement
  validate?(value: unknown, column: Column, context: CellRendererContext): string | null
  format?(value: unknown, column: Column, context: CellRendererContext): string

  // Domain-specific
  asyncDataLoader?(value: unknown, column: Column, context: CellRendererContext): Promise<void>
  rollupCalculator?(relatedData: unknown[], column: Column, context: CellRendererContext): unknown

  // Declarative metadata
  affordances?: {
    sortable?: boolean
    filterable?: boolean
    editable?: boolean
    resizable?: boolean
    reorderable?: boolean
    groupable?: boolean
  }

  // Interaction policy — preserves CellActionRouter's routing semantics
  interactionPolicy?: {
    defaultAction: 'navigate' | 'edit' | 'custom' | 'none'
    editTrigger: 'content-click' | 'click' | 'f2' | 'icon' | 'none'
    blurPolicy: 'commit' | 'cancel' | 'keep-open'
  }

  // Affordance group — preserves AffordanceResolver's group-based styling
  affordanceGroup?: {
    group: string                    // e.g., 'editable-content', 'editable-badge'
    whenNotEditable: string | { remove: string[] } | { override: any[] }
  }

  // Custom click handler (for 'custom' defaultAction)
  handleClick?(context: CellRendererContext & { rowData: any; column: Column }): void

  // DOM affordance application — shared helper stamps data-affordance attrs on rendered elements
  // Each CellRenderer calls applyAffordanceAttrs(element, this) in render() to ensure
  // CellActionRouter can read data-affordance/data-affordance-role from the DOM.
  // This preserves entity-name pencil icon, select badge click, boolean toggle, URL link behavior.

  metadata?: {
    category?: 'basic' | 'relationship' | 'rollup' | 'computed'
    description?: string
  }

  dispose?(): void
}
```

### CellRendererContext

```typescript
interface CellRendererContext {
  viewMode?: string        // 'table', 'kanban', 'gantt', 'form'
  entityType?: string      // 'Project', 'Task', etc.
  schemaId?: string
  organizationId?: string
  relationshipData?: Map<string, unknown>
}
```

### Slot Registration Pattern

```typescript
// Default field type (priority 0)
slotRegistry.register({
  id: 'text',
  priority: 0,
  renderer: () => new TextCellRenderer(),
})

// Domain override (priority 50)
slotRegistry.register({
  id: 'text',
  priority: 50,
  contextFilter: (ctx) => ctx.entityType === 'Project',
  renderer: () => new ProjectTextCellRenderer(),
})

// View-mode override (priority 100)
slotRegistry.register({
  id: 'date',
  priority: 100,
  contextFilter: (ctx) => ctx.viewMode === 'gantt',
  renderer: () => new GanttBarRenderer(),
})

// Form-mode renderer (priority 100)
slotRegistry.register({
  id: 'text',
  priority: 100,
  contextFilter: (ctx) => ctx.viewMode === 'form',
  renderer: () => new TextFormRenderer(),
})
```

### Post-Migration Column Contract

The current `Column` type (in `types.ts`) stores pre-computed field type metadata directly:

```typescript
// CURRENT (types.ts:167-171)
fieldType?: any       // VibeGridFieldType instance
formatter?: Function  // Pre-bound formatter
editorInstance?: any  // Pre-computed editor instance
```

**Post-migration, `Column` becomes schema-only — no resolved renderer stored on it:**

```typescript
// Column stays schema-only:
cellType?: BaseCellType   // Serves as slot ID for resolution
formatter?: Function      // Pre-bound from CellRenderer.format() during column-generation
// fieldType is REMOVED
// editorInstance is REMOVED
// NO resolvedRenderer on Column — resolution is context-dependent
```

**Why no `column.resolvedRenderer`?** Resolution varies by context (viewMode, entityType, schemaId, orgId). A column in table mode resolves to `TextCellRenderer`, the same column in form mode resolves to the form renderer, and in gantt mode to `GanttDateSummaryRenderer`. Storing the resolved renderer on the shared Column object would go stale across contexts and concurrent grids.

**Lookup key:** `column.cellType` (existing field, already set by `mapFieldTypeToVibeGridCellType()`) serves as the slot ID for resolution.

**Resolution at call sites — always via `slotRegistry.resolve(column, context)`:**

| Consumer | Currently reads | Migrates to |
|----------|----------------|-------------|
| `BodyRenderer` | `modularCellBridge.createCell()` | `slotRegistry.resolve(column, context).render()` |
| `InteractionCoordinator` | `column.fieldType.interactionPolicy` | `slotRegistry.resolve(column, context).interactionPolicy` |
| `EditingStore` | `column.fieldType.editor` | `slotRegistry.resolve(column, context).renderEditor()` |
| `CellActionRouter` | `column.fieldType.interactionPolicy` | `slotRegistry.resolve(column, context).interactionPolicy` |
| `AffordanceResolver` | `column.fieldType.affordance` | `slotRegistry.resolve(column, context).affordanceGroup` |
| `column-generation.ts` | `fieldTypeRegistry.getFieldType()` | `slotRegistry.resolve(column, context)` for pre-computing `column.formatter` |
| `VibeFormField` | `fieldTypeRegistry.getFieldType()` | `slotRegistry.resolve(column, { viewMode: 'form' })` |
| `csv-export.ts` | `column.formatter` | `column.formatter` (unchanged — pre-bound during column-generation) |
| `EditingStore` validation | `column.fieldType.validator` | `slotRegistry.resolve(column, context).validate()` |
| `utils/hashing.ts` | `column.fieldType` normalization | Use `column.cellType` directly (already available) |

Since `resolve()` is a sync cache lookup (O(1)), calling it at each consumer is cheap. The cache is populated by `preloadForColumns()` during grid init.

**P1 task:** Update `types.ts` Column interface — remove `fieldType`, remove `editorInstance`. Keep `formatter` (pre-bound during column-generation).

### SlotRegistry Instance Scoping

**Problem:** The current `SlotRegistry` is a global singleton with a single `preloadReady` flag. VibeGrid supports nested/concurrent grid instances (e.g., expanded row containing another grid). One grid switching view mode would clear cache or flip readiness for another grid.

**Solution: Instance-scoped SlotRegistry per grid.**

```typescript
// Each VibeGridStoreProvider creates its own SlotRegistry instance
class VibeGridStoreProvider {
  slotRegistry = new SlotRegistry()  // Instance, not singleton

  init(columns, context) {
    // Register default slots (shared, idempotent)
    registerDefaultSlots(this.slotRegistry)
    // Register module slots if view mode has a module
    module?.registerSlots(this.slotRegistry)
    // Preload for this grid's columns + context
    await this.slotRegistry.preloadForColumns(columns, context)
  }
}
```

**Default slot registrations** are shared via a `registerDefaultSlots(registry)` function called during each grid's init. This registers all 25 field types at priority 0. It's idempotent — calling it multiple times on the same registry is safe.

**Module slot registrations** are per-grid via `module.registerSlots(registry)` — only called for the active view mode's module.

**Cache isolation:** Each grid instance has its own cache. One grid switching view mode only clears its own cache and re-preloads.

**Slot type definitions** remain shared (the CellRenderer classes are singletons reused across instances). Only the registry/cache state is per-instance.

**Migration from singleton:** `SlotRegistry.ts` already supports instantiation (`new SlotRegistry()`). The exported singleton `slotRegistry` is removed. All consumers access the instance via their grid's store provider.

### Module Slot Registration + Preload Sequencing

Exact activation order on mount and view-mode change:

```
1. Load module (lazy import)
2. module.registerSlots(slotRegistry)     // stable slots declared
3. slotRegistry.preloadForColumns(columns, context)  // async, caches renderers
4. Set preloadReady = true
5. Render grid
```

On context change (view mode switch, schema change, org change):
```
1. slotRegistry.clearCacheForContext(changedDimensions)
2. If new view mode: load module -> module.registerSlots(slotRegistry)
3. slotRegistry.preloadForColumns(columns, newContext)
4. Re-render grid
```

`SlotRegistry.register()` clears the entire cache (existing behavior). This is acceptable because registration only happens during module activation, before preload.

### Cache Key

```
fieldType::columnId::entityType::schemaId::viewMode::organizationId
```

Cache is populated by `preloadForColumns()` (async) and read by `resolve()` (sync).

---

## Phase Details

### Phase 1: Pipeline Rewiring

**Goal:** Wire SlotRegistry into the rendering pipeline. All cells will fall back to text renderer until field types are ported.

**Files to modify:**

| File | Change |
|------|--------|
| `BodyRenderer.ts` | Replace `modularCellBridge.createCell()` with `slotRegistry.resolve()` + `renderer.render()` |
| `SimplePassiveRenderer.ts` | Inject `slotRegistry` instead of `modularCellBridge` |
| `InitStore.ts` | Replace `fieldTypeRegistry.ensureInitialized()` with `slotRegistry.preloadForColumns()` |
| `column-generation.ts` | Pre-compute formatters via SlotRegistry resolution |
| `CellActionRouter.ts` | Read `interactionPolicy` from resolved `CellRenderer` (preserve defaultAction/editTrigger/blurPolicy) |
| `InteractionCoordinator.ts` | Accept `CellRendererContext`, use `renderer.renderEditor()` |
| `AffordanceResolver.ts` | Read `affordanceGroup` from resolved `CellRenderer` (preserve group-based styling) |
| `VibeGrid.tsx` | Call `module.registerSlots(slotRegistry)` during module activation |
| `VisualStateStore.ts` | Re-home affordance precompute from ModularCellBridge; call `slotRegistry.clearCacheForContext()` + `preloadForColumns()` on view-mode/schema/org context changes |

**Key constraint:** Fast-path rendering must be preserved. The `column.formatter` pre-computation pattern stays — it's sourced from `CellRenderer.format()` instead of `CellFormatter.format()`.

**Temporary bridge:** During Phase 1 only, register a single catch-all text slot at priority -1 so the grid renders (plain text for all cells) while field types are being ported in P2.

### Phase 2a: Basic Field Types (16 classes, 41 registrations)

Each existing `*FieldType` class (which bundles separate Renderer, Editor, Formatter, Validator objects) is rewritten as a single `CellRenderer` class with optional methods.

**Example migration — TextFieldType:**

```typescript
// BEFORE: TextFieldType.ts (separate objects)
export const TextFieldType: VibeGridFieldType = {
  type: 'text',
  category: 'basic',
  renderer: new TextRenderer(),    // render(), update(), canHandle()
  editor: new TextEditor(),        // create(), getValue(), validate(), destroy()
  formatter: new TextFormatter(),  // format(), parse(), formatForDisplay()
  validator: new TextValidator(),
  metadata: { supportsSorting: true, ... },
  affordance: { group: 'editable-content', ... },
  interactionPolicy: { defaultAction: 'edit', ... },
}
fieldTypeRegistry.register('text', TextFieldType)

// AFTER: TextCellRenderer.ts (unified)
export class TextCellRenderer implements CellRenderer {
  render(value, column, context): HTMLElement { /* DOM creation */ }
  renderEditor(value, column, context): HTMLElement { /* inline editor */ }
  validate(value, column, context): string | null { /* validation */ }
  format(value, column, context): string { /* display formatting */ }

  affordances = { sortable: true, filterable: true, editable: true, groupable: true }
  interactionPolicy = { defaultAction: 'edit' as const, editTrigger: 'content-click' as const, blurPolicy: 'commit' as const }
  affordanceGroup = { group: 'editable-content', whenNotEditable: 'readonly-display' }
  metadata = { category: 'basic' as const }
}

// Registration (in slot initialization, not side-effect)
slotRegistry.register({ id: 'text', priority: 0, renderer: () => new TextCellRenderer() })
```

**Alias registrations:** Types like `number` that handle aliases (`integer`, `decimal`, `percentage`) register the same renderer under multiple IDs:

```typescript
const numberRenderer = () => new NumberCellRenderer()
for (const id of ['number', 'integer', 'decimal', 'percentage', 'currency']) {
  slotRegistry.register({ id, priority: 0, renderer: numberRenderer })
}
```

**File organization:** New renderers go in `slots/renderers/basic/`, `slots/renderers/relationship/`, etc. Old `implementations/` directory is deleted in P5.

### Phase 2b: Relationship Field Types

**Key difference:** These use `asyncDataLoader()` for loading related entity/user data.

```typescript
export class EntityReferenceCellRenderer implements CellRenderer {
  render(value, column, context): HTMLElement {
    // Read from context.relationshipData (pre-populated by TableCoreStore)
    // If data present: show resolved entity name/link
    // If data missing: show "Loading..." (TableCoreStore will batch-fetch)
  }

  // No asyncDataLoader — relationship loading is NOT per-cell.
  // TableCoreStore is the sole orchestrator.

  affordances = { sortable: false, filterable: true, editable: true }
  interactionPolicy = { defaultAction: 'navigate' as const, editTrigger: 'icon' as const, blurPolicy: 'commit' as const }
  affordanceGroup = { group: 'editable-badge', whenNotEditable: 'readonly-display' }
  metadata = { category: 'relationship' as const }
}
```

**Relationship data orchestration — TanStack DB collections are authoritative:**

The `asyncDataLoader` method on `CellRenderer` is **not used** for relationship types. Instead:

1. **Batch preload:** `TableCoreStore` uses TanStack DB collections with `resolveEntities: true` for batch entity resolution and `useMembersCollection` for user references
2. **Context population:** Before render, `TableCoreStore` populates `context.relationshipData` from collection caches (`ensureEntityReferenceRecord` for entity refs, member data for user refs)
3. **Render:** `CellRenderer.render()` reads from `context.relationshipData` — pure sync lookup
4. **Cache miss:** If data is missing (rare race), cell shows "Loading..." and collection sync handles the fetch, triggering re-render via collection subscription
5. **Invalidation:** Collection-backed — UserActor events trigger collection sync, which updates the cache automatically. No direct EventBus listening (legacy `EventBusStore` is disabled per repo rules)

**`RelationshipDataManager` is retired in P5** — its behavior is superseded by TanStack DB collection patterns. The `asyncDataLoader` method remains on the `CellRenderer` interface for future non-DataForge data sources but is NOT used by relationship types in this migration.

### Phase 2c: Rollup Field Types

Use `rollupCalculator()` method. Read-only (no editor, no editable affordance).

**Rollup data source:** Rollup values are **pre-computed by the backend** (DataForge). The grid receives rollup values as part of the entity record data — `rollupCalculator()` is NOT called during render. The method exists on the interface for future client-side rollup scenarios but is unused in this migration.

**Current flow (preserved):**
1. Backend computes rollup values during entity fetch (e.g., `rollup_count` returns the count as a number in the record)
2. Grid receives pre-computed value in `rowData[column.field]`
3. `CellRenderer.render()` displays the value with rollup-specific formatting (e.g., count badge)
4. `CellRenderer.format()` formats for CSV export

**Invalidation:** Backend re-computes on related entity changes; grid re-fetches via EventBus-driven TanStack DB invalidation.

### Phase 2d: Computed Field Types

Read-only display of computed values. No editor.

**Computed data source:** Like rollups, computed values are **pre-computed by the backend** (expression engine, formula engine, decision table engine per `.claude/rules/computed-fields.md`). The grid receives the computed result as part of entity record data.

**Current flow (preserved):**
1. Backend evaluates expression/formula/decision_table and stores result in entity record
2. Grid receives pre-computed value in `rowData[column.field]`
3. `CellRenderer.render()` displays the value with type-appropriate formatting
4. No client-side computation — dependency tracking and re-evaluation are backend concerns

### Phase 3: Form Integration

**Goal:** VibeForm resolves field renderers through SlotRegistry with `viewMode: 'form'`.

Form-specific renderers are registered at priority 100 with a context filter:

```typescript
slotRegistry.register({
  id: 'text',
  priority: 100,
  contextFilter: (ctx) => ctx.viewMode === 'form',
  renderer: () => new TextFormRenderer(),
})
```

**Form editor boundary: React overlay editors are authoritative for forms.**

The grid's `CellRenderer.renderEditor()` returns DOM elements for inline grid editing. Forms need a different UX: labels, validation messages, portal-positioned dropdowns, autosave integration. These are already built as React overlay editors.

**Decision: Forms do NOT use `CellRenderer.renderEditor()`.** Instead:

1. `slotRegistry.resolve(column, { viewMode: 'form' })` replaces `fieldTypeRegistry.getFieldType()` — provides metadata only (`affordanceGroup`, `interactionPolicy`, `affordances`)
2. `CellRenderer.affordanceGroup.group` determines editor type:
   - `'editable-content'` → inline text/number input (React component in VibeFormField)
   - `'editable-badge'` → portal dropdown (React overlay editor from `overlays/editors/`)
3. React overlay editors remain the authoritative form editor stack — `overlays/editors/index.tsx` unchanged
4. `CellRenderer.validate()` is called by VibeFormField for validation
5. `CellRenderer.format()` is called for display-only (read-only) form fields
6. Blur/autosave behavior reads `interactionPolicy.blurPolicy` from the resolved CellRenderer

This eliminates the dual-stack risk: grid editing uses `CellRenderer.renderEditor()` (DOM), form editing uses React overlay editors. The resolved CellRenderer provides metadata to both paths but is not the editor itself for forms.

**Files to modify:**

| File | Change |
|------|--------|
| `VibeForm.tsx` | Resolve renderers via `slotRegistry.resolve(column, { viewMode: 'form' })` for metadata |
| `VibeFormField.tsx` | Replace `fieldTypeRegistry.getFieldType()` with resolved CellRenderer for metadata; keep React overlay editors as authoritative form editors |
| `overlays/editors/index.tsx` | No change — React editors stay as authoritative form editors |

### Phase 4: Gantt Slot Implementations

**Goal:** Prove that view-mode slot overrides work by implementing Gantt-specific cell renderers for the **left table pane** (the data table alongside the timeline).

**Important scope clarification:** The Gantt timeline pane (bars, milestones, dependency arrows) is rendered by `GanttTimeline.tsx` and `GanttViewStore.ts` — it does NOT use the cell rendering pipeline. This phase only provides Gantt-specific overrides for how columns render in the left-side data table.

Two new renderers for the left-table-pane:

1. **GanttDateSummaryRenderer** — Renders date columns in the Gantt left pane as compact date ranges (e.g., "Mar 1 - Mar 15") instead of the default date format. Registered with `contextFilter: ctx => ctx.viewMode === 'gantt'` at priority 100.

2. **GanttStatusChipRenderer** — Renders status columns in the Gantt left pane with progress-bar-style chips showing completion percentage alongside the status label.

These are registered in `GanttModule.registerSlots()`, replacing the current stub. The timeline pane rendering is out of scope — it has its own rendering architecture.

### Phase 5: Legacy Cleanup

**ModularCellBridge responsibility re-homing (must complete before deletion):**

| Responsibility | Current Owner | New Owner |
|---------------|---------------|-----------|
| Affordance precompute + cache (max 500) | `ModularCellBridge.precomputeAffordances()` | `VisualStateStore` reading `CellRenderer.affordanceGroup` |
| Schema enhancement (EnhancedColumn) | `ModularCellBridge` via `SchemaAdapter` | `column-generation.ts` using SlotRegistry metadata |
| Fast-path cell creation | `ModularCellBridge.createCellFast()` | `BodyRenderer` using `column.formatter` from SlotRegistry |
| Cell update plumbing | `ModularCellBridge` incremental updates | `CellRenderer.update()` called by BodyRenderer |
| Relationship data injection | `ModularCellBridge` + `RelationshipDataManager` | `TableCoreStore` populating `context.relationshipData` |

**Delete (only after responsibilities confirmed re-homed):**
- `field-types/FieldTypeRegistry.ts`
- `field-types/ModularCellBridge.ts`
- `factories/CellFactory.ts`
- `field-types/implementations/` (entire directory)
- `managers/RelationshipDataManager.ts` (absorbed into TableCoreStore)
- `managers/RollupCalculationManager.ts` (absorbed into CellRenderer.rollupCalculator)

**Update:**
- `field-types/index.ts` — Export SlotRegistry types only
- `.claude/rules/vibegrid.md` — Remove all FieldTypeRegistry references, document SlotRegistry as the system
- `.claude/rules/vibegrid-interactions.md` — Remove migration language, document current state
- `column-types.ts` — Prune CellType union of types with no handler (currency-abbreviated, additional-insured, expiration-date)

**Verify:**
- `grep -r "FieldTypeRegistry\|ModularCellBridge\|CellFactory\|fieldTypeRegistry\|modularCellBridge" apps/web/src/` returns zero results
- All tests pass
- TypeScript compiles

---

## Testing Strategy

### Per-Phase Gates

Each phase must pass its gate before the next begins:

| Phase | Gate |
|-------|------|
| P1 | Grid renders (text fallback), existing SlotRegistry tests pass, TS compiles |
| P2a | All 16 basic types render identically, unit tests pass |
| P2b | Relationship cells load and display, async tests pass |
| P2c | Rollup calculations correct, unit tests pass |
| P2d | Computed values display correctly |
| P3 | VibeForm renders and edits all types, form tests pass |
| P4 | Gantt left-pane date columns use compact format, priority override verified |
| P5 | Zero legacy imports, all tests pass, perf benchmarks met |

### Test Categories

1. **Unit tests per CellRenderer** — render(), format(), validate(), renderEditor() for each type
2. **SlotRegistry resolution tests** — Priority, context filtering, cache behavior
3. **Integration tests** — Full render loop with real columns and data
4. **Performance benchmarks:**
   - `resolve()`: <1ms per call
   - `preloadForColumns()`: <100ms for typical column set (20 columns)
   - Grid render (10K rows): No regression from current timing
5. **Visual regression** — Screenshot comparison before/after for each field type
6. **Behavioral parity tests** — Beyond rendering, verify:
   - Navigation behavior (entity-name click opens detail view)
   - Edit-trigger semantics (content-click vs F2 vs icon per field type)
   - Blur/commit behavior (save on blur vs cancel vs keep-open)
   - Affordance group styling (cursor, hover effects match before/after)
   - VibeForm autosave behavior preserved
7. **Concurrent grid tests** — Two mounted grids in different contexts (e.g., table + expanded row grid) resolve independently; one grid switching view mode does not affect the other's cache or readiness

### Existing Tests (Must Continue Passing)

- `slots/__tests__/SlotRegistry.test.ts` (903 lines)
- `modules/__tests__/integration.test.ts` (1034 lines)
- DataForge worker tests (69/69)

---

## Performance Considerations

### Fast-Path Preservation

The current fast-path (`column.formatter` pre-computed at column generation time) must be preserved:

```typescript
// column-generation.ts
const renderer = slotRegistry.resolve(column, context)
column.formatter = renderer.format?.bind(renderer)
```

BodyRenderer checks `column.formatter` first for fast DOM creation, falling back to full `renderer.render()` only when needed.

### Lazy Loading

SlotRegistry already supports lazy renderer factories:

```typescript
renderer: async () => {
  const { TextCellRenderer } = await import('./renderers/basic/TextCellRenderer')
  return new TextCellRenderer()
}
```

This replaces the current `FieldTypeRegistry.ensureInitialized()` pattern with per-grid preloading.

### Cache Strategy

- Cache populated during `preloadForColumns()` (called once per grid initialization)
- `resolve()` is pure cache lookup (sync, no allocation)
- Cache invalidated on view mode switch or context change
- Max cache size managed by SlotRegistry internals

---

## File Inventory

### New Files

```
slots/renderers/
  basic/
    TextCellRenderer.ts
    NumberCellRenderer.ts
    DateCellRenderer.ts
    BooleanCellRenderer.ts
    SelectCellRenderer.ts
    EmailCellRenderer.ts
    UrlCellRenderer.ts
    PhoneCellRenderer.ts
    ColorCellRenderer.ts
    CurrencyCellRenderer.ts
    FileCellRenderer.ts
    ImageCellRenderer.ts
    RatingCellRenderer.ts
    SliderCellRenderer.ts
    MarkdownCellRenderer.ts
    EntityNameCellRenderer.ts
    RowExpandCellRenderer.ts
  relationship/
    EntityReferenceCellRenderer.ts
    UserReferenceCellRenderer.ts
  rollup/
    RollupCountCellRenderer.ts
    RollupSumCellRenderer.ts
    RollupAverageCellRenderer.ts
    RollupConcatCellRenderer.ts
  computed/
    ComputedExpressionCellRenderer.ts
    ComputedFormulaCellRenderer.ts
    ComputedDecisionTableCellRenderer.ts
  form/
    MarkdownFormRenderer.ts    # Full editor (vs grid's truncated preview)
    (only types needing substantially different form UI)
  gantt/
    GanttDateSummaryRenderer.ts    # Compact date range for left table pane
    GanttStatusChipRenderer.ts     # Progress chip for left table pane
slots/
  slot-initialization.ts           # Registers all default slots
  __tests__/
    renderers/                     # Unit tests per renderer
```

### Modified Files (~15)

| File | Change Summary |
|------|---------------|
| `renderers/components/BodyRenderer.ts` | Use slotRegistry.resolve() |
| `renderers/core/SimplePassiveRenderer.ts` | Inject slotRegistry |
| `stores/InitStore.ts` | preloadForColumns() |
| `stores/column-generation.ts` | Pre-compute via SlotRegistry |
| `routing/CellActionRouter.ts` | Read from CellRenderer |
| `coordination/InteractionCoordinator.ts` | Thread context, resolve renderer per interaction |
| `stores/EditingStore.ts` | Replace column.fieldType.editor/validator with slotRegistry.resolve() |
| `utils/hashing.ts` | Replace column.fieldType normalization with column.cellType |
| `affordances/AffordanceResolver.ts` | Read affordanceGroup from CellRenderer |
| `stores/VisualStateStore.ts` | Re-home affordance precompute, add context-change cache invalidation |
| `VibeGrid.tsx` | Call module.registerSlots(slotRegistry) during module activation |
| `components/VibeForm.tsx` | Resolve via SlotRegistry |
| `components/VibeFormField.tsx` | Replace fieldTypeRegistry with CellRenderer; keep React overlay editors |
| `modules/gantt/GanttModule.tsx` | Implement registerSlots() |
| `field-types/index.ts` | Update exports |
| `.claude/rules/vibegrid.md` | Document SlotRegistry |
| `.claude/rules/vibegrid-interactions.md` | Update |

### Deleted Files (~30)

| Category | Files |
|----------|-------|
| Core | FieldTypeRegistry.ts, ModularCellBridge.ts, CellFactory.ts |
| Basic implementations | 16 files in implementations/basic/ |
| Relationship implementations | 2 files in implementations/relationship/ |
| Rollup implementations | 4 files in implementations/rollup/ |
| Computed implementations | 2-3 files in implementations/computed/ |

---

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Rendering regression in basic types | Medium | High | Per-type unit tests + visual regression screenshots |
| Performance regression in large grids | Low | High | Benchmark gate: <1ms resolve, preserved fast-path |
| Relationship data loading breaks | Medium | Medium | Dedicated async loading tests with mock data |
| Form editing breaks | Medium | High | End-to-end form create/update tests |
| Gantt left-pane overrides insufficient proof | Low | Low | Left-pane overrides prove priority system; timeline pane is separate architecture |
| ModularCellBridge responsibilities missed | Medium | High | Responsibility map in P5 with explicit verification gate |
| Dead code left behind | Low | Low | Grep verification in P5 |

---

## Out of Scope

- D3 RowModel abstraction (#1416)
- External plugin API for third-party field types
- Runtime hot-loading of renderers
- Backward compatibility shims for FieldTypeRegistry
- Domain-specific field types beyond admin badge-list (migrated as-is)
