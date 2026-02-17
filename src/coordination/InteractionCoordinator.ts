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

import { untracked } from 'mobx'
import { getLogger } from '@/shared/lib/logging'
import { fieldTypeRegistry } from '../field-types/FieldTypeRegistry'
import type { KeyboardNavigationController } from '../renderers/modules/KeyboardNavigationController'
import type { CellActionRouter } from '../routing/CellActionRouter'
import type { EditingStore } from '../stores/EditingStore'
import type { SelectionService } from '../services/SelectionService'
import type { InteractionStore } from '../stores/InteractionStore'
import type { TableCoreStore } from '../stores/TableCoreStore'
import type { VisualStateStore } from '../stores/VisualStateStore'

const fileLog = getLogger(['vibegrid', 'coordination', 'InteractionCoordinator'])

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
  private overlayManager?: any // Optional reference for fill handle delegation

  constructor(
    private container: HTMLElement,
    private interactionStore: InteractionStore,
    private selectionService: SelectionService,
    private cellActionRouter: CellActionRouter,
    private editingStore: EditingStore,
    private tableCoreStore: TableCoreStore,
    private visualStateStore: VisualStateStore,
    private keyboardNavController?: KeyboardNavigationController,
  ) {
    fileLog.info('InteractionCoordinator initialized')
  }

  /**
   * Set overlay manager reference for fill handle delegation
   */
  setOverlayManager(overlayManager: any): void {
    this.overlayManager = overlayManager
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
      position: { x, y },
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
      targetTag: (target as HTMLElement).tagName,
    })

    // Skip action during multi-select
    if (modifiers.ctrl || modifiers.shift) {
      fileLog.debug('Skipping action during multi-select')
      return
    }

    // Get cell metadata
    const cellData = this.getCellData(rowId, columnId)
    const column = this.visualStateStore.columns.find((c) => c.id === columnId)

    if (!column) {
      fileLog.warn('Column not found', { columnId })
      return
    }

    // Get field type - either from column or lookup from registry
    const fieldType = column.fieldType || fieldTypeRegistry.getFieldType(column as any)

    // Delegate to action router
    this.cellActionRouter.route({
      cellId,
      row: cellData.row,
      column,
      fieldPolicy: fieldType?.interactionPolicy,
      target,
      modifiers,
      nativeEvent,
    })
  }

  /**
   * Handle double click - called by MouseController
   *
   * Some field types (like text) use double-click as edit trigger.
   */
  handleDoubleClick(context: ClickContext): void {
    const { cellId, rowId, columnId, modifiers } = context

    fileLog.debug('handleDoubleClick', {
      cellId,
      rowId,
      columnId,
      modifiers,
    })

    // Skip during multi-select
    if (modifiers.ctrl || modifiers.shift) {
      return
    }

    // Get column metadata
    const column = this.visualStateStore.columns.find((c) => c.id === columnId)
    if (!column) {
      fileLog.warn('Column not found for double-click', { columnId })
      return
    }

    // Get field type - either from column or lookup from registry
    const fieldType = column.fieldType || fieldTypeRegistry.getFieldType(column as any)

    // Check if field policy uses double-click trigger
    const policy = fieldType?.interactionPolicy
    if (policy?.editTrigger === 'double-click') {
      fileLog.debug('Starting edit via double-click policy', {
        cellId,
        fieldType: fieldType?.type,
      })
      this.editingStore.startEdit(cellId, column)
    }
  }

  /**
   * Handle outside pointer - called by ScrollController or MouseController
   *
   * When user clicks outside the grid, either commit editing or clear selection.
   */
  handleOutsidePointer(event: PointerEvent): void {
    const target = event.target as EventTarget | null

    fileLog.debug('handleOutsidePointer', {
      isEditing: this.editingStore.isEditing,
      target: (target as HTMLElement)?.tagName,
    })

    if (this.editingStore.isEditing) {
      if (this.editingStore.isTargetInActiveEditingPortal(target)) {
        fileLog.info('Outside pointer hit active editor portal - preserving edit session')
        return
      }

      fileLog.info('Outside pointer while editing - triggering blur handler')
      this.editingStore.handleBlur('outside-pointer')
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
  handleKeyboardNavigation(key: string, modifiers: ModifierKeys, event?: KeyboardEvent): boolean {
    fileLog.debug('handleKeyboardNavigation', { key, modifiers })

    // If editing, let EditingStore handle it
    if (this.editingStore.isEditing) {
      fileLog.debug('Keyboard event during edit - delegating to EditingStore')

      // Escape cancels editing
      if (key === 'Escape') {
        event?.preventDefault?.()
        event?.stopPropagation?.()
        this.editingStore.cancelEdit('escape')
        this.container.focus()
        return true
      }

      // Enter commits edit; keep cursor behavior in editor for multiline fields
      if (key === 'Enter' && !event?.shiftKey && !this.editingStore.isActiveModalTextEditor) {
        event?.preventDefault?.()
        event?.stopPropagation?.()
        this.editingStore.commitEdit('enter')
        this.container.focus()
        return true
      }

      // Tab commits edit and then navigates
      if (key === 'Tab' && !this.editingStore.isActiveModalTextEditor) {
        event?.preventDefault?.()
        event?.stopPropagation?.()

        this.editingStore.commitEdit('tab')

        if (!this.keyboardNavController) {
          this.container.focus()
          return true
        }

        const targetKey = event?.shiftKey ? 'ArrowLeft' : 'ArrowRight'
        this.container.focus()
        const navEvent = this.createKeyboardEvent(targetKey, {
          ctrl: modifiers.ctrl || modifiers.meta,
          shift: event?.shiftKey || false,
          alt: modifiers.alt,
          meta: modifiers.meta,
        })

        return this.keyboardNavController.handleKeyDown(navEvent)
      }

      // Default: editor handles the key
      return false
    }

    if (!this.keyboardNavController) {
      fileLog.debug('Keyboard navigation unavailable: no KeyboardNavigationController', { key })
      return false
    }

    const navEvent = event || this.createKeyboardEvent(key, modifiers)
    return this.keyboardNavController.handleKeyDown(navEvent)
  }

  /**
   * Build a KeyboardEvent-like object for keyboard controller delegates.
   * Uses a synthetic object when KeyboardEvent is unavailable (tests) or for performance.
   */
  private createKeyboardEvent(key: string, modifiers: ModifierKeys): KeyboardEvent {
    if (typeof KeyboardEvent === 'undefined') {
      return {
        key,
        shiftKey: modifiers.shift,
        altKey: modifiers.alt,
        ctrlKey: modifiers.ctrl,
        metaKey: modifiers.meta,
        bubbles: true,
        cancelable: true,
        preventDefault: () => {},
        stopPropagation: () => {},
      } as unknown as KeyboardEvent
    }

    return new KeyboardEvent('keydown', {
      key,
      shiftKey: modifiers.shift,
      altKey: modifiers.alt,
      ctrlKey: modifiers.ctrl,
      metaKey: modifiers.meta,
      bubbles: true,
      cancelable: true,
    })
  }

  /**
   * Get current cell data from TableCore (always fresh)
   *
   * This ensures we never use stale render snapshot values.
   * The TableCoreStore.processedRows getter always returns current data.
   *
   * NOTE: Wrapped in untracked() because this is called from event handlers
   * (non-reactive context). Without untracked(), MobX warns and forces recompute.
   */
  private getCellData(rowId: string, columnId: string): CellData {
    return untracked(() => {
      const processedRows = this.tableCoreStore.processedRows || []
      const row = processedRows.find((r: any) => r.id === rowId)
      const value = row ? row[columnId] : null

      return { row, value }
    })
  }

  /**
   * Handle fill start - delegate to overlay manager
   */
  handleFillStart(): void {
    fileLog.debug('Fill start - delegating to overlay manager')
    const fillHandleLayer = this.overlayManager?.getCanvasOverlay()?.getFillHandleLayer?.()
    if (fillHandleLayer) {
      fillHandleLayer.handleFillStart()
    }
  }

  /**
   * Handle fill move - delegate to overlay manager
   */
  handleFillMove(cell: { rowId: string; columnId: string }): void {
    const fillHandleLayer = this.overlayManager?.getCanvasOverlay()?.getFillHandleLayer?.()
    if (fillHandleLayer) {
      fillHandleLayer.handleFillMove(cell)
    }
  }

  /**
   * Handle fill complete - delegate to overlay manager
   */
  handleFillComplete(cell: { rowId: string; columnId: string }): void {
    fileLog.debug('Fill complete - delegating to overlay manager')
    const fillHandleLayer = this.overlayManager?.getCanvasOverlay()?.getFillHandleLayer?.()
    if (fillHandleLayer) {
      fillHandleLayer.handleFillComplete(cell)
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
