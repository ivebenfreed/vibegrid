---
domain: vibegrid
status: active
relatedRules:
  - vibegrid
  - vibegrid-interactions
---
# Clipboard & Fill Handle

Copy/paste with column type awareness, single-cell broadcast, and Excel-style fill handle for drag-to-fill.

## Overview

- **Domain:** vibegrid
- **Status:** active
- **Related Issues:** GH#187

## Behaviors

### Copy/Paste

### B1: Ctrl+C copies selected cells
- **ID:** copy-cells
- **Trigger:** User selects cells and presses Ctrl+C (Cmd+C on Mac)
- **Expected:** Selected cell values are copied to the system clipboard with rich metadata (column types, source column IDs). A dotted border appears around the copied region. Toast notification confirms copy.
- **Verify:** Clipboard contains cell data, dotted border visible around source cells, can paste in external apps (Excel, Google Sheets)
- **Source:** `managers/ClipboardManager.ts` → `handleCopy()`

### B2: Ctrl+V pastes into selected cells
- **ID:** paste-cells
- **Trigger:** User selects target cell(s) and presses Ctrl+V (Cmd+V on Mac)
- **Expected:** Clipboard data is validated against target column types. Compatible values are pasted. Incompatible types show an error toast (e.g., "Cannot paste text into number column"). Paste respects column type formatting.
- **Verify:** Values appear in target cells, type mismatches rejected with error message, pasted values formatted correctly for target column type
- **Source:** `managers/ClipboardManager.ts` → `handlePaste()`

### B3: Single-cell copy broadcasts to multi-cell selection
- **ID:** paste-broadcast
- **Trigger:** User copies a single cell (Ctrl+C), selects multiple cells, then pastes (Ctrl+V)
- **Expected:** The single copied value is broadcast (pasted) into all selected cells, provided they share the same column type.
- **Verify:** All selected cells receive the copied value, works across multiple rows in the same column
- **Source:** `managers/ClipboardManager.ts` → single-cell broadcast logic

### B4: Ctrl+X cuts selected cells
- **ID:** cut-cells
- **Trigger:** User selects cells and presses Ctrl+X
- **Expected:** Cell values are copied to clipboard (same as Ctrl+C), then the source cells are cleared to empty/null.
- **Verify:** Values in clipboard, source cells now empty, paste works with cut data
- **Source:** `managers/ClipboardManager.ts`

### B5: Column type validation on paste
- **ID:** paste-type-validation
- **Trigger:** User pastes data from a different column type (e.g., text from a "name" column into a "date" column)
- **Expected:** Type-aware validation checks compatibility. Compatible conversions proceed (e.g., number string into number column). Incompatible conversions show error toast with explanation (e.g., "Cannot paste: column mismatch").
- **Verify:** Compatible pastes succeed silently, incompatible pastes show clear error message
- **Source:** `managers/ClipboardManager.ts` → origin column validation

### Fill Handle

### B6: Drag fill handle to fill cells down
- **ID:** fill-handle-down
- **Trigger:** User selects a cell, then drags the small square handle at the bottom-right corner of the selection downward
- **Expected:** A dashed border preview shows which cells will be filled. On release, the source cell's value is copied into all cells in the fill range. Fill respects group boundaries — won't fill across group headers.
- **Verify:** Dashed preview visible during drag, cells filled with source value on release, group boundaries respected
- **Source:** `overlays/FillHandleLayerDOM.ts`

### B7: Drag fill handle up to fill cells upward
- **ID:** fill-handle-up
- **Trigger:** User drags the fill handle upward from a selected cell
- **Expected:** Same as fill-down but in reverse direction. Preview shows upward fill range. Source value fills into cells above.
- **Verify:** Upward fill preview visible, cells above filled on release
- **Source:** `overlays/FillHandleLayerDOM.ts`

## Notes

- ClipboardManager is a 54KB implementation with full type-awareness
- Rich clipboard metadata tracks source column types for cross-grid paste validation
- Copy region visual (dotted border) is rendered by `ClipboardOverlayDOM.ts`
- Fill handle is group-boundary aware — dragging past a group header stops at the boundary
- Fill handle uses a 5ms budget for preview rendering to maintain 60fps
- All clipboard operations go through CommandBus for undo/redo support
