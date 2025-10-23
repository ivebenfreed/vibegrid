/**
 * ⚠️ NOT MIGRATED TO MOBX - FILE DISABLED ⚠️
 * 
 * This file has not been migrated from Legend State to MobX.
 * It is currently NOT USED anywhere in the codebase.
 * 
 * Status: DISABLED - Do not import or use
 * Original: Available in archive/vibegrid/
 * 
 * To re-enable:
 * 1. Migrate Legend State observables to MobX
 * 2. Update imports and reactive patterns
 * 3. Test thoroughly
 * 4. Remove this warning
 */

// This file is disabled and will throw errors if used
throw new Error('This file has not been migrated to MobX - see file header for details');

/**
 * ComboboxEditor - Professional dropdown editor with search for VibeGridX
 * 
 * ✅ ADAPTED: From VibeGridOptimus ComboboxEditor for VibeGridX integration
 * ✅ SEARCH: Instant filtering for enum options
 * ✅ KEYBOARD NAV: Arrow keys, Enter, Escape, Tab support
 * ✅ AUTO-FOCUS: Opens immediately when editing starts
 * ✅ NO TRIGGER: Only shows dropdown content, no extra cell display
 */

import React from 'react'
import { cn } from '@/lib/utils'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Check } from 'lucide-react'
import type { CellRef, Column, RelationshipContext, EnumOption } from '../../types'
import { getOptionIconDisplay } from '../../utils/icon-mapping'
// TODO: Remove Legend State dependencies - not needed for this editor
// import { use$ } from '@legendapp/state/react'
// import { getEntity$, universeOrgId$ } from '@/legend-state/observables'

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
}


