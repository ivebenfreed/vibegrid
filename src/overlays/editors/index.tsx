import type React from 'react'
import { getLogger } from '@/shared/lib/logging'
import type { CellRef, Column } from '../../types'
import { BooleanEditor } from './BooleanEditor'
import { DateEditor } from './DateEditor'
import { ModalTextEditor } from './ModalTextEditor'
import { NumberEditor } from './NumberEditor'
import { PickerEntityEditor } from './PickerEntityEditor'
import { PickerEnumEditor } from './PickerEnumEditor'
import { PickerMultiEditor } from './PickerMultiEditor'
import { TextEditor } from './TextEditor'
import { ValidationErrorDisplay } from './ValidationErrorDisplay'

const fileLog = getLogger(['vibegrid', 'overlays', 'editors', 'index'])

// Helper function to detect if a field should be treated as tags
export function isTagsLikeField(column: Column, initialValue: any): boolean {
  // Check column name patterns
  const columnName = (column.name || column.id || '').toLowerCase()
  const tagsPatterns = ['tags', 'tag', 'labels', 'keywords', 'categories']
  const isTagsName = tagsPatterns.some((pattern) => columnName.includes(pattern))

  // Check if the value looks like comma-separated tags
  const hasCommaSeperatedValues = typeof initialValue === 'string' && initialValue.includes(',')

  // Check if column has options (suggesting it's a select-type field)
  const hasOptions = !!(
    column.options &&
    Array.isArray(column.options) &&
    column.options.length > 0
  )

  // For tags fields, we should use PickerMultiEditor if:
  // 1. The column name indicates it's a tags field (most important)
  // 2. OR it has comma-separated values
  // 3. OR it has predefined options
  // The tags field should use PickerMultiEditor even without predefined options
  const result: boolean = isTagsName || hasCommaSeperatedValues || hasOptions

  fileLog.debug('isTagsLikeField analysis', {
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
  PickerEnumEditor,
  PickerMultiEditor,
  PickerEntityEditor,
  BooleanEditor,
  DateEditor,
  ModalTextEditor,
  ValidationErrorDisplay,
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
  // Validation errors to display (passed directly since portal is outside React context)
  validationErrors?: string[]
  // Additional context for relationship editors
  relationshipContext?: {
    relationshipResolvers?: Record<string, (id: string | string[]) => string>
  }
}

// Editor factory function
export function createEditor(props: EditorProps): React.ReactElement {
  const { column } = props
  // Cast to string to allow comparison with all possible cell type values
  // The Column type doesn't include all the extended types we support
  const cellType = (column.cellType || column.type) as string

  fileLog.debug('createEditor: Creating editor', {
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
      fileLog.debug('createEditor: Creating TextEditor')
      return <TextEditor {...props} />

    case 'textarea':
    case 'longtext':
    case 'richtext':
    case 'rich-text':
    case 'rich_text':
    case 'html':
    case 'markdown':
      // All multi-line/rich text types use ModalTextEditor for consistent editing
      fileLog.debug('createEditor: Using ModalTextEditor for multi-line/rich text', { cellType })
      return <ModalTextEditor {...props} editorType="richtext" />

    case 'number':
    case 'integer':
    case 'float':
    case 'decimal':
      return <NumberEditor {...props} />

    case 'select':
    case 'single-select':
    case 'enum':
      return <PickerEnumEditor {...props} />

    case 'select-multi':
    case 'multi-select':
      return <PickerMultiEditor {...props} />

    case 'tags':
    case 'multiselect':
      // Tags fields should use PickerMultiEditor with dynamic options
      fileLog.debug('createEditor: Creating PickerMultiEditor for tags field')
      return <PickerMultiEditor {...props} />

    case 'json':
    case 'jsonb':
      // Check if this is a tags-like field based on column name or data
      fileLog.debug('createEditor: Checking json field for tags pattern', {
        columnId: column.id,
        columnName: column.name,
        initialValue: props.initialValue,
      })

      if (isTagsLikeField(column, props.initialValue)) {
        fileLog.debug('createEditor: JSON field detected as tags, using PickerMultiEditor')
        return <PickerMultiEditor {...props} />
      }

      // Fallback to text editor for regular JSON
      fileLog.debug('createEditor: Using TextEditor for JSON field')
      return <TextEditor {...props} multiline />

    case 'boolean':
    case 'checkbox':
      return <BooleanEditor {...props} variant="checkbox" />

    case 'switch':
      return <BooleanEditor {...props} variant="switch" />

    case 'date':
      return <DateEditor {...props} />
    case 'datetime-local':
    case 'datetime':
    case 'timestamp':
    case 'time':
    case 'timestamptz':
      return <DateEditor {...props} includeTime />

    case 'email':
    case 'url':
    case 'phone':
      return <TextEditor {...props} />

    case 'entity_reference':
      return <PickerEntityEditor {...props} />

    case 'reference-select':
      fileLog.debug('createEditor: Creating PickerEntityEditor for reference-select')
      return <PickerEntityEditor {...props} />

    case 'reference-multi':
      fileLog.debug('createEditor: Creating PickerMultiEditor for reference-multi')
      return <PickerMultiEditor {...props} />

    // System option reference types
    case 'priority_option':
    case 'status_option':
    case 'category_option':
    case 'task_type_option':
      fileLog.debug('createEditor: Creating PickerEnumEditor for system option type', { cellType })
      return <PickerEnumEditor {...props} />

    // User reference type - use dedicated PickerEntityEditor
    case 'user_reference':
      fileLog.debug('createEditor: Creating PickerEntityEditor for user reference', { cellType })
      return <PickerEntityEditor {...props} />

    default:
      // Default to text editor for unknown types
      fileLog.warn('Unknown cell type, defaulting to text editor', { cellType })
      return <TextEditor {...props} />
  }
}
