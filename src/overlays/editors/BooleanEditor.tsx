import { Check } from 'lucide-react'
import React from 'react'
import type { CellRef, Column } from '../../types'

interface BooleanEditorProps {
  cell: CellRef
  column: Column
  initialValue: boolean | null
  onCommit: (value: boolean | null) => void
  onCancel: () => void
  variant?: 'checkbox' | 'switch'
}

export function BooleanEditor({
  cell: _cell,
  column: _column,
  initialValue,
  onCommit,
  onCancel,
  variant: _variant = 'checkbox',
}: BooleanEditorProps) {
  const [hasCommitted, setHasCommitted] = React.useState(false)
  const options = [
    { value: 'true', label: 'Yes' },
    { value: 'false', label: 'No' },
  ]

  const handleSelect = (value: string) => {
    if (hasCommitted) return
    setHasCommitted(true)
    if (value === '__null__') {
      onCommit(null)
    } else {
      onCommit(value === 'true')
    }
  }

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onCancel()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onCancel])

  const stringValue = initialValue === null ? null : String(initialValue)

  return (
    <div className="w-full border rounded-md shadow-lg bg-background">
      <div className="p-1">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`flex w-full cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none hover:bg-accent hover:text-accent-foreground ${
              stringValue === opt.value ? 'bg-accent/50 font-medium' : ''
            }`}
            onClick={() => handleSelect(opt.value)}
          >
            <span className="flex-1">{opt.label}</span>
            {stringValue === opt.value && <Check className="h-4 w-4 text-primary" />}
          </button>
        ))}
      </div>
    </div>
  )
}
