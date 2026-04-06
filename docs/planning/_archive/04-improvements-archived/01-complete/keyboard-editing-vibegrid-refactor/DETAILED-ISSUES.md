# Vibegrid Editing & Keyboard - Detailed Issues from Code Review

## Critical Issues Identified (7 Total)

### 1. Dual Editing Sources (State Desync)

**Problem:** Two independent entry points can invoke editing state:

**Path 1: Direct InteractionStore (Keyboard Enter)**
```typescript
// KeyboardNavigationController.ts:200-236
case 'Enter':
  if (!isEditing) {
    // Pulls value: row[columnId]
    const currentValue = row[columnId]
    this.interactionStore.startEdit(cellId, currentValue)
  }
```

**Path 2: Via EditSessionManager (Click)**
```typescript
// EditSessionManager.start()
const processedRows = this.tableCoreStore.processedRows
const foundRow = processedRows.find((r: any) => r.id === rowId)
const field = column.field || columnId
const data = foundRow?.data || foundRow
// Pulls value: row.data[field] with untracked processed rows
const currentValue = data ? data[field] : ''
```

**Result:**
- Keyboard "Enter" → InteractionStore.startEdit() → **No session in EditSessionManager**
- Later commit() → Warning: `commit() called but no active session` (Issue #7)
- Columns using `row.data[field]` → Empty string from keyboard, correct value from click
- State desync between `currentSession` and `editingCell`

**Files:**
- `src/systems/vibegrid/services/EditSessionManager.ts`
- `src/systems/vibegrid/stores/InteractionStore.ts:897-1048`
- `src/systems/vibegrid/renderers/modules/KeyboardNavigationController.ts:200-236`

---

### 2. Container-Focused Keyboard Binding

**Problem:** KeyboardController binds `keydown` only to grid container and forces focus there:

```typescript
// KeyboardController.ts:66-123
private setupKeyboardListeners(): void {
  this.container.addEventListener('keydown', this.handleKeyDown)
  this.container.focus() // Forces focus to container
}
```

**Issues:**

1. **Editor input loses keyboard:**
   - Editor input (often outside container) takes focus
   - Navigation shortcuts stop firing (no keydown on container)
   - Grid navigation broken until container re-focused

2. **Ctrl/Cmd shortcuts still run during editing:**
   - Controller doesn't short-circuit when `isEditing`
   - Steals copy/paste/undo from editor
   - Editor native shortcuts blocked

3. **Outside-click focus loss:**
   - Click outside grid → Container loses focus
   - All keyboard handling drops
   - Must click grid to restore navigation

**Files:**
- `src/systems/vibegrid/controllers/KeyboardController.ts:66-123`

---

### 3. Inconsistent Initial Edit Value Selection

**Problem:** Different code paths pull values differently:

**Keyboard Enter path:**
```typescript
// KeyboardNavigationController.ts:211-219
const row = processedRows[rowIndex]
const value = row[columnId]  // Direct row access
```

**Session Manager path:**
```typescript
// EditSessionManager.start()
const processedRows = untracked(() => this.tableCoreStore.processedRows)
const field = column.field || columnId
const data = foundRow?.data || foundRow
const value = data ? data[field] : ''  // row.data[field] access
```

**Result:**
- Columns with `field !== id` → Different values
- Columns using nested `row.data` → Empty string from keyboard
- Virtual/computed columns → May not exist on row object
- Causes edit to start with wrong value, confusing users

**Example:**
```typescript
// Column config
{ id: 'assignee', field: 'user_id' }

// Keyboard Enter: row['assignee'] → undefined
// Click: row.data['user_id'] → '123'
```

**Files:**
- `src/systems/vibegrid/renderers/modules/KeyboardNavigationController.ts:211-219`
- `src/systems/vibegrid/services/EditSessionManager.ts:79-91`

---

### 4. No Unified Blur/Outside-Click Policy

**Problem:** EditSessionManager has blur policies but nothing wires outside clicks:

```typescript
// EditSessionManager.ts:230-274
handleBlur(reason: BlurReason, blurPolicy?: BlurPolicy): void {
  // Policies: 'commit' | 'cancel' | 'keep-open'
  // But nothing calls this on outside click!
}
```

**Missing:**
- Container-level outside click listener
- InteractionStore has no outside-click handling
- EditSessionManager.handleBlur() never invoked for clicks
- Dropdown editors never close (Issue #6)

**Expected flow:**
```
User clicks outside dropdown editor
  → Outside click detected
  → Get field's blur policy
  → Call editSessionManager.handleBlur('outside-pointer', policy)
  → Commit or cancel based on policy
  → Dropdown closes
```

**Actual flow:**
```
User clicks outside dropdown editor
  → Nothing happens
  → Dropdown stays open
  → Issue #6
```

**Files:**
- `src/systems/vibegrid/services/EditSessionManager.ts:230-274`
- `src/systems/vibegrid/stores/InteractionStore.ts` (no outside-click handler)

---

### 5. Race Hazards Around Async Actions

**Problem:** InteractionStore.saveEdit() is async but clears state before persistence finishes:

```typescript
// InteractionStore.ts:927-1040
@action
async saveEdit(value: any): Promise<void> {
  // ... validation ...

  // Clear state BEFORE async persistence
  runInAction(() => {
    this.editingCell = null
    this.editValue = null
    this.isEditing = false
  })

  // THEN do async save (may take 100-500ms)
  await this.onEntityUpdate?.(rowId, updates)

  // If cancelEdit() runs during this await:
  // - isCancelling guards the save
  // - But session manager doesn't know
  // - Delayed commit() finds editingCell cleared
  // - Logs warning
}
```

**Race scenarios:**

1. **Double-commit:**
   ```
   commit() starts → clears editingCell → async save pending
   commit() called again → finds no editingCell → warning
   ```

2. **Commit-after-cancel:**
   ```
   commit() starts → clears editingCell → async save pending
   cancel() runs → sets isCancelling → guards save
   commit() from manager (delayed) → finds no editingCell → warning
   ```

3. **Cancel during save:**
   ```
   commit() starts → async save in progress
   cancel() runs → clears session in manager
   save completes → data saved but session gone → desync
   ```

**Files:**
- `src/systems/vibegrid/stores/InteractionStore.ts:927-1040`
- `src/systems/vibegrid/services/EditSessionManager.ts:149-179`

---

### 6. Focus Loss After Edit Commit

**Problem:** Keyboard focus is lost after committing edits (Enter, Tab, blur, outside-click), requiring manual click to restore keyboard navigation.

**Root cause:** Cancel handler explicitly restores focus, but commit path doesn't:

**Cancel path (works correctly):**
```typescript
// KeyboardNavigationController.ts:234-241
case 'Escape':
  // If currently editing, just cancel the edit and keep selection
  if (this.editingStore.isEditing) {
    this.editingStore.cancelEdit('escape')
    // Keep the cell selected after canceling edit and focus container for keyboard events
    this.container.focus() // ✅ Focus restored!
    return true
  }
```

**Commit path (missing focus restoration):**
```typescript
// OverlayManager.ts:196-199
onCommit: async (value) => {
  // ✅ Delegate to EditingStore for proper commit handling
  await this.editingStore.commitEdit('user-action', value)
  // ❌ Missing: container.focus() to restore keyboard navigation
},
```

**Impact:**
- After committing edit (Enter in editor, Tab, blur, outside-click), keyboard navigation stops working
- Arrow keys don't respond until user manually clicks the grid
- Frustrating UX - users expect keyboard navigation to continue after editing
- Inconsistent with Escape behavior which correctly restores focus

**Files:**
- `src/systems/vibegrid/renderers/modules/OverlayManager.ts:196-199` (onCommit callback)
- `src/systems/vibegrid/renderers/modules/KeyboardNavigationController.ts:234-241` (Escape handler)

---

### 7. Focus/Anchor Assumptions in Navigation

**Problem:** Keyboard navigation assumes focusedCell is always in processedRows/visibleColumns:

```typescript
// KeyboardNavigationController.ts:38-170
const currentRowIndex = processedRows.findIndex((r) => r.id === currentRowId)
const currentColIndex = visibleColumns.findIndex((c) => c.id === currentColumnId)

if (currentRowIndex === -1 || currentColIndex === -1) {
  return  // Early return - no selection/focus update
}
```

**Issues:**

1. **Hidden column focused:**
   - User hides column that has focus
   - `currentColIndex` → -1
   - Navigation returns early
   - Keyboard input inert until click

2. **Virtual rendering removed row:**
   - Variable-height rows shift indices
   - `currentRowIndex` → -1
   - Focus points to non-existent row
   - Navigation broken

3. **Rapid config changes:**
   - Filter/sort/group changes processedRows
   - focusedCell points to old row
   - findIndex fails
   - Keyboard stops working

**Files:**
- `src/systems/vibegrid/renderers/modules/KeyboardNavigationController.ts:38-170`

---

## Root Cause Analysis

All 7 issues stem from **fragmented ownership** and **missing coordination**:

1. **EditSessionManager vs InteractionStore** - Two sources of truth
2. **Container-focused vs Document-level** - Wrong event binding scope
3. **row[id] vs row.data[field]** - Inconsistent data access patterns
4. **Blur policies defined but not wired** - Missing integration
5. **Sync actions with async side effects** - State cleared before async completes
6. **Incomplete focus restoration** - Cancel path works, commit path doesn't
7. **Focus assumptions without validation** - No recovery from invalid state

---

## Proposed Solutions

### Solution 1: Single EditingStore (Merge Both Sources)

**Extract editing state from InteractionStore, absorb EditSessionManager:**

```typescript
// NEW: src/systems/vibegrid/stores/EditingStore.ts
class EditingStore {
  // Single source of truth
  @observable private currentSession: EditSession | null = null
  @observable private sessionReady: boolean = false

  // Computed (derived from currentSession)
  @computed get editingCell(): string | null {
    return this.currentSession?.cellId ?? null
  }

  @computed get isEditing(): boolean {
    return this.currentSession !== null
  }

  // Unified entry point (replaces both InteractionStore.startEdit and EditSessionManager.start)
  @action startEdit(cellId: string, column: Column): void {
    const [rowId, columnId] = cellId.split(':')

    // Consistent value lookup (always use column.field + row.data)
    const row = untracked(() => {
      return this.tableCoreStore.processedRows.find(r => r.id === rowId)
    })

    const field = column.field || columnId
    const data = row?.data || row
    const currentValue = data?.[field] ?? ''

    this.currentSession = {
      cellId,
      column,
      originalValue: currentValue,
      pendingValue: currentValue,
      validation: null,
      startTime: Date.now(),
    }

    this.sessionReady = true
  }

  // Unified commit (with session ready check)
  @action async commitEdit(reason: CommitReason): Promise<void> {
    if (!this.sessionReady) {
      // Defer until next tick
      setTimeout(() => this.commitEdit(reason), 0)
      return
    }

    if (!this.currentSession) {
      fileLog.warn('commit() called but no active session', { reason })
      return
    }

    // Mark as committing (prevent double-commit)
    const session = this.currentSession
    this.currentSession = null
    this.sessionReady = false

    // Now do async save
    await this.saveToDatabase(session)
  }

  // Outside click handler (with blur policy)
  @action handleOutsideClick(target: HTMLElement): void {
    if (!this.currentSession) return

    // Check if click is outside editing overlay
    const editingOverlay = document.querySelector('.editing-overlay')
    if (editingOverlay && !editingOverlay.contains(target)) {
      const blurPolicy = this.getBlurPolicy(this.currentSession.column)

      if (blurPolicy === 'commit') {
        this.commitEdit('outside-click')
      } else if (blurPolicy === 'cancel') {
        this.cancelEdit('outside-click')
      }
      // 'keep-open' = do nothing
    }
  }
}
```

**Benefits:**
- ✅ Single entry point (no desync)
- ✅ Consistent value lookup (always row.data[field])
- ✅ Session ready check (fixes Issue #7)
- ✅ Outside click wired (fixes Issue #6)
- ✅ No race conditions (session cleared before async)

---

### Solution 2: Document-Level Keyboard Dispatcher

**Replace container-focused binding with document-level dispatcher:**

```typescript
// NEW: src/systems/vibegrid/controllers/KeyboardController.ts
class KeyboardController {
  private setupKeyboardListeners(): void {
    // Document-level listener (survives focus changes)
    document.addEventListener('keydown', this.handleKeyDown, { capture: true })
  }

  private handleKeyDown = (event: KeyboardEvent): void => {
    // Check if event is for this grid
    if (!this.isEventForGrid(event)) return

    // Route based on editing state
    if (this.editingStore.isEditing) {
      this.handleEditModeKey(event)
    } else {
      this.handleNavigationModeKey(event)
    }
  }

  private handleEditModeKey(event: KeyboardEvent): void {
    const key = event.key

    // Allow editor native shortcuts (don't steal)
    if (this.isNativeEditorShortcut(event)) {
      return // Let editor handle
    }

    switch (key) {
      case 'Escape':
        event.preventDefault()
        event.stopPropagation()
        this.editingStore.cancelEdit('escape')
        break

      case 'Enter':
        if (!event.shiftKey) { // Shift+Enter = new line in editor
          event.preventDefault()
          event.stopPropagation()
          this.editingStore.commitEdit('enter')
        }
        break

      case 'Tab':
        event.preventDefault()
        event.stopPropagation()
        this.editingStore.commitEdit('tab')
        // Then navigate
        this.navigationController.handleTabNavigation(event.shiftKey)
        break
    }
  }

  private isNativeEditorShortcut(event: KeyboardEvent): boolean {
    const { key, ctrlKey, metaKey } = event
    const modKey = ctrlKey || metaKey

    // Allow native: Ctrl+C, Ctrl+V, Ctrl+X, Ctrl+Z, Ctrl+A
    if (modKey && ['c', 'v', 'x', 'z', 'a'].includes(key.toLowerCase())) {
      return true
    }

    return false
  }
}
```

**Benefits:**
- ✅ Document-level binding (survives focus changes)
- ✅ Gates shortcuts during editing (prevents stealing)
- ✅ Allows native editor shortcuts
- ✅ Capture phase (runs before editor)

---

### Solution 3: Focus Recovery & Validation

**Add focus validation and recovery:**

```typescript
// KeyboardNavigationController.ts
handleArrowKey(direction: 'up' | 'down' | 'left' | 'right', isShiftKey: boolean): void {
  const processedRows = this.getProcessedRows()
  const visibleColumns = this.getVisibleColumns()
  const focusedCell = this.interactionStore.focusedCell

  // Validate focus is in current rows/columns
  if (focusedCell) {
    const [rowId, columnId] = focusedCell.split(':')
    const rowIndex = processedRows.findIndex((r) => r.id === rowId)
    const colIndex = visibleColumns.findIndex((c) => c.id === columnId)

    // If focus is invalid, recover by focusing first visible cell
    if (rowIndex === -1 || colIndex === -1) {
      fileLog.warn('Focus invalid after config change, recovering', {
        focusedCell,
        rowFound: rowIndex !== -1,
        colFound: colIndex !== -1,
      })

      this.recoverFocus(processedRows, visibleColumns)
      return
    }
  }

  // ... rest of arrow key logic
}

private recoverFocus(processedRows: any[], visibleColumns: any[]): void {
  if (processedRows.length === 0 || visibleColumns.length === 0) return

  const firstRow = processedRows[0]
  const firstCol = visibleColumns.find((c) => c.id !== 'selection') || visibleColumns[0]
  const firstCellId = `${firstRow.id}:${firstCol.id}`

  this.interactionStore.setFocusedCell(firstCellId)
  this.interactionStore.selectCell(firstCellId, false, false)
}
```

**Benefits:**
- ✅ Detects invalid focus
- ✅ Recovers automatically
- ✅ Logs warning for debugging
- ✅ Prevents keyboard getting stuck

---

## Implementation Plan

### Phase 1: Extract EditingStore (4-6 hours)

**Tasks:**
- [ ] Create `src/systems/vibegrid/stores/EditingStore.ts`
- [ ] Move editing observables from InteractionStore
- [ ] Add `currentSession`, `sessionReady` observables
- [ ] Implement `startEdit()` with consistent value lookup
- [ ] Implement `commitEdit()` with session ready check
- [ ] Implement `cancelEdit()`
- [ ] Implement `handleOutsideClick()` with blur policy
- [ ] Update store context to include EditingStore

**Files:**
- NEW: `src/systems/vibegrid/stores/EditingStore.ts`
- `src/systems/vibegrid/stores/InteractionStore.ts` (remove editing)
- `src/systems/vibegrid/stores/context.ts`

### Phase 2: Merge EditSessionManager (3-4 hours)

**Tasks:**
- [ ] Move blur policy logic to EditingStore
- [ ] Delete EditSessionManager
- [ ] Update KeyboardNavigationController to call EditingStore.startEdit()
- [ ] Update EditingOverlayController to use EditingStore
- [ ] Update all commit/cancel calls to EditingStore

**Files:**
- `src/systems/vibegrid/stores/EditingStore.ts` (absorb logic)
- DELETE: `src/systems/vibegrid/services/EditSessionManager.ts`
- `src/systems/vibegrid/renderers/modules/KeyboardNavigationController.ts`
- `src/systems/vibegrid/renderers/modules/controllers/EditingOverlayController.ts`

### Phase 3: Document-Level Keyboard (3-4 hours)

**Tasks:**
- [ ] Create KeyboardController with document-level binding
- [ ] Add edit mode vs navigation mode routing
- [ ] Add native shortcut detection
- [ ] Wire outside click to EditingStore.handleOutsideClick()
- [ ] Update VibeGrid to use KeyboardController

**Files:**
- NEW: `src/systems/vibegrid/controllers/KeyboardController.ts`
- `src/systems/vibegrid/VibeGrid.tsx`

### Phase 4: Focus Recovery (2-3 hours)

**Tasks:**
- [ ] Add focus validation in handleArrowKey()
- [ ] Implement recoverFocus()
- [ ] Add logging for invalid focus
- [ ] Test with column hide/show, filter changes

**Files:**
- `src/systems/vibegrid/renderers/modules/KeyboardNavigationController.ts`

### Phase 5: Testing (3-4 hours)

**Required tests:**
- [ ] (a) Keyboard Enter on row.data field starts edit with correct value
- [ ] (b) Outside-click blur policy commit/cancel
- [ ] (c) Double-commit logs once, no warning
- [ ] (d) Commit-after-cancel doesn't log warning
- [ ] (e) Navigation after hiding focused column recovers
- [ ] (f) Native editor shortcuts (Ctrl+C, Ctrl+V) work during editing
- [ ] (g) Grid shortcuts (Ctrl+A) blocked during editing

**Files:**
- NEW: `src/systems/vibegrid/stores/__tests__/EditingStore.test.ts`
- NEW: `src/systems/vibegrid/controllers/__tests__/KeyboardController.test.ts`

---

## Success Criteria

- [ ] No "commit() called but no active session" warnings (Issue #7 fixed)
- [ ] Dropdown editors close on outside click (Issue #6 fixed)
- [ ] Keyboard Enter and Click start edit with same value
- [ ] Native editor shortcuts work during editing
- [ ] Grid navigation survives focus changes
- [ ] Focus recovery after column hide/filter change
- [ ] All 7 tests pass
- [ ] Type checking passes (`pnpm typecheck`)
- [ ] Manual testing confirms no regressions

---

## Timeline

**Total: 15-21 hours (2-3 days)**

- Phase 1: 4-6 hours
- Phase 2: 3-4 hours
- Phase 3: 3-4 hours
- Phase 4: 2-3 hours
- Phase 5: 3-4 hours
