/**
 * MultiSelectEditor - Multi-select editor backed by ComboboxEditor.
 *
 * This replaces the previous placeholder implementation and gives tags/select-multi
 * fields a working editing experience with search + keyboard support.
 */

import { useMemo } from 'react'
import { getLogger } from '@/shared/lib/logging'
import type { CellRef, Column } from '../../types'
import { ComboboxEditor } from './ComboboxEditor'

const fileLog = getLogger(['vibegrid', 'overlays', 'editors', 'MultiSelectEditor'])

interface MultiSelectEditorProps {
  cell: CellRef
  column: Column
  initialValue: string[] | string | null
  onCommit: (value: string[]) => void
  onCancel: () => void
}

function normalizeInitialValue(initialValue: string[] | string | null): string[] {
  if (Array.isArray(initialValue)) {
    return initialValue.map((value) => String(value)).filter((value) => value.length > 0)
  }

  if (typeof initialValue === 'string') {
    return initialValue
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
  }

  return []
}

export function MultiSelectEditor({
  cell,
  column,
  initialValue,
  onCommit,
  onCancel,
}: MultiSelectEditorProps) {
  const normalizedInitialValue = useMemo(() => normalizeInitialValue(initialValue), [initialValue])

  return (
    <ComboboxEditor
      cell={cell}
      column={column}
      initialValue={normalizedInitialValue}
      isMultiSelect={true}
      placeholder="Select items..."
      searchPlaceholder="Search options..."
      onCommit={(value) => {
        if (Array.isArray(value)) {
          onCommit(value.map((entry) => String(entry)))
          return
        }

        if (typeof value === 'string' && value.length > 0) {
          onCommit([value])
          return
        }

        fileLog.debug('MultiSelectEditor received non-array commit value, defaulting to empty', {
          valueType: typeof value,
          value,
          columnId: column.id,
        })
        onCommit([])
      }}
      onCancel={onCancel}
    />
  )
}
