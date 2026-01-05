---
issue: 244
type: feature
title: VibeGrid Unified Data Entry Forms
status: ready-for-review
created: 2026-01-05
updated: 2026-01-05
template: full-stack
---

# Feature Planning: VibeGrid Unified Data Entry Forms

> **Instructions for Agent:**
> Fill this template during PLANNING session by exploring the codebase.
> Every field must contain ACTUAL file paths and patterns, not placeholders.
> Run searches, read files, understand conventions before filling.
> Mark sections N/A if not applicable to this feature.

---

## Research Context (Optional)

> Fill this section if prior research informs this feature.
> Link research issues and summarize key findings relevant to this spec.

### Related Research

| Research Issue | Title | How It Informs This Feature |
|----------------|-------|----------------------------|
| N/A | Codebase Exploration | Direct exploration of VibeGrid architecture informed the Layout Adapter approach |

### Key Findings Applied

1. **Finding:** Navigation is ALREADY layout-agnostic - KeyboardNavigationController uses `processedRows` and `visibleColumns` arrays, not grid positions.
   **Impact on spec:** Layout Adapter pattern maps directly to existing architecture. No need to refactor navigation system.

2. **Finding:** FieldTypeRegistry has 23 field types across 4 categories (basic, relationship, rollup, computed) with ModularCellBridge connecting to renderers.
   **Impact on spec:** VibeForm can reuse existing field type infrastructure via ModularCellBridge pattern.

3. **Finding:** InteractionStore is already layout-agnostic (uses array indices). EditingStore manages edit session lifecycle.
   **Impact on spec:** Extend InteractionStore for Property Sheet selection state; leverage EditingStore for auto-save on blur.

### Unresolved Questions from Research

| Question | How Addressed in Spec |
|----------|----------------------|
| How to handle Y.js integration? | Deferred - design hooks now (onFieldFocus/onFieldBlur/onValueChange), implement later |
| Real-time cursor presence? | Deferred to Phase 2+ - focus on single-user auto-save first |

---

## 0. Feature Context

**GitHub Issue:** #244
**Acceptance Criteria:**
1. Property Sheet layout renders entity fields as label:value rows
2. Keyboard navigation (up/down, Tab) works between fields
3. Auto-save on blur persists changes via TanStack DB mutation
4. Long text fields auto-expand vertically
5. Responsive breakpoints match existing app breakpoints
6. Entity Create and Edit dialogs use VibeForm instead of EntityForm
7. Zero regression to existing VibeGrid table view behavior

**Related Features:**
- **EntityForm**: `apps/web/src/features/entities/components/forms/EntityForm.tsx` - Current schema-driven form (to be replaced by VibeForm)
- **FieldInputRenderer**: `apps/web/src/features/entities/components/forms/field-input-renderer.tsx` - Type-based field rendering
- **CreateRecordDialog**: `apps/web/src/features/entities/components/dialogs/CreateRecordDialog.tsx` - Will migrate to use VibeForm
- **EditRecordDialog**: `apps/web/src/features/entities/components/dialogs/EditRecordDialog.tsx` - Will migrate to use VibeForm
- **CellFactory**: `apps/web/src/systems/vibegrid/factories/CellFactory.ts` - Creates cell DOM elements (630 lines)
- **FieldTypeRegistry**: `apps/web/src/systems/vibegrid/field-types/FieldTypeRegistry.ts` - 23 field types (547 lines)

---

## 0.5 BASELINE VERIFICATION (BLOCKING)

> **CRITICAL:** Before ANY implementation, manually verify existing related features work.
> If baseline is broken → STOP → File bug → Fix baseline first.
> See `.claude/rules/incremental-verification.md` for full protocol.

### Pre-Implementation Checks

| Check | How to Verify | Expected Result | Status |
|-------|---------------|-----------------|--------|
| VibeGrid table renders | Navigate to `/projects/*/entities/*` | Grid displays with rows and columns | [ ] |
| Entity editing works | Click cell in grid, edit value | Cell enters edit mode, saves on blur | [ ] |
| FieldTypeRegistry loads | Check `FieldTypeRegistry.ts` initialization | 23 field types registered | [ ] |
| InteractionStore works | Select cell, verify selection state | Cell highlighted, store updated | [ ] |
| EntityForm renders | Open CreateRecordDialog | Form displays with all field types | [ ] |
| No console errors | Open DevTools Console | No errors related to VibeGrid | [ ] |

**If ANY check fails:**
1. STOP planning
2. File a bug issue for the broken baseline
3. Fix baseline before extending

### Baseline Verification Task (auto-created in Beads)
```bash
# This task MUST be first and MUST block all implementation
BASELINE=$(bd create --title="GH#244: VERIFY baseline - VibeGrid and EntityForm work" --type=task --priority=0 --labels=testing --silent)
```

---

## 1. Backend / API

### 1.1 Similar Feature Analysis

**This feature is FRONTEND ONLY - no new backend API required.**

The Layout Adapter and VibeForm components operate entirely on the frontend. They use:
- Existing DataForge entity CRUD APIs via TanStack DB mutation
- Existing entity schema definitions from FieldTypeRegistry
- Existing validation from Zod schemas already in EntityForm

**Relevant existing APIs (no changes needed):**
- `apps/web/src/server/orpc/routers/entity.ts` - Entity CRUD operations
- `apps/web/src/server/orpc/routers/dataforge.ts` - Schema and field definitions

### 1.2 New Files

**No new backend files.** All changes are frontend-only.

### 1.3 API Endpoints

**No new API endpoints.** Uses existing entity mutation endpoints.

### 1.4 Validation (Zod Schemas)

**No new schemas.** VibeForm reuses existing validation from:
- `apps/web/src/features/entities/components/forms/EntityForm.tsx` - Schema-driven validation
- `apps/web/src/server/orpc/schemas/entity/` - Existing entity schemas

### 1.5 Business Logic

**No new backend services.** Frontend-only feature.

### 1.6 Key TypeScript Interfaces (NEW)

These interfaces define the Layout Adapter abstraction:

```typescript
// apps/web/src/systems/vibegrid/types/layout-types.ts

interface LayoutConfig {
  type: 'property-sheet' | 'single-column' | 'two-column' | 'inline-row' | 'grid'
  fields?: FieldPlacement[]
  responsive?: { mobile: 'single-column' | 'property-sheet'; threshold: number }
  showLabels?: boolean
  labelPosition?: 'left' | 'above'
}

interface FieldPlacement {
  fieldId: string
  row?: number
  col?: number
  span?: number
}

interface CellLayoutAdapter {
  // Navigation
  getFieldNeighbors(fieldId: string): { up?: string; down?: string; left?: string; right?: string }
  getCellPosition(fieldId: string): { row: number; col: number }
  getFieldAtPosition(row: number, col: number): string | null
  getTabOrder(): string[]

  // Rendering
  getGridTemplate(): string
  getFieldStyle(fieldId: string): CSSProperties

  // Y.js hooks (design now, implement later)
  onFieldFocus?(fieldId: string): void
  onFieldBlur?(fieldId: string): void
  onValueChange?(fieldId: string, value: any): void
}
```

---

## 2. Frontend / UI

### 2.1 Similar Feature Analysis

**Most similar existing feature:**
Path: `apps/web/src/systems/vibegrid/` - The VibeGrid system itself
Why similar: This feature extends VibeGrid with alternative layout rendering

**Component patterns to follow:**
- Cell rendering: `apps/web/src/systems/vibegrid/factories/CellFactory.ts` - DOM cell creation
- Field types: `apps/web/src/systems/vibegrid/field-types/FieldTypeRegistry.ts` - 23 field type definitions
- Interaction: `apps/web/src/systems/vibegrid/stores/InteractionStore.ts` - Selection state management
- Editing: `apps/web/src/systems/vibegrid/stores/EditingStore.ts` - Edit session lifecycle
- Navigation: `apps/web/src/systems/vibegrid/renderers/modules/KeyboardNavigationController.ts` - Keyboard handling
- Bridge: `apps/web/src/systems/vibegrid/field-types/ModularCellBridge.ts` - Renderer-to-field-type connection

