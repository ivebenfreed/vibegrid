---
issue: 1885
title: "VibeGrid: unify field type classification and fix editor overlay inconsistencies"
type: chore
status: approved
created: 2026-03-14
phases:
  - id: p1
    title: Create unified FIELD_TYPE_CATEGORIES map
    estimate: 1h
    depends_on: []
  - id: p2
    title: Refactor consumers to use shared map
    estimate: 1h
    depends_on: [p1]
  - id: p3
    title: Fix EditingOverlay bugs and centralize constants
    estimate: 30m
    depends_on: [p1]
---

# VibeGrid: Unify Field Type Classification

## Problem

Three locations independently classify cell types for different purposes, leading to missing types, inconsistencies, and maintenance burden:

1. **`overlays/editors/index.tsx` `createEditor()`** — Maps cellType to editor component (40+ cases)
2. **`overlays/EditingOverlay.tsx` `showAt()`** — Classifies types as "text" or "dropdown" for positioning
3. **`stores/EditingStore.ts` `isActiveModalTextEditor`** — Identifies modal text types for keyboard handling

Additional issues:
- `EditingOverlay.updateValidationErrors()` re-renders the editor but **does not pass validation errors** to the re-rendered component
- Dropdown heights (300/450px) and z-index (1000/1001) are hardcoded in EditingOverlay instead of using `grid-dimensions.ts`

## Research

Full audit: `planning/research/2026-03-14-vibegrid-code-issues-audit.md`

### Specific gaps found

| Type | In createEditor | In EditingOverlay positioning | In EditingStore modal check |
|------|----------------|-------------------------------|----------------------------|
| `rich-text` | Yes (ModalTextEditor) | **Missing** — falls to default | Yes |
| `html` | Yes (ModalTextEditor) | **Missing** | Yes |
| `markdown` | Yes (ModalTextEditor) | **Missing** | Yes |
| `decimal` | Yes (NumberEditor) | **Missing** | No |
| `switch` | Yes (BooleanEditor) | **Missing** | No |
| `checkbox` | Yes (BooleanEditor) | **Missing** | No |
| `tags` | Yes (MultiSelectEditor) | **Missing** | No |
| `multiselect` | Yes (MultiSelectEditor) | **Missing** | No |
| `json`/`jsonb` | Yes (conditional) | **Missing** | No |
| `reference-multi` | Yes (ReferenceMultiEditor) | **Missing** | No |
| `datetime-local` | Yes (DateEditor) | **Missing** from dropdown list | No |
| `string` | **Missing** | In text list | No |
| `enum` | **Missing** | In dropdown list | No |

## Solution

### Phase 1: Create unified FIELD_TYPE_CATEGORIES map

Create `systems/vibegrid/constants/field-type-categories.ts`:

