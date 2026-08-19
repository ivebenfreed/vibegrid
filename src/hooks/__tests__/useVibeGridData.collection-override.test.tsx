/* @vitest-environment jsdom */

/**
 * GH#3335 — relationship-name projection on the `collectionOverride` path.
 *
 * The PaymentCycle hub's "Waiver Requests" tab renders its grid with
 * `skipDataFetching` + `collectionOverride` (rows it fetched itself rather than
 * read from the substrate). That path used to push rows straight to `setRows`
 * with no relationship-name projection, so the badge-list renderer's Path 1
 * (`colId__rel`) was empty and Path 2 (`getExistingEntityCollection`) is dead
 * post-GH#3119 — every vendor chip rendered `#947597`, the tail of the target
 * UUID, permanently. The substrate path resolved the same rows to
 * "GB Fence Company".
 *
 * Lives in its own file rather than alongside the hydration-gate tests: that
 * suite has an order-dependent case (`leaves the warm path untouched`) that
 * only passes at a particular position in the file, and appending to it flips
 * that case red for reasons unrelated to either test.
 */

import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UseEntityGridResult } from '@/shared/data/hooks/useEntityGrid'

// -------------------- Hoisted spies --------------------

const { gridResultRef, targetsRef } = vi.hoisted(() => ({
  gridResultRef: {
    current: {
      rows: [],
      total: 0,
      viewport: { start: 0, end: 0 },
      isLoading: false,
      isStale: false,
      isWarm: false,
      error: null,
      source: 'empty',
    } as UseEntityGridResult,
  },
  targetsRef: {
    current: new Map<string, Map<string, Record<string, unknown>>>(),
  },
}))

// -------------------- Mocks --------------------

vi.mock('@/shared/data/hooks/useEntityGrid', () => ({
  useEntityGrid: vi.fn(() => gridResultRef.current),
}))

/**
 * The relationship-target fetch engine behind `useGridRelationshipProjection`.
 * Stubbed so the projection resolves names without network — what is under test
 * is WHETHER the override path projects at all, not how targets are fetched.
 */
vi.mock('@/shared/data/hooks/useRelationshipTargetRecords', () => ({
  useRelationshipTargetRecords: vi.fn(() => targetsRef.current),
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
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() }),
}))

import { useVibeGridData } from '../useVibeGridData'

// -------------------- Helpers --------------------

const REL_COL = 'rel__lien_waiver_request__company_relates_tos'

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

function makeTableCoreStore(columns: any[]) {
  return {
    setRows: vi.fn(),
    setSparseRows: vi.fn(),
    processedRows: [] as any[],
    columns,
  }
}

function makeVisualStateStore() {
  return { sortBy: [], filters: [], filterGroup: null, globalSearchText: '' }
}

function renderWithOverride(
  entityType: string,
  columns: any[],
  items: Array<Record<string, unknown>>,
) {
  const tableCoreStore = makeTableCoreStore(columns)
  renderHook(() =>
    useVibeGridData(
      entityType,
      tableCoreStore as any,
      makeVisualStateStore() as any,
      makeInitStore() as any,
      { skip: true, collectionOverride: { items, count: items.length } },
    ),
  )
  return tableCoreStore
}

/** Last row array handed to `setRows`. */
function pushedRows(store: ReturnType<typeof makeTableCoreStore>) {
  const calls = store.setRows.mock.calls
  expect(calls.length).toBeGreaterThan(0)
  return calls.at(-1)![0] as Array<Record<string, unknown>>
}

// -------------------- Tests --------------------

describe('useVibeGridData — collectionOverride relationship projection', () => {
  const REL_COLUMNS = [
    { id: 'sent_at' },
    {
      id: REL_COL,
      relationshipTargetEntity: 'Company',
      relationshipDisplayField: 'company_name',
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    targetsRef.current = new Map([
      [
        'Company',
        new Map([['company-1', { id: 'company-1', company_name: 'GB Fence Company' }]]),
      ],
    ])
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('attaches colId__rel name pairs so chips render names, not id suffixes', () => {
    const store = renderWithOverride('LienWaiverRequest', REL_COLUMNS, [
      { id: 'lwr-1', sent_at: '2026-08-18T10:37:23Z', [REL_COL]: ['company-1'] },
    ])

    const rows = pushedRows(store)
    expect(rows).toHaveLength(1)
    // The projection is additive: the row keeps its flat shape, its id, and
    // its raw relationship ids — it only GAINS the resolved pairs.
    expect(rows[0].id).toBe('lwr-1')
    expect(rows[0].sent_at).toBe('2026-08-18T10:37:23Z')
    expect(rows[0][REL_COL]).toEqual(['company-1'])
    expect(rows[0][`${REL_COL}__rel`]).toEqual([
      { id: 'company-1', name: 'GB Fence Company' },
    ])
  })

  it('keeps the pair with an empty name when the target has not loaded yet', () => {
    targetsRef.current = new Map()
    const store = renderWithOverride('LienWaiverRequest', REL_COLUMNS, [
      { id: 'lwr-1', [REL_COL]: ['company-1'] },
    ])

    // `id` present keeps the badge navigable; the renderer falls back to the id
    // suffix for this paint and repaints when the fetch lands.
    expect(pushedRows(store)[0][`${REL_COL}__rel`]).toEqual([
      { id: 'company-1', name: '' },
    ])
  })

  it('passes rows through unchanged when the grid has no relationship columns', () => {
    const store = renderWithOverride('PaymentLine', [{ id: 'amount' }], [
      { id: 'pl-1', amount: 100 },
    ])

    expect(pushedRows(store)).toEqual([{ id: 'pl-1', amount: 100 }])
  })
})
