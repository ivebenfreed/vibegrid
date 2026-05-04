/* @vitest-environment jsdom */

/**
 * GH#2812 A1: EditingStore substrate write path.
 *
 * When the substrate is active (?ff=substrate), the TanStack DB collection
 * is empty (rows live in SharedWorker SQLite). Cell edits must route
 * through `substrateUpdate` (oRPC) instead of `collection.update` (which
 * throws "key not found").
 *
 * Non-substrate entities (e.g. 'Document') must continue to use the legacy
 * collection.update path.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/shared/data/query/substrate-mutations', () => ({
  shouldUseSubstrateWrite: vi.fn(),
  substrateUpdate: vi.fn(),
}))

import { EditingStore } from '../EditingStore'
import {
  shouldUseSubstrateWrite,
  substrateUpdate,
} from '@/shared/data/query/substrate-mutations'

const mockedShouldUseSubstrateWrite = vi.mocked(shouldUseSubstrateWrite)
const mockedSubstrateUpdate = vi.mocked(substrateUpdate)

function createStore(entityType: string) {
  // GH#2806 P5: substrate write path now applies optimistic updates via
  // `tableCoreStore.patchRowOptimistic` / `revertRowOptimistic`. The test
  // mock stubs those out — the substrate-write tests don't assert on
  // optimistic state, only that the right oRPC path is hit.
  const tableCoreStore = {
    entityType,
    processedRows: [{ id: 'row-1', data: { title: 'Initial value' } }],
    patchRowOptimistic: vi.fn().mockReturnValue([
      { rowId: 'row-1', field: 'title', preEditValue: 'Initial value', applied: true },
    ]),
    revertRowOptimistic: vi.fn(),
  } as any
  const visualStateStore = {} as any

  return new EditingStore(tableCoreStore, visualStateStore)
}

function makeMockCollection() {
  return {
    get: vi.fn().mockReturnValue({ title: 'Initial value' }),
    update: vi.fn().mockReturnValue({
      isPersisted: { promise: Promise.resolve() },
    }),
  } as any
}

function withMockColumn() {
  return {
    id: 'title',
    field: 'title',
    fieldType: { interactionPolicy: { blurPolicy: 'commit' } },
  } as any
}

describe('EditingStore substrate write path (GH#2812 A1)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('routes RFI edit through substrateUpdate when shouldUseSubstrateWrite=true', async () => {
    mockedShouldUseSubstrateWrite.mockReturnValue(true)
    mockedSubstrateUpdate.mockResolvedValue({ success: true })

    const store = createStore('RFI')
    const collection = makeMockCollection()
    store.setCollection(collection)

    store.startEdit('row-1:title', withMockColumn())
    store.updatePendingValue('Updated value')
    await store.commitEdit('user-action')

    expect(mockedSubstrateUpdate).toHaveBeenCalledTimes(1)
    expect(mockedSubstrateUpdate).toHaveBeenCalledWith('RFI', 'row-1', {
      title: 'Updated value',
    })

    // Substrate path must NOT touch the (empty) TanStack DB collection.
    expect(collection.update).not.toHaveBeenCalled()
  })

  it('skips substrate write when value unchanged (substrate path)', async () => {
    mockedShouldUseSubstrateWrite.mockReturnValue(true)
    mockedSubstrateUpdate.mockResolvedValue({ success: true })

    const store = createStore('RFI')
    const collection = makeMockCollection()
    store.setCollection(collection)

    store.startEdit('row-1:title', withMockColumn())
    // Don't change the value — pendingValue stays equal to originalValue
    await store.commitEdit('user-action')

    expect(mockedSubstrateUpdate).not.toHaveBeenCalled()
    expect(collection.update).not.toHaveBeenCalled()
  })

  it('uses legacy collection.update for non-substrate entity (e.g. Document)', async () => {
    mockedShouldUseSubstrateWrite.mockReturnValue(false)

    const store = createStore('Document')
    const collection = makeMockCollection()
    store.setCollection(collection)

    store.startEdit('row-1:title', withMockColumn())
    store.updatePendingValue('Updated value')
    await store.commitEdit('user-action')

    expect(mockedSubstrateUpdate).not.toHaveBeenCalled()
    expect(collection.update).toHaveBeenCalledTimes(1)
    expect(collection.update).toHaveBeenCalledWith('row-1', expect.any(Function))
  })

  it('logs error and bails when substrateUpdate returns success=false', async () => {
    mockedShouldUseSubstrateWrite.mockReturnValue(true)
    mockedSubstrateUpdate.mockResolvedValue({
      success: false,
      error: 'permission denied',
    })

    const store = createStore('RFI')
    const collection = makeMockCollection()
    store.setCollection(collection)

    store.startEdit('row-1:title', withMockColumn())
    store.updatePendingValue('Updated value')
    await store.commitEdit('user-action')

    expect(mockedSubstrateUpdate).toHaveBeenCalledTimes(1)
    // Should not fall through to collection.update on substrate error
    expect(collection.update).not.toHaveBeenCalled()
    // Editor should still have closed (session cleared)
    expect(store.isEditing).toBe(false)
  })

  it('catches a thrown substrateUpdate without crashing the editor', async () => {
    mockedShouldUseSubstrateWrite.mockReturnValue(true)
    mockedSubstrateUpdate.mockRejectedValue(new Error('network down'))

    const store = createStore('RFI')
    const collection = makeMockCollection()
    store.setCollection(collection)

    store.startEdit('row-1:title', withMockColumn())
    store.updatePendingValue('Updated value')
    await store.commitEdit('user-action')

    expect(mockedSubstrateUpdate).toHaveBeenCalledTimes(1)
    expect(collection.update).not.toHaveBeenCalled()
    expect(store.isEditing).toBe(false)
  })
})
