# VibeGrid Cell Rendering Robustness Implementation Plan

**Objective**: Eliminate inconsistent cell rendering by implementing a reactive-first architecture with dependency resolution and staged loading.

## Problem Analysis

### Current Issues
1. **Timing Race Conditions**: Multiple async observables load at different times
2. **Cell Type Inconsistency**: `column.cellType || column.type` creates non-deterministic behavior
3. **Lazy Relationship Loading**: `__resolved_${column.id}` data populates after initial render
4. **Premature Rendering**: Cells render with partial data, then flash when complete data arrives
5. **No Error Boundaries**: Cell rendering failures cascade and break entire table

### Impact
- Flickering/flashing cell content during data loading
- Inconsistent display of relationship fields (ID vs display name)
- Enum/badge cells showing different styling on subsequent renders
- Poor user experience with visual instability

## Implementation Phases

## Phase 1: Cell Readiness Detection System

### 1.1 Create Cell Dependency Interface

**File**: `apps/worker/src/components/custom/vibegrid/types/cell-dependencies.ts`

```typescript
export interface CellRenderDependencies {
  schema: boolean;           // Column schema loaded
  data: boolean;             // Row data available  
  relationships: string[];   // Required resolved relationships
  computed: string[];        // Required computed values
  formatting: boolean;       // Display formatters ready
}

export interface CellReadinessStatus {
  isReady: boolean;
  missingDependencies: string[];
  lastChecked: number;
}
```

**Test Outcome**: Cell dependency tracking works correctly for all cell types

### 1.2 Implement Cell Readiness Checker

**File**: `apps/worker/src/components/custom/vibegrid/utils/cell-readiness.ts`

```typescript
import { Column } from '../types';
import { CellRenderDependencies, CellReadinessStatus } from '../types/cell-dependencies';

export function getCellDependencies(cellType: string, column: Column): CellRenderDependencies {
  const deps: CellRenderDependencies = {
    schema: true,
    data: true, 
    relationships: [],
    computed: [],
    formatting: false
  };

  switch (cellType) {
    case 'relationship-single':
    case 'relationship-multi':
      deps.relationships.push(column.id);
      deps.formatting = true;
      break;
    
    case 'enum':
    case 'select':
      deps.formatting = true;
      break;
      
    case 'rollup_count':
    case 'rollup_sum': 
    case 'rollup_average':
    case 'rollup_concat':
      deps.computed.push(column.id);
      deps.relationships = column.rollupConfig?.relationshipType ? [column.rollupConfig.relationshipType] : [];
      break;
      
    default:
      // Basic cells just need data
      break;
  }
  
  return deps;
}

export function checkCellReadiness(
  column: Column, 
  rowData: any, 
  deps: CellRenderDependencies,
  context: {
    schemaLoaded: boolean;
    relationshipResolver: Map<string, any>;
    formattersReady: boolean;
  }
): CellReadinessStatus {
  const missing: string[] = [];
  
  if (!deps.schema || !context.schemaLoaded) {
    missing.push('schema');
  }
  
  if (!deps.data || !rowData) {
    missing.push('data');
  }
  
  if (deps.formatting && !context.formattersReady) {
    missing.push('formatting');
  }
  
  // Check relationship dependencies
  for (const rel of deps.relationships) {
    const key = `${rowData.id}:${rel}`;
    if (!context.relationshipResolver.has(key)) {
      missing.push(`relationship:${rel}`);
    }
  }
  
  // Check computed dependencies
  for (const comp of deps.computed) {
    if (rowData[comp] === undefined) {
      missing.push(`computed:${comp}`);
    }
  }
  
  return {
    isReady: missing.length === 0,
    missingDependencies: missing,
    lastChecked: Date.now()
  };
}
```

**Test Outcome**: Readiness checker correctly identifies missing dependencies for each cell type

### 1.3 Create Loading Cell Components

**File**: `apps/worker/src/components/custom/vibegrid/components/LoadingCell.ts`

```typescript
export function createLoadingCell(cellType: string, column: Column): HTMLElement {
  const loading = document.createElement('div');
  loading.className = `vibegrid-cell-loading vibegrid-cell-loading-${cellType}`;
  
  // Different loading states for different cell types
  switch (cellType) {
    case 'relationship-single':
    case 'relationship-multi':
      loading.innerHTML = `
        <div class="flex items-center gap-2">
          <div class="loading-spinner-sm"></div>
          <span class="text-muted-foreground text-xs">Loading...</span>
        </div>
      `;
      break;
      
    case 'enum':
      loading.innerHTML = `
        <div class="loading-badge">
          <div class="loading-spinner-sm"></div>
        </div>
      `;
      break;
      
    default:
      loading.innerHTML = `<div class="loading-spinner-sm"></div>`;
      break;
  }
  
  loading.title = `Loading ${column.label || column.id}...`;
  return loading;
}

export function createErrorCell(error: Error, column: Column): HTMLElement {
  const errorCell = document.createElement('div');
  errorCell.className = 'vibegrid-cell-error';
  errorCell.innerHTML = `
    <div class="flex items-center gap-2 text-red-600">
      <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
      </svg>
      <span class="text-xs">Error</span>
    </div>
  `;
  errorCell.title = `Error in ${column.label}: ${error.message}`;
  return errorCell;
}
```

**Test Outcome**: Loading cells display correctly and provide clear feedback

## Phase 2: Staged Observable Loading

### 2.1 Create Data Loading Stage Manager

**File**: `apps/worker/src/components/custom/vibegrid/stores/data-loading-stages.ts`

