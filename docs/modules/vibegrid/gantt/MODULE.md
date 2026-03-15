---
module_id: gantt
domain: vibegrid
display_name: "Timeline & Gantt"
archetype: timeline
status: active
features:
  - gantt
---

# Timeline & Gantt

> How does the user visualize tasks on a timeline with dependencies and drag-to-edit?

Timeline view with zoomable time scale, draggable task bars, dependency arrows (FS/SS/FF/SF), and critical path highlighting. Requires entities with start/end date fields. State managed by GanttViewStore.

## Features

- [gantt](gantt.md) — Timeline rendering, drag-to-move/resize, dependencies, critical path
