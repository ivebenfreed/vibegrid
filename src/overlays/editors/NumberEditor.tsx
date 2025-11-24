import React from 'react'
import { Input } from '@/shared/components/ui/input'
import type { CellRef, Column } from '../../types'

interface NumberEditorProps {
  cell: CellRef
  column: Column
  initialValue: number | null
  onCommit: (value: number | null) => void
  onCancel: () => void
}

export function NumberEditor({
  cell,
  column,
  initialValue,
  onCommit,
  onCancel,
}: NumberEditorProps) {
  const [value, setValue] = React.useState(initialValue?.toString() || '')

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'Enter':
        e.preventDefault()
        commitValue()
        break
      case 'Escape':
        e.preventDefault()
        e.stopPropagation() // Stop the event from reaching KeyboardNavigationController
        onCancel()
        break
      case 'Tab':
        e.preventDefault()
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
    <Input
      type="number"
      value={value}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
      autoFocus
      className="border-2 border-blue-500 shadow-lg"
      placeholder={(column as any).placeholder}
      step={column.type === 'number' ? 'any' : '1'}
    />
  )
}
