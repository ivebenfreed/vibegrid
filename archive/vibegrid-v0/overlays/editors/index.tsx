import React from 'react'
import type { CellRef, Column } from '../../types'
import { BooleanEditor } from './BooleanEditor'
import { DateEditor } from './DateEditor'
import { MultiRelationshipEditor } from './MultiRelationshipEditor'
import { MultiSelectEditor } from './MultiSelectEditor'
import { NumberEditor } from './NumberEditor'
import { ReferenceMultiEditor } from './ReferenceMultiEditor'
import { ReferenceSelectEditor } from './ReferenceSelectEditor'
import { SelectEditor } from './SelectEditor'
import { SingleRelationshipEditor } from './SingleRelationshipEditor'
import { TextEditor } from './TextEditor'

// Helper function to detect if a field should be treated as tags
function isTagsLikeField(column: Column, initialValue: any): boolean {
  // Check column name patterns
  const columnName = (column.name || column.id || '').toLowerCase()
  const tagsPatterns = ['tags', 'tag', 'labels', 'keywords', 'categories']
  const isTagsName = tagsPatterns.some((pattern) => columnName.includes(pattern))

  // Check if the value looks like comma-separated tags
  const hasCommaSeperatedValues = typeof initialValue === 'string' && initialValue.includes(',')

  // Check if column has options (suggesting it's a select-type field)
  const hasOptions = column.options && Array.isArray(column.options) && column.options.length > 0

  // For tags fields, we should use MultiSelectEditor if:
  // 1. The column name indicates it's a tags field (most important)
  // 2. OR it has comma-separated values
  // 3. OR it has predefined options
  // The tags field should use MultiSelectEditor even without predefined options
  const result = isTagsName || hasCommaSeperatedValues || hasOptions

  console.log('🔍 isTagsLikeField analysis', {
    columnName,
    columnId: column.id,
    isTagsName,
    hasCommaSeperatedValues,
    hasOptions: !!hasOptions,
    result,
  })

  return result
}

// Export all editor components
export {
  TextEditor,
  NumberEditor,
  SelectEditor,
  MultiSelectEditor,
  BooleanEditor,
  DateEditor,
  SingleRelationshipEditor,
  MultiRelationshipEditor,
  ReferenceSelectEditor,
  ReferenceMultiEditor,
}

// Editor props interface
export interface EditorProps {
  cell: CellRef
  column: Column
  initialValue: any
  onCommit: (value: any) => void
  onCancel: () => void
  onUpdate?: (value: any) => void
  onBlur?: () => void
  // Additional context for relationship editors
  relationshipContext?: {
    relationshipResolvers?: Record<string, (id: string | string[]) => string>
  }
}

// Editor factory function
export function createEditor(props: EditorProps): React.ReactElement {
  const { column } = props
  const cellType = column.cellType || column.type

  console.log('🔧 createEditor: Creating editor', {
    cellType,
    columnId: column.id,
    columnName: column.name,
    initialValue: props.initialValue,
    hasCallbacks: {
      onCommit: !!props.onCommit,
      onCancel: !!props.onCancel,
      onUpdate: !!props.onUpdate,
    },
  })

  switch (cellType) {
    case 'text':
    case 'string':
      console.log('🔧 createEditor: Creating TextEditor')
      return <TextEditor {...props} />

    case 'textarea':
    case 'longtext':
      return <TextEditor {...props} multiline />

    case 'number':
    case 'integer':
    case 'float':
    case 'decimal':
      return <NumberEditor {...props} />

    case 'select':
    case 'enum':
      return <SelectEditor {...props} />

    case 'select-multi':
      return <MultiSelectEditor {...props} />

    case 'tags':
    case 'multiselect':
      // Tags fields should use MultiSelectEditor with dynamic options
      console.log('🏷️ createEditor: Creating MultiSelectEditor for tags field')
      return <MultiSelectEditor {...props} />

    case 'json':
    case 'jsonb':
      // Check if this is a tags-like field based on column name or data
      console.log('🔍 createEditor: Checking json field for tags pattern', {
        columnId: column.id,
        columnName: column.name,
        initialValue: props.initialValue,
      })

      if (isTagsLikeField(column, props.initialValue)) {
        console.log('🏷️ createEditor: JSON field detected as tags, using MultiSelectEditor')
        return <MultiSelectEditor {...props} />
      }

      // Fallback to text editor for regular JSON
      console.log('📝 createEditor: Using TextEditor for JSON field')
      return <TextEditor {...props} multiline />

    case 'boolean':
    case 'checkbox':
      return <BooleanEditor {...props} variant="checkbox" />

    case 'switch':
      return <BooleanEditor {...props} variant="switch" />

    case 'date':
      return <DateEditor {...props} />

    case 'datetime':
    case 'timestamp':
      return <DateEditor {...props} includeTime />

    case 'email':
      return <TextEditor {...props} />

    case 'url':
      return <TextEditor {...props} />

    case 'relationship':
    case 'relationship-single':
      return <SingleRelationshipEditor {...props} />

    case 'relationship-multi':
    case 'relationship-collection':
      return <MultiRelationshipEditor {...props} />

    case 'reference-select':
      console.log('🔧 createEditor: Creating ReferenceSelectEditor')
      return <ReferenceSelectEditor {...props} />

    case 'reference-multi':
      console.log('🔧 createEditor: Creating ReferenceMultiEditor')
      return <ReferenceMultiEditor {...props} />

    default:
      // Default to text editor for unknown types
      console.warn(`Unknown cell type: ${cellType}, defaulting to text editor`)
      return <TextEditor {...props} />
  }
}
