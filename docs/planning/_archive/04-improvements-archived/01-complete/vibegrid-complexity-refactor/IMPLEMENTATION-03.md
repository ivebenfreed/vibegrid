---
initiative: vibegrid-complexity-refactor
type: improvement
status: draft
owner: platform-engineering
updated: 2025-11-30
---

# vibegrid complexity refactor: IMPLEMENTATION (Part 3/3)

**📚 Navigation:** [Part 1](./IMPLEMENTATION-01.md) [Part 2](./IMPLEMENTATION-02.md) [Part 3](#) 

---

  getColumnPosition(columnId: string): number | null {
    return this.coordinator.getColumnPosition(columnId)
  }

  getRowPosition(rowId: string): number | null {
    return this.coordinator.getRowPosition(rowId)
  }

  getColumnCount(): number {
    return this.coordinator.getColumnCount()
  }

  // ... delegate other methods
}
```

2. Update store context to use ObservableCoordinateManager.

3. Update consumers to use `.version` in reactions for change detection.

---

### 6.2 Consolidate Virtual Scroll in VirtualViewportStore

**Goal:** Single source for visible range calculations, replacing duplicated math.

**Files to create:**
- `src/systems/vibegrid/stores/VirtualViewportStore.ts`

**Files to modify:**
- `src/systems/vibegrid/virtualization/VirtualScrollManager.ts` (delete or gut)

**Steps:**

1. Create VirtualViewportStore:
```typescript
// stores/VirtualViewportStore.ts
import { observable, computed, action, makeObservable } from 'mobx'
import { GRID_DIMENSIONS } from '../constants/grid-dimensions'

const ROW_HEIGHT = GRID_DIMENSIONS.ROW_HEIGHT

export class VirtualViewportStore {
  @observable scrollTop: number = 0
  @observable scrollLeft: number = 0
  @observable viewportWidth: number = 0
  @observable viewportHeight: number = 0
  @observable totalContentHeight: number = 0
  @observable totalContentWidth: number = 0

  constructor() {
    makeObservable(this)
  }

  @action
  updateScroll(scrollTop: number, scrollLeft: number): void {
    this.scrollTop = scrollTop
    this.scrollLeft = scrollLeft
  }

  @action
  updateViewportSize(width: number, height: number): void {
    this.viewportWidth = width
    this.viewportHeight = height
  }

  @action
  updateContentSize(width: number, height: number): void {
    this.totalContentWidth = width
    this.totalContentHeight = height
  }

  @computed
  get visibleRowRange(): { start: number; end: number } {
    const start = Math.floor(this.scrollTop / ROW_HEIGHT)
    const visibleCount = Math.ceil(this.viewportHeight / ROW_HEIGHT)
    const end = start + visibleCount + 1 // +1 for buffer
    return { start, end }
  }

  @computed
  get visibleColumnRange(): { start: number; end: number } {
    // Would need column widths to calculate precisely
    // For now, return full range (non-virtualized columns)
    return { start: 0, end: Infinity }
  }

  isRowVisible(rowIndex: number): boolean {
    const { start, end } = this.visibleRowRange
    return rowIndex >= start && rowIndex <= end
  }

  isColumnVisible(columnIndex: number): boolean {
    const { start, end } = this.visibleColumnRange
    return columnIndex >= start && columnIndex <= end
  }
}
```

2. Delete or gut `VirtualScrollManager.ts` - remove global mutable state.

3. Update ScrollController to update VirtualViewportStore:
```typescript
// In ScrollController
onScroll(event: Event) {
  const target = event.target as HTMLElement
  this.virtualViewportStore.updateScroll(target.scrollTop, target.scrollLeft)
}
```

4. Update renderer/controllers to read from VirtualViewportStore instead of computing ranges inline.

---

### 6.3 Fix useCellPosition Hook

**Goal:** Remove crash-on-import, provide working fallback.

**Files to modify:**
- `src/systems/vibegrid/hooks/use-cell-position.ts`

**Steps:**

1. Replace throw with DOM fallback:
```typescript
// use-cell-position.ts
import { useMemo } from 'react'
import { positionTracker } from '../stores/dom-position-state'
import { useVibeGridStores } from './use-vibegrid-stores'

/**
 * Get cell position for overlay positioning
 *
 * Currently uses DOM position tracking.
 * Will use virtual positions when VirtualViewportStore is complete.
 */
