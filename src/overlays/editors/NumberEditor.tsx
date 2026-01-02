import React from 'react'
import { observer } from 'mobx-react-lite'
import { Input } from '@/shared/components/ui/input'
import { useEditingStore } from '../../stores/context'
import type { CellRef, Column } from '../../types'
import { ValidationErrorDisplay } from './ValidationErrorDisplay'

interface NumberEditorProps {
  cell: CellRef
  column: Column
  initialValue: number | null
  onCommit: (value: number | null) => void
  onCancel: () => void
}

export const NumberEditor = observer(function NumberEditor({
  cell,
  column,
  initialValue,
  onCommit,
  onCancel,
}: NumberEditorProps) {
  const [value, setValue] = React.useState(initialValue?.toString() || '')

  // Get validation errors from the EditingStore
  const editingStore = useEditingStore()
  const validationErrors = editingStore.validationErrors
  const hasErrors = validationErrors.length > 0

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'Enter':
        e.preventDefault()
        e.stopPropagation() // Stop the event from bubbling up
        commitValue()
        break
      case 'Escape':
        e.preventDefault()
        e.stopPropagation() // Stop the event from reaching KeyboardNavigationController
        onCancel()
        break
      case 'Tab':
        e.preventDefault()
        e.stopPropagation() // Stop the event from bubbling up
        commitValue()
        break
    }
  }

  const commitValue = () => {
    if (value === '') {
      onCommit(null)
    } else {
      const numValue = parseFloat(value)
      if (!isNaN(numValue)) {
        onCommit(numValue)
      } else {
        onCancel() // Invalid number, cancel edit
      }
    }
  }

  const handleBlur = () => {
    // Always commit - XState will decide what to do
    commitValue()
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    // Allow empty, numbers, and decimal points
    if (newValue === '' || /^-?\d*\.?\d*$/.test(newValue)) {
      setValue(newValue)
    }
  }

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <Input
        type="number"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        autoFocus
        className={`border-2 shadow-lg ${hasErrors ? 'border-destructive' : 'border-blue-500'}`}
        placeholder={(column as any).placeholder}
        step={column.type === 'number' ? 'any' : '1'}
      />
      <ValidationErrorDisplay errors={validationErrors} />
    </div>
  )
})
