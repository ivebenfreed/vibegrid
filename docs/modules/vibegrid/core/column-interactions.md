---
domain: vibegrid
status: active
relatedRules:
  - vibegrid
  - vibegrid-interactions
---
# Column Interactions

Column resize, reorder, and context menu behaviors for grid column management.

## Overview

- **Domain:** vibegrid
- **Status:** active
- **Related Issues:** GH#187

## Behaviors

### Column Resize

### B1: Drag column edge to resize
- **ID:** column-resize
- **Trigger:** User clicks and drags the right edge of a column header
- **Expected:** A resize indicator line appears showing the new column width. Column width updates on mouse release. Adjacent columns are not affected (resize is independent).
- **Verify:** Resize indicator visible during drag, column width changes on release, header and body cells align at new width
- **Source:** `overlays/ColumnResizeOverlayDOM.ts`, `stores/VisualStateStore.ts`

### B2: Double-click column edge auto-sizes
- **ID:** column-autosize
- **Status:** [ ] Planned
- **Trigger:** User double-clicks the right edge of a column header
- **Expected:** Column auto-resizes to fit the widest content in that column
- **Verify:** Column width adjusts to content, no horizontal overflow in cells

### Column Reorder

### B3: Drag column header to reorder
- **ID:** column-reorder
- **Trigger:** User clicks and drags a column header horizontally
- **Expected:** A preview of the column follows the cursor. A drop indicator shows where the column will be placed. On release, column moves to the new position. Confirmation dialog may appear.
- **Verify:** Drag preview visible at cursor, drop indicator shows target position, column order changes on drop
- **Source:** `overlays/ColumnDragOverlayDOM.ts`, `stores/VisualStateStore.ts`

### Context Menu

### B4: Right-click cell opens context menu
- **ID:** cell-context-menu
- **Trigger:** User right-clicks on a grid cell
- **Expected:** Context menu appears at cursor position with relevant actions: Copy, Paste, Cut, Insert Row, Delete Row. Menu is viewport-aware (repositions if near edge).
- **Verify:** Menu appears at click position, contains expected actions, clicking an action performs it
- **Source:** `components/ContextMenu.tsx`

### B5: Right-click column header opens column menu
- **ID:** header-context-menu
- **Trigger:** User right-clicks on a column header
- **Expected:** Column-specific menu appears with: Sort Ascending, Sort Descending, Hide Column, Group By, Filter options.
- **Verify:** Menu appears with column actions, actions modify grid state
- **Source:** `components/ContextMenu.tsx`

### Row Drag

### B6: Drag handle reorders rows
- **ID:** row-drag-reorder
- **Trigger:** User clicks and drags the 6-dot drag handle at the start of a row
- **Expected:** Row drag preview follows cursor. Drop indicator shows target position between rows. On release, row moves to new position. Group-aware — dragging into a different group changes the row's group membership.
- **Verify:** Drag preview visible, drop indicator shows between rows, row moves on release
- **Source:** `renderers/modules/DragDropHandlers.ts`, `overlays/DragPreviewOverlayDOM.ts`

### Bulk Actions

### B7: Selected rows show action bar
- **ID:** bulk-actions-bar
- **Trigger:** User selects one or more rows via checkboxes
- **Expected:** A floating action bar appears at the bottom of the grid showing: selection count, available bulk actions (Delete, Export CSV), and a dismiss button.
- **Verify:** Action bar visible with selection count, bulk actions available, executing action affects all selected rows
- **Source:** `components/ActionsBar.tsx`, `components/FloatingActionsMenu.tsx`

### B8: Bulk delete removes selected rows
- **ID:** bulk-delete
- **Trigger:** User clicks Delete in the action bar with rows selected
- **Expected:** Confirmation dialog appears. On confirm, all selected rows are deleted via API. Grid refreshes to reflect deletions. Selection is cleared.
- **Verify:** Confirmation shown, rows removed after confirm, selection cleared
- **Source:** `components/ActionsBar.tsx`

## Notes

- Column resize uses DOM-based overlay (not React) for smooth 60fps performance
- Column reorder preview renders the dragged column content as a semi-transparent clone
- Context menus use React portals for proper z-index stacking
- Row drag handles use the `drag-handle` system column type
- Bulk actions preserve selection state for export (don't clear after export, do clear after delete)
