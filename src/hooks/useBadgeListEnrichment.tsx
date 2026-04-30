/**
 * useBadgeListEnrichment - Reactive bridge for relationship badge rendering
 *
 * GH#2651 P1.3: Bridges TanStack DB Rel_* + target entity collections →
 * tableCoreStore.relationshipBadgeData (MobX) so that badge-list-live cells
 * update reactively when Rel_* edges or target entities change.
 *
 * Architecture (parallel to useEntityReferenceData):
 * - Scans grid columns for `cellType === 'badge-list-live'`
 * - Extracts unique `(relationshipEntity, direction, targetEntityType)` triples
 *   from `column.relationshipConfig`
 * - For each triple, renders a memoized RelationshipBadgeBridge component
 * - Each bridge:
 *     - useEntityCollection(relationshipEntity) — the Rel_* edge collection
 *     - useEntityCollection(targetEntityType)   — the target display-name source
 *     - useLiveQuery reads rows from the Rel_* collection
 *     - Groups edges by anchor id (source_entity_id or target_entity_id
 *       depending on direction), resolves each opposite-side id to a name via
 *       the target collection, and writes the resulting name[] per anchor id
 *       into tableCoreStore.setRelationshipBadgesBulk(...) (one batched write)
 * - badge-list-live DOM renderer reads from the synchronous MobX cache at
 *   render time. MobX reactions on the observable map trigger re-renders when
 *   badge data changes.
 *
 * GH#2758 perf hardening (vs. earlier GH#2651 P1.3 implementation):
 * - Edge useLiveQuery projects only the two id columns we need (no row spread)
 * - useEffect work is queued via queueMicrotask and coalesced — bursts of
 *   emissions during cursor pagination collapse into a single recompute pass
 * - All per-anchor MobX writes funnel through setRelationshipBadgesBulk so the
 *   downstream ObserverManager grid-repaint reaction fires once per pass
 *   instead of once per anchor
 */

import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { eq, or } from '@tanstack/db'
import { useLiveQuery } from '@tanstack/react-db'
import { useEntityCollection } from '@/shared/data/db/hooks/useEntityCollection'
import { getLogger } from '@/shared/lib/logging'
import type { TableCoreStore } from '../stores/TableCoreStore'
import type { Column } from '../types'

const logger = getLogger(['vibegrid', 'hooks', 'useBadgeListEnrichment'])

const ELLIPSIS = '…' // unresolved-name placeholder

interface BadgeBridgeSpec {
  relationshipEntity: string
  direction: 'source' | 'target'
  targetEntityType: string
}

/**
 * Bridge component for one relationship/direction/target triple.
 * Reactively joins Rel_* edges → target entity names and writes the result
 * into tableCoreStore.relationshipBadgeData.
 *
 * Renders nothing — purely a data bridge.
 */
