---
initiative: vibegrid-extensions
type: project
status: complete
owner: platform-engineering
assignee: ben@getelevra.com
updated: 2025-12-07
---

# Vibegrid Gantt View: Implementation Guide

**Timeline**: 2 weeks
**Approach**: Incremental - split pane first, then timeline, then interactions
**Risk**: Low - extends existing Vibegrid patterns

updated: 2025-12-05
---

## Implementation Philosophy

1. **Get the split pane working first** - Two panes with synced scroll before any Gantt rendering
2. **Static bars before interactions** - Render bars at correct positions before drag
3. **Arrows last** - Dependency arrows are polish, not core

updated: 2025-12-05
---

## Phase 1: Split Pane Infrastructure (Days 1-3)

### Goal
Two-pane layout with synced vertical scroll, cutoff resizer, view mode toggle.

### Task 1.1: ViewModeStore

**Create**: `src/systems/vibegrid/stores/ViewModeStore.ts`

```typescript
import { makeObservable, observable, action } from 'mobx'

export type ViewMode = 'table' | 'gantt'

export class ViewModeStore {
  @observable mode: ViewMode = 'table'

  constructor() {
    makeObservable(this)
  }

  @action setMode(mode: ViewMode) {
    this.mode = mode
  }
}
```

**Tests**: `src/systems/vibegrid/stores/__tests__/ViewModeStore.test.ts`

**Acceptance Criteria**:
- [x] Store initializes with mode = 'table'
- [x] setMode changes mode
- [x] Mode persists across re-renders

updated: 2025-12-05
---

### Task 1.2: Split Pane Container

**Create**: `src/systems/vibegrid/components/SplitPaneContainer.tsx`

```typescript
interface SplitPaneContainerProps {
  leftPane: React.ReactNode
  rightPane: React.ReactNode
  cutoffWidth: number
  onCutoffResize: (width: number) => void
  minLeftWidth?: number
  maxLeftWidth?: number
}
```

**Key behaviors**:
- Renders left pane with fixed width (cutoffWidth)
- Renders right pane with flex: 1
- CutoffResizer divider between them
- CSS: `display: flex`, overflow handling

**Reference pattern**: Similar to VS Code's split editor panes

**Acceptance Criteria**:
- [x] Left pane respects cutoffWidth
- [x] Right pane fills remaining space
- [x] Resizer is visible between panes

updated: 2025-12-05
---

### Task 1.3: CutoffResizer Component

**Create**: `src/systems/vibegrid/components/CutoffResizer.tsx`

```typescript
interface CutoffResizerProps {
  onResize: (deltaX: number) => void
  onResizeEnd: () => void
}
```

**Key behaviors**:
- Vertical bar (4-6px wide)
- Cursor: col-resize on hover
- Mouse drag updates width
- Double-click to reset to default

**Acceptance Criteria**:
- [x] Drag changes cutoff width
- [x] Width stays within min/max bounds
- [x] Cursor changes on hover

updated: 2025-12-05
---

### Task 1.4: Synced Vertical Scroll

**Modify**: `src/systems/vibegrid/virtualization/VirtualScrollManager.ts`

Add ability to sync scroll between two containers:

```typescript
interface ScrollSyncConfig {
  containers: HTMLElement[]
  direction: 'vertical' | 'horizontal' | 'both'
}

syncScroll(config: ScrollSyncConfig): () => void  // Returns cleanup function
```

**Key behaviors**:
- When one container scrolls, update others
- Prevent scroll event loops (flag during programmatic scroll)
- Handle different content heights gracefully

**Acceptance Criteria**:
- [x] Scrolling left pane scrolls right pane
- [x] Scrolling right pane scrolls left pane
- [x] No jitter or feedback loops
- [ ] Works with virtualized content (needs testing with data)

updated: 2025-12-05
---

### Task 1.5: View Mode Toggle UI

**Modify**: `src/systems/vibegrid/components/VibeGridXHeaderPure.tsx`

Add toggle button/tabs for view mode:

```typescript
// In header toolbar area
<ViewModeToggle
  mode={viewModeStore.mode}
  onChange={(mode) => viewModeStore.setMode(mode)}
  options={['table', 'gantt']}
/>
```

