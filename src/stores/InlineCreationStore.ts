/**
 * InlineCreationStore - Ghost Row Inline Creation (MobX)
 *
 * GH#1658: Manages ghost row state for inline entity creation within groups.
 * Each expanded group can show a ghost row at its bottom for quick creation.
 *
 * States: ghost -> editing -> saving -> (ghost | error)
 * Only one ghost row can be in 'editing' state at a time.
 */

import { action, makeObservable, observable, ObservableMap, runInAction } from 'mobx'
import type { IStore } from '@/app/stores/types'
import { getLogger } from '@/shared/lib/logging'
import type { Column } from '../types'

const logger = getLogger(['vibegrid', 'stores', 'InlineCreationStore'])

// ====================================
// CONSTANTS
// ====================================

const INLINE_EDITABLE_TYPES = new Set([
  'text',
  'email',
  'url',
  'phone',
  'number',
  'integer',
  'date',
  'datetime',
  'boolean',
  'select',
  'single-select',
  'tags',
])

const ESCALATION_TYPES = new Set([
  'relationship',
  'belongs-to',
  'has-many',
  'many-to-many',
  'textarea',
  'rich-text',
  'long-text',
])

// ====================================
// TYPES
// ====================================

export interface GhostRowState {
  groupId: string
  status: 'ghost' | 'editing' | 'saving' | 'error'
  fieldValues: Record<string, unknown>
  inheritedFields: Record<string, unknown>
  validationErrors: Record<string, string>
  positionHint?: 'above' | 'below'
  insertRelativeToRowId?: string
  errorMessage?: string
}

// ====================================
// STORE
// ====================================

export class InlineCreationStore implements IStore {
  @observable ghostRows: ObservableMap<string, GhostRowState> = new ObservableMap()

  constructor() {
    makeObservable(this)
    logger.debug('InlineCreationStore created')
  }

  // ====================================
  // ACTIONS
  // ====================================

  /**
   * Open a ghost row for editing. Only one ghost row can be editing at a time.
   * If another ghost is already editing, cancel it first.
   */
  @action
  openGhost(groupId: string, inheritedFields: Record<string, unknown>): void {
    // Cancel any other ghost that is currently editing
    for (const [id, state] of this.ghostRows) {
      if (id !== groupId && state.status === 'editing') {
        this.cancelGhost(id)
      }
    }

    const existing = this.ghostRows.get(groupId)
    this.ghostRows.set(groupId, {
      groupId,
      status: 'editing',
      fieldValues: existing?.fieldValues ?? {},
      inheritedFields,
      validationErrors: {},
      errorMessage: undefined,
    })

    logger.debug('Ghost row opened for editing', { groupId })
  }

  /**
   * Cancel editing a ghost row. Resets to ghost state.
   */
  @action
  cancelGhost(groupId: string): void {
    const existing = this.ghostRows.get(groupId)
    if (!existing) return

    this.ghostRows.set(groupId, {
      groupId,
      status: 'ghost',
      fieldValues: {},
      inheritedFields: existing.inheritedFields,
      validationErrors: {},
      errorMessage: undefined,
    })

    logger.debug('Ghost row cancelled', { groupId })
  }

  /**
   * Set a field value on a ghost row draft.
   */
  @action
  setFieldValue(groupId: string, fieldId: string, value: unknown): void {
    const existing = this.ghostRows.get(groupId)
    if (!existing) return

    this.ghostRows.set(groupId, {
      ...existing,
      fieldValues: {
        ...existing.fieldValues,
        ...{ [fieldId]: value },
      },
    })
  }

  /**
   * Get the ghost row state for a group, or undefined if none.
   */
  getGhostState(groupId: string): GhostRowState | undefined {
    return this.ghostRows.get(groupId)
  }

  /**
   * Compute which columns should be shown inline for editing.
   * Filters to required columns not already in inheritedFieldKeys, with inline-editable types.
   */
  computeInlineFields(columns: Column[], inheritedFieldKeys: string[]): Column[] {
    const inheritedSet = new Set(inheritedFieldKeys)
    return columns.filter((col) => {
      const colId = col.id ?? col.field
      if (!colId) return false
      if (inheritedSet.has(colId)) return false
      if (!col.required) return false
      const cellType = col.cellType ?? col.type ?? ''
      return INLINE_EDITABLE_TYPES.has(cellType)
    })
  }

