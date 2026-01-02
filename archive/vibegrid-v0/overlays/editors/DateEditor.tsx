import { format, parseISO } from 'date-fns'
import { CalendarIcon } from 'lucide-react'
import React from 'react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { CellRef, Column } from '../../types'

interface DateEditorProps {
  cell: CellRef
  column: Column
  initialValue: string | null
  onCommit: (value: string | null) => void
  onCancel: () => void
  includeTime?: boolean
}

export function DateEditor({
  cell,
  column,
  initialValue,
  onCommit,
  onCancel,
  includeTime = false,
}: DateEditorProps) {
  const [value, setValue] = React.useState(initialValue || '')
  const [isCalendarOpen, setIsCalendarOpen] = React.useState(true) // Open by default

  const parseDate = (dateString: string): Date | null => {
    if (!dateString) return null
    try {
      // For date-only strings (YYYY-MM-DD), parse as local date
      if (dateString.length === 10 && dateString.match(/^\d{4}-\d{2}-\d{2}$/)) {
        const [year, month, day] = dateString.split('-').map(Number)
        return new Date(year, month - 1, day, 12, 0, 0)
      }
      // For datetime strings, use parseISO
      return parseISO(dateString)
    } catch {
      return null
    }
  }

  const formatDate = (date: Date | null): string => {
    if (!date) return ''
    if (includeTime) {
      return format(date, "yyyy-MM-dd'T'HH:mm:ss")
    }
    return format(date, 'yyyy-MM-dd')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'Enter':
        e.preventDefault()
        onCommit(value || null)
        break
      case 'Escape':
        e.preventDefault()
        onCancel()
        break
      case 'Tab':
        e.preventDefault()
        onCommit(value || null)
        break
    }
  }

  const handleBlur = () => {
    onCommit(value || null)
  }

  const handleDateSelect = (date: Date | undefined) => {
    if (date) {
      // Ensure we use the date in local timezone, not UTC
      // Set time to noon to avoid timezone issues
      const localDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0)
      const formattedDate = formatDate(localDate)
      setValue(formattedDate)
      setIsCalendarOpen(false)
      onCommit(formattedDate)
    }
  }

  const currentDate = parseDate(value)

  if (includeTime) {
    // For datetime, use a simple input
    return (
      <Input
        type="datetime-local"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        autoFocus
        className="border-2 border-blue-500 shadow-lg"
      />
    )
  }

  // For date only, show calendar directly
  return (
    <div className="p-2 bg-background border rounded-md shadow-lg">
      <Calendar
        mode="single"
        selected={currentDate || undefined}
        onSelect={handleDateSelect}
        initialFocus
        className="rounded-md"
      />
      <div className="flex gap-2 mt-2 px-3 pb-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setValue('')
            onCommit(null)
          }}
          className="flex-1"
        >
          Clear
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel} className="flex-1">
          Cancel
        </Button>
      </div>
    </div>
  )
}