**Acceptance Criteria**:
- [x] Toggle visible in Vibegrid header
- [x] Clicking toggles between table/gantt
- [x] Current mode is visually indicated

updated: 2025-12-05
---

### Phase 1 Acceptance Criteria

- [x] View mode toggle switches between table and gantt
- [x] In gantt mode, two panes render side by side
- [x] Cutoff resizer adjusts pane widths
- [x] Vertical scroll is synced between panes
- [x] Left pane shows existing table (subset of columns)
- [x] Right pane is empty placeholder (ready for Phase 2)

updated: 2025-12-06
---

## Phase 2: Timeline Rendering (Days 4-7) ✅ COMPLETE

### Goal
Render time scale header and static bars at correct positions.

### Task 2.1: GanttViewStore ✅

**Created**: `src/systems/vibegrid/stores/GanttViewStore.ts`

**Implementation Notes**:
- Uses `created_at` → `due_date` field mapping (snake_case to match database)
- VirtualRow wrapper handling: `row.data || row` pattern for field access
- TimeScale computed from data range with zoom levels: day/week/month/quarter
- Bar positions computed as array (not Map) for simpler iteration

**Acceptance Criteria**:
- [x] TimeScale computes correct pixelsPerDay for each zoom level
- [x] Bar positions update when rows change
- [x] Zoom level change updates all positions

updated: 2025-12-06
---

### Task 2.2: TimeScaleHeader ✅

**Created**: `src/systems/vibegrid/components/GanttTimeline.tsx` (TimeScaleHeader sub-component)

**Implementation Notes**:
- Integrated into GanttTimeline.tsx as sub-component
- Renders week markers (Monday-based) at week zoom level
- Supports day/week/month/quarter zoom levels
- Uses absolute positioning with calculated left offsets

**Acceptance Criteria**:
- [x] Headers render at correct positions
- [x] Headers scroll horizontally with timeline
- [x] Columns update on zoom change
- [x] Month/week labels are correct

updated: 2025-12-06
---

### Task 2.3: GanttBarLayer ✅

**Created**: `src/systems/vibegrid/components/GanttTimeline.tsx` (GanttBar sub-component)

**Implementation Notes**:
- DOM-based bars with absolute positioning
- Minimum bar width of 20px for visibility
- Title shown in bar when width > 60px
- Hover tooltip shows full label and date range

**Acceptance Criteria**:
- [x] Bars render at correct row positions (aligned with left pane)
- [x] Bar left/width matches date range
- [ ] Progress fill shows completion (deferred to Phase 3)
- [x] Bars scroll with timeline

updated: 2025-12-06
---

### Task 2.4: Date Field Detection (Simplified)

**Implementation Notes**:
- Simplified to configurable field mapping in GanttViewStore
- Default: `startField: 'created_at'`, `endField: 'due_date'`, `labelField: 'title'`
- `setFieldMapping()` action allows runtime configuration
- Auto-detection deferred to future enhancement

**Acceptance Criteria**:
- [x] Field mapping configurable
- [ ] Auto-detection (deferred)
- [x] Fallback to default fields

updated: 2025-12-06
---

### Task 2.5: Row-to-Bar Position Calculation ✅

**Implementation Notes**:
- Integrated into GanttViewStore.barPositions computed
- Uses VirtualRow wrapper handling (`row.data || row`)
- Rows without both dates are skipped (increment top position but no bar)
- Today line position calculated relative to timeline start

**Acceptance Criteria**:
- [x] Positions computed for all rows with dates
- [x] Top position matches left pane row position
- [x] Missing dates handled (row skipped, space preserved)

updated: 2025-12-06
---

### Phase 2 Acceptance Criteria

- [x] Time scale header renders months/weeks
- [x] Bars render at correct positions
- [x] Bar positions match row positions in left pane
- [x] Horizontal scroll updates bar/header positions
- [ ] Zoom controls UI (store supports it, UI deferred to Phase 3)
- [ ] Missing dates show partial/dashed bars (deferred)

**Status**: ✅ Core functionality complete. Zoom UI and polish deferred to Phase 3/4.

updated: 2025-12-06
---

