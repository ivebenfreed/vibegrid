# VibeGrid: High-Performance Hybrid Data Grid

VibeGrid is a sophisticated data grid component that combines React's declarative UI with direct DOM manipulation for maximum performance. Built on MobX observables, it implements a **Pure Observable Architecture** for enterprise applications requiring complex data manipulation, real-time synchronization, and extensive customization.

## 🚀 Key Features

### Performance & Scalability
- **Virtual Scrolling**: Handle 100,000+ rows at 60fps
- **Hybrid Rendering**: React for UI controls, direct DOM for table body
- **Smart Change Detection**: Minimal re-renders using MobX reactions
- **Memory Management**: Automatic cleanup and element pooling

### Data Management
- **Real-time Entity Sync**: MobX reactive stores with DataForge integration
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

### Three-Layer Store System (MobX)

```typescript
// 1. TableCoreStore - Entity processing and grouping
class TableCoreStore {
  @observable processedRows: any[]
  @observable groupRowOrders: Record<string, GroupRowOrderConfig>
  @observable flatRowOrder: string[]

  @action toggleGroupExpansion(groupId: string): void
  @action moveRowInGroup(sourceGroup, targetGroup, rowId, index): void
  @action moveRowInFlat(fromIndex, toIndex): boolean
}

// 2. VisualStateStore - Layout and positioning
class VisualStateStore {
  @observable columnWidths: Record<string, number>
  @observable columnVisibility: Record<string, boolean>
  @observable sortBy: SortConfig[]
  @observable filters: FilterConfig[]
  @observable groupConfig: GroupConfig | null

  @computed get visibleColumns(): Column[]
  @computed get columnLayouts(): ColumnLayout[]
}

// 3. InteractionStore - Selection and editing
class InteractionStore {
  @observable selectedCells: Set<string>
  @observable focusedCell: string | null
  @observable editingCell: string | null
  @observable isDragging: boolean
  @observable clipboard: ClipboardState | null

  @action clearSelection(): void
  @action clearClipboard(): void
}
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

1. **Always use @action methods**, never direct observable mutation:
```typescript
// ✅ Correct
visualStateStore.setColumnWidth(columnId, width);
visualStateStore.toggleSort(field);

// ❌ Wrong - violates MobX strict mode
visualStateStore.columnWidths[columnId] = width; // Error: enforceActions: 'always'
```

2. **Use runInAction for batch updates**:
```typescript
import { runInAction } from 'mobx';

runInAction(() => {
  interactionStore.scrollLeft = scrollLeft;
  interactionStore.scrollTop = scrollTop;
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

1. **Use @computed for derived state**:
```typescript
class TableCoreStore {
  @computed get sortedRows(): any[] {
    return applySorting(this.processedRows, this.visualStateStore.sortBy);
  }
}
```

2. **Use MobX reactions for side effects**:
```typescript
import { reaction } from 'mobx';

reaction(
  () => store.sortedRows, // Track this value
  (newRows) => {
    const changes = detectChanges(previousRows, newRows);
    if (changes.length > 0) {
      updateOnlyChangedDOM(changes);
    }
  }
);
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

### Cell Targeting for Tests

All cells have `data-testid` attributes for reliable test targeting:

```typescript
// Cell attributes structure
data-testid="cell-{rowId}-{columnId}"
data-row-id="{rowId}"
data-column-id="{columnId}"
data-field-type="{fieldType}"
```

**Playwright Examples:**

```javascript
// Target specific cell (includes padding)
await page.click('[data-testid="cell-abc123-title"]')

// Use getByTestId (recommended)
await page.getByTestId('cell-abc123-title').click()

// Target by field type
await page.locator('[data-field-type="text"]').first().click()

// Combine selectors for precision
await page.click('[data-row-id="abc123"][data-column-id="title"]')
```

**Selection vs Editing:**
- Click on **cell padding** (edges) → Selection only
- Click on **cell content** (text/input) → Enters edit mode
- CellActionRouter automatically detects click location

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

1. **State not updating**: Check if using @action methods (MobX strict mode enabled)
2. **Performance degradation**: Monitor RAF usage and DOM mutation counts
3. **Selection/editing misalignment**: Verify coordinate system calculations
4. **Persistence not working**: Check PersistenceStore localStorage sync

### Debug Tools

```typescript
// Enable debug logging
import { createLogger } from '@/shared/lib/logging';
const fileLog = createLogger('systems/vibegrid/VibeGrid');
fileLog.debug('Current state', visualStateStore.visibleColumns);

// Use MobX DevTools (browser extension)
// Monitor observable changes and reactions in real-time

// Check DOM structure
console.log('Active rows:', renderer.activeRows.size);

// Vibegrid logging presets
__VIBEGRID_LOGS__.quiet()   // Warnings/errors only
__VIBEGRID_LOGS__.normal()  // Balanced (default)
__VIBEGRID_LOGS__.debug()   // All logs
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
- Use MobX DevTools browser extension for reactive debugging
- Monitor RAF usage and DOM mutation counts
- Use `__VIBEGRID_LOGS__.debug()` for detailed overlay logging

**Entity Integration:**
- Connect via DataForge entity queries
- Use MobX `@computed processedRows`
- Handle updates through `onEntityUpdate` callback

## 🔗 Integration Points

- **MobX Stores**: Reactive state management with strict mode
- **DataForge Field System**: Compatible with 25+ DataForge field types
- **TanStack Query**: Entity data fetching and caching
- **Authentication Context**: Org/user scoped preferences and permissions
- **WebSocket Sync**: Real-time updates via Durable Objects synchronization

## 📚 Related Documentation

- [UX Specification](./UX_SPEC.md) - Comprehensive interaction patterns and testing guide
- [MobX Documentation](https://mobx.js.org/)
- [DataForge Field Types](../../../server/domain/dataforge/fields/)
- [Vibegrid Stores](./stores/)
- [Chrome DevTools Skill](../../../../.claude/skills/chrome-devtools/SKILL.md) - Browser automation for testing

---

**VibeGrid** represents a sophisticated approach to building high-performance data grids that combines the best aspects of React's declarative model with the raw performance of direct DOM manipulation, all while maintaining type safety, testability, and developer experience through reactive state management.