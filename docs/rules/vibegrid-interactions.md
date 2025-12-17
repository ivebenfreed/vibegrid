---
paths: apps/web/src/systems/vibegrid/**/*
alwaysApply: false
---

# VibeGrid UI Interaction Patterns

Essential interaction patterns for browser automation with VibeGrid.

**Full spec**: `apps/web/src/systems/vibegrid/UX_SPEC.md`

## Cell Click Behavior (Affordance System)

Elements within cells declare their click behavior via `data-affordance`:

| Affordance | Click Result | Example |
|------------|--------------|---------|
| `edit` | Enter edit mode | Pencil icon, editable text |
| `navigate` | Navigate to detail/link | Title/Name link text |
| `toggle` | Toggle value | Checkbox, boolean switch |
| `none` | Selection only | Static text, labels |

**Key insight**: Click on **cell padding** (edges) = selection. Click on **cell content** = triggers affordance action.

## Title/Name Column Special Behavior

Title columns typically have **two click targets**:
1. **Link text** (`affordance="navigate"`) → Opens detail view
2. **Pencil icon** (`data-edit-trigger="true"`) → Inline edit

To edit title inline: click the pencil icon, NOT the text.

**Automation pattern** (pencil only appears on hover):
```bash
node run.js "hover text:Testing1 | wait 500 | click .vibegridx-entity-name-edit-icon | wait 500"
```

## Selection Patterns

| Action | Result |
|--------|--------|
| Click cell padding | Select cell |
| Ctrl/Cmd+Click | Multi-select (toggle) |
| Shift+Click | Range select |
| Click-drag across cells | Range select |
| Row checkbox | Select entire row |
| Ctrl/Cmd+A | Select all visible |

**For automation**: Use `mousedown`/`mouseup` at cell edge coordinates to select without triggering edit.

## Editing Triggers

| Trigger | When it works |
|---------|---------------|
| Click content with `affordance="edit"` | Always |
| Click pencil icon | Always |
| Double-click | Only if `editTrigger='double-click'` in field policy |
| Enter/F2 key | When cell is focused |

**Commit edit**: Enter, Tab, click outside
**Cancel edit**: Escape

## Column Operations

| Action | How to trigger |
|--------|----------------|
| Sort | Click column header |
| Multi-sort | Shift+click header |
| Resize | Drag header edge |
| Auto-fit | Double-click header edge |
| Reorder | Drag header to new position |
| Hide/show | Column menu |

## Fill Handle (Drag-to-Fill)

1. Select a cell (appears at bottom-right corner)
2. Drag handle down or right
3. Release to fill values

**Constraints**: Only editable columns, respects group boundaries, ~39px per row.

## Grouping

| Action | Result |
|--------|--------|
| Click group arrow/header | Expand/collapse |
| Drag row to group header | Move to group |

**Row heights**: Group header 44px, data row 40px, summary 36px.

## Context Menu

Right-click on:
- **Cell**: Copy, Cut, Paste, Insert Row, Delete Row
- **Header**: Insert Column, Delete Column, Sort, Hide

**Automation pattern**:
```bash
node run.js "rightclick text:234 | wait 500"  # Opens context menu
```

## Keyboard Shortcuts

| Key | Not Editing | Editing |
|-----|-------------|---------|
| Arrow keys | Move focus | Cursor movement |
| Enter | Start edit | Commit, move down |
| Tab | Move right | Commit, move right |
| Escape | Clear selection | Cancel edit |
| F2 | Start edit | - |
| Ctrl+C/X/V | Copy/Cut/Paste | - |

## DOM Structure

```css
.vibegridx-container     /* Grid wrapper */
.vibegridx-row           /* Data row */
.vibegridx-cell          /* Cell */
.vibegridx-header-cell   /* Column header */
.vibegridx-selected      /* Selected cell */
.vibegridx-editing       /* Cell in edit mode */
.vibegridx-group-header  /* Group header row */
.vibegridx-fill-handle-container  /* Fill handle */
```

## Hidden Columns (Entity grids)

| nth-child | Column |
|-----------|--------|
| 1-2 | Hidden/spacer |
| 3 | Id |
| 4 | Status |
| 5 | Title |
| 6+ | Other fields |

**Use**: `.vibegridx-cell:nth-child(5)` for Title column.
