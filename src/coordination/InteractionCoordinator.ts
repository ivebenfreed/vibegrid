/**
 * InteractionCoordinator - Single entry point for all pointer/keyboard interactions
 *
 * Normalizes events and delegates to appropriate services.
 * This coordinator sits between DOM event handlers (MouseController, KeyboardController)
 * and business logic services (SelectionService, EditSessionManager, CellActionRouter).
 *
 * Key responsibilities:
 * - Normalize pointer/keyboard events into domain-specific contexts
 * - Delegate to appropriate services based on interaction type
 * - Access fresh data from TableCoreStore (no stale values)
 * - Coordinate between selection, editing, and navigation
 */

import { createLogger } from '@/shared/lib/logging'
import type { SelectionService } from '../services/SelectionService'
import type { EditSessionManager } from '../services/EditSessionManager'
import type { CellActionRouter } from '../routing/CellActionRouter'
import type { InteractionStore } from '../stores/InteractionStore'
import type { TableCoreStore } from '../stores/TableCoreStore'
import type { VisualStateStore } from '../stores/VisualStateStore'

const fileLog = createLogger('components/vibegrid/coordination/InteractionCoordinator')

// ====================================
// TYPES
// ====================================

export interface PointerContext {
  cellId: string
  rowId: string
  columnId: string
  x: number
  y: number
  target: Element
  modifiers: ModifierKeys
  nativeEvent: PointerEvent
}

export interface ClickContext {
  cellId: string
  rowId: string
  columnId: string
  x: number
  y: number
  target: Element
  modifiers: ModifierKeys
  nativeEvent: MouseEvent
}

export interface ModifierKeys {
  ctrl: boolean
  shift: boolean
  alt: boolean
  meta: boolean
}

interface CellData {
  row: any
  value: any
}

// ====================================
// COORDINATOR
// ====================================

/**
 * InteractionCoordinator - Central coordination point for all grid interactions
 */
export class InteractionCoordinator {
  private overlayManager?: any; // Optional reference for fill handle delegation

  constructor(
    private container: HTMLElement,
    private interactionStore: InteractionStore,
    private selectionService: SelectionService,
    private cellActionRouter: CellActionRouter,
    private editSessionManager: EditSessionManager,
    private tableCoreStore: TableCoreStore,
    private visualStateStore: VisualStateStore
  ) {
    fileLog.info('InteractionCoordinator initialized')
  }

  /**
   * Set overlay manager reference for fill handle delegation
   */
  setOverlayManager(overlayManager: any): void {
    this.overlayManager = overlayManager;
  }

  /**
   * Handle pointer down - called by MouseController
   *
   * Updates pointer state and delegates to selection service.
   * This is the first interaction in a potential click or drag sequence.
   */
  handlePointerDown(context: PointerContext): void {
    const { cellId, rowId, columnId, modifiers, x, y } = context

    fileLog.debug('handlePointerDown', {
      cellId,
      rowId,
      columnId,
      modifiers,
      position: { x, y }
    })

    // Update pointer state in InteractionStore
    this.interactionStore.setMousePosition(x, y)
    this.interactionStore.setMouseDown(true)

    // Delegate to selection service
    this.selectionService.handlePointerDown(cellId, modifiers)
  }

  /**
   * Handle click - called by MouseController
   *
   * After selection is updated, determines what action to take (navigate, edit, custom, none).
   * Skips action during multi-select (ctrl/shift held).
   */
  handleClick(context: ClickContext): void {
    const { cellId, rowId, columnId, modifiers, target, nativeEvent } = context

    fileLog.debug('handleClick', {
      cellId,
      rowId,
      columnId,
      modifiers,
      targetTag: (target as HTMLElement).tagName
    })

    // Skip action during multi-select
    if (modifiers.ctrl || modifiers.shift) {
      fileLog.debug('Skipping action during multi-select')
      return
    }

    // Get cell metadata
    const cellData = this.getCellData(rowId, columnId)
    const column = this.visualStateStore.columns.find(c => c.id === columnId)

    if (!column) {
      fileLog.warn('Column not found', { columnId })
      return
    }

    // Delegate to action router
    this.cellActionRouter.route({
      cellId,
      row: cellData.row,
      column,
      fieldPolicy: column.fieldType?.interactionPolicy,
      target,
      modifiers,
      nativeEvent
    })
  }