```typescript
import { observable, batch } from '@legendapp/state';
import { log } from '@/logger';

const fileLog = log('components/custom/vibegrid/stores/data-loading-stages.ts');

export type LoadingStage = 'idle' | 'schema' | 'data' | 'relationships' | 'formatting' | 'ready' | 'error';

export interface LoadingStageContext {
  entityType: string;
  startTime: number;
  errors: Error[];
  completedStages: Set<LoadingStage>;
}

export function createDataLoadingStage$(entityType: string) {
  const loadingStage$ = observable({
    stage: 'idle' as LoadingStage,
    context: {
      entityType,
      startTime: Date.now(),
      errors: [],
      completedStages: new Set<LoadingStage>()
    } as LoadingStageContext,
    
    // Stage progression gates
    get canLoadData() {
      return this.stage === 'schema' && this.context.completedStages.has('schema');
    },
    
    get canLoadRelationships() {
      return this.stage === 'data' && this.context.completedStages.has('data');
    },
    
    get canLoadFormatting() {
      return this.stage === 'relationships' && this.context.completedStages.has('relationships');
    },
    
    get isReady() {
      return this.stage === 'ready' && this.context.completedStages.has('formatting');
    },
    
    get hasError() {
      return this.stage === 'error' || this.context.errors.length > 0;
    },
    
    // Stage transition methods
    async advanceToStage(targetStage: LoadingStage, data?: any) {
      try {
        fileLog.info(`🔄 Advancing from ${this.stage} to ${targetStage}`, {
          entityType: this.context.entityType,
          currentStage: this.stage
        });
        
        batch(() => {
          this.context.completedStages.add(this.stage);
          this.stage = targetStage;
        });
        
        // Trigger stage-specific loading
        switch (targetStage) {
          case 'schema':
            await this.loadSchema();
            break;
          case 'data': 
            await this.loadData();
            break;
          case 'relationships':
            await this.loadRelationships(data);
            break;
          case 'formatting':
            await this.loadFormatting();
            break;
          case 'ready':
            this.markReady();
            break;
        }
        
      } catch (error) {
        this.handleError(error as Error);
      }
    },
    
    async loadSchema() {
      // Implementation will be added in Phase 2.2
    },
    
    async loadData() {
      // Implementation will be added in Phase 2.3
    },
    
    async loadRelationships(processedRows: any[]) {
      // Implementation will be added in Phase 2.4
    },
    
    async loadFormatting() {
      // Implementation will be added in Phase 2.5
    },
    
    markReady() {
      batch(() => {
        this.context.completedStages.add('formatting');
        this.stage = 'ready';
      });
      
      const totalTime = Date.now() - this.context.startTime;
      fileLog.info(`✅ Data loading complete`, {
        entityType: this.context.entityType,
        totalTimeMs: totalTime,
        stages: Array.from(this.context.completedStages)
      });
    },
    
    handleError(error: Error) {
      fileLog.error(`❌ Data loading error`, {
        entityType: this.context.entityType,
        stage: this.stage,
        error: error.message
      });
      
      batch(() => {
        this.context.errors.push(error);
        this.stage = 'error';
      });
    },
    
    reset() {
      batch(() => {
        this.stage = 'idle';
        this.context.startTime = Date.now();
        this.context.errors = [];
        this.context.completedStages.clear();
      });
    }
  });
  
  return loadingStage$;
}
```

**Test Outcome**: Stage transitions work correctly with proper error handling

### 2.2 Implement Schema Loading Stage

**Update**: `apps/worker/src/components/custom/vibegrid/stores/data-loading-stages.ts`

```typescript
async loadSchema() {
  const schema = universeSchema$.get();
  
  if (!schema?.entities || !schema.entities[this.context.entityType]) {
    throw new Error(`Schema not available for entity: ${this.context.entityType}`);
  }
  
  fileLog.info(`✅ Schema loaded for ${this.context.entityType}`);
  
  if (this.canLoadData) {
    await this.advanceToStage('data');
  }
},
```

**Test Outcome**: Schema stage completes only when universe schema is fully loaded

### 2.3 Implement Data Loading Stage

```typescript
async loadData() {
  const entityObs = getEntity$(this.context.entityType);
  
  if (!entityObs) {
    throw new Error(`Entity observable not available: ${this.context.entityType}`);
  }
  
  const data = entityObs.get() || {};
  const rows = Object.values(data);
  
  if (rows.length === 0) {
    fileLog.warn(`⚠️ No data found for ${this.context.entityType}`);
  }
  
  fileLog.info(`✅ Data loaded for ${this.context.entityType}`, {
    rowCount: rows.length
  });
  
  if (this.canLoadRelationships) {
    await this.advanceToStage('relationships', rows);
  }
},
```

**Test Outcome**: Data stage waits for entity observable and loads all records

### 2.4 Implement Relationship Loading Stage  

```typescript
async loadRelationships(processedRows: any[]) {
  // Get all relationship columns
  const columns = tableCore$.columns.get();
  const relationshipColumns = columns.filter(col => 
    col.cellType?.startsWith('relationship')
  );
  
  if (relationshipColumns.length === 0) {
    fileLog.info(`✅ No relationships to load for ${this.context.entityType}`);
    if (this.canLoadFormatting) {
      await this.advanceToStage('formatting');
    }
    return;
  }
  
  // Load relationships for each row
  const promises = processedRows.map(row => 
    this.loadRelationshipsForRow(row, relationshipColumns)
  );
  
  await Promise.all(promises);
  
  fileLog.info(`✅ Relationships loaded for ${this.context.entityType}`, {
    columns: relationshipColumns.map(c => c.id),
    rowCount: processedRows.length
  });
  
  if (this.canLoadFormatting) {
    await this.advanceToStage('formatting');
  }
},

async loadRelationshipsForRow(row: any, relationshipColumns: any[]) {
  for (const column of relationshipColumns) {
    const value = row[column.id];
    if (value) {
      try {
        const resolved = await this.resolveRelationshipValue(column, value);
        row[`__resolved_${column.id}`] = resolved;
      } catch (error) {
        fileLog.warn(`⚠️ Failed to resolve relationship`, {
          column: column.id,
          value,
          error: (error as Error).message
        });
      }
    }
  }
},

async resolveRelationshipValue(column: any, value: any): Promise<any> {
  // This will integrate with existing relationship resolution logic
  // For now, return a mock resolved value
  if (Array.isArray(value)) {
    return value.map(v => `Resolved ${v}`);
  }
  return `Resolved ${value}`;
}
```

