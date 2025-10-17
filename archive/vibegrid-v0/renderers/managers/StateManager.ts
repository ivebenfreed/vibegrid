// ====================================
// RENDERER STATE MANAGER
// ====================================

import type { 
  RenderState, 
  Column, 
  SortConfig, 
  TableRow,
  RendererOptions 
} from '../../types';
import type { ColumnManager } from './ColumnManager';
// ColumnDimensionManager removed - use coordinateMapping instead
import type { DOMSystem } from '../systems/DOMSystem';
import type { VirtualScrollManager } from './VirtualScrollManager';
import type { SelectionManager } from './SelectionManager';
import type { HeaderEngine } from '../engines/HeaderEngine';
import type { RowEngine } from '../engines/RowEngine';
import type { PerformanceMonitor } from './PerformanceMonitor';
import type { RenderOrchestrator } from './RenderOrchestrator';
import { log } from '@/logger';
const fileLog = log('components/custom/vibegrid/renderers/managers/StateManager.ts');

// ====================================
// TYPES
// ====================================

export interface StateManagerConfig {
  virtualGrid: VirtualScrollManager;
  selectionManager: SelectionManager;
  headerRenderer: HeaderEngine;
  rowRenderingEngine: RowEngine;
  performanceMonitor: PerformanceMonitor;
  renderOrchestrator: RenderOrchestrator;
  domManager: DOMSystem;
  options: RendererOptions;
}

export interface BatchUpdate {
  cellKey: string;
  rowId: string;
  columnId: string;
  value: any;
}

// ====================================
// RENDERER STATE MANAGER
// ====================================

/**
 * Manages renderer state, configuration, and batch updates
 * Handles initialization, sorting, and state synchronization
 */
export class StateManager {
  private config: StateManagerConfig;
  private lastRenderState: RenderState | null = null;
  // Dimension manager removed - use coordinateMapping instead
  private canvasInitialized = false;
  
  // Batch update management
  private updateQueue = new Set<string>();
  private batchTimeoutId = 0;
  
  constructor(config: StateManagerConfig) {
    this.config = config;
    // Dimension manager removed - comes from coordinateMapping
  }
  
  // ====================================
  // INITIALIZATION
  // ====================================
  
  /**
   * Initialize renderer with complete configuration - single render
   */
  initialize(state: RenderState): void {
    try {
      // Set all configuration at once without triggering updates
      // Column information now comes from state machine coordinate mapping
      // No need to update ColumnManager as it's now passive
      
      // Update virtual grid with row count first
      this.config.virtualGrid.setRowCount(state.rows.length);
      
      // NOTE: Coordinate manager updates removed - now handled by coordinate actor
      // The TableMachine receives coordinate mappings from the coordinate actor
      // and provides them to the renderer via render state. This eliminates
      // the "hackery" of direct method calls and follows proper XState patterns.
      
      // Direct render without column reconfiguration
      this.renderDirectly(state);
    } catch (error) {
      fileLog.error('[StateManager] Initialize error:', error);
    }
  }
  
  /**
   * Initialize canvas overlay post-render (non-blocking)
   */
  initializeCanvasPostRender(): void {
    const canvasContainer = this.config.domManager.getElement('canvasContainer');
    if (canvasContainer && this.config.options.onStateChange && !this.canvasInitialized) {
      fileLog.info('🔧 StateManager: Emitting canvas.container.ready event post-render');
      this.config.options.onStateChange({
        type: 'canvas.container.ready',
        container: canvasContainer
      });
      this.canvasInitialized = true;
    }
  }
  
  // ====================================
  // CONFIGURATION
  // ====================================
  
  /**
   * Set or update columns - DEPRECATED: Now handled by state machine coordinate mapping
   */
  setColumns(columns: Column[]): void {
    fileLog.warn('StateManager: setColumns is deprecated - column data comes from state machine coordinate mapping');
    // Column information now comes from state machine coordinate mapping
  }
  
  /**
   * Set or update column visibility - DEPRECATED: Now handled by state machine coordinate mapping
   */
  setColumnVisibility(visibility: Record<string, boolean>): void {
    fileLog.warn('StateManager: setColumnVisibility is deprecated - column visibility comes from state machine coordinate mapping');
    // Column visibility changes should go through state machine
  }
  
  /**
   * Set column order - DEPRECATED: Now handled by state machine coordinate mapping  
   */
  setColumnOrder(order: string[]): void {
    fileLog.warn('StateManager: setColumnOrder is deprecated - column order comes from state machine coordinate mapping');
    // Column order changes should go through state machine
  }
  
  /**
   * Set dimension manager (called by parent component)
   */
  // Dimension manager removed - use coordinateMapping from state machine
  
  // ====================================
  // STATE MANAGEMENT
  // ====================================
  
  /**
   * Get the last render state
   */
  getLastRenderState(): RenderState | null {
    return this.lastRenderState;
  }
  
  /**
   * Set the last render state
   */
  setLastRenderState(state: RenderState): void {
    this.lastRenderState = state;
  }
  
