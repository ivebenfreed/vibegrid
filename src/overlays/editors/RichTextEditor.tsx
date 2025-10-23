/**
 * Rich Text Editor Overlay
 *
 * A full-screen modal overlay for editing rich text content with formatting capabilities.
 * Uses a simple contentEditable approach with basic formatting tools.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { createLogger } from '@/lib/logging';
import { GRID_DIMENSIONS } from '../../constants/grid-dimensions';

const fileLog = createLogger('components/custom/vibegrid/overlays/editors/RichTextEditor.tsx');

interface RichTextEditorProps {
  cell: {
    rowId: string;
    columnId: string;
  };
  column: {
    name: string;
    placeholder?: string;
    maxLength?: number;
  };
  initialValue: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
  isOpen: boolean;
}

interface FormatButton {
  command: string;
  icon: string;
  title: string;
  requiresValue?: boolean;
}

const formatButtons: FormatButton[] = [
  { command: 'bold', icon: 'B', title: 'Bold (Ctrl+B)' },
  { command: 'italic', icon: 'I', title: 'Italic (Ctrl+I)' },
  { command: 'underline', icon: 'U', title: 'Underline (Ctrl+U)' },
  { command: 'strikeThrough', icon: 'S', title: 'Strikethrough' },
];

const listButtons: FormatButton[] = [
  { command: 'insertUnorderedList', icon: '•', title: 'Bullet List' },
  { command: 'insertOrderedList', icon: '1.', title: 'Numbered List' },
];

const alignButtons: FormatButton[] = [
  { command: 'justifyLeft', icon: '⟵', title: 'Align Left' },
  { command: 'justifyCenter', icon: '—', title: 'Align Center' },
  { command: 'justifyRight', icon: '⟶', title: 'Align Right' },
];

export function RichTextEditor({
  cell,
  column,
  initialValue,
  onCommit,
  onCancel,
  isOpen
}: RichTextEditorProps) {
  const [htmlValue, setHtmlValue] = useState(initialValue || '');
  const [isDirty, setIsDirty] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Convert plain text to HTML and vice versa
  const textToHtml = useCallback((text: string): string => {
    if (!text) return '';
    // Simple conversion: preserve line breaks and basic formatting
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');
  }, []);

  const htmlToText = useCallback((html: string): string => {
    if (!html) return '';
    // Create a temporary element to extract text content
    const temp = document.createElement('div');
    temp.innerHTML = html;
    return temp.textContent || temp.innerText || '';
  }, []);

  // Reset value when modal opens
  useEffect(() => {
    if (isOpen) {
      // Check if initialValue is HTML or plain text
      const isHtml = /<[^>]*>/.test(initialValue);
      const htmlContent = isHtml ? initialValue : textToHtml(initialValue);
      setHtmlValue(htmlContent);
      setIsDirty(false);

      fileLog.debug('RichTextEditor opened', {
        cellId: `${cell.rowId}:${cell.columnId}`,
        initialLength: (initialValue || '').length,
        isHtml
      });
    }
  }, [isOpen, initialValue, cell.rowId, cell.columnId, textToHtml]);

  // Focus editor when modal opens
  useEffect(() => {
    if (isOpen && editorRef.current) {
      const timeout = setTimeout(() => {
        editorRef.current?.focus();
        // Place cursor at the beginning
        const range = document.createRange();
        const selection = window.getSelection();
        if (editorRef.current && editorRef.current.firstChild) {
          range.setStart(editorRef.current.firstChild, 0);
          range.collapse(true);
          selection?.removeAllRanges();
          selection?.addRange(range);
        }
      }, 100);
      return () => clearTimeout(timeout);
    }
  }, [isOpen]);

  // Handle escape key to close modal
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        e.stopPropagation();
        handleCancel();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape, { capture: true });
      return () => document.removeEventListener('keydown', handleEscape, { capture: true });
    }
  }, [isOpen, isDirty]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [isOpen]);

  const handleInput = () => {
    if (editorRef.current) {
      const newContent = editorRef.current.innerHTML;
      setHtmlValue(newContent);
      setIsDirty(newContent !== (initialValue || ''));
    }
  };

  const handleSave = () => {
    // Return the HTML content as-is, let the caller decide how to handle it
    const content = editorRef.current?.innerHTML || htmlValue;
    fileLog.debug('RichTextEditor saving', {
      cellId: `${cell.rowId}:${cell.columnId}`,
      contentLength: content.length,
      isDirty
    });
    onCommit(content);
  };

  const handleCancel = () => {
    if (isDirty) {
      const confirmed = window.confirm(
        'You have unsaved changes. Are you sure you want to cancel?'
      );
      if (!confirmed) return;
    }

    fileLog.debug('RichTextEditor cancelled', {
      cellId: `${cell.rowId}:${cell.columnId}`,
      isDirty
    });
    onCancel();
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === modalRef.current) {
      handleCancel();
    }
  };

  const executeCommand = (command: string, value?: string) => {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
    handleInput(); // Update state after command
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Ctrl+Enter or Cmd+Enter to save
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    }

    // Handle common formatting shortcuts
    if (e.ctrlKey || e.metaKey) {
      switch (e.key.toLowerCase()) {
        case 'b':
          e.preventDefault();
          executeCommand('bold');
          break;
        case 'i':
          e.preventDefault();
          executeCommand('italic');
          break;
        case 'u':
          e.preventDefault();
          executeCommand('underline');
          break;
      }
    }
  };

  if (!isOpen) return null;

  const textLength = htmlToText(htmlValue).length;
  const hasMaxLength = column.maxLength && column.maxLength > 0;
  const isOverLimit = !!(hasMaxLength && textLength > column.maxLength!);

  // Create portal to render outside the grid container
  const portalTarget = document.body;

  return ReactDOM.createPortal(
    <div
      ref={modalRef}
      className="vibegrid-rich-text-editor-overlay"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        zIndex: GRID_DIMENSIONS.Z_INDEX.MODAL_BACKDROP,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px'
      }}
      onClick={handleBackdropClick}
    >
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)',
          width: '90%',
          maxWidth: '700px',
          minWidth: '500px',
          maxHeight: '75vh',
          minHeight: '400px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          zIndex: GRID_DIMENSIONS.Z_INDEX.MODAL_CONTENT
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #e5e5e5',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#f8f9fa'
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>
              Edit {column.name} (Rich Text)
            </h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#666' }}>
              Cell: {cell.rowId}:{cell.columnId}
            </p>
          </div>
          <button
            onClick={handleCancel}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '18px',
              cursor: 'pointer',
              padding: '4px',
              color: '#666'
            }}
            title="Close (Esc)"
          >
            ×
          </button>
        </div>

        {/* Toolbar */}
        <div
          style={{
            padding: '12px 20px',
            borderBottom: '1px solid #e5e5e5',
            display: 'flex',
            gap: '12px',
            alignItems: 'center',
            backgroundColor: '#fafbfc'
          }}
        >
          {/* Format buttons */}
          <div style={{ display: 'flex', gap: '4px' }}>
            {formatButtons.map((button) => (
              <button
                key={button.command}
                onClick={() => executeCommand(button.command)}
                style={{
                  width: '32px',
                  height: '32px',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  backgroundColor: 'white',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: button.command === 'bold' ? 'bold' : 'normal',
                  fontStyle: button.command === 'italic' ? 'italic' : 'normal',
                  textDecoration: button.command === 'underline' ? 'underline' :
                                 button.command === 'strikeThrough' ? 'line-through' : 'none'
                }}
                title={button.title}
              >
                {button.icon}
              </button>
            ))}
          </div>

          <div style={{ width: '1px', height: '24px', backgroundColor: '#d1d5db' }} />

          {/* List buttons */}
          <div style={{ display: 'flex', gap: '4px' }}>
            {listButtons.map((button) => (
              <button
                key={button.command}
                onClick={() => executeCommand(button.command)}
                style={{
                  padding: '6px 8px',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  backgroundColor: 'white',
                  cursor: 'pointer',
                  fontSize: '12px'
                }}
                title={button.title}
              >
                {button.icon}
              </button>
            ))}
          </div>

          <div style={{ width: '1px', height: '24px', backgroundColor: '#d1d5db' }} />

          {/* Alignment buttons */}
          <div style={{ display: 'flex', gap: '4px' }}>
            {alignButtons.map((button) => (
              <button
                key={button.command}
                onClick={() => executeCommand(button.command)}
                style={{
                  width: '32px',
                  height: '32px',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  backgroundColor: 'white',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
                title={button.title}
              >
                {button.icon}
              </button>
            ))}
          </div>

          <div style={{ width: '1px', height: '24px', backgroundColor: '#d1d5db' }} />

          {/* Clear formatting */}
          <button
            onClick={() => executeCommand('removeFormat')}
            style={{
              padding: '6px 12px',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              backgroundColor: 'white',
              cursor: 'pointer',
              fontSize: '12px',
              color: '#666'
            }}
            title="Clear formatting"
          >
            Clear
          </button>
        </div>

        {/* Content Area */}
        <div
          style={{
            flex: 1,
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}
        >
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            onInput={handleInput}
            onKeyDown={handleKeyDown}
            dangerouslySetInnerHTML={{ __html: htmlValue }}
            style={{
              flex: 1,
              minHeight: '200px',
              maxHeight: '350px',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              padding: '12px',
              fontSize: '14px',
              fontFamily: 'inherit',
              lineHeight: '1.5',
              outline: 'none',
              overflow: 'auto',
              backgroundColor: isOverLimit ? '#fef2f2' : 'white',
              borderColor: isOverLimit ? '#ef4444' : '#d1d5db'
            }}
          />

          {/* Character Count */}
          <div
            style={{
              marginTop: '8px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '12px',
              color: '#666'
            }}
          >
            <div>
              {hasMaxLength && (
                <span style={{ color: isOverLimit ? '#ef4444' : '#666' }}>
                  {textLength.toLocaleString()} / {column.maxLength!.toLocaleString()} characters
                  {isOverLimit && ' (over limit)'}
                </span>
              )}
              {!hasMaxLength && (
                <span>{textLength.toLocaleString()} characters</span>
              )}
            </div>
            <div style={{ color: '#9ca3af' }}>
              Ctrl+Enter to save
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '16px 20px',
            borderTop: '1px solid #e5e5e5',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '12px',
            backgroundColor: '#f8f9fa'
          }}
        >
          <button
            onClick={handleCancel}
            style={{
              padding: '8px 16px',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              backgroundColor: 'white',
              color: '#374151',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isOverLimit}
            style={{
              padding: '8px 16px',
              border: 'none',
              borderRadius: '4px',
              backgroundColor: isOverLimit ? '#d1d5db' : '#3b82f6',
              color: 'white',
              cursor: isOverLimit ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              opacity: isOverLimit ? 0.6 : 1
            }}
          >
            Save {isDirty && '*'}
          </button>
        </div>
      </div>
    </div>,
    portalTarget
  );
}