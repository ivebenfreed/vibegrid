/**
 * Rich Text Editor Overlay
 *
 * A full-screen modal overlay for editing rich text content with formatting capabilities.
 * Uses a simple contentEditable approach with basic formatting tools.
 */

import type React from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import ReactDOM from 'react-dom'
import { getLogger } from '@/shared/lib/logging'
import { cn } from '@/shared/lib/utils'
import { GRID_DIMENSIONS } from '../../constants/grid-dimensions'

const fileLog = getLogger(['custom', 'vibegrid', 'overlays', 'editors', 'RichTextEditor.tsx'])

interface RichTextEditorProps {
  cell: {
    rowId: string
    columnId: string
  }
  column: {
    name: string
    placeholder?: string
    maxLength?: number
  }
  initialValue: string
  onCommit: (value: string) => void
  onCancel: () => void
  isOpen: boolean
}

interface FormatButton {
  command: string
  icon: string
  title: string
  requiresValue?: boolean
}

const formatButtons: FormatButton[] = [
  { command: 'bold', icon: 'B', title: 'Bold (Ctrl+B)' },
  { command: 'italic', icon: 'I', title: 'Italic (Ctrl+I)' },
  { command: 'underline', icon: 'U', title: 'Underline (Ctrl+U)' },
  { command: 'strikeThrough', icon: 'S', title: 'Strikethrough' },
]

const listButtons: FormatButton[] = [
  { command: 'insertUnorderedList', icon: '•', title: 'Bullet List' },
  { command: 'insertOrderedList', icon: '1.', title: 'Numbered List' },
]

const alignButtons: FormatButton[] = [
  { command: 'justifyLeft', icon: '⟵', title: 'Align Left' },
  { command: 'justifyCenter', icon: '—', title: 'Align Center' },
  { command: 'justifyRight', icon: '⟶', title: 'Align Right' },
]

