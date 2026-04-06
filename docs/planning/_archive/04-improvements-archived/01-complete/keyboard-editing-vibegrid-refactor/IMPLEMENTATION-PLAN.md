# Session Plan: Vibegrid Editing State & Keyboard Handling Refactor

## Status: Ready to Implement

**Last Updated:** 2025-11-26

This refactor addresses the remaining editing state and keyboard handling issues after Phase 2-6 refactor completion.

## Critical Issues to Fix

### 1. **Dual Editing Sources** (State Desync)
- Keyboard Enter → `InteractionStore.startEdit()` (no session)
- Click → `EditSessionManager.start()` (creates session)
- Result: "commit() called but no active session" warning

### 2. **Container-Focused Keyboard Binding**
- Binds keydown only to grid container
- Editor focus → navigation shortcuts stop
- Ctrl/Cmd shortcuts steal from editor

### 3. **Inconsistent Value Lookup**
- Keyboard: `row[columnId]`
- Click: `row.data[field]`
- Result: Wrong initial values, especially for nested data

### 4. **No Outside-Click Handling**
- Blur policies defined but never invoked
- Dropdown editors stay open

### 5. **Async Race Conditions**
- State cleared before async save completes
- Double-commit/commit-after-cancel warnings

### 6. **Focus Loss After Commit** (NEW)
- Cancel handler restores focus with `container.focus()`
- Commit path missing focus restoration
- Keyboard navigation breaks after Enter/Tab/blur

### 7. **Focus Assumptions**
- No recovery when focused cell hidden/filtered
- Keyboard navigation breaks until click

**See:** `planning/active/keyboard-editing-vibegrid-refactor/DETAILED-ISSUES.md` for full analysis

---

## Implementation Plan

### Phase 1: Extract EditingStore ⏳

**Goal:** Single source of truth for editing state

**Tasks:**
- [ ] Create `src/systems/vibegrid/stores/EditingStore.ts`
  - [ ] Observable: `currentSession: EditSession | null`
  - [ ] Observable: `sessionReady: boolean`
  - [ ] Computed: `editingCell`, `isEditing`, `editValue`
  - [ ] Action: `startEdit(cellId, column)` - consistent value lookup
  - [ ] Action: `commitEdit(reason)` - with session ready check
  - [ ] Action: `cancelEdit(reason)`
  - [ ] Action: `handleOutsideClick(target)` - with blur policy

- [ ] Update `InteractionStore.ts`
  - [ ] Remove: `editingCell`, `editValue`, `isEditing`, `isCancelling`, `editValidation`
  - [ ] Remove: `startEdit()`, `saveEdit()`, `cancelEdit()`, `updateEditValue()`
  - [ ] Keep: Selection, focus, hover, drag, resize, menus, clipboard

- [ ] Update `src/systems/vibegrid/stores/context.ts`
  - [ ] Add EditingStore to context
  - [ ] Wire dependencies

**Expected reduction:** InteractionStore: 1490 → ~900 lines

---

### Phase 2: Merge EditSessionManager ⏳

**Goal:** Consolidate edit lifecycle into EditingStore

**Tasks:**
- [ ] Move blur policy logic from EditSessionManager to EditingStore
  - [ ] `getBlurPolicy(column): BlurPolicy`
  - [ ] `handleBlur(reason, policy)`

- [ ] Delete `src/systems/vibegrid/services/EditSessionManager.ts`

- [ ] Update consumers to use EditingStore:
  - [ ] `KeyboardNavigationController.ts` → Call `editingStore.startEdit()`
  - [ ] `EditingOverlayController.ts` → Read from `editingStore.currentSession`
  - [ ] All commit/cancel calls → `editingStore.commitEdit()` / `cancelEdit()`

- [ ] Fix value lookup consistency:
  - [ ] Ensure all paths use `column.field` + `row.data[field]`
  - [ ] Update KeyboardNavigationController Enter handler

**Expected reduction:** 292 lines removed (EditSessionManager deleted)

---

### Phase 3: Document-Level Keyboard ⏳

**Goal:** Centralized keyboard handling that survives focus changes

