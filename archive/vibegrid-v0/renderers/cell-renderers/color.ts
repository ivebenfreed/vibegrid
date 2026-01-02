/**
 * Color cell renderer
 */

import type { Column } from '../../column-types'

export function color(value: any, column: Column): string {
  if (value === null || value === undefined || value === '') {
    return ''
  }

  const colorValue = String(value)

  // Return color value with a visual indicator
  // The actual visual color swatch will be handled by CSS styling
  return colorValue
}
