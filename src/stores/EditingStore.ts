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
import type { Collection } from '@tanstack/db'
import type { IStore } from '@/app/stores/types'
import { DisposerManager } from '@/app/stores/utils/disposer'
import { getLogger } from '@/shared/lib/logging'
import { isModalTextType } from '../constants/field-type-categories'
import type { CommandBus } from '@/systems/commands/CommandBus'
import { UpdateEntityRecordCommand } from '@/systems/commands/dataforge/UpdateEntityRecordCommand'
// GH#2812 A1: substrate write path. In bounded substrate mode the TanStack
// DB collection is empty; mutations must go through oRPC and let the
// SharedWorker reconcile via queryDelta events.
import { shouldUseSubstrateWrite, substrateUpdate } from '@/shared/data/query/substrate-mutations'
import type { SlotRegistry } from '../slots/SlotRegistry'
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
  errors: string[]
}

export type CommitReason = 'enter' | 'tab' | 'blur' | 'outside-click' | 'user-action'
export type CancelReason =
  | 'escape'
  | 'outside-click'
  | 'outside-pointer'
  | 'focus-loss'
  | 'navigation'
  | 'user-action'
  | 'scroll'
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
   * Returns true when the active editor is modal/text-like and should keep
   * multiline key handling inside the editor component.
   */
  get isActiveModalTextEditor(): boolean {
    if (!this.currentSession) return false

    const type = (this.currentSession.column.cellType || this.currentSession.column.type || '').toLowerCase()

    return isModalTextType(type)
  }

  /**
   * Current validation errors (empty array if valid or no validation yet)
   */
  @computed
  get validationErrors(): string[] {
    return this.currentSession?.validation?.errors ?? []
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
  // biome-ignore lint/correctness/noUnusedPrivateClassMembers: Used by Phase 2+ CellRenderer context
  private visualStateStore: VisualStateStore
  private collection: Collection<any, any, any, any, any> | null = null // TanStack DB collection for mutations
  private commandBus: CommandBus | null = null // CommandBus for history/undo tracking
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
  setCollection(collection: Collection<any, any, any, any, any>): void {
    this.collection = collection
    fileLog.debug('Collection set', { hasCollection: !!collection })
  }

  // D2: SlotRegistry for validation and interaction policy resolution
  private slotRegistry: SlotRegistry | null = null

  /**
   * Set SlotRegistry for D2 pipeline - resolves CellRenderer for validation and blur policy
   */
  setSlotRegistry(registry: SlotRegistry): void {
    this.slotRegistry = registry
    fileLog.debug('SlotRegistry set', { hasRegistry: !!registry })
  }

  /**
   * Set CommandBus for history/undo tracking
   * When set, cell edits are wrapped in UpdateEntityRecordCommand
   */
  setCommandBus(commandBus: CommandBus): void {
    this.commandBus = commandBus
    fileLog.debug('CommandBus set', { hasCommandBus: !!commandBus })
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
    const {
      row: _row,
      rowData,
      currentValue,
      dataField,
    } = untracked(() => {
      const processedRows = this.tableCoreStore.processedRows || []
      // GH#2812 sparse guard: find visits holes as undefined per ECMA-262 §22.1.3.9.
      const foundRow = processedRows.find((r: any) => r && r.id === rowId)
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
      cellType: column.cellType,
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
   * @param retryCount Internal retry counter to prevent infinite loops
   */
  @action
  async commitEdit(reason: CommitReason, explicitValue?: any, retryCount: number = 0): Promise<void> {
    // SESSION READY CHECK (fixes Issue #7)
    if (!this.sessionReady) {
      // If there's no session, don't defer - just log and return
      if (!this.currentSession) {
        fileLog.warn('commit() called but no active session', { reason })
        return
      }

      // Max 3 retries to prevent infinite loops
      if (retryCount >= 3) {
        fileLog.error('commit() retry limit exceeded - session never became ready', {
          reason,
          retryCount,
        })
        return
      }

      fileLog.warn('Commit called before session ready, deferring...', {
        reason,
        retryCount,
      })
      // Defer until next tick with incremented retry count
      setTimeout(() => this.commitEdit(reason, explicitValue, retryCount + 1), 0)
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
    const finalValue = explicitValue !== undefined ? explicitValue : this.currentSession.pendingValue

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

    // VALIDATION: Validate using SlotRegistry CellRenderer (D2)
    const valueToSave = finalValue
    if (this.slotRegistry) {
      const slotCtx = { viewMode: 'table' as const, entityType: this.tableCoreStore.entityType }
      const renderer = this.slotRegistry.resolve(column, slotCtx)
      if (renderer?.validate) {
        const validationError = renderer.validate(finalValue, column, slotCtx)
        if (validationError) {
          fileLog.warn('Validation failed - keeping editor open', {
            cellId,
            error: validationError,
            value: finalValue,
          })

          // Update session with validation errors
          this.currentSession.validation = {
            isValid: false,
            errors: [validationError],
          }

          // Increment version to trigger UI update
          this.editingVersion++

          // Don't clear session or save - keep editor open for user to fix
          return
        }
      }
    }

    // Clear session BEFORE async save (prevents double-commit)
    const sessionToSave = this.currentSession
    this.currentSession = null
    this.sessionReady = false

    // Increment version
    this.editingVersion++

    // Save to database
    await this.saveToDatabase(sessionToSave, valueToSave)

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

    const blurPolicy = this.getBlurPolicy(this.currentSession.column)
    const activeEditingPortals = this.getActiveEditingPortals()

    // If the click is within any active editing portal, ignore it.
    if (this.isTargetInActiveEditingPortal(target)) {
      return
    }

    fileLog.info('Outside click detected', {
      cellId: this.currentSession.cellId,
      blurPolicy,
      hasActivePortal: activeEditingPortals.length > 0,
      targetTagName: target.tagName,
    })

    if (blurPolicy === 'commit') {
      this.commitEdit('outside-click')
    } else if (blurPolicy === 'cancel') {
      this.cancelEdit('outside-click')
    }
    // 'keep-open' = do nothing
  }

  /**
   * Find the active portal node for the current editing session.
   *
   * The active portal uses `.vibegridx-editing-portal` and stores the active cell
   * in `data-cell-id`, which makes matching deterministic in multi-grid pages.
   */
  /**
   * Return all active editing portals for the current cell.
   *
   * Long text/rich text editors can render a modal portal in addition to
   * the regular EditingOverlay portal.
   */
  private getActiveEditingPortals(): Element[] {
    if (!this.currentSession) return []

    const cellId = this.currentSession.cellId
    const matchingPortals = document.querySelectorAll(`.vibegridx-editing-portal[data-cell-id="${cellId}"]`)

    if (matchingPortals.length > 0) {
      return Array.from(matchingPortals)
    }

    const legacyPortal = document.querySelector('.editing-overlay')
    return legacyPortal ? [legacyPortal] : []
  }

  /**
   * Returns true when a pointer/click target is inside the active editor portal.
   */
  isTargetInActiveEditingPortal(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) {
      return false
    }

    return this.getActiveEditingPortals().some((portal) => portal.contains(target))
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
      cellType: column.cellType,
    })

    const blurPolicy = this.getBlurPolicy(column)

    fileLog.debug('Applying blur policy', {
      cellId,
      policy: blurPolicy,
      cellType: column.cellType,
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
    if (this.slotRegistry) {
      const renderer = this.slotRegistry.resolve(column, {
        viewMode: 'table',
        entityType: this.tableCoreStore.entityType,
      })
      return renderer?.interactionPolicy?.blurPolicy || 'commit'
    }
    return 'commit'
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

    // GH#2812 A1: substrate-owned entities (RFI, Project under
    // ?ff=substrate) keep rows in the SharedWorker SQLite substrate, NOT
    // in the TanStack DB collection. The collection has zero entries, so
    // collection.get/update would return undefined / throw "key not found".
    // Route the mutation through oRPC; the substrate observes the change
    // via server-emitted DataForge events and applies it through
    // queryDelta → setSparseRows().
    //
    // NOTE: undo/redo for substrate writes is NOT integrated yet — the
    // CommandBus path below operates on the TanStack DB collection.
    // Substrate-write undo/redo is a GH#2812 follow-up.
    const entityType = this.tableCoreStore.entityType
    if (shouldUseSubstrateWrite(entityType)) {
      // OPTIMIZATION: skip save if value hasn't changed. Use the session's
      // originalValue since the collection is empty in substrate mode.
      if (originalValue === finalValue) {
        fileLog.info('Skipping save - value unchanged (substrate)', {
          rowId,
          field,
          value: finalValue,
        })
        return
      }

      const startTime = performance.now()
      try {
        const result = await substrateUpdate(entityType, String(rowId), { [field]: finalValue })
        const duration = performance.now() - startTime
        if (!result.success) {
          fileLog.error('Substrate update failed', {
            rowId,
            field,
            cellId,
            error: result.error,
            duration: `${duration.toFixed(1)}ms`,
          })
          return
        }
        fileLog.info('Edit saved via substrate', {
          rowId,
          field,
          finalValue,
          cellId,
          duration: `${duration.toFixed(1)}ms`,
          note: 'Substrate will reconcile via queryDelta + setSparseRows',
        })
      } catch (err) {
        fileLog.error('Substrate update threw', {
          rowId,
          field,
          cellId,
          error: err instanceof Error ? err.message : String(err),
        })
      }
      return
    }

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

    // Route through CommandBus if available (enables undo/redo tracking)
    if (this.commandBus) {
      try {
        const command = new UpdateEntityRecordCommand()
        const result = await this.commandBus.execute(command, {
          collection: this.collection,
          entityName: this.tableCoreStore.entityType,
          recordId: String(rowId),
          field,
          newValue: finalValue,
          previousValue: originalValue,
        })

        if (result.success) {
          fileLog.info('Edit saved via CommandBus', {
            rowId,
            field,
            finalValue,
            cellId,
            note: 'Command tracked in history for undo/redo',
          })
          return
        }
        fileLog.error('CommandBus execute failed, falling back to direct update', {
          rowId,
          field,
          error: result.error?.message,
        })
      } catch (err) {
        fileLog.error('CommandBus execute threw, falling back to direct update', {
          rowId,
          field,
          error: err instanceof Error ? err.message : String(err),
        })
      }
      // Fall through to direct collection update below
    }

    // Fallback: Direct collection update (no undo tracking)
    const startTime = performance.now()
    try {
      const tx = this.collection.update(String(rowId), (draft: any) => {
        draft[field] = finalValue
        draft.updated_at = new Date().toISOString()
      })

      const localDuration = performance.now() - startTime
      fileLog.info('Optimistic edit applied to collection (no CommandBus)', {
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
    } catch (_err) {}
  }

  // ====================================
  // UTILITY METHODS
  // ====================================

  /**
   * Validate edit value using field type validator
   * Can be used for real-time validation during typing
   *
   * @param value Value to validate (defaults to current pending value)
   */
  @action
  validateEdit(value?: any): void {
    if (!this.currentSession) {
      fileLog.warn('validateEdit called but no active session')
      return
    }

    const valueToValidate = value !== undefined ? value : this.currentSession.pendingValue
    const { column } = this.currentSession

    if (this.slotRegistry) {
      const slotCtx = { viewMode: 'table' as const, entityType: this.tableCoreStore.entityType }
      const renderer = this.slotRegistry.resolve(column, slotCtx)
      if (renderer?.validate) {
        const validationError = renderer.validate(valueToValidate, column, slotCtx)

        this.currentSession.validation = {
          isValid: !validationError,
          errors: validationError ? [validationError] : [],
        }

        // Increment version to trigger UI update if validation state changed
        this.editingVersion++
        return
      }
    }

    // No validator - always valid
    this.currentSession.validation = {
      isValid: true,
      errors: [],
    }
  }

  /**
   * Get current edit session (for debugging/inspection)
   */
  getCurrentSession(): EditSession | null {
    return this.currentSession
  }
}
