/**
 * useVibeGridHierarchy - Hierarchy Data Loading Hook
 *
 * Loads child_of relationships when hierarchy mode is enabled and syncs
 * both entities and relationships to the HierarchyStore.
 *
 * Architecture:
 * - Observes HierarchyStore.hierarchyMode for changes
 * - When hierarchy is enabled, fetches child_of relationships via oRPC
 * - Pushes data to HierarchyStore.setData() for tree building
 * - Entities come from TableCoreStore.processedRows
 */

import { useEffect, useRef } from 'react'
import { reaction } from 'mobx'
import { orpcClient } from '@/shared/data/orpc/client'
import { getLogger } from '@/shared/lib/logging'
import type { HierarchyStore } from '../stores/HierarchyStore'
import type { TableCoreStore } from '../stores/TableCoreStore'
import type { HierarchyRelationship } from '../processors/HierarchyProcessor'

const logger = getLogger(['vibegrid', 'hooks', 'useVibeGridHierarchy'])

export interface UseVibeGridHierarchyOptions {
  entityType: string
  hierarchyStore: HierarchyStore
  tableCoreStore: TableCoreStore
}

/**
 * Hook to load hierarchy relationships and sync to HierarchyStore
 *
 * @param options - Hook configuration
 */
export function useVibeGridHierarchy({
  entityType,
  hierarchyStore,
  tableCoreStore,
}: UseVibeGridHierarchyOptions): void {
  const loadingRef = useRef(false)
  const lastEntityTypeRef = useRef<string | null>(null)

  // Effect to load relationships when hierarchy mode is enabled
  useEffect(() => {
    // Reaction to hierarchy mode changes
    const disposer = reaction(
      () => ({
        mode: hierarchyStore.hierarchyMode,
        relationshipType: hierarchyStore.relationshipType,
        rowCount: tableCoreStore.processedRows.length,
      }),
      async ({ mode, relationshipType, rowCount }) => {
        // Skip if hierarchy is disabled
        if (mode === 'none') {
          logger.debug('Hierarchy mode disabled, clearing data')
          hierarchyStore.setData([], [])
          return
        }

        // Skip if already loading
        if (loadingRef.current) {
          logger.debug('Already loading relationships, skipping')
          return
        }

        // Skip if no rows loaded yet
        if (rowCount === 0) {
          logger.debug('No rows loaded yet, waiting')
          return
        }

        loadingRef.current = true

        try {
          logger.info('Loading hierarchy relationships', {
            entityType,
            relationshipType,
            mode,
          })

          // Fetch child_of relationships for this entity type
          const response = await orpcClient.unifiedRelationships.list({
            sourceEntityType: entityType,
            targetEntityType: entityType,
            relationshipType: relationshipType as any,
          })

          // Convert to HierarchyRelationship format
          const relationships: HierarchyRelationship[] = (response.relationships || []).map(
            (rel) => ({
              id: rel.id,
              sourceEntityId: rel.sourceEntityId,
              targetEntityId: rel.targetEntityId,
              relationshipType: rel.relationshipType,
              properties: rel.properties,
            }),
          )

          logger.info('Loaded hierarchy relationships', {
            count: relationships.length,
            entityType,
          })

          // Get entities from TableCoreStore
          const entities = tableCoreStore.processedRows.map((row) => ({
            id: row.id,
            data: row.data || row,
            metadata: row.metadata || {
              createdAt: new Date(),
              updatedAt: new Date(),
              version: 1,
            },
          }))

          // Push to HierarchyStore
          hierarchyStore.setData(entities, relationships)

          lastEntityTypeRef.current = entityType
        } catch (error) {
          logger.error('Failed to load hierarchy relationships', { error, entityType })
        } finally {
          loadingRef.current = false
        }
      },
      { fireImmediately: true },
    )

    return () => {
      disposer()
    }
  }, [entityType, hierarchyStore, tableCoreStore])
}