**Test Outcome**: All relationship fields have resolved values before rendering

### 2.5 Implement Formatting Stage

```typescript
async loadFormatting() {
  // Ensure all display formatters are ready
  const formattersReady = await this.checkFormattersReady();
  
  if (!formattersReady) {
    throw new Error('Display formatters not ready');
  }
  
  fileLog.info(`✅ Formatting ready for ${this.context.entityType}`);
  this.markReady();
},

async checkFormattersReady(): Promise<boolean> {
  // Check if formatFieldForDisplay is available
  try {
    const { formatFieldForDisplay } = await import('@/server/dataforge/fields/display-formatters');
    return typeof formatFieldForDisplay === 'function';
  } catch (error) {
    return false;
  }
}
```

**Test Outcome**: Formatting stage ensures all display formatters are loaded

## Phase 3: Cell Type Resolution System

### 3.1 Create Reactive Cell Type Manager

**File**: `apps/worker/src/components/custom/vibegrid/stores/cell-type-manager.ts`

```typescript
import { observable } from '@legendapp/state';
import { Column } from '../types';
import { log } from '@/logger';

const fileLog = log('components/custom/vibegrid/stores/cell-type-manager.ts');

export function createCellTypeManager$(columns: Column[]) {
  const cellTypeManager$ = observable({
    // Cache resolved cell types per column
    resolved: new Map<string, string>(),
    
    // Version counter for cache invalidation
    version: 0,
    
    get(columnId: string, column: Column): string {
      const cacheKey = `${columnId}:${this.version}`;
      
      if (!this.resolved.has(cacheKey)) {
        const cellType = this.determineCellType(column);
        this.resolved.set(cacheKey, cellType);
        
        fileLog.debug(`🔧 Resolved cell type`, {
          columnId,
          cellType,
          column: {
            cellType: column.cellType,
            type: column.type,
            fieldSchema: !!column.fieldSchema
          }
        });
      }
      
      return this.resolved.get(cacheKey)!;
    },
    
    determineCellType(column: Column): string {
      // Priority order for cell type resolution
      
      // 1. Field schema display type (highest priority)
      if (column.fieldSchema?.displayType) {
        return column.fieldSchema.displayType;
      }
      
      // 2. Explicit cellType
      if (column.cellType) {
        return column.cellType;
      }
      
      // 3. Base type
      if (column.type) {
        return column.type;
      }
      
      // 4. Default fallback
      return 'text';
    },
    
    invalidateCache() {
      this.version++;
      this.resolved.clear();
      
      fileLog.info(`🔄 Cell type cache invalidated`, {
        newVersion: this.version
      });
    },
    
    updateColumn(columnId: string, column: Column) {
      // Force recalculation for this column
      const oldKeys = Array.from(this.resolved.keys()).filter(key => 
        key.startsWith(`${columnId}:`)
      );
      
      oldKeys.forEach(key => this.resolved.delete(key));
      
      // Get new cell type
      const newCellType = this.get(columnId, column);
      
      fileLog.info(`🔄 Column cell type updated`, {
        columnId,
        cellType: newCellType
      });
    }
  });
  
  return cellTypeManager$;
}
```

**Test Outcome**: Cell types resolve consistently and cache invalidation works correctly

## Phase 4: Relationship Resolution Pipeline

### 4.1 Create Relationship Resolver

**File**: `apps/worker/src/components/custom/vibegrid/stores/relationship-resolver.ts`

