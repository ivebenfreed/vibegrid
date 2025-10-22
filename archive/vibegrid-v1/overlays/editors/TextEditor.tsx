import React from 'react';
import type { CellRef, Column } from '../../types';

interface TextEditorProps {
  cell: CellRef;
  column: Column;
  initialValue: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
  onUpdate?: (value: string) => void;
  onBlur?: () => void;
  multiline?: boolean;
}

function TextEditorComponent({
  cell,
  column,
  initialValue,
  onCommit,
  onCancel,
  onUpdate,
  onBlur,
  multiline = false
}: TextEditorProps) {

  const [value, setValue] = React.useState(initialValue || '');
  const inputRef = React.useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const hasUserInteracted = React.useRef(false);
  const blurTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  React.useEffect(() => {
    // Select text immediately on mount with a small delay to ensure proper focus
    const timeoutId = setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.select();
        console.log('🔍 TextEditor: Initial focus and select completed');
      }
    }, 10); // Small delay to ensure DOM is ready

    return () => clearTimeout(timeoutId);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    hasUserInteracted.current = true; // Mark as user-initiated

    switch (e.key) {
      case 'Enter':
        if (!multiline || !e.shiftKey) {
          e.preventDefault();
          console.log('🔍 TextEditor: Commit via Enter key');
          onCommit(value);
        }
        break;
      case 'Escape':
        e.preventDefault();
        e.stopPropagation(); // Stop the event from reaching KeyboardNavigationController
        console.log('🔍 TextEditor: Cancel via Escape key');
        onCancel();
        break;
      case 'Tab':
        e.preventDefault();
        console.log('🔍 TextEditor: Commit via Tab key');
        onCommit(value);
        break;
    }
  };

  const handleBlur = () => {
    console.log('🔍 TextEditor: Blur event triggered', {
      hasUserInteracted: hasUserInteracted.current,
      value,
      cellId: `${cell.rowId}:${cell.columnId}`
    });

    // If user has interacted, commit the changes
    if (hasUserInteracted.current && onCommit) {
      // Add a small delay to distinguish between accidental blur and intentional blur
      blurTimeoutRef.current = setTimeout(() => {
        console.log('🔍 TextEditor: Committing value on blur after delay');
        onCommit(value);
      }, 100);
    } else {
      // If no user interaction, don't commit - let outside click handler decide
      console.log('🔍 TextEditor: Blur without user interaction - not committing, leaving edit active');
    }
  };

  const handleFocus = () => {
    // Cancel any pending blur commit when regaining focus
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current);
      blurTimeoutRef.current = null;
      console.log('🔍 TextEditor: Cancelled blur commit due to refocus');
    }
  };

  // Container style to match cell layout
  const containerStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    fontSize: '13px',
    boxSizing: 'border-box',
  };

  // Input styles that match cell content exactly
  const inputStyle: React.CSSProperties = {
    width: '100%',
    height: multiline ? '100%' : 'auto',
    border: 'none',
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
  };

  const handleChange = (newValue: string) => {
    hasUserInteracted.current = true; // Mark as user-initiated change
    console.log('🔍 TextEditor handleChange called with:', newValue);
    setValue(newValue);
    // Only call onUpdate if it's provided
    if (onUpdate) {
      console.log('🔍 TextEditor calling onUpdate with:', newValue);
      onUpdate(newValue);
    } else {
      console.log('🔍 TextEditor onUpdate is not provided!');
    }
  };

  if (multiline) {
    return (
      <div 
        style={containerStyle}
        onMouseDown={(e) => {
          // Prevent event from bubbling to EventDelegationManager
          e.stopPropagation();
        }}
        onClick={(e) => {
          // Prevent event from bubbling to EventDelegationManager
          e.stopPropagation();
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
          placeholder={column.placeholder}
          onMouseDown={(e) => {
            // Ensure textarea gets focus and stop propagation
            e.stopPropagation();
          }}
          onClick={(e) => {
            // Stop propagation to prevent any parent handlers
            e.stopPropagation();
          }}
        />
      </div>
    );
  }

  return (
    <div 
      style={containerStyle}
      onMouseDown={(e) => {
        // Prevent event from bubbling to EventDelegationManager
        e.stopPropagation();
      }}
      onClick={(e) => {
        // Prevent event from bubbling to EventDelegationManager
        e.stopPropagation();
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
        placeholder={column.placeholder}
        maxLength={column.maxLength}
        onMouseDown={(e) => {
          // Ensure input gets focus and stop propagation
          e.stopPropagation();
        }}
        onClick={(e) => {
          // Stop propagation to prevent any parent handlers
          e.stopPropagation();
        }}
      />
    </div>
  );
}

// Memoize the TextEditor to prevent re-renders when parent re-renders
// Only re-render if cell ID changes or initialValue changes
export const TextEditor = React.memo(TextEditorComponent, (prevProps, nextProps) => {
  return (
    prevProps.cell.rowId === nextProps.cell.rowId &&
    prevProps.cell.columnId === nextProps.cell.columnId &&
    prevProps.initialValue === nextProps.initialValue &&
    prevProps.multiline === nextProps.multiline
  );
});