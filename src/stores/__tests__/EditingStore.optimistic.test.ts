/* @vitest-environment jsdom */

/**
 * GH#2806 P5: EditingStore optimistic-write test suite.
 *
 * Covers all spec test_cases (spec lines 125-134):
 *   - Deterministic state assertion (commitEdit applies before oRPC awaits)
 *   - Same cell edited 2x rapidly (serializes via .then() chain, mutation merge)
 *   - oRPC failure injection reverts + toasts + clears inFlight
 *   - Per-hop instrumentation under ?debug=vibegrid
 *   - queryDelta dedup post-success no-ops
 *   - queryDelta race (different field on same row reconciles)
 *   - Insert optimistically (success swap + failure revert)
 *   - Delete optimistically (success + failure revert)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/shared/data/query/substrate-mutations', () => ({
  shouldUseSubstrateWrite: vi.fn(),
  substrateUpdate: vi.fn(),
  substrateCreate: vi.fn(),
  substrateDelete: vi.fn(),
}))

// Toast import is dynamic in EditingStore — return a mock module with a stub.
vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
  },
}))

import { EditingStore } from '../EditingStore'
import { TableCoreStore } from '../TableCoreStore'
import {
  shouldUseSubstrateWrite,
  substrateCreate,
  substrateDelete,
  substrateUpdate,
} from '@/shared/data/query/substrate-mutations'
import { toast } from 'sonner'
import { applyQueryDeltaDedup } from '@/shared/data/query/query-delta-dedup'

const mockedShouldUseSubstrateWrite = vi.mocked(shouldUseSubstrateWrite)
const mockedSubstrateUpdate = vi.mocked(substrateUpdate)
const mockedSubstrateCreate = vi.mocked(substrateCreate)
const mockedSubstrateDelete = vi.mocked(substrateDelete)
const mockedToastError = vi.mocked(toast.error)

function makeStore(opts: {
  rows?: Array<{ id: string; data: Record<string, unknown> }>
  serverTotalRows?: number | null
} = {}): {
  store: EditingStore
  tableCoreStore: TableCoreStore
  viewportStore: any
} {
  const tableCoreStore = new TableCoreStore('RFI')
  // Set columns + initial rows. Bypass the normal setRows flow for tests.
  ;(tableCoreStore as any).columns = [
    { id: 'title', field: 'title', label: 'Title', type: 'text' },
    { id: 'status', field: 'status', label: 'Status', type: 'text' },
  ]
  const initialRows = opts.rows ?? [
    { id: 'row-1', data: { title: 'A', status: 'open' } },
    { id: 'row-2', data: { title: 'B', status: 'closed' } },
  ]
  ;(tableCoreStore as any).rawRows = initialRows.slice() as any
  ;(tableCoreStore as any).hasLoadedRows = true
  ;(tableCoreStore as any).loadedWindowEnd = initialRows.length
  // Force index cache rebuild on first access.
  ;(tableCoreStore as any).rawRowsIndexCacheRef = null

  const viewportStore: { serverTotalRows: number | null; setServerTotalRows: (n: number | null) => void } = {
    serverTotalRows: opts.serverTotalRows ?? initialRows.length,
    setServerTotalRows: vi.fn((n: number | null) => {
      viewportStore.serverTotalRows = n
    }),
  }

  const store = new EditingStore(tableCoreStore, {} as any)
  store.setViewportStore(viewportStore as any)
  return { store, tableCoreStore, viewportStore }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedShouldUseSubstrateWrite.mockReturnValue(true)
})

afterEach(() => {
  vi.clearAllMocks()
})

// =====================================================
// 1. Deterministic state assertion
// =====================================================

describe('commitSubstrateUpdate — deterministic optimistic state (spec test 1)', () => {
  it('applies new value to tableCoreStore BEFORE the oRPC promise resolves', async () => {
    let resolveOrpc: (v: any) => void = () => {}
    mockedSubstrateUpdate.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveOrpc = resolve
        }),
    )

    const { store, tableCoreStore } = makeStore()
    const tx = store.commitSubstrateUpdate('row-1', 'title', 'NEW')

    // BEFORE the oRPC settles: rawRowsById carries the new value already.
    expect((tableCoreStore.rawRowsById.get('row-1') as any)?.data?.title).toBe('NEW')
    // dataVersion bumped on the optimistic patch.
    expect(tableCoreStore.dataVersion).toBeGreaterThan(0)
    // Synchronous state — chain microtask hasn't fired yet.
    expect(tx.state).toBe('pending')

    // Drain microtasks so the chained .then() executes the mocked
    // substrateUpdate (which assigns the captured `resolveOrpc`).
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    resolveOrpc({ success: true })
    await tx.isPersisted.promise
    expect(tx.state).toBe('completed')
  })
})

// =====================================================
// 2. Same cell edited 2x rapidly serializes
// =====================================================

describe('commitSubstrateUpdate — rapid same-cell re-edit serializes (spec test 2)', () => {
  it('chains two same-cell edits via .then(); second oRPC fires AFTER the first resolves', async () => {
    const callOrder: string[] = []
    let resolveFirst: (v: any) => void = () => {}
    let resolveSecond: (v: any) => void = () => {}
    mockedSubstrateUpdate
      .mockImplementationOnce(() => {
        callOrder.push('first-issued')
        return new Promise((resolve) => {
          resolveFirst = (v) => {
            callOrder.push('first-resolved')
            resolve(v)
          }
        })
      })
      .mockImplementationOnce(() => {
        callOrder.push('second-issued')
        return new Promise((resolve) => {
          resolveSecond = (v) => {
            callOrder.push('second-resolved')
            resolve(v)
          }
        })
      })

    const { store, tableCoreStore } = makeStore()
    const tx1 = store.commitSubstrateUpdate('row-1', 'title', 'first')
    const tx2 = store.commitSubstrateUpdate('row-1', 'title', 'second')

    // Both edits applied locally in order.
    expect((tableCoreStore.rawRowsById.get('row-1') as any)?.data?.title).toBe('second')

    // Drain a few microtasks so the FIRST chained .then() executes its body
    // (issuing the oRPC). The second one should NOT issue yet — it's chained
    // onto the first oRPC promise.
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(callOrder).toEqual(['first-issued'])

    // Resolve first → second issues.
    resolveFirst({ success: true })
    await tx1.isPersisted.promise
    // Allow the chained .then() microtasks to fire.
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(callOrder).toContain('second-issued')

    resolveSecond({ success: true })
    await tx2.isPersisted.promise
    expect(tx2.state).toBe('completed')
  })
})

// =====================================================
// 3. oRPC failure reverts + toast + clears inFlight
// =====================================================

describe('commitSubstrateUpdate — oRPC failure revert (spec test 3)', () => {
  it('reverts tableCoreStore, fires toast, clears inFlight on failure', async () => {
    mockedSubstrateUpdate.mockResolvedValue({
      success: false,
      error: 'permission denied',
    })

    const { store, tableCoreStore } = makeStore()
    const tx = store.commitSubstrateUpdate('row-1', 'title', 'NEW')

    // Optimistic value applied.
    expect((tableCoreStore.rawRowsById.get('row-1') as any)?.data?.title).toBe('NEW')

    await expect(tx.isPersisted.promise).rejects.toThrow(/permission denied/)

    // Reverted to original.
    expect((tableCoreStore.rawRowsById.get('row-1') as any)?.data?.title).toBe('A')
    expect(tx.state).toBe('failed')
    // Toast called.
    expect(mockedToastError).toHaveBeenCalledWith(
      expect.stringContaining('Failed to save'),
    )
    // inFlight cleared.
    expect(store.inFlight.size).toBe(0)
  })

  it('reverts when oRPC throws', async () => {
    mockedSubstrateUpdate.mockRejectedValue(new Error('network down'))

    const { store, tableCoreStore } = makeStore()
    const tx = store.commitSubstrateUpdate('row-1', 'title', 'NEW')

    await expect(tx.isPersisted.promise).rejects.toThrow(/network down/)

    expect((tableCoreStore.rawRowsById.get('row-1') as any)?.data?.title).toBe('A')
    expect(store.inFlight.size).toBe(0)
  })
})

// =====================================================
// 4. Per-hop instrumentation
// =====================================================

describe('commitSubstrateUpdate — per-hop instrumentation (spec test 4)', () => {
  beforeEach(() => {
    // Stub URL search so debug flag is on.
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: { search: '?debug=vibegrid' },
    })
  })

  it('emits console.debug with substrate.write hop timings under ?debug=vibegrid', async () => {
    mockedSubstrateUpdate.mockResolvedValue({ success: true })
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})

    const { store } = makeStore()
    const tx = store.commitSubstrateUpdate('row-1', 'title', 'NEW')
    await tx.isPersisted.promise

    const calls = debugSpy.mock.calls.filter((c) => c[0] === 'substrate.write')
    expect(calls.length).toBeGreaterThan(0)
    const payload = calls[0][1] as Record<string, unknown>
    expect(payload).toMatchObject({
      mutationKind: 'update',
      rowId: 'row-1',
    })
    expect(typeof payload.commitStart).toBe('number')
    expect(typeof payload.optimisticApplied).toBe('number')
    expect(typeof payload.oRpcSend).toBe('number')
    expect(typeof payload.oRpcRecv).toBe('number')
    debugSpy.mockRestore()
  })
})

// =====================================================
// 5. queryDelta dedup post-success no-ops
// =====================================================

describe('queryDelta dedup post-success (spec test 5)', () => {
  it('skips dataVersion bump when delta carries the same value already locally present', async () => {
    mockedSubstrateUpdate.mockResolvedValue({ success: true })
    const { store, tableCoreStore } = makeStore()

    // Apply optimistic edit + let it complete.
    const tx = store.commitSubstrateUpdate('row-1', 'title', 'NEW')
    await tx.isPersisted.promise

    const versionAfterOptimistic = tableCoreStore.dataVersion
    const local = tableCoreStore.rawRowsById.get('row-1')!
    expect((local as any).data?.title).toBe('NEW')
    expect((local as any).optimisticVersion).toBeGreaterThan(0)

    // Build synthetic queryDelta carrying the SAME value.
    const dedup = applyQueryDeltaDedup({
      delta: [{ id: 'row-1', data: { title: 'NEW' } }],
      rawRowsById: tableCoreStore.rawRowsById as any,
      inFlight: store.getInFlight() as any,
      editingState: null,
    })

    expect(dedup.rowsToSkip).toHaveLength(1)
    expect(dedup.rowsToApply).toHaveLength(0)
    // Caller would skip the setSparseRows call → dataVersion unchanged.
    expect(tableCoreStore.dataVersion).toBe(versionAfterOptimistic)
  })
})

// =====================================================
// 6. queryDelta race — different field on same row
// =====================================================

describe('queryDelta race — different field reconciles (spec test 6)', () => {
  it('applies a delta on a different field even while a write on row-1.title is in flight', async () => {
    let resolveOrpc: (v: any) => void = () => {}
    mockedSubstrateUpdate.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveOrpc = resolve
        }),
    )

    const { store, tableCoreStore } = makeStore()
    const tx = store.commitSubstrateUpdate('row-1', 'title', 'NEW-TITLE')

    // Mid-flight: server pushes a delta carrying status='archived' on row-1.
    const dedup = applyQueryDeltaDedup({
      delta: [{ id: 'row-1', data: { status: 'archived' } }],
      rawRowsById: tableCoreStore.rawRowsById as any,
      inFlight: store.getInFlight() as any,
      editingState: null,
    })
    // status is NOT covered by the in-flight write on title → must apply.
    expect(dedup.rowsToApply).toHaveLength(1)
    expect(dedup.rowsToSkip).toHaveLength(0)

    // Drain microtasks so the chained .then() body executes substrateUpdate
    // and assigns resolveOrpc.
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    resolveOrpc({ success: true })
    await tx.isPersisted.promise
    // Local state still carries the optimistic title; dedup decision was
    // independent of the title in-flight.
    expect((tableCoreStore.rawRowsById.get('row-1') as any)?.data?.title).toBe('NEW-TITLE')
  })
})

// =====================================================
// 7. Insert optimistically
// =====================================================

describe('commitCreate (spec test 7)', () => {
  it('inserts optimistically with optimistic-<uuid> id and bumps serverTotalRows', () => {
    let resolveOrpc: (v: any) => void = () => {}
    mockedSubstrateCreate.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveOrpc = resolve
        }),
    )

    const { store, tableCoreStore, viewportStore } = makeStore()
    const prevTotal = viewportStore.serverTotalRows
    const tx = store.commitCreate({ title: 'fresh' })

    expect(tx.rowId).toMatch(/^optimistic-/)
    expect((tableCoreStore.rawRowsById.get(tx.rowId) as any)?.data?.title).toBe('fresh')
    expect(viewportStore.serverTotalRows).toBe(prevTotal + 1)
    // Suppress the dangling promise — we don't await it.
    resolveOrpc({ success: true, data: { id: 'server-id-1', title: 'fresh' } })
  })

  it('swaps optimistic id with server id on success', async () => {
    mockedSubstrateCreate.mockResolvedValue({
      success: true,
      data: { id: 'server-id-1', title: 'fresh' } as any,
    })

    const { store, tableCoreStore } = makeStore()
    const tx = store.commitCreate({ title: 'fresh' })
    const tempId = tx.rowId

    await tx.isPersisted.promise
    expect(tableCoreStore.rawRowsById.has(tempId)).toBe(false)
    expect((tableCoreStore.rawRowsById.get('server-id-1') as any)?.data?.title).toBe('fresh')
  })

  it('removes optimistic row + reverts serverTotalRows on failure', async () => {
    mockedSubstrateCreate.mockResolvedValue({ success: false, error: 'schema invalid' })

    const { store, tableCoreStore, viewportStore } = makeStore()
    const prevTotal = viewportStore.serverTotalRows
    const tx = store.commitCreate({ title: 'fresh' })

    await expect(tx.isPersisted.promise).rejects.toThrow(/schema invalid/)
    expect(tableCoreStore.rawRowsById.has(tx.rowId)).toBe(false)
    expect(viewportStore.serverTotalRows).toBe(prevTotal)
    expect(mockedToastError).toHaveBeenCalled()
  })
})

// =====================================================
// 8. Delete optimistically
// =====================================================

describe('commitDelete (spec test 8)', () => {
  it('removes the row + decrements serverTotalRows immediately', () => {
    let resolveOrpc: (v: any) => void = () => {}
    mockedSubstrateDelete.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveOrpc = resolve
        }),
    )

    const { store, tableCoreStore, viewportStore } = makeStore()
    const prevTotal = viewportStore.serverTotalRows
    const tx = store.commitDelete('row-1')

    expect(tableCoreStore.rawRowsById.has('row-1')).toBe(false)
    expect(viewportStore.serverTotalRows).toBe(prevTotal - 1)
    resolveOrpc({ success: true })
    expect(tx.mutationKind).toBe('delete')
  })

  it('restores the row + increments serverTotalRows on failure', async () => {
    mockedSubstrateDelete.mockResolvedValue({ success: false, error: 'still referenced' })

    const { store, tableCoreStore, viewportStore } = makeStore()
    const prevTotal = viewportStore.serverTotalRows
    const tx = store.commitDelete('row-1')

    await expect(tx.isPersisted.promise).rejects.toThrow(/still referenced/)
    expect(tableCoreStore.rawRowsById.has('row-1')).toBe(true)
    expect((tableCoreStore.rawRowsById.get('row-1') as any)?.data?.title).toBe('A')
    expect(viewportStore.serverTotalRows).toBe(prevTotal)
    expect(mockedToastError).toHaveBeenCalled()
  })
})

// =====================================================
// Bonus: network-offline → all 3 mutation types revert (spec test (f))
// =====================================================

describe('Network offline — all 3 mutation types revert', () => {
  it('update + create + delete all revert to ground truth on rejection', async () => {
    const networkErr = new Error('NetworkError: failed to fetch')
    mockedSubstrateUpdate.mockRejectedValue(networkErr)
    mockedSubstrateCreate.mockRejectedValue(networkErr)
    mockedSubstrateDelete.mockRejectedValue(networkErr)

    const { store, tableCoreStore } = makeStore()

    const updateTx = store.commitSubstrateUpdate('row-1', 'title', 'NEW')
    const createTx = store.commitCreate({ title: 'fresh' })
    const deleteTx = store.commitDelete('row-2')

    // Wait for all to settle.
    await expect(updateTx.isPersisted.promise).rejects.toThrow(/Network/)
    await expect(createTx.isPersisted.promise).rejects.toThrow(/Network/)
    await expect(deleteTx.isPersisted.promise).rejects.toThrow(/Network/)

    // All row-level state reverted to ground truth.
    expect((tableCoreStore.rawRowsById.get('row-1') as any)?.data?.title).toBe('A')
    expect(tableCoreStore.rawRowsById.has(createTx.rowId)).toBe(false)
    expect((tableCoreStore.rawRowsById.get('row-2') as any)?.data?.title).toBe('B')
    // inFlight cleared for all three.
    expect(store.inFlight.size).toBe(0)
    // Note: serverTotalRows after parallel multi-mutation revert depends on
    // capture-order; the per-mutation tests above assert the single-mutation
    // bookkeeping. Here we only assert row-data + inFlight are clean.
  })
})
