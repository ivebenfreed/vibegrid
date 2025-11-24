/**
 * SimplePassiveRenderer - Basic working table without overlays
 * 
 * This is a simplified version to get the basic table working first,
 * then we can add overlays back once we have the foundation working.
 */

import { reaction, runInAction } from 'mobx';
import { createLogger } from '@/shared/lib/logging';
// New modular architecture imports - ObserverManager will be removed
// import { ObserverManager, type ObserverManagerOptions, type VisualState } from './ObserverManager';
import { DOMElementFactory, type DOMElementFactoryOptions } from '../factories/DOMElementFactory';
import { HeaderRenderer, type HeaderRendererOptions } from '../components/HeaderRenderer';

// Manager imports (ViewportManager consolidated into visual-state)
import { BodyRenderer } from '../components/BodyRenderer';
import { EventManager } from '../managers/EventManager';

// Existing modular components
import { OverlayManager, type CoordinateMapping } from '../modules/OverlayManager';
import { CellFormatter } from '../components/BodyRenderer';
import { SelectionController } from '../modules/SelectionController';
import { KeyboardNavigationController } from '../modules/KeyboardNavigationController';
import { KeyboardController } from '../modules/KeyboardController';
import { ScrollController } from '../modules/ScrollController';
import { MouseController } from '../modules/MouseController';
import { GroupRenderer } from '../components/GroupRenderer';
import { ColumnWidthManager } from '../modules/ColumnWidthManager';
import { DragDropManager } from '../../utils/drag-drop-handlers';

// Service layer
import { InteractionCoordinator } from '../../coordination/InteractionCoordinator';
import { SelectionService } from '../../services/SelectionService';
import { CellActionRouter } from '../../routing/CellActionRouter';

// New hybrid coordinate system imports
import { GRID_DIMENSIONS } from '../../constants/grid-dimensions';
import { updateVirtualBounds, updateVirtualViewport, updateVirtualColumns } from '../../virtualization/VirtualScrollManager';
import { positionTracker } from '../../stores/dom-position-state';

// Utility imports
import type { ViewportInfo, TableRow } from '../../types';
import type { VisualCellPosition } from '../../overlays/OverlayTypes';
import { formatFieldForDisplay } from '@/server/domain/dataforge/fields/display-formatters';
import { modularCellBridge } from '../../field-types';
import { vibeGridProfiler } from '../../performance/PerformanceProfiler';

const fileLog = createLogger('components/custom/vibegrid/renderers/core/SimplePassiveRenderer.ts');

// Use centralized dimensions from the new system
const ROW_HEIGHT = GRID_DIMENSIONS.ROW_HEIGHT;
const HEADER_HEIGHT = GRID_DIMENSIONS.HEADER_HEIGHT;

// ====================================
// TYPES
// ====================================

/**
 * Visual state snapshot for change detection
 */
interface VisualState {
  scrollTop: number;
  scrollLeft: number;
  viewportWidth: number;
  viewportHeight: number;
  visibleRowStart: number;
  visibleRowEnd: number;
  visibleColumnStart: number;
  visibleColumnEnd: number;
  columns?: any[]; // Column definitions
  columnVisibility?: any; // Column visibility state
  viewport?: any; // Viewport information
}

// Import MobX store types
import type { VibeGridStores } from '../../stores/context';
import type { TableCoreStore } from '../../stores/TableCoreStore';
import type { VisualStateStore } from '../../stores/VisualStateStore';
import type { InteractionStore } from '../../stores/InteractionStore';
import type { InitStore } from '../../stores/InitStore';

export interface SimplePassiveRendererOptions {
  container: HTMLElement;
  stores: VibeGridStores; // REQUIRED: MobX stores
  entityType: string;
  enableSelectionColumn?: boolean;
  bufferSize?: number;
  onEntityUpdate?: (rowId: string, updates: Record<string, any>) => Promise<void> | void;
  onBatchEntityUpdate?: (updates: Array<{ id: string; updates: Record<string, any> }>) => Promise<void> | void;
  onCellClick?: (rowId: string, columnId: string) => void;
}

export class SimplePassiveRenderer {
  private container: HTMLElement;
  private viewport: HTMLElement | null = null;
  private headerContainer: HTMLElement | null = null;
  private headerViewport: HTMLElement | null = null;
  private bodyContainer: HTMLElement | null = null;
  private disposers: (() => void)[] = [];

  // MobX Store references
  private stores: VibeGridStores;
  private tableCoreStore: TableCoreStore;
  private visualStateStore: VisualStateStore;
  private interactionStore: InteractionStore;
  private initStore: InitStore;
  private entityType: string;
  
  // Basic row management
  private activeRows: Map<string, HTMLElement> = new Map();
  private lastVisibleColumns: { start: number; end: number } | null = null;
  private lastVisibleRows: { start: number; end: number } | null = null;

  // Visual state tracking for change detection
  private lastVisualState: VisualState | null = null;
  
  // Overlay management
  private overlayManager: OverlayManager | null = null;
  
  // Coordinate mapping (maintained locally but synced with overlay manager)
  private coordinateMapping: CoordinateMapping = {
    rows: [],
    columns: [],
    version: 0,
    sortBy: []
  };
  
  // Scroll coordination
  private _scrollRAF: number | null = null;
  
  // Row range selection tracking - now handled by SelectionController
  // Keyboard navigation tracking - now handled by KeyboardNavigationController
  
  // UI element references
  private selectAllCheckbox: HTMLInputElement | null = null;
  
  // Smart cell system
  private formattersReady: boolean = false;
  
  // Modular controllers
  private selectionController: SelectionController | null = null;
  private keyboardNavController: KeyboardNavigationController | null = null;
  private keyboardController: KeyboardController | null = null;
  private scrollController: ScrollController | null = null;
  private mouseController: MouseController | null = null;
  private groupRenderer: GroupRenderer | null = null;
  private columnWidthManager: ColumnWidthManager | null = null;

  // Service layer
  private interactionCoordinator: InteractionCoordinator | null = null;
  private selectionService: SelectionService | null = null;
  private cellActionRouter: CellActionRouter | null = null;
  
  // Focused observers - replacing mega-observer pattern
  private granularUpdateObserverDisposer: (() => void) | null = null; // Granular cell updates (before processedRows)
  private dataObserverDisposer: (() => void) | null = null;
  private visualObserverDisposer: (() => void) | null = null;
  private columnVisibilityObserverDisposer: (() => void) | null = null;
  private columnOrderObserverDisposer: (() => void) | null = null;
  private columnWidthsObserverDisposer: (() => void) | null = null; // Add dedicated observer for column widths
  private virtualScrollObserverDisposer: (() => void) | null = null; // Add dedicated observer for virtual scrolling
  private interactionObserverDisposer: (() => void) | null = null;
  private scrollObserverDisposer: (() => void) | null = null;
  private dragSelectionObserverDisposer: (() => void) | null = null;
  private pendingRAF: number | null = null; // Track pending RAF to prevent cascades
  private observersEnabled: boolean = false; // Prevent observers from running during initialization

  // ✅ PERFORMANCE: Track last values to prevent unnecessary DOM updates
  private lastSelectedCount: number = 0;
  private lastSelectAllChecked: boolean | undefined = undefined;
  private lastSelectAllIndeterminate: boolean | undefined = undefined;
  private domFactory: DOMElementFactory | null = null;
  private headerRenderer: HeaderRenderer | null = null;
  
  // Phase 2 manager additions
  private bodyRenderer: BodyRenderer | null = null;
  private eventManager: EventManager | null = null;
  private dragDropManager: DragDropManager | null = null;

  private rendererInstanceId = Math.random().toString(36).substring(7);
  private isDestroyed = false;

  constructor(private options: SimplePassiveRendererOptions) {
    this.container = options.container;

    // Validate MobX stores are provided
    if (!options.stores) {
      throw new Error('SimplePassiveRenderer: Must provide MobX stores');
    }

    fileLog.debug('🚀 SimplePassiveRenderer: Initializing with MobX stores (PURE MOBX - NO BRIDGE)', {
      instanceId: this.rendererInstanceId,
      hasContainer: !!this.container
    });

    // Store MobX references
    this.stores = options.stores;
    this.tableCoreStore = options.stores.tableCoreStore;
    this.visualStateStore = options.stores.visualStateStore;
    this.interactionStore = options.stores.interactionStore;
    this.initStore = options.stores.initStore;
    this.entityType = options.entityType;

    fileLog.debug('✅ MobX stores assigned', {
      entityType: this.entityType,
      hasTableCore: !!this.tableCoreStore,
      hasVisualState: !!this.visualStateStore,
      hasInteraction: !!this.interactionStore,
      hasInit: !!this.initStore
    });

    vibeGridProfiler.startMetric('renderer-initialization', {
      entityType: this.entityType
    });

    // Initialize renderer
    this.initDOM();
    this.initControllers();
    this.initDOMFactory();
    this.initOverlayManager(); // ✅ MUST be before initPhase2Managers (creates EditSessionManager)
    this.initPhase2Managers(); // ✅ MUST be after initOverlayManager (accesses EditSessionManager) - CREATES bodyRenderer!
    this.initHeaderRenderer();

    this.postInitialization();

    // Initialize observers at the VERY END after ALL components exist
    // CRITICAL: Enable observers BEFORE initializing them so guards don't block
    this.observersEnabled = true;
    fileLog.info('🎯 Initializing focused observers after all components ready');
    this.initFocusedObservers();

    fileLog.debug('✅ SimplePassiveRenderer initialized with PURE MobX (no bridge)', {
      timestamp: Date.now(),
      entityType: this.entityType
    });
  }
  
  /**
   * Initialize DOM Element Factory
   */
  private initDOMFactory(): void {
    fileLog.debug('🏭 Initializing DOM Element Factory');

    this.domFactory = new DOMElementFactory({
      interactionStore: this.interactionStore,
      tableCoreStore: this.tableCoreStore,
      selectionController: this.selectionController || undefined,
      enableSelectionColumn: this.options.enableSelectionColumn,
      onEntityUpdate: this.options.onEntityUpdate,
      visualOperations: this.visualStateStore // ✅ FIXED: Wire up VisualStateStore
    });

    fileLog.debug('✅ DOM Element Factory initialized');
  }

