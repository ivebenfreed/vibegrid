/**
 * SimplePassiveRenderer - Basic working table without overlays
 *
 * This is a simplified version to get the basic table working first,
 * then we can add overlays back once we have the foundation working.
 */

import { runInAction } from 'mobx'
import { getLogger } from '@/shared/lib/logging'
// New hybrid coordinate system imports
import { GRID_DIMENSIONS } from '../../constants/grid-dimensions'
// Service layer
import { InteractionCoordinator } from '../../coordination/InteractionCoordinator'
import { vibeGridProfiler } from '../../performance/PerformanceProfiler'
import { CellActionRouter, type OnCellClickCallback } from '../../routing/CellActionRouter'
import { SelectionService } from '../../services/SelectionService'
import { positionTracker } from '../../stores/dom-position-state'
import { DragDropManager } from '../../utils/drag-drop-handlers'
// VirtualScrollManager removed in P2 consolidation - viewport state now in ViewportStore
// Manager imports (ViewportManager consolidated into visual-state)
import { BodyRenderer, CellFormatter } from '../components/BodyRenderer'
import type { GroupRenderer } from '../components/GroupRenderer'
import { HeaderRenderer } from '../components/HeaderRenderer'
import { ObserverManager } from './ObserverManager'
import { GridInitBuilder, type GridInitTarget } from './GridInitBuilder'
import { RowPreRenderBuffer } from './RowPreRenderBuffer'
import { GridLineCanvas } from './GridLineCanvas'
import { DOMElementFactory } from '../factories/DOMElementFactory'
import { EventManager } from '../managers/EventManager'
import { ColumnWidthManager } from '../modules/ColumnWidthManager'
import { KeyboardController } from '../modules/KeyboardController'
import { KeyboardNavigationController } from '../modules/KeyboardNavigationController'
import { MouseController } from '../modules/MouseController'
// Existing modular components
import { type CoordinateMapping, OverlayManager } from '../modules/OverlayManager'
import { ScrollController } from '../modules/ScrollController'
import { SelectionController } from '../modules/SelectionController'

const fileLog = getLogger(['custom', 'vibegrid', 'renderers', 'core', 'SimplePassiveRenderer.ts'])

// Use centralized dimensions from the new system
const ROW_HEIGHT = GRID_DIMENSIONS.ROW_HEIGHT
const HEADER_HEIGHT = GRID_DIMENSIONS.HEADER_HEIGHT

// ====================================
// TYPES
// ====================================

// Import MobX store types
import type { VibeGridStores } from '../../stores/context'
import type { DebugStore } from '../../stores/DebugStore'
import type { EditingStore } from '../../stores/EditingStore'
import type { InitStore } from '../../stores/InitStore'
import type { InteractionStore } from '../../stores/InteractionStore'
import type { TableCoreStore } from '../../stores/TableCoreStore'
import type { VisualStateStore } from '../../stores/VisualStateStore'

export interface SimplePassiveRendererOptions {
  container: HTMLElement
  stores: VibeGridStores // REQUIRED: MobX stores
  entityType: string
  enableSelectionColumn?: boolean
  bufferSize?: number
  onEntityUpdate?: (rowId: string, updates: Record<string, any>) => Promise<void> | void
  onBatchEntityUpdate?: (updates: Array<{ id: string; updates: Record<string, any> }>) => Promise<void> | void
  onCellClick?: (rowId: string, columnId: string, event?: MouseEvent) => void
}

export class SimplePassiveRenderer {
  private container: HTMLElement
  private viewport: HTMLElement | null = null
  private headerContainer: HTMLElement | null = null
  private headerViewport: HTMLElement | null = null
  private bodyContainer: HTMLElement | null = null
  private disposers: (() => void)[] = []

  // MobX Store references
  private stores: VibeGridStores
  private tableCoreStore: TableCoreStore
  private visualStateStore: VisualStateStore
  private interactionStore: InteractionStore
  private editingStore: EditingStore
  private initStore: InitStore
  private debugStore: DebugStore
  private hierarchyStore: import('../../stores/HierarchyStore').HierarchyStore
  private entityType: string

  // Basic row management
  private activeRows: Map<string, HTMLElement> = new Map()
  // Cell tracking per row: rowId -> (columnId -> cellElement) for incremental column updates
  private activeCells: Map<string, Map<string, HTMLElement>> = new Map()
  private lastVisibleColumns: { start: number; end: number } | null = null
  private lastVisibleRows: { start: number; end: number } | null = null

  // 🚀 ROW RECYCLING POOL: Reuse DOM elements instead of destroy/create
  // This dramatically improves scroll performance by avoiding DOM creation overhead
  private rowPool: HTMLElement[] = []
  private readonly MAX_POOL_SIZE = 50 // Limit pool to prevent memory bloat

  // Overlay management
  private overlayManager: OverlayManager | null = null

  // Coordinate mapping (maintained locally but synced with overlay manager)
  private coordinateMapping: CoordinateMapping = {
    rows: [],
    columns: [],
    version: 0,
    sortBy: [],
  }

  // Row range selection tracking - now handled by SelectionController
  // Keyboard navigation tracking - now handled by KeyboardNavigationController

  // UI element references
  private selectAllCheckbox: HTMLInputElement | null = null

  // Modular controllers
  private selectionController: SelectionController | null = null
  private keyboardNavController: KeyboardNavigationController | null = null
  private keyboardController: KeyboardController | null = null
  private scrollController: ScrollController | null = null
  private mouseController: MouseController | null = null
  private groupRenderer: GroupRenderer | null = null
  private columnWidthManager: ColumnWidthManager | null = null

  // Service layer
  private interactionCoordinator: InteractionCoordinator | null = null
  private selectionService: SelectionService | null = null
  private cellActionRouter: CellActionRouter | null = null

  // GH#2034 P4: Observer lifecycle delegated to ObserverManager
  private _observerManager: ObserverManager | null = null
  private pendingRAF: number | null = null // Track pending RAF for incremental viewport renders

  private domFactory: DOMElementFactory | null = null
  private headerRenderer: HeaderRenderer | null = null

  // Phase 2 manager additions
  private bodyRenderer: BodyRenderer | null = null
  private eventManager: EventManager | null = null
  private dragDropManager: DragDropManager | null = null

  // GH#1437: Row pre-render buffer for scroll performance
  private preRenderBuffer: RowPreRenderBuffer

  // GH#1442: Canvas-based grid lines for scroll jump visual feedback
  private gridLineCanvas: GridLineCanvas | null = null
  private gridLineCanvasScrollHandler: (() => void) | null = null

  private rendererInstanceId = Math.random().toString(36).substring(7)
  private isDestroyed = false

  constructor(private options: SimplePassiveRendererOptions) {
    this.container = options.container

    // Validate MobX stores are provided
    if (!options.stores) {
      throw new Error('SimplePassiveRenderer: Must provide MobX stores')
    }

    fileLog.debug('🚀 SimplePassiveRenderer: Initializing with MobX stores (PURE MOBX - NO BRIDGE)', {
      instanceId: this.rendererInstanceId,
      hasContainer: !!this.container,
    })

    // Store MobX references
    this.stores = options.stores
    this.tableCoreStore = options.stores.tableCoreStore
    this.visualStateStore = options.stores.visualStateStore
    this.interactionStore = options.stores.interactionStore
    this.editingStore = options.stores.editingStore
    this.initStore = options.stores.initStore
    this.debugStore = options.stores.debugStore
    this.hierarchyStore = options.stores.hierarchyStore
    this.entityType = options.entityType

    // GH#1437: Instantiate row pre-render buffer
    this.preRenderBuffer = new RowPreRenderBuffer()

    fileLog.debug('✅ MobX stores assigned', {
      entityType: this.entityType,
      hasTableCore: !!this.tableCoreStore,
      hasVisualState: !!this.visualStateStore,
      hasInteraction: !!this.interactionStore,
      hasInit: !!this.initStore,
    })

    vibeGridProfiler.startMetric('renderer-initialization', {
      entityType: this.entityType,
    })

    // GH#2034 P4: Type-enforced initialization sequence via GridInitBuilder
    new GridInitBuilder(this as unknown as GridInitTarget)
      .initDOM()
      .initControllers()
      .initDOMFactory()
      .initOverlayManager()
      .initPhase2Managers()
      .initGridLineCanvas()
      .initHeaderRenderer()
      .postInitialization()
      .initObservers()
      .build()

    fileLog.debug('✅ SimplePassiveRenderer initialized with PURE MobX (no bridge)', {
      timestamp: Date.now(),
      entityType: this.entityType,
    })
  }

  /**
   * GH#2034 P4: Initialize ObserverManager and create all MobX reactions.
   * Called as the final step of the init sequence via GridInitBuilder.
   */
  initObservers(): void {
    // Create ObserverManager with deps wired to this renderer instance
    this._observerManager = new ObserverManager({
      tableCoreStore: this.tableCoreStore,
      visualStateStore: this.visualStateStore,
      interactionStore: this.interactionStore,
      editingStore: this.editingStore,
      initStore: this.initStore,
      debugStore: this.debugStore,
      viewportStore: this.stores.viewportStore,
      getBodyRenderer: () => this.bodyRenderer,
      getGridLineCanvas: () => this.gridLineCanvas,
      getViewport: () => this.viewport,
      getBodyContainer: () => this.bodyContainer,
      getPreRenderBuffer: () => this.preRenderBuffer,
      getIsDestroyed: () => this.isDestroyed,
      getLastVisibleColumns: () => this.lastVisibleColumns,
      setLastVisibleColumns: (range) => {
        this.lastVisibleColumns = range
      },
      getLastVisibleRows: () => this.lastVisibleRows,
      setLastVisibleRows: (range) => {
        this.lastVisibleRows = range
      },
      renderBody: () => this.renderBody(),
      renderHeader: () => this.renderHeader(),
      updateColumnWidth: (columnId, width) => this.updateColumnWidth(columnId, width),
      handleIncrementalViewportReady: () => this.handleIncrementalViewportReady(),
      updateVirtualRows: (prev, curr) => this.updateVirtualRows(prev, curr),
      updateVirtualColumns: (prev, curr) => this.updateVirtualColumns(prev, curr),
      setupPreRenderContext: () => this.setupPreRenderContext(),
    })

    // CRITICAL: Enable observers BEFORE initializing them so guards don't block
    this._observerManager.enable()
    fileLog.info('🎯 Initializing focused observers after all components ready')
    this._observerManager.init()
  }

