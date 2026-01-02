# VibeGrid: High-Performance Hybrid Data Grid

VibeGrid is a sophisticated data grid component that combines React's declarative UI with direct DOM manipulation for maximum performance. Built on Legend State observables, it implements a **Pure Observable Architecture** for enterprise applications requiring complex data manipulation, real-time synchronization, and extensive customization.

## 🚀 Key Features

### Performance & Scalability
- **Virtual Scrolling**: Handle 100,000+ rows at 60fps
- **Hybrid Rendering**: React for UI controls, direct DOM for table body
- **Smart Change Detection**: Minimal re-renders using Legend State precision
- **Memory Management**: Automatic cleanup and element pooling

### Data Management
- **Real-time Entity Sync**: Direct connection to Legend State entity atoms
- **Multi-level Grouping**: Hierarchical organization with aggregations
- **Advanced Filtering**: 12+ operators with type-specific UIs
- **Multi-column Sorting**: Priority-based sorting with visual indicators

### Interactions
- **Excel-like Selection**: Cell, row, range, and multi-selection
- **Inline Editing**: Single-click editing with type-specific editors
- **Drag & Drop**: Row reordering within/between groups
- **Keyboard Navigation**: Full arrow key, Tab, Enter support

### Column Management
- **Dynamic Visibility**: Show/hide with persistent preferences
- **Interactive Resizing**: Mouse resize with constraints
- **Column Reordering**: Drag-and-drop rearrangement
- **Type Safety**: Compile-time validation of field types

## 🏗️ Architecture Overview

### Hybrid Rendering Model

```typescript
// React Layer - Declarative UI shell
<VibeGrid tableId="tasks" entityType="task" columns={columns}>
  <VibeGridXHeaderPure />        // React controls & menus
  <div ref={containerRef} />     // DOM manipulation target
</VibeGrid>

// DOM Layer - Performance-critical table body
class SimplePassiveRenderer {
  createRowElement(): HTMLElement // Direct DOM creation
  updateOnlyChanged()            // Minimal DOM updates
}

// Canvas Layer - Pixel-perfect overlays
class SelectionOverlayDOM {
  updateWithVisualPositions()    // Precise positioning
}
```

### Three-Layer State System

```typescript
// 1. Data State - Entity processing and grouping
const tableCore$ = observable({
  processedRows: computed(() => transformAndGroupData()),
  groupRowOrders: Record<string, string[]>,
  toggleGroupExpansion: (groupId: string) => void
});

// 2. Visual State - Layout and positioning (computed)
const visualState$ = computed((): VisualState => ({
  columnLayouts: calculateColumnPositions(),
  geometry: calculateViewportGeometry(),
  visualRows: applyGroupingAndVirtualization()
}));

// 3. Interaction State - Selection and editing
const tableInteraction$ = observable({
  selectedCells: Set<string>,
  editingCell: string | null,
  focusedCell: string | null,
  isDragging: boolean
});
```

## 📁 File Structure

```
src/components/custom/vibegrid/
├── VibeGrid.tsx                      # Main React component
├── types.ts                          # Core type definitions
├── column-types.ts                   # Type-safe column system
├── stores/                           # Legend State observables
│   ├── data-state.ts                # Entity data and grouping
│   ├── visual-state.ts              # Layout and positioning
│   ├── interaction-state.ts         # Selection and editing
│   ├── simple-persistence.ts        # LocalStorage sync
│   └── init-state.ts               # Initialization management
├── renderers/                        # DOM manipulation
│   ├── core/SimplePassiveRenderer.ts # Main renderer
│   ├── components/BodyRenderer.ts    # Row and cell creation
│   ├── factories/DOMElementFactory.ts # Element creation
│   └── modules/                      # Specialized controllers
├── overlays/                         # Canvas-based interactions
│   ├── SelectionOverlayDOM.ts       # Selection rectangles
│   ├── ReactiveOverlayManager.tsx   # React overlay coordination
│   └── editors/                     # Cell editors
├── components/                       # React UI components
│   ├── VibeGridXHeaderPure.tsx      # Header with controls
│   ├── GroupConfigPanel.tsx         # Grouping configuration
│   └── VibeGridXColumnVisibility.tsx # Column management
├── utils/                           # Utilities
├── constants/                       # Shared constants
└── tests/                          # Component tests
```

