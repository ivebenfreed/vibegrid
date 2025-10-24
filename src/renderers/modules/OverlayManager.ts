/**
 * OverlayManager - Centralized management of all overlay components for VibeGrid
 * Handles canvas overlay, selection manager, editing overlay, and context menu
 */

import { createLogger } from '@/lib/logging';
import { runInAction, reaction } from 'mobx';
import { CanvasOverlayDOM } from '../../overlays/CanvasOverlayDOM';
import { EditingOverlay } from '../../overlays/EditingOverlay';
import { ContextMenuManager } from '../../components/ContextMenu';
import { ColumnDragOverlayDOM } from '../../overlays/ColumnDragOverlayDOM';
// SelectionManager functionality consolidated into interaction-state
import type { TableCoreStore } from '../../stores/TableCoreStore';
import type { InteractionStore } from '../../stores/InteractionStore';
import type { ViewportInfo } from '../../types';
import type { VisualCellPosition } from '../../overlays/OverlayTypes';

// New hybrid coordinate system imports
import { PositionEvents, domPositions$, positionTracker } from '../../stores/dom-position-state';
import { virtualCellPosition$ } from '../../virtualization/VirtualScrollManager';
import { GRID_DIMENSIONS } from '../../constants/grid-dimensions';
import type { CoordinateMapping } from '../../coordinates/VibeGridXCoordinateManager';

// Re-export CoordinateMapping for consumers
export type { CoordinateMapping };

const fileLog = createLogger('components/custom/vibegrid/renderers/modules/OverlayManager.ts');

// Use centralized dimensions from the new system
const ROW_HEIGHT = GRID_DIMENSIONS.ROW_HEIGHT;
const HEADER_HEIGHT = GRID_DIMENSIONS.HEADER_HEIGHT;

export interface OverlayManagerOptions {
  container: HTMLElement;
  tableCoreStore: TableCoreStore;
  interactionStore: InteractionStore;
  enableSelectionColumn?: boolean;
  headerContainer?: HTMLElement | null;
  bodyContainer?: HTMLElement | null;
  getProcessedRows: () => any[];
}


export class OverlayManager {
  private container: HTMLElement;
  private tableCoreStore: TableCoreStore;
  private interactionStore: InteractionStore;
  private enableSelectionColumn: boolean;
  private headerContainer: HTMLElement | null;
  private bodyContainer: HTMLElement | null;
  private getProcessedRows: () => any[];
  
  // Overlay instances
  private canvasOverlay: CanvasOverlayDOM | null = null;
  // Selection now managed through tableInteraction$ observable
  private editingOverlay: EditingOverlay | null = null;
  private contextMenu: ContextMenuManager | null = null;
  private columnDragOverlay: ColumnDragOverlayDOM | null = null;
  // Note: FillHandleLayer is managed by CanvasOverlayDOM, not created here
  
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
    this.enableSelectionColumn = options.enableSelectionColumn ?? false;
    this.headerContainer = options.headerContainer || null;
    this.bodyContainer = options.bodyContainer || null;
    this.getProcessedRows = options.getProcessedRows;

