---
domain: vibegrid
status: active
relatedRules:
  - vibegrid
  - vibegrid-interactions
---
# Clipboard & Fill Handle

Copy/paste with column type awareness, single-cell broadcast, type validation with detailed error reporting, and Excel-style fill handle.

## Overview

- **Domain:** vibegrid
- **Status:** active
- **Related Issues:** GH#187

## Behaviors

### Copy

### B1: Ctrl+C copies selected cells
- **ID:** copy-cells
- **Trigger:** User selects cells and presses Ctrl+C (Cmd+C on Mac)
- **Expected:** Selected cell values copied to system clipboard with rich metadata (column types, source column IDs, display values). Green dashed border with marching ants animation appears around copied region. Toast: "Copied to clipboard - N cells copied" (2000ms). Clipboard preserved for multiple pastes.
- **Verify:** Toast appears, green dashed border with animation visible, can paste in external apps
- **Source:** `managers/ClipboardManager.ts` → `handleCopy()`

### B2: Copy preserves display values for select fields
- **ID:** copy-display-values
- **Trigger:** User copies cells containing select/multi-select fields
- **Expected:** Rich metadata includes `displayValue` with the option label (not raw value). Multi-select fields store comma-separated labels. Dates stored as ISO strings.
- **Verify:** Pasting into external app shows labels not raw IDs

### B3: Copy with no selection shows warning
- **ID:** copy-no-selection
- **Trigger:** User presses Ctrl+C with no cells selected
- **Expected:** Toast warning: "Select cells to copy first" (3000ms). No clipboard change.
- **Verify:** Warning toast, clipboard unchanged

### Cut

### B4: Ctrl+X cuts selected cells
- **ID:** cut-cells
- **Trigger:** User selects cells and presses Ctrl+X
- **Expected:** Cell values copied to clipboard with `operation: 'cut'`. Source cells cleared to empty. Red dashed border (not green) with marching ants. Toast: "Data cut to clipboard - N cells cut". Clipboard cleared after next paste (unlike copy).
- **Verify:** Source cells empty, red overlay, clipboard cleared after paste
- **Source:** `managers/ClipboardManager.ts`

### B5: Cut then paste clears clipboard
- **ID:** cut-paste-clears
- **Trigger:** Cut cells, paste, then try to paste again
- **Expected:** First paste succeeds. Clipboard is cleared. Second paste without new copy shows: "No clipboard data - Copy some cells first before pasting".
- **Verify:** Second paste fails, overlay disappears after first paste

### Paste — Basic Operations

### B6: Paste single cell to single cell (same type)
- **ID:** paste-single-same
- **Trigger:** Copy 1 cell, select 1 target cell of same type, paste
- **Expected:** Value pasted. Toast: "Data pasted successfully - 1 cells updated". Clipboard preserved (can paste again).
- **Verify:** Cell value changed, toast success, clipboard NOT cleared

### B7: Single-cell broadcast to multi-cell selection
- **ID:** paste-broadcast
- **Trigger:** Copy 1 cell, select 5 target cells, paste
- **Expected:** Same value pasted into all 5 cells. Type compatibility checked per cell. Toast: "Data pasted successfully - 5 cells updated".
- **Verify:** All 5 cells contain source value
- **Source:** `managers/ClipboardManager.ts` → single-cell broadcast

### B8: Multi-cell paste to single cell auto-expands
- **ID:** paste-auto-expand
- **Trigger:** Copy 3×3 grid of cells, select 1 target cell, paste
- **Expected:** 3×3 block auto-expands from target cell downward and rightward. Column order preserved from source. 9 cells updated.
- **Verify:** 3×3 block pasted starting from selected cell

### B9: Paste with no clipboard shows warning
- **ID:** paste-no-clipboard
- **Trigger:** Press Ctrl+V with empty clipboard
- **Expected:** Toast: "No clipboard data - Copy some cells first before pasting" (3000ms). No cells changed.
- **Verify:** Warning toast, no data change

### B10: Paste with no selection shows warning
- **ID:** paste-no-selection
- **Trigger:** Press Ctrl+V with clipboard data but no cells selected
- **Expected:** Toast: "No cells selected - Select target cells before pasting" (3000ms).
- **Verify:** Warning toast, no data change