export function useCellPosition(cellId: string): { x: number; y: number; width: number; height: number } | null {
  const { coordinateManager } = useVibeGridStores()

  return useMemo(() => {
    if (!cellId) return null

    const [rowId, columnId] = cellId.split(':')

    // Try coordinate manager first
    const x = coordinateManager.getColumnPosition(columnId)
    const y = coordinateManager.getRowPosition(rowId)

    if (x !== null && y !== null) {
      const width = coordinateManager.getColumnWidth(columnId) ?? 100
      const height = 40 // ROW_HEIGHT
      return { x, y, width, height }
    }

    // Fall back to DOM tracking
    return positionTracker.getCellPosition(cellId)
  }, [cellId, coordinateManager])
}
```

2. Remove the hard throw.

---

### 6.4 Delete dom-position-state.ts Computed Map

**Goal:** Remove duplicate position source, rely on CoordinateManager.

**Files to modify:**
- `src/systems/vibegrid/stores/dom-position-state.ts`

**Steps:**

1. Review what `dom-position-state.ts` provides that CoordinateManager doesn't.

2. If only used for N×M position map, delete computed and use CoordinateManager.

3. If provides other functionality (DOM measurement, resize observer), keep that and remove duplicate position map.

4. Update consumers to use ObservableCoordinateManager instead.

---

### 6.5 Clean Backup Files

**Goal:** Remove confusion from non-live files.

**Files to move/delete:**
- `*.backup` files in vibegrid/
- `*.old` files in vibegrid/

**Steps:**

1. Find all backup files:
```bash
find src/systems/vibegrid -name "*.backup" -o -name "*.old"
```

2. Create archive folder if needed:
```bash
mkdir -p src/systems/vibegrid/archive
```

3. Move or delete each file:
- If potentially useful reference: `mv file.backup archive/`
- If clearly outdated: `rm file.backup`

4. Optional: Add lint rule to prevent backup file imports:
```typescript
// .eslintrc or biome.json
"no-restricted-imports": ["error", {
  "patterns": ["**/*.backup", "**/*.old"]
}]
```

---

## Milestone Checklist

### Phase 1: Quick Wins
- [ ] 1.1 Add version numbers to InteractionStore
- [ ] 1.2 Split processedRows into pipeline
- [ ] 1.3 Strongly type store dependencies
- [ ] 1.4 Add invariant assertions

### Phase 2: OverlayManager Split
- [ ] 2.1 Create controller interface and base class
- [ ] 2.2 Extract SelectionOverlayController
- [ ] 2.3 Extract EditingOverlayController
- [ ] 2.4 Extract ClipboardOverlayController
- [ ] 2.5 Extract ResizePreviewController
- [ ] 2.6 Refactor OverlayManager to use controllers

### Phase 3: MobX Improvements
- [ ] 3.1 Create useProcessedRows/useRowOffsets hooks
- [ ] 3.2 Remove keepAlive autoruns

### Phase 4: Regression Tests
- [ ] 4.1 Create test infrastructure
- [ ] 4.2 Test RAF accumulation fix
- [ ] 4.3 Test resize overlay visibility

### Phase 5: SimplePassiveRenderer Split
- [ ] 5.1 Create ViewModelProvider
- [ ] 5.2 Extract RenderScheduler
- [ ] 5.3 Type EventManager and KeyboardController
- [ ] 5.4 Clean up commented observers
- [ ] 5.5 Guard hot-path logging

### Phase 6: Virtualization & Coordinate System Cleanup
- [ ] 6.1 Make CoordinateManager observable
- [ ] 6.2 Consolidate virtual scroll in VirtualViewportStore
- [ ] 6.3 Fix useCellPosition hook
- [ ] 6.4 Delete dom-position-state.ts computed map
- [ ] 6.5 Clean backup files

---

## Critical Implementation Notes

### Phase 1.1 (Version Numbers) - Caveats

**Must increment versions in ALL mutators:**
- `selectCell()`, `selectRange()`, `toggleRow()`, `dragSelectStart/Update/End()`
- `clearSelection()`, `selectAll()`
- `setClipboard()`, `clearClipboard()`
- **No-op reselects:** Still bump version so overlay reacts when same cell is reselected

**Consider adding `columnResizeVersion`** - resize is still string-diffed in `OverlayManager.ts:300-311`

---

### Phase 1.2 (processedRows Pipeline) - Caveats

**Behavior parity for flat row ordering:**
- Current: flat row ordering used only in ungrouped mode
- Plan shows: apply only when no sorting
- **Verify:** Custom orders must not regress when sorting is off

**Row heights:**
- Plan defaults to `height: 40` in VirtualRow wrapping
- Current: `rowOffsets` reads `rows[i]?.height || 40` (`TableCoreStore.ts:986-993`)
- **Carry through real heights** where available, don't hardcode

---

### Phase 1.3 (Store Assertions) - Caveats

**Don't throw in hot paths:**
- Throwing inside `handleCellClick()`, `saveEdit()` will crash user interactions if wiring is late
- **Assert during init/wiring**, not runtime hot actions
- **Downgrade runtime checks** to invariant logs in production

**Clean up legacy bridge:**
- Type `tableCore$` path properly or remove it entirely to avoid lingering `any`

---

### Phase 1.4 (Invariants) - Caveats

**Dev-throw/prod-warn pattern:**
```typescript
function assertInvariant(condition: boolean, message: string, context?: object): asserts condition {
  if (!condition) {
    const error = new Error(`VibegGrid Invariant: ${message}`)
    console.error(error, context)
    if (process.env.NODE_ENV !== 'production') {
      throw error
    }
  }
}
```

**Include context in errors:**
```typescript
assertInvariant(
  coordinateManager.columnCount === visibleColumns.length,
  'Coordinator columns must match visible columns',
  { coordinatorCols: coordinateManager.columnIds, visibleCols: visibleColumns.map(c => c.id) }
)
```

**Frequency warning:** `updateCoordinatorWithCurrentLayout()` is called frequently - throwing will break grids on transient mismatch.

---

### Phase 2 (Controller Split) - Caveats

**RAF batching:**
- Separate controllers with own RAFs can cause multiple RAFs per frame
- **Consider shared scheduler** (per-frame queue) so selection/edit/resize updates batch together:
```typescript
class OverlayUpdateScheduler {
  private pendingUpdates: Set<string> = new Set()
  private rafHandle: number | null = null

