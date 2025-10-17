/**
 * EventManager - Specialized manager for VibeGrid global event handling
 * 
 * Handles context menus, clipboard operations, drag coordination, and other global
 * event management. Extracted from SimplePassiveRenderer for better modularity.
 */

import { log } from '@/logger';
import type { 
  TableCore$, 
  TableInteraction$, 
  TableViewport$ 
} from '../../stores/pure-observables';
import type { OverlayManager } from '../modules/OverlayManager';

const fileLog = log('components/custom/vibegrid/renderers/managers/EventManager.ts');

export interface EventManagerOptions {
  tableCore$: TableCore$;
  tableInteraction$: TableInteraction$;
  tableViewport$: TableViewport$;
  overlayManager?: OverlayManager;
  container: HTMLElement;
  
  // Event callbacks
  onEntityUpdate?: (rowId: string, updates: Record<string, any>) => Promise<void> | void;
}

export class EventManager {
  private tableCore$: TableCore$;
  private tableInteraction$: TableInteraction$;
  private tableViewport$: TableViewport$;
  private overlayManager?: OverlayManager;
  private container: HTMLElement;
  private onEntityUpdate?: (rowId: string, updates: Record<string, any>) => Promise<void> | void;
  
  // Event state
  private activeEventListeners: Array<{
    target: EventTarget;
    type: string;
    listener: EventListener;
  }> = [];

  constructor(options: EventManagerOptions) {
    this.tableCore$ = options.tableCore$;
    this.tableInteraction$ = options.tableInteraction$;
    this.tableViewport$ = options.tableViewport$;
    this.overlayManager = options.overlayManager;
    this.container = options.container;
    this.onEntityUpdate = options.onEntityUpdate;
  }

  /**
   * Set overlay manager reference (for late initialization)
   */
  setOverlayManager(overlayManager: OverlayManager): void {
    this.overlayManager = overlayManager;
  }

  /**
   * Setup all global event handling
   */
  setupEventHandling(): void {
    this.setupContextMenu();
    this.setupClipboardHandling();
    this.setupGlobalDocumentHandling();
    
    fileLog.info('✅ Global event handling setup complete');
  }

  /**
   * Setup context menu handling
   */
  private setupContextMenu(): void {
    const contextMenuHandler = (e: MouseEvent) => {
      e.preventDefault();
      
      const cellElement = (e.target as HTMLElement).closest('[data-row-id][data-column-id]') as HTMLElement;
      if (cellElement && this.overlayManager) {
        const rowId = cellElement.dataset.rowId;
        const columnId = cellElement.dataset.columnId;
        
        fileLog.info('🖱️ Context menu triggered', { rowId, columnId });
        
        // Show context menu
        this.overlayManager.showContextMenu({
          isVisible: true,
          position: {
            x: e.pageX,
            y: e.pageY,
            clientX: e.clientX,
            clientY: e.clientY
          },
          context: {
            type: 'cell' as const,
            rowId,
            columnId
          },
          onClose: () => {
            this.overlayManager?.hideContextMenu();
          },
          onCopy: () => {
            this.handleCopyAction();
          },
          onPaste: () => {
            this.handlePasteAction();
          },
          onCut: () => {
            this.handleCutAction();
          },
          onInsertRow: () => {
            this.handleInsertRowAction();
          },
          onDeleteRow: () => {
            this.handleDeleteRowAction();
          }
        });
      }
    };

    this.addEventListenerTracked(this.container, 'contextmenu', contextMenuHandler);
  }

  /**
   * Setup clipboard operation handling
   */
  private setupClipboardHandling(): void {
    const keydownHandler = (e: KeyboardEvent) => {
      const isCtrlKey = e.ctrlKey || e.metaKey;
      
      if (isCtrlKey) {
        switch (e.key.toLowerCase()) {
          case 'c':
            e.preventDefault();
            this.handleCopyAction();
            break;
          case 'v':
            e.preventDefault();
            this.handlePasteAction();
            break;
          case 'x':
            e.preventDefault();
            this.handleCutAction();
            break;
          case 'z':
            e.preventDefault();
            if (e.shiftKey) {
              this.handleRedoAction();
            } else {
              this.handleUndoAction();
            }
            break;
          case 'y':
            e.preventDefault();
            this.handleRedoAction();
            break;
        }
      }
    };

    this.addEventListenerTracked(this.container, 'keydown', keydownHandler);
  }

