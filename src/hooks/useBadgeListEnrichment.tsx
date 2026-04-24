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
 *       into tableCoreStore.setRelationshipBadges(...)
 * - badge-list-live DOM renderer reads from the synchronous MobX cache at
 *   render time. MobX reactions on the observable map trigger re-renders when
 *   badge data changes.
 */

import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { useLiveQuery } from '@tanstack/react-db'
import { useEntityCollection } from '@/shared/data/db/hooks/useEntityCollection'
import { getLogger } from '@/shared/lib/logging'
import type { TableCoreStore } from '../stores/TableCoreStore'
import type { Column } from '../types'

const logger = getLogger(['vibegrid', 'hooks', 'useBadgeListEnrichment'])

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

  // Read all edges from the Rel_* collection reactively
  const { data: edges = [] } = useLiveQuery(
    (q: any) => {
      if (!edgeCollection) return undefined
      return q.from({ entity: edgeCollection }).select(({ entity }: any) => ({ ...entity }))
    },
    [edgeCollection],
  )

  // Read all target records reactively so we can resolve ids → names.
  // We don't filter here — the target collection is shared across many edges.
  const { data: targetRecords = [] } = useLiveQuery(
    (q: any) => {
      if (!targetCollection) return undefined
      return q.from({ entity: targetCollection }).select(({ entity }: any) => ({ ...entity }))
    },
    [targetCollection],
  )

  useEffect(() => {
    // Build quick lookup for target names.
    const nameById = new Map<string, string>()
    for (const record of targetRecords as Array<Record<string, unknown>>) {
      const id = record?.id as string | undefined
      if (!id) continue
      // Resolve display name using the same fallback chain as getRecordDisplayName
      // (entity-name-utils.ts). Entity types vary: Company/Project use display_name,
      // Submittal/RFI use title, File/Drawing use name.
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
    const selectKey = direction === 'source' ? 'target_entity_id' : 'source_entity_id'

    const byAnchor = new Map<string, string[]>()

    for (const edge of edges as Array<Record<string, unknown>>) {
      const anchorId = edge?.[filterKey] as string | undefined
      const oppositeId = edge?.[selectKey] as string | undefined
      if (!anchorId || !oppositeId) continue

      const resolvedName = nameById.get(oppositeId) ?? '\u2026' // '…' placeholder
      const list = byAnchor.get(anchorId)
      if (list) {
        list.push(resolvedName)
      } else {
        byAnchor.set(anchorId, [resolvedName])
      }
    }

    // Write current anchors to the store.
    for (const [anchorId, names] of byAnchor.entries()) {
      tableCoreStore.setRelationshipBadges(relationshipEntity, direction, anchorId, names)
    }

    // Clear stale anchors: previously-written anchors that no longer have edges.
    for (const prevAnchor of prevAnchorsRef.current) {
      if (!byAnchor.has(prevAnchor)) {
        tableCoreStore.setRelationshipBadges(relationshipEntity, direction, prevAnchor, [])
      }
    }
    prevAnchorsRef.current = new Set(byAnchor.keys())

    logger.debug('Badge-list enrichment synced', {
      relationshipEntity,
      direction,
      targetEntityType,
      edgeCount: edges.length,
      anchorCount: byAnchor.size,
      targetCount: targetRecords.length,
    })
  }, [edges, targetRecords, direction, relationshipEntity, targetEntityType, tableCoreStore])

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
