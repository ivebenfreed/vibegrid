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
  
  React.useEffect(() => {
    // Select text immediately on mount
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, []);
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'Enter':
        if (!multiline || !e.shiftKey) {
          e.preventDefault();
          onCommit(value);
        }
        break;
      case 'Escape':
        e.preventDefault();
        onCancel();
        break;
      case 'Tab':
        e.preventDefault();
        onCommit(value);
        break;
    }
  };

  const handleBlur = () => {
    // Commit on blur - this is standard behavior
    if (onCommit) {
      onCommit(value);
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