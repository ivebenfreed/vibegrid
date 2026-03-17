import React from 'react'
import { EnumPicker } from '@/shared/components/ui/picker'
import type { CellRef, Column } from '../../types'

interface PickerMultiEditorProps {
  cell: CellRef
  column: Column
  initialValue: string[] | string | null
  onCommit: (value: string[]) => void
  onCancel: () => void
}

export function PickerMultiEditor({
  cell: _cell,
  column,
  initialValue,
  onCommit,
  onCancel,
}: PickerMultiEditorProps) {
  // Normalize initialValue to string array
  const normalizedInitial = React.useMemo(() => {
    if (Array.isArray(initialValue)) return initialValue
    if (typeof initialValue === 'string')
      return initialValue
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    return []
  }, [initialValue])

  const [currentValues, setCurrentValues] = React.useState<string[]>(normalizedInitial)
  const [hasCommitted, setHasCommitted] = React.useState(false)

  // Build field definition from column
  const field = React.useMemo(() => {
    const rawOptions = column.enumOptions || column.options || []
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
  }, [column.enumOptions, column.options])

  const handleValueChange = React.useCallback((values: string[]) => {
    setCurrentValues(values)
  }, [])

  const handleCancel = React.useCallback(() => {
    if (hasCommitted) return
    setHasCommitted(true)
    onCancel()
  }, [hasCommitted, onCancel])

  // For multi-select, commit on Tab and cancel on Escape
  // The EnumPicker's internal keyboard handling navigates options,
  // but commit-on-Tab needs to be at the editor level
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        e.preventDefault()
        e.stopPropagation()
        if (!hasCommitted) {
          setHasCommitted(true)
          onCommit(currentValues)
        }
      } else if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        if (!hasCommitted) {
          setHasCommitted(true)
          onCancel()
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [currentValues, hasCommitted, onCommit, onCancel])

  return (
    <EnumPicker
      field={field}
      value={currentValues}
      onValueChange={handleValueChange as any}
      multiSelect
      mode="inline"
      onCancel={handleCancel}
      fieldId={column.id}
    />
  )
}
