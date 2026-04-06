---
initiative: vibegrid-extensions
type: project
status: in-progress
owner: platform-engineering
assignee: ben@getelevra.com
updated: 2025-12-05
---

# Vibegrid Gantt View: System Design

**Status**: Draft
**Timeline**: 2 weeks
**Scope**: V1 - Core timeline rendering, no grouping

updated: 2025-12-05
---

## Design Principles

1. **Reuse over rebuild** - Left pane is existing Vibegrid, only add timeline rendering
2. **Sync over independence** - Both panes share vertical scroll, selection, row data
3. **Simple first** - Flat list, no grouping, no hierarchy in V1
4. **DOM over Canvas** - Use DOM elements for bars (easier interaction, consistent with Vibegrid)

updated: 2025-12-05
---

## System Architecture

### Component Layout

```
┌─────────────────────────────────────────────────────────────────────────┐
│  GanttContainer                                                         │
│  ┌────────────────────────┐ │ ┌──────────────────────────────────────┐  │
│  │  LeftPane              │ │ │  RightPane (TimelinePane)            │  │
│  │  ┌──────────────────┐  │ │ │  ┌────────────────────────────────┐  │  │
│  │  │ Header (existing)│  │ │ │  │ TimeScaleHeader                │  │  │
│  │  └──────────────────┘  │ │ │  └────────────────────────────────┘  │  │
│  │  ┌──────────────────┐  │ │ │  ┌────────────────────────────────┐  │  │
│  │  │ Body (existing)  │  │ │ │  │ GanttBarLayer                  │  │  │
│  │  │ - Virtualized    │  │ │ │  │ - Bars positioned by row/time  │  │  │
│  │  │ - Subset of cols │  │ │ │  │ - Drag handles on edges        │  │  │
│  │  └──────────────────┘  │ │ │  └────────────────────────────────┘  │  │
│  └────────────────────────┘ │ │  ┌────────────────────────────────┐  │  │
│                             │ │  │ DependencyArrowLayer (SVG)     │  │  │
│                             │ │  └────────────────────────────────┘  │  │
│                             │ └──────────────────────────────────────┘  │
│                          CutoffResizer                                  │
└─────────────────────────────────────────────────────────────────────────┘
```

### Data Flow

```
TableCoreStore (existing)
    │
    ├─→ LeftPane: rows, columns, selection
    │
    └─→ GanttViewStore (new)
            │
            ├─→ timeScale: { start, end, zoom, pixelsPerDay }
            ├─→ barPositions: Map<rowId, { left, width, top }>
            └─→ RightPane: bars, arrows, time headers
```

updated: 2025-12-05
---

## State Interfaces

### GanttViewStore

```typescript
interface GanttViewStore {
  // Time scale configuration
  timeScale: TimeScale

  // Computed bar positions (derived from rows + timeScale)
  barPositions: Map<string, BarPosition>

  // UI state
  cutoffWidth: number           // Width of left pane in pixels
  isDraggingBar: boolean
  draggedBarId: string | null

  // Actions
  setZoomLevel(level: ZoomLevel): void
  scrollToDate(date: Date): void
  setCutoffWidth(width: number): void

  // Bar drag actions
  startBarDrag(barId: string, edge: 'start' | 'end' | 'move'): void
  updateBarDrag(deltaPixels: number): void
  endBarDrag(): void
}
```

### TimeScale

```typescript
interface TimeScale {
  // Visible range
  visibleStart: Date
  visibleEnd: Date

  // Zoom level
  zoom: ZoomLevel

  // Computed values
  pixelsPerDay: number
  totalWidth: number            // Total scrollable width

  // Column definitions (for rendering headers)
  majorColumns: TimeColumn[]    // Months/Quarters
  minorColumns: TimeColumn[]    // Days/Weeks
}

type ZoomLevel = 'day' | 'week' | 'month' | 'quarter'

interface TimeColumn {
  label: string
  startDate: Date
  endDate: Date
  left: number                  // Pixel position
  width: number                 // Pixel width
}
```

### BarPosition

```typescript
interface BarPosition {
  rowId: string
  entityId: string

  // Dates from entity
  startDate: Date | null
  endDate: Date | null

  // Computed pixel positions
  left: number
  width: number
  top: number                   // From row position
  height: number                // Row height

  // Visual state
  hasStart: boolean             // Has valid start date
  hasEnd: boolean               // Has valid end date
  progress: number              // 0-100 completion percentage
}
```

### Dependency Arrow

```typescript
interface DependencyArrow {
  id: string
  relationshipId: string        // DataForge relationship

  sourceBarId: string
  targetBarId: string

  // Computed path points
  sourcePoint: { x: number, y: number }
  targetPoint: { x: number, y: number }

  type: 'finish-to-start' | 'start-to-start' | 'finish-to-finish'
}
```

updated: 2025-12-05
---

## Key Flows

### Flow 1: Initial Render

```
1. GanttContainer mounts
2. Read mode from ViewModeStore (mode === 'gantt')
3. GanttViewStore initializes:
   - Calculate timeScale from row date range
   - Compute barPositions for visible rows
4. Render split pane:
   - LeftPane: existing BodyRenderer with column subset
   - RightPane: TimeScaleHeader + GanttBarLayer
5. Sync vertical scroll between panes
```

### Flow 2: Bar Drag to Resize

```
1. User mousedown on bar edge (start or end)
2. GanttViewStore.startBarDrag(barId, 'end')
3. User mousemove
4. GanttViewStore.updateBarDrag(deltaPixels)
   - Convert pixels to date delta
   - Update temporary bar position (preview)
5. User mouseup
6. GanttViewStore.endBarDrag()
   - Calculate new date from final position
   - Call DataForge update: entity.endDate = newDate
   - Bar position recomputes from updated entity
```

