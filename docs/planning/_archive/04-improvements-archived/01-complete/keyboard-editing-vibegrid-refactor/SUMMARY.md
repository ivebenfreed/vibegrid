# Vibegrid Editing State & Keyboard Handling Refactor Summary

## Core Problems

### 1. **Overlapping State Ownership**

Two classes manage the same editing state:

| Concern | EditSessionManager | InteractionStore |
|---------|-------------------|------------------|
| Current cell | `currentSession.cellId` | `editingCell` |
| Current value | `currentSession.pendingValue` | `editValue` |
| Original value | `currentSession.originalValue` | ❌ |
| Validation | `currentSession.validation` | `editValidation` |
| Is editing? | `currentSession !== null` | `isEditing` |

**Result:** Sync bugs, unclear ownership, ~300 lines of duplicate logic

### 2. **Monolithic InteractionStore**

**1490 lines** handling 8+ concerns:
- ✅ Selection (should stay)
- ✅ Focus (should stay)
- ❌ **Editing** (extract to EditingStore)
- ✅ Hover (should stay)
- ✅ Drag & drop (should stay)
- ✅ Column resize (should stay)
- ✅ Menus (should stay)
- ✅ Clipboard (should stay)

**InteractionStore should focus on user interactions (clicks, drags), not edit lifecycle**

### 3. **Fragmented Keyboard Handling**

To understand "What happens when user presses Enter while editing?":

1. Read `KeyboardNavigationController.handleKeyDown()` (checks `isEditing`)
2. Read `EditingOverlayController` (editor-specific Enter handler)
3. Read `NumberEditor.tsx` (calls `onCommit`)
4. Read `EditSessionManager.commit()` (validates & saves)
5. Read `InteractionStore.saveEdit()` (updates state)

**5 files to understand 1 keypress!**

### 4. **Active Bugs**

**Issue #6:** Dropdown editors stay open when clicking elsewhere
- Cause: Edit session doesn't handle outside clicks properly
- Missing: Outside click → cancel edit session

**Issue #7:** Number field Enter shows warning `commit() called but no active session`
- Cause: Enter key commits before session initialized
- Race condition between `startEdit()` and `commit()`

## Proposed Solution

### Architecture Before

```
InteractionStore (1490 lines)
  ├── Selection state ✅
  ├── Editing state ❌ (duplicate with EditSessionManager)
  ├── Focus state ✅
  └── 6 other concerns ✅

EditSessionManager (292 lines)
  └── Editing state ❌ (duplicate with InteractionStore)

KeyboardNavigationController (306 lines)
  └── Routing logic spread across multiple files
```

### Architecture After

```
SelectionStore (900 lines)  ← Renamed InteractionStore
  ├── Selection state ✅
  ├── Focus state ✅
  └── Other interactions ✅

EditingStore (400 lines)  ← NEW (merge EditSessionManager + InteractionStore editing)
  ├── currentSession: EditSession
  ├── startSession() / commitSession() / cancelSession()
  ├── handleOutsideClick() ← FIX Issue #6
  └── handleBlur() with blur policies

KeyboardController (150 lines)  ← NEW (centralize routing)
  ├── handleKeyDown() ← Single entry point
  ├── handleEditModeKey() ← Enter/Escape/Tab
  └── handleNavigationModeKey() ← Arrow keys
```

## Key Changes

### 1. Extract EditingStore

**Move from InteractionStore to EditingStore:**
- `editingCell`, `editValue`, `isEditing`, `isCancelling`, `editValidation`
- `startEdit()`, `saveEdit()`, `cancelEdit()`, `updateEditValue()`

**Result:**
- InteractionStore: 1490 → 900 lines
- Single source of truth for editing

### 2. Merge EditSessionManager

**Instead of 2 classes with duplicate state:**
```typescript
// Before: EditSessionManager
currentSession: {
  cellId: string
  originalValue: any
  pendingValue: any
  validation: EditValidation | null
}

// Before: InteractionStore
editingCell: string | null
editValue: any
editValidation: EditValidation | null
```