```typescript
import { observable, batch } from '@legendapp/state';
import { Column } from '../types';
import { log } from '@/logger';

const fileLog = log('components/custom/vibegrid/stores/relationship-resolver.ts');

export type ResolutionStatus = 'pending' | 'resolved' | 'error' | 'not_needed';

export interface ResolutionEntry {
  status: ResolutionStatus;
  value?: any;
  error?: string;
  timestamp: number;
}

export function createRelationshipResolver$() {
  const relationshipResolver$ = observable({
    // Map: rowId:columnId -> ResolutionEntry
    resolutions: new Map<string, ResolutionEntry>(),
    
    // Batch processing queue
    pendingQueue: new Set<string>(),
    processingBatch: false,
    
    async resolveForRow(rowId: string, columns: Column[], rowData: any): Promise<void> {
      const relationshipColumns = columns.filter(col => 
        col.cellType?.startsWith('relationship')
      );
      
      if (relationshipColumns.length === 0) {
        return;
      }
      
      fileLog.debug(`🔍 Resolving relationships for row`, {
        rowId,
        relationshipCount: relationshipColumns.length
      });
      
      // Queue all relationships for this row
      relationshipColumns.forEach(column => {
        const key = `${rowId}:${column.id}`;
        this.queueForResolution(key, column, rowData[column.id]);
      });
      
      // Process the queue
      await this.processPendingQueue();
    },
    
    queueForResolution(key: string, column: Column, value: any) {
      // Skip if already resolved or not needed
      if (this.resolutions.has(key)) {
        const existing = this.resolutions.get(key)!;
        if (existing.status === 'resolved' || existing.status === 'not_needed') {
          return;
        }
      }
      
      // Mark as pending
      this.resolutions.set(key, {
        status: 'pending',
        timestamp: Date.now()
      });
      
      // Add to queue
      this.pendingQueue.add(key);
    },
    
    async processPendingQueue(): Promise<void> {
      if (this.processingBatch || this.pendingQueue.size === 0) {
        return;
      }
      
      this.processingBatch = true;
      const batch = Array.from(this.pendingQueue);
      this.pendingQueue.clear();
      
      fileLog.debug(`⚡ Processing relationship batch`, {
        batchSize: batch.length
      });
      
      try {
        await Promise.all(batch.map(key => this.resolveRelationship(key)));
      } finally {
        this.processingBatch = false;
      }
    },
    
    async resolveRelationship(key: string): Promise<void> {
      const [rowId, columnId] = key.split(':');
      
      try {
        // Get the column and current value
        const columns = tableCore$.columns.get();
        const column = columns.find(c => c.id === columnId);
        
        if (!column) {
          throw new Error(`Column not found: ${columnId}`);
        }
        
        const processedRows = tableCore$.processedRows.get();
        const row = processedRows.find(r => r.id === rowId);
        
        if (!row) {
          throw new Error(`Row not found: ${rowId}`);
        }
        
        const value = row[column.id];
        
        // Handle null/undefined values
        if (value == null) {
          this.resolutions.set(key, {
            status: 'not_needed',
            timestamp: Date.now()
          });
          return;
        }
        
        // Resolve based on relationship type
        let resolved: any;
        
        if (column.cellType === 'relationship-single') {
          resolved = await this.resolveSingleRelationship(column, value);
        } else if (column.cellType === 'relationship-multi') {
          resolved = await this.resolveMultiRelationship(column, value);
        } else {
          throw new Error(`Unknown relationship type: ${column.cellType}`);
        }
        
        // Store resolved value
        this.resolutions.set(key, {
          status: 'resolved',
          value: resolved,
          timestamp: Date.now()
        });
        
        fileLog.debug(`✅ Resolved relationship`, {
          key,
          value,
          resolved
        });
        
      } catch (error) {
        this.resolutions.set(key, {
          status: 'error',
          error: (error as Error).message,
          timestamp: Date.now()
        });
        
        fileLog.error(`❌ Failed to resolve relationship`, {
          key,
          error: (error as Error).message
        });
      }
    },
    
    async resolveSingleRelationship(column: Column, value: any): Promise<string> {
      // Mock implementation - replace with actual relationship resolution
      // This would integrate with your existing relationship system
      await new Promise(resolve => setTimeout(resolve, 10)); // Simulate async
      return `Resolved: ${value}`;
    },
    
    async resolveMultiRelationship(column: Column, value: any): Promise<string[]> {
      // Mock implementation for multi relationships
      if (!Array.isArray(value)) {
        return [`Resolved: ${value}`];
      }
      
      await new Promise(resolve => setTimeout(resolve, 10)); // Simulate async
      return value.map(v => `Resolved: ${v}`);
    },
    
    isResolved(rowId: string, columnId: string): boolean {
      const key = `${rowId}:${columnId}`;
      const resolution = this.resolutions.get(key);
      return resolution?.status === 'resolved' || resolution?.status === 'not_needed';
    },
    
    getResolvedValue(rowId: string, columnId: string): any {
      const key = `${rowId}:${columnId}`;
      const resolution = this.resolutions.get(key);
      return resolution?.value;
    },
    
    clearResolutions() {
      this.resolutions.clear();
      this.pendingQueue.clear();
      fileLog.info(`🧹 Cleared all relationship resolutions`);
    }
  });
  
  return relationshipResolver$;
}
```

**Test Outcome**: Relationships resolve in batches with proper error handling

## Phase 5: Smart Cell Factory

### 5.1 Create Smart Cell Factory

**File**: `apps/worker/src/components/custom/vibegrid/factories/smart-cell-factory.ts`