  /**
   * Handle double click - called by MouseController
   *
   * Some field types (like text) use double-click as edit trigger.
   */
  handleDoubleClick(context: ClickContext): void {
    const { cellId, rowId, columnId, modifiers, target } = context

    fileLog.debug('handleDoubleClick', {
      cellId,
      rowId,
      columnId,
      modifiers
    })

    // Skip during multi-select
    if (modifiers.ctrl || modifiers.shift) {
      return
    }

    // Get column metadata
    const column = this.visualStateStore.columns.find(c => c.id === columnId)
    if (!column) {
      fileLog.warn('Column not found for double-click', { columnId })
      return
    }

    // Check if field policy uses double-click trigger
    const policy = column.fieldType?.interactionPolicy
    if (policy?.editTrigger === 'double-click') {
      fileLog.debug('Starting edit via double-click policy', {
        cellId,
        fieldType: column.fieldType?.id
      })
      this.editSessionManager.start(cellId, column)
    }
  }

  /**
   * Handle outside pointer - called by ScrollController or MouseController
   *
   * When user clicks outside the grid, either commit editing or clear selection.
   */
  handleOutsidePointer(event: PointerEvent): void {
    fileLog.debug('handleOutsidePointer', {
      isEditing: this.editSessionManager.isEditing(),
      target: (event.target as HTMLElement)?.tagName
    })

    if (this.editSessionManager.isEditing()) {
      fileLog.info('Outside pointer while editing - triggering blur handler')
      this.editSessionManager.handleBlur('outside-pointer')
    } else {
      fileLog.info('Outside pointer - clearing selection')
      this.selectionService.clearSelection()
    }
  }

  /**
   * Handle keyboard navigation - called by KeyboardController
   *
   * Moves focus and selection based on arrow keys, Enter, Tab, etc.
   */
  handleKeyboardNavigation(key: string, modifiers: ModifierKeys): void {
    fileLog.debug('handleKeyboardNavigation', { key, modifiers })

    // If editing, let EditSessionManager handle it
    if (this.editSessionManager.isEditing()) {
      fileLog.debug('Keyboard event during edit - delegating to EditSessionManager')
      // EditSessionManager should handle Enter (commit), Escape (cancel), Tab (commit + move)
      return
    }

    // Otherwise, handle navigation
    // TODO: Implement keyboard navigation logic
    fileLog.debug('Keyboard navigation not yet implemented', { key })
  }

  /**
   * Get current cell data from TableCore (always fresh)
   *
   * This ensures we never use stale render snapshot values.
   * The TableCoreStore.processedRows getter always returns current data.
   */
  private getCellData(rowId: string, columnId: string): CellData {
    const processedRows = this.tableCoreStore.processedRows || []
    const row = processedRows.find((r: any) => r.id === rowId)
    const value = row ? row[columnId] : null

    return { row, value }
  }

  /**
   * Handle fill start - delegate to overlay manager
   */
  handleFillStart(): void {
    fileLog.debug('Fill start - delegating to overlay manager');
    const fillHandleLayer = this.overlayManager?.getCanvasOverlay()?.getFillHandleLayer?.();
    if (fillHandleLayer) {
      fillHandleLayer.handleFillStart();
    }
  }

  /**
   * Handle fill move - delegate to overlay manager
   */
  handleFillMove(cell: { rowId: string; columnId: string }): void {
    const fillHandleLayer = this.overlayManager?.getCanvasOverlay()?.getFillHandleLayer?.();
    if (fillHandleLayer) {
      fillHandleLayer.handleFillMove(cell);
    }
  }

  /**
   * Handle fill complete - delegate to overlay manager
   */
  handleFillComplete(cell: { rowId: string; columnId: string }): void {
    fileLog.debug('Fill complete - delegating to overlay manager');
    const fillHandleLayer = this.overlayManager?.getCanvasOverlay()?.getFillHandleLayer?.();
    if (fillHandleLayer) {
      fillHandleLayer.handleFillComplete(cell);
    }
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    fileLog.info('InteractionCoordinator disposed')
    // No resources to clean up yet
  }
}
