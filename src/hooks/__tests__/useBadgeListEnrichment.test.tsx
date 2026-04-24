/**
 * GH#2651 P1.3 — useBadgeListEnrichment bridge tests
 *
 * Focus:
 *   - Cache hit: bridge writes resolved names to the store
 *   - Missing target: unresolved id appears as '…' placeholder
 *   - Empty edges: no anchor entries written (nothing to resolve)
 *   - Deleted edge: re-render writes remaining names only
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
    const q = {
      from: (entry: Record<string, any>) => {
        const coll = Object.values(entry)[0] as any
        kind = coll?.__kind ?? null
        return {
          select: (_sel: (row: any) => any) => ({}),
        }
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
          relationshipEntity: 'Rel_CertificateOfInsurance_Project_belongs_to',
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
    markRelationshipBadgesReady: ReturnType<typeof vi.fn>
  }
}

function Harness({ store }: { store: TableCoreStore | null }) {
  const bridges = useBadgeListEnrichment(store)
  return <>{bridges}</>
}

// -------------------- Tests -------------------- //

describe('useBadgeListEnrichment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    liveQueryState.edges = []
    liveQueryState.targets = []
  })

  it('cache hit: writes resolved target names per anchor id', () => {
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

    const names = store.getRelationshipBadges(
      'Rel_CertificateOfInsurance_Project_belongs_to',
      'target',
      'project-1',
    )
    // direction=target means the renderer anchors on target_entity_id and the
    // opposite side (source_entity_id) is resolved — but our fixture sets
    // target_entity_id=project-1 so the anchor KEY is project-1 and the name
    // comes from source_entity_id (coi-a/coi-b).
    // Bridge code filter = `${direction}_entity_id`, so direction:'target' →
    // filterKey='target_entity_id', selectKey='source_entity_id'.
    expect(names).toEqual(['Acme COI', 'Beta COI'])
    expect(store.setRelationshipBadges).toHaveBeenCalled()
  })

  it('missing target: unresolved id renders as "…" placeholder', () => {
    const store = makeStore()
    liveQueryState.edges = [{ id: 'e1', source_entity_id: 'coi-unknown', target_entity_id: 'project-1' }]
    liveQueryState.targets = [] // empty target collection

    render(<Harness store={store} />)

    const names = store.getRelationshipBadges(
      'Rel_CertificateOfInsurance_Project_belongs_to',
      'target',
      'project-1',
    )
    expect(names).toEqual(['\u2026'])
  })

  it('empty edges: no anchor entries written', () => {
    const store = makeStore()
    liveQueryState.edges = []
    liveQueryState.targets = [{ id: 'coi-a', name: 'Acme' }]

    render(<Harness store={store} />)

    // Nothing to anchor → setRelationshipBadges never called for any id.
    expect(store.setRelationshipBadges).not.toHaveBeenCalled()
    expect(
      store.getRelationshipBadges('Rel_CertificateOfInsurance_Project_belongs_to', 'target', 'project-1'),
    ).toBeUndefined()
  })

  it('deleted edge: re-render writes remaining names only', () => {
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

    expect(
      store.getRelationshipBadges('Rel_CertificateOfInsurance_Project_belongs_to', 'target', 'project-1'),
    ).toEqual(['Acme COI', 'Beta COI'])

    // Simulate Rel_* mutation: e2 is removed.
    liveQueryState.edges = [{ id: 'e1', source_entity_id: 'coi-a', target_entity_id: 'project-1' }]

    rerender(<Harness store={store} />)

    expect(
      store.getRelationshipBadges('Rel_CertificateOfInsurance_Project_belongs_to', 'target', 'project-1'),
    ).toEqual(['Acme COI'])
  })

  it('display_name fallback: resolves targets with display_name when name is null', () => {
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

    const names = store.getRelationshipBadges(
      'Rel_CertificateOfInsurance_Project_belongs_to',
      'target',
      'project-1',
    )
    expect(names).toEqual(['DEB Construction LLC', 'Acme Plumbing Inc'])
  })

  it('marks bridge as ready after first pass (empty edges still marks ready)', () => {
    const store = makeStore()
    liveQueryState.edges = []
    liveQueryState.targets = []

    render(<Harness store={store} />)

    // Even with zero edges, the bridge should mark itself as ready
    // so the renderer shows '—' instead of '…'
    expect(store.markRelationshipBadgesReady).toHaveBeenCalledWith(
      'Rel_CertificateOfInsurance_Project_belongs_to',
      'target',
    )
  })

  it('total edge deletion: clears stale anchor badges to empty array', () => {
    const store = makeStore()
    liveQueryState.edges = [
      { id: 'e1', source_entity_id: 'coi-a', target_entity_id: 'project-1' },
    ]
    liveQueryState.targets = [{ id: 'coi-a', name: 'Acme COI' }]

    const { rerender } = render(<Harness store={store} />)

    expect(
      store.getRelationshipBadges('Rel_CertificateOfInsurance_Project_belongs_to', 'target', 'project-1'),
    ).toEqual(['Acme COI'])

    // Simulate ALL edges for project-1 being removed.
    liveQueryState.edges = []

    rerender(<Harness store={store} />)

    // Should write empty array (not undefined / stale) for the previously-written anchor.
    expect(
      store.getRelationshipBadges('Rel_CertificateOfInsurance_Project_belongs_to', 'target', 'project-1'),
    ).toEqual([])
  })
})
