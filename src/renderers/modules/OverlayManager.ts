/**
 * OverlayManager - Centralized management of all overlay components for VibeGrid
 * Handles canvas overlay, selection manager, editing overlay, and context menu
 */

import { createLogger } from '@/shared/lib/logging';
import { runInAction, reaction } from 'mobx';
import { CanvasOverlayDOM } from '../../overlays/CanvasOverlayDOM';
import { EditingOverlay } from '../../overlays/EditingOverlay';
import { ContextMenuManager } from '../../components/ContextMenu';
import { ColumnDragOverlayDOM } from '../../overlays/ColumnDragOverlayDOM';
import { EditSessionManager } from '../../services/EditSessionManager';
// SelectionManager functionality consolidated into interaction-state
import type { TableCoreStore } from '../../stores/TableCoreStore';
import type { InteractionStore } from '../../stores/InteractionStore';
import type { ViewportInfo } from '../../types';
import type { VisualCellPosition } from '../../overlays/OverlayTypes';
import type { VibeGridXCoordinateManager } from '../../coordinates/VibeGridXCoordinateManager';

// New hybrid coordinate system imports
import { PositionEvents, domPositions$, positionTracker } from '../../stores/dom-position-state';
import { virtualCellPosition$ } from '../../virtualization/VirtualScrollManager';
import { GRID_DIMENSIONS } from '../../constants/grid-dimensions';
import type { CoordinateMapping } from '../../coordinates/VibeGridXCoordinateManager';

// Re-export CoordinateMapping for consumers
export type { CoordinateMapping };

const fileLog = createLogger('components/vibegrid/renderers/OverlayManager');

// Use centralized dimensions from the new system
const ROW_HEIGHT = GRID_DIMENSIONS.ROW_HEIGHT;
const HEADER_HEIGHT = GRID_DIMENSIONS.HEADER_HEIGHT;

export interface OverlayManagerOptions {
  container: HTMLElement;
  tableCoreStore: TableCoreStore;
  interactionStore: InteractionStore;
  coordinateManager: VibeGridXCoordinateManager;
  enableSelectionColumn?: boolean;
  headerContainer?: HTMLElement | null;
  bodyContainer?: HTMLElement | null;
  getProcessedRows: () => any[];
  onEntityUpdate?: (rowId: string, updates: Record<string, any>) => Promise<void> | void;
}


export class OverlayManager {
  private container: HTMLElement;
  private tableCoreStore: TableCoreStore;
  private interactionStore: InteractionStore;
  private coordinateManager: VibeGridXCoordinateManager;
  private enableSelectionColumn: boolean;
  private headerContainer: HTMLElement | null;
  private bodyContainer: HTMLElement | null;
  private getProcessedRows: () => any[];
  private onEntityUpdate?: (rowId: string, updates: Record<string, any>) => Promise<void> | void;

  // Overlay instances
  private canvasOverlay: CanvasOverlayDOM | null = null;
  // Selection now managed through tableInteraction$ observable
  private editingOverlay: EditingOverlay | null = null;
  private contextMenu: ContextMenuManager | null = null;
  private columnDragOverlay: ColumnDragOverlayDOM | null = null;
  // Note: FillHandleLayer is managed by CanvasOverlayDOM, not created here

  // Service layer
  private editSessionManager: EditSessionManager;

  // Performance optimization caches
  private lastSelectionString: string = ''; // More reliable deduplication
  private lastClipboardString: string = ''; // Clipboard state deduplication
  private updateSelectionRAF: number | null = null;
  private lastCoordinateMappingVersion: number = -1;
  private coordinateMapping: CoordinateMapping | null = null;

  // MobX reaction disposers
  private disposers: (() => void)[] = [];

  constructor(options: OverlayManagerOptions) {
    this.container = options.container;
    this.tableCoreStore = options.tableCoreStore;
    this.interactionStore = options.interactionStore;
    this.coordinateManager = options.coordinateManager;
    this.enableSelectionColumn = options.enableSelectionColumn ?? false;
    this.headerContainer = options.headerContainer || null;
    this.bodyContainer = options.bodyContainer || null;
    this.getProcessedRows = options.getProcessedRows;
    this.onEntityUpdate = options.onEntityUpdate;

    // Create EditSessionManager (service layer)
    this.editSessionManager = new EditSessionManager(
      this.interactionStore,
      this.tableCoreStore
    );

    this.initOverlays();

    // 🔧 KEY FIX: Subscribe to coordinate changes to redraw selections
    // When columns are reordered/resized/hidden, we need to recalculate visual positions
    this.setupCoordinateSubscription();
  }

  /**
   * Subscribe to coordinate manager changes
   * Redraws selections when layout changes (reorder, hide, resize)
   * 🔧 FIX: Defer redraw until next frame so DOM updates first
   */
  private setupCoordinateSubscription(): void {
    const unsubscribe = this.coordinateManager.subscribe((event) => {
      fileLog.info('🔄 Coordinate change detected, scheduling selection redraw', {
        eventType: event.type,
        version: event.newMapping.version,
        selectedCells: this.interactionStore.selectedCells.size
      })

      // 🔧 FIX: Defer until next frame so DOM updates with new layout first
      requestAnimationFrame(() => {
        if (this.interactionStore.selectedCells.size > 0) {
          fileLog.info('🎨 Redrawing selections with updated DOM layout', {
            selectedCells: this.interactionStore.selectedCells.size,
            coordinatorVersion: this.coordinateManager.getVersion()
          })
          this.performCanvasSelectionUpdate(this.interactionStore.selectedCells)
        }
      })
    })

    // Add to disposers for cleanup
    this.disposers.push(unsubscribe)

    fileLog.info('✅ Coordinate subscription established for selection overlay sync')
  }

