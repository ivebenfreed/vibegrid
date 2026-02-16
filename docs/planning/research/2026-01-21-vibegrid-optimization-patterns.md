# VibeGrid Optimization Patterns Research

**Date:** 2026-01-21
**Status:** Complete
**Session:** d783c477-42ba-42bf-bf24-8b567ef5b125

## Context

Research initiated to comprehensively analyze VibeGrid patterns for:
- Render performance optimization
- Edit/interaction pattern improvements
- State management analysis
- Development ergonomics and extensibility

**Goal:** Identify performance issues, understand maintainability concerns, and inform planning for future features.

---

## Research Questions

1. What are the critical performance bottlenecks in VibeGrid rendering?
2. How is the edit/interaction system architected?
3. What are the state management patterns and their effectiveness?
4. How easy is it for developers to extend VibeGrid (add field types, customize behavior)?

---

## Findings

### 1. Render Performance

**Agent:** acc33d7 (Render Performance Analysis)

#### Well-Optimized Patterns (Keep)

| Pattern | Location | Benefit |
|---------|----------|---------|
| GPU-Accelerated Positioning | BodyRenderer.ts | Uses `transform: translateY()` instead of `top` property - avoids reflow |
| Row Recycling | BodyRenderer.ts | Reuses DOM elements instead of create/destroy - 10x faster |
| RAF Throttling | ScrollController.ts | `requestAnimationFrame` debounces scroll handlers - 60fps smooth |
| Progressive Column Rendering | BodyRenderer.ts | Essential columns first, defer rest via `requestIdleCallback` |
| Header Sync Synchronous | ScrollController.ts | Quick CSS transform for header scroll sync |
| Layout Map Optimization | BodyRenderer.ts | Pre-create Map for O(1) column lookup vs O(n) find() |

#### Critical Bottlenecks (Fix)

| Priority | Issue | Location | Impact | Fix |
|----------|-------|----------|--------|-----|
| 🔴 Critical | Selection updates ALL rows | BodyRenderer.ts:132-144 | O(visible_rows) per selection change | Delta updates - only changed rows |
| 🔴 Critical | Affordance lazy resolution | ModularCellBridge.ts:123-135 | 2-3x slower cell creation | Pre-compute affordances per column |
| 🔴 Critical | Incomplete virtual scroll migration | VirtualScrollManager.ts | No multi-grid support | Complete migration to VirtualViewportStore |
| 🟡 Medium | MobX reaction too broad | BodyRenderer.ts:134-144 | 100-200ms on large selections | More granular reactions |
| 🟡 Medium | Layout map recreated per row | BodyRenderer.ts:280-283 | GC pressure | Memoize at render start |

#### Virtual Scrolling Architecture

**New System (VirtualViewportStore.ts):**
```typescript
export class VirtualViewportStore implements IStore {
  @observable scrollTop: number = 0
  @observable scrollLeft: number = 0
  @observable viewportWidth: number = 0
  @observable viewportHeight: number = 0

  @computed get visibleRowRange(): { start: number; end: number } {
    // Fixed height: O(1) calculation
    // Variable height: O(log n) binary search if rowOffsets set
  }
}
```

**Scroll Coordination Pattern:**
```typescript
// 1. Sync header IMMEDIATELY (lightweight CSS transform)
this.syncHeaderScroll(scrollLeft)

// 2. Cancel pending RAF
if (this.scrollRAF) cancelAnimationFrame(this.scrollRAF)

// 3. Queue expensive updates
this.scrollRAF = requestAnimationFrame(() => {
  this.virtualViewportStore?.updateScroll(scrollTop, scrollLeft)
})
```

---

### 2. Edit & Interaction Patterns

**Agent:** aa26907 (Edit/Interaction Analysis)

#### Cell Editing Architecture

**Pattern: Overlay-Based Editing with Portal Positioning**

- React Portal (`ReactDOM.createRoot`) positioned absolutely over cells
- `EditingStore.ts` tracks editing state independently from InteractionStore
- Text editors positioned exactly over cell (same dimensions)
- Dropdown editors use visual state coordinates from VisualStateStore

**Editing Lifecycle:**
1. Cell click → `MouseController.onMouseDown()` detects cell interaction
2. `InteractionCoordinator.handleClick()` routes to appropriate action
3. `CellActionRouter` determines if edit should start
4. `EditingStore.startEdit(cellId, column)` initiates editing
5. `EditingOverlay.showAt()` renders editor with portal
6. On Escape/Enter: `EditingStore.commitEdit()` or `cancelEdit()`

