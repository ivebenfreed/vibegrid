/**
 * EditSessionManager - Owns complete edit lifecycle
 *
 * Always reads fresh values from TableCore, tracks pending changes,
 * and manages commit/cancel operations.
 *
 * Key responsibilities:
 * - Start edit sessions with fresh values (never stale snapshots)
 * - Track pending changes as user types
 * - Commit changes to InteractionStore/TanStack DB
 * - Cancel edits cleanly
 * - Handle blur events according to field policies
 * - Prevent race conditions between commit/cancel
 */

import { runInAction } from 'mobx'
import { createLogger } from '@/shared/lib/logging'
import type { InteractionStore } from '../stores/InteractionStore'
import type { TableCoreStore } from '../stores/TableCoreStore'

const fileLog = createLogger('components/vibegrid/services/EditSessionManager')

// ====================================
// TYPES
// ====================================

export interface EditSession {
  cellId: string
  column: any // Column metadata with fieldType
  originalValue: any // Value when session started
  pendingValue: any // Current typed value (updated on every keystroke)
  validation: EditValidation | null
  startTime: number
}

export interface EditValidation {
  isValid: boolean
  message?: string
}

export type CommitReason = 'enter' | 'tab' | 'blur' | 'outside-click' | 'user-action'
export type CancelReason = 'escape' | 'outside-click' | 'outside-pointer' | 'focus-loss' | 'navigation' | 'user-action'
export type BlurReason = 'outside-pointer' | 'focus-loss'

export type BlurPolicy = 'commit' | 'cancel' | 'keep-open'

// ====================================
// MANAGER
// ====================================

/**
 * EditSessionManager - Manages edit session lifecycle
 */
export class EditSessionManager {
  private currentSession: EditSession | null = null

  constructor(
    private interactionStore: InteractionStore,
    private tableCoreStore: TableCoreStore
  ) {
    fileLog.info('EditSessionManager initialized')
  }

  /**
   * Start edit session with FRESH value from TableCore
   *
   * This is critical: we never use stale render snapshot values.
   * Always fetch current value from TableCoreStore.processedRows.
   */
  start(cellId: string, column: any): void {
    // 1. Fetch CURRENT value from TableCore (not stale render snapshot!)
    const [rowId, columnId] = cellId.split(':')
    const processedRows = this.tableCoreStore.processedRows || []
    const row = processedRows.find((r: any) => r.id === rowId)
    // ✅ Use column.field for data lookup (may differ from columnId)
    const dataField = column.field || columnId
    // ✅ Access row.data (TanStack table row structure)
    const rowData = row?.data || row
    const currentValue = rowData ? rowData[dataField] : ''

    fileLog.info('Starting edit session', {
      cellId,
      rowId,
      columnId,
      dataField,
      currentValue,
      valueType: typeof currentValue,
      valueSource: 'TableCore (fresh)',
      fieldType: column.fieldType?.id,
      // 🔍 DEBUG: Show what fields the rowData actually has
      rowDataFields: rowData ? Object.keys(rowData).slice(0, 20) : [],
      hasDataField: rowData ? dataField in rowData : false
    })

    // 2. Create session to track state
    this.currentSession = {
      cellId,
      column,
      originalValue: currentValue,
      pendingValue: currentValue, // Will be updated as user types
      validation: null,
      startTime: Date.now()
    }

    // 3. Update InteractionStore (triggers EditingOverlay via MobX reaction)
    this.interactionStore.startEdit(cellId, currentValue)
  }

  /**
   * Update pending value (called on every keystroke via onUpdate callback)
   */
  updateValue(value: any): void {
    if (!this.currentSession) {
      fileLog.warn('updateValue called but no active session')
      return
    }

    fileLog.debug('Updating pending value', {
      cellId: this.currentSession.cellId,
      oldValue: this.currentSession.pendingValue,
      newValue: value,
      valueType: typeof value
    })

    // Track in session
    this.currentSession.pendingValue = value

    // Sync to InteractionStore (already done by onUpdate callback, but keep in sync)
    // this.interactionStore.updateEditValue(value) // No need - onUpdate already does this
  }

