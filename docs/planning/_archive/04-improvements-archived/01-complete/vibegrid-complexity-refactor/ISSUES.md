# VibegGrid Known Issues

Issues discovered during refactoring and testing. To be addressed separately.

---

## Issue #1: Range Selection Ignores Column Reordering

**Status:** ✅ Fixed - 2025-11-26
**Severity:** Medium
**Discovered:** 2025-11-26 during Phase 2.6 testing
**Fixed:** 2025-11-26 in session-10
**Component:** InteractionStore (range selection logic)

### Description

When dragging to select a range of cells after columns have been reordered, the selection range is calculated using the **original column order** instead of the **current visual order**.

### Steps to Reproduce

1. Reorder columns (e.g., move Description before Title)
   - Visual order becomes: Description, Title, Priority
2. Select a cell in the Title column
3. Drag to the right towards Priority column
4. Release mouse

**Expected:** Select Title and Priority columns (2 columns)
**Actual:** Selects Title, Priority, AND Description (3 columns)

### Example Logs

```
Cell selected {cellId: '...:title'}
Drag selection started {startCell: '...:title'}
Full range selection {start: '...:title', end: '...:priority', totalCells: 15, rowRange: '2-6', colRange: '0-2'}
```

Note: `colRange: '0-2'` means 3 columns selected, when only 2 should be selected.

### Root Cause

The range selection logic in InteractionStore calculates the column range using column indices from the **original column order** (before reordering), not the **visual column order** (after reordering).

When calculating "all columns between start and end", it uses the logical indices, which don't match the visual order after columns are rearranged.

### Visual Example

**Original Order:** Description (0), Title (1), Priority (2)
**After Reorder:** Description (moved), Title (0), Priority (1)

**User drags:** Title → Priority (visual indices 0-1)
**System calculates:** Indices 1-2 in original order = Title, Priority, Description

### Files Involved

- `src/systems/vibegrid/stores/InteractionStore.ts` - Range selection calculation
- Likely methods:
  - `selectRange()`
  - `dragSelectUpdate()`
  - Any method that calculates column ranges

### Fix Applied

Modified `src/systems/vibegrid/stores/InteractionStore.ts` (lines 648-651):
- Changed range selection to use `this.visualStateStore.visibleOrderedColumns` instead of filtering dataContext columns
- This ensures range calculation uses visual column order (after reordering) not logical order
- Added assertion to ensure VisualStateStore is initialized before access

**Technical Details:**
- The issue was in the `selectRange()` method which used `columns.filter()` from dataContext
- This only filtered by visibility, not reordering
- Now uses `VisualStateStore.visibleOrderedColumns` which respects `columnOrder` state
- Column indices now match visual order, fixing range selection after reordering

### Impact

**User Experience:**
- Confusing selection behavior when columns are reordered
- Unexpected columns get selected during drag operations
- Makes it hard to select specific column ranges

**Workaround:**
- Don't reorder columns (not ideal)
- Use click instead of drag to select individual cells

### Related Components

This bug exists in the **original InteractionStore code**, not in the new SelectionOverlayController. The controller correctly displays whatever InteractionStore tells it to select.

### Testing Notes

Discovered during Phase 2.6 testing of SelectionOverlayController. The controller is working correctly - it's displaying the selection that InteractionStore calculates. The bug is in the range calculation logic itself.

### Priority