  schedule(updateType: 'selection' | 'editing' | 'clipboard' | 'resize'): void {
    this.pendingUpdates.add(updateType)
    if (!this.rafHandle) {
      this.rafHandle = requestAnimationFrame(() => this.flush())
    }
  }

  private flush(): void {
    const updates = this.pendingUpdates
    this.pendingUpdates = new Set()
    this.rafHandle = null
    // Execute updates in priority order
  }
}
```

**Dependency on Phase 1.1:**
- Controller sketches assume `selectionVersion`/`clipboardVersion` exist
- **Sequence matters:** Land Phase 1.1 before Phase 2, or guard with feature flags

---

### Phase 3 (Remove keepAlive) - Caveats

**Non-React contexts still need observers:**
- Proposed `useProcessedRows` hook only helps React render paths
- Scroll math in stores, overlay positioning still run outside React
- **Keep a lightweight autorun in renderer shell** (not deep in store):
```typescript
// In SimplePassiveRenderer or RendererShell
this.processedRowsObserver = autorun(() => {
  const _count = this.tableCoreStore.processedRows.length
  const _offsets = this.tableCoreStore.rowOffsets.length
})
```
- This is more explicit than hidden autoruns in TableCoreStore

---

### Phase 4 (Tests) - Caveats

**Sample tests don't catch RAF bug:**
- Tests only exercise store state, not overlay behavior
- OverlayManager is never instantiated

**Fix:** Add DOM-less spies or wire minimal OverlayManager:
```typescript
describe('OverlayManager RAF accumulation', () => {
  let overlayManager: OverlayManager
  let mockCanvasOverlay: { updateSelectionWithVisualPositions: vi.Mock }

  beforeEach(() => {
    mockCanvasOverlay = {
      updateSelectionWithVisualPositions: vi.fn(),
      // ... other methods
    }

    overlayManager = new OverlayManager({
      // ... with mock overlays
    })
  })

  it('should update selection overlay after rapid edit/cancel/select', () => {
    // ... trigger state changes
    vi.runAllTimers()
    expect(mockCanvasOverlay.updateSelectionWithVisualPositions).toHaveBeenCalled()
  })
})
```

---

### Phase 5 (SimplePassiveRenderer Split) - Caveats

**Double-render risk:**
- SimplePassiveRenderer still owns column visibility/order/width observers
- If RenderScheduler also triggers renders, you get double-renders
- **Migration path:**
  1. Move column observers to RenderScheduler
  2. Delete legacy observers from SimplePassiveRenderer
  3. Test that only one render occurs per change

**EventManager refactor timing:**
- Land EventManager refactor (Phase 5.3) **before or with** RenderScheduler
- Otherwise render callbacks split across old/new APIs

---

### Phase 6 (Virtualization) - Caveats

**Variable row heights:**
- VirtualViewportStore sketch assumes fixed row height (`ROW_HEIGHT`)
- Current grid uses per-row heights and grouping rows (headers)
- **Options:**
  - Pass row height accessor to VirtualViewportStore
  - Keep existing `rowOffsets` as source of truth for Y positions:
```typescript
@computed
get visibleRowRange(): { start: number; end: number } {
  const rowOffsets = this.tableCoreStore.rowOffsets
  // Binary search to find start/end based on scrollTop
}
```

**Event emitter cleanup:**
- Making CoordinateManager observable is good
- **Ensure consumers stop subscribing to old event emitter** to avoid duplicate work

**DOM measurement responsibilities:**
- When removing `dom-position-state.ts` computed map
- **Keep any resize observer / DOM measurement logic** not covered by coordinator

---

## Sequence Dependencies

```
Phase 1.1 (versions) ─────────────────────┐
                                          │
