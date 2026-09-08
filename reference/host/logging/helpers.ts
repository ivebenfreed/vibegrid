/**
 * Helper utilities for LogTape logger
 */
import { getLogger as getLogTapeLogger } from '@logtape/logtape'

/**
 * Convert string namespace to LogTape category array
 * @example 'stores/experience/AuthStore' → ['stores', 'experience', 'AuthStore']
 */
export function namespaceToCategory(namespace: string): string[] {
  // Remove common prefixes
  const cleaned = namespace
    .replace(/^src\//, '')
    .replace(/^components\//, '')
    .replace(/^systems\//, '')
    .replace(/^shared\//, '')
    .replace(/^features\//, '')
    .replace(/^app\//, '')

  return cleaned.split('/').filter(Boolean)
}

/**
 * Get logger with category array
 * @example getLogger(['stores', 'experience', 'AuthStore'])
 */
export function getLogger(category: string[]) {
  return getLogTapeLogger(category)
}
