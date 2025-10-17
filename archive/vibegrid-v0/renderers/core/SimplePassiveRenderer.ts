/**
 * SimplePassiveRenderer - Basic working table without overlays
 * 
 * This is a simplified version to get the basic table working first,
 * then we can add overlays back once we have the foundation working.
 */

import { observe } from '@legendapp/state';
import { log } from '@/logger';
import type { 
  TableCore$, 
  TableInteraction$, 
  TableViewport$ 
} from '../../stores/pure-observables';
// New modular architecture imports
import { ObserverManager, type ObserverManagerOptions } from './ObserverManager';
import { DOMElementFactory, type DOMElementFactoryOptions } from '../factories/DOMElementFactory';
import { HeaderRenderer, type HeaderRendererOptions } from '../components/HeaderRenderer';

// Phase 2 manager imports
import { CellRenderer } from '../managers/CellRenderer';
import { RowRenderer } from '../managers/RowRenderer';
import { ViewportManager } from '../managers/ViewportManager';
import { EventManager } from '../managers/EventManager';

// Existing modular components
import { OverlayManager, type CoordinateMapping } from '../modules/OverlayManager';
import { BadgeRenderer } from '../modules/BadgeRenderer';
import { CellFormatter } from '../modules/CellFormatter';
import { SelectionController } from '../modules/SelectionController';
import { KeyboardNavigationController } from '../modules/KeyboardNavigationController';
import { ScrollController } from '../modules/ScrollController';
import { GroupRenderer } from '../modules/GroupRenderer';
import { ColumnWidthManager } from '../modules/ColumnWidthManager';

// Utility imports
import type { ViewportInfo, TableRow } from '../../types';
import type { VisualCellPosition } from '../../overlays/OverlayTypes';
import { formatFieldForDisplay } from '@/server/dataforge/fields/display-formatters';
import { createDataLoadingStage$, createStageCallbacks } from '../../stores/data-loading-stages';

const fileLog = log('components/custom/vibegrid/renderers/core/SimplePassiveRenderer.ts');

const ROW_HEIGHT = 40;
const HEADER_HEIGHT = 48;

export interface SimplePassiveRendererOptions {
  container: HTMLElement;
  tableCore$: TableCore$;
  tableInteraction$: TableInteraction$;
  tableViewport$: TableViewport$;
  enableSelectionColumn?: boolean;
  bufferSize?: number;
  onEntityUpdate?: (rowId: string, updates: Record<string, any>) => Promise<void> | void;
  onBatchEntityUpdate?: (updates: Array<{ id: string; updates: Record<string, any> }>) => Promise<void> | void;
}

export class SimplePassiveRenderer {
  private container: HTMLElement;
  private viewport: HTMLElement | null = null;
  private headerContainer: HTMLElement | null = null;
  private headerViewport: HTMLElement | null = null;
  private bodyContainer: HTMLElement | null = null;
  private disposers: (() => void)[] = [];
  
  // Observable references
  private tableCore$: TableCore$;
  private tableInteraction$: TableInteraction$;
  private tableViewport$: TableViewport$;
  
  // Basic row management
  private activeRows: Map<string, HTMLElement> = new Map();
  private lastVisibleColumns: { start: number; end: number } | null = null;
  
  // Overlay management
  private overlayManager: OverlayManager | null = null;
  
  // Coordinate mapping (maintained locally but synced with overlay manager)
  private coordinateMapping: CoordinateMapping = {
    rows: [],
    columns: [],
    version: 0
  };
  
  // Scroll coordination
  private _scrollRAF: number | null = null;
  
  // Row range selection tracking - now handled by SelectionController
  // Keyboard navigation tracking - now handled by KeyboardNavigationController
  
  // UI element references
  private selectAllCheckbox: HTMLInputElement | null = null;
  
  // Smart cell system
  private dataLoadingStage$: any = null;
  private relationshipResolver$: Map<string, any> = new Map();
  private formattersReady: boolean = false;
  private universeSchema$: any = null;
  