  /**
   * Initialize all overlay components
   */
  private initOverlays(): void {
    fileLog.info('🎨 Initializing overlay system'); // Keep: lifecycle
    
    // Create canvas overlay
    this.canvasOverlay = new CanvasOverlayDOM(
      {
        selectionColor: 'rgba(59, 130, 246, 0.1)',
        selectionBorderColor: 'rgb(59, 130, 246)',
        selectionBorderWidth: 2,
        borderWidth: 2,
        dragIndicatorColor: 'rgb(59, 130, 246)',
        enableAnimations: true,
        animationDuration: 200,
        enableLayerCaching: true,
        maxSelectableCells: 10000,
        cellHeight: ROW_HEIGHT,
        cellWidth: 150 // Default width, updated by coordinate mapping
      },
      (event) => {
        fileLog.debug('📋 Canvas overlay event:', event);
        // Handle fill events from the overlay system
        if (event.type === 'FILL_PREVIEW' && 'previewCells' in event && event.previewCells) {
          // Convert preview cell IDs to visual positions and render
          const visualPositions = this.getVisualCellPositions(event.previewCells);
          if (this.canvasOverlay) {
            const fillHandleLayer = this.canvasOverlay.getFillHandleLayer();
            fillHandleLayer.renderFillPreviewWithVisualPositions(visualPositions);
          }
        } else if (event.type === 'FILL_COMPLETE' && 'fillCells' in event && event.fillCells) {
          this.handleFillComplete(event.fillCells);
        }
      }
    );

    // Pass getProcessedRows to canvas overlay for group boundary constraints
    this.canvasOverlay.setProcessedRowsGetter(this.getProcessedRows);
    
    // Canvas overlay will be initialized in initializeOverlay() method
    // after DOM is ready
    
    // Selection is now managed through tableInteraction$ observable
    // Visual updates can be done via tableInteraction$.updateCellSelectionVisuals()
    
    // Create editing overlay
    this.editingOverlay = new EditingOverlay(this.container, {
      interactionStore: this.interactionStore,
      onUpdate: (value) => {
        // ✅ Delegate to EditSessionManager for session tracking
        this.editSessionManager.updateValue(value);
      },
      onCommit: async (value) => {
        // ✅ Delegate to EditSessionManager for proper commit handling
        await this.editSessionManager.commit('user-action', value);
      },
      onCancel: () => {
        // ✅ Delegate to EditSessionManager for proper cancel handling
        this.editSessionManager.cancel('user-action');
      },
      relationshipContext: {
        relationshipResolvers: {}
      },
      getRowData: (rowId: string) => {
        const processedRows = this.getProcessedRows();
        return processedRows.find((row: any) => row.id === rowId) || null;
      }
    });
    
    // Create context menu
    this.contextMenu = new ContextMenuManager(this.container);

    // Create column drag overlay
    this.columnDragOverlay = new ColumnDragOverlayDOM(this.container, {
      cellHeight: ROW_HEIGHT,
      headerHeight: HEADER_HEIGHT
    });

    // Note: FillHandleLayer and ColumnResizeOverlay are lazily created by CanvasOverlayDOM

    // Link to existing interactions observable instead of setting up separate observer
    this.linkToInteractionsObservable();

    fileLog.info('✅ Overlay system initialized (CanvasOverlay handles fill handle & resize preview)'); // Keep: lifecycle
  }
  
