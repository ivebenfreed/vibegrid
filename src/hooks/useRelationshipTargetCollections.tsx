/**
 * useRelationshipTargetCollections - Preload + subscribe target entity collections
 *
 * GH#2786 (F') follow-up: The static `badge-list` renderer
 * (`slots/renderers/badge-list.ts`) calls `getExistingEntityCollection` to
 * resolve target IDs to display names. That lookup is read-only and
 * synchronous — it returns `null` if the collection hasn't been registered
 * yet, and the renderer falls through to the raw UUID.
 *
 * On a page like `/entities/RFI`, only the RFI collection is loaded by
 * `useVibeGridData`. Relationship columns whose `relationshipTargetEntity`
 * points at a different entity (e.g., Project) never had their collection
 * registered or subscribed, so badges rendered the bare UUID.
 *
 * Strategy: render one invisible bridge component per unique
 * `relationshipTargetEntity` referenced by the current columns. Each bridge
 *   1. registers the singleton collection (idempotent), and
 *   2. subscribes via `useLiveQuery`, which is what actually triggers the
 *      TanStack DB → SQLite + network data flow.
 * When the first batch of target records arrives, the bridge bumps
 * `tableCoreStore.configVersion` once so the static renderer re-runs and
 * resolves IDs to names. Subsequent updates keep `getExistingEntityCollection`
 * populated; the badge-list renderer reads it directly.
 *
 * The renderer itself (`badge-list.ts`) is unchanged — we only populate the
 * cache and nudge the grid to repaint after the first batch lands.
 */

import React, { useEffect, useMemo, useRef } from 'react'
import { useLiveQuery } from '@tanstack/react-db'
import { useEntityCollection } from '@/shared/data/db/hooks/useEntityCollection'
import { getLogger } from '@/shared/lib/logging'
import type { TableCoreStore } from '../stores/TableCoreStore'
import type { Column } from '../types'

const logger = getLogger(['vibegrid', 'hooks', 'useRelationshipTargetCollections'])

/**
 * Bridge component that registers + subscribes a single target entity
 * collection so the badge-list renderer can resolve IDs to display names.
 *
 * Renders nothing — purely a data bridge.
 */
function RelationshipTargetBridge({
  targetEntityType,
  tableCoreStore,
}: {
  targetEntityType: string
  tableCoreStore: TableCoreStore
}) {
  // Registers the singleton + subscribes the live query (idempotent).
  // useEntityCollection handles system-entity dispatch (Member, PlatformUser,
  // PlatformOrganization) internally.
  const collection = useEntityCollection(targetEntityType)

  // Subscribing via useLiveQuery is what actually triggers the underlying
  // TanStack DB → SQLite + network bootstrap. Without a subscription the
  // collection sits idle and `collection.get(id)` returns undefined.
  const { data: records = [] } = useLiveQuery(
    (q: any) => {
      if (!collection) return undefined
      return q.from({ entity: collection }).select(({ entity }: any) => ({ id: entity.id }))
    },
    [collection],
  )

  // Bump configVersion exactly once — when the first batch of target records
  // becomes visible. The static badge-list renderer then re-runs and resolves
  // IDs to names. Further updates keep the collection populated; the renderer
  // reads it on the next natural re-render.
  const bumpedRef = useRef(false)
  useEffect(() => {
    if (bumpedRef.current) return
    if (records.length === 0) return

    bumpedRef.current = true
    tableCoreStore.incrementConfigVersion()
    logger.debug('Relationship target collection populated; nudged grid repaint', {
      targetEntityType,
      recordCount: records.length,
    })
  }, [records.length, tableCoreStore, targetEntityType])

  return null
}

const MemoizedBridge = React.memo(RelationshipTargetBridge)

/**
 * Extract unique `relationshipTargetEntity` names from the current column
 * set. Empty entries are skipped.
 */
function getTargetEntityTypes(columns: Column[]): string[] {
  const targets = new Set<string>()

  for (const col of columns) {
    const target = (col as { relationshipTargetEntity?: string | null }).relationshipTargetEntity
    if (typeof target === 'string' && target.length > 0) {
      targets.add(target)
    }
  }

  return Array.from(targets).sort()
}

/**
 * Hook that returns bridge elements for every relationship target entity
 * referenced by the supplied tableCoreStore's columns. Render the returned
 * ReactNode in the JSX tree. When called with no columns or no
 * tableCoreStore the hook returns null.
 */
export function useRelationshipTargetCollections(tableCoreStore: TableCoreStore | null): React.ReactNode {
  const columns = tableCoreStore?.columns ?? []
  const targetEntityTypes = useMemo(() => getTargetEntityTypes(columns), [columns])

  useEffect(() => {
    if (targetEntityTypes.length > 0) {
      logger.info('Relationship target collection bridges active', {
        targetEntityTypes,
        columnCount: columns.length,
      })
    }
  }, [targetEntityTypes, columns.length])

  if (!tableCoreStore || targetEntityTypes.length === 0) {
    return null
  }

  return (
    <>
      {targetEntityTypes.map((entityType) => (
        <MemoizedBridge key={entityType} targetEntityType={entityType} tableCoreStore={tableCoreStore} />
      ))}
    </>
  )
}