  /**
   * Initialize DOM Element Factory
   */
  private initDOMFactory(): void {
    fileLog.debug('🏭 Initializing DOM Element Factory')

    this.domFactory = new DOMElementFactory({
      interactionStore: this.interactionStore,
      tableCoreStore: this.tableCoreStore,
      selectionController: this.selectionController || undefined,
      enableSelectionColumn: this.options.enableSelectionColumn,
      onEntityUpdate: this.options.onEntityUpdate,
      visualOperations: this.visualStateStore, // ✅ FIXED: Wire up VisualStateStore
    })

    fileLog.debug('✅ DOM Element Factory initialized')
  }

  /**
   * Initialize modular controllers
   */
  private initControllers(): void {
    fileLog.debug('🎮 Initializing modular controllers')

    // Initialize selection controller (MobX version)
    this.selectionController = new SelectionController({
      interactionStore: this.interactionStore,
      getProcessedRows: () => this.tableCoreStore.processedRows,
      getVisibleColumns: () => {
        const columns = this.visualStateStore.columns
        const columnVisibility = this.visualStateStore.columnVisibility
        const columnOrder = this.visualStateStore.columnOrder

        // Filter visible columns
        const visibleColumns = columns.filter((col) => columnVisibility[col.id] !== false)

        // Sort by column order (visual order after drag-and-drop)
        if (columnOrder && columnOrder.length > 0) {
          return visibleColumns.sort((a, b) => {
            const indexA = columnOrder.indexOf(a.id)
            const indexB = columnOrder.indexOf(b.id)
            // If not in order array, put at end
            if (indexA === -1) return 1
            if (indexB === -1) return -1
            return indexA - indexB
          })
        }

        return visibleColumns
      },
      // GH#2804 B10: expose entity name so select-all can route substrate-owned
      // entities through the O(1) marker-mode path (no 100k Set materialization).
      getEntityName: () => this.tableCoreStore.entityType ?? null,
      bodyRenderer: null,
    })

    // Initialize keyboard navigation controller (MobX version)
    this.keyboardNavController = new KeyboardNavigationController({
      interactionStore: this.interactionStore,
      editingStore: this.editingStore,
      selectionController: this.selectionController,
      // GH#2804 round-3 review fix: hand the store through so sparse-row
      // navigation uses the O(1) window-based helpers instead of a linear
      // scan over `processedRows` (~99,900 placeholders at 100k).
      tableCoreStore: this.tableCoreStore,
      getProcessedRows: () => this.tableCoreStore.processedRows,
      getVisibleColumns: () => {
        const columns = this.visualStateStore.columns
        const columnVisibility = this.visualStateStore.columnVisibility
        const columnOrder = this.visualStateStore.columnOrder

        // Filter visible columns
        const visibleColumns = columns.filter((col) => columnVisibility[col.id] !== false)

        // Sort by column order (visual order after drag-and-drop)
        if (columnOrder && columnOrder.length > 0) {
          return visibleColumns.sort((a, b) => {
            const indexA = columnOrder.indexOf(a.id)
            const indexB = columnOrder.indexOf(b.id)
            // If not in order array, put at end
            if (indexA === -1) return 1
            if (indexB === -1) return -1
            return indexA - indexB
          })
        }

        return visibleColumns
      },
      container: this.container,
    })

    // Initialize ColumnWidthManager
    this.columnWidthManager = new ColumnWidthManager({
      headerContainer: null, // Will be set after DOM initialization
      bodyContainer: null, // Will be set after DOM initialization
      headerViewport: null, // Will be set after DOM initialization
    })

    // Note: KeyboardController will be initialized in initPhase2Managers after EventManager is ready
    // Scroll controller will be initialized after DOM is ready in postInitialization()
  }