  /**
   * CONSOLIDATED: Single reactive observer for all overlay updates
   * Replaces 3 separate observers to eliminate cascading reactive chain
   */
  private linkToInteractionsObservable(): void {
    // State tracking for deduplication
    let lastSelectionString = '';
    let lastEditingCell: string | null = null;
    let lastResizeState: string = ''; // Track full resize state as string
    let wasColumnResizing = false;
    let pendingUpdate: number | null = null;

    // SINGLE OBSERVER: Watches all relevant state in one place using MobX reaction
    this.disposers.push(
      reaction(
        () => {
          // Safety check for observable availability
          if (!this.interactionStore) {
            return null;
          }

          // DEBUG: Log every observer trigger
          fileLog.debug('🔍 REACTIVE: OverlayManager reaction triggered');

          // READ ALL STATE: Track dependencies by accessing observable properties
          try {
            const state = {
              // Selection state - direct property access (no .get())
              selectedCells: this.interactionStore.selectedCells,
              focusedCell: this.interactionStore.focusedCell,
              hoveredCell: this.interactionStore.hoveredCell,

              // Editing state
              editingCell: this.interactionStore.editingCell,
              editValue: this.interactionStore.editValue,
              isEditing: this.interactionStore.isEditing,

              // Clipboard state
              clipboard: this.interactionStore.clipboard,

              // Column resize state
              columnResize: this.interactionStore.columnResize
            };

            // Debug clipboard state
            if (state.clipboard) {
              fileLog.debug('📋 OverlayManager detected clipboard state', {
                operation: state.clipboard.operation,
                copiedCellsCount: state.clipboard.copiedCells.size
              });
            }

            return state;
          } catch (error) {
            fileLog.debug('🔍 REACTIVE: Error reading state, likely during unmount', error);
            return null;
          }
        },
        (state) => {
          if (!state) {
            return;
          }

          fileLog.debug('🔍 REACTIVE: Reaction effect triggered', {
            selectedCount: state.selectedCells.size,
            editingCell: state.editingCell,
            isEditing: state.isEditing,
            observerCallCount: Date.now()
          });

          // DEDUPLICATION: Skip if nothing meaningful changed
          const selectionString = Array.from(state.selectedCells).sort().join(',');
          const selectionChanged = lastSelectionString !== selectionString;
          const editingChanged = lastEditingCell !== state.editingCell;
          const clipboardString = state.clipboard ? `${state.clipboard.operation}:${Array.from(state.clipboard.copiedCells).sort().join(',')}` : '';
          const clipboardChanged = this.lastClipboardString !== clipboardString;
          const resizeStateString = state.columnResize ? `${state.columnResize.columnId}:${state.columnResize.newWidth}` : '';
          const resizeChanged = lastResizeState !== resizeStateString; // Detect width changes OR start/stop
          const isColumnResizing = !!state.columnResize?.isResizing;

          // IMPORTANT: Don't skip if columnResize changed (resize preview needs immediate updates including clear)
          if (!selectionChanged && !editingChanged && !clipboardChanged && !resizeChanged) {
            fileLog.debug('🔍 REACTIVE: No meaningful changes, skipping update');
            return;
          }

          // Update deduplication tracking
          lastSelectionString = selectionString;
          lastEditingCell = state.editingCell;
          lastResizeState = resizeStateString;
          this.lastClipboardString = clipboardString;

          fileLog.debug('🔍 REACTIVE: Consolidated state changed', {
            selectionChanged,
            editingChanged,
            clipboardChanged,
            selectedCount: state.selectedCells.size,
            editingCell: state.editingCell,
            isEditing: state.isEditing,
            hasClipboard: !!state.clipboard,
            clipboardOperation: state.clipboard?.operation,
            clipboardCellCount: state.clipboard?.copiedCells?.size
          });

          // BATCH DOM UPDATES: Cancel any pending update and schedule new one
          if (pendingUpdate !== null) {
            cancelAnimationFrame(pendingUpdate);
          }

          pendingUpdate = requestAnimationFrame(() => {
            pendingUpdate = null;

            // BATCHED: All DOM updates happen together in a single frame
            if (isColumnResizing && this.canvasOverlay) {
              if (!wasColumnResizing) {
                fileLog.debug('[RESIZE] Selection overlay hidden for column resize');
                const selectionOverlay = this.canvasOverlay.getSelectionOverlayInstance();
                if (selectionOverlay) {
                  selectionOverlay.hide(); // Just hide, don't destroy
                }
                this.canvasOverlay.hideFillHandle();
              }
            } else if (wasColumnResizing && !isColumnResizing) {
              fileLog.debug('[RESIZE] Column resize ended, restoring selection overlay', {
                selectedCount: state.selectedCells.size
              });

              // Show selection container again
              if (this.canvasOverlay) {
                const selectionOverlay = this.canvasOverlay.getSelectionOverlayInstance();
                if (selectionOverlay) {
                  selectionOverlay.show(); // Restore visibility
                }
              }

              if (state.selectedCells.size > 0) {
                this.performCanvasSelectionUpdate(state.selectedCells);
              } else if (this.canvasOverlay) {
                this.canvasOverlay.updateSelectionWithVisualPositions([]);
                this.canvasOverlay.hideFillHandle();
              }
            }

            // Handle selection updates
            if (selectionChanged) {
              if (isColumnResizing) {
                fileLog.debug('[RESIZE] Skipping selection overlay update during column resize');
              } else if (state.selectedCells.size > 0) {
                this.performCanvasSelectionUpdate(state.selectedCells);
              } else if (this.canvasOverlay) {
                // Clear selection overlay when no cells selected
                this.canvasOverlay.updateSelectionWithVisualPositions([]);
                this.canvasOverlay.hideFillHandle();
              }
            }

            // Handle editing overlay updates
            if (editingChanged) {
              if (state.isEditing && state.editingCell && this.editingOverlay) {
                // Show editing overlay
                const [rowId, columnId] = state.editingCell.split(':');
                const columns = this.tableCoreStore.columns; // Direct access, no peek() needed
                const column = columns.find((c: any) => c.id === columnId);

                if (column) {
                  const position = this.getCellPosition(rowId, columnId);
                  if (position) {
                    const cell = { rowId, columnId };
                    const actualValue = state.editValue !== undefined ? state.editValue : this.getCellValue(rowId, columnId);

                    fileLog.debug('🔍 REACTIVE: Showing editing overlay (consolidated)', {
                      cellId: state.editingCell,
                      position,
                      value: actualValue
                    });

                    const positionWithKey = { ...position, cellKey: state.editingCell };
                    this.editingOverlay.showAt(positionWithKey, cell, column, actualValue);

                    // Mark the cell as being edited to hide its content via CSS
                    const cellElement = this.container.querySelector(
                      `[data-row-id="${rowId}"][data-column-id="${columnId}"]`
                    ) as HTMLElement;
                    if (cellElement) {
                      cellElement.dataset.editing = 'true';
                    }
                  }
                }
              } else if (!state.isEditing && this.editingOverlay) {
                // Hide editing overlay
                fileLog.debug('🔍 REACTIVE: Hiding editing overlay (consolidated)');
                this.editingOverlay.hide();

                // Remove editing marker from all cells
                const editingCells = this.container.querySelectorAll('[data-editing="true"]');
                editingCells.forEach((cell) => {
                  (cell as HTMLElement).removeAttribute('data-editing');
                });
              }
            }

            // Handle clipboard overlay updates (independent of selection)
            if (clipboardChanged) {
              if (state.clipboard && state.clipboard.copiedCells.size > 0 && this.canvasOverlay) {
                const clipboardState = {
                  copiedCells: state.clipboard.copiedCells,
                  isCut: state.clipboard.operation === 'cut'
                };
                fileLog.debug('📋 REACTIVE: Updating clipboard overlay', {
                  operation: state.clipboard.operation,
                  cellCount: state.clipboard.copiedCells.size,
                  copiedCells: Array.from(state.clipboard.copiedCells)
                });

                // Get visual positions for clipboard cells (same approach as selection)
                const clipboardVisualCells = this.getVisualCellPositions(state.clipboard.copiedCells);
                this.canvasOverlay.updateClipboardWithVisualPositions(clipboardVisualCells, clipboardState.isCut);
              } else if (this.canvasOverlay) {
                // Clear clipboard overlay only when clipboard is explicitly null
                fileLog.debug('📋 REACTIVE: Clearing clipboard overlay');
                this.canvasOverlay.clearClipboardIndicators();
              }
            }

            // IMPORTANT: Always update clipboard overlay if clipboard exists (even without changes)
            // This ensures visual feedback persists even when selection changes
            if (state.clipboard && state.clipboard.copiedCells.size > 0 && this.canvasOverlay && !clipboardChanged) {
              const clipboardState = {
                copiedCells: state.clipboard.copiedCells,
                isCut: state.clipboard.operation === 'cut'
              };
              fileLog.debug('📋 REACTIVE: Maintaining clipboard overlay (selection independent)', {
                operation: state.clipboard.operation,
                cellCount: state.clipboard.copiedCells.size
              });

              // Get visual positions for clipboard cells (same approach as selection)
              const clipboardVisualCells = this.getVisualCellPositions(state.clipboard.copiedCells);
              this.canvasOverlay.updateClipboardWithVisualPositions(clipboardVisualCells, clipboardState.isCut);
            }

            // Handle column resize preview
            if (state.columnResize) {
              fileLog.debug('[RESIZE-PREVIEW] 📏 REACTIVE: Column resize detected', {
                hasCanvasOverlay: !!this.canvasOverlay,
                isInitialized: this.canvasOverlay?.isInitialized,
                columnId: state.columnResize.columnId,
                newWidth: state.columnResize.newWidth,
                isResizing: state.columnResize.isResizing
              });

              if (this.canvasOverlay) {
                this.canvasOverlay.updateColumnResizePreview(state.columnResize);
                fileLog.debug('[RESIZE-PREVIEW] ✅ Called canvasOverlay.updateColumnResizePreview');
              } else {
                fileLog.warn('[RESIZE-PREVIEW] ⚠️ No canvasOverlay available!');
              }
            } else if (this.canvasOverlay) {
              // Clear resize preview
              fileLog.debug('[RESIZE-PREVIEW] 🧹 Clearing resize preview');
              this.canvasOverlay.updateColumnResizePreview(null);
            }

            wasColumnResizing = isColumnResizing;
          });
        }
      )
    );

    fileLog.debug('✅ Consolidated reactive observer established - eliminated multiple observer chain');
  }

  
  /**
   * Initialize the canvas overlay in the proper container
   * Call this after DOM is ready
   */
  initializeOverlay(): void {
    if (!this.canvasOverlay || this.canvasOverlay.isInitialized) {
      return;
    }

    // Use viewport container (the scrolling container) for the overlay
    // This ensures the overlay scrolls with the content
    const targetContainer = this.container.querySelector('.vibegridx-viewport') as HTMLElement || this.container;

    if (!targetContainer) {
      fileLog.error('❌ No target container found for overlay initialization');
      return;
    }

    try {
      this.canvasOverlay.init(targetContainer);
      fileLog.info('🎨 Canvas overlay initialized in viewport container'); // Keep: lifecycle

      // Initialize DOM position tracking now that overlay is ready
      this.initializeDOMPositionTracking();
    } catch (error) {
      fileLog.error('❌ Failed to initialize canvas overlay', error);
    }
  }

