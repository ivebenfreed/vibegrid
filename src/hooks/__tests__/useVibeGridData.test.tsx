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

vi.mock('@/shared/data/query/substrate-mutations', () => ({
  substrateCreate: vi.fn().mockResolvedValue({ success: true }),
  substrateUpdate: vi.fn().mockResolvedValue({ success: true }),
  substrateDelete: vi.fn().mockResolvedValue({ success: true }),
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

vi.mock('@/shared/data/db/sqlite/wedge-watchdog', () => ({
  armWedgeWatchdog: vi.fn(() => () => {}),
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
})