  /**
   * Setup global document-level event handling for drag operations
   */
  private setupGlobalDocumentHandling(): void {
    // This method handles global document events that need coordination
    // For now, we'll track document-level events for drag operations
    // that are initiated from component-specific handlers
    
    fileLog.info('📋 Global document event handling ready');
  }

  /**
   * Handle copy action
   */
  private handleCopyAction(): void {
    fileLog.info('📋 Copy action triggered');
    
    const selectedCells = this.tableInteraction$.selectedCells.get();
    if (selectedCells.size === 0) {
      fileLog.info('📋 No cells selected for copy');
      return;
    }

    try {
      const copiedData = this.extractSelectedCellData(selectedCells);
      this.copyToClipboard(copiedData);
      
      // Store in internal clipboard for paste operations
      this.tableInteraction$.setClipboard({
        data: copiedData,
        operation: 'copy'
      });
      
      fileLog.info('📋 Copy completed', { cellCount: selectedCells.size });
    } catch (error) {
      fileLog.error('📋 Copy failed', error);
    }
    
    this.overlayManager?.hideContextMenu();
  }

  /**
   * Handle paste action
   */
  private handlePasteAction(): void {
    fileLog.info('📋 Paste action triggered');
    
    const clipboard = this.tableInteraction$.clipboard.get();
    if (!clipboard || !clipboard.data) {
      fileLog.info('📋 No clipboard data available');
      return;
    }

    try {
      const selectedCells = this.tableInteraction$.selectedCells.get();
      if (selectedCells.size === 0) {
        fileLog.info('📋 No target cells selected for paste');
        return;
      }

      this.pasteClipboardData(clipboard.data, selectedCells);
      fileLog.info('📋 Paste completed');
    } catch (error) {
      fileLog.error('📋 Paste failed', error);
    }
    
    this.overlayManager?.hideContextMenu();
  }

  /**
   * Handle cut action
   */
  private handleCutAction(): void {
    fileLog.info('✂️ Cut action triggered');
    
    const selectedCells = this.tableInteraction$.selectedCells.get();
    if (selectedCells.size === 0) {
      fileLog.info('✂️ No cells selected for cut');
      return;
    }

    try {
      const cutData = this.extractSelectedCellData(selectedCells);
      this.copyToClipboard(cutData);
      
      // Store in internal clipboard for paste operations
      this.tableInteraction$.setClipboard({
        data: cutData,
        operation: 'cut'
      });
      
      // Clear the selected cells
      this.clearSelectedCells(selectedCells);
      
      fileLog.info('✂️ Cut completed', { cellCount: selectedCells.size });
    } catch (error) {
      fileLog.error('✂️ Cut failed', error);
    }
    
    this.overlayManager?.hideContextMenu();
  }

  /**
   * Handle insert row action
   */
  private handleInsertRowAction(): void {
    fileLog.info('➕ Insert row action triggered');
    
    // Get the current selection to determine insertion point
    const selectedCells = this.tableInteraction$.selectedCells.get();
    let insertionIndex = 0;
    
    if (selectedCells.size > 0) {
      // Find the minimum row index from selected cells
      const rowIds = Array.from(selectedCells).map(cellId => cellId.split(':')[0]);
      const uniqueRowIds = [...new Set(rowIds)];
      const rows = this.tableCore$.processedRows.get();
      
      const rowIndices = uniqueRowIds.map(rowId => 
        rows.findIndex(row => row.id === rowId)
      ).filter(index => index !== -1);
      
      if (rowIndices.length > 0) {
        insertionIndex = Math.min(...rowIndices);
      }
    }
    
    // Trigger row insertion via tableCore$
    this.tableCore$.insertRow(insertionIndex);
    
    this.overlayManager?.hideContextMenu();
  }

  /**
   * Handle delete row action
   */
  private handleDeleteRowAction(): void {
    fileLog.info('➖ Delete row action triggered');
    
    const selectedCells = this.tableInteraction$.selectedCells.get();
    if (selectedCells.size === 0) {
      fileLog.info('➖ No cells selected for row deletion');
      return;
    }

    // Get unique row IDs from selected cells
    const rowIds = Array.from(selectedCells).map(cellId => cellId.split(':')[0]);
    const uniqueRowIds = [...new Set(rowIds)];
    
    // Trigger row deletion via tableCore$
    uniqueRowIds.forEach(rowId => {
      this.tableCore$.deleteRow(rowId);
    });
    
    fileLog.info('➖ Delete rows completed', { rowCount: uniqueRowIds.length });
    this.overlayManager?.hideContextMenu();
  }

