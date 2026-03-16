---
primitive: vibegrid
status: active
relatedRules:
  - vibegrid
  - vibegrid-interactions
---
# Editing

Inline cell editing with type-aware editors, blur policy system, validation, and undo/redo integration.

## Overview

- **Domain:** vibegrid
- **Status:** active
- **Related Issues:** GH#187

## Behaviors

### Inline Cell Editing

### B1: Single-click starts cell editing
- **ID:** start-edit
- **Trigger:** User single-clicks a cell's edit affordance (`data-affordance="edit"`), clicks the cell content area, or presses Enter on a focused cell. Clicking the cell padding (outside content) triggers row selection instead.
- **Expected:** Edit overlay opens positioned over the cell. The appropriate editor type renders based on the column's `CellType`. Cell value is loaded into the editor.
- **Verify:** Edit overlay visible, editor matches field type (text input for text, date picker for date, select dropdown for select), existing value pre-populated. Click on cell padding selects the row, not edit.
- **Source:** `stores/EditingStore.ts` → `startEdit()`, `overlays/EditingOverlay.tsx`, `coordination/InteractionCoordinator.ts`

### B2: Commit edit on Enter or blur
- **ID:** commit-edit
- **Trigger:** User presses Enter or clicks outside the edit overlay (when blur policy is 'commit')
- **Expected:** Pending value is validated. If valid, value is persisted to the data source via CommandBus. Edit overlay closes. Cell displays updated value.
- **Verify:** Cell shows new value, no edit overlay visible, data persisted (check via API or DB)
- **Source:** `stores/EditingStore.ts` → `commitEdit()`, `commitPendingValue()`

### B3: Cancel edit on Escape
- **ID:** cancel-edit
- **Trigger:** User presses Escape while editing a cell
- **Expected:** Edit overlay closes. Cell reverts to its original value (before editing started). No data change persisted.
- **Verify:** Cell shows original value, edit overlay gone, no API call made
- **Source:** `stores/EditingStore.ts` → `cancelEdit()`

### B4: Tab moves to next editable cell
- **ID:** tab-navigation-edit
- **Trigger:** User presses Tab while editing a cell
- **Expected:** Current edit commits (if valid). Focus and edit mode move to the next editable cell in the row. Shift+Tab moves to the previous cell.
- **Verify:** Previous cell shows committed value, next cell enters edit mode automatically
- **Source:** `stores/EditingStore.ts` → `commitAndMoveNext()`

### B5: Validation errors display inline
- **ID:** edit-validation
- **Trigger:** User enters invalid data (e.g., text in a number field, invalid email format)
- **Expected:** Validation error message appears below the editor. Cell border turns red. Edit is not committed until error is resolved.
- **Verify:** Error message visible, commit blocked, fixing value clears error
- **Source:** `stores/EditingStore.ts` → `validationError` observable

### Editor Types

### B6: Text editor for string fields
- **ID:** editor-text
- **Trigger:** Edit starts on a text, string, or similar field
- **Expected:** Single-line text input renders with current value. Supports standard text editing (select all, cut, copy, paste).
- **Verify:** Text input visible, can type and edit, Enter commits
- **Source:** `overlays/EditingOverlay.tsx`

### B7: Select editor for option fields
- **ID:** editor-select
- **Trigger:** Edit starts on a select, single-select, enum, or status field
- **Expected:** Dropdown renders with available options from the field's option set. Current value is highlighted. Selecting an option commits immediately.
- **Verify:** Dropdown with options visible, click option commits and closes
- **Source:** `overlays/EditingOverlay.tsx`

### B8: Date picker for date fields
- **ID:** editor-date
- **Trigger:** Edit starts on a date, datetime, or timestamp field
- **Expected:** Date picker calendar renders. Current date highlighted. Selecting a date commits the value.
- **Verify:** Calendar visible, selecting date commits, date formatted correctly
- **Source:** `overlays/EditingOverlay.tsx`

### B9: Boolean toggle for boolean fields
- **ID:** editor-boolean
- **Trigger:** User clicks a boolean cell (single click toggles, no overlay needed)
- **Expected:** Value toggles between true/false immediately. No edit overlay — direct inline toggle.
- **Verify:** Cell icon changes (✓ Yes ↔ ✗ No), value persisted
- **Source:** `overlays/EditingOverlay.tsx`

### B10: Currency editor with $ prefix
- **ID:** editor-currency
- **Trigger:** Edit starts on a currency field
- **Expected:** Number input with currency prefix ($). Accepts decimal values. Formats on commit (comma separators, 2 decimal places).
- **Verify:** Input shows $, accepts numbers, formatted on blur
- **Source:** `overlays/EditingOverlay.tsx`

### B11: Long text / markdown modal editor
- **ID:** editor-longtext
- **Trigger:** Edit starts on a textarea, markdown, rich-text, or longtext field
- **Expected:** Modal overlay opens with a larger text area. Supports multi-line editing. Portal-based rendering keeps overlay open on body interaction.
- **Verify:** Modal editor visible, multi-line input works, clicking within modal doesn't close it
- **Source:** `overlays/EditingOverlay.tsx`, portal with `vibegridx-editing-portal` + `data-cell-id`

### Blur Policy

### B12: Blur policy controls outside-click behavior
- **ID:** blur-policy
- **Trigger:** User clicks outside an active edit overlay
- **Expected:** Behavior depends on the active blur policy:
  - `commit`: Outside click commits the pending value (default for most editors)
  - `cancel`: Outside click cancels the edit (used for complex editors)
  - `keep-open`: Outside click is ignored, editor stays open (used for modal editors like longtext)
- **Verify:** Click outside behaves according to the editor's blur policy setting
- **Source:** `stores/EditingStore.ts` → `blurPolicy` observable, `handleBlur()`

### Undo/Redo

### B13: Ctrl+Z undoes last cell edit
- **ID:** undo-edit
- **Trigger:** User presses Ctrl+Z (Cmd+Z on Mac) when the grid has focus
- **Expected:** Last cell edit is reverted. Cell displays previous value. Multiple Ctrl+Z steps back through edit history.
- **Verify:** Cell value reverts, multiple undos work sequentially
- **Source:** `FocusAwareUndoRouter`, `CommandBus` undo stack

### B14: Ctrl+Shift+Z redoes undone edit
- **ID:** redo-edit
- **Trigger:** User presses Ctrl+Shift+Z after undoing an edit
- **Expected:** Redoes the previously undone edit. Cell displays the re-applied value.
- **Verify:** Cell value re-applied after redo
- **Source:** `FocusAwareUndoRouter`, `CommandBus` redo stack

## Notes

- EditingStore manages the full edit lifecycle as a MobX-observable state machine
- 17+ editor type variants mapped to CellType enum
- Edit overlays use React portals positioned absolutely over the cell DOM element
- Modal editors (longtext, markdown) use `vibegridx-editing-portal` with `data-cell-id` markers for outside-click tracking
- All edits route through CommandBus for undo/redo tracking
- Blur policy is set per-editor-type, not globally