**Forms to replace:**
- `apps/web/src/features/entities/components/forms/EntityForm.tsx` - Current form (React Hook Form + Zod)
- `apps/web/src/features/entities/components/forms/field-input-renderer.tsx` - Field type rendering

### 2.2 New Files

| File Path | Purpose | Based On |
|-----------|---------|----------|
| `apps/web/src/systems/vibegrid/types/layout-types.ts` | Layout adapter interfaces | New (see Section 1.6) |
| `apps/web/src/systems/vibegrid/adapters/CellLayoutAdapter.ts` | Base adapter interface | New |
| `apps/web/src/systems/vibegrid/adapters/PropertySheetAdapter.ts` | Property Sheet layout implementation | New |
| `apps/web/src/systems/vibegrid/adapters/GridAdapter.ts` | Grid layout implementation (existing behavior) | `KeyboardNavigationController.ts` |
| `apps/web/src/systems/vibegrid/components/VibeForm.tsx` | Layout-agnostic form component | `EntityForm.tsx` |
| `apps/web/src/systems/vibegrid/components/PropertySheet.tsx` | Property Sheet UI (label:value rows) | New |
| `apps/web/src/systems/vibegrid/components/VibeFormField.tsx` | Single field wrapper with auto-save | `ModularCellBridge.ts` |
| `apps/web/src/styles/vibegrid/property-sheet.css` | Property Sheet styles | `vibegrid.css` |

### 2.3 MobX Store Design

**No new store.** Extends existing stores:

**InteractionStore extension:** `apps/web/src/systems/vibegrid/stores/InteractionStore.ts`

**New Observable State (added to InteractionStore):**
| Field | Type | Initial | Purpose |
|-------|------|---------|---------|
| `activeLayout` | `'grid' \| 'property-sheet'` | `'grid'` | Current layout mode |
| `focusedFieldId` | `string \| null` | `null` | Currently focused field in Property Sheet |

**New Actions (added to InteractionStore):**
| Action | What it does | Notes |
|--------|--------------|-------|
| `setLayout(layout)` | Switch between grid and property-sheet | Updates keyboard navigation adapter |
| `focusField(fieldId)` | Set focused field in property sheet | Used by keyboard navigation |

**EditingStore reuse:** `apps/web/src/systems/vibegrid/stores/EditingStore.ts`
- `startEditing(fieldId)` - Begin edit session
- `commitEditing()` - Save on blur (triggers TanStack DB mutation)
- `cancelEditing()` - Discard changes

### 2.4 Component Props & State

| Component | Props | Local State | Store Access |
|-----------|-------|-------------|--------------|
| `VibeForm` | `entityId: string, layoutConfig: LayoutConfig, onSave?: (entity) => void` | `isDirty: boolean` | `InteractionStore`, `EditingStore` via VibeGrid context |
| `PropertySheet` | `fields: FieldDef[], adapter: CellLayoutAdapter` | None | `InteractionStore.focusedFieldId` |
| `VibeFormField` | `field: FieldDef, value: any, onChange: (value) => void` | `isEditing: boolean, localValue: any` | `EditingStore` |

### 2.5 Routing

**No new routes.** Property Sheet opens as slide-out panel on existing entity list routes.

| Context | Trigger | Result |
|---------|---------|--------|
| Entity list | Click row | Slide-out panel with PropertySheet |
| Create dialog | Click "New" button | Dialog with VibeForm (property-sheet layout) |
| Edit dialog | Double-click row | Dialog with VibeForm (property-sheet layout) |

### 2.6 Accessibility & Testing

**data-testid attributes needed:**
| Element | data-testid | Purpose |
|---------|-------------|---------|
| Property Sheet container | `property-sheet` | E2E: verify panel renders |
| Property Sheet field | `property-sheet-field-{fieldId}` | E2E: field interaction |
| VibeForm container | `vibe-form` | E2E: form component |
| VibeForm field | `vibe-form-field-{fieldId}` | E2E: field testing |
| Save indicator | `vibe-form-save-status` | E2E: verify auto-save |
| Error message | `vibe-form-error-{fieldId}` | E2E: error display |

**Keyboard accessibility:**
| Key | Action in Property Sheet |
|-----|--------------------------|
| `Tab` | Move to next field |
| `Shift+Tab` | Move to previous field |
| `ArrowUp` | Move to field above |
| `ArrowDown` | Move to field below |
| `Enter` | Confirm edit and move to next field |
| `Escape` | Cancel current edit |

### 2.7 Create Flow Architecture

> **Context:** When creating a new entity, no entity ID exists yet. This section defines how VibeForm handles the transition from local-only state to persisted entity.

**State Machine:**

```
┌─────────────────┐
│   LOCAL-ONLY    │  Form opens, no entity ID
│   (draft mode)  │  State stored in local VibeForm state
└────────┬────────┘
         │ Min required fields filled
         │ (e.g., name, type)
         v
┌─────────────────┐
│  AUTO-CREATE    │  Background API call to create entity
│   (pending)     │  UI shows subtle "saving..." indicator
└────────┬────────┘
         │ Entity created successfully
         │ Entity ID returned
         v
┌─────────────────┐
│   PERSISTED     │  Entity exists in database
│   (edit mode)   │  Auto-save on blur works normally
└─────────────────┘
```

**Minimum Required Fields:**

| Entity Type | Required for Auto-Create | Notes |
|-------------|-------------------------|-------|
| Default | `name` field | Most entities need a name |
| Custom | Defined in archetype config | Via existing DataForge `required` flag |

**Implementation Details:**

```typescript
// apps/web/src/systems/vibegrid/components/VibeForm.tsx

interface CreateFlowState {
  mode: 'local' | 'creating' | 'persisted'
  localValues: Record<string, any>  // Pre-create field values
  entityId: string | null           // Populated after auto-create
  createError: string | null        // Error message if auto-create fails
}

// Auto-create trigger logic
const shouldAutoCreate = (values: Record<string, any>, schema: EntitySchema): boolean => {
  const requiredFields = schema.fields.filter(f => f.required)
  return requiredFields.every(f => values[f.id] != null && values[f.id] !== '')
}

// Create flow
const handleAutoCreate = async () => {
  setState({ mode: 'creating' })
  try {
    const entity = await createEntity(schema.archetypeId, localValues)
    setState({ mode: 'persisted', entityId: entity.id })
  } catch (error) {
    setState({ mode: 'local', createError: error.message })
  }
}
```

**UI Indicators:**

| Mode | Visual Indicator | User Action |
|------|------------------|-------------|
| `local` | Subtle "Draft" badge | Fill required fields |
| `creating` | Spinner on save indicator | Wait |
| `persisted` | Green checkmark | Normal editing |
| Error | Red inline error + retry button | Fix issue or retry |

**Close Behavior (No Orphan Drafts):**

| Scenario | Behavior |
|----------|----------|
| Close before min fields filled | Discard draft, no entity created |
| Close during `creating` | Wait for create to complete or fail |
| Close after `persisted` | Normal close, entity exists |

**Why this approach:**
1. **No orphan drafts** - Entity only created when viable (has required fields)
2. **Seamless UX** - User doesn't notice create vs edit distinction
3. **Local-first** - All field values stored locally until create succeeds
4. **Recovery** - If create fails, user can fix and retry without losing data

### 2.8 Validation Architecture

