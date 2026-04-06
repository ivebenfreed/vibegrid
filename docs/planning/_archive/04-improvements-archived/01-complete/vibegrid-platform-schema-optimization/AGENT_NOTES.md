---
initiative: vibegrid-platform-schema-optimization
type: improvement
status: complete
owner: platform-engineering
updated: 2025-12-05
completed: 2025-12-05
sessions: 2
---

# Agent Notes: Vibegrid Platform Schema Optimization

**Purpose**: Living document recording implementation discoveries.

---

## Agent Checklist

**Before starting work** (READ THIS):
- [ ] Read this entire AGENT_NOTES.md file
- [ ] Review DESIGN.md for root cause analysis
- [ ] Review IMPLEMENTATION.md for fix steps

**After each session** (UPDATE THIS):
- [ ] Add new discoveries to Implementation Discoveries
- [ ] Document any gotchas encountered
- [ ] Update common errors if you solved new ones
- [ ] Update `updated` date and `sessions` count in front matter

---

## Quick Reference

**Key Files**:
- `src/features/admin/schemas/platform-user-schema.ts` - Column definitions (needs enrichment)
- `src/systems/vibegrid/field-types/ModularCellBridge.ts:82` - Fast path check
- `src/systems/vibegrid/stores/column-generation.ts` - `enrichColumnsWithFieldTypes()` function
- `src/systems/vibegrid/coordinates/ObservableCoordinateManager.ts:66` - MobX violation

**Test Location**:
- Platform Admin Users: `/admin/users` (port 4001 on dev1 worktree)

---

## Implementation Discoveries

### Discovery 1: Two Cell Creation Paths
**Date**: 2025-12-05 (Session 1)
**Context**: Investigating console warnings

**Discovery**: ModularCellBridge has two paths:
1. **Fast path** (line 82-83): Used when `column.formatter` exists
2. **Legacy path** (line 86-93): Used otherwise, emits warning

Platform Admin columns don't have `formatter`, so they all hit the legacy path.

---

### Discovery 2: DataForge vs Custom Schemas
**Date**: 2025-12-05 (Session 1)
**Context**: Comparing Platform Admin to DataForge entities

**Discovery**: DataForge entities go through `generateColumnsFromSchema()` which:
1. Calls `enrichColumnsWithFieldTypes()`
2. Adds `fieldType`, `fieldTypeInstance`, and `formatter` to columns

Platform Admin schema is defined manually and bypasses this enrichment.

---

### Discovery 3: MobX Constructor Gotcha
**Date**: 2025-12-05 (Session 1)
**Context**: MobX strict mode violation

**Discovery**: MobX strict mode requires ALL observable mutations in actions, including:
- Constructor initialization
- Property assignments
- Even if the class uses `makeObservable()`

The fix is wrapping any observable assignment in `runInAction()`.

---

### Discovery 4: Virtual Scroll Working
**Date**: 2025-12-05 (Session 1)
**Context**: User reported scroll regression

**Discovery**: After page refresh, virtual scrolling works correctly. The initial error (`Cannot read properties of undefined (reading 'type')`) was likely a transient hot-reload state issue, not a persistent bug.

---

## Gotchas & Edge Cases

### Gotcha 1: Custom Formatters
**Problem**: `accounts` column has a custom `formatter` function

**Solution**: Verify `enrichColumnsWithFieldTypes()` preserves existing formatters before adding default one.

---

### Gotcha 2: isPrimaryField
**Problem**: `email` column has `isPrimaryField: true` which triggers entity-name field type behavior

**Solution**: Ensure enrichment handles this flag correctly - should use EntityNameFieldType.

---

## Common Errors & Solutions

### Error: `[FIELD-BRIDGE] Using legacy cell creation path`
**Cause**: Column doesn't have `formatter` property
**Solution**: Call `enrichColumnsWithFieldTypes()` before passing to Vibegrid

### Error: `[MobX] changing observable values without using an action`
**Cause**: Observable modified outside `@action` or `runInAction()`
**Solution**: Wrap assignment in `runInAction()`

---

## Session Log

### 2025-12-05 - Session 1 (Investigation)
**Agent**: Claude
**Goal**: Investigate vibegrid warnings and create improvement initiative

**Outcome**:
- Identified two separate issues (legacy path warnings + MobX violation)
- Virtual scroll working after refresh (transient issue)
- Created improvement initiative with detailed fix plan

**Key Files Analyzed**:
- ModularCellBridge.ts - Cell creation logic
- platform-user-schema.ts - Column definitions
- ObservableCoordinateManager.ts - MobX violation location

---

### 2025-12-05 - Session 2 (Implementation)
**Agent**: Claude
**Goal**: Implement the fixes

**Outcome**:
- ✅ Fixed MobX strict mode violation in `ObservableCoordinateManager.ts:66`
- ✅ Created `enrichColumnsWithFieldTypes()` function in `column-generation.ts`
- ✅ Applied enrichment to Platform User columns
- ✅ Verified: Zero legacy path warnings, zero MobX violations
- ✅ Virtual scroll still working correctly

**Key Files Changed**:
```
src/systems/vibegrid/coordinates/ObservableCoordinateManager.ts
  - Line 66: Wrapped version initialization in runInAction()

src/systems/vibegrid/stores/column-generation.ts
  - Added enrichColumnsWithFieldTypes() export function (lines 27-82)
  - Modified PlatformUser case to call enrichment (line 147)
```

**Test Results**:
- Before: ~100+ `[FIELD-BRIDGE]` warnings per page load
- After: 0 warnings
- Before: 1 MobX strict mode violation
- After: 0 violations

---

**Agent Guidelines**:
- Add discoveries immediately when you find them
- Include code examples that are copy-pasteable
- Explain WHY, not just WHAT
- Update timestamps and session count when modifying

**Template Version**: 2.0
