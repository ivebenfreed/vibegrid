/**
 * GanttFilters - Quick filter buttons and date range picker for Gantt view
 */

import { observer } from 'mobx-react-lite'
import { List, CalendarDays, AlertCircle, Calendar, GitBranch, CalendarRange, X } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/components/ui/popover'
import { Calendar as CalendarPicker } from '@/shared/components/ui/calendar'
import { cn } from '@/shared/lib/utils'
import { useGanttViewStore } from '../stores/context'
import type { GanttQuickFilter } from '../stores/GanttViewStore'

const QUICK_FILTERS: Array<{
  id: GanttQuickFilter
  label: string
  icon: typeof List
}> = [
  { id: 'all', label: 'All', icon: List },
  { id: 'today', label: "Today's Tasks", icon: CalendarDays },
  { id: 'overdue', label: 'Overdue', icon: AlertCircle },
  { id: 'this_week', label: 'This Week', icon: Calendar },
  { id: 'has_dependencies', label: 'Has Dependencies', icon: GitBranch },
]

interface GanttFiltersProps {
  className?: string
}

function formatDate(date: Date | null): string {
  if (!date) return ''
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

export const GanttFilters = observer(function GanttFilters({ className }: GanttFiltersProps) {
  const ganttViewStore = useGanttViewStore()
  const { activeQuickFilter, dateRangeFilter } = ganttViewStore

  const hasActiveFilters = activeQuickFilter !== 'all' || dateRangeFilter.start || dateRangeFilter.end

  const dateRangeLabel =
    dateRangeFilter.start || dateRangeFilter.end
      ? `${formatDate(dateRangeFilter.start) || 'Start'} - ${formatDate(dateRangeFilter.end) || 'End'}`
      : 'Date Range'

  return (
    <div className={cn('flex items-center gap-2 px-3 py-1.5 border-b bg-muted/20', className)}>
      {/* Quick filter buttons */}
      <div className="flex items-center gap-1">
        {QUICK_FILTERS.map((filter) => {
          const Icon = filter.icon
          return (
            <Button
              key={filter.id}
              variant={activeQuickFilter === filter.id ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => ganttViewStore.setQuickFilter(filter.id)}
              className="h-7 text-xs"
            >
              <Icon className="h-3 w-3 mr-1" />
              {filter.label}
            </Button>
          )
        })}
      </div>

      <div className="w-px h-5 bg-border" />

      {/* Date range picker */}
      <Popover>
        <PopoverTrigger
          render={
            <Button
              variant={dateRangeFilter.start || dateRangeFilter.end ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7"
            />
          }
        >
          <CalendarRange className="h-3 w-3 mr-1" />
          {dateRangeLabel}
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <CalendarPicker
            mode="range"
            selected={{
              from: dateRangeFilter.start ?? undefined,
              to: dateRangeFilter.end ?? undefined,
            }}
            onSelect={(range) => {
              ganttViewStore.setDateRangeFilter(range?.from ?? null, range?.to ?? null)
            }}
          />
        </PopoverContent>
      </Popover>

      {/* Clear filters */}
      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => ganttViewStore.clearFilters()}
          className="h-7 text-xs text-muted-foreground"
        >
          <X className="h-3 w-3 mr-1" />
          Clear
        </Button>
      )}
    </div>
  )
})