Medium - affects usability after column reordering, but has workaround (don't reorder columns, or use click instead of drag).

Should be fixed before release, but not blocking the controller refactor work.

---

## Issue #2: Sort Triggered on Column Resize Mouse Up

**Status:** ✅ Fixed - 2025-11-26
**Severity:** Low
**Discovered:** 2025-11-26 during Phase 2.6 testing
**Fixed:** 2025-11-26 in session-10
**Component:** Column header event handling

### Description

When resizing a column, the sort handler is incorrectly triggered on mouse up. This causes unintended sorting when the user only wanted to resize.

### Steps to Reproduce

1. Hover over column border until resize cursor appears
2. Click and drag to resize column
3. Release mouse (mouse up)
4. **Unexpected:** Sort is triggered on the column

**Expected:** Only resize should occur, no sort
**Actual:** Both resize completes AND sort is triggered

### Root Cause

Mouse up event during resize is being interpreted as a click on the column header, which triggers the sort handler. The resize event handling doesn't prevent the sort handler from firing.

### Fix Applied

Modified `src/systems/vibegrid/renderers/components/HeaderRenderer.ts` (lines 479-485):
- Added `e.stopPropagation()` to the resize mouseup handler
- Added `e.preventDefault()` to prevent default click behavior
- This prevents the mouseup event from bubbling and triggering the sort handler

**Technical Details:**
- The resize handler already had `e.stopPropagation()` on mousedown
- But the mouseup handler (document-level listener) didn't stop propagation
- After mouseup completed, a click event could fire on the column header
- This click triggered `MouseController` sort handler at line 901-943
- Adding stopPropagation to mouseup prevents the click event chain

### Files Modified

- `src/systems/vibegrid/renderers/components/HeaderRenderer.ts` - setupResizeHandler() method

### Impact

**User Experience:**
- Annoying - unintended sort when resizing
- Can change data order unexpectedly
- Confusing behavior (user only wanted to resize)

**Workaround:**
- Be careful when releasing mouse after resize
- Re-sort back to original order if needed

### Priority

Low - annoying but has workaround. Should be fixed but not urgent.

---

## Issue #3: Boolean Field Type Doesn't Open Edit on Click

**Status:** ✅ Fixed - 2025-11-26
**Severity:** Medium
**Discovered:** 2025-11-26 during Phase 6 testing
**Fixed:** 2025-11-26 in commit a759b49e
**Component:** Boolean field editor, cell click handling

### Description

Boolean field type cells don't enter edit mode when clicked. User expects to be able to click a boolean cell to toggle or edit the value, but nothing happens.

### Steps to Reproduce

1. Click on a cell with boolean field type
2. **Expected:** Edit overlay opens or value toggles
3. **Actual:** Nothing happens, cell doesn't enter edit mode

### Root Cause

CellActionRouter's content-click detection used `querySelector('span')` which found nested spans in complex structures like boolean badges, instead of the direct content element. This caused the click detection to fail for boolean fields with complex nested HTML.

**Fix:** Changed to use `firstElementChild` directly to get the actual content element (the direct child of the cell container), which works correctly for all field types including those with complex nested structures.

### Fix Applied

Modified `src/systems/vibegrid/routing/CellActionRouter.ts` (line 174):
- Changed from: `cellContainer?.querySelector('span') || cellContainer?.firstElementChild`
- Changed to: `cellContainer?.firstElementChild`
- Reason: querySelector finds nested spans in complex structures; firstElementChild gets the direct content element

### Files Modified

- `src/systems/vibegrid/routing/CellActionRouter.ts` - Content-click detection logic

### Impact

**User Experience:**
- Can't edit boolean fields by clicking
- Have to use keyboard or other method to toggle
- Inconsistent with other field types

**Workaround:**
- Use keyboard navigation to enter edit mode
- Use context menu if available

### Priority

Medium - affects usability of boolean fields. Should be fixed soon.

---

## Issue #4: Number Field Editor Doesn't Submit on Enter

**Status:** ✅ Fixed - 2025-11-26
**Severity:** High
**Discovered:** 2025-11-26 during Phase 6 testing
**Fixed:** 2025-11-26 in commit a759b49e
**Component:** NumberEditor component

### Description

When editing a number field, pressing Enter doesn't submit the value and close the editor. This breaks the expected editing flow.

### Steps to Reproduce

1. Click on a number field cell to enter edit mode
2. Type a new number value
3. Press Enter key
4. **Expected:** Value saves and edit overlay closes
5. **Actual:** Nothing happens, editor stays open

### Root Cause

NumberEditor was missing `e.stopPropagation()` on Enter and Tab key handlers, allowing the event to bubble up and potentially interfere with the commit process. This caused inconsistent behavior compared to other editors like TextEditor which properly stops event propagation.

### Fix Applied

Modified `src/systems/vibegrid/overlays/editors/NumberEditor.tsx` (lines 26, 36):
- Added `e.stopPropagation()` after `e.preventDefault()` for Enter key handler
- Added `e.stopPropagation()` after `e.preventDefault()` for Tab key handler
- Matches pattern used in TextEditor for consistency
- Prevents event bubbling that could interfere with commit

### Files Modified

- `src/systems/vibegrid/overlays/editors/NumberEditor.tsx` - Enter/Tab key handlers

### Impact

**User Experience:**
- Can't efficiently edit number fields (broken workflow)
- Have to click outside or use Escape (unclear to users)
- Slows down data entry significantly
- Frustrating editing experience

**Workaround:**
- Click outside the cell to save (loses focus)
- Use Tab key to move to next cell (if that works)
- Use Escape then re-enter (inefficient)

### Priority

**High** - This is a critical usability issue that breaks the standard editing flow. Should be fixed immediately.

---

## Issue #5: Title Field Type - Remove Background Highlight on Hover

**Status:** ✅ Fixed - 2025-11-26
**Severity:** Low
**Discovered:** 2025-11-26 during Phase 6 testing
**Fixed:** 2025-11-26 in commit 3b1ea4f9
**Component:** Title field type styling

### Description

Title field type cells show a background highlight on hover. We want to remove this background highlight but keep the underline and pencil icon indicators.

### Current Behavior

On hover over title field cell:
- ✅ Underline appears (good - keep this)
- ✅ Pencil icon appears (good - keep this)
- ❌ Background highlight appears (bad - remove this)

### Desired Behavior

On hover over title field cell:
- ✅ Underline appears (keep)
- ✅ Pencil icon appears (keep)
- ✅ No background highlight (remove)

### Fix Applied

Modified `src/systems/vibegrid/vibegridx-cells.css` (lines 733-739):
- Commented out `.vibegridx-cell-entity-name:hover` background-color rules
- Commented out both light mode and dark mode background styles
- Preserved underline and pencil icon hover effects

**What still works:**
- Text underline on hover (`.vibegridx-entity-name-text:hover`)
- Pencil icon appears on hover (`.vibegridx-entity-name-edit-icon`)
- All edit functionality preserved

### Files Modified

- `src/systems/vibegrid/vibegridx-cells.css` - Entity name (title) field hover styles

### Impact

**User Experience:**
- Minor visual preference
- Doesn't affect functionality
- Aesthetic improvement

### Priority

**Low** - This is a nice-to-have visual improvement, not a bug. Can be addressed when convenient.

---

---

## Issue #6: Dropdown Editor Stays Open When Clicking Elsewhere

**Status:** 🐛 Bug - Not Fixed
**Severity:** Medium
**Discovered:** 2025-11-26 during testing
**Component:** Dropdown editors, EditSessionManager

### Description

When a dropdown editor (select, multi-select, combobox, etc.) is visible and the user clicks to another cell or location in the table, the dropdown remains open instead of closing/canceling the edit session.

### Steps to Reproduce

1. Click on a cell with a dropdown field type (select, multi-select, combobox, relationship)
2. Dropdown editor opens
3. Click on a different cell in the table
4. **Expected:** Dropdown closes and edit session ends
5. **Actual:** Dropdown stays open, new cell is selected but dropdown persists

### Root Cause

**Hypothesis:**
- EditSessionManager or dropdown editors may not be handling click-outside events properly
- The outside click handler may not be detecting clicks on other table cells
- Dropdown editors may need explicit close logic when selection changes

### Potential Fix

Need to investigate:
1. How EditSessionManager handles outside clicks
2. Whether dropdown editors listen for selection changes
3. If InteractionStore selection changes should trigger edit cancel
4. Proper event handling for click-outside detection

### Files Involved

Likely:
- EditSessionManager or editing overlay management
- Dropdown editor components (SelectEditor, MultiSelectEditor, ComboboxEditor)
- InteractionStore click handling
- Outside click detection logic

### Impact

**User Experience:**
- Confusing - dropdown persists when it shouldn't
- Can't easily cancel editing by clicking away
- Visual clutter when dropdown stays open
- May block interaction with other cells

**Workaround:**
- Press Escape to cancel edit
- Click outside the table entirely

### Priority

**Medium** - Affects usability of dropdown fields, but has workaround (Escape key).

---

## Issue #7: Number Field Enter Key Shows Warning and Doesn't Save

**Status:** 🐛 Bug - Not Fixed
**Severity:** High
**Discovered:** 2025-11-26 during testing
**Component:** NumberEditor, EditSessionManager

### Description

When using Enter key to start editing a number field, a warning appears in the console and the value doesn't properly save. The warning indicates that `commit()` was called but there's no active edit session.

### Steps to Reproduce

1. Select a number field cell
2. Press Enter to start editing
3. Type a new number value
4. Press Enter to save
5. **Expected:** Value saves and edit completes
6. **Actual:** Warning appears and value may not save

### Console Output

```
ℹ️ [InteractionStore] Cell selected {cellId: '...', isMulti: false, selectionCount: 1}
⚠️ [EditSessionManager] commit() called but no active session {reason: 'user-action'}
```

### Root Cause

**Hypothesis:**
- Enter key starts edit but EditSessionManager session is not properly initialized
- There may be a race condition between cell selection and edit session creation
- NumberEditor may be calling commit before session is ready
- InteractionStore and EditSessionManager may be out of sync

**Related to Issue #4:**
- Issue #4 was about Enter not submitting at all
- This may be the same issue manifesting differently
- Or a regression from the Issue #4 fix (stopPropagation added)

### Potential Fix

Need to investigate:
1. EditSessionManager session lifecycle
2. When session is created vs when editor is mounted
3. NumberEditor Enter key handling and timing
4. Whether Issue #4 fix introduced this problem
5. Proper coordination between InteractionStore.startEdit and EditSessionManager

### Files Involved

- `src/systems/vibegrid/overlays/editors/NumberEditor.tsx`
- EditSessionManager (edit session lifecycle)
- `src/systems/vibegrid/stores/InteractionStore.ts` (startEdit method)
- Edit overlay management

### Impact

**User Experience:**
- **Critical** - Can't reliably edit number fields
- Broken workflow for number entry
- Data may not save when expected
- Confusing console warnings

**Workaround:**
- Click into field instead of using Enter to start edit
- Tab to next field instead of Enter to save
- Click outside to save (if that works)

### Priority

**High** - This is a critical usability issue that affects number field editing workflow. Should be fixed soon.

**Note:** This may be related to or a regression from Issue #4 fix. Need to investigate if the stopPropagation changes affected edit session initialization.

---

## Future Issues

Additional issues discovered during refactoring will be documented here.
