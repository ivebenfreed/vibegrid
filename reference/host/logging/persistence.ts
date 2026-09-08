/**
 * LocalStorage persistence for log configuration
 */
import { configure, getConsoleSink, type LogLevel } from '@logtape/logtape'

const STORAGE_KEY = 'baseplane_log_config'

export interface StoredLogConfig {
  overrides: { category: string[]; level: LogLevel }[]
}

/**
 * Load persisted configuration from localStorage
 */
export function loadPersistedConfig(): StoredLogConfig | null {
  if (typeof window === 'undefined') return null

  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return null

    const parsed: StoredLogConfig = JSON.parse(stored)
    return parsed
  } catch (_error) {
    return null
  }
}

/**
 * Save configuration to localStorage
 */
export function saveConfig(overrides: { category: string[]; level: LogLevel }[]) {
  if (typeof window === 'undefined') return

  try {
    const config: StoredLogConfig = { overrides }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
  } catch (error) {
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      localStorage.removeItem(STORAGE_KEY)
    } else {
    }
  }
}

/**
 * Apply persisted configuration
 */
export function applyPersistedConfig() {
  const persisted = loadPersistedConfig()
  if (!persisted || !persisted.overrides || persisted.overrides.length === 0) return

  // Baseline must match the one in config.ts so user overrides rebuild
  // against the same starting point. Production host (app.baseplane.ai)
  // is the only one that defaults to 'warning'; everything else (localhost,
  // *.dev.baseplane.ai, preview slots) gets 'info' plus per-category info
  // promotions for the noisy diagnostic trees.
  const isProdHost =
    typeof window !== 'undefined' && window.location?.hostname === 'app.baseplane.ai'
  const baseLevel: LogLevel =
    (import.meta.env?.VITE_LOG_LEVEL as LogLevel) || (isProdHost ? 'warning' : 'info')
  const baseline = [
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

  // Deduplicate: user overrides replace baseline for same category
  const baselineMap = new Map(baseline.map((logger) => [JSON.stringify(logger.category), logger]))

  // Apply user overrides (replace baseline entries)
  for (const override of persisted.overrides) {
    baselineMap.set(JSON.stringify(override.category), {
      category: override.category,
      lowestLevel: override.level,
      sinks: ['console'],
    })
  }

  // Convert back to array
  const dedupedLoggers = Array.from(baselineMap.values())

  configure({
    reset: true,
    sinks: { console: getConsoleSink() },
    loggers: dedupedLoggers,
  })
}