  // Modular controllers
  private selectionController: SelectionController | null = null;
  private keyboardNavController: KeyboardNavigationController | null = null;
  private scrollController: ScrollController | null = null;
  private groupRenderer: GroupRenderer | null = null;
  private columnWidthManager: ColumnWidthManager | null = null;
  
  // New modular components (Phase 1 additions)
  private observerManager: ObserverManager | null = null;
  private domFactory: DOMElementFactory | null = null;
  private headerRenderer: HeaderRenderer | null = null;
  
  // Phase 2 manager additions
  private cellRenderer: CellRenderer | null = null;
  private rowRenderer: RowRenderer | null = null;
  private viewportManager: ViewportManager | null = null;
  private eventManager: EventManager | null = null;
  
  constructor(private options: SimplePassiveRendererOptions) {
    fileLog.info('🎯 SimplePassiveRenderer: Initializing');
    
    this.container = options.container;
    this.tableCore$ = options.tableCore$;
    this.tableInteraction$ = options.tableInteraction$;
    this.tableViewport$ = options.tableViewport$;
    
    this.initDOM();
    this.initControllers();
    this.initDOMFactory();
    this.initPhase2Managers();
    this.initOverlayManager();
    this.initHeaderRenderer();
    this.initObserverManager();
    this.postInitialization();
  }
  
  /**
   * Initialize DOM Element Factory
   */
  private initDOMFactory(): void {
    fileLog.info('🏭 Initializing DOM Element Factory');
    
    this.domFactory = new DOMElementFactory({
      tableInteraction$: this.tableInteraction$,
      tableCore$: this.tableCore$,
      selectionController: this.selectionController,
      enableSelectionColumn: this.options.enableSelectionColumn,
      onEntityUpdate: this.options.onEntityUpdate
    });
    
    fileLog.info('✅ DOM Element Factory initialized');
  }

  /**
   * Initialize modular controllers
   */
  private initControllers(): void {
    fileLog.info('🎮 Initializing modular controllers');
    
    // Initialize selection controller
    this.selectionController = new SelectionController({
      tableInteraction$: this.tableInteraction$,
      getProcessedRows: () => this.tableCore$.processedRows.get(),
      getVisibleColumns: () => {
        const columns = this.tableCore$.columns.get();
        const columnVisibility = this.tableCore$.columnVisibility.get();
        return columns.filter(col => columnVisibility[col.id] !== false);
      }
    });
    
    // Initialize keyboard navigation controller
    this.keyboardNavController = new KeyboardNavigationController({
      tableInteraction$: this.tableInteraction$,
      selectionController: this.selectionController,
      getProcessedRows: () => this.tableCore$.processedRows.get(),
      getVisibleColumns: () => {
        const columns = this.tableCore$.columns.get();
        const columnVisibility = this.tableCore$.columnVisibility.get();
        return columns.filter(col => columnVisibility[col.id] !== false);
      },
      container: this.container
    });

    // Initialize ColumnWidthManager
    this.columnWidthManager = new ColumnWidthManager({
      headerContainer: null, // Will be set after DOM initialization
      bodyContainer: null,   // Will be set after DOM initialization
      headerViewport: null   // Will be set after DOM initialization
    });

    // Scroll controller will be initialized after DOM is ready in postInitialization()
  }
  
