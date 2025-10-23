/**
 * ⚠️ NOT MIGRATED TO MOBX - FILE DISABLED ⚠️
 * 
 * This file has not been migrated from Legend State to MobX.
 * It is currently NOT USED anywhere in the codebase.
 * 
 * Status: DISABLED - Do not import or use
 * Original: Available in archive/vibegrid/
 * 
 * To re-enable:
 * 1. Migrate Legend State observables to MobX
 * 2. Update imports and reactive patterns
 * 3. Test thoroughly
 * 4. Remove this warning
 */

// This file is disabled and will throw errors if used
throw new Error('This file has not been migrated to MobX - see file header for details');

/**
 * RelationshipEditor - Dedicated editor for user_reference and entity_reference fields
 *
 * Uses ComboboxEditor UI but with specialized relationship data loading and saving
 */

import React from 'react'
// TODO: Migrate to TanStack DB for loading relationship options
// import { use$ } from '@legendapp/state/react'
// import { getEntity$, universeOrgId$ } from '@/legend-state/observables'
import { ComboboxEditor } from './ComboboxEditor'
import type { EditorProps } from './index'
import { createLogger } from '@/lib/logging'

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
  // TODO: Load relationship data from TanStack DB
  // Migration pattern:
  // 1. Use useEntityCollection(userEntityName) for users
  // 2. Use useEntityCollection(entityEntityName) for referenced entities
  // 3. Transform collection data to options format

  const cellType = column.cellType || column.type

  // STUB: Empty relationship options until TanStack DB integration
  const relationshipOptions = React.useMemo(() => {
    fileLog.warn('RelationshipEditor: Using stub options (TanStack DB migration pending)', {
      columnId: column.id,
      cellType
    })

    // Return empty array for now - will be populated after TanStack DB migration
    return []
  }, [cellType, column.id])

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