  /**
   * Initialize DOM position tracking after overlay is ready
   */
  private initializeDOMPositionTracking(): void {
    try {
      positionTracker.initialize(this.container);
      fileLog.info('✅ DOM position tracking initialized'); // Keep: lifecycle
    } catch (error) {
      fileLog.error('❌ Failed to initialize DOM position tracking', error);
    }
  }
  
  /**
   * Update selection display (optimized with change detection and throttling)
   */
  updateSelection(selectedCells: Set<string>): void {
    fileLog.debug('🔄 OverlayManager.updateSelection called', {
      selectedCells: Array.from(selectedCells),
      cellCount: selectedCells.size
    });

    // BATCH: Use MobX runInAction to prevent multiple reactive triggers
    runInAction(() => {
      // Update selection visuals using InteractionStore
      this.interactionStore.selectedCells = selectedCells;
    });

    fileLog.debug('🎯 Updating overlay for selection', {
      selectedCells: Array.from(selectedCells)
    });

    // Cancel any pending updates and run immediately
    if (this.updateSelectionRAF !== null) {
      cancelAnimationFrame(this.updateSelectionRAF);
      this.updateSelectionRAF = null;
    }

    // Update overlay directly without RAF throttling for better responsiveness
    this.performCanvasSelectionUpdate(selectedCells);
  }

