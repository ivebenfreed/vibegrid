---
initiative: vibegrid-cell-interaction
type: improvement
status: complete
owner: platform-engineering
assignee: ben@getelevra.com
updated: 2025-12-05
completed: 2025-12-05
---

# Vibegrid Cell Interaction: Implementation Guide

**Timeline**: 3-5 days (completed in 7 sessions)
**Approach**: Incremental migration with backward compatibility
**Risk**: Medium - Core grid interaction, but each phase is independently testable

---

## Final Status (2025-12-05)

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 1: Build Affordance System | ✅ Complete | All files created, CSS imported |
| Phase 2: Migrate Core Field Types | ✅ Complete | All 23 field types migrated |
| Phase 3: Update CellActionRouter | ✅ Complete | Reads data-affordance first |
| Phase 4: Cleanup | ✅ Complete | Old CSS removed, fast path bug fixed |

### All Field Types Migrated

| Field Type | Affordance Group | When Not Editable |
|------------|-----------------|-------------------|
| TextFieldType | `editable-content` | `readonly-display` |
| NumberFieldType | `editable-content` | `readonly-display` |
| TextAreaFieldType | `editable-content` | `readonly-display` |
| CurrencyFieldType | `editable-content` | `readonly-display` |
| MarkdownFieldType | `editable-content` | `readonly-display` |
| SelectFieldType | `editable-badge` | `readonly-badge` |
| DateFieldType | `editable-badge` | `readonly-badge` |
| ColorFieldType | `editable-badge` | `readonly-badge` |
| ImageFieldType | `editable-badge` | `readonly-badge` |
| FileFieldType | `editable-badge` | `readonly-badge` |
| UserReferenceFieldType | `editable-badge` | `readonly-badge` |
| EntityReferenceFieldType | `editable-badge` | `readonly-badge` |
| BooleanFieldType | `toggle-control` | `readonly-display` |
| RatingFieldType | `toggle-control` | `readonly-display` |
| SliderFieldType | `toggle-control` | `readonly-display` |
| EntityNameFieldType | `link-with-edit-icon` | `link-only` |
| EmailFieldType | `link-only` | `link-only` |
| PhoneFieldType | `link-only` | `link-only` |
| UrlFieldType | `link-only` | `link-only` |
| RollupSumFieldType | `readonly-display` | `readonly-display` |
| RollupAverageFieldType | `readonly-display` | `readonly-display` |
| RollupCountFieldType | `readonly-display` | `readonly-display` |
| RollupConcatFieldType | `readonly-display` | `readonly-display` |

---

## Implementation Philosophy

This was a foundational refactor that introduced a new system while keeping the old one working:

1. **Phase 1**: Build the new affordance system (additive)
2. **Phase 2**: Migrate field types one by one
3. **Phase 3**: Update CellActionRouter to read affordances
4. **Phase 4**: Remove old CSS and fix bugs

Each phase was merged independently. The grid remained functional throughout.

---

## Key Files Created/Modified

### Affordance System (Phase 1)

```
src/systems/vibegrid/affordances/
├── types.ts              # AffordanceAction, AffordanceGroup, FieldTypeAffordance types
├── AffordanceGroups.ts   # 7 reusable group definitions
├── AffordanceResolver.ts # Resolution logic + singleton
├── affordances.css       # All cursor/hover CSS
└── index.ts              # Re-exports
```

### Field Types Modified (Phase 2)

All 23 field types in `src/systems/vibegrid/field-types/implementations/`:
- Added `affordance: FieldTypeAffordance` declaration
- Added `data-affordance` and `data-affordance-role` attributes in `render()`
- Removed inline cursor styles

### Router Updated (Phase 3)

`src/systems/vibegrid/routing/CellActionRouter.ts`:
- `determineAction()` now checks `data-affordance` attribute first
- Maps: `edit` → 'edit', `toggle` → 'edit', `navigate` → 'navigate', `none` → 'none'

### Critical Bug Fix (Phase 4)

`src/systems/vibegrid/field-types/ModularCellBridge.ts`:
- `createCellFast()` now applies affordance attributes
- This path handles 99% of cells and was missing affordance application

---

## Affordance Pattern

### Adding Affordance to a Field Type

```typescript
import type { FieldTypeAffordance } from '../../../affordances/types'

export const MyFieldType: VibeGridFieldType = {
  type: 'myfield',
  // ... existing properties ...

  affordance: {
    group: 'editable-content',        // or 'editable-badge', 'toggle-control', etc.
    whenNotEditable: 'readonly-display', // fallback when column.editable === false
  } as FieldTypeAffordance,
}
```

### Adding Data Attributes in Renderer

```typescript
render(value: any, column: EnhancedColumn, rowData: any): HTMLElement {
  const container = document.createElement('span')
  const isEditable = column.editable !== false

  // Set affordance data attributes
  container.dataset.affordance = isEditable ? 'edit' : 'none'
  container.dataset.affordanceRole = 'content'  // or 'badge', 'control', 'link', 'icon'

  // ... rest of render logic ...
  return container
}
```

---

## Testing Checklist

### Manual Testing

**Platform Users Grid** (custom schema with editable: false columns):
- [x] email column: pointer cursor, edit works
- [x] name column: pointer cursor, edit works
- [x] role column: pointer cursor, dropdown opens
- [x] emailVerified column: default cursor, no edit
- [x] createdAt column: default cursor, no edit

**DataForge Entity Grid** (enriched schema):
- [x] title/name column: pointer on text (navigate), pointer on icon (edit)
- [x] status column: pointer cursor, dropdown opens
- [x] date columns: pointer cursor, picker opens

**Global States**:
- [x] Column drag: grabbing cursor
- [x] Column resize: col-resize cursor
- [x] Normal state: correct cursors per affordance

---

## Rollback Procedure

### Phase-by-Phase Rollback

**Phase 1** (affordance system):
- Remove `affordances.css` import from vibegridx.css

**Phase 2** (field type migration):
- Revert individual field type files
- Old CSS classes still work until Phase 4

**Phase 3** (action router):
- Revert CellActionRouter changes
- Falls back to legacy attribute checking

**Phase 4** (cleanup):
- Standard git revert

---

## Definition of Done

- [x] All 23 field types have affordance declarations
- [x] CellActionRouter reads data-affordance attributes
- [x] Single CSS file handles all cursor logic
- [x] Platform Users grid shows correct cursors
- [x] DataForge grids work unchanged
- [x] No inline cursor styles in any renderer
- [x] Old CSS classes removed
- [x] ModularCellBridge.createCellFast() applies affordances
- [x] All manual tests pass
- [x] `pnpm typecheck` passes
- [x] `pnpm lint` passes

---

## Future Improvements

1. **Additional Affordance Groups**: `external-link`, `expandable-content`, `multi-select-badge`
2. **Accessibility**: aria-labels, keyboard navigation, screen reader testing
3. **Animation**: Transition timing, reduced-motion preferences
4. **Testing**: Unit tests for AffordanceResolver, E2E cursor tests

---

**Template Version**: 2.0
