/**
 * GanttEmptyState - Instructional nudge when entity has no date fields (GH#2139)
 *
 * Shown inside the Gantt view when the entity schema has no date/datetime fields.
 * Explains what's needed and optionally links to the schema editor.
 */

import { CalendarDays } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'

interface GanttEmptyStateProps {
  entityType: string
  canEditSchema?: boolean
  schemaEditorHref?: string
}

export function GanttEmptyState({ entityType, canEditSchema, schemaEditorHref }: GanttEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[300px] gap-4 p-8 text-center">
      <CalendarDays className="size-12 text-muted-foreground/50" aria-hidden="true" />
      <div className="space-y-2">
        <h3 className="text-lg font-medium text-foreground">Timeline view requires date fields</h3>
        <p className="text-sm text-muted-foreground max-w-md">
          Add <code className="text-xs bg-muted px-1 py-0.5 rounded">start_date</code> and{' '}
          <code className="text-xs bg-muted px-1 py-0.5 rounded">end_date</code> fields to your {entityType} schema to
          see records plotted on a timeline.
        </p>
      </div>
      {canEditSchema && schemaEditorHref && (
        <a href={schemaEditorHref} className="inline-flex items-center">
          <Button variant="outline" size="sm">
            Open Schema Editor
          </Button>
        </a>
      )}
    </div>
  )
}
