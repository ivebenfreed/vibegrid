import React from 'react'
import { getLogger } from '@/shared/lib/logging'
import type { CellRef, Column } from '../../types'
import { ValidationErrorDisplay } from './ValidationErrorDisplay'

const fileLog = getLogger(['vibegrid', 'overlays', 'editors', 'TextEditor'])

interface TextEditorProps {
  cell: CellRef
  column: Column
  initialValue: string
  onCommit: (value: string) => void
  onCancel: () => void
  onUpdate?: (value: string) => void
  onBlur?: () => void
  multiline?: boolean
  // Validation errors passed directly (portal is outside React context)
  validationErrors?: string[]
}

function TextEditorComponent({
  cell,
  column,
  initialValue,
  onCommit,
  onCancel,
  onUpdate,
  onBlur: _onBlur,
  multiline = false,
  validationErrors = [],
}: TextEditorProps) {
  const [value, setValue] = React.useState(initialValue || '')
  const inputRef = React.useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const hasUserInteracted = React.useRef(false)

  React.useEffect(() => {
    // Select text immediately on mount with a small delay to ensure proper focus
    const timeoutId = setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus()
        inputRef.current.select()
        fileLog.debug('TextEditor: Initial focus and select completed')
      }
    }, 10) // Small delay to ensure DOM is ready

    return () => clearTimeout(timeoutId)
  }, [])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    hasUserInteracted.current = true // Mark as user-initiated

    switch (e.key) {
      case 'Enter':
        if (!multiline || !e.shiftKey) {
          e.preventDefault()
          e.stopPropagation()
          fileLog.debug('TextEditor: Commit via Enter key')
          onCommit(value)
        }
        break
      case 'Escape':
        e.preventDefault()
        e.stopPropagation()
        fileLog.debug('TextEditor: Cancel via Escape key')
        onCancel()
        break
      case 'Tab':
        e.preventDefault()
        e.stopPropagation()
        fileLog.debug('TextEditor: Commit via Tab key')
        onCommit(value)
        break
    }
  }

  const handleBlur = () => {
    const currentCellId = `${cell.rowId}:${cell.columnId}`
    fileLog.debug('TextEditor: Blur event triggered', {
      hasUserInteracted: hasUserInteracted.current,
      value,
      cellId: currentCellId,
    })

    // If user has interacted, commit the changes
    if (hasUserInteracted.current && onCommit) {
      // Commit immediately - no delay needed
      // The service layer will handle any transitions to new edits
      fileLog.debug('TextEditor: Committing value on blur immediately')
      onCommit(value)
    } else {
      // If no user interaction, cancel instead of leaving in limbo
      fileLog.debug('TextEditor: Blur without user interaction - cancelling')
      onCancel()
    }
  }

  const handleFocus = () => {
    // Focus handler - can be used for future focus-related logic
    fileLog.debug('TextEditor: Focus received')
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
  const hasErrors = validationErrors.length > 0
  const inputStyle: React.CSSProperties = {
    width: '100%',
    height: multiline ? '100%' : 'auto',
    border: hasErrors ? '1px solid var(--destructive, #ef4444)' : 'none',
    outline: 'none',
    background: 'transparent',
    padding: '0 12px', // Match cell horizontal padding
    margin: '0',
    font: 'inherit',
    fontSize: 'inherit',
    color: 'inherit',
    lineHeight: multiline ? '1.5' : 'inherit',
    textAlign: 'inherit',
    resize: multiline ? 'none' : undefined,
    boxSizing: 'border-box',
  }

  const handleChange = (newValue: string) => {
    hasUserInteracted.current = true // Mark as user-initiated change
    fileLog.debug('TextEditor handleChange called with', { newValue })
    setValue(newValue)
    // Only call onUpdate if it's provided
    if (onUpdate) {
      fileLog.debug('TextEditor calling onUpdate with', { newValue })
      onUpdate(newValue)
    } else {
      fileLog.debug('TextEditor onUpdate is not provided')
    }
  }

  if (multiline) {
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
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          onFocus={handleFocus}
          style={inputStyle}
          placeholder={(column as any).placeholder}
          onMouseDown={(e) => {
            // Ensure textarea gets focus and stop propagation
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
        ref={inputRef as React.RefObject<HTMLInputElement>}
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        onFocus={handleFocus}
        style={inputStyle}
        type={column.type === 'email' ? 'email' : column.type === 'url' ? 'url' : 'text'}
        placeholder={(column as any).placeholder}
        maxLength={(column as any).maxLength}
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

// Export the component directly (no observer wrapper needed - portal is outside React context)
export const TextEditor = TextEditorComponent
