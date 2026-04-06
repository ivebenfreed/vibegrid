---
initiative: vibegrid-cell-interaction
type: improvement
status: in-progress
owner: platform-engineering
assignee: ben@getelevra.com
updated: 2025-12-05
---

# Vibegrid Cell Interaction: Affordance Group System

**Status**: Draft
**Timeline**: 3-5 days
**Replaces**: Current scattered cursor/interaction system

updated: 2025-12-05
---

## Executive Summary

Replace the scattered cursor and interaction logic across 10+ files with a **declarative Affordance Group system** where:

1. **Affordance Groups** define reusable interaction patterns (cursor, hover, actions)
2. **Field Types** declare which group they use + overrides
3. **CSS handles all visual states** via data attributes
4. **Editability automatically modifies** affordances based on declared rules

updated: 2025-12-05
---

## Current Architecture (Problem)

### Cursor Logic is Scattered Across 10+ Files

```
┌─────────────────────────────────────────────────────────────────────────┐
│ CURRENT: Cursor determined by multiple independent systems              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│ 1. Inline styles in renderers:                                          │
│    SelectFieldType.ts:144    → cursor: pointer (inline)                 │
│    EntityNameFieldType.ts:58 → cursor: pointer (inline)                 │
│    EntityNameFieldType.ts:89 → cursor: pointer (inline)                 │
│    CellFactory.ts:156        → cursor: default (inline)                 │
│                                                                         │
│ 2. CSS classes in renderers:                                            │
│    TextFieldType.ts          → vibegridx-text-editable                  │
│    DateFieldType.ts          → vibegridx-badge-editable                 │
│    SelectFieldType.ts        → vibegridx-badge-dropdown                 │
│                                                                         │
│ 3. CSS rules in stylesheets:                                            │
│    vibegridx-cells.css       → .vibegridx-text-editable { cursor: pointer }│
│    vibegridx.css             → .vibegridx-header-cell { cursor: grab }  │
│    vibegridx.css             → body.dragging * { cursor: grabbing }     │
│                                                                         │
│ 4. Data attributes for actions:                                         │
│    data-action="navigate"    → EntityName text                          │
│    data-action="edit"        → Select badge                             │
│    data-edit-trigger="true"  → EntityName pencil icon                   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Key Problems

1. **No formal model**: Each renderer independently decides cursor logic
2. **Mixed implementation**: Inline styles, CSS classes, and data attributes
3. **Editability is one input of many**: Not the whole cursor story
4. **Multi-affordance cells unsupported**: EntityName has navigate + edit, both need cursors
5. **Non-editable cells still show editable cursors**: CSS doesn't know about `column.editable`

updated: 2025-12-05
---

## Proposed Architecture: Affordance Group System

### Core Concept

**Affordance** = A visual/interactive capability of a UI element (cursor, hover effect, click action)

**Affordance Group** = A reusable pattern of affordances that can be applied to cells

```
┌─────────────────────────────────────────────────────────────────────────┐
│ AFFORDANCE GROUP SYSTEM                                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│ FieldType                                                               │
│    ↓ declares                                                           │
│ AffordanceGroup + whenNotEditable override                              │
│    ↓ resolved at render                                                 │
│ data-affordance-group="..." data-affordance="..." on elements           │
│    ↓ CSS reads                                                          │
│ All cursor, hover, visual states from CSS only                          │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Affordance Groups Definition

