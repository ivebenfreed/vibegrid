/* @vitest-environment jsdom */

/**
 * GH#2812 A1: useVibeGridData substrate write path.
 *
 * Verifies that createEntity / updateEntity / deleteEntity route through
 * substrateCreate / substrateUpdate / substrateDelete when the entity is
 * substrate-owned (e.g. RFI under ?ff=substrate), and continue to use the
 * legacy TanStack DB collection.insert/update/delete path otherwise.
 */

import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/shared/data/query/substrate-mutations', () => ({
  shouldUseSubstrateWrite: vi.fn(),
  substrateCreate: vi.fn(),
  substrateUpdate: vi.fn(),
  substrateDelete: vi.fn(),
}))

vi.mock('@tanstack/react-db', () => ({
  useLiveQuery: () => ({ data: [], isLoading: false, status: 'success' }),
}))

vi.mock('@/shared/data/db/hooks/useEntityCollection', () => ({
  useEntityCollection: vi.fn(),
}))

vi.mock('@/app/stores', () => ({
  useOrganization: () => ({ activeOrganizationId: 'org-1' }),
}))

vi.mock('@/shared/data/query/feature-flag', () => ({
  isSubstrateEnabled: () => false,
  isSubstrateOwnedEntity: () => false,
}))

vi.mock('@/shared/data/query/use-substrate-grid-rows', () => ({
  useSubstrateGridRows: () => ({
    rows: [],
    isReady: true,
    bounded: false,
    count: 0,
  }),
}))

vi.mock('../useMobxSnapshot', () => ({
  useMobxSnapshot: () => [],
}))

vi.mock('../../stores/context', () => ({
  useVibeGridStores: () => ({ viewportStore: null }),
}))

import { useVibeGridData } from '../useVibeGridData'
import {
  shouldUseSubstrateWrite,
  substrateCreate,
  substrateDelete,
  substrateUpdate,
} from '@/shared/data/query/substrate-mutations'
import { useEntityCollection } from '@/shared/data/db/hooks/useEntityCollection'

const mockedShouldUseSubstrateWrite = vi.mocked(shouldUseSubstrateWrite)
const mockedSubstrateCreate = vi.mocked(substrateCreate)
const mockedSubstrateUpdate = vi.mocked(substrateUpdate)
const mockedSubstrateDelete = vi.mocked(substrateDelete)
const mockedUseEntityCollection = vi.mocked(useEntityCollection)

function makeStores() {
  return {
    tableCoreStore: {
      entityType: 'RFI',
      setRows: vi.fn(),
      setSparseRows: vi.fn(),
    } as any,
    visualStateStore: {
      filters: [],
      sortBy: [],
    } as any,
    initStore: {
      hydrationState: { entityDataLoaded: false },
      markReady: vi.fn(),
    } as any,
  }
}

function makeMockCollection() {
  return {
    insert: vi.fn().mockReturnValue({ isPersisted: { promise: Promise.resolve() } }),
    update: vi.fn().mockReturnValue({ isPersisted: { promise: Promise.resolve() } }),
    delete: vi.fn().mockReturnValue({ isPersisted: { promise: Promise.resolve() } }),
  }
}