  /**
   * Perform the actual canvas selection update (separated for throttling)
   */
  private performCanvasSelectionUpdate(selectedCells: Set<string>): void {
    if (this.canvasOverlay && this.canvasOverlay.isInitialized) {
      // Convert selected cells to visual positions
      const visualCells = this.getVisualCellPositions(selectedCells);

      // Update viewport info
      const viewportInfo = this.getViewportInfo();

      this.canvasOverlay.updateViewport(viewportInfo);
      this.canvasOverlay.updateSelectionWithVisualPositions(visualCells);

      // Show/hide fill handle based on selection
      if (visualCells.length > 0) {
        this.canvasOverlay.renderFillHandle(visualCells, undefined, viewportInfo);
      } else {
        this.canvasOverlay.hideFillHandle();
      }
    }
  }

  /**
   * Compare two Sets for equality (optimized for performance)
   */
  private areSetsEqual(set1: Set<string>, set2: Set<string>): boolean {
    if (set1.size !== set2.size) return false;
    for (const item of set1) {
      if (!set2.has(item)) return false;
    }
    return true;
  }

  // NOTE: updateEditingOverlay method removed - editing overlays now handled reactively via interactions observable
  
  /**
   * Get current cell value from data
   */
  private getCellValue(rowId: string, columnId: string): any {
    const processedRows = this.tableCoreStore.processedRows;

    // Debug the full data structure
    fileLog.debug('getCellValue DETAILED DEBUG', {
      targetRowId: rowId,
      targetColumnId: columnId,
      totalRows: processedRows?.length || 0,
      firstFewRowIds: processedRows?.slice(0, 3).map((r: any) => r.id) || [],
      allRowIds: processedRows?.map((r: any) => r.id) || [],
      sampleRowStructure: processedRows?.[0] ? Object.keys(processedRows[0]).slice(0, 8) : 'no rows'
    });

    const row = processedRows.find((r: any) => r.id === rowId);

    if (!row) {
      fileLog.debug('getCellValue: Row NOT found', {
        targetRowId: rowId,
        availableRowIds: processedRows?.map((r: any) => r.id) || []
      });
      return '';
    }

    const value = row[columnId];

    fileLog.debug('getCellValue: Row found, extracting value', {
      targetRowId: rowId,
      foundRowId: row.id,
      targetColumnId: columnId,
      extractedValue: value,
      rowKeys: Object.keys(row).slice(0, 8),
      hasTargetColumn: columnId in row
    });

    fileLog.debug('📄 Getting cell value for editing', {
      rowId,
      columnId,
      foundRow: !!row,
      cellValue: value,
      rowKeys: row ? Object.keys(row).slice(0, 5) : []
    });

    return value;
  }

  /**
   * Update column resize preview
   */
  updateColumnResizePreview(resizeState: any): void {
    // Only log when there's an actual resize happening
    if (resizeState?.isResizing) {
      fileLog.debug('[RESIZE] 🎨 OverlayManager.updateColumnResizePreview called', {
        resizeState,
        canvasOverlayExists: !!this.canvasOverlay,
        isInitialized: this.canvasOverlay?.isInitialized
      });
    }

    // Ensure overlay is initialized
    if (!this.canvasOverlay?.isInitialized) {
      if (resizeState?.isResizing) {
        fileLog.debug('[RESIZE] 🎨 Initializing overlay for resize preview');
      }
      this.initializeOverlay();
    }

    if (this.canvasOverlay && this.canvasOverlay.isInitialized) {
      if (resizeState?.isResizing) {
        fileLog.debug('[RESIZE] 🎨 Passing resize state to canvasOverlay');
      }
      this.canvasOverlay.updateColumnResizePreview(resizeState);
    } else if (resizeState?.isResizing) {
      fileLog.warn('[RESIZE] ⚠️ Cannot update resize preview - overlay not ready', {
        canvasOverlay: !!this.canvasOverlay,
        isInitialized: this.canvasOverlay?.isInitialized
      });
    }
  }
  
  /**
   * Update column drag preview
   */
  updateColumnDragPreview(dragState: any): void {
    if (this.canvasOverlay) {
      const viewportInfo = this.getViewportInfo();
      if (dragState) {
        this.canvasOverlay.updateDragPreview(dragState, viewportInfo);
      } else {
        this.canvasOverlay.updateDragPreview(null, null);
      }
    }
  }
  
  /**
   * Show context menu
   */
  showContextMenu(options: {
    x: number;
    y: number;
    rowId: string;
    columnId: string;
    items: Array<{
      label: string;
      icon?: string;
      action: () => void;
    }>;
  }): void {
    if (this.contextMenu) {
      // Transform options into ContextMenuProps format
      this.contextMenu.show({
        isVisible: true,
        position: { x: options.x, y: options.y, clientX: options.x, clientY: options.y },
        context: {
          type: 'cell' as const,
          rowId: options.rowId,
          columnId: options.columnId
        },
        onClose: () => this.hideContextMenu(),
        onCopy: () => {}, // Handled by context menu items
        onPaste: () => {} // Handled by context menu items
      });
    }
  }
  
  /**
   * Hide context menu
   */
  hideContextMenu(): void {
    if (this.contextMenu) {
      this.contextMenu.hide();
    }
  }
  