  /**
   * Set coordinate mapping from state machine (AUTHORITATIVE SOURCE)
   */
  setCoordinateMapping(coordinateMapping: any, version: number): void {
    if (this.lastRenderState) {
      this.lastRenderState = {
        ...this.lastRenderState,
        coordinateMapping,
        version
      };
    }
    fileLog.info('StateManager: Updated coordinate mapping from state machine:', {
      version,
      columnCount: coordinateMapping.columns.length
    });
  }
  
  /**
   * Direct render without column configuration updates
   */
  private renderDirectly(state: RenderState): void {
    this.lastRenderState = state;
    
    try {
      // Delegate to render orchestrator
      this.config.renderOrchestrator.render(state);
    } catch (error) {
      fileLog.error('[StateManager] Render error:', error);
    }
  }
  
  /**
   * Update header dimensions without full re-render
   */
  private updateHeaderDimensions(): void {
    if (this.lastRenderState?.coordinateMapping?.columns?.length > 0) {
      const coordinateColumns = this.lastRenderState.coordinateMapping.columns;
      const totalWidth = coordinateColumns.reduce((sum: number, col: any) => sum + col.width, 0);
      const header = this.config.domManager.getElement('header');
      header.style.width = `${totalWidth}px`;
      
      // Update dimension manager with visible columns
      if (this.dimensionManager) {
        const columns = coordinateColumns.map((coord: any) => ({
          id: coord.columnId,
          name: coord.columnId,
          field: coord.columnId,
          type: 'text' as const,
          width: coord.width
        }));
        this.dimensionManager.setColumns(columns);
      }
      
      // Re-render header content to show/hide columns
      if (this.lastRenderState) {
        this.config.headerRenderer.renderHeader(this.lastRenderState);
        // Also re-render visible rows to update cell positions
        this.config.rowRenderingEngine.renderVisibleRows(this.lastRenderState);
      }
    }
  }
  
  // ====================================
  // SORTING
  // ====================================
  
  /**
   * Apply sorting to rows
   */
  applySorting(rows: TableRow[], sortBy: SortConfig[]): TableRow[] {
    if (sortBy.length === 0) return rows;
    
    return [...rows].sort((a, b) => {
      for (const sort of sortBy) {
        const aValue = a.data[sort.field];
        const bValue = b.data[sort.field];
        
        if (aValue === bValue) continue;
        
        let comparison = 0;
        
        if (aValue == null && bValue == null) {
          comparison = 0;
        } else if (aValue == null) {
          comparison = 1; // null values go to the end
        } else if (bValue == null) {
          comparison = -1;
        } else if (typeof aValue === 'number' && typeof bValue === 'number') {
          comparison = aValue - bValue;
        } else if (aValue instanceof Date && bValue instanceof Date) {
          comparison = aValue.getTime() - bValue.getTime();
        } else {
          comparison = String(aValue).localeCompare(String(bValue));
        }
        
        return sort.direction === 'desc' ? -comparison : comparison;
      }
      
      return 0;
    });
  }
  
  // ====================================
  // BATCH UPDATES
  // ====================================
  
  /**
   * Queue a cell update for batch processing
   */
  queueCellUpdate(rowId: string, columnId: string, value: any): void {
    const cellKey = `${rowId}:${columnId}`;
    this.updateQueue.add(cellKey);
    
    // Batch updates for performance
    if (this.batchTimeoutId) {
      clearTimeout(this.batchTimeoutId);
    }
    
    this.batchTimeoutId = window.setTimeout(() => {
      this.processBatchUpdates();
    }, 0);
  }
  
  /**
   * Process all queued batch updates
   */
  private processBatchUpdates(): void {
    const startTime = performance.now();
    const updateCount = this.updateQueue.size;
    
    this.updateQueue.forEach(cellKey => {
      const [rowId, columnId] = cellKey.split(':');
      const element = this.getCellElement(rowId, columnId);
      
      if (element) {
        // Update cell content - would get actual value from state
        element.classList.add('vibegridx-updated');
        
        // Remove update indicator after animation
        setTimeout(() => {
          element.classList.remove('vibegridx-updated');
        }, 300);
      }
    });
    
    this.updateQueue.clear();
    this.batchTimeoutId = 0;
    
    const duration = performance.now() - startTime;
    this.config.performanceMonitor.trackBatchUpdate(updateCount, duration);
  }
  
  /**
   * Get a cell element by row and column ID
   */
  private getCellElement(rowId: string, columnId: string): HTMLElement | null {
    return this.config.domManager.getElement('body').querySelector(
      `[data-row-id="${rowId}"][data-column-id="${columnId}"]`
    ) as HTMLElement;
  }
  
  /**
   * Clear the update queue
   */
  clearUpdateQueue(): void {
    this.updateQueue.clear();
    if (this.batchTimeoutId) {
      clearTimeout(this.batchTimeoutId);
      this.batchTimeoutId = 0;
    }
  }
  
  /**
   * Get update queue size
   */
  getUpdateQueueSize(): number {
    return this.updateQueue.size;
  }
  
  // ====================================
  // CLEANUP
  // ====================================
  
  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.clearUpdateQueue();
    this.lastRenderState = null;
    this.dimensionManager = null;
  }
}