# Architecture Comparison: Current vs Proposed

## Current Architecture (Complex & Fragmented)

```
┌─────────────────────────────────────────────────────────────┐
│                    InteractionStore                         │
│                     (1490 lines)                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Selection State        Editing State       Focus State    │
│  ├─ selectedCells      ├─ editingCell      ├─ focusedCell  │
│  ├─ selectedRows       ├─ editValue        └─ ...          │
│  ├─ anchorCell         ├─ isEditing                        │
│  └─ selectionMode      ├─ isCancelling                     │
│                        └─ editValidation                    │
│  Hover State                                                │
│  ├─ hoveredCell        Drag State          Resize State    │
│  └─ ...                ├─ isDragging       ├─ isResizing   │
│                        └─ dragSource       └─ columnId     │
│  Menu State                                                 │
│  ├─ headerMenu         Clipboard State                     │
│  ├─ contextMenu        ├─ clipboard                        │
│  ├─ visibilityMenu     └─ copiedCells                      │
│  └─ groupMenu                                               │
│                                                             │
│  PROBLEMS:                                                  │
│  • 8+ different concerns in one store                      │
│  • Editing state duplicated with EditSessionManager        │
│  • Hard to test in isolation                               │
│  • Changes to editing affect everything else               │
└─────────────────────────────────────────────────────────────┘
                            ↕ (circular dependency)
┌─────────────────────────────────────────────────────────────┐
│                   EditSessionManager                        │
│                      (292 lines)                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  currentSession: {                                          │
│    cellId: string              ← DUPLICATE: editingCell    │
│    originalValue: any                                       │
│    pendingValue: any           ← DUPLICATE: editValue      │
│    validation: EditValidation  ← DUPLICATE: editValidation │
│  }                                                          │
│                                                             │
│  Methods:                                                   │
│  ├─ start(cellId, column)                                  │
│  ├─ updateValue(value)                                     │
│  ├─ commit(reason)                                         │
│  └─ cancel(reason)                                         │
│                                                             │
│  PROBLEMS:                                                  │
│  • Duplicate state with InteractionStore                   │
│  • Must sync 2 sources of truth                            │
│  • Unclear which is authoritative                          │
│  • Race conditions (Issue #7)                              │
└─────────────────────────────────────────────────────────────┘
                            ↕
┌─────────────────────────────────────────────────────────────┐
│              KeyboardNavigationController                   │
│                      (306 lines)                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  handleKeyDown(event)                                       │
│    ├─ Check: isEditing? (from InteractionStore)           │
│    ├─ If editing: delegates to editor components          │
│    └─ If not: handles arrow keys                          │
│                                                             │
│  PROBLEMS:                                                  │
│  • Keyboard logic spread across 5+ files                   │
│  • Edit mode keys: handled in editor components            │
│  • Navigation keys: handled here                           │
│  • No centralized keyboard routing                         │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│           Individual Editor Components                      │
│   (NumberEditor, TextEditor, DateEditor, etc.)              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Each editor has its own:                                   │
│  • Enter key handler → calls editSessionManager.commit()   │
│  • Escape key handler → calls editSessionManager.cancel()  │
│  • Tab key handler → calls editSessionManager.commit()     │
│                                                             │
│  PROBLEMS:                                                  │
│  • Duplicated key handling across 10+ editors              │
│  • Inconsistent behavior (Issue #7: Number field broken)   │
│  • Hard to add global keyboard shortcuts                   │
└─────────────────────────────────────────────────────────────┘
```

