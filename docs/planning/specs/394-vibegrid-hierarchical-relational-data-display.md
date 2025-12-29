---
issue: 394
type: feature
title: "VibeGrid: Hierarchical & Relational Data Display"
epic: 187
status: open
created: 2025-12-27
---

# VibeGrid: Hierarchical & Relational Data Display

> Consolidates: #247, #248, #249, #217

## User Story

**As a** project manager or data analyst,
**I want** to view and navigate hierarchical and relational data within VibeGrid
**So that** I can understand relationships, drill into details, and organize data by related entities without leaving the grid view.

## Overview

This feature unifies four related capabilities into a cohesive hierarchical data display system:

| Capability | Pattern | Example |
|------------|---------|---------|
| **Self-Referential Grouping** | Indented rows (same entity) | Subtasks under parent Task |
| **Relationship Grouping** | Group headers (cross-entity) | Tasks grouped by Project |
| **Master-Detail Expansion** | Nested grids (different columns) | Expand Project → see Tasks grid |
| **Tree Navigation** | Sidebar tree view | Folder/hierarchy browser |

## Scope

**In scope:**
- Self-referential parent-child display with indentation
- Cross-entity relationship grouping with resolved names
- Master-detail row expansion with nested VibeGrid
- Tree navigation sidebar for hierarchical browsing
- Keyboard navigation through hierarchies
- Expand/collapse state management
- Aggregation rollups through hierarchy

