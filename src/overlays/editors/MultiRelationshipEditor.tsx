/**
 * MultiRelationshipEditor - For multi-relationship/many-to-many fields
 *
 * ✅ ADAPTED: Uses ComboboxEditor with multi-select for consistency
 * ✅ TAG INTERFACE: Shows selected items as removable badges
 * ✅ SEARCH: Instant filtering for relationship options
 * ✅ KEYBOARD NAV: Full keyboard navigation support
 * ✅ NULL HANDLING: Proper empty state handling
 */

import { getLogger } from '@/shared/lib/logging'
import type { CellRef, Column, RelationshipContext } from '../../types'
import { ComboboxEditor } from './ComboboxEditor'

const fileLog = getLogger(['vibegrid', 'overlays', 'editors', 'MultiRelationshipEditor'])

interface MultiRelationshipEditorProps {
  cell: CellRef
  column: Column
  initialValue: any[]
  onCommit: (value: any[]) => void
  onCancel: () => void
  relationshipContext?: {
    relationshipResolvers?: Record<string, (id: string | string[]) => string>
  }
}

export function MultiRelationshipEditor({
  cell,
  column,
  initialValue,
  onCommit,
  onCancel,
  relationshipContext,
}: MultiRelationshipEditorProps) {
  // Convert array value to string array for ComboboxEditor
  const getInitialSelectedValues = (value: any[]): string[] => {
    if (!Array.isArray(value)) return []
    return value.map((item) => {
      if (typeof item === 'string') return item
      else if (typeof item === 'object' && item?.id) return item.id
      return String(item)
    })
  }

  const stringArrayValue = getInitialSelectedValues(initialValue || [])

  const handleCommit = (value: any) => {
    // ComboboxEditor returns array for multi-select
    if (Array.isArray(value)) {
      onCommit(value)
    } else {
      onCommit([])
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
    initialValueCount: stringArrayValue.length,
    relationshipContextForCombobox: relationshipContextForCombobox,
  })

  return (
    <ComboboxEditor
      cell={cell}
      column={column}
      initialValue={stringArrayValue}
      onCommit={handleCommit}
      onCancel={onCancel}
      placeholder="Select items..."
      searchPlaceholder="Search..."
      isMultiSelect={true}
      relationshipContext={relationshipContextForCombobox}
    />
  )
}