## Phase 3: Interactions (Days 8-10)

### Goal
Bar drag to resize dates, bar selection, keyboard navigation.

### Task 3.1: Bar Drag to Resize

**Create**: `src/systems/vibegrid/interactions/GanttBarDragController.ts`

```typescript
class GanttBarDragController {
  startDrag(barId: string, edge: 'start' | 'end' | 'move', event: MouseEvent): void
  updateDrag(event: MouseEvent): void
  endDrag(): void
}
```

**Key behaviors**:
- Track which bar/edge is being dragged
- Show preview position during drag
- On end: calculate new date, update entity

**Mouse handling**:
- mousedown on handle: start drag
- mousemove: update preview
- mouseup: commit change

**Acceptance Criteria**:
- [ ] Drag start handle changes startDate
- [ ] Drag end handle changes endDate
- [ ] Drag bar body moves both dates
- [ ] Preview shows during drag
- [ ] Entity updates on drag end

updated: 2025-12-05
---

### Task 3.2: Bar Selection Sync

**Modify**: `src/systems/vibegrid/services/SelectionService.ts`

Sync selection between left pane rows and right pane bars.

```typescript
// When bar is clicked, select corresponding row
onBarClick(barId: string, event: MouseEvent) {
  const rowId = ganttStore.barPositions.get(barId)?.rowId
  selectionService.selectRow(rowId, { additive: event.ctrlKey })
}

// When row is selected, highlight corresponding bar
// (handled via computed in bar rendering)
```

**Acceptance Criteria**:
- [ ] Clicking bar selects row in left pane
- [ ] Selecting row highlights bar in right pane
- [ ] Multi-select works (Ctrl+click)

updated: 2025-12-05
---

### Task 3.3: Keyboard Navigation in Timeline

**Modify**: `src/systems/vibegrid/renderers/modules/KeyboardController.ts`

Add Gantt-specific keyboard shortcuts:

| Key | Action |
|-----|--------|
| Left/Right | Move selected bar by 1 day |
| Shift+Left/Right | Resize bar end by 1 day |
| +/- | Zoom in/out |
| Home | Scroll to earliest bar |
| End | Scroll to latest bar |
| T | Scroll to today |

**Acceptance Criteria**:
- [ ] Arrow keys move/resize bars
- [ ] Zoom shortcuts work
- [ ] Navigation shortcuts scroll timeline

updated: 2025-12-05
---

### Task 3.4: Today Line

**Add to GanttBarLayer**:

Render a vertical line at today's date.

```typescript
renderTodayLine(container: HTMLElement, todayX: number): void
```

**Styling**:
- Red/orange vertical line
- Dashed or solid
- Full height of timeline area

**Acceptance Criteria**:
- [ ] Today line renders at correct position
- [ ] Line scrolls with timeline
- [ ] Line is visually distinct

updated: 2025-12-05
---

### Phase 3 Acceptance Criteria

- [ ] Bar handles enable drag-to-resize
- [ ] Dragging updates entity dates
- [ ] Selection syncs between panes
- [ ] Keyboard navigation works
- [ ] Today line visible

updated: 2025-12-05
---

## Phase 4: Dependency Arrows & Polish (Days 11-14)

### Goal
Dependency arrows, visual polish, edge cases.

### Task 4.1: DependencyArrowLayer

**Create**: `src/systems/vibegrid/renderers/gantt/DependencyArrowLayer.ts`

```typescript
class DependencyArrowLayer {
  render(container: HTMLElement, arrows: DependencyArrow[]): void
  updateScroll(scrollLeft: number, scrollTop: number): void
}
```

**Rendering approach**:
- SVG overlay on top of bars
- Bezier curves between bar endpoints
- Arrow markers at target end

**Path calculation**:
```typescript
function calculateArrowPath(source: BarPosition, target: BarPosition): string {
  const startX = source.left + source.width  // End of source bar
  const startY = source.top + source.height / 2
  const endX = target.left  // Start of target bar
  const endY = target.top + target.height / 2

  // Bezier control points for nice curve
  const midX = (startX + endX) / 2
  return `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`
}
```

**Acceptance Criteria**:
- [ ] Arrows render between related bars
- [ ] Arrows scroll with timeline
- [ ] Arrows use correct relationship type

