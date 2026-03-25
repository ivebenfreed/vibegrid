import React from 'react'
import { EntityPicker, UserPicker } from '@/shared/components/ui/picker'
import { useRelationshipArchetype } from '@/shared/components/ui/picker/hooks/useRelationshipArchetype'
import { createRelationshipEntityRecord, deleteRelationshipEntityRecord } from './relationship-utils'
import { orpcClient } from '@/shared/data/orpc/client'
import type { CellRef, CellType, Column } from '../../types'

interface PickerEntityEditorProps {
  cell: CellRef
  column: Column
  initialValue: any
  onCommit: (value: any) => void
  onCancel: () => void
}

export function PickerEntityEditor({ cell, column, initialValue, onCommit, onCancel }: PickerEntityEditorProps) {
  const [hasCommitted, setHasCommitted] = React.useState(false)
  const cellType = (column.cellType || column.type) as CellType
  const isUserReference = cellType === 'user_reference'

  const targetEntityType =
    (column as any).relationshipConfig?.targetEntityType ||
    (column as any).targetEntityType ||
    (column as any).relationshipTargetEntity

  const relArchetypeInfo = useRelationshipArchetype(isUserReference ? undefined : targetEntityType)

  const displayField =
    (column as any).relationshipConfig?.displayField || (column as any).relationshipDisplayField || 'name'

  const handleValueChange = React.useCallback(
    (value: string | null) => {
      if (hasCommitted) return
      setHasCommitted(true)

      // Relationship archetype routing (GH#1739 P3)
      if (relArchetypeInfo?.isRelationship && targetEntityType) {
        const sourceEntityId = cell.rowId
        const newTargetEntityId = value
        const oldTargetEntityId = initialValue

        // Create new relationship
        if (newTargetEntityId && newTargetEntityId !== oldTargetEntityId) {
          createRelationshipEntityRecord(targetEntityType, sourceEntityId, newTargetEntityId).catch(() => {})
        }

        // Delete old relationship
        if (oldTargetEntityId && oldTargetEntityId !== newTargetEntityId) {
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
              const records = (result as any)?.data || []
              if (records.length > 0) {
                return deleteRelationshipEntityRecord(targetEntityType, (records[0] as any).id)
              }
            })
            .catch(() => {})
        }
      }

      onCommit(value)
    },
    [hasCommitted, initialValue, onCommit, relArchetypeInfo, targetEntityType, cell.rowId],
  )

  const handleCancel = React.useCallback(() => {
    if (hasCommitted) return
    setHasCommitted(true)
    onCancel()
  }, [hasCommitted, onCancel])

  if (isUserReference) {
    return (
      <UserPicker
        value={initialValue}
        onValueChange={handleValueChange}
        mode="inline"
        nullable
        onCancel={handleCancel}
        fieldId={column.id}
      />
    )
  }

  // For relationship archetypes, EntityPicker already loads the actual target entity
  return (
    <EntityPicker
      entityType={targetEntityType || ''}
      value={initialValue}
      onValueChange={handleValueChange}
      mode="inline"
      displayField={displayField}
      nullable
      onCancel={handleCancel}
      fieldId={column.id}
    />
  )
}