function RelationshipBadgeBridge({
  relationshipEntity,
  direction,
  targetEntityType,
  tableCoreStore,
}: {
  relationshipEntity: string
  direction: 'source' | 'target'
  targetEntityType: string
  tableCoreStore: TableCoreStore
}) {
  const edgeCollection = useEntityCollection(relationshipEntity)
  const targetCollection = useEntityCollection(targetEntityType)

  // Track previously-written anchor IDs to clear stale entries when all edges
  // for an anchor are deleted (GH#2651 review fix).
  const prevAnchorsRef = useRef<Set<string>>(new Set())

  // Read all edges from the Rel_* collection reactively.
  // GH#2758: project ONLY the two id columns we need — the previous
  // `select(({entity}) => ({...entity}))` spread allocated an object per edge
  // on every emission, including during cursor pagination of large Rel_*
  // collections (e.g. DEB has 47k+ DailyLog edges). Narrow projection cuts
  // the per-emission allocation cost dramatically.
  const { data: edges = [] } = useLiveQuery(
    (q: any) => {
      if (!edgeCollection) return undefined
      return q.from({ entity: edgeCollection }).select(({ entity }: any) => ({
        source_entity_id: entity.source_entity_id,
        target_entity_id: entity.target_entity_id,
      }))
    },
    [edgeCollection],
  )

  // Extract the set of target IDs we actually need from the edges.
  // This prevents materializing the entire target collection (e.g., 263K File
  // records) into JS objects — we only need the handful referenced by edges.
  const selectKey = direction === 'source' ? 'target_entity_id' : 'source_entity_id'
  const neededTargetIds = useMemo(() => {
    const ids = new Set<string>()
    for (const edge of edges as Array<Record<string, unknown>>) {
      const id = edge?.[selectKey] as string | undefined
      if (id) ids.add(id)
    }
    return ids
  }, [edges, selectKey])

  // Read only the target records whose IDs appear in the edges.
  // CRITICAL: Without this filter, collections like File (263K records) are
  // fully materialized into JS arrays on every change event, causing Chrome
  // tab crashes. Uses TanStack DB query builder (eq/or) — raw JS booleans
  // are rejected by .where().
  const { data: targetRecords = [] } = useLiveQuery(
    (q: any) => {
      if (!targetCollection || neededTargetIds.size === 0) return undefined
      const ids = Array.from(neededTargetIds)
      const query = q.from({ entity: targetCollection })
      // Build or(eq(id, x), eq(id, y), ...) filter for only the IDs we need
      if (ids.length === 1) {
        return query
          .where(({ entity }: any) => eq(entity.id, ids[0]))
          .select(({ entity }: any) => ({ ...entity }))
      }
      // or() requires 2+ args; build the chain from the eq() expressions
      return query
        .where(({ entity }: any) => {
          const conds = ids.map((id) => eq(entity.id, id))
          return or(conds[0], conds[1], ...conds.slice(2))
        })
        .select(({ entity }: any) => ({ ...entity }))
    },
    [targetCollection, neededTargetIds],
  )

  // GH#2758: coalesce repeated effect runs during cursor pagination.
  // Each Rel_* collection page emits a new `edges` array reference, and each
  // page also retriggers the second useLiveQuery on `targetRecords`. Without
  // coalescing, a 50-page Rel_DailyLog_Project bootstrap fires this effect
  // ~50 times per bridge × 9 bridges = ~450 full O(edges + anchors) passes
  // during initial load — saturating the main thread. queueMicrotask
  // coalesces bursts that arrive in the same tick into a single recompute.
  const pendingRunRef = useRef(false)

  useEffect(() => {
    if (pendingRunRef.current) return
    pendingRunRef.current = true

    queueMicrotask(() => {
      pendingRunRef.current = false

      // Build quick lookup for target names.
      const nameById = new Map<string, string>()
      for (const record of targetRecords as Array<Record<string, unknown>>) {
        const id = record?.id as string | undefined
        if (!id) continue
        // Resolve display name using the same fallback chain as
        // getRecordDisplayName (entity-name-utils.ts). Entity types vary:
        // Company/Project use display_name, Submittal/RFI use title,
        // File/Drawing use name.
        const name =
          (record.display_name as string | undefined) ??
          (record.name as string | undefined) ??
          (record.title as string | undefined) ??
          null
        if (name != null && String(name).trim()) {
          nameById.set(id, String(name))
        }
      }

      // Group edges by anchor id (the side that matches the grid row id).
      const filterKey = direction === 'source' ? 'source_entity_id' : 'target_entity_id'
      const byAnchor = new Map<string, string[]>()

      for (const edge of edges as Array<Record<string, unknown>>) {
        const anchorId = edge?.[filterKey] as string | undefined
        const oppositeId = edge?.[selectKey] as string | undefined
        if (!anchorId || !oppositeId) continue

        const resolvedName = nameById.get(oppositeId) ?? ELLIPSIS
        const list = byAnchor.get(anchorId)
        if (list) {
          list.push(resolvedName)
        } else {
          byAnchor.set(anchorId, [resolvedName])
        }
      }

      // GH#2758: collect all writes into one batched MobX transaction.
      // Previously each setRelationshipBadges call bumped badgeDataVersion,
      // which triggers a full grid repaint via ObserverManager. Hundreds of
      // anchors × multiple bridges × multiple page emissions produced
      // thousands of full repaints — the root cause of the freeze.
      const entries: Array<{
        relationshipEntity: string
        direction: 'source' | 'target'
        anchorId: string
        names: string[]
      }> = []

      for (const [anchorId, names] of byAnchor.entries()) {
        entries.push({ relationshipEntity, direction, anchorId, names })
      }

      // Clear stale anchors: previously-written anchors that no longer have
      // edges — included in the same batched write.
      for (const prevAnchor of prevAnchorsRef.current) {
        if (!byAnchor.has(prevAnchor)) {
          entries.push({ relationshipEntity, direction, anchorId: prevAnchor, names: [] })
        }
      }
      prevAnchorsRef.current = new Set(byAnchor.keys())

      tableCoreStore.setRelationshipBadgesBulk(entries)

      // Signal that this (relationshipEntity, direction) has completed its
      // first pass. The renderer uses this to show '—' (em-dash, empty)
      // instead of '…' (ellipsis, loading) for anchors with zero edges.
      tableCoreStore.markRelationshipBadgesReady(relationshipEntity, direction)

      logger.debug('Badge-list enrichment synced', {
        relationshipEntity,
        direction,
        targetEntityType,
        edgeCount: edges.length,
        anchorCount: byAnchor.size,
        targetCount: targetRecords.length,
        writeCount: entries.length,
      })
    })
  }, [edges, targetRecords, direction, selectKey, relationshipEntity, targetEntityType, tableCoreStore])

  return null
}

