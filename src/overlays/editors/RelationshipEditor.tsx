/**
 * RelationshipEditor - Dedicated editor for user_reference and entity_reference fields
 *
 * ✅ MOBX READY: No state dependencies - pure React component
 * Uses ComboboxEditor UI but with specialized relationship data loading and saving
 * ✅ TANSTACK DB: Uses useLiveQuery for reactive collection reads (entire collection loaded client-side)
 *
 * Relationship archetype routing (GH#1739 P3):
 * When the field's targetEntityType corresponds to an entity schema with archetype='relationship',
 * writes are routed to entity_records (via data.create/delete) instead of saving as a field value.
 * The UX remains unchanged — the same combobox interaction applies regardless of backend routing.
 */

import React from 'react'
import { useLiveQuery } from '@tanstack/react-db'
import {
  useEntityCollection,
  useMembersCollection,
} from '@/shared/data/db/hooks/useEntityCollection'
import { getLogger } from '@/shared/lib/logging'
import {
  createRelationshipEntityRecord,
  deleteRelationshipEntityRecord,
} from './relationship-utils'
import { orpcClient } from '@/shared/data/orpc/client'
import type { CellType } from '../../types'
import { ComboboxEditor } from './ComboboxEditor'
import type { EditorProps } from './index'

const fileLog = getLogger(['custom', 'vibegrid', 'overlays', 'editors', 'RelationshipEditor.tsx'])

/**
 * Module-level cache for relationship archetype detection results.
 * Shared across all RelationshipEditor instances for the page session.
 */
const relationshipArchetypeCache = new Map<
  string,
  {
    isRelationship: boolean
    sourceEntity?: string
    targetEntity?: string
    semantic?: string
  } | null
>()

/**
 * Check if targetEntityType is a relationship archetype and cache the result.
 */
async function checkRelationshipArchetype(targetEntityType: string): Promise<{
  isRelationship: boolean
  sourceEntity?: string
  targetEntity?: string
  semantic?: string
}> {
  if (relationshipArchetypeCache.has(targetEntityType)) {
    return relationshipArchetypeCache.get(targetEntityType) ?? { isRelationship: false }
  }

  try {
    const result = (await orpcClient.dataforge.schema.getEntity({
      entityName: targetEntityType,
    })) as any
    const schema = result?.entity ?? result?.schema ?? null
    const relMeta =
      schema?.businessMetadata?.relationship ?? schema?.business_metadata?.relationship
    if (schema?.archetype === 'relationship' && relMeta) {
      const info = {
        isRelationship: true,
        sourceEntity: relMeta.sourceEntity,
        targetEntity: relMeta.targetEntity,
        semantic: relMeta.semantic,
      }
      relationshipArchetypeCache.set(targetEntityType, info)
      return info
    }
  } catch {
    // Schema lookup failed — treat as non-relationship
  }

  const info = { isRelationship: false }
  relationshipArchetypeCache.set(targetEntityType, info)
  return info
}

