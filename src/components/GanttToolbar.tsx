/**
 * GanttToolbar - Zoom and navigation controls for Gantt timeline
 */

import { observer } from 'mobx-react-lite'
import { Minus, Plus, RotateCcw, Calendar, Settings2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/shared/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/components/ui/popover'
import { Label } from '@/shared/components/ui/label'
import { useGanttViewStore } from '../stores/context'
import type { ZoomLevel } from '../stores/GanttViewStore'

const ZOOM_LEVELS: { value: ZoomLevel; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'quarter', label: 'Quarter' },
]

export const GanttToolbar = observer(function GanttToolbar() {
  const ganttViewStore = useGanttViewStore()
  const { zoomLevel, dependencies, fieldMapping, availableDateFields, availableLabelFields } =
    ganttViewStore

  const [settingsOpen, setSettingsOpen] = useState(false)

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/30">
      {/* Zoom controls */}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => ganttViewStore.zoomOut()}
          disabled={zoomLevel === 'quarter'}
          title="Zoom out"
        >
          <Minus className="h-4 w-4" />
        </Button>

        <Select
          value={zoomLevel}
          onValueChange={(value) => ganttViewStore.setZoomLevel(value as ZoomLevel)}
        >
          <SelectTrigger className="w-24 h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ZOOM_LEVELS.map((level) => (
              <SelectItem key={level.value} value={level.value}>
                {level.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => ganttViewStore.zoomIn()}
          disabled={zoomLevel === 'day'}
          title="Zoom in"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Divider */}
      <div className="w-px h-6 bg-border" />

      {/* Today button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => ganttViewStore.scrollToToday()}
        title="Scroll to today"
      >
        <Calendar className="h-4 w-4 mr-1" />
        Today
      </Button>

      {/* Reset zoom */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => ganttViewStore.setZoomLevel('week')}
        title="Reset to week view"
      >
        <RotateCcw className="h-4 w-4" />
      </Button>

      {/* Divider */}
      <div className="w-px h-6 bg-border" />

      {/* Field mapping settings */}
      <Popover open={settingsOpen} onOpenChange={setSettingsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            title="Configure date fields"
            className={settingsOpen ? 'bg-accent' : ''}
          >
            <Settings2 className="h-4 w-4 mr-1" />
            Fields
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72" align="start">
          <div className="grid gap-4">
            <div className="space-y-2">
              <h4 className="font-medium text-sm">Date Field Mapping</h4>
              <p className="text-xs text-muted-foreground">
                Select which fields to use for Gantt bar positioning
              </p>
            </div>

            {/* Start Date Field */}
            <div className="grid gap-2">
              <Label htmlFor="start-field" className="text-xs">
                Start Date
              </Label>
              <Select
                value={fieldMapping.startField}
                onValueChange={(value) => ganttViewStore.setFieldMapping({ startField: value })}
              >
                <SelectTrigger id="start-field" className="h-8">
                  <SelectValue placeholder="Select field" />
                </SelectTrigger>
                <SelectContent>
                  {availableDateFields.length > 0 ? (
                    availableDateFields.map((field) => (
                      <SelectItem key={field.id} value={field.id}>
                        {field.name}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value={fieldMapping.startField} disabled>
                      No date fields found
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* End Date Field */}
            <div className="grid gap-2">
              <Label htmlFor="end-field" className="text-xs">
                End Date
              </Label>
              <Select
                value={fieldMapping.endField}
                onValueChange={(value) => ganttViewStore.setFieldMapping({ endField: value })}
              >
                <SelectTrigger id="end-field" className="h-8">
                  <SelectValue placeholder="Select field" />
                </SelectTrigger>
                <SelectContent>
                  {availableDateFields.length > 0 ? (
                    availableDateFields.map((field) => (
                      <SelectItem key={field.id} value={field.id}>
                        {field.name}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value={fieldMapping.endField} disabled>
                      No date fields found
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Label Field */}
            <div className="grid gap-2">
              <Label htmlFor="label-field" className="text-xs">
                Bar Label
              </Label>
              <Select
                value={fieldMapping.labelField}
                onValueChange={(value) => ganttViewStore.setFieldMapping({ labelField: value })}
              >
                <SelectTrigger id="label-field" className="h-8">
                  <SelectValue placeholder="Select field" />
                </SelectTrigger>
                <SelectContent>
                  {availableLabelFields.length > 0 ? (
                    availableLabelFields.map((field) => (
                      <SelectItem key={field.id} value={field.id}>
                        {field.name}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value={fieldMapping.labelField} disabled>
                      No text fields found
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {/* Dependency count */}
      {dependencies.length > 0 && (
        <>
          <div className="w-px h-6 bg-border" />
          <span className="text-xs text-muted-foreground">{dependencies.length} dependencies</span>
        </>
      )}
    </div>
  )
})
