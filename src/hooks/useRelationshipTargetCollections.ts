/**
 * useRelationshipTargetCollections - Preload target entity collections for badge-list resolution
 *
 * GH#2786 (F') follow-up: The static `badge-list` renderer
 * (`slots/renderers/badge-list.ts`) calls `getExistingEntityCollection` to
 * resolve target IDs to display names. That lookup is read-only — it returns
 * `null` if the target collection hasn't been registered yet, and the
 * renderer falls through to the raw UUID.
 *
 * On a page like `/entities/RFI`, only the RFI collection is loaded by
 * `useVibeGridData`. Relationship columns whose `relationshipTargetEntity`
 * points at a different entity (e.g., Project) never had their collection
 * registered, so badges rendered the bare UUID.
 *
 * This hook walks the current grid columns and ensures every unique
 * `relationshipTargetEntity` is registered as a singleton collection. The
 * registry call is idempotent — already-cached collections are no-ops.
 * Collections fetch on-demand (TanStack DB + SQLite paginated bootstrap),
 * so registering a singleton is cheap; the data fetch happens asynchronously
 * and the badge-list renderer re-resolves names automatically when records
 * arrive (TanStack DB reactivity).
 *
 * Note: the renderer itself is unchanged. We just populate the cache.
 */

import { useEffect, useMemo } from 'react'
import { useOrganization } from '@/app/stores'
import { createEntityCollection } from '@/shared/data/db/collections/entity-collections'
import {
  getOrCreateEntityCollection,
  getOrCreateMemberEntityCollection,
  getOrCreateMembersCollection,
  getOrCreatePlatformOrganizationsCollection,
  getOrCreatePlatformUsersCollection,
} from '@/shared/data/db/collections/registry'
import { getLogger } from '@/shared/lib/logging'
import type { Column } from '../types'

const logger = getLogger(['vibegrid', 'hooks', 'useRelationshipTargetCollections'])

/**
 * Extract unique `relationshipTargetEntity` names referenced by the current
 * column set. Empty/null entries are skipped.
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
 * Register all target entity collections referenced by the supplied columns
 * so the badge-list renderer can resolve IDs to names. Safe to call with an
 * empty/missing column list — it becomes a no-op.
 */
export function useRelationshipTargetCollections(columns: Column[] | undefined): void {
  const organizationStore = useOrganization()
  const orgId = organizationStore.activeOrganizationId

  const targetEntityTypes = useMemo(() => getTargetEntityTypes(columns ?? []), [columns])

  // Stable join key so the effect only re-runs when the set of targets changes.
  const targetsKey = targetEntityTypes.join('|')

  useEffect(() => {
    if (!orgId || targetEntityTypes.length === 0) return

    for (const entityName of targetEntityTypes) {
      try {
        // System entities: dispatch to their dedicated factories.
        if (entityName === 'PlatformUser') {
          getOrCreatePlatformUsersCollection()
          continue
        }
        if (entityName === 'PlatformOrganization') {
          getOrCreatePlatformOrganizationsCollection()
          continue
        }
        if (entityName === 'Member') {
          getOrCreateMemberEntityCollection(orgId)
          continue
        }
        if (entityName === 'User') {
          // Members collection backs `User` references for created_by-style fields.
          getOrCreateMembersCollection(orgId)
          continue
        }

        // DataForge entities: idempotent singleton registration.
        getOrCreateEntityCollection(entityName, orgId, createEntityCollection)
      } catch (err) {
        logger.warn('Failed to preload relationship target collection', {
          entityName,
          orgId,
          error: err,
        })
      }
    }

    logger.debug('Preloaded relationship target collections', {
      targetEntityTypes,
      orgId,
    })
    // targetsKey deliberately included so we re-run when the unique target
    // set changes, even though it's derived from targetEntityTypes.
  }, [orgId, targetsKey, targetEntityTypes])
}
