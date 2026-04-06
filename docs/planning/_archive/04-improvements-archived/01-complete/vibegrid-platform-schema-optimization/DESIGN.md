---
initiative: vibegrid-platform-schema-optimization
type: improvement
status: complete
owner: platform-engineering
document: design
version: 1.0
updated: 2025-12-05
---

# Design: Vibegrid Platform Schema Optimization

## Root Cause Analysis

### Issue 1: Legacy Cell Creation Path Warnings

**Location**: `src/systems/vibegrid/field-types/ModularCellBridge.ts:82-93`

**Flow**:
```
ModularCellBridge.createCell()
  ├── if (column.formatter) → createCellFast() ✅ Fast path
  └── else → Legacy path + warning ⚠️
```

**Why Platform Admin hits legacy path**:
- `platformUserColumns` in `src/features/admin/schemas/platform-user-schema.ts` defines columns with `cellType` but NOT `formatter`
- The `formatter` property is only added by `enrichColumnsWithFieldTypes()` in `column-generation.ts`
- Platform Admin doesn't call this enrichment function

**DataForge comparison**:
- DataForge entities go through `generateColumnsFromSchema()` which calls `enrichColumnsWithFieldTypes()`
- This adds `fieldType`, `fieldTypeInstance`, and `formatter` to each column
- Those columns then use the fast path

### Issue 2: MobX Strict Mode Violation

**Location**: `src/systems/vibegrid/coordinates/ObservableCoordinateManager.ts:66`

**Code**:
```typescript
constructor(tableCoreStore: TableCoreStore) {
  // ...
  this.version = this.coordinator.getVersion()  // ❌ Outside action
}
```

**Why this fails**:
- MobX strict mode (`enforceActions: 'always'`) requires all observable mutations inside `@action` or `runInAction()`
- Constructor initialization of `this.version` happens outside an action
- The listener at line 60-62 correctly uses `runInAction()`, but initial assignment doesn't

---

## Solution Design

### Fix 1: Enrich Platform User Columns

**Option A (Recommended)**: Call `enrichColumnsWithFieldTypes()` when loading Platform Admin schema

**Where**: In `UsersPage.tsx` or wherever `platformUserColumns` is consumed by Vibegrid

**Pattern**:
```typescript
import { enrichColumnsWithFieldTypes } from '@/systems/vibegrid/stores/column-generation'

// Before passing to Vibegrid
const enrichedColumns = enrichColumnsWithFieldTypes(platformUserColumns)
```

**Option B**: Add `fieldType` directly to schema definition (more verbose, harder to maintain)

### Fix 2: Wrap Constructor Assignment in runInAction

**Location**: `src/systems/vibegrid/coordinates/ObservableCoordinateManager.ts:66`

**Change**:
```typescript
// Before
this.version = this.coordinator.getVersion()

// After
runInAction(() => {
  this.version = this.coordinator.getVersion()
})
```

---

## Contracts

### enrichColumnsWithFieldTypes()

**Input**: `Column[]` - Raw columns with `cellType`
**Output**: `EnhancedColumn[]` - Columns with `fieldType`, `fieldTypeInstance`, `formatter`

**Preserves**:
- Custom `formatter` if already defined (e.g., `accounts` column)
- All other column properties

---

## Risks

### Risk 1: Custom Formatters Overwritten
**Mitigation**: `enrichColumnsWithFieldTypes()` checks for existing formatter before adding

### Risk 2: Type Mismatches
**Mitigation**: Platform schema already uses compatible `cellType` values
