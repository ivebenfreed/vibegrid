/**
 * ComboboxEditor - Professional dropdown editor with search for VibeGridX
 *
 * ✅ MOBX READY: No state dependencies - pure React component
 * ✅ ADAPTED: From VibeGridOptimus ComboboxEditor for VibeGridX integration
 * ✅ SEARCH: Instant filtering for enum options
 * ✅ KEYBOARD NAV: Arrow keys, Enter, Escape, Tab support
 * ✅ AUTO-FOCUS: Opens immediately when editing starts
 * ✅ NO TRIGGER: Only shows dropdown content, no extra cell display
 */

import { Check } from 'lucide-react'
import React from 'react'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/shared/components/ui/command'
import { getLogger } from '@/shared/lib/logging'
import { cn } from '@/shared/lib/utils'
import type { CellRef, Column, RelationshipContext } from '../../types'
import { getOptionIconDisplay } from '../../utils/icon-mapping'

// TODO: Remove Legend State dependencies - not needed for this editor
// import { use$ } from '@legendapp/state/react'
// import { getEntity$, universeOrgId$ } from '@/legend-state/observables'

const fileLog = getLogger(['vibegrid', 'overlays', 'editors', 'ComboboxEditor'])

export interface ComboboxEditorProps {
  cell: CellRef
  column: Column
  initialValue: any
  onCommit: (value: any) => void
  onCancel: () => void
  placeholder?: string
  searchPlaceholder?: string
  className?: string
  isMultiSelect?: boolean
  // Context for relationship options providers
  relationshipContext?: RelationshipContext
  // External loading state (e.g., from RelationshipEditor async collection loading)
  isLoadingOptions?: boolean
}