**Tasks:**
- [ ] Create `src/systems/vibegrid/controllers/KeyboardController.ts`
  - [ ] Document-level listener with capture phase
  - [ ] `isEventForGrid(event)` - check if event is for this grid
  - [ ] `handleEditModeKey(event)` - Route edit keys (Enter, Escape, Tab)
  - [ ] `handleNavigationModeKey(event)` - Route navigation keys
  - [ ] `isNativeEditorShortcut(event)` - Allow Ctrl+C, Ctrl+V, etc.

- [ ] Wire outside click handling:
  - [ ] Add document click listener
  - [ ] Call `editingStore.handleOutsideClick(event.target)`

- [ ] Update `VibeGrid.tsx`:
  - [ ] Replace container-focused keyboard binding
  - [ ] Use KeyboardController as single entry point

**Expected addition:** ~150 lines (KeyboardController)

---

### Phase 4: Focus Restoration After Commit ⏳

**Goal:** Restore keyboard focus to grid container after edit commits (fixes Issue #6)

**Tasks:**
- [ ] Update `OverlayManager.ts` onCommit callback:
  - [ ] Add `this.container.focus()` after `editingStore.commitEdit()`
  - [ ] Match the behavior of Escape key handler

- [ ] Update `OverlayManager.ts` onCancel callback:
  - [ ] Add `this.container.focus()` after `editingStore.cancelEdit()`
  - [ ] Ensure consistency with keyboard cancel path

**Expected addition:** ~2 lines

---

### Phase 5: Focus Recovery ⏳

**Goal:** Handle invalid focus after config changes (fixes Issue #7)

**Tasks:**
- [ ] Update `KeyboardNavigationController.handleArrowKey()`:
  - [ ] Validate focusedCell exists in processedRows/visibleColumns
  - [ ] If invalid, call `recoverFocus()`
  - [ ] Log warning for debugging

- [ ] Implement `recoverFocus()`:
  - [ ] Focus first visible cell
  - [ ] Set selection
  - [ ] Clear anchor

**Expected addition:** ~30 lines

---

### Phase 6: Testing ⏳

**Required regression tests:**

- [ ] **Test (a):** Keyboard Enter on row.data field starts edit with correct value
  ```typescript
  // Column: { id: 'assignee', field: 'user_id' }
  // Press Enter on cell
  // Assert: editValue === row.data['user_id'], not row['assignee']
  ```

- [ ] **Test (b):** Outside-click blur policy commit/cancel
  ```typescript
  // Start editing dropdown
  // Click outside
  // Assert: Session committed/cancelled based on blur policy
  // Assert: Dropdown closed
  ```

- [ ] **Test (c):** Double-commit logs once, no warning
  ```typescript
  // Start edit
  // Call commit() twice rapidly
  // Assert: Only one commit, no "no active session" warning
  ```

- [ ] **Test (d):** Commit-after-cancel doesn't warn
  ```typescript
  // Start edit
  // Call commit() (async save starts)
  // Call cancel() during async
  // Assert: No "commit() called but no active session"
  ```

- [ ] **Test (e):** Focus restored after commit
  ```typescript
  // Start editing a cell
  // Press Enter to commit
  // Assert: Container has focus
  // Assert: Arrow keys work immediately (Issue #6 fixed)
  ```

- [ ] **Test (f):** Navigation after hiding focused column recovers
  ```typescript
  // Focus cell in column A
  // Hide column A
  // Press arrow key
  // Assert: Focus recovered to first visible cell
  // Assert: Navigation works (Issue #7 fixed)
  ```

- [ ] **Test (g):** Native editor shortcuts work
  ```typescript
  // Start editing
  // Press Ctrl+C (copy)
  // Assert: Editor handles it, not grid
  ```

- [ ] **Test (h):** Grid shortcuts blocked during editing
  ```typescript
  // Start editing
  // Press Ctrl+A (select all)
  // Assert: Editor handles it, grid doesn't select all cells
  ```

**Files:**
- NEW: `src/systems/vibegrid/stores/__tests__/EditingStore.test.ts`
- NEW: `src/systems/vibegrid/controllers/__tests__/KeyboardController.test.ts`

---

## Files Modified Summary

### New Files
- ✅ `src/systems/vibegrid/stores/EditingStore.ts` (~400 lines)
- ✅ `src/systems/vibegrid/controllers/KeyboardController.ts` (~150 lines)
- ✅ `src/systems/vibegrid/stores/__tests__/EditingStore.test.ts`
- ✅ `src/systems/vibegrid/controllers/__tests__/KeyboardController.test.ts`

### Deleted Files
- ❌ `src/systems/vibegrid/services/EditSessionManager.ts` (292 lines removed)

### Modified Files
- 🔧 `src/systems/vibegrid/stores/InteractionStore.ts` (remove editing state, ~590 lines removed)
- 🔧 `src/systems/vibegrid/stores/context.ts` (add EditingStore)
- 🔧 `src/systems/vibegrid/renderers/modules/KeyboardNavigationController.ts` (use EditingStore, add focus recovery)
- 🔧 `src/systems/vibegrid/renderers/modules/controllers/EditingOverlayController.ts` (use EditingStore)
- 🔧 `src/systems/vibegrid/VibeGrid.tsx` (use KeyboardController)

---

## Success Criteria

### Bugs Fixed
- [ ] **Issue #4:** Dropdown editors stay open when clicking elsewhere
  - ✅ Outside click handler wired to EditingStore
  - ✅ Blur policy invoked correctly

- [ ] **Issue #1:** "commit() called but no active session" warnings
  - ✅ Single entry point (no dual sources)
  - ✅ Session ready check prevents race

- [ ] **Issue #6:** Keyboard focus lost after committing edits
  - ✅ Container focus restored in onCommit callback
  - ✅ Arrow keys work immediately after Enter/Tab/blur

### Code Quality
- [ ] All 8 regression tests pass
- [ ] Type checking passes: `pnpm typecheck`
- [ ] Linting passes: `pnpm check`
- [ ] No console warnings during manual testing

### Architecture
- [ ] Single source of truth for editing (EditingStore)
- [ ] No circular dependencies
- [ ] Clear ownership (EditingStore owns edit lifecycle)
- [ ] Keyboard handling centralized (KeyboardController)

### User Experience
- [ ] Keyboard Enter and Click start edit with same value
- [ ] Native editor shortcuts (Ctrl+C, Ctrl+V) work
- [ ] Grid navigation survives focus changes
- [ ] Focus recovers after column hide/filter
- [ ] No unexpected warnings in console

---

## Timeline

**Total: 16-23 hours (2-3 days)**

| Phase | Estimate | Status |
|-------|----------|--------|
| Phase 1: Extract EditingStore | 4-6 hours | ⏳ Pending |
| Phase 2: Merge EditSessionManager | 3-4 hours | ⏳ Pending |
| Phase 3: Document-Level Keyboard | 3-4 hours | ⏳ Pending |
| Phase 4: Focus Restoration After Commit | 1-2 hours | ⏳ Pending |
| Phase 5: Focus Recovery | 2-3 hours | ⏳ Pending |
| Phase 6: Testing | 3-4 hours | ⏳ Pending |

---

## Next Steps

1. **Start with Phase 1:** Extract EditingStore
   - Create the new store with all editing state
   - Ensure consistent value lookup (always use `column.field` + `row.data[field]`)
   - Add session ready check

2. **Then Phase 2:** Merge EditSessionManager
   - Move blur policy logic
   - Update all consumers
   - Delete EditSessionManager

3. **Then Phase 3:** Document-level keyboard
   - Centralize keyboard routing
   - Wire outside click
   - Allow native shortcuts

4. **Then Phase 4:** Focus restoration after commit
   - Add container.focus() to onCommit callback
   - Ensure consistency with cancel path

5. **Then Phase 5:** Focus recovery
   - Add validation
   - Implement recovery

6. **Finally Phase 6:** Testing
   - Write all 8 tests
   - Manual testing
   - Verify no regressions

---

## References

- **Detailed Issues:** `sessions/2025-11-26/session-11/detailed-issues.md`
- **Architecture Comparison:** `sessions/2025-11-26/session-11/architecture-comparison.md`
- **Summary:** `sessions/2025-11-26/session-11/editing-keyboard-refactor-summary.md`
- **Original Refactor Plan:** `planning/active/vibegrid-complexity-refactor/`
- **Known Issues:** `planning/active/vibegrid-complexity-refactor/ISSUES.md`
