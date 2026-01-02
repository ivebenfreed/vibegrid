# VibeGrid Manager Consolidation

## Overview
This document tracks the consolidation of separate manager classes into the centralized state stores to eliminate duplication and create single sources of truth.

## Consolidation Status

### ✅ Completed Consolidations

#### 1. SelectionManager → interaction-state.ts
**Previous State:**
- `SelectionManager.ts` maintained its own selection state (selectedCells, selectedRows, editingCell)
- Duplicated state that already existed in interaction-state
- Required synchronization between manager and store

**Consolidated State:**
- All selection state now lives in `interaction-state.ts`
- Added visual update methods directly to interaction state:
  - `updateCellSelectionVisuals()` - Updates DOM classes for selected cells
  - `updateRowSelectionVisuals()` - Updates DOM classes for selected rows
  - `updateEditingCellVisual()` - Updates DOM state for editing cells
- Eliminated state duplication and sync issues

#### 2. ViewportManager → visual-state.ts
**Previous State:**
- `ViewportManager.ts` handled viewport calculations and scroll coordination
- Duplicated viewport geometry calculations that existed in visual-state
- Maintained separate scroll position tracking

**Consolidated State:**
- All viewport operations now in `visualOperations` within `visual-state.ts`
- Added viewport methods:
  - `handleViewportScroll()` - Unified scroll handling
  - `updateViewportDimensions()` - Viewport size updates
  - `getVisibleColumnRange()` - Column virtualization
  - `getVisibleRowRange()` - Row virtualization
  - `isColumnInViewport()` - Visibility checks
  - `scrollToColumn()` - Programmatic column scrolling
  - `scrollToRow()` - Programmatic row scrolling
- Single source of truth for all viewport state

### 🔄 Pending Consolidations

#### 3. VirtualScrollManager → visual-state.ts
**Current Issues:**
- Small file (4KB) with virtualization calculations
- These calculations partially exist in visual-state already
- Can be fully integrated into visual-state's computed properties

**Consolidation Plan:**
- Move virtual range calculations to visual-state computed properties
- Integrate buffer calculations into viewport geometry
- Remove separate manager file

#### 4. ColumnManager → visual-state.ts
**Current Issues:**
- Column width, visibility, ordering already tracked in visual-state
- Manager duplicates this functionality
- Causes synchronization issues

**Consolidation Plan:**
- Already have column operations in visualOperations
- Need to remove ColumnManager references
- Update components to use visual-state directly

#### 5. StateManager → Split between stores
**Current Issues:**
- Acts as a coordinator between other managers
- No unique state of its own
- Just orchestrates other managers

**Consolidation Plan:**
- Distribute coordination logic to appropriate stores
- Batch update logic can be handled by stores directly
- Remove unnecessary abstraction layer

### ❌ Files to Keep Separate

These files should remain as they serve different purposes:

- **CellRenderer.ts** - Rendering utility for creating cell DOM elements
- **RowRenderer.ts** - Rendering utility for creating row DOM elements
- **EventManager.ts** - Event handling and delegation logic
- **HeaderRenderer.ts** - Header-specific rendering logic

## Benefits Achieved

1. **Eliminated State Duplication**
   - No more duplicate selection state between SelectionManager and interaction-state
   - Single viewport state instead of multiple sources

2. **Simplified Architecture**
   - Fewer files to maintain
   - Clearer data flow
   - Reduced coupling between components

3. **Better Performance**
   - No synchronization overhead between managers and stores
   - Direct state updates without intermediary layers
   - Computed properties automatically optimize recalculations

4. **Improved Developer Experience**
   - Clear single sources of truth
   - Easier to debug state issues
   - Less boilerplate code

## Migration Guide

### For Components Using SelectionManager

**Before:**
```typescript
const selectionManager = new SelectionManager({...});
selectionManager.setSelectedCells(cells);
const selected = selectionManager.getSelectedCells();
```

**After:**
```typescript
// Use interaction state directly
tableInteraction$.selectedCells.set(cells);
const selected = tableInteraction$.selectedCells.get();

// For visual updates
tableInteraction$.updateCellSelectionVisuals(getCellElement);
```

### For Components Using ViewportManager

**Before:**
```typescript
const viewportManager = new ViewportManager({...});
viewportManager.handleScroll(scrollLeft, scrollTop);
const range = viewportManager.getVisibleColumnRange();
```

**After:**
```typescript
// Use visual operations directly
visualOperations.handleViewportScroll(scrollLeft, scrollTop);
const range = visualOperations.getVisibleColumnRange();
```

## Next Steps

1. Complete consolidation of VirtualScrollManager
2. Remove ColumnManager references
3. Distribute StateManager logic
4. Update all components to use consolidated state
5. Delete deprecated manager files
6. Update tests to reflect new architecture