updated: 2025-12-05
---

### Task 4.2: Load Dependencies from DataForge

**Add to GanttViewStore**:

```typescript
@computed get dependencyArrows(): DependencyArrow[] {
  // Query relationships where type = 'blocks' or 'depends_on'
  const relationships = this.tableCoreStore.relationships
    .filter(r => ['blocks', 'depends_on'].includes(r.type))

  return relationships.map(r => ({
    id: r.id,
    relationshipId: r.id,
    sourceBarId: r.sourceEntityId,
    targetBarId: r.targetEntityId,
    ...this.calculateArrowPoints(r)
  }))
}
```

**Acceptance Criteria**:
- [ ] Dependencies loaded from DataForge relationships
- [ ] Only 'blocks'/'depends_on' types shown
- [ ] Arrow direction matches relationship direction

updated: 2025-12-05
---

### Task 4.3: Visual Polish

**Styling tasks**:
- [ ] Bar colors based on entity type or status
- [ ] Hover state on bars (slight highlight)
- [ ] Selected bar has border/glow
- [ ] Smooth scroll animations
- [ ] Loading state while data loads

**CSS file**: `src/systems/vibegrid/styles/gantt.css`

updated: 2025-12-05
---

### Task 4.4: Edge Cases

**Handle these scenarios**:
- [ ] Empty data (no rows with dates)
- [ ] All dates in past/future
- [ ] Very long date ranges (years)
- [ ] Very short date ranges (same day start/end)
- [ ] Invalid dates (end before start)
- [ ] Missing date fields (entity has no date columns)

updated: 2025-12-05
---

### Phase 4 Acceptance Criteria

- [ ] Dependency arrows render
- [ ] Arrows connect correct bars
- [ ] Visual styling is polished
- [ ] Edge cases handled gracefully
- [ ] No console errors

updated: 2025-12-05
---

## Testing Strategy

### Unit Tests

**Key test files**:
- `GanttViewStore.test.ts` - Time scale calculations, bar positions
- `TimeScaleHeader.test.ts` - Column rendering at various zoom levels
- `gantt-field-detection.test.ts` - Field auto-detection logic

### Integration Tests

**Test scenarios**:
1. Toggle to Gantt mode, verify split pane renders
2. Load data with dates, verify bars appear
3. Drag bar end, verify entity updates
4. Scroll timeline, verify bars reposition

### Manual Testing Checklist

- [ ] Toggle between table/gantt modes
- [ ] Resize cutoff divider
- [ ] Scroll both panes (sync)
- [ ] Zoom in/out
- [ ] Drag bar handles
- [ ] Click bar to select row
- [ ] Keyboard navigation
- [ ] Different screen sizes

updated: 2025-12-05
---

## File Structure (Final)

```
src/systems/vibegrid/
├── stores/
│   ├── ViewModeStore.ts           # NEW
│   └── GanttViewStore.ts          # NEW
├── components/
│   ├── SplitPaneContainer.tsx     # NEW
│   ├── CutoffResizer.tsx          # NEW
│   └── ViewModeToggle.tsx         # NEW
├── renderers/
│   └── gantt/
│       ├── TimeScaleHeader.ts     # NEW
│       ├── GanttBarLayer.ts       # NEW
│       └── DependencyArrowLayer.ts # NEW
├── interactions/
│   └── GanttBarDragController.ts  # NEW
├── utils/
│   └── gantt-field-detection.ts   # NEW
└── styles/
    └── gantt.css                  # NEW
```

updated: 2025-12-05
---

## Deployment

### Pre-Deployment Checklist

- [ ] All tests pass
- [ ] Type checking passes
- [ ] Manual testing complete
- [ ] No performance regressions in table mode

### Feature Flag

Consider adding feature flag for gradual rollout:

```typescript
// In Vibegrid component
const showGanttToggle = featureFlags.get('vibegrid-gantt-enabled')
```

### Rollout Plan

1. Deploy to staging (auto via push)
2. Test on Baseplane org with DevPlan entities
3. Enable for production (merge to main)

updated: 2025-12-05
---

**Template Version**: 2.0
