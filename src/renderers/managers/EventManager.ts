/**
 * EventManager - Specialized manager for VibeGrid global event handling
 * 
 * Handles context menus, clipboard operations, drag coordination, and other global
 * event management. Extracted from SimplePassiveRenderer for better modularity.
 */

import { createLogger } from '@/lib/logging';
import { toast } from 'sonner';
import type { TableCoreStore } from '../../stores/TableCoreStore';
import type { InteractionStore } from '../../stores/InteractionStore';
import type { TableViewport$ } from '../../stores/pure-observables';
import type { OverlayManager } from '../modules/OverlayManager';
import { ClipboardManager } from '../../managers/ClipboardManager';

const fileLog = createLogger('components/custom/vibegrid/renderers/managers/EventManager.ts');

export interface EventManagerOptions {
  tableCore$: TableCoreStore;
  tableInteraction$: InteractionStore;
  tableViewport$: TableViewport$;
  overlayManager?: OverlayManager;
  container: HTMLElement;

  // Event callbacks
  onEntityUpdate?: (rowId: string, updates: Record<string, any>) => Promise<void> | void;
}

export class EventManager {
  private tableCore$: TableCoreStore;
  private tableInteraction$: InteractionStore;
  private tableViewport$: TableViewport$;
  private overlayManager?: OverlayManager;
  private container: HTMLElement;
  private onEntityUpdate?: (rowId: string, updates: Record<string, any>) => Promise<void> | void;
  private clipboardManager: ClipboardManager;

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

    // Initialize clipboard manager
    this.clipboardManager = new ClipboardManager({
      tableCore$: this.tableCore$,
      tableInteraction$: this.tableInteraction$,
      onEntityUpdate: this.onEntityUpdate
    });
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
    this.setupGlobalDocumentHandling();

    fileLog.info('✅ Global event handling setup complete (keyboard handling moved to KeyboardController)');
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
            this.clipboardManager.handleCopy();
          },
          onPaste: () => {
            this.clipboardManager.handlePaste();
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
   * Setup global document-level event handling for drag operations
   */
  private setupGlobalDocumentHandling(): void {
    // This method handles global document events that need coordination
    // For now, we'll track document-level events for drag operations
    // that are initiated from component-specific handlers
    
    fileLog.info('📋 Global document event handling ready');
  }

  /**
   * Handle copy action (delegated to ClipboardManager)
   */
  handleCopyAction(): void {
    this.clipboardManager.handleCopy();
    this.overlayManager?.hideContextMenu();
  }

  /**
   * Handle paste action (delegated to ClipboardManager)
   */
  async handlePasteAction(): Promise<void> {
    await this.clipboardManager.handlePaste();
    this.overlayManager?.hideContextMenu();
  }

  /**
   * Handle cut action (copy then clear)
   */
  async handleCutAction(): Promise<void> {
    fileLog.info('✂️ Cut action triggered');

    const selectedCells = this.tableInteraction$.selectedCells.get();
    if (selectedCells.size === 0) {
      toast.warning('No cells selected', {
        description: 'Select cells to cut first',
        duration: 3000
      });
      return;
    }

    try {
      // First copy the data
      const copySuccess = await this.clipboardManager.handleCopy();

      if (copySuccess) {
        // Mark as cut operation
        const clipboard = this.tableInteraction$.clipboard.get();
        if (clipboard) {
          this.tableInteraction$.setClipboard({
            ...clipboard,
            operation: 'cut'
          });
        }

        // Clear the selected cells
        this.clearSelectedCells(selectedCells);

        toast.success('Data cut to clipboard', {
          description: `${selectedCells.size} cells cut`,
          duration: 2000
        });

        fileLog.info('✂️ Cut completed', { cellCount: selectedCells.size });
      }
    } catch (error) {
      fileLog.error('✂️ Cut failed', error);
      toast.error('Cut operation failed', {
        description: error instanceof Error ? error.message : 'Unknown error',
        duration: 4000
      });
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
  handleUndoAction(): void {
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
  handleRedoAction(): void {
    fileLog.info('↷ Redo action triggered');
    
    // Implement redo via tableCore$ if available
    if (this.tableCore$.redo) {
      this.tableCore$.redo();
    } else {
      fileLog.info('↷ Redo not available');
    }
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