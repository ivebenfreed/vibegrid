# VibeGrid UX Specification

> Comprehensive interaction patterns for the VibeGrid data grid system.
> **Last Updated:** 2024-12-14

---

## Table of Contents

1. [Selection System](#1-selection-system)
2. [Editing System](#2-editing-system)
3. [Keyboard Navigation](#3-keyboard-navigation)
4. [Mouse Interactions](#4-mouse-interactions)
5. [Column Operations](#5-column-operations)
6. [Fill Handle](#6-fill-handle)
7. [Grouping](#7-grouping)
8. [Context Menus](#8-context-menus)
9. [Clipboard Operations](#9-clipboard-operations)
10. [DOM Structure Reference](#10-dom-structure-reference)
11. [Testing Patterns](#11-testing-patterns)

---

## 1. Selection System

### Cell Selection

| Action | Behavior |
|--------|----------|
| Single Click (padding) | Select cell, clear previous selection |
| Ctrl/Cmd+Click | Toggle cell in multi-selection |
| Shift+Click | Range select from anchor to target |
| Click outside grid | Clear all selections |

**State:** `InteractionStore.selectedCells: Set<string>` (format: `"rowId:columnId"`)

### Row Selection

| Action | Behavior |
|--------|----------|
| Row checkbox click | Select entire row |
| Ctrl/Cmd+Click checkbox | Toggle row in multi-selection |
| Shift+Click checkbox | Range select rows |

**50ms debounce** prevents cell click immediately after row selection.

### Select All

- **Trigger:** Ctrl/Cmd+A
- **Behavior:** Selects all visible cells (respects column visibility)

---

## 2. Editing System

### Edit Triggers

| Trigger | Condition |
|---------|-----------|
| Double-click | `editTrigger='double-click'` in field policy |
| Enter/F2 key | Cell focused, field is editable |
| Click on content | `affordance="edit"` on element |
| Click edit icon | `data-edit-trigger="true"` on element |

### Edit Lifecycle

```
startEdit() → updatePendingValue() → commitEdit() or cancelEdit()
```

**Commit Triggers:**
- Enter key (reason: 'enter')
- Tab key (reason: 'tab')
- Click outside (reason: 'outside-click')
- Blur (reason: 'blur')

**Cancel Triggers:**
- Escape key (reason: 'escape')
- Blur with `blurPolicy='cancel'`

### Blur Policies by Field Type

| Field Type | Policy | Behavior on Blur |
|------------|--------|------------------|
| Text, Number, Email, URL, Phone | `commit` | Save changes |
| Boolean (toggles) | `cancel` | Discard changes |
| Select, Date (dropdowns) | `keep-open` | Keep editor open |

### Key Insight

**Selection vs Editing:**
- Click on **cell padding** (edges) → Selection only
- Click on **cell content** → Enters edit mode (if `affordance="edit"`)

---

## 3. Keyboard Navigation

### Arrow Keys

| Key | Not Editing | Editing |
|-----|-------------|---------|
| Up | Move focus up | N/A |
| Down | Move focus down | N/A |
| Left | Move focus left | Cursor left |
| Right | Move focus right | Cursor right |

### Special Keys

| Key | Not Editing | Editing |
|-----|-------------|---------|
| Enter | Start edit | Commit, move down |
| Tab | Move focus right | Commit, move right |
| Escape | Clear selection | Cancel edit |
| F2 | Start edit | N/A |

### Modifiers

| Shortcut | Action |
|----------|--------|
| Ctrl/Cmd+A | Select all |
| Ctrl/Cmd+C | Copy |
| Ctrl/Cmd+X | Cut |
| Ctrl/Cmd+V | Paste |
| Ctrl/Cmd+Z | Undo (placeholder) |
| Ctrl/Cmd+Y | Redo (placeholder) |

---

## 4. Mouse Interactions

### Click Types

| Action | Result |
|--------|--------|
| Single click | Select cell OR trigger action (depends on affordance) |
| Double click | Start edit (if double-click trigger) |
| Right click | Open context menu |

### Affordance System

Elements within cells declare their click behavior:

```html
<div data-affordance="edit">Edit Icon</div>     <!-- Triggers edit -->
<div data-affordance="navigate">Link Text</div> <!-- Triggers navigation -->
<div data-affordance="toggle">Checkbox</div>    <!-- Triggers toggle -->
<div data-affordance="none">Static Text</div>   <!-- Selection only -->
```

### Action Routing Priority

1. Check column editability
2. Check `data-affordance` attribute
3. Check `data-edit-trigger` (legacy)
4. Check field interaction policy
5. Default: selection only

### Hover State

- `InteractionStore.hoveredCell` tracks current hover
- Used for visual feedback and tooltips

---

## 5. Column Operations

### Sorting

| Action | Result |
|--------|--------|
| Header click | Toggle sort (asc → desc → none) |
| Shift+Header click | Add secondary sort |

**State:** `VisualStateStore.sortBy: SortConfig[]`

### Resizing

| Action | Result |
|--------|--------|
| Drag header edge | Resize column |
| Double-click edge | Auto-fit width |

**Minimum width:** 50px
**Cursor:** `col-resize` during drag

### Reordering

| Action | Result |
|--------|--------|
| Drag header | Move column position |
| Drop | Insert at new position |

**Visual feedback:** Blue insertion line (3px)

### Visibility

- Toggle via column menu
- **State:** `VisualStateStore.columnVisibility: Record<string, boolean>`

---

## 6. Fill Handle

### Display

- Appears at **bottom-right corner** of selection
- Size: 10x10px
- Cursor: `crosshair`
- Hover scale: 1 → 1.2

### Drag-to-Fill Flow

1. **Mouse down** on fill handle
2. **Drag** vertically or horizontally
3. **Preview** shows target cells with dashed border
4. **Mouse up** commits fill operation

### Fill Direction

| Drag | Behavior |
|------|----------|
| Down | Fill values to rows below |
| Right | Fill values to columns right |
| Up/Left | Not supported |

### Constraints

- Only works on **editable columns**
- Respects group boundaries
- Each row ~39px height

---

## 7. Grouping

### Group Structure

| Row Type | Height | Description |
|----------|--------|-------------|
| Group header | 44px | Collapsible group label |
| Data row | 40px | Regular data |
| Summary row | 36px | Aggregations |

### Expand/Collapse

| Action | Result |
|--------|--------|
| Click arrow | Toggle group |
| Click header | Toggle group |

**State:** `VisualStateStore.expandedGroups: Set<string>`

### Aggregations

| Type | Description |
|------|-------------|
| count | Number of items |
| sum | Sum of numeric field |
| average | Average of numeric field |
| concat | Concatenate with separator |

### Drag Between Groups

- Drag row to different group header
- Updates `parentGroupId`
- Counts update automatically

---

## 8. Context Menus

### Right-Click Menu

| Context | Available Actions |
|---------|-------------------|
| Cell | Copy, Cut, Paste, Insert Row, Delete Row |
| Row | Copy, Paste, Insert Row, Delete Row |
| Header | Insert Column, Delete Column, Sort, Hide |

### Close Triggers

- Click outside menu
- Press Escape
- Select menu item

---

## 9. Clipboard Operations

### Copy (Ctrl/Cmd+C)

1. Extract selected cells as 2D array
2. Store rich metadata (column types, IDs)
3. Copy to system clipboard
4. Visual: Dashed border on copied range

### Paste (Ctrl/Cmd+V)

**Single-cell to multi-cell:** Broadcasts value to all selected cells

**Multi-cell to multi-cell:** Requires matching column origin

**Type compatibility:**
- Text → Any type
- Number → Text, Currency, Slider
- Select → Select (value matching)
- Date → Date, Text

### Cut (Ctrl/Cmd+X)

Same as copy, marks for deletion after paste.

---

## 10. DOM Structure Reference

### CSS Classes

```css
/* Selection */
.vibegridx-selected           /* Selected cell */
.vibegridx-row-selected       /* Selected row */

/* Editing */
.vibegridx-editing            /* Actively editing cell */
.editing-overlay              /* Editor container */

/* Interaction States */
.vibegridx-focused            /* Cell with keyboard focus */
.vibegridx-hovered            /* Hovered cell */

/* Structure */
.vibegridx-container          /* Grid container */
.vibegridx-table              /* Table element */
.vibegridx-viewport           /* Scrollable viewport */
.vibegridx-body               /* Row container */
.vibegridx-row                /* Data row */
.vibegridx-cell               /* Data cell */
.vibegridx-header-cell        /* Column header */

/* Fill Handle */
.vibegridx-fill-handle-container
.vibegridx-fill-preview-container

/* Grouping */
.vibegridx-group-header
.vibegridx-group-collapsed
.vibegridx-summary-row
```

### Data Attributes

```html
<!-- Cell identification -->
<div data-row-id="row123" data-column-id="col456">
<div data-testid="cell-{rowId}-{columnId}">

<!-- Affordances -->
<div data-affordance="edit|navigate|toggle|none">

<!-- Row types -->
<div data-row-type="data|group|summary">

<!-- Grouping -->
<div data-group-id="group_status_active">
<div data-group-level="0|1|2">
```

### Cell Index Mapping (WorkTask entity)

| Index | nth-child | Column |
|-------|-----------|--------|
| 0-1 | 1-2 | Hidden/spacer |
| 2 | 3 | Id |
| 3 | 4 | Status |
| 4 | 5 | Title (editable) |
| 5 | 6 | Billable |
| 6+ | 7+ | Other columns |

**Note:** Use `nth-child(N+1)` for 0-indexed column N.

### Z-Index Layers

| Z-Index | Layer |
|---------|-------|
| 100 | Selection overlay |
| 101 | Editing overlay |
| 102 | Fill preview |
| 103 | Fill handle |
| 9999+ | Context menus, modals |

---

## 11. Testing Patterns

### Chrome DevTools Skill

Run from: `.claude/skills/chrome-devtools/scripts/`

```bash
# Navigate to grid
node run.js 'goto http://localhost:4000/entities/WorkTask | wait 1000'

# Get cell coordinates
node evaluate.js --script 'JSON.stringify(document.querySelector(".vibegridx-row .vibegridx-cell:nth-child(5)").getBoundingClientRect())'

# Click cell (triggers edit if content clicked)
node evaluate.js --script 'document.querySelector(".vibegridx-row .vibegridx-cell:nth-child(5)").click()'

# Select cell (mousedown/mouseup on padding - for selection, not edit)
node evaluate.js --script '
const cell = document.querySelector(".vibegridx-row .vibegridx-cell:nth-child(5)");
const rect = cell.getBoundingClientRect();
cell.dispatchEvent(new MouseEvent("mousedown", {bubbles: true, clientX: rect.x + 2, clientY: rect.y + 2}));
cell.dispatchEvent(new MouseEvent("mouseup", {bubbles: true, clientX: rect.x + 2, clientY: rect.y + 2}));
'

# Screenshot
node run.js 'screenshot /tmp/grid.png'
```

### Fill Handle Test

```bash
# Use the dedicated test script
node test-fill.js
```

### Playwright Testing

```javascript
// Target specific cell
await page.click('[data-testid="cell-abc123-title"]')

// Target by field type
await page.locator('[data-field-type="text"]').first().click()

// Combine selectors
await page.click('[data-row-id="abc123"][data-column-id="title"]')
```

---

## Key Files

| Feature | File |
|---------|------|
| Selection | `stores/InteractionStore.ts` |
| Editing | `stores/EditingStore.ts` |
| Action Routing | `routing/CellActionRouter.ts` |
| Clipboard | `managers/ClipboardManager.ts` |
| Fill Handle | `overlays/FillHandleLayerDOM.ts` |
| Column Resize | `overlays/ColumnResizeOverlayDOM.ts` |
| Visual State | `stores/VisualStateStore.ts` |
| Table Core | `stores/TableCoreStore.ts` |

---

## Interaction Flow

```
User Action
    ↓
Event Handler (MouseController / KeyboardController)
    ↓
InteractionCoordinator (normalize event → context)
    ↓
SelectionService (update selection if click)
    ↓
CellActionRouter (determine: edit / navigate / custom / none)
    ↓
EditingStore (start edit) OR onCellClick (navigate) OR Field handler
    ↓
Visual Update (overlays render via version tracking)
```