export const ComboboxEditor: React.FC<ComboboxEditorProps> = ({
  cell: _cell,
  column,
  initialValue,
  onCommit,
  onCancel,
  placeholder: _placeholder = 'Select...',
  searchPlaceholder = 'Search...',
  className = '',
  isMultiSelect = false,
  relationshipContext,
  isLoadingOptions: externalIsLoading,
}) => {
  const [searchValue, setSearchValue] = React.useState('')
  const [highlightedIndex, setHighlightedIndex] = React.useState(0)
  const [hasCommitted, setHasCommitted] = React.useState(false)
  const [dynamicOptions, setDynamicOptions] = React.useState<any[]>([])
  const [internalIsLoading, setInternalIsLoading] = React.useState(false)
  const isLoadingOptions = externalIsLoading || internalIsLoading
  // For multi-select, track selected values separately
  const [selectedValues, setSelectedValues] = React.useState<string[]>(
    isMultiSelect && Array.isArray(initialValue) ? initialValue : [],
  )

  // Load options from provider if available
  React.useEffect(() => {
    fileLog.debug('ComboboxEditor: Provider check', {
      columnId: column.id,
      hasProvider: !!column.relationshipOptionsProvider,
      hasContext: !!relationshipContext,
      relationshipContext: relationshipContext,
      relationshipTable: column.relationshipTable,
      relationshipEntityType: column.relationshipEntityType,
    })

    if (column.relationshipOptionsProvider && relationshipContext) {
      fileLog.debug('ComboboxEditor: Loading relationship options', {
        columnId: column.id,
        relationshipTable: column.relationshipTable,
        hasProvider: !!column.relationshipOptionsProvider,
        hasContext: !!relationshipContext,
      })

      setInternalIsLoading(true)

      const loadOptions = async () => {
        try {
          const providerOptions = await column.relationshipOptionsProvider!(relationshipContext)

          fileLog.debug('ComboboxEditor: Loaded relationship options', {
            columnId: column.id,
            optionCount: providerOptions.length,
            options: providerOptions.map((opt) => ({ value: opt.value, label: opt.label })),
          })

          setDynamicOptions(providerOptions)
        } catch (error) {
          fileLog.error('ComboboxEditor: Error loading relationship options', { error })
          setDynamicOptions([])
        } finally {
          setInternalIsLoading(false)
        }
      }

      loadOptions()
    }
  }, [
    column.relationshipOptionsProvider,
    relationshipContext,
    column.id,
    column.relationshipEntityType,
    column.relationshipTable,
  ])

  // Get options from column configuration or dynamic provider
  const options = React.useMemo(() => {
    let rawOptions: any[] = []

    // Use dynamic options if available, otherwise fall back to static options
    if (column.relationshipOptionsProvider && dynamicOptions.length > 0) {
      rawOptions = dynamicOptions
    } else {
      rawOptions = column.enumOptions || column.options || []
    }

    fileLog.debug('ComboboxEditor: Computing options', {
      columnId: column.id,
      hasProvider: !!column.relationshipOptionsProvider,
      dynamicOptionsCount: dynamicOptions.length,
      staticOptionsCount: (column.enumOptions || column.options || []).length,
      usingDynamic: column.relationshipOptionsProvider && dynamicOptions.length > 0,
      rawOptionsCount: rawOptions.length,
    })

    // Convert to standard format and apply hardcoded styling
    const standardOptions = rawOptions.map((option) => {
      let optionData: any
      if (typeof option === 'string') {
        optionData = { value: option, label: option }
      } else {
        optionData = {
          value: option.value,
          label: option.label,
          color: option.color,
          backgroundColor: option.backgroundColor,
          icon: option.icon,
        }
      }

      // Note: Removed hardcoded styling - now uses schema data verbatim

      return optionData
    })

    // Add null option for nullable fields
    // Note: Using nullLabel as the property name (nullable doesn't exist on Column type)
    const isNullable = (column as any).nullable !== false || column.nullLabel !== undefined
    if (isNullable) {
      standardOptions.unshift({ value: '__null__', label: column.nullLabel || 'None' })
    }

    fileLog.debug('ComboboxEditor: Final options', {
      columnId: column.id,
      optionCount: standardOptions.length,
      options: standardOptions.map((opt) => ({ value: opt.value, label: opt.label })),
      rawColumnOptions: column.options,
      rawEnumOptions: column.enumOptions,
      columnType: column.cellType || column.type,
    })

    return standardOptions
  }, [
    column.enumOptions,
    column.options,
    column.nullLabel,
    column.relationshipOptionsProvider,
    dynamicOptions,
    column.cellType,
    column.id,
    column,
  ])

  // Filter options based on search
  const filteredOptions = React.useMemo(() => {
    if (!searchValue) return options
    return options.filter(
      (option) =>
        option.label.toLowerCase().includes(searchValue.toLowerCase()) ||
        option.value.toLowerCase().includes(searchValue.toLowerCase()),
    )
  }, [options, searchValue])

  // Handler functions (declared before useEffect that uses them)
  const handleCommit = React.useCallback(
    (value: any) => {
      if (hasCommitted) return

      // Only commit if the value actually changed
      if (value !== initialValue) {
        setHasCommitted(true)
        onCommit(value)
      } else {
        // Value didn't change, just cancel the edit
        setHasCommitted(true)
        onCancel()
      }
    },
    [hasCommitted, initialValue, onCommit, onCancel],
  )

  const handleSelect = React.useCallback(
    (value: string) => {
      if (isMultiSelect) {
        // For multi-select, toggle the value in the array
        const newValues = [...selectedValues]
        const index = newValues.indexOf(value)

        if (index >= 0) {
          // Remove if already selected
          newValues.splice(index, 1)
        } else {
          // Add if not selected
          newValues.push(value)
        }

        setSelectedValues(newValues)
        // Don't commit immediately for multi-select
      } else {
        // For single-select, just set the value and commit
        const finalValue = value === '__null__' ? null : value
        handleCommit(finalValue)
      }
    },
    [isMultiSelect, selectedValues, handleCommit],
  )

  // Handle keyboard navigation
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setHighlightedIndex((prev) => (prev < filteredOptions.length - 1 ? prev + 1 : prev))
          break
        case 'ArrowUp':
          e.preventDefault()
          setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : prev))
          break
        case 'Enter':
          e.preventDefault()
          if (isMultiSelect) {
            if (filteredOptions[highlightedIndex]) {
              handleSelect(filteredOptions[highlightedIndex].value)
            } else if (e.ctrlKey || e.metaKey) {
              // Ctrl/Cmd+Enter commits multi-select
              handleCommit(selectedValues)
            }
          } else {
            if (filteredOptions[highlightedIndex]) {
              handleSelect(filteredOptions[highlightedIndex].value)
            } else {
              handleCommit(initialValue)
            }
          }
          break
        case 'Escape':
          e.preventDefault()
          e.stopPropagation() // Stop the event from reaching KeyboardNavigationController
          onCancel() // Call onCancel directly instead of handleCancel to avoid setting hasCommitted
          break
        case 'Tab':
          e.preventDefault()
          if (isMultiSelect) {
            // For multi-select, Tab commits the current selection
            handleCommit(selectedValues)
          } else {
            // For single-select, Tab behaves like Enter
            if (filteredOptions[highlightedIndex]) {
              handleSelect(filteredOptions[highlightedIndex].value)
            } else {
              handleCommit(initialValue)
            }
          }
          break
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [
    filteredOptions,
    highlightedIndex,
    initialValue,
    selectedValues,
    isMultiSelect,
    handleCommit,
    handleSelect,
    onCancel,
  ])

  const handleCancel = () => {
    if (hasCommitted) return
    setHasCommitted(true)
    onCancel()
  }

  // Reset highlighted index when filtered options change
  React.useEffect(() => {
    setHighlightedIndex(0)
  }, [])

  // Determine if we should show search input (only for lists with many options)
  const showSearch = options.length > 6

  // Check if we have multiple groups with actual group names (not just "Other")
  const hasMultipleGroups = React.useMemo(() => {
    const groups = new Set(filteredOptions.map((o) => (o as any).group).filter(Boolean))
    return groups.size > 1
  }, [filteredOptions])

  return (
    <div className={cn('w-full h-full', className)}>
      <Command shouldFilter={false} className="border rounded-md shadow-lg bg-background">
        {showSearch && (
          <CommandInput
            placeholder={searchPlaceholder}
            value={searchValue}
            onValueChange={setSearchValue}
            autoFocus
            className="border-none focus:ring-0"
          />
        )}
        <CommandList className={cn(showSearch ? 'max-h-64' : 'max-h-fit', 'overflow-auto')}>
          {isLoadingOptions ? (
            <div className="p-4 text-center text-sm text-muted-foreground">Loading options...</div>
          ) : (
            <>
              <CommandEmpty>No results found.</CommandEmpty>
              {/* Group options only if there are multiple named groups */}
              {(() => {
                // Group the filtered options
                const grouped = filteredOptions.reduce(
                  (acc, option) => {
                    const group = (option as any).group || ''
                    if (!acc[group]) acc[group] = []
                    acc[group].push(option)
                    return acc
                  },
                  {} as Record<string, any[]>,
                )

                // Sort groups (empty string first for ungrouped)
                const sortedGroups = Object.keys(grouped).sort((a, b) => {
                  if (a === '') return -1
                  if (b === '') return 1
                  return a.localeCompare(b)
                })

                // Render options - only show group headings if there are multiple named groups
                return sortedGroups.map((groupName) => (
                  <CommandGroup
                    key={groupName || '__ungrouped__'}
                    heading={hasMultipleGroups && groupName ? groupName : undefined}
                  >
                    {grouped[groupName].map((option: any) => {
                      const globalIndex = filteredOptions.findIndex((o) => o.value === option.value)
                      return (
                        <CommandItem
                          key={option.value}
                          value={option.value}
                          onSelect={() => {
                            fileLog.debug('ComboboxEditor: onSelect called', {
                              value: option.value,
                            })
                            handleSelect(option.value)
                          }}
                          onClick={(e) => {
                            fileLog.debug('ComboboxEditor: onClick called', { value: option.value })
                            e.stopPropagation()
                            handleSelect(option.value)
                          }}
                          className={cn(
                            'cursor-pointer',
                            globalIndex === highlightedIndex && 'bg-accent',
                          )}
                        >
                          {/* Multi-select: checkmark on left */}
                          {isMultiSelect && (
                            <Check
                              className={cn(
                                'mr-2 h-4 w-4 flex-shrink-0',
                                selectedValues.includes(option.value) ? 'opacity-100' : 'opacity-0',
                              )}
                            />
                          )}
                          {/* Option content */}
                          <span className="flex-1">
                            {option.value === '__null__' ? (
                              <span className="text-muted-foreground italic">{option.label}</span>
                            ) : (
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  fontSize: '12px',
                                  fontWeight: '500',
                                  whiteSpace: 'nowrap',
                                  backgroundColor: option.backgroundColor || '#f3f4f6',
                                  color: option.color || '#374151',
                                  border: `1px solid ${option.backgroundColor ? 'transparent' : '#d1d5db'}`,
                                }}
                              >
                                {option.icon && (
                                  <span style={{ fontSize: '10px' }}>
                                    {getOptionIconDisplay(option.icon)}
                                  </span>
                                )}
                                {option.label}
                              </span>
                            )}
                          </span>
                          {/* Single-select: checkmark on right for alignment with cell content */}
                          {!isMultiSelect && (
                            <Check
                              className={cn(
                                'ml-2 h-4 w-4 flex-shrink-0 text-primary',
                                initialValue === option.value ||
                                  (initialValue === null && option.value === '__null__')
                                  ? 'opacity-100'
                                  : 'opacity-0',
                              )}
                            />
                          )}
                        </CommandItem>
                      )
                    })}
                  </CommandGroup>
                ))
              })()}
            </>
          )}
        </CommandList>
        {isMultiSelect && (
          <div className="flex items-center justify-between p-2 border-t text-xs text-muted-foreground">
            <span>{selectedValues.length} selected</span>
            <div className="flex gap-2">
              <button
                type="button"
                className="px-2 py-1 text-xs rounded hover:bg-accent"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  handleCancel()
                }}
              >
                Cancel (Esc)
              </button>
              <button
                type="button"
                className="px-2 py-1 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  handleCommit(selectedValues)
                }}
              >
                Done (Tab)
              </button>
            </div>
          </div>
        )}
      </Command>
    </div>
  )
}