export const ComboboxEditor: React.FC<ComboboxEditorProps> = ({
  cell,
  column,
  initialValue,
  onCommit,
  onCancel,
  placeholder = "Select...",
  searchPlaceholder = "Search...",
  className = "",
  isMultiSelect = false,
  relationshipContext
}) => {
  const [searchValue, setSearchValue] = React.useState('')
  const [highlightedIndex, setHighlightedIndex] = React.useState(0)
  const [hasCommitted, setHasCommitted] = React.useState(false)
  const [dynamicOptions, setDynamicOptions] = React.useState<any[]>([])
  const [isLoadingOptions, setIsLoadingOptions] = React.useState(false)
  // For multi-select, track selected values separately
  const [selectedValues, setSelectedValues] = React.useState<string[]>(
    isMultiSelect && Array.isArray(initialValue) ? initialValue : []
  )

  // Load options from provider if available
  React.useEffect(() => {
    console.log('🔍 ComboboxEditor: Provider check', {
      columnId: column.id,
      hasProvider: !!column.relationshipOptionsProvider,
      hasContext: !!relationshipContext,
      relationshipContext: relationshipContext,
      relationshipTable: column.relationshipTable,
      relationshipEntityType: column.relationshipEntityType
    });
    
    if (column.relationshipOptionsProvider && relationshipContext) {
      console.log('🔍 ComboboxEditor: Loading relationship options', {
        columnId: column.id,
        relationshipTable: column.relationshipTable,
        hasProvider: !!column.relationshipOptionsProvider,
        hasContext: !!relationshipContext
      });
      
      setIsLoadingOptions(true)
      
      const loadOptions = async () => {
        try {
          const providerOptions = await column.relationshipOptionsProvider!(relationshipContext)
          
          console.log('🔍 ComboboxEditor: Loaded relationship options', {
            columnId: column.id,
            optionCount: providerOptions.length,
            options: providerOptions.map(opt => ({ value: opt.value, label: opt.label }))
          });
          
          setDynamicOptions(providerOptions)
        } catch (error) {
          console.error('ComboboxEditor: Error loading relationship options:', error)
          setDynamicOptions([])
        } finally {
          setIsLoadingOptions(false)
        }
      }
      
      loadOptions()
    }
  }, [column.relationshipOptionsProvider, relationshipContext])

  // Get options from column configuration or dynamic provider
  const options = React.useMemo(() => {
    let rawOptions: any[] = []

    // Use dynamic options if available, otherwise fall back to static options
    if (column.relationshipOptionsProvider && dynamicOptions.length > 0) {
      rawOptions = dynamicOptions
    } else {
      rawOptions = column.enumOptions || column.options || []
    }
    
    console.log('🔍 ComboboxEditor: Computing options', {
      columnId: column.id,
      hasProvider: !!column.relationshipOptionsProvider,
      dynamicOptionsCount: dynamicOptions.length,
      staticOptionsCount: (column.enumOptions || column.options || []).length,
      usingDynamic: column.relationshipOptionsProvider && dynamicOptions.length > 0,
      rawOptionsCount: rawOptions.length
    });
    
    // Convert to standard format and apply hardcoded styling
    const standardOptions = rawOptions.map(option => {
      let optionData;
      if (typeof option === 'string') {
        optionData = { value: option, label: option };
      } else {
        optionData = { value: option.value, label: option.label, color: option.color, backgroundColor: option.backgroundColor, icon: option.icon };
      }

      // Note: Removed hardcoded styling - now uses schema data verbatim

      return optionData;
    })

    // Add null option for nullable fields
    // Note: Using nullLabel as the property name (nullable doesn't exist on Column type)
    const isNullable = (column as any).nullable !== false || column.nullLabel !== undefined
    if (isNullable) {
      standardOptions.unshift({ value: '__null__', label: column.nullLabel || 'None' })
    }

    console.log('🔍 ComboboxEditor: Final options', {
      columnId: column.id,
      optionCount: standardOptions.length,
      options: standardOptions.map(opt => ({ value: opt.value, label: opt.label })),
      rawColumnOptions: column.options,
      rawEnumOptions: column.enumOptions,
      columnType: column.cellType || column.type
    });

    return standardOptions
  }, [column.enumOptions, column.options, column.nullLabel, column.relationshipOptionsProvider, dynamicOptions])

  // Filter options based on search
  const filteredOptions = React.useMemo(() => {
    if (!searchValue) return options
    return options.filter(option => 
      option.label.toLowerCase().includes(searchValue.toLowerCase()) ||
      option.value.toLowerCase().includes(searchValue.toLowerCase())
    )
  }, [options, searchValue])

  // Handle keyboard navigation
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setHighlightedIndex(prev => 
            prev < filteredOptions.length - 1 ? prev + 1 : prev
          )
          break
        case 'ArrowUp':
          e.preventDefault()
          setHighlightedIndex(prev => prev > 0 ? prev - 1 : prev)
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
  }, [filteredOptions, highlightedIndex, initialValue, selectedValues, isMultiSelect])

  const handleSelect = (value: string) => {
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
  }

  const handleCommit = (value: any) => {
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
  }

  const handleCancel = () => {
    if (hasCommitted) return
    setHasCommitted(true)
    onCancel()
  }

  // Reset highlighted index when filtered options change
  React.useEffect(() => {
    setHighlightedIndex(0)
  }, [filteredOptions])

  return (
    <div className={cn("w-full h-full", className)}>
      <Command shouldFilter={false} className="border rounded-md shadow-lg bg-background">
        <CommandInput
          placeholder={searchPlaceholder}
          value={searchValue}
          onValueChange={setSearchValue}
          autoFocus
          className="border-none focus:ring-0"
        />
        <CommandList className="max-h-64 overflow-auto">
          {isLoadingOptions ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              Loading options...
            </div>
          ) : (
            <>
              <CommandEmpty>No results found.</CommandEmpty>
              {/* Group options by their group property */}
              {(() => {
                // Group the filtered options
                const grouped = filteredOptions.reduce((acc, option) => {
                  const group = (option as any).group || 'Other';
                  if (!acc[group]) acc[group] = [];
                  acc[group].push(option);
                  return acc;
                }, {} as Record<string, any[]>);
                
                // Sort groups
                const sortedGroups = Object.keys(grouped).sort();
                
                // Render grouped options
                return sortedGroups.map(groupName => (
                  <CommandGroup key={groupName} heading={groupName}>
                    {grouped[groupName].map((option, groupIndex) => {
                      const globalIndex = filteredOptions.findIndex(o => o.value === option.value);
                      return (
                        <CommandItem
                          key={option.value}
                          value={option.value}
                          onSelect={() => {
                            console.log('ComboboxEditor: onSelect called', option.value);
                            handleSelect(option.value);
                          }}
                          onClick={(e) => {
                            console.log('ComboboxEditor: onClick called', option.value);
                            e.stopPropagation();
                            handleSelect(option.value);
                          }}
                          className={cn(
                            "cursor-pointer",
                            globalIndex === highlightedIndex && "bg-accent"
                          )}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4 flex-shrink-0",
                              isMultiSelect
                                ? (selectedValues.includes(option.value) ? "opacity-100" : "opacity-0")
                                : (initialValue === option.value || (initialValue === null && option.value === '__null__') ? "opacity-100" : "opacity-0")
                            )}
                          />
                          {option.value === '__null__' ? (
                            <span className="text-muted-foreground italic">
                              {option.label}
                            </span>
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
                                border: `1px solid ${option.backgroundColor ? 'transparent' : '#d1d5db'}`
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
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                ));
              })()}
            </>
          )}
        </CommandList>
        {isMultiSelect && (
          <div className="flex items-center justify-between p-2 border-t text-xs text-muted-foreground">
            <span>{selectedValues.length} selected</span>
            <div className="flex gap-2">
              <button
                className="px-2 py-1 text-xs rounded hover:bg-accent"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleCancel();
                }}
              >
                Cancel (Esc)
              </button>
              <button
                className="px-2 py-1 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleCommit(selectedValues);
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