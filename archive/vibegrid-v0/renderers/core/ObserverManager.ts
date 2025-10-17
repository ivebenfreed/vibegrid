/**
 * ObserverManager - Centralized management of Legend State observers for VibeGrid
 * Handles all reactive state subscriptions and lifecycle management
 */

import { observe } from '@legendapp/state';
import { log } from '@/logger';
import type { 
  TableCore$, 
  TableInteraction$, 
  TableViewport$ 
} from '../../stores/pure-observables';
import type { ViewportInfo } from '../../types';
import type { OverlayManager } from '../modules/OverlayManager';

const fileLog = log('components/custom/vibegrid/renderers/core/ObserverManager.ts');

const ROW_HEIGHT = 40;

export interface ObserverManagerOptions {
  tableCore$: TableCore$;
  tableInteraction$: TableInteraction$;
  tableViewport$: TableViewport$;
  overlayManager?: OverlayManager;
  
  // Callback functions for renderer actions
  onColumnsChanged: () => void;
  onColumnVisibilityChanged: () => void;
  onRowsChanged: () => void;
  onViewportChanged: () => void;
  onSelectionChanged: (selectedCells: Set<string>) => void;
  onEditingChanged: (editingCell: string | null, editValue?: string) => void;
  onSelectAllCheckboxChanged: (state: { checked: boolean; indeterminate: boolean }) => void;
  onSortChanged: () => void;
  onDragChanged: () => void;
  
  // Column resize handlers
  updateHeaderCellWidth: (columnId: string, newWidth: number) => void;
  updateBodyCellWidths: (columnId: string, newWidth: number) => void;
}

export class ObserverManager {
  private tableCore$: TableCore$;
  private tableInteraction$: TableInteraction$;
  private tableViewport$: TableViewport$;
  private overlayManager?: OverlayManager;
  
  private disposers: (() => void)[] = [];
  
  // Callback functions
  private onColumnsChanged: () => void;
  private onColumnVisibilityChanged: () => void;
  private onRowsChanged: () => void;
  private onViewportChanged: () => void;
  private onSelectionChanged: (selectedCells: Set<string>) => void;
  private onEditingChanged: (editingCell: string | null, editValue?: string) => void;
  private onSelectAllCheckboxChanged: (state: { checked: boolean; indeterminate: boolean }) => void;
  private onSortChanged: () => void;
  private onDragChanged: () => void;
  private updateHeaderCellWidth: (columnId: string, newWidth: number) => void;
  private updateBodyCellWidths: (columnId: string, newWidth: number) => void;

  constructor(options: ObserverManagerOptions) {
    this.tableCore$ = options.tableCore$;
    this.tableInteraction$ = options.tableInteraction$;
    this.tableViewport$ = options.tableViewport$;
    this.overlayManager = options.overlayManager;
    
    // Store callback functions
    this.onColumnsChanged = options.onColumnsChanged;
    this.onColumnVisibilityChanged = options.onColumnVisibilityChanged;
    this.onRowsChanged = options.onRowsChanged;
    this.onViewportChanged = options.onViewportChanged;
    this.onSelectionChanged = options.onSelectionChanged;
    this.onEditingChanged = options.onEditingChanged;
    this.onSelectAllCheckboxChanged = options.onSelectAllCheckboxChanged;
    this.onSortChanged = options.onSortChanged;
    this.onDragChanged = options.onDragChanged;
    this.updateHeaderCellWidth = options.updateHeaderCellWidth;
    this.updateBodyCellWidths = options.updateBodyCellWidths;
    
    this.setupObservers();
  }

  /**
   * Set up all reactive observers
   */
  private setupObservers(): void {
    fileLog.info('🔍 Setting up observers');
    
    this.setupColumnsObserver();
    this.setupColumnVisibilityObserver();
    this.setupColumnResizeObserver();
    this.setupRowsObserver();
    this.setupViewportObserver();
    this.setupSelectionObserver();
    this.setupSelectAllCheckboxObserver();
    this.setupEditingObserver();
    this.setupSortObserver();
    this.setupDragObserver();
    
    fileLog.info('✅ All observers set up');
  }

  /**
   * Observe columns changes
   */
  private setupColumnsObserver(): void {
    const columnsDisposer = observe(() => {
      const columns = this.tableCore$.columns.get();
      fileLog.info('📊 Columns changed', { count: columns.length });
      this.onColumnsChanged();
    });
    this.disposers.push(columnsDisposer);
  }

  /**
   * Observe column visibility changes
   */
  private setupColumnVisibilityObserver(): void {
    const columnVisibilityDisposer = observe(() => {
      const columnVisibility = this.tableCore$.columnVisibility.get();
      const hiddenCount = Object.values(columnVisibility).filter(visible => visible === false).length;
      fileLog.info('👁️ Column visibility changed', { hiddenCount });
      this.onColumnVisibilityChanged();
    });
    this.disposers.push(columnVisibilityDisposer);
  }

