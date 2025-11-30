/**
 * EditingStore - Single source of truth for cell editing state
 *
 * Replaces:
 * - EditSessionManager (292 lines) - session lifecycle management
 * - InteractionStore editing fields - editing observables and actions
 *
 * Key responsibilities:
 * - Track edit session (cell, value, validation)
 * - Start/commit/cancel edit lifecycle
 * - Handle outside clicks with blur policy
 * - Consistent value lookup (always column.field + row.data[field])
 * - Prevent race conditions with session ready check
 *
 * Benefits:
 * - Single source of truth (no duplicate state)
 * - No sync issues between manager and store
 * - Consistent value access across keyboard and click paths
 * - Clear ownership of edit lifecycle
 */

import { action, computed, makeObservable, observable, runInAction, untracked } from 'mobx'
import type { IStore } from '@/app/stores/types'
import { DisposerManager } from '@/app/stores/utils/disposer'
import { getLogger } from '@/shared/lib/logging'
import type { TableCoreStore } from './TableCoreStore'
import type { VisualStateStore } from './VisualStateStore'

const fileLog = getLogger(['vibegrid', 'stores', 'EditingStore'])

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
export type CancelReason =
  | 'escape'
  | 'outside-click'
  | 'outside-pointer'
  | 'focus-loss'
  | 'navigation'
  | 'user-action'
export type BlurReason = 'outside-pointer' | 'focus-loss'
export type BlurPolicy = 'commit' | 'cancel' | 'keep-open'

// ====================================
// STORE
// ====================================

/**
 * EditingStore - Manages all editing state and lifecycle
 *
 * Single source of truth for cell editing.
 * No more sync issues between EditSessionManager and InteractionStore.
 */
export class EditingStore implements IStore {
  // ====================================
  // SESSION STATE
  // ====================================

  /**
   * Current edit session
   * When null, no editing is active
   */
  @observable private currentSession: EditSession | null = null

  /**
   * Session ready flag
   * Prevents commit() before session fully initialized (fixes Issue #7)
   */
  @observable private sessionReady: boolean = false

  /**
   * Cancelling flag
   * Prevents saveEdit during cancellation (race condition guard)
   */
  @observable private isCancelling: boolean = false

  /**
   * Version tracking for efficient change detection
   * Incremented whenever editing state changes
   */
  @observable editingVersion: number = 0

  // ====================================
  // COMPUTED STATE (Derived from currentSession)
  // ====================================

  /**
   * Currently editing cell ID (e.g., "row123:columnA")
   * Null when not editing
   */
  @computed
  get editingCell(): string | null {
    return this.currentSession?.cellId ?? null
  }

  /**
   * Current edit value (pending value)
   * Updates as user types
   */
  @computed
  get editValue(): any {
    return this.currentSession?.pendingValue ?? null
  }

  /**
   * Is currently editing?
   */
  @computed
  get isEditing(): boolean {
    return this.currentSession !== null
  }

  /**
   * Current validation state
   */
  @computed
  get editValidation(): EditValidation | null {
    return this.currentSession?.validation ?? null
  }

  /**
   * Original value when edit started
   * Used to detect if value actually changed
   */
  @computed
  get originalValue(): any {
    return this.currentSession?.originalValue ?? null
  }

  // ====================================
  // DEPENDENCIES
  // ====================================

  private tableCoreStore: TableCoreStore
  private collection: any = null // TanStack DB collection for mutations
  private disposers = new DisposerManager()

  constructor(tableCoreStore: TableCoreStore, visualStateStore: VisualStateStore) {
    this.tableCoreStore = tableCoreStore
    this.visualStateStore = visualStateStore

    makeObservable(this)

    fileLog.info('EditingStore initialized')
  }

  // ====================================
  // INITIALIZATION
  // ====================================

  init(): void {
    fileLog.info('EditingStore init called')
    // No reactions needed yet
  }

  reset(): void {
    if (this.currentSession) {
      fileLog.warn('Resetting EditingStore with active session', {
        cellId: this.currentSession.cellId,
      })
      this.cancelEdit('navigation')
    }

    this.currentSession = null
    this.sessionReady = false
    this.isCancelling = false
    this.editingVersion = 0
  }

  dispose(): void {
    if (this.currentSession) {
      fileLog.warn('Disposing EditingStore with active session', {
        cellId: this.currentSession.cellId,
      })
      this.cancelEdit('navigation')
    }

    this.disposers.dispose()
    fileLog.info('EditingStore disposed')
  }

  // ====================================
  // DEPENDENCY INJECTION
  // ====================================

  /**
   * Set TanStack DB collection for mutations
   * Must be called before editing
   */
  setCollection(collection: any): void {
    this.collection = collection
    fileLog.debug('Collection set', { hasCollection: !!collection })
  }

  // ====================================
  // EDIT LIFECYCLE ACTIONS
  // ====================================