  /**
   * Initialize Phase 2 managers
   */
  private initPhase2Managers(): void {
    fileLog.info('🚀 Initializing Phase 2 managers - START')

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
      hierarchyStore: this.hierarchyStore,
      domFactory: this.domFactory!,
      selectionController: this.selectionController!,
      keyboardNavController: this.keyboardNavController!,
      enableSelectionColumn: this.options.enableSelectionColumn,
      container: this.container,
      createElement: ((tag: string, className?: string) => this.createElement(tag, className ?? '')) as (
        tag: string,
        className?: string,
      ) => HTMLElement,
      onEntityUpdate: this.options.onEntityUpdate,
      slotRegistry: this.initStore?.slotRegistry,
    })

    // Update SelectionController with bodyRenderer reference
    if (this.selectionController) {
      this.selectionController.bodyRenderer = this.bodyRenderer
    }

    // Initialize DragDropManager for row reordering
    this.dragDropManager = new DragDropManager({
      onRowMove: (draggedRowId: string, targetGroupId: string, newIndex: number) => {
        fileLog.debug('🎯 Row moved', { draggedRowId, targetGroupId, newIndex })
        // Get current group structure to determine the source group
        const processedRows = this.tableCoreStore.processedRows
        // GH#2812 sparse guard: find visits holes as undefined per ECMA-262 §22.1.3.9.
        const draggedRow = processedRows.find((r) => r && r.id === draggedRowId)
        if (!draggedRow || draggedRow.type !== 'data') {
          fileLog.error('❌ Invalid dragged row or not a data row', { draggedRowId })
          return false
        }

        const sourceGroupId = draggedRow.groupId || this.findRowGroupId(draggedRowId)
        if (!sourceGroupId) {
          fileLog.error('❌ Could not determine source group for dragged row', { draggedRowId })
          return false
        }

        try {
          // Move row in grouped mode using data store
          this.tableCoreStore.moveRowInGroup(sourceGroupId, targetGroupId, draggedRowId, newIndex)
          fileLog.debug('✅ Row move delegated to drag handler', {
            draggedRowId,
            sourceGroupId,
            targetGroupId,
            newIndex,
          })
          return true
        } catch (error) {
          fileLog.error('❌ Row move failed', { error })
          return false
        }
      },
      onFlatRowMove: (fromIndex: number, toIndex: number) => {
        fileLog.debug('🎯 Flat row moved', { fromIndex, toIndex })
        const success = this.tableCoreStore.moveRowInFlat(fromIndex, toIndex)
        fileLog.debug('✅ Flat row moved via drag handler', {
          success,
          fromIndex,
          toIndex,
        })
        return success
      },
      onDragStart: (rowId: string, groupId?: string) => {
        fileLog.debug('🎯 Row drag started', { rowId, groupId })
      },
      onDragEnd: (success: boolean) => {
        fileLog.debug('🎯 Row drag ended', { success })
      },
      isGroupMode: () => this.visualStateStore.groupBy.length > 0,
    })

    // Set container for drag operations
    this.dragDropManager.setContainer(this.container)

    // Initialize EventManager with MobX stores
    this.eventManager = new EventManager({
      tableCoreStore: this.tableCoreStore,
      interactionStore: this.interactionStore,
      container: this.container,
      onEntityUpdate: this.options.onEntityUpdate,
    })

    // Initialize KeyboardController for centralized keyboard event handling
    // Must be after EventManager is created since KeyboardController calls eventManager methods
    // PHASE 3: Now uses document-level binding with editingStore for proper edit mode routing
    this.keyboardController = new KeyboardController({
      container: this.container,
      editingStore: this.editingStore,
      interactionCoordinator: this.interactionCoordinator ?? undefined,
      keyboardNavController: this.keyboardNavController ?? undefined,
      onCopy: () => this.eventManager?.handleCopyAction(),
      onPaste: () => this.eventManager?.handlePasteAction(),
      onCut: () => this.eventManager?.handleCutAction(),
      // GH#1827 P2: onUndo/onRedo removed — handled by FocusAwareUndoRouter
    })

    fileLog.info('✅ Phase 2 managers initialized (BodyRenderer, DragDropManager, EventManager, KeyboardController)')
  }

  /**
   * Initialize overlay manager
   */
  private initOverlayManager(): void {
    fileLog.debug('🎨 Initializing overlay manager')

    // Initialize OverlayManager (MobX version) with coordinator
    this.overlayManager = new OverlayManager({
      container: this.container,
      tableCoreStore: this.tableCoreStore,
      interactionStore: this.interactionStore,
      editingStore: this.editingStore,
      coordinateManager: this.stores.coordinateManager,
      viewportStore: this.stores.viewportStore,
      enableSelectionColumn: this.options.enableSelectionColumn,
      headerContainer: this.headerContainer,
      bodyContainer: this.bodyContainer,
      getProcessedRows: () => this.tableCoreStore.processedRows,
      onEntityUpdate: this.options.onEntityUpdate,
    })

    // Note: initializeOverlay() is called later in postInitialization() after DOM is ready

    fileLog.debug('✅ Overlay manager initialized')
  }

  // GH#2034 P4: setupSelectionDeltaReaction, findCellElement, and initFocusedObservers
  // have been extracted to ObserverManager.ts

  /**
   * GH#1442: Initialize canvas-based grid lines
   * Canvas replaces CSS cell borders for consistent grid line visibility
   * during scroll jumps and buffer misses.
   */
  private initGridLineCanvas(): void {
    if (!this.viewport) return

    const viewportStore = this.stores.viewportStore
    this.gridLineCanvas = new GridLineCanvas(this.visualStateStore, viewportStore)
    this.gridLineCanvas.mount(this.viewport)
    this.gridLineCanvas.updateCanvasSize()
    this.gridLineCanvas.draw()

    // Draw canvas lines directly from native scroll events using actual DOM
    // scroll values. This bypasses MobX stores entirely for scroll-driven
    // redraws, so grid lines stay visible during fast scrolling even when
    // the virtual DOM hasn't caught up. drawFromScroll() calculates visible
    // line range from geometry, independent of viewportStore.visibleRowRange.
    const canvas = this.gridLineCanvas
    const onScroll = () => {
      const { scrollLeft, scrollTop } = this.viewport!
      canvas.drawFromScroll(scrollLeft, scrollTop)
    }
    this.viewport.addEventListener('scroll', onScroll)
    this.gridLineCanvasScrollHandler = onScroll
  }

  /**
   * Initialize Header Renderer
   */
  private initHeaderRenderer(): void {
    if (!this.headerContainer || !this.domFactory) {
      fileLog.warn('🎨 Cannot initialize HeaderRenderer - missing dependencies')
      return
    }

    fileLog.debug('🎨 Initializing Header Renderer')

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
        this.coordinateMapping = mapping

        // GUARD: Only update coordinate mapping if grid is fully initialized
        if (!this.initStore.isFullyHydrated) {
          fileLog.debug('⏸️ COORDINATE: Skipping coordinate mapping update during initialization')
          return
        }

        // CRITICAL: OverlayManager still needs coordinate mapping for positioning overlays
        this.overlayManager?.updateCoordinateMapping(mapping)
        fileLog.debug('🔄 Coordinate mapping updated for overlays', {
          rowCount: mapping.rows.length,
          columnCount: mapping.columns.length,
          version: mapping.version,
        })
      },
    })

    fileLog.debug('✅ Header Renderer initialized')
  }

  /**
   * Post-initialization setup after all managers are created
   */
  private postInitialization(): void {
    fileLog.info('[VGDEBUG] 🚀 Starting post-initialization')

    // Phase 1: Quick synchronous operations that don't cause reflows
    // Initialize hybrid coordinate system position tracking (mostly calculations)
    this.initializePositionTracking()

    // Phase 2: Defer DOM measurements and controller initialization
    requestAnimationFrame(() => {
      // Guard: Skip if instance was destroyed (React StrictMode remount)
      if (this.isDestroyed) {
        fileLog.debug('[VGDEBUG] ⏭️ Skipping postInit RAF - instance destroyed', {
          instanceId: this.rendererInstanceId,
        })
        return
      }

      fileLog.info('[VGDEBUG] ✅ Phase 2 RAF executing (not destroyed)')

      // Now safe to measure DOM
      const _bounds = this.container.getBoundingClientRect()
      // TODO: Add updateViewportDimensions method to VisualStateStore
      // this.visualStateStore.updateViewportDimensions(bounds.width, bounds.height);

      // Initialize enhanced ScrollController with comprehensive event handling
      if (!this.viewport) {
        fileLog.error('❌ Viewport not initialized - cannot create ScrollController', {
          instanceId: this.rendererInstanceId,
          viewportProperty: this.viewport,
          viewportElement: document.querySelector('.vibegridx-viewport'),
          bodyContainer: this.bodyContainer,
          container: this.container,
        })
        return
      }

      this.scrollController = new ScrollController({
        viewport: this.viewport,
        headerViewport: this.headerViewport || undefined,
        container: this.container,
        viewportStore: this.stores.viewportStore,
        coordinateManager: this.stores.coordinateManager,
        onClickOutside: (e: MouseEvent) => {
          // ✅ Route through InteractionCoordinator for proper service layer handling
          if (this.interactionCoordinator) {
            this.interactionCoordinator.handleOutsidePointer(e as PointerEvent)
          } else {
            // Fallback to legacy path if coordinator not available
            this.interactionStore.handleOutsideClick()
          }
        },
        onScroll: (scrollLeft: number, scrollTop: number) => {
          // Update scroll position in VisualStateStore
          runInAction(() => {
            this.stores.viewportStore.updateScroll(scrollTop, scrollLeft)
          })
          // Note: Detailed scroll debugging removed for performance
          // Re-enable via verbose logging if needed
        },
        keyboardNavController: this.keyboardNavController,
        selectionController: this.selectionController,
        interactionStore: this.interactionStore,
      })

      // Create service layer before MouseController
      // Note: EditSessionManager is created in OverlayManager and accessed via its getter
      // Create SelectionService with coordinate manager
      this.selectionService = new SelectionService(
        this.interactionStore,
        this.tableCoreStore,
        this.visualStateStore,
        this.stores.coordinateManager,
      )

      // Create CellActionRouter (using EditingStore directly)
      this.cellActionRouter = new CellActionRouter(
        this.editingStore,
        this.options.onCellClick as OnCellClickCallback | undefined,
      )

      // Create InteractionCoordinator (using EditingStore directly)
      this.interactionCoordinator = new InteractionCoordinator(
        this.container,
        this.interactionStore,
        this.selectionService,
        this.cellActionRouter,
        this.editingStore,
        this.tableCoreStore,
        this.visualStateStore,
        this.keyboardNavController ?? undefined,
      )
      // Wire SlotRegistry into InteractionCoordinator for D2 pipeline
      if (this.initStore?.slotRegistry) {
        this.interactionCoordinator.setSlotRegistry(this.initStore.slotRegistry)
      }

      if (this.keyboardController) {
        this.keyboardController.setInteractionCoordinator(this.interactionCoordinator)
      }

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
        enableSelectionColumn: this.options.enableSelectionColumn,
      })

      // Connect MouseController to KeyboardController for focus management
      if (this.mouseController && this.keyboardController) {
        this.mouseController.setKeyboardController(this.keyboardController)
      }

      // Configure ColumnWidthManager with DOM containers
      if (this.columnWidthManager) {
        this.columnWidthManager.setContainers({
          headerContainer: this.headerContainer,
          bodyContainer: this.bodyContainer,
          headerViewport: this.headerViewport,
        })
      }

      // Mark controller dependencies as ready (if initManager exists)
      if (this.initStore) {
        // ✅ FIXED: InitStore DOES have markReady method - uncommented
        fileLog.debug('[VGDEBUG] ✅ Marking viewportReady')
        this.initStore.markReady('viewportReady')
        fileLog.debug('[VGDEBUG] ✅ Controllers ready')
      }

      // Phase 3: Defer overlay and event setup
      requestAnimationFrame(() => {
        // Guard: Skip if instance was destroyed
        if (this.isDestroyed) {
          fileLog.debug('⏭️ Skipping overlay RAF - instance destroyed', {
            instanceId: this.rendererInstanceId,
          })
          return
        }

        // Initialize overlay now that DOM is ready
        if (this.overlayManager) {
          this.overlayManager.initializeOverlay()
        }

        // Setup event handling via EventManager
        if (this.eventManager) {
          this.eventManager.setOverlayManager(this.overlayManager!)
          this.eventManager.setupEventHandling()
        }

        // Link coordinator to overlay manager for fill handle delegation
        if (this.interactionCoordinator) {
          this.interactionCoordinator.setOverlayManager(this.overlayManager!)
        }

        // Mark remaining dependencies as ready (if initManager exists)
        if (this.initStore) {
          // ✅ FIXED: InitStore DOES have markReady method - uncommented
          fileLog.debug('[VGDEBUG] ✅ Marking eventHandlersReady')
          this.initStore.markReady('eventHandlersReady')
          fileLog.debug('[VGDEBUG] ✅ Overlay and event handlers ready')
        }

        // Phase 4: Defer header render
        requestAnimationFrame(() => {
          // Guard: Skip if instance was destroyed
          if (this.isDestroyed) {
            fileLog.debug('⏭️ Skipping header render RAF - instance destroyed', {
              instanceId: this.rendererInstanceId,
            })
            return
          }

          // Render header first (lighter operation)
          runInAction(() => {
            this.renderHeader()
          })

          // Phase 5: Defer body render to next frame
          requestAnimationFrame(() => {
            // Guard: Skip if instance was destroyed
            if (this.isDestroyed) {
              fileLog.debug('⏭️ Skipping body render RAF - instance destroyed', {
                instanceId: this.rendererInstanceId,
              })
              return
            }

            // Render body and capture ranges in batch
            runInAction(() => {
              this.renderBody()

              // Capture initial visible ranges after body render (MobX computed properties)
              this.lastVisibleColumns = this.visualStateStore.visibleColumnRange
              this.lastVisibleRows = this.visualStateStore.visibleRowRange
            })

            // Wait for browser to actually paint before marking as ready
            const paintCompleteTime = performance.now()
            fileLog.debug('🎨 DOM PAINT COMPLETE', {
              event: 'renderBody_complete',
              timestamp: paintCompleteTime,
              rendererState: 'dom_ready_waiting_for_paint',
            })

            // Mark renderer as initialized AFTER browser paint is complete
            requestAnimationFrame(() => {
              // Guard: Skip if instance was destroyed
              if (this.isDestroyed) {
                fileLog.debug('⏭️ Skipping markReady RAF - instance destroyed', {
                  instanceId: this.rendererInstanceId,
                })
                return
              }

              const actualPaintTime = performance.now()
              fileLog.debug('[VGDEBUG] ✅ Marking rendererInitialized')
              this.initStore.markReady('rendererInitialized')

              fileLog.debug('[VGDEBUG] 🖼️ BROWSER PAINT COMPLETE - SKELETON CAN HIDE', {
                event: 'browser_paint_complete',
                timestamp: actualPaintTime,
                paintDuration: actualPaintTime - paintCompleteTime,
                rendererState: 'fully_rendered',
              })
            })

            // Enable observers after initialization is complete
            // GH#2034 P4: observersEnabled is now managed by ObserverManager
            // Re-enable is a no-op since observers were already enabled in initObservers()
            fileLog.info('✅ Observers already initialized and enabled in constructor')

            fileLog.debug('✅ Post-initialization complete')
          })
        })
      })
    })
  }

  /**
   * Initialize hybrid coordinate system position tracking
   */
  private initializePositionTracking(): void {
    fileLog.debug('🎯 Initializing hybrid position tracking system')

    // Initialize DOM position tracking
    positionTracker.initialize(this.container)

    // Initialize ViewportStore with current viewport dimensions
    const bounds = this.container.getBoundingClientRect()
    const viewportStore = this.stores.viewportStore
    runInAction(() => {
      viewportStore.updateViewportSize(bounds.width, bounds.height)
      viewportStore.updateScroll(0, 0)
    })

    fileLog.debug('✅ Hybrid position tracking initialized', {
      totalRows: this.tableCoreStore.processedRows.length,
      columnCount: this.visualStateStore.columns.length,
      viewportSize: `${bounds.width}x${bounds.height}`,
    })
  }

  /**
   * GH#1437: Set up the RowPreRenderBuffer context with current store/renderer data.
   * Called at the start of renderBody() and whenever stores change.
   */
  private setupPreRenderContext(): void {
    if (!this.bodyRenderer) return

    const rows = this.tableCoreStore.processedRows
    const columns = this.tableCoreStore.columns
    const columnVisibility = this.visualStateStore.columnVisibility
    const visualState = this.visualStateStore
    const allVisibleColumnLayouts = visualState.visibleColumns
    const baseOffset = GRID_DIMENSIONS.CONTENT_OFFSET_X

    // Pre-compute values once for all rows built by the buffer
    const visibleColumns = allVisibleColumnLayouts
      .map((layout) => {
        const column = columns.find((col: any) => col.id === layout.id)
        if (!column) return null
        return { ...column, width: layout.width }
      })
      .filter(Boolean) as any[]
    const precomputed = {
      visibleColumns,
      columnLayouts: allVisibleColumnLayouts,
      totalWidth: visualState.geometry.totalWidth,
    }

    this.preRenderBuffer.setContext({
      buildRow: (rowIndex: number) => {
        const row = rows[rowIndex]
        if (!row) return null
        // Group/expanded-content rows bypass the buffer
        if (row.type === 'group' || row.type === 'expanded-content') return null
        return this.createRowElementByType(
          row,
          rowIndex,
          columns,
          columnVisibility,
          baseOffset,
          precomputed,
          false, // full rich rows, not shell cells
        )
      },
      totalRows: () => this.tableCoreStore.processedRows.length,
    })
  }

  /**
   * Incremental virtual scrolling - only add/remove rows that changed
   */
  /**
   * Create appropriate row element based on row type (group vs data)
   */
  private createRowElementByType(
    row: any,
    rowIndex: number,
    columns: any[],
    columnVisibility: Record<string, boolean>,
    baseOffset: number,
    // PERF: Pre-computed values to avoid per-row recalculation
    precomputed?: {
      visibleColumns: any[]
      columnLayouts: any[]
      totalWidth: number
    },
    _useShellCells: boolean = false, // deprecated — always creates full rows now
  ): HTMLElement | null {
    // Guard against undefined rows (race condition during data updates)
    if (!row) {
      fileLog.warn('⚠️ createRowElementByType called with undefined row', { rowIndex })
      return null
    }

    // Handle different row types
    if (row.type === 'group' && this.domFactory) {
      return this.domFactory.createGroupHeaderElement(row, rowIndex)
    }

    // GH#1240: Handle expanded content rows
    if (row.type === 'expanded-content' && this.bodyRenderer) {
      // GH#2812 sparse guard: find visits holes as undefined per ECMA-262 §22.1.3.9.
      const parentRow = this.tableCoreStore.processedRows.find((r: any) => r && r.id === row.parentRowId)
      return this.bodyRenderer.createExpandedContentRowElement(row, rowIndex, parentRow)
    }

    return this.bodyRenderer!.createRowElement(
      row,
      rowIndex,
      columns,
      columnVisibility,
      baseOffset,
      precomputed,
      false, // always create full rich rows (no shell cells)
    )
  }

  private updateVirtualRows(
    previousRange: { start: number; end: number },
    currentRange: { start: number; end: number },
  ): void {
    if (!this.bodyContainer || !this.bodyRenderer) return

    const startTime = performance.now()

    const rows = this.tableCoreStore.processedRows
    const columns = this.tableCoreStore.columns
    const columnVisibility = this.visualStateStore.columnVisibility
    const visualState = this.visualStateStore
    // 🚀 PERF: Apply column virtualization - only render columns in viewport + buffer
    const allVisibleColumns = visualState.visibleColumns
    const columnRange = visualState.visibleColumnRange
    const allVisibleColumnLayouts = allVisibleColumns.slice(columnRange.start, columnRange.end)
    const baseOffset = this.calculateBaseOffset()

    // PERF: Pre-compute values ONCE instead of per-row
    // This avoids repeated MobX computed property reads and array filtering
    // CRITICAL: Must use .map() over allVisibleColumnLayouts to preserve visual column order
    // (same pattern as renderBody) - .filter() preserves wrong order from columns array
    const visibleColumns = allVisibleColumnLayouts
      .map((layout) => {
        const column = columns.find((col) => col.id === layout.id)
        if (!column) return null
        // Enrich with actual width from layout (respects columnWidths state)
        return {
          ...column,
          width: layout.width,
        }
      })
      .filter(Boolean) as typeof columns
    const totalWidth = visualState.geometry.totalWidth
    const precomputed = {
      visibleColumns,
      columnLayouts: allVisibleColumnLayouts,
      totalWidth,
    }

    fileLog.debug('🚀 INCREMENTAL UPDATE: Virtual rows changed', {
      previousRange: `${previousRange.start}-${previousRange.end}`,
      currentRange: `${currentRange.start}-${currentRange.end}`,
      totalRows: rows.length,
      action: 'incremental_update',
    })

    // Update debug metrics with total data count
    this.debugStore.updateVirtualScrollMetrics({
      totalRowsInData: rows.length,
    })

    // If this is the first render (previous was -1 to -1), create all visible rows
    if (previousRange.start === -1) {
      fileLog.debug('🎯 INITIAL RENDER: Creating all visible rows', {
        range: `${currentRange.start}-${currentRange.end}`,
        count: currentRange.end - currentRange.start + 1,
      })

      // Clear any stale entries in activeRows and activeCells
      this.activeRows.clear()
      this.activeCells.clear()

      const fragment = document.createDocumentFragment()
      for (let i = currentRange.start; i < currentRange.end && i < rows.length; i++) {
        const row = rows[i]
        const rowElement = this.createRowElementByType(row, i, columns, columnVisibility, baseOffset, precomputed)
        if (rowElement && row?.id) {
          fragment.appendChild(rowElement)
          this.activeRows.set(row.id, rowElement)
          this.trackCellsForRow(row.id, rowElement)
        }
      }
      this.bodyContainer.appendChild(fragment)

      // GH#1437: Queue pre-render buffer for rows ahead
      this.preRenderBuffer.queueAhead(currentRange, 'down', rows.length)

      const duration = performance.now() - startTime
      this.debugStore.recordRender(duration, currentRange.end - currentRange.start)

      // Update all debug metrics for initial render
      // Calculate truly visible rows from scroll position (not by subtracting buffer)
      const scrollTop = this.stores.viewportStore.scrollTop
      const viewportHeight = this.stores.viewportStore.viewportHeight
      const rowHeight = GRID_DIMENSIONS.ROW_HEIGHT
      const visibleStart = Math.floor(scrollTop / rowHeight)
      const visibleEnd = Math.min(rows.length, Math.ceil((scrollTop + viewportHeight) / rowHeight))
      this.debugStore.updateVirtualScrollMetrics({
        visibleRowStart: visibleStart,
        visibleRowEnd: visibleEnd,
        renderedRowStart: currentRange.start,
        renderedRowEnd: currentRange.end,
        totalRowsInDOM: this.activeRows.size,
        totalRowsInData: rows.length,
        scrollTop,
        viewportHeight,
      })
      return
    }

    // PROFILING: Track time spent in each phase
    const removeStartTime = performance.now()
    let rowsRemoved = 0
    let rowsRecycled = 0

    // 🚀 ROW RECYCLING: Instead of destroying rows, add them to the pool for reuse
    // Remove rows that are no longer visible - ADD TO POOL instead of destroy
    // GH#1240 FIX: Only pool data rows - expanded-content rows have different DOM structure
    // and cannot be recycled as data rows (causes corrupted rendering)
    if (currentRange.start > previousRange.start) {
      for (let i = previousRange.start; i < currentRange.start && i <= previousRange.end; i++) {
        const rowId = rows[i]?.id
        if (rowId) {
          const rowElement = this.activeRows.get(rowId)
          if (rowElement) {
            // Remove from DOM but keep for recycling
            rowElement.remove()
            this.activeRows.delete(rowId)
            this.activeCells.delete(rowId)
            // Only pool data rows (not expanded-content or group rows)
            const isDataRow = rows[i]?.type === 'data' || !rows[i]?.type
            if (isDataRow && this.rowPool.length < this.MAX_POOL_SIZE) {
              this.rowPool.push(rowElement)
            }
            rowsRemoved++
          }
        }
      }
    }

    if (currentRange.end < previousRange.end) {
      for (let i = currentRange.end; i < previousRange.end && i < rows.length; i++) {
        const rowId = rows[i]?.id
        if (rowId) {
          const rowElement = this.activeRows.get(rowId)
          if (rowElement) {
            // Remove from DOM but keep for recycling
            rowElement.remove()
            this.activeRows.delete(rowId)
            this.activeCells.delete(rowId)
            // Only pool data rows (not expanded-content or group rows)
            const isDataRow = rows[i]?.type === 'data' || !rows[i]?.type
            if (isDataRow && this.rowPool.length < this.MAX_POOL_SIZE) {
              this.rowPool.push(rowElement)
            }
            rowsRemoved++
          }
        }
      }
    }

    const removeTime = performance.now() - removeStartTime
    const createStartTime = performance.now()
    let rowsCreated = 0

    // NOTE: Row creation limit removed - caused visual gaps (row deficits)
    // Better to exceed 16ms occasionally than have missing rows
    // Focus optimization on per-row time, not limiting row count

    // Add new rows that became visible - TRY RECYCLING FIRST
    // FIX: Clamp add loops to currentRange to prevent filling gaps on large scroll jumps.
    // Without clamping, jumping from range {0,25} to {1250,1275} would create rows 25-1274
    // (the entire gap), leaking thousands of orphan DOM elements with opaque backgrounds.
    if (currentRange.start < previousRange.start) {
      // Insert new rows at the top in correct order
      // Clamp: don't add rows beyond currentRange.end (they'd be outside visible range)
      const addFrom = Math.min(previousRange.start - 1, currentRange.end - 1)
      const fragment = document.createDocumentFragment()
      for (let i = addFrom; i >= currentRange.start; i--) {
        const row = rows[i]
        if (!row) continue

        let rowElement: HTMLElement | null = null

        // FAST PATH: check pre-render buffer first
        rowElement = this.preRenderBuffer.getRow(i)
        if (rowElement) {
          // Update position
          const offset = this.tableCoreStore.rowOffsets[i] ?? i * ROW_HEIGHT
          rowElement.style.transform = `translateY(${offset}px)`
          // Reconcile columns: pre-rendered row may have stale column set
          // if horizontal scroll changed between pre-build and consumption
          this.trackCellsForRow(row.id, rowElement)
          this.reconcileRowColumns(row, rowElement, precomputed)
        } else if (this.rowPool.length > 0 && row.type === 'data' && this.bodyRenderer) {
          // TRY RECYCLING: Reuse existing row from pool
          const recycledRow = this.rowPool.pop()!
          rowElement = this.bodyRenderer.recycleRowForNewData(recycledRow, row, i, columns, precomputed)
          rowsRecycled++
        } else {
          // SLOW PATH: Create full row from scratch (fast scroll outpaced buffer)
          rowElement = this.createRowElementByType(row, i, columns, columnVisibility, baseOffset, precomputed, false)
        }

        if (rowElement && row?.id) {
          fragment.insertBefore(rowElement, fragment.firstChild)
          this.activeRows.set(row.id, rowElement)
          this.trackCellsForRow(row.id, rowElement)
          rowsCreated++
        }
      }
      // Insert at the beginning of the container
      if (fragment.childNodes.length > 0) {
        this.bodyContainer.insertBefore(fragment, this.bodyContainer.firstChild)
      }
    }

    if (currentRange.end > previousRange.end) {
      // Clamp: don't add rows before currentRange.start (they'd be outside visible range)
      const addStart = Math.max(previousRange.end, currentRange.start)
      const fragment = document.createDocumentFragment()
      for (let i = addStart; i < currentRange.end && i < rows.length; i++) {
        const row = rows[i]
        if (!row) continue

        let rowElement: HTMLElement | null = null

        // FAST PATH: check pre-render buffer first
        rowElement = this.preRenderBuffer.getRow(i)
        if (rowElement) {
          // Update position
          const offset = this.tableCoreStore.rowOffsets[i] ?? i * ROW_HEIGHT
          rowElement.style.transform = `translateY(${offset}px)`
          // Reconcile columns: pre-rendered row may have stale column set
          this.trackCellsForRow(row.id, rowElement)
          this.reconcileRowColumns(row, rowElement, precomputed)
        } else if (this.rowPool.length > 0 && row.type === 'data' && this.bodyRenderer) {
          // TRY RECYCLING: Reuse existing row from pool
          const recycledRow = this.rowPool.pop()!
          rowElement = this.bodyRenderer.recycleRowForNewData(recycledRow, row, i, columns, precomputed)
          rowsRecycled++
        } else {
          // SLOW PATH: Create full row from scratch (fast scroll outpaced buffer)
          rowElement = this.createRowElementByType(row, i, columns, columnVisibility, baseOffset, precomputed, false)
        }

        if (rowElement && row?.id) {
          fragment.appendChild(rowElement)
          this.activeRows.set(row.id, rowElement)
          this.trackCellsForRow(row.id, rowElement)
          rowsCreated++
        }
      }
      if (fragment.childNodes.length > 0) {
        this.bodyContainer.appendChild(fragment)
      }
    }

    const createTime = performance.now() - createStartTime

    // Record render metrics
    const duration = performance.now() - startTime

    // Log breakdown if significant time spent (50ms+ indicates a problem)
    if (duration > 50) {
      const recycleInfo = rowsRecycled > 0 ? ` | ♻️ recycled: ${rowsRecycled}` : ''
      const poolInfo = ` | pool: ${this.rowPool.length}`
      fileLog.warn(
        `⏱️ RENDER: ${duration.toFixed(1)}ms total | ` +
          `remove: ${removeTime.toFixed(1)}ms (${rowsRemoved} rows) | ` +
          `create: ${createTime.toFixed(1)}ms (${rowsCreated} rows) | ` +
          `${rowsCreated > 0 ? (createTime / rowsCreated).toFixed(2) : 'N/A'}ms/row` +
          recycleInfo +
          poolInfo,
      )
    }
    // 🚀 PERF TEST: Completely skip debug updates to isolate forced reflow source
    // If this fixes the reflows, the issue is in DebugOverlay React component
    // const rowsChanged = Math.abs(currentRange.end - currentRange.start - (previousRange.end - previousRange.start))
    // this.debugStore.recordRender(duration, rowsChanged)
    // this.debugStore.updateVirtualScrollMetrics({ totalRowsInDOM: this.activeRows.size })

    // 🚀 PERF TEST: Skip logging to isolate forced reflow source
    // fileLog.debug('✅ INCREMENTAL UPDATE: Complete', { ... })

    // GH#1437: Queue pre-render buffer fill for rows beyond the current range
    const scrollDirection = currentRange.start > previousRange.start ? 'down' : 'up'
    this.preRenderBuffer.queueAhead(currentRange, scrollDirection, rows.length)
  }

  /**
   * Populate activeCells tracking for a given row element.
   * Queries the row's cells by data-column-id and stores them in the activeCells map.
   */
  private trackCellsForRow(rowId: string, rowElement: HTMLElement): void {
    const cellMap = new Map<string, HTMLElement>()
    const cells = rowElement.querySelectorAll('.vibegridx-cell[data-column-id]')
    for (const cell of cells) {
      const colId = (cell as HTMLElement).getAttribute('data-column-id')
      if (colId) cellMap.set(colId, cell as HTMLElement)
    }
    this.activeCells.set(rowId, cellMap)
  }

  /**
   * Reconcile a row's cells to match the current visible column range.
   * Used when consuming pre-rendered or recycled rows whose column set may be stale
   * (built before the most recent horizontal scroll changed the viewport column range).
   */
  private reconcileRowColumns(
    row: any,
    rowElement: HTMLElement,
    precomputed: {
      visibleColumns: any[]
      columnLayouts: any[]
      totalWidth: number
    },
  ): void {
    if (!this.bodyRenderer) return

    const rowId = row.id
    let cellMap = this.activeCells.get(rowId)
    if (!cellMap) {
      cellMap = new Map<string, HTMLElement>()
      this.activeCells.set(rowId, cellMap)
    }

    // Build set of column IDs that SHOULD be in the row (current viewport range)
    const expectedColumnIds = new Set<string>()
    for (const col of precomputed.visibleColumns) {
      expectedColumnIds.add(col.id)
    }

    // Build layout lookup for O(1) access
    const layoutMap = new Map<string, any>()
    for (const layout of precomputed.columnLayouts) {
      layoutMap.set(layout.id, layout)
    }

    // Remove cells that are NOT in the expected set
    for (const [colId, cellEl] of cellMap) {
      if (!expectedColumnIds.has(colId)) {
        cellEl.remove()
        cellMap.delete(colId)
      }
    }

    // Add cells that are in expected set but missing from the row
    const columns = this.tableCoreStore.columns
    const columnMap = new Map<string, any>()
    for (const col of columns) {
      columnMap.set(col.id, col)
    }

    for (const layout of precomputed.columnLayouts) {
      const existingCell = cellMap.get(layout.id)
      if (existingCell) {
        // Update position and width on existing cells — pre-rendered rows may have
        // stale values if column widths changed after the row was buffered.
        existingCell.style.left = `${layout.xOffset}px`
        existingCell.style.width = `${layout.width}px`
        continue
      }

      const column = columnMap.get(layout.id)
      if (!column) continue

      const cell = this.bodyRenderer.createCellElement(
        row,
        { ...column, width: layout.width },
        0,
        layout.xOffset,
        layout.width,
      )
      rowElement.appendChild(cell)
      cellMap.set(layout.id, cell)
    }
  }

  /**
   * Incremental column update - add/remove only delta cells instead of full re-render.
   * Modeled on updateVirtualRows() incremental pattern for horizontal scrolling performance.
   */
  private updateVirtualColumns(
    previousRange: { start: number; end: number },
    currentRange: { start: number; end: number },
  ): void {
    if (!this.bodyContainer || !this.bodyRenderer) return

    const startTime = performance.now()
    const visualState = this.visualStateStore
    const allVisibleColumns = visualState.visibleColumns
    const columns = this.tableCoreStore.columns

    // Determine entering and leaving columns
    const prevColumnIds = new Set<string>()
    for (let i = previousRange.start; i < previousRange.end && i < allVisibleColumns.length; i++) {
      prevColumnIds.add(allVisibleColumns[i].id)
    }

    const currentColumnIds = new Set<string>()
    for (let i = currentRange.start; i < currentRange.end && i < allVisibleColumns.length; i++) {
      currentColumnIds.add(allVisibleColumns[i].id)
    }

    // Columns entering viewport
    const entering: typeof allVisibleColumns = []
    for (let i = currentRange.start; i < currentRange.end && i < allVisibleColumns.length; i++) {
      if (!prevColumnIds.has(allVisibleColumns[i].id)) {
        entering.push(allVisibleColumns[i])
      }
    }

    // Columns leaving viewport
    const leaving: string[] = []
    for (const colId of prevColumnIds) {
      if (!currentColumnIds.has(colId)) {
        leaving.push(colId)
      }
    }

    if (entering.length === 0 && leaving.length === 0) return

    fileLog.debug('INCREMENTAL COLUMN UPDATE', {
      previousRange: `${previousRange.start}-${previousRange.end}`,
      currentRange: `${currentRange.start}-${currentRange.end}`,
      entering: entering.length,
      leaving: leaving.length,
    })

    // Pre-compute lookup maps for O(1) access in the per-row loop
    const rowMap = new Map<string, any>()
    for (const row of this.tableCoreStore.processedRows) {
      rowMap.set(row.id, row)
    }
    const columnMap = new Map<string, any>()
    for (const col of columns) {
      columnMap.set(col.id, col)
    }

    // Split rows into viewport (synchronous) and buffer (deferred) for frame budget
    const rows = this.tableCoreStore.processedRows
    const renderRange = this.visualStateStore.visibleRowRange // includes buffer
    const startIdx = Math.max(0, renderRange.start)
    const endIdx = Math.min(rows.length, renderRange.end)

    // Compute viewport-only range (no buffer) — what the user actually sees
    const scrollTop = this.stores.viewportStore.scrollTop
    const viewportHeight = this.stores.viewportStore.viewportHeight
    const vpStart = this.tableCoreStore.findRowAtScrollPosition(scrollTop)
    const vpEnd = Math.min(rows.length, this.tableCoreStore.findRowAtScrollPosition(scrollTop + viewportHeight) + 1)

    // Helper: update columns for a single row — creates full rich cells directly
    const processRow = (row: any, rowElement: HTMLElement, _isViewportRow: boolean) => {
      let cellMap = this.activeCells.get(row.id)
      if (!cellMap) {
        cellMap = new Map<string, HTMLElement>()
        this.activeCells.set(row.id, cellMap)
      }

      // Remove leaving cells
      for (const colId of leaving) {
        const cellEl = cellMap.get(colId)
        if (cellEl) {
          cellEl.remove()
          cellMap.delete(colId)
        }
      }

      // Add entering cells (full rich cells — no shell cells)
      for (const layout of entering) {
        if (cellMap.has(layout.id)) continue
        const column = columnMap.get(layout.id)
        if (!column) continue

        const cell = this.bodyRenderer!.createCellElement(
          row,
          { ...column, width: layout.width },
          0,
          layout.xOffset,
          layout.width,
        )
        rowElement.appendChild(cell)
        cellMap.set(layout.id, cell)
      }
    }

    // Pass 1: viewport rows only (synchronous — what the user sees)
    let viewportProcessed = 0
    const deferredRows: Array<{ row: any; el: HTMLElement }> = []

    for (let i = startIdx; i < endIdx; i++) {
      const row = rows[i]
      if (!row?.id) continue

      const rowElement = this.activeRows.get(row.id)
      if (!rowElement) continue

      if (
        rowElement.classList.contains('vibegridx-group-header') ||
        rowElement.classList.contains('vibegridx-expanded-content-row')
      ) {
        continue
      }

      if (i >= vpStart && i < vpEnd) {
        processRow(row, rowElement, true)
        viewportProcessed++
      } else {
        deferredRows.push({ row, el: rowElement })
      }
    }

    // Pass 2: buffer rows deferred — off-screen, don't block the frame
    if (deferredRows.length > 0) {
      requestIdleCallback(() => {
        for (const { row, el } of deferredRows) {
          if (!this.activeRows.has(row.id)) continue // row may have been removed
          processRow(row, el, false)
        }
      })
    }

    const duration = performance.now() - startTime
    if (duration > 10) {
      fileLog.warn(
        `COLUMN UPDATE: ${duration.toFixed(1)}ms | ` +
          `entering: ${entering.length} | leaving: ${leaving.length} | ` +
          `viewport: ${viewportProcessed} | deferred: ${deferredRows.length}`,
      )
    }
  }

  /**
   * Initialize DOM structure
   */
  private initDOM(): void {
    fileLog.debug('🎨 initDOM called', { instanceId: this.rendererInstanceId })
    if (!this.container) {
      fileLog.error('❌ Container is null - cannot initialize DOM', {
        instanceId: this.rendererInstanceId,
        containerExists: !!this.container,
        containerType: typeof this.container,
      })
      return
    }
    fileLog.debug('✅ Container exists, creating DOM structure', {
      instanceId: this.rendererInstanceId,
    })

    this.container.innerHTML = ''

    // Create basic table structure
    // Note: width is controlled by React inline styles for Gantt mode support
    this.container.style.position = 'relative'
    this.container.style.overflow = 'hidden'
    this.container.style.height = '100%'

    // Create main table container
    const table = this.createElement('div', 'vibegridx-table')
    table.setAttribute('role', 'grid')
    table.setAttribute('aria-label', this.entityType || 'Data grid')

    // Create header container first (will be populated by HeaderRenderer)
    this.headerContainer = this.createElement('div', 'vibegridx-header')
    this.headerContainer.setAttribute('role', 'rowgroup')
    this.headerContainer.setAttribute('aria-label', 'Column headers')
    this.headerContainer.style.cssText = `
      position: relative;
      white-space: nowrap;
      height: 100%;
      display: flex;
      min-width: min-content;
      width: max-content;
    `

    // Create header clip wrapper (clips the visible area)
    const headerClipWrapper = this.createElement('div', 'vibegridx-header-clip')
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
    `

    // Create header viewport (can be as wide as needed, moved with transform)
    this.headerViewport = this.createElement('div', 'vibegridx-header-viewport')
    this.headerViewport.style.cssText = `
      position: relative;
      height: ${HEADER_HEIGHT}px;
      width: max-content;
      min-width: 100%;
      will-change: transform;
      /* border: 2px solid blue !important; */
      box-sizing: border-box;
    `
    this.headerViewport.appendChild(this.headerContainer)
    headerClipWrapper.appendChild(this.headerViewport)

    // Basic viewport structure (will be enhanced by ViewportManager)
    this.viewport = this.createElement('div', 'vibegridx-viewport')
    this.viewport.style.cssText = `
      position: absolute;
      top: ${HEADER_HEIGHT}px;
      left: 0;
      right: 0;
      bottom: 0;
      overflow: auto;
      contain: strict;
    `

    this.bodyContainer = this.createElement('div', 'vibegridx-body')
    this.bodyContainer.setAttribute('role', 'rowgroup')
    this.bodyContainer.setAttribute('aria-label', 'Data rows')
    this.bodyContainer.style.cssText = `
      position: relative;
      width: 100%;
      /* border: 2px solid red !important; */
      box-sizing: border-box;
      contain: layout style paint;
      will-change: contents;
    `

    this.viewport.appendChild(this.bodyContainer)

    // Assemble the complete structure
    table.appendChild(headerClipWrapper)
    table.appendChild(this.viewport)
    this.container.appendChild(table)

    fileLog.debug('✅ Basic DOM structure created', {
      instanceId: this.rendererInstanceId,
      viewportSet: !!this.viewport,
      bodyContainerSet: !!this.bodyContainer,
      headerContainerSet: !!this.headerContainer,
    })
  }

  /**
   * Create DOM element with class - matches UnifiedTableRenderer pattern
   */
  private createElement(tag: string, className: string): HTMLElement {
    // Delegate to DOM Factory for consistent element creation
    if (this.domFactory) {
      return this.domFactory.createElement(tag, className)
    }

    // Fallback for early initialization
    const el = document.createElement(tag)
    el.className = className
    return el
  }

  /**
   * Create group header element with expand/collapse functionality
   * DELEGATED: Now handled by GroupRenderer
   */
  private createGroupHeaderElement(groupRow: any, rowIndex: number): HTMLElement {
    // Delegate to GroupRenderer for consistent group header creation
    if (this.groupRenderer) {
      return this.groupRenderer.createGroupHeaderElement(groupRow, rowIndex)
    }

    // Fallback to DOMFactory if GroupRenderer not available
    if (this.domFactory) {
      return this.domFactory.createGroupHeaderElement(groupRow, rowIndex)
    }

    // Error case - should not happen with proper initialization
    fileLog.error('🚨 Neither GroupRenderer nor DOMFactory available')
    throw new Error('GroupRenderer not initialized - check initialization order')
  }

  /**
   * Render table header
   */
  private renderHeader(): void {
    if (!this.headerContainer) return

    // Delegate to HeaderRenderer if available
    if (this.headerRenderer) {
      this.headerRenderer.render()

      // Update select all checkbox reference
      this.selectAllCheckbox = this.headerRenderer.getSelectAllCheckbox()
      return
    }

    // HeaderRenderer should always be available - if not, something is wrong
    fileLog.error('🚨 HeaderRenderer not available - this should not happen')
    throw new Error('HeaderRenderer not initialized - check initialization order')
  }

  /**
   * GH#1422: Handle incremental viewport ready
   *
   * Called when the first batch of rows (viewport rows) are ready during
   * incremental processing. This allows immediate rendering of visible rows
   * while background processing continues.
   *
   * Unlike renderBody(), this method:
   * - Does NOT invalidate the pre-render buffer (incremental updates)
   * - Uses the partial processedRows from incremental cache
   * - Shows a progress indicator (optional)
   */
  private handleIncrementalViewportReady(): void {
    if (!this.bodyContainer || !this.bodyRenderer) return

    fileLog.info('🚀 GH#1422: Incremental viewport render', {
      progress: this.tableCoreStore.processingProgress,
      cacheRowCount: this.tableCoreStore.processedRows.length,
    })

    // Debounce rapid viewport updates - only render if not already rendering
    if (this.pendingRAF !== null) {
      fileLog.debug('⏸️ Skipping incremental render - RAF pending')
      return
    }

    this.pendingRAF = requestAnimationFrame(() => {
      this.pendingRAF = null
      // Reuse renderBody for actual rendering - processedRows will return
      // the incremental cache when isIncrementalProcessing is true
      this.renderBody()
    })
  }

  /**
   * Render table body
   */
  private renderBody(): void {
    if (!this.bodyContainer || !this.bodyRenderer) return

    // GH#1437: Invalidate pre-render buffer on full re-render and refresh context
    // GH#1422: Skip invalidation during incremental processing to preserve buffer
    if (!this.tableCoreStore.isIncrementalProcessing) {
      this.preRenderBuffer.invalidate()
    }
    this.setupPreRenderContext()

    const renderStartTime = performance.now()
    fileLog.debug('🎨 DOM RENDER START', {
      event: 'renderBody_start',
      timestamp: renderStartTime,
    })

    // GUARD: Only render if grid is fully initialized OR if this is the initial render call
    const isFullyInitialized = this.initStore.isFullyHydrated
    const rendererInitialized = this.initStore.hydrationState.rendererInitialized

    // Allow initial render before renderer is marked as initialized
    if (!isFullyInitialized && rendererInitialized) {
      fileLog.debug('⏸️ RENDER_BODY: Skipping render during initialization')
      return
    }

    // Use processed rows from TableCoreStore (includes filtering, sorting, grouping)
    const rows = this.tableCoreStore.processedRows
    const columns = this.tableCoreStore.columns
    const columnVisibility = this.visualStateStore.columnVisibility

    // PERFORMANCE FIX: Use DocumentFragment for batched DOM operations instead of innerHTML clearing
    const fragment = document.createDocumentFragment()

    // Clear active rows in RowRenderer AND our local tracking Map
    this.bodyRenderer.clearActiveRows()
    this.activeRows.clear()
    this.activeCells.clear()

    // PERFORMANCE FIX: Clear body container more efficiently
    while (this.bodyContainer.firstChild) {
      this.bodyContainer.removeChild(this.bodyContainer.firstChild)
    }

    // Update content dimensions in visual state
    // Calculate total height by summing individual row heights (groups/data may differ)
    //
    // GH#2804 B5 / GH#2812 perf fix: in substrate cursor-bounded mode the
    // rows array here is the FULL sparse array (length=totalCount with holes
    // outside the loaded window — see TableCoreStore.setSparseRows). Per
    // ECMA-262 §22.1.3, `Array.prototype.reduce` skips holes, so reducing
    // `rows` with `(sum, row) => sum + (row.height || ROW_HEIGHT)` only sums
    // the loaded window's heights, not the unloaded indices. Compute the
    // total height as: loaded heights summed + ROW_HEIGHT for every hole. We
    // derive the loaded count by `forEach` (also skips holes) — `rows.length`
    // is the total slot count including holes.
    const viewportStore = this.stores.viewportStore
    let loadedHeightSum = 0
    let loadedCount = 0
    rows.forEach((row: any) => {
      loadedHeightSum += row.height || ROW_HEIGHT
      loadedCount++
    })
    const holeCount = rows.length - loadedCount
    const summedHeight = loadedHeightSum + holeCount * ROW_HEIGHT
    const serverTotal = viewportStore?.totalRows ?? 0
    // When server reports a larger total (e.g., processedRows hasn't grown to
    // match yet), keep the legacy behavior of padding to serverTotal.
    const totalHeight =
      serverTotal > rows.length
        ? summedHeight + (serverTotal - rows.length) * ROW_HEIGHT
        : summedHeight
    runInAction(() => {
      this.visualStateStore.rowCount = rows.length // Use processedRows length (includes groups)
    })

    // ARIA: Update row/column counts on the grid container
    const gridTable = this.container.querySelector('.vibegridx-table')
    if (gridTable) {
      gridTable.setAttribute('aria-rowcount', String(rows.length + 1)) // +1 for header row
      gridTable.setAttribute('aria-colcount', String(columns.length))
    }

    // Update row coordinate mapping
    this.coordinateMapping.rows = []

    // Virtual scrolling: Only render visible rows - use visual observables
    const visualState = this.visualStateStore

    // CRITICAL FIX: Set body container width to enable proper horizontal scrolling
    // The body container must be wide enough to accommodate all content
    if (this.bodyContainer) {
      this.bodyContainer.style.width = `${visualState.geometry.totalWidth}px`
      this.bodyContainer.style.minWidth = `${visualState.geometry.totalWidth}px`
      // CRITICAL FIX: Set correct height to maintain scroll position during virtual scrolling
      this.bodyContainer.style.height = `${totalHeight}px`
    }
    const visibleRange = visualState.geometry.visibleRowRange
    const startIndex = Math.max(0, visibleRange.start)
    const endIndex = Math.min(rows.length, visibleRange.end)

    fileLog.info('🎨 ROW 16 DEBUG - Body rendering range', {
      totalRows: rows.length,
      visibleRangeRaw: visibleRange,
      startIndex,
      endIndex,
      rendering: endIndex - startIndex,
      totalColumns: visualState.visibleColumns.length,
    })

    // 🚀 PERF: Apply column virtualization - only render columns in viewport + buffer
    // Cells use absolute xOffset positioning, so they sync with header correctly
    const allVisibleColumns = visualState.visibleColumns
    const columnRange = visualState.visibleColumnRange
    const allVisibleColumnLayouts = allVisibleColumns.slice(columnRange.start, columnRange.end)

    // Calculate base offset including drag column width for grouped mode
    const baseOffset = this.calculateBaseOffset()

    // Always start from base offset when rendering all columns (matches HeaderRenderer)
    const startX = baseOffset

    // Convert column layouts back to columns for compatibility with existing renderer
    // CRITICAL: Enrich columns with actual widths from columnWidths state
    const virtualColumns = allVisibleColumnLayouts
      .map((layout) => {
        const column = columns.find((col) => col.id === layout.id)
        if (!column) return null

        // Enrich with actual width from layout (which includes columnWidths state)
        return {
          ...column,
          width: layout.width, // Use width from columnLayouts (respects columnWidths state)
        }
      })
      .filter(Boolean)

    // PERF: Pre-compute values ONCE for all rows in renderBody
    const precomputed = {
      visibleColumns: virtualColumns as any[],
      columnLayouts: allVisibleColumnLayouts,
      totalWidth: visualState.geometry.totalWidth,
    }

    // Render only visible rows using RowRenderer.
    //
    // GH#2812 perf fix: use a `for` loop (not forEach + slice) so we visit
    // sparse-array holes inside the visible range. After GH#2812 setSparseRows
    // leaves indices outside the loaded window as genuine holes (no
    // placeholder object), so `Array.prototype.forEach` would skip them
    // entirely and leave the DOM blank for those rows. We synthesize a
    // VirtualRow placeholder on the fly for unloaded indices so the renderer
    // paints a skeleton row at the correct y-offset.
    for (let actualRowIndex = startIndex; actualRowIndex < endIndex; actualRowIndex++) {
      let row = rows[actualRowIndex]
      if (row === undefined) {
        row = {
          type: 'data' as const,
          id: `__sparse_${actualRowIndex}__`,
          index: actualRowIndex,
          dataIndex: actualRowIndex,
          height: ROW_HEIGHT,
          data: { __sparse: true, id: '__sparse__' },
          __sparse: true,
        }
      }

      let rowElement: HTMLElement

      // Check if this is a group header or data row
      if (row.type === 'group') {
        fileLog.debug('🎯 Rendering group row', {
          rowId: row.id,
          level: row.level,
          isExpanded: row.isExpanded,
          data: row.data,
        })
        rowElement = this.bodyRenderer!.createGroupHeaderElement(row, actualRowIndex)
      } else {
        rowElement = this.bodyRenderer!.createRowElement(
          row,
          actualRowIndex,
          virtualColumns,
          columnVisibility,
          startX,
          precomputed,
          false, // GH#1437: always create full rich rows (pre-render buffer handles scroll perf)
        )
      }

      // Track in activeRows Map for O(1) lookups during scroll updates
      if (row.id) {
        this.activeRows.set(row.id, rowElement)
        // Track cells per row for incremental column updates
        this.trackCellsForRow(row.id, rowElement)
      }

      // PERFORMANCE FIX: Append to DocumentFragment instead of directly to DOM
      fragment.appendChild(rowElement)
    }

    // PERFORMANCE FIX: Single DOM operation instead of multiple appendChild calls
    this.bodyContainer.appendChild(fragment)

    // Update debug metrics for initial render
    // Calculate truly visible rows (without buffer) for accurate debug display
    const rowHeight = GRID_DIMENSIONS.ROW_HEIGHT
    const vpScrollTop = this.stores.viewportStore.scrollTop
    const vpHeight = this.stores.viewportStore.viewportHeight
    const trulyVisibleStart = Math.floor(vpScrollTop / rowHeight)
    const trulyVisibleEnd = Math.min(rows.length, Math.ceil((vpScrollTop + vpHeight) / rowHeight))

    // GH#1437: Queue pre-render buffer for rows beyond initial render
    this.preRenderBuffer.queueAhead({ start: startIndex, end: endIndex }, 'down', rows.length)

    this.debugStore.updateVirtualScrollMetrics({
      visibleRowStart: trulyVisibleStart,
      visibleRowEnd: trulyVisibleEnd,
      renderedRowStart: startIndex,
      renderedRowEnd: endIndex,
      totalRowsInDOM: this.activeRows.size,
      totalRowsInData: rows.length,
      scrollTop: vpScrollTop,
      viewportHeight: vpHeight,
    })

    // Initialize lastVisibleRows/Columns for scroll observers
    this.lastVisibleRows = { start: startIndex, end: endIndex }
    this.lastVisibleColumns = visualState.visibleColumnRange

    // Build complete coordinate mapping for all rows (needed for overlays)
    // GH#1240: Use actual rowOffsets for variable-height rows (expanded content rows)
    const rowOffsets = this.tableCoreStore.rowOffsets
    const newRows: any[] = []
    rows.forEach((row, rowIndex) => {
      newRows.push({
        rowId: row.id,
        y: rowOffsets[rowIndex] ?? rowIndex * ROW_HEIGHT,
        height: row.height || ROW_HEIGHT,
        index: rowIndex,
      })
    })

    // Check for row coordinate mapping changes (including position)
    const rowMappingChanged =
      !this.coordinateMapping.rows ||
      this.coordinateMapping.rows.length !== newRows.length ||
      newRows.some((newRow, index) => {
        const oldRow = this.coordinateMapping.rows?.[index]
        return !oldRow || oldRow.rowId !== newRow.rowId || oldRow.y !== newRow.y
      })

    // Only update coordinate mapping if it actually changed
    if (rowMappingChanged) {
      this.coordinateMapping.rows = newRows
      this.coordinateMapping.version++

      // Also update the shared coordinator with row data + offsets
      // GH#1240: Pass rowOffsets so coordinator knows actual Y positions with expanded rows
      this.stores.coordinateManager.updateRows(rows as any, this.visualStateStore.sortBy, rowOffsets)

      fileLog.debug('🔄 Row coordinate mapping updated (local + shared coordinator)', {
        newRowCount: newRows.length,
        firstRowId: newRows[0]?.rowId,
        mappingVersion: this.coordinateMapping.version,
        sampleRows: newRows.slice(0, 3).map((r) => ({ id: r.rowId, y: r.y })),
      })

      // GUARD: Only update coordinate mapping if grid is fully initialized
      const isFullyInitialized = this.initStore.isFullyHydrated
      if (!isFullyInitialized) {
        fileLog.debug('⏸️ COORDINATE: Skipping coordinate mapping update during initialization (renderBody)')
        return
      }

      // CRITICAL: OverlayManager still needs coordinate mapping for positioning overlays
      this.overlayManager?.updateCoordinateMapping(this.coordinateMapping)

      // PERFORMANCE FIX: Update position tracker with coordinate mapping for computed positions
      positionTracker.updateCoordinateMapping(this.coordinateMapping)
    }

    // PERFORMANCE FIX: Remove expensive DOM position tracking during render
    // Position tracking should be derived from coordinate mapping, not DOM scanning
    // The coordinate mapping already contains all position information needed
    // TODO: Refactor position tracker to use computed observables from coordinateMapping
    if (this.initStore.isFullyHydrated) {
      // Coordinate mapping is already updated above - position tracker should react to that
      // instead of doing expensive DOM scanning
      fileLog.debug('🚀 PERF: Skipping expensive DOM position update - using coordinate mapping instead')
    }

    fileLog.debug('✅ Body rendered with Phase 2 managers')
  }

  // REMOVED: createRowElement() - Now fully handled by RowRenderer in Phase 2
  // This legacy method has been replaced by this.rowRenderer.createRowElement()

  // Legacy method body removed - functionality moved to RowRenderer

  /**
   * Format cell value using centralized display formatters
   */
  private formatCellValue(value: any, _type?: string, _column?: any): string {
    // Delegate to the modular CellFormatter
    return CellFormatter.formatCellValue(value)
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
    const startTime = performance.now()
    let cellsUpdated = 0

    // Update header cell
    if (this.headerContainer) {
      const headerCell = this.headerContainer.querySelector(`[data-column-id="${columnId}"]`) as HTMLElement

      if (headerCell) {
        headerCell.style.width = `${newWidth}px`
        headerCell.style.minWidth = `${newWidth}px`
        headerCell.style.maxWidth = `${newWidth}px`
        cellsUpdated++

        fileLog.debug('[RESIZE] 📏 Header cell width updated', {
          columnId,
          newWidth,
        })
      }
    }

    // Update all body cells in this column
    if (this.bodyContainer) {
      const bodyCells = this.bodyContainer.querySelectorAll(`[data-column-id="${columnId}"]`)

      bodyCells.forEach((cell) => {
        const cellElement = cell as HTMLElement
        cellElement.style.width = `${newWidth}px`
        cellElement.style.minWidth = `${newWidth}px`
        cellElement.style.maxWidth = `${newWidth}px`
        cellsUpdated++
      })
    }

    // Update positions of columns to the right of the resized column
    const resizedColumnIndex = this.visualStateStore.columnLayouts.findIndex((col) => col.id === columnId)

    if (resizedColumnIndex !== -1) {
      const layouts = this.visualStateStore.columnLayouts

      // Update all columns after the resized one
      for (let i = resizedColumnIndex + 1; i < layouts.length; i++) {
        const layout = layouts[i]

        // Update header cell position
        if (this.headerContainer) {
          const headerCell = this.headerContainer.querySelector(`[data-column-id="${layout.id}"]`) as HTMLElement
          if (headerCell) {
            headerCell.style.left = `${layout.xOffset}px`
            cellsUpdated++
          }
        }

        // Update all body cells position
        if (this.bodyContainer) {
          const bodyCells = this.bodyContainer.querySelectorAll(`[data-column-id="${layout.id}"]`)
          bodyCells.forEach((cell) => {
            ;(cell as HTMLElement).style.left = `${layout.xOffset}px`
            cellsUpdated++
          })
        }
      }
    }

    const duration = performance.now() - startTime

    fileLog.debug('[RESIZE] ✅ Column width and positions updated via direct style updates', {
      columnId,
      newWidth,
      cellsUpdated,
      columnsRepositioned:
        resizedColumnIndex !== -1 ? this.visualStateStore.columnLayouts.length - resizedColumnIndex - 1 : 0,
      duration: `${duration.toFixed(2)}ms`,
      avgPerCell: cellsUpdated > 0 ? `${(duration / cellsUpdated).toFixed(3)}ms` : 'N/A',
    })
  }

  /**
   * Calculate base X offset including drag column width (always present for consistent layout)
   */
  private calculateBaseOffset(): number {
    const ROW_HEADER_WIDTH = 40
    const DRAG_COLUMN_WIDTH = 30

    // Always include both columns for consistent layout
    return DRAG_COLUMN_WIDTH + ROW_HEADER_WIDTH // 30px + 40px = 70px
  }

  /**
   * Destroy the renderer
   */
  destroy(): void {
    this.isDestroyed = true
    fileLog.debug('🧹 Destroying SimplePassiveRenderer with Phase 2 managers', {
      instanceId: this.rendererInstanceId,
    })

    // Cancel any pending RAF
    if (this.pendingRAF !== null) {
      cancelAnimationFrame(this.pendingRAF)
      this.pendingRAF = null
    }

    // GH#2034 P4: Dispose all MobX reactions via ObserverManager
    if (this._observerManager) {
      this._observerManager.dispose()
      this._observerManager = null
    }

    // GH#1442: Clean up canvas grid lines
    if (this.gridLineCanvasScrollHandler && this.viewport) {
      this.viewport.removeEventListener('scroll', this.gridLineCanvasScrollHandler)
      this.gridLineCanvasScrollHandler = null
    }
    if (this.gridLineCanvas) {
      this.gridLineCanvas.dispose()
      this.gridLineCanvas = null
    }

    // GH#1437: Dispose row pre-render buffer
    this.preRenderBuffer?.dispose()

    // Clean up Phase 2 managers
    if (this.eventManager) {
      this.eventManager.destroy()
      this.eventManager = null
    }

    // ViewportManager cleanup not needed - visual-state handles this

    // Clean up ScrollController
    if (this.scrollController) {
      this.scrollController.destroy()
      this.scrollController = null
    }

    // Clean up MouseController
    if (this.mouseController) {
      this.mouseController.destroy()
      this.mouseController = null
    }

    // Clean up KeyboardController
    if (this.keyboardController) {
      this.keyboardController.destroy()
      this.keyboardController = null
    }

    // Clean up ColumnWidthManager
    if (this.columnWidthManager) {
      this.columnWidthManager.destroy()
      this.columnWidthManager = null
    }

    // Clean up GroupRenderer
    if (this.groupRenderer) {
      this.groupRenderer.destroy()
      this.groupRenderer = null
    }

    // Clean up HeaderRenderer reactive observers
    if (this.headerRenderer) {
      this.headerRenderer.dispose()
      this.headerRenderer = null
    }

    // RowRenderer and CellRenderer don't need explicit cleanup
    this.bodyRenderer = null

    // Clean up legacy disposers (if any remain)
    for (const dispose of this.disposers) dispose()
    this.disposers = []

    // Clean up hybrid position tracking
    positionTracker.cleanup()

    // Clean up overlay manager
    if (this.overlayManager) {
      this.overlayManager.destroy()
      this.overlayManager = null
    }

    // Clear DOM
    if (this.container) {
      this.container.innerHTML = ''
    }

    // Clear references
    this.activeRows.clear()
    this.activeCells.clear()
    this.viewport = null
    this.headerContainer = null
    this.headerViewport = null
    this.bodyContainer = null
    this.domFactory = null
    this.headerRenderer = null

    fileLog.debug('✅ SimplePassiveRenderer destroyed with all Phase 2 managers cleaned up')
  }

  // selectAllCells method removed - now handled by SelectionController

  // selectColumn method removed - now handled by SelectionController

  // selectRow method removed - now handled by SelectionController

  // toggleRowSelection method removed - now handled by SelectionController

  // selectRowRange method removed - now handled by SelectionController

  // handleArrowKey method removed - now handled by KeyboardNavigationController

  // selectKeyboardRange method removed - now handled by SelectionController

  /**
   * Find the group ID for a given row ID by traversing the processed rows
   * (used when dragging a row after grouping state is computed in the rendered order).
   */
  private findRowGroupId(rowId: string): string | null {
    const processedRows = this.tableCoreStore.processedRows
    let currentGroupId: string | null = null

    // GH#2812 sparse guard: for-of yields undefined for holes (ECMA-262 §22.1.5).
    for (const row of processedRows) {
      if (!row) continue
      if (row.type === 'group') {
        currentGroupId = row.id
      } else if (row.type === 'data' && row.id === rowId) {
        return currentGroupId
      }
    }

    return null
  }

  /**
   * Update the select all checkbox visual state based on computed observable state
   */
  private updateSelectAllCheckboxVisual(state: { checked: boolean; indeterminate: boolean }): void {
    // Delegate to HeaderRenderer if available
    if (this.headerRenderer) {
      this.headerRenderer.updateSelectAllCheckboxVisual(state)
      return
    }

    // Fallback to original implementation
    if (!this.selectAllCheckbox) return

    fileLog.debug('📋 Updating select all checkbox visual state', {
      newState: state,
      previousChecked: this.selectAllCheckbox.checked,
      previousIndeterminate: this.selectAllCheckbox.indeterminate,
    })

    const checkbox = this.selectAllCheckbox

    // Direct DOM property updates - Legend State computed observable ensures these are correct
    checkbox.checked = state.checked
    checkbox.indeterminate = state.indeterminate
  }

  // REMOVED: setupScrollHandling() - Now handled by enhanced ScrollController

  // REMOVED: syncHeaderScroll() - Now handled by ColumnWidthManager

  /**
   * Update sort indicators in header cells based on current sort state
   * Similar to HeaderEngine.updateSortIndicators()
   */
  private updateSortIndicators(): void {
    if (!this.headerContainer) return

    // Delegate to HeaderRenderer if available
    if (this.headerRenderer) {
      this.headerRenderer.updateSortIndicators()
      return
    }

    // HeaderRenderer should always be available - if not, something is wrong
    fileLog.error('🚨 HeaderRenderer not available for sort indicators - this should not happen')
    throw new Error('HeaderRenderer not initialized - check initialization order')
  }

  // REMOVED: createSortIconSVG() - Now handled by HeaderRenderer

  // REMOVED: updateHeaderCellWidth() and updateBodyCellWidths() - Now handled by ColumnWidthManager
}
