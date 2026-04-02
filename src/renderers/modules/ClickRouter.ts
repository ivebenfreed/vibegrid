/**
 * ClickRouter - Click event interpretation and dispatch for VibeGrid
 *
 * Extracted from MouseController. Handles single/double click detection,
 * content vs affordance click routing, right-click context menu trigger,
 * and delegates to CellActionRouter and InteractionCoordinator.
 */

import { getLogger } from '@/shared/lib/logging'
import type { InteractionCoordinator } from '../../coordination/InteractionCoordinator'
import type { VisualStateStore } from '../../stores/VisualStateStore'

const fileLog = getLogger(['custom', 'vibegrid', 'renderers', 'modules', 'ClickRouter.ts'])

export interface ClickRouterDeps {
  container: HTMLElement
  selectionController?: any // For row selection operations
  interactionStore: any // For menu state, row expansion, resize timing
  visualStateStore: VisualStateStore // For toggleSort, toggleGroupExpansion
  tableCoreStore?: any // For processedRows (expand all)
  scrollController?: any // For handleOutsideClick
  coordinator?: InteractionCoordinator // For handleClick delegation
  enableSelectionColumn: boolean
}

/**
 * Routes click events to the appropriate handler.
 *
 * Responsibilities:
 * - Cell clicks -> InteractionCoordinator.handleClick()
 * - Row header clicks -> SelectionController row selection
 * - Column header clicks -> VisualStateStore.toggleSort()
 * - Group header clicks -> VisualStateStore.toggleGroupExpansion()
 * - Row expand header -> InteractionStore expand/collapse all
 * - Outside clicks -> ScrollController.handleOutsideClick()
 * - Expand button clicks -> suppressed (handled in pointerdown)
 */
export class ClickRouter {
  private container: HTMLElement
  private selectionController?: any
  private interactionStore: any
  private visualStateStore: VisualStateStore
  private tableCoreStore?: any
  private scrollController?: any
  private coordinator?: InteractionCoordinator
  private enableSelectionColumn: boolean

  constructor(deps: ClickRouterDeps) {
    this.container = deps.container
    this.selectionController = deps.selectionController
    this.interactionStore = deps.interactionStore
    this.visualStateStore = deps.visualStateStore
    this.tableCoreStore = deps.tableCoreStore
    this.scrollController = deps.scrollController
    this.coordinator = deps.coordinator
    this.enableSelectionColumn = deps.enableSelectionColumn
    fileLog.debug('ClickRouter initialized')
  }

  /**
   * Route a click event to the appropriate handler.
   * This is the main entry point, called by MouseController's onClick handler.
   *
   * @param e - The mouse click event
   * @param isDragging - Whether a drag is currently in progress
   * @param justEndedDrag - Whether a drag just ended (prevents click after drag)
   * @returns true if the event was handled and should stop propagation
   */
  routeClick(e: MouseEvent, isDragging: boolean, justEndedDrag: boolean): boolean {
    // Ignore clicks that resulted from drag or resize operations
    if (isDragging || justEndedDrag) {
      fileLog.debug('Click blocked - was result of drag or resize operation', {
        isDragging,
        justEndedDrag,
      })
      e.preventDefault()
      e.stopPropagation()
      return true
    }

    // Resolve the real element under the cursor. setPointerCapture() on the
    // container during pointerdown redirects pointerup to the container,
    // which causes the click event to fire with the container as e.target
    // instead of the actual cell element. elementFromPoint gives us the
    // true element under the cursor.
    const target = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement) || (e.target as HTMLElement)
    const isWithinContainer = this.container.contains(target)

    fileLog.info('onClick entry', {
      targetTag: target.tagName,
      targetClass: target.className,
      targetId: target.id,
      isWithinContainer,
      targetHasDataAction: target.getAttribute('data-action'),
      closestExpandButton: !!target.closest('[data-action="expand-row"]'),
    })

