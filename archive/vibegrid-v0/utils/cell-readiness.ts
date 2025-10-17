/**
 * Cell Readiness Checker
 * 
 * Determines when cells are ready to render by checking all dependencies
 * Prevents premature rendering that causes visual inconsistencies
 */

import { Column } from '../types';
import { 
  CellRenderDependencies, 
  CellReadinessStatus, 
  DependencyContext,
  CELL_TYPE_DEPENDENCIES,
  DependencyError
} from '../types/cell-dependencies';
import { log } from '@/logger';

const fileLog = log('components/custom/vibegrid/utils/cell-readiness.ts');

/**
 * Get the dependency requirements for a specific cell type and column
 */
export function getCellDependencies(cellType: string, column: Column): CellRenderDependencies {
  // Start with base dependencies for this cell type
  const baseDeps = CELL_TYPE_DEPENDENCIES[cellType] || CELL_TYPE_DEPENDENCIES['text'];
  
  const deps: CellRenderDependencies = {
    schema: baseDeps.schema || false,
    data: baseDeps.data || false,
    relationships: [...(baseDeps.relationships || [])],
    computed: [...(baseDeps.computed || [])],
    formatting: baseDeps.formatting || false
  };

  // Add dynamic dependencies based on column configuration
  switch (cellType) {
    case 'relationship-single':
    case 'relationship-multi':
      // Relationship cells need the specific relationship resolved
      deps.relationships.push(column.id);
      break;
      
    case 'rollup_count':
    case 'rollup_sum':
    case 'rollup_average':
    case 'rollup_concat':
      // Rollup cells need computed values and may need relationship data
      deps.computed.push(column.id);
      
      // If rollup depends on relationships, add those too
      if (column.rollupConfig?.relationshipType) {
        deps.relationships.push(column.rollupConfig.relationshipType);
      }
      break;
      
    case 'computed_expression':
    case 'computed_formula':
      // Computed fields need their calculated value
      deps.computed.push(column.id);
      
      // Add any field dependencies from the expression
      if (column.dependencies && Array.isArray(column.dependencies)) {
        column.dependencies.forEach(dep => {
          // Check if dependency is a relationship field
          if (isRelationshipField(dep, column)) {
            deps.relationships.push(dep);
          } else {
            deps.computed.push(dep);
          }
        });
      }
      break;
      
    default:
      // No additional dependencies for basic cell types
      break;
  }
  
  fileLog.debug('📋 Cell dependencies determined', {
    columnId: column.id,
    cellType,
    dependencies: deps
  });
  
  return deps;
}

/**
 * Check if all dependencies for a cell are satisfied
 */
export function checkCellReadiness(
  column: Column, 
  rowData: any, 
  deps: CellRenderDependencies,
  context: DependencyContext
): CellReadinessStatus {
  const missing: string[] = [];
  const errors: DependencyError[] = [];
  const statusContext: any = {};

  // Check schema dependency
  if (deps.schema && !context.schemaLoaded) {
    missing.push('schema');
    statusContext.schemaStatus = 'loading';
  } else if (deps.schema) {
    statusContext.schemaStatus = 'ready';
  }
  
  // Check data dependency
  if (deps.data && (!rowData || rowData.id === undefined)) {
    missing.push('data');
    errors.push({
      type: 'data',
      message: `Row data not available for column ${column.id}`,
      retryable: true
    });
  }
  
  // Check formatting dependency
  if (deps.formatting && !context.formattersReady) {
    missing.push('formatting');
    statusContext.formatterStatus = 'loading';
  } else if (deps.formatting) {
    statusContext.formatterStatus = 'ready';
  }
  
  // Check relationship dependencies
  statusContext.relationshipStatus = 'ready';
  for (const relationshipField of deps.relationships) {
    const key = `${rowData?.id}:${relationshipField}`;
    
    if (!context.relationshipResolver.has(key)) {
      missing.push(`relationship:${relationshipField}`);
      statusContext.relationshipStatus = 'pending';
    } else {
      const resolution = context.relationshipResolver.get(key);
      if (resolution?.status === 'error') {
        missing.push(`relationship:${relationshipField}`);
        statusContext.relationshipStatus = 'error';
        errors.push({
          type: 'relationship',
          message: `Failed to resolve relationship ${relationshipField}: ${resolution.error}`,
          details: { key, resolution },
          retryable: true
        });
      } else if (resolution?.status === 'pending') {
        missing.push(`relationship:${relationshipField}`);
        statusContext.relationshipStatus = 'resolving';
      }
    }
  }
  
  // Check computed dependencies
  for (const computedField of deps.computed) {
    if (rowData && (rowData[computedField] === undefined || rowData[computedField] === null)) {
      // Allow zero as a valid computed value
      if (rowData[computedField] !== 0) {
        missing.push(`computed:${computedField}`);
        errors.push({
          type: 'computed',
          message: `Computed value not available for field ${computedField}`,
          details: { field: computedField, value: rowData[computedField] },
          retryable: true
        });
      }
    }
  }
  
  const isReady = missing.length === 0;
  
  // Log readiness status for debugging
  if (!isReady) {
    fileLog.debug('⏳ Cell not ready', {
      columnId: column.id,
      cellType: getCellTypeFromColumn(column),
      missing,
      errorCount: errors.length,
      loadingStage: context.loadingStage
    });
  } else {
    fileLog.debug('✅ Cell ready to render', {
      columnId: column.id,
      cellType: getCellTypeFromColumn(column),
      loadingStage: context.loadingStage
    });
  }
  
  return {
    isReady,
    missingDependencies: missing,
    lastChecked: Date.now(),
    context: statusContext
  };
}

