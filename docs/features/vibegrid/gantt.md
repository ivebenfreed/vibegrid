# Gantt

Timeline-based view for tasks with date fields. Displays task bars with drag-to-move/resize, dependency arrows, and critical path highlighting.

## Overview

- **Domain:** vibegrid
- **Status:** active
- **Related Issues:** GH#215

## Behaviors

### B1: Timeline renders with zoom controls
- **ID:** timeline-render-zoom
- **Trigger:** User enables Gantt view via toolbar toggle
- **Expected:** Timeline displays with appropriate time scale (day/week/month/year), zoom controls in toolbar, today marker visible
- **Verify:** Timeline grid renders with date headers, zoom dropdown shows current level, red today marker line visible

### B2: Task bars display with correct positions
- **ID:** task-bars-position
- **Trigger:** Grid switches to Gantt mode with tasks having start/end dates
- **Expected:** Task bars render at correct horizontal positions based on date fields, bar width reflects task duration
- **Verify:** Task bars aligned with timeline dates, multiple tasks at different vertical positions visible, no overlapping bars for different tasks

### B3: Drag-to-move updates task dates
- **ID:** drag-move-task-dates
- **Trigger:** User clicks and drags a task bar horizontally
- **Expected:** Task bar moves along timeline, start and end dates update to reflect new position, change persists to database
- **Verify:** Task bar follows cursor during drag, date fields update in grid view, optimistic update visible immediately

### B4: Drag-to-resize updates task duration
- **ID:** drag-resize-task-duration
- **Trigger:** User clicks and drags task bar edge (left or right)
- **Expected:** Task bar resizes, start date (left edge) or end date (right edge) updates, duration recalculated
- **Verify:** Bar width changes during resize, date field updates, no unintended changes to other date

### B5: Dependencies show as arrows between tasks
- **ID:** dependency-arrows-display
- **Trigger:** Tasks have relationship data with dependency types (FS, SS, FF, SF)
- **Expected:** Arrows render from predecessor task to successor task, arrow style reflects dependency type
- **Verify:** Arrows visible between linked tasks, 4 dependency types render distinctly, arrows update when task bars move

### B6: Critical path highlighting
- **ID:** critical-path-highlight
- **Trigger:** User toggles "Critical Path" option in toolbar
- **Expected:** Tasks on longest dependency chain highlight with distinct color (red or bold), non-critical tasks remain normal
- **Verify:** Critical path tasks visually distinct, toggle on/off changes highlighting, longest path correctly identified

## Notes

- Built on VibeGrid core infrastructure, shares stores and processors
- Uses GanttViewStore for timeline state (zoom level, drag operations, critical path calculation)
- Requires entities to have date fields (start_date, end_date) configured in schema
- Dependency data comes from DataForge relationships API
- Progress bars and custom shapes (diamonds for milestones) added in GH#215 enhancements
