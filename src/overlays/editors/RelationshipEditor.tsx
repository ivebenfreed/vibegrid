/**
 * RelationshipEditor - Dedicated editor for user_reference and entity_reference fields
 *
 * ✅ MOBX READY: No state dependencies - pure React component
 * Uses ComboboxEditor UI but with specialized relationship data loading and saving
 */

import React from 'react'
import { ComboboxEditor } from './ComboboxEditor'
import type { EditorProps } from './index'
import { createLogger } from '@/lib/logging'
import { getOrCreateEntityCollection, getOrCreateMembersCollection } from '@/data/db/collections/registry'
import { createEntityCollection } from '@/data/db/collections/entity-collections'
import { getActiveOrganizationId } from '@/stores/experience/OrganizationStore'

const fileLog = createLogger('components/custom/vibegrid/overlays/editors/RelationshipEditor.tsx')

export function RelationshipEditor({
  cell,
  column,
  initialValue,
  onCommit,
  onCancel,
  onUpdate,
  onBlur
}: EditorProps) {
  const cellType = (column.cellType || column.type) as CellType

  // Determine target entity type
  const targetEntityType = (column as any).relationshipConfig?.targetEntityType ||
                          (column as any).targetEntityType ||
                          (column as any).relationshipTargetEntity

  const isUserReference = cellType === 'user_reference' || cellType === 'custom_user_reference'

  // Transform collection data to options format
  const relationshipOptions = React.useMemo(() => {
    const orgId = getActiveOrganizationId()
    if (!orgId) {
      fileLog.warn('No active organization - cannot load relationship options')
      return []
    }

    if (isUserReference) {
      // Load members collection
      const membersCollection = getOrCreateMembersCollection(orgId)
      const members = membersCollection?.toArray || []
      return members.map((member: any) => ({
        value: member.user_id || member.userId || member.id,
        label: member.user?.name || member.name || member.user?.email || member.email || 'Unknown User',
        color: undefined,
        backgroundColor: undefined
      }))
    } else if (targetEntityType) {
      // Load entity collection
      const entityCollection = getOrCreateEntityCollection(targetEntityType, orgId, createEntityCollection)
      const entities = entityCollection?.toArray || []
      const displayField = (column as any).relationshipConfig?.displayField ||
                          (column as any).relationshipDisplayField ||
                          'name'

      return entities.map((entity: any) => ({
        value: entity.id,
        label: entity[displayField] || entity.name || entity.title || `Entity ${entity.id}`,
        color: undefined,
        backgroundColor: undefined
      }))
    }

    fileLog.debug('RelationshipEditor: No collection data available', {
      columnId: column.id,
      cellType,
      targetEntityType,
      isUserReference
    })

    return []
  }, [cellType, column, isUserReference, targetEntityType])

  // Create enhanced column with relationship options
  const enhancedColumn = React.useMemo(() => ({
    ...column,
    options: relationshipOptions,
    enumOptions: relationshipOptions
  }), [column, relationshipOptions])

  // Handle relationship-specific saving
  const handleRelationshipCommit = React.useCallback((value: any) => {
    fileLog.debug('🔗 RelationshipEditor: Committing relationship value', {
      columnId: column.id,
      cellType,
      value,
      initialValue
    })

    // For relationships, we save the ID value just like regular fields
    // The backend relationship system will handle the storage in relationship tables
    onCommit(value)
  }, [column.id, cellType, onCommit, initialValue])

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
    />
  )
}