/**
 * React components for reference cell rendering with full option resolution
 */

import React from 'react'
import { useReferenceOptions } from '@/legend-state/reference-system/hooks'
import type { Column } from '../../../column-types'

/**
 * React component renderer for reference-select with full option resolution
 */
export function ReferenceSelectCell({ value, column }: { value: string | null; column: Column }) {
  const { getOptionByValue } = useReferenceOptions({
    referenceType: column.referenceType || 'system',
    systemOptionType: column.systemOptionType,
    systemArchetype: column.systemArchetype,
    customOptionSet: column.customOptionSet,
  })

  const option = value ? getOptionByValue(value) : null

  if (!option) {
    return <span className="text-gray-400">{value || '—'}</span>
  }

  return (
    <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-gray-100 rounded-md text-sm border">
      {option.color && (
        <div
          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: option.color }}
        />
      )}
      <span className="text-gray-800 font-medium">{option.label}</span>
    </div>
  )
}

/**
 * React component renderer for reference-multi with full option resolution
 */
export function ReferenceMultiCell({ value, column }: { value: string[] | null; column: Column }) {
  if (!value || !Array.isArray(value) || value.length === 0) {
    return <span className="text-gray-400">—</span>
  }

  const { getOptionByValue } = useReferenceOptions({
    referenceType: column.referenceType || 'system',
    systemOptionType: column.systemOptionType,
    systemArchetype: column.systemArchetype,
    customOptionSet: column.customOptionSet,
  })

  return (
    <div className="flex flex-wrap gap-1">
      {value.map((val, index) => {
        const option = getOptionByValue(val)
        return (
          <div
            key={index}
            className="inline-flex items-center gap-1.5 px-2 py-1 bg-gray-100 rounded-md text-sm border"
          >
            {option?.color && (
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: option.color }} />
            )}
            <span className="text-gray-800 font-medium">{option?.label || val}</span>
          </div>
        )
      })}
    </div>
  )
}
