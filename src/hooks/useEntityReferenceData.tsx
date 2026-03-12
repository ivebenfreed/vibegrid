/**
 * useEntityReferenceData - Reactive bridge for entity reference display data
 *
 * Bridges TanStack DB entity collections → tableCoreStore.entityReferenceData (MobX)
 * so that entity_reference and custom_entity_reference cells update reactively
 * when target entity data changes (via table_change events → collection sync → liveQuery).
 *
 * Architecture:
 * - Scans grid columns for entity_reference/custom_entity_reference types
 * - For each unique target entity type, renders an EntityReferenceDataBridge component
 * - Each bridge uses useEntityCollection + useLiveQuery to reactively read records
 * - Pushes results into tableCoreStore.entityReferenceData
 * - Existing MobX reactions in EntityReferenceRenderer pick up changes automatically
 */

import React, { useEffect, useMemo } from 'react'
import { useLiveQuery } from '@tanstack/react-db'
import { useEntityCollection } from '@/shared/data/db/hooks/useEntityCollection'
import { getLogger } from '@/shared/lib/logging'
import type { TableCoreStore } from '../stores/TableCoreStore'
import type { Column } from '../types'

const logger = getLogger(['vibegrid', 'hooks', 'useEntityReferenceData'])

/**
 * Bridge component that reactively syncs a single target entity collection
 * to tableCoreStore.entityReferenceData.
 *
 * Renders nothing — purely a data bridge.
 */
function EntityReferenceDataBridge({
  targetEntityType,
  tableCoreStore,
}: {
  targetEntityType: string
  tableCoreStore: TableCoreStore
}) {
  const collection = useEntityCollection(targetEntityType)

  const { data: records = [] } = useLiveQuery(
    (q: any) => {
      if (!collection) return undefined
      return q.from({ entity: collection }).select(({ entity }: any) => ({ ...entity }))
    },
    [collection],
  )

  // Push records into tableCoreStore.entityReferenceData whenever they change
  useEffect(() => {
    if (records.length === 0) return

    logger.debug('Syncing entity reference data from collection', {
      targetEntityType,
      recordCount: records.length,
    })

    for (const record of records) {
      if (record.id) {
        tableCoreStore.setEntityReferenceRecord(targetEntityType, record.id, record)
      }
    }
  }, [records, targetEntityType, tableCoreStore])

  return null
}

const MemoizedBridge = React.memo(EntityReferenceDataBridge)

/**
 * Extract unique target entity types from entity_reference/custom_entity_reference columns.
 */
function getEntityReferenceTargets(columns: Column[]): string[] {
  const targets = new Set<string>()

  for (const col of columns) {
    const cellType = (col.cellType || (col as any).type) as string
    if (cellType === 'entity_reference' || cellType === 'custom_entity_reference') {
      const target =
        (col as any).relationshipConfig?.targetEntityType ||
        (col as any).targetEntityType ||
        (col as any).relationshipTargetEntity
      if (target) {
        targets.add(target)
      }
    }
  }

  return Array.from(targets)
}

/**
 * Hook that returns bridge elements for all entity reference target types in the grid.
 * Call in VibeGrid and render the returned ReactNode in the JSX tree.
 */
export function useEntityReferenceData(tableCoreStore: TableCoreStore | null): React.ReactNode {
  const columns = tableCoreStore?.columns ?? []

  const targetEntityTypes = useMemo(() => getEntityReferenceTargets(columns), [columns])

  useEffect(() => {
    if (targetEntityTypes.length > 0) {
      logger.info('Entity reference data bridges active', {
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
        <MemoizedBridge
          key={entityType}
          targetEntityType={entityType}
          tableCoreStore={tableCoreStore}
        />
      ))}
    </>
  )
}
