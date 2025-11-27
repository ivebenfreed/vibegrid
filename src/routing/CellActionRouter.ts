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

import { createLogger } from '@/shared/lib/logging'
import type { ModifierKeys } from '../coordination/InteractionCoordinator'
import type { FieldInteractionPolicy } from '../field-types/FieldTypeRegistry'
import type { EditSessionManager } from '../services/EditSessionManager'

const fileLog = createLogger('components/vibegrid/routing/CellActionRouter')

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

// ✅ FieldInteractionPolicy is imported from FieldTypeRegistry (single source of truth)

export type CellAction = 'navigate' | 'edit' | 'custom' | 'none'

/**
 * Callback type for app-level cell click handling
 *
 * Return 'handled' to prevent default action.
 * Return void or undefined to allow default action.
 */
export type OnCellClickCallback = (rowId: string, columnId: string) => void | 'handled'

// ====================================
// ROUTER
// ====================================

/**
 * CellActionRouter - Routes cell interactions to appropriate actions
 */
export class CellActionRouter {
  constructor(
    private editSessionManager: EditSessionManager,
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
      fieldType: column.fieldType?.id,
      hasCallback: !!this.onCellClick,
      hasPolicy: !!fieldPolicy,
    })

    // 1. Determine action FIRST (based on explicit triggers and policies)
    const action = this.determineAction(context)

    fileLog.debug('Action determined', {
      cellId,
      action,
      fieldType: column.fieldType?.id,
      policy: fieldPolicy?.defaultAction,
    })

    // 2. For navigate actions, invoke onCellClick callback
    if (action === 'navigate' && this.onCellClick && row && column) {
      fileLog.debug('Invoking onCellClick callback for navigation', {
        rowId: row.id,
        columnId: column.id,
      })

      const result = this.onCellClick(row.id, column.id)

      // Check if callback prevented default
      if (result === 'handled' || nativeEvent.defaultPrevented) {
        fileLog.debug('Navigation prevented by callback', {
          result,
          defaultPrevented: nativeEvent.defaultPrevented,
        })
        return
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
   * 1. Explicit edit trigger (data-edit-trigger="true")
   * 2. Check if click is on content element (for content-click trigger)
   * 3. Field interaction policy
   * 4. Default to 'none' (selection only)
   */
  private determineAction(context: CellActionContext): CellAction {
    const { target, fieldPolicy, column } = context

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
      // For content-click trigger: Check if click is on content element (spatial pattern)
      if (fieldPolicy.editTrigger === 'content-click') {
        // Check if target is content element (first child of cell) vs cell padding
        const cellContainer = (target as HTMLElement).closest('[data-row-id][data-column-id]')
        // Use firstElementChild to get the direct child - the actual content element
        // Don't use querySelector('span') as it may find nested spans in complex structures
        const contentElement = cellContainer?.firstElementChild

        // If clicking content element (or its children), start edit
        if (
          contentElement &&
          (target === contentElement || contentElement.contains(target as Node))
        ) {
          fileLog.debug('Content element clicked - starting edit', {
            targetTag: (target as HTMLElement).tagName,
            contentTag: (contentElement as HTMLElement).tagName,
          })
          return 'edit'
        }

        // If clicking cell padding, use defaultAction (usually should be 'none' or 'navigate')
        fileLog.debug('Cell padding clicked - no edit', {
          defaultAction: fieldPolicy.defaultAction,
        })
        // For fields with defaultAction='edit', return 'none' when clicking padding
        return fieldPolicy.defaultAction === 'edit' ? 'none' : fieldPolicy.defaultAction
      }

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
      fieldType: column.fieldType?.id,
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
          fieldType: column.fieldType?.id,
        })
        this.editSessionManager.start(cellId, column)
        break

      case 'custom':
        fileLog.debug('Custom action (delegating to field type)', {
          cellId,
          fieldType: column.fieldType?.id,
        })
        column.fieldType?.handleClick?.(context)
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