### Paste — Type Validation

### B11: Paste text into number column (compatible)
- **ID:** paste-text-to-number
- **Trigger:** Copy text "123", paste to number column
- **Expected:** Text parsed as number (123). Paste succeeds. Formatting characters ($, commas) stripped before parsing.
- **Verify:** Cell contains number 123 (not string "123")

### B12: Paste non-numeric text into number column (error)
- **ID:** paste-invalid-number
- **Trigger:** Copy text "hello", paste to number column
- **Expected:** Toast: "Paste blocked - Incompatible types - Cannot paste text data into number field" (5000ms). Cell NOT updated.
- **Verify:** Error toast, cell unchanged, `blockedCount: 1`

### B13: Paste text into date column (compatible)
- **ID:** paste-text-to-date
- **Trigger:** Copy text "2026-03-16", paste to date column
- **Expected:** Text parsed as date via `new Date()`. Stored as ISO YYYY-MM-DD. Paste succeeds.
- **Verify:** Cell contains valid date

### B14: Paste invalid date text (error)
- **ID:** paste-invalid-date
- **Trigger:** Copy text "not a date", paste to date column
- **Expected:** Error: '"not a date" is not a valid date format'. Cell NOT updated.
- **Verify:** Error toast, `errorCount: 1`

### B15: Paste text into select field (blocked)
- **ID:** paste-text-to-select
- **Trigger:** Copy arbitrary text "random", paste to select column
- **Expected:** Toast: "Paste blocked - Incompatible types - Cannot paste arbitrary text 'random' into select field. Must match available options." Cell NOT updated.
- **Verify:** Error toast, cell unchanged, `blockedCount: 1`

### B16: Paste matching option label into select field (success)
- **ID:** paste-label-to-select
- **Trigger:** Copy text "Option A" (matches a select option label, case-insensitive), paste to select column
- **Expected:** Label matched to option. Value stored is option.value (not label). Paste succeeds.
- **Verify:** Cell contains option value, case-insensitive match works ("option a" matches "Option A")

### B17: Paste into multi-select field
- **ID:** paste-to-multi-select
- **Trigger:** Copy text "Tag 1, Tag 2", paste to multi-select column
- **Expected:** Text split by delimiters (`,`, `;`, `|`). Each value matched against option labels. Matched values stored as array. Invalid options skipped.
- **Verify:** Cell contains array of matched option values

### B18: Paste text into email column — valid
- **ID:** paste-valid-email
- **Trigger:** Copy "test@example.com", paste to email column
- **Expected:** Email validated with regex. Normalized to lowercase. Paste succeeds.
- **Verify:** Cell contains lowercase email

### B19: Paste invalid email (error)
- **ID:** paste-invalid-email
- **Trigger:** Copy "notanemail", paste to email column
- **Expected:** Error: '"notanemail" is not a valid email address'. Cell NOT updated.
- **Verify:** Error toast, `errorCount: 1`

### B20: Paste URL with auto-protocol
- **ID:** paste-url-auto-protocol
- **Trigger:** Copy "example.com", paste to URL column
- **Expected:** Protocol added: "https://example.com". Validated with URL constructor. Paste succeeds.
- **Verify:** Cell contains URL with https:// prefix

### B21: Paste phone number with formatting
- **ID:** paste-phone-formatting
- **Trigger:** Copy "(555) 123-4567", paste to phone column
- **Expected:** Formatting stripped (spaces, parens, dashes removed). Must contain 10-15 digits. Paste succeeds.
- **Verify:** Cell contains cleaned digits

### B22: Paste invalid phone (error)
- **ID:** paste-invalid-phone
- **Trigger:** Copy "123", paste to phone column (too short)
- **Expected:** Error: '"123" is not a valid phone number'. Cell NOT updated.
- **Verify:** Error toast, `errorCount: 1`

### B23: Paste boolean text values
- **ID:** paste-boolean-text
- **Trigger:** Copy "yes", paste to boolean column
- **Expected:** Recognized as boolean true. Patterns: `true/yes/1/on/checked/✓` → true, `false/no/0/off/unchecked/✗` → false.
- **Verify:** Cell contains boolean value

