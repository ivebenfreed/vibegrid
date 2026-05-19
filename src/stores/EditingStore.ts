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
// GH#2848 D2: route inline cell-edit commits through CommandBus.execute so
// `commandBus.undo()` actually reverts substrate edits (B22 spec verify path).
import { SubstrateUpdateCommand } from '@/systems/commands/dataforge/SubstrateUpdateCommand'
// GH#3119 P3: migrated from substrate-mutations to the new useEntityMutation
// surface. The mutation API is the global `mutationApi` singleton so the
// class-based EditingStore can call it without going through React hook
// machinery. The new API throws on error and returns `{success, record}` on
// success — these thin local adapters re-translate to the legacy
// `{success, data, error}` shape so the surrounding optimistic-write
// machinery (handleSubstrateWriteFailure, revertOptimisticCreate, etc.)
// keeps working unchanged. Per spec P3 task 5 ("Migrate EditingStore call
// sites from substrate-mutations.ts to useEntityMutation"). The legacy
// substrate-mutations.ts file remains in place for now; deletion happens
// in a follow-up phase after all consumers are migrated.
import { mutationApi } from '@/shared/data/hooks/useEntityMutation'

interface LegacyMutationResult {
  success: boolean
  data?: unknown
  error?: string
}

async function substrateCreate(
  entityName: string,
  data: Record<string, unknown>,
): Promise<LegacyMutationResult> {
  try {
    const result = await mutationApi.create({ entityName, data })
    return { success: result.success, data: result.record }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

async function substrateUpdate(
  entityName: string,
  recordId: string,
  patch: Record<string, unknown>,
): Promise<LegacyMutationResult> {
  try {
    const result = await mutationApi.update({ entityName, recordId, patch })
    return { success: result.success, data: result.record }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

async function substrateDelete(
  entityName: string,
  recordId: string,
): Promise<LegacyMutationResult> {
  try {
    const result = await mutationApi.delete({ entityName, recordId })
    return { success: result.success }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}
// GH#2806 P5: optimistic write infrastructure
import { createDeferred, type Deferred } from '@/shared/lib/deferred'
import { mergeMutations, NO_OP, type Mutation } from './mutation-merge'
import { toast } from 'sonner'
import type { SlotRegistry } from '../slots/SlotRegistry'
import type { TableCoreStore } from './TableCoreStore'
import type { ViewportStore } from './ViewportStore'
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

/**
 * GH#2806 P5: SubstrateTransaction returned from commitEdit / commitCreate /
 * commitDelete on the substrate write path. Mirrors a subset of the TanStack
 * DB Transaction shape so callers can `await tx.isPersisted.promise`.
 */
export type SubstrateTransactionState = 'pending' | 'persisting' | 'completed' | 'failed'

export interface SubstrateTransaction {
  state: SubstrateTransactionState
  /** Resolves with the transaction once persisted, rejects on failure. */
  isPersisted: Deferred<SubstrateTransaction>
  /** The mutation kind issued. */
  mutationKind: 'create' | 'update' | 'delete'
  /** The row id (for update/delete) or temp id (for create). */
  rowId: string
}

/**
 * GH#2806 P5: in-flight optimistic write entry. Keyed by `${rowId}:${field}`
 * for updates, `${rowId}` for create/delete (per spec line 113).
 */
interface InFlightEntry {
  preEditValue: unknown
  oRpcPromise: Promise<unknown>
  optimisticVersion: number
  mutationKind: 'create' | 'update' | 'delete'
  rowId: string
  /** Set only for `update` mutations. */
  field?: string
  /** The transaction handle; resolves when oRPC settles. */
  transaction: SubstrateTransaction
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

  /**
   * GH#2806 P5: in-flight optimistic writes. Keyed per spec line 113:
   *   - update: `${rowId}:${field}`
   *   - create / delete: `${rowId}`
   *
   * Reads through a getter so the queryDelta dedup module can read a stable
   * snapshot via `getInFlight()` without touching the private field.
   */
  inFlight: Map<string, InFlightEntry> = new Map()

  /** Monotonic counter for stamping optimisticVersion on rows. */
  private optimisticVersionCounter: number = 0

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
  private viewportStore: ViewportStore | null = null // GH#2806 P5: optimistic create/delete needs serverTotalRows
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

  /**
   * GH#2806 P5: Optional ViewportStore for substrate optimistic create/delete
   * (those bump `serverTotalRows` so the body container resizes). Cell-edit
   * optimistic writes don't need it.
   */
  setViewportStore(viewportStore: ViewportStore): void {
    this.viewportStore = viewportStore
    fileLog.debug('ViewportStore set', { hasViewportStore: !!viewportStore })
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
      const slotCtx = {
        viewMode: 'table' as const,
        entityType: this.tableCoreStore.entityType,
        organizationId: this.visualStateStore.orgId,
      }
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
        organizationId: this.visualStateStore.orgId,
      })
      return renderer?.interactionPolicy?.blurPolicy || 'commit'
    }
    return 'commit'
  }

  // ====================================
  // SUBSTRATE OPTIMISTIC WRITES (GH#2806 P5)
  // ====================================

  /**
   * GH#2806 P5: emit per-hop instrumentation for a substrate write.
   * Gated behind `?debug=vibegrid` so production builds don't spam console.
   * The OTEL span emission is best-effort — wired via the existing
   * observability stack (`telemetry-bridge.ts`).
   */
  private debugVibegridFlag(): boolean {
    if (typeof window === 'undefined') return false
    try {
      return new URLSearchParams(window.location.search).get('debug') === 'vibegrid'
    } catch {
      return false
    }
  }

  private emitSubstrateWriteInstrumentation(
    mutationKind: 'create' | 'update' | 'delete',
    rowId: string,
    timings: {
      commitStart: number
      optimisticApplied: number
      oRpcSend: number
      oRpcRecv: number
      queryDeltaArrive?: number
      setSparseRowsComplete?: number
    },
  ): void {
    if (!this.debugVibegridFlag()) return
    const payload = {
      mutationKind,
      rowId,
      ...timings,
      // Per-hop deltas for at-a-glance reading.
      hop_optimistic_ms: +(timings.optimisticApplied - timings.commitStart).toFixed(2),
      hop_oRpc_ms: +(timings.oRpcRecv - timings.oRpcSend).toFixed(2),
    }
    // eslint-disable-next-line no-console
    console.debug('substrate.write', payload)
    fileLog.debug('substrate.write per-hop', payload)
  }

  /**
   * GH#2806 P5: optimistic substrate UPDATE. Mutates `tableCoreStore` in
   * place, issues the oRPC call in background, reverts on failure.
   *
   * Mutation merge: if a same-cell write is already in flight, the new
   * mutation is merged with the existing one and chained via .then() so
   * order is preserved. The merged shape is what gets issued — never two
   * parallel oRPC calls for the same (row, field).
   *
   * Returns a SubstrateTransaction whose `isPersisted` resolves on success
   * and rejects on failure.
   */
  commitSubstrateUpdate(rowId: string, field: string, newValue: unknown): SubstrateTransaction {
    const commitStart = performance.now()
    const entityType = this.tableCoreStore.entityType
    const key = `${rowId}:${field}`
    const optimisticVersion = ++this.optimisticVersionCounter

    // Build the SubstrateTransaction we'll return synchronously.
    const isPersisted = createDeferred<SubstrateTransaction>()
    const transaction: SubstrateTransaction = {
      state: 'pending',
      isPersisted,
      mutationKind: 'update',
      rowId,
    }

    // Mutation merge: if a same-cell write is already in flight, merge and
    // chain. The merged shape replaces the existing entry; the chained
    // .then() issues exactly one oRPC for the merged result.
    const existing = this.inFlight.get(key)
    let preEditValue: unknown
    let mergedChanges: Record<string, unknown> = { [field]: newValue }
    let preExistingChain: Promise<unknown> = Promise.resolve()

    if (existing) {
      const merged = mergeMutations(
        {
          kind: 'update',
          rowId,
          changes: { [field]: existing.preEditValue !== undefined ? existing.preEditValue : '' },
        } as Mutation, // placeholder — we only care about the chain ordering
        { kind: 'update', rowId, changes: mergedChanges } as Mutation,
      )
      if (merged === NO_OP) {
        // Same-field same-value — drop the duplicate. The in-flight
        // promise is the source of truth.
        existing.transaction.isPersisted.promise.then(
          (v) => isPersisted.resolve(v),
          (e) => isPersisted.reject(e),
        )
        return existing.transaction
      }
      // Re-use the existing pre-edit value so a chain of merges can revert
      // back to the ORIGINAL ground truth, not an intermediate optimistic value.
      preEditValue = existing.preEditValue
      preExistingChain = existing.oRpcPromise
      if (merged && merged.kind === 'update') {
        mergedChanges = merged.changes
      }
    }

    // Apply optimistic local write inside runInAction.
    let appliedPreEditValue: unknown = preEditValue
    runInAction(() => {
      const results = this.tableCoreStore.patchRowOptimistic(
        Object.entries(mergedChanges).map(([f, v]) => ({ rowId, field: f, newValue: v })),
        optimisticVersion,
      )
      // First-edit case (not previously in-flight): capture preEditValue from
      // tableCoreStore. Subsequent merges keep the original value.
      if (!existing) {
        const r = results.find((r) => r.field === field)
        appliedPreEditValue = r?.preEditValue
      }
    })
    const optimisticApplied = performance.now()

    // Chain onto any existing in-flight promise (rapid re-edit serializes).
    const oRpcPromise = preExistingChain
      .catch(() => undefined) // tolerate prior failure; we still issue the merged shape
      .then(async () => {
        const oRpcSend = performance.now()
        runInAction(() => {
          transaction.state = 'persisting'
        })
        try {
          const result = await substrateUpdate(entityType, rowId, mergedChanges)
          const oRpcRecv = performance.now()
          this.emitSubstrateWriteInstrumentation('update', rowId, {
            commitStart,
            optimisticApplied,
            oRpcSend,
            oRpcRecv,
          })
          if (!result.success) {
            this.handleSubstrateWriteFailure(
              transaction,
              rowId,
              field,
              appliedPreEditValue,
              key,
              new Error(result.error || 'Update failed'),
            )
            return
          }
          // Success — leave the value in place; queryDelta dedup will
          // suppress the redundant server echo.
          runInAction(() => {
            transaction.state = 'completed'
          })
          this.inFlight.delete(key)
          isPersisted.resolve(transaction)
        } catch (err) {
          this.handleSubstrateWriteFailure(
            transaction,
            rowId,
            field,
            appliedPreEditValue,
            key,
            err,
          )
        }
      })

    // Stash in-flight entry (replaces prior merged entry).
    this.inFlight.set(key, {
      preEditValue: appliedPreEditValue,
      oRpcPromise,
      optimisticVersion,
      mutationKind: 'update',
      rowId,
      field,
      transaction,
    })

    return transaction
  }

  /**
   * GH#2806 P5: revert + toast helper used by all three substrate failure
   * paths (update / create / delete).
   */
  private handleSubstrateWriteFailure(
    transaction: SubstrateTransaction,
    rowId: string,
    field: string | undefined,
    preEditValue: unknown,
    inFlightKey: string,
    err: unknown,
  ): void {
    const message = err instanceof Error ? err.message : String(err)
    fileLog.error('Substrate write failed — reverting optimistic write', {
      rowId,
      field,
      mutationKind: transaction.mutationKind,
      error: message,
    })
    runInAction(() => {
      if (transaction.mutationKind === 'update' && field) {
        this.tableCoreStore.revertRowOptimistic([{ rowId, field, preEditValue }])
      }
      // create/delete revert paths happen in their own commitX wrappers
      transaction.state = 'failed'
    })
    this.inFlight.delete(inFlightKey)
    this.showSaveErrorToast(message)
    transaction.isPersisted.reject(err instanceof Error ? err : new Error(message))
  }

  /**
   * GH#2806 P5: surface a save-error toast.
   * Toast string is intentionally short — `Failed to save: <message>` per
   * spec line 110 step 2. Wrapped in try/catch so a toast failure never
   * blocks the revert.
   */
  private showSaveErrorToast(message: string): void {
    try {
      toast.error(`Failed to save: ${message}`)
    } catch {
      // best effort
    }
  }

  /**
   * GH#2806 P5: optimistic substrate CREATE. Inserts a row with a temporary
   * id (`optimistic-<uuid>`), issues the oRPC, swaps to the server-assigned
   * id on success, removes the row + reverts `serverTotalRows` on failure.
   */
  commitCreate(data: Record<string, unknown>): SubstrateTransaction {
    const commitStart = performance.now()
    const entityType = this.tableCoreStore.entityType
    const tempId = `optimistic-${Math.random().toString(36).slice(2, 11)}`
    const optimisticVersion = ++this.optimisticVersionCounter
    const isPersisted = createDeferred<SubstrateTransaction>()
    const transaction: SubstrateTransaction = {
      state: 'pending',
      isPersisted,
      mutationKind: 'create',
      rowId: tempId,
    }

    const previousServerTotalRows = this.viewportStore?.serverTotalRows ?? null

    runInAction(() => {
      this.tableCoreStore.insertRowOptimistic({
        id: tempId,
        data: { ...data, id: tempId },
        optimisticVersion,
      })
      if (this.viewportStore && previousServerTotalRows !== null) {
        this.viewportStore.setServerTotalRows(previousServerTotalRows + 1)
      }
    })
    const optimisticApplied = performance.now()

    const oRpcPromise = (async () => {
      const oRpcSend = performance.now()
      runInAction(() => {
        transaction.state = 'persisting'
      })
      try {
        const result = await substrateCreate(entityType, data)
        const oRpcRecv = performance.now()
        this.emitSubstrateWriteInstrumentation('create', tempId, {
          commitStart,
          optimisticApplied,
          oRpcSend,
          oRpcRecv,
        })
        if (!result.success) {
          this.revertOptimisticCreate(tempId, previousServerTotalRows)
          runInAction(() => {
            transaction.state = 'failed'
          })
          this.inFlight.delete(tempId)
          this.showSaveErrorToast(result.error || 'Create failed')
          isPersisted.reject(new Error(result.error || 'Create failed'))
          return
        }
        // Success — swap temp id with server-assigned id if returned.
        const serverRow = result.data as { id?: string } | undefined
        if (serverRow?.id) {
          runInAction(() => {
            this.tableCoreStore.swapOptimisticId(tempId, serverRow.id!)
          })
        }
        runInAction(() => {
          transaction.state = 'completed'
        })
        this.inFlight.delete(tempId)
        isPersisted.resolve(transaction)
      } catch (err) {
        this.revertOptimisticCreate(tempId, previousServerTotalRows)
        runInAction(() => {
          transaction.state = 'failed'
        })
        this.inFlight.delete(tempId)
        const message = err instanceof Error ? err.message : String(err)
        this.showSaveErrorToast(message)
        isPersisted.reject(err instanceof Error ? err : new Error(message))
      }
    })()

    this.inFlight.set(tempId, {
      preEditValue: undefined,
      oRpcPromise,
      optimisticVersion,
      mutationKind: 'create',
      rowId: tempId,
      transaction,
    })

    return transaction
  }

  private revertOptimisticCreate(tempId: string, previousServerTotalRows: number | null): void {
    runInAction(() => {
      this.tableCoreStore.removeRowOptimistic(tempId)
      if (this.viewportStore && previousServerTotalRows !== null) {
        this.viewportStore.setServerTotalRows(previousServerTotalRows)
      }
    })
  }

  /**
   * GH#2806 P5: optimistic substrate DELETE. Removes the row from rawRows,
   * decrements `serverTotalRows`, issues the oRPC, restores the row +
   * increments `serverTotalRows` on failure.
   */
  commitDelete(rowId: string): SubstrateTransaction {
    const commitStart = performance.now()
    const entityType = this.tableCoreStore.entityType
    const isPersisted = createDeferred<SubstrateTransaction>()
    const transaction: SubstrateTransaction = {
      state: 'pending',
      isPersisted,
      mutationKind: 'delete',
      rowId,
    }

    const previousServerTotalRows = this.viewportStore?.serverTotalRows ?? null

    let removedRow: any
    let removedIndex = -1
    runInAction(() => {
      const result = this.tableCoreStore.removeRowOptimistic(rowId)
      removedRow = result.row
      removedIndex = result.index
      if (this.viewportStore && previousServerTotalRows !== null) {
        this.viewportStore.setServerTotalRows(Math.max(0, previousServerTotalRows - 1))
      }
    })
    const optimisticApplied = performance.now()

    const oRpcPromise = (async () => {
      const oRpcSend = performance.now()
      runInAction(() => {
        transaction.state = 'persisting'
      })
      try {
        const result = await substrateDelete(entityType, rowId)
        const oRpcRecv = performance.now()
        this.emitSubstrateWriteInstrumentation('delete', rowId, {
          commitStart,
          optimisticApplied,
          oRpcSend,
          oRpcRecv,
        })
        if (!result.success) {
          this.revertOptimisticDelete(removedRow, removedIndex, previousServerTotalRows)
          runInAction(() => {
            transaction.state = 'failed'
          })
          this.inFlight.delete(rowId)
          this.showSaveErrorToast(result.error || 'Delete failed')
          isPersisted.reject(new Error(result.error || 'Delete failed'))
          return
        }
        runInAction(() => {
          transaction.state = 'completed'
        })
        this.inFlight.delete(rowId)
        isPersisted.resolve(transaction)
      } catch (err) {
        this.revertOptimisticDelete(removedRow, removedIndex, previousServerTotalRows)
        runInAction(() => {
          transaction.state = 'failed'
        })
        this.inFlight.delete(rowId)
        const message = err instanceof Error ? err.message : String(err)
        this.showSaveErrorToast(message)
        isPersisted.reject(err instanceof Error ? err : new Error(message))
      }
    })()

    this.inFlight.set(rowId, {
      preEditValue: removedRow,
      oRpcPromise,
      optimisticVersion: ++this.optimisticVersionCounter,
      mutationKind: 'delete',
      rowId,
      transaction,
    })

    return transaction
  }

  private revertOptimisticDelete(
    removedRow: any,
    removedIndex: number,
    previousServerTotalRows: number | null,
  ): void {
    runInAction(() => {
      if (removedRow) {
        this.tableCoreStore.restoreRow(removedRow, removedIndex)
      }
      if (this.viewportStore && previousServerTotalRows !== null) {
        this.viewportStore.setServerTotalRows(previousServerTotalRows)
      }
    })
  }

  /** GH#2806 P5: read-only snapshot of the in-flight map for the dedup module. */
  getInFlight(): Map<string, InFlightEntry> {
    return this.inFlight
  }

  // ====================================
  // DATABASE PERSISTENCE
  // ====================================

  /**
   * Save edit to database via the substrate write path.
   *
   * GH#2806 P8: substrate is the unconditional write path for VibeGrid.
   * Rows live in the SharedWorker SQLite substrate; mutations go through
   * oRPC and the substrate reconciles via queryDelta events. The legacy
   * TanStack DB collection.update fallback has been removed.
   *
   * Optimistic updates are applied locally first via commitSubstrateUpdate,
   * which returns a SubstrateTransaction with isPersisted promise.
   *
   * @param session Edit session to save
   * @param finalValue Value to save
   */
  private async saveToDatabase(session: EditSession, finalValue: any): Promise<void> {
    const { cellId, originalValue } = session
    const [rowId, columnId] = cellId.split(':')

    // Get field name from column
    const field = session.column.field || columnId

    // OPTIMIZATION: skip save if value hasn't changed. Use the session's
    // originalValue (rows live in the substrate, not in a local collection).
    if (originalValue === finalValue) {
      fileLog.info('Skipping save - value unchanged (substrate)', {
        rowId,
        field,
        value: finalValue,
      })
      return
    }

    // GH#2806 P5: optimistic update path. Apply locally first, then issue
    // oRPC; revert on failure.
    //
    // GH#2848 D2: when a CommandBus is wired, route through
    // `commandBus.execute(new SubstrateUpdateCommand(), ...)` so the
    // edit is added to undo history. Without this, `commandBus.undo()`
    // is a permanent no-op for cell edits (B22 spec violation). The
    // SubstrateUpdateCommand.execute() in turn calls
    // `commitSubstrateUpdate`, so the optimistic / oRPC / merge / revert
    // semantics are unchanged.
    if (this.commandBus) {
      const entityName = this.tableCoreStore.entityType ?? 'Entity'
      const command = new SubstrateUpdateCommand()
      // Fire-and-forget at the call site; errors surface via toast + log.
      // CommandBus.execute pushes to history only on success, which is
      // the correct policy (failed edits should not consume undo slots).
      const writer = {
        commitSubstrateUpdate: (
          rowId: string,
          field: string,
          newValue: unknown,
        ) => this.commitSubstrateUpdate(rowId, field, newValue),
      }
      this.commandBus
        .execute(command, {
          editingStore: writer,
          entityName,
          recordId: String(rowId),
          field,
          newValue: finalValue,
          previousValue: originalValue,
        })
        .catch(() => {
          /* legacy call site — failure surfaced via toast + log */
        })
      return
    }

    // Fallback when no CommandBus is wired (tests, headless contexts).
    // Returns a SubstrateTransaction the caller can await via
    // `tx.isPersisted.promise` (legacy commitEdit return type doesn't
    // expose this; callers needing it call `commitSubstrateUpdate`
    // directly). Attach .catch so legacy callers don't trip Node's
    // unhandled-rejection warning.
    const tx = this.commitSubstrateUpdate(String(rowId), field, finalValue)
    tx.isPersisted.promise.catch(() => {
      /* legacy call site — failure is surfaced via toast + log */
    })
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
      const slotCtx = {
        viewMode: 'table' as const,
        entityType: this.tableCoreStore.entityType,
        organizationId: this.visualStateStore.orgId,
      }
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