**After: EditingStore (single source of truth):**
```typescript
currentSession: EditSession | null

@computed get editingCell(): string | null {
  return this.currentSession?.cellId ?? null
}

@computed get isEditing(): boolean {
  return this.currentSession !== null
}
```

**Result:**
- No sync issues
- EditSessionManager deleted (292 lines removed)
- EditingStore owns complete lifecycle

### 3. Centralize Keyboard Handling

**Single KeyboardController routes to:**
```typescript
handleKeyDown(event: KeyboardEvent): boolean {
  if (this.editingStore.isEditing) {
    // Edit mode: Enter/Escape/Tab
    return this.handleEditModeKey(event)
  } else {
    // Navigation mode: Arrows/Shift
    return this.handleNavigationModeKey(event)
  }
}
```

**Result:**
- 1 file to understand keyboard behavior
- Clear mode separation
- Easy to add shortcuts

### 4. Fix Bugs

**Issue #6 Fix:**
```typescript
// EditingStore
@action handleOutsideClick(target: HTMLElement): void {
  if (!this.isEditingOverlay(target)) {
    const policy = this.getBlurPolicyForCurrentField()
    if (policy === 'commit') this.commitSession('outside-click')
    else if (policy === 'cancel') this.cancelSession('outside-click')
  }
}
```

**Issue #7 Fix:**
```typescript
// EditingStore
private sessionReady: boolean = false

@action startSession(cellId: string, column: any): void {
  // ... initialize session ...
  this.sessionReady = true
}

@action commitSession(reason: CommitReason): void {
  if (!this.sessionReady) {
    // Defer until session ready
    setTimeout(() => this.commitSession(reason), 0)
    return
  }
  // ... commit logic ...
}
```

## Benefits

### Code Quality
- **-732 lines:** 1490 + 292 → 900 + 400 + 150
- **Clear ownership:** No duplicate state
- **Better testability:** Each store isolated

### Bug Fixes
- ✅ Dropdown editors close on outside click (Issue #6)
- ✅ Number field Enter works without warnings (Issue #7)

### Developer Experience
- **Keyboard:** 1 file vs 5 files
- **Editing:** 1 file vs 2 files
- **Debugging:** Clear state ownership

### Architecture
- **Unidirectional dependencies:**
  ```
  EditingStore → TableCoreStore (read values)
                → VisualStateStore (read columns)

  KeyboardController → EditingStore (edit mode)
                      → SelectionStore (navigation)
  ```
- **No circular dependencies**
- **Easier to extend** (add new keyboard shortcuts, field types)

## Implementation Steps

1. **Extract EditingStore** (4-6 hours)
   - Move editing state from InteractionStore
   - Update all references

2. **Merge EditSessionManager** (3-4 hours)
   - Consolidate state into EditingStore
   - Delete EditSessionManager

3. **Create KeyboardController** (3-4 hours)
   - Centralize keyboard routing
   - Add edit vs navigation mode logic

4. **Fix Bugs** (2-3 hours)
   - Outside click handler (Issue #6)
   - Session initialization check (Issue #7)

5. **Test & Validate** (2-3 hours)
   - Manual testing all field types
   - Regression tests
   - Type checking

**Total: 14-20 hours (2-3 days)**

## Risk Assessment

### Low Risk
- ✅ Changes are mostly **moves** not rewrites
- ✅ Clear boundaries (editing vs selection vs keyboard)
- ✅ Testable in isolation
- ✅ No changes to overlay rendering logic

### Migration Path
1. Create EditingStore (parallel to existing)
2. Update consumers one by one
3. Delete old code when all migrated
4. **Incremental, reversible steps**

## Recommendation

✅ **Proceed with this refactor**

**Why:**
1. Fixes 2 active bugs (Issues #6 and #7)
2. Reduces complexity (~700 lines removed)
3. Improves architecture (clear ownership)
4. Low risk (mostly code moves)
5. Sets up cleaner base for Phase 2 overlay controller split

**Order:** Do this editing refactor **before** the OverlayManager controller split from the main refactor plan. EditingOverlayController will have a cleaner EditingStore API to work with.