  /**
   * Initialize Phase 2 managers
   */
  private initPhase2Managers(): void {
    fileLog.info('🚀 Initializing Phase 2 managers');
    
    // Initialize GroupRenderer first (needed by RowRenderer)
    this.groupRenderer = new GroupRenderer({
      tableCore$: this.tableCore$,
      tableInteraction$: this.tableInteraction$,
      domFactory: this.domFactory!,
      createElement: this.createElement.bind(this)
    });

    // Initialize CellRenderer (dependency for RowRenderer)
    this.cellRenderer = new CellRenderer({
      tableCore$: this.tableCore$,
      tableInteraction$: this.tableInteraction$,
      tableViewport$: this.tableViewport$,
      domFactory: this.domFactory!,
      keyboardNavController: this.keyboardNavController,
      container: this.container,
      onEntityUpdate: this.options.onEntityUpdate
    });
    
    // Initialize RowRenderer (depends on CellRenderer)
    this.rowRenderer = new RowRenderer({
      tableCore$: this.tableCore$,
      tableInteraction$: this.tableInteraction$,
      tableViewport$: this.tableViewport$,
      domFactory: this.domFactory!,
      cellRenderer: this.cellRenderer,
      selectionController: this.selectionController,
      enableSelectionColumn: this.options.enableSelectionColumn,
      createElement: this.createElement.bind(this)
    });
    
    // Initialize ViewportManager with the actual viewport element
    this.viewportManager = new ViewportManager({
      tableCore$: this.tableCore$,
      tableInteraction$: this.tableInteraction$,
      tableViewport$: this.tableViewport$,
      scrollController: this.scrollController,
      keyboardNavController: this.keyboardNavController,
      selectionController: this.selectionController,
      container: this.container,
      viewport: this.viewport!, // Pass the actual viewport element
      headerViewport: this.headerViewport!,
      bodyContainer: this.bodyContainer!,
      onViewportChange: () => this.renderBody(),
      createElement: this.createElement.bind(this)
    });
    
    // Initialize EventManager
    this.eventManager = new EventManager({
      tableCore$: this.tableCore$,
      tableInteraction$: this.tableInteraction$,
      tableViewport$: this.tableViewport$,
      container: this.container,
      onEntityUpdate: this.options.onEntityUpdate
    });
    
    fileLog.info('✅ Phase 2 managers initialized');
  }
  
  /**
   * Initialize overlay manager
   */
  private initOverlayManager(): void {
    fileLog.info('🎨 Initializing overlay manager');
    
    this.overlayManager = new OverlayManager({
      container: this.container,
      tableCore$: this.tableCore$,
      tableInteraction$: this.tableInteraction$,
      enableSelectionColumn: this.options.enableSelectionColumn,
      headerContainer: this.headerContainer,
      bodyContainer: this.bodyContainer,
      getProcessedRows: () => this.tableCore$.processedRows.get()
    });
    
    fileLog.info('✅ Overlay manager initialized');
  }

  /**
   * Initialize Observer Manager (replaces setupObservers)
   */
  private initObserverManager(): void {
    fileLog.info('🔍 Initializing Observer Manager');
    
    this.observerManager = new ObserverManager({
      tableCore$: this.tableCore$,
      tableInteraction$: this.tableInteraction$,
      tableViewport$: this.tableViewport$,
      overlayManager: this.overlayManager,
      
      // Callback functions for renderer actions
      onColumnsChanged: () => {
        this.renderHeader();
        this.renderBody();
      },
      onColumnVisibilityChanged: () => {
        this.renderHeader();
        this.renderBody();
      },
      onRowsChanged: () => {
        this.renderBody();
      },
      onViewportChanged: () => {
        this.handleViewportChange();
      },
      onSelectionChanged: (selectedCells: Set<string>) => {
        this.updateDOMSelectionClasses(selectedCells);
      },
      onEditingChanged: (editingCell: string | null, editValue?: string) => {
        // Editing is handled by overlay manager
      },
      onSelectAllCheckboxChanged: (state: { checked: boolean; indeterminate: boolean }) => {
        this.updateSelectAllCheckboxVisual(state);
      },
      onSortChanged: () => {
        this.updateSortIndicators();
      },
      onDragChanged: () => {
        // Drag changes are handled by overlay manager
      },
      
      // Column resize handlers
      updateHeaderCellWidth: (columnId: string, newWidth: number) => {
        this.updateHeaderCellWidth(columnId, newWidth);
      },
      updateBodyCellWidths: (columnId: string, newWidth: number) => {
        this.updateBodyCellWidths(columnId, newWidth);
      }
    });
    
    fileLog.info('✅ Observer Manager initialized');
  }