> **Context:** VibeForm reuses VibeGrid's existing validation infrastructure. NO React Hook Form - VibeForm manages its own state via MobX stores.

**Validation Stack:**

```
┌─────────────────────────────────────────────────┐
│               VibeForm Component                 │
│  - Manages form-level validation state          │
│  - Tracks which fields have errors              │
│  - Gates auto-create on all fields valid        │
└─────────────────────┬───────────────────────────┘
                      │
                      v
┌─────────────────────────────────────────────────┐
│               VibeFormField                      │
│  - Delegates to FieldTypeRegistry validator     │
│  - Shows error via red border + inline message  │
│  - Prevents blur-save if invalid                │
└─────────────────────┬───────────────────────────┘
                      │
                      v
┌─────────────────────────────────────────────────┐
│           FieldTypeRegistry.validate()           │
│  - Per-field-type validation (CellValidator)    │
│  - Returns { valid: boolean, error?: string }   │
│  - Already exists in VibeGrid infrastructure    │
└─────────────────────────────────────────────────┘
```

**CellValidator Interface (Existing):**

```typescript
// apps/web/src/systems/vibegrid/field-types/FieldTypeRegistry.ts

interface CellValidator {
  validate(value: any, fieldConfig: FieldConfig): ValidationResult
}

interface ValidationResult {
  valid: boolean
  error?: string  // User-facing error message
}

// Example validators already in FieldTypeRegistry:
// - TextValidator: min/max length, pattern
// - NumberValidator: min/max, integer vs decimal
// - DateValidator: valid date, min/max date
// - SelectValidator: value in option set
// - RelationshipValidator: entity exists
```

**Field-Level Validation (on blur):**

```typescript
// apps/web/src/systems/vibegrid/components/VibeFormField.tsx

const handleBlur = () => {
  const validator = fieldTypeRegistry.getValidator(field.type)
  const result = validator.validate(localValue, field.config)

  if (!result.valid) {
    setError(result.error)
    // Do NOT save - show error instead
    return
  }

  setError(null)
  // Proceed with auto-save
  editingStore.commitEditing()
}
```

**Form-Level Validation (for auto-create gate):**

```typescript
// apps/web/src/systems/vibegrid/components/VibeForm.tsx

const canAutoCreate = (): boolean => {
  // Check all required fields have valid values
  for (const field of schema.fields.filter(f => f.required)) {
    const value = localValues[field.id]
    const validator = fieldTypeRegistry.getValidator(field.type)
    const result = validator.validate(value, field.config)
    if (!result.valid) return false
  }
  return true
}
```

**Error Display Pattern:**

| Element | Style | data-testid |
|---------|-------|-------------|
| Field border | 2px solid red (`#ef4444`) | N/A (CSS) |
| Error message | Red text below field, 12px | `vibe-form-error-{fieldId}` |
| Error icon | Red exclamation in field | N/A (CSS) |

```css
/* apps/web/src/styles/vibegrid/property-sheet.css */

.vibe-form-field--error {
  border: 2px solid #ef4444;
}

.vibe-form-field__error-message {
  color: #ef4444;
  font-size: 12px;
  margin-top: 4px;
}
```

**Why NOT React Hook Form:**

| Aspect | React Hook Form | VibeForm (MobX) |
|--------|-----------------|-----------------|
| State location | RHF internal | MobX stores (EditingStore) |
| Validation | Zod/Yup schemas | FieldTypeRegistry validators |
| Field registration | `register()` calls | Automatic via store |
| Re-renders | Per-field isolation | MobX fine-grained |
| VibeGrid integration | Would need adapter | Native - same stores |

**Key principle:** VibeForm IS VibeGrid in a different layout. Same stores, same validators, same field types. This ensures consistency and reduces code duplication.

**Alignment with Server-Side Validation:**

The `required` flag used here matches existing DataForge field metadata. This ensures:
- Frontend validation mirrors server-side `ValidationEngine` rules
- No new metadata introduced - uses existing `required` column from archetype definitions
- Consistent with other VibeGrid features that use the same `required` flag
- Single source of truth: field definition in DataForge archetype

---

## 3. Database / DataForge

### 3.1 Entity Design

**Approach:** N/A - No database changes

This is a frontend layout system only. No new entities, archetypes, or database tables are needed.

### 3.2 Fields

**N/A** - No new fields. VibeForm renders fields from existing entity schemas defined in DataForge.

### 3.3 Relationships

**N/A** - No new relationships. VibeForm displays existing relationships from entity definitions.

### 3.4 Migration

**Migration needed?** No
**Reason:** This feature is entirely frontend - it provides alternative layout rendering for existing entity data.

---

## 4. Security

### 4.1 Authorization

**Access control pattern:** Same as existing EntityForm - `entities:write` permission
**Reference:** `apps/web/src/features/entities/components/forms/EntityForm.tsx`

| Action | Permission | How Enforced |
|--------|-----------|--------------|
| View fields | `entities:read` | Existing entity API checks |
| Edit fields | `entities:write` | Existing entity API checks |
| Create entity | `entities:write` | Existing entity API checks |

**No new authorization logic.** VibeForm uses the same TanStack DB mutations as EntityForm, which already enforce permissions via existing oRPC procedures.

### 4.2 Input Validation

**No new validation logic.** VibeForm reuses existing validation from:
- Entity schema Zod definitions (per field type)
- FieldTypeRegistry validation functions
- Backend oRPC procedure validation

| Risk | How Mitigated |
|------|---------------|
| XSS in text fields | Existing field sanitization in EntityForm |
| Invalid field values | Zod schema validation before mutation |
| Unauthorized edits | Backend permission checks on mutation |

### 4.3 Audit Trail

**No new audit events.** Uses existing entity update audit logging:
- Entity mutations already logged via existing audit infrastructure
- Field-level changes captured in existing audit trail

---

## 5. Test Strategy

> **CRITICAL:** This section defines the complete test plan that will be executed during implementation.
> Each test case becomes a Beads task. Tests are NOT optional - they gate feature completion.
> See `.claude/rules/incremental-verification.md` for the verification protocol.
>
> **TDD Enforcement:** Implementation sessions have hooks that warn when editing production code
> without test changes. Ensure each implementation task has corresponding test cases here.

### 5.1 Test Environment

| Requirement | Value | Notes |
|-------------|-------|-------|
| Organization | WideCorp (existing test org) | Has entities with multiple field types |
| User/Role | ceo@widecorp.com (owner) | Has `entities:write` permission |
| External Services | None required | Frontend-only feature |
| Test Data | Entity schema with 10+ fields of different types | Use existing test entities in WideCorp |
| Dev Server | `./scripts/dev/setup.sh` | Standard dev setup |

**Environment Readiness Check:**
```bash
# Verify dev server is running
curl -s http://localhost:$DEV_PORT/api/health | jq .

# Login as test user
cd .claude/skills/baseplane-data/scripts && npm install
node run.js 'auth ceo | orpc /dataforge/entities/list'

# Verify VibeGrid renders (manual check)
# Navigate to http://localhost:$DEV_PORT/projects/*/entities/* and confirm grid loads

# Verify EntityForm renders (manual check)
# Click "New" button and confirm form dialog opens
```

### 5.2 Test Cases by Category

> **Agent:** Create test cases for EACH major feature area. These become VERIFY tasks.
> Pattern: Happy path → Edge cases → Error cases → Performance (if applicable)

#### Category 1: Property Sheet Layout

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 1.1 | Property Sheet renders correctly | 1. Click entity row in list 2. Observe slide-out panel | Panel slides out with label:value rows for each field | P1 |
| 1.2 | Fields display correct values | 1. Open Property Sheet for entity with known values 2. Check each field | All field values match entity data | P1 |
| 1.3 | Labels positioned correctly | 1. Open Property Sheet 2. Verify label position | Labels on left, values on right (property-sheet mode) | P1 |
| 1.4 | All field types render | 1. Open Property Sheet for entity with text, number, date, select, relationship fields | Each field type renders appropriately | P1 |

