/**
 * Long Text Editor Overlay
 *
 * A full-screen modal overlay for editing long text content with rich text capabilities.
 * Provides a proper editing environment that's not constrained by cell boundaries.
 */

import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { createLogger } from '@/shared/lib/logging';
import { GRID_DIMENSIONS } from '../../constants/grid-dimensions';
import { cn } from '@/shared/lib/utils';

const fileLog = createLogger('components/custom/vibegrid/overlays/editors/LongTextEditor.tsx');

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
  const isOverLimit = !!(hasMaxLength && characterCount > column.maxLength!);

  // Create portal to render outside the grid container
  const portalTarget = document.body;

  return ReactDOM.createPortal(
    <div
      ref={modalRef}
      className="vibegrid-long-text-editor-overlay fixed inset-0 bg-black/50 flex items-center justify-center p-5"
      style={{
        zIndex: GRID_DIMENSIONS.Z_INDEX.MODAL_BACKDROP
      }}
      onClick={handleBackdropClick}
    >
      <div
        className="bg-background rounded-lg shadow-lg w-[90%] max-w-[600px] min-w-[400px] max-h-[70vh] min-h-[300px] flex flex-col overflow-hidden"
        style={{
          zIndex: GRID_DIMENSIONS.Z_INDEX.MODAL_CONTENT
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-border flex items-center justify-between bg-muted">
          <div>
            <h3 className="m-0 text-base font-semibold text-foreground">
              Edit {column.name}
            </h3>
            <p className="mt-1 mb-0 text-xs text-muted-foreground">
              Cell: {cell.rowId}:{cell.columnId}
            </p>
          </div>
          <button
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
              "flex-1 min-h-[150px] max-h-[400px] border rounded p-3 text-sm font-inherit leading-relaxed resize-y outline-none bg-background text-foreground",
              isOverLimit ? "bg-destructive/10 border-destructive" : "border-border"
            )}
          />

          {/* Character Count */}
          <div className="mt-2 flex justify-between items-center text-xs text-muted-foreground">
            <div>
              {hasMaxLength && (
                <span className={isOverLimit ? "text-destructive" : "text-muted-foreground"}>
                  {characterCount.toLocaleString()} / {column.maxLength!.toLocaleString()} characters
                  {isOverLimit && ' (over limit)'}
                </span>
              )}
              {!hasMaxLength && (
                <span>{characterCount.toLocaleString()} characters</span>
              )}
            </div>
            <div>Ctrl+Enter to save</div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-border flex justify-end gap-3 bg-muted">
          <button
            onClick={handleCancel}
            className="px-4 py-2 border border-border rounded bg-background text-foreground cursor-pointer text-sm hover:bg-accent"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isOverLimit}
            className={cn(
              "px-4 py-2 border-none rounded text-sm",
              isOverLimit
                ? "bg-muted text-muted-foreground cursor-not-allowed opacity-60"
                : "bg-primary text-primary-foreground cursor-pointer hover:bg-primary/90"
            )}
          >
            Save {isDirty && '*'}
          </button>
        </div>
      </div>
    </div>,
    portalTarget
  );
}