Phase 1.3 (typing) ───────────────────────┤
                                          ▼
Phase 2 (overlay controllers) ────────────┤
                                          │
Phase 5.3 (EventManager) ─────────────────┤
                                          ▼
Phase 5.2 (RenderScheduler) ──────────────┤
                                          │
Phase 3 (remove keepAlive) ───────────────┘

Phase 6.1 + 6.2 should be done together (coordinate + virtual viewport)
```

---

## Recommended Execution Order

**The concrete short list:**

### Step 1: Lock in Phase 1.1 before anything else
- Add `selectionVersion`, `clipboardVersion`, `columnResizeVersion` to InteractionStore
- Ensure ALL entry points bump versions (test coverage required)
- **Success criteria:** OverlayManager can switch from string diffing to version comparison without behavior change

### Step 2: Define success criteria/tests for each milestone
- RAF regression test: rapid edit/cancel/select with fake timers
- Resize visibility test: selection overlay hides/shows during resize
- processedRows caching test: scroll doesn't trigger recomputation
- Add these tests BEFORE refactoring

### Step 3: Choose single source of truth for positions/virtualization
- Decision: CoordinateManager + `rowOffsets` as authoritative
- VirtualViewportStore reads from these, doesn't own position data
- New controllers built on this foundation, not shifting ground

---

## Success Criteria by Milestone

### Phase 1.1 - Version Numbers
- [ ] All selection mutators increment `selectionVersion`
- [ ] All clipboard mutators increment `clipboardVersion`
- [ ] All resize updates increment `columnResizeVersion`
- [ ] Test: No-op reselect of same cell still bumps version
- [ ] Test: OverlayManager works with version comparison (no string diff)

### Phase 1.2 - processedRows Pipeline
- [ ] Flat row ordering works in ungrouped mode with/without sorting
- [ ] Variable row heights preserved (not hardcoded 40)
- [ ] Test: Custom row order doesn't regress when sorting toggled
- [ ] Test: `rowOffsets` uses real heights from rows

### Phase 1.3 - Store Typing
- [ ] No `any` casts for store references
- [ ] Init-time assertions throw if stores not wired
- [ ] Runtime assertions log in prod, don't crash
- [ ] Test: Late wiring logs warning, doesn't crash clicks

### Phase 2 - Overlay Controllers
- [ ] Single RAF scheduler batches all overlay updates
- [ ] Controllers use version comparison, not string diff
- [ ] Test: Rapid state changes result in single RAF per frame
- [ ] Test: Selection overlay updates correctly after edit cancel

### Phase 3 - Remove keepAlive
- [ ] Renderer-level autorun keeps computeds warm
- [ ] Hook consumed by React render path
- [ ] Test: Scroll after edit doesn't recompute processedRows
- [ ] Test: Store-side consumers still get cached values

### Phase 5 - SimplePassiveRenderer Split
- [ ] No double-renders (scheduler + legacy observers)
- [ ] EventManager uses typed MobX stores
- [ ] Test: Column visibility change triggers single render
- [ ] Test: No `as any` casts in EventManager

### Phase 6 - Virtualization
- [ ] VirtualViewportStore uses `rowOffsets` for variable heights
- [ ] CoordinateManager observable (version bump on updates)
- [ ] `useCellPosition` has working fallback (no throw)
- [ ] Test: Visible range correct with variable row heights
- [ ] Test: Position changes trigger overlay updates

---

## Pre-Refactor Checklist

Before starting any phase:

- [ ] **Tests first:** Write failing tests for the behavior you're preserving
- [ ] **Single source of truth decided:** Positions come from CoordinateManager + rowOffsets
- [ ] **Phase 1.1 landed:** Version numbers in place for controllers to use
- [ ] **Backup files cleaned:** `*.backup`, `*.old` moved to archive or deleted

---

## Notes

- Each phase can be merged independently **respecting sequence dependencies above**
- Run `pnpm typecheck` and `pnpm test` after each step
- Manual testing required for overlay behavior
- Consider feature flag for Phase 2 rollout if concerned about risk
- Phase 5 can be done incrementally - each step is independent
- Phase 6.1 and 6.2 should be done together - they're tightly coupled