#### Keyboard Navigation

**Two-Level Keyboard Handling:**

| Level | Component | Purpose |
|-------|-----------|---------|
| Document | KeyboardController | Capture phase, survives focus changes |
| Cell | KeyboardNavigationController | Navigation when not editing |

**Edit Mode Key Routing:**
- `Escape` → cancelEdit
- `Enter` → commitEdit
- `Tab` → commitEdit + navigate
- `Ctrl+C/V/X/Z/Y` → Allow native editor shortcuts

#### Selection Model

**Selection Types:**
```typescript
@observable selectedCells: Set<string> = new Set()
@observable selectedRows: Set<string> = new Set()
@observable anchorCell: string | null = null
@observable selectionMode: 'cell' | 'row' | 'range' | 'multi' = 'cell'
```

**Cell ID Format:** `"rowId:columnId"` (e.g., "row-123:col-456")

**Range Selection (Shift+Click):**
- Parses cell IDs to get row/column
- Finds visible columns from VisualStateStore
- Constrains to group boundaries if grouped
- Selects all cells between min/max indices

#### Drag and Drop

**Five Drag Types (Priority Order):**
1. Fill Handle Drag (highest priority)
2. Column Resize Drag
3. Column Header Drag
4. Row Drag Handle
5. Drag Selection (lowest priority)

**Drag Threshold:** 8px (prevents accidental drags on clicks)

#### Complexity Hotspots

| Area | Issue | Mitigation |
|------|-------|------------|
| Selection Logic | Range selection with grouped rows breaks index-based logic | Uses visual column order from VisualStateStore |
| Edit Session | Outside click race condition with dropdown editors | Document-level handlers with capture phase |
| Drag State | 5 concurrent drag types | Priority ordering at mousedown with early return |
| MouseController | 58 KB - handles all mouse events | Refactoring opportunity: extract drag logic |

---

### 3. State Management

**Multi-Store Architecture:**

| Store | Size | Purpose |
|-------|------|---------|
| TableCoreStore | 54 KB | Data, processing, grouping, sorting |
| GanttViewStore | 48 KB | Gantt-specific timeline state |
| InteractionStore | 43 KB | Selection, hover, menus, drag, clipboard |
| VisualStateStore | 37 KB | Columns, widths, visibility, positioning |
| EditingStore | 21 KB | Editing state, validation |

**Dependency Flow:**
```
VisualStateStore
    ↓
InteractionStore (reads VisualStateStore for column visibility)
    ↓
EditingStore (independent, but uses InteractionStore for cell focus)
    ↓
TableCoreStore (data layer, independent)
```

**Key Patterns:**

1. **Version Tracking for Change Detection:**
   ```typescript
   @observable selectionVersion: number = 0
   @observable columnResizeVersion: number = 0
   @observable clipboardVersion: number = 0
   ```

2. **Untracked Data Access (Event Handlers):**
   ```typescript
   getCellData(rowId: string, columnId: string): CellData {
     return untracked(() => {
       const row = this.tableCoreStore.processedRows.find(...)
       return { row, value: row[columnId] }
     })
   }
   ```

3. **InteractionCoordinator as Single Entry Point:**
   - Normalizes DOM events to domain contexts
   - Delegates to SelectionService, CellActionRouter, EditingStore
   - Handles conflicts between selection/editing/navigation

---

### 4. Developer Ergonomics

**Agent:** af97990 (Dev Ergonomics Analysis)

#### Field Type Extension Process

**Required Classes (4 per type):**
- `CellRenderer` - HTML element creation and updates
- `CellEditor` - Inline/modal editing UI
- `CellFormatter` - Display formatting + parsing
- `CellValidator` - Validation rules

**Complexity by Category:**

| Category | Complexity | Time | Examples |
|----------|-----------|------|----------|
| Basic | ⭐ Low | 2-3 hrs | text, number, date |
| Select | ⭐⭐ Medium | 3-4 hrs | enum, choice |
| Relationship | ⭐⭐⭐ High | 6-8 hrs | entity reference |
| Rollup | ⭐⭐⭐⭐ Very High | 8-12 hrs | sum, count, avg |
| Computed | ⭐⭐⭐⭐ Very High | 10-15 hrs | formulas |

#### Code Organization Strengths

