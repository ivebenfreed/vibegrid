/**
 * Email cell renderer
 */

import type { Column } from '../../column-types'

export function email(value: any, column: Column): string {
  if (value === null || value === undefined || value === '') {
    return ''
  }

  const email = String(value)

  // Basic email validation for display
  if (!email.includes('@') || !email.includes('.')) {
    return email // Show invalid emails as-is
  }

  return email
}