## 🚀 Quick Start

### Basic Usage

```typescript
import { VibeGrid } from '@/components/custom/vibegrid';
import type { Column } from '@/components/custom/vibegrid/types';

interface Task {
  id: string;
  title: string;
  status: 'todo' | 'in-progress' | 'done';
  priority: 'low' | 'medium' | 'high';
  assignee: string;
  dueDate: Date;
}

const columns: Column<Task>[] = [
  {
    id: 'title',
    field: 'title',
    name: 'Task Title',
    cellType: 'text',
    width: 300,
    editable: true
  },
  {
    id: 'status',
    field: 'status',
    name: 'Status',
    cellType: 'select',
    options: [
      { value: 'todo', label: 'To Do', color: '#6b7280' },
      { value: 'in-progress', label: 'In Progress', color: '#3b82f6' },
      { value: 'done', label: 'Done', color: '#10b981' }
    ]
  },
  {
    id: 'priority',
    field: 'priority',
    name: 'Priority',
    cellType: 'select',
    width: 120
  },
  {
    id: 'dueDate',
    field: 'dueDate',
    name: 'Due Date',
    cellType: 'date',
    width: 150
  }
];

function TaskTable() {
  return (
    <VibeGrid<Task>
      tableId="task-table"
      entityType="task"
      columns={columns}
      height={600}
      enableGrouping={true}
      enableSelectionColumn={true}
      onEntityUpdate={async (rowId, updates) => {
        // Handle entity updates
        await updateTask(rowId, updates);
      }}
    />
  );
}
```

### Advanced Configuration

```typescript
function AdvancedTaskTable() {
  return (
    <VibeGrid<Task>
      tableId="advanced-task-table"
      entityType="task"
      columns={columns}
      height="100vh"
      width="100%"

      // Performance options
      enableVirtualScrolling={true}
      bufferSize={20}

      // Feature toggles
      enableGrouping={true}
      enableFiltering={true}
      enableSorting={true}
      enableDragAndDrop={true}
      enableSelectionColumn={true}

      // Event handlers
      onCellClick={(rowId, columnId) => console.log('Cell clicked', rowId, columnId)}
      onSelectionChange={(selectedCells) => console.log('Selection changed', selectedCells)}
      onEntityUpdate={handleEntityUpdate}
      onBatchEntityUpdate={handleBatchUpdate}
    />
  );
}
```

## 🔧 Development Guidelines

### State Management Rules

1. **Always use visual operations**, never direct observable mutation:
```typescript
// ✅ Correct
visualState.visualOperations.setColumnWidth(columnId, width);
visualState.visualOperations.toggleSort(field);

// ❌ Wrong - bypasses reactive system
visualInputs$.columnWidths.set({...});
```

2. **Batch related updates** to prevent unnecessary re-renders:
```typescript
batch(() => {
  visualInputs$.scrollLeft.set(scrollLeft);
  visualInputs$.scrollTop.set(scrollTop);
});
```

### DOM Manipulation

1. **Use factories and renderers**, never direct createElement:
```typescript
// ✅ Correct
const row = domFactory.createRowElement(rowData, index);
const cell = bodyRenderer.createCellElement(row, column);

// ❌ Wrong - bypasses consistent styling
const row = document.createElement('div');
```

2. **Leverage the coordinate system** for positioning:
```typescript
// ✅ Correct - uses computed geometry
const geometry = visualState$.get().geometry;
const cellPosition = getCellPosition(rowIndex, colIndex, geometry);

// ❌ Wrong - manual calculation
const x = colIndex * 150; // Fragile
```

### Performance Best Practices