**Total Complexity:**
- **5+ files** to understand keyboard behavior
- **2 sources of truth** for editing state
- **1490 lines** in monolithic InteractionStore
- **Circular dependencies** between stores
- **2 active bugs** (Issues #6, #7)

---

## Proposed Architecture (Clean & Focused)

```
┌─────────────────────────────────────────────────────────────┐
│                     SelectionStore                          │
│              (renamed InteractionStore)                     │
│                      (900 lines)                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Selection State        Focus State        Hover State     │
│  ├─ selectedCells      ├─ focusedCell      ├─ hoveredCell  │
│  ├─ selectedRows       └─ ...              └─ ...          │
│  ├─ anchorCell                                              │
│  └─ selectionMode                                           │
│                                                             │
│  Drag State            Resize State        Menu State      │
│  ├─ isDragging         ├─ isResizing       ├─ headerMenu   │
│  └─ dragSource         └─ columnId         ├─ contextMenu  │
│                                            └─ ...           │
│  Clipboard State                                            │
│  ├─ clipboard                                               │
│  └─ copiedCells                                             │
│                                                             │
│  BENEFITS:                                                  │
│  ✅ Focused on selection & UI interactions                  │
│  ✅ No editing logic (moved to EditingStore)                │
│  ✅ ~590 lines removed                                      │
│  ✅ Easier to test & maintain                               │
└─────────────────────────────────────────────────────────────┘
                            ↓ (one-way dependency)

┌─────────────────────────────────────────────────────────────┐
│                      EditingStore                           │
│          (NEW: merged EditSessionManager)                   │
│                      (400 lines)                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Single Source of Truth:                                    │
│  ├─ currentSession: EditSession | null                      │
│  │   ├─ cellId: string                                     │
│  │   ├─ column: Column                                     │
│  │   ├─ originalValue: any                                 │
│  │   ├─ pendingValue: any                                  │
│  │   └─ validation: EditValidation | null                  │
│  │                                                          │
│  └─ sessionReady: boolean  ← FIX Issue #7                  │
│                                                             │
│  Computed State (derived from currentSession):             │
│  ├─ @computed editingCell: string | null                   │
│  ├─ @computed editValue: any                               │
│  ├─ @computed isEditing: boolean                           │
│  └─ @computed editValidation: EditValidation | null        │
│                                                             │
│  Lifecycle Methods:                                         │
│  ├─ @action startSession(cellId, column)                   │
│  ├─ @action updatePendingValue(value)                      │
│  ├─ @action commitSession(reason)                          │
│  └─ @action cancelSession(reason)                          │
│                                                             │
│  Event Handlers:                                            │
│  ├─ @action handleOutsideClick(target)  ← FIX Issue #6     │
│  └─ @action handleBlur(reason, policy)                     │
│                                                             │
│  Dependencies (one-way):                                    │
│  ├─ TableCoreStore (read fresh values)                     │
│  └─ VisualStateStore (read column config)                  │
│                                                             │
│  BENEFITS:                                                  │
│  ✅ Single source of truth (no duplicate state)             │
│  ✅ Complete edit lifecycle in one place                    │
│  ✅ Outside click handling (fixes Issue #6)                 │
│  ✅ Session initialization check (fixes Issue #7)           │
│  ✅ No circular dependencies                                │
│  ✅ Easy to test in isolation                               │
└─────────────────────────────────────────────────────────────┘
                            ↑
                            │
┌─────────────────────────────────────────────────────────────┐
│                   KeyboardController                        │
│            (NEW: centralized routing)                       │
│                      (150 lines)                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Single Entry Point:                                        │
│  handleKeyDown(event: KeyboardEvent): boolean               │
│    │                                                        │
│    ├─ if (editingStore.isEditing)                          │
│    │   └─ handleEditModeKey(event)                         │
│    │       ├─ Enter → editingStore.commitSession('enter')  │
│    │       ├─ Escape → editingStore.cancelSession('escape')│
│    │       └─ Tab → commit + navigate to next cell         │
│    │                                                        │
│    └─ else                                                  │
│        └─ handleNavigationModeKey(event)                   │
│            ├─ Arrow keys → navigate & select               │
│            ├─ Shift+Arrow → extend selection               │
│            └─ Ctrl+A → select all                          │
│                                                             │
│  Dependencies:                                              │
│  ├─ EditingStore (check isEditing, commit/cancel)          │
│  ├─ SelectionStore (make selections)                       │
│  └─ KeyboardNavigationController (arrow key logic)         │
│                                                             │
│  BENEFITS:                                                  │
│  ✅ All keyboard logic in ONE file                          │
│  ✅ Clear mode separation (edit vs navigation)              │
│  ✅ Easy to add new shortcuts                               │
│  ✅ Easy to debug (single entry point)                      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│         KeyboardNavigationController (simplified)           │
│                      (200 lines)                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Focused on Navigation Only:                                │
│  ├─ handleArrowKey(direction, isShift)                     │
│  ├─ handleTabNavigation(isShift)                           │
│  ├─ selectKeyboardRange(start, end)                        │
│  └─ scrollCellIntoView(rowId, columnId)                    │
│                                                             │
│  BENEFITS:                                                  │
│  ✅ No edit mode logic (moved to KeyboardController)        │
│  ✅ ~100 lines removed                                      │
│  ✅ Focused responsibility                                  │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│           Individual Editor Components                      │
│            (simplified - no key handling)                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Each editor ONLY handles:                                  │
│  • Rendering the input/control                             │
│  • Value updates (calls editingStore.updatePendingValue()) │
│                                                             │
│  Key handling delegated to KeyboardController               │
│                                                             │
│  BENEFITS:                                                  │
│  ✅ No duplicate key handling code                          │
│  ✅ Consistent behavior across all editors                  │
│  ✅ Simpler editor components                               │
└─────────────────────────────────────────────────────────────┘
```

**New Complexity:**
- **1 file** to understand keyboard behavior (KeyboardController)
- **1 source of truth** for editing state (EditingStore)
- **900 lines** in focused SelectionStore (was 1490)
- **No circular dependencies**
- **0 active bugs** (Issues #6, #7 fixed)

---

## Comparison

| Metric | Current | Proposed | Change |
|--------|---------|----------|--------|
| **Files for keyboard behavior** | 5+ | 1 | ✅ -80% |
| **Sources of truth (editing)** | 2 | 1 | ✅ -50% |
| **InteractionStore lines** | 1490 | 900 | ✅ -590 |
| **EditSessionManager lines** | 292 | 0 (merged) | ✅ -292 |
| **New EditingStore lines** | 0 | 400 | +400 |
| **New KeyboardController lines** | 0 | 150 | +150 |
| **Total lines** | 2088 | 1450 | ✅ -638 |
| **Active bugs** | 2 | 0 | ✅ -100% |
| **Circular dependencies** | Yes | No | ✅ Fixed |
| **Testability** | Low | High | ✅ Improved |

## Data Flow Comparison

### Current (Circular Dependencies)

```
User presses Enter
  ↓
NumberEditor.onKeyDown()
  ↓
editSessionManager.commit()
  ↓
interactionStore.saveEdit()
  ↓
tableCoreStore.updateCell()
  ↓
interactionStore.editingCell = null  ← Circular back
  ↓
EditSessionManager must sync ← Circular dependency
```

### Proposed (Unidirectional Flow)

```
User presses Enter
  ↓
KeyboardController.handleKeyDown()
  ↓
editingStore.commitSession()
  ├─ Save to tableCoreStore
  └─ Clear currentSession (isEditing = false)
      ↓
      EditingOverlayController (observes isEditing)
      └─ Hides overlay
```

**Benefits:**
- ✅ No circular dependencies
- ✅ Clear, unidirectional flow
- ✅ Easy to trace
- ✅ Easier to test

---

## Migration Path

### Phase 1: Extract EditingStore (Parallel)
```
InteractionStore (1490 lines)
  ├─ Keep: selection, focus, hover, drag, resize, menus, clipboard
  └─ Extract: editing state → NEW EditingStore

EditSessionManager (292 lines)
  └─ Keep (temporarily)

Result: No breaking changes, both systems work in parallel
```

### Phase 2: Merge EditSessionManager
```
EditingStore
  ├─ Absorb EditSessionManager state
  └─ Absorb EditSessionManager methods

DELETE: EditSessionManager (292 lines)

Result: Single source of truth, EditSessionManager references updated
```

### Phase 3: Centralize Keyboard
```
NEW: KeyboardController
  ├─ Route edit mode keys
  └─ Route navigation keys

Update: Editor components (remove key handlers)

Result: Single entry point for all keyboard events
```

### Phase 4: Fix Bugs
```
EditingStore
  ├─ Add handleOutsideClick() → Fix Issue #6
  └─ Add sessionReady flag → Fix Issue #7

Result: Both bugs fixed, regression tests added
```

**Each phase is incremental and reversible**

---

## Conclusion

The proposed architecture:
- ✅ **Reduces complexity** (-638 lines)
- ✅ **Fixes bugs** (Issues #6, #7)
- ✅ **Improves clarity** (single source of truth)
- ✅ **Enhances testability** (isolated stores)
- ✅ **Removes circular dependencies**
- ✅ **Centralizes keyboard handling**
- ✅ **Low migration risk** (incremental steps)

**Recommendation:** Proceed with refactor in the order outlined above.
