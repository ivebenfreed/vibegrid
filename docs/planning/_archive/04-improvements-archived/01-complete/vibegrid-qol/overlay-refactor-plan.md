# Overlay Refactor Plan: Fix Fill Preview Z-Index Issue

**Date:** 2025-11-21
**Session:** session-2
**Issue:** Fill preview rendering underneath selection border despite higher z-index

---

## Root Cause Analysis

### The Problem

**Observed Behavior:**
- Fill preview has z-index 102 (higher than selection's 101)
- Fill preview still renders underneath selection border
- Selection overlay re-renders during fill drag, re-appending elements

**Root Cause:**
1. **Architectural Inconsistency**
   - `FillHandleLayerDOM`: Uses persistent containers appended once at init
   - `SelectionOverlayDOM`: Removes and re-creates elements on every update

2. **DOM Order Instability**
   - Selection elements removed via `element.remove()` (SelectionOverlayDOM.ts:72-76)
   - New selection elements created and appended (SelectionOverlayDOM.ts:128)
   - Re-appending during drag changes paint order, covering fill preview

3. **Reactive Trigger**
   - MobX reaction in OverlayManager tracks `selectedCells` observable
   - Selection changes during fill drag trigger `performCanvasSelectionUpdate()`
   - Selection overlay tears down and rebuilds, creating layering issue

### Current DOM Structure

```
overlayContainer (z-index: 1000)
├── previewContainer (z-index: 102) ← FillHandleLayerDOM, persistent
│   └── fill preview elements
├── fillHandleContainer (z-index: 20) ← FillHandleLayerDOM, persistent
│   └── fill handle
└── selection elements (z-index: 101) ← SelectionOverlayDOM, re-created on every update
```

---

## Solution: Container-Based Selection Architecture

### Design Decisions

**Q1: Keep merged rectangle or go per-cell?**
- **Decision:** Keep merged rectangle optimization
- **Rationale:** Performance win for large selections, matches Excel/Sheets UX
- **Implementation:** Single reusable element updated in place

**Q2: How should suspendSelectionOverlay() behave?**
- **Decision:** Hide container, don't destroy
- **Rationale:** Matches FillHandleLayerDOM pattern (hideFillHandle), preserves state
- **Implementation:** Toggle `display: none` instead of remove/recreate

---

## Implementation Phases

### Phase 1: Complete Z-Index Constants

**File:** `src/systems/vibegrid/constants/grid-dimensions.ts`

**Current State (lines 45-55):**
```typescript
Z_INDEX: {
  TABLE_CONTENT: 1,
  OVERLAYS: 100,
  CLIPBOARD: 100.5,      // ❌ Fractional value unreliable
  SELECTION: 101,
  EDITING: 102,
  DRAG_PREVIEW: 103,
  CONTEXT_MENU: 104,
  MODAL_BACKDROP: 9990,
  MODAL_CONTENT: 9999
}
```

**Required Changes:**
```typescript
Z_INDEX: {
  TABLE_CONTENT: 1,
  OVERLAYS: 100,           // Base overlay layer
  CLIPBOARD: 100,          // ✅ CHANGED: Removed fractional, same as base
  SELECTION: 101,          // Selection highlighting
  FILL_PREVIEW: 102,       // ✅ NEW: Fill drag preview (above selection)
  FILL_HANDLE: 103,        // ✅ NEW: Fill handle knob (above preview)
  EDITING: 104,            // ✅ CHANGED: Active cell editor (bumped from 102)
  DRAG_PREVIEW: 105,       // ✅ CHANGED: Row/column drag (bumped from 103)
  CONTEXT_MENU: 106,       // ✅ CHANGED: Context menus (bumped from 104)
  MODAL_BACKDROP: 9990,
  MODAL_CONTENT: 9999
}
```

**Changes Summary:**
- Remove fractional 100.5 (cross-browser reliability)
- Add FILL_PREVIEW (102) and FILL_HANDLE (103)
- Bump EDITING, DRAG_PREVIEW, CONTEXT_MENU to maintain hierarchy
- All integer values

---

### Phase 2: SelectionOverlayDOM Refactor

**File:** `src/systems/vibegrid/overlays/SelectionOverlayDOM.ts`

**Key Changes:**
1. Add persistent `selectionContainer` (appended once in constructor)
2. Keep merged rectangle optimization (performance)
3. Replace tear-down (lines 72-76) with diffing logic
4. Add hide()/show() methods for suspend/resume
5. Update destroy() to remove persistent container

**New Class Structure:**
```typescript
export class SelectionOverlayDOM {
  private container: HTMLElement;
  private selectionContainer: HTMLDivElement | null = null; // ✅ NEW
  private config: SelectionOverlayConfig;

  // ✅ KEEP: Single merged element for performance
  private mergedElement: HTMLDivElement | null = null;

  // ✅ NEW: Track bounds to avoid unnecessary updates
  private lastBounds: { minX: number; minY: number; maxX: number; maxY: number } | null = null;

  constructor(container: HTMLElement, config: SelectionOverlayConfig) {
    this.container = container;
    this.config = config;
    this.initializeContainer(); // ✅ NEW: Create container immediately
  }
```

**Implementation Details:**

#### 2.1: Initialize Container (NEW METHOD)

```typescript
/**
 * Create persistent selection container (called once in constructor)
 */
private initializeContainer(): void {
  this.selectionContainer = document.createElement('div');
  this.selectionContainer.className = 'vibegridx-selection-container';
  Object.assign(this.selectionContainer.style, {
    position: 'absolute',
    top: '0',
    left: '0',
    right: '0',
    bottom: '0',
    pointerEvents: 'none',
    zIndex: `${GRID_DIMENSIONS.Z_INDEX.SELECTION}` // 101
  });

  this.container.appendChild(this.selectionContainer); // ✅ Appended ONCE

  myLog.info('SelectionOverlayDOM: Container initialized', {
    zIndex: GRID_DIMENSIONS.Z_INDEX.SELECTION
  });
}
```

#### 2.2: Update Method with Diffing (REPLACE lines 60-149)

```typescript
/**
 * Update with diffing instead of tear-down
 * REPLACES: Lines 60-149 (entire updateWithVisualPositions method)
 */
updateWithVisualPositions(visualCells: VisualCellPosition[]): void {
  if (!this.selectionContainer) return;

  if (visualCells.length === 0) {
    // Clear selection
    this.hideMergedElement();
    this.lastBounds = null;
    return;
  }

  // ✅ KEEP: Calculate merged bounding box (lines 92-102 logic preserved)
  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;

  for (const cell of visualCells) {
    minX = Math.min(minX, cell.x);
    minY = Math.min(minY, cell.y);
    maxX = Math.max(maxX, cell.x + cell.width);
    maxY = Math.max(maxY, cell.y + cell.height);
  }

  // ✅ NEW: Diff against previous bounds
  const boundsChanged = !this.lastBounds ||
    this.lastBounds.minX !== minX ||
    this.lastBounds.minY !== minY ||
    this.lastBounds.maxX !== maxX ||
    this.lastBounds.maxY !== maxY;

  if (!boundsChanged) {
    myLog.debug('SelectionOverlayDOM: Bounds unchanged, skipping update');
    return; // ✅ Skip unnecessary DOM updates
  }

  this.lastBounds = { minX, minY, maxX, maxY };

  // ✅ REUSE: Update existing element or create if needed
  if (!this.mergedElement) {
    // First time: create element
    this.mergedElement = document.createElement('div');
    this.mergedElement.className = 'vibegridx-selection-overlay vibegridx-selection-merged';

    Object.assign(this.mergedElement.style, {
      position: 'absolute',
      pointerEvents: 'none',
      backgroundColor: this.config.selectionColor,
      border: `${this.config.borderWidth}px solid ${this.config.selectionBorderColor}`,
      boxSizing: 'border-box',
      left: `${minX}px`,
      top: `${minY}px`,
      width: `${maxX - minX}px`,
      height: `${maxY - minY}px`,
      opacity: '0', // Start invisible for animation
      transform: 'scale(0.98)',
      transition: 'opacity 200ms ease-out, transform 200ms ease-out, left 150ms ease-out, top 150ms ease-out, width 150ms ease-out, height 150ms ease-out',
      borderRadius: '3px'
    });

    this.selectionContainer.appendChild(this.mergedElement); // ✅ Append to persistent container

    // Trigger animation
    requestAnimationFrame(() => {
      if (this.mergedElement) {
        this.mergedElement.style.opacity = '1';
        this.mergedElement.style.transform = 'scale(1)';
      }
    });

    myLog.info('SelectionOverlayDOM: Created merged selection', {
      bounds: { minX, minY, maxX, maxY }
    });
  } else {
    // ✅ UPDATE: Just update position/size (NO remove/re-append)
    Object.assign(this.mergedElement.style, {
      left: `${minX}px`,
      top: `${minY}px`,
      width: `${maxX - minX}px`,
      height: `${maxY - minY}px`
    });

    myLog.debug('SelectionOverlayDOM: Updated merged selection', {
      bounds: { minX, minY, maxX, maxY }
    });
  }
}
```

#### 2.3: Hide/Show Methods (NEW)

```typescript
/**
 * Hide selection overlay (for suspendSelectionOverlay)
 */
hide(): void {
  if (this.selectionContainer) {
    this.selectionContainer.style.display = 'none';
  }
  myLog.debug('SelectionOverlayDOM: Hidden');
}

/**
 * Show selection overlay (after resume)
 */
show(): void {
  if (this.selectionContainer) {
    this.selectionContainer.style.display = 'block';
  }
  myLog.debug('SelectionOverlayDOM: Shown');
}

/**
 * Hide merged element with animation
 */
private hideMergedElement(): void {
  if (this.mergedElement) {
    this.mergedElement.style.opacity = '0';
    this.mergedElement.style.transform = 'scale(0.98)';
  }
}
```

#### 2.4: Update Destroy Method (MODIFY lines 372-382)

```typescript
/**
 * Destroy overlay and clean up
 * REPLACES: Lines 372-382
 */
destroy(): void {
  this.lastBounds = null; // ✅ NEW: Clear bounds cache

  if (this.mergedElement) {
    this.mergedElement.remove();
    this.mergedElement = null;
  }

  // ✅ NEW: Remove persistent container
  if (this.selectionContainer) {
    this.selectionContainer.remove();
    this.selectionContainer = null;
  }

  myLog.info('SelectionOverlayDOM: Destroyed');
}
```

**Lines to Remove:**
- Lines 72-76: Element removal loop (replaced by diffing)
- Lines 22-29: `selectionElements` Map (replaced by single `mergedElement`)
- Lines 151-237: `addOrUpdateSelectionElement` and `removeSelectionElement` methods (no longer needed)

---

### Phase 3: FillHandleLayerDOM - Use Constants

**File:** `src/systems/vibegrid/overlays/FillHandleLayerDOM.ts`

**Add Import (top of file):**
```typescript
import { GRID_DIMENSIONS } from '../constants/grid-dimensions';
```

**Change 1: fillHandleContainer z-index (line 74)**
```typescript
// BEFORE:
zIndex: '20'

// AFTER:
zIndex: `${GRID_DIMENSIONS.Z_INDEX.FILL_HANDLE}` // 103
```

**Change 2: previewContainer z-index (line 87)**
```typescript
// BEFORE:
zIndex: '102' // Above selection (101), below editing (102)

// AFTER:
zIndex: `${GRID_DIMENSIONS.Z_INDEX.FILL_PREVIEW}` // 102
```

**Change 3: fillHandle element z-index (line 183)**
```typescript
// BEFORE:
zIndex: '25',

// AFTER:
zIndex: `${GRID_DIMENSIONS.Z_INDEX.FILL_HANDLE}`, // 103
```

**Change 4: preview element z-index (line 334)**
```typescript
// BEFORE:
zIndex: '102', // Match container - above selection (101)

// AFTER:
zIndex: `${GRID_DIMENSIONS.Z_INDEX.FILL_PREVIEW}`, // 102
```

---

### Phase 4: CanvasOverlayDOM - Initialize in Order

**File:** `src/systems/vibegrid/overlays/CanvasOverlayDOM.ts`

**Replace preInitializeOverlays method (lines 113-131):**

```typescript
/**
 * Pre-initialize overlays in z-index order (bottom to top)
 * This ensures predictable DOM stacking
 * REPLACES: Lines 113-131
 */
private preInitializeOverlays(): void {
  if (!this.overlayContainer) {
    return;
  }

  fileLog.debug('CanvasOverlayDOM: Pre-initializing overlays in z-index order');

  // Create containers in ascending z-index order
  // Each overlay creates its persistent container on instantiation
  try {
    this.getClipboardOverlay();    // Z_INDEX.CLIPBOARD = 100
    this.getSelectionOverlay();    // Z_INDEX.SELECTION = 101
    this.getFillHandleLayer();     // Z_INDEX.FILL_PREVIEW = 102, FILL_HANDLE = 103

    // Future overlays added here in z-index order

    fileLog.debug('CanvasOverlayDOM: All critical overlays pre-initialized', {
      order: ['clipboard', 'selection', 'fill'],
      zIndexOrder: [
        GRID_DIMENSIONS.Z_INDEX.CLIPBOARD,
        GRID_DIMENSIONS.Z_INDEX.SELECTION,
        GRID_DIMENSIONS.Z_INDEX.FILL_PREVIEW
      ]
    });
  } catch (error) {
    fileLog.error('CanvasOverlayDOM: Failed to pre-initialize overlays', error);
  }
}
```

**Add accessor method (after line 158):**

```typescript
/**
 * Get selection overlay instance (for hide/show during operations)
 */
getSelectionOverlay(): SelectionOverlayDOM | null {
  return this.selectionOverlay;
}
```

---

### Phase 5: OverlayManager - Update Suspend Logic

**File:** `src/systems/vibegrid/renderers/modules/OverlayManager.ts`

**Change 1: During column resize start (lines 293-298)**

```typescript
// BEFORE:
if (isColumnResizing && this.canvasOverlay) {
  if (!wasColumnResizing) {
    fileLog.debug('[RESIZE] Selection overlay suspended for column resize');
    this.canvasOverlay.suspendSelectionOverlay();
    this.canvasOverlay.hideFillHandle();
  }
}

// AFTER:
if (isColumnResizing && this.canvasOverlay) {
  if (!wasColumnResizing) {
    fileLog.debug('[RESIZE] Selection overlay hidden for column resize');
    const selectionOverlay = this.canvasOverlay.getSelectionOverlay();
    if (selectionOverlay) {
      selectionOverlay.hide(); // ✅ Just hide, don't destroy
    }
    this.canvasOverlay.hideFillHandle();
  }
}
```

**Change 2: During column resize end (lines 299-310)**

```typescript
// BEFORE:
} else if (wasColumnResizing && !isColumnResizing) {
  fileLog.debug('[RESIZE] Column resize ended, selection overlay may be restored', {
    selectedCount: state.selectedCells.size
  });

  if (state.selectedCells.size > 0) {
    this.performCanvasSelectionUpdate(state.selectedCells);
  } else if (this.canvasOverlay) {
    this.canvasOverlay.updateSelectionWithVisualPositions([]);
    this.canvasOverlay.hideFillHandle();
  }
}

// AFTER:
} else if (wasColumnResizing && !isColumnResizing) {
  fileLog.debug('[RESIZE] Column resize ended, restoring selection overlay', {
    selectedCount: state.selectedCells.size
  });

  // ✅ Show selection container again
  if (this.canvasOverlay) {
    const selectionOverlay = this.canvasOverlay.getSelectionOverlay();
    if (selectionOverlay) {
      selectionOverlay.show(); // ✅ Restore visibility
    }
  }

  if (state.selectedCells.size > 0) {
    this.performCanvasSelectionUpdate(state.selectedCells);
  } else if (this.canvasOverlay) {
    this.canvasOverlay.updateSelectionWithVisualPositions([]);
    this.canvasOverlay.hideFillHandle();
  }
}
```

**Optional: Remove suspendSelectionOverlay method from CanvasOverlayDOM**
- Lines 429-437 in CanvasOverlayDOM.ts can be removed (method no longer needed)
- Or keep as deprecated wrapper calling hide()

---

### Phase 6: ClipboardOverlayDOM - Verify Container Pattern

**File:** `src/systems/vibegrid/overlays/ClipboardOverlayDOM.ts`

**Verify it already uses persistent container pattern:**
- Check lines 40-59 for container initialization
- Should already append overlayContainer once in constructor
- Z-index should reference GRID_DIMENSIONS.Z_INDEX.CLIPBOARD (100)

**If using hardcoded z-index, update to:**
```typescript
zIndex: `${GRID_DIMENSIONS.Z_INDEX.CLIPBOARD}` // 100
```

---

## Target DOM Structure (After Refactor)

```
overlayContainer (z-index: 1000) ← Creates stacking context
├── clipboardContainer (z-index: 100) ← ClipboardOverlayDOM, persistent
│   └── clipboard indicator elements
├── selectionContainer (z-index: 101) ← SelectionOverlayDOM, persistent ✅ NEW
│   └── merged selection element (reused)
├── previewContainer (z-index: 102) ← FillHandleLayerDOM, persistent
│   └── fill preview elements
└── fillHandleContainer (z-index: 103) ← FillHandleLayerDOM, persistent
    └── fill handle knob
```

**Key improvements:**
- ✅ All containers appended once at initialization
- ✅ Predictable DOM order (clipboard → selection → fill preview → fill handle)
- ✅ Stable z-index hierarchy
- ✅ Elements updated in place (no remove/re-append)

---

## Testing Checklist

### Functional Tests
```
[ ] Selection displays correctly (single cell)
[ ] Selection displays correctly (multi-cell rectangular range)
[ ] Selection updates smoothly during drag-select (no flicker)
[ ] Selection border visible and correct color
[ ] Fill handle appears at bottom-right of selection
[ ] Fill handle appears in checkbox column for row selections
[ ] Fill preview appears when dragging fill handle
[ ] Fill preview shows correct cells (matches drag target)
[ ] Fill preview border is dashed and blue
```

### Z-Index Tests
```
[ ] Fill preview appears ABOVE selection border (primary fix)
[ ] Fill preview stays above selection during long drags
[ ] Fill preview visible even when selection updates
[ ] Clipboard indicators appear below selection
[ ] Editing overlay appears above fill preview
[ ] Context menu appears above all overlays
[ ] Modal backdrop/content appear above everything
```

### Interaction Tests
```
[ ] Column resize hides selection overlay (no visual artifacts)
[ ] Column resize hides fill handle
[ ] Column resize restores selection after complete
[ ] Selection visible after column resize ends
[ ] Fill handle reappears after column resize if selection exists
[ ] No flicker or DOM thrashing during rapid selection changes
[ ] Keyboard navigation updates selection smoothly
[ ] Copy/paste operations don't interfere with layering
```

### Performance Tests
```
[ ] Selection updates don't cause full DOM rebuild
[ ] No visible lag when selecting large ranges (100+ cells)
[ ] Fill drag is smooth (60fps) even with large preview
[ ] Memory inspector shows no leaked elements after destroy()
[ ] RequestAnimationFrame used appropriately (no RAF spam)
[ ] Bounds diffing prevents unnecessary style updates
```

### Edge Cases
```
[ ] Empty selection clears overlay correctly
[ ] Single cell selection works
[ ] Full row selection positions fill handle in checkbox column
[ ] Rapid selection changes don't cause z-index issues
[ ] Switching between sheets/tables cleans up overlays
[ ] Destroy() removes all containers and elements
[ ] Re-initialization after destroy works correctly
```

---

## Implementation Order

1. ✅ **Phase 1** (Z-Index Constants)
   - Foundation change, no breaking behavior
   - Update `grid-dimensions.ts`
   - Verify no compilation errors

2. ✅ **Phase 2** (SelectionOverlayDOM)
   - Core refactor, most complex
   - Add persistent container
   - Replace tear-down with diffing
   - Test thoroughly before proceeding

3. ✅ **Phase 3** (FillHandleLayerDOM)
   - Simple constant swap
   - Update hardcoded z-index values
   - Verify fill preview rendering

4. ✅ **Phase 4** (CanvasOverlayDOM)
   - Update initialization order
   - Add accessor method
   - Verify preInitializeOverlays sequence

5. ✅ **Phase 5** (OverlayManager)
   - Update suspend/resume logic
   - Replace destroy with hide/show
   - Test column resize interaction

6. ✅ **Phase 6** (ClipboardOverlayDOM)
   - Verify container pattern
   - Update z-index if needed
   - Ensure consistency

---

## Estimated Time

**Development:**
- Phase 1: 30 minutes (constants)
- Phase 2: 2-3 hours (SelectionOverlayDOM core refactor)
- Phase 3: 30 minutes (FillHandleLayerDOM constants)
- Phase 4: 30 minutes (CanvasOverlayDOM init order)
- Phase 5: 1 hour (OverlayManager suspend logic)
- Phase 6: 15 minutes (ClipboardOverlayDOM verification)

**Testing:**
- Functional: 1 hour
- Z-Index: 30 minutes
- Interactions: 1 hour
- Performance: 30 minutes

**Total: 6-8 hours** (including testing and debugging)

---

## Risk Mitigation

**High Risk:**
- Phase 2 (SelectionOverlayDOM) - Core architecture change
  - Mitigation: Test each method independently
  - Rollback plan: Keep old implementation commented for reference

**Medium Risk:**
- Phase 5 (OverlayManager) - Suspend/resume logic
  - Mitigation: Test column resize + selection combinations
  - Fallback: Can keep destroy/recreate pattern if hide/show causes issues

**Low Risk:**
- Phases 1, 3, 4, 6 - Simple constant/pattern updates
  - Mitigation: TypeScript will catch most issues at compile time

---

## Success Criteria

**Primary Goal:**
- ✅ Fill preview renders visibly above selection border in all scenarios

**Secondary Goals:**
- ✅ No performance regression (selection updates remain smooth)
- ✅ Architectural consistency (all overlays use container pattern)
- ✅ Memory efficient (no leaked DOM elements)
- ✅ Maintainable (clear z-index hierarchy, predictable DOM structure)

**Acceptance Test:**
1. Select multiple cells
2. Drag fill handle downward 10 rows
3. **Expected:** Blue dashed fill preview appears ABOVE selection border
4. **Expected:** Preview stays above border throughout entire drag
5. **Expected:** No flicker or z-index fighting

---

## Future Enhancements

After successful implementation:
- [ ] Add validation overlay layer (z-index 107 for error indicators)
- [ ] Add comment overlay layer (z-index 108 for cell comments)
- [ ] Implement non-contiguous selection support (multiple rectangles)
- [ ] Add animation system for overlay transitions
- [ ] Create overlay debugging panel (show/hide layers, z-index inspector)

---

## References

**Modified Files:**
- `src/systems/vibegrid/constants/grid-dimensions.ts` (Z-index constants)
- `src/systems/vibegrid/overlays/SelectionOverlayDOM.ts` (Core refactor)
- `src/systems/vibegrid/overlays/FillHandleLayerDOM.ts` (Use constants)
- `src/systems/vibegrid/overlays/CanvasOverlayDOM.ts` (Init order, accessor)
- `src/systems/vibegrid/renderers/modules/OverlayManager.ts` (Suspend logic)
- `src/systems/vibegrid/overlays/ClipboardOverlayDOM.ts` (Verify pattern)

**Related Documentation:**
- See session analysis: `sessions/2025-11-21/session-2/overlay-analysis.md` (this conversation)
- Original issue: Fill preview z-index bug (commits 76e93aaf, 442632c0)

---

**END OF PLAN**