  /**
   * Start edit session
   *
   * CRITICAL: Always uses consistent value lookup (column.field + row.data[field])
   * Fixes Issue #7: Keyboard Enter and Click now get same value
   *
   * @param cellId Cell ID (e.g., "row123:columnA")
   * @param column Column metadata (with field, fieldType, etc.)
   */
  @action
  startEdit(cellId: string, column: any): void {
    const [rowId, columnId] = cellId.split(':')

    // CONSISTENT VALUE LOOKUP (fixes keyboard vs click desync)
    // Always use column.field + row.data[field]
    const { row, rowData, currentValue, dataField } = untracked(() => {
      const processedRows = this.tableCoreStore.processedRows || []
      const foundRow = processedRows.find((r: any) => r.id === rowId)
      const field = column.field || columnId
      const data = foundRow?.data || foundRow
      const value = data ? data[field] : ''
      return { row: foundRow, rowData: data, currentValue: value, dataField: field }
    })

    fileLog.info('Starting edit session', {
      cellId,
      rowId,
      columnId,
      dataField,
      currentValue,
      valueType: typeof currentValue,
      valueSource: 'TableCore (fresh)',
      fieldType: column.fieldType?.id,
      rowDataFields: rowData ? Object.keys(rowData).slice(0, 20) : [],
      hasDataField: rowData ? dataField in rowData : false,
    })

    // Create session
    this.currentSession = {
      cellId,
      column,
      originalValue: currentValue,
      pendingValue: currentValue,
      validation: null,
      startTime: Date.now(),
    }

    // Mark session ready (fixes Issue #7: commit-before-ready race)
    this.sessionReady = true

    // Increment version for change detection
    this.editingVersion++

    fileLog.info('Edit session started', { cellId, editingVersion: this.editingVersion })
  }

  /**
   * Update pending value
   * Called on every keystroke as user types
   *
   * @param value New value from editor
   */
  @action
  updatePendingValue(value: any): void {
    if (!this.currentSession) {
      fileLog.warn('updatePendingValue called but no active session')
      return
    }

    fileLog.debug('Updating pending value', {
      cellId: this.currentSession.cellId,
      oldValue: this.currentSession.pendingValue,
      newValue: value,
      valueType: typeof value,
    })

    this.currentSession.pendingValue = value

    // Clear validation on value change
    if (this.currentSession.validation) {
      this.currentSession.validation = null
    }

    // Increment version
    this.editingVersion++
  }

  /**
   * Commit edit (save to database)
   *
   * Fixes Issue #7: Session ready check prevents commit-before-start race
   *
   * @param reason Why commit is happening
   * @param explicitValue Optional explicit value (overrides pendingValue)
   */
  @action
  async commitEdit(reason: CommitReason, explicitValue?: any): Promise<void> {
    // SESSION READY CHECK (fixes Issue #7)
    if (!this.sessionReady) {
      fileLog.warn('Commit called before session ready, deferring...', { reason })
      // Defer until next tick
      setTimeout(() => this.commitEdit(reason, explicitValue), 0)
      return
    }

    if (!this.currentSession) {
      fileLog.warn('commit() called but no active session', { reason })
      return
    }

    // Prevent commit during cancellation
    if (this.isCancelling) {
      fileLog.warn('commit() blocked - edit operation is being cancelled', { reason })
      return
    }

    // Use explicit value if provided, otherwise pendingValue
    const finalValue =
      explicitValue !== undefined ? explicitValue : this.currentSession.pendingValue

    const { cellId, originalValue, pendingValue, column } = this.currentSession

    fileLog.info('Committing edit', {
      cellId,
      reason,
      originalValue,
      pendingValue,
      explicitValue,
      finalValue,
      valueChanged: finalValue !== originalValue,
      duration: `${Date.now() - this.currentSession.startTime}ms`,
    })

    // Clear session BEFORE async save (prevents double-commit)
    const sessionToSave = this.currentSession
    this.currentSession = null
    this.sessionReady = false

    // Increment version
    this.editingVersion++

    // Save to database
    await this.saveToDatabase(sessionToSave, finalValue)

    fileLog.info('Edit committed successfully', { cellId, reason })
  }

