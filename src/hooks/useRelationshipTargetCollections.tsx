/**
 * useRelationshipTargetCollections — Scoped by-ID fetch for relationship target collections
 *
 * The static `badge-list` renderer (`slots/renderers/badge-list.ts`) calls
 * `getExistingEntityCollection(target, orgId).get(id)` to resolve target
 * IDs to display names. The lookup is read-only: it returns `null`/`undefined`
 * if the record isn't cached.
 *
 * Earlier follow-ups attempted to populate the cache by subscribing the
 * entire target collection via `useLiveQuery`. That subscription triggers
 * the generic collection bootstrap (up to 50,000 records — see
 * `entity-collections.ts:ENTITY_COLLECTION_MAX_INITIAL_RECORDS`). On
 * cross-entity grids like `/entities/RFI` referencing Project (~3k) AND
 * Drawings (~42k) AND others, the bootstrap OOMs the tab.
 *
 * This bridge instead fetches **only the IDs that actually appear in the
 * current rows** via `data.query` with `whereAst.in`, then writes them into
 * the target collection via `utils.writeBatch / writeUpsert`. Once the
 * records are in the cache, `getExistingEntityCollection().get(id)` returns
 * them and the badge-list renderer's existing lookup works unchanged.
 *
 * The fetch is debounced so multiple cell render passes coalesce, and is
 * driven by a MobX reaction on `tableCoreStore.processedRows` so it re-runs
 * when filtering/sorting/pagination changes the visible row set.
 *
 * Member is a system entity with a separate factory path; we don't use the
 * by-ID batch path for it (it's naturally org-scoped and small) but we
 * still need to register its collection so the renderer can look it up.
 * Same for PlatformUser / PlatformOrganization.
 */

import React, { useEffect, useMemo, useRef } from 'react'
import { reaction } from 'mobx'
import { useOrganization } from '@/app/stores'
import { useEntityCollection } from '@/shared/data/db/hooks/useEntityCollection'
import { getLogger } from '@/shared/lib/logging'
import type { TableCoreStore } from '../stores/TableCoreStore'
import type { Column } from '../types'
import {
  collectTargetIds,
  fetchAndCacheTargets,
  SYSTEM_ENTITY_EXCLUSIONS,
} from './scopedRelationshipFetch'

const logger = getLogger(['vibegrid', 'hooks', 'useRelationshipTargetCollections'])

const FETCH_DEBOUNCE_MS = 100

/**
 * Bridge component: registers the target collection (idempotent) so the
 * registry has it for `getExistingEntityCollection` lookups, and exposes the
 * collection ref via a callback so the parent hook can write into it.
 *
 * Renders nothing — purely a registration bridge. We do NOT subscribe via
 * `useLiveQuery` here; that would re-trigger the full collection bootstrap.
 */
function RelationshipTargetRegistration({
  targetEntityType,
  onCollectionReady,
}: {
  targetEntityType: string
  onCollectionReady: (entityType: string, collection: ReturnType<typeof useEntityCollection> | null) => void
}) {
  const collection = useEntityCollection(targetEntityType)

  useEffect(() => {
    onCollectionReady(targetEntityType, collection)
  }, [targetEntityType, collection, onCollectionReady])

  return null
}

const MemoizedRegistration = React.memo(RelationshipTargetRegistration)

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
 * Hook that returns invisible bridge elements for every relationship target
 * entity referenced by the supplied tableCoreStore's columns. Render the
 * returned ReactNode in the JSX tree. When called with no columns or no
 * tableCoreStore the hook returns null.
 */
export function useRelationshipTargetCollections(tableCoreStore: TableCoreStore | null): React.ReactNode {
  const orgStore = useOrganization()
  const orgId = orgStore.activeOrganizationId

  const columns = tableCoreStore?.columns ?? []
  const targetEntityTypes = useMemo(() => getTargetEntityTypes(columns), [columns])

  // Map of entityType → collection ref, populated by registration bridges.
  const collectionsRef = useRef(new Map<string, ReturnType<typeof useEntityCollection> | null>())

  const handleCollectionReady = React.useCallback(
    (entityType: string, collection: ReturnType<typeof useEntityCollection> | null) => {
      collectionsRef.current.set(entityType, collection)
    },
    [],
  )

  // Drive the by-ID fetch off a MobX reaction on processedRows. We debounce
  // so a flurry of recomputes (sort + filter + scroll) coalesces into one
  // batch fetch.
  useEffect(() => {
    if (!tableCoreStore || !orgId || targetEntityTypes.length === 0) return

    let timer: ReturnType<typeof setTimeout> | null = null

    const runFetch = () => {
      const rows = tableCoreStore.processedRows
      if (!rows || rows.length === 0) return
      const cols = tableCoreStore.columns ?? []
      const targets = collectTargetIds(rows as Array<{ type?: string; data?: Record<string, unknown> }>, cols)
      if (targets.size === 0) return

      // Filter out targets we don't have a collection for yet (registration
      // bridge hasn't mounted) and system exclusions (we don't try to batch
      // those — let the existing factory paths handle them).
      const filtered = new Map<string, Set<string>>()
      for (const [entityType, ids] of targets) {
        if (SYSTEM_ENTITY_EXCLUSIONS.has(entityType)) continue
        if (!collectionsRef.current.has(entityType)) continue
        filtered.set(entityType, ids)
      }
      if (filtered.size === 0) return

      void fetchAndCacheTargets({
        targets: filtered,
        orgId,
        getCollection: (entityType) => collectionsRef.current.get(entityType) ?? null,
      })
        .then((result) => {
          if (result.upserted > 0) {
            logger.debug('Scoped relationship fetch upserted records', {
              upserted: result.upserted,
              perTarget: result.perTarget,
            })
            tableCoreStore.incrementConfigVersion()
          }
        })
        .catch((err) => {
          logger.warn('Scoped relationship fetch errored', {
            error: err instanceof Error ? err.message : String(err),
          })
        })
    }

    const schedule = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(runFetch, FETCH_DEBOUNCE_MS)
    }

    // Trigger once on mount (in case rows were already loaded) and on every
    // change to the row set.
    schedule()

    const dispose = reaction(
      () => {
        // Track length only (not row-by-row identity); cheap, captures the
        // most common cause of new IDs entering the visible set: filter,
        // sort, page change, or initial load completion.
        const rows = tableCoreStore.processedRows
        return rows ? rows.length : 0
      },
      () => schedule(),
      { fireImmediately: false },
    )

    return () => {
      if (timer) clearTimeout(timer)
      dispose()
    }
  }, [tableCoreStore, orgId, targetEntityTypes])

  useEffect(() => {
    if (targetEntityTypes.length > 0) {
      logger.info('Relationship target registration bridges active', {
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
        <MemoizedRegistration
          key={entityType}
          targetEntityType={entityType}
          onCollectionReady={handleCollectionReady}
        />
      ))}
    </>
  )
}