```typescript
import { Column } from '../types';
import { getCellDependencies, checkCellReadiness } from '../utils/cell-readiness';
import { createLoadingCell, createErrorCell } from '../components/LoadingCell';
import { log } from '@/logger';

const fileLog = log('components/custom/vibegrid/factories/smart-cell-factory.ts');

export interface SmartCellContext {
  schemaLoaded: boolean;
  relationshipResolver: Map<string, any>;
  formattersReady: boolean;
  cellTypeManager: any;
  loadingStage: string;
}

export function createSmartCell(
  column: Column, 
  rowData: any, 
  context: SmartCellContext
): HTMLElement {
  try {
    const cellType = context.cellTypeManager.get(column.id, column);
    const dependencies = getCellDependencies(cellType, column);
    
    // Check if cell is ready to render
    const readiness = checkCellReadiness(column, rowData, dependencies, context);
    
    fileLog.debug(`🔍 Cell readiness check`, {
      columnId: column.id,
      cellType,
      isReady: readiness.isReady,
      missing: readiness.missingDependencies
    });
    
    // Return loading cell if dependencies aren't ready
    if (!readiness.isReady) {
      return createLoadingCell(cellType, column);
    }
    
    // All dependencies ready - render actual cell
    return createActualCell(cellType, column, rowData, context);
    
  } catch (error) {
    fileLog.error(`❌ Smart cell creation error`, {
      columnId: column.id,
      error: (error as Error).message
    });
    
    return createErrorCell(error as Error, column);
  }
}

function createActualCell(
  cellType: string, 
  column: Column, 
  rowData: any, 
  context: SmartCellContext
): HTMLElement {
  const cell = document.createElement('div');
  cell.className = `vibegrid-cell vibegrid-cell-${cellType}`;
  cell.dataset.rowId = rowData.id;
  cell.dataset.columnId = column.id;
  
  // Set basic cell styles
  cell.style.cssText = `
    flex: 0 0 ${column.width}px;
    height: 100%;
    padding: 0 12px;
    display: flex;
    align-items: center;
    font-size: 14px;
    border-right: 1px solid #f1f3f5;
    overflow: hidden;
    position: relative;
    cursor: default;
  `;
  
  // Render content based on cell type
  let content: HTMLElement;
  
  switch (cellType) {
    case 'relationship-single':
      content = createRelationshipSingleContent(column, rowData, context);
      break;
      
    case 'relationship-multi':
      content = createRelationshipMultiContent(column, rowData, context);
      break;
      
    case 'enum':
    case 'select':
      content = createEnumContent(column, rowData, context);
      break;
      
    case 'rollup_count':
    case 'rollup_sum':
    case 'rollup_average':
    case 'rollup_concat':
      content = createRollupContent(column, rowData, context);
      break;
      
    default:
      content = createDefaultContent(column, rowData, context);
      break;
  }
  
  cell.appendChild(content);
  return cell;
}

function createRelationshipSingleContent(
  column: Column, 
  rowData: any, 
  context: SmartCellContext
): HTMLElement {
  const resolvedValue = context.relationshipResolver.get(`${rowData.id}:${column.id}`);
  
  const container = document.createElement('div');
  container.style.cssText = `
    display: flex;
    align-items: center;
    width: 100%;
    padding: 4px 0;
  `;
  
  if (resolvedValue) {
    const badge = document.createElement('span');
    badge.className = 'inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 border-transparent bg-primary text-primary-foreground';
    badge.textContent = resolvedValue;
    container.appendChild(badge);
  } else {
    const placeholder = document.createElement('span');
    placeholder.className = 'text-muted-foreground text-xs italic';
    placeholder.textContent = column.placeholder || 'Select...';
    container.appendChild(placeholder);
  }
  
  return container;
}

function createRelationshipMultiContent(
  column: Column, 
  rowData: any, 
  context: SmartCellContext
): HTMLElement {
  const resolvedValues = context.relationshipResolver.get(`${rowData.id}:${column.id}`) || [];
  
  const container = document.createElement('div');
  container.style.cssText = `
    display: flex;
    align-items: center;
    gap: 4px;
    width: 100%;
    overflow: hidden;
    padding: 4px 0;
  `;
  
  if (resolvedValues.length === 0) {
    const placeholder = document.createElement('span');
    placeholder.className = 'text-muted-foreground text-xs italic';
    placeholder.textContent = column.placeholder || 'Click to add items';
    container.appendChild(placeholder);
  } else {
    // Show first few badges + count
    const maxDisplay = 2;
    const displayValues = resolvedValues.slice(0, maxDisplay);
    
    displayValues.forEach(value => {
      const badge = document.createElement('span');
      badge.className = 'inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 border-transparent bg-secondary text-secondary-foreground';
      badge.textContent = value;
      container.appendChild(badge);
    });
    
    if (resolvedValues.length > maxDisplay) {
      const remaining = resolvedValues.length - maxDisplay;
      const moreBadge = document.createElement('span');
      moreBadge.className = 'inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 text-foreground';
      moreBadge.textContent = `+${remaining}`;
      container.appendChild(moreBadge);
    }
  }
  
  return container;
}

function createEnumContent(
  column: Column, 
  rowData: any, 
  context: SmartCellContext
): HTMLElement {
  const value = rowData[column.id];
  
  const badge = document.createElement('span');
  badge.className = 'inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0';
  
  if (value) {
    badge.textContent = value;
    // Apply status-based styling if available
    const normalizedValue = value.toLowerCase().trim();
    if (['open', 'new', 'todo', 'pending'].includes(normalizedValue)) {
      badge.classList.add('bg-blue-100', 'text-blue-800', 'border-blue-200');
    } else if (['active', 'in-progress', 'working'].includes(normalizedValue.replace('-', '_'))) {
      badge.classList.add('bg-yellow-100', 'text-yellow-800', 'border-yellow-200');
    } else if (['completed', 'done', 'finished', 'closed'].includes(normalizedValue)) {
      badge.classList.add('bg-green-100', 'text-green-800', 'border-green-200');
    } else {
      badge.classList.add('bg-gray-100', 'text-gray-800', 'border-gray-200');
    }
  } else {
    badge.textContent = 'Not set';
    badge.classList.add('bg-gray-100', 'text-gray-500', 'border-gray-200');
  }
  
  return badge;
}

function createRollupContent(
  column: Column, 
  rowData: any, 
  context: SmartCellContext
): HTMLElement {
  const value = rowData[column.id];
  
  const container = document.createElement('div');
  container.style.cssText = `
    display: flex;
    align-items: center;
    gap: 4px;
    text-align: right;
    width: 100%;
  `;
  
  const valueSpan = document.createElement('span');
  valueSpan.className = 'font-mono text-sm';
  valueSpan.textContent = value?.toString() || '0';
  
  const indicator = document.createElement('span');
  indicator.className = 'text-xs text-muted-foreground';
  indicator.innerHTML = '📊'; // Calculation indicator
  indicator.title = `Calculated field: ${column.type}`;
  
  container.appendChild(valueSpan);
  container.appendChild(indicator);
  
  return container;
}

function createDefaultContent(
  column: Column, 
  rowData: any, 
  context: SmartCellContext
): HTMLElement {
  const value = rowData[column.id];
  
  const content = document.createElement('span');
  content.className = 'truncate';
  
  if (value == null || value === '') {
    content.className += ' text-muted-foreground text-xs italic';
    content.textContent = 'Click to edit';
  } else {
    content.textContent = String(value);
  }
  
  return content;
}
```