export function RelationshipEditor({
  cell,
  column,
  initialValue,
  onCommit,
  onCancel,
  onUpdate: _onUpdate,
  onBlur: _onBlur,
}: EditorProps) {
  const cellType = (column.cellType || column.type) as CellType

  // Determine target entity type
  const targetEntityType =
    (column as any).relationshipConfig?.targetEntityType ||
    (column as any).targetEntityType ||
    (column as any).relationshipTargetEntity

  const isUserReference = cellType === 'user_reference' || cellType === 'custom_user_reference'

  // Relationship archetype detection state (GH#1739 P3)
  const [relArchetypeInfo, setRelArchetypeInfo] = React.useState<{
    isRelationship: boolean
    sourceEntity?: string
    targetEntity?: string
    semantic?: string
  } | null>(null)

  // Check if targetEntityType is a relationship archetype on mount
  React.useEffect(() => {
    if (!targetEntityType || isUserReference) return
    let cancelled = false
    checkRelationshipArchetype(targetEntityType).then((info) => {
      if (!cancelled) setRelArchetypeInfo(info)
    })
    return () => {
      cancelled = true
    }
  }, [targetEntityType, isUserReference])

  // For relationship archetype, load the actual target entity collection, not the relationship entity
  const actualTargetEntityType = relArchetypeInfo?.isRelationship
    ? relArchetypeInfo.targetEntity
    : targetEntityType

  // Always call hooks unconditionally (rules of hooks)
  const membersCollection = useMembersCollection()
  const entityCollection = useEntityCollection(
    isUserReference ? '' : (actualTargetEntityType ?? ''),
  )

  // Reactive query from the appropriate collection using useLiveQuery
  const { data: membersData = [] } = useLiveQuery(
    (q: any) => {
      if (!isUserReference || !membersCollection) return undefined
      return q.from({ items: membersCollection })
    },
    [isUserReference, membersCollection],
  )

  const { data: entitiesData = [] } = useLiveQuery(
    (q: any) => {
      if (isUserReference || !entityCollection) return undefined
      return q.from({ items: entityCollection })
    },
    [isUserReference, entityCollection],
  )

  // Derive loading state: no data yet but we expect some
  const isLoadingRelationship =
    (isUserReference && membersData.length === 0 && !!membersCollection) ||
    (!isUserReference &&
      !!actualTargetEntityType &&
      entitiesData.length === 0 &&
      !!entityCollection)

  // Transform collection data to options format
  const relationshipOptions = React.useMemo(() => {
    if (isUserReference) {
      return membersData.map((member: any) => ({
        value: member.user_id || member.userId || member.id,
        label:
          member.user?.name || member.name || member.user?.email || member.email || 'Unknown User',
        color: undefined,
        backgroundColor: undefined,
      }))
    }

    if (actualTargetEntityType) {
      const displayField =
        (column as any).relationshipConfig?.displayField ||
        (column as any).relationshipDisplayField ||
        'name'

      return entitiesData.map((entity: any) => ({
        value: entity.id,
        label: entity[displayField] || entity.name || entity.title || `Entity ${entity.id}`,
        color: undefined,
        backgroundColor: undefined,
      }))
    }

    return []
  }, [isUserReference, membersData, entitiesData, actualTargetEntityType, column])

  // Create enhanced column with relationship options
  const enhancedColumn = React.useMemo(
    () => ({
      ...column,
      options: relationshipOptions,
      enumOptions: relationshipOptions,
    }),
    [column, relationshipOptions],
  )

  // Handle relationship-specific saving
  const handleRelationshipCommit = React.useCallback(
    (value: any) => {
      fileLog.debug('RelationshipEditor: Committing relationship value', {
        columnId: column.id,
        cellType,
        value,
        initialValue,
        isRelationshipArchetype: relArchetypeInfo?.isRelationship,
      })

      // GH#1739 P3: Route writes to entity_records for relationship archetype entities
      if (relArchetypeInfo?.isRelationship && targetEntityType) {
        const sourceEntityId = cell.rowId
        const newTargetEntityId = value
        const oldTargetEntityId = initialValue

        // Handle add: create relationship entity record
        if (newTargetEntityId && newTargetEntityId !== oldTargetEntityId) {
          createRelationshipEntityRecord(targetEntityType, sourceEntityId, newTargetEntityId)
            .then(() => {
              fileLog.debug('RelationshipEditor: Created relationship entity record', {
                relationshipEntity: targetEntityType,
                sourceEntityId,
                targetEntityId: newTargetEntityId,
              })
            })
            .catch((error) => {
              fileLog.error('RelationshipEditor: Failed to create relationship entity record', {
                error,
                relationshipEntity: targetEntityType,
                sourceEntityId,
                targetEntityId: newTargetEntityId,
              })
            })
        }

        // Handle remove: if old value existed and new value is different/null,
        // we need to find and soft-delete the old relationship entity record.
        // This requires querying for the record ID first.
        if (oldTargetEntityId && oldTargetEntityId !== newTargetEntityId) {
          // Find the relationship record to delete
          orpcClient.dataforge.data
            .query({
              entityName: targetEntityType,
              filters: {
                source_entity_id: sourceEntityId,
                target_entity_id: oldTargetEntityId,
              },
              limit: 1,
            })
            .then((result) => {
              const records = result?.data || []
              if (records.length > 0) {
                const recordId = (records[0] as any).id
                return deleteRelationshipEntityRecord(targetEntityType, recordId)
              }
            })
            .then(() => {
              fileLog.debug('RelationshipEditor: Deleted old relationship entity record', {
                relationshipEntity: targetEntityType,
                sourceEntityId,
                oldTargetEntityId,
              })
            })
            .catch((error) => {
              fileLog.error('RelationshipEditor: Failed to delete old relationship entity record', {
                error,
                relationshipEntity: targetEntityType,
                sourceEntityId,
                oldTargetEntityId,
              })
            })
        }
      }

      // Always call onCommit to update the UI (saves field value on parent row)
      onCommit(value)
    },
    [column.id, cellType, onCommit, initialValue, relArchetypeInfo, targetEntityType, cell.rowId],
  )

  const getPlaceholder = () => {
    // Type assertions for relationship types not in the base Column type
    const type = cellType as string
    if (type === 'user_reference' || type === 'custom_user_reference') {
      return 'Select user...'
    } else if (type === 'entity_reference' || type === 'custom_entity_reference') {
      return 'Select entity...'
    }
    return 'Select...'
  }

  const getSearchPlaceholder = () => {
    // Type assertions for relationship types not in the base Column type
    const type = cellType as string
    if (type === 'user_reference' || type === 'custom_user_reference') {
      return 'Search users...'
    } else if (type === 'entity_reference' || type === 'custom_entity_reference') {
      return 'Search entities...'
    }
    return 'Search...'
  }

  return (
    <ComboboxEditor
      cell={cell}
      column={enhancedColumn}
      initialValue={initialValue}
      onCommit={handleRelationshipCommit}
      onCancel={onCancel}
      placeholder={getPlaceholder()}
      searchPlaceholder={getSearchPlaceholder()}
      className="vibegridx-relationship-editor"
      isLoadingOptions={isLoadingRelationship}
    />
  )
}
