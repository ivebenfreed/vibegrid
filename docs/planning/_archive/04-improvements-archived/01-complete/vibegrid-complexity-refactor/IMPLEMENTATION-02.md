---
initiative: vibegrid-complexity-refactor
type: improvement
status: draft
owner: platform-engineering
updated: 2025-11-30
---

# vibegrid complexity refactor: IMPLEMENTATION (Part 2/3)

**📚 Navigation:** [Part 1](./IMPLEMENTATION-01.md) [Part 2](#) [Part 3](./IMPLEMENTATION-03.md) 

---

**Steps:**

1. Create hook:
```typescript
// useProcessedRows.ts
import { useEffect } from 'react'
import { autorun } from 'mobx'
import type { TableCoreStore } from '../stores/TableCoreStore'

/**
 * Hook that keeps processedRows computed warm by observing it.
 * This replaces the hidden keepAlive autorun in TableCoreStore.
 *
 * Must be used in an observer() component.
 */
export function useProcessedRows(tableCoreStore: TableCoreStore): any[] {
  // Just accessing the computed in render keeps it observed
  return tableCoreStore.processedRows
}

/**
 * Hook that keeps rowOffsets computed warm.
 */
export function useRowOffsets(tableCoreStore: TableCoreStore): number[] {
  return tableCoreStore.rowOffsets
}
```

2. Use in render layer (VibeGrid or SimplePassiveRenderer):
```typescript
// In the main grid component
const processedRows = useProcessedRows(tableCoreStore)
const rowOffsets = useRowOffsets(tableCoreStore)
```

3. Remove keepAlive autoruns from TableCoreStore.init():
```typescript
// DELETE these lines from TableCoreStore.ts:1530-1542
const processedRowsKeepAlive = autorun(() => {
  const _rowCount = this.processedRows.length
})
const rowOffsetsKeepAlive = autorun(() => {
  const _offsetCount = this.rowOffsets.length
})
this.disposers.add(processedRowsKeepAlive)
this.disposers.add(rowOffsetsKeepAlive)
```

**Test:** Verify no recomputation on scroll. Profile to confirm computeds stay cached.

---

## Phase 4: Add Regression Tests (1-2 days)

### 4.1 Create Test Infrastructure

**Files to create:**
- `src/systems/vibegrid/renderers/modules/__tests__/OverlayManager.test.ts`

**Steps:**

1. Set up test environment:
```typescript
// OverlayManager.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { configure, runInAction } from 'mobx'
import { InteractionStore } from '../../../stores/InteractionStore'
import { TableCoreStore } from '../../../stores/TableCoreStore'
import { VisualStateStore } from '../../../stores/VisualStateStore'

// Use fake timers for RAF control
vi.useFakeTimers()

describe('OverlayManager', () => {
  let interactionStore: InteractionStore
  let tableCoreStore: TableCoreStore
  let visualStateStore: VisualStateStore

  beforeEach(() => {
    // Set up stores
    interactionStore = new InteractionStore()
    tableCoreStore = new TableCoreStore('test')
    visualStateStore = new VisualStateStore()

    // Wire up dependencies
    interactionStore.setTableCoreStore(tableCoreStore)
    interactionStore.setVisualStateStore(visualStateStore)
  })

  afterEach(() => {
    vi.clearAllTimers()
  })
```

---

### 4.2 Test RAF Accumulation Fix

```typescript
  describe('RAF accumulation', () => {
    it('should not lose selection update when edit is cancelled rapidly', async () => {
      // Start editing cell 1
      runInAction(() => {
        interactionStore.startEdit('row1:col1', 'value1')
      })

      // Cancel and select cell 2 in same tick
      runInAction(() => {
        interactionStore.cancelEdit()
        interactionStore.selectCell('row2:col2')
      })

      // Advance RAF
      vi.runAllTimers()

      // Selection should be cell 2
      expect(interactionStore.selectedCells.has('row2:col2')).toBe(true)
      expect(interactionStore.selectedCells.size).toBe(1)

      // Editing should be cleared
      expect(interactionStore.isEditing).toBe(false)
    })

    it('should handle rapid selection changes without losing updates', () => {
      // Rapidly change selection 10 times
      for (let i = 0; i < 10; i++) {
        runInAction(() => {
          interactionStore.selectCell(`row${i}:col1`)
        })
      }

      // Advance RAF
      vi.runAllTimers()

      // Final selection should be row9
      expect(interactionStore.selectedCells.has('row9:col1')).toBe(true)
    })
  })
```

---

### 4.3 Test Resize Overlay Visibility

```typescript
  describe('resize overlay visibility', () => {
    it('should hide selection overlay during column resize', () => {
      // Select a cell
      runInAction(() => {
        interactionStore.selectCell('row1:col1')
      })
      vi.runAllTimers()

      // Start column resize
      runInAction(() => {
        interactionStore.startColumnResize('col1', 100, 150)
      })
      vi.runAllTimers()

      // Selection overlay should be hidden
      // (Assert on mock or spy depending on setup)
      expect(interactionStore.columnResize?.isResizing).toBe(true)
    })

    it('should restore selection overlay after resize ends', () => {
      // Select, resize, end resize
      runInAction(() => {
        interactionStore.selectCell('row1:col1')
      })
      vi.runAllTimers()

      runInAction(() => {
        interactionStore.startColumnResize('col1', 100, 150)
      })
      vi.runAllTimers()

      runInAction(() => {
        interactionStore.endColumnResize()
      })
      vi.runAllTimers()

      // Selection should still be there
      expect(interactionStore.selectedCells.has('row1:col1')).toBe(true)
    })
  })
})
```

---

## Phase 5: SimplePassiveRenderer Split (4-6 days)

### 5.1 Create ViewModelProvider

**Goal:** Single source of memoized selectors, replacing per-controller inline getters.

**Files to create:**
- `src/systems/vibegrid/renderers/core/ViewModelProvider.ts`

**Steps:**

1. Create ViewModelProvider class:
```typescript
// ViewModelProvider.ts
import { computed, makeObservable } from 'mobx'
import type { TableCoreStore } from '../../stores/TableCoreStore'
import type { VisualStateStore } from '../../stores/VisualStateStore'
import type { InteractionStore } from '../../stores/InteractionStore'

/**
 * ViewModelProvider - Centralized memoized selectors for renderer consumption
 *
 * Replaces inline getters scattered across controllers:
 * - getProcessedRows: () => this.tableCoreStore.processedRows
 * - getVisibleColumns: () => columns.filter(...)
 *
 * Benefits:
 * - Single recomputation when deps change (not per-controller)
 * - Strongly typed
 * - Easy to test
 */
export class ViewModelProvider {
  constructor(
    private tableCoreStore: TableCoreStore,
    private visualStateStore: VisualStateStore,
    private interactionStore: InteractionStore,
  ) {
    makeObservable(this)
  }

  @computed
  get processedRows(): any[] {
    return this.tableCoreStore.processedRows
  }

  @computed
  get visibleColumns(): any[] {
    const columns = this.visualStateStore.columns
    const columnVisibility = this.visualStateStore.columnVisibility
    return columns.filter((col) => columnVisibility[col.id] !== false)
  }

  @computed
  get columnWidths(): Record<string, number> {
    return this.visualStateStore.columnWidths
  }

  @computed
  get selectedCells(): Set<string> {
    return this.interactionStore.selectedCells
  }

  @computed
  get isEditing(): boolean {
    return this.interactionStore.isEditing
  }

  @computed
  get editingCell(): string | null {
    return this.interactionStore.editingCell
  }

  // Derived helpers
  @computed
  get rowCount(): number {
    return this.processedRows.length
  }

  @computed
  get visibleColumnCount(): number {
    return this.visibleColumns.length
  }
}
```

2. Update controllers to consume ViewModelProvider instead of inline getters.

---

### 5.2 Extract RenderScheduler

**Goal:** Move version-based update routing out of SimplePassiveRenderer.

**Files to create:**
- `src/systems/vibegrid/renderers/core/RenderScheduler.ts`

**Steps:**

1. Create RenderScheduler:
```typescript
// RenderScheduler.ts
import { reaction } from 'mobx'
import { createLogger } from '@/shared/lib/logging'
import type { TableCoreStore } from '../../stores/TableCoreStore'
import type { InitStore } from '../../stores/InitStore'
import { determineUpdateStrategy } from '../../utils/update-router'

const fileLog = createLogger('vibegrid/renderers/RenderScheduler')

export interface RenderCallbacks {
  renderFull: () => void
  renderCells: (changedCells: Map<string, Set<string>>) => void
  renderHeader: () => void
}

/**
 * RenderScheduler - Owns version-based update routing
 *
 * Watches dataVersion/configVersion/structureVersion and invokes
 * appropriate render callbacks based on change type.
 *
 * Extracted from SimplePassiveRenderer.initFocusedObservers()
 */
export class RenderScheduler {
  private disposers: (() => void)[] = []
  private lastDataVersion: number = 0
  private lastConfigVersion: number = 0
  private lastStructureVersion: number = 0
  private enabled: boolean = false

  constructor(
    private tableCoreStore: TableCoreStore,
    private initStore: InitStore,
    private callbacks: RenderCallbacks,
  ) {}

  enable(): void {
    this.enabled = true
  }

  init(): void {
    // Version-based data observer
    const dataDisposer = reaction(
      () => ({
        dataVersion: this.tableCoreStore.dataVersion,
        configVersion: this.tableCoreStore.configVersion,
        structureVersion: this.tableCoreStore.structureVersion,
        lastChangeMetadata: this.tableCoreStore.lastChangeMetadata,
      }),
      ({ dataVersion, configVersion, structureVersion, lastChangeMetadata }) => {
        if (!this.enabled) return
        if (!this.initStore.isFullyHydrated) return

        // Skip if no version change
        if (
          dataVersion === this.lastDataVersion &&
          configVersion === this.lastConfigVersion &&
          structureVersion === this.lastStructureVersion
        ) {
          return
        }

        // Update tracked versions
        this.lastDataVersion = dataVersion
        this.lastConfigVersion = configVersion
        this.lastStructureVersion = structureVersion

        // Determine update strategy
        const strategy = determineUpdateStrategy(lastChangeMetadata)

        fileLog.debug('Routing update', { strategy, changeType: lastChangeMetadata?.type })

        if (strategy === 'full-render') {
          this.callbacks.renderFull()
          return
        }

        // Granular update
        const changedCells = this.tableCoreStore.lastChangedCells
        if (!changedCells || changedCells.size === 0) {
          this.callbacks.renderFull()
          return
        }

        this.callbacks.renderCells(changedCells)

        // Clear changed cells
        this.tableCoreStore.lastChangedCells.clear()
        this.tableCoreStore.lastChangeStats = { rowsChanged: 0, totalCellsChanged: 0 }
      },
    )

    this.disposers.push(dataDisposer)
  }

  dispose(): void {
    this.disposers.forEach((d) => d())
    this.disposers = []
  }
}
```

2. Update SimplePassiveRenderer to use RenderScheduler:
```typescript
// In SimplePassiveRenderer constructor
this.renderScheduler = new RenderScheduler(
  this.tableCoreStore,
  this.initStore,
  {
    renderFull: () => this.renderBody(),
    renderCells: (cells) => this.bodyRenderer?.updateCells(cells),
    renderHeader: () => this.renderHeader(),
  }
)
```

3. Remove `initFocusedObservers()` data observer logic (keep column observers for now).

---

### 5.3 Type EventManager and KeyboardController

**Goal:** Remove legacy `as any` casts and null bridge params.

**Files to modify:**
- `src/systems/vibegrid/renderers/managers/EventManager.ts`
- `src/systems/vibegrid/renderers/core/SimplePassiveRenderer.ts`

**Steps:**

1. Update EventManager constructor interface:
```typescript
// EventManager.ts
export interface EventManagerOptions {
  tableCoreStore: TableCoreStore
  interactionStore: InteractionStore
  container: HTMLElement
  onEntityUpdate?: (rowId: string, updates: Record<string, any>) => Promise<void> | void
}

// Remove legacy:
// tableCore$: any
// tableViewport$: any
```

2. Update internal references from `tableCore$` to `tableCoreStore`.

3. Update SimplePassiveRenderer:
```typescript
// Replace:
this.eventManager = new EventManager({
  tableCore$: this.tableCoreStore as any,
  tableInteraction$: this.interactionStore as any,
  tableViewport$: null as any,
  ...
})

// With:
this.eventManager = new EventManager({
  tableCoreStore: this.tableCoreStore,
  interactionStore: this.interactionStore,
  container: this.container,
  onEntityUpdate: this.options.onEntityUpdate,
})
```

---

### 5.4 Clean Up Commented Observers

**Goal:** Remove dead code or finish incomplete implementations.

**Files to modify:**
- `src/systems/vibegrid/renderers/core/SimplePassiveRenderer.ts`

**Steps:**

1. Review commented observers at lines 706-898.

2. For each commented block, decide:
   - **Delete** if overlay controllers now own this responsibility
   - **Implement** if still needed but was incomplete

3. Visual observer (706-791): **DELETE** - Column visibility/order/width already have dedicated observers.

4. Interaction observer (793-898): **DELETE** - Selection/editing/resize handled by OverlayManager controllers.

5. Remove related dead code:
   - `lastVisualLayout` variable
   - `updateDOMSelectionClasses()` if unused
   - `updateSelectAllCheckboxVisual()` if handled elsewhere

---

### 5.5 Guard Hot-Path Logging

**Goal:** Reduce performance impact of logging in reactions.

**Files to modify:**
- `src/systems/vibegrid/renderers/core/SimplePassiveRenderer.ts`
- `src/systems/vibegrid/renderers/core/RenderScheduler.ts`

**Steps:**

1. Replace direct `fileLog.debug()` calls with conditional logging:
```typescript
// Replace:
fileLog.debug('🔍 VERSION CHANGE DETECTED', { ... })

// With:
if (fileLog.isEnabled('debug')) {
  fileLog.debug('VERSION CHANGE DETECTED', { ... })
}
```

2. Or use lazy logging pattern:
```typescript
fileLog.debug(() => ['VERSION CHANGE', { dataVersion, configVersion }])
```

3. Remove emoji prefixes from hot-path logs (they add overhead).

---

## Phase 6: Virtualization & Coordinate System Cleanup (3-5 days)

### 6.1 Make CoordinateManager Observable

**Goal:** Allow MobX reactions to detect coordinate changes.

**Files to modify:**
- `src/systems/vibegrid/coordinates/VibeGridXCoordinateManager.ts`
- `src/systems/vibegrid/stores/context.ts` (if coordinator is created there)

**Steps:**

1. Add observable wrapper to coordinator:
```typescript
// coordinates/ObservableCoordinateManager.ts
import { observable, action, makeObservable } from 'mobx'
import { VibeGridXCoordinateManager } from './VibeGridXCoordinateManager'

/**
 * Observable wrapper around VibeGridXCoordinateManager
 * Allows MobX reactions to detect coordinate changes
 */
export class ObservableCoordinateManager {
  @observable version: number = 0

  constructor(private coordinator: VibeGridXCoordinateManager) {
    makeObservable(this)
  }

  // Delegate methods with version bump
  @action
  updateColumns(columns: ColumnLayout[], baseOffset: number): void {
    this.coordinator.updateColumns(columns, baseOffset)
    this.version++
  }

  @action
  updateRows(rows: RowLayout[]): void {
    this.coordinator.updateRows(rows)
    this.version++
  }

  // Read-only delegations (no version bump needed)
