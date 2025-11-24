import type { Column } from '../types'

/**
 * Fast date rendering function for table cells
 * Formats dates as:
 * - Current year: "May, 3"
 * - Previous years: "07/29/23"
 */
export function date(value: any, column: Column): string {
  if (value === null || value === undefined) return ''

  try {
    const date = value instanceof Date ? value : new Date(value)
    const now = new Date()
    const currentYear = now.getFullYear()
    const dateYear = date.getFullYear()

    if (dateYear === currentYear) {
      // Format as "May, 3" for current year
      const month = date.toLocaleDateString('en-US', { month: 'long' })
      const day = date.getDate()
      return `${month}, ${day}`
    } else {
      // Format as "07/29/23" for previous years
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      const year = String(dateYear).slice(-2)
      return `${month}/${day}/${year}`
    }
  } catch {
    return String(value)
  }
}
