---
initiative: vibegrid-cell-display-fixes
type: improvement
status: draft
priority: high
roadmap: mvp
owner: platform-engineering
github_issue: null
github_milestone: null
updated: 2025-12-13
---

# Vibegrid Cell Display Fixes

**Type**: Improvement (QA/Bug fixes)
**Status**: Draft
**Timeline**: 1-2 days
**Effort**: 1 engineer
**Risk**: Low - Display fixes only, no data changes

---

## Executive Summary

### The Problem

Recent changes to Vibegrid have introduced display regressions across various field types:

- Cell values not rendering correctly for certain field types
- Option fields not resolving labels properly (showing IDs instead of labels)
- Relationship fields not displaying linked entity names
- Inconsistent display between inline editing and read-only modes
- Potential issues with computed/rollup fields display

**Impact**: Poor user experience, confusion about data values, potential data entry errors.

### The Solution

Systematic audit and fix of all Vibegrid cell renderers:

1. **Audit all field types** - Test each renderer against real data
2. **Fix option resolution** - Ensure select/multi-select show labels not IDs
3. **Fix relationship display** - Ensure entity references show display names
4. **Verify computed fields** - Rollups, formulas display correctly
5. **Test edit mode consistency** - Inline editing shows same as read-only

### Success Criteria

- [ ] All field types render correctly in read-only mode
- [ ] All field types render correctly in edit mode
- [ ] Option fields show labels (not option IDs)
- [ ] Relationship fields show entity display names
- [ ] Computed/rollup fields display calculated values
- [ ] No console errors during rendering
- [ ] Works with virtual scrolling (no display glitches on scroll)

---

## Field Types to Test (41 total)

### Basic Types (17)
| Field Type | Status | Notes |
|------------|--------|-------|
| `text` | [ ] | |
| `textarea` | [ ] | |
| `rich-text` | [ ] | |
| `richtext` | [ ] | deprecated alias |
| `longtext` | [ ] | deprecated alias |
| `markdown` | [ ] | |
| `number` | [ ] | |
| `integer` | [ ] | |
| `decimal` | [ ] | |
| `percentage` | [ ] | |
| `boolean` | [ ] | |
| `date` | [ ] | |
| `datetime` | [ ] | deprecated alias |
| `datetime-local` | [ ] | |
| `time` | [ ] | |
| `json` | [ ] | |
| `binary` | [ ] | |

### Advanced Types (9)
| Field Type | Status | Notes |
|------------|--------|-------|
| `email` | [ ] | |
| `url` | [ ] | |
| `phone` | [ ] | |
| `color` | [ ] | |
| `file` | [ ] | |
| `image` | [ ] | |
| `currency` | [ ] | |
| `address` | [ ] | |
| `coordinates` | [ ] | |

### Interaction Types (2)
| Field Type | Status | Notes |
|------------|--------|-------|
| `rating` | [ ] | |
| `slider` | [ ] | |

### Selection Types (2)
| Field Type | Status | Notes |
|------------|--------|-------|
| `single-select` | [ ] | option resolution |
| `multi-select` | [ ] | option resolution |

### Option-Backed Types (3)
| Field Type | Status | Notes |
|------------|--------|-------|
| `status_set` | [ ] | status definition resolution |
| `priority` | [ ] | option set resolution |
| `custom_option_reference` | [ ] | option resolution |

### Relationship Types (2)
| Field Type | Status | Notes |
|------------|--------|-------|
| `custom_user_reference` | [ ] | user display name |
| `custom_entity_reference` | [ ] | entity display name |

### Computed Types (2)
| Field Type | Status | Notes |
|------------|--------|-------|
| `computed_expression` | [ ] | |
| `computed_formula` | [ ] | |

### Rollup Types (4)
| Field Type | Status | Notes |
|------------|--------|-------|
| `rollup_count` | [ ] | |
| `rollup_sum` | [ ] | |
| `rollup_average` | [ ] | |
| `rollup_concat` | [ ] | |

---

## Documentation

**1. DESIGN.md** - Testing approach and fix patterns

**2. IMPLEMENTATION.md** - Fix checklist by field type

**3. AGENT_NOTES.md** - Discoveries and specific bugs found

---

## Related Work

- [Vibegrid Domain](../../01-domains/vibegrid.md)
- [Vibegrid Cell Interaction](../01-complete/vibegrid-cell-interaction/)
- [Vibegrid QoL](../01-complete/vibegrid-qol/)

---

## Key Files

Cell renderers: `apps/web/src/systems/vibegrid/renderers/cell-renderers/`
- `text.ts`, `number.ts`, `date.ts`, `boolean.ts`
- `enum.ts` - select/multi-select
- `relationship/` - entity references
- `computed.ts`, `rollup.ts`

---

**Template Version**: 2.0