  /**
   * Initialize Header Renderer
   */
  private initHeaderRenderer(): void {
    if (!this.headerContainer || !this.domFactory) {
      fileLog.warn('🎨 Cannot initialize HeaderRenderer - missing dependencies');
      return;
    }
    
    fileLog.info('🎨 Initializing Header Renderer');
    
    this.headerRenderer = new HeaderRenderer({
      headerContainer: this.headerContainer,
      tableCore$: this.tableCore$,
      tableInteraction$: this.tableInteraction$,
      tableViewport$: this.tableViewport$,
      domFactory: this.domFactory,
      selectionController: this.selectionController,
      coordinateMapping: this.coordinateMapping,
      enableSelectionColumn: this.options.enableSelectionColumn,
      updateCoordinateMapping: (mapping: CoordinateMapping) => {
        this.coordinateMapping = mapping;
        this.overlayManager?.updateCoordinateMapping(mapping);
      }
    });
    
    fileLog.info('✅ Header Renderer initialized');
  }
  
  /**
   * Post-initialization setup after all managers are created
   */
  private postInitialization(): void {
    fileLog.info('🚀 Starting post-initialization');

    // Initialize viewport dimensions
    if (this.viewportManager) {
      this.viewportManager.initializeViewportDimensions();
      // ViewportManager scroll handling is replaced by enhanced ScrollController
    }

    // Initialize enhanced ScrollController with comprehensive event handling
    this.scrollController = new ScrollController({
      viewport: this.viewport!,
      headerViewport: this.headerViewport,
      container: this.container,
      onScroll: (scrollLeft: number, scrollTop: number) => {
        // Update viewport observable (triggers all reactive updates)
        this.tableViewport$.updateScroll(scrollTop, scrollLeft);
      },
      keyboardNavController: this.keyboardNavController,
      selectionController: this.selectionController,
      tableInteraction$: this.tableInteraction$
    });

    // Configure ColumnWidthManager with DOM containers
    if (this.columnWidthManager) {
      this.columnWidthManager.setContainers({
        headerContainer: this.headerContainer,
        bodyContainer: this.bodyContainer,
        headerViewport: this.headerViewport
      });
    }

    // Initialize overlay now that DOM is ready
    if (this.overlayManager) {
      this.overlayManager.initializeOverlay();
    }

    // Setup event handling via EventManager
    if (this.eventManager) {
      this.eventManager.setOverlayManager(this.overlayManager!);
      this.eventManager.setupEventHandling();
    }

    // Initial render
    this.renderHeader();
    this.renderBody();

    fileLog.info('✅ Post-initialization complete');
  }
  