1. **Use computed observables** for derived state:
```typescript
const sortedRows$ = computed(() => {
  const rows = tableCore$.processedRows.get();
  const sortBy = visualInputs$.sortBy.get();
  return applySorting(rows, sortBy);
});
```

2. **Implement change detection** to avoid unnecessary work:
```typescript
observe(() => {
  const newRows = sortedRows$.get();
  const changes = detectChanges(previousRows, newRows);
  if (changes.length > 0) {
    updateOnlyChangedDOM(changes);
  }
});
```

## 🧪 Testing

### Running Tests

```bash
# Run all VibeGrid tests
./scripts/playwright-test.sh tests/playwright/vibegrid/

# Run specific test category
./scripts/playwright-test.sh tests/playwright/vibegrid/01-basic-rendering.spec.js
./scripts/playwright-test.sh tests/playwright/vibegrid/02-edit-mode-exit-data-validation.spec.js
./scripts/playwright-test.sh tests/playwright/vibegrid/03-column-operations.spec.js
```

### Test Categories

1. **Basic Rendering** - Table structure, data loading, virtual scrolling
2. **Edit Mode & Validation** - Inline editing, data validation, persistence
3. **Column Operations** - Sorting, resizing, visibility, reordering
4. **Selection & Interaction** - Cell selection, keyboard navigation, context menus
5. **Grouping & Aggregation** - Multi-level grouping, drag-and-drop, expansion state

### MCP Playwright Testing

Use MCP tools for interactive testing during development:

```typescript
// Navigate to test page
mcp__playwright__browser_navigate("http://localhost:4000/debug/test-vibegrid-pure");

// Take snapshot of current state
mcp__playwright__browser_snapshot();

// Click on specific cell
mcp__playwright__browser_click("Cell in row 1, column title", "e23");

// Verify selection state
mcp__playwright__browser_take_screenshot("selection-state.png");
```

## 🐛 Debugging

### Common Issues

1. **State not updating**: Check if using visual operations vs direct observable mutation
2. **Performance degradation**: Monitor RAF usage and DOM mutation counts
3. **Selection/editing misalignment**: Verify coordinate system calculations
4. **Persistence not working**: Check Legend State sync configuration

### Debug Tools

```typescript
// Enable debug logging
const fileLog = log('components/VibeGrid');
fileLog.debug('Current state', visualState$.get());

// Use Legend State DevTools (browser extension)
// Monitor observable changes in real-time

// Check DOM structure
console.log('Active rows:', renderer.activeRows.size);
console.log('Coordinate mapping:', renderer.coordinateMapping);
```

### Common Patterns

**Creating New Features:**
1. Add types to `types.ts`
2. Extend visual state if needed
3. Create DOM factory methods
4. Add renderer logic
5. Write Playwright tests

**Debugging Performance:**
- Check `fileLog.debug()` outputs in browser console
- Use Legend State DevTools for reactive debugging
- Monitor RAF usage and DOM mutation counts

**Entity Integration:**
- Connect via `getEntity$(entityType)`
- Use reactive `processedRows` computed
- Handle updates through entity operations

## 🔗 Integration Points

- **Legend State Entities**: Direct reactive connection to entity atoms
- **DataForge Field System**: Compatible with 25+ DataForge field types
- **Authentication Context**: Org/user scoped preferences and permissions
- **WebSocket Sync**: Real-time updates via Durable Objects synchronization
- **Better Auth**: Multi-tenant user context for personalized views

## 📚 Related Documentation

- [Legend State Documentation](https://legendapp.com/open-source/state/)
- [DataForge Field Types](../../../server/dataforge/fields/)
- [Testing Guide](../../../tests/playwright/TESTING-GUIDE.md)
- [Performance Optimization](./docs/PERFORMANCE.md)
- [Architecture Deep Dive](./docs/ARCHITECTURE.md)

---

**VibeGrid** represents a sophisticated approach to building high-performance data grids that combines the best aspects of React's declarative model with the raw performance of direct DOM manipulation, all while maintaining type safety, testability, and developer experience through reactive state management.