```typescript
// src/systems/vibegrid/affordances/AffordanceGroups.ts

export interface AffordanceElement {
  role: 'content' | 'icon' | 'badge' | 'control' | 'link'
  affordance: 'navigate' | 'edit' | 'toggle' | 'open-menu' | 'none'
  cursor: 'default' | 'pointer' | 'text' | 'grab' | 'help'
  hoverEffect?: 'underline' | 'scale' | 'background' | 'brightness' | 'none'
}

export interface AffordanceGroup {
  name: string
  description: string
  elements: AffordanceElement[]
  container: {
    affordance: 'select'  // Container always has select affordance (for range selection)
    cursor: 'default'
  }
}

export const AFFORDANCE_GROUPS: Record<string, AffordanceGroup> = {
  // EntityName pattern: clickable link + edit icon on hover
  'link-with-edit-icon': {
    name: 'link-with-edit-icon',
    description: 'Clickable text that navigates, with edit icon on hover',
    elements: [
      { role: 'link', affordance: 'navigate', cursor: 'pointer', hoverEffect: 'underline' },
      { role: 'icon', affordance: 'edit', cursor: 'pointer', hoverEffect: 'none' },
    ],
    container: { affordance: 'select', cursor: 'default' },
  },

  // Select/Date pattern: badge that opens dropdown
  'editable-badge': {
    name: 'editable-badge',
    description: 'Badge that opens dropdown/picker on click',
    elements: [
      { role: 'badge', affordance: 'edit', cursor: 'pointer', hoverEffect: 'scale' },
    ],
    container: { affordance: 'select', cursor: 'default' },
  },

  // Text pattern: content area is directly editable
  'editable-content': {
    name: 'editable-content',
    description: 'Content area that starts inline edit on click',
    elements: [
      { role: 'content', affordance: 'edit', cursor: 'text', hoverEffect: 'background' },
    ],
    container: { affordance: 'select', cursor: 'default' },
  },

  // Boolean pattern: toggle control
  'toggle-control': {
    name: 'toggle-control',
    description: 'Checkbox or toggle that changes value on click',
    elements: [
      { role: 'control', affordance: 'toggle', cursor: 'pointer', hoverEffect: 'none' },
    ],
    container: { affordance: 'select', cursor: 'default' },
  },

  // Read-only pattern: no interaction
  'readonly-display': {
    name: 'readonly-display',
    description: 'Display only, no interactive elements',
    elements: [
      { role: 'content', affordance: 'none', cursor: 'default', hoverEffect: 'none' },
    ],
    container: { affordance: 'select', cursor: 'default' },
  },

  // Link-only pattern: navigates but not editable (for non-editable EntityName)
  'link-only': {
    name: 'link-only',
    description: 'Clickable text that navigates, no edit capability',
    elements: [
      { role: 'link', affordance: 'navigate', cursor: 'pointer', hoverEffect: 'underline' },
    ],
    container: { affordance: 'select', cursor: 'default' },
  },

  // Read-only badge: displays badge but no interaction
  'readonly-badge': {
    name: 'readonly-badge',
    description: 'Badge display without dropdown interaction',
    elements: [
      { role: 'badge', affordance: 'none', cursor: 'default', hoverEffect: 'brightness' },
    ],
    container: { affordance: 'select', cursor: 'default' },
  },
}
```

### Field Type Affordance Declaration

```typescript
// Added to VibeGridFieldType interface in FieldTypeRegistry.ts

export interface FieldTypeAffordance {
  /** Default affordance group when editable */
  group: string

  /**
   * What to use when column.editable === false
   * - string: Use different group entirely
   * - { remove: string[] }: Remove specific affordances from current group
   * - { override: AffordanceElement[] }: Override specific elements
   */
  whenNotEditable: string | { remove: string[] } | { override: AffordanceElement[] }
}

// Example field type declarations:

const TextFieldType: VibeGridFieldType = {
  type: 'text',
  // ... existing properties ...

  affordance: {
    group: 'editable-content',
    whenNotEditable: 'readonly-display',
  },
}

const EntityNameFieldType: VibeGridFieldType = {
  type: 'entity-name',
  // ... existing properties ...

  affordance: {
    group: 'link-with-edit-icon',
    whenNotEditable: 'link-only',  // Keep navigation, remove edit icon
  },
}

const SelectFieldType: VibeGridFieldType = {
  type: 'select',
  // ... existing properties ...

  affordance: {
    group: 'editable-badge',
    whenNotEditable: 'readonly-badge',
  },
}

const BooleanFieldType: VibeGridFieldType = {
  type: 'boolean',
  // ... existing properties ...

  affordance: {
    group: 'toggle-control',
    whenNotEditable: 'readonly-display',
  },
}
```

### Affordance Resolution