  /**
   * Commit edit (save to database)
   *
   * @param reason Why the commit is happening
   * @param explicitValue Optional explicit value (overrides pendingValue)
   */
  async commit(reason: CommitReason, explicitValue?: any): Promise<void> {
    if (!this.currentSession) {
      fileLog.warn('commit() called but no active session', { reason })
      return
    }

    // Use explicit value if provided, otherwise pendingValue from session
    const finalValue = explicitValue !== undefined
      ? explicitValue
      : this.currentSession.pendingValue

    const { cellId, originalValue, pendingValue } = this.currentSession

    fileLog.info('Committing edit', {
      cellId,
      reason,
      originalValue,
      pendingValue,
      explicitValue,
      finalValue,
      valueChanged: finalValue !== originalValue,
      duration: `${Date.now() - this.currentSession.startTime}ms`
    })

    // Save via InteractionStore (optimistic update + TanStack DB persistence)
    await this.interactionStore.saveEdit(finalValue)

    // Clear session
    this.currentSession = null

    fileLog.info('Edit committed successfully', { cellId, reason })
  }

  /**
   * Cancel edit (revert changes)
   */
  cancel(reason: CancelReason): void {
    if (!this.currentSession) {
      fileLog.warn('cancel() called but no active session', { reason })
      return
    }

    const { cellId, originalValue, pendingValue } = this.currentSession

    fileLog.info('Cancelling edit', {
      cellId,
      reason,
      originalValue,
      pendingValue,
      duration: `${Date.now() - this.currentSession.startTime}ms`
    })

    // Cancel in InteractionStore (clears editing state + sets isCancelling flag)
    this.interactionStore.cancelEdit()

    // Clear session
    this.currentSession = null

    fileLog.info('Edit cancelled successfully', { cellId, reason })
  }

  /**
   * Handle blur event (outside click, focus loss)
   *
   * Behavior depends on field policy:
   * - commit: Save changes and close editor
   * - cancel: Discard changes and close editor
   * - keep-open: Do nothing (editor stays open)
   */
  async handleBlur(reason: BlurReason): Promise<void> {
    if (!this.currentSession) {
      fileLog.debug('handleBlur called but no active session', { reason })
      return
    }

    const { cellId, column, pendingValue } = this.currentSession

    fileLog.info('Handling blur', {
      cellId,
      reason,
      pendingValue,
      fieldType: column.fieldType?.id
    })

    // Get field blur policy
    const policy = column.fieldType?.interactionPolicy
    const blurBehavior: BlurPolicy = policy?.blurPolicy || 'commit'

    fileLog.debug('Applying blur policy', {
      cellId,
      policy: blurBehavior,
      fieldType: column.fieldType?.id
    })

    switch (blurBehavior) {
      case 'commit':
        // Wait for editor to flush any pending state (RAF or microtask)
        await new Promise(resolve => requestAnimationFrame(resolve))
        await this.commit('blur')
        break

      case 'cancel':
        this.cancel(reason)
        break

      case 'keep-open':
        fileLog.debug('Keeping editor open (policy: keep-open)', { cellId })
        // Do nothing - editor stays open
        break

      default:
        fileLog.warn('Unknown blur policy, defaulting to commit', {
          policy: blurBehavior
        })
        await this.commit('blur')
    }
  }

  /**
   * Check if currently editing
   */
  isEditing(): boolean {
    return this.currentSession !== null
  }

  /**
   * Get current edit session (for debugging/inspection)
   */
  getCurrentSession(): EditSession | null {
    return this.currentSession
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    if (this.currentSession) {
      fileLog.warn('Disposing EditSessionManager with active session', {
        cellId: this.currentSession.cellId
      })
      this.cancel('navigation')
    }
    fileLog.info('EditSessionManager disposed')
  }
}