export function RichTextEditor({
  cell,
  column,
  initialValue,
  onCommit,
  onCancel,
  isOpen,
}: RichTextEditorProps) {
  const [htmlValue, setHtmlValue] = useState(initialValue || '')
  const [isDirty, setIsDirty] = useState(false)
  const editorRef = useRef<HTMLDivElement>(null)
  const modalRef = useRef<HTMLDivElement>(null)

  // Convert plain text to HTML and vice versa
  const textToHtml = useCallback((text: string): string => {
    if (!text) return ''
    // Simple conversion: preserve line breaks and basic formatting
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>')
  }, [])

  const htmlToText = useCallback((html: string): string => {
    if (!html) return ''
    // Create a temporary element to extract text content
    const temp = document.createElement('div')
    temp.innerHTML = html
    return temp.textContent || temp.innerText || ''
  }, [])

  // Reset value when modal opens
  useEffect(() => {
    if (isOpen) {
      // Check if initialValue is HTML or plain text
      const isHtml = /<[^>]*>/.test(initialValue)
      const htmlContent = isHtml ? initialValue : textToHtml(initialValue)
      setHtmlValue(htmlContent)
      setIsDirty(false)

      fileLog.debug('RichTextEditor opened', {
        cellId: `${cell.rowId}:${cell.columnId}`,
        initialLength: (initialValue || '').length,
        isHtml,
      })
    }
  }, [isOpen, initialValue, cell.rowId, cell.columnId, textToHtml])

  // Focus editor when modal opens
  useEffect(() => {
    if (isOpen && editorRef.current) {
      const timeout = setTimeout(() => {
        editorRef.current?.focus()
        // Place cursor at the beginning
        const range = document.createRange()
        const selection = window.getSelection()
        if (editorRef.current && editorRef.current.firstChild) {
          range.setStart(editorRef.current.firstChild, 0)
          range.collapse(true)
          selection?.removeAllRanges()
          selection?.addRange(range)
        }
      }, 100)
      return () => clearTimeout(timeout)
    }
  }, [isOpen])

  // Handle escape key to close modal
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        e.preventDefault()
        e.stopPropagation()
        handleCancel()
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape, { capture: true })
      return () => document.removeEventListener('keydown', handleEscape, { capture: true })
    }
  }, [isOpen, isDirty])

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = ''
      }
    }
  }, [isOpen])

  const handleInput = () => {
    if (editorRef.current) {
      const newContent = editorRef.current.innerHTML
      setHtmlValue(newContent)
      setIsDirty(newContent !== (initialValue || ''))
    }
  }

  const handleSave = () => {
    // Return the HTML content as-is, let the caller decide how to handle it
    const content = editorRef.current?.innerHTML || htmlValue
    fileLog.debug('RichTextEditor saving', {
      cellId: `${cell.rowId}:${cell.columnId}`,
      contentLength: content.length,
      isDirty,
    })
    onCommit(content)
  }

  const handleCancel = () => {
    if (isDirty) {
      const confirmed = window.confirm('You have unsaved changes. Are you sure you want to cancel?')
      if (!confirmed) return
    }

    fileLog.debug('RichTextEditor cancelled', {
      cellId: `${cell.rowId}:${cell.columnId}`,
      isDirty,
    })
    onCancel()
  }

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === modalRef.current) {
      handleCancel()
    }
  }

  const executeCommand = (command: string, value?: string) => {
    document.execCommand(command, false, value)
    editorRef.current?.focus()
    handleInput() // Update state after command
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Ctrl+Enter or Cmd+Enter to save
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      handleSave()
    }

    // Handle common formatting shortcuts
    if (e.ctrlKey || e.metaKey) {
      switch (e.key.toLowerCase()) {
        case 'b':
          e.preventDefault()
          executeCommand('bold')
          break
        case 'i':
          e.preventDefault()
          executeCommand('italic')
          break
        case 'u':
          e.preventDefault()
          executeCommand('underline')
          break
      }
    }
  }

  if (!isOpen) return null

  const textLength = htmlToText(htmlValue).length
  const hasMaxLength = column.maxLength && column.maxLength > 0
  const isOverLimit = !!(hasMaxLength && textLength > column.maxLength!)

  // Create portal to render outside the grid container
  const portalTarget = document.body

  return ReactDOM.createPortal(
    <div
      ref={modalRef}
      className="vibegrid-rich-text-editor-overlay fixed inset-0 bg-black/50 flex items-center justify-center p-5"
      style={{
        zIndex: GRID_DIMENSIONS.Z_INDEX.MODAL_BACKDROP,
      }}
      onClick={handleBackdropClick}
    >
      <div
        className="bg-background rounded-lg shadow-lg w-[90%] max-w-[700px] min-w-[500px] max-h-[75vh] min-h-[400px] flex flex-col overflow-hidden"
        style={{
          zIndex: GRID_DIMENSIONS.Z_INDEX.MODAL_CONTENT,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-border flex items-center justify-between bg-muted">
          <div>
            <h3 className="m-0 text-base font-semibold text-foreground">
              Edit {column.name} (Rich Text)
            </h3>
            <p className="mt-1 mb-0 text-xs text-muted-foreground">
              Cell: {cell.rowId}:{cell.columnId}
            </p>
          </div>
          <button
            type="button"
            onClick={handleCancel}
            className="bg-transparent border-none text-lg cursor-pointer p-1 text-muted-foreground hover:text-foreground"
            title="Close (Esc)"
          >
            ×
          </button>
        </div>

        {/* Toolbar */}
        <div className="px-5 py-3 border-b border-border flex gap-3 items-center bg-muted">
          {/* Format buttons */}
          <div className="flex gap-1">
            {formatButtons.map((button) => (
              <button
                type="button"
                key={button.command}
                onClick={() => executeCommand(button.command)}
                className="w-8 h-8 border border-border rounded bg-background text-foreground cursor-pointer text-sm hover:bg-accent"
                style={{
                  fontWeight: button.command === 'bold' ? 'bold' : 'normal',
                  fontStyle: button.command === 'italic' ? 'italic' : 'normal',
                  textDecoration:
                    button.command === 'underline'
                      ? 'underline'
                      : button.command === 'strikeThrough'
                        ? 'line-through'
                        : 'none',
                }}
                title={button.title}
              >
                {button.icon}
              </button>
            ))}
          </div>

          <div className="w-px h-6 bg-border" />

          {/* List buttons */}
          <div className="flex gap-1">
            {listButtons.map((button) => (
              <button
                type="button"
                key={button.command}
                onClick={() => executeCommand(button.command)}
                className="px-2 py-1.5 border border-border rounded bg-background text-foreground cursor-pointer text-xs hover:bg-accent"
                title={button.title}
              >
                {button.icon}
              </button>
            ))}
          </div>

          <div className="w-px h-6 bg-border" />

          {/* Alignment buttons */}
          <div className="flex gap-1">
            {alignButtons.map((button) => (
              <button
                type="button"
                key={button.command}
                onClick={() => executeCommand(button.command)}
                className="w-8 h-8 border border-border rounded bg-background text-foreground cursor-pointer text-sm hover:bg-accent"
                title={button.title}
              >
                {button.icon}
              </button>
            ))}
          </div>

          <div className="w-px h-6 bg-border" />

          {/* Clear formatting */}
          <button
            type="button"
            onClick={() => executeCommand('removeFormat')}
            className="px-3 py-1.5 border border-border rounded bg-background text-foreground cursor-pointer text-xs hover:bg-accent"
            title="Clear formatting"
          >
            Clear
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 p-5 flex flex-col overflow-hidden">
          {/* biome-ignore lint/security/noDangerouslySetInnerHtml: Required for rich text editing */}
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            onInput={handleInput}
            onKeyDown={handleKeyDown}
            dangerouslySetInnerHTML={{ __html: htmlValue }}
            className={cn(
              'flex-1 min-h-[200px] max-h-[350px] border rounded p-3 text-sm font-inherit leading-relaxed outline-none overflow-auto',
              isOverLimit
                ? 'bg-destructive/10 border-destructive'
                : 'bg-background text-foreground border-border',
            )}
          />

          {/* Character Count */}
          <div className="mt-2 flex justify-between items-center text-xs text-muted-foreground">
            <div>
              {hasMaxLength && (
                <span className={isOverLimit ? 'text-destructive' : 'text-muted-foreground'}>
                  {textLength.toLocaleString()} / {column.maxLength!.toLocaleString()} characters
                  {isOverLimit && ' (over limit)'}
                </span>
              )}
              {!hasMaxLength && <span>{textLength.toLocaleString()} characters</span>}
            </div>
            <div>Ctrl+Enter to save</div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-border flex justify-end gap-3 bg-muted">
          <button
            type="button"
            onClick={handleCancel}
            className="px-4 py-2 border border-border rounded bg-background text-foreground cursor-pointer text-sm hover:bg-accent"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isOverLimit}
            className={cn(
              'px-4 py-2 border-none rounded text-sm',
              isOverLimit
                ? 'bg-muted text-muted-foreground cursor-not-allowed opacity-60'
                : 'bg-primary text-primary-foreground cursor-pointer hover:bg-primary/90',
            )}
          >
            Save {isDirty && '*'}
          </button>
        </div>
      </div>
    </div>,
    portalTarget,
  )
}