  /**
   * Get visual cell positions from selected cells using coordinate manager
   * 🔧 KEY FIX: Use coordinator for positions, not DOM queries
   */
  private getVisualCellPositions(selectedCells: Set<string>): VisualCellPosition[] {
    const visualPositions: VisualCellPosition[] = [];

    fileLog.info('🎨 Getting visual cell positions from coordinator', {
      selectedCount: selectedCells.size,
      coordinatorVersion: this.coordinateManager.getVersion()
    });

    selectedCells.forEach(cellId => {
      const [rowId, columnId] = cellId.split(':');

      // 🔧 Use coordinator for cell position (single source of truth)
      const coordPosition = this.coordinateManager.getCellPosition(rowId, columnId);

      if (coordPosition) {
        // Get column width from coordinator
        const columnWidth = this.coordinateManager.getColumnWidth(columnId);

        const visualPos: VisualCellPosition = {
          cellKey: cellId,
          x: coordPosition.x,
          y: coordPosition.y,
          width: columnWidth,
          height: ROW_HEIGHT
        };

        fileLog.debug('📍 Cell position from coordinator', {
          cellId,
          x: coordPosition.x,
          y: coordPosition.y,
          width: columnWidth,
          coordinatorVersion: this.coordinateManager.getVersion()
        });

        visualPositions.push(visualPos);
      } else {
        fileLog.warn('❌ Cell position not found in coordinator', { cellId, rowId, columnId });
      }
    });

    fileLog.info('✅ Visual positions from coordinator', {
      cellCount: selectedCells.size,
      positionsFound: visualPositions.length
    });

    return visualPositions;
  }
  
  /**
   * Get cell position for editing overlay
   */
  private getCellPosition(rowId: string, columnId: string): { x: number; y: number; width: number; height: number } | null {
    // PERFORMANCE FIX: Use cached scroll position instead of DOM read
    const cachedViewport = PositionEvents.getViewportCache();
    const currentScrollLeft = cachedViewport.scrollLeft || 0;

    const cellKey = `${rowId}:${columnId}`;

    // Try DOM position first (highest accuracy)
    const domPositions = domPositions$.cellPositions.get();
    const domPosition = domPositions.get(cellKey);

    if (domPosition && domPosition.isVisible) {
      fileLog.debug('Using cached DOM position', { cellKey });
      return {
        x: domPosition.x,
        y: domPosition.y,
        width: domPosition.width,
        height: domPosition.height
      };
    }

    // DIRECT SOLUTION: Calculate position directly from DOM
    fileLog.debug('DOM position not cached, calculating directly', { cellKey });

    const cell = this.container.querySelector(`[data-row-id="${rowId}"][data-column-id="${columnId}"]`) as HTMLElement;
    if (cell) {
      // Find the actual scrollable container that contains this cell
      let viewportContainer = cell.closest('.vibegridx-viewport') as HTMLElement;
      if (!viewportContainer) {
        // Try finding from the main container
        viewportContainer = this.container.querySelector('.vibegridx-viewport') as HTMLElement;
      }
      if (!viewportContainer) {
        // Fallback: find the scrollable parent of the cell
        let parent = cell.parentElement;
        while (parent && parent !== this.container) {
          const overflow = getComputedStyle(parent).overflow;
          if (overflow === 'auto' || overflow === 'scroll' || overflow === 'hidden') {
            viewportContainer = parent;
            break;
          }
          parent = parent.parentElement;
        }
      }
      if (!viewportContainer) {
        fileLog.error('❌ No viewport container found - using main container', {
          cellKey,
          containerClass: this.container.className,
          cellParentClass: cell.parentElement?.className
        });
        viewportContainer = this.container;
      }

      if (viewportContainer) {
        const cellRect = cell.getBoundingClientRect();
        const viewportRect = viewportContainer.getBoundingClientRect();

        // Calculate viewport-relative position
        const relativeX = cellRect.left - viewportRect.left;
        const relativeY = cellRect.top - viewportRect.top;

        // CRITICAL: Add scroll offset to get absolute position within scrollable content
        // This matches the logic in dom-position-state.ts:406-407
        const scrollLeft = viewportContainer.scrollLeft || 0;
        const scrollTop = viewportContainer.scrollTop || 0;

        const directPosition = {
          x: relativeX + scrollLeft,
          y: relativeY + scrollTop,
          width: cellRect.width,
          height: cellRect.height
        };

        fileLog.debug('Calculated cell position from DOM', { cellKey, position: directPosition });
        return directPosition;
      }
    }

    // No DOM position means cell is not visible - overlays only render for visible cells
    fileLog.debug('Cell not visible in DOM, no overlay needed', {
      cellKey,
      rowId,
      columnId
    });

    return null;
  }