#### Category 2: Keyboard Navigation

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 2.1 | Tab moves to next field | 1. Focus first field 2. Press Tab | Focus moves to second field | P1 |
| 2.2 | Shift+Tab moves to previous | 1. Focus second field 2. Press Shift+Tab | Focus moves to first field | P1 |
| 2.3 | ArrowDown moves down | 1. Focus field 2. Press ArrowDown | Focus moves to field below | P1 |
| 2.4 | ArrowUp moves up | 1. Focus field 2. Press ArrowUp | Focus moves to field above | P1 |
| 2.5 | Enter confirms and advances | 1. Edit field 2. Press Enter | Changes saved, focus moves to next field | P2 |
| 2.6 | Escape cancels edit | 1. Edit field 2. Press Escape | Changes discarded, field exits edit mode | P2 |

#### Category 3: Auto-Save on Blur

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 3.1 | Text field auto-saves | 1. Edit text field 2. Click away (blur) | Value persists after page refresh | P1 |
| 3.2 | Number field auto-saves | 1. Edit number field 2. Blur | Value saved to database | P1 |
| 3.3 | Select field auto-saves | 1. Change select value 2. Blur | Selection persists | P1 |
| 3.4 | Invalid input shows error | 1. Enter invalid data 2. Blur | Red border on field + inline error message | P1 |
| 3.5 | Network error handled | 1. Edit field 2. Blur (with network disabled) | Error message shown, value not lost | P2 |

#### Category 4: Long Text Auto-Expansion

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 4.1 | Short text fits single line | 1. View field with short text | Field shows single line height | P2 |
| 4.2 | Long text expands vertically | 1. View field with 200+ character text | Field height expands to show all text | P1 |
| 4.3 | Multi-line text wraps | 1. View field with line breaks | Text wraps and displays multiple lines | P2 |
| 4.4 | Edit mode expands textarea | 1. Click to edit long text field | Textarea expands to show content | P2 |

#### Category 5: Responsive Breakpoints

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 5.1 | Desktop layout | 1. View at 1200px width | Property Sheet shows label:value rows | P1 |
| 5.2 | Tablet layout | 1. View at 768px width | Layout adjusts (if responsive config set) | P2 |
| 5.3 | Mobile layout | 1. View at 375px width | Single column layout, labels above values | P2 |

#### Category 6: Error Handling

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 6.1 | Save failure shows error | 1. Edit field 2. Trigger save failure | Red border on field + inline error message | P1 |
| 6.2 | Retry after error | 1. Encounter save error 2. Fix issue and blur again | Save succeeds, error clears | P2 |
| 6.3 | No editable fields | 1. Open Property Sheet for read-only entity | Property Sheet section hidden or shows message | P3 |

#### Category 7: Entity Dialog Migration

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 7.1 | Create dialog uses VibeForm | 1. Click "New" button 2. Fill form 3. Save | Entity created via VibeForm | P1 |
| 7.2 | Edit dialog uses VibeForm | 1. Double-click row 2. Edit 3. Save | Entity updated via VibeForm | P1 |
| 7.3 | Validation in Create dialog | 1. Click "New" 2. Leave required field empty 3. Try to save | Validation error shown | P1 |

#### Category 8: Performance

| # | Test Case | Threshold | How to Measure |
|---|-----------|-----------|----------------|
| 8.1 | Property Sheet render time | < 100ms | Chrome DevTools Performance |
| 8.2 | Field edit response | < 50ms | Time from click to edit mode |
| 8.3 | Auto-save latency | < 500ms | Time from blur to saved indicator |

#### Category 9: Create Flow (Section 2.7)

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 9.1 | Form starts in local mode | 1. Click "New" to open create dialog | Form shows "Draft" badge, no API call made | P1 |
| 9.2 | No auto-create without min fields | 1. Open create dialog 2. Fill optional field only 3. Blur | No entity created, still in draft mode | P1 |
| 9.3 | Auto-create on min fields filled | 1. Open create dialog 2. Fill name field 3. Blur | Entity auto-created, mode changes to persisted | P1 |
| 9.4 | Auto-save works after auto-create | 1. Complete auto-create 2. Edit another field 3. Blur | Field value saved to existing entity | P1 |
| 9.5 | Close before min fields discards | 1. Open create dialog 2. Fill optional field 3. Close dialog | No entity created, no orphan draft | P1 |
| 9.6 | Auto-create error shows retry | 1. Fill min fields 2. Trigger network error | Error message + retry button shown | P2 |
| 9.7 | Retry after error succeeds | 1. Encounter auto-create error 2. Click retry | Entity created, mode changes to persisted | P2 |

