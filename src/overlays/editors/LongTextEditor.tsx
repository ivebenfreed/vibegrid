/**
 * Long Text Editor Overlay
 *
 * A full-screen modal overlay for editing long text content with rich text capabilities.
 * Provides a proper editing environment that's not constrained by cell boundaries.
 */

import type React from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import ReactDOM from 'react-dom'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shared/components/ui/alert-dialog'
import { getLogger } from '@/shared/lib/logging'
import { cn } from '@/shared/lib/utils'
import { GRID_DIMENSIONS } from '../../constants/grid-dimensions'

const fileLog = getLogger(['custom', 'vibegrid', 'overlays', 'editors', 'LongTextEditor.tsx'])

interface LongTextEditorProps {
  cell: {
    rowId: string
    columnId: string
  }
  column: {
    name: string
    placeholder?: string
    maxLength?: number
    richText?: boolean
  }
  initialValue: string
  onCommit: (value: string) => void
  onCancel: () => void
  isOpen: boolean
}

export function LongTextEditor({ cell, column, initialValue, onCommit, onCancel, isOpen }: LongTextEditorProps) {
  const [value, setValue] = useState(initialValue || '')
  const [isDirty, setIsDirty] = useState(false)
  const [showDiscardDialog, setShowDiscardDialog] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const modalRef = useRef<HTMLDivElement>(null)

  // Reset value when initialValue changes or modal opens
  useEffect(() => {
    if (isOpen) {
      setValue(initialValue || '')
      setIsDirty(false)
      fileLog.debug('LongTextEditor opened', {
        cellId: `${cell.rowId}:${cell.columnId}`,
        initialLength: (initialValue || '').length,
      })
    }
  }, [isOpen, initialValue, cell.rowId, cell.columnId])

  // Focus textarea when modal opens
  useEffect(() => {
    if (isOpen && textareaRef.current) {
      const timeout = setTimeout(() => {
        textareaRef.current?.focus()
        textareaRef.current?.setSelectionRange(0, 0) // Put cursor at beginning
      }, 100)
      return () => clearTimeout(timeout)
    }
  }, [isOpen])

  // Handler functions (declared before useEffect that uses them)
  const handleChange = (newValue: string) => {
    setValue(newValue)
    setIsDirty(newValue !== initialValue)
  }

  const handleSave = () => {
    fileLog.debug('LongTextEditor saving', {
      cellId: `${cell.rowId}:${cell.columnId}`,
      valueLength: value.length,
      isDirty,
    })
    onCommit(value)
  }

  const handleCancel = useCallback(() => {
    if (isDirty) {
      setShowDiscardDialog(true)
      return
    }

    fileLog.debug('LongTextEditor cancelled', {
      cellId: `${cell.rowId}:${cell.columnId}`,
      isDirty,
    })
    onCancel()
  }, [isDirty, cell.rowId, cell.columnId, onCancel])

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
  }, [isOpen, handleCancel])

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = ''
      }
    }
  }, [isOpen])

  const handleConfirmDiscard = () => {
    setShowDiscardDialog(false)
    fileLog.debug('LongTextEditor cancelled (discarded changes)', {
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Ctrl+Enter or Cmd+Enter to save
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      handleSave()
    }
  }

  if (!isOpen) return null

  const characterCount = value.length
  const hasMaxLength = column.maxLength && column.maxLength > 0
  const isOverLimit = !!(hasMaxLength && characterCount > column.maxLength!)

  // Create portal to render outside the grid container
  const portalTarget = document.body

  return ReactDOM.createPortal(
    <div
      ref={modalRef}
      className="vibegridx-editing-portal vibegridx-modal-editor vibegrid-long-text-editor-overlay fixed inset-0 bg-black/50 flex items-center justify-center p-5"
      data-cell-id={`${cell.rowId}:${cell.columnId}`}
      style={{
        zIndex: GRID_DIMENSIONS.Z_INDEX.MODAL_BACKDROP,
      }}
      onClick={handleBackdropClick}
    >
      <div
        className="bg-background rounded-lg shadow-lg w-[90%] max-w-[600px] min-w-[400px] max-h-[70vh] min-h-[300px] flex flex-col overflow-hidden"
        style={{
          zIndex: GRID_DIMENSIONS.Z_INDEX.MODAL_CONTENT,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-border flex items-center justify-between bg-muted">
          <div>
            <h3 className="m-0 text-base font-semibold text-foreground">Edit {column.name}</h3>
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

        {/* Content Area */}
        <div className="flex-1 p-5 flex flex-col overflow-hidden">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => handleChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={column.placeholder || `Enter ${column.name.toLowerCase()}...`}
            className={cn(
              'flex-1 min-h-[150px] max-h-[400px] border rounded p-3 text-sm font-inherit leading-relaxed resize-y outline-none bg-background text-foreground',
              isOverLimit ? 'bg-destructive/10 border-destructive' : 'border-border',
            )}
          />

          {/* Character Count */}
          <div className="mt-2 flex justify-between items-center text-xs text-muted-foreground">
            <div>
              {hasMaxLength && (
                <span className={isOverLimit ? 'text-destructive' : 'text-muted-foreground'}>
                  {characterCount.toLocaleString()} / {column.maxLength!.toLocaleString()} characters
                  {isOverLimit && ' (over limit)'}
                </span>
              )}
              {!hasMaxLength && <span>{characterCount.toLocaleString()} characters</span>}
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

      <AlertDialog open={showDiscardDialog} onOpenChange={setShowDiscardDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard Changes?</AlertDialogTitle>
            <AlertDialogDescription>You have unsaved changes. Are you sure you want to cancel?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDiscard}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Discard Changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>,
    portalTarget,
  )
}