### B24: Paste invalid boolean (error)
- **ID:** paste-invalid-boolean
- **Trigger:** Copy "maybe", paste to boolean column
- **Expected:** Error: '"maybe" is not a valid boolean value (use true/false, yes/no, 1/0)'.
- **Verify:** Error toast, `errorCount: 1`

### Paste — Column Mismatch

### B25: Multi-cell paste to wrong column origin (blocked)
- **ID:** paste-column-mismatch
- **Trigger:** Copy columns A-C, select cells starting at column B for paste
- **Expected:** Toast: "Cannot paste: origin column mismatch. Copied from 'A' but trying to paste to 'B'." All cells blocked. No updates.
- **Verify:** Error toast (5000ms), `blockedCount == selectedCells.size`, no `pastedCount`
- **Note:** Only applies to multi-cell copy → multi-cell paste. Single-cell broadcast skips this check.

### Paste — Mixed Results

### B26: Paste with mixed success and errors
- **ID:** paste-mixed-results
- **Trigger:** Copy text "100", paste to cells in [number col, date col, text col]
- **Expected:** Number: success. Date: error (not valid date). Text: success. Toast: "Paste completed with issues - 2 updated, 1 failed". Result: `pastedCount:2, errorCount:1`.
- **Verify:** Toast shows mixed counts, some cells updated and some not

### B27: Paste all errors
- **ID:** paste-all-errors
- **Trigger:** Paste invalid data to all target cells
- **Expected:** Toast: "Paste failed - All paste operations failed". Result: `success:false, pastedCount:0`.
- **Verify:** No cells updated, error toast

### Paste — Null/Empty Values

### B28: Paste null values
- **ID:** paste-null-values
- **Trigger:** Copy cells with null/empty values, paste to target
- **Expected:** Null stored for most types. Text fields receive empty string (avoids NOT NULL constraint). Paste succeeds.
- **Verify:** Target cells cleared appropriately per type

### Clipboard Overlay

### B29: Copy overlay (green dashed + marching ants)
- **ID:** overlay-copy
- **Trigger:** Copy cells
- **Expected:** Green (#10b981) dashed border, 3px thickness. Pulsing animation (opacity 0.6→1→0.6, 2s cycle). Marching ants border-dash-offset animation (50ms cycle). Persists until new copy/cut or clipboard clear.
- **Verify:** Green dashed border visible, animation running, z-index below selection overlay

### B30: Cut overlay (red dashed)
- **ID:** overlay-cut
- **Trigger:** Cut cells
- **Expected:** Red (#ef4444) dashed border. Same animation as copy. Disappears after paste (clipboard cleared).
- **Verify:** Red border visible, disappears after paste

### Fill Handle

### B31: Drag fill handle down
- **ID:** fill-handle-down
- **Trigger:** User drags the small square at bottom-right of selection downward
- **Expected:** Dashed border preview shows fill range. On release, source value copied to all cells in range. Group-boundary aware — stops at group headers.
- **Verify:** Preview visible during drag, cells filled on release, group boundaries respected
- **Source:** `overlays/FillHandleLayerDOM.ts`

### B32: Drag fill handle up
- **ID:** fill-handle-up
- **Trigger:** User drags fill handle upward
- **Expected:** Same as fill-down but upward. Preview shows upward range.
- **Verify:** Upward fill preview, cells above filled on release

## Type Compatibility Matrix

| Source → Target | text | number | currency | date | boolean | email | url | phone | select |
|-----------------|------|--------|----------|------|---------|-------|-----|-------|--------|
| **text** | ✓ | ✓* | ✓* | ✓* | ✓* | ✓* | ✓* | ✓* | ✗ |
| **number** | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| **currency** | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| **date** | ✓ | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| **boolean** | ✓ | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ |
| **email** | ✓ | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ |
| **select** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ |

✓* = compatible with validation (parsed, may fail if invalid format)

## Notes

- ClipboardManager is 54KB with full type-aware paste validation
- Rich metadata tracks column types, display values, and source positions
- Copy preserves clipboard (can paste multiple times). Cut clears after first paste.
- Column origin mismatch check only applies to multi-cell → multi-cell paste, not single-cell broadcast
- All operations route through CommandBus for undo/redo support
- Fill handle respects group boundaries and uses 5ms budget for preview rendering