**Test Outcome**: Smart cells render only when ready with appropriate loading states

## Phase 6: Integration with SimplePassiveRenderer

### 6.1 Update SimplePassiveRenderer to Use Smart Cell Factory

**File**: `apps/worker/src/components/custom/vibegrid/renderers/core/SimplePassiveRenderer.ts`

**Update the `createCellElement` method around line 1230:**

```typescript
// Replace existing createCellElement method with:
private createCellElement(
  row: any, 
  column: any, 
  colIndex: number
): HTMLElement {
  // Create smart cell context
  const context: SmartCellContext = {
    schemaLoaded: !universeLoading$.get() && !!universeSchema$.get(),
    relationshipResolver: this.relationshipResolver$.resolutions,
    formattersReady: true, // Assume formatters are ready for now
    cellTypeManager: this.cellTypeManager$,
    loadingStage: this.dataLoadingStage$.stage.get()
  };
  
  // Use smart cell factory
  return createSmartCell(column, row, context);
}
```

**Add new properties to SimplePassiveRenderer constructor:**

```typescript
export class SimplePassiveRenderer {
  // Add these new properties
  private dataLoadingStage$: any;
  private cellTypeManager$: any;
  private relationshipResolver$: any;
  
  constructor(private options: SimplePassiveRendererOptions) {
    // ... existing code ...
    
    // Initialize new systems
    this.initializeSmartSystems();
    this.initDOM();
    this.initOverlays();
    this.setupObservers();
    this.setupScrollHandling();
  }
  
  private initializeSmartSystems(): void {
    // Initialize loading stages
    this.dataLoadingStage$ = createDataLoadingStage$(this.options.tableCore$.entityType);
    
    // Initialize cell type manager
    this.cellTypeManager$ = createCellTypeManager$(this.options.tableCore$.columns.get());
    
    // Initialize relationship resolver
    this.relationshipResolver$ = createRelationshipResolver$();
    
    fileLog.info('🎯 Smart cell systems initialized');
  }
}
```

**Test Outcome**: SimplePassiveRenderer uses smart cell factory for all cell rendering

### 6.2 Update Observable Setup to Use Staged Loading

**Add to SimplePassiveRenderer `setupObservers` method:**

```typescript
// Add this observer to the existing setupObservers method
const stageDisposer = observe(() => {
  const stage = this.dataLoadingStage$.stage.get();
  const isReady = this.dataLoadingStage$.isReady.get();
  
  fileLog.info('📊 Data loading stage changed', { stage, isReady });
  
  if (stage === 'ready' && isReady) {
    // All data is ready - trigger full re-render
    this.renderHeader();
    this.renderBody();
  }
});
this.disposers.push(stageDisposer);

// Update columns observer to invalidate cell types
const columnsDisposer = observe(() => {
  const columns = this.tableCore$.columns.get();
  
  // Invalidate cell type cache when columns change
  this.cellTypeManager$.invalidateCache();
  
  fileLog.info('📊 Columns changed', { count: columns.length });
  
  // Start the loading pipeline
  this.dataLoadingStage$.reset();
  this.dataLoadingStage$.advanceToStage('schema');
});
```

**Test Outcome**: Renderer waits for staged loading completion before rendering

## Phase 7: Testing Framework

### 7.1 Create Test Suite

