/**
 * RelationshipEditor - Dedicated editor for user_reference and entity_reference fields
 *
 * ✅ MOBX READY: No state dependencies - pure React component
 * Uses ComboboxEditor UI but with specialized relationship data loading and saving
 * ✅ TANSTACK DB: Uses useLiveQuery for reactive collection reads (entire collection loaded client-side)
 */

import React from 'react'
import { useLiveQuery } from '@tanstack/react-db'
import {
  useEntityCollection,
  useMembersCollection,
} from '@/shared/data/db/hooks/useEntityCollection'
import { getLogger } from '@/shared/lib/logging'
import type { CellType } from '../../types'
import { ComboboxEditor } from './ComboboxEditor'
import type { EditorProps } from './index'

const fileLog = getLogger(['custom', 'vibegrid', 'overlays', 'editors', 'RelationshipEditor.tsx'])

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

  // Always call hooks unconditionally (rules of hooks)
  const membersCollection = useMembersCollection()
  const entityCollection = useEntityCollection(isUserReference ? '' : (targetEntityType ?? ''))

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
    (!isUserReference && !!targetEntityType && entitiesData.length === 0 && !!entityCollection)

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

    if (targetEntityType) {
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
  }, [isUserReference, membersData, entitiesData, targetEntityType, column])

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
      })

      // For relationships, we save the ID value just like regular fields
      // The backend relationship system will handle the storage in relationship tables
      onCommit(value)
    },
    [column.id, cellType, onCommit, initialValue],
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
