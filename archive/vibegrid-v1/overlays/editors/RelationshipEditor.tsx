/**
 * RelationshipEditor - Dedicated editor for user_reference and entity_reference fields
 *
 * Uses ComboboxEditor UI but with specialized relationship data loading and saving
 */

import React from 'react'
import { use$ } from '@legendapp/state/react'
import { getEntity$, universeOrgId$ } from '@/legend-state/observables'
import { ComboboxEditor } from './ComboboxEditor'
import type { EditorProps } from './index'
import { log } from '@/logger'

const fileLog = log('components/custom/vibegrid/overlays/editors/RelationshipEditor.tsx')

export function RelationshipEditor({
  cell,
  column,
  initialValue,
  onCommit,
  onCancel,
  onUpdate,
  onBlur
}: EditorProps) {
  const currentOrgId = use$(universeOrgId$)
  const cellType = column.cellType || column.type

  // Load user data for user_reference fields
  const userEntityName = `${currentOrgId}_User`
  const userEntity$ = getEntity$(userEntityName)
  const userData = userEntity$ ? use$(userEntity$) : null

  // Load entity data for entity_reference fields
  const entityType = React.useMemo(() => {
    if ((cellType === 'entity_reference' || cellType === 'custom_entity_reference') && column.id.endsWith('_id')) {
      const baseName = column.id.slice(0, -3)
      return baseName.split('_').map(word =>
        word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
      ).join('')
    }
    return null
  }, [cellType, column.id])

  const entityEntityName = entityType ? `${currentOrgId}_${entityType}` : null
  const entityEntity$ = entityEntityName ? getEntity$(entityEntityName) : null
  const entityData = entityEntity$ ? use$(entityEntity$) : null

  // Generate relationship options based on field type
  const relationshipOptions = React.useMemo(() => {
    if (cellType === 'user_reference' || cellType === 'custom_user_reference') {
      if (userData && typeof userData === 'object') {
        const options = Object.values(userData).map((user: any) => ({
          value: user.id,
          label: user.name || user.email || user.id
        }))

        fileLog.info('🔍 RelationshipEditor: Loaded user options', {
          columnId: column.id,
          userCount: options.length,
          sampleUsers: options.slice(0, 3)
        })

        return options
      }
    } else if (cellType === 'entity_reference' || cellType === 'custom_entity_reference') {
      if (entityData && typeof entityData === 'object') {
        const options = Object.values(entityData).map((entity: any) => ({
          value: entity.id,
          label: entity.name || entity.title || entity.id
        }))

        fileLog.info('🔍 RelationshipEditor: Loaded entity options', {
          columnId: column.id,
          entityType,
          entityCount: options.length,
          sampleEntities: options.slice(0, 3)
        })

        return options
      }
    }

    return []
  }, [cellType, column.id, userData, entityData, entityType])

  // Create enhanced column with relationship options
  const enhancedColumn = React.useMemo(() => ({
    ...column,
    options: relationshipOptions,
    enumOptions: relationshipOptions
  }), [column, relationshipOptions])

  // Handle relationship-specific saving
  const handleRelationshipCommit = React.useCallback((value: any) => {
    fileLog.info('🔗 RelationshipEditor: Committing relationship value', {
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
    if (cellType === 'user_reference' || cellType === 'custom_user_reference') {
      return 'Select user...'
    } else if (cellType === 'entity_reference' || cellType === 'custom_entity_reference') {
      return 'Select entity...'
    }
    return 'Select...'
  }

  const getSearchPlaceholder = () => {
    if (cellType === 'user_reference' || cellType === 'custom_user_reference') {
      return 'Search users...'
    } else if (cellType === 'entity_reference' || cellType === 'custom_entity_reference') {
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