  /**
   * Observe column resize changes
   */
  private setupColumnResizeObserver(): void {
    const columnResizeDisposer = observe(() => {
      const resizeState = this.tableInteraction$.columnResize.get();
      if (resizeState && resizeState.isResizing && resizeState.newWidth && resizeState.columnId) {
        // Only update visual elements during resize, don't trigger re-renders
        this.updateHeaderCellWidth(resizeState.columnId, resizeState.newWidth);
        this.updateBodyCellWidths(resizeState.columnId, resizeState.newWidth);

        // Update overlay manager with resize preview (throttled)
        if (this.overlayManager) {
          this.overlayManager.updateColumnResizePreview(resizeState);
        }
      } else if (resizeState === null) {
        // Resize completed - this should trigger a single re-render
        fileLog.info('📏 Column resize completed');

        // Clear resize preview
        if (this.overlayManager) {
          this.overlayManager.updateColumnResizePreview(null);
        }
      }
    });
    this.disposers.push(columnResizeDisposer);
  }

  /**
   * Observe processed rows changes
   */
  private setupRowsObserver(): void {
    const rowsDisposer = observe(() => {
      const rows = this.tableCore$.processedRows.get();
      fileLog.info('📋 Rows changed', { count: rows.length });
      this.onRowsChanged();
    });
    this.disposers.push(rowsDisposer);
  }

  /**
   * Observe viewport changes
   */
  private setupViewportObserver(): void {
    const viewportDisposer = observe(() => {
      const scrollTop = this.tableViewport$.scrollTop.get();
      const scrollLeft = this.tableViewport$.scrollLeft.get();
      const viewportWidth = this.tableViewport$.viewportWidth.get();
      const viewportHeight = this.tableViewport$.viewportHeight.get();
      
      fileLog.info('🖼️ Viewport changed', { 
        scrollTop, 
        scrollLeft, 
        viewportWidth, 
        viewportHeight 
      });
      this.onViewportChanged();
    });
    this.disposers.push(viewportDisposer);
  }

  /**
   * Observe selection changes
   */
  private setupSelectionObserver(): void {
    const selectionDisposer = observe(() => {
      const selectedCells = this.tableInteraction$.selectedCells.get();

      fileLog.info('🎯 Selection changed', {
        selectedCount: selectedCells.size
      });

      // Update selection using overlay manager
      if (this.overlayManager) {
        this.overlayManager.updateSelection(selectedCells);
      }

      // Delegate to renderer for DOM class updates
      this.onSelectionChanged(selectedCells);
    });
    this.disposers.push(selectionDisposer);
  }

  /**
   * Observe select all checkbox state changes
   */
  private setupSelectAllCheckboxObserver(): void {
    const checkboxDisposer = observe(() => {
      const checkboxState = this.tableInteraction$.selectAllCheckboxState.get();
      fileLog.info('☑️ Select all checkbox state changed', checkboxState);
      this.onSelectAllCheckboxChanged(checkboxState);
    });
    this.disposers.push(checkboxDisposer);
  }

  /**
   * Observe editing state changes
   */
  private setupEditingObserver(): void {
    const editingDisposer = observe(() => {
      const editingCell = this.tableInteraction$.editingCell.get();
      const editValue = this.tableInteraction$.editValue.get();
      
      fileLog.info('📝 Editing state changed', { 
        editingCell, 
        hasValue: !!editValue 
      });
      
      // Update editing overlay via overlay manager
      if (this.overlayManager) {
        this.overlayManager.updateEditingOverlay(editingCell, editValue);
      }
      
      // Delegate to renderer for any additional editing updates
      this.onEditingChanged(editingCell, editValue);
    });
    this.disposers.push(editingDisposer);
  }

  /**
   * Observe sort state changes
   */
  private setupSortObserver(): void {
    const sortDisposer = observe(() => {
      const sortBy = this.tableCore$.sortBy.get();
      fileLog.info('🔄 Sort state changed', { 
        sortCount: sortBy.length 
      });
      this.onSortChanged();
    });
    this.disposers.push(sortDisposer);
  }

  /**
   * Observe drag state changes
   */
  private setupDragObserver(): void {
    const dragDisposer = observe(() => {
      const isDragging = this.tableInteraction$.isDragging.get();
      const dragSource = this.tableInteraction$.dragSource.get();
      const dragTarget = this.tableInteraction$.dragTarget.get();
      
      fileLog.info('🖱️ Drag state changed', { 
        isDragging, 
        hasDragSource: !!dragSource,
        hasDragTarget: !!dragTarget 
      });
      
      // Update drag preview via overlay manager
      if (this.overlayManager) {
        if (isDragging && dragSource) {
          const dragState = {
            isDragging: true,
            startCell: dragSource,
            currentCell: dragTarget || dragSource
          };
          this.overlayManager.updateColumnDragPreview(dragState);
        } else {
          this.overlayManager.updateColumnDragPreview(null);
        }
      }
      
      // Delegate to renderer for any additional drag updates
      this.onDragChanged();
    });
    this.disposers.push(dragDisposer);
  }

  /**
   * Set overlay manager reference (for late initialization)
   */
  setOverlayManager(overlayManager: OverlayManager): void {
    this.overlayManager = overlayManager;
  }

  /**
   * Clean up all observers
   */
  destroy(): void {
    fileLog.info('🧹 Destroying observers');
    
    this.disposers.forEach(dispose => {
      try {
        dispose();
      } catch (error) {
        fileLog.error('❌ Error disposing observer', error);
      }
    });
    
    this.disposers = [];
    fileLog.info('✅ All observers destroyed');
  }

  /**
   * Get the number of active observers (for debugging)
   */
  getObserverCount(): number {
    return this.disposers.length;
  }
}