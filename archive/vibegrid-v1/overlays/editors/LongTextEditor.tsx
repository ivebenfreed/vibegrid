/**
 * Long Text Editor Overlay
 *
 * A full-screen modal overlay for editing long text content with rich text capabilities.
 * Provides a proper editing environment that's not constrained by cell boundaries.
 */

import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { log } from '@/logger';
import { GRID_DIMENSIONS } from '../../constants/grid-dimensions';

const fileLog = log('components/custom/vibegrid/overlays/editors/LongTextEditor.tsx');

interface LongTextEditorProps {
  cell: {
    rowId: string;
    columnId: string;
  };
  column: {
    name: string;
    placeholder?: string;
    maxLength?: number;
    richText?: boolean;
  };
  initialValue: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
  isOpen: boolean;
}

export function LongTextEditor({
  cell,
  column,
  initialValue,
  onCommit,
  onCancel,
  isOpen
}: LongTextEditorProps) {
  const [value, setValue] = useState(initialValue || '');
  const [isDirty, setIsDirty] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Reset value when initialValue changes or modal opens
  useEffect(() => {
    if (isOpen) {
      setValue(initialValue || '');
      setIsDirty(false);
      fileLog.debug('LongTextEditor opened', {
        cellId: `${cell.rowId}:${cell.columnId}`,
        initialLength: (initialValue || '').length
      });
    }
  }, [isOpen, initialValue, cell.rowId, cell.columnId]);

  // Focus textarea when modal opens
  useEffect(() => {
    if (isOpen && textareaRef.current) {
      const timeout = setTimeout(() => {
        textareaRef.current?.focus();
        textareaRef.current?.setSelectionRange(0, 0); // Put cursor at beginning
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

  const handleChange = (newValue: string) => {
    setValue(newValue);
    setIsDirty(newValue !== initialValue);
  };

  const handleSave = () => {
    fileLog.debug('LongTextEditor saving', {
      cellId: `${cell.rowId}:${cell.columnId}`,
      valueLength: value.length,
      isDirty
    });
    onCommit(value);
  };

  const handleCancel = () => {
    if (isDirty) {
      const confirmed = window.confirm(
        'You have unsaved changes. Are you sure you want to cancel?'
      );
      if (!confirmed) return;
    }

    fileLog.debug('LongTextEditor cancelled', {
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Ctrl+Enter or Cmd+Enter to save
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    }
  };

  if (!isOpen) return null;

  const characterCount = value.length;
  const hasMaxLength = column.maxLength && column.maxLength > 0;
  const isOverLimit = hasMaxLength && characterCount > column.maxLength!;

  // Create portal to render outside the grid container
  const portalTarget = document.body;

  return ReactDOM.createPortal(
    <div
      ref={modalRef}
      className="vibegrid-long-text-editor-overlay"
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
          maxWidth: '600px',
          minWidth: '400px',
          maxHeight: '70vh',
          minHeight: '300px',
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
              Edit {column.name}
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
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => handleChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={column.placeholder || `Enter ${column.name.toLowerCase()}...`}
            style={{
              flex: 1,
              minHeight: '150px',
              maxHeight: '400px',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              padding: '12px',
              fontSize: '14px',
              fontFamily: 'inherit',
              lineHeight: '1.5',
              resize: 'vertical',
              outline: 'none',
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
                  {characterCount.toLocaleString()} / {column.maxLength!.toLocaleString()} characters
                  {isOverLimit && ' (over limit)'}
                </span>
              )}
              {!hasMaxLength && (
                <span>{characterCount.toLocaleString()} characters</span>
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