/**
 * Reference Select Editor for system and custom option fields
 */

import React, { useState, useEffect, useRef } from 'react';
import { useReferenceOptions } from '@/legend-state/reference-system/hooks';
import type { EditorProps } from './index';

export function ReferenceSelectEditor({ 
  cell, 
  column, 
  initialValue, 
  onCommit, 
  onCancel, 
  onUpdate,
  onBlur 
}: EditorProps) {
  const [value, setValue] = useState<string>(initialValue || '');
  const selectRef = useRef<HTMLSelectElement>(null);

  // Get options using the universal hook
  const { options, isLoading, error } = useReferenceOptions({
    referenceType: column.referenceType || 'system',
    systemOptionType: column.systemOptionType,
    systemArchetype: column.systemArchetype,
    customOptionSet: column.customOptionSet,
    referenceEntity: column.referenceEntity  // NEW: Pass entity reference info
  });

  useEffect(() => {
    // Focus the select element when mounted
    if (selectRef.current) {
      selectRef.current.focus();
    }
  }, []);

  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newValue = event.target.value;
    setValue(newValue);
    onUpdate?.(newValue);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      onCommit(value);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
    }
  };

  const handleBlur = () => {
    onCommit(value);
    onBlur?.();
  };

  // Debug logging
  useEffect(() => {
    console.log('[ReferenceSelectEditor] Options updated:', {
      columnId: column.id,
      referenceType: column.referenceType,
      systemOptionType: column.systemOptionType,
      systemArchetype: column.systemArchetype,
      customOptionSet: column.customOptionSet,
      referenceEntity: column.referenceEntity,  // NEW: Log entity reference
      optionsCount: options.length,
      isLoading,
      error,
      options: options.slice(0, 3) // Log first 3 for debugging
    });
  }, [options, isLoading, error, column.id]);

  return (
    <select
      ref={selectRef}
      value={value}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
      className="w-full px-2 py-1 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
    >
      <option value="">Select option...</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}