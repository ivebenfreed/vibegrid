---
initiative: vibegrid-cell-interaction
type: improvement
status: complete
owner: platform-engineering
assignee: ben@getelevra.com
updated: 2025-12-05
completed: 2025-12-05
---

# Vibegrid Cell Interaction: Affordance Group System

**Type**: Improvement (architectural foundation)
**Status**: Draft
**Timeline**: 3-5 days
**Effort**: 1 engineer
**Risk**: Medium - Touches core grid interaction, but phased and independently testable
**Priority**: BLOCKER - Platform Admin Dashboard cannot ship clean UX without this

updated: 2025-12-05
---

## Executive Summary (2 minute read)

### The Problem

Vibegrid's cell cursor and interaction behavior is **scattered across 10+ files** with no formal model:

**Current Pain Points**:
- Non-editable cells show editable cursors (createdAt, updatedAt, emailVerified)
- Cursor logic is mixed: inline styles in JS, CSS classes, CSS rules
- Each field type renderer independently decides cursor behavior
- Multi-affordance cells (EntityName with navigate + edit) are ad-hoc
- CSS has no knowledge of JavaScript editability state
- Custom schemas (Platform Users) bypass fieldType enrichment

**Root Cause**: No formal model for cell interaction affordances.

### The Solution: Affordance Group System

Replace scattered cursor/interaction logic with a **declarative system**:

```
FieldType declares → AffordanceGroup (reusable pattern)
                   → CSS handles ALL visual states
                   → JS reads data attributes for routing
```

**Affordance Groups** (reusable patterns):
- `link-with-edit-icon` - EntityName: text navigates, icon edits
- `editable-badge` - Select/Date: badge opens dropdown
- `editable-content` - Text: content area is editable
- `toggle-control` - Boolean: click toggles value
- `readonly-display` - Non-editable: no interaction

**Key Principles**:
1. Field types **declare** affordance group, don't implement cursors
2. CSS is **single source of truth** for all cursor/hover visuals
3. `data-affordance` attributes bridge JS state to CSS
4. Editability **modifies** affordance groups (not separate system)

### ROI & Benefits

| Metric | Current | After Implementation |
|--------|---------|---------------------|
| Files with cursor logic | 10+ | 1 (affordances.css) |
| Affordance model | None (implicit) | Explicit declaration |
| Adding new field type | Copy/paste cursor logic | Declare affordance group |
| Multi-affordance cells | Ad-hoc | First-class support |
| Non-editable cursor bugs | Ongoing | Eliminated by design |

### Investment

- **Timeline**: 3-5 days (phased)
- **Effort**: 1 engineer
- **Risk**: Medium - Each phase independently testable and mergeable
- **Costs**: None - Internal refactor

### Success Criteria

1. All cursors controlled from single CSS file
2. Field types have explicit affordance declarations
3. Non-editable cells use `readonly-display` group automatically
4. Platform User grid shows correct cursors on all columns
5. DataForge entities continue working unchanged
6. Multi-affordance cells (EntityName) work correctly

updated: 2025-12-05
---

## Documentation

### Active Documents (READ THESE)

**1. DESIGN.md** (~500 lines)
- Current architecture analysis (scattered cursor logic)
- Affordance Group definitions
- Field type declaration pattern
- AffordanceResolver implementation
- CSS structure for affordances
- Data flow diagrams

**2. IMPLEMENTATION.md** (~700 lines)
- **Phase 1**: Build affordance system (additive, no behavior change)
- **Phase 2**: Migrate field types one by one
- **Phase 3**: Update CellActionRouter to read data-affordance
- **Phase 4**: Remove old CSS classes and inline styles
- Testing checklists per phase
- Rollback procedures

**3. AGENT_NOTES.md** (Living doc)
- 7 implementation discoveries
- 4 gotchas and edge cases
- 2 architecture decisions (ADRs)
- Common errors and solutions
- Session log (2 sessions)

updated: 2025-12-05
---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│ AFFORDANCE GROUP SYSTEM                                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│ FieldType                                                               │
│    ↓ declares                                                           │
│ affordance: { group: 'editable-content', whenNotEditable: 'readonly' }  │
│    ↓ resolved by AffordanceResolver                                     │
│ data-affordance-group="..." data-affordance="..." on elements           │
│    ↓ CSS reads                                                          │
│ All cursor, hover, visual states from affordances.css only              │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

updated: 2025-12-05
---

## Decision Log

### Why Affordance Groups Over Simple data-editable?

**Chose**: Declarative affordance group system
**Over**: Simple `data-editable="true|false"` attribute
**Reason**: Cursor is multi-dimensional (element role, field type, editability, global state). Simple boolean is insufficient for multi-affordance cells like EntityName which has both navigate and edit affordances.

### Why Data Attributes Over CSS Classes?

**Chose**: `data-affordance="edit|navigate|none"` attributes
**Over**: CSS classes (`.cell-editable`, `.cell-readonly`)
**Reason**: Cleaner DOM, semantic meaning, single system for both CSS and JS action routing.

### Why Not Enrich All Columns with FieldType?

**Chose**: Keep custom schemas simple, use registry lookup as fallback
**Over**: Auto-enrich all columns with fieldType
**Reason**: Enrichment overwrites custom formatters and adds editorInstance to non-editable columns.

updated: 2025-12-05
---

## Blocker Status

**Blocks**: `platform-admin-dashboard`

The Platform Admin Dashboard uses Platform User columns with `editable: false` on several columns. Current system:
1. Shows editable cursor on createdAt/updatedAt/emailVerified
2. Has no CSS path to fix (CSS doesn't know editability)
3. Will require ongoing fixes without proper architecture

This initiative establishes the architecture to prevent this class of bugs.

updated: 2025-12-05
---

## Related Work

- [Platform Admin Dashboard](../../03-projects/platform-admin-dashboard/) - Primary consumer
- [Vibegrid System](../../../src/systems/vibegrid/) - Affected system
- [DataForge Field Types](../../../src/systems/vibegrid/field-types/) - Will get affordance declarations

updated: 2025-12-05
---

## Evolution Note

This initiative evolved from a simple "add data-editable attribute" fix (1-2 days, ~10 lines) to a comprehensive Affordance Group system (3-5 days, ~500 lines) after deeper analysis revealed cursor behavior is multi-dimensional and requires a formal model.

See AGENT_NOTES.md Session 2 for the full analysis that led to this expansion.

updated: 2025-12-05
---

**Template Version**: 2.0