```typescript
// src/systems/vibegrid/affordances/AffordanceResolver.ts

export class AffordanceResolver {
  /**
   * Resolve which affordance group to use for a cell
   */
  resolve(
    fieldType: VibeGridFieldType,
    column: Column,
  ): ResolvedAffordance {
    const isEditable = column.editable !== false
    const declaration = fieldType.affordance

    if (!declaration) {
      // Fallback for field types without affordance declaration
      return this.getDefaultAffordance(isEditable)
    }

    if (isEditable) {
      return {
        groupName: declaration.group,
        group: AFFORDANCE_GROUPS[declaration.group],
      }
    }

    // Handle whenNotEditable
    const override = declaration.whenNotEditable

    if (typeof override === 'string') {
      // Use different group
      return {
        groupName: override,
        group: AFFORDANCE_GROUPS[override],
      }
    }

    if ('remove' in override) {
      // Remove specific affordances
      const baseGroup = AFFORDANCE_GROUPS[declaration.group]
      return {
        groupName: declaration.group,
        group: this.removeAffordances(baseGroup, override.remove),
      }
    }

    if ('override' in override) {
      // Override specific elements
      const baseGroup = AFFORDANCE_GROUPS[declaration.group]
      return {
        groupName: declaration.group,
        group: this.overrideElements(baseGroup, override.override),
      }
    }

    return this.getDefaultAffordance(false)
  }

  /**
   * Get data attributes to apply to cell elements
   */
  getDataAttributes(resolved: ResolvedAffordance): CellDataAttributes {
    return {
      container: {
        'data-affordance-group': resolved.groupName,
        'data-affordance': 'select',
      },
      elements: resolved.group.elements.map(el => ({
        role: el.role,
        attributes: {
          'data-affordance': el.affordance,
          'data-affordance-role': el.role,
        },
      })),
    }
  }
}
```

### CSS Implementation

```css
/* src/systems/vibegrid/affordances/affordances.css */

/* ====================================
 * AFFORDANCE CURSORS
 * Single source of truth for all cell cursors
 * ==================================== */

/* Base affordance cursors */
[data-affordance="select"] { cursor: default; }
[data-affordance="navigate"] { cursor: pointer; }
[data-affordance="edit"] { cursor: pointer; }
[data-affordance="toggle"] { cursor: pointer; }
[data-affordance="open-menu"] { cursor: pointer; }
[data-affordance="none"] { cursor: default; }

/* Content-type specific cursor override */
[data-affordance-role="content"][data-affordance="edit"] {
  cursor: text;
}

/* ====================================
 * AFFORDANCE HOVER EFFECTS
 * ==================================== */

/* Underline hover (links) */
[data-affordance-group="link-with-edit-icon"] [data-affordance="navigate"]:hover,
[data-affordance-group="link-only"] [data-affordance="navigate"]:hover {
  text-decoration: underline;
}

/* Scale hover (badges) */
[data-affordance-group="editable-badge"] [data-affordance="edit"]:hover {
  transform: scale(1.02);
  filter: brightness(0.95);
}

/* Background hover (editable content) */
[data-affordance-group="editable-content"] [data-affordance="edit"]:hover {
  background-color: hsl(var(--muted) / 0.5);
  border-radius: 4px;
}

/* Subtle brightness hover (readonly badges) */
[data-affordance-group="readonly-badge"] [data-affordance="none"]:hover {
  filter: brightness(0.98);
}

/* Edit icon visibility on container hover */
[data-affordance-group="link-with-edit-icon"] [data-affordance-role="icon"] {
  opacity: 0;
  transition: opacity 0.2s;
}

[data-affordance-group="link-with-edit-icon"]:hover [data-affordance-role="icon"] {
  opacity: 0.6;
}

/* ====================================
 * GLOBAL STATE OVERRIDES
 * These override all affordance cursors
 * ==================================== */

body.vibegridx-dragging-active,
body.vibegridx-dragging-active * {
  cursor: grabbing !important;
}

.vibegridx-resizing,
.vibegridx-resizing * {
  cursor: col-resize !important;
}

/* ====================================
 * DARK MODE
 * ==================================== */

.dark [data-affordance-group="editable-content"] [data-affordance="edit"]:hover {
  background-color: hsl(var(--muted) / 0.3);
}
```

updated: 2025-12-05
---

