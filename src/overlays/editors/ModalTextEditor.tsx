/**
 * Modal Text Editor
 *
 * A special editor that immediately opens a modal overlay for text editing.
 * This bypasses the normal inline editing flow for long text content.
 */

import React, { useEffect, useState } from 'react'
import { createLogger } from '@/shared/lib/logging'
import type { CellRef, Column } from '../../types'
import { LongTextEditor } from './LongTextEditor'
import { RichTextEditor } from './RichTextEditor'

const fileLog = createLogger('components/custom/vibegrid/overlays/editors/ModalTextEditor.tsx')

interface ModalTextEditorProps {
  cell: CellRef
  column: Column
  initialValue: string
  onCommit: (value: string) => void
  onCancel: () => void
  onUpdate?: (value: string) => void
  onBlur?: () => void
  editorType: 'longtext' | 'richtext'
}

export function ModalTextEditor({
  cell,
  column,
  initialValue,
  onCommit,
  onCancel,
  onUpdate,
  onBlur,
  editorType,
}: ModalTextEditorProps) {
  const [isOpen, setIsOpen] = useState(false)

  // Immediately open the modal when this component mounts
  useEffect(() => {
    fileLog.debug('ModalTextEditor mounting, opening modal', {
      editorType,
      cellId: `${cell.rowId}:${cell.columnId}`,
      initialValueLength: (initialValue || '').length,
    })

    setIsOpen(true)
  }, [cell.rowId, cell.columnId, editorType, initialValue])

  const handleCommit = (value: string) => {
    fileLog.debug('ModalTextEditor committing', {
      editorType,
      cellId: `${cell.rowId}:${cell.columnId}`,
      valueLength: value.length,
    })

    setIsOpen(false)
    // Small delay to ensure state updates before calling onCommit
    setTimeout(() => onCommit(value), 0)
  }

  const handleCancel = () => {
    fileLog.debug('ModalTextEditor cancelling', {
      editorType,
      cellId: `${cell.rowId}:${cell.columnId}`,
    })

    setIsOpen(false)
    // Small delay to ensure state updates before calling onCancel
    setTimeout(() => onCancel(), 0)
  }

  return (
    <>
      {/* Show the original cell content during editing */}
      <div
        style={{
          width: '100%',
          height: '100%',
          backgroundColor: 'transparent',
          display: 'flex',
          alignItems: 'center',
          padding: '0 12px',
          fontSize: '13px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          color: isOpen ? '#666' : 'inherit',
          opacity: isOpen ? 0.7 : 1,
        }}
      >
        {initialValue || ''}
      </div>

      {editorType === 'longtext' ? (
        <LongTextEditor
          cell={cell}
          column={column}
          initialValue={initialValue}
          onCommit={handleCommit}
          onCancel={handleCancel}
          isOpen={isOpen}
        />
      ) : (
        <RichTextEditor
          cell={cell}
          column={column}
          initialValue={initialValue}
          onCommit={handleCommit}
          onCancel={handleCancel}
          isOpen={isOpen}
        />
      )}
    </>
  )
}
