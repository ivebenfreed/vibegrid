# VibeGrid Testing Strategy

**Document Purpose**: Comprehensive testing strategy for building VibeGrid with MobX + TanStack DB.

---

## Table of Contents

1. [Testing Phases](#testing-phases)
2. [Unit Testing](#unit-testing)
3. [Integration Testing](#integration-testing)
4. [Playwright E2E Tests](#playwright-e2e-tests)
5. [Performance Testing](#performance-testing)
6. [Visual Regression Testing](#visual-regression-testing)
7. [Feature Validation Checklist](#feature-validation-checklist)

---

## Testing Phases

### Continuous Testing (Weeks 1-7)

**Goal**: Validate each implementation phase as you build.

#### After Each Store Implementation
- [ ] Run unit tests for new store
- [ ] Run integration tests
- [ ] Manual smoke testing
- [ ] Check performance is acceptable

#### After Each Component
- [ ] Run relevant Playwright tests
- [ ] Visual regression check
- [ ] Manual interaction testing

---

### Final Validation (Week 8)

**Goal**: Complete validation before deployment.

#### Tasks
- [ ] Complete Playwright test suite (100% passing)
- [ ] Performance validation (60fps scrolling)
- [ ] Visual regression testing
- [ ] Edge case validation
- [ ] Cross-browser testing

---

## Baseline Metrics

### Performance Metrics to Capture

#### Initial Render Performance
```bash
# Test configuration
- Entity count: 1,000 rows
- Visible columns: 10
- Viewport: 1920x1080
- Browser: Chrome (latest)

# Metrics to record
- Time to First Byte (TTFB)
- First Contentful Paint (FCP)
- Largest Contentful Paint (LCP)
- Time to Interactive (TTI)
- Total Blocking Time (TBT)
```

**Baseline Script**:
```typescript
// scripts/test-vibegrid-baseline.ts
import { performance } from 'perf_hooks';

async function measureInitialRender() {
  const start = performance.now();

  // Navigate to VibeGrid page
  await page.goto('http://localhost:4000/tasks');

  // Wait for table to render
  await page.waitForSelector('.vibegridx-table');

  const end = performance.now();

  console.log({
    initialRender: `${end - start}ms`,
    visibleRows: await page.$$eval('.vibegridx-row', rows => rows.length),
    memoryUsage: process.memoryUsage()
  });
}
```

#### Virtual Scrolling Performance
```bash
# Test configuration
- Entity count: 100,000 rows
- Scroll speed: 500px/second
- Duration: 10 seconds
- Target FPS: 60fps (16.67ms per frame)

# Metrics to record
- Average FPS during scroll
- Frame drops (frames > 16.67ms)
- Memory usage
- CPU usage
```

**Baseline Script**:
```typescript
async function measureScrollPerformance() {
  await page.evaluate(() => {
    const container = document.querySelector('.vibegridx-scroll-container');
    let frameCount = 0;
    let totalTime = 0;

    const measureFrame = () => {
      const start = performance.now();

      // Simulate scroll
      container.scrollTop += 50;

      requestAnimationFrame(() => {
        const end = performance.now();
        totalTime += (end - start);
        frameCount++;

        if (frameCount < 600) { // 10 seconds at 60fps
          measureFrame();
        } else {
          console.log({
            avgFrameTime: totalTime / frameCount,
            fps: 1000 / (totalTime / frameCount),
            frameDrops: /* count frames > 16.67ms */
          });
        }
      });
    };

    measureFrame();
  });
}
```

#### Selection Performance
```bash
# Test configuration
- Select 100 cells
- Measure time for visual update
- Target: < 100ms for 100 cells

# Metrics to record
- Single cell selection time
- Range selection time (100 cells)
- Multi-select time (100 cells via Ctrl+Click)
- Memory impact
```

#### Editing Performance
```bash
# Test configuration
- Enter edit mode
- Type 100 characters
- Commit edit
- Target: < 50ms activation, 60fps typing

# Metrics to record
- Edit mode activation time
- Keystroke latency
- Commit latency
- Validation time
```

---

## Unit Testing

### Store Tests

Each MobX store should have comprehensive unit tests.

#### TableCoreStore Tests
```typescript
// src/stores/vibegrid/TableCoreStore.test.ts
import { TableCoreStore } from './TableCoreStore';

describe('TableCoreStore', () => {
  let store: TableCoreStore;

  beforeEach(() => {
    store = new TableCoreStore();
  });

  describe('filtering', () => {
    it('should filter rows by equals operator', () => {
      store.setRawEntities([
        { id: '1', status: 'active' },
        { id: '2', status: 'inactive' }
      ]);

      store.setFilters([
        { field: 'status', operator: 'equals', value: 'active' }
      ]);

      expect(store.processedRows).toHaveLength(1);
      expect(store.processedRows[0].id).toBe('1');
    });

    it('should filter rows by contains operator', () => {
      // Test implementation
    });

    // ... more filter tests
  });

  describe('sorting', () => {
    it('should sort rows ascending', () => {
      store.setRawEntities([
        { id: '1', name: 'Charlie' },
        { id: '2', name: 'Alice' },
        { id: '3', name: 'Bob' }
      ]);

      store.setSortBy([{ field: 'name', direction: 'asc' }]);

      expect(store.processedRows.map(r => r.name)).toEqual(['Alice', 'Bob', 'Charlie']);
    });

    it('should sort rows descending', () => {
      // Test implementation
    });

    it('should sort with multiple fields', () => {
      // Test implementation
    });
  });

  describe('grouping', () => {
    it('should group rows by field', () => {
      // Test implementation
    });

    it('should handle multi-level grouping', () => {
      // Test implementation
    });
  });

  describe('persistence', () => {
    it('should save preferences to localStorage', () => {
      // Test implementation
    });

    it('should load preferences from localStorage', () => {
      // Test implementation
    });
  });
});
```

#### VisualStateStore Tests
```typescript
describe('VisualStateStore', () => {
  describe('column layouts', () => {
    it('should compute column positions', () => {
      // Test implementation
    });

    it('should handle column resizing', () => {
      // Test implementation
    });

    it('should handle column reordering', () => {
      // Test implementation
    });

    it('should filter hidden columns', () => {
      // Test implementation
    });
  });

  describe('viewport geometry', () => {
    it('should compute visible row range', () => {
      // Test implementation
    });

    it('should compute visible column range', () => {
      // Test implementation
    });
  });
});
```

#### InteractionStore Tests
```typescript
describe('InteractionStore', () => {
  describe('cell selection', () => {
    it('should select single cell', () => {
      // Test implementation
    });

    it('should toggle cell with Ctrl', () => {
      // Test implementation
    });

    it('should select range with Shift', () => {
      // Test implementation
    });

    it('should clear selection', () => {
      // Test implementation
    });
  });

  describe('editing', () => {
    it('should enter edit mode', () => {
      // Test implementation
    });

    it('should exit edit mode on Enter', () => {
      // Test implementation
    });

    it('should cancel edit on Escape', () => {
      // Test implementation
    });
  });
});
```

---

## Integration Testing

### TanStack DB Collection Tests

```typescript
// src/data/db/collections/entities.test.ts
import { renderHook, waitFor } from '@testing-library/react';
import { useEntityCollection } from '@/data/db/hooks/useEntityCollection';

describe('Entity Collections', () => {
  it('should load collection', async () => {
    const { result } = renderHook(() => useEntityCollection('WorkTask'));

    await waitFor(() => {
      expect(result.current).toBeDefined();
    });
  });

  it('should update optimistically', async () => {
    const { result } = renderHook(() => useEntityCollection('WorkTask'));

    await waitFor(() => {
      expect(result.current).toBeDefined();
    });

    const collection = result.current;
    if (!collection) return;

    // Update using collection API
    const tx = collection.update('task-1', (draft) => {
      draft.status = 'completed';
    });

    // Should update immediately (optimistic)
    const task = collection.get('task-1');
    expect(task?.status).toBe('completed');

    // Wait for server confirmation
    await tx.isPersisted.promise;
  });

  it('should rollback on error', async () => {
    // Mock API to return error
    // Test rollback behavior via collection mutation error handling
  });

  it('should work with useLiveQuery', async () => {
    const { result } = renderHook(() => {
      const collection = useEntityCollection('WorkTask');
      const query = useLiveQuery((q) => {
        if (!collection) return undefined;
        return q.from({ task: collection }).select(({ task }) => task);
      });
      return query;
    });

    await waitFor(() => {
      expect(result.current.data).toBeDefined();
    });
  });
});
```

---

## Playwright E2E Tests

### Existing Test Files to Update

All existing VibeGrid Playwright tests must pass with MobX version:

#### 01-basic-rendering.spec.js
```javascript
test.describe('Basic Rendering', () => {
  test('should render table with data', async ({ page }) => {
    await page.goto('http://localhost:4000/tasks');

    // Wait for table
    await page.waitForSelector('.vibegridx-table');

    // Verify rows rendered
    const rows = await page.$$('.vibegridx-row');
    expect(rows.length).toBeGreaterThan(0);
  });

  test('should render columns', async ({ page }) => {
    // Test implementation
  });

  test('should handle virtual scrolling', async ({ page }) => {
    // Scroll and verify new rows load
  });
});
```

#### 02-edit-mode-exit-data-validation.spec.js
```javascript
test.describe('Edit Mode', () => {
  test('should enter edit mode on click', async ({ page }) => {
    // Click cell
    // Verify edit overlay appears
    // Verify cell value editable
  });

  test('should commit on Enter', async ({ page }) => {
    // Enter edit mode
    // Type value
    // Press Enter
    // Verify value saved
  });

  test('should cancel on Escape', async ({ page }) => {
    // Enter edit mode
    // Change value
    // Press Escape
    // Verify value reverted
  });
});
```

#### 03-column-operations.spec.js
```javascript
test.describe('Column Operations', () => {
  test('should sort column', async ({ page }) => {
    // Click column header
    // Verify sort indicator
    // Verify rows sorted
  });

  test('should resize column', async ({ page }) => {
    // Drag resize handle
    // Verify column width changed
  });

  test('should toggle column visibility', async ({ page }) => {
    // Open column menu
    // Toggle visibility
    // Verify column hidden/shown
  });
});
```

#### 04-selection-interaction.spec.js
```javascript
test.describe('Selection', () => {
  test('should select single cell', async ({ page }) => {
    // Test implementation
  });

  test('should select range with Shift', async ({ page }) => {
    // Test implementation
  });

  test('should multi-select with Ctrl', async ({ page }) => {
    // Test implementation
  });

  test('should select row via checkbox', async ({ page }) => {
    // Test implementation
  });
});
```

#### 05-grouping-aggregation.spec.js
```javascript
test.describe('Grouping', () => {
  test('should group by field', async ({ page }) => {
    // Open group menu
    // Select field
    // Verify groups created
  });

  test('should expand/collapse groups', async ({ page }) => {
    // Test implementation
  });

  test('should show aggregations', async ({ page }) => {
    // Test implementation
  });
});
```

---

## Performance Testing

### Automated Performance Tests

```typescript
// tests/performance/vibegrid-performance.spec.ts
import { test, expect } from '@playwright/test';

test.describe('VibeGrid Performance', () => {
  test('initial render performance', async ({ page }) => {
    await page.goto('http://localhost:4000/tasks');

    const metrics = await page.evaluate(() => {
      const perfData = window.performance.getEntriesByType('navigation')[0];
      return {
        domContentLoaded: perfData.domContentLoadedEventEnd - perfData.fetchStart,
        loadComplete: perfData.loadEventEnd - perfData.fetchStart,
        domInteractive: perfData.domInteractive - perfData.fetchStart
      };
    });

    // Assert metrics meet baseline
    expect(metrics.domInteractive).toBeLessThan(BASELINE.domInteractive * 1.1); // 10% tolerance
  });

  test('scroll performance', async ({ page }) => {
    await page.goto('http://localhost:4000/tasks');

    // Measure FPS during scroll
    const fps = await page.evaluate(async () => {
      const container = document.querySelector('.vibegridx-scroll-container');
      let frames = 0;
      let lastTime = performance.now();

      return new Promise((resolve) => {
        const measureFPS = () => {
          const now = performance.now();
          frames++;

          if (now - lastTime >= 1000) {
            resolve(frames);
          } else {
            container.scrollTop += 10;
            requestAnimationFrame(measureFPS);
          }
        };

        measureFPS();
      });
    });

    expect(fps).toBeGreaterThanOrEqual(55); // Allow 5fps drop
  });
});
```

---

## Visual Regression Testing

Use Playwright's screenshot comparison for visual regression:

```typescript
// tests/visual/vibegrid-visual.spec.ts
test.describe('Visual Regression', () => {
  test('table renders correctly', async ({ page }) => {
    await page.goto('http://localhost:4000/tasks');
    await page.waitForSelector('.vibegridx-table');

    await expect(page).toHaveScreenshot('table-default.png');
  });

  test('selection visual state', async ({ page }) => {
    await page.goto('http://localhost:4000/tasks');

    // Select cell
    await page.click('.vibegridx-cell[data-row-id="1"][data-col-id="title"]');

    await expect(page).toHaveScreenshot('table-cell-selected.png');
  });

  test('edit mode visual state', async ({ page }) => {
    // Enter edit mode
    // Take screenshot
  });

  test('grouped table visual state', async ({ page }) => {
    // Apply grouping
    // Take screenshot
  });
});
```

---

## Migration Validation Checklist

### Functional Validation

- [ ] **Basic Rendering**
  - [ ] Table loads with data
  - [ ] Correct number of rows
  - [ ] Correct number of columns
  - [ ] Virtual scrolling works

- [ ] **Data Operations**
  - [ ] Sorting works (single column)
  - [ ] Sorting works (multiple columns)
  - [ ] Filtering works (all operators)
  - [ ] Grouping works (single level)
  - [ ] Grouping works (multi-level)
  - [ ] Expand/collapse groups

- [ ] **Selection**
  - [ ] Single cell selection
  - [ ] Multi-cell selection (Ctrl)
  - [ ] Range selection (Shift)
  - [ ] Row selection (checkbox)
  - [ ] Select all
  - [ ] Clear selection
  - [ ] Keyboard navigation (arrows)

- [ ] **Editing**
  - [ ] Enter edit mode (click)
  - [ ] Enter edit mode (double-click)
  - [ ] Enter edit mode (F2)
  - [ ] Type in cell
  - [ ] Commit edit (Enter)
  - [ ] Cancel edit (Escape)
  - [ ] Tab to next cell
  - [ ] All 12 editor types work

- [ ] **Column Operations**
  - [ ] Column resize
  - [ ] Column reorder
  - [ ] Column visibility toggle
  - [ ] Reset columns

- [ ] **Performance**
  - [ ] Initial render ≤ baseline
  - [ ] Scroll at 60fps
  - [ ] Selection responsive
  - [ ] Editing responsive
  - [ ] Memory usage ≤ baseline

- [ ] **Data Sync**
  - [ ] TanStack DB collections load
  - [ ] Incremental sync working
  - [ ] Optimistic updates immediate
  - [ ] Rollback on error
  - [ ] Real-time updates (polling/WebSocket)

### Technical Validation

- [ ] **Type Safety**
  - [ ] No TypeScript errors
  - [ ] No `any` types
  - [ ] Proper store interfaces

- [ ] **Code Quality**
  - [ ] No ESLint warnings
  - [ ] Consistent code style
  - [ ] Proper error handling

- [ ] **Testing**
  - [ ] All unit tests passing
  - [ ] All integration tests passing
  - [ ] All Playwright tests passing
  - [ ] Visual regression tests passing

---

## Rollback Testing

### Validate Rollback Procedure

Before considering migration complete, test the rollback:

1. **Switch to Legend State version**
   ```typescript
   const ENABLE_MOBX_VIBEGRID = false;
   ```

2. **Verify functionality**
   - [ ] Table still works
   - [ ] Data loads
   - [ ] All features functional

3. **Switch back to MobX version**
   ```typescript
   const ENABLE_MOBX_VIBEGRID = true;
   ```

4. **Verify functionality again**
   - [ ] Table works
   - [ ] No errors
   - [ ] All features functional

---

**Document Version**: 1.0
**Last Updated**: 2025-10-22
**Status**: Ready for Use
