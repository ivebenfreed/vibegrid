/**
 * CellActionRouter - Decides what action to take after selection
 *
 * Consults field interaction policies and app-level callbacks
 * to determine the appropriate action: navigate, edit, custom, or none.
 *
 * Key responsibilities:
 * - Invoke app-level onCellClick callback
 * - Determine action based on field interaction policy
 * - Execute appropriate action (edit, navigate, custom, or none)
 * - Respect explicit edit triggers (data-edit-trigger="true")
 */

import { getLogger } from '@/shared/lib/logging'
import type { ModifierKeys } from '../coordination/InteractionCoordinator'
// FieldInteractionPolicy is now inline - same shape as CellRenderer.interactionPolicy
export interface FieldInteractionPolicy {
  defaultAction: 'navigate' | 'edit' | 'custom' | 'none'
  editTrigger: 'content-click' | 'click' | 'f2' | 'icon' | 'none'
  blurPolicy: 'commit' | 'cancel' | 'keep-open'
}
import type { EditingStore } from '../stores/EditingStore'

const fileLog = getLogger(['vibegrid', 'routing', 'CellActionRouter'])

// ====================================
// TYPES
// ====================================

export interface CellActionContext {
  cellId: string
  row: any
  column: any
  fieldPolicy?: FieldInteractionPolicy
  target: Element
  modifiers: ModifierKeys
  nativeEvent: MouseEvent
}

// FieldInteractionPolicy is defined locally (same shape as CellRenderer.interactionPolicy)

export type CellAction = 'navigate' | 'edit' | 'custom' | 'none'

/**
 * Callback type for app-level cell click handling
 *
 * Return 'handled' to prevent default action.
 * Return void or undefined to allow default action.
 */
export type OnCellClickCallback = (
  rowId: string,
  columnId: string,
  event?: MouseEvent,
) => undefined | 'handled'

// ====================================
// ROUTER
// ====================================

/**
 * CellActionRouter - Routes cell interactions to appropriate actions
 */
export class CellActionRouter {
  constructor(
    private editingStore: EditingStore,
    private onCellClick?: OnCellClickCallback,
  ) {
    fileLog.info('CellActionRouter initialized', {
      hasCallback: !!onCellClick,
    })
  }

  /**
   * Route cell action based on context and policies
   *
   * Flow:
   * 1. Invoke app-level onCellClick callback (if provided)
   * 2. Check if callback prevented default action
   * 3. Determine action from field policy or explicit triggers
   * 4. Execute action (edit, navigate, custom, or none)
   */
  route(context: CellActionContext): void {
    const { cellId, row, column, fieldPolicy, target, nativeEvent } = context

    fileLog.debug('Routing cell action', {
      cellId,
      rowId: row?.id,
      columnId: column?.id,
      cellType: column.cellType,
      hasCallback: !!this.onCellClick,
      hasPolicy: !!fieldPolicy,
    })

    // 1. Determine action FIRST (based on explicit triggers and policies)
    const action = this.determineAction(context)

    fileLog.debug('Action determined', {
      cellId,
      action,
      cellType: column.cellType,
      policy: fieldPolicy?.defaultAction,
    })

    // 2. For navigate actions, check for URL href first, then invoke onCellClick callback
    if (action === 'navigate') {
      // Check if this is a URL navigation (external link)
      const urlHref = (target as HTMLElement)
        .closest('[data-url-href]')
        ?.getAttribute('data-url-href')
      if (urlHref) {
        fileLog.debug('Opening external URL', { urlHref })
        window.open(urlHref, '_blank', 'noopener,noreferrer')
        return
      }

      // Otherwise, invoke onCellClick callback for entity navigation
      if (this.onCellClick && row && column) {
        fileLog.debug('Invoking onCellClick callback for navigation', {
          rowId: row.id,
          columnId: column.id,
        })

        const result = this.onCellClick(row.id, column.id, nativeEvent)

        // Check if callback prevented default
        if (result === 'handled' || nativeEvent.defaultPrevented) {
          fileLog.debug('Navigation prevented by callback', {
            result,
            defaultPrevented: nativeEvent.defaultPrevented,
          })
          return
        }
      }
    }

    // 3. Execute action (edit, custom, or none - not navigate since callback handled it)
    if (action !== 'navigate') {
      this.executeAction(action, context)
    }
  }