  /**
   * Cancel edit (revert changes)
   *
   * @param reason Why cancel is happening
   */
  @action
  cancelEdit(reason: CancelReason): void {
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
      duration: `${Date.now() - this.currentSession.startTime}ms`,
    })

    // Set cancelling flag to block any pending saves
    this.isCancelling = true

    // Clear session
    this.currentSession = null
    this.sessionReady = false

    // Increment version
    this.editingVersion++

    fileLog.info('Edit cancelled successfully', { cellId, reason })

    // Clear cancelling flag after microtask
    queueMicrotask(() => {
      runInAction(() => {
        this.isCancelling = false
      })
    })
  }

  // ====================================
  // BLUR HANDLING
  // ====================================

  /**
   * Handle outside click
   *
   * Fixes Issue #6: Dropdown editors now close on outside click
   *
   * @param target Element that was clicked
   */
  @action
  handleOutsideClick(target: HTMLElement): void {
    if (!this.currentSession) return

    // Check if click is outside editing overlay
    const editingOverlay = document.querySelector('.editing-overlay')
    if (editingOverlay && !editingOverlay.contains(target)) {
      const blurPolicy = this.getBlurPolicy(this.currentSession.column)

      fileLog.info('Outside click detected', {
        cellId: this.currentSession.cellId,
        blurPolicy,
      })

      if (blurPolicy === 'commit') {
        this.commitEdit('outside-click')
      } else if (blurPolicy === 'cancel') {
        this.cancelEdit('outside-click')
      }
      // 'keep-open' = do nothing
    }
  }

  /**
   * Handle blur event (outside click, focus loss)
   *
   * @param reason Blur reason
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
      fieldType: column.fieldType?.id,
    })

    const blurPolicy = this.getBlurPolicy(column)

    fileLog.debug('Applying blur policy', {
      cellId,
      policy: blurPolicy,
      fieldType: column.fieldType?.id,
    })

    switch (blurPolicy) {
      case 'commit':
        // Wait for editor to flush any pending state (RAF or microtask)
        await new Promise((resolve) => requestAnimationFrame(resolve))
        await this.commitEdit('blur')
        break

      case 'cancel':
        this.cancelEdit(reason)
        break

      case 'keep-open':
        fileLog.debug('Keeping editor open (policy: keep-open)', { cellId })
        // Do nothing - editor stays open
        break

      default:
        fileLog.warn('Unknown blur policy, defaulting to commit', {
          policy: blurPolicy,
        })
        await this.commitEdit('blur')
    }
  }

  /**
   * Get blur policy for column
   *
   * @param column Column metadata
   * @returns Blur policy ('commit' | 'cancel' | 'keep-open')
   */
  private getBlurPolicy(column: any): BlurPolicy {
    const policy = column.fieldType?.interactionPolicy
    return policy?.blurPolicy || 'commit'
  }

  // ====================================
  // DATABASE PERSISTENCE
  // ====================================

  /**
   * Save edit to database using TanStack DB collection
   *
   * Implements optimistic updates with automatic rollback on error.
   *
   * @param session Edit session to save
   * @param finalValue Value to save
   */
  private async saveToDatabase(session: EditSession, finalValue: any): Promise<void> {
    const { cellId, originalValue } = session
    const [rowId, columnId] = cellId.split(':')

    // Get field name from column
    const field = session.column.field || columnId

    // Check if collection available
    if (!this.collection) {
      fileLog.error('Cannot save: TanStack DB collection not set', {
        cellId,
        rowId,
        field,
        hint: 'Call setCollection() before editing',
      })
      return
    }

    // Get current data to check for changes
    const currentData = this.collection.get(String(rowId))
    const currentValue = currentData?.[field]

    // OPTIMIZATION: Skip update if value hasn't changed
    if (currentValue === finalValue) {
      fileLog.info('Skipping save - value unchanged', {
        rowId,
        field,
        value: finalValue,
      })
      return
    }

    // Start performance timing
    const startTime = performance.now()

    // Optimistic update using TanStack DB collection
    const tx = this.collection.update(String(rowId), (draft: any) => {
      draft[field] = finalValue
      draft.updatedAt = new Date().toISOString()
    })

    const localDuration = performance.now() - startTime
    fileLog.info('Optimistic edit applied to collection', {
      rowId,
      field,
      finalValue,
      localDuration: `${localDuration.toFixed(1)}ms`,
      cellId,
      note: 'Table will react automatically via useVibeGridData hook',
    })

    // Monitor persistence status
    tx.isPersisted.promise
      .then(() => {
        const totalDuration = performance.now() - startTime
        fileLog.info('Edit persisted to server', {
          rowId,
          field,
          finalValue,
          localDuration: `${localDuration.toFixed(1)}ms`,
          totalDuration: `${totalDuration.toFixed(1)}ms`,
          networkDuration: `${(totalDuration - localDuration).toFixed(1)}ms`,
          note: 'Optimistic update confirmed',
        })
      })
      .catch((error: any) => {
        const errorMessage = error instanceof Error ? error.message : String(error)

        fileLog.error('Edit persistence failed - TanStack DB auto-rollback', {
          rowId,
          field,
          finalValue,
          error: errorMessage,
          note: 'Collection automatically rolled back, table will react via hook',
        })
      })
  }

  // ====================================
  // UTILITY METHODS
  // ====================================

  /**
   * Validate edit value
   *
   * @param value Value to validate
   */
  @action
  validateEdit(_value: any): void {
    if (!this.currentSession) {
      fileLog.warn('validateEdit called but no active session')
      return
    }

    // TODO: Implement field-specific validation
    // For now, always valid
    this.currentSession.validation = {
      isValid: true,
    }
  }

  /**
   * Get current edit session (for debugging/inspection)
   */
  getCurrentSession(): EditSession | null {
    return this.currentSession
  }
}
