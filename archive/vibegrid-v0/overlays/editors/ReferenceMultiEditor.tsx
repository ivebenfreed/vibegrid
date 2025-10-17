/**
 * Reference Multi Editor for multi-select reference fields
 */

import React, { useState, useEffect, useRef } from 'react';
import { useReferenceOptions } from '@/legend-state/reference-system/hooks';
import type { EditorProps } from './index';

export function ReferenceMultiEditor({ 
  cell, 
  column, 
  initialValue, 
  onCommit, 
  onCancel, 
  onUpdate,
  onBlur 
}: EditorProps) {
  const [selectedValues, setSelectedValues] = useState<string[]>(
    Array.isArray(initialValue) ? initialValue : initialValue ? [initialValue] : []
  );
  const containerRef = useRef<HTMLDivElement>(null);

  // Get options using the universal hook
  const { options, isLoading, error } = useReferenceOptions({
    referenceType: column.referenceType || 'system',
    systemOptionType: column.systemOptionType,
    systemArchetype: column.systemArchetype,
    customOptionSet: column.customOptionSet
  });

  useEffect(() => {
    // Focus the container when mounted
    if (containerRef.current) {
      containerRef.current.focus();
    }
  }, []);

  const handleToggleOption = (optionValue: string) => {
    const newValues = selectedValues.includes(optionValue)
      ? selectedValues.filter(v => v !== optionValue)
      : [...selectedValues, optionValue];
    
    setSelectedValues(newValues);
    onUpdate?.(newValues);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      onCommit(selectedValues);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
    }
  };

  const handleBlur = () => {
    onCommit(selectedValues);
    onBlur?.();
  };

  // Options are now provided directly by the hook

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
      className="w-full p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white max-h-32 overflow-y-auto"
    >
      {options.length === 0 ? (
        <div className="text-gray-500 text-sm">No options available</div>
      ) : (
        <div className="space-y-1">
          {options.map((option) => (
            <label
              key={option.value}
              className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-1 rounded"
            >
              <input
                type="checkbox"
                checked={selectedValues.includes(option.value)}
                onChange={() => handleToggleOption(option.value)}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <div className="flex items-center gap-2">
                {option.color && (
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: option.color }}
                  />
                )}
                <span className="text-sm">{option.label}</span>
              </div>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}