```typescript
/**
 * Single source of truth for field type classification.
 * Used by: createEditor, EditingOverlay positioning, EditingStore modal detection.
 */

export type FieldTypeCategory = 'text' | 'number' | 'dropdown' | 'modal-text' | 'boolean'

// Types intentionally excluded from the map (non-editable or display-only):
// - Read-only computed/rollup: rollup_count, rollup_sum, rollup_average, rollup_concat,
//   computed_expression, computed_formula, computed_decision_table
// - Display-only: file, image, currency, color, rating, slider, percentage,
//   currency-abbreviated, additional-insured, expiration-date, badge-list
// - Special renderers: row-expand, entity-name, relationship_link, status,
//   discussion_type_option
// - Unmapped types fall through to 'text' positioning (inline overlay on cell)

/**
 * Maps every CellType string to its editor category.
 * This determines:
 * - Editor positioning (text = overlay on cell, dropdown = below cell, modal-text = modal)
 * - Keyboard handling (modal-text types keep multiline key handling)
 * - Editor component selection (via createEditor)
 */
export const FIELD_TYPE_CATEGORIES: Record<string, FieldTypeCategory> = {
  // Text (inline overlay on cell)
  text: 'text',
  string: 'text',
  email: 'text',
  url: 'text',
  phone: 'text',

  // Number (inline overlay on cell)
  number: 'number',
  integer: 'number',
  float: 'number',
  decimal: 'number',

  // Modal text (opens in modal, keeps multiline keyboard handling)
  textarea: 'modal-text',
  longtext: 'modal-text',
  richtext: 'modal-text',
  'rich-text': 'modal-text',
  rich_text: 'modal-text',  // DataForge underscore variant
  html: 'modal-text',
  markdown: 'modal-text',

  // Boolean (dropdown below cell)
  boolean: 'boolean',
  checkbox: 'boolean',
  switch: 'boolean',

  // Dropdown (below cell with popover styling)
  date: 'dropdown',
  'datetime-local': 'dropdown',
  datetime: 'dropdown',
  timestamp: 'dropdown',
  time: 'dropdown',
  timestamptz: 'dropdown',
  select: 'dropdown',
  'single-select': 'dropdown',
  enum: 'dropdown',
  'select-multi': 'dropdown',
  'multi-select': 'dropdown',
  multiselect: 'dropdown',
  tags: 'dropdown',

  // json/jsonb: Excluded from the map. createEditor() conditionally routes
  // tags-like JSON to MultiSelectEditor (dropdown) and plain JSON to TextEditor (text).
  // The positioning must match the editor chosen, so EditingOverlay handles json/jsonb
  // as a special case using the same isTagsLikeField() check from createEditor.

  // Relationship dropdowns
  'relationship-single': 'dropdown',
  'relationship-multi': 'dropdown',
  'relationship-collection': 'dropdown',
  'custom_entity_reference': 'dropdown',
  entity_reference: 'dropdown',
  user_reference: 'dropdown',
  custom_user_reference: 'dropdown',
  'reference-select': 'dropdown',
  'reference-multi': 'dropdown',

  // System option dropdowns
  priority_option: 'dropdown',
  status_option: 'dropdown',
  category_option: 'dropdown',
  task_type_option: 'dropdown',
}

/** Check if a type is positioned as inline text overlay */
export function isTextPositioned(cellType: string): boolean {
  const cat = FIELD_TYPE_CATEGORIES[cellType]
  return cat === 'text' || cat === 'number'
}

/** Check if a type is positioned as a dropdown below the cell */
export function isDropdownPositioned(cellType: string): boolean {
  const cat = FIELD_TYPE_CATEGORIES[cellType]
  return cat === 'dropdown' || cat === 'boolean'
}

/** Check if a type uses a modal text editor (keeps multiline keyboard handling) */
export function isModalTextType(cellType: string): boolean {
  return FIELD_TYPE_CATEGORIES[cellType] === 'modal-text'
}

/** Check if a type is a date picker (needs larger dropdown) */
export function isDateType(cellType: string): boolean {
  return ['date', 'datetime', 'datetime-local', 'timestamp', 'timestamptz'].includes(cellType)
}
```

### Phase 2: Refactor consumers to use shared map

**File: `overlays/EditingOverlay.tsx`**
- Replace inline `isTextType` array with `isTextPositioned(cellType)`
- Replace inline `isDropdownType` array + `isDropdownCellType()` with `isDropdownPositioned(cellType)`
- Remove import of `isDropdownType as isDropdownCellType` from `column-types`

**File: `stores/EditingStore.ts`**
- Replace `isActiveModalTextEditor` inline array with `isModalTextType(cellType)`

**File: `overlays/editors/index.tsx`**
- Add missing case `'string'` → `TextEditor` (before default)
- Add missing case `'enum'` → `SelectEditor` (alongside existing `'select'` case)
- Add missing case `'multi-select'` → `MultiSelectEditor` (alongside existing `'select-multi'` case)
- Handle `json`/`jsonb` positioning: For `showAt()`, use `isTagsLikeField()` from this file to determine whether to use text or dropdown positioning for json types

**File: `overlays/EditingOverlay.tsx`**
- For `json`/`jsonb` types: import `isTagsLikeField` from editors and use it in `showAt()` to determine positioning. If tags-like → dropdown positioning, otherwise → text positioning. This keeps the positioning in sync with the editor component selection.

### Phase 3: Fix EditingOverlay bugs and centralize constants

**Bug fix: `updateValidationErrors`** in `EditingOverlay.tsx:417-433`

Two bugs: (1) missing `validationErrors` prop, (2) missing `tableInteraction$` handler branching.

Extract a private `buildEditorCallbacks()` method from `showAt()` to avoid duplicating the `tableInteraction$` branching logic:

```typescript
// NEW private method
private buildEditorCallbacks() {
  return {
    onCommit: this.config.tableInteraction$
      ? async (value: any) => { await this.config.tableInteraction$.saveEdit(value) }
      : this.config.onCommit,
    onCancel: this.config.onCancel,
    onUpdate: this.config.tableInteraction$
      ? (value: any) => { this.config.tableInteraction$.updateEditValue(value) }
      : this.config.onUpdate,
  }
}

// FIXED updateValidationErrors
public updateValidationErrors(_errors: Map<string, string>): void {
  if (this.currentCell && this.currentColumn && this.currentValue !== null && this.root) {
    const validationErrorsList = _errors ? Array.from(_errors.values()) : []
    const callbacks = this.buildEditorCallbacks()
    this.root.render(wrapWithProviders(createEditor({
      cell: this.currentCell,
      column: this.currentColumn,
      initialValue: this.currentValue,
      ...callbacks,
      relationshipContext: this.config.relationshipContext,
      validationErrors: validationErrorsList,
    })))
  }
}
```

Also refactor `showAt()` to use `buildEditorCallbacks()` instead of inline branching.

**Centralize overlay constants** in `grid-dimensions.ts`:
```typescript
// Add to GRID_DIMENSIONS
DROPDOWN_MAX_HEIGHT: 300,
DATE_PICKER_MAX_HEIGHT: 450,
DATE_PICKER_MIN_WIDTH: 300,
EDITING_OVERLAY_Z_INDEX: 1000,      // Portal z-index (above grid content)
EDITING_DROPDOWN_Z_INDEX: 1001,     // Dropdown z-index (above overlay)
```

Replace hardcoded values in `EditingOverlay.tsx`:
- `300` (dropdown height) → `GRID_DIMENSIONS.DROPDOWN_MAX_HEIGHT`
- `450` (date picker height) → `GRID_DIMENSIONS.DATE_PICKER_MAX_HEIGHT`
- `Math.max(position.width, 300)` → `Math.max(position.width, GRID_DIMENSIONS.DATE_PICKER_MIN_WIDTH)`
- `z-index: ${this.config.zIndex || 1000}` → `GRID_DIMENSIONS.EDITING_OVERLAY_Z_INDEX`
- `z-index: '1001'` → `GRID_DIMENSIONS.EDITING_DROPDOWN_Z_INDEX`

Note: The portal z-index (1000) is intentionally higher than `Z_INDEX.EDITING` (104) because the portal
is appended to the viewport container and needs to float above all grid content layers.

**File: `column-types.ts`**
- Add `@deprecated` comments to `SELECT_CELL_TYPES`, `DROPDOWN_CELL_TYPES`, `TEXT_CELL_TYPES` Sets and their helper functions (`isSelectType`, `isDropdownType`, `isTextType`). These overlap with the new `FIELD_TYPE_CATEGORIES` map. They remain for now since other files may import them, but new code should use `field-type-categories.ts`.

## Testing

- **Typecheck:** `pnpm typecheck` must pass
- **Existing tests:** `pnpm test -- --filter vibegrid` must pass
- **New unit test:** `constants/__tests__/field-type-categories.test.ts` — verify:
  - Every CellType union member is either in the map or in the excluded list
  - Helper functions return correct values for representative types
  - `isDateType()` matches expected date variants
- **Manual verification:** Open grid, edit cells of different types (text, number, date, select, relationship, rich-text), confirm positioning is correct
- **Validation bug:** Trigger validation error on a cell, confirm error message displays

## Files Changed

| File | Change |
|------|--------|
| `systems/vibegrid/constants/field-type-categories.ts` | **NEW** — unified type classification |
| `systems/vibegrid/constants/__tests__/field-type-categories.test.ts` | **NEW** — unit tests |
| `systems/vibegrid/overlays/EditingOverlay.tsx` | Use shared classification, fix validation + handler bugs, use constants |
| `systems/vibegrid/overlays/editors/index.tsx` | Add `string`, `enum`, `multi-select` cases |
| `systems/vibegrid/stores/EditingStore.ts` | Use `isModalTextType()` |
| `systems/vibegrid/constants/grid-dimensions.ts` | Add overlay dimension constants |
| `systems/vibegrid/column-types.ts` | Deprecation comments on old type Sets |

## Non-Goals

- SlotRegistry migration (GH#1698) — separate effort
- CellType union normalization — separate effort
- Column interface refactoring — separate effort
- Removing `column-types.ts` deprecated file — separate effort
