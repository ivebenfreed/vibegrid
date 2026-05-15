/* @vitest-environment jsdom */

/**
 * useVibeGridData hydration gate.
 *
 * GH#3019 B10: the hook marks `initStore.entityDataKnownComplete` once the
 * unified query layer's snapshot has authoritatively reported completion
 * (`source !== null && isComplete`). Empty-but-authoritative entities
 * (server returned `total: 0`) satisfy `isComplete: true` and flip the
 * gate so the renderer can paint "No records yet" instead of a skeleton.
 */

import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// -------------------- Hoisted spies --------------------

const { substrateStateRef } = vi.hoisted(() => {
  type SubstrateState = {
    rows: any[]
    count: number
    isReady: boolean
    bounded: boolean
    isComplete: boolean
    source: 'local' | 'server' | null
  }
  const initial: SubstrateState = {
    rows: [],
    count: 0,
    isReady: false,
    bounded: false,
    isComplete: false,
    source: null,
  }
  return {
    substrateStateRef: { current: initial as SubstrateState },
  }
})

// -------------------- Mocks --------------------

vi.mock('@/shared/data/query/use-substrate-grid-rows', () => ({
  useSubstrateGridRows: vi.fn(() => substrateStateRef.current),
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
  useVibeGridStores: () => ({ viewportStore: {} }),
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
  }
}

function makeTableCoreStore() {
  return {
    setRows: vi.fn(),
  }
}

function setSubstrateState(next: {
  rows?: any[]
  count: number
  isReady: boolean
  bounded: boolean
  isComplete?: boolean
  source?: 'local' | 'server' | null
}): void {
  substrateStateRef.current = {
    rows: next.rows ?? [],
    count: next.count,
    isReady: next.isReady,
    bounded: next.bounded,
    isComplete: next.isComplete ?? false,
    source: next.source ?? null,
  }
}

// -------------------- Tests --------------------

describe('useVibeGridData — hydration gate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    setSubstrateState({ count: 0, isReady: false, bounded: false })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('does not mark entityDataKnownComplete until the unified layer delivers isComplete', () => {
    const initStore = makeInitStore()
    const tableCoreStore = makeTableCoreStore()
    const visualStateStore = {} as any

    // No snapshot delivered yet (source === null).
    setSubstrateState({ count: 0, isReady: false, bounded: false, source: null })

    const { rerender } = renderHook(() =>
      useVibeGridData(
        'RFI',
        tableCoreStore as any,
        visualStateStore,
        initStore as any,
      ),
    )

    // Advance well past the previous 5s wall-clock fallback. The new
    // implementation must NOT mark complete here — no snapshot yet.
    vi.advanceTimersByTime(6000)
    expect(initStore.markEntityDataKnownComplete).not.toHaveBeenCalled()

    // Snapshot arrives from server with isComplete=true (legitimately empty).
    setSubstrateState({
      count: 0,
      isReady: true,
      bounded: true,
      isComplete: true,
      source: 'server',
    })
    rerender()

    expect(initStore.markEntityDataKnownComplete).toHaveBeenCalledTimes(1)
  })

  it('marks entityDataKnownComplete when snapshot is complete with count > 0', () => {
    const initStore = makeInitStore()
    const tableCoreStore = makeTableCoreStore()
    const visualStateStore = {} as any

    setSubstrateState({
      count: 5,
      isReady: true,
      bounded: true,
      isComplete: true,
      source: 'local',
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

  it('marks entityDataKnownComplete when snapshot is complete with count === 0 (legitimately empty)', () => {
    const initStore = makeInitStore()
    const tableCoreStore = makeTableCoreStore()
    const visualStateStore = {} as any

    setSubstrateState({
      count: 0,
      isReady: true,
      bounded: true,
      isComplete: true,
      source: 'server',
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

  it('does not mark entityDataKnownComplete when source is set but isComplete is false', () => {
    const initStore = makeInitStore()
    const tableCoreStore = makeTableCoreStore()
    const visualStateStore = {} as any

    // First-page snapshot landed (source='server') but more rows remain
    // (isComplete=false): hydration gate should still be closed.
    setSubstrateState({
      count: 100,
      isReady: true,
      bounded: true,
      isComplete: false,
      source: 'server',
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
