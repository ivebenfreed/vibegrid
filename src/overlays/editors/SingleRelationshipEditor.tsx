/**
 * SingleRelationshipEditor - For single relationship/foreign key fields
 *
 * ✅ ADAPTED: From VibeGridOptimus SingleRelationshipEditor
 * ✅ SEARCH: Instant filtering for relationship options
 * ✅ KEYBOARD NAV: Full keyboard navigation support
 * ✅ NULL HANDLING: Proper null state with "None" option
 */

import React from 'react'
import { createLogger } from '@/shared/lib/logging'
import type { CellRef, Column, RelationshipContext } from '../../types'
import { ComboboxEditor } from './ComboboxEditor'

const fileLog = createLogger('components/vibegrid/overlays/editors/SingleRelationshipEditor')

interface SingleRelationshipEditorProps {
  cell: CellRef
  column: Column
  initialValue: any
  onCommit: (value: any) => void
  onCancel: () => void
  relationshipContext?: {
    relationshipResolvers?: Record<string, (id: string | string[]) => string>
  }
}

export function SingleRelationshipEditor({
  cell,
  column,
  initialValue,
  onCommit,
  onCancel,
  relationshipContext,
}: SingleRelationshipEditorProps) {
  // For relationship fields, ComboboxEditor will use the relationshipOptionsProvider
  // We don't need to generate options here

  // Convert relationship column to work with ComboboxEditor
  const relationshipColumn = {
    ...column,
    // Mark as nullable to get "None" option
    nullable: true,
  }

  // Convert value to string for ComboboxEditor
  const stringValue = initialValue == null ? null : String(initialValue)

  const handleCommit = (value: any) => {
    if (value === null) {
      onCommit(null)
    } else {
      // Convert back to appropriate type (likely string ID)
      onCommit(value)
    }
  }

  // Create proper RelationshipContext for ComboboxEditor
  const relationshipContextForCombobox: RelationshipContext | undefined = relationshipContext
    ? {
        currentEntity: (relationshipContext as any).currentEntity || null,
        column: column,
        fieldName: column.field || column.id,
      }
    : undefined

  fileLog.debug('Creating relationship context', {
    columnId: column.id,
    hasRelationshipContext: !!relationshipContext,
    relationshipTable: column.relationshipTable,
    hasProvider: !!column.relationshipOptionsProvider,
    relationshipContextForCombobox: relationshipContextForCombobox,
  })

  return (
    <ComboboxEditor
      cell={cell}
      column={relationshipColumn}
      initialValue={stringValue}
      onCommit={handleCommit}
      onCancel={onCancel}
      placeholder="Select..."
      searchPlaceholder="Search..."
      relationshipContext={relationshipContextForCombobox}
    />
  )
}
