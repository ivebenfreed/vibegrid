/**
 * Phone cell renderer
 */

import type { Column } from '../../column-types'

export function phone(value: any, column: Column): string {
  if (value === null || value === undefined || value === '') {
    return ''
  }

  const phone = String(value)

  // Format phone number for display
  // Remove all non-digits
  const digits = phone.replace(/\D/g, '')

  // Format US phone numbers (10 digits)
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
  }

  // Format US phone numbers with country code (11 digits starting with 1)
  if (digits.length === 11 && digits[0] === '1') {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`
  }

  // Return as-is for international or non-standard formats
  return phone
}
