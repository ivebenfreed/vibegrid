---
primitive: vibegrid
status: active
relatedRules:
  - vibegrid
  - vibegrid-interactions
---
# Selection

Cell and row selection with keyboard range extension, visual overlays, and multi-selection modes.

## Overview

- **Domain:** vibegrid
- **Status:** active
- **Related Issues:** GH#187, GH#1437

## Behaviors

### Cell Selection

### B1: Single click selects cell
- **ID:** select-single-cell
- **Trigger:** User clicks on a cell content area
- **Expected:** Cell is selected (added to `selectedCells` Set). Cell gets `vibegridx-selected` CSS class. Selection overlay appears with blue highlight + border. Previous selection is cleared (unless Ctrl held).
- **Verify:** Cell has blue highlight, `selectedCells` contains `{rowId}:{columnId}`
- **Source:** `stores/InteractionStore.ts`, `overlays/SelectionOverlayDOM.ts`

### B2: Ctrl+click toggles cell in selection
- **ID:** select-ctrl-click
- **Trigger:** User holds Ctrl (Cmd on Mac) and clicks another cell
- **Expected:** Clicked cell is added to selection if not selected, or removed if already selected (toggle). Previous selections are preserved. Non-contiguous selection is supported.
- **Verify:** Multiple cells selected simultaneously, clicking selected cell deselects it
- **Source:** `stores/InteractionStore.ts`

### B3: Shift+click selects rectangular range
- **ID:** select-shift-range
- **Trigger:** User clicks cell A, then Shift+clicks cell B
- **Expected:** All cells in the rectangular region between A and B are selected (inclusive). Selection is rectangular — covers all rows × columns in bounds. Anchor cell (A) is preserved for subsequent Shift+clicks.
- **Verify:** Rectangular selection visible, all cells within bounds selected, anchor cell unchanged
- **Source:** `stores/InteractionStore.ts`

### B4: Shift+arrow extends selection range
- **ID:** select-shift-arrow
- **Trigger:** User selects a cell, then presses Shift+arrow key
- **Expected:** Selection extends one cell in the arrow direction, maintaining rectangular shape. Anchor cell stays at the original selection start. Repeated Shift+arrows extend the range further.
- **Verify:** Selection grows by one cell per arrow press, rectangle maintained
- **Source:** `renderers/modules/KeyboardController.ts`

### B5: Ctrl+A selects all cells
- **ID:** select-all
- **Trigger:** User presses Ctrl+A (Cmd+A on Mac) while grid has focus
- **Expected:** All visible data cells selected (excluding the selection checkbox column). Select-all header checkbox becomes checked.
- **Verify:** All cells highlighted, header checkbox checked, `selectedCells.size == rows × visibleColumns`
- **Source:** `renderers/modules/KeyboardController.ts`

### B6: Escape clears selection
- **ID:** select-clear-escape
- **Trigger:** User presses Escape (when not in edit mode)
- **Expected:** All cells deselected. Selection overlay hides. Focused cell indicator remains.
- **Verify:** No blue highlights, `selectedCells` empty, focus indicator still visible
- **Source:** `stores/InteractionStore.ts`

### B7: Click empty area clears selection
- **ID:** select-clear-click
- **Trigger:** User clicks on grid background (empty space within viewport, not on a cell)
- **Expected:** All cells deselected. Same behavior as Escape.
- **Verify:** Selection cleared on background click, not cleared when clicking cells
- **Source:** `renderers/modules/ScrollController.ts` → `handleOutsideClick()`

### Row Selection

### B8: Row checkbox selects entire row
- **ID:** select-row-checkbox
- **Trigger:** User clicks the checkbox in the leftmost selection column
- **Expected:** All cells in that row are selected. Row checkbox appears checked. `lastSelectedRowId` tracked for Shift+click range.
- **Verify:** All cells in row selected, checkbox checked
- **Source:** `stores/InteractionStore.ts`

### B9: Shift+checkbox selects row range
- **ID:** select-row-range
- **Trigger:** User clicks a row checkbox, then Shift+clicks another row's checkbox
- **Expected:** All rows between the two checkboxes are selected (inclusive). All cells in all rows selected.
- **Verify:** Multiple rows highlighted, all checkboxes in range checked
- **Source:** `stores/InteractionStore.ts`

### B10: Header checkbox toggles select all
- **ID:** select-all-checkbox
- **Trigger:** User clicks the "Select all" checkbox in the header row
- **Expected:** Toggle behavior: if no/partial selection → select all rows. If all selected → deselect all. Checkbox shows indeterminate state when partial.
- **Verify:** Checkbox state: checked (all), indeterminate (partial), unchecked (none)
- **Source:** `stores/InteractionStore.ts`

### Selection Overlay

### B11: Contiguous rows merge into single overlay
- **ID:** overlay-merge
- **Trigger:** User selects cells spanning multiple adjacent rows
- **Expected:** Selection overlay merges contiguous rows into a single rectangle (instead of per-row rectangles). Reduces DOM elements for large selections.
- **Verify:** Single blue rectangle spans multiple rows, not individual row highlights
- **Source:** `overlays/SelectionOverlayDOM.ts`

### B12: Non-contiguous selection shows separate overlays
- **ID:** overlay-separate
- **Trigger:** User Ctrl+clicks cells in rows 1, 3, 5 (skipping rows 2, 4)
- **Expected:** Separate overlay rectangles for each non-contiguous group. Gaps visible between overlay regions.
- **Verify:** Multiple distinct overlay elements with visible gaps
- **Source:** `overlays/SelectionOverlayDOM.ts`

### Edge Cases

### B13: Arrow key at grid boundary stays in place
- **ID:** select-boundary
- **Trigger:** Focus on bottom-right cell, press Down or Right arrow
- **Expected:** Focus does not move. Selection unchanged. No error.
- **Verify:** `focusedCell` unchanged after boundary arrow press

### B14: Arrow key skips hidden columns
- **ID:** select-skip-hidden
- **Trigger:** Focus on cell, press Right arrow toward a hidden column
- **Expected:** Focus skips the hidden column and lands on the next visible column.
- **Verify:** `focusedCell` is in the next visible column, hidden column skipped

### B15: Selection column excluded from selection
- **ID:** select-column-exclusion
- **Trigger:** Any selection operation (Ctrl+A, Shift+click, etc.)
- **Expected:** The leftmost selection checkbox column is never included in `selectedCells`. Only data columns are selectable.
- **Verify:** `selectedCells` does not contain any entries with the selection column ID

### B16: Focus recovers after filter change
- **ID:** focus-recovery
- **Trigger:** User has a cell focused, then applies a filter that hides that row
- **Expected:** Focus moves to the first visible cell automatically. Log warning about focus recovery.
- **Verify:** `focusedCell` points to a valid visible cell after filter

## Notes

- Selection state modeled as `Set<string>` with entries in `{rowId}:{columnId}` format
- `selectionVersion` counter (MobX observable) increments on any change — used for cheap diffing
- `anchorCell` preserved during Shift operations (not updated until next non-Shift click)
- Selection overlay uses DOM element pooling — reuses elements instead of creating/destroying
- Overlay bounds signature (`x,y,w,h|x,y,w,h|...`) compared to avoid unnecessary DOM mutations
- Delta-based updates: only cells whose selection state changed get DOM class updates (O(delta) not O(n))