**File**: `apps/worker/src/components/custom/vibegrid/tests/cell-rendering-robustness.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDataLoadingStage$ } from '../stores/data-loading-stages';
import { createCellTypeManager$ } from '../stores/cell-type-manager';
import { createRelationshipResolver$ } from '../stores/relationship-resolver';
import { createSmartCell } from '../factories/smart-cell-factory';

describe('Cell Rendering Robustness', () => {
  let mockColumn: any;
  let mockRowData: any;
  let dataLoadingStage$: any;
  let cellTypeManager$: any;
  let relationshipResolver$: any;
  
  beforeEach(() => {
    mockColumn = {
      id: 'test_field',
      label: 'Test Field', 
      type: 'text',
      width: 150
    };
    
    mockRowData = {
      id: 'row_1',
      test_field: 'test value'
    };
    
    dataLoadingStage$ = createDataLoadingStage$('TestEntity');
    cellTypeManager$ = createCellTypeManager$([mockColumn]);
    relationshipResolver$ = createRelationshipResolver$();
  });
  
  afterEach(() => {
    // Cleanup
  });
  
  describe('Loading Stages', () => {
    it('should progress through loading stages correctly', async () => {
      expect(dataLoadingStage$.stage.get()).toBe('idle');
      
      await dataLoadingStage$.advanceToStage('schema');
      expect(dataLoadingStage$.stage.get()).toBe('schema');
      expect(dataLoadingStage$.context.completedStages.has('idle')).toBe(true);
      
      await dataLoadingStage$.advanceToStage('data');
      expect(dataLoadingStage$.stage.get()).toBe('data');
      expect(dataLoadingStage$.canLoadRelationships).toBe(true);
    });
    
    it('should handle loading errors correctly', async () => {
      // Mock an error in schema loading
      const originalLoadSchema = dataLoadingStage$.loadSchema;
      dataLoadingStage$.loadSchema = async () => {
        throw new Error('Schema loading failed');
      };
      
      await dataLoadingStage$.advanceToStage('schema');
      
      expect(dataLoadingStage$.stage.get()).toBe('error');
      expect(dataLoadingStage$.hasError.get()).toBe(true);
      expect(dataLoadingStage$.context.errors).toHaveLength(1);
      
      // Restore original method
      dataLoadingStage$.loadSchema = originalLoadSchema;
    });
  });
  
  describe('Cell Type Resolution', () => {
    it('should resolve cell types consistently', () => {
      const cellType1 = cellTypeManager$.get('test_field', mockColumn);
      const cellType2 = cellTypeManager$.get('test_field', mockColumn);
      
      expect(cellType1).toBe('text');
      expect(cellType2).toBe('text');
      expect(cellType1).toBe(cellType2);
    });
    
    it('should prioritize fieldSchema displayType', () => {
      const columnWithSchema = {
        ...mockColumn,
        fieldSchema: { displayType: 'custom_type' },
        cellType: 'other_type',
        type: 'base_type'
      };
      
      const cellType = cellTypeManager$.get('test_field', columnWithSchema);
      expect(cellType).toBe('custom_type');
    });
    
    it('should invalidate cache correctly', () => {
      const cellType1 = cellTypeManager$.get('test_field', mockColumn);
      
      cellTypeManager$.invalidateCache();
      
      // Update column
      mockColumn.cellType = 'updated_type';
      const cellType2 = cellTypeManager$.get('test_field', mockColumn);
      
      expect(cellType1).toBe('text');
      expect(cellType2).toBe('updated_type');
    });
  });
  
  describe('Relationship Resolution', () => {
    it('should queue and resolve relationships', async () => {
      const relationshipColumn = {
        ...mockColumn,
        cellType: 'relationship-single'
      };
      
      const rowDataWithRelationship = {
        ...mockRowData,
        test_field: 'user_123'
      };
      
      await relationshipResolver$.resolveForRow('row_1', [relationshipColumn], rowDataWithRelationship);
      
      expect(relationshipResolver$.isResolved('row_1', 'test_field')).toBe(true);
      
      const resolved = relationshipResolver$.getResolvedValue('row_1', 'test_field');
      expect(resolved).toBe('Resolved: user_123');
    });
    
    it('should handle null relationship values', async () => {
      const relationshipColumn = {
        ...mockColumn,
        cellType: 'relationship-single'
      };
      
      const rowDataWithNull = {
        ...mockRowData,
        test_field: null
      };
      
      await relationshipResolver$.resolveForRow('row_1', [relationshipColumn], rowDataWithNull);
      
      const key = 'row_1:test_field';
      const resolution = relationshipResolver$.resolutions.get(key);
      
      expect(resolution?.status).toBe('not_needed');
    });
  });
  
  describe('Smart Cell Factory', () => {
    it('should render loading cell when dependencies not ready', () => {
      const context = {
        schemaLoaded: false,
        relationshipResolver: new Map(),
        formattersReady: true,
        cellTypeManager: cellTypeManager$,
        loadingStage: 'schema'
      };
      
      const cell = createSmartCell(mockColumn, mockRowData, context);
      
      expect(cell.className).toContain('vibegrid-cell-loading');
      expect(cell.innerHTML).toContain('loading-spinner');
    });
    
    it('should render actual cell when all dependencies ready', () => {
      const context = {
        schemaLoaded: true,
        relationshipResolver: new Map(),
        formattersReady: true,
        cellTypeManager: cellTypeManager$,
        loadingStage: 'ready'
      };
      
      const cell = createSmartCell(mockColumn, mockRowData, context);
      
      expect(cell.className).toContain('vibegrid-cell-text');
      expect(cell.textContent).toContain('test value');
    });
    
    it('should render error cell when exception occurs', () => {
      const brokenColumn = {
        ...mockColumn,
        cellType: undefined,
        type: undefined
      };
      
      const context = {
        schemaLoaded: true,
        relationshipResolver: new Map(),
        formattersReady: true,
        cellTypeManager: {
          get: () => {
            throw new Error('Cell type determination failed');
          }
        },
        loadingStage: 'ready'
      };
      
      const cell = createSmartCell(brokenColumn, mockRowData, context);
      
      expect(cell.className).toContain('vibegrid-cell-error');
      expect(cell.title).toContain('Error in Test Field');
    });
  });
  
  describe('Relationship Cell Content', () => {
    it('should render single relationship correctly', () => {
      const relationshipColumn = {
        ...mockColumn,
        cellType: 'relationship-single'
      };
      
      const resolverMap = new Map();
      resolverMap.set('row_1:test_field', 'John Doe');
      
      const context = {
        schemaLoaded: true,
        relationshipResolver: resolverMap,
        formattersReady: true,
        cellTypeManager: cellTypeManager$,
        loadingStage: 'ready'
      };
      
      const cell = createSmartCell(relationshipColumn, mockRowData, context);
      
      expect(cell.textContent).toContain('John Doe');
      expect(cell.querySelector('.bg-primary')).toBeTruthy();
    });
    
    it('should render multi relationship with badges', () => {
      const relationshipColumn = {
        ...mockColumn,
        cellType: 'relationship-multi'
      };
      
      const resolverMap = new Map();
      resolverMap.set('row_1:test_field', ['User 1', 'User 2', 'User 3']);
      
      const context = {
        schemaLoaded: true,
        relationshipResolver: resolverMap,
        formattersReady: true,
        cellTypeManager: cellTypeManager$,
        loadingStage: 'ready'
      };
      
      const cell = createSmartCell(relationshipColumn, mockRowData, context);
      
      const badges = cell.querySelectorAll('.bg-secondary');
      expect(badges).toHaveLength(2); // First 2 items
      
      const moreBadge = cell.querySelector('[class*="text-foreground"]');
      expect(moreBadge?.textContent).toBe('+1'); // Remaining count
    });
  });
});
```