  /**
   * Handle undo action
   */
  private handleUndoAction(): void {
    fileLog.info('↶ Undo action triggered');
    
    // Implement undo via tableCore$ if available
    if (this.tableCore$.undo) {
      this.tableCore$.undo();
    } else {
      fileLog.info('↶ Undo not available');
    }
  }

  /**
   * Handle redo action
   */
  private handleRedoAction(): void {
    fileLog.info('↷ Redo action triggered');
    
    // Implement redo via tableCore$ if available
    if (this.tableCore$.redo) {
      this.tableCore$.redo();
    } else {
      fileLog.info('↷ Redo not available');
    }
  }

  /**
   * Extract data from selected cells for clipboard operations
   */
  private extractSelectedCellData(selectedCells: Set<string>): any[][] {
    const rows = this.tableCore$.processedRows.get();
    const columns = this.tableCore$.columns.get();
    
    // Group cells by row
    const cellsByRow = new Map<string, Map<string, any>>();
    
    selectedCells.forEach(cellId => {
      const [rowId, columnId] = cellId.split(':');
      
      if (!cellsByRow.has(rowId)) {
        cellsByRow.set(rowId, new Map());
      }
      
      const row = rows.find(r => r.id === rowId);
      const value = row ? row[columnId] : '';
      
      cellsByRow.get(rowId)!.set(columnId, value);
    });
    
    // Convert to 2D array format
    const data: any[][] = [];
    cellsByRow.forEach((cellsInRow, rowId) => {
      const rowData: any[] = [];
      columns.forEach(column => {
        if (cellsInRow.has(column.id)) {
          rowData.push(cellsInRow.get(column.id));
        }
      });
      if (rowData.length > 0) {
        data.push(rowData);
      }
    });
    
    return data;
  }

  /**
   * Copy data to system clipboard
   */
  private async copyToClipboard(data: any[][]): Promise<void> {
    try {
      // Convert 2D array to tab-separated text
      const text = data.map(row => row.join('\t')).join('\n');
      
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
    } catch (error) {
      fileLog.error('📋 Failed to copy to system clipboard', error);
    }
  }

  /**
   * Paste clipboard data to selected cells
   */
  private pasteClipboardData(data: any[][], targetCells: Set<string>): void {
    // Implementation would depend on the specific paste strategy
    // For now, we'll just log the operation
    fileLog.info('📋 Pasting data', { 
      dataRows: data.length,
      targetCells: targetCells.size
    });
    
    // TODO: Implement actual paste logic based on requirements
    // This would involve updating cell values via onEntityUpdate callback
  }

  /**
   * Clear values from selected cells
   */
  private clearSelectedCells(selectedCells: Set<string>): void {
    selectedCells.forEach(cellId => {
      const [rowId, columnId] = cellId.split(':');
      
      if (this.onEntityUpdate) {
        this.onEntityUpdate(rowId, { [columnId]: '' });
      }
    });
  }

  /**
   * Add event listener with tracking for cleanup
   */
  private addEventListenerTracked(
    target: EventTarget, 
    type: string, 
    listener: EventListener
  ): void {
    target.addEventListener(type, listener);
    this.activeEventListeners.push({ target, type, listener });
  }

  /**
   * Add document-level event listener with tracking
   */
  addDocumentEventListener(type: string, listener: EventListener): void {
    this.addEventListenerTracked(document, type, listener);
  }

  /**
   * Remove document-level event listener
   */
  removeDocumentEventListener(type: string, listener: EventListener): void {
    document.removeEventListener(type, listener);
    
    // Remove from tracking
    this.activeEventListeners = this.activeEventListeners.filter(
      item => !(item.target === document && item.type === type && item.listener === listener)
    );
  }

  /**
   * Clean up all event listeners
   */
  destroy(): void {
    fileLog.info('🧹 Destroying EventManager');
    
    // Remove all tracked event listeners
    this.activeEventListeners.forEach(({ target, type, listener }) => {
      try {
        target.removeEventListener(type, listener);
      } catch (error) {
        fileLog.error('❌ Error removing event listener', error);
      }
    });
    
    this.activeEventListeners = [];
    
    fileLog.info('✅ EventManager destroyed');
  }
}