### Flow 3: Horizontal Scroll (Timeline)

```
1. User scrolls in RightPane
2. Update timeScale.visibleStart/visibleEnd
3. Recompute which bars are visible
4. Re-render TimeScaleHeader columns
5. Re-render visible bars (virtualized)
```

### Flow 4: Vertical Scroll (Synced)

```
1. User scrolls in either pane
2. VirtualScrollManager updates visible row range
3. Both panes receive same scroll offset
4. LeftPane: re-renders visible table rows
5. RightPane: re-renders bars for visible rows
```

updated: 2025-12-05
---

## Component Specifications

### TimeScaleHeader

**Purpose**: Render time column headers (months, weeks, days)

**Props**:
```typescript
interface TimeScaleHeaderProps {
  timeScale: TimeScale
  scrollLeft: number
  width: number
}
```

**Rendering**:
- Two rows: major (months/quarters) + minor (weeks/days)
- Only render columns in visible range
- Sticky positioned at top of RightPane

### GanttBarLayer

**Purpose**: Render date bars for each row

**Props**:
```typescript
interface GanttBarLayerProps {
  barPositions: BarPosition[]
  timeScale: TimeScale
  scrollLeft: number
  scrollTop: number
  onBarDragStart: (barId: string, edge: 'start' | 'end' | 'move') => void
}
```

**Rendering**:
- Absolutely positioned container
- Each bar is a DOM element with:
  - Left/width from barPosition
  - Top from row position (synced with left pane)
  - Drag handles on left/right edges
  - Progress fill inside bar

### DependencyArrowLayer

**Purpose**: Render SVG arrows between related bars

**Props**:
```typescript
interface DependencyArrowLayerProps {
  arrows: DependencyArrow[]
  scrollLeft: number
  scrollTop: number
}
```

**Rendering**:
- SVG overlay on top of GanttBarLayer
- Bezier curves from source bar end to target bar start
- Arrow markers at target end
- Only render arrows where both bars are visible

### CutoffResizer

**Purpose**: Draggable divider between panes

**Props**:
```typescript
interface CutoffResizerProps {
  width: number
  onResize: (newWidth: number) => void
  minWidth: number
  maxWidth: number
}
```

updated: 2025-12-05
---

## Date Field Configuration

### Which fields to use for bars

```typescript
interface GanttFieldConfig {
  startDateField: string        // Default: 'startDate'
  endDateField: string          // Default: 'endDate' or 'dueDate'
  progressField?: string        // Optional: 'progress' or 'completion'
}
```

**Resolution order for dates**:
1. Explicit field in config
2. Field named 'startDate' / 'endDate'
3. Field named 'dueDate' (maps to endDate)
4. Field with type 'date' and name containing 'start'/'end'

### Handling missing dates

- No startDate: Bar starts at timeline start, left edge is dashed
- No endDate: Bar extends to timeline end, right edge is dashed
- No dates: Row shows in left pane, no bar in timeline
- Invalid dates (end before start): Show warning indicator

updated: 2025-12-05
---

## Zoom Levels

| Level | Minor Column | Major Column | pixelsPerDay |
|-------|--------------|--------------|--------------|
| day | Day | Week | 40 |
| week | Week | Month | 10 |
| month | Month | Quarter | 3 |
| quarter | Quarter | Year | 1 |

### Zoom behavior
- Mouse wheel + Ctrl: zoom in/out
- Zoom buttons in toolbar
- Zoom centered on mouse position (or viewport center)

updated: 2025-12-05
---

## Performance Considerations

### Virtualization

- **Vertical**: Reuse VirtualScrollManager, only render visible rows
- **Horizontal**: Only render bars/columns in visible time range
- **Threshold**: ~50px buffer outside viewport

### Bar rendering

- Use CSS transforms for positioning (GPU accelerated)
- Batch DOM updates during scroll
- Debounce bar position recalculation during resize

### Target metrics

| Operation | Target |
|-----------|--------|
| Initial render (100 visible rows) | <100ms |
| Scroll (1000 rows total) | 60fps |
| Bar drag preview | 60fps |
| Zoom level change | <200ms |

updated: 2025-12-05
---

## Integration Points

### With TableCoreStore

```typescript
// GanttViewStore observes TableCoreStore
class GanttViewStore {
  constructor(private tableCoreStore: TableCoreStore) {
    // React to row changes
    reaction(
      () => this.tableCoreStore.visibleRows,
      (rows) => this.recomputeBarPositions(rows)
    )
  }
}
```

### With DataForge (for updates)

```typescript
// When bar drag ends, update entity
async function onBarDragEnd(barId: string, newEndDate: Date) {
  const bar = ganttStore.barPositions.get(barId)
  await dataForgeClient.updateEntity(bar.entityId, {
    [ganttConfig.endDateField]: newEndDate
  })
}
```

### With ViewModeStore

```typescript
// Toggle between table and gantt
interface ViewModeStore {
  mode: 'table' | 'gantt'
  setMode(mode: 'table' | 'gantt'): void
}

// Gantt components only render when mode === 'gantt'
```

updated: 2025-12-05
---

## Non-Goals (V1)

- Grouping/hierarchy in Gantt view
- Summary bars for parent entities
- Date inheritance from children
- Multi-bar per row
- Resource/capacity view
- Critical path highlighting
- Baseline comparison

updated: 2025-12-05
---

**Template Version**: 2.0
