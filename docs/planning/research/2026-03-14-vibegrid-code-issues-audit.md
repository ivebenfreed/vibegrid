---
date: 2026-03-14
topic: VibeGrid Code Issues Audit
status: complete
github_issue: null
---

# Research: VibeGrid Code Issues Audit

## Context

Comprehensive audit of VibeGrid internals to catalog issues around editing flows, field rendering, container/table sizing, and internal API consistency. This informs future cleanup specs and prioritization.

## Questions Explored

1. How consistent are the editing flows across field types?
2. Are field renderers properly unified via SlotRegistry?
3. Are container/table sizing values centralized or scattered?
4. Is the internal API (props, types, naming) consistent?
5. What open issues already exist?

## Findings

### 1. Dual Registry System (FieldTypeRegistry + SlotRegistry)

**Severity: HIGH — Architectural debt**

Two parallel cell renderer resolution systems exist and are both actively used:

| System | Files referencing | Purpose |
|--------|------------------|---------|
| `FieldTypeRegistry` | 39 files | Original cell rendering (renderer, editor, formatter, validator) |
| `SlotRegistry` | 20 files | D2 replacement with priority-based resolution |

**The problem:** The rule docs say "use SlotRegistry only" (`.claude/rules/vibegrid.md` rule #4), but FieldTypeRegistry is still the primary renderer in `BodyRenderer.ts`, `CellFactory.ts`, and all 20+ field type implementations. The SlotRegistry is used for validation and blur policy in `EditingStore`, and for slot preloading in `InitStore`/`VibeGridData`, but `FieldTypeRegistry` still powers actual cell rendering.

Open issue: **GH#1698** — "migrate field type renderers from FieldTypeRegistry to SlotRegistry"

**Key files:**
- `field-types/FieldTypeRegistry.ts` — Global singleton, lazy-loaded via dynamic imports
- `slots/SlotRegistry.ts` — MobX-observable, async preload + sync resolve cache
- `field-types/ModularCellBridge.ts` — Bridge between the two systems (migration layer)

### 2. Editor Factory Type Mapping Inconsistencies

**Severity: MEDIUM — Correctness risk**

The `createEditor()` function in `overlays/editors/index.tsx` and the `EditingOverlay.showAt()` method in `overlays/EditingOverlay.tsx` both maintain independent type classification logic:

**createEditor()** handles these types:
```
text, textarea, longtext, richtext, rich-text, html, markdown,
number, integer, float, decimal, select, single-select, select-multi,
tags, multiselect, json, jsonb, boolean, checkbox, switch, date,
datetime-local, timestamp, email, url, phone, custom_entity_reference,
relationship-single, relationship-multi, relationship-collection,
reference-select, reference-multi, priority_option, status_option,
category_option, task_type_option, user_reference, custom_user_reference,
entity_reference
```

**EditingOverlay.showAt()** classifies types independently for positioning:
```
Text types: text, string, email, url, textarea, longtext, number, integer, float
Dropdown types: boolean, relationship, relationship-single, relationship-multi,
  relationship-collection, date, datetime, timestamp, select, single-select, enum,
  select-multi, priority_option, status_option, category_option, task_type_option,
  user_reference, custom_user_reference, entity_reference, custom_entity_reference,
  reference-select
```

**Issues found:**
1. **Missing types in EditingOverlay positioning:** `rich-text`, `html`, `markdown`, `richtext`, `decimal`, `switch`, `checkbox`, `tags`, `multiselect`, `json`, `jsonb`, `reference-multi` are NOT classified in EditingOverlay — they fall to the "default" branch with minimal positioning
2. **`datetime-local` vs `datetime`:** createEditor handles `datetime-local` and `timestamp`, EditingOverlay handles `datetime` and `timestamp` — `datetime-local` is missing from EditingOverlay's dropdown list
3. **`string` type:** EditingOverlay includes `string` as a text type, but createEditor doesn't handle `string` — it would hit the default/text fallback
4. **`enum` type:** EditingOverlay includes `enum` as a dropdown type, but createEditor doesn't handle it
5. **The `isDropdownType()` utility** from `column-types.ts` is imported but used as a fallback — its Set only includes `enum, select, single-select, select-multi, multi-select, reference-select, boolean, date, datetime`

**Also:** The `isActiveModalTextEditor` getter in `EditingStore.ts:148-152` has its own type list: `longtext, richtext, rich-text, html, markdown, textarea` — a third place to maintain the same mapping.

### 3. Column Type Proliferation

**Severity: MEDIUM — Maintenance burden**

The `CellType` union in `column-types.ts` has **46+ type strings**. Many are near-duplicates:

| Duplicated concept | Variants |
|-------------------|----------|
| Rich text | `rich-text`, `rich_text`, `longtext`, `textarea`, `markdown`, `html` |
| Multi-select | `select-multi`, `multi-select`, `multiselect`, `tags` |
| Date/time | `date`, `datetime`, `datetime-local`, `time`, `timestamp`, `timestamptz` |
| Select | `select`, `single-select` |
| Number | `number`, `integer`, `decimal`, `float` |
| User reference | `user_reference`, `custom_user_reference` |
| Entity reference | `entity_reference`, `custom_entity_reference`, `relationship_link` |

The `Column` interface in `types.ts` is a **253-line mega-interface** with 80+ properties covering text formatting, number formatting, date formatting, boolean display, enum options, validation, and more. This conflates column metadata with renderer configuration.

### 4. Container Sizing — Mostly Centralized, Some Gaps

**Severity: LOW — Partial success**

`constants/grid-dimensions.ts` centralizes key dimensions:
- `ROW_HEIGHT: 40`, `HEADER_HEIGHT: 48`, `DEFAULT_COLUMN_WIDTH: 150`
- CSS variables: `--vibegridx-header-height: 40px`, `--vibegridx-cell-height: 40px`

**Remaining hardcoded values in CSS:**
- `vibegridx.css:651` — `padding: 12px 16px 12px 70px` (the 70px matches `CONTENT_OFFSET_X` but is hardcoded)
- Multiple `height: 40px` with `/* ROW_HEIGHT */` comments (not using CSS variable)
- `EditingOverlay.tsx:267` — `dropdownHeight = isDateType ? 450 : 300` (hardcoded dropdown sizes)
- `EditingOverlay.tsx:88` — `z-index: ${this.config.zIndex || 1000}` vs `GRID_DIMENSIONS.Z_INDEX.EDITING = 104` (mismatched z-index between overlay and grid constants)

**Also:** The `VibeGridProps` interface accepts `height` (default 600) as both `number | string`, but there's no mechanism to make the grid auto-size to its container — it uses fixed height.

### 5. EditingStore `any` Types

**Severity: MEDIUM — Type safety gap**

`EditingStore.ts` uses `any` extensively:
- `EditSession.column: any` (line 40)
- `EditSession.originalValue: any`, `pendingValue: any` (lines 41-42)
- `collection: any` (line 179)
- `commandBus: CommandBus | null` (properly typed, but used with `any` contexts)

The `startEdit` method extracts values via `untracked()` with `any` casts throughout. The `saveToDatabase` method uses `draft: any` in the collection update.

### 6. Legacy Architecture Artifacts

**Severity: LOW — Cleanup needed**

Several references to deprecated/legacy patterns:
- `column-types.ts` is marked `@deprecated` at the top but still exports `CellType` and type classification functions used everywhere
- `EditingOverlay.tsx:3` imports `QueryClientProvider` from `@tanstack/react-query` — the CLAUDE.md explicitly says "NEVER Use TanStack Query"
- `EditingOverlay.tsx:568` references a "legacy portal" fallback: `document.querySelector('.editing-overlay')`
- `VibeGridProps._T` generic parameter is unused
- `TableContext` has dead fields: `storeActor`, `pendingSurgicalUpdate`, legacy actor references
- `types.ts` has legacy event types marked deprecated but still in the union

### 7. Editor-Overlay Architecture Fragility

**Severity: MEDIUM — Bug-prone**

The `EditingOverlay` class creates a separate React root (`ReactDOM.createRoot`) outside the main React tree. This requires:
1. Re-wrapping with `QueryClientProvider` + `StoreProvider` (line 21-27)
2. Manual portal lifecycle management
3. Manual cell content hiding/restoring via DOM class manipulation
4. Manual position calculations with different branches for text vs dropdown vs default
5. Async portal visibility via `queueMicrotask(() => requestAnimationFrame(...))`

This is inherently fragile — any new editor type that doesn't fit neatly into "text" or "dropdown" gets the minimal default positioning. The `updateValidationErrors` method (line 417-433) re-renders the editor but doesn't pass `validationErrors` to the re-rendered component.

### 8. Open GitHub Issues (30 total under epic #187)

**Critical/P1 issues relevant to this audit:**

| # | Title | Relevance |
|---|-------|-----------|
| 1698 | Migrate field type renderers from FieldTypeRegistry to SlotRegistry | Dual registry (#1) |
| 1306 | VibeGrid cell rendering optimization | Performance |
| 1307 | Complete virtual scroll migration to VirtualViewportStore | Sizing (#4) |
| 1403 | Consolidate row geometry to single source of truth | Sizing (#4) |
| 1430 | Overlay Scroll Sync Gap and Re-entrant Guard Safety | Editing (#7) |
| 1413 | Architecture Consolidation | General cleanup |
| 936 | Field Display & Schema Sanitization | Rendering (#2) |
| 1309 | Create VibeGrid field type development guide | Documentation |
| 1255 | VibeGrid Core Runtime Overhaul | Foundational |

### 9. CSS/JS Dimension Mismatches

**Severity: MEDIUM — Silent inconsistency**

Several CSS values don't match their JS constant counterparts:

| Dimension | CSS Value | JS Constant | File |
|-----------|-----------|-------------|------|
| Header height | `--vibegridx-header-height: 40px` | `HEADER_HEIGHT: 48` | `vibegridx.css:9` vs `grid-dimensions.ts:11` |
| Cell min-width | `var(--cell-min-width, 60px)` | `MIN_COLUMN_WIDTH: 50` | `vibegridx.css` header-cell vs `grid-dimensions.ts:16` |
| Cell max-width | `var(--cell-max-width, 400px)` | `MAX_COLUMN_WIDTH: 500` | `vibegridx.css` header-cell vs `grid-dimensions.ts:17` |

The header height mismatch (40px CSS vs 48px JS) is particularly concerning — the CSS renders at 40px but virtualization calculations use 48px, which could cause subtle scroll offset issues.

### 10. Editing Flow Issues

**Severity: MEDIUM — UX and correctness gaps**

Detailed audit of the edit lifecycle revealed 14 specific issues:

**Validation gaps:**
- **Validation cleared on keystroke** (`EditingStore.ts:347`): When user types, `session.validation` is immediately set to `null`. The user sees no feedback while fixing the value — validation only re-runs on next commit attempt.
- **No real-time validation**: `validateEdit()` method exists (line 787) but is never called automatically. Fields with length/format constraints don't get live feedback.
- **`updateValidationErrors()` never called**: The method exists in EditingOverlay (line 417) but no caller was found — validation display may not update on commit failure.

**NumberEditor intermediate states** (`NumberEditor.tsx:109`): Regex `/^-?\d*\.?\d*$/` allows `-`, `.`, `-.` as inputs. These fail `parseFloat()` and silently cancel the edit.

**DateEditor discoverability** (`DateEditor.tsx:136`): When `includeTime=true`, calendar transitions to time picker after date selection with no "Step 1/2" indicator. Users may not realize they need to confirm time.

**JSON tags detection too aggressive** (`editors/index.tsx:152`): Any column with comma-separated values gets routed to `MultiSelectEditor`, even regular text fields containing commas.

**Relationship archetype cache never invalidates** (`RelationshipEditor.tsx:36`): Module-level `Map` persists for entire page session. Schema changes during long sessions would show stale data.

**Race condition complexity** (`EditingStore.ts:370-393`): The `sessionReady` flag with 3-retry `setTimeout` loop is complex. If retries are exhausted, commit fails silently with only a log message.

**No user notification on edit cancel**: `cancelEdit('scroll')` triggered when scroll delta exceeds 40px can silently discard user input without notification.

**Portal position divergence** (`EditingOverlayController.ts:300-367`): Three fallback positioning strategies (cached DOM, direct calculation, container-based) that could produce different results in edge cases.

### 11. Public API Consistency

**Severity: LOW — Generally clean**

The VibeGrid public API is well-structured with consistent naming patterns:

| Pattern | Convention | Examples |
|---------|-----------|----------|
| Callbacks | `on*` prefix | `onCellClick`, `onEntityUpdate`, `onViewModeChange` |
| Feature flags | `enable*` prefix | `enableGrouping`, `enableFiltering`, `enableExport` |
| Visibility | `show*` prefix | `showToolbar`, `showHeader`, `showPagination` |

**Minor inconsistencies found:**
- `enableDragAndDrop` and `enableDragDrop` both exist as props (duplicated name, aliased)
- `appendColumns` naming doesn't follow the `*Override` pattern used by `columnOverrides`
- Mixed kebab/snake/camelCase in CellType strings follows DataForge conventions but is inconsistent: `rich-text` vs `rich_text` vs `richtext`

**Dead code is clean**: `__tests__/dead-code-removal.test.ts` verifies that removed symbols (`createVibeGrid`, `LEGEND_STATE`, backup files) haven't reappeared. Underscore-prefixed destructured props (`_onCellDoubleClick`, `_collectionOverride`) are intentional Biome lint compliance for props handled by context providers.

### 12. Store Architecture Scale

**Severity: LOW — Informational**

13 MobX stores totaling ~320KB of source code manage grid state:

| Store | Size | Purpose |
|-------|------|---------|
| `TableCoreStore` | 67KB | Data, configuration, persistence |
| `GanttViewStore` | 49KB | Gantt-specific state |
| `InteractionStore` | 48KB | Selection, menus, focus |
| `VisualStateStore` | 44KB | Layout, sorting, grouping, filtering |
| `PersistenceStore` | 27KB | LocalStorage persistence |
| `EditingStore` | 23KB | Inline editing lifecycle |
| `InitStore` | 22KB | Initialization, slot registry |
| `HierarchyStore` | 14KB | Parent-child relationships |
| `KanbanViewStore` | 12KB | Kanban-specific state |
| `DebugStore` | 9.5KB | Debug logging controls |
| `ViewportStore` | 8.6KB | Scroll & viewport |
| `InlineCreationStore` | 8.5KB | Ghost row state |
| `ViewModeStore` | 4.2KB | View mode toggling |

All stores use `@observable`/`@computed`/`@action` decorators via `makeObservable()`. They are provided via a central `VibeGridStores` context and initialized in `InitStore`.

## Recommendations

| Priority | Issue | Action | Effort |
|----------|-------|--------|--------|
| **P1** | Dual registry | Complete GH#1698 — migrate all renderers to SlotRegistry, deprecate FieldTypeRegistry | Large |
| **P1** | Type mapping duplication | Create a single `FIELD_TYPE_CATEGORIES` map used by createEditor, EditingOverlay, and EditingStore | Medium |
| **P1** | Editor overlay re-renders | Fix `updateValidationErrors` to pass errors, unify positioning logic | Small |
| **P2** | Column type proliferation | Normalize duplicates (e.g., `rich-text`/`rich_text`, `select-multi`/`multi-select`) in CellType union | Medium |
| **P2** | Hardcoded overlay sizes | Move dropdown heights/z-index to grid-dimensions.ts | Small |
| **P2** | `any` types in EditingStore | Type `EditSession.column` properly, use generic for value types | Medium |
| **P3** | Legacy TanStack Query import | EditingOverlay wraps with QueryClientProvider — investigate if still needed | Small |
| **P3** | Mega Column interface | Split into `ColumnBase + ColumnFormatting + ColumnValidation` or similar | Large |
| **P3** | CSS hardcoded values | Replace inline `40px`/`70px` with CSS variables | Small |
| **P2** | CSS/JS dimension mismatches | Fix header height (40px CSS vs 48px JS) and min/max column width mismatches | Small |
| **P2** | Validation UX | Add real-time validation via `validateEdit()` with debounce; don't clear errors on keystroke | Medium |
| **P2** | NumberEditor intermediate states | Tighten regex to reject `-`, `.`, `-.` or show inline error | Small |
| **P3** | Scroll cancel notification | Show toast when edit is cancelled due to scroll threshold | Small |
| **P3** | Relationship cache invalidation | Clear `relationshipArchetypeCache` on schema change events | Small |
| **P3** | Duplicate prop names | Remove `enableDragDrop` alias, keep `enableDragAndDrop` only | Small |

## Open Questions

1. Is `ModularCellBridge` still serving a purpose or can it be removed with the SlotRegistry migration?
2. Should the EditingOverlay be rebuilt as a proper React portal within the main React tree?
3. What's the migration path for the 20+ field type implementations — can they directly implement the SlotRegistry `CellRenderer` interface?

## Next Steps

- Create spec for GH#1698 (SlotRegistry migration) if not already specced
- File a new issue for the type mapping duplication (createEditor/EditingOverlay/EditingStore alignment)
- Consider bundling P2 items into an "internal consistency" chore issue
