/* @vitest-environment jsdom */

/**
 * useVibeGridData hydration gate.
 *
 * GH#3119 P5 (B17): the hook reads from `useEntityGrid` (single-source-
 * of-truth substrate read hook) and marks
 * `initStore.entityDataKnownComplete` based on the result's `source`:
 *   - `source === 'warm-local'`: wa-sqlite holds the dataset; flip on.
 *   - `source === 'warming-server' && total === 0 && !isLoading`:
 *     legitimately empty entity (server returned no ids); flip on.
 *   - `source === 'warming-server' && isLoading`: still fetching, do
 *     NOT flip.
 */

import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UseEntityGridResult } from '@/shared/data/hooks/useEntityGrid'

// -------------------- Hoisted spies --------------------

const { gridResultRef } = vi.hoisted(() => {
  const initial: UseEntityGridResult = {
    rows: [],
    total: 0,
    viewport: { start: 0, end: 0 },
    isLoading: false,
    isStale: false,
    isWarm: false,
    error: null,
    source: 'empty',
  }
  return {
    gridResultRef: { current: initial as UseEntityGridResult },
  }
})

// -------------------- Mocks --------------------

vi.mock('@/shared/data/hooks/useEntityGrid', () => ({
  useEntityGrid: vi.fn(() => gridResultRef.current),
}))

vi.mock('@/shared/data/hooks/useEntityMutation', () => ({
  mutationApi: {
    create: vi.fn().mockResolvedValue({ success: true, record: null }),
    update: vi.fn().mockResolvedValue({ success: true, record: null }),
    delete: vi.fn().mockResolvedValue({ success: true }),
    mutateSystemEntity: vi.fn().mockResolvedValue({ success: true }),
  },
  useEntityMutation: vi.fn(),
}))

vi.mock('@/app/stores', () => ({
  useOrganization: () => ({ activeOrganizationId: 'org-1' }),
}))

vi.mock('../../stores/context', () => ({
  useVibeGridStores: () => ({
    viewportStore: {
      visibleRowRange: { start: 0, end: 50 },
      serverTotalRows: null,
      setServerTotalRows: vi.fn(),
    },
  }),
}))

vi.mock('@/shared/lib/logging', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  }),
}))

import { useVibeGridData } from '../useVibeGridData'

// -------------------- Helpers --------------------

function makeInitStore() {
  return {
    entityDataKnownComplete: false,
    markEntityDataKnownComplete: vi.fn(function (this: any) {
      this.entityDataKnownComplete = true
    }),
    markServerDataRendered: vi.fn(),
    markError: vi.fn(),
  }
}

function makeTableCoreStore() {
  return {
    setRows: vi.fn(),
    setSparseRows: vi.fn(),
    processedRows: [] as any[],
    columns: [] as any[],
  }
}

function makeVisualStateStore() {
  return {
    sortBy: [],
    filters: [],
    filterGroup: null,
    globalSearchText: '',
  }
}

function setGridResult(next: Partial<UseEntityGridResult>): void {
  gridResultRef.current = {
    rows: next.rows ?? [],
    total: next.total ?? 0,
    viewport: next.viewport ?? { start: 0, end: 0 },
    isLoading: next.isLoading ?? false,
    isStale: next.isStale ?? false,
    isWarm: next.isWarm ?? false,
    error: next.error ?? null,
    source: next.source ?? 'empty',
  }
}

// -------------------- Tests --------------------

