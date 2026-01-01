---
issue: 488
type: feature
title: VibeGrid E2E: Comprehensive Field Type and Advanced Feature Coverage
status: draft
created: 2025-12-31
updated: 2025-12-31
template: frontend-only
---

# VibeGrid E2E: Comprehensive Field Type and Advanced Feature Coverage

> GitHub Issue: [#488](https://github.com/baseplane-ai/baseplane/issues/488)

## Overview

Expand VibeGrid E2E test suite to cover all 23 field types and advanced features. Currently tests use generic text fields. Need dedicated tests for each field type's unique rendering and editing behavior.

**Current State:**
- 13 E2E test suites with ~95 tests
- Tests cover core interactions (selection, editing, drag-drop, Gantt)
- All tests use generic text/status fields
- No field-type-specific coverage

**Goal:**
- Add dedicated tests for 6 high-priority field types
- Add tests for 3 advanced features (fill-handle, paste, virtual scroll)
- Create reusable field type test infrastructure

---

## Phase 1: Infrastructure Setup

### 1.1 Create Comprehensive Mock Schema

**File:** `apps/web/src/app/routes/_authenticated/debug/vibegrid-test/_utils/field-type-schema.ts`

```typescript
export const COMPREHENSIVE_FIELD_TYPE_SCHEMA: EntitySchema = {
  entityName: 'FieldTypeTestEntity',
  archetype: 'task',
  fields: [
    // Text fields
    { name: 'name', type: 'text', label: 'Name' },
    { name: 'description', type: 'markdown', label: 'Description' },
    { name: 'email', type: 'email', label: 'Email' },
    { name: 'phone', type: 'phone', label: 'Phone' },
    { name: 'url', type: 'url', label: 'URL' },

    // Numeric fields
    { name: 'amount', type: 'currency', label: 'Amount' },
    { name: 'quantity', type: 'number', label: 'Quantity' },
    { name: 'rating', type: 'rating', label: 'Rating', validation: { max: 5 } },
    { name: 'progress', type: 'slider', label: 'Progress', validation: { min: 0, max: 100 } },

    // Date/Time
    { name: 'due_date', type: 'date', label: 'Due Date' },
    { name: 'created_at', type: 'datetime', label: 'Created At' },

    // Choice fields
    { name: 'status', type: 'select', label: 'Status', options: [...] },
    { name: 'is_active', type: 'boolean', label: 'Active' },
    { name: 'priority_color', type: 'color', label: 'Priority Color' },

    // File fields
    { name: 'attachment', type: 'file', label: 'Attachment' },
    { name: 'avatar', type: 'image', label: 'Avatar' },
  ],
}
```

### 1.2 Create Field-Type Test Data Generator

**File:** `apps/web/src/app/routes/_authenticated/debug/_mock-data/field-type-generators.ts`

```typescript
export interface FieldTypeTestEntity {
  id: string
  name: string
  description: string | null
  email: string | null
  phone: string | null
  url: string | null
  amount: number | null
  quantity: number | null
  rating: number | null
  progress: number
  due_date: string | null
  created_at: string
  status: string
  is_active: boolean
  priority_color: string | null
  attachment: string | null
  avatar: string | null
}

export function generateFieldTypeTestEntity(index: number): FieldTypeTestEntity
```

### 1.3 Create Field-Type Test Route

**File:** `apps/web/src/app/routes/_authenticated/debug/vibegrid-test/field-types.tsx`

Following existing pattern from `basic.tsx`:
- DEV mode gate in `beforeLoad`
- Mock schema registry with comprehensive schema
- Mock collection with field type test entities
- `window.__VIBEGRID_TEST_STATE__` exposure
- Controls for scenario selection

---

## Phase 2: High-Priority Field Type Tests

### 2.1 Boolean Field Type Tests

**File:** `apps/web/e2e/vibegrid/field-types/boolean.spec.ts`

| Test | Description | Affordance |
|------|-------------|------------|
| `renders badge correctly` | True = green "Yes", False = red "No" | n/a |
| `click badge enters edit mode` | Opens dropdown | edit |
| `select true/false option` | Badge color updates | edit |
| `escape cancels edit` | No change | edit |
| `click outside commits` | Commits value | edit |
| `read-only shows no affordance` | No click behavior | none |

### 2.2 Select Field Type Tests

**File:** `apps/web/e2e/vibegrid/field-types/select.spec.ts`

| Test | Description |
|------|-------------|
| `renders single-select badge` | Shows selected option |
| `click opens dropdown` | Options list appears |
| `select option updates badge` | Badge updates |
| `multi-select shows multiple badges` | Multiple badges |
| `option icons display` | Icons shown |

### 2.3 Date Field Type Tests

**File:** `apps/web/e2e/vibegrid/field-types/date.spec.ts`

| Test | Description |
|------|-------------|
| `renders formatted date` | Localized string |
| `click opens date picker` | Native picker |
| `select date updates cell` | New value |
| `datetime shows time` | Includes time |

### 2.4 Rating Field Type Tests

**File:** `apps/web/e2e/vibegrid/field-types/rating.spec.ts`

| Test | Description |
|------|-------------|
| `renders stars correctly` | Gold + gray stars |
| `click enters interactive mode` | Hover-responsive |
| `hover highlights stars` | Visual feedback |
| `click star saves immediately` | Auto-save |

### 2.5 Slider Field Type Tests

**File:** `apps/web/e2e/vibegrid/field-types/slider.spec.ts`

| Test | Description |
|------|-------------|
| `renders progress bar` | Filled bar |
| `click opens slider editor` | Interactive slider |
| `drag slider changes value` | Value updates |

### 2.6 Color Field Type Tests

**File:** `apps/web/e2e/vibegrid/field-types/color.spec.ts`

| Test | Description |
|------|-------------|
| `renders color swatch` | Colored square |
| `click opens picker` | Color picker |
| `select color updates cell` | Swatch updates |

---

## Phase 3: Advanced Feature Tests

### 3.1 Fill Handle Tests

**File:** `apps/web/e2e/vibegrid/advanced/fill-handle.spec.ts`

- Fill handle visible on selection
- Drag down/right fills values
- Fill respects group boundaries

### 3.2 Multi-Cell Paste Tests

**File:** `apps/web/e2e/vibegrid/advanced/paste.spec.ts`

- Paste single cell
- Paste multiple cells (TSV)
- Paste respects column types

### 3.3 Virtual Scrolling Tests

**File:** `apps/web/e2e/vibegrid/advanced/virtual-scroll.spec.ts`

- Renders only visible rows (500 rows = ~30 DOM elements)
- Scroll maintains selection
- Smooth scrolling

---

## Task Breakdown (Beads)

```bash
# Create epic
EPIC=$(bd create --title="GH#488: VibeGrid E2E Field Type Testing" --type=epic --external-ref="gh-488" --silent)

# Phase 1: Infrastructure
INFRA=$(bd create --title="GH#488: Create field type test infrastructure" --type=task --silent)

# Phase 2: High-priority field types
BOOL=$(bd create --title="GH#488: Boolean field type E2E tests" --type=task --silent)
SELECT=$(bd create --title="GH#488: Select field type E2E tests" --type=task --silent)
DATE=$(bd create --title="GH#488: Date field type E2E tests" --type=task --silent)
RATING=$(bd create --title="GH#488: Rating field type E2E tests" --type=task --silent)
SLIDER=$(bd create --title="GH#488: Slider field type E2E tests" --type=task --silent)
COLOR=$(bd create --title="GH#488: Color field type E2E tests" --type=task --silent)

# Dependencies
bd dep add $BOOL $INFRA
bd dep add $SELECT $INFRA
bd dep add $DATE $INFRA
bd dep add $RATING $INFRA
bd dep add $SLIDER $INFRA
bd dep add $COLOR $INFRA

# Phase 3: Advanced features
FILL=$(bd create --title="GH#488: Fill handle E2E tests" --type=task --silent)
PASTE=$(bd create --title="GH#488: Multi-cell paste E2E tests" --type=task --silent)
SCROLL=$(bd create --title="GH#488: Virtual scrolling E2E tests" --type=task --silent)

bd dep add $FILL $INFRA
bd dep add $PASTE $INFRA
bd dep add $SCROLL $INFRA

# Verification
VERIFY=$(bd create --title="GH#488: VERIFY all field type tests pass" --type=task --labels=testing --silent)
```

---

## Key Files

### New Files
- `apps/web/src/app/routes/_authenticated/debug/vibegrid-test/_utils/field-type-schema.ts`
- `apps/web/src/app/routes/_authenticated/debug/_mock-data/field-type-generators.ts`
- `apps/web/src/app/routes/_authenticated/debug/vibegrid-test/field-types.tsx`
- `apps/web/e2e/vibegrid/field-types/*.spec.ts` (6 files)
- `apps/web/e2e/vibegrid/advanced/*.spec.ts` (3 files)

### Reference Files
- `apps/web/src/systems/vibegrid/field-types/implementations/basic/*.ts`
- `apps/web/e2e/vibegrid/editing.spec.ts`
- `apps/web/src/app/routes/_authenticated/debug/vibegrid-test/basic.tsx`

---

## Estimated Scope

| Phase | Files | Tests | Complexity |
|-------|-------|-------|------------|
| Infrastructure | 3 | 0 | Medium |
| Field Types | 6 | ~42 | Medium |
| Advanced | 3 | ~15 | High |
| **Total** | **12** | **~57** | - |

---

## Success Criteria

- [ ] All 6 high-priority field types have dedicated E2E tests
- [ ] Field type test route renders all field types correctly
- [ ] Advanced features have baseline coverage
- [ ] All tests pass in CI
- [ ] Test execution time <5 min

---

## Notes

_Session: 2025-12-31_
- Created from planning session reviewing current E2E coverage
- Field type implementations analyzed: Boolean, Select, Date, Rating
- Existing test patterns documented from exploration agents