  /**
   * Initialize DOM structure
   */
  private initDOM(): void {
    this.container.innerHTML = '';
    
    // Create basic table structure
    this.container.style.position = 'relative';
    this.container.style.overflow = 'hidden';
    this.container.style.width = '100%';
    this.container.style.height = '100%';
    
    // Create main table container
    const table = this.createElement('div', 'vibegridx-table');
    
    // Create header container first (will be populated by HeaderRenderer)
    this.headerContainer = this.createElement('div', 'vibegridx-header');
    this.headerContainer.style.cssText = `
      position: relative;
      white-space: nowrap;
      height: 100%;
      display: flex;
      min-width: min-content;
      width: max-content;
    `;
    
    // Create header viewport wrapper for the header container
    this.headerViewport = this.createElement('div', 'vibegridx-header-viewport');
    this.headerViewport.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: ${HEADER_HEIGHT}px;
      background: hsl(var(--muted));
      border-bottom: 1px solid hsl(var(--border));
      overflow-x: auto;
      overflow-y: hidden;
      scrollbar-width: none; /* Firefox */
      -ms-overflow-style: none; /* IE/Edge */
      z-index: 10;
      contain: layout style;
    `;
    this.headerViewport.style.setProperty('-webkit-overflow-scrolling', 'touch');
    this.headerViewport.appendChild(this.headerContainer);
    
    // Basic viewport structure (will be enhanced by ViewportManager)
    this.viewport = this.createElement('div', 'vibegridx-viewport');
    this.viewport.style.cssText = `
      position: absolute;
      top: ${HEADER_HEIGHT}px;
      left: 0;
      right: 0;
      bottom: 0;
      overflow: auto;
    `;
    
    this.bodyContainer = this.createElement('div', 'vibegridx-body');
    this.bodyContainer.style.cssText = `
      position: relative;
      width: 100%;
    `;
    
    this.viewport.appendChild(this.bodyContainer);
    
    // Assemble the complete structure
    table.appendChild(this.headerViewport);
    table.appendChild(this.viewport);
    this.container.appendChild(table);
    
    fileLog.info('✅ Basic DOM structure created');
  }
  
  /**
   * Legacy observers setup - removed, now using ObserverManager
   */
  private setupObservers(): void {
    // This method is kept for compatibility but now delegates to ObserverManager
    // All observer logic has been moved to ObserverManager.ts
    
    // Context menu handling is now done by EventManager in Phase 2
    
    fileLog.info('✅ Legacy setupObservers() called - using ObserverManager instead');
  }

  /**
   * Create DOM element with class - matches UnifiedTableRenderer pattern
   */
  private createElement(tag: string, className: string): HTMLElement {
    // Delegate to DOM Factory for consistent element creation
    if (this.domFactory) {
      return this.domFactory.createElement(tag, className);
    }
    
    // Fallback for early initialization
    const el = document.createElement(tag);
    el.className = className;
    return el;
  }
  
  /**
   * Create group header element with expand/collapse functionality
   * DELEGATED: Now handled by GroupRenderer
   */
  private createGroupHeaderElement(groupRow: any, rowIndex: number): HTMLElement {
    // Delegate to GroupRenderer for consistent group header creation
    if (this.groupRenderer) {
      return this.groupRenderer.createGroupHeaderElement(groupRow, rowIndex);
    }

    // Fallback to DOMFactory if GroupRenderer not available
    if (this.domFactory) {
      return this.domFactory.createGroupHeaderElement(groupRow, rowIndex);
    }

    // Error case - should not happen with proper initialization
    fileLog.error('🚨 Neither GroupRenderer nor DOMFactory available');
    throw new Error('GroupRenderer not initialized - check initialization order');
  }
  
  
  /**
   * Render table header
   */
  private renderHeader(): void {
    if (!this.headerContainer) return;
    
    // Delegate to HeaderRenderer if available
    if (this.headerRenderer) {
      this.headerRenderer.render();
      
      // Update select all checkbox reference
      this.selectAllCheckbox = this.headerRenderer.getSelectAllCheckbox();
      return;
    }
    
    // HeaderRenderer should always be available - if not, something is wrong
    fileLog.error('🚨 HeaderRenderer not available - this should not happen');
    throw new Error('HeaderRenderer not initialized - check initialization order');
  }
  
  /**
   * Render table body
   */
  private renderBody(): void {
    if (!this.bodyContainer || !this.rowRenderer || !this.viewportManager) return;
    
    const rows = this.tableCore$.processedRows.get();
    const columns = this.tableCore$.columns.get();
    const columnVisibility = this.tableCore$.columnVisibility.get();
    
    // Debug: Check if we have group rows
    const groupRows = rows.filter((row: any) => row.type === 'group');
    const dataRows = rows.filter((row: any) => row.type === 'data');
    
    fileLog.info('🎨 Rendering body with Phase 2 managers', { 
      rowCount: rows.length, 
      columnCount: columns.length,
      groupRows: groupRows.length,
      dataRows: dataRows.length,
      firstRowType: rows[0]?.type,
      firstRowData: rows[0]
    });
    
    this.bodyContainer.innerHTML = '';
    
    // Clear active rows in RowRenderer
    this.rowRenderer.clearActiveRows();
    
    // Update content dimensions via ViewportManager
    this.viewportManager.updateContentDimensions();
    
    // Update row coordinate mapping
    this.coordinateMapping.rows = [];
    
    // Virtual scrolling: Only render visible rows
    const visibleRange = this.tableViewport$.visibleRange.get();
    const startIndex = Math.max(0, visibleRange.start);
    const endIndex = Math.min(rows.length, visibleRange.end);
    const visibleRows = rows.slice(startIndex, endIndex);
    
    fileLog.debug('🎨 Virtual scrolling with Phase 2', { 
      totalRows: rows.length, 
      visibleRange: `${startIndex}-${endIndex}`,
      rendering: visibleRows.length
    });
    
    // Get virtual column range from the observable (single source of truth) - MUST match header
    const visibleColumnRange = this.tableViewport$.visibleColumns.get();
    const allVisibleColumns = columns.filter(col => columnVisibility[col.id] !== false);
    
    // Use the EXACT same range as header (from observable with buffer already included)
    const startColIndex = visibleColumnRange.start;
    const endColIndex = visibleColumnRange.end;
    const virtualColumns = allVisibleColumns.slice(startColIndex, endColIndex);
    
    // Calculate starting x position for virtual columns - MUST match header
    let startX = 40; // Account for row header
    for (let i = 0; i < startColIndex; i++) {
      startX += allVisibleColumns[i].width;
    }
    
    // Render only visible rows using RowRenderer
    visibleRows.forEach((row, visibleIndex) => {
      const actualRowIndex = startIndex + visibleIndex;
      
      let rowElement: HTMLElement;
      
      // Check if this is a group header or data row
      if (row.type === 'group') {
        fileLog.info('🎯 Rendering group row', { 
          rowId: row.id, 
          level: row.level,
          isExpanded: row.isExpanded,
          data: row.data
        });
        rowElement = this.rowRenderer.createGroupHeaderElement(row, actualRowIndex);
      } else {
        rowElement = this.rowRenderer.createRowElement(row.data || row, actualRowIndex, virtualColumns, columnVisibility, startX);
      }
      
      this.bodyContainer.appendChild(rowElement);
    });
    
    // Build complete coordinate mapping for all rows (needed for overlays)
    const newRows: any[] = [];
    rows.forEach((row, rowIndex) => {
      newRows.push({
        rowId: row.id,
        y: rowIndex * ROW_HEIGHT,
        height: ROW_HEIGHT,
        index: rowIndex
      });
    });

    // Check for row coordinate mapping changes (including position)
    const rowMappingChanged = !this.coordinateMapping.rows ||
      this.coordinateMapping.rows.length !== newRows.length ||
      newRows.some((newRow, index) => {
        const oldRow = this.coordinateMapping.rows?.[index];
        return !oldRow ||
               oldRow.rowId !== newRow.rowId ||
               oldRow.y !== newRow.y;
      });

    // Only update coordinate mapping if it actually changed
    if (rowMappingChanged) {
      this.coordinateMapping.rows = newRows;
      this.coordinateMapping.version++;
      // Sync coordinate mapping with overlay manager
      this.overlayManager?.updateCoordinateMapping(this.coordinateMapping);
    }
    
    fileLog.info('✅ Body rendered with Phase 2 managers');
  }
  
  /**
   * Apply CSS classes to DOM cells for selection state
   */
  private updateDOMSelectionClasses(selectedCells: Set<string>): void {
    // Remove existing selection classes from all cells
    const allCells = this.container.querySelectorAll('.vibegridx-cell');
    allCells.forEach(cell => {
      cell.classList.remove('vibegridx-selected');
    });
    
    // Apply selection classes to selected cells
    selectedCells.forEach(cellId => {
      const [rowId, columnId] = cellId.split(':');
      const cellElement = this.container.querySelector(
        `[data-row-id="${rowId}"][data-column-id="${columnId}"]`
      );
      if (cellElement) {
        cellElement.classList.add('vibegridx-selected');
      }
    });
    
    fileLog.info('✅ DOM selection classes updated', { selectedCount: selectedCells.size });
  }
  
  /**
   * Calculate visual cell positions for canvas overlays
   */
  private calculateVisualCellPositions(selectedCells: Set<string>): VisualCellPosition[] {
    const visualCells: VisualCellPosition[] = [];
    
    selectedCells.forEach(cellId => {
      const [rowId, columnId] = cellId.split(':');
      const cellElement = this.container.querySelector(
        `[data-row-id="${rowId}"][data-column-id="${columnId}"]`
      ) as HTMLElement;
      
      if (cellElement && this.viewport) {
        const cellRect = cellElement.getBoundingClientRect();
        const containerRect = this.container.getBoundingClientRect();
        
        visualCells.push({
          cellKey: cellId,
          x: cellRect.left - containerRect.left,
          y: cellRect.top - containerRect.top,
          width: cellRect.width,
          height: cellRect.height
        });
      }
    });
    
    fileLog.info('✅ Visual cell positions calculated', { 
      selectedCount: selectedCells.size,
      visualCount: visualCells.length 
    });
    
    return visualCells;
  }
  
  // REMOVED: createRowElement() - Now fully handled by RowRenderer in Phase 2
  // This legacy method has been replaced by this.rowRenderer.createRowElement()

  // Legacy method body removed - functionality moved to RowRenderer
  
  /**
   * Format cell value using centralized display formatters
   */
  private formatCellValue(value: any, type?: string, column?: any): string {
    // Delegate to the modular CellFormatter
    return CellFormatter.formatCellValue(value, type, column);
  }
  
  // Removed redundant formatting methods - now using centralized display formatters
  
  /**
   * Handle viewport changes (scroll and dimension updates)
   * Triggers virtual scrolling updates when visible range changes
   */
  private handleViewportChange(): void {
    // Check if horizontal columns have changed
    const visibleColumns = this.tableViewport$.visibleColumns.get();
    const previousColumns = this.lastVisibleColumns || { start: -1, end: -1 };
    
    const columnsChanged = visibleColumns.start !== previousColumns.start || 
                          visibleColumns.end !== previousColumns.end;
    
    // Update viewport manager
    if (this.viewportManager) {
      this.viewportManager.handleViewportChange();
    }
    
    // Update overlay selection with current viewport position
    if (this.overlayManager) {
      // Re-update selection overlay which will internally update viewport info
      const selectedCells = this.tableInteraction$.selectedCells.get();
      if (selectedCells.size > 0) {
        this.overlayManager.updateSelection(selectedCells);
      }
    }
    
    // Re-render if columns changed (for horizontal virtual scrolling)
    if (columnsChanged) {
      this.lastVisibleColumns = visibleColumns;
      this.renderHeader();
      this.renderBody();
    } else {
      // Only re-render body for vertical scrolling
      this.renderBody();
    }
  }
  
  /**
   * Destroy the renderer
   */
  destroy(): void {
    fileLog.info('🧹 Destroying SimplePassiveRenderer with Phase 2 managers');
    
    // Clean up observers (managed by ObserverManager)
    if (this.observerManager) {
      this.observerManager.destroy();
      this.observerManager = null;
    }
    
    // Clean up Phase 2 managers
    if (this.eventManager) {
      this.eventManager.destroy();
      this.eventManager = null;
    }
    
    if (this.viewportManager) {
      this.viewportManager.destroy();
      this.viewportManager = null;
    }
    
    // Clean up ScrollController
    if (this.scrollController) {
      this.scrollController.destroy();
      this.scrollController = null;
    }

    // Clean up ColumnWidthManager
    if (this.columnWidthManager) {
      this.columnWidthManager.destroy();
      this.columnWidthManager = null;
    }

    // Clean up GroupRenderer
    if (this.groupRenderer) {
      this.groupRenderer.destroy();
      this.groupRenderer = null;
    }

    // RowRenderer and CellRenderer don't need explicit cleanup
    this.rowRenderer = null;
    this.cellRenderer = null;
    
    // Clean up legacy disposers (if any remain)
    this.disposers.forEach(dispose => dispose());
    this.disposers = [];
    
    // Clean up overlay manager
    if (this.overlayManager) {
      this.overlayManager.destroy();
      this.overlayManager = null;
    }
    
    // Clear DOM
    if (this.container) {
      this.container.innerHTML = '';
    }
    
    // Clear references
    this.activeRows.clear();
    this.viewport = null;
    this.headerContainer = null;
    this.headerViewport = null;
    this.bodyContainer = null;
    this.domFactory = null;
    this.headerRenderer = null;
    
    fileLog.info('✅ SimplePassiveRenderer destroyed with all Phase 2 managers cleaned up');
  }
  
  // selectAllCells method removed - now handled by SelectionController
  
  // selectColumn method removed - now handled by SelectionController
  
  // selectRow method removed - now handled by SelectionController

  // toggleRowSelection method removed - now handled by SelectionController

  // selectRowRange method removed - now handled by SelectionController

  // handleArrowKey method removed - now handled by KeyboardNavigationController

  // selectKeyboardRange method removed - now handled by SelectionController

  /**
   * Update the select all checkbox visual state based on computed observable state
   */
  private updateSelectAllCheckboxVisual(state: { checked: boolean; indeterminate: boolean }): void {
    // Delegate to HeaderRenderer if available
    if (this.headerRenderer) {
      this.headerRenderer.updateSelectAllCheckboxVisual(state);
      return;
    }
    
    // Fallback to original implementation
    if (!this.selectAllCheckbox) return;

    fileLog.debug('📋 Updating select all checkbox visual state', {
      newState: state,
      previousChecked: this.selectAllCheckbox.checked,
      previousIndeterminate: this.selectAllCheckbox.indeterminate
    });

    const checkbox = this.selectAllCheckbox;
    
    // Direct DOM property updates - Legend State computed observable ensures these are correct
    checkbox.checked = state.checked;
    checkbox.indeterminate = state.indeterminate;
  }
  
  // REMOVED: setupScrollHandling() - Now handled by enhanced ScrollController
  
  // REMOVED: syncHeaderScroll() - Now handled by ColumnWidthManager

  /**
   * Update sort indicators in header cells based on current sort state
   * Similar to HeaderEngine.updateSortIndicators()
   */
  private updateSortIndicators(): void {
    if (!this.headerContainer) return;
    
    // Delegate to HeaderRenderer if available
    if (this.headerRenderer) {
      this.headerRenderer.updateSortIndicators();
      return;
    }
    
    // HeaderRenderer should always be available - if not, something is wrong
    fileLog.error('🚨 HeaderRenderer not available for sort indicators - this should not happen');
    throw new Error('HeaderRenderer not initialized - check initialization order');
  }

  // REMOVED: createSortIconSVG() - Now handled by HeaderRenderer

  // REMOVED: updateHeaderCellWidth() and updateBodyCellWidths() - Now handled by ColumnWidthManager

  /**
   * Determine if a field should be treated as a tags field
   */
  private isTagsField(columnId: string, value: any): boolean {
    // Delegate to the modular BadgeRenderer
    return BadgeRenderer.isTagsField(columnId, value);
  }

  /**
   * Create a container element with multiple tag badges
   */
  private createTagsElement(value: string, row: any, column: any): HTMLElement {
    // Delegate to the modular BadgeRenderer
    return BadgeRenderer.createTagsElement(
      value,
      row,
      column,
      this.createElement.bind(this),
      (val, r, c) => this.editTagsField(val, r, c)
    );
  }

  /**
   * Trigger editing mode for tags fields
   */
  private editTagsField(currentValue: string, row: any, column: any): void {
    const cellId = `${row.id}:${column.id}`;
    fileLog.info('🏷️ Starting tags field edit mode', {
      cellId,
      currentValue,
      rowId: row.id,
      columnId: column.id,
      currentTags: currentValue.split(',').map(t => t.trim()).filter(t => t.length > 0)
    });
    
    // Trigger the standard VibeGrid edit mode - the editor selection system
    // will automatically choose MultiSelectEditor for tags fields
    this.tableInteraction$.startEdit(cellId, currentValue);
  }

  /**
   * Get the appropriate CSS badge color class for a given value and column
   */
  private getBadgeColorClass(value: string, columnId: string): string | null {
    // Delegate to the modular BadgeRenderer
    return BadgeRenderer.getBadgeColorClass(value, columnId);
  }

}