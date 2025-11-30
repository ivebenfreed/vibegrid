import { format, getHours, getMinutes, parseISO, set } from 'date-fns'
import { CalendarIcon, ClockIcon } from 'lucide-react'
import React from 'react'
import { Button } from '@/shared/components/ui/button'
import { Calendar } from '@/shared/components/ui/calendar'
import { Input } from '@/shared/components/ui/input'
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
  const [_isCalendarOpen, setIsCalendarOpen] = React.useState(true) // Open by default
  const [selectedTime, setSelectedTime] = React.useState({ hours: 12, minutes: 0 })
  const [showTimePicker, setShowTimePicker] = React.useState(false)

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

  // Initialize time from existing value
  React.useEffect(() => {
    if (initialValue && includeTime) {
      const parsedDate = parseDate(initialValue)
      if (parsedDate) {
        setSelectedTime({
          hours: getHours(parsedDate),
          minutes: getMinutes(parsedDate),
        })
      }
    }
  }, [initialValue, includeTime, parseDate])

  const formatDate = (date: Date | null): string => {
    if (!date) return ''
    if (includeTime) {
      return format(date, "yyyy-MM-dd'T'HH:mm:ss")
    }
    return format(date, 'yyyy-MM-dd')
  }

  const _handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'Enter':
        e.preventDefault()
        onCommit(value || null)
        break
      case 'Escape':
        e.preventDefault()
        e.stopPropagation() // Stop the event from reaching KeyboardNavigationController
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
      let finalDate: Date

      if (includeTime) {
        // Apply selected time to the date
        finalDate = set(date, {
          hours: selectedTime.hours,
          minutes: selectedTime.minutes,
          seconds: 0,
        })
        setShowTimePicker(true) // Show time picker after date selection
      } else {
        // For date-only, set time to noon to avoid timezone issues
        finalDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0)
        setIsCalendarOpen(false)
      }

      const formattedDate = formatDate(finalDate)
      setValue(formattedDate)

      // Only commit immediately for date-only fields
      if (!includeTime) {
        onCommit(formattedDate)
      }
    }
  }

  const handleTimeChange = (hours: number, minutes: number) => {
    setSelectedTime({ hours, minutes })

    // Update the current date with new time
    const currentDate = parseDate(value)
    if (currentDate) {
      const updatedDate = set(currentDate, { hours, minutes, seconds: 0 })
      const formattedDate = formatDate(updatedDate)
      setValue(formattedDate)
    }
  }

  const commitDateTime = () => {
    onCommit(value || null)
  }

  const currentDate = parseDate(value)

  if (includeTime) {
    // Enhanced datetime editor with calendar and time picker
    return (
      <div
        className="p-3 bg-background border rounded-lg shadow-lg"
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            handleBlur()
          }
        }}
        tabIndex={-1}
      >
        {!showTimePicker ? (
          // Date selection phase
          <>
            <div className="flex items-center gap-2 mb-3 text-sm font-medium">
              <CalendarIcon className="h-4 w-4" />
              Select Date
            </div>
            <Calendar
              mode="single"
              selected={currentDate || undefined}
              onSelect={handleDateSelect}
              initialFocus
              className="rounded-md"
            />
          </>
        ) : (
          // Time selection phase
          <>
            <div className="flex items-center gap-2 mb-3 text-sm font-medium">
              <ClockIcon className="h-4 w-4" />
              Select Time
              <span className="text-muted-foreground">
                ({currentDate ? format(currentDate, 'MMM dd, yyyy') : ''})
              </span>
            </div>
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="time-input"
                  className="text-xs font-medium text-muted-foreground block mb-2"
                >
                  Time
                </label>
                <Input
                  id="time-input"
                  type="time"
                  value={`${String(selectedTime.hours).padStart(2, '0')}:${String(selectedTime.minutes).padStart(2, '0')}`}
                  onChange={(e) => {
                    const [hours, minutes] = e.target.value.split(':').map(Number)
                    handleTimeChange(hours || 0, minutes || 0)
                  }}
                  className="w-full text-lg"
                />
              </div>
              <div className="text-center text-sm text-muted-foreground">
                Preview: {currentDate ? format(currentDate, "MMM dd, yyyy 'at' HH:mm") : ''}
              </div>
            </div>
          </>
        )}

        <div className="flex gap-2 mt-4">
          {showTimePicker && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowTimePicker(false)}
              className="flex-1"
            >
              ← Back
            </Button>
          )}
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
          {showTimePicker ? (
            <Button size="sm" onClick={commitDateTime} className="flex-1">
              Done
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={onCancel} className="flex-1">
              Cancel
            </Button>
          )}
        </div>
      </div>
    )
  }

  // For date only, show calendar directly
  return (
    <div
      className="p-2 bg-background border rounded-md shadow-lg"
      onBlur={(e) => {
        // Only commit if the blur event is not going to another element within this container
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          handleBlur()
        }
      }}
      tabIndex={-1}
    >
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