### 7.2 Create Manual Test Cases

**File**: `apps/worker/src/components/custom/vibegrid/tests/manual-test-cases.md`

```markdown
# Manual Test Cases for Cell Rendering Robustness

## Test Case 1: Loading State Visibility

**Objective**: Verify loading states are visible during data loading

**Steps**:
1. Navigate to a large table (>100 rows)
2. Clear browser cache and refresh page
3. Observe cell rendering during initial load

**Expected Results**:
- Loading spinners appear in cells during data loading
- No flickering between different cell states
- Loading indicators disappear when data is fully loaded
- All cells render with correct final content

**Pass Criteria**: 
✅ Loading states visible for <2 seconds
✅ No visual flashing or inconsistent content
✅ All cells render correctly when loading completes

## Test Case 2: Relationship Field Consistency

**Objective**: Ensure relationship fields render consistently

**Steps**:
1. Navigate to Tasks table with assignee relationships
2. Refresh page multiple times
3. Observe assignee field rendering

**Expected Results**:
- Assignee fields show loading state initially  
- All assignee fields resolve to display names (not IDs)
- No fields get "stuck" showing IDs instead of names
- Hover tooltips work correctly

**Pass Criteria**:
✅ All relationship fields show resolved names
✅ No fields display raw IDs after loading completes
✅ Consistent rendering across page refreshes

## Test Case 3: Network Delay Simulation

**Objective**: Test behavior under slow network conditions

**Steps**:
1. Open browser dev tools → Network tab
2. Set throttling to "Slow 3G"
3. Navigate to large table
4. Observe loading behavior

**Expected Results**:
- Loading states remain visible during slow loading
- No timeout errors or broken cells
- Progress is visually apparent to user
- Final result is consistent regardless of loading speed

**Pass Criteria**:
✅ Loading states persist throughout slow loading
✅ No broken or error cells appear
✅ Final rendering is identical to fast loading

## Test Case 4: Error Recovery

**Objective**: Test graceful handling of loading errors

**Steps**:
1. Disable network connection temporarily
2. Navigate to table page
3. Re-enable network after 10 seconds
4. Observe recovery behavior

**Expected Results**:
- Error states appear in place of loading states
- Error states are visually distinct and informative
- Cells recover and render correctly when network restored
- No permanent broken state

**Pass Criteria**:
✅ Clear error indicators during network outage
✅ Automatic recovery when network restored
✅ No cells left in broken state

## Test Case 5: Mixed Cell Type Consistency

**Objective**: Verify different cell types load consistently

**Steps**:
1. Navigate to table with multiple column types (text, enum, relationship, rollup)
2. Refresh page and observe loading sequence
3. Note any inconsistencies between different cell types

**Expected Results**:
- All cell types respect the loading pipeline
- No cell type renders before its dependencies are ready
- Consistent visual loading states across different types
- All cells complete loading within reasonable time

**Pass Criteria**:
✅ All cell types wait for dependencies
✅ Consistent loading behavior across types
✅ Complete loading within 5 seconds on normal connection
```

## Implementation Timeline

### Week 1: Foundation (Phases 1-2)
- **Day 1-2**: Cell dependency interface and readiness checker
- **Day 3-4**: Loading cell components and error boundaries
- **Day 5**: Staged observable loading system

**Deliverable**: Basic loading states work for all cell types

### Week 2: Core Systems (Phases 3-4)  
- **Day 1-2**: Cell type resolution system
- **Day 3-5**: Relationship resolution pipeline with batching

**Deliverable**: Consistent cell type resolution and relationship loading

### Week 3: Integration (Phases 5-6)
- **Day 1-3**: Smart cell factory implementation
- **Day 4-5**: SimplePassiveRenderer integration

**Deliverable**: Complete end-to-end smart cell rendering

### Week 4: Testing and Refinement (Phase 7)
- **Day 1-2**: Automated test suite  
- **Day 3-4**: Manual testing and bug fixes
- **Day 5**: Performance optimization and documentation

**Deliverable**: Production-ready robust cell rendering system

## Success Metrics

### Performance Targets
- **Initial Load Time**: <2 seconds for 100 rows
- **Cell Render Time**: <50ms per cell when dependencies ready
- **Memory Usage**: <10MB additional overhead
- **Cache Hit Rate**: >90% for repeated cell renders

### Quality Targets  
- **Loading State Coverage**: 100% of cell types show loading states
- **Error Recovery Rate**: 100% of cells recover from network errors
- **Consistency Score**: 0% visual flashing during normal loading
- **Test Coverage**: >95% code coverage for cell rendering logic

### User Experience Targets
- **Perceived Performance**: Loading feels intentional, not broken
- **Visual Stability**: No content jumping or flickering
- **Error Clarity**: Clear, actionable error messages
- **Responsive Feel**: UI remains interactive during loading

## Rollback Plan

If implementation causes regressions:

1. **Immediate**: Feature flag to disable smart cell factory
2. **Short-term**: Revert to existing cell rendering with hotfixes
3. **Medium-term**: Selective rollout by cell type
4. **Long-term**: Address issues and re-enable gradually

## Post-Implementation Monitoring

1. **Error Rate**: Monitor cell rendering errors in production
2. **Performance**: Track loading times and memory usage  
3. **User Feedback**: Collect feedback on loading experience
4. **A/B Testing**: Compare old vs new rendering performance

This plan provides a systematic approach to implementing robust cell rendering while maintaining system stability and user experience.