  /**
   * Determine what action to take based on context
   *
   * Priority:
   * 1. Non-editable column guard (can only navigate or none)
   * 2. Content-click fields: data-action lookup within cell
   * 3. All fields: data-action on clicked element (sole routing signal)
   * 4. Field policy fallback: editTrigger='click' → edit
   * 5. Default to 'none' (selection only — padding clicks always select)
   *
   * data-affordance on containers is CSS-only (cursor styling), never used for routing.
   */
  private determineAction(context: CellActionContext): CellAction {
    const { target, fieldPolicy, column } = context

    // FIRST: Check if column is editable - non-editable columns can only navigate or do nothing
    if (column.editable === false) {
      fileLog.debug('Column not editable, skipping edit actions', { columnId: column.id })
      // Check data-action first (new system), then data-affordance (backward compat)
      const actionElement = (target as HTMLElement).closest('[data-action="navigate"]')
      if (actionElement) {
        return 'navigate'
      }
      const navigateElement = (target as HTMLElement).closest('[data-affordance="navigate"]')
      if (navigateElement) {
        fileLog.debug('Navigate affordance found on non-editable column', {
          element: (navigateElement as HTMLElement).tagName,
        })
        return 'navigate'
      }
      return 'none'
    }

    // ========================================
    // Content-click: data-action lookup (replaces spatial check)
    // ========================================
    // For content-click fields, use [data-action] on child elements to determine action.
    // Clicks on padding (no [data-action] ancestor within cell) fall through to 'none'.
    if (fieldPolicy?.editTrigger === 'content-click') {
      const cellContainer = (target as HTMLElement).closest('[data-row-id][data-column-id]')
      const actionElement = (target as HTMLElement).closest('[data-action]')
      if (actionElement && cellContainer?.contains(actionElement)) {
        const action = actionElement.getAttribute('data-action')
        fileLog.debug('Content-click: data-action found', { action })
        if (action === 'edit') return 'edit'
        if (action === 'navigate') return 'navigate'
        if (action === 'none') return 'none'
      }
      // Padding click — select only
      fileLog.debug('Content-click: padding clicked - select only')
      return 'none'
    }

    // ========================================
    // data-action on clicked element
    // ========================================
    // data-action is set on interactive children (text, icons) and is the sole
    // routing signal. data-affordance on containers is CSS-only (cursor styling).
    // Clicking padding (no data-action ancestor within cell) always selects.
    {
      const cellContainer = (target as HTMLElement).closest('[data-row-id][data-column-id]')
      const actionElement = (target as HTMLElement).closest('[data-action]')
      if (actionElement && cellContainer?.contains(actionElement)) {
        const action = actionElement.getAttribute('data-action')
        fileLog.debug('data-action found on clicked element', { action })
        if (action === 'edit') return 'edit'
        if (action === 'navigate') return 'navigate'
        if (action === 'toggle') return 'edit'
        if (action === 'none') return 'none'
      }
    }

    // ========================================
    // Field interaction policy fallback
    // ========================================
    if (fieldPolicy?.editTrigger === 'click') {
      // 'click' trigger: any click anywhere in the cell edits
      return 'edit'
    }

    // Padding click or no data-action found — selection only
    fileLog.debug('No data-action on target - selecting only', {
      cellType: column.cellType,
      editTrigger: fieldPolicy?.editTrigger,
    })
    return 'none'
  }

  /**
   * Execute the determined action
   */
  private executeAction(action: CellAction, context: CellActionContext): void {
    const { cellId, column } = context

    switch (action) {
      case 'navigate':
        fileLog.debug('Navigation action (handled by callback)', { cellId })
        // Navigation is handled by onCellClick callback
        // No additional work needed here
        break

      case 'edit':
        fileLog.debug('Starting edit session', {
          cellId,
          cellType: column.cellType,
        })
        this.editingStore.startEdit(cellId, column)
        break

      case 'custom':
        fileLog.debug('Custom action - not yet supported via SlotRegistry', {
          cellId,
          cellType: column.cellType,
        })
        // Custom actions will be handled via CellRenderer.handleClick() in Phase 2
        break

      case 'none':
        fileLog.debug('No action (selection only)', { cellId })
        // Selection already handled by SelectionService
        break

      default:
        fileLog.warn('Unknown action', {
          action,
          cellId,
        })
    }
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    fileLog.info('CellActionRouter disposed')
    // No resources to clean up
  }
}
