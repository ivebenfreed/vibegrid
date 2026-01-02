/**
 * File cell renderer
 */

import type { Column } from '../../column-types'

export function file(value: any, column: Column): string {
  if (value === null || value === undefined) {
    return ''
  }

  // Handle JSONB file format: {url: string, size?: number, type?: string, metadata?: object}
  if (typeof value === 'object' && value.url) {
    const { url, size, type } = value

    // Extract filename from URL
    const filename = url.split('/').pop() || 'file'

    // Show filename with size if available
    if (size) {
      const sizeInKB = Math.round(size / 1024)
      return `${filename} (${sizeInKB}KB)`
    }

    return filename
  }

  // Handle simple URL strings
  if (typeof value === 'string' && value.startsWith('http')) {
    const filename = value.split('/').pop() || 'file'
    return filename
  }

  return String(value)
}
