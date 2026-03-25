/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { InlineCreationStore } from '../InlineCreationStore'
import type { Column } from '../../types'

function createStore(): InlineCreationStore {
  return new InlineCreationStore()
}

function makeColumn(overrides: Partial<Column> = {}): Column {
  return {
    id: 'field1',
    field: 'field1',
    name: 'Field 1',
    cellType: 'text',
    required: true,
    ...overrides,
  } as Column
}

describe('InlineCreationStore', () => {
  let store: InlineCreationStore

  beforeEach(() => {
    store = createStore()
  })

  // ====================================
  // LIFECYCLE
  // ====================================

  it('initializes with empty ghost rows', () => {
    expect(store.ghostRows.size).toBe(0)
  })

  it('disposes by clearing ghost rows', () => {
    store.openGhost('group1', {})
    expect(store.ghostRows.size).toBe(1)
    store.dispose()
    expect(store.ghostRows.size).toBe(0)
  })

  // ====================================
  // openGhost
  // ====================================

  it('opens a ghost row for editing', () => {
    store.openGhost('group1', { status: 'active' })

    const state = store.getGhostState('group1')
    expect(state).toBeDefined()
    expect(state?.status).toBe('editing')
    expect(state?.inheritedFields).toEqual({ status: 'active' })
    expect(state?.fieldValues).toEqual({})
    expect(state?.validationErrors).toEqual({})
  })

  it('cancels other editing ghost rows when opening a new one', () => {
    store.openGhost('group1', {})
    store.openGhost('group2', {})

    const state1 = store.getGhostState('group1')
    const state2 = store.getGhostState('group2')
    expect(state1?.status).toBe('ghost') // Cancelled
    expect(state2?.status).toBe('editing') // Active
  })

  it('preserves field values when reopening the same group', () => {
    store.openGhost('group1', {})
    store.setFieldValue('group1', 'name', 'Test')
    store.cancelGhost('group1')
    // Field values are cleared on cancel
    const state = store.getGhostState('group1')
    expect(state?.fieldValues).toEqual({})
  })

  // ====================================
  // cancelGhost
  // ====================================

  it('cancels a ghost row and resets to ghost state', () => {
    store.openGhost('group1', { status: 'active' })
    store.setFieldValue('group1', 'name', 'Test')
    store.cancelGhost('group1')

    const state = store.getGhostState('group1')
    expect(state?.status).toBe('ghost')
    expect(state?.fieldValues).toEqual({})
    expect(state?.validationErrors).toEqual({})
    expect(state?.inheritedFields).toEqual({ status: 'active' })
  })

  it('is a no-op when cancelling a non-existent group', () => {
    store.cancelGhost('nonexistent')
    expect(store.ghostRows.size).toBe(0)
  })

  // ====================================
  // setFieldValue
  // ====================================

  it('sets a field value on a ghost row', () => {
    store.openGhost('group1', {})
    store.setFieldValue('group1', 'name', 'Test Entity')

    const state = store.getGhostState('group1')
    expect(state?.fieldValues).toEqual({ name: 'Test Entity' })
  })

  it('is a no-op when setting a field value on a non-existent group', () => {
    store.setFieldValue('nonexistent', 'name', 'Test')
    expect(store.ghostRows.size).toBe(0)
  })

  // ====================================
  // computeInlineFields
  // ====================================

  it('returns required non-inherited columns with inline-editable types', () => {
    const columns = [
      makeColumn({ id: 'name', field: 'name', cellType: 'text', required: true }),
      makeColumn({ id: 'status', field: 'status', cellType: 'select', required: true }),
      makeColumn({ id: 'notes', field: 'notes', cellType: 'textarea', required: true }),
      makeColumn({ id: 'optional', field: 'optional', cellType: 'text', required: false }),
    ]

    const result = store.computeInlineFields(columns, ['status'])
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('name')
  })

  it('excludes non-required columns', () => {
    const columns = [makeColumn({ id: 'name', field: 'name', cellType: 'text', required: false })]

    const result = store.computeInlineFields(columns, [])
    expect(result).toHaveLength(0)
  })

  it('excludes non-inline-editable types like textarea', () => {
    const columns = [makeColumn({ id: 'notes', field: 'notes', cellType: 'textarea', required: true })]

    const result = store.computeInlineFields(columns, [])
    expect(result).toHaveLength(0)
  })

  // ====================================
  // needsEscalation
  // ====================================

  it('returns true when a required field has escalation type', () => {
    const columns = [
      makeColumn({ id: 'name', field: 'name', cellType: 'text', required: true }),
      makeColumn({ id: 'desc', field: 'desc', cellType: 'rich-text', required: true }),
    ]

    expect(store.needsEscalation(columns, [])).toBe(true)
  })

  it('returns true when more than 3 inline-editable required fields', () => {
    const columns = [
      makeColumn({ id: 'f1', field: 'f1', cellType: 'text', required: true }),
      makeColumn({ id: 'f2', field: 'f2', cellType: 'text', required: true }),
      makeColumn({ id: 'f3', field: 'f3', cellType: 'number', required: true }),
      makeColumn({ id: 'f4', field: 'f4', cellType: 'email', required: true }),
    ]

    expect(store.needsEscalation(columns, [])).toBe(true)
  })

  it('returns false when 3 or fewer inline-editable required fields', () => {
    const columns = [
      makeColumn({ id: 'f1', field: 'f1', cellType: 'text', required: true }),
      makeColumn({ id: 'f2', field: 'f2', cellType: 'number', required: true }),
      makeColumn({ id: 'f3', field: 'f3', cellType: 'date', required: true }),
    ]

    expect(store.needsEscalation(columns, [])).toBe(false)
  })

  it('excludes inherited fields from escalation count', () => {
    const columns = [
      makeColumn({ id: 'f1', field: 'f1', cellType: 'text', required: true }),
      makeColumn({ id: 'f2', field: 'f2', cellType: 'text', required: true }),
      makeColumn({ id: 'f3', field: 'f3', cellType: 'number', required: true }),
      makeColumn({ id: 'f4', field: 'f4', cellType: 'email', required: true }),
    ]

    // With one inherited, only 3 remain -> no escalation
    expect(store.needsEscalation(columns, ['f1'])).toBe(false)
  })

  // ====================================
  // commitGhost
  // ====================================

  it('validates required fields before committing', async () => {
    const columns = [makeColumn({ id: 'name', field: 'name', cellType: 'text', required: true })]

    store.openGhost('group1', {})
    // Don't set any field values -> should fail validation

    const onInlineCreate = vi.fn().mockResolvedValue('new-id')
    await store.commitGhost('group1', columns, onInlineCreate)

    expect(onInlineCreate).not.toHaveBeenCalled()
    const state = store.getGhostState('group1')
    expect(state?.validationErrors).toHaveProperty('name', 'Required')
  })

  it('commits successfully when all required fields are filled', async () => {
    const columns = [makeColumn({ id: 'name', field: 'name', cellType: 'text', required: true })]

    store.openGhost('group1', { status: 'active' })
    store.setFieldValue('group1', 'name', 'New Entity')

    const onInlineCreate = vi.fn().mockResolvedValue('new-id')
    await store.commitGhost('group1', columns, onInlineCreate)

    expect(onInlineCreate).toHaveBeenCalledWith({
      status: 'active',
      name: 'New Entity',
    })

    const state = store.getGhostState('group1')
    expect(state?.status).toBe('ghost')
    expect(state?.fieldValues).toEqual({})
  })

  it('sets error state when onInlineCreate throws', async () => {
    const columns = [makeColumn({ id: 'name', field: 'name', cellType: 'text', required: true })]

    store.openGhost('group1', {})
    store.setFieldValue('group1', 'name', 'New Entity')

    const onInlineCreate = vi.fn().mockRejectedValue(new Error('API Error'))
    await store.commitGhost('group1', columns, onInlineCreate)

    const state = store.getGhostState('group1')
    expect(state?.status).toBe('error')
    expect(state?.errorMessage).toBe('API Error')
  })

  it('sets error state when no onInlineCreate callback provided', async () => {
    store.openGhost('group1', {})
    store.setFieldValue('group1', 'name', 'New Entity')

    await store.commitGhost('group1', [], undefined)

    const state = store.getGhostState('group1')
    expect(state?.status).toBe('error')
    expect(state?.errorMessage).toBe('No creation handler configured')
  })

  it('skips inherited fields during validation', async () => {
    const columns = [
      makeColumn({ id: 'status', field: 'status', cellType: 'select', required: true }),
      makeColumn({ id: 'name', field: 'name', cellType: 'text', required: true }),
    ]

    store.openGhost('group1', { status: 'active' }) // status is inherited
    store.setFieldValue('group1', 'name', 'New Entity')

    const onInlineCreate = vi.fn().mockResolvedValue('new-id')
    await store.commitGhost('group1', columns, onInlineCreate)

    expect(onInlineCreate).toHaveBeenCalledWith({
      status: 'active',
      name: 'New Entity',
    })
  })
})