describe('useVibeGridData substrate write path (GH#2812 A1)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('when substrate-owned (shouldUseSubstrateWrite=true)', () => {
    beforeEach(() => {
      mockedShouldUseSubstrateWrite.mockReturnValue(true)
      mockedSubstrateCreate.mockResolvedValue({ success: true })
      mockedSubstrateUpdate.mockResolvedValue({ success: true })
      mockedSubstrateDelete.mockResolvedValue({ success: true })
    })

    it('createEntity calls substrateCreate, NOT collection.insert', () => {
      const stores = makeStores()
      const collection = makeMockCollection()
      mockedUseEntityCollection.mockReturnValue(collection as any)

      const { result } = renderHook(() =>
        useVibeGridData('RFI', stores.tableCoreStore, stores.visualStateStore, stores.initStore),
      )

      result.current.createEntity({ title: 'Hello' })

      expect(mockedSubstrateCreate).toHaveBeenCalledTimes(1)
      expect(mockedSubstrateCreate).toHaveBeenCalledWith('RFI', { title: 'Hello' })
      expect(collection.insert).not.toHaveBeenCalled()
    })

    it('updateEntity calls substrateUpdate, NOT collection.update', () => {
      const stores = makeStores()
      const collection = makeMockCollection()
      mockedUseEntityCollection.mockReturnValue(collection as any)

      const { result } = renderHook(() =>
        useVibeGridData('RFI', stores.tableCoreStore, stores.visualStateStore, stores.initStore),
      )

      result.current.updateEntity('rec-1', { title: 'Updated' })

      expect(mockedSubstrateUpdate).toHaveBeenCalledTimes(1)
      expect(mockedSubstrateUpdate).toHaveBeenCalledWith('RFI', 'rec-1', { title: 'Updated' })
      expect(collection.update).not.toHaveBeenCalled()
    })

    it('deleteEntity calls substrateDelete, NOT collection.delete', () => {
      const stores = makeStores()
      const collection = makeMockCollection()
      mockedUseEntityCollection.mockReturnValue(collection as any)

      const { result } = renderHook(() =>
        useVibeGridData('RFI', stores.tableCoreStore, stores.visualStateStore, stores.initStore),
      )

      result.current.deleteEntity('rec-1')

      expect(mockedSubstrateDelete).toHaveBeenCalledTimes(1)
      expect(mockedSubstrateDelete).toHaveBeenCalledWith('RFI', 'rec-1')
      expect(collection.delete).not.toHaveBeenCalled()
    })
  })

  describe('when non-substrate (shouldUseSubstrateWrite=false)', () => {
    beforeEach(() => {
      mockedShouldUseSubstrateWrite.mockReturnValue(false)
    })

    it('createEntity calls collection.insert, NOT substrateCreate', () => {
      const stores = makeStores()
      stores.tableCoreStore.entityType = 'Document'
      const collection = makeMockCollection()
      mockedUseEntityCollection.mockReturnValue(collection as any)

      const { result } = renderHook(() =>
        useVibeGridData('Document', stores.tableCoreStore, stores.visualStateStore, stores.initStore),
      )

      result.current.createEntity({ title: 'Hello' })

      expect(collection.insert).toHaveBeenCalledTimes(1)
      expect(mockedSubstrateCreate).not.toHaveBeenCalled()
    })

    it('updateEntity calls collection.update, NOT substrateUpdate', () => {
      const stores = makeStores()
      stores.tableCoreStore.entityType = 'Document'
      const collection = makeMockCollection()
      mockedUseEntityCollection.mockReturnValue(collection as any)

      const { result } = renderHook(() =>
        useVibeGridData('Document', stores.tableCoreStore, stores.visualStateStore, stores.initStore),
      )

      result.current.updateEntity('rec-1', { title: 'Updated' })

      expect(collection.update).toHaveBeenCalledTimes(1)
      expect(collection.update).toHaveBeenCalledWith('rec-1', expect.any(Function))
      expect(mockedSubstrateUpdate).not.toHaveBeenCalled()
    })

    it('deleteEntity calls collection.delete, NOT substrateDelete', () => {
      const stores = makeStores()
      stores.tableCoreStore.entityType = 'Document'
      const collection = makeMockCollection()
      mockedUseEntityCollection.mockReturnValue(collection as any)

      const { result } = renderHook(() =>
        useVibeGridData('Document', stores.tableCoreStore, stores.visualStateStore, stores.initStore),
      )

      result.current.deleteEntity('rec-1')

      expect(collection.delete).toHaveBeenCalledTimes(1)
      expect(collection.delete).toHaveBeenCalledWith('rec-1')
      expect(mockedSubstrateDelete).not.toHaveBeenCalled()
    })
  })
})