## Data Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│ RENDER-TIME FLOW                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│ 1. BodyRenderer renders cell                                            │
│    ↓                                                                    │
│ 2. CellFactory.createCell(value, column, rowData, position)             │
│    ↓                                                                    │
│ 3. AffordanceResolver.resolve(fieldType, column)                        │
│    - Checks column.editable                                             │
│    - Returns resolved affordance group                                  │
│    ↓                                                                    │
│ 4. Apply data attributes to container and content elements              │
│    - data-affordance-group="editable-content"                           │
│    - data-affordance="edit" on content                                  │
│    - data-affordance="select" on container                              │
│    ↓                                                                    │
│ 5. CSS handles all visual states                                        │
│    - Cursor based on [data-affordance]                                  │
│    - Hover effects based on [data-affordance-group]                     │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ INTERACTION-TIME FLOW                                                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│ 1. User clicks cell                                                     │
│    ↓                                                                    │
│ 2. MouseController captures event                                       │
│    ↓                                                                    │
│ 3. InteractionCoordinator.handleClick(context)                          │
│    ↓                                                                    │
│ 4. CellActionRouter.route()                                             │
│    - Reads data-affordance from clicked element                         │
│    - Routes to appropriate handler:                                     │
│      - "navigate" → onCellClick callback                                │
│      - "edit" → EditingStore.startEdit()                                │
│      - "toggle" → Toggle value directly                                 │
│      - "select" → SelectionService (padding click)                      │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

updated: 2025-12-05
---

## Files to Create/Modify

### New Files

| File | Purpose |
|------|---------|
| `src/systems/vibegrid/affordances/AffordanceGroups.ts` | Affordance group definitions |
| `src/systems/vibegrid/affordances/AffordanceResolver.ts` | Resolution logic |
| `src/systems/vibegrid/affordances/affordances.css` | All affordance CSS |
| `src/systems/vibegrid/affordances/index.ts` | Exports |

### Modified Files

| File | Change |
|------|--------|
| `FieldTypeRegistry.ts` | Add `FieldTypeAffordance` interface |
| `TextFieldType.ts` | Add `affordance` declaration |
| `SelectFieldType.ts` | Add `affordance` declaration, remove inline cursor |
| `DateFieldType.ts` | Add `affordance` declaration |
| `BooleanFieldType.ts` | Add `affordance` declaration |
| `EntityNameFieldType.ts` | Add `affordance` declaration, remove inline cursor |
| `CellFactory.ts` | Use AffordanceResolver, apply data attributes |
| `BodyRenderer.ts` | Apply container data attributes |
| `CellActionRouter.ts` | Read data-affordance for routing |
| `vibegridx.css` | Import affordances.css, remove scattered cursor rules |
| `vibegridx-cells.css` | Remove scattered cursor/hover rules |

### Removed Code

- Inline `cursor:` styles from all field type renderers
- `vibegridx-text-editable`, `vibegridx-badge-editable` class logic
- Scattered hover effect code in renderers
- `data-action` and `data-edit-trigger` replaced by unified `data-affordance`

updated: 2025-12-05
---

## Benefits

| Metric | Current | After Implementation |
|--------|---------|---------------------|
| Files with cursor logic | 10+ | 1 (affordances.css) |
| Affordance declaration | None (implicit) | Explicit per field type |
| Adding new field type | Copy/paste cursor logic | Declare affordance group |
| Changing cursor behavior | Hunt through files | Edit one CSS file |
| Multi-affordance cells | Ad-hoc | First-class support |
| Non-editable cursor bugs | Ongoing | Eliminated by design |

updated: 2025-12-05
---

## Acceptance Criteria

1. **All cursors from CSS** - No inline cursor styles in renderers
2. **Affordance groups work** - EntityName shows link + icon pattern correctly
3. **Editability modifies affordances** - Non-editable cells use correct fallback group
4. **Platform Users fixed** - createdAt/updatedAt show default cursor
5. **DataForge unchanged** - All existing behavior preserved
6. **Global overrides work** - Drag/resize cursors still override
7. **Single source of truth** - One CSS file for all cursor logic

updated: 2025-12-05
---

## Risk Assessment

### Medium Risk
- Touches all field type renderers
- Changes core interaction data flow
- Must not break existing behavior

### Mitigation
- Implement incrementally (Phase 1 adds system, Phase 2 migrates field types)
- Keep old system working during migration
- Test each field type after migration
- Visual regression testing with Platform Admin and DataForge grids

updated: 2025-12-05
---

## Non-Goals

- **Don't** change action routing logic (CellActionRouter stays)
- **Don't** change how editing works (EditingStore stays)
- **Don't** add new field types (just affordance declarations)
- **Don't** change data model (column.editable stays)

updated: 2025-12-05
---

**Template Version**: 2.0