describe('useVibeGridData — hydration gate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    setGridResult({ source: 'empty', total: 0, isLoading: false })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('does not mark entityDataKnownComplete while source is empty / warming with isLoading', () => {
    const initStore = makeInitStore()
    const tableCoreStore = makeTableCoreStore()
    const visualStateStore = makeVisualStateStore() as any

    // Warming-server, still loading — gate must stay closed.
    setGridResult({
      source: 'warming-server',
      total: 100,
      isLoading: true,
    })

    const { rerender } = renderHook(() =>
      useVibeGridData(
        'RFI',
        tableCoreStore as any,
        visualStateStore,
        initStore as any,
      ),
    )

    // Advance well past any previous wall-clock fallback. Must NOT mark complete.
    vi.advanceTimersByTime(6000)
    expect(initStore.markEntityDataKnownComplete).not.toHaveBeenCalled()

    // Now flip to warm-local — the gate must open.
    setGridResult({
      source: 'warm-local',
      total: 5,
      isLoading: false,
      isWarm: true,
    })
    rerender()

    expect(initStore.markEntityDataKnownComplete).toHaveBeenCalledTimes(1)
  })

  it('marks entityDataKnownComplete when source is warm-local with rows', () => {
    const initStore = makeInitStore()
    const tableCoreStore = makeTableCoreStore()
    const visualStateStore = makeVisualStateStore() as any

    setGridResult({
      source: 'warm-local',
      total: 5,
      isLoading: false,
      isWarm: true,
      rows: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' }],
    })

    renderHook(() =>
      useVibeGridData(
        'RFI',
        tableCoreStore as any,
        visualStateStore,
        initStore as any,
      ),
    )

    expect(initStore.markEntityDataKnownComplete).toHaveBeenCalledTimes(1)
  })

  it('marks entityDataKnownComplete when warming-server delivers empty-authoritative (total 0, !isLoading)', () => {
    const initStore = makeInitStore()
    const tableCoreStore = makeTableCoreStore()
    const visualStateStore = makeVisualStateStore() as any

    setGridResult({
      source: 'warming-server',
      total: 0,
      isLoading: false,
    })

    renderHook(() =>
      useVibeGridData(
        'RFI',
        tableCoreStore as any,
        visualStateStore,
        initStore as any,
      ),
    )

    expect(initStore.markEntityDataKnownComplete).toHaveBeenCalledTimes(1)
  })

  it('does not mark entityDataKnownComplete when warming-server is still loading', () => {
    const initStore = makeInitStore()
    const tableCoreStore = makeTableCoreStore()
    const visualStateStore = makeVisualStateStore() as any

    // First-page snapshot landed (warming-server) but more rows remain
    // (isLoading=true): hydration gate should still be closed.
    setGridResult({
      source: 'warming-server',
      total: 100,
      isLoading: true,
    })

    renderHook(() =>
      useVibeGridData(
        'RFI',
        tableCoreStore as any,
        visualStateStore,
        initStore as any,
      ),
    )

    expect(initStore.markEntityDataKnownComplete).not.toHaveBeenCalled()
  })

  // GH#3283 — with the warm loop gated off, `warming-server` is the
  // TERMINAL state, not a way-station. The old `total === 0` condition
  // could then never fire for a non-empty entity, the gate never opened,
  // and skeleton dismissal fell through to the 8s
  // `substrate_completion_timeout` fallback — an 8-second overlay on every
  // grid load. Observed on staging (DEB Submittal, 6836 rows).
  describe('warm sync gated off (GH#3283)', () => {
    afterEach(() => {
      window.localStorage.removeItem('ff:substrate-no-warm')
    })

    it('marks entityDataKnownComplete on a settled warming-server response with a NON-zero total', () => {
      window.localStorage.setItem('ff:substrate-no-warm', 'true')
      const initStore = makeInitStore()
      const tableCoreStore = makeTableCoreStore()
      const visualStateStore = makeVisualStateStore() as any

      // The exact shape that used to hang: rows present, server total
      // known, nothing in flight, and no warm-local transition coming.
      setGridResult({
        source: 'warming-server',
        total: 6836,
        isLoading: false,
      })

      renderHook(() =>
        useVibeGridData(
          'Submittal',
          tableCoreStore as any,
          visualStateStore,
          initStore as any,
        ),
      )

      expect(initStore.markEntityDataKnownComplete).toHaveBeenCalledTimes(1)
    })

    it('still waits while the warming-server response is in flight', () => {
      window.localStorage.setItem('ff:substrate-no-warm', 'true')
      const initStore = makeInitStore()
      const tableCoreStore = makeTableCoreStore()
      const visualStateStore = makeVisualStateStore() as any

      setGridResult({
        source: 'warming-server',
        total: 6836,
        isLoading: true,
      })

      renderHook(() =>
        useVibeGridData(
          'Submittal',
          tableCoreStore as any,
          visualStateStore,
          initStore as any,
        ),
      )

      expect(initStore.markEntityDataKnownComplete).not.toHaveBeenCalled()
    })

    it('leaves the warm path untouched — non-zero total still waits when warms are ON', () => {
      // No localStorage key set: the gate is off, so the pre-GH#3283
      // wait-for-warm-local semantics must still hold.
      const initStore = makeInitStore()
      const tableCoreStore = makeTableCoreStore()
      const visualStateStore = makeVisualStateStore() as any

      setGridResult({
        source: 'warming-server',
        total: 6836,
        isLoading: false,
      })

      renderHook(() =>
        useVibeGridData(
          'Submittal',
          tableCoreStore as any,
          visualStateStore,
          initStore as any,
        ),
      )

      expect(initStore.markEntityDataKnownComplete).not.toHaveBeenCalled()
    })
  })
})

