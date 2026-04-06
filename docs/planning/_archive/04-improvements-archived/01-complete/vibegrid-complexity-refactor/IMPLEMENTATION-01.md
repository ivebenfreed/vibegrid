---
initiative: vibegrid-complexity-refactor
type: improvement
status: draft
owner: platform-engineering
updated: 2025-11-30
---

# vibegrid complexity refactor: IMPLEMENTATION (Part 1/3)

**📚 Navigation:** [Part 1](#) [Part 2](./IMPLEMENTATION-02.md) [Part 3](./IMPLEMENTATION-03.md) 

---

---
initiative: vibegrid-complexity-refactor
type: improvement
status: draft
owner: platform-engineering
updated: 2025-11-29
---

# VibegGrid Complexity Refactor - Implementation Plan

## Overview

Step-by-step implementation guide for the refactors identified in README.md. Organized by priority with incremental, testable milestones.

---

## Phase 1: Low-Risk Quick Wins (1-2 days)

### 1.1 Add Version Numbers to InteractionStore

**Goal:** Replace O(n log n) string building with scalar version comparison.

**Files to modify:**
- `src/systems/vibegrid/stores/InteractionStore.ts`

**Steps:**

1. Add observable version numbers:
```typescript
// InteractionStore.ts - add after line ~115
@observable selectionVersion: number = 0
@observable clipboardVersion: number = 0
```

2. Increment versions when state changes:
```typescript
// In selectCell(), selectRow(), selectRange(), clearSelection(), etc.
@action
selectCell(cellId: string, isMulti: boolean = false): void {
  // ... existing logic ...
  this.selectionVersion++  // ADD THIS
}

// In setClipboard(), clearClipboard()
@action
setClipboard(clipboardData: {...}): void {
  // ... existing logic ...
  this.clipboardVersion++  // ADD THIS
}
```

3. Update OverlayManager to use versions instead of strings:
```typescript
// OverlayManager.ts - in linkToInteractionsObservable()
// Replace:
const selectionString = Array.from(state.selectedCells).sort().join(',')
const selectionChanged = lastSelectionString !== selectionString

// With:
const selectionChanged = lastSelectionVersion !== this.interactionStore.selectionVersion
```

**Test:** Verify selection/clipboard overlays still update correctly. No visual change expected.

---

### 1.2 Split processedRows into Pipeline

**Goal:** Break monolithic computed into stages for better memoization and testability.

**Files to modify:**
- `src/systems/vibegrid/stores/TableCoreStore.ts`

**Steps:**

1. Extract filteredRows computed:
```typescript
// Add after rawRows declaration (~line 228)
@computed
get filteredRows(): any[] {
  if (!this.hasLoadedRows) return []

  const filters = this.visualStateStore?.filters || []
  if (filters.length === 0) return this.rawRows

  return applyFilters(this.rawRows, filters)
}
```

2. Extract sortedRows computed:
```typescript
@computed
get sortedRows(): any[] {
  const sortBy = this.visualStateStore?.sortBy || []
  if (sortBy.length === 0) return this.filteredRows

  return applySorting(this.filteredRows, sortBy)
}
```

3. Extract groupedOrOrderedRows computed:
```typescript
@computed
get groupedOrOrderedRows(): any[] {
  const groupConfig = this.visualStateStore?.groupConfig || null

  if (groupConfig?.fields?.length > 0) {
    const groupResult = GroupProcessor.processData(
      this.sortedRows,
      this.columns,
      groupConfig,
      this.groupRowOrders,
    )
    return groupResult.virtualRows
  }

  // Apply flat row ordering if no grouping and no sorting
  const hasSorting = (this.visualStateStore?.sortBy || []).length > 0
  if (!hasSorting && this.flatRowOrder.length > 0) {
    return applyFlatRowOrdering(this.sortedRows, this.flatRowOrder)
  }

  return this.sortedRows
}
```

4. Simplify processedRows to use pipeline:
```typescript
@computed
get processedRows(): any[] {
  if (!this.isSchemaLoaded || !this.hasLoadedRows) {
    return []
  }

  const rows = this.groupedOrOrderedRows

  // Wrap flat rows in VirtualRow structure if needed
  if (rows.length > 0 && !('type' in rows[0])) {
    return rows.map((row, index) => ({
      type: 'data' as const,
      id: row.id,
      index,
      height: 40,
      data: row,
    }))
  }

  return rows
}
```

5. Move logging to debug level or remove from computeds.

**Test:**
- Verify grid renders same data before/after
- Check that changing only sort doesn't recompute filter
- Run existing tests

---

### 1.3 Strongly Type Store Dependencies

**Goal:** Fail fast on initialization-order bugs.

**Files to modify:**
- `src/systems/vibegrid/stores/InteractionStore.ts`

**Steps:**

1. Replace `any` types with proper imports:
```typescript
// InteractionStore.ts - add imports
import type { TableCoreStore } from './TableCoreStore'
import type { VisualStateStore } from './VisualStateStore'

// Replace (line ~199-202):
private tableCore$: any = null
private tableCoreStore: any = null
private visualStateStore: any = null

// With:
private tableCore$: unknown = null  // Legacy, keep for now
private tableCoreStore: TableCoreStore | null = null
private visualStateStore: VisualStateStore | null = null
```

2. Add assertion helper:
```typescript
// Add at top of file
function assertStorePresent<T>(store: T | null, name: string): asserts store is T {
  if (!store) {
    throw new Error(`InteractionStore: ${name} not initialized. Call set${name}() before use.`)
  }
}
```

3. Add assertions in high-traffic methods:
```typescript
// In handleCellClick(), saveEdit(), startEdit(), etc.
@action
handleCellClick(cellId: string, isEditable: boolean, ctrlKey: boolean, shiftKey: boolean): void {
  assertStorePresent(this.tableCoreStore, 'TableCoreStore')
  assertStorePresent(this.visualStateStore, 'VisualStateStore')
  // ... rest of method
}
```

**Test:** Verify grid still works. Test that missing store throws clear error.

---

### 1.4 Add Invariant Assertions

**Goal:** Catch coordinator/DOM mismatches early.

**Files to modify:**
- `src/systems/vibegrid/stores/VisualStateStore.ts`
- `src/systems/vibegrid/services/SelectionService.ts`

**Steps:**

1. Create assertion utility:
```typescript
// src/systems/vibegrid/utils/invariants.ts
export function assertInvariant(condition: boolean, message: string): asserts condition {
  if (!condition) {
    const error = new Error(`VibegGrid Invariant Violation: ${message}`)
    console.error(error)
    // In dev, throw. In prod, log and continue.
    if (process.env.NODE_ENV !== 'production') {
      throw error
    }
  }
}
```

2. Add assertions in VisualStateStore:
```typescript
// In updateCoordinatorWithCurrentLayout()
private updateCoordinatorWithCurrentLayout(): void {
  if (!this.coordinateManager) return

  const visibleColumns = this.orderedColumns.filter(
    col => this.columnVisibility[col.id] !== false
  )

  // ... existing logic ...

  this.coordinateManager.updateColumns(layoutColumns, BASE_OFFSET)

  // ADD: Verify sync
  assertInvariant(
    this.coordinateManager.getColumnCount() === visibleColumns.length,
    `Coordinator columns (${this.coordinateManager.getColumnCount()}) must match visible columns (${visibleColumns.length})`
  )
}
```

**Test:** Temporarily break coordinator sync to verify assertion fires.

---

## Phase 2: OverlayManager Split (3-5 days)

### 2.1 Create Controller Interface and Base Class

**Goal:** Define contract for overlay controllers.

**Files to create:**
- `src/systems/vibegrid/renderers/modules/controllers/OverlayController.ts`

**Steps:**

1. Create base interface:
```typescript
// OverlayController.ts
import type { InteractionStore } from '../../../stores/InteractionStore'

export interface OverlayControllerOptions {
  container: HTMLElement
  interactionStore: InteractionStore
}

export abstract class OverlayController {
  protected container: HTMLElement
  protected interactionStore: InteractionStore
  protected rafHandle: number | null = null
  protected disposers: (() => void)[] = []

  constructor(options: OverlayControllerOptions) {
    this.container = options.container
    this.interactionStore = options.interactionStore
  }

  abstract init(): void

  protected scheduleUpdate(callback: () => void): void {
    if (this.rafHandle !== null) {
      cancelAnimationFrame(this.rafHandle)
    }
    this.rafHandle = requestAnimationFrame(() => {
      this.rafHandle = null
      callback()
    })
  }

  dispose(): void {
    if (this.rafHandle !== null) {
      cancelAnimationFrame(this.rafHandle)
    }
    this.disposers.forEach(d => d())
    this.disposers = []
  }
}
```

---

### 2.2 Extract SelectionOverlayController

**Goal:** Move selection overlay logic to dedicated controller.

**Files to create:**
- `src/systems/vibegrid/renderers/modules/controllers/SelectionOverlayController.ts`

**Steps:**

1. Create controller with focused reaction:
```typescript
// SelectionOverlayController.ts
import { reaction } from 'mobx'
import { OverlayController, type OverlayControllerOptions } from './OverlayController'
import type { CanvasOverlayDOM } from '../../../overlays/CanvasOverlayDOM'
import type { VibeGridXCoordinateManager } from '../../../coordinates/VibeGridXCoordinateManager'

interface SelectionControllerOptions extends OverlayControllerOptions {
  canvasOverlay: CanvasOverlayDOM
  coordinateManager: VibeGridXCoordinateManager
  getViewportInfo: () => ViewportInfo
}

export class SelectionOverlayController extends OverlayController {
  private canvasOverlay: CanvasOverlayDOM
  private coordinateManager: VibeGridXCoordinateManager
  private getViewportInfo: () => ViewportInfo
  private lastVersion: number = -1

  constructor(options: SelectionControllerOptions) {
    super(options)
    this.canvasOverlay = options.canvasOverlay
    this.coordinateManager = options.coordinateManager
    this.getViewportInfo = options.getViewportInfo
  }

  init(): void {
    // Focused reaction - only watches selection version
    const dispose = reaction(
      () => ({
        version: this.interactionStore.selectionVersion,
        selectedCells: this.interactionStore.selectedCells,
        isResizing: this.interactionStore.columnResize?.isResizing ?? false,
      }),
      (state) => {
        // Skip during column resize
        if (state.isResizing) return

        // Skip if version unchanged
        if (state.version === this.lastVersion) return
        this.lastVersion = state.version

        this.scheduleUpdate(() => this.updateSelection(state.selectedCells))
      },
      { equals: (a, b) => a.version === b.version && a.isResizing === b.isResizing }
    )

    this.disposers.push(dispose)
  }

  private updateSelection(selectedCells: Set<string>): void {
    if (!this.canvasOverlay.isInitialized) return

    const visualCells = this.getVisualCellPositions(selectedCells)
    const viewportInfo = this.getViewportInfo()

    this.canvasOverlay.updateViewport(viewportInfo)
    this.canvasOverlay.updateSelectionWithVisualPositions(visualCells)

    if (visualCells.length > 0) {
      this.canvasOverlay.renderFillHandle(visualCells, undefined, viewportInfo)
    } else {
      this.canvasOverlay.hideFillHandle()
    }
  }

  private getVisualCellPositions(selectedCells: Set<string>): VisualCellPosition[] {
    // Move logic from OverlayManager.getVisualCellPositions()
    // ...
  }
}
```

---

### 2.3 Extract EditingOverlayController

**Files to create:**
- `src/systems/vibegrid/renderers/modules/controllers/EditingOverlayController.ts`

**Steps:**

1. Create controller watching editing state:
```typescript
// EditingOverlayController.ts
import { reaction } from 'mobx'
import { OverlayController, type OverlayControllerOptions } from './OverlayController'

interface EditingControllerOptions extends OverlayControllerOptions {
  editingOverlay: EditingOverlay
  tableCoreStore: TableCoreStore
  getCellPosition: (rowId: string, columnId: string) => Position | null
}

export class EditingOverlayController extends OverlayController {
  private editingOverlay: EditingOverlay
  private tableCoreStore: TableCoreStore
  private getCellPosition: (rowId: string, columnId: string) => Position | null

  constructor(options: EditingControllerOptions) {
    super(options)
    this.editingOverlay = options.editingOverlay
    this.tableCoreStore = options.tableCoreStore
    this.getCellPosition = options.getCellPosition
  }

  init(): void {
    const dispose = reaction(
      () => ({
        editingCell: this.interactionStore.editingCell,
        editValue: this.interactionStore.editValue,
        isEditing: this.interactionStore.isEditing,
      }),
      (state, prevState) => {
        // Only react to actual changes
        if (state.editingCell === prevState?.editingCell &&
            state.isEditing === prevState?.isEditing) {
          return
        }

        this.scheduleUpdate(() => this.updateEditing(state))
      }
    )

    this.disposers.push(dispose)
  }

  private updateEditing(state: { editingCell: string | null; editValue: any; isEditing: boolean }): void {
    // Clear data-editing from all cells
    this.container.querySelectorAll('[data-editing="true"]').forEach((cell) => {
      (cell as HTMLElement).removeAttribute('data-editing')
    })

    if (state.isEditing && state.editingCell) {
      const [rowId, columnId] = state.editingCell.split(':')
      const column = this.tableCoreStore.columns.find(c => c.id === columnId)

      if (column) {
        const position = this.getCellPosition(rowId, columnId)
        if (position) {
          // Show editing overlay
          // ... move logic from OverlayManager
        }
      }
    } else {
      this.editingOverlay.hide()
    }
  }
}
```

---

### 2.4 Extract ClipboardOverlayController

**Files to create:**
- `src/systems/vibegrid/renderers/modules/controllers/ClipboardOverlayController.ts`

Similar pattern - focused reaction on `clipboardVersion`.

---

### 2.5 Extract ResizePreviewController

**Files to create:**
- `src/systems/vibegrid/renderers/modules/controllers/ResizePreviewController.ts`

Similar pattern - focused reaction on `columnResize`.

---

### 2.6 Refactor OverlayManager to Use Controllers

**Files to modify:**
- `src/systems/vibegrid/renderers/modules/OverlayManager.ts`

**Steps:**

1. Import controllers:
```typescript
import { SelectionOverlayController } from './controllers/SelectionOverlayController'
import { EditingOverlayController } from './controllers/EditingOverlayController'
import { ClipboardOverlayController } from './controllers/ClipboardOverlayController'
import { ResizePreviewController } from './controllers/ResizePreviewController'
```

2. Replace `linkToInteractionsObservable()` with controller initialization:
```typescript
private initControllers(): void {
  this.selectionController = new SelectionOverlayController({
    container: this.container,
    interactionStore: this.interactionStore,
    canvasOverlay: this.canvasOverlay!,
    coordinateManager: this.coordinateManager,
    getViewportInfo: () => this.getViewportInfo(),
  })

  this.editingController = new EditingOverlayController({
    container: this.container,
    interactionStore: this.interactionStore,
    editingOverlay: this.editingOverlay!,
    tableCoreStore: this.tableCoreStore,
    getCellPosition: (r, c) => this.getCellPosition(r, c),
  })

  // ... other controllers

  // Initialize all
  this.selectionController.init()
  this.editingController.init()
  // ...
}
```

3. Remove `linkToInteractionsObservable()` method entirely.

4. Update `destroy()` to dispose controllers.

**Test:** Full manual testing of selection, editing, clipboard, resize. All should work as before.

---

## Phase 3: Replace keepAlive with Hooks (2-3 days)

### 3.1 Create useProcessedRows Hook

**Files to create:**
- `src/systems/vibegrid/hooks/useProcessedRows.ts`