  /**
   * Returns true if the ghost row needs escalation to a full form.
   * Escalation happens when there are >3 required non-inherited inline fields,
   * or any required non-inherited field has an escalation type.
   */
  needsEscalation(columns: Column[], inheritedFieldKeys: string[]): boolean {
    const inheritedSet = new Set(inheritedFieldKeys)
    const requiredNonInherited = columns.filter((col) => {
      const colId = col.id ?? col.field
      if (!colId) return false
      if (inheritedSet.has(colId)) return false
      return col.required
    })

    // Check if any required non-inherited field has an escalation type
    const hasEscalationType = requiredNonInherited.some((col) => {
      const cellType = col.cellType ?? col.type ?? ''
      return ESCALATION_TYPES.has(cellType)
    })

    if (hasEscalationType) return true

    // Check if there are more than 3 inline-editable required fields
    const inlineEditableCount = requiredNonInherited.filter((col) => {
      const cellType = col.cellType ?? col.type ?? ''
      return INLINE_EDITABLE_TYPES.has(cellType)
    }).length

    return inlineEditableCount > 3
  }

  /**
   * Commit a ghost row: validate, merge, save, and reset.
   */
  @action
  async commitGhost(
    groupId: string,
    columns: Column[],
    onInlineCreate?: (defaults: Record<string, unknown>) => Promise<string>,
  ): Promise<void> {
    const state = this.ghostRows.get(groupId)
    if (!state) return

    // Guard: don't allow double-submit while already saving
    if (state.status === 'saving') return

    // Step 1: Validate required non-inherited fields
    const inheritedKeys = new Set(Object.keys(state.inheritedFields))
    const validationErrors: Record<string, string> = {}

    for (const col of columns) {
      const colId = col.id ?? col.field
      if (!colId) continue
      if (inheritedKeys.has(colId)) continue
      if (!col.required) continue

      const cellType = col.cellType ?? col.type ?? ''
      if (!INLINE_EDITABLE_TYPES.has(cellType)) continue

      const value = state.fieldValues[colId]
      if (value === undefined || value === null || value === '') {
        validationErrors[colId] = 'Required'
      }
    }

    if (Object.keys(validationErrors).length > 0) {
      this.ghostRows.set(groupId, {
        ...state,
        validationErrors,
      })
      logger.debug('Ghost row validation failed', { groupId, validationErrors })
      return
    }

    // Step 2: Merge inherited + field values
    const payload: Record<string, unknown> = {
      ...state.inheritedFields,
      ...state.fieldValues,
    }

    // Step 3: Set saving status
    this.ghostRows.set(groupId, {
      ...state,
      status: 'saving',
      validationErrors: {},
      errorMessage: undefined,
    })

    // Step 4: Call onInlineCreate
    if (!onInlineCreate) {
      logger.warn('No onInlineCreate callback provided', { groupId })
      runInAction(() => {
        this.ghostRows.set(groupId, {
          ...state,
          status: 'error',
          errorMessage: 'No creation handler configured',
        })
      })
      return
    }

    try {
      await onInlineCreate(payload)

      // Step 5: Success - reset to ghost state
      runInAction(() => {
        this.ghostRows.set(groupId, {
          groupId,
          status: 'ghost',
          fieldValues: {},
          inheritedFields: state.inheritedFields,
          validationErrors: {},
          errorMessage: undefined,
        })
        logger.info('Ghost row committed successfully', { groupId })
      })
    } catch (error) {
      // Step 6: Failure - set error state (only if still in saving state; user may have cancelled)
      runInAction(() => {
        const currentState = this.ghostRows.get(groupId)
        if (currentState && currentState.status === 'saving') {
          this.ghostRows.set(groupId, {
            ...currentState,
            status: 'error',
            errorMessage: error instanceof Error ? error.message : 'Creation failed',
          })
        }
        logger.error('Ghost row commit failed', { groupId, error })
      })
    }
  }

  // ====================================
  // ISTORE IMPLEMENTATION
  // ====================================

  init(): void {
    logger.debug('InlineCreationStore initialized')
  }

  @action
  dispose(): void {
    this.ghostRows.clear()
    logger.debug('InlineCreationStore disposed')
  }
}
