/**
 * GanttToolbar - Zoom and navigation controls for Gantt timeline
 */

import { observer } from 'mobx-react-lite'
import { Minus, Plus, RotateCcw, Calendar } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select'
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
  const { zoomLevel, dependencies } = ganttViewStore

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

      {/* Dependency count */}
      {dependencies.length > 0 && (
        <>
          <div className="w-px h-6 bg-border" />
          <span className="text-xs text-muted-foreground">
            {dependencies.length} dependencies
          </span>
        </>
      )}
    </div>
  )
})
