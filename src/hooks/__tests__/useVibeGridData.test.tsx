/* @vitest-environment jsdom */

/**
 * useVibeGridData hydration gate.
 *
 * The hook must mark `initStore.entityDataKnownComplete` only once the
 * substrate has authoritatively reported readiness (`bounded && isReady`),
 * regardless of count. The previous implementation fired a 5s wall-clock
 * fallback that could flip the gate before the substrate had even
 * initialized on cold-start logins (SQLite init can take up to 60s),
 * causing the grid to flash "No records yet" while data was still loading.
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
  }
  const initial: SubstrateState = { rows: [], count: 0, isReady: false, bounded: false }
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
}): void {
  substrateStateRef.current = {
    rows: next.rows ?? [],
    count: next.count,
    isReady: next.isReady,
    bounded: next.bounded,
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

  it('does not mark entityDataKnownComplete until substrate reports isReady', () => {
    const initStore = makeInitStore()
    const tableCoreStore = makeTableCoreStore()
    const visualStateStore = {} as any

    setSubstrateState({ count: 0, isReady: false, bounded: false })

    const { rerender } = renderHook(() =>
      useVibeGridData(
        'RFI',
        tableCoreStore as any,
        visualStateStore,
        initStore as any,
      ),
    )

    // Advance well past the previous 5s wall-clock fallback. The new
    // implementation must NOT mark complete here — substrate hasn't
    // reported isReady yet.
    vi.advanceTimersByTime(6000)
    expect(initStore.markEntityDataKnownComplete).not.toHaveBeenCalled()

    // Now substrate becomes ready (count still 0 — legitimately empty).
    setSubstrateState({ count: 0, isReady: true, bounded: true })
    rerender()

    expect(initStore.markEntityDataKnownComplete).toHaveBeenCalledTimes(1)
  })

  it('marks entityDataKnownComplete when substrate is ready with count > 0', () => {
    const initStore = makeInitStore()
    const tableCoreStore = makeTableCoreStore()
    const visualStateStore = {} as any

    setSubstrateState({ count: 5, isReady: true, bounded: true })

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

  it('marks entityDataKnownComplete when substrate is ready with count === 0 (legitimately empty)', () => {
    const initStore = makeInitStore()
    const tableCoreStore = makeTableCoreStore()
    const visualStateStore = {} as any

    setSubstrateState({ count: 0, isReady: true, bounded: true })

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

  it('does not mark entityDataKnownComplete when bounded but not ready', () => {
    const initStore = makeInitStore()
    const tableCoreStore = makeTableCoreStore()
    const visualStateStore = {} as any

    // bounded === true (substrate writer is engaged) but isReady false
    // (the first maintainQuery has not resolved yet).
    setSubstrateState({ count: 0, isReady: false, bounded: true })

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