/**
 * Check readiness for multiple cells at once (batch operation)
 */
export function checkBatchCellReadiness(
  columns: Column[],
  rowData: any,
  context: DependencyContext
): Map<string, CellReadinessStatus> {
  const results = new Map<string, CellReadinessStatus>();
  
  for (const column of columns) {
    const cellType = getCellTypeFromColumn(column);
    const deps = getCellDependencies(cellType, column);
    const status = checkCellReadiness(column, rowData, deps, context);
    
    results.set(column.id, status);
  }
  
  return results;
}

/**
 * Get a summary of readiness status for debugging
 */
export function getReadinessSummary(
  readinessMap: Map<string, CellReadinessStatus>
): {
  totalCells: number;
  readyCells: number;
  notReadyCells: number;
  mostCommonMissing: string[];
} {
  const total = readinessMap.size;
  let ready = 0;
  const missingCounter = new Map<string, number>();
  
  for (const [columnId, status] of readinessMap) {
    if (status.isReady) {
      ready++;
    } else {
      // Count missing dependencies
      for (const missing of status.missingDependencies) {
        missingCounter.set(missing, (missingCounter.get(missing) || 0) + 1);
      }
    }
  }
  
  // Get most common missing dependencies
  const sortedMissing = Array.from(missingCounter.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([dep, count]) => `${dep}(${count})`);
  
  return {
    totalCells: total,
    readyCells: ready,
    notReadyCells: total - ready,
    mostCommonMissing: sortedMissing
  };
}

/**
 * Create a dependency context from current observable states
 */
export function createDependencyContext(
  schemaLoaded: boolean,
  relationshipResolver: Map<string, any>,
  formattersReady: boolean,
  loadingStage: string,
  existingErrors: DependencyError[] = []
): DependencyContext {
  return {
    schemaLoaded,
    relationshipResolver,
    formattersReady,
    loadingStage,
    errors: [...existingErrors],
    contextCreated: Date.now()
  };
}

/**
 * Helper function to determine cell type from column
 */
function getCellTypeFromColumn(column: Column): string {
  // This should match the logic in cell-type-manager.ts
  if (column.fieldSchema?.displayType) {
    return column.fieldSchema.displayType;
  }
  
  if (column.cellType) {
    return column.cellType;
  }
  
  if (column.type) {
    return column.type;
  }
  
  return 'text';
}

/**
 * Check if a field dependency is a relationship field
 */
function isRelationshipField(fieldName: string, column: Column): boolean {
  // This is a heuristic - in a real implementation, you'd check the schema
  // to determine if a field is a relationship field
  
  // Check common relationship field patterns
  if (fieldName.endsWith('_id') || fieldName.includes('relationship')) {
    return true;
  }
  
  // Check if the field is configured as a relationship in the column
  if (column.relationships && column.relationships[fieldName]) {
    return true;
  }
  
  return false;
}

/**
 * Utility to wait for specific dependencies to be ready
 */
export async function waitForDependencies(
  column: Column,
  rowData: any,
  context: DependencyContext,
  options: {
    maxWaitMs?: number;
    checkIntervalMs?: number;
    onProgress?: (status: CellReadinessStatus) => void;
  } = {}
): Promise<CellReadinessStatus> {
  const {
    maxWaitMs = 5000,
    checkIntervalMs = 100,
    onProgress
  } = options;
  
  const cellType = getCellTypeFromColumn(column);
  const deps = getCellDependencies(cellType, column);
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitMs) {
    const status = checkCellReadiness(column, rowData, deps, context);
    
    if (onProgress) {
      onProgress(status);
    }
    
    if (status.isReady) {
      return status;
    }
    
    // Wait before checking again
    await new Promise(resolve => setTimeout(resolve, checkIntervalMs));
  }
  
  // Timeout - return final status
  const finalStatus = checkCellReadiness(column, rowData, deps, context);
  
  fileLog.warn('⏰ Dependency wait timeout', {
    columnId: column.id,
    cellType,
    finalStatus,
    waitTimeMs: Date.now() - startTime
  });
  
  return finalStatus;
}