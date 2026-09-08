/**
 * Browser console API (__BASEPLANE_LOGGER__)
 */
import { configure, getConsoleSink, type LogLevel } from '@logtape/logtape'
import { loadPersistedConfig, saveConfig } from './persistence'

export interface ConsoleAPI {
  setLevel(level: LogLevel, category?: string[]): void
  getConfig(): any
  clearOverrides(): void
  removeOverride(category: string[]): void
}

/**
 * Create console API for runtime configuration
 */
export function createConsoleAPI(): ConsoleAPI {
  // Track user overrides (cap at 15 to prevent unbounded growth)
  const MAX_OVERRIDES = 15
  let userOverrides: { category: string[]; level: LogLevel }[] = []

  // Load existing overrides from localStorage
  const persisted = loadPersistedConfig()
  if (persisted && persisted.overrides) {
    userOverrides = persisted.overrides.slice(0, MAX_OVERRIDES)
  }

  /**
   * Get baseline loggers (fixed configuration)
   */
  function getBaselineLoggers() {
    // Baseline must match the one in config.ts (and persistence.ts) so
    // setLevel rebuilds against the same starting point. Production host
    // (app.baseplane.ai) defaults to 'warning'; everything else gets 'info'
    // plus per-category info promotions for diagnostic trees.
    const isProdHost =
      typeof window !== 'undefined' && window.location?.hostname === 'app.baseplane.ai'
    const baseLevel: LogLevel =
      (import.meta.env?.VITE_LOG_LEVEL as LogLevel) || (isProdHost ? 'warning' : 'info')

    return [
      {
        category: ['logtape', 'meta'],
        lowestLevel: 'warning' as LogLevel,
        sinks: ['console'],
      },
      { category: [], lowestLevel: baseLevel, sinks: ['console'] },
      ...(isProdHost
        ? []
        : [
            { category: ['stores'], lowestLevel: 'info' as LogLevel, sinks: ['console'] },
            { category: ['vibegrid'], lowestLevel: 'info' as LogLevel, sinks: ['console'] },
            { category: ['substrate'], lowestLevel: 'info' as LogLevel, sinks: ['console'] },
            { category: ['data'], lowestLevel: 'info' as LogLevel, sinks: ['console'] },
          ]),
    ]
  }

  /**
   * Rebuild configuration from baseline + user overrides
   */
  function rebuildConfig() {
    const baseline = getBaselineLoggers()

    // Deduplicate: user overrides replace baseline for same category
    const baselineMap = new Map(baseline.map((logger) => [JSON.stringify(logger.category), logger]))

    // Apply user overrides (replace baseline entries)
    for (const override of userOverrides) {
      baselineMap.set(JSON.stringify(override.category), {
        category: override.category,
        lowestLevel: override.level,
        sinks: ['console'],
      })
    }

    // Convert back to array
    const dedupedLoggers = Array.from(baselineMap.values())

    configure({
      reset: true, // Always reset first
      sinks: { console: getConsoleSink() },
      loggers: dedupedLoggers,
    })

    // Log active config for transparency
    console.log('📋 Active log configuration:', {
      baseline: baseline.length,
      overrides: userOverrides.length,
      deduped: dedupedLoggers.length,
    })
  }

  return {
    setLevel(level: LogLevel, category?: string[]) {
      const cat = category || []

      // Add or update override (replace on duplicate)
      const existingIndex = userOverrides.findIndex((o) => JSON.stringify(o.category) === JSON.stringify(cat))

      if (existingIndex >= 0) {
        userOverrides[existingIndex].level = level
      } else {
        // Check cap before adding
        if (userOverrides.length >= MAX_OVERRIDES) {
          console.warn(`⚠️  Override limit reached (${MAX_OVERRIDES}). Removing oldest override.`)
          userOverrides.shift() // FIFO eviction
        }
        userOverrides.push({ category: cat, level })
      }

      // Rebuild from baseline + overrides
      rebuildConfig()

      // Persist only the override map
      saveConfig(userOverrides)

      console.log(`✅ Log level set: ${cat.join('/') || 'global'} = ${level}`)
    },

    getConfig() {
      return {
        overrides: userOverrides,
        storage: typeof window !== 'undefined' ? localStorage.getItem('baseplane_log_config') : null,
      }
    },

    clearOverrides() {
      userOverrides = []
      if (typeof window !== 'undefined') {
        localStorage.removeItem('baseplane_log_config')
      }

      // Rebuild with just baseline (no overrides)
      rebuildConfig()

      console.log('✅ Log configuration reset to baseline')
    },

    removeOverride(category: string[]) {
      userOverrides = userOverrides.filter((o) => JSON.stringify(o.category) !== JSON.stringify(category))

      // Persist updated overrides
      saveConfig(userOverrides)

      // Rebuild with baseline + remaining overrides
      rebuildConfig()

      console.log(`✅ Removed override for: ${category.join('/')}`)
    },
  }
}
