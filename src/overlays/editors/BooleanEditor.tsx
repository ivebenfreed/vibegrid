import React from 'react'
import type { CellRef, Column } from '../../types'
import { ComboboxEditor } from './ComboboxEditor'

interface BooleanEditorProps {
  cell: CellRef
  column: Column
  initialValue: boolean | null
  onCommit: (value: boolean | null) => void
  onCancel: () => void
  variant?: 'checkbox' | 'switch'
}

export function BooleanEditor({
  cell,
  column,
  initialValue,
  onCommit,
  onCancel,
  variant = 'checkbox',
}: BooleanEditorProps) {
  // Convert boolean to string for ComboboxEditor
  const stringValue = initialValue === null ? null : String(initialValue)

  const handleCommit = (value: any) => {
    if (value === null) {
      onCommit(null)
    } else {
      onCommit(value === 'true')
    }
  }

  // Create boolean options
  const booleanColumn = {
    ...column,
    options: [
      { value: 'true', label: 'Yes' },
      { value: 'false', label: 'No' },
    ],
  }

  return (
    <ComboboxEditor
      cell={cell}
      column={booleanColumn}
      initialValue={stringValue}
      onCommit={handleCommit}
      onCancel={onCancel}
      placeholder="Select..."
      searchPlaceholder="Search..."
    />
  )
}