describe('useVibeGridData — result→store pairing (scroll jitter guard)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    setGridResult({ source: 'empty', total: 0, isLoading: false })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('writes rows at the RESULT viewport start, not the live input viewport', () => {
    const initStore = makeInitStore()
    const tableCoreStore = makeTableCoreStore()
    const visualStateStore = makeVisualStateStore() as any

    // Result evaluated for window [0, 280) — even though the mocked
    // viewportStore.visibleRowRange (the live input) starts at 0..50 with
    // overscan, the store write must use the result's own start.
    setGridResult({
      source: 'warming-server',
      total: 1000,
      isLoading: false,
      rows: [{ id: 'row-a' }, { id: 'row-b' }],
      viewport: { start: 5800, end: 6100 },
    })

    renderHook(() =>
      useVibeGridData(
        'RFI',
        tableCoreStore as any,
        visualStateStore,
        initStore as any,
      ),
    )

    expect(tableCoreStore.setSparseRows).toHaveBeenCalled()
    const lastCall = tableCoreStore.setSparseRows.mock.calls.at(-1)!
    expect(lastCall[0]).toBe(5800)
    expect(lastCall[2]).toBe(1000)
  })
})

describe('useVibeGridData — read-error surface', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    setGridResult({ source: 'empty', total: 0, isLoading: false })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('records the error on InitStore and opens the skeleton gate', () => {
    const initStore = makeInitStore()
    const tableCoreStore = makeTableCoreStore()
    const visualStateStore = makeVisualStateStore() as any

    setGridResult({
      source: 'warming-server',
      total: 0,
      isLoading: false,
      error: new Error('400 input validation failed'),
    })

    renderHook(() =>
      useVibeGridData(
        'RFI',
        tableCoreStore as any,
        visualStateStore,
        initStore as any,
      ),
    )

    expect(initStore.markError).toHaveBeenCalledWith(
      'substrate-query',
      '400 input validation failed',
    )
    expect(initStore.markServerDataRendered).toHaveBeenCalledTimes(1)
  })

  it('does not fire the error surface when there is no error', () => {
    const initStore = makeInitStore()
    const tableCoreStore = makeTableCoreStore()
    const visualStateStore = makeVisualStateStore() as any

    setGridResult({
      source: 'warming-server',
      total: 100,
      isLoading: true,
    })

    renderHook(() =>
      useVibeGridData(
        'RFI',
        tableCoreStore as any,
        visualStateStore,
        initStore as any,
      ),
    )

    expect(initStore.markError).not.toHaveBeenCalled()
    expect(initStore.markServerDataRendered).not.toHaveBeenCalled()
  })
})