    if (isWithinContainer) {
      return this.handleContainerClick(e, target)
    } else {
      return this.handleOutsideClick(e)
    }
  }

  /**
   * Handle clicks within the grid container.
   */
  private handleContainerClick(e: MouseEvent, target: HTMLElement): boolean {
    // Expand-row clicks are handled in onPointerDown, not onClick
    const expandButton = target.closest('[data-action="expand-row"]') as HTMLElement | null
    if (expandButton) {
      fileLog.debug('[onClick] Ignoring expand button - handled in pointerdown')
      e.stopPropagation()
      e.preventDefault()
      return true
    }

    const cellElement = target.closest('[data-row-id][data-column-id]')
    const rowHeaderElement = target.closest('[data-interaction-type="row-header"]')

    if (cellElement && this.selectionController) {
      return this.handleCellClick(e, cellElement, target)
    } else if (rowHeaderElement && this.selectionController) {
      return this.handleRowHeaderClick(e, rowHeaderElement, target)
    } else {
      return this.handleNonCellClick(e, target, cellElement)
    }
  }

  /**
   * Handle cell clicks - delegate to InteractionCoordinator.
   */
  private handleCellClick(e: MouseEvent, cellElement: Element, resolvedTarget?: HTMLElement): boolean {
    const rowId = cellElement.getAttribute('data-row-id')
    const columnId = cellElement.getAttribute('data-column-id')
    const cellId = `${rowId}:${columnId}`

    fileLog.debug('Cell click detected', {
      cellId,
      rowId,
      columnId,
      isShiftKey: e.shiftKey,
      isCtrlKey: e.ctrlKey || e.metaKey,
      hasCoordinator: !!this.coordinator,
    })

    if (!this.coordinator) {
      fileLog.error('CRITICAL: Coordinator not initialized - this should never happen')
      return false
    }

    fileLog.debug('Delegating cell click to InteractionCoordinator')

    this.coordinator.handleClick({
      cellId,
      rowId: rowId!,
      columnId: columnId!,
      x: e.clientX,
      y: e.clientY,
      target: (resolvedTarget || e.target) as Element,
      modifiers: {
        ctrl: e.ctrlKey,
        shift: e.shiftKey,
        alt: e.altKey,
        meta: e.metaKey,
      },
      nativeEvent: e,
    })

    e.stopPropagation()
    return true
  }

  /**
   * Handle row header clicks - toggle/range row selection.
   */
  private handleRowHeaderClick(e: MouseEvent, rowHeaderElement: Element, _target: HTMLElement): boolean {
    if (!this.enableSelectionColumn) {
      return false
    }

    const rowId = rowHeaderElement.getAttribute('data-row-id')
    if (rowId) {
      fileLog.debug('Row header click detected', {
        rowId,
        isShiftKey: e.shiftKey,
        isCtrlKey: e.ctrlKey,
      })

      if (e.shiftKey) {
        const lastRowId = this.selectionController.getLastSelectedRowId()
        if (lastRowId) {
          this.selectionController.selectRowRange(lastRowId, rowId)
        } else {
          this.selectionController.selectRow(rowId)
        }
      } else {
        this.selectionController.toggleRowSelection(rowId)
      }
    }
    return true
  }

  /**
   * Handle clicks that are not on cells or row headers.
   * Checks for group headers, column headers, and fallback cases.
   */
  private handleNonCellClick(e: MouseEvent, target: HTMLElement, cellElement: Element | null): boolean {
    // Check for group header row clicks
    const groupRowElement = target.closest('.vibegridx-group-header')
    if (groupRowElement) {
      const groupId = groupRowElement.getAttribute('data-group-id')
      if (groupId) {
        fileLog.debug('Group header row clicked', {
          groupId,
          targetTag: target.tagName,
          targetClass: target.className,
        })
        this.visualStateStore.toggleGroupExpansion(groupId)
        fileLog.debug('toggleGroupExpansion called', { groupId })
        return true
      }
    }

    // Check for column header clicks
    const columnHeaderElement = target.closest('[data-interaction-type="column-header"]')

    fileLog.debug('Click target analysis', {
      targetTag: target.tagName,
      targetClass: target.className,
      targetId: target.id,
      hasDataInteractionType: target.hasAttribute('data-interaction-type'),
      targetDataInteractionType: target.getAttribute('data-interaction-type'),
      columnHeaderElement: !!columnHeaderElement,
      columnHeaderTag: columnHeaderElement?.tagName,
      columnHeaderClass: columnHeaderElement?.className,
    })

    if (columnHeaderElement) {
      return this.handleColumnHeaderClick(e, columnHeaderElement, target)
    } else if (!cellElement) {
      // Fallback: check for missed column header clicks
      const fallbackColumnHeader = target.closest('[data-interaction-type="column-header"]')
      if (fallbackColumnHeader) {
        return this.handleColumnHeaderClick(e, fallbackColumnHeader, target)
      }

      // Click within container but not on a cell - preserve selection
      fileLog.debug('Container click (non-cell) detected - preserving selection', {
        targetTag: target.tagName,
        targetClass: target.className,
        targetId: target.id,
        targetHasDataColumnId: target.hasAttribute('data-column-id'),
        targetHasDataInteractionType: target.hasAttribute('data-interaction-type'),
        targetDataInteractionType: target.getAttribute('data-interaction-type'),
        closestColumnHeader: !!target.closest('[data-interaction-type="column-header"]'),
        closestWithDataColumnId: !!target.closest('[data-column-id]'),
      })
    }

    return false
  }

  /**
   * Handle column header clicks - sort toggle, row-expand toggle.
   */
  private handleColumnHeaderClick(e: MouseEvent, columnHeaderElement: Element, target: HTMLElement): boolean {
    // Don't sort if clicking on resize handle
    if (target.classList.contains('vibegridx-resize-handle')) {
      return false
    }

    // Don't sort if column resize just ended (within 150ms)
    const timeSinceResize = Date.now() - this.interactionStore.lastResizeEndTime
    if (timeSinceResize < 150) {
      fileLog.debug('Ignoring column header click - resize just ended', {
        timeSinceResize,
        threshold: 150,
      })
      return false
    }

    const columnId = columnHeaderElement.getAttribute('data-column-id')
    const field = columnHeaderElement.getAttribute('data-field')
    const cellType = columnHeaderElement.getAttribute('data-cell-type')

    if (columnId && field) {
      // Handle row-expand column header click: toggle expand/collapse all
      if (cellType === 'row-expand') {
        fileLog.debug('Row-expand header clicked - toggling all rows', {
          columnId,
          hasExpandedRows: this.interactionStore.hasExpandedRows,
        })

        if (this.interactionStore.hasExpandedRows) {
          this.interactionStore.collapseAllRows()
        } else {
          const rowIds =
            this.tableCoreStore?.processedRows
              ?.filter((row: any) => row.type !== 'group-header' && row.type !== 'expanded-content')
              ?.map((row: any) => row.id) || []
          this.interactionStore.expandAllRows(rowIds)
        }
        return true
      }

      const isCtrlKey = e.ctrlKey || e.metaKey
      const isShiftKey = e.shiftKey
      const isMultiSort = isShiftKey

      fileLog.debug('Column header clicked for sort', {
        columnId,
        field,
        isMultiSort,
        isShiftKey,
        isCtrlKey,
      })

      this.visualStateStore.toggleSort(field, isMultiSort)
      return true
    }

    return false
  }

  /**
   * Handle clicks outside the grid container - delegate to ScrollController for blur.
   */
  private handleOutsideClick(e: MouseEvent): boolean {
    fileLog.debug('Outside container click detected - delegating to ScrollController for blur')

    if (this.scrollController?.handleOutsideClick) {
      this.scrollController.handleOutsideClick(e)
    } else {
      fileLog.warn('ScrollController handleOutsideClick method not available')
    }

    return false
  }

  /**
   * Update late-bound dependencies.
   */
  setSelectionController(selectionController: any): void {
    this.selectionController = selectionController
  }

  setScrollController(scrollController: any): void {
    this.scrollController = scrollController
  }
}