**Out of scope:**
- Drag-drop reparenting (future enhancement)
- Real-time collaborative sync of hierarchy state (depends on #242)
- Infinite nesting depth (start with 3 levels max)

## Visual Examples

### Self-Referential Grouping (#248)
```
▼ Task: Build Authentication System         [Done]    8h
    └─ Task: Implement login endpoint       [Done]    2h
    └─ Task: Implement logout endpoint      [Done]    1h
    └─ Task: Add session management         [Active]  3h
        └─ Task: Session timeout logic      [Pending] 1h
▼ Task: Build User Dashboard               [Pending]  12h
    └─ Task: Design dashboard layout        [Pending] 4h
```

### Relationship Grouping (#247)
```
▼ Project Alpha (5 tasks)          ← Group header with resolved name
    Task 1...
    Task 2...
▼ Project Beta (3 tasks)
    Task 3...
▼ (No Project) (2 tasks)           ← Null relationship handling
    Task 4...
```

### Master-Detail Expansion (#249)
```
┌─────────────────────────────────────────────────────────────┐
│ ▶ Project Alpha         | Active    | $50,000  | Jan 2025  │
├─────────────────────────────────────────────────────────────┤
│ ▼ Project Beta          | Active    | $75,000  | Feb 2025  │
├─────────────────────────────────────────────────────────────┤
│   ┌─────────────────────────────────────────────────────┐   │
│   │ Task Name           | Status   | Assignee  | Hours  │   │
│   ├─────────────────────────────────────────────────────┤   │
│   │ Design mockups      | Done     | Alice     | 8h     │   │
│   │ Implement auth      | Active   | Bob       | 16h    │   │
│   └─────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────┤
│ ▶ Project Gamma         | Paused   | $25,000  | Mar 2025  │
└─────────────────────────────────────────────────────────────┘
```

## Technical Design

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    HierarchyProcessor                        │
│  (Unified processor for all hierarchical display modes)     │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ Self-Ref    │  │ Relationship│  │ Master-Detail       │  │
│  │ Grouping    │  │ Grouping    │  │ Expansion           │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                           │
┌─────────────────────────────────────────────────────────────┐
│                    VirtualRow Types                          │
│  'data' | 'group-header' | 'hierarchy' | 'detail'           │
└─────────────────────────────────────────────────────────────┘
```

### Key Components

| Component | Purpose | Key Files |
|-----------|---------|-----------|
| HierarchyProcessor | Unified hierarchy building | `processors/HierarchyProcessor.ts` |
| GroupProcessor (enhanced) | Relationship grouping | `processors/GroupProcessor.ts` |
| DetailGridRenderer | Nested VibeGrid for expansion | `renderers/DetailGridRenderer.tsx` |
| TreeSidebar | Hierarchy navigation | `components/TreeSidebar.tsx` |
| HierarchyStore | Expand/collapse state | `stores/HierarchyStore.ts` |

### VirtualRow Extensions

```typescript
interface VirtualRow {
  type: 'data' | 'group-header' | 'hierarchy' | 'detail'
  depth?: number           // Indentation level (0-based)
  parentId?: string        // Parent row ID for hierarchy
  isExpanded?: boolean     // Expand/collapse state
  childCount?: number      // Number of children
  detailEntityType?: string // For master-detail: target entity
}
```

### Configuration

```typescript
interface HierarchyConfig {
  // Self-referential grouping
  selfReferentialField?: string      // e.g., 'parent_task_id'

  // Relationship grouping
  groupByRelationship?: {
    field: string                    // e.g., 'project_id'
    displayField: string             // e.g., 'name'
  }

  // Master-detail
  masterDetail?: {
    enabled: boolean
    detailEntityType: string         // e.g., 'Task'
    detailRelationshipField: string  // e.g., 'project_id'
    detailColumns?: ColumnDef[]      // Optional custom columns
  }

  // Tree sidebar
  treeSidebar?: {
    enabled: boolean
    hierarchyField: string           // e.g., 'parent_id'
  }
}
```

## Acceptance Criteria

### Self-Referential Grouping
- [ ] Rows with `parent_id` appear indented under parent
- [ ] Parent rows show expand/collapse toggle
- [ ] Multi-level nesting works (up to 3 levels)
- [ ] Orphan rows (null/invalid parent) appear at root
- [ ] Circular reference detection prevents infinite loops
- [ ] Aggregations roll up through hierarchy

### Relationship Grouping
- [ ] Can select relationship fields in "Group By" dropdown
- [ ] Group headers display resolved entity names (not UUIDs)
- [ ] "(No [Entity])" group for null relationships
- [ ] Aggregations work on relationship groups

### Master-Detail
- [ ] Master rows have expand/collapse chevron
- [ ] Expanding shows nested detail grid
- [ ] Detail grid is fully-featured (sort, filter, select)
- [ ] Multiple rows can be expanded simultaneously
- [ ] Detail data lazy-loads on expand
- [ ] Detail grids cached for performance

### Tree Navigation
- [ ] Sidebar shows hierarchy tree
- [ ] Clicking tree node scrolls grid to that row
- [ ] Tree reflects current expand/collapse state
- [ ] Search/filter within tree

### Cross-Cutting
- [ ] Keyboard navigation works through hierarchy (Tab into children)
- [ ] Works with existing grouping (can nest modes)
- [ ] Performance acceptable with 1000+ rows

## Implementation Phases

### Phase 1: Self-Referential Hierarchy (Foundation)
- HierarchyProcessor with flat-to-tree conversion
- VirtualRow depth/parentId support
- Indented row rendering
- Expand/collapse state management
- Circular reference detection

### Phase 2: Relationship Grouping
- GroupProcessor enhancement for relationship fields
- Schema-based name resolution via relationshipConfig
- Null relationship handling
- Group aggregations

### Phase 3: Master-Detail
- DetailGridRenderer component
- Detail VirtualRow type
- Async data loading on expand
- Detail grid caching

### Phase 4: Tree Sidebar
- TreeSidebar component
- Sync with grid expand/collapse state
- Tree search/filter
- Click-to-scroll navigation

## Dependencies

**Blocked by:** None (can start independently)

**Related:**
- #242 (Y.js Sync) - Future: sync hierarchy state
- #212 (Realtime Sync Infrastructure) - Cross-epic dependency for #242

## Testing Requirements

- [ ] Unit tests for hierarchy building from flat data
- [ ] Unit tests for circular reference detection
- [ ] Unit tests for relationship name resolution
- [ ] Integration tests for expand/collapse
- [ ] E2E tests for master-detail workflow
- [ ] Performance tests with 1000+ hierarchical rows

## Key Files

| File | Purpose |
|------|---------|
| `processors/GroupProcessor.ts` | Extend for relationship grouping |
| `processors/HierarchyProcessor.ts` | NEW: Unified hierarchy processing |
| `renderers/DataRowRenderer.tsx` | Add indentation based on depth |
| `renderers/DetailGridRenderer.tsx` | NEW: Nested grid for expansion |
| `stores/TableCoreStore.ts` | Track expanded state |
| `stores/HierarchyStore.ts` | NEW: Hierarchy-specific state |
| `types.ts` | Extend VirtualRow types |
| `schema/SchemaAdapter.ts` | Already provides relationshipConfig |

## References

- [AG Grid Master-Detail](https://www.ag-grid.com/react-data-grid/master-detail/)
- [AG Grid Tree Data](https://www.ag-grid.com/react-data-grid/tree-data/)
- Archived domain doc: `planning/_archive/01-domains/vibegrid.md`

## Notes

_Session notes and decisions will be added here during implementation_
