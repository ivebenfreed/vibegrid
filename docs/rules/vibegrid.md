---
paths: apps/web/src/systems/vibegrid/**/*
---

# Vibegrid

High-performance data grid with MobX state, virtual scrolling, and Gantt support.

## Row Actions (ActionsBar)

Bottom-pinned floating bar appears when rows selected via selection column.

**Props:**
```typescript
interface VibeGridProps {
  rowActions?: RowAction[]
  onRowAction?: (actionId: string, rowIds: string[], rowsData: any[]) => Promise<void>
  enableDelete?: boolean
  onDelete?: (rowIds: string[], rowsData: any[]) => Promise<void>
  deleteConfirmation?: (rowsData: any[]) => string | React.ReactNode
}

interface RowAction {
  id: string
  label: string
  icon?: React.ComponentType<{ className?: string }>
  onClick?: (rowData: any) => Promise<void>
  destructive?: boolean  // Red styling + confirmation dialog
  hidden?: (rowData: any) => boolean
}
```

**Usage:**
```typescript
<VibeGrid
  tableId="users"
  entityType="PlatformUser"
  enableSelectionColumn={true}
  enableDelete={true}
  onDelete={async (rowIds) => await deleteUsers(rowIds)}
  deleteConfirmation={(rows) => `Delete ${rows.length} user(s)?`}
/>
```

**Key files:** `components/ActionsBar.tsx`, `stores/InteractionStore.ts` (rowActionMenuState)

## Dependencies & Gantt

### 4 Dependency Types (DependencyProcessor.ts:22-26)

| Type | Abbr | Meaning |
|------|------|---------|
| `finish_to_start` | FS | Predecessor finishes before successor starts (default) |
| `start_to_start` | SS | Predecessor starts before successor starts |
| `finish_to_finish` | FF | Predecessor finishes before successor finishes |
| `start_to_finish` | SF | Predecessor starts before successor finishes |

### DependencyProcessor API

```typescript
// CRUD via UnifiedRelationshipService with 'depends_on' type
createDependency(kysely, orgId, userId, { sourceId, targetId, dependencyType, leadLagDays? })
getDependencies(kysely, orgId, entityId)
getPredecessors(kysely, orgId, entityId)   // Tasks that must complete first
getSuccessors(kysely, orgId, entityId)     // Tasks depending on this one
removeDependency(kysely, orgId, dependencyId)
updateDependency(kysely, orgId, dependencyId, updates)
```

### Lead/Lag Time (cascade-scheduler.ts)

```typescript
// leadLagDays: negative = lag (delay), positive = lead (overlap)
FS: successor.start = predecessor.end + lag
SS: successor.start = predecessor.start + lag
FF: successor.end = predecessor.end + lag
SF: successor.end = predecessor.start + lag
```

### Gantt View Store (stores/GanttViewStore.ts)

```typescript
interface TimeScale {
  pixelsPerDay: number    // day: 50, week: 20, month: 6, quarter: 2
  zoomLevel: 'day' | 'week' | 'month' | 'quarter'
  startDate: Date
  endDate: Date
}
```

### Supported Archetypes

Only `project`, `task`, `activity` support dependencies

## Critical Rules

1. **Row actions need selection column** - Set `enableSelectionColumn={true}`
2. **Bulk handlers receive arrays** - `(rowIds[], rowsData[])`
3. **Use `depends_on` relationship** - Via UnifiedRelationshipService
4. **Cascade on date changes** - `calculateCascadeUpdates()` propagates changes
5. **Cycle detection** - GraphService.detectCycles() prevents circular deps

## Key Files

- `VibeGrid.tsx` - Main component, props interface
- `components/ActionsBar.tsx` - Row actions UI
- `stores/InteractionStore.ts` - UI state (selection, menus)
- `stores/GanttViewStore.ts` - Gantt state
- `utils/cascade-scheduler.ts` - Date cascading
- `components/DependencyArrowLayer.tsx` - SVG arrows
