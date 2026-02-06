import { getLogger } from '@/shared/lib/logging'
import type { CellRef, Column, RelationshipContext } from '../../types'
import { ComboboxEditor } from './ComboboxEditor'

const fileLog = getLogger(['vibegrid', 'overlays', 'editors', 'SelectEditor'])

interface SelectEditorProps {
  cell: CellRef
  column: Column
  initialValue: string | null
  onCommit: (value: string | null) => void
  onCancel: () => void
  // Additional context for relationship editors
  relationshipContext?: {
    relationshipResolvers?: Record<string, (id: string | string[]) => string>
  }
}

export function SelectEditor({
  cell,
  column,
  initialValue,
  onCommit,
  onCancel,
  relationshipContext,
}: SelectEditorProps) {
  fileLog.debug('Rendering SelectEditor', {
    columnId: column.id,
    cellType: column.cellType || column.type,
    hasOptions: !!(column.options || column.enumOptions),
    optionCount: (column.options || column.enumOptions || []).length,
    hasRelationshipContext: !!relationshipContext,
    initialValue,
  })

  // Convert the old relationshipContext format to the new RelationshipContext
  const newRelationshipContext: RelationshipContext | undefined = relationshipContext
    ? {
        currentEntity: null, // Will be set by the actual editor call
        column,
        fieldName: column.field || column.id,
      }
    : undefined

  return (
    <ComboboxEditor
      cell={cell}
      column={column}
      initialValue={initialValue}
      onCommit={onCommit}
      onCancel={onCancel}
      placeholder={(column as any).placeholder || 'Select...'}
      searchPlaceholder="Search options..."
      relationshipContext={newRelationshipContext}
    />
  )
}
