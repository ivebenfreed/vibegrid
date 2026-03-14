import React from 'react'
import { getLogger } from '@/shared/lib/logging'
import type { CellRef, Column } from '../../types'
import { ValidationErrorDisplay } from './ValidationErrorDisplay'

const fileLog = getLogger(['vibegrid', 'overlays', 'editors', 'NumberEditor'])

interface NumberEditorProps {
  cell: CellRef
  column: Column
  initialValue: number | null
  onCommit: (value: number | null) => void
  onCancel: () => void
  // Validation errors passed directly (portal is outside React context)
  validationErrors?: string[]
}

export function NumberEditor({
  cell,
  column,
  initialValue,
  onCommit,
  onCancel,
  validationErrors = [],
}: NumberEditorProps) {
  const [value, setValue] = React.useState(initialValue?.toString() || '')
  const inputRef = React.useRef<HTMLInputElement>(null)
  const hasUserInteracted = React.useRef(false)

  React.useEffect(() => {
    // Select text immediately on mount with a small delay to ensure proper focus
    const timeoutId = setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus()
        inputRef.current.select()
        fileLog.debug('NumberEditor: Initial focus and select completed')
      }
    }, 10) // Small delay to ensure DOM is ready

    return () => clearTimeout(timeoutId)
  }, [])
  const hasErrors = validationErrors.length > 0

  const handleKeyDown = (e: React.KeyboardEvent) => {
    hasUserInteracted.current = true // Mark as user-initiated

    switch (e.key) {
      case 'Enter':
        e.preventDefault()
        e.stopPropagation() // Stop the event from bubbling up
        fileLog.debug('NumberEditor: Commit via Enter key', { value })
        commitValue()
        break
      case 'Escape':
        e.preventDefault()
        e.stopPropagation() // Stop the event from reaching KeyboardNavigationController
        fileLog.debug('NumberEditor: Cancel via Escape key')
        onCancel()
        break
      case 'Tab':
        e.preventDefault()
        e.stopPropagation() // Stop the event from bubbling up
        fileLog.debug('NumberEditor: Commit via Tab key', { value })
        commitValue()
        break
    }
  }

  const commitValue = () => {
    if (value === '') {
      onCommit(null)
    } else {
      const numValue = parseFloat(value)
      if (!Number.isNaN(numValue)) {
        onCommit(numValue)
      } else {
        onCancel() // Invalid number, cancel edit
      }
    }
  }

  const handleBlur = () => {
    const currentCellId = `${cell.rowId}:${cell.columnId}`
    fileLog.debug('NumberEditor: Blur event triggered', {
      hasUserInteracted: hasUserInteracted.current,
      value,
      cellId: currentCellId,
    })

    // If user has interacted, commit the changes
    if (hasUserInteracted.current) {
      fileLog.debug('NumberEditor: Committing value on blur immediately')
      commitValue()
    } else {
      // If no user interaction, cancel instead of leaving in limbo
      fileLog.debug('NumberEditor: Blur without user interaction - cancelling')
      onCancel()
    }
  }

  const handleFocus = () => {
    fileLog.debug('NumberEditor: Focus received')
  }

  const handleChange = (newValue: string) => {
    hasUserInteracted.current = true // Mark as user-initiated change
    fileLog.debug('NumberEditor handleChange called with', { newValue })
    // Allow empty, numbers, and decimal points
    if (newValue === '' || /^-?\d*\.?\d*$/.test(newValue)) {
      setValue(newValue)
    }
  }

  // Container style to match cell layout exactly
  const containerStyle: React.CSSProperties = {
    position: 'relative', // For validation error positioning
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    fontSize: '14px', // Match grid cell font size
    boxSizing: 'border-box',
  }

  // Input styles that match cell content exactly
  const inputStyle: React.CSSProperties = {
    width: '100%',
    height: 'auto',
    border: hasErrors ? '1px solid var(--destructive, #ef4444)' : 'none',
    outline: 'none',
    background: 'transparent',
    padding: '0 12px', // Match cell horizontal padding
    margin: '0',
    font: 'inherit',
    fontSize: 'inherit',
    color: 'inherit',
    lineHeight: 'inherit',
    textAlign: 'right', // Numbers are right-aligned
    boxSizing: 'border-box',
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: editor overlay captures events to prevent grid interaction
    // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard events handled by inner input
    <div
      style={containerStyle}
      onMouseDown={(e) => {
        // Prevent event from bubbling to EventDelegationManager
        e.stopPropagation()
      }}
      onClick={(e) => {
        // Prevent event from bubbling to EventDelegationManager
        e.stopPropagation()
      }}
    >
      <input
        ref={inputRef}
        type="number"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        onFocus={handleFocus}
        style={inputStyle}
        placeholder={(column as any).placeholder}
        step={column.type === 'number' ? 'any' : '1'}
        onMouseDown={(e) => {
          // Ensure input gets focus and stop propagation
          e.stopPropagation()
        }}
        onClick={(e) => {
          // Stop propagation to prevent any parent handlers
          e.stopPropagation()
        }}
      />
      <ValidationErrorDisplay errors={validationErrors} />
    </div>
  )
}
