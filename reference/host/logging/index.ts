/**
 * Baseplane logging system (powered by LogTape)
 *
 * Usage:
 *   import { getLogger } from '@/shared/lib/logging'
 *   const logger = getLogger(['stores', 'experience', 'AuthStore'])
 *   logger.debug`Debug message ${data}`
 *   logger.info`Info message`
 *   logger.warn('Warning', data)
 *   logger.error('Error', error)
 *
 * Runtime configuration (browser console):
 *   __BASEPLANE_LOGGER__.setLevel('debug', ['stores'])
 *   __BASEPLANE_LOGGER__.setLevel('off', ['vibegrid'])
 *   __BASEPLANE_LOGGER__.getConfig()
 *   __BASEPLANE_LOGGER__.clearOverrides()
 */

import { applyPersistedConfig } from './persistence'
import { configureDefaultLogging } from './config'
import { createConsoleAPI } from './console-api'

// Configure defaults
configureDefaultLogging()

// Load persisted config (browser only)
if (typeof window !== 'undefined') {
  applyPersistedConfig()

  // Expose console API
  ;(window as any).__BASEPLANE_LOGGER__ = createConsoleAPI()
}

// Re-export helpers and types
export { namespaceToCategory } from './helpers'
export type { Logger, LogLevel } from '@logtape/logtape'

// Lazy getLogger wrapper — Rolldown's chunk splitting can create circular
// dependencies between chunks. When chunk A imports getLogger from chunk B,
// but chunk B also imports from chunk A, chunk A evaluates first. Module-scope
// calls like `const logger = getLogger([...])` then fail because LogTape's
// Logger class is hoisted but not yet initialized (var hoisting = undefined).
//
// This wrapper returns a Proxy that defers the actual LogTape getLogger call
// until the first method is invoked (e.g., logger.info()), by which time all
// modules are fully initialized.
import { getLogger as _getLogger, type Logger } from '@logtape/logtape'

export function getLogger(category?: string | readonly string[]): Logger {
  let logger: Logger | undefined
  return new Proxy({} as Logger, {
    get(_, prop) {
      logger ??= _getLogger(category)
      return (logger as any)[prop]
    },
  })
}
