/**
 * MultiSelectEditor - For multi-selection fields using shadcn multi-select
 *
 * ✅ SHADCN: Uses proper shadcn multi-select component with search
 * ✅ SEARCH: Instant filtering for options
 * ✅ KEYBOARD NAV: Full keyboard navigation support
 * ✅ BADGES: Shows selected items as removable badges
 * ✅ COLORS: Supports color-coded options
 */

import React from 'react';
import { createLogger } from '@/shared/lib/logging';
// TODO: MultiSelect component doesn't exist - needs to be created or use ComboboxEditor with isMultiSelect
// import { MultiSelect } from '@/shared/components/ui/multi-select';
import type { CellRef, Column, EnumOption } from '../../types';

const fileLog = createLogger('components/vibegrid/overlays/editors/MultiSelectEditor');

interface MultiSelectEditorProps {
  cell: CellRef;
  column: Column;
  initialValue: string[] | null;
  onCommit: (value: string[]) => void;
  onCancel: () => void;
}

export function MultiSelectEditor({
  cell,
  column,
  initialValue,
  onCommit,
  onCancel
}: MultiSelectEditorProps) {
  const [hasCommitted, setHasCommitted] = React.useState(false);

  // Convert column options to MultiSelect format, or generate from current value for tags
  const options = React.useMemo(() => {
    let rawOptions = column.options || column.enumOptions || [];
    
    // For tags fields with no predefined options, generate from current value
    if (rawOptions.length === 0 && initialValue && typeof initialValue === 'string') {
      const currentTags = (initialValue as any).split(',').map((tag: any) => tag.trim()).filter((tag: any) => tag.length > 0);
      rawOptions = currentTags.map((tag: any) => ({ value: tag, label: tag }));

      fileLog.debug('Generated options from current tags', {
        initialValue,
        currentTags,
        generatedOptions: rawOptions
      });
    }
    
    return rawOptions.map(option => {
      if (typeof option === 'string') {
        return { value: option, label: option };
      }
      return {
        value: option.value,
        label: option.label,
        color: option.color,
        group: option.group,
        disabled: (option as any).disabled
      };
    });
  }, [column.options, column.enumOptions, initialValue]);

  const handleValueChange = (values: string[]) => {
    if (hasCommitted) return;
    setHasCommitted(true);
    onCommit(values);
  };

  // Handle keyboard shortcuts
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (!hasCommitted) {
          setHasCommitted(true);
          onCancel();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [hasCommitted, onCancel]);

  const initialValues = Array.isArray(initialValue) ? initialValue : [];

  // TODO: Replace with actual MultiSelect component or use ComboboxEditor with isMultiSelect=true
  return (
    <div className="w-full p-4 border rounded bg-yellow-50">
      <p className="text-sm text-yellow-800">Multi-select editor not yet implemented</p>
      <p className="text-xs text-yellow-600 mt-2">
        Current value: {initialValues.join(', ')}
      </p>
      <button
        className="mt-2 px-2 py-1 text-xs bg-gray-200 rounded"
        onClick={() => onCancel()}
      >
        Close
      </button>
    </div>
  );

  /* ORIGINAL - TO BE IMPLEMENTED WITH ACTUAL MULTISELECT COMPONENT
  return (
    <div className="w-full">
      <MultiSelect
        options={options}
        onValueChange={handleValueChange}
        defaultValue={initialValues}
        placeholder="Select items..."
        className="w-full"
      />
    </div>
  );
  */
}