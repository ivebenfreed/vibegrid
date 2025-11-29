/**
 * Reference Select Editor for system and custom option fields
 */

import type React from 'react'
import { useEffect, useRef, useState } from 'react'
import { getLogger } from '@/shared/lib/logging'
// TODO: Replace with TanStack DB query for reference options
// import { useReferenceOptions } from '@/legend-state/reference-system/hooks';
import type { EditorProps } from './index'

const fileLog = getLogger(['vibegrid', 'overlays', 'editors', 'ReferenceSelectEditor'])

/**
 * Infer entity type from field name for entity references
 * Examples: portfolio_id -> Portfolio, milestone_id -> Milestone
 */
function inferEntityFromFieldName(fieldName: string): string {
  if (fieldName.endsWith('_id')) {
    const baseName = fieldName.slice(0, -3)
    // Convert snake_case to PascalCase for entity names
    return baseName
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('')
  }
  return 'Entity'
}

export function ReferenceSelectEditor({
  cell,
  column,
  initialValue,
  onCommit,
  onCancel,
  onUpdate,
  onBlur,
}: EditorProps) {
  const [value, setValue] = useState<string>(initialValue || '')
  const selectRef = useRef<HTMLSelectElement>(null)

  // TODO: Load reference options from TanStack DB
  // For now, use stub data
  const options: any[] = []
  const isLoading = false
  const error = null

  /* ORIGINAL - TO BE MIGRATED TO TANSTACK DB
  const getReferenceConfig = () => {
    const cellType = column.cellType || column.type;

    if (cellType === 'user_reference' || cellType === 'custom_user_reference') {
      return {
        referenceType: 'user_reference' as const,
        referenceEntity: 'User'
      };
    }

    if (cellType === 'entity_reference' || cellType === 'custom_entity_reference') {
      const entityType = column.referenceType || inferEntityFromFieldName(column.id);
      return {
        referenceType: 'entity_reference' as const,
        referenceEntity: entityType
      };
    }

    return {
      referenceType: column.referenceType || 'system',
      systemOptionType: (column as any).systemOptionType,
      systemArchetype: (column as any).systemArchetype,
      customOptionSet: (column as any).customOptionSet,
      referenceEntity: column.referenceType
    };
  };

  const { options, isLoading, error } = useReferenceOptions(getReferenceConfig());
  */

  useEffect(() => {
    // Focus the select element when mounted
    if (selectRef.current) {
      selectRef.current.focus()
    }
  }, [])

  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newValue = event.target.value
    setValue(newValue)
    onUpdate?.(newValue)
  }

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      onCommit(value)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      onCancel()
    }
  }

  const handleBlur = () => {
    onCommit(value)
    onBlur?.()
  }

  // Debug logging
  useEffect(() => {
    fileLog.debug('Options updated', {
      columnId: column.id,
      referenceType: column.referenceType,
      systemOptionType: column.systemOptionType,
      systemArchetype: column.systemArchetype,
      customOptionSet: column.customOptionSet,
      referenceEntity: (column as any).referenceEntity,
      optionsCount: options.length,
      isLoading,
      error,
      options: options.slice(0, 3), // Log first 3 for debugging
    })
  }, [options, isLoading, error, column.id])

  return (
    <select
      ref={selectRef}
      value={value}
      onChange={handleChange}
      onKeyDown={handleKeyDown as any}
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
  )
}