// Intentionally NOT wrapped in React.memo: the reactive data lives inside
// useLiveQuery hooks, and memoizing by prop identity would skip re-renders
// when edges/target records mutate. React's default re-render cycle is fine
// here — the bridge renders `null`, so there is no DOM cost.

/**
 * Extract unique (relationshipEntity, direction, targetEntityType) triples from
 * badge-list-live columns.
 */
function getBadgeListLiveSpecs(columns: Column[]): BadgeBridgeSpec[] {
  const seen = new Set<string>()
  const specs: BadgeBridgeSpec[] = []

  for (const col of columns) {
    const cellType = (col.cellType || (col as any).type) as string
    if (cellType !== 'badge-list-live') continue

    const cfg = (col as any).relationshipConfig as
      | {
          relationshipEntity?: string
          direction?: 'source' | 'target'
          targetEntityType?: string
        }
      | undefined
    if (!cfg) continue

    const { relationshipEntity, direction, targetEntityType } = cfg
    if (!relationshipEntity || !direction || !targetEntityType) continue

    const key = `${relationshipEntity}:${direction}:${targetEntityType}`
    if (seen.has(key)) continue
    seen.add(key)
    specs.push({ relationshipEntity, direction, targetEntityType })
  }

  return specs
}

/**
 * Hook that returns bridge elements for all badge-list-live columns in the grid.
 * Call in VibeGrid and render the returned ReactNode in the JSX tree.
 */
export function useBadgeListEnrichment(tableCoreStore: TableCoreStore | null): ReactNode {
  const columns = tableCoreStore?.columns ?? []

  const specs = useMemo(() => getBadgeListLiveSpecs(columns), [columns])

  useEffect(() => {
    if (specs.length > 0) {
      logger.info('Badge-list-live bridges active', {
        specCount: specs.length,
        specs,
        columnCount: columns.length,
      })
    }
  }, [specs, columns.length])

  if (!tableCoreStore || specs.length === 0) {
    return null
  }

  return (
    <>
      {specs.map((spec) => (
        <RelationshipBadgeBridge
          key={`${spec.relationshipEntity}:${spec.direction}:${spec.targetEntityType}`}
          relationshipEntity={spec.relationshipEntity}
          direction={spec.direction}
          targetEntityType={spec.targetEntityType}
          tableCoreStore={tableCoreStore}
        />
      ))}
    </>
  )
}
