/**
 * GH#2651 P1.3 — useBadgeListEnrichment bridge tests
 *
 * GH#2758 perf hardening: bridge now batches all per-anchor writes through
 * setRelationshipBadgesBulk and queues the work in a microtask to coalesce
 * cursor-pagination bursts. Tests must flush microtasks before asserting.
 *
 * Focus:
 *   - Cache hit: bridge writes resolved names to the store
 *   - Missing target: unresolved id appears as ellipsis placeholder
 *   - Empty edges: no anchor entries written (nothing to resolve)
 *   - Deleted edge: re-render writes remaining names only
 *   - GH#2758: many anchors collapse into one bulk write per pass
 *
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import type { TableCoreStore } from '../../stores/TableCoreStore'

// -------------------- Mocks -------------------- //

// Hoisted per-test state so the mocked useLiveQuery can return different rows
// for the (edges) vs (targets) collections.
type LiveQueryState = {
  edges: Array<Record<string, unknown>>
  targets: Array<Record<string, unknown>>
}

const liveQueryState: LiveQueryState = {
  edges: [],
  targets: [],
}

// useEntityCollection returns a tagged sentinel so the useLiveQuery mock can
// disambiguate which dataset to return.
const edgeCollectionSentinel = { __kind: 'edges' } as any
const targetCollectionSentinel = { __kind: 'targets' } as any

vi.mock('@/shared/data/db/hooks/useEntityCollection', () => ({
  useEntityCollection: (entityName: string) => {
    if (entityName.startsWith('Rel_')) return edgeCollectionSentinel
    return targetCollectionSentinel
  },
}))

vi.mock('@tanstack/react-db', () => ({
  // useLiveQuery's first arg is a callback that invokes q.from(...).select(...).
  // We inspect the collection passed into from() to decide which dataset to
  // return from liveQueryState.
  useLiveQuery: (cb: (q: any) => any) => {
    let kind: 'edges' | 'targets' | null = null
    const selectObj = {
      select: (_sel: (row: any) => any) => ({}),
      where: (_pred: any): any => selectObj,
    }
    const q = {
      from: (entry: Record<string, any>) => {
        const coll = Object.values(entry)[0] as any
        kind = coll?.__kind ?? null
        return selectObj
      },
    }
    // Invoke the callback so the hook exercises the select path.
    cb(q)
    return {
      data:
        kind === 'edges'
          ? liveQueryState.edges
          : kind === 'targets'
            ? liveQueryState.targets
            : [],
    }
  },
}))

// -------------------- Under test -------------------- //

import { useBadgeListEnrichment } from '../useBadgeListEnrichment'

// -------------------- Helpers -------------------- //

const REL_ENTITY = 'Rel_CertificateOfInsurance_Project_belongs_to'
const ELLIPSIS_CHAR = '…' // ellipsis placeholder for unresolved names

function makeStore() {
  const badges = new Map<string, string[]>()
  const readySet = new Set<string>()
  const store = {
    columns: [
      {
        id: 'coi_relations',
        field: 'coi_relations',
        cellType: 'badge-list-live',
        relationshipConfig: {
          relationshipEntity: REL_ENTITY,
          direction: 'target' as const,
          targetEntityType: 'CertificateOfInsurance',
        },
      } as any,
    ],
    setRelationshipBadges: vi.fn(
      (relationshipEntity: string, direction: 'source' | 'target', anchorId: string, names: string[]) => {
        const key = `${relationshipEntity.toLowerCase()}:${direction}:${anchorId}`
        badges.set(key, names)
      },
    ),
    // GH#2758: bridge now batches all per-anchor writes into a single bulk call
    // so the downstream MobX reaction fires once per pass instead of once per
    // anchor. Mirrors the same key shape as setRelationshipBadges.
    setRelationshipBadgesBulk: vi.fn(
      (
        entries: Iterable<{
          relationshipEntity: string
          direction: 'source' | 'target'
          anchorId: string
          names: string[]
        }>,
      ) => {
        for (const { relationshipEntity, direction, anchorId, names } of entries) {
          const key = `${relationshipEntity.toLowerCase()}:${direction}:${anchorId}`
          badges.set(key, names)
        }
      },
    ),
    getRelationshipBadges: (
      relationshipEntity: string,
      direction: 'source' | 'target',
      anchorId: string,
    ) => {
      const key = `${relationshipEntity.toLowerCase()}:${direction}:${anchorId}`
      return badges.get(key)
    },
    markRelationshipBadgesReady: vi.fn(
      (relationshipEntity: string, direction: 'source' | 'target') => {
        readySet.add(`${relationshipEntity.toLowerCase()}:${direction}`)
      },
    ),
    isRelationshipBadgesReady: (relationshipEntity: string, direction: 'source' | 'target') => {
      return readySet.has(`${relationshipEntity.toLowerCase()}:${direction}`)
    },
  }
  return store as unknown as TableCoreStore & {
    setRelationshipBadges: ReturnType<typeof vi.fn>
    setRelationshipBadgesBulk: ReturnType<typeof vi.fn>
    markRelationshipBadgesReady: ReturnType<typeof vi.fn>
  }
}

function Harness({ store }: { store: TableCoreStore | null }) {
  const bridges = useBadgeListEnrichment(store)
  return <>{bridges}</>
}

// GH#2758: bridge effect work is queued via queueMicrotask. Tests must flush
// the microtask queue before asserting on store state.
async function flushMicrotasks(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

// -------------------- Tests -------------------- //

describe('useBadgeListEnrichment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    liveQueryState.edges = []
    liveQueryState.targets = []
  })

  it('cache hit: writes resolved target names per anchor id', async () => {
    const store = makeStore()
    liveQueryState.edges = [
      // project-1 has two COIs attached (via target direction: anchor = target)
      { id: 'e1', source_entity_id: 'coi-a', target_entity_id: 'project-1' },
      { id: 'e2', source_entity_id: 'coi-b', target_entity_id: 'project-1' },
    ]
    liveQueryState.targets = [
      { id: 'coi-a', name: 'Acme COI' },
      { id: 'coi-b', name: 'Beta COI' },
    ]

    render(<Harness store={store} />)
    await flushMicrotasks()

    const names = store.getRelationshipBadges(REL_ENTITY, 'target', 'project-1')
    // direction=target → filterKey='target_entity_id', selectKey='source_entity_id'.
    // Anchor key is project-1; resolved names come from coi-a/coi-b.
    expect(names).toEqual(['Acme COI', 'Beta COI'])
    // GH#2758: bridge funnels writes through setRelationshipBadgesBulk now;
    // setRelationshipBadges remains for single-key real-time edits but is
    // unused by the bridge fan-out path.
    expect(store.setRelationshipBadgesBulk).toHaveBeenCalled()
    expect(store.setRelationshipBadges).not.toHaveBeenCalled()
  })

  it('missing target: unresolved id renders as ellipsis placeholder', async () => {
    const store = makeStore()
    liveQueryState.edges = [{ id: 'e1', source_entity_id: 'coi-unknown', target_entity_id: 'project-1' }]
    liveQueryState.targets = [] // empty target collection

    render(<Harness store={store} />)
    await flushMicrotasks()

    const names = store.getRelationshipBadges(REL_ENTITY, 'target', 'project-1')
    expect(names).toEqual([ELLIPSIS_CHAR])
  })

  it('empty edges: no anchor entries written', async () => {
    const store = makeStore()
    liveQueryState.edges = []
    liveQueryState.targets = [{ id: 'coi-a', name: 'Acme' }]

    render(<Harness store={store} />)
    await flushMicrotasks()

    // GH#2758: nothing to anchor → bulk call still happens exactly once
    // (with zero entries) so badgeDataVersion is not bumped and
    // ObserverManager doesn't repaint for an empty pass.
    expect(store.setRelationshipBadges).not.toHaveBeenCalled()
    expect(store.setRelationshipBadgesBulk).toHaveBeenCalledTimes(1)
    expect(store.getRelationshipBadges(REL_ENTITY, 'target', 'project-1')).toBeUndefined()
  })

  it('deleted edge: re-render writes remaining names only', async () => {
    const store = makeStore()
    liveQueryState.edges = [
      { id: 'e1', source_entity_id: 'coi-a', target_entity_id: 'project-1' },
      { id: 'e2', source_entity_id: 'coi-b', target_entity_id: 'project-1' },
    ]
    liveQueryState.targets = [
      { id: 'coi-a', name: 'Acme COI' },
      { id: 'coi-b', name: 'Beta COI' },
    ]

    const { rerender } = render(<Harness store={store} />)
    await flushMicrotasks()

    expect(store.getRelationshipBadges(REL_ENTITY, 'target', 'project-1')).toEqual([
      'Acme COI',
      'Beta COI',
    ])

    // Simulate Rel_* mutation: e2 is removed.
    liveQueryState.edges = [{ id: 'e1', source_entity_id: 'coi-a', target_entity_id: 'project-1' }]

    rerender(<Harness store={store} />)
    await flushMicrotasks()

    expect(store.getRelationshipBadges(REL_ENTITY, 'target', 'project-1')).toEqual(['Acme COI'])
  })

  it('display_name fallback: resolves targets with display_name when name is null', async () => {
    const store = makeStore()
    liveQueryState.edges = [
      { id: 'e1', source_entity_id: 'company-a', target_entity_id: 'project-1' },
      { id: 'e2', source_entity_id: 'company-b', target_entity_id: 'project-1' },
    ]
    liveQueryState.targets = [
      // Company entities have name:null but display_name populated
      { id: 'company-a', name: null, display_name: 'DEB Construction LLC' },
      { id: 'company-b', display_name: 'Acme Plumbing Inc' },
    ]

    render(<Harness store={store} />)
    await flushMicrotasks()

    const names = store.getRelationshipBadges(REL_ENTITY, 'target', 'project-1')
    expect(names).toEqual(['DEB Construction LLC', 'Acme Plumbing Inc'])
  })

  it('marks bridge as ready after first pass (empty edges still marks ready)', async () => {
    const store = makeStore()
    liveQueryState.edges = []
    liveQueryState.targets = []

    render(<Harness store={store} />)
    await flushMicrotasks()

    // Even with zero edges the bridge should mark itself as ready so the
    // renderer shows em-dash (empty) instead of ellipsis (loading).
    expect(store.markRelationshipBadgesReady).toHaveBeenCalledWith(REL_ENTITY, 'target')
  })

  it('total edge deletion: clears stale anchor badges to empty array', async () => {
    const store = makeStore()
    liveQueryState.edges = [{ id: 'e1', source_entity_id: 'coi-a', target_entity_id: 'project-1' }]
    liveQueryState.targets = [{ id: 'coi-a', name: 'Acme COI' }]

    const { rerender } = render(<Harness store={store} />)
    await flushMicrotasks()

    expect(store.getRelationshipBadges(REL_ENTITY, 'target', 'project-1')).toEqual(['Acme COI'])

    // Simulate ALL edges for project-1 being removed.
    liveQueryState.edges = []

    rerender(<Harness store={store} />)
    await flushMicrotasks()

    // Empty array (not undefined) for the previously-written anchor — included
    // in the same batched call.
    expect(store.getRelationshipBadges(REL_ENTITY, 'target', 'project-1')).toEqual([])
  })

  it('GH#2758: many anchors in one pass produce a single bulk write', async () => {
    const store = makeStore()
    // 100 distinct anchor IDs, each with one edge.
    liveQueryState.edges = Array.from({ length: 100 }, (_, i) => ({
      id: `e${i}`,
      source_entity_id: `coi-${i}`,
      target_entity_id: `project-${i}`,
    }))
    liveQueryState.targets = Array.from({ length: 100 }, (_, i) => ({
      id: `coi-${i}`,
      name: `COI ${i}`,
    }))

    render(<Harness store={store} />)
    await flushMicrotasks()

    // The whole pass funnels through ONE setRelationshipBadgesBulk call —
    // not 100 individual setRelationshipBadges calls. This is the freeze fix.
    expect(store.setRelationshipBadgesBulk).toHaveBeenCalledTimes(1)
    expect(store.setRelationshipBadges).not.toHaveBeenCalled()

    // Spot-check three anchors made it through the bulk write.
    expect(store.getRelationshipBadges(REL_ENTITY, 'target', 'project-0')).toEqual(['COI 0'])
    expect(store.getRelationshipBadges(REL_ENTITY, 'target', 'project-50')).toEqual(['COI 50'])
    expect(store.getRelationshipBadges(REL_ENTITY, 'target', 'project-99')).toEqual(['COI 99'])
  })
})
