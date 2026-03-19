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
   * 0. Check if column is editable (skip edit actions for non-editable columns)
   * 1. **NEW: Check data-affordance attribute (Affordance Group system)**
   * 2. Explicit edit trigger (data-edit-trigger="true") [legacy]
   * 3. Check if click is on content element (for content-click trigger) [legacy]
   * 4. Field interaction policy [legacy]
   * 5. Default to 'none' (selection only)
   */
  private determineAction(context: CellActionContext): CellAction {
    const { target, fieldPolicy, column } = context

    // FIRST: Check if column is editable - non-editable columns can only navigate or do nothing
    if (column.editable === false) {
      fileLog.debug('Column not editable, skipping edit actions', { columnId: column.id })
      // Check for navigate affordance on non-editable columns (e.g., entity name link)
      const navigateElement = (target as HTMLElement).closest('[data-affordance="navigate"]')
      if (navigateElement) {
        fileLog.debug('Navigate affordance found on non-editable column', {
          element: (navigateElement as HTMLElement).tagName,
        })
        return 'navigate'
      }
      // Legacy fallback for data-action="navigate"
      const actionElement = (target as HTMLElement).closest('[data-action="navigate"]')
      if (actionElement) {
        return 'navigate'
      }
      return 'none'
    }

    // ========================================
    // Content-click spatial check (before affordance lookup)
    // ========================================
    // For content-click fields, distinguish content clicks (edit) from padding clicks (select only).
    // This must run BEFORE the data-affordance lookup because the container has data-affordance="edit"
    // which would make padding clicks incorrectly trigger edit.
    if (fieldPolicy?.editTrigger === 'content-click') {
      // First check if a child element has its own data-affordance (e.g., select badge)
      const childAffordance = (target as HTMLElement).closest('[data-affordance]')
      const cellContainer = (target as HTMLElement).closest('[data-row-id][data-column-id]')
      if (childAffordance && childAffordance !== cellContainer) {
        // Click is on a child with explicit affordance (badge, icon, etc.)
        const affordance = childAffordance.getAttribute('data-affordance')
        fileLog.debug('Content-click: child affordance found', { affordance })
        if (affordance === 'edit' || affordance === 'toggle') return 'edit'
        if (affordance === 'navigate') return 'navigate'
        if (affordance === 'none') return 'none'
      }

      // Spatial check: is the click on content or padding?
      // Check child elements first, then fall back to text nodes.
      const contentElement = cellContainer?.firstElementChild
      if (
        contentElement &&
        (target === contentElement || contentElement.contains(target as Node))
      ) {
        fileLog.debug('Content-click: content element clicked - edit', {
          targetTag: (target as HTMLElement).tagName,
        })
        return 'edit'
      }

      // No child elements but cell has text content (e.g., textContent-only cells).
      // The text fills the cell, so clicking anywhere on it is a content click.
      // Only return 'none' if the cell truly has no content (empty, handled above).
      if (!contentElement && cellContainer?.textContent?.trim()) {
        fileLog.debug('Content-click: text-only cell clicked - edit')
        return 'edit'
      }

      // Padding click - select only
      fileLog.debug('Content-click: padding clicked - select only')
      return 'none'
    }

    // ========================================
    // Affordance Group System
    // ========================================
    // Check for data-affordance attribute on clicked element or ancestors
    const affordanceElement = (target as HTMLElement).closest('[data-affordance]')
    if (affordanceElement) {
      const affordance = affordanceElement.getAttribute('data-affordance')
      const affordanceRole = affordanceElement.getAttribute('data-affordance-role')

      fileLog.debug('Affordance attribute found', {
        affordance,
        affordanceRole,
        element: (affordanceElement as HTMLElement).tagName,
      })

      // Map affordance values to actions
      switch (affordance) {
        case 'edit':
          return 'edit'

        case 'toggle':
          // Toggle controls (booleans) edit on click
          return 'edit'

        case 'navigate':
          return 'navigate'

        case 'none':
          return 'none'

        default:
          fileLog.debug('Unknown affordance value, falling through to legacy', { affordance })
        // Fall through to legacy checks
      }
    }

    // ========================================
    // Legacy System (Backward Compatibility)
    // ========================================

    // Check for explicit edit trigger (e.g., pencil icon with data-edit-trigger="true")
    const editTrigger = (target as HTMLElement).closest('[data-edit-trigger="true"]')
    if (editTrigger) {
      fileLog.debug('Explicit edit trigger found', {
        element: (editTrigger as HTMLElement).tagName,
      })
      return 'edit'
    }

    // Check for explicit data-action attribute (e.g., text element with data-action="navigate")
    const actionElement = (target as HTMLElement).closest('[data-action]')
    if (actionElement) {
      const explicitAction = actionElement.getAttribute('data-action') as CellAction
      if (explicitAction && ['navigate', 'edit', 'custom', 'none'].includes(explicitAction)) {
        fileLog.debug('Explicit action from data-action attribute', {
          action: explicitAction,
          element: (actionElement as HTMLElement).tagName,
        })
        return explicitAction
      }
    }

    // Check for data-cell-action attribute (legacy)
    const cellElement = (target as HTMLElement).closest('[data-cell-action]')
    if (cellElement) {
      const explicitAction = cellElement.getAttribute('data-cell-action') as CellAction
      if (explicitAction && ['navigate', 'edit', 'custom', 'none'].includes(explicitAction)) {
        fileLog.debug('Explicit action from data-cell-action attribute', {
          action: explicitAction,
        })
        return explicitAction
      }
    }

    // Use field interaction policy
    if (fieldPolicy) {
      // content-click is handled above (before affordance lookup)

      // For 'click' trigger: Always edit on any click
      if (fieldPolicy.editTrigger === 'click') {
        return 'edit'
      }

      // For other triggers (f2, icon, none):
      // - If defaultAction='navigate', needs explicit data-action="navigate" (set on text element)
      // - If defaultAction='edit', needs explicit trigger (content-click, click, etc.)
      // Without explicit trigger, default to 'none' (selection only)

      // For fields with special triggers (icon, f2), clicking padding = selection only
      fileLog.debug('No explicit trigger - defaulting to selection only', {
        editTrigger: fieldPolicy.editTrigger,
        defaultAction: fieldPolicy.defaultAction,
      })
      return 'none'
    }

    // No policy - default to 'none' (selection only)
    fileLog.debug('No field policy - defaulting to none', {
      cellType: column.cellType,
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