#### Category 10: Validation Architecture (Section 2.8)

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 10.1 | Invalid field shows red border | 1. Enter invalid value (e.g., text in number field) 2. Blur | Field has red border (2px solid #ef4444) | P1 |
| 10.2 | Invalid field shows error message | 1. Enter invalid value 2. Blur | Error message appears below field | P1 |
| 10.3 | Invalid field blocks save | 1. Enter invalid value 2. Blur | Value NOT saved, stays in edit mode | P1 |
| 10.4 | Valid field clears error | 1. Field has error 2. Enter valid value 3. Blur | Red border removed, error message gone | P1 |
| 10.5 | All fields valid allows auto-create | 1. Fill all required fields with valid values 2. Blur | Auto-create triggers successfully | P1 |
| 10.6 | Any invalid field blocks auto-create | 1. Fill name (valid) 2. Fill another required field (invalid) | Auto-create NOT triggered, error shown | P1 |
| 10.7 | Text validator enforces max length | 1. Enter text exceeding max length 2. Blur | Error: "Maximum X characters" | P2 |
| 10.8 | Number validator enforces range | 1. Enter number outside min/max 2. Blur | Error: "Must be between X and Y" | P2 |
| 10.9 | Select validator enforces options | 1. Programmatically set invalid option 2. Blur | Error: "Invalid selection" | P3 |

### 5.3 API Test Commands

> **NOTE:** This feature is frontend-only. No new API endpoints. Testing is UI-focused.
> Use baseplane-data scripts for existing entity CRUD operations.

```bash
# Setup: Install baseplane-data dependencies
cd .claude/skills/baseplane-data/scripts && npm install

# Verify existing entity list API works
node run.js 'auth ceo | orpc /dataforge/entities/list'

# Verify entity update API works (used by auto-save)
# This tests the mutation path that VibeForm will use
node run.js 'auth ceo | orpc /dataforge/entities/update --id=<ENTITY_ID> --data={"name":"Test"}'

# Manual UI testing commands (using chrome-devtools skill)
# Start Chrome with debugging enabled
./scripts/dev/setup.sh

# Property Sheet interaction testing via DevTools
# See .claude/skills/chrome-devtools/SKILL.md for automation patterns
```

### 5.4 Per-Phase Verification Gates

> Each phase has a verification gate that MUST pass before proceeding.

**Phase 1 Verification (Layout Adapter Infrastructure):**
| Check | Command/Steps | Expected | Status |
|-------|---------------|----------|--------|
| Types compile | `pnpm typecheck` | No errors in layout-types.ts | [ ] |
| CellLayoutAdapter interface defined | Check file exists | Interface exported | [ ] |
| PropertySheetAdapter created | Check file exists | Class implements interface | [ ] |
| GridAdapter created | Check file exists | Wraps existing navigation | [ ] |

**Phase 2 Verification (Property Sheet Layout):**
| Check | Command/Steps | Expected | Status |
|-------|---------------|----------|--------|
| PropertySheet component renders | Navigate to entity, click row | Panel slides out | [ ] |
| Fields displayed as rows | Visual inspection | Label:value format | [ ] |
| All field types render | Check text, number, date, select | Each renders correctly | [ ] |
| Keyboard navigation works | Tab, Arrow keys | Focus moves correctly | [ ] |

**Phase 3 Verification (VibeForm Component):**
| Check | Command/Steps | Expected | Status |
|-------|---------------|----------|--------|
| VibeForm renders | Use in test component | Form displays | [ ] |
| Field editing works | Click field, type value | Edit mode activates | [ ] |
| Auto-save on blur | Edit value, click away | Value persists on refresh | [ ] |
| Long text expands | Enter 200+ chars | Field height increases | [ ] |

**Phase 4 Verification (Entity Dialog Migration):**
| Check | Command/Steps | Expected | Status |
|-------|---------------|----------|--------|
| CreateRecordDialog uses VibeForm | Click "New" button | VibeForm renders in dialog | [ ] |
| EditRecordDialog uses VibeForm | Double-click row | VibeForm renders in dialog | [ ] |
| Validation works | Leave required field empty | Error shown | [ ] |
| Zero regression to grid | Navigate to entity list | Grid still renders correctly | [ ] |

### 5.5 Automated Tests

| Test File | What It Tests | Test Cases Covered |
|-----------|---------------|-------------------|
| `apps/web/src/systems/vibegrid/adapters/PropertySheetAdapter.test.ts` | Layout adapter logic | 1.1-1.4, navigation methods |
| `apps/web/src/systems/vibegrid/adapters/GridAdapter.test.ts` | Grid adapter (existing behavior) | Regression tests |
| `apps/web/src/systems/vibegrid/components/VibeForm.test.tsx` | Form component rendering | 1.1-1.4, field rendering, 9.1-9.7 create flow |
| `apps/web/src/systems/vibegrid/components/VibeFormField.test.tsx` | Field editing + auto-save + validation | 3.1-3.5 auto-save, 10.1-10.9 validation |
| `apps/web/src/systems/vibegrid/components/PropertySheet.test.tsx` | Property Sheet layout | 1.1-1.4, keyboard nav |
| `e2e/vibegrid/property-sheet.spec.ts` | E2E Property Sheet flow | 1.1-1.4, 2.1-2.6 end-to-end |
| `e2e/vibegrid/vibe-form.spec.ts` | E2E VibeForm in dialogs | 7.1-7.3 end-to-end |
| `e2e/vibegrid/create-flow.spec.ts` | E2E create flow | 9.1-9.5 create flow end-to-end |
| `e2e/vibegrid/validation.spec.ts` | E2E validation behavior | 10.1-10.6 validation end-to-end |

### 5.6 Success Criteria

> **All must pass for feature to be complete.** Map to acceptance criteria from issue.

| Criterion | Test Cases | Verified By | Status |
|-----------|------------|-------------|--------|
| Property Sheet renders fields as label:value rows | 1.1, 1.2, 1.3 | E2E + manual | [ ] |
| Keyboard navigation works (Tab, ArrowUp/Down) | 2.1-2.6 | E2E + manual | [ ] |
| Auto-save on blur persists changes | 3.1-3.4 | E2E + API | [ ] |
| Long text fields auto-expand vertically | 4.1-4.4 | E2E + manual | [ ] |
| Responsive breakpoints match app breakpoints | 5.1-5.3 | Manual | [ ] |
| Entity Create dialog uses VibeForm | 7.1, 7.3 | E2E | [ ] |
| Entity Edit dialog uses VibeForm | 7.2 | E2E | [ ] |
| Zero regression to VibeGrid table view | Phase 4 verification | E2E + manual | [ ] |
| Performance: render < 100ms, save < 500ms | 8.1-8.3 | DevTools | [ ] |

### 5.7 Final Demo Checklist

- [ ] **Demo Property Sheet**: Click row, show slide-out panel with label:value layout
- [ ] **Demo keyboard navigation**: Tab through fields, use Arrow keys
- [ ] **Demo auto-save**: Edit field, blur, refresh page to show persistence
- [ ] **Demo long text expansion**: Enter 200+ chars, show field expands
- [ ] **Demo Create dialog**: Click "New", fill VibeForm, save
- [ ] **Demo Edit dialog**: Double-click row, show VibeForm, edit, save
- [ ] **Demo error handling**: Show validation error on invalid input
- [ ] **Verify grid regression**: Navigate to entity list, confirm grid still works
- [ ] **Take screenshot/recording** as evidence

---

## 6. Task Breakdown (TDD-Enforced)

> **CRITICAL: TRUE TDD - Tests BLOCK Implementation**
>
> Each phase follows: `TEST → IMPL → VERIFY`
> - **TEST**: Write failing tests FIRST (blocks IMPL)
> - **IMPL**: Make tests pass (depends on TEST, blocks VERIFY)
> - **VERIFY**: Manual verification (depends on IMPL)
>
> See `.claude/rules/incremental-verification.md` for protocol.
> Stop conditions require: `test_beads_created` for each success criterion.

### Beads Epic

```bash
EPIC=$(bd create --title="GH#244: VibeGrid Unified Data Entry Forms" --type=epic --external-ref="gh-244" --silent)
```

### Phase 0: Baseline Verification (BLOCKS ALL)

```bash
# ============================================
# PHASE 0: BASELINE - Must pass before ANY work
# ============================================
BASELINE=$(bd create --title="GH#244: VERIFY baseline - VibeGrid and EntityForm work" --type=task --priority=0 --labels=testing --silent)
# Execute: Section 0.5 Pre-Implementation Checks
# Verify: VibeGrid table renders, cell editing works, EntityForm renders
# If ANY check fails → STOP → File bug → Fix baseline first
```

### Phase 1: Layout Adapter Infrastructure (TDD)

```bash
# ============================================
# PHASE 1: LAYOUT ADAPTER INFRASTRUCTURE (TDD Pattern)
# ============================================

# Step 1: Write tests FIRST (RED phase)
TEST_P1=$(bd create --title="GH#244: TEST Phase 1 - write LayoutAdapter unit tests" --type=task --priority=1 --labels=testing,tdd --silent)
bd dep add $TEST_P1 $BASELINE
# Write tests for:
# - CellLayoutAdapter interface (getFieldNeighbors, getTabOrder, etc.)
# - PropertySheetAdapter (vertical navigation, label:value layout)
# - GridAdapter (wraps existing KeyboardNavigationController behavior)
# Tests should FAIL initially (no implementation yet)

# Step 2: Implement types and adapters (GREEN phase)
IMPL_TYPES=$(bd create --title="GH#244: IMPL layout-types.ts interfaces" --type=task --priority=2 --silent)
bd dep add $IMPL_TYPES $TEST_P1  # ← BLOCKED until tests written
# Create: apps/web/src/systems/vibegrid/types/layout-types.ts
# Define: LayoutConfig, FieldPlacement, CellLayoutAdapter

IMPL_ADAPTERS=$(bd create --title="GH#244: IMPL PropertySheetAdapter and GridAdapter" --type=task --priority=2 --silent)
bd dep add $IMPL_ADAPTERS $IMPL_TYPES
# Create: apps/web/src/systems/vibegrid/adapters/PropertySheetAdapter.ts
# Create: apps/web/src/systems/vibegrid/adapters/GridAdapter.ts
# GridAdapter wraps: KeyboardNavigationController.ts existing logic

# Step 3: Verify (tests pass + typecheck)
VERIFY_P1=$(bd create --title="GH#244: VERIFY Phase 1 - adapter tests pass, typecheck OK" --type=task --labels=testing --silent)
bd dep add $VERIFY_P1 $IMPL_ADAPTERS
# Run: pnpm typecheck && pnpm test -- PropertySheetAdapter
# Execute: Section 5.4 Phase 1 Verification Gate
```

### Phase 2: Property Sheet Layout (TDD)

```bash
# ============================================
# PHASE 2: PROPERTY SHEET LAYOUT (TDD Pattern)
# ============================================

# Step 1: Write component tests FIRST
TEST_P2=$(bd create --title="GH#244: TEST Phase 2 - write PropertySheet component tests" --type=task --priority=1 --labels=testing,tdd --silent)
bd dep add $TEST_P2 $VERIFY_P1
# Write tests for:
# - PropertySheet renders label:value rows
# - Keyboard navigation (Tab, ArrowUp/Down) works
# - All 23 field types render correctly
# Reference: Section 5.2 Categories 1, 2

# Step 2: Implement PropertySheet component
IMPL_PS=$(bd create --title="GH#244: IMPL PropertySheet.tsx component" --type=task --priority=2 --silent)
bd dep add $IMPL_PS $TEST_P2  # ← BLOCKED until tests written
# Create: apps/web/src/systems/vibegrid/components/PropertySheet.tsx
# Create: apps/web/src/styles/vibegrid/property-sheet.css

IMPL_PS_NAV=$(bd create --title="GH#244: IMPL PropertySheet keyboard navigation" --type=task --priority=2 --silent)
bd dep add $IMPL_PS_NAV $IMPL_PS
# Integrate PropertySheetAdapter with InteractionStore
# Add: focusedFieldId to InteractionStore

# Step 3: Verify
VERIFY_P2=$(bd create --title="GH#244: VERIFY Phase 2 - PropertySheet renders and navigates" --type=task --labels=testing --silent)
bd dep add $VERIFY_P2 $IMPL_PS_NAV
# Run: pnpm test -- PropertySheet
# Execute: Section 5.4 Phase 2 Verification Gate
# Manual: Navigate to entity, click row, verify panel slides out
```

### Phase 3: VibeForm Component (TDD)

```bash
# ============================================
# PHASE 3: VIBEFORM COMPONENT (TDD Pattern)
# ============================================

# Step 1: Write VibeForm and VibeFormField tests FIRST
TEST_P3=$(bd create --title="GH#244: TEST Phase 3 - write VibeForm component tests" --type=task --priority=1 --labels=testing,tdd --silent)
bd dep add $TEST_P3 $VERIFY_P2
# Write tests for:
# - VibeForm renders with layoutConfig
# - VibeFormField auto-saves on blur
# - Long text auto-expansion
# - Error display (red border + inline message)
# Reference: Section 5.2 Categories 3, 4

# Step 2: Implement VibeForm
IMPL_VIBE_FORM=$(bd create --title="GH#244: IMPL VibeForm.tsx layout-agnostic form" --type=task --priority=2 --silent)
bd dep add $IMPL_VIBE_FORM $TEST_P3  # ← BLOCKED until tests written
# Create: apps/web/src/systems/vibegrid/components/VibeForm.tsx
# Uses: layoutConfig prop to select adapter

IMPL_VIBE_FIELD=$(bd create --title="GH#244: IMPL VibeFormField.tsx with auto-save" --type=task --priority=2 --silent)
bd dep add $IMPL_VIBE_FIELD $IMPL_VIBE_FORM
# Create: apps/web/src/systems/vibegrid/components/VibeFormField.tsx
# Integrates: EditingStore for edit lifecycle
# Implements: Auto-save on blur via TanStack DB mutation

IMPL_LONG_TEXT=$(bd create --title="GH#244: IMPL long text auto-expansion" --type=task --priority=2 --silent)
bd dep add $IMPL_LONG_TEXT $IMPL_VIBE_FIELD
# Add: CSS and logic for textarea auto-expansion

# Step 3: Verify
VERIFY_P3=$(bd create --title="GH#244: VERIFY Phase 3 - VibeForm auto-saves and expands" --type=task --labels=testing --silent)
bd dep add $VERIFY_P3 $IMPL_LONG_TEXT
# Run: pnpm test -- VibeForm
# Execute: Section 5.4 Phase 3 Verification Gate
# Manual: Edit field, blur, refresh, verify persistence
```

### Phase 4: Entity Dialog Migration (TDD)

```bash
# ============================================
# PHASE 4: ENTITY DIALOG MIGRATION (TDD Pattern)
# ============================================

# Step 1: Write migration tests FIRST
TEST_P4=$(bd create --title="GH#244: TEST Phase 4 - write dialog migration tests" --type=task --priority=1 --labels=testing,tdd --silent)
bd dep add $TEST_P4 $VERIFY_P3
# Write tests for:
# - CreateRecordDialog renders VibeForm
# - EditRecordDialog renders VibeForm
# - Validation works in dialogs
# - Zero regression to grid behavior
# Reference: Section 5.2 Category 7

# Step 2: Migrate dialogs to use VibeForm
IMPL_CREATE_DIALOG=$(bd create --title="GH#244: IMPL migrate CreateRecordDialog to VibeForm" --type=task --priority=2 --silent)
bd dep add $IMPL_CREATE_DIALOG $TEST_P4  # ← BLOCKED until tests written
# Update: apps/web/src/features/entities/components/dialogs/CreateRecordDialog.tsx
# Replace EntityForm with VibeForm (property-sheet layout)

IMPL_EDIT_DIALOG=$(bd create --title="GH#244: IMPL migrate EditRecordDialog to VibeForm" --type=task --priority=2 --silent)
bd dep add $IMPL_EDIT_DIALOG $IMPL_CREATE_DIALOG
# Update: apps/web/src/features/entities/components/dialogs/EditRecordDialog.tsx
# Replace EntityForm with VibeForm (property-sheet layout)

# Step 3: Verify
VERIFY_P4=$(bd create --title="GH#244: VERIFY Phase 4 - dialogs work, zero grid regression" --type=task --labels=testing --silent)
bd dep add $VERIFY_P4 $IMPL_EDIT_DIALOG
# Run: pnpm test -- CreateRecordDialog EditRecordDialog
# Execute: Section 5.4 Phase 4 Verification Gate
# CRITICAL: Verify grid still works (test cases 1.1-1.4 from existing behavior)
```

### Phase 5: E2E Tests & Polish

```bash
# ============================================
# PHASE 5: E2E + PERFORMANCE + RESPONSIVE
# ============================================

# E2E tests (integration - runs after components work)
E2E=$(bd create --title="GH#244: Write E2E tests for PropertySheet and VibeForm" --type=task --priority=2 --labels=testing --silent)
bd dep add $E2E $VERIFY_P4
# Create: e2e/vibegrid/property-sheet.spec.ts
# Create: e2e/vibegrid/vibe-form.spec.ts
# Reference: Section 5.5 Automated Tests table

VERIFY_E2E=$(bd create --title="GH#244: VERIFY E2E tests pass" --type=task --labels=testing --silent)
bd dep add $VERIFY_E2E $E2E

# Responsive breakpoints
IMPL_RESPONSIVE=$(bd create --title="GH#244: IMPL responsive breakpoints for PropertySheet" --type=task --priority=3 --silent)
bd dep add $IMPL_RESPONSIVE $VERIFY_P4
# Add: responsive config to LayoutConfig
# Test at: 1200px (desktop), 768px (tablet), 375px (mobile)

VERIFY_RESPONSIVE=$(bd create --title="GH#244: VERIFY responsive breakpoints" --type=task --labels=testing --silent)
bd dep add $VERIFY_RESPONSIVE $IMPL_RESPONSIVE

# Performance verification
TEST_PERF=$(bd create --title="GH#244: TEST performance thresholds" --type=task --priority=3 --labels=testing --silent)
bd dep add $TEST_PERF $VERIFY_P4
# Reference: Section 5.2 Category 8 (Performance)
# Verify: render < 100ms, edit < 50ms, save < 500ms

VERIFY_PERF=$(bd create --title="GH#244: VERIFY performance thresholds met" --type=task --labels=testing --silent)
bd dep add $VERIFY_PERF $TEST_PERF
```

### Success Criteria Verification (Stop Condition Required)

> **REQUIRED BY STOP CONDITIONS:** `test_beads_created` for each success criterion.
> Create one VERIFY task per success criterion from Section 5.6.

```bash
# ============================================
# SUCCESS CRITERIA BEADS (from Section 5.6)
# ============================================

# Create one task per success criterion row
SC_1=$(bd create --title="GH#244: SC: Property Sheet renders fields as label:value rows" --type=task --labels=testing,success-criteria --silent)
bd dep add $SC_1 $VERIFY_P2  # Depends on PropertySheet working

SC_2=$(bd create --title="GH#244: SC: Keyboard navigation works (Tab, ArrowUp/Down)" --type=task --labels=testing,success-criteria --silent)
bd dep add $SC_2 $VERIFY_P2  # Depends on navigation working

SC_3=$(bd create --title="GH#244: SC: Auto-save on blur persists changes" --type=task --labels=testing,success-criteria --silent)
bd dep add $SC_3 $VERIFY_P3  # Depends on VibeForm working

SC_4=$(bd create --title="GH#244: SC: Long text fields auto-expand vertically" --type=task --labels=testing,success-criteria --silent)
bd dep add $SC_4 $VERIFY_P3

SC_5=$(bd create --title="GH#244: SC: Responsive breakpoints match app breakpoints" --type=task --labels=testing,success-criteria --silent)
bd dep add $SC_5 $VERIFY_RESPONSIVE

SC_6=$(bd create --title="GH#244: SC: Entity Create dialog uses VibeForm" --type=task --labels=testing,success-criteria --silent)
bd dep add $SC_6 $VERIFY_P4

SC_7=$(bd create --title="GH#244: SC: Entity Edit dialog uses VibeForm" --type=task --labels=testing,success-criteria --silent)
bd dep add $SC_7 $VERIFY_P4

SC_8=$(bd create --title="GH#244: SC: Zero regression to VibeGrid table view" --type=task --labels=testing,success-criteria --silent)
bd dep add $SC_8 $VERIFY_P4  # CRITICAL - verified in Phase 4

SC_9=$(bd create --title="GH#244: SC: Performance thresholds met" --type=task --labels=testing,success-criteria --silent)
bd dep add $SC_9 $VERIFY_PERF

# All success criteria must pass for final
VERIFY_CRITERIA=$(bd create --title="GH#244: VERIFY all success criteria passed" --type=task --labels=testing --silent)
bd dep add $VERIFY_CRITERIA $SC_1
bd dep add $VERIFY_CRITERIA $SC_2
bd dep add $VERIFY_CRITERIA $SC_3
bd dep add $VERIFY_CRITERIA $SC_4
bd dep add $VERIFY_CRITERIA $SC_5
bd dep add $VERIFY_CRITERIA $SC_6
bd dep add $VERIFY_CRITERIA $SC_7
bd dep add $VERIFY_CRITERIA $SC_8
bd dep add $VERIFY_CRITERIA $SC_9
bd dep add $VERIFY_CRITERIA $VERIFY_E2E
```

### Final Demo

```bash
# ============================================
# FINAL: DEMO TO USER
# ============================================
DEMO=$(bd create --title="GH#244: DEMO to user - feature complete" --type=task --priority=1 --labels=testing --silent)
bd dep add $DEMO $VERIFY_CRITERIA
# Execute: Section 5.7 Final Demo Checklist
# - Demo Property Sheet slide-out panel
# - Demo keyboard navigation (Tab, Arrow keys)
# - Demo auto-save on blur
# - Demo long text expansion
# - Demo Create and Edit dialogs with VibeForm
# - Demo error handling
# - Verify grid still works (zero regression)
# - Take screenshot/recording as evidence
```

### Finalization Phase (Required by Stop Conditions)

> **CRITICAL:** Implementation sessions require this finalization phase.
> Stop conditions enforce: `codex_code_review`, `learning_captured`
> See implementation-mode SKILL.md Steps 6-8.

```bash
# ============================================
# FINALIZATION PHASE: CODE REVIEW + LEARNING
# ============================================

# Step 1: Codex Code Review (gate >= 70) - BLOCKING
CODEX_REVIEW=$(bd create --title="GH#244: Codex code review (>= 70)" --type=task --priority=0 --labels=review,blocking --silent)
bd dep add $CODEX_REVIEW $DEMO
# Execute: .claude/skills/codex-bridge/scripts/review-code.sh origin/staging --gate=70
# If fails: Fix violations, re-run until >= 70/100
# BLOCKING: Cannot proceed until Codex review passes

# Step 2: Typecheck + Lint
QUALITY=$(bd create --title="GH#244: Typecheck and lint pass" --type=task --priority=1 --labels=quality --silent)
bd dep add $QUALITY $CODEX_REVIEW
# Execute: pnpm typecheck && pnpm lint
# Required for: typecheck_pass stop condition

# Step 3: Commit & Push
COMMIT=$(bd create --title="GH#244: Commit and push changes" --type=task --priority=1 --labels=git --silent)
bd dep add $COMMIT $QUALITY
# Execute: git add -A && git commit && git push
# Required for: changes_committed, changes_pushed stop conditions

# Step 4: Learning Capture Agent (REQUIRED - stop hook enforced)
LEARNING=$(bd create --title="GH#244: Spawn @learning-capture agent" --type=task --priority=0 --labels=session-close,blocking --silent)
bd dep add $LEARNING $COMMIT
# SPAWN AGENT (not script):
#   Task(subagent_type="learning-capture", prompt="
#     Analyze session for GH#244.
#     1. Read .claude/sessions/issue-244/errors.jsonl
#     2. Find user corrections in session
#     3. Update .claude/rules/*.md with patterns found
#     4. Create GitHub issues for improvements
#     5. Run .claude/workflows/scripts/capture-learning.sh
#   ")
# BLOCKING: Session cannot end until learningCaptured=true in state

# Step 5: Update GitHub Issue
GITHUB=$(bd create --title="GH#244: Update GitHub issue with results" --type=task --priority=1 --labels=session-close --silent)
bd dep add $GITHUB $LEARNING
# Execute: gh issue comment 244 --body "Implementation complete..."
# Required for: github_updated stop condition

# Sync beads
bd sync
bd dep tree  # Verify dependency structure
```

### Pre-Breakdown Gates (Planning Phase)

> **NOTE:** These gates must pass BEFORE creating the beads breakdown above.
> They are part of the planning workflow, not implementation tasks.

| Gate | Command | Threshold | Phase |
|------|---------|-----------|-------|
| Codex Spec Review | `.claude/skills/codex-bridge/scripts/review-spec.sh planning/specs/244-*.md --gate=75` | >= 75/100 | review |
| Thoroughness Check | `.claude/skills/validate-spec/scripts/validate.sh planning/specs/244-*.md` | No MUST_CHANGE | review |
| Human Approval | User says "approve" | explicit | review |

**Only create beads breakdown after all gates pass.**

### TDD Dependency Graph

```
                    +------------+
                    |  BASELINE  |  ← P0: VibeGrid + EntityForm work?
                    +-----+------+
                          |
                          v
                    +-----------+
                    | TEST P1   |  ← Write LayoutAdapter tests (RED)
                    +-----+-----+
                          |
                          v
              +-----------+-----------+
              |                       |
              v                       v
        +-----------+           +-----------+
        | IMPL Types|           | IMPL      |
        |layout-types|          | Adapters  |
        +-----+-----+           +-----+-----+
              |                       |
              +-----------+-----------+
                          |
                          v
                    +-----------+
                    | VERIFY P1 |  ← Gate: Adapters + typecheck pass?
                    +-----+-----+
                          |
                          v
                    +-----------+
                    | TEST P2   |  ← Write PropertySheet tests (RED)
                    +-----+-----+
                          |
                          v
              +-----------+-----------+
              |                       |
              v                       v
        +-----------+           +-----------+
        |IMPL       |           |IMPL       |
        |PropertySht|           |PS KeyNav  |
        +-----+-----+           +-----+-----+
              |                       |
              +-----------+-----------+
                          |
                          v
                    +-----------+
                    | VERIFY P2 |  ← Gate: PropertySheet renders + navigates?
                    +-----+-----+
                          |
                          v
                    +-----------+
                    | TEST P3   |  ← Write VibeForm tests (RED)
                    +-----+-----+
                          |
                          v
        +-----------+-----------+-----------+
        |           |           |           |
        v           v           v           |
  +----------+ +----------+ +----------+    |
  |IMPL      | |IMPL      | |IMPL      |    |
  |VibeForm  | |VibeFormFld| |LongText  |    |
  +----+-----+ +----+-----+ +----+-----+    |
       |            |            |          |
       +-----+------+------------+          |
             |                              |
             v                              |
       +-----------+                        |
       | VERIFY P3 |  ← Gate: Auto-save + expand?
       +-----+-----+                        |
             |                              |
             v                              |
       +-----------+                        |
       | TEST P4   |  ← Write dialog migration tests (RED)
       +-----+-----+
             |
             v
    +--------+--------+
    |                 |
    v                 v
+----------+    +----------+
|IMPL      |    |IMPL      |
|CreateDlg |    |EditDlg   |
+----+-----+    +----+-----+
     |               |
     +-------+-------+
             |
             v
       +-----------+
       | VERIFY P4 |  ← Gate: Dialogs + zero regression?
       +-----+-----+
             |
    +--------+--------+--------+
    |        |        |        |
    v        v        v        v
+------+ +------+ +-------+ +-------+
| E2E  | |RESPNS| | PERF  | | SC_*  |
+--+---+ +--+---+ +---+---+ +---+---+
   |        |         |         |
   v        v         v         |
+------+ +------+ +-------+     |
|VRFY  | |VRFY  | |VRFY   |     |
|E2E   | |RESPNS| |PERF   |     |
+--+---+ +--+---+ +---+---+     |
   |        |         |         |
   +--------+---------+---------+
                 |
                 v
     +------------------------+
     | VERIFY ALL CRITERIA    |
     +------------------------+
                 |
                 v
     +------------------------+
     |       DEMO             |
     +------------------------+
                 |
                 v
     +------------------------+
     | FINALIZATION PHASE     |
     +------------------------+
                 |
      +----------+----------+
      |          |          |
      v          v          v
  +-------+ +-------+ +---------+
  | CODEX | |QUALITY| | COMMIT  |
  | CODE  | | check | | & PUSH  |
  | REVIEW| |       | |         |
  +---+---+ +---+---+ +----+----+
      |          |          |
      +-----+----+----------+
            |
            v
     +------------------------+
     |  LEARNING CAPTURE      |  ← BLOCKING (stop hook)
     +------------------------+
                 |
                 v
     +------------------------+
     |  UPDATE GITHUB ISSUE   |
     +------------------------+
```

### TDD Enforcement Summary

| Phase | TEST Task | IMPL Task | VERIFY Task | Gate |
|-------|-----------|-----------|-------------|------|
| P1 Layout Adapter | Write adapter tests | layout-types.ts + Adapters | Run tests, typecheck | Tests pass |
| P2 Property Sheet | Write PropertySheet tests | PropertySheet.tsx + keyboard nav | Run tests, manual nav | Renders + navigates |
| P3 VibeForm | Write VibeForm tests | VibeForm.tsx + VibeFormField + long text | Run tests, manual save | Auto-save + expand works |
| P4 Dialog Migration | Write dialog tests | CreateRecordDialog + EditRecordDialog | Run tests, verify grid | Dialogs + zero regression |
| P5 E2E | E2E spec files | (none - E2E only) | Run E2E suite | E2E pass |
| P5 Responsive | (none) | Responsive CSS | Manual at breakpoints | Layouts adapt |
| P5 Performance | Performance tests | (none) | Measure timings | < 100ms render |
| Demo | - | - | Demo to user | All SC pass |
| Finalize | Codex code review (BLOCKING) | Typecheck + lint | Commit & push | >=70 (BLOCKING), `typecheck_pass` |
| Close | - | @learning-capture agent | Update GitHub | `learning_captured` (BLOCKING), `github_updated` |

---

## 7. Decision Log

### D1: Use Existing DataForge `required` Flag for Create Flow Gating

**Decision:** Use the existing DataForge `required` field flag (not introduce new `requiredForCreate` metadata) to gate auto-create.

**Rationale:**
1. **No new metadata** - DataForge already has a `required` column on field definitions
2. **Server-side alignment** - Server `ValidationEngine` uses the same `required` flag, ensuring frontend and backend validation are consistent
3. **Simpler implementation** - Reuse existing infrastructure rather than adding metadata surface
4. **Future-proof** - If schema changes how `required` works, both frontend and backend update in lockstep

**Implementation:**
- `schema.fields.filter(f => f.required)` identifies fields needed for auto-create
- Form-level `canAutoCreate()` checks all required fields have valid values
- Same validation rules as server (`FieldTypeRegistry.validate()`)

**Learned From:** Initial spec proposed `requiredForCreate` as new metadata, but review found DataForge already has `required` - no reason to duplicate.

---

## 7. Notes

### Discovered Complexity

- **Navigation abstraction already exists**: KeyboardNavigationController uses `processedRows` and `visibleColumns` arrays, not grid positions. This means the Layout Adapter pattern can wrap existing logic rather than replacing it.
- **23 field types to support**: FieldTypeRegistry defines all field types. PropertySheet must render all of them correctly. Use ModularCellBridge pattern for consistency.
- **Y.js hooks deferred**: Design the hooks interface (`onFieldFocus`, `onFieldBlur`, `onValueChange`) now but do not implement real-time collaboration until Phase 2+.

### Open Questions

- **Section collapse**: Should PropertySheet support collapsible sections for entities with many fields? (Deferred to Phase 2 - no sections for MVP)
- **Inline table editing**: Should PropertySheet support inline editing of related entities shown as mini-tables? (Deferred - out of scope)

### Risks

- **Zero regression to grid critical**: Migrating dialogs to VibeForm could break existing grid behavior if EntityForm has side effects. Phase 4 verification explicitly checks for regression.
- **Performance with many fields**: Entities with 50+ fields may render slowly. Performance tests (Section 5.2 Category 8) gate completion.
- **CSS conflicts**: PropertySheet styles must not leak into existing grid. Use scoped CSS (`.property-sheet` prefix) and verify isolation.

### Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Component location | `systems/vibegrid/components/` | Part of VibeGrid system, not a separate feature |
| Layout selection | Via `layoutConfig` prop | Allows runtime switching, future layouts |
| Auto-save mechanism | On blur via EditingStore | Consistent with existing grid cell editing |
| Y.js integration | Hooks designed, not wired | Enables future real-time without blocking MVP |
| Store extension | Extend InteractionStore | No new store, minimal API surface |
| Create flow | Local-first with auto-create on min fields | No orphan drafts, seamless UX, local-first until viable entity (Section 2.7) |
| Validation system | VibeGrid's FieldTypeRegistry validators (not RHF) | Same stores, same validators as grid - VibeForm IS VibeGrid in different layout (Section 2.8) |
