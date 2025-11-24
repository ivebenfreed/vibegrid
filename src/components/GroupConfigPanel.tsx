import { ChevronDown, ChevronUp, GripVertical, Plus, Settings2, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '@/shared/components/ui/button'
import { createLogger } from '@/shared/lib/logging'

const fileLog = createLogger('GroupConfigPanel')

import { Badge } from '@/shared/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/shared/components/ui/collapsible'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu'
import { Label } from '@/shared/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select'
import { Separator } from '@/shared/components/ui/separator'

import type { AggregationConfig, Column, GroupConfig, GroupField } from '../types'

interface GroupConfigPanelProps {
  columns: Column[]
  groupConfig: GroupConfig | null
  onGroupConfigChange: (config: GroupConfig | null) => void
  className?: string
}

export function GroupConfigPanel({
  columns,
  groupConfig,
  onGroupConfigChange,
  className = '',
}: GroupConfigPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true)
  const [showAggregations, setShowAggregations] = useState(false)

  // Available columns for grouping (only select/enum fields suitable for grouping)
  const availableColumns = useMemo(() => {
    return columns.filter((col) => {
      // Exclude system columns
      if (col.id === '__selection' || col.id === 'id' || col.field?.startsWith('__')) {
        return false
      }

      // Only include select and enum fields for grouping
      const cellType = col.cellType || col.type
      const hasOptions = col.options && col.options.length > 0
      const isSelectType =
        (cellType as string) === 'select' ||
        (cellType as string) === 'select-multi' ||
        (cellType as string) === 'reference-select'

      // Include if it's explicitly a select type OR has options (indicating enum values)
      return isSelectType || hasOptions
    })
  }, [columns])

  // Columns that can be aggregated (numeric and countable types)
  const aggregatableColumns = useMemo(() => {
    return availableColumns.filter((col) => {
      const fieldType = col.type || 'text'
      return (
        ['number', 'decimal', 'currency', 'percentage'].includes(fieldType) || fieldType === 'text'
      ) // Text fields can be counted
    })
  }, [availableColumns])

  const handleAddGroupField = (columnId: string) => {
    const column = availableColumns.find((col) => col.id === columnId)
    if (!column) return

    const newField: GroupField = {
      field: column.field || column.id,
      displayName: column.name || column.id,
      label: column.name || column.id,
      sortDirection: 'asc',
    }

    const newConfig: GroupConfig = {
      fields: [...(groupConfig?.fields || []), newField],
      sortBy: 'name',
      sortDirection: 'asc',
      aggregations: groupConfig?.aggregations || [],
      expandedGroups: groupConfig?.expandedGroups || new Set(),
      colorScheme: 'auto',
    }

    onGroupConfigChange(newConfig)
  }

  const handleRemoveGroupField = (index: number) => {
    if (!groupConfig) return

    const newFields = groupConfig.fields.filter((_, i) => i !== index)

    if (newFields.length === 0) {
      onGroupConfigChange(null)
    } else {
      onGroupConfigChange({
        ...groupConfig,
        fields: newFields,
      })
    }
  }

  const handleGroupFieldSort = (index: number, direction: 'asc' | 'desc') => {
    if (!groupConfig) return

    const newFields = [...groupConfig.fields]
    newFields[index] = { ...newFields[index], sortDirection: direction }

    onGroupConfigChange({
      ...groupConfig,
      fields: newFields,
    })
  }

  const handleMoveGroupField = (fromIndex: number, toIndex: number) => {
    if (!groupConfig) return

    const newFields = [...groupConfig.fields]
    const [movedField] = newFields.splice(fromIndex, 1)
    newFields.splice(toIndex, 0, movedField)

    onGroupConfigChange({
      ...groupConfig,
      fields: newFields,
    })
  }

  const handleAddAggregation = (columnId: string, type: string) => {
    const column = aggregatableColumns.find((col) => col.id === columnId)
    if (!column || !groupConfig) return

    const newAggregation: AggregationConfig = {
      field: column.field || column.id,
      function: type as 'count' | 'sum' | 'avg' | 'min' | 'max' | 'unique',
      type: type as 'count' | 'sum' | 'avg' | 'min' | 'max' | 'unique',
      label: `${type.toUpperCase()} of ${column.name}`,
    }

    // Remove existing aggregation for this field
    const newAggregations = groupConfig.aggregations.filter(
      (agg) => agg.field !== newAggregation.field,
    )
    newAggregations.push(newAggregation)

    onGroupConfigChange({
      ...groupConfig,
      aggregations: newAggregations,
    })
  }

  const handleRemoveAggregation = (field: string) => {
    if (!groupConfig) return

    onGroupConfigChange({
      ...groupConfig,
      aggregations: groupConfig.aggregations.filter((agg) => agg.field !== field),
    })
  }

  const handleExpandAllGroups = () => {
    if (!groupConfig) return
    // This would need to get all current group IDs from the state
    // For now, we'll trigger the expand all action
    onGroupConfigChange({
      ...groupConfig,
      expandAll: true,
    } as any) // Temporary cast - the actual implementation would handle this in the state machine
  }

  const handleCollapseAllGroups = () => {
    if (!groupConfig) return
    onGroupConfigChange({
      ...groupConfig,
      expandedGroups: new Set(),
    })
  }

  const handleClearGrouping = () => {
    onGroupConfigChange(null)
  }

  return (
    <Card className={`w-80 ${className}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Settings2 size={14} />
            Group By
          </CardTitle>
          <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </Button>
            </CollapsibleTrigger>
          </Collapsible>
        </div>
      </CardHeader>

      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-4">
            {/* Group Fields Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium text-muted-foreground">GROUP BY FIELDS</Label>
                {groupConfig && groupConfig.fields.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleClearGrouping}
                    className="h-6 text-xs text-muted-foreground hover:text-foreground"
                  >
                    Clear All
                  </Button>
                )}
              </div>

              {/* Current Group Fields */}
              {groupConfig?.fields && groupConfig.fields.length > 0 && (
                <div className="space-y-2">
                  {groupConfig.fields.map((field, index) => (
                    <div
                      key={`${field.field}-${index}`}
                      className="flex items-center gap-2 p-2 rounded-md border bg-muted/30"
                    >
                      <GripVertical size={14} className="text-muted-foreground cursor-move" />

                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{field.label}</div>
                        <div className="text-xs text-muted-foreground truncate">{field.field}</div>
                      </div>

                      <Select
                        value={field.sortDirection}
                        onValueChange={(value: 'asc' | 'desc') =>
                          handleGroupFieldSort(index, value)
                        }
                      >
                        <SelectTrigger className="h-6 w-16 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="asc">A-Z</SelectItem>
                          <SelectItem value="desc">Z-A</SelectItem>
                        </SelectContent>
                      </Select>

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveGroupField(index)}
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                      >
                        <X size={12} />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add Group Field */}
              <Select onValueChange={handleAddGroupField}>
                <SelectTrigger className="h-8 text-sm">
                  <div className="flex items-center gap-2">
                    <Plus size={14} />
                    <SelectValue placeholder="Add group field..." />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  {availableColumns
                    .filter(
                      (col) =>
                        !groupConfig?.fields.some((field) => field.field === (col.field || col.id)),
                    )
                    .map((column) => (
                      <SelectItem key={column.id} value={column.id}>
                        <div className="flex items-center gap-2">
                          <span>{column.name || column.id}</span>
                          <Badge variant="outline" className="text-xs">
                            {column.cellType || column.type || 'select'}
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {/* Group Controls */}
            {groupConfig && groupConfig.fields.length > 0 && (
              <>
                <Separator />
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">
                    GROUP CONTROLS
                  </Label>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleExpandAllGroups}
                      className="flex-1 h-7 text-xs"
                    >
                      Expand All
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCollapseAllGroups}
                      className="flex-1 h-7 text-xs"
                    >
                      Collapse All
                    </Button>
                  </div>
                </div>
              </>
            )}

            {/* Aggregations Section */}
            {groupConfig && groupConfig.fields.length > 0 && (
              <>
                <Separator />
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium text-muted-foreground">
                      AGGREGATIONS
                    </Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowAggregations(!showAggregations)}
                      className="h-6 text-xs"
                    >
                      {showAggregations ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </Button>
                  </div>

                  <Collapsible open={showAggregations} onOpenChange={setShowAggregations}>
                    <CollapsibleContent className="space-y-2">
                      {/* Current Aggregations */}
                      {groupConfig.aggregations && groupConfig.aggregations.length > 0 && (
                        <div className="space-y-1">
                          {groupConfig.aggregations.map((agg, index) => (
                            <div
                              key={`${agg.field}-${index}`}
                              className="flex items-center gap-2 p-2 rounded-md border bg-muted/20"
                            >
                              <div className="flex-1 min-w-0">
                                <div className="text-sm truncate">{agg.label}</div>
                                <div className="text-xs text-muted-foreground truncate">
                                  {(agg.type || agg.function || 'unknown').toUpperCase()} •{' '}
                                  {agg.field}
                                </div>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleRemoveAggregation(agg.field)}
                                className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                              >
                                <X size={12} />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Add Aggregation */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm" className="w-full h-7 text-xs">
                            <Plus size={12} className="mr-1" />
                            Add aggregation...
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-56">
                          {aggregatableColumns
                            .filter(
                              (col) =>
                                !groupConfig.aggregations.some(
                                  (agg) => agg.field === (col.field || col.id),
                                ),
                            )
                            .map((column) => (
                              <div key={column.id}>
                                <DropdownMenuItem disabled className="font-medium">
                                  {column.name}
                                </DropdownMenuItem>
                                {['count', 'sum', 'avg', 'min', 'max', 'unique']
                                  .filter((type) => {
                                    const isNumeric = [
                                      'number',
                                      'decimal',
                                      'currency',
                                      'percentage',
                                    ].includes(column.type || 'text')
                                    return type === 'count' || type === 'unique' || isNumeric
                                  })
                                  .map((type) => (
                                    <DropdownMenuItem
                                      key={type}
                                      onClick={() => handleAddAggregation(column.id, type)}
                                      className="pl-6"
                                    >
                                      {type.toUpperCase()}
                                    </DropdownMenuItem>
                                  ))}
                                <DropdownMenuSeparator />
                              </div>
                            ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </CollapsibleContent>
                  </Collapsible>
                </div>
              </>
            )}

            {/* Empty State */}
            {(!groupConfig || groupConfig.fields.length === 0) && (
              <div className="text-center py-6">
                <div className="text-muted-foreground text-sm mb-2">No grouping active</div>
                <div className="text-xs text-muted-foreground">
                  Select a field above to start grouping your data
                </div>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  )
}