  /**
   * Get viewport info
   */
  private getViewportInfo(): ViewportInfo {
    // PERFORMANCE FIX: Use cached viewport measurements instead of DOM reads
    const cachedViewport = PositionEvents.getViewportCache();

    // If cache is fresh, use it directly
    if (cachedViewport.containerRect && cachedViewport.lastViewportUpdate > 0) {
        fileLog.debug('Using cached viewport measurements');

      return {
        start: 0,
        end: 0,
        height: cachedViewport.clientHeight,
        width: cachedViewport.clientWidth,
        scrollTop: cachedViewport.scrollTop,
        scrollLeft: cachedViewport.scrollLeft,
        viewportWidth: cachedViewport.clientWidth,
        viewportHeight: cachedViewport.clientHeight,
        itemHeight: 40
      };
    }

    // Fallback to DOM reads if cache is empty (should be rare)
    fileLog.debug('Viewport cache miss, reading from DOM');
    const scrollContainer = this.bodyContainer || this.container.querySelector('.vibegridx-body-container') as HTMLElement || this.container;

    let scrollTop = 0;
    let scrollLeft = 0;
    let viewportWidth = 0;
    let viewportHeight = 0;

    try {
      scrollTop = scrollContainer.scrollTop || 0;
      scrollLeft = scrollContainer.scrollLeft || 0;
      viewportWidth = scrollContainer.clientWidth || 0;
      viewportHeight = scrollContainer.clientHeight || 0;
    } catch (e) {
      fileLog.debug('Failed to get viewport measurements from DOM', e);
    }

    return {
      start: 0,
      end: 0,
      height: viewportHeight,
      width: viewportWidth,
      scrollTop,
      scrollLeft,
      viewportWidth,
      viewportHeight,
      itemHeight: 40
    };
  }
  
  /**
   * Set header container reference
   */
  setHeaderContainer(headerContainer: HTMLElement | null): void {
    this.headerContainer = headerContainer;
  }
  
  /**
   * Set body container reference
   */
  setBodyContainer(bodyContainer: HTMLElement | null): void {
    this.bodyContainer = bodyContainer;
  }

  /**
   * Get EditSessionManager for use by InteractionCoordinator
   */
  getEditSessionManager(): EditSessionManager {
    return this.editSessionManager;
  }

  /**
   * Handle fill complete - copy values from selected cells to fill target cells
   */
  private async handleFillComplete(fillCells: Set<string>): Promise<void> {
    fileLog.info('📋 Fill complete triggered', { fillCellsCount: fillCells.size });

    if (!this.onEntityUpdate) {
      fileLog.warn('📋 Fill skipped - no update callback available');
      return;
    }

    const selectedCells = this.interactionStore.selectedCells;
    if (selectedCells.size === 0) {
      fileLog.warn('📋 Fill skipped - no source cells selected');
      return;
    }

    const rows = this.getProcessedRows();
    const columns = this.tableCoreStore.columns;

    // Build row and column indices for sorting
    const rowIdToIndex = new Map<string, number>();
    rows.forEach((row, index) => rowIdToIndex.set(row.id, index));
    const columnIdToIndex = new Map<string, number>();
    columns.forEach((col: any, index: number) => columnIdToIndex.set(col.id, index));

    // Sort selected cells by row, then by column to establish pattern order
    const sortedSelectedCells = Array.from(selectedCells).sort((a, b) => {
      const [rowIdA, colIdA] = a.split(':');
      const [rowIdB, colIdB] = b.split(':');
      const rowIndexA = rowIdToIndex.get(rowIdA) ?? Infinity;
      const rowIndexB = rowIdToIndex.get(rowIdB) ?? Infinity;
      if (rowIndexA !== rowIndexB) {
        return rowIndexA - rowIndexB;
      }
      const colIndexA = columnIdToIndex.get(colIdA) ?? Infinity;
      const colIndexB = columnIdToIndex.get(colIdB) ?? Infinity;
      return colIndexA - colIndexB;
    });

    // Extract ALL source values in pattern order (not just first per column)
    // Group by column for pattern matching
    const sourceValuesByColumn = new Map<string, any[]>(); // columnId -> array of values
    sortedSelectedCells.forEach(cellId => {
      const [rowId, columnId] = cellId.split(':');
      const row = rows.find(r => r.id === rowId);

      if (row) {
        const value = (row as any).data ? (row as any).data[columnId] : row[columnId];
        if (!sourceValuesByColumn.has(columnId)) {
          sourceValuesByColumn.set(columnId, []);
        }
        sourceValuesByColumn.get(columnId)!.push(value);
      }
    });

    // Calculate the pattern length (number of unique rows in selection)
    const selectedRowIds = new Set(sortedSelectedCells.map(cellId => cellId.split(':')[0]));
    const patternLength = selectedRowIds.size;

    fileLog.info('📋 Fill source pattern extracted', {
      patternLength,
      columnCount: sourceValuesByColumn.size,
      columns: Array.from(sourceValuesByColumn.keys()),
      totalSourceCells: sortedSelectedCells.length
    });

    // Sort fill cells by row, then by column to match pattern application order
    const sortedFillCells = Array.from(fillCells).sort((a, b) => {
      const [rowIdA, colIdA] = a.split(':');
      const [rowIdB, colIdB] = b.split(':');
      const rowIndexA = rowIdToIndex.get(rowIdA) ?? Infinity;
      const rowIndexB = rowIdToIndex.get(rowIdB) ?? Infinity;
      if (rowIndexA !== rowIndexB) {
        return rowIndexA - rowIndexB;
      }
      const colIndexA = columnIdToIndex.get(colIdA) ?? Infinity;
      const colIndexB = columnIdToIndex.get(colIdB) ?? Infinity;
      return colIndexA - colIndexB;
    });

    // Apply source values to fill target cells with pattern repetition
    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0;

    // Track which fill row we're on to calculate pattern index
    let currentFillRow = '';
    let fillRowIndex = 0;

    for (const fillCellId of sortedFillCells) {
      const [rowId, columnId] = fillCellId.split(':');

      // Track row changes to calculate pattern index
      if (currentFillRow !== rowId) {
        if (currentFillRow !== '') {
          fillRowIndex++;
        }
        currentFillRow = rowId;
      }

      // Only fill if we have source values for this column
      if (sourceValuesByColumn.has(columnId)) {
        const columnValues = sourceValuesByColumn.get(columnId)!;

        // Use modulo to repeat pattern cyclically
        const patternIndex = fillRowIndex % patternLength;
        const newValue = columnValues[Math.min(patternIndex, columnValues.length - 1)];

        // Get current value of target cell
        const targetRow = rows.find(r => r.id === rowId);
        const currentValue = targetRow
          ? ((targetRow as any).data ? (targetRow as any).data[columnId] : targetRow[columnId])
          : undefined;

        // Skip update if value is unchanged
        if (currentValue === newValue) {
          skippedCount++;
          continue;
        }

        try {
          if (this.onEntityUpdate) {
            await this.onEntityUpdate(rowId, { [columnId]: newValue });
            successCount++;
          }
        } catch (error) {
          errorCount++;
          fileLog.error('📋 Fill failed for cell', {
            cellId: fillCellId,
            error: error instanceof Error ? error.message : error
          });
        }
      }
    }

    fileLog.info('📋 Fill operation completed', {
      successCount,
      errorCount,
      skippedCount,
      totalAttempted: fillCells.size,
      patternLength
    });

    // Expand selection to include all filled cells (original + filled)
    if (successCount > 0) {
      runInAction(() => {
        const newSelection = new Set([...selectedCells, ...fillCells]);
        this.interactionStore.selectedCells = newSelection;
        fileLog.info('📋 Selection expanded to include filled cells', {
          originalCount: selectedCells.size,
          filledCount: fillCells.size,
          newSelectionCount: newSelection.size
        });
      });
    }
  }

  /**
   * Clean up all overlays
   */
  destroy(): void {
    fileLog.info('🧹 Destroying overlay system'); // Keep: lifecycle

    // Dispose of MobX reactions
    this.disposers.forEach(dispose => dispose());
    this.disposers = [];

    // Clean up RAF to prevent memory leaks
    if (this.updateSelectionRAF !== null) {
      cancelAnimationFrame(this.updateSelectionRAF);
      this.updateSelectionRAF = null;
    }

    // Clear caches
    this.lastSelectionString = '';
    this.lastCoordinateMappingVersion = -1;

    // Clear selections using interaction-state
    this.interactionStore.clearSelection();
    
    if (this.canvasOverlay) {
      this.canvasOverlay.destroy();
      this.canvasOverlay = null;
    }
    
    if (this.editingOverlay) {
      this.editingOverlay.hide();
      this.editingOverlay = null;
    }
    
    if (this.contextMenu) {
      this.contextMenu.destroy();
      this.contextMenu = null;
    }

    if (this.columnDragOverlay) {
      this.columnDragOverlay.destroy();
      this.columnDragOverlay = null;
    }

    // Note: FillHandleLayer cleanup handled by CanvasOverlayDOM.destroy()

    // Selection cleanup not needed - handled by interaction-state

    fileLog.info('✅ Overlay system destroyed'); // Keep: lifecycle
  }
  
  /**
   * Get canvas overlay instance (for direct access when needed)
   */
  getCanvasOverlay(): CanvasOverlayDOM | null {
    return this.canvasOverlay;
  }
  
  /**
   * Get selection manager instance
   */
  // Selection is managed through tableInteraction$ - no separate manager needed
  
  /**
   * Get editing overlay instance
   */
  getEditingOverlay(): EditingOverlay | null {
    return this.editingOverlay;
  }
  
  /**
   * Get context menu instance
   */
  getContextMenu(): ContextMenuManager | null {
    return this.contextMenu;
  }

  /**
   * Get column drag overlay instance
   */
  getColumnDragOverlay(): ColumnDragOverlayDOM | null {
    return this.columnDragOverlay;
  }

  /**
   * Update coordinate mapping for all overlays
   * This method is called by SimplePassiveRenderer when coordinates change
   */
  updateCoordinateMapping(mapping: CoordinateMapping): void {
    // PERFORMANCE: Deduplicate coordinate mapping updates
    if (this.lastCoordinateMappingVersion === mapping.version) {
      fileLog.debug('🔄 Coordinate mapping unchanged, skipping update', {
        version: mapping.version,
        lastVersion: this.lastCoordinateMappingVersion
      });
      return;
    }

    this.lastCoordinateMappingVersion = mapping.version;

    // Store the mapping so we can pass it when overlays are lazy-created
    this.coordinateMapping = mapping;

    fileLog.debug('[RESIZE-PREVIEW] 🔄 OverlayManager: Coordinate mapping updated', {
      version: mapping.version,
      rowCount: mapping.rows.length,
      columnCount: mapping.columns.length,
      storedMapping: !!this.coordinateMapping
    });

    // Delegate to canvas overlay which handles all sub-overlays
    if (this.canvasOverlay) {
      fileLog.debug('[RESIZE-PREVIEW] 📍 Passing mapping to CanvasOverlay');
      this.canvasOverlay.updateCoordinateMapping(mapping);
    }

    // Update column drag overlay
    if (this.columnDragOverlay) {
      this.columnDragOverlay.updateCoordinateMapping(mapping);
    }

    // Note: FillHandleLayer coordinate mapping handled by CanvasOverlayDOM
  }
}