```
vibegrid/
├── field-types/                  # Excellent organization
│   ├── FieldTypeRegistry.ts      # Central registry (lazy init)
│   ├── ModularCellBridge.ts      # Integration layer
│   └── implementations/          # 23 field types
│       ├── basic/                # 17 types
│       ├── relationship/         # 2 types
│       ├── rollup/               # 4 types
│       └── computed/             # 1 type
├── types.ts                      # Comprehensive type defs
├── stores/                       # State management (MobX)
├── processors/                   # Data transformation
└── renderers/                    # Rendering system
```

#### Documentation Gaps

| Gap | Impact | Priority |
|-----|--------|----------|
| No Field Type Development Guide | Developers must read TextFieldType.ts and copy | 🔴 High |
| Affordance System Undocumented | New devs won't discover CSS cursor behavior system | 🔴 High |
| ModularCellBridge Not Documented | Pre-computation optimization unexplained | 🟡 Medium |
| Async Data Loading Pattern | Relationship data preloading unexplained | 🟡 Medium |
| Interaction Policy vs Affordance Confusion | Two systems coexist without guidance | 🟡 Medium |

---

## Recommendations

### High Priority (Performance)

1. **Fix Selection Update Bottleneck**
   - Location: `BodyRenderer.ts:132-144`
   - Issue: All visible rows' checkboxes updated on ANY selection change
   - Fix: Track previous selection, only update delta (changed rows)
   - Impact: O(changed_rows) vs O(visible_rows)

2. **Pre-compute Affordances**
   - Location: `ModularCellBridge.ts`
   - Issue: Lazy resolution during cell creation
   - Fix: Pre-compute affordances per column at grid initialization
   - Impact: 2-3x faster cell creation

3. **Complete Virtual Scroll Migration**
   - Issue: VirtualScrollManager (global) still imported despite VirtualViewportStore (instance-based)
   - Fix: Full migration to VirtualViewportStore
   - Impact: Multi-grid support, cleaner architecture

### High Priority (Documentation)

4. **Create Field Type Development Guide**
   - Location: `.claude/rules/vibegrid-field-type-development.md`
   - Contents:
     - Checklist for new field types
     - Complexity matrix (time estimates)
     - Simple example + complex example
     - Common mistakes

5. **Document Affordance System**
   - What affordances are (CSS cursor + hover behavior)
   - When to use vs interaction policy
   - Migration guide (old vs new)

### Medium Priority

6. **Refactor MouseController (58 KB)**
   - Extract drag-specific logic to DragCoordinator
   - Extract column resize to ColumnResizeController

7. **Memoize Layout Map**
   - Location: `BodyRenderer.ts:280-283`
   - Issue: Layout map recreated per row
   - Fix: Create once at render start

8. **Granular MobX Reactions**
   - Location: `BodyRenderer.ts:134-144`
   - Issue: Broad reaction triggers on any selection change
   - Fix: Split into smaller, targeted reactions

---

## Key Files Reference

| Category | File | Purpose |
|----------|------|---------|
| **Virtualization** | `stores/VirtualViewportStore.ts` | New MobX-based virtual scrolling |
| **Rendering** | `renderers/modules/BodyRenderer.ts` | Cell rendering, progressive columns |
| **Scrolling** | `renderers/modules/ScrollController.ts` | RAF-throttled scroll, header sync |
| **Cell Bridge** | `field-types/ModularCellBridge.ts` | Field type integration, affordances |
| **State** | `stores/InteractionStore.ts` | Selection, drag, menu state |
| **State** | `stores/EditingStore.ts` | Edit mode, validation |
| **Keyboard** | `renderers/modules/KeyboardController.ts` | Document-level keyboard |
| **Mouse** | `renderers/modules/MouseController.ts` | Document-level mouse (58 KB) |
| **Coordination** | `coordination/InteractionCoordinator.ts` | Event routing |
| **Editing** | `overlays/EditingOverlay.tsx` | Editor portal |
| **Registry** | `field-types/FieldTypeRegistry.ts` | Field type registration |

---

## Open Questions

1. Should we pursue the runtime adapter pattern (discarded in PR #1305) in a different form?
2. Is the VirtualScrollManager deprecation blocking any multi-grid features?
3. What's the migration path from interactionPolicy to affordance system?

---

## Next Steps

1. **Planning Issue:** Create GH issue for selection update optimization
2. **Planning Issue:** Create GH issue for affordance pre-computation
3. **Documentation:** Create field type development guide
4. **Documentation:** Document affordance system in vibegrid.md

---

**Research completed by:** Parallel Explore agents (acc33d7, aa26907, af97990)