    this.initOverlays();
  }
  
  /**
   * Initialize all overlay components
   */
  private initOverlays(): void {
    fileLog.info('🎨 Initializing overlay system');
    
    // Create canvas overlay
    this.canvasOverlay = new CanvasOverlayDOM(
      {
        selectionColor: 'rgba(59, 130, 246, 0.1)',
        selectionBorderColor: 'rgb(59, 130, 246)',
        selectionBorderWidth: 2,
        cellHeight: ROW_HEIGHT,
        cellWidth: 150 // Default width, updated by coordinate mapping
      },
      (event) => {
        fileLog.info('📋 Canvas overlay event:', event);
        // Handle fill events from the overlay system
      }
    );
    
    // Canvas overlay will be initialized in initializeOverlay() method
    // after DOM is ready
    
    // Selection is now managed through tableInteraction$ observable
    // Visual updates can be done via tableInteraction$.updateCellSelectionVisuals()
    
    // Create editing overlay
    this.editingOverlay = new EditingOverlay(this.container, {
      interactionStore: this.interactionStore,
      onCommit: async (value) => {
        await this.interactionStore.saveEdit(value);
      },
      onCancel: () => {
        this.interactionStore.cancelEdit();
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

    fileLog.info('✅ Overlay system initialized (CanvasOverlay handles fill handle & resize preview)');
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
            // Handle selection updates
            if (selectionChanged) {
              if (state.selectedCells.size > 0) {
                this.performCanvasSelectionUpdate(state.selectedCells);
              } else {
                // Clear selection overlay when no cells selected
                if (this.canvasOverlay) {
                  this.canvasOverlay.updateSelectionWithVisualPositions([]);
                  this.canvasOverlay.hideFillHandle();
                }
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

                    fileLog.info('🔍 REACTIVE: Showing editing overlay (consolidated)', {
                      cellId: state.editingCell,
                      position,
                      value: actualValue
                    });

                    this.editingOverlay.showAt(position, cell, column, actualValue);
                  }
                }
              } else if (!state.isEditing && this.editingOverlay) {
                // Hide editing overlay
                fileLog.info('🔍 REACTIVE: Hiding editing overlay (consolidated)');
                this.editingOverlay.hide();
              }
            }

            // Handle clipboard overlay updates (independent of selection)
            if (clipboardChanged) {
              if (state.clipboard && state.clipboard.copiedCells.size > 0 && this.canvasOverlay) {
                const clipboardState = {
                  copiedCells: state.clipboard.copiedCells,
                  isCut: state.clipboard.operation === 'cut'
                };
                fileLog.info('📋 REACTIVE: Updating clipboard overlay', {
                  operation: state.clipboard.operation,
                  cellCount: state.clipboard.copiedCells.size,
                  copiedCells: Array.from(state.clipboard.copiedCells)
                });

                // Get visual positions for clipboard cells (same approach as selection)
                const clipboardVisualCells = this.getVisualCellPositions(Array.from(state.clipboard.copiedCells));
                this.canvasOverlay.updateClipboardWithVisualPositions(clipboardVisualCells, clipboardState.isCut);
              } else if (this.canvasOverlay) {
                // Clear clipboard overlay only when clipboard is explicitly null
                fileLog.info('📋 REACTIVE: Clearing clipboard overlay');
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
              const clipboardVisualCells = this.getVisualCellPositions(Array.from(state.clipboard.copiedCells));
              this.canvasOverlay.updateClipboardWithVisualPositions(clipboardVisualCells, clipboardState.isCut);
            }

            // Handle column resize preview
            if (state.columnResize) {
              fileLog.info('[RESIZE-PREVIEW] 📏 REACTIVE: Column resize detected', {
                hasCanvasOverlay: !!this.canvasOverlay,
                isInitialized: this.canvasOverlay?.isInitialized,
                columnId: state.columnResize.columnId,
                newWidth: state.columnResize.newWidth,
                isResizing: state.columnResize.isResizing
              });

              if (this.canvasOverlay) {
                this.canvasOverlay.updateColumnResizePreview(state.columnResize);
                fileLog.info('[RESIZE-PREVIEW] ✅ Called canvasOverlay.updateColumnResizePreview');
              } else {
                fileLog.warn('[RESIZE-PREVIEW] ⚠️ No canvasOverlay available!');
              }
            } else if (this.canvasOverlay) {
              // Clear resize preview
              fileLog.info('[RESIZE-PREVIEW] 🧹 Clearing resize preview');
              this.canvasOverlay.updateColumnResizePreview(null);
            }
          });
        }
      )
    );

    fileLog.info('✅ Consolidated reactive observer established - eliminated multiple observer chain');
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
      fileLog.info('🎨 Canvas overlay initialized in viewport container');

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
      fileLog.info('✅ DOM position tracking initialized');
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
    console.log('🔍 getCellValue DETAILED DEBUG:', {
      targetRowId: rowId,
      targetColumnId: columnId,
      totalRows: processedRows?.length || 0,
      firstFewRowIds: processedRows?.slice(0, 3).map((r: any) => r.id) || [],
      allRowIds: processedRows?.map((r: any) => r.id) || [],
      sampleRowStructure: processedRows?.[0] ? Object.keys(processedRows[0]).slice(0, 8) : 'no rows'
    });

    const row = processedRows.find((r: any) => r.id === rowId);

    if (!row) {
      console.log('❌ getCellValue: Row NOT found!', {
        targetRowId: rowId,
        availableRowIds: processedRows?.map((r: any) => r.id) || []
      });
      return '';
    }

    const value = row[columnId];

    console.log('✅ getCellValue: Row found, extracting value', {
      targetRowId: rowId,
      foundRowId: row.id,
      targetColumnId: columnId,
      extractedValue: value,
      rowKeys: Object.keys(row).slice(0, 8),
      hasTargetColumn: columnId in row
    });

    fileLog.info('📄 Getting cell value for editing', {
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
      fileLog.info('[RESIZE] 🎨 OverlayManager.updateColumnResizePreview called', {
        resizeState,
        canvasOverlayExists: !!this.canvasOverlay,
        isInitialized: this.canvasOverlay?.isInitialized
      });
    }

    // Ensure overlay is initialized
    if (!this.canvasOverlay?.isInitialized) {
      if (resizeState?.isResizing) {
        fileLog.info('[RESIZE] 🎨 Initializing overlay for resize preview');
      }
      this.initializeOverlay();
    }

    if (this.canvasOverlay && this.canvasOverlay.isInitialized) {
      if (resizeState?.isResizing) {
        fileLog.info('[RESIZE] 🎨 Passing resize state to canvasOverlay');
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
      this.contextMenu.show(options);
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
   * Get visual cell positions from selected cells using hybrid coordinate system
   */
  private getVisualCellPositions(selectedCells: Set<string>): VisualCellPosition[] {
    const visualPositions: VisualCellPosition[] = [];

    // PERFORMANCE FIX: Use cached viewport measurements instead of DOM reads
    const cachedViewport = PositionEvents.getViewportCache();
    const currentScrollLeft = cachedViewport.scrollLeft || 0;
    const currentScrollTop = cachedViewport.scrollTop || 0;
    const viewportWidth = cachedViewport.clientWidth || 0;
    const columns = this.tableCoreStore.columns;

    // Keep scrollContainer reference for diagnostic logging only
    const scrollContainer = this.bodyContainer || this.container.querySelector('.vibegridx-body-container') as HTMLElement || this.container;

    // PERFORMANCE: Sample diagnostic logging (10% of calls)
    if (Math.random() < 0.1) {
      fileLog.debug('🎨 DIAGNOSTIC: Getting visual cell positions with full context', {
        selectedCount: selectedCells.size,
        currentScrollLeft,
        currentScrollTop,
        viewportWidth,
        totalColumns: columns.length,
        scrollContainer: {
          className: scrollContainer.className,
          scrollWidth: scrollContainer.scrollWidth,
          clientWidth: scrollContainer.clientWidth
        }
      });
    }

    selectedCells.forEach(cellId => {
      // PERFORMANCE: Sample per-cell diagnostic logging (reduce from 100% to 20% of cells)
      if (Math.random() < 0.2) {
        fileLog.debug('🔍 DIAGNOSTIC: Processing cellId in getVisualCellPositions', {
          cellId,
          cellIdType: typeof cellId,
          cellIdValue: cellId
        });
      }

      const [rowId, columnId] = cellId.split(':');

      // GET COLUMN INFORMATION
      const column = columns.find((c: any) => c.id === columnId);
      const columnIndex = columns.findIndex((c: any) => c.id === columnId);

      // PERFORMANCE: Sample column analysis logging (20% of calls)
      if (Math.random() < 0.2) {
        fileLog.debug('🔍 DIAGNOSTIC: Column analysis', {
          rowId,
          columnId,
          rowIdType: typeof rowId,
          columnIdType: typeof columnId,
          columnIndex,
          columnExists: !!column,
          columnData: column ? {
            id: column.id,
            title: column.title,
            width: column.width,
            type: column.type
          } : null
        });
      }

      // Calculate expected column X position based on column widths
      let expectedColumnX = 0;
      for (let i = 0; i < columnIndex; i++) {
        const prevColumn = columns[i];
        expectedColumnX += (prevColumn.width || 150); // Use column width or default
      }

      // CRITICAL FIX: Account for scroll position in expected calculation
      const expectedColumnXScrollAdjusted = expectedColumnX - currentScrollLeft;

      fileLog.debug('🔍 DIAGNOSTIC: Expected column position calculation with scroll adjustment', {
        columnId,
        columnIndex,
        expectedColumnX, // Absolute position in full table
        expectedColumnXScrollAdjusted, // Position relative to current viewport
        currentScrollLeft,
        scrollAdjustment: currentScrollLeft,
        currentColumnWidth: column?.width || 150,
        calculationBreakdown: columns.slice(0, columnIndex).map((c: any, i: number) => ({
          index: i,
          id: c.id,
          width: c.width || 150
        }))
      });

      // Use the hybrid getCellPosition method
      const position = this.getCellPosition(rowId, columnId);

      if (position) {
        const visualPos: VisualCellPosition = {
          cellKey: cellId,
          x: position.x,
          y: position.y,
          width: position.width,
          height: position.height
        };
        visualPositions.push(visualPos);

        // CRITICAL DIAGNOSTIC: Compare expected vs actual position using scroll-adjusted expected value
        const positionDiscrepancy = Math.abs(position.x - expectedColumnXScrollAdjusted);
        const isPositionAccurate = positionDiscrepancy < 5; // Allow 5px tolerance

        fileLog.debug('🎯 DIAGNOSTIC: Position analysis for selection overlay', {
          requestedCell: cellId,
          columnId,
          columnIndex,
          actualPosition: { x: position.x, y: position.y, width: position.width, height: position.height },
          expectedColumnX, // Absolute position
          expectedColumnXScrollAdjusted, // Scroll-adjusted position
          positionDiscrepancy, // Now using scroll-adjusted comparison
          isPositionAccurate,
          positionAnalysis: {
            expectedAbsolute: expectedColumnX,
            expectedViewportRelative: expectedColumnXScrollAdjusted,
            actualViewportRelative: position.x,
            discrepancyFromScrollAdjusted: positionDiscrepancy,
            discrepancyFromAbsolute: Math.abs(position.x - expectedColumnX)
          },
          context: {
            scrollLeft: currentScrollLeft,
            viewportWidth,
            isLastColumn: columnIndex === columns.length - 1,
            isScrolledRight: currentScrollLeft > 0
          }
        });
      } else {
        fileLog.warn('❌ DIAGNOSTIC: Could not find position for cell via hybrid system', {
          cellId,
          rowId,
          columnId,
          expectedColumnX,
          expectedColumnXScrollAdjusted,
          columnIndex,
          scrollContext: {
            scrollLeft: currentScrollLeft,
            viewportWidth,
            scrollWidth: scrollContainer.scrollWidth
          }
        });
      }
    });

    fileLog.info('✅ Visual positions calculated via hybrid system', {
      inputCells: selectedCells.size,
      outputPositions: visualPositions.length
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

    // Keep scrollContainer reference for diagnostic logging only
    const scrollContainer = this.bodyContainer || this.container.querySelector('.vibegridx-body-container') as HTMLElement || this.container;

    fileLog.debug('🎯 DIAGNOSTIC: getCellPosition called with full context', {
      rowId,
      columnId,
      rowIdType: typeof rowId,
      columnIdType: typeof columnId,
      rowIdValue: rowId,
      columnIdValue: columnId,
      currentScrollLeft,
      scrollContainerClass: scrollContainer.className
    });

    const cellKey = `${rowId}:${columnId}`;

    fileLog.debug('🎯 DIAGNOSTIC: Getting cell position with scroll context', {
      cellKey,
      rowId,
      columnId,
      scrollLeft: currentScrollLeft
    });

    // Try DOM position first (highest accuracy)
    const domPositions = domPositions$.cellPositions;
    const domPosition = domPositions.get(cellKey);

    fileLog.debug('🎯 HYBRID: DOM position check', {
      cellKey,
      hasDomPosition: !!domPosition,
      isVisible: domPosition?.isVisible,
      domPosition: domPosition ? { x: domPosition.x, y: domPosition.y, width: domPosition.width, height: domPosition.height } : null
    });

    if (domPosition && domPosition.isVisible) {
      fileLog.info('✅ Using DOM position', {
        cellKey,
        position: { x: domPosition.x, y: domPosition.y, width: domPosition.width, height: domPosition.height },
        source: 'dom'
      });

      return {
        x: domPosition.x,
        y: domPosition.y,
        width: domPosition.width,
        height: domPosition.height
      };
    }

    // DIRECT SOLUTION: Calculate position directly from DOM
    fileLog.warn('🔄 DOM position not cached, calculating directly', { cellKey });

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

      fileLog.debug('🔍 DIAGNOSTIC: Container debug info', {
        cellKey,
        columnId,
        foundCell: !!cell,
        foundViewport: !!viewportContainer,
        containerClass: this.container.className,
        viewportClass: viewportContainer?.className,
        cellParentClass: cell.parentElement?.className,
        isViewportSameAsContainer: viewportContainer === this.container,
        scrollingContext: {
          containerScrollLeft: this.container.scrollLeft,
          viewportScrollLeft: viewportContainer?.scrollLeft,
          globalScrollLeft: currentScrollLeft,
          shouldUseViewportForCalculation: !!viewportContainer && viewportContainer !== this.container
        }
      });

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

        fileLog.debug('✅ DIAGNOSTIC: Using direct DOM calculation with scroll analysis', {
          cellKey,
          columnId,
          position: directPosition,
          source: 'direct',
          rawCellRect: {
            left: cellRect.left,
            top: cellRect.top,
            right: cellRect.right,
            width: cellRect.width,
            height: cellRect.height
          },
          rawViewportRect: {
            left: viewportRect.left,
            top: viewportRect.top,
            right: viewportRect.right,
            width: viewportRect.width,
            height: viewportRect.height
          },
          calculation: {
            xCalc: `${cellRect.left} - ${viewportRect.left} = ${cellRect.left - viewportRect.left}`,
            yCalc: `${cellRect.top} - ${viewportRect.top} = ${cellRect.top - viewportRect.top}`,
            cellVisibleWidth: Math.min(cellRect.right, viewportRect.right) - Math.max(cellRect.left, viewportRect.left),
            isPartiallyVisible: cellRect.right > viewportRect.right || cellRect.left < viewportRect.left,
            isFullyVisible: cellRect.left >= viewportRect.left && cellRect.right <= viewportRect.right
          },
          scrollDiagnostic: {
            scrollLeft: currentScrollLeft,
            cellAbsoluteLeft: cellRect.left,
            cellAbsoluteRight: cellRect.right,
            viewportAbsoluteLeft: viewportRect.left,
            viewportAbsoluteRight: viewportRect.right,
            cellRelativeToViewport: cellRect.left - viewportRect.left,
            isCellOutsideViewport: cellRect.right < viewportRect.left || cellRect.left > viewportRect.right
          }
        });

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
      fileLog.debug('📊 VIEWPORT CACHE: Using cached viewport measurements for getViewportInfo', {
        scrollLeft: cachedViewport.scrollLeft,
        scrollTop: cachedViewport.scrollTop,
        viewportWidth: cachedViewport.clientWidth,
        viewportHeight: cachedViewport.clientHeight,
        cacheAge: Date.now() - cachedViewport.lastViewportUpdate
      });

      return {
        scrollTop: cachedViewport.scrollTop,
        scrollLeft: cachedViewport.scrollLeft,
        viewportWidth: cachedViewport.clientWidth,
        viewportHeight: cachedViewport.clientHeight
      };
    }

    // Fallback to DOM reads if cache is empty (should be rare)
    fileLog.warn('📊 VIEWPORT CACHE: Cache miss, falling back to DOM reads');
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
      scrollTop,
      scrollLeft,
      viewportWidth,
      viewportHeight
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
   * Clean up all overlays
   */
  destroy(): void {
    fileLog.info('🧹 Destroying overlay system');

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

    fileLog.info('✅ Overlay system destroyed');
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

    fileLog.info('[RESIZE-PREVIEW] 🔄 OverlayManager: Coordinate mapping updated', {
      version: mapping.version,
      rowCount: mapping.rows.length,
      columnCount: mapping.columns.length,
      storedMapping: !!this.coordinateMapping
    });

    // Delegate to canvas overlay which handles all sub-overlays
    if (this.canvasOverlay) {
      fileLog.info('[RESIZE-PREVIEW] 📍 Passing mapping to CanvasOverlay');
      this.canvasOverlay.updateCoordinateMapping(mapping);
    }

    // Update column drag overlay
    if (this.columnDragOverlay) {
      this.columnDragOverlay.updateCoordinateMapping(mapping);
    }

    // Note: FillHandleLayer coordinate mapping handled by CanvasOverlayDOM
  }
}