  /**
   * Initialize modular controllers
   */
  private initControllers(): void {
    fileLog.debug('🎮 Initializing modular controllers');

    // Initialize selection controller (MobX version)
    this.selectionController = new SelectionController({
      interactionStore: this.interactionStore,
      getProcessedRows: () => this.tableCoreStore.processedRows,
      getVisibleColumns: () => {
        const columns = this.visualStateStore.columns;
        const columnVisibility = this.visualStateStore.columnVisibility;
        return columns.filter(col => columnVisibility[col.id] !== false);
      },
      bodyRenderer: null
    });

    // Initialize keyboard navigation controller (MobX version)
    this.keyboardNavController = new KeyboardNavigationController({
      interactionStore: this.interactionStore,
      selectionController: this.selectionController,
      getProcessedRows: () => this.tableCoreStore.processedRows,
      getVisibleColumns: () => {
        const columns = this.visualStateStore.columns;
        const columnVisibility = this.visualStateStore.columnVisibility;
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

    // Note: KeyboardController will be initialized in initPhase2Managers after EventManager is ready
    // Scroll controller will be initialized after DOM is ready in postInitialization()
  }
  
  /**
   * Initialize Phase 2 managers
   */
  private initPhase2Managers(): void {
    fileLog.info('🚀 Initializing Phase 2 managers - START');

    // GroupRenderer needs MobX migration (expects visualState from Legend State)
    // TODO: Migrate GroupRenderer to use VisualStateStore
    // this.groupRenderer = new GroupRenderer({
    //   domFactory: this.domFactory!,
    //   createElement: this.createElement.bind(this),
    //   visualState: this.visualStateStore // ERROR: Type mismatch
    // });

    // BodyRenderer is MobX-ready! Initialize it
    this.bodyRenderer = new BodyRenderer({
      tableCoreStore: this.tableCoreStore,
      visualStateStore: this.visualStateStore,
      interactionStore: this.interactionStore,
      domFactory: this.domFactory!,
      selectionController: this.selectionController!,
      keyboardNavController: this.keyboardNavController!,
      enableSelectionColumn: this.options.enableSelectionColumn,
      container: this.container,
      createElement: ((tag: string, className?: string) => this.createElement(tag, className ?? '')) as (tag: string, className?: string) => HTMLElement,
      onEntityUpdate: this.options.onEntityUpdate,
      modularCellBridge: modularCellBridge
    });

    // Update SelectionController with bodyRenderer reference
    if (this.selectionController) {
      this.selectionController.bodyRenderer = this.bodyRenderer;
    }

    // Initialize DragDropManager for row reordering
    this.dragDropManager = new DragDropManager({
      onRowMove: (draggedRowId: string, targetGroupId: string, newIndex: number) => {
        fileLog.debug('🎯 Row moved', { draggedRowId, targetGroupId, newIndex });
        // TODO: Implement row move logic
        return true;
      },
      onFlatRowMove: (fromIndex: number, toIndex: number) => {
        fileLog.debug('🎯 Flat row moved', { fromIndex, toIndex });
        // TODO: Implement flat row move logic
        return true;
      },
      onDragStart: (rowId: string, groupId?: string) => {
        fileLog.debug('🎯 Row drag started', { rowId, groupId });
      },
      onDragEnd: (success: boolean) => {
        fileLog.debug('🎯 Row drag ended', { success });
      },
      isGroupMode: () => this.visualStateStore.groupBy.length > 0
    });

    // Set container for drag operations
    this.dragDropManager.setContainer(this.container);

    // Initialize EventManager with MobX stores
    this.eventManager = new EventManager({
      tableCore$: this.tableCoreStore as any,
      tableInteraction$: this.interactionStore as any,
      tableViewport$: null as any, // Legacy parameter, not used
      container: this.container,
      onEntityUpdate: this.options.onEntityUpdate
    });

    // Initialize KeyboardController for centralized keyboard event handling
    // Must be after EventManager is created since KeyboardController calls eventManager methods
    this.keyboardController = new KeyboardController({
      container: this.container,
      keyboardNavController: this.keyboardNavController ?? undefined,
      onCopy: () => this.eventManager?.handleCopyAction(),
      onPaste: () => this.eventManager?.handlePasteAction(),
      onCut: () => this.eventManager?.handleCutAction(),
      onUndo: () => this.eventManager?.handleUndoAction(),
      onRedo: () => this.eventManager?.handleRedoAction()
    });

    fileLog.info('✅ Phase 2 managers initialized (BodyRenderer, DragDropManager, EventManager, KeyboardController)');
  }
  
  /**
   * Initialize overlay manager
   */
  private initOverlayManager(): void {
    fileLog.debug('🎨 Initializing overlay manager');

    // Initialize OverlayManager (MobX version) with coordinator
    this.overlayManager = new OverlayManager({
      container: this.container,
      tableCoreStore: this.tableCoreStore,
      interactionStore: this.interactionStore,
      coordinateManager: this.stores.coordinateManager,
      enableSelectionColumn: this.options.enableSelectionColumn,
      headerContainer: this.headerContainer,
      bodyContainer: this.bodyContainer,
      getProcessedRows: () => this.tableCoreStore.processedRows,
      onEntityUpdate: this.options.onEntityUpdate
    });

    // Note: initializeOverlay() is called later in postInitialization() after DOM is ready

    fileLog.debug('✅ Overlay manager initialized');
  }

  /**
   * Initialize Focused Observers - replaces mega-observer anti-pattern
   * Each observer handles only its specific concern for optimal performance
   */
  private initFocusedObservers(): void {
    fileLog.info('🎯 Initializing focused observers');

    // GRANULAR UPDATE OBSERVER: Runs BEFORE processedRows observer
    // Observes hasGranularUpdates which doesn't trigger processedRows recomputation
    fileLog.info('🎯 Creating granular update observer - MobX reaction on tableCoreStore.hasGranularUpdates');

    this.granularUpdateObserverDisposer = reaction(
      () => this.tableCoreStore.hasGranularUpdates,
      (granularUpdate) => {
        if (!granularUpdate || !this.observersEnabled) return;
        if (this.initStore && !this.initStore.isFullyHydrated) return;

        const { changedCells } = granularUpdate;

        const totalCells = Array.from(changedCells.values())
          .reduce((sum, cols) => sum + cols.size, 0);

        fileLog.info('🎯 Granular cell update detected (dedicated observer)', {
          rowsAffected: changedCells.size,
          cellsChanged: totalCells,
          method: 'cell-level',
          willSkipFullRender: true
        });

        // Apply cell-level updates
        if (this.bodyRenderer) {
          this.bodyRenderer.updateCells(changedCells);
        }

        // Clear the changed cells map
        runInAction(() => {
          this.tableCoreStore.lastChangedCells.clear();
          this.tableCoreStore.lastChangeStats = { rowsChanged: 0, totalCellsChanged: 0 };
        });
      }
    );

    // SORTED DATA OBSERVER: MobX reaction for processed rows changes
    // TableCoreStore.processedRows is a computed that applies filtering, sorting, and grouping
    // This will trigger whenever the computed sorted data changes (due to sorting, filtering, or raw data changes)
    fileLog.info('🎯 Creating sorted data observer - MobX reaction on tableCoreStore.processedRows');

    this.dataObserverDisposer = reaction(
      () => this.tableCoreStore.processedRows,
      (processedRows) => {
        fileLog.debug('🔍 DATA CHANGE DETECTED - MobX computed reaction', {
          observersEnabled: this.observersEnabled,
          rowCount: processedRows.length,
          sortBy: this.visualStateStore.sortBy,
          timestamp: Date.now()
        });

        // GUARD: Skip if observers are not enabled yet
        if (!this.observersEnabled) {
          fileLog.debug('⏸️ DATA: Observers not enabled yet');
          return;
        }

        // GUARD: Only render if grid is fully initialized
        if (this.initStore && !this.initStore.isFullyHydrated) {
          fileLog.debug('⏸️ DATA: Skipping render during initialization');
          return;
        }

        // ✨ NEW: Check for granular cell changes
        const changedCells = this.tableCoreStore.lastChangedCells;

        fileLog.debug('🔍 DATA OBSERVER: Checking for granular updates', {
          hasChangedCells: !!changedCells,
          changedCellsSize: changedCells?.size || 0,
          hasBodyRenderer: !!this.bodyRenderer,
          timestamp: Date.now()
        });

        if (changedCells && changedCells.size > 0) {
          // GRANULAR UPDATE PATH
          const totalCells = Array.from(changedCells.values())
            .reduce((sum, cols) => sum + cols.size, 0);

          fileLog.info('🎯 Granular cell update detected', {
            rowsAffected: changedCells.size,
            cellsChanged: totalCells,
            method: 'cell-level',
            willSkipFullRender: true,
            changedCellDetails: Array.from(changedCells.entries()).map(([rowId, cols]) => ({
              rowId,
              columns: Array.from(cols)
            }))
          });

          // Apply cell-level updates
          if (this.bodyRenderer) {
            this.bodyRenderer.updateCells(changedCells);
          } else {
            fileLog.error('❌ BodyRenderer not available for granular update');
          }

          // Clear the changed cells map AND stats for next update
          runInAction(() => {
            this.tableCoreStore.lastChangedCells.clear();
            this.tableCoreStore.lastChangeStats = { rowsChanged: 0, totalCellsChanged: 0 };
          });

          return; // ✅ Exit early - no full re-render needed!
        }

        // FULL RE-RENDER PATH
        // Triggered when structure changed (sort, filter, new/deleted rows)

        // CRITICAL FIX: The processedRows computed already changed (that's why this reaction fired)
        // This happens when:
        // 1. Sort/filter/grouping changes (row ORDER changes but values don't)
        // 2. Rows added/deleted (structure changes)
        // 3. Cell values changed (already handled by granular path above)
        //
        // Don't skip render based on change stats alone - if MobX triggered this reaction,
        // something in processedRows changed and we need to re-render!

        fileLog.info('🔄 Full table re-render (processedRows changed)', {
          rowCount: processedRows.length,
          sortBy: JSON.stringify(this.visualStateStore.sortBy),
          filters: JSON.stringify(this.visualStateStore.filters),
          reason: 'mobx_detected_processedRows_change'
        });

        this.renderBody();
      }
    );

    // COLUMN VISIBILITY OBSERVER: MobX reaction for column visibility changes
    this.columnVisibilityObserverDisposer = reaction(
      () => this.visualStateStore.columnVisibility,
      (columnVisibility) => {
        // GUARD: Skip if observers are not enabled yet
        if (!this.observersEnabled) {
          fileLog.debug('⏸️ COLUMN VISIBILITY: Observers not enabled yet');
          return;
        }

        // GUARD: Only render if grid is fully initialized
        const isFullyInitialized = this.initStore.isFullyHydrated;
        if (!isFullyInitialized) {
          fileLog.debug('⏸️ COLUMN VISIBILITY: Skipping render during initialization');
          return;
        }

        const hiddenColumns = Object.entries(columnVisibility).filter(([_, visible]) => visible === false);

        fileLog.debug('🎨 Column visibility changed - forcing layout re-render', {
          hiddenColumnsCount: hiddenColumns.length,
          hiddenColumns: hiddenColumns.map(([id]) => id)
        });

        // Force re-render when column visibility changes
        this.renderHeader();
        this.renderBody();
      }
    );

    // COLUMN ORDER OBSERVER: MobX reaction for column order changes
    this.columnOrderObserverDisposer = reaction(
      () => this.visualStateStore.columnOrder,
      () => {
      fileLog.debug('🔄 COLUMN ORDER CHANGE DETECTED via dedicated observer', {
        observersEnabled: this.observersEnabled,
        timestamp: Date.now()
      });

      // GUARD: Skip if observers are not enabled yet
      if (!this.observersEnabled) {
        fileLog.debug('⏸️ COLUMN ORDER: Observers not enabled yet');
        return;
      }

      // GUARD: Only render if grid is fully initialized
      const isFullyInitialized = this.initStore.isFullyHydrated;
      if (!isFullyInitialized) {
        fileLog.debug('⏸️ COLUMN ORDER: Skipping render during initialization');
        return;
      }

      const columnOrder = this.visualStateStore.columnOrder;

      fileLog.debug('🎨 Column order changed - forcing layout re-render', {
        columnOrderLength: columnOrder.length,
        columnOrder: columnOrder
      });

      // Force re-render when column order changes
      runInAction(() => {
        this.renderHeader();
        this.renderBody();
      });
    });

    // COLUMN WIDTHS OBSERVER: Optimized for direct style updates (no re-render)
    this.columnWidthsObserverDisposer = reaction(
      () => this.visualStateStore.columnWidths,
      (columnWidths, prevWidths) => {
        fileLog.debug('[RESIZE] 🔄 COLUMN WIDTH CHANGE DETECTED via dedicated observer', {
          observersEnabled: this.observersEnabled,
          timestamp: Date.now()
        });

        // GUARD: Skip if observers are not enabled yet
        if (!this.observersEnabled) {
          fileLog.debug('[RESIZE] ⏸️ COLUMN WIDTHS: Observers not enabled yet');
          return;
        }

        // GUARD: Only render if grid is fully initialized
        const isFullyInitialized = this.initStore.isFullyHydrated;
        if (!isFullyInitialized) {
          fileLog.debug('[RESIZE] ⏸️ COLUMN WIDTHS: Skipping during initialization');
          return;
        }

        // ✨ OPTIMIZED: Direct style updates instead of full re-render
        const changedColumns = Object.keys(columnWidths).filter(
          columnId => columnWidths[columnId] !== prevWidths?.[columnId]
        );

        if (changedColumns.length === 0) {
          fileLog.debug('[RESIZE] ⏭️ No actual column width changes detected');
          return;
        }

        fileLog.info('[RESIZE] 🎨 Applying direct column width updates (no re-render)', {
          columnsChanged: changedColumns.length,
          changedColumnIds: changedColumns
        });

        // Update each changed column's width directly
        changedColumns.forEach(columnId => {
          this.updateColumnWidth(columnId, columnWidths[columnId]);
        });

        fileLog.debug('[RESIZE] ✅ Column widths updated via direct style manipulation', {
          columnsUpdated: changedColumns.length,
          skippedFullRender: true
        });
      }
    );

    // VISUAL OBSERVER: Only watches layout changes (columns, viewport dimensions)
    // Track non-scroll visual changes to avoid duplicate renders with scroll observer
    const lastVisualLayout = '';

    fileLog.debug('🎯 CREATING VISUAL OBSERVER', {
      visualStateStoreExists: !!this.visualStateStore,
      columnOrderExists: this.visualStateStore.columnOrder.length > 0,
      observersEnabled: this.observersEnabled
    });

    // TODO: Visual observer needs complete rebuild for MobX (Day 6-8 after BodyRenderer migration)
    // this.visualObserverDisposer = reaction(() => {
//       fileLog.debug('🔍 VISUAL OBSERVER CALLBACK ENTERED', {
//         observersEnabled: this.observersEnabled,
//         timestamp: Date.now()
//       });
// 
//       // GUARD: Skip if observers are not enabled yet
//       if (!this.observersEnabled) {
//         fileLog.debug('⏸️ VISUAL: Observers not enabled yet');
//         return;
//       }
// 
//       // GUARD: Only render if grid is fully initialized
//       const isFullyInitialized = this.initStore.isFullyHydrated;
//       if (!isFullyInitialized) {
//         fileLog.debug('⏸️ VISUAL: Skipping render during initialization');
//         return;
//       }
// 
//       // MobX: Direct access to visual state store (automatic dependency tracking)
//       // Reading ONLY layout-related properties to avoid scroll position changes
//       const columnOrder = this.visualStateStore.columnOrder;
//       const columnVisibility = this.visualStateStore.columnVisibility;
//       const columnWidths = this.visualStateStore.columnWidths;
// 
//       // Don't read scroll position here - it causes unnecessary re-renders on scroll
//       // const scrollLeft = this.visualState.visualInputs$.scrollLeft.get();
//       // const scrollTop = this.visualState.visualInputs$.scrollTop.get();
// 
//       fileLog.debug('[RESIZE] 🔍 VISUAL OBSERVER TRIGGERED - layout change detected', {
//         columnWidths,
//         columnOrderLength: columnOrder.length,
//         timestamp: Date.now(),
//         visualInputsId: this.visualState.visualInputs$._id || 'no-id' // Debug: check instance
//       });
// 
//       // Create a signature of layout-only changes (exclude scroll position)
//       // Include column order, visibility, AND widths in signature to detect changes
//       const columnOrderSignature = columnOrder?.join(',') || '';
//       const columnVisibilitySignature = Object.entries(columnVisibility || {})
//         .filter(([_, visible]) => visible === false)  // Only track hidden columns
//         .map(([id]) => id)
//         .sort()
//         .join(',');
//       const columnWidthsSignature = Object.entries(columnWidths || {})
//         .sort(([a], [b]) => a.localeCompare(b))
//         .map(([id, width]) => `${id}:${width}`)
//         .join(',');
//       const layoutSignature = `${visualState.columnLayouts.length}-${visualState.geometry.totalWidth}-${visualState.geometry.viewportWidth}x${visualState.geometry.viewportHeight}-${columnOrderSignature}-hidden:${columnVisibilitySignature}-widths:${columnWidthsSignature}`;
// 
//       fileLog.debug('🔍 VISUAL OBSERVER TRIGGERED', {
//         columnOrderSignature,
//         columnOrder: columnOrder,
//         columnVisibilitySignature,
//         columnWidthsSignature,
//         hiddenColumnCount: columnVisibilitySignature.split(',').filter(Boolean).length,
//         currentLayoutSignature: layoutSignature,
//         previousLayoutSignature: lastVisualLayout,
//         columnOrderLength: visualState.columnState.columnOrder?.length || 0,
//         willTriggerRender: layoutSignature !== lastVisualLayout,
//         visualStateColumnOrder: visualState.columnState.columnOrder,
//         columnWidths: columnWidths
//       });
// 
//       // Only render if actual layout changed, not just scroll position
//       if (layoutSignature !== lastVisualLayout) {
//         lastVisualLayout = layoutSignature;
// 
//         fileLog.debug('🎨 Visual layout changed - updating layout only', {
//           columnCount: visualState.columnLayouts.length,
//           totalWidth: visualState.geometry.totalWidth,
//           viewportSize: `${visualState.geometry.viewportWidth}x${visualState.geometry.viewportHeight}`,
//           columnOrder: columnOrderSignature || 'default',
//           columnWidths: columnWidthsSignature || 'default',
//           previousLayoutSignature: lastVisualLayout,
//           currentLayoutSignature: layoutSignature
//         });
// 
//         // Batch the render operations to prevent cascade
//         runInAction(() => {
//           // Only update layout, no data processing
//           this.renderHeader();
//           this.renderBody(); // Body needs re-render for column changes
//         });
//       }
//     });

    // TODO: Interaction observer needs complete rebuild for MobX (Day 3-4 after SelectionController migration)
    // this.interactionObserverDisposer = reaction(() => {
//       // CRITICAL: Use .get(true) to avoid creating dependency when just checking state
//       // We only want to track actual selection, editing, and drag state changes
//       const columnResize = this.tableInteraction$.columnResize.get(true);
// 
//       // Only log resize-specific info when actually resizing
//       if (columnResize?.isResizing) {
//         fileLog.debug('[RESIZE] 🔍 Column resize active in interaction observer', {
//           observersEnabled: this.observersEnabled,
//           timestamp: Date.now(),
//           columnResizeState: columnResize
//         });
//       }
// 
//       // GUARD: Skip if observers are not enabled yet
//       if (!this.observersEnabled) {
//         fileLog.debug('⏸️ INTERACTION: Observers not enabled yet');
//         return;
//       }
//       const selectedCells = this.interactionStore.selectedCells;
//       const editingCell = this.interactionStore.editingCell;
//       const editValue = this.interactionStore.editValue;
//       const selectAllState = this.interactionStore.selectAllCheckboxState;
//       const isDragging = this.interactionStore.isDragging;
//       const dragSource = this.interactionStore.dragSource;
//       const dragTarget = this.interactionStore.dragTarget;
//       const isDragSelecting = this.interactionStore.isDragSelecting;
//       const dragSelectStart = this.interactionStore.dragSelectStart;
//       const dragSelectCurrent = this.interactionStore.dragSelectCurrent;
// 
//       // Only log detailed state when something interesting is happening
//       if (isDragging || editingCell || isDragSelecting || columnResize?.isResizing) {
//         fileLog.debug('🖱️ INTERACTION OBSERVER TRIGGERED', {
//           selectedCount: selectedCells.size,
//           isEditing: !!editingCell,
//           isDragging,
//           isDragSelecting,
//           isResizing: !!columnResize?.isResizing,
//           columnResizeDetails: columnResize?.isResizing ? {
//             columnId: columnResize.columnId,
//             newWidth: columnResize.newWidth,
//             isResizing: columnResize.isResizing
//           } : null
//         });
//       }
// 
//       // ✅ PERFORMANCE: Only update when selection actually changes
//       // Check if values have actually changed before updating DOM
//       const currentSelectedCount = selectedCells.size;
//       const lastSelectedCount = this.lastSelectedCount || 0;
// 
//       if (currentSelectedCount !== lastSelectedCount) {
//         this.updateDOMSelectionClasses(selectedCells);
//         this.lastSelectedCount = currentSelectedCount;
//         fileLog.debug('✅ DOM selection classes updated', { selectedCount: currentSelectedCount });
//       }
// 
//       // Only update checkbox if state actually changed
//       const currentSelectAllChecked = selectAllState.checked;
//       const currentSelectAllIndeterminate = selectAllState.indeterminate;
//       if (currentSelectAllChecked !== this.lastSelectAllChecked ||
//           currentSelectAllIndeterminate !== this.lastSelectAllIndeterminate) {
//         this.updateSelectAllCheckboxVisual(selectAllState);
//         this.lastSelectAllChecked = currentSelectAllChecked;
//         this.lastSelectAllIndeterminate = currentSelectAllIndeterminate;
//       }
// 
//       if (this.overlayManager) {
//         // Selection overlay is now handled reactively by OverlayManager via interactions observable
//         // No need to manually update selection here
// 
//         // DISABLED: Update editing overlay (now handled by reactive observer in OverlayManager)
//         // this.overlayManager.updateEditingOverlay(editingCell, editValue);
// 
//         // Update drag preview overlay
//         if (isDragging && dragSource) {
//           const dragState = {
//             isDragging: true,
//             startCell: dragSource,
//             currentCell: dragTarget || dragSource
//           };
//           this.overlayManager.updateColumnDragPreview(dragState);
//         } else {
//           this.overlayManager.updateColumnDragPreview(null);
//         }
// 
//         // Update column resize preview
//         this.overlayManager.updateColumnResizePreview(columnResize);
//       }
// 
//       // Handle column resize with direct DOM updates (no re-render)
//       // CRITICAL FIX: Access columnResize state right here so Legend State tracks dependency
//       const currentColumnResize = this.tableInteraction$.columnResize.get(true);
//       if (currentColumnResize?.isResizing && currentColumnResize.columnId && currentColumnResize.newWidth) {
//         fileLog.debug('[RESIZE] 📏 SimplePassiveRenderer handling column resize', {
//           columnId: currentColumnResize.columnId,
//           newWidth: currentColumnResize.newWidth,
//           isResizing: currentColumnResize.isResizing,
//           hasColumnWidthManager: !!this.columnWidthManager
//         });
// 
//         this.columnWidthManager?.updateHeaderCellWidth(currentColumnResize.columnId, currentColumnResize.newWidth);
//         this.columnWidthManager?.updateBodyCellWidths(currentColumnResize.columnId, currentColumnResize.newWidth);
//       }
//     });

    // TODO: Scroll observer needs complete rebuild for MobX (Day 5-6)
    // this.scrollObserverDisposer = reaction(() => {
//       // GUARD: Skip if observers are not enabled yet
//       if (!this.observersEnabled) {
//         fileLog.debug('⏸️ SCROLL: Observers not enabled yet');
//         return;
//       }
// 
//       // Skip during initialization to prevent unnecessary renders
//       // Check rendererInitialized to ensure we're completely done initializing
//       if (!this.initStore.hydrationState.rendererInitialized) {
//         return;
//       }
// 
//       const scrollLeft = this.visualState.visualInputs$.scrollLeft.get(true);
//       const scrollTop = this.visualState.visualInputs$.scrollTop.get(true);
// 
//       // Always update CSS transforms immediately (lightweight)
//       if (this.headerViewport) {
//         this.headerViewport.style.transform = `translateX(-${scrollLeft}px)`;
//       }
// 
//       // GUARD: Only trigger virtual range check if grid is fully initialized
//       const isFullyInitialized = this.initStore.isFullyHydrated;
//       if (!isFullyInitialized) {
//         fileLog.debug('⏸️ SCROLL: Skipping virtual range check during initialization');
//         return;
//       }
// 
//       // Defer virtual range checking to avoid reading computed state in observer
//       // Use RAF to break out of the reactive context
//       // CRITICAL FIX: Prevent RAF cascade by cancelling previous RAF
//       if (this.pendingRAF !== null) {
//         cancelAnimationFrame(this.pendingRAF);
//       }
// 
//       // Only schedule RAF if we're fully initialized AND have previous ranges to compare
//       // This prevents double-render during initialization
//       if (this.initStore.hydrationState.rendererInitialized &&
//           this.lastVisibleColumns && this.lastVisibleRows) {
//         this.pendingRAF = requestAnimationFrame(() => {
//           this.pendingRAF = null; // Clear the pending RAF
//           this.checkVirtualRangeChange();
//         });
//       }
//     });

    // TODO: Drag selection observer needs complete rebuild for MobX (Day 3-4)
    // this.dragSelectionObserverDisposer = reaction(() => {
//       // GUARD: Skip if observers are not enabled yet
//       if (!this.observersEnabled) {
//         fileLog.debug('⏸️ DRAG: Observers not enabled yet');
//         return;
//       }
// 
//       const isDragSelecting = this.tableInteraction$.isDragSelecting.get(true);
//       const mouseX = this.tableInteraction$.mouseX.get(true);
//       const mouseY = this.tableInteraction$.mouseY.get(true);
//       const startCell = this.tableInteraction$.dragSelectStart.get(true);
// 
//       if (isDragSelecting && startCell && mouseX > 0 && mouseY > 0) {
//         // Find current cell at mouse position
//         const targetElement = document.elementFromPoint(mouseX, mouseY);
//         const cellElement = targetElement?.closest('[data-row-id][data-column-id]');
// 
//         if (cellElement) {
//           const rowId = cellElement.getAttribute('data-row-id');
//           const columnId = cellElement.getAttribute('data-column-id');
//           const currentCell = `${rowId}:${columnId}`;
// 
//           // Compute rectangular selection range with all interior cells (MobX action)
//           const dragRange = this.calculateRectangularSelection(startCell, currentCell);
//           this.interactionStore.setSelectedCells(new Set(dragRange));
// 
//           fileLog.debug('🎯 Drag selection updated reactively', {
//             startCell,
//             currentCell,
//             rangeSize: dragRange.length,
//             mousePos: { mouseX, mouseY }
//           });
//         }
//       }
//     });

    // VIRTUAL SCROLL OBSERVER: Incremental updates with variable-height support
    this.virtualScrollObserverDisposer = reaction(
      () => this.visualStateStore.scrollTop,
      () => {
        if (!this.observersEnabled) return;

        const scrollTop = this.visualStateStore.scrollTop;
        const viewportHeight = this.visualStateStore.viewportHeight;
        const rowCount = this.visualStateStore.rowCount;

        // Use offset-based row finding for variable-height rows
        const startRowIndex = this.tableCoreStore.findRowAtScrollPosition(scrollTop);
        const endRowIndex = Math.min(
          rowCount - 1,
          this.tableCoreStore.findRowAtScrollPosition(scrollTop + Math.max(viewportHeight, 400)) + 1
        );

        const currentRowRange = { start: startRowIndex, end: endRowIndex };
        const previousRowRange = this.lastVisibleRows || { start: -1, end: -1 };

        // Only proceed if row range actually changed
        const rowRangeChanged =
          currentRowRange.start !== previousRowRange.start ||
          currentRowRange.end !== previousRowRange.end;

        if (rowRangeChanged) {
          fileLog.debug('🚀 VIRTUAL SCROLL: Variable-height incremental update', {
            scrollTop,
            currentRange: `${currentRowRange.start}-${currentRowRange.end}`,
            previousRange: `${previousRowRange.start}-${previousRowRange.end}`
          });

          this.updateVirtualRows(previousRowRange, currentRowRange);
          this.lastVisibleRows = currentRowRange;
        }
      }
    );

    // HYDRATION OBSERVER: Re-render when grid becomes fully hydrated (for late-arriving data)
    reaction(
      () => this.initStore.isFullyHydrated,
      (isHydrated) => {
        if (isHydrated && this.observersEnabled) {
          fileLog.debug('🎯 Grid fully hydrated - triggering render for any pending data', {
            rowCount: this.tableCoreStore.processedRows.length
          });
          // Re-render to show any data that arrived during initialization
          this.renderBody();
        }
      }
    );

    fileLog.debug('✅ Focused observers initialized');
  }


  /**
   * Initialize Header Renderer
   */
  private initHeaderRenderer(): void {
    if (!this.headerContainer || !this.domFactory) {
      fileLog.warn('🎨 Cannot initialize HeaderRenderer - missing dependencies');
      return;
    }
    
    fileLog.debug('🎨 Initializing Header Renderer');
    
    this.headerRenderer = new HeaderRenderer({
      headerContainer: this.headerContainer,
      tableCoreStore: this.tableCoreStore,
      interactionStore: this.interactionStore,
      visualStateStore: this.visualStateStore,
      domFactory: this.domFactory,
      selectionController: this.selectionController ?? undefined,
      coordinateMapping: this.coordinateMapping,
      enableSelectionColumn: this.options.enableSelectionColumn,
      updateCoordinateMapping: (mapping: CoordinateMapping) => {
        this.coordinateMapping = mapping;

        // GUARD: Only update coordinate mapping if grid is fully initialized
        if (!this.initStore.isFullyHydrated) {
          fileLog.debug('⏸️ COORDINATE: Skipping coordinate mapping update during initialization');
          return;
        }

        // CRITICAL: OverlayManager still needs coordinate mapping for positioning overlays
        this.overlayManager?.updateCoordinateMapping(mapping);
        fileLog.debug('🔄 Coordinate mapping updated for overlays', {
          rowCount: mapping.rows.length,
          columnCount: mapping.columns.length,
          version: mapping.version
        });
      }
    });
    
    fileLog.debug('✅ Header Renderer initialized');
  }
  
  /**
   * Post-initialization setup after all managers are created
   */
  private postInitialization(): void {
    fileLog.info('[VGDEBUG] 🚀 Starting post-initialization');

    // Phase 1: Quick synchronous operations that don't cause reflows
    // Initialize hybrid coordinate system position tracking (mostly calculations)
    this.initializePositionTracking();

    // Phase 2: Defer DOM measurements and controller initialization
    requestAnimationFrame(() => {
      // Guard: Skip if instance was destroyed (React StrictMode remount)
      if (this.isDestroyed) {
        fileLog.debug('[VGDEBUG] ⏭️ Skipping postInit RAF - instance destroyed', {
          instanceId: this.rendererInstanceId
        });
        return;
      }

      fileLog.info('[VGDEBUG] ✅ Phase 2 RAF executing (not destroyed)');

      // Now safe to measure DOM
      const bounds = this.container.getBoundingClientRect();
      // TODO: Add updateViewportDimensions method to VisualStateStore
      // this.visualStateStore.updateViewportDimensions(bounds.width, bounds.height);

      // Initialize enhanced ScrollController with comprehensive event handling
      if (!this.viewport) {
        fileLog.error('❌ Viewport not initialized - cannot create ScrollController', {
          instanceId: this.rendererInstanceId,
          viewportProperty: this.viewport,
          viewportElement: document.querySelector('.vibegridx-viewport'),
          bodyContainer: this.bodyContainer,
          container: this.container
        });
        return;
      }

      this.scrollController = new ScrollController({
        viewport: this.viewport,
        headerViewport: this.headerViewport || undefined,
        container: this.container,
        onClickOutside: (e: MouseEvent) => {
          // ✅ Route through InteractionCoordinator for proper service layer handling
          if (this.interactionCoordinator) {
            this.interactionCoordinator.handleOutsidePointer(e as PointerEvent);
          } else {
            // Fallback to legacy path if coordinator not available
            this.interactionStore.handleOutsideClick();
          }
        },
        onScroll: (scrollLeft: number, scrollTop: number) => {
          // Update scroll position in VisualStateStore
          runInAction(() => {
            this.visualStateStore.scrollLeft = scrollLeft;
            this.visualStateStore.scrollTop = scrollTop;
          });

          // DEBUGGING: Log detailed width calculations during scroll
          // Wrapped in runInAction to access MobX computed values in reactive context
          runInAction(() => {
            const viewport = this.viewport;
            const headerViewport = this.headerViewport;

            fileLog.debug('📜 SCROLL DEBUG - Width Calculations', {
              scrollLeft,
              scrollTop,
              // Visual state geometry
              visualStateTotalWidth: this.visualStateStore.geometry.totalWidth,
              visualStateViewportWidth: this.visualStateStore.geometry.viewportWidth,
              // Visible columns analysis
              visibleColumnsCount: this.visualStateStore.visibleColumns.length,
              columnLayouts: this.visualStateStore.visibleColumns.map((col: any) => ({
                id: col.id,
                width: col.width,
                xOffset: col.xOffset,
                visible: col.visible
              })),
              // DOM dimensions
              viewportClientWidth: viewport?.clientWidth,
              viewportScrollWidth: viewport?.scrollWidth,
              headerViewportClientWidth: headerViewport?.clientWidth,
              headerViewportScrollWidth: headerViewport?.scrollWidth,
              // Transform states
              headerTransform: headerViewport?.style.transform,
              // Scroll edge analysis
              scrollRightEdge: scrollLeft + (viewport?.clientWidth || 0),
              totalScrollableWidth: (viewport?.scrollWidth || 0) - (viewport?.clientWidth || 0),
              scrollProgress: viewport?.scrollWidth ? (scrollLeft / ((viewport.scrollWidth - viewport.clientWidth) || 1) * 100).toFixed(1) + '%' : '0%'
            });
          });
        },
        keyboardNavController: this.keyboardNavController,
        selectionController: this.selectionController,
        interactionStore: this.interactionStore
      });

      // Create service layer before MouseController
      // Note: EditSessionManager is created in OverlayManager and accessed via its getter
      const editSessionManager = this.overlayManager?.getEditSessionManager();

      if (!editSessionManager) {
        const error = new Error(
          'EditSessionManager not available from OverlayManager. ' +
          'Ensure initOverlayManager() is called before initPhase2Managers().'
        );
        fileLog.error('FATAL: EditSessionManager not available', { error });
        throw error;
      }

      // Create SelectionService with coordinate manager
      this.selectionService = new SelectionService(
        this.interactionStore,
        this.tableCoreStore,
        this.visualStateStore,
        this.stores.coordinateManager
      );

      // Create CellActionRouter
      this.cellActionRouter = new CellActionRouter(
        editSessionManager,
        this.options.onCellClick
      );

      // Create InteractionCoordinator
      this.interactionCoordinator = new InteractionCoordinator(
        this.container,
        this.interactionStore,
        this.selectionService,
        this.cellActionRouter,
        editSessionManager,
        this.tableCoreStore,
        this.visualStateStore
      );

      // Initialize MouseController for centralized mouse event handling
      this.mouseController = new MouseController({
        container: this.container,
        bodyRenderer: this.bodyRenderer,
        scrollController: this.scrollController,
        selectionController: this.selectionController,
        interactionStore: this.interactionStore,
        visualStateStore: this.visualStateStore,
        tableCoreStore: this.tableCoreStore,
        keyboardController: this.keyboardController, // Already initialized in Phase 2
        coordinator: this.interactionCoordinator, // ✅ Pass coordinator
        enableSelectionColumn: this.options.enableSelectionColumn
      });

      // Connect MouseController to KeyboardController for focus management
      if (this.mouseController && this.keyboardController) {
        this.mouseController.setKeyboardController(this.keyboardController);
      }

      // Configure ColumnWidthManager with DOM containers
      if (this.columnWidthManager) {
        this.columnWidthManager.setContainers({
          headerContainer: this.headerContainer,
          bodyContainer: this.bodyContainer,
          headerViewport: this.headerViewport
        });
      }

      // Mark controller dependencies as ready (if initManager exists)
      if (this.initStore) {
        // ✅ FIXED: InitStore DOES have markReady method - uncommented
        fileLog.debug('[VGDEBUG] ✅ Marking viewportReady');
        this.initStore.markReady('viewportReady');
        fileLog.debug('[VGDEBUG] ✅ Controllers ready');
      }

      // Phase 3: Defer overlay and event setup
      requestAnimationFrame(() => {
        // Guard: Skip if instance was destroyed
        if (this.isDestroyed) {
          fileLog.debug('⏭️ Skipping overlay RAF - instance destroyed', {
            instanceId: this.rendererInstanceId
          });
          return;
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

        // Link coordinator to overlay manager for fill handle delegation
        if (this.interactionCoordinator) {
          this.interactionCoordinator.setOverlayManager(this.overlayManager!);
        }

        // Mark remaining dependencies as ready (if initManager exists)
        if (this.initStore) {
          // ✅ FIXED: InitStore DOES have markReady method - uncommented
          fileLog.debug('[VGDEBUG] ✅ Marking eventHandlersReady');
          this.initStore.markReady('eventHandlersReady');
          fileLog.debug('[VGDEBUG] ✅ Overlay and event handlers ready');
        }

        // Phase 4: Defer header render
        requestAnimationFrame(() => {
          // Guard: Skip if instance was destroyed
          if (this.isDestroyed) {
            fileLog.debug('⏭️ Skipping header render RAF - instance destroyed', {
              instanceId: this.rendererInstanceId
            });
            return;
          }

          // Render header first (lighter operation)
          runInAction(() => {
            this.renderHeader();
          });

          // Phase 5: Defer body render to next frame
          requestAnimationFrame(() => {
            // Guard: Skip if instance was destroyed
            if (this.isDestroyed) {
              fileLog.debug('⏭️ Skipping body render RAF - instance destroyed', {
                instanceId: this.rendererInstanceId
              });
              return;
            }

            // Render body and capture ranges in batch
            runInAction(() => {
              this.renderBody();

              // Capture initial visible ranges after body render (MobX computed properties)
              this.lastVisibleColumns = this.visualStateStore.visibleColumnRange;
              this.lastVisibleRows = this.visualStateStore.visibleRowRange;
            });

            // Wait for browser to actually paint before marking as ready
            const paintCompleteTime = performance.now();
            fileLog.debug('🎨 DOM PAINT COMPLETE', {
              event: 'renderBody_complete',
              timestamp: paintCompleteTime,
              rendererState: 'dom_ready_waiting_for_paint'
            });

            // Mark renderer as initialized AFTER browser paint is complete
            requestAnimationFrame(() => {
              // Guard: Skip if instance was destroyed
              if (this.isDestroyed) {
                fileLog.debug('⏭️ Skipping markReady RAF - instance destroyed', {
                  instanceId: this.rendererInstanceId
                });
                return;
              }

              const actualPaintTime = performance.now();
              fileLog.debug('[VGDEBUG] ✅ Marking rendererInitialized');
              this.initStore.markReady('rendererInitialized');

              fileLog.debug('[VGDEBUG] 🖼️ BROWSER PAINT COMPLETE - SKELETON CAN HIDE', {
                event: 'browser_paint_complete',
                timestamp: actualPaintTime,
                paintDuration: actualPaintTime - paintCompleteTime,
                rendererState: 'fully_rendered'
              });
            });

            // Enable observers after initialization is complete
            this.observersEnabled = true;
            fileLog.info('🔄 OBSERVERS ENABLED after initialization', {
              observersEnabled: this.observersEnabled,
              timestamp: Date.now(),
              visualObserverExists: !!this.visualObserverDisposer
            });

            // NOW attach reactive observers AFTER initialization is complete
            fileLog.info('🎯 Attaching focused observers after initialization complete');
            this.initFocusedObservers();
            fileLog.info('✅ Focused observers initialized successfully');

            fileLog.debug('✅ Post-initialization complete');
          });
        });
      });
    });
  }

  /**
   * Initialize hybrid coordinate system position tracking
   */
  private initializePositionTracking(): void {
    fileLog.debug('🎯 Initializing hybrid position tracking system');

    // Initialize DOM position tracking
    positionTracker.initialize(this.container);

    // Initialize virtual bounds with current data
    const columns = this.visualStateStore.columns;
    const columnWidths = columns.map(col => col.width || GRID_DIMENSIONS.DEFAULT_COLUMN_WIDTH);
    const totalRows = this.tableCoreStore.processedRows.length;

    updateVirtualBounds({
      totalRows,
      columnWidths,
      rowHeight: GRID_DIMENSIONS.ROW_HEIGHT
    });

    // Initialize virtual viewport
    const bounds = this.container.getBoundingClientRect();
    updateVirtualViewport({
      viewportWidth: bounds.width,
      viewportHeight: bounds.height,
      scrollTop: 0,
      scrollLeft: 0
    });

    fileLog.debug('✅ Hybrid position tracking initialized', {
      totalRows,
      columnCount: columns.length,
      viewportSize: `${bounds.width}x${bounds.height}`
    });
  }

  /**
   * Check if virtual range changed and trigger re-render if needed
   * This runs outside the reactive context to avoid observer cascades
   */
  private checkVirtualRangeChange(): void {
    // Skip during initialization to prevent multiple renders
    // Check rendererInitialized specifically to ensure we're completely done
    if (!this.initStore.hydrationState.rendererInitialized) {
      return;
    }

    // Get current visual state outside of observer context
    const visualState = this.visualStateStore;
    const currentColumnRange = visualState.geometry.visibleColumnRange;
    const currentRowRange = visualState.geometry.visibleRowRange;

    // Check if visible column range changed (horizontal virtual scrolling)
    const previousColumnRange = this.lastVisibleColumns || { start: -1, end: -1 };
    const columnRangeChanged =
      currentColumnRange.start !== previousColumnRange.start ||
      currentColumnRange.end !== previousColumnRange.end;

    // Check if visible row range changed (vertical virtual scrolling)
    const previousRowRange = this.lastVisibleRows || { start: -1, end: -1 };
    const rowRangeChanged =
      currentRowRange.start !== previousRowRange.start ||
      currentRowRange.end !== previousRowRange.end;

    // Only handle column range changes (row changes handled by direct scroll observer)
    if (columnRangeChanged) {
      fileLog.debug('🔄 Column range changed - triggering body re-render', {
        columnRangeChanged,
        oldColumnRange: `${previousColumnRange.start}-${previousColumnRange.end}`,
        newColumnRange: `${currentColumnRange.start}-${currentColumnRange.end}`
      });

      // Update tracking
      this.lastVisibleColumns = currentColumnRange;

      // For column changes, need full re-render
      this.renderBody();
    }
  }

  /**
   * Incremental virtual scrolling - only add/remove rows that changed
   */
  /**
   * Create appropriate row element based on row type (group vs data)
   * Matches renderBody() logic exactly for consistency
   */
  private createRowElementByType(
    row: any,
    rowIndex: number,
    columns: any[],
    columnVisibility: Record<string, boolean>,
    baseOffset: number
  ): HTMLElement {
    if (row.type === 'group') {
      return this.bodyRenderer!.createGroupHeaderElement(row, rowIndex);
    }
    return this.bodyRenderer!.createRowElement(row, rowIndex, columns, columnVisibility, baseOffset);
  }

  private updateVirtualRows(
    previousRange: { start: number; end: number },
    currentRange: { start: number; end: number }
  ): void {
    if (!this.bodyContainer || !this.bodyRenderer) return;

    const rows = this.tableCoreStore.processedRows;
    const columns = this.tableCoreStore.columns;
    const columnVisibility = this.visualStateStore.columnVisibility;
    const visualState = this.visualStateStore;
    const allVisibleColumnLayouts = visualState.visibleColumns;
    const baseOffset = this.calculateBaseOffset();

    fileLog.debug('🚀 INCREMENTAL UPDATE: Virtual rows changed', {
      previousRange: `${previousRange.start}-${previousRange.end}`,
      currentRange: `${currentRange.start}-${currentRange.end}`,
      totalRows: rows.length,
      action: 'incremental_update'
    });

    // If this is the first render (previous was -1 to -1), create all visible rows
    if (previousRange.start === -1) {
      fileLog.debug('🎯 INITIAL RENDER: Creating all visible rows', {
        range: `${currentRange.start}-${currentRange.end}`,
        count: currentRange.end - currentRange.start + 1
      });

      for (let i = currentRange.start; i < currentRange.end && i < rows.length; i++) {
        const rowElement = this.createRowElementByType(rows[i], i, columns, columnVisibility, baseOffset);
        this.bodyContainer.appendChild(rowElement);
      }
      return;
    }

    // Remove rows that are no longer visible
    if (currentRange.start > previousRange.start) {
      for (let i = previousRange.start; i < currentRange.start && i <= previousRange.end; i++) {
        const rowElement = this.bodyContainer.querySelector(`[data-row-id="${rows[i]?.id}"]`);
        if (rowElement) {
          this.bodyContainer.removeChild(rowElement);
          fileLog.debug('🗑️ REMOVED row', { rowIndex: i, rowId: rows[i]?.id });
        }
      }
    }

    if (currentRange.end < previousRange.end) {
      for (let i = currentRange.end; i < previousRange.end && i < rows.length; i++) {
        const rowElement = this.bodyContainer.querySelector(`[data-row-id="${rows[i]?.id}"]`);
        if (rowElement) {
          this.bodyContainer.removeChild(rowElement);
          fileLog.debug('🗑️ REMOVED row', { rowIndex: i, rowId: rows[i]?.id });
        }
      }
    }

    // Add new rows that became visible
    if (currentRange.start < previousRange.start) {
      // Insert new rows at the top in correct order
      const fragment = document.createDocumentFragment();
      for (let i = currentRange.start; i < previousRange.start && i < rows.length; i++) {
        const rowElement = this.createRowElementByType(rows[i], i, columns, columnVisibility, baseOffset);
        fragment.appendChild(rowElement);
        fileLog.debug('➕ ADDED row (top)', { rowIndex: i, rowId: rows[i]?.id, rowType: rows[i]?.type });
      }
      // Insert at the beginning of the container
      this.bodyContainer.insertBefore(fragment, this.bodyContainer.firstChild);
    }

    if (currentRange.end > previousRange.end) {
      const fragment = document.createDocumentFragment();
      for (let i = previousRange.end; i < currentRange.end && i < rows.length; i++) {
        const rowElement = this.createRowElementByType(rows[i], i, columns, columnVisibility, baseOffset);
        fragment.appendChild(rowElement);
        fileLog.debug('➕ ADDED row (bottom)', { rowIndex: i, rowId: rows[i]?.id, rowType: rows[i]?.type });
      }
      // Append to the end of the container
      this.bodyContainer.appendChild(fragment);
    }

    fileLog.debug('✅ INCREMENTAL UPDATE: Complete', {
      previousRange: `${previousRange.start}-${previousRange.end}`,
      currentRange: `${currentRange.start}-${currentRange.end}`,
      totalRowsNow: this.bodyContainer.children.length
    });
  }

  /**
   * Initialize DOM structure
   */
  private initDOM(): void {
    fileLog.debug('🎨 initDOM called', { instanceId: this.rendererInstanceId });
    if (!this.container) {
      fileLog.error('❌ Container is null - cannot initialize DOM', {
        instanceId: this.rendererInstanceId,
        containerExists: !!this.container,
        containerType: typeof this.container
      });
      return;
    }
    fileLog.debug('✅ Container exists, creating DOM structure', { instanceId: this.rendererInstanceId });

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
    
    // Create header clip wrapper (clips the visible area)
    const headerClipWrapper = this.createElement('div', 'vibegridx-header-clip');
    headerClipWrapper.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: ${HEADER_HEIGHT}px;
      overflow: hidden;
      z-index: 10;
      background: hsl(var(--muted));
      border-bottom: 1px solid hsl(var(--border));
    `;

    // Create header viewport (can be as wide as needed, moved with transform)
    this.headerViewport = this.createElement('div', 'vibegridx-header-viewport');
    this.headerViewport.style.cssText = `
      position: relative;
      height: ${HEADER_HEIGHT}px;
      width: max-content;
      min-width: 100%;
      will-change: transform;
      /* border: 2px solid blue !important; */
      box-sizing: border-box;
    `;
    this.headerViewport.appendChild(this.headerContainer);
    headerClipWrapper.appendChild(this.headerViewport);
    
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
      /* border: 2px solid red !important; */
      box-sizing: border-box;
    `;

    this.viewport.appendChild(this.bodyContainer);

    // Assemble the complete structure
    table.appendChild(headerClipWrapper);
    table.appendChild(this.viewport);
    this.container.appendChild(table);

    fileLog.debug('✅ Basic DOM structure created', {
      instanceId: this.rendererInstanceId,
      viewportSet: !!this.viewport,
      bodyContainerSet: !!this.bodyContainer,
      headerContainerSet: !!this.headerContainer
    });
  }
  
  /**
   * Legacy observers setup - removed, now using ObserverManager
   */
  private setupObservers(): void {
    // This method is kept for compatibility but now delegates to ObserverManager
    // All observer logic has been moved to ObserverManager.ts
    
    // Context menu handling is now done by EventManager in Phase 2
    
    fileLog.debug('✅ Legacy setupObservers() called - using ObserverManager instead');
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
    if (!this.bodyContainer || !this.bodyRenderer) return;

    const renderStartTime = performance.now();
    fileLog.debug('🎨 DOM RENDER START', {
      event: 'renderBody_start',
      timestamp: renderStartTime
    });

    // GUARD: Only render if grid is fully initialized OR if this is the initial render call
    const isFullyInitialized = this.initStore.isFullyHydrated;
    const rendererInitialized = this.initStore.hydrationState.rendererInitialized;

    // Allow initial render before renderer is marked as initialized
    if (!isFullyInitialized && rendererInitialized) {
      fileLog.debug('⏸️ RENDER_BODY: Skipping render during initialization');
      return;
    }

    // Use processed rows from TableCoreStore (includes filtering, sorting, grouping)
    const rows = this.tableCoreStore.processedRows;
    const columns = this.tableCoreStore.columns;
    const columnVisibility = this.visualStateStore.columnVisibility;

    // Debug: Check if we have group rows
    const groupRows = rows.filter((row: any) => row.type === 'group');
    const dataRows = rows.filter((row: any) => !row.type || row.type !== 'group'); // All non-group rows are data

    // TEMP DEBUG: Add stack trace back to identify remaining multiple render sources
    const stack = new Error().stack?.split('\n').slice(1, 4).join('\n') || 'No stack available';

    fileLog.debug('🎨 Rendering body with Phase 2 managers', {
      rowCount: rows.length,
      columnCount: columns.length,
      groupRows: groupRows.length,
      dataRows: dataRows.length,
      firstRowTitle: rows[0]?.title,
      callStack: stack
    });

    // PERFORMANCE FIX: Use DocumentFragment for batched DOM operations instead of innerHTML clearing
    const fragment = document.createDocumentFragment();

    // Clear active rows in RowRenderer
    this.bodyRenderer.clearActiveRows();

    // PERFORMANCE FIX: Clear body container more efficiently
    while (this.bodyContainer.firstChild) {
      this.bodyContainer.removeChild(this.bodyContainer.firstChild);
    }
    
    // Update content dimensions in visual state
    // Calculate total height by summing individual row heights (groups/data may differ)
    const totalHeight = rows.reduce((sum: number, row: any) => sum + (row.height || ROW_HEIGHT), 0);
    runInAction(() => {
      this.visualStateStore.rowCount = rows.length; // Use processedRows length (includes groups)
    });

    // Update row coordinate mapping
    this.coordinateMapping.rows = [];

    // Virtual scrolling: Only render visible rows - use visual observables
    const visualState = this.visualStateStore;

    // CRITICAL FIX: Set body container width to enable proper horizontal scrolling
    // The body container must be wide enough to accommodate all content
    if (this.bodyContainer) {
      this.bodyContainer.style.width = `${visualState.geometry.totalWidth}px`;
      this.bodyContainer.style.minWidth = `${visualState.geometry.totalWidth}px`;
      // CRITICAL FIX: Set correct height to maintain scroll position during virtual scrolling
      this.bodyContainer.style.height = `${totalHeight}px`;
    }
    const visibleRange = visualState.geometry.visibleRowRange;
    const startIndex = Math.max(0, visibleRange.start);
    const endIndex = Math.min(rows.length, visibleRange.end);
    const visibleRows = rows.slice(startIndex, endIndex);

    fileLog.info('🎨 ROW 16 DEBUG - Body rendering range', {
      totalRows: rows.length,
      visibleRangeRaw: visibleRange,
      startIndex,
      endIndex,
      sliceArgs: `slice(${startIndex}, ${endIndex})`,
      rendering: visibleRows.length,
      renderedRowIds: visibleRows.map((r: any) => r.id),
      totalColumns: visualState.visibleColumns.length
    });
    
    // Get ALL visible columns from unified visual state (same as HeaderRenderer - no virtualization)
    // This ensures header and body are always in sync after column reordering
    const allVisibleColumnLayouts = visualState.visibleColumns;

    // Calculate base offset including drag column width for grouped mode
    const baseOffset = this.calculateBaseOffset();

    // Always start from base offset when rendering all columns (matches HeaderRenderer)
    const startX = baseOffset;

    // Convert column layouts back to columns for compatibility with existing renderer
    // Use ALL visible columns like HeaderRenderer to maintain sync after column reorder
    // CRITICAL: Enrich columns with actual widths from columnWidths state
    const virtualColumns = allVisibleColumnLayouts.map(layout => {
      const column = columns.find(col => col.id === layout.id);
      if (!column) return null;

      // Enrich with actual width from layout (which includes columnWidths state)
      return {
        ...column,
        width: layout.width  // Use width from columnLayouts (respects columnWidths state)
      };
    }).filter(Boolean);
    
    // Render only visible rows using RowRenderer
    visibleRows.forEach((row, visibleIndex) => {
      const actualRowIndex = startIndex + visibleIndex;
      
      let rowElement: HTMLElement;
      
      // Check if this is a group header or data row
      if (row.type === 'group') {
        fileLog.debug('🎯 Rendering group row', { 
          rowId: row.id, 
          level: row.level,
          isExpanded: row.isExpanded,
          data: row.data
        });
        rowElement = this.bodyRenderer!.createGroupHeaderElement(row, actualRowIndex);
      } else {
        rowElement = this.bodyRenderer!.createRowElement(row, actualRowIndex, virtualColumns, columnVisibility, startX);
      }

      // PERFORMANCE FIX: Append to DocumentFragment instead of directly to DOM
      fragment.appendChild(rowElement);
    });

    // PERFORMANCE FIX: Single DOM operation instead of multiple appendChild calls
    this.bodyContainer.appendChild(fragment);
    
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

      // Also update the shared coordinator with row data
      // The coordinator only uses row.id, so we can pass rows as-is
      this.stores.coordinateManager.updateRows(rows as any, this.visualStateStore.sortBy)

      fileLog.debug('🔄 Row coordinate mapping updated (local + shared coordinator)', {
        newRowCount: newRows.length,
        firstRowId: newRows[0]?.rowId,
        mappingVersion: this.coordinateMapping.version,
        sampleRows: newRows.slice(0, 3).map(r => ({ id: r.rowId, y: r.y }))
      });

      // GUARD: Only update coordinate mapping if grid is fully initialized
      const isFullyInitialized = this.initStore.isFullyHydrated;
      if (!isFullyInitialized) {
        fileLog.debug('⏸️ COORDINATE: Skipping coordinate mapping update during initialization (renderBody)');
        return;
      }

      // CRITICAL: OverlayManager still needs coordinate mapping for positioning overlays
      this.overlayManager?.updateCoordinateMapping(this.coordinateMapping);

      // PERFORMANCE FIX: Update position tracker with coordinate mapping for computed positions
      positionTracker.updateCoordinateMapping(this.coordinateMapping);
    }

    // PERFORMANCE FIX: Remove expensive DOM position tracking during render
    // Position tracking should be derived from coordinate mapping, not DOM scanning
    // The coordinate mapping already contains all position information needed
    // TODO: Refactor position tracker to use computed observables from coordinateMapping
    if (this.initStore.isFullyHydrated) {
      // Coordinate mapping is already updated above - position tracker should react to that
      // instead of doing expensive DOM scanning
      fileLog.debug('🚀 PERF: Skipping expensive DOM position update - using coordinate mapping instead');
    }

    fileLog.debug('✅ Body rendered with Phase 2 managers');
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
    
    fileLog.debug('✅ DOM selection classes updated', { selectedCount: selectedCells.size });
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
    
    fileLog.debug('✅ Visual cell positions calculated', { 
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
    return CellFormatter.formatCellValue(value);
  }
  
  // Removed redundant formatting methods - now using centralized display formatters
  
  /**
   * Handle consolidated visual state changes - batched column, visibility, and viewport updates
   * This prevents cascade effects and reduces render cycles from 5+ to 1
   */
  private handleConsolidatedVisualStateChange(visualState: VisualState): void {
    fileLog.debug('🎨 Consolidated visual state change - batched render coordination', {
      columnCount: visualState.columns?.length ?? 0,
      hiddenColumns: visualState.columnVisibility ? Object.values(visualState.columnVisibility).filter(v => v === false).length : 0,
      viewport: visualState.viewport
    });

    // Apply Legend State batching pattern to prevent multiple DOM updates
    runInAction(() => {
      // Determine what actually changed to optimize renders
      const previousState = this.lastVisualState;

      // Check if header needs to be re-rendered
      const needsHeaderRender = !previousState ||
        (previousState.columns?.length ?? 0) !== (visualState.columns?.length ?? 0) ||
        JSON.stringify(previousState.columnVisibility) !== JSON.stringify(visualState.columnVisibility) ||
        JSON.stringify((previousState.columns ?? []).map((c: any) => c.width)) !== JSON.stringify((visualState.columns ?? []).map((c: any) => c.width));

      // Check if body needs to be re-rendered (viewport changes affect body virtual scrolling)
      // Add scroll thresholds to prevent excessive re-renders on small scroll changes
      const scrollThreshold = 20; // Only re-render if scroll changes by more than 20px
      const scrollTopChanged = !previousState ||
        Math.abs(previousState.viewport.scrollTop - visualState.viewport.scrollTop) > scrollThreshold;
      const scrollLeftChanged = !previousState ||
        Math.abs(previousState.viewport.scrollLeft - visualState.viewport.scrollLeft) > scrollThreshold;

      const needsBodyRender = !previousState ||
        scrollTopChanged ||
        scrollLeftChanged ||
        previousState.viewport.viewportWidth !== visualState.viewport.viewportWidth ||
        previousState.viewport.viewportHeight !== visualState.viewport.viewportHeight ||
        needsHeaderRender; // Body depends on header changes

      fileLog.debug('🎯 Render decisions', {
        needsHeaderRender,
        needsBodyRender,
        hasLastState: !!previousState
      });

      // Single coordinated render cycle instead of separate renders
      if (needsHeaderRender) {
        this.renderHeader();
      }

      if (needsBodyRender) {
        this.renderBody();
      }

      // Store current state for next comparison
      this.lastVisualState = {
        ...visualState,
        columns: visualState.columns ? [...visualState.columns] : [],
        columnVisibility: visualState.columnVisibility ? { ...visualState.columnVisibility } : {},
        viewport: visualState.viewport ? { ...visualState.viewport } : {}
      };
    });

    // Viewport handling is now fully integrated into consolidated visual state
    // No need to call handleViewportChange() as it would duplicate the work
  }

  /**
   * Handle viewport changes (scroll and dimension updates)
   * SIMPLIFIED: Virtual scrolling updates now handled by focused scroll observer
   */
  private handleViewportChange(): void {
    // Update overlay selection with current viewport position (lightweight)
    if (this.overlayManager) {
      // Selection overlay is now handled reactively by OverlayManager via interactions observable
      // Viewport changes are handled automatically by the hybrid coordinate system
    }

    fileLog.debug('⏭️ Viewport change - virtual scrolling handled by scroll observer');
  }

  // ====================================
  // UTILITY METHODS
  // ====================================

  /**
   * Calculate rectangular selection range including all interior cells
   */
  private calculateRectangularSelection(startCell: string, endCell: string): string[] {
    const [startRowId, startColId] = startCell.split(':');
    const [endRowId, endColId] = endCell.split(':');

    // Get current data and columns for range calculation
    const processedRows = this.tableCoreStore.processedRows;
    const columns = this.visualStateStore.columns;
    const columnVisibility = this.visualStateStore.columnVisibility;
    const visibleColumns = columns.filter(col => columnVisibility[col.id] !== false);

    // Find row and column indices
    const startRowIndex = processedRows.findIndex((row: any) => row.id === startRowId);
    const endRowIndex = processedRows.findIndex((row: any) => row.id === endRowId);
    const startColIndex = visibleColumns.findIndex(col => col.id === startColId);
    const endColIndex = visibleColumns.findIndex(col => col.id === endColId);

    if (startRowIndex === -1 || endRowIndex === -1 || startColIndex === -1 || endColIndex === -1) {
      // Fallback to just the two cells if indices not found
      return [startCell, endCell];
    }

    // Ensure proper ordering (top-left to bottom-right)
    const minRowIndex = Math.min(startRowIndex, endRowIndex);
    const maxRowIndex = Math.max(startRowIndex, endRowIndex);
    const minColIndex = Math.min(startColIndex, endColIndex);
    const maxColIndex = Math.max(startColIndex, endColIndex);

    // Generate all cells in the rectangular range
    const selectedCells: string[] = [];
    for (let rowIndex = minRowIndex; rowIndex <= maxRowIndex; rowIndex++) {
      for (let colIndex = minColIndex; colIndex <= maxColIndex; colIndex++) {
        const row = processedRows[rowIndex];
        const column = visibleColumns[colIndex];
        if (row && column) {
          selectedCells.push(`${row.id}:${column.id}`);
        }
      }
    }

    fileLog.debug('🔢 Calculated rectangular selection', {
      startCell,
      endCell,
      rowRange: `${minRowIndex}-${maxRowIndex}`,
      colRange: `${minColIndex}-${maxColIndex}`,
      totalCells: selectedCells.length
    });

    return selectedCells;
  }

  /**
   * Update column width via direct style manipulation (no re-render)
   *
   * This is highly efficient for column resize operations:
   * - Updates header cell width
   * - Updates all body cells in that column
   * - Maintains header/body sync
   * - No DOM destruction/recreation
   */
  private updateColumnWidth(columnId: string, newWidth: number): void {
    const startTime = performance.now();
    let cellsUpdated = 0;

    // Update header cell
    if (this.headerContainer) {
      const headerCell = this.headerContainer.querySelector(
        `[data-column-id="${columnId}"]`
      ) as HTMLElement;

      if (headerCell) {
        headerCell.style.width = `${newWidth}px`;
        headerCell.style.minWidth = `${newWidth}px`;
        headerCell.style.maxWidth = `${newWidth}px`;
        cellsUpdated++;

        fileLog.debug('[RESIZE] 📏 Header cell width updated', {
          columnId,
          newWidth
        });
      }
    }

    // Update all body cells in this column
    if (this.bodyContainer) {
      const bodyCells = this.bodyContainer.querySelectorAll(
        `[data-column-id="${columnId}"]`
      );

      bodyCells.forEach((cell) => {
        const cellElement = cell as HTMLElement;
        cellElement.style.width = `${newWidth}px`;
        cellElement.style.minWidth = `${newWidth}px`;
        cellElement.style.maxWidth = `${newWidth}px`;
        cellsUpdated++;
      });
    }

    // Update positions of columns to the right of the resized column
    const resizedColumnIndex = this.visualStateStore.columnLayouts.findIndex(
      col => col.id === columnId
    );

    if (resizedColumnIndex !== -1) {
      const layouts = this.visualStateStore.columnLayouts;

      // Update all columns after the resized one
      for (let i = resizedColumnIndex + 1; i < layouts.length; i++) {
        const layout = layouts[i];

        // Update header cell position
        if (this.headerContainer) {
          const headerCell = this.headerContainer.querySelector(
            `[data-column-id="${layout.id}"]`
          ) as HTMLElement;
          if (headerCell) {
            headerCell.style.left = `${layout.xOffset}px`;
            cellsUpdated++;
          }
        }

        // Update all body cells position
        if (this.bodyContainer) {
          const bodyCells = this.bodyContainer.querySelectorAll(
            `[data-column-id="${layout.id}"]`
          );
          bodyCells.forEach(cell => {
            (cell as HTMLElement).style.left = `${layout.xOffset}px`;
            cellsUpdated++;
          });
        }
      }
    }

    const duration = performance.now() - startTime;

    fileLog.debug('[RESIZE] ✅ Column width and positions updated via direct style updates', {
      columnId,
      newWidth,
      cellsUpdated,
      columnsRepositioned: resizedColumnIndex !== -1 ? this.visualStateStore.columnLayouts.length - resizedColumnIndex - 1 : 0,
      duration: duration.toFixed(2) + 'ms',
      avgPerCell: cellsUpdated > 0 ? (duration / cellsUpdated).toFixed(3) + 'ms' : 'N/A'
    });
  }

  /**
   * Calculate base X offset including drag column width (always present for consistent layout)
   */
  private calculateBaseOffset(): number {
    const ROW_HEADER_WIDTH = 40;
    const DRAG_COLUMN_WIDTH = 30;

    // Always include both columns for consistent layout
    return DRAG_COLUMN_WIDTH + ROW_HEADER_WIDTH;  // 30px + 40px = 70px
  }

  /**
   * Check if we're currently in grouped mode
   */
  private isGroupedMode(): boolean {
    try {
      const groupConfig = this.visualStateStore.groupConfig;
      return !!(groupConfig && groupConfig.fields && groupConfig.fields.length > 0);
    } catch (error) {
      // If visual operations aren't available, fallback to direct check (MobX)
      const groupConfig = this.visualStateStore.groupConfig;
      return !!(groupConfig && groupConfig.fields && groupConfig.fields.length > 0);
    }
  }

  /**
   * Destroy the renderer
   */
  destroy(): void {
    this.isDestroyed = true;
    fileLog.debug('🧹 Destroying SimplePassiveRenderer with Phase 2 managers', {
      instanceId: this.rendererInstanceId
    });

    // Cancel any pending RAF
    if (this.pendingRAF !== null) {
      cancelAnimationFrame(this.pendingRAF);
      this.pendingRAF = null;
    }

    // Clean up focused observers
    if (this.granularUpdateObserverDisposer) {
      this.granularUpdateObserverDisposer();
      this.granularUpdateObserverDisposer = null;
    }
    if (this.dataObserverDisposer) {
      this.dataObserverDisposer();
      this.dataObserverDisposer = null;
    }
    if (this.visualObserverDisposer) {
      this.visualObserverDisposer();
      this.visualObserverDisposer = null;
    }
    if (this.columnVisibilityObserverDisposer) {
      this.columnVisibilityObserverDisposer();
      this.columnVisibilityObserverDisposer = null;
    }
    if (this.columnOrderObserverDisposer) {
      this.columnOrderObserverDisposer();
      this.columnOrderObserverDisposer = null;
    }
    if (this.columnWidthsObserverDisposer) {
      this.columnWidthsObserverDisposer();
      this.columnWidthsObserverDisposer = null;
    }
    if (this.virtualScrollObserverDisposer) {
      this.virtualScrollObserverDisposer();
      this.virtualScrollObserverDisposer = null;
    }
    if (this.interactionObserverDisposer) {
      this.interactionObserverDisposer();
      this.interactionObserverDisposer = null;
    }
    if (this.scrollObserverDisposer) {
      this.scrollObserverDisposer();
      this.scrollObserverDisposer = null;
    }
    if (this.dragSelectionObserverDisposer) {
      this.dragSelectionObserverDisposer();
      this.dragSelectionObserverDisposer = null;
    }
    
    // Clean up Phase 2 managers
    if (this.eventManager) {
      this.eventManager.destroy();
      this.eventManager = null;
    }
    
    // ViewportManager cleanup not needed - visual-state handles this
    
    // Clean up ScrollController
    if (this.scrollController) {
      this.scrollController.destroy();
      this.scrollController = null;
    }

    // Clean up MouseController
    if (this.mouseController) {
      this.mouseController.destroy();
      this.mouseController = null;
    }

    // Clean up KeyboardController
    if (this.keyboardController) {
      this.keyboardController.destroy();
      this.keyboardController = null;
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

    // Clean up HeaderRenderer reactive observers
    if (this.headerRenderer) {
      this.headerRenderer.dispose();
      this.headerRenderer = null;
    }

    // RowRenderer and CellRenderer don't need explicit cleanup
    this.bodyRenderer = null;
    
    // Clean up legacy disposers (if any remain)
    this.disposers.forEach(dispose => dispose());
    this.disposers = [];
    
    // Clean up hybrid position tracking
    positionTracker.cleanup();

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
    
    fileLog.debug('✅ SimplePassiveRenderer destroyed with all Phase 2 managers cleaned up');
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


}