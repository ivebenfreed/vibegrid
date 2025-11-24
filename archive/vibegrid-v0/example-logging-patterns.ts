/**
 * EXAMPLE LOGGING PATTERNS
 *
 * This file demonstrates different ways to use the simple logger
 * with global settings and file-level overrides.
 */

import { createLogger, type LogLevel } from '@/logger/simple-logger'

// ============================================
// PATTERN 1: Always use global setting
// ============================================
const globalLogger = createLogger('ExampleGlobal')
// This logger will use whatever VITE_LOG_LEVEL is set to

// ============================================
// PATTERN 2: Always override (ignore global)
// ============================================
const ALWAYS_DEBUG: LogLevel = 'debug'
const debugLogger = createLogger('ExampleDebug', ALWAYS_DEBUG)
// This logger will ALWAYS be at debug level, regardless of global

// ============================================
// PATTERN 3: Conditional override (recommended)
// ============================================
const OVERRIDE_LEVEL: LogLevel | undefined = undefined // Change to 'debug' when debugging
const conditionalLogger = createLogger('ExampleConditional', OVERRIDE_LEVEL)
// When undefined: uses global setting
// When set to a level: overrides global

// ============================================
// PATTERN 4: Silence a noisy component
// ============================================
const SILENCE_NOISY: LogLevel = 'off'
const silencedLogger = createLogger('NoisyComponent', SILENCE_NOISY)
// This logger is always off, even if global is 'debug'

// ============================================
// PATTERN 5: Environment-based override
// ============================================
const ENV_OVERRIDE: LogLevel | undefined =
  process.env.NODE_ENV === 'development' ? 'debug' : undefined
const envLogger = createLogger('ExampleEnv', ENV_OVERRIDE)
// Debug in development, use global in production

export function demonstrateLogging() {
  // These will respect their configured levels
  globalLogger.debug('Only shows if global is debug or lower')
  debugLogger.debug('Always shows (forced debug)')
  conditionalLogger.debug('Depends on OVERRIDE_LEVEL setting')
  silencedLogger.debug('Never shows (forced off)')
  envLogger.debug('Shows in development')

  // Errors typically show unless explicitly silenced
  globalLogger.error('Errors usually show')
  silencedLogger.error('Even errors are silenced here')
}

/**
 * USAGE GUIDELINES:
 *
 * 1. For most files: Use Pattern 1 (respect global)
 *    const log = createLogger('ComponentName');
 *
 * 2. For debugging specific issues: Use Pattern 3
 *    const LOG_LEVEL: LogLevel | undefined = 'debug'; // Toggle this
 *    const log = createLogger('ComponentName', LOG_LEVEL);
 *
 * 3. For critical components: Use Pattern 2
 *    const LOG_LEVEL: LogLevel = 'info'; // Always show important info
 *    const log = createLogger('CriticalComponent', LOG_LEVEL);
 *
 * 4. For noisy libraries: Use Pattern 4
 *    const LOG_LEVEL: LogLevel = 'off';
 *    const log = createLogger('NoisyLibrary', LOG_LEVEL);
 */
