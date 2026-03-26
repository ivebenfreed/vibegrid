import React from 'react'
import { EnumPicker } from '@/shared/components/ui/picker'
import type { CellRef, Column } from '../../types'

interface PickerEnumEditorProps {
  cell: CellRef
  column: Column
  initialValue: string | null
  onCommit: (value: any) => void
  onCancel: () => void
}

export function PickerEnumEditor({ cell: _cell, column, initialValue, onCommit, onCancel }: PickerEnumEditorProps) {
  const [hasCommitted, setHasCommitted] = React.useState(false)

  // Build field definition from column for EnumPicker
  const field = React.useMemo(() => {
    // Check all three option sources, matching SelectCellRenderer.getOptions logic
    const rawOptions =
      column.enumOptions || column.options || (column.validation?.enum as any[]) || column.editor?.options || []
    const options = rawOptions.map((opt: any) =>
      typeof opt === 'string'
        ? { value: opt, label: opt }
        : {
            value: opt.value,
            label: opt.label,
            color: opt.color,
            backgroundColor: opt.backgroundColor,
            icon: opt.icon,
          },
    )
    return { editor: { options }, enumValues: undefined }
  }, [column.enumOptions, column.options, column.validation?.enum, column.editor?.options])

  const handleValueChange = React.useCallback(
    (value: string | null) => {
      if (hasCommitted) return
      const finalValue = value
      // Only commit if value actually changed
      if (finalValue !== initialValue) {
        setHasCommitted(true)
        onCommit(finalValue)
      } else {
        setHasCommitted(true)
        onCancel()
      }
    },
    [hasCommitted, initialValue, onCommit, onCancel],
  )

  const handleCancel = React.useCallback(() => {
    if (hasCommitted) return
    setHasCommitted(true)
    onCancel()
  }, [hasCommitted, onCancel])

  // Check if nullable
  const isNullable = (column as any).nullable !== false || column.nullLabel !== undefined

  return (
    <EnumPicker
      field={field}
      value={initialValue}
      onValueChange={handleValueChange}
      mode="inline"
      nullable={isNullable}
      onCancel={handleCancel}
      fieldId={column.id}
      className="w-full h-full"
